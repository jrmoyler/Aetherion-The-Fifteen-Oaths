import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createArcTubeGeometry, createWallGeometry, createRingQuadGeometry } from '../../assets/codex/HemorrhageRingGeometry.js';
import {
  createRaceMaterial,
  createWallMaterial,
  createChannelMaterial,
  createHeadGlowMaterial,
  createImplodeWarpMaterial
} from '../../materials/codex/HemorrhageRingMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'hemorrhage';

const TAU = Math.PI * 2;
/** Bodies that can be bleeding off one cast at once. */
const MAX_BLED = 14;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _entry = new Vector3();
const _hand = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * HEMORRHAGE RING — blood races round the rim of the circle, stands up into a
 * spinning wall, and falls inward on everything in it.
 *
 * A zone cast in five beats. **The throw**: a bead of blood is flung low off
 * the caster's hand at the near edge of the circle. **The race**: where it
 * meets the rim it does not stop — it *turns*, and runs round the circle as a
 * rope of blood with a swollen, glowing head, cutting a groove into the floor
 * that fills behind it, accelerating lap after lap, flinging spray outward,
 * until the rope closes into a complete ring spinning in its channel. Anyone
 * standing on the rim is clipped off their feet. **The wall**: the ring stands
 * up into a spinning wall of blood, its crest torn and foaming pale. **The
 * fall**: the wall falls *inward* — its foot races toward the centre, the
 * crest leaning in and climbing as the circle narrows, the air rushing in with
 * it (a ring on the distortion layer), dragging every body it passes in with
 * it and smearing drag marks across the floor. **The burst**: it meets itself
 * in the middle and bursts — a geyser of blood straight up, a red shell, a
 * shockwave, a flash, a knock to the camera — and what it dragged in is
 * thrown up with it. The channel, the drag marks and the splat dry and erode.
 *
 * Deliberately not Crimson Baptism (centre → out → up); this is rim → round →
 * in → up.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the race** (`createRaceMaterial`) — a parameter-space tube laid along
 *      an arc of the rim, lit wet blood with streaks rushing to the head.
 *   2. **the wall** (`createWallMaterial`) — a parameter-space band round the
 *      circle; stands, spins, leans in, collapses, tears.
 *   3. **the channel** — the groove, the drag marks and the splat.
 *   4. **the head glow** — a bloom on the racing head, then on the meeting.
 *   5. **the implosion warp** — an inward-running ring of bent air.
 *   6. **droplets, spray, mist** — three particle systems.
 *   7. **the burst** — WATER shell, SHOCKWAVE, flash, shake, light punch;
 *      `handlesOwnHits`: clipped on the rim, dragged in by the wall, thrown up
 *      at the burst.
 *
 * ## The editor rule
 *
 * A cast captures a seed, the direction of circulation and where it entered
 * the rim; the head's angle and the wall's spin are integrated so their rates
 * are live. Every size, timing and colour is resolved from
 * `settings.hemorrhage` every frame.
 */
export class HemorrhageRingAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._bledCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.tubeGeometry = createArcTubeGeometry(200, 10);
    this.wallGeometry = createWallGeometry(120, 14);
    this.quadGeometry = createRingQuadGeometry();

    this.channelMaterial = createChannelMaterial();
    this.channel = this._mesh(this.quadGeometry, this.channelMaterial, LAYER.VFX, 2);

    this.raceMaterial = createRaceMaterial();
    this.race = this._mesh(this.tubeGeometry, this.raceMaterial, LAYER.VFX, 11);

    this.wallMaterial = createWallMaterial();
    this.wall = this._mesh(this.wallGeometry, this.wallMaterial, LAYER.VFX, 12);

    this.glowMaterial = createHeadGlowMaterial();
    this.glow = this._mesh(this.quadGeometry, this.glowMaterial, LAYER.VFX, 16);

    this.warpMaterial = createImplodeWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._center = new Vector3();
    this._head = new Vector3();
    this._raceState = { center: new Vector3(), radius: 4, theta0: 0, theta1: 0, flow: 0, seed: 0 };
    this._wallState = { center: new Vector3(), radius: 4, height: 0, lean: 0, spin: 0, break: 0, seed: 0 };
    this._channelState = {
      center: new Vector3(),
      radius: 4,
      theta0: 0,
      theta1: 0,
      flow: 0,
      drag: -1,
      splat: 0,
      dry: 0,
      fadeT: 0,
      seed: 0
    };
    this._glowState = { center: new Vector3(), size: 0.6, intensity: 0, seed: 0 };
    this._warpState = { center: new Vector3(), size: 5, ring: 1, strength: 0 };

    this._seed = 0;
    /** +1 / −1, the way the blood circulates. */
    this._sign = 1;
    this._thetaEntry = 0;
    /** Radians the head has run round the rim. */
    this._run = 0;
    /** Radians per second it is running at. */
    this._omega = 0;
    this._spin = 0;
    this._flow = 0;
    this._tau = 0;
    this._burst = false;
    this._onRim = false;

    this._bled = [];
    for (let i = 0; i < MAX_BLED; i++) this._bled.push({ dummy: null, time: 0, emitter: new RateEmitter() });
    this._bledCount = 0;
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

    this.drops = particles.get('hemorrhage.drops', {
      capacity: 3000,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uSizeIn.value = 0.04;
    this.drops.uniforms.uFadeIn.value = 0.02;
    this.drops.uniforms.uFadeOut.value = 0.3;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uDrag.value = 0.3;

    this.spray = particles.get('hemorrhage.spray', {
      capacity: 2000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.spray.uniforms.uSizeIn.value = 0.02;
    this.spray.uniforms.uFadeIn.value = 0.02;
    this.spray.uniforms.uFadeOut.value = 0.5;
    this.spray.uniforms.uEndSize.value = 0.3;
    this.spray.uniforms.uDrag.value = 1.2;

    this.mist = particles.get('hemorrhage.mist', {
      capacity: 1000,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.2;
    this.mist.uniforms.uFadeIn.value = 0.12;
    this.mist.uniforms.uFadeOut.value = 0.55;
    this.mist.uniforms.uEndSize.value = 2.4;
    this.mist.uniforms.uDrag.value = 1.4;

    this.headEmitter = new RateEmitter();
    this.crestEmitter = new RateEmitter();
    this.geyserEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    const c = settings[ID];
    const span = c.raceTime + c.riseTime + c.fallTime + c.lingerTime;
    return Math.max(0.2, span * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  get radius() {
    return Math.max(0.3, settings[ID].zoneRadius);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 13.1) * Math.sin(this.age * 4.7 + 0.6));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry helpers                                                    */
  /* ------------------------------------------------------------------ */

  /** A point on the rim at angle `theta`, `y` off the floor. */
  _rim(theta, y, out) {
    const R = this.radius;
    return out.set(this._center.x + Math.cos(theta) * R, y, this._center.z + Math.sin(theta) * R);
  }

  _handPoint(out) {
    const c = settings[ID];
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide)
      .setY(c.handHeight);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.headEmitter.reset();
    this.crestEmitter.reset();
    this.geyserEmitter.reset();
    this._releaseBled();

    this._seed = Math.random() * 100;
    this._sign = c.circulation > 0.5 ? 1 : c.circulation < -0.5 ? -1 : Math.random() < 0.5 ? 1 : -1;
    this.pointAt(1, this._center).setY(0);
    // Enter at the near edge of the circle.
    _entry.copy(this._center).addScaledVector(this.direction, -this.radius);
    this._thetaEntry = Math.atan2(_entry.z - this._center.z, _entry.x - this._center.x);
    this._run = 0;
    this._omega = 0;
    this._spin = 0;
    this._flow = 0;
    this._tau = 0;
    this._burst = false;
    this._onRim = false;

    const rs = this._raceState;
    rs.center.copy(this._center);
    rs.seed = this._seed;
    rs.theta0 = this._thetaEntry;
    rs.theta1 = this._thetaEntry;
    const ws = this._wallState;
    ws.center.copy(this._center);
    ws.seed = this._seed;
    ws.height = 0;
    ws.lean = 0;
    ws.break = 0;
    const cs = this._channelState;
    cs.center.copy(this._center).setY(0.012);
    cs.seed = this._seed;
    cs.theta0 = this._thetaEntry;
    cs.theta1 = this._thetaEntry;
    cs.drag = -1;
    cs.splat = 0;
    cs.dry = 0;
    cs.fadeT = 0;
    this._glowState.seed = this._seed;
    this._warpState.center.copy(this._center).setY(0.1);
    this._warpState.strength = 0;

    this.race.visible = false;
    this.wall.visible = false;
    this.channel.visible = false;
    this.glow.visible = true;
    this.warp.visible = false;

    this._syncAll();
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

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    const R = this.radius;

    const head = this._thetaEntry + this._sign * this._run;
    const span = Math.min(this._run, TAU);
    const rs = this._raceState;
    rs.radius = R;
    rs.theta1 = head;
    rs.theta0 = head - this._sign * span;
    rs.flow = this._flow;
    this.raceMaterial.userData.sync(rs);

    const cs = this._channelState;
    cs.radius = R;
    cs.theta1 = head;
    cs.theta0 = this._run >= TAU ? head - this._sign * TAU * 1.001 : this._thetaEntry;
    cs.flow = this._flow;
    this.channelMaterial.userData.sync(cs);

    const ws = this._wallState;
    ws.spin = this._spin;
    this.wallMaterial.userData.sync(ws);
    this.glowMaterial.userData.sync(this._glowState);
    this._warpState.size = R + 0.6;
    this.warpMaterial.userData.sync(this._warpState);

    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const d = this.drops.uniforms;
    d.uGravity.value.set(0, -c.dropGravity, 0);
    d.uStretch.value = c.dropStretch;
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uGlow.value = c.dropGlow * g.glow;
    d.uTurbulence.value = 0.1 * g.turbulence;

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const s = this.spray.uniforms;
    s.uGravity.value.set(0, -c.dropGravity * 0.5, 0);
    s.uStretch.value = c.sprayStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sprayGlow * g.glow;
    s.uTurbulence.value = 0.2 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, c.mistLift * 0.3, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.8 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the throw, then onto the rim                               */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    const toRim = Math.max(c.handForward, this.length - this.radius);
    const gs = this._glowState;

    if (this.front < toRim) {
      /* the bead flung low at the near edge */
      const k = saturate((this.front - c.handForward) / Math.max(0.1, toRim - c.handForward));
      this._handPoint(_hand);
      this._rim(this._thetaEntry, c.raceLift + c.raceThickness, _entry);
      this._head.lerpVectors(_hand, _entry, k);
      this._head.y += Math.sin(Math.PI * k) * c.throwArc;
    } else {
      /* on the rim: it turns and runs */
      if (!this._onRim) this._enterRim();
      this._run = (this.front - toRim) / this.radius;
      this._omega = c.speed * g.speed / this.radius;
      this._rim(this._thetaEntry + this._sign * this._run, c.raceLift + c.raceThickness, this._head);
      this._spin += this._sign * this._omega * dt;
    }
    gs.center.copy(this._head);
    gs.size = c.headBloomSize;
    gs.intensity = 1;

    this._syncAll();
    this._headFx(dt, 1);
    if (this._onRim) this._rimHits();
    this._updateBled(dt);
    this.position.copy(this._head);
  }

  /** The bead hits the rim: a splash, and the groove starts being cut. */
  _enterRim() {
    const c = settings[ID];
    const g = settings.global;
    this._onRim = true;
    this.race.visible = true;
    this.channel.visible = true;
    this._rim(this._thetaEntry, 0.05, _pos);
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * 0.8;
    _emit.spread = 0.9;
    _emit.size = c.dropSize * 1.2;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(40 * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: 1.6,
      life: 0.35,
      width: 0.06,
      intensity: 0.8,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.shake.add(c.raceShake, 8, 20);
  }

  /** Spray flung off the racing head — outward, centrifugal. */
  _headFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.headEmitter.tick(dt, c.headSpray * strength) * g.particleCount);
    if (n <= 0) return;
    const theta = this._thetaEntry + this._sign * this._run;
    this._resetEmit(frame.uTime.value);
    // Tangent plus outward plus up.
    if (this._onRim) {
      _dir.set(-Math.sin(theta) * this._sign, 0, Math.cos(theta) * this._sign)
        .multiplyScalar(0.8)
        .add(_pos.set(Math.cos(theta), 0.55, Math.sin(theta)))
        .normalize();
    } else {
      _dir.copy(this.direction).addScaledVector(_up, 0.4).normalize();
    }
    _emit.position = this._head;
    _emit.radius = c.raceThickness;
    _emit.direction = _dir;
    _emit.speed = c.dropSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.45;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.6) this.drops.emit(1, _emit);
      else this.spray.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — race, wall, fall, burst                                    */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    if (!this._onRim) this._enterRim();
    this._tau = 0;
    this._omega = c.speed * g.speed / this.radius;
    this._burst = false;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const R = this.radius;
    const ws = this._wallState;
    const cs = this._channelState;
    const gs = this._glowState;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;

    if (t <= 1) {
      const bt = dt / Math.max(0.05, g.lifetime);
      this._tau += bt;
      const tau = this._tau;
      const race = Math.max(0.05, c.raceTime);
      const rise = Math.max(0.02, c.riseTime);
      const fall = Math.max(0.05, c.fallTime);

      /* the race: accelerating round the rim */
      const rk = saturate(tau / race);
      if (rk < 1) {
        const top = c.raceSpeedUp * c.speed * g.speed / R;
        this._omega = lerp(c.speed * g.speed / R, top, Easing.inQuad(rk));
      }
      this._run += this._omega * bt;
      this._spin += this._sign * this._omega * bt;
      this._rim(this._thetaEntry + this._sign * this._run, c.raceLift + c.raceThickness, this._head);

      /* the wall stands */
      const wk = saturate((tau - race) / rise);
      const fk = saturate((tau - race - rise) / fall);
      ws.radius = R * (1 - Easing.inCubic(fk));
      ws.height = c.wallHeight * Easing.outBack(wk) * (1 + c.wallClimb * Easing.inQuad(fk)) * (1 - smoothstep(0.85, 1, fk));
      ws.lean = c.wallLean * Easing.inQuad(fk) * Math.min(1, ws.radius / Math.max(0.1, c.wallLean * 1.5) + 0.2);
      ws.break = smoothstep(0.7, 1, fk);
      this.wall.visible = wk > 0 && ws.break < 0.999;
      // The rope sinks into the wall as it stands.
      this.race.visible = wk < 0.6;
      this.raceMaterial.userData.sync(this._raceState);

      /* the ground */
      cs.drag = fk > 0 ? ws.radius : -1;
      cs.splat = this._burst ? c.splatRadius * Easing.outCubic(saturate((tau - race - rise - fall) / 0.3)) : 0;

      /* the warp, running in with the foot of the wall */
      const ws2 = this._warpState;
      ws2.ring = ws.radius / (R + 0.6);
      ws2.strength = fk > 0 && fk < 1 ? 1 : 0;
      this.warp.visible = ws2.strength > 0;

      /* the glow: the head while racing, the meeting at the burst */
      if (fk <= 0) {
        gs.center.copy(this._head);
        gs.size = c.headBloomSize * (1 + 0.5 * rk);
        gs.intensity = 1 - smoothstep(0.3, 1, wk);
      } else {
        gs.center.copy(this._center).setY(0.6);
        gs.size = c.headBloomSize * 3;
        gs.intensity = this._burst ? 2.5 * Math.exp(-(tau - race - rise - fall) * 4) : 0.2 * fk;
      }
      this.glow.visible = gs.intensity > 0.01;

      this._syncAll();
      if (wk <= 0) {
        this._headFx(dt, 1 + rk);
        this._rimHits();
      }
      if (wk > 0 && fk < 1) this._crestFx(dt, wk, fk);
      if (fk > 0 && !this._burst) this._wallHits(ws.radius);
      if (fk >= 1 && !this._burst) this._burstNow();
      if (this._burst) this._geyser(dt, 1 - saturate((tau - race - rise - fall) / Math.max(0.05, c.lingerTime)));
      this._updateBled(dt);

      if (fk > 0) {
        this.position.copy(this._center);
        this.position.y = 1;
      } else {
        this.position.copy(this._head);
      }
      return;
    }

    /* the fade: channel and splat dry and erode */
    const ft = saturate(t - 1);
    this.race.visible = false;
    this.wall.visible = false;
    this.glow.visible = false;
    this.warp.visible = false;
    cs.drag = 0;
    cs.splat = c.splatRadius;
    cs.dry = smoothstep(0, 0.6, ft);
    cs.fadeT = smoothstep(0.45, 1, ft);
    this._syncAll();
    this._updateBled(dt);
    this.position.copy(this._center);
    this.position.y = 0.5;
  }

  /** Droplets flung off the wall's crest — round, out, and finally in. */
  _crestFx(dt, wk, fk) {
    const c = settings[ID];
    const g = settings.global;
    const ws = this._wallState;
    const n = Math.round(this.crestEmitter.tick(dt, c.crestSpray * wk) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    _emit.speed = c.dropSpeed * (0.8 + fk);
    _emit.speedVariance = 0.5;
    _emit.spread = 0.35;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = Math.max(0.05, ws.radius - ws.lean);
      _pos.set(this._center.x + ca * r, ws.height * (0.85 + 0.15 * Math.random()), this._center.z + sa * r);
      // Tangent with the spin, outward while it stands, inward as it falls.
      const out = lerp(0.6, -1.2, fk);
      _dir.set(-sa * this._sign + ca * out, 0.5, ca * this._sign + sa * out).normalize();
      _emit.position = _pos;
      _emit.direction = _dir;
      if (Math.random() < 0.6) this.drops.emit(1, _emit);
      else this.spray.emit(1, _emit);
    }
  }

  /** The wall meets itself in the middle. */
  _burstNow() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._burst = true;

    this.ctx.bursts.spawn(BurstMode.WATER, this._center, {
      radius: 0.3,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: 1.2,
      opacity: 0.85,
      fresnel: 2.2,
      displace: 0.6,
      turbulence: 1.4,
      squash: 1.3,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._center, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.07,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    this._resetEmit(time);
    _emit.position = this._center;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.geyserSpeed;
    _emit.speedVariance = 0.45;
    _emit.spread = 0.3;
    _emit.size = c.dropSize * 1.4;
    _emit.life = c.dropLife * 1.5;
    this.drops.emit(Math.round(c.burstDrops * g.particleCount), _emit);
    _emit.speed = c.geyserSpeed * 1.2;
    _emit.size = c.dropSize * 0.6;
    this.spray.emit(Math.round(c.burstDrops * 0.6 * g.particleCount), _emit);
    _emit.radius = 1;
    _emit.speed = c.mistLift * 2;
    _emit.spread = 1.4;
    _emit.size = c.mistSize * 1.4;
    _emit.life = c.mistLife;
    _emit.spin = 0.6;
    this.mist.emit(Math.round(22 * g.particleCount), _emit);

    this._burstHits();
    this.ctx.shake.add(c.burstShake * power, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.burstFlash * power);
    this.lightBoost = c.lightIntensity * c.burstLight * power;
  }

  /** The geyser keeps spouting a moment after the burst. */
  _geyser(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.geyserEmitter.tick(dt, c.geyserRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = this._center;
    _emit.radius = 0.25;
    _emit.direction = _up;
    _emit.speed = c.geyserSpeed * (0.5 + 0.5 * strength);
    _emit.speedVariance = 0.4;
    _emit.spread = 0.25;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife * 1.2;
    this.drops.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /** Clipped off their feet by the racing head. */
  _rimHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(this._head.x, this._head.z, c.rimHitWidth, this._found);
    if (found.length === 0) return;
    const theta = this._thetaEntry + this._sign * this._run;
    _dir.set(-Math.sin(theta) * this._sign, 0, Math.cos(theta) * this._sign);
    this._force.impulse = c.rimImpulse * g.explosionIntensity;
    this._force.lift = c.rimLift * g.explosionIntensity;
    this._force.spin = c.hitSpin;
    for (const dummy of found) {
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._bleed(dummy, 0.8);
    }
  }

  /** The falling wall drags in everything its foot passes. */
  _wallHits(radius) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(this._center.x, this._center.z, this.radius + 0.5, this._found);
    this._force.impulse = c.dragImpulse * g.explosionIntensity;
    this._force.lift = c.dragLift * g.explosionIntensity;
    this._force.spin = c.hitSpin;
    for (const dummy of found) {
      const dx = dummy.position.x - this._center.x;
      const dz = dummy.position.z - this._center.z;
      const d = Math.hypot(dx, dz);
      if (d < radius - 0.4) continue; // not reached yet
      _dir.set(-dx, 0, -dz);
      if (d < 1e-3) _dir.set(this.direction.x, 0, this.direction.z);
      _dir.normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._bleed(dummy, 0.8);
    }
  }

  /** What is left in the middle goes up with the geyser. */
  _burstHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(this._center.x, this._center.z, this.radius, this._found);
    this._force.impulse = c.burstImpulse * g.explosionIntensity;
    this._force.lift = c.burstLift * g.explosionIntensity;
    this._force.spin = c.hitSpin * 1.5;
    for (const dummy of found) {
      _dir.set(dummy.position.x - this._center.x, 0, dummy.position.z - this._center.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(this.direction.x, 0, this.direction.z);
      _dir.normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._bleed(dummy, 1.2);
    }
  }

  _bleed(dummy, scale) {
    const c = settings[ID];
    const g = settings.global;
    if (this._bledCount < MAX_BLED) {
      const slot = this._bled[this._bledCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.emitter.reset();
    }
    this._resetEmit(frame.uTime.value);
    _pos.copy(dummy.position).setY(1.0);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed;
    _emit.spread = 0.8;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(24 * scale * g.particleCount), _emit);
    this.spray.emit(Math.round(12 * scale * g.particleCount), _emit);
  }

  _updateBled(dt) {
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorBledBody;
    look.rimColor = c.colorBledRim;
    look.rimEmissive = c.bledRimGlow;
    look.edgeColor = c.colorBledRim;
    look.edgeEmissive = c.bledRimGlow;
    look.edgeWidth = 0.05;
    const time = frame.uTime.value;
    for (let i = 0; i < this._bledCount; i++) {
      const slot = this._bled[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / 0.5) * c.bledStain, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.bleedTime));
      const n = Math.round(slot.emitter.tick(dt, c.bleedDrops * left) * g.particleCount);
      if (n <= 0) continue;
      const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
      this._resetEmit(time);
      _emit.position = at;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = 0.6;
      _emit.spread = 1;
      _emit.size = c.dropSize * 0.8;
      _emit.life = c.dropLife;
      this.drops.emit(n, _emit);
    }
  }

  _releaseBled() {
    for (let i = 0; i < this._bledCount; i++) this._bled[i].dummy = null;
    this._bledCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.race.visible = false;
    this.wall.visible = false;
    this.channel.visible = false;
    this.glow.visible = false;
    this.warp.visible = false;
    this._releaseBled();
  }

  dispose() {
    this.tubeGeometry.dispose();
    this.wallGeometry.dispose();
    this.quadGeometry.dispose();
    this.raceMaterial.dispose();
    this.wallMaterial.dispose();
    this.channelMaterial.dispose();
    this.glowMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◎  Hemorrhage Ring');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 4, 90, 0.5, 'throw & race speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'stains dry over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const throwF = folder.addFolder('1 · The throw');
  R(throwF, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(throwF, c, 'handSide', -1, 1, 0.01, 'hand to the right (m)');
  R(throwF, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(throwF, c, 'throwArc', -1, 4, 0.01, 'arc (m)');
  R(throwF, c, 'circulation', -1, 1, 1, 'runs (−1 cw · 0 random · 1 ccw)');

  const race = folder.addFolder('2 · The race');
  R(race, c, 'raceTime', 0.05, 4, 0.01, 'races for (s)');
  R(race, c, 'raceSpeedUp', 0.2, 6, 0.01, 'speeds up to (×)');
  R(race, c, 'raceThickness', 0.02, 0.8, 0.005, 'rope radius (m)');
  R(race, c, 'raceSquash', 0.2, 1.5, 0.01, 'rope height (× radius)');
  R(race, c, 'raceLift', -0.3, 1, 0.01, 'lift (m)');
  R(race, c, 'headBulb', 0, 3, 0.01, 'head swell');
  R(race, c, 'raceWobble', 0, 0.8, 0.01, 'wobble');
  R(race, c, 'flowSpeed', 0, 40, 0.1, 'flow speed');
  R(race, c, 'streakScale', 0.1, 8, 0.05, 'streak scale');
  R(race, c, 'raceGlow', 0, 8, 0.05, 'streak glow');
  R(race, c, 'headGlow', 0, 10, 0.05, 'head glow');
  R(race, c, 'headBloomSize', 0.05, 3, 0.01, 'head bloom (m)');
  R(race, c, 'headBloom', 0, 8, 0.05, 'head bloom strength');
  R(race, c, 'headSpray', 0, 600, 1, 'spray/second off the head');
  R(race, c, 'raceShake', 0, 1, 0.01, 'knock when it hits the rim');

  const wall = folder.addFolder('3 · The wall');
  R(wall, c, 'riseTime', 0.02, 2, 0.01, 'stands up over (s)');
  R(wall, c, 'wallHeight', 0.2, 8, 0.05, 'height (m)');
  R(wall, c, 'crestTear', 0, 2, 0.01, 'crest tear');
  R(wall, c, 'crestFoam', 0, 2, 0.01, 'crest foam');
  R(wall, c, 'wallStreakScale', 0.2, 10, 0.05, 'streak scale');
  R(wall, c, 'wallGlow', 0, 8, 0.05, 'glow');
  R(wall, c, 'wallOpacity', 0, 1, 0.01, 'opacity');
  R(wall, c, 'crestSpray', 0, 800, 1, 'crest spray/second');

  const fall = folder.addFolder('4 · The fall');
  R(fall, c, 'fallTime', 0.05, 3, 0.01, 'falls in over (s)');
  R(fall, c, 'wallLean', 0, 4, 0.01, 'crest leans in (m)');
  R(fall, c, 'wallClimb', 0, 3, 0.01, 'climbs as it narrows (×)');
  R(fall, c, 'implodeWarp', 0, 4, 0.01, 'air rushing in');
  R(fall, c, 'lingerTime', 0.05, 3, 0.01, 'geyser lingers (s)');
  R(fall, c, 'geyserSpeed', 0, 30, 0.1, 'geyser speed');
  R(fall, c, 'geyserRate', 0, 600, 1, 'geyser drops/second');
  R(fall, c, 'burstDrops', 0, 600, 1, 'burst drops');
  R(fall, c, 'burstSize', 0, 8, 0.05, 'burst dome (m)');
  R(fall, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(fall, c, 'burstShake', 0, 1.5, 0.01, 'camera knock');
  R(fall, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(fall, c, 'burstFlash', 0, 1, 0.01, 'flash');
  R(fall, c, 'burstLight', 0, 8, 0.01, 'light punch (× intensity)');
  fall.addColor(c, 'colorBurstA').name('burst inner');
  fall.addColor(c, 'colorBurstB').name('burst mid');
  fall.addColor(c, 'colorBurstC').name('burst outer');
  fall.addColor(c, 'colorShockA').name('shockwave');
  fall.addColor(c, 'colorShockB').name('shockwave hot');
  fall.addColor(c, 'colorFlash').name('flash');

  const ground = folder.addFolder('5 · Channel & stains');
  R(ground, c, 'grooveWidth', 0.03, 1, 0.005, 'groove half-width (m)');
  R(ground, c, 'dragMarks', 1, 48, 1, 'drag marks');
  R(ground, c, 'splatRadius', 0, 5, 0.05, 'splat (m)');
  R(ground, c, 'channelGlow', 0, 8, 0.05, 'glow');
  R(ground, c, 'channelOpacity', 0, 1, 0.01, 'opacity');
  ground.addColor(c, 'colorGroove').name('groove');
  ground.addColor(c, 'colorChannelBlood').name('blood');
  ground.addColor(c, 'colorDry').name('dried');

  const blood = folder.addFolder('6 · Blood');
  R(blood, c, 'gloss', 0, 4, 0.01, 'gloss');
  R(blood, c, 'rimGlow', 0, 4, 0.01, 'rim');
  R(blood, c, 'dropSize', 0.005, 0.4, 0.001, 'drop size');
  R(blood, c, 'dropSpeed', 0, 20, 0.05, 'drop speed');
  R(blood, c, 'dropLife', 0.1, 4, 0.05, 'drop lifetime');
  R(blood, c, 'dropGravity', 0, 30, 0.1, 'drop gravity');
  R(blood, c, 'dropStretch', 0, 1, 0.005, 'drop stretch');
  R(blood, c, 'dropGlow', 0, 4, 0.05, 'drop glow');
  R(blood, c, 'sprayStretch', 0, 1, 0.005, 'spray stretch');
  R(blood, c, 'sprayGlow', 0, 8, 0.05, 'spray glow');
  R(blood, c, 'mistSize', 0.05, 4, 0.01, 'mist size');
  R(blood, c, 'mistLift', 0, 5, 0.01, 'mist rise');
  R(blood, c, 'mistLife', 0.1, 6, 0.05, 'mist lifetime');
  R(blood, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  blood.addColor(c, 'colorBloodDeep').name('deep');
  blood.addColor(c, 'colorBloodBody').name('body');
  blood.addColor(c, 'colorBloodHot').name('hot');
  blood.addColor(c, 'colorBloodRim').name('rim');
  blood.addColor(c, 'colorFoam').name('crest foam');
  blood.addColor(c, 'colorBloomCore').name('bloom core');
  blood.addColor(c, 'colorBloomHalo').name('bloom halo');
  Editor.gradient(blood, c, 'colorDrop', 'drop gradient');
  Editor.gradient(blood, c, 'colorSpray', 'spray gradient');
  Editor.gradient(blood, c, 'colorMist', 'mist gradient');

  const hits = folder.addFolder('7 · Hits');
  R(hits, c, 'rimHitWidth', 0.1, 3, 0.01, 'head clips within (m)');
  R(hits, c, 'rimImpulse', 0, 25, 0.1, 'clipped along (m/s)');
  R(hits, c, 'rimLift', 0, 15, 0.05, 'clipped lift');
  R(hits, c, 'dragImpulse', 0, 25, 0.1, 'dragged in (m/s)');
  R(hits, c, 'dragLift', 0, 15, 0.05, 'dragged lift');
  R(hits, c, 'burstImpulse', 0, 20, 0.1, 'burst out (m/s)');
  R(hits, c, 'burstLift', 0, 30, 0.1, 'burst up (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(hits, c, 'bledStain', 0, 1, 0.01, 'stain');
  R(hits, c, 'bleedTime', 0.05, 6, 0.05, 'bleeds for (s)');
  R(hits, c, 'bleedDrops', 0, 200, 1, 'drips/second off a body');
  R(hits, c, 'bledRimGlow', 0, 8, 0.05, 'stain rim glow');
  hits.addColor(c, 'colorBledBody').name('stained body');
  hits.addColor(c, 'colorBledRim').name('stained rim');

  folder.close();
  return folder;
}
