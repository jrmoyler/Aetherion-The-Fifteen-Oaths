import {
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  bulbRadius,
  bulbVolumeTable,
  createBulbGeometry,
  createFrameGeometry,
  createGearGeometry,
  createShardGeometry,
  createStreamGeometry,
  levelForVolume
} from '../../assets/codex/HourglassSunderGeometry.js';
import {
  createHourglassGlassMaterial,
  createHourglassLensMaterial,
  createHourglassBrassMaterial,
  createHourglassSandMaterial,
  createSandStreamMaterial,
  createClockFaceMaterial,
  createShardMaterial
} from '../../materials/codex/HourglassSunderMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'hourglass';

/** Hard ceilings. The editor's sliders clamp to these. */
const MAX_SHARDS = 96;
const MAX_TRACK = 16;
const MAX_PILLARS = 8;
/** Samples in the bulb's volume table. */
const VOLUME_SAMPLES = 64;
/** The sand is drawn on a lathe this much inside the glass, so the two never z-fight. */
const SAND_INSET = 0.94;
const TAU = Math.PI * 2;

/** The settings that reshape the lathe. Compared every frame, rebuilt only when one moves. */
const SHAPE_KEYS = [
  'glassHalfHeight',
  'bulbRadius',
  'neckRadius',
  'bulbShape',
  'capRatio',
  'capThickness',
  'capOverhang',
  'pillarCount',
  'pillarRadius',
  'gearTeeth',
  'orbitRadius'
];

const _emit = {};
const _pos = new Vector3();
const _pos2 = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _qFlip = new Quaternion();
const _qYaw = new Quaternion();
const _q = new Quaternion();
const _scale = new Vector3();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _profile = { half: 1.6, neck: 0.07, radius: 1.05, shape: 0.62, cap: 0.62 };

/* Per-frame state blocks handed to the materials — module-level, written in place. */
const _glassState = { reveal: 0, crack: 0, crackOrigin: new Vector3(), fade: 1, half: 1.6, seed: 0 };
const _brassState = { reveal: 0, seed: 0 };
const _sandState = { aLo: 0, aHi: 0, bHi: -10, dimple: 0, cone: 0, radius: 1, reveal: 0, seed: 0 };
const _streamState = { length: 1, level: 0 };
const _dialState = {
  centre: new Vector3(),
  forward: new Vector3(0, 0, 1),
  radius: 4,
  spin: 0,
  minute: 0,
  hour: 0,
  elapsed: 0,
  reveal: 0,
  tick: 0,
  spill: 0,
  fade: 1,
  seed: 0
};

/** Push one particle system's gradient and the globals through. */
function syncSystem(p, a, b, cc, d, size, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = size * g.particleSize * 7;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/**
 * Time that advances in ticks. `snap` 0 is a smooth sweep; toward 1 each tick
 * becomes a quick jump and a rest — a clock's escapement.
 */
function ticked(t, rate, snap) {
  if (rate <= 0 || snap <= 0) return t;
  const phase = t * rate;
  const n = Math.floor(phase);
  const f = phase - n;
  const e = Easing.outCubic(saturate(f / Math.max(0.04, 1 - snap)));
  return (n + e) / rate;
}

/**
 * HOURGLASS SUNDER — Time, zone cast.
 *
 * A thread of golden sand runs along the floor from the caster's hand to the
 * circle while, far above it, the faint outline of a giant hourglass gathers.
 * Then, on one clock that starts when the thread arrives:
 *
 *   1. **THE DESCENT** — the hourglass sinks down over the circle,
 *      materialising out of noise along a burning gold edge, and settles with
 *      a soft bounce, a dust ring and a shock ring. Under it a **clock face**
 *      draws itself round on the floor.
 *   2. **THE TURN** — it lifts a little and turns over end-for-end; the sand,
 *      packed against what was the bottom cap, drops to the neck. On the
 *      floor the hands spin a full turn *backward*.
 *   3. **THE POUR** — sand runs through the neck as a glittering thread: the
 *      top surface funnels, the bottom heaps into a cone, grains fall, motes
 *      of time orbit the glass. On the floor the hands tick round and the
 *      elapsed sector greys over. **Everything inside ages**: bodies slow,
 *      turn dusty grey, shed dust, and when their time is up they crumble —
 *      folding over, sinking into their own pile, falling to sand.
 *   4. **THE CRACK** — the sand runs out; cracks spread across the glass from
 *      one point, hot and bright, and it trembles.
 *   5. **THE SUNDER** — the glass bursts into tumbling shards, the sand
 *      spills across the dial, the brass frame dissolves along its gold edge,
 *      and the clock face fades.
 *
 * ## Layers
 *
 *   - **ghost glass** (`createHourglassGlassMaterial`) — a procedural lathe
 *     (`createBulbGeometry`): fresnel, reflection and refraction of the sky,
 *     climbing ghost light, glints, the materialise edge, spreading cracks.
 *   - **the lens** — the same lathe on `LAYER.DISTORTION`, bending the world
 *     behind the glass by its own view-space normal.
 *   - **brass & clockwork** (`createHourglassBrassMaterial`) — moulded end
 *     plates and turned spindles (`createFrameGeometry`), two toothed gears
 *     ticking round the plates in opposite directions, and an armillary ring
 *     sweeping round the whole thing.
 *   - **sand** (`createHourglassSandMaterial`) — the inner lathe cut by levels
 *     from a **volume table**, so what leaves the top arrives at the bottom.
 *     Plus the falling **stream** (`createSandStreamMaterial`).
 *   - **clock face** (`createClockFaceMaterial`) — the floor treatment.
 *   - **shards** (`createShardMaterial`) — instanced, tumbling, bouncing.
 *   - **particles** — falling grains (SOFT, additive), orbiting time motes
 *     (SOFT, swirl), dust (SMOKE), sand chips off the bodies (CHIP, lit),
 *     glints off the burst (STREAK).
 *   - **the beat** — DUSTRING + SHOCKWAVE + a light punch as it lands; an AIR
 *     shell, a SHOCKWAVE, a flash and a hard shake as it bursts.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. While the sand runs, every body in the circle — standing
 * or lying — is tracked and *aged*: slower near the rim (`ageFalloff`). A
 * standing body's own animation is wound back against the field's step
 * (`Dummy.mixer`) so it visibly slows as it ages, and it is stained toward a
 * dusty grey (`Dummy#corrode`). At full age it **crumbles**: knocked down with
 * almost no force so it folds where it stood (`Dummy#kill`), then taken apart
 * (`Dummy#consume`) while its floor is lowered (`Dummy#sink`) so it settles
 * into its own pile, shedding sand chips and dust as it goes.
 *
 * ## The editor rule
 *
 * Nothing is baked at spawn but dice: the crack's origin, a seed, the spin
 * phase. The rig's position and turn, the sand levels, the dial and hands,
 * every colour and every time are resolved from `settings.hourglass` each
 * frame. The "(rebuild)" sliders reshape the lathe live, rebuilding it on the
 * frame they move.
 */
export class HourglassSunderAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The hourglass decides who ages, and when they fall. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = this.rig.visible ? 1 : 0;
    for (let i = 0; i < this._shardCount; i++) if (this.shardRecs[i].age < this.shardRecs[i].life) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /** The hourglass, as one rig: neck at its origin. */
    this.rig = new Group();
    this.rig.name = 'HourglassRig';
    this.rig.visible = false;
    this.group.add(this.rig);

    this.glassMaterial = createHourglassGlassMaterial();
    this.lensMaterial = createHourglassLensMaterial();
    this.brassMaterial = createHourglassBrassMaterial();
    this.sandMaterial = createHourglassSandMaterial();
    this.streamMaterial = createSandStreamMaterial();
    this.dialMaterial = createClockFaceMaterial();
    this.shardMaterial = createShardMaterial();

    // Draw order inside the rig: brass and sand first (opaque), the stream,
    // then the glass over all of it.
    this.frame = this._mesh(this.rig, this.brassMaterial, 8, LAYER.VFX);
    this.gearTop = this._mesh(this.rig, this.brassMaterial, 8, LAYER.VFX);
    this.gearBottom = this._mesh(this.rig, this.brassMaterial, 8, LAYER.VFX);
    this.orbitPivot = new Group();
    this.rig.add(this.orbitPivot);
    this.orbit = this._mesh(this.orbitPivot, this.brassMaterial, 8, LAYER.VFX);
    this.sand = this._mesh(this.rig, this.sandMaterial, 9, LAYER.VFX);
    this.streamGeometry = createStreamGeometry();
    this.stream = this._mesh(this.rig, this.streamMaterial, 10, LAYER.VFX);
    this.stream.geometry = this.streamGeometry;
    this.glass = this._mesh(this.rig, this.glassMaterial, 12, LAYER.VFX);
    this.lens = this._mesh(this.rig, this.lensMaterial, 0, LAYER.DISTORTION);

    this._shape = new Float64Array(SHAPE_KEYS.length).fill(NaN);
    this._vol = new Float32Array(VOLUME_SAMPLES + 1);
    this._half = 1.6;
    this._capRadius = 1.3;
    this._capThickness = 0.24;
    this._buildShape();

    /* ---- the clock face ---- */
    this.dialGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.dial = new Mesh(this.dialGeometry, this.dialMaterial);
    this.dial.name = 'HourglassDial';
    this.dial.layers.set(LAYER.VFX);
    this.dial.frustumCulled = false;
    this.dial.renderOrder = 2;
    this.dial.visible = false;
    this.group.add(this.dial);

    /* ---- the shards ---- */
    this.shardGeometry = createShardGeometry();
    this.shardAttr = new InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 2), 2);
    this.shardAttr.setUsage(DynamicDrawUsage);
    this.shardGeometry.setAttribute('aShard', this.shardAttr);
    this.shards = new InstancedMesh(this.shardGeometry, this.shardMaterial, MAX_SHARDS);
    this.shards.name = 'HourglassShards';
    this.shards.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shards.layers.set(LAYER.VFX);
    this.shards.frustumCulled = false;
    this.shards.renderOrder = 14;
    this.shards.count = 0;
    this.shards.visible = false;
    this.group.add(this.shards);
    this.shardRecs = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.shardRecs.push({
        pos: new Vector3(),
        vel: new Vector3(),
        axis: new Vector3(0, 1, 0),
        angle: 0,
        spin: 0,
        size: 0,
        seed: 0,
        age: 0,
        life: 1
      });
    }
    this._shardCount = 0;

    /** Bodies under the sand: dice-free, just what they have been through. */
    this.track = [];
    for (let i = 0; i < MAX_TRACK; i++) {
      this.track.push({ dummy: null, age: 0, crumble: -1, done: false, dust: new RateEmitter(), chips: new RateEmitter() });
    }
    this._trackCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    /** Scratch for the phase lengths — written by `_times()`, read every frame. */
    this._t = { descend: 0, turn: 0, settle: 0, pour: 0, crack: 0 };
    this._pourK = 0;
    this._crackK = 0;
    this._pileTop = -1;
    this._crackS = 0.6;
    this._crackA = 0;
    this._clock = -1;
    this._seed = 0;
    this._yaw = 0;
    this._dialSpin = 0;
    this._gearClock = 0;
    this._landed = false;
    this._shattered = false;
    this._crackOrigin = new Vector3();
  }

  _mesh(parent, material, order, layer) {
    const mesh = new Mesh(undefined, material);
    mesh.layers.set(layer);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    parent.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.grains = particles.get('hourglass.grain', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.15
    });
    this.grains.uniforms.uDrag.value = 0.6;
    this.grains.uniforms.uEndSize.value = 0.6;
    this.grains.uniforms.uSizeIn.value = 0.02;
    this.grains.uniforms.uFadeIn.value = 0.02;
    this.grains.uniforms.uFadeOut.value = 0.4;

    this.motes = particles.get('hourglass.mote', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      swirl: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.15;
    this.motes.uniforms.uFadeIn.value = 0.2;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uSwirlExpand.value = 0.15;

    this.dust = particles.get('hourglass.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.6
    });
    this.dust.uniforms.uDrag.value = 1.4;
    this.dust.uniforms.uEndSize.value = 2.0;
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.12;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.chips = particles.get('hourglass.chip', {
      capacity: 1600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uDrag.value = 0.6;
    this.chips.uniforms.uEndSize.value = 0.5;
    this.chips.uniforms.uSizeIn.value = 0.03;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.35;

    this.glints = particles.get('hourglass.glint', {
      capacity: 800,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.glints.uniforms.uDrag.value = 2.4;
    this.glints.uniforms.uEndSize.value = 0.2;
    this.glints.uniforms.uSizeIn.value = 0.02;
    this.glints.uniforms.uFadeIn.value = 0.01;
    this.glints.uniforms.uFadeOut.value = 0.6;

    this.grainEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
    this.travelEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* The lathe — rebuilt only when a (rebuild) slider moves              */
  /* ------------------------------------------------------------------ */

  _buildShape() {
    const c = settings.hourglass;
    let changed = false;
    for (let i = 0; i < SHAPE_KEYS.length; i++) {
      const v = c[SHAPE_KEYS[i]];
      if (v !== this._shape[i]) {
        this._shape[i] = v;
        changed = true;
      }
    }
    if (!changed) return;

    _profile.half = Math.max(0.3, c.glassHalfHeight);
    _profile.neck = Math.max(0.01, c.neckRadius);
    _profile.radius = Math.max(_profile.neck + 0.05, c.bulbRadius);
    _profile.shape = c.bulbShape;
    _profile.cap = c.capRatio;
    this._half = _profile.half;

    const pillarRadius = Math.max(0.01, c.pillarRadius);
    const pillarRing = _profile.radius + pillarRadius * 2 + 0.03;
    const capRadius = Math.max(_profile.radius * c.capOverhang, pillarRing + pillarRadius * 2.5);
    const capThickness = Math.max(0.03, c.capThickness);
    this._capRadius = capRadius;
    this._capThickness = capThickness;

    const swap = (mesh, geometry) => {
      const old = mesh.geometry;
      mesh.geometry = geometry;
      if (old && old !== geometry && old !== this.streamGeometry) old.dispose();
    };

    const glassGeometry = createBulbGeometry(_profile, 1);
    swap(this.glass, glassGeometry);
    // The lens shares the glass's lathe; it is not disposed separately.
    this.lens.geometry = glassGeometry;
    swap(this.sand, createBulbGeometry(_profile, SAND_INSET));
    bulbVolumeTable(_profile, SAND_INSET, this._vol);

    swap(
      this.frame,
      createFrameGeometry({
        half: _profile.half,
        radius: _profile.radius,
        capRadius,
        capThickness,
        pillars: Math.min(MAX_PILLARS, Math.max(0, Math.round(c.pillarCount))),
        pillarRadius,
        pillarRing
      })
    );

    // The plate gears share one geometry; they are placed and turned per frame.
    const gear = createGearGeometry(c.gearTeeth, capRadius * 0.96, capRadius * 1.04 * Math.max(1, c.gearRadius), 0.07, capThickness * 0.45);
    const oldGear = this.gearTop.geometry;
    this.gearTop.geometry = gear;
    this.gearBottom.geometry = gear;
    oldGear?.dispose();

    // The armillary ring stands vertical round the whole rig.
    const outer = (_profile.half + capThickness) * Math.max(1.02, c.orbitRadius);
    const orbit = createGearGeometry(Math.round(c.gearTeeth * 1.6), outer - 0.06, outer, 0.05, 0.05);
    orbit.rotateX(Math.PI / 2);
    swap(this.orbit, orbit);
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _times() {
    const c = settings.hourglass;
    const l = settings.global.lifetime;
    const t = this._t;
    t.descend = Math.max(0.05, c.descendTime * l);
    t.turn = Math.max(0.05, c.turnTime * l);
    t.settle = Math.max(0.02, c.settleTime * l);
    t.pour = Math.max(0.1, c.lifetime * l);
    t.crack = Math.max(0.05, c.crackTime * l);
    return t;
  }

  get impactDuration() {
    const t = this._times();
    return t.descend + t.turn + t.settle + t.pour + t.crack;
  }

  get fadeDuration() {
    return Math.max(0.1, settings.hourglass.shatterTime * settings.global.lifetime);
  }

  /** Candlelight through gold glass: slow, faint. */
  lightShimmer() {
    return 0.9 + 0.1 * Math.sin(this.age * 3.3) * Math.sin(this.age * 1.9 + 0.7);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._seed = Math.random() * 100;
    this._yaw = Math.random() * TAU;
    this._dialSpin = 0;
    this._gearClock = 0;
    this._landed = false;
    this._shattered = false;
    this._shardCount = 0;
    this.grainEmitter.reset();
    this.moteEmitter.reset();
    this.travelEmitter.reset();

    // Where the cracks will start: low on the bulb that ends up at the bottom.
    const a = Math.random() * TAU;
    const s = 0.45 + Math.random() * 0.35;
    this._crackS = s;
    this._crackA = a;

    for (let i = 0; i < MAX_TRACK; i++) {
      const r = this.track[i];
      r.dummy = null;
      r.age = 0;
      r.crumble = -1;
      r.done = false;
      r.dust.reset();
      r.chips.reset();
    }
    this._trackCount = 0;

    this.shards.count = 0;
    this.shards.visible = false;
    for (let i = 0; i < MAX_SHARDS; i++) this.shards.setMatrixAt(i, _zero);
    this.shards.instanceMatrix.needsUpdate = true;
    this.glass.visible = true;
    this.sand.visible = true;
    this.lens.visible = true;
    this.rig.visible = false;
    this.dial.visible = false;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = settings.hourglass;
    const g = settings.global;
    syncSystem(this.grains, c.colorGrainA, c.colorGrainB, c.colorGrainC, c.colorGrainD, c.grainSize, c.grainGlow * g.glow, 0.05);
    this.grains.uniforms.uGravity.value.set(0, c.grainGravity, 0);
    syncSystem(this.motes, c.colorGrainA, c.colorGrainB, c.colorGrainC, c.colorGrainD, c.moteSize, c.moteGlow * g.glow, 0.4);
    this.motes.uniforms.uGravity.value.set(0, c.moteRise * 0.3, 0);
    this.motes.uniforms.uSwirl.value = c.moteSwirl * g.animationSpeed;
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.5);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.2, 0);
    syncSystem(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, 0.1);
    this.chips.uniforms.uGravity.value.set(0, -9, 0);
    syncSystem(this.glints, c.colorGrainA, c.colorGrainB, c.colorGrainC, c.colorGrainD, c.glintSize, c.grainGlow * g.glow, 0.1);
    this.glints.uniforms.uGravity.value.set(0, -6, 0);
    this.glints.uniforms.uStretch.value = 0.35;
  }

  /**
   * Resolve the whole hourglass for this frame: where the rig is and how it
   * is turned, the sand, the clockwork, the dial. Runs on a zero-length frame
   * too, so the editor reshapes a paused cast.
   */
  _updateRig(dt) {
    const c = settings.hourglass;
    const g = settings.global;
    this._buildShape();
    const t = this._times();
    const clock = this._clock;
    const travelling = clock < 0;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const fd = this.fadeDuration;

    const H = this._half;
    const size = Math.max(0.1, c.size);
    const capT = this._capThickness;

    /* --- where the clock is --- */
    const descendK = travelling ? 0 : saturate(clock / t.descend);
    const turnK = travelling ? 0 : saturate((clock - t.descend) / t.turn);
    const settleK = travelling ? 0 : saturate((clock - t.descend - t.turn) / t.settle);
    const pourStart = t.descend + t.turn + t.settle;
    const pourK = travelling ? 0 : saturate((clock - pourStart) / t.pour);
    const crackK = travelling ? 0 : saturate((clock - pourStart - t.pour) / t.crack);
    this._pourK = pourK;
    this._crackK = crackK;

    /* --- the rig: down, over, breathing, trembling --- */
    this.pointAt(1, _centre);
    const restY = c.hoverHeight + (H + capT * 1.05) * size;
    let y;
    let reveal;
    if (travelling) {
      y = restY + c.dropHeight;
      reveal = c.travelGhost * smoothstep(0, 1, this.u);
    } else {
      y = restY + c.dropHeight * (1 - Easing.inOutCubic(descendK));
      const since = clock - t.descend;
      if (since > 0) y += c.dropBounce * 0.25 * Math.sin(since * 14) * Math.exp(-since * 5);
      y += c.turnLift * Math.sin(Math.PI * turnK);
      y += c.bob * Math.sin(this.age * c.bobSpeed) * settleK;
      reveal = lerp(c.travelGhost, 1, Easing.outCubic(descendK));
    }
    if (!this._landed && descendK >= 1) {
      this._landed = true;
      this._landFx(c, g);
    }

    this._yaw += c.spinRate * dt * g.animationSpeed;
    const flip = Math.PI * (1 - Easing.inOutCubic(turnK));
    _qYaw.setFromAxisAngle(_up, this._yaw);
    _qFlip.setFromAxisAngle(this.side, flip);
    this.rig.quaternion.multiplyQuaternions(_qFlip, _qYaw);
    this.rig.position.set(_centre.x, y, _centre.z);
    if (crackK > 0 && !fading) {
      const k = c.tremble * crackK;
      const time = frame.uTime.value;
      this.rig.position.x += Math.sin(time * 71.3) * k;
      this.rig.position.z += Math.sin(time * 63.7 + 1.3) * k;
      this.rig.position.y += Math.sin(time * 57.1 + 2.1) * k * 0.5;
    }
    this.rig.scale.setScalar(size);
    this.rig.visible = true;
    this.rig.updateMatrixWorld(true);

    /* --- clockwork: the plate gears tick round, opposite ways --- */
    this._gearClock += dt * g.animationSpeed;
    const gearTime = ticked(this._gearClock, Math.max(0.1, c.tickRate), saturate(c.gearTick));
    const gearA = gearTime * c.gearSpeed;
    this.gearTop.position.set(0, H + capT * 0.5, 0);
    this.gearTop.rotation.set(0, gearA, 0);
    this.gearBottom.position.set(0, -H - capT * 0.5, 0);
    this.gearBottom.rotation.set(0, -gearA * 1.3, 0);
    this.orbitPivot.rotation.set(c.orbitTilt, this._gearClock * c.orbitSpeed, 0, 'YXZ');

    /* --- materialise, and dissolve at the end --- */
    let frameReveal = reveal;
    if (fading) frameReveal = 1 - saturate(ft / (fd * 0.75));
    _brassState.reveal = frameReveal;
    _brassState.seed = this._seed;
    this.brassMaterial.userData.sync(_brassState);

    _glassState.reveal = reveal;
    _glassState.crack = crackK;
    this._crackLocal(_glassState.crackOrigin);
    _glassState.fade = 1;
    _glassState.half = H;
    _glassState.seed = this._seed;
    this.glassMaterial.userData.sync(_glassState);
    this.lensMaterial.userData.sync(this._shattered ? 0 : reveal);

    /* --- the sand, by volume --- */
    this._updateSand(c, H, reveal, settleK, pourK);

    /* --- the dial --- */
    this._updateDial(dt, c, g, t, travelling, descendK, turnK, pourK, fading, ft, fd);
  }

  /** The crack's origin in rig space: low on the bulb that ends up at the bottom (local −y). */
  _crackLocal(out) {
    const s = this._crackS;
    const r = bulbRadius(s, _profile);
    return out.set(Math.cos(this._crackA) * r, -s * this._half, Math.sin(this._crackA) * r);
  }

  /**
   * Levels from volumes. Bulb A (local +y) holds the sand at the start; while
   * the rig is upside down that sand is packed against A's cap. Once it has
   * turned, the sand drops to the neck (`settleK`) and drains at `pourK`; what
   * leaves A is exactly what heaps up in B, by the same table.
   */
  _updateSand(c, H, reveal, settleK, pourK) {
    const table = this._vol;
    const total = table[VOLUME_SAMPLES];
    const fill = saturate(c.sandFill) * total;

    const capLo = levelForVolume(table, total - fill) * H;
    const inA = fill * (1 - pourK);
    const neckHi = levelForVolume(table, inA) * H;
    const fall = Easing.inQuad(settleK);
    const aLo = lerp(capLo, 0, fall);
    const aHi = lerp(H * 1.02, neckHi, fall);

    const inB = fill * pourK;
    const cone = c.pileCone * Math.min(1, pourK * 4);
    let bHi = -levelForVolume(table, total - inB) * H - cone * 0.33;
    if (inB <= total * 0.002) bHi = -H - 0.05;

    _sandState.aLo = aLo;
    _sandState.aHi = inA <= total * 0.002 && settleK >= 1 ? -1 : aHi;
    _sandState.bHi = bHi;
    _sandState.dimple = c.dimple * Math.min(1, pourK * 6) * (1 - pourK) * settleK;
    _sandState.cone = cone;
    _sandState.radius = _profile.radius * SAND_INSET;
    _sandState.reveal = reveal;
    _sandState.seed = this._seed;
    this.sandMaterial.userData.sync(_sandState);

    // The thread through the neck, down to the top of the pile.
    const pouring = settleK >= 1 && pourK > 0 && pourK < 1 && !this._shattered;
    const peak = bHi + cone;
    const length = Math.max(0.02, -peak);
    _streamState.length = length;
    _streamState.level = pouring ? Math.min(1, pourK * 25) * Math.min(1, (1 - pourK) * 25) : 0;
    this.streamMaterial.userData.sync(_streamState);
    const w = Math.max(0.004, _profile.neck * c.streamWidth);
    this.stream.scale.set(w, length, w);
    this.stream.visible = _streamState.level > 0.001;
    this._pileTop = peak;
  }

  _updateDial(dt, c, g, t, travelling, descendK, turnK, pourK, fading, ft, fd) {
    this._dialSpin += c.dialSpin * dt * g.animationSpeed;

    // The hands: a full turn backward while it turns over, then ticking
    // forward `handTurns` over the pour. One continuous total, so the hour
    // hand never jumps.
    const rewind = -TAU * Easing.inOutCubic(turnK);
    const pourTime = ticked(pourK * t.pour, Math.max(0.1, c.tickRate), saturate(c.tickSnap));
    const forward = (TAU * c.handTurns * pourTime) / t.pour;
    const total = rewind + forward;

    let tick = 0;
    if (pourK > 0 && pourK < 1) {
      const phase = pourK * t.pour * Math.max(0.1, c.tickRate);
      tick = (1 - saturate((phase - Math.floor(phase)) * 4)) * saturate(c.tickSnap);
    }

    let reveal = travelling ? 0.3 * this.u : 0.3 + 0.7 * Easing.outCubic(descendK);
    let fade = 1;
    let spill = 0;
    if (fading) {
      fade = 1 - smoothstep(0.35, 1, ft / fd);
      spill = Easing.outCubic(saturate(ft / (fd * 0.3)));
    }
    if (travelling) reveal = Math.min(reveal, 0.3);

    this.pointAt(1, _centre);
    _dialState.centre.copy(_centre);
    _dialState.forward.copy(this.direction);
    _dialState.radius = Math.max(0.3, c.zoneRadius * c.dialRadius);
    _dialState.spin = this._dialSpin;
    _dialState.minute = total;
    _dialState.hour = total * c.hourRatio;
    _dialState.elapsed = pourK;
    _dialState.reveal = reveal;
    _dialState.tick = tick;
    _dialState.spill = spill;
    _dialState.fade = fade;
    _dialState.seed = this._seed;
    this.dialMaterial.userData.sync(_dialState);
    this.dial.visible = true;
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _record(dummy) {
    for (let i = 0; i < this._trackCount; i++) if (this.track[i].dummy === dummy) return this.track[i];
    if (this._trackCount >= MAX_TRACK) return null;
    const r = this.track[this._trackCount++];
    r.dummy = dummy;
    r.age = 0;
    r.crumble = -1;
    r.done = false;
    r.dust.reset();
    r.chips.reset();
    return r;
  }

  /** Age everything in the circle while the sand runs; crumble what has run out. */
  _ageBodies(dt, c, g, aging) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    this.pointAt(1, _centre);
    const R = Math.max(0.3, c.zoneRadius);

    if (aging && dt > 0) {
      const found = field.findBodies(_centre.x, _centre.z, R, this._found);
      for (let f = 0; f < found.length; f++) {
        const r = this._record(found[f]);
        if (!r || r.done) continue;
        const d = Math.hypot(r.dummy.position.x - _centre.x, r.dummy.position.z - _centre.z);
        const rate = 1 - saturate(c.ageFalloff) * saturate(d / R);
        r.age += (dt / Math.max(0.05, c.ageTime * g.lifetime)) * rate;
      }
      this._found.length = 0;
    }

    for (let i = 0; i < this._trackCount; i++) {
      const r = this.track[i];
      if (r.done) continue;
      const dummy = r.dummy;
      const age = saturate(r.age);

      if (r.crumble < 0) {
        dummy.corrode(age * 0.92, c.look);
        if (dummy.alive && dt > 0 && dummy.mixer) {
          // Slowing: the field steps this body's clip forward by dt × the
          // global animation speed right after the abilities run, so winding
          // it back by a share of that here is a body whose own time runs
          // slower — down to (1 − slowMax) of normal at full age.
          const slow = saturate(c.slowMax) * Easing.outQuad(age);
          if (slow > 0) dummy.mixer.update(-dt * g.animationSpeed * slow);
        }
        this._agingFx(dt, r, c, g, age);
        if (r.age >= 1) this._crumbleStart(r, c, g);
        continue;
      }

      // Crumbling: taken apart and settled into its own pile.
      r.crumble += dt / Math.max(0.05, c.crumbleTime * g.lifetime);
      const k = saturate(r.crumble);
      dummy.corrode(1, c.look);
      dummy.hold();
      dummy.sink(c.crumbleSink * Easing.outQuad(k));
      const gone = dummy.consume(Easing.inQuad(k) * 1.06);
      this._crumbleFx(dt, r, c, g, k);
      if (k >= 1 || gone >= 1) {
        r.done = true;
        dummy.release();
      }
    }
  }

  _crumbleStart(r, c, g) {
    const dummy = r.dummy;
    r.crumble = 0;
    this.pointAt(1, _centre);
    if (dummy.alive) {
      // It folds where it stood: almost no force, a little away from the glass.
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      this._force.impulse = c.crumbleImpulse;
      this._force.lift = c.crumbleLift;
      this._force.spin = c.crumbleSpin;
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    // A puff of dust and a ring of sand where it falls.
    _pos.set(dummy.position.x, 0, dummy.position.z);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: 1.3,
      life: 1.2,
      intensity: 0.8,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorSpill),
      growth: 0.3,
      height: 0.02
    });
    _emit.position = _pos.setY(0.9);
    _emit.radius = 0.45;
    _emit.direction = _up;
    _emit.speed = 0.8;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.5;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.dust.emit(Math.round(8 * g.particleCount), _emit);
  }

  /** Dust shed by a body as it ages, more the older it gets. */
  _agingFx(dt, r, c, g, age) {
    const count = Math.round(r.dust.tick(dt, c.bodyDust * age * age) * g.particleCount);
    if (count <= 0) return;
    const dummy = r.dummy;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = 0.35;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.32;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime * 0.8;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.4;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    for (let k = 0; k < count; k++) {
      _pos.set(dummy.position.x, 0.3 + Math.random() * 1.3, dummy.position.z);
      _emit.position = _pos;
      this.dust.emit(1, _emit);
    }
    // A few gold grains too, the time going out of it.
    if (Math.random() < age * 0.5) {
      _emit.size = 0.06;
      _emit.speed = 0.6;
      _emit.life = c.grainLifetime * 1.5;
      this.grains.emit(1, _emit);
    }
  }

  /** Sand chips and grains falling off a crumbling body. */
  _crumbleFx(dt, r, c, g, k) {
    const count = Math.round(r.chips.tick(dt, c.bodyChips * (1 - k * 0.7)) * g.particleCount);
    if (count <= 0) return;
    const dummy = r.dummy;
    if (!dummy.bodyPoint(_pos2)) _pos2.set(dummy.position.x, 0.6, dummy.position.z);
    _pos2.y = Math.max(0.15, _pos2.y);
    _emit.position = _pos2;
    _emit.radius = 0.45;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.6;
    _emit.life = c.chipLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 8;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.chips.emit(count, _emit);
    _emit.speed = c.chipSpeed * 0.6;
    _emit.size = 0.05;
    _emit.life = c.grainLifetime * 1.4;
    _emit.spin = 0;
    this.grains.emit(Math.max(1, count >> 1), _emit);
    if (Math.random() < 0.35) {
      _emit.size = 0.4;
      _emit.speed = 0.5;
      _emit.life = c.dustLifetime;
      _emit.spin = 0.4;
      this.dust.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** It settles onto the circle: dust, a ring, a soft thud. */
  _landFx(c, g) {
    const power = g.explosionIntensity;
    this.pointAt(1, _centre);
    this.ctx.shake.add(c.landShake * power, 4, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.landFlash * power);
    this.lightBoost = c.impactLight * 0.6 * power;
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.dustRingRadius,
      life: c.dustRingLife,
      intensity: 0.9,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.4,
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * 0.7 * power,
      life: c.shockLife,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    _emit.position = _pos.copy(_centre).setY(0.3);
    _emit.radius = this._capRadius * Math.max(0.1, c.size);
    _emit.direction = _up;
    _emit.speed = 1.6;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.6;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.dust.emit(Math.round(18 * g.particleCount), _emit);
  }

  /** Grains through the neck, and motes of time orbiting the glass. */
  _pourFx(dt, c, g) {
    const size = Math.max(0.1, c.size);
    const pouring = this._pourK > 0 && this._pourK < 1 && !this._shattered;
    const n = Math.round(this.grainEmitter.tick(dt, pouring ? c.grainRate : 0) * g.particleCount);
    if (n > 0) {
      this.rig.localToWorld(_pos.set(0, -0.05, 0));
      _emit.position = _pos;
      _emit.radius = _profile.neck * size * 0.6;
      _emit.direction = _down;
      _emit.speed = 0.6;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.12;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.05;
      _emit.sizeVariance = 0.6;
      // Long enough to reach the pile, not to fall through it.
      const drop = Math.max(0.05, -this._pileTop) * size;
      const fallTime = Math.sqrt((2 * drop) / Math.max(0.5, -c.grainGravity));
      _emit.life = Math.min(c.grainLifetime, fallTime * 0.9);
      _emit.lifeVariance = 0.2;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.grains.emit(n, _emit);
    }

    const live = this._clock >= 0 && !this._shattered;
    const m = Math.round(this.moteEmitter.tick(dt, live ? c.moteRate : 0) * g.particleCount);
    if (m > 0) {
      const R = _profile.radius * size;
      _emit.direction = _up;
      _emit.speed = c.moteRise;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.3;
      _emit.inherit = null;
      _emit.anchor = this.rig.position;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.6;
      _emit.life = c.moteLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      for (let k = 0; k < m; k++) {
        const a = Math.random() * TAU;
        const rr = R * (1.25 + Math.random() * 0.6);
        _pos.set(
          this.rig.position.x + Math.cos(a) * rr,
          this.rig.position.y + (Math.random() * 2 - 1) * this._half * size,
          this.rig.position.z + Math.sin(a) * rr
        );
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
      _emit.anchor = null;
    }
  }

  /** The sand runs out: the glass bursts. */
  _shatter(c, g) {
    this._shattered = true;
    const power = g.explosionIntensity;
    const size = Math.max(0.1, c.size);
    const H = this._half;
    const centre = this.rig.position;
    this.rig.updateMatrixWorld(true);

    /* --- shards, thrown off the glass where it was --- */
    const n = Math.min(MAX_SHARDS, Math.max(0, Math.round(c.shardCount * g.particleCount)));
    for (let i = 0; i < n; i++) {
      const s = this.shardRecs[i];
      const sy = Math.random() * 2 - 1;
      const a = Math.random() * TAU;
      const r = bulbRadius(Math.abs(sy) * 0.95, _profile);
      s.pos.set(Math.cos(a) * r, sy * H * 0.95, Math.sin(a) * r);
      this.rig.localToWorld(s.pos);
      s.vel.subVectors(s.pos, centre);
      s.vel.y *= 0.4;
      s.vel.normalize().multiplyScalar(c.shardSpeed * power * (0.45 + Math.random() * 0.75));
      s.vel.y += c.shardLift * (0.3 + Math.random() * 0.9);
      s.axis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      s.angle = Math.random() * TAU;
      s.spin = c.shardSpin * (0.5 + Math.random());
      s.size = c.shardSize * size * (0.45 + Math.random() * 0.8);
      s.seed = Math.random();
      s.age = 0;
      s.life = c.shardLife * g.lifetime * (0.7 + Math.random() * 0.5);
    }
    this._shardCount = n;
    this.shards.visible = n > 0;

    this.glass.visible = false;
    this.lens.visible = false;
    this.sand.visible = false;
    this.stream.visible = false;

    const time = frame.uTime.value;
    /* --- glints and the spilling sand --- */
    _emit.position = centre;
    _emit.radius = _profile.radius * size * 0.8;
    _emit.direction = _up;
    _emit.speed = c.glintSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glintLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.glints.emit(Math.round(c.glintCount * g.particleCount), _emit);

    this.rig.localToWorld(_pos.set(0, -H * 0.6, 0));
    _emit.position = _pos;
    _emit.radius = _profile.radius * size * 0.6;
    _emit.speed = 3.2;
    _emit.spread = 0.9;
    _emit.size = 0.06;
    _emit.life = 0.9;
    this.grains.emit(Math.round(c.spillGrains * g.particleCount), _emit);
    _emit.speed = c.chipSpeed * 1.4;
    _emit.size = 0.07;
    _emit.life = c.chipLifetime;
    _emit.spin = 8;
    this.chips.emit(Math.round(c.spillGrains * 0.3 * g.particleCount), _emit);
    _emit.speed = 1.2;
    _emit.size = 0.7;
    _emit.life = c.dustLifetime;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(14 * g.particleCount), _emit);

    /* --- the beat --- */
    this.ctx.bursts.spawn(BurstMode.AIR, _pos2.copy(centre), {
      radius: 0.3,
      endRadius: c.burstRadius * power * size,
      life: c.burstLife,
      intensity: 2.2,
      opacity: 0.8 * g.opacity,
      squash: 0.9,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.pointAt(1, _centre);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.shake.add(c.shatterShake * power, 3, 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.shatterFlash * power);
    this.lightBoost = c.impactLight * power;
  }

  _updateShards(dt) {
    const c = settings.hourglass;
    const n = this._shardCount;
    if (n === 0) return;
    this.shardMaterial.userData.sync();
    const floor = 0.03;
    const attr = this.shardAttr.array;
    let alive = 0;
    for (let i = 0; i < n; i++) {
      const s = this.shardRecs[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.shards.setMatrixAt(i, _zero);
        attr[i * 2 + 1] = 0;
        continue;
      }
      alive++;
      s.vel.y += c.shardGravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < floor) {
        s.pos.y = floor;
        if (s.vel.y < 0) s.vel.y = -s.vel.y * c.shardBounce;
        s.vel.x *= 0.55;
        s.vel.z *= 0.55;
        s.spin *= 0.5;
      }
      s.angle += s.spin * dt;
      _q.setFromAxisAngle(s.axis, s.angle);
      _scale.setScalar(s.size);
      _m.compose(s.pos, _q, _scale);
      this.shards.setMatrixAt(i, _m);
      attr[i * 2] = s.seed;
      attr[i * 2 + 1] = 1 - smoothstep(s.life * 0.55, s.life, s.age);
    }
    this.shards.count = n;
    this.shards.visible = alive > 0;
    this.shards.instanceMatrix.needsUpdate = true;
    this.shardAttr.needsUpdate = true;
  }

  /** The thread of sand running along the floor to the circle. */
  _travelFx(dt) {
    const c = settings.hourglass;
    const g = settings.global;
    const n = Math.round(this.travelEmitter.tick(dt, c.travelGlitter) * g.particleCount);
    if (n <= 0) return;
    _emit.position = _pos.copy(this.position).setY(0.12);
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = 0.6;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.5;
    _emit.life = c.grainLifetime * 1.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = getColor(Math.random() < 0.5 ? c.colorA : c.colorB);
    _emit.time = frame.uTime.value;
    this.grains.emit(n, _emit);
    _emit.tint = null;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._syncParticles();
    this._travelFx(dt);
    this._updateRig(dt);
    // The light rides the thread, low.
    this.position.y = 0.5;
  }

  onImpact() {
    this._clock = 0;
    this.lightBoost = settings.hourglass.lightIntensity * 0.3;
  }

  onFade(dt) {
    const c = settings.hourglass;
    const g = settings.global;
    const fading = this.phase === AbilityPhase.FADE;
    this._clock = fading ? this.impactDuration + this.fadeTime : this.impactTime;
    this._syncParticles();
    if (fading && !this._shattered) this._shatter(c, g);
    this._updateRig(dt);
    this._pourFx(dt, c, g);
    this._ageBodies(dt, c, g, !fading && this._pourK > 0);
    this._updateShards(dt);
    // The light lives in the neck, then sinks to the spilt sand.
    this.position.copy(this.rig.position);
    if (fading) this.position.y = lerp(this.rig.position.y, 0.5, saturate(this.fadeTime / this.fadeDuration));
  }

  onDestroy() {
    this._clock = -1;
    for (let i = 0; i < this._trackCount; i++) {
      const r = this.track[i];
      if (!r.done && r.dummy) r.dummy.release();
      r.dummy = null;
    }
    this._trackCount = 0;
    this._shardCount = 0;
    this.rig.visible = false;
    this.dial.visible = false;
    this.shards.count = 0;
    this.shards.visible = false;
  }

  dispose() {
    const geometries = new Set([
      this.glass.geometry,
      this.sand.geometry,
      this.frame.geometry,
      this.gearTop.geometry,
      this.orbit.geometry,
      this.streamGeometry,
      this.dialGeometry,
      this.shardGeometry
    ]);
    for (const geometry of geometries) geometry?.dispose();
    for (const material of [
      this.glassMaterial,
      this.lensMaterial,
      this.brassMaterial,
      this.sandMaterial,
      this.streamMaterial,
      this.dialMaterial,
      this.shardMaterial
    ]) {
      material.dispose();
    }
    this.shards.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⌛  Hourglass Sunder');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'thread speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'travelGlitter', 0, 500, 1, 'thread glitter / s');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, pale');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'descendTime', 0.05, 4, 0.01, 'descends over');
  R(time, c, 'turnTime', 0.05, 4, 0.01, 'turns over in');
  R(time, c, 'settleTime', 0.02, 1, 0.01, 'sand drops in');
  R(time, c, 'lifetime', 0.1, 10, 0.05, 'sand runs for');
  R(time, c, 'crackTime', 0.05, 3, 0.01, 'cracks for');
  R(time, c, 'shatterTime', 0.1, 5, 0.05, 'shatters over');

  const glass = folder.addFolder('1 · Hourglass');
  const shape = glass.addFolder('Shape (rebuild)');
  R(shape, c, 'size', 0.2, 3, 0.01, 'scale');
  R(shape, c, 'glassHalfHeight', 0.3, 4, 0.01, 'half height (m)');
  R(shape, c, 'bulbRadius', 0.2, 3, 0.01, 'bulb radius (m)');
  R(shape, c, 'neckRadius', 0.01, 0.4, 0.005, 'neck radius (m)');
  R(shape, c, 'bulbShape', 0.15, 0.9, 0.01, 'widest point');
  R(shape, c, 'capRatio', 0.2, 1, 0.01, 'radius at cap');
  R(shape, c, 'capThickness', 0.03, 0.8, 0.01, 'end plate (m)');
  R(shape, c, 'capOverhang', 1, 2, 0.01, 'end plate overhang');
  R(shape, c, 'pillarCount', 0, MAX_PILLARS, 1, 'spindles');
  R(shape, c, 'pillarRadius', 0.01, 0.2, 0.005, 'spindle radius (m)');

  const motion = glass.addFolder('Motion');
  R(motion, c, 'hoverHeight', 0, 3, 0.01, 'hover (m)');
  R(motion, c, 'dropHeight', 0, 20, 0.1, 'drops from (m)');
  R(motion, c, 'dropBounce', 0, 2, 0.01, 'landing bounce');
  R(motion, c, 'turnLift', 0, 2, 0.01, 'lifts to turn (m)');
  R(motion, c, 'spinRate', -2, 2, 0.01, 'spin (rad/s)');
  R(motion, c, 'bob', 0, 0.5, 0.005, 'bob (m)');
  R(motion, c, 'bobSpeed', 0, 6, 0.05, 'bob speed');
  R(motion, c, 'tremble', 0, 0.2, 0.002, 'tremble on crack (m)');
  R(motion, c, 'travelGhost', 0, 1, 0.01, 'ghost during travel');

  const gl = glass.addFolder('Ghost glass');
  gl.addColor(c, 'glassTint').name('tint');
  gl.addColor(c, 'glassRim').name('rim');
  R(gl, c, 'glassOpacity', 0, 1, 0.005, 'opacity');
  R(gl, c, 'glassFresnel', 0, 4, 0.01, 'fresnel');
  R(gl, c, 'glassFresnelPower', 0.5, 8, 0.05, 'fresnel power');
  R(gl, c, 'glassEnv', 0, 3, 0.01, 'reflection');
  R(gl, c, 'glassRefract', 0, 2, 0.01, 'refraction');
  R(gl, c, 'glassIOR', 1, 2.4, 0.01, 'IOR');
  R(gl, c, 'glassRimGlow', 0, 6, 0.05, 'rim glow');
  R(gl, c, 'glassShimmer', 0, 2, 0.01, 'ghost light');
  R(gl, c, 'glassShimmerScale', 0.1, 8, 0.05, 'ghost light scale');
  R(gl, c, 'glassSparkle', 0, 4, 0.01, 'glints');
  R(gl, c, 'ghostFlicker', 0, 1, 0.01, 'flicker');
  R(gl, c, 'distortStrength', 0, 3, 0.01, 'bends the world');
  R(gl, c, 'revealEdge', 0.01, 0.5, 0.005, 'materialise edge');
  gl.addColor(c, 'colorReveal').name('materialise edge');
  R(gl, c, 'crackScale', 0.5, 12, 0.05, 'crack scale');
  R(gl, c, 'crackWidth', 0.005, 0.3, 0.005, 'crack width');
  R(gl, c, 'crackGlow', 0, 10, 0.05, 'crack glow');
  gl.addColor(c, 'colorCrack').name('cracks');

  const brass = glass.addFolder('Brass & clockwork');
  brass.addColor(c, 'colorBrass').name('brass');
  brass.addColor(c, 'colorBrassDark').name('patina');
  brass.addColor(c, 'colorGhost').name('ghost glow');
  R(brass, c, 'brassMetal', 0, 1, 0.01, 'metalness');
  R(brass, c, 'brassEnv', 0, 3, 0.01, 'reflection');
  R(brass, c, 'brassSpecular', 0, 8, 0.05, 'specular');
  R(brass, c, 'brassGloss', 2, 400, 1, 'gloss');
  R(brass, c, 'brassEngrave', 0, 1, 0.01, 'engraving');
  R(brass, c, 'engraveScale', 0.5, 20, 0.1, 'engraving scale');
  R(brass, c, 'brassPatina', 0, 1, 0.01, 'patina');
  R(brass, c, 'brassGhost', 0, 4, 0.01, 'ghost glow');
  R(brass, c, 'gearTeeth', 8, 96, 1, 'gear teeth (rebuild)');
  R(brass, c, 'gearRadius', 1, 1.6, 0.01, 'gear radius (rebuild)');
  R(brass, c, 'gearSpeed', -4, 4, 0.01, 'gear speed');
  R(brass, c, 'gearTick', 0, 1, 0.01, 'gear ticking');
  R(brass, c, 'orbitRadius', 1.02, 2.5, 0.01, 'armillary radius (rebuild)');
  R(brass, c, 'orbitSpeed', -4, 4, 0.01, 'armillary speed');
  R(brass, c, 'orbitTilt', -1.5, 1.5, 0.01, 'armillary tilt');

  const sand = glass.addFolder('Sand');
  sand.addColor(c, 'colorSand').name('sand');
  sand.addColor(c, 'colorSandDark').name('sand, shade');
  sand.addColor(c, 'colorSandTop').name('surface');
  R(sand, c, 'sandFill', 0.05, 0.95, 0.01, 'fill');
  R(sand, c, 'sandGlow', 0, 3, 0.01, 'glow');
  R(sand, c, 'sandGrain', 2, 120, 1, 'grain');
  R(sand, c, 'sandSparkle', 0, 6, 0.05, 'sparkle');
  R(sand, c, 'dimple', 0, 1.5, 0.01, 'funnel (m)');
  R(sand, c, 'pileCone', 0, 1.5, 0.01, 'pile cone (m)');
  R(sand, c, 'streamWidth', 0.05, 2, 0.01, 'stream width (× neck)');
  R(sand, c, 'streamGlow', 0, 4, 0.05, 'stream glow');
  R(sand, c, 'streamSpeed', 0, 20, 0.1, 'stream speed');

  const dial = folder.addFolder('2 · Clock face');
  R(dial, c, 'dialRadius', 0.2, 1.6, 0.01, 'radius (× circle)');
  dial.addColor(c, 'colorDial').name('dial');
  dial.addColor(c, 'colorDialHot').name('hands');
  dial.addColor(c, 'colorDialBase').name('base');
  dial.addColor(c, 'colorAged').name('aged sector');
  R(dial, c, 'dialGlow', 0, 8, 0.05, 'glow');
  R(dial, c, 'dialOpacity', 0, 1, 0.01, 'opacity');
  R(dial, c, 'dialBaseOpacity', 0, 1, 0.01, 'base opacity');
  R(dial, c, 'dialRipple', 0, 2, 0.01, 'time ripples');
  R(dial, c, 'ringWidth', 0.005, 0.3, 0.005, 'line width (m)');
  R(dial, c, 'tickLength', 0.01, 0.3, 0.005, 'tick length');
  R(dial, c, 'handGlow', 0, 10, 0.05, 'hand glow');
  R(dial, c, 'handWidth', 0.005, 0.3, 0.005, 'hand width (m)');
  R(dial, c, 'hourHandLength', 0.1, 1, 0.01, 'hour hand');
  R(dial, c, 'minuteHandLength', 0.1, 1, 0.01, 'minute hand');
  R(dial, c, 'handTurns', 0, 12, 0.1, 'minute turns');
  R(dial, c, 'hourRatio', 0, 1, 0.01, 'hour hand ratio');
  R(dial, c, 'tickRate', 0.1, 12, 0.1, 'ticks / s');
  R(dial, c, 'tickSnap', 0, 1, 0.01, 'sweep ↔ tick');
  R(dial, c, 'dialSpin', -2, 2, 0.01, 'dial spin (rad/s)');
  R(dial, c, 'sectorFill', 0, 1, 0.01, 'aged sector');
  dial.addColor(c, 'colorSpill').name('spilt sand');
  R(dial, c, 'spillRadius', 0, 1.2, 0.01, 'spill radius');

  const age = folder.addFolder('3 · Bodies');
  R(age, c, 'ageTime', 0.05, 8, 0.05, 'crumble after (s)');
  R(age, c, 'ageFalloff', 0, 1, 0.01, 'slower at the rim');
  R(age, c, 'slowMax', 0, 1, 0.01, 'slows down to');
  R(age, c, 'crumbleTime', 0.05, 5, 0.05, 'crumbles over');
  R(age, c, 'crumbleSink', 0, 1.5, 0.01, 'sinks into its pile (m)');
  R(age, c, 'crumbleImpulse', 0, 6, 0.05, 'slump impulse');
  R(age, c, 'crumbleLift', 0, 6, 0.05, 'slump lift');
  R(age, c, 'crumbleSpin', 0, 4, 0.05, 'slump spin');
  R(age, c, 'bodyDust', 0, 120, 1, 'dust / s');
  R(age, c, 'bodyChips', 0, 300, 1, 'sand chips / s');
  const look = age.addFolder('Aged look');
  look.addColor(c.look, 'color').name('flesh, dust');
  look.addColor(c.look, 'rimColor').name('rim');
  R(look, c.look, 'rimEmissive', 0, 6, 0.05, 'rim glow');
  look.addColor(c.look, 'edgeColor').name('crumbling edge');
  R(look, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge glow');
  R(look, c.look, 'edgeWidth', 0.01, 0.6, 0.005, 'edge width');

  const fx = folder.addFolder('4 · Particles');
  R(fx, c, 'grainRate', 0, 600, 1, 'grains / s');
  R(fx, c, 'grainSize', 0.005, 0.2, 0.005, 'grain size');
  R(fx, c, 'grainGlow', 0, 8, 0.05, 'grain glow');
  R(fx, c, 'grainLifetime', 0.05, 3, 0.05, 'grain lifetime');
  R(fx, c, 'grainGravity', -20, 0, 0.1, 'grain gravity');
  Editor.gradient(fx, c, 'colorGrain', 'grain colour');
  R(fx, c, 'moteRate', 0, 300, 1, 'time motes / s');
  R(fx, c, 'moteSize', 0.005, 0.3, 0.005, 'mote size');
  R(fx, c, 'moteLifetime', 0.1, 6, 0.05, 'mote lifetime');
  R(fx, c, 'moteSwirl', -6, 6, 0.05, 'mote orbit');
  R(fx, c, 'moteRise', 0, 3, 0.05, 'mote rise');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  R(fx, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(fx, c, 'dustLifetime', 0.1, 5, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust colour');
  R(fx, c, 'chipSize', 0.005, 0.3, 0.005, 'chip size');
  R(fx, c, 'chipSpeed', 0, 10, 0.05, 'chip speed');
  R(fx, c, 'chipLifetime', 0.1, 4, 0.05, 'chip lifetime');
  Editor.gradient(fx, c, 'colorChip', 'chip colour');
  R(fx, c, 'glintCount', 0, 300, 1, 'glints on burst');
  R(fx, c, 'glintSpeed', 0, 30, 0.1, 'glint speed');
  R(fx, c, 'glintSize', 0.005, 0.3, 0.005, 'glint size');
  R(fx, c, 'glintLifetime', 0.05, 2, 0.01, 'glint lifetime');

  const shards = folder.addFolder('5 · Shards');
  R(shards, c, 'shardCount', 0, MAX_SHARDS, 1, 'shards');
  R(shards, c, 'shardSize', 0.02, 1.5, 0.01, 'size (m)');
  R(shards, c, 'shardSpeed', 0, 20, 0.1, 'speed');
  R(shards, c, 'shardLift', 0, 12, 0.1, 'lift');
  R(shards, c, 'shardSpin', 0, 30, 0.1, 'spin (rad/s)');
  R(shards, c, 'shardGravity', -40, 0, 0.5, 'gravity');
  R(shards, c, 'shardBounce', 0, 1, 0.01, 'bounce');
  R(shards, c, 'shardLife', 0.1, 5, 0.05, 'lifetime');
  R(shards, c, 'shardGlow', 0, 6, 0.05, 'glow');
  R(shards, c, 'spillGrains', 0, 800, 1, 'spilt grains');

  const beat = folder.addFolder('6 · The beat');
  R(beat, c, 'landShake', 0, 1, 0.01, 'landing shake');
  R(beat, c, 'landFlash', 0, 1, 0.01, 'landing flash');
  R(beat, c, 'shatterShake', 0, 1, 0.01, 'burst shake');
  R(beat, c, 'shatterFlash', 0, 1, 0.01, 'burst flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'air shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, cool');
  R(beat, c, 'shockRadius', 0, 15, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'dustRingRadius', 0, 12, 0.05, 'dust ring (m)');
  R(beat, c, 'dustRingLife', 0.1, 5, 0.05, 'dust ring life');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'impactLight', 0, 60, 0.5, 'light punch');
}
