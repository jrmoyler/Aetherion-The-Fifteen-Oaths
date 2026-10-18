import { Mesh, SphereGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createRainGeometry,
  createVitriolQuadGeometry,
  createVitriolShellGeometry
} from '../../assets/codex/VitriolRainGeometry.js';
import {
  createSeedMaterial,
  createCloudMaterial,
  createRainMaterial,
  createPitFloorMaterial,
  createShimmerMaterial
} from '../../materials/codex/VitriolRainMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'vitriol';

const TAU = Math.PI * 2;
/** Drops in the rain buffer; `density` picks how many of them fall. */
const MAX_DROPS = 900;
/** Bodies the rain can be melting at once. */
const MAX_VICTIMS = 12;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _hand = new Vector3();
const _top = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * VITRIOL RAIN — a sick cloud over the circle, and what falls out of it.
 *
 * A zone cast. The caster lobs a **seed** of vitriol up in a high arc to the
 * sky over the circle. There it **blooms** into a cloud — a thick lumpy lens
 * of dark olive vapour with *mammatus* pouches sagging off its belly, lit from
 * inside by a throbbing toxic glow. A beat later it **rains**: hundreds of
 * glowing streaks of acid, slanting slightly, thickening to a downpour. The
 * floor under it goes wet with acid and is **pitted** — pits open one by one
 * across the circle, each with a bright splash ring and a hole of hot acid
 * that cools to a dark pock — while raindrops ring the wet floor everywhere,
 * droplets splash up, steam fumes off it and the air shimmers. Bodies caught
 * in it are stained and, after `exposureToFall` seconds, **slump**. Then the
 * rain thins drop by drop, the cloud breaks up into holes with glowing
 * fringes, and the pitted floor cools and erodes.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seed** (`createSeedMaterial`) — a camera-facing glob with a
 *      boiling fringe, and a trail of motes along its arc.
 *   2. **the cloud** (`createCloudMaterial`) — a sphere displaced into a lens
 *      with lumps and mammatus pouches; throbbing belly glow; noise break-up.
 *   3. **the rain** (`createRainMaterial`) — instanced streaks placed wholly
 *      on the GPU on an integrated fall clock, thinned per cycle by density.
 *   4. **the pitted floor** (`createPitFloorMaterial`) — pits born across the
 *      rain, splash rings, a spreading wet sheen, a ragged edge.
 *   5. **splashes, steam & sizzle** — DROPLET splashes, SMOKE steam and
 *      curl-noise motes, all off the circle while it pours.
 *   6. **shimmer & bloom** — a distortion shell round the circle, a
 *      SHOCKWAVE and DUSTRING as the cloud blooms, flash, shake, light punch.
 *   7. **the melt** — `handlesOwnHits`: exposure-based stain and collapse.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, a churn phase, a throb phase and a rain clock; all
 * else is read from `settings.vitriol` every frame.
 */
export class VitriolRainAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Drops falling right now (estimate). HUD readout only. */
  get instanceCount() {
    return this.rain.visible ? Math.round(MAX_DROPS * this._rainState.density) : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.quadGeometry = createVitriolQuadGeometry();
    this.cloudGeometry = new SphereGeometry(1, 72, 36);
    this.rainGeometry = createRainGeometry(MAX_DROPS);
    this.shellGeometry = createVitriolShellGeometry(56, 4);

    this.floorMaterial = createPitFloorMaterial();
    this.floor = this._mesh(this.quadGeometry, this.floorMaterial, LAYER.VFX, 2);
    this.cloudMaterial = createCloudMaterial();
    this.cloud = this._mesh(this.cloudGeometry, this.cloudMaterial, LAYER.VFX, 12);
    this.rainMaterial = createRainMaterial();
    this.rain = this._mesh(this.rainGeometry, this.rainMaterial, LAYER.VFX, 13);
    this.seedMaterial = createSeedMaterial();
    this.seed = this._mesh(this.quadGeometry, this.seedMaterial, LAYER.VFX, 16);
    this.shimmerMaterial = createShimmerMaterial();
    this.shimmer = this._mesh(this.shellGeometry, this.shimmerMaterial, LAYER.DISTORTION, 0);

    this._seedState = { center: new Vector3(), scale: 0, intensity: 1, seed: 0 };
    this._cloudState = { center: new Vector3(), grow: 0, churn: 0, pulse: 0, rain: 0, breakUp: 0, seed: 0 };
    this._rainState = { center: new Vector3(), top: 6, clock: 0, density: 0, slantX: 0, slantZ: 0, seed: 0 };
    this._floorState = { center: new Vector3(), clock: 0, wet: 0, rain: 0, fadeT: 0, seed: 0 };
    this._shimmerState = { center: new Vector3(), amount: 0, seed: 0 };

    this._seed = 0;
    this._churn = 0;
    this._pulse = 0;
    this._clock = 0;
    this._rainAmt = 0;
    this._grow = 0;
    this._slantA = 0;

    this._victims = [];
    for (let i = 0; i < MAX_VICTIMS; i++) this._victims.push({ dummy: null, exposure: 0 });
    this._victimCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.splashes = particles.get('vitriol.splashes', {
      capacity: 1600,
      shape: ParticleShape.DROPLET,
      additive: false,
      softFade: 0.1
    });
    this.splashes.uniforms.uSizeIn.value = 0.04;
    this.splashes.uniforms.uFadeIn.value = 0.02;
    this.splashes.uniforms.uFadeOut.value = 0.4;
    this.splashes.uniforms.uEndSize.value = 0.5;
    this.splashes.uniforms.uDrag.value = 0.3;

    this.steam = particles.get('vitriol.steam', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.steam.uniforms.uSizeIn.value = 0.25;
    this.steam.uniforms.uFadeIn.value = 0.2;
    this.steam.uniforms.uFadeOut.value = 0.55;
    this.steam.uniforms.uEndSize.value = 2.6;
    this.steam.uniforms.uDrag.value = 0.8;

    this.sizzle = particles.get('vitriol.sizzle', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.sizzle.uniforms.uSizeIn.value = 0.05;
    this.sizzle.uniforms.uFadeIn.value = 0.06;
    this.sizzle.uniforms.uFadeOut.value = 0.5;
    this.sizzle.uniforms.uEndSize.value = 0.3;
    this.sizzle.uniforms.uDrag.value = 1.1;
    this.sizzle.uniforms.uTurbFrequency.value = 0.9;
    this.sizzle.uniforms.uTurbSpeed.value = 0.7;

    this.trailEmitter = new RateEmitter();
    this.splashEmitter = new RateEmitter();
    this.steamEmitter = new RateEmitter();
    this.sizzleEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the bloom and the downpour. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.2, (Math.max(0, c.rainDelay) + Math.max(0.1, c.rainTime)) * settings.global.lifetime);
  }

  /** The fade is the rain thinning, the cloud breaking, the pits cooling. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** The light throbs with the cloud. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    const throb = Math.pow(0.5 + 0.5 * Math.sin(this._pulse * TAU), 3);
    return 1 - f + f * (0.4 + 0.6 * throb);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.trailEmitter.reset();
    this.splashEmitter.reset();
    this.steamEmitter.reset();
    this.sizzleEmitter.reset();
    this._releaseVictims();

    this._seed = Math.random() * 100;
    this._churn = Math.random() * 10;
    this._pulse = 0;
    this._clock = 0;
    this._rainAmt = 0;
    this._grow = 0;
    this._slantA = Math.random() * TAU;

    this._seedState.seed = this._seed;
    this._seedState.scale = 0;
    this._seedState.intensity = 1;
    this._cloudState.seed = this._seed;
    this._cloudState.breakUp = 0;
    this._rainState.seed = this._seed;
    this._floorState.seed = this._seed;
    this._floorState.fadeT = 0;
    this._shimmerState.seed = this._seed;

    this.seed.visible = true;
    this.cloud.visible = false;
    this.rain.visible = false;
    this.floor.visible = false;
    this.shimmer.visible = false;
    this._sync(0);
  }

  _resetEmit(time) {
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

  /** A point uniform in the circle, on the floor. */
  _inCircle(out, scale) {
    const c = settings[ID];
    const r = Math.sqrt(Math.random()) * c.zoneRadius * scale;
    const a = Math.random() * TAU;
    return out.set(_centre.x + Math.cos(a) * r, 0.04, _centre.z + Math.sin(a) * r);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _advance(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._churn += c.churnSpeed * dt * g.noiseSpeed;
    this._pulse += c.pulseRate * dt * g.animationSpeed;
  }

  /** @param {number} fadeT 0 while it pours, then 0..1 through the fade */
  _sync(fadeT) {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _centre);
    _centre.y = 0;

    const cs = this._cloudState;
    cs.center.copy(_centre).setY(c.cloudHeight);
    cs.grow = this._grow;
    cs.churn = this._churn;
    cs.pulse = this._pulse;
    cs.rain = this._rainAmt;
    this.cloudMaterial.userData.sync(cs);

    const rs = this._rainState;
    rs.center.copy(_centre);
    rs.top = c.cloudHeight - 0.2;
    rs.clock = this._clock;
    rs.density = c.density * this._rainAmt;
    rs.slantX = Math.cos(this._slantA) * c.slant;
    rs.slantZ = Math.sin(this._slantA) * c.slant;
    this.rainMaterial.userData.sync(rs);

    const fs = this._floorState;
    fs.center.copy(_centre);
    fs.clock = this._clock;
    fs.wet = smoothstep(0, 0.9, this._clock) * (1 - fadeT * 0.6);
    fs.rain = this._rainAmt;
    this.floorMaterial.userData.sync(fs);

    const ss = this._shimmerState;
    ss.center.copy(_centre);
    ss.amount = smoothstep(0, 1, this._clock) * (1 - fadeT);
    this.shimmerMaterial.userData.sync(ss);

    this.seedMaterial.userData.sync(this._seedState);

    /* the particles' looks */
    this.splashes.setGradient(getColor(c.colorSplashA), getColor(c.colorSplashB), getColor(c.colorSplashC), getColor(c.colorSplashD));
    const s = this.splashes.uniforms;
    s.uGravity.value.set(0, -12, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uTurbulence.value = 0.05 * g.turbulence;

    this.steam.setGradient(getColor(c.colorSteamA), getColor(c.colorSteamB), getColor(c.colorSteamC), getColor(c.colorSteamD));
    const m = this.steam.uniforms;
    m.uGravity.value.set(0, c.steamRise * 0.35, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.steamOpacity * g.opacity;
    m.uTurbulence.value = 0.7 * g.turbulence;
    m.uSwirl.value = 0.6;
    m.uSwirlExpand.value = 0.4;

    this.sizzle.setGradient(getColor(c.colorSizzleA), getColor(c.colorSizzleB), getColor(c.colorSizzleC), getColor(c.colorSizzleD));
    const z = this.sizzle.uniforms;
    z.uGravity.value.set(0, 1.4, 0);
    z.uSizeScale.value = g.particleSize;
    z.uLifeScale.value = g.particleLifetime;
    z.uSpeedScale.value = g.particleSpeed;
    z.uOpacity.value = g.opacity;
    z.uGlow.value = c.sizzleGlow * g.glow;
    z.uTurbulence.value = 1.1 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the seed arcs up to the sky                                */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._advance(dt);
    this.pointAt(1, _centre);
    _hand.copy(this.origin).addScaledVector(this.direction, 0.6).setY(1.5);
    _top.copy(_centre).setY(c.cloudHeight);
    const u = Easing.inOutQuad(this.u);
    const ss = this._seedState;
    ss.center.lerpVectors(_hand, _top, u);
    ss.center.y += Math.sin(Math.PI * u) * c.seedArc;
    ss.scale = Easing.outBack(saturate(this.age / 0.12)) * (1 + 0.5 * u);
    ss.intensity = 1;
    this._sync(0);

    const n = Math.round(this.trailEmitter.tick(dt, c.seedTrail) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.position = ss.center;
      _emit.radius = c.seedSize * 0.6;
      _emit.direction = _up;
      _emit.speed = 0.4;
      _emit.spread = 1;
      _emit.size = c.sizzleSize * 1.4;
      _emit.life = c.sizzleLife;
      this.sizzle.emit(n, _emit);
      if (Math.random() < 0.4) {
        _emit.size = c.steamSize * 0.5;
        _emit.life = c.steamLife * 0.4;
        _emit.anchor = ss.center;
        this.steam.emit(1, _emit);
      }
    }
    this.position.copy(ss.center);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the bloom, then the downpour                               */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this.pointAt(1, _centre);
    this.seed.visible = false;
    this.cloud.visible = true;
    this.rain.visible = true;
    this.floor.visible = true;
    this.shimmer.visible = true;

    // The bloom: a ring of wind on the floor and a gout of vapour in the sky.
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius * 1.1,
      life: 0.9,
      intensity: 0.6,
      colorA: getColor(c.colorSteamB),
      colorB: getColor(c.colorSteamA)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * 1.3 * power,
      life: 0.6,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorSeedCore)
    });
    this._resetEmit(frame.uTime.value);
    _top.copy(_centre).setY(c.cloudHeight);
    _emit.position = _top;
    _emit.anchor = _top;
    _emit.radius = c.zoneRadius * 0.5;
    _emit.direction = _up;
    _emit.speed = 1.5;
    _emit.spread = 1;
    _emit.size = c.steamSize * 1.8;
    _emit.life = c.steamLife * 0.7;
    _emit.spin = 0.5;
    this.steam.emit(Math.round(18 * g.particleCount), _emit);
    _emit.size = c.sizzleSize * 2;
    _emit.speed = 3;
    _emit.life = c.sizzleLife;
    this.sizzle.emit(Math.round(60 * g.particleCount), _emit);

    this.ctx.shake.add(c.bloomShake * power, 4, 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.bloomFlash * power);
    this.lightBoost = c.lightIntensity * c.bloomLight * power;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._advance(dt);
    this.pointAt(1, _centre);

    if (this.phase === AbilityPhase.IMPACT) {
      const tau = t * this.impactDuration / Math.max(0.01, g.lifetime);
      this._grow = lerp(0.12, 1, Easing.outBack(saturate(tau / Math.max(0.05, c.bloomTime))));
      const rainT = tau - Math.max(0, c.rainDelay);
      if (rainT > 0) this._clock += dt;
      this._rainAmt = smoothstep(0, Math.max(0.02, c.rainRamp), rainT);
      this._cloudState.breakUp = 0;
      this._sync(0);
      this.ctx.shake.rumble(c.rainRumble * this._rainAmt, dt);
    } else {
      const ft = saturate(t - 1);
      this._clock += dt;
      this._rainAmt = 1 - smoothstep(0, 0.45, ft);
      this._cloudState.breakUp = smoothstep(0.15, 1, ft);
      this._sync(smoothstep(0.5, 1, ft));
      this._floorState.fadeT = smoothstep(0.5, 1, ft);
      this.floorMaterial.userData.sync(this._floorState);
      this.cloud.visible = this._cloudState.breakUp < 0.999;
      this.rain.visible = ft < 0.85;
    }

    this._pourFx(dt);
    this._melt(dt);
    this.position.copy(_centre).setY(Math.max(1.5, c.cloudHeight - 0.8));
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _pourFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const rain = this._rainAmt;
    const wet = this._floorState.wet;
    const time = frame.uTime.value;

    const n = Math.round(this.splashEmitter.tick(dt, c.splashRate3D * rain) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.size = c.splashSize;
      _emit.life = c.splashLife;
      _emit.speed = c.splashSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.55;
      _emit.direction = _up;
      for (let i = 0; i < n; i++) {
        this._inCircle(_pos, 0.95);
        _emit.position = _pos;
        this.splashes.emit(2, _emit);
      }
    }

    const s = Math.round(this.steamEmitter.tick(dt, c.steamRate * Math.max(rain, wet * 0.5)) * g.particleCount);
    if (s > 0) {
      this._resetEmit(time);
      _emit.size = c.steamSize;
      _emit.life = c.steamLife;
      _emit.speed = c.steamRise;
      _emit.spread = 0.3;
      _emit.spin = 0.4;
      _emit.direction = _up;
      for (let i = 0; i < s; i++) {
        this._inCircle(_pos, 0.9);
        _pos.y = 0.15;
        _emit.position = _pos;
        _emit.anchor = _centre;
        this.steam.emit(1, _emit);
      }
    }

    const z = Math.round(this.sizzleEmitter.tick(dt, c.sizzleRate * Math.max(rain, wet * 0.4)) * g.particleCount);
    if (z > 0) {
      this._resetEmit(time);
      _emit.size = c.sizzleSize;
      _emit.life = c.sizzleLife;
      _emit.speed = 0.8;
      _emit.spread = 0.6;
      _emit.direction = _up;
      for (let i = 0; i < z; i++) {
        this._inCircle(_pos, 0.95);
        _emit.position = _pos;
        this.sizzle.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The melt                                                            */
  /* ------------------------------------------------------------------ */

  _melt(dt) {
    const field = this.ctx.dummies;
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.zoneRadius);
    const rain = this._rainAmt;

    if (field?.findTargets && rain > 0.05) {
      const found = field.findTargets(_centre.x, _centre.z, R, this._found);
      for (const dummy of found) {
        let known = false;
        for (let i = 0; i < this._victimCount; i++) if (this._victims[i].dummy === dummy) known = true;
        if (known || this._victimCount >= MAX_VICTIMS) continue;
        const slot = this._victims[this._victimCount++];
        slot.dummy = dummy;
        slot.exposure = 0;
      }
    }

    const look = this._look;
    look.color = c.colorMeltBody;
    look.rimColor = c.colorMeltRim;
    look.rimEmissive = c.meltRimGlow;
    look.edgeColor = c.colorMeltEdge;
    look.edgeEmissive = c.meltEdgeGlow;
    look.edgeWidth = c.meltEdgeWidth;
    const power = g.explosionIntensity;
    for (let i = 0; i < this._victimCount; i++) {
      const slot = this._victims[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      const dx = dummy.position.x - _centre.x;
      const dz = dummy.position.z - _centre.z;
      if (dx * dx + dz * dz < R * R * 1.1) slot.exposure += dt * rain;
      dummy.corrode(saturate(slot.exposure * c.corrodeRate), look);
      if (dummy.alive && slot.exposure >= c.exposureToFall) {
        // It slumps: a little impulse, mostly down where it stood.
        const a = Math.random() * TAU;
        this._force.impulse = c.fallImpulse * power;
        this._force.lift = c.fallLift * power;
        this._force.spin = 0.4;
        if (dummy.kill(Math.cos(a), Math.sin(a), this._force)) {
          this._resetEmit(frame.uTime.value);
          _pos.copy(dummy.position).setY(0.9);
          _emit.position = _pos;
          _emit.radius = 0.35;
          _emit.direction = _up;
          _emit.speed = 1;
          _emit.spread = 0.8;
          _emit.size = c.steamSize * 0.8;
          _emit.life = c.steamLife * 0.6;
          this.steam.emit(Math.round(6 * g.particleCount), _emit);
          _emit.size = c.sizzleSize * 1.5;
          _emit.life = c.sizzleLife;
          _emit.speed = 2;
          this.sizzle.emit(Math.round(30 * g.particleCount), _emit);
          this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5);
        }
      }
      if (slot.exposure > 0.05 && Math.random() < dt * 8 * rain) {
        const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
        this._resetEmit(frame.uTime.value);
        _emit.position = at;
        _emit.radius = 0.3;
        _emit.direction = _up;
        _emit.speed = 0.7;
        _emit.spread = 0.6;
        _emit.size = c.sizzleSize;
        _emit.life = c.sizzleLife;
        this.sizzle.emit(2, _emit);
      }
    }
  }

  _releaseVictims() {
    for (let i = 0; i < this._victimCount; i++) this._victims[i].dummy = null;
    this._victimCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.seed.visible = false;
    this.cloud.visible = false;
    this.rain.visible = false;
    this.floor.visible = false;
    this.shimmer.visible = false;
    this._rainAmt = 0;
    this._clock = 0;
    this._releaseVictims();
  }

  dispose() {
    this.quadGeometry.dispose();
    this.cloudGeometry.dispose();
    this.rainGeometry.dispose();
    this.shellGeometry.dispose();
    this.floorMaterial.dispose();
    this.cloudMaterial.dispose();
    this.rainMaterial.dispose();
    this.seedMaterial.dispose();
    this.shimmerMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☂  Vitriol Rain');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 1, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 2, 80, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'breaks up over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'throb');

  const seed = folder.addFolder('1 · Seed');
  R(seed, c, 'seedSize', 0.05, 2, 0.01, 'radius (m)');
  R(seed, c, 'seedArc', 0, 12, 0.05, 'arc above the cloud (m)');
  R(seed, c, 'seedGlow', 0, 15, 0.05, 'glow');
  R(seed, c, 'seedTrail', 0, 600, 1, 'trail motes/second');
  seed.addColor(c, 'colorSeedCore').name('core');
  seed.addColor(c, 'colorSeedHalo').name('halo');

  const cloud = folder.addFolder('2 · Cloud');
  R(cloud, c, 'cloudHeight', 1.5, 16, 0.05, 'belly height (m)');
  R(cloud, c, 'cloudRadius', 0.3, 2.5, 0.01, 'radius (× circle)');
  R(cloud, c, 'cloudThickness', 0.1, 6, 0.05, 'thickness (m)');
  R(cloud, c, 'bloomTime', 0.05, 2, 0.01, 'blooms over (s)');
  R(cloud, c, 'lumpAmount', 0, 2, 0.01, 'lumps (m)');
  R(cloud, c, 'lumpScale', 0.1, 4, 0.01, 'lump scale');
  R(cloud, c, 'mammaAmount', 0, 2, 0.01, 'belly pouches (m)');
  R(cloud, c, 'mammaScale', 0.1, 5, 0.01, 'pouch scale');
  R(cloud, c, 'churnSpeed', 0, 3, 0.01, 'churn');
  R(cloud, c, 'cloudOpacity', 0, 1, 0.01, 'opacity');
  R(cloud, c, 'bellyGlow', 0, 10, 0.05, 'belly glow');
  R(cloud, c, 'rimLight', 0, 4, 0.01, 'rim light');
  R(cloud, c, 'pulseRate', 0, 6, 0.05, 'throbs/second');
  cloud.addColor(c, 'colorCloudTop').name('top');
  cloud.addColor(c, 'colorCloudMid').name('body');
  cloud.addColor(c, 'colorCloudBelly').name('belly glow');
  cloud.addColor(c, 'colorCloudRim').name('rim');

  const rain = folder.addFolder('3 · Rain');
  R(rain, c, 'rainDelay', 0, 2, 0.01, 'first drops after (s)');
  R(rain, c, 'rainTime', 0.1, 10, 0.05, 'pours for (s)');
  R(rain, c, 'rainRamp', 0.02, 3, 0.01, 'comes on over (s)');
  R(rain, c, 'density', 0, 1, 0.01, 'density');
  R(rain, c, 'fallSpeed', 1, 40, 0.1, 'fall speed (m/s)');
  R(rain, c, 'streakLength', 0.05, 4, 0.01, 'streak length (m)');
  R(rain, c, 'streakWidth', 0.003, 0.15, 0.001, 'streak width (m)');
  R(rain, c, 'slant', 0, 1, 0.01, 'slant');
  R(rain, c, 'rainGlow', 0, 12, 0.05, 'glow');
  rain.addColor(c, 'colorRain').name('colour');

  const floor = folder.addFolder('4 · Pitted floor');
  R(floor, c, 'pitScale', 0.2, 6, 0.01, 'pit cells per m');
  R(floor, c, 'pitSize', 0.05, 0.7, 0.005, 'pit size (× cell)');
  R(floor, c, 'pitRate', 0.02, 4, 0.01, 'pits appear (rate)');
  R(floor, c, 'pitCool', 0, 6, 0.05, 'pits cool (per s)');
  R(floor, c, 'pitGlow', 0, 10, 0.05, 'pit glow');
  R(floor, c, 'splashScale', 0.3, 10, 0.05, 'splash rings per m');
  R(floor, c, 'splashRate', 0, 8, 0.05, 'splash rings/second');
  R(floor, c, 'splashGlow', 0, 8, 0.05, 'splash glow');
  R(floor, c, 'wetGlow', 0, 4, 0.01, 'wet sheen glow');
  R(floor, c, 'edgeRagged', 0, 1, 0.01, 'ragged edge');
  R(floor, c, 'erode', 0, 1, 0.01, 'ragged fade');
  floor.addColor(c, 'colorPitHot').name('pit hot');
  floor.addColor(c, 'colorPitAcid').name('pit acid');
  floor.addColor(c, 'colorPitHole').name('pit hole');
  floor.addColor(c, 'colorWet').name('wet floor');
  floor.addColor(c, 'colorEtched').name('etched floor');

  const fx = folder.addFolder('5 · Splashes, steam & sizzle');
  R(fx, c, 'splashRate3D', 0, 600, 1, 'splashes/second');
  R(fx, c, 'splashSize', 0.005, 0.3, 0.001, 'splash size');
  R(fx, c, 'splashSpeed', 0, 10, 0.05, 'splash speed');
  R(fx, c, 'splashLife', 0.05, 2, 0.01, 'splash lifetime');
  R(fx, c, 'steamRate', 0, 200, 1, 'steam/second');
  R(fx, c, 'steamSize', 0.05, 4, 0.01, 'steam size');
  R(fx, c, 'steamLife', 0.1, 8, 0.05, 'steam lifetime');
  R(fx, c, 'steamRise', 0, 5, 0.01, 'steam rise (m/s)');
  R(fx, c, 'steamOpacity', 0, 1, 0.01, 'steam opacity');
  R(fx, c, 'sizzleRate', 0, 600, 1, 'sizzle/second');
  R(fx, c, 'sizzleSize', 0.005, 0.3, 0.001, 'sizzle size');
  R(fx, c, 'sizzleLife', 0.05, 4, 0.05, 'sizzle lifetime');
  R(fx, c, 'sizzleGlow', 0, 10, 0.05, 'sizzle glow');
  Editor.gradient(fx, c, 'colorSplash', 'splash gradient');
  Editor.gradient(fx, c, 'colorSteam', 'steam gradient');
  Editor.gradient(fx, c, 'colorSizzle', 'sizzle gradient');

  const bloom = folder.addFolder('6 · Shimmer & bloom');
  R(bloom, c, 'shimmerStrength', 0, 4, 0.01, 'shimmer');
  R(bloom, c, 'shimmerHeight', 0.1, 8, 0.05, 'shimmer height (m)');
  R(bloom, c, 'shimmerScale', 0.1, 6, 0.01, 'shimmer scale');
  R(bloom, c, 'shimmerSpeed', 0, 8, 0.05, 'shimmer speed');
  R(bloom, c, 'bloomFlash', 0, 1, 0.01, 'bloom flash');
  R(bloom, c, 'bloomShake', 0, 1.5, 0.01, 'bloom knock');
  R(bloom, c, 'bloomLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(bloom, c, 'rainRumble', 0, 1, 0.01, 'rumble while it pours');
  bloom.addColor(c, 'colorFlash').name('flash');
  bloom.addColor(c, 'colorShock').name('bloom ring');

  const melt = folder.addFolder('7 · Melt');
  R(melt, c, 'exposureToFall', 0.05, 8, 0.05, 'slumps after (s of rain)');
  R(melt, c, 'corrodeRate', 0, 3, 0.01, 'stain per second');
  R(melt, c, 'fallImpulse', 0, 10, 0.05, 'slump impulse (m/s)');
  R(melt, c, 'fallLift', 0, 6, 0.05, 'slump lift (m/s)');
  R(melt, c, 'meltRimGlow', 0, 10, 0.05, 'stain rim glow');
  R(melt, c, 'meltEdgeGlow', 0, 12, 0.05, 'stain edge glow');
  R(melt, c, 'meltEdgeWidth', 0, 0.3, 0.001, 'stain edge width');
  melt.addColor(c, 'colorMeltBody').name('stained body');
  melt.addColor(c, 'colorMeltRim').name('stain rim');
  melt.addColor(c, 'colorMeltEdge').name('stain edge');

  folder.close();
  return folder;
}
