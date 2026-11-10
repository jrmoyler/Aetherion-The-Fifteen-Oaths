import { BufferGeometry, Float32BufferAttribute, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { LineTrail } from './LineTrail.js';
import { createRedshiftLancePieceGeometry, createRedshiftLanceHeroGeometry } from '../../assets/codex/RedshiftLanceGeometry.js';
import {
  createRedshiftLanceBodyMaterial,
  createRedshiftLanceLensMaterial,
  createRedshiftLanceGroundMaterial,
  createRedshiftLanceVoiceMaterial,
  createRedshiftLanceDetailMaterial,
  createRedshiftLanceTrailMaterial,
  createRedshiftLanceScarMaterial,
  createRedshiftLanceSpearMaterial
} from '../../materials/codex/RedshiftLanceMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'redshift';

const TWIST = 'drill';
const ARCH = 'lance';
const HIT = 'slice';
const CARRY = 'none';
const WHEN = 'travel';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = false;
const ZONE = false;
const LIFT = 1;
const SLICE = true;

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
const _zAxis = new Vector3(0, 0, 1);
const _tail = new Vector3();
const _tip = new Vector3();
const _base = new Vector3();
const _span = new Vector3();
const _lq = new Quaternion();

/**
 * The shaft: a fluted rod one unit long along +Z with radius 1 (the shader
 * scales it to metres, tapers it from tail to front and breaks it into
 * segments). Four shallow flutes so the light runs along it in lines.
 */
function createShaftGeometry() {
  const AROUND = 16;
  const ALONG = 160;
  const pos = [];
  const nor = [];
  const ring = (j) => {
    const out = [];
    const z = j / ALONG;
    for (let i = 0; i <= AROUND; i++) {
      const a = (i / AROUND) * TAU;
      const r = 1 + 0.16 * Math.cos(4 * a);
      out.push([Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(a), Math.sin(a)]);
    }
    return out;
  };
  let prev = ring(0);
  for (let j = 1; j <= ALONG; j++) {
    const next = ring(j);
    for (let i = 0; i < AROUND; i++) {
      const q = [prev[i], next[i], next[i + 1], prev[i], next[i + 1], prev[i + 1]];
      for (const v of q) {
        pos.push(v[0], v[1], v[2]);
        nor.push(v[3], v[4], 0);
      }
    }
    prev = next;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  return geometry;
}

/**
 * The head: a four-bladed spearhead one unit long along +Z (base at 0, point
 * at 1) and one unit across: a socket collar, then a leaf-shaped body whose
 * cross-section is drawn out into four thin blades.
 */
function createHeadGeometry() {
  const AROUND = 32;
  const ALONG = 28;
  const radius = (z) => {
    if (z < 0.08) return 0.22 + 0.06 * Math.sin((z / 0.08) * Math.PI);
    if (z < 0.3) return 0.22 + 0.78 * Math.sin(((z - 0.08) / 0.22) * Math.PI * 0.5);
    return Math.pow(1 - (z - 0.3) / 0.7, 0.85);
  };
  const pts = [];
  for (let j = 0; j <= ALONG; j++) {
    const z = j / ALONG;
    const row = [];
    const R = radius(z) * 0.5;
    const blade = z < 0.08 ? 0 : 1;
    for (let i = 0; i <= AROUND; i++) {
      const a = (i / AROUND) * TAU + Math.PI / 4;
      const k = 0.18 + 0.82 * Math.pow(Math.abs(Math.cos(2 * a)), 6) * blade + (1 - blade) * 0.82;
      row.push(new Vector3(Math.cos(a) * R * k, Math.sin(a) * R * k, z));
    }
    pts.push(row);
  }
  const pos = [];
  for (let j = 0; j < ALONG; j++) {
    for (let i = 0; i < AROUND; i++) {
      const a = pts[j][i];
      const b = pts[j + 1][i];
      const c = pts[j + 1][i + 1];
      const d = pts[j][i + 1];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * REDSHIFT LANCE — cosmic, line cast.
 *
 * Cosmic — a lance stretches down the line and redshifts as it goes.
 *
 * The lance stretches, and the colour walks from the core toward the tip. The far end is the hit.
 *
 * The read is `drill`: hit timing `travel`, blow `slice`.
 *
 * ## Layers
 *
 *   1. **body** — the drill placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled cosmic field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createRedshiftLancePieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createRedshiftLanceHeroGeometry`), stood by its archetype (lance): riding the head of the line, rolling about its own axis.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the lance stretches, and the colour walks from the core toward the tip. The far end is the hit.
 *  10. **mark** — a felled body is starred through: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The lance (the hero, cast-local — section 15 of the editor)
 *
 * The shared template layers (body, voice, lens, rig, pieces and the trail
 * ribbon) are turned down in the config; the spell is carried by its own form:
 *
 *   - **the stretch** — a four-bladed spearhead (`createHeadGeometry`) rides
 *     the head of the line while a fluted shaft (`createShaftGeometry`) trails
 *     behind it, low along the line, and stretches as it flies (`lanceStretch*`) — short
 *     leaving the hand, metres long when it lands, still drawing out after.
 *     It is solid blued steel / obsidian, sun-lit and casting its shadow; the
 *     light lives only in a narrow core line down the flutes and along the
 *     blade edges: violet leaving the hand, redder toward the tip, all of it
 *     reddening as it goes (`lanceShift*`), cut by dark absorption bands that
 *     slide tipward.
 *   - **the hit** — at the end the head plunges into the floor (`lancePlunge`)
 *     and the shaft swings up and aside like a landed javelin (`lanceLodge*`):
 *     a red spray back up the line, chips, a crack and the template beat.
 *   - **the linger** — the light goes on shifting to deep red and cooling while
 *     the shaft comes apart into segments (`lanceSegments`, `lanceBreak`) that
 *     drift and settle onto the scar the line has burnt, shedding red embers.
 *   - **exit** — eaten from the tail forward behind a red edge; the head goes
 *     last. The scar and its wake scorches stay on the floor.
 *
 * All of it is presentation: hits still land at the head as it travels.
 *
 * Every metre, rate and colour is read from `settings.redshift` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class RedshiftLanceAbility extends Ability {
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
    this.bodyMaterial = createRedshiftLanceBodyMaterial();
    this.lensMaterial = createRedshiftLanceLensMaterial();
    this.groundMaterial = createRedshiftLanceGroundMaterial();
    this.voiceMaterial = createRedshiftLanceVoiceMaterial();
    this.detailMaterial = createRedshiftLanceDetailMaterial();
    this.heroMaterial = createRedshiftLanceDetailMaterial(true);
    this.detail = new DetailLayer(createRedshiftLancePieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createRedshiftLanceHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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
    this.trailMaterial = createRedshiftLanceTrailMaterial();
    this.scarMaterial = createRedshiftLanceScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);
    this._buildLance();
  }

  /** The lance's own meshes: the fluted shaft and the spearhead. */
  _buildLance() {
    this.shaftGeometry = createShaftGeometry();
    this.headGeometry = createHeadGeometry();
    this.shaftMaterial = createRedshiftLanceSpearMaterial(false);
    this.headMaterial = createRedshiftLanceSpearMaterial(true);
    this.shaft = this._mesh(this.shaftGeometry, this.shaftMaterial, LAYER.SHAPED, 15);
    this.head = this._mesh(this.headGeometry, this.headMaterial, LAYER.SHAPED, 15);
    // Solid matter: sun-lit, casting a shadow that follows the shaped shaft.
    for (const m of [this.shaft, this.head]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.customDepthMaterial = m.material.userData.depth;
    }
    this._lanceP = { len: 1, shift: 0, heat: 1, brk: 0, drift: 0, sink: 0, dissolve: 0, seed: 0 };
    this._headP = { len: 1, shift: 0, heat: 1, brk: 0, drift: 0, sink: 0, dissolve: 0, seed: 0 };
    this._lanceLen = 0;
    this._shift = 0;
    this._plunged = false;
    this._emberEmitter = new RateEmitter();
    this._streamEmitter = new RateEmitter();
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
    this.dust = particles.get('redshift.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('redshift.streak', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('redshift.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('redshift.mote', {
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
    return 1 - f + f * Math.sin(this.age * 9.00);
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
    this.trail.reset();
    this._lanceLen = 0;
    this._shift = 0;
    this._plunged = false;
    this._emberEmitter.reset();
    this._streamEmitter.reset();
    this.shaft.visible = false;
    this.head.visible = false;
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
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
      this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
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
    
    let grow;
    let open;
    let along;
    along = committed ? 1 : u; grow = 1; open = 0.2 + 0.8 * rise;
    let dissolve = 0;
    if (committed && fadeT >= 1) dissolve = saturate((fadeT - 1) * 1.15);
    else if (DISSOLVE_TRAVEL && !committed) dissolve = saturate(u * 0.55);
    const fade = committed && fadeT >= 1 ? 1 - (fadeT - 1) : 1;
    const phrase = committed ? (fadeT < 1 ? 1 : 2) : 0;
    this._groundPose(committed, fadeT);
    this._write(open, grow, along, dissolve, fade, phrase);
    this._lance(committed, fadeT);
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /**
   * Stand the lance for this frame: tail in the hand, head at the front of the
   * line (then plunged into the floor at the end), shaft stretched between.
   */
  _lance(committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    this.pointAt(committed ? 1 : saturate(this.u), _tip);
    let plunge = 0;
    if (committed) plunge = Easing.outCubic(saturate(since / Math.max(0.02, c.lancePlungeTime * L)));
    _tip.y = c.lanceTipHeight * (1 - plunge) - c.lancePlunge * plunge;
    // The tail trails the head, raked up, and the lance stretches as it goes:
    // short leaving the hand, longest once it has landed, still drawing out in the linger.
    const reach = Math.max(0.5, this.front - c.handForward);
    let stretch = committed
      ? c.lanceStretch + c.lanceStretchLinger * saturate(since / Math.max(0.05, total))
      : c.lanceStretchStart + (c.lanceStretch - c.lanceStretchStart) * Easing.outCubic(saturate(this.u));
    stretch = Math.min(stretch, reach);
    // In flight it trails low along the line; once lodged its shaft swings up
    // and over to one side, the way a javelin settles, so it stands as a slash.
    const lodge = committed ? Easing.outBack(saturate(since / Math.max(0.05, c.lanceLodgeTime * L))) : 0;
    const rake = c.lanceRake + (c.lanceLodgeRake - c.lanceRake) * lodge;
    const yaw = c.lanceLodgeYaw * lodge;
    const flat = stretch * Math.cos(rake);
    _tail.copy(_tip).addScaledVector(this.direction, -flat * Math.cos(yaw)).addScaledVector(this.side, flat * Math.sin(yaw));
    _tail.y = Math.max(0.3, Math.max(c.lanceTipHeight * (1 - lodge), _tip.y) + stretch * Math.sin(rake));
    _span.subVectors(_tip, _tail);
    const full = _span.length();
    if (full < 0.05) {
      this.shaft.visible = false;
      this.head.visible = false;
      return;
    }
    _span.divideScalar(full);
    const headLen = Math.min(c.lanceHeadLength, full * 0.6);
    _base.copy(_tip).addScaledVector(_span, -headLen);
    const len = Math.max(0.01, full - headLen * 0.92);
    this._lanceLen = full;
    _lq.setFromUnitVectors(_zAxis, _span);
    // The shift: violet leaving the hand, reddening as it travels and lingers.
    const travelShift = c.lanceShiftTravel * saturate(this.u);
    this._shift = committed ? travelShift + (1 - travelShift) * saturate(since / Math.max(0.05, c.lanceShiftTime * L)) : travelShift;
    const heat = committed ? 1 - c.lanceCool * saturate(since / Math.max(0.05, total)) : 1;
    const brk = committed ? Easing.inOutCubic(saturate((since - c.lanceBreakAt * L) / Math.max(0.05, c.lanceBreakTime * L))) : 0;
    const exitAt = total - Math.max(0.1, c.lanceExit * L);
    const dissolve = committed ? saturate((since - exitAt) / Math.max(0.1, c.lanceExit * L)) * 1.05 : 0;
    const p = this._lanceP;
    p.len = len;
    p.shift = this._shift;
    p.heat = heat;
    p.brk = brk * c.lanceBreak;
    p.drift = brk * c.lanceDrift;
    p.sink = brk * c.lanceSettle;
    p.dissolve = dissolve;
    p.seed = this._seed;
    const h = this._headP;
    h.len = 1;
    h.shift = this._shift;
    h.heat = heat;
    h.brk = 0;
    h.drift = 0;
    h.sink = 0;
    h.dissolve = dissolve;
    h.seed = this._seed;
    this.shaftMaterial.userData.sync(p);
    this.headMaterial.userData.sync(h);
    const on = c.lanceOpacity > 0.01 && dissolve < 1;
    this.shaft.visible = on;
    this.shaft.position.copy(_tail);
    this.shaft.quaternion.copy(_lq);
    this.shaft.scale.set(1, 1, 1);
    this.head.visible = on;
    this.head.position.copy(_base);
    this.head.quaternion.copy(_lq);
    const grow = committed ? 1 : Easing.outCubic(saturate(this.age / 0.12));
    this.head.scale.set(c.lanceHeadWidth * grow, c.lanceHeadWidth * grow, headLen);
  }

  /** The head plunges into the floor: a red spray back up the line, chips, a crack. */
  _lancePlunge() {
    const c = settings[ID];
    const g = settings.global;
    this._plunged = true;
    this.pointAt(1, _pos);
    this.ctx.decals.spawn(DecalType.CRACK, _pos, {
      radius: c.plungeCrack,
      life: c.groundLife * g.lifetime,
      width: 0.6,
      intensity: 0.9,
      colorA: getColor(c.colorRedDeep),
      colorB: getColor(c.colorRedBody),
      height: 0.034
    });
    _pos.y = 0.2;
    const sparks = Math.round(c.plungeSparks * g.particleCount);
    if (sparks > 0) {
      _dir.copy(this.direction).multiplyScalar(-1).setY(0.9);
      this._fillEmit(_pos, 0.3, _dir, c.streakSpeed * 1.4, 0.55, 0.09, c.streakLife * 1.6, 2);
      this.streaks.emit(sparks, _emit);
    }
    const chips = Math.round(c.plungeChips * g.particleCount * g.explosionIntensity);
    if (chips > 0) {
      this._fillEmit(_pos, 0.3, _up, c.chipSpeed * 1.3, 0.7, c.chipSize * 1.5, c.chipLife * 1.2, 8);
      this.chips.emit(chips, _emit);
    }
    const dust = Math.round(c.plungeDust * g.particleCount);
    if (dust > 0) {
      this._fillEmit(_pos, 0.5, _up, c.dustSpeed, 1, 0.6, c.dustLife * 1.4, 0.4);
      this.dust.emit(dust, _emit);
    }
  }

  /** Light streaming tipward along the stretching shaft; red embers off the cooling segments. */
  _lanceShed(dt, committed) {
    const c = settings[ID];
    const g = settings.global;
    if (!this.shaft.visible) return;
    const rate = committed ? c.lanceEmbers * (1 - this._lanceP.dissolve) : c.lanceStream;
    const emitter = committed ? this._emberEmitter : this._streamEmitter;
    const n = Math.round(emitter.tick(dt, rate) * g.particleCount);
    for (let k = 0; k < n; k++) {
      const s = Math.random();
      _pos.copy(_tail).lerp(_base, s);
      if (committed) {
        _pos.y = Math.max(0.1, _pos.y - this._lanceP.sink);
        _dir.set((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4);
        this._fillEmit(_pos, 0.15, _dir, c.moteSpeed * 0.6, 0.6, 0.09, c.moteLife * 1.3, 1);
        this.motes.emit(1, _emit);
      } else {
        this._fillEmit(_pos, 0.1, this.direction, c.streakSpeed * 1.2, 0.08, 0.06, c.streakLife, 0);
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
      st.land = 1;
      st.pre = 0;
      st.heat = 0.85;
      st.erode = 0;
      return;
    }
    st.land = 1;
    st.pre = 0;
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
    this.trailMaterial.userData.sync(st, this.trail, this._travelTime());
    this.scarMaterial.userData.sync(st, this.trail, this._travelTime());
    this.trail.show(this.isActive);
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
        _dir.copy(this.direction).setY(0.35 + Math.random() * 0.4);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.direction).multiplyScalar(-0.4).setY(0.8);
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


  _killDir() {
    _dir.copy(this.direction);
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
    this.ctx.decals.spawn(DecalType.ARC, _end, {
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
   * the floor, and a filled residue decal sized to the strip that stays on the
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
      this.ctx.bursts.spawn(BurstMode.STORM, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
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
      radius: Math.max(0.5, c.groundWidth * c.groundStainReach) * power,
      life: c.groundLife * g.lifetime,
      width: 0.8,
      intensity: c.groundStain,
      colorA: getColor(c.colorGroundStain),
      colorB: getColor(c.colorGroundA),
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.ARC, _end, {
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

  /** Seconds the head takes over the whole line — the trail's clock. */
  _travelTime() {
    return Math.max(0.05, this.length / Math.max(1, settings[ID].speed * settings.global.speed));
  }

  /** Where the head crosses each `wakeSpacing` metre: a scorch decal and a few chips. */
  _wake(point, lane, s) {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(point).setY(0);
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.wakeRadius * (0.8 + 0.4 * Math.random()),
      life: c.wakeLife * g.lifetime,
      width: 0.08,
      intensity: 0.75,
      colorA: getColor(c.colorScarB),
      colorB: getColor(c.colorScarA),
      height: 0.03
    });
    const chips = Math.round(c.wakeChips * g.particleCount);
    if (chips > 0) {
      this._fillEmit(_pos.setY(0.1), 0.25, _up, c.chipSpeed * 0.6, 0.8, c.chipSize, c.chipLife, 3);
      this.chips.emit(chips, _emit);
    }
  }

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this._lanceShed(dt, false);
    this.trail.tick(dt, this._state.along, this._state, c.wakeSpacing);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    this._lancePlunge();
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
    this._lanceShed(dt, true);
    this.trail.tick(dt, 1, this._state, c.wakeSpacing);
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
    this.trail.hide();
    this.shaft.visible = false;
    this.head.visible = false;
  }

  dispose() {
    this.shaftGeometry.dispose();
    this.headGeometry.dispose();
    this.shaftMaterial.dispose();
    this.headMaterial.dispose();
    this.trail.dispose();
    this.trailMaterial.dispose();
    this.scarMaterial.dispose();
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
  const folder = gui.addFolder('Redshift Lance');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'travel (m/s)');
  R(cast, c, 'cooldown', 0, 8, 0.05, 'cooldown');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'impact (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.01, 'fade (s)');
  
  Editor.castAnimation(cast, c);

  const hand = folder.addFolder('0 · Hand');
  R(hand, c, 'handForward', -0.5, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'side (m)');
  R(hand, c, 'handHeight', 0.2, 2.5, 0.01, 'height (m)');
  R(hand, c, 'handFlare', 0, 3, 0.01, 'flare (m)');
  R(hand, c, 'handSparks', 0, 120, 1, 'sparks');
  R(hand, c, 'handMotes', 0, 80, 1, 'motes');

  const shape = folder.addFolder('1 · Shape — drill');
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
  R(hero, c, 'heroMinSpan', 0, 6, 0.05, 'min span (m)');
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

  const mark = folder.addFolder('13 · Mark — starred through');
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

  const trail = folder.addFolder('14 · Trail');
  R(trail, c, 'trailWidth', 0, 3, 0.01, 'ribbon width (m)');
  R(trail, c, 'trailLife', 0.05, 6, 0.05, 'ribbon life (s)');
  R(trail, c, 'trailOpacity', 0, 2, 0.01, 'ribbon opacity');
  R(trail, c, 'trailGlow', 0, 4, 0.01, 'ribbon glow');
  R(trail, c, 'trailCore', 0, 1, 0.01, 'white core');
  R(trail, c, 'trailBreakup', 0, 3, 0.01, 'break-up');
  R(trail, c, 'scarWidth', 0, 4, 0.01, 'scar width (m)');
  R(trail, c, 'scarLife', 0.05, 8, 0.05, 'scar life (s)');
  R(trail, c, 'scarOpacity', 0, 1, 0.01, 'scar opacity');
  R(trail, c, 'scarGlow', 0, 6, 0.05, 'seam glow');
  trail.addColor(c, 'colorScarA').name('seam');
  trail.addColor(c, 'colorScarB').name('bed');
  R(trail, c, 'wakeSpacing', 0, 6, 0.05, 'wake every (m)');
  R(trail, c, 'wakeRadius', 0, 4, 0.01, 'wake decal (m)');
  R(trail, c, 'wakeLife', 0.05, 6, 0.05, 'wake life (s)');
  R(trail, c, 'wakeChips', 0, 40, 1, 'wake chips');

  const lance = folder.addFolder('15 · The lance');
  R(lance, c, 'lanceOpacity', 0, 1, 0.01, 'shown');
  R(lance, c, 'lanceTail', 0.01, 1, 0.005, 'shaft at the hand (m)');
  R(lance, c, 'lanceFront', 0.01, 1, 0.005, 'shaft at the head (m)');
  R(lance, c, 'lanceHeadWidth', 0.05, 3, 0.01, 'head width (m)');
  R(lance, c, 'lanceHeadLength', 0.1, 5, 0.05, 'head length (m)');
  R(lance, c, 'lanceTipHeight', 0, 3, 0.01, 'tip height in flight (m)');
  R(lance, c, 'lanceStretchStart', 0.2, 10, 0.05, 'length leaving the hand (m)');
  R(lance, c, 'lanceStretch', 0.5, 20, 0.05, 'length when it lands (m)');
  R(lance, c, 'lanceStretchLinger', 0, 10, 0.05, 'draws out after (m)');
  R(lance, c, 'lanceRake', -0.4, 1.2, 0.01, 'tail raised in flight (rad; below 0 it trails low)');
  R(lance, c, 'lanceLodgeRake', 0, 1.4, 0.01, 'shaft raised once lodged (rad)');
  R(lance, c, 'lanceLodgeYaw', -1.5, 1.5, 0.01, 'shaft swung aside once lodged (rad)');
  R(lance, c, 'lanceLodgeTime', 0.05, 2, 0.01, 'settles in (s)');
  R(lance, c, 'lancePlunge', 0, 2, 0.01, 'plunges into the floor (m)');
  R(lance, c, 'lancePlungeTime', 0.02, 1, 0.01, 'plunge (s)');
  R(lance, c, 'lanceShiftTravel', 0, 1, 0.01, 'shift reached in flight');
  R(lance, c, 'lanceShiftTime', 0.05, 4, 0.05, 'fully red after (s)');
  R(lance, c, 'lanceGradient', 0, 1, 0.01, 'tip runs redder by');
  R(lance, c, 'lanceCool', 0, 1, 0.01, 'cools by the end');
  R(lance, c, 'lanceGlow', 0, 4, 0.05, 'glow');
  R(lance, c, 'lanceCoreWidth', 0.005, 0.6, 0.005, 'core line width');
  R(lance, c, 'lanceSpecular', 0, 4, 0.05, 'steel glint');
  lance.addColor(c, 'colorLanceSteel').name('steel, deep');
  lance.addColor(c, 'colorLanceSheen').name('steel, sheen');
  R(lance, c, 'lanceLines', 0, 40, 1, 'absorption lines');
  R(lance, c, 'lanceLineDark', 0, 1, 0.01, 'line darkness');
  R(lance, c, 'lanceSegments', 1, 24, 1, 'segments');
  R(lance, c, 'lanceBreakAt', 0, 3, 0.01, 'breaks up after (s)');
  R(lance, c, 'lanceBreakTime', 0.05, 3, 0.01, 'break-up (s)');
  R(lance, c, 'lanceBreak', 0, 1, 0.01, 'gaps');
  R(lance, c, 'lanceDrift', 0, 0.5, 0.005, 'drift down the line');
  R(lance, c, 'lanceSettle', 0, 2, 0.01, 'settles (m)');
  R(lance, c, 'lanceExit', 0.1, 2, 0.01, 'exit (s)');
  lance.addColor(c, 'colorLanceHot').name('violet, hot');
  lance.addColor(c, 'colorLanceTint').name('violet, tint');
  lance.addColor(c, 'colorLanceBody').name('violet, body');
  lance.addColor(c, 'colorLanceDeep').name('violet, deep');
  lance.addColor(c, 'colorRedHot').name('red, hot');
  lance.addColor(c, 'colorRedTint').name('red, tint');
  lance.addColor(c, 'colorRedBody').name('red, body');
  lance.addColor(c, 'colorRedDeep').name('red, deep');
  R(lance, c, 'lanceStream', 0, 400, 1, 'streaming light / s');
  R(lance, c, 'lanceEmbers', 0, 300, 1, 'embers / s');
  R(lance, c, 'plungeSparks', 0, 300, 1, 'plunge sparks');
  R(lance, c, 'plungeChips', 0, 120, 1, 'plunge chips');
  R(lance, c, 'plungeDust', 0, 120, 1, 'plunge dust');
  R(lance, c, 'plungeCrack', 0, 4, 0.05, 'plunge crack (m)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
