import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createGeodeCagePieceGeometry, createGeodeCageHeroGeometry } from '../../assets/codex/GeodeCageGeometry.js';
import { createGeodeCagePetalGeometry, createGeodeCageSpikeGeometry, createGeodeCageNoduleGeometry } from '../../assets/codex/GeodeCageSignatureGeometry.js';
import {
  createGeodeCageBodyMaterial,
  createGeodeCageLensMaterial,
  createGeodeCageGroundMaterial,
  createGeodeCageVoiceMaterial,
  createGeodeCageDetailMaterial,
  createGeodeCageRockMaterial,
  createGeodeCageFloorMaterial
} from '../../materials/codex/GeodeCageMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'geodecage';

const TWIST = 'seal';
const ARCH = 'cage';
const HIT = 'in';
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

/** Shell petals in the geode (authored into the petal geometry's width). */
const PETALS = 7;
/** Points the geode can fire. */
const MAX_SPIKES = 18;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _rot = new Matrix4();
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _rv = new Vector3();
const _tan = new Vector3();
const _inw = new Vector3();
const _slot = new Vector3();
const _wall = new Vector3();
const _meet = new Vector3();
const _base = new Vector3();
const _handAt = new Vector3();

/**
 * GEODE CAGE — crystal, zone cast.
 *
 * Crystal — a geode seals shut and the inner points fire inward.
 *
 * The shell seals before the points fire. Nothing inside is hit until the cage is closed.
 *
 * The read is `seal`: hit timing `commit`, blow `in`, carry `in`.
 *
 * ## Layers
 *
 *   1. **body** — the seal placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled crystal field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a chord riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createGeodeCagePieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createGeodeCageHeroGeometry`), stood by its archetype (cage): dropped from above, then closed inward.
 *      Hero and pieces are matter: sun-lit, opaque, shadow-casting (LAYER.SHAPED), the ramp as albedo, only hot parts glowing. The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the shell seals before the points fire. Nothing inside is hit until the cage is closed.
 *  10. **mark** — a felled body is glassed over: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The geode (cast-local signature, `14 · Geode` in the editor)
 *
 * The template layers above are switched off through their own keys; what
 * carries the read is a real geode, rock outside and amethyst inside:
 *
 *   - **the throw** — a lumpy rock nodule (`createGeodeCageNoduleGeometry`),
 *     violet crystal glinting through its split waist, tumbles from the hand
 *     on an arc and lands in the middle of the circle.
 *   - **the shell** — on the beat the nodule bursts and seven shell petals
 *     (`createGeodeCagePetalGeometry`: craggy rind outside, a crystal bed set
 *     with amethyst points inside) tear up out of the floor on a ring
 *     (`geodeFit` × the circle), leaning out like a split rock.
 *   - **the seal** — they slam shut over the bodies into a squat dome
 *     (`geodeSquash`) with an oculus at the top; the split seams flare violet.
 *   - **the points fire** — at `geodeFireAt` `spikeCount` amethyst points
 *     (`createGeodeCageSpikeGeometry`) shoot off the inner wall and meet past
 *     the centre; light jets out through the seams and shards spray out of
 *     the oculus.
 *   - **the crack** — at `geodeCrackAt` the shell falls open outward and
 *     slams flat, crystal beds up: the opened geode, with the knot of fired
 *     points standing in the middle, slowly turning while it cools.
 *   - **the exit** — the rock and the points are eaten behind a hot edge
 *     and sink; the cracked crystalline floor lets go last.
 *
 * Every metre, rate and colour is read from `settings.geodecage` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class GeodeCageAbility extends Ability {
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
    this.bodyMaterial = createGeodeCageBodyMaterial();
    this.lensMaterial = createGeodeCageLensMaterial();
    this.groundMaterial = createGeodeCageGroundMaterial();
    this.voiceMaterial = createGeodeCageVoiceMaterial();
    this.detailMaterial = createGeodeCageDetailMaterial();
    this.heroMaterial = createGeodeCageDetailMaterial(true);
    this.detail = new DetailLayer(createGeodeCagePieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createGeodeCageHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
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
    this._buildGeode();
  }

  /** The geode's own meshes: petals, fired points, the thrown nodule and the floor. */
  _buildGeode() {
    this.rockMaterial = createGeodeCageRockMaterial();
    const make = (geometry, count, shadow) => {
      const attr = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aGeo', attr);
      const mesh = new InstancedMesh(geometry, this.rockMaterial, count);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.layers.set(LAYER.SHAPED);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    this.petals = make(createGeodeCagePetalGeometry(PETALS), PETALS, true);
    this.spikes = make(createGeodeCageSpikeGeometry(), MAX_SPIKES, true);
    this.nodule = make(createGeodeCageNoduleGeometry(), 1, true);
    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.floorMaterial = createGeodeCageFloorMaterial();
    this.floor = this._mesh(this.floorGeometry, this.floorMaterial, LAYER.VFX, 2);
    this.floor.rotation.x = -Math.PI / 2;
    this._geo = { roll: 0, sealed: false, fired: false, cracked: false, landed: false, heat: 0, glowAt: 0, knot: 0 };
    this._floorSync = { centre: new Vector3(), outer: 1, ring: 1, land: 0, heat: 0, spill: 0, alpha: 0, seed: 0 };
    this._geoDt = 0;
    this._shardEmitter = new RateEmitter();
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
    this.dust = particles.get('geodecage.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('geodecage.streak', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('geodecage.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('geodecage.mote', {
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
    return 1 - f + f * Math.sin(this.age * 10.00);
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
    this._releaseMarks();
    this._resetGeode();
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
      this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
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
    this._geodePose(committed, fadeT);
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


  _resetGeode() {
    const k = this._geo;
    k.roll = 0;
    k.sealed = false;
    k.fired = false;
    k.cracked = false;
    k.landed = false;
    k.heat = 0;
    k.glowAt = 0;
    k.knot = 0;
    this._geoDt = 0;
    this._shardEmitter.reset();
    this._hideGeode();
  }

  _hideGeode() {
    this.petals.visible = false;
    this.spikes.visible = false;
    this.nodule.visible = false;
    this.floor.visible = false;
  }

  /** Seconds since the beat (negative in flight). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** Point `j` of the geode: where it sits on the inner wall and where the points meet. */
  _spikeEnds(j, n, centre, ring, wall, meet) {
    const c = settings[ID];
    const h = ((j * 7) % n) / n;
    const ang = (j * TAU) / n + 0.37 * Math.sin(j * 12.9898 + this._seed);
    _rv.set(Math.cos(ang), 0, Math.sin(ang));
    wall.copy(centre).addScaledVector(_rv, ring * 0.72).setY((0.35 + 0.5 * h) * ring * c.geodeSquash);
    meet.copy(centre).addScaledVector(_rv, -c.spikeOvershoot * (0.5 + 0.5 * h)).setY(c.spikeHeight + (h - 0.5) * 0.7);
  }

  /** Write one instance: foot at `at`, long axis `ay` (unit), lengths. */
  _setPiece(mesh, i, at, ay, len, width, seed, heat, sink, inner) {
    _bx.set(ay.z, 0, -ay.x);
    if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0);
    _bx.normalize();
    _bz.crossVectors(_bx, ay).normalize();
    _by.copy(ay).multiplyScalar(len);
    _bx.multiplyScalar(width);
    _bz.multiplyScalar(width);
    _m4.makeBasis(_bx, _by, _bz).setPosition(at);
    mesh.setMatrixAt(i, _m4);
    mesh.geometry.getAttribute('aGeo').setXYZW(i, seed, heat, sink, inner);
  }

  /**
   * The geode, every frame: a nodule in flight; on the beat the shell tears
   * up out of the floor leaning out, slams shut, the points fire inward, it
   * cracks open and falls flat, the knot of points turns and cools, it all
   * sinks. Placement is resolved from settings each frame.
   */
  _geodePose(committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const k = this._geo;
    const dt = this._geoDt;
    const since = this._since(committed, fadeT);
    const ring = Math.max(0.4, c.zoneRadius * c.geodeFit);
    const sq = Math.max(0.1, c.geodeSquash);
    this._focusPoint(_focus);
    k.roll += dt * c.noduleSpin * g.animationSpeed;

    if (since < 0) {
      // The throw.
      const u = saturate(this.u);
      _handAt.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
      _handAt.y = c.handHeight;
      _slot.copy(_focus).setY(c.noduleSize * 0.45);
      _pos.copy(_handAt).lerp(_slot, u);
      _pos.y += c.noduleArc * Math.sin(Math.PI * u);
      const size = c.noduleSize * (0.4 + 0.6 * Easing.outCubic(saturate(u / 0.15)));
      _rot.makeRotationAxis(this.side, k.roll);
      _m4.makeRotationY(k.roll * 0.6).premultiply(_rot);
      _m4.scale(_bx.set(size, size, size)).setPosition(_pos);
      this.nodule.setMatrixAt(0, _m4);
      this.nodule.geometry.getAttribute('aGeo').setXYZW(0, this._seed, 0.55 + 0.25 * Math.sin(this.age * 20), 0, 0.8);
      this.nodule.instanceMatrix.needsUpdate = true;
      this.nodule.geometry.getAttribute('aGeo').needsUpdate = true;
      this.nodule.visible = true;
      this.petals.visible = false;
      this.spikes.visible = false;
      this.floor.visible = false;
      this.rockMaterial.userData.sync();
      this._shardTrail(dt, _pos);
      return;
    }
    this.nodule.visible = false;

    // Clocks.
    const rise = saturate(since / Math.max(0.02, c.geodeRise));
    const sealS = saturate((since - c.geodeSealAt) / Math.max(0.02, c.geodeSealTime));
    const fireAt = c.geodeFireAt * this.impactDuration;
    const fireS = saturate((since - fireAt) / Math.max(0.02, c.geodeFireTime));
    const crackSince = this.impactDuration + (c.geodeCrackAt - 1) * this.fadeDuration;
    const fallS = since >= crackSince ? saturate((since - crackSince) / Math.max(0.02, c.geodeFallTime)) : 0;
    const sinkP = committed && fadeT >= 1 ? saturate((fadeT - c.geodeSinkAt) / Math.max(0.05, (2 - c.geodeSinkAt) * 0.85)) : 0;
    if (sealS >= 1 && !k.sealed) {
      k.sealed = true;
      k.heat = 1;
      this._geodeSeal(ring);
    }
    if (fireS > 0 && !k.fired) {
      k.fired = true;
      k.heat = 1.25;
      this._geodeFire(ring);
    }
    if (fallS > 0 && !k.cracked) {
      k.cracked = true;
      k.heat = Math.max(k.heat, 0.9);
    }
    if (fallS >= 1 && !k.landed) {
      k.landed = true;
      this._geodeLand(ring);
    }
    const floorHeat = k.sealed ? 0.3 : 0.15;
    k.heat += (floorHeat - k.heat) * saturate(dt / Math.max(0.05, c.geodeCool));
    if (k.cracked) k.knot += dt * c.spikeTurn * g.animationSpeed;

    // The petals.
    let tilt;
    if (k.cracked) {
      const f = fallS;
      const bounce = f < 1 ? f * f : 1 - 0.06 * Math.exp(-(since - crackSince - c.geodeFallTime) * 7) * Math.abs(Math.sin((since - crackSince - c.geodeFallTime) * 16));
      tilt = -c.geodeFallTilt * bounce;
    } else if (sealS > 0) {
      tilt = -c.geodeOpenTilt * (1 - Easing.inCubic(sealS));
      if (sealS >= 1) tilt = 0.02 * Math.exp(-(since - c.geodeSealAt - c.geodeSealTime) * 9) * Math.sin(since * 50);
    } else {
      tilt = -c.geodeOpenTilt;
    }
    const lift = -ring * sq * 1.05 * (1 - Easing.outCubic(rise)) - sinkP * ring * sq * 0.5;
    const inner = k.cracked ? 1 : 0.35;
    for (let i = 0; i < PETALS; i++) {
      const theta = this._seed + (i * TAU) / PETALS;
      _tan.set(-Math.sin(theta), 0, Math.cos(theta));
      _inw.set(-Math.cos(theta), 0, -Math.sin(theta));
      _by.copy(_up).multiplyScalar(Math.cos(tilt)).addScaledVector(_inw, Math.sin(tilt));
      _bz.copy(_inw).multiplyScalar(Math.cos(tilt)).addScaledVector(_up, -Math.sin(tilt));
      _bx.copy(_tan).multiplyScalar(ring);
      _by.multiplyScalar(ring * sq);
      _bz.multiplyScalar(ring);
      _slot.copy(_focus).addScaledVector(_inw, -ring);
      _slot.y = lift;
      _m4.makeBasis(_bx, _by, _bz).setPosition(_slot);
      this.petals.setMatrixAt(i, _m4);
      this.petals.geometry.getAttribute('aGeo').setXYZW(i, this._seed + i * 1.7, k.heat, sinkP, inner);
    }
    this.petals.instanceMatrix.needsUpdate = true;
    this.petals.geometry.getAttribute('aGeo').needsUpdate = true;
    this.petals.visible = sinkP < 0.999;

    // The fired points.
    const n = Math.max(3, Math.min(MAX_SPIKES, Math.round(c.spikeCount)));
    const L = Math.max(0.2, c.spikeLength);
    for (let j = 0; j < MAX_SPIKES; j++) {
      if (j >= n || fireS <= 0) {
        this.spikes.setMatrixAt(j, _zero);
        continue;
      }
      this._spikeEnds(j, n, _focus, ring, _wall, _meet);
      _dir.copy(_meet).sub(_wall).normalize();
      _base.copy(_meet).addScaledVector(_dir, -L);
      const fp = Easing.outCubic(fireS);
      _pos.copy(_wall).addScaledVector(_dir, -0.2 * L).lerp(_base, fp);
      // The knot turns slowly about the centre once the geode is open.
      if (k.knot !== 0) {
        const ca = Math.cos(k.knot);
        const sa = Math.sin(k.knot);
        const px = _pos.x - _focus.x;
        const pz = _pos.z - _focus.z;
        _pos.x = _focus.x + px * ca - pz * sa;
        _pos.z = _focus.z + px * sa + pz * ca;
        const dx = _dir.x;
        _dir.x = dx * ca - _dir.z * sa;
        _dir.z = dx * sa + _dir.z * ca;
      }
      _pos.y -= sinkP * 1.2;
      const w = c.spikeWidth * (0.75 + 0.5 * (((j * 5) % 7) / 7));
      this._setPiece(this.spikes, j, _pos, _dir, L * (0.3 + 0.7 * fp) * (0.8 + 0.4 * (((j * 3) % 5) / 5)), w, this._seed + j * 2.3, Math.min(1, k.heat + c.spikeGlow), sinkP, 1);
    }
    this.spikes.instanceMatrix.needsUpdate = true;
    this.spikes.geometry.getAttribute('aGeo').needsUpdate = true;
    this.spikes.visible = fireS > 0 && sinkP < 0.999;
    this.rockMaterial.userData.sync();
    this._geodeShed(dt, ring, since, fireAt, sinkP);

    // The floor.
    const p = this._floorSync;
    p.centre.copy(_focus);
    p.outer = c.zoneRadius * c.geodeFloorReach;
    p.ring = ring;
    p.land = 1.2 * Easing.outCubic(saturate(since / Math.max(0.05, c.groundLand)));
    p.heat = k.heat;
    p.spill = k.cracked ? Math.min(1, k.heat) * Easing.outCubic(fallS) : 0;
    p.alpha = fadeT < 1 ? 1 : 1 - saturate((fadeT - c.geodeFloorLetGo) / Math.max(0.05, 2 - c.geodeFloorLetGo));
    p.seed = this._seed;
    this.floorMaterial.userData.sync(p);
    this.floor.position.set(_focus.x, 0.03, _focus.z);
    this.floor.scale.set(p.outer * 2, p.outer * 2, 1);
    this.floor.visible = p.alpha > 0.01 && c.geodeFloorOpacity > 0.01;
  }

  /** Violet glints shed behind the nodule in flight. */
  _shardTrail(dt, at) {
    const c = settings[ID];
    const g = settings.global;
    const sn = Math.round(this._shardEmitter.tick(dt, c.noduleTrail) * g.particleCount);
    if (sn <= 0) return;
    _dir.copy(this.direction).multiplyScalar(-1).setY(0.3);
    this._fillEmit(at, c.noduleSize * 0.3, _dir, c.streakSpeed * 0.3, 0.6, 0.06, c.streakLife, 2);
    this.streaks.emit(sn, _emit);
  }

  /** The shell slams shut: a thud, dust squeezed out at the foot, the seams flare. */
  _geodeSeal(ring) {
    const c = settings[ID];
    const g = settings.global;
    this._focusPoint(_focus);
    this.ctx.shake.add(c.sealShake * g.cameraShake * g.explosionIntensity, 5, 20);
    this.lightBoost += c.sealLight * g.explosionIntensity;
    const dust = Math.round(c.sealDust * g.particleCount);
    for (let i = 0; i < PETALS && dust > 0; i++) {
      const theta = this._seed + ((i + 0.5) * TAU) / PETALS;
      _rv.set(Math.cos(theta), 0, Math.sin(theta));
      _pos.copy(_focus).addScaledVector(_rv, ring).setY(0.15);
      _dir.copy(_rv).setY(0.15);
      this._fillEmit(_pos, 0.3, _dir, c.dustSpeed * 1.2, 0.5, 0.55, c.dustLife * 1.4, 0.4);
      this.dust.emit(dust, _emit);
    }
  }

  /** The points fire: light out through the seams, shards jetted out of the oculus, a crack of the camera. */
  _geodeFire(ring) {
    const c = settings[ID];
    const g = settings.global;
    this._focusPoint(_focus);
    this.ctx.shake.add(c.fireShake * g.cameraShake * g.explosionIntensity, 7, 24);
    this.lightBoost += c.fireLight * g.explosionIntensity;
    const shards = Math.round(c.fireShards * g.particleCount);
    if (shards > 0) {
      _pos.copy(_focus).setY(ring * c.geodeSquash * 0.95);
      this._fillEmit(_pos, 0.4, _up, c.chipSpeed * 1.6, 0.45, c.chipSize * 1.6, c.chipLife * 1.4, 9);
      this.chips.emit(shards, _emit);
      this._fillEmit(_pos, 0.3, _up, c.streakSpeed * 1.4, 0.5, 0.08, c.streakLife * 1.6, 2);
      this.streaks.emit(shards, _emit);
    }
  }

  /** The shell lands flat: dust off every petal. */
  _geodeLand(ring) {
    const c = settings[ID];
    const g = settings.global;
    this._focusPoint(_focus);
    this.ctx.shake.add(c.crackShake * g.cameraShake * g.explosionIntensity, 4, 16);
    const dust = Math.round(c.crackDust * g.particleCount);
    for (let i = 0; i < PETALS && dust > 0; i++) {
      const theta = this._seed + (i * TAU) / PETALS;
      _rv.set(Math.cos(theta), 0, Math.sin(theta));
      _pos.copy(_focus).addScaledVector(_rv, ring * 1.6).setY(0.2);
      _dir.copy(_rv).setY(0.2);
      this._fillEmit(_pos, ring * 0.3, _dir, c.dustSpeed, 0.6, 0.6, c.dustLife * 1.5, 0.4);
      this.dust.emit(dust, _emit);
    }
  }

  /** Glints off the knot while it cools. */
  _geodeShed(dt, ring, since, fireAt, sinkP) {
    const c = settings[ID];
    const g = settings.global;
    if (since < fireAt || sinkP >= 1) return;
    const sn = Math.round(this._shardEmitter.tick(dt, c.knotGlints * (1 - sinkP)) * g.particleCount);
    if (sn <= 0) return;
    this._focusPoint(_focus);
    _pos.copy(_focus).setY(c.spikeHeight);
    this._fillEmit(_pos, c.spikeLength * 0.6, _up, c.moteSpeed, 0.8, 0.07, c.moteLife, 1);
    this.motes.emit(sn, _emit);
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
    this.body.visible = show && c.bodyOpacity > 0.01;
    this.voice.visible = show && c.voiceOpacity > 0.01;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = c.groundOpacity > 0.01 && st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
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
        _dir.set(Math.cos(ang), 0.85, Math.sin(ang));
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.set(Math.cos(ang) * 0.3, 1.4, Math.sin(ang) * 0.3);
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
    this.ctx.decals.spawn(DecalType.FROST, _end, {
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
      this.ctx.bursts.spawn(BurstMode.EARTH, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
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
    this.ctx.decals.spawn(DecalType.FROST, _end, {
      radius: Math.max(0.5, c.zoneRadius * c.groundStainReach) * power,
      life: c.groundLife * g.lifetime,
      width: 0.8,
      intensity: c.groundStain,
      colorA: getColor(c.colorGroundA),
      colorB: getColor(c.colorGroundA),
      height: 0.025
    });
    if (c.shockRing > 0.01) this.ctx.decals.spawn(DecalType.FROST, _end, {
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
    this._geoDt = dt;
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
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
    this._geoDt = dt;
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
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
    this._hideGeode();
  }

  dispose() {
    this.petals.geometry.dispose();
    this.spikes.geometry.dispose();
    this.nodule.geometry.dispose();
    this.rockMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
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
  const folder = gui.addFolder('Geode Cage');
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

  const mark = folder.addFolder('13 · Mark — glassed over');
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

  const geode = folder.addFolder('14 · Geode');
  R(geode, c, 'noduleSize', 0.1, 3, 0.01, 'nodule (m)');
  R(geode, c, 'noduleArc', 0, 8, 0.05, 'throw arc (m)');
  R(geode, c, 'noduleSpin', -30, 30, 0.1, 'tumble (rad/s)');
  R(geode, c, 'noduleTrail', 0, 300, 1, 'trail glints / s');
  R(geode, c, 'geodeFit', 0.2, 1.4, 0.01, 'shell ring (x circle)');
  R(geode, c, 'geodeSquash', 0.2, 1.2, 0.01, 'dome height');
  R(geode, c, 'geodeRise', 0.02, 1.5, 0.01, 'tears up (s)');
  R(geode, c, 'geodeOpenTilt', 0, 1.5, 0.01, 'leans out (rad)');
  R(geode, c, 'geodeSealAt', 0, 1.5, 0.01, 'seals at (s)');
  R(geode, c, 'geodeSealTime', 0.02, 1, 0.01, 'slam (s)');
  R(geode, c, 'geodeFireAt', 0.05, 1, 0.01, 'fires at (impact)');
  R(geode, c, 'geodeFireTime', 0.02, 1, 0.01, 'points cross (s)');
  R(geode, c, 'geodeCrackAt', 0.5, 1.9, 0.01, 'cracks at (phase)');
  R(geode, c, 'geodeFallTime', 0.05, 1.5, 0.01, 'falls (s)');
  R(geode, c, 'geodeFallTilt', 0, 1.6, 0.01, 'falls to (rad)');
  R(geode, c, 'geodeSinkAt', 1, 1.95, 0.01, 'sinks at (fade)');
  R(geode, c, 'geodeCool', 0.05, 4, 0.05, 'cools (s)');
  R(geode, c, 'spikeCount', 3, 18, 1, 'points');
  R(geode, c, 'spikeLength', 0.2, 5, 0.05, 'point length (m)');
  R(geode, c, 'spikeWidth', 0.05, 1, 0.01, 'point width (m)');
  R(geode, c, 'spikeHeight', 0.2, 4, 0.05, 'meet height (m)');
  R(geode, c, 'spikeOvershoot', 0, 3, 0.05, 'overshoot (m)');
  R(geode, c, 'spikeTurn', -3, 3, 0.05, 'knot turn (rad/s)');
  R(geode, c, 'spikeGlow', 0, 1.5, 0.01, 'point glow floor');
  R(geode, c, 'knotGlints', 0, 200, 1, 'knot glints / s');
  R(geode, c, 'geodeSeamGlow', 0, 8, 0.05, 'seam glow');
  R(geode, c, 'geodeCrystalGlow', 0, 8, 0.05, 'crystal glow');
  R(geode, c, 'geodeSpecular', 0, 4, 0.05, 'specular');
  R(geode, c, 'geodeRimGlow', 0, 4, 0.05, 'rim glow');
  geode.addColor(c, 'colorRindDeep').name('rind, deep');
  geode.addColor(c, 'colorRind').name('rind');
  geode.addColor(c, 'colorCrystalBed').name('crystal bed');
  geode.addColor(c, 'colorCrystal').name('amethyst');
  geode.addColor(c, 'colorCrystalGlow').name('glow');
  geode.addColor(c, 'colorCrystalHot').name('glow, hot');
  R(geode, c, 'sealShake', 0, 2, 0.01, 'seal punch');
  R(geode, c, 'sealLight', 0, 40, 0.5, 'seal light');
  R(geode, c, 'sealDust', 0, 30, 1, 'seal dust / seam');
  R(geode, c, 'fireShake', 0, 2, 0.01, 'fire punch');
  R(geode, c, 'fireLight', 0, 40, 0.5, 'fire light');
  R(geode, c, 'fireShards', 0, 300, 1, 'fire shards');
  R(geode, c, 'crackShake', 0, 2, 0.01, 'crack punch');
  R(geode, c, 'crackDust', 0, 30, 1, 'crack dust / petal');

  const geodeFloor = folder.addFolder('15 · Geode floor');
  R(geodeFloor, c, 'geodeFloorOpacity', 0, 1.5, 0.01, 'opacity');
  R(geodeFloor, c, 'geodeFloorGlow', 0, 6, 0.05, 'glow');
  R(geodeFloor, c, 'geodeFloorCell', 0.1, 3, 0.01, 'cell (m)');
  R(geodeFloor, c, 'geodeFloorReach', 0.3, 2, 0.01, 'reach (x circle)');
  R(geodeFloor, c, 'geodeFloorLetGo', 1, 1.95, 0.01, 'lets go at (fade)');
  geodeFloor.addColor(c, 'colorGeodeFloorDeep').name('floor, deep');
  geodeFloor.addColor(c, 'colorGeodeFloor').name('floor');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
