import { Vector3, MathUtils } from 'three';

import { Renderer } from './Renderer.js';
import { Time } from './Time.js';
import { CameraRig } from './CameraRig.js';
import { frame } from './FrameUniforms.js';

import { Environment } from '../world/Environment.js';
import { Ground } from '../world/Ground.js';
import { DustMotes } from '../world/DustMotes.js';
import { ContactShadows } from '../world/ContactShadows.js';

import { AssetLoader } from '../loaders/AssetLoader.js';
import { getStoneTextures } from '../loaders/StoneTextures.js';
import { buildSerpentGeometry } from '../assets/SerpentGeometry.js';
import { SandboxCharacter } from '../sandbox/SandboxCharacter.js';
import { Locomotion } from '../sandbox/Locomotion.js';
import { AssetLoader as CharacterAssets } from '../vendor/linear-ext/loaders/AssetLoader.js';
import { settings as characterSettings } from '../vendor/linear-ext/config/settings.js';
import { VENDOR_PACKS, loadVendorRuntime } from '../sandbox/vendors.js';
import { DummyField } from '../combat/DummyField.js';

import { InputManager } from '../input/InputManager.js';
import { AimController } from '../input/AimController.js';

import { ParticleEngine } from '../particles/ParticleEngine.js';
import { LightPool } from '../effects/LightPool.js';
import { DecalSystem } from '../effects/GroundDecals.js';
import { BurstSystem } from '../effects/BurstSphere.js';
import { CameraShake } from '../effects/CameraShake.js';
import { ScreenFlash } from '../effects/ScreenFlash.js';

import { AbilityManager } from '../abilities/AbilityManager.js';
import { PostProcessing } from '../postprocessing/PostProcessing.js';

import { HUD, LoadingScreen } from '../ui/HUD.js';
import { Editor } from '../ui/Editor.js';

import { settings, ELEMENTS, ELEMENT_META } from '../config/settings.js';
import { NATIVE_GROUPS } from '../config/sandbox.js';

const HDR_URL = './hdri/spruit_sunrise.hdr';
const SERPENT_URL = './models/snake.glb';

/** Hand the page back for one frame, so the loading veil can repaint. */
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Poll `test` once a frame until it passes or `timeout` runs out.
 *
 * Resolves either way: everything this waits on during boot is an optimisation,
 * and a slow download must not be able to hold the loading screen up forever.
 */
async function waitFor(test, timeout) {
  const deadline = performance.now() + timeout;
  while (!test() && performance.now() < deadline) await nextFrame();
}

/**
 * Application root: owns every subsystem and the frame loop.
 *
 * The wiring is deliberately one-directional — App builds the systems, hands the
 * ability manager a context object of the shared services, and then does nothing
 * but order the per-frame updates. No subsystem reaches back into App.
 *
 * The interaction is a single loop: select and arm an ability (Q / E), swing the
 * ground arrow with the mouse, click to fire. `AimController` owns the targeting
 * and emits one `cast` event; App turns that into an ability, a heading for the
 * character and a cooldown.
 *
 * ## The sandbox
 *
 * This is the one place every ability can be cast. Abilities are addressed by
 * `uid` — `<pack>/<id>`. The native ones (Collective Originals, Matrix New,
 * Ability Atlas) run on this engine's own pool. The 44 from the five source
 * repos run on their own engines, vendored verbatim under `src/vendor/` and
 * loaded on first use (`sandbox/vendors.js`), each sharing this scene, camera,
 * lights, character and dummies. Selecting an ability swaps in the aim
 * indicator of the engine it belongs to; everything else is common.
 */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = new Time();
    this.elapsed = 0;
    this.paused = false;
    this._raf = 0;

    /**
     * Seconds left before each ability can be armed again. Per element, so
     * spending one slot never locks the other out.
     */
    this.cooldowns = new Map();
    /** uid → native group pack, so a native id can be addressed by uid. */
    this.nativePack = new Map();
    for (const group of NATIVE_GROUPS) for (const id of group.ids) this.nativePack.set(id, group.pack);

    /* ---- core ---- */
    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(canvas);
    this.camera = this.rig.camera;

    this.environment = new Environment(this.renderer, this.camera);
    this.scene = this.environment.scene;

    /* ---- world ---- */
    this.ground = new Ground(this.environment);
    this.dust = new DustMotes();
    this.contactShadows = new ContactShadows(this.renderer, { size: 2.6, height: 2.4, blur: 2.0 });

    this.scene.add(this.ground.mesh, this.dust.points, this.contactShadows.group);
    this.dust.setPixelRatio(this.renderer.gl.getPixelRatio());

    /* ---- shared VFX services ---- */
    this.particles = new ParticleEngine(this.scene);
    this.lights = new LightPool(this.scene);
    this.decals = new DecalSystem(this.scene);
    this.bursts = new BurstSystem(this.scene);
    this.shake = new CameraShake(this.rig);
    this.flash = new ScreenFlash();

    /* ---- what the abilities are aimed at ---- */
    // Most abilities never hear about these: the field reads the casts instead
    // (`DummyField#applyHits`). The one exception is a cast that picks its own
    // targets, which needs to *ask* who is standing nearby — so the field is
    // built before the manager and handed over in its context.
    this.dummies = new DummyField(this.environment);
    this.scene.add(this.dummies.group);

    /**
     * Geometry that had to be loaded rather than generated, keyed by name.
     *
     * Handed to the abilities by reference and filled in by `load()`: the pools
     * build their instances lazily, on the first cast of an ability, which is
     * long after the assets have landed.
     */
    this.models = {};

    this.abilities = new AbilityManager({
      scene: this.scene,
      camera: this.camera,
      environment: this.environment,
      particles: this.particles,
      lights: this.lights,
      decals: this.decals,
      bursts: this.bursts,
      shake: this.shake,
      flash: this.flash,
      dummies: this.dummies,
      models: this.models
    });

    /* ---- character ---- */
    // The Linear Ext pack's controller (see SandboxCharacter). Its settings
    // block is the one the editor's Character folder edits.
    settings.character = characterSettings.character;
    this.character = new SandboxCharacter(this.environment);
    this.scene.add(this.character.root);
    this.abilities.ctx.character = this.character;

    /* ---- the five source engines, hosted on demand ---- */
    /** pack → runtime, once loaded. */
    this.runtimes = new Map();
    /** pack → in-flight load. */
    this._runtimeLoads = new Map();
    /** What is in the slot: { uid, pack, id, runtime|null }. */
    this.slot = null;

    /* ---- input & targeting ---- */
    this.input = new InputManager(canvas);
    this.aim = new AimController(this.camera);
    this.scene.add(this.aim.object3D);

    /* ---- moving the caster: WASD / arrows, Shift runs, Space dashes ---- */
    this.locomotion = new Locomotion({
      character: this.character,
      input: this.input,
      camera: this.camera,
      dummies: this.dummies,
      particles: this.particles,
      decals: this.decals,
      shake: this.shake
    });

    /* ---- post ---- */
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);

    /* ---- UI ---- */
    this.loading = new LoadingScreen();
    this.hud = new HUD(document.getElementById('hud'));
    this.editor = new Editor({
      onClear: () => this.clearEffects(),
      onToast: (message) => this.hud.showToast(message)
    });

    this._bindEvents();
    this.select(this.uidOf(ELEMENTS[0]), { silent: true, prepare: false });

    this._focusPoint = new Vector3();
  }

  /** The ability currently in the slot. */
  get element() {
    return this.abilities.selected;
  }

  /* ------------------------------------------------------------------ */

  _bindEvents() {
    this.renderer.onResize((width, height, pixelRatio) => {
      this.rig.resize(width, height);
      this.post.setSize(width, height, pixelRatio);
      this.dust.setPixelRatio(pixelRatio);
    });

    this.input.on('pointer:move', (pointer) => {
      this.aim.point(pointer);
      for (const runtime of this.runtimes.values()) runtime.aim.point(pointer);
    });
    this.input.on('pointer:confirm', (pointer) => {
      const runtime = this.slot?.runtime;
      if (runtime?.capturesPointer?.()) {
        runtime.pointerFire(true);
        return;
      }
      this.activeAim.point(pointer);
      this.activeAim.confirm();
    });
    window.addEventListener('pointerup', (event) => {
      if (event.button === 0) for (const runtime of this.runtimes.values()) runtime.pointerFire?.(false);
    });
    this.input.on('action', (action, slot) => this._handleAction(action, slot));

    this.aim.on('cast', (origin, direction, distance) => this._cast(origin, direction, distance));
    this.aim.on('reject', () => this.hud.showToast('Too close — aim further out'));
    this.aim.object3D.visible = true;

    this.hud.onAbility = (element) => this.armAbility(element);
  }

  _handleAction(action, slot) {
    switch (action) {
      case 'ability': {
        const element = ELEMENTS[slot];
        if (!element) break;
        const uid = this.uidOf(element);
        // Pressing the *same* key again puts an armed cast away, as it does in a
        // MOBA; pressing a different one swaps the slot without disarming.
        if (this.activeAim.isArmed && uid === this.slot?.uid) this.activeAim.cancel();
        else this.arm(uid);
        break;
      }
      case 'cancel':
        this.activeAim.cancel();
        break;
      case 'toggleHelp':
        this.hud.toggleHelp();
        break;
      case 'toggleEditor':
        this.editor.toggle();
        break;
      case 'clear':
        this.clearEffects();
        this.hud.showToast('Effects cleared');
        break;
      case 'resetDummies':
        this.dummies.reset();
        this.hud.showToast('Targets reset');
        break;
      case 'boost':
      case 'magic':
      case 'fire':
        this.runAction('linear-ext', action);
        break;
      case 'cycle': {
        // [ and ] walk the whole roster (native groups, then each hosted pack).
        // A pack whose engine is not loaded yet stands in as one entry; landing
        // on it loads the engine and takes its first (or, going back, last) ability.
        const all = ELEMENTS.map((id) => this.uidOf(id));
        for (const pack of Object.keys(VENDOR_PACKS)) {
          const runtime = this.runtimes.get(pack);
          if (runtime) for (const id of runtime.ids) all.push(`${pack}/${id}`);
          else all.push(`${pack}/*`);
        }
        const at = all.indexOf(this.slot?.uid);
        const next = all[(at + slot + all.length) % all.length];
        const pick = async () => {
          let uid = next;
          if (uid.endsWith('/*')) {
            const runtime = await this.loadRuntime(uid.slice(0, -2));
            const ids = runtime.ids;
            uid = `${runtime.pack}/${slot < 0 ? ids[ids.length - 1] : ids[0]}`;
          }
          await this.arm(uid);
          this.hud.showToast(`${uid} · ${this.describe(uid)?.label ?? ''}`, 2600);
        };
        pick().catch((error) => console.error(error));
        break;
      }
      case 'togglePause':
        this.paused = !this.paused;
        this.hud.setPaused(this.paused);
        this.hud.showToast(this.paused ? 'Paused — the editor still applies' : 'Resumed');
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Addressing                                                          */
  /* ------------------------------------------------------------------ */

  /** The uid of a native id ('tempest' → 'collective/tempest'). */
  uidOf(id) {
    return `${this.nativePack.get(id) ?? 'native'}/${id}`;
  }

  /** Split a uid; native packs resolve to no runtime. */
  parse(uid) {
    const cut = uid.indexOf('/');
    const pack = uid.slice(0, cut);
    const id = uid.slice(cut + 1);
    const native = this.nativePack.get(id) === pack;
    return { uid, pack, id, native };
  }

  /** The aim indicator of whatever is in the slot. */
  get activeAim() {
    return this.slot?.runtime?.aim ?? this.aim;
  }

  /** Native element in the slot, for code paths that predate the sandbox. */
  get element() {
    return this.abilities.selected;
  }

  /** Everything the hosted engines share with this one. */
  get _vendorHost() {
    return {
      scene: this.scene,
      camera: this.camera,
      environment: this.environment,
      lights: this.lights,
      shake: this.shake,
      flash: this.flash,
      dummies: this.dummies,
      character: this.character,
      frame,
      settings,
      input: this.input
    };
  }

  /** Load (once) the engine of a source pack. */
  loadRuntime(pack) {
    if (this.runtimes.has(pack)) return Promise.resolve(this.runtimes.get(pack));
    if (this._runtimeLoads.has(pack)) return this._runtimeLoads.get(pack);
    this.hud.showToast(`Loading the ${VENDOR_PACKS[pack]?.title ?? pack} engine…`, 4000);
    const job = loadVendorRuntime(pack, this._vendorHost).then((runtime) => {
      this.runtimes.set(pack, runtime);
      this._runtimeLoads.delete(pack);
      runtime.aim.on('cast', (origin, direction, distance) => this._castVendor(runtime, origin, direction, distance));
      runtime.aim.on('reject', () => this.hud.showToast('Too close — aim further out'));
      // Its own editor folders, the originals, under one heading.
      const folder = this.editor.gui.addFolder(`▸ ${VENDOR_PACKS[pack]?.title ?? pack}`);
      runtime.buildEditor(folder);
      folder.foldersRecursive().forEach((f) => f.close());
      folder.close();
      return runtime;
    });
    this._runtimeLoads.set(pack, job);
    return job;
  }

  /** Every uid currently castable (native + loaded engines). */
  get uids() {
    const out = ELEMENTS.map((id) => this.uidOf(id));
    for (const [pack, runtime] of this.runtimes) for (const id of runtime.ids) out.push(`${pack}/${id}`);
    return out;
  }

  /**
   * Put an ability in the slot. Loads its engine if it has to, builds one
   * instance and draws it once (so the first cast does not hitch), and swaps
   * in the right aim indicator.
   */
  async select(uid, options = {}) {
    const ref = this.parse(uid);
    const previous = this.activeAim;

    if (ref.native) {
      if (!ELEMENTS.includes(ref.id)) throw new Error(`Unknown ability ${uid}`);
      this.slot = { ...ref, runtime: null };
      this.abilities.select(ref.id);
      this.aim.setElement(ref.id);
      this.hud.setElement(ref.id, options);
      if (options.prepare !== false) this._prepare(() => this.abilities.prewarm(ref.id));
    } else {
      if (!VENDOR_PACKS[ref.pack]) throw new Error(`Unknown pack ${ref.pack}`);
      const runtime = await this.loadRuntime(ref.pack);
      if (!runtime.ids.includes(ref.id)) throw new Error(`Unknown ability ${uid}`);
      this.slot = { ...ref, runtime };
      runtime.select(ref.id);
      if (options.prepare !== false) this._prepare(() => runtime.prewarm(ref.id));
    }

    if (previous !== this.activeAim) {
      previous.cancel();
      previous.object3D.visible = false;
    }
    this.activeAim.object3D.visible = true;
    return this.describe(uid);
  }

  /** Presentation for a uid in the slot. */
  describe(uid = this.slot?.uid) {
    if (!uid) return null;
    const ref = this.parse(uid);
    if (ref.native) {
      const meta = ELEMENT_META[ref.id] ?? {};
      const block = settings[ref.id] ?? {};
      return { uid, pack: ref.pack, id: ref.id, label: meta.label, hint: meta.hint, cast: meta.cast, castAnim: block.castAnim, cooldown: block.cooldown };
    }
    const runtime = this.runtimes.get(ref.pack);
    return runtime ? { uid, pack: ref.pack, id: ref.id, ...runtime.meta(ref.id) } : { uid, pack: ref.pack, id: ref.id };
  }

  _prepare(build) {
    const ability = build();
    if (ability?.group) this._warmDraw([ability.group]);
  }

  /** Select an ability and arm it, unless it is still cooling down. */
  async arm(uid = this.slot?.uid) {
    if (!uid) return false;
    if (uid !== this.slot?.uid) await this.select(uid);
    if ((this.cooldowns.get(uid) ?? 0) > 0) {
      this.hud.showToast('Not ready');
      return false;
    }
    const runtime = this.slot.runtime;
    if (runtime?.isSummon(this.slot.id)) {
      const line = runtime.toggleSummon(this.slot.id, (id, seconds) => this.cooldowns.set(`${runtime.pack}/${id}`, Math.max(0, seconds)));
      if (line) this.hud.showToast(line, 3200);
      return true;
    }
    if (runtime?.summonOut?.()) {
      this.hud.showToast('Recall the summon first');
      return false;
    }
    this.activeAim.arm();
    return true;
  }

  /** Whether any hosted pack has a summon out (it owns WASD and Space then). */
  _summonOut() {
    for (const runtime of this.runtimes.values()) if (runtime.summonOut?.()) return true;
    return false;
  }

  /** Back-compat for the HUD and native key slots. */
  armAbility(element = this.element) {
    return this.arm(this.uidOf(element));
  }

  selectAbility(element, options) {
    return this.select(this.uidOf(element), options);
  }

  /** A pack's non-slot action (the Linear Ext buffs). */
  async runAction(pack, action) {
    const runtime = await this.loadRuntime(pack);
    const line = runtime.action?.(action);
    if (line) this.hud.showToast(line);
    return !!line;
  }

  _cast(origin, direction, distance) {
    const element = this.element;
    this.abilities.cast(origin, direction, distance, element);
    this.cooldowns.set(this.uidOf(element), Math.max(0, settings[element].cooldown));
    this._throwBody(this.aim.facing, settings[element].castAnim);
  }

  _castVendor(runtime, origin, direction, distance) {
    const id = this.slot?.runtime === runtime ? this.slot.id : null;
    if (!id) return;
    runtime.cast(id, origin, direction, distance);
    const block = runtime.settings[id] ?? {};
    this.cooldowns.set(`${runtime.pack}/${id}`, Math.max(0, block.cooldown ?? 0));
    this._throwBody(runtime.aim.facing, block.castAnim);
  }

  /** Snap onto the shot and throw the body into it, with the ability's own gesture. */
  _throwBody(facing, castAnim) {
    this.character.setFacing(facing);
    if (castAnim) this.character.playCast(castAnim);
    this.character.castLunge();
  }

  clearEffects() {
    this.aim.cancel();
    this.abilities.clear();
    for (const runtime of this.runtimes.values()) runtime.clear();
    this.particles.reset();
    this.decals.clear();
    this.bursts.clear();
    this.lights.reset();
    this.shake.reset();
    this.flash.reset();
  }

  /* ------------------------------------------------------------------ */

  /** Load assets, warm the shader cache, then start the loop. */
  async load() {
    const assets = new AssetLoader();

    this.loading.setProgress(0.05, 'Loading environment…');
    const hdr = await assets.loadHDR(HDR_URL);
    await this.environment.loadEnvironment(hdr);
    frame.uEnvMap.value = this.environment.equirect;

    this.loading.setProgress(0.35, 'Loading floor…');
    await this.ground.loadTextures(assets);

    this.loading.setProgress(0.5, 'Loading character…');
    await this.character.load(new CharacterAssets());

    this.loading.setProgress(0.72, 'Loading targets…');
    await this.dummies.load(assets);

    await this._precompile(0.85, 0.99);

    this.loading.setProgress(1, 'Ready');
    this.loading.hide();
    this.hud.reveal();

    this.start();
  }

  /**
   * Build every ability and draw it once, behind the loading veil.
   *
   * This used to be a single `WebGLRenderer#compileAsync` over the scene, and it
   * was doing close to nothing, for two separate reasons.
   *
   * The first is that **the abilities were not in the scene yet.** Their pools
   * are lazy, so at that point not one ability object existed and there was
   * nothing of theirs to compile.
   *
   * The second would have bitten even if they had been: **three compiles a
   * program for the state a material is drawn in, and `compile` guesses that
   * state from the render target that happens to be bound.** The program cache
   * key carries `outputColorSpace` and `toneMapping`, and both differ between
   * drawing to the canvas (sRGB, ACES) and drawing into the composer's HDR
   * target (linear, none) — which is the only way this app ever draws. Every
   * program that call produced was keyed for a render that never happens, and
   * was compiled a second time on the first real frame. The light counts have
   * the same problem: the distortion pass renders with the camera restricted to
   * one layer, so its materials want a *no point lights* variant that a compile
   * against the full camera never asks for.
   *
   * So the warm-up is a real frame from the real pipeline instead — depth
   * prepass, distortion pass, shadow map, composer — with the ability revealed
   * inside it. That pays up front, one ability at a time, for everything the
   * first cast used to pay for mid-fight: the geometry generation, the program
   * compiles for all four passes, and the first upload of every vertex buffer.
   *
   * @param {number} from progress ratio to start the labels at
   * @param {number} to   progress ratio to finish on
   */
  async _precompile(from, to) {
    // Abilities are built when they are selected (see `select`), not here:
    // there are 78 of them across six engines, and a boot that compiled every
    // one would keep the loading veil up for minutes.
    const elements = [];
    // Impact-only shaders: these are built on the first decal or shell of each
    // kind, which is a second hitch a moment after the first cast's.
    const releaseDecals = this.decals.prewarm();
    const releaseBursts = this.bursts.prewarm();

    // The arrow and the zone circle are hidden until the first arm, so they
    // would otherwise compile on the first press of Q.
    this._warmDraw([this.aim.object3D]);

    const warmed = [];
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      this.loading.setProgress(
        from + (to - from) * (i / elements.length),
        `Compiling ${ELEMENT_META[element]?.label ?? element}…`
      );
      // Both halves below block the main thread for as long as they take, so
      // yield first or the veil never shows a single one of these labels.
      await nextFrame();

      const ability = this.abilities.prewarm(element);
      if (!ability) continue;
      warmed.push(ability.group);
      this._warmDraw([ability.group]);
    }

    // Building the Monolith Rift is what *starts* the cathedral scan
    // downloading (loaders/StoneTextures.js), and a texture is uploaded to the
    // GPU by the first draw that binds it after its image lands — which would
    // be the first cast again, decoding four JPEGs mid-frame. So wait for them
    // and draw once more. Everything else on this pass is already compiled;
    // this frame exists only to move bytes.
    void waitFor;
    void getStoneTextures;

    releaseDecals();
    releaseBursts();
  }

  /**
   * One full pipeline frame with `roots` forced visible.
   *
   * Visibility and frustum culling are both overridden, because three skips an
   * invisible subtree outright and a culled mesh never reaches `setProgram` —
   * either one would leave a shader for the first cast to compile. Only what
   * this call changed is put back, so a mesh that was hidden by its own
   * constructor stays hidden.
   *
   * @param {THREE.Object3D[]} roots
   */
  _warmDraw(roots) {
    const hidden = [];
    const culled = [];

    for (const root of roots) {
      root.traverse((node) => {
        if (node.visible === false) {
          node.visible = true;
          hidden.push(node);
        }
        if (node.frustumCulled === true) {
          node.frustumCulled = false;
          culled.push(node);
        }
      });
    }

    // Same order as `frame()`, so every pass sees what it will see in flight.
    this.renderer.gl.shadowMap.needsUpdate = true;
    this.contactShadows.render(this.scene);
    this.post.sync(this.elapsed, this.flash);
    this.post.render();

    for (const node of hidden) node.visible = false;
    for (const node of culled) node.frustumCulled = true;
  }

  start() {
    this.time.reset();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
  }

  /* ------------------------------------------------------------------ */

  frame() {
    const gl = this.renderer.gl;
    gl.info.reset();

    const raw = this.time.tick();
    const dt = this.paused ? 0 : raw * settings.global.timeScale;
    this.elapsed += dt;

    /* ---- shared uniforms ---- */
    frame.uTime.value = this.elapsed;
    frame.uDelta.value = dt;
    frame.uShaderIntensity.value = settings.global.shaderIntensity;
    frame.uGlobalGlow.value = settings.global.glow;
    frame.uCameraNear.value = this.camera.near;
    frame.uCameraFar.value = this.camera.far;

    /* ---- simulation ---- */
    this.renderer.syncSettings();

    this.environment.setFocus(this.character.position.x, this.character.position.z);
    this.environment.update();

    // Walk first, so the aim and the ring below are anchored on where the
    // caster is *this* frame. A summon out owns WASD and Space instead.
    const aim = this.activeAim;
    this.locomotion.update(dt, {
      aiming: aim.isArmed,
      locked: this._summonOut(),
      abilities: this.abilities.active
    });

    // Targeting runs on *real* time so the arrow keeps sweeping and animating
    // while the sandbox is paused — pausing freezes the effects, not the UI.
    aim.setOrigin(this.character.position);
    aim.update(raw);

    if (settings.character.turnToAim && aim.isArmed) {
      this.character.turnToward(aim.facing, settings.character.turnRate, raw);
    }
    this.character.update(dt);

    for (const [element, remaining] of this.cooldowns) {
      if (remaining > 0) this.cooldowns.set(element, Math.max(0, remaining - raw));
    }

    this.ground.update(this.elapsed);
    this.dust.update(this.elapsed, this.character.position);

    this.abilities.update(dt);
    for (const runtime of this.runtimes.values()) runtime.update(dt, raw);
    // The targets step first, then read the casts that were just advanced: a
    // body has to be standing in this frame's pose before it can be knocked
    // out of it.
    this.dummies.update(dt, this.character.position);
    this.dummies.applyHits(this.abilities.active);
    for (const runtime of this.runtimes.values()) runtime.afterBodies(dt, this.elapsed);
    this.particles.flush();
    this.decals.update(dt);
    this.bursts.update(dt);
    this.lights.update(dt);

    /* ---- camera ---- */
    const focus = this.slot?.runtime?.focus ?? this.abilities.focus;
    if (focus) this.rig.lookAt(focus.position, MathUtils.clamp(1 - focus.u * 0.4, 0, 1));
    this.rig.setAnchor(this.character.position.x, 0, this.character.position.z);
    this.shake.update(raw);
    this.flash.update(raw);
    this.rig.update(raw);

    this.contactShadows.setPosition(this.character.position.x, this.character.position.z);
    this.contactShadows.render(this.scene);

    /* ---- render ---- */
    // Exactly one cascade shadow update per frame (see Renderer).
    gl.shadowMap.needsUpdate = true;
    this.post.sync(this.elapsed, this.flash);
    this.post.render();

    /* ---- readouts ---- */
    for (const element of ELEMENTS) {
      this.hud.setCooldown(element, this.cooldowns.get(this.uidOf(element)) ?? 0, settings[element].cooldown);
    }
    this.hud.setArmed(this.activeAim.isArmed);
    this.hud.update(raw, () => ({
      particles:
        this.particles.countLive(this.elapsed) +
        [...this.runtimes.values()].reduce((total, runtime) => total + runtime.countParticles(this.elapsed), 0),
      calls: gl.info.render.calls,
      spikes: this.abilities.active.reduce((total, ability) => total + ability.instanceCount, 0),
      abilities: this.abilities.active.length + [...this.runtimes.values()].reduce((n, r) => n + r.active.length, 0)
    }));
  }

  /* ------------------------------------------------------------------ */

  dispose() {
    this.stop();
    this.input.dispose();
    this.aim.dispose();
    this.abilities.dispose();
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.particles.dispose();
    this.decals.dispose();
    this.bursts.dispose();
    this.lights.dispose();
    this.dummies.dispose();
    this.character.dispose();
    this.ground.dispose();
    this.dust.dispose();
    this.contactShadows.dispose();
    this.post.dispose();
    this.environment.dispose();
    this.editor.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }
}
