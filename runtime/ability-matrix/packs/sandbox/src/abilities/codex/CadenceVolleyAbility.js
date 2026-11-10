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
import { createCadenceVolleyPieceGeometry, createCadenceVolleyHeroGeometry } from '../../assets/codex/CadenceVolleyGeometry.js';
import {
  createCadenceVolleyBodyMaterial,
  createCadenceVolleyLensMaterial,
  createCadenceVolleyGroundMaterial,
  createCadenceVolleyVoiceMaterial,
  createCadenceVolleyDetailMaterial,
  createCadenceVolleyTrailMaterial,
  createCadenceVolleyScarMaterial,
  createCadenceForkMaterial,
  createCadencePoolMaterial
} from '../../materials/codex/CadenceVolleyMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'cadence';

const TWIST = 'plant';
const ARCH = 'volley';
const HIT = 'bolt';
const CARRY = 'none';
const WHEN = 'part';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = false;
const ZONE = false;
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
/** Forks one volley can throw (the `count` slider caps at 12 parts). */
const MAX_FORKS = 12;
/** Where the tines leave the yoke, share of the fork's height. */
const TINE_FROM = 0.5;
const TAU = Math.PI * 2;
const _hand = new Vector3();
const _target = new Vector3();
const _vel = new Vector3();
const _tip = new Vector3();
const _axis = new Vector3();
const _scale = new Vector3();
const _m4 = new Matrix4();
const _q = new Quaternion();
const _qa = new Quaternion();
const _qy = new Quaternion();
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);
const hash = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/*
 * Cast-local geometry. It lives here, not in the generated
 * `CadenceVolleyGeometry.js`, which must stay byte-identical to its rig
 * recipe (tests/pure-rigs.test.mjs).
 */

/** Append a tube swept along a planar (XY) polyline to `pos`/`idx`; `flat` squashes it in Z. */
function sweepXY(pts, radii, sides, flat, pos, idx) {
  const base = pos.length / 3;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // In-plane normal (perpendicular to the tangent) and the Z binormal.
    const nx = -ty;
    const ny = tx;
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * TAU + Math.PI / sides;
      const cx = Math.cos(ang) * radii[i];
      const cz = Math.sin(ang) * radii[i] * flat;
      pos.push(pts[i][0] + nx * cx, pts[i][1] + ny * cx, cz);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      const a = base + i * sides + k;
      const b = base + i * sides + j;
      const c = base + (i + 1) * sides + k;
      const d = base + (i + 1) * sides + j;
      idx.push(a, c, b, b, c, d);
    }
  }
}

/**
 * The hero: a forged tuning fork, one unit tall along +Y with the stem's
 * point at the origin. A pointed stem with a grip collar (it flies stem first
 * and is driven into the floor like a dart), a round yoke, and two long
 * parallel tines with blunt ends, squared off a little so the sun picks out
 * their faces. Tines leave the yoke at `TINE_FROM`.
 */
export function createTuningForkGeometry() {
  const pos = [];
  const idx = [];
  // The stem: point, shank, a grip collar, then into the yoke.
  const stem = [[0, 0], [0, 0.025], [0, 0.06], [0, 0.07], [0, 0.1], [0, 0.11], [0, 0.3], [0, 0.32], [0, 0.35], [0, 0.37], [0, 0.4]];
  const stemR = [0.004, 0.03, 0.042, 0.055, 0.055, 0.034, 0.034, 0.05, 0.05, 0.034, 0.045];
  sweepXY(stem, stemR, 10, 1, pos, idx);
  // The yoke and tines: one band from the left tip, round the U, to the right tip.
  const gap = 0.085;
  const r = 0.042;
  const path = [];
  const radii = [];
  const tipL = [[-gap, 1.0, 0.012], [-gap, 0.995, r * 0.75], [-gap, 0.985, r]];
  for (const [x, y, rr] of tipL) { path.push([x, y]); radii.push(rr); }
  for (let y = 0.9; y > TINE_FROM; y -= 0.1) { path.push([-gap, y]); radii.push(r); }
  for (let k = 0; k <= 10; k++) {
    const th = Math.PI + (k / 10) * Math.PI;
    path.push([Math.cos(th) * gap, TINE_FROM + Math.sin(th) * gap]);
    radii.push(r * (1 + 0.25 * Math.sin((k / 10) * Math.PI)));
  }
  for (let y = TINE_FROM + 0.1; y < 0.95; y += 0.1) { path.push([gap, y]); radii.push(r); }
  for (const [x, y, rr] of [[gap, 0.985, r], [gap, 0.995, r * 0.75], [gap, 1.0, 0.012]]) { path.push([x, y]); radii.push(rr); }
  sweepXY(path, radii, 8, 0.72, pos, idx);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * CADENCE VOLLEY — sound, line cast.
 *
 * Sound — beats arc down the line and detonate on the downbeat.
 *
 * Bolts are beats. They detonate on their own landing, later ones harder than early ones.
 *
 * The read is `plant`: hit timing `part`, blow `bolt`.
 *
 * ## Layers
 *
 *   1. **body** — the plant placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled sound field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createCadenceVolleyPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createCadenceVolleyHeroGeometry`), stood by its archetype (volley): riding a ballistic arc, pitched along it.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: bolts are beats. They detonate on their own landing, later ones harder than early ones.
 *  10. **mark** — a felled body is left ringing: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The upgrade — the volley is tuning forks (cast-local, sections 15–16)
 *
 * The template layers above (white body arches, voice, floor grid strip,
 * rig, pieces, ribbon) are turned off in the config; the spell is carried by
 * its own forms:
 *
 *  11. **the forks** (`createTuningForkGeometry`, `createCadenceForkMaterial`,
 *      lit dark olive steel, `LAYER.SHAPED`, shadows) — `count` heavy forks,
 *      each bigger than the last (`forkSizeFirst` → `forkSize`): later beats
 *      land harder. Each is thrown from the fist stem first on its own arc to
 *      the point its part strikes (`_partPoint`), timed to touch down exactly
 *      when that part hits (the hit rule is unchanged; the flight is solved
 *      backwards from it), and is driven upright into the floor.
 *  12. **the landing** — every fork lands as its own beat: a dust ring, chips,
 *      a low burst, a tick of shake and light, scaled by its place in the bar.
 *  13. **the hum** — a planted fork rings: its tines spread and close (vertex
 *      bend) with a lime hum running up them, decaying; it wobbles from the
 *      landing.
 *  14. **the downbeat** — `downbeatAt` after the last fork the whole bar rings
 *      together once more: every fork flares white-hot at the yoke, throws
 *      sparks off its tips, and every pool throws a swell.
 *  15. **the beat pools** (`createCadencePoolMaterial`) — a filled, dark pan
 *      under each fork with a heaved lip and pressure waves running out of it.
 *  16. **the exit** — as the hum dies the forks topple one after another and
 *      crumble on the floor; the pools fray out.
 *
 * Every metre, rate and colour is read from `settings.cadence` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class CadenceVolleyAbility extends Ability {
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
    this.bodyMaterial = createCadenceVolleyBodyMaterial();
    this.lensMaterial = createCadenceVolleyLensMaterial();
    this.groundMaterial = createCadenceVolleyGroundMaterial();
    this.voiceMaterial = createCadenceVolleyVoiceMaterial();
    this.detailMaterial = createCadenceVolleyDetailMaterial();
    this.heroMaterial = createCadenceVolleyDetailMaterial(true);
    this.detail = new DetailLayer(createCadenceVolleyPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createCadenceVolleyHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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
    this.trailMaterial = createCadenceVolleyTrailMaterial();
    this.scarMaterial = createCadenceVolleyScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this._buildForks();
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);
  }

  /** The volley's own meshes: instanced forks and the beat-pool floor. */
  _buildForks() {
    this.forkGeometry = createTuningForkGeometry();
    this._forkState = new Float32Array(MAX_FORKS * 4);
    this._forkAttr = new InstancedBufferAttribute(this._forkState, 4).setUsage(DynamicDrawUsage);
    this.forkGeometry.setAttribute('aFork', this._forkAttr);
    this.forkMaterial = createCadenceForkMaterial();
    this.forks = new InstancedMesh(this.forkGeometry, this.forkMaterial, MAX_FORKS);
    this.forks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.forks.layers.set(LAYER.SHAPED);
    this.forks.castShadow = true;
    this.forks.receiveShadow = true;
    this.forks.frustumCulled = false;
    this.forks.renderOrder = 14;
    this.forks.visible = false;
    this.forks.count = 0;
    this.group.add(this.forks);
    this.poolGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.poolMaterial = createCadencePoolMaterial();
    this.pool = this._mesh(this.poolGeometry, this.poolMaterial, LAYER.VFX, 2);
    this.pool.rotation.x = -Math.PI / 2;
    this._forks = Array.from({ length: MAX_FORKS }, () => ({ land: -1 }));
    this._downAt = -1;
    this._since = -1;
    this._humEmitter = new RateEmitter();
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
    this.dust = particles.get('cadence.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('cadence.streak', {
      capacity: 1200,
      shape: ParticleShape.RING,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('cadence.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('cadence.mote', {
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
    this.trail.reset();
    for (let i = 0; i < MAX_FORKS; i++) this._forks[i].land = -1;
    const pools = this.poolMaterial.uniforms.uPool.value;
    for (let i = 0; i < MAX_FORKS; i++) pools[i].set(0, 0, 0, 0);
    this._downAt = -1;
    this._since = -1;
    this._humEmitter.reset();
    this._hideForks();
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
    
    
    let grow;
    let open;
    let along;
    along = committed ? 1 : u; grow = 1; open = 1;
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
        _dir.set(Math.cos(ang), 0.05, Math.sin(ang));
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.set(Math.cos(ang), 0.4, Math.sin(ang));
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
      this._forkLand(i, n);
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
  /* The upgrade: the forks, their hum, the downbeat, the beat pools     */
  /* ------------------------------------------------------------------ */

  _forkCount() {
    return Math.max(1, Math.min(MAX_FORKS, Math.round(settings[ID].count)));
  }

  /** Height of fork `i`, metres: each beat in the bar is bigger than the last. */
  _forkSize(i, n) {
    const c = settings[ID];
    const k = n > 1 ? i / (n - 1) : 1;
    return Math.max(0.1, c.forkSize * (c.forkSizeFirst + (1 - c.forkSizeFirst) * k));
  }

  /** A fork touches down on its part's strike point: its own small beat. */
  _forkLand(i, n) {
    if (i >= MAX_FORKS || this._forks[i].land >= 0) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity * (c.forkBeatFirst + (1 - c.forkBeatFirst) * (n > 1 ? i / (n - 1) : 1));
    this._forks[i].land = this.age;
    const size = this._forkSize(i, n);
    this._partPoint(i, n, _target);
    _pos.copy(_target).setY(0);
    this.poolMaterial.uniforms.uPool.value[i].set(_target.x, _target.z, this.age, power);
    this.poolMaterial.uniforms.uRadius.value[i] = c.poolRadius * size;
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: size * c.landDust,
      life: c.shockLife,
      width: 0.1,
      intensity: 0.6,
      colorA: getColor(c.colorDustD),
      colorB: getColor(c.colorDustC),
      height: 0.03
    });
    if (c.landBurst > 0.01) {
      this.ctx.bursts.spawn(BurstMode.AIR, _pos.setY(0.35), {
        radius: 0.1,
        endRadius: size * 0.7 * power,
        life: 0.3,
        intensity: 0.7,
        opacity: c.landBurst * g.opacity,
        squash: 0.5,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    const chips = Math.round(c.landChips * g.particleCount * power);
    if (chips > 0) {
      this._fillEmit(_pos.setY(0.15), size * 0.2, _up, c.chipSpeed * 1.2, 0.75, c.chipSize * 1.3, c.chipLife * 1.2, 8);
      this.chips.emit(chips, _emit);
    }
    const puffs = Math.round(c.landPuffs * g.particleCount);
    for (let k = 0; k < puffs; k++) {
      const ang = (k / Math.max(1, puffs)) * TAU + hash(i, 9) * TAU;
      _dir.set(Math.cos(ang), 0.15, Math.sin(ang));
      this._fillEmit(_pos, size * 0.2, _dir, c.dustSpeed * 1.4, 0.3, 0.5, c.dustLife * 1.3, 0.4);
      this.dust.emit(1, _emit);
    }
    this.ctx.shake.add(c.landShake * power * g.cameraShake, 5, 20);
    this.lightBoost += c.landLight * power;
  }

  /** The downbeat: the whole bar rings together once more. */
  _downbeat() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._downAt = this.age;
    this.ctx.shake.add(c.downShake * power * g.cameraShake, 4, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.downFlash * power);
    this.lightBoost += c.downLight * power;
    const n = this._forkCount();
    const sparks = Math.round(c.downSparks * g.particleCount);
    for (let i = 0; i < n; i++) {
      if (this._forks[i].land < 0) continue;
      const size = this._forkSize(i, n);
      this._partPoint(i, n, _target);
      _pos.copy(_target).setY(size * (1 - c.forkPlant));
      if (sparks > 0) {
        this._fillEmit(_pos, size * 0.15, _up, c.streakSpeed, 0.9, 0.06, c.streakLife, 2);
        this.streaks.emit(sparks, _emit);
      }
      this.ctx.decals.spawn(DecalType.DUSTRING, _pos.setY(0), {
        radius: size * c.landDust * 1.3,
        life: c.shockLife,
        width: 0.08,
        intensity: 0.5,
        colorA: getColor(c.colorDustD),
        colorB: getColor(c.colorDustC),
        height: 0.03
      });
    }
  }

  /**
   * Lay out every fork (in flight, planted and humming, toppling) and the
   * pools, from the settings and each fork's landing time. Allocation-free.
   */
  _volley(dt) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const n = this._forkCount();
    const speed = Math.max(1, c.speed * g.speed);
    const since = this._since;
    const total = this.impactDuration + this.fadeDuration;
    const decay = Math.max(0.1, c.forkRingDecay / L);
    const cool = Math.max(0.1, c.forkCool / L);
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _hand.y = c.handHeight;
    const yaw = Math.atan2(-this.side.z, this.side.x);
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      const rec = this._forks[i];
      const s = (i + 0.5) / n;
      const H = this._forkSize(i, n);
      const d = hash(i, 4);
      this._partPoint(i, n, _target);
      let ring = 0;
      let heat = 0;
      let crumble = 0;
      if (rec.land < 0) {
        // In flight, stem first, on an arc solved back from the strike time.
        const pred = this.age + Math.max(0, (((i + 0.98) / n) * this.length - this.front) / speed);
        const flight = Math.max(0.05, c.forkFlight * (0.35 + 0.65 * s));
        const p = saturate(1 + (this.age - pred) / flight);
        if (p <= 0) {
          this.forks.setMatrixAt(i, _zero);
          this._forkState[i * 4 + 1] = 0;
          continue;
        }
        const arc = c.forkArc * (0.4 + 0.6 * s);
        const y0 = _hand.y;
        _pos.lerpVectors(_hand, _target, p);
        _pos.y = y0 * (1 - p) + arc * 4 * p * (1 - p);
        _vel.subVectors(_target, _hand);
        _vel.y = -y0 + arc * 4 * (1 - 2 * p);
        _vel.normalize().negate();
        _q.setFromUnitVectors(_up, _vel);
        _qa.setFromAxisAngle(_up, this.age * c.forkSpin * g.animationSpeed + d * TAU);
        _q.multiply(_qa);
        heat = 0.5;
      } else {
        const tau = this.age - rec.land;
        // Planted upright, tines across the line (facing the caster), wobbling from the landing.
        const wobble = c.forkWobble * Math.exp(-tau * 5) * Math.sin(tau * 19);
        const lean = (d - 0.5) * 2 * c.forkTilt + wobble;
        // The exit: toppling over one after another, then crumbling.
        const at = c.toppleStart * total + i * c.toppleStagger * L;
        const tp = since < 0 ? 0 : Easing.inQuad(saturate((since - at) / Math.max(0.05, c.toppleTime * L)));
        crumble = since < 0 ? 0 : saturate((since - at - c.toppleTime * L * 0.85) / Math.max(0.05, c.crumbleTime * L));
        // It falls to whichever side it already leans.
        _q.setFromAxisAngle(this.direction, lean + tp * (Math.PI / 2 - 0.1) * (d > 0.5 ? 1 : -1));
        _qy.setFromAxisAngle(_up, yaw);
        _q.multiply(_qy);
        // Pivot on the floor: the buried stem rides below it.
        _tip.set(0, -c.forkPlant * H * (1 - tp), 0).applyQuaternion(_q);
        _pos.copy(_target).setY(tp * H * 0.05).add(_tip);
        ring = Math.exp(-tau * decay);
        heat = Math.exp(-tau * cool);
        if (this._downAt >= 0) {
          const td = this.age - this._downAt;
          ring = Math.max(ring, c.downRing * Math.exp(-td * decay));
          heat = Math.max(heat, Math.exp(-td * cool));
        }
        ring = Math.min(1.2, ring) * (1 - tp);
      }
      _scale.set(H, H, H);
      _m4.compose(_pos, _q, _scale);
      this.forks.setMatrixAt(i, _m4);
      this._forkState[i * 4] = d;
      this._forkState[i * 4 + 1] = ring;
      this._forkState[i * 4 + 2] = heat;
      this._forkState[i * 4 + 3] = crumble;
      if (crumble < 0.999) drawn++;
    }
    this.forks.count = n;
    this.forks.visible = drawn > 0;
    this.forks.instanceMatrix.needsUpdate = true;
    this._forkAttr.needsUpdate = true;
    this.forkMaterial.userData.sync(TINE_FROM);

    // The hum: motes shed off the ringing tines.
    const hum = Math.round(this._humEmitter.tick(dt, c.humMotes) * g.particleCount);
    for (let k = 0; k < hum; k++) {
      const i = Math.floor(Math.random() * n);
      if (this._forks[i].land < 0 || this._forkState[i * 4 + 1] < 0.15) continue;
      const H = this._forkSize(i, n);
      this._partPoint(i, n, _pos);
      _pos.addScaledVector(this.side, (Math.random() < 0.5 ? -1 : 1) * 0.15 * H);
      _pos.y = H * (0.55 + 0.4 * Math.random()) * (1 - c.forkPlant);
      _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
      _dir.y = 0.6;
      this._fillEmit(_pos, 0.05, _dir, c.moteSpeed, 0.6, 0.08, c.moteLife, 1);
      this.motes.emit(1, _emit);
    }

    // The beat pools, laid over the whole strip.
    let landed = false;
    for (let i = 0; i < n; i++) if (this._forks[i].land >= 0) landed = true;
    if (landed && c.poolOpacity > 0.01) {
      const erode = since < 0 ? 0 : saturate((since - c.poolErodeStart * total) / Math.max(0.05, total * (1 - c.poolErodeStart)));
      const side = this.length + 2 * (c.poolRadius * c.forkSize * 2 + c.sweep + 1);
      this.pointAt(0.5, _pos);
      this.pool.position.set(_pos.x, 0.035, _pos.z);
      this.pool.scale.set(side, side, 1);
      this.pool.visible = erode < 0.999;
      this.poolMaterial.userData.sync(this.age, this._downAt, erode * 1.2);
    } else this.pool.visible = false;
  }

  _hideForks() {
    this.forks.visible = false;
    this.forks.count = 0;
    this.pool.visible = false;
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
    this._since = -1;
    this._volley(dt);
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
    this._palette();
    this._shed(dt, fade * 0.7);
    this.trail.tick(dt, 1, this._state, c.wakeSpacing);
    this._since = t < 1 ? t * this.impactDuration : this.impactDuration + (t - 1) * this.fadeDuration;
    if (this._downAt < 0 && this._since >= c.downbeatAt * g.lifetime) this._downbeat();
    this._volley(dt);
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
    this._hideForks();
  }

  dispose() {
    this.forkGeometry.dispose();
    this.forkMaterial.dispose();
    this.poolGeometry.dispose();
    this.poolMaterial.dispose();
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
  const folder = gui.addFolder('Cadence Volley');
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

  const shape = folder.addFolder('1 · Shape — plant');
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

  const mark = folder.addFolder('13 · Mark — left ringing');
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

  const forks = folder.addFolder('15 · The forks');
  R(forks, c, 'forkSize', 0.2, 5, 0.05, 'last fork height (m)');
  R(forks, c, 'forkSizeFirst', 0.2, 1.5, 0.01, 'first fork, × last');
  R(forks, c, 'forkBeatFirst', 0, 1.5, 0.01, 'first landing, × last');
  R(forks, c, 'forkFlight', 0.05, 2, 0.01, 'flight (s)');
  R(forks, c, 'forkArc', 0, 6, 0.05, 'arc (m)');
  R(forks, c, 'forkSpin', -40, 40, 0.5, 'spin in flight (rad/s)');
  R(forks, c, 'forkPlant', 0, 0.6, 0.01, 'driven in, × height');
  R(forks, c, 'forkTilt', 0, 0.6, 0.01, 'rest lean (rad)');
  R(forks, c, 'forkWobble', 0, 0.6, 0.01, 'landing wobble (rad)');
  R(forks, c, 'forkSpread', 0, 0.3, 0.005, 'tine swing, × height');
  R(forks, c, 'forkRingRate', 1, 80, 0.5, 'tine rate (rad/s)');
  R(forks, c, 'forkRingDecay', 0.1, 10, 0.05, 'hum decay (/s)');
  R(forks, c, 'forkCool', 0.1, 10, 0.05, 'strike cools (/s)');
  R(forks, c, 'forkHum', 0, 4, 0.05, 'hum glow');
  R(forks, c, 'forkStrikeGlow', 0, 8, 0.05, 'strike glow');
  R(forks, c, 'forkSpecular', 0, 4, 0.05, 'steel glint');
  R(forks, c, 'forkRimGlow', 0, 4, 0.05, 'rim');
  forks.addColor(c, 'colorForkDeep').name('steel, deep');
  forks.addColor(c, 'colorForkBody').name('steel');
  forks.addColor(c, 'colorForkTint').name('steel, rim');
  forks.addColor(c, 'colorForkGlow').name('hum');
  forks.addColor(c, 'colorForkHot').name('white-hot');
  R(forks, c, 'landShake', 0, 1, 0.01, 'landing punch');
  R(forks, c, 'landLight', 0, 20, 0.1, 'landing light');
  R(forks, c, 'landBurst', 0, 1, 0.01, 'landing burst');
  R(forks, c, 'landChips', 0, 60, 1, 'landing chips');
  R(forks, c, 'landPuffs', 0, 40, 1, 'landing dust');
  R(forks, c, 'landDust', 0, 4, 0.05, 'dust ring, × height');
  R(forks, c, 'humMotes', 0, 200, 1, 'hum motes / s');
  R(forks, c, 'downbeatAt', 0, 2, 0.01, 'downbeat (s after the last)');
  R(forks, c, 'downRing', 0, 1.2, 0.01, 'downbeat ring');
  R(forks, c, 'downShake', 0, 1, 0.01, 'downbeat punch');
  R(forks, c, 'downFlash', 0, 0.5, 0.01, 'downbeat flash');
  R(forks, c, 'downLight', 0, 30, 0.1, 'downbeat light');
  R(forks, c, 'downSparks', 0, 80, 1, 'downbeat sparks / fork');
  R(forks, c, 'toppleStart', 0, 1, 0.01, 'topple from, share of life');
  R(forks, c, 'toppleStagger', 0, 0.4, 0.005, 'topple stagger (s)');
  R(forks, c, 'toppleTime', 0.05, 1.5, 0.01, 'topple (s)');
  R(forks, c, 'crumbleTime', 0.05, 1.5, 0.01, 'crumble (s)');

  const pools = folder.addFolder('16 · The beat pools');
  R(pools, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pools, c, 'poolRadius', 0.1, 2, 0.01, 'pan, × fork height');
  R(pools, c, 'poolGrow', 0.5, 30, 0.1, 'opens (/s)');
  R(pools, c, 'poolWaveLength', 0.1, 3, 0.05, 'wave length (m)');
  R(pools, c, 'poolWaveSpeed', 0, 6, 0.05, 'waves out (m/s)');
  R(pools, c, 'poolWaveDecay', 0, 6, 0.05, 'waves die (/s)');
  R(pools, c, 'poolGlow', 0, 4, 0.05, 'crest glow');
  R(pools, c, 'poolErodeStart', 0, 1, 0.01, 'frays from, share of life');
  pools.addColor(c, 'colorPoolDeep').name('pan');
  pools.addColor(c, 'colorPoolBody').name('crest');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
