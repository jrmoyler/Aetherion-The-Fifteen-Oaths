import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createSanguineWaveMaterial,
  createSanguineWarpMaterial,
  createSanguineSmearMaterial,
  createSanguineCrownMaterial
} from '../../materials/codex/SanguineTideMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'sanguine';

const TAU = Math.PI * 2;
/** Bodies one wave can carry at once. */
const MAX_GRIPS = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _at = new Vector3();
const _local = new Vector3();
const _crest = new Vector3();
const _floor = new Vector3();
const _right = new Vector3();
const _up = new Vector3(0, 1, 0);
const _p0 = { x: 0, y: 0 };
const _p1 = { x: 0, y: 0 };
const _p2 = { x: 0, y: 0 };
const _p3 = { x: 0, y: 0 };

/**
 * SANGUINE TIDE — blood wells up at the caster's feet and rolls down the line
 * as a breaking wave.
 *
 * A line cast in four beats. **Well-up**: for `wellTime` the front is held at
 * the feet while a pool spreads there and climbs into a low ridge, throwing a
 * ripple and bubbling droplets. **Roll**: the ridge sets off down the line,
 * building to full height over `growDistance`, its lip curling over as it nears
 * the end; whatever it meets it takes off its feet and carries in the crest.
 * **Break**: at the end of the line the lip curls fully over and slams onto the
 * floor ahead, throwing up a crown of blood and driving everything it carried
 * down into the splash. **Linger**: the glossy smear it painted dries on its own
 * clock — matte, browner, then crazed with cracks — and drains into the floor.
 *
 * Eight layers, each a folder in the editor:
 *
 *   1. **the wave** — a flat grid bent in the vertex stage into the breaking
 *      profile (`SanguineTideMaterials`). Its shading is wet blood: deep in the
 *      trough, light glowing through the thin lip, a sharp highlight and the sky
 *      through a fresnel, pink froth (voronoi bubbles) riding the crest. It is
 *      mostly opaque and writes depth, because the curl is drawn over its own
 *      face and an unsorted transparent sheet would draw it inside out.
 *   2. **the lens** — the same profile pushed off its surface onto
 *      `LAYER.DISTORTION`: the skin of the wave wobbles what is behind it.
 *   3. **the smear** — a ground strip that exists only behind the crest, plus
 *      the pool at the feet and the splash pool at the end. Each fragment dries
 *      by the time since the wave passed *it*, so the trail dries from the
 *      caster outward, as it would.
 *   4. **droplets** — non-additive DROPLET beads thrown off the crest and lip
 *      with the wave's own forward speed, heavy, falling back onto the smear.
 *   5. **blood mist** — non-additive SMOKE shed off the crest, lingering red.
 *   6. **froth spray** — additive pink specks off the curling lip, the only
 *      thing that catches the light the way spume does.
 *   7. **the break** — the crown (a ring sheet torn into fingers with a bead at
 *      each tip), a WATER burst tinted blood, a ripple ring, a shockwave, the
 *      crown's droplets, a knock on the camera and a punch of red light.
 *   8. **the catch** — `handlesOwnHits`. A body inside the crest's reach is
 *      knocked off its feet *forward* and handed to a velocity field that keeps
 *      it riding just ahead of the crest at `carryHeight` of the wave, rolled
 *      over by it (the field runs faster at the top than the bottom), pulled to
 *      the middle, soaked red as it rides (`dummy.corrode`). When the lip lands,
 *      one frame of a hard downward current slams it into the splash and the
 *      grip is released.
 *
 * ## The editor rule
 *
 * A cast captures a seed and integrates the surface flow; every dimension is
 * resolved from `settings.sanguine` each frame, so the wave can be reshaped,
 * recoloured or slowed while it is rolling and the smear's drying re-times
 * itself live.
 */
export class SanguineTideAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The wave picks its own catch, carries it, and decides when it lands. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies carried this cast. HUD readout only. */
  get instanceCount() {
    return this._carried;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 + 2: one profile grid, drawn twice ---- */
    this.waveGeometry = new PlaneGeometry(1, 1, 72, 64);
    this.waveMaterial = createSanguineWaveMaterial();
    this.wave = new Mesh(this.waveGeometry, this.waveMaterial);
    this.wave.name = 'SanguineWave';
    this.wave.layers.set(LAYER.VFX);
    this.wave.renderOrder = 6;
    this.wave.frustumCulled = false;
    this.wave.visible = false;
    this.group.add(this.wave);

    this.warpMaterial = createSanguineWarpMaterial();
    this.warp = new Mesh(this.waveGeometry, this.warpMaterial);
    this.warp.name = 'SanguineLens';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /* ---- layer 3: the smear ---- */
    this.smearGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.smearMaterial = createSanguineSmearMaterial();
    this.smear = new Mesh(this.smearGeometry, this.smearMaterial);
    this.smear.name = 'SanguineSmear';
    this.smear.layers.set(LAYER.VFX);
    this.smear.renderOrder = 2;
    this.smear.frustumCulled = false;
    this.smear.visible = false;
    this.group.add(this.smear);

    /* ---- layer 7: the crown ---- */
    this.crownGeometry = new PlaneGeometry(1, 1, 120, 14);
    this.crownMaterial = createSanguineCrownMaterial();
    this.crown = new Mesh(this.crownGeometry, this.crownMaterial);
    this.crown.name = 'SanguineCrown';
    this.crown.layers.set(LAYER.VFX);
    this.crown.renderOrder = 7;
    this.crown.frustumCulled = false;
    this.crown.visible = false;
    this.group.add(this.crown);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._waveState = { height: 0.1, curl: 0, slam: 0, flow: 0, dissolve: 0, fade: 1, seed: 0, strength: 0 };
    this._smearState = {
      start: new Vector3(),
      dir: new Vector3(0, 0, 1),
      side: new Vector3(1, 0, 0),
      length: 1,
      backPad: 1,
      width: 1,
      paint: 0,
      poolR: 0,
      poolAt: 0,
      splashAt: 0,
      splashR: 0,
      clock: 0,
      wellTime: 0,
      speed: 1,
      splashTime: 1e5,
      drain: 0,
      seed: 0
    };
    this._crownState = { radius: 0.1, height: 0.01, dissolve: 0, seed: 0 };

    this._seed = 0;
    this._flow = 0;
    /** Metres down the line the crest's foot is. */
    this._along = 0;
    this._prevAlong = 0;
    /** The crest's speed along the line this frame (m/s) — what bodies ride at. */
    this._crestSpeed = 0;
    this._height = 0.1;
    this._slammed = false;
    this._slamTime = 0;
    this._splashAt = 0;
    this._crownAge = -1;
    this._carried = 0;

    /* ---- layer 8: the grip ---- */
    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0 });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** What the carry field reads; written once per frame, never allocated. */
    this._flow3 = { along: 0, speed: 0, height: 1, ahead: 0, pull: 0, centre: 0, roll: 0, match: 1, down: 0, forward: 0 };
    this._carryField = (x, y, z, out) => this._sampleCarry(x, y, z, out);
    this._slamField = (x, y, z, out) => this._sampleSlam(x, y, z, out);
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.12 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 4: droplets ---- */
    this.drops = particles.get('sanguine.drops', {
      capacity: 2600,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uEndSize.value = 0.55;
    this.drops.uniforms.uSizeIn.value = 0.04;
    this.drops.uniforms.uFadeIn.value = 0.03;
    this.drops.uniforms.uFadeOut.value = 0.3;

    /* ---- layer 5: blood mist ---- */
    // Not additive: the mist has to *stain* the air, not light it.
    this.mist = particles.get('sanguine.mist', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uEndSize.value = 1.8;
    this.mist.uniforms.uSizeIn.value = 0.15;
    this.mist.uniforms.uFadeIn.value = 0.12;
    this.mist.uniforms.uFadeOut.value = 0.5;

    /* ---- layer 6: froth spray ---- */
    this.spray = particles.get('sanguine.spray', {
      capacity: 1400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.25
    });
    this.spray.uniforms.uEndSize.value = 0.3;
    this.spray.uniforms.uSizeIn.value = 0.03;
    this.spray.uniforms.uFadeIn.value = 0.04;
    this.spray.uniforms.uFadeOut.value = 0.5;
    this.spray.uniforms.uDrag.value = 1.6;

    this.dropEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.sprayEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the break: curl, slam, collapse. */
  get impactDuration() {
    return Math.max(0.1, settings.sanguine.breakTime * settings.global.lifetime);
  }

  /** The fade is the smear drying, cracking and draining. */
  get fadeDuration() {
    return Math.max(0.2, settings.sanguine.lifetime * settings.global.lifetime);
  }

  /** A slow double beat — a pulse under the surface. */
  lightShimmer() {
    const f = settings.sanguine.lightFlicker;
    const beat = Math.pow(Math.max(0, Math.sin(this.age * 7.2)), 8) + 0.6 * Math.pow(Math.max(0, Math.sin(this.age * 7.2 - 0.9)), 8);
    return 1 - f + f * (0.5 + beat);
  }

  /**
   * The front is held at the feet while the blood wells up, then rolls. The
   * base class eases off a standstill keyed to `age`; this keys it to the end
   * of the well-up instead, or the wave would leave at full speed.
   */
  advance(dt) {
    const c = settings.sanguine;
    const well = Math.max(0, c.wellTime);
    if (this.age < well) {
      this.pointAt(0, this.position);
      return false;
    }
    const speed = c.speed * settings.global.speed;
    const ease = Easing.outQuad(saturate((this.age - well) / 0.18));
    this.front += speed * ease * dt;
    const previousU = this.u;
    this.u = saturate(this.front / this.length);
    this.pointAt(this.u, this.position);
    return this.u >= 1 && previousU < 1;
  }

  /* ------------------------------------------------------------------ */
  /* The profile on the CPU                                              */
  /* ------------------------------------------------------------------ */

  /** The CPU twin of `waveEnvelope` in SanguineTideMaterials. */
  _env(u) {
    const c = settings.sanguine;
    return Math.pow(Math.max(1 - Math.pow(Math.min(1, Math.abs(u)), Math.max(c.waveShoulder, 0.5)), 0), Math.max(c.waveTaper, 0.05));
  }

  /**
   * A point on the profile's front half at across `u` and `t` (0 crest .. 1
   * lip) in the wave's local frame (+Z travel, +Y up). The CPU twin of the
   * front segment of `wavePoint` (the crest jag is left out).
   */
  _frontLocal(u, t, out) {
    const c = settings.sanguine;
    const s = this._waveState;
    const env = this._env(u);
    const h = this._height * env;
    const face = Math.max(0.05, c.waveFace) * lerp(0.3, 1, env);
    const curl = saturate(s.curl * (1.12 - 0.35 * u * u));
    const reach = c.slamReach * lerp(0.4, 1, env);
    _p0.x = 0;
    _p0.y = h;
    _p1.x = lerp(lerp(face * 0.35, h * 0.55, curl), h * 0.55 + reach * 0.3, s.slam);
    _p1.y = lerp(lerp(h, h * 1.1, curl), h * 0.72, s.slam);
    _p2.x = lerp(lerp(face * 0.85, h, curl), h * 0.85 + reach * 0.8, s.slam);
    _p2.y = lerp(lerp(h * 0.45, h * 0.78, curl), h * 0.22, s.slam);
    _p3.x = lerp(lerp(face, h * 0.62, curl), h * 0.5 + reach, s.slam);
    _p3.y = lerp(lerp(0, h * 0.3, curl), 0, s.slam);
    const k = 1 - t;
    const a = k * k * k;
    const b = 3 * k * k * t;
    const d = 3 * k * t * t;
    const e = t * t * t;
    const z = a * _p0.x + b * _p1.x + d * _p2.x + e * _p3.x - c.waveSweep * c.waveHalfWidth * u * u;
    const y = a * _p0.y + b * _p1.y + d * _p2.y + e * _p3.y;
    return out.set(u * c.waveHalfWidth, y, z);
  }

  /** Local → world, from the crest's foot and the line's frame. */
  _toWorld(local, out) {
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, this._along + local.z)
      .addScaledVector(_right, local.x)
      .addScaledVector(_up, local.y);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.sanguine;
    const g = settings.global;

    this.dropEmitter.reset();
    this.mistEmitter.reset();
    this.sprayEmitter.reset();
    this._releaseGrips();

    this._seed = Math.random() * 100;
    this._flow = 0;
    this._along = Math.max(0, c.wellOffset);
    this._prevAlong = this._along;
    this._crestSpeed = 0;
    this._height = 0.05;
    this._slammed = false;
    this._slamTime = 0;
    this._splashAt = this.length;
    this._crownAge = -1;
    this._carried = 0;

    // Local +X of the wave in the world: a yaw of atan2(dir.x, dir.z) sends
    // local +Z down the line and local +X to (dir.z, 0, -dir.x).
    _right.set(this.direction.z, 0, -this.direction.x);

    const ws = this._waveState;
    ws.seed = this._seed;
    ws.curl = 0;
    ws.slam = 0;
    ws.dissolve = 0;
    ws.fade = 1;
    ws.flow = 0;
    this._crownState.seed = this._seed;
    this._crownState.dissolve = 0;
    this._smearState.seed = this._seed;
    this._smearState.splashTime = 1e5;
    this._smearState.splashR = 0;
    this._smearState.drain = 0;

    const yaw = Math.atan2(this.direction.x, this.direction.z);
    this.wave.rotation.set(0, yaw, 0);
    this.warp.rotation.set(0, yaw, 0);
    this.wave.visible = true;
    this.warp.visible = true;
    this.smear.visible = true;
    this.crown.visible = false;

    /* the pool opens at the feet with a ripple */
    _floor.copy(this.origin).addScaledVector(this.direction, 0.3);
    _floor.y = 0;
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: c.poolRadius * 1.8,
      life: Math.max(0.2, c.wellTime * 2.2),
      intensity: c.wellRipple,
      colorA: getColor(c.colorRipple),
      colorB: getColor(c.colorRippleHot)
    });

    this._sync(0, 0);
    // A beat of anticipation the camera feels.
    this.ctx.shake.add(c.travelRumble * 0.8, 5, 9);
    this._wellBubbles(Math.round(c.wellBubbles * 0.35 * g.particleCount));
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

  /** Droplets bubbling up out of the pool at the feet. */
  _wellBubbles(count) {
    if (count <= 0) return;
    const c = settings.sanguine;
    this._resetEmit(frame.uTime.value);
    _pos.copy(this.origin).addScaledVector(this.direction, 0.4).setY(0.1);
    _emit.position = _pos;
    _emit.radius = c.poolRadius * 0.6;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * 0.55;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.45;
    _emit.size = c.dropSize;
    _emit.life = c.dropLifetime * 0.8;
    this.drops.emit(count, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve every material from settings.
   * @param {number} breakT 0 rolling .. 1 broken (the impact phase)
   * @param {number} fadeT 0..1 through the linger
   */
  _sync(breakT, fadeT) {
    const c = settings.sanguine;
    const g = settings.global;
    const ws = this._waveState;

    /* the wave's height: climbing in the well-up, building with distance, collapsing in the break */
    const well = Math.max(0.01, c.wellTime);
    const rise = Math.min(1, this.age / well);
    const built = lerp(c.riseStart * Easing.outCubic(rise), 1, smoothstep(0, Math.max(0.1, c.growDistance), this.front));
    const collapse = smoothstep(c.slamAt * 0.6, 1, breakT);
    this._height = Math.max(0.03, c.waveHeight * built * (1 - 0.8 * collapse));

    ws.height = this._height;
    ws.curl = breakT > 0 ? 1 : c.curlTravel + (1 - c.curlTravel) * smoothstep(1 - Math.max(0.01, c.curlLead), 1, this.u);
    ws.slam = smoothstep(c.slamAt * 0.5, Math.max(0.01, c.slamAt), breakT);
    ws.flow = this._flow;
    ws.dissolve = smoothstep(c.slamAt, 1, breakT);
    ws.fade = fadeT > 0 ? 0 : 1;
    ws.strength = (1 - ws.dissolve) * Math.min(1, this.age / well);
    this.waveMaterial.userData.sync(ws);
    this.warpMaterial.userData.sync(ws);

    // The crest's foot rides the line.
    this.pointAt(Math.min(3, this._along / this.length), _crest);
    _crest.y = 0;
    this.wave.position.copy(_crest);
    this.warp.position.copy(_crest);

    /* the smear */
    const sm = this._smearState;
    const back = Math.max(0.5, c.poolRadius * 1.4 + 0.5);
    sm.start.copy(this.origin);
    sm.dir.copy(this.direction);
    sm.side.copy(_right);
    sm.backPad = back;
    sm.length = this.length + c.breakDrift + c.slamReach + c.waveHeight + c.splashRadius * 1.7 + back;
    sm.width = 2 * Math.max(c.smearWidth * (1 + c.smearEdgeNoise) + 0.9, c.splashRadius * 1.5, c.poolRadius * 1.3, 1);
    sm.paint = this._along;
    sm.poolR = c.poolRadius * Easing.outCubic(rise);
    sm.poolAt = 0.3;
    sm.splashAt = this._splashAt;
    sm.splashR = this._crownAge >= 0 ? c.splashRadius * Easing.outCubic(saturate(this._crownAge / 0.45)) : 0;
    sm.clock = this.age;
    sm.wellTime = c.wellTime;
    sm.speed = c.speed * g.speed;
    sm.splashTime = this._slammed ? this._slamTime : 1e5;
    sm.drain = smoothstep(1 - saturate(c.drainShare), 1, fadeT);
    this.smearMaterial.userData.sync(sm);

    /* the particles' looks */
    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const d = this.drops.uniforms;
    d.uGravity.value.set(0, -c.dropGravity, 0);
    d.uDrag.value = c.dropDrag;
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uStretch.value = 0.35;
    d.uTurbulence.value = 0.05 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, c.mistRise, 0);
    m.uDrag.value = c.mistDrag;
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = c.mistTurbulence * g.turbulence;

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const s = this.spray.uniforms;
    s.uGravity.value.set(0, -c.dropGravity * 0.5, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sprayGlow * g.glow;
    s.uTurbulence.value = 0.4 * g.turbulence;

    /* the stain a carried body takes */
    const look = this._look;
    look.color = c.colorStain;
    look.rimColor = c.colorStainRim;
    look.rimEmissive = c.stainRimGlow;
    look.edgeColor = c.colorStainEdge;
    look.edgeEmissive = c.stainEdgeGlow;
    look.edgeWidth = settings.dummies.look.edgeWidth;
  }

  /** The surface streams; integrated so the slider never snaps. */
  _advance(dt) {
    const c = settings.sanguine;
    this._flow += c.surfaceFlow * dt * settings.global.noiseSpeed;
  }

  /* ------------------------------------------------------------------ */
  /* Travel                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.sanguine;
    const g = settings.global;
    this._advance(dt);

    const start = Math.max(0, Math.min(c.wellOffset, this.length * 0.5));
    this._prevAlong = this._along;
    this._along = start + (this.length - start) * this.u;
    this._crestSpeed = dt > 0 ? (this._along - this._prevAlong) / dt : 0;
    this._sync(0, 0);

    const welling = this.age < c.wellTime;
    if (welling) {
      // The pool climbing: bubbles and a low rumble.
      const n = Math.round(this.dropEmitter.tick(dt, c.wellBubbles * 2.2) * g.particleCount);
      this._wellBubbles(n);
      this.ctx.shake.rumble(c.travelRumble * 0.6, dt);
    } else {
      this._rollFx(dt, 1);
      this.ctx.shake.rumble(c.travelRumble, dt);
    }

    this._catch();
    this._carry(dt, 1);
    this._placeLight();
  }

  _placeLight() {
    const c = settings.sanguine;
    this.pointAt(Math.min(3, this._along / this.length), this.position);
    this.position.y = this._height * c.lightHeight;
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the wave breaks                                            */
  /* ------------------------------------------------------------------ */

  onImpact() {
    // The break is a process, not an instant: the curl closes over and the lip
    // falls during the first part of the impact phase (`onFade`), and the slam
    // fires the frame it lands. All that happens here is a shudder as the
    // wave rears up.
    const c = settings.sanguine;
    this.ctx.shake.add(c.impactShake * 0.25, 4, 10);
    this.lightBoost = c.lightIntensity * 0.4;
  }

  /** The lip lands: crown, splash, shock, and the catch driven into the floor. */
  _slam() {
    const c = settings.sanguine;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._slammed = true;
    this._slamTime = this.age;

    // Where the lip lands: ahead of the crest by the reach.
    this._splashAt = this._along + this._height * 0.5 + c.slamReach;
    this.pointAt(this._splashAt / this.length, _floor);
    _floor.y = 0;

    this.crown.position.copy(_floor);
    this.crown.visible = true;
    this._crownAge = 0;

    /* the wet shell, squashed onto the floor */
    _pos.copy(_floor).setY(0.3);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.55,
      intensity: c.burstIntensity,
      opacity: 0.7,
      fresnel: 2.0,
      displace: 0.4,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: c.rippleRadius * power,
      life: 1.1,
      intensity: 1,
      colorA: getColor(c.colorRipple),
      colorB: getColor(c.colorRippleHot)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.5,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorShockHot)
    });

    /* the crown's droplets: up and out off the rim */
    this._resetEmit(time);
    const count = Math.round(c.splashDrops * g.particleCount);
    _emit.speedVariance = 0.45;
    _emit.size = c.dropSize * 1.15;
    _emit.sizeVariance = 0.6;
    _emit.life = c.dropLifetime * 1.2;
    _emit.lifeVariance = 0.4;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = c.crownRadius * (0.6 + 0.5 * Math.random());
      _pos.copy(_floor).addScaledVector(_right, ca * r).addScaledVector(this.direction, sa * r);
      _pos.y = 0.15 + Math.random() * c.crownHeight * 0.6;
      // Biased forward: the wave was going that way.
      _dir.copy(_right).multiplyScalar(ca).addScaledVector(this.direction, sa + 0.5).addScaledVector(_up, 1.2 + Math.random()).normalize();
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = c.splashDropSpeed;
      this.drops.emit(1, _emit);
    }

    /* mist and spume thrown up with it */
    this._resetEmit(time);
    _pos.copy(_floor).setY(0.5);
    _emit.position = _pos;
    _emit.anchor = _floor;
    _emit.radius = c.crownRadius;
    _emit.direction = _up;
    _emit.speed = 1.6;
    _emit.spread = 0.9;
    _emit.size = c.mistSize * 1.3;
    _emit.life = c.mistLifetime;
    _emit.spin = 0.5;
    this.mist.emit(Math.round(c.splashMist * g.particleCount), _emit);
    _emit.anchor = null;
    _emit.speed = c.spraySpeed * 1.8;
    _emit.size = c.spraySize * 1.2;
    _emit.life = c.sprayLifetime * 1.3;
    _emit.spread = 0.7;
    this.spray.emit(Math.round(c.sprayRate * 0.5 * g.particleCount), _emit);

    /* the catch, slammed down into the splash */
    const f = this._flow3;
    f.down = c.slamDown * power;
    f.forward = c.slamForward * power;
    for (let i = 0; i < this._gripCount; i++) {
      const dummy = this._grips[i].dummy;
      if (dummy && !dummy.finished && dummy.bodyPoint(_at)) dummy.carry(this._slamField, 1, 1, 0);
    }
    this._releaseGrips();

    /* and whatever was standing where it landed */
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      const found = field.findTargets(_floor.x, _floor.z, c.slamRadius, this._found);
      this._force.impulse = c.slamForward * power;
      this._force.lift = c.catchLift * 0.4;
      this._force.spin = c.catchSpin;
      for (const dummy of found) {
        if (dummy.kill(this.direction.x, this.direction.z, this._force)) {
          dummy.corrode(c.stain * 0.6, this._look);
          this._carried++;
        }
      }
    }

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  onFade(dt, t) {
    const c = settings.sanguine;
    const g = settings.global;
    this._advance(dt);
    if (this._crownAge >= 0) this._crownAge += dt;

    if (t <= 1) {
      // Rolls on past the target as it breaks.
      this._prevAlong = this._along;
      this._along = this.length + c.breakDrift * Easing.outCubic(t);
      this._crestSpeed = dt > 0 ? (this._along - this._prevAlong) / dt : 0;
      this._sync(t, 0);
      if (!this._slammed && t >= c.slamAt) this._slam();

      // Spume and droplets keep coming off the lip until it lands, then die off.
      const strength = this._slammed ? 1 - smoothstep(c.slamAt, Math.min(1, c.slamAt + 0.3), t) : 1;
      if (strength > 0.01) this._rollFx(dt, strength);
      if (!this._slammed) {
        this._catch();
        this._carry(dt, 1);
      }
      this._syncCrown();
      this._placeLight();
      return;
    }

    /* the linger: the wave is gone; the smear dries, cracks and drains */
    const ft = saturate(t - 1);
    this.wave.visible = false;
    this.warp.visible = false;
    this._sync(1, Math.max(1e-4, ft));
    this._syncCrown();
    // A last few droplets falling from where the crown stood.
    if (this._crownAge >= 0 && this._crownAge < c.crownTime) {
      const n = Math.round(this.dropEmitter.tick(dt, c.dropRate * 0.25 * (1 - ft)) * g.particleCount);
      if (n > 0) {
        this._resetEmit(frame.uTime.value);
        _pos.copy(this.crown.position).setY(this._crownState.height * 0.9);
        _emit.position = _pos;
        _emit.radius = this._crownState.radius * 0.8;
        _emit.direction = _up;
        _emit.speed = 0.6;
        _emit.spread = 1;
        _emit.size = c.dropSize;
        _emit.life = c.dropLifetime * 0.6;
        this.drops.emit(n, _emit);
      }
    }
    this._placeLight();
  }

  /** The crown climbs, flares, then falls back into the splash. */
  _syncCrown() {
    if (this._crownAge < 0) return;
    const c = settings.sanguine;
    const k = saturate(this._crownAge / Math.max(0.1, c.crownTime * settings.global.lifetime));
    if (k >= 1) {
      this.crown.visible = false;
      return;
    }
    const cs = this._crownState;
    cs.radius = c.crownRadius * lerp(0.45, 1, Easing.outCubic(saturate(k * 2.2))) + c.crownSpread * Easing.outQuad(k);
    cs.height = c.crownHeight * Easing.outCubic(saturate(k * 3.2)) * (1 - Easing.inQuad(saturate((k - 0.3) / 0.7)));
    cs.dissolve = smoothstep(0.4, 1, k);
    this.crownMaterial.userData.sync(cs);
  }

  /* ------------------------------------------------------------------ */
  /* Effects while it rolls                                              */
  /* ------------------------------------------------------------------ */

  /** Droplets off the crest, mist off the back, spume off the lip. */
  _rollFx(dt, strength) {
    const c = settings.sanguine;
    const g = settings.global;
    const time = frame.uTime.value;
    const speed = Math.max(0, this._crestSpeed);
    const lipT = 0.35 + 0.5 * this._waveState.curl;

    /* layer 4: beads off the crest and lip, carrying the wave's own speed */
    const drops = Math.round(this.dropEmitter.tick(dt, c.dropRate * strength) * g.particleCount);
    if (drops > 0) {
      this._resetEmit(time);
      _emit.size = c.dropSize;
      _emit.sizeVariance = 0.55;
      _emit.life = c.dropLifetime;
      _emit.lifeVariance = 0.4;
      _emit.speedVariance = 0;
      for (let n = 0; n < drops; n++) {
        const u = (Math.random() * 2 - 1) * 0.9;
        this._frontLocal(u, Math.random() * lipT, _local);
        this._toWorld(_local, _pos);
        const throwSpeed = c.dropSpeed * (0.5 + Math.random() * 0.7);
        _vel.copy(this.direction).multiplyScalar(speed * 0.85 + throwSpeed * (1 - c.dropLift))
          .addScaledVector(_up, throwSpeed * c.dropLift)
          .addScaledVector(_right, u * throwSpeed * 0.35 + (Math.random() - 0.5) * 1.2 * g.randomness);
        const v = _vel.length();
        _emit.position = _pos;
        _emit.direction = v > 1e-4 ? _dir.copy(_vel).divideScalar(v) : _up;
        _emit.speed = v;
        this.drops.emit(1, _emit);
      }
    }

    /* layer 5: mist shed off the crest, left hanging behind it */
    const puffs = Math.round(this.mistEmitter.tick(dt, c.mistRate * strength) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      _emit.size = c.mistSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.4;
      _emit.spread = 0.6;
      for (let n = 0; n < puffs; n++) {
        const u = (Math.random() * 2 - 1) * 0.85;
        this._frontLocal(u, Math.random() * 0.3, _local);
        this._toWorld(_local, _pos);
        _pos.addScaledVector(this.direction, -Math.random() * 1.2);
        _emit.position = _pos;
        _emit.anchor = _pos;
        _emit.direction = _dir.copy(this.direction).multiplyScalar(0.25).add(_up).normalize();
        _emit.speed = 0.6 + speed * 0.15;
        this.mist.emit(1, _emit);
      }
    }

    /* layer 6: pink spume off the lip */
    const spume = Math.round(this.sprayEmitter.tick(dt, c.sprayRate * strength) * g.particleCount);
    if (spume > 0) {
      this._resetEmit(time);
      _emit.size = c.spraySize;
      _emit.sizeVariance = 0.6;
      _emit.life = c.sprayLifetime;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.35;
      for (let n = 0; n < spume; n++) {
        const u = (Math.random() * 2 - 1) * 0.8;
        this._frontLocal(u, lerp(0.05, lipT + 0.15, Math.random()), _local);
        this._toWorld(_local, _pos);
        _vel.copy(this.direction).multiplyScalar(speed * 0.9 + c.spraySpeed).addScaledVector(_up, c.spraySpeed * 0.8);
        const v = _vel.length();
        _emit.position = _pos;
        _emit.direction = _dir.copy(_vel).divideScalar(Math.max(v, 1e-4));
        _emit.speed = v;
        this.spray.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The catch                                                           */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return true;
    return false;
  }

  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    slot.dummy?.release();
    slot.dummy = null;
    slot.time = 0;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
      this._grips[i].time = 0;
    }
    this._gripCount = 0;
  }

  /**
   * Take anything inside the crest's reach. Polled every frame, standing or
   * already down: a corpse in the path of a wave of blood is picked up too.
   */
  _catch() {
    const field = this.ctx.dummies;
    if (!field?.findBodies || this.age < settings.sanguine.wellTime * 0.6) return;
    const c = settings.sanguine;
    const g = settings.global;

    const halfW = c.waveHalfWidth * c.catchWidth;
    const reach = Math.max(c.catchAhead, c.catchBehind);
    const mid = this._along + (c.catchAhead - c.catchBehind) * 0.5;
    this.pointAt(Math.min(3, Math.max(0, mid) / this.length), _floor);
    const found = field.findBodies(_floor.x, _floor.z, Math.hypot(halfW, reach), this._found);
    if (found.length === 0) return;

    this._force.impulse = c.catchImpulse * g.explosionIntensity;
    this._force.lift = c.catchLift * g.explosionIntensity;
    this._force.spin = c.catchSpin;

    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;
      const at = dummy.alive ? dummy.position : dummy.bodyPoint(_at);
      if (!at) continue;
      const dx = at.x - this.origin.x;
      const dz = at.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * _right.x + dz * _right.z;
      if (Math.abs(lat) > halfW) continue;
      if (along > this._along + c.catchAhead || along < this._along - c.catchBehind) continue;

      // Off its feet *forward*: the wave takes it the way it is going.
      if (dummy.alive && !dummy.kill(this.direction.x, this.direction.z, this._force)) continue;
      if (!dummy.bodyPoint(_at)) continue;

      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      this._carried++;
      this._catchFx(_at);
    }
  }

  /** A gout of blood where a body goes into the wave. */
  _catchFx(at) {
    const c = settings.sanguine;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(Math.max(0.4, at.y));
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.copy(this.direction).add(_up).normalize();
    _emit.speed = c.dropSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.size = c.dropSize * 1.2;
    _emit.life = c.dropLifetime * 0.8;
    this.drops.emit(Math.round(30 * g.particleCount), _emit);
    this.ctx.shake.add(c.impactShake * 0.2, 7, 18);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5);
  }

  /**
   * The current inside the crest, sampled per joint of every body carried.
   *
   *  - **ride** — along the line at the crest's own speed, plus a spring onto
   *    a spot just ahead of the crest, so a body caught late catches up and
   *    one caught early is held back.
   *  - **lift** — a spring up to `carryHeight` of the wave at that body's
   *    lateral offset (the shoulders are lower than the middle).
   *  - **roll** — faster along the line above that height than below it,
   *    so the joints at the top overtake the ones at the bottom and the body
   *    tumbles over the crest instead of sliding along it.
   *  - **centre** — a gentle pull toward the middle of the wave.
   */
  _sampleCarry(x, y, z, out) {
    const f = this._flow3;
    const dx = x - this.origin.x;
    const dz = z - this.origin.z;
    const along = dx * this.direction.x + dz * this.direction.z;
    const lat = dx * _right.x + dz * _right.z;
    const env = this._env(lat / Math.max(0.1, settings.sanguine.waveHalfWidth));
    const ry = Math.max(0.35, f.height * env);
    const vAlong = f.speed * f.match + (f.along + f.ahead - along) * f.pull + (y - ry) * f.roll;
    const vY = (ry - y) * f.pull;
    const vLat = -lat * f.centre;
    out.set(
      this.direction.x * vAlong + _right.x * vLat,
      vY,
      this.direction.z * vAlong + _right.z * vLat
    );
  }

  /** The slam: down and on, a little outward. */
  _sampleSlam(x, y, z, out) {
    const f = this._flow3;
    const dx = x - this.origin.x;
    const dz = z - this.origin.z;
    const lat = dx * _right.x + dz * _right.z;
    out.set(
      this.direction.x * f.forward + _right.x * lat * 1.2,
      -f.down,
      this.direction.z * f.forward + _right.z * lat * 1.2
    );
  }

  _carry(dt, hold) {
    if (dt <= 0 || this._gripCount === 0) return;
    const c = settings.sanguine;
    const f = this._flow3;
    f.along = this._along;
    f.speed = Math.max(0, this._crestSpeed);
    f.height = this._height * c.carryHeight;
    f.ahead = c.carryAhead;
    f.pull = c.carryPull;
    f.centre = c.carryCentre;
    f.match = c.carryMatch;
    f.roll = c.carryRoll;

    const grab = saturate(c.carryGrab * dt);
    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || !dummy.bodyPoint(_at)) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      // Eased in, so a body caught is swept up rather than snapped onto a rail.
      const wound = Easing.outCubic(saturate(slot.time / 0.35)) * hold;
      dummy.carry(this._carryField, grab * wound, grab * wound, saturate(c.carryBuoyancy * wound));
      dummy.hold();
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.stainTime)) * c.stain, this._look);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseGrips();
    this.wave.visible = false;
    this.warp.visible = false;
    this.smear.visible = false;
    this.crown.visible = false;
  }

  dispose() {
    this.waveGeometry.dispose();
    this.smearGeometry.dispose();
    this.crownGeometry.dispose();
    this.waveMaterial.dispose();
    this.warpMaterial.dispose();
    this.smearMaterial.dispose();
    this.crownMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1FA78}  Sanguine Tide');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'wave speed (m/s)');
  R(cast, c, 'lifetime', 0.2, 10, 0.05, 'smear lingers (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'heartbeat');
  R(light, c, 'lightHeight', 0, 2, 0.01, 'height (× wave)');

  const well = folder.addFolder('0 · Well-up');
  R(well, c, 'wellTime', 0, 2, 0.01, 'pools for (s)');
  R(well, c, 'wellOffset', 0, 4, 0.01, 'crest born ahead (m)');
  R(well, c, 'poolRadius', 0.1, 5, 0.01, 'pool radius (m)');
  R(well, c, 'wellBubbles', 0, 300, 1, 'bubbles');
  R(well, c, 'wellRipple', 0, 2, 0.01, 'ripple strength');
  R(well, c, 'riseStart', 0, 1, 0.01, 'height as it sets off');
  R(well, c, 'growDistance', 0.1, 20, 0.05, 'full height after (m)');

  const wave = folder.addFolder('1 · Wave');
  const shape = wave.addFolder('Silhouette');
  R(shape, c, 'waveHalfWidth', 0.3, 8, 0.01, 'half-width (m)');
  R(shape, c, 'waveHeight', 0.2, 6, 0.01, 'height (m)');
  R(shape, c, 'waveBack', 0.2, 10, 0.01, 'back slope (m)');
  R(shape, c, 'waveFace', 0.1, 5, 0.01, 'face reach (m)');
  R(shape, c, 'waveShoulder', 0.5, 8, 0.01, 'crest breadth');
  R(shape, c, 'waveTaper', 0.05, 4, 0.01, 'taper to the ends');
  R(shape, c, 'waveSweep', -0.5, 1, 0.005, 'ends trail back');
  R(shape, c, 'crestJag', 0, 0.6, 0.005, 'uneven crest');
  R(shape, c, 'crestJagScale', 0.1, 8, 0.01, 'unevenness scale');
  R(shape, c, 'curlTravel', 0, 1, 0.01, 'curl while rolling');
  R(shape, c, 'curlLead', 0.01, 1, 0.01, 'curls over (× line)');
  R(shape, c, 'surfaceNoise', 0, 0.5, 0.005, 'surface heave (m)');
  R(shape, c, 'surfaceScale', 0.1, 6, 0.01, 'heave scale');
  R(shape, c, 'surfaceFlow', 0, 8, 0.05, 'surface flow');

  const look = wave.addFolder('Shading');
  R(look, c, 'gloss', 4, 400, 1, 'gloss');
  R(look, c, 'specular', 0, 6, 0.01, 'highlight');
  R(look, c, 'envReflect', 0, 3, 0.01, 'sky reflection');
  R(look, c, 'fresnel', 0, 4, 0.01, 'fresnel');
  R(look, c, 'ripple', 0, 2, 0.01, 'fine ripple');
  R(look, c, 'rippleScale', 0.2, 20, 0.1, 'ripple scale');
  R(look, c, 'sss', 0, 5, 0.01, 'light through the lip');
  R(look, c, 'troughDark', 0, 1, 0.01, 'trough darkness');
  R(look, c, 'froth', 0, 2, 0.01, 'crest froth');
  R(look, c, 'frothScale', 0.5, 30, 0.1, 'bubble scale');
  R(look, c, 'frothWidth', 0.01, 0.4, 0.005, 'froth band');
  R(look, c, 'edgeSoft', 0.01, 1, 0.01, 'end softness');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft floor contact (m)');
  R(look, c, 'opacity', 0, 1, 0.01, 'opacity');
  look.addColor(c, 'colorBlood').name('blood');
  look.addColor(c, 'colorDeep').name('trough');
  look.addColor(c, 'colorLip').name('lip glow');
  look.addColor(c, 'colorFroth').name('froth');
  look.addColor(c, 'colorSpec').name('highlight');

  const warp = folder.addFolder('2 · Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpPad', 0, 1.5, 0.01, 'stand-off (m)');
  R(warp, c, 'warpScale', 0.1, 8, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 12, 0.05, 'noise speed');

  const smear = folder.addFolder('3 · Smear');
  R(smear, c, 'smearWidth', 0.1, 6, 0.01, 'half-width (m)');
  R(smear, c, 'smearEdgeNoise', 0, 1, 0.01, 'ragged edges');
  R(smear, c, 'smearEdgeScale', 0.05, 4, 0.01, 'edge scale');
  R(smear, c, 'smearStreaks', 0, 3, 0.01, 'drag streaks');
  R(smear, c, 'smearStreakScale', 0.5, 30, 0.1, 'streak scale');
  R(smear, c, 'splatter', 0, 3, 0.01, 'splatter');
  R(smear, c, 'splatterScale', 0.3, 10, 0.05, 'splatter scale');
  R(smear, c, 'smearGloss', 4, 400, 1, 'gloss');
  R(smear, c, 'smearSpecular', 0, 6, 0.01, 'highlight');
  R(smear, c, 'smearEnv', 0, 3, 0.01, 'sky reflection');
  R(smear, c, 'smearBump', 0, 4, 0.01, 'bump');
  R(smear, c, 'dryDelay', 0, 5, 0.01, 'dries after (s)');
  R(smear, c, 'dryTime', 0.05, 10, 0.05, 'dries over (s)');
  R(smear, c, 'crackStart', 0, 1, 0.01, 'cracks open at');
  R(smear, c, 'crackScale', 0.2, 12, 0.05, 'crack scale');
  R(smear, c, 'crackWidth', 0.005, 0.4, 0.005, 'crack width');
  R(smear, c, 'drainShare', 0.01, 1, 0.01, 'drains over (× linger)');
  R(smear, c, 'drainEdge', 0, 2, 0.01, 'tide line');
  smear.addColor(c, 'colorSmearWet').name('wet');
  smear.addColor(c, 'colorSmearDeep').name('thick');
  smear.addColor(c, 'colorSmearDry').name('dry');
  smear.addColor(c, 'colorCrack').name('cracks');

  const drops = folder.addFolder('4 · Droplets');
  R(drops, c, 'dropRate', 0, 1200, 1, 'per second');
  R(drops, c, 'dropSize', 0.01, 0.4, 0.001, 'size');
  R(drops, c, 'dropSpeed', 0, 20, 0.05, 'throw speed');
  R(drops, c, 'dropLift', 0, 1, 0.01, 'upward share');
  R(drops, c, 'dropLifetime', 0.1, 4, 0.01, 'lifetime');
  R(drops, c, 'dropGravity', 0, 30, 0.1, 'gravity');
  R(drops, c, 'dropDrag', 0, 4, 0.01, 'drag');
  Editor.gradient(drops, c, 'colorDrop', 'droplet gradient');

  const mist = folder.addFolder('5 · Blood mist');
  R(mist, c, 'mistRate', 0, 400, 1, 'per second');
  R(mist, c, 'mistSize', 0.05, 3, 0.01, 'size');
  R(mist, c, 'mistLifetime', 0.1, 6, 0.05, 'lifetime');
  R(mist, c, 'mistOpacity', 0, 1, 0.01, 'opacity');
  R(mist, c, 'mistDrag', 0, 6, 0.01, 'drag');
  R(mist, c, 'mistRise', -2, 4, 0.01, 'rise (m/s)');
  R(mist, c, 'mistTurbulence', 0, 4, 0.01, 'turbulence');
  Editor.gradient(mist, c, 'colorMist', 'mist gradient');

  const spray = folder.addFolder('6 · Froth spray');
  R(spray, c, 'sprayRate', 0, 800, 1, 'per second');
  R(spray, c, 'spraySize', 0.005, 0.3, 0.001, 'size');
  R(spray, c, 'spraySpeed', 0, 15, 0.05, 'speed');
  R(spray, c, 'sprayLifetime', 0.05, 3, 0.01, 'lifetime');
  R(spray, c, 'sprayGlow', 0, 6, 0.01, 'glow');
  Editor.gradient(spray, c, 'colorSpray', 'spray gradient');

  const brk = folder.addFolder('7 · The break');
  R(brk, c, 'breakTime', 0.1, 4, 0.01, 'breaks over (s)');
  R(brk, c, 'breakDrift', 0, 8, 0.05, 'rolls on (m)');
  R(brk, c, 'slamAt', 0.05, 0.95, 0.01, 'lip lands at');
  R(brk, c, 'slamReach', 0, 5, 0.01, 'lip reach (m)');
  R(brk, c, 'crownRadius', 0.1, 5, 0.01, 'crown radius (m)');
  R(brk, c, 'crownSpread', 0, 6, 0.01, 'crown widens (m)');
  R(brk, c, 'crownFlare', 1, 3, 0.01, 'crown flare');
  R(brk, c, 'crownHeight', 0.05, 5, 0.01, 'crown height (m)');
  R(brk, c, 'crownSpikes', 3, 40, 1, 'fingers');
  R(brk, c, 'crownSpikeLength', 0, 2, 0.01, 'finger length');
  R(brk, c, 'crownSharp', 0.2, 8, 0.05, 'finger sharpness');
  R(brk, c, 'crownTime', 0.1, 4, 0.01, 'crown stands (s)');
  R(brk, c, 'splashRadius', 0.1, 8, 0.05, 'splash pool (m)');
  R(brk, c, 'splashDrops', 0, 1000, 1, 'crown droplets');
  R(brk, c, 'splashDropSpeed', 0, 25, 0.1, 'droplet speed');
  R(brk, c, 'splashMist', 0, 200, 1, 'mist');
  R(brk, c, 'burstSize', 0, 12, 0.05, 'wet shell (m)');
  R(brk, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(brk, c, 'rippleRadius', 0, 14, 0.05, 'ripple (m)');
  R(brk, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(brk, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(brk, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(brk, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(brk, c, 'impactLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(brk, c, 'travelRumble', 0, 1, 0.01, 'rumble while rolling');
  brk.addColor(c, 'colorBurstA').name('shell inner');
  brk.addColor(c, 'colorBurstB').name('shell mid');
  brk.addColor(c, 'colorBurstC').name('shell outer');
  brk.addColor(c, 'colorRipple').name('ripple');
  brk.addColor(c, 'colorRippleHot').name('ripple crest');
  brk.addColor(c, 'colorShock').name('shockwave');
  brk.addColor(c, 'colorShockHot').name('shockwave hot');
  brk.addColor(c, 'colorFlash').name('flash');

  const grip = folder.addFolder('8 · The catch');
  R(grip, c, 'catchWidth', 0.1, 2, 0.01, 'reach across (× half-width)');
  R(grip, c, 'catchAhead', 0, 4, 0.01, 'reach ahead (m)');
  R(grip, c, 'catchBehind', 0, 5, 0.01, 'reach behind (m)');
  R(grip, c, 'catchImpulse', 0, 15, 0.05, 'knocked on (m/s)');
  R(grip, c, 'catchLift', 0, 12, 0.05, 'knocked up (m/s)');
  R(grip, c, 'catchSpin', 0, 5, 0.01, 'tumble');
  R(grip, c, 'carryHeight', 0, 1.5, 0.01, 'rides at (× height)');
  R(grip, c, 'carryAhead', -2, 3, 0.01, 'rides ahead (m)');
  R(grip, c, 'carryMatch', 0, 2, 0.01, 'carried at (× speed)');
  R(grip, c, 'carryPull', 0, 20, 0.05, 'pull to spot');
  R(grip, c, 'carryGrab', 0.1, 30, 0.1, 'grip');
  R(grip, c, 'carryBuoyancy', 0, 1, 0.01, 'held up');
  R(grip, c, 'carryCentre', 0, 6, 0.01, 'pull to middle');
  R(grip, c, 'carryRoll', 0, 10, 0.05, 'rolled over');
  R(grip, c, 'slamDown', 0, 40, 0.1, 'slammed down (m/s)');
  R(grip, c, 'slamForward', 0, 20, 0.1, 'thrown on (m/s)');
  R(grip, c, 'slamRadius', 0, 6, 0.05, 'lip strikes (m)');
  R(grip, c, 'stain', 0, 1, 0.01, 'soaked');
  R(grip, c, 'stainTime', 0.05, 4, 0.01, 'soaks over (s)');
  grip.addColor(c, 'colorStain').name('soaked body');
  grip.addColor(c, 'colorStainRim').name('wet rim');
  R(grip, c, 'stainRimGlow', 0, 6, 0.01, 'rim glow');
  grip.addColor(c, 'colorStainEdge').name('dissolve edge');
  R(grip, c, 'stainEdgeGlow', 0, 12, 0.05, 'edge glow');

  folder.close();
  return folder;
}
