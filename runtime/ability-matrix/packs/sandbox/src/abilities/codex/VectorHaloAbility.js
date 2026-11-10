import { DynamicDrawUsage, ExtrudeGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Shape, Vector2, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createVectorHaloPieceGeometry, createVectorHaloHeroGeometry } from '../../assets/codex/VectorHaloGeometry.js';
import {
  createVectorHaloBodyMaterial,
  createVectorHaloLensMaterial,
  createVectorHaloGroundMaterial,
  createVectorHaloVoiceMaterial,
  createVectorHaloDetailMaterial,
  createVectorHaloArrowMaterial,
  createVectorHaloSweepMaterial
} from '../../materials/codex/VectorHaloMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'vectorhalo';

const TWIST = 'tangent';
const ARCH = 'halo';
const HIT = 'ring';
const CARRY = 'orbit';
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
/** Vectors the ring can carry (the arrow is instanced once). */
const MAX_VECTORS = 16;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _q = new Quaternion();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _scale = new Vector3();
const _hand = new Vector3();
const _slot = new Vector3();
const _ctrl = new Vector3();
const _at = new Vector3();
const _vel = new Vector3();
const _tan = new Vector3();
const _rad = new Vector3();
const _xAxis = new Vector3(1, 0, 0);
const _zAxis = new Vector3(0, 0, 1);
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);

/** A stable 0..1 die per vector from the cast's seed. */
function dice(i, seed) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Authored half-height of the arrow outline and its extruded depth (both before scaling). */
const ARROW_HALF = 0.3;
const ARROW_DEPTH = 0.13;

/**
 * One vector: a forged arrow one unit long along +X (notched tail at 0, tip
 * at 1), standing in the XY plane — a broad barbed head, a square shaft and
 * a split fletch — extruded with a bevel so its arrises catch the sun.
 * `aEdge` runs 0 at the tail to 1 at the tip (the shader's forge heat).
 */
export function createVectorHaloArrowGeometry() {
  const outline = [
    [1.0, 0], [0.5, 0.3], [0.6, 0.085], [0.24, 0.085], [0.11, 0.21], [-0.03, 0.21], [0.08, 0],
    [-0.03, -0.21], [0.11, -0.21], [0.24, -0.085], [0.6, -0.085], [0.5, -0.3]
  ];
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  const g = new ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.022, bevelSegments: 1, curveSegments: 1, steps: 1 });
  g.translate(-0.5, 0, -0.035);
  const pos = g.getAttribute('position');
  const edge = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) edge[i] = Math.min(1, Math.max(0, (pos.getX(i) + 0.5 - 0.42) / 0.58));
  g.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * VECTOR HALO — force, zone cast.
 *
 * Force — vectors ring the rim and release tangent when the ring locks.
 *
 * Vectors sit on the rim and release tangent when the ring locks. There is no radial throw.
 *
 * The read is `tangent`: hit timing `commit`, blow `ring`, carry `orbit`.
 *
 * ## Layers
 *
 *   1. **body** — the tangent placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled force field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a chord riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createVectorHaloPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createVectorHaloHeroGeometry`), stood by its archetype (halo): held flat on the ground, turning, pulsing on the beat.
 *      Hero and pieces are matter: sun-lit, opaque, shadow-casting (LAYER.SHAPED), the ramp as albedo, only hot parts glowing. The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: vectors sit on the rim and release tangent when the ring locks. There is no radial throw.
 *  10. **mark** — a felled body is bruised: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The vectors (the hero, cast-local — sections 14–15 of the editor)
 *
 * The shared template layers (body, voice, the flat rig ring, the shard
 * pieces, lens) are switched off in the config; the spell is carried by
 * `vectorCount` forged arrows (`createVectorHaloArrowGeometry`, extruded and
 * bevelled; `LAYER.WORLD`, lit, shadows):
 *
 *   - **the stream** — the vectors leave the hand one after another on arcs
 *     and fall into a ring at the rim, banked, nose to tail, which walks
 *     round as it fills.
 *   - **the lock** — on the beat the ring locks: every vector snaps forward
 *     into its slot, tangent, and floods with charge, quivering (`lock*`).
 *   - **the release** — after `lockHold` every vector is released along its
 *     own tangent at once — a pinwheel — and flies out, dipping, streaming
 *     sparks, to stab nose-first into the floor (scorch, chips, dust, a light
 *     and camera tick), where it quivers and cools from ember to iron.
 *   - **the floor** — the disc under the ring is scoured to char and a gouge
 *     is cut along every flight (`createVectorHaloSweepMaterial`).
 *   - **the exit** — the vectors shatter along voronoi cells and sink; the
 *     stain and scorches stay.
 *
 * All of it is presentation: hits still land once, on the beat (`_strike`).
 *
 * Every metre, rate and colour is read from `settings.vectorhalo` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class VectorHaloAbility extends Ability {
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
    this.bodyMaterial = createVectorHaloBodyMaterial();
    this.lensMaterial = createVectorHaloLensMaterial();
    this.groundMaterial = createVectorHaloGroundMaterial();
    this.voiceMaterial = createVectorHaloVoiceMaterial();
    this.detailMaterial = createVectorHaloDetailMaterial();
    this.heroMaterial = createVectorHaloDetailMaterial(true);
    this.detail = new DetailLayer(createVectorHaloPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createVectorHaloHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._buildVectors();
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

  /** The cast-local hero: the instanced vectors and the pinwheel they tear into the floor. */
  _buildVectors() {
    this.arrowGeometry = createVectorHaloArrowGeometry();
    this.arrowMaterial = createVectorHaloArrowMaterial();
    this.arrows = new InstancedMesh(this.arrowGeometry, this.arrowMaterial, MAX_VECTORS);
    const attr = new InstancedBufferAttribute(new Float32Array(MAX_VECTORS * 4), 4);
    attr.setUsage(DynamicDrawUsage);
    this.arrowGeometry.setAttribute('aVec', attr);
    this.arrows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.arrows.layers.set(LAYER.WORLD);
    this.arrows.castShadow = true;
    this.arrows.receiveShadow = true;
    this.arrows.frustumCulled = false;
    this.arrows.visible = false;
    this.group.add(this.arrows);
    this.sweepGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.sweepMaterial = createVectorHaloSweepMaterial();
    this.sweep = this._mesh(this.sweepGeometry, this.sweepMaterial, LAYER.VFX, 2);
    this.sweep.rotation.x = -Math.PI / 2;
    this._landed = new Uint8Array(MAX_VECTORS);
    this._orbit = 0;
    this._ring0 = 0;
    this._landings = 0;
    this._maxOut = 0;
    this._inFlight = 0;
    this._gone = 0;
    this._wakeEmitter = new RateEmitter();
  }

  _hideVectors() {
    this.arrows.visible = false;
    this.sweep.visible = false;
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** Place vector `i` at `pos`, nose along the flat direction `dir`, pitched nose-down by `pitch`, banked by `bank`. */
  _placeArrow(i, pos, dir, pitch, bank, len, span, thick) {
    _qa.setFromAxisAngle(_up, Math.atan2(-dir.z, dir.x));
    _qb.setFromAxisAngle(_zAxis, -pitch);
    _q.copy(_qa).multiply(_qb);
    _qb.setFromAxisAngle(_xAxis, bank);
    _q.multiply(_qb);
    _scale.set(len, span / (2 * ARROW_HALF), thick / ARROW_DEPTH);
    _m4.compose(pos, _q, _scale);
    this.arrows.setMatrixAt(i, _m4);
  }

  /**
   * Fly, ring, lock, release, embed, cool. Before the beat the vectors
   * stream out of the hand one after another on arcs and fall into a ring
   * at the rim, which walks round as it fills. On the beat the ring locks:
   * every vector snaps to its slot, tangent, and glows with charge; it
   * quivers for `lockHold`, then every vector is released along its own
   * tangent at once — a pinwheel — and flies out, dipping, to stab
   * nose-first into the floor where it quivers and cools from ember to
   * iron. On the exit they shatter. The floor under the ring is scoured and
   * the gouges are cut along each flight. All dimensions from settings each
   * frame; the cast keeps its seed, the ring's phase and which have landed.
   */
  _vectors(committed, fadeT, dt) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    this.pointAt(1, _end);
    const n = Math.max(3, Math.min(MAX_VECTORS, Math.round(c.vectorCount)));
    const R = Math.max(0.3, c.zoneRadius * c.ringFit);
    const H = c.ringHeight;
    const len = Math.max(0.1, c.arrowLength);
    const span = Math.max(0.05, c.arrowSpan);
    const thick = Math.max(0.01, c.arrowThick);
    const hold = Math.max(0, c.lockHold * L);
    const flight = Math.max(0.05, c.flightTime * L);
    const exitAt = total - Math.max(0.05, c.vectorExit * L);
    if (!committed) this._orbit += dt * c.ringWalk * g.animationSpeed;
    const attr = this.arrowGeometry.getAttribute('aVec');
    let inFlight = 0;
    let maxOut = 0;
    let any = false;
    const dissolve = since < 0 ? 0 : saturate((since - exitAt) / Math.max(0.05, c.vectorExit * L));
    this._gone = dissolve;
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _hand.y = c.handHeight;
    for (let i = 0; i < n; i++) {
      const d = dice(i, this._seed);
      const slotAng = this._ring0 + this._orbit + (TAU * i) / n;
      _rad.set(Math.cos(slotAng), 0, Math.sin(slotAng));
      _tan.set(-Math.sin(slotAng), 0, Math.cos(slotAng));
      _slot.copy(_end).addScaledVector(_rad, R);
      _slot.y = H;
      let heat = 0;
      let cool = 0;
      if (!committed) {
        // Streamed out of the hand one after another, each on its own arc.
        const leave = c.streamSpread * (i / n);
        const t = saturate((this.u - leave) / Math.max(0.05, c.streamTime));
        if (t <= 0) {
          this.arrows.setMatrixAt(i, _zero);
          attr.setXYZW(i, d * 10, 0, 0, 0);
          continue;
        }
        any = true;
        const e = Easing.outCubic(t);
        _ctrl.addVectors(_hand, _slot).multiplyScalar(0.5);
        _ctrl.addScaledVector(_rad, R * 0.35);
        _ctrl.y = Math.max(_hand.y, H) + c.streamArc;
        // Quadratic bezier and its tangent (the flight direction).
        const a = (1 - e) * (1 - e);
        const b = 2 * (1 - e) * e;
        const cc = e * e;
        _at.set(0, 0, 0).addScaledVector(_hand, a).addScaledVector(_ctrl, b).addScaledVector(_slot, cc);
        _vel.subVectors(_ctrl, _hand).multiplyScalar(2 * (1 - e));
        _pos.subVectors(_slot, _ctrl).multiplyScalar(2 * e);
        _vel.add(_pos);
        // Settle into the tangent as it arrives.
        _vel.y = 0;
        if (_vel.lengthSq() < 1e-6) _vel.copy(_tan);
        _vel.normalize().lerp(_tan, Easing.inQuad(e)).normalize();
        const s = lerp(c.streamScale, 1, e);
        this._placeArrow(i, _at, _vel, 0, c.arrowBank * e, len * s, span * s, thick * s);
        heat = 0.25 + 0.35 * e;
      } else if (since < hold) {
        // Locked: snapped to its slot, tangent, quivering with charge.
        any = true;
        const snap = Easing.outBack(saturate(since / 0.1));
        const q = c.lockQuiver * Math.sin(since * 70 + d * 6) * (0.4 + 0.6 * saturate(since / Math.max(0.01, hold)));
        _at.copy(_slot).addScaledVector(_tan, -c.lockKick * (1 - snap));
        _at.y += q * 0.5;
        this._placeArrow(i, _at, _tan, q, c.arrowBank, len, span, thick);
        heat = 0.6 + 0.4 * saturate(since / Math.max(0.01, hold));
      } else {
        // Released along the tangent: out, dipping, nose-first into the floor.
        any = true;
        const t = saturate((since - hold) / flight);
        if (t < 1) inFlight++;
        const e = t * t * (1.6 - 0.6 * t);
        const reach = c.flightReach;
        _at.copy(_slot).addScaledVector(_tan, reach * e).addScaledVector(_rad, c.flightFlare * reach * e * e);
        const pitchLand = c.embedPitch;
        const pitch = pitchLand * Easing.inQuad(saturate((t - 0.35) / 0.65));
        // Height: a small rise then down so the nose meets the floor at the end.
        const nose = len * 0.5 * Math.sin(pitchLand) - c.embedDepth;
        const yLand = nose;
        _at.y = lerp(H, yLand, Easing.inQuad(t)) + c.flightRise * 4 * t * (1 - t);
        if (t >= 1 && !this._landed[i]) {
          this._landed[i] = 1;
          this._land(i, _at, _tan);
        }
        const after = since - hold - flight;
        const quiver = after > 0 ? c.embedQuiver * Math.exp(-after * 5) * Math.sin(after * 48 + d * 5) : 0;
        // Flight direction bends a little outward with the flare.
        _vel.copy(_tan).addScaledVector(_rad, c.flightFlare * 2 * e).normalize();
        const sink = Easing.inQuad(dissolve) * len * 0.3;
        _at.y -= sink;
        this._placeArrow(i, _at, _vel, pitch + quiver, c.arrowBank * (1 - t), len, span, thick);
        heat = t < 1 ? 1 : Math.exp(-after * c.coolRate / L);
        cool = t < 1 ? 0 : 1 - Math.exp(-after * c.coolRate / L);
        maxOut = Math.max(maxOut, _at.distanceTo(_end));
        if (t < 1) this._streak(dt, _at, _vel);
      }
      attr.setXYZW(i, d * 10, heat, dissolve, cool);
    }
    this._inFlight = inFlight;
    this._maxOut = maxOut;
    this.arrows.count = n;
    this.arrows.visible = any && dissolve < 0.999;
    this.arrows.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
    this.arrowMaterial.userData.sync();

    // The floor: the scoured disc under the ring, and the gouges cut along each flight.
    const reach = c.flightReach;
    const outer = Math.hypot(R + c.flightFlare * reach, reach) + 0.6;
    const fill = committed ? 1 : Easing.outCubic(saturate((this.u - 0.5) / 0.5)) * 0.5;
    const cut = since < hold ? 0 : saturate((since - hold) / flight);
    const fresh = since < 0 ? 0.6 : since < hold + flight ? 1 : Math.exp(-(since - hold - flight) * c.coolRate * 0.6 / L);
    const fadeOut = since < 0 ? 1 : 1 - Easing.inQuad(saturate((since - exitAt) / Math.max(0.05, c.vectorExit * L)));
    if (c.sweepOpacity > 0.01 && fill > 0.01 && fadeOut > 0.001) {
      this.sweep.visible = true;
      this.sweep.position.set(_end.x, 0.03, _end.z);
      this.sweep.scale.set(outer, outer, 1);
      this.sweepMaterial.userData.sync(outer, R, reach, n, this._ring0 + this._orbit, cut, fresh, fill, c.sweepOpacity * fadeOut, this._seed);
    } else this.sweep.visible = false;
  }

  /** Sparks streaming off a vector in flight. */
  _streak(dt, at, dir) {
    const c = settings[ID];
    const g = settings.global;
    const k = Math.round(this._wakeEmitter.tick(dt, c.flightSparks / Math.max(1, Math.round(c.vectorCount))) * g.particleCount);
    if (k <= 0) return;
    _dir.copy(dir).multiplyScalar(-1).setY(0.1);
    this._fillEmit(at, 0.15, _dir, c.streakSpeed * 0.5, 0.25, 0.07, c.streakLife, 2);
    this.streaks.emit(k, _emit);
  }

  /** A vector stabs into the floor: a scorch under it, chips and dust thrown back along its flight, a light tick. */
  _land(i, at, dir) {
    const c = settings[ID];
    const g = settings.global;
    this._landings++;
    _pos.copy(at).addScaledVector(dir, c.arrowLength * 0.45).setY(0);
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.landScorch,
      life: c.groundLife * g.lifetime,
      width: 0.6,
      intensity: 0.9,
      colorA: getColor(c.colorGroundStain),
      colorB: getColor(c.colorArrowBody),
      height: 0.03
    });
    const chips = Math.round(c.landChips * g.particleCount);
    if (chips > 0) {
      _dir.copy(dir).multiplyScalar(-0.6).setY(1);
      this._fillEmit(_pos.setY(0.1), 0.2, _dir, c.chipSpeed, 0.6, c.chipSize * 1.2, c.chipLife, 6);
      this.chips.emit(chips, _emit);
    }
    const dust = Math.round(c.landDust * g.particleCount);
    if (dust > 0) {
      _dir.copy(dir).setY(0.2);
      this._fillEmit(_pos, 0.3, _dir, c.dustSpeed, 0.5, 0.5, c.dustLife, 0.4);
      this.dust.emit(dust, _emit);
    }
    this.lightBoost += c.landLight * g.explosionIntensity / Math.max(1, Math.round(c.vectorCount) * 0.25);
    if (i === 0) this.ctx.shake.add(c.landShake * g.cameraShake * g.explosionIntensity, 4, 16);
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
    this.dust = particles.get('vectorhalo.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('vectorhalo.streak', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('vectorhalo.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('vectorhalo.mote', {
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
    return 1 - f + f * Math.sin(this.age * 11.00);
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
    this._landed.fill(0);
    this._orbit = 0;
    this._ring0 = Math.random() * TAU;
    this._landings = 0;
    this._maxOut = 0;
    this._inFlight = 0;
    this._gone = 0;
    this._wakeEmitter.reset();
    this._hideVectors();
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
        _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? -1.6 : 1.6).setY(0.05);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.direction).setY(0.1);
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
   * low dust shell, real fragments thrown up and out with dust rolled along
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
    this._vectors(false, 0, dt);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
    this._vectors(true, t, dt);
    this._palette();
    this._shed(dt, fade * 0.7);
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
    this._hideVectors();
  }

  dispose() {
    this.arrowGeometry.dispose();
    this.arrowMaterial.dispose();
    this.arrows.dispose();
    this.sweepGeometry.dispose();
    this.sweepMaterial.dispose();
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
  const folder = gui.addFolder('Vector Halo');
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

  const shape = folder.addFolder('1 · Shape — tangent');
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
  R(pieces, c, 'detailRough', 0, 1, 0.01, 'roughness');
  R(pieces, c, 'detailMetal', 0, 1, 0.01, 'metalness');
  R(pieces, c, 'detailShadow', 0, 1, 1, 'cast shadow');
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
  R(hero, c, 'heroRough', 0, 1, 0.01, 'roughness');
  R(hero, c, 'heroMetal', 0, 1, 0.01, 'metalness');
  R(hero, c, 'heroShadow', 0, 1, 1, 'cast shadow');
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

  const mark = folder.addFolder('13 · Mark — bruised');
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

  const vec = folder.addFolder('14 · The vectors (hero)');
  R(vec, c, 'vectorCount', 3, 16, 1, 'vectors');
  R(vec, c, 'ringFit', 0.2, 1.4, 0.01, 'ring, × circle');
  R(vec, c, 'ringHeight', 0.2, 3, 0.01, 'ring height (m)');
  R(vec, c, 'ringWalk', -6, 6, 0.05, 'ring walk (rad/s)');
  R(vec, c, 'arrowLength', 0.3, 4, 0.01, 'length (m)');
  R(vec, c, 'arrowSpan', 0.1, 2, 0.01, 'head span (m)');
  R(vec, c, 'arrowThick', 0.02, 0.5, 0.005, 'thickness (m)');
  R(vec, c, 'arrowBank', -1.5, 1.5, 0.01, 'bank (rad)');
  R(vec, c, 'streamSpread', 0, 0.9, 0.01, 'stream stagger, × travel');
  R(vec, c, 'streamTime', 0.05, 1, 0.01, 'one flight to the ring, × travel');
  R(vec, c, 'streamArc', 0, 5, 0.05, 'stream arc (m)');
  R(vec, c, 'streamScale', 0.1, 1.5, 0.01, 'size leaving the hand');
  R(vec, c, 'lockHold', 0, 1.5, 0.01, 'locked hold (s)');
  R(vec, c, 'lockKick', 0, 2, 0.01, 'lock snap (m)');
  R(vec, c, 'lockQuiver', 0, 0.4, 0.005, 'charged quiver (rad)');
  R(vec, c, 'flightTime', 0.05, 1.5, 0.01, 'release flight (s)');
  R(vec, c, 'flightReach', 0.5, 10, 0.05, 'tangent reach (m)');
  R(vec, c, 'flightFlare', -0.5, 1, 0.01, 'outward flare');
  R(vec, c, 'flightRise', 0, 2, 0.01, 'flight rise (m)');
  R(vec, c, 'flightSparks', 0, 600, 1, 'flight sparks / s');
  R(vec, c, 'embedPitch', 0, 1.4, 0.01, 'embed pitch (rad)');
  R(vec, c, 'embedDepth', 0, 1, 0.01, 'embed depth (m)');
  R(vec, c, 'embedQuiver', 0, 0.5, 0.005, 'embedded quiver (rad)');
  R(vec, c, 'coolRate', 0, 6, 0.05, 'cooling rate');
  R(vec, c, 'vectorExit', 0.05, 2, 0.01, 'shatter (s)');
  R(vec, c, 'landScorch', 0, 3, 0.01, 'landing scorch (m)');
  R(vec, c, 'landChips', 0, 40, 1, 'landing chips');
  R(vec, c, 'landDust', 0, 40, 1, 'landing dust');
  R(vec, c, 'landLight', 0, 20, 0.1, 'landing light');
  R(vec, c, 'landShake', 0, 1, 0.01, 'landing punch');

  const iron = folder.addFolder('15 · Forged iron and the floor');
  R(iron, c, 'arrowSpecular', 0, 4, 0.01, 'specular');
  R(iron, c, 'arrowFresnel', 0, 3, 0.01, 'fresnel');
  R(iron, c, 'arrowAmbient', 0, 1, 0.01, 'ambient');
  R(iron, c, 'arrowEdgeGlow', 0, 6, 0.05, 'forge heat (head)');
  R(iron, c, 'arrowChargeGlow', 0, 6, 0.05, 'charge glow');
  iron.addColor(c, 'colorArrowCore').name('core');
  iron.addColor(c, 'colorArrowTint').name('tint');
  iron.addColor(c, 'colorArrowBody').name('body');
  iron.addColor(c, 'colorArrowDeep').name('deep');
  iron.addColor(c, 'colorArrowIron').name('iron');
  R(iron, c, 'sweepOpacity', 0, 1, 0.01, 'floor opacity');
  R(iron, c, 'gougeWidth', 0.02, 1, 0.01, 'gouge half-width (m)');
  R(iron, c, 'gougeGlow', 0, 4, 0.01, 'gouge glow');
  iron.addColor(c, 'colorGougeChar').name('char');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
