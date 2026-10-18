import {
  CircleGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  TorusGeometry,
  Vector3
} from 'three';
import { Ability } from '../Ability.js';
import { createLinkMaterial, createPoolMaterial } from '../../materials/codex/UndertowChainsMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'undertow';

const TAU = Math.PI * 2;
const MAX_CHAINS = 8;
const MAX_LINKS_PER = 36;
const MAX_LINKS = MAX_CHAINS * MAX_LINKS_PER;
/** Bodies one cast can have hold of. */
const MAX_GRIPS = 14;
/** The torus the link mesh is built from: major radius 1, bar 0.2. */
const LINK_BAR = 0.2;

const _emit = {};
const _pos = new Vector3();
const _prev = new Vector3();
const _next = new Vector3();
const _dir = new Vector3();
const _T = new Vector3();
const _N = new Vector3();
const _B = new Vector3();
const _Y = new Vector3();
const _Z = new Vector3();
const _center = new Vector3();
const _floor = new Vector3();
const _matrix = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);

/**
 * UNDERTOW CHAINS — the circle floods dark, chains lash in, and drag it under.
 *
 * A zone cast in four beats. **The flood**: while the cast reaches out, a rim
 * of dark water floods in round the target circle, a foam lip churning at
 * its edge. **The chains**: they burst out of the water at the rim — five of
 * them, evenly spaced — and lash inward on spirals, link after link racing
 * toward the middle with a flare at each chain's head, humped and rippling
 * like a rope thrown slack. Every body a chain sweeps past is yanked off its
 * feet. **Taut**: the chains meet in a knot at the centre and go tight — the
 * slack and the ripple go out of them. **The drag**: the middle of the water
 * opens into black, the knot is pulled down into it and the chains are reeled
 * in after it, link by link, into the floor; the swells contract inward
 * faster and faster, bubbles boil up, and every body the chains took is
 * dragged inward and down through the floor. It closes over with a gulp, and
 * the pool drains away from the rim.
 *
 * Not the Maelstrom: that is a *funnel* — water turning round an eye, bodies
 * riding a spiral. This is a flat, dark undertow, and what takes the bodies
 * is the chains: everything here pulls straight in and straight down.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the undertow** (`createPoolMaterial(0)`) — the flood disc: contracting
 *      swells, streams along the chains' spirals, an abyss opening, a foam lip.
 *   2. **the chains** (`createLinkMaterial`) — an opaque `InstancedMesh` of
 *      stretched tori, alternate links turned 90° about the chain, laid along
 *      spiral paths on the CPU; water made solid with streaming veins.
 *   3. **the pull** — the flood disc on `LAYER.DISTORTION`, bending the floor
 *      inward in moving bands.
 *   4. **bubbles, spray & mist** — BUBBLE boiling up as it drags, DROPLET spray
 *      off the racing chain heads and their anchors, SMOKE mist over the rim.
 *   5. **the beats** — a ripple at every anchor; a big ripple, foam, a knock,
 *      a flash and a light punch as the drag starts; a WATER gulp at the end.
 *   6. **the grip** — `handlesOwnHits`: a body is taken when a chain's head
 *      sweeps past its radius, then carried inward and sunk (`Dummy#sink`).
 *
 * ## The editor rule
 *
 * A cast rolls a seed, the chains' first angle and their spiral's hand.
 * Every metre, time and colour is read from `settings.undertow` per frame.
 */
export class UndertowChainsAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The chains decide who goes under. */
  get handlesOwnHits() {
    return true;
  }

  /** Links drawn. HUD readout only. */
  get instanceCount() {
    return this._shown;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 + 3: the flood and its pull ---- */
    this.poolGeometry = new CircleGeometry(1, 96, 0, TAU);
    this.poolMaterial = createPoolMaterial(0);
    this.pool = this._mesh(this.poolGeometry, this.poolMaterial, LAYER.VFX, 2);
    this.pullMaterial = createPoolMaterial(1);
    this.pull = this._mesh(this.poolGeometry, this.pullMaterial, LAYER.DISTORTION, 0);

    /* ---- layer 2: the chains ---- */
    this.linkGeometry = new TorusGeometry(1, LINK_BAR, 8, 22);
    this.linkAttr = new InstancedBufferAttribute(new Float32Array(MAX_LINKS * 2), 2);
    this.linkAttr.setUsage(DynamicDrawUsage);
    this.linkGeometry.setAttribute('aLink', this.linkAttr);
    this.linkMaterial = createLinkMaterial();
    this.links = new InstancedMesh(this.linkGeometry, this.linkMaterial, MAX_LINKS);
    this.links.instanceMatrix.setUsage(DynamicDrawUsage);
    this.links.layers.set(LAYER.VFX);
    this.links.renderOrder = 8;
    this.links.frustumCulled = false;
    this.links.visible = false;
    this.links.count = 0;
    this.group.add(this.links);

    this._poolState = {
      center: new Vector3(),
      fill: 0,
      drain: 0,
      pull: 0,
      rings: 0,
      streams: 0,
      spin: 1,
      seed: 0
    };
    this._linkState = { flow: 0 };

    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._field = (x, y, z, out) => this._current(x, y, z, out);

    this._seed = 0;
    this._spin = 1;
    this._angle0 = 0;
    this._chains = 0;
    this._perChain = 0;
    this._shown = 0;
    this._wavePhase = 0;
    this._head = 0;
    this._slack = 1;
    this._drag = 0;
    this._dragging = false;
    this._gulped = false;
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

    this.bubbles = particles.get('undertow.bubbles', {
      capacity: 900,
      shape: ParticleShape.BUBBLE,
      additive: false,
      softFade: 0.2
    });
    this.bubbles.uniforms.uSizeIn.value = 0.2;
    this.bubbles.uniforms.uFadeIn.value = 0.1;
    this.bubbles.uniforms.uFadeOut.value = 0.2;
    this.bubbles.uniforms.uEndSize.value = 1.4;
    this.bubbles.uniforms.uDrag.value = 2.2;

    this.spray = particles.get('undertow.spray', {
      capacity: 1800,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.spray.uniforms.uSizeIn.value = 0.05;
    this.spray.uniforms.uFadeIn.value = 0.03;
    this.spray.uniforms.uFadeOut.value = 0.4;
    this.spray.uniforms.uEndSize.value = 0.5;
    this.spray.uniforms.uDrag.value = 0.5;

    this.mist = particles.get('undertow.mist', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.25;
    this.mist.uniforms.uFadeIn.value = 0.15;
    this.mist.uniforms.uFadeOut.value = 0.6;
    this.mist.uniforms.uEndSize.value = 2.0;
    this.mist.uniforms.uDrag.value = 1.4;

    this.bubbleEmitter = new RateEmitter();
    this.sprayEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _span() {
    const c = settings[ID];
    return Math.max(0.05, c.chainTime) + Math.max(0, c.holdTime) + Math.max(0.1, c.dragTime);
  }

  /** The impact phase is the chains lashing in, the hold and the drag. */
  get impactDuration() {
    return Math.max(0.1, this._span() * settings.global.lifetime);
  }

  /** The fade is the pool draining. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 7.3) * Math.sin(this.age * 2.9 + 0.4));
  }

  /* ------------------------------------------------------------------ */
  /* The chains' paths                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * A point on chain `k` at `u` (0 at the rim anchor .. 1 at the knot). Past
   * 1 the chain has been reeled into the hole: it goes straight down.
   */
  _chainPoint(k, u, out) {
    const c = settings[ID];
    const R = c.zoneRadius;
    const knot = Math.min(c.knotRadius, R * 0.5);
    const uc = Math.min(u, 1);
    const r = lerp(R * 0.97, knot, Math.pow(uc, 0.9));
    const th = this._angle0 + (k * TAU) / this._chains + this._spin * c.spiralTurns * TAU * uc;
    out.set(_center.x + Math.cos(th) * r, 0, _center.z + Math.sin(th) * r);

    // Out of the water at the rim, humped through the middle, low at the knot.
    const s = uc * (R - knot) * 1.3;
    const env = Math.sin(Math.PI * uc);
    let y = lerp(-0.25, 0.3, uc) + c.chainArc * Math.pow(env, 0.8) * (0.25 + 0.75 * this._slack);
    y += c.chainWave * env * this._slack * Math.sin((TAU * s) / Math.max(0.2, c.chainWaveLength) - this._wavePhase - k);
    // The drag: the knot goes first, the rest is pulled down after it.
    y -= c.sinkDepth * smoothstep(0, 1, this._drag * 1.7 - (1 - uc) * 0.7);
    if (u > 1) y -= (u - 1) * 6;
    out.y = y;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.bubbleEmitter.reset();
    this.sprayEmitter.reset();
    this.mistEmitter.reset();
    this._releaseGrips();

    this._seed = Math.random() * 100;
    this._spin = c.spiralSide > 0.5 ? 1 : c.spiralSide < -0.5 ? -1 : Math.random() < 0.5 ? 1 : -1;
    this._angle0 = Math.random() * TAU;
    this._chains = Math.max(1, Math.min(MAX_CHAINS, Math.round(c.chainCount)));
    this._perChain = Math.max(2, Math.min(MAX_LINKS_PER, Math.round(c.linksPerChain)));
    this._wavePhase = 0;
    this._head = 0;
    this._slack = 1;
    this._drag = 0;
    this._dragging = false;
    this._gulped = false;
    this._shown = 0;

    this.pointAt(1, _center);
    const ps = this._poolState;
    ps.center.copy(_center);
    ps.fill = 0;
    ps.drain = 0;
    ps.pull = 0;
    ps.rings = 0;
    ps.streams = 0;
    ps.spin = this._spin;
    ps.seed = this._seed;
    this._linkState.flow = 0;

    this.pool.visible = true;
    this.pull.visible = true;
    this.links.visible = false;
    this.links.count = 0;

    this._syncAll(0);
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

  _syncAll(dt) {
    const c = settings[ID];
    const g = settings.global;
    const ps = this._poolState;
    ps.rings += c.ringSpeed * (1 + 2.5 * this._drag) * dt * g.animationSpeed;
    ps.streams += c.streamSpeed * (1 + 2 * this._drag) * dt * g.noiseSpeed;
    ps.pull = this._drag;
    this.poolMaterial.userData.sync(ps);
    this.pullMaterial.userData.sync(ps);
    this._linkState.flow += c.linkFlow * (1 + this._drag * 2) * dt * g.noiseSpeed;
    this.linkMaterial.userData.sync(this._linkState);

    this.bubbles.setGradient(getColor(c.colorBubbleA), getColor(c.colorBubbleB), getColor(c.colorBubbleC), getColor(c.colorBubbleD));
    const b = this.bubbles.uniforms;
    b.uGravity.value.set(0, 1.2, 0);
    b.uSizeScale.value = g.particleSize;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uGlow.value = 1.2 * g.glow;
    b.uTurbulence.value = 0.6 * g.turbulence;

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const s = this.spray.uniforms;
    s.uGravity.value.set(0, -10, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = 1.3 * g.glow;
    s.uStretch.value = 0.1;
    s.uTurbulence.value = 0.2 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, 0.2, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.5 * g.turbulence;
    m.uSwirl.value = 0.7 * this._spin;
    m.uSwirlExpand.value = -0.3;
  }

  /** Lay every link along its chain. */
  _layLinks() {
    const c = settings[ID];
    const n = this._perChain;
    const reel = this._drag * 0.85;
    const arr = this.linkAttr.array;
    const sx = (c.linkLength * 0.5) / (1 + LINK_BAR);
    const sy = (c.linkWidth * 0.5) / (1 + LINK_BAR);
    const sz = c.linkThickness / (2 * LINK_BAR);
    let shown = 0;
    for (let k = 0; k < this._chains; k++) {
      for (let j = 0; j < n; j++) {
        const i = k * n + j;
        const u = j / (n - 1);
        if (u > this._head + 1e-4) {
          this.links.setMatrixAt(i, _zero);
          arr[i * 2] = 0;
          continue;
        }
        const ue = u + reel;
        this._chainPoint(k, ue, _pos);
        if (_pos.y < -1.2) {
          // Reeled under the floor and out of sight.
          this.links.setMatrixAt(i, _zero);
          arr[i * 2] = 0;
          continue;
        }
        this._chainPoint(k, ue - 0.012, _prev);
        this._chainPoint(k, ue + 0.012, _next);
        _T.subVectors(_next, _prev);
        if (_T.lengthSq() < 1e-8) _T.set(1, 0, 0);
        _T.normalize();
        _N.crossVectors(_T, _up);
        if (_N.lengthSq() < 1e-6) _N.set(1, 0, 0);
        _N.normalize();
        _B.crossVectors(_N, _T).normalize();
        // Alternate links turn 90° about the chain, the way a chain hangs.
        if (j % 2 === 0) {
          _Y.copy(_B);
          _Z.copy(_N);
        } else {
          _Y.copy(_N);
          _Z.copy(_B).negate();
        }
        // A link pops in as the head reaches it.
        const born = saturate((this._head - u) * n * 0.6);
        const pop = Easing.outBack(born);
        _matrix.makeBasis(_T.multiplyScalar(sx * pop), _Y.multiplyScalar(sy * pop), _Z.multiplyScalar(sz * pop));
        _matrix.setPosition(_pos);
        this.links.setMatrixAt(i, _matrix);
        arr[i * 2] = c.headGlow * Math.exp(-(this._head - u) * 14) * (this._head < 1 ? 1 : 0) + 0.6 * this._drag * Math.max(0, Math.sin(this.age * 12 - u * 8));
        arr[i * 2 + 1] = i * 0.37;
        shown++;
      }
    }
    this.links.count = this._chains * n;
    this._shown = shown;
    this.links.instanceMatrix.needsUpdate = true;
    this.linkAttr.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the flood gathers                                          */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._poolState.fill = c.gatherFill * Easing.outCubic(this.u);
    this._syncAll(dt);
    this._rimFx(dt, 0.6);
    this.ctx.shake.rumble(c.travelRumble, dt);
    this.position.copy(_center).setY(1.5);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the chains                                                 */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    this.links.visible = true;
    this.pointAt(1, _center);
    this._poolState.center.copy(_center);

    // A ripple and a burst of spray where each chain leaves the water.
    this._resetEmit(time);
    _emit.direction = _up;
    _emit.speed = c.spraySpeed * 1.2;
    _emit.spread = 0.6;
    _emit.size = c.spraySize * 1.2;
    _emit.life = c.sprayLife;
    _emit.radius = 0.25;
    for (let k = 0; k < this._chains; k++) {
      this._chainPoint(k, 0, _floor);
      _floor.y = 0;
      this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
        radius: c.anchorRipple,
        life: 0.7,
        intensity: 0.9,
        colorA: getColor(c.colorRippleA),
        colorB: getColor(c.colorRippleB)
      });
      _emit.position = _floor;
      this.spray.emit(Math.round(22 * g.particleCount), _emit);
    }
    this.ctx.shake.add(c.dragShake * 0.4 * g.explosionIntensity, 7, 18);
    this.lightBoost = c.lightIntensity * 0.6;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const ps = this._poolState;

    if (t <= 1) {
      const tau = t * this._span();
      const cT = Math.max(0.05, c.chainTime);
      const hT = Math.max(0, c.holdTime);
      const dT = Math.max(0.1, c.dragTime);
      const prevHead = this._head;
      this._head = Easing.outCubic(saturate(tau / cT));
      ps.fill = lerp(c.gatherFill, 1, Easing.outCubic(saturate(tau / Math.max(0.05, c.floodTime))));
      // Slack while it lashes in, taut once it lands, a shiver as it drags.
      this._slack = 1 - smoothstep(cT * 0.75, cT + hT * 0.6, tau);
      const dragT = saturate((tau - cT - hT) / dT);
      this._drag = Easing.inOutCubic(dragT);
      this._wavePhase += c.chainWaveSpeed * dt * g.animationSpeed;

      if (!this._dragging && dragT > 0) this._startDrag();

      this._syncAll(dt);
      this._layLinks();
      if (this._head < 1) this._headFx(dt);
      this._sweep(prevHead);
      this._rimFx(dt, 1);
      this._boil(dt, this._drag);
      this._hold(dt);
      if (this._dragging) this.ctx.shake.rumble(c.dragRumble * (1 - dragT), dt);
      this.position.copy(_center).setY(1.5 - this._drag * 0.9);
      return;
    }

    /* the fade: it closes over, the pool drains rim inward */
    const ft = saturate(t - 1);
    if (!this._gulped) this._gulp();
    this._drag = 1;
    ps.drain = smoothstep(0.05, 1, ft);
    this.links.visible = false;
    this._syncAll(dt);
    this._boil(dt, 1 - ft);
    this._rimFx(dt, 1 - ft);
    this._hold(dt);
    this.position.copy(_center).setY(0.6);
  }

  /** The drag begins: the middle opens and the circle goes down. */
  _startDrag() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._dragging = true;
    _floor.copy(_center).setY(0);
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: c.zoneRadius * c.dragRipple * power,
      life: 1.1,
      intensity: 1,
      colorA: getColor(c.colorRippleA),
      colorB: getColor(c.colorRippleB)
    });
    this.ctx.decals.spawn(DecalType.FOAM, _floor, {
      radius: c.zoneRadius * 0.9,
      life: this.fadeDuration + c.dragTime + 0.5,
      intensity: 0.7,
      colorA: getColor(c.colorFoam),
      colorB: getColor(c.colorShallow)
    });
    this.ctx.shake.add(c.dragShake * power, 3, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.dragFlash * power);
    this.lightBoost = c.lightIntensity * c.dragLight * power;
  }

  /** It closes over the last of them. */
  _gulp() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._gulped = true;
    _pos.copy(_center).setY(0.2);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: c.gulpSize * 0.2,
      endRadius: c.gulpSize * power,
      life: 0.5,
      intensity: 1,
      opacity: 0.5,
      fresnel: 2,
      displace: 0.35,
      turbulence: 1,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.spraySpeed * 1.8;
    _emit.spread = 0.45;
    _emit.size = c.spraySize * 1.3;
    _emit.life = c.sprayLife;
    this.spray.emit(Math.round(70 * g.particleCount), _emit);
    this.ctx.shake.add(c.dragShake * 0.5 * power, 6, 14);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Spray off each chain's racing head. */
  _headFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.sprayEmitter.tick(dt, c.sprayRate) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = c.spraySpeed;
    _emit.spread = 0.8;
    _emit.size = c.spraySize;
    _emit.life = c.sprayLife;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const k = i % this._chains;
      this._chainPoint(k, this._head, _pos);
      _emit.position = _pos;
      this.spray.emit(1, _emit);
    }
  }

  /** Mist hanging over the churning rim. */
  _rimFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.mistEmitter.tick(dt, c.mistRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = 0.4;
    _emit.spread = 0.6;
    _emit.size = c.mistSize;
    _emit.life = c.mistLife;
    _emit.spin = 0.4;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = c.zoneRadius * (0.85 + Math.random() * 0.2);
      _pos.set(_center.x + Math.cos(a) * r, 0.2, _center.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.anchor = _center;
      this.mist.emit(1, _emit);
    }
  }

  /** Bubbles boiling up out of the dragging water, crowded to the middle. */
  _boil(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.bubbleEmitter.tick(dt, c.bubbleRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = 0.8;
    _emit.spread = 0.4;
    _emit.size = c.bubbleSize;
    _emit.life = c.bubbleLife;
    _emit.lifeVariance = 0.6;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = c.zoneRadius * Math.pow(Math.random(), 1.6) * 0.9;
      _pos.set(_center.x + Math.cos(a) * r, 0.05, _center.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.bubbles.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The grip                                                            */
  /* ------------------------------------------------------------------ */

  /** Take every body the chains' heads have swept past this frame. */
  _sweep(prevHead) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    if (this._head <= prevHead && prevHead > 0) return;
    const c = settings[ID];
    const g = settings.global;
    const R = c.zoneRadius;
    const knot = Math.min(c.knotRadius, R * 0.5);
    const rHead = lerp(R, knot, Math.pow(this._head, 0.9)) - 0.35;
    const found = field.findTargets(_center.x, _center.z, R, this._found);
    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      const dx = dummy.position.x - _center.x;
      const dz = dummy.position.z - _center.z;
      const d = Math.hypot(dx, dz);
      if (d < rHead) continue;
      // Yanked off its feet, toward the middle.
      const inv = d > 1e-3 ? 1 / d : 0;
      this._force.impulse = c.knockImpulse * g.explosionIntensity;
      this._force.lift = c.knockLift;
      this._force.spin = c.knockSpin;
      if (!dummy.kill(-dx * inv || this.direction.x, -dz * inv || this.direction.z, this._force)) continue;
      this._grips[this._gripCount++].dummy = dummy;
      this._resetEmit(frame.uTime.value);
      _pos.copy(dummy.position).setY(0.6);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = c.spraySpeed;
      _emit.spread = 0.8;
      _emit.size = c.spraySize;
      _emit.life = c.sprayLife;
      this.spray.emit(Math.round(18 * g.particleCount), _emit);
    }
  }

  /** The water's velocity at a point: in toward the middle, and down as it drags. */
  _current(x, y, z, out) {
    const c = settings[ID];
    const dx = _center.x - x;
    const dz = _center.z - z;
    const d = Math.hypot(dx, dz) || 1;
    const pull = c.pullSpeed * Math.min(1, d / 1.5) * (0.35 + 0.65 * this._drag);
    out.set((dx / d) * pull, -2.8 * this._drag, (dz / d) * pull);
    return out;
  }

  /** Carry the taken bodies in and down. */
  _hold() {
    const c = settings[ID];
    const grab = saturate(c.grip);
    for (let i = 0; i < this._gripCount; i++) {
      const dummy = this._grips[i].dummy;
      if (!dummy) continue;
      dummy.carry(this._field, grab, grab * this._drag, 0);
      if (this._drag > 0) dummy.sink(c.bodySink * this._drag);
    }
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
    this.pool.visible = false;
    this.pull.visible = false;
    this.links.visible = false;
    this.links.count = 0;
    this._releaseGrips();
  }

  dispose() {
    this.poolGeometry.dispose();
    this.linkGeometry.dispose();
    this.poolMaterial.dispose();
    this.pullMaterial.dispose();
    this.linkMaterial.dispose();
    this.links.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛓  Undertow Chains');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'reach speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'drains over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 1, 12, 0.05, 'circle radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'shimmer');

  const pool = folder.addFolder('1 · Undertow');
  R(pool, c, 'gatherFill', 0, 1, 0.01, 'flooded before the chains');
  R(pool, c, 'floodTime', 0.05, 2, 0.01, 'floods over (s)');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'ringFreq', 0.05, 3, 0.01, 'swells per m');
  R(pool, c, 'ringSpeed', 0, 5, 0.01, 'swell speed');
  R(pool, c, 'ringGlow', 0, 6, 0.01, 'swell glow');
  R(pool, c, 'streamGlow', 0, 6, 0.01, 'stream glow');
  R(pool, c, 'streamSpeed', 0, 5, 0.01, 'stream speed');
  R(pool, c, 'abyss', 0, 1, 0.01, 'abyss');
  R(pool, c, 'foamWidth', 0.02, 3, 0.01, 'foam lip (m)');
  R(pool, c, 'foamGlow', 0, 5, 0.01, 'foam glow');
  R(pool, c, 'envAmount', 0, 3, 0.01, 'sky reflection');
  pool.addColor(c, 'colorAbyss').name('abyss');
  pool.addColor(c, 'colorDeep').name('deep');
  pool.addColor(c, 'colorShallow').name('shallow');
  pool.addColor(c, 'colorFoam').name('foam');
  pool.addColor(c, 'colorRing').name('swells');

  const shape = folder.addFolder('2 · Chains');
  R(shape, c, 'chainCount', 1, MAX_CHAINS, 1, 'chains');
  R(shape, c, 'linksPerChain', 2, MAX_LINKS_PER, 1, 'links each');
  R(shape, c, 'linkLength', 0.05, 1.5, 0.005, 'link length (m)');
  R(shape, c, 'linkWidth', 0.03, 1, 0.005, 'link width (m)');
  R(shape, c, 'linkThickness', 0.01, 0.4, 0.005, 'link bar (m)');
  R(shape, c, 'spiralTurns', -2, 2, 0.01, 'spiral turns');
  R(shape, c, 'spiralSide', -1, 1, 1, 'hand (−1 · 0 random · 1)');
  R(shape, c, 'knotRadius', 0, 2, 0.01, 'knot radius (m)');
  R(shape, c, 'chainArc', 0, 4, 0.01, 'hump (m)');
  R(shape, c, 'chainWave', 0, 1.5, 0.01, 'wave (m)');
  R(shape, c, 'chainWaveLength', 0.2, 8, 0.05, 'wavelength (m)');
  R(shape, c, 'chainWaveSpeed', 0, 30, 0.1, 'wave speed (rad/s)');
  R(shape, c, 'chainTime', 0.05, 2, 0.01, 'lashes in over (s)');

  const look = folder.addFolder('3 · Chain look');
  R(look, c, 'linkGlow', 0, 8, 0.05, 'rim glow');
  R(look, c, 'linkCore', 0, 4, 0.01, 'body');
  R(look, c, 'linkFresnel', 0.2, 8, 0.05, 'fresnel power');
  R(look, c, 'linkFlow', 0, 10, 0.05, 'vein flow');
  R(look, c, 'headGlow', 0, 6, 0.05, 'head flare');
  look.addColor(c, 'colorLinkA').name('deep');
  look.addColor(c, 'colorLinkB').name('body');
  look.addColor(c, 'colorLinkC').name('rim & veins');

  const drag = folder.addFolder('4 · Drag');
  R(drag, c, 'holdTime', 0, 1.5, 0.01, 'hangs taut (s)');
  R(drag, c, 'dragTime', 0.1, 4, 0.01, 'drags under over (s)');
  R(drag, c, 'sinkDepth', 0, 6, 0.05, 'chains sink (m)');
  R(drag, c, 'pullSpeed', 0, 10, 0.05, 'pull inward (m/s)');
  R(drag, c, 'grip', 0, 1, 0.01, 'grip');
  R(drag, c, 'bodySink', 0, 6, 0.05, 'bodies sink (m)');
  R(drag, c, 'knockImpulse', 0, 10, 0.05, 'yank (m/s)');
  R(drag, c, 'knockLift', 0, 6, 0.05, 'yank lift (m/s)');
  R(drag, c, 'knockSpin', 0, 4, 0.01, 'yank tumble');

  const warp = folder.addFolder('5 · Pull distortion');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');

  const fx = folder.addFolder('6 · Bubbles, spray & mist');
  R(fx, c, 'bubbleRate', 0, 400, 1, 'bubbles/second');
  R(fx, c, 'bubbleSize', 0.01, 0.6, 0.005, 'bubble size');
  R(fx, c, 'bubbleLife', 0.1, 4, 0.05, 'bubble lifetime');
  R(fx, c, 'sprayRate', 0, 600, 1, 'spray/second');
  R(fx, c, 'spraySize', 0.005, 0.4, 0.001, 'spray size');
  R(fx, c, 'spraySpeed', 0, 15, 0.05, 'spray speed');
  R(fx, c, 'sprayLife', 0.1, 4, 0.05, 'spray lifetime');
  R(fx, c, 'mistRate', 0, 120, 1, 'mist/second');
  R(fx, c, 'mistSize', 0.05, 4, 0.01, 'mist size');
  R(fx, c, 'mistLife', 0.1, 6, 0.05, 'mist lifetime');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(fx, c, 'colorBubble', 'bubble gradient');
  Editor.gradient(fx, c, 'colorSpray', 'spray gradient');
  Editor.gradient(fx, c, 'colorMist', 'mist gradient');

  const beats = folder.addFolder('7 · Beats');
  R(beats, c, 'anchorRipple', 0, 5, 0.05, 'anchor ripple (m)');
  R(beats, c, 'dragRipple', 0, 3, 0.01, 'drag ripple (× radius)');
  R(beats, c, 'dragShake', 0, 1.5, 0.01, 'camera knock');
  R(beats, c, 'dragFlash', 0, 1, 0.01, 'flash');
  R(beats, c, 'dragLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(beats, c, 'dragRumble', 0, 1, 0.01, 'rumble while dragging');
  R(beats, c, 'travelRumble', 0, 1, 0.01, 'rumble while flooding');
  R(beats, c, 'gulpSize', 0, 5, 0.05, 'gulp shell (m)');
  beats.addColor(c, 'colorRippleA').name('ripple');
  beats.addColor(c, 'colorRippleB').name('ripple bright');
  beats.addColor(c, 'colorBurstA').name('gulp inner');
  beats.addColor(c, 'colorBurstB').name('gulp mid');
  beats.addColor(c, 'colorBurstC').name('gulp outer');
  beats.addColor(c, 'colorFlash').name('flash');

  folder.close();
  return folder;
}
