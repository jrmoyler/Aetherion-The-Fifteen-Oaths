import { InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  BLOODROOT_MAX_ROOTS,
  BLOODROOT_RUNNER,
  createBloodrootFieldMaterial,
  createBloodrootRootMaterial,
  createBloodrootThornMaterial,
  rootPathAt
} from '../../materials/matrix-new/BloodrootThornsMaterials.js';
import { createRootTubeGeometry, createThornVineGeometry } from '../../assets/matrix-new/BloodrootThornsGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'bloodroot';

const TAU = Math.PI * 2;

/** Primary roots the editor allows, and branches per root. 10 × (1 + 2) = 30. */
const MAX_PRIMARY = 10;
const MAX_BRANCHES = 2;
/** Hard ceiling on thicket vines. The editor's count slider clamps to this. */
const MAX_THORNS = 144;
/** Vines that can burst up in the runner's wake (records after the thicket's). */
const MAX_TRAIL = 24;
const TOTAL_THORNS = MAX_THORNS + MAX_TRAIL;
const VARIANTS = 3;
const SLOTS = TOTAL_THORNS / VARIANTS;
/** Bodies one thicket can drain at once. */
const MAX_VICTIMS = 8;

const _emit = {};
const _pos = new Vector3();
const _floor = new Vector3();
const _heart = new Vector3();
const _dir = new Vector3();
const _axis = new Vector3();
const _at = new Vector3();
const _up = new Vector3(0, 1, 0);
const _p = { x: 0, z: 0 };
const _q = { x: 0, z: 0 };
const _node = new Object3D();
const _tilt = new Quaternion();
const _spin = new Quaternion();
const _used = new Int32Array(VARIANTS);

/**
 * BLOODROOT THORNS — roots race out across the floor, a thicket of thorny vines
 * bursts up along them, and whatever stands in it is drained into the heart.
 *
 * **Anticipation and travel.** The floor cracks at the caster's feet and a
 * *runner* — a real root, the 31st in the table, pinned so it lands exactly on
 * the circle — crawls out across the floor behind the burrowing seed, its tip
 * white-hot, throwing soil, with a wake of short thorns bursting up a beat
 * after the tip passes. It stays for the whole cast: the path is on the floor.
 *
 * Where the seed surfaces, the thicket grows on one clock:
 *
 *   1. **the roots** — primaries race outward from the impact, each forking
 *      into side branches as its growth front passes the fork. They are real
 *      geometry: one merged mesh of tubes, every root's noisy path evaluated in
 *      the vertex stage from a uniform table (`BloodrootThornsMaterials`) and
 *      the identical function evaluated on the CPU to plant the thorns. The
 *      wood is dark and wet, with crimson veins in its grooves that pulse —
 *      heartbeats travelling *outward* from the heart along every root — and a
 *      white-hot tip where it is still forcing its way through the stone.
 *      Each racing front throws soil as it goes.
 *   2. **the thicket** — instanced thorny vines (three silhouettes) burst up
 *      along the roots a beat after the front passes, so the thicket erupts in
 *      a wave that chases the roots outward; a crown of tall vines stands in
 *      the heart. Glossy dark red, a hard specular, a bright red rim, sap
 *      glowing in the barbs that pulses with the same heartbeat.
 *   3. **droplets & mist** — every vine flings blood as it breaks the floor,
 *      the standing vines drip, a low red mist hangs over the thicket.
 *   4. **the drain** — `handlesOwnHits`. Bodies inside the thicket are not
 *      killed on contact: they are *drained*. Each is stained (`Dummy#corrode`)
 *      while red motes stream out of it and arc into the heart; when it has
 *      been drained for `drainTime` it folds (`Dummy#kill`, toward the heart),
 *      and its husk goes on feeding the thicket until it is eaten
 *      (`Dummy#consume`). Each body that falls makes the heart flare.
 *   5. **beats** — a cracked floor and a burst of blood where the seed
 *      surfaces; a knock, a shockwave and a flash as the thicket bursts; a
 *      heartbeat in the light.
 *   6. **the soaked floor** (`createBloodrootFieldMaterial`) — a disc that
 *      soaks clotted black-red behind the racing fronts, with capillaries
 *      carrying the same heartbeat, drying brown-black as it withers. It is
 *      the deep stop of the ramp and it stays for the whole linger.
 *
 * **The drain beat (linger).** `rootDrainAfter` seconds after the seed
 * surfaces the heartbeat turns: the beats that ran *outward* along the roots
 * and the soak now run *inward* to the heart and back along the runner to the
 * caster, each vine swells (`thornThrob`) as a beat passes through it and the
 * whole thicket writhes (`thornSway`) — so the silhouette keeps moving while
 * it feeds, not only while it grows.
 *
 * Then it ends: the vines shrivel, go matte and dark, and sink back into the
 * floor; the roots darken to dead wood and sink after them; a dried stain is
 * handed to a SCORCH decal.
 *
 * ## The editor rule
 *
 * A root record stores dice (bearing, length, wander phases, fork position) and
 * a thorn record stores dice and one event flag (whether it has broken the
 * floor yet). Every metre and second — the reach, the wander, how far the
 * fronts have run, when each vine bursts — is resolved from
 * `settings.bloodroot` every frame, so dragging `rootWander` re-routes the
 * roots *and* the thorns standing on them.
 */
export class BloodrootThornsAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The thicket drains and chooses when a body falls. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let count = 0;
    for (const mesh of this.thornMeshes) count += mesh.count;
    return count + (this.roots.visible ? this._rootCount : 0);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the roots ---- */
    this.rootGeometry = createRootTubeGeometry(BLOODROOT_MAX_ROOTS, 40, 8);
    this.rootMaterial = createBloodrootRootMaterial();
    this.roots = new Mesh(this.rootGeometry, this.rootMaterial);
    this.roots.name = 'BloodrootRoots';
    // VFX, not WORLD: the vertex stage builds the tubes from a uniform table,
    // so the depth prepass's override material would rasterise nothing useful.
    // Opaque and depth-writing in the main pass all the same.
    this.roots.layers.set(LAYER.VFX);
    this.roots.renderOrder = 2;
    this.roots.frustumCulled = false;
    this.roots.visible = false;
    this.group.add(this.roots);

    /** Root records — dice, and the values resolved from them each frame. */
    this.rootRecords = [];
    for (let i = 0; i < BLOODROOT_MAX_ROOTS; i++) {
      this.rootRecords.push({
        // dice
        bearingDice: 0,
        lengthDice: 0,
        forkDice: 0,
        sideDice: 1,
        p1: 0,
        p2: 0,
        // resolved
        ox: 0,
        oz: 0,
        bearing: 0,
        length: 1,
        thickness: 0.1,
        grown: 0,
        forkDist: 0,
        delay: 0,
        wanderScale: 1,
        pin: 0,
        live: false
      });
    }
    this._rootCount = 0;
    this._maxLength = 1;

    /* ---- layer 2: the thicket ---- */
    this.thornMaterial = createBloodrootThornMaterial();
    this._shapeKey = '';
    this.thornMeshes = [];
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = new InstancedMesh(this._buildThorn(v), this.thornMaterial, SLOTS);
      mesh.name = `BloodrootThorns${v}`;
      // Solid and plain-vertex: in the depth prepass so the mist feathers
      // against it, and under the floor while it is still buried.
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.thornMeshes.push(mesh);
    }

    this.thorns = [];
    for (let i = 0; i < TOTAL_THORNS; i++) {
      this.thorns.push({ root: 0, s: 0, side: 0, height: 0, radius: 0, lean: 0, yaw: 0, jitter: 0, broke: false, passAge: -1 });
    }

    /* ---- layer 6: the soaked floor ---- */
    this.fieldMaterial = createBloodrootFieldMaterial();
    this.fieldGeometry = new PlaneGeometry(1, 1);
    this.field = new Mesh(this.fieldGeometry, this.fieldMaterial);
    this.field.name = 'BloodrootField';
    this.field.rotation.x = -Math.PI / 2;
    this.field.layers.set(LAYER.VFX);
    this.field.renderOrder = 1;
    this.field.frustumCulled = false;
    this.field.visible = false;
    this.group.add(this.field);
    this._fieldState = { radius: 1, front: 0, clock: 0, seed: 0, dead: 0, pulseSign: 1 };

    /** Per-cast state. A seed and clocks. */
    this._seed = 0;
    this._clock = 0; // seconds since the seed surfaced
    this._dry = 0; // 0..1 through the fade
    this._burstFired = false;
    this._stained = false;
    this._flare = 0;
    this._lastCrack = 0;

    this._victims = [];
    for (let i = 0; i < MAX_VICTIMS; i++) {
      this._victims.push({ dummy: null, exposure: 0, eaten: 0, killed: false, emitter: new RateEmitter() });
    }
    this._victimCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    this._rootState = { roots: this.rootRecords, count: 0, clock: 0, dead: 0, sink: 0, seed: 0, runner: true, pulseSign: 1 };
    this._thornState = { dead: 0, pulse: 0 };
  }

  /** One vine silhouette from the live shape settings. */
  _buildThorn(variant) {
    const c = settings.bloodroot;
    const aspect = Math.max(2, c.thornHeight / Math.max(0.01, c.thornRadius));
    const geometry = createThornVineGeometry({
      seed: 2.9 + variant * 4.7,
      sides: 9,
      rings: 22,
      curl: c.thornCurl * (0.6 + variant * 0.4),
      barbs: c.thornBarbs + (variant === 2 ? 1 : 0),
      barbLength: c.thornBarbLength,
      aspect
    });
    const seeds = new InstancedBufferAttribute(new Float32Array(SLOTS), 1);
    for (let i = 0; i < SLOTS; i++) seeds.array[i] = Math.random() * 10;
    geometry.setAttribute('aSeed', seeds);
    return geometry;
  }

  /** Rebuild the silhouettes only when a shape slider actually moved. */
  _syncGeometry() {
    const c = settings.bloodroot;
    const aspect = Math.round((c.thornHeight / Math.max(0.01, c.thornRadius)) * 2) / 2;
    const key = `${c.thornCurl}|${c.thornBarbs}|${c.thornBarbLength}|${aspect}`;
    if (key === this._shapeKey) return;
    const first = this._shapeKey === '';
    this._shapeKey = key;
    if (first) return;
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = this.thornMeshes[v];
      const old = mesh.geometry;
      mesh.geometry = this._buildThorn(v);
      old.dispose();
    }
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Blood: hard-edged beads with real gravity.
    this.drops = particles.get('bloodroot.drops', {
      capacity: 2000,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uDrag.value = 0.3;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uSizeIn.value = 0.04;
    this.drops.uniforms.uFadeIn.value = 0.03;
    this.drops.uniforms.uFadeOut.value = 0.3;
    this.drops.uniforms.uStretch.value = 0.12;
    this.drops.uniforms.uTurbulence.value = 0;

    // Low red mist. Non-additive: it stains the air.
    this.mist = particles.get('bloodroot.mist', {
      capacity: 700,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uDrag.value = 1.4;
    this.mist.uniforms.uEndSize.value = 1.6;
    this.mist.uniforms.uSizeIn.value = 0.3;
    this.mist.uniforms.uFadeIn.value = 0.3;
    this.mist.uniforms.uFadeOut.value = 0.45;

    // The drain: motes thrown on a ballistic arc that lands on the heart exactly
    // as they die. No drag and no turbulence — both would bend the arc off the
    // heart — and gravity is solved from `moteArc` every frame.
    this.motes = particles.get('bloodroot.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 0.001;
    this.motes.uniforms.uEndSize.value = 0.45;
    this.motes.uniforms.uSizeIn.value = 0.08;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.2;
    this.motes.uniforms.uTurbulence.value = 0;

    // Soil and splinters thrown by the burrowing seed and the racing fronts.
    this.soil = particles.get('bloodroot.soil', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.soil.uniforms.uDrag.value = 0.8;
    this.soil.uniforms.uEndSize.value = 0.7;
    this.soil.uniforms.uSizeIn.value = 0.03;
    this.soil.uniforms.uFadeIn.value = 0.02;
    this.soil.uniforms.uFadeOut.value = 0.35;
    this.soil.uniforms.uGravity.value.set(0, -9.8, 0);
    this.soil.uniforms.uTurbulence.value = 0;

    this.trailEmitter = new RateEmitter();
    this.frontEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.dripEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.2, settings.bloodroot.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.bloodroot.fadeTime * settings.global.lifetime);
  }

  /** A heartbeat: a double thump, then rest. */
  _heartbeat() {
    const c = settings.bloodroot;
    const phase = (this._clock * c.rootPulseRate * settings.global.animationSpeed) % 1;
    const lub = Math.exp(-Math.pow((phase - 0.05) / 0.05, 2));
    const dub = Math.exp(-Math.pow((phase - 0.22) / 0.06, 2)) * 0.6;
    return lub + dub;
  }

  lightShimmer() {
    return 0.75 + this._heartbeat() * 0.45 + this._flare * 0.8;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry — every metre from live settings                           */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.3, settings.bloodroot.zoneRadius);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** The front's ease, 0..1 → 0..1: from constant speed to a burst that slows. */
  _ease(x) {
    return lerp(x, Easing.outCubic(x), saturate(settings.bloodroot.rootGrowEase));
  }

  /** Metres the growth front has run from the heart at `time` seconds. */
  _front(time) {
    const c = settings.bloodroot;
    if (time <= 0) return 0;
    const grow = Math.max(0.02, c.rootGrowTime * settings.global.lifetime);
    return this._maxLength * this._ease(saturate(time / grow)) + Math.max(0, time - grow) * 1e3;
  }

  /** When the front passes `dist` metres from the heart, seconds — the inverse of `_front`. */
  _passTime(dist) {
    const c = settings.bloodroot;
    const grow = Math.max(0.02, c.rootGrowTime * settings.global.lifetime);
    const target = saturate(dist / Math.max(1e-3, this._maxLength));
    if (target <= 0) return 0;
    // Bisection: the ease is monotonic. Twelve steps is well under a frame's error.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) * 0.5;
      if (this._ease(mid) < target) lo = mid;
      else hi = mid;
    }
    return hi * grow;
  }

  /** Lay every root out from its dice and the clock. */
  _layoutRoots() {
    const c = settings.bloodroot;
    const g = settings.global;
    const R = this.radius;
    const primaries = Math.max(1, Math.min(MAX_PRIMARY, Math.round(c.rootCount)));
    const branches = Math.max(0, Math.min(MAX_BRANCHES, Math.round(c.rootBranches)));
    const reach = R * c.rootReach;
    const clock = this.phase === AbilityPhase.TRAVEL ? 0 : this._clock;

    this._maxLength = Math.max(0.1, reach);

    let n = 0;
    for (let i = 0; i < primaries; i++) {
      const r = this.rootRecords[n++];
      r.bearing = ((i + 0.5 + (r.bearingDice - 0.5) * 0.7 * g.randomness) / primaries) * TAU + this._seed;
      r.length = reach * (1 - r.lengthDice * c.rootLengthJitter * g.randomness);
      r.thickness = c.rootThickness * (0.85 + 0.3 * r.lengthDice);
      r.ox = 0;
      r.oz = 0;
      r.forkDist = 0;
      r.delay = 0;
      r.grown = Math.min(r.length, this._front(clock));
      r.live = true;
    }
    for (let i = 0; i < primaries; i++) {
      const parent = this.rootRecords[i];
      for (let b = 0; b < branches; b++) {
        const r = this.rootRecords[n++];
        const forkS = saturate(c.branchStart + r.forkDice * (1 - c.branchStart) * 0.7);
        rootPathAt(parent, forkS, c.rootWander * g.randomness, c.rootWanderFreq * g.noiseFrequency, _p);
        rootPathAt(parent, Math.min(1, forkS + 0.02), c.rootWander * g.randomness, c.rootWanderFreq * g.noiseFrequency, _q);
        const along = Math.atan2(_q.z - _p.z, _q.x - _p.x);
        r.ox = _p.x;
        r.oz = _p.z;
        r.bearing = along + r.sideDice * c.branchAngle * (0.75 + 0.5 * r.bearingDice);
        r.length = parent.length * c.branchLength * (0.7 + 0.3 * r.lengthDice);
        r.thickness = parent.thickness * lerp(1, 1 - c.rootTaper, forkS) * c.branchThickness;
        r.forkDist = forkS * parent.length;
        r.delay = c.branchDelay * g.lifetime;
        // A branch's front runs on the same network clock as its parent's,
        // `delay` behind it: it sets off from the fork once the parent's front
        // has passed it, and the thorns along it read the same schedule.
        r.grown = Math.max(0, Math.min(r.length, this._front(clock - r.delay) - r.forkDist));
        r.live = true;
      }
    }
    for (let i = n; i < BLOODROOT_MAX_ROOTS; i++) this.rootRecords[i].live = false;
    this._rootCount = n;

    // The runner: from the caster's feet to the heart, pinned at both ends,
    // grown as far as the seed has burrowed. Its network distance runs from
    // −length (the caster) to 0 (the heart), so the drain's inward beats run
    // on along it back to the caster.
    const run = this.rootRecords[BLOODROOT_RUNNER];
    this._floorPoint(_floor);
    const ox = this.origin.x - _floor.x;
    const oz = this.origin.z - _floor.z;
    const L = Math.hypot(ox, oz);
    run.ox = ox;
    run.oz = oz;
    run.bearing = Math.atan2(-oz, -ox);
    run.length = Math.max(0.1, L);
    run.thickness = c.rootThickness * c.runnerThickness;
    run.wanderScale = c.runnerWander;
    run.pin = 1;
    run.forkDist = -run.length;
    run.delay = 0;
    run.grown = this.phase === AbilityPhase.TRAVEL ? Math.min(run.length, this.front) : run.length;
    run.live = L > 0.3 && c.runnerThickness > 0;
  }

  /** The drain's direction: +1 beats run outward (growing), −1 inward (feeding). */
  get _pulseSign() {
    const c = settings.bloodroot;
    return this.phase !== AbilityPhase.TRAVEL && this._clock >= c.rootDrainAfter * settings.global.lifetime ? -1 : 1;
  }

  /** The heartbeat (lub-dub) as it passes `dist` metres from the heart. */
  _beatAt(dist) {
    const c = settings.bloodroot;
    const rate = c.rootPulseRate * settings.global.animationSpeed;
    const sign = this._pulseSign;
    const t = this._clock - (sign * dist) / Math.max(0.1, c.rootPulseSpeed);
    const phase = t * rate - Math.floor(t * rate);
    return Math.exp(-Math.pow((phase - 0.05) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((phase - 0.22) / 0.06, 2));
  }

  /** Where a vine stands, in metres from the heart; writes `_p`. Returns network distance. */
  _thornPoint(thorn, index) {
    const c = settings.bloodroot;
    const g = settings.global;
    const heart = Math.min(Math.round(c.thornHeart), MAX_THORNS);
    if (index < heart) {
      const a = thorn.yaw;
      const r = thorn.s * Math.min(0.9, this.radius * 0.15);
      _p.x = Math.cos(a) * r;
      _p.z = Math.sin(a) * r;
      return 0;
    }
    const root = this.rootRecords[Math.min(this._rootCount - 1, Math.floor(thorn.root * this._rootCount))];
    const s = lerp(c.thornSpacing, 1, thorn.s);
    const wander = c.rootWander * g.randomness;
    const freq = c.rootWanderFreq * g.noiseFrequency;
    rootPathAt(root, s, wander, freq, _p);
    rootPathAt(root, Math.min(1, s + 0.02), wander, freq, _q);
    // Stood off the root's line, sideways.
    const tx = _q.x - _p.x;
    const tz = _q.z - _p.z;
    const tl = Math.max(1e-4, Math.hypot(tx, tz));
    _p.x += (-tz / tl) * thorn.side * c.thornSideOffset;
    _p.z += (tx / tl) * thorn.side * c.thornSideOffset;
    thorn._tx = tx / tl;
    thorn._tz = tz / tl;
    thorn._root = root;
    thorn._s = s;
    return root.forkDist + s * root.length;
  }

  /** How far up a vine is: 0 buried, 1 at full height, past 1 in the punch. */
  _thornRise(thorn, dist, index) {
    const c = settings.bloodroot;
    const g = settings.global;
    const heart = index < Math.round(c.thornHeart);
    // A branch's front passes later than the network distance says: add its wait.
    const wait = heart ? 0 : thorn._root.forkDist > 0 ? thorn._root.delay : 0;
    const t =
      this._clock -
      this._passTime(dist) -
      wait -
      (c.thornDelay + thorn.jitter * c.thornJitter * g.randomness) * g.lifetime;
    if (t <= 0) return 0;
    // Not on a stretch the root has not reached (a branch can be shorter than the dice asked).
    if (!heart && thorn._root.grown < thorn._s * thorn._root.length - 1e-3) return 0;
    const rise = Math.max(0.01, c.thornRise * g.lifetime);
    let k;
    if (t < rise) {
      k = Easing.outCubic(t / rise) * (1 + c.thornOvershoot);
    } else {
      const settle = Easing.outCubic(saturate((t - rise) / Math.max(0.01, c.thornSettle * g.lifetime)));
      k = lerp(1 + c.thornOvershoot, 1, settle);
    }
    return k;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.trailEmitter.reset();
    this.frontEmitter.reset();
    this.mistEmitter.reset();
    this.dripEmitter.reset();
    this._releaseVictims();
    this._seed = Math.random() * TAU;
    this._clock = 0;
    this._dry = 0;
    this._burstFired = false;
    this._stained = false;
    this._flare = 0;
    this._lastCrack = 0;

    for (let i = 0; i < BLOODROOT_MAX_ROOTS; i++) {
      const r = this.rootRecords[i];
      r.bearingDice = Math.random();
      r.lengthDice = Math.random();
      r.forkDice = Math.random();
      r.sideDice = Math.random() < 0.5 ? -1 : 1;
      r.p1 = Math.random() * TAU;
      r.p2 = Math.random() * TAU;
    }
    for (const thorn of this.thorns) {
      thorn.root = Math.random();
      thorn.s = Math.pow(Math.random(), 0.85);
      thorn.side = randRange(-1, 1);
      thorn.height = randRange(-1, 1);
      thorn.radius = randRange(-1, 1);
      thorn.lean = randRange(-1, 1);
      thorn.yaw = Math.random() * TAU;
      thorn.jitter = Math.random();
      thorn.broke = false;
      thorn.passAge = -1;
      thorn._root = this.rootRecords[0];
      thorn._s = 0;
      thorn._tx = 1;
      thorn._tz = 0;
    }
    this._sync();
    this._launchFx();
  }

  /** Anticipation: the floor cracks at the caster's feet as the runner sets off. */
  _launchFx() {
    const c = settings.bloodroot;
    const g = settings.global;
    _pos.copy(this.origin).setY(0);
    if (c.launchCrack > 0) {
      this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
        radius: c.launchCrack,
        life: 2.5 * g.lifetime,
        intensity: 0.8,
        colorA: getColor(c.colorRootVein),
        colorB: getColor(c.colorRootBark)
      });
    }
    this._resetEmit(frame.uTime.value);
    _pos.y = 0.1;
    _emit.position = _pos;
    _emit.radius = 0.35;
    _emit.direction = _dir.copy(this.direction).setY(2.2).normalize();
    _emit.speed = c.dropSpeed * 0.8;
    _emit.spread = 0.6;
    _emit.size = c.dropSize;
    _emit.life = c.dropLifetime * 0.7;
    this.drops.emit(Math.round(c.launchDrops * g.particleCount), _emit);
    _emit.size = c.trailSize * 1.3;
    _emit.spin = 8;
    this.soil.emit(Math.round(c.launchDrops * 0.6 * g.particleCount), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.bloodroot;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const dry = this._dry;
    this._floorPoint(_floor);
    this._syncGeometry();
    this._layoutRoots();

    /* ---- the roots ---- */
    const rootState = this._rootState;
    rootState.count = this._rootCount;
    rootState.clock = this._clock;
    // The roots darken with the thicket, then sink a beat after it.
    rootState.dead = Easing.outQuad(saturate(dry * 1.4));
    rootState.sink = c.rootSink * Easing.inCubic(saturate((dry - 0.3) / 0.7)) * 2;
    rootState.seed = this._seed;
    // In flight the runner's veins already beat on the cast's own clock, the
    // beats running on ahead of the caster toward the circle.
    rootState.clock = travelling ? this.age : this._clock;
    rootState.runner = true;
    rootState.pulseSign = this._pulseSign;
    this.rootMaterial.userData.sync(rootState);
    // Visible in flight too: the runner crawls out behind the seed.
    this.roots.visible = true;
    this.roots.position.copy(_floor);

    /* ---- the soaked floor ---- */
    const field = this._fieldState;
    field.radius = Math.max(0.3, this._maxLength * c.fieldReach);
    field.front = travelling ? 0 : this._front(this._clock) * c.fieldReach;
    field.clock = this._clock;
    field.seed = this._seed;
    field.dead = rootState.dead;
    field.pulseSign = rootState.pulseSign;
    this.fieldMaterial.userData.sync(field);
    this.field.visible = !travelling && c.fieldOpacity > 0;
    this.field.position.set(_floor.x, 0.02, _floor.z);
    this.field.scale.set(field.radius * 2, field.radius * 2, 1);

    /* ---- the thorns ---- */
    this._thornState.dead = Easing.outQuad(saturate(dry * 1.6));
    this._thornState.pulse = this._heartbeat();
    this.thornMaterial.userData.sync(this._thornState);
    this._updateThorns();

    /* ---- particles ---- */
    const size = g.particleSize;
    // In flight the seed's spray takes the cast's own two colours.
    if (travelling) this.drops.setGradient(getColor(c.colorB), getColor(c.colorA), getColor(c.colorDropC), getColor(c.colorDropD));
    else this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    this.drops.uniforms.uGravity.value.set(0, c.dropGravity, 0);
    this.drops.uniforms.uSizeScale.value = size;
    this.drops.uniforms.uLifeScale.value = g.particleLifetime;
    this.drops.uniforms.uSpeedScale.value = g.particleSpeed;
    this.drops.uniforms.uOpacity.value = g.opacity;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    this.mist.uniforms.uGravity.value.set(0, c.mistRise, 0);
    this.mist.uniforms.uSizeScale.value = size;
    this.mist.uniforms.uLifeScale.value = g.particleLifetime;
    this.mist.uniforms.uSpeedScale.value = g.particleSpeed;
    this.mist.uniforms.uOpacity.value = c.mistOpacity * g.opacity;
    this.mist.uniforms.uTurbulence.value = 0.35 * g.turbulence;

    // The motes' arc is solved for an exact landing, so their life and speed
    // scales are pinned to 1 — the global multipliers would miss the heart.
    const T = Math.max(0.1, c.moteLifetime);
    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, (-8 * c.moteArc) / (T * T), 0);
    this.motes.uniforms.uSizeScale.value = size;
    this.motes.uniforms.uLifeScale.value = 1;
    this.motes.uniforms.uSpeedScale.value = 1;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = g.glow;

    if (travelling) this.soil.setGradient(getColor(c.colorRootBarkLight), getColor(c.colorA), getColor(c.colorRootBark), getColor(c.colorRootBark));
    else this.soil.setGradient(getColor(c.colorRootBarkLight), getColor(c.colorRootBark), getColor(c.colorRootBark), getColor(c.colorRootDead));
    this.soil.uniforms.uSizeScale.value = size;
    this.soil.uniforms.uLifeScale.value = g.particleLifetime;
    this.soil.uniforms.uSpeedScale.value = g.particleSpeed;
    this.soil.uniforms.uOpacity.value = g.opacity;
  }

  /** Place every vine from its dice and the clock. */
  _updateThorns() {
    const c = settings.bloodroot;
    const g = settings.global;
    const count = Math.min(MAX_THORNS, Math.max(0, Math.round(c.thornCount)));
    const heart = Math.round(c.thornHeart);
    const used = _used;
    used.fill(0);
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const dry = this._dry;
    const maxLen = this._maxLength;

    const trailCount = Math.min(MAX_TRAIL, Math.max(0, Math.round(c.runnerThorns)));
    const alive = 1 - dry;
    const swayT = this._clock * c.thornSwaySpeed * g.animationSpeed;

    for (let i = 0; i < TOTAL_THORNS; i++) {
      const thorn = this.thorns[i];
      const variant = i % VARIANTS;
      const slot = (i / VARIANTS) | 0;
      const mesh = this.thornMeshes[variant];
      const trail = i >= MAX_THORNS;
      const wanted = trail ? i - MAX_THORNS < trailCount : i < count;

      let k = 0;
      let dist = 0;
      if (trail) {
        if (wanted) k = this._trailRise(thorn, i - MAX_THORNS, trailCount);
      } else if (wanted && !travelling && this._rootCount > 0) {
        dist = this._thornPoint(thorn, i);
        k = this._thornRise(thorn, dist, i);
      }

      if (k <= 0.001) {
        _node.position.set(0, -999, 0);
        _node.quaternion.identity();
        _node.scale.setScalar(0.0001);
        _node.updateMatrix();
        mesh.setMatrixAt(slot, _node.matrix);
        if (wanted) used[variant] = Math.max(used[variant], slot + 1);
        continue;
      }

      if (trail) {
        this._placeTrailThorn(thorn, k, mesh, slot);
        used[variant] = Math.max(used[variant], slot + 1);
        continue;
      }

      const isHeart = i < heart;
      const edge = isHeart ? 0 : saturate(dist / maxLen);
      const height =
        Math.max(0.05, c.thornHeight * lerp(isHeart ? 1.15 : 1, c.thornEdgeHeight, edge) * (1 + thorn.height * c.thornHeightJitter * g.randomness));
      // Withered: shrivelled, and sunk back into the floor.
      const wither = 1 - c.thornWither * Easing.outQuad(dry);
      // The drain beat swells each vine as it passes through it.
      const throb = 1 + c.thornThrob * this._beatAt(dist) * alive;
      const radius = Math.max(0.01, c.thornRadius * (1 + thorn.radius * c.thornRadiusJitter * g.randomness) * lerp(1.2, 0.75, edge) * wither * throb);
      const sink = c.thornSink * height * Easing.inCubic(dry);

      // Lean: out along its root (or out from the heart), plus jitter.
      let lx;
      let lz;
      if (isHeart) {
        lx = Math.cos(thorn.yaw);
        lz = Math.sin(thorn.yaw);
      } else {
        lx = thorn._tx;
        lz = thorn._tz;
      }
      // Writhing: each vine sways on its own phase while the thicket stands.
      const sway = c.thornSway * Math.sin(swayT + thorn.yaw * 5.0) * alive;
      const lean = (isHeart ? c.thornLean * 0.6 : c.thornLean) + thorn.lean * c.thornLeanJitter * g.randomness + sway;
      _axis.set(-lz, 0, lx);
      _tilt.setFromAxisAngle(_axis, lean);
      _spin.setFromAxisAngle(_up, thorn.yaw * 3.0);
      _node.quaternion.copy(_tilt).multiply(_spin);

      // Below 1 it slides up out of the floor; past 1 it stretches in the punch.
      const out = Math.min(k, 1);
      _dir.set(0, 1, 0).applyQuaternion(_node.quaternion);
      const x = _floor.x + _p.x;
      const z = _floor.z + _p.z;
      _node.position.set(x, 0, z).addScaledVector(_dir, -height * (1 - out)).addScaledVector(_up, -sink);
      _node.scale.set(radius, height * Math.max(k, 1) * (1 + (throb - 1) * 0.25), radius);
      _node.updateMatrix();
      mesh.setMatrixAt(slot, _node.matrix);
      used[variant] = Math.max(used[variant], slot + 1);

      if (!thorn.broke && dry <= 0) {
        thorn.broke = true;
        this._breachFx(x, z, height, radius, _dir, false);
      }
    }

    for (let v = 0; v < VARIANTS; v++) {
      this.thornMeshes[v].count = used[v];
      this.thornMeshes[v].instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * How far up thorn `j` of the runner's wake is. Its place along the runner is
   * dice + settings; the one event it remembers is when the crawling tip passed
   * it (`passAge`), so it bursts up a beat behind the tip whatever the speed.
   */
  _trailRise(thorn, j, n) {
    const c = settings.bloodroot;
    const g = settings.global;
    const run = this.rootRecords[BLOODROOT_RUNNER];
    if (!run.live) return 0;
    const s = lerp(c.runnerThornStart, c.runnerThornEnd, saturate((j + 0.5 + (thorn.jitter - 0.5) * 0.8) / Math.max(1, n)));
    thorn._s = s;
    if (thorn.passAge < 0) {
      if (run.grown < s * run.length) return 0;
      thorn.passAge = this.age;
    }
    const t = this.age - thorn.passAge - (c.runnerThornDelay + thorn.jitter * 0.08) * g.lifetime;
    if (t <= 0) return 0;
    const rise = Math.max(0.01, c.thornRise * g.lifetime);
    if (t < rise) return Easing.outCubic(t / rise) * (1 + c.thornOvershoot);
    const settle = Easing.outCubic(saturate((t - rise) / Math.max(0.01, c.thornSettle * g.lifetime)));
    return lerp(1 + c.thornOvershoot, 1, settle);
  }

  /** Stand a wake thorn on the runner: short, leaning on toward the circle. */
  _placeTrailThorn(thorn, k, mesh, slot) {
    const c = settings.bloodroot;
    const g = settings.global;
    const dry = this._dry;
    const run = this.rootRecords[BLOODROOT_RUNNER];
    const wander = c.rootWander * g.randomness;
    const freq = c.rootWanderFreq * g.noiseFrequency;
    rootPathAt(run, thorn._s, wander, freq, _p);
    rootPathAt(run, Math.min(1, thorn._s + 0.01), wander, freq, _q);
    const tx = _q.x - _p.x;
    const tz = _q.z - _p.z;
    const tl = Math.max(1e-4, Math.hypot(tx, tz));
    const lx = tx / tl;
    const lz = tz / tl;
    // `_floor` still holds this frame's heart (set in `_sync`).
    const x = _floor.x + _p.x + -lz * thorn.side * c.runnerThornSpread;
    const z = _floor.z + _p.z + lx * thorn.side * c.runnerThornSpread;
    const height = Math.max(0.05, c.runnerThornHeight * (1 + thorn.height * 0.35 * g.randomness));
    const wither = 1 - c.thornWither * Easing.outQuad(dry);
    const radius = Math.max(0.01, c.thornRadius * 0.7 * (1 + thorn.radius * c.thornRadiusJitter * g.randomness) * wither);
    const sink = c.thornSink * height * Easing.inCubic(dry);
    const lean = c.thornLean * 0.9 + thorn.lean * c.thornLeanJitter * g.randomness;
    _axis.set(-lz, 0, lx);
    _tilt.setFromAxisAngle(_axis, lean);
    _spin.setFromAxisAngle(_up, thorn.yaw * 3.0);
    _node.quaternion.copy(_tilt).multiply(_spin);
    const out = Math.min(k, 1);
    _dir.set(0, 1, 0).applyQuaternion(_node.quaternion);
    _node.position.set(x, 0, z).addScaledVector(_dir, -height * (1 - out)).addScaledVector(_up, -sink);
    _node.scale.set(radius, height * Math.max(k, 1), radius);
    _node.updateMatrix();
    mesh.setMatrixAt(slot, _node.matrix);
    if (!thorn.broke && dry <= 0) {
      thorn.broke = true;
      this._breachFx(x, z, height, radius, _dir, true);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The drain                                                           */
  /* ------------------------------------------------------------------ */

  _victimOf(dummy) {
    for (let i = 0; i < this._victimCount; i++) {
      if (this._victims[i].dummy === dummy) return this._victims[i];
    }
    return null;
  }

  _dropVictim(index) {
    const last = this._victimCount - 1;
    const slot = this._victims[index];
    slot.dummy = null;
    this._victims[index] = this._victims[last];
    this._victims[last] = slot;
    this._victimCount = last;
  }

  _releaseVictims() {
    for (let i = 0; i < this._victimCount; i++) this._victims[i].dummy = null;
    this._victimCount = 0;
  }

  /** Take hold of anything in the thicket not already being drained. */
  _capture() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.bloodroot;
    this._floorPoint(_floor);
    const found = field.findBodies(_floor.x, _floor.z, this.radius * c.drainReach, this._found);
    for (const dummy of found) {
      if (this._victimCount >= MAX_VICTIMS) break;
      if (this._victimOf(dummy)) continue;
      if (!dummy.alive && !dummy.bodyPoint(_at)) continue;
      const slot = this._victims[this._victimCount++];
      slot.dummy = dummy;
      slot.exposure = 0;
      slot.eaten = 0;
      slot.killed = !dummy.alive;
      slot.emitter.reset();
    }
  }

  /** Drain every body held: stain, stream motes to the heart, fell, eat. */
  _drain(dt, finishing) {
    const c = settings.bloodroot;
    const g = settings.global;
    this._floorPoint(_floor);
    _heart.copy(_floor).setY(Math.min(1.2, c.thornHeight * 0.55));

    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity;
    this._force.spin = c.hitSpin;
    const drainTime = Math.max(0.05, c.drainTime * g.lifetime);

    for (let i = this._victimCount - 1; i >= 0; i--) {
      const slot = this._victims[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || (slot.killed && dummy.alive)) {
        this._dropVictim(i);
        continue;
      }

      slot.exposure += dt;
      const stained = dummy.corrode(saturate((slot.exposure / drainTime) * c.stain), c.look);

      // Where the blood is drawn out of.
      if (dummy.alive) _at.copy(dummy.position).setY(1.0);
      else if (!dummy.bodyPoint(_at)) {
        this._dropVictim(i);
        continue;
      }
      // Thinning as the husk empties.
      const flow = (1 - slot.eaten) * (finishing ? 0.5 : 1);
      this._moteFx(slot.emitter.tick(dt, c.moteRate * flow * g.particleCount), _at);

      if (dummy.alive) {
        if (slot.exposure < drainTime || finishing) continue;
        _dir.set(_floor.x - dummy.position.x, 0, _floor.z - dummy.position.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (dummy.kill(_dir.x, _dir.z, this._force)) {
          slot.killed = true;
          this._fellFx();
        }
        continue;
      }

      if (stained < 1 && !finishing) continue;
      slot.eaten = Math.min(1, slot.eaten + Math.max(0, finishing ? Math.max(c.rot, 1.5) : c.rot) * dt);
      dummy.consume(slot.eaten);
      if (slot.eaten >= 1) this._dropVictim(i);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.sizeVariance = 0.5;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** Motes drawn out of a body, each on an arc that lands on the heart as it dies. */
  _moteFx(n, from) {
    if (n <= 0) return;
    const c = settings.bloodroot;
    const T = Math.max(0.1, c.moteLifetime);
    const gy = (-8 * c.moteArc) / (T * T);
    const time = frame.uTime.value;
    for (let k = 0; k < n; k++) {
      this._resetEmit(time);
      _pos.set(
        from.x + randRange(-1, 1) * c.moteJitter,
        from.y + randRange(-0.6, 0.6) * c.moteJitter,
        from.z + randRange(-1, 1) * c.moteJitter
      );
      // v = (Δ − ½·g·T²) / T, so it is exactly on the heart at age T.
      _dir.set((_heart.x - _pos.x) / T, (_heart.y - _pos.y - 0.5 * gy * T * T) / T, (_heart.z - _pos.z) / T);
      const speed = _dir.length();
      _emit.position = _pos;
      _emit.direction = _dir.multiplyScalar(1 / Math.max(speed, 1e-4));
      _emit.speed = speed;
      _emit.speedVariance = 0;
      _emit.size = c.moteSize;
      _emit.life = T;
      _emit.lifeVariance = 0;
      this.motes.emit(1, _emit);
    }
  }

  /** The seed burrowing to the circle: soil and blood kicked up behind it. */
  _travelFx(dt) {
    const c = settings.bloodroot;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.trailRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _pos.copy(this.position).setY(0.05);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(-0.5).setY(1).normalize();
    _emit.speed = 3.2;
    _emit.spread = 0.5;
    _emit.size = c.trailSize * 1.4;
    _emit.life = 0.7;
    _emit.spin = 8;
    this.soil.emit(n, _emit);
    _emit.size = c.dropSize * 1.5;
    _emit.speed = 3.4;
    _emit.spin = 0;
    _emit.life = c.dropLifetime * 0.6;
    this.drops.emit(Math.max(1, Math.round(n * 0.7)), _emit);
  }

  /** The seed surfaces: cracked floor, a burst of blood, a knock. */
  _impactFx() {
    const c = settings.bloodroot;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.CRACK, _floor, {
      radius: this.radius * c.crackRadius,
      life: this.impactDuration + this.fadeDuration,
      intensity: 0.9,
      colorA: getColor(c.colorRootVein),
      colorB: getColor(c.colorRootBark)
    });
    _pos.copy(_floor).setY(0.3);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1,
      opacity: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC),
      squash: 0.4
    });
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.ctx.shake.add(c.impactShake * power, 5, 16);
    this.lightBoost = c.lightIntensity * 0.6;

    this._resetEmit(frame.uTime.value);
    _pos.copy(_floor).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = 5;
    _emit.spread = 0.8;
    _emit.size = c.trailSize * 1.6;
    _emit.life = 0.9;
    _emit.spin = 8;
    this.soil.emit(Math.round(40 * g.particleCount), _emit);
    _emit.spin = 0;
    _emit.size = c.dropSize;
    _emit.speed = c.dropSpeed;
    _emit.life = c.dropLifetime;
    this.drops.emit(Math.round(40 * g.particleCount), _emit);
  }

  /** The thicket bursts: a knock, a shockwave, a flare. */
  _burstFx() {
    const c = settings.bloodroot;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._floorPoint(_floor);
    this.ctx.shake.add(c.thornShake * power, 4, 20);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: this.radius * 1.3,
      life: 0.7,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorThornRim),
      colorB: getColor(c.colorRootVein)
    });
    this._flare = 1;
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity);
  }

  /** One vine breaking the floor: blood and soil flung off it. */
  _breachFx(x, z, height, radius, axis, wake) {
    const c = settings.bloodroot;
    const g = settings.global;
    if (!wake && !this._burstFired) {
      this._burstFired = true;
      this._burstFx();
    }
    this._resetEmit(frame.uTime.value);
    _pos.set(x, 0.08, z);
    _emit.position = _pos;
    _emit.radius = radius * 1.5;
    _emit.direction = _at.copy(axis).setY(axis.y + 0.7).normalize();
    _emit.speed = c.dropSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.7;
    _emit.size = c.dropSize;
    _emit.sizeVariance = 0.7;
    _emit.life = c.dropLifetime;
    this.drops.emit(Math.round(c.dropPerThorn * g.particleCount), _emit);
    _emit.size = c.trailSize;
    _emit.speed = c.dropSpeed * 0.6;
    _emit.spin = 8;
    _emit.life = 0.6;
    this.soil.emit(Math.max(1, Math.round(c.dropPerThorn * 0.5 * g.particleCount)), _emit);
  }

  /** A drained body falls: the heart flares. */
  _fellFx() {
    const c = settings.bloodroot;
    this._flare = Math.min(1.5, this._flare + 0.8);
    this.lightBoost = Math.max(this.lightBoost, c.drainPulse * settings.global.explosionIntensity);
  }

  /** Everything the thicket keeps doing while it stands. */
  _holdFx(dt) {
    const c = settings.bloodroot;
    const g = settings.global;
    const time = frame.uTime.value;
    this._floorPoint(_floor);
    const wet = 1 - this._dry;
    const wander = c.rootWander * g.randomness;
    const freq = c.rootWanderFreq * g.noiseFrequency;

    /* soil thrown up at every racing front */
    const fronts = this.frontEmitter.tick(dt, wet > 0 ? 120 * g.particleCount : 0);
    for (let n = 0; n < fronts; n++) {
      const root = this.rootRecords[(Math.random() * this._rootCount) | 0];
      if (!root.live || root.grown <= 0.05 || root.grown >= root.length - 0.02) continue;
      rootPathAt(root, root.grown / root.length, wander, freq, _p);
      this._resetEmit(time);
      _pos.set(_floor.x + _p.x, 0.05, _floor.z + _p.z);
      _emit.position = _pos;
      _emit.radius = root.thickness;
      _emit.direction = _up;
      _emit.speed = 2.4;
      _emit.spread = 0.7;
      _emit.size = c.trailSize;
      _emit.life = 0.6;
      _emit.spin = 8;
      this.soil.emit(1, _emit);
    }

    /* low mist over the thicket */
    const reach = this._maxLength * saturate(this._front(this._clock) / this._maxLength);
    const mist = this.mistEmitter.tick(dt, c.mistRate * wet * saturate(reach / this._maxLength) * g.particleCount);
    if (mist > 0) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * reach * 0.85;
      _pos.set(_floor.x + Math.cos(a) * r, c.mistHeight, _floor.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _dir.set(Math.cos(a), 0.15, Math.sin(a));
      _emit.speed = 0.3;
      _emit.spread = 0.4;
      _emit.size = c.mistSize;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.3;
      this.mist.emit(mist, _emit);
    }

    /* drips off standing vines */
    const drips = this.dripEmitter.tick(dt, c.dripRate * wet * g.particleCount);
    const count = Math.min(MAX_THORNS, Math.round(c.thornCount));
    for (let n = 0; n < drips && count > 0; n++) {
      const i = (Math.random() * count) | 0;
      const thorn = this.thorns[i];
      if (!thorn.broke) continue;
      this._thornPoint(thorn, i);
      this._resetEmit(time);
      _pos.set(_floor.x + _p.x, c.thornHeight * randRange(0.25, 0.75), _floor.z + _p.z);
      _emit.position = _pos;
      _emit.radius = 0.05;
      _emit.direction = _dir.set(0, -1, 0);
      _emit.speed = 0.3;
      _emit.size = c.dropSize * 0.8;
      _emit.life = c.dropLifetime;
      this.drops.emit(1, _emit);
    }
  }

  /** The thicket gone: leave a dried stain. */
  _stainFx() {
    const c = settings.bloodroot;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: this._maxLength * 0.85,
      life: c.stainLife,
      intensity: c.stainIntensity,
      colorA: getColor(c.colorStain),
      colorB: getColor(c.colorRootDead),
      height: 0.011
    });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._sync();
    this._travelFx(dt);
    // The light rides over the tip so the floor it tears is lit.
    this.position.y = settings.bloodroot.lightTravelHeight;
    // The tip tears the floor as it goes: a crack every `runnerCrackSpacing`.
    const c = settings.bloodroot;
    const spacing = Math.max(0.3, c.runnerCrackSpacing);
    if (c.runnerCrackRadius > 0 && this.front - this._lastCrack >= spacing && this.u < 0.97) {
      this._lastCrack = this.front;
      _pos.copy(this.position).setY(0);
      this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
        radius: c.runnerCrackRadius,
        life: this.impactDuration + this.fadeDuration + (1 - this.u) * this.length / Math.max(1, c.speed),
        intensity: 0.75,
        colorA: getColor(c.colorRootVein),
        colorB: getColor(c.colorRootBark)
      });
    }
  }

  onImpact() {
    this._clock = 0;
    this._dry = 0;
    this._impactFx();
  }

  onFade(dt, t) {
    const c = settings.bloodroot;
    const g = settings.global;
    this._clock += dt;
    this._dry = t <= 1 ? 0 : saturate(t - 1);
    this._flare = Math.max(0, this._flare - this._flare * 2.5 * dt);

    this._sync();
    this._holdFx(dt);

    // The drain takes hold a beat after the first vines stand.
    const drainAt = (c.thornDelay + c.drainDelay) * g.lifetime;
    if (this._clock >= drainAt && this._dry <= 0) this._capture();
    if (this._victimCount > 0) this._drain(dt, this._dry > 0);

    if (!this._stained && this._dry >= 0.7) {
      this._stained = true;
      this._stainFx();
    }

    this._floorPoint(this.position);
    this.position.y = c.lightHeight;
  }

  onDestroy() {
    this._releaseVictims();
    this.roots.visible = false;
    this.field.visible = false;
    for (const mesh of this.thornMeshes) mesh.count = 0;
  }

  dispose() {
    this.rootGeometry.dispose();
    for (const mesh of this.thornMeshes) mesh.geometry.dispose();
    this.rootMaterial.dispose();
    this.thornMaterial.dispose();
    this.fieldGeometry.dispose();
    this.fieldMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('❦  Bloodroot Thorns');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'seed burrows at (m/s)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'thicket stands for (s)');
  R(cast, c, 'fadeTime', 0.2, 5, 0.05, 'withers over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 1, 12, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);
  R(cast, c, 'trailRate', 0, 300, 1, 'burrow spray / s');
  R(cast, c, 'trailSize', 0.01, 0.4, 0.005, 'spray size');
  cast.addColor(c, 'colorA').name('seed blood');
  cast.addColor(c, 'colorB').name('seed glow');
  const runner = cast.addFolder('The runner');
  R(runner, c, 'runnerThickness', 0, 2, 0.01, 'thickness (× root)');
  R(runner, c, 'runnerWander', 0, 2, 0.01, 'wander (× root)');
  R(runner, c, 'runnerThorns', 0, MAX_TRAIL, 1, 'wake thorns');
  R(runner, c, 'runnerThornHeight', 0.1, 3, 0.01, 'wake thorn height (m)');
  R(runner, c, 'runnerThornSpread', 0, 2, 0.01, 'wake off the line (m)');
  R(runner, c, 'runnerThornDelay', 0, 1, 0.01, 'after the tip (s)');
  R(runner, c, 'runnerThornStart', 0, 1, 0.01, 'wake starts at');
  R(runner, c, 'runnerThornEnd', 0, 1, 0.01, 'wake ends at');
  R(runner, c, 'runnerCrackSpacing', 0.3, 6, 0.05, 'cracks every (m)');
  R(runner, c, 'runnerCrackRadius', 0, 3, 0.05, 'crack radius (m)');
  R(runner, c, 'launchCrack', 0, 4, 0.05, 'crack at the feet (m)');
  R(runner, c, 'launchDrops', 0, 120, 1, 'blood at the feet');

  const roots = folder.addFolder('1 · Roots');
  R(roots, c, 'rootCount', 1, MAX_PRIMARY, 1, 'roots');
  R(roots, c, 'rootBranches', 0, MAX_BRANCHES, 1, 'branches per root');
  R(roots, c, 'rootReach', 0.2, 1.6, 0.01, 'reach (× zone)');
  R(roots, c, 'rootLengthJitter', 0, 1, 0.01, 'length jitter');
  R(roots, c, 'rootGrowTime', 0.05, 3, 0.01, 'race out over (s)');
  R(roots, c, 'rootGrowEase', 0, 1, 0.01, 'burst & slow');
  R(roots, c, 'rootWander', 0, 2, 0.01, 'wander');
  R(roots, c, 'rootWanderFreq', 0.2, 10, 0.05, 'wiggles');
  R(roots, c, 'rootThickness', 0.02, 0.6, 0.005, 'thickness (m)');
  R(roots, c, 'rootTaper', 0, 1, 0.01, 'taper');
  R(roots, c, 'rootEmbed', -0.5, 1, 0.01, 'embedded (× radius)');
  R(roots, c, 'rootTipLength', 0.05, 3, 0.01, 'tip length (m)');
  R(roots, c, 'branchStart', 0, 0.95, 0.01, 'branches from');
  R(roots, c, 'branchLength', 0.1, 1.2, 0.01, 'branch length (×)');
  R(roots, c, 'branchAngle', 0, 1.6, 0.01, 'branch angle (rad)');
  R(roots, c, 'branchThickness', 0.1, 1.2, 0.01, 'branch thickness (×)');
  R(roots, c, 'branchDelay', 0, 1, 0.005, 'branch waits (s)');
  const wood = roots.addFolder('Wood & veins');
  R(wood, c, 'rootBark', 0, 2, 0.01, 'bark grain');
  R(wood, c, 'rootBarkScale', 0.5, 30, 0.1, 'grain scale');
  R(wood, c, 'rootGloss', 2, 200, 1, 'gloss');
  R(wood, c, 'rootSpecular', 0, 4, 0.01, 'specular');
  R(wood, c, 'rootVeins', 0, 10, 0.05, 'veins');
  R(wood, c, 'rootVeinWidth', 0.02, 0.8, 0.01, 'vein width');
  R(wood, c, 'rootPulseRate', 0, 5, 0.01, 'heartbeats / s');
  R(wood, c, 'rootDrainAfter', 0, 8, 0.05, 'beats turn inward after (s)');
  R(wood, c, 'rootPulseSpeed', 0.5, 30, 0.1, 'pulse travels (m/s)');
  R(wood, c, 'rootPulseWidth', 0.05, 4, 0.01, 'pulse length (m)');
  R(wood, c, 'rootFrontGlow', 0, 15, 0.05, 'growth front glow');
  R(wood, c, 'rootRim', 0, 6, 0.05, 'rim');
  R(wood, c, 'rootDarken', 0, 1, 0.01, 'darkens as it dies');
  R(wood, c, 'rootSink', 0, 3, 0.01, 'sinks (× radius)');
  wood.addColor(c, 'colorRootBark').name('bark');
  wood.addColor(c, 'colorRootBarkLight').name('grain');
  wood.addColor(c, 'colorRootVein').name('veins');
  wood.addColor(c, 'colorRootFront').name('growth front');
  wood.addColor(c, 'colorRootRim').name('rim');
  wood.addColor(c, 'colorRootDead').name('dead wood');

  const thorns = folder.addFolder('2 · Thorn thicket');
  R(thorns, c, 'thornCount', 0, MAX_THORNS, 1, 'vines');
  R(thorns, c, 'thornHeart', 0, 30, 1, 'in the heart');
  R(thorns, c, 'thornDelay', 0, 1.5, 0.01, 'after the front (s)');
  R(thorns, c, 'thornJitter', 0, 1, 0.01, 'jitter (s)');
  R(thorns, c, 'thornSpacing', 0, 0.8, 0.01, 'clear of the heart');
  R(thorns, c, 'thornHeight', 0.2, 5, 0.01, 'height (m)');
  R(thorns, c, 'thornEdgeHeight', 0.1, 1.5, 0.01, 'at root ends (×)');
  R(thorns, c, 'thornHeightJitter', 0, 1, 0.01, 'height jitter');
  R(thorns, c, 'thornRadius', 0.02, 0.5, 0.005, 'radius (m)');
  R(thorns, c, 'thornRadiusJitter', 0, 1, 0.01, 'radius jitter');
  R(thorns, c, 'thornLean', -1, 1.4, 0.01, 'lean (rad)');
  R(thorns, c, 'thornLeanJitter', 0, 1, 0.01, 'lean jitter');
  R(thorns, c, 'thornSideOffset', 0, 1.5, 0.01, 'off the root (m)');
  R(thorns, c, 'thornRise', 0.02, 1, 0.005, 'bursts up over (s)');
  R(thorns, c, 'thornOvershoot', 0, 1, 0.01, 'overshoot');
  R(thorns, c, 'thornSettle', 0.02, 1.5, 0.01, 'settle (s)');
  R(thorns, c, 'thornCurl', 0, 1.5, 0.01, 'hook (rebuild)');
  R(thorns, c, 'thornBarbs', 0, 16, 1, 'barbs (rebuild)');
  R(thorns, c, 'thornBarbLength', 0.5, 5, 0.05, 'barb length (rebuild)');
  R(thorns, c, 'thornWither', 0, 1, 0.01, 'shrivels');
  R(thorns, c, 'thornSink', 0, 1.5, 0.01, 'sinks (× height)');
  R(thorns, c, 'thornThrob', 0, 1.5, 0.01, 'swells on the drain beat');
  R(thorns, c, 'thornSway', 0, 0.6, 0.005, 'writhe (rad)');
  R(thorns, c, 'thornSwaySpeed', 0, 10, 0.05, 'writhe speed');
  const gloss = thorns.addFolder('Look');
  R(gloss, c, 'thornGloss', 4, 400, 1, 'gloss');
  R(gloss, c, 'thornSpecular', 0, 8, 0.05, 'specular');
  R(gloss, c, 'thornEnv', 0, 3, 0.01, 'sky reflection');
  R(gloss, c, 'thornRim', 0, 10, 0.05, 'rim');
  R(gloss, c, 'thornRimPower', 0.5, 8, 0.05, 'rim thinness');
  R(gloss, c, 'thornSap', 0, 8, 0.05, 'sap glow');
  R(gloss, c, 'thornVeins', 0, 2, 0.01, 'veins');
  R(gloss, c, 'thornVeinScale', 0.5, 12, 0.05, 'vein scale');
  R(gloss, c, 'thornBacklight', 0, 4, 0.01, 'backlight');
  R(gloss, c, 'thornBarkHeight', 0, 1, 0.01, 'bark at the base');
  gloss.addColor(c, 'colorThornBody').name('body');
  gloss.addColor(c, 'colorThornDeep').name('clot');
  gloss.addColor(c, 'colorThornRim').name('rim');
  gloss.addColor(c, 'colorThornSap').name('sap');
  gloss.addColor(c, 'colorThornSpec').name('highlight');
  gloss.addColor(c, 'colorThornDead').name('withered');

  const fx = folder.addFolder('3 · Droplets, mist & motes');
  R(fx, c, 'dropPerThorn', 0, 40, 1, 'droplets per vine');
  R(fx, c, 'dropSpeed', 0, 15, 0.05, 'droplet speed');
  R(fx, c, 'dropSize', 0.01, 0.3, 0.002, 'droplet size');
  R(fx, c, 'dropLifetime', 0.1, 3, 0.01, 'droplet life (s)');
  R(fx, c, 'dropGravity', -30, 0, 0.1, 'droplet gravity');
  R(fx, c, 'dripRate', 0, 200, 1, 'drips / s');
  Editor.gradient(fx, c, 'colorDrop', 'droplet colour');
  R(fx, c, 'mistRate', 0, 200, 1, 'mist / s');
  R(fx, c, 'mistSize', 0.1, 5, 0.01, 'mist size');
  R(fx, c, 'mistLifetime', 0.2, 6, 0.05, 'mist life (s)');
  R(fx, c, 'mistRise', -1, 1, 0.01, 'mist rise');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  R(fx, c, 'mistHeight', 0, 2, 0.01, 'mist height (m)');
  Editor.gradient(fx, c, 'colorMist', 'mist colour');
  R(fx, c, 'moteRate', 0, 200, 1, 'motes / s per body');
  R(fx, c, 'moteSize', 0.01, 0.5, 0.005, 'mote size');
  R(fx, c, 'moteLifetime', 0.15, 3, 0.01, 'flight time (s)');
  R(fx, c, 'moteArc', 0, 4, 0.01, 'arc height (m)');
  R(fx, c, 'moteJitter', 0, 1.5, 0.01, 'scatter (m)');
  Editor.gradient(fx, c, 'colorMote', 'mote colour');

  const drain = folder.addFolder('4 · The drain');
  R(drain, c, 'drainReach', 0.1, 1.5, 0.01, 'reach (× zone)');
  R(drain, c, 'drainDelay', 0, 3, 0.01, 'takes hold after (s)');
  R(drain, c, 'drainTime', 0.1, 6, 0.05, 'drained in (s)');
  R(drain, c, 'stain', 0, 4, 0.01, 'stain rate');
  R(drain, c, 'rot', 0, 3, 0.01, 'husk eaten / s');
  R(drain, c, 'hitImpulse', 0, 10, 0.05, 'fall impulse');
  R(drain, c, 'hitLift', 0, 10, 0.05, 'fall lift');
  R(drain, c, 'hitSpin', 0, 4, 0.01, 'fall torque');
  drain.addColor(c.look, 'color').name('flesh');
  drain.addColor(c.look, 'rimColor').name('rim');
  R(drain, c.look, 'rimEmissive', 0, 6, 0.05, 'rim emissive');
  drain.addColor(c.look, 'edgeColor').name('burn edge');
  R(drain, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge emissive');
  R(drain, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  const beats = folder.addFolder('5 · Beats');
  R(beats, c, 'impactShake', 0, 2, 0.01, 'impact shake');
  R(beats, c, 'impactFlash', 0, 2, 0.01, 'impact flash');
  R(beats, c, 'thornShake', 0, 2, 0.01, 'thicket shake');
  R(beats, c, 'drainPulse', 0, 30, 0.1, 'light per body drained');
  beats.addColor(c, 'colorFlash').name('flash');
  R(beats, c, 'burstRadius', 0.2, 8, 0.05, 'burst radius (m)');
  R(beats, c, 'burstLife', 0.1, 2, 0.01, 'burst life (s)');
  beats.addColor(c, 'colorBurstA').name('burst A');
  beats.addColor(c, 'colorBurstB').name('burst B');
  beats.addColor(c, 'colorBurstC').name('burst C');
  R(beats, c, 'crackRadius', 0.2, 2, 0.01, 'cracked floor (× zone)');
  const soak = beats.addFolder('Soaked floor');
  R(soak, c, 'fieldReach', 0.2, 2, 0.01, 'reach (× longest root)');
  R(soak, c, 'fieldVeins', 0, 4, 0.05, 'capillaries');
  R(soak, c, 'fieldSheen', 0, 4, 0.05, 'wet sheen');
  R(soak, c, 'fieldOpacity', 0, 1, 0.01, 'opacity');
  soak.addColor(c, 'colorFieldDeep').name('clotted soil');
  R(beats, c, 'stainLife', 0.5, 30, 0.1, 'stain lingers (s)');
  R(beats, c, 'stainIntensity', 0, 1.5, 0.01, 'stain strength');
  beats.addColor(c, 'colorStain').name('stain');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 5, 0.01, 'height (m)');
  R(light, c, 'lightTravelHeight', 0, 5, 0.01, 'over the tip (m)');

  folder.close();
  return folder;
}
