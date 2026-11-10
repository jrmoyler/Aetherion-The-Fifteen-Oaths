import { Matrix4, Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createBladeGeometry,
  createTetherGeometry,
  createSmearGeometry,
  createQuadGeometry,
  BLADE_R,
  BLADE_BELLY
} from '../../assets/codex/UmbralGuillotineGeometry.js';
import {
  createBladeMaterial,
  createTetherMaterial,
  createAnchorMaterial,
  createSmearMaterial,
  createSmearWarpMaterial,
  createCleftMaterial,
  createShadowPoolMaterial
} from '../../materials/codex/UmbralGuillotineMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'umbral';

/** Slashes the edge can score into the floor in one cast. */
const MAX_SLASH = 10;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
const _floor = new Vector3();
const _up = new Vector3(0, 1, 0);
const _m = new Matrix4();

/** The crescent's horn angles on its two circles (unit blade). */
const TIP_X = Math.sqrt(BLADE_R * BLADE_R - (BLADE_BELLY / 2) ** 2);
const OUTER_A = Math.atan2(BLADE_BELLY / 2, TIP_X);
const INNER_A = Math.atan2(-BLADE_BELLY / 2, TIP_X);

/**
 * UMBRAL GUILLOTINE — a headsman's crescent of shadow, swung down the line.
 *
 * A line cast. A knot of darkness opens over the line in front of the
 * caster, a black rod drops from it, and on the end of the rod a **crescent
 * blade** forms out of smoke — obsidian, horns up, a razor of white-violet
 * light along its edge — drawn back to one side. Then it is **released**: it
 * swings across the line like the blade in the pit, side to side, while the
 * knot it hangs from rides down the line toward the target. Each stroke
 * leaves a violet **smear** of the arc its edge cut, and where the edge
 * passes the bottom of its swing it scores the floor. Whatever the edge
 * meets is cut in two and thrown the way it swung. At the target it **rears
 * up**, high to one side — and **chops**: down in one stroke, edge first,
 * into the floor, splitting it in a burning gash. It stands there buried a
 * moment, then goes to smoke.
 *
 * Not a scythe spinning flat (that is Nightfall), not a halo or a pendulum
 * cleaver: an executioner's crescent on a swing that is *seen face-on* from
 * behind the caster, because it swings across the line, in the plane the
 * camera looks through.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the blade** (`createBladeMaterial`) — the extruded crescent: black
 *      obsidian, a moving violet bruise, a temper line, an analytic razor
 *      edge, fresnel rim, noise dissolve in and out, a flare at the chop.
 *   2. **the swing** — the tether and the knot at the pivot; the swing itself
 *      is `swingAmp · sin(φ)` with φ integrated, so the rate is live.
 *   3. **the smear** — an annular sector behind the edge (additive) and its
 *      twin on `LAYER.DISTORTION`.
 *   4. **the chop** — rear up, come down, bury; sparks, AIR shell, SHOCKWAVE,
 *      flash, shake, light punch.
 *   5. **the cleft** (`createCleftMaterial`) — the gash in the floor.
 *   6. **smoke & sparks** — black smoke shed off the spine (non-additive),
 *      violet sparks off the edge, a scorch and a spray where it passes low.
 *   8. **the shadow pool** (`createShadowPoolMaterial`) — the linger's body:
 *      the chop spills a disc of near-black shadow out of the cleft (radius
 *      derived from `chopRadius`), tendrils crawling at its lip, violet veins
 *      swirling in toward the blade; violet wisps (additive SOFT) and black
 *      smoke rise off it; the buried blade sinks into it as it dissolves.
 *      Each low pass of the swing also cuts a short glowing slash across the
 *      line (the cleft shader again), so the floor keeps a record of the
 *      swing until the cast goes.
 *   7. **the cut** — `handlesOwnHits`: a body is cut (`kill(…, true)`) when the
 *      edge passes it low, thrown the way the blade is moving; anything on
 *      the line the pivot passes is taken regardless; the chop takes the
 *      target's surroundings.
 */
export class UmbralGuillotineAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies cut. HUD readout only. */
  get instanceCount() {
    return this._cuts;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.bladeGeometry = createBladeGeometry();
    this.tetherGeometry = createTetherGeometry();
    this.smearGeometry = createSmearGeometry(48, 8);
    this.quadGeometry = createQuadGeometry();

    this.poolMaterial = createShadowPoolMaterial();
    this.pool = this._mesh(this.quadGeometry, this.poolMaterial, LAYER.VFX, 1);
    this._poolState = { center: new Vector3(), radius: 3, spread: 0, erode: 0, pulse: 0, seed: 0 };

    this.cleftMaterial = createCleftMaterial();
    this.cleft = this._mesh(this.quadGeometry, this.cleftMaterial, LAYER.VFX, 2);

    /* the slashes scored at each low pass — dice and a birth time only */
    this._slashes = [];
    for (let i = 0; i < MAX_SLASH; i++) {
      const material = createCleftMaterial();
      const mesh = this._mesh(this.quadGeometry, material, LAYER.VFX, 2);
      this._slashes.push({
        mesh,
        material,
        born: -1,
        state: { center: new Vector3(), axis: new Vector3(1, 0, 0), open: 0, heat: 1, erode: 0, seed: 0, halfLength: 1, gash: 0.15, glow: 2 }
      });
    }
    this._slashNext = 0;

    this.bladeMaterial = createBladeMaterial();
    this.blade = this._mesh(this.bladeGeometry, this.bladeMaterial, LAYER.VFX, 6);
    this.blade.matrixAutoUpdate = false;
    this.tetherMaterial = createTetherMaterial();
    this.tether = this._mesh(this.tetherGeometry, this.tetherMaterial, LAYER.VFX, 6);
    this.tether.matrixAutoUpdate = false;
    this.anchorMaterial = createAnchorMaterial();
    this.anchor = this._mesh(this.quadGeometry, this.anchorMaterial, LAYER.VFX, 9);

    this.smearMaterial = createSmearMaterial();
    this.smear = this._mesh(this.smearGeometry, this.smearMaterial, LAYER.VFX, 12);
    this.smearWarpMaterial = createSmearWarpMaterial();
    this.smearWarp = this._mesh(this.smearGeometry, this.smearWarpMaterial, LAYER.DISTORTION, 0);

    this._bladeState = { seed: 0, pulse: 0, dissolve: 1 };
    this._tetherState = { flow: 0, dissolve: 0 };
    this._anchorState = { center: new Vector3(), seed: 0, fade: 0 };
    this._smearState = { pivot: new Vector3(), side: new Vector3(), lead: 0, span: 0, rIn: 4, rOut: 5, strength: 0, seed: 0 };
    this._cleftState = { center: new Vector3(), axis: new Vector3(), open: 0, heat: 1, erode: 0, seed: 0 };

    this._pivot = new Vector3();
    this._edge = new Vector3(); // the edge's lowest point, world
    this._bladeMatrix = new Matrix4();
    this._seed = 0;
    this._phi = 0;
    this._theta = 0;
    this._prevTheta = 0;
    this._omega = 0;
    this._arm = 5;
    this._sign = 1;
    this._thetaEnd = 0;
    this._chopped = false;
    this._cuts = 0;
    this._rear = 1;
    this._prevCross = 0;

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
    this.smoke = particles.get('umbral.smoke', {
      capacity: 1200,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.8
    });
    this.smoke.uniforms.uSizeIn.value = 0.2;
    this.smoke.uniforms.uFadeIn.value = 0.12;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 2.0;
    this.smoke.uniforms.uDrag.value = 1.6;

    this.sparks = particles.get('umbral.sparks', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.4;

    // Rising wisps: violet streaks drawn up off the pool, curling as they go.
    this.wisps = particles.get('umbral.wisps', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      curl: true,
      softFade: 0.4
    });
    this.wisps.uniforms.uSizeIn.value = 0.2;
    this.wisps.uniforms.uFadeIn.value = 0.15;
    this.wisps.uniforms.uFadeOut.value = 0.5;
    this.wisps.uniforms.uEndSize.value = 0.5;
    this.wisps.uniforms.uDrag.value = 0.4;

    this.smokeEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
    this.wispEmitter = new RateEmitter();
    this.poolSmokeEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _chopBeats() {
    const c = settings[ID];
    const raise = Math.max(0.02, c.raiseTime);
    const drop = raise + Math.max(0.02, c.dropTime);
    return { raise, drop, end: drop + Math.max(0.05, c.embedHold) };
  }

  get impactDuration() {
    return Math.max(0.1, this._chopBeats().end * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 11.3) * Math.sin(this.age * 3.9 + 1.1));
  }

  /** The blade forms, drawn back, before the pivot moves. */
  advance(dt) {
    if (this.age < settings[ID].formTime * settings.global.lifetime) return false;
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Placing the blade                                                   */
  /* ------------------------------------------------------------------ */

  /** Pivot at `u` along the line. */
  _pivotAt(u, out) {
    const c = settings[ID];
    const start = Math.min(c.startForward, this.length * 0.5);
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, lerp(start, this.length, u))
      .setY(c.pivotHeight);
  }

  /**
   * Hang the blade from `pivot` at swing angle `theta` on an arm of `arm`
   * metres. Writes `_edge` and the blade's and tether's matrices.
   *
   * The blade's local frame: X along the swing (the edge leads), Y back up
   * the arm, Z along the line — so its face is turned to the caster.
   */
  _place(pivot, theta, arm) {
    const c = settings[ID];
    const size = c.bladeSize;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    _x.copy(this.side).multiplyScalar(ct).addScaledVector(_up, st);
    _y.copy(_up).multiplyScalar(ct).addScaledVector(this.side, -st);
    _z.copy(this.direction).negate();
    this._edge.copy(pivot).addScaledVector(_y, -arm);

    const m = this._bladeMatrix;
    m.makeBasis(_x, _y, _z);
    m.scale(_p.set(size, size, size * c.bladeThickness));
    m.setPosition(this._edge);
    this.blade.matrix.copy(m);
    this.blade.matrixWorldNeedsUpdate = true;

    // The tether: from the belly of the blade to the pivot.
    const len = Math.max(0.05, arm - BLADE_BELLY * size);
    _pos.copy(this._edge).addScaledVector(_y, BLADE_BELLY * size + len * 0.5);
    _m.makeBasis(_x, _y, _z);
    _m.scale(_p.set(c.tetherWidth, len, c.tetherWidth));
    _m.setPosition(_pos);
    this.tether.matrix.copy(_m);
    this.tether.matrixWorldNeedsUpdate = true;
  }

  /** A point on the crescent (unit coords) in the world. */
  _bladePoint(x, y, out) {
    return out.set(x, y, 0).applyMatrix4(this._bladeMatrix);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.smokeEmitter.reset();
    this.sparkEmitter.reset();
    this.wispEmitter.reset();
    this.poolSmokeEmitter.reset();
    this._seed = Math.random() * 100;
    this._sign = Math.random() < 0.5 ? 1 : -1;
    // Drawn back to one side: θ = −amp·sign at the start.
    this._phi = -Math.PI / 2;
    this._theta = -c.swingAmp * this._sign;
    this._prevTheta = this._theta;
    this._omega = 0;
    this._arm = c.armLength;
    this._chopped = false;
    this._cuts = 0;
    this._rear = 1;
    this._prevCross = 0;

    this._bladeState.seed = this._seed;
    this._bladeState.pulse = 0;
    this._bladeState.dissolve = 1;
    this._tetherState.flow = 0;
    this._tetherState.dissolve = 1;
    this._anchorState.seed = this._seed;
    this._anchorState.fade = 0;
    this._smearState.seed = this._seed;
    this._smearState.strength = 0;
    this._cleftState.seed = this._seed;
    this._cleftState.open = 0;
    this._cleftState.erode = 0;
    this._cleftState.heat = 1;

    this.blade.visible = true;
    this.tether.visible = true;
    this.anchor.visible = true;
    this.smear.visible = false;
    this.smearWarp.visible = false;
    this.cleft.visible = false;
    this.pool.visible = false;
    this._poolState.seed = this._seed;
    this._poolState.spread = 0;
    this._poolState.erode = 0;
    this._slashNext = 0;
    for (const sl of this._slashes) {
      sl.born = -1;
      sl.mesh.visible = false;
    }

    this._pivotAt(0, this._pivot);
    this._place(this._pivot, this._theta, this._arm);
    this._sync();
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

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.bladeMaterial.userData.sync(this._bladeState);
    this.tetherMaterial.userData.sync(this._tetherState);
    this._anchorState.center.copy(this._pivot);
    this.anchorMaterial.userData.sync(this._anchorState);

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const s = this.smoke.uniforms;
    s.uGravity.value.set(0, 0.8, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = c.smokeOpacity * g.opacity;
    s.uTurbulence.value = 0.8 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const k = this.sparks.uniforms;
    k.uGravity.value.set(0, -c.sparkGravity, 0);
    k.uStretch.value = c.sparkStretch;
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.sparkGlow * g.glow;
    k.uTurbulence.value = 0.2 * g.turbulence;

    this.wisps.setGradient(getColor(c.colorWispA), getColor(c.colorWispB), getColor(c.colorWispC), getColor(c.colorWispD));
    const w = this.wisps.uniforms;
    w.uGravity.value.set(0, 0.6, 0);
    w.uStretch.value = 0.35;
    w.uSizeScale.value = g.particleSize;
    w.uLifeScale.value = g.particleLifetime;
    w.uSpeedScale.value = g.particleSpeed;
    w.uOpacity.value = g.opacity;
    w.uGlow.value = c.wispGlow * g.glow;
    w.uTurbulence.value = 1.0 * g.turbulence;
  }

  /** The slashes the swing has scored: open fast, cool, erode with the exit. */
  _updateSlashes(ft) {
    const c = settings[ID];
    for (const sl of this._slashes) {
      if (sl.born < 0) continue;
      const since = this.age - sl.born;
      const st = sl.state;
      st.open = Easing.outCubic(saturate(since / 0.1));
      st.heat = lerp(0.3, 1, Math.exp(-since * 2.5)) * (1 - smoothstep(0.3, 1, ft));
      st.erode = smoothstep(0.3, 1, ft);
      st.halfLength = c.slashLength * 0.5;
      st.gash = c.slashWidth;
      st.glow = c.slashGlow;
      sl.material.userData.sync(st);
      sl.mesh.visible = st.erode < 0.999;
    }
  }

  _addSlash(at) {
    const sl = this._slashes[this._slashNext % MAX_SLASH];
    this._slashNext++;
    sl.born = this.age;
    sl.state.center.copy(at);
    sl.state.axis.copy(this.side);
    sl.state.seed = Math.random() * 100;
    sl.state.open = 0;
    sl.mesh.visible = true;
  }

  /** The smear of the arc behind the edge, from the angular speed. */
  _syncSmear(dt) {
    const c = settings[ID];
    if (dt > 0) this._omega = (this._theta - this._prevTheta) / dt;
    this._prevTheta = this._theta;
    const span = Math.max(-c.smearMax, Math.min(c.smearMax, this._omega * c.smearTime));
    const ss = this._smearState;
    ss.pivot.copy(this._pivot);
    ss.side.copy(this.side);
    ss.lead = this._theta;
    ss.span = span;
    ss.rOut = this._arm + 0.03;
    ss.rIn = Math.max(0.1, this._arm - c.bladeSize * c.smearDepth);
    const full = Math.max(0.5, c.swingAmp * c.swingRate * 0.55);
    ss.strength = saturate(Math.abs(this._omega) / full) * (1 - this._bladeState.dissolve);
    this.smear.visible = ss.strength > 0.02;
    this.smearWarp.visible = this.smear.visible;
    this.smearMaterial.userData.sync(ss);
    this.smearWarpMaterial.userData.sync(ss);
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the swing                                                  */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    const formT = Math.max(0.01, c.formTime * g.lifetime);
    const form = saturate(this.age / formT);

    this._bladeState.dissolve = 1 - Easing.outCubic(form);
    this._tetherState.dissolve = 1 - Easing.outCubic(saturate(form * 1.6));
    this._anchorState.fade = Easing.outCubic(saturate(form * 2));
    this._tetherState.flow += c.tetherFlow * dt * g.animationSpeed;

    this._arm = c.armLength;
    if (form >= 1) this._phi += c.swingRate * dt * g.animationSpeed;
    // Drawn back a little further while it forms — the wind-up (small: the horn stays in shot).
    const windUp = 1 + 0.08 * Easing.outCubic(form) * (1 - saturate((this.age - formT) / 0.15));
    this._theta = c.swingAmp * this._sign * Math.sin(this._phi) * windUp;

    this._pivotAt(this.u, this._pivot);
    this._place(this._pivot, this._theta, this._arm);
    this._sync();
    this._syncSmear(dt);

    // Passing the bottom of the swing: score the floor.
    if (form >= 1 && this._prevCross !== 0 && Math.sign(this._theta) !== Math.sign(this._prevCross)) this._crossing();
    this._prevCross = this._theta;

    this._shed(dt, 1 - this._bladeState.dissolve, form < 1);
    if (form >= 1) this._cutPass();
    this._updateSlashes(0);

    this._bladePoint(0, 0.7, this.position);
    this.ctx.shake.rumble(0.03, dt);
  }

  /** The edge scores the floor at the bottom of its swing. */
  _crossing() {
    const c = settings[ID];
    const g = settings.global;
    _floor.copy(this._edge).setY(0.03);
    if (this._edge.y < 1.0) {
      this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
        radius: c.slashRadius,
        life: 1.6,
        intensity: 0.8,
        colorA: getColor(c.colorCleft),
        colorB: getColor(c.colorRim)
      });
      this._addSlash(_floor);
    }
    this._resetEmit(frame.uTime.value);
    _dir.copy(this.side).multiplyScalar(Math.sign(this._omega) || 1).addScaledVector(_up, 0.45).normalize();
    _emit.position = this._edge;
    _emit.radius = 0.25;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed * 1.2;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.5;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.crossSparks * g.particleCount), _emit);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.6);
    this.ctx.shake.add(0.08, 8, 20);
  }

  /** Black smoke off the spine, sparks off the edge. */
  _shed(dt, strength, gathering) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const nS = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * (gathering ? 2 : 1)) * g.particleCount);
    if (nS > 0) {
      this._resetEmit(time);
      _emit.size = c.smokeSize;
      _emit.life = c.smokeLife;
      _emit.spin = 0.6;
      for (let i = 0; i < nS; i++) {
        // A point on the spine circle, horn to horn.
        const a = lerp(-Math.PI - INNER_A, INNER_A, Math.random());
        this._bladePoint(Math.cos(a) * BLADE_R, BLADE_R + BLADE_BELLY + Math.sin(a) * BLADE_R, _pos);
        if (gathering) {
          // While it forms, smoke is drawn *in* to it from round about.
          _dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          _pos.addScaledVector(_dir, 1.4);
          _dir.negate();
          _emit.speed = 2.2;
          _emit.spread = 0.2;
        } else {
          _dir.copy(_up);
          _emit.speed = 0.5;
          _emit.spread = 0.6;
        }
        _emit.position = _pos;
        _emit.direction = _dir;
        this.smoke.emit(1, _emit);
      }
    }
    const nK = Math.round(this.sparkEmitter.tick(dt, c.sparkRate * strength) * g.particleCount);
    if (nK > 0) {
      this._resetEmit(time);
      _emit.size = c.sparkSize * 0.8;
      _emit.life = c.sparkLife * 0.7;
      _emit.speed = c.sparkSpeed * 0.3;
      _emit.spread = 0.5;
      for (let i = 0; i < nK; i++) {
        const a = lerp(OUTER_A, -Math.PI - OUTER_A, Math.random());
        this._bladePoint(Math.cos(a) * BLADE_R, BLADE_R + Math.sin(a) * BLADE_R, _pos);
        _dir.copy(_x).multiplyScalar(-Math.sign(this._omega) || -1);
        _emit.position = _pos;
        _emit.direction = _dir;
        this.sparks.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The cut                                                             */
  /* ------------------------------------------------------------------ */

  _cutPass() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const pivotAlong = (this._pivot.x - this.origin.x) * this.direction.x + (this._pivot.z - this.origin.z) * this.direction.z;
    const edgeLat = (this._edge.x - this.origin.x) * this.side.x + (this._edge.z - this.origin.z) * this.side.z;
    const reach = Math.max(c.hitReach, c.hitDepth) + Math.abs(edgeLat) + 1;
    const found = field.findTargets(this._pivot.x, this._pivot.z, reach, this._found);
    if (found.length === 0) return;
    const swingDir = Math.sign(this._omega) || this._sign;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * this.side.x + dz * this.side.z;
      const edgeNear = this._edge.y < c.hitHeight && Math.abs(along - pivotAlong) < c.hitDepth && Math.abs(lat - edgeLat) < c.hitReach;
      // Nothing on the line slips past the pivot.
      const passed = along < pivotAlong - 0.8 && Math.abs(lat) < c.laneWidth && along > 0.5;
      if (!edgeNear && !passed) continue;
      _dir.copy(this.side).multiplyScalar(swingDir).addScaledVector(this.direction, 0.25).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, true)) continue;
      this._cuts++;
      this._cutFx(dummy.position, _dir, 0.6);
    }
  }

  _cutFx(at, dir, scale) {
    const c = settings[ID];
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(1.0);
    _emit.position = _pos;
    _emit.radius = 0.25;
    _emit.direction = dir;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(36 * scale * g.particleCount), _emit);
    _emit.speed = 1;
    _emit.spread = 1;
    _emit.size = c.smokeSize;
    _emit.life = c.smokeLife;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(8 * scale * g.particleCount), _emit);
    this.ctx.shake.add(0.15 * scale, 8, 20);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * scale);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — rear up, chop                                              */
  /* ------------------------------------------------------------------ */

  onImpact() {
    this._thetaEnd = this._theta;
    // It rears up on the side it is already swinging toward.
    const s = Math.sign(this._omega) || Math.sign(this._theta) || 1;
    this._rear = s;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const B = this._chopBeats();
    const tau = t <= 1 ? (t * this.impactDuration) / Math.max(0.01, g.lifetime) : B.end;
    const ft = t > 1 ? saturate(t - 1) : 0;
    this._tetherState.flow += c.tetherFlow * dt * g.animationSpeed;

    this._pivotAt(1, this._pivot);
    if (tau < B.raise) {
      const r = Easing.outCubic(tau / B.raise);
      this._theta = lerp(this._thetaEnd, c.raiseAngle * this._rear, r);
      this._arm = c.armLength;
    } else if (tau < B.drop) {
      const d = Easing.inQuad((tau - B.raise) / (B.drop - B.raise));
      this._theta = lerp(c.raiseAngle * this._rear, 0, d);
      this._arm = lerp(c.armLength, c.pivotHeight + c.embed, d);
    } else {
      this._theta = 0;
      // Buried — and, as it goes, sinking into its own pool.
      this._arm = c.pivotHeight + c.embed + c.bladeSink * Easing.inQuad(ft);
      if (!this._chopped) this._chop();
    }

    this._place(this._pivot, this._theta, this._arm);
    const since = this._chopped ? tau - B.drop : 0;
    const bs = this._bladeState;
    bs.pulse = this._chopped ? Math.exp(-since * 5) : 0;
    bs.dissolve = smoothstep(0.05, 0.95, ft);
    this.blade.visible = bs.dissolve < 0.999;
    // The tether and the knot go once the blade is buried.
    this._tetherState.dissolve = this._chopped ? saturate(since / 0.3) : 0;
    this.tether.visible = this._tetherState.dissolve < 0.999;
    this._anchorState.fade = this._chopped ? 1 - saturate(since / 0.35) : 1;
    this.anchor.visible = this._anchorState.fade > 0.01;
    this._sync();
    this._syncSmear(dt);

    /* the cleft */
    if (this._chopped) {
      const cs = this._cleftState;
      cs.open = Easing.outCubic(saturate(since / Math.max(0.02, c.cleftOpenTime)));
      cs.heat = lerp(0.35, 1, Math.exp(-since * 2)) * (1 - smoothstep(0.3, 1, ft));
      cs.erode = smoothstep(0.35, 1, ft);
      this.cleft.visible = cs.erode < 0.999;
      this.cleftMaterial.userData.sync(cs);

      /* the pool spills out of it, swirls, and dries off in the exit */
      const ps = this._poolState;
      ps.radius = c.chopRadius * c.poolScale;
      ps.spread = Easing.outCubic(saturate(since / Math.max(0.02, c.poolSpread * g.lifetime)));
      ps.erode = smoothstep(0.4, 1, ft);
      ps.pulse = 0.5 + 0.5 * Math.sin(since * 6.5);
      this.poolMaterial.userData.sync(ps);
      this.pool.visible = ps.erode < 0.999;
      this._rise(dt, ps, 1 - smoothstep(0.55, 1, ft));
    }
    this._updateSlashes(ft);

    // Smoke pours off it as it goes.
    if (t > 1) {
      this._shed(dt * (1 + 3 * ft), 0, false);
    } else {
      this._shed(dt, this._chopped ? 0.3 : 1, false);
    }

    this._bladePoint(0, 0.9, this.position);
    this.position.y = Math.max(0.5, this.position.y);
  }

  /** Wisps and smoke rising off the pool — thickest along the cleft. */
  _rise(dt, ps, k) {
    const c = settings[ID];
    const g = settings.global;
    if (k <= 0) return;
    const time = frame.uTime.value;
    const reach = ps.radius * ps.spread * 0.8;
    const nW = Math.round(this.wispEmitter.tick(dt, c.wispRate * k) * g.particleCount);
    const nS = Math.round(this.poolSmokeEmitter.tick(dt, c.poolSmokeRate * k) * g.particleCount);
    if (nW + nS <= 0) return;
    this._resetEmit(time);
    _emit.direction = _up;
    _emit.spread = 0.25;
    for (let i = 0; i < nW + nS; i++) {
      const smoke = i >= nW;
      if (Math.random() < 0.45) {
        // Out of the cleft itself.
        _pos.copy(ps.center).addScaledVector(this.side, (Math.random() - 0.5) * c.cleftLength);
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = reach * Math.sqrt(Math.random());
        _pos.copy(ps.center);
        _pos.x += Math.cos(a) * r;
        _pos.z += Math.sin(a) * r;
      }
      _pos.y = 0.1;
      _emit.position = _pos;
      _emit.speed = smoke ? c.wispSpeed * 0.6 : c.wispSpeed;
      _emit.size = smoke ? c.smokeSize * 1.2 : c.wispSize;
      _emit.life = smoke ? c.smokeLife * 1.4 : c.wispLife;
      _emit.spin = 0.6;
      (smoke ? this.smoke : this.wisps).emit(1, _emit);
    }
  }

  _chop() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._chopped = true;
    this.pointAt(1, _floor);
    _floor.y = 0.02;

    const ps = this._poolState;
    ps.center.copy(_floor);
    ps.spread = 0;
    ps.erode = 0;
    this.pool.visible = true;

    const cs = this._cleftState;
    cs.center.copy(_floor);
    cs.axis.copy(this.side);
    cs.open = 0;
    this.cleft.visible = true;

    this.ctx.bursts.spawn(BurstMode.AIR, _floor, {
      radius: 0.3,
      endRadius: c.burstSize * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.6,
      fresnel: 2,
      displace: 0.4,
      turbulence: 1.2,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 0.75,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.CRACK, _floor, {
      radius: c.cleftLength * 0.6,
      life: this.fadeDuration + 0.6,
      intensity: 0.9,
      colorA: getColor(c.colorCleft),
      colorB: getColor(c.colorRim)
    });

    // Sparks fan out both ways along the cut.
    this._resetEmit(frame.uTime.value);
    _pos.copy(_floor).setY(0.15);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.speed = c.sparkSpeed * 1.4;
    _emit.speedVariance = 0.55;
    _emit.spread = 0.45;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = c.sparkLife * 1.2;
    _dir.copy(this.side).addScaledVector(_up, 0.6).normalize();
    _emit.direction = _dir;
    this.sparks.emit(Math.round(c.chopSparks * 0.5 * g.particleCount), _emit);
    _dir.copy(this.side).negate().addScaledVector(_up, 0.6).normalize();
    this.sparks.emit(Math.round(c.chopSparks * 0.5 * g.particleCount), _emit);
    _emit.direction = _up;
    _emit.speed = 2;
    _emit.spread = 1.2;
    _emit.size = c.smokeSize * 1.4;
    _emit.life = c.smokeLife * 1.3;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(24 * g.particleCount), _emit);

    // Everything about the target is taken, thrown off the blade's two faces.
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      const found = field.findTargets(_floor.x, _floor.z, c.chopRadius, this._found);
      this._force.impulse = c.chopImpulse * power;
      this._force.lift = c.chopLift * power;
      this._force.spin = c.hitSpin;
      for (const dummy of found) {
        const lat = (dummy.position.x - _floor.x) * this.side.x + (dummy.position.z - _floor.z) * this.side.z;
        const along = (dummy.position.x - _floor.x) * this.direction.x + (dummy.position.z - _floor.z) * this.direction.z;
        _dir.copy(this.direction).multiplyScalar(Math.sign(along) || 1).addScaledVector(this.side, lat * 0.3).normalize();
        if (dummy.kill(_dir.x, _dir.z, this._force, true)) this._cuts++;
      }
    }

    this.ctx.shake.add(c.chopShake * power, 1 / Math.max(0.05, c.shakeDuration), 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.chopFlash * power);
    this.lightBoost = c.lightIntensity * c.chopLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.blade.visible = false;
    this.tether.visible = false;
    this.anchor.visible = false;
    this.smear.visible = false;
    this.smearWarp.visible = false;
    this.cleft.visible = false;
    this.pool.visible = false;
    for (const sl of this._slashes) {
      sl.born = -1;
      sl.mesh.visible = false;
    }
  }

  dispose() {
    this.bladeGeometry.dispose();
    this.tetherGeometry.dispose();
    this.smearGeometry.dispose();
    this.quadGeometry.dispose();
    this.bladeMaterial.dispose();
    this.tetherMaterial.dispose();
    this.anchorMaterial.dispose();
    this.smearMaterial.dispose();
    this.smearWarpMaterial.dispose();
    this.cleftMaterial.dispose();
    this.poolMaterial.dispose();
    for (const sl of this._slashes) sl.material.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☾  Umbral Guillotine');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'pivot speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'goes to smoke over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const blade = folder.addFolder('1 · Blade');
  R(blade, c, 'bladeSize', 0.3, 4, 0.01, 'size (m)');
  R(blade, c, 'bladeThickness', 0.2, 6, 0.01, 'thickness');
  R(blade, c, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');
  R(blade, c, 'edgeGlow', 0, 20, 0.05, 'edge glow');
  R(blade, c, 'hamonGlow', 0, 8, 0.05, 'temper line glow');
  R(blade, c, 'bladeRim', 0, 8, 0.05, 'rim glow');
  R(blade, c, 'bruise', 0, 3, 0.01, 'violet in the obsidian');
  R(blade, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'burning lip');
  blade.addColor(c, 'colorBlade').name('obsidian');
  blade.addColor(c, 'colorBruise').name('bruise');
  blade.addColor(c, 'colorEdge').name('edge');
  blade.addColor(c, 'colorRim').name('rim / temper');

  const swing = folder.addFolder('2 · Swing');
  R(swing, c, 'startForward', 0, 6, 0.05, 'starts ahead (m)');
  R(swing, c, 'pivotHeight', 1, 14, 0.05, 'pivot height (m)');
  R(swing, c, 'armLength', 0.5, 14, 0.05, 'arm (m)');
  R(swing, c, 'swingAmp', 0, 1.5, 0.01, 'amplitude (rad)');
  R(swing, c, 'swingRate', 0, 20, 0.05, 'rate (rad/s)');
  R(swing, c, 'formTime', 0.02, 2, 0.01, 'forms over (s)');
  R(swing, c, 'tetherWidth', 0.005, 0.4, 0.001, 'tether radius (m)');
  R(swing, c, 'tetherGlow', 0, 8, 0.05, 'tether glow');
  R(swing, c, 'tetherFlow', 0, 10, 0.05, 'tether pulses/second');
  R(swing, c, 'anchorSize', 0.05, 3, 0.01, 'knot size (m)');

  const smear = folder.addFolder('3 · Smear');
  R(smear, c, 'smearTime', 0, 0.6, 0.005, 'remembers (s)');
  R(smear, c, 'smearMax', 0, 3.14, 0.01, 'max span (rad)');
  R(smear, c, 'smearDepth', 0.05, 2, 0.01, 'depth (× size)');
  R(smear, c, 'smearGlow', 0, 10, 0.05, 'glow');
  R(smear, c, 'warpStrength', 0, 4, 0.01, 'air shove');
  smear.addColor(c, 'colorSmearA').name('edge track');
  smear.addColor(c, 'colorSmearB').name('body');

  const chop = folder.addFolder('4 · Chop');
  R(chop, c, 'raiseTime', 0.02, 2, 0.01, 'rears up over (s)');
  R(chop, c, 'raiseAngle', 0, 3, 0.01, 'rears to (rad)');
  R(chop, c, 'dropTime', 0.02, 1, 0.005, 'chops down over (s)');
  R(chop, c, 'embed', 0, 2, 0.01, 'buries (m)');
  R(chop, c, 'embedHold', 0.05, 3, 0.01, 'stands buried (s)');
  R(chop, c, 'chopRadius', 0, 8, 0.05, 'takes within (m)');
  R(chop, c, 'chopSparks', 0, 600, 1, 'sparks');
  R(chop, c, 'chopShake', 0, 1.5, 0.01, 'knock');
  R(chop, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(chop, c, 'chopFlash', 0, 1, 0.01, 'flash');
  R(chop, c, 'chopLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(chop, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(chop, c, 'burstSize', 0, 8, 0.05, 'air shell (m)');
  R(chop, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  chop.addColor(c, 'colorFlash').name('flash');
  chop.addColor(c, 'colorBurstA').name('shell inner');
  chop.addColor(c, 'colorBurstB').name('shell mid');
  chop.addColor(c, 'colorBurstC').name('shell outer');
  chop.addColor(c, 'colorShockA').name('shockwave');
  chop.addColor(c, 'colorShockB').name('shockwave hot');

  const cleft = folder.addFolder('5 · Cleft');
  R(cleft, c, 'cleftLength', 0.2, 10, 0.05, 'length (m)');
  R(cleft, c, 'cleftWidth', 0.02, 1, 0.005, 'half-width (m)');
  R(cleft, c, 'cleftGlow', 0, 10, 0.05, 'lip glow');
  R(cleft, c, 'cleftOpenTime', 0.02, 1, 0.005, 'tears open over (s)');
  cleft.addColor(c, 'colorCleft').name('void');

  const fx = folder.addFolder('6 · Smoke & sparks');
  R(fx, c, 'smokeRate', 0, 300, 1, 'smoke/second');
  R(fx, c, 'smokeSize', 0.05, 3, 0.01, 'smoke size');
  R(fx, c, 'smokeLife', 0.1, 5, 0.05, 'smoke lifetime');
  R(fx, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  R(fx, c, 'sparkRate', 0, 600, 1, 'edge sparks/second');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  R(fx, c, 'crossSparks', 0, 300, 1, 'sparks at each low pass');
  R(fx, c, 'slashRadius', 0, 5, 0.05, 'low-pass scorch (m)');
  R(fx, c, 'slashLength', 0, 8, 0.05, 'low-pass slash length (m)');
  R(fx, c, 'slashWidth', 0.02, 0.6, 0.005, 'low-pass slash half-width (m)');
  R(fx, c, 'slashGlow', 0, 10, 0.05, 'low-pass slash glow');
  Editor.gradient(fx, c, 'colorSmoke', 'smoke gradient');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');

  const cut = folder.addFolder('7 · Cut');
  R(cut, c, 'hitReach', 0.1, 5, 0.05, 'edge reach (m)');
  R(cut, c, 'hitDepth', 0.1, 5, 0.05, 'along the line (m)');
  R(cut, c, 'hitHeight', 0.2, 6, 0.05, 'cuts below (m)');
  R(cut, c, 'laneWidth', 0, 4, 0.05, 'nothing slips within (m)');
  R(cut, c, 'hitImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(cut, c, 'hitLift', 0, 15, 0.1, 'lift (m/s)');
  R(cut, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(cut, c, 'chopImpulse', 0, 30, 0.1, 'chop throw (m/s)');
  R(cut, c, 'chopLift', 0, 20, 0.1, 'chop lift (m/s)');

  const pool = folder.addFolder('8 · Shadow pool');
  R(pool, c, 'poolScale', 0, 4, 0.01, 'spills (× chop radius)');
  R(pool, c, 'poolSpread', 0.02, 3, 0.01, 'spills over (s)');
  R(pool, c, 'poolSwirl', -4, 4, 0.01, 'veins turn (rad/s)');
  R(pool, c, 'poolVeins', 0, 4, 0.01, 'veins');
  R(pool, c, 'poolGlow', 0, 10, 0.05, 'vein & lip glow');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'bladeSink', 0, 6, 0.05, 'blade sinks (m)');
  R(pool, c, 'wispRate', 0, 600, 1, 'wisps/second');
  R(pool, c, 'wispSize', 0.02, 2, 0.01, 'wisp size');
  R(pool, c, 'wispSpeed', 0, 10, 0.05, 'wisp rise speed');
  R(pool, c, 'wispLife', 0.1, 5, 0.05, 'wisp lifetime');
  R(pool, c, 'wispGlow', 0, 10, 0.05, 'wisp glow');
  R(pool, c, 'poolSmokeRate', 0, 400, 1, 'smoke/second');
  pool.addColor(c, 'colorPoolDeep').name('deep');
  pool.addColor(c, 'colorPoolBody').name('body');
  pool.addColor(c, 'colorPoolVein').name('veins');
  Editor.gradient(pool, c, 'colorWisp', 'wisp gradient');

  folder.close();
  return folder;
}
