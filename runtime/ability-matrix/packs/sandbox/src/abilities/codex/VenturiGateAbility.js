import { Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createVenturiGatePieceGeometry, createVenturiGateHeroGeometry } from '../../assets/codex/VenturiGateGeometry.js';
import {
  createVenturiGateBodyMaterial,
  createVenturiGateLensMaterial,
  createVenturiGateGroundMaterial,
  createVenturiGateVoiceMaterial,
  createVenturiGateDetailMaterial,
  createVenturiGateWallMaterial,
  createVenturiGateScourMaterial
} from '../../materials/codex/VenturiGateMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'venturi';

const TWIST = 'crush';
const ARCH = 'cage';
const HIT = 'in';
const CARRY = 'in';
const WHEN = 'echo';
const ECHO = 'out';
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
const TAU = Math.PI * 2;
const _q = new Quaternion();
const _hand = new Vector3();
const _yAxis = new Vector3(0, 1, 0);

/**
 * VENTURI GATE — wind, zone cast.
 *
 * Wind — a venturi of air bars squeezes the circle, then coughs it out.
 *
 * The bars squeeze first. The cough is a second beat that throws outward after the squeeze.
 *
 * The read is `crush`: hit timing `echo`, blow `in`, carry `in`. A second beat (`out`) lands once the fade has started, for whoever the first beat missed.
 *
 * ## Layers
 *
 *   1. **body** — the crush placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled wind field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a chord riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createVenturiGatePieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createVenturiGateHeroGeometry`), stood by its archetype (cage): dropped from above, then closed inward.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the bars squeeze first. The cough is a second beat that throws outward after the squeeze.
 *  10. **mark** — a felled body is scoured pale: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The gate (the hero, cast-local — sections 14–16 of the editor)
 *
 * The shared template layers (body drum, voice, rig, pieces, template field)
 * are switched off in the config through their own keys; the spell is
 * carried by its own forms:
 *
 *   - **the gust** — a spindle of spinning air (`gust*`) is thrown from the
 *     hand along the aim and dives into the circle as the front arrives,
 *     shedding streaks. As it nears, the foot of the gate already whirls up.
 *   - **the gate** — a venturi of dense, moving air (`gate*`): a lathe wall
 *     with a wide foot on the circle, a pinched throat and a flared mouth,
 *     fluted into air bars, helical bands streaming up it. Dark teal body,
 *     sun-lit, pale crests only on the ridges. It slams up on the beat.
 *   - **the squeeze** — through the impact phase the throat closes from
 *     `gateThroatStart` to `gateThroatEnd` × the circle, accelerating, the
 *     spin and the upward flow speeding with it; floor dust is drawn in
 *     across the circle and streaks spiral up the wall.
 *   - **the cough** — on the echo beat (the same frame the old second hit
 *     lands) the mouth is blown open and up (`cough*`), the wall is torn
 *     away from the top down, a ring of dust rolls out across the floor,
 *     streaks fan out and the camera punches.
 *   - **the scour** — a filled disc on the floor (`scour*`): spiral grooves
 *     that wind tighter as the gate squeezes, then a fan of radial scour
 *     from the cough; it stays through the linger and erodes on noise.
 *
 * All of it is presentation: hits still land on the echo beat exactly as before.
 *
 * Every metre, rate and colour is read from `settings.venturi` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class VenturiGateAbility extends Ability {
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
    this.bodyMaterial = createVenturiGateBodyMaterial();
    this.lensMaterial = createVenturiGateLensMaterial();
    this.groundMaterial = createVenturiGateGroundMaterial();
    this.voiceMaterial = createVenturiGateVoiceMaterial();
    this.detailMaterial = createVenturiGateDetailMaterial();
    this.heroMaterial = createVenturiGateDetailMaterial(true);
    this.detail = new DetailLayer(createVenturiGatePieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createVenturiGateHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._buildGate();
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

  /** The gate's own meshes: the air wall, the gust, the scoured floor. */
  _buildGate() {
    this.wallGeometry = new PlaneGeometry(1, 1, 144, 40);
    this.wallMaterial = createVenturiGateWallMaterial();
    this.wall = this._mesh(this.wallGeometry, this.wallMaterial, LAYER.VFX, 14);
    this.gustMaterial = createVenturiGateWallMaterial();
    this.gust = this._mesh(this.wallGeometry, this.gustMaterial, LAYER.VFX, 15);
    this.scourGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.scourMaterial = createVenturiGateScourMaterial();
    this.scour = this._mesh(this.scourGeometry, this.scourMaterial, LAYER.VFX, 2);
    this.scour.rotation.x = -Math.PI / 2;
    this._wallShape = { r0: 1, r1: 1, r2: 1, height: 1, rise: 0, spin: 0, flare: 0, seed: 0, opacity: 1, flow: 0, dissolve: 0 };
    this._gustShape = { r0: 0.05, r1: 0.4, r2: 0.05, height: 1, rise: 1, spin: 0, flare: 0, seed: 0, opacity: 1, flow: 0, dissolve: 0 };
    this._floor = { radius: 1, land: 0, twist: 0, cough: 0, erode: 0, heat: 0, seed: 0 };
    this._gateSpin = 0;
    this._gateFlow = 0;
    this._gustSpin = 0;
    this._squeeze = 0;
    this._throat = 1;
    this._coughed = false;
    this._inEmitter = new RateEmitter();
    this._riseEmitter = new RateEmitter();
    this._gustEmitter = new RateEmitter();
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** Seconds after the beat the cough lands — the same moment the echo hit fires (fade t = 1.08). */
  get _coughAt() {
    return this.impactDuration + 0.08 * this.fadeDuration;
  }

  /**
   * Stand the gate for this frame: every dimension from settings, every moment
   * from the travel (`u`) or the seconds since the beat.
   */
  _gate(committed, fadeT, dt) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    const coughAt = this._coughAt;
    const R = Math.max(0.3, c.zoneRadius * c.gateFit);
    this.pointAt(1, _end);

    // The foot whirls up as the gust nears; the wall slams up on the beat.
    let rise;
    if (since < 0) rise = c.gateAnticipate * Easing.inQuad(saturate((this.u - 0.5) / 0.5));
    else rise = c.gateAnticipate + (1 - c.gateAnticipate) * Easing.outBack(saturate(since / Math.max(0.03, c.gateRise * L)));
    // The squeeze runs from the slam to the cough, accelerating.
    const sq = since < 0 ? 0 : saturate((since - c.gateRise * L) / Math.max(0.1, coughAt - c.gateRise * L));
    this._squeeze = Easing.inOutCubic(sq);
    const flare = since < coughAt ? 0 : Easing.outCubic(saturate((since - coughAt) / Math.max(0.05, c.coughTime * L)));
    const tear = since < coughAt ? 0 : saturate((since - coughAt - c.coughTime * 0.25 * L) / Math.max(0.05, c.coughTear * L));
    this._throat = c.gateThroatStart + (c.gateThroatEnd - c.gateThroatStart) * this._squeeze;
    const speed = 1 + c.gateSqueezeSpin * this._squeeze + c.coughSpin * flare * (1 - tear);
    this._gateSpin += dt * c.gateSpin * speed * g.animationSpeed;
    this._gateFlow += dt * c.gateFlow * (1 + 1.6 * this._squeeze + 2 * flare) * g.animationSpeed;

    const w = this._wallShape;
    w.r0 = R;
    w.r1 = R * this._throat;
    w.r2 = R * c.gateTop * (1 - 0.25 * this._squeeze);
    w.height = Math.max(0.2, c.gateHeight) * (1 - 0.12 * this._squeeze);
    w.rise = Math.max(0, rise);
    w.spin = this._gateSpin;
    w.flare = flare * c.coughFlare;
    w.seed = this._seed;
    w.flow = this._gateFlow;
    w.opacity = c.gateOpacity * (0.75 + 0.25 * this._squeeze) * (1 - 0.35 * flare);
    w.dissolve = tear;
    const showWall = rise > 0.01 && tear < 0.999 && c.gateOpacity > 0.01;
    this.wall.visible = showWall;
    if (showWall) {
      this.wall.position.set(_end.x, 0, _end.z);
      this.wallMaterial.userData.sync(w);
    }

    // The gust, thrown from the hand and diving into the circle.
    if (!committed && c.gustOpacity > 0.01) {
      _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
      _hand.y = c.handHeight;
      const t = saturate(this.u);
      _pos.lerpVectors(_hand, _end, t);
      _pos.y = _hand.y * (1 - t) + 0.4 * t + c.gustArc * 4 * t * (1 - t);
      // Lay it along its path: the tangent of the arc.
      _dir.subVectors(_end, _hand).setY(0);
      const flat = Math.max(0.01, _dir.length());
      _dir.y = (0.4 - _hand.y) + c.gustArc * 4 * (1 - 2 * t);
      _dir.normalize();
      const len = Math.max(0.1, c.gustLength) * (0.4 + 0.6 * Easing.outCubic(saturate(this.age / 0.15)));
      _q.setFromUnitVectors(_yAxis, _dir);
      this.gust.quaternion.copy(_q);
      this.gust.position.copy(_pos).addScaledVector(_dir, -len);
      this._gustSpin += dt * c.gustSpin * g.animationSpeed;
      const gs = this._gustShape;
      gs.r0 = c.gustRadius * 0.15;
      gs.r1 = c.gustRadius;
      gs.r2 = c.gustRadius * 0.2;
      gs.height = len;
      gs.rise = 1;
      gs.spin = this._gustSpin;
      gs.flare = 0;
      gs.seed = this._seed + 3;
      gs.flow = this._gateFlow * 2 + this.age * 3;
      gs.opacity = c.gustOpacity * (1 - Easing.inQuad(saturate((t - 0.85) / 0.15)));
      gs.dissolve = 0;
      this.gust.visible = true;
      this.gustMaterial.userData.sync(gs);
    } else this.gust.visible = false;

    // The scoured floor.
    const f = this._floor;
    f.radius = Math.max(0.3, c.zoneRadius * c.scourFit);
    f.land = since < 0 ? c.scourTelegraph * saturate((this.u - 0.4) / 0.6) : Math.max(c.scourTelegraph, 1.2 * Easing.outCubic(saturate(since / Math.max(0.03, c.scourLand * L))));
    f.twist = -this._gateSpin * c.scourTwist;
    f.cough = flare;
    const erodeStart = total * c.scourErodeStart;
    f.erode = since < 0 ? 0 : saturate((since - erodeStart) / Math.max(0.1, total - erodeStart));
    f.heat = since < 0 ? 0.3 : Math.exp(-since * 2.2) + 0.4 * flare * (1 - tear);
    f.seed = this._seed;
    const showFloor = c.scourOpacity > 0.01 && f.land > 0.01 && f.erode < 0.999;
    this.scour.visible = showFloor;
    if (showFloor) {
      const span = f.radius * 2.2;
      this.scour.position.set(_end.x, 0.04, _end.z);
      this.scour.scale.set(span, span, 1);
      this.scourMaterial.userData.sync(f);
    }
  }

  /** The gate's own particles: the gust's wake, dust drawn in across the floor, streaks spiralling up the wall. */
  _gateShed(dt, committed) {
    const c = settings[ID];
    const g = settings.global;
    if (!committed) {
      if (!this.gust.visible) return;
      const n = Math.round(this._gustEmitter.tick(dt, c.gustTrail) * g.particleCount);
      if (n > 0) {
        _dir.set(0, 1, 0).applyQuaternion(this.gust.quaternion).multiplyScalar(-1);
        this._fillEmit(this.gust.position, c.gustRadius * 0.6, _dir, c.streakSpeed * 0.5, 0.5, 0.06, c.streakLife, 2);
        this.streaks.emit(n, _emit);
      }
      return;
    }
    if (this._coughed || !this.wall.visible) return;
    const R = Math.max(0.3, c.zoneRadius * c.gateFit);
    this.pointAt(1, _end);
    const nIn = Math.round(this._inEmitter.tick(dt, c.squeezeDust * (0.3 + this._squeeze)) * g.particleCount);
    for (let k = 0; k < nIn; k++) {
      const ang = Math.random() * TAU;
      const r = R * (0.95 + Math.random() * 0.25);
      _pos.set(_end.x + Math.cos(ang) * r, 0.12 + Math.random() * 0.2, _end.z + Math.sin(ang) * r);
      _dir.set(-Math.cos(ang) - Math.sin(ang) * 0.6, 0.08, -Math.sin(ang) + Math.cos(ang) * 0.6);
      this._fillEmit(_pos, 0.15, _dir, c.dustSpeed * 1.3, 0.2, 0.5, c.dustLife * 1.2, 0.4);
      this.dust.emit(1, _emit);
    }
    const nUp = Math.round(this._riseEmitter.tick(dt, c.squeezeStreaks * (0.3 + this._squeeze)) * g.particleCount);
    const H = c.gateHeight;
    for (let k = 0; k < nUp; k++) {
      const ang = Math.random() * TAU;
      const v = Math.random();
      const th = c.gateThroatAt;
      const kk = v < th ? (th - v) / th : (v - th) / (1 - th);
      const r = R * (v < th ? this._throat + (1 - this._throat) * kk * kk : this._throat + (c.gateTop - this._throat) * kk * kk);
      _pos.set(_end.x + Math.cos(ang) * r * 1.03, v * H, _end.z + Math.sin(ang) * r * 1.03);
      _dir.set(-Math.sin(ang), 0.9, Math.cos(ang));
      this._fillEmit(_pos, 0.1, _dir, c.streakSpeed * 0.8, 0.15, 0.06, c.streakLife, 2);
      this.streaks.emit(1, _emit);
    }
  }

  /** The cough: dust rolled out across the floor, streaks fanned out from the throat, chips, a punch. */
  _cough() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = Math.max(0.3, c.zoneRadius * c.gateFit);
    this.pointAt(1, _end);
    this.ctx.shake.add(c.coughShake * power * g.cameraShake, 5, 16);
    this.lightBoost += c.coughLight * power;
    const nd = Math.round(c.coughDust * g.particleCount);
    for (let i = 0; i < nd; i++) {
      const ang = (i / Math.max(1, nd)) * TAU + Math.random() * 0.2;
      _pos.set(_end.x + Math.cos(ang) * R * this._throat, 0.2 + Math.random() * 0.4, _end.z + Math.sin(ang) * R * this._throat);
      _dir.set(Math.cos(ang), 0.1, Math.sin(ang));
      this._fillEmit(_pos, 0.3, _dir, c.dustSpeed * c.coughDustSpeed, 0.15, 0.85, c.dustLife * 1.8, 0.5);
      this.dust.emit(1, _emit);
    }
    const ns = Math.round(c.coughStreaks * g.particleCount);
    for (let i = 0; i < ns; i++) {
      const ang = Math.random() * TAU;
      const y = c.gateHeight * (0.2 + 0.7 * Math.random());
      _pos.set(_end.x + Math.cos(ang) * R * this._throat, y, _end.z + Math.sin(ang) * R * this._throat);
      _dir.set(Math.cos(ang), 0.25 + 0.4 * Math.random(), Math.sin(ang));
      this._fillEmit(_pos, 0.2, _dir, c.streakSpeed * 1.6, 0.12, 0.08, c.streakLife * 1.3, 2);
      this.streaks.emit(1, _emit);
    }
    const nc = Math.round(c.coughChips * g.particleCount * power);
    if (nc > 0) {
      _pos.copy(_end).setY(0.2);
      this._fillEmit(_pos, R * this._throat, _up, c.chipSpeed * 1.4, 0.9, c.chipSize * 1.4, c.chipLife * 1.3, 8);
      this.chips.emit(nc, _emit);
    }
    if (c.coughRing > 0.01) {
      this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
        radius: R * 1.35 * power,
        life: c.shockLife * 1.4,
        width: 0.12,
        intensity: c.coughRing,
        colorA: getColor(c.colorScourDeep),
        colorB: getColor(c.colorGateBody),
        height: 0.035
      });
    }
  }

  _hideGate() {
    this.wall.visible = false;
    this.gust.visible = false;
    this.scour.visible = false;
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
    this.dust = particles.get('venturi.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('venturi.streak', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('venturi.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('venturi.mote', {
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
    this._gateSpin = Math.random() * TAU;
    this._gateFlow = 0;
    this._gustSpin = 0;
    this._squeeze = 0;
    this._throat = settings[ID].gateThroatStart;
    this._coughed = false;
    this._inEmitter.reset();
    this._riseEmitter.reset();
    this._gustEmitter.reset();
    this._hideGate();
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
        _dir.copy(this.direction).addScaledVector(this.side, Math.random() - 0.5).setY(0.15);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? -1.4 : 1.4).setY(0.05);
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
    this._gate(false, 0, dt);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this._gateShed(dt, false);
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
    this._gate(true, t, dt);
    this._palette();
    this._shed(dt, fade * 0.7);
    this._gateShed(dt, true);
    if (WHEN === 'return') this._strike(false);
    if (!this._settled && t > c.aftershockAt) {
      this._settled = true;
      this._aftershock();
    }
    if (ECHO && !this._echoed && t > 1.08) {
      this._echoed = true;
      this._echo();
    }
    if (!this._coughed && t > 1.08) {
      this._coughed = true;
      this._cough();
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
    this._hideGate();
  }

  dispose() {
    this.wallGeometry.dispose();
    this.wallMaterial.dispose();
    this.gustMaterial.dispose();
    this.scourGeometry.dispose();
    this.scourMaterial.dispose();
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
  const folder = gui.addFolder('Venturi Gate');
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

  const mark = folder.addFolder('13 · Mark — scoured pale');
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

  const gate = folder.addFolder('14 · The gate');
  R(gate, c, 'gateFit', 0.3, 1.5, 0.01, 'foot, × circle');
  R(gate, c, 'gateHeight', 0.5, 8, 0.05, 'height (m)');
  R(gate, c, 'gateThroatAt', 0.1, 0.9, 0.01, 'throat height');
  R(gate, c, 'gateThroatStart', 0.1, 1.2, 0.01, 'throat, open');
  R(gate, c, 'gateThroatEnd', 0.05, 1.2, 0.01, 'throat, squeezed');
  R(gate, c, 'gateTop', 0.1, 1.5, 0.01, 'mouth, × circle');
  R(gate, c, 'gateAnticipate', 0, 1, 0.01, 'whirls up before the beat');
  R(gate, c, 'gateRise', 0.03, 1, 0.01, 'slams up in (s)');
  R(gate, c, 'gateFlutes', 0, 24, 1, 'air bars');
  R(gate, c, 'gateFluteDepth', 0, 0.4, 0.005, 'bar depth');
  R(gate, c, 'gateTwist', -4, 4, 0.05, 'twist (rad)');
  R(gate, c, 'gateBands', 1, 20, 1, 'bands');
  R(gate, c, 'gateBandTwist', -6, 6, 0.05, 'band twist');
  R(gate, c, 'gateFlow', 0, 6, 0.05, 'flow');
  R(gate, c, 'gateSpin', -8, 8, 0.05, 'spin (rad/s)');
  R(gate, c, 'gateSqueezeSpin', 0, 8, 0.05, 'spin-up in the squeeze');
  R(gate, c, 'gateOpacity', 0, 1.5, 0.01, 'opacity');
  R(gate, c, 'gateLight', 0, 3, 0.01, 'sun light');
  R(gate, c, 'gateCrest', 0, 4, 0.05, 'crest glow');
  gate.addColor(c, 'colorGateDeep').name('air, deep');
  gate.addColor(c, 'colorGateBody').name('air, body');
  gate.addColor(c, 'colorGateCrest').name('crest');
  R(gate, c, 'squeezeDust', 0, 300, 1, 'dust drawn in / s');
  R(gate, c, 'squeezeStreaks', 0, 400, 1, 'streaks up / s');

  const cough = folder.addFolder('15 · The cough');
  R(cough, c, 'coughFlare', 0, 3, 0.01, 'mouth blown open');
  R(cough, c, 'coughLift', 0, 6, 0.05, 'lift (m)');
  R(cough, c, 'coughTime', 0.05, 2, 0.01, 'blow (s)');
  R(cough, c, 'coughTear', 0.05, 3, 0.01, 'torn away in (s)');
  R(cough, c, 'coughSpin', 0, 8, 0.05, 'spin burst');
  R(cough, c, 'coughDust', 0, 400, 1, 'dust roll');
  R(cough, c, 'coughDustSpeed', 0, 8, 0.05, 'dust roll speed');
  R(cough, c, 'coughStreaks', 0, 600, 1, 'streaks');
  R(cough, c, 'coughChips', 0, 200, 1, 'chips');
  R(cough, c, 'coughShake', 0, 2, 0.01, 'camera punch');
  R(cough, c, 'coughLight', 0, 40, 0.5, 'light punch');
  R(cough, c, 'coughRing', 0, 1.5, 0.01, 'dust ring decal');

  const scour = folder.addFolder('16 · The scour');
  R(scour, c, 'scourFit', 0.3, 2, 0.01, 'reach, × circle');
  R(scour, c, 'scourArms', 1, 16, 1, 'spiral grooves');
  R(scour, c, 'scourWind', 0, 6, 0.05, 'winding');
  R(scour, c, 'scourTwist', 0, 3, 0.01, 'winds with the gate');
  R(scour, c, 'scourRays', 4, 160, 1, 'cough streaks');
  R(scour, c, 'scourRayAmount', 0, 1.5, 0.01, 'cough scour');
  R(scour, c, 'scourRidge', 0, 1.5, 0.01, 'ridges');
  R(scour, c, 'scourOpacity', 0, 1.5, 0.01, 'opacity');
  R(scour, c, 'scourHeat', 0, 3, 0.01, 'fresh glow');
  R(scour, c, 'scourLand', 0.03, 2, 0.01, 'lands in (s)');
  R(scour, c, 'scourTelegraph', 0, 1, 0.01, 'footprint before the beat');
  R(scour, c, 'scourErodeStart', 0, 1, 0.01, 'erodes from, share of life');
  scour.addColor(c, 'colorScourDeep').name('bed');
  scour.addColor(c, 'colorScourRidge').name('ridge');

  const gust = folder.addFolder('17 · The gust');
  R(gust, c, 'gustLength', 0.1, 6, 0.05, 'length (m)');
  R(gust, c, 'gustRadius', 0.05, 2, 0.01, 'girth (m)');
  R(gust, c, 'gustSpin', -40, 40, 0.5, 'spin (rad/s)');
  R(gust, c, 'gustArc', 0, 4, 0.05, 'arc (m)');
  R(gust, c, 'gustOpacity', 0, 1.5, 0.01, 'opacity');
  R(gust, c, 'gustTrail', 0, 400, 1, 'wake streaks / s');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
