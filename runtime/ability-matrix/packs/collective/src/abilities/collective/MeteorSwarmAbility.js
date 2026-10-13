import {
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createMeteorRockMaterial,
  createMeteorSheathMaterial,
  createMeteorGroundMaterial,
  METEOR_SWARM_MAX
} from '../../materials/collective/MeteorSwarmMaterials.js';
import { createAsteroidGeometry } from '../../assets/ProceduralGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'swarm';

/** Hard ceiling on rocks per cast. The ground shader's mark array is this long. */
const MAX_METEORS = METEOR_SWARM_MAX;
/**
 * Distinct rock silhouettes, one InstancedMesh each. Three is the smallest
 * number at which a volley stops reading as one rock copied — the eye spots a
 * repeated silhouette in a pair, but not in a crowd of three shapes tumbling.
 */
const VARIANTS = 3;
const SLOTS = Math.ceil(MAX_METEORS / VARIANTS);
const TAU = Math.PI * 2;
/** The golden angle — the sunflower spiral that spreads the marks evenly. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Sub-batches a rock's trail is split into per frame, so a fast rock leaves no gaps. */
const TRAIL_STEPS = 4;

const _emit = {};
const _pos = new Vector3();
const _land = new Vector3();
const _dir = new Vector3();
const _fall = new Vector3();
const _rockFall = new Vector3();
const _horizontal = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);
const _dummy = new Object3D();

/**
 * METEOR SWARM — Fire, zone cast.
 *
 * A multi-strike, and built to read as one: the difference between "a meteor"
 * and "a swarm" is that the swarm is *announced*. The circle is marked first,
 * one mark per rock, and the marks close in the order the rocks will land, so
 * the player watches the volley coming before a single stone is in the sky.
 *
 * ## Layers
 *
 *   1. **THE TELEGRAPH** (`createMeteorGroundMaterial`) — one floor quad: a
 *      boundary ring drawn round the circle while the call travels, a heat wash
 *      that brightens as the volley peaks, a reticle per rock that tightens
 *      onto its landing point, and the molten bed each rock leaves behind.
 *   2. **THE ROCKS** (`createMeteorRockMaterial`) — procedural asteroids in
 *      three silhouettes, instanced, on the WORLD layer so they cast shadows on
 *      their way down. Cooled crust split by molten seams; the face ramming the
 *      air glows hottest, and the whole rock ignites over its descent.
 *   3. **THE ENTRY FLAME** (`createMeteorSheathMaterial`) — an additive
 *      teardrop around each rock, pulled out up the flight path in the vertex
 *      shader, so the slant is a live slider rather than a baked mesh.
 *   4. **THE TRAILS** — additive fire STREAKs and non-additive SMOKE shed along
 *      each rock's path, sub-stepped so a rock moving fifty metres a second
 *      still leaves an unbroken line.
 *   5. **THE LANDINGS** — per rock: a SCORCH decal, a SHOCKWAVE ring, a small
 *      FIRE shell, CHIP debris, sparks, a puff of smoke, a light punch, a shake
 *      and a flash — and every body inside its blast radius thrown away from
 *      that point (`handlesOwnHits`).
 *   6. **THE COOLING** — embers lifting off the crater beds while they glow.
 *
 * ## The rule that keeps it editable
 *
 * As with the Venom Surge, a rock record holds only dice: its slot in the
 * landing order, an even and a random position in the circle (both as
 * fractions), a size jitter, a tumble axis, a slant jitter. Every metre and
 * second — where it lands, how big it is, when, from how high and at what
 * angle — is resolved from `settings.swarm` every frame. Dragging `fallAngle`
 * re-aims rocks already in the air; dragging `zoneRadius` re-spreads the marks.
 * The only thing a record latches is the *event* of its landing.
 *
 * ## Timeline
 *
 * The call runs out to the circle at `speed` (the base class's travel phase),
 * and the boundary ring draws on while it does. On arrival the clock starts:
 * marks appear over `revealTime`, the first rock lands at `telegraph`, the rest
 * spread over `lifetime`, and the beds cool for `linger` before the whole
 * floor fades over `fadeTime`.
 */
export class MeteorSwarmAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    const environment = this.ctx.environment;

    /* ---- layer 2: the rocks ---- */
    this.rockMaterial = createMeteorRockMaterial(environment);
    this._shapeKey = '';
    this.rocks = [];
    this.heatAttributes = [];
    for (let v = 0; v < VARIANTS; v++) {
      const geometry = this._buildRock(v);
      const seeds = new InstancedBufferAttribute(new Float32Array(SLOTS), 1);
      const heats = new InstancedBufferAttribute(new Float32Array(SLOTS), 1);
      for (let i = 0; i < SLOTS; i++) seeds.array[i] = Math.random() * 10;
      geometry.setAttribute('aSeed', seeds);
      geometry.setAttribute('aHeat', heats);

      const mesh = new InstancedMesh(geometry, this.rockMaterial, SLOTS);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      // Solid: in the depth prepass, so the flame and the smoke fade into it.
      mesh.layers.set(LAYER.WORLD);
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rocks.push(mesh);
      this.heatAttributes.push(heats);
    }

    /* ---- layer 3: the entry flame ---- */
    this.sheathGeometry = new IcosahedronGeometry(1, 3);
    this.sheathFade = new InstancedBufferAttribute(new Float32Array(MAX_METEORS), 1);
    const sheathSeeds = new InstancedBufferAttribute(new Float32Array(MAX_METEORS), 1);
    for (let i = 0; i < MAX_METEORS; i++) sheathSeeds.array[i] = Math.random() * 10;
    this.sheathGeometry.setAttribute('aFade', this.sheathFade);
    this.sheathGeometry.setAttribute('aSeed', sheathSeeds);
    this.sheathMaterial = createMeteorSheathMaterial();
    this.sheath = new InstancedMesh(this.sheathGeometry, this.sheathMaterial, MAX_METEORS);
    this.sheath.frustumCulled = false;
    this.sheath.count = 0;
    this.sheath.layers.set(LAYER.VFX);
    this.sheath.renderOrder = 14;
    this.group.add(this.sheath);

    /* ---- layer 1: the telegraph ---- */
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.groundMaterial = createMeteorGroundMaterial();
    this.ground = new Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.name = 'MeteorTelegraph';
    this.ground.layers.set(LAYER.VFX);
    // Over the scorch decals: the marks and the beds are light, and light sits
    // on top of char.
    this.ground.renderOrder = 6;
    this.ground.frustumCulled = false;
    this.ground.visible = false;
    this.group.add(this.ground);
    this._groundState = { quadSize: 1, radius: 1, reveal: 0, fade: 0, surge: 0, count: 0, seed: 0 };

    /** Dice only — see the class comment. */
    this.records = [];
    for (let i = 0; i < MAX_METEORS; i++) {
      this.records.push({
        order: 0, // 0..1 slot in the landing sequence
        orderRand: 0, // 0..1 the same, rolled — `orderJitter` blends toward it
        evenAngle: 0, // sunflower placement
        evenArea: 0, // 0..1 area fraction (radius²)
        randAngle: 0,
        randArea: 0,
        sizeJitter: 0, // -1..1
        axis: new Vector3(0, 1, 0), // tumble axis
        spin: 0, // tumble phase
        slantX: 0, // -1..1 per-rock slant jitter
        slantZ: 0,
        landed: false,
        live: false, // drawn last frame — gates the trail's first segment
        prev: new Vector3(), // where it was last frame, for the trail
        streak: new RateEmitter(),
        smoke: new RateEmitter()
      });
    }
    this._count = 0;
    this._visible = 0;
    this._seed = 0;
    this._clock = -1;
    this._lastLand = -1;

    /** Reused by `DummyField#findTargets`, so a landing allocates nothing. */
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  /** One rock silhouette; the variant only perturbs the seed. */
  _buildRock(variant) {
    const c = settings.swarm;
    return createAsteroidGeometry({
      seed: 3.3 + variant * 11.9,
      detail: c.rockDetail,
      lumpiness: c.rockLumps,
      noiseScale: 1.4,
      roughness: 0.18,
      cuts: c.rockCuts,
      cutDepth: 0.22,
      craters: c.rockCraters,
      craterDepth: 0.16,
      craterSize: 0.45
    });
  }

  /**
   * Rebuild the rocks when a *shape* slider moves. Facets, lumps and craters
   * are CPU displacement — they change the silhouette and the shadow, which a
   * vertex shader on a shadow caster cannot — so they are baked, and a rock is
   * a few hundred triangles: cheap enough to regenerate outright.
   */
  _syncGeometry() {
    const c = settings.swarm;
    const key = `${Math.round(c.rockDetail)}|${c.rockLumps.toFixed(3)}|${Math.round(c.rockCuts)}|${Math.round(c.rockCraters)}`;
    if (key === this._shapeKey) return;
    this._shapeKey = key;

    for (let v = 0; v < VARIANTS; v++) {
      const mesh = this.rocks[v];
      const previous = mesh.geometry;
      const geometry = this._buildRock(v);
      geometry.setAttribute('aSeed', previous.getAttribute('aSeed'));
      geometry.setAttribute('aHeat', previous.getAttribute('aHeat'));
      mesh.geometry = geometry;
      previous.dispose();
    }
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 4: fire streaks off each rock, and sparks out of each crater ---- */
    this.streaks = particles.get('swarm.streak', {
      capacity: 6000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.25
    });
    this.streaks.uniforms.uDrag.value = 2.2;
    this.streaks.uniforms.uEndSize.value = 0.3;
    this.streaks.uniforms.uSizeIn.value = 0.02;
    this.streaks.uniforms.uFadeIn.value = 0.02;
    this.streaks.uniforms.uFadeOut.value = 0.55;

    /* ---- layer 4: the smoke column each rock drags behind it ---- */
    // Non-additive: smoke has to *occlude* the sky behind the rain, or the
    // trails read as glow and the volley loses its weight.
    this.smoke = particles.get('swarm.smoke', {
      capacity: 4000,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.smoke.uniforms.uDrag.value = 1.6;
    this.smoke.uniforms.uSizeIn.value = 0.1;
    this.smoke.uniforms.uFadeIn.value = 0.1;
    this.smoke.uniforms.uFadeOut.value = 0.4;

    /* ---- layer 5: debris out of each crater ---- */
    this.chips = particles.get('swarm.chips', {
      capacity: 2400,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.chips.uniforms.uDrag.value = 0.4;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uSizeIn.value = 0.03;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.75;

    /* ---- layer 6: embers off the cooling beds ---- */
    this.embers = particles.get('swarm.embers', {
      capacity: 2000,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.embers.uniforms.uDrag.value = 1.0;
    this.embers.uniforms.uEndSize.value = 0.2;
    this.embers.uniforms.uSizeIn.value = 0.05;
    this.embers.uniforms.uFadeIn.value = 0.06;
    this.embers.uniforms.uFadeOut.value = 0.45;

    this.callEmitter = new RateEmitter();
    this.emberEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._visible;
  }

  /** Seconds the volley takes to land, after the first rock. */
  _span() {
    return Math.max(0.05, settings.swarm.lifetime * settings.global.lifetime);
  }

  get impactDuration() {
    const c = settings.swarm;
    return Math.max(0.2, c.telegraph + this._span() + c.linger * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.swarm.fadeTime * settings.global.lifetime);
  }

  /** Fire gutters: the light wavers hard between landings. */
  lightShimmer() {
    return 0.82 + 0.18 * Math.sin(this.age * 23.0) * Math.sin(this.age * 7.3);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.swarm;

    this._count = Math.min(MAX_METEORS, Math.max(1, Math.round(c.meteorCount)));
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._lastLand = -1;
    this._visible = 0;
    this.callEmitter.reset();
    this.emberEmitter.reset();

    const n = this._count;
    const turn = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const r = this.records[i];
      // Placement index and landing order are rolled separately, so the volley
      // does not spiral in from the middle in the order the sunflower lays it.
      const k = (i * 7 + 3) % n;
      r.evenAngle = turn + k * GOLDEN;
      r.evenArea = (k + 0.5) / n;
      r.randAngle = Math.random() * TAU;
      r.randArea = Math.random();
      r.order = n > 1 ? i / (n - 1) : 0;
      r.orderRand = Math.random();
      r.sizeJitter = randRange(-1, 1);
      r.axis.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
      if (r.axis.lengthSq() < 1e-4) r.axis.set(0, 1, 0);
      r.axis.normalize();
      r.spin = Math.random() * TAU;
      r.slantX = randRange(-1, 1);
      r.slantZ = randRange(-1, 1);
      r.landed = false;
      r.live = false;
      r.streak.reset();
      r.smoke.reset();
    }
    for (let i = n; i < MAX_METEORS; i++) this.records[i].landed = true;

    for (let v = 0; v < VARIANTS; v++) this.rocks[v].count = 0;
    this.sheath.count = 0;
    const pips = this.groundMaterial.userData.pips;
    for (let i = 0; i < MAX_METEORS; i++) pips[i].set(0, 0, -1, 0);

    /* the call leaving the caster's hand */
    const g = settings.global;
    _pos.copy(this.origin).setY(1.2).addScaledVector(this.direction, 0.5);
    this.ctx.bursts.spawn(BurstMode.FIRE, _pos, {
      radius: 0.1,
      endRadius: 0.7 * g.explosionIntensity,
      life: 0.28,
      intensity: c.burstIntensity,
      opacity: 0.7,
      displace: 0.5,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    this._syncAll(0);
  }

  /* ------------------------------------------------------------------ */
  /* Resolving a rock — every metre and second comes from here           */
  /* ------------------------------------------------------------------ */

  /** Seconds after impact that rock `r` lands. */
  _landTime(r, c) {
    const order = lerp(r.order, r.orderRand, saturate(c.orderJitter * settings.global.randomness));
    return c.telegraph + order * this._span();
  }

  /** Where rock `r` lands, on the floor, at the live circle. */
  _landPoint(r, c, out) {
    const scatter = saturate(c.scatter * settings.global.randomness);
    const area = lerp(r.evenArea, r.randArea, scatter);
    const angle = r.evenAngle + (r.randAngle - Math.PI) * scatter * 0.35;
    const reach = c.zoneRadius * c.spread * Math.pow(saturate(area), c.spreadCurve);
    this.pointAt(1, out);
    out.x += Math.cos(angle) * reach;
    out.z += Math.sin(angle) * reach;
    out.y = 0;
    return out;
  }

  /** Radius of rock `r`, metres. */
  _rockRadius(r, c) {
    return Math.max(0.05, c.rockSize * (1 + r.sizeJitter * c.sizeJitter * settings.global.randomness));
  }

  /**
   * The shared direction of the rain, written into `_fall`.
   *
   * Slanted `fallAngle` off vertical and yawed `fallYaw` off the cast heading,
   * so the swarm comes in over the caster's shoulder rather than straight
   * down. One direction for the whole volley is the point: a rain falls at one
   * angle, and rocks scattered over every angle read as a fountain in reverse.
   */
  _fallDirection(c) {
    const yaw = c.fallYaw;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    _horizontal.set(
      this.direction.x * cy - this.direction.z * sy,
      0,
      this.direction.x * sy + this.direction.z * cy
    );
    const a = c.fallAngle;
    _fall.copy(_horizontal).multiplyScalar(Math.sin(a));
    _fall.y = -Math.cos(a);
    return _fall.normalize();
  }

  /** This rock's own direction — the shared one, nudged by its slant dice. */
  _rockDirection(r, c, out) {
    const j = c.angleJitter * settings.global.randomness;
    out.copy(_fall);
    out.x += r.slantX * j;
    out.z += r.slantZ * j;
    return out.normalize();
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncAll(dt) {
    const c = settings.swarm;
    const g = settings.global;

    this._syncGeometry();
    this._fallDirection(c);
    this.rockMaterial.userData.sync(_fall);
    this.sheathMaterial.userData.sync(_fall);

    this.streaks.setGradient(
      getColor(c.colorStreakA),
      getColor(c.colorStreakB),
      getColor(c.colorStreakC),
      getColor(c.colorStreakD)
    );
    this.streaks.uniforms.uGravity.value.set(0, -2.5, 0);
    this.streaks.uniforms.uSizeScale.value = c.streakSize * g.particleSize * 7;
    this.streaks.uniforms.uLifeScale.value = g.particleLifetime;
    this.streaks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.streaks.uniforms.uOpacity.value = g.opacity;
    this.streaks.uniforms.uGlow.value = c.streakGlow * g.glow;
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    this.streaks.uniforms.uTurbulence.value = 0.2 * g.turbulence;

    this.smoke.setGradient(
      getColor(c.colorSmokeA),
      getColor(c.colorSmokeB),
      getColor(c.colorSmokeC),
      getColor(c.colorSmokeD)
    );
    this.smoke.uniforms.uGravity.value.set(0, c.smokeRise, 0);
    this.smoke.uniforms.uSizeScale.value = c.smokeSize * g.particleSize;
    this.smoke.uniforms.uLifeScale.value = g.particleLifetime;
    this.smoke.uniforms.uSpeedScale.value = g.particleSpeed;
    this.smoke.uniforms.uOpacity.value = c.smokeOpacity * g.opacity;
    this.smoke.uniforms.uTurbulence.value = c.smokeTurbulence * g.turbulence;
    this.smoke.uniforms.uEndSize.value = c.smokeSpread;

    this.chips.setGradient(
      getColor(c.colorChipA),
      getColor(c.colorChipB),
      getColor(c.colorChipC),
      getColor(c.colorChipD)
    );
    this.chips.uniforms.uGravity.value.set(0, c.chipGravity, 0);
    this.chips.uniforms.uSizeScale.value = c.chipSize * g.particleSize * 7;
    this.chips.uniforms.uLifeScale.value = g.particleLifetime;
    this.chips.uniforms.uSpeedScale.value = g.particleSpeed;
    this.chips.uniforms.uOpacity.value = g.opacity;

    this.embers.setGradient(
      getColor(c.colorEmberA),
      getColor(c.colorEmberB),
      getColor(c.colorEmberC),
      getColor(c.colorEmberD)
    );
    this.embers.uniforms.uGravity.value.set(0, c.emberRise, 0);
    this.embers.uniforms.uSizeScale.value = c.emberSize * g.particleSize * 7;
    this.embers.uniforms.uLifeScale.value = g.particleLifetime;
    this.embers.uniforms.uSpeedScale.value = g.particleSpeed;
    this.embers.uniforms.uOpacity.value = g.opacity;
    this.embers.uniforms.uGlow.value = c.emberGlow * g.glow;
    this.embers.uniforms.uTurbulence.value = 0.6 * g.turbulence;

    this._updateGround(dt);
  }

  /**
   * Lay the telegraph: one quad over the circle, every mark written in place.
   * The marks are resolved from the same functions the rocks are, so a mark
   * can never sit anywhere but under its own rock.
   */
  _updateGround() {
    const c = settings.swarm;
    const g = settings.global;
    const state = this._groundState;
    const clock = this._clock;
    const pips = this.groundMaterial.userData.pips;

    this.pointAt(1, _centre);
    const radius = Math.max(0.1, c.zoneRadius);
    state.radius = radius;
    // Wide enough for a mark at the rim at its widest, plus the halo.
    state.quadSize = (radius + c.pipSize * Math.max(1, c.pipTighten) + c.craterSize + 0.8) * 2;
    state.reveal = Easing.outCubic(saturate(this.age / Math.max(0.02, c.revealTime)));
    state.seed = this._seed;
    state.count = this._count;

    let fade = 1;
    if (this.phase === AbilityPhase.FADE) fade = 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration));
    state.fade = fade;

    let airborne = 0;
    const cool = Math.max(0.05, c.craterCool * g.lifetime);
    const lead = Math.max(0.05, c.pipLead);
    const reveal = Math.max(0.02, c.revealTime);

    for (let i = 0; i < this._count; i++) {
      const r = this.records[i];
      const pip = pips[i];
      this._landPoint(r, c, _land);
      // The quad is laid with rotateX(-π/2), so its v runs *against* world z
      // and the shader's `0.5 - vUv.y` undoes that: p.y is world z.
      pip.x = _land.x - _centre.x;
      pip.y = _land.z - _centre.z;

      if (clock < 0) {
        pip.z = -1;
        pip.w = 0;
        continue;
      }

      const landAt = this._landTime(r, c);
      if (!r.landed) {
        // Marks come up in landing order across the reveal, then hold wide
        // until `pipLead` before their rock, then close onto the point.
        const appearAt = reveal * (0.2 + 0.8 * saturate((landAt - c.telegraph) / this._span()));
        if (clock < appearAt) {
          pip.z = -1;
          pip.w = 0;
        } else {
          pip.z = saturate(1 - (landAt - clock) / lead);
          // While a mark is up, w carries its fade-in as a negative number —
          // the shader reads `-w` as appearance and `max(w, 0)` as bed heat, so
          // one vec4 per rock covers both lives of the mark.
          pip.w = -saturate((clock - appearAt) / 0.15);
        }
        if (landAt - clock < c.fallTime) airborne++;
      } else {
        pip.z = -1;
        pip.w = 1 - saturate((clock - landAt) / cool);
      }
    }

    state.surge = saturate(airborne / Math.max(1, this._count * 0.25));
    this.groundMaterial.userData.sync(state);

    this.ground.visible = true;
    this.ground.position.set(_centre.x, 0.035, _centre.z);
    this.ground.scale.set(state.quadSize, 1, state.quadSize);
  }

  /**
   * Place every rock and its flame, shed its trail, and land the ones whose
   * time has come. Runs on a zero-length frame too, so the editor reshapes a
   * paused volley.
   */
  _updateRocks(dt) {
    const c = settings.swarm;
    const g = settings.global;
    const clock = this._clock;
    const fallTime = Math.max(0.05, c.fallTime);
    const cosA = Math.max(0.15, Math.cos(c.fallAngle));
    const pathLength = c.fallHeight / cosA;
    const used = [0, 0, 0];
    let sheathCount = 0;
    let visible = 0;

    for (let i = 0; i < this._count; i++) {
      const r = this.records[i];
      const variant = i % VARIANTS;
      const slot = (i / VARIANTS) | 0;
      used[variant] = Math.max(used[variant], slot + 1);

      const landAt = this._landTime(r, c);
      const remaining = landAt - clock;

      if (!r.landed && clock >= 0 && remaining <= 0) {
        this._landFx(r, c, g);
        r.landed = true;
      }

      const inFlight = !r.landed && clock >= 0 && remaining < fallTime;
      if (!inFlight) {
        this._park(variant, slot);
        this.sheathFade.array[i] = 0;
        r.live = false;
        continue;
      }

      visible++;
      const s = saturate(remaining / fallTime); // 1 at the top of the approach, 0 on the floor
      const radius = this._rockRadius(r, c);
      this._rockDirection(r, c, _rockFall);
      this._landPoint(r, c, _land);
      _pos.copy(_land).addScaledVector(_rockFall, -pathLength * s);
      _pos.y += radius * 0.4;

      // Tumbling about its own axis — a rock ploughing in does not hold a face.
      _dummy.position.copy(_pos);
      _dummy.quaternion.setFromAxisAngle(r.axis, r.spin + this.age * c.tumble * g.animationSpeed);
      _dummy.scale.setScalar(radius);
      _dummy.updateMatrix();
      this.rocks[variant].setMatrixAt(slot, _dummy.matrix);
      this.heatAttributes[variant].array[slot] = Easing.inQuad(1 - s);

      // The flame: centred on the rock, unrotated (its shape comes from the
      // fall direction in the shader), and faded in over the first part of
      // the approach so a rock never appears out of nothing with a tail on.
      _dummy.quaternion.identity();
      _dummy.scale.setScalar(radius * c.sheathScale);
      _dummy.updateMatrix();
      this.sheath.setMatrixAt(i, _dummy.matrix);
      this.sheathFade.array[i] = smoothstep(1, 0.82, s);
      sheathCount = i + 1;

      this._trailFx(r, c, g, dt, radius);
      r.prev.copy(_pos);
      r.live = true;
    }

    for (let v = 0; v < VARIANTS; v++) {
      this.rocks[v].count = used[v];
      this.rocks[v].instanceMatrix.needsUpdate = true;
      this.heatAttributes[v].needsUpdate = true;
    }
    this.sheath.count = sheathCount;
    this.sheath.instanceMatrix.needsUpdate = true;
    this.sheathFade.needsUpdate = true;
    this._visible = visible;
  }

  /** An unused slot, parked below the floor rather than drawn degenerate at the origin. */
  _park(variant, slot) {
    _dummy.position.set(0, -999, 0);
    _dummy.quaternion.identity();
    _dummy.scale.setScalar(0.0001);
    _dummy.updateMatrix();
    this.rocks[variant].setMatrixAt(slot, _dummy.matrix);
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Fire and smoke shed along the segment the rock covered this frame.
   * Sub-stepped: at fifty metres a second a rock crosses most of a metre per
   * frame, and a trail emitted only at its current position is a dotted line.
   */
  _trailFx(r, c, g, dt, radius) {
    const time = frame.uTime.value;
    const streaks = Math.round(r.streak.tick(dt, c.streakRate) * g.particleCount);
    const smokes = Math.round(r.smoke.tick(dt, c.smokeRate) * g.particleCount);
    if (streaks <= 0 && smokes <= 0) return;

    _dir.copy(_rockFall).negate();
    const from = r.live ? r.prev : _pos;

    for (let step = 0; step < TRAIL_STEPS; step++) {
      const t = (step + Math.random()) / TRAIL_STEPS;
      _land.lerpVectors(from, _pos, t);

      // An exact split: the remainder goes one apiece to the first steps.
      const ns = ((streaks / TRAIL_STEPS) | 0) + (step < streaks % TRAIL_STEPS ? 1 : 0);
      if (ns > 0) {
        _emit.position = _land;
        _emit.radius = radius * 0.6;
        _emit.direction = _dir;
        _emit.speed = c.streakSpeed;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.3;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.12;
        _emit.sizeVariance = 0.5;
        _emit.life = c.streakLifetime;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = time;
        this.streaks.emit(ns, _emit);
      }

      const nm = ((smokes / TRAIL_STEPS) | 0) + (step < smokes % TRAIL_STEPS ? 1 : 0);
      if (nm > 0) {
        _emit.position = _land;
        _emit.radius = radius * 0.8;
        _emit.direction = _dir;
        _emit.speed = 0.6;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.8;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.8;
        _emit.sizeVariance = 0.45;
        _emit.life = c.smokeLifetime;
        _emit.lifeVariance = 0.35;
        _emit.spin = 0.5;
        _emit.tint = null;
        _emit.time = time;
        this.smoke.emit(nm, _emit);
      }
    }
  }

  /** One rock reaching the floor: char, fire, ring, debris, the blow. */
  _landFx(r, c, g) {
    const time = frame.uTime.value;
    const radius = this._rockRadius(r, c);
    const scale = radius / Math.max(0.05, c.rockSize);
    this._landPoint(r, c, _land);
    this._rockDirection(r, c, _rockFall);

    this.ctx.decals.spawn(DecalType.SCORCH, _land, {
      radius: c.scorchRadius * scale,
      life: c.scorchLife * g.lifetime,
      intensity: c.scorchIntensity,
      colorA: getColor(c.colorScorch),
      colorB: getColor(c.colorScorchEmber),
      height: 0.022
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _land, {
      radius: c.ringRadius * scale * g.explosionIntensity,
      life: c.ringLife,
      width: 0.07,
      intensity: 0.9,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB),
      height: 0.03
    });

    _pos.copy(_land).setY(radius * 0.6);
    this.ctx.bursts.spawn(BurstMode.FIRE, _pos, {
      radius: radius * 0.6,
      endRadius: c.burstSize * scale * g.explosionIntensity,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity,
      fresnel: 1.4,
      displace: 0.55,
      squash: c.burstSquash,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    // Debris kicked out *along* the strike as well as up: a slanted impact
    // splashes forward, and that asymmetry is what sells the angle on landing.
    _dir.set(_rockFall.x * 0.6, 1, _rockFall.z * 0.6).normalize();
    _emit.position = _pos.copy(_land).setY(0.1);
    _emit.radius = radius * 0.6;
    _emit.direction = _dir;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.85;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.7;
    _emit.life = c.chipLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 9;
    _emit.tint = null;
    _emit.time = time;
    this.chips.emit(Math.round(c.chipCount * scale * g.particleCount), _emit);

    _emit.speed = c.sparkSpeed;
    _emit.spread = 1.0;
    _emit.size = 0.1;
    _emit.life = c.streakLifetime * 1.6;
    _emit.spin = 0;
    this.streaks.emit(Math.round(c.sparkCount * scale * g.particleCount), _emit);

    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = 1.6;
    _emit.spread = 1.0;
    _emit.radius = radius;
    _emit.size = 1.0;
    _emit.sizeVariance = 0.5;
    _emit.life = c.smokeLifetime * 1.2;
    _emit.spin = 0.4;
    this.smoke.emit(Math.round(8 * scale * g.particleCount), _emit);

    this.ctx.shake.add(
      c.impactShake * scale * g.explosionIntensity * g.cameraShake,
      1 / Math.max(0.05, c.shakeDuration),
      22
    );
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * g.explosionIntensity);
    this.lightBoost = Math.min(this.lightBoost + c.impactLight * g.explosionIntensity, c.impactLight * 3);
    this._lastLand = this._clock;

    this._hit(c, scale);
  }

  /** Every body inside this landing's blast, thrown out of the middle of it. */
  _hit(c, scale) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(_land.x, _land.z, c.blastRadius * scale, this._targets);
    if (found.length === 0) return;

    this._force.impulse = c.hitImpulse;
    this._force.lift = c.hitLift;
    this._force.spin = c.hitSpin;

    for (const dummy of found) {
      _dir.set(dummy.position.x - _land.x, 0, dummy.position.z - _land.z);
      // Dead centre has no outward; it takes the rain's own heading.
      if (_dir.lengthSq() < 1e-6) _dir.set(_rockFall.x, 0, _rockFall.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._targets.length = 0;
  }

  /** Embers lifting off the beds while they still glow. */
  _coolingFx(dt, c, g) {
    const cool = Math.max(0.05, c.craterCool * g.lifetime);
    const count = Math.round(this.emberEmitter.tick(dt, c.emberRate) * g.particleCount);
    const time = frame.uTime.value;
    for (let n = 0; n < count; n++) {
      const r = this.records[(Math.random() * this._count) | 0];
      if (!r || !r.landed) continue;
      const heat = 1 - (this._clock - this._landTime(r, c)) / cool;
      if (heat <= 0 || Math.random() > heat) continue;

      this._landPoint(r, c, _pos).setY(0.08);
      _emit.position = _pos;
      _emit.radius = c.craterSize * 0.6;
      _emit.direction = _dir.set(0, 1, 0);
      _emit.speed = 0.7;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.6;
      _emit.life = c.emberLifetime;
      _emit.lifeVariance = 0.5;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.embers.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.swarm;
    const g = settings.global;
    this._clock = -1;
    this._syncAll(dt);
    this._updateRocks(dt);

    // The call: a line of sparks running out to the circle, and the light
    // riding its head.
    this.position.y = 1.0;
    const count = Math.round(this.callEmitter.tick(dt, c.callSparks) * g.particleCount);
    if (count > 0) {
      _emit.position = _pos.copy(this.position);
      _emit.radius = 0.25;
      _emit.direction = _dir.copy(this.direction).setY(0.6).normalize();
      _emit.speed = 2.5;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.5;
      _emit.life = c.streakLifetime * 1.4;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.streaks.emit(count, _emit);
    }
  }

  onImpact() {
    const c = settings.swarm;
    const g = settings.global;
    this._clock = 0;
    this.pointAt(1, _centre);

    // The circle is sealed: a ring snaps outward from its middle, and the
    // light goes up into the sky the rain is coming from.
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * 1.1,
      life: 0.6,
      width: 0.05,
      intensity: 0.7,
      colorA: getColor(c.colorRing),
      colorB: getColor(c.colorRingHot),
      height: 0.03
    });
    this.ctx.shake.add(0.08 * g.cameraShake, 6, 14);
    this.lightBoost = c.lightIntensity * 0.5;
  }

  onFade(dt) {
    const c = settings.swarm;
    const g = settings.global;

    this._clock =
      this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;

    this._syncAll(dt);
    this._updateRocks(dt);
    this._coolingFx(dt, c, g);

    // The light hangs over the circle, lower and hotter once the rocks land.
    this.pointAt(1, this.position);
    this.position.y = c.lightHeight;

    if (this.phase === AbilityPhase.IMPACT && this._clock < c.telegraph + this._span()) {
      this.ctx.shake.rumble(c.rumble * g.cameraShake, dt);
    }
  }

  onDestroy() {
    this._count = 0;
    this._visible = 0;
    this._clock = -1;
    for (let v = 0; v < VARIANTS; v++) this.rocks[v].count = 0;
    this.sheath.count = 0;
    this.ground.visible = false;
    this.groundMaterial.uniforms.uPipCount.value = 0;
    this.groundMaterial.uniforms.uFade.value = 0;
  }

  dispose() {
    for (const mesh of this.rocks) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.rockMaterial.dispose();
    this.sheathGeometry.dispose();
    this.sheath.dispose();
    this.sheathMaterial.dispose();
    this.groundGeometry.dispose();
    this.groundMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☄  Meteor Swarm');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'call speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'telegraph', 0, 3, 0.01, 'marks before the first rock');
  R(time, c, 'lifetime', 0.1, 8, 0.05, 'volley lands over');
  R(time, c, 'fallTime', 0.1, 2, 0.01, 'seconds in the air');
  R(time, c, 'orderJitter', 0, 1, 0.01, 'ragged landing order');
  R(time, c, 'linger', 0, 5, 0.05, 'craters glow for');
  R(time, c, 'fadeTime', 0.1, 5, 0.05, 'fade out');

  const volley = folder.addFolder('1 · The volley');
  R(volley, c, 'meteorCount', 1, MAX_METEORS, 1, 'rocks');
  R(volley, c, 'spread', 0.1, 1.2, 0.01, 'spread (× circle)');
  R(volley, c, 'spreadCurve', 0.1, 2, 0.01, 'rim ↔ centre bias');
  R(volley, c, 'scatter', 0, 1, 0.01, 'scatter');
  R(volley, c, 'fallAngle', 0, 1.3, 0.01, 'slant off vertical (rad)');
  R(volley, c, 'fallYaw', -3.14, 3.14, 0.01, 'slant heading (rad)');
  R(volley, c, 'angleJitter', 0, 0.5, 0.005, 'per-rock slant jitter');
  R(volley, c, 'fallHeight', 4, 60, 0.5, 'start height (m)');

  const rock = folder.addFolder('2 · One rock');
  R(rock, c, 'rockSize', 0.05, 2, 0.01, 'radius (m)');
  R(rock, c, 'sizeJitter', 0, 1, 0.01, 'size jitter');
  R(rock, c, 'tumble', 0, 20, 0.1, 'tumble (rad/s)');
  R(rock, c, 'rockDetail', 0, 3, 1, 'detail (rebuild)');
  R(rock, c, 'rockLumps', 0, 0.6, 0.01, 'lumpiness (rebuild)');
  R(rock, c, 'rockCuts', 0, 14, 1, 'flat faces (rebuild)');
  R(rock, c, 'rockCraters', 0, 10, 1, 'pits (rebuild)');

  const crust = rock.addFolder('Molten crust');
  R(crust, c, 'crackScale', 0.3, 8, 0.05, 'crack scale');
  R(crust, c, 'crackWidth', 0.01, 0.6, 0.005, 'seam width');
  R(crust, c, 'crackGlow', 0, 12, 0.05, 'seam glow');
  R(crust, c, 'crackFlow', 0, 4, 0.01, 'melt crawl speed');
  R(crust, c, 'leadHeat', 0, 6, 0.05, 'leading-face heat');
  R(crust, c, 'leadPower', 0.3, 8, 0.05, 'leading-face tightness');
  R(crust, c, 'rimGlow', 0, 5, 0.05, 'rim glow');
  R(crust, c, 'rimPower', 0.5, 8, 0.05, 'rim power');
  R(crust, c, 'rockRoughness', 0, 1, 0.01, 'roughness');
  R(crust, c, 'rockGlow', 0, 4, 0.01, 'master emissive');
  crust.addColor(c, 'colorCrust').name('crust');
  crust.addColor(c, 'colorCrustLit').name('crust, lit');
  crust.addColor(c, 'colorMagma').name('magma');
  crust.addColor(c, 'colorMagmaHot').name('magma, hottest');
  crust.addColor(c, 'colorRim').name('rim');

  const sheath = folder.addFolder('3 · Entry flame');
  R(sheath, c, 'sheathScale', 0.5, 5, 0.05, 'size (× rock)');
  R(sheath, c, 'sheathTail', 0, 12, 0.1, 'tail length');
  R(sheath, c, 'sheathIntensity', 0, 10, 0.05, 'intensity');
  R(sheath, c, 'sheathOpacity', 0, 1, 0.01, 'opacity');
  R(sheath, c, 'sheathFalloff', 0.2, 6, 0.05, 'core falloff');
  R(sheath, c, 'sheathNoise', 0, 1, 0.01, 'tearing');
  R(sheath, c, 'sheathNoiseScale', 0.2, 8, 0.05, 'tear scale');
  R(sheath, c, 'sheathFlow', 0, 10, 0.05, 'stream speed');
  R(sheath, c, 'sheathSoftFade', 0.01, 2, 0.01, 'soft fade (m)');
  sheath.addColor(c, 'colorSheathCore').name('core');
  sheath.addColor(c, 'colorSheathMid').name('body');
  sheath.addColor(c, 'colorSheathEdge').name('tail');

  const trails = folder.addFolder('4 · Trails');
  R(trails, c, 'streakRate', 0, 300, 1, 'fire per rock / s');
  R(trails, c, 'streakSize', 0.01, 0.5, 0.005, 'fire size');
  R(trails, c, 'streakSpeed', 0, 15, 0.1, 'fire speed');
  R(trails, c, 'streakLifetime', 0.05, 2, 0.01, 'fire lifetime');
  R(trails, c, 'streakStretch', 0, 2, 0.01, 'fire stretch');
  R(trails, c, 'streakGlow', 0, 6, 0.05, 'fire glow');
  Editor.gradient(trails, c, 'colorStreak', 'fire colour');
  R(trails, c, 'smokeRate', 0, 120, 1, 'smoke per rock / s');
  R(trails, c, 'smokeSize', 0.05, 3, 0.01, 'smoke size');
  R(trails, c, 'smokeSpread', 0.5, 6, 0.05, 'smoke end size');
  R(trails, c, 'smokeLifetime', 0.1, 5, 0.05, 'smoke lifetime');
  R(trails, c, 'smokeRise', -2, 4, 0.05, 'smoke rise');
  R(trails, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  R(trails, c, 'smokeTurbulence', 0, 3, 0.01, 'smoke turbulence');
  Editor.gradient(trails, c, 'colorSmoke', 'smoke colour');

  const land = folder.addFolder('5 · Landings');
  R(land, c, 'scorchRadius', 0.1, 4, 0.05, 'scorch radius (m)');
  R(land, c, 'scorchLife', 0.2, 12, 0.1, 'scorch life');
  R(land, c, 'scorchIntensity', 0, 2, 0.01, 'scorch intensity');
  land.addColor(c, 'colorScorch').name('scorch');
  land.addColor(c, 'colorScorchEmber').name('scorch embers');
  R(land, c, 'burstSize', 0.1, 6, 0.05, 'fire shell size (m)');
  R(land, c, 'burstLife', 0.05, 2, 0.01, 'fire shell life');
  R(land, c, 'burstIntensity', 0, 6, 0.05, 'fire shell intensity');
  R(land, c, 'burstOpacity', 0, 1, 0.01, 'fire shell opacity');
  R(land, c, 'burstSquash', 0.1, 1.5, 0.01, 'fire shell squash');
  land.addColor(c, 'colorBurstA').name('shell core');
  land.addColor(c, 'colorBurstB').name('shell body');
  land.addColor(c, 'colorBurstC').name('shell edge');
  R(land, c, 'ringRadius', 0.1, 6, 0.05, 'shock ring (m)');
  R(land, c, 'ringLife', 0.05, 2, 0.01, 'shock ring life');
  land.addColor(c, 'colorRingA').name('ring');
  land.addColor(c, 'colorRingB').name('ring, hot');
  R(land, c, 'chipCount', 0, 80, 1, 'debris');
  R(land, c, 'chipSize', 0.01, 0.4, 0.005, 'debris size');
  R(land, c, 'chipSpeed', 0, 20, 0.1, 'debris speed');
  R(land, c, 'chipGravity', -40, 0, 0.5, 'debris gravity');
  R(land, c, 'chipLifetime', 0.1, 4, 0.05, 'debris lifetime');
  Editor.gradient(land, c, 'colorChip', 'debris colour');
  R(land, c, 'sparkCount', 0, 120, 1, 'sparks');
  R(land, c, 'sparkSpeed', 0, 25, 0.1, 'spark speed');
  R(land, c, 'impactShake', 0, 1.5, 0.01, 'shake');
  R(land, c, 'shakeDuration', 0.05, 2, 0.01, 'shake settles over');
  R(land, c, 'impactFlash', 0, 1, 0.01, 'flash');
  land.addColor(c, 'colorFlash').name('flash');
  R(land, c, 'impactLight', 0, 40, 0.5, 'light punch');
  R(land, c, 'rumble', 0, 0.5, 0.005, 'rumble while it rains');

  const hit = land.addFolder('Hits');
  R(hit, c, 'blastRadius', 0, 5, 0.05, 'blast radius (m)');
  R(hit, c, 'hitImpulse', 0, 20, 0.1, 'impulse');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'lift');
  R(hit, c, 'hitSpin', 0, 5, 0.05, 'spin');

  const embers = folder.addFolder('6 · Cooling');
  R(embers, c, 'emberRate', 0, 200, 1, 'embers / s');
  R(embers, c, 'emberSize', 0.01, 0.3, 0.005, 'ember size');
  R(embers, c, 'emberRise', -1, 5, 0.05, 'ember rise');
  R(embers, c, 'emberLifetime', 0.1, 4, 0.05, 'ember lifetime');
  R(embers, c, 'emberGlow', 0, 6, 0.05, 'ember glow');
  Editor.gradient(embers, c, 'colorEmber', 'ember colour');

  const ground = folder.addFolder('7 · The telegraph');
  R(ground, c, 'revealTime', 0.02, 2, 0.01, 'ring draws on over');
  R(ground, c, 'ringWidth', 0.01, 0.5, 0.005, 'ring width (m)');
  R(ground, c, 'ringGlow', 0, 8, 0.05, 'ring glow');
  R(ground, c, 'ringTicks', 4, 120, 1, 'ticks');
  R(ground, c, 'ringTickSpin', -1, 1, 0.01, 'tick spin (rev/s)');
  R(ground, c, 'fieldFill', 0, 1, 0.01, 'heat wash');
  R(ground, c, 'fieldNoise', 0, 1, 0.01, 'wash break-up');
  R(ground, c, 'fieldNoiseScale', 0.1, 6, 0.05, 'wash scale');
  R(ground, c, 'fieldRise', 0, 5, 0.05, 'wash surge');
  R(ground, c, 'pipSize', 0.05, 2, 0.01, 'mark radius (m)');
  R(ground, c, 'pipWidth', 0.005, 0.3, 0.005, 'mark width (m)');
  R(ground, c, 'pipTighten', 1, 6, 0.05, 'mark starts × wider');
  R(ground, c, 'pipLead', 0.05, 3, 0.01, 'mark closes over (s)');
  R(ground, c, 'pipGlow', 0, 8, 0.05, 'mark glow');
  R(ground, c, 'pipDot', 0, 0.5, 0.005, 'centre dot (m)');
  R(ground, c, 'pipBlink', 0, 30, 0.1, 'blink speed');
  R(ground, c, 'craterSize', 0.05, 3, 0.01, 'molten bed (m)');
  R(ground, c, 'craterGlow', 0, 8, 0.05, 'bed glow');
  R(ground, c, 'craterCool', 0.1, 6, 0.05, 'bed cools over (s)');
  R(ground, c, 'fieldOpacity', 0, 1, 0.01, 'opacity');
  ground.addColor(c, 'colorRing').name('ring');
  ground.addColor(c, 'colorRingHot').name('ring, hot');
  ground.addColor(c, 'colorPip').name('marks');
  ground.addColor(c, 'colorField').name('wash');
  ground.addColor(c, 'colorCrater').name('beds');

  const light = folder.addFolder('Light & call');
  R(light, c, 'callSparks', 0, 600, 1, 'call sparks / s');
  light.addColor(c, 'lightColor').name('light colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'light radius');
  R(light, c, 'lightHeight', 0.2, 8, 0.05, 'light height (m)');
}
