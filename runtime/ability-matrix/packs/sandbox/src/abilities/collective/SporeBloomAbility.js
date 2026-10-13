import {
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createSporeMushroomMaterial,
  createSporePodMaterial,
  createSporeGroundMaterial
} from '../../materials/collective/SporeBloomMaterials.js';
import { createMushroomGeometry } from '../../assets/collective/SporeBloomGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'spore';

/** Hard ceilings. The editor's count sliders clamp to these. */
const MAX_CLUSTERS = 12;
const MAX_PER_CLUSTER = 8;
const MAX_MUSHROOMS = MAX_CLUSTERS * MAX_PER_CLUSTER;
/** Bodies one bloom can be working on at once. */
const MAX_VICTIMS = 16;
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const _emit = {};
const _pos = new Vector3();
const _tip = new Vector3();
const _dir = new Vector3();
const _out = new Vector3();
const _axis = new Vector3();
const _centre = new Vector3();
const _vel = new Vector3();
const _up = new Vector3(0, 1, 0);
const _yaw = new Quaternion();
const _tilt = new Quaternion();
const _dummy = new Object3D();

/**
 * SPORE BLOOM — Fungal, zone cast.
 *
 * Four beats, each one handing over to the next on the floor rather than on a
 * timer: the pod lands, the network grows out of where it landed, mushrooms
 * come up *where the network has reached*, and their caps puff when they have
 * opened. So the bloom spreads outward as one organism instead of a set of
 * props switching on together.
 *
 * ## Layers
 *
 *   1. **THE POD** (`createSporePodMaterial`) — a husk lobbed on an arc, veins
 *      of light pulsing toward its leading end, shedding motes as it flies.
 *   2. **THE MYCELIUM** (`createSporeGroundMaterial`) — a voronoi edge network
 *      plus radial runners, spreading from the impact at `veinSpeed` with an
 *      uneven, noise-broken front; light pulses run outward along it over a
 *      dark moss stain. Dims as the bloom wilts.
 *   3. **THE MUSHROOMS** (`createSporeMushroomMaterial`, instanced lathe) —
 *      built in the vertex shader from a unit profile, so every dimension is a
 *      live slider; a stem shoots, a closed bud opens past full and settles,
 *      the cap sways. Luminous spots, a fresnel rim band and glowing gills.
 *      They wilt by the same displacement they opened with, run backwards:
 *      the rim falls, the stem bows, and the whole thing sinks into the floor.
 *      SHAPED layer, with a matching depth material, so the shadow is the
 *      mushroom's and not the unit lathe's.
 *   4. **THE SPORE CLOUD** — non-additive SMOKE (it has to occlude, or a spore
 *      cloud is a green haze) plus additive SOFT motes on curl noise, puffed out
 *      of every cap on a per-mushroom rhythm and drifting over the circle.
 *   5. **THE LANDING** — a DUSTRING of spores and a thin AIR shell, a shake,
 *      a flash and a light punch, then the light breathes with the veins.
 *
 * ## Hits
 *
 * `handlesOwnHits`: the cloud is not a blast. A body standing in it is
 * corroded (`Dummy#corrode`) while it breathes the spores and drops once it has
 * been in there `killTime` seconds — folding where it stands rather than being
 * thrown. Once it is fully stained the spores eat it (`Dummy#consume`), on top
 * of its natural burn. Bodies are held in a fixed pool of slots, so polling
 * every frame allocates nothing.
 *
 * ## The rule that keeps it editable
 *
 * Mushroom and cluster records hold only dice. Where a clump stands, how far a
 * mushroom is from its clump, how tall, how wide, when it sprouts — all are
 * resolved from `settings.spore` every frame.
 */
export class SporeBloomAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    const environment = this.ctx.environment;

    /* ---- layer 3: the mushrooms ---- */
    this.mushroomGeometry = createMushroomGeometry();
    this.stateAttribute = new InstancedBufferAttribute(new Float32Array(MAX_MUSHROOMS * 4), 4);
    const seeds = new InstancedBufferAttribute(new Float32Array(MAX_MUSHROOMS), 1);
    for (let i = 0; i < MAX_MUSHROOMS; i++) seeds.array[i] = Math.random();
    this.mushroomGeometry.setAttribute('aState', this.stateAttribute);
    this.mushroomGeometry.setAttribute('aSeed', seeds);

    this.mushroomMaterial = createSporeMushroomMaterial(environment);
    this.mushrooms = new InstancedMesh(this.mushroomGeometry, this.mushroomMaterial, MAX_MUSHROOMS);
    this.mushrooms.name = 'SporeMushrooms';
    this.mushrooms.customDepthMaterial = this.mushroomMaterial.userData.depth;
    this.mushrooms.castShadow = true;
    this.mushrooms.receiveShadow = true;
    // SHAPED, not WORLD: the depth prepass draws its layer with one override
    // material, which would rasterise the raw unit lathe — a field of metre-
    // wide cylinders — instead of the mushrooms. See core/Layers.js.
    this.mushrooms.layers.set(LAYER.SHAPED);
    this.mushrooms.frustumCulled = false;
    this.mushrooms.count = 0;
    this.group.add(this.mushrooms);

    /* ---- layer 1: the pod ---- */
    this.podGeometry = new SphereGeometry(1, 22, 16);
    this.podMaterial = createSporePodMaterial();
    this.pod = new Mesh(this.podGeometry, this.podMaterial);
    this.pod.name = 'SporePod';
    this.pod.castShadow = true;
    this.pod.layers.set(LAYER.WORLD);
    this.pod.frustumCulled = false;
    this.pod.visible = false;
    this.group.add(this.pod);

    /* ---- layer 2: the mycelium ---- */
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.groundMaterial = createSporeGroundMaterial();
    this.ground = new Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.name = 'SporeMycelium';
    this.ground.layers.set(LAYER.VFX);
    this.ground.renderOrder = 5;
    this.ground.frustumCulled = false;
    this.ground.visible = false;
    this.group.add(this.ground);
    this._groundState = { quadSize: 1, radius: 1, grown: 0, front: 0, dim: 1, fade: 1, seed: 0 };

    /** Clump centres — dice only. */
    this.clusters = [];
    for (let i = 0; i < MAX_CLUSTERS; i++) {
      this.clusters.push({ angle: 0, radial: 0, stagger: 0 });
    }

    /** One record per mushroom — dice, plus the events it has latched. */
    this.records = [];
    for (let i = 0; i < MAX_MUSHROOMS; i++) {
      this.records.push({
        cluster: 0,
        hero: false,
        angle: 0, // bearing inside the clump
        radial: 0, // 0..1 distance inside the clump
        size: 1, // jitter factor, before `heroScale`
        stagger: 0, // 0..1 of `growStagger`
        yaw: 0,
        tilt: 0, // 0..1 of `capTilt`
        puffJitter: 0,
        wiltStagger: 0,
        sprouted: false, // has it thrown its sprouting puff
        nextPuff: 0, // clock time of its next puff
        lastPuff: -99
      });
    }

    /** Bodies the cloud is working on — see `_hits`. */
    this._victims = [];
    for (let i = 0; i < MAX_VICTIMS; i++) {
      this._victims.push({ dummy: null, exposure: 0, eaten: 0, killed: false });
    }
    this._victimCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    this._count = 0;
    this._clusterCount = 0;
    this._clock = -1;
    this._cloud = 0;
    this._seed = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 4: the cloud's body ---- */
    this.smoke = particles.get('spore.smoke', {
      capacity: 3200,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.2
    });
    this.smoke.uniforms.uDrag.value = 2.0;
    this.smoke.uniforms.uSizeIn.value = 0.12;
    this.smoke.uniforms.uFadeIn.value = 0.16;
    this.smoke.uniforms.uFadeOut.value = 0.4;

    /* ---- layer 4: the spores themselves ---- */
    this.motes = particles.get('spore.motes', {
      capacity: 5000,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.4
    });
    this.motes.uniforms.uDrag.value = 1.4;
    this.motes.uniforms.uEndSize.value = 0.35;
    this.motes.uniforms.uSizeIn.value = 0.06;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.45;

    this.trailEmitter = new RateEmitter();
    this.driftEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.mushrooms.count;
  }

  get impactDuration() {
    return Math.max(0.3, settings.spore.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.2, settings.spore.wiltTime * settings.global.lifetime);
  }

  /** Bioluminescence breathes; it does not flicker. */
  lightShimmer() {
    const c = settings.spore;
    return 1 - c.lightPulse * (0.5 - 0.5 * Math.sin(this.age * 2.6));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.spore;

    this._seed = Math.random() * 100;
    this._clock = -1;
    this._cloud = 0;
    this._clearVictims();
    this.trailEmitter.reset();
    this.driftEmitter.reset();

    this._clusterCount = Math.min(MAX_CLUSTERS, Math.max(1, Math.round(c.clusters)));
    const per = Math.min(MAX_PER_CLUSTER, Math.max(1, Math.round(c.perCluster)));
    this._count = this._clusterCount * per;

    const turn = Math.random() * TAU;
    for (let k = 0; k < this._clusterCount; k++) {
      const cluster = this.clusters[k];
      // Sunflower spread, so clumps never pile up on one side of the circle.
      cluster.angle = turn + k * GOLDEN + randRange(-0.3, 0.3);
      cluster.radial = (k + randRange(0.2, 0.8)) / this._clusterCount;
      cluster.stagger = Math.random();
    }

    for (let i = 0; i < this._count; i++) {
      const r = this.records[i];
      const k = (i / per) | 0;
      const j = i % per;
      r.cluster = k;
      r.hero = j === 0;
      r.angle = Math.random() * TAU;
      r.radial = r.hero ? randRange(0, 0.15) : Math.sqrt(randRange(0.15, 1));
      r.size = 1 + randRange(-1, 1) * c.sizeJitter * settings.global.randomness;
      // The hero comes up first; the rest of its clump follows.
      r.stagger = r.hero ? 0 : randRange(0.15, 1);
      r.yaw = Math.random() * TAU;
      r.tilt = randRange(0.3, 1);
      r.puffJitter = Math.random();
      r.wiltStagger = Math.random();
      r.sprouted = false;
      r.nextPuff = -1;
      r.lastPuff = -99;
    }

    this.mushrooms.count = 0;
    this.ground.visible = false;
    this.pod.visible = true;
    this._placePod();
    this._sync();
  }

  /* ------------------------------------------------------------------ */
  /* Resolving — every metre and second comes from here                  */
  /* ------------------------------------------------------------------ */

  /** Where clump `k` stands, at the live circle. */
  _clusterPoint(k, c, out) {
    this.pointAt(1, out);
    if (k === 0 && c.clusterCentre) return out;
    const cluster = this.clusters[k];
    const reach = c.zoneRadius * c.clusterSpread * Math.sqrt(saturate(cluster.radial));
    out.x += Math.cos(cluster.angle) * reach;
    out.z += Math.sin(cluster.angle) * reach;
    return out;
  }

  /** Where mushroom `r` stands. Leaves its clump's centre in `_out`. */
  _mushroomPoint(r, c, out) {
    this._clusterPoint(r.cluster, c, _out);
    const reach = c.clusterRadius * r.radial;
    out.copy(_out);
    out.x += Math.cos(r.angle) * reach;
    out.z += Math.sin(r.angle) * reach;
    out.y = 0;
    return out;
  }

  /** Size factor — the instance's uniform scale. */
  _mushroomScale(r, c) {
    return Math.max(0.1, r.size * (r.hero ? c.heroScale : 1));
  }

  /** Clock time (seconds after impact) mushroom `r` starts to sprout. */
  _sproutTime(r, c) {
    this._mushroomPoint(r, c, _pos);
    this.pointAt(1, _centre);
    const d = Math.hypot(_pos.x - _centre.x, _pos.z - _centre.z);
    // Where the network has reached, plus a scatter inside the clump.
    return d / Math.max(0.05, c.veinSpeed) + r.stagger * c.growStagger;
  }

  /** The pod on its lob: the base class's front, lifted on a parabola. */
  _placePod() {
    const c = settings.spore;
    const u = this.u;
    const arc = 4 * c.podArc * u * (1 - u);
    this.pod.position.copy(this.position);
    this.pod.position.y = lerp(c.podLaunch, c.podSize, u) + arc;

    // Point its long axis down the flight: along the ground, plus the slope of
    // the parabola, which is d(height)/d(distance).
    const slope = (4 * c.podArc * (1 - 2 * u) + (c.podSize - c.podLaunch)) / Math.max(0.1, this.length);
    _vel.copy(this.direction).setY(slope).normalize();
    this.pod.quaternion.setFromUnitVectors(_up, _vel);
    // A tumble about that axis, so the veins turn as it flies.
    _tilt.setFromAxisAngle(_up, this.age * c.podSpin * settings.global.animationSpeed);
    this.pod.quaternion.multiply(_tilt);
    this.pod.scale.set(c.podSize, c.podSize * c.podStretch, c.podSize);
    return _vel;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.spore;
    const g = settings.global;

    this.mushroomMaterial.userData.sync();
    this.podMaterial.userData.sync(this._seed);

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

    this.motes.setGradient(
      getColor(c.colorMoteA),
      getColor(c.colorMoteB),
      getColor(c.colorMoteC),
      getColor(c.colorMoteD)
    );
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = c.moteSize * g.particleSize * 7;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = c.moteTurbulence * g.turbulence;
  }

  /**
   * The network on the floor. `wilt` 0..1 dims it as the bloom goes.
   */
  _updateGround(wilt, fade) {
    const c = settings.spore;
    const state = this._groundState;
    this.pointAt(1, _centre);

    const radius = Math.max(0.1, c.zoneRadius);
    state.radius = radius;
    state.quadSize = radius * 2.6;
    state.grown = Math.max(0, this._clock) * c.veinSpeed;
    // The growing edge is bright only while it is still growing, and dims as
    // it reaches the rim rather than switching off there.
    state.front = 1 - smoothstep(radius * 0.9, radius * 1.15, state.grown);
    state.dim = 1 - c.veinDim * wilt;
    state.fade = fade;
    state.seed = this._seed;
    this.groundMaterial.userData.sync(state);

    this.ground.visible = this._clock >= 0;
    this.ground.position.set(_centre.x, 0.03, _centre.z);
    this.ground.scale.set(state.quadSize, 1, state.quadSize);
  }

  /**
   * Grow, sway-feed, wilt and puff every mushroom. Runs on a zero-length frame
   * too, so a paused bloom reshapes under the editor.
   */
  _updateMushrooms(dt, standing) {
    const c = settings.spore;
    const g = settings.global;
    const clock = this._clock;
    const state = this.stateAttribute.array;
    const grow = Math.max(0.05, c.growTime);
    const wiltTime = Math.max(0.05, this.fadeDuration);
    const fading = this.phase === AbilityPhase.FADE;
    let drawn = 0;

    for (let i = 0; i < this._count; i++) {
      const r = this.records[i];
      const o = i * 4;
      const e = clock - this._sproutTime(r, c);

      if (clock < 0 || e < 0) {
        _dummy.position.set(0, -999, 0);
        _dummy.quaternion.identity();
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.mushrooms.setMatrixAt(i, _dummy.matrix);
        state[o] = state[o + 1] = state[o + 2] = state[o + 3] = 0;
        drawn = i + 1;
        continue;
      }

      /* --- growth: the stem shoots, then the bud opens past full and settles --- */
      const stem = Easing.outCubic(saturate(e / (grow * 0.45)));
      const opening = saturate((e - grow * 0.3) / (grow * 0.7));
      const open = Easing.outCubic(opening) + c.growOvershoot * Math.sin(opening * Math.PI);

      /* --- the wilt, staggered so the bloom collapses unevenly --- */
      let wilt = 0;
      if (fading) {
        const lead = r.wiltStagger * c.wiltStagger * wiltTime;
        wilt = saturate((this.fadeTime - lead) / Math.max(0.05, wiltTime * (1 - c.wiltStagger)));
      }

      /* --- puffs, on each mushroom's own rhythm --- */
      if (!r.sprouted) {
        r.sprouted = true;
        r.nextPuff = this._sproutTime(r, c) + grow + c.puffDelay + r.puffJitter * c.puffJitter;
        this._sproutFx(r, c, g);
      }
      if (standing && clock >= r.nextPuff) {
        this._puff(r, c, g);
        r.lastPuff = clock;
        r.nextPuff = clock + Math.max(0.1, c.puffInterval) * (0.75 + 0.5 * Math.random());
      }
      const flash = Math.exp(-Math.max(0, clock - r.lastPuff) * 7);

      state[o] = stem;
      state[o + 1] = open;
      state[o + 2] = wilt;
      state[o + 3] = flash * (1 - wilt);

      /* --- placement: lean out of the clump, sink as it wilts --- */
      const scale = this._mushroomScale(r, c);
      this._mushroomPoint(r, c, _dummy.position);
      _dir.set(_dummy.position.x - _out.x, 0, _dummy.position.z - _out.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(Math.cos(r.angle), 0, Math.sin(r.angle));
      _dir.normalize();
      _axis.crossVectors(_up, _dir).normalize();
      _tilt.setFromAxisAngle(_axis, c.capTilt * r.tilt * (r.hero ? 0.3 : 1));
      _yaw.setFromAxisAngle(_up, r.yaw);
      _dummy.quaternion.copy(_tilt).multiply(_yaw);
      _dummy.position.y = -c.sinkDepth * Easing.inCubic(wilt);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      this.mushrooms.setMatrixAt(i, _dummy.matrix);
      drawn = i + 1;
    }

    this.mushrooms.count = drawn;
    this.mushrooms.instanceMatrix.needsUpdate = true;
    this.stateAttribute.needsUpdate = true;
  }

  /** Where mushroom `r`'s cap currently is, near enough to puff from. */
  _capPoint(r, c, out) {
    const scale = this._mushroomScale(r, c);
    this._mushroomPoint(r, c, out);
    _dir.set(out.x - _out.x, 0, out.z - _out.z);
    const lean = c.capTilt * r.tilt * (r.hero ? 0.3 : 1);
    if (_dir.lengthSq() > 1e-6) _dir.normalize();
    const h = (c.stemHeight + c.capHeight) * scale;
    out.addScaledVector(_dir, Math.sin(lean) * h);
    out.y = Math.cos(lean) * h;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** A little burst of spores as a mushroom breaks the surface. */
  _sproutFx(r, c, g) {
    this._mushroomPoint(r, c, _pos).setY(0.06);
    _emit.position = _pos;
    _emit.radius = c.stemRadius * 2;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = c.puffSpeed * 0.8;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLifetime * 0.5;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(Math.round(5 * g.particleCount), _emit);
  }

  /** One cap letting its spores go. */
  _puff(r, c, g) {
    const scale = this._mushroomScale(r, c);
    this._capPoint(r, c, _tip);
    this._cloud = 1;

    _emit.position = _tip;
    _emit.radius = c.capRadius * scale * 0.8;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = c.puffSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.6 * scale;
    _emit.sizeVariance = 0.45;
    _emit.life = c.smokeLifetime;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0.4;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.smoke.emit(Math.round(c.puffSmoke * g.particleCount), _emit);

    _emit.speed = c.puffSpeed * 1.4;
    _emit.size = 0.07;
    _emit.sizeVariance = 0.6;
    _emit.life = c.moteLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    this.motes.emit(Math.round(c.puffMotes * g.particleCount), _emit);
  }

  /** Spores hanging over the circle between puffs. */
  _driftFx(dt, c, g, strength) {
    const count = Math.round(this.driftEmitter.tick(dt, c.driftRate * strength) * g.particleCount);
    if (count <= 0) return;
    this.pointAt(1, _pos);
    _pos.y = c.stemHeight * 1.2;
    _emit.position = _pos;
    _emit.radius = c.zoneRadius;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = 0.25;
    _emit.speedVariance = 0.7;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.6;
    _emit.life = c.moteLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(count, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Breathe in, stain, drop, rot. See the class comment.
   * @param {number} strength 0..1 how thick the cloud still is
   */
  _hits(dt, strength) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.spore;
    this.pointAt(1, _centre);

    if (this._cloud > 0 && strength > 0.05) {
      const reach = c.zoneRadius * c.cloudReach;
      const found = field.findBodies(_centre.x, _centre.z, reach, this._found);
      for (const dummy of found) {
        if (this._victimCount >= MAX_VICTIMS) break;
        if (this._victimOf(dummy)) continue;
        // A corpse with no solver behind it has nothing left to eat.
        if (!dummy.alive && !dummy.bodyPoint(_pos)) continue;
        const slot = this._victims[this._victimCount++];
        slot.dummy = dummy;
        slot.exposure = 0;
        slot.eaten = 0;
        slot.killed = !dummy.alive;
      }
      this._found.length = 0;
    }

    this._force.impulse = c.hitImpulse;
    this._force.lift = c.hitLift;
    this._force.spin = c.hitSpin;

    for (let i = this._victimCount - 1; i >= 0; i--) {
      const slot = this._victims[i];
      const dummy = slot.dummy;
      // Burned away, or stood back up by a field reset.
      if (!dummy || dummy.finished || (slot.killed && dummy.alive)) {
        this._dropVictim(i);
        continue;
      }

      slot.exposure += dt * strength;
      // Pushed every frame rather than once: this is also what carries the
      // live editor colours onto the body.
      const stained = dummy.corrode(saturate(slot.exposure * Math.max(0, c.stain)), c.look);

      if (dummy.alive) {
        if (slot.exposure < c.killTime) continue;
        _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (dummy.kill(_dir.x, _dir.z, this._force)) slot.killed = true;
        continue;
      }

      if (stained < 1) continue;
      slot.eaten = Math.min(1, slot.eaten + Math.max(0, c.rot) * dt);
      dummy.consume(slot.eaten);
      if (slot.eaten >= 1) this._dropVictim(i);
    }
  }

  _victimOf(dummy) {
    for (let i = 0; i < this._victimCount; i++) {
      if (this._victims[i].dummy === dummy) return this._victims[i];
    }
    return null;
  }

  /** Release one body, keeping the live slots packed at the front. */
  _dropVictim(index) {
    const last = this._victimCount - 1;
    const slot = this._victims[index];
    slot.dummy = null;
    if (index !== last) {
      this._victims[index] = this._victims[last];
      this._victims[last] = slot;
    }
    this._victimCount = last;
  }

  _clearVictims() {
    for (const slot of this._victims) {
      slot.dummy = null;
      slot.exposure = 0;
      slot.eaten = 0;
      slot.killed = false;
    }
    this._victimCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.spore;
    const g = settings.global;
    this._sync();
    this._placePod();
    this.position.y = this.pod.position.y;
    this._updateMushrooms(dt, false);
    this.ground.visible = false;

    const count = Math.round(this.trailEmitter.tick(dt, c.podTrailRate) * g.particleCount);
    if (count > 0) {
      _emit.position = this.pod.position;
      _emit.radius = c.podSize * 0.8;
      _emit.direction = _dir.copy(this.direction).negate().setY(0.3).normalize();
      _emit.speed = 0.6;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.05;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLifetime * 0.5;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(count, _emit);
    }
  }

  onImpact() {
    const c = settings.spore;
    const g = settings.global;
    this._clock = 0;
    this.pod.visible = false;
    this.pointAt(1, _centre);

    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius * 0.9,
      life: 1.4,
      intensity: 0.8,
      colorA: getColor(c.colorLandC),
      colorB: getColor(c.colorLandB)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * 1.1,
      life: 0.7,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorLandB),
      colorB: getColor(c.colorLandA)
    });

    _pos.copy(_centre).setY(0.3);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.2,
      endRadius: c.landBurst * g.explosionIntensity,
      life: 0.6,
      intensity: 1.4,
      opacity: 0.6,
      squash: 0.45,
      colorA: getColor(c.colorLandA),
      colorB: getColor(c.colorLandB),
      colorC: getColor(c.colorLandC)
    });

    // The pod splits: a ring of spores along the floor and a column of motes.
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = c.puffSpeed * 2.2;
    _emit.speedVariance = 0.7;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.6;
    _emit.life = c.moteLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(Math.round(70 * g.particleCount), _emit);

    _emit.speed = c.puffSpeed * 1.5;
    _emit.size = 0.8;
    _emit.life = c.smokeLifetime * 0.8;
    _emit.spin = 0.4;
    this.smoke.emit(Math.round(14 * g.particleCount), _emit);

    this.ctx.shake.add(c.landShake * g.explosionIntensity * g.cameraShake, 5, 16);
    this.ctx.flash.trigger(getColor(c.colorLandA), c.landFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * 1.2 * g.explosionIntensity;
  }

  onFade(dt) {
    const c = settings.spore;
    const g = settings.global;
    const fading = this.phase === AbilityPhase.FADE;

    this._clock = fading ? this.impactDuration + this.fadeTime : this.impactTime;
    const fadeT = fading ? saturate(this.fadeTime / this.fadeDuration) : 0;

    this._sync();
    this._updateMushrooms(dt, !fading);
    this._updateGround(Easing.inQuad(fadeT), 1 - Easing.inCubic(fadeT));

    const cloud = fading ? 1 - fadeT : 1;
    if (this._cloud > 0) this._driftFx(dt, c, g, cloud);
    this._hits(dt, cloud);

    // The light sits in the bloom and breathes with it.
    this.pointAt(1, this.position);
    this.position.y = c.lightHeight;
  }

  onDestroy() {
    this._count = 0;
    this._clock = -1;
    this._cloud = 0;
    this.mushrooms.count = 0;
    this.pod.visible = false;
    this.ground.visible = false;
    this.groundMaterial.uniforms.uFade.value = 0;
    this._clearVictims();
  }

  dispose() {
    this.mushroomGeometry.dispose();
    this.mushrooms.dispose();
    this.mushroomMaterial.userData.depth.dispose();
    this.mushroomMaterial.dispose();
    this.podGeometry.dispose();
    this.podMaterial.dispose();
    this.groundGeometry.dispose();
    this.groundMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('✿  Spore Bloom');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'lob speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.5, 15, 0.05, 'bloom stands for');
  R(cast, c, 'wiltTime', 0.2, 6, 0.05, 'wilts over');
  R(cast, c, 'wiltStagger', 0, 0.9, 0.01, 'wilt stagger');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const pod = folder.addFolder('1 · Seed pod');
  R(pod, c, 'podSize', 0.05, 1, 0.01, 'radius (m)');
  R(pod, c, 'podStretch', 0.5, 3, 0.01, 'stretch');
  R(pod, c, 'podArc', 0, 10, 0.05, 'arc height (m)');
  R(pod, c, 'podLaunch', 0, 3, 0.05, 'launch height (m)');
  R(pod, c, 'podSpin', 0, 30, 0.1, 'spin (rad/s)');
  R(pod, c, 'podGlow', 0, 8, 0.05, 'vein glow');
  R(pod, c, 'podVeinScale', 0.5, 10, 0.05, 'vein scale');
  R(pod, c, 'podPulse', 0, 20, 0.1, 'pulse speed');
  R(pod, c, 'podTrailRate', 0, 400, 1, 'trail motes / s');
  pod.addColor(c, 'colorPodHusk').name('husk');
  pod.addColor(c, 'colorPodVein').name('veins');
  pod.addColor(c, 'colorPodHot').name('veins, hot');
  R(pod, c, 'landShake', 0, 1, 0.01, 'landing shake');
  R(pod, c, 'landFlash', 0, 1, 0.01, 'landing flash');
  R(pod, c, 'landBurst', 0.1, 6, 0.05, 'landing shell (m)');
  pod.addColor(c, 'colorLandA').name('landing, bright');
  pod.addColor(c, 'colorLandB').name('landing, body');
  pod.addColor(c, 'colorLandC').name('landing, dark');

  const veins = folder.addFolder('2 · Mycelium');
  R(veins, c, 'veinSpeed', 0.2, 15, 0.05, 'spread speed (m/s)');
  R(veins, c, 'veinScale', 0.2, 5, 0.01, 'cells per metre');
  R(veins, c, 'veinWarp', 0, 2, 0.01, 'warp');
  R(veins, c, 'veinWidth', 0.005, 0.3, 0.001, 'vein width (m)');
  R(veins, c, 'veinTaper', 0, 0.95, 0.01, 'taper to the rim');
  R(veins, c, 'veinRadial', 0, 1.5, 0.01, 'runners');
  R(veins, c, 'veinSpokes', 1, 32, 1, 'runner count');
  R(veins, c, 'veinGlow', 0, 10, 0.05, 'glow');
  R(veins, c, 'veinNodes', 0, 3, 0.01, 'junction knots');
  R(veins, c, 'veinPulse', 0, 5, 0.01, 'pulse brightness');
  R(veins, c, 'veinPulseFreq', 0.05, 4, 0.01, 'pulses per metre');
  R(veins, c, 'veinPulseSpeed', -5, 10, 0.05, 'pulse speed (m/s)');
  R(veins, c, 'veinPulseSharp', 0.5, 20, 0.1, 'pulse sharpness');
  R(veins, c, 'veinFront', 0, 6, 0.05, 'growing edge');
  R(veins, c, 'veinMoss', 0, 1, 0.01, 'moss stain');
  R(veins, c, 'veinCore', 0, 4, 0.05, 'heart');
  R(veins, c, 'veinCoreSize', 0, 1, 0.01, 'heart size (× circle)');
  R(veins, c, 'veinDim', 0, 1, 0.01, 'dims while wilting');
  R(veins, c, 'veinOpacity', 0, 1, 0.01, 'opacity');
  veins.addColor(c, 'colorVein').name('veins');
  veins.addColor(c, 'colorVeinHot').name('pulses');
  veins.addColor(c, 'colorVeinDeep').name('deep');
  veins.addColor(c, 'colorMoss').name('moss');

  const mush = folder.addFolder('3 · Mushrooms');
  R(mush, c, 'clusters', 1, MAX_CLUSTERS, 1, 'clumps');
  R(mush, c, 'perCluster', 1, MAX_PER_CLUSTER, 1, 'per clump');
  R(mush, c, 'clusterSpread', 0, 1.2, 0.01, 'clump spread (× circle)');
  R(mush, c, 'clusterRadius', 0, 2, 0.01, 'clump radius (m)');
  mush.add(c, 'clusterCentre').name('clump on the impact');
  R(mush, c, 'stemHeight', 0.05, 2.5, 0.01, 'stem height (m)');
  R(mush, c, 'stemRadius', 0.005, 0.3, 0.001, 'stem radius (m)');
  R(mush, c, 'capRadius', 0.02, 1.2, 0.005, 'cap radius (m)');
  R(mush, c, 'capHeight', 0.01, 0.8, 0.005, 'cap height (m)');
  R(mush, c, 'sizeJitter', 0, 0.9, 0.01, 'size jitter');
  R(mush, c, 'heroScale', 0.5, 4, 0.05, 'hero scale');
  R(mush, c, 'growTime', 0.05, 3, 0.01, 'grow time');
  R(mush, c, 'growStagger', 0, 3, 0.01, 'grow stagger');
  R(mush, c, 'growOvershoot', 0, 0.6, 0.01, 'cap overshoot');
  R(mush, c, 'capTilt', 0, 1.2, 0.01, 'lean out of clump (rad)');
  R(mush, c, 'sway', 0, 0.3, 0.001, 'sway (m)');
  R(mush, c, 'swaySpeed', 0, 8, 0.05, 'sway speed');
  R(mush, c, 'droop', 0, 1.5, 0.01, 'wilt droop');
  R(mush, c, 'wiltLean', 0, 1.5, 0.01, 'wilt bow');
  R(mush, c, 'sinkDepth', 0, 3, 0.01, 'sink depth (m)');
  R(mush, c, 'roughness', 0, 1, 0.01, 'roughness');

  const look = mush.addFolder('Glow');
  R(look, c, 'capGlow', 0, 4, 0.01, 'cap glow');
  R(look, c, 'spotGlow', 0, 8, 0.05, 'spot glow');
  R(look, c, 'spotScale', 0.5, 12, 0.05, 'spot scale');
  R(look, c, 'spotSize', 0.05, 1, 0.01, 'spot size');
  R(look, c, 'rimGlow', 0, 8, 0.05, 'rim glow');
  R(look, c, 'rimPower', 0.5, 8, 0.05, 'rim power');
  R(look, c, 'gillGlow', 0, 10, 0.05, 'gill glow');
  R(look, c, 'gillCount', 4, 64, 1, 'gills');
  R(look, c, 'stemGlow', 0, 4, 0.01, 'stem glow');
  R(look, c, 'glowPulse', 0, 1, 0.01, 'breathing');
  R(look, c, 'glowPulseSpeed', 0, 10, 0.05, 'breathing speed');
  R(look, c, 'puffFlash', 0, 8, 0.05, 'puff flash');
  look.addColor(c, 'colorCap').name('cap');
  look.addColor(c, 'colorCapTop').name('cap crown');
  look.addColor(c, 'colorSpot').name('spots');
  look.addColor(c, 'colorRim').name('rim');
  look.addColor(c, 'colorGill').name('gills');
  look.addColor(c, 'colorStem').name('stem');
  look.addColor(c, 'colorStemGlow').name('stem glow');

  const cloud = folder.addFolder('4 · Spore cloud');
  R(cloud, c, 'puffDelay', 0, 3, 0.01, 'first puff after open');
  R(cloud, c, 'puffJitter', 0, 2, 0.01, 'puff jitter');
  R(cloud, c, 'puffInterval', 0.1, 5, 0.05, 'puff interval');
  R(cloud, c, 'puffSmoke', 0, 40, 1, 'smoke per puff');
  R(cloud, c, 'puffMotes', 0, 120, 1, 'spores per puff');
  R(cloud, c, 'puffSpeed', 0, 6, 0.05, 'puff speed');
  R(cloud, c, 'driftRate', 0, 300, 1, 'drifting spores / s');
  R(cloud, c, 'smokeSize', 0.05, 3, 0.01, 'smoke size');
  R(cloud, c, 'smokeSpread', 0.5, 8, 0.05, 'smoke end size');
  R(cloud, c, 'smokeLifetime', 0.2, 8, 0.05, 'smoke lifetime');
  R(cloud, c, 'smokeRise', -1, 2, 0.01, 'smoke rise');
  R(cloud, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  R(cloud, c, 'smokeTurbulence', 0, 3, 0.01, 'smoke turbulence');
  Editor.gradient(cloud, c, 'colorSmoke', 'smoke colour');
  R(cloud, c, 'moteSize', 0.005, 0.3, 0.001, 'spore size');
  R(cloud, c, 'moteLifetime', 0.2, 8, 0.05, 'spore lifetime');
  R(cloud, c, 'moteRise', -1, 2, 0.01, 'spore rise');
  R(cloud, c, 'moteTurbulence', 0, 5, 0.01, 'spore curl');
  R(cloud, c, 'moteGlow', 0, 8, 0.05, 'spore glow');
  Editor.gradient(cloud, c, 'colorMote', 'spore colour');

  const hits = folder.addFolder('5 · Corrosion');
  R(hits, c, 'cloudReach', 0.1, 2, 0.01, 'cloud reach (× circle)');
  R(hits, c, 'killTime', 0, 5, 0.05, 'exposure to drop (s)');
  R(hits, c, 'stain', 0, 6, 0.05, 'stain speed');
  R(hits, c, 'rot', 0, 3, 0.01, 'rot speed');
  R(hits, c, 'hitImpulse', 0, 10, 0.05, 'fall impulse');
  R(hits, c, 'hitLift', 0, 10, 0.05, 'fall lift');
  R(hits, c, 'hitSpin', 0, 5, 0.05, 'fall spin');
  hits.addColor(c.look, 'color').name('flesh');
  hits.addColor(c.look, 'rimColor').name('rim');
  R(hits, c.look, 'rimEmissive', 0, 6, 0.05, 'rim emissive');
  hits.addColor(c.look, 'edgeColor').name('burn edge');
  R(hits, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge emissive');
  R(hits, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 6, 0.05, 'height (m)');
  R(light, c, 'lightPulse', 0, 1, 0.01, 'breathing');
}
