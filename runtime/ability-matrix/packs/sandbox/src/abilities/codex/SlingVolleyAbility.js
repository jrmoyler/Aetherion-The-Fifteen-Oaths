import { BufferGeometry, CatmullRomCurve3, DynamicDrawUsage, Float32BufferAttribute, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, TubeGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { rng } from '../../assets/codex/RigKit.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { LineTrail } from './LineTrail.js';
import { createSlingVolleyPieceGeometry, createSlingVolleyHeroGeometry } from '../../assets/codex/SlingVolleyGeometry.js';
import {
  createSlingVolleyBodyMaterial,
  createSlingVolleyLensMaterial,
  createSlingVolleyGroundMaterial,
  createSlingVolleyVoiceMaterial,
  createSlingVolleyDetailMaterial,
  createSlingVolleyTrailMaterial,
  createSlingVolleyScarMaterial,
  createSlingStoneMaterial,
  createSlingBlurMaterial,
  createSlingCraterMaterial
} from '../../materials/codex/SlingVolleyMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'slingvolley';

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
/** Stones one volley can throw (the `count` slider caps at 12 parts). */
const MAX_STONES = 12;

const _hand = new Vector3();
const _target = new Vector3();
const _touch = new Vector3();
const _rest = new Vector3();
const _sp = new Vector3();
const _scale = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _qa = new Quaternion();
const _axisX = new Vector3(1, 0, 0);
const _axisZ = new Vector3(0, 0, 1);
const _zero = new Matrix4().makeScale(0, 0, 0);
const TAU = Math.PI * 2;
const hash = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ------------------------------------------------------------------ */
/* Cast-local geometry for the upgrade. It lives here, not in the      */
/* generated `SlingVolleyGeometry.js`, which must stay byte-identical to   */
/* its rig recipe (tests/pure-rigs.test.mjs).                         */
/* ------------------------------------------------------------------ */
/**
 * The sling stone — the hero of the upgraded cast. A lead-grey/basalt
 * *glans*: the almond (lemon) shot slingers actually threw, pointed at both
 * ends along +X, chiselled into flat facets by a deterministic lump field so
 * every face catches the sun differently. Long axis spans x ∈ [-1, 1] (so the
 * ability's `stoneSize` is its half-length); the waist is ~0.6 thick.
 *
 * Attributes: `aGrain` (0..1 per vertex, the crust/clean-stone mix the shader
 * reads), flat normals (non-indexed, one normal per face).
 */
export function createSlingStoneGeometry(seed = 7) {
  const src = new IcosahedronGeometry(1, 3);
  const pos = src.getAttribute('position');
  const rand = rng(seed);
  // A handful of chisel planes: each knocks a flat facet into the stone.
  const cuts = [];
  for (let i = 0; i < 18; i++) {
    const n = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    cuts.push({ n, d: 0.8 + rand() * 0.14 });
  }
  const lumps = [];
  for (let i = 0; i < 6; i++) lumps.push({ n: new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(), f: 2 + rand() * 3, p: rand() * TAU });
  const out = new Float32Array(pos.count * 3);
  const grain = new Float32Array(pos.count);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // Lump: low-frequency wobble so no two sides match.
    let lump = 0;
    for (const l of lumps) lump += Math.sin(v.dot(l.n) * l.f + l.p) * 0.025;
    // Glans profile: pointed ends along x, round waist.
    const x = v.x;
    const waist = Math.pow(Math.max(0, 1 - x * x), 0.62) * 0.6 + 0.04;
    const len = Math.hypot(v.y, v.z) || 1;
    let px = x * (1 + lump);
    let py = (v.y / len) * waist;
    let pz = (v.z / len) * waist;
    py *= 1 + lump * 1.5;
    pz *= 0.92 + lump * 1.5; // a touch flattened: it flies flat
    // Chisel: clamp to each cut plane (scaled into the stone's frame).
    for (const c of cuts) {
      const d = px * c.n.x + py * c.n.y / 0.6 + pz * c.n.z / 0.6;
      if (d > c.d) {
        const k = c.d / d;
        px *= 1 - (1 - k) * Math.abs(c.n.x);
        py *= 1 - (1 - k) * Math.abs(c.n.y);
        pz *= 1 - (1 - k) * Math.abs(c.n.z);
      }
    }
    out[i * 3] = px;
    out[i * 3 + 1] = py;
    out[i * 3 + 2] = pz;
    grain[i] = 0.5 + 0.5 * Math.sin(px * 7.1 + py * 11.3 + pz * 5.7 + seed);
  }
  src.dispose();
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  g.setAttribute('aGrain', new Float32BufferAttribute(grain, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * The sling's cord: one leather thong from the fist (origin) to the pouch at
 * +X = 1, sagging a little behind the whirl. Scaled by `slingRadius`.
 */
export function createSlingCordGeometry() {
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0.35, 0.03, -0.06),
    new Vector3(0.7, 0.02, -0.12),
    new Vector3(1, 0, -0.1)
  ]);
  return new TubeGeometry(curve, 24, 0.018, 5, false);
}

/**
 * SLING VOLLEY — motion, line cast.
 *
 * Motion — stones leave on flat slings and arrive still spinning.
 *
 * Stones leave on flat slings and are still spinning when they arrive. The spin is the torque of the hit.
 *
 * The read is `plant`: hit timing `part`, blow `bolt`.
 *
 * ## Layers
 *
 *   1. **body** — the plant placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled motion field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createSlingVolleyPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createSlingVolleyHeroGeometry`), stood by its archetype (volley): riding a ballistic arc, pitched along it.
 *      Hero and pieces are matter: sun-lit, opaque, shadow-casting (LAYER.SHAPED), the ramp as albedo, only hot parts glowing. The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: stones leave on flat slings and are still spinning when they arrive. The spin is the torque of the hit.
 *  10. **mark** — a felled body is smeared: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The upgrade — the volley is stones
 *
 * The template layers above (body arcs, voice, floor grid, rig, pieces, trail)
 * are now off by default (their opacity/count sliders still work); the cast
 * reads through four layers of its own:
 *
 *  11. **the sling** — at the fist a leather cord whirls flat overhead
 *      (`slingRadius`, `slingSpin`) under a smear disc, the first beat:
 *      anticipation you can see from behind the caster.
 *  12. **the stones** (`createSlingStoneGeometry`, `createSlingStoneMaterial`,
 *      `LAYER.WORLD`, cast shadows) — `count` lit, chiselled lemon-shaped
 *      sling bullets (*glandes*), `stoneSize` metres half-length. Each one is
 *      thrown on its own flat arc from the fist to the point its part strikes
 *      (`_partPoint`), timed so it touches down exactly when that part hits
 *      (the hit timing is unchanged; the stone's flight is solved backwards
 *      from it). It flies spinning flat about the vertical (`stoneSpin`), hot
 *      cracks glowing; it lands with a bounce, skids `stoneSkid` metres,
 *      and keeps spinning on the floor like a spun bottle — slowing over
 *      `stoneSpinDown`, rocking harder as it slows, cracks cooling
 *      (`stoneCool`); on the exit it beds into the floor and crumbles.
 *  13. **the spin blur** (`createSlingBlurMaterial`) — a horizontal smear disc
 *      round each spinning stone, two comet arms behind its pointed tips,
 *      strength = the spin left, so the linger visibly winds down.
 *  14. **the crater floor** (`createSlingCraterMaterial`) — a filled, dark
 *      crater per landing with a heaped lip, the skid gouge, the scuffed disc
 *      the tips score, and radial cracks glowing while the stone is hot; plus
 *      an engine CRACK decal per landing that outlives the cast.
 *
 * Every landing is its own small beat (chips, dust ring, a short shake and a
 * light punch); the template's end-of-line beat stays as the last, biggest one.
 *
 * Every metre, rate and colour is read from `settings.slingvolley` each frame.
 * A cast only captures a seed, an integrated spin and each stone's landing time.
 */
export class SlingVolleyAbility extends Ability {
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
    this.bodyMaterial = createSlingVolleyBodyMaterial();
    this.lensMaterial = createSlingVolleyLensMaterial();
    this.groundMaterial = createSlingVolleyGroundMaterial();
    this.voiceMaterial = createSlingVolleyVoiceMaterial();
    this.detailMaterial = createSlingVolleyDetailMaterial();
    this.heroMaterial = createSlingVolleyDetailMaterial(true);
    this.detail = new DetailLayer(createSlingVolleyPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createSlingVolleyHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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
    this.trailMaterial = createSlingVolleyTrailMaterial();
    this.scarMaterial = createSlingVolleyScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);

    // The upgrade's own layers: stones, spin blur, sling, crater floor.
    this.stoneGeometry = createSlingStoneGeometry();
    this._stoneState = new Float32Array((MAX_STONES + 1) * 4);
    this._stoneAttr = new InstancedBufferAttribute(this._stoneState, 4).setUsage(DynamicDrawUsage);
    this.stoneGeometry.setAttribute('aState', this._stoneAttr);
    this.stoneMaterial = createSlingStoneMaterial();
    this.stones = new InstancedMesh(this.stoneGeometry, this.stoneMaterial, MAX_STONES + 1);
    this.stones.instanceMatrix.setUsage(DynamicDrawUsage);
    this.stones.layers.set(LAYER.WORLD);
    this.stones.castShadow = true;
    this.stones.frustumCulled = false;
    this.stones.visible = false;
    this.stones.count = 0;
    this.group.add(this.stones);

    this.blurGeometry = new PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this._blurState = new Float32Array((MAX_STONES + 1) * 4);
    this._blurAttr = new InstancedBufferAttribute(this._blurState, 4).setUsage(DynamicDrawUsage);
    this.blurGeometry.setAttribute('aBlur', this._blurAttr);
    this.blurMaterial = createSlingBlurMaterial();
    this.blur = new InstancedMesh(this.blurGeometry, this.blurMaterial, MAX_STONES + 1);
    this.blur.instanceMatrix.setUsage(DynamicDrawUsage);
    this.blur.layers.set(LAYER.VFX);
    this.blur.renderOrder = 14;
    this.blur.frustumCulled = false;
    this.blur.visible = false;
    this.blur.count = 0;
    this.group.add(this.blur);

    this.cordGeometry = createSlingCordGeometry();
    this.cordMaterial = new MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.85, metalness: 0.05 });
    this.cord = new Mesh(this.cordGeometry, this.cordMaterial);
    this.cord.layers.set(LAYER.WORLD);
    this.cord.castShadow = true;
    this.cord.frustumCulled = false;
    this.cord.visible = false;
    this.group.add(this.cord);

    this.craterGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.craterMaterial = createSlingCraterMaterial();
    this.crater = this._mesh(this.craterGeometry, this.craterMaterial, LAYER.VFX, 2);

    this._stones = Array.from({ length: MAX_STONES }, () => ({ land: -1, seed: 0 }));
    this._fadeT = 0;
    this._flying = new Float32Array(MAX_STONES * 3);
    this._flyCount = 0;
    this._spinning = new Float32Array(MAX_STONES * 4);
    this._spinCount = 0;
    this._trailEmitter = new RateEmitter();
    this._spinDustEmitter = new RateEmitter();
    this._slingQ = new Quaternion();
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
    this.dust = particles.get('slingvolley.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('slingvolley.streak', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('slingvolley.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('slingvolley.mote', {
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
    this.trail.reset();
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._releaseMarks();
    for (let i = 0; i < MAX_STONES; i++) {
      this._stones[i].land = -1;
      this._stones[i].seed = Math.random();
    }
    this._fadeT = 0;
    this._trailEmitter.reset();
    this._spinDustEmitter.reset();
    this.stones.count = 0;
    this.stones.visible = false;
    this.blur.count = 0;
    this.blur.visible = false;
    this.cord.visible = false;
    this.crater.visible = false;
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
      this._stoneLand(i, n);
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
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
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

  /** Where the head crosses each `wakeSpacing` metre: a dustring decal and a few chips. */
  _wake(point, lane, s) {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(point).setY(0);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.wakeRadius * (0.8 + 0.4 * Math.random()),
      life: c.wakeLife * g.lifetime,
      width: 0.08,
      intensity: 0.75,
      colorA: getColor(c.colorScarA),
      colorB: getColor(c.colorB),
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
    this._fadeT = 0;
    this._pose(false, 0);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this.trail.tick(dt, this._state.along, this._state, c.wakeSpacing);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
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
    this._fadeT = t;
    this._pose(true, t);
    this._palette();
    this._shed(dt, fade * 0.7);
    this._volley(dt);
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
    this.stones.visible = false;
    this.stones.count = 0;
    this.blur.visible = false;
    this.blur.count = 0;
    this.cord.visible = false;
    this.crater.visible = false;
  }

  /* ------------------------------------------------------------------ */
  /* The upgrade: the sling, the stones, their blur, the crater floor    */
  /* ------------------------------------------------------------------ */

  /** Half-length of stone `i`, metres. */
  _stoneSize(i) {
    const c = settings[ID];
    return Math.max(0.05, c.stoneSize * (1 + c.stoneJitter * (hash(i, 3) * 2 - 1)));
  }

  /** Where stone `i` touches down and where it comes to rest (derived from its part's strike point). */
  _stonePath(i, n) {
    const c = settings[ID];
    this._partPoint(i, n, _target);
    const skid = Math.max(0, c.stoneSkid);
    _touch.copy(_target).addScaledVector(this.direction, -skid * 0.5);
    _rest.copy(_target).addScaledVector(this.direction, skid * 0.5);
  }

  /** A stone touches down: its own small beat. */
  _stoneLand(i, n) {
    if (i >= MAX_STONES) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._stones[i].land = this.age;
    this._stonePath(i, n);
    const r = this._stoneSize(i);
    _pos.copy(_target).setY(0);
    if (c.craterDecal > 0.01) {
      this.ctx.decals.spawn(DecalType.CRACK, _pos, {
        radius: r * c.craterSize * c.craterCracks * 0.8,
        life: c.groundLife * g.lifetime,
        width: 0.7,
        intensity: c.craterDecal,
        colorA: getColor(c.colorStoneDeep),
        colorB: getColor(c.colorStoneBody),
        height: 0.02
      });
    }
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: r * c.landDust,
      life: c.shockLife,
      width: 0.1,
      intensity: 0.55,
      colorA: getColor(c.colorDustD),
      colorB: getColor(c.colorDustC),
      height: 0.03
    });
    const chips = Math.round(c.landChips * g.particleCount * power);
    if (chips > 0) {
      this._fillEmit(_pos.setY(0.15), r * 0.6, _up, c.chipSpeed * 1.2, 0.75, c.chipSize * 1.3, c.chipLife * 1.2, 8);
      this.chips.emit(chips, _emit);
    }
    const puffs = Math.round(c.landPuffs * g.particleCount);
    for (let k = 0; k < puffs; k++) {
      const ang = (k / Math.max(1, puffs)) * TAU + hash(i, 9) * TAU;
      _dir.set(Math.cos(ang), 0.15, Math.sin(ang));
      this._fillEmit(_pos, r * 0.5, _dir, c.dustSpeed * 1.4, 0.3, 0.5, c.dustLife * 1.3, 0.4);
      this.dust.emit(1, _emit);
    }
    this.ctx.shake.add(c.landShake * power * g.cameraShake, 5, 20);
    this.lightBoost += c.landLight * power;
  }

  /**
   * Lay out the sling, every stone and its blur, and the crater floor, from
   * the settings and each stone's landing time. Allocation-free.
   */
  _volley(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(1, Math.min(MAX_STONES, Math.round(c.count)));
    const speed = Math.max(1, c.speed * g.speed);
    const life = Math.max(0.05, g.lifetime);
    const exit = saturate((this._fadeT - c.stoneExitAt) / Math.max(0.05, 2 - c.stoneExitAt));
    const spinRate = c.stoneSpin * g.animationSpeed;
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _hand.y = c.handHeight;
    let drawn = 0;
    let landed = 0;
    this._flyCount = 0;
    this._spinCount = 0;
    const rest = this.craterMaterial.uniforms.uRest.value;
    const touch = this.craterMaterial.uniforms.uTouch.value;
    for (let i = 0; i < n; i++) {
      const rec = this._stones[i];
      const s = (i + 0.5) / n;
      const r = this._stoneSize(i);
      this._stonePath(i, n);
      const pred = rec.land >= 0 ? rec.land : this.age + Math.max(0, ((i + 0.98) / n * this.length - this.front) / speed);
      const flight = Math.max(0.05, c.stoneFlight * (0.35 + 0.65 * s));
      const tau = this.age - pred;
      let yaw;
      let roll;
      let heat;
      let blur;
      if (tau < 0 || rec.land < 0) {
        const p = saturate(1 + Math.min(0, tau) / flight);
        rest[i].z = -1;
        if (p <= 0) continue;
        const arc = c.stoneArc * (0.3 + 0.7 * s);
        _sp.lerpVectors(_hand, _touch, p);
        _sp.y = c.handHeight + (r * 0.6 - c.handHeight) * p + arc * 4 * p * (1 - p);
        yaw = rec.seed * TAU + this.age * spinRate;
        roll = 0.18 * Math.sin(this.age * 7 + i);
        heat = 1;
        blur = 1;
        if (this._flyCount < MAX_STONES) {
          this._flying[this._flyCount * 3] = _sp.x;
          this._flying[this._flyCount * 3 + 1] = _sp.y;
          this._flying[this._flyCount * 3 + 2] = _sp.z;
          this._flyCount++;
        }
      } else {
        const skidT = 1 - Math.exp(-tau * c.stoneSkidRate);
        const down = Math.max(0.1, c.stoneSpinDown * life);
        const left = Math.exp(-tau / down);
        _sp.lerpVectors(_touch, _rest, skidT);
        yaw = rec.seed * TAU + pred * spinRate + spinRate * down * (1 - left);
        roll = c.stoneWobble * (1 - left) * Math.sin(yaw * 0.5 + rec.seed * 7) * (1 - exit * 0.5);
        const bounce = r * c.stoneBounce * Math.abs(Math.sin(tau * 14)) * Math.exp(-tau * 9);
        _sp.y = r * 0.55 * (1 - c.stoneSink * exit) - r * 0.1 * skidT + bounce;
        heat = 0.1 + 0.9 * Math.exp(-tau / Math.max(0.1, c.stoneCool * life));
        blur = left;
        rest[i].set(_rest.x, _rest.z, tau, r);
        touch[i].set(_touch.x, _touch.z, heat, left);
        landed++;
        if (this._spinCount < MAX_STONES) {
          const k = this._spinCount * 4;
          this._spinning[k] = _sp.x;
          this._spinning[k + 1] = _sp.y;
          this._spinning[k + 2] = _sp.z;
          this._spinning[k + 3] = left * r;
          this._spinCount++;
        }
      }
      // Stone: yaw about the vertical (it flies and spins flat), rocked about its long axis.
      _q.setFromAxisAngle(_up, yaw);
      _qa.setFromAxisAngle(_axisX, roll);
      _q.multiply(_qa);
      _qa.setFromAxisAngle(_axisZ, 0.12 * Math.sin(yaw * 0.25 + i));
      _q.multiply(_qa);
      _scale.setScalar(r);
      _m.compose(_sp, _q, _scale);
      this.stones.setMatrixAt(drawn, _m);
      const k = drawn * 4;
      this._stoneState[k] = heat * c.stoneHeat;
      this._stoneState[k + 1] = exit;
      this._stoneState[k + 2] = rec.seed * 10 + i;
      this._stoneState[k + 3] = blur;
      // Blur disc round it, flat, at its height.
      _q.identity();
      _scale.set(r * c.blurSize, 1, r * c.blurSize);
      _m.compose(_sp, _q, _scale);
      this.blur.setMatrixAt(drawn, _m);
      this._blurState[k] = blur * (1 - exit);
      this._blurState[k + 1] = yaw;
      this._blurState[k + 2] = 0.5;
      this._blurState[k + 3] = 2;
      drawn++;
    }
    for (let i = n; i < MAX_STONES; i++) rest[i].z = -1;

    // The sling: a cord whirling over the throwing shoulder, out to the caster's
    // side and tipped toward the camera so the wind-up reads from behind; a stone
    // rides in its pouch; it folds away after the throw.
    const hold = Math.max(0.05, c.slingTime * life);
    const sling = c.slingRadius > 0.01 ? 1 - saturate((this.age - hold) / 0.18) : 0;
    let blurs = drawn;
    if (sling > 0.001) {
      const phi = this.age * c.slingSpin * g.animationSpeed;
      const R = c.slingRadius * (0.4 + 0.6 * sling);
      _sp.copy(_hand).addScaledVector(this.side, c.slingOut).setY(c.handHeight + c.slingLift);
      // Whirl plane: flat, tipped about the cast line by `slingTilt` (toward the side) and back toward the camera.
      _qa.setFromAxisAngle(this.direction, -c.slingTilt);
      _q.setFromAxisAngle(this.side, -c.slingTilt * 0.6).multiply(_qa);
      this._slingQ.copy(_q);
      _qa.setFromAxisAngle(_up, phi);
      this.cord.quaternion.copy(this._slingQ).multiply(_qa);
      this.cord.position.copy(_sp);
      this.cord.scale.set(R, c.slingCord, c.slingCord);
      this.cord.visible = true;
      this.cordMaterial.color.copy(getColor(c.colorCord));
      // The stone in the pouch, at the cord's end.
      _pos.set(R, 0, -0.1 * R).applyQuaternion(this.cord.quaternion).add(_sp);
      _scale.setScalar(c.stoneSize * 0.6);
      _m.compose(_pos, this.cord.quaternion, _scale);
      this.stones.setMatrixAt(drawn, _m);
      const ps = drawn * 4;
      this._stoneState[ps] = 0.7 * c.stoneHeat;
      this._stoneState[ps + 1] = 0;
      this._stoneState[ps + 2] = 3.3;
      this._stoneState[ps + 3] = 1;
      drawn++;
      _scale.set(R * 1.12, 1, R * 1.12);
      _m.compose(_sp, this._slingQ, _scale);
      this.blur.setMatrixAt(blurs, _m);
      const k = blurs * 4;
      this._blurState[k] = sling * c.slingBlur;
      this._blurState[k + 1] = phi;
      this._blurState[k + 2] = 0.55;
      this._blurState[k + 3] = 1;
      blurs++;
    } else {
      this.cord.visible = false;
    }
    this.stones.count = drawn;
    this.stones.visible = drawn > 0;
    this.stones.castShadow = c.stoneShadow >= 0.5;
    this.stones.instanceMatrix.needsUpdate = true;
    this._stoneAttr.needsUpdate = true;
    this.stoneMaterial.userData.sync();
    this.blur.count = blurs;
    this.blur.visible = blurs > 0 && c.blurOpacity > 0.01;
    this.blur.instanceMatrix.needsUpdate = true;
    this._blurAttr.needsUpdate = true;
    this.blurMaterial.userData.sync();

    // The crater floor over the strip the volley covers.
    const erode = saturate((this._fadeT - c.craterErodeAt) / Math.max(0.05, 2 - c.craterErodeAt));
    if (landed > 0 && erode < 0.99 && c.craterOpacity > 0.01) {
      const width = 2 * c.sweep + 6 * c.stoneSize * c.craterSize;
      this.crater.position.copy(this.origin).addScaledVector(this.direction, this.length * 0.5);
      this.crater.position.y = 0.02;
      this.crater.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
      this.crater.scale.set(width, 1, this.length + 4 * c.stoneSize * c.craterSize + c.stoneSkid);
      this.crater.visible = true;
      this.craterMaterial.userData.sync(n, erode);
    } else {
      this.crater.visible = false;
    }

    // Grit streaming off the stones in flight; dust kicked by the ones still spinning.
    const trailN = Math.round(this._trailEmitter.tick(dt, c.stoneTrail * this._flyCount) * g.particleCount);
    for (let k = 0; k < trailN && this._flyCount > 0; k++) {
      const j = Math.floor(Math.random() * this._flyCount) * 3;
      _pos.set(this._flying[j], this._flying[j + 1], this._flying[j + 2]);
      _dir.copy(this.direction).multiplyScalar(-1).setY(0.25);
      this._fillEmit(_pos, c.stoneSize * 0.5, _dir, c.streakSpeed * 0.5, 0.35, 0.07, c.streakLife, 2);
      this.streaks.emit(1, _emit);
    }
    const dustN = Math.round(this._spinDustEmitter.tick(dt, c.stoneSpinDust * this._spinCount) * g.particleCount);
    for (let k = 0; k < dustN && this._spinCount > 0; k++) {
      const j = Math.floor(Math.random() * this._spinCount) * 4;
      if (this._spinning[j + 3] < 0.05) continue;
      const ang = Math.random() * TAU;
      _pos.set(this._spinning[j] + Math.cos(ang) * this._spinning[j + 3] * 2, 0.08, this._spinning[j + 2] + Math.sin(ang) * this._spinning[j + 3] * 2);
      _dir.set(-Math.sin(ang), 0.35, Math.cos(ang));
      this._fillEmit(_pos, 0.1, _dir, c.dustSpeed * 0.7, 0.3, 0.35, c.dustLife, 0.4);
      this.dust.emit(1, _emit);
    }
  }

  dispose() {
    this.stoneGeometry.dispose();
    this.stoneMaterial.dispose();
    this.stones.dispose();
    this.blurGeometry.dispose();
    this.blurMaterial.dispose();
    this.blur.dispose();
    this.cordGeometry.dispose();
    this.cordMaterial.dispose();
    this.craterGeometry.dispose();
    this.craterMaterial.dispose();
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
  const folder = gui.addFolder('Sling Volley');
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
  R(hero, c, 'heroMinSpan', 0, 6, 0.05, 'min span (m)');
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

  const sling = folder.addFolder('15 · The sling');
  R(sling, c, 'slingRadius', 0, 3, 0.01, 'whirl radius (m)');
  R(sling, c, 'slingSpin', 0, 60, 0.5, 'whirl (rad/s)');
  R(sling, c, 'slingLift', -1, 2, 0.01, 'above the fist (m)');
  R(sling, c, 'slingTime', 0.05, 2, 0.01, 'whirls for (s)');
  R(sling, c, 'slingBlur', 0, 3, 0.01, 'whirl smear');
  R(sling, c, 'slingOut', -2, 2, 0.01, 'out to the side (m)');
  R(sling, c, 'slingTilt', -1.5, 1.5, 0.01, 'whirl tilt (rad)');
  R(sling, c, 'slingCord', 0.2, 6, 0.05, 'cord thickness, ×');
  sling.addColor(c, 'colorCord').name('cord');

  const stones = folder.addFolder('16 · Stones');
  R(stones, c, 'stoneSize', 0.05, 2, 0.01, 'half-length (m)');
  R(stones, c, 'stoneJitter', 0, 0.8, 0.01, 'size jitter');
  R(stones, c, 'stoneFlight', 0.05, 1.5, 0.01, 'flight (s, far stone)');
  R(stones, c, 'stoneArc', 0, 6, 0.05, 'arc height (m)');
  R(stones, c, 'stoneSpin', 0, 80, 0.5, 'spin (rad/s)');
  R(stones, c, 'stoneSpinDown', 0.1, 6, 0.05, 'spins down over (s)');
  R(stones, c, 'stoneWobble', 0, 1.2, 0.01, 'wobble as it slows');
  R(stones, c, 'stoneSkid', 0, 4, 0.01, 'skid (m)');
  R(stones, c, 'stoneSkidRate', 0.5, 30, 0.1, 'skid stops (1/s)');
  R(stones, c, 'stoneBounce', 0, 2, 0.01, 'bounce');
  R(stones, c, 'stoneSink', 0, 1.5, 0.01, 'beds in on exit');
  R(stones, c, 'stoneExitAt', 1, 1.95, 0.01, 'crumbles from');
  R(stones, c, 'stoneHeat', 0, 2, 0.01, 'heat');
  R(stones, c, 'stoneCool', 0.1, 6, 0.05, 'cools over (s)');
  R(stones, c, 'stoneCrackScale', 0.5, 10, 0.05, 'crack scale');
  R(stones, c, 'stoneCrackGlow', 0, 6, 0.05, 'crack glow');
  R(stones, c, 'stoneAmbient', 0, 1.5, 0.01, 'ambient');
  R(stones, c, 'stoneSpecular', 0, 3, 0.01, 'specular');
  R(stones, c, 'stoneFresnel', 0, 3, 0.01, 'rim');
  R(stones, c, 'stoneShadow', 0, 1, 1, 'cast shadow');
  R(stones, c, 'stoneTrail', 0, 200, 1, 'grit / s per stone');
  R(stones, c, 'stoneSpinDust', 0, 200, 1, 'spin dust / s per stone');
  stones.addColor(c, 'colorStoneCore').name('core');
  stones.addColor(c, 'colorStoneTint').name('tint');
  stones.addColor(c, 'colorStoneBody').name('body');
  stones.addColor(c, 'colorStoneDeep').name('deep');

  const blur = folder.addFolder('17 · Spin blur');
  R(blur, c, 'blurOpacity', 0, 3, 0.01, 'strength');
  R(blur, c, 'blurSize', 0.5, 4, 0.01, 'radius, × stone');
  R(blur, c, 'blurTrail', 0.05, 4, 0.01, 'smear (rad)');

  const crater = folder.addFolder('18 · Landings');
  R(crater, c, 'craterSize', 0.3, 4, 0.01, 'crater, × stone');
  R(crater, c, 'craterCracks', 1, 5, 0.01, 'crack reach, × crater');
  R(crater, c, 'craterGouge', 0, 2, 0.01, 'gouge width, × stone');
  R(crater, c, 'craterOpacity', 0, 1.5, 0.01, 'opacity');
  R(crater, c, 'craterGlow', 0, 5, 0.05, 'crack glow');
  R(crater, c, 'craterErodeAt', 1, 1.95, 0.01, 'erodes from');
  R(crater, c, 'craterDecal', 0, 1.5, 0.01, 'crack decal');
  R(crater, c, 'landChips', 0, 80, 1, 'chips / landing');
  R(crater, c, 'landPuffs', 0, 40, 1, 'dust / landing');
  R(crater, c, 'landDust', 0, 8, 0.05, 'dust ring, × stone');
  R(crater, c, 'landShake', 0, 1, 0.01, 'camera punch');
  R(crater, c, 'landLight', 0, 20, 0.1, 'light punch');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
