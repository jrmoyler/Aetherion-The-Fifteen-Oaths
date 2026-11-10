import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createWellGeometry,
  createCurtainGeometry,
  createQuadGeometry
} from '../../assets/codex/DarkMatterWellGeometry.js';
import {
  createWellMaterial,
  createCurtainMaterial,
  createSeedMaterial,
  createLensMaterial
} from '../../materials/codex/DarkMatterWellMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'darkwell';

const TAU = Math.PI * 2;
/** Bodies one well can be swallowing at once. */
const MAX_GRIPS = 12;
/** Ceiling on the pull, m/s. */
const MAX_PULL = 7;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _at = new Vector3();
const _hand = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * DARK MATTER WELL — the floor sags into a gravity well, and dark matter
 * floods it from the rim in.
 *
 * A zone cast. A bead of ink in a thin ring of lensed light is lobbed to the
 * circle and sinks into the floor. The floor under the circle **sags** into a
 * gravity well — the picture of spacetime round a mass: a violet grid on a
 * dark sheet, flat at the rim and plunging into a narrow throat, its rings
 * flowing inward and its spokes winding into a spiral. At the rim a **wall of
 * dark matter** stands up — inky tongues with white-violet crests, leaning in
 * over the well — and then it **closes**, an iris contracting from the rim to
 * the eye; behind it the grid is drowned in ink with a few cold stars in it.
 * Whatever the wall passes is taken: knocked off its feet, drawn round and in
 * and down into the sheet. At the eye a **pit** opens — pure black, it eats
 * light, ringed by a thin hot ring of bent light — and it widens as the ink
 * closes in; the wall closes to a churning ring round it (drawn: the
 * swallow's own front still runs to the eye). Then the wall is **pulled down
 * the throat**, the well **springs shut** with a crack of violet light and a
 * spit of sparks — but not flat: a dent stays, and **lingers**, breathing as
 * it relaxes, its ink still winding in spiral arms, motes spiralling into the
 * shrinking pit and a thread of ink smoke breathed out of it — then the stain
 * erodes from the rim in.
 *
 * Colour is a four-stop ramp carried by the deep tones: near-black ink and
 * sheet, a saturated violet body on the lit far wall of the bowl, pale violet
 * only on the front, crests and grid, white only in the photon ring.
 *
 * Not a black hole: there is no disc and no sphere. Everything happens *in the
 * floor*, and the darkness comes from outside in.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seed** — a billboard: ink bead, lensed ring.
 *   2. **the well** (`createWellMaterial`) — a polar grid dropped into the
 *      funnel in the vertex stage, grid + flood front + ink in the fragment,
 *      drawn below the floor with its own depth.
 *   3. **the curtain** (`createCurtainMaterial`) — an open cylinder standing
 *      on the front, its crest cut into tongues on noise.
 *   4. **the lens** — `LAYER.DISTORTION`, pulling the light inward along the
 *      front and toward the eye.
 *   5. **ink & motes** — non-additive ink smoke torn off the crest and drawn
 *      in; additive violet motes streaming off the front toward the eye.
 *   6. **landing & closing** — shockwaves, an AIR shell, sparks up the throat,
 *      flash, shake, light.
 *   7. **the swallow** — `handlesOwnHits`. A body is taken the moment the
 *      front passes it, then carried round, in and down; the floor is lowered
 *      under it (`Dummy#sink`) so the opaque stage hides it as it goes under,
 *      and it is consumed once deep.
 *
 * ## The editor rule
 *
 * A cast captures a seed and integrated phases (the grid's flow and twist,
 * the ripple, the curtain's flow). Everything else is resolved from
 * `settings.darkwell` every frame.
 */
export class DarkMatterWellAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies held. HUD readout only. */
  get instanceCount() {
    return this._gripCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.wellGeometry = createWellGeometry(72, 128);
    this.curtainGeometry = createCurtainGeometry(160, 28);
    this.quadGeometry = createQuadGeometry();

    this.wellMaterial = createWellMaterial();
    // Early: it replaces the floor, and what is drawn after sorts against it.
    this.well = this._mesh(this.wellGeometry, this.wellMaterial, LAYER.VFX, 3);
    this.curtainMaterial = createCurtainMaterial();
    this.curtain = this._mesh(this.curtainGeometry, this.curtainMaterial, LAYER.VFX, 8);
    this.seedMaterial = createSeedMaterial();
    this.seed = this._mesh(this.quadGeometry, this.seedMaterial, LAYER.VFX, 14);
    this.lensMaterial = createLensMaterial();
    this.lens = this._mesh(this.quadGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    this._centre = new Vector3();
    this._wellState = {
      center: this._centre,
      radius: 4,
      open: 0,
      front: 1,
      flow: 0,
      twist: 0,
      ripplePhase: 0,
      reveal: 0,
      erode: 0,
      seed: 0,
      horizon: 0
    };
    this._curtainState = { center: this._centre, radius: 4, height: 0, drop: 0, flow: 0, seed: 0, fade: 1 };
    this._seedState = { center: new Vector3(), size: 0.4, seed: 0, fade: 1 };
    this._lensState = { center: this._centre, radius: 4, front: 1, strength: 0 };

    this._seed = 0;
    this._front = 1;
    this._open = 0;
    this._closed = false;

    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0 });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** The flow handed to `Dummy#carry` — one closure, made once. */
    this._flow = { vx: 0, vy: 0, vz: 0 };
    this._field = (x, y, z, out) => out.set(this._flow.vx, this._flow.vy, this._flow.vz);
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

    this.ink = particles.get('darkwell.ink', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 0.8
    });
    this.ink.uniforms.uSizeIn.value = 0.2;
    this.ink.uniforms.uFadeIn.value = 0.15;
    this.ink.uniforms.uFadeOut.value = 0.5;
    this.ink.uniforms.uEndSize.value = 1.6;
    this.ink.uniforms.uDrag.value = 1.2;

    this.motes = particles.get('darkwell.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.15
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 0.3;

    this.sparks = particles.get('darkwell.sparks', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.0;

    this.inkEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _beats() {
    const c = settings[ID];
    const swallowStart = Math.max(0, c.swallowDelay);
    const collapse = swallowStart + Math.max(0.1, c.swallowTime);
    const close = collapse + Math.max(0.05, c.collapseTime);
    return { swallowStart, collapse, close, end: close + Math.max(0.05, c.closeTime) + 0.15 };
  }

  get impactDuration() {
    return Math.max(0.1, this._beats().end * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 5.3) * Math.sin(this.age * 2.1 + 0.4));
  }

  /** The well's profile on the CPU — twin of `wellShape` in the materials. */
  _shape(x) {
    const a = Math.max(0.02, settings[ID].throat);
    const f = 1 / (1 + (x * x) / (a * a));
    const f1 = 1 / (1 + 1 / (a * a));
    return saturate((f - f1) / (1 - f1));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.inkEmitter.reset();
    this.moteEmitter.reset();
    this._releaseGrips();
    this._seed = Math.random() * 100;
    this._front = 1;
    this._open = 0;
    this._closed = false;

    this.pointAt(1, this._centre);
    this._centre.y = 0;

    const ws = this._wellState;
    ws.seed = this._seed;
    ws.flow = 0;
    ws.twist = 0;
    ws.ripplePhase = 0;
    ws.open = 0;
    ws.front = 1;
    ws.reveal = 0;
    ws.erode = 0;
    ws.horizon = 0;
    this._shutOpen = 0;
    this._shutHorizon = 0;
    this.inkEmitter.reset();
    this._curtainState.seed = this._seed;
    this._curtainState.flow = 0;
    this._seedState.seed = this._seed;
    this._seedState.fade = 1;

    this.seed.visible = true;
    this.well.visible = false;
    this.curtain.visible = false;
    this.lens.visible = false;
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
    this.ink.setGradient(getColor(c.colorInkSmokeA), getColor(c.colorInkSmokeB), getColor(c.colorInkSmokeC), getColor(c.colorInkSmokeD));
    const k = this.ink.uniforms;
    k.uGravity.value.set(0, -0.6, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = c.inkOpacity * g.opacity;
    k.uTurbulence.value = 0.6 * g.turbulence;
    // Swirl about the eye, closing in on it.
    k.uSwirl.value = 1.6;
    k.uSwirlExpand.value = -0.9;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, 0, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 0.4 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const s = this.sparks.uniforms;
    s.uGravity.value.set(0, -c.sparkGravity, 0);
    s.uStretch.value = c.sparkStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sparkGlow * g.glow;
    s.uTurbulence.value = 0.2 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the seed is lobbed                                         */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const st = this._seedState;
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).setY(c.handHeight);
    _pos.copy(this._centre).setY(0.25);
    const u = this.u;
    st.center.lerpVectors(_hand, _pos, u);
    st.center.y += c.arcHeight * Math.sin(Math.PI * u);
    st.size = c.seedSize * lerp(0.4, 1, saturate(this.age / 0.12));
    st.fade = 1;
    this.seedMaterial.userData.sync(st);
    this._syncParticles();

    // A thin trail of motes behind it.
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * 0.5) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.position = st.center;
      _emit.radius = c.seedSize * 0.4;
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife * 0.6;
      this.motes.emit(n, _emit);
    }
    this.position.copy(st.center);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — sag, close, swallow, shut                                   */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
      radius: c.zoneRadius * 0.9 * power,
      life: 0.5,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this._resetEmit(frame.uTime.value);
    _pos.copy(this._centre).setY(0.2);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed * 0.5;
    _emit.spread = 0.9;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife * 0.6;
    this.sparks.emit(Math.round(30 * g.particleCount), _emit);

    this.well.visible = true;
    this.curtain.visible = true;
    this.lens.visible = true;
    this.ctx.shake.add(c.landShake * power, 5, 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.landFlash * power);
    this.lightBoost = c.lightIntensity * 0.8;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const B = this._beats();
    const R = c.zoneRadius;
    const tau = t <= 1 ? (t * this.impactDuration) / Math.max(0.01, g.lifetime) : B.end;
    const ft = t > 1 ? saturate(t - 1) : 0;

    /* the timeline */
    const reveal = saturate(tau / 0.2);
    const sag = Easing.outCubic(saturate(tau / Math.max(0.05, c.openTime)));
    const sw = saturate((tau - B.swallowStart) / (B.collapse - B.swallowStart));
    this._front = lerp(1, 0.03, Easing.inOutQuad(sw));
    const col = saturate((tau - B.collapse) / (B.close - B.collapse));
    const shut = saturate((tau - B.close) / Math.max(0.05, c.closeTime));
    if (!this._closed && tau >= B.close) this._shut();
    // Springs shut with a little overshoot past flat.
    const spring = shut <= 0 ? 1 : Math.exp(-shut * 5) * Math.cos(shut * 11);
    this._open = sag * spring;

    /* integrated phases */
    const ws = this._wellState;
    ws.flow += c.flowSpeed * dt * g.noiseSpeed * (0.4 + Math.max(0, this._open));
    ws.twist += c.twistSpeed * dt * g.animationSpeed * (0.3 + sw);
    ws.ripplePhase += c.rippleSpeed * dt * g.animationSpeed;
    this._curtainState.flow += c.curtainFlow * dt * g.noiseSpeed;

    /* the well — what is drawn; `_open` above stays the swallow's own */
    const res = Math.max(0, c.residualSag);
    let open = this._open;
    let horizon = lerp(c.horizonMin, c.horizonMax, Easing.inOutQuad(sw)) * Math.min(1, sag);
    if (t <= 1 && shut > 0) {
      // Springs most of the way back — a dent stays, and the pit shrinks.
      open = sag * (res + (1 - res) * spring);
      horizon *= lerp(1, c.horizonLinger, Easing.outCubic(shut));
      this._shutOpen = open;
      this._shutHorizon = horizon;
    } else if (t > 1) {
      // The linger: the dent breathes as it relaxes, the pit closes, the ink turns.
      const relax = 1 - Easing.inOutQuad(saturate(ft / 0.85));
      const breathe = 1 + c.relaxWobble * Math.sin(TAU * c.relaxRate * this.age) * relax;
      open = this._shutOpen * relax * breathe;
      horizon = this._shutHorizon * (1 - smoothstep(0, 0.7, ft));
    }
    ws.radius = R;
    ws.open = open;
    ws.horizon = horizon;
    ws.front = this._front;
    ws.reveal = reveal;
    ws.erode = smoothstep(0.35, 1, ft);
    this.well.visible = ws.erode < 0.999;
    this.wellMaterial.userData.sync(ws);

    /* the curtain: stands on the front, then down the throat */
    const cs = this._curtainState;
    const rise = Easing.outBack(saturate(tau / Math.max(0.05, c.riseTime)));
    // Drawn, the wall stops short as a churning ring round the pit (the
    // swallow's own front still runs to the eye).
    cs.radius = R * Math.max(this._front, c.curtainMin) + 0.05;
    cs.height = c.curtainHeight * rise * (1 + c.curtainGrow * (1 - this._front));
    cs.drop = Easing.inCubic(col) * (cs.height + c.wellDepth);
    cs.fade = 1 - smoothstep(0.7, 1, col);
    this.curtain.visible = cs.fade > 0.01 && t <= 1;
    this.curtainMaterial.userData.sync(cs);

    /* the seed sinks in */
    const ss = this._seedState;
    ss.center.copy(this._centre).setY(0.25 - tau * 0.6);
    ss.fade = 1 - saturate(tau / 0.25);
    this.seed.visible = ss.fade > 0.01;
    if (this.seed.visible) this.seedMaterial.userData.sync(ss);

    /* the lens */
    const ls = this._lensState;
    ls.radius = R;
    ls.front = this._front;
    ls.strength = (t <= 1 ? sag * (1 - shut) : 0) + (shut > 0 && shut < 1 ? Math.sin(Math.PI * shut) * 0.8 : 0);
    ls.strength += c.lingerLens * Math.max(0, open) * (t > 1 || shut > 0 ? 1 : 0);
    this.lens.visible = ls.strength > 0.01;
    this.lensMaterial.userData.sync(ls);

    /* particles */
    this._syncParticles();
    if (t <= 1 && col < 1) this._frontFx(dt, cs, 1 - col);
    if (shut > 0 || t > 1) this._lingerFx(dt, horizon * R, Math.max(0, open), ws.erode);

    /* the swallow */
    if (t <= 1 && sw > 0 && !this._closed) this._capture();
    this._drag(dt);

    this.position.copy(this._centre);
    this.position.y = 1.2;
    if (t <= 1) this.ctx.shake.rumble(0.05 * sag * (1 - shut), dt);
  }

  /** Ink torn off the crest and drawn in; motes streaming off the front to the eye. */
  _frontFx(dt, cs, strength) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const r = cs.radius;
    const nInk = Math.round(this.inkEmitter.tick(dt, c.inkRate * strength) * g.particleCount);
    if (nInk > 0) {
      this._resetEmit(time);
      _emit.anchor = this._centre;
      _emit.size = c.inkSize;
      _emit.life = c.inkLife;
      _emit.speed = 1.2;
      _emit.spread = 0.3;
      _emit.spin = 0.6;
      for (let i = 0; i < nInk; i++) {
        const a = Math.random() * TAU;
        _pos.set(this._centre.x + Math.cos(a) * r, Math.max(0.2, cs.height * (0.5 + 0.5 * Math.random()) - cs.drop), this._centre.z + Math.sin(a) * r);
        _dir.set(-Math.cos(a), 0.4, -Math.sin(a));
        _emit.position = _pos;
        _emit.direction = _dir;
        this.ink.emit(1, _emit);
      }
    }
    const nMote = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (nMote > 0) {
      this._resetEmit(time);
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.speed = c.moteSpeed;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.12;
      for (let i = 0; i < nMote; i++) {
        const a = Math.random() * TAU;
        _pos.set(this._centre.x + Math.cos(a) * r, 0.05 + Math.random() * Math.min(1.2, cs.height), this._centre.z + Math.sin(a) * r);
        // In, and round — the way the grid's spokes wind.
        _dir.set(-Math.cos(a) - Math.sin(a) * 0.5, -0.05, -Math.sin(a) + Math.cos(a) * 0.5);
        _emit.position = _pos;
        _emit.direction = _dir;
        this.motes.emit(1, _emit);
      }
    }
  }

  /**
   * The linger: motes spiral down into the shrinking pit and a thread of ink
   * smoke is breathed back out of it while the dent relaxes.
   */
  _lingerFx(dt, pitR, open, erode) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const R = c.zoneRadius;
    const k = (1 - erode) * Math.min(1, open * 3 + 0.2);
    const nMote = Math.round(this.moteEmitter.tick(dt, c.lingerMotes * k) * g.particleCount);
    if (nMote > 0) {
      this._resetEmit(time);
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.speed = c.moteSpeed * 0.8;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.1;
      for (let i = 0; i < nMote; i++) {
        const a = Math.random() * TAU;
        const r = R * (0.35 + 0.6 * Math.random());
        _pos.set(this._centre.x + Math.cos(a) * r, 0.06, this._centre.z + Math.sin(a) * r);
        _dir.set(-Math.cos(a) - Math.sin(a) * 0.9, -0.08, -Math.sin(a) + Math.cos(a) * 0.9);
        _emit.position = _pos;
        _emit.direction = _dir;
        this.motes.emit(1, _emit);
      }
    }
    const nInk = Math.round(this.inkEmitter.tick(dt, c.lingerSmoke * k) * g.particleCount);
    if (nInk > 0) {
      this._resetEmit(time);
      _emit.anchor = this._centre;
      _emit.size = c.inkSize * 0.8;
      _emit.life = c.inkLife;
      _emit.speed = 0.9;
      _emit.spread = 0.35;
      _emit.spin = 0.8;
      _emit.direction = _up;
      _emit.radius = Math.max(0.15, pitR);
      _pos.copy(this._centre).setY(0.1);
      _emit.position = _pos;
      this.ink.emit(nInk, _emit);
    }
  }

  /** The well springs shut. */
  _shut() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._closed = true;
    this._resetEmit(frame.uTime.value);
    _pos.copy(this._centre).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.25;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.45;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.closeSparks * g.particleCount), _emit);
    _emit.speed = 2.5;
    _emit.spread = 1.2;
    _emit.size = c.inkSize * 1.2;
    _emit.life = c.inkLife;
    _emit.anchor = this._centre;
    _emit.spin = 0.6;
    this.ink.emit(Math.round(18 * g.particleCount), _emit);

    this.ctx.bursts.spawn(BurstMode.AIR, this._centre, {
      radius: 0.3,
      endRadius: c.zoneRadius * c.burstSize * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.55,
      fresnel: 2.4,
      displace: 0.35,
      turbulence: 1.2,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
      radius: c.zoneRadius * c.shockRadius * power,
      life: 0.6,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.shake.add(c.closeShake * power, 1 / Math.max(0.05, c.shakeDuration), 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.closeFlash * power);
    this.lightBoost = c.lightIntensity * c.closeLight * power;

    // Anything not yet under is let go of on the spot.
    for (let i = 0; i < this._gripCount; i++) this._grips[i].dummy?.release();
  }

  /* ------------------------------------------------------------------ */
  /* The swallow                                                         */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return this._grips[i];
    return null;
  }

  /** Take every body the front has passed. */
  _capture() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings[ID];
    const g = settings.global;
    const R = c.zoneRadius;
    const found = field.findBodies(this._centre.x, this._centre.z, R * 1.02, this._found);
    const reach = R * this._front + 0.25;
    this._force.impulse = c.gripImpulse * g.explosionIntensity;
    this._force.lift = c.gripLift * g.explosionIntensity;
    this._force.spin = c.gripSpin;
    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;
      const d = Math.hypot(dummy.position.x - this._centre.x, dummy.position.z - this._centre.z);
      if (dummy.alive) {
        if (d < reach) continue; // the front has not reached it
        _dir.set(this._centre.x - dummy.position.x, 0, this._centre.z - dummy.position.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      } else {
        const at = dummy.bodyPoint(_at);
        if (!at || at.y < -0.3) continue;
        if (Math.hypot(at.x - this._centre.x, at.z - this._centre.z) < reach) continue;
      }
      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
    }
  }

  /** Round, in and down; the floor goes down ahead of it; consumed once deep. */
  _drag(dt) {
    if (dt <= 0 || this._closed) return;
    const c = settings[ID];
    const g = settings.global;
    const R = Math.max(0.3, c.zoneRadius);
    const grab = saturate(c.gripGrab * dt);
    const f = this._flow;
    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      const at = dummy && !dummy.finished ? dummy.bodyPoint(_at) : null;
      if (!at) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      const dx = this._centre.x - at.x;
      const dz = this._centre.z - at.z;
      const d = Math.max(0.05, Math.hypot(dx, dz));
      const x = saturate(d / R);
      // The sheet's depth under it, and a little more: it sinks into the well.
      const depth = c.wellDepth * this._shape(x) * Math.max(0, this._open);
      dummy.sink(depth + 0.8);
      const wound = Easing.outCubic(saturate(slot.time / 0.4));
      const pull = c.pullSpeed * (0.4 + 0.6 * (1 - x)) * wound;
      const omega = c.swirl * g.animationSpeed;
      let vx = (dx / d) * pull + (-dz / d) * omega * d * 0.5;
      let vz = (dz / d) * pull + (dx / d) * omega * d * 0.5;
      const sp = Math.hypot(vx, vz);
      if (sp > MAX_PULL) {
        vx *= MAX_PULL / sp;
        vz *= MAX_PULL / sp;
      }
      f.vx = vx;
      f.vz = vz;
      f.vy = -c.sinkSpeed * wound - (at.y > -depth ? 0.5 : 0);
      dummy.carry(this._field, grab * wound, grab * wound, 0);
      dummy.hold();
      // Gone once it is deep enough under the floor.
      if (at.y < 0) dummy.consume(saturate(-at.y / Math.max(0.1, c.consumeDepth)));
    }
  }

  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    slot.dummy?.release();
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    slot.dummy = null;
    slot.time = 0;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
    }
    this._gripCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.well.visible = false;
    this.curtain.visible = false;
    this.seed.visible = false;
    this.lens.visible = false;
    this._releaseGrips();
  }

  dispose() {
    this.wellGeometry.dispose();
    this.curtainGeometry.dispose();
    this.quadGeometry.dispose();
    this.wellMaterial.dispose();
    this.curtainMaterial.dispose();
    this.seedMaterial.dispose();
    this.lensMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◉  Dark Matter Well');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'stain erodes over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'well radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'breathe');

  const seed = folder.addFolder('1 · Seed');
  R(seed, c, 'handForward', -1, 2, 0.01, 'forward (m)');
  R(seed, c, 'handHeight', 0.2, 3, 0.01, 'height (m)');
  R(seed, c, 'arcHeight', 0, 8, 0.05, 'arc (m)');
  R(seed, c, 'seedSize', 0.05, 2, 0.01, 'size (m)');
  R(seed, c, 'seedGlow', 0, 10, 0.05, 'ring glow');

  const well = folder.addFolder('2 · Well');
  R(well, c, 'wellDepth', 0, 10, 0.05, 'depth (m)');
  R(well, c, 'throat', 0.03, 1, 0.01, 'throat width');
  R(well, c, 'bowl', 0, 1, 0.01, 'broad bowl (share)');
  R(well, c, 'bowlPower', 0.2, 6, 0.01, 'bowl roundness');
  R(well, c, 'depthFalloff', 0, 4, 0.01, 'light dies with depth (1/m)');
  R(well, c, 'wallLight', 0, 4, 0.01, 'far wall catches light');
  R(well, c, 'residualSag', 0, 1, 0.01, 'dent kept after shut');
  R(well, c, 'relaxWobble', 0, 1, 0.01, 'dent breathes');
  R(well, c, 'relaxRate', 0, 6, 0.01, 'breaths/second');
  R(well, c, 'lingerLens', 0, 3, 0.01, 'lens on the dent');
  R(well, c, 'openTime', 0.05, 3, 0.01, 'sags over (s)');
  R(well, c, 'gridRings', 1, 30, 1, 'grid rings');
  R(well, c, 'gridSpokes', 1, 72, 1, 'grid spokes');
  R(well, c, 'gridLine', 0.001, 0.08, 0.001, 'line width');
  R(well, c, 'gridGlow', 0, 10, 0.05, 'grid glow');
  R(well, c, 'flowSpeed', -4, 4, 0.01, 'rings flow in');
  R(well, c, 'twistSpeed', -4, 4, 0.01, 'spokes wind');
  R(well, c, 'rippleAmp', 0, 1, 0.01, 'ripple (m)');
  R(well, c, 'rippleFreq', 1, 60, 0.5, 'ripple frequency');
  R(well, c, 'rippleSpeed', 0, 30, 0.1, 'ripple speed');
  R(well, c, 'rimGlow', 0, 10, 0.05, 'rim glow');
  R(well, c, 'closeTime', 0.05, 2, 0.01, 'springs shut over (s)');
  well.addColor(c, 'colorSheet').name('sheet');
  well.addColor(c, 'colorBody').name('body');
  well.addColor(c, 'colorAbyss').name('abyss');
  well.addColor(c, 'colorGrid').name('grid');

  const dm = folder.addFolder('3 · Dark matter');
  R(dm, c, 'swallowDelay', 0, 2, 0.01, 'starts in after (s)');
  R(dm, c, 'swallowTime', 0.1, 5, 0.01, 'reaches the eye over (s)');
  R(dm, c, 'frontNoise', 0, 3, 0.01, 'ragged front');
  R(dm, c, 'frontWidth', 0.004, 0.2, 0.001, 'front edge width');
  R(dm, c, 'frontGlow', 0, 12, 0.05, 'front glow');
  R(dm, c, 'veinGlow', 0, 5, 0.05, 'vein glow');
  R(dm, c, 'inkStars', 0, 4, 0.05, 'stars in the ink');
  R(dm, c, 'horizonMin', 0, 0.5, 0.005, 'pit as it starts (× radius)');
  R(dm, c, 'horizonMax', 0, 0.6, 0.005, 'pit when closed (× radius)');
  R(dm, c, 'horizonLinger', 0, 1, 0.01, 'pit kept after shut');
  R(dm, c, 'photonGlow', 0, 12, 0.05, 'photon ring glow');
  R(dm, c, 'photonWidth', 0.002, 0.1, 0.001, 'photon ring width');
  R(dm, c, 'spiralArms', 1, 8, 1, 'spiral arms');
  R(dm, c, 'spiralTight', 0, 5, 0.01, 'arms wind');
  R(dm, c, 'spiralGlow', 0, 4, 0.01, 'arm glow');
  R(dm, c, 'inkBody', 0, 3, 0.01, 'ink body on the upper wall');
  R(dm, c, 'lingerMotes', 0, 800, 1, 'linger motes/second');
  R(dm, c, 'lingerSmoke', 0, 200, 1, 'linger ink/second');
  dm.addColor(c, 'colorInk').name('ink');
  dm.addColor(c, 'colorVein').name('veins');
  dm.addColor(c, 'colorFront').name('front');
  dm.addColor(c, 'colorPhoton').name('photon ring');

  const cur = folder.addFolder('4 · Curtain');
  R(cur, c, 'curtainHeight', 0.1, 6, 0.01, 'height (m)');
  R(cur, c, 'curtainMin', 0, 0.8, 0.01, 'closes to (× radius)');
  R(cur, c, 'curtainGrow', 0, 3, 0.01, 'grows as it closes');
  R(cur, c, 'curtainLean', -0.5, 0.9, 0.01, 'crest leans in');
  R(cur, c, 'curtainSway', 0, 1.5, 0.01, 'sway (m)');
  R(cur, c, 'curtainFlow', 0, 8, 0.05, 'tongues flow');
  R(cur, c, 'riseTime', 0.05, 2, 0.01, 'stands up over (s)');
  R(cur, c, 'tendrils', 1, 40, 0.5, 'tongues');
  R(cur, c, 'crestLow', 0, 1, 0.01, 'lowest crest');
  R(cur, c, 'crestGlow', 0, 12, 0.05, 'crest glow');
  R(cur, c, 'curtainRim', 0, 8, 0.05, 'rim glow');
  R(cur, c, 'footGlow', 0, 8, 0.05, 'foot glow');
  R(cur, c, 'streakGlow', 0, 6, 0.05, 'streak glow');
  R(cur, c, 'curtainOpacity', 0, 1, 0.01, 'opacity');
  R(cur, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  R(cur, c, 'collapseTime', 0.05, 2, 0.01, 'pulled down over (s)');
  cur.addColor(c, 'colorEdge').name('edges');
  cur.addColor(c, 'colorCrest').name('crests');

  const lens = folder.addFolder('5 · Lens');
  R(lens, c, 'lensStrength', 0, 4, 0.01, 'pull on the light');
  R(lens, c, 'lensHeight', 0, 3, 0.01, 'height (m)');

  const fx = folder.addFolder('6 · Ink & motes');
  R(fx, c, 'inkRate', 0, 400, 1, 'ink/second');
  R(fx, c, 'inkSize', 0.05, 4, 0.01, 'ink size');
  R(fx, c, 'inkLife', 0.1, 5, 0.05, 'ink lifetime');
  R(fx, c, 'inkOpacity', 0, 1, 0.01, 'ink opacity');
  R(fx, c, 'moteRate', 0, 1200, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteSpeed', 0, 12, 0.05, 'mote speed (m/s)');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorInkSmoke', 'ink gradient');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');

  const close = folder.addFolder('7 · Landing & closing');
  R(close, c, 'landShake', 0, 1.5, 0.01, 'landing knock');
  R(close, c, 'landFlash', 0, 1, 0.01, 'landing flash');
  R(close, c, 'closeSparks', 0, 600, 1, 'sparks up the throat');
  R(close, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(close, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(close, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(close, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(close, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(close, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  R(close, c, 'closeShake', 0, 1.5, 0.01, 'closing knock');
  R(close, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(close, c, 'closeFlash', 0, 1, 0.01, 'closing flash');
  R(close, c, 'closeLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(close, c, 'shockRadius', 0, 4, 0.01, 'shockwave (× radius)');
  R(close, c, 'burstSize', 0, 3, 0.01, 'air shell (× radius)');
  R(close, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  close.addColor(c, 'colorFlash').name('flash');
  close.addColor(c, 'colorBurstA').name('shell inner');
  close.addColor(c, 'colorBurstB').name('shell mid');
  close.addColor(c, 'colorBurstC').name('shell outer');
  close.addColor(c, 'colorShockA').name('shockwave');
  close.addColor(c, 'colorShockB').name('shockwave hot');
  Editor.gradient(close, c, 'colorSpark', 'spark gradient');

  const sw = folder.addFolder('8 · Swallow');
  R(sw, c, 'gripImpulse', 0, 15, 0.1, 'knocked in (m/s)');
  R(sw, c, 'gripLift', 0, 10, 0.1, 'lift (m/s)');
  R(sw, c, 'gripSpin', 0, 6, 0.01, 'tumble');
  R(sw, c, 'pullSpeed', 0, 8, 0.05, 'pulled in (m/s)');
  R(sw, c, 'sinkSpeed', 0, 8, 0.05, 'sinks (m/s)');
  R(sw, c, 'swirl', -6, 6, 0.05, 'swirl (rad/s)');
  R(sw, c, 'gripGrab', 0.5, 30, 0.1, 'grip (1/s)');
  R(sw, c, 'consumeDepth', 0.2, 5, 0.05, 'gone at depth (m)');

  folder.close();
  return folder;
}
