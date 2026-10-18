import { CylinderGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3, DynamicDrawUsage } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createHyphaeGeometry, createStromaGeometry } from '../../assets/codex/MyceliumWakeGeometry.js';
import {
  createHyphaeMaterial,
  createStromaMaterial,
  createWakeGroundMaterial,
  createSporeHazeMaterial
} from '../../materials/codex/MyceliumWakeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'mycelium';

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Main cords down the line, and side branches off them. */
const MAX_CORDS = 8;
const MAX_BRANCHES = 28;
const MAX_HYPHAE = MAX_CORDS + MAX_BRANCHES;
/** Fruiting bodies in the cluster. */
const MAX_STALKS = 28;
/** Bodies one cast can infest. */
const MAX_INFEST = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _axis = new Vector3();
const _scale = new Vector3();
const _q = new Quaternion();
const _qr = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);
const _hyphaeState = { origin: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, front: 0, fade: 1 };
const _wakeState = { origin: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, front: 0, end: 1, discGrow: 0, dust: 0, erode: 0, seed: 0 };
const _hazeState = { strength: 0, seed: 0 };

function syncSystem(p, a, b, cc, d, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

function resetEmit(time) {
  _emit.radius = 0;
  _emit.direction = null;
  _emit.speed = 0;
  _emit.speedVariance = 0.35;
  _emit.spread = 0;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = time;
}

/**
 * MYCELIUM WAKE — Nature, line cast.
 *
 * The caster drives a hand into the floor and the ground **wakes**: luminous
 * cords of mycelium race away down the line just under the surface, heaving
 * the soil into a crumbled band, braiding round one another, throwing off
 * side branches that creep outward at their own pace, with pulses of light
 * running down them toward the target. Where they arrive the network
 * **knots** — a rot spreads across the floor, hairs radiating from it — and
 * then it **fruits**: a cluster of cordyceps-like stromata erupts out of the
 * ground, the middle first, pale fibrous stalks forked like antlers, ending in
 * orange-scarlet clubs pitted with glowing pores. A body standing there is
 * heaved off its feet by the stalks that come up *through* it and is
 * overgrown — pale, with an ember-orange rim. The clubs throb and **puff**:
 * jets of spore smoke and glinting spores rise and drift, the air thickening
 * over the cluster, an orange dust settling on the rot. Then the stromata
 * **wither** — browning, drooping, sinking back into the floor — and the
 * cords and the rot erode away.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the hyphae** (`createHyphaeMaterial`) — one instanced parameter-space
 *      tube per cord and per branch, laid half-sunk along the line in the
 *      vertex stage and clipped at the reveal front. Additive.
 *   2. **the stromata** (`createStromaGeometry` + `createStromaMaterial`) —
 *      rigid, instanced, opaque on `LAYER.WORLD`; risen, leaned and withered
 *      by the instance matrix; per instance `aState` (seed, glow, wither,
 *      punch).
 *   3. **the wake** (`createWakeGroundMaterial`) — the heaved band and the rot.
 *   4. **the spore haze** (`createSporeHazeMaterial`) — `LAYER.DISTORTION`.
 *   5. **particles** — bioluminescent motes (SOFT, additive) off the front and
 *      the cords; soil crumbs (CHIP); spore smoke (SMOKE, *not* additive — a
 *      spore cloud has to occlude); glinting spores (SOFT, additive).
 *   6. **the beats** — a DUSTRING at the caster's hand, a DUSTRING and a
 *      CRACK where the network knots, an EARTH burst at the first eruption,
 *      a flash and a light punch on the first puff, shake and rumble.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. Nothing on the line is hurt; the line is the wake. When
 * the network arrives, the bodies within `fruitRadius` of the target are
 * found and given stromata of their own — `stalksPerBody` of the cluster's
 * stalks are placed under each one and erupt first. The moment the first of
 * them breaks the floor the body is heaved up (`dummy.kill`, mostly lift) and
 * from then on is overgrown (`dummy.corrode`) for `infestTime`.
 *
 * ## The editor rule
 *
 * A cord holds dice (lane jitter, seed, its stretch of the line); a stroma
 * holds dice (height, lean, roll, timing) and the place it was latched to at
 * the knot. Every metre, second and colour is resolved from
 * `settings.mycelium` each frame.
 */
export class MyceliumWakeAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Stromata drawn. HUD readout only. */
  get instanceCount() {
    return this.stromata.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 1 · the hyphae ---- */
    this.hyphaeGeometry = createHyphaeGeometry(MAX_HYPHAE);
    this.hyphaeMaterial = createHyphaeMaterial();
    this.hyphae = new Mesh(this.hyphaeGeometry, this.hyphaeMaterial);
    this._setup(this.hyphae, LAYER.VFX, 8);

    /* ---- 2 · the stromata ---- */
    this.stromaGeometry = createStromaGeometry();
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_STALKS * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.stromaGeometry.setAttribute('aState', this.stateAttr);
    this.stromaMaterial = createStromaMaterial();
    this.stromata = new InstancedMesh(this.stromaGeometry, this.stromaMaterial, MAX_STALKS);
    this.stromata.name = 'MyceliumStromata';
    this.stromata.instanceMatrix.setUsage(DynamicDrawUsage);
    this.stromata.castShadow = true;
    this.stromata.count = 0;
    this._setup(this.stromata, LAYER.WORLD, 6);

    /* ---- 3 · the wake ---- */
    this.wakeGeometry = new PlaneGeometry(1, 2, 140, 6);
    this.wakeGeometry.translate(0.5, 0, 0); // x 0..1 along, y −1..1 across
    this.wakeMaterial = createWakeGroundMaterial();
    this.wake = new Mesh(this.wakeGeometry, this.wakeMaterial);
    this._setup(this.wake, LAYER.VFX, 2);

    /* ---- 4 · the spore haze ---- */
    this.hazeGeometry = new CylinderGeometry(1, 0.7, 1, 36, 1, true);
    this.hazeGeometry.translate(0, 0.5, 0);
    this.hazeMaterial = createSporeHazeMaterial();
    this.haze = new Mesh(this.hazeGeometry, this.hazeMaterial);
    this.haze.matrixAutoUpdate = true;
    this._setup(this.haze, LAYER.DISTORTION, 0);

    /** Dice only — see the class comment. */
    this.cords = [];
    for (let i = 0; i < MAX_HYPHAE; i++) this.cords.push({ jitter: 0, seed: 0, start: 0, side: 0, len: 0, rad: 0, parent: 0 });
    this.stalks = [];
    for (let i = 0; i < MAX_STALKS; i++) {
      this.stalks.push({
        x: 0,
        z: 0,
        dist: 0,
        hDice: 0,
        tDice: 0,
        lDice: 0,
        roll: 0,
        leanA: 0,
        seed: 0,
        body: -1,
        erupted: false,
        puffed: false,
        withering: false,
        k: 0
      });
    }
    this.infested = [];
    for (let i = 0; i < MAX_INFEST; i++) this.infested.push({ dummy: null, time: 0, hit: false, emitter: new RateEmitter() });
    this._bodies = 0;
    this._n = 0;
    this._seed = 0;
    this._clock = -1;
    this._knotted = false;
    this._firstErupt = false;
    this._firstPuff = false;
    this._puffEnv = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
  }

  _setup(mesh, layer, order) {
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('mycelium.mote', { capacity: 2000, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.25 });
    this.motes.uniforms.uDrag.value = 2.2;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.crumbs = particles.get('mycelium.crumb', { capacity: 1200, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.crumbs.uniforms.uDrag.value = 0.6;
    this.crumbs.uniforms.uEndSize.value = 0.8;
    this.crumbs.uniforms.uSizeIn.value = 0.02;
    this.crumbs.uniforms.uFadeIn.value = 0.01;
    this.crumbs.uniforms.uFadeOut.value = 0.3;

    this.spores = particles.get('mycelium.spore', { capacity: 1400, shape: ParticleShape.SMOKE, additive: false, curl: true, swirl: true, softFade: 0.8 });
    this.spores.uniforms.uDrag.value = 1.6;
    this.spores.uniforms.uEndSize.value = 2.6;
    this.spores.uniforms.uSizeIn.value = 0.12;
    this.spores.uniforms.uFadeIn.value = 0.08;
    this.spores.uniforms.uFadeOut.value = 0.55;

    this.glints = particles.get('mycelium.glint', { capacity: 1600, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.2 });
    this.glints.uniforms.uDrag.value = 1.4;
    this.glints.uniforms.uEndSize.value = 0.4;
    this.glints.uniforms.uSizeIn.value = 0.05;
    this.glints.uniforms.uFadeIn.value = 0.05;
    this.glints.uniforms.uFadeOut.value = 0.5;

    this.frontEmitter = new RateEmitter();
    this.cordEmitter = new RateEmitter();
    this.driftEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _eruptAt(st) {
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.fruitRadius);
    if (st.body >= 0) return Math.max(0, c.eruptDelay) + st.tDice * 0.12;
    return Math.max(0, c.eruptDelay) + saturate(st.dist / R) * Math.max(0, c.eruptSpread) + st.tDice * c.eruptJitter * g.randomness;
  }

  get impactDuration() {
    const c = settings[ID];
    const g = settings.global;
    return (
      Math.max(0, c.eruptDelay) + Math.max(0, c.eruptSpread) + Math.max(0, c.eruptJitter) + Math.max(0.05, c.riseTime) +
      Math.max(0.05, c.lifetime * g.lifetime)
    );
  }

  get fadeDuration() {
    const c = settings[ID];
    return (Math.max(0.1, c.witherTime) + Math.max(0, c.witherStagger)) * settings.global.lifetime;
  }

  /** Bioluminescence breathes rather than flickers. */
  lightShimmer() {
    return 0.82 + 0.18 * Math.sin(this.age * 3.1) * Math.sin(this.age * 1.3 + 0.4);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    const g = settings.global;
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._knotted = false;
    this._firstErupt = false;
    this._firstPuff = false;
    this._puffEnv = 0;
    this._bodies = 0;
    this._n = 0;
    this.frontEmitter.reset();
    this.cordEmitter.reset();
    this.driftEmitter.reset();
    this._releaseInfest();

    for (let i = 0; i < MAX_HYPHAE; i++) {
      const cd = this.cords[i];
      cd.jitter = Math.random() * 2 - 1;
      cd.seed = Math.random();
      cd.start = Math.random();
      cd.side = Math.random() < 0.5 ? -1 : 1;
      cd.len = Math.random();
      cd.rad = Math.random();
      cd.parent = i < MAX_CORDS ? i : (Math.random() * MAX_CORDS) | 0;
    }
    for (let i = 0; i < MAX_STALKS; i++) {
      const st = this.stalks[i];
      st.hDice = Math.random();
      st.tDice = Math.random();
      st.lDice = Math.random();
      st.roll = Math.random() * TAU;
      st.leanA = Math.random() * TAU;
      st.seed = Math.random();
      st.body = -1;
      st.erupted = false;
      st.puffed = false;
      st.withering = false;
      st.k = 0;
      this.stromata.setMatrixAt(i, _zero);
    }
    this.stromata.instanceMatrix.needsUpdate = true;
    this.stromata.count = 0;
    this.hyphae.visible = true;
    this.wake.visible = true;
    this.stromata.visible = false;
    this.haze.visible = false;

    /* the hand going into the floor */
    _pos.copy(this.origin).addScaledVector(this.direction, c.handForward).setY(0.05);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.handRing,
      life: 0.9,
      intensity: 0.7,
      colorA: getColor(c.colorCrumbB),
      colorB: getColor(c.colorCrumbC),
      growth: 0.4,
      height: 0.02
    });
    resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.moteSpeed * 2;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.3;
    _emit.life = c.moteLife;
    this.motes.emit(Math.round(c.handMotes * g.particleCount), _emit);
    this.ctx.shake.add(c.handShake * g.explosionIntensity, 8, 18);
    this._sync();
    this._layoutCords();
  }

  /** Lay the cords and branches out: lanes across the line, branches peeling off them. */
  _layoutCords() {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(1, Math.min(MAX_CORDS, Math.round(c.cordCount)));
    const nb = Math.max(0, Math.min(MAX_BRANCHES, Math.round(c.branchCount)));
    const L = Math.max(0.1, this.length + c.fruitRadius * 0.35);
    const startShare = saturate(c.handForward / L);
    const a1 = this.hyphaeGeometry.attributes.aCord;
    const a2 = this.hyphaeGeometry.attributes.aCord2;
    const lanes = [];
    for (let i = 0; i < n; i++) {
      const cd = this.cords[i];
      const x = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      const lane = x * c.cordSpread + cd.jitter * c.cordSpread * 0.3 * g.randomness;
      lanes.push(lane);
      a1.setXYZW(i, lane, cd.seed, startShare, 1);
      a2.setXYZW(i, 0, lerp(0.7, 1.3, cd.rad), 1, 0);
    }
    for (let j = 0; j < nb; j++) {
      const cd = this.cords[MAX_CORDS + j];
      const p = cd.parent % n;
      const parent = this.cords[p];
      const start = lerp(startShare + 0.05, 0.95, cd.start);
      const len = (c.branchLength * lerp(0.5, 1.2, cd.len)) / L;
      // A branch shares its parent's seed, so it leaves the cord exactly where the cord is.
      a1.setXYZW(n + j, lanes[p], parent.seed, start, Math.min(1.05, start + len));
      a2.setXYZW(n + j, cd.side * c.branchSpread * lerp(0.5, 1.3, cd.rad), lerp(0.4, 0.7, cd.rad), c.branchGrow, 1);
    }
    a1.needsUpdate = true;
    a2.needsUpdate = true;
    this.hyphaeGeometry.instanceCount = n + nb;
    this._hyphaeLength = L;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.stromaMaterial.userData.sync();
    syncSystem(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteGlow * g.glow, 0.7);
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    syncSystem(this.crumbs, c.colorCrumbA, c.colorCrumbB, c.colorCrumbC, c.colorCrumbD, 1, 0.05);
    this.crumbs.uniforms.uGravity.value.set(0, -9, 0);
    syncSystem(this.spores, c.colorSporeA, c.colorSporeB, c.colorSporeC, c.colorSporeD, 1, 0.8);
    this.spores.uniforms.uOpacity.value = c.sporeOpacity * g.opacity;
    this.spores.uniforms.uGravity.value.set(0, c.sporeRise, 0);
    this.spores.uniforms.uSwirl.value = c.sporeSwirl;
    syncSystem(this.glints, c.colorGlintA, c.colorGlintB, c.colorGlintC, c.colorGlintD, c.glintGlow * g.glow, 0.9);
    this.glints.uniforms.uGravity.value.set(0, c.sporeRise * 0.6, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** The network and the floor, from the front (and, after the knot, the clock). */
  _updateNetwork() {
    const c = settings[ID];
    const g = settings.global;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const fd = this.fadeDuration;
    const fk = fading ? saturate(this.fadeTime / Math.max(0.05, fd)) : 0;
    this._layoutCords();
    // After the knot the front runs on, so the branches can finish growing.
    const front = this.front + (clock > 0 ? clock * this.config.speed * g.speed : 0);

    _hyphaeState.origin.copy(this.origin).setY(0);
    _hyphaeState.dir.copy(this.direction);
    _hyphaeState.side.copy(this.side);
    _hyphaeState.length = this._hyphaeLength;
    _hyphaeState.front = front;
    _hyphaeState.fade = 1 - smoothstep(0.1, 0.9, fk);
    this.hyphaeMaterial.userData.sync(_hyphaeState);
    this.hyphae.visible = _hyphaeState.fade > 0.002;

    _wakeState.origin.copy(_hyphaeState.origin);
    _wakeState.dir.copy(this.direction);
    _wakeState.side.copy(this.side);
    _wakeState.length = this.length + c.fruitRadius * 1.6;
    _wakeState.front = Math.min(front, this.length + c.fruitRadius * 0.3);
    _wakeState.end = this.length;
    _wakeState.discGrow = clock < 0 ? 0 : Easing.outCubic(saturate(clock / Math.max(0.05, c.rotGrow)));
    _wakeState.dust = this._firstPuff ? saturate(c.sporeDust) : 0;
    _wakeState.erode = fading ? smoothstep(0.35, 1, fk) : 0;
    _wakeState.seed = this._seed;
    this.wakeMaterial.userData.sync(_wakeState);
  }

  /** Lay the cluster out at the knot: under the bodies first, then a sunflower round the target. */
  _layoutCluster() {
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.fruitRadius);
    this.pointAt(1, _centre);
    const n = Math.max(1, Math.min(MAX_STALKS, Math.round(c.stalkCount)));
    this._n = n;
    let k = 0;

    /* under the bodies that are standing there */
    const field = this.ctx.dummies;
    this._bodies = 0;
    if (field?.findTargets) {
      const found = field.findTargets(_centre.x, _centre.z, R, this._found);
      const per = Math.max(0, Math.round(c.stalksPerBody));
      for (let f = 0; f < found.length && this._bodies < MAX_INFEST; f++) {
        const d = found[f];
        const slot = this.infested[this._bodies];
        slot.dummy = d;
        slot.time = 0;
        slot.hit = false;
        slot.emitter.reset();
        for (let s = 0; s < per && k < n; s++, k++) {
          const st = this.stalks[k];
          const a = st.leanA;
          const rr = 0.12 + 0.28 * st.lDice;
          st.x = d.position.x + Math.cos(a) * rr;
          st.z = d.position.z + Math.sin(a) * rr;
          st.dist = Math.hypot(st.x - _centre.x, st.z - _centre.z);
          st.body = this._bodies;
        }
        this._bodies++;
      }
      this._found.length = 0;
    }

    /* the rest: a sunflower round the target, jittered */
    const rest = n - k;
    for (let i = 0; i < rest; i++, k++) {
      const st = this.stalks[k];
      const r = R * Math.sqrt((i + 0.5) / Math.max(1, rest)) * 0.95;
      const a = i * GOLDEN + st.roll * 0.3 * g.randomness;
      const jr = (st.lDice - 0.5) * R * 0.25 * g.randomness;
      st.x = _centre.x + Math.cos(a) * (r + jr);
      st.z = _centre.z + Math.sin(a) * (r + jr);
      st.dist = Math.max(0, r + jr);
      st.body = -1;
    }
  }

  /** Raise, sway, puff and wither every stroma. */
  _updateCluster(dt) {
    const c = settings[ID];
    const g = settings.global;
    const clock = this._clock;
    if (clock < 0) return;
    const n = this._n;
    const R = Math.max(0.3, c.fruitRadius);
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const riseT = Math.max(0.05, c.riseTime);
    const state = this.stateAttr.array;
    const time = frame.uTime.value;
    let puffing = 0;
    let shown = 0;

    for (let i = 0; i < n; i++) {
      const st = this.stalks[i];
      const t0 = this._eruptAt(st);
      const k = saturate((clock - t0) / riseT);
      st.k = k;
      const h = lerp(c.heightMin, c.heightMax, saturate((1 - st.dist / R) * c.heightFalloff + st.hDice * (1 - c.heightFalloff)));
      let rise = 0;
      if (k > 0) {
        const o = Math.max(0, c.overshoot) * 2.6;
        const t = k - 1;
        rise = 1 + (o + 1) * t * t * t + o * t * t;
      }
      if (k > 0 && !st.erupted) {
        st.erupted = true;
        this._eruptFx(st, h);
      }
      // Throb and puff.
      const since = clock - (t0 + riseT);
      const puffAt = c.puffDelay + st.tDice * c.puffJitter * g.randomness;
      if (since >= puffAt && !st.puffed && !fading) {
        st.puffed = true;
        this._puffFx(st, h);
      }
      if (since >= puffAt && since < puffAt + c.puffTime) puffing++;

      let wither = 0;
      if (fading) {
        const stag = Math.max(0, c.witherStagger) * g.lifetime * (1 - saturate(st.dist / R) * 0.5 - st.tDice * 0.5);
        wither = saturate((ft - stag) / Math.max(0.1, c.witherTime * g.lifetime));
      }
      const height = h * rise * (1 - 0.65 * Easing.inCubic(wither));
      if (height <= 0.005) {
        this.stromata.setMatrixAt(i, _zero);
        continue;
      }
      shown++;
      // Lean out from the middle, sway, droop as it withers.
      const outA = Math.atan2(st.z - _centre.z, st.x - _centre.x);
      const lean = c.lean * saturate(st.dist / R) + (st.lDice - 0.5) * c.leanJitter * g.randomness + c.droop * wither;
      const sway = c.sway * Math.sin(time * c.swayRate + st.seed * TAU) * k * (1 - wither);
      _axis.set(-Math.sin(outA), 0, Math.cos(outA));
      _q.setFromAxisAngle(_axis, -(lean + sway));
      _qr.setFromAxisAngle(_up, st.roll);
      _q.multiply(_qr);
      const girth = c.girth * Math.pow(Math.max(0.1, h), 0.35) * lerp(0.8, 1.2, st.hDice);
      _scale.set(girth, height, girth);
      _pos.set(st.x, -wither * h * c.witherSink, st.z);
      _m.compose(_pos, _q, _scale);
      this.stromata.setMatrixAt(i, _m);
      state[i * 4] = st.seed;
      state[i * 4 + 1] = c.clubGlow * smoothstep(0.6, 1, k) * (1 + (st.puffed ? Math.exp(-(since - puffAt) * 3) * 1.5 : 0));
      state[i * 4 + 2] = wither;
      state[i * 4 + 3] = k > 0 ? Math.exp(-(clock - t0) * 7) * c.eruptFlash : 0;
    }
    for (let i = n; i < this.stromata.count; i++) this.stromata.setMatrixAt(i, _zero);
    this.stromata.count = n;
    this.stromata.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
    this.stromata.visible = shown > 0;

    /* the haze and the drifting spores */
    const target = puffing > 0 ? 1 : this._firstPuff ? c.hazeLinger : 0;
    this._puffEnv += (target * (1 - (fading ? saturate(ft / Math.max(0.05, this.fadeDuration * 0.6)) : 0)) - this._puffEnv) * Math.min(1, dt * 4);
    _hazeState.strength = this._puffEnv;
    _hazeState.seed = this._seed;
    this.hazeMaterial.userData.sync(_hazeState);
    this.haze.position.set(_centre.x, 0, _centre.z);
    this.haze.scale.set(R * 1.1, c.heightMax * 2.2, R * 1.1);
    this.haze.visible = this._puffEnv > 0.01;
    if (dt > 0 && this._firstPuff) this._driftFx(dt, fading ? 1 - saturate(ft / Math.max(0.05, this.fadeDuration)) : 1);
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** Heave the body its stromata come up through; keep every infested body overgrowing. */
  _updateInfest(dt) {
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorInfestBody;
    look.rimColor = c.colorPore;
    look.rimEmissive = c.infestRimGlow * g.glow;
    look.edgeColor = c.colorClubTip;
    look.edgeEmissive = c.infestEdgeGlow * g.glow;
    look.edgeWidth = c.infestEdgeWidth;
    const power = g.explosionIntensity;
    for (let b = 0; b < this._bodies; b++) {
      const slot = this.infested[b];
      const d = slot.dummy;
      if (!d) continue;
      if (!slot.hit) {
        // Wait for the first of its own stromata to break the floor.
        let up = false;
        for (let i = 0; i < this._n; i++) {
          if (this.stalks[i].body === b && this.stalks[i].k > 0) {
            up = true;
            break;
          }
        }
        if (!up) continue;
        slot.hit = true;
        _dir.set(d.position.x - _centre.x, 0, d.position.z - _centre.z);
        if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
        _dir.normalize();
        this._force.impulse = c.hitImpulse * power;
        this._force.lift = c.hitLift * power;
        this._force.spin = c.hitSpin;
        d.kill(_dir.x, _dir.z, this._force);
      }
      if (d.finished) continue;
      slot.time += dt;
      d.corrode(saturate(slot.time / Math.max(0.05, c.infestTime)) * c.infest, look);
      const n = Math.round(slot.emitter.tick(dt, c.infestMotes * (1 - saturate(slot.time / Math.max(0.1, c.infestTime * 3)))) * g.particleCount);
      if (n > 0) {
        const at = d.bodyPoint(_pos) ?? _pos.copy(d.position).setY(0.6);
        resetEmit(frame.uTime.value);
        _emit.position = at;
        _emit.radius = 0.35;
        _emit.direction = _up;
        _emit.speed = c.moteSpeed;
        _emit.spread = 0.8;
        _emit.size = c.glintSize;
        _emit.life = c.glintLife;
        this.glints.emit(n, _emit);
      }
    }
  }

  _releaseInfest() {
    for (let i = 0; i < MAX_INFEST; i++) this.infested[i].dummy = null;
    this._bodies = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** Motes and crumbs off the running front; motes rising off the cords. */
  _wakeFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const n = Math.round(this.frontEmitter.tick(dt, c.frontDebris) * g.particleCount);
    if (n > 0) {
      resetEmit(time);
      _pos.copy(this.position).setY(0.06);
      _emit.position = _pos;
      _emit.radius = c.cordSpread * 0.8;
      _emit.direction = _up;
      _emit.speed = c.crumbSpeed * 0.4;
      _emit.spread = 0.7;
      _emit.size = c.crumbSize * 0.7;
      _emit.life = c.crumbLife * 0.6;
      _emit.spin = 6;
      this.crumbs.emit(n, _emit);
      _emit.speed = c.moteSpeed;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.spin = 0;
      this.motes.emit(Math.max(1, Math.round(n * 0.8)), _emit);
    }
    const m = Math.round(this.cordEmitter.tick(dt, c.cordMotes) * g.particleCount);
    if (m > 0 && this.front > c.handForward) {
      resetEmit(time);
      _emit.direction = _up;
      _emit.speed = c.moteSpeed * 0.5;
      _emit.spread = 0.6;
      _emit.size = c.moteSize * 0.8;
      _emit.life = c.moteLife;
      for (let q = 0; q < m; q++) {
        const along = lerp(c.handForward, Math.min(this.front, this.length), Math.random());
        this.pointAt(along / Math.max(0.1, this.length), _pos);
        _pos.addScaledVector(this.side, (Math.random() * 2 - 1) * c.cordSpread);
        _pos.y = 0.04;
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    }
  }

  /** A stroma breaking the floor. */
  _eruptFx(st, h) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    resetEmit(time);
    _pos.set(st.x, 0.06, st.z);
    _emit.position = _pos;
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = c.crumbSpeed * (0.6 + 0.4 * Math.min(1, h / Math.max(0.1, c.heightMax)));
    _emit.spread = 0.7;
    _emit.size = c.crumbSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.crumbLife;
    _emit.spin = 8;
    this.crumbs.emit(Math.round(c.eruptCrumbs * g.particleCount), _emit);
    _emit.speed = c.moteSpeed * 2;
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.spin = 0;
    this.motes.emit(Math.round(c.eruptCrumbs * 0.5 * g.particleCount), _emit);
    this.ctx.shake.add(c.eruptShake * g.explosionIntensity, 10, 22);
    if (!this._firstErupt) {
      this._firstErupt = true;
      this.ctx.bursts.spawn(BurstMode.EARTH, _pos.set(_centre.x, 0.3, _centre.z), {
        radius: 0.2,
        endRadius: c.eruptBurst * g.explosionIntensity,
        life: 0.55,
        intensity: 1.2,
        opacity: 0.7 * g.opacity,
        squash: 0.45,
        colorA: getColor(c.colorCrumbA),
        colorB: getColor(c.colorCrumbB),
        colorC: getColor(c.colorCrumbD)
      });
      this.ctx.shake.add(c.eruptShake * 2.5 * g.explosionIntensity, 4, 16);
      this.lightBoost = c.lightIntensity * 0.8;
    }
  }

  /** A club puffs: a jet of spore smoke and glints off its head. */
  _puffFx(st, h) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    resetEmit(time);
    _pos.set(st.x, h * 0.88, st.z);
    _emit.position = _pos;
    _emit.radius = 0.08;
    _emit.direction = _up;
    _emit.speed = c.puffSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.45;
    _emit.size = c.sporeSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sporeLife;
    _emit.spin = 0.8;
    this.spores.emit(Math.round(c.puffSmoke * g.particleCount), _emit);
    _emit.speed = c.puffSpeed * 1.4;
    _emit.spread = 0.7;
    _emit.size = c.glintSize;
    _emit.life = c.glintLife;
    _emit.spin = 0;
    this.glints.emit(Math.round(c.puffGlints * g.particleCount), _emit);
    if (!this._firstPuff) {
      this._firstPuff = true;
      this.ctx.flash.trigger(getColor(c.colorFlash), c.puffFlash * g.explosionIntensity);
      this.lightBoost = c.lightIntensity * c.puffLight * g.explosionIntensity;
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos.set(_centre.x, 0, _centre.z), {
        radius: c.fruitRadius * 1.6,
        life: 0.7,
        width: 0.05,
        intensity: 0.8,
        colorA: getColor(c.colorClub),
        colorB: getColor(c.colorPore),
        height: 0.03
      });
    }
  }

  /** Spores still drifting off the clubs, a slow glinting haze over the cluster. */
  _driftFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.driftEmitter.tick(dt, c.driftRate * strength) * g.particleCount);
    if (n <= 0) return;
    resetEmit(frame.uTime.value);
    _emit.direction = _up;
    _emit.speed = c.puffSpeed * 0.15;
    _emit.spread = 1;
    for (let q = 0; q < n; q++) {
      const st = this.stalks[(Math.random() * this._n) | 0];
      if (!st.erupted) continue;
      const h = lerp(c.heightMin, c.heightMax, 0.6);
      _pos.set(st.x, h * 0.85, st.z);
      _emit.position = _pos;
      if (Math.random() < 0.35) {
        _emit.size = c.sporeSize * 0.8;
        _emit.life = c.sporeLife;
        _emit.spin = 0.5;
        this.spores.emit(1, _emit);
      } else {
        _emit.size = c.glintSize;
        _emit.life = c.glintLife * 1.4;
        _emit.spin = 0;
        this.glints.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._clock = -1;
    this._sync();
    this._updateNetwork();
    this._wakeFx(dt);
    this.ctx.shake.rumble(c.travelRumble, dt);
    this.position.y = 0.3;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this._clock = 0;
    this._knotted = true;
    this._layoutCluster();
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.fruitRadius * 1.2,
      life: 1.2,
      intensity: 0.7,
      colorA: getColor(c.colorCrumbB),
      colorB: getColor(c.colorCrumbC),
      growth: 0.3,
      height: 0.02
    });
    this.ctx.decals.spawn(DecalType.CRACK, _centre, {
      radius: c.fruitRadius * 0.9,
      life: this.impactDuration + this.fadeDuration * 0.7,
      intensity: 0.9,
      colorA: getColor(c.colorRot),
      colorB: getColor(c.colorCordSheath),
      width: 0.09,
      height: 0.02
    });
    this.ctx.shake.add(c.handShake * 1.5 * g.explosionIntensity, 6, 18);
    this.lightBoost = c.lightIntensity * 0.5;
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._sync();
    this._updateNetwork();
    this.pointAt(1, _centre);
    this._updateCluster(dt);
    this._updateInfest(dt);
    if (this._clock < c.rotGrow) this.ctx.shake.rumble(c.travelRumble * 2, dt);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._releaseInfest();
    this.hyphaeGeometry.instanceCount = 0;
    this.stromata.count = 0;
    this.hyphae.visible = false;
    this.stromata.visible = false;
    this.wake.visible = false;
    this.haze.visible = false;
  }

  dispose() {
    this.hyphaeGeometry.dispose();
    this.stromaGeometry.dispose();
    this.wakeGeometry.dispose();
    this.hazeGeometry.dispose();
    this.hyphaeMaterial.dispose();
    this.stromaMaterial.dispose();
    this.wakeMaterial.dispose();
    this.hazeMaterial.dispose();
    this.stromata.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('❦  Mycelium Wake');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'network runs (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'cluster stands for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', 0, 3, 0.01, 'hand in the floor at (m)');
  R(cast, c, 'handRing', 0, 4, 0.05, 'dust ring at the hand (m)');
  R(cast, c, 'handMotes', 0, 200, 1, 'motes at the hand');
  R(cast, c, 'handShake', 0, 1, 0.01, 'jolt');
  R(cast, c, 'travelRumble', 0, 1, 0.01, 'rumble');

  const cords = folder.addFolder('1 · Hyphae');
  R(cords, c, 'cordCount', 1, MAX_CORDS, 1, 'cords');
  R(cords, c, 'cordSpread', 0, 2, 0.01, 'spread across (m)');
  R(cords, c, 'cordRadius', 0.005, 0.2, 0.001, 'thickness (m)');
  R(cords, c, 'cordSink', -0.1, 0.2, 0.001, 'sunk in the floor (m)');
  R(cords, c, 'cordWander', 0, 1.5, 0.01, 'wander (m)');
  R(cords, c, 'cordWanderScale', 0.05, 3, 0.01, 'wander scale');
  R(cords, c, 'cordBraid', 0, 0.5, 0.005, 'braid (m)');
  R(cords, c, 'cordTaper', 0.002, 0.2, 0.001, 'growing tip taper');
  R(cords, c, 'branchCount', 0, MAX_BRANCHES, 1, 'branches');
  R(cords, c, 'branchLength', 0.1, 6, 0.05, 'branch length (m)');
  R(cords, c, 'branchSpread', 0, 4, 0.01, 'branches reach out (m)');
  R(cords, c, 'branchGrow', 0.05, 2, 0.01, 'branches grow at (× front)');
  R(cords, c, 'cordCoreGlow', 0, 10, 0.05, 'core glow');
  R(cords, c, 'cordSheathGlow', 0, 6, 0.05, 'sheath glow');
  R(cords, c, 'cordTipGlow', 0, 15, 0.05, 'growing tip glow');
  R(cords, c, 'pulseLength', 0.2, 8, 0.05, 'pulse spacing (m)');
  R(cords, c, 'pulseSpeed', -4, 4, 0.01, 'pulses / s');
  R(cords, c, 'pulseGlow', 0, 10, 0.05, 'pulse glow');
  R(cords, c, 'cordSoftFade', 0.005, 0.5, 0.005, 'soft into the floor (m)');
  cords.addColor(c, 'colorCordCore').name('core');
  cords.addColor(c, 'colorCordSheath').name('sheath');
  cords.addColor(c, 'colorPulse').name('pulse');

  const ground = folder.addFolder('2 · Wake & rot');
  R(ground, c, 'bandWidth', 0.1, 3, 0.01, 'heaved band (m)');
  R(ground, c, 'hairAmount', 0, 1, 0.01, 'hyphal hair');
  R(ground, c, 'hairScale', 0.5, 12, 0.05, 'hair scale');
  R(ground, c, 'underGlow', 0, 6, 0.05, 'glow under the soil');
  R(ground, c, 'rotScale', 0.3, 2.5, 0.01, 'rot (× cluster)');
  R(ground, c, 'rotGrow', 0.05, 3, 0.01, 'rot spreads over (s)');
  R(ground, c, 'sporeDust', 0, 1, 0.01, 'spore dust settled');
  ground.addColor(c, 'colorSoil').name('soil');
  ground.addColor(c, 'colorHair').name('hair');
  ground.addColor(c, 'colorRot').name('rot');
  ground.addColor(c, 'colorSporeDust').name('spore dust');

  const fruit = folder.addFolder('3 · Fruiting bodies');
  R(fruit, c, 'stalkCount', 1, MAX_STALKS, 1, 'stromata');
  R(fruit, c, 'fruitRadius', 0.3, 6, 0.05, 'cluster radius (m)');
  R(fruit, c, 'stalksPerBody', 0, 6, 1, 'come up through each body');
  R(fruit, c, 'heightMin', 0.1, 4, 0.05, 'shortest (m)');
  R(fruit, c, 'heightMax', 0.2, 6, 0.05, 'tallest (m)');
  R(fruit, c, 'heightFalloff', 0, 1, 0.01, 'taller in the middle');
  R(fruit, c, 'girth', 0.2, 4, 0.01, 'girth (×)');
  R(fruit, c, 'lean', 0, 1.2, 0.01, 'lean out at the rim (rad)');
  R(fruit, c, 'leanJitter', 0, 1, 0.01, 'lean jitter (rad)');
  R(fruit, c, 'sway', 0, 0.3, 0.005, 'sway (rad)');
  R(fruit, c, 'swayRate', 0, 8, 0.05, 'sway rate');
  R(fruit, c, 'eruptDelay', 0, 1.5, 0.01, 'first erupts after (s)');
  R(fruit, c, 'eruptSpread', 0, 2, 0.01, 'out to the rim over (s)');
  R(fruit, c, 'eruptJitter', 0, 1, 0.01, 'erupt jitter (s)');
  R(fruit, c, 'riseTime', 0.05, 2, 0.01, 'one rises over (s)');
  R(fruit, c, 'overshoot', 0, 1, 0.01, 'overshoot');
  R(fruit, c, 'eruptFlash', 0, 4, 0.05, 'flash breaking the floor');
  R(fruit, c, 'witherTime', 0.1, 4, 0.05, 'one withers over (s)');
  R(fruit, c, 'witherStagger', 0, 2, 0.01, 'withering spreads over (s)');
  R(fruit, c, 'droop', 0, 1.5, 0.01, 'droops (rad)');
  R(fruit, c, 'witherSink', 0, 1, 0.01, 'sinks (× height)');
  const look = fruit.addFolder('Look');
  R(look, c, 'poreScale', 2, 80, 0.5, 'ostioles');
  R(look, c, 'poreGlow', 0, 10, 0.05, 'ostiole glow');
  R(look, c, 'clubGlow', 0, 3, 0.01, 'club glow');
  R(look, c, 'throb', 0, 1, 0.01, 'throb');
  R(look, c, 'stromaSpecular', 0, 3, 0.01, 'wax specular');
  R(look, c, 'stromaRim', 0, 4, 0.01, 'rim');
  R(look, c, 'striation', 0, 1, 0.01, 'stalk striation');
  look.addColor(c, 'colorStalk').name('stalk');
  look.addColor(c, 'colorStalkTop').name('stalk, top');
  look.addColor(c, 'colorClub').name('club');
  look.addColor(c, 'colorClubTip').name('club, tip');
  look.addColor(c, 'colorPore').name('ostioles');
  look.addColor(c, 'colorStromaRim').name('rim');
  look.addColor(c, 'colorDead').name('withered');

  const puff = folder.addFolder('4 · Spores');
  R(puff, c, 'puffDelay', 0, 3, 0.01, 'puffs after risen (s)');
  R(puff, c, 'puffJitter', 0, 2, 0.01, 'puff jitter (s)');
  R(puff, c, 'puffTime', 0.05, 2, 0.01, 'a puff lasts (s)');
  R(puff, c, 'puffSpeed', 0, 10, 0.05, 'jet speed (m/s)');
  R(puff, c, 'puffSmoke', 0, 60, 1, 'smoke per puff');
  R(puff, c, 'puffGlints', 0, 120, 1, 'glints per puff');
  R(puff, c, 'puffFlash', 0, 1, 0.01, 'flash on the first');
  R(puff, c, 'puffLight', 0, 6, 0.05, 'light punch (× intensity)');
  R(puff, c, 'driftRate', 0, 200, 1, 'drifting / s');
  R(puff, c, 'sporeSize', 0.05, 2, 0.01, 'smoke size');
  R(puff, c, 'sporeLife', 0.2, 6, 0.05, 'smoke life');
  R(puff, c, 'sporeRise', -1, 3, 0.01, 'smoke rise');
  R(puff, c, 'sporeSwirl', 0, 3, 0.01, 'smoke swirl');
  R(puff, c, 'sporeOpacity', 0, 1, 0.01, 'smoke opacity');
  Editor.gradient(puff, c, 'colorSpore', 'smoke colour');
  R(puff, c, 'glintSize', 0.005, 0.3, 0.005, 'glint size');
  R(puff, c, 'glintLife', 0.1, 5, 0.05, 'glint life');
  R(puff, c, 'glintGlow', 0, 8, 0.05, 'glint glow');
  Editor.gradient(puff, c, 'colorGlint', 'glint colour');
  R(puff, c, 'hazeStrength', 0, 3, 0.01, 'air thickens');
  R(puff, c, 'hazeScale', 0.1, 6, 0.05, 'haze scale');
  R(puff, c, 'hazeLinger', 0, 1, 0.01, 'haze lingers');
  puff.addColor(c, 'colorFlash').name('flash');

  const fx = folder.addFolder('5 · Motes & crumbs');
  R(fx, c, 'frontDebris', 0, 300, 1, 'off the front / s');
  R(fx, c, 'cordMotes', 0, 300, 1, 'off the cords / s');
  R(fx, c, 'eruptCrumbs', 0, 60, 1, 'crumbs per stroma');
  R(fx, c, 'eruptShake', 0, 0.5, 0.005, 'jolt per stroma');
  R(fx, c, 'eruptBurst', 0, 6, 0.05, 'earth burst (m)');
  R(fx, c, 'moteSize', 0.005, 0.3, 0.005, 'mote size');
  R(fx, c, 'moteSpeed', 0, 4, 0.01, 'mote speed');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote life');
  R(fx, c, 'moteRise', -1, 3, 0.01, 'mote rise');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote colour');
  R(fx, c, 'crumbSize', 0.01, 0.3, 0.005, 'crumb size');
  R(fx, c, 'crumbSpeed', 0, 12, 0.05, 'crumb speed');
  R(fx, c, 'crumbLife', 0.1, 3, 0.05, 'crumb life');
  Editor.gradient(fx, c, 'colorCrumb', 'crumb colour');

  const hit = folder.addFolder('6 · Infested');
  R(hit, c, 'hitImpulse', 0, 10, 0.1, 'heaved outward (m/s)');
  R(hit, c, 'hitLift', 0, 15, 0.05, 'heaved up (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'tumble');
  R(hit, c, 'infest', 0, 1, 0.01, 'overgrown');
  R(hit, c, 'infestTime', 0.05, 5, 0.05, 'overgrows over (s)');
  R(hit, c, 'infestMotes', 0, 200, 1, 'glints off a body / s');
  R(hit, c, 'infestRimGlow', 0, 8, 0.05, 'rim glow');
  R(hit, c, 'infestEdgeGlow', 0, 10, 0.05, 'edge glow');
  R(hit, c, 'infestEdgeWidth', 0, 0.3, 0.001, 'edge width');
  hit.addColor(c, 'colorInfestBody').name('overgrown body');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 5, 0.05, 'height over the cluster (m)');

  folder.close();
  return folder;
}
