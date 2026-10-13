import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createRiptideJetMaterial,
  createRiptideSoakMaterial,
  createRiptideWaveMaterial
} from '../../materials/codex/RiptideLashMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'riptide';

const TAU = Math.PI * 2;
/** Bodies one cast can have hold of at once (the jet's drag and the backwash). */
const MAX_TOUCHED = 16;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _centre = new Vector3();
const _hand = new Vector3();
const _normal = new Vector3();
const _right = new Vector3();
const _floor = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * RIPTIDE LASH — a high-pressure jet of water that folds up into a breaking wave.
 *
 * A line cast. Water gathers into the hand, a jet blasts out of it and lashes
 * down the line at hip height, shoving everything it meets hard along the
 * line and soaking the floor under it. At the end of the line the jet stops
 * dead and folds up into a curling wave that stands, curls over and crashes
 * down on the far end — slamming whatever is under it into the floor and
 * washing it back toward the caster. Puddles and foam are left to drain away.
 *
 * Seven layers, each a folder in the editor:
 *
 *   1. **the jet** — a parameter grid bent into a twisting tube in the vertex
 *      stage (`createRiptideJetMaterial`): it drops from the hand to working
 *      height, whips side to side (the *lash* — a travelling sine whose phase
 *      is integrated, so the speed slider never snaps), swells off the nozzle,
 *      bulges into a churning head, and is roped by a helical ridge that screws
 *      down it. Alpha-blended water with fresnel, sky, glint, streaks and foam,
 *      with an additive pressure core streaming inside it.
 *   2. **the refraction** — the same tube, fatter, on `LAYER.DISTORTION`,
 *      bending the world outward along its screen-space normal.
 *   3. **spray** — SMOKE mist shed off the surface, DROPLET beads flung off it
 *      with a share of the jet's own speed and real gravity, and pressure
 *      STREAKs off the nozzle. Droplets gather *into* the hand before it fires.
 *   4. **the soak** — a ground strip that is only wet behind the head (darkened
 *      floor, rippled glint, sky), with voronoi puddles; RIPPLE decals pulse
 *      down the line as the head passes. It drains raggedly, puddles last.
 *   5. **the wave** — a sheet whose profile is *integrated* in the vertex
 *      stage from a turning tangent, so curling the lip is one number. It
 *      stands up, peels over from one side, and collapses forward into foam.
 *   6. **the crash** — a WATER burst, shockwave, RIPPLE and FOAM decals, a
 *      fountain of droplets, lingering foam bubbles that burst as they drain,
 *      a flood disc on the soak, a knock on the camera and a punch of light.
 *   7. **the shove and the wash** — `handlesOwnHits`. A standing body the jet
 *      reaches is blasted along the line; a body already down that the jet is
 *      still on is *carried* down it by a current (`dummy.carry`). Under the
 *      crashing wave bodies are thrown down (negative lift) and the backwash
 *      carries them toward the caster for `washTime`.
 *
 * ## The editor rule
 *
 * A cast captures a seed and four integrated phases (the whip, the twist, the
 * surface flow, the wave's foam flow). Everything with a unit is resolved from
 * `settings.riptide` every frame, so dragging any slider re-shapes the jet,
 * the soak or the wave while it is on screen.
 */
export class RiptideLashAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The water decides who it hits, and it carries them, it does not just fell them. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies struck this cast. HUD readout only. */
  get instanceCount() {
    return this._struck;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 + 2: one grid, drawn three times ---- */
    // uv.x round the tube, uv.y along it.
    this.jetGeometry = new PlaneGeometry(1, 1, 28, 140);
    this.jetMaterial = createRiptideJetMaterial(0);
    this.coreMaterial = createRiptideJetMaterial(1);
    this.warpMaterial = createRiptideJetMaterial(2);

    this.jet = this._mesh(this.jetGeometry, this.jetMaterial, 'RiptideJet', LAYER.VFX, 12);
    this.core = this._mesh(this.jetGeometry, this.coreMaterial, 'RiptideCore', LAYER.VFX, 13);
    this.warp = this._mesh(this.jetGeometry, this.warpMaterial, 'RiptideLens', LAYER.DISTORTION, 0);

    /* ---- layer 4: the soak ---- */
    this.soakGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.soakMaterial = createRiptideSoakMaterial();
    this.soak = this._mesh(this.soakGeometry, this.soakMaterial, 'RiptideSoak', LAYER.VFX, 2);

    /* ---- layer 5: the wave ---- */
    // uv.x across the line, uv.y up the curl.
    this.waveGeometry = new PlaneGeometry(1, 1, 56, 40);
    this.waveMaterial = createRiptideWaveMaterial();
    this.wave = this._mesh(this.waveGeometry, this.waveMaterial, 'RiptideWave', LAYER.VFX, 11);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._jetState = {
      origin: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      tail: 0,
      head: 1,
      snakePhase: 0,
      twistPhase: 0,
      flow: 0,
      form: 0,
      fade: 1,
      seed: 0,
      pressure: 1
    };
    this._soakState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      width: 1,
      wetEnd: 0,
      headAt: 0,
      crashAt: 0,
      crashR: 0,
      drain: 0,
      foamCover: 0,
      seed: 0
    };
    this._waveState = {
      centre: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      len: 0,
      curl: 0,
      crash: 0,
      flow: 0,
      fade: 1,
      seed: 0
    };

    this._seed = 0;
    this._tail = 0;
    this._head = 0;
    this._snakePhase = 0;
    this._twistPhase = 0;
    this._flow = 0;
    this._waveFlow = 0;
    this._pressure = 1;
    this._crashed = false;
    this._crashTime = 0;
    this._nextRipple = 0;
    this._struck = 0;

    this._found = [];
    this._touched = new Array(MAX_TOUCHED).fill(null);
    this._touchedCount = 0;
    this._force = { impulse: 0, lift: 0, spin: 0 };

    /** What the water is doing to a body it holds — read by the two fields below. */
    this._fieldSpeed = 0;
    this._fieldDown = 0;
    // The two velocity fields `dummy.carry` samples per joint. Bound once so
    // nothing is allocated per frame.
    this._jetField = (x, y, z, out) => {
      out.set(this.direction.x * this._fieldSpeed, 0.6, this.direction.z * this._fieldSpeed);
    };
    this._washField = (x, y, z, out) => {
      out.set(-this.direction.x * this._fieldSpeed, -this._fieldDown, -this.direction.z * this._fieldSpeed);
    };
  }

  _mesh(geometry, material, name, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false; // every vertex is placed in the shader
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: mist off the surface ---- */
    // Not additive: spray in the air whitens what is behind it, it does not glow.
    this.mist = particles.get('riptide.mist', {
      capacity: 2200,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.8
    });
    this.mist.uniforms.uSizeIn.value = 0.15;
    this.mist.uniforms.uFadeIn.value = 0.08;
    this.mist.uniforms.uFadeOut.value = 0.5;
    this.mist.uniforms.uEndSize.value = 2.4;

    /* ---- droplets: beads flung off the jet, falling for real ---- */
    this.droplets = particles.get('riptide.droplets', {
      capacity: 3200,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.droplets.uniforms.uSizeIn.value = 0.05;
    this.droplets.uniforms.uFadeIn.value = 0.04;
    this.droplets.uniforms.uFadeOut.value = 0.35;
    this.droplets.uniforms.uEndSize.value = 0.7;

    /* ---- foam: bubbles that linger on the floor and burst as it drains ---- */
    this.foam = particles.get('riptide.foam', {
      capacity: 1400,
      shape: ParticleShape.BUBBLE,
      additive: false,
      softFade: 0.3
    });
    this.foam.uniforms.uSizeIn.value = 0.1;
    this.foam.uniforms.uFadeIn.value = 0.08;
    this.foam.uniforms.uFadeOut.value = 0.25;
    this.foam.uniforms.uEndSize.value = 1.2;

    /* ---- pressure streaks off the nozzle and out of the crash ---- */
    this.streaks = particles.get('riptide.streaks', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    });
    this.streaks.uniforms.uSizeIn.value = 0.03;
    this.streaks.uniforms.uFadeIn.value = 0.05;
    this.streaks.uniforms.uFadeOut.value = 0.5;
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uDrag.value = 1.2;

    this.mistEmitter = new RateEmitter();
    this.dropletEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the wave: standing up, curling, crashing. */
  get impactDuration() {
    return Math.max(0.1, settings.riptide.waveTime * settings.global.lifetime);
  }

  /** The fade is the floor draining. */
  get fadeDuration() {
    return Math.max(0.1, settings.riptide.lifetime * settings.global.lifetime);
  }

  /** Light through moving water: a slow double ripple, never a flicker. */
  lightShimmer() {
    const f = settings.riptide.lightShimmer;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 7.1) * Math.sin(this.age * 2.9 + 1.3));
  }

  /* ------------------------------------------------------------------ */
  /* The jet on the CPU                                                  */
  /* ------------------------------------------------------------------ */

  /** Lateral offset of the lash at `s` metres. CPU twin of the shader's. */
  _jetLat(s) {
    const c = settings.riptide;
    const k = Math.max(s - c.nozzle, 0);
    return c.snake * settings.global.randomness * Math.sin(s * c.snakeFreq - this._snakePhase) * saturate(k / Math.max(c.snakeRamp, 0.05));
  }

  /** Centre of the jet at `s` metres down the line. CPU twin of `jetCentre`. */
  _jetCentre(s, out) {
    const c = settings.riptide;
    const k = Math.max(s - c.nozzle, 0);
    const y = c.jetHeight + (c.handHeight - c.jetHeight) * Math.exp(-k / Math.max(c.dropLength, 0.05));
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, s)
      .addScaledVector(_right, this._jetLat(s))
      .setY(y);
  }

  /** Radius of the jet at `s` metres. CPU twin of `jetRadius`. */
  _jetRadius(s) {
    const c = settings.riptide;
    const k = Math.max(s - c.nozzle, 0);
    let r = lerp(c.nozzleRadius, c.jetRadius, saturate(k / Math.max(c.spreadLength, 0.05)));
    r *= 1 + c.headBulge * Math.exp(-Math.max(this._head - s, 0) / Math.max(c.headLength, 0.05));
    const tk = saturate((s - this._tail) / Math.max(c.tailTaper, 0.01));
    const hk = saturate((this._head - s) / Math.max(c.headTaper, 0.01));
    return r * Math.sqrt(tk * (2 - tk)) * Math.sqrt(hk * (2 - hk)) * this._jetState.form;
  }

  /** A random point on the jet's surface between tail and head, and its normal. */
  _surfacePoint(out, normal) {
    const s = lerp(this._tail, this._head, Math.random());
    this._jetCentre(s, out);
    const a = Math.random() * TAU;
    // The tube's frame is (side, up) to within the slope of the drop.
    normal.copy(_right).multiplyScalar(Math.cos(a)).addScaledVector(_up, Math.sin(a));
    out.addScaledVector(normal, this._jetRadius(s));
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.riptide;
    const g = settings.global;

    this.mistEmitter.reset();
    this.dropletEmitter.reset();
    this.streakEmitter.reset();
    this._releaseAll();

    // Local +X of the line; the shaders take this as their `uSide`.
    _right.set(this.direction.z, 0, -this.direction.x);

    this._seed = Math.random() * 100;
    this._snakePhase = Math.random() * TAU;
    this._twistPhase = 0;
    this._flow = 0;
    this._waveFlow = 0;
    this._tail = c.nozzle;
    this._head = c.nozzle + 0.05;
    this._pressure = 1;
    this._crashed = false;
    this._crashTime = 0;
    this._nextRipple = Math.max(c.soakStart + 0.8, c.rippleSpacing * 0.6);
    this._struck = 0;

    const js = this._jetState;
    js.seed = this._seed;
    js.form = 0;
    js.fade = 1;
    js.pressure = 1;
    const ss = this._soakState;
    ss.seed = this._seed;
    ss.drain = 0;
    ss.foamCover = 0;
    ss.crashR = 0;
    const ws = this._waveState;
    ws.seed = this._seed;
    ws.len = 0;
    ws.crash = 0;
    ws.fade = 1;

    this.jet.visible = true;
    this.core.visible = true;
    this.warp.visible = true;
    this.soak.visible = true;
    this.wave.visible = false;

    /* anticipation: droplets drawn into the hand from a ring round it */
    this._resetEmit(frame.uTime.value);
    _hand.copy(this.origin).addScaledVector(this.direction, c.nozzle).setY(c.handHeight);
    const gather = Math.round(c.gatherCount * g.particleCount);
    const travel = 0.16;
    _emit.size = c.dropletSize * 1.2;
    _emit.life = travel;
    _emit.lifeVariance = 0.1;
    _emit.speedVariance = 0.1;
    for (let n = 0; n < gather; n++) {
      const a = Math.random() * TAU;
      const b = (Math.random() - 0.3) * 1.2;
      _pos.copy(_hand)
        .addScaledVector(_right, Math.cos(a) * c.gatherRadius)
        .addScaledVector(this.direction, Math.sin(a) * c.gatherRadius * 0.6 - 0.2)
        .addScaledVector(_up, b * c.gatherRadius * 0.5);
      _dir.copy(_hand).sub(_pos);
      const d = _dir.length();
      _dir.divideScalar(Math.max(d, 1e-4));
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = d / travel;
      this.droplets.emit(1, _emit);
    }

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

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  /** Advance the integrated phases. Rates are live; nothing ever jumps. */
  _advance(dt) {
    const c = settings.riptide;
    const g = settings.global;
    this._snakePhase += c.snakeSpeed * dt * g.animationSpeed;
    this._twistPhase += c.twistSpeed * dt * g.animationSpeed;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    this._waveFlow += 1.6 * dt * g.noiseSpeed;
  }

  /** Resolve every mesh and every particle system's look from settings. */
  _sync() {
    const c = settings.riptide;
    const g = settings.global;

    /* the jet */
    const js = this._jetState;
    js.origin.copy(this.origin);
    js.dir.copy(this.direction);
    js.side.copy(_right);
    js.tail = this._tail;
    js.head = this._head;
    js.snakePhase = this._snakePhase;
    js.twistPhase = this._twistPhase;
    js.flow = this._flow;
    js.form = Math.max(0, Easing.outBack(saturate(this.age / Math.max(0.01, c.formTime))));
    js.pressure = this._pressure;
    this.jetMaterial.userData.sync(js);
    this.coreMaterial.userData.sync(js);
    this.warpMaterial.userData.sync(js);

    /* the soak */
    const ss = this._soakState;
    const start = Math.max(0, c.soakStart);
    ss.start.copy(this.origin).addScaledVector(this.direction, start);
    ss.dir.copy(this.direction);
    ss.side.copy(_right);
    const reachPast = c.crashRadius * 1.4 + c.crashSurge + 0.5;
    ss.length = Math.max(0.5, this.length - start + reachPast);
    ss.width = 2 * Math.max(c.soakWidth * (1 + c.soakEdgeNoise) + c.snake, c.crashRadius * 1.4, c.waveWidth * 0.5) + 0.5;
    ss.wetEnd = Math.max(0, this._head - start);
    ss.headAt = this._head - start;
    ss.crashAt = this.length - start + c.crashSurge * 0.4;
    this.soakMaterial.userData.sync(ss);

    /* the wave */
    const ws = this._waveState;
    ws.centre.copy(this.origin).addScaledVector(this.direction, this.length);
    ws.dir.copy(this.direction);
    ws.side.copy(_right);
    ws.flow = this._waveFlow;
    this.waveMaterial.userData.sync(ws);

    /* the particles' looks */
    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uDrag.value = c.mistDrag;
    m.uGravity.value.set(0, 0.15, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = c.mistTurbulence * g.turbulence;

    this.droplets.setGradient(getColor(c.colorDropletA), getColor(c.colorDropletB), getColor(c.colorDropletC), getColor(c.colorDropletD));
    const d = this.droplets.uniforms;
    d.uDrag.value = c.dropletDrag;
    d.uGravity.value.set(0, -c.dropletGravity, 0);
    d.uStretch.value = 0.08;
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uGlow.value = g.glow;
    d.uTurbulence.value = 0.1 * g.turbulence;

    this.foam.setGradient(getColor(c.colorFoamA), getColor(c.colorFoamB), getColor(c.colorFoamC), getColor(c.colorFoamD));
    const f = this.foam.uniforms;
    f.uDrag.value = 2.6;
    f.uGravity.value.set(0, -0.6, 0);
    f.uSizeScale.value = g.particleSize;
    f.uLifeScale.value = g.particleLifetime;
    f.uSpeedScale.value = g.particleSpeed;
    f.uOpacity.value = g.opacity;
    f.uTurbulence.value = 0.25 * g.turbulence;

    this.streaks.setGradient(getColor(c.colorDropletA), getColor(c.colorDropletB), getColor(c.colorDropletC), getColor(c.colorDropletD));
    const st = this.streaks.uniforms;
    st.uStretch.value = c.streakStretch;
    st.uGravity.value.set(0, -c.dropletGravity * 0.3, 0);
    st.uSizeScale.value = g.particleSize;
    st.uLifeScale.value = g.particleLifetime;
    st.uSpeedScale.value = g.particleSpeed;
    st.uOpacity.value = g.opacity;
    st.uGlow.value = c.streakGlowP * g.glow;
    st.uTurbulence.value = 0.15 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the jet lashes down the line                               */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.riptide;
    this._advance(dt);
    this._tail = c.nozzle;
    this._head = Math.max(c.nozzle + 0.05, this.front);
    this._pressure = 1;
    this._jetState.fade = 1;
    this._sync();

    this._sprayFx(dt, 1);
    this._ripples();
    this._jetHits(dt);
    this.ctx.shake.rumble(c.travelRumble, dt);

    // The light rides the churning head.
    this._jetCentre(this._head, this.position);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the jet folds up into a wave                               */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.riptide;
    const g = settings.global;
    this.wave.visible = true;

    // A bow of spray where the jet stops dead and turns upward.
    this._resetEmit(frame.uTime.value);
    this._jetCentre(this.length, _pos);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(0.4).add(_up).normalize();
    _emit.speed = c.splashSpeed * 0.8;
    _emit.spread = 0.6;
    _emit.size = c.dropletSize;
    _emit.life = c.dropletLifetime;
    this.droplets.emit(Math.round(c.splashCount * 0.35 * g.particleCount), _emit);

    this.lightBoost = c.lightIntensity * c.impactLight * 0.4 * g.explosionIntensity;
  }

  onFade(dt, t) {
    const c = settings.riptide;
    const g = settings.global;
    this._advance(dt);

    if (t <= 1) {
      /* the jet's tail runs down to catch its head as the pressure goes */
      const r = saturate(t / Math.max(0.05, c.retractTime));
      this._head = this.length;
      this._tail = lerp(c.nozzle, this.length, Easing.inQuad(r));
      this._pressure = 1 - Easing.inQuad(r);
      this._jetState.fade = 1 - smoothstep(0.75, 1, r);
      const jetOn = this._tail < this._head - 0.08;
      this.jet.visible = jetOn;
      this.core.visible = jetOn;
      this.warp.visible = jetOn;

      /* the wave stands up, curls over and crashes */
      const ws = this._waveState;
      const crashAt = Math.min(0.95, Math.max(0.1, c.crashAt));
      ws.len = c.waveHeight * Easing.outCubic(saturate(t / Math.max(0.05, c.riseEnd)));
      ws.curl = lerp(c.curlStart, c.curlEnd, smoothstep(0.08, crashAt, t));
      ws.crash = saturate((t - crashAt) / Math.max(0.05, 1 - crashAt));
      ws.fade = 1;
      if (!this._crashed && t >= crashAt) this._crash();
      if (this._crashed) this._crashTime += dt;

      this._sync();
      if (jetOn) this._sprayFx(dt, this._pressure);
      this._jetHits(dt);
      this._wash(dt);
      this._crashFoam(dt);

      this._waveCentre(_centre);
      this.position.copy(_centre);
      return;
    }

    /* the linger: the wave is gone, the floor drains */
    const ft = saturate(t - 1);
    this.jet.visible = false;
    this.core.visible = false;
    this.warp.visible = false;
    this.wave.visible = false;
    this._crashTime += dt;
    const ss = this._soakState;
    ss.drain = smoothstep(c.drainStart, 1, ft);
    ss.foamCover = Math.max(0, ss.foamCover - dt / Math.max(0.2, this.fadeDuration * 0.6));
    this._sync();
    this._wash(dt);
    if (ft >= 0.999) this._releaseAll();
    this._waveCentre(_centre);
    this.position.copy(_centre);
  }

  /** Where the wave's crest is right now — for the light. */
  _waveCentre(out) {
    const c = settings.riptide;
    const ws = this._waveState;
    out.copy(this.origin).addScaledVector(this.direction, this.length + c.crashSurge * ws.crash * 0.5);
    out.y = Math.max(0.3, ws.len * 0.6 * (1 - ws.crash * ws.crash));
    return out;
  }

  /** The lip hits the floor. */
  _crash() {
    const c = settings.riptide;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._crashed = true;
    this._crashTime = 0;

    _floor.copy(this.origin).addScaledVector(this.direction, this.length + c.crashSurge * 0.5);
    _floor.y = 0;

    this.ctx.bursts.spawn(BurstMode.WATER, _floor, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.7,
      intensity: c.burstIntensity,
      opacity: 0.8,
      fresnel: 2,
      displace: 0.5,
      turbulence: g.turbulence,
      squash: 0.4,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: c.crashRadius * 1.5,
      life: c.rippleLife * 1.6,
      intensity: Math.min(1, c.rippleIntensity * 2),
      colorA: getColor(c.colorRippleA),
      colorB: getColor(c.colorRippleB)
    });
    const decals = Math.round(c.foamDecals);
    for (let n = 0; n < decals; n++) {
      const a = (n / Math.max(1, decals)) * TAU + Math.random() * 0.8;
      const rr = c.crashRadius * (0.25 + 0.6 * Math.random());
      _pos.copy(_floor).addScaledVector(_right, Math.cos(a) * rr * 1.2).addScaledVector(this.direction, Math.sin(a) * rr * 0.8);
      this.ctx.decals.spawn(DecalType.FOAM, _pos, {
        radius: c.foamDecalRadius * (0.7 + 0.6 * Math.random()),
        life: c.foamDecalLife * (0.8 + 0.4 * Math.random()),
        intensity: 1,
        growth: 0.3,
        colorA: getColor(c.colorFoamA),
        colorB: getColor(c.colorFoamC)
      });
    }

    /* a fountain of droplets thrown up and forward along the crash */
    this._resetEmit(time);
    const splash = Math.round(c.splashCount * g.particleCount);
    _emit.size = c.dropletSize * 1.3;
    _emit.life = c.dropletLifetime * 1.2;
    _emit.lifeVariance = 0.4;
    _emit.speedVariance = 0.5;
    for (let n = 0; n < splash; n++) {
      const lat = (Math.random() * 2 - 1) * c.waveWidth * 0.5;
      _pos.copy(_floor).addScaledVector(_right, lat).setY(0.2);
      _dir.copy(_up).addScaledVector(this.direction, 0.3 + Math.random() * 0.5)
        .addScaledVector(_right, (Math.random() - 0.5) * 0.8).normalize();
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = c.splashSpeed;
      this.droplets.emit(1, _emit);
    }
    // White water: streaks spat out flat along the floor.
    this._resetEmit(time);
    _pos.copy(_floor).setY(0.25);
    _emit.position = _pos;
    _emit.radius = c.waveWidth * 0.3;
    _emit.direction = _dir.copy(this.direction).setY(0.25).normalize();
    _emit.speed = c.streakSpeed;
    _emit.spread = 1.2;
    _emit.size = c.streakSize * 1.5;
    _emit.life = c.streakLifetime * 1.6;
    this.streaks.emit(Math.round(60 * g.particleCount), _emit);
    // A cloud of mist off the impact.
    this._resetEmit(time);
    _emit.position = _pos;
    _emit.radius = c.waveWidth * 0.35;
    _emit.direction = _up;
    _emit.speed = c.mistSpeed * 1.5;
    _emit.spread = 1;
    _emit.size = c.mistSize * 2;
    _emit.life = c.mistLifetime * 1.6;
    this.mist.emit(Math.round(50 * g.particleCount), _emit);

    /* foam bubbles that linger on the flood and burst as it drains */
    this._resetEmit(time);
    const foam = Math.round(c.foamCount * g.particleCount);
    _emit.size = c.foamSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.foamLifetime;
    _emit.lifeVariance = 0.5;
    _emit.speedVariance = 0.6;
    for (let n = 0; n < foam; n++) {
      const a = Math.random() * TAU;
      const rr = c.crashRadius * Math.sqrt(Math.random());
      _pos.copy(_floor).addScaledVector(_right, Math.cos(a) * rr).addScaledVector(this.direction, Math.sin(a) * rr * 0.7).setY(0.06);
      _dir.set(Math.cos(a), 0.15, Math.sin(a));
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = 0.6;
      this.foam.emit(1, _emit);
    }

    this._soakState.foamCover = 1;
    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;

    this._slam();
  }

  /** The flood disc spreading after the crash, and spume off the collapsing lip. */
  _crashFoam(dt) {
    const c = settings.riptide;
    const ss = this._soakState;
    ss.crashR = this._crashed ? c.crashRadius * Easing.outCubic(saturate(this._crashTime / 0.4)) : 0;
    if (!this._crashed) return;
    const ws = this._waveState;
    const g = settings.global;
    const n = Math.round(this.mistEmitter.tick(dt, c.mistRate * 0.6 * (1 - ws.crash)) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.mistSize * 1.4;
    _emit.life = c.mistLifetime;
    _emit.speed = c.mistSpeed;
    _emit.spread = 0.8;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      _pos.copy(this.origin)
        .addScaledVector(this.direction, this.length + c.crashSurge * ws.crash * Math.random())
        .addScaledVector(_right, (Math.random() * 2 - 1) * c.waveWidth * 0.45)
        .setY(0.2 + Math.random() * 0.5);
      _emit.position = _pos;
      this.mist.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects in flight                                                   */
  /* ------------------------------------------------------------------ */

  /** Mist, droplets and nozzle streaks, scaled by `strength`. */
  _sprayFx(dt, strength) {
    const c = settings.riptide;
    const g = settings.global;
    const time = frame.uTime.value;
    const jetSpeed = c.speed * g.speed;

    /* mist shed off the surface */
    const mist = Math.round(this.mistEmitter.tick(dt, c.mistRate * strength) * g.particleCount);
    if (mist > 0) {
      this._resetEmit(time);
      _emit.size = c.mistSize;
      _emit.life = c.mistLifetime;
      _emit.spread = 0.4;
      _emit.speed = c.mistSpeed;
      for (let n = 0; n < mist; n++) {
        this._surfacePoint(_pos, _normal);
        _dir.copy(_normal).addScaledVector(_up, c.mistLift / Math.max(0.1, c.mistSpeed)).normalize();
        _emit.position = _pos;
        _emit.direction = _dir;
        this.mist.emit(1, _emit);
      }
    }

    /* droplets flung off it, keeping a share of the jet's speed */
    const drops = Math.round(this.dropletEmitter.tick(dt, c.dropletRate * strength) * g.particleCount);
    if (drops > 0) {
      this._resetEmit(time);
      _emit.size = c.dropletSize;
      _emit.life = c.dropletLifetime;
      _emit.speedVariance = 0;
      for (let n = 0; n < drops; n++) {
        this._surfacePoint(_pos, _normal);
        _vel.copy(_normal).multiplyScalar(c.dropletSpeed * (0.5 + Math.random()))
          .addScaledVector(this.direction, jetSpeed * c.dropletCarry * Math.random());
        const speed = _vel.length();
        _emit.position = _pos;
        _emit.direction = speed > 1e-4 ? _dir.copy(_vel).divideScalar(speed) : _up;
        _emit.speed = speed;
        this.droplets.emit(1, _emit);
      }
    }

    /* pressure streaks fired out of the hand along the jet */
    const lines = Math.round(this.streakEmitter.tick(dt, c.nozzleStreaks * strength) * g.particleCount);
    if (lines > 0) {
      this._resetEmit(time);
      this._jetCentre(c.nozzle + 0.15, _pos);
      _emit.position = _pos;
      _emit.radius = c.nozzleRadius * 1.5;
      _emit.direction = this.direction;
      _emit.speed = c.streakSpeed;
      _emit.spread = 0.12;
      _emit.size = c.streakSize;
      _emit.life = c.streakLifetime;
      this.streaks.emit(lines, _emit);
    }
  }

  /** A RIPPLE decal every `rippleSpacing` metres as the head passes. */
  _ripples() {
    const c = settings.riptide;
    const spacing = Math.max(0.3, c.rippleSpacing);
    let guard = 0;
    while (this._head >= this._nextRipple && guard++ < 8) {
      this.pointAt(Math.min(1, this._nextRipple / this.length), _floor);
      _floor.addScaledVector(_right, this._jetLat(this._nextRipple));
      _floor.y = 0;
      this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
        radius: c.rippleRadius,
        life: c.rippleLife,
        intensity: c.rippleIntensity,
        colorA: getColor(c.colorRippleA),
        colorB: getColor(c.colorRippleB)
      });
      this._nextRipple += spacing;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The shove                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Whatever the jet is on. A standing body is blasted along the line; a body
   * already down is carried along it by the current for as long as the jet is
   * still on it.
   */
  _jetHits(dt) {
    const field = this.ctx.dummies;
    if (!field?.findBodies || this._pressure <= 0.02) return;
    if (this._tail >= this._head - 0.05) return;
    const c = settings.riptide;
    const g = settings.global;

    const mid = (this._tail + this._head) * 0.5;
    this.pointAt(Math.min(1.2, mid / this.length), _floor);
    const reachR = c.jetRadius * (1 + c.headBulge) + c.hitReach + Math.abs(c.snake);
    const found = field.findBodies(_floor.x, _floor.z, (this._head - this._tail) * 0.5 + reachR, this._found);
    if (found.length === 0) return;

    this._force.impulse = c.jetImpulse * g.explosionIntensity * this._pressure;
    this._force.lift = c.jetLift * g.explosionIntensity;
    this._force.spin = c.jetSpin;
    this._fieldSpeed = c.carrySpeed * this._pressure;
    const grab = (1 - Math.exp(-c.carryGrab * dt)) * this._pressure;

    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      if (along < this._tail - 0.2 || along > this._head + 0.25) continue;
      const lat = dx * _right.x + dz * _right.z;
      const off = lat - this._jetLat(along);
      if (Math.abs(off) > this._jetRadius(Math.min(this._head, Math.max(this._tail, along))) + c.hitReach + 0.15) continue;

      if (dummy.alive) {
        // Hard along the line, with a little shove out of the stream.
        _dir.copy(this.direction).addScaledVector(_right, (Math.sign(off) || 1) * 0.12).normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force, false)) continue;
        this._struck++;
        this._touch(dummy);
        this._hitFx(dummy.position);
      } else {
        dummy.carry(this._jetField, grab, grab * 0.3, 0);
        this._touch(dummy);
      }
    }
  }

  /** The lip lands: everything under it is thrown down and back. */
  _slam() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.riptide;
    const g = settings.global;
    this.pointAt(1, _floor);
    const half = c.waveWidth * 0.5;
    const found = field.findBodies(_floor.x, _floor.z, half + c.crashRadius + c.crashSurge, this._found);

    this._force.impulse = c.washSpeed * 0.7 * g.explosionIntensity;
    this._force.lift = -c.slamDown * g.explosionIntensity; // negative lift: driven into the floor
    this._force.spin = 0.35;

    for (const dummy of found) {
      if (!this._underWave(dummy, half)) continue;
      if (dummy.alive) {
        if (!dummy.kill(-this.direction.x, -this.direction.z, this._force, false)) continue;
        this._struck++;
        this._hitFx(dummy.position);
      } else {
        dummy.shove(0, -c.slamDown * g.explosionIntensity, 0);
      }
      this._touch(dummy);
    }
  }

  /** Is a body inside the wave's footprint (from its back face to past the surge)? */
  _underWave(dummy, half) {
    const c = settings.riptide;
    const dx = dummy.position.x - this.origin.x;
    const dz = dummy.position.z - this.origin.z;
    const along = dx * this.direction.x + dz * this.direction.z;
    const lat = dx * _right.x + dz * _right.z;
    if (Math.abs(lat) > half + c.washReach) return false;
    const back = this.length - c.waveHeight * c.waveBack - 0.8;
    const front = this.length + c.crashSurge + c.waveHeight * 0.6 + 0.5;
    return along >= back && along <= front;
  }

  /**
   * The backwash: for `washTime` after the crash every body in the flood is
   * carried back toward the caster, held down for the first beat of it.
   */
  _wash(dt) {
    if (!this._crashed) return;
    const c = settings.riptide;
    const wt = Math.max(0.05, c.washTime);
    if (this._crashTime > wt) return;
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;

    const k = this._crashTime / wt;
    this._fieldSpeed = c.washSpeed * (1 - k * k);
    this._fieldDown = this._crashTime < 0.18 ? c.slamDown * 0.6 : 0;
    const grab = 1 - Math.exp(-c.washGrab * dt);

    const half = c.waveWidth * 0.5;
    // The wash moves the bodies back, so the zone runs back with them.
    this.pointAt(1, _floor);
    const found = field.findBodies(_floor.x, _floor.z, half + c.washReach + c.washSpeed * wt + c.crashSurge, this._found);
    for (const dummy of found) {
      if (dummy.alive) continue;
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * _right.x + dz * _right.z;
      if (Math.abs(lat) > half + c.washReach) continue;
      if (along < this.length - c.washSpeed * wt - 2 || along > this.length + c.crashSurge + c.waveHeight) continue;
      dummy.carry(this._washField, grab, grab * 0.5, 0);
      this._touch(dummy);
    }
  }

  /** Spray where a body is struck. */
  _hitFx(at) {
    const c = settings.riptide;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(c.jetHeight);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.copy(_up).addScaledVector(this.direction, 0.6).normalize();
    _emit.speed = c.splashSpeed * 0.6;
    _emit.spread = 0.9;
    _emit.size = c.dropletSize * 1.2;
    _emit.life = c.dropletLifetime;
    this.droplets.emit(Math.round(c.hitSpray * g.particleCount), _emit);
    _emit.size = c.mistSize;
    _emit.speed = c.mistSpeed;
    _emit.life = c.mistLifetime * 0.8;
    this.mist.emit(Math.round(c.hitSpray * 0.4 * g.particleCount), _emit);
    this.ctx.shake.add(c.impactShake * 0.3, 7, 20);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5);
  }

  /** Remember a body the water has hold of, so it can be let go of. */
  _touch(dummy) {
    for (let i = 0; i < this._touchedCount; i++) if (this._touched[i] === dummy) return;
    if (this._touchedCount >= MAX_TOUCHED) return;
    this._touched[this._touchedCount++] = dummy;
  }

  /** Hand every held body its floor and its weight back. */
  _releaseAll() {
    for (let i = 0; i < this._touchedCount; i++) {
      this._touched[i]?.release?.();
      this._touched[i] = null;
    }
    this._touchedCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseAll();
    this.jet.visible = false;
    this.core.visible = false;
    this.warp.visible = false;
    this.soak.visible = false;
    this.wave.visible = false;
  }

  dispose() {
    this.jetGeometry.dispose();
    this.soakGeometry.dispose();
    this.waveGeometry.dispose();
    this.jetMaterial.dispose();
    this.coreMaterial.dispose();
    this.warpMaterial.dispose();
    this.soakMaterial.dispose();
    this.waveMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F30A}  Riptide Lash');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'jet speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'soak + foam linger (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightShimmer', 0, 1, 0.01, 'shimmer');

  const jet = folder.addFolder('1 · Jet');
  const path = jet.addFolder('Path');
  R(path, c, 'nozzle', 0, 2, 0.01, 'leaves the hand at (m)');
  R(path, c, 'handHeight', 0.1, 3, 0.01, 'hand height (m)');
  R(path, c, 'jetHeight', 0.1, 3, 0.01, 'working height (m)');
  R(path, c, 'dropLength', 0.05, 10, 0.05, 'drops over (m)');
  R(path, c, 'snake', 0, 1.5, 0.005, 'lash swing (m)');
  R(path, c, 'snakeFreq', 0, 3, 0.01, 'lash waves per metre');
  R(path, c, 'snakeSpeed', 0, 40, 0.1, 'lash speed');
  R(path, c, 'snakeRamp', 0.05, 10, 0.05, 'lash ramps over (m)');

  const body = jet.addFolder('Body');
  R(body, c, 'nozzleRadius', 0.01, 1, 0.005, 'radius at the hand');
  R(body, c, 'jetRadius', 0.02, 1.5, 0.005, 'radius');
  R(body, c, 'spreadLength', 0.05, 20, 0.05, 'spreads over (m)');
  R(body, c, 'headBulge', 0, 4, 0.01, 'head bulge (×)');
  R(body, c, 'headLength', 0.05, 4, 0.01, 'head length (m)');
  R(body, c, 'tailTaper', 0.01, 3, 0.01, 'tail rounding (m)');
  R(body, c, 'headTaper', 0.01, 3, 0.01, 'head rounding (m)');
  R(body, c, 'formTime', 0.01, 1, 0.005, 'swells open over (s)');
  R(body, c, 'twist', -8, 8, 0.05, 'twist (rad/m)');
  R(body, c, 'twistSpeed', -60, 60, 0.5, 'twist speed');
  R(body, c, 'wobble', 0, 1, 0.005, 'turbulence (× radius)');
  R(body, c, 'wobbleScale', 0.1, 8, 0.05, 'turbulence scale');
  R(body, c, 'flowSpeed', 0, 60, 0.5, 'surface flow');

  const look = jet.addFolder('Shading');
  R(look, c, 'opacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(look, c, 'fresnelGlow', 0, 6, 0.05, 'rim glow');
  R(look, c, 'gloss', 1, 300, 1, 'glint sharpness');
  R(look, c, 'specular', 0, 8, 0.05, 'glint strength');
  R(look, c, 'envReflect', 0, 3, 0.01, 'sky reflection');
  R(look, c, 'streakScale', 0.1, 10, 0.05, 'streaks per metre');
  R(look, c, 'streakGlow', 0, 8, 0.05, 'streak glow');
  R(look, c, 'foamScale', 0.1, 10, 0.05, 'foam scale');
  R(look, c, 'foamThreshold', 0, 1.5, 0.01, 'foam threshold');
  R(look, c, 'foamAmount', 0, 1, 0.01, 'foam');
  R(look, c, 'headFoam', 0, 3, 0.01, 'head foam');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  look.addColor(c, 'colorDeep').name('deep');
  look.addColor(c, 'colorShallow').name('shallow');
  look.addColor(c, 'colorGlow').name('glow');
  look.addColor(c, 'colorSpec').name('glint');
  look.addColor(c, 'colorFoam').name('foam');
  const core = jet.addFolder('Pressure core');
  R(core, c, 'coreScale', 0.05, 1, 0.01, 'radius (× jet)');
  R(core, c, 'coreGlow', 0, 10, 0.05, 'glow');
  core.addColor(c, 'colorCore').name('colour');

  const warp = folder.addFolder('2 · Refraction');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpScale', 0.5, 4, 0.01, 'lens radius (× jet)');
  R(warp, c, 'warpNoise', 0, 1, 0.01, 'turbulence share');
  R(warp, c, 'warpNoiseScale', 0.1, 8, 0.05, 'noise scale');

  const spray = folder.addFolder('3 · Spray');
  R(spray, c, 'mistRate', 0, 800, 1, 'mist/second');
  R(spray, c, 'mistSize', 0.02, 3, 0.01, 'mist size');
  R(spray, c, 'mistSpeed', 0, 10, 0.05, 'mist speed');
  R(spray, c, 'mistLift', -2, 4, 0.01, 'mist lift');
  R(spray, c, 'mistLifetime', 0.1, 5, 0.05, 'mist lifetime');
  R(spray, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  R(spray, c, 'mistDrag', 0, 8, 0.05, 'mist drag');
  R(spray, c, 'mistTurbulence', 0, 3, 0.01, 'mist turbulence');
  Editor.gradient(spray, c, 'colorMist', 'mist gradient');
  R(spray, c, 'dropletRate', 0, 1200, 1, 'droplets/second');
  R(spray, c, 'dropletSize', 0.005, 0.5, 0.001, 'droplet size');
  R(spray, c, 'dropletSpeed', 0, 20, 0.05, 'droplet speed');
  R(spray, c, 'dropletCarry', 0, 1.5, 0.01, 'droplets keep (× jet speed)');
  R(spray, c, 'dropletGravity', 0, 30, 0.1, 'gravity');
  R(spray, c, 'dropletLifetime', 0.05, 4, 0.01, 'droplet lifetime');
  R(spray, c, 'dropletDrag', 0, 6, 0.01, 'droplet drag');
  Editor.gradient(spray, c, 'colorDroplet', 'droplet gradient');
  R(spray, c, 'nozzleStreaks', 0, 400, 1, 'nozzle streaks/second');
  R(spray, c, 'streakSize', 0.005, 0.3, 0.001, 'streak width');
  R(spray, c, 'streakSpeed', 0, 40, 0.1, 'streak speed');
  R(spray, c, 'streakStretch', 0, 1, 0.005, 'streak stretch');
  R(spray, c, 'streakLifetime', 0.02, 2, 0.01, 'streak lifetime');
  R(spray, c, 'streakGlowP', 0, 8, 0.05, 'streak glow');
  R(spray, c, 'gatherCount', 0, 200, 1, 'drawn into the hand');
  R(spray, c, 'gatherRadius', 0.1, 4, 0.01, 'drawn from (m)');

  const soak = folder.addFolder('4 · Soak');
  R(soak, c, 'soakStart', 0, 4, 0.01, 'starts after (m)');
  R(soak, c, 'soakWidth', 0.1, 5, 0.01, 'half-width (m)');
  R(soak, c, 'soakEdgeNoise', 0, 1.5, 0.01, 'ragged edge');
  R(soak, c, 'soakEdgeScale', 0.05, 6, 0.01, 'edge scale');
  R(soak, c, 'soakDark', 0, 1, 0.01, 'wet darkening');
  R(soak, c, 'soakSheen', 0, 6, 0.05, 'glint');
  R(soak, c, 'soakEnv', 0, 3, 0.01, 'sky in it');
  R(soak, c, 'rippleScale', 0.1, 10, 0.05, 'ripple scale');
  R(soak, c, 'rippleSpeed', 0, 10, 0.05, 'ripple speed');
  R(soak, c, 'rippleBump', 0, 3, 0.01, 'ripple bump');
  R(soak, c, 'puddleScale', 0.1, 4, 0.01, 'puddle cells per metre');
  R(soak, c, 'puddleShare', 0, 1, 0.01, 'puddle share');
  R(soak, c, 'puddleSize', 0.05, 0.9, 0.01, 'puddle size');
  R(soak, c, 'puddleOpacity', 0, 1, 0.01, 'puddle opacity');
  R(soak, c, 'drainStart', 0, 0.95, 0.01, 'starts drying at');
  R(soak, c, 'drainErode', 0, 1, 0.01, 'ragged drying');
  R(soak, c, 'rippleSpacing', 0.3, 10, 0.05, 'ripple decal every (m)');
  R(soak, c, 'rippleRadius', 0.1, 6, 0.05, 'ripple decal radius');
  R(soak, c, 'rippleLife', 0.1, 6, 0.05, 'ripple decal life');
  R(soak, c, 'rippleIntensity', 0, 2, 0.01, 'ripple decal strength');
  soak.addColor(c, 'colorWet').name('wet floor');
  soak.addColor(c, 'colorPuddle').name('puddle');
  soak.addColor(c, 'colorSheen').name('glint');
  soak.addColor(c, 'colorRippleA').name('ripple');
  soak.addColor(c, 'colorRippleB').name('ripple crest');

  const wave = folder.addFolder('5 · Breaking wave');
  R(wave, c, 'waveTime', 0.1, 4, 0.01, 'lasts (s)');
  R(wave, c, 'waveWidth', 0.5, 14, 0.05, 'width (m)');
  R(wave, c, 'waveHeight', 0.2, 8, 0.05, 'profile length (m)');
  R(wave, c, 'waveBack', 0, 1, 0.01, 'base behind the end');
  R(wave, c, 'waveSlope', 0, 1.5, 0.01, 'back face slope (rad)');
  R(wave, c, 'curlStart', -1, 3.5, 0.01, 'curl standing (rad)');
  R(wave, c, 'curlEnd', 0, 4.5, 0.01, 'curl at the crash (rad)');
  R(wave, c, 'curlPower', 0.2, 5, 0.01, 'curl tightness');
  R(wave, c, 'peel', 0, 1, 0.01, 'peels from one side');
  R(wave, c, 'endTaper', 0, 3, 0.01, 'ends fall away');
  R(wave, c, 'waveBend', -1, 2, 0.01, 'ends wrap forward');
  R(wave, c, 'lipNoise', 0, 1, 0.01, 'ragged lip');
  R(wave, c, 'waveNoiseScale', 0.1, 6, 0.05, 'lip noise scale');
  R(wave, c, 'riseEnd', 0.05, 0.95, 0.01, 'stood up by');
  R(wave, c, 'crashAt', 0.1, 0.95, 0.01, 'crashes at');
  R(wave, c, 'crashSurge', 0, 6, 0.05, 'surges on (m)');
  R(wave, c, 'waveOpacity', 0, 1, 0.01, 'opacity');
  R(wave, c, 'waveFresnel', 0, 6, 0.05, 'fresnel');
  R(wave, c, 'waveTranslucency', 0, 6, 0.05, 'sun through the lip');
  R(wave, c, 'waveFoamStart', 0, 1, 0.01, 'crest foam from');
  R(wave, c, 'waveFoam', 0, 1, 0.01, 'foam');
  R(wave, c, 'waveFoamScale', 0.2, 10, 0.05, 'foam scale');
  R(wave, c, 'waveStreaks', 0, 1, 0.01, 'face streaks');
  wave.addColor(c, 'colorWaveDeep').name('deep');
  wave.addColor(c, 'colorWaveMid').name('mid');
  wave.addColor(c, 'colorWaveThin').name('thin lip');
  wave.addColor(c, 'colorWaveFoam').name('foam');

  const crash = folder.addFolder('6 · Crash');
  R(crash, c, 'crashRadius', 0.2, 10, 0.05, 'flood radius (m)');
  R(crash, c, 'burstSize', 0, 14, 0.05, 'burst (m)');
  R(crash, c, 'burstIntensity', 0, 4, 0.01, 'burst brightness');
  R(crash, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(crash, c, 'foamDecals', 0, 16, 1, 'foam decals');
  R(crash, c, 'foamDecalRadius', 0.1, 6, 0.05, 'foam decal radius');
  R(crash, c, 'foamDecalLife', 0.1, 10, 0.05, 'foam decal life');
  R(crash, c, 'splashCount', 0, 600, 1, 'splash droplets');
  R(crash, c, 'splashSpeed', 0, 25, 0.1, 'splash speed');
  R(crash, c, 'foamCount', 0, 400, 1, 'foam bubbles');
  R(crash, c, 'foamSize', 0.01, 0.6, 0.005, 'bubble size');
  R(crash, c, 'foamLifetime', 0.1, 8, 0.05, 'bubble lifetime');
  R(crash, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(crash, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(crash, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(crash, c, 'impactLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(crash, c, 'travelRumble', 0, 1, 0.01, 'rumble while firing');
  R(crash, c, 'retractTime', 0.05, 1, 0.01, 'jet drains by');
  crash.addColor(c, 'colorBurstA').name('burst inner');
  crash.addColor(c, 'colorBurstB').name('burst mid');
  crash.addColor(c, 'colorBurstC').name('burst outer');
  crash.addColor(c, 'colorShockA').name('shockwave');
  crash.addColor(c, 'colorShockB').name('shockwave hot');
  crash.addColor(c, 'colorFlash').name('flash');
  Editor.gradient(crash, c, 'colorFoam', 'foam gradient');

  const shove = folder.addFolder('7 · Shove + wash');
  R(shove, c, 'hitReach', 0, 3, 0.01, 'reach past the jet (m)');
  R(shove, c, 'jetImpulse', 0, 30, 0.1, 'blasted along (m/s)');
  R(shove, c, 'jetLift', 0, 10, 0.05, 'lift (m/s)');
  R(shove, c, 'jetSpin', 0, 4, 0.01, 'tumble');
  R(shove, c, 'carrySpeed', 0, 30, 0.1, 'current (m/s)');
  R(shove, c, 'carryGrab', 0, 20, 0.05, 'current grip');
  R(shove, c, 'slamDown', 0, 20, 0.1, 'slammed down (m/s)');
  R(shove, c, 'washSpeed', 0, 20, 0.1, 'backwash (m/s)');
  R(shove, c, 'washTime', 0.05, 4, 0.01, 'backwash lasts (s)');
  R(shove, c, 'washGrab', 0, 20, 0.05, 'backwash grip');
  R(shove, c, 'washReach', 0, 4, 0.01, 'backwash reach (m)');
  R(shove, c, 'hitSpray', 0, 150, 1, 'spray per hit');

  folder.close();
  return folder;
}
