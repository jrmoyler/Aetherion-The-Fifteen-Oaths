import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createPulsarTubeGeometry,
  createPulsarSphereGeometry,
  createPulsarStripGeometry,
  createPulsarQuadGeometry
} from '../../assets/codex/PulsarLashGeometry.js';
import {
  createStarMaterial,
  createBeamMaterial,
  createLoopMaterial,
  createStrobeMaterial,
  createLensMaterial,
  createScarMaterial,
  MAX_SCARS,
  MAX_LOOPS
} from '../../materials/codex/PulsarLashMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'pulsar';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** Samples along a beam when looking for where it meets the floor. */
const FOOT_STEPS = 40;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _m = new Vector3();
const _floor = new Vector3();
const _toCam = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);

/**
 * PULSAR LASH — Cosmic, line cast.
 *
 * Not a whip of rope (that is Solar Lash) but a whip of *light*: a neutron star
 * formed in the caster's hand, spun up, and flung down the line. Its two polar
 * beams sweep round the spin axis like a lighthouse laid on its side, each
 * curled back against the spin so the pair reads as a spinning two-armed
 * pinwheel, and every time a beam comes round through the floor it **lashes**
 * it: a crosswise white-hot slit is burnt into the stone, sparks are dragged
 * across it and whatever stands there is cut down. Four lashes a revolution
 * pair, marching down the line as the star advances.
 *
 * At the target the star **over-spins** — the beams blur into a strobing disc,
 * the blink becomes a flicker — then **quakes**: the spin stops dead, the
 * magnetic axis snaps vertical and one beam is driven straight down through
 * the target into the floor (the other straight up into the sky), a cracked
 * star of burns opens round the pin, a STORM shell and a shockwave go out, and
 * everything near is thrown. The pin holds, flaring; then the star **winks
 * out** — beams thin to nothing, the crust dims, the field loops are flung
 * outward and fade — and the scars cool from white through violet to a dark
 * burn and erode away.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the star** (`createStarMaterial`) — crackling white crust, polar
 *      hot-spots, violet limb.
 *   2. **the beams** (`createBeamMaterial` ×2) — curled cones bent in the
 *      vertex stage, inverted-fresnel light with radio pulses racing out,
 *      clipped and softened at the floor.
 *   3. **the magnetosphere** (`createLoopMaterial`) — dipole field loops
 *      turning with the star, charge streaming along them.
 *   4. **the strobe** (`createStrobeMaterial`) — the blink when a beam swings
 *      toward the camera; and the **lens** (`createLensMaterial`,
 *      `LAYER.DISTORTION`) pinching the air round the star, with a push ring
 *      at the quake.
 *   5. **the scars** (`createScarMaterial`) — every beam footprint is laid as a
 *      segment into a 48-slot ring buffer the ground shader reads; each cools
 *      on its own clock.
 *   6. **particles** — streak sparks where a beam drags across the floor,
 *      curl-drifting motes off the star and beams, dark dust off fresh scars.
 *   7. **the quake** — STORM shell, SHOCKWAVE and ARC decals, radial scars,
 *      flash, shake, light punch, a burst of sparks.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Each new scar segment is a kill line: a body within `hitWidth` of it is cut
 * down (sliced, by default) and thrown the way the beam was sweeping. At the
 * quake everything within `glitchRadius` of the pin is thrown outward.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, integrated phases (spin, flow, pulses) and the scar
 * buffer. Every metre, second and colour is read from `settings.pulsar` each
 * frame; rate sliders change rates, never phases, so nothing jumps.
 */
export class PulsarLashAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Scars on the floor. HUD readout only. */
  get instanceCount() {
    return this._scarCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.beamGeometry = createPulsarTubeGeometry(72, 10, 1, 0.85);
    this.loopGeometry = createPulsarTubeGeometry(48, 5, MAX_LOOPS, 1);
    this.sphereGeometry = createPulsarSphereGeometry(32, 20);
    this.stripGeometry = createPulsarStripGeometry(8, 4);
    this.quadGeometry = createPulsarQuadGeometry();

    this.scarMaterial = createScarMaterial();
    this.scars = this._mesh(this.stripGeometry, this.scarMaterial, LAYER.VFX, 2);

    this.starMaterial = createStarMaterial();
    this.star = this._mesh(this.sphereGeometry, this.starMaterial, LAYER.VFX, 12);

    this.beamMaterials = [createBeamMaterial(), createBeamMaterial()];
    this.beams = this.beamMaterials.map((m) => this._mesh(this.beamGeometry, m, LAYER.VFX, 13));

    this.loopMaterial = createLoopMaterial();
    this.loops = this._mesh(this.loopGeometry, this.loopMaterial, LAYER.VFX, 11);

    this.strobeMaterial = createStrobeMaterial();
    this.strobe = this._mesh(this.quadGeometry, this.strobeMaterial, LAYER.VFX, 16);

    this.lensMaterial = createLensMaterial();
    this.lens = this._mesh(this.quadGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /** The spin frame: axis, and the two unit vectors spanning its plane. */
    this._axis = new Vector3(0, 0, 1);
    this._e1 = new Vector3(0, 1, 0);
    this._e2 = new Vector3(1, 0, 0);
    /** The magnetic axis this frame (beam 0 leaves along it, beam 1 against it). */
    this._mag = new Vector3(0, 1, 0);
    this._starPos = new Vector3();

    this._beamStates = [0, 1].map(() => ({
      star: new Vector3(),
      m: new Vector3(0, 1, 0),
      axis: new Vector3(0, 0, 1),
      lag: 0,
      length: 1,
      flow: 0,
      pulse: 0,
      power: 1,
      flare: 0,
      widthMul: 1,
      seed: 0
    }));
    this._starState = { center: new Vector3(), radius: 0.3, m: new Vector3(0, 1, 0), power: 1, seed: 0 };
    this._loopState = { center: new Vector3(), m: new Vector3(), p1: new Vector3(), p2: new Vector3(), starR: 0.3, expand: 0, flow: 0, power: 1 };
    this._strobeState = { center: new Vector3(), size: 1, intensity: 0, rayAngle: 0, seed: 0 };
    this._lensState = { center: new Vector3(), size: 1, strength: 1, ring: -1 };
    this._scarState = { start: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, halfWidth: 6, count: 0, now: 0, fadeT: 0, seed: 0 };

    /** Footprints: where each beam met the floor last frame and this one. */
    this._feet = [0, 1].map(() => ({ valid: false, last: new Vector3(), lastValid: false, now: new Vector3() }));
    this._scarCount = 0;
    this._scarCursor = 0;

    this._seed = 0;
    this._spin = 0;
    this._flow = 0;
    this._pulse = 0;
    this._loopFlow = 0;
    this._lock = 0;
    this._quaked = false;
    this._spinMul = 1;

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

    this.sparks = particles.get('pulsar.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.25;
    this.sparks.uniforms.uDrag.value = 1.6;

    this.motes = particles.get('pulsar.motes', {
      capacity: 1800,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uDrag.value = 1.2;
    this.motes.uniforms.uTurbFrequency.value = 1.1;
    this.motes.uniforms.uTurbSpeed.value = 0.7;

    this.dust = particles.get('pulsar.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.2;
    this.dust.uniforms.uFadeIn.value = 0.12;
    this.dust.uniforms.uFadeOut.value = 0.55;
    this.dust.uniforms.uEndSize.value = 2.2;
    this.dust.uniforms.uDrag.value = 1.0;

    this.sparkEmitters = [new RateEmitter(), new RateEmitter()];
    this.moteEmitter = new RateEmitter();
    this.dustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the over-spin, the snap, the pin and the collapse. */
  get impactDuration() {
    const c = settings[ID];
    const sum = Math.max(0.02, c.overspinTime) + Math.max(0.01, c.glitchSnap) + Math.max(0, c.pinTime) + Math.max(0.05, c.collapseTime);
    return sum * settings.global.lifetime;
  }

  /** The fade is the scars cooling. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** The light blinks with the beams. */
  lightShimmer() {
    const c = settings[ID];
    const blink = Math.pow(Math.abs(Math.cos(this._spin)), 6);
    return 1 - c.lightStrobe * 0.6 + c.lightStrobe * 0.6 * blink;
  }

  /** Hold the front while the star spins up in the hand. */
  advance(dt) {
    const hold = Math.max(0, settings[ID].spinUpTime) * settings.global.lifetime;
    if (this.age < hold) {
      this.pointAt(0, this.position);
      return false;
    }
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Geometry on the CPU                                                 */
  /* ------------------------------------------------------------------ */

  /** Spin axis (the line, tipped up a little) and its plane. */
  _frame() {
    const c = settings[ID];
    const t = c.axisTilt * DEG;
    this._axis.copy(this.direction).multiplyScalar(Math.cos(t)).addScaledVector(_up, Math.sin(t)).normalize();
    // e1: "up" in the spin plane, so phase 0 is a beam pointing at the sky.
    this._e1.copy(_up).addScaledVector(this._axis, -this._axis.dot(_up)).normalize();
    this._e2.crossVectors(this._axis, this._e1).normalize();
  }

  /** The magnetic axis at spin phase `phi`, locked toward vertical by `lock`. */
  _magnetic(phi, lock, out) {
    const inc = settings[ID].inclination * DEG;
    out
      .copy(this._axis)
      .multiplyScalar(Math.cos(inc))
      .addScaledVector(this._e1, Math.cos(phi) * Math.sin(inc))
      .addScaledVector(this._e2, Math.sin(phi) * Math.sin(inc));
    if (lock > 0) {
      // At the quake beam 0 is driven straight down into the floor.
      out.lerp(_down, lock).normalize();
    }
    return out;
  }

  /** Rodrigues: `v` rotated by `a` about unit `k`, in place. */
  _rotate(v, k, a) {
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const d = k.dot(v) * (1 - cs);
    const cx = k.y * v.z - k.z * v.y;
    const cy = k.z * v.x - k.x * v.z;
    const cz = k.x * v.y - k.y * v.x;
    return v.set(v.x * cs + cx * sn + k.x * d, v.y * cs + cy * sn + k.y * d, v.z * cs + cz * sn + k.z * d);
  }

  /** CPU twin of `beamPoint` in PulsarLashMaterials. */
  _beamPoint(i, s, out) {
    const st = this._beamStates[i];
    _m.copy(st.m);
    this._rotate(_m, st.axis, -st.lag * s);
    return out.copy(st.star).addScaledVector(_m, s * st.length);
  }

  /** Where beam `i` first meets the floor; false if it does not. */
  _footprint(i, out) {
    const st = this._beamStates[i];
    if (st.power < 0.2) return false;
    let prevY = st.star.y;
    let prevS = 0;
    for (let k = 1; k <= FOOT_STEPS; k++) {
      const s = (k / FOOT_STEPS) * 0.92;
      this._beamPoint(i, s, _a);
      if (_a.y <= 0) {
        const f = prevY / Math.max(1e-4, prevY - _a.y);
        this._beamPoint(i, lerp(prevS, s, f), out);
        out.y = 0;
        return true;
      }
      prevY = _a.y;
      prevS = s;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._flow = 0;
    this._pulse = 0;
    this._loopFlow = 0;
    this._lock = 0;
    this._quaked = false;
    this._spinMul = 1;
    this._scarCount = 0;
    this._scarCursor = 0;
    for (const f of this._feet) {
      f.valid = false;
      f.lastValid = false;
    }
    for (const e of this.sparkEmitters) e.reset();
    this.moteEmitter.reset();
    this.dustEmitter.reset();

    this._frame();
    this._starState.seed = this._seed;
    this._strobeState.seed = this._seed;
    this._scarState.seed = this._seed;
    this._scarState.fadeT = 0;
    this._lensState.ring = -1;
    for (let i = 0; i < 2; i++) this._beamStates[i].seed = this._seed + i * 13;

    this.star.visible = true;
    this.beams[0].visible = true;
    this.beams[1].visible = true;
    this.loops.visible = true;
    this.strobe.visible = true;
    this.lens.visible = true;
    this.scars.visible = true;

    this._hand(this._starPos);
    this._place(0, 0);
    this._syncAll();
  }

  _hand(out) {
    const c = settings[ID];
    return out.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide).setY(c.handHeight);
  }

  /**
   * Pose the star, its beams and its field for this frame.
   * @param {number} grow 0..1 how formed the star is (spin-up)
   * @param {number} power 0..1 beam/star power (collapse)
   */
  _place(grow, power) {
    const c = settings[ID];
    const g = settings.global;
    this._frame();
    this._magnetic(this._spin, this._lock, this._mag);
    const lag = c.beamLag * (1 - this._lock) * Math.min(1.5, this._spinMul);
    for (let i = 0; i < 2; i++) {
      const st = this._beamStates[i];
      st.star.copy(this._starPos);
      st.m.copy(this._mag).multiplyScalar(i === 0 ? 1 : -1);
      st.axis.copy(this._axis);
      st.lag = lag;
      st.length = c.beamLength * grow * g.explosionIntensity;
      st.flow = this._flow;
      st.pulse = this._pulse;
      st.power = power * smoothstep(0.15, 0.6, grow);
    }

    const ss = this._starState;
    ss.center.copy(this._starPos);
    ss.radius = c.starRadius * Easing.outBack(saturate(grow));
    ss.m.copy(this._mag);
    ss.power = Math.max(power, 0.0);

    const ls = this._loopState;
    ls.center.copy(this._starPos);
    ls.m.copy(this._mag);
    // The loops' azimuths ride the spin, so the cage turns with the star.
    ls.p1.crossVectors(this._mag, this._axis);
    if (ls.p1.lengthSq() < 1e-6) ls.p1.crossVectors(this._mag, this.side);
    ls.p1.normalize();
    ls.p2.crossVectors(this._mag, ls.p1).normalize();
    ls.starR = Math.max(0.02, ss.radius);
    ls.flow = this._loopFlow;
    ls.expand = 0;
    ls.power = power * grow;

    // The lighthouse blink: brightest when either beam swings toward the eye.
    _toCam.copy(this.ctx.camera.position).sub(this._starPos).normalize();
    const facing = Math.abs(this._mag.dot(_toCam));
    const blink = Math.pow(facing, Math.max(1, c.strobeSharpness));
    const so = this._strobeState;
    so.center.copy(this._starPos);
    so.size = c.flareSize * (0.5 + 0.5 * grow) * (1 + blink * 0.6);
    so.intensity = (c.flareGlow + c.strobeGlow * blink) * power * grow;
    so.rayAngle = this._spin;

    const lens = this._lensState;
    lens.center.copy(this._starPos);
    lens.size = c.lensRadius * (0.4 + 0.6 * grow);
    lens.strength = power * grow;
  }

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    this.starMaterial.userData.sync(this._starState);
    this.beamMaterials[0].userData.sync(this._beamStates[0]);
    this.beamMaterials[1].userData.sync(this._beamStates[1]);
    this.loopMaterial.userData.sync(this._loopState);
    this.strobeMaterial.userData.sync(this._strobeState);
    this.lensMaterial.userData.sync(this._lensState);

    const sc = this._scarState;
    sc.start.copy(this.origin).addScaledVector(this.direction, -1).setY(0);
    sc.dir.copy(this.direction);
    sc.side.copy(this.side);
    sc.length = this.length + 2 + c.beamLength * 0.5;
    sc.halfWidth = c.beamLength * g.explosionIntensity + 1;
    sc.count = this._scarCount;
    sc.now = this.age;
    this.scarMaterial.userData.sync(sc);

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

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, 0.3, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 1.2 * g.turbulence;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uGravity.value.set(0, c.dustLift * 0.4, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.dustOpacity * g.opacity;
    d.uTurbulence.value = 0.6 * g.turbulence;
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

  /** Integrated phases: rates are live, phases never jump. */
  _advancePhases(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += c.spinRate * TAU * this._spinMul * dt * g.animationSpeed;
    this._flow += c.beamFlow * dt * g.noiseSpeed;
    this._pulse += c.pulseRate * dt * g.animationSpeed;
    this._loopFlow += c.fieldFlow * dt * g.animationSpeed;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — spin-up, then the lashing run                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    const hold = Math.max(0.01, c.spinUpTime * g.lifetime);
    const grow = saturate(this.age / hold);
    // Spinning up in the hand: from a standstill to full rate.
    this._spinMul = Easing.inQuad(grow);
    this._advancePhases(dt);

    this._hand(_a);
    if (grow < 1) {
      this._starPos.copy(_a);
    } else {
      const along = lerp(c.handForward, this.length, this.u);
      this.pointAt(along / this.length, this._starPos);
      this._starPos.addScaledVector(this.side, c.handSide * (1 - this.u));
      const rise = smoothstep(0, 0.2, this.u);
      this._starPos.y = lerp(c.handHeight, c.flightHeight, rise) + Math.sin(this.age * 7.3) * c.starBob * rise;
    }

    this._place(grow, 1);
    this._syncAll();
    this._lash(dt, grow >= 1);
    this._starFx(dt, grow);
    if (grow >= 1) this.ctx.shake.rumble(c.travelRumble, dt);
    this.position.copy(this._starPos);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — over-spin, quake, pin, collapse                            */
  /* ------------------------------------------------------------------ */

  onImpact() {
    this._spinMul = 1;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;

    if (t <= 1) {
      const tau = (t * this.impactDuration) / Math.max(0.01, g.lifetime);
      const o = Math.max(0.02, c.overspinTime);
      const snap = Math.max(0.01, c.glitchSnap);
      const pin = Math.max(0, c.pinTime);
      const fall = Math.max(0.05, c.collapseTime);

      const ko = saturate(tau / o);
      const ks = saturate((tau - o) / snap);
      const kc = saturate((tau - o - snap - pin) / fall);

      // Over-spin, then dead stop.
      this._spinMul = ks > 0 ? 0 : lerp(1, c.overspinRate, Easing.inCubic(ko));
      this._lock = Easing.outCubic(ks);
      this._advancePhases(dt);

      const power = 1 - Easing.inQuad(kc);
      this._place(1, power);
      // The star swells as it spins up, then shrinks to nothing.
      this._starState.radius = c.starRadius * (1 + 0.35 * Easing.inQuad(ko)) * (1 - Easing.inCubic(kc));
      this._loopState.expand = Easing.outCubic(kc) * 2.5;
      this._loopState.power = 1 - kc;
      const pinned = ks >= 1 && kc < 1;
      const flare = ks >= 1 ? Math.exp(-(tau - o - snap) * 5) * 1.5 + 0.3 * (1 - kc) : 0.4 * ko;
      for (let i = 0; i < 2; i++) {
        const st = this._beamStates[i];
        st.flare = flare;
        st.widthMul = lerp(1, c.pinWidth, this._lock) * (1 - 0.7 * kc);
      }
      this._strobeState.intensity *= 1 + ko * 0.8 + (ks >= 1 ? flare : 0);

      if (ks >= 1 && !this._quaked) this._quake();
      if (this._quaked) {
        const ring = saturate((tau - o - snap) / 0.45);
        this._lensState.ring = ring < 1 ? ring : -1;
        this._lensState.size = c.lensRadius * 2.5;
        this._lensState.strength = 1;
      }

      this._syncAll();
      if (!this._quaked) {
        this._lash(dt, true);
        this.ctx.shake.rumble(c.travelRumble * (1 + 3 * ko), dt);
      } else if (pinned) {
        this._pinFx(dt);
      }
      this._starFx(dt, power);
      this.position.copy(this._starPos);
      this.star.visible = this._starState.radius > 0.005;
      return;
    }

    /* the fade: the star is gone, the scars cool and erode */
    const ft = saturate(t - 1);
    this.star.visible = false;
    this.beams[0].visible = false;
    this.beams[1].visible = false;
    this.loops.visible = false;
    this.strobe.visible = false;
    this.lens.visible = false;
    this._scarState.fadeT = smoothstep(0.35, 1, ft);
    this._syncAll();
    this.position.copy(this._starPos).setY(0.4);
  }

  /** The starquake: everything at once. */
  _quake() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._quaked = true;
    _floor.copy(this._starPos).setY(0);

    this.ctx.bursts.spawn(BurstMode.STORM, _floor, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.55,
      intensity: c.burstIntensity,
      opacity: 0.7,
      fresnel: 2,
      displace: 0.3,
      turbulence: 1.4,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.ARC, _floor, {
      radius: c.glitchRadius,
      life: this.impactDuration + this.fadeDuration,
      intensity: 1.2,
      colorA: getColor(c.colorScarC),
      colorB: getColor(c.colorScarB)
    });

    // A cracked star of burns opens round the pin.
    const n = Math.max(0, Math.round(c.quakeScars));
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * TAU + this._seed + Math.random() * 0.4;
      const len = c.quakeScarLength * (0.6 + 0.6 * Math.random());
      _a.copy(_floor);
      _b.set(_floor.x + Math.cos(a) * len, 0, _floor.z + Math.sin(a) * len);
      this._pushScar(_a, _b, 1.2);
    }

    this._resetEmit(time);
    _pos.copy(_floor).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.spread = 1.6;
    _emit.speed = c.sparkSpeed * 1.6;
    _emit.speedVariance = 0.6;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = c.sparkLife * 1.3;
    this.sparks.emit(Math.round(c.quakeSparks * g.particleCount), _emit);
    _emit.position = this._starPos;
    _emit.speed = c.moteSpeed * 5;
    _emit.size = c.moteSize * 1.4;
    _emit.life = c.moteLife;
    this.motes.emit(Math.round(c.quakeSparks * 0.5 * g.particleCount), _emit);
    _emit.position = _pos;
    _emit.direction = _up;
    _emit.speed = c.dustLift * 2;
    _emit.spread = 1.2;
    _emit.size = c.dustSize * 1.5;
    _emit.life = c.dustLife;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(18 * g.particleCount), _emit);

    this._quakeHits();
    this.ctx.shake.add(c.glitchShake * power, 1 / Math.max(0.05, c.shakeDuration), 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.glitchFlash * power);
    this.lightBoost = c.lightIntensity * c.glitchLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* The lash: footprints, scars, sparks, hits                           */
  /* ------------------------------------------------------------------ */

  _lash(dt, live) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    for (let i = 0; i < 2; i++) {
      const foot = this._feet[i];
      foot.valid = live && this._footprint(i, foot.now);
      if (!foot.valid) {
        foot.lastValid = false;
        continue;
      }
      if (!foot.lastValid) {
        foot.last.copy(foot.now);
        foot.lastValid = true;
        // A beam coming round onto the floor cracks on it.
        this.ctx.shake.add(0.06, 10, 30);
        continue;
      }
      const step = foot.now.distanceTo(foot.last);
      if (step > 4) {
        foot.last.copy(foot.now);
        continue;
      }
      if (step >= Math.max(0.02, c.scarMinStep)) {
        this._pushScar(foot.last, foot.now, 1);
        this._segmentHits(foot.last, foot.now);
        // Dark dust kicked off the fresh burn.
        const puffs = Math.round(this.dustEmitter.tick(dt, c.dustRate) * g.particleCount);
        if (puffs > 0) {
          this._resetEmit(time);
          _pos.copy(foot.now).setY(0.12);
          _emit.position = _pos;
          _emit.radius = 0.15;
          _emit.direction = _up;
          _emit.speed = c.dustLift;
          _emit.spread = 0.4;
          _emit.size = c.dustSize;
          _emit.life = c.dustLife;
          _emit.spin = 0.4;
          this.dust.emit(puffs, _emit);
        }
        _dir.subVectors(foot.now, foot.last).normalize();
        foot.last.copy(foot.now);
      } else {
        _dir.set(0, 0, 0);
      }

      // Sparks dragged along the way the beam sweeps.
      const n = Math.round(this.sparkEmitters[i].tick(dt, c.sparkRate) * g.particleCount);
      if (n > 0) {
        this._resetEmit(time);
        _a.copy(_dir).multiplyScalar(0.9).addScaledVector(_up, 0.6);
        if (_a.lengthSq() < 1e-4) _a.copy(_up);
        _a.normalize();
        _pos.copy(foot.now).setY(0.05);
        _emit.position = _pos;
        _emit.radius = 0.08;
        _emit.direction = _a;
        _emit.speed = c.sparkSpeed;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.55;
        _emit.size = c.sparkSize;
        _emit.life = c.sparkLife;
        _emit.lifeVariance = 0.5;
        this.sparks.emit(n, _emit);
      }
    }
  }

  /** Lay a scar segment into the ring buffer the ground shader reads. */
  _pushScar(a, b, strength) {
    const u = this.scarMaterial.uniforms;
    const i = this._scarCursor;
    u.uSegA.value[i].set(a.x, a.z, b.x, b.z);
    u.uSegB.value[i].set(this.age, strength);
    this._scarCursor = (i + 1) % MAX_SCARS;
    this._scarCount = Math.min(MAX_SCARS, this._scarCount + 1);
  }

  /** Motes off the star and along the beams. */
  _starFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.speed = c.moteSpeed;
    _emit.spread = 1;
    for (let k = 0; k < n; k++) {
      const i = k & 1;
      const s = Math.random() < 0.35 ? 0 : Math.random() * 0.7;
      this._beamPoint(i, s, _pos);
      if (_pos.y < 0.05) continue;
      _emit.position = _pos;
      _emit.radius = s === 0 ? c.starRadius : 0.12;
      _emit.direction = this._beamStates[i].m;
      this.motes.emit(1, _emit);
    }
  }

  /** While pinned: a fountain of sparks off the floor round the pin. */
  _pinFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.sparkEmitters[0].tick(dt, c.sparkRate * 1.5) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _pos.copy(this._starPos).setY(0.05);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed * 1.2;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.2;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  _segmentHits(a, b) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const half = Math.hypot(b.x - a.x, b.z - a.z) * 0.5;
    const found = field.findTargets(mx, mz, half + c.hitWidth, this._found);
    if (found.length === 0) return;
    const power = g.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = Math.max(1e-6, abx * abx + abz * abz);
    const inv = 1 / Math.sqrt(len2);
    for (const dummy of found) {
      const px = dummy.position.x - a.x;
      const pz = dummy.position.z - a.z;
      const t = saturate((px * abx + pz * abz) / len2);
      const d = Math.hypot(px - abx * t, pz - abz * t);
      if (d > c.hitWidth) continue;
      // Thrown the way the beam swept, with a little of the line in it.
      _dir.set(abx * inv, 0, abz * inv).addScaledVector(this.direction, 0.25).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, c.hitSlice >= 0.5)) continue;
      this._hitFx(dummy.position, _dir, 0.6);
    }
  }

  _quakeHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = Math.max(0.3, c.glitchRadius);
    const found = field.findTargets(this._starPos.x, this._starPos.z, R, this._found);
    for (const dummy of found) {
      const dx = dummy.position.x - this._starPos.x;
      const dz = dummy.position.z - this._starPos.z;
      const d = Math.hypot(dx, dz);
      const close = 1 - saturate(d / R);
      if (d > 1e-3) _dir.set(dx / d, 0, dz / d);
      else _dir.copy(this.direction);
      this._force.impulse = lerp(c.hitImpulse, c.glitchImpulse, close) * power;
      this._force.lift = lerp(c.hitLift, c.glitchLift, close) * power;
      this._force.spin = c.glitchSpin;
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._hitFx(dummy.position, _dir, 1);
    }
  }

  _hitFx(at, dir, scale) {
    const c = settings[ID];
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(1.0);
    _emit.position = _pos;
    _emit.radius = 0.25;
    _emit.direction = dir;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(36 * scale * g.particleCount), _emit);
    _emit.speed = c.moteSpeed * 3;
    _emit.size = c.moteSize * 1.3;
    _emit.life = c.moteLife;
    this.motes.emit(Math.round(24 * scale * g.particleCount), _emit);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.7 * scale);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.star.visible = false;
    this.beams[0].visible = false;
    this.beams[1].visible = false;
    this.loops.visible = false;
    this.strobe.visible = false;
    this.lens.visible = false;
    this.scars.visible = false;
    this._scarCount = 0;
    this._scarCursor = 0;
  }

  dispose() {
    this.beamGeometry.dispose();
    this.loopGeometry.dispose();
    this.sphereGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.scarMaterial.dispose();
    this.starMaterial.dispose();
    this.beamMaterials[0].dispose();
    this.beamMaterials[1].dispose();
    this.loopMaterial.dispose();
    this.strobeMaterial.dispose();
    this.lensMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('✴  Pulsar Lash');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'star speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'scars cool over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightStrobe', 0, 1, 0.01, 'blinks with the beams');

  const up = folder.addFolder('1 · Spin-up');
  R(up, c, 'handForward', -1, 3, 0.01, 'forms in front (m)');
  R(up, c, 'handSide', -1, 1, 0.01, 'to the right (m)');
  R(up, c, 'handHeight', 0.2, 3, 0.01, 'height (m)');
  R(up, c, 'spinUpTime', 0, 2, 0.01, 'spins up for (s)');
  R(up, c, 'flightHeight', 0.3, 5, 0.01, 'flight height (m)');
  R(up, c, 'starBob', 0, 1, 0.01, 'wobble (m)');

  const star = folder.addFolder('2 · The star');
  R(star, c, 'starRadius', 0.02, 2, 0.005, 'radius (m)');
  R(star, c, 'starGlow', 0, 20, 0.05, 'crust glow');
  R(star, c, 'hotspotGlow', 0, 12, 0.05, 'polar hot-spots');
  R(star, c, 'surfaceScale', 0.2, 12, 0.05, 'crust scale');
  R(star, c, 'surfaceSpeed', 0, 8, 0.05, 'crust crawl');
  Editor.gradient(star, c, 'colorStar', 'crust gradient');

  const beams = folder.addFolder('3 · Spin & beams');
  R(beams, c, 'spinRate', 0, 8, 0.01, 'revolutions/second');
  R(beams, c, 'inclination', 0, 90, 0.5, 'beam inclination (°)');
  R(beams, c, 'axisTilt', -45, 45, 0.5, 'spin axis tilt (°)');
  R(beams, c, 'beamLength', 0.5, 20, 0.05, 'reach (m)');
  R(beams, c, 'beamRootRadius', 0.005, 0.5, 0.001, 'root radius (m)');
  R(beams, c, 'beamTipRadius', 0.005, 2, 0.005, 'end radius (m)');
  R(beams, c, 'beamLag', -3, 3, 0.01, 'curl against the spin (rad)');
  R(beams, c, 'beamGlow', 0, 20, 0.05, 'core glow');
  R(beams, c, 'beamEdgeGlow', 0, 10, 0.05, 'rim glow');
  R(beams, c, 'beamCore', 0.2, 10, 0.05, 'core thinness');
  R(beams, c, 'beamFalloff', 0.05, 5, 0.01, 'dims toward the end');
  R(beams, c, 'beamFlow', 0, 40, 0.1, 'flow (m/s)');
  R(beams, c, 'beamFlowScale', 0.1, 6, 0.01, 'flow scale');
  R(beams, c, 'pulseRate', 0, 20, 0.05, 'pulses/second');
  R(beams, c, 'pulseSpacing', 0.1, 6, 0.01, 'pulse spacing (m)');
  R(beams, c, 'pulseGlow', 0, 8, 0.05, 'pulse glow');
  R(beams, c, 'beamOpacity', 0, 1, 0.01, 'opacity');
  R(beams, c, 'softFade', 0.01, 2, 0.01, 'soft floor (m)');
  Editor.gradient(beams, c, 'colorBeam', 'beam gradient');

  const field = folder.addFolder('4 · Magnetosphere');
  R(field, c, 'fieldLines', 0, 10, 1, 'loops');
  R(field, c, 'fieldShell', 0.1, 4, 0.01, 'reach (m)');
  R(field, c, 'fieldRadius', 0.002, 0.1, 0.001, 'thickness (m)');
  R(field, c, 'fieldTwist', -4, 4, 0.01, 'twist (rad)');
  R(field, c, 'fieldGlow', 0, 10, 0.05, 'glow');
  R(field, c, 'fieldFlow', 0, 40, 0.1, 'charge flow');
  field.addColor(c, 'colorField').name('field');
  field.addColor(c, 'colorFieldHot').name('charge');

  const strobe = folder.addFolder('5 · Strobe & lens');
  R(strobe, c, 'flareSize', 0.05, 5, 0.01, 'corona radius (m)');
  R(strobe, c, 'flareGlow', 0, 10, 0.05, 'steady glow');
  R(strobe, c, 'strobeGlow', 0, 15, 0.05, 'blink glow');
  R(strobe, c, 'strobeSharpness', 1, 40, 0.5, 'blink sharpness');
  R(strobe, c, 'flareRays', 1, 12, 1, 'spikes');
  strobe.addColor(c, 'colorFlareCore').name('core');
  strobe.addColor(c, 'colorFlareHalo').name('halo');
  R(strobe, c, 'lensRadius', 0.1, 6, 0.01, 'lens radius (m)');
  R(strobe, c, 'lensStrength', 0, 3, 0.01, 'lens strength');

  const scars = folder.addFolder('6 · Scars');
  R(scars, c, 'scarWidth', 0.005, 0.5, 0.001, 'slit half-width (m)');
  R(scars, c, 'scarGlowWidth', 0.01, 2, 0.005, 'glow width (m)');
  R(scars, c, 'scarGlow', 0, 15, 0.05, 'glow');
  R(scars, c, 'scarCool', 0.05, 5, 0.01, 'cools over (s)');
  R(scars, c, 'scarJitter', 0, 0.5, 0.005, 'wander (m)');
  R(scars, c, 'scarCharOpacity', 0, 1, 0.01, 'burn opacity');
  R(scars, c, 'scarMinStep', 0.02, 1, 0.01, 'segment length (m)');
  scars.addColor(c, 'colorScarA').name('white-hot');
  scars.addColor(c, 'colorScarB').name('hot');
  scars.addColor(c, 'colorScarC').name('cooling');
  scars.addColor(c, 'colorScarChar').name('burn');

  const fx = folder.addFolder('7 · Particles');
  R(fx, c, 'sparkRate', 0, 1000, 1, 'sparks/second per beam');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');
  R(fx, c, 'moteRate', 0, 600, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteSpeed', 0, 8, 0.05, 'mote speed');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'dustRate', 0, 300, 1, 'dust/second');
  R(fx, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
  R(fx, c, 'dustLift', 0, 5, 0.01, 'dust rise');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');

  const quake = folder.addFolder('8 · Over-spin, quake & pin');
  R(quake, c, 'overspinTime', 0.02, 3, 0.01, 'over-spins for (s)');
  R(quake, c, 'overspinRate', 1, 15, 0.05, 'over-spin (× rate)');
  R(quake, c, 'glitchSnap', 0.01, 0.5, 0.005, 'locks vertical over (s)');
  R(quake, c, 'pinTime', 0, 3, 0.01, 'pinned for (s)');
  R(quake, c, 'pinWidth', 0.2, 5, 0.01, 'pinned thickness (×)');
  R(quake, c, 'collapseTime', 0.05, 3, 0.01, 'winks out over (s)');
  R(quake, c, 'quakeScars', 0, 16, 1, 'radial burns');
  R(quake, c, 'quakeScarLength', 0.1, 8, 0.05, 'burn length (m)');
  R(quake, c, 'quakeSparks', 0, 600, 1, 'sparks');
  R(quake, c, 'glitchRadius', 0.3, 10, 0.05, 'throws within (m)');
  R(quake, c, 'burstSize', 0, 10, 0.05, 'storm shell (m)');
  R(quake, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(quake, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(quake, c, 'glitchFlash', 0, 1, 0.01, 'flash');
  R(quake, c, 'glitchShake', 0, 1.5, 0.01, 'camera knock');
  R(quake, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(quake, c, 'glitchLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(quake, c, 'travelRumble', 0, 1, 0.01, 'rumble while lashing');
  quake.addColor(c, 'colorBurstA').name('shell inner');
  quake.addColor(c, 'colorBurstB').name('shell mid');
  quake.addColor(c, 'colorBurstC').name('shell outer');
  quake.addColor(c, 'colorShockA').name('shockwave');
  quake.addColor(c, 'colorShockB').name('shockwave hot');
  quake.addColor(c, 'colorFlash').name('flash');

  const hits = folder.addFolder('9 · Hits');
  R(hits, c, 'hitWidth', 0.1, 3, 0.01, 'catches within (m)');
  R(hits, c, 'hitImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(hits, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(hits, c, 'hitSlice', 0, 1, 1, 'slices (0/1)');
  R(hits, c, 'glitchImpulse', 0, 40, 0.1, 'quake throw (m/s)');
  R(hits, c, 'glitchLift', 0, 25, 0.05, 'quake lift (m/s)');
  R(hits, c, 'glitchSpin', 0, 8, 0.01, 'quake tumble');

  folder.close();
  return folder;
}
