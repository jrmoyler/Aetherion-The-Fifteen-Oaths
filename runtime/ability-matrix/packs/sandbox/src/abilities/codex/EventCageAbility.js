import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3
} from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createEventCagePieceGeometry, createEventCageHeroGeometry } from '../../assets/codex/EventCageGeometry.js';
import {
  createEventCageBodyMaterial,
  createEventCageLensMaterial,
  createEventCageGroundMaterial,
  createEventCageVoiceMaterial,
  createEventCageDetailMaterial,
  createEventCageBarMaterial,
  createEventCageSeedMaterial,
  createEventCagePitMaterial
} from '../../materials/codex/EventCageMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'eventcage';

const TWIST = 'seal';
const ARCH = 'cage';
const HIT = 'in';
const CARRY = 'in';
const WHEN = 'commit';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = true;
const COUNTER = false;
const ZONE = true;
const LIFT = 1;
const SLICE = false;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _focus = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;
/** Bars the cage can stand (the geometry is instanced once). */
const MAX_BARS = 16;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _q = new Quaternion();
const _qy = new Quaternion();
const _scale = new Vector3();
const _axis = new Vector3();
const _radial = new Vector3();
const _tops = Array.from({ length: MAX_BARS }, () => new Vector3());
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _hand = new Vector3();
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);

/** A stable 0..1 die per bar from the cast's seed. */
function dice(i, seed) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * One event bar, one unit tall, built along +Y: a chamfered-square prism with
 * a driven spike for a foot, a collar near each end and a pyramid cap. Flat
 * facets, so the sun picks out every face of the glass.
 */
function createCageBarGeometry() {
  const ring = [];
  const half = 0.5;
  const ch = 0.17;
  const outline = [
    [half, -half + ch], [half, half - ch], [half - ch, half], [-half + ch, half],
    [-half, half - ch], [-half, -half + ch], [-half + ch, -half], [half - ch, -half]
  ];
  // [height, cross-section scale]
  const stations = [
    [0.0, 0.08], [0.07, 0.7], [0.1, 1.06], [0.13, 1.06], [0.15, 0.9],
    [0.82, 0.82], [0.85, 1.08], [0.89, 1.08], [0.91, 0.8], [1.0, 0.1]
  ];
  for (const [y, k] of stations) ring.push(outline.map(([x, z]) => [x * k, y, z * k]));
  const pos = [];
  const n = outline.length;
  for (let r = 0; r < ring.length - 1; r++) {
    const a = ring[r];
    const b = ring[r + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pos.push(...a[i], ...b[j], ...a[j], ...a[i], ...b[i], ...b[j]);
    }
  }
  const top = ring[ring.length - 1];
  const bottom = ring[0];
  for (let i = 1; i < n - 1; i++) {
    pos.push(...top[0], ...top[i + 1], ...top[i]);
    pos.push(...bottom[0], ...bottom[i], ...bottom[i + 1]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The lintel: the same chamfered section, one unit long along +X, centred. */
function createCageBeamGeometry() {
  const g = createCageBarGeometry();
  g.translate(0, -0.5, 0);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/**
 * EVENT CAGE — void, zone cast.
 *
 * Void — event bars drop and erase inward toward a missing centre.
 *
 * Bars erase toward a missing centre. The centre itself is never a body — the hit is the closing.
 *
 * The read is `seal`: hit timing `commit`, blow `in`, carry `in`. The body starts to dissolve while it is still travelling.
 *
 * ## Layers
 *
 *   1. **body** — the seal placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled void field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a chord riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createEventCagePieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createEventCageHeroGeometry`), stood by its archetype (cage): dropped from above, then closed inward.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: bars erase toward a missing centre. The centre itself is never a body — the hit is the closing.
 *  10. **mark** — a felled body is hollowed out: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The cage (the hero, cast-local — section 14 of the editor)
 *
 * The shared template layers (body, voice, rig, pieces) are turned down in
 * the config; the spell is carried by its own forms:
 *
 *   - **the event** — a black urchin of void with a violet horizon is lobbed
 *     from the hand on an arc (`seed*`) and lands on the centre on the beat.
 *   - **the bars** — `cageBars` tall bars of lit void-glass (chamfered
 *     prisms with a driven foot, collars and a cap; `createCageBarGeometry`)
 *     fall out of the sky as the event flies, their shadows sweeping in, and
 *     slam into a ring at `cageFit` × the circle on the beat. A lintel of the
 *     same glass (`cageLintel`) joins their tops, so it reads as one cage.
 *   - **the closing** — through the linger the cage closes on the centre in
 *     `cageSteps` discrete events: each one snaps every bar inward (overshoot,
 *     dust, a thud, a tick of light up the bars' notch columns), leaning the
 *     tops in.
 *   - **the missing centre** — a filled hole opens on the floor (`pit*`):
 *     black, draining in a spiral, with a hot horizon lip and a dark violet
 *     skirt dragged toward it; motes stream inward across the floor.
 *   - **the erase** — from `cageEraseStart` the bars are erased top-down,
 *     one after another round the ring, behind a white-hot cut, sinking as
 *     they go; the lintel goes first. The hole closes last, leaving the stain.
 *
 * All of it is presentation: hits still land once, on the beat, inside the
 * circle (`_strike`), exactly as before.
 *
 * Every metre, rate and colour is read from `settings.eventcage` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class EventCageAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._hits;
  }

  createShaders() {
    this.bodyGeometry = createSpellBodyGeometry(ID);
    this.voiceGeometry = new PlaneGeometry(1, 1, 64, 8);
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.bodyMaterial = createEventCageBodyMaterial();
    this.lensMaterial = createEventCageLensMaterial();
    this.groundMaterial = createEventCageGroundMaterial();
    this.voiceMaterial = createEventCageVoiceMaterial();
    this.detailMaterial = createEventCageDetailMaterial();
    this.heroMaterial = createEventCageDetailMaterial(true);
    this.detail = new DetailLayer(createEventCagePieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createEventCageHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._buildCage();
    this._state = {
      center: new Vector3(),
      origin: new Vector3(),
      dir: new Vector3(0, 0, 1),
      side: new Vector3(1, 0, 0),
      radius: 1,
      length: 1,
      height: 1,
      thickness: 0.3,
      count: 6,
      spin: 0,
      voiceSpin: 0,
      open: 1,
      beat: 0,
      grow: 1,
      along: 0,
      seed: 0,
      fade: 1,
      dissolve: 0,
      phrase: 0,
      foot: 1,
      footWidth: 1,
      groundCenter: new Vector3(),
      land: 0,
      pre: 0,
      heat: 0,
      erode: 0,
      pulse: 1
    };
    this._seed = 0;
    this._settled = false;
    this._spin = 0;
    this._hits = 0;
    this._echoed = false;
    this._struck = [];
    this._carried = [];
    this._parts = Array.from({ length: 12 }, () => ({ armed: true }));
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._flow = { vx: 0, vy: 0, vz: 0 };
    this._field = (x, y, z, out) => out.set(this._flow.vx, this._flow.vy, this._flow.vz);
    this._found = [];
    this._marks = Array.from({ length: MAX_MARKS }, () => ({ dummy: null, time: 0, emitter: new RateEmitter() }));
    this._markCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0 };
  }

  /** The cage's own meshes: instanced bars and lintel, the thrown event, the hole. */
  _buildCage() {
    this.barGeometry = createCageBarGeometry();
    this.beamGeometry = createCageBeamGeometry();
    this.barMaterial = createEventCageBarMaterial();
    const make = (geometry) => {
      const mesh = new InstancedMesh(geometry, this.barMaterial, MAX_BARS);
      const attr = new InstancedBufferAttribute(new Float32Array(MAX_BARS * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aBar', attr);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.layers.set(LAYER.SHAPED);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    this.bars = make(this.barGeometry);
    this.beams = make(this.beamGeometry);
    this.seedGeometry = new SphereGeometry(1, 40, 28);
    this.seedMaterial = createEventCageSeedMaterial();
    this.seed = this._mesh(this.seedGeometry, this.seedMaterial, LAYER.VFX, 15);
    this.pitGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.pitMaterial = createEventCagePitMaterial();
    this.pit = this._mesh(this.pitGeometry, this.pitMaterial, LAYER.VFX, 3);
    this.pit.rotation.x = -Math.PI / 2;
    this._cageSpin = 0;
    this._cageStep = 0;
    this._stepReached = 0;
    this._cageClose = 0;
    this._pitR = 0;
    this._cageRadius = 1;
    this._seedEmitter = new RateEmitter();
    this._pullEmitter = new RateEmitter();
    this._eraseEmitter = new RateEmitter();
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
    this.dust = particles.get('eventcage.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('eventcage.streak', {
      capacity: 1200,
      shape: ParticleShape.RING,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('eventcage.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('eventcage.mote', {
      capacity: 600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.dustEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
    this.chipEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  get impactDuration() {
    return Math.max(0.05, settings[ID].impactTime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].fadeTime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f + f * Math.sin(this.age * 6.00);
  }

  onSpawn() {
    this._seed = Math.random() * 10;
    this._spin = Math.random() * Math.PI * 2;
    this._hits = 0;
    this._echoed = false;
    this._settled = false;
    this._struck.length = 0;
    this._carried.length = 0;
    for (let i = 0; i < this._parts.length; i++) this._parts[i].armed = true;
    this.dustEmitter.reset();
    this.streakEmitter.reset();
    this.chipEmitter.reset();
    this.moteEmitter.reset();
    this.detail.reseed(this._seed);
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._cageSpin = Math.random() * TAU;
    this._cageStep = 0;
    this._stepReached = 0;
    this._cageClose = 0;
    this._pitR = 0;
    this._seedEmitter.reset();
    this._pullEmitter.reset();
    this._eraseEmitter.reset();
    this._hideCage();
    this._releaseMarks();
    this._palette();
    this._hand();
    if (ZONE) this._telegraph();
  }

  /** The cast leaves the fist: a small flare, a spray of sparks along the aim, motes left hanging. */
  _hand() {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _pos.y = c.handHeight;
    if (c.handFlare > 0.01) {
      this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
        radius: 0.05,
        endRadius: c.handFlare,
        life: 0.22,
        intensity: 0.6,
        opacity: 0.4 * g.opacity,
        squash: 1,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    const sparks = Math.round(c.handSparks * g.particleCount);
    if (sparks > 0) {
      this._fillEmit(_pos, 0.08, this.direction, c.streakSpeed * 1.2, 0.5, 0.06, c.streakLife * 0.8, 2);
      this.streaks.emit(sparks, _emit);
    }
    const motes = Math.round(c.handMotes * g.particleCount);
    if (motes > 0) {
      this._fillEmit(_pos, 0.15, _up, c.moteSpeed * 0.5, 0.9, 0.08, c.moteLife, 1);
      this.motes.emit(motes, _emit);
    }
  }

  _focusPoint(out) {
    if (ZONE) return this.pointAt(1, out);
    return this.pointAt(this.u, out);
  }

  _aim(out) {
    this._focusPoint(out);
    if (OFFSET) out.addScaledVector(this.side, settings[ID].thickness * 4);
    return out;
  }

  _pose(committed, fadeT) {
    const u = this.u;
    const rise = committed ? 1 : Easing.outCubic(saturate(u));
    const beat = committed ? Easing.outCubic(saturate(fadeT < 1 ? fadeT : 1)) : 0;
    let grow;
    let open;
    let along;
    along = 1; grow = rise; open = beat;
    let dissolve = 0;
    if (committed && fadeT >= 1) dissolve = saturate((fadeT - 1) * 1.15);
    else if (DISSOLVE_TRAVEL && !committed) dissolve = saturate(u * 0.55);
    const fade = committed && fadeT >= 1 ? 1 - (fadeT - 1) : 1;
    const phrase = committed ? (fadeT < 1 ? 1 : 2) : 0;
    this._groundPose(committed, fadeT);
    this._write(open, grow, along, dissolve, fade, phrase);
    this._cage(committed, fadeT);
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** How far the cage has closed (0..1), in `cageSteps` snapped events. Also returns the step index reached. */
  _closing(since) {
    const c = settings[ID];
    const L = settings.global.lifetime;
    if (since < 0) return 0;
    const total = this.impactDuration + this.fadeDuration;
    const start = c.cageCloseStart * L;
    const end = Math.max(start + 0.1, total * c.cageCloseEnd);
    const steps = Math.max(1, Math.round(c.cageSteps));
    const per = (end - start) / steps;
    const x = saturate((since - start) / (end - start)) * steps;
    const k = Math.min(steps, Math.floor(x));
    this._stepReached = since >= start ? Math.min(steps, k + 1) : 0;
    if (k >= steps) return 1;
    const f = saturate(((x - k) * per) / Math.max(0.02, c.cageStepSnap * L));
    return (k + (since >= start ? Easing.outBack(f) : 0)) / steps;
  }

  /**
   * Stand the cage for this frame: every dimension from settings, every
   * moment from the travel (`u`) or the seconds since the beat.
   */
  _cage(committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    this.pointAt(1, _end);
    const n = Math.max(3, Math.min(MAX_BARS, Math.round(c.cageBars)));
    const R = Math.max(0.3, c.zoneRadius * c.cageFit);
    const H = Math.max(0.2, c.cageHeight);
    const W = Math.max(0.02, c.cageWidth);
    const close = this._closing(since);
    this._cageClose = close;
    this._cageRadius = R;

    // The missing centre opens after the beat and closes over the last stretch.
    const exitAt = total - Math.max(0.05, c.pitClose * L);
    const open = since < 0 ? 0 : Easing.outCubic(saturate(since / Math.max(0.05, c.pitGrow * L)));
    const shut = since < exitAt ? 0 : Easing.inQuad(saturate((since - exitAt) / Math.max(0.05, c.pitClose * L)));
    this._pitR = R * c.pitFit * (0.35 + 0.65 * close) * open * (1 - shut);
    if (this._pitR > 0.02 && c.pitOpacity > 0.01) {
      const outer = this._pitR * (1 + c.pitSkirt) + c.pitLip;
      this.pit.visible = true;
      this.pit.position.set(_end.x, 0.035, _end.z);
      this.pit.scale.set(outer * 2, outer * 2, 1);
      this.pitMaterial.userData.sync(outer, this._pitR, 1 - shut * 0.5, this._seed);
    } else this.pit.visible = false;

    // The event in flight, on an arc from the hand to the centre.
    if (!committed && c.seedSize > 0.01) {
      _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
      _hand.y = c.handHeight;
      const t = saturate(this.u);
      this.seed.visible = true;
      this.seed.position.lerpVectors(_hand, _end, t);
      this.seed.position.y = _hand.y * (1 - t) + 0.45 * t + c.seedArc * 4 * t * (1 - t);
      const s = c.seedSize * (0.6 + 0.4 * Easing.outCubic(saturate(this.age / 0.12)));
      this.seed.scale.setScalar(s);
      this.seedMaterial.userData.sync(this._seed);
    } else this.seed.visible = false;

    // The bars.
    const attr = this.barGeometry.getAttribute('aBar');
    const beamAttr = this.beamGeometry.getAttribute('aBar');
    let any = false;
    const heat = since < 0 ? 0 : Math.exp(-since * 2.5 / L);
    const tilt = c.cageLean * (0.25 + 0.75 * close);
    for (let i = 0; i < n; i++) {
      const d = dice(i, this._seed);
      const land = 1 - c.cageStagger * d;
      const span = Math.max(0.05, c.cageDropSpan);
      const p = committed ? 1 : saturate((this.u - (land - span)) / span);
      const order = (i / n + 0.15 * d) % 1;
      const e = since < 0 ? 0 : saturate((since - (c.cageEraseStart + c.cageEraseStagger * order) * L) / Math.max(0.05, c.cageEraseTime * L));
      attr.setXYZW(i, d * 10, e, heat, since < 0 ? -1 : 0.12 + 0.88 * close);
      if (p <= 0 || e >= 0.999) {
        this.bars.setMatrixAt(i, _zero);
        _tops[i].copy(_end);
        continue;
      }
      any = true;
      const ang = this._cageSpin + (TAU * i) / n + (d - 0.5) * 0.1;
      const rad = R * (1 - c.cageClose * close * (0.85 + 0.3 * d));
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      const fall = c.cageDropHeight * (1 - p * p);
      const dip = since < 0 ? 0 : c.cageBounce * Math.sin(Math.min(1, since / 0.14) * Math.PI) * Math.exp(-since * 4);
      const sink = e * c.cageSink * H;
      _pos.copy(_end).addScaledVector(_radial, rad);
      _pos.y = fall - dip - sink;
      _axis.set(-_radial.z, 0, _radial.x);
      _q.setFromAxisAngle(_axis, tilt + (1 - p) * 0.25 * (d - 0.5));
      _qy.setFromAxisAngle(_up, -ang);
      _q.multiply(_qy);
      _scale.set(W, H, W);
      _m4.compose(_pos, _q, _scale);
      this.bars.setMatrixAt(i, _m4);
      _tops[i].copy(_up).applyQuaternion(_q).multiplyScalar(H * 0.87).add(_pos);
    }
    this.bars.count = n;
    this.bars.visible = any;
    this.bars.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;

    // The lintel, joining neighbouring tops; it is erased first.
    const T = c.cageLintel;
    let beams = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ei = attr.getY(i);
      const ej = attr.getY(j);
      const e = saturate(Math.max(ei, ej) * 6);
      beamAttr.setXYZW(i, dice(i + 31, this._seed) * 10, e, heat * 0.5, -1);
      _bx.subVectors(_tops[j], _tops[i]);
      const len = _bx.length();
      if (T < 0.01 || len < 0.05 || e >= 0.999 || _tops[i].equals(_end) || _tops[j].equals(_end)) {
        this.beams.setMatrixAt(i, _zero);
        continue;
      }
      beams = true;
      _bx.divideScalar(len);
      _bz.crossVectors(_bx, _up).normalize();
      _by.crossVectors(_bz, _bx);
      _m4.makeBasis(_bx, _by, _bz);
      _m4.scale(_scale.set(len + T * 0.6, T, T));
      _m4.setPosition(_pos.addVectors(_tops[i], _tops[j]).multiplyScalar(0.5));
      this.beams.setMatrixAt(i, _m4);
    }
    this.beams.count = n;
    this.beams.visible = beams;
    this.beams.instanceMatrix.needsUpdate = true;
    beamAttr.needsUpdate = true;
    this.barMaterial.userData.sync();
  }

  _hideCage() {
    this.bars.visible = false;
    this.beams.visible = false;
    this.seed.visible = false;
    this.pit.visible = false;
  }

  /** Each closing event lands as its own small hit: a thud, a light tick, dust kicked inward off every foot. */
  _cageEvent() {
    const c = settings[ID];
    const g = settings.global;
    this.ctx.shake.add(c.cageStepShake * g.cameraShake * g.explosionIntensity, 4, 16);
    this.lightBoost += c.cageStepLight * g.explosionIntensity;
    this._cageFeet(c.cageStepDust, 0, -1);
  }

  /** Dust and chips off every bar's foot; `out` 1 throws them out, −1 drags them in. */
  _cageFeet(dust, chips, out) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(3, Math.min(MAX_BARS, Math.round(c.cageBars)));
    const R = this._cageRadius * (1 - c.cageClose * this._cageClose);
    const nd = Math.round(dust * g.particleCount);
    const nc = Math.round(chips * g.particleCount * g.explosionIntensity);
    this.pointAt(1, _end);
    for (let i = 0; i < n; i++) {
      const ang = this._cageSpin + (TAU * i) / n;
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      _pos.copy(_end).addScaledVector(_radial, R);
      _pos.y = 0.1;
      _dir.copy(_radial).multiplyScalar(out);
      _dir.y = 0.25;
      if (nd > 0) {
        this._fillEmit(_pos, 0.25, _dir, c.dustSpeed * 1.2, 0.5, 0.55, c.dustLife * 1.3, 0.4);
        this.dust.emit(nd, _emit);
      }
      if (nc > 0) {
        _dir.y = 1.4;
        this._fillEmit(_pos, 0.15, _dir, c.chipSpeed, 0.6, c.chipSize * 1.5, c.chipLife, 8);
        this.chips.emit(nc, _emit);
      }
    }
  }

  /** The bars land: scorch under every foot, chips and dust thrown out. */
  _cageSlam() {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(3, Math.min(MAX_BARS, Math.round(c.cageBars)));
    this.pointAt(1, _end);
    if (c.footScorch > 0.01) {
      for (let i = 0; i < n; i++) {
        const ang = this._cageSpin + (TAU * i) / n;
        _pos.set(_end.x + Math.cos(ang) * this._cageRadius, 0, _end.z + Math.sin(ang) * this._cageRadius);
        this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
          radius: c.footScorch,
          life: c.groundLife * g.lifetime,
          width: 0.7,
          intensity: 0.9,
          colorA: getColor(c.colorGroundStain),
          colorB: getColor(c.colorCageRim),
          height: 0.028
        });
      }
    }
    this._cageFeet(c.footDust, c.footChips, 1);
  }

  /** The cage's own particles: the event's wake, motes dragged into the hole, sparks off the erase cut. */
  _cageShed(dt, committed) {
    const c = settings[ID];
    const g = settings.global;
    if (!committed && this.seed.visible) {
      const n = Math.round(this._seedEmitter.tick(dt, c.seedTrail) * g.particleCount);
      if (n > 0) {
        this._fillEmit(this.seed.position, c.seedSize * 0.6, _up, c.moteSpeed * 0.3, 1, 0.1, c.moteLife * 0.7, 1);
        this.motes.emit(n, _emit);
      }
      return;
    }
    if (this._pitR > 0.05) {
      const n = Math.round(this._pullEmitter.tick(dt, c.pullMotes) * g.particleCount);
      this.pointAt(1, _end);
      for (let k = 0; k < n; k++) {
        const ang = Math.random() * TAU;
        const r = this._pitR * (1.3 + Math.random() * c.pitSkirt);
        _pos.set(_end.x + Math.cos(ang) * r, 0.08 + Math.random() * 0.3, _end.z + Math.sin(ang) * r);
        _dir.set(-Math.cos(ang) + Math.sin(ang) * 0.5, -0.05, -Math.sin(ang) - Math.cos(ang) * 0.5);
        this._fillEmit(_pos, 0.05, _dir, c.pullSpeed, 0.1, 0.09, Math.min(c.moteLife, (r - this._pitR) / Math.max(0.2, c.pullSpeed) + 0.1), 1);
        this.motes.emit(1, _emit);
      }
    }
    const n = Math.round(this._eraseEmitter.tick(dt, c.eraseSparks) * g.particleCount);
    if (n > 0) {
      const attr = this.barGeometry.getAttribute('aBar');
      const bars = this.bars.count;
      for (let k = 0; k < n; k++) {
        const i = Math.floor(Math.random() * bars);
        const e = attr.getY(i);
        if (e <= 0.01 || e >= 0.98) continue;
        _pos.copy(_tops[i]).lerp(_end, 0).setY(Math.max(0.1, _tops[i].y * (1 - e)));
        this._fillEmit(_pos, c.cageWidth * 0.6, _up, c.streakSpeed * 0.4, 0.9, 0.06, c.streakLife, 2);
        this.streaks.emit(1, _emit);
      }
    }
  }


  /**
   * The floor's own clock. Before the beat a zone shows its footprint faintly
   * and a line lays its strip behind the head; on the beat the field lands out
   * to the rim over `groundLand` seconds (a line's strip is already down),
   * hot; it cools through the fade and breaks up over its last stretch. The
   * residue decal outlives it.
   */
  _groundPose(committed, fadeT) {
    const c = settings[ID];
    const st = this._state;
    if (!committed) {
      st.land = 0;
      st.pre = c.groundTelegraph * saturate(this.u * 1.4);
      st.heat = 0;
      st.erode = 0;
      return;
    }
    const since = fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
    const landed = saturate(since / Math.max(0.05, c.groundLand));
    st.land = 1.25 * Easing.outCubic(landed);
    st.pre = c.groundTelegraph * (1 - landed);
    st.heat = fadeT < 1 ? 1 - 0.3 * fadeT : 0.7 * (1 - saturate((fadeT - 1) * 1.5));
    st.erode = fadeT < 1 ? 0 : saturate((fadeT - 1.4) / 0.6);
  }

  _write(open, grow, along, dissolve, fade, phrase) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._state;
    this._focusPoint(_focus);
    st.center.copy(_focus);
    st.origin.copy(this.origin);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.radius = ZONE ? Math.max(0.2, c.zoneRadius) : Math.max(0.2, c.sweep);
    st.length = Math.max(0.2, this.length);
    st.height = c.height * g.shaderIntensity;
    st.thickness = c.thickness;
    st.count = Math.max(1, c.count);
    st.spin = this._spin;
    st.voiceSpin = this._spin * (COUNTER ? -1.35 : 1);
    st.open = open * (0.35 + Math.max(0, c.lean));
    st.beat = open;
    st.grow = grow;
    st.along = along;
    st.seed = this._seed;
    st.fade = fade;
    st.dissolve = dissolve;
    st.phrase = phrase;
    st.foot = ZONE ? c.zoneRadius * 2 : Math.max(0.4, this.front);
    st.footWidth = ZONE ? c.zoneRadius * 2 : c.groundWidth;
    // A zone's field sits on the circle; a line's covers the strip already crossed.
    if (ZONE) st.groundCenter.copy(_focus);
    else st.groundCenter.copy(this.origin).addScaledVector(this.direction, st.foot * 0.5);
    st.pulse = 1 + c.bodyPulse * Math.sin(this.age * c.bodyPulseRate);
    this.bodyMaterial.userData.sync(st);
    this.lensMaterial.userData.sync(st);
    this.groundMaterial.userData.sync(st);
    this.voiceMaterial.userData.sync(st);
    this.detailMaterial.userData.sync(st);
    this.heroMaterial.userData.sync(st);
    this.detail.update(TWIST, ZONE, st, c, this.age);
    this.rig.update(st, c, this.age);
    const show = fade > 0.02 && (grow > 0.02 || open > 0.02);
    this.body.visible = show;
    this.voice.visible = show;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
    this.position.copy(_focus);
    this.position.y = c.height * 0.45;
  }

  _palette() {
    const c = settings[ID];
    const g = settings.global;
    const sync = (p, a, b, cc, d, size, glow, grav) => {
      p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
      p.uniforms.uSizeScale.value = size * g.particleSize * 7;
      p.uniforms.uLifeScale.value = g.particleLifetime;
      p.uniforms.uSpeedScale.value = g.particleSpeed;
      p.uniforms.uOpacity.value = g.opacity;
      p.uniforms.uGlow.value = glow;
      p.uniforms.uGravity.value.set(0, grav, 0);
    };
    sync(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.4);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    sync(this.streaks, c.colorStreakA, c.colorStreakB, c.colorStreakC, c.colorStreakD, c.streakSize, 2 * g.glow, 0);
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    sync(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteSize, 1.6 * g.glow, -0.6);
    this.motes.uniforms.uOpacity.value = 0.9 * g.opacity;
    sync(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, -9);
  }

  _fillEmit(position, radius, direction, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  _shed(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    this._focusPoint(_end);
    const dustN = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (dustN > 0) {
      this._fillEmit(_end, ZONE ? c.zoneRadius * 0.35 : 0.3, _dir, c.dustSpeed, 0.45, 0.45, c.dustLife, 0.4);
      for (let i = 0; i < dustN; i++) {
        const ang = this._spin + i * 0.7;
        _dir.set(-Math.cos(ang), 0.05, -Math.sin(ang));
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.set((Math.random() - 0.5) * 0.2, -0.15, (Math.random() - 0.5) * 0.2);
        _emit.direction = _dir;
        this.streaks.emit(1, _emit);
      }
    }
    const chipN = Math.round(this.chipEmitter.tick(dt, c.chipRate * strength) * g.particleCount);
    if (chipN > 0) {
      this._fillEmit(_end, 0.16, _dir, c.chipSpeed, 0.4, 0.08, c.chipLife, 6);
      for (let i = 0; i < chipN; i++) {
        const ang = this._spin + i * 1.3;
        _dir.set(Math.cos(ang), 0.7, Math.sin(ang));
        _emit.direction = _dir;
        this.chips.emit(1, _emit);
      }
    }
    this._motes(dt, strength);
  }

  /** Motes drift off whichever detail pieces are standing. */
  _motes(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength * (this.detail.live / Math.max(1, c.detailCount))) * g.particleCount);
    if (n <= 0) return;
    const count = Math.round(c.detailCount);
    for (let k = 0; k < n; k++) {
      const pick = Math.floor(Math.random() * count);
      if (!this.detail.pointOf(pick, _pos)) continue;
      _dir.set((Math.random() - 0.5) * 0.6, 1, (Math.random() - 0.5) * 0.6);
      this._fillEmit(_pos, 0.12, _dir, c.moteSpeed, 0.5, 0.08, c.moteLife, 1);
      this.motes.emit(1, _emit);
    }
  }

  _already(dummy) {
    for (let i = 0; i < this._struck.length; i++) if (this._struck[i] === dummy) return true;
    return false;
  }

  _remember(dummy) {
    if (this._struck.length < 24) this._struck.push(dummy);
    if (CARRY !== 'none' && this._carried.length < 16) this._carried.push(dummy);
    this._hits++;
    this._mark(dummy);
  }

  /** Start a felled body wearing the element. */
  _mark(dummy) {
    if (this._markCount >= MAX_MARKS) return;
    const slot = this._marks[this._markCount++];
    slot.dummy = dummy;
    slot.time = 0;
    slot.emitter.reset();
  }

  /** Stain the marked bodies toward the element's look and keep them shedding. */
  _updateMarks(dt) {
    if (this._markCount === 0) return;
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorMarkBody;
    look.rimColor = c.colorMarkRim;
    look.rimEmissive = c.markRimGlow;
    look.edgeColor = c.colorMarkEdge;
    look.edgeEmissive = c.markEdgeGlow;
    look.edgeWidth = c.markEdgeWidth;
    for (let i = 0; i < this._markCount; i++) {
      const slot = this._marks[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.02, c.markTime)) * c.markAmount, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.markLife * g.lifetime));
      if (left <= 0) continue;
      const n = Math.round(slot.emitter.tick(dt, c.markMotes * left) * g.particleCount);
      if (n <= 0) continue;
      const at = dummy.bodyPoint?.(_body) ?? _body.copy(dummy.position).setY(0.9);
      this._fillEmit(at, 0.3, _up, c.moteSpeed, 0.7, 0.08, c.moteLife, 1);
      this.motes.emit(n, _emit);
    }
  }

  _releaseMarks() {
    for (let i = 0; i < this._markCount; i++) this._marks[i].dummy = null;
    this._markCount = 0;
  }


  _killDir(dummy) {
    this._aim(_focus);
    _dir.set(dummy.position.x - _focus.x, 0, dummy.position.z - _focus.z);
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
    else _dir.normalize();
    _dir.multiplyScalar(-1);
    
  }

  _blow(dummy, mode) {
    const c = settings[ID];
    const g = settings.global;
    if (mode && mode !== HIT) this._killEcho(dummy, mode);
    else this._killDir(dummy);
    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity * LIFT;
    if (mode === 'up') this._force.lift *= 1.4;
    this._force.spin = c.hitSpin;
    if (dummy.kill(_dir.x, _dir.z, this._force, SLICE || mode === 'swing')) this._remember(dummy);
  }

  _killEcho(dummy, mode) {
    this._aim(_focus);
    if (mode === 'up') {
      _dir.copy(this.direction).multiplyScalar(0.2);
      return;
    }
    _dir.set(dummy.position.x - _focus.x, 0, dummy.position.z - _focus.z);
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
    else _dir.normalize();
    if (mode === 'in') _dir.multiplyScalar(-1);
    if (mode === 'tangent') {
      const x = _dir.x;
      _dir.set(-_dir.z, 0, x);
    }
  }

  _gather(x, z, radius, mode) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(x, z, radius, this._found);
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      if (this._already(dummy)) continue;
      this._blow(dummy, mode);
    }
    this._found.length = 0;
  }


  _head(i, n) {
    return saturate(this.u * n - i);
  }

  _partPoint(i, n, out) {
    const c = settings[ID];
    const lane = ((i + 0.5) / n - 0.5) * 2 * c.sweep;
    const s = (i + 0.5) / n;
    return this.pointAt(s, out).addScaledVector(this.side, lane);
  }

  _strikeParts(forceAll) {
    const c = settings[ID];
    const n = Math.max(1, Math.min(12, Math.round(c.count)));
    for (let i = 0; i < n; i++) {
      if (!forceAll && this._head(i, n) < 0.98) continue;
      if (!this._parts[i].armed) continue;
      this._parts[i].armed = false;
      this._partPoint(i, n, _end);
      this._gather(_end.x, _end.z, Math.max(0.45, c.thickness * 4 + 0.5));
    }
  }

  _strike(forceAll) {
    const c = settings[ID];
    if (WHEN === 'part') {
      this._strikeParts(forceAll);
      return;
    }
    if (WHEN === 'late' && this.u < 0.42 && !forceAll) return;
    this._aim(_end);
    const reach = ZONE ? Math.max(c.zoneRadius, c.hitRadius) : Math.max(0.35, c.hitRadius);
    this._gather(_end.x, _end.z, reach);
  }

  _echo() {
    if (!ECHO) return;
    const c = settings[ID];
    this._aim(_end);
    const reach = (ZONE ? Math.max(c.zoneRadius, c.hitRadius) : c.hitRadius) * 1.15;
    this._gather(_end.x, _end.z, reach, ECHO);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * 0.45 * settings.global.explosionIntensity);
    this.ctx.shake.add(c.impactShake * 0.4 * settings.global.cameraShake, 6, 16);
  }

  _drag(dt, fade) {
    if (CARRY === 'none' || fade <= 0.02) return;
    const c = settings[ID];
    this._focusPoint(_focus);
    const grab = saturate(6 * dt) * fade;
    for (let i = this._carried.length - 1; i >= 0; i--) {
      const dummy = this._carried[i];
      if (!dummy || dummy.finished || dummy.alive) {
        dummy?.release?.();
        this._carried.splice(i, 1);
        continue;
      }
      const at = dummy.bodyPoint ? dummy.bodyPoint(_pos) : dummy.position;
      if (!at) continue;
      const dx = _focus.x - at.x;
      const dz = _focus.z - at.z;
      const d = Math.max(0.2, Math.hypot(dx, dz));
      const inward = CARRY === 'in' ? 1 : CARRY === 'out' ? -1 : 0.25;
      const spin = CARRY === 'orbit' ? 4.2 : 1.15;
      const lift = CARRY === 'up' ? 7 : 1.3;
      this._flow.vx = (dx / d) * inward * 6 * c.sweep + (-dz / d) * spin;
      this._flow.vz = (dz / d) * inward * 6 * c.sweep + (dx / d) * spin;
      this._flow.vy = lift * fade;
      dummy.carry(this._field, grab, grab, CARRY === 'up' ? 0.35 : 0);
    }
  }

  _telegraph() {
    const c = settings[ID];
    this.pointAt(1, _end);
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: Math.max(0.4, c.zoneRadius) * 0.85,
      life: Math.max(0.4, c.shockLife),
      width: 0.05,
      intensity: 0.45,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.02
    });
  }

  /**
   * The beat lands as a hit, not a pop: shake, flash and a light punch, a
   * burst, real fragments thrown up and out with dust rolled along
   * the floor, and a filled residue decal sized to the circle that stays on the
   * floor after the cast is gone. The thin shock ring is only a trace now (`shockRing`).
   */
  _beat() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.impactShake * power * g.cameraShake, 4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    if (c.burstOpacity > 0.01) {
      this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
        radius: 0.35,
        endRadius: c.burstRadius * power,
        life: c.burstLife,
        intensity: 0.85,
        opacity: c.burstOpacity * g.opacity,
        squash: 0.38,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    this._debris(_end);
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: Math.max(0.5, c.zoneRadius * c.groundStainReach) * power,
      life: c.groundLife * g.lifetime,
      width: 0.8,
      intensity: c.groundStain,
      colorA: getColor(c.colorGroundStain),
      colorB: getColor(c.colorGroundA),
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: c.shockRadius * (ZONE ? 1 : 0.65) * power,
      life: c.shockLife,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    if (c.shockRing > 0.01) {
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
        radius: c.shockRadius * 0.8,
        life: c.shockLife * 0.75,
        width: 0.08,
        intensity: 0.85 * c.shockRing,
        colorA: getColor(c.colorShockB),
        colorB: getColor(c.colorShockA),
        height: 0.03
      });
    }
  }

  /** Fragments thrown up and out of the strike, and dust rolled out along the floor. */
  _debris(at) {
    const c = settings[ID];
    const g = settings.global;
    const spread = ZONE ? c.zoneRadius * 0.4 : 0.5;
    _pos.copy(at).setY(0.15);
    const chips = Math.round(c.impactChips * g.particleCount * g.explosionIntensity);
    if (chips > 0) {
      this._fillEmit(_pos, spread, _up, c.chipSpeed * 1.5, 0.8, c.chipSize * 1.4, c.chipLife * 1.3, 8);
      this.chips.emit(chips, _emit);
    }
    const dust = Math.round(c.impactDust * g.particleCount);
    for (let i = 0; i < dust; i++) {
      const ang = (i / Math.max(1, dust)) * Math.PI * 2 + this._spin;
      _dir.set(Math.cos(ang), 0.12, Math.sin(ang));
      this._fillEmit(_pos, spread * 0.6, _dir, c.dustSpeed * 1.8, 0.25, 0.6, c.dustLife * 1.4, 0.4);
      this.dust.emit(1, _emit);
    }
  }

  /** The smaller second beat: a low dust roll settling over the field, a thud and a last flare of light. */
  _aftershock() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.aftershockShake * power * g.cameraShake, 3, 12);
    this.lightBoost += c.aftershockLight * power;
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.aftershockRadius * power,
      life: c.aftershockLife,
      width: 0.06,
      intensity: 0.55,
      colorA: getColor(c.colorGroundB),
      colorB: getColor(c.colorGroundA),
      height: 0.03
    });
  }

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this._cageShed(dt, false);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    this._cageSlam();
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
    this._palette();
    this._shed(dt, fade * 0.7);
    this._cageShed(dt, true);
    if (this._stepReached > this._cageStep) {
      this._cageStep = this._stepReached;
      this._cageEvent();
    }
    if (WHEN === 'return') this._strike(false);
    if (!this._settled && t > c.aftershockAt) {
      this._settled = true;
      this._aftershock();
    }
    if (ECHO && !this._echoed && t > 1.08) {
      this._echoed = true;
      this._echo();
    }
    this._drag(dt, fade);
    this._updateMarks(dt);
  }

  onDestroy() {
    this._releaseMarks();
    for (let i = 0; i < this._carried.length; i++) this._carried[i].release?.();
    this._carried.length = 0;
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this.detail.hide();
    this.rig.hide();
    this._hideCage();
  }

  dispose() {
    this.barGeometry.dispose();
    this.beamGeometry.dispose();
    this.barMaterial.dispose();
    this.seedGeometry.dispose();
    this.seedMaterial.dispose();
    this.pitGeometry.dispose();
    this.pitMaterial.dispose();
    this.detail.dispose();
    this.rig.dispose();
    this.detailMaterial.dispose();
    this.heroMaterial.dispose();
    this.bodyGeometry.dispose();
    this.voiceGeometry.dispose();
    this.groundGeometry.dispose();
    this.bodyMaterial.dispose();
    this.lensMaterial.dispose();
    this.groundMaterial.dispose();
    this.voiceMaterial.dispose();
    super.dispose();
  }
}

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('Event Cage');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'travel (m/s)');
  R(cast, c, 'cooldown', 0, 8, 0.05, 'cooldown');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'impact (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.01, 'fade (s)');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle (m)');
  Editor.castAnimation(cast, c);

  const hand = folder.addFolder('0 · Hand');
  R(hand, c, 'handForward', -0.5, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'side (m)');
  R(hand, c, 'handHeight', 0.2, 2.5, 0.01, 'height (m)');
  R(hand, c, 'handFlare', 0, 3, 0.01, 'flare (m)');
  R(hand, c, 'handSparks', 0, 120, 1, 'sparks');
  R(hand, c, 'handMotes', 0, 80, 1, 'motes');

  const shape = folder.addFolder('1 · Shape — seal');
  R(shape, c, 'count', 1, 16, 1, 'count');
  R(shape, c, 'height', 0.2, 10, 0.05, 'height (m)');
  R(shape, c, 'thickness', 0.02, 2, 0.01, 'thickness (m)');
  R(shape, c, 'sweep', 0, 8, 0.05, 'reach');
  R(shape, c, 'lean', 0, 3, 0.01, 'lean');

  const motion = folder.addFolder('2 · Timing');
  R(motion, c, 'spinSpeed', -20, 20, 0.1, 'spin (rad/s)');
  R(motion, c, 'lifetime', 0.1, 5, 0.05, 'hold (s)');

  const look = folder.addFolder('3 · Body');
  R(look, c, 'bodyOpacity', 0, 2, 0.01, 'opacity');
  R(look, c, 'bodyGlow', 0, 4, 0.01, 'body glow');
  R(look, c, 'edgeGlow', 0, 10, 0.05, 'edge glow');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(look, c, 'bodyPulse', 0, 1, 0.01, 'pulse');
  R(look, c, 'bodyPulseRate', 0, 20, 0.1, 'pulse rate');
  R(look, c, 'lensWarp', 0, 3, 0.01, 'lens warp');
  look.addColor(c, 'colorA').name('edge');
  look.addColor(c, 'colorB').name('core');
  look.addColor(c, 'colorC').name('deep');

  const voice = folder.addFolder('4 · Voice');
  R(voice, c, 'voiceOpacity', 0, 2, 0.01, 'opacity');
  voice.addColor(c, 'colorVoiceA').name('voice');
  voice.addColor(c, 'colorVoiceB').name('voice, hot');

  const floor = folder.addFolder('5 · Ground');
  R(floor, c, 'groundWidth', 0.2, 16, 0.05, 'width (m)');
  R(floor, c, 'groundGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'groundLife', 0.1, 12, 0.05, 'residue life (s)');
  R(floor, c, 'groundOpacity', 0, 2, 0.01, 'opacity');
  R(floor, c, 'groundHeat', 0, 4, 0.05, 'heat');
  R(floor, c, 'groundCoat', 0, 1, 0.01, 'stain .. coat');
  R(floor, c, 'groundLand', 0.05, 2, 0.01, 'lands in (s)');
  R(floor, c, 'groundTelegraph', 0, 1, 0.01, 'footprint before the beat');
  R(floor, c, 'groundStain', 0, 1.5, 0.01, 'residue');
  R(floor, c, 'groundStainReach', 0.1, 2, 0.01, 'residue reach');
  floor.addColor(c, 'colorGroundA').name('ground');
  floor.addColor(c, 'colorGroundB').name('ground, deep');
  floor.addColor(c, 'colorGroundStain').name('stain');

  const pieces = folder.addFolder('6 · Detail pieces');
  R(pieces, c, 'detailCount', 0, 48, 1, 'count');
  R(pieces, c, 'detailSize', 0.05, 2, 0.01, 'size (m)');
  R(pieces, c, 'detailSizeJitter', 0, 1, 0.01, 'size jitter');
  R(pieces, c, 'detailSpread', 0.1, 2, 0.01, 'spread');
  R(pieces, c, 'detailLift', 0, 8, 0.05, 'lift (m)');
  R(pieces, c, 'detailSpin', -4, 4, 0.05, 'orbit');
  R(pieces, c, 'detailGlow', 0, 6, 0.05, 'rim glow');
  R(pieces, c, 'detailOpacity', 0, 1.5, 0.01, 'opacity');
  R(pieces, c, 'detailSwing', 0, 2.5, 0.01, 'fold');
  R(pieces, c, 'detailEdge', 0, 4, 0.05, 'arris light');
  R(pieces, c, 'detailDeep', 0, 1, 0.01, 'colour depth');
  pieces.addColor(c, 'colorDetailA').name('rim');
  pieces.addColor(c, 'colorDetailB').name('lit');
  pieces.addColor(c, 'colorDetailC').name('shade');

  const hero = folder.addFolder('7 · Hero rig');
  R(hero, c, 'heroSize', 0.2, 8, 0.05, 'size (m)');
  R(hero, c, 'heroReach', 0.1, 1.4, 0.01, 'ring fit');
  R(hero, c, 'heroLift', 0, 8, 0.05, 'travel (m)');
  R(hero, c, 'heroSpin', -4, 4, 0.05, 'turn');
  R(hero, c, 'heroSwing', 0, 2.5, 0.01, 'fold');
  R(hero, c, 'heroGlow', 0, 6, 0.05, 'rim glow');
  R(hero, c, 'heroEdge', 0, 4, 0.05, 'arris light');
  R(hero, c, 'heroOpacity', 0, 1.5, 0.01, 'opacity');
  R(hero, c, 'heroDeep', 0, 1, 0.01, 'colour depth');
  R(hero, c, 'heroMaxHeight', 1, 12, 0.05, 'max height (m)');
  R(hero, c, 'heroFit', 0, 1.5, 0.01, 'fit to circle');
  hero.addColor(c, 'colorHeroA').name('rim');
  hero.addColor(c, 'colorHeroB').name('lit');
  hero.addColor(c, 'colorHeroC').name('shade');

  const parts = folder.addFolder('8 · Shed');
  R(parts, c, 'dustRate', 0, 400, 1, 'dust / s');
  R(parts, c, 'dustSize', 0.02, 2, 0.01, 'dust size');
  R(parts, c, 'dustSpeed', 0, 20, 0.1, 'dust speed');
  R(parts, c, 'dustLife', 0.05, 3, 0.01, 'dust life');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'streakRate', 0, 400, 1, 'shed / s');
  R(parts, c, 'streakSize', 0.005, 0.4, 0.005, 'shed size');
  R(parts, c, 'streakSpeed', 0, 30, 0.1, 'shed speed');
  R(parts, c, 'streakLife', 0.05, 2, 0.01, 'shed life');
  R(parts, c, 'streakStretch', 0, 4, 0.01, 'shed stretch');
  Editor.gradient(parts, c, 'colorStreak', 'shed colour');
  R(parts, c, 'chipRate', 0, 200, 1, 'chips / s');
  R(parts, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(parts, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(parts, c, 'chipLife', 0.05, 3, 0.01, 'chip life');
  Editor.gradient(parts, c, 'colorChip', 'chip colour');

  const motes = folder.addFolder('9 · Motes');
  R(motes, c, 'moteRate', 0, 200, 1, 'motes / s');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'size');
  R(motes, c, 'moteSpeed', 0, 10, 0.1, 'speed');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'life');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');

  const beat = folder.addFolder('10 · The beat');
  R(beat, c, 'impactShake', 0, 2, 0.01, 'camera punch');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 12, 0.05, 'burst (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'burst life');
  R(beat, c, 'burstOpacity', 0, 1.5, 0.01, 'burst opacity');
  R(beat, c, 'impactChips', 0, 200, 1, 'fragments');
  R(beat, c, 'impactDust', 0, 120, 1, 'dust roll');
  beat.addColor(c, 'colorBurstA').name('burst, hot');
  beat.addColor(c, 'colorBurstB').name('burst, body');
  beat.addColor(c, 'colorBurstC').name('burst, deep');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'decal (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'decal life');
  R(beat, c, 'shockRing', 0, 1.5, 0.01, 'shock ring');
  beat.addColor(c, 'colorShockA').name('decal');
  beat.addColor(c, 'colorShockB').name('decal, hot');

  const after = folder.addFolder('11 · Aftershock');
  R(after, c, 'aftershockAt', 1, 1.9, 0.01, 'lands at');
  R(after, c, 'aftershockRadius', 0, 12, 0.05, 'dust roll (m)');
  R(after, c, 'aftershockShake', 0, 2, 0.01, 'camera punch');
  R(after, c, 'aftershockLight', 0, 40, 0.5, 'light punch');
  R(after, c, 'aftershockLife', 0.05, 3, 0.01, 'dust life');

  const bodies = folder.addFolder('12 · Bodies');
  R(bodies, c, 'hitRadius', 0.1, 12, 0.05, 'reach (m)');
  R(bodies, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(bodies, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(bodies, c, 'hitSpin', 0, 8, 0.05, 'spin');

  const mark = folder.addFolder('13 · Mark — hollowed out');
  R(mark, c, 'markAmount', 0, 1, 0.01, 'stain');
  R(mark, c, 'markTime', 0.02, 3, 0.01, 'sets in (s)');
  R(mark, c, 'markLife', 0, 8, 0.05, 'sheds for (s)');
  R(mark, c, 'markMotes', 0, 120, 1, 'motes / s');
  mark.addColor(c, 'colorMarkBody').name('body');
  mark.addColor(c, 'colorMarkRim').name('rim');
  R(mark, c, 'markRimGlow', 0, 6, 0.05, 'rim glow');
  mark.addColor(c, 'colorMarkEdge').name('edge');
  R(mark, c, 'markEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(mark, c, 'markEdgeWidth', 0, 0.3, 0.005, 'edge width');

  const cage = folder.addFolder('14 · The cage');
  R(cage, c, 'cageBars', 3, 16, 1, 'bars');
  R(cage, c, 'cageWidth', 0.05, 1.2, 0.01, 'bar width (m)');
  R(cage, c, 'cageHeight', 0.5, 6, 0.05, 'bar height (m)');
  R(cage, c, 'cageFit', 0.2, 1.4, 0.01, 'ring, × circle');
  R(cage, c, 'cageLintel', 0, 0.8, 0.01, 'lintel (m)');
  R(cage, c, 'cageDropHeight', 0, 14, 0.1, 'drop from (m)');
  R(cage, c, 'cageDropSpan', 0.05, 1, 0.01, 'drop, share of travel');
  R(cage, c, 'cageStagger', 0, 0.5, 0.01, 'drop stagger');
  R(cage, c, 'cageBounce', 0, 1, 0.01, 'slam dip (m)');
  R(cage, c, 'cageLean', 0, 0.8, 0.01, 'lean in (rad)');
  R(cage, c, 'cageSteps', 1, 8, 1, 'closing events');
  R(cage, c, 'cageCloseStart', 0, 2, 0.01, 'closing starts (s)');
  R(cage, c, 'cageCloseEnd', 0.2, 1, 0.01, 'closed by, share of life');
  R(cage, c, 'cageClose', 0, 0.9, 0.01, 'closes by, × ring');
  R(cage, c, 'cageStepSnap', 0.02, 0.6, 0.01, 'event snap (s)');
  R(cage, c, 'cageStepShake', 0, 1, 0.01, 'event punch');
  R(cage, c, 'cageStepLight', 0, 20, 0.1, 'event light');
  R(cage, c, 'cageStepDust', 0, 20, 1, 'event dust / bar');
  R(cage, c, 'cageEraseStart', 0, 3, 0.01, 'erase starts (s)');
  R(cage, c, 'cageEraseStagger', 0, 2, 0.01, 'erase sweep (s)');
  R(cage, c, 'cageEraseTime', 0.05, 2, 0.01, 'erase per bar (s)');
  R(cage, c, 'cageSink', 0, 1, 0.01, 'sinks as erased');
  R(cage, c, 'cageCutWidth', 0.005, 0.3, 0.005, 'cut edge');
  R(cage, c, 'cageNotches', 1, 30, 1, 'event notches');
  R(cage, c, 'cageNotchGlow', 0, 6, 0.05, 'notch glow');
  R(cage, c, 'cageRimGlow', 0, 4, 0.05, 'rim glow');
  R(cage, c, 'cageSpecular', 0, 4, 0.05, 'specular');
  R(cage, c, 'cageHeat', 0, 6, 0.05, 'slam heat');
  cage.addColor(c, 'colorCageDeep').name('glass, deep');
  cage.addColor(c, 'colorCageBody').name('glass, body');
  cage.addColor(c, 'colorCageRim').name('horizon rim');
  cage.addColor(c, 'colorCageHot').name('white-hot');
  R(cage, c, 'footScorch', 0, 2, 0.01, 'foot scorch (m)');
  R(cage, c, 'footDust', 0, 30, 1, 'foot dust');
  R(cage, c, 'footChips', 0, 30, 1, 'foot chips');
  R(cage, c, 'eraseSparks', 0, 200, 1, 'erase sparks / s');

  const hole = folder.addFolder('15 · The missing centre');
  R(hole, c, 'pitFit', 0, 1, 0.01, 'hole, × ring');
  R(hole, c, 'pitGrow', 0.05, 2, 0.01, 'opens in (s)');
  R(hole, c, 'pitClose', 0.05, 2, 0.01, 'closes in (s)');
  R(hole, c, 'pitLip', 0.01, 0.6, 0.01, 'lip (m)');
  R(hole, c, 'pitSkirt', 0, 4, 0.05, 'skirt, × hole');
  R(hole, c, 'pitSwirl', 0, 4, 0.05, 'drain');
  R(hole, c, 'pitGlow', 0, 6, 0.05, 'lip glow');
  R(hole, c, 'pitOpacity', 0, 1, 0.01, 'opacity');
  hole.addColor(c, 'colorPitDeep').name('hole');
  hole.addColor(c, 'colorPitLip').name('lip');
  R(hole, c, 'pullMotes', 0, 200, 1, 'motes pulled / s');
  R(hole, c, 'pullSpeed', 0, 10, 0.1, 'pull speed');

  const event = folder.addFolder('16 · The event in flight');
  R(event, c, 'seedSize', 0, 1.5, 0.01, 'size (m)');
  R(event, c, 'seedArc', 0, 6, 0.05, 'arc (m)');
  R(event, c, 'seedSpikes', 0, 1, 0.01, 'spikes');
  R(event, c, 'seedGlow', 0, 4, 0.05, 'horizon glow');
  R(event, c, 'seedTrail', 0, 200, 1, 'wake motes / s');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
