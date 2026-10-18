import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Vector3, DynamicDrawUsage } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createBriarRibGeometry,
  createBriarThornGeometry,
  createBriarShaftGeometry
} from '../../assets/codex/BriarCathedralGeometry.js';
import {
  createBriarRibMaterial,
  createBriarThornMaterial,
  createBriarFloorMaterial,
  createBriarShaftMaterial,
  createBriarWarpMaterial,
  createBriarRunnerMaterial
} from '../../materials/codex/BriarCathedralMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'briar';

const TAU = Math.PI * 2;
/** Ribs a vault can have; the editor's slider clamps to this. */
const MAX_RIBS = 14;
/** Two briar strands twine up every rib. */
const STRANDS = 2;
const MAX_STRANDS = MAX_RIBS * STRANDS;
/** Thorns per strand at most. */
const MAX_THORNS_PER = 12;
const MAX_THORNS = MAX_STRANDS * MAX_THORNS_PER;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _tg = new Vector3();
const _side = new Vector3();
const _n2 = new Vector3();
const _out = new Vector3();
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);
const _ribState = { centre: new Vector3(), close: 0, seal: 0 };
const _floorState = { centre: new Vector3(), ribs: 8, rot: 0, seed: 0, soil: 0, light: 0, erode: 0 };
const _shaftState = { centre: new Vector3(), light: 0, seed: 0 };
const _warpState = { centre: new Vector3(), strength: 0, seed: 0 };
const _runnerState = { start: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, front: 0, fade: 0, seed: 0 };
const _thornState = { dry: 0 };

/** Push one particle system's gradient and the globals through. */
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
 * BRIAR CATHEDRAL — Nature, zone cast.
 *
 * A bramble **runs** along the floor from the caster's feet to the circle,
 * two roots twining through heaving soil. Where it arrives the rim of the
 * circle tears open and **ribs of briar rise** out of it, one after another
 * round the ring — each a pair of thorny stems twining round one line, lime
 * light at the growing tip, leaves and soil thrown off as it climbs. They rise
 * as an open sheaf, splayed outward, and then the sheaf **closes**: every rib
 * bends over into a *pointed gothic arch* and the tips meet over the centre
 * with a jolt. The vault is sealed. Light falls through it — a cone of dusty
 * gold from the apex, and on the nave floor a **rose window** of stained
 * light, its lead tracery the shadow of the ribs. Rose petals drift down
 * through the shaft. Then the briar **withers**: the ribs brown from the apex
 * down, open a little and draw back into the floor, the thorns go dry and
 * shrink, leaves fall, and the window fades out with the rim.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the ribs** (`createBriarRibMaterial`) — one instanced parameter-space
 *      tube per strand, bent along the arch in the vertex stage (see
 *      BriarCathedralMaterials); opaque on `LAYER.SHAPED` with a matching
 *      depth material, so the vault throws its own shadow.
 *   2. **the thorns** — rigid hooked cones (`createBriarThornGeometry`),
 *      placed per instance along the strands on the CPU, popping out as the
 *      grow front passes them; `LAYER.WORLD`, shadowed.
 *   3. **the rose window** (`createBriarFloorMaterial`) — torn rim, root
 *      cracks and the stained light on the floor.
 *   4. **the shaft** and **the seal warp** — the cone of light, and its twin
 *      on `LAYER.DISTORTION` that shudders as the vault closes.
 *   5. **the runner** (`createBriarRunnerMaterial`) — the bramble on the way.
 *   6. **particles** — leaves (LEAF, lit) off the growing tips and falling at
 *      the wither; soil (CHIP, lit) as each rib breaks the floor; rose petals
 *      (LEAF) drifting in the shaft; gold motes (SOFT, additive).
 *   7. **the seal** — the beat: a thin AIR shell at the apex, a SHOCKWAVE and
 *      a DUSTRING on the floor, flash, shake, light punch.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. Nothing is hurt by the ribs rising; the vault *closing*
 * is the blow. On the seal, every body inside `hitReach` of the rim is
 * pressed down and inward by the briar coming over — a low throw toward the
 * altar, a little lift, some tumble.
 *
 * ## The editor rule
 *
 * A rib record holds dice (a bearing jitter, a timing roll, a seed) and two
 * latches (broke the floor, shed its leaves). A thorn record holds dice (its
 * place along the strand, its bearing round it, its length). Every metre,
 * second and colour is resolved from `settings.briar` every frame — the rib
 * count too, so dragging `ribCount` re-cuts a vault that is standing.
 */
export class BriarCathedralAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The vault decides who it closes on. */
  get handlesOwnHits() {
    return true;
  }

  /** Thorns drawn. HUD readout only. */
  get instanceCount() {
    return this.thorns.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 1 · the ribs ---- */
    this.ribGeometry = createBriarRibGeometry(MAX_STRANDS);
    this.ribMaterial = createBriarRibMaterial();
    this.ribs = new Mesh(this.ribGeometry, this.ribMaterial);
    this.ribs.name = 'BriarRibs';
    this.ribs.customDepthMaterial = this.ribMaterial.userData.depth;
    this.ribs.castShadow = true;
    this._setup(this.ribs, LAYER.SHAPED, 6);

    /* ---- 2 · the thorns ---- */
    this.thornGeometry = createBriarThornGeometry();
    this.thornState = new InstancedBufferAttribute(new Float32Array(MAX_THORNS * 2), 2);
    this.thornState.setUsage(DynamicDrawUsage);
    this.thornGeometry.setAttribute('aState', this.thornState);
    this.thornMaterial = createBriarThornMaterial();
    this.thorns = new InstancedMesh(this.thornGeometry, this.thornMaterial, MAX_THORNS);
    this.thorns.name = 'BriarThorns';
    this.thorns.instanceMatrix.setUsage(DynamicDrawUsage);
    this.thorns.castShadow = true;
    this.thorns.count = 0;
    this._setup(this.thorns, LAYER.WORLD, 6);

    /* ---- 3 · the rose window ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createBriarFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this._setup(this.floor, LAYER.VFX, 2);

    /* ---- 4 · the shaft and its warp ---- */
    this.shaftGeometry = createBriarShaftGeometry();
    this.shaftMaterial = createBriarShaftMaterial();
    this.shaft = new Mesh(this.shaftGeometry, this.shaftMaterial);
    this._setup(this.shaft, LAYER.VFX, 12);
    this.warpMaterial = createBriarWarpMaterial();
    this.warp = new Mesh(this.shaftGeometry, this.warpMaterial);
    this._setup(this.warp, LAYER.DISTORTION, 0);

    /* ---- 5 · the runner ---- */
    this.runnerGeometry = new PlaneGeometry(1, 2, 120, 4);
    // Parameter space: x 0..1 along, y −1..1 across.
    this.runnerGeometry.translate(0.5, 0, 0);
    this.runnerMaterial = createBriarRunnerMaterial();
    this.runner = new Mesh(this.runnerGeometry, this.runnerMaterial);
    this._setup(this.runner, LAYER.VFX, 3);

    /** Dice and latches only — see the class comment. */
    this.ribRecs = [];
    for (let i = 0; i < MAX_RIBS; i++) {
      this.ribRecs.push({ jitter: 0, tDice: 0, wDice: 0, seed: 0, broke: false, theta: 0, order: 0, grow: 0, wither: 0, flash: 0 });
    }
    this.thornRecs = [];
    for (let k = 0; k < MAX_THORNS; k++) {
      this.thornRecs.push({ sDice: 0, aDice: 0, lDice: 0, tDice: 0 });
    }
    this._n = 0;
    this._rot = 0;
    this._seed = 0;
    this._clock = -1;
    this._close = 0;
    this._sealed = false;
    this._sealTime = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
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

    this.leaves = particles.get('briar.leaf', { capacity: 1600, shape: ParticleShape.LEAF, additive: false, lit: true, curl: true, softFade: 0.3 });
    this.leaves.uniforms.uDrag.value = 1.8;
    this.leaves.uniforms.uEndSize.value = 0.9;
    this.leaves.uniforms.uSizeIn.value = 0.06;
    this.leaves.uniforms.uFadeIn.value = 0.04;
    this.leaves.uniforms.uFadeOut.value = 0.35;

    this.soil = particles.get('briar.soil', { capacity: 1400, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.soil.uniforms.uDrag.value = 0.5;
    this.soil.uniforms.uEndSize.value = 0.8;
    this.soil.uniforms.uSizeIn.value = 0.02;
    this.soil.uniforms.uFadeIn.value = 0.01;
    this.soil.uniforms.uFadeOut.value = 0.3;

    this.petals = particles.get('briar.petal', { capacity: 900, shape: ParticleShape.LEAF, additive: false, lit: true, curl: true, softFade: 0.3 });
    this.petals.uniforms.uDrag.value = 2.6;
    this.petals.uniforms.uEndSize.value = 1;
    this.petals.uniforms.uSizeIn.value = 0.1;
    this.petals.uniforms.uFadeIn.value = 0.1;
    this.petals.uniforms.uFadeOut.value = 0.35;

    this.motes = particles.get('briar.mote', { capacity: 1200, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
    this.motes.uniforms.uDrag.value = 2.2;
    this.motes.uniforms.uEndSize.value = 0.6;
    this.motes.uniforms.uSizeIn.value = 0.2;
    this.motes.uniforms.uFadeIn.value = 0.2;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.tipEmitter = new RateEmitter();
    this.petalEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
    this.runEmitter = new RateEmitter();
    this.dropEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _riseStart(rec) {
    const c = settings[ID];
    const g = settings.global;
    return Math.max(0, c.riseStagger) * g.lifetime * lerp(rec.order, rec.tDice, saturate(c.riseShuffle * g.randomness));
  }

  _closeAt() {
    const c = settings[ID];
    return Math.max(0, c.riseStagger) * settings.global.lifetime + Math.max(0.05, c.riseTime) * saturate(c.closeLead);
  }

  get impactDuration() {
    const c = settings[ID];
    return this._closeAt() + Math.max(0.05, c.closeTime) + Math.max(0.05, c.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    const c = settings[ID];
    return (Math.max(0, c.witherStagger) + Math.max(0.1, c.witherTime)) * settings.global.lifetime;
  }

  /** Light through leaves: a slow dapple, not a flicker. */
  lightShimmer() {
    return 0.88 + 0.12 * Math.sin(this.age * 2.3) * Math.sin(this.age * 1.1 + 0.7);
  }

  /* ------------------------------------------------------------------ */
  /* The rib on the CPU — twin of `ribPoint`/`strandPoint` in the shader */
  /* ------------------------------------------------------------------ */

  _bez(a, b, cc, d, t) {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * cc + t * t * t * d;
  }

  _ribPoint(s, theta, seed, out) {
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.zoneRadius * c.ribInset);
    const apex = Math.max(c.springHeight + 0.2, c.apexHeight);
    const k = this._close;
    const pt = c.archPoint;
    const r2 = lerp(R + c.openLean * 0.45, R * lerp(0.55, 0.2, pt), k);
    const y2 = lerp(apex * 0.8, apex * lerp(1.02, 0.84, pt), k);
    const r3 = lerp(R + c.openLean, c.apexGap, k);
    const y3 = lerp(apex * 0.92, apex, k);
    const r = this._bez(R, R, r2, r3, s);
    const y = this._bez(-0.5, c.springHeight, y2, y3, s);
    const sway = c.ribSway * g.randomness * (seed * 2 - 1) * Math.sin(Math.PI * s);
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    out.set(_centre.x + ct * r - st * sway, y, _centre.z + st * r + ct * sway);
    return out;
  }

  /** A point on one strand; also leaves the strand's tangent in `_tg` and its frame in `_side`/`_n2`. */
  _strandPoint(s, rec, strand, out) {
    const c = settings[ID];
    this._ribPoint(Math.min(s + 0.01, 1), rec.theta, rec.seed, _a);
    this._ribPoint(Math.max(s - 0.01, 0), rec.theta, rec.seed, _b);
    _tg.subVectors(_a, _b).normalize();
    _side.set(-Math.sin(rec.theta), 0, Math.cos(rec.theta));
    _n2.crossVectors(_tg, _side).normalize();
    this._ribPoint(s, rec.theta, rec.seed, out);
    const phi = strand * Math.PI + c.strandTwist * TAU * s;
    const rr = c.strandSpread * (1 - 0.55 * s);
    out.addScaledVector(_side, Math.cos(phi) * rr).addScaledVector(_n2, Math.sin(phi) * rr);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._rot = Math.random() * TAU;
    this._clock = -1;
    this._close = 0;
    this._sealed = false;
    this._sealTime = 0;
    this._n = 0;
    this.tipEmitter.reset();
    this.petalEmitter.reset();
    this.moteEmitter.reset();
    this.runEmitter.reset();
    this.dropEmitter.reset();

    for (let i = 0; i < MAX_RIBS; i++) {
      const r = this.ribRecs[i];
      r.jitter = Math.random() * 2 - 1;
      r.tDice = Math.random();
      r.wDice = Math.random();
      r.seed = Math.random();
      r.broke = false;
      r.grow = 0;
      r.wither = 0;
      r.flash = 0;
    }
    for (let k = 0; k < MAX_THORNS; k++) {
      const t = this.thornRecs[k];
      t.sDice = Math.random();
      t.aDice = Math.random();
      t.lDice = Math.random();
      t.tDice = Math.random();
    }
    for (let k = 0; k < MAX_THORNS; k++) this.thorns.setMatrixAt(k, _zero);
    this.thorns.instanceMatrix.needsUpdate = true;
    this.thorns.count = 0;
    this.ribGeometry.instanceCount = 0;

    this.ribs.visible = false;
    this.thorns.visible = false;
    this.floor.visible = false;
    this.shaft.visible = false;
    this.warp.visible = false;
    this.runner.visible = true;
    this._syncRunner(0);
  }

  /** Lay the ribs out round the ring — bearings, order, the static instance data. */
  _layout() {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(3, Math.min(MAX_RIBS, Math.round(c.ribCount)));
    this._n = n;
    const rib = this.ribGeometry.attributes.aRib;
    for (let i = 0; i < n; i++) {
      const r = this.ribRecs[i];
      r.theta = this._rot + (i / n) * TAU + r.jitter * c.ribJitter * g.randomness * (Math.PI / n);
      // Rise order: round the ring in a sweep from the side facing the caster.
      r.order = i / n;
      for (let j = 0; j < STRANDS; j++) {
        const k = (i * STRANDS + j) * 4;
        rib.array[k] = r.theta;
        rib.array[k + 1] = r.seed;
        rib.array[k + 2] = j * Math.PI;
        rib.array[k + 3] = i;
      }
    }
    rib.needsUpdate = true;
    this.ribGeometry.instanceCount = n * STRANDS;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.leaves, c.colorLeafA, c.colorLeafB, c.colorLeafC, c.colorLeafD, 1, 0.8);
    this.leaves.uniforms.uGravity.value.set(0, -c.leafFall, 0);
    syncSystem(this.soil, c.colorSoilChipA, c.colorSoilChipB, c.colorSoilChipC, c.colorSoilChipD, 1, 0.05);
    this.soil.uniforms.uGravity.value.set(0, -9, 0);
    syncSystem(this.petals, c.colorPetalA, c.colorPetalB, c.colorPetalC, c.colorPetalD, c.petalGlow * g.glow, 0.7);
    this.petals.uniforms.uGravity.value.set(0, -c.petalFall, 0);
    syncSystem(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteGlow * g.glow, 0.6);
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
  }

  _syncRunner(fade) {
    const c = settings[ID];
    const start = Math.max(0, c.runnerStart);
    _runnerState.start.copy(this.origin).addScaledVector(this.direction, start).setY(0);
    _runnerState.dir.copy(this.direction);
    _runnerState.side.copy(this.side);
    _runnerState.length = Math.max(0.1, this.length - start + 0.2);
    _runnerState.front = this.front - start;
    _runnerState.fade = fade;
    _runnerState.seed = this._seed;
    this.runnerMaterial.userData.sync(_runnerState);
  }

  /** Grow, close and wither every rib; place every thorn; drive the floor and the shaft. */
  _updateVault(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._layout();
    const n = this._n;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const fd = this.fadeDuration;
    const riseT = Math.max(0.05, c.riseTime);
    this.pointAt(1, _centre);

    /* --- the close: an open sheaf bending over into the arch --- */
    const closeK = clock < 0 ? 0 : saturate((clock - this._closeAt()) / Math.max(0.05, c.closeTime));
    let close = 0;
    if (closeK > 0) {
      const o = Math.max(0, c.closeOvershoot) * 2.6;
      const t = closeK - 1;
      close = 1 + (o + 1) * t * t * t + o * t * t;
    }
    if (fading) close = lerp(close, c.witherOpen, smoothstep(0, 0.6, ft / Math.max(0.05, fd)));
    this._close = close;

    /* --- the seal --- */
    if (!this._sealed && closeK >= saturate(c.sealAt) && clock >= 0) {
      this._sealed = true;
      this._sealTime = clock;
      this._seal();
    }
    const sinceSeal = this._sealed ? (fading ? this.impactDuration + ft : clock) - this._sealTime : -1;
    const sealFlash = sinceSeal >= 0 ? Math.exp(-sinceSeal * 5) : 0;

    /* --- each rib --- */
    const grow = this.ribGeometry.attributes.aGrow;
    let rising = 0;
    for (let i = 0; i < n; i++) {
      const r = this.ribRecs[i];
      const start = this._riseStart(r);
      const k = clock < 0 ? 0 : saturate((clock - start) / riseT);
      let gv = Easing.outCubic(k);
      let wither = 0;
      if (fading) {
        const wStart = Math.max(0, c.witherStagger) * g.lifetime * lerp(1 - r.order, r.wDice, saturate(c.riseShuffle * g.randomness));
        const wk = saturate((ft - wStart) / Math.max(0.1, c.witherTime * g.lifetime));
        wither = saturate(ft / Math.max(0.05, fd * 0.45));
        gv *= 1 - Easing.inCubic(wk);
      }
      if (k > 0 && !r.broke) {
        r.broke = true;
        r.flash = 1;
        this._breakFx(r);
      }
      r.flash = Math.max(0, r.flash - dt * 4);
      if (k > 0 && k < 1) rising++;
      r.grow = gv;
      r.wither = wither;
      for (let j = 0; j < STRANDS; j++) {
        const q = (i * STRANDS + j) * 4;
        grow.array[q] = gv;
        grow.array[q + 1] = wither;
        grow.array[q + 2] = r.flash;
        grow.array[q + 3] = 0;
      }
    }
    grow.needsUpdate = true;

    _ribState.centre.copy(_centre);
    _ribState.close = close;
    _ribState.seal = sealFlash * c.sealGlow;
    this.ribMaterial.userData.sync(_ribState);
    this.ribs.visible = clock >= 0;

    /* --- the thorns --- */
    this._placeThorns(fading ? smoothstep(0, 0.5, ft / Math.max(0.05, fd)) : 0, sealFlash);

    /* --- the floor --- */
    const soil = clock < 0 ? 0 : smoothstep(0, riseT * 0.6, clock);
    let light = this._sealed ? smoothstep(0, Math.max(0.05, c.lightRise), sinceSeal) : 0;
    let erode = 0;
    if (fading) {
      light *= 1 - smoothstep(0, 0.55, ft / Math.max(0.05, fd));
      erode = smoothstep(0.45, 1, ft / Math.max(0.05, fd));
    }
    light *= 1 + sealFlash * 0.8;
    _floorState.centre.copy(_centre);
    _floorState.ribs = n;
    _floorState.rot = this._rot;
    _floorState.seed = this._seed;
    _floorState.soil = soil;
    _floorState.light = light * c.windowLight;
    _floorState.erode = erode;
    this.floorMaterial.userData.sync(_floorState);
    this.floor.visible = clock >= 0;

    _shaftState.centre.copy(_centre);
    _shaftState.light = light;
    _shaftState.seed = this._seed;
    this.shaftMaterial.userData.sync(_shaftState);
    this.shaft.visible = light > 0.002;

    _warpState.centre.copy(_centre);
    _warpState.strength = sealFlash;
    _warpState.seed = this._seed;
    this.warpMaterial.userData.sync(_warpState);
    this.warp.visible = sealFlash > 0.01;

    /* --- the runner, its job done, erodes --- */
    this._syncRunner(clock < 0 ? 0 : saturate((fading ? this.impactDuration + ft : clock) / Math.max(0.1, c.runnerLinger * g.lifetime)));
    this.runner.visible = _runnerState.fade < 1;

    /* --- rumble while the ribs climb --- */
    if (dt > 0 && rising > 0) this.ctx.shake.rumble(c.riseRumble * Math.min(1, (rising / n) * 3), dt);

    if (dt > 0 && clock >= 0) this._vaultFx(dt, light, fading ? ft / Math.max(0.05, fd) : 0);
  }

  /** Every thorn: its rib, its strand, where along it, which way round — popped out once the grow front passes it. */
  _placeThorns(dry, sealFlash) {
    const c = settings[ID];
    const g = settings.global;
    const n = this._n;
    const per = Math.max(0, Math.min(MAX_THORNS_PER, Math.round(c.thornsPerStrand)));
    const state = this.thornState.array;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const r = this.ribRecs[i];
      for (let j = 0; j < STRANDS; j++) {
        for (let t = 0; t < per; t++, k++) {
          const tr = this.thornRecs[(i * STRANDS + j) * MAX_THORNS_PER + t];
          // Spread along the strand, kept off the buried root and the apex.
          const s = lerp(0.08, 0.94, (t + 0.5 + (tr.sDice - 0.5) * 0.8 * g.randomness) / per);
          const pop = saturate((r.grow - s) / 0.06);
          const scale = c.thornLength * lerp(0.6, 1.25, tr.lDice) * Easing.outBack(pop) * (1 - dry * c.thornShrink);
          if (scale <= 0.002) {
            this.thorns.setMatrixAt(k, _zero);
            continue;
          }
          this._strandPoint(s, r, j, _pos);
          // Out from the stem, hooked back toward the root.
          const phi = tr.aDice * TAU;
          _out.copy(_side).multiplyScalar(Math.cos(phi)).addScaledVector(_n2, Math.sin(phi));
          _by.copy(_out).addScaledVector(_tg, -c.thornHook).normalize();
          _bx.copy(_tg).negate().addScaledVector(_by, _tg.dot(_by)).normalize();
          _bz.crossVectors(_bx, _by);
          const stem = lerp(c.rootRadius, c.tipRadius, Math.pow(s, 0.8));
          _pos.addScaledVector(_out, stem * 0.55);
          _m.makeBasis(_bx.multiplyScalar(scale), _by.multiplyScalar(scale), _bz.multiplyScalar(scale * 0.8));
          _m.setPosition(_pos);
          this.thorns.setMatrixAt(k, _m);
          state[k * 2] = tr.tDice;
          state[k * 2 + 1] = sealFlash * 2 + 0.25;
        }
      }
    }
    for (let q = k; q < this.thorns.count; q++) this.thorns.setMatrixAt(q, _zero);
    this.thorns.count = k;
    this.thorns.instanceMatrix.needsUpdate = true;
    this.thornState.needsUpdate = true;
    _thornState.dry = dry;
    this.thornMaterial.userData.sync(_thornState);
    this.thorns.visible = k > 0 && this._clock >= 0;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** A rib breaking the floor: soil and leaves thrown up off its root. */
  _breakFx(r) {
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.zoneRadius * c.ribInset);
    resetEmit(frame.uTime.value);
    _pos.set(_centre.x + Math.cos(r.theta) * R, 0.1, _centre.z + Math.sin(r.theta) * R);
    _emit.position = _pos;
    _emit.radius = 0.35;
    _emit.direction = _up;
    _emit.speed = c.soilSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.size = c.soilSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.soilLife;
    _emit.spin = 8;
    this.soil.emit(Math.round(c.soilPerRib * g.particleCount), _emit);
    _emit.speed = c.leafSpeed;
    _emit.size = c.leafSize;
    _emit.life = c.leafLife;
    _emit.spin = 4;
    this.leaves.emit(Math.round(c.soilPerRib * 0.5 * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.CRACK, _pos, {
      radius: c.rootCrackRadius,
      life: this.impactDuration + this.fadeDuration * 0.6,
      intensity: 0.8,
      colorA: getColor(c.colorRootCrack),
      colorB: getColor(c.colorGrowTip),
      width: 0.08,
      height: 0.02
    });
    this.ctx.shake.add(c.ribShake * g.explosionIntensity, 9, 22);
  }

  /** The vault seals: the beat, and the briar closing on whoever is inside. */
  _seal() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const apex = Math.max(c.springHeight + 0.2, c.apexHeight);
    const R = Math.max(0.3, c.zoneRadius * c.ribInset);

    this.ctx.shake.add(c.sealShake * power, 1 / Math.max(0.05, c.sealShakeTime), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.sealFlash * power);
    this.lightBoost = c.lightIntensity * c.sealLight * power;

    _pos.copy(_centre).setY(apex);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.sealBurst * power,
      life: 0.6,
      intensity: 1.4,
      opacity: 0.7 * g.opacity,
      squash: 0.6,
      colorA: getColor(c.colorShaftHigh),
      colorB: getColor(c.colorSap),
      colorC: getColor(c.colorLeafC)
    });
    _pos.copy(_centre).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: R * 1.4 * power,
      life: 0.7,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorSap),
      colorB: getColor(c.colorShaftLow),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: R * 1.1,
      life: 1.4,
      intensity: 0.7,
      colorA: getColor(c.colorSoilChipB),
      colorB: getColor(c.colorSoilChipC),
      growth: 0.25,
      height: 0.025
    });

    /* the leaves shaken off the closing apex */
    resetEmit(frame.uTime.value);
    _pos.copy(_centre).setY(apex * 0.95);
    _emit.position = _pos;
    _emit.radius = 0.8;
    _emit.direction = _up;
    _emit.speed = c.leafSpeed * 1.6;
    _emit.spread = 1.2;
    _emit.size = c.leafSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.leafLife * 1.4;
    _emit.spin = 5;
    this.leaves.emit(Math.round(c.sealLeaves * g.particleCount), _emit);

    this._closeOn(R, power);
  }

  /** Bodies inside are pressed down and in, toward the altar. */
  _closeOn(R, power) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const found = field.findTargets(_centre.x, _centre.z, R * Math.max(0.1, c.hitReach), this._found);
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    for (let f = 0; f < found.length; f++) {
      const d = found[f];
      _dir.set(_centre.x - d.position.x, 0, _centre.z - d.position.z);
      if (_dir.lengthSq() < 1e-4) _dir.set(this.direction.x, 0, this.direction.z);
      _dir.normalize();
      d.kill(_dir.x, _dir.z, this._force);
    }
    this._found.length = 0;
  }

  /** Leaves off the growing tips, motes and petals in the shaft, leaves falling at the wither. */
  _vaultFx(dt, light, fadeK) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const n = this._n;
    const apex = Math.max(c.springHeight + 0.2, c.apexHeight);
    const R = Math.max(0.3, c.zoneRadius * c.ribInset);

    // Off whichever tips are still climbing.
    let climbing = 0;
    for (let i = 0; i < n; i++) if (this.ribRecs[i].grow > 0.01 && this.ribRecs[i].grow < 0.99 && fadeK === 0) climbing++;
    const tips = Math.round(this.tipEmitter.tick(dt, c.tipLeaves * climbing) * g.particleCount);
    if (tips > 0) {
      resetEmit(time);
      _emit.speed = c.leafSpeed;
      _emit.spread = 1;
      _emit.size = c.leafSize;
      _emit.life = c.leafLife;
      _emit.spin = 4;
      for (let q = 0; q < tips; q++) {
        const r = this.ribRecs[(Math.random() * n) | 0];
        if (r.grow <= 0.01 || r.grow >= 0.99) continue;
        this._strandPoint(r.grow, r, (Math.random() * STRANDS) | 0, _pos);
        _emit.position = _pos;
        _emit.direction = _tg;
        this.leaves.emit(1, _emit);
      }
    }

    // Dust motes hanging in the light, rose petals drifting down through it.
    const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate * light) * g.particleCount);
    if (motes > 0) {
      resetEmit(time);
      _emit.radius = 0;
      _emit.direction = _up;
      _emit.speed = 0.2;
      _emit.spread = 1;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.lifeVariance = 0.5;
      for (let q = 0; q < motes; q++) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * R * c.shaftSpread * 0.8;
        _pos.set(_centre.x + Math.cos(a) * rr, Math.random() * apex * 0.8, _centre.z + Math.sin(a) * rr);
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    }
    const petals = Math.round(this.petalEmitter.tick(dt, c.petalRate * light) * g.particleCount);
    if (petals > 0) {
      resetEmit(time);
      _emit.direction = _up;
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.size = c.petalSize;
      _emit.sizeVariance = 0.4;
      _emit.life = c.petalLife;
      _emit.spin = 3;
      for (let q = 0; q < petals; q++) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * R * 0.5;
        _pos.set(_centre.x + Math.cos(a) * rr, apex * lerp(0.7, 0.95, Math.random()), _centre.z + Math.sin(a) * rr);
        _emit.position = _pos;
        this.petals.emit(1, _emit);
      }
    }

    // The wither: dead leaves dropping off the ribs.
    if (fadeK > 0) {
      const drops = Math.round(this.dropEmitter.tick(dt, c.witherLeaves * (1 - fadeK)) * g.particleCount);
      if (drops > 0) {
        resetEmit(time);
        _emit.direction = _up;
        _emit.speed = 0.4;
        _emit.spread = 1;
        _emit.size = c.leafSize;
        _emit.life = c.leafLife * 1.3;
        _emit.spin = 4;
        _emit.tint = getColor(c.colorDry);
        for (let q = 0; q < drops; q++) {
          const r = this.ribRecs[(Math.random() * n) | 0];
          if (r.grow < 0.05) continue;
          this._strandPoint(Math.random() * r.grow, r, (Math.random() * STRANDS) | 0, _pos);
          _emit.position = _pos;
          this.leaves.emit(1, _emit);
        }
        _emit.tint = null;
      }
    }
  }

  /** The bramble running out to the circle: leaves and soil kicked off its front. */
  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const count = Math.round(this.runEmitter.tick(dt, c.runnerDebris) * g.particleCount);
    if (count <= 0) return;
    resetEmit(frame.uTime.value);
    _pos.copy(this.position).setY(0.08);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.soilSpeed * 0.45;
    _emit.spread = 0.8;
    _emit.size = c.soilSize * 0.8;
    _emit.life = c.soilLife * 0.6;
    _emit.spin = 6;
    this.soil.emit(count, _emit);
    _emit.speed = c.leafSpeed * 0.6;
    _emit.size = c.leafSize * 0.8;
    _emit.life = c.leafLife * 0.7;
    _emit.spin = 3;
    this.leaves.emit(Math.max(1, Math.round(count * 0.6)), _emit);
    this.ctx.shake.rumble(c.travelRumble, dt);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._sync();
    this._syncRunner(0);
    this._travelFx(dt);
    this.position.y = 0.4;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this._clock = 0;
    this.pointAt(1, _centre);
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius * 0.9,
      life: 1.2,
      intensity: 0.6,
      colorA: getColor(c.colorSoilChipB),
      colorB: getColor(c.colorSoilChipC),
      growth: 0.4,
      height: 0.02
    });
    this.ctx.shake.add(c.ribShake * 1.5 * g.explosionIntensity, 6, 18);
    this.lightBoost = c.lightIntensity * 0.5;
    this._sync();
    this._updateVault(0);
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._sync();
    this._updateVault(dt);
    const apex = Math.max(c.springHeight + 0.2, c.apexHeight);
    this.position.set(_centre.x, this._sealed ? apex * c.lightHeight : 1, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this.ribGeometry.instanceCount = 0;
    this.thorns.count = 0;
    this.ribs.visible = false;
    this.thorns.visible = false;
    this.floor.visible = false;
    this.shaft.visible = false;
    this.warp.visible = false;
    this.runner.visible = false;
  }

  dispose() {
    this.ribGeometry.dispose();
    this.thornGeometry.dispose();
    this.floorGeometry.dispose();
    this.shaftGeometry.dispose();
    this.runnerGeometry.dispose();
    this.ribMaterial.userData.depth.dispose();
    this.ribMaterial.dispose();
    this.thornMaterial.dispose();
    this.floorMaterial.dispose();
    this.shaftMaterial.dispose();
    this.warpMaterial.dispose();
    this.runnerMaterial.dispose();
    this.thorns.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛪  Briar Cathedral');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'runner speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'riseStagger', 0, 2, 0.01, 'ribs rise round the ring over (s)');
  R(time, c, 'riseShuffle', 0, 1, 0.01, 'sweep ↔ random order');
  R(time, c, 'riseTime', 0.05, 3, 0.01, 'one rib climbs over (s)');
  R(time, c, 'closeLead', 0, 1.5, 0.01, 'closes after (× climb)');
  R(time, c, 'closeTime', 0.05, 2, 0.01, 'closes over (s)');
  R(time, c, 'closeOvershoot', 0, 1, 0.01, 'close overshoot');
  R(time, c, 'sealAt', 0, 1, 0.01, 'seals at close fraction');
  R(time, c, 'lifetime', 0.1, 10, 0.05, 'stands for (s)');
  R(time, c, 'witherStagger', 0, 2, 0.01, 'withers round the ring over (s)');
  R(time, c, 'witherTime', 0.1, 4, 0.05, 'one rib draws back over (s)');
  R(time, c, 'witherOpen', 0, 1, 0.01, 'close left as it withers');

  const shape = folder.addFolder('1 · Ribs');
  R(shape, c, 'ribCount', 3, MAX_RIBS, 1, 'ribs');
  R(shape, c, 'ribInset', 0.4, 1.2, 0.01, 'rim (× circle radius)');
  R(shape, c, 'ribJitter', 0, 1, 0.01, 'bearing jitter');
  R(shape, c, 'springHeight', 0, 6, 0.05, 'springing line (m)');
  R(shape, c, 'apexHeight', 1, 14, 0.05, 'apex (m)');
  R(shape, c, 'apexGap', -1, 1.5, 0.01, 'gap at the apex (m)');
  R(shape, c, 'archPoint', 0, 1, 0.01, 'round ↔ pointed arch');
  R(shape, c, 'openLean', -2, 4, 0.01, 'open sheaf leans out (m)');
  R(shape, c, 'ribSway', 0, 1.5, 0.01, 'sideways sway (m)');
  R(shape, c, 'strandSpread', 0, 0.6, 0.005, 'strands apart (m)');
  R(shape, c, 'strandTwist', 0, 10, 0.05, 'strand twists');
  R(shape, c, 'rootRadius', 0.01, 0.5, 0.005, 'stem at the root (m)');
  R(shape, c, 'tipRadius', 0.005, 0.3, 0.005, 'stem at the apex (m)');
  R(shape, c, 'tipTaper', 0.005, 0.3, 0.005, 'grow tip taper');
  R(shape, c, 'knots', 0, 1.5, 0.01, 'knots');
  R(shape, c, 'barkBump', 0, 2, 0.01, 'bark relief');

  const bark = shape.addFolder('Bark & sap');
  bark.addColor(c, 'colorBark').name('bark');
  bark.addColor(c, 'colorBarkLight').name('bark, pale');
  bark.addColor(c, 'colorRibRim').name('rim');
  bark.addColor(c, 'colorSap').name('sap');
  bark.addColor(c, 'colorGrowTip').name('growing tip');
  bark.addColor(c, 'colorDry').name('withered');
  R(bark, c, 'barkRidges', 1, 20, 1, 'ridges');
  R(bark, c, 'ribAmbient', 0, 1.5, 0.01, 'ambient');
  R(bark, c, 'ribDiffuse', 0, 2, 0.01, 'diffuse');
  R(bark, c, 'ribRimGlow', 0, 4, 0.01, 'rim glow');
  R(bark, c, 'ribRimPower', 0.5, 8, 0.05, 'rim tightness');
  R(bark, c, 'sapGlow', 0, 10, 0.05, 'sap glow');
  R(bark, c, 'sapSpeed', 0, 4, 0.01, 'sap climbs (×/s)');
  R(bark, c, 'sapWidth', 0.01, 0.5, 0.005, 'sap vein width');
  R(bark, c, 'growTipGlow', 0, 15, 0.05, 'growing tip glow');
  R(bark, c, 'sealGlow', 0, 4, 0.01, 'flare on the seal');

  const thorns = folder.addFolder('2 · Thorns');
  R(thorns, c, 'thornsPerStrand', 0, MAX_THORNS_PER, 1, 'per strand');
  R(thorns, c, 'thornLength', 0.02, 1, 0.005, 'length (m)');
  R(thorns, c, 'thornHook', -1, 1.5, 0.01, 'hook back');
  R(thorns, c, 'thornShrink', 0, 1, 0.01, 'shrink as it withers');
  R(thorns, c, 'thornGloss', 2, 200, 1, 'gloss');
  R(thorns, c, 'thornSpecular', 0, 3, 0.01, 'specular');
  R(thorns, c, 'thornGlint', 0, 8, 0.05, 'point glint');
  thorns.addColor(c, 'colorThornBase').name('base');
  thorns.addColor(c, 'colorThornMid').name('body');
  thorns.addColor(c, 'colorThornPoint').name('point');
  thorns.addColor(c, 'colorThornGlint').name('glint');

  const floor = folder.addFolder('3 · Rose window');
  R(floor, c, 'windowLight', 0, 2, 0.01, 'light');
  R(floor, c, 'lightRise', 0.05, 3, 0.01, 'brightens over (s)');
  R(floor, c, 'windowScale', 0.3, 1.2, 0.01, 'window (× rim)');
  R(floor, c, 'glassGlow', 0, 8, 0.05, 'glass glow');
  R(floor, c, 'glassDapple', 0, 1, 0.01, 'dapple');
  R(floor, c, 'leadWidth', 0.01, 0.4, 0.005, 'tracery width (m)');
  R(floor, c, 'soilWidth', 0.05, 2, 0.01, 'torn rim (m)');
  R(floor, c, 'rootCracks', 0, 1, 0.01, 'root cracks');
  R(floor, c, 'rootCrackRadius', 0, 3, 0.05, 'crack decal per rib (m)');
  floor.addColor(c, 'colorSoil').name('soil');
  floor.addColor(c, 'colorRootCrack').name('root crack');
  floor.addColor(c, 'colorLead').name('tracery');
  Editor.gradient(floor, c, 'colorGlass', 'stained glass');

  const shaft = folder.addFolder('4 · Shaft & seal');
  R(shaft, c, 'shaftOpacity', 0, 2, 0.01, 'shaft opacity');
  R(shaft, c, 'shaftGlow', 0, 8, 0.05, 'shaft glow');
  R(shaft, c, 'shaftSpread', 0.1, 1.2, 0.01, 'floor spread (× rim)');
  R(shaft, c, 'shaftTop', 0.05, 2, 0.01, 'top radius (m)');
  R(shaft, c, 'shaftRays', 2, 40, 1, 'rays');
  R(shaft, c, 'shaftDrift', 0, 2, 0.01, 'dust drift');
  shaft.addColor(c, 'colorShaftLow').name('shaft, floor');
  shaft.addColor(c, 'colorShaftHigh').name('shaft, apex');
  R(shaft, c, 'sealWarp', 0, 3, 0.01, 'seal distortion');
  R(shaft, c, 'warpScale', 0.1, 6, 0.05, 'distortion scale');
  R(shaft, c, 'sealShake', 0, 1.5, 0.01, 'seal jolt');
  R(shaft, c, 'sealShakeTime', 0.05, 2, 0.01, 'jolt lasts (s)');
  R(shaft, c, 'sealFlash', 0, 1, 0.01, 'flash');
  R(shaft, c, 'sealLight', 0, 8, 0.05, 'light punch (× intensity)');
  R(shaft, c, 'sealBurst', 0, 10, 0.05, 'air shell (m)');
  R(shaft, c, 'sealLeaves', 0, 300, 1, 'leaves shaken off');
  R(shaft, c, 'ribShake', 0, 1, 0.01, 'jolt per rib');
  R(shaft, c, 'riseRumble', 0, 1, 0.01, 'rumble as they climb');
  shaft.addColor(c, 'colorFlash').name('flash');

  const run = folder.addFolder('5 · Runner');
  R(run, c, 'runnerStart', 0, 4, 0.01, 'starts after (m)');
  R(run, c, 'runnerWidth', 0.05, 2, 0.01, 'heave half-width (m)');
  R(run, c, 'runnerWave', 0, 1, 0.005, 'twine (m)');
  R(run, c, 'runnerWaveLength', 0.2, 6, 0.05, 'twine length (m)');
  R(run, c, 'runnerLine', 0.01, 0.3, 0.005, 'root width (m)');
  R(run, c, 'runnerGlow', 0, 8, 0.05, 'glow');
  R(run, c, 'runnerLinger', 0.1, 6, 0.05, 'erodes over (s)');
  R(run, c, 'runnerDebris', 0, 200, 1, 'debris / s');
  R(run, c, 'travelRumble', 0, 1, 0.01, 'rumble');

  const fx = folder.addFolder('6 · Leaves, soil, petals, motes');
  R(fx, c, 'tipLeaves', 0, 60, 0.5, 'leaves / s per climbing tip');
  R(fx, c, 'witherLeaves', 0, 400, 1, 'dead leaves / s');
  R(fx, c, 'leafSize', 0.02, 0.6, 0.005, 'leaf size');
  R(fx, c, 'leafSpeed', 0, 10, 0.05, 'leaf speed');
  R(fx, c, 'leafLife', 0.1, 5, 0.05, 'leaf lifetime');
  R(fx, c, 'leafFall', 0, 6, 0.05, 'leaf fall (m/s²)');
  Editor.gradient(fx, c, 'colorLeaf', 'leaf colour');
  R(fx, c, 'soilPerRib', 0, 60, 1, 'soil per rib');
  R(fx, c, 'soilSize', 0.01, 0.4, 0.005, 'soil size');
  R(fx, c, 'soilSpeed', 0, 15, 0.1, 'soil speed');
  R(fx, c, 'soilLife', 0.1, 4, 0.05, 'soil lifetime');
  Editor.gradient(fx, c, 'colorSoilChip', 'soil colour');
  R(fx, c, 'petalRate', 0, 200, 1, 'petals / s');
  R(fx, c, 'petalSize', 0.02, 0.5, 0.005, 'petal size');
  R(fx, c, 'petalLife', 0.2, 8, 0.05, 'petal lifetime');
  R(fx, c, 'petalFall', 0, 4, 0.05, 'petal fall (m/s²)');
  R(fx, c, 'petalGlow', 0, 4, 0.05, 'petal glow');
  Editor.gradient(fx, c, 'colorPetal', 'petal colour');
  R(fx, c, 'moteRate', 0, 400, 1, 'motes / s');
  R(fx, c, 'moteSize', 0.01, 0.3, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.2, 6, 0.05, 'mote lifetime');
  R(fx, c, 'moteRise', -2, 2, 0.01, 'mote rise');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote colour');

  const hit = folder.addFolder('7 · Bodies');
  R(hit, c, 'hitReach', 0.1, 1.5, 0.01, 'reach (× rim)');
  R(hit, c, 'hitImpulse', 0, 15, 0.1, 'pressed inward (m/s)');
  R(hit, c, 'hitLift', 0, 10, 0.05, 'lift (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'tumble');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 1, 0.01, 'height (× apex)');

  folder.close();
  return folder;
}
