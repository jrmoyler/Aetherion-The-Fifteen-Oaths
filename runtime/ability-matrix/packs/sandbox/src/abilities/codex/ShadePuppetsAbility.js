import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createLimbGeometry,
  createCrownGeometry,
  createStringsGeometry,
  createConeGeometry,
  createPuppetQuadGeometry
} from '../../assets/codex/ShadePuppetsGeometry.js';
import {
  MAX_STRINGS,
  MAX_POOLS,
  createPuppetMaterial,
  createCrownMaterial,
  createStringsMaterial,
  createSpotlightMaterial,
  createStageMaterial,
  createSlumpWarpMaterial
} from '../../materials/codex/ShadePuppetsMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'shadepuppet';

const TAU = Math.PI * 2;
/** Hard ceiling on puppets; the editor's count slider clamps to it. */
const MAX_PUPPETS = MAX_POOLS;
/** Body parts per puppet: torso, head, two arms of two, two legs of two. */
const PARTS = 10;
/** The master string, from the crown back to the caster's hand. */
const MASTER = MAX_STRINGS - 1;

/* joint indices */
const PELVIS = 0;
const NECK = 1;
const HEAD = 2;
const SH_L = 3;
const EL_L = 4;
const HA_L = 5;
const SH_R = 6;
const EL_R = 7;
const HA_R = 8;
const HIP_L = 9;
const KN_L = 10;
const FT_L = 11;
const HIP_R = 12;
const KN_R = 13;
const FT_R = 14;
const JOINTS = 15;

/** Part table: [from joint, to joint, radius key]. */
const PART_TABLE = [
  [PELVIS, NECK, 'torsoRadius'],
  [NECK, HEAD, 'headRadius'],
  [SH_L, EL_L, 'armRadius'],
  [EL_L, HA_L, 'armRadius'],
  [SH_R, EL_R, 'armRadius'],
  [EL_R, HA_R, 'armRadius'],
  [HIP_L, KN_L, 'legRadius'],
  [KN_L, FT_L, 'legRadius'],
  [HIP_R, KN_R, 'legRadius'],
  [KN_R, FT_R, 'legRadius']
];

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _X = new Vector3();
const _Y = new Vector3();
const _Z = new Vector3();
const _upF = new Vector3();
const _fwdF = new Vector3();
const _hand = new Vector3();
const _hover = new Vector3();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);

/** Pose parameters, reused. Angles in radians. */
const _pose = {
  fall: 0, // the whole figure tipped forward (0 upright, ~1.5 face down)
  lean: 0,
  side: 0,
  nod: 0,
  tilt: 0,
  raiseL: 0,
  raiseR: 0,
  elbowL: 0,
  elbowR: 0,
  swingL: 0,
  swingR: 0,
  flexL: 0,
  flexR: 0,
  kneeL: 0,
  kneeR: 0,
  splay: 0
};

/** The figure's right, for `local` — set by `_solve`. */
let _right = _X;

/** A point in the posed figure's tipped frame. Module-level so posing never allocates. */
function local(x, y, z, out) {
  return out.copy(_right).multiplyScalar(x).addScaledVector(_upF, y).addScaledVector(_fwdF, z);
}

/** A snappy, marionette jerk: a sine pushed toward a square. */
function jerk(x) {
  const s = Math.sin(x);
  return Math.sign(s) * Math.pow(Math.abs(s), 0.35);
}

/**
 * SHADE PUPPETS — a puppeteer's crown is flung over the circle, shadow
 * marionettes are hauled up out of the floor on glowing strings round its rim,
 * made to dance, and then yanked in to collapse in a heap in the middle.
 *
 * A zone cast told as a little puppet show. **The throw**: a thorned crown of
 * obsidian is flung from the caster's hand, spinning, trailing a master string
 * back to the hand, and brakes to hover high over the circle. **The stage**:
 * the circle draws itself as a theatre ring — a shadowed floor, a double
 * footlight ring with flickering lamps — and a soft shaft of pale light drops
 * from the crown onto it. **The strings**: glowing hairlines pay down from the
 * crown's hooks to the floor round the rim, three to a puppet, where pools of
 * ink open. **The puppets**: one after another, jointed shadow marionettes —
 * ink-lacquered spindles with burning violet pivots — are hauled up out of the
 * pools by the head and hands, limp, feet dangling. **The dance**: they jerk
 * through a marionette dance, hands yanked up in turn, knees kicked, little
 * hops, heads lolling, the strings humming and pulses of tension running down
 * them. **The fall**: the crown jerks — every puppet is snatched into the air,
 * arms wrenched up, and flung inward, tumbling, to land face down in a heap in
 * the middle — an ink splash, a thump in the air, a knock to the camera — and
 * everything standing in the circle is dragged down with them. The strings
 * snap and whip back, the crown shatters into motes, and the heap crumbles
 * into ink smoke from the floor up. The stage fades.
 *
 * Deliberately not Wraith Host: no hooded ghosts, no circling or diving, no
 * draining — figures with *bodies*, on strings, worked from above, that fall.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the crown** (`createCrownMaterial`) — real flat-shaded geometry.
 *   2. **the strings** (`createStringsMaterial`) — all in one additive draw.
 *   3. **the puppets** (`createPuppetMaterial`) — one InstancedMesh of a
 *      carved spindle, ten parts a puppet, posed by a small forward
 *      kinematics on the CPU every frame and laid between joints through
 *      `instanceMatrix`; a per-instance dissolve.
 *   4. **the spotlight** — the shaft of light.
 *   5. **the stage** — ring, lamps, ink pools, splat.
 *   6. **ink, motes, sparks** — three particle systems.
 *   7. **the fall** — AIR shell tinted violet, DUSTRING, SHOCKWAVE, the slump
 *      warp, flash, shake, light punch; `handlesOwnHits`: everything in the
 *      circle is dragged in and down when the puppets land.
 *
 * ## The editor rule
 *
 * A puppet record stores only dice (bearing, seed, dance phase, where in the
 * heap it lands). Its pose, its height, the strings, the crown and every
 * timing are resolved from `settings.shadepuppet` every frame on one clock.
 */
export class ShadePuppetsAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._drawn;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.quadGeometry = createPuppetQuadGeometry();

    this.stageMaterial = createStageMaterial();
    this.stage = this._mesh(this.quadGeometry, this.stageMaterial, LAYER.VFX, 2);

    this.coneGeometry = createConeGeometry(12, 48);
    this.spotMaterial = createSpotlightMaterial();
    this.spot = this._mesh(this.coneGeometry, this.spotMaterial, LAYER.VFX, 18);

    this.crownGeometry = createCrownGeometry(12, 48);
    this.crownMaterial = createCrownMaterial();
    this.crown = new Mesh(this.crownGeometry, this.crownMaterial);
    this.crown.layers.set(LAYER.VFX);
    this.crown.renderOrder = 11;
    this.crown.frustumCulled = false;
    this.crown.visible = false;
    this.group.add(this.crown);

    this.stringsGeometry = createStringsGeometry(MAX_STRINGS, 24);
    this.stringsMaterial = createStringsMaterial();
    this.strings = this._mesh(this.stringsGeometry, this.stringsMaterial, LAYER.VFX, 15);

    this.limbGeometry = createLimbGeometry(14, 10);
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_PUPPETS * PARTS * 2), 2);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.limbGeometry.setAttribute('aState', this.stateAttr);
    this.puppetMaterial = createPuppetMaterial();
    this.puppets = new InstancedMesh(this.limbGeometry, this.puppetMaterial, MAX_PUPPETS * PARTS);
    this.puppets.instanceMatrix.setUsage(DynamicDrawUsage);
    this.puppets.layers.set(LAYER.VFX);
    this.puppets.renderOrder = 12;
    this.puppets.frustumCulled = false;
    this.puppets.count = 0;
    this.puppets.visible = false;
    this.group.add(this.puppets);

    this.warpMaterial = createSlumpWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    /** One record per puppet: dice and scratch joints. */
    this._puppets = [];
    for (let i = 0; i < MAX_PUPPETS; i++) {
      const joints = [];
      for (let j = 0; j < JOINTS; j++) joints.push(new Vector3());
      this._puppets.push({
        bearing: 0,
        seed: 0,
        phase: 0,
        heapA: 0,
        heapR: 0,
        tumble: 0,
        base: new Vector3(),
        fwd: new Vector3(0, 0, 1),
        right: new Vector3(1, 0, 0),
        pelvis: new Vector3(),
        launch: new Vector3(),
        land: new Vector3(),
        launched: false,
        dissolve: 0,
        joints,
        inkEmitter: new RateEmitter()
      });
    }

    this._center = new Vector3();
    this._crownPos = new Vector3();
    this._crownSpin = 0;
    this._seed = 0;
    this._tau = 0;
    this._pulse = 0;
    this._landed = false;
    this._drawn = 0;
    this._snapAt = new Vector3();

    this._stageState = { center: new Vector3(), open: 0, splat: 0, fadeT: 0, seed: 0 };
    this._crownState = { pulse: 0, fade: 1, seed: 0 };
    this._spotState = { apex: new Vector3(), base: new Vector3(), apexR: 0.5, intensity: 0, seed: 0 };
    this._warpState = { center: new Vector3(), progress: 0 };

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
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

    this.ink = particles.get('shadepuppet.ink', {
      capacity: 1800,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.ink.uniforms.uSizeIn.value = 0.2;
    this.ink.uniforms.uFadeIn.value = 0.12;
    this.ink.uniforms.uFadeOut.value = 0.55;
    this.ink.uniforms.uEndSize.value = 2.2;
    this.ink.uniforms.uDrag.value = 1.2;

    this.motes = particles.get('shadepuppet.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.05;
    this.motes.uniforms.uFadeOut.value = 0.55;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.4;

    this.sparks = particles.get('shadepuppet.sparks', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.2;

    this.moteEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get _count() {
    return Math.max(1, Math.min(MAX_PUPPETS, Math.round(settings[ID].count)));
  }

  get radius() {
    return Math.max(0.5, settings[ID].zoneRadius);
  }

  /** Beat times of the show, from the crown arriving. */
  _beats(out) {
    const c = settings[ID];
    out.drop = Math.max(0.02, c.settleTime);
    out.rise = out.drop + Math.max(0.02, c.dropTime);
    out.dance = out.rise + (this._count - 1) * Math.max(0, c.riseStagger) + Math.max(0.05, c.riseTime);
    out.yank = out.dance + Math.max(0, c.danceTime);
    out.fling = out.yank + Math.max(0.02, c.yankTime);
    out.land = out.fling + Math.max(0.05, c.flingTime);
    out.end = out.land + Math.max(0.05, c.crumbleTime) + 0.15;
    return out;
  }

  get impactDuration() {
    return Math.max(0.2, this._beats(_beatScratch).end * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 7.3) * Math.sin(this.age * 2.9 + 1.1));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    const g = settings.global;
    this.moteEmitter.reset();
    this.trailEmitter.reset();

    this._seed = Math.random() * 100;
    this._tau = 0;
    this._pulse = 0;
    this._landed = false;
    this._crownSpin = Math.random() * TAU;
    this.pointAt(1, this._center).setY(0);

    const n = this._count;
    const R = this.radius * c.puppetRing;
    // Bearings: evenly round, but never one standing square in front of the camera.
    const toCaster = Math.atan2(-this.direction.z, -this.direction.x);
    const offset = toCaster + Math.PI / n;
    for (let i = 0; i < MAX_PUPPETS; i++) {
      const p = this._puppets[i];
      p.bearing = offset + (i / n) * TAU + (Math.random() - 0.5) * 0.2 * g.randomness;
      p.seed = Math.random();
      p.phase = Math.random() * TAU;
      p.heapA = Math.random() * TAU;
      p.heapR = Math.sqrt(Math.random()) * c.heapRadius;
      p.tumble = (Math.random() < 0.5 ? -1 : 1) * (0.6 + 0.6 * Math.random());
      p.base.set(this._center.x + Math.cos(p.bearing) * R, 0, this._center.z + Math.sin(p.bearing) * R);
      p.fwd.set(-Math.cos(p.bearing), 0, -Math.sin(p.bearing));
      p.right.set(p.fwd.z, 0, -p.fwd.x);
      p.launched = false;
      p.dissolve = 0;
      p.inkEmitter.reset();
    }

    const ss = this._stageState;
    ss.center.copy(this._center).setY(0.012);
    ss.open = 0;
    ss.splat = 0;
    ss.fadeT = 0;
    ss.seed = this._seed;
    const pools = this.stageMaterial.uniforms.uPools.value;
    for (let i = 0; i < MAX_POOLS; i++) pools[i].set(0, 0, 0);
    this._crownState.seed = this._seed;
    this._crownState.fade = 1;
    this._spotState.seed = this._seed;
    this._spotState.intensity = 0;
    this._warpState.center.copy(this._center).setY(0.08);
    this._warpState.progress = 0;

    const A = this.stringsMaterial.uniforms.uA.value;
    for (let i = 0; i < MAX_STRINGS; i++) A[i].w = 0;

    this.crown.visible = true;
    this.strings.visible = true;
    this.stage.visible = false;
    this.spot.visible = false;
    this.puppets.visible = false;
    this.puppets.count = 0;
    this.warp.visible = false;
    this._drawn = 0;

    this._syncLooks();
  }

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.45;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  _handPoint(out) {
    const c = settings[ID];
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide)
      .setY(c.handHeight);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _syncLooks() {
    const c = settings[ID];
    const g = settings.global;
    this.puppetMaterial.userData.sync();
    this.stringsMaterial.userData.sync();
    this._crownState.pulse = this._pulse;
    this.crownMaterial.userData.sync(this._crownState);
    this.stageMaterial.userData.sync(this._stageState);
    this.spotMaterial.userData.sync(this._spotState);
    this.warpMaterial.userData.sync(this._warpState);

    this.ink.setGradient(getColor(c.colorInkA), getColor(c.colorInkB), getColor(c.colorInkC), getColor(c.colorInkD));
    const k = this.ink.uniforms;
    k.uGravity.value.set(0, c.inkLift * 0.3, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = c.inkOpacity * g.opacity;
    k.uTurbulence.value = 0.9 * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, c.moteLift, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 0.6 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const s = this.sparks.uniforms;
    s.uGravity.value.set(0, -c.sparkGravity, 0);
    s.uStretch.value = c.sparkStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sparkGlow * g.glow;
    s.uTurbulence.value = 0.2 * g.turbulence;
  }

  /** Place the crown mesh and return its world position in `_crownPos`. */
  _placeCrown(pos, tiltX, tiltZ) {
    const c = settings[ID];
    this._crownPos.copy(pos);
    this.crown.position.copy(pos);
    this.crown.rotation.set(tiltX, this._crownSpin, tiltZ);
    this.crown.scale.setScalar(Math.max(0.05, c.crownRadius));
    this.crown.updateMatrix();
  }

  /** Where string `k` (0 head, 1 left hand, 2 right hand) of puppet `i` ties onto the crown. */
  _anchor(p, k, out) {
    const c = settings[ID];
    const off = k === 0 ? 0 : k === 1 ? -c.handSpread : c.handSpread;
    // Tied at the puppet's own bearing: the crown turns under its strings.
    const a = p.bearing + off;
    const r = c.crownRadius;
    return out.set(this._crownPos.x + Math.cos(a) * r, this._crownPos.y - 0.2 * r, this._crownPos.z + Math.sin(a) * r);
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the crown is thrown                                        */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._pulse += c.crownPulse * dt * g.animationSpeed;
    this._crownSpin += c.throwSpin * dt * g.animationSpeed;
    this._handPoint(_hand);
    _hover.copy(this._center).setY(c.crownHeight);
    const k = Easing.outQuad(this.u);
    _pos.lerpVectors(_hand, _hover, k);
    _pos.y += c.throwArc * Math.sin(Math.PI * this.u);
    this._placeCrown(_pos, 0.35 * (1 - k), 0.2 * Math.sin(this.age * 9));

    /* the master string, from the crown back to the hand */
    const A = this.stringsMaterial.uniforms.uA.value;
    const B = this.stringsMaterial.uniforms.uB.value;
    A[MASTER].set(this._crownPos.x, this._crownPos.y, this._crownPos.z, 1);
    B[MASTER].set(_hand.x, _hand.y, _hand.z, 0.15);

    /* motes shed off the spinning crown */
    const n = Math.round(this.trailEmitter.tick(dt, c.crownMotes * 1.5) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.position = this._crownPos;
      _emit.radius = c.crownRadius;
      _emit.speed = 0.6;
      _emit.spread = 1;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      this.motes.emit(n, _emit);
    }

    this._syncLooks();
    this.position.copy(this._crownPos);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the show                                                   */
  /* ------------------------------------------------------------------ */

  onImpact() {
    this._tau = 0;
    this.stage.visible = true;
    this.spot.visible = true;
    this.puppets.visible = true;
    this.ctx.shake.add(settings[ID].arriveShake, 6, 14);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._pulse += c.crownPulse * dt * g.animationSpeed;

    if (t > 1) {
      /* the stage fades */
      const ft = saturate(t - 1);
      this.crown.visible = false;
      this.strings.visible = false;
      this.spot.visible = false;
      this.puppets.visible = false;
      this.warp.visible = false;
      this._stageState.fadeT = smoothstep(0, 1, ft);
      this._stageState.open = 1;
      const pools = this.stageMaterial.uniforms.uPools.value;
      for (let i = 0; i < MAX_POOLS; i++) pools[i].z = 0;
      this._syncLooks();
      this.position.copy(this._center).setY(1);
      return;
    }

    this._tau += dt / Math.max(0.05, g.lifetime);
    const tau = this._tau;
    const B = this._beats(_beatScratch);
    const n = this._count;

    /* the crown: settles, bobs, jerks at the yank, drops and shatters at the landing */
    const settle = saturate(tau / B.drop);
    const yank = saturate((tau - B.yank) / Math.max(0.02, B.fling - B.yank));
    const fling = saturate((tau - B.fling) / Math.max(0.05, B.land - B.fling));
    const spinRate = lerp(c.throwSpin, c.crownSpin, Easing.outCubic(settle)) + c.yankSpin * yank * (1 - fling * 0.5);
    this._crownSpin += spinRate * dt * g.animationSpeed;
    _hover.copy(this._center);
    _hover.y = c.crownHeight + c.crownBob * Math.sin(tau * 2.2) + c.yankLift * Math.sin(Math.PI * yank) - c.crownDrop * Easing.inQuad(fling);
    this._placeCrown(_hover, 0.06 * Math.sin(tau * 1.7), 0.06 * Math.cos(tau * 1.3) + 0.15 * Math.sin(Math.PI * yank));
    const shatter = saturate((tau - B.land) / 0.35);
    this._crownState.fade = 1 - shatter;
    this.crown.visible = shatter < 1;

    /* the stage and the spotlight */
    const ss = this._stageState;
    ss.open = Easing.outCubic(saturate(tau / Math.max(0.05, c.settleTime + c.dropTime)));
    const sp = this._spotState;
    sp.apex.copy(this._crownPos);
    sp.base.copy(this._center).setY(0);
    sp.apexR = c.crownRadius * 0.8;
    sp.intensity = smoothstep(0, B.rise, tau) * (1 - smoothstep(B.land, B.end, tau)) * (1 + 0.6 * Math.exp(-Math.max(0, tau - B.land) * 6) * (tau > B.land ? 1 : 0));
    this.spot.visible = sp.intensity > 0.005;

    /* the master string lets go once the crown has settled */
    const A = this.stringsMaterial.uniforms.uA.value;
    const Bu = this.stringsMaterial.uniforms.uB.value;
    this._handPoint(_hand);
    A[MASTER].set(this._crownPos.x, this._crownPos.y, this._crownPos.z, 1 - settle);
    _a.lerpVectors(_hand, this._crownPos, Easing.inQuad(settle));
    Bu[MASTER].set(_a.x, _a.y, _a.z, 0.4);

    /* the puppets */
    const pools = this.stageMaterial.uniforms.uPools.value;
    let k = 0;
    for (let i = 0; i < MAX_PUPPETS; i++) {
      const p = this._puppets[i];
      if (i >= n) {
        pools[i].z = 0;
        for (let s = 0; s < 3; s++) A[i * 3 + s].w = 0;
        continue;
      }
      const riseAt = B.rise + i * Math.max(0, c.riseStagger);
      const rk = saturate((tau - riseAt) / Math.max(0.05, c.riseTime));
      const poolOpen = smoothstep(riseAt - 0.25, riseAt, tau) * (1 - smoothstep(B.fling, B.land, tau));
      pools[i].set(p.base.x - this._center.x, p.base.z - this._center.z, c.poolRadius * poolOpen);

      const visible = tau >= riseAt;
      if (visible) {
        this._posePuppet(p, tau, rk, B, dt);
        k = this._writePuppet(p, k);
        this._puppetFx(p, dt, rk, tau, B);
      }
      this._writeStrings(p, i, tau, riseAt, visible, B);
    }
    this._drawn = k;
    this.puppets.count = k;
    this.puppets.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;

    /* the landing */
    if (!this._landed && tau >= B.land) this._land();
    ss.splat = this._landed ? c.splatRadius * Easing.outCubic(saturate((tau - B.land) / 0.25)) : 0;
    const wp = saturate((tau - B.land) / Math.max(0.05, c.slumpTime));
    this._warpState.progress = wp;
    this.warp.visible = this._landed && wp < 1;

    this._syncLooks();
    this._stringMotes(dt, tau < B.land ? 1 : 0);
    this.position.copy(this._center);
    this.position.y = tau < B.land ? c.crownHeight * 0.55 : 1.0;
  }

  /* ------------------------------------------------------------------ */
  /* Posing                                                              */
  /* ------------------------------------------------------------------ */

  /** Pose one puppet for this moment of the show, into its joints. */
  _posePuppet(p, tau, rk, B, dt) {
    const c = settings[ID];
    const g = settings.global;
    const S = c.puppetScale;
    const legLen = (c.thighLength + c.shinLength) * S;
    const stand = legLen + c.hang;
    const pose = _pose;

    // Limp: hanging from three strings.
    pose.fall = 0;
    pose.lean = 0.18;
    pose.side = 0;
    pose.nod = 0.55;
    pose.tilt = 0.15 * Math.sin(p.phase);
    pose.raiseL = 0.25;
    pose.raiseR = 0.25;
    pose.elbowL = 0.35;
    pose.elbowR = 0.35;
    pose.swingL = 0.15;
    pose.swingR = 0.15;
    pose.flexL = 0.12;
    pose.flexR = 0.18;
    pose.kneeL = 0.3;
    pose.kneeR = 0.35;
    pose.splay = 0.06;

    let y = lerp(-stand - (c.torsoLength + c.headLength) * S - 0.3, stand, Easing.outBack(rk));
    // swaying as it is hauled up
    y += 0.06 * Math.sin(tau * 9 + p.phase) * (1 - rk) * rk;
    p.pelvis.copy(p.base).setY(y);

    // The dance.
    const dw = smoothstep(B.dance - 0.1, B.dance + 0.15, tau) * (1 - smoothstep(B.yank - 0.05, B.yank + 0.05, tau));
    if (dw > 0) {
      const x = (tau - B.dance) * c.danceRate * TAU * g.animationSpeed + p.phase;
      const jl = Math.max(0, jerk(x));
      const jr = Math.max(0, jerk(x + Math.PI));
      const kl = Math.max(0, jerk(x * 0.5 + 1.3));
      const kr = Math.max(0, jerk(x * 0.5 + 1.3 + Math.PI));
      pose.raiseL = lerp(pose.raiseL, 0.4 + c.armFling * jl, dw);
      pose.raiseR = lerp(pose.raiseR, 0.4 + c.armFling * jr, dw);
      pose.elbowL = lerp(pose.elbowL, 0.5 + 0.9 * jl, dw);
      pose.elbowR = lerp(pose.elbowR, 0.5 + 0.9 * jr, dw);
      pose.swingL = lerp(pose.swingL, 0.5 * jerk(x * 0.7), dw);
      pose.swingR = lerp(pose.swingR, -0.5 * jerk(x * 0.7), dw);
      pose.flexL = lerp(pose.flexL, 0.15 + c.kneeKick * kl, dw);
      pose.flexR = lerp(pose.flexR, 0.15 + c.kneeKick * kr, dw);
      pose.kneeL = lerp(pose.kneeL, 0.2 + c.kneeKick * 1.3 * kl, dw);
      pose.kneeR = lerp(pose.kneeR, 0.2 + c.kneeKick * 1.3 * kr, dw);
      pose.nod = lerp(pose.nod, 0.35 * jerk(x * 0.8 + 0.5), dw);
      pose.tilt = lerp(pose.tilt, 0.35 * jerk(x * 1.3), dw);
      pose.side = lerp(pose.side, 0.12 * jerk(x), dw);
      pose.lean = lerp(pose.lean, 0.05, dw);
      p.pelvis.y += c.hopHeight * dw * Math.pow(Math.max(0, Math.sin(x * 2)), 3);
    }

    // The yank: snatched up, arms wrenched over the head.
    const yk = saturate((tau - B.yank) / Math.max(0.02, B.fling - B.yank));
    if (yk > 0) {
      const e = Easing.outCubic(yk);
      p.pelvis.y += c.yankLift * e;
      pose.raiseL = lerp(pose.raiseL, 2.7, e);
      pose.raiseR = lerp(pose.raiseR, 2.7, e);
      pose.elbowL = lerp(pose.elbowL, 0.1, e);
      pose.elbowR = lerp(pose.elbowR, 0.1, e);
      pose.nod = lerp(pose.nod, -0.3, e);
      pose.flexL = lerp(pose.flexL, 0.05, e);
      pose.flexR = lerp(pose.flexR, 0.05, e);
      pose.kneeL = lerp(pose.kneeL, 0.1, e);
      pose.kneeR = lerp(pose.kneeR, 0.1, e);
    }

    // The fling: thrown inward, tumbling, to land face down in the heap.
    const fk = saturate((tau - B.fling) / Math.max(0.05, B.land - B.fling));
    if (fk > 0) {
      if (!p.launched) {
        p.launched = true;
        p.launch.copy(p.pelvis);
        p.land.set(this._center.x + Math.cos(p.heapA) * p.heapR, c.heapHeight, this._center.z + Math.sin(p.heapA) * p.heapR);
      }
      const e = Easing.inQuad(fk);
      p.pelvis.lerpVectors(p.launch, p.land, fk);
      p.pelvis.y = lerp(p.launch.y, p.land.y, e) + c.flingArc * Math.sin(Math.PI * fk);
      pose.fall = lerp(0, 1.45, Easing.inCubic(fk)) + p.tumble * Math.sin(Math.PI * fk) * 0.8;
      pose.raiseL = lerp(2.7, 1.3, fk) + 0.6 * Math.sin(fk * 9 + p.phase);
      pose.raiseR = lerp(2.7, 1.9, fk) + 0.6 * Math.sin(fk * 11 + p.phase);
      pose.flexL = lerp(0.05, 0.4, fk) + 0.4 * Math.sin(fk * 7);
      pose.flexR = lerp(0.05, -0.2, fk);
      pose.kneeL = lerp(0.1, 1.1, fk);
      pose.kneeR = lerp(0.1, 0.5, fk);
      pose.nod = lerp(-0.3, 0.6, fk);
      pose.splay = lerp(0.06, 0.35, fk);
    }
    if (tau >= B.land) {
      // Lying in the heap, settling a little, then crumbling.
      const after = tau - B.land;
      p.pelvis.copy(p.land);
      p.pelvis.y = c.heapHeight * (1 - 0.4 * Easing.outCubic(saturate(after / 0.3)));
      pose.fall = 1.45 + 0.08 * Math.exp(-after * 8) * Math.sin(after * 40);
      pose.raiseL = 1.3;
      pose.raiseR = 1.9;
      pose.flexL = 0.4;
      pose.flexR = -0.2;
      pose.kneeL = 1.1;
      pose.kneeR = 0.5;
      pose.nod = 0.6;
      pose.splay = 0.35;
      p.dissolve = smoothstep(0.08, 1, after / Math.max(0.05, c.crumbleTime));
    } else {
      p.dissolve = 0;
    }

    this._solve(p, pose);
  }

  /** Forward kinematics: the pose into world joints. */
  _solve(p, pose) {
    const c = settings[ID];
    const S = c.puppetScale;
    const J = p.joints;
    // The figure's frame, tipped forward by `fall`.
    const cf = Math.cos(pose.fall);
    const sf = Math.sin(pose.fall);
    _upF.copy(_up).multiplyScalar(cf).addScaledVector(p.fwd, sf);
    _fwdF.copy(p.fwd).multiplyScalar(cf).addScaledVector(_up, -sf);
    const R = p.right;
    _right = R;

    J[PELVIS].copy(p.pelvis);
    local(pose.side, 1, pose.lean, _dir).normalize();
    J[NECK].copy(J[PELVIS]).addScaledVector(_dir, c.torsoLength * S);
    local(pose.tilt + pose.side, 1, pose.nod, _dir).normalize();
    J[HEAD].copy(J[NECK]).addScaledVector(_dir, c.headLength * S);

    // shoulders sit a little below the neck
    local(0, -0.07 * S, 0, _a).add(J[NECK]);
    J[SH_L].copy(_a).addScaledVector(R, -c.shoulderWidth * S);
    J[SH_R].copy(_a).addScaledVector(R, c.shoulderWidth * S);
    this._limb(J[SH_L], J[EL_L], J[HA_L], -1, pose.raiseL, pose.elbowL, pose.swingL, c.upperArm * S, c.forearm * S);
    this._limb(J[SH_R], J[EL_R], J[HA_R], 1, pose.raiseR, pose.elbowR, pose.swingR, c.upperArm * S, c.forearm * S);

    J[HIP_L].copy(J[PELVIS]).addScaledVector(R, -c.hipWidth * S);
    J[HIP_R].copy(J[PELVIS]).addScaledVector(R, c.hipWidth * S);
    this._leg(J[HIP_L], J[KN_L], J[FT_L], -1, pose.flexL, pose.kneeL, pose.splay, c.thighLength * S, c.shinLength * S);
    this._leg(J[HIP_R], J[KN_R], J[FT_R], 1, pose.flexR, pose.kneeR, pose.splay, c.thighLength * S, c.shinLength * S);

    // Nothing goes through the floor.
    for (let j = 0; j < JOINTS; j++) if (J[j].y < 0.04 && p.pelvis.y > 0) J[j].y = 0.04;
  }

  _limb(root, mid, end, s, raise, elbow, swing, l1, l2) {
    local(s * Math.sin(raise), -Math.cos(raise), swing, _dir).normalize();
    mid.copy(root).addScaledVector(_dir, l1);
    const r2 = raise + elbow;
    local(s * Math.sin(r2), -Math.cos(r2), swing + 0.35 * elbow, _dir).normalize();
    end.copy(mid).addScaledVector(_dir, l2);
  }

  _leg(root, mid, end, s, flex, knee, splay, l1, l2) {
    local(s * splay, -Math.cos(flex), Math.sin(flex), _dir).normalize();
    mid.copy(root).addScaledVector(_dir, l1);
    const f2 = flex - knee;
    local(s * splay * 0.5, -Math.cos(f2), Math.sin(f2), _dir).normalize();
    end.copy(mid).addScaledVector(_dir, l2);
  }

  /** Lay a puppet's ten parts into the instance buffer, from slot `k`. */
  _writePuppet(p, k) {
    const c = settings[ID];
    const S = c.puppetScale;
    const state = this.stateAttr.array;
    for (let q = 0; q < PARTS; q++) {
      const part = PART_TABLE[q];
      const A = p.joints[part[0]];
      const B = p.joints[part[1]];
      const r = c[part[2]] * S;
      _Y.subVectors(B, A);
      if (_Y.lengthSq() < 1e-8) {
        this.puppets.setMatrixAt(k, _zero);
      } else {
        // Any two axes perpendicular to the part, scaled to its radius.
        _a.copy(Math.abs(_Y.y) < 0.9 * _Y.length() ? _up : p.fwd);
        _X.crossVectors(_Y, _a).normalize().multiplyScalar(r);
        _Z.crossVectors(_X, _Y).normalize().multiplyScalar(r);
        _m.makeBasis(_X, _Y, _Z);
        _m.setPosition(A);
        this.puppets.setMatrixAt(k, _m);
      }
      state[k * 2] = p.dissolve;
      state[k * 2 + 1] = p.seed;
      k++;
    }
    return k;
  }

  /** The three strings of puppet `i`. */
  _writeStrings(p, i, tau, riseAt, visible, B) {
    const c = settings[ID];
    const Au = this.stringsMaterial.uniforms.uA.value;
    const Bu = this.stringsMaterial.uniforms.uB.value;
    const drop = saturate((tau - B.drop) / Math.max(0.02, B.rise - B.drop));
    const snap = saturate((tau - B.land) / Math.max(0.05, c.snapTime));
    const dance = smoothstep(B.dance - 0.1, B.dance + 0.2, tau);
    const taut = tau >= B.yank ? 1 : 0;
    for (let s = 0; s < 3; s++) {
      const idx = i * 3 + s;
      this._anchor(p, s, _a);
      const joint = s === 0 ? p.joints[HEAD] : s === 1 ? p.joints[HA_L] : p.joints[HA_R];
      if (!visible) {
        // Paying down from the crown to the floor where the puppet will rise.
        _b.copy(p.base).addScaledVector(p.right, s === 0 ? 0 : s === 1 ? -0.3 : 0.3);
        _b.y = 0.02;
        _pos.lerpVectors(_a, _b, Easing.outCubic(drop));
        Au[idx].set(_a.x, _a.y, _a.z, drop > 0 ? 1 : 0);
        Bu[idx].set(_pos.x, _pos.y, _pos.z, 0.6);
        continue;
      }
      if (snap > 0) {
        // Snapped: the loose end whips back up toward the crown and fades.
        _pos.lerpVectors(this._snapAt.copy(joint), _a, Easing.outCubic(snap) * 0.8);
        _pos.y += 0.5 * Math.sin(snap * 12 + idx) * (1 - snap);
        Au[idx].set(_a.x, _a.y, _a.z, 1 - snap);
        Bu[idx].set(_pos.x, _pos.y, _pos.z, 1);
        continue;
      }
      Au[idx].set(_a.x, _a.y, _a.z, 1);
      Bu[idx].set(joint.x, joint.y, joint.z, lerp(lerp(0.5, 0.08, dance), 0, taut));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Ink off a puppet as it is hauled out of its pool, and as it crumbles. */
  _puppetFx(p, dt, rk, tau, B) {
    const c = settings[ID];
    const g = settings.global;
    let rate = 0;
    if (rk < 1) rate = c.riseInk;
    if (p.dissolve > 0 && p.dissolve < 1) rate = c.crumbleInk;
    const n = Math.round(p.inkEmitter.tick(dt, rate) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = c.inkLift;
    _emit.spread = 0.6;
    _emit.direction = _up;
    _emit.size = c.inkSize;
    _emit.life = c.inkLife;
    _emit.spin = 0.5;
    for (let q = 0; q < n; q++) {
      const j = p.joints[Math.floor(Math.random() * JOINTS)];
      _pos.copy(rk < 1 ? p.base : j);
      if (rk < 1) _pos.y = 0.1;
      _emit.position = _pos;
      _emit.radius = rk < 1 ? c.poolRadius * 0.6 : 0.2;
      this.ink.emit(1, _emit);
      if (Math.random() < 0.4) {
        _emit.size = c.moteSize;
        _emit.life = c.moteLife;
        _emit.speed = 0.8;
        this.motes.emit(1, _emit);
        _emit.size = c.inkSize;
        _emit.life = c.inkLife;
        _emit.speed = c.inkLift;
      }
    }
  }

  /** Motes sliding down the strings and shed off the crown. */
  _stringMotes(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.crownMotes * strength) * g.particleCount);
    if (n <= 0) return;
    const Au = this.stringsMaterial.uniforms.uA.value;
    const Bu = this.stringsMaterial.uniforms.uB.value;
    const strings = this._count * 3;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.speed = 0.3;
    _emit.spread = 1;
    for (let q = 0; q < n; q++) {
      const idx = Math.floor(Math.random() * strings);
      if (Au[idx].w < 0.5) continue;
      const t = Math.random();
      _pos.set(lerp(Au[idx].x, Bu[idx].x, t), lerp(Au[idx].y, Bu[idx].y, t), lerp(Au[idx].z, Bu[idx].z, t));
      _emit.position = _pos;
      this.motes.emit(1, _emit);
    }
  }

  /** The heap hits the floor. */
  _land() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._landed = true;

    this.ctx.bursts.spawn(BurstMode.AIR, this._center, {
      radius: 0.3,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: 1.1,
      opacity: 0.8,
      fresnel: 2,
      displace: 0.4,
      turbulence: 1.2,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, this._center, {
      radius: this.radius * 1.1,
      life: 1.3,
      intensity: 0.9,
      colorA: getColor(c.colorInkB),
      colorB: getColor(c.colorInkA)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._center, {
      radius: this.radius * 1.4 * power,
      life: 0.55,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorRing),
      colorB: getColor(c.colorStringCore)
    });

    /* ink thrown out of the heap, low */
    this._resetEmit(time);
    _emit.position = this._center;
    _emit.radius = 0.8;
    _emit.direction = _up;
    _emit.speed = c.inkLift * 3;
    _emit.spread = 1.6;
    _emit.size = c.inkSize * 1.4;
    _emit.life = c.inkLife;
    _emit.spin = 0.7;
    this.ink.emit(Math.round(c.landInk * g.particleCount), _emit);
    _emit.speed = 3;
    _emit.size = c.moteSize * 1.3;
    _emit.life = c.moteLife;
    this.motes.emit(Math.round(c.landInk * 1.5 * g.particleCount), _emit);

    /* every string snaps; the crown shatters */
    const Au = this.stringsMaterial.uniforms.uA.value;
    _emit.speed = c.sparkSpeed;
    _emit.spread = 1;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    _emit.radius = 0.05;
    const strings = this._count * 3;
    for (let i = 0; i < strings; i++) {
      _pos.set(Au[i].x, Au[i].y, Au[i].z);
      _emit.position = _pos;
      this.sparks.emit(Math.round(6 * g.particleCount), _emit);
    }
    _emit.position = this._crownPos;
    _emit.radius = c.crownRadius;
    _emit.speed = c.sparkSpeed * 0.7;
    this.sparks.emit(Math.round(c.crownShards * g.particleCount), _emit);
    _emit.speed = 1.5;
    _emit.size = c.moteSize * 1.5;
    _emit.life = c.moteLife * 1.5;
    this.motes.emit(Math.round(c.crownShards * g.particleCount), _emit);

    this._landHits();
    this.ctx.shake.add(c.landShake * power, 1 / Math.max(0.05, c.shakeDuration), 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.landFlash * power);
    this.lightBoost = c.lightIntensity * c.landLight * power;
  }

  /** Everything in the circle is dragged in and down with the puppets. */
  _landHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(this._center.x, this._center.z, this.radius, this._found);
    this._force.impulse = c.slumpImpulse * g.explosionIntensity;
    this._force.lift = c.slumpLift * g.explosionIntensity;
    this._force.spin = c.slumpSpin;
    for (const dummy of found) {
      _dir.set(this._center.x - dummy.position.x, 0, this._center.z - dummy.position.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(this.direction.x, 0, this.direction.z);
      _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.crown.visible = false;
    this.strings.visible = false;
    this.stage.visible = false;
    this.spot.visible = false;
    this.puppets.visible = false;
    this.puppets.count = 0;
    this.warp.visible = false;
    this._drawn = 0;
  }

  dispose() {
    this.quadGeometry.dispose();
    this.coneGeometry.dispose();
    this.crownGeometry.dispose();
    this.stringsGeometry.dispose();
    this.limbGeometry.dispose();
    this.stageMaterial.dispose();
    this.spotMaterial.dispose();
    this.crownMaterial.dispose();
    this.stringsMaterial.dispose();
    this.puppetMaterial.dispose();
    this.warpMaterial.dispose();
    this.puppets.dispose();
    super.dispose();
  }
}

/** Scratch for the beat table — the getters are hot and must not allocate. */
const _beatScratch = { drop: 0, rise: 0, dance: 0, yank: 0, fling: 0, land: 0, end: 0 };

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('♟  Shade Puppets');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 4, 90, 0.5, 'throw speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'stage fades over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const crown = folder.addFolder('1 · The crown');
  R(crown, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(crown, c, 'handSide', -1, 1, 0.01, 'hand to the right (m)');
  R(crown, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(crown, c, 'throwArc', 0, 8, 0.05, 'throw arc (m)');
  R(crown, c, 'throwSpin', 0, 30, 0.1, 'spin thrown (rad/s)');
  R(crown, c, 'crownRadius', 0.2, 4, 0.01, 'radius (m)');
  R(crown, c, 'crownHeight', 1, 14, 0.05, 'hovers at (m)');
  R(crown, c, 'crownSpin', -4, 4, 0.01, 'spin hovering (rad/s)');
  R(crown, c, 'crownBob', 0, 1, 0.01, 'bob (m)');
  R(crown, c, 'yankSpin', 0, 30, 0.1, 'spin at the yank (rad/s)');
  R(crown, c, 'crownDrop', 0, 6, 0.05, 'drops as they fall (m)');
  R(crown, c, 'crownPulse', 0, 10, 0.05, 'vein pulse');
  R(crown, c, 'crownRimGlow', 0, 6, 0.05, 'rim glow');
  R(crown, c, 'crownVeinGlow', 0, 8, 0.05, 'vein glow');
  R(crown, c, 'crownTipGlow', 0, 10, 0.05, 'thorn tip glow');
  R(crown, c, 'crownMotes', 0, 300, 1, 'motes/second');
  R(crown, c, 'crownShards', 0, 300, 1, 'shards when it shatters');
  R(crown, c, 'arriveShake', 0, 1, 0.01, 'knock on arrival');
  crown.addColor(c, 'colorCrownBody').name('obsidian');
  crown.addColor(c, 'colorCrownRim').name('rim');
  crown.addColor(c, 'colorCrownVein').name('veins');

  const strings = folder.addFolder('2 · The strings');
  R(strings, c, 'handSpread', 0, 1, 0.005, 'hand strings spread (rad)');
  R(strings, c, 'stringWidth', 0.002, 0.15, 0.001, 'width (m)');
  R(strings, c, 'stringSag', 0, 2, 0.01, 'sag (m)');
  R(strings, c, 'stringHum', 0, 0.3, 0.001, 'hum (m)');
  R(strings, c, 'stringGlow', 0, 10, 0.05, 'glow');
  R(strings, c, 'stringPulseGlow', 0, 8, 0.05, 'tension pulse glow');
  R(strings, c, 'stringPulseRate', 0, 40, 0.1, 'tension pulse speed');
  R(strings, c, 'snapTime', 0.05, 2, 0.01, 'snap whips back over (s)');
  strings.addColor(c, 'colorStringCore').name('core');
  strings.addColor(c, 'colorStringHalo').name('halo');

  const body = folder.addFolder('3 · The puppets');
  R(body, c, 'count', 1, MAX_PUPPETS, 1, 'puppets');
  R(body, c, 'puppetRing', 0.3, 1.2, 0.01, 'stand at (× radius)');
  R(body, c, 'puppetScale', 0.3, 3, 0.01, 'scale');
  R(body, c, 'torsoLength', 0.2, 1.5, 0.01, 'torso (m)');
  R(body, c, 'headLength', 0.1, 0.8, 0.01, 'head (m)');
  R(body, c, 'shoulderWidth', 0.05, 0.6, 0.005, 'shoulders (m)');
  R(body, c, 'upperArm', 0.1, 0.8, 0.005, 'upper arm (m)');
  R(body, c, 'forearm', 0.1, 0.8, 0.005, 'forearm (m)');
  R(body, c, 'hipWidth', 0.02, 0.4, 0.005, 'hips (m)');
  R(body, c, 'thighLength', 0.1, 1, 0.005, 'thigh (m)');
  R(body, c, 'shinLength', 0.1, 1, 0.005, 'shin (m)');
  R(body, c, 'torsoRadius', 0.02, 0.4, 0.002, 'torso radius (m)');
  R(body, c, 'headRadius', 0.02, 0.4, 0.002, 'head radius (m)');
  R(body, c, 'armRadius', 0.01, 0.2, 0.001, 'arm radius (m)');
  R(body, c, 'legRadius', 0.01, 0.2, 0.001, 'leg radius (m)');
  R(body, c, 'hang', 0, 0.8, 0.01, 'feet dangle (m)');
  R(body, c, 'puppetRimGlow', 0, 6, 0.05, 'rim glow');
  R(body, c, 'jointGlow', 0, 10, 0.05, 'pivot glow');
  R(body, c, 'grain', 0, 1, 0.01, 'carved grain');
  R(body, c, 'lacquer', 0, 3, 0.01, 'lacquer gloss');
  R(body, c, 'crumbleEdge', 0.005, 0.4, 0.005, 'crumble edge');
  body.addColor(c, 'colorPuppetBody').name('ink');
  body.addColor(c, 'colorPuppetRim').name('rim');
  body.addColor(c, 'colorJoint').name('pivots');
  body.addColor(c, 'colorCrumbleEdge').name('crumble edge');

  const show = folder.addFolder('4 · The show');
  R(show, c, 'settleTime', 0.02, 2, 0.01, 'crown settles (s)');
  R(show, c, 'dropTime', 0.02, 2, 0.01, 'strings pay down (s)');
  R(show, c, 'riseTime', 0.05, 2, 0.01, 'hauled up over (s)');
  R(show, c, 'riseStagger', 0, 0.5, 0.005, 'one after another (s)');
  R(show, c, 'danceTime', 0, 4, 0.01, 'dance for (s)');
  R(show, c, 'danceRate', 0, 4, 0.01, 'steps/second');
  R(show, c, 'armFling', 0, 3, 0.01, 'arms yanked up (rad)');
  R(show, c, 'kneeKick', 0, 2, 0.01, 'knee kick (rad)');
  R(show, c, 'hopHeight', 0, 1, 0.01, 'hop (m)');
  R(show, c, 'yankTime', 0.02, 1, 0.005, 'snatched up over (s)');
  R(show, c, 'yankLift', 0, 3, 0.01, 'snatched up (m)');
  R(show, c, 'flingTime', 0.05, 2, 0.01, 'flung in over (s)');
  R(show, c, 'flingArc', 0, 6, 0.05, 'fling arc (m)');
  R(show, c, 'heapRadius', 0, 3, 0.01, 'heap spread (m)');
  R(show, c, 'heapHeight', 0, 1, 0.01, 'heap height (m)');
  R(show, c, 'crumbleTime', 0.05, 4, 0.01, 'crumble over (s)');

  const stage = folder.addFolder('5 · Stage & spotlight');
  R(stage, c, 'stageShade', 0, 1, 0.01, 'floor shade');
  R(stage, c, 'ringGlow', 0, 8, 0.05, 'ring glow');
  R(stage, c, 'footlights', 1, 48, 1, 'footlights');
  R(stage, c, 'footlightGlow', 0, 10, 0.05, 'footlight glow');
  R(stage, c, 'poolRadius', 0.1, 2, 0.01, 'ink pool (m)');
  R(stage, c, 'splatRadius', 0, 5, 0.05, 'splat (m)');
  R(stage, c, 'spotIntensity', 0, 2, 0.01, 'spotlight');
  R(stage, c, 'spotSpread', 0.2, 1.5, 0.01, 'spot spread (× radius)');
  R(stage, c, 'spotDust', 0, 1, 0.01, 'dust in the beam');
  stage.addColor(c, 'colorStageShade').name('floor shade');
  stage.addColor(c, 'colorRing').name('ring');
  stage.addColor(c, 'colorInk').name('ink pool');
  stage.addColor(c, 'colorPoolRim').name('pool rim');
  stage.addColor(c, 'colorSpot').name('spotlight');

  const fx = folder.addFolder('6 · Ink, motes, sparks');
  R(fx, c, 'riseInk', 0, 300, 1, 'ink/second rising');
  R(fx, c, 'crumbleInk', 0, 300, 1, 'ink/second crumbling');
  R(fx, c, 'landInk', 0, 300, 1, 'ink at the landing');
  R(fx, c, 'inkSize', 0.05, 3, 0.01, 'ink size');
  R(fx, c, 'inkLift', 0, 5, 0.01, 'ink rise');
  R(fx, c, 'inkLife', 0.1, 6, 0.05, 'ink lifetime');
  R(fx, c, 'inkOpacity', 0, 1, 0.01, 'ink opacity');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'mote lifetime');
  R(fx, c, 'moteLift', -3, 5, 0.01, 'mote rise');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorInk', 'ink gradient');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');

  const fall = folder.addFolder('7 · The fall');
  R(fall, c, 'burstSize', 0, 10, 0.05, 'ink shell (m)');
  R(fall, c, 'slumpWarp', 0, 4, 0.01, 'air thump');
  R(fall, c, 'slumpTime', 0.05, 2, 0.01, 'thump runs out over (s)');
  R(fall, c, 'landShake', 0, 1.5, 0.01, 'camera knock');
  R(fall, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(fall, c, 'landFlash', 0, 1, 0.01, 'flash');
  R(fall, c, 'landLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(fall, c, 'slumpImpulse', 0, 20, 0.1, 'dragged in (m/s)');
  R(fall, c, 'slumpLift', 0, 15, 0.05, 'lift (m/s)');
  R(fall, c, 'slumpSpin', 0, 6, 0.01, 'tumble');
  fall.addColor(c, 'colorBurstA').name('shell inner');
  fall.addColor(c, 'colorBurstB').name('shell mid');
  fall.addColor(c, 'colorBurstC').name('shell outer');
  fall.addColor(c, 'colorFlash').name('flash');

  folder.close();
  return folder;
}
