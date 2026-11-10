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
import { createPressCagePieceGeometry, createPressCageHeroGeometry } from '../../assets/codex/PressCageGeometry.js';
import {
  createPressCageBodyMaterial,
  createPressCageLensMaterial,
  createPressCageGroundMaterial,
  createPressCageVoiceMaterial,
  createPressCageDetailMaterial,
  createPressCageRamMaterial,
  createPressCageSkidMaterial
} from '../../materials/codex/PressCageMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'presscage';

const TWIST = 'crush';
const ARCH = 'cage';
const HIT = 'out';
const CARRY = 'out';
const WHEN = 'echo';
const ECHO = 'up';
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
/** Press bars the ring can hold; one more instance is the billet they spit. */
const MAX_RAMS = 12;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _q = new Quaternion();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qy = new Quaternion();
const _mx = new Matrix4();
const _scale = new Vector3();
const _axis = new Vector3();
const _radial = new Vector3();
const _hand = new Vector3();
const _target = new Vector3();
const _slot = new Vector3();
const _vel = new Vector3();
const _bx = new Vector3();
const _bz = new Vector3();
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);
const _feet = Array.from({ length: MAX_RAMS }, () => new Vector3());

/** A stable 0..1 die per bar from the cast's seed. */
function dice(i, seed) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * One press bar, one unit tall along +Y with its foot at the origin and its
 * pressing face toward +Z: a forged shaft on a wide shoe, two collars, a
 * bevelled cap, and a broad platen standing proud of the inner face with a
 * centre rib. Flat facets so the sun picks out every machined face.
 */
function createRamGeometry() {
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  // A frustum: bottom rect (bx, bz) at y0, top rect (tx, tz) at y1, centred at (0, z0).
  const block = (bx0, bx1, bz0, bz1, y0, y1, tx0 = bx0, tx1 = bx1, tz0 = bz0, tz1 = bz1) => {
    const b = [[bx0, y0, bz0], [bx1, y0, bz0], [bx1, y0, bz1], [bx0, y0, bz1]];
    const t = [[tx0, y1, tz0], [tx1, y1, tz0], [tx1, y1, tz1], [tx0, y1, tz1]];
    quad(b[0], t[0], t[1], b[1]);
    quad(b[1], t[1], t[2], b[2]);
    quad(b[2], t[2], t[3], b[3]);
    quad(b[3], t[3], t[0], b[0]);
    quad(t[0], t[3], t[2], t[1]);
    quad(b[0], b[1], b[2], b[3]);
  };
  block(-0.7, 0.7, -0.7, 0.75, 0, 0.05, -0.6, 0.6, -0.6, 0.65); // shoe
  block(-0.5, 0.5, -0.5, 0.5, 0.05, 0.9); // shaft
  block(-0.57, 0.57, -0.57, 0.52, 0.28, 0.35); // collar
  block(-0.57, 0.57, -0.57, 0.52, 0.6, 0.67); // collar
  block(-0.55, 0.55, -0.55, 0.55, 0.9, 1.0, -0.3, 0.3, -0.3, 0.3); // cap
  block(-0.75, 0.75, 0.5, 1.0, 0.14, 0.82, -0.75, 0.75, 0.5, 1.0); // platen
  block(-0.12, 0.12, 1.0, 1.18, 0.16, 0.8); // platen rib
  block(-0.75, 0.75, 1.0, 1.1, 0.14, 0.2); // platen lip, bottom
  block(-0.75, 0.75, 1.0, 1.1, 0.76, 0.82); // platen lip, top
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * PRESS CAGE — motion, zone cast.
 *
 * Motion — momentum bars squeeze the circle and spit it upward.
 *
 * The squeeze comes first. The spit upward is the second beat, after the bars have met.
 *
 * The read is `crush`: hit timing `echo`, blow `out`, carry `out`. A second beat (`up`) lands once the fade has started, for whoever the first beat missed.
 *
 * ## Layers
 *
 *   1. **body** — the crush placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled motion field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a chord riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createPressCagePieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createPressCageHeroGeometry`), stood by its archetype (cage): dropped from above, then closed inward.
 *      Hero and pieces are matter: sun-lit, opaque, shadow-casting (LAYER.SHAPED), the ramp as albedo, only hot parts glowing. The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the squeeze comes first. The spit upward is the second beat, after the bars have met.
 *  10. **mark** — a felled body is smeared: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The press (the hero, cast-local — sections 14–15 of the editor)
 *
 * The shared template layers (body, voice, lens, rig, pieces and the template
 * field) are turned down in the config; the spell is carried by its own forms:
 *
 *   - **the volley** — `ramCount` press bars of forged steel (`createRamGeometry`:
 *     a shaft on a wide shoe, collars, a bevelled cap and a broad platen on the
 *     inner face; lit, opaque, shadow-casting) are hurled from the hand lying
 *     along their flight, fanning out, and swing upright as they arrive.
 *   - **the slam** — on the beat they plant in a ring at `ramFit` × the circle:
 *     a dip into the floor, scorch, dust and chips at every shoe.
 *   - **the squeeze** — after a short hold they skid inward with gathering
 *     momentum (`ramAccel`), ploughing a gouge each (hot just behind the shoe),
 *     platens glowing red as the pressure builds, and a billet of crushed
 *     matter is squeezed up out of the floor between them.
 *   - **the spit** — when they meet (the echo beat, where the hits land) the
 *     billet is spat straight up with a jet of chips and sparks, the bars recoil
 *     and topple outward, slamming flat on the floor; the billet falls back.
 *   - **exit** — the fallen bars and the billet are eaten through behind a
 *     hot edge and sink; the gouges and the crushed centre stay to the end.
 *
 * All of it is presentation: the hits still land on the echo beat, as before.
 *
 * Every metre, rate and colour is read from `settings.presscage` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class PressCageAbility extends Ability {
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
    this.bodyMaterial = createPressCageBodyMaterial();
    this.lensMaterial = createPressCageLensMaterial();
    this.groundMaterial = createPressCageGroundMaterial();
    this.voiceMaterial = createPressCageVoiceMaterial();
    this.detailMaterial = createPressCageDetailMaterial();
    this.heroMaterial = createPressCageDetailMaterial(true);
    this.detail = new DetailLayer(createPressCagePieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createPressCageHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._buildPress();
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

  /** The press's own meshes: instanced bars (+ the billet) and the skid floor. */
  _buildPress() {
    this.ramGeometry = createRamGeometry();
    this.ramMaterial = createPressCageRamMaterial();
    this.rams = new InstancedMesh(this.ramGeometry, this.ramMaterial, MAX_RAMS + 1);
    const attr = new InstancedBufferAttribute(new Float32Array((MAX_RAMS + 1) * 4), 4);
    attr.setUsage(DynamicDrawUsage);
    this.ramGeometry.setAttribute('aBar', attr);
    this.rams.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rams.layers.set(LAYER.SHAPED);
    this.rams.castShadow = true;
    this.rams.receiveShadow = true;
    this.rams.frustumCulled = false;
    this.rams.renderOrder = 14;
    this.rams.visible = false;
    this.group.add(this.rams);
    this.skidGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.skidMaterial = createPressCageSkidMaterial();
    this.skid = this._mesh(this.skidGeometry, this.skidMaterial, LAYER.VFX, 2);
    this.skid.rotation.x = -Math.PI / 2;
    this._ramSpin = 0;
    this._ramNow = 1; // metres from the centre the bars have reached (deepest)
    this._ramR = 1;
    this._skidHeat = 0;
    this._pressHeat = 0;
    this._crush = 0;
    this._billetY = -1;
    this._spat = false;
    this._fell = false;
    this._skidAlpha = 0;
    this._trailEmitter = new RateEmitter();
    this._skidEmitter = new RateEmitter();
    this._skidUniforms = { centre: new Vector3(), outer: 1, start: 1, now: 1, count: 8, spin: 0, heat: 0, crush: 0, alpha: 0, seed: 0 };
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
    this.dust = particles.get('presscage.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('presscage.streak', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('presscage.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('presscage.mote', {
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
    return 1 - f + f * Math.sin(this.age * 5.00);
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
    this._ramSpin = Math.random() * TAU;
    this._ramNow = settings[ID].zoneRadius * settings[ID].ramFit;
    this._ramR = this._ramNow;
    this._skidHeat = 0;
    this._pressHeat = 0;
    this._crush = 0;
    this._billetY = -1;
    this._spat = false;
    this._fell = false;
    this._skidAlpha = 0;
    this._trailEmitter.reset();
    this._skidEmitter.reset();
    for (let i = 0; i < MAX_RAMS; i++) _feet[i].set(0, 0, 0);
    this.rams.visible = false;
    this.skid.visible = false;
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
    this._press(committed, fadeT);
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** Seconds after the beat the echo (the spit) lands: fade progress 1.08. */
  _echoAt() {
    return this.impactDuration + 0.08 * this.fadeDuration;
  }

  /**
   * Stand the press for this frame: every dimension from settings, every
   * moment from the travel (`u`) or the seconds since the beat.
   */
  _press(committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    const echo = this._echoAt();
    const n = Math.max(3, Math.min(MAX_RAMS, Math.round(c.ramCount)));
    const R0 = Math.max(0.5, c.zoneRadius * c.ramFit);
    const Rmin = Math.max(0.2, R0 * c.ramSqueeze);
    const W = Math.max(0.05, c.ramWidth);
    const H = Math.max(0.2, c.ramHeight);
    const D = Math.max(0.05, c.ramDepth);
    this.pointAt(1, _target);
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _hand.y = c.handHeight;

    // The clock of the squeeze, the spit and the exit.
    const hold = c.ramHold * L;
    const k = since < 0 ? 0 : saturate((since - hold) / Math.max(0.1, echo - hold));
    const squeeze = Math.pow(k, Math.max(0.5, c.ramAccel));
    const after = since < echo ? -1 : since - echo;
    const exitAt = total - Math.max(0.1, c.ramExit * L);
    const exit = since < 0 ? 0 : saturate((since - exitAt) / Math.max(0.1, c.ramExit * L));
    let r;
    if (after < 0) r = R0 - (R0 - Rmin) * squeeze;
    else r = Rmin + (R0 * c.ramRecoil - Rmin) * Easing.outBack(saturate(after / Math.max(0.05, c.ramRecoilTime * L)));
    this._ramR = r;
    if (since >= 0 && after < 0) this._ramNow = Math.min(this._ramNow, r);
    const heatDecay = after < 0 ? 1 : Math.exp(-after * 2.2 / L);
    this._skidHeat = since < 0 ? 0 : (after < 0 ? (k > 0 ? 0.35 + 0.65 * squeeze : Math.exp(-since * 4)) : 0.6 * Math.exp(-after * 6 / L));
    this._pressHeat = after < 0 ? Math.pow(squeeze, 1.4) : heatDecay;
    const topple = after < 0 ? 0 : saturate(after / Math.max(0.05, c.ramToppleTime * L));
    let tip = (Math.PI / 2) * topple * topple;
    if (topple >= 1) tip -= c.ramBounce * Math.abs(Math.sin((after - c.ramToppleTime * L) * 14)) * Math.exp(-(after - c.ramToppleTime * L) * 7);
    const lean = after < 0 ? -c.ramLean * squeeze : 0;
    const dip = since < 0 ? 0 : c.ramDip * Math.sin(Math.min(1, since / 0.14) * Math.PI) * Math.exp(-since * 4);
    const attr = this.ramGeometry.getAttribute('aBar');
    let any = false;
    for (let i = 0; i < n; i++) {
      const d = dice(i, this._seed);
      const ang = this._ramSpin + (TAU * i) / n;
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      // Facing in: local +Z → −radial; then tipped about the tangent at the foot.
      _qy.setFromAxisAngle(_up, Math.atan2(-_radial.x, -_radial.z));
      if (!committed) {
        const delay = c.ramStagger * d;
        const p = saturate((this.u - delay) / Math.max(0.05, 1 - delay));
        if (p <= 0) {
          _feet[i].set(0, 0, 0);
          this.rams.setMatrixAt(i, _zero);
          attr.setXYZW(i, d * 10, 0, 0, 0);
          continue;
        }
        const e = Easing.outCubic(p);
        _slot.copy(_target).addScaledVector(_radial, R0);
        _pos.copy(_hand).addScaledVector(this.side, ((i + 0.5) / n - 0.5) * c.ramFan);
        _vel.subVectors(_slot, _pos);
        _pos.lerp(_slot, e);
        _pos.y = _hand.y * (1 - e) + c.ramArc * 4 * p * (1 - p);
        // In flight the bar lies along its path, nose first; it swings upright as it lands.
        _vel.y = 0;
        _bx.copy(_vel).normalize();
        _axis.crossVectors(_up, _bx).normalize();
        _qa.setFromAxisAngle(_axis, Math.PI / 2);
        _qa.multiply(_qy);
        _qb.copy(_qy);
        _q.slerpQuaternions(_qa, _qb, Easing.inOutCubic(saturate((p - 0.45) / 0.55)));
        attr.setXYZW(i, d * 10, 0, 0, 0);
      } else {
        _pos.copy(_target).addScaledVector(_radial, r * (1 + (d - 0.5) * 0.06));
        _axis.set(_radial.z, 0, -_radial.x); // up × radial: tipping +angle sends the top outward
        _qa.setFromAxisAngle(_axis, tip + lean);
        _q.copy(_qa).multiply(_qy);
        _pos.y = -dip - exit * c.ramSink * D + Math.sin(Math.max(0, tip)) * D * 0.5;
        attr.setXYZW(i, d * 10, this._skidHeat, this._pressHeat, exit);
      }
      _feet[i].copy(_pos);
      if (exit >= 0.999) {
        this.rams.setMatrixAt(i, _zero);
        continue;
      }
      any = true;
      _scale.set(W, H, D);
      _m4.compose(_pos, _q, _scale);
      this.rams.setMatrixAt(i, _m4);
    }
    // The billet: squeezed up out of the floor between the platens, spat up, falls back.
    const B = Math.max(0.1, c.billetSize);
    let billet = false;
    if (committed && exit < 0.999 && c.billetSize > 0.01) {
      const rise = c.billetRise * L;
      const gAcc = (2 * c.billetApex) / Math.max(0.01, rise * rise);
      let y;
      let roll = 0;
      if (after < 0) {
        const m = saturate((k - 0.55) / 0.45);
        y = -B * 0.9 * (1 - m * m);
      } else {
        const a = after;
        y = gAcc * rise * a - 0.5 * gAcc * a * a;
        if (y < 0) y = Math.abs(Math.sin(a * 9)) * 0.25 * Math.exp(-(a - 2 * rise) * 5);
        roll = Math.min(a, 2 * rise) * c.billetSpin;
      }
      this._billetY = y;
      if (y > -B * 0.88) {
        billet = true;
        _pos.copy(_target);
        _pos.y = y - exit * c.ramSink * B;
        _axis.set(Math.sin(this._seed * 3), 0.4, Math.cos(this._seed * 3)).normalize();
        _q.setFromAxisAngle(_axis, roll);
        _scale.set(B, B * 0.75, B * 0.8);
        _m4.compose(_pos, _q, _scale);
        this.rams.setMatrixAt(n, _m4);
        attr.setXYZW(n, 7.3, 0.6 * this._pressHeat, Math.max(this._pressHeat, 0.5 * heatDecay), exit);
      }
    }
    if (!billet) this.rams.setMatrixAt(n, _zero);
    this.rams.count = n + 1;
    this.rams.visible = any || billet;
    this.rams.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
    this.ramMaterial.userData.sync();

    // The floor: scoured stain, gouges, crushed centre.
    if (committed && c.skidOpacity > 0.01) {
      const press = Easing.outCubic(saturate(since / 0.2));
      const fadeOut = 1 - saturate((since - (total - c.skidFade * L)) / Math.max(0.05, c.skidFade * L));
      this._skidAlpha = press * fadeOut;
      this._crush = after < 0 ? 0 : Easing.outCubic(saturate(after / 0.25));
      const outer = R0 * c.skidReach;
      const p = this._skidUniforms;
      p.centre.copy(_target);
      p.outer = outer;
      p.start = R0;
      p.now = this._ramNow;
      p.count = n;
      p.spin = this._ramSpin;
      p.heat = this._skidHeat;
      p.crush = this._crush;
      p.alpha = this._skidAlpha;
      p.seed = this._seed;
      this.skid.visible = this._skidAlpha > 0.01;
      this.skid.position.set(_target.x, 0.03, _target.z);
      this.skid.scale.set(outer * 2, outer * 2, 1);
      this.skidMaterial.userData.sync(p);
    } else {
      this._skidAlpha = 0;
      this.skid.visible = false;
    }
  }

  /** The bars plant: a scorch under every shoe, chips and dust thrown out. */
  _ramSlam() {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(3, Math.min(MAX_RAMS, Math.round(c.ramCount)));
    for (let i = 0; i < n; i++) {
      _pos.copy(_feet[i]).setY(0);
      if (c.shoeScorch > 0.01) {
        this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
          radius: c.shoeScorch,
          life: c.groundLife * g.lifetime,
          width: 0.7,
          intensity: 0.9,
          colorA: getColor(c.colorSkidDeep),
          colorB: getColor(c.colorRamRim),
          height: 0.028
        });
      }
      this._ramKick(i, c.shoeDust, c.shoeChips, 1);
    }
  }

  /** Dust and chips off bar `i`'s shoe; `out` 1 throws them outward, −1 inward. */
  _ramKick(i, dust, chips, out) {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _target);
    _radial.subVectors(_feet[i], _target).setY(0);
    if (_radial.lengthSq() < 1e-6) _radial.copy(this.direction);
    _radial.normalize();
    _pos.copy(_feet[i]).setY(0.1);
    const nd = Math.round(dust * g.particleCount);
    if (nd > 0) {
      _dir.copy(_radial).multiplyScalar(out).setY(0.25);
      this._fillEmit(_pos, 0.25, _dir, c.dustSpeed * 1.2, 0.5, 0.55, c.dustLife * 1.3, 0.4);
      this.dust.emit(nd, _emit);
    }
    const nc = Math.round(chips * g.particleCount * g.explosionIntensity);
    if (nc > 0) {
      _dir.copy(_radial).multiplyScalar(out).setY(1.4);
      this._fillEmit(_pos, 0.15, _dir, c.chipSpeed, 0.6, c.chipSize * 1.5, c.chipLife, 8);
      this.chips.emit(nc, _emit);
    }
  }

  /** The press meets and spits: the billet goes up on a jet of chips and sparks. */
  _spit() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._spat = true;
    this.pointAt(1, _target);
    this.ctx.shake.add(c.spitShake * power * g.cameraShake, 5, 18);
    this.lightBoost += c.spitLight * power;
    _pos.copy(_target).setY(0.3);
    const chips = Math.round(c.spitChips * g.particleCount * power);
    if (chips > 0) {
      this._fillEmit(_pos, 0.4, _up, c.spitSpeed, 0.28, c.chipSize * 1.6, c.chipLife * 1.6, 9);
      this.chips.emit(chips, _emit);
    }
    const sparks = Math.round(c.spitSparks * g.particleCount);
    if (sparks > 0) {
      this._fillEmit(_pos, 0.3, _up, c.spitSpeed * 1.4, 0.22, 0.08, c.streakLife * 1.5, 2);
      this.streaks.emit(sparks, _emit);
    }
    const dust = Math.round(c.spitDust * g.particleCount);
    for (let i = 0; i < dust; i++) {
      const a = (i / Math.max(1, dust)) * TAU;
      _dir.set(Math.cos(a), 0.2, Math.sin(a));
      this._fillEmit(_pos, 0.5, _dir, c.dustSpeed * 1.8, 0.3, 0.65, c.dustLife * 1.5, 0.4);
      this.dust.emit(1, _emit);
    }
    if (c.crushRadius > 0.01) {
      this.ctx.decals.spawn(DecalType.CRACK, _target, {
        radius: c.crushRadius * 1.6,
        life: c.groundLife * g.lifetime,
        width: 0.6,
        intensity: 0.9,
        colorA: getColor(c.colorSkidDeep),
        colorB: getColor(c.colorRamRim),
        height: 0.034
      });
    }
  }

  /** The bars slam flat: dust along each, a thud. */
  _ramFall() {
    const c = settings[ID];
    const g = settings.global;
    this._fell = true;
    this.ctx.shake.add(c.fallShake * g.cameraShake * g.explosionIntensity, 4, 14);
    const n = Math.max(3, Math.min(MAX_RAMS, Math.round(c.ramCount)));
    for (let i = 0; i < n; i++) this._ramKick(i, c.fallDust, 0, 1);
  }

  /** Motion lines behind the flying bars; skid sparks and grit off the shoes in the squeeze. */
  _ramShed(dt, committed) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(3, Math.min(MAX_RAMS, Math.round(c.ramCount)));
    if (!committed) {
      const m = Math.round(this._trailEmitter.tick(dt, c.flightStreaks) * g.particleCount);
      for (let k = 0; k < m; k++) {
        const i = Math.floor(Math.random() * n);
        if (_feet[i].lengthSq() < 1e-6) continue;
        _dir.subVectors(_hand, _feet[i]).setY(0.05);
        _pos.copy(_feet[i]).addScaledVector(_up, c.ramHeight * 0.1);
        this._fillEmit(_pos, c.ramWidth * 0.6, _dir, c.streakSpeed, 0.12, 0.1, c.streakLife, 0);
        this.streaks.emit(1, _emit);
      }
      return;
    }
    if (this._skidHeat <= 0.05 || this._spat) return;
    const m = Math.round(this._skidEmitter.tick(dt, c.skidSparks * this._skidHeat) * g.particleCount);
    for (let k = 0; k < m; k++) {
      const i = Math.floor(Math.random() * n);
      _radial.subVectors(_feet[i], _target).setY(0).normalize();
      _pos.copy(_feet[i]).setY(0.08);
      _dir.copy(_radial).setY(0.6);
      this._fillEmit(_pos, c.ramWidth * 0.5, _dir, c.streakSpeed * 0.7, 0.5, 0.07, c.streakLife, 2);
      this.streaks.emit(1, _emit);
      if (k % 3 === 0) {
        _dir.setY(0.2);
        this._fillEmit(_pos, 0.2, _dir, c.dustSpeed * 0.6, 0.6, 0.45, c.dustLife, 0.4);
        this.dust.emit(1, _emit);
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
        _dir.copy(this.direction).setY(0.2);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? -1 : 1).setY(0.15);
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
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this._ramShed(dt, false);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    this._pose(true, 0);
    this._ramSlam();
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
    this._ramShed(dt, true);
    if (!this._spat && this._since(true, t) >= this._echoAt()) this._spit();
    if (this._spat && !this._fell && this._since(true, t) >= this._echoAt() + c.ramToppleTime * g.lifetime) this._ramFall();
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
    this.rams.visible = false;
    this.skid.visible = false;
  }

  dispose() {
    this.ramGeometry.dispose();
    this.ramMaterial.dispose();
    this.rams.dispose?.();
    this.skidGeometry.dispose();
    this.skidMaterial.dispose();
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
  const folder = gui.addFolder('Press Cage');
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

  const shape = folder.addFolder('1 · Shape — crush');
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

  const mark = folder.addFolder('13 · Mark — smeared');
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

  const press = folder.addFolder('14 · The press');
  R(press, c, 'ramCount', 3, 12, 1, 'bars');
  R(press, c, 'ramWidth', 0.1, 1.5, 0.01, 'bar width (m)');
  R(press, c, 'ramHeight', 0.4, 5, 0.05, 'bar height (m)');
  R(press, c, 'ramDepth', 0.1, 1.5, 0.01, 'bar depth (m)');
  R(press, c, 'ramFit', 0.3, 1.4, 0.01, 'ring, × circle');
  R(press, c, 'ramFan', 0, 6, 0.05, 'fan at the hand (m)');
  R(press, c, 'ramArc', 0, 6, 0.05, 'flight arc (m)');
  R(press, c, 'ramStagger', 0, 0.6, 0.01, 'flight stagger');
  R(press, c, 'ramDip', 0, 1, 0.01, 'slam dip (m)');
  R(press, c, 'ramHold', 0, 1.5, 0.01, 'hold before the squeeze (s)');
  R(press, c, 'ramSqueeze', 0.05, 1, 0.01, 'squeezes to, × ring');
  R(press, c, 'ramAccel', 0.5, 5, 0.05, 'momentum (ease-in power)');
  R(press, c, 'ramLean', 0, 0.6, 0.01, 'lean into the push (rad)');
  R(press, c, 'ramRecoil', 0.1, 1.4, 0.01, 'recoils to, × ring');
  R(press, c, 'ramRecoilTime', 0.05, 1, 0.01, 'recoil (s)');
  R(press, c, 'ramToppleTime', 0.05, 2, 0.01, 'topple (s)');
  R(press, c, 'ramBounce', 0, 0.6, 0.01, 'bounce when flat (rad)');
  R(press, c, 'ramExit', 0.1, 2, 0.01, 'exit (s)');
  R(press, c, 'ramSink', 0, 3, 0.05, 'sinks as it goes, × depth');
  R(press, c, 'ramPressGlow', 0, 6, 0.05, 'platen heat');
  R(press, c, 'ramSkidGlow', 0, 6, 0.05, 'shoe heat');
  R(press, c, 'ramRimGlow', 0, 4, 0.05, 'rim glow');
  R(press, c, 'ramSpecular', 0, 4, 0.05, 'specular');
  press.addColor(c, 'colorRamDeep').name('steel, deep');
  press.addColor(c, 'colorRamBody').name('steel, body');
  press.addColor(c, 'colorRamRim').name('red heat');
  press.addColor(c, 'colorRamHot').name('white-hot');
  R(press, c, 'shoeScorch', 0, 2, 0.01, 'shoe scorch (m)');
  R(press, c, 'shoeDust', 0, 30, 1, 'shoe dust');
  R(press, c, 'shoeChips', 0, 30, 1, 'shoe chips');
  R(press, c, 'flightStreaks', 0, 400, 1, 'flight streaks / s');
  R(press, c, 'skidSparks', 0, 400, 1, 'skid sparks / s');
  R(press, c, 'fallDust', 0, 40, 1, 'dust when flat');
  R(press, c, 'fallShake', 0, 2, 0.01, 'punch when flat');

  const spit = folder.addFolder('15 · The spit and the floor');
  R(spit, c, 'billetSize', 0, 2, 0.01, 'billet (m)');
  R(spit, c, 'billetApex', 0, 8, 0.05, 'spat to (m)');
  R(spit, c, 'billetRise', 0.1, 2, 0.01, 'rise time (s)');
  R(spit, c, 'billetSpin', 0, 20, 0.1, 'tumble (rad/s)');
  R(spit, c, 'spitChips', 0, 200, 1, 'jet chips');
  R(spit, c, 'spitSparks', 0, 300, 1, 'jet sparks');
  R(spit, c, 'spitDust', 0, 120, 1, 'dust roll');
  R(spit, c, 'spitSpeed', 0, 30, 0.1, 'jet speed');
  R(spit, c, 'spitShake', 0, 2, 0.01, 'camera punch');
  R(spit, c, 'spitLight', 0, 40, 0.5, 'light punch');
  R(spit, c, 'crushRadius', 0, 3, 0.01, 'crushed centre (m)');
  R(spit, c, 'skidWidth', 0.5, 3, 0.01, 'gouge, × bar width');
  R(spit, c, 'skidReach', 0.5, 2, 0.01, 'stain, × ring');
  R(spit, c, 'skidGlow', 0, 4, 0.05, 'gouge glow');
  R(spit, c, 'skidOpacity', 0, 1, 0.01, 'opacity');
  R(spit, c, 'skidFade', 0.05, 3, 0.01, 'lets go over (s)');
  spit.addColor(c, 'colorSkidDeep').name('floor, deep');
  spit.addColor(c, 'colorSkidBody').name('floor, body');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
