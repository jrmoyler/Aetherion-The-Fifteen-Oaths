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
import { LineTrail } from './LineTrail.js';
import { createDoppelLancePieceGeometry, createDoppelLanceHeroGeometry } from '../../assets/codex/DoppelLanceGeometry.js';
import {
  createDoppelLanceBodyMaterial,
  createDoppelLanceLensMaterial,
  createDoppelLanceGroundMaterial,
  createDoppelLanceVoiceMaterial,
  createDoppelLanceDetailMaterial,
  createDoppelLanceTrailMaterial,
  createDoppelLanceScarMaterial,
  createDoppelRealLanceMaterial,
  createDoppelGhostMaterial
} from '../../materials/codex/DoppelLanceMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'doppel';

const TWIST = 'falsecut';
const ARCH = 'lance';
const HIT = 'slice';
const CARRY = 'none';
const WHEN = 'travel';
const ECHO = null;
const OFFSET = true;
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
const _axisX = new Vector3(1, 0, 0);

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;
/** Panes the decoy can shatter into. */
const MAX_SHARDS = 32;
const TAU = Math.PI * 2;
const GRAVITY = 9.8;
const _tipAt = new Vector3();
const _vec = new Vector3();
const _plant = new Vector3();
const _axisV = new Vector3();
const _scale = new Vector3();
const _m4 = new Matrix4();
const _q = new Quaternion();
const _qa = new Quaternion();
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);
const hash = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/*
 * Cast-local geometry. It lives here, not in the generated
 * `DoppelLanceGeometry.js`, which must stay byte-identical to its rig recipe
 * (tests/pure-rigs.test.mjs).
 */

/**
 * The hero: a drilling lance, one unit long along +Y with its point at the
 * origin. A three-fluted blade twisted `twist` turns along its length (so it
 * reads as a drill when it spins), a flared guard, a wrapped grip and a
 * pommel. Radii are in units of the length. `aRidge` (0..1) marks the flute
 * ridges for the shader.
 */
export function createDrillLanceGeometry(twist = 2.5) {
  const M = 36;
  const stations = [];
  const BLADE = 0.74;
  for (let k = 0; k <= 36; k++) {
    const y = (k / 36) * BLADE;
    const R = 0.092 * Math.pow(Math.min(1, y / BLADE), 0.72);
    stations.push([y, R, true]);
  }
  for (const [y, R] of [[0.748, 0.1], [0.755, 0.122], [0.775, 0.122], [0.785, 0.055], [0.8, 0.04], [0.83, 0.046], [0.85, 0.04], [0.88, 0.046], [0.9, 0.04], [0.93, 0.06], [0.97, 0.06], [0.995, 0.028], [1.0, 0.0]]) stations.push([y, R, false]);
  const pos = [];
  const ridge = [];
  const idx = [];
  for (const [y, R, blade] of stations) {
    const phase = blade ? twist * TAU * (y / BLADE) : 0;
    for (let k = 0; k < M; k++) {
      const th = (k / M) * TAU;
      const f = 0.5 + 0.5 * Math.cos(3 * (th - phase));
      const r = blade ? R * (0.42 + 0.58 * Math.pow(f, 1.4)) : R;
      pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
      ridge.push(blade ? f : 0.35);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < M; k++) {
      const j = (k + 1) % M;
      const a = i * M + k;
      const b = i * M + j;
      const c = (i + 1) * M + k;
      const d = (i + 1) * M + j;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aRidge', new Float32BufferAttribute(ridge, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** One pane of the shattered decoy: a thin chipped triangle, about one unit across. */
export function createDecoyShardGeometry() {
  const tri = [[0, 0.55], [-0.45, -0.35], [0.5, -0.3]];
  const t = 0.04;
  const pos = [];
  const face = (a, b, c) => pos.push(...a, ...b, ...c);
  const top = tri.map(([x, y]) => [x, y, t]);
  const bot = tri.map(([x, y]) => [x, y, -t]);
  face(top[0], top[1], top[2]);
  face(bot[0], bot[2], bot[1]);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    face(top[i], bot[i], bot[j]);
    face(top[i], bot[j], top[j]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * DOPPEL LANCE — illusion, line cast.
 *
 * Illusion — the lance you see is late; the cut is a body-width to the side.
 *
 * The visible lance sits a body-width off the line. The kill is on that offset, not on the aim.
 *
 * The read is `falsecut`: hit timing `travel`, blow `slice`. The kill sits off the aim by the thickness, on purpose.
 *
 * ## Layers
 *
 *   1. **body** — the falsecut placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled illusion field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createDoppelLancePieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createDoppelLanceHeroGeometry`), stood by its archetype (lance): riding the head of the line, rolling about its own axis.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the visible lance sits a body-width off the line. The kill is on that offset, not on the aim.
 *  10. **mark** — a felled body is glamoured: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The upgrade — two lances (cast-local, sections 15–16)
 *
 * The template's pink fan, voice, rig, pieces and ribbon are turned off in
 * the config; the spell is carried by its own forms:
 *
 *  11. **the decoy** — the lance you see: a glamour image of the drill
 *      (`createDoppelGhostMaterial`: dark plum body, hot pink edge, crawling
 *      scanlines, slices stuttering sideways) flies down the aim line, late
 *      (`decoyLate`), drilling as it goes. It kills nothing.
 *  12. **the real lance, unseen** — a body-width to the side, on exactly the
 *      offset the hits use (`_aim`), the real drill cuts down the line as a
 *      rim of heat-haze only (`lanceCloak`); bodies on that offset fall.
 *  13. **the reveal** — on the beat the decoy shatters into `shardCount`
 *      tumbling panes that fall and wink out on the floor, while the real
 *      lance burns into view from the tip back (`createDoppelRealLanceMaterial`,
 *      `createDrillLanceGeometry`: lit dark magenta crystal-steel, three
 *      twisted flutes glowing, `LAYER.WORLD`, shadows) and is slammed down
 *      into the floor at `lancePlantPitch` beside where the decoy died:
 *      cracked floor, chips, dust, shake, light.
 *  14. **the drill** — through the linger it keeps drilling: spinning down
 *      into the floor, slowing, chips and sparks off the flutes.
 *  15. **the exit** — it is eaten from the butt to the tip into glamour motes.
 *
 * Every metre, rate and colour is read from `settings.doppel` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class DoppelLanceAbility extends Ability {
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
    this.bodyMaterial = createDoppelLanceBodyMaterial();
    this.lensMaterial = createDoppelLanceLensMaterial();
    this.groundMaterial = createDoppelLanceGroundMaterial();
    this.voiceMaterial = createDoppelLanceVoiceMaterial();
    this.detailMaterial = createDoppelLanceDetailMaterial();
    this.heroMaterial = createDoppelLanceDetailMaterial(true);
    this.detail = new DetailLayer(createDoppelLancePieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createDoppelLanceHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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
    this.trailMaterial = createDoppelLanceTrailMaterial();
    this.scarMaterial = createDoppelLanceScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this._buildLances();
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);
  }

  /** The two lances and the decoy's panes. */
  _buildLances() {
    const c = settings[ID];
    this._builtTwist = c.lanceTwist;
    this.lanceGeometry = createDrillLanceGeometry(this._builtTwist);
    this.lanceMaterial = createDoppelRealLanceMaterial();
    this.lance = new Mesh(this.lanceGeometry, this.lanceMaterial);
    this.lance.layers.set(LAYER.WORLD);
    this.lance.castShadow = true;
    this.lance.receiveShadow = true;
    this.lance.frustumCulled = false;
    this.lance.renderOrder = 14;
    this.lance.visible = false;
    this.group.add(this.lance);
    this.ghostMaterial = createDoppelGhostMaterial();
    // Two images of the drill: 0 the decoy, 1 the real one while unseen.
    this.ghostGeometry = this.lanceGeometry.clone();
    this._ghostState = new Float32Array(2 * 4);
    this._ghostAttr = new InstancedBufferAttribute(this._ghostState, 4).setUsage(DynamicDrawUsage);
    this.ghostGeometry.setAttribute('aGhost', this._ghostAttr);
    this.ghosts = new InstancedMesh(this.ghostGeometry, this.ghostMaterial, 2);
    this.ghosts.instanceMatrix.setUsage(DynamicDrawUsage);
    this.ghosts.layers.set(LAYER.VFX);
    this.ghosts.renderOrder = 15;
    this.ghosts.frustumCulled = false;
    this.ghosts.visible = false;
    this.group.add(this.ghosts);
    this.shardGeometry = createDecoyShardGeometry();
    this._shardState = new Float32Array(MAX_SHARDS * 4);
    this._shardAttr = new InstancedBufferAttribute(this._shardState, 4).setUsage(DynamicDrawUsage);
    this.shardGeometry.setAttribute('aGhost', this._shardAttr);
    this.shards = new InstancedMesh(this.shardGeometry, this.ghostMaterial, MAX_SHARDS);
    this.shards.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shards.layers.set(LAYER.VFX);
    this.shards.renderOrder = 15;
    this.shards.frustumCulled = false;
    this.shards.visible = false;
    this.shards.count = 0;
    this.group.add(this.shards);
    this._shatterAge = -1;
    this._planted = false;
    this._drillAngle = 0;
    this._lanceRoll = 0;
    this._drillEmitter = new RateEmitter();
    this._exitEmitter = new RateEmitter();
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
    this.dust = particles.get('doppel.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('doppel.streak', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('doppel.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('doppel.mote', {
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
    this.trail.reset();
    this._shatterAge = -1;
    this._planted = false;
    this._drillAngle = 0;
    this._lanceRoll = Math.random() * TAU;
    this._drillEmitter.reset();
    this._exitEmitter.reset();
    this._hideLances();
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
    
    let grow;
    let open;
    let along;
    along = committed ? 1 : u; grow = rise; open = 1;
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
    this.body.visible = show && c.bodyOpacity > 0.01;
    this.voice.visible = show && c.voiceOpacity > 0.01;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = c.groundOpacity > 0.01 && st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
    if (c.trailOpacity <= 0.01 && c.scarOpacity <= 0.01) this.trail.show(false);
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
        _dir.copy(this.side).multiplyScalar(1.2).setY(0.3);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.side).multiplyScalar(-0.8).setY(0.5);
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
      radius: Math.max(0.5, c.groundWidth * c.groundStainReach) * power,
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

  /* ------------------------------------------------------------------ */
  /* The upgrade: the decoy, the real lance, the shatter, the drill      */
  /* ------------------------------------------------------------------ */

  /** Sideways offset of the real cut — the same one the hits use (`_aim`). */
  _offset() {
    return settings[ID].thickness * 4;
  }

  /** Orientation for a lance flying down the line: tip forward, dipped, rolled. */
  _flyPose(roll, lean = 1) {
    const c = settings[ID];
    const p = c.lanceFlightPitch;
    const y = c.lanceFlightYaw * lean;
    _axisV.copy(this.direction).multiplyScalar(-Math.cos(p) * Math.cos(y)).addScaledVector(this.side, Math.cos(p) * Math.sin(y));
    _axisV.y = Math.sin(p);
    _axisV.normalize();
    _q.setFromUnitVectors(_up, _axisV);
    _qa.setFromAxisAngle(_up, roll);
    _q.multiply(_qa);
    return _axisV;
  }

  /** Put ghost instance `i` with its tip at `_tipAt` along the current `_q`. */
  _ghostAt(i, len, mode, alpha, flicker) {
    _scale.set(len, len, len);
    _m4.compose(_tipAt, _q, _scale);
    this.ghosts.setMatrixAt(i, _m4);
    this._ghostState[i * 4] = i * 0.37 + 0.1;
    this._ghostState[i * 4 + 1] = mode;
    this._ghostState[i * 4 + 2] = alpha;
    this._ghostState[i * 4 + 3] = flicker;
  }

  /** The beat: the decoy shatters where the line ends. */
  _shatter() {
    this._shatterAge = this.age;
  }

  /** The real lance is driven in: cracked floor, chips, dust, a punch. */
  _plantHit() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._planted = true;
    this.pointAt(1, _plant).addScaledVector(this.side, this._offset()).setY(0);
    this.ctx.decals.spawn(DecalType.CRACK, _plant, {
      radius: c.plantCrack * power,
      life: c.groundLife * g.lifetime,
      width: 0.7,
      intensity: 0.95,
      colorA: getColor(c.colorLanceDeep),
      colorB: getColor(c.colorLanceTint),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _plant, {
      radius: c.plantCrack * 1.4,
      life: c.shockLife,
      width: 0.1,
      intensity: 0.55,
      colorA: getColor(c.colorDustD),
      colorB: getColor(c.colorDustC),
      height: 0.035
    });
    const chips = Math.round(c.plantChips * g.particleCount * power);
    if (chips > 0) {
      this._fillEmit(_pos.copy(_plant).setY(0.15), 0.3, _up, c.chipSpeed * 1.4, 0.7, c.chipSize * 1.5, c.chipLife * 1.3, 8);
      this.chips.emit(chips, _emit);
    }
    const puffs = Math.round(c.plantDust * g.particleCount);
    for (let k = 0; k < puffs; k++) {
      const ang = (k / Math.max(1, puffs)) * TAU;
      _dir.set(Math.cos(ang), 0.15, Math.sin(ang));
      this._fillEmit(_pos.copy(_plant).setY(0.1), 0.3, _dir, c.dustSpeed * 1.5, 0.3, 0.55, c.dustLife * 1.4, 0.4);
      this.dust.emit(1, _emit);
    }
    this.ctx.shake.add(c.plantShake * power * g.cameraShake, 5, 20);
    this.lightBoost += c.plantLight * power;
  }

  /**
   * Lay out the decoy, the real lance (cloaked, revealed, planted, drilling,
   * dissolving) and the decoy's panes for this frame. `since` is seconds
   * after the beat (−1 while travelling). Allocation-free.
   */
  _lances(dt, since) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    if (c.lanceTwist !== this._builtTwist) this._rebuildLance();
    const len = Math.max(0.2, c.lanceLength);
    const total = this.impactDuration + this.fadeDuration;
    const off = this._offset();
    this._lanceRoll += dt * c.lanceSpin * g.animationSpeed;

    if (since < 0) {
      // In flight: the real one, cloaked, on the offset at the head; the decoy late on the aim.
      const u = this.u;
      this._flyPose(this._lanceRoll);
      this.pointAt(u, _pos).addScaledVector(this.side, off);
      _pos.y = c.lanceHeight;
      _tipAt.copy(_pos).addScaledVector(_axisV, -len * 0.5);
      const grow = saturate(this.age / 0.1);
      this._ghostAt(1, len, 1, c.lanceCloak * grow, 1);
      const sd = Math.pow(u, 1 + 2 * c.decoyLate);
      this._flyPose(this._lanceRoll + 1.3, -1);
      this.pointAt(sd, _pos);
      _pos.y = c.lanceHeight;
      _tipAt.copy(_pos).addScaledVector(_axisV, -len * 0.5);
      this._ghostAt(0, len, 0, grow, 0.4);
      this.ghosts.count = 2;
      this.ghosts.visible = true;
      this.ghosts.instanceMatrix.needsUpdate = true;
      this._ghostAttr.needsUpdate = true;
      this.ghostMaterial.userData.sync(c.decoyScan, c.decoyStutter / len);
      this.lance.visible = false;
      this.shards.visible = false;
      return;
    }

    this.ghosts.visible = false;
    // The real lance: revealed tip-first while it is slammed down beside where the decoy died.
    const tau = this._shatterAge >= 0 ? this.age - this._shatterAge : since;
    const slam = Math.max(0.02, c.lanceSlam * L);
    const k = Easing.outBack(saturate(tau / slam));
    if (!this._planted && tau >= slam) this._plantHit();
    const drillRate = c.lanceDrillSpin * Math.exp(-tau * c.lanceDrillDecay / L);
    this._drillAngle += dt * drillRate * g.animationSpeed;
    // From its flying line to its planted lean: steep, the butt thrown back and out to the side.
    const fp = c.lanceFlightPitch;
    const fy = c.lanceFlightYaw;
    _vec.copy(this.direction).multiplyScalar(-Math.cos(fp) * Math.cos(fy)).addScaledVector(this.side, Math.cos(fp) * Math.sin(fy));
    _vec.y = Math.sin(fp);
    const lean = saturate(c.lancePlantLean);
    _axisV.copy(this.direction).multiplyScalar(-(1 - lean)).addScaledVector(this.side, lean).normalize();
    _axisV.multiplyScalar(Math.cos(c.lancePlantPitch));
    _axisV.y = Math.sin(c.lancePlantPitch);
    _axisV.normalize().sub(_vec).multiplyScalar(k).add(_vec).normalize();
    _q.setFromUnitVectors(_up, _axisV);
    _qa.setFromAxisAngle(_up, this._lanceRoll * (1 - saturate(tau / slam)) + this._drillAngle);
    _q.multiply(_qa);
    this.pointAt(1, _plant).addScaledVector(this.side, off).setY(0);
    // Tip: from the flying point to buried in the floor, then drilling on down its own axis.
    _pos.copy(_plant).addScaledVector(_axisV, -len * 0.5).setY(c.lanceHeight);
    const depth = c.lancePlantDepth + c.lanceDrill * (1 - Math.exp(-Math.max(0, tau - slam) * 0.9 / L));
    _tipAt.copy(_plant).addScaledVector(_axisV, -depth);
    _tipAt.lerpVectors(_pos, _tipAt, saturate(k));
    _scale.set(len * c.lanceGirth, len, len * c.lanceGirth);
    this.lance.position.copy(_tipAt);
    this.lance.quaternion.copy(_q);
    this.lance.scale.copy(_scale);
    const reveal = saturate(tau / Math.max(0.02, c.lanceReveal * L));
    const exit = saturate((since - c.lanceExitAt * total) / Math.max(0.05, total * (1 - c.lanceExitAt)));
    const heat = 0.3 + 0.7 * Math.exp(-tau * 1.2 / L);
    this.lance.visible = exit < 0.999;
    this.lanceMaterial.userData.sync(reveal, exit, heat);

    // Drilling: chips off the floor and sparks off the flutes, slowing with the spin.
    const spin = drillRate / Math.max(0.01, c.lanceDrillSpin);
    if (this._planted && exit < 0.5) {
      const nc = Math.round(this._drillEmitter.tick(dt, c.drillChips * spin) * g.particleCount);
      for (let j = 0; j < nc; j++) {
        const a = Math.random() * TAU;
        _dir.set(Math.cos(a), 1.2, Math.sin(a));
        this._fillEmit(_pos.copy(_plant).setY(0.1), 0.2, _dir, c.chipSpeed, 0.5, c.chipSize, c.chipLife, 8);
        this.chips.emit(1, _emit);
        if (Math.random() < c.drillSparks / Math.max(1, c.drillChips)) {
          this._fillEmit(_pos, 0.15, _dir, c.streakSpeed, 0.6, 0.05, c.streakLife, 2);
          this.streaks.emit(1, _emit);
        }
      }
    }
    // The exit: glamour motes off the eaten edge.
    if (exit > 0.001 && exit < 0.999) {
      const nm = Math.round(this._exitEmitter.tick(dt, c.exitMotes) * g.particleCount);
      for (let j = 0; j < nm; j++) {
        const h = 1 - exit * (0.8 + 0.4 * Math.random());
        _pos.copy(_tipAt).addScaledVector(_axisV, Math.max(0, h) * len);
        this._fillEmit(_pos, 0.15, _up, c.moteSpeed, 0.8, 0.09, c.moteLife, 1);
        this.motes.emit(1, _emit);
      }
    }
    this._shards(tau);
  }

  /** The decoy's panes: burst from where it died, tumble, fall, lie flickering, wink out. */
  _shards(tau) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(0, Math.min(MAX_SHARDS, Math.round(c.shardCount)));
    if (this._shatterAge < 0 || n === 0) {
      this.shards.visible = false;
      return;
    }
    const len = Math.max(0.2, c.lanceLength);
    const life = Math.max(0.05, c.shardLife * g.lifetime);
    this.pointAt(1, _plant);
    let live = 0;
    for (let i = 0; i < n; i++) {
      const r1 = hash(i, 1);
      const r2 = hash(i, 2);
      const r3 = hash(i, 3);
      const along = (r1 - 0.5) * len * 0.8;
      const a = r2 * TAU;
      const sp = c.shardSpeed * (0.4 + 0.6 * r3);
      const vy = c.shardLift * (0.4 + 0.8 * hash(i, 4));
      const y0 = c.lanceHeight + (r3 - 0.5) * 0.3;
      // Ground hit, solved: the pane lies where it lands.
      const tl = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, y0 - 0.04))) / GRAVITY;
      const t = Math.min(tau, tl);
      _pos.copy(_plant).addScaledVector(this.direction, -along);
      _pos.x += Math.cos(a) * sp * t;
      _pos.z += Math.sin(a) * sp * t;
      _pos.y = Math.max(0.04, y0 + vy * t - 0.5 * GRAVITY * t * t);
      _vec.set(hash(i, 5) - 0.5, hash(i, 6) - 0.5, hash(i, 7) - 0.5).normalize();
      const landed = tau >= tl;
      if (landed) _q.setFromAxisAngle(_axisX, Math.PI / 2 + (r1 - 0.5) * 0.3);
      else _q.setFromAxisAngle(_vec, c.shardSpin * t + r2 * TAU);
      const size = c.shardSize * (0.5 + 0.9 * hash(i, 8));
      const fade = 1 - saturate((tau - life * (0.6 + 0.4 * r1)) / 0.2);
      _scale.set(size, size, size);
      _m4.compose(_pos, _q, _scale);
      this.shards.setMatrixAt(i, fade > 0.002 ? _m4 : _zero);
      this._shardState[i * 4] = r1 * 10;
      this._shardState[i * 4 + 1] = 0;
      this._shardState[i * 4 + 2] = fade;
      this._shardState[i * 4 + 3] = landed ? 1 : 0.3;
      if (fade > 0.002) live++;
    }
    this.shards.count = n;
    this.shards.visible = live > 0;
    this.shards.instanceMatrix.needsUpdate = true;
    this._shardAttr.needsUpdate = true;
    this.ghostMaterial.userData.sync(c.decoyScan, c.decoyStutter / len);
  }

  /** The flute twist changed in the editor: rebuild the drill (an editor action, not per frame). */
  _rebuildLance() {
    this._builtTwist = settings[ID].lanceTwist;
    const g = createDrillLanceGeometry(this._builtTwist);
    this.lanceGeometry.dispose();
    this.ghostGeometry.dispose();
    this.lanceGeometry = g;
    this.lance.geometry = g;
    this.ghostGeometry = g.clone();
    this.ghostGeometry.setAttribute('aGhost', this._ghostAttr);
    this.ghosts.geometry = this.ghostGeometry;
  }

  _hideLances() {
    this.lance.visible = false;
    this.ghosts.visible = false;
    this.shards.visible = false;
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
    this.trail.tick(dt, this._state.along, this._state, c.wakeSpacing);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._lances(dt, -1);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._shatter();
    this._beat();
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
    this.trail.tick(dt, 1, this._state, c.wakeSpacing);
    this._lances(dt, t < 1 ? t * this.impactDuration : this.impactDuration + (t - 1) * this.fadeDuration);
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
    this._hideLances();
  }

  dispose() {
    this.lanceGeometry.dispose();
    this.ghostGeometry.dispose();
    this.shardGeometry.dispose();
    this.lanceMaterial.dispose();
    this.ghostMaterial.dispose();
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
  const folder = gui.addFolder('Doppel Lance');
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

  const shape = folder.addFolder('1 · Shape — falsecut');
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

  const mark = folder.addFolder('13 · Mark — glamoured');
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

  const lance = folder.addFolder('15 · The real lance');
  R(lance, c, 'lanceLength', 0.5, 8, 0.05, 'length (m)');
  R(lance, c, 'lanceGirth', 0.3, 3, 0.01, 'girth');
  R(lance, c, 'lanceHeight', 0.3, 3, 0.01, 'flies at (m)');
  R(lance, c, 'lanceFlightPitch', -0.6, 0.8, 0.01, 'dip in flight (rad)');
  R(lance, c, 'lanceFlightYaw', -1.4, 1.4, 0.01, 'lean across in flight (rad)');
  R(lance, c, 'lanceTwist', 0, 6, 0.05, 'flute turns');
  R(lance, c, 'lanceSpin', -60, 60, 0.5, 'drill in flight (rad/s)');
  R(lance, c, 'lanceCloak', 0, 1, 0.01, 'seen while unseen');
  R(lance, c, 'lanceReveal', 0.02, 1, 0.01, 'reveal (s)');
  R(lance, c, 'lancePlantPitch', 0.1, 1.55, 0.01, 'slammed in at (rad)');
  R(lance, c, 'lancePlantLean', 0, 1, 0.01, 'leans back .. out');
  R(lance, c, 'lanceSlam', 0.02, 0.8, 0.01, 'slam (s)');
  R(lance, c, 'lancePlantDepth', 0, 2, 0.01, 'buried (m)');
  R(lance, c, 'lanceDrill', 0, 3, 0.01, 'drills down (m)');
  R(lance, c, 'lanceDrillSpin', 0, 60, 0.5, 'drill spin (rad/s)');
  R(lance, c, 'lanceDrillDecay', 0, 8, 0.05, 'drill slows (/s)');
  R(lance, c, 'lanceExitAt', 0, 1, 0.01, 'dissolves from, share of life');
  R(lance, c, 'lanceSpecular', 0, 4, 0.05, 'glint');
  R(lance, c, 'lanceRimGlow', 0, 4, 0.05, 'rim');
  R(lance, c, 'lanceFluteGlow', 0, 6, 0.05, 'flute glow');
  R(lance, c, 'lanceHeat', 0, 6, 0.05, 'burn front');
  lance.addColor(c, 'colorLanceDeep').name('deep');
  lance.addColor(c, 'colorLanceBody').name('body');
  lance.addColor(c, 'colorLanceTint').name('ridge');
  lance.addColor(c, 'colorLanceHot').name('white-hot');
  R(lance, c, 'plantCrack', 0, 5, 0.05, 'cracked floor (m)');
  R(lance, c, 'plantChips', 0, 120, 1, 'slam chips');
  R(lance, c, 'plantDust', 0, 60, 1, 'slam dust');
  R(lance, c, 'plantShake', 0, 1.5, 0.01, 'slam punch');
  R(lance, c, 'plantLight', 0, 30, 0.1, 'slam light');
  R(lance, c, 'drillChips', 0, 200, 1, 'drill chips / s');
  R(lance, c, 'drillSparks', 0, 200, 1, 'drill sparks / s');
  R(lance, c, 'exitMotes', 0, 400, 1, 'exit motes / s');

  const decoy = folder.addFolder('16 · The decoy');
  R(decoy, c, 'decoyLate', 0, 1, 0.01, 'late by');
  R(decoy, c, 'decoyOpacity', 0, 1, 0.01, 'opacity');
  R(decoy, c, 'decoyScan', 1, 80, 1, 'scanlines');
  R(decoy, c, 'decoyStutter', 0, 0.5, 0.005, 'stutter (m)');
  R(decoy, c, 'decoyGlow', 0, 4, 0.05, 'edge glow');
  R(decoy, c, 'shardCount', 0, 32, 1, 'panes');
  R(decoy, c, 'shardSize', 0.05, 1.5, 0.01, 'pane size (m)');
  R(decoy, c, 'shardSpeed', 0, 15, 0.1, 'burst (m/s)');
  R(decoy, c, 'shardLift', 0, 12, 0.1, 'thrown up (m/s)');
  R(decoy, c, 'shardSpin', 0, 40, 0.5, 'tumble (rad/s)');
  R(decoy, c, 'shardLife', 0.1, 4, 0.05, 'lingers (s)');
  decoy.addColor(c, 'colorDecoyBody').name('body');
  decoy.addColor(c, 'colorDecoyEdge').name('edge');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
