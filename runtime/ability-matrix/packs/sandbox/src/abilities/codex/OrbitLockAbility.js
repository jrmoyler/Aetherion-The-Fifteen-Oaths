import { InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, DynamicDrawUsage } from 'three';
import { Ability } from '../Ability.js';
import {
  createOrbitTubeGeometry,
  createPlanetGeometry,
  createVortexGeometry,
  createQuadGeometry
} from '../../assets/codex/OrbitLockGeometry.js';
import {
  createOrbitMaterial,
  createPlanetMaterial,
  createStarMaterial,
  createDialMaterial,
  createSlamWarpMaterial,
  createVortexMaterial,
  createCoreMaterial,
  createLensMaterial
} from '../../materials/codex/OrbitLockMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'orbitlock';

const TAU = Math.PI * 2;
/** Hard ceilings — the editor's sliders stop here. */
const MAX_ORBITS = 5;
const MAX_PLANETS = 16;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _axis = new Vector3();
const _k = new Vector3();
const _scale = new Vector3();
const _quat = new Quaternion();
const _mat = new Matrix4();
const _floor = new Vector3();
const _hand = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * ORBIT LOCK — an orrery thrown over the circle, locked, and dropped on it.
 *
 * Gravity is the identity, so the orrery turns round something that *eats
 * light*: when the thrown star bursts it collapses into a black **singularity**
 * with a burning photon ring, light bends round it (a lens on
 * `LAYER.DISTORTION`), and a dark **accretion vortex** — log-spiral arms of
 * infalling matter, deep violet-black between the arms, white-hot at the lip
 * — spins up under the planets. The planets are dense, lit **moons** of dark
 * rock with molten seams, not glowing balls. When the locked ring slams down
 * the vortex lands with it and becomes the **well** on the floor; through the
 * linger the embedded moons are dragged round and *in* along the spiral,
 * faster as they fall closer (Kepler), and swallowed one by one as the well
 * contracts and the singularity sinks into the floor.
 *
 * A zone cast in five beats. A **star** is lobbed from the caster's hand to a
 * point high over the circle. There it **bursts** into a handful of planets
 * that fly out onto two or three steeply tilted orbits, each a glowing track
 * with a comet trail behind every planet, turning fast, counter-rotating — the
 * anticipation, readable from anywhere. Then the orbits **lock**: their tilts
 * flatten, their radii open out to the circle, their planets slide into even
 * spacing on one ring, with a click of light. The locked ring hangs for a
 * beat and **drops**: all the planets fall together and **slam** into the
 * floor round the circle's rim, each one cratering, throwing sparks and dust,
 * with a shockwave, a ripple through the air and everything inside launched.
 * Then the planets **burn out** where they landed and the dial on the floor
 * erodes away.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seed star** — a camera-facing four-point star on an arc.
 *   2. **the orbits** (`createOrbitMaterial`) — one tube per orbit laid on a
 *      tilted circle in the vertex stage; additive track + comet trails
 *      computed from the orbit's phase and count, cross-faded to the locked
 *      ring's as the lock closes.
 *   3. **the planets** (`createPlanetMaterial`) — an `InstancedMesh` of
 *      emissive, banded, violet-limbed spheres, placed here on the same tilted
 *      circles (`_orbitPoint` is the CPU twin of the tube's vertex stage).
 *   4. **the dial** (`createDialMaterial`) — the orrery sigil on the floor:
 *      the landing ring, a ticked band, spokes. Draws itself round while the
 *      orbits form, brightens as the ring falls, flares, erodes.
 *   5. **star dust, sparks, dust** — additive dust shed by every planet;
 *      streaks off them as they fall; sparks and non-additive dust puffs at
 *      every crater.
 *   6. **the slam** — per-planet SCORCH craters, a SHOCKWAVE, an AIR shell
 *      squashed flat, a ripple on `LAYER.DISTORTION`, flash, shake, light.
 *   7. **the hit** — `handlesOwnHits`: nothing is touched until the slam; then
 *      everything inside the ring is launched up and out.
 *   8. **the singularity** (`createCoreMaterial`) — opaque black core with a
 *      photon-ring fresnel, `LAYER.SHAPED`; the orrery's centre.
 *   9. **the accretion vortex / well** (`createVortexMaterial`) — the hero
 *      form: an authored polar grid wound into spiral ridges, tilted onto the
 *      orrery's plane, sagging into a well while it hangs, lying on the floor
 *      after the slam and contracting as it swallows the moons.
 *  10. **the lens** (`createLensMaterial`) — light bent round the core.
 *
 * ## The editor rule
 *
 * A cast captures a seed, a bearing for the orbits and integrated phases. The
 * timeline is resolved from `settings.orbitlock` every frame, so dragging
 * `lockTime` or `zoneRadius` while the orrery turns re-times and re-sizes it.
 */
export class OrbitLockAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Planets drawn. HUD readout only. */
  get instanceCount() {
    return this.planetMesh.visible ? this.planetMesh.count : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.tubeGeometry = createOrbitTubeGeometry(180, 8);
    this.planetGeometry = createPlanetGeometry(4);
    this.vortexGeometry = createVortexGeometry(40, 192);
    this.quadGeometry = createQuadGeometry();

    /* ---- layer 4: the dial, under everything ---- */
    this.dialMaterial = createDialMaterial();
    this.dial = this._mesh(this.quadGeometry, this.dialMaterial, LAYER.VFX, 2);

    /* ---- layer 9: the accretion vortex / well ---- */
    this.vortexMaterial = createVortexMaterial();
    this.vortex = this._mesh(this.vortexGeometry, this.vortexMaterial, LAYER.VFX, 6);

    /* ---- layer 8: the singularity — opaque, parameter-placed, so SHAPED ---- */
    this.coreMaterial = createCoreMaterial();
    this.core = this._mesh(this.planetGeometry, this.coreMaterial, LAYER.SHAPED, 9);

    /* ---- layer 10: the lens ---- */
    this.lensMaterial = createLensMaterial();
    this.lens = this._mesh(this.quadGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /* ---- layer 2: the orbits ---- */
    this.orbitMaterials = [];
    this.orbitMeshes = [];
    this.orbitStates = [];
    for (let k = 0; k < MAX_ORBITS; k++) {
      const m = createOrbitMaterial();
      this.orbitMaterials.push(m);
      this.orbitMeshes.push(this._mesh(this.tubeGeometry, m, LAYER.VFX, 12));
      this.orbitStates.push({
        center: new Vector3(),
        radius: 1,
        tilt: 0,
        yaw: 0,
        phase: 0,
        count: 1,
        dirSign: 1,
        phaseG: 0,
        countG: 1,
        lock: 0,
        lockFlash: 0,
        fade: 1
      });
    }

    /* ---- layer 3: the planets ---- */
    this.planetMaterial = createPlanetMaterial();
    this.planetMesh = new InstancedMesh(this.planetGeometry, this.planetMaterial, MAX_PLANETS);
    this.planetMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // Solid, lit rock: SHAPED (lit, kept out of the depth prepass).
    this.planetMesh.layers.set(LAYER.SHAPED);
    this.planetMesh.frustumCulled = false;
    this.planetMesh.renderOrder = 10;
    this.planetMesh.visible = false;
    this.group.add(this.planetMesh);

    /* ---- layer 1: the star ---- */
    this.starMaterial = createStarMaterial();
    this.star = this._mesh(this.quadGeometry, this.starMaterial, LAYER.VFX, 16);

    /* ---- layer 6: the ripple ---- */
    this.warpMaterial = createSlamWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._starState = { center: new Vector3(), size: 0.5, intensity: 0, seed: 0 };
    this._planetState = { seed: 0, heat: 0, dissolve: 0 };
    this._dialState = { center: new Vector3(), zone: 4, spokes: 9, spin: 0, reveal: 0, intensity: 0, erode: 0, seed: 0 };
    this._warpState = { center: new Vector3(), zone: 4, progress: 0 };
    this._vortexState = {
      center: new Vector3(),
      tilt: 0,
      yaw: 0,
      inner: 0.5,
      outer: 2,
      height: 0.4,
      spin: 0,
      sag: 0,
      opacity: 0,
      dissolve: 0,
      flare: 0,
      seed: 0
    };
    this._coreState = { center: new Vector3(), size: 0, squash: 0, seed: 0 };
    this._lensState = { center: new Vector3(), size: 1, hole: 0.3, strength: 0 };

    /** Planet positions this frame — read by the dust and the slam. */
    this._planetPos = [];
    for (let i = 0; i < MAX_PLANETS; i++) this._planetPos.push(new Vector3());

    this._centre = new Vector3();
    this._target = new Vector3();
    this._orbitPhase = new Float32Array(MAX_ORBITS);
    this._phaseG = 0;
    this._spin = 0;
    this._tumble = 0;
    this._yaw = 0;
    this._seed = 0;
    this._locked = false;
    this._slammed = false;

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

    this.dust = particles.get('orbitlock.dust', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.dust.uniforms.uSizeIn.value = 0.05;
    this.dust.uniforms.uFadeIn.value = 0.05;
    this.dust.uniforms.uFadeOut.value = 0.6;
    this.dust.uniforms.uEndSize.value = 0.2;
    this.dust.uniforms.uDrag.value = 1.6;

    this.sparks = particles.get('orbitlock.sparks', {
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
    this.sparks.uniforms.uDrag.value = 1.1;

    this.smoke = particles.get('orbitlock.smoke', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.smoke.uniforms.uSizeIn.value = 0.15;
    this.smoke.uniforms.uFadeIn.value = 0.1;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 2.4;
    this.smoke.uniforms.uDrag.value = 2.0;

    this.dustEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** form → lock → hold → drop → slam hold. */
  _beats() {
    const c = settings[ID];
    const t0 = Math.max(0.02, c.formTime);
    const t1 = t0 + Math.max(0.02, c.lockTime);
    const t2 = t1 + Math.max(0, c.lockHold);
    const t3 = t2 + Math.max(0.02, c.dropTime);
    return { t0, t1, t2, t3, end: t3 + Math.max(0.05, c.slamHold) };
  }

  get impactDuration() {
    return Math.max(0.1, this._beats().end * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 13.1) * Math.sin(this.age * 4.3 + 0.7));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry on the CPU                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * A point on a tilted circle — the CPU twin of `ORBIT_VERTEX` (keep them
   * together): the horizontal ring at `theta`, turned by `tilt` about the
   * horizontal axis at bearing `yaw`.
   */
  _orbitPoint(centre, radius, tilt, yaw, theta, out) {
    _k.set(Math.cos(yaw), 0, Math.sin(yaw));
    out.set(Math.cos(theta), 0, Math.sin(theta));
    // Rodrigues: v cos a + (k × v) sin a + k (k·v)(1 − cos a)
    const ca = Math.cos(tilt);
    const sa = Math.sin(tilt);
    const kd = _k.dot(out);
    _axis.crossVectors(_k, out);
    out.multiplyScalar(ca).addScaledVector(_axis, sa).addScaledVector(_k, kd * (1 - ca));
    return out.multiplyScalar(radius).add(centre);
  }

  /** Orbit k's planet count when `n` planets are dealt round `orbits` orbits. */
  _countOn(k, n, orbits) {
    return k >= n ? 0 : Math.floor((n - k - 1) / orbits) + 1;
  }

  _handPoint(out) {
    const c = settings[ID];
    return out.copy(this.origin).addScaledVector(this.direction, c.handForward).setY(c.handHeight);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.dustEmitter.reset();
    this.streakEmitter.reset();
    this._seed = Math.random() * 100;
    this._yaw = Math.random() * TAU;
    for (let k = 0; k < MAX_ORBITS; k++) this._orbitPhase[k] = Math.random() * TAU;
    this._phaseG = Math.random() * TAU;
    this._spin = 0;
    this._tumble = 0;
    this._locked = false;
    this._slammed = false;
    this._vortexState.seed = this._seed;
    this._vortexState.spin = 0;
    this._vortexState.opacity = 0;
    this._vortexState.dissolve = 0;
    this._vortexState.flare = 0;
    this._coreState.seed = this._seed;
    this._coreState.size = 0;
    this._lensState.strength = 0;
    this.vortex.visible = false;
    this.core.visible = false;
    this.lens.visible = false;

    this.pointAt(1, this._target);
    this._target.y = 0;
    this._centre.copy(this._target);

    this._starState.seed = this._seed;
    this._planetState.seed = this._seed;
    this._planetState.heat = 0;
    this._planetState.dissolve = 0;
    this._dialState.seed = this._seed;
    this._dialState.spin = 0;
    this._dialState.reveal = 0;
    this._dialState.intensity = 0;
    this._dialState.erode = 0;
    this._warpState.progress = 0;

    this.star.visible = true;
    this.planetMesh.visible = false;
    this.dial.visible = false;
    this.warp.visible = false;
    for (const m of this.orbitMeshes) m.visible = false;

    this._handPoint(this._starState.center);
    this._starState.size = 0.01;
    this._starState.intensity = 0;
    this.starMaterial.userData.sync(this._starState);
    this._syncParticles();
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

  _syncParticles() {
    const c = settings[ID];
    const g = settings.global;
    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uGravity.value.set(0, c.dustLift, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uGlow.value = c.dustGlow * g.glow;
    d.uTurbulence.value = 0.6 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const s = this.sparks.uniforms;
    s.uGravity.value.set(0, -c.sparkGravity, 0);
    s.uStretch.value = c.sparkStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sparkGlow * g.glow;
    s.uTurbulence.value = 0.15 * g.turbulence;

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const m = this.smoke.uniforms;
    m.uGravity.value.set(0, 0.5, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.smokeOpacity * g.opacity;
    m.uTurbulence.value = 0.5 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the star is thrown                                         */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const st = this._starState;
    this._handPoint(_hand);
    _pos.copy(this._target).setY(c.hangHeight);
    const u = Easing.inOutQuad(this.u);
    st.center.lerpVectors(_hand, _pos, u);
    st.center.y += c.arcHeight * Math.sin(Math.PI * u);
    st.size = c.starSize * lerp(0.6, 1, saturate(this.age / 0.15));
    st.intensity = saturate(this.age / 0.12);
    this.starMaterial.userData.sync(st);
    this._syncParticles();

    this._dustAt(dt, st.center, c.dustRate * 0.6, 0.12);
    this.position.copy(st.center);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — form, lock, drop, slam                                     */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    _pos.copy(this._target).setY(c.hangHeight);

    // The star bursts: a puff of dust and sparks where the orrery will turn.
    this._resetEmit(time);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.speed = c.sparkSpeed * 0.6;
    _emit.spread = 1.5;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife * 0.7;
    this.sparks.emit(Math.round(40 * g.particleCount), _emit);
    _emit.speed = 3;
    _emit.size = c.dustSize * 1.5;
    _emit.life = c.dustLife;
    this.dust.emit(Math.round(60 * g.particleCount), _emit);

    this.planetMesh.visible = true;
    this.dial.visible = true;
    this.vortex.visible = true;
    this.core.visible = true;
    this.lens.visible = true;
    this.lightBoost = c.lightIntensity * 0.6;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const B = this._beats();
    const zone = c.zoneRadius;
    const N = Math.max(3, Math.min(MAX_PLANETS, Math.round(c.planets)));
    const K = Math.max(1, Math.min(MAX_ORBITS, Math.round(c.orbits), N));

    // Seconds into the impact phase, in settings time.
    const tau = t <= 1 ? (t * this.impactDuration) / Math.max(0.01, g.lifetime) : B.end;
    const ft = t > 1 ? saturate(t - 1) : 0;

    const form = saturate(tau / B.t0);
    const L = Easing.inOutCubic(saturate((tau - B.t0) / (B.t1 - B.t0)));
    const drop = saturate((tau - B.t2) / (B.t3 - B.t2));
    const slamT = tau - B.t3;

    if (!this._locked && tau >= B.t1) this._lock(N);
    if (!this._slammed && tau >= B.t3) this._slam(N);

    /* integrated turns — stop dead on the slam */
    const turning = this._slammed ? 0 : 1;
    // After the slam, the linger clock (settings seconds) drives the swallowing.
    const lingerS = this._slammed ? (t <= 1 ? slamT : B.end - B.t3 + ft * c.lifetime) : 0;
    const pullT = saturate((lingerS - c.swallowDelay) / Math.max(0.05, c.swallowTime));
    const pull = Easing.inCubic(pullT);
    for (let k = 0; k < K; k++) {
      const sign = k % 2 === 0 ? 1 : -1;
      this._orbitPhase[k] += c.orbitSpin * sign * (1 + 0.18 * k) * (1 - 0.7 * L) * dt * g.animationSpeed * turning;
    }
    this._phaseG += c.lockSpin * dt * g.animationSpeed * turning;
    this._tumble += c.planetTumble * dt * g.animationSpeed * (this._slammed ? 0.15 : 1);
    this._dialState.spin += c.sigilSpin * dt * g.animationSpeed * (this._slammed ? 0.2 : 1);

    /* where the orrery is */
    const floorY = c.planetSize * 0.55;
    const ce = this._centre.copy(this._target);
    const hangBob = 0.08 * Math.sin(this.age * 3.1) * (1 - drop);
    if (this._slammed) {
      ce.y = floorY - c.sinkDepth * Easing.outCubic(saturate(slamT / 0.25)) - c.planetSize * 1.2 * smoothstep(0.4, 1, ft);
    } else {
      ce.y = lerp(c.hangHeight + hangBob, floorY, Easing.inCubic(drop));
    }
    const radius = lerp(c.orbitRadius, zone, L) * Easing.outBack(form);
    // Embedded moons are dragged in along the spiral, faster as they close (Kepler).
    const swallowR = zone * lerp(1, c.swallowTo, pull);
    if (this._slammed) {
      this._phaseG += c.swallowSpin * Math.sqrt(zone / Math.max(0.3, swallowR)) * smoothstep(0, 0.15, pullT) * dt * g.animationSpeed;
    }

    /* the orbits */
    const lockFlash = this._locked ? Math.exp(-(tau - B.t1) * 7) : 0;
    const ringFade = (1 - smoothstep(0, 0.3, slamT)) * smoothstep(0, 0.6, form);
    for (let k = 0; k < MAX_ORBITS; k++) {
      const mesh = this.orbitMeshes[k];
      // Once locked, one ring carries them all; the rest fold into it.
      mesh.visible = k < K && ringFade > 0.002 && (k === 0 || L < 0.999);
      if (!mesh.visible) continue;
      const s = this.orbitStates[k];
      s.center.copy(ce);
      s.radius = radius;
      s.tilt = this._tiltNow(k, K, L, drop);
      s.yaw = this._yawNow(k, K, L);
      s.phase = this._orbitPhase[k];
      s.count = Math.max(1, this._countOn(k, N, K));
      s.dirSign = k % 2 === 0 ? 1 : -1;
      s.phaseG = this._phaseG;
      s.countG = N;
      s.lock = L;
      s.lockFlash = lockFlash;
      s.fade = ringFade * (k === 0 ? 1 : 1 - L * 0.5);
      this.orbitMaterials[k].userData.sync(s);
    }

    /* the planets */
    const size = c.planetSize * Easing.outBack(saturate(form * 1.3));
    for (let i = 0; i < N; i++) {
      const k = i % K;
      const j = Math.floor(i / K);
      const nk = Math.max(1, this._countOn(k, N, K));
      const thOrbit = this._orbitPhase[k] + (j * TAU) / nk;
      const thLock = this._phaseG + (i * TAU) / N;
      const th = lerp(thOrbit, thLock, L);
      const tilt = this._tiltNow(k, K, L, drop);
      const yaw = this._yawNow(k, K, L);
      const p = this._orbitPoint(ce, this._slammed ? swallowR : radius, tilt, yaw, th, this._planetPos[i]);
      if (this._slammed) p.y -= c.planetSize * 1.6 * smoothstep(0.7, 1, pullT);
      _axis.set(Math.sin(i * 2.3 + this._seed), 1, Math.cos(i * 1.7 + this._seed)).normalize();
      _quat.setFromAxisAngle(_axis, this._tumble * (0.6 + 0.4 * ((i * 7) % 5) / 5));
      const sz = size * (0.85 + 0.3 * (((i * 13) % 7) / 7));
      _scale.set(sz, sz, sz);
      _mat.compose(p, _quat, _scale);
      this.planetMesh.setMatrixAt(i, _mat);
    }
    this.planetMesh.count = N;
    this.planetMesh.instanceMatrix.needsUpdate = true;
    const ps = this._planetState;
    ps.heat = (this._slammed ? Math.exp(-slamT * 5) : 0) + lockFlash * 0.4;
    ps.dissolve = Math.max(smoothstep(0.55, 1, ft), smoothstep(0.85, 1, pullT));
    this.planetMesh.visible = ps.dissolve < 0.999;
    this.planetMaterial.userData.sync(ps);

    /* the singularity, its lens and the accretion vortex */
    this._syncWell(dt, ce, form, L, drop, slamT, ft, pullT, zone);

    /* the star: blooms as it bursts, then goes out */
    const st = this._starState;
    st.center.copy(this._target).setY(c.hangHeight);
    st.size = c.starSize * (1 + 2.5 * Easing.outCubic(form));
    st.intensity = (1 - form) * 1.6;
    this.star.visible = st.intensity > 0.01;
    this.starMaterial.userData.sync(st);

    /* the dial */
    const ds = this._dialState;
    ds.center.copy(this._target);
    ds.zone = zone;
    ds.spokes = N;
    ds.reveal = saturate(tau / (B.t1 * 0.9));
    ds.intensity = this._slammed
      ? lerp(0.55, 2.2, Math.exp(-slamT * 4)) * (1 - smoothstep(0.6, 1, ft))
      : 0.2 + 0.35 * L + 0.8 * Easing.inQuad(drop) + lockFlash * 0.6;
    ds.erode = smoothstep(0.2, 1, ft);
    this.dial.visible = ds.intensity > 0.002 && ds.erode < 0.999;
    this.dialMaterial.userData.sync(ds);

    /* the ripple */
    if (this._slammed) {
      const wt = saturate(slamT / Math.max(0.05, c.warpTime));
      this._warpState.progress = Easing.outCubic(wt);
      this._warpState.center.copy(this._target);
      this._warpState.zone = zone;
      this.warp.visible = wt < 1;
      this.warpMaterial.userData.sync(this._warpState);
    }

    /* particles */
    this._syncParticles();
    if (!this._slammed) {
      for (let i = 0; i < N; i++) this._dustAt(dt / N, this._planetPos[i], c.dustRate, c.planetSize * 0.6);
      if (drop > 0) this._dropStreaks(dt, N);
    } else if (pullT < 1) {
      // Matter torn off the moons as they are dragged in: a spiral of dust.
      for (let i = 0; i < N; i++) this._dustAt(dt / N, this._planetPos[i], c.dustRate * (0.25 + 0.5 * pullT), c.planetSize);
      this.ctx.shake.rumble(c.swallowRumble * pullT * (1 - pullT) * 4, dt);
    }

    this.position.copy(ce);
    this.position.y = Math.max(0.6, ce.y);
    if (!this._slammed) this.ctx.shake.rumble(0.04 * drop, dt);
  }

  /**
   * The gravity well. Hanging, it is a tilted, sagging vortex on the locked
   * plane round the singularity, growing from the free orbit's size to the
   * circle as the orbits lock; it falls with the ring; on the floor it lies
   * flat, flares, then contracts with the swallowing and dissolves inward.
   */
  _syncWell(dt, ce, form, L, drop, slamT, ft, pullT, zone) {
    const c = settings[ID];
    const g = settings.global;
    const vs = this._vortexState;
    const cs = this._coreState;
    const ls = this._lensState;
    const grownR = lerp(c.orbitRadius * 1.15, zone * c.vortexReach, L) * Easing.outCubic(form);
    vs.spin += c.vortexSpin * dt * g.animationSpeed * (1 + 1.5 * L + 2.5 * pullT);
    vs.yaw = Math.atan2(this.side.z, this.side.x);
    if (!this._slammed) {
      vs.center.copy(ce);
      vs.tilt = c.lockLean * (1 - Easing.inQuad(drop)) * smoothstep(0, 1, L + 0.4);
      vs.outer = grownR;
      vs.inner = c.coreSize * 1.15 * Easing.outBack(form);
      vs.height = c.vortexHeight * (0.6 + 0.4 * L);
      vs.sag = c.wellSag * L * (1 - drop);
      vs.opacity = smoothstep(0, 0.5, form);
      vs.flare = 0;
      vs.dissolve = 0;
      cs.center.copy(ce);
      cs.size = c.coreSize * Easing.outBack(form);
      cs.squash = 0;
    } else {
      vs.center.copy(this._target).setY(0.03);
      vs.tilt = 0;
      vs.outer = zone * c.vortexReach * lerp(1, Math.max(c.swallowTo, 0.15) + 0.1, Easing.inCubic(pullT));
      vs.inner = c.coreSize * 1.15 * (1 - 0.5 * pullT);
      vs.height = c.vortexHeight * (1 + 0.8 * Math.exp(-slamT * 4));
      vs.sag = 0;
      vs.opacity = 1;
      vs.flare = Math.exp(-slamT * 5);
      vs.dissolve = smoothstep(0.5, 1, ft);
      cs.center.copy(this._target).setY(c.coreSize * 0.45 * (1 - smoothstep(0.3, 1, ft)));
      cs.size = c.coreSize * (1 + 0.3 * pullT) * (1 - smoothstep(0.6, 1, ft));
      cs.squash = 0.45;
    }
    this.vortex.visible = vs.opacity > 0.002 && vs.dissolve < 0.999;
    this.vortexMaterial.userData.sync(vs);
    this.core.visible = cs.size > 0.01;
    this.coreMaterial.userData.sync(cs);
    ls.center.copy(cs.center);
    ls.size = Math.max(cs.size, 0.05) * c.lensSize;
    ls.hole = 1 / Math.max(1.05, c.lensSize);
    ls.strength = smoothstep(0, 0.6, form) * (1 + 1.5 * (this._slammed ? Math.exp(-slamT * 3) : 0)) * (1 - smoothstep(0.6, 1, ft));
    this.lens.visible = ls.strength > 0.002 && cs.size > 0.01;
    this.lensMaterial.userData.sync(ls);
  }

  /** Orbit k's tilt before the lock: alternating sides, steepest first. */
  _tiltOf(k, K) {
    const c = settings[ID];
    const share = K <= 1 ? 1 : 1 - 0.35 * (k / (K - 1));
    return c.orbitTilt * share * (k % 2 === 0 ? 1 : -1);
  }

  /**
   * Orbit k's tilt now. Free, it is its own; as the lock closes every orbit
   * swings onto one plane — leaned toward the caster by `lockLean`, so the
   * locked ring reads as a ring and not a line from behind the caster — and
   * the lean comes out as it falls, so it lands flat.
   */
  _tiltNow(k, K, L, drop) {
    const c = settings[ID];
    return lerp(this._tiltOf(k, K), c.lockLean * (1 - Easing.inQuad(drop)), L);
  }

  /** Orbit k's tilt axis bearing now: its own, swung onto the caster's side axis as it locks. */
  _yawNow(k, K, L) {
    const own = this._yaw + (k * Math.PI) / K;
    const lean = Math.atan2(this.side.z, this.side.x);
    let d = (lean - own) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return own + d * L;
  }

  /** The click: every orbit is one ring now. */
  _lock(N) {
    const c = settings[ID];
    const g = settings.global;
    this._locked = true;
    this._resetEmit(frame.uTime.value);
    _emit.speed = c.sparkSpeed * 0.35;
    _emit.spread = 1.2;
    _emit.size = c.sparkSize * 0.8;
    _emit.life = c.sparkLife * 0.6;
    for (let i = 0; i < N; i++) {
      _emit.position = this._planetPos[i];
      this.sparks.emit(Math.round(c.lockSparks * g.particleCount), _emit);
    }
    this.ctx.flash.trigger(getColor(c.colorFlash), c.lockFlash * g.explosionIntensity);
    this.ctx.shake.add(0.12, 6, 18);
    this.lightBoost = c.lightIntensity * c.lockLight;
  }

  /** The ring hits the floor. */
  _slam(N) {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._slammed = true;
    _floor.copy(this._target);

    this.ctx.bursts.spawn(BurstMode.AIR, _floor, {
      radius: c.zoneRadius * c.burstSize * 0.3,
      endRadius: c.zoneRadius * c.burstSize * power,
      life: 0.55,
      intensity: c.burstIntensity,
      opacity: 0.5,
      fresnel: 2.2,
      displace: 0.3,
      turbulence: 1,
      squash: 0.3,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.zoneRadius * c.shockRadius * power,
      life: 0.6,
      width: 0.07,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.zoneRadius * 1.05,
      life: 1.1,
      intensity: 0.8,
      colorA: getColor(c.colorSmokeA),
      colorB: getColor(c.colorSmokeB)
    });

    this._resetEmit(time);
    for (let i = 0; i < N; i++) {
      const p = this._planetPos[i];
      _pos.copy(p).setY(0.05);
      this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
        radius: c.craterRadius,
        life: this.fadeDuration + c.slamHold,
        intensity: 1,
        colorA: getColor(c.colorCrater),
        colorB: getColor(c.colorCraterHot)
      });
      // Sparks up and out from the crater, away from the centre.
      _dir.set(p.x - _floor.x, 0, p.z - _floor.z).normalize().multiplyScalar(0.6).add(_up).normalize();
      _emit.position = _pos;
      _emit.radius = 0.1;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.7;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);
      _emit.radius = 0.3;
      _emit.speed = 1.6;
      _emit.spread = 1.0;
      _emit.size = c.smokeSize;
      _emit.life = c.smokeLife;
      _emit.spin = 0.6;
      this.smoke.emit(Math.round(c.smokeCount * g.particleCount), _emit);
    }

    // Everything inside the ring goes up and out.
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      const found = field.findTargets(_floor.x, _floor.z, c.zoneRadius * c.hitScale, this._found);
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      for (const dummy of found) {
        _dir.set(dummy.position.x - _floor.x, 0, dummy.position.z - _floor.z);
        if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
        else _dir.normalize();
        dummy.kill(_dir.x, _dir.z, this._force);
      }
    }

    this.warp.visible = true;
    this.ctx.shake.add(c.slamShake * power, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * power);
    this.lightBoost = c.lightIntensity * c.slamLight * power;
  }

  /** Star dust shed at a point (rate per second). */
  _dustAt(dt, at, rate, radius) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.dustEmitter.tick(dt, rate) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = at;
    _emit.radius = radius;
    _emit.speed = 0.4;
    _emit.spread = 1;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.lifeVariance = 0.5;
    this.dust.emit(n, _emit);
  }

  /** Streaks trailing up off the falling planets. */
  _dropStreaks(dt, N) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.streakEmitter.tick(dt, c.dropStreaks) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.direction = _up;
    _emit.speed = 3;
    _emit.spread = 0.05;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = 0.18;
    _emit.radius = c.planetSize * 0.5;
    for (let i = 0; i < n; i++) {
      _emit.position = this._planetPos[(Math.random() * N) | 0];
      this.sparks.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.star.visible = false;
    this.planetMesh.visible = false;
    this.dial.visible = false;
    this.warp.visible = false;
    this.vortex.visible = false;
    this.core.visible = false;
    this.lens.visible = false;
    for (const m of this.orbitMeshes) m.visible = false;
  }

  dispose() {
    this.tubeGeometry.dispose();
    this.planetGeometry.dispose();
    this.quadGeometry.dispose();
    this.vortexGeometry.dispose();
    this.vortexMaterial.dispose();
    this.coreMaterial.dispose();
    this.lensMaterial.dispose();
    for (const m of this.orbitMaterials) m.dispose();
    this.planetMaterial.dispose();
    this.starMaterial.dispose();
    this.dialMaterial.dispose();
    this.warpMaterial.dispose();
    this.planetMesh.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◎  Orbit Lock');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'star speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'burn-out (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'ring radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'twinkle');

  const star = folder.addFolder('1 · Seed star');
  R(star, c, 'handForward', -1, 2, 0.01, 'forward (m)');
  R(star, c, 'handHeight', 0.2, 3, 0.01, 'height (m)');
  R(star, c, 'arcHeight', 0, 8, 0.05, 'arc (m)');
  R(star, c, 'hangHeight', 1, 12, 0.05, 'orrery height (m)');
  R(star, c, 'starSize', 0.05, 3, 0.01, 'size (m)');
  R(star, c, 'starGlow', 0, 15, 0.05, 'glow');
  star.addColor(c, 'colorStarCore').name('core');
  star.addColor(c, 'colorStarHalo').name('halo');

  const orbits = folder.addFolder('2 · Orbits');
  R(orbits, c, 'orbits', 1, MAX_ORBITS, 1, 'orbits');
  R(orbits, c, 'planets', 3, MAX_PLANETS, 1, 'planets');
  R(orbits, c, 'orbitRadius', 0.2, 6, 0.01, 'free radius (m)');
  R(orbits, c, 'orbitTilt', 0, 1.5, 0.01, 'tilt (rad)');
  R(orbits, c, 'orbitSpin', 0, 25, 0.1, 'free spin (rad/s)');
  R(orbits, c, 'lockSpin', 0, 10, 0.05, 'locked spin (rad/s)');
  R(orbits, c, 'formTime', 0.02, 2, 0.01, 'forms over (s)');
  R(orbits, c, 'lockTime', 0.02, 3, 0.01, 'locks over (s)');
  R(orbits, c, 'lockHold', 0, 2, 0.01, 'hangs locked (s)');
  R(orbits, c, 'lockLean', -1, 1, 0.01, 'locked ring leans to you (rad)');
  R(orbits, c, 'ringWidth', 0.004, 0.2, 0.001, 'track width (m)');
  R(orbits, c, 'ringGlow', 0, 8, 0.05, 'track glow');
  R(orbits, c, 'trailLength', 0.02, 1, 0.01, 'trail length');
  R(orbits, c, 'trailGlow', 0, 15, 0.05, 'trail glow');
  orbits.addColor(c, 'colorRingA').name('trail');
  orbits.addColor(c, 'colorRingB').name('track');

  const planets = folder.addFolder('3 · Planets');
  R(planets, c, 'planetSize', 0.05, 1.5, 0.01, 'radius (m)');
  R(planets, c, 'planetGlow', 0, 10, 0.05, 'face glow');
  R(planets, c, 'planetRim', 0, 12, 0.05, 'limb glow');
  R(planets, c, 'planetRimPower', 0.5, 8, 0.05, 'limb sharpness');
  R(planets, c, 'bandScale', 0.5, 10, 0.05, 'bands');
  R(planets, c, 'bandSpeed', 0, 10, 0.05, 'band speed');
  R(planets, c, 'planetTumble', 0, 15, 0.05, 'tumble (rad/s)');
  R(planets, c, 'planetCrag', 0, 2, 0.01, 'craggy rock');
  R(planets, c, 'planetFissure', 0, 1, 0.01, 'molten seams');
  planets.addColor(c, 'colorPlanetRock').name('rock');
  planets.addColor(c, 'colorPlanetCore').name('core');
  planets.addColor(c, 'colorPlanetBand').name('bands');
  planets.addColor(c, 'colorPlanetRim').name('limb');

  const well = folder.addFolder('3b · Singularity & well');
  R(well, c, 'coreSize', 0.05, 2, 0.01, 'singularity radius (m)');
  R(well, c, 'coreRimGlow', 0, 12, 0.05, 'photon ring glow');
  R(well, c, 'coreRimPower', 0.5, 10, 0.05, 'photon ring sharpness');
  R(well, c, 'lensSize', 1.1, 8, 0.05, 'lens (× core)');
  R(well, c, 'lensStrength', 0, 4, 0.01, 'lens strength');
  R(well, c, 'lensSwirl', -3, 3, 0.01, 'lens twist (rad)');
  R(well, c, 'vortexReach', 0.2, 1.5, 0.01, 'vortex reach (× radius)');
  R(well, c, 'vortexHeight', 0, 2, 0.01, 'ridge height (m)');
  R(well, c, 'vortexArms', 1, 8, 1, 'spiral arms');
  R(well, c, 'vortexTwist', 0, 8, 0.05, 'arm winding');
  R(well, c, 'vortexSpin', 0, 10, 0.05, 'spin (rad/s)');
  R(well, c, 'vortexHotGlow', 0, 10, 0.05, 'lip glow');
  R(well, c, 'vortexStreaks', 0, 3, 0.01, 'matter streaks');
  R(well, c, 'vortexOpacity', 0, 1, 0.01, 'opacity');
  R(well, c, 'wellSag', 0, 3, 0.01, 'well sag while hanging (m)');
  R(well, c, 'swallowDelay', 0, 2, 0.01, 'swallowing starts after (s)');
  R(well, c, 'swallowTime', 0.1, 4, 0.01, 'swallows over (s)');
  R(well, c, 'swallowTo', 0, 1, 0.01, 'moons dragged in to (× radius)');
  R(well, c, 'swallowSpin', 0, 10, 0.05, 'drag-in spin (rad/s)');
  R(well, c, 'swallowRumble', 0, 1, 0.01, 'rumble');
  well.addColor(c, 'colorWellHot').name('hot');
  well.addColor(c, 'colorWellPale').name('pale');
  well.addColor(c, 'colorWellBody').name('body');
  well.addColor(c, 'colorWellDeep').name('deep');

  const drop = folder.addFolder('4 · Drop');
  R(drop, c, 'dropTime', 0.02, 2, 0.01, 'falls over (s)');
  R(drop, c, 'slamHold', 0.05, 3, 0.01, 'embedded before burn-out (s)');
  R(drop, c, 'sinkDepth', 0, 1, 0.01, 'buries (m)');
  R(drop, c, 'dropStreaks', 0, 600, 1, 'fall streaks/second');

  const dial = folder.addFolder('5 · Dial');
  R(dial, c, 'sigilTicks', 4, 96, 1, 'ticks');
  R(dial, c, 'sigilWidth', 0.005, 0.3, 0.001, 'line width (m)');
  R(dial, c, 'sigilGlow', 0, 10, 0.05, 'glow');
  R(dial, c, 'sigilOpacity', 0, 1, 0.01, 'opacity');
  R(dial, c, 'sigilSpin', 0, 4, 0.01, 'tick spin');
  dial.addColor(c, 'colorSigilA').name('ring');
  dial.addColor(c, 'colorSigilB').name('ticks');

  const fx = folder.addFolder('6 · Dust & sparks');
  R(fx, c, 'dustRate', 0, 1000, 1, 'dust/second');
  R(fx, c, 'dustSize', 0.005, 0.4, 0.001, 'dust size');
  R(fx, c, 'dustLife', 0.05, 3, 0.01, 'dust lifetime');
  R(fx, c, 'dustLift', -4, 6, 0.05, 'dust rise (m/s²)');
  R(fx, c, 'dustGlow', 0, 10, 0.05, 'dust glow');
  R(fx, c, 'sparkCount', 0, 120, 1, 'sparks per crater');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  R(fx, c, 'smokeCount', 0, 30, 1, 'dust puffs per crater');
  R(fx, c, 'smokeSize', 0.05, 4, 0.01, 'puff size');
  R(fx, c, 'smokeLife', 0.1, 6, 0.05, 'puff lifetime');
  R(fx, c, 'smokeOpacity', 0, 1, 0.01, 'puff opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');
  Editor.gradient(fx, c, 'colorSmoke', 'puff gradient');

  const slam = folder.addFolder('7 · Lock & slam');
  R(slam, c, 'lockFlash', 0, 1, 0.01, 'lock flash');
  R(slam, c, 'lockLight', 0, 6, 0.01, 'lock light (× intensity)');
  R(slam, c, 'lockSparks', 0, 60, 1, 'lock sparks per planet');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'slam flash');
  R(slam, c, 'slamShake', 0, 1.5, 0.01, 'slam knock');
  R(slam, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(slam, c, 'slamLight', 0, 8, 0.01, 'slam light (× intensity)');
  R(slam, c, 'shockRadius', 0, 4, 0.01, 'shockwave (× radius)');
  R(slam, c, 'craterRadius', 0, 3, 0.01, 'crater (m)');
  R(slam, c, 'burstSize', 0, 3, 0.01, 'air shell (× radius)');
  R(slam, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(slam, c, 'warpStrength', 0, 4, 0.01, 'ripple strength');
  R(slam, c, 'warpReach', 0.2, 4, 0.01, 'ripple reach (× radius)');
  R(slam, c, 'warpTime', 0.05, 2, 0.01, 'ripple runs over (s)');
  slam.addColor(c, 'colorFlash').name('flash');
  slam.addColor(c, 'colorBurstA').name('shell inner');
  slam.addColor(c, 'colorBurstB').name('shell mid');
  slam.addColor(c, 'colorBurstC').name('shell outer');
  slam.addColor(c, 'colorShockA').name('shockwave');
  slam.addColor(c, 'colorShockB').name('shockwave hot');
  slam.addColor(c, 'colorCrater').name('crater');
  slam.addColor(c, 'colorCraterHot').name('crater rim');

  const hit = folder.addFolder('8 · Hit');
  R(hit, c, 'hitScale', 0.1, 2, 0.01, 'catches (× radius)');
  R(hit, c, 'hitImpulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(hit, c, 'hitLift', 0, 25, 0.1, 'lift (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.01, 'tumble');

  folder.close();
  return folder;
}
