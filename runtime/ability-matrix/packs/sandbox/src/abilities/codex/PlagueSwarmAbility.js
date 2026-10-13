import { InstancedBufferAttribute, Mesh, PlaneGeometry, SphereGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createHiveGeometry, createInsectGeometry } from '../../assets/codex/PlagueSwarmGeometry.js';
import {
  createHiveMaterial,
  createMiasmaWarpMaterial,
  createSacMaterial,
  createSwarmMaterial,
  createToxicPoolMaterial,
  SWARM_SLOTS
} from '../../materials/codex/PlagueSwarmMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'plague';

const TAU = Math.PI * 2;

/** Hard ceiling on insects; the editor's count slider clamps to this. */
const MAX_INSECTS = 900;
/** Bodies the swarm can be eating at once — one per target slot. */
const MAX_VICTIMS = SWARM_SLOTS;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _floor = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);
const _slotCount = new Int32Array(MAX_VICTIMS);

/** Each particle system's gradient and multipliers, by settings key — a table, so the sync allocates nothing. */
const LOOKS = [
  { system: 'buzz', prefix: ['colorBuzzA', 'colorBuzzB', 'colorBuzzC', 'colorBuzzD'], opacity: null, glow: 'buzzGlow' },
  { system: 'mist', prefix: ['colorMistA', 'colorMistB', 'colorMistC', 'colorMistD'], opacity: 'mistOpacity', glow: null },
  { system: 'bubbles', prefix: ['colorBubbleA', 'colorBubbleB', 'colorBubbleC', 'colorBubbleD'], opacity: null, glow: null },
  { system: 'spores', prefix: ['colorSporeA', 'colorSporeB', 'colorSporeC', 'colorSporeD'], opacity: null, glow: 'sporeGlow' },
  { system: 'chips', prefix: ['colorChipA', 'colorChipB', 'colorChipC', 'colorChipD'], opacity: null, glow: null },
  { system: 'dust', prefix: ['colorChipA', 'colorChipA', 'colorChipB', 'colorChipC'], opacity: null, glow: null }
];

/**
 * PLAGUE SWARM — a hive that breaks the floor, and what lives in it.
 *
 * A zone cast. The cast **burrows**: a furrow of thrown soil, chips and
 * leaking spores races under the floor to the circle while a marking ring
 * draws itself round it. Then, on one clock:
 *
 *   1. **the hive** bursts up out of the floor — a procedural lumpy pod of
 *      shell plates (`createHiveGeometry`), black chitin with a thin-film
 *      iridescence and toxic veins pulsing up it (`createHiveMaterial`). It
 *      breathes. Its seams glow white-hot, and it **cracks open**: the plates
 *      swing out about their hinges, flinging mist and spores, and the brood
 *      sac inside throbs.
 *   2. **the swarm** pours out — hundreds of instanced insects
 *      (`createSwarmMaterial`) placed entirely on the GPU: out of the mouth on
 *      a bezier burst, into a vortex round the circle, folded about by an
 *      analytic curl field, every one pointing where it flies, wings beating,
 *      a halo on each so it reads from across the stage.
 *   3. **the engulfing** — after `lockDelay` the swarm turns on the bodies.
 *      Each insect belongs to one of eight slots; each slot is given a body
 *      and its insects peel off into a fast tall orbit round it — a buzzing
 *      cloud, shedding sparks. Bodies are **corroded** (`dummy.corrode`): they
 *      blacken under a toxic rim; at `collapseAt` they fold to the floor
 *      (`dummy.kill`, almost no impulse); down there they writhe (`dummy.shove`
 *      on a twitching rhythm) while the cloud stays on them. When the swarm
 *      leaves it takes `devour` of each corpse with it (`dummy.consume`).
 *   4. **the pool** — the ground treatment (`createToxicPoolMaterial`): toxin
 *      spreads over the circle and wells up under every body the swarm eats,
 *      wet and dark with caustic veins and bubbles that swell and pop. Mist
 *      pools on it (SMOKE), bubbles rise off it (BUBBLE), and the air over it
 *      shimmers (`LAYER.DISTORTION`).
 *   5. **home** — the swarm streams back into the mouth, the plates draw half
 *      shut, and the hive dissolves from the crown down with a burning edge as
 *      it sinks; the pool erodes and leaves a SCORCH stain.
 *
 * ## The editor rule
 *
 * The CPU integrates a few phases (the vortex, the cloud orbit, the wingbeat,
 * the flow) and keeps the bodies and slots; everything else — every metre,
 * second and colour — is resolved from `settings.plague` per frame, in the
 * shader for the swarm. Dragging any slider moves a swarm that is already in
 * the air.
 */
export class PlagueSwarmAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The swarm decides who it eats, and how slowly. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.hive.visible ? this.insectGeometry.instanceCount : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    const environment = this.ctx.environment;

    /* ---- layer 1: the hive ---- */
    this._shapeKey = '';
    this.hiveGeometry = this._buildHive();
    this.hiveMaterial = createHiveMaterial(environment, this.hiveGeometry.userData.hingeRadius);
    this.hive = new Mesh(this.hiveGeometry, this.hiveMaterial);
    this.hive.name = 'PlagueHive';
    this.hive.customDepthMaterial = this.hiveMaterial.userData.depth;
    this.hive.castShadow = true;
    this.hive.receiveShadow = true;
    // SHAPED: the vertex stage opens it, so the prepass's override must not draw it.
    this.hive.layers.set(LAYER.SHAPED);
    this.hive.frustumCulled = false;
    this.hive.visible = false;
    this.group.add(this.hive);

    this.sacGeometry = new SphereGeometry(1, 24, 16);
    this.sacMaterial = createSacMaterial();
    this.sac = new Mesh(this.sacGeometry, this.sacMaterial);
    this.sac.name = 'PlagueBroodSac';
    this.sac.layers.set(LAYER.VFX);
    this.sac.frustumCulled = false;
    this.sac.visible = false;
    this.group.add(this.sac);
    this._hiveState = { rise: 0, open: 0, crack: 0, sink: 0, dissolve: 0 };

    /* ---- layer 2: the swarm ---- */
    this.insectGeometry = createInsectGeometry();
    this.rand = new InstancedBufferAttribute(new Float32Array(MAX_INSECTS * 4), 4);
    this.rand2 = new InstancedBufferAttribute(new Float32Array(MAX_INSECTS * 4), 4);
    this.insectGeometry.setAttribute('aRand', this.rand);
    this.insectGeometry.setAttribute('aRand2', this.rand2);
    this.insectGeometry.instanceCount = 0;
    this._rollInsects();
    this.swarmMaterial = createSwarmMaterial();
    this.swarm = new Mesh(this.insectGeometry, this.swarmMaterial);
    this.swarm.name = 'PlagueSwarm';
    this.swarm.layers.set(LAYER.VFX);
    this.swarm.renderOrder = 13;
    this.swarm.frustumCulled = false;
    this.swarm.visible = false;
    this.group.add(this.swarm);
    this._swarmState = {
      hive: new Vector3(),
      mouthY: 1.6,
      center: new Vector3(),
      zoneR: 4,
      swirl: 0,
      swirlRate: 0,
      cloud: 0,
      cloudRate: 0,
      flap: 0,
      flow: 0,
      pour: -1,
      lockT: -1,
      ret: -1
    };

    /* ---- layer 4: the pool ---- */
    this.poolGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.poolMaterial = createToxicPoolMaterial();
    this.pool = new Mesh(this.poolGeometry, this.poolMaterial);
    this.pool.name = 'PlaguePool';
    this.pool.layers.set(LAYER.VFX);
    this.pool.renderOrder = 4;
    this.pool.frustumCulled = false;
    this.pool.visible = false;
    this.group.add(this.pool);
    this._poolState = { center: new Vector3(), zoneR: 4, radius: 0, mark: 0, fade: 0, seed: 0 };

    /* ---- the miasma over it ---- */
    this.warpGeometry = new PlaneGeometry(1, 1);
    this.warpMaterial = createMiasmaWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.name = 'PlagueMiasma';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);
    this._warpState = { width: 8, strength: 0, seed: 0 };

    /** The bodies being eaten. */
    this.victims = [];
    for (let i = 0; i < MAX_VICTIMS; i++) {
      this.victims.push({ dummy: null, exposure: 0, feed: 0, killed: false, writhe: 0, devoured: false, x: 0, z: 0 });
    }
    this._victimCount = 0;
    /** The swarm's eight target slots: which victim, where (smoothed), how committed. */
    this.slots = [];
    for (let i = 0; i < SWARM_SLOTS; i++) this.slots.push({ victim: -1, pos: new Vector3(), weight: 0 });

    this._seed = 0;
    this._rite = -1;
    this._fadeT = 0;
    this._swirl = 0;
    this._cloud = 0;
    this._flap = 0;
    this._flow = 0;
    this._beat = 0;
    this._cracked = false;
    this._split = false;
    this._turned = false;
    this._home = false;
    this._stained = false;
    this._nextRing = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _buildHive() {
    const c = settings.plague;
    this._shapeKey = `${Math.round(c.hivePlates)}|${c.hiveLumps}`;
    return createHiveGeometry({ plates: c.hivePlates, lumps: c.hiveLumps, seed: 4.2 });
  }

  /** Rebuild the hive only when a shape slider actually moved. */
  _syncGeometry() {
    const c = settings.plague;
    const key = `${Math.round(c.hivePlates)}|${c.hiveLumps}`;
    if (key === this._shapeKey) return;
    const old = this.hive.geometry;
    this.hive.geometry = this._buildHive();
    this.hiveGeometry = this.hive.geometry;
    old.dispose();
  }

  /** Fresh dice for every insect — no allocation, just new numbers in place. */
  _rollInsects() {
    const a = this.rand.array;
    const b = this.rand2.array;
    for (let i = 0; i < MAX_INSECTS * 4; i++) {
      a[i] = Math.random();
      b[i] = Math.random();
    }
    this.rand.needsUpdate = true;
    this.rand2.needsUpdate = true;
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Sparks buzzing round every feeding cloud.
    this.buzz = particles.get('plague.buzz', {
      capacity: 2200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      curl: true,
      softFade: 0.3
    });
    this.buzz.uniforms.uSizeIn.value = 0.05;
    this.buzz.uniforms.uFadeIn.value = 0.05;
    this.buzz.uniforms.uFadeOut.value = 0.5;
    this.buzz.uniforms.uEndSize.value = 0.4;
    this.buzz.uniforms.uDrag.value = 2.4;
    this.buzz.uniforms.uGravity.value.set(0, 0, 0);
    this.buzz.uniforms.uTurbFrequency.value = 1.4;
    this.buzz.uniforms.uTurbSpeed.value = 1.2;

    // Toxic mist pooling on the floor: non-additive, so it stains the air.
    this.mist = particles.get('plague.mist', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.3;
    this.mist.uniforms.uFadeIn.value = 0.25;
    this.mist.uniforms.uFadeOut.value = 0.45;
    this.mist.uniforms.uEndSize.value = 1.8;
    this.mist.uniforms.uDrag.value = 1.6;

    this.bubbles = particles.get('plague.bubbles', {
      capacity: 500,
      shape: ParticleShape.BUBBLE,
      additive: false,
      softFade: 0.2
    });
    this.bubbles.uniforms.uSizeIn.value = 0.2;
    this.bubbles.uniforms.uFadeIn.value = 0.1;
    this.bubbles.uniforms.uFadeOut.value = 0.15;
    this.bubbles.uniforms.uEndSize.value = 1.4;
    this.bubbles.uniforms.uDrag.value = 1.0;

    this.spores = particles.get('plague.spores', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.spores.uniforms.uSizeIn.value = 0.1;
    this.spores.uniforms.uFadeIn.value = 0.1;
    this.spores.uniforms.uFadeOut.value = 0.5;
    this.spores.uniforms.uEndSize.value = 0.5;
    this.spores.uniforms.uDrag.value = 1.4;
    this.spores.uniforms.uGravity.value.set(0, 0.35, 0);

    this.chips = particles.get('plague.chips', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.25;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uDrag.value = 0.5;
    this.chips.uniforms.uTurbulence.value = 0;

    // Soil thrown up over the burrow.
    this.dust = particles.get('plague.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.5;
    this.dust.uniforms.uEndSize.value = 2.0;
    this.dust.uniforms.uDrag.value = 2.0;
    this.dust.uniforms.uGravity.value.set(0, 0.2, 0);

    this.burrowDust = new RateEmitter();
    this.burrowChip = new RateEmitter();
    this.burrowSpore = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.bubbleEmitter = new RateEmitter();
    this.buzzEmitter = new RateEmitter();
    this.dissolveEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every beat from live settings                              */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.3, settings.plague.zoneRadius);
  }

  /** Seconds after the hive surfaces that its plates split and the swarm pours. */
  get _splitAt() {
    const c = settings.plague;
    return c.crackDelay + c.crackTime;
  }

  get _feedTime() {
    return Math.max(0.1, settings.plague.lifetime * settings.global.lifetime);
  }

  /** The impact phase is the whole life of the swarm, out and home again. */
  get impactDuration() {
    const c = settings.plague;
    return Math.max(0.3, this._splitAt + c.lockDelay + this._feedTime + c.returnStagger + c.returnTime + 0.2);
  }

  /** The fade is the hive dissolving and the pool eroding. */
  get fadeDuration() {
    return Math.max(0.2, settings.plague.fadeTime * settings.global.lifetime);
  }

  /** The light throbs with the brood sac. */
  lightShimmer() {
    const p = settings.plague.lightPulse;
    return 1 - p * 0.5 + p * this._beat;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.burrowDust.reset();
    this.burrowChip.reset();
    this.burrowSpore.reset();
    this.mistEmitter.reset();
    this.bubbleEmitter.reset();
    this.buzzEmitter.reset();
    this.dissolveEmitter.reset();

    this._seed = Math.random() * 100;
    this._rite = -1;
    this._fadeT = 0;
    this._swirl = Math.random() * TAU;
    this._cloud = Math.random() * TAU;
    this._flap = 0;
    this._flow = Math.random() * 10;
    this._beat = 0;
    this._cracked = false;
    this._split = false;
    this._turned = false;
    this._home = false;
    this._stained = false;
    this._nextRing = Math.max(0.5, settings.plague.burrowRingSpacing * 0.5);
    this._clearVictims();
    this._rollInsects();

    this.hive.visible = false;
    this.sac.visible = false;
    this.swarm.visible = false;
    this.pool.visible = true;
    this.warp.visible = false;
    this._sync(0);
  }

  _clearVictims() {
    for (const v of this.victims) {
      v.dummy = null;
      v.exposure = 0;
      v.feed = 0;
      v.killed = false;
      v.writhe = 0;
      v.devoured = false;
    }
    this._victimCount = 0;
    for (const s of this.slots) {
      s.victim = -1;
      s.weight = 0;
    }
  }

  _resetEmit(time) {
    _emit.position = null;
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
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

  _centrePoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* The hive's envelopes                                                */
  /* ------------------------------------------------------------------ */

  _hiveEnvelopes() {
    const c = settings.plague;
    const s = this._hiveState;
    const rite = this._rite;
    if (rite < 0) {
      s.rise = 0;
      s.open = 0;
      s.crack = 0;
      s.sink = 0;
      s.dissolve = 0;
      return s;
    }
    const riseT = Math.max(0.02, c.hiveRiseTime);
    s.rise = rite < riseT
      ? Easing.outCubic(rite / riseT) * (1 + c.hiveOvershoot)
      : lerp(1 + c.hiveOvershoot, 1, Easing.outCubic(saturate((rite - riseT) / 0.3)));

    // The seams glow up to the split, then cool as the plates swing open.
    const split = this._splitAt;
    const crackUp = saturate((rite - c.crackDelay) / Math.max(0.02, c.crackTime));
    s.crack = Easing.inQuad(crackUp) * (1 - saturate((rite - split) / 0.5));

    const ot = rite - split;
    const openT = Math.max(0.02, c.openTime);
    let open = 0;
    if (ot > 0) {
      open = ot < openT
        ? Easing.outCubic(ot / openT) * (1 + c.openOvershoot)
        : lerp(1 + c.openOvershoot, 1, Easing.outCubic(saturate((ot - openT) / 0.35)));
    }
    // Draws half shut once the swarm is home.
    const homeAt = split + c.lockDelay + this._feedTime + c.returnStagger + c.returnTime;
    open *= 1 - c.closeAmount * Easing.inOutQuad(saturate((rite - homeAt + 0.3) / 0.6));
    s.open = open;

    s.dissolve = Easing.inOutQuad(this._fadeT);
    s.sink = c.hiveSink * Easing.inQuad(this._fadeT);
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _advance(dt) {
    const c = settings.plague;
    const g = settings.global;
    this._swirl += c.swirlSpeed * g.animationSpeed * dt;
    this._cloud += c.cloudSpeed * g.animationSpeed * dt;
    this._flap += c.flapSpeed * dt;
    this._flow += c.flowSpeed * g.noiseSpeed * dt;
    this._beat = Math.pow(Math.max(0, Math.sin(frame.uTime.value * 5.5)), 6);
  }

  _sync(dt) {
    const c = settings.plague;
    const g = settings.global;
    const R = this.radius;
    this._centrePoint(_centre);
    this._syncGeometry();

    /* ---- the hive ---- */
    const hs = this._hiveEnvelopes();
    this.hiveMaterial.userData.sync(hs);
    this.hive.position.copy(_centre);
    this.hive.visible = this._rite >= 0 && hs.dissolve < 0.999;
    // The brood sac: seen once the plates part; gutters as the hive dies.
    const sacR = Math.max(0.02, c.sacSize * c.hiveHeight);
    const sacUp = saturate(hs.rise) * (0.35 + 0.65 * saturate(hs.open));
    this.sac.position.set(_centre.x, c.hiveHeight * 0.4 * saturate(hs.rise) - c.hiveRiseFrom * (1 - saturate(hs.rise)) - hs.sink, _centre.z);
    this.sac.scale.set(sacR * c.hiveRadius, sacR * (1 + this._beat * c.sacPulse * 0.15), sacR * c.hiveRadius).multiplyScalar(Math.max(0.01, sacUp * (1 - hs.dissolve)));
    this.sacMaterial.userData.sync(1 - hs.dissolve);
    this.sac.visible = this.hive.visible && hs.rise > 0.05;

    /* ---- the swarm ---- */
    const sw = this._swarmState;
    const split = this._splitAt;
    sw.hive.copy(_centre).setY(-hs.sink);
    sw.mouthY = c.hiveHeight * 0.92 * saturate(hs.rise);
    sw.center.copy(_centre);
    sw.zoneR = R;
    sw.swirl = this._swirl;
    sw.swirlRate = c.swirlSpeed * g.animationSpeed;
    sw.cloud = this._cloud;
    sw.cloudRate = c.cloudSpeed * g.animationSpeed;
    sw.flap = this._flap;
    sw.flow = this._flow;
    sw.pour = this._rite < 0 ? -1 : this._rite - split;
    sw.lockT = sw.pour - c.lockDelay;
    sw.ret = sw.lockT - this._feedTime;
    this.swarmMaterial.userData.sync(sw);
    this.insectGeometry.instanceCount = Math.min(MAX_INSECTS, Math.max(0, Math.round(c.swarmCount * g.particleCount)));
    this.swarm.visible = sw.pour > 0 && sw.ret < c.returnStagger + c.returnTime + 0.1;
    this._writeSlots(dt);

    /* ---- the pool ---- */
    const ps = this._poolState;
    ps.center.copy(_centre);
    ps.zoneR = R;
    ps.seed = this._seed;
    ps.fade = this._fadeT;
    if (this._rite < 0) {
      ps.radius = 0;
      ps.mark = Easing.outCubic(this.u);
    } else {
      ps.radius = R * c.poolRadius * Easing.outCubic(saturate((this._rite - c.poolDelay) / Math.max(0.05, c.poolGrowTime)));
      ps.mark = 1 - saturate(this._rite / 0.7);
    }
    this.poolMaterial.userData.sync(ps);
    const quad = 2 * (R * Math.max(1.2, c.engulfReach + 0.2) + c.bodyPoolRadius + 1.5);
    this.pool.position.set(_centre.x, 0.012, _centre.z);
    this.pool.scale.set(quad, 1, quad);
    this.pool.visible = this._fadeT < 1;

    /* ---- the miasma ---- */
    const wst = this._warpState;
    wst.width = R * c.warpWidth;
    wst.seed = this._seed;
    wst.strength = this._rite < 0 ? 0 : saturate(ps.radius / Math.max(0.1, R * c.poolRadius)) * (1 - this._fadeT);
    this.warpMaterial.userData.sync(wst);
    this.warp.position.copy(_centre);
    this.warp.visible = wst.strength > 0.002;

    /* ---- the particles' looks ---- */
    for (const look of LOOKS) {
      const system = this[look.system];
      const p = look.prefix;
      system.setGradient(getColor(c[p[0]]), getColor(c[p[1]]), getColor(c[p[2]]), getColor(c[p[3]]));
      const u = system.uniforms;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = (look.opacity ? c[look.opacity] : 1) * g.opacity;
      u.uGlow.value = (look.glow ? c[look.glow] : 1) * g.glow;
    }
    this.buzz.uniforms.uStretch.value = c.buzzStretch;
    this.buzz.uniforms.uTurbulence.value = 1.6 * g.turbulence;
    this.mist.uniforms.uGravity.value.set(0, c.mistRise, 0);
    this.mist.uniforms.uTurbulence.value = 0.35 * g.turbulence;
    this.bubbles.uniforms.uGravity.value.set(0, c.bubbleRise, 0);
    this.bubbles.uniforms.uTurbulence.value = 0.3 * g.turbulence;
    this.spores.uniforms.uTurbulence.value = 0.9 * g.turbulence;
    this.chips.uniforms.uGravity.value.set(0, c.chipGravity, 0);
    this.dust.uniforms.uTurbulence.value = 0.4 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** Where a victim's cloud centres: up a standing body, on a fallen one. */
  _victimPoint(victim, out) {
    const c = settings.plague;
    const dummy = victim.dummy;
    if (!dummy.alive && dummy.bodyPoint(out)) {
      out.y = Math.max(out.y, 0.25) + 0.1;
      return out;
    }
    return out.copy(dummy.position).setY(c.cloudHeight);
  }

  /** Take in any body in the circle the swarm does not have yet. */
  _acquire() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.plague;
    this._centrePoint(_centre);
    const found = field.findBodies(_centre.x, _centre.z, this.radius * c.engulfReach, this._found);
    for (const dummy of found) {
      if (this._victimCount >= MAX_VICTIMS) break;
      if (dummy.finished) continue;
      let known = false;
      for (let i = 0; i < this._victimCount; i++) if (this.victims[i].dummy === dummy) known = true;
      if (known) continue;
      // A corpse with no solver behind it has nothing left to eat.
      if (!dummy.alive && !dummy.bodyPoint(_body)) continue;
      const v = this.victims[this._victimCount++];
      v.dummy = dummy;
      v.exposure = 0;
      v.feed = 0;
      v.killed = !dummy.alive;
      v.writhe = Math.random();
      v.devoured = false;
    }
    this._found.length = 0;
  }

  /** Drop victims that are gone (burned away, or stood back up by a reset). */
  _prune() {
    for (let i = this._victimCount - 1; i >= 0; i--) {
      const v = this.victims[i];
      const d = v.dummy;
      if (d && !d.finished && !(v.killed && d.alive)) continue;
      // Swap-remove, and repoint the slots of the one that moved.
      const last = this._victimCount - 1;
      for (const s of this.slots) {
        if (s.victim === i) s.victim = -1;
        else if (s.victim === last) s.victim = i;
      }
      const tmp = this.victims[i];
      this.victims[i] = this.victims[last];
      this.victims[last] = tmp;
      tmp.dummy = null;
      this._victimCount = last;
    }
  }

  /**
   * Hand every slot a body, spreading the swarm evenly over them. A slot that
   * changes body flies its cloud there (its position is smoothed), so no
   * insect ever jumps.
   */
  _assignSlots() {
    const n = this._victimCount;
    if (n === 0) {
      for (const s of this.slots) s.victim = -1;
      return;
    }
    _slotCount.fill(0);
    for (const s of this.slots) if (s.victim >= 0) _slotCount[s.victim]++;
    for (const s of this.slots) {
      // Re-home a slot that is empty, or one of several on a crowded body
      // while some other body has none.
      let need = -1;
      for (let i = 0; i < n; i++) if (_slotCount[i] === 0) need = i;
      if (s.victim < 0 || (need >= 0 && _slotCount[s.victim] > 1)) {
        let pick = need;
        if (pick < 0) {
          pick = 0;
          for (let i = 1; i < n; i++) if (_slotCount[i] < _slotCount[pick]) pick = i;
        }
        if (s.victim >= 0) _slotCount[s.victim]--;
        if (s.weight < 0.01) this._victimPoint(this.victims[pick], s.pos);
        s.victim = pick;
        _slotCount[pick]++;
      }
    }
  }

  /** Smooth the slots toward their bodies and hand them to the shader. */
  _writeSlots(dt) {
    const targets = this.swarmMaterial.uniforms.uTargets.value;
    const pools = this.poolMaterial.uniforms.uPools.value;
    const c = settings.plague;
    const follow = 1 - Math.exp(-6 * dt);
    for (let i = 0; i < SWARM_SLOTS; i++) {
      const s = this.slots[i];
      if (s.victim >= 0) {
        this._victimPoint(this.victims[s.victim], _body);
        s.pos.lerp(_body, follow);
        s.weight = Math.min(1, s.weight + dt * 3);
      } else {
        s.weight = Math.max(0, s.weight - dt * 2);
      }
      targets[i].set(s.pos.x, s.pos.y, s.pos.z, s.weight);
    }
    // A pool welling up under every body being eaten.
    this._centrePoint(_centre);
    for (let i = 0; i < SWARM_SLOTS; i++) {
      if (i >= this._victimCount) {
        pools[i].set(0, 0, 0, 0);
        continue;
      }
      const v = this.victims[i];
      const grow = Easing.outCubic(saturate(v.feed / Math.max(0.05, c.bodyPoolTime)));
      pools[i].set(v.x - _centre.x, v.z - _centre.z, c.bodyPoolRadius * grow, 0);
    }
  }

  /**
   * Feed: stain, fell, writhe, devour. Called every frame of the impact phase.
   * @param {number} lockRamp 0..1 how much of the swarm has committed
   * @param {boolean} feeding whether the swarm is still on the bodies
   */
  _feed(dt, lockRamp, feeding) {
    const c = settings.plague;
    const g = settings.global;
    this._force.impulse = c.collapseImpulse;
    this._force.lift = c.collapseLift;
    this._force.spin = c.collapseSpin;

    for (let i = 0; i < this._victimCount; i++) {
      const v = this.victims[i];
      const dummy = v.dummy;
      this._victimPoint(v, _body);
      v.x = _body.x;
      v.z = _body.z;

      if (feeding) {
        v.exposure += dt * lockRamp;
        v.feed += dt * lockRamp;
      }
      // Pushed every frame — this also carries the live editor colours onto it.
      const stain = dummy.corrode(saturate(v.exposure / Math.max(0.05, c.corrodeTime)), c.look);

      if (dummy.alive) {
        if (!feeding || stain < c.collapseAt) continue;
        // It folds where it stands, a little away from the hive.
        _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        _dir.normalize();
        _dir.x += (Math.random() - 0.5) * 0.8;
        _dir.z += (Math.random() - 0.5) * 0.8;
        _dir.normalize();
        if (dummy.kill(_dir.x, _dir.z, this._force)) {
          v.killed = true;
          this._collapseFx(_body);
        }
        continue;
      }

      if (!feeding) continue;
      // Down, and still being eaten: it twitches, and does not get to rot yet.
      dummy.hold();
      v.writhe += dt * c.writheRate * (0.6 + 0.8 * Math.random());
      while (v.writhe >= 1) {
        v.writhe -= 1;
        const a = Math.random() * TAU;
        const f = c.writheForce * (0.5 + Math.random());
        dummy.shove(Math.cos(a) * f, c.writheLift * Math.random(), Math.sin(a) * f);
      }
    }
  }

  /** The swarm leaving: it takes some of every body it ate. */
  _devour() {
    const c = settings.plague;
    if (c.devour <= 0) return;
    for (let i = 0; i < this._victimCount; i++) {
      const v = this.victims[i];
      if (!v.killed || v.devoured || v.dummy.alive) continue;
      v.devoured = true;
      v.dummy.consume(saturate(c.devour));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._advance(dt);
    this._sync(dt);
    this._burrowFx(dt);
    this.ctx.shake.rumble(settings.plague.burrowRumble * settings.global.cameraShake, dt);
    this.position.y = 0.4;
  }

  onImpact() {
    this._rite = 0;
    this._eruptFx();
  }

  onFade(dt, t) {
    const c = settings.plague;
    this._advance(dt);
    this._rite += dt;
    this._fadeT = t <= 1 ? 0 : saturate(t - 1);

    const split = this._splitAt;
    if (!this._cracked && this._rite >= c.crackDelay) {
      this._cracked = true;
      this.ctx.shake.add(c.crackShake * 0.3 * settings.global.cameraShake, 10, 26);
    }
    if (!this._split && this._rite >= split) {
      this._split = true;
      this._splitFx();
    }

    const lockT = this._rite - split - c.lockDelay;
    const ret = lockT - this._feedTime;
    const feeding = lockT >= 0 && ret < 0;
    if (feeding) this._acquire();
    this._prune();
    if (lockT >= 0 && !this._home) this._assignSlots();
    const lockRamp = saturate(lockT / Math.max(0.05, c.lockTime + c.lockStagger * 0.5));
    this._feed(dt, lockRamp, feeding);
    if (!this._turned && ret >= 0) {
      this._turned = true;
      this._devour();
    }
    if (!this._home && ret >= c.returnStagger + c.returnTime) {
      this._home = true;
      for (const s of this.slots) s.victim = -1;
    }

    this._sync(dt);
    this._holdFx(dt, feeding);

    if (!this._stained && this._fadeT >= 0.6) {
      this._stained = true;
      this._centrePoint(_floor);
      this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
        radius: this.radius * c.poolRadius * 1.1,
        life: c.stainLife,
        intensity: c.stainIntensity,
        colorA: getColor(c.colorStainA),
        colorB: getColor(c.colorStainB),
        height: 0.011
      });
    }

    this._centrePoint(this.position);
    this.position.y = c.lightHeight + c.hiveHeight * 0.4;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** The burrow racing to the circle under the floor. */
  _burrowFx(dt) {
    const c = settings.plague;
    const g = settings.global;
    const time = frame.uTime.value;
    _floor.copy(this.position).setY(0.08);

    const dust = this.burrowDust.tick(dt, c.burrowRate * g.particleCount);
    if (dust > 0) {
      this._resetEmit(time);
      _emit.position = _floor;
      _emit.radius = 0.35;
      _emit.direction = _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? 1 : -1).setY(0.8).normalize();
      _emit.speed = 1.6;
      _emit.spread = 0.6;
      _emit.size = 0.45;
      _emit.life = 1.0;
      _emit.spin = 0.5;
      this.dust.emit(dust, _emit);
    }
    const chips = this.burrowChip.tick(dt, c.burrowChips * g.particleCount);
    if (chips > 0) {
      this._resetEmit(time);
      _emit.position = _floor;
      _emit.radius = 0.25;
      _emit.direction = _up;
      _emit.speed = c.chipSpeed * 0.5;
      _emit.spread = 0.5;
      _emit.size = c.chipSize * 0.8;
      _emit.life = c.chipLifetime * 0.7;
      _emit.spin = 8;
      this.chips.emit(chips, _emit);
    }
    const spores = this.burrowSpore.tick(dt, c.burrowSpores * g.particleCount);
    if (spores > 0) {
      this._resetEmit(time);
      _emit.position = _floor;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = 0.8;
      _emit.spread = 0.6;
      _emit.size = c.sporeSize;
      _emit.life = c.sporeLifetime;
      this.spores.emit(spores, _emit);
    }
    const along = this.front;
    let guard = 0;
    while (along >= this._nextRing && guard++ < 8) {
      this.pointAt(Math.min(1, this._nextRing / this.length), _floor);
      _floor.y = 0;
      this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
        radius: c.burrowRingRadius,
        life: 0.7,
        intensity: 0.6,
        colorA: getColor(c.colorChipB),
        colorB: getColor(c.colorChipA)
      });
      this._nextRing += Math.max(0.3, c.burrowRingSpacing);
    }
  }

  /** The hive bursting up out of the floor. */
  _eruptFx() {
    const c = settings.plague;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._centrePoint(_floor);
    _pos.copy(_floor).setY(0.4);
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: 0.55,
      intensity: c.burstIntensity,
      opacity: 0.75,
      squash: 0.5,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.CRACK, _floor, {
      radius: c.hiveRadius * 1.6,
      life: this.impactDuration + this.fadeDuration,
      intensity: 1,
      colorA: getColor(c.colorChitinA),
      colorB: getColor(c.colorVein)
    });
    this._resetEmit(time);
    _emit.position = _pos.copy(_floor).setY(0.2);
    _emit.radius = c.hiveRadius * 0.4;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.size = c.chipSize;
    _emit.life = c.chipLifetime;
    _emit.spin = 10;
    this.chips.emit(Math.round(c.eruptChips * g.particleCount), _emit);
    _emit.speed = 2;
    _emit.spread = 0.9;
    _emit.size = 0.7;
    _emit.life = 1.4;
    _emit.spin = 0.4;
    this.dust.emit(Math.round(14 * g.particleCount), _emit);
    this.ctx.shake.add(c.eruptShake * power * g.cameraShake, 4, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.eruptFlash * power);
    this.lightBoost = c.lightIntensity * c.eruptLight * power;
  }

  /** The plates splitting: mist and spores blown out, a shockwave, a flash. */
  _splitFx() {
    const c = settings.plague;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._centrePoint(_floor);
    this._resetEmit(time);
    _pos.copy(_floor).setY(c.hiveHeight * 0.6);
    _emit.position = _pos;
    _emit.radius = c.hiveRadius * 0.5;
    _emit.direction = _up;
    _emit.speed = 2.2;
    _emit.spread = 1;
    _emit.size = c.mistSize * 0.8;
    _emit.life = c.mistLifetime * 0.7;
    _emit.spin = 0.4;
    this.mist.emit(Math.round(c.crackMist * g.particleCount), _emit);
    _emit.speed = 3.5;
    _emit.size = c.sporeSize * 1.4;
    _emit.life = c.sporeLifetime;
    this.spores.emit(Math.round(c.crackSpores * g.particleCount), _emit);
    _emit.speed = c.chipSpeed * 0.7;
    _emit.size = c.chipSize * 0.8;
    _emit.life = c.chipLifetime;
    _emit.spin = 10;
    this.chips.emit(Math.round(c.eruptChips * 0.4 * g.particleCount), _emit);

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.05,
      intensity: 0.9,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.shake.add(c.crackShake * power * g.cameraShake, 5, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.crackFlash * power);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.crackLight * power);
  }

  /** A body folding under the swarm. */
  _collapseFx(at) {
    const c = settings.plague;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.speed = c.buzzSpeed * 1.5;
    _emit.spread = 1;
    _emit.size = c.buzzSize * 1.3;
    _emit.life = c.buzzLifetime;
    this.buzz.emit(Math.round(30 * g.particleCount), _emit);
    _pos.setY(0.2);
    _emit.speed = 0.6;
    _emit.size = c.mistSize * 0.7;
    _emit.life = c.mistLifetime * 0.6;
    _emit.spin = 0.4;
    this.mist.emit(Math.round(4 * g.particleCount), _emit);
    this.ctx.shake.add(0.08 * g.cameraShake, 8, 20);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.4);
  }

  /** Mist, bubbles, buzz and the dissolve — everything that runs while the hive stands. */
  _holdFx(dt, feeding) {
    const c = settings.plague;
    const g = settings.global;
    const time = frame.uTime.value;
    this._centrePoint(_centre);
    const radius = this._poolState.radius;
    const wet = 1 - this._fadeT;

    /* mist pooling on the floor: over the main pool and the body pools */
    const mist = this.mistEmitter.tick(dt, c.mistRate * saturate(radius / Math.max(0.1, this.radius * c.poolRadius)) * wet * g.particleCount);
    for (let n = 0; n < mist; n++) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      let x = _centre.x;
      let z = _centre.z;
      let r = Math.sqrt(Math.random()) * radius;
      if (this._victimCount > 0 && Math.random() < 0.4) {
        const v = this.victims[(Math.random() * this._victimCount) | 0];
        x = v.x;
        z = v.z;
        r = Math.sqrt(Math.random()) * c.bodyPoolRadius;
      }
      _pos.set(x + Math.cos(a) * r, c.mistHeight, z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.radius = 0.25;
      _emit.direction = _dir.set(Math.cos(a), 0.1, Math.sin(a));
      _emit.speed = 0.3;
      _emit.spread = 0.4;
      _emit.size = c.mistSize;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.3;
      this.mist.emit(1, _emit);
    }

    /* bubbles rising off it */
    const bubbles = this.bubbleEmitter.tick(dt, c.bubbleParticleRate * wet * (radius > 0.2 ? 1 : 0) * g.particleCount);
    for (let n = 0; n < bubbles; n++) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * radius;
      _pos.set(_centre.x + Math.cos(a) * r, 0.05, _centre.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.radius = 0.1;
      _emit.direction = _up;
      _emit.speed = c.bubbleRise;
      _emit.spread = 0.2;
      _emit.size = c.bubbleParticleSize;
      _emit.life = c.bubbleParticleLife;
      this.bubbles.emit(1, _emit);
    }

    /* buzz round every feeding cloud */
    if (feeding && this._victimCount > 0) {
      const buzz = this.buzzEmitter.tick(dt, c.buzzRate * this._victimCount * g.particleCount);
      for (let n = 0; n < buzz; n++) {
        const s = this.slots[(Math.random() * SWARM_SLOTS) | 0];
        if (s.weight < 0.2) continue;
        this._resetEmit(time);
        const a = Math.random() * TAU;
        const y = (Math.random() * 2 - 1) * c.cloudRadius * c.cloudTall * 0.8;
        _pos.set(s.pos.x + Math.cos(a) * c.cloudRadius, s.pos.y + y, s.pos.z + Math.sin(a) * c.cloudRadius);
        _emit.position = _pos;
        _emit.radius = 0.1;
        _emit.direction = _dir.set(-Math.sin(a), (Math.random() - 0.5) * 0.6, Math.cos(a));
        _emit.speed = c.buzzSpeed;
        _emit.spread = 0.3;
        _emit.size = c.buzzSize;
        _emit.life = c.buzzLifetime;
        this.buzz.emit(1, _emit);
      }
    }

    /* spores off the burning edge as the hive dissolves */
    if (this._fadeT > 0 && this._fadeT < 0.9) {
      const spores = this.dissolveEmitter.tick(dt, 120 * g.particleCount);
      if (spores > 0) {
        this._resetEmit(time);
        _pos.copy(_centre).setY(c.hiveHeight * (1 - this._fadeT) * 0.8);
        _emit.position = _pos;
        _emit.radius = c.hiveRadius * 0.45;
        _emit.direction = _up;
        _emit.speed = 0.9;
        _emit.spread = 0.8;
        _emit.size = c.sporeSize;
        _emit.life = c.sporeLifetime;
        this.spores.emit(spores, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.hive.visible = false;
    this.sac.visible = false;
    this.swarm.visible = false;
    this.pool.visible = false;
    this.warp.visible = false;
    this.insectGeometry.instanceCount = 0;
    // Give back any body still held, so a corpse does not lie there forever.
    this._clearVictims();
  }

  dispose() {
    this.hive.geometry.dispose();
    this.sacGeometry.dispose();
    this.insectGeometry.dispose();
    this.poolGeometry.dispose();
    this.warpGeometry.dispose();
    this.hiveMaterial.userData.depth.dispose();
    this.hiveMaterial.dispose();
    this.sacMaterial.dispose();
    this.swarmMaterial.dispose();
    this.poolMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1FAB2}  Plague Swarm');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'burrow speed (m/s)');
  R(cast, c, 'lifetime', 0.2, 10, 0.05, 'swarm feeds for (s)');
  R(cast, c, 'fadeTime', 0.2, 6, 0.05, 'hive dissolves over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 6, 0.05, 'height (m)');
  R(light, c, 'lightPulse', 0, 1, 0.01, 'throb');

  const burrow = folder.addFolder('1 · Burrow');
  R(burrow, c, 'burrowRate', 0, 400, 1, 'dust / s');
  R(burrow, c, 'burrowChips', 0, 300, 1, 'chips / s');
  R(burrow, c, 'burrowSpores', 0, 300, 1, 'spores / s');
  R(burrow, c, 'burrowRingSpacing', 0.3, 8, 0.05, 'dust ring every (m)');
  R(burrow, c, 'burrowRingRadius', 0.1, 4, 0.05, 'dust ring radius');
  R(burrow, c, 'burrowRumble', 0, 0.5, 0.005, 'rumble');

  const hive = folder.addFolder('2 · Hive');
  const shape = hive.addFolder('Shape & motion');
  R(shape, c, 'hiveHeight', 0.3, 5, 0.05, 'height (m)');
  R(shape, c, 'hiveRadius', 0.2, 3, 0.01, 'girth');
  R(shape, c, 'hivePlates', 2, 12, 1, 'plates (rebuild)');
  R(shape, c, 'hiveLumps', 0, 0.6, 0.01, 'lumps (rebuild)');
  R(shape, c, 'hiveRiseFrom', 0, 5, 0.05, 'rises from (m below)');
  R(shape, c, 'hiveRiseTime', 0.02, 2, 0.01, 'bursts up over (s)');
  R(shape, c, 'hiveOvershoot', 0, 0.5, 0.01, 'punch');
  R(shape, c, 'crackDelay', 0, 3, 0.01, 'cracks after (s)');
  R(shape, c, 'crackTime', 0.02, 2, 0.01, 'seams glow for (s)');
  R(shape, c, 'openTime', 0.02, 2, 0.01, 'opens over (s)');
  R(shape, c, 'openAngle', 0, 2.4, 0.01, 'opens by (rad)');
  R(shape, c, 'openJitter', 0, 1, 0.01, 'uneven opening');
  R(shape, c, 'openOvershoot', 0, 0.6, 0.01, 'fling past open');
  R(shape, c, 'closeAmount', 0, 1, 0.01, 'closes back once home');
  R(shape, c, 'hiveHinge', 0.02, 0.7, 0.005, 'hinge height');
  R(shape, c, 'hivePulse', 0, 0.2, 0.001, 'breathing');
  R(shape, c, 'pulseSpeed', 0, 12, 0.05, 'breath speed');
  R(shape, c, 'hiveSink', 0, 4, 0.05, 'sinks as it dies (m)');
  const chitin = hive.addFolder('Chitin');
  R(chitin, c, 'hiveRoughness', 0, 1, 0.01, 'roughness');
  R(chitin, c, 'iridescence', 0, 4, 0.01, 'iridescence');
  R(chitin, c, 'iridScale', 0, 8, 0.01, 'hue slide');
  R(chitin, c, 'iridHue', 0, 1, 0.005, 'hue offset');
  R(chitin, c, 'veinGlow', 0, 10, 0.05, 'vein glow');
  R(chitin, c, 'veinScale', 0.5, 16, 0.05, 'vein scale');
  R(chitin, c, 'veinWidth', 0.005, 0.3, 0.001, 'vein width');
  R(chitin, c, 'veinSpeed', 0, 6, 0.05, 'vein pulse speed');
  R(chitin, c, 'seamGlow', 0, 15, 0.05, 'seam glow');
  R(chitin, c, 'gooGlow', 0, 8, 0.05, 'inside glow');
  R(chitin, c, 'dissolveGlow', 0, 12, 0.05, 'dissolve edge');
  R(chitin, c, 'sacSize', 0, 0.8, 0.005, 'brood sac (× height)');
  R(chitin, c, 'sacGlow', 0, 10, 0.05, 'sac glow');
  R(chitin, c, 'sacPulse', 0, 2, 0.01, 'sac throb');
  chitin.addColor(c, 'colorChitinA').name('chitin');
  chitin.addColor(c, 'colorChitinB').name('chitin mottle');
  chitin.addColor(c, 'colorVein').name('veins');
  chitin.addColor(c, 'colorSeam').name('seams');
  chitin.addColor(c, 'colorGoo').name('inside');
  chitin.addColor(c, 'colorSac').name('brood sac');
  chitin.addColor(c, 'colorDissolve').name('dissolve edge');

  const swarm = folder.addFolder('3 · Swarm');
  R(swarm, c, 'swarmCount', 0, MAX_INSECTS, 1, 'insects');
  R(swarm, c, 'pourTime', 0.05, 4, 0.01, 'pours out over (s)');
  R(swarm, c, 'emergeTime', 0.05, 3, 0.01, 'mouth to vortex (s)');
  R(swarm, c, 'burstHeight', 0, 8, 0.05, 'burst height (m)');
  R(swarm, c, 'swirlRadiusMin', 0, 1.5, 0.01, 'vortex inner (× zone)');
  R(swarm, c, 'swirlRadiusMax', 0.1, 2, 0.01, 'vortex outer (× zone)');
  R(swarm, c, 'swirlHeightMin', 0, 5, 0.05, 'lowest (m)');
  R(swarm, c, 'swirlHeightMax', 0.1, 8, 0.05, 'highest (m)');
  R(swarm, c, 'swirlSpeed', -6, 6, 0.01, 'vortex speed (rad/s)');
  R(swarm, c, 'swirlSameWay', 0, 1, 0.01, 'turning together');
  R(swarm, c, 'swirlBob', 0, 2, 0.01, 'bob (m)');
  R(swarm, c, 'flowAmp', 0, 3, 0.01, 'curl flow (m)');
  R(swarm, c, 'flowScale', 0.05, 4, 0.01, 'flow scale');
  R(swarm, c, 'flowSpeed', 0, 6, 0.01, 'flow speed');
  const bug = swarm.addFolder('Insects');
  R(bug, c, 'insectSize', 0.01, 0.6, 0.005, 'size (m)');
  R(bug, c, 'insectStretch', 0, 0.5, 0.005, 'speed smear');
  R(bug, c, 'insectGlow', 0, 12, 0.05, 'body glow');
  R(bug, c, 'wingGlow', 0, 6, 0.05, 'wing glow');
  R(bug, c, 'haloSize', 0, 10, 0.05, 'halo (× body)');
  R(bug, c, 'haloGlow', 0, 4, 0.01, 'halo glow');
  R(bug, c, 'flapSpeed', 0, 120, 0.5, 'wingbeat (rad/s)');
  R(bug, c, 'flapAngle', 0, 1.6, 0.01, 'wing sweep (rad)');
  R(bug, c, 'feedFrenzy', 0, 4, 0.01, 'brighter feeding');
  bug.addColor(c, 'colorInsectCore').name('core');
  bug.addColor(c, 'colorInsectBody').name('body');
  bug.addColor(c, 'colorWing').name('wings');
  bug.addColor(c, 'colorHalo').name('halo');
  const buzz = swarm.addFolder('Buzz');
  R(buzz, c, 'buzzRate', 0, 400, 1, 'sparks / s / body');
  R(buzz, c, 'buzzSize', 0.005, 0.2, 0.001, 'size');
  R(buzz, c, 'buzzLifetime', 0.05, 2, 0.01, 'lifetime');
  R(buzz, c, 'buzzSpeed', 0, 12, 0.05, 'speed');
  R(buzz, c, 'buzzStretch', 0, 1, 0.005, 'stretch');
  R(buzz, c, 'buzzGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(buzz, c, 'colorBuzz', 'spark gradient');

  const engulf = folder.addFolder('4 · Engulf');
  R(engulf, c, 'lockDelay', 0, 6, 0.05, 'turns on bodies after (s)');
  R(engulf, c, 'lockTime', 0.05, 3, 0.01, 'dive time (s)');
  R(engulf, c, 'lockStagger', 0, 3, 0.01, 'commit stagger (s)');
  R(engulf, c, 'engulfReach', 0.2, 2.5, 0.01, 'reach (× zone)');
  R(engulf, c, 'cloudRadius', 0.1, 3, 0.01, 'cloud radius (m)');
  R(engulf, c, 'cloudTall', 0.3, 4, 0.01, 'cloud tallness');
  R(engulf, c, 'cloudSpeed', -12, 12, 0.05, 'orbit speed (rad/s)');
  R(engulf, c, 'cloudHeight', 0.2, 2.5, 0.01, 'cloud height on a standing body (m)');
  R(engulf, c, 'corrodeTime', 0.1, 6, 0.05, 'stains through over (s)');
  R(engulf, c, 'collapseAt', 0, 1, 0.01, 'collapses at stain');
  R(engulf, c, 'collapseImpulse', 0, 8, 0.05, 'fold impulse (m/s)');
  R(engulf, c, 'collapseLift', 0, 4, 0.05, 'fold lift (m/s)');
  R(engulf, c, 'collapseSpin', 0, 4, 0.01, 'fold tumble');
  R(engulf, c, 'writheRate', 0, 20, 0.1, 'twitches / s');
  R(engulf, c, 'writheForce', 0, 6, 0.05, 'twitch (m/s)');
  R(engulf, c, 'writheLift', 0, 4, 0.05, 'twitch lift (m/s)');
  R(engulf, c, 'devour', 0, 1, 0.01, 'devoured on leaving');
  engulf.addColor(c.look, 'color').name('flesh');
  engulf.addColor(c.look, 'rimColor').name('rim');
  R(engulf, c.look, 'rimEmissive', 0, 6, 0.05, 'rim emissive');
  engulf.addColor(c.look, 'edgeColor').name('burn edge');
  R(engulf, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge emissive');
  R(engulf, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  const home = folder.addFolder('5 · Return');
  R(home, c, 'returnTime', 0.05, 3, 0.01, 'flight home (s)');
  R(home, c, 'returnStagger', 0, 3, 0.01, 'stagger (s)');

  const pool = folder.addFolder('6 · Toxic pool');
  R(pool, c, 'poolRadius', 0, 1.5, 0.01, 'radius (× zone)');
  R(pool, c, 'poolDelay', 0, 3, 0.01, 'spreads after (s)');
  R(pool, c, 'poolGrowTime', 0.05, 5, 0.05, 'spreads over (s)');
  R(pool, c, 'bodyPoolRadius', 0, 3, 0.01, 'under each body (m)');
  R(pool, c, 'bodyPoolTime', 0.05, 5, 0.05, 'wells up over (s)');
  R(pool, c, 'poolEdgeNoise', 0, 1, 0.01, 'ragged edge');
  R(pool, c, 'poolFlowScale', 0.05, 4, 0.01, 'liquid scale');
  R(pool, c, 'poolFlowSpeed', 0, 4, 0.01, 'churn speed');
  R(pool, c, 'bubbleScale', 0.5, 12, 0.05, 'bubble cells / m');
  R(pool, c, 'bubbleRate', 0, 5, 0.01, 'bubble rate');
  R(pool, c, 'bubbleSize', 0.05, 1, 0.01, 'bubble size');
  R(pool, c, 'bubbleShare', 0, 1, 0.01, 'bubbling share');
  R(pool, c, 'poolGlow', 0, 6, 0.05, 'glow');
  R(pool, c, 'poolCaustic', 0, 6, 0.05, 'caustics');
  R(pool, c, 'poolEdgeGlow', 0, 8, 0.05, 'meniscus glow');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'poolErode', 0, 1, 0.01, 'ragged fade');
  R(pool, c, 'markWidth', 0.005, 0.5, 0.001, 'marking ring width (m)');
  R(pool, c, 'markGlow', 0, 8, 0.05, 'marking ring glow');
  R(pool, c, 'stainLife', 0, 15, 0.1, 'stain lingers (s)');
  R(pool, c, 'stainIntensity', 0, 1.5, 0.01, 'stain strength');
  pool.addColor(c, 'colorPoolDeep').name('deep');
  pool.addColor(c, 'colorPoolToxic').name('toxin');
  pool.addColor(c, 'colorPoolFoam').name('bubbles');
  pool.addColor(c, 'colorPoolEdge').name('meniscus & ring');
  pool.addColor(c, 'colorStainA').name('stain');
  pool.addColor(c, 'colorStainB').name('stain dark');
  const mist = pool.addFolder('Mist, bubbles & spores');
  R(mist, c, 'mistRate', 0, 200, 1, 'mist / s');
  R(mist, c, 'mistSize', 0.1, 4, 0.01, 'mist size');
  R(mist, c, 'mistLifetime', 0.2, 6, 0.05, 'mist lifetime');
  R(mist, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  R(mist, c, 'mistRise', -0.5, 2, 0.01, 'mist rise (m/s)');
  R(mist, c, 'mistHeight', 0, 2, 0.01, 'mist height (m)');
  Editor.gradient(mist, c, 'colorMist', 'mist gradient');
  R(mist, c, 'bubbleParticleRate', 0, 120, 1, 'bubbles / s');
  R(mist, c, 'bubbleParticleSize', 0.01, 0.6, 0.005, 'bubble size');
  R(mist, c, 'bubbleParticleLife', 0.1, 4, 0.05, 'bubble lifetime');
  R(mist, c, 'bubbleRise', 0, 4, 0.05, 'bubble rise (m/s)');
  Editor.gradient(mist, c, 'colorBubble', 'bubble gradient');
  R(mist, c, 'sporeSize', 0.005, 0.3, 0.001, 'spore size');
  R(mist, c, 'sporeLifetime', 0.1, 4, 0.05, 'spore lifetime');
  R(mist, c, 'sporeGlow', 0, 8, 0.05, 'spore glow');
  Editor.gradient(mist, c, 'colorSpore', 'spore gradient');

  const erupt = folder.addFolder('7 · Eruption & crack');
  R(erupt, c, 'eruptChips', 0, 200, 1, 'chips');
  R(erupt, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(erupt, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(erupt, c, 'chipLifetime', 0.1, 4, 0.05, 'chip lifetime');
  R(erupt, c, 'chipGravity', -30, 0, 0.1, 'chip gravity');
  Editor.gradient(erupt, c, 'colorChip', 'chip & soil gradient');
  R(erupt, c, 'eruptShake', 0, 1.5, 0.01, 'surfacing knock');
  R(erupt, c, 'eruptFlash', 0, 1, 0.01, 'surfacing flash');
  R(erupt, c, 'eruptLight', 0, 6, 0.01, 'surfacing light (× intensity)');
  R(erupt, c, 'burstRadius', 0, 8, 0.05, 'earth burst (m)');
  R(erupt, c, 'burstIntensity', 0, 4, 0.01, 'burst brightness');
  R(erupt, c, 'crackShake', 0, 1.5, 0.01, 'crack knock');
  R(erupt, c, 'crackFlash', 0, 1, 0.01, 'crack flash');
  R(erupt, c, 'crackLight', 0, 6, 0.01, 'crack light (× intensity)');
  R(erupt, c, 'crackMist', 0, 150, 1, 'mist blown out');
  R(erupt, c, 'crackSpores', 0, 400, 1, 'spores blown out');
  R(erupt, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  erupt.addColor(c, 'colorBurstA').name('burst inner');
  erupt.addColor(c, 'colorBurstB').name('burst mid');
  erupt.addColor(c, 'colorBurstC').name('burst outer');
  erupt.addColor(c, 'colorShockA').name('shockwave');
  erupt.addColor(c, 'colorShockB').name('shockwave hot');
  erupt.addColor(c, 'colorFlash').name('flash');
  const warp = erupt.addFolder('Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpWidth', 0.2, 5, 0.01, 'width (× zone)');
  R(warp, c, 'warpHeight', 0.2, 8, 0.05, 'height (m)');
  R(warp, c, 'warpScale', 0.1, 6, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 6, 0.01, 'noise speed');

  folder.close();
  return folder;
}
