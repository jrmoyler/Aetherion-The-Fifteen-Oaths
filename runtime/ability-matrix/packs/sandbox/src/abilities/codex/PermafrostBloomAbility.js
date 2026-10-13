import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  DynamicDrawUsage
} from 'three';
import { Ability } from '../Ability.js';
import {
  createIceCrystalGeometry,
  createIceSeedGeometry,
  createGroundQuadGeometry
} from '../../assets/codex/PermafrostBloomGeometry.js';
import {
  createRimeMaterial,
  createColdAirMaterial,
  createIceMaterial
} from '../../materials/codex/PermafrostBloomMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'permafrost';

const TAU = Math.PI * 2;
/** Bodies one bloom can hold frozen at once. */
const MAX_FROZEN = 10;
/** Crystals in one body's shell (the editor's slider clamps to this). */
const MAX_SHELL = 14;
/** Dice per shell crystal: bearing, radius, height, lean, thickness, spin, delay. */
const SHELL_DICE = 7;
/** Spikes in the eruption ring (the editor's slider clamps to this). */
const MAX_SPIKES = 96;
/** Dice per spike: bearing jitter, radius jitter, height, lean, spin, crumble delay, thickness. */
const SPIKE_DICE = 7;
const MAX_RINGS = 6;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _hand = new Vector3();
const _axis = new Vector3();
const _scale = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m = new Matrix4();
const _up = new Vector3(0, 1, 0);
const _ringCounts = new Int32Array(MAX_RINGS);

/**
 * PERMAFROST BLOOM — Frost, zone cast.
 *
 * A frost seed is lobbed from the hand and lands in the circle. From where it
 * lands **fractal rime races across the floor** to the edge: frost-fern
 * spines run out ahead, a field of small dendrite crystals fills in behind
 * them, the floor frosts white over deep blue and sparkles, and cold mist
 * rolls off the advancing front. As the front reaches a body it is **frozen
 * where it stands** — its clip is held mid-breath, it goes to ice
 * (`corrode`), and a shell of crystals grows up round it from the floor. The
 * circle holds; then **a ring of ice spikes erupts** from the rime's edge and
 * sweeps inward to the middle, and as the eruption passes each frozen body
 * that body **shatters**: the shell breaks on a noise threshold, ice chips
 * fly, and the body is killed and thrown *outward*, away from the middle.
 * The spikes stand, then crumble, and the rime **sublimates** away on a
 * glittering edge.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seed** — a faceted bipyramid of ice (the shared ice shader) on a
 *      parabolic arc, tumbling, shedding glints.
 *   2. **the rime** (`createRimeMaterial`) — one ground quad, three scales of
 *      frost all keyed to one front radius: leading fern arms, a dendrite
 *      field, fbm frosting; a bright front band, glints, sublimation.
 *   3. **cold mist** — non-additive SMOKE rolled outward off the front and
 *      seeping off the frost while it holds; a cold-air shimmer on
 *      `LAYER.DISTORTION`.
 *   4. **the shells** — instanced faceted crystals, a ring round each frozen
 *      body, grown from the floor up, with dice resolved live from settings.
 *   5. **the spikes** — instanced crystals in concentric rings, leaning in,
 *      erupting outermost first so the eruption reads as a wave closing on
 *      the middle.
 *   6. **the shatter** — CHIP particles, a FROST shell, flash, shake, light
 *      punch, and the kill; a SHOCKWAVE and a burst where the spikes converge.
 *
 * ## The dummies
 *
 * `handlesOwnHits`. A body is held, not killed, while it is frozen: its
 * action is paused (as Stillpoint holds a body) and it is stained to ice with
 * `corrode`, which is safe on a standing body and monotonic — so the corpse
 * that flies out of the shatter is still frozen blue. The kill waits for the
 * eruption to reach it; anything still frozen when the bloom ends is broken
 * then, so nothing is left paused.
 *
 * ## The editor rule
 *
 * Records hold only dice and latched events (when a body froze, whether it
 * has shattered, whether a spike has burst). Radii, heights, times and colours
 * are resolved from `settings.permafrost` every frame.
 */
export class PermafrostBloomAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies frozen by this bloom. HUD readout only. */
  get instanceCount() {
    return this._frozenCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.quadGeometry = createGroundQuadGeometry();
    this.crystalGeometry = createIceCrystalGeometry();
    this.seedGeometry = createIceSeedGeometry();
    this.seedGeometry.setAttribute('aIce', new BufferAttribute(new Float32Array((this.seedGeometry.attributes.position.count) * 4), 4));

    /* ---- layer 2: the rime ---- */
    this.rimeMaterial = createRimeMaterial();
    this.rime = this._mesh(new Mesh(this.quadGeometry, this.rimeMaterial), LAYER.VFX, 2);

    /* ---- layer 3: cold air ---- */
    this.coldMaterial = createColdAirMaterial();
    this.cold = this._mesh(new Mesh(this.quadGeometry, this.coldMaterial), LAYER.DISTORTION, 0);

    /* ---- layer 1: the seed ---- */
    this.seedMaterial = createIceMaterial();
    this.seed = this._mesh(new Mesh(this.seedGeometry, this.seedMaterial), LAYER.VFX, 12);

    /* ---- layers 4 + 5: the shells and the spikes, one shader ---- */
    this.iceMaterial = createIceMaterial();
    this.shellIce = new Float32Array(MAX_FROZEN * MAX_SHELL * 4);
    this.shells = this._instanced(MAX_FROZEN * MAX_SHELL, this.shellIce, 10);
    this.spikeIce = new Float32Array(MAX_SPIKES * 4);
    this.spikes = this._instanced(MAX_SPIKES, this.spikeIce, 11);

    /** Frozen bodies: the dummy, where and when, and its shell's dice. */
    this._frozen = [];
    for (let i = 0; i < MAX_FROZEN; i++) {
      this._frozen.push({
        dummy: null,
        x: 0,
        z: 0,
        frozeAt: 0,
        shattered: false,
        shatteredAt: 0,
        dice: new Float32Array(MAX_SHELL * SHELL_DICE)
      });
    }
    this._frozenCount = 0;

    this._spikeDice = new Float32Array(MAX_SPIKES * SPIKE_DICE);
    this._spikeBurst = new Uint8Array(MAX_SPIKES);

    this._rimeState = { center: new Vector3(), front: 0, radius: 4, growing: 1, twinkle: 0, sublimate: 0, seed: 0 };
    this._coldState = { center: new Vector3(), front: 0, radius: 4, fade: 1, seed: 0 };
    this._iceState = { fade: 1, glow: 1 };
    this._seedState = { fade: 1, glow: 1 };

    this._seedVal = 0;
    this._t = -1;
    this._twinkle = 0;
    this._converged = false;
    this._eruptStarted = false;
    this._seedSpin = 0;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
  }

  _mesh(mesh, layer, order) {
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  _instanced(capacity, iceArray, order) {
    const mesh = new InstancedMesh(this.crystalGeometry, this.iceMaterial, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const attr = new InstancedBufferAttribute(iceArray, 4);
    attr.setUsage(DynamicDrawUsage);
    // One crystal, two instanced meshes: each needs its own aIce, so each
    // draws a clone of the crystal carrying its own instanced attribute.
    const geometry = this.crystalGeometry.clone();
    geometry.setAttribute('aIce', attr);
    mesh.geometry = geometry;
    mesh.count = 0;
    return this._mesh(mesh, LAYER.VFX, order);
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- cold mist: frost-white smoke, not additive ---- */
    this.mist = particles.get('permafrost.mist', {
      capacity: 2200,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.2
    });
    this.mist.uniforms.uSizeIn.value = 0.25;
    this.mist.uniforms.uFadeIn.value = 0.2;
    this.mist.uniforms.uFadeOut.value = 0.5;
    this.mist.uniforms.uEndSize.value = 2.4;
    this.mist.uniforms.uDrag.value = 0.9;

    /* ---- glints: the seed's trail, the frost, the sublimation ---- */
    this.glints = particles.get('permafrost.glints', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.glints.uniforms.uSizeIn.value = 0.04;
    this.glints.uniforms.uFadeIn.value = 0.05;
    this.glints.uniforms.uFadeOut.value = 0.6;
    this.glints.uniforms.uEndSize.value = 0.2;
    this.glints.uniforms.uDrag.value = 1.6;

    /* ---- ice chips: the shatter and the spikes ---- */
    this.chips = particles.get('permafrost.chips', {
      capacity: 2400,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.75;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uDrag.value = 0.5;

    this.mistEmitter = new RateEmitter();
    this.glintEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every time is a setting × global.lifetime                  */
  /* ------------------------------------------------------------------ */

  _T(seconds) {
    return Math.max(0.01, seconds * settings.global.lifetime);
  }

  _spikeStart() {
    const c = settings[ID];
    return this._T(c.growTime) + this._T(Math.max(0, c.holdTime));
  }

  get impactDuration() {
    const c = settings[ID];
    return this._spikeStart() + this._T(c.spikeTime) + this._T(c.spikeRise) + this._T(Math.max(0, c.shatterDelay)) + this._T(Math.max(0, c.linger));
  }

  get fadeDuration() {
    return this._T(Math.max(0.1, settings[ID].lifetime));
  }

  /** Cold light does not gutter; it glints. */
  lightShimmer() {
    return 0.93 + 0.07 * Math.sin(this.age * 7.1) * Math.sin(this.age * 2.3);
  }

  /* ------------------------------------------------------------------ */
  /* Geometry of the bloom                                               */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.3, settings[ID].zoneRadius);
  }

  /** The rime's front, metres from the centre, at bloom time `t`. */
  _front(t) {
    const c = settings[ID];
    const k = saturate(t / this._T(c.growTime));
    return this.radius * Math.pow(k, Math.max(0.1, c.growCurve));
  }

  /** The eruption wave's radius at bloom time `t` — R, closing to 0. */
  _wave(t) {
    const k = (t - this._spikeStart()) / this._T(settings[ID].spikeTime);
    return this.radius * (1 - saturate(k));
  }

  /** When the wave reaches radius `r`. */
  _waveAt(r) {
    return this._spikeStart() + (1 - saturate(r / this.radius)) * this._T(settings[ID].spikeTime);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.mistEmitter.reset();
    this.glintEmitter.reset();
    this.trailEmitter.reset();
    this._releaseAll();

    this._seedVal = Math.random() * 100;
    this._t = -1;
    this._twinkle = 0;
    this._converged = false;
    this._eruptStarted = false;
    this._seedSpin = Math.random() * TAU;

    for (let i = 0; i < MAX_SPIKES; i++) {
      const o = i * SPIKE_DICE;
      for (let k = 0; k < SPIKE_DICE; k++) this._spikeDice[o + k] = Math.random();
      this._spikeBurst[i] = 0;
    }
    this.shellIce.fill(0);
    this.spikeIce.fill(0);
    this.shells.count = 0;
    this.spikes.count = 0;

    this._rimeState.seed = this._seedVal;
    this._rimeState.front = 0;
    this._rimeState.sublimate = 0;
    this._coldState.seed = this._seedVal;

    this.seed.visible = true;
    this.rime.visible = false;
    this.cold.visible = false;
    this.shells.visible = true;
    this.spikes.visible = true;

    this._syncLooks();
    this._placeSeed(0, 0);
  }

  _releaseAll() {
    for (let i = 0; i < this._frozenCount; i++) {
      const slot = this._frozen[i];
      if (slot.dummy?.action) slot.dummy.action.paused = false;
      slot.dummy = null;
    }
    this._frozenCount = 0;
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

  /** The particles' and the ice's looks, live from settings. */
  _syncLooks() {
    const c = settings[ID];
    const g = settings.global;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, 0.05, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.5 * g.turbulence;
    m.uSwirl.value = 0.6;
    m.uSwirlExpand.value = 0.7;

    this.glints.setGradient(getColor(c.colorSparkle), getColor(c.colorRimeA), getColor(c.colorRimeB), getColor(c.colorIceB));
    const s = this.glints.uniforms;
    s.uGravity.value.set(0, 0.25, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.glintGlow * g.glow;
    s.uTurbulence.value = 0.6 * g.turbulence;

    this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
    const k = this.chips.uniforms;
    k.uGravity.value.set(0, -c.chipGravity, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uTurbulence.value = 0.1 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the seed's flight                                          */
  /* ------------------------------------------------------------------ */

  /** The seed on its arc at fraction `u` of the flight. */
  _placeSeed(u, dt) {
    const c = settings[ID];
    const g = settings.global;
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).setY(c.handHeight);
    this.pointAt(1, _centre);
    _centre.y = Math.max(0.05, c.seedSize * 0.6);
    _pos.lerpVectors(_hand, _centre, u);
    _pos.y += 4 * c.seedArc * u * (1 - u);
    this._seedSpin += c.seedSpin * dt * g.animationSpeed;
    this.seed.position.copy(_pos);
    this.seed.rotation.set(this._seedSpin * 0.7, this._seedSpin, this._seedSpin * 0.3);
    // It forms in the hand over the first tenth of a second.
    const form = Easing.outBack(saturate(this.age / 0.12));
    this.seed.scale.setScalar(Math.max(0.001, c.seedSize * form));
    this._seedState.fade = 1;
    this._seedState.glow = c.seedGlow / Math.max(0.05, c.iceGlow);
    this.seedMaterial.userData.sync(this._seedState);
    return _pos;
  }

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._syncLooks();
    const at = this._placeSeed(this.u, dt);
    this.position.copy(at);

    const n = Math.round(this.trailEmitter.tick(dt, c.seedTrail) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.position = at;
      _emit.radius = c.seedSize * 0.8;
      _emit.direction = _up;
      _emit.speed = 0.4;
      _emit.spread = 1;
      _emit.size = c.glintSize;
      _emit.life = c.glintLife * 0.7;
      this.glints.emit(n, _emit);
      if (Math.random() < 0.4) {
        _emit.size = c.mistSize * 0.35;
        _emit.life = c.mistLife * 0.35;
        this.mist.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the seed lands and the bloom begins                        */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._t = 0;
    this.seed.visible = false;
    this.rime.visible = true;
    this.cold.visible = true;

    this.pointAt(1, _centre);
    _centre.y = 0.2;
    this.ctx.bursts.spawn(BurstMode.FROST, _centre, {
      radius: c.landBurst * 0.2,
      endRadius: c.landBurst * power,
      life: 0.55,
      intensity: 1.1,
      opacity: 0.8,
      fresnel: 2.2,
      displace: 0.3,
      squash: 0.5,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _centre.y = 0;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: this.radius * 1.2 * power,
      life: 0.6,
      width: 0.05,
      intensity: 0.9,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    this._resetEmit(frame.uTime.value);
    _pos.copy(_centre).setY(0.15);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = 2.5;
    _emit.spread = 1.2;
    _emit.size = c.glintSize * 1.4;
    _emit.life = c.glintLife;
    this.glints.emit(Math.round(60 * g.particleCount), _emit);
    _emit.speed = c.chipSpeed * 0.5;
    _emit.size = c.chipSize * 0.7;
    _emit.life = c.chipLife * 0.6;
    _emit.spin = 6;
    this.chips.emit(Math.round(16 * g.particleCount), _emit);

    this.ctx.shake.add(c.landShake * power, 5, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.landFlash * power);
    this.lightBoost = c.lightIntensity * 0.8 * power;
    this._bloom(0);
  }

  onFade(dt, t) {
    this._syncLooks();
    if (t <= 1) {
      this._t += dt;
      this._twinkle += settings[ID].sparkleSpeed * dt * settings.global.noiseSpeed;
      this._bloom(dt);
      return;
    }
    this._sublimate(dt, saturate(t - 1));
  }

  /* ------------------------------------------------------------------ */
  /* The bloom: spread, freeze, erupt, shatter                           */
  /* ------------------------------------------------------------------ */

  _bloom(dt) {
    const c = settings[ID];
    const g = settings.global;
    const t = this._t;
    const R = this.radius;
    const front = this._front(t);
    this.pointAt(1, _centre);
    _centre.y = 0;

    /* layer 2 + 3: the rime and the cold air */
    const rs = this._rimeState;
    rs.center.copy(_centre);
    rs.radius = R;
    rs.front = front;
    rs.growing = 1 - smoothstep(0.85, 1.25, t / this._T(c.growTime));
    rs.twinkle = this._twinkle;
    rs.sublimate = 0;
    this.rimeMaterial.userData.sync(rs);
    const cs = this._coldState;
    cs.center.copy(_centre);
    cs.radius = R;
    cs.front = front;
    cs.fade = 1;
    this.coldMaterial.userData.sync(cs);

    this._freeze(front, t, dt);
    this._mist(dt, front, rs.growing);
    this._spikesUpdate(t, dt, 0);
    this._shellsUpdate(t, 0);
    this._shatterCheck(t);

    // Where the spikes converge: the final crack in the middle.
    if (!this._converged && t >= this._spikeStart() + this._T(c.spikeTime)) {
      this._converged = true;
      this._convergeFx();
    }
    if (!this._eruptStarted && t >= this._spikeStart()) {
      this._eruptStarted = true;
      this.ctx.shake.add(c.spikeShake * g.explosionIntensity * 0.6, 3, 16);
    }

    this.iceMaterial.userData.sync(this._iceState);
    this._iceState.fade = 1;
    this._iceState.glow = 1;

    this.position.copy(_centre).setY(0.7);
  }

  /** Take hold of every standing body the front has reached. */
  _freeze(front, t, dt) {
    const field = this.ctx.dummies;
    const c = settings[ID];
    // Nothing new is frozen once the eruption has begun.
    if (field?.findTargets && t < this._spikeStart()) {
      const found = field.findTargets(_centre.x, _centre.z, Math.min(front, this.radius) * c.encaseReach, this._found);
      for (const dummy of found) {
        if (this._frozenCount >= MAX_FROZEN) break;
        if (this._slotOf(dummy)) continue;
        const slot = this._frozen[this._frozenCount++];
        slot.dummy = dummy;
        slot.x = dummy.position.x;
        slot.z = dummy.position.z;
        slot.frozeAt = t;
        slot.shattered = false;
        slot.shatteredAt = 0;
        for (let k = 0; k < slot.dice.length; k++) slot.dice[k] = Math.random();
        this._freezeFx(slot);
      }
    }

    /* hold them and turn them to ice */
    const look = this._look;
    look.color = c.colorBodyFrozen;
    look.rimColor = c.colorBodyRim;
    look.rimEmissive = c.bodyRimGlow;
    look.edgeColor = c.colorBodyEdge;
    look.edgeEmissive = c.bodyEdgeGlow;
    look.edgeWidth = c.bodyEdgeWidth;
    for (let i = 0; i < this._frozenCount; i++) {
      const slot = this._frozen[i];
      const dummy = slot.dummy;
      if (!dummy) continue;
      const k = saturate((t - slot.frozeAt) / this._T(c.encaseTime));
      dummy.corrode(k * c.frostTint, look);
      if (dummy.alive && !slot.shattered && dummy.action) dummy.action.paused = true;
    }
  }

  _slotOf(dummy) {
    for (let i = 0; i < this._frozenCount; i++) if (this._frozen[i].dummy === dummy) return this._frozen[i];
    return null;
  }

  /** A puff of frost and glints as a body is caught. */
  _freezeFx(slot) {
    const c = settings[ID];
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.set(slot.x, 0.9, slot.z);
    _emit.position = _pos;
    _emit.radius = 0.45;
    _emit.direction = _up;
    _emit.speed = 0.8;
    _emit.spread = 1;
    _emit.size = c.glintSize * 1.2;
    _emit.life = c.glintLife;
    this.glints.emit(Math.round(30 * g.particleCount), _emit);
    _pos.y = 0.3;
    _emit.size = c.mistSize * 0.7;
    _emit.life = c.mistLife * 0.6;
    _emit.speed = 0.5;
    this.mist.emit(Math.round(6 * g.particleCount), _emit);
  }

  /** Mist rolled off the front while it races, then seeping off the frost. */
  _mist(dt, front, growing) {
    const c = settings[ID];
    const g = settings.global;
    const rate = c.frontMist * growing + c.mistRate * (1 - growing * 0.7);
    const n = Math.round(this.mistEmitter.tick(dt, rate) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.size = c.mistSize;
      _emit.life = c.mistLife;
      _emit.spin = 0.4;
      _emit.spread = 0.2;
      _emit.speedVariance = 0.5;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const onFront = Math.random() < growing;
        const r = onFront ? Math.min(front, this.radius) : Math.sqrt(Math.random()) * Math.min(front, this.radius);
        _pos.set(_centre.x + Math.cos(a) * r, 0.2, _centre.z + Math.sin(a) * r);
        // Rolling outward along the floor, barely rising — cold air sinks.
        _dir.set(Math.cos(a), 0.08, Math.sin(a));
        _emit.position = _pos;
        _emit.anchor = _pos;
        _emit.direction = _dir;
        _emit.speed = c.mistSpeed * (onFront ? 1.3 : 0.5);
        this.mist.emit(1, _emit);
      }
    }

    // Glints lifting off the frost.
    const glints = Math.round(this.glintEmitter.tick(dt, c.sublimateGlitter * 0.25) * g.particleCount);
    if (glints > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.size = c.glintSize * 0.8;
      _emit.life = c.glintLife;
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.direction = _up;
      for (let i = 0; i < glints; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * Math.min(front, this.radius);
        _pos.set(_centre.x + Math.cos(a) * r, 0.06, _centre.z + Math.sin(a) * r);
        _emit.position = _pos;
        this.glints.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shells                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve every frozen body's crystals from its dice and the live settings.
   * @param {number} crumble 0..1 extra crack applied to every shell (the fade)
   */
  _shellsUpdate(t, crumble) {
    const c = settings[ID];
    const g = settings.global;
    const per = Math.min(MAX_SHELL, Math.max(1, Math.round(c.shellCrystals)));
    const jitter = saturate(c.shellJitter * g.randomness);
    let n = 0;
    for (let i = 0; i < this._frozenCount; i++) {
      const slot = this._frozen[i];
      if (!slot.dummy) continue;
      const grownFor = t - slot.frozeAt;
      // The shell breaks fast once its body shatters.
      const broken = slot.shattered ? saturate((t - slot.shatteredAt) / 0.18) : 0;
      for (let j = 0; j < per; j++) {
        const o = j * SHELL_DICE;
        const d = slot.dice;
        const bearing = ((j + (d[o] - 0.5) * jitter) / per) * TAU;
        const rad = c.shellRadius * (1 + (d[o + 1] - 0.5) * 0.6 * jitter);
        const delay = d[o + 6] * 0.35;
        const grow = Easing.outCubic(saturate((grownFor / this._T(c.encaseTime) - delay) / Math.max(0.05, 1 - delay)));
        // Taller toward the back of the body and in a couple of spires.
        const tall = lerp(0.45, 1, d[o + 2]) * (j % 4 === 0 ? 1 : lerp(0.6, 0.95, d[o + 2]));
        const h = c.shellHeight * tall;
        const th = c.shellThickness * lerp(0.6, 1.25, d[o + 4]);
        const lean = c.shellTilt * lerp(0.4, 1.1, d[o + 3]);

        const ca = Math.cos(bearing);
        const sa = Math.sin(bearing);
        _pos.set(slot.x + ca * rad, -0.05, slot.z + sa * rad);
        // Lean outward: about the tangent.
        _axis.set(-sa, 0, ca);
        _q.setFromAxisAngle(_axis, -lean);
        _q2.setFromAxisAngle(_up, d[o + 5] * TAU);
        _q.multiply(_q2);
        _scale.set(th * lerp(0.4, 1, grow), Math.max(0.001, h * grow), th * lerp(0.4, 1, grow));
        _m.compose(_pos, _q, _scale);
        this.shells.setMatrixAt(n, _m);

        const k = n * 4;
        this.shellIce[k] = 0.6 * (1 - grow) + 0.3; // fresh ice glows
        this.shellIce[k + 1] = Math.max(broken * (0.6 + 0.6 * d[o + 6]), crumble);
        this.shellIce[k + 2] = d[o + 5] * 10 + i;
        n++;
      }
    }
    this.shells.count = n;
    this.shells.instanceMatrix.needsUpdate = true;
    this.shells.geometry.attributes.aIce.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Spikes                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Lay the spikes out in rings from the live counts, and raise each when the
   * eruption wave reaches its radius.
   * @param {number} fadeT 0..1 through the fade (they crumble and sink)
   */
  _spikesUpdate(t, dt, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const R = this.radius;
    const total = Math.min(MAX_SPIKES, Math.max(0, Math.round(c.spikeCount)));
    const rings = Math.min(MAX_RINGS, Math.max(1, Math.round(c.spikeRings)));
    const inner = saturate(c.spikeInner);

    // Spikes per ring, proportional to circumference.
    let weight = 0;
    for (let k = 0; k < rings; k++) weight += rings === 1 ? 1 : lerp(1, inner, k / (rings - 1));
    let assigned = 0;
    for (let k = 0; k < rings; k++) {
      const f = rings === 1 ? 1 : lerp(1, inner, k / (rings - 1));
      _ringCounts[k] = k === rings - 1 ? total - assigned : Math.round((total * f) / weight);
      assigned += _ringCounts[k];
    }

    const crumbleSpan = Math.max(0.05, c.spikeCrumble);
    const rise = this._T(c.spikeRise);
    const jitter = saturate(g.randomness);
    let i = 0;
    for (let k = 0; k < rings && i < total; k++) {
      const f = rings === 1 ? 1 : lerp(1, inner, k / (rings - 1));
      const count = Math.max(0, _ringCounts[k]);
      for (let j = 0; j < count && i < total; j++, i++) {
        const o = i * SPIKE_DICE;
        const d = this._spikeDice;
        // Alternate rings are offset half a step so they interlock.
        const bearing = ((j + 0.5 * (k & 1) + (d[o] - 0.5) * 0.7 * jitter) / Math.max(1, count)) * TAU + this._seedVal;
        const r = R * f * 0.96 * (1 + (d[o + 1] - 0.5) * 0.12 * jitter);
        const startAt = this._waveAt(r);
        const up = saturate((t - startAt) / rise);
        if (up > 0 && !this._spikeBurst[i]) {
          this._spikeBurst[i] = 1;
          this._spikeFx(r, bearing);
        }
        const height = c.spikeHeight * (1 + (d[o + 2] - 0.5) * 2 * c.spikeHeightJitter * jitter) * (rings > 1 ? lerp(1, 1.35, k / (rings - 1)) : 1);
        const crumble = fadeT > 0 ? saturate((fadeT - d[o + 5] * (1 - crumbleSpan)) / crumbleSpan) : 0;
        const sink = Easing.inCubic(crumble);
        const grow = up > 0 ? Easing.outBack(up) : 0;

        const ca = Math.cos(bearing);
        const sa = Math.sin(bearing);
        _pos.set(_centre.x + ca * r, -0.1 - sink * height * 0.5, _centre.z + sa * r);
        // Leaning in toward the middle: about the tangent.
        _axis.set(-sa, 0, ca);
        _q.setFromAxisAngle(_axis, c.spikeLean * lerp(0.6, 1.2, d[o + 3]));
        _q2.setFromAxisAngle(_up, d[o + 4] * TAU);
        _q.multiply(_q2);
        const th = c.spikeRadius * lerp(0.7, 1.3, d[o + 6]);
        _scale.set(th * lerp(0.5, 1, Math.min(1, grow)), Math.max(0.001, height * grow), th * lerp(0.5, 1, Math.min(1, grow)));
        _m.compose(_pos, _q, _scale);
        this.spikes.setMatrixAt(i, _m);

        const a = i * 4;
        this.spikeIce[a] = 1.2 * Math.exp(-Math.max(0, t - startAt) * 4); // glows white-hot as it bursts
        this.spikeIce[a + 1] = crumble;
        this.spikeIce[a + 2] = d[o + 4] * 10;
      }
    }
    this.spikes.count = i;
    this.spikes.instanceMatrix.needsUpdate = true;
    this.spikes.geometry.attributes.aIce.needsUpdate = true;
  }

  /** Chips and a burst of mist as one spike breaks the frost. */
  _spikeFx(r, bearing) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(c.spikeChips * g.particleCount);
    this._resetEmit(frame.uTime.value);
    _pos.set(_centre.x + Math.cos(bearing) * r, 0.1, _centre.z + Math.sin(bearing) * r);
    _dir.set(-Math.cos(bearing) * 0.4, 1, -Math.sin(bearing) * 0.4);
    _emit.position = _pos;
    _emit.radius = 0.12;
    _emit.direction = _dir;
    _emit.speed = c.chipSpeed * 0.55;
    _emit.spread = 0.6;
    _emit.size = c.chipSize * 0.7;
    _emit.life = c.chipLife * 0.7;
    _emit.spin = 8;
    if (n > 0) this.chips.emit(n, _emit);
    _emit.speed = 0.6;
    _emit.size = c.mistSize * 0.6;
    _emit.life = c.mistLife * 0.5;
    _emit.spin = 0.4;
    this.mist.emit(1, _emit);
    this.ctx.shake.add(c.spikeShake * 0.04 * g.explosionIntensity, 6, 20);
  }

  /** The spikes meet in the middle. */
  _convergeFx() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    _pos.copy(_centre).setY(0.4);
    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * 1.4 * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.75,
      fresnel: 2.4,
      displace: 0.35,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.shake.add(c.spikeShake * power, 4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.shatterFlash * 0.6 * power);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.shatterLight * power);
  }

  /* ------------------------------------------------------------------ */
  /* The shatter                                                         */
  /* ------------------------------------------------------------------ */

  /** Break every frozen body the eruption has reached. */
  _shatterCheck(t) {
    const c = settings[ID];
    for (let i = 0; i < this._frozenCount; i++) {
      const slot = this._frozen[i];
      if (!slot.dummy || slot.shattered) continue;
      const r = Math.hypot(slot.x - _centre.x, slot.z - _centre.z);
      if (t >= this._waveAt(r) + this._T(Math.max(0, c.shatterDelay))) this._shatter(slot, t);
    }
  }

  _shatter(slot, t) {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    slot.shattered = true;
    slot.shatteredAt = t;
    const dummy = slot.dummy;
    if (dummy.action) dummy.action.paused = false;

    // Outward, away from the middle.
    _dir.set(slot.x - _centre.x, 0, slot.z - _centre.z);
    if (_dir.lengthSq() < 1e-6) {
      const a = Math.random() * TAU;
      _dir.set(Math.cos(a), 0, Math.sin(a));
    } else _dir.normalize();
    this._force.impulse = c.shatterImpulse * power;
    this._force.lift = c.shatterLift * power;
    this._force.spin = c.shatterSpin;
    if (dummy.alive) dummy.kill(_dir.x, _dir.z, this._force);

    /* the ice comes apart */
    this._resetEmit(frame.uTime.value);
    _pos.set(slot.x, 1.0, slot.z);
    _emit.position = _pos;
    _emit.radius = 0.5;
    _emit.direction = _dir.setY(0.9).normalize();
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.0;
    _emit.size = c.chipSize;
    _emit.sizeVariance = 0.7;
    _emit.life = c.chipLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 10;
    this.chips.emit(Math.round(c.chipCount * g.particleCount), _emit);
    _emit.spin = 0;
    _emit.speed = c.chipSpeed * 0.6;
    _emit.size = c.glintSize * 1.5;
    _emit.life = c.glintLife;
    this.glints.emit(Math.round(c.chipCount * 0.6 * g.particleCount), _emit);
    _emit.direction = _up;
    _emit.speed = 0.9;
    _emit.size = c.mistSize * 0.9;
    _emit.life = c.mistLife * 0.6;
    _emit.spin = 0.4;
    this.mist.emit(Math.round(8 * g.particleCount), _emit);

    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.7,
      fresnel: 2.6,
      displace: 0.4,
      squash: 1,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.shake.add(c.shatterShake * power, 6, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.shatterFlash * power);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.shatterLight * power);
  }

  /* ------------------------------------------------------------------ */
  /* The fade — sublimation                                              */
  /* ------------------------------------------------------------------ */

  _sublimate(dt, ft) {
    const c = settings[ID];
    const g = settings.global;
    this._twinkle += c.sparkleSpeed * dt * g.noiseSpeed;
    this.pointAt(1, _centre);
    _centre.y = 0;

    // Anything still frozen is broken now — nothing is left holding its breath.
    for (let i = 0; i < this._frozenCount; i++) {
      const slot = this._frozen[i];
      if (slot.dummy && !slot.shattered) this._shatter(slot, this._t);
    }

    const rs = this._rimeState;
    rs.center.copy(_centre);
    rs.radius = this.radius;
    rs.front = this.radius;
    rs.growing = 0;
    rs.twinkle = this._twinkle;
    rs.sublimate = Easing.inOutQuad(ft);
    this.rimeMaterial.userData.sync(rs);
    const cs = this._coldState;
    cs.center.copy(_centre);
    cs.front = this.radius;
    cs.radius = this.radius;
    cs.fade = 1 - ft;
    this.coldMaterial.userData.sync(cs);
    this.cold.visible = ft < 1;

    this._t += dt;
    this._spikesUpdate(this._t, dt, ft);
    this._shellsUpdate(this._t, saturate(ft * 2));
    this._iceState.fade = 1 - smoothstep(0.7, 1, ft);
    this._iceState.glow = 1;
    this.iceMaterial.userData.sync(this._iceState);

    /* glints released where the rime is going */
    const n = Math.round(this.glintEmitter.tick(dt, c.sublimateGlitter * (1 - ft)) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.size = c.glintSize;
      _emit.life = c.glintLife;
      _emit.speed = 0.5;
      _emit.spread = 1;
      _emit.direction = _up;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * this.radius;
        _pos.set(_centre.x + Math.cos(a) * r, 0.08, _centre.z + Math.sin(a) * r);
        _emit.position = _pos;
        this.glints.emit(1, _emit);
      }
    }
    const puffs = Math.round(this.mistEmitter.tick(dt, c.mistRate * 0.5 * (1 - ft)) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.size = c.mistSize;
      _emit.life = c.mistLife * 0.8;
      _emit.speed = 0.5;
      _emit.spread = 0.4;
      _emit.direction = _up;
      _emit.spin = 0.4;
      for (let i = 0; i < puffs; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * this.radius;
        _pos.set(_centre.x + Math.cos(a) * r, 0.2, _centre.z + Math.sin(a) * r);
        _emit.position = _pos;
        _emit.anchor = _pos;
        this.mist.emit(1, _emit);
      }
    }

    this.position.copy(_centre).setY(0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.seed.visible = false;
    this.rime.visible = false;
    this.cold.visible = false;
    this.shells.visible = false;
    this.spikes.visible = false;
    this.shells.count = 0;
    this.spikes.count = 0;
    this._releaseAll();
  }

  dispose() {
    this.quadGeometry.dispose();
    this.crystalGeometry.dispose();
    this.seedGeometry.dispose();
    this.shells.geometry.dispose();
    this.spikes.geometry.dispose();
    this.shells.dispose();
    this.spikes.dispose();
    this.rimeMaterial.dispose();
    this.coldMaterial.dispose();
    this.seedMaterial.dispose();
    this.iceMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('❄  Permafrost Bloom');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 90, 0.5, 'seed speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'sublimates over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');

  const seed = folder.addFolder('1 · Frost seed');
  R(seed, c, 'handForward', -1, 2, 0.01, 'leaves from, forward (m)');
  R(seed, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(seed, c, 'seedArc', 0, 8, 0.05, 'arc height (m)');
  R(seed, c, 'seedSize', 0.03, 1, 0.005, 'size (m)');
  R(seed, c, 'seedSpin', 0, 40, 0.1, 'tumble (rad/s)');
  R(seed, c, 'seedGlow', 0, 10, 0.05, 'glow');
  R(seed, c, 'seedTrail', 0, 600, 1, 'trail glints/second');
  R(seed, c, 'landBurst', 0, 6, 0.05, 'landing shell (m)');
  R(seed, c, 'landFlash', 0, 1, 0.01, 'landing flash');
  R(seed, c, 'landShake', 0, 1.5, 0.01, 'landing knock');
  seed.addColor(c, 'colorSeed').name('seed');

  const rime = folder.addFolder('2 · Rime');
  R(rime, c, 'growTime', 0.05, 4, 0.01, 'races out over (s)');
  R(rime, c, 'growCurve', 0.1, 3, 0.01, 'race curve');
  R(rime, c, 'armCount', 1, 24, 1, 'fern arms');
  R(rime, c, 'armLead', 0, 1, 0.01, 'arms lead (× radius)');
  R(rime, c, 'armWidth', 0.005, 0.3, 0.001, 'arm width (m)');
  R(rime, c, 'armWobble', 0, 2, 0.01, 'arm wander');
  R(rime, c, 'fernScale', 0.2, 6, 0.01, 'dendrites per m');
  R(rime, c, 'fernBranch', 0.05, 1, 0.01, 'branch spacing');
  R(rime, c, 'fernWidth', 0.005, 0.2, 0.001, 'dendrite width');
  R(rime, c, 'frostDensity', 0, 1.5, 0.01, 'frosting');
  R(rime, c, 'edgeFeather', 0.01, 2, 0.01, 'front softness (m)');
  R(rime, c, 'rimeGlow', 0, 6, 0.01, 'fern brightness');
  R(rime, c, 'frontGlow', 0, 10, 0.05, 'front glow');
  R(rime, c, 'frontWidth', 0.02, 2, 0.01, 'front width (m)');
  R(rime, c, 'sparkle', 0, 10, 0.05, 'sparkle');
  R(rime, c, 'sparkleScale', 2, 80, 0.5, 'glints per m');
  R(rime, c, 'sparkleSpeed', 0, 12, 0.05, 'twinkle speed');
  R(rime, c, 'rimeOpacity', 0, 1, 0.01, 'opacity');
  rime.addColor(c, 'colorRimeA').name('fern white');
  rime.addColor(c, 'colorRimeB').name('frost blue');
  rime.addColor(c, 'colorRimeDeep').name('deep ice');
  rime.addColor(c, 'colorFront').name('front');
  rime.addColor(c, 'colorSparkle').name('glints');

  const mist = folder.addFolder('3 · Cold mist');
  R(mist, c, 'frontMist', 0, 600, 1, 'off the front/second');
  R(mist, c, 'mistRate', 0, 400, 1, 'off the frost/second');
  R(mist, c, 'mistSize', 0.05, 4, 0.01, 'size');
  R(mist, c, 'mistSpeed', 0, 5, 0.01, 'roll outward (m/s)');
  R(mist, c, 'mistLife', 0.1, 8, 0.05, 'lifetime');
  R(mist, c, 'mistOpacity', 0, 1, 0.01, 'opacity');
  R(mist, c, 'hazeStrength', 0, 3, 0.01, 'cold-air shimmer');
  R(mist, c, 'hazeScale', 0.1, 8, 0.01, 'shimmer scale');
  R(mist, c, 'hazeSpeed', 0, 6, 0.01, 'shimmer speed');
  Editor.gradient(mist, c, 'colorMist', 'mist gradient');

  const encase = folder.addFolder('4 · Encasing');
  R(encase, c, 'encaseTime', 0.02, 3, 0.01, 'shell grows over (s)');
  R(encase, c, 'encaseReach', 0.1, 1.5, 0.01, 'freeze reach (× radius)');
  R(encase, c, 'shellCrystals', 1, MAX_SHELL, 1, 'crystals per shell');
  R(encase, c, 'shellHeight', 0.2, 4, 0.01, 'height (m)');
  R(encase, c, 'shellRadius', 0, 1.5, 0.01, 'radius (m)');
  R(encase, c, 'shellThickness', 0.02, 0.8, 0.005, 'crystal radius (m)');
  R(encase, c, 'shellJitter', 0, 1, 0.01, 'irregularity');
  R(encase, c, 'shellTilt', 0, 1.2, 0.01, 'lean out (rad)');
  R(encase, c, 'frostTint', 0, 1, 0.01, 'body to ice');
  R(encase, c, 'bodyRimGlow', 0, 10, 0.05, 'body rim glow');
  R(encase, c, 'bodyEdgeGlow', 0, 10, 0.05, 'body edge glow');
  R(encase, c, 'bodyEdgeWidth', 0, 0.3, 0.001, 'body edge width');
  encase.addColor(c, 'colorBodyFrozen').name('frozen body');
  encase.addColor(c, 'colorBodyRim').name('frozen rim');
  encase.addColor(c, 'colorBodyEdge').name('frozen edge');

  const ice = folder.addFolder('5 · Ice');
  R(ice, c, 'iceGlow', 0, 6, 0.01, 'inner glow');
  R(ice, c, 'iceFresnel', 0, 8, 0.01, 'rim');
  R(ice, c, 'iceEnv', 0, 4, 0.01, 'reflection');
  R(ice, c, 'iceOpacity', 0, 1, 0.01, 'opacity');
  R(ice, c, 'iceCracks', 0, 3, 0.01, 'fractures');
  R(ice, c, 'iceCrackScale', 0.2, 20, 0.05, 'fracture scale');
  R(ice, c, 'iceSoftFade', 0.01, 1, 0.01, 'soft intersection (m)');
  ice.addColor(c, 'colorIceA').name('faces');
  ice.addColor(c, 'colorIceB').name('body');
  ice.addColor(c, 'colorIceDeep').name('deep');

  const spikes = folder.addFolder('6 · Spikes');
  R(spikes, c, 'holdTime', 0, 3, 0.01, 'circle holds (s)');
  R(spikes, c, 'spikeTime', 0.05, 3, 0.01, 'sweeps inward over (s)');
  R(spikes, c, 'spikeRise', 0.02, 1, 0.005, 'one spike rises over (s)');
  R(spikes, c, 'spikeCount', 0, MAX_SPIKES, 1, 'spikes');
  R(spikes, c, 'spikeRings', 1, MAX_RINGS, 1, 'rings');
  R(spikes, c, 'spikeInner', 0, 1, 0.01, 'innermost ring (× radius)');
  R(spikes, c, 'spikeHeight', 0.1, 5, 0.01, 'height (m)');
  R(spikes, c, 'spikeHeightJitter', 0, 1, 0.01, 'height jitter');
  R(spikes, c, 'spikeRadius', 0.02, 0.8, 0.005, 'base radius (m)');
  R(spikes, c, 'spikeLean', -1, 1.4, 0.01, 'lean in (rad)');
  R(spikes, c, 'spikeChips', 0, 40, 1, 'chips per spike');
  R(spikes, c, 'spikeShake', 0, 1.5, 0.01, 'eruption knock');
  R(spikes, c, 'linger', 0, 4, 0.01, 'stand for (s)');
  R(spikes, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  spikes.addColor(c, 'colorShockA').name('shockwave');
  spikes.addColor(c, 'colorShockB').name('shockwave hot');

  const shatter = folder.addFolder('7 · Shatter');
  R(shatter, c, 'shatterDelay', 0, 1, 0.005, 'after the wave (s)');
  R(shatter, c, 'shatterImpulse', 0, 30, 0.1, 'thrown out (m/s)');
  R(shatter, c, 'shatterLift', 0, 15, 0.05, 'lift (m/s)');
  R(shatter, c, 'shatterSpin', 0, 8, 0.01, 'tumble');
  R(shatter, c, 'chipCount', 0, 300, 1, 'ice chips');
  R(shatter, c, 'chipSpeed', 0, 25, 0.1, 'chip speed');
  R(shatter, c, 'chipSize', 0.01, 0.5, 0.005, 'chip size');
  R(shatter, c, 'chipLife', 0.1, 5, 0.05, 'chip lifetime');
  R(shatter, c, 'chipGravity', 0, 40, 0.1, 'chip gravity');
  R(shatter, c, 'burstSize', 0, 8, 0.05, 'frost shell (m)');
  R(shatter, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(shatter, c, 'shatterFlash', 0, 1, 0.01, 'flash');
  R(shatter, c, 'shatterShake', 0, 1.5, 0.01, 'camera knock');
  R(shatter, c, 'shatterLight', 0, 8, 0.01, 'light punch (× intensity)');
  Editor.gradient(shatter, c, 'colorChip', 'chip gradient');
  shatter.addColor(c, 'colorBurstA').name('shell inner');
  shatter.addColor(c, 'colorBurstB').name('shell mid');
  shatter.addColor(c, 'colorBurstC').name('shell outer');
  shatter.addColor(c, 'colorFlash').name('flash');

  const sub = folder.addFolder('8 · Sublimation');
  R(sub, c, 'sublimateEdge', 0.005, 0.4, 0.005, 'glitter edge');
  R(sub, c, 'sublimateGlitter', 0, 800, 1, 'glints/second');
  R(sub, c, 'spikeCrumble', 0.05, 1, 0.01, 'spikes crumble over (share)');
  R(sub, c, 'glintSize', 0.005, 0.3, 0.001, 'glint size');
  R(sub, c, 'glintLife', 0.1, 4, 0.05, 'glint lifetime');
  R(sub, c, 'glintGlow', 0, 10, 0.05, 'glint glow');

  folder.close();
  return folder;
}
