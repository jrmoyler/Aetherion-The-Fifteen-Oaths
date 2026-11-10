import {
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createCrimsonArcMaterial,
  createCrimsonBeamMaterial,
  createCrimsonCircleMaterial,
  createCrimsonMoonMaterial,
  createCrimsonPoolMaterial,
  createCrimsonSealMaterial,
  createCrimsonSpikeMaterial
} from '../../materials/collective/CrimsonRiteMaterials.js';
import { createBloodSealGeometry, createBloodSpikeGeometry } from '../../assets/collective/CrimsonRiteGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'crimson';

const TAU = Math.PI * 2;

/** Hard ceiling on spikes per cast. The editor's count slider clamps to this. */
const MAX_SPIKES = 96;
/** Spike silhouettes — each its own InstancedMesh, so the twist and lumps differ. */
const VARIANTS = 3;
const SLOTS = MAX_SPIKES / VARIANTS;

const _emit = {};
const _pos = new Vector3();
const _floor = new Vector3();
const _dir = new Vector3();
const _axis = new Vector3();
const _hand = new Vector3();
const _land = new Vector3();
const _moon = new Vector3();
const _ahead = new Vector3();
const _up = new Vector3(0, 1, 0);
const _fwd = new Vector3(0, 0, 1);
const _node = new Object3D();
const _tilt = new Quaternion();
const _spin = new Quaternion();
/** Highest live slot per variant, reused every frame. */
const _used = new Int32Array(VARIANTS);

/**
 * CRIMSON RITE — a blood rite performed at range.
 *
 * A bead of blood is flung to the circle. Where it lands, the rite plays out on
 * one clock, and its beats are the ability:
 *
 *   1. **the blood moon** rises in the sky beyond the circle — a camera-facing
 *      disc that shades a whole cratered sphere analytically, copper-red with a
 *      bright limb and a deep red halo. It flares when the spikes erupt.
 *   2. **the ritual circle** is drawn on the floor — rings sweep round, a star
 *      is traced stroke by stroke, then a band of SDF runes lights in order.
 *   3. **the blood pool** wells up in the middle and spreads across the circle
 *      with a fingered, splattered edge: wet, dark, with a sharp highlight off
 *      the stage's own sun and the sky in it.
 *   4. **the spikes** erupt out of the pool in staggered waves — the middle
 *      first, then ring by ring outward — glossy coagulated blood with a bright
 *      red rim, punching past full height and settling. Instanced, procedural,
 *      three silhouettes.
 *   5. **droplets & mist** — every spike flings droplets as it breaks the
 *      surface, the tips drip while they stand, and a low red mist hangs over
 *      the pool.
 *   6. **the impaling** — the first wave kills: bodies in the circle are thrown
 *      *up* more than out (`handlesOwnHits`, `dummy.kill`), and anything that
 *      walks in while the spikes stand is taken too.
 *
 * ## The upgrade (2026): a travel, a moon that belongs, and a heartbeat
 *
 *   - **the seal is a thing** — a lathed comet of glossy blood
 *     (`createBloodSealGeometry`, `createCrimsonSealMaterial`: deep clot body,
 *     red rim, a hot core through the head, a whipping tail) flung from the
 *     hand on the lob, and behind it **the arc of blood** — a camera-facing
 *     ribbon laid along the very same lob in the vertex stage
 *     (`createCrimsonArcMaterial`), dark and wet with a hot core, that stays
 *     strung from the hand to the circle after the seal lands and drains into
 *     the circle over `arcDrain`. The path from caster to rite is on screen.
 *   - **the moon belongs to the rite** — it is shaded as a sphere with a
 *     terminator (`moonShade`), and pours a shaft of red light down onto the
 *     circle (`createCrimsonBeamMaterial`) with embers drawn up it.
 *   - **the floor is a filled field of blood** — the pool now wells up as
 *     soon as the seal lands and fills the whole circle, lit from within by
 *     crawling veins of saturated red (`poolGlow`).
 *   - **a heartbeat in the linger** — every `beatPeriod` after the eruption
 *     the spikes swell (`spikeThrob`), a surge of light climbs every spike
 *     (`spikeBeatGlow`), a swell runs out across the pool, the beam and the
 *     moon throb. The field keeps moving until it sinks.
 *
 * Then the rite ends: the spikes sink back into the pool, the circle burns out,
 * the moon sets, and the pool dries to a matte brown stain with a dark tide
 * line — which is handed to a SCORCH decal as the pool fades so the stain
 * stays on the floor after the ability has gone.
 *
 * ## The editor rule
 *
 * A spike record stores only dice — a bearing, a radial fraction, unitless
 * jitters — and one event flag (whether it has broken the surface yet). Its
 * wave, its height, its lean and its timing are all resolved from
 * `settings.crimson` every frame, so dragging `spikeWaves` regroups an
 * eruption that is already under way.
 */
export class CrimsonRiteAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The rite kills when the spikes erupt, not when the seal lands. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let count = 0;
    for (const mesh of this.spikeMeshes) count += mesh.count;
    return count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the blood moon ---- */
    this.moonGeometry = new PlaneGeometry(1, 1);
    this.moonMaterial = createCrimsonMoonMaterial();
    this.moon = new Mesh(this.moonGeometry, this.moonMaterial);
    this.moon.name = 'CrimsonMoon';
    this.moon.layers.set(LAYER.VFX);
    this.moon.renderOrder = 1;
    this.moon.frustumCulled = false;
    this.moon.visible = false;
    this.group.add(this.moon);

    /* ---- layers 2 + 3: the floor ---- */
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);

    this.poolMaterial = createCrimsonPoolMaterial();
    this.pool = new Mesh(this.groundGeometry, this.poolMaterial);
    this.pool.name = 'CrimsonPool';
    this.pool.layers.set(LAYER.VFX);
    this.pool.renderOrder = 5;
    this.pool.frustumCulled = false;
    this.pool.visible = false;
    this.group.add(this.pool);

    this.circleMaterial = createCrimsonCircleMaterial();
    this.circle = new Mesh(this.groundGeometry, this.circleMaterial);
    this.circle.name = 'CrimsonCircle';
    this.circle.layers.set(LAYER.VFX);
    // Over the pool: the rite's lines glow up through the blood.
    this.circle.renderOrder = 6;
    this.circle.frustumCulled = false;
    this.circle.visible = false;
    this.group.add(this.circle);

    /* ---- the travel: the seal and the arc of blood behind it ---- */
    this.sealGeometry = createBloodSealGeometry({ tail: 5.5 });
    this.sealMaterial = createCrimsonSealMaterial();
    this.seal = new Mesh(this.sealGeometry, this.sealMaterial);
    this.seal.name = 'CrimsonSeal';
    this.seal.layers.set(LAYER.VFX);
    this.seal.frustumCulled = false;
    this.seal.renderOrder = 8;
    this.seal.visible = false;
    this.group.add(this.seal);

    this.ribbonGeometry = new PlaneGeometry(1, 1, 1, 64);
    this.arcMaterial = createCrimsonArcMaterial();
    this.arc = new Mesh(this.ribbonGeometry, this.arcMaterial);
    this.arc.name = 'CrimsonArc';
    this.arc.layers.set(LAYER.VFX);
    this.arc.frustumCulled = false; // placed in the vertex stage
    this.arc.renderOrder = 7;
    this.arc.visible = false;
    this.group.add(this.arc);

    this.beamMaterial = createCrimsonBeamMaterial();
    this.beam = new Mesh(this.ribbonGeometry, this.beamMaterial);
    this.beam.name = 'CrimsonMoonbeam';
    this.beam.layers.set(LAYER.VFX);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 3;
    this.beam.visible = false;
    this.group.add(this.beam);

    this._arcState = { from: new Vector3(), to: new Vector3(), arc: 1, head: 0, tail: 0, fade: 1, seed: 0 };
    this._beamState = { from: new Vector3(), to: new Vector3(), widthFrom: 1, widthTo: 1, head: 0, fade: 0, beat: 0, seed: 0 };
    this._sealState = { fade: 1 };
    this.beamEmitter = null; // made in createParticles

    /* ---- layer 4: the spikes ---- */
    this.spikeMaterial = createCrimsonSpikeMaterial();
    this._shapeKey = '';
    this.spikeMeshes = [];
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = new InstancedMesh(this._buildSpike(v), this.spikeMaterial, SLOTS);
      // Solid: in the depth prepass, so the mist feathers against it, and
      // under the stage floor while it is still buried — the floor hides the
      // part of a spike that has not come up yet.
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.spikeMeshes.push(mesh);
    }

    /** One record per spike: dice and one event flag. */
    this.spikes = [];
    for (let i = 0; i < MAX_SPIKES; i++) {
      this.spikes.push({ bearing: 0, reach: 0, jitter: 0, height: 0, radius: 0, lean: 0, yaw: 0, broke: false });
    }

    this._seed = 0;
    /** Seconds since the seal landed. */
    this._rite = 0;
    /** 0..1 through the fade. */
    this._dry = 0;
    this._stained = false;
    /** Which waves have announced themselves (bitmask), so each knocks once. */
    this._wavesFired = 0;
    /** Integrated rotations, so their rates are live. */
    this._moonSpin = 0;
    this._runeAngle = 0;
    this._starAngle = 0;
    /** The moon's flare, decaying on its own. */
    this._flare = 0;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    this._moonState = { size: 1, spin: 0, fade: 0, seed: 0 };
    this._circleState = { radius: 3, quadSize: 8, draw: 0, runeAngle: 0, starAngle: 0, fade: 1, seed: 0 };
    this._poolState = { quadSize: 8, grown: 0, dry: 0, fade: 1, seed: 0 };
    this._spikeState = { fade: 1, beatPhase: -1 };
    /** The heartbeat, refreshed every frame from the rite clock. */
    this._beatFrac = -1;
    this._beatEnv = 0;
  }

  /** One spike silhouette from the live shape settings. */
  _buildSpike(variant) {
    const c = settings.crimson;
    const geometry = createBloodSpikeGeometry({
      seed: 3.7 + variant * 5.3,
      sides: 10,
      rings: 18,
      twist: c.spikeTwist * (variant === 1 ? -1 : 1),
      bend: c.spikeBend * (0.6 + variant * 0.4),
      lumps: c.spikeLumps
    });
    const seeds = new InstancedBufferAttribute(new Float32Array(SLOTS), 1);
    for (let i = 0; i < SLOTS; i++) seeds.array[i] = Math.random() * 10;
    geometry.setAttribute('aSeed', seeds);
    return geometry;
  }

  /** Rebuild the silhouettes only when a shape slider actually moved. */
  _syncGeometry() {
    const c = settings.crimson;
    const key = `${c.spikeTwist}|${c.spikeBend}|${c.spikeLumps}`;
    if (key === this._shapeKey) return;
    const first = this._shapeKey === '';
    this._shapeKey = key;
    if (first) return; // built in the constructor from the same values
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = this.spikeMeshes[v];
      const old = mesh.geometry;
      mesh.geometry = this._buildSpike(v);
      old.dispose();
    }
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Beads of blood: hard-edged, wet highlight, real gravity.
    this.drops = particles.get('crimson.drops', {
      capacity: 2400,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uDrag.value = 0.35;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uSizeIn.value = 0.04;
    this.drops.uniforms.uFadeIn.value = 0.03;
    this.drops.uniforms.uFadeOut.value = 0.3;
    this.drops.uniforms.uStretch.value = 0.12;
    this.drops.uniforms.uTurbulence.value = 0.0;

    // The low red mist over the pool. Non-additive, so it stains the air.
    this.mist = particles.get('crimson.mist', {
      capacity: 700,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uDrag.value = 1.4;
    this.mist.uniforms.uEndSize.value = 1.7;
    this.mist.uniforms.uSizeIn.value = 0.3;
    this.mist.uniforms.uFadeIn.value = 0.3;
    this.mist.uniforms.uFadeOut.value = 0.45;

    // Embers of the rite: the seal's glow, and sparks lifting off the runes.
    this.embers = particles.get('crimson.embers', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.embers.uniforms.uDrag.value = 1.2;
    this.embers.uniforms.uEndSize.value = 0.2;
    this.embers.uniforms.uSizeIn.value = 0.05;
    this.embers.uniforms.uFadeIn.value = 0.05;
    this.embers.uniforms.uFadeOut.value = 0.5;
    this.embers.uniforms.uGravity.value.set(0, 0.6, 0);

    this.trailEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.dripEmitter = new RateEmitter();
    this.wellEmitter = new RateEmitter();
    this.emberEmitter = new RateEmitter();
    this.beamEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.2, settings.crimson.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.crimson.fadeTime * settings.global.lifetime);
  }

  /** The light does not shimmer — it throbs, like a pulse. */
  lightShimmer() {
    const beat = Math.pow(Math.max(0, Math.sin(this.age * 7.2)), 8);
    return 0.85 + beat * 0.3 + this._flare * 0.6;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry — every metre from live settings                           */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.2, settings.crimson.zoneRadius);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** The seal in flight: a lob from the hand to the circle. */
  _sealPoint(out, u = this.u) {
    const c = settings.crimson;
    this._lobEnds(_hand, _land);
    out.lerpVectors(_hand, _land, u);
    out.y += Math.sin(u * Math.PI) * c.sealArc;
    return out;
  }

  /** Where the lob leaves the hand and where it comes down. */
  _lobEnds(hand, land) {
    const c = settings.crimson;
    hand.copy(this.origin).addScaledVector(this.direction, 0.5);
    hand.y = c.handHeight;
    this._floorPoint(land);
    land.y = 0.2;
  }

  /** Refresh the heartbeat from the rite clock: a thump every `beatPeriod`. */
  _beat() {
    const c = settings.crimson;
    const t = this._rite - c.eruptDelay - c.spikeRise;
    if (this.phase === AbilityPhase.TRAVEL || t < 0 || this._dry >= 1) {
      this._beatFrac = -1;
      this._beatEnv = 0;
      return;
    }
    const period = Math.max(0.1, c.beatPeriod);
    this._beatFrac = t / period - Math.floor(t / period);
    this._beatEnv = Math.exp(-this._beatFrac * 5.0) * (1 - this._dry);
  }

  _moonPoint(out, rise) {
    const c = settings.crimson;
    this._floorPoint(out).addScaledVector(this.direction, c.moonBehind);
    out.y = c.moonHeight - c.moonRiseFrom * (1 - rise);
    return out;
  }

  get poolRadius() {
    return Math.max(0.1, this.radius * settings.crimson.poolRadius);
  }

  /** When a spike's wave erupts, seconds after the seal landed. */
  _spikeTime(spike) {
    const c = settings.crimson;
    const waves = Math.max(1, Math.round(c.spikeWaves));
    const wave = Math.min(waves - 1, Math.floor(spike.reach * waves));
    return c.eruptDelay + wave * c.spikeWaveGap + spike.jitter * c.spikeJitter;
  }

  /**
   * How far up a spike is: 0 buried, 1 at full height, past 1 in the punch.
   *
   * Rises on `outBack`-flavoured timing to `1 + overshoot`, then settles back.
   * In the fade it sinks back into the pool.
   */
  _spikeRise(spike) {
    const c = settings.crimson;
    const t = this._rite - this._spikeTime(spike);
    if (t <= 0) return 0;
    const rise = Math.max(0.01, c.spikeRise);
    let k;
    if (t < rise) {
      k = Easing.outCubic(t / rise) * (1 + c.spikeOvershoot);
    } else {
      const settle = Easing.outCubic(saturate((t - rise) / Math.max(0.01, c.spikeSettle)));
      k = lerp(1 + c.spikeOvershoot, 1, settle);
    }
    if (this._dry > 0) {
      k *= 1 - Easing.inCubic(saturate(this._dry / Math.max(0.05, c.spikeSink)));
    }
    return k;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.trailEmitter.reset();
    this.mistEmitter.reset();
    this.dripEmitter.reset();
    this.wellEmitter.reset();
    this.emberEmitter.reset();
    this.beamEmitter.reset();
    this._beatFrac = -1;
    this._beatEnv = 0;

    this._seed = Math.random() * 100;
    this._rite = 0;
    this._dry = 0;
    this._stained = false;
    this._wavesFired = 0;
    this._moonSpin = Math.random() * TAU;
    this._runeAngle = Math.random() * TAU;
    this._starAngle = Math.random() * TAU;
    this._flare = 0;
    this._rollSpikes();
    this._sync();
  }

  /** Re-roll the field. Unitless dice only. */
  _rollSpikes() {
    for (const spike of this.spikes) {
      spike.bearing = Math.random() * TAU;
      // Area-uniform over the disc, slightly favouring the middle.
      spike.reach = Math.pow(Math.random(), 0.6);
      spike.jitter = Math.random();
      spike.height = randRange(-1, 1);
      spike.radius = randRange(-1, 1);
      spike.lean = randRange(-1, 1);
      spike.yaw = Math.random() * TAU;
      spike.broke = false;
    }
    // The first spike always stands dead centre: the rite has a heart.
    this.spikes[0].reach = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.crimson;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const dry = this._dry;
    this._beat();
    this._floorPoint(_floor);
    this._syncGeometry();

    /* ---- the moon ---- */
    const rise = travelling ? 0 : Easing.outCubic(saturate(this._rite / Math.max(0.05, c.moonRiseTime)));
    const set = Easing.inQuad(dry);
    const moonState = this._moonState;
    moonState.size = c.moonRadius;
    moonState.spin = this._moonSpin;
    moonState.fade = rise * (1 - set) * (1 + this._flare * c.moonPulse);
    moonState.seed = this._seed;
    moonState.beat = this._beatEnv * c.moonPulse;
    this.moonMaterial.userData.sync(moonState);
    this._moonPoint(this.moon.position, rise * (1 - set * 0.4));
    this.moon.visible = moonState.fade > 0.004;

    /* ---- the circle ---- */
    const circleR = this.radius * c.circleRadius;
    const poolR = this.poolRadius;
    const quad = (Math.max(circleR, poolR * (1 + c.poolEdgeNoise) + 0.4) + 0.6) * 2;
    const circleState = this._circleState;
    circleState.radius = circleR;
    circleState.quadSize = quad;
    circleState.draw = travelling ? 0 : saturate(this._rite / Math.max(0.05, c.drawTime));
    circleState.runeAngle = this._runeAngle;
    circleState.starAngle = this._starAngle;
    circleState.fade = 1 - Easing.inQuad(saturate(dry / Math.max(0.05, c.circleFadeEarly)));
    circleState.seed = this._seed;
    this.circleMaterial.userData.sync(circleState);
    this.circle.visible = !travelling && circleState.fade > 0.004;
    this.circle.position.set(_floor.x, c.poolHeight + 0.004, _floor.z);
    this.circle.scale.set(quad, 1, quad);

    /* ---- the pool ---- */
    const poolState = this._poolState;
    const spread = travelling ? 0 : Easing.outCubic(saturate((this._rite - c.poolDelay) / Math.max(0.05, c.poolTime)));
    poolState.quadSize = quad;
    poolState.grown = poolR * spread;
    // Drying runs ahead of the fade; the pool fades out over the last fifth,
    // by which time the stain decal is underneath it.
    poolState.dry = Easing.outQuad(saturate(dry * 1.35));
    poolState.fade = 1 - Easing.inQuad(saturate((dry - 0.8) / 0.2));
    poolState.seed = this._seed;
    poolState.beatR = this._beatFrac < 0 ? -1 : this._beatFrac * poolR * 1.15;
    poolState.beatAmp = this._beatFrac < 0 ? 0 : (1 - this._beatFrac) * (1 - dry);
    this.poolMaterial.userData.sync(poolState);
    this.pool.visible = !travelling && poolState.grown > 0.01 && poolState.fade > 0.004;
    this.pool.position.set(_floor.x, c.poolHeight, _floor.z);
    this.pool.scale.set(quad, 1, quad);

    /* ---- the spikes ---- */
    this._spikeState.fade = 1 - dry;
    this._spikeState.beatPhase = this._beatFrac < 0 ? -1 : this._beatFrac * 1.5 - 0.2;
    this.spikeMaterial.userData.sync(this._spikeState);
    this._updateSpikes();

    /* ---- the seal, the arc of blood, the moonbeam ---- */
    this._syncTravel(travelling, rise, set);

    /* ---- particles ---- */
    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    this.drops.uniforms.uGravity.value.set(0, c.dropGravity, 0);
    this.drops.uniforms.uSizeScale.value = g.particleSize;
    this.drops.uniforms.uLifeScale.value = g.particleLifetime;
    this.drops.uniforms.uSpeedScale.value = g.particleSpeed;
    this.drops.uniforms.uOpacity.value = g.opacity;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    this.mist.uniforms.uGravity.value.set(0, c.mistRise, 0);
    this.mist.uniforms.uSizeScale.value = g.particleSize;
    this.mist.uniforms.uLifeScale.value = g.particleLifetime;
    this.mist.uniforms.uSpeedScale.value = g.particleSpeed;
    this.mist.uniforms.uOpacity.value = c.mistOpacity * g.opacity;
    this.mist.uniforms.uTurbulence.value = 0.35 * g.turbulence;

    this.embers.setGradient(getColor(c.colorCircleCore), getColor(c.colorCircleGlow), getColor(c.colorDropB), getColor(c.colorDropD));
    this.embers.uniforms.uSizeScale.value = g.particleSize;
    this.embers.uniforms.uLifeScale.value = g.particleLifetime;
    this.embers.uniforms.uSpeedScale.value = g.particleSpeed;
    this.embers.uniforms.uOpacity.value = g.opacity;
    this.embers.uniforms.uGlow.value = g.glow;
    this.embers.uniforms.uTurbulence.value = 0.4 * g.turbulence;
  }

  /**
   * The travel and the moon's tie to the rite: the comet of blood on its lob,
   * the arc of blood strung from the hand behind it (which drains into the
   * circle once it lands), and the shaft of moonlight onto the circle.
   */
  _syncTravel(travelling, rise, set) {
    const c = settings.crimson;

    /* the seal: only in flight */
    if (travelling) {
      this._sealPoint(this.seal.position, this.u);
      this._sealPoint(_ahead, Math.min(1, this.u + 0.02));
      _dir.subVectors(_ahead, this.seal.position);
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      _dir.normalize();
      this.seal.quaternion.setFromUnitVectors(_fwd, _dir);
      // It swells out of the hand over the first few frames.
      const grow = Easing.outCubic(saturate(this.age / 0.08));
      this.seal.scale.setScalar(Math.max(0.01, c.sealRadius * grow));
      this._sealState.fade = 1;
      this.sealMaterial.userData.sync(this._sealState);
      this.seal.visible = true;
    } else {
      this.seal.visible = false;
    }

    /* the arc of blood behind it */
    const as = this._arcState;
    this._lobEnds(as.from, as.to);
    as.arc = c.sealArc;
    as.seed = this._seed;
    if (travelling) {
      as.head = this.u;
      as.tail = Math.max(0, this.u - c.arcLength);
      as.fade = 1;
    } else {
      // It drains into the circle: the tail runs down the lob after the head.
      const k = saturate(this._rite / Math.max(0.05, c.arcDrain));
      as.head = 1;
      as.tail = Math.max(Math.max(0, 1 - c.arcLength), Easing.inQuad(k));
      as.fade = 1 - Easing.inQuad(saturate((k - 0.7) / 0.3));
    }
    this.arcMaterial.userData.sync(as);
    this.arc.visible = c.arcOpacity > 0 && as.fade > 0.004 && as.head - as.tail > 0.002;

    /* the moonbeam */
    const bs = this._beamState;
    this._moonPoint(bs.from, rise * (1 - set * 0.4));
    this._floorPoint(bs.to);
    bs.to.y = 0.05;
    bs.widthFrom = c.moonRadius * 1.3;
    bs.widthTo = this.radius * c.beamWidth * 2;
    bs.head = travelling ? 0 : Easing.outCubic(saturate((this._rite - c.moonRiseTime * 0.4) / Math.max(0.05, c.beamDrop)));
    bs.fade = rise * (1 - set);
    bs.beat = this._beatEnv + this._flare * 0.5;
    bs.seed = this._seed;
    this.beamMaterial.userData.sync(bs);
    this.beam.visible = c.beamIntensity > 0 && bs.head > 0.01 && bs.fade > 0.004;
  }

  /** Place every spike from its dice and the clock. */
  _updateSpikes() {
    const c = settings.crimson;
    const g = settings.global;
    const count = Math.min(MAX_SPIKES, Math.max(0, Math.round(c.spikeCount)));
    const poolR = this.poolRadius;
    const used = _used;
    used.fill(0);
    const travelling = this.phase === AbilityPhase.TRAVEL;

    for (let i = 0; i < MAX_SPIKES; i++) {
      const spike = this.spikes[i];
      const variant = i % VARIANTS;
      const slot = (i / VARIANTS) | 0;
      const mesh = this.spikeMeshes[variant];
      const k = i < count && !travelling ? this._spikeRise(spike) : 0;

      if (k <= 0.001) {
        _node.position.set(0, -999, 0);
        _node.quaternion.identity();
        _node.scale.setScalar(0.0001);
        _node.updateMatrix();
        mesh.setMatrixAt(slot, _node.matrix);
        if (i < count) used[variant] = Math.max(used[variant], slot + 1);
        continue;
      }

      const reach = spike.reach * poolR * c.spikeSpread;
      const x = _floor.x + Math.cos(spike.bearing) * reach;
      const z = _floor.z + Math.sin(spike.bearing) * reach;
      // Taller in the middle, shorter at the rim — a crown, not a bed of nails.
      const crown = lerp(1, c.spikeEdgeHeight, spike.reach * spike.reach);
      const height = Math.max(0.05, c.spikeHeight * crown * (1 + spike.height * c.spikeHeightJitter * g.randomness));
      // The heartbeat swells them, the middle a beat ahead of the rim.
      const throb = 1 + c.spikeThrob * this._beatEnv * (1 - spike.reach * 0.4);
      const radius = Math.max(0.01, c.spikeRadius * (1 + spike.radius * c.spikeRadiusJitter * g.randomness) * lerp(1.15, 0.8, spike.reach)) * throb;

      // Leaning outward from the centre, more at the rim.
      const lean = c.spikeLean * spike.reach + spike.lean * c.spikeLeanJitter * g.randomness;
      _axis.set(-Math.sin(spike.bearing), 0, Math.cos(spike.bearing));
      _tilt.setFromAxisAngle(_axis, -lean);
      _spin.setFromAxisAngle(_up, spike.yaw);
      _node.quaternion.copy(_tilt).multiply(_spin);

      // Below 1 the spike slides up out of the floor (which hides the buried
      // part); past 1 it stretches — the overshoot of the punch.
      const out = Math.min(k, 1);
      _dir.set(0, 1, 0).applyQuaternion(_node.quaternion);
      _node.position.set(x, c.poolHeight * 0.5, z).addScaledVector(_dir, -height * (1 - out));
      _node.scale.set(radius, height * Math.max(k, 1), radius);
      _node.updateMatrix();
      mesh.setMatrixAt(slot, _node.matrix);
      used[variant] = Math.max(used[variant], slot + 1);

      // The frame it breaks the surface.
      if (!spike.broke && !travelling && this._dry <= 0) {
        spike.broke = true;
        this._breachFx(x, z, height, _dir);
      }
    }

    for (let v = 0; v < VARIANTS; v++) {
      this.spikeMeshes[v].count = used[v];
      this.spikeMeshes[v].instanceMatrix.needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The impaling                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Take everything in the circle. Called every frame the spikes stand, so a
   * body that walks into a field of standing spikes is taken too.
   */
  _impale() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.crimson;
    const g = settings.global;
    this._floorPoint(_floor);
    const found = field.findTargets(_floor.x, _floor.z, this.radius * c.killReach, this._found);
    if (found.length === 0) return;

    this._force.impulse = c.killImpulse * g.explosionIntensity;
    this._force.lift = c.killLift * g.explosionIntensity;
    this._force.spin = c.killSpin;

    for (const dummy of found) {
      _dir.set(dummy.position.x - _floor.x, 0, dummy.position.z - _floor.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      if (dummy.kill(_dir.x, _dir.z, this._force)) {
        // A gout of blood where it was struck.
        this._resetEmit(frame.uTime.value);
        _pos.copy(dummy.position).setY(1.0);
        _emit.position = _pos;
        _emit.radius = 0.25;
        _emit.direction = _dir.setY(1.4).normalize();
        _emit.speed = c.dropSpeed * 1.2;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.55;
        _emit.size = c.dropSize * 1.2;
        _emit.life = c.dropLifetime;
        this.drops.emit(Math.round(c.dropPerSpike * 2.5 * g.particleCount), _emit);
      }
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

  /** The seal in flight: a bead of blood shedding droplets and a red glow. */
  _travelFx(dt) {
    const c = settings.crimson;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.trailRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this._sealPoint(_pos);
    _emit.position = _pos;
    _emit.radius = 0.12;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(0.4).setY(-0.2).normalize();
    _emit.speed = 1.2;
    _emit.spread = 0.5;
    _emit.size = c.sealSize;
    _emit.life = c.dropLifetime * 0.6;
    this.drops.emit(n, _emit);

    _emit.size = c.sealSize * 2.2;
    _emit.speed = 0.3;
    _emit.life = 0.35;
    this.embers.emit(Math.max(1, Math.round(n * 0.5)), _emit);
  }

  /** One spike breaking the surface: droplets flung off it, and the wave's knock. */
  _breachFx(x, z, height, axis) {
    const c = settings.crimson;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.set(x, 0.1, z).addScaledVector(axis, height * 0.35);
    _emit.position = _pos;
    _emit.radius = c.spikeRadius * 1.2;
    _emit.direction = _dir.copy(axis).setY(axis.y + 0.6).normalize();
    _emit.speed = c.dropSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.7;
    _emit.size = c.dropSize;
    _emit.sizeVariance = 0.7;
    _emit.life = c.dropLifetime;
    this.drops.emit(Math.round(c.dropPerSpike * g.particleCount), _emit);

    // A collar of mist where it tore through.
    _pos.set(x, c.mistHeight, z);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = 0.6;
    _emit.spread = 1;
    _emit.size = c.mistSize * 0.6;
    _emit.life = c.mistLifetime * 0.6;
    _emit.spin = 0.4;
    this.mist.emit(1, _emit);
  }

  /** A wave of the eruption announcing itself: a knock and a flare. */
  _waveFx(wave) {
    const c = settings.crimson;
    const g = settings.global;
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.spikeShake * power * g.cameraShake * (wave === 0 ? 1.6 : 1), 6, 20);
    this._flare = Math.min(1.5, this._flare + (wave === 0 ? 1 : 0.4));
    this.lightBoost = Math.max(this.lightBoost, c.eruptLight * (wave === 0 ? 1 : 0.4) * power);

    if (wave !== 0) return;
    this._floorPoint(_floor);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.eruptFlash * power);
    this.ctx.shake.add(c.eruptShake * power * g.cameraShake, 4, 16);
    _pos.copy(_floor).setY(0.3);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.0,
      opacity: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC),
      squash: 0.45
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: this.radius * 1.6,
      life: 0.6,
      width: 0.05,
      intensity: 0.9,
      colorA: getColor(c.colorCircleCore),
      colorB: getColor(c.colorCircleGlow)
    });
  }

  /** The seal hitting the floor and the rite beginning. */
  _sealFx() {
    const c = settings.crimson;
    const g = settings.global;
    this._floorPoint(_floor);
    this._resetEmit(frame.uTime.value);
    _pos.copy(_floor).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * 0.8;
    _emit.spread = 0.9;
    _emit.size = c.dropSize;
    _emit.life = c.dropLifetime * 0.7;
    this.drops.emit(Math.round(30 * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: this.radius * 0.8,
      life: 0.9,
      intensity: 0.7,
      colorA: getColor(c.colorCircleGlow),
      colorB: getColor(c.colorPoolWet)
    });
    this.ctx.shake.add(c.sealShake * g.cameraShake, 6, 18);
    this.lightBoost = c.lightIntensity * 0.5;
  }

  /** Everything the rite keeps doing while it stands. */
  _holdFx(dt) {
    const c = settings.crimson;
    const g = settings.global;
    const time = frame.uTime.value;
    this._floorPoint(_floor);
    const grown = this._poolState.grown;
    const wet = 1 - this._dry;

    /* low mist over the pool */
    const mist = this.mistEmitter.tick(dt, c.mistRate * saturate(grown / this.poolRadius) * wet * g.particleCount);
    if (mist > 0) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * grown;
      _pos.set(_floor.x + Math.cos(a) * r, c.mistHeight, _floor.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _dir.set(Math.cos(a), 0.15, Math.sin(a));
      _emit.speed = 0.35;
      _emit.spread = 0.4;
      _emit.size = c.mistSize;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.3;
      this.mist.emit(mist, _emit);
    }

    /* droplets welling up while the pool spreads */
    const spreading = grown > 0.01 && grown < this.poolRadius * 0.98 && this._dry <= 0;
    const well = this.wellEmitter.tick(dt, spreading ? c.wellRate * g.particleCount : 0);
    if (well > 0) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const r = grown * randRange(0.5, 1.0);
      _pos.set(_floor.x + Math.cos(a) * r, 0.05, _floor.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.radius = 0.1;
      _emit.direction = _dir.set(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
      _emit.speed = c.dropSpeed * 0.35;
      _emit.spread = 0.4;
      _emit.size = c.dropSize * 0.7;
      _emit.life = c.dropLifetime * 0.5;
      this.drops.emit(well, _emit);
    }

    /* sparks lifting off the runes as they are drawn */
    const embers = this.emberEmitter.tick(dt, 40 * this._circleState.fade * g.particleCount);
    if (embers > 0) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const r = this.radius * c.circleRadius * randRange(0.8, 1.0);
      _pos.set(_floor.x + Math.cos(a) * r, 0.05, _floor.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.direction = _up;
      _emit.speed = 0.7;
      _emit.spread = 0.3;
      _emit.size = 0.05;
      _emit.life = 0.9;
      this.embers.emit(embers, _emit);
    }

    /* embers drawn up the moonbeam toward the moon */
    const beamN = this.beamEmitter.tick(dt, this.beam.visible ? c.beamMotes * this._beamState.fade * g.particleCount : 0);
    if (beamN > 0) {
      this._resetEmit(time);
      this._moonPoint(_moon, 1);
      for (let n = 0; n < beamN; n++) {
        const s = Math.random() * 0.6;
        _pos.lerpVectors(_floor, _moon, s);
        _pos.x += randRange(-1, 1) * this.radius * c.beamWidth * (1 - s) * 0.8;
        _pos.z += randRange(-1, 1) * this.radius * c.beamWidth * (1 - s) * 0.8;
        _pos.y += 0.1;
        _emit.position = _pos;
        _emit.radius = 0.1;
        _emit.direction = _dir.subVectors(_moon, _pos).normalize();
        _emit.speed = 2.2;
        _emit.speedVariance = 0.4;
        _emit.spread = 0.1;
        _emit.size = 0.06;
        _emit.life = 1.0;
        this.embers.emit(1, _emit);
      }
    }

    /* drips off the tips of standing spikes */
    const drips = this.dripEmitter.tick(dt, c.dripRate * wet * g.particleCount);
    for (let n = 0; n < drips; n++) {
      const count = Math.min(MAX_SPIKES, Math.round(c.spikeCount));
      if (count <= 0) break;
      const spike = this.spikes[(Math.random() * count) | 0];
      const k = this._spikeRise(spike);
      if (k < 0.8) continue;
      const reach = spike.reach * this.poolRadius * c.spikeSpread;
      const crown = lerp(1, c.spikeEdgeHeight, spike.reach * spike.reach);
      const tip = c.spikeHeight * crown * randRange(0.45, 0.9);
      this._resetEmit(time);
      _pos.set(
        _floor.x + Math.cos(spike.bearing) * (reach + Math.sin(c.spikeLean * spike.reach) * tip),
        tip,
        _floor.z + Math.sin(spike.bearing) * (reach + Math.sin(c.spikeLean * spike.reach) * tip)
      );
      _emit.position = _pos;
      _emit.radius = 0.04;
      _emit.direction = _dir.set(0, -1, 0);
      _emit.speed = 0.3;
      _emit.size = c.dropSize * 0.8;
      _emit.life = c.dropLifetime;
      this.drops.emit(1, _emit);
    }
  }

  /** The rite done: leave the stain on the floor as the pool goes. */
  _stainFx() {
    const c = settings.crimson;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: this.poolRadius * 1.1,
      life: c.stainLife,
      intensity: c.stainIntensity,
      colorA: getColor(c.colorPoolStain),
      colorB: getColor(c.colorPoolDeep),
      height: 0.011
    });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  /** Advance the integrated rotations. */
  _advance(dt) {
    const c = settings.crimson;
    const g = settings.global;
    this._moonSpin += c.moonSpin * g.noiseSpeed * dt;
    this._runeAngle += c.circleSpin * g.animationSpeed * dt;
    this._starAngle += c.circleStarSpin * g.animationSpeed * dt;
    this._flare = Math.max(0, this._flare - this._flare * 3.0 * dt);
  }

  onTravel(dt) {
    this._advance(dt);
    this._sync();
    this._sealPoint(this.position);
    this._travelFx(dt);
  }

  onImpact() {
    // The seal is spent the frame it lands; the arc stays strung behind it.
    this.seal.visible = false;
    this._rite = 0;
    this._dry = 0;
    this._sealFx();
  }

  onFade(dt, t) {
    const c = settings.crimson;
    this._rite += dt;
    this._dry = t <= 1 ? 0 : saturate(t - 1);
    this._advance(dt);

    // Each wave knocks once, on the frame its first spike would break.
    const waves = Math.max(1, Math.min(30, Math.round(c.spikeWaves)));
    for (let w = 0; w < waves; w++) {
      const bit = 1 << w;
      if (this._wavesFired & bit) continue;
      if (this._rite >= c.eruptDelay + w * c.spikeWaveGap && this._dry <= 0) {
        this._wavesFired |= bit;
        this._waveFx(w);
      }
    }

    // The impaling: from the first wave until the spikes start to sink.
    if (this._rite >= c.eruptDelay && this._dry <= 0) {
      this._impale();
    }

    this._sync();
    this._holdFx(dt);

    if (!this._stained && this._dry >= 0.78) {
      this._stained = true;
      this._stainFx();
    }

    // The light hangs low over the circle.
    this._floorPoint(this.position);
    this.position.y = 1.2;
  }

  onDestroy() {
    this.seal.visible = false;
    this.arc.visible = false;
    this.beam.visible = false;
    this.moon.visible = false;
    this.circle.visible = false;
    this.pool.visible = false;
    for (const mesh of this.spikeMeshes) mesh.count = 0;
  }

  dispose() {
    this.moonGeometry.dispose();
    this.groundGeometry.dispose();
    this.sealGeometry.dispose();
    this.ribbonGeometry.dispose();
    this.sealMaterial.dispose();
    this.arcMaterial.dispose();
    this.beamMaterial.dispose();
    for (const mesh of this.spikeMeshes) mesh.geometry.dispose();
    this.moonMaterial.dispose();
    this.circleMaterial.dispose();
    this.poolMaterial.dispose();
    this.spikeMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☾  Crimson Rite');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'seal speed (m/s)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'rite stands for (s)');
  R(cast, c, 'fadeTime', 0.2, 5, 0.05, 'sinks & dries over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 8, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'sealArc', 0, 4, 0.01, 'seal arc (m)');
  R(cast, c, 'sealSize', 0.01, 0.5, 0.005, 'seal trail size');
  R(cast, c, 'trailRate', 0, 400, 1, 'seal trail / s');

  const travel = folder.addFolder('0 · Seal & arc of blood');
  R(travel, c, 'sealRadius', 0.03, 0.8, 0.005, 'seal head radius (m)');
  R(travel, c, 'sealWobble', 0, 0.6, 0.005, 'tail whip');
  R(travel, c, 'sealCoreGlow', 0, 8, 0.05, 'core glow');
  R(travel, c, 'arcWidth', 0.02, 1, 0.005, 'arc width (m)');
  R(travel, c, 'arcTaper', 0, 1, 0.01, 'arc taper');
  R(travel, c, 'arcWobble', 0, 1, 0.01, 'arc writhe');
  R(travel, c, 'arcCoreGlow', 0, 8, 0.05, 'arc core glow');
  R(travel, c, 'arcOpacity', 0, 1, 0.01, 'arc opacity');
  R(travel, c, 'arcLength', 0.05, 1, 0.01, 'arc length (× the lob)');
  R(travel, c, 'arcDrain', 0.05, 3, 0.01, 'drains into the circle over (s)');

  const beats = folder.addFolder('Beats of the rite');
  R(beats, c, 'drawTime', 0.05, 3, 0.01, 'circle drawn over (s)');
  R(beats, c, 'poolDelay', 0, 2, 0.01, 'blood wells after (s)');
  R(beats, c, 'poolTime', 0.05, 3, 0.01, 'pool spreads over (s)');
  R(beats, c, 'eruptDelay', 0, 3, 0.01, 'first spikes at (s)');

  const moon = folder.addFolder('1 · Blood moon');
  R(moon, c, 'moonRadius', 0.2, 6, 0.01, 'radius (m)');
  R(moon, c, 'moonHeight', 1, 20, 0.05, 'height (m)');
  R(moon, c, 'moonBehind', -6, 12, 0.05, 'beyond the circle (m)');
  R(moon, c, 'moonRiseFrom', 0, 8, 0.05, 'rises from below by (m)');
  R(moon, c, 'moonRiseTime', 0.05, 3, 0.01, 'rise time (s)');
  R(moon, c, 'moonSpin', -1, 1, 0.005, 'face spin (rad/s)');
  R(moon, c, 'moonMaria', 0, 1, 0.01, 'maria');
  R(moon, c, 'moonMariaScale', 0.2, 6, 0.01, 'maria scale');
  R(moon, c, 'moonCraters', 0, 1.5, 0.01, 'craters');
  R(moon, c, 'moonCraterScale', 0.5, 12, 0.05, 'crater scale');
  R(moon, c, 'moonLimb', 0, 3, 0.01, 'limb darkening');
  R(moon, c, 'moonSurface', 0, 1, 0.01, 'speckle');
  R(moon, c, 'moonRimWidth', 0.002, 0.3, 0.001, 'rim width');
  R(moon, c, 'moonRimGlow', 0, 10, 0.05, 'rim glow');
  R(moon, c, 'moonHalo', 0, 4, 0.01, 'halo');
  R(moon, c, 'moonHaloFalloff', 0.2, 10, 0.05, 'halo falloff');
  R(moon, c, 'moonHaloReach', 1.1, 6, 0.05, 'halo reach (× radius)');
  R(moon, c, 'moonFlicker', 0, 0.5, 0.005, 'flicker');
  R(moon, c, 'moonBrightness', 0, 3, 0.01, 'brightness');
  R(moon, c, 'moonPulse', 0, 2, 0.01, 'flare on eruption / beat');
  R(moon, c, 'moonShade', 0, 1, 0.01, 'night side darkness');
  R(moon, c, 'moonShadeAngle', -3.14, 3.14, 0.01, 'lit from (rad)');
  R(moon, c, 'beamIntensity', 0, 3, 0.01, 'moonbeam');
  R(moon, c, 'beamWidth', 0.1, 2, 0.01, 'beam width at the circle (× zone)');
  R(moon, c, 'beamDrop', 0.05, 3, 0.01, 'beam reaches the circle in (s)');
  R(moon, c, 'beamMotes', 0, 200, 1, 'embers up the beam / s');
  moon.addColor(c, 'colorMoonLight').name('lit');
  moon.addColor(c, 'colorMoonDark').name('maria');
  moon.addColor(c, 'colorMoonRim').name('rim');
  moon.addColor(c, 'colorMoonHalo').name('halo');

  const circle = folder.addFolder('2 · Ritual circle');
  R(circle, c, 'circleRadius', 0.3, 2, 0.01, 'radius (× zone)');
  R(circle, c, 'circleRuneInner', 0.4, 0.98, 0.005, 'rune band inner');
  R(circle, c, 'circleInnerRing', 0, 0.9, 0.005, 'inner ring');
  R(circle, c, 'circleStarRadius', 0.1, 1, 0.005, 'star radius');
  R(circle, c, 'circleStarPoints', 3, 12, 1, 'star points');
  R(circle, c, 'circleStarSkip', 1, 5, 1, 'star skip');
  R(circle, c, 'circleRunes', 3, 48, 1, 'runes');
  R(circle, c, 'circleRuneSize', 0.2, 1.5, 0.01, 'rune size');
  R(circle, c, 'circleLine', 0.002, 0.1, 0.001, 'stroke (m)');
  R(circle, c, 'circleGlowWidth', 0.005, 0.5, 0.005, 'glow width (m)');
  R(circle, c, 'circleCoreGlow', 0, 10, 0.05, 'stroke glow');
  R(circle, c, 'circleHaloGlow', 0, 5, 0.05, 'halo glow');
  R(circle, c, 'circleSpin', -2, 2, 0.01, 'rune spin (rad/s)');
  R(circle, c, 'circleStarSpin', -2, 2, 0.01, 'star spin (rad/s)');
  R(circle, c, 'circlePulse', 0, 1, 0.01, 'pulse');
  R(circle, c, 'circlePulseRate', 0, 12, 0.05, 'pulse rate');
  R(circle, c, 'circleOpacity', 0, 1, 0.01, 'opacity');
  R(circle, c, 'circleFadeEarly', 0.05, 1, 0.01, 'burns out by (× fade)');
  circle.addColor(c, 'colorCircleCore').name('stroke');
  circle.addColor(c, 'colorCircleGlow').name('glow');

  const pool = folder.addFolder('3 · Blood pool');
  R(pool, c, 'poolRadius', 0.2, 2, 0.01, 'radius (× zone)');
  R(pool, c, 'poolEdgeNoise', 0, 0.8, 0.01, 'edge fingering');
  R(pool, c, 'poolEdgeScale', 0.2, 8, 0.05, 'edge scale');
  R(pool, c, 'poolFeather', 0.005, 0.3, 0.001, 'edge feather (m)');
  R(pool, c, 'poolSplatter', 0, 3, 0.01, 'splatter');
  R(pool, c, 'poolSplatterScale', 0.5, 10, 0.05, 'splatter density');
  R(pool, c, 'poolMeniscus', 0, 0.2, 0.001, 'meniscus');
  R(pool, c, 'poolRipple', 0, 0.1, 0.001, 'ripple');
  R(pool, c, 'poolRippleScale', 0.2, 10, 0.05, 'ripple scale');
  R(pool, c, 'poolBump', 0, 4, 0.01, 'bump');
  R(pool, c, 'poolGloss', 4, 600, 1, 'gloss');
  R(pool, c, 'poolSpecular', 0, 10, 0.05, 'specular');
  R(pool, c, 'poolEnv', 0, 3, 0.01, 'sky reflection');
  R(pool, c, 'poolFresnel', 0, 4, 0.01, 'fresnel');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'poolTideLine', 0, 2, 0.01, 'tide line');
  R(pool, c, 'poolHeight', 0, 0.1, 0.001, 'height (m)');
  R(pool, c, 'stainLife', 0.5, 30, 0.1, 'stain lingers (s)');
  R(pool, c, 'stainIntensity', 0, 1.5, 0.01, 'stain strength');
  R(pool, c, 'poolGlow', 0, 4, 0.01, 'light through the blood');
  R(pool, c, 'poolVeinScale', 0.2, 6, 0.05, 'vein scale');
  pool.addColor(c, 'colorPoolGlow').name('glow');
  pool.addColor(c, 'colorPoolWet').name('wet');
  pool.addColor(c, 'colorPoolDeep').name('deep');
  pool.addColor(c, 'colorPoolSpec').name('highlight');
  pool.addColor(c, 'colorPoolStain').name('dried stain');

  const spikes = folder.addFolder('4 · Spikes');
  R(spikes, c, 'spikeCount', 0, MAX_SPIKES, 1, 'count');
  R(spikes, c, 'spikeWaves', 1, 8, 1, 'waves');
  R(spikes, c, 'spikeWaveGap', 0, 1, 0.005, 'gap between waves (s)');
  R(spikes, c, 'spikeJitter', 0, 0.5, 0.005, 'jitter in a wave (s)');
  R(spikes, c, 'spikeSpread', 0, 1.5, 0.01, 'spread (× pool)');
  R(spikes, c, 'spikeHeight', 0.2, 6, 0.01, 'height (m)');
  R(spikes, c, 'spikeEdgeHeight', 0.1, 1.5, 0.01, 'rim height (×)');
  R(spikes, c, 'spikeHeightJitter', 0, 1, 0.01, 'height jitter');
  R(spikes, c, 'spikeRadius', 0.02, 0.8, 0.005, 'base radius (m)');
  R(spikes, c, 'spikeRadiusJitter', 0, 1, 0.01, 'radius jitter');
  R(spikes, c, 'spikeLean', -1, 1.4, 0.01, 'lean outward (rad)');
  R(spikes, c, 'spikeLeanJitter', 0, 1, 0.01, 'lean jitter');
  R(spikes, c, 'spikeRise', 0.02, 1, 0.005, 'rise time (s)');
  R(spikes, c, 'spikeOvershoot', 0, 1, 0.01, 'overshoot');
  R(spikes, c, 'spikeSettle', 0.02, 1.5, 0.01, 'settle (s)');
  R(spikes, c, 'spikeSink', 0.05, 1, 0.01, 'sink over (× fade)');
  R(spikes, c, 'spikeTwist', -3, 3, 0.01, 'twist (rebuild)');
  R(spikes, c, 'spikeBend', 0, 0.6, 0.005, 'bend (rebuild)');
  R(spikes, c, 'spikeLumps', 0, 0.5, 0.005, 'lumps (rebuild)');
  R(spikes, c, 'spikeGloss', 4, 400, 1, 'gloss');
  R(spikes, c, 'spikeSpecular', 0, 8, 0.05, 'specular');
  R(spikes, c, 'spikeEnv', 0, 3, 0.01, 'sky reflection');
  R(spikes, c, 'spikeRim', 0, 8, 0.05, 'rim');
  R(spikes, c, 'spikeRimPower', 0.5, 8, 0.05, 'rim thinness');
  R(spikes, c, 'spikeInnerGlow', 0, 6, 0.05, 'glow at the base');
  R(spikes, c, 'spikeVeins', 0, 2, 0.01, 'veins');
  R(spikes, c, 'spikeVeinScale', 0.5, 10, 0.05, 'vein scale');
  R(spikes, c, 'spikeDrip', 0, 2, 0.01, 'wet streaks');
  R(spikes, c, 'spikeShake', 0, 1, 0.01, 'shake per wave');
  R(spikes, c, 'beatPeriod', 0.15, 3, 0.01, 'heartbeat every (s)');
  R(spikes, c, 'spikeThrob', 0, 0.6, 0.005, 'swell on the beat');
  R(spikes, c, 'spikeBeatGlow', 0, 6, 0.05, 'surge up the spikes');
  spikes.addColor(c, 'colorSpikeBody').name('body');
  spikes.addColor(c, 'colorSpikeDeep').name('clot');
  spikes.addColor(c, 'colorSpikeRim').name('rim');
  spikes.addColor(c, 'colorSpikeInner').name('base glow');
  spikes.addColor(c, 'colorSpikeSpec').name('highlight');

  const drops = folder.addFolder('5 · Droplets & mist');
  R(drops, c, 'dropPerSpike', 0, 40, 1, 'droplets per spike');
  R(drops, c, 'dropSpeed', 0, 15, 0.05, 'droplet speed');
  R(drops, c, 'dropSize', 0.01, 0.3, 0.002, 'droplet size');
  R(drops, c, 'dropLifetime', 0.1, 3, 0.01, 'droplet life (s)');
  R(drops, c, 'dropGravity', -30, 0, 0.1, 'droplet gravity');
  R(drops, c, 'dripRate', 0, 120, 1, 'tip drips / s');
  R(drops, c, 'wellRate', 0, 200, 1, 'welling / s');
  Editor.gradient(drops, c, 'colorDrop', 'droplet colour');
  R(drops, c, 'mistRate', 0, 120, 1, 'mist / s');
  R(drops, c, 'mistSize', 0.1, 5, 0.01, 'mist size');
  R(drops, c, 'mistLifetime', 0.2, 6, 0.05, 'mist life (s)');
  R(drops, c, 'mistRise', -1, 1, 0.01, 'mist rise');
  R(drops, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  R(drops, c, 'mistHeight', 0, 1.5, 0.01, 'mist height (m)');
  Editor.gradient(drops, c, 'colorMist', 'mist colour');

  const kill = folder.addFolder('6 · The impaling');
  R(kill, c, 'killReach', 0.2, 2, 0.01, 'reach (× zone)');
  R(kill, c, 'killImpulse', 0, 20, 0.1, 'thrown out (m/s)');
  R(kill, c, 'killLift', 0, 20, 0.1, 'thrown up (m/s)');
  R(kill, c, 'killSpin', 0, 4, 0.01, 'torque');
  R(kill, c, 'eruptFlash', 0, 2, 0.01, 'eruption flash');
  R(kill, c, 'eruptShake', 0, 2, 0.01, 'eruption shake');
  R(kill, c, 'sealShake', 0, 1, 0.01, 'seal shake');
  R(kill, c, 'burstRadius', 0.2, 8, 0.05, 'burst radius (m)');
  R(kill, c, 'burstLife', 0.1, 2, 0.01, 'burst life (s)');
  kill.addColor(c, 'colorFlash').name('flash');
  kill.addColor(c, 'colorBurstA').name('burst A');
  kill.addColor(c, 'colorBurstB').name('burst B');
  kill.addColor(c, 'colorBurstC').name('burst C');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'eruptLight', 0, 40, 0.1, 'eruption punch');

  folder.close();
  return folder;
}
