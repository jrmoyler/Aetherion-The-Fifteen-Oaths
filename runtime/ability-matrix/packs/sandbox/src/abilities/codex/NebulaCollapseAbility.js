import { Mesh, PlaneGeometry, SphereGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createDiceQuadGeometry, rollDice } from '../../assets/codex/NebulaCollapseGeometry.js';
import {
  createNebulaGasMaterial,
  createNebulaStarMaterial,
  createProtostarMaterial,
  createCoronaMaterial,
  createAccretionDiskMaterial,
  createRemnantRingMaterial,
  createNovaShellMaterial,
  createNebulaGroundMaterial,
  createNebulaWellMaterial,
  createNebulaLensMaterial
} from '../../materials/codex/NebulaCollapseMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'nebula';

const TAU = Math.PI * 2;
/** Gas billboards and embedded stars — the editor's count sliders clamp to these. */
const MAX_PUFFS = 40;
const MAX_STARS = 120;
/** Bodies the collapse can hold at once. */
const MAX_GRIPS = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _floor = new Vector3();
const _at = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * NEBULA COLLAPSE — Cosmic, zone cast.
 *
 * A seed of light flies out over the circle. A nebula gathers round it —
 * its heart hung at a height derived from the circle (`zoneRadius ×
 * cloudHeightPerZone`), so it always reads in an 8 m frame —
 * turning; it contracts — inside first, winding into a spiral as it falls —
 * dragging every body beneath it up into orbit round the core it is becoming.
 * The core ignites into a protostar with a corona and an accretion disk,
 * blazes, implodes — and goes supernova: a shell of light tears outward, a
 * shock front sweeps the floor, star-dust blasts out and the bodies it was
 * holding are thrown. A faint remnant ring is left hanging, widening, fading.
 *
 * One clock, from the moment the seed arrives, in four beats
 * (`gatherTime`, `collapseTime`, `holdTime`, `novaTime`) and a linger
 * (`lifetime`, the fade phase).
 *
 * ## Layers
 *
 *   - **the gas** (`createNebulaGasMaterial`) — instanced fbm billboards placed
 *     in the vertex stage from dice: a flattened, differentially rotating cloud
 *     that collapses from the inside out and is blown back out. Additive,
 *     heated toward white-gold as it compresses.
 *   - **the dust lanes** (`createNebulaGasMaterial(true)`) — the same puffs,
 *     a little larger, normal-blended in the deep tone under the glowing gas:
 *     the cloud's body and its dark stop against the floor.
 *   - **the gravity well** (`createNebulaWellMaterial`) — the floor under the
 *     circle sinks toward the deep tone in log-spiral arms that wind inward
 *     faster as it collapses, with a violet lip; it is left as a scar. Lit
 *     CHIP debris is dragged across it toward the heart.
 *   - **embedded stars** (`createNebulaStarMaterial`) — same placement, tiny,
 *     twinkling with diffraction spikes; they flare as they are swallowed.
 *   - **the protostar** (`createProtostarMaterial`) + **corona**
 *     (`createCoronaMaterial`) — a boiling, limb-brightened sphere inside a
 *     billboard of flickering streamers.
 *   - **the accretion disk** (`createAccretionDiskMaterial`) — a tilted ring of
 *     winding spiral arms, hot inside, Doppler-brightened on one limb.
 *   - **the lens** (`createNebulaLensMaterial`, `LAYER.DISTORTION`) — the mass
 *     pinching the world toward the core; then a ring of push riding the shell.
 *   - **the supernova shell** (`createNovaShellMaterial`) — a thin filamented
 *     shell, cooling from white through pink and violet to teal as it tears
 *     away.
 *   - **the ground** (`createNebulaGroundMaterial`) — the cloud's glow on the
 *     floor, gravity ripples running inward, then a chromatic shock front with
 *     a cooling starburst behind it. Plus an engine SHOCKWAVE decal, a
 *     DUSTRING and a squashed AIR pressure shell at the floor.
 *   - **the remnant ring** (`createRemnantRingMaterial`) — wispy, widening,
 *     fading in the disk's plane.
 *   - **particles** — gas wisps drawn in off the rim (curl), star-dust sifting
 *     through the cloud and then blasted out, and fast spark streaks.
 *
 * ## What happens to a body
 *
 * `handlesOwnHits`. When the collapse takes hold, everything in the circle is
 * tipped off its feet toward the middle and `carry`d — buoyed, so the pull and
 * not gravity decides where it goes — up to an orbit round the core that
 * tightens as the cloud contracts. At the supernova each held body gets one
 * full-grab carry onto an outward velocity and is `release`d, so its next
 * substep is a body in flight; anything still standing within the blast is
 * killed along the radial.
 *
 * ## The editor rule
 *
 * A cast holds dice (in the instance buffers), a seed, integrated phases and
 * the one-shot events it has latched (the grab, the supernova). Every metre,
 * second and colour is resolved from `settings.nebula` each frame.
 */
export class NebulaCollapseAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies held in orbit. HUD readout only. */
  get instanceCount() {
    return this._gripCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- the floor ---- */
    this.planeGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.groundMaterial = createNebulaGroundMaterial();
    this.ground = this._mesh(this.planeGeometry, this.groundMaterial, 3);
    this.wellMaterial = createNebulaWellMaterial();
    this.well = this._mesh(this.planeGeometry, this.wellMaterial, 2);

    /* ---- the cloud ---- */
    this.gasGeometry = createDiceQuadGeometry(MAX_PUFFS);
    this.gasMaterial = createNebulaGasMaterial();
    this.gas = this._mesh(this.gasGeometry, this.gasMaterial, 10);
    // The dark dust lanes: the same puffs, deep and normal-blended, under the glow.
    this.laneMaterial = createNebulaGasMaterial(true);
    this.lanes = this._mesh(this.gasGeometry, this.laneMaterial, 9);

    this.starGeometry = createDiceQuadGeometry(MAX_STARS);
    this.starMaterial = createNebulaStarMaterial();
    this.stars = this._mesh(this.starGeometry, this.starMaterial, 11);

    /* ---- the protostar ---- */
    this.diskMaterial = createAccretionDiskMaterial();
    this.disk = this._mesh(this.planeGeometry, this.diskMaterial, 12);

    this.sphereGeometry = new SphereGeometry(1, 48, 32);
    this.coreMaterial = createProtostarMaterial();
    this.core = this._mesh(this.sphereGeometry, this.coreMaterial, 13);

    this.coronaMaterial = createCoronaMaterial();
    this.corona = this._mesh(this.planeGeometry, this.coronaMaterial, 14);

    /* ---- the supernova ---- */
    this.shellMaterial = createNovaShellMaterial();
    this.shell = this._mesh(this.sphereGeometry, this.shellMaterial, 15);

    this.remnantMaterial = createRemnantRingMaterial();
    this.remnant = this._mesh(this.planeGeometry, this.remnantMaterial, 9);

    /* ---- the lens ---- */
    this.lensMaterial = createNebulaLensMaterial();
    this.lens = new Mesh(this.planeGeometry, this.lensMaterial);
    this.lens.name = 'NebulaLens';
    this.lens.layers.set(LAYER.DISTORTION);
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.group.add(this.lens);

    /* ---- state handed to the materials, one object apiece ---- */
    this._heart = new Vector3();
    this._zone = new Vector3();
    this._axisU = new Vector3(1, 0, 0);
    this._axisV = new Vector3(0, 0, 1);
    this._cloudState = {
      centre: this._heart,
      radius: 5,
      angle: 0,
      contract: 0,
      blast: 0,
      blastRadius: 10,
      flow: 0,
      heat: 0,
      fade: 0,
      twinkle: 0
    };
    this._coreState = { boil: 0, heat: 0, fade: 0 };
    this._coronaState = { size: 2, core: 0.25, boil: 0, fade: 0 };
    this._diskState = { centre: this._heart, axisU: this._axisU, axisV: this._axisV, inner: 0.5, outer: 2, spin: 0, fade: 0, seed: 0 };
    this._shellState = { age: 0, fade: 0, seed: 0 };
    this._remnantState = { centre: this._heart, axisU: this._axisU, axisV: this._axisV, radius: 3, flow: 0, fade: 0, seed: 0 };
    this._groundState = {
      centre: this._zone,
      quad: 10,
      gather: 0,
      flow: 0,
      inflow: 0,
      inflowPhase: 0,
      shockR: 0,
      shock: 0,
      scorch: 0,
      seed: 0
    };
    this._lensState = { size: 8, pinch: 0, core: 0.2, shockR: 0, shock: 0 };
    this._wellState = { centre: this._zone, radius: 4, strength: 0, phase: 0, seed: 0 };
    this._wellPhase = 0;

    /* ---- clocks and latches ---- */
    this._clock = -1;
    this._seed = 0;
    this._angle = 0;
    this._flow = 0;
    this._boil = 0;
    this._spin = 0;
    this._twinkle = 0;
    this._ripple = 0;
    this._grabbed = false;
    this._blown = false;
    this._lightLevel = 0.4;
    this._coreR = 0;

    /* ---- the grip ---- */
    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0, bearing: 0, start: 0 });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** Where the body being carried is meant to be — set before each `carry`. */
    this._target = new Vector3();
    this._throwing = false;

    /**
     * One bound field for both moves: while holding, a spring toward
     * `_target`; at the blast, straight out from the core and up.
     */
    this._field = (x, y, z, out) => {
      const c = settings.nebula;
      if (this._throwing) {
        const dx = x - this._heart.x;
        const dz = z - this._heart.z;
        const flat = Math.max(1e-3, Math.hypot(dx, dz));
        const power = settings.global.explosionIntensity;
        out.set((dx / flat) * c.throwImpulse * power, c.throwLift * power, (dz / flat) * c.throwImpulse * power);
        return;
      }
      out.set((this._target.x - x) * c.carryPull, (this._target.y - y) * c.carryPull, (this._target.z - z) * c.carryPull);
      // Capped, so a body far off is reeled in rather than snapped.
      const l = out.length();
      if (l > 12) out.multiplyScalar(12 / l);
    };
  }

  _mesh(geometry, material, order) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Gas drawn in off the rim: curl so it snakes on its way.
    this.wisps = particles.get('nebula.wisps', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.6
    });
    const w = this.wisps.uniforms;
    w.uDrag.value = 0.2;
    w.uSizeIn.value = 0.2;
    w.uFadeIn.value = 0.25;
    w.uFadeOut.value = 0.4;
    w.uEndSize.value = 0.25;
    w.uGravity.value.set(0, 0, 0);
    w.uTurbFrequency.value = 0.5;
    w.uTurbSpeed.value = 0.4;

    // Star-dust: sifting through the cloud, then blasted out.
    this.dust = particles.get('nebula.dust', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    const d = this.dust.uniforms;
    d.uSizeIn.value = 0.03;
    d.uFadeIn.value = 0.02;
    d.uFadeOut.value = 0.6;
    d.uEndSize.value = 0.3;
    d.uGravity.value.set(0, -0.4, 0);

    this.sparks = particles.get('nebula.sparks', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    const s = this.sparks.uniforms;
    s.uDrag.value = 1.8;
    s.uSizeIn.value = 0.02;
    s.uFadeIn.value = 0.01;
    s.uFadeOut.value = 0.6;
    s.uEndSize.value = 0.2;
    s.uGravity.value.set(0, -2, 0);

    // Floor chips dragged in along the ground toward the well's heart.
    this.debris = particles.get('nebula.debris', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    const db = this.debris.uniforms;
    db.uDrag.value = 0.4;
    db.uSizeIn.value = 0.05;
    db.uFadeIn.value = 0.05;
    db.uFadeOut.value = 0.3;
    db.uEndSize.value = 0.4;
    db.uGravity.value.set(0, 0, 0);

    this.debrisEmitter = new RateEmitter();
    this.wispEmitter = new RateEmitter();
    this.sprinkleEmitter = new RateEmitter();
    this.heraldEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _L() {
    return Math.max(0.05, settings.global.lifetime);
  }

  /** Seconds after arrival each beat ends: gather, collapse, hold, nova. */
  _t1() {
    return Math.max(0.05, settings.nebula.gatherTime) * this._L();
  }

  _t2() {
    return this._t1() + Math.max(0.05, settings.nebula.collapseTime) * this._L();
  }

  _t3() {
    return this._t2() + Math.max(0.02, settings.nebula.holdTime) * this._L();
  }

  _t4() {
    return this._t3() + Math.max(0.05, settings.nebula.novaTime) * this._L();
  }

  get impactDuration() {
    return this._t4();
  }

  get fadeDuration() {
    return Math.max(0.1, settings.nebula.lifetime * this._L());
  }

  /** A slow breath while it gathers; the protostar's blaze, flickering. */
  lightShimmer() {
    const flicker = 0.92 + 0.08 * Math.sin(this.age * 13.7) * Math.sin(this.age * 5.1);
    return this._lightLevel * flicker;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.nebula;
    this._clock = -1;
    this._seed = Math.random() * 100;
    this._angle = Math.random() * TAU;
    this._flow = 0;
    this._boil = 0;
    this._spin = 0;
    this._twinkle = 0;
    this._ripple = 0;
    this._grabbed = false;
    this._blown = false;
    this._throwing = false;
    this._lightLevel = 0.6;
    this._coreR = 0;
    this._releaseGrips();
    this.wispEmitter.reset();
    this.sprinkleEmitter.reset();
    this.heraldEmitter.reset();
    this.debrisEmitter.reset();
    this._wellPhase = 0;

    rollDice(this.gasGeometry, MAX_PUFFS, 0.25);
    rollDice(this.starGeometry, MAX_STARS, 0);

    this._frame(c);
    for (const mesh of [this.ground, this.well, this.gas, this.lanes, this.stars, this.disk, this.shell, this.remnant, this.lens]) mesh.visible = false;
    // The seed of light rides the travel: the core, tiny, in its corona.
    this.core.visible = true;
    this.corona.visible = true;
    this._syncParticles(c);
  }

  /** The circle, the heart over it, and the disk's tilted basis. */
  _frame(c) {
    this.pointAt(1, this._zone);
    this._zone.y = 0;
    this._heart.copy(this._zone);
    this._heart.y = this._cloudY(c);
    // Tipped about the side axis toward the caster, so the disk is seen open.
    const ct = Math.cos(c.diskTilt);
    const st = Math.sin(c.diskTilt);
    this._axisU.copy(this.side);
    this._axisV.copy(this.direction).multiplyScalar(ct).addScaledVector(_up, st);
  }

  /** The heart's height, derived from the circle so the cloud reads in frame. */
  _cloudY(c) {
    return Math.max(0.8, c.zoneRadius * c.cloudHeightPerZone + c.cloudHeight);
  }

  /** The cloud's radius, derived from the circle. */
  _cloudR(c) {
    return Math.max(0.5, c.zoneRadius * c.cloudRadiusPerZone + c.cloudRadius);
  }

  _resetEmit(time) {
    _emit.position = null;
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.45;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  _syncParticles(c) {
    const g = settings.global;
    this.wisps.setGradient(getColor(c.colorWispA), getColor(c.colorWispB), getColor(c.colorWispC), getColor(c.colorWispD));
    const w = this.wisps.uniforms;
    w.uSizeScale.value = g.particleSize;
    w.uLifeScale.value = 1; // their life is timed to reach the core
    w.uSpeedScale.value = 1;
    w.uOpacity.value = g.opacity;
    w.uGlow.value = c.gasGlow * g.glow;
    w.uTurbulence.value = 0.4 * g.turbulence;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uDrag.value = c.dustDrag;
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uGlow.value = c.starGlow * g.glow;
    d.uTurbulence.value = 0.2 * g.turbulence;

    this.debris.setGradient(getColor(c.colorDebrisA), getColor(c.colorDebrisB), getColor(c.colorDebrisC), getColor(c.colorDebrisD));
    const db = this.debris.uniforms;
    db.uSizeScale.value = g.particleSize;
    db.uLifeScale.value = 1; // timed to reach the heart
    db.uSpeedScale.value = 1;
    db.uOpacity.value = g.opacity;
    db.uGlow.value = 1;
    db.uTurbulence.value = 0.05 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const s = this.sparks.uniforms;
    s.uStretch.value = c.sparkStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.shellGlow * g.glow;
    s.uTurbulence.value = 0.1 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the seed of light                                          */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.nebula;
    const g = settings.global;
    this._frame(c);
    this._syncParticles(c);
    this._boil += c.coreBoilSpeed * dt * g.noiseSpeed;

    // Climbs from the hand to the heart of the circle as it flies.
    const k = Easing.inOutQuad(this.u);
    this.position.y = lerp(1.4, this._cloudY(c), k);

    const size = c.heraldSize * (1 + 0.25 * Math.sin(this.age * 22));
    this.core.position.copy(this.position);
    this.core.scale.setScalar(size);
    this.core.updateMatrix();
    this._coreState.boil = this._boil;
    this._coreState.heat = 1;
    this._coreState.fade = 1;
    this.coreMaterial.userData.sync(this._coreState);

    this.corona.position.copy(this.position);
    this.corona.updateMatrix();
    const cs = this._coronaState;
    cs.size = size * c.coronaSize * 2.5;
    cs.core = 1 / (c.coronaSize * 1.25);
    cs.boil = this._boil;
    cs.fade = 1;
    this.coronaMaterial.userData.sync(cs);

    const count = Math.round(this.heraldEmitter.tick(dt, c.heraldTrail) * g.particleCount);
    if (count > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.position = this.position;
      _emit.radius = 0.08;
      _emit.direction = _dir.copy(this.direction).negate();
      _emit.speed = 0.6;
      _emit.spread = 0.8;
      _emit.size = c.gasSize * 0.35;
      _emit.life = 0.6;
      this.wisps.emit(count, _emit);
    }
    this._lightLevel = 0.6;
  }

  onImpact() {
    const c = settings.nebula;
    const g = settings.global;
    this._clock = 0;
    this._frame(c);

    // The seed bursts into the first light of the cloud.
    this._resetEmit(frame.uTime.value);
    _emit.position = this._heart;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = 2.5;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.size = c.dustSize;
    _emit.life = c.dustLifetime * 0.6;
    this.dust.emit(Math.round(c.novaDust * 0.15 * g.particleCount), _emit);

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._zone, {
      radius: c.zoneRadius * 1.05,
      life: 0.6,
      width: 0.03,
      intensity: 0.25,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.lightBoost = c.lightIntensity * 0.4;
    this.core.visible = false;
    this.corona.visible = false;
    this.ground.visible = true;
    this.gas.visible = true;
    this.lanes.visible = true;
    this.stars.visible = true;
    this.well.visible = true;
  }

  onFade(dt) {
    const c = settings.nebula;
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._frame(c);
    this._syncParticles(c);
    this._update(dt, c);
    this.position.copy(this._heart);
  }

  /* ------------------------------------------------------------------ */
  /* The rite, resolved from the clock                                   */
  /* ------------------------------------------------------------------ */

  _update(dt, c) {
    const g = settings.global;
    const clock = this._clock;
    const t1 = this._t1();
    const t2 = this._t2();
    const t3 = this._t3();
    const t4 = this._t4();
    const power = g.explosionIntensity;
    const fadeT = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;

    /* ---- the envelopes ---- */
    const appear = Easing.outCubic(saturate(clock / t1));
    const cx = saturate((clock - t1) / Math.max(0.01, t2 - t1));
    // It accelerates as it falls in: mostly cubic, with a linear start so it moves at once.
    const contract = cx * 0.35 + Easing.inCubic(cx) * 0.65;
    const holdT = saturate((clock - t2) / Math.max(0.01, t3 - t2));
    const novaT = saturate((clock - t3) / Math.max(0.01, t4 - t3));
    const novaSince = Math.max(0, clock - t3);
    const exploded = clock >= t3;
    // The implosion: the last `implodeShare` of the hold.
    const implode = smoothstep(1 - saturate(c.implodeShare), 1, holdT);

    /* ---- integrated phases ---- */
    this._angle += c.cloudSpin * dt * g.animationSpeed * (1 + c.spinUp * contract * contract) * (exploded ? 0.3 : 1);
    this._flow += c.gasFlowSpeed * dt * g.noiseSpeed;
    this._boil += c.coreBoilSpeed * dt * g.noiseSpeed * (1 + implode * 2);
    this._spin += c.diskSpin * dt * g.animationSpeed * (1 + holdT * 1.5 + implode * 3);
    this._twinkle += c.starTwinkleSpeed * dt;
    this._ripple += c.groundRippleSpeed * dt * (1 + contract * 2);

    /* ---- the cloud ---- */
    const blast = exploded ? Easing.outCubic(saturate(novaSince / Math.max(0.05, (t4 - t3) * 1.4))) : 0;
    const cs = this._cloudState;
    cs.radius = this._cloudR(c);
    cs.angle = this._angle;
    cs.contract = contract;
    cs.blast = blast;
    cs.blastRadius = c.novaRadius * 1.15 * power;
    cs.flow = this._flow;
    // Compression heats it; the blast cools it at once, so it never blooms to white.
    cs.heat = (contract + implode * 0.5) * (1 - blast);
    // Gathers in; once blown out, thins to wisps and is gone with the remnant.
    cs.fade = appear * (1 - smoothstep(0.25, 1, blast) * 0.7) * (1 - fadeT);
    cs.twinkle = this._twinkle;
    this.gasMaterial.userData.sync(cs);
    this.laneMaterial.userData.sync(cs);
    this.starMaterial.userData.sync(cs);
    this.gasGeometry.instanceCount = Math.min(MAX_PUFFS, Math.max(1, Math.round(c.puffCount)));
    this.starGeometry.instanceCount = Math.min(MAX_STARS, Math.max(0, Math.round(c.starCount)));
    this.gas.visible = cs.fade > 0.002;
    this.lanes.visible = this.gas.visible;
    this.stars.visible = cs.fade > 0.002 && !exploded;

    /* ---- the protostar ---- */
    let coreR = c.coreRadius * smoothstep(0.4, 1, contract);
    coreR *= 1 + c.corePulse * Math.sin(this.age * 7.3) * holdT;
    coreR *= lerp(1, c.implodeScale, implode);
    let coreFade = 1;
    if (exploded) {
      // It blows: swells and is gone in a breath.
      const k = saturate(novaSince / 0.15);
      coreR = c.coreRadius * c.implodeScale * (1 + 2 * Easing.outCubic(k));
      coreFade = 1 - k;
    }
    this._coreR = coreR;
    const coreUp = coreR > 0.005 && coreFade > 0.002;
    this.core.visible = coreUp;
    this.corona.visible = coreUp;
    if (coreUp) {
      this.core.position.copy(this._heart);
      this.core.scale.setScalar(coreR);
      this.core.updateMatrix();
      const co = this._coreState;
      co.boil = this._boil;
      co.heat = holdT * 0.6 + implode * 0.4;
      co.fade = coreFade;
      this.coreMaterial.userData.sync(co);

      this.corona.position.copy(this._heart);
      this.corona.updateMatrix();
      const cr = this._coronaState;
      cr.size = coreR * c.coronaSize * 2 * (1 + implode * 0.6);
      cr.core = 1 / Math.max(1.05, c.coronaSize);
      cr.boil = this._boil;
      cr.fade = coreFade * (0.6 + 0.4 * holdT + implode * 0.6);
      this.coronaMaterial.userData.sync(cr);
    }

    /* ---- the disk ---- */
    const ds = this._diskState;
    const coreBase = Math.max(coreR, c.coreRadius * c.implodeScale);
    ds.inner = coreBase * c.diskInner;
    ds.outer = coreBase * c.diskOuter * (1 - implode * 0.3);
    ds.fade = smoothstep(0.55, 0.95, contract);
    if (exploded) {
      // Flung out with the blast.
      const k = saturate(novaSince / Math.max(0.05, (t4 - t3) * 0.4));
      ds.outer = c.coreRadius * c.diskOuter * (1 + 3 * Easing.outCubic(k));
      ds.inner = ds.outer * 0.6;
      ds.fade = 1 - k;
    }
    ds.spin = this._spin;
    ds.seed = this._seed;
    this.diskMaterial.userData.sync(ds);
    this.disk.visible = ds.fade > 0.002;

    /* ---- the supernova ---- */
    if (exploded && !this._blown) this._supernova(c, g);
    const shellUp = exploded && novaT < 1;
    this.shell.visible = shellUp;
    let shellR = 0;
    if (shellUp) {
      shellR = lerp(c.coreRadius, c.novaRadius * power, Easing.outCubic(novaT));
      this.shell.position.copy(this._heart);
      this.shell.scale.setScalar(Math.max(0.01, shellR));
      this.shell.updateMatrix();
      const sh = this._shellState;
      sh.age = novaT;
      sh.fade = (1 - smoothstep(0.55, 1, novaT)) * smoothstep(0, 0.04, novaT);
      sh.seed = this._seed;
      this.shellMaterial.userData.sync(sh);
    }

    /* ---- the remnant ---- */
    const remSince = novaSince - (t4 - t3) * 0.35;
    const rm = this._remnantState;
    rm.radius = c.remnantRadius * power * (0.6 + 0.4 * Easing.outCubic(saturate(remSince / 0.6))) + Math.max(0, remSince) * c.remnantGrow;
    rm.flow = this._flow;
    rm.seed = this._seed;
    rm.fade = exploded && remSince > 0 ? smoothstep(0, 0.5, remSince) * (1 - Easing.inQuad(fadeT)) : 0;
    this.remnantMaterial.userData.sync(rm);
    this.remnant.visible = rm.fade > 0.002;

    /* ---- the ground ---- */
    const gs = this._groundState;
    gs.quad = 2 * (Math.max(c.novaRadius * power, c.zoneRadius * 1.3) + 1.5);
    gs.gather = appear * (1 - blast) * (0.6 + 0.6 * contract);
    gs.flow = this._flow;
    gs.inflow = smoothstep(0, 0.25, cx) * (1 - smoothstep(0.7, 1, holdT)) * (exploded ? 0 : 1);
    gs.inflowPhase = this._ripple;
    gs.shockR = exploded ? c.novaRadius * power * Easing.outCubic(saturate(novaSince / Math.max(0.05, (t4 - t3) * 0.9))) : 0;
    gs.shock = exploded ? 1 - smoothstep(0.5, 1, saturate(novaSince / Math.max(0.05, (t4 - t3) * 0.9))) : 0;
    gs.scorch = exploded ? smoothstep(0, 0.08, novaSince) * (1 - saturate(novaSince / Math.max(0.1, c.scorchTime * this._L()))) : 0;
    gs.seed = this._seed;
    this.groundMaterial.userData.sync(gs);
    this.ground.visible = true;

    /* ---- the gravity well ---- */
    this._wellPhase += c.wellSpeed * dt * g.animationSpeed * (0.3 + contract * 1.7 + implode);
    const ws = this._wellState;
    ws.radius = c.zoneRadius * c.wellRadius;
    ws.phase = this._wellPhase;
    ws.seed = this._seed;
    const pull = appear * (0.35 + 0.65 * contract);
    ws.strength = (exploded ? lerp(pull, c.wellScar, smoothstep(0, 0.25, novaSince)) : pull) * (1 - fadeT);
    this.wellMaterial.userData.sync(ws);
    this.well.visible = ws.strength > 0.004;

    /* ---- the lens ---- */
    const ls = this._lensState;
    ls.size = this._cloudR(c) * c.lensSize;
    const half = ls.size * 0.5;
    ls.pinch = contract * (1 - blast) * (1 + implode);
    ls.core = (coreBase * 2.2) / Math.max(0.1, half);
    ls.shockR = shellR / Math.max(0.1, half);
    ls.shock = shellUp && ls.shockR < 1 ? 1 - novaT : 0;
    this.lensMaterial.userData.sync(ls);
    this.lens.position.copy(this._heart);
    this.lens.updateMatrix();
    this.lens.visible = ls.pinch > 0.01 || ls.shock > 0.01;

    /* ---- the light ---- */
    if (!exploded) this._lightLevel = lerp(0.5, 1, appear) + contract * c.lightHeat * 0.6 + holdT * c.lightHeat * 0.4 + implode;
    else this._lightLevel = lerp(1.2, 0.35, saturate(novaSince / 1.2)) * (1 - fadeT);

    /* ---- the camera ---- */
    if (!exploded && clock > t1) this.ctx.shake.rumble(c.collapseRumble * (contract + implode), dt);

    /* ---- particles ---- */
    this._wispFx(dt, c, g, appear * (1 - Math.max(blast, holdT)), contract);
    this._sprinkleFx(dt, c, g, appear * (exploded ? 0 : 1 - contract * 0.7));
    this._debrisFx(dt, c, g, exploded ? 0 : appear * (0.3 + contract));

    /* ---- the bodies ---- */
    if (!this._grabbed && clock >= t1 + saturate(c.grabDelay) * (t2 - t1)) this._grab(c, g);
    if (!exploded) this._hold(dt, c, contract, implode);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  /** Gas drawn in off the rim of the cloud toward the heart. */
  _wispFx(dt, c, g, strength, contract) {
    const count = Math.round(this.wispEmitter.tick(dt, c.gasRate * strength) * g.particleCount);
    if (count <= 0) return;
    this._resetEmit(frame.uTime.value);
    const rim = lerp(this._cloudR(c), this._cloudR(c) * 0.6, contract);
    const life = Math.max(0.1, c.gasLifetime * (1 - contract * 0.5));
    _emit.size = c.gasSize;
    _emit.life = life;
    _emit.lifeVariance = 0.15;
    _emit.speedVariance = 0.1;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const r = rim * (0.75 + Math.random() * 0.35);
      _pos.set(this._heart.x + Math.cos(a) * r, this._heart.y + (Math.random() * 2 - 1) * c.cloudThickness, this._heart.z + Math.sin(a) * r);
      // In toward the heart, with a turn: it spirals rather than falls.
      _vel.set(this._heart.x - _pos.x, this._heart.y - _pos.y, this._heart.z - _pos.z);
      const dist = _vel.length();
      _vel.multiplyScalar((c.gasInflow * dist) / Math.max(1e-3, dist * life));
      _vel.x += -Math.sin(a) * (1 + contract * 3);
      _vel.z += Math.cos(a) * (1 + contract * 3);
      const speed = _vel.length();
      _emit.position = _pos;
      _emit.direction = _dir.copy(_vel).divideScalar(Math.max(speed, 1e-4));
      _emit.speed = speed;
      this.wisps.emit(1, _emit);
    }
  }

  /** Floor chips dragged in along the ground, spiralling toward the well's heart. */
  _debrisFx(dt, c, g, strength) {
    const count = Math.round(this.debrisEmitter.tick(dt, c.debrisRate * strength) * g.particleCount);
    if (count <= 0) return;
    this._resetEmit(frame.uTime.value);
    const life = Math.max(0.1, c.debrisLifetime);
    const reach = c.zoneRadius * c.wellRadius;
    _emit.size = c.debrisSize;
    _emit.life = life;
    _emit.lifeVariance = 0.2;
    _emit.speedVariance = 0.15;
    _emit.spin = 6;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const r = reach * (0.55 + Math.random() * 0.45);
      _pos.set(this._zone.x + Math.cos(a) * r, 0.05 + Math.random() * 0.1, this._zone.z + Math.sin(a) * r);
      // In and round: they reach the heart as their life runs out.
      _vel.set((-Math.cos(a) * r * 0.85) / life, 0.15, (-Math.sin(a) * r * 0.85) / life);
      _vel.x += -Math.sin(a) * r * 0.6;
      _vel.z += Math.cos(a) * r * 0.6;
      const speed = _vel.length();
      _emit.position = _pos;
      _emit.direction = _dir.copy(_vel).divideScalar(Math.max(speed, 1e-4));
      _emit.speed = speed;
      this.debris.emit(1, _emit);
    }
  }

  /** Twinkles sifting through the cloud while it hangs. */
  _sprinkleFx(dt, c, g, strength) {
    const count = Math.round(this.sprinkleEmitter.tick(dt, c.sprinkleRate * strength) * g.particleCount);
    if (count <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dustSize * 0.8;
    _emit.life = c.dustLifetime * 0.7;
    _emit.speed = 0.25;
    _emit.spread = 1;
    _emit.direction = _up;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const r = this._cloudR(c) * Math.sqrt(Math.random()) * 0.85;
      _pos.set(this._heart.x + Math.cos(a) * r, this._heart.y + (Math.random() * 2 - 1) * c.cloudThickness, this._heart.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.dust.emit(1, _emit);
    }
  }

  /** The blast: flash, shake, light, decals, dust, sparks — and the throw. */
  _supernova(c, g) {
    this._blown = true;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;

    this._resetEmit(time);
    _emit.position = this._heart;
    _emit.radius = c.coreRadius;
    _emit.direction = _up;
    _emit.speed = c.dustSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.6; // all round
    _emit.size = c.dustSize;
    _emit.life = c.dustLifetime;
    _emit.lifeVariance = 0.5;
    this.dust.emit(Math.round(c.novaDust * g.particleCount), _emit);

    // Sparks: radial, flattened toward the disk's plane so the blast has a shape.
    const sparks = Math.round(c.novaSparks * g.particleCount);
    _emit.radius = c.coreRadius * 0.5;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.08;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.4;
    for (let n = 0; n < sparks; n++) {
      const a = Math.random() * TAU;
      const tilt = (Math.random() * 2 - 1) * (n % 3 === 0 ? 1 : 0.25);
      _dir.copy(this._axisU).multiplyScalar(Math.cos(a)).addScaledVector(this._axisV, Math.sin(a)).addScaledVector(_up, tilt).normalize();
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed;
      this.sparks.emit(1, _emit);
    }

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._zone, {
      radius: c.novaShockRadius * power,
      life: 0.9,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, this._zone, {
      radius: c.zoneRadius * 1.4,
      life: 1.4,
      intensity: 0.6,
      colorA: getColor(c.colorWispD),
      colorB: getColor(c.colorA)
    });
    _floor.copy(this._zone).setY(0.3);
    this.ctx.bursts.spawn(BurstMode.AIR, _floor, {
      radius: 0.4,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: 1.6,
      opacity: 0.6 * g.opacity,
      fresnel: 2.4,
      squash: 0.35,
      colorA: getColor(c.colorHot),
      colorB: getColor(c.colorGasC),
      colorC: getColor(c.colorA)
    });

    this.ctx.shake.add(c.novaShake * power, 1 / Math.max(0.05, c.novaShakeDuration), 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.novaFlash * power);
    this.lightBoost = c.lightIntensity * c.novaLight * power;

    this._throw(c, g);
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return this._grips[i];
    return null;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
    }
    this._gripCount = 0;
  }

  /** The collapse takes hold: everything in the circle is tipped in and taken. */
  _grab(c, g) {
    this._grabbed = true;
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const found = field.findBodies(this._zone.x, this._zone.z, c.zoneRadius * c.grabReach, this._found);
    this._force.impulse = c.grabImpulse;
    this._force.lift = c.grabLift;
    this._force.spin = c.grabSpin;
    for (let f = 0; f < found.length && this._gripCount < MAX_GRIPS; f++) {
      const dummy = found[f];
      if (dummy.finished || this._gripOf(dummy)) continue;
      if (!dummy.alive && c.corpseCatch < 0.5) continue;
      const dx = dummy.position.x - this._zone.x;
      const dz = dummy.position.z - this._zone.z;
      if (dummy.alive) {
        // Tipped toward the middle, and up off its feet.
        _dir.set(-dx, 0, -dz);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      }
      if (!dummy.bodyPoint(_at)) continue;
      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.bearing = Math.atan2(dz, dx);
      slot.start = Math.hypot(dx, dz);
    }
    this._found.length = 0;
  }

  /** Haul every held body up into an orbit round the core that tightens as it collapses. */
  _hold(dt, c, contract, implode) {
    if (dt <= 0) return;
    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || dummy.alive || !dummy.bodyPoint(_at)) {
        dummy?.release();
        slot.dummy = null;
        const last = --this._gripCount;
        this._grips[i] = this._grips[last];
        this._grips[last] = slot;
        continue;
      }
      slot.time += dt;
      dummy.hold();
      const wound = Easing.outCubic(saturate(slot.time / 0.5));
      // Their orbit: from where they stood, in to `orbitRadius`, and up to the core.
      const k = Easing.inOutQuad(saturate(contract * 1.15));
      const r = lerp(Math.max(slot.start, 0.5), c.orbitRadius * (1 - implode * 0.35), k);
      const a = slot.bearing + c.orbitSpin * slot.time * (0.3 + k);
      this._target.set(
        this._heart.x + Math.cos(a) * r,
        lerp(0.9, this._heart.y - c.orbitDrop, k),
        this._heart.z + Math.sin(a) * r
      );
      const grab = saturate(c.carryGrip * dt) * wound;
      dummy.carry(this._field, grab, grab, saturate(c.carryBuoyancy) * wound);
    }
  }

  /** The blast throws everything it was holding, and whatever else is standing. */
  _throw(c, g) {
    this._throwing = true;
    for (let i = 0; i < this._gripCount; i++) {
      const dummy = this._grips[i].dummy;
      if (!dummy || dummy.finished) continue;
      dummy.carry(this._field, 1, 1, 0);
      dummy.release();
      this._grips[i].dummy = null;
    }
    this._gripCount = 0;
    this._throwing = false;

    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const power = g.explosionIntensity;
    this._force.impulse = c.throwImpulse * power;
    this._force.lift = c.throwLift * power;
    this._force.spin = c.throwSpin;
    const found = field.findTargets(this._zone.x, this._zone.z, c.novaRadius * c.throwReach * power, this._found);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - this._zone.x, 0, dummy.position.z - this._zone.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._found.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseGrips();
    this._clock = -1;
    for (const mesh of [this.ground, this.well, this.gas, this.lanes, this.stars, this.disk, this.core, this.corona, this.shell, this.remnant, this.lens]) {
      mesh.visible = false;
    }
  }

  dispose() {
    for (const geometry of [this.planeGeometry, this.gasGeometry, this.starGeometry, this.sphereGeometry]) geometry.dispose();
    for (const material of [
      this.groundMaterial,
      this.wellMaterial,
      this.gasMaterial,
      this.laneMaterial,
      this.starMaterial,
      this.diskMaterial,
      this.coreMaterial,
      this.coronaMaterial,
      this.shellMaterial,
      this.remnantMaterial,
      this.lensMaterial
    ]) {
      material.dispose();
    }
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F30C}  Nebula Collapse');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 10, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'seed speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'remnant lingers (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'heraldSize', 0.02, 1, 0.005, 'seed size (m)');
  R(cast, c, 'heraldTrail', 0, 300, 1, 'seed trail/second');

  const beats = folder.addFolder('The beats');
  R(beats, c, 'gatherTime', 0.05, 4, 0.01, 'gathers (s)');
  R(beats, c, 'collapseTime', 0.05, 5, 0.01, 'collapses (s)');
  R(beats, c, 'holdTime', 0.02, 4, 0.01, 'protostar blazes (s)');
  R(beats, c, 'novaTime', 0.05, 4, 0.01, 'shell flies (s)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightHeat', 0, 8, 0.05, 'protostar brightening');

  const cloud = folder.addFolder('1 · Nebula');
  const shape = cloud.addFolder('Shape & motion');
  R(shape, c, 'cloudRadiusPerZone', 0.2, 3, 0.01, 'radius (× circle)');
  R(shape, c, 'cloudRadius', -4, 8, 0.05, 'radius, extra (m)');
  R(shape, c, 'cloudHeightPerZone', 0.1, 2, 0.01, 'height (× circle)');
  R(shape, c, 'cloudHeight', -3, 8, 0.05, 'height, extra (m)');
  R(shape, c, 'cloudThickness', 0.05, 5, 0.01, 'half-thickness (m)');
  R(shape, c, 'collapseThickKeep', 0, 1, 0.01, 'thickness kept as it falls');
  R(shape, c, 'cloudSpin', -3, 3, 0.01, 'spin (rad/s)');
  R(shape, c, 'spinUp', 0, 20, 0.05, 'spins up as it falls');
  R(shape, c, 'cloudShear', 0, 1, 0.01, 'spiral shear');
  R(shape, c, 'infallLead', 0, 3, 0.01, 'inside falls first');
  R(shape, c, 'infallWind', -8, 8, 0.05, 'winds in (rad)');
  R(shape, c, 'collapseTo', 0.2, 6, 0.01, 'collapses to (× core)');
  const gasF = cloud.addFolder('Gas');
  R(gasF, c, 'puffCount', 1, MAX_PUFFS, 1, 'puffs');
  R(gasF, c, 'puffSize', 0.2, 10, 0.05, 'puff size (m)');
  R(gasF, c, 'puffSizeJitter', 0, 1, 0.01, 'size jitter');
  R(gasF, c, 'puffCoreSize', 0.05, 1.5, 0.01, 'size collapsed');
  R(gasF, c, 'puffBlastSize', 0.2, 4, 0.01, 'size blown out');
  R(gasF, c, 'gasNoiseScale', 0.2, 6, 0.01, 'churn scale');
  R(gasF, c, 'gasFlowSpeed', 0, 3, 0.01, 'churn speed');
  R(gasF, c, 'gasFilaments', 0, 1, 0.01, 'filaments');
  R(gasF, c, 'gasDensity', 0, 3, 0.01, 'density');
  R(gasF, c, 'gasGlow', 0, 6, 0.01, 'glow');
  R(gasF, c, 'gasAccent', 0, 1, 0.01, 'teal / magenta share');
  R(gasF, c, 'collapseThin', 0, 1, 0.01, 'collapsed gas thins away');
  R(gasF, c, 'laneDensity', 0, 1, 0.01, 'dark lanes');
  R(gasF, c, 'laneSize', 0.5, 2, 0.01, 'lane size (× puff)');
  R(gasF, c, 'laneCoreSize', 0.05, 1.5, 0.01, 'lane size collapsed (× size)');
  R(gasF, c, 'laneLift', 0, 1, 0.01, 'lane violet glow');
  gasF.addColor(c, 'colorDeep').name('deep (lanes, well)');
  R(gasF, c, 'gasSoftFade', 0.01, 4, 0.01, 'soft intersection (m)');
  gasF.addColor(c, 'colorA').name('violet');
  gasF.addColor(c, 'colorGasB').name('teal');
  gasF.addColor(c, 'colorGasC').name('pink');
  gasF.addColor(c, 'colorHot').name('heat / star');
  const starF = cloud.addFolder('Stars');
  R(starF, c, 'starCount', 0, MAX_STARS, 1, 'stars');
  R(starF, c, 'starSize', 0.02, 1, 0.005, 'size (m)');
  R(starF, c, 'starFlare', 0, 5, 0.01, 'flare as swallowed');
  R(starF, c, 'starTwinkle', 0, 1, 0.01, 'twinkle');
  R(starF, c, 'starTwinkleSpeed', 0, 20, 0.05, 'twinkle speed');
  R(starF, c, 'starGlow', 0, 8, 0.05, 'glow');
  R(starF, c, 'starSpikes', 0, 3, 0.01, 'spikes');
  starF.addColor(c, 'colorStarA').name('star A');
  starF.addColor(c, 'colorStarB').name('star B');
  const wispF = cloud.addFolder('Gas drawn in');
  R(wispF, c, 'gasRate', 0, 400, 1, 'wisps/second');
  R(wispF, c, 'gasSize', 0.05, 4, 0.01, 'wisp size');
  R(wispF, c, 'gasLifetime', 0.1, 5, 0.05, 'wisp lifetime');
  R(wispF, c, 'gasInflow', 0, 1.5, 0.01, 'reach toward the core');
  R(wispF, c, 'sprinkleRate', 0, 200, 1, 'twinkles/second');
  Editor.gradient(wispF, c, 'colorWisp', 'wisp gradient');

  const star = folder.addFolder('2 · Protostar');
  R(star, c, 'coreRadius', 0.05, 3, 0.01, 'core radius (m)');
  R(star, c, 'coreGranulation', 0.5, 20, 0.05, 'granulation');
  R(star, c, 'coreBoilSpeed', 0, 8, 0.05, 'boil speed');
  R(star, c, 'coreLimb', 0, 8, 0.05, 'hot rim');
  R(star, c, 'coreGlow', 0, 12, 0.05, 'glow');
  R(star, c, 'coreHeatCap', 0, 1, 0.01, 'white-gold cap');
  R(star, c, 'coreBloomCap', 0.2, 6, 0.05, 'bloom cap');
  R(star, c, 'corePulse', 0, 0.5, 0.005, 'throb');
  R(star, c, 'implodeShare', 0, 1, 0.01, 'implodes over (share of hold)');
  R(star, c, 'implodeScale', 0.05, 1, 0.01, 'implodes to (× radius)');
  star.addColor(c, 'colorCore').name('core');
  star.addColor(c, 'colorB').name('rim & streamers');
  const corona = star.addFolder('Corona');
  R(corona, c, 'coronaSize', 1.1, 12, 0.05, 'size (× core)');
  R(corona, c, 'coronaRays', 1, 30, 0.5, 'streamers');
  R(corona, c, 'coronaRayLength', 0.02, 1, 0.01, 'streamer length');
  R(corona, c, 'coronaFalloff', 0.01, 1, 0.01, 'glow falloff');
  R(corona, c, 'coronaGlow', 0, 8, 0.05, 'glow');
  R(corona, c, 'coronaBloomCap', 0.1, 6, 0.05, 'bloom cap');
  const disk = star.addFolder('Accretion disk');
  R(disk, c, 'diskInner', 1, 6, 0.01, 'inner (× core)');
  R(disk, c, 'diskOuter', 1.2, 14, 0.05, 'outer (× core)');
  R(disk, c, 'diskTilt', -1.5, 1.5, 0.01, 'tilt (rad)');
  R(disk, c, 'diskSpin', -12, 12, 0.05, 'spin (rad/s)');
  R(disk, c, 'diskArms', 1, 8, 1, 'arms');
  R(disk, c, 'diskTwist', -10, 10, 0.05, 'arm winding');
  R(disk, c, 'diskDoppler', 0, 1, 0.01, 'doppler limb');
  R(disk, c, 'diskGlow', 0, 8, 0.05, 'glow');
  const lens = star.addFolder('Lens (distortion)');
  R(lens, c, 'lensPinch', 0, 4, 0.01, 'gravity pinch');
  R(lens, c, 'lensShock', 0, 4, 0.01, 'shell push');
  R(lens, c, 'lensSize', 0.5, 5, 0.01, 'size (× cloud radius)');

  const nova = folder.addFolder('3 · Supernova');
  R(nova, c, 'novaRadius', 1, 20, 0.05, 'shell radius (m)');
  R(nova, c, 'shellThin', 0.3, 8, 0.05, 'shell thinness');
  R(nova, c, 'shellFilaments', 0, 4, 0.01, 'filaments');
  R(nova, c, 'shellFilamentScale', 0.3, 10, 0.05, 'filament scale');
  R(nova, c, 'shellGlow', 0, 10, 0.05, 'glow');
  R(nova, c, 'novaDust', 0, 1000, 1, 'star-dust');
  R(nova, c, 'dustSpeed', 0, 40, 0.1, 'dust speed');
  R(nova, c, 'dustSize', 0.01, 0.6, 0.005, 'dust size');
  R(nova, c, 'dustLifetime', 0.1, 5, 0.05, 'dust lifetime');
  R(nova, c, 'dustDrag', 0, 6, 0.01, 'dust drag');
  Editor.gradient(nova, c, 'colorDust', 'dust gradient');
  R(nova, c, 'novaSparks', 0, 600, 1, 'sparks');
  R(nova, c, 'sparkSpeed', 0, 60, 0.1, 'spark speed');
  R(nova, c, 'sparkSize', 0.005, 0.4, 0.001, 'spark width');
  R(nova, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(nova, c, 'sparkLifetime', 0.05, 3, 0.01, 'spark lifetime');
  Editor.gradient(nova, c, 'colorSpark', 'spark gradient');
  R(nova, c, 'novaShockRadius', 0, 24, 0.05, 'shockwave decal (m)');
  R(nova, c, 'burstSize', 0, 16, 0.05, 'pressure shell (m)');
  R(nova, c, 'novaShake', 0, 2, 0.01, 'camera knock');
  R(nova, c, 'novaShakeDuration', 0.05, 3, 0.01, 'knock lasts');
  R(nova, c, 'novaFlash', 0, 1.5, 0.01, 'flash');
  R(nova, c, 'novaLight', 0, 12, 0.05, 'light punch (× intensity)');
  R(nova, c, 'collapseRumble', 0, 1, 0.01, 'rumble while collapsing');
  nova.addColor(c, 'colorFlash').name('flash');
  nova.addColor(c, 'colorShockA').name('shockwave');
  nova.addColor(c, 'colorShockB').name('shockwave hot');

  const ground = folder.addFolder('4 · Ground & remnant');
  R(ground, c, 'groundGlow', 0, 3, 0.01, 'cloud glow on floor');
  R(ground, c, 'groundRipples', 0, 3, 0.01, 'gravity ripples');
  R(ground, c, 'groundRippleDensity', 0.1, 4, 0.01, 'rings per metre');
  R(ground, c, 'groundRippleSpeed', 0, 5, 0.01, 'rings per second');
  R(ground, c, 'groundShock', 0, 5, 0.01, 'shock front');
  R(ground, c, 'groundShockWidth', 0.02, 2, 0.01, 'front width (m)');
  R(ground, c, 'groundChroma', 0, 1, 0.005, 'colour split (m)');
  R(ground, c, 'groundScorch', 0, 3, 0.01, 'starburst');
  R(ground, c, 'groundRays', 2, 60, 1, 'starburst rays');
  R(ground, c, 'scorchTime', 0.1, 6, 0.05, 'starburst cools (s)');
  R(ground, c, 'wellRadius', 0.3, 2, 0.01, 'gravity well (× circle)');
  R(ground, c, 'wellDepth', 0, 1, 0.01, 'well darkness');
  R(ground, c, 'wellArms', 1, 8, 1, 'well arms');
  R(ground, c, 'wellTwist', -8, 8, 0.05, 'arm winding');
  R(ground, c, 'wellSpeed', -6, 6, 0.05, 'arms wind in (rad/s)');
  R(ground, c, 'wellRim', 0, 3, 0.01, 'well lip glow');
  R(ground, c, 'wellArmLight', 0, 2, 0.01, 'well dust arms light');
  R(ground, c, 'wellScar', 0, 1, 0.01, 'scar after the blast');
  R(ground, c, 'debrisRate', 0, 300, 1, 'chips dragged in / s');
  R(ground, c, 'debrisSize', 0.01, 0.4, 0.005, 'chip size');
  R(ground, c, 'debrisLifetime', 0.1, 3, 0.05, 'chip reaches heart in (s)');
  Editor.gradient(ground, c, 'colorDebris', 'chip gradient');
  R(ground, c, 'remnantRadius', 0.3, 12, 0.05, 'remnant radius (m)');
  R(ground, c, 'remnantGrow', 0, 4, 0.01, 'remnant widens (m/s)');
  R(ground, c, 'remnantWidth', 0.02, 2, 0.01, 'remnant width (m)');
  R(ground, c, 'remnantGlow', 0, 6, 0.01, 'remnant glow');

  const bodies = folder.addFolder('5 · Bodies');
  R(bodies, c, 'grabReach', 0, 3, 0.01, 'reach (× circle)');
  R(bodies, c, 'grabDelay', 0, 1, 0.01, 'takes hold after (share)');
  R(bodies, c, 'grabImpulse', 0, 10, 0.05, 'tipped in (m/s)');
  R(bodies, c, 'grabLift', 0, 10, 0.05, 'lifted (m/s)');
  R(bodies, c, 'grabSpin', 0, 4, 0.01, 'tumble');
  R(bodies, c, 'orbitRadius', 0.2, 6, 0.01, 'orbit radius (m)');
  R(bodies, c, 'orbitDrop', -3, 4, 0.01, 'orbit below the core (m)');
  R(bodies, c, 'orbitSpin', -6, 6, 0.01, 'orbit spin (rad/s)');
  R(bodies, c, 'carryPull', 0, 10, 0.05, 'haul strength');
  R(bodies, c, 'carryGrip', 0, 20, 0.05, 'grip');
  R(bodies, c, 'carryBuoyancy', 0, 1, 0.01, 'weight carried');
  R(bodies, c, 'throwImpulse', 0, 40, 0.1, 'thrown out (m/s)');
  R(bodies, c, 'throwLift', 0, 20, 0.05, 'thrown up (m/s)');
  R(bodies, c, 'throwSpin', 0, 5, 0.01, 'throw tumble');
  R(bodies, c, 'throwReach', 0, 2, 0.01, 'blast reach (× shell)');
  R(bodies, c, 'corpseCatch', 0, 1, 1, 'drags corpses too');

  folder.close();
  return folder;
}
