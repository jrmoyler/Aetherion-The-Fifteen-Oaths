import { IcosahedronGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createParamGrid, createShockRingGeometry, createHelixGeometry } from '../../assets/codex/RailgunLanceGeometry.js';
import {
  createRailCoilMaterial,
  createRailSlugMaterial,
  createRailBeamMaterial,
  createRailWarpMaterial,
  createRailShockMaterial,
  createRailTrenchMaterial,
  createRailHelixMaterial,
  createRailShellMaterial
} from '../../materials/codex/RailgunLanceMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'railgun';

/** Hard ceiling on coils. The editor's count slider clamps to this. */
const MAX_RINGS = 5;
/** Shock rings alive at once along one trail (a ring buffer past this). */
const MAX_SHOCKS = 32;
/** Bodies one shot can be tracked burning through. */
const MAX_HITS = 16;
/** Strands of rifling the helix buffer carries. The editor clamps to this. */
const MAX_STRANDS = 4;
/** Dark impact shells alive at once (the impact + the end pulses). */
const MAX_SHELLS = 6;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _right = new Vector3();
const _centre = new Vector3();
const _floor = new Vector3();
const _end = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * RAILGUN LANCE — Tech, line cast.
 *
 * Three magnetic coils of hard light materialise in front of the hand on the
 * aim line and spin up; the line charges; then a slug of hard light leaves
 * the last coil at a hundred and sixty metres a second and pierces every body
 * on the line. Read in three beats:
 *
 *   1. **THE CHARGE** — the coils draw themselves in one after the other (an
 *      angular sweep with a hot leading edge), counter-rotate, and accelerate
 *      on a late-building curve. Arcs of light crawl their bands, sparks spin
 *      off them tangentially, light is drawn inward onto the axis, an orb of
 *      the slug swells in the muzzle, the camera hums and the light ramps.
 *   2. **THE SHOT** — the slug fires. The coils are kicked back and swell, the
 *      hand is knocked, and the slug crosses the line in a fraction of a second
 *      leaving a straight beam behind it, a shock ring punched out every
 *      `shockSpacing` metres and a trench of white-hot slag in the floor. Every
 *      body it crosses is killed and thrown hard down the line, stained by the
 *      hard light it was burnt through with.
 *   3. **THE AFTERMATH** — at the end of the line: a flash, an ionised shell,
 *      a scorch, a shockwave, debris and sparks. The beam is a held *column*:
 *      a white braided core inside a rim-weighted deep-blue sheath and a wide
 *      halo, opening into a bell where it meets the floor at the far end, and
 *      that end keeps taking the shot — pressure shells, floor rings and a
 *      splash of sparks thrown back up the line, several times a second. Two
 *      strands of hard-light **rifling** braid round the column (neighbours
 *      wind opposite ways), roll, then unwind outward and tear into light.
 *      Dark ionised haze hangs along the line. Behind it the beam thins and
 *      breaks into dashes; the coils derez into pixels; the trench — a molten
 *      line half a metre wide in a two-metre band of scorch, a thin cyan seam
 *      of fused hard light down its middle — cools muzzle-first through orange
 *      to dull red slag while a wave of heat crawls down its seams, smoking
 *      and spitting embers, and erodes away last of all.
 *
 * ## Layers
 *
 *   - **coils** (`createRailCoilMaterial`) — a parameter grid bent into a flat
 *     torus band: hex lattice, scanlines, rim, segment gaps, charge arcs, a
 *     world-space pixel derez. One material per coil, so each has its clocks.
 *   - **slug** (`createRailSlugMaterial`) — a hard-light teardrop.
 *   - **beam trail** (`createRailBeamMaterial`) — a cylinder with an `|N·V|^k`
 *     core, drawn three times: a tight braided white core, a rim-weighted
 *     sheath (deep #0a1f8f skin → cyan silhouette) and a wide blue halo, all
 *     opening into one bell at the far end (`beamFlare`) and breathing.
 *   - **rifling** (`createRailHelixMaterial`) — counter-wound hard-light
 *     strands (`createHelixGeometry`), four-stop ramp, unwinding and tearing.
 *   - **heat bend** (`createRailWarpMaterial`) — the tube again, on
 *     `LAYER.DISTORTION`.
 *   - **shock rings** (`createRailShockMaterial`) — instanced, stood up across
 *     the line.
 *   - **slag trench** (`createRailTrenchMaterial`) — the ground treatment.
 *   - **particles** — coil sparks and impact sparks (STREAK), slug streaks
 *     (STREAK), charge motes, derez pixels and rifling motes (SOFT), slag
 *     smoke (SMOKE), dark ionised haze along the line (SMOKE, normal blend),
 *     slag embers (SOFT), impact debris (CHIP).
 *   - **impact** — a STORM burst, SCORCH + SHOCKWAVE decals, flash, shake;
 *     then the end pulses (bursts + floor rings + splash) through the hold.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, the integrated phases (each coil's spin, the hex flow,
 * the scanlines, the arcs, the beam's pulses), the slug's position and the
 * one clock that matters after the shot — `_fireAge`. Everything else, every
 * radius, colour and time, is resolved from `settings.railgun` every frame:
 * dragging the coil radius resizes coils already spinning, dragging the cool
 * time re-heats a trench already cooling.
 *
 * `advance` is overridden: the base front would leave the hand at once, but
 * this one waits out the charge and then runs at `speed` from the first coil.
 */
export class RailgunLanceAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The slug decides what it pierces, and when. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies pierced this cast. HUD readout only. */
  get instanceCount() {
    return this._pierced;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- the coils: one grid, one material each ---- */
    this.coilGeometry = createParamGrid(128, 10);
    this.coils = [];
    this.coilMaterials = [];
    this.coilBodies = [];
    this.coilBodyMaterials = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      const material = createRailCoilMaterial(false);
      const mesh = this._mesh(this.coilGeometry, material, 13, LAYER.VFX);
      mesh.name = `RailCoil${i}`;
      this.coilMaterials.push(material);
      this.coils.push(mesh);
      // The solid dark lit body the glowing windings sit on.
      const bodyMaterial = createRailCoilMaterial(true);
      const body = this._mesh(this.coilGeometry, bodyMaterial, 9, LAYER.VFX);
      body.name = `RailCoilBody${i}`;
      this.coilBodyMaterials.push(bodyMaterial);
      this.coilBodies.push(body);
    }

    /* ---- the impact: dark-bodied shells with a thin hot rim ---- */
    this.shellGeometry = new IcosahedronGeometry(1, 4);
    this.shells = [];
    for (let i = 0; i < MAX_SHELLS; i++) {
      const material = createRailShellMaterial();
      const mesh = this._mesh(this.shellGeometry, material, 11, LAYER.VFX);
      mesh.name = `RailShell${i}`;
      this.shells.push({ mesh, material, age: 0, life: 1, r0: 0, r1: 1, level: 0, active: false, state: { age: 0, level: 0, seed: 0 } });
    }

    /* ---- the slug ---- */
    this.slugGeometry = createParamGrid(24, 28);
    this.slugMaterial = createRailSlugMaterial();
    this.slug = this._mesh(this.slugGeometry, this.slugMaterial, 15, LAYER.VFX);

    /* ---- the trail: core, halo and heat bend share one tube ---- */
    this.tubeGeometry = createParamGrid(18, 220);
    this.beamMaterial = createRailBeamMaterial(false);
    this.beam = this._mesh(this.tubeGeometry, this.beamMaterial, 12, LAYER.VFX);
    this.haloMaterial = createRailBeamMaterial(true);
    this.halo = this._mesh(this.tubeGeometry, this.haloMaterial, 11, LAYER.VFX);
    this.sheathMaterial = createRailBeamMaterial(2);
    this.sheath = this._mesh(this.tubeGeometry, this.sheathMaterial, 10, LAYER.VFX);
    this.warpMaterial = createRailWarpMaterial();
    this.warp = this._mesh(this.tubeGeometry, this.warpMaterial, 0, LAYER.DISTORTION);

    /* ---- the rifling ---- */
    this.helixGeometry = createHelixGeometry(MAX_STRANDS, 6, 520);
    this.helixMaterial = createRailHelixMaterial();
    this.helix = this._mesh(this.helixGeometry, this.helixMaterial, 13, LAYER.VFX);
    this._helixState = { length: 1, head: 0, spread: 0, roll: 0, dissolve: 0, level: 0, pulse: 0, seed: 0 };

    /* ---- shock rings ---- */
    this.shockGeometry = createShockRingGeometry(MAX_SHOCKS);
    this.shockMaterial = createRailShockMaterial();
    this.shocks = this._mesh(this.shockGeometry, this.shockMaterial, 10, LAYER.VFX);

    /* ---- the slag trench ---- */
    this.trenchGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.trenchMaterial = createRailTrenchMaterial();
    this.trench = this._mesh(this.trenchGeometry, this.trenchMaterial, 2, LAYER.VFX);

    /** Per-coil clocks — dice and integrated phases only. */
    this.rings = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      this.rings.push({
        spin: 0,
        seed: 0,
        sparks: new RateEmitter(),
        pixels: new RateEmitter(),
        state: { radius: 0, scale: 1, spin: 0, build: 0, charge: 0, derez: 0, flash: 0, hexFlow: 0, scanPhase: 0, arcPhase: 0, seed: 0 }
      });
    }

    /** Shock rings: metres along, the fire-clock they were born on, a seed. */
    this._shockAlong = new Float32Array(MAX_SHOCKS);
    this._shockBirth = new Float32Array(MAX_SHOCKS);
    this._shockSeed = new Float32Array(MAX_SHOCKS);
    this._shockPower = new Float32Array(MAX_SHOCKS);
    this._shockCount = 0;
    this._nextShock = 0;

    /** Bodies burning through: the dummy and how long since it was hit. */
    this._hits = [];
    for (let i = 0; i < MAX_HITS; i++) this._hits.push({ dummy: null, time: 0 });
    this._hitCount = 0;

    this._slugState = { length: 1, width: 0.1, level: 0, flow: 0, seed: 0 };
    this._beamState = { length: 1, head: 0, tail: 0, thin: 1, breakT: 0, level: 0, pulsePhase: 0, wobblePhase: 0, seed: 0 };
    this._warpState = { length: 1, head: 0, tail: 0, strength: 0, seed: 0 };
    this._shockState = { start: new Vector3(), dir: new Vector3(), side: new Vector3() };
    this._trenchState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      reach: 0,
      fireAge: 0,
      offset: 0,
      speed: 100,
      fadeT: 0,
      crawl: 0,
      seed: 0
    };

    this._seed = 0;
    this._count = 3;
    this._fired = false;
    this._fireAge = 0;
    this._lineStart = 1;
    this._prevAlong = 0;
    this._hexFlow = 0;
    this._scanPhase = 0;
    this._arcPhase = 0;
    this._pulsePhase = 0;
    this._slugFlow = 0;
    this._pierced = 0;
    this._wobblePhase = 0;
    this._helixRoll = 0;
    this._helixPulse = 0;
    this._crawl = 0;
    this._endPulseT = 0;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _mesh(geometry, material, order, layer) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.visible = false;
    mesh.matrixAutoUpdate = true;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* sparks: off the coils while charging, at the muzzle, at the impact */
    this.sparks = particles.get('railgun.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 2.4;

    /* streaks shed by the slug in flight */
    this.streaks = particles.get('railgun.streaks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.streaks.uniforms.uSizeIn.value = 0.02;
    this.streaks.uniforms.uFadeIn.value = 0.02;
    this.streaks.uniforms.uFadeOut.value = 0.6;
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uDrag.value = 3.5;
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);

    /* light drawn onto the axis, and the coils' pixels */
    this.motes = particles.get('railgun.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.15
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.4;
    this.motes.uniforms.uDrag.value = 0.6;
    this.motes.uniforms.uGravity.value.set(0, 0, 0);

    /* smoke off the slag — not additive, it has to dirty the air */
    this.smoke = particles.get('railgun.smoke', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.8
    });
    this.smoke.uniforms.uSizeIn.value = 0.15;
    this.smoke.uniforms.uFadeIn.value = 0.15;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 2.4;
    this.smoke.uniforms.uDrag.value = 0.9;

    /* debris kicked out of the floor at the end */
    this.debris = particles.get('railgun.debris', {
      capacity: 600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.debris.uniforms.uSizeIn.value = 0.02;
    this.debris.uniforms.uFadeIn.value = 0.02;
    this.debris.uniforms.uFadeOut.value = 0.3;
    this.debris.uniforms.uEndSize.value = 0.8;
    this.debris.uniforms.uDrag.value = 0.4;

    /* dark ionised haze hanging along the line — the deep stop in the air */
    this.ion = particles.get('railgun.ion', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.8
    });
    this.ion.uniforms.uSizeIn.value = 0.3;
    this.ion.uniforms.uFadeIn.value = 0.2;
    this.ion.uniforms.uFadeOut.value = 0.55;
    this.ion.uniforms.uEndSize.value = 2.2;
    this.ion.uniforms.uDrag.value = 1.2;

    /* embers lifting off the hot slag */
    this.embers = particles.get('railgun.embers', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.15
    });
    this.embers.uniforms.uSizeIn.value = 0.1;
    this.embers.uniforms.uFadeIn.value = 0.05;
    this.embers.uniforms.uFadeOut.value = 0.5;
    this.embers.uniforms.uEndSize.value = 0.35;
    this.embers.uniforms.uDrag.value = 0.8;

    this.moteEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
    this.smokeEmitter = new RateEmitter();
    this.ionEmitter = new RateEmitter();
    this.emberEmitter = new RateEmitter();
    this.endSparkEmitter = new RateEmitter();
    this.helixEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _chargeTime() {
    return Math.max(0.05, settings.railgun.chargeTime);
  }

  _beamLife() {
    return Math.max(0.05, settings.railgun.beamLife * settings.global.lifetime);
  }

  /** The impact phase: the beam at full strength, the coils coming apart. */
  get impactDuration() {
    return Math.max(0.15, this._beamLife() * 0.5);
  }

  /** The fade: the beam's last dashes, the slag cooling and eroding. */
  get fadeDuration() {
    return Math.max(0.2, settings.railgun.lifetime * settings.global.lifetime);
  }

  /** Hard light stutters rather than breathes. */
  lightShimmer() {
    const f = settings.railgun.lightFlicker * settings.global.randomness;
    const n = Math.sin(this.age * 61.0) * Math.sin(this.age * 23.7 + 1.3);
    return 1 - f * (n > 0.55 ? 0.8 : 0.15 * (0.5 + 0.5 * n));
  }

  /* ------------------------------------------------------------------ */
  /* The front: hold through the charge, then the slug                   */
  /* ------------------------------------------------------------------ */

  advance(dt) {
    const c = settings.railgun;
    if (!this._fired) {
      // Charging: the front sits in the first coil.
      this.front = this._lineStart;
      this.u = saturate(this.front / this.length);
      this._muzzle(_pos);
      this.position.copy(_pos);
      if (this.age < this._chargeTime()) return false;
      this._fire();
    }
    const speed = Math.max(1, c.speed * settings.global.speed);
    this._prevAlong = this.front;
    this.front = Math.min(this.length, this.front + speed * dt);
    const previousU = this.u;
    this.u = saturate(this.front / this.length);
    this.pointAt(this.u, this.position);
    this.position.y = c.ringHeight;
    return this.u >= 1 && previousU < 1;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry of the line                                                */
  /* ------------------------------------------------------------------ */

  _ringCount() {
    return Math.min(MAX_RINGS, Math.max(1, Math.round(settings.railgun.ringCount)));
  }

  /** Metres along the line of coil `i`, recoil included. */
  _ringAlong(i, kick) {
    const c = settings.railgun;
    return c.ringStart + i * c.ringSpacing - kick * (1 + i * 0.35);
  }

  /** The last coil's centre — where the slug forms and leaves. */
  _muzzle(out) {
    const c = settings.railgun;
    const along = Math.min(this._ringAlong(this._ringCount() - 1, 0), this.length - 0.2);
    return out.copy(this.origin).addScaledVector(this.direction, along).setY(c.ringHeight);
  }

  /** How far the coils have been kicked back right now, metres. */
  _kick() {
    if (!this._fired) return 0;
    const t = this._fireAge;
    const k = t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 5.5);
    return settings.railgun.ringRecoil * k;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.railgun;
    this._seed = Math.random() * 100;
    this._count = this._ringCount();
    this._fired = false;
    this._fireAge = 0;
    this._lineStart = Math.max(0, Math.min(c.ringStart, this.length - 0.5));
    this._prevAlong = this._lineStart;
    this.front = this._lineStart;
    this._hexFlow = Math.random() * 10;
    this._scanPhase = Math.random();
    this._arcPhase = Math.random() * 10;
    this._pulsePhase = 0;
    this._slugFlow = 0;
    this._pierced = 0;
    this._shockCount = 0;
    this._nextShock = this._lineStart + Math.max(0.3, c.shockSpacing) * 0.5;
    this._hitCount = 0;
    for (let i = 0; i < MAX_HITS; i++) this._hits[i].dummy = null;
    this._shockPower.fill(0);
    this.shockGeometry.attributes.aShock.array.fill(0);
    this.shockGeometry.attributes.aShock.needsUpdate = true;
    this.shockGeometry.instanceCount = 0;

    _right.set(this.direction.z, 0, -this.direction.x);
    const yaw = Math.atan2(this.direction.x, this.direction.z);

    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this.rings[i];
      r.spin = Math.random() * TAU;
      r.seed = Math.random() * 50;
      r.sparks.reset();
      r.pixels.reset();
      this.coils[i].rotation.set(0, yaw, 0);
      this.coils[i].visible = i < this._count;
      this.coilBodies[i].rotation.set(0, yaw, 0);
      this.coilBodies[i].visible = false;
    }
    for (let i = 0; i < MAX_SHELLS; i++) {
      this.shells[i].active = false;
      this.shells[i].mesh.visible = false;
    }
    this.slug.rotation.set(0, yaw, 0);
    this.beam.rotation.set(0, yaw, 0);
    this.halo.rotation.set(0, yaw, 0);
    this.warp.rotation.set(0, yaw, 0);

    this.moteEmitter.reset();
    this.streakEmitter.reset();
    this.smokeEmitter.reset();
    this.ionEmitter.reset();
    this.emberEmitter.reset();
    this.endSparkEmitter.reset();
    this.helixEmitter.reset();
    this._wobblePhase = 0;
    this._helixRoll = Math.random() * TAU;
    this._helixPulse = 0;
    this._crawl = 0;
    this._endPulseT = 0;
    this.sheath.rotation.set(0, yaw, 0);
    this.helix.rotation.set(0, yaw, 0);
    this.sheath.visible = false;
    this.helix.visible = false;

    this.slug.visible = true;
    this.beam.visible = false;
    this.halo.visible = false;
    this.warp.visible = false;
    this.shocks.visible = false;
    this.trench.visible = false;

    this._sync(0);
  }

  _resetEmit(time) {
    _emit.position = _pos;
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
    _emit.lifeVariance = 0.3;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** The shot leaves the muzzle. */
  _fire() {
    const c = settings.railgun;
    const g = settings.global;
    this._fired = true;
    this._fireAge = 0;
    this.front = this._lineStart;
    this._prevAlong = this._lineStart;

    this.beam.visible = true;
    this.halo.visible = true;
    this.sheath.visible = true;
    this.helix.visible = true;
    this.warp.visible = true;
    this.shocks.visible = true;
    this.trench.visible = true;

    const power = g.explosionIntensity;
    this._muzzle(_pos);
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.08;
    _emit.direction = _dir.copy(this.direction);
    _emit.speed = c.sparkSpeed * 3;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.55;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = c.sparkLife * 1.4;
    this.sparks.emit(Math.round(c.muzzleSparks * g.particleCount), _emit);

    // A ring punched out at the muzzle itself.
    this._addShock(this._ringAlong(this._count - 1, 0), 1.3);

    this.ctx.shake.add(c.fireShake * power * g.cameraShake, 1 / Math.max(0.05, c.shakeDuration), 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.muzzleFlash * power);
    this.lightBoost = c.lightIntensity * c.fireLight * power;
  }

  _addShock(along, power) {
    const k = this._shockCount % MAX_SHOCKS;
    this._shockAlong[k] = along;
    this._shockBirth[k] = this._fireAge;
    this._shockSeed[k] = Math.random();
    this._shockPower[k] = power;
    this._shockCount++;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  /** Advance the integrated phases. Rates are live; positions never jump. */
  _phases(dt, charge) {
    const c = settings.railgun;
    const g = settings.global;
    this._hexFlow += c.hexScroll * dt * g.noiseSpeed;
    this._scanPhase += c.scanSpeed * c.scanlines * dt * g.noiseSpeed * 0.1;
    this._arcPhase += c.arcSpeed * (0.3 + charge) * dt * g.noiseSpeed;
    this._pulsePhase += c.beamPulseSpeed * dt * g.noiseSpeed;
    this._slugFlow += 6 * dt * g.noiseSpeed;
    this._wobblePhase += c.beamWobbleSpeed * dt * g.noiseSpeed;
    this._helixPulse += c.helixPulseSpeed * dt * g.noiseSpeed;
    this._crawl += c.trenchCrawl * dt * g.noiseSpeed;
    if (this._fired) this._helixRoll += c.helixRoll * dt * g.animationSpeed;
    const n = this._count;
    for (let i = 0; i < n; i++) {
      const rate = lerp(c.ringSpin, c.ringSpinCharged, charge) * (i % 2 === 1 ? c.ringAlternate : 1);
      this.rings[i].spin += rate * dt * g.animationSpeed;
    }
  }

  /** The charge as the coils see it: rises on a curve, collapses on the shot. */
  _charge() {
    const c = settings.railgun;
    if (this._fired) return Math.max(0, 1 - this._fireAge / 0.2);
    return Math.pow(saturate(this.age / this._chargeTime()), Math.max(0.2, c.chargeCurve));
  }

  /** How far through the whole cast's exit we are, 0..1. */
  _exit() {
    if (this.phase !== AbilityPhase.FADE) return 0;
    return saturate(this.fadeTime / this.fadeDuration);
  }

  _sync(dt) {
    const c = settings.railgun;
    const g = settings.global;
    const charge = this._charge();
    this._phases(dt, charge);
    const exit = this._exit();
    const kick = this._kick();
    const flash = this._fired ? Math.exp(-this._fireAge * 9) : 0;
    this._syncParticles();

    /* ---- coils ---- */
    const n = this._count;
    for (let i = 0; i < MAX_RINGS; i++) {
      const mesh = this.coils[i];
      if (i >= n) {
        mesh.visible = false;
        this.coilBodies[i].visible = false;
        continue;
      }
      const r = this.rings[i];
      const s = r.state;
      const appearAt = i * Math.max(0, c.ringStagger);
      const build = saturate((this.age - appearAt) / Math.max(0.01, c.ringAppear));
      const derez = this._fired
        ? saturate((this._fireAge - c.derezDelay - i * 0.05) / Math.max(0.02, c.derezTime * g.lifetime))
        : 0;
      s.radius = Math.max(0.03, c.ringRadius + c.ringTaper * i);
      s.scale = lerp(0.55, 1, Easing.outCubic(build)) * (1 + c.ringPulse * flash);
      s.spin = r.spin;
      s.build = Easing.inOutQuad(build);
      s.charge = charge;
      s.derez = Math.max(derez, exit);
      s.flash = flash;
      s.hexFlow = this._hexFlow;
      s.scanPhase = this._scanPhase;
      s.arcPhase = this._arcPhase + i * 3.1;
      s.seed = r.seed;
      this.coilMaterials[i].userData.sync(s);
      this.coilBodyMaterials[i].userData.sync(s);
      mesh.visible = build > 0 && s.derez < 1;
      _pos.copy(this.origin).addScaledVector(this.direction, this._ringAlong(i, kick)).setY(c.ringHeight);
      mesh.position.copy(_pos);
      const body = this.coilBodies[i];
      body.visible = mesh.visible && c.coilBodyOpacity > 0;
      body.position.copy(_pos);
    }

    /* ---- the slug ---- */
    const ss = this._slugState;
    ss.seed = this._seed;
    ss.flow = this._slugFlow;
    if (!this._fired) {
      // An orb swelling in the muzzle.
      const k = Easing.outCubic(charge);
      ss.width = c.slugCharge * (0.15 + 0.85 * k) * (1 + 0.12 * Math.sin(this.age * 40) * k);
      ss.length = ss.width * 1.2;
      ss.level = k;
      this._muzzle(_pos);
      _pos.addScaledVector(this.direction, ss.width * 0.6);
      this.slug.position.copy(_pos);
      this.slug.visible = true;
    } else if (this.phase === AbilityPhase.TRAVEL) {
      ss.width = c.slugWidth;
      ss.length = Math.max(0.05, Math.min(c.slugLength, this.front - this._lineStart + 0.1));
      ss.level = 1;
      this.slug.position.copy(this.position);
      this.slug.visible = true;
    } else {
      this.slug.visible = false;
    }
    this.slugMaterial.userData.sync(ss);

    if (!this._fired) return;

    /* ---- the beam trail ---- */
    const life = saturate(this._fireAge / this._beamLife());
    const bs = this._beamState;
    bs.seed = this._seed;
    bs.length = Math.max(0.1, this.length - this._lineStart);
    bs.head = this.front - this._lineStart;
    bs.tail = 0;
    bs.thin = Math.max(0, 1 - Math.pow(life, Math.max(0.2, c.beamThinCurve)));
    bs.breakT = smoothstep(0.3, 1, life);
    bs.level = (1 - smoothstep(0.85, 1, life)) * (1 - exit) * (1 + flash * 0.8);
    bs.pulsePhase = this._pulsePhase;
    bs.wobblePhase = this._wobblePhase;
    this.beamMaterial.userData.sync(bs);
    this.haloMaterial.userData.sync(bs);
    this.sheathMaterial.userData.sync(bs);
    this.beam.visible = bs.level > 0.002 && bs.thin > 0.002;
    this.halo.visible = this.beam.visible;
    this.sheath.visible = this.beam.visible;
    _pos.copy(this.origin).addScaledVector(this.direction, this._lineStart).setY(c.ringHeight);
    this.beam.position.copy(_pos);
    this.halo.position.copy(_pos);
    this.sheath.position.copy(_pos);
    this.helix.position.copy(_pos);
    this.warp.position.copy(_pos);

    /* ---- the rifling: braided, rolling, then unwinding into light ---- */
    const hs = this._helixState;
    const hLife = saturate(this._fireAge / Math.max(0.05, c.helixLife * g.lifetime));
    const hold = Math.min(0.95, Math.max(0, c.helixHold));
    hs.seed = this._seed;
    hs.length = bs.length;
    hs.head = bs.head;
    hs.spread = c.helixSpread * Easing.outCubic(smoothstep(hold * 0.5, 1, hLife));
    hs.roll = this._helixRoll;
    hs.dissolve = smoothstep(hold, 1, hLife);
    hs.level = (1 - smoothstep(0.9, 1, hLife)) * (1 - exit * exit) * (1 + flash * 0.6);
    hs.pulse = this._helixPulse;
    this.helixMaterial.userData.sync(hs);
    this.helix.visible = hs.level > 0.002 && hs.dissolve < 1;

    const ws = this._warpState;
    ws.seed = this._seed;
    ws.length = bs.length;
    ws.head = bs.head;
    ws.tail = 0;
    ws.strength = Math.max(0, 1 - this._fireAge / Math.max(0.05, c.warpLife * g.lifetime)) * (1 - exit);
    this.warpMaterial.userData.sync(ws);
    this.warp.visible = ws.strength > 0.002;

    /* ---- shock rings ---- */
    const sh = this._shockState;
    sh.start.copy(this.origin);
    sh.dir.copy(this.direction);
    sh.side.copy(_right);
    this.shockMaterial.userData.sync(sh);
    const arr = this.shockGeometry.attributes.aShock.array;
    const count = Math.min(this._shockCount, MAX_SHOCKS);
    const shockLife = Math.max(0.05, c.shockLife * g.lifetime);
    for (let k = 0; k < count; k++) {
      const k4 = k * 4;
      arr[k4] = this._shockAlong[k];
      arr[k4 + 1] = saturate((this._fireAge - this._shockBirth[k]) / shockLife);
      arr[k4 + 2] = this._shockSeed[k];
      arr[k4 + 3] = this._shockPower[k] * (1 - exit);
    }
    this.shockGeometry.instanceCount = count;
    this.shockGeometry.attributes.aShock.needsUpdate = true;

    /* ---- the slag trench ---- */
    const ts = this._trenchState;
    const start = Math.min(Math.max(0, c.trenchStart), this.length - 0.2);
    ts.start.copy(this.origin).addScaledVector(this.direction, start).setY(0);
    ts.dir.copy(this.direction);
    ts.side.copy(_right);
    ts.length = Math.max(0.2, this.length - start + 0.4);
    ts.reach = Math.max(0, this.front - start + (this.phase === AbilityPhase.TRAVEL ? 0 : 0.4));
    ts.fireAge = this._fireAge;
    ts.offset = start - this._lineStart;
    ts.speed = Math.max(1, c.speed * g.speed);
    ts.fadeT = smoothstep(0.45, 1, exit);
    ts.crawl = this._crawl;
    ts.seed = this._seed;
    this.trenchMaterial.userData.sync(ts);
  }

  _syncParticles() {
    const c = settings.railgun;
    const g = settings.global;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const sp = this.sparks.uniforms;
    sp.uStretch.value = c.sparkStretch;
    sp.uSizeScale.value = g.particleSize;
    sp.uLifeScale.value = g.particleLifetime;
    sp.uSpeedScale.value = g.particleSpeed;
    sp.uOpacity.value = g.opacity;
    sp.uGlow.value = c.sparkGlow * g.glow;
    sp.uTurbulence.value = 0.2 * g.turbulence;
    sp.uGravity.value.set(0, -4, 0);

    this.streaks.setGradient(getColor(c.colorSlugCore), getColor(c.colorSlugRim), getColor(c.colorBeamEdge), getColor(c.colorBeamHalo));
    const st = this.streaks.uniforms;
    st.uStretch.value = c.streakStretch;
    st.uSizeScale.value = g.particleSize;
    st.uLifeScale.value = g.particleLifetime;
    st.uSpeedScale.value = g.particleSpeed;
    st.uOpacity.value = g.opacity;
    st.uGlow.value = c.sparkGlow * g.glow;
    st.uTurbulence.value = 0.1 * g.turbulence;

    this.motes.setGradient(getColor(c.colorPixelA), getColor(c.colorPixelB), getColor(c.colorPixelC), getColor(c.colorPixelD));
    const mo = this.motes.uniforms;
    mo.uSizeScale.value = g.particleSize;
    mo.uLifeScale.value = g.particleLifetime;
    mo.uSpeedScale.value = g.particleSpeed;
    mo.uOpacity.value = g.opacity;
    mo.uGlow.value = c.sparkGlow * 0.8 * g.glow;
    mo.uTurbulence.value = 0.3 * g.turbulence;

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const sm = this.smoke.uniforms;
    sm.uSizeScale.value = g.particleSize;
    sm.uLifeScale.value = g.particleLifetime;
    sm.uSpeedScale.value = g.particleSpeed;
    sm.uOpacity.value = c.smokeOpacity * g.opacity;
    sm.uTurbulence.value = 0.7 * g.turbulence;
    sm.uGravity.value.set(0, c.smokeRise * 0.4, 0);

    this.debris.setGradient(getColor(c.colorDebrisA), getColor(c.colorDebrisB), getColor(c.colorDebrisC), getColor(c.colorDebrisD));
    this.ion.setGradient(getColor(c.colorIonA), getColor(c.colorIonB), getColor(c.colorIonC), getColor(c.colorIonD));
    const io = this.ion.uniforms;
    io.uSizeScale.value = g.particleSize;
    io.uLifeScale.value = g.particleLifetime;
    io.uSpeedScale.value = g.particleSpeed;
    io.uOpacity.value = c.ionOpacity * g.opacity;
    io.uTurbulence.value = 0.8 * g.turbulence;
    io.uGravity.value.set(0, c.ionRise * 0.3, 0);

    this.embers.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
    const em = this.embers.uniforms;
    em.uSizeScale.value = g.particleSize;
    em.uLifeScale.value = g.particleLifetime;
    em.uSpeedScale.value = g.particleSpeed;
    em.uOpacity.value = g.opacity;
    em.uGlow.value = c.sparkGlow * 0.9 * g.glow;
    em.uTurbulence.value = 0.6 * g.turbulence;
    em.uGravity.value.set(0, 0.6, 0);

    const de = this.debris.uniforms;
    de.uSizeScale.value = g.particleSize;
    de.uLifeScale.value = g.particleLifetime;
    de.uSpeedScale.value = g.particleSpeed;
    de.uOpacity.value = g.opacity;
    de.uGravity.value.set(0, c.debrisGravity, 0);
    de.uTurbulence.value = 0.05 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel: the charge, then the flight                                 */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.railgun;
    const g = settings.global;
    if (this._fired) this._fireAge += dt;
    this._sync(dt);

    if (!this._fired) {
      const k = this._charge();
      this._chargeFx(dt, k);
      this.ctx.shake.rumble(c.humShake * k * g.cameraShake, dt);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.chargeLight * k);
      return;
    }

    this._flightFx(dt);
    this._shockFx();
    this._pierce();
    this._ringFx(dt);
    this._slagFx(dt);
    this._lingerFx(dt);
    this._burn(dt);
  }

  /** Sparks crawling off the coils, light drawn in onto the axis. */
  _chargeFx(dt, k) {
    const c = settings.railgun;
    const g = settings.global;
    const time = frame.uTime.value;
    const n = this._count;

    for (let i = 0; i < n; i++) {
      const r = this.rings[i];
      const count = Math.round(r.sparks.tick(dt, (c.sparkRate / n) * k) * g.particleCount);
      if (count <= 0) continue;
      const radius = r.state.radius * r.state.scale;
      _centre.copy(this.coils[i].position);
      const sign = Math.sign((i % 2 === 1 ? c.ringAlternate : 1) * (c.ringSpinCharged || 1)) || 1;
      this._resetEmit(time);
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.12;
      for (let p = 0; p < count; p++) {
        const a = Math.random() * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        _pos.copy(_centre).addScaledVector(_right, ca * radius).addScaledVector(_up, sa * radius);
        // Tangential, the way the coil turns, with a little flung outward.
        _dir.set(0, 0, 0).addScaledVector(_right, -sa * sign + ca * 0.25).addScaledVector(_up, ca * sign + sa * 0.25).normalize();
        _emit.position = _pos;
        _emit.direction = _dir;
        _emit.speed = c.sparkSpeed * (0.5 + k);
        this.sparks.emit(1, _emit);
      }
    }

    // Motes: light gathered off the air round the row and drawn onto the axis.
    const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate * k) * g.particleCount);
    if (motes > 0) {
      this._resetEmit(time);
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.lifeVariance = 0.2;
      _emit.speedVariance = 0.15;
      const first = this._ringAlong(0, 0);
      const last = this._ringAlong(n - 1, 0);
      const reach = Math.max(0.2, c.ringRadius * 2.2);
      for (let p = 0; p < motes; p++) {
        const along = lerp(first - 0.2, last + 0.2, Math.random());
        _centre.copy(this.origin).addScaledVector(this.direction, along).setY(c.ringHeight);
        const a = Math.random() * TAU;
        _pos.copy(_centre).addScaledVector(_right, Math.cos(a) * reach).addScaledVector(_up, Math.sin(a) * reach);
        _vel.subVectors(_centre, _pos);
        const d = _vel.length();
        _emit.position = _pos;
        _emit.direction = _dir.copy(_vel).divideScalar(Math.max(1e-4, d));
        _emit.speed = d / Math.max(0.05, c.moteLife);
        this.motes.emit(1, _emit);
      }
    }
  }

  /** Streaks shed off the slug, along the flight. */
  _flightFx(dt) {
    if (this.phase !== AbilityPhase.TRAVEL) return;
    const c = settings.railgun;
    const g = settings.global;
    const count = Math.round(this.streakEmitter.tick(dt, c.slugStreaks) * g.particleCount);
    if (count <= 0) return;
    const step = Math.max(0, this.front - this._prevAlong);
    const speed = Math.max(1, c.speed * g.speed);
    this._resetEmit(frame.uTime.value);
    _emit.size = c.streakSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.streakLife;
    _emit.lifeVariance = 0.4;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.06;
    for (let p = 0; p < count; p++) {
      // Spread back over the ground covered this frame, so the trail is even.
      const back = Math.random() * step;
      const a = Math.random() * TAU;
      const rr = c.slugWidth * (0.5 + Math.random() * 2.5);
      _pos.copy(this.position)
        .addScaledVector(this.direction, -back)
        .addScaledVector(_right, Math.cos(a) * rr)
        .addScaledVector(_up, Math.sin(a) * rr);
      _emit.position = _pos;
      _emit.direction = this.direction;
      _emit.speed = speed * c.streakSpeed * (0.3 + Math.random() * 0.7);
      this.streaks.emit(1, _emit);
    }
  }

  /** A shock ring every `shockSpacing` metres the slug has crossed. */
  _shockFx() {
    const c = settings.railgun;
    const spacing = Math.max(0.3, c.shockSpacing);
    let guard = 0;
    while (this.front >= this._nextShock && guard++ < MAX_SHOCKS) {
      this._addShock(this._nextShock, 1);
      this._nextShock += spacing;
    }
  }

  /** The coils' pixels, shed while they derez. */
  _ringFx(dt) {
    const c = settings.railgun;
    const g = settings.global;
    const time = frame.uTime.value;
    const derezTime = Math.max(0.02, c.derezTime * g.lifetime);
    for (let i = 0; i < this._count; i++) {
      const r = this.rings[i];
      const d = r.state.derez;
      if (d <= 0 || d >= 1) continue;
      const count = Math.round(r.pixels.tick(dt, c.pixelCount / derezTime) * g.particleCount);
      if (count <= 0) continue;
      const radius = r.state.radius * r.state.scale;
      _centre.copy(this.coils[i].position);
      this._resetEmit(time);
      _emit.size = c.pixelSize3d;
      _emit.sizeVariance = 0.3;
      _emit.life = c.pixelLife;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.35;
      for (let p = 0; p < count; p++) {
        const a = Math.random() * TAU;
        _pos.copy(_centre)
          .addScaledVector(_right, Math.cos(a) * radius)
          .addScaledVector(_up, Math.sin(a) * radius)
          .addScaledVector(this.direction, (Math.random() - 0.5) * c.ringTube * c.ringDepth * 2);
        // Off the band, outward and up, the way a hologram lifts away.
        _dir.copy(_right).multiplyScalar(Math.cos(a)).addScaledVector(_up, Math.sin(a) + 0.6).normalize();
        _emit.position = _pos;
        _emit.direction = _dir;
        _emit.speed = c.pixelSpeed;
        this.motes.emit(1, _emit);
      }
    }
  }

  /** Smoke off the hot stretch of slag. */
  _slagFx(dt) {
    const c = settings.railgun;
    const g = settings.global;
    const start = Math.min(Math.max(0, c.trenchStart), this.length - 0.2);
    const reach = this.front - start;
    if (reach <= 0) return;
    const heat = Math.exp(-this._fireAge / Math.max(0.05, c.trenchCool * g.lifetime * 2.2));
    const count = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * heat * (1 - this._exit())) * g.particleCount);
    if (count <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.smokeSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.smokeLife;
    _emit.lifeVariance = 0.4;
    _emit.spread = 0.3;
    _emit.spin = 0.5;
    _emit.direction = _up;
    _emit.speed = c.smokeRise;
    for (let p = 0; p < count; p++) {
      const along = start + Math.random() * reach;
      _pos.copy(this.origin).addScaledVector(this.direction, along).setY(0.1)
        .addScaledVector(_right, (Math.random() - 0.5) * c.trenchCore * 2);
      _emit.position = _pos;
      this.smoke.emit(1, _emit);
    }
  }

  /** Haze, embers and the rifling's light: everything that keeps moving. */
  _lingerFx(dt) {
    const c = settings.railgun;
    const g = settings.global;
    const time = frame.uTime.value;
    const exit = this._exit();
    const lineEnd = Math.max(this._lineStart, this.front);

    /* dark ionised haze along the burning line */
    const level = this._beamState.level * this._beamState.thin;
    let n = Math.round(this.ionEmitter.tick(dt, c.ionRate * level) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.size = c.ionSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.ionLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.4;
      _emit.speedVariance = 0.5;
      for (let p = 0; p < n; p++) {
        const along = lerp(this._lineStart, lineEnd, Math.random());
        const a = Math.random() * TAU;
        const rr = c.beamHalo * (0.3 + 0.7 * Math.random());
        _dir.copy(_right).multiplyScalar(Math.cos(a)).addScaledVector(_up, Math.sin(a) * 0.6 + 0.4);
        _pos.copy(this.origin).addScaledVector(this.direction, along).setY(c.ringHeight).addScaledVector(_dir, rr);
        _emit.position = _pos;
        _emit.direction = _dir.normalize();
        _emit.speed = c.ionRise;
        this.ion.emit(1, _emit);
      }
    }

    /* embers spat off the hot slag */
    const start = Math.min(Math.max(0, c.trenchStart), this.length - 0.2);
    const reach = this.front - start;
    if (reach > 0) {
      const heat = Math.exp(-this._fireAge / Math.max(0.05, c.trenchCool * g.lifetime * 2.5));
      n = Math.round(this.emberEmitter.tick(dt, c.emberRate * heat * (1 - exit)) * g.particleCount);
      if (n > 0) {
        this._resetEmit(time);
        _emit.size = c.emberSize;
        _emit.sizeVariance = 0.5;
        _emit.life = c.emberLife;
        _emit.lifeVariance = 0.4;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.5;
        _emit.direction = _up;
        _emit.speed = c.emberRise;
        for (let p = 0; p < n; p++) {
          const along = start + Math.random() * reach;
          _pos.copy(this.origin).addScaledVector(this.direction, along).setY(0.05)
            .addScaledVector(_right, (Math.random() - 0.5) * c.trenchCore * 2.2);
          _emit.position = _pos;
          this.embers.emit(1, _emit);
        }
      }
    }

    /* motes torn off the rifling as it unwinds */
    const hs = this._helixState;
    if (hs.dissolve > 0 && hs.dissolve < 1 && hs.level > 0.01) {
      n = Math.round(this.helixEmitter.tick(dt, c.helixShed * hs.level) * g.particleCount);
      if (n > 0) {
        const strands = Math.max(1, Math.min(MAX_STRANDS, Math.round(c.helixStrands)));
        const twist = TAU * c.helixTurns;
        const L = hs.length;
        this._resetEmit(time);
        _emit.size = c.moteSize * 1.4;
        _emit.life = c.pixelLife;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.4;
        for (let p = 0; p < n; p++) {
          const along = Math.random() * hs.head;
          const s = (Math.random() * strands) | 0;
          const dirS = s % 2 === 0 ? 1 : -1;
          const bell = smoothstep(L - Math.max(0.05, c.beamFlareLength), L, along);
          const R = c.helixRadius * (1 + Math.max(0, c.beamFlare) * 0.7 * bell * bell) * (1 + hs.spread) * smoothstep(0, 0.6, along);
          const phi = dirS * (along * twist + hs.roll) + (s * TAU) / strands;
          const ca = Math.cos(phi);
          const sa = Math.sin(phi);
          _pos.copy(this.origin).addScaledVector(this.direction, this._lineStart + along).setY(c.ringHeight)
            .addScaledVector(_right, ca * R).addScaledVector(_up, sa * R);
          _dir.copy(_right).multiplyScalar(ca).addScaledVector(_up, sa + 0.3).normalize();
          _emit.position = _pos;
          _emit.direction = _dir;
          _emit.speed = c.pixelSpeed * 1.3;
          this.motes.emit(1, _emit);
        }
      }
    }
  }

  /** The end of the line keeps taking the beam: shells, floor rings, splash. */
  _endFx(dt) {
    const c = settings.railgun;
    const g = settings.global;
    const holdFor = Math.max(0, c.endHold) * this._beamLife();
    if (this._fireAge > holdFor) return;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    const fall = 1 - this._fireAge / Math.max(0.05, holdFor);
    _end.copy(this.origin).addScaledVector(this.direction, this.length).setY(c.ringHeight);

    const n = Math.round(this.endSparkEmitter.tick(dt, c.endSparkRate * fall) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.position = _end;
      _emit.radius = c.beamHalo * 0.5;
      _emit.direction = _dir.copy(this.direction).multiplyScalar(-0.5).setY(0.55).normalize();
      _emit.speed = c.sparkSpeed * 3;
      _emit.speedVariance = 0.6;
      _emit.spread = 1.0;
      _emit.size = c.sparkSize * 1.3;
      _emit.life = c.sparkLife * 2;
      this.sparks.emit(n, _emit);
    }

    this._endPulseT -= dt;
    if (this._endPulseT > 0 || c.endPulseRate <= 0) return;
    this._endPulseT += 1 / Math.max(0.1, c.endPulseRate);
    if (this._endPulseT < 0) this._endPulseT = 0;
    // Pressure pulses: small dark shells with a thin hot rim, not bright bursts.
    this._spawnShell(c.endPulseSize * 0.25, c.endPulseSize * power * (0.6 + 0.4 * fall), 0.34, 0.75 * (0.4 + 0.6 * fall));
    // ...with a few faint hot filaments over it as detail.
    this.ctx.bursts.spawn(BurstMode.STORM, _end, {
      radius: c.endPulseSize * 0.15,
      endRadius: c.endPulseSize * power * 0.5,
      life: 0.25,
      intensity: c.burstIntensity * c.burstFilament * 0.5,
      opacity: 0.25 * g.opacity,
      fresnel: 2.4 * g.fresnel,
      displace: 0.25,
      turbulence: g.turbulence,
      colorA: getColor(c.colorBurstB),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _floor.copy(_end).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.endRingRadius * power,
      life: 0.5,
      width: 0.06,
      intensity: (0.8 * fall + 0.2) * c.floorRingGlow,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorBeamDeep)
    });
    this.ctx.shake.add(c.impactShake * 0.15 * fall * g.cameraShake, 10, 22);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 1.4 * fall);
  }

  /** Start a dark impact shell at the end of the line (pooled; oldest reused). */
  _spawnShell(r0, r1, life, level) {
    let pick = this.shells[0];
    for (let i = 0; i < MAX_SHELLS; i++) {
      const sh = this.shells[i];
      if (!sh.active) { pick = sh; break; }
      if (sh.age / sh.life > pick.age / pick.life) pick = sh;
    }
    pick.active = true;
    pick.age = 0;
    pick.life = Math.max(0.05, life);
    pick.r0 = r0;
    pick.r1 = Math.max(r0, r1);
    pick.level = level;
    pick.state.seed = Math.random() * 40;
    _end.copy(this.origin).addScaledVector(this.direction, this.length).setY(settings.railgun.ringHeight);
    pick.mesh.position.copy(_end);
    this._syncShell(pick);
  }

  _syncShell(sh) {
    const k = saturate(sh.age / sh.life);
    const r = lerp(sh.r0, sh.r1, Easing.outCubic(k));
    sh.mesh.scale.set(r, r * 0.85, r);
    sh.state.age = k;
    sh.state.level = sh.level * (1 - smoothstep(0.55, 1, k)) * smoothstep(0, 0.06, k + 0.02);
    sh.material.userData.sync(sh.state);
    sh.mesh.visible = sh.state.level > 0.003;
  }

  _shellFx(dt) {
    for (let i = 0; i < MAX_SHELLS; i++) {
      const sh = this.shells[i];
      if (!sh.active) continue;
      sh.age += dt;
      if (sh.age >= sh.life) {
        sh.active = false;
        sh.mesh.visible = false;
        continue;
      }
      this._syncShell(sh);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The pierce                                                          */
  /* ------------------------------------------------------------------ */

  /** Kill whatever the slug crossed since the last frame. */
  _pierce() {
    if (this.phase !== AbilityPhase.TRAVEL) return;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.railgun;
    const g = settings.global;

    const from = this._prevAlong - 0.4;
    const to = this.front + 0.25;
    const mid = (from + to) * 0.5;
    _centre.copy(this.origin).addScaledVector(this.direction, mid);
    const radius = Math.hypot((to - from) * 0.5, c.hitRadius);
    const found = field.findTargets(_centre.x, _centre.z, radius, this._found);
    if (found.length === 0) return;

    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity;
    this._force.spin = c.hitSpin;
    const slice = c.hitSlice >= 0.5;

    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * _right.x + dz * _right.z;
      if (Math.abs(lat) > c.hitRadius || along < from || along > to) continue;
      // Straight down the line — a slug does not knock things sideways.
      if (!dummy.kill(this.direction.x, this.direction.z, this._force, slice)) continue;
      this._pierced++;
      this._track(dummy);
      this._hitFx(dummy.position);
    }
    this._found.length = 0;
  }

  _track(dummy) {
    if (this._hitCount >= MAX_HITS) return;
    const h = this._hits[this._hitCount++];
    h.dummy = dummy;
    h.time = 0;
  }

  /** The hard-light burn spreading through what it passed through. */
  _burn(dt) {
    const c = settings.railgun;
    for (let i = 0; i < this._hitCount; i++) {
      const h = this._hits[i];
      if (!h.dummy || h.dummy.finished) continue;
      h.time += dt;
      h.dummy.corrode(saturate(h.time / 0.3) * saturate(c.hitBurn), c.look);
    }
  }

  _hitFx(at) {
    const c = settings.railgun;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(c.ringHeight);
    _emit.position = _pos;
    _emit.radius = 0.15;
    _emit.direction = this.direction;
    _emit.speed = c.sparkSpeed * 3;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.6;
    _emit.size = c.sparkSize * 1.3;
    _emit.life = c.sparkLife * 1.6;
    this.sparks.emit(Math.round(c.hitSparks * g.particleCount), _emit);
    this._addShock(this.front, 0.9);
    this.ctx.shake.add(c.impactShake * 0.3 * g.cameraShake, 8, 24);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 1.2);
  }

  /* ------------------------------------------------------------------ */
  /* Impact                                                              */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.railgun;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    // One last test over the final stretch, then the end of the line.
    this._pierce();

    _end.copy(this.origin).addScaledVector(this.direction, this.length).setY(c.ringHeight);
    _floor.copy(_end).setY(0);
    this.position.copy(_end);

    // The body of the impact: a dark shell of blown-out air, thin hot rim.
    this._spawnShell(c.burstSize * 0.12, c.burstSize * power, Math.max(0.05, c.burstLife), 1);
    // Hot filaments racing over it — detail only, kept small and dim.
    this.ctx.bursts.spawn(BurstMode.STORM, _end, {
      radius: c.burstSize * 0.1,
      endRadius: c.burstSize * power * 0.7,
      life: Math.max(0.05, c.burstLife * 0.6),
      intensity: c.burstIntensity * c.burstFilament,
      opacity: 0.5 * g.opacity,
      fresnel: 2.2 * g.fresnel,
      displace: 0.3,
      turbulence: g.turbulence,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius3d * power,
      life: 0.6,
      width: 0.05,
      intensity: c.floorRingGlow * 1.25,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorBurstA)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: c.scorchRadius,
      life: Math.max(0.5, (this.impactDuration + this.fadeDuration) * 1.1),
      intensity: 1,
      colorA: getColor(c.colorScorch),
      colorB: getColor(c.colorSlagWarm)
    });
    this._addShock(this.length, 1.8);

    /* debris out of the floor, thrown on down the line */
    this._resetEmit(time);
    _pos.copy(_floor).setY(0.15);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.copy(this.direction).setY(1.1).normalize();
    _emit.speed = c.debrisSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.75;
    _emit.size = c.debrisSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.debrisLife;
    _emit.spin = 9;
    this.debris.emit(Math.round(c.debrisCount * g.particleCount), _emit);

    this._resetEmit(time);
    _emit.position = _end;
    _emit.radius = 0.15;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(-0.3).setY(0.4).normalize();
    _emit.speed = c.sparkSpeed * 4;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.1;
    _emit.size = c.sparkSize * 1.4;
    _emit.life = c.sparkLife * 2.2;
    this.sparks.emit(Math.round(c.impactSparks * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * power * g.cameraShake, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.fireLight * power);
    this._endPulseT = 1 / Math.max(0.1, c.endPulseRate);
  }

  onFade(dt) {
    this._fireAge += dt;
    this._prevAlong = this.front;
    this._sync(dt);
    this._ringFx(dt);
    this._slagFx(dt);
    this._lingerFx(dt);
    this._endFx(dt);
    this._shellFx(dt);
    this._burn(dt);
    // The light settles on the end of the line, dimming with the trail.
    _end.copy(this.origin).addScaledVector(this.direction, this.length).setY(settings.railgun.ringHeight);
    this.position.copy(_end);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    for (let i = 0; i < MAX_RINGS; i++) {
      this.coils[i].visible = false;
      this.coilBodies[i].visible = false;
    }
    for (let i = 0; i < MAX_SHELLS; i++) {
      this.shells[i].active = false;
      this.shells[i].mesh.visible = false;
    }
    this.slug.visible = false;
    this.beam.visible = false;
    this.halo.visible = false;
    this.sheath.visible = false;
    this.helix.visible = false;
    this.warp.visible = false;
    this.shocks.visible = false;
    this.trench.visible = false;
    this.shockGeometry.instanceCount = 0;
    for (let i = 0; i < MAX_HITS; i++) this._hits[i].dummy = null;
    this._hitCount = 0;
  }

  dispose() {
    this.coilGeometry.dispose();
    this.slugGeometry.dispose();
    this.tubeGeometry.dispose();
    this.shockGeometry.dispose();
    this.trenchGeometry.dispose();
    this.helixGeometry.dispose();
    this.helixMaterial.dispose();
    this.sheathMaterial.dispose();
    for (const m of this.coilMaterials) m.dispose();
    for (const m of this.coilBodyMaterials) m.dispose();
    this.shellGeometry.dispose();
    for (const sh of this.shells) sh.material.dispose();
    this.slugMaterial.dispose();
    this.beamMaterial.dispose();
    this.haloMaterial.dispose();
    this.warpMaterial.dispose();
    this.shockMaterial.dispose();
    this.trenchMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F9F2}  Railgun Lance');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 10, 400, 1, 'slug speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'trail + slag linger (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  cast.addColor(c, 'colorA').name('hard light');
  cast.addColor(c, 'colorB').name('hot core');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'stutter');
  R(light, c, 'chargeLight', 0, 8, 0.05, 'charge ramp (× intensity)');
  R(light, c, 'fireLight', 0, 10, 0.05, 'shot punch (× intensity)');

  const coils = folder.addFolder('1 · Coils');
  const place = coils.addFolder('Placement');
  R(place, c, 'ringCount', 1, MAX_RINGS, 1, 'coils');
  R(place, c, 'ringStart', 0.2, 3, 0.01, 'first coil at (m)');
  R(place, c, 'ringSpacing', 0.1, 2, 0.01, 'spacing (m)');
  R(place, c, 'ringHeight', 0.3, 3, 0.01, 'firing height (m)');
  R(place, c, 'ringRadius', 0.05, 2, 0.005, 'radius (m)');
  R(place, c, 'ringTaper', -0.3, 0.3, 0.005, 'radius per coil (m)');
  R(place, c, 'ringTube', 0.004, 0.2, 0.001, 'band thickness (m)');
  R(place, c, 'ringDepth', 0.3, 10, 0.05, 'band depth (× thickness)');
  R(place, c, 'ringSegments', 1, 16, 1, 'segments');
  R(place, c, 'segmentGap', 0, 0.8, 0.005, 'segment gap');
  const spin = coils.addFolder('Spin');
  R(spin, c, 'ringSpin', -10, 10, 0.05, 'idle spin (rad/s)');
  R(spin, c, 'ringSpinCharged', -60, 60, 0.1, 'charged spin (rad/s)');
  R(spin, c, 'ringAlternate', -1, 1, 0.01, 'odd coils (×)');
  R(spin, c, 'ringAppear', 0.01, 1, 0.005, 'draws in over (s)');
  R(spin, c, 'ringStagger', 0, 0.5, 0.005, 'stagger (s)');
  R(spin, c, 'ringRecoil', 0, 1, 0.005, 'recoil (m)');
  R(spin, c, 'ringPulse', 0, 1, 0.01, 'swell on the shot');
  const holo = coils.addFolder('Hologram');
  R(holo, c, 'hexScale', 2, 80, 0.5, 'hex cells / m');
  R(holo, c, 'hexScroll', -10, 10, 0.05, 'hex flow');
  R(holo, c, 'hexEdge', 0.01, 0.4, 0.005, 'hex line width');
  R(holo, c, 'scanlines', 1, 120, 0.5, 'scanlines / m');
  R(holo, c, 'scanSpeed', -10, 10, 0.05, 'scanline climb');
  R(holo, c, 'scanDepth', 0, 1, 0.01, 'scanline depth');
  R(holo, c, 'holoGlow', 0, 12, 0.05, 'glow');
  R(holo, c, 'holoOpacity', 0, 1, 0.01, 'opacity');
  R(holo, c, 'rimGlow', 0, 6, 0.01, 'edge-on glow');
  R(holo, c, 'chargeGlow', 0, 8, 0.05, 'charge glow');
  const body = coils.addFolder('Body + windings');
  R(body, c, 'coilBodyOpacity', 0, 1, 0.01, 'solid body opacity');
  body.addColor(c, 'colorCoilBody').name('body');
  R(body, c, 'coilWindings', 1, 160, 1, 'windings / coil');
  R(body, c, 'coilWindingWidth', 0.01, 0.5, 0.005, 'winding width');
  R(body, c, 'coilWindingGlow', 0, 6, 0.05, 'winding glow');
  R(holo, c, 'arcCrawl', 0, 5, 0.01, 'arcs crawling');
  R(holo, c, 'arcSpeed', 0, 40, 0.1, 'arc speed');
  R(holo, c, 'flicker', 0, 1, 0.01, 'dropout flicker');
  R(holo, c, 'glitch', 0, 1, 0.01, 'slice glitch');
  R(holo, c, 'softFade', 0.01, 1, 0.01, 'soft intersection (m)');
  holo.addColor(c, 'colorRingDeep').name('band deep');
  const derez = coils.addFolder('Derez');
  R(derez, c, 'derezDelay', 0, 1, 0.005, 'starts after the shot (s)');
  R(derez, c, 'derezTime', 0.02, 2, 0.01, 'comes apart over (s)');
  R(derez, c, 'pixelSize', 0.004, 0.2, 0.001, 'pixel cell (m)');
  R(derez, c, 'pixelCount', 0, 300, 1, 'pixels shed / coil');
  R(derez, c, 'pixelSize3d', 0.005, 0.3, 0.001, 'pixel particle size');
  R(derez, c, 'pixelSpeed', 0, 8, 0.05, 'pixel drift (m/s)');
  R(derez, c, 'pixelLife', 0.05, 3, 0.01, 'pixel lifetime');
  Editor.gradient(derez, c, 'colorPixel', 'pixel + mote gradient');

  const charge = folder.addFolder('2 · Charge');
  R(charge, c, 'chargeTime', 0.05, 3, 0.01, 'charge time (s)');
  R(charge, c, 'chargeCurve', 0.2, 5, 0.01, 'builds late (curve)');
  R(charge, c, 'humShake', 0, 1, 0.005, 'camera hum');
  R(charge, c, 'sparkRate', 0, 1500, 1, 'coil sparks / s');
  R(charge, c, 'sparkSize', 0.004, 0.2, 0.001, 'spark width');
  R(charge, c, 'sparkSpeed', 0, 20, 0.05, 'spark speed');
  R(charge, c, 'sparkLife', 0.02, 2, 0.01, 'spark lifetime');
  R(charge, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(charge, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  R(charge, c, 'moteRate', 0, 800, 1, 'motes drawn in / s');
  R(charge, c, 'moteSize', 0.005, 0.3, 0.001, 'mote size');
  R(charge, c, 'moteLife', 0.05, 2, 0.01, 'mote lifetime');
  Editor.gradient(charge, c, 'colorSpark', 'spark gradient');

  const slug = folder.addFolder('3 · Slug');
  R(slug, c, 'slugLength', 0.1, 6, 0.01, 'length (m)');
  R(slug, c, 'slugWidth', 0.01, 0.6, 0.005, 'radius (m)');
  R(slug, c, 'slugCharge', 0.01, 0.6, 0.005, 'charging orb (m)');
  R(slug, c, 'slugGlow', 0, 20, 0.1, 'core glow');
  R(slug, c, 'slugRim', 0, 8, 0.05, 'rim glow');
  R(slug, c, 'slugStreaks', 0, 3000, 10, 'streaks / s');
  R(slug, c, 'streakSpeed', 0, 1, 0.005, 'streak speed (× slug)');
  R(slug, c, 'streakSize', 0.004, 0.2, 0.001, 'streak width');
  R(slug, c, 'streakLife', 0.02, 1, 0.005, 'streak lifetime');
  R(slug, c, 'streakStretch', 0, 1, 0.005, 'streak stretch');
  slug.addColor(c, 'colorSlugCore').name('core');
  slug.addColor(c, 'colorSlugRim').name('rim');

  const beam = folder.addFolder('4 · Beam trail');
  R(beam, c, 'beamWidth', 0.005, 0.5, 0.001, 'core radius (m)');
  R(beam, c, 'beamHalo', 0.02, 2, 0.005, 'halo radius (m)');
  R(beam, c, 'beamGlow', 0, 20, 0.05, 'core glow');
  R(beam, c, 'haloGlow', 0, 6, 0.01, 'halo glow');
  R(beam, c, 'beamCoreSharp', 0.2, 12, 0.05, 'core tightness');
  R(beam, c, 'beamLife', 0.05, 5, 0.01, 'thins over (s)');
  R(beam, c, 'beamThinCurve', 0.2, 6, 0.01, 'holds, then thins (curve)');
  R(beam, c, 'beamPulseScale', 0, 6, 0.01, 'pulses / m');
  R(beam, c, 'beamPulseSpeed', -80, 80, 0.5, 'pulse speed');
  R(beam, c, 'beamFlicker', 0, 1, 0.01, 'flicker');
  R(beam, c, 'beamBreak', 0, 1, 0.01, 'breaks into dashes');
  R(beam, c, 'beamBreakScale', 0.05, 8, 0.01, 'dashes / m');
  R(beam, c, 'beamSoftFade', 0.01, 1, 0.01, 'soft intersection (m)');
  beam.addColor(c, 'colorBeamCore').name('core');
  beam.addColor(c, 'colorBeamEdge').name('edge');
  beam.addColor(c, 'colorBeamHalo').name('halo');
  beam.addColor(c, 'colorBeamDeep').name('deep (sheath skin)');
  R(beam, c, 'sheathRadius', 0.02, 2, 0.005, 'sheath radius (m)');
  R(beam, c, 'sheathGlow', 0, 6, 0.01, 'sheath glow');
  R(beam, c, 'beamFlare', 0, 6, 0.01, 'bell at the far end (×)');
  R(beam, c, 'beamFlareLength', 0.1, 8, 0.05, 'bell opens over (m)');
  R(beam, c, 'beamWobble', 0, 0.6, 0.005, 'breathing');
  R(beam, c, 'beamWobbleSpeed', 0, 40, 0.1, 'breathing speed');
  const rifle = beam.addFolder('Rifling');
  R(rifle, c, 'helixStrands', 1, MAX_STRANDS, 1, 'strands');
  R(rifle, c, 'helixRadius', 0.02, 2, 0.005, 'radius at birth (m)');
  R(rifle, c, 'helixSpread', 0, 6, 0.01, 'unwinds out to (× radius)');
  R(rifle, c, 'helixTurns', 0, 4, 0.01, 'turns / m');
  R(rifle, c, 'helixRoll', -30, 30, 0.1, 'roll (rad/s)');
  R(rifle, c, 'helixTube', 0.003, 0.3, 0.001, 'strand thickness (m)');
  R(rifle, c, 'helixGlow', 0, 10, 0.05, 'glow');
  R(rifle, c, 'helixLife', 0.1, 6, 0.05, 'lasts (s)');
  R(rifle, c, 'helixHold', 0, 0.95, 0.01, 'whole for (fraction)');
  R(rifle, c, 'helixBreakScale', 0.1, 8, 0.05, 'tears on (cells / m)');
  R(rifle, c, 'helixPulseScale', 0, 4, 0.01, 'pulses / m');
  R(rifle, c, 'helixPulseSpeed', -40, 40, 0.1, 'pulse speed');
  R(rifle, c, 'helixShed', 0, 1200, 1, 'motes shed / s');
  rifle.addColor(c, 'colorHelixCore').name('core');
  rifle.addColor(c, 'colorHelixTint').name('tint');
  rifle.addColor(c, 'colorHelixBody').name('body');
  rifle.addColor(c, 'colorHelixDeep').name('deep');
  const ion = beam.addFolder('Ionised haze');
  R(ion, c, 'ionRate', 0, 800, 1, 'puffs / s');
  R(ion, c, 'ionSize', 0.05, 3, 0.01, 'size');
  R(ion, c, 'ionLife', 0.1, 6, 0.05, 'lifetime');
  R(ion, c, 'ionRise', 0, 4, 0.01, 'rise (m/s)');
  R(ion, c, 'ionOpacity', 0, 1, 0.01, 'opacity');
  Editor.gradient(ion, c, 'colorIon', 'haze gradient');
  const warp = beam.addFolder('Heat bend');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpWidth', 0.02, 2, 0.005, 'radius (m)');
  R(warp, c, 'warpScale', 0.1, 12, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 30, 0.1, 'noise speed');
  R(warp, c, 'warpLife', 0.05, 4, 0.01, 'lasts (s)');

  const shock = folder.addFolder('5 · Shock rings');
  R(shock, c, 'shockSpacing', 0.3, 10, 0.05, 'every (m)');
  R(shock, c, 'shockRadius', 0.05, 3, 0.01, 'start radius (m)');
  R(shock, c, 'shockGrow', 0.5, 8, 0.05, 'grows to (×)');
  R(shock, c, 'shockWidth', 0.005, 0.4, 0.001, 'line width (m)');
  R(shock, c, 'shockLife', 0.05, 3, 0.01, 'lifetime');
  R(shock, c, 'shockGlow', 0, 10, 0.05, 'glow');
  R(shock, c, 'shockTicks', 0, 48, 1, 'tick marks');
  R(shock, c, 'shockBody', 0, 1, 0.01, 'dark body opacity');
  R(shock, c, 'shockRim', 0, 1, 0.01, 'hot rim opacity');
  shock.addColor(c, 'colorShockA').name('ring');
  shock.addColor(c, 'colorShockB').name('haze');

  const trench = folder.addFolder('6 · Slag trench');
  R(trench, c, 'trenchStart', 0, 5, 0.01, 'starts at (m)');
  R(trench, c, 'trenchCore', 0.01, 0.8, 0.005, 'molten half-width (m)');
  R(trench, c, 'trenchScorch', 0.05, 3, 0.01, 'scorch half-width (m)');
  R(trench, c, 'trenchGlow', 0, 15, 0.05, 'molten glow');
  R(trench, c, 'trenchCool', 0.05, 5, 0.01, 'cools over (s)');
  R(trench, c, 'trenchEmber', 0, 1, 0.01, 'seams keep glowing');
  R(trench, c, 'trenchCells', 0.5, 30, 0.1, 'crust cells / m');
  R(trench, c, 'trenchWander', 0, 0.4, 0.001, 'wander (m)');
  R(trench, c, 'trenchDark', 0, 1, 0.01, 'scorch opacity');
  R(trench, c, 'trenchErode', 0, 1, 0.01, 'ragged fade');
  trench.addColor(c, 'colorSlagHot').name('white-hot');
  trench.addColor(c, 'colorSlagWarm').name('molten');
  trench.addColor(c, 'colorSlagCool').name('slag');
  trench.addColor(c, 'colorScorch').name('scorch');
  R(trench, c, 'trenchCrawl', 0, 6, 0.01, 'heat crawl (cycles/s)');
  R(trench, c, 'trenchGlass', 0, 3, 0.01, 'fused cyan seam');
  R(trench, c, 'emberRate', 0, 800, 1, 'embers / s');
  R(trench, c, 'emberSize', 0.005, 0.3, 0.001, 'ember size');
  R(trench, c, 'emberLife', 0.1, 4, 0.05, 'ember lifetime');
  R(trench, c, 'emberRise', 0, 6, 0.01, 'ember rise (m/s)');
  Editor.gradient(trench, c, 'colorEmber', 'ember gradient');
  R(trench, c, 'smokeRate', 0, 400, 1, 'smoke / s');
  R(trench, c, 'smokeSize', 0.05, 3, 0.01, 'smoke size');
  R(trench, c, 'smokeRise', 0, 5, 0.01, 'smoke rise (m/s)');
  R(trench, c, 'smokeLife', 0.1, 6, 0.05, 'smoke lifetime');
  R(trench, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  Editor.gradient(trench, c, 'colorSmoke', 'smoke gradient');

  const impact = folder.addFolder('7 · Shot + impact');
  R(impact, c, 'fireShake', 0, 1.5, 0.01, 'kick at the hand');
  R(impact, c, 'muzzleFlash', 0, 1, 0.01, 'muzzle flash');
  R(impact, c, 'muzzleSparks', 0, 300, 1, 'muzzle sparks');
  R(impact, c, 'burstSize', 0, 10, 0.05, 'flash shell (m)');
  R(impact, c, 'burstIntensity', 0, 5, 0.01, 'shell brightness');
  R(impact, c, 'burstLife', 0.05, 3, 0.01, 'shell lasts (s)');
  R(impact, c, 'burstFilament', 0, 2, 0.01, 'hot filaments (× brightness)');
  R(impact, c, 'shellOpacity', 0, 1, 0.01, 'dark shell body');
  R(impact, c, 'shellRimGlow', 0, 10, 0.05, 'shell rim glow');
  R(impact, c, 'shellRimSharp', 1, 16, 0.1, 'shell rim thinness');
  R(impact, c, 'shellDisplace', 0, 1, 0.01, 'shell billow');
  impact.addColor(c, 'colorShellBody').name('shell body');
  impact.addColor(c, 'colorShellDeep').name('shell deep');
  R(impact, c, 'floorRingGlow', 0, 2, 0.01, 'floor rings brightness');
  R(impact, c, 'endHold', 0, 1.5, 0.01, 'end keeps pulsing (× beam life)');
  R(impact, c, 'endPulseRate', 0, 12, 0.05, 'end pulses / s');
  R(impact, c, 'endPulseSize', 0, 8, 0.05, 'pressure shell (m)');
  R(impact, c, 'endRingRadius', 0, 12, 0.05, 'floor ring (m)');
  R(impact, c, 'endSparkRate', 0, 1500, 1, 'splash sparks / s');
  R(impact, c, 'shockRadius3d', 0, 16, 0.05, 'ground shockwave (m)');
  R(impact, c, 'scorchRadius', 0, 6, 0.05, 'scorch (m)');
  R(impact, c, 'debrisCount', 0, 300, 1, 'debris');
  R(impact, c, 'debrisSpeed', 0, 30, 0.1, 'debris speed');
  R(impact, c, 'debrisSize', 0.01, 0.5, 0.005, 'debris size');
  R(impact, c, 'debrisLife', 0.1, 4, 0.05, 'debris lifetime');
  R(impact, c, 'debrisGravity', -40, 0, 0.5, 'debris gravity');
  R(impact, c, 'impactSparks', 0, 500, 1, 'impact sparks');
  R(impact, c, 'impactShake', 0, 2, 0.01, 'camera knock');
  R(impact, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(impact, c, 'impactFlash', 0, 1, 0.01, 'flash');
  impact.addColor(c, 'colorBurstA').name('shell hot');
  impact.addColor(c, 'colorBurstB').name('shell mid');
  impact.addColor(c, 'colorBurstC').name('shell outer');
  impact.addColor(c, 'colorFlash').name('flash');
  Editor.gradient(impact, c, 'colorDebris', 'debris gradient');

  const pierce = folder.addFolder('8 · Pierce');
  R(pierce, c, 'hitRadius', 0.05, 3, 0.01, 'reach either side (m)');
  R(pierce, c, 'hitImpulse', 0, 40, 0.1, 'thrown down the line (m/s)');
  R(pierce, c, 'hitLift', 0, 12, 0.05, 'lift (m/s)');
  R(pierce, c, 'hitSpin', 0, 5, 0.01, 'tumble');
  R(pierce, c, 'hitSlice', 0, 1, 1, 'cuts in two (0/1)');
  R(pierce, c, 'hitBurn', 0, 1, 0.01, 'hard-light burn');
  R(pierce, c, 'hitSparks', 0, 200, 1, 'sparks per body');
  pierce.addColor(c.look, 'color').name('burnt body');
  pierce.addColor(c.look, 'rimColor').name('burn rim');
  R(pierce, c.look, 'rimEmissive', 0, 8, 0.05, 'rim emissive');
  pierce.addColor(c.look, 'edgeColor').name('burn edge');
  R(pierce, c.look, 'edgeEmissive', 0, 12, 0.05, 'edge emissive');
  R(pierce, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  folder.close();
  return folder;
}
