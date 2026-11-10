import { DynamicDrawUsage, ExtrudeGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Shape, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createMirrorHaloPieceGeometry, createMirrorHaloHeroGeometry } from '../../assets/codex/MirrorHaloGeometry.js';
import {
  createMirrorHaloBodyMaterial,
  createMirrorHaloLensMaterial,
  createMirrorHaloGroundMaterial,
  createMirrorHaloVoiceMaterial,
  createMirrorHaloDetailMaterial,
  createMirrorGlassMaterial,
  createMirrorPoolMaterial
} from '../../materials/codex/MirrorHaloMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'mirrorhalo';

const TWIST = 'braid';
const ARCH = 'halo';
const HIT = 'ring';
const CARRY = 'orbit';
const WHEN = 'commit';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = true;
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
const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _sc = new Vector3();
const _out = new Vector3();
const _tan = new Vector3();
const _yAxis = new Vector3(0, 1, 0);
const TAU = Math.PI * 2;
/** Panels per ring, at most; three rings plus the central shard. */
const MAX_PANELS = 16;
const MAX_GLASS = 1 + 3 * MAX_PANELS;
/** Each ring's radius as a share of the circle before they agree: inside, true, outside (× ringSpread). */
const RING_SIDE = [-1.05, 0, 1];
const RING_HEIGHT = [0.8, 1, 0.9];
const RING_WALK = [1, -0.75, 1.3];

/* ------------------------------------------------------------------ */
/* Upgrade pass: the mirror panel                                      */
/* ------------------------------------------------------------------ */

/** The panel's outline, x across (−0.5..0.5), y up (0..1): a pointed, cusped mirror. */
const PANEL_OUTLINE = [
  [-0.42, 0], [0.42, 0], [0.46, 0.08], [0.5, 0.58], [0.44, 0.7], [0.47, 0.76], [0.3, 0.9], [0, 1], [-0.3, 0.9], [-0.47, 0.76], [-0.44, 0.7], [-0.5, 0.58], [-0.46, 0.08]
];

/**
 * One mirror panel: the cusped outline extruded 0.07 thick with a bevelled
 * arris all round, so the frame catches the sun and the faces read as glass.
 * One unit tall and one wide (stretched per instance), standing on y = 0,
 * its mirror face toward +Z. Carries `aEdge` (1 on the bevelled frame, 0 in
 * the glass) and `aPane` (the face's own x, y in 0..1 for the crack field).
 */
function createMirrorPanelGeometry() {
  const shape = new Shape();
  PANEL_OUTLINE.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -0.02);
  const flat = g.toNonIndexed();
  g.dispose();
  const pos = flat.getAttribute('position');
  const edge = new Float32Array(pos.count);
  const pane = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // The bevel walls are the frame; the faces get their inner frame in the shader.
    edge[i] = Math.abs(pos.getZ(i)) < 0.035 ? 1 : 0;
    pane[i * 2] = x + 0.5;
    pane[i * 2 + 1] = y;
  }
  flat.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
  flat.setAttribute('aPane', new Float32BufferAttribute(pane, 2));
  flat.deleteAttribute('uv');
  flat.computeVertexNormals();
  flat.computeBoundingSphere();
  return flat;
}

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;

/**
 * MIRROR HALO — illusion, zone cast.
 *
 * Illusion — three mirror rings walk the rim and disagree about where it is.
 *
 * Three rings disagree about the rim. The hit is the ring that arrives last.
 *
 * The read is `braid`: hit timing `commit`, blow `ring`, carry `orbit`.
 *
 * ## Layers
 *
 *   1. **body** — the braid placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled illusion field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a crown riding alongside the body, spun the other way.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createMirrorHaloPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createMirrorHaloHeroGeometry`), stood by its archetype (halo): held flat on the ground, turning, pulsing on the beat.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: three rings disagree about the rim. The hit is the ring that arrives last.
 *  10. **mark** — a felled body is glamoured: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The mirrors (upgrade pass — the cast's own silhouette)
 *
 * The template rig, body, voice, pieces and field are off by default; the
 * spell's noun is now glass:
 *
 *  - **travel** — one mirror shard (instance 0 of the glass, the cusped
 *    panel of `createMirrorPanelGeometry`) leaves the hand and flies to the
 *    centre on a shallow lob, spinning on its long axis so it flashes.
 *  - **impact** — it plants upright as a `centreHeight` mirror, the mirror
 *    pool lands under the circle (`createMirrorPoolMaterial`), and three
 *    rings of `ringPanels` tall mirrors rise out of the floor, staggered —
 *    one inside the rim, one on it, one outside it (`ringSpread`).
 *  - **walk** — the rings turn against each other and breathe in and out
 *    (`ringWalk`, `ringWobble`): three answers to where the rim is. From
 *    `convergeFrom` to `convergeTo` they *agree* — every ring walks onto the
 *    true radius (`zoneRadius`, where the blow landed) and the panels
 *    interleave into one closed wall, which pulses as it locks.
 *  - **linger** — the wall turns slowly (`lockSpin`); cracks run through
 *    the glass (`crackFrom`) and the pool cracks out from the centre.
 *  - **exit** — panel by panel, in a scattered order (`fallStagger`), the
 *    mirrors tip outward, shed lit glass chips and sink into the pool, which
 *    breaks up from the rim.
 *
 * The glass (`createMirrorGlassMaterial`) is sun-lit near-black plum metal
 * glass on `LAYER.WORLD`, casting shadows; its read as a mirror comes from a
 * fresnel rim, a fake reflection, a sweeping streak and a glowing frame.
 * Hits are the template's, unchanged (`commit`, on the beat).
 *
 * Every metre, rate and colour is read from `settings.mirrorhalo` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class MirrorHaloAbility extends Ability {
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
    this.bodyMaterial = createMirrorHaloBodyMaterial();
    this.lensMaterial = createMirrorHaloLensMaterial();
    this.groundMaterial = createMirrorHaloGroundMaterial();
    this.voiceMaterial = createMirrorHaloVoiceMaterial();
    this.detailMaterial = createMirrorHaloDetailMaterial();
    this.heroMaterial = createMirrorHaloDetailMaterial(true);
    this.detail = new DetailLayer(createMirrorHaloPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createMirrorHaloHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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

    // The glass: instance 0 is the travelling / central shard, then three rings.
    this.panelGeometry = createMirrorPanelGeometry();
    this._inst = new InstancedBufferAttribute(new Float32Array(MAX_GLASS * 2), 2);
    this._inst.setUsage(DynamicDrawUsage);
    this.panelGeometry.setAttribute('aInst', this._inst);
    this.glassMaterial = createMirrorGlassMaterial();
    this.glass = new InstancedMesh(this.panelGeometry, this.glassMaterial, MAX_GLASS);
    this.glass.layers.set(LAYER.WORLD);
    this.glass.castShadow = true;
    this.glass.receiveShadow = true;
    this.glass.frustumCulled = false;
    this.glass.visible = false;
    this.group.add(this.glass);
    this.poolGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.poolMaterial = createMirrorPoolMaterial();
    this.pool = this._mesh(this.poolGeometry, this.poolMaterial, LAYER.VFX, 2);
    this.pool.rotation.x = -Math.PI / 2;
    this._ringAngle = [0, 0, 0];
    this._lockAngle = 0;
    this._beatAge = -1;
    this._locked = false;
    this._lockPulse = 0;
    this._fell = new Uint8Array(MAX_GLASS);
    this._panelSeed = new Float32Array(MAX_GLASS);
  }

  /**
   * The glass this frame: the shard in flight, then the centre mirror and the
   * three rings — rise, walk, agree, crack, fall — on the beat's own clock.
   * Presentation only; the blow was dealt on the beat.
   *
   * @param {number} dt
   * @param {number} fadeT 0 in flight; the onFade clock (0..2) after the beat
   */
  _mirrors(dt, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const mesh = this.glass;
    const inst = this._inst.array;
    const R = Math.max(0.5, c.zoneRadius);
    this.pointAt(1, _focus);
    let k = 0;
    // Instance 0: the shard.
    if (this._beatAge < 0) {
      const u = this.u;
      _pos.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide).setY(c.handHeight);
      _pos.lerp(_focus, Easing.inOutQuad(u));
      _pos.y = lerp(c.handHeight, 0.1, Easing.inQuad(u)) + c.shardArc * 4 * u * (1 - u);
      _q.setFromAxisAngle(_yAxis, this.age * c.shardSpin * g.animationSpeed);
      const grow = Easing.outCubic(saturate(this.age / 0.12));
      _sc.set(c.shardHeight * 0.55 * grow, c.shardHeight * grow, grow);
      _m.compose(_pos, _q, _sc);
      mesh.setMatrixAt(0, _m);
      inst[0] = this._seed;
      inst[1] = 0;
      mesh.count = 1;
      mesh.visible = c.shardHeight > 0.01;
      this._inst.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.glassMaterial.userData.sync(0);
      this.pool.visible = false;
      return;
    }
    this._beatAge += dt;
    const age = this._beatAge;
    const ti = Math.min(1, fadeT);
    const conv = Easing.inOutCubic(saturate((ti - c.convergeFrom) / Math.max(0.02, c.convergeTo - c.convergeFrom)));
    if (!this._locked && conv >= 1) this._lock();
    this._lockPulse = Math.max(0, this._lockPulse - dt * 3);
    const life = this.impactDuration;
    // The central mirror: plants, grows to full height, turns slowly, cracks and falls first.
    {
      const grow = Easing.outBack(saturate(age / 0.14));
      const fall = this._fall(0, fadeT, 0);
      this._lockAngle += dt * c.lockSpin * g.animationSpeed;
      _q.setFromAxisAngle(_yAxis, this._lockAngle * 1.6 + this._seed);
      this._place(0, _focus, _q, c.centreWidth, c.centreHeight * grow, fall, null);
      inst[0] = this._seed;
      inst[1] = this._crack(0, fadeT);
      k = 1;
    }
    const n = Math.max(1, Math.min(MAX_PANELS, Math.round(c.ringPanels)));
    const step = TAU / n;
    for (let ring = 0; ring < 3; ring++) {
      // Rise, staggered by ring.
      const rise = Easing.outBack(saturate((age - ring * c.riseStagger * g.lifetime) / Math.max(0.02, c.riseTime * g.lifetime)));
      // Walk: each ring turns its own way until it agrees, then they turn as one.
      this._ringAngle[ring] += dt * c.ringWalk * RING_WALK[ring] * (1 - conv) * g.animationSpeed;
      const own = ((this._ringAngle[ring] % step) + step) % step;
      const target = (ring * step) / 3;
      let delta = target - own;
      delta -= Math.round(delta / step) * step;
      const angle = own + delta * conv * conv + this._lockAngle;
      const wobble = c.ringWobble * Math.sin(age * 2.6 + ring * 2.1) * (1 - conv);
      const r = R * (1 + (RING_SIDE[ring] * c.ringSpread + wobble) * (1 - conv));
      const width = lerp((TAU * r / n) * c.panelFill, (TAU * R / (3 * n)) * c.lockFill, conv);
      const height = c.panelHeight * lerp(RING_HEIGHT[ring], 1, conv) * rise;
      for (let i = 0; i < n; i++, k++) {
        const fall = this._fall(k, fadeT, this._panelSeed[k]);
        const a = angle + i * step;
        _out.set(Math.cos(a), 0, Math.sin(a));
        _pos.copy(_focus).addScaledVector(_out, r);
        // Face the centre, leaning the top in a little.
        _q.setFromAxisAngle(_yAxis, Math.atan2(-_out.x, -_out.z));
        _tan.set(-_out.z, 0, _out.x);
        _q2.setFromAxisAngle(_tan, -c.leanIn);
        _q.premultiply(_q2);
        this._place(k, _pos, _q, width, height, fall, _out);
        inst[k * 2] = this._panelSeed[k];
        inst[k * 2 + 1] = this._crack(k, fadeT);
      }
    }
    mesh.count = k;
    mesh.visible = true;
    mesh.instanceMatrix.needsUpdate = true;
    this._inst.needsUpdate = true;
    this.glassMaterial.userData.sync(this._lockPulse * c.lockPulse);
    // The pool.
    const pr = R * c.poolReach;
    this.pool.position.copy(_focus).setY(0.033);
    this.pool.scale.set(pr, pr, 1);
    const land = Easing.outCubic(saturate(age / 0.25)) * 1.02;
    const open = saturate((ti - 0.15) / 0.7) * 0.6 + saturate(fadeT - 1) * 0.4;
    const heat = fadeT < 1 ? 0.6 + 0.4 * conv : 1 - 0.6 * saturate(fadeT - 1);
    const erode = fadeT > 1.55 ? saturate((fadeT - 1.55) / 0.45) : 0;
    this.poolMaterial.userData.sync(this._seed, land, open, heat, erode, 1 / Math.max(0.5, c.poolReach));
    this.pool.visible = c.poolOpacity > 0.01 && erode < 0.99;
  }

  /** 0..1 how far the glass of instance k has cracked. */
  _crack(k, fadeT) {
    const c = settings[ID];
    return saturate((fadeT - c.crackFrom - this._panelSeed[k] * 0.3) / 0.35);
  }

  /** 0..1 how far instance k has fallen; the first frame it starts, it sheds its chips. */
  _fall(k, fadeT, seed) {
    const c = settings[ID];
    const f = saturate((fadeT - c.fallFrom - seed * c.fallStagger) / Math.max(0.02, c.fallTime));
    if (f > 0 && !this._fell[k]) {
      this._fell[k] = 1;
      this._shatter(k);
    }
    return f;
  }

  /** Stand instance k: tipped outward by `fall` about its foot, sinking and shrinking as it goes. */
  _place(k, at, q, width, height, fall, out) {
    const tip = Easing.inQuad(fall);
    if (tip > 0) {
      if (out) _tan.set(-out.z, 0, out.x);
      else _tan.copy(this.side);
      _q2.setFromAxisAngle(_tan, -tip * 1.35);
      q.premultiply(_q2);
    }
    _pos.copy(at);
    _pos.y = -tip * tip * height * 0.7;
    const shrink = 1 - 0.55 * tip;
    _sc.set(Math.max(0.01, width) * shrink, Math.max(0.01, height) * shrink, shrink);
    _m.compose(_pos, q, _sc);
    this.glass.setMatrixAt(k, _m);
  }

  /** A panel breaks: lit glass chips burst off it. */
  _shatter(k) {
    const c = settings[ID];
    const g = settings.global;
    const count = Math.round(c.fallChips * g.particleCount);
    if (count <= 0) return;
    this.glass.getMatrixAt(k, _m);
    _pos.setFromMatrixPosition(_m);
    _pos.y = Math.max(0.4, c.panelHeight * 0.5);
    _dir.copy(_pos).sub(this.pointAt(1, _end)).setY(0.6);
    this._fillEmit(_pos, c.panelHeight * 0.3, _dir.normalize(), c.chipSpeed, 0.8, c.chipSize * 1.6, c.chipLife * 1.4, 8);
    this.chips.emit(count, _emit);
  }

  /** The rings agree: the wall locks with a pulse, a soft thud and a light punch (presentation only). */
  _lock() {
    const c = settings[ID];
    const g = settings.global;
    this._locked = true;
    this._lockPulse = 1;
    this.lightBoost += c.lockLight * g.explosionIntensity;
    this.ctx.shake.add(c.lockShake * g.cameraShake, 5, 14);
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
    this.dust = particles.get('mirrorhalo.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('mirrorhalo.streak', {
      capacity: 1200,
      shape: ParticleShape.RING,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('mirrorhalo.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('mirrorhalo.mote', {
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
    this._beatAge = -1;
    this._locked = false;
    this._lockPulse = 0;
    this._lockAngle = 0;
    for (let r = 0; r < 3; r++) this._ringAngle[r] = Math.random() * TAU;
    this._fell.fill(0);
    for (let i = 0; i < MAX_GLASS; i++) this._panelSeed[i] = i === 0 ? 0 : Math.random();
    this.glass.visible = false;
    this.pool.visible = false;
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
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this._mirrors(dt, 0);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    this._beatAge = 0;
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 1.65;
    this._pose(true, t);
    this._palette();
    this._shed(dt, fade * 0.7);
    this._mirrors(dt, t);
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
    this.glass.visible = false;
    this.pool.visible = false;
  }

  dispose() {
    this.panelGeometry.dispose();
    this.glassMaterial.dispose();
    this.glass.dispose();
    this.poolGeometry.dispose();
    this.poolMaterial.dispose();
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
  const folder = gui.addFolder('Mirror Halo');
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

  const shape = folder.addFolder('1 · Shape — braid');
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

  const glass = folder.addFolder('14 · The mirrors');
  R(glass, c, 'shardHeight', 0, 4, 0.05, 'shard in flight (m)');
  R(glass, c, 'shardSpin', 0, 40, 0.5, 'shard spin (rad/s)');
  R(glass, c, 'shardArc', 0, 5, 0.05, 'shard lob (m)');
  R(glass, c, 'centreHeight', 0, 6, 0.05, 'centre mirror (m)');
  R(glass, c, 'centreWidth', 0.2, 3, 0.05, 'centre width (m)');
  R(glass, c, 'ringPanels', 1, 16, 1, 'panels per ring');
  R(glass, c, 'panelHeight', 0.3, 6, 0.05, 'panel height (m)');
  R(glass, c, 'panelFill', 0.1, 1.2, 0.01, 'panel width (share of its arc)');
  R(glass, c, 'lockFill', 0.3, 1.6, 0.01, 'locked width (share)');
  R(glass, c, 'ringSpread', 0, 0.8, 0.01, 'disagreement (× circle)');
  R(glass, c, 'ringWobble', 0, 0.4, 0.01, 'breathing (× circle)');
  R(glass, c, 'ringWalk', 0, 6, 0.05, 'walk (rad/s)');
  R(glass, c, 'riseTime', 0.02, 1, 0.01, 'rise (s)');
  R(glass, c, 'riseStagger', 0, 0.4, 0.01, 'ring stagger (s)');
  R(glass, c, 'convergeFrom', 0, 1, 0.01, 'agree from');
  R(glass, c, 'convergeTo', 0.05, 1, 0.01, 'agreed by');
  R(glass, c, 'leanIn', -0.5, 0.5, 0.01, 'lean in (rad)');
  R(glass, c, 'lockSpin', -2, 2, 0.01, 'wall turn (rad/s)');
  R(glass, c, 'lockPulse', 0, 4, 0.05, 'lock pulse');
  R(glass, c, 'lockShake', 0, 1, 0.01, 'lock thud');
  R(glass, c, 'lockLight', 0, 40, 0.5, 'lock light');
  R(glass, c, 'crackFrom', 0.3, 1.9, 0.01, 'cracks from');
  R(glass, c, 'fallFrom', 0.5, 1.95, 0.01, 'falls from');
  R(glass, c, 'fallStagger', 0, 0.9, 0.01, 'fall scatter');
  R(glass, c, 'fallTime', 0.05, 0.9, 0.01, 'fall time');
  R(glass, c, 'fallChips', 0, 40, 1, 'chips per panel');
  R(glass, c, 'mirrorRough', 0, 1, 0.01, 'roughness');
  R(glass, c, 'mirrorMetal', 0, 1, 0.01, 'metalness');
  R(glass, c, 'mirrorRim', 0, 4, 0.05, 'fresnel rim');
  R(glass, c, 'mirrorReflect', 0, 2, 0.01, 'reflection');
  R(glass, c, 'mirrorSweep', 0, 2, 0.01, 'streak speed');
  R(glass, c, 'mirrorStreak', 0, 4, 0.05, 'streak');
  R(glass, c, 'mirrorFrame', 0, 6, 0.05, 'frame glow');
  R(glass, c, 'crackGlow', 0, 8, 0.05, 'crack glow');
  glass.addColor(c, 'colorMirror').name('glass');
  glass.addColor(c, 'colorMirrorSky').name('reflection, sky');
  glass.addColor(c, 'colorMirrorFloor').name('reflection, floor');
  glass.addColor(c, 'colorMirrorRim').name('fresnel rim');
  glass.addColor(c, 'colorCrack').name('crack');

  const pool = folder.addFolder('15 · Mirror pool');
  R(pool, c, 'poolReach', 0.5, 2.5, 0.01, 'radius (× circle)');
  R(pool, c, 'poolOpacity', 0, 1.5, 0.01, 'opacity');
  R(pool, c, 'poolGlow', 0, 6, 0.05, 'crack glow');
  R(pool, c, 'poolCracks', 3, 32, 1, 'cracks');
  pool.addColor(c, 'colorPoolDeep').name('deep');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
