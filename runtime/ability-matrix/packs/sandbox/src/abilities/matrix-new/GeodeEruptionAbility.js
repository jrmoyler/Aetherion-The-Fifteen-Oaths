import { InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createGeodeCrystalMaterial,
  createGeodeGlowMaterial,
  createGeodeShellMaterial
} from '../../materials/matrix-new/GeodeEruptionMaterials.js';
import { createGeodeCrystalGeometry, createGeodePlates } from '../../assets/matrix-new/GeodeEruptionGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'geode';

const TAU = Math.PI * 2;

/** Six lower wall plates, six upper, six cap wedges. */
const PLATES = 18;
/** Hard ceiling on crystals. The editor's count slider clamps to this. */
const MAX_CRYSTALS = 168;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _floor = new Vector3();
const _heart = new Vector3();
const _at = new Vector3();
const _up = new Vector3(0, 1, 0);
const _yawQ = new Quaternion();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _node = new Object3D();
const _restVec = new Vector3();

/**
 * GEODE ERUPTION — a stone geode grows out of the floor, cracks open on a
 * glowing amethyst heart, and then slowly shatters outward.
 *
 * A seed crystal skips across the floor to the circle. Where it lands:
 *
 *   1. **the stone shell** heaves up out of the floor — a hexagonal geode, six
 *      bowed walls, a shoulder, a domed cap, built as eighteen real slabs of
 *      faceted, roughened stone (`GeodeEruptionGeometry`). Rough grey-violet
 *      rock outside, banded agate glittering with drusy inside, fresh broken
 *      stone along every edge. It rumbles, and dust rolls off it.
 *   2. **the cracks** — the seams between the plates begin to glow, a crazing
 *      of fine cracks creeps out from them, and in a series of audible ticks
 *      the plates part and peel: the walls lean out, the cap wedges open like
 *      petals. Light pours out of every gap.
 *   3. **the amethyst** — inside, crystals grow inward from every plate and a
 *      cluster stands up in the floor at the heart: instanced prisms with a
 *      pyramidal point, shaded to read as translucent (the world refracted
 *      through them), with a light living inside that is brightest at the tip.
 *      A camera-facing glow at the heart fills the hollow — hidden by the
 *      shell until the seams part, then spilling out of the gaps.
 *   4. **the shatter** — the shell bursts. Every plate is thrown outward and
 *      up and tumbles under gravity, in **slow motion** at first (`shatterSlow`)
 *      and ramping back to full speed, bouncing and skidding as it lands. The
 *      crystals light a web of fracture lines and break in a wave from the
 *      heart outward, each into glinting shards. Streaks of light, stone chips,
 *      a rolling ring of dust, a frost burst, a shock ring and a rime of
 *      crystal left on the floor; a flash, a heavy shake, a light punch.
 *   5. **the bodies** — `handlesOwnHits`. Anything standing where the geode
 *      grows is *encased*: crystallised (`Dummy#corrode`) while the shell
 *      stands, then thrown outward along the radial when it bursts
 *      (`Dummy#kill`). A body already down is flung outward too.
 *
 * Then it settles: the fallen plates lose their last ember of seam light, sink
 * a little into the floor, and dissolve along a violet edge.
 *
 * ## The editor rule
 *
 * A crystal record stores only dice. Each plate stores dice for its throw and —
 * after the burst only — its flight state (a position, a velocity, a turn),
 * because a tumbling body is the one thing here that cannot be recomputed from
 * the clock. Everything before the burst is resolved from `settings.geode`
 * every frame; dragging `peelCap` while the geode is open re-opens its petals.
 * The few "(rebuild)" sliders reshape the plates themselves and rebuild them
 * on the frame they move.
 */
export class GeodeEruptionAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The geode decides who is encased and when they are thrown. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let plates = 0;
    for (const p of this.plates) if (p.mesh.visible) plates++;
    return this.crystals.count + plates;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the stone shell ---- */
    this.shellMaterial = createGeodeShellMaterial();
    this.plates = [];
    for (let i = 0; i < PLATES; i++) {
      const mesh = new Mesh(undefined, this.shellMaterial);
      mesh.name = `GeodePlate${i}`;
      // Solid, plain-vertex stone: in the depth prepass (so dust and glow
      // feather against it), casting shadows, and hidden by the floor while
      // it is still under it.
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.plates.push({
        mesh,
        data: null,
        // dice for the throw
        speedDice: 0,
        spinDice: 0,
        axisDice: new Vector3(),
        // flight state, written at the burst
        pos: new Vector3(),
        quat: new Quaternion(),
        vel: new Vector3(),
        axis: new Vector3(),
        spin: 0,
        landed: false
      });
    }
    this._shapeKey = '';
    this._profile = null;
    this._buildShell();

    /* ---- layer 2: the amethyst ---- */
    this.crystalGeometry = createGeodeCrystalGeometry();
    const seeds = new InstancedBufferAttribute(new Float32Array(MAX_CRYSTALS), 1);
    for (let i = 0; i < MAX_CRYSTALS; i++) seeds.array[i] = Math.random() * 10;
    this.crystalGeometry.setAttribute('aSeed', seeds);
    this.crystalMaterial = createGeodeCrystalMaterial();
    this.crystals = new InstancedMesh(this.crystalGeometry, this.crystalMaterial, MAX_CRYSTALS);
    this.crystals.name = 'GeodeCrystals';
    this.crystals.layers.set(LAYER.WORLD);
    this.crystals.castShadow = true;
    this.crystals.frustumCulled = false;
    this.crystals.count = 0;
    this.crystals.renderOrder = 3;
    this.group.add(this.crystals);

    this.crystalRecords = [];
    for (let i = 0; i < MAX_CRYSTALS; i++) {
      this.crystalRecords.push({
        side: 0,
        u: 0,
        v: 0,
        cap: false,
        rho: 0,
        plate: 0,
        size: 0,
        splayA: 0,
        splayB: 0,
        stagger: 0,
        breakDice: 0,
        yaw: 0,
        broken: false,
        // where it stood last frame, for its shards
        at: new Vector3(),
        dir: new Vector3(),
        length: 0
      });
    }

    /* ---- the inner light ---- */
    this.glowGeometry = new PlaneGeometry(1, 1);
    this.glowMaterial = createGeodeGlowMaterial();
    this.glow = new Mesh(this.glowGeometry, this.glowMaterial);
    this.glow.name = 'GeodeGlow';
    this.glow.layers.set(LAYER.VFX);
    this.glow.renderOrder = 10;
    this.glow.frustumCulled = false;
    this.glow.visible = false;
    this.group.add(this.glow);

    /** Per-cast state. Clocks, a seed and a yaw. */
    this._seed = 0;
    this._yaw = 0;
    this._clock = 0;
    this._dry = 0;
    this._burst = false;
    this._flight = 0; // seconds of (real) time since the burst
    this._ticks = 0; // crack ticks fired
    this._flare = 0;
    this._scale = 1;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._fling = { cx: 0, cz: 0, out: 0, up: 0 };
    this._field = (x, y, z, out) => {
      const f = this._fling;
      const dx = x - f.cx;
      const dz = z - f.cz;
      const l = Math.max(1e-3, Math.hypot(dx, dz));
      out.set((dx / l) * f.out, f.up, (dz / l) * f.out);
    };

    this._shellState = { crack: 0, open: 0, ember: 0, dissolve: 0, height: 2.8, seed: 0 };
    this._crystalState = { fracture: 0, lit: 0 };
    this._glowState = { size: 1, intensity: 0, seed: 0 };
  }

  /** Shell size in metres from the live settings. */
  _shellSize() {
    const c = settings.geode;
    const R = Math.max(0.3, c.zoneRadius);
    return { radius: Math.max(0.2, R * c.shellRadius), height: Math.max(0.2, R * c.shellHeight) };
  }

  /** Build (or rebuild) the eighteen plates from the shape settings. */
  _buildShell() {
    const c = settings.geode;
    const { radius, height } = this._shellSize();
    const { plates, profile } = createGeodePlates({
      radius,
      height,
      bulge: c.shellBulge,
      shoulder: c.shellShoulder,
      thickness: Math.max(0.02, c.shellThickness),
      facets: c.shellFacets,
      roughness: c.shellRoughness,
      twist: 0
    });
    for (let i = 0; i < PLATES; i++) {
      const p = this.plates[i];
      p.mesh.geometry?.dispose();
      p.mesh.geometry = plates[i].geometry;
      p.data = plates[i];
    }
    this._profile = profile;
    this._radius = radius;
    this._height = height;
  }

  /** Rebuild only when a shape slider actually moved. */
  _syncGeometry() {
    const c = settings.geode;
    const key = `${c.zoneRadius}|${c.shellRadius}|${c.shellHeight}|${c.shellBulge}|${c.shellShoulder}|${c.shellThickness}|${c.shellFacets}|${c.shellRoughness}`;
    if (key === this._shapeKey) return;
    const first = this._shapeKey === '';
    this._shapeKey = key;
    if (first) return; // built in the constructor from the same values
    this._buildShell();
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Glinting shards of amethyst. Lit chips, falling.
    this.shards = particles.get('geode.shards', {
      capacity: 1400,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.shards.uniforms.uDrag.value = 0.5;
    this.shards.uniforms.uEndSize.value = 0.6;
    this.shards.uniforms.uSizeIn.value = 0.02;
    this.shards.uniforms.uFadeIn.value = 0.02;
    this.shards.uniforms.uFadeOut.value = 0.35;
    this.shards.uniforms.uTurbulence.value = 0;

    // Streaks of light: the seed's glints and the burst's.
    this.glints = particles.get('geode.glints', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.25
    });
    this.glints.uniforms.uDrag.value = 2.4;
    this.glints.uniforms.uEndSize.value = 0.2;
    this.glints.uniforms.uSizeIn.value = 0.03;
    this.glints.uniforms.uFadeIn.value = 0.02;
    this.glints.uniforms.uFadeOut.value = 0.5;
    this.glints.uniforms.uStretch.value = 0.09;
    this.glints.uniforms.uGravity.value.set(0, -3, 0);

    // Stone chips.
    this.chips = particles.get('geode.chips', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.chips.uniforms.uDrag.value = 0.6;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.3;
    this.chips.uniforms.uGravity.value.set(0, -11, 0);
    this.chips.uniforms.uTurbulence.value = 0;

    // Rolling stone dust.
    this.dust = particles.get('geode.dust', {
      capacity: 800,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.dust.uniforms.uDrag.value = 1.8;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.12;
    this.dust.uniforms.uFadeOut.value = 0.4;
    this.dust.uniforms.uGravity.value.set(0, -0.3, 0);

    // Violet motes rising out of the seams.
    this.motes = particles.get('geode.motes', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 0.8;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.12;
    this.motes.uniforms.uFadeOut.value = 0.45;

    this.trailEmitter = new RateEmitter();
    this.dustEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.3, settings.geode.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.geode.fadeTime * settings.global.lifetime);
  }

  /** The light glints like a gem turning. */
  lightShimmer() {
    return 0.85 + 0.15 * Math.sin(this.age * 11.3) * Math.sin(this.age * 4.1) + this._flare * 0.8;
  }

  _beat(delay, length) {
    const g = settings.global;
    return saturate((this._clock - delay * g.lifetime) / Math.max(0.02, length * g.lifetime));
  }

  _grow() {
    const c = settings.geode;
    const k = this._beat(0, c.growTime);
    // Heaves up past its height and settles.
    const up = Easing.outCubic(saturate(k / 0.75)) * (1 + c.growOvershoot);
    return lerp(up, 1, Easing.inOutQuad(saturate((k - 0.75) / 0.25)));
  }

  _crack() {
    const c = settings.geode;
    return Easing.inOutQuad(this._beat(c.crackDelay, c.crackTime));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry                                                            */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.3, settings.geode.zoneRadius);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** Shell-local → world: turn by the cast's yaw, scale and lift, add the base. */
  _toWorld(local, out) {
    return out.copy(local).applyQuaternion(_yawQ).add(_floor);
  }

  /**
   * The pose of a whole (not yet burst) plate, shell-local, into `pos`/`quat`.
   *
   * Scaled about the base by the grow, lowered into the floor while it rises,
   * then parted along its outward direction and peeled about its hinge.
   */
  _platePose(plate, grow, crack, pos, quat) {
    const c = settings.geode;
    const d = plate.data;
    const s = this._scale;
    const sink = -this._height * (1 - Math.min(1, grow)) * 1.05;

    const peel = (d.tier === 0 ? c.peelLower : d.tier === 1 ? c.peelUpper : c.peelCap) * crack;
    quat.setFromAxisAngle(d.axis, peel);
    // Rotate the centroid about the hinge.
    pos.copy(d.centroid).sub(d.hinge).multiplyScalar(s).applyQuaternion(quat);
    pos.addScaledVector(d.hinge, s);
    // Parted along its outward direction (the cap lifts a little too).
    pos.addScaledVector(d.outward, c.crackGap * crack * (d.tier === 2 ? 0.6 : 1));
    if (d.tier === 2) pos.y += c.crackGap * crack * 0.8;
    pos.y += sink;
    return pos;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.trailEmitter.reset();
    this.dustEmitter.reset();
    this.moteEmitter.reset();
    this._seed = Math.random() * 100;
    this._yaw = Math.random() * TAU;
    this._clock = 0;
    this._dry = 0;
    this._burst = false;
    this._flight = 0;
    this._ticks = 0;
    this._flare = 0;
    this._scale = 1;

    for (const p of this.plates) {
      p.speedDice = randRange(-1, 1);
      p.spinDice = randRange(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1);
      p.axisDice.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
      p.landed = false;
      p.mesh.visible = false;
    }

    const heart = MAX_CRYSTALS;
    for (let i = 0; i < heart; i++) {
      const cr = this.crystalRecords[i];
      cr.side = (Math.random() * 6) | 0;
      cr.u = randRange(0.1, 0.9);
      cr.cap = Math.random() < 0.3;
      cr.v = randRange(0.08, 0.82);
      cr.rho = randRange(0.2, 0.92);
      cr.size = randRange(-1, 1);
      cr.splayA = randRange(-1, 1);
      cr.splayB = randRange(-1, 1);
      cr.stagger = Math.random();
      cr.breakDice = Math.random();
      cr.yaw = Math.random() * TAU;
      cr.broken = false;
      cr.length = 0;
      // Which plate it grows from.
      const tier = cr.cap ? 2 : cr.v < 0.42 ? 0 : 1;
      cr.plate = tier * 6 + cr.side;
    }
    this._sync(0);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings.geode;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    this._syncGeometry();
    this._floorPoint(_floor);
    _yawQ.setFromAxisAngle(_up, this._yaw + c.shellTwist);

    const grow = travelling ? 0 : this._grow();
    const crack = travelling ? 0 : this._crack();
    this._scale = lerp(0.55, 1, Easing.outCubic(saturate(grow)));

    /* ---- the plates ---- */
    const dissolve = Easing.inQuad(saturate((this._dry - 0.3) / 0.7));
    const settle = c.plateSink * Easing.inCubic(this._dry);
    for (const p of this.plates) {
      if (travelling) {
        p.mesh.visible = false;
        continue;
      }
      if (!this._burst) this._platePose(p, grow, crack, _pos, _q);
      else {
        _pos.copy(p.pos);
        _q.copy(p.quat);
        _pos.y -= settle;
      }
      this._toWorld(_pos, p.mesh.position);
      p.mesh.quaternion.copy(_yawQ).multiply(_q);
      p.mesh.scale.setScalar(this._scale);
      p.mesh.visible = grow > 0.001 && dissolve < 0.999;
    }

    const shellState = this._shellState;
    shellState.crack = this._burst ? 0 : crack;
    shellState.open = this._burst ? Math.max(0, 1 - this._flight * 2) : crack;
    shellState.ember = this._burst ? c.plateEmber * Math.max(0, 1 - this._flight / 1.5) * (1 - this._dry) : 0;
    shellState.dissolve = dissolve;
    shellState.height = this._height;
    shellState.seed = this._seed;
    this.shellMaterial.userData.sync(shellState);

    /* ---- the heart ---- */
    _heart.set(0, this._height * 0.42 * this._scale - this._height * (1 - Math.min(1, grow)), 0);
    this._toWorld(_heart, _heart);

    /* ---- the crystals ---- */
    this._updateCrystals(travelling, grow);
    const fracture = saturate((this._clock - (c.burstDelay * g.lifetime - 0.3)) / 0.3);
    this._crystalState.fracture = this._burst ? 1 : fracture;
    this._crystalState.lit = travelling ? 1 : 0.25 + 0.75 * crack;
    this.crystalMaterial.userData.sync(this._crystalState);

    /* ---- the inner light ---- */
    const glowState = this._glowState;
    glowState.size = this._radius * c.innerLightSize * this._scale * (1 + this._flare * 0.6);
    glowState.intensity = travelling ? 0 : (this._burst ? Math.max(0, 1 - this._flight * 1.6) * 1.5 : 0.2 + crack) * (1 + this._flare);
    glowState.seed = this._seed;
    this.glowMaterial.userData.sync(glowState);
    this.glow.visible = glowState.intensity > 0.004 && grow > 0.05;
    this.glow.position.copy(_heart);

    /* ---- particles ---- */
    const size = g.particleSize;
    this.shards.setGradient(getColor(c.colorShardA), getColor(c.colorShardB), getColor(c.colorShardC), getColor(c.colorShardD));
    this.shards.uniforms.uGravity.value.set(0, c.shardGravity, 0);
    this.shards.uniforms.uSizeScale.value = size;
    this.shards.uniforms.uLifeScale.value = g.particleLifetime;
    this.shards.uniforms.uSpeedScale.value = g.particleSpeed;
    this.shards.uniforms.uOpacity.value = g.opacity;

    if (travelling) this.glints.setGradient(getColor(c.colorB), getColor(c.colorA), getColor(c.colorShardC), getColor(c.colorShardD));
    else this.glints.setGradient(getColor(c.colorShardA), getColor(c.colorShardB), getColor(c.colorShardC), getColor(c.colorShardD));
    this.glints.uniforms.uSizeScale.value = size;
    this.glints.uniforms.uLifeScale.value = g.particleLifetime;
    this.glints.uniforms.uSpeedScale.value = g.particleSpeed;
    this.glints.uniforms.uOpacity.value = g.opacity;
    this.glints.uniforms.uGlow.value = g.glow;

    this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
    this.chips.uniforms.uSizeScale.value = size;
    this.chips.uniforms.uLifeScale.value = g.particleLifetime;
    this.chips.uniforms.uSpeedScale.value = g.particleSpeed;
    this.chips.uniforms.uOpacity.value = g.opacity;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    this.dust.uniforms.uSizeScale.value = size;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uTurbulence.value = 0.5 * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = size;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = g.glow;
    this.motes.uniforms.uTurbulence.value = 0.3 * g.turbulence;
  }

  /** Place every crystal from its dice, riding the plate it grows from. */
  _updateCrystals(travelling, grow) {
    const c = settings.geode;
    const g = settings.global;
    const mesh = this.crystals;

    if (travelling) {
      // The seed: one crystal skipping across the floor, turning.
      _node.position.copy(this.position);
      _node.quaternion.setFromAxisAngle(_up, this.age * 7).multiply(_q2.setFromAxisAngle(_v.set(1, 0, 0), 0.5));
      _node.scale.set(0.09, 0.4, 0.09);
      _node.updateMatrix();
      mesh.setMatrixAt(0, _node.matrix);
      mesh.count = 1;
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    const count = Math.min(MAX_CRYSTALS, Math.max(0, Math.round(c.crystalCount)));
    const heart = Math.min(count, Math.max(0, Math.round(c.crystalHeart)));
    const s = this._scale;
    const profile = this._profile;
    const burstAt = c.burstDelay * g.lifetime;
    let used = 0;

    for (let i = 0; i < MAX_CRYSTALS; i++) {
      const cr = this.crystalRecords[i];
      let k = 0;
      if (i < count && !cr.broken) {
        const t = this._clock - (c.crystalDelay + cr.stagger * c.crystalStagger) * g.lifetime;
        k = Easing.outCubic(saturate(t / Math.max(0.02, c.crystalGrow * g.lifetime)));
      }
      if (k <= 0.001) {
        _node.position.set(0, -999, 0);
        _node.quaternion.identity();
        _node.scale.setScalar(0.0001);
        _node.updateMatrix();
        mesh.setMatrixAt(i, _node.matrix);
        if (i < count) used = i + 1;
        cr.length = 0;
        continue;
      }

      const sizeK = 1 + cr.size * c.crystalJitter * g.randomness;
      let length;
      if (i < heart) {
        // The heart cluster: standing in the floor in the middle, fanning out.
        const ring = (i / Math.max(1, heart)) * TAU + cr.yaw * 0.3;
        const r = i === 0 ? 0 : this._radius * 0.22 * (0.4 + 0.6 * cr.stagger) * s;
        _pos.set(Math.cos(ring) * r, -this._height * (1 - Math.min(1, grow)), Math.sin(ring) * r);
        const tilt = i === 0 ? 0.05 : 0.25 + 0.5 * cr.stagger;
        _dir.set(Math.cos(ring) * Math.sin(tilt), Math.cos(tilt), Math.sin(ring) * Math.sin(tilt));
        length = c.crystalHeartLength * (i === 0 ? 1 : lerp(0.45, 0.85, 1 - cr.stagger)) * sizeK * s;
      } else {
        // Lining crystal: a rest point on the inner face of its plate, carried
        // through that plate's current pose.
        const p = this.plates[cr.plate];
        if (cr.cap) profile.point(cr.side, cr.u, 0.9, cr.rho, Math.max(0.02, c.shellThickness), _restVec);
        else profile.point(cr.side, cr.u, cr.v, undefined, Math.max(0.02, c.shellThickness), _restVec);
        // Pointing in toward the hollow, splayed.
        _v.set(-_restVec.x, this._height * 0.42 - _restVec.y, -_restVec.z).normalize();
        _w.set(cr.splayA, cr.splayB, -cr.splayA).multiplyScalar(c.crystalSplay * g.randomness);
        _v.add(_w).normalize();
        // Into the plate's frame…
        _restVec.sub(p.data.centroid).multiplyScalar(s);
        if (!this._burst) this._platePose(p, grow, this._crack(), _w, _q);
        else {
          _w.copy(p.pos);
          _q.copy(p.quat);
        }
        _pos.copy(_restVec).applyQuaternion(_q).add(_w);
        _dir.copy(_v).applyQuaternion(_q);
        length = c.crystalLength * sizeK * s;
      }

      length *= k;
      const radius = Math.max(0.01, c.crystalRadius * sizeK * s * lerp(0.4, 1, k) * (i < heart ? 1.5 : 1));
      // To world.
      this._toWorld(_pos, cr.at);
      cr.dir.copy(_dir).applyQuaternion(_yawQ);
      cr.length = length;

      _node.position.copy(cr.at);
      _node.quaternion.setFromUnitVectors(_up, cr.dir).multiply(_q2.setFromAxisAngle(_up, cr.yaw));
      _node.scale.set(radius, Math.max(0.01, length), radius);
      _node.updateMatrix();
      mesh.setMatrixAt(i, _node.matrix);
      used = i + 1;

      // The burst: crystals break in a wave from the heart outward.
      if (this._burst && !cr.broken) {
        const wave = i < heart ? 0 : 0.25 + 0.75 * cr.breakDice;
        if (this._clock >= burstAt + wave * c.crystalShatter * g.lifetime) {
          cr.broken = true;
          this._shardFx(cr);
        }
      }
    }
    mesh.count = used;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* The shatter                                                         */
  /* ------------------------------------------------------------------ */

  /** Hand every plate its throw, from the pose it was in. */
  _burstPlates() {
    const c = settings.geode;
    const g = settings.global;
    const power = g.explosionIntensity;
    const grow = this._grow();
    const crack = this._crack();
    for (const p of this.plates) {
      const d = p.data;
      this._platePose(p, grow, crack, p.pos, p.quat);
      const speed = c.burstSpeed * power * (1 + p.speedDice * c.burstSpeedJitter * g.randomness);
      const lift = c.burstLift * power * (d.tier === 2 ? 1.35 : d.tier === 1 ? 1 : 0.55);
      p.vel.copy(d.outward).multiplyScalar(speed);
      p.vel.y += lift;
      // Tumbling outward about its own tangent, with a wobble.
      p.axis.copy(d.axis).addScaledVector(p.axisDice, 0.6 * g.randomness).normalize();
      p.spin = c.plateSpin * p.spinDice;
      p.landed = false;
    }
  }

  /**
   * Fly every plate. Time runs slow at first and ramps back to full speed:
   * the shatter is seen in slow motion.
   */
  _flyPlates(dt) {
    const c = settings.geode;
    const g = settings.global;
    const ramp = Math.max(0.02, c.shatterRamp * g.lifetime);
    const pace = lerp(saturate(c.shatterSlow), 1, Easing.inOutQuad(saturate(this._flight / ramp)));
    const step = dt * pace;
    const ground = 0.12 * this._scale;

    for (const p of this.plates) {
      if (!p.landed) p.vel.y -= c.plateGravity * step;
      p.pos.addScaledVector(p.vel, step);
      if (p.pos.y < ground && p.vel.y < 0) {
        p.pos.y = ground;
        p.vel.y = -p.vel.y * 0.25;
        p.vel.x *= c.plateSlide;
        p.vel.z *= c.plateSlide;
        p.spin *= 0.35;
        if (p.vel.y < 0.8) {
          p.vel.y = 0;
          p.landed = true;
          this._landFx(p);
        }
      }
      if (p.landed) {
        // Skidding to a stop.
        const friction = Math.exp(-4 * step);
        p.vel.x *= friction;
        p.vel.z *= friction;
        p.spin *= friction;
      }
      _q2.setFromAxisAngle(p.axis, p.spin * step);
      p.quat.premultiply(_q2);
    }
  }

  /** Encase what stands inside; throw everything at the burst. */
  _encase(dt) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.geode;
    const crack = this._crack();
    const grow = this._grow();
    const found = field.findTargets(_floor.x, _floor.z, this._radius * this._scale * c.encaseReach, this._found);
    for (const dummy of found) {
      dummy.corrode(saturate(Math.max(grow * 0.4, crack)) * c.encaseStain, c.look);
    }
  }

  _throwBodies() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.geode;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._force.impulse = c.killImpulse * power;
    this._force.lift = c.killLift * power;
    this._force.spin = c.killSpin;
    this._fling.cx = _floor.x;
    this._fling.cz = _floor.z;
    this._fling.out = c.killImpulse * power;
    this._fling.up = c.killLift * power;

    const found = field.findBodies(_floor.x, _floor.z, this._radius * c.encaseReach * 1.15, this._found);
    for (const dummy of found) {
      if (dummy.alive) {
        dummy.corrode(c.encaseStain, c.look);
        _dir.set(dummy.position.x - _floor.x, 0, dummy.position.z - _floor.z);
        if (_dir.lengthSq() < 1e-6) {
          const a = Math.random() * TAU;
          _dir.set(Math.cos(a), 0, Math.sin(a));
        } else _dir.normalize();
        dummy.kill(_dir.x, _dir.z, this._force);
      } else if (dummy.bodyPoint(_at)) {
        // Already down: one full-grab carry onto the outward throw, then let go.
        dummy.carry(this._field, 1, 1, 0);
        dummy.release();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.sizeVariance = 0.5;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** The seed skipping to the circle: glints shed behind it. */
  _travelFx(dt) {
    const c = settings.geode;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.seedTrailRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = this.position;
    _emit.radius = 0.12;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(-1).setY(0.4).normalize();
    _emit.speed = 2.0;
    _emit.spread = 0.6;
    _emit.size = c.seedSize;
    _emit.life = 0.45;
    this.glints.emit(n, _emit);
    _emit.size = c.moteSize;
    _emit.speed = 0.5;
    _emit.life = c.moteLifetime * 0.5;
    this.motes.emit(Math.max(1, Math.round(n * 0.3)), _emit);
  }

  /** The seed lands: a ring of dust and a knock. */
  _arriveFx() {
    const c = settings.geode;
    const g = settings.global;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: this._radius * 1.4,
      life: 1.4,
      intensity: 0.6,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      height: 0.016
    });
    this.ctx.shake.add(c.crackShake * g.explosionIntensity, 5, 14);
    this.lightBoost = c.crackLight;
  }

  /** One crack: a tick of shake, chips off the seams, a light punch. */
  _crackFx(index) {
    const c = settings.geode;
    const g = settings.global;
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.crackShake * power, 6, 24);
    this.lightBoost = Math.max(this.lightBoost, c.crackLight * power);
    this._flare = Math.min(1, this._flare + 0.3);
    if (index === 0) {
      this.ctx.decals.spawn(DecalType.CRACK, _floor, {
        radius: this._radius * 1.5,
        life: this.impactDuration + this.fadeDuration,
        intensity: 0.8,
        colorA: getColor(c.colorSeam),
        colorB: getColor(c.colorStoneDark)
      });
    }
    // Chips burst off a few random seams.
    const time = frame.uTime.value;
    for (let k = 0; k < 3; k++) {
      const p = this.plates[(Math.random() * PLATES) | 0];
      this._resetEmit(time);
      _emit.position = p.mesh.position;
      _emit.radius = this._radius * 0.25;
      _emit.direction = _dir.copy(p.data.outward).applyQuaternion(_yawQ).setY(0.8).normalize();
      _emit.speed = c.chipSpeed * 0.5;
      _emit.spread = 0.6;
      _emit.size = c.chipSize * 0.7;
      _emit.life = c.chipLifetime * 0.7;
      _emit.spin = 9;
      this.chips.emit(Math.max(1, Math.round((c.chipCount / 12) * g.particleCount)), _emit);
    }
  }

  /** The burst: flash, shake, shell of frost, ring, rime, glints, chips, dust. */
  _burstFx() {
    const c = settings.geode;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;

    this.ctx.flash.trigger(getColor(c.colorFlash), c.burstFlash * power);
    this.ctx.shake.add(c.burstShake * power, 2.6, 22);
    this.lightBoost = c.burstLight * power;
    this._flare = 1.5;

    this.ctx.bursts.spawn(BurstMode.FROST, _heart, {
      radius: this._radius * 0.4,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1,
      opacity: 0.85,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC),
      squash: 0.7
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: this._radius * c.ringRadius,
      life: c.ringLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorSeam),
      colorB: getColor(c.colorCrystalBody)
    });
    this.ctx.decals.spawn(DecalType.FROST, _floor, {
      radius: this._radius * c.rimeRadius,
      life: c.rimeLife,
      intensity: 0.8,
      growth: 0.6,
      colorA: getColor(c.colorCrystalTip),
      colorB: getColor(c.colorCrystalBody)
    });

    // Streaks of light from the heart.
    const glints = Math.round(c.glintCount * g.particleCount);
    for (let n = 0; n < glints; n += 8) {
      this._resetEmit(time);
      _emit.position = _heart;
      _emit.radius = this._radius * 0.3;
      const a = Math.random() * TAU;
      _emit.direction = _dir.set(Math.cos(a), randRange(0.1, 0.9), Math.sin(a)).normalize();
      _emit.speed = c.glintSpeed * power;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.35;
      _emit.size = c.glintSize;
      _emit.life = c.glintLifetime;
      this.glints.emit(Math.min(8, glints - n), _emit);
    }

    // Stone chips off every plate.
    const per = Math.max(1, Math.round((c.chipCount / PLATES) * g.particleCount));
    for (const p of this.plates) {
      this._resetEmit(time);
      _emit.position = p.mesh.position;
      _emit.radius = this._radius * 0.2;
      _emit.direction = _dir.copy(p.data.outward).applyQuaternion(_yawQ).setY(0.7).normalize();
      _emit.speed = c.chipSpeed * power;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.5;
      _emit.size = c.chipSize;
      _emit.life = c.chipLifetime;
      _emit.spin = 10;
      this.chips.emit(per, _emit);
    }

    // A ring of dust rolling out.
    const dust = Math.round(c.dustCount * g.particleCount);
    for (let n = 0; n < dust; n += 6) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      _pos.set(_floor.x + Math.cos(a) * this._radius * 0.8, 0.25, _floor.z + Math.sin(a) * this._radius * 0.8);
      _emit.position = _pos;
      _emit.radius = 0.5;
      _emit.direction = _dir.set(Math.cos(a), 0.2, Math.sin(a)).normalize();
      _emit.speed = c.dustSpeed * power;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.3;
      _emit.size = c.dustSize;
      _emit.life = c.dustLifetime;
      _emit.spin = 0.4;
      this.dust.emit(Math.min(6, dust - n), _emit);
    }
  }

  /** One crystal breaking into glinting shards. */
  _shardFx(cr) {
    const c = settings.geode;
    const g = settings.global;
    if (cr.length <= 0.01) return;
    this._resetEmit(frame.uTime.value);
    _pos.copy(cr.at).addScaledVector(cr.dir, cr.length * 0.5);
    _emit.position = _pos;
    _emit.radius = cr.length * 0.4;
    _emit.direction = _dir.set(_pos.x - _floor.x, 0, _pos.z - _floor.z).normalize().setY(0.9).normalize();
    _emit.speed = c.shardSpeed * g.explosionIntensity;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.6;
    _emit.size = c.shardSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.shardLifetime;
    _emit.spin = 12;
    this.shards.emit(Math.max(1, Math.round(c.shardCount * g.particleCount)), _emit);
    _emit.size = c.glintSize * 0.7;
    _emit.spin = 0;
    _emit.life = c.glintLifetime * 0.7;
    this.glints.emit(1, _emit);
  }

  /** A plate landing: a puff of dust and a few chips. */
  _landFx(p) {
    const c = settings.geode;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    this._toWorld(p.pos, _pos);
    _pos.y = 0.1;
    _emit.position = _pos;
    _emit.radius = this._radius * 0.2;
    _emit.direction = _up;
    _emit.speed = 1.2;
    _emit.spread = 0.9;
    _emit.size = c.dustSize * 0.6;
    _emit.life = c.dustLifetime * 0.6;
    _emit.spin = 0.4;
    this.dust.emit(Math.max(1, Math.round(4 * g.particleCount)), _emit);
    _emit.size = c.chipSize * 0.6;
    _emit.speed = 2.5;
    _emit.spin = 9;
    _emit.life = c.chipLifetime * 0.5;
    this.chips.emit(Math.max(1, Math.round(4 * g.particleCount)), _emit);
    this.ctx.shake.add(c.crackShake * 0.4 * g.explosionIntensity, 8, 26);
  }

  /** Everything the geode keeps doing while it stands. */
  _holdFx(dt) {
    const c = settings.geode;
    const g = settings.global;
    const time = frame.uTime.value;
    const growing = !this._burst && this._beat(0, c.growTime) < 1;
    const crack = this._burst ? 0 : this._crack();

    /* dust rolling off the shell as it heaves up */
    const dust = this.dustEmitter.tick(dt, growing ? c.dustRate * g.particleCount : 0);
    if (dust > 0) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      _pos.set(_floor.x + Math.cos(a) * this._radius * 0.95, 0.15, _floor.z + Math.sin(a) * this._radius * 0.95);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _dir.set(Math.cos(a), 0.4, Math.sin(a)).normalize();
      _emit.speed = 1.0;
      _emit.spread = 0.4;
      _emit.size = c.dustSize * 0.7;
      _emit.life = c.dustLifetime * 0.7;
      _emit.spin = 0.4;
      this.dust.emit(dust, _emit);
    }

    /* motes rising out of the seams as it opens */
    const motes = this.moteEmitter.tick(dt, crack * c.moteRate * g.particleCount);
    for (let n = 0; n < motes; n++) {
      const p = this.plates[(Math.random() * PLATES) | 0];
      this._resetEmit(time);
      _emit.position = p.mesh.position;
      _emit.radius = this._radius * 0.35;
      _emit.direction = _up;
      _emit.speed = 0.6;
      _emit.spread = 0.5;
      _emit.size = c.moteSize;
      _emit.life = c.moteLifetime;
      this.motes.emit(1, _emit);
    }

    if (growing) this.ctx.shake.rumble(c.growShake, dt);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    // The seed skips: three hops on the way.
    const c = settings.geode;
    this.position.y = 0.1 + c.seedHeight * Math.abs(Math.sin(this.u * Math.PI * 3));
    this._sync(dt);
    this._travelFx(dt);
  }

  onImpact() {
    this._clock = 0;
    this._dry = 0;
    this._arriveFx();
  }

  onFade(dt, t) {
    const c = settings.geode;
    const g = settings.global;
    this._clock += dt;
    this._dry = t <= 1 ? 0 : saturate(t - 1);
    this._flare = Math.max(0, this._flare - this._flare * 3 * dt);
    this._floorPoint(_floor);

    if (!this._burst) {
      // Crack ticks, evenly through the opening.
      const ticks = Math.max(0, Math.round(c.crackTicks));
      const open = this._beat(c.crackDelay, c.crackTime);
      // Tick i fires as the opening passes i/ticks — the first on the seams' first glow.
      while (this._ticks < ticks && open > 0 && open >= this._ticks / Math.max(1, ticks)) {
        this._crackFx(this._ticks);
        this._ticks++;
      }
      this._encase(dt);
      if (this._clock >= c.burstDelay * g.lifetime || t >= 1) {
        this._burst = true;
        this._flight = 0;
        _yawQ.setFromAxisAngle(_up, this._yaw + c.shellTwist);
        this._burstPlates();
        this._throwBodies();
        this._burstFx();
      }
    } else {
      this._flight += dt;
      this._flyPlates(dt);
    }

    this._sync(dt);
    this._holdFx(dt);

    // The light sits at the heart, then hangs low over the wreckage.
    this.position.copy(_heart);
    this.position.y = Math.max(0.6, _heart.y);
  }

  onDestroy() {
    for (const p of this.plates) p.mesh.visible = false;
    this.crystals.count = 0;
    this.glow.visible = false;
  }

  dispose() {
    for (const p of this.plates) p.mesh.geometry?.dispose();
    this.crystalGeometry.dispose();
    this.glowGeometry.dispose();
    this.shellMaterial.dispose();
    this.crystalMaterial.dispose();
    this.glowMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⬡  Geode Eruption');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.5, 10, 0.05, 'geode lasts (s)');
  R(cast, c, 'fadeTime', 0.2, 6, 0.05, 'wreckage settles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'zone radius (m, rebuild)');
  Editor.castAnimation(cast, c);
  R(cast, c, 'seedHeight', 0, 3, 0.01, 'seed skip height (m)');
  R(cast, c, 'seedTrailRate', 0, 400, 1, 'seed glints / s');
  R(cast, c, 'seedSize', 0.01, 0.4, 0.005, 'glint size');
  cast.addColor(c, 'colorA').name('seed glints');
  cast.addColor(c, 'colorB').name('seed core');

  const beats = folder.addFolder('Beats');
  R(beats, c, 'growTime', 0.05, 3, 0.01, 'rises over (s)');
  R(beats, c, 'growOvershoot', 0, 0.4, 0.005, 'heave (× height)');
  R(beats, c, 'crackDelay', 0, 5, 0.01, 'seams glow at (s)');
  R(beats, c, 'crackTime', 0.05, 3, 0.01, 'opens over (s)');
  R(beats, c, 'crackTicks', 0, 12, 1, 'crack ticks');
  R(beats, c, 'crackGap', 0, 1, 0.005, 'plates part (m)');
  R(beats, c, 'peelLower', -0.5, 1, 0.01, 'lower plates lean (rad)');
  R(beats, c, 'peelUpper', -0.5, 1.5, 0.01, 'upper plates lean (rad)');
  R(beats, c, 'peelCap', -0.5, 2.5, 0.01, 'cap petals open (rad)');
  R(beats, c, 'burstDelay', 0.2, 9, 0.01, 'bursts at (s)');
  R(beats, c, 'shatterSlow', 0.02, 1, 0.01, 'slow-motion start (×)');
  R(beats, c, 'shatterRamp', 0.05, 3, 0.01, 'back to speed over (s)');

  const shell = folder.addFolder('1 · Stone shell');
  R(shell, c, 'shellRadius', 0.2, 1.5, 0.01, 'radius (× zone, rebuild)');
  R(shell, c, 'shellHeight', 0.2, 1.5, 0.01, 'height (× zone, rebuild)');
  R(shell, c, 'shellBulge', 0.8, 1.5, 0.01, 'bulge (rebuild)');
  R(shell, c, 'shellShoulder', 0.4, 1.2, 0.01, 'shoulder (rebuild)');
  R(shell, c, 'shellThickness', 0.02, 0.8, 0.005, 'thickness (m, rebuild)');
  R(shell, c, 'shellFacets', 1, 8, 1, 'facets (rebuild)');
  R(shell, c, 'shellRoughness', 0, 0.5, 0.005, 'roughness (m, rebuild)');
  R(shell, c, 'shellTwist', -Math.PI, Math.PI, 0.01, 'twist (rad)');
  const stone = shell.addFolder('Stone & agate');
  R(stone, c, 'stoneScale', 0.2, 6, 0.05, 'rock scale');
  R(stone, c, 'stoneBump', 0, 3, 0.01, 'bump');
  R(stone, c, 'stoneSpecular', 0, 2, 0.01, 'sheen');
  R(stone, c, 'stoneLichen', 0, 1, 0.01, 'crust');
  R(stone, c, 'agateBands', 1, 30, 0.1, 'agate bands / m');
  R(stone, c, 'agateWarp', 0, 2, 0.01, 'band warp');
  R(stone, c, 'agateGlow', 0, 4, 0.01, 'lining glow');
  R(stone, c, 'drusy', 0, 10, 0.05, 'drusy sparkle');
  R(stone, c, 'seamWidth', 0.01, 0.6, 0.005, 'seam width (m)');
  R(stone, c, 'seamGlow', 0, 20, 0.05, 'seam glow');
  R(stone, c, 'seamFlicker', 0, 1, 0.01, 'seam flicker');
  R(stone, c, 'plateEmber', 0, 1, 0.01, 'ember on flying plates');
  R(stone, c, 'plateDissolve', 0.01, 0.4, 0.005, 'dissolve edge');
  stone.addColor(c, 'colorStone').name('stone');
  stone.addColor(c, 'colorStoneDark').name('hollows');
  stone.addColor(c, 'colorLichen').name('crust');
  stone.addColor(c, 'colorAgateA').name('agate outer');
  stone.addColor(c, 'colorAgateB').name('agate mid');
  stone.addColor(c, 'colorAgateC').name('agate inner');
  stone.addColor(c, 'colorSeam').name('seam light');
  stone.addColor(c, 'colorSeamHot').name('seam core');

  const amethyst = folder.addFolder('2 · Amethyst');
  R(amethyst, c, 'crystalCount', 0, MAX_CRYSTALS, 1, 'crystals');
  R(amethyst, c, 'crystalHeart', 0, 40, 1, 'in the heart');
  R(amethyst, c, 'crystalDelay', 0, 5, 0.01, 'start growing at (s)');
  R(amethyst, c, 'crystalGrow', 0.05, 3, 0.01, 'grow over (s)');
  R(amethyst, c, 'crystalStagger', 0, 2, 0.01, 'stagger (s)');
  R(amethyst, c, 'crystalLength', 0.05, 2.5, 0.01, 'length (m)');
  R(amethyst, c, 'crystalHeartLength', 0.1, 4, 0.01, 'heart length (m)');
  R(amethyst, c, 'crystalRadius', 0.02, 0.5, 0.005, 'radius (m)');
  R(amethyst, c, 'crystalJitter', 0, 1, 0.01, 'size jitter');
  R(amethyst, c, 'crystalSplay', 0, 1.5, 0.01, 'splay (rad)');
  R(amethyst, c, 'crystalShatter', 0.02, 2, 0.01, 'break wave over (s)');
  const gem = amethyst.addFolder('Look');
  R(gem, c, 'crystalIOR', 1, 2.5, 0.01, 'index of refraction');
  R(gem, c, 'crystalRefract', 0, 3, 0.01, 'see-through');
  R(gem, c, 'crystalInner', 0, 10, 0.05, 'inner light');
  R(gem, c, 'crystalTipGlow', 0, 6, 0.05, 'tip glow');
  R(gem, c, 'crystalRim', 0, 8, 0.05, 'rim');
  R(gem, c, 'crystalSparkle', 0, 12, 0.05, 'sparkle');
  R(gem, c, 'crystalSparkleSharp', 4, 300, 1, 'sparkle sharpness');
  R(gem, c, 'crystalPulse', 0, 1, 0.01, 'pulse');
  R(gem, c, 'crystalFractureGlow', 0, 20, 0.05, 'fracture glow');
  gem.addColor(c, 'colorCrystalDeep').name('root');
  gem.addColor(c, 'colorCrystalBody').name('body');
  gem.addColor(c, 'colorCrystalTip').name('point');
  gem.addColor(c, 'colorCrystalInner').name('inner light');
  gem.addColor(c, 'colorCrystalRim').name('rim');
  R(amethyst, c, 'innerLight', 0, 8, 0.05, 'heart light');
  R(amethyst, c, 'innerLightSize', 0.1, 3, 0.01, 'heart light size (× radius)');
  R(amethyst, c, 'innerLightRays', 0, 3, 0.01, 'heart light rays');
  amethyst.addColor(c, 'colorInnerLight').name('heart light');

  const shatter = folder.addFolder('3 · Shatter');
  R(shatter, c, 'burstSpeed', 0, 25, 0.1, 'plates thrown (m/s)');
  R(shatter, c, 'burstLift', 0, 20, 0.1, 'plates lifted (m/s)');
  R(shatter, c, 'burstSpeedJitter', 0, 1, 0.01, 'throw jitter');
  R(shatter, c, 'plateGravity', 0, 40, 0.1, 'gravity (m/s²)');
  R(shatter, c, 'plateSpin', 0, 15, 0.05, 'tumble (rad/s)');
  R(shatter, c, 'plateSlide', 0, 1, 0.01, 'skid');
  R(shatter, c, 'plateSink', 0, 2, 0.01, 'sinks by (m)');
  R(shatter, c, 'shardCount', 0, 20, 1, 'shards per crystal');
  R(shatter, c, 'shardSpeed', 0, 20, 0.05, 'shard speed');
  R(shatter, c, 'shardSize', 0.01, 0.5, 0.005, 'shard size');
  R(shatter, c, 'shardLifetime', 0.1, 4, 0.05, 'shard life (s)');
  R(shatter, c, 'shardGravity', -30, 0, 0.1, 'shard gravity');
  Editor.gradient(shatter, c, 'colorShard', 'shard colour');
  R(shatter, c, 'glintCount', 0, 400, 1, 'glints');
  R(shatter, c, 'glintSpeed', 0, 30, 0.1, 'glint speed');
  R(shatter, c, 'glintSize', 0.01, 0.4, 0.005, 'glint size');
  R(shatter, c, 'glintLifetime', 0.05, 2, 0.01, 'glint life (s)');
  R(shatter, c, 'chipCount', 0, 300, 1, 'stone chips');
  R(shatter, c, 'chipSpeed', 0, 20, 0.05, 'chip speed');
  R(shatter, c, 'chipSize', 0.02, 0.6, 0.005, 'chip size');
  R(shatter, c, 'chipLifetime', 0.1, 4, 0.05, 'chip life (s)');
  Editor.gradient(shatter, c, 'colorChip', 'chip colour');

  const air = folder.addFolder('4 · Dust, motes & ring');
  R(air, c, 'dustRate', 0, 300, 1, 'dust / s while rising');
  R(air, c, 'dustCount', 0, 400, 1, 'dust at the burst');
  R(air, c, 'dustSpeed', 0, 15, 0.05, 'dust speed');
  R(air, c, 'dustSize', 0.1, 5, 0.01, 'dust size');
  R(air, c, 'dustLifetime', 0.2, 6, 0.05, 'dust life (s)');
  R(air, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(air, c, 'colorDust', 'dust colour');
  R(air, c, 'moteRate', 0, 300, 1, 'motes / s');
  R(air, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(air, c, 'moteLifetime', 0.1, 4, 0.05, 'mote life (s)');
  R(air, c, 'moteRise', -2, 4, 0.01, 'mote rise');
  Editor.gradient(air, c, 'colorMote', 'mote colour');
  R(air, c, 'ringRadius', 0.3, 5, 0.01, 'shock ring (× radius)');
  R(air, c, 'ringLife', 0.1, 3, 0.01, 'ring life (s)');
  R(air, c, 'rimeLife', 0.5, 30, 0.1, 'rime lingers (s)');
  R(air, c, 'rimeRadius', 0.2, 4, 0.01, 'rime (× radius)');

  const bodies = folder.addFolder('5 · Bodies');
  R(bodies, c, 'encaseReach', 0.1, 2, 0.01, 'reach (× shell radius)');
  R(bodies, c, 'encaseStain', 0, 1, 0.01, 'crystallised');
  R(bodies, c, 'killImpulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(bodies, c, 'killLift', 0, 20, 0.1, 'thrown up (m/s)');
  R(bodies, c, 'killSpin', 0, 4, 0.01, 'torque');
  bodies.addColor(c.look, 'color').name('flesh');
  bodies.addColor(c.look, 'rimColor').name('rim');
  R(bodies, c.look, 'rimEmissive', 0, 6, 0.05, 'rim emissive');
  bodies.addColor(c.look, 'edgeColor').name('burn edge');
  R(bodies, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge emissive');
  R(bodies, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  const fx = folder.addFolder('6 · Beats');
  R(fx, c, 'growShake', 0, 2, 0.01, 'rising rumble');
  R(fx, c, 'crackShake', 0, 1, 0.01, 'crack shake');
  R(fx, c, 'burstShake', 0, 2, 0.01, 'burst shake');
  R(fx, c, 'burstFlash', 0, 2, 0.01, 'burst flash');
  fx.addColor(c, 'colorFlash').name('flash');
  R(fx, c, 'burstRadius', 0.2, 10, 0.05, 'frost burst (m)');
  R(fx, c, 'burstLife', 0.1, 2, 0.01, 'frost burst life (s)');
  fx.addColor(c, 'colorBurstA').name('burst A');
  fx.addColor(c, 'colorBurstB').name('burst B');
  fx.addColor(c, 'colorBurstC').name('burst C');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'crackLight', 0, 20, 0.1, 'crack punch');
  R(light, c, 'burstLight', 0, 60, 0.1, 'burst punch');

  folder.close();
  return folder;
}
