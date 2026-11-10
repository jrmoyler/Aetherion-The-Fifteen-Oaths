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
  Vector3
} from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createAureoleRingPieceGeometry, createAureoleRingHeroGeometry } from '../../assets/codex/AureoleRingGeometry.js';
import {
  createAureoleRingBodyMaterial,
  createAureoleRingLensMaterial,
  createAureoleRingGroundMaterial,
  createAureoleRingVoiceMaterial,
  createAureoleRingDetailMaterial,
  createAureoleRingGiltMaterial,
  createAureoleRingSunMaterial
} from '../../materials/codex/AureoleRingMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'aureole';

const TWIST = 'stamp';
const ARCH = 'halo';
const HIT = 'ring';
const CARRY = 'in';
const WHEN = 'commit';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
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
/** Rays the crown can stand (the geometry is instanced once). */
const MAX_RAYS = 24;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _q = new Quaternion();
const _qy = new Quaternion();
const _scale = new Vector3();
const _radial = new Vector3();
const _top = new Vector3();
const _hand = new Vector3();
const _face = new Vector3();
const _zAxis = new Vector3(0, 0, 1);
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);

/** A stable 0..1 die per ray from the cast's seed. */
function dice(i, seed) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Append a lofted solid from a list of cross-section rings (each a list of [x, z, edge]). */
function loft(rings, heights, pos, axis, edge) {
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r];
    const B = rings[r + 1];
    const ya = heights[r];
    const yb = heights[r + 1];
    const n = A.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const quad = [[A[i], ya], [B[j], yb], [A[j], ya], [A[i], ya], [B[i], yb], [B[j], yb]];
      for (const [p, y] of quad) {
        pos.push(p[0], y, p[1]);
        axis.push(y);
        edge.push(p[2]);
      }
    }
  }
}

/**
 * One ray of the aureole, one unit tall along +Y: a wavy flamberge blade of
 * diamond section — broad at the foot, rippled edges, a needle tip — curved
 * so its face bows in toward the centre (local −Z). Flat facets so the sun
 * picks out every face. `aAxis` 0 foot .. 1 tip, `aEdge` on the two edges.
 */
function createRayGeometry() {
  const rings = [];
  const heights = [];
  const steps = 26;
  for (let k = 0; k <= steps; k++) {
    const y = k / steps;
    const taper = Math.pow(1 - y, 0.85);
    const ripple = 1 + 0.16 * Math.sin(y * Math.PI * 7) * (1 - y);
    const w = (0.06 + 0.16 * taper) * ripple * (y < 0.06 ? 0.7 + 5 * y : 1);
    const t = 0.012 + 0.035 * taper;
    const bow = -0.09 * y * y;
    rings.push([[w, bow, 1], [0, bow + t, 0], [-w, bow, 1], [0, bow - t, 0]]);
    heights.push(y);
  }
  const pos = [];
  const axis = [];
  const edge = [];
  loft(rings, heights, pos, axis, edge);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aAxis', new Float32BufferAttribute(axis, 1));
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The sun-star, radius one, facing +Z: a twelve-pointed star plate with a
 * raised, faceted boss — thick enough to read as cast gold, with lit facets.
 * `aAxis` runs 0 at the centre to 1 at the points; `aEdge` on the points.
 */
function createStarGeometry(points = 12) {
  const n = points * 2;
  const pos = [];
  const axis = [];
  const edge = [];
  const tri = (a, b, c) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      axis.push(p[3]);
      edge.push(p[4]);
    }
  };
  const outline = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = i % 2 === 0 ? 1 : 0.5;
    outline.push([Math.cos(a) * r, Math.sin(a) * r, r, i % 2 === 0 ? 1 : 0]);
  }
  const front = 0.07;
  const back = -0.05;
  const boss = 0.32;
  const bossR = 0.3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const A = outline[i];
    const B = outline[j];
    // Front: points ridge up toward a faceted boss.
    const a = (i / n) * TAU;
    const b = (j / n) * TAU;
    const ia = [Math.cos(a) * bossR, Math.sin(a) * bossR, front + 0.1, 0.3, 0];
    const ib = [Math.cos(b) * bossR, Math.sin(b) * bossR, front + 0.1, 0.3, 0];
    const fa = [A[0], A[1], front * (A[2] > 0.9 ? 0.4 : 1), A[2], A[3]];
    const fb = [B[0], B[1], front * (B[2] > 0.9 ? 0.4 : 1), B[2], B[3]];
    tri(ia, fa, fb);
    tri(ia, fb, ib);
    tri([0, 0, boss, 0, 0], ia, ib);
    // Back plate.
    tri([0, 0, back, 0, 0], [B[0], B[1], back, B[2], B[3]], [A[0], A[1], back, A[2], A[3]]);
    // Rim wall.
    const ba = [A[0], A[1], back, A[2], A[3]];
    const bb = [B[0], B[1], back, B[2], B[3]];
    tri(fa, ba, bb);
    tri(fa, bb, fb);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aAxis', new Float32BufferAttribute(axis, 1));
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
  geometry.setAttribute('aRay', new Float32BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * AUREOLE RING — light, zone cast.
 *
 * Light — an aureole tightens on the circle and flares when it meets.
 *
 * The ring tightens. The flare is the moment the radius meets, not the moment it appears.
 *
 * The read is `stamp`: hit timing `commit`, blow `ring`, carry `in`.
 *
 * ## Layers
 *
 *   1. **body** — the stamp placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled light field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a crown riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createAureoleRingPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createAureoleRingHeroGeometry`), stood by its archetype (halo): held flat on the ground, turning, pulsing on the beat.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the ring tightens. The flare is the moment the radius meets, not the moment it appears.
 *  10. **mark** — a felled body is seared white: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The aureole (the hero, cast-local — sections 14–16 of the editor)
 *
 * The shared template layers (body, voice, rig, pieces, template field) are
 * switched off in the config through their own keys; the spell is carried by
 * its own forms:
 *
 *   - **the sun-star** — a twelve-pointed star of cast gold
 *     (`createStarGeometry`, `star*`) is thrown spinning from the hand on an
 *     arc and comes to hang over the centre of the circle, face to the
 *     caster, on the beat.
 *   - **the crown** — `rayCount` gilt flamberge rays (`createRayGeometry`,
 *     `ray*`), alternating tall and short, rise out of the floor wide of the
 *     circle while the star flies, leaning out, and tighten in onto the rim.
 *   - **the flare** — on the beat (the moment the radius meets) the crown
 *     snaps in, every ray leans its tip toward the star, and a band of
 *     white-gold runs up each ray from foot to tip; sparks are shot up the
 *     blades, the bodies are thrown out.
 *   - **the linger** — the crown turns slowly while its heat cools from gold
 *     to bronze; the star turns and breathes over it; motes of light rise
 *     off the floor.
 *   - **the exit** — the rays sink back into the floor one after another
 *     round the ring, and the star drops and shrinks into the boss.
 *   - **the sunburst** — a filled disc of alternating long and short gilt
 *     rays burned into an umber floor (`sun*`), landing from the centre on
 *     the beat, cooling, eroding at the end.
 *
 * All of it is presentation: hits still land once, on the beat, exactly as before.
 *
 * Every metre, rate and colour is read from `settings.aureole` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class AureoleRingAbility extends Ability {
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
    this.bodyMaterial = createAureoleRingBodyMaterial();
    this.lensMaterial = createAureoleRingLensMaterial();
    this.groundMaterial = createAureoleRingGroundMaterial();
    this.voiceMaterial = createAureoleRingVoiceMaterial();
    this.detailMaterial = createAureoleRingDetailMaterial();
    this.heroMaterial = createAureoleRingDetailMaterial(true);
    this.detail = new DetailLayer(createAureoleRingPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createAureoleRingHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._buildAureole();
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

  /** The aureole's own meshes: the instanced crown of rays, the sun-star, the sunburst floor. */
  _buildAureole() {
    this.rayGeometry = createRayGeometry();
    this.giltMaterial = createAureoleRingGiltMaterial();
    this.rays = new InstancedMesh(this.rayGeometry, this.giltMaterial, MAX_RAYS);
    const attr = new InstancedBufferAttribute(new Float32Array(MAX_RAYS * 4), 4);
    attr.setUsage(DynamicDrawUsage);
    this.rayGeometry.setAttribute('aRay', attr);
    this.rays.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rays.layers.set(LAYER.SHAPED);
    this.rays.castShadow = true;
    this.rays.receiveShadow = true;
    this.rays.frustumCulled = false;
    this.rays.renderOrder = 14;
    this.rays.visible = false;
    this.group.add(this.rays);
    this.starGeometry = createStarGeometry(12);
    this.star = this._mesh(this.starGeometry, this.giltMaterial, LAYER.SHAPED, 15);
    this.star.castShadow = true;
    this.sunGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.sunMaterial = createAureoleRingSunMaterial();
    this.sun = this._mesh(this.sunGeometry, this.sunMaterial, LAYER.VFX, 2);
    this.sun.rotation.x = -Math.PI / 2;
    this._floor = { radius: 1, land: 0, spin: 0, feet: 0.9, heat: 0, erode: 0, seed: 0 };
    this._crownSpin = 0;
    this._starSpin = 0;
    this._crownR = 1;
    this._riseEmitter = new RateEmitter();
    this._starEmitter = new RateEmitter();
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /**
   * Stand the aureole for this frame: every dimension from settings, every
   * moment from the travel (`u`) or the seconds since the beat.
   */
  _aureole(committed, fadeT, dt) {
    const c = settings[ID];
    const g = settings.global;
    const Lg = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    const R = Math.max(0.3, c.zoneRadius);
    this.pointAt(1, _end);
    const n = Math.max(3, Math.min(MAX_RAYS, Math.round(c.rayCount)));
    const H = Math.max(0.2, c.rayHeight);
    const W = Math.max(0.05, c.rayWidth);

    // Wide and leaning out while the star flies; tightening onto the rim as it arrives; snapping in on the beat.
    const u = saturate(this.u);
    const snap = since < 0 ? 0 : Easing.outBack(saturate(since / Math.max(0.02, c.raySnapTime * Lg)));
    let ring;
    let lean;
    let grow;
    if (since < 0) {
      const k = Easing.inOutCubic(u);
      ring = c.rayStart + (c.rayFit - c.rayStart) * k;
      lean = -c.rayLeanOut * (1 - k);
      grow = 0.2 + 0.8 * Easing.outCubic(saturate(u * 1.3));
    } else {
      ring = c.rayFit * (1 - c.raySnap * snap);
      lean = c.rayLean * snap;
      grow = 1;
    }
    this._crownR = R * ring;
    const spinRate = since < 0 ? c.raySpin * 2.5 : c.raySpin * (1 + 2 * Math.exp(-since * 3));
    this._crownSpin += dt * spinRate * g.animationSpeed;
    const heat = since < 0 ? 0.15 + 0.25 * u : Math.exp(-since * c.rayCool / Lg);
    const band = since < 0 ? -1 : saturate(since / Math.max(0.05, c.rayFlareTime * Lg)) * 1.3 - 0.1;
    const sinkStart = total * c.raySinkStart;

    const attr = this.rayGeometry.getAttribute('aRay');
    let any = false;
    for (let i = 0; i < n; i++) {
      const d = dice(i, this._seed);
      const tall = i % 2 === 0 ? 1 : c.rayShort;
      const order = (i / n + 0.2 * d) % 1;
      const sink = since < 0 ? 0 : Easing.inQuad(saturate((since - sinkStart - c.raySinkStagger * order * Lg) / Math.max(0.05, c.raySinkTime * Lg)));
      // Before the beat each ray rises on its own little delay.
      const rise = since < 0 ? Easing.outCubic(saturate(grow * 1.15 - d * 0.15)) : 1;
      const h = H * tall * (0.85 + 0.3 * d) * rise;
      attr.setXYZW(i, d * 10, saturate(heat * (0.85 + 0.3 * d)), band - d * 0.08, 0);
      if (h < 0.02 || sink >= 0.999) {
        this.rays.setMatrixAt(i, _zero);
        continue;
      }
      any = true;
      const ang = this._crownSpin + (TAU * i) / n;
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      _pos.copy(_end).addScaledVector(_radial, this._crownR);
      _pos.y = -sink * h * 1.05 - 0.05;
      // Lean the tip in toward the centre (or out, before the beat), then face the blade inward.
      const tilt = lean * (0.8 + 0.4 * d) + c.rayBreathe * Math.sin(this.age * 3 + i) * (since < 0 ? 0 : 1);
      _top.set(0, Math.cos(tilt), 0).addScaledVector(_radial, -Math.sin(tilt));
      _q.setFromUnitVectors(_up, _top);
      _qy.setFromAxisAngle(_up, Math.atan2(-_radial.x, -_radial.z));
      _q.multiply(_qy);
      _scale.set(W * (0.8 + 0.4 * tall), h, W * (0.8 + 0.4 * tall));
      _m4.compose(_pos, _q, _scale);
      this.rays.setMatrixAt(i, _m4);
    }
    this.rays.count = n;
    this.rays.visible = any;
    this.rays.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
    this.giltMaterial.userData.sync();

    // The sun-star: thrown from the hand, hanging over the centre, dropping into the boss at the end.
    const S = Math.max(0.05, c.starSize);
    let starScale;
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _hand.y = c.handHeight;
    if (since < 0) {
      _pos.lerpVectors(_hand, _end, u);
      _pos.y = _hand.y * (1 - u) + c.starHeight * u + c.starArc * 4 * u * (1 - u);
      starScale = S * (0.35 + 0.65 * Easing.outCubic(u));
      this._starSpin += dt * c.starSpinFlight * g.animationSpeed;
    } else {
      const drop = Easing.inQuad(saturate((since - total * c.starExit) / Math.max(0.05, total * (1 - c.starExit))));
      const bob = c.starBob * Math.sin(since * 2.4);
      _pos.copy(_end);
      _pos.y = (c.starHeight + bob + c.starRise * Easing.outCubic(saturate(since / 0.4))) * (1 - drop) + 0.1 * drop;
      starScale = S * (1 + c.starPop * Math.exp(-since * 6) * Math.min(1, since * 30)) * (1 - drop);
      this._starSpin += dt * c.starSpin * (1 + 3 * Math.exp(-since * 2)) * g.animationSpeed;
    }
    const showStar = starScale > 0.01;
    this.star.visible = showStar;
    if (showStar) {
      // Face the caster, turning about that facing.
      _face.copy(this.origin).sub(_pos).setY(0);
      if (_face.lengthSq() < 1e-4) _face.copy(this.direction).multiplyScalar(-1);
      _face.normalize();
      _q.setFromUnitVectors(_zAxis, _face);
      _qy.setFromAxisAngle(_zAxis, this._starSpin);
      _q.multiply(_qy);
      this.star.quaternion.copy(_q);
      this.star.position.copy(_pos);
      this.star.scale.set(starScale, starScale, starScale * c.starDepth);
      const sa = this.starGeometry.getAttribute('aRay');
      if (this._starHeat !== heat) {
        const band2 = since < 0 ? -1 : band;
        for (let k = 0; k < sa.count; k++) sa.setXYZW(k, 3.7, saturate(heat * 1.1 + 0.15), band2, 0);
        sa.needsUpdate = true;
        this._starHeat = heat;
      }
    }

    // The sunburst on the floor.
    const f = this._floor;
    f.radius = R * c.sunFit;
    f.land = since < 0 ? 0 : 1.15 * Easing.outCubic(saturate(since / Math.max(0.03, c.sunLand * Lg)));
    f.spin = this._crownSpin * c.sunTurn;
    f.feet = this._crownR / Math.max(0.01, f.radius);
    f.heat = since < 0 ? 0 : 0.25 + 0.75 * heat;
    const erodeStart = total * c.sunErodeStart;
    f.erode = since < 0 ? 0 : saturate((since - erodeStart) / Math.max(0.1, total - erodeStart));
    f.seed = this._seed;
    const showSun = c.sunOpacity > 0.01 && f.land > 0.01 && f.erode < 0.999;
    this.sun.visible = showSun;
    if (showSun) {
      const span = f.radius * 2.2;
      this.sun.position.set(_end.x, 0.04, _end.z);
      this.sun.scale.set(span, span, 1);
      this.sunMaterial.userData.sync(f);
    }
  }

  /** The aureole's own particles: sparks shot up the blades on the flare, motes rising off the sunburst, the star's wake. */
  _aureoleShed(dt, committed) {
    const c = settings[ID];
    const g = settings.global;
    if (!committed) {
      if (!this.star.visible) return;
      const n = Math.round(this._starEmitter.tick(dt, c.starTrail) * g.particleCount);
      if (n > 0) {
        this._fillEmit(this.star.position, c.starSize * 0.5, _up, c.moteSpeed * 0.4, 1, 0.09, c.moteLife * 0.6, 1);
        this.motes.emit(n, _emit);
      }
      return;
    }
    if (!this.sun.visible) return;
    const R = this._floor.radius;
    this.pointAt(1, _end);
    const n = Math.round(this._riseEmitter.tick(dt, c.sunMotes * (1 - this._floor.erode)) * g.particleCount);
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * TAU;
      const r = R * Math.sqrt(Math.random()) * 0.9;
      _pos.set(_end.x + Math.cos(ang) * r, 0.1, _end.z + Math.sin(ang) * r);
      this._fillEmit(_pos, 0.05, _up, c.moteSpeed, 0.25, 0.08, c.moteLife * 1.3, 1);
      this.motes.emit(1, _emit);
    }
  }

  /** The flare: sparks shot up every blade, a light punch. */
  _flare() {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(3, Math.min(MAX_RAYS, Math.round(c.rayCount)));
    this.pointAt(1, _end);
    this.lightBoost += c.flareLight * g.explosionIntensity;
    const per = Math.round(c.flareSparks * g.particleCount);
    if (per <= 0) return;
    for (let i = 0; i < n; i++) {
      const ang = this._crownSpin + (TAU * i) / n;
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      _pos.copy(_end).addScaledVector(_radial, this._crownR).setY(0.3);
      _dir.copy(_radial).multiplyScalar(-0.35).setY(1);
      this._fillEmit(_pos, 0.15, _dir, c.streakSpeed * 1.4, 0.18, 0.08, c.streakLife * 1.6, 2);
      this.streaks.emit(per, _emit);
    }
  }

  _hideAureole() {
    this.rays.visible = false;
    this.star.visible = false;
    this.sun.visible = false;
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
    this.dust = particles.get('aureole.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('aureole.streak', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('aureole.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('aureole.mote', {
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
    return 1 - f + f * Math.sin(this.age * 7.00);
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
    this._crownSpin = Math.random() * TAU;
    this._starSpin = 0;
    this._starHeat = -1;
    this._crownR = settings[ID].zoneRadius * settings[ID].rayStart;
    this._riseEmitter.reset();
    this._starEmitter.reset();
    this._hideAureole();
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
    sync(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteSize, 1.6 * g.glow, 0.5);
    this.motes.uniforms.uOpacity.value = 0.9 * g.opacity;
    sync(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, 2.5);
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
        _dir.set(Math.cos(ang) * 0.2, 1.6, Math.sin(ang) * 0.2);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.set(0, 1.8, 0);
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
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
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
    this._aureole(false, 0, dt);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this._aureoleShed(dt, false);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    this._flare();
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
    this._aureole(true, t, dt);
    this._palette();
    this._shed(dt, fade * 0.7);
    this._aureoleShed(dt, true);
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
    this._hideAureole();
  }

  dispose() {
    this.rayGeometry.dispose();
    this.starGeometry.dispose();
    this.giltMaterial.dispose();
    this.sunGeometry.dispose();
    this.sunMaterial.dispose();
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
  const folder = gui.addFolder('Aureole Ring');
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

  const shape = folder.addFolder('1 · Shape — stamp');
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

  const mark = folder.addFolder('13 · Mark — seared white');
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

  const crown = folder.addFolder('14 · The crown');
  R(crown, c, 'rayCount', 3, 24, 1, 'rays');
  R(crown, c, 'rayHeight', 0.3, 6, 0.05, 'height (m)');
  R(crown, c, 'rayShort', 0.2, 1, 0.01, 'short rays, × height');
  R(crown, c, 'rayWidth', 0.2, 4, 0.05, 'width');
  R(crown, c, 'rayStart', 0.5, 3, 0.01, 'rises at, × circle');
  R(crown, c, 'rayFit', 0.2, 1.5, 0.01, 'meets at, × circle');
  R(crown, c, 'raySnap', 0, 0.6, 0.01, 'snaps in, × ring');
  R(crown, c, 'raySnapTime', 0.02, 0.6, 0.01, 'snap (s)');
  R(crown, c, 'rayLeanOut', 0, 1, 0.01, 'leans out before (rad)');
  R(crown, c, 'rayLean', -0.5, 1, 0.01, 'leans in after (rad)');
  R(crown, c, 'rayBreathe', 0, 0.2, 0.005, 'breathes (rad)');
  R(crown, c, 'raySpin', -3, 3, 0.01, 'turn (rad/s)');
  R(crown, c, 'rayFlareTime', 0.05, 1.5, 0.01, 'flare runs up in (s)');
  R(crown, c, 'rayCool', 0.1, 6, 0.05, 'cools');
  R(crown, c, 'raySinkStart', 0, 1, 0.01, 'sinks from, share of life');
  R(crown, c, 'raySinkStagger', 0, 2, 0.01, 'sink sweep (s)');
  R(crown, c, 'raySinkTime', 0.05, 2, 0.01, 'sinks in (s)');
  R(crown, c, 'giltRimGlow', 0, 4, 0.05, 'rim glow');
  R(crown, c, 'giltSpecular', 0, 4, 0.05, 'specular');
  R(crown, c, 'giltEdgeGlow', 0, 4, 0.05, 'edge glow');
  R(crown, c, 'giltFlareGlow', 0, 6, 0.05, 'flare glow');
  R(crown, c, 'giltHeatGlow', 0, 4, 0.05, 'heat glow');
  crown.addColor(c, 'colorGiltDeep').name('bronze, deep');
  crown.addColor(c, 'colorGiltBody').name('gold, body');
  crown.addColor(c, 'colorGiltPale').name('gold, pale');
  crown.addColor(c, 'colorGiltHot').name('white-gold');
  R(crown, c, 'flareSparks', 0, 60, 1, 'sparks per ray');
  R(crown, c, 'flareLight', 0, 40, 0.5, 'flare light');

  const star = folder.addFolder('15 · The sun-star');
  R(star, c, 'starSize', 0, 3, 0.01, 'radius (m)');
  R(star, c, 'starDepth', 0.2, 4, 0.05, 'thickness');
  R(star, c, 'starHeight', 0.5, 6, 0.05, 'hangs at (m)');
  R(star, c, 'starRise', 0, 2, 0.01, 'rises after (m)');
  R(star, c, 'starArc', 0, 6, 0.05, 'arc (m)');
  R(star, c, 'starSpinFlight', -40, 40, 0.5, 'spin in flight');
  R(star, c, 'starSpin', -10, 10, 0.05, 'spin after');
  R(star, c, 'starPop', 0, 1, 0.01, 'pop on the beat');
  R(star, c, 'starBob', 0, 0.6, 0.01, 'bob (m)');
  R(star, c, 'starExit', 0.3, 1, 0.01, 'drops from, share of life');
  R(star, c, 'starTrail', 0, 300, 1, 'wake motes / s');

  const sun = folder.addFolder('16 · The sunburst');
  R(sun, c, 'sunFit', 0.3, 2, 0.01, 'reach, × circle');
  R(sun, c, 'sunTurn', 0, 2, 0.01, 'turns with the crown');
  R(sun, c, 'sunOpacity', 0, 1.5, 0.01, 'opacity');
  R(sun, c, 'sunHeat', 0, 3, 0.01, 'heat');
  R(sun, c, 'sunLand', 0.03, 2, 0.01, 'lands in (s)');
  R(sun, c, 'sunErodeStart', 0, 1, 0.01, 'erodes from, share of life');
  R(sun, c, 'sunMotes', 0, 300, 1, 'motes / s');
  sun.addColor(c, 'colorSunBed').name('bed');
  sun.addColor(c, 'colorSunRay').name('rays');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
