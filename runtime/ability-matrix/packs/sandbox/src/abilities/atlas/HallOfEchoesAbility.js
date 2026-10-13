import {
  AnimationMixer,
  InstancedBufferAttribute,
  InstancedMesh,
  LoopRepeat,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createEchoBeamMaterial,
  createEchoDaisMaterial,
  createEchoHoloMaterial,
  createEchoMirrorMaterial,
  createEchoWarpMaterial
} from '../../materials/atlas/HallOfEchoesMaterials.js';
import {
  createEchoBeamGeometry,
  createEchoDaisGeometry,
  createMirrorShardGeometry
} from '../../assets/atlas/HallOfEchoesGeometry.js';
import { CasterDouble } from '../../assets/atlas/ChronoRecallRig.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'echoes';

/** Holographic copies. The concept is a trio; the swap choreography assumes it. */
const COPIES = 3;
/** Mirror shards one copy breaks into. The editor's count slider clamps to this. */
const MAX_PER_COPY = 48;
/** Shard silhouettes, so the cloud is not one shape rotated. */
const VARIANTS = 2;
const MAX_SHARDS = COPIES * MAX_PER_COPY;
const PER_VARIANT = MAX_SHARDS / VARIANTS;
const TAU = Math.PI * 2;

const _emit = {};
const _force = { impulse: 0, lift: 0, spin: 0 };
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _node = new Object3D();
const _nodes = new Vector3();
/** Reused by `DummyField#findTargets`. */
const _targets = [];
const _used = new Int32Array(VARIANTS);

/**
 * HALL OF ECHOES — Illusion, zone cast.
 *
 * A projector circle unfurls on the floor of the zone and three holographic
 * copies of the caster are *printed* into the air over its emitter nodes —
 * slice by slice from the feet up, each slice sliding in from the side behind
 * a hot build line — and stand there breathing on the caster's own idle,
 * orbiting the centre. Halfway through, they **swap**: each one cuts straight
 * through the middle to the opposite side of the ring, staggered so they
 * thread past each other, glitching hard as they cross. Then the illusion
 * breaks: each copy **shatters** into faceted mirror that flies outward,
 * reflecting the stage, and every shard that reaches a body takes it down.
 *
 * ## Layers
 *
 *   1. **HOLOGRAMS** (`createEchoHoloMaterial`) — the real rig, cloned with
 *      `SkeletonUtils.clone` (see `CasterDouble`), each with its own
 *      `AnimationMixer` playing the caster's idle at its own phase and pace.
 *      Additive projected light: scanlines crawling up the body, fresnel rim
 *      with a chromatic fringe, horizontal tears that jump on a quantised
 *      clock (spiking during the swap and before the shatter), pixel dropout,
 *      flicker, and the assemble-from-slices build. If the rig has not loaded
 *      the copies fall back to a lathe silhouette and simply stand.
 *   2. **DAIS** (`createEchoDaisMaterial`) — the projector circle: bezel
 *      rings, the orbit track, a segmented ring turning against the orbit, a
 *      hex lattice, a radial scan, and three emitter nodes with spokes that
 *      follow the copies round — including through the swap.
 *   3. **PROJECTOR BEAMS** (`createEchoBeamMaterial`) — a cone of banded
 *      light from each node up into its copy, blazing while it is printed and
 *      idling after.
 *   4. **MIRROR SHARDS** (`createEchoMirrorMaterial`) — instanced, two
 *      silhouettes, faceted pyramids of mirror reflecting `frame.uEnvMap`,
 *      silvered rims and a glint as each facet turns to the light. Integrated
 *      on the CPU: thrown outward from the centre, tumbling, falling,
 *      skittering on the floor, fading.
 *   5. **PIXELS** — soft additive motes boiling off the copies while they
 *      are printed and wherever they cross.
 *   6. **GLITTER** — streaks at the shatter and at every kill.
 *   7. **CRACKED LENS** (LAYER.DISTORTION) — a voronoi-paned warp running out
 *      from the centre at the shatter: the frame itself looks broken.
 *   8. **IMPACT** — AIR shell, SHOCKWAVE decal, flash, shake and a light punch
 *      at the shatter; a SHOCKWAVE as the dais unfurls.
 *
 * ## Hits
 *
 * `handlesOwnHits`: the zone itself is harmless — the illusion is. Bodies
 * die only when a mirror shard reaches them: once per frame the live bodies
 * within `shardReach` of the centre are gathered, and every lethal shard
 * (younger than `shardLethalTime`, below head height) is tested against them.
 * The body is thrown along the shard's flight.
 *
 * ## Clean-up
 *
 * `onDestroy` hides the copies, beams, dais, shards and lens, and stops every
 * mixer; nothing touches the real character.
 *
 * ## The editor rule
 *
 * Shard records carry their flight (they are simulated) and dice; the copies
 * carry only an assembly clock. Every metre, second and colour is read from
 * `settings.echoes` per frame.
 */
export class HallOfEchoesAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = 0;
    for (const mesh of this.shardMeshes) n += mesh.count;
    for (const copy of this.copies) if (copy.double.root.visible) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 2: the dais ---- */
    this.daisGeometry = createEchoDaisGeometry();
    this.daisMaterial = createEchoDaisMaterial();
    this.dais = new Mesh(this.daisGeometry, this.daisMaterial);
    this.dais.name = 'EchoDais';
    this.dais.layers.set(LAYER.VFX);
    this.dais.frustumCulled = false;
    this.dais.renderOrder = 4;
    this.dais.visible = false;
    this.group.add(this.dais);
    this._daisState = { size: 6, reveal: 0, fade: 1, orbit: 0.7, nodes: _nodes, pulse: 0 };

    /* ---- layers 1 & 3: the copies and their beams ---- */
    this.beamGeometry = createEchoBeamGeometry();
    this.copies = [];
    for (let i = 0; i < COPIES; i++) {
      const material = createEchoHoloMaterial();
      const double = new CasterDouble(material, `EchoCopy${i}`);
      double.bind(this.ctx.character);
      this.group.add(double.root);

      const beamMaterial = createEchoBeamMaterial();
      const beam = new Mesh(this.beamGeometry, beamMaterial);
      beam.name = `EchoBeam${i}`;
      beam.layers.set(LAYER.VFX);
      beam.frustumCulled = false;
      beam.renderOrder = 11;
      beam.visible = false;
      this.group.add(beam);

      const copy = {
        double,
        material,
        beam,
        beamMaterial,
        mixer: null,
        action: null,
        assembled: false,
        crossed: false,
        shattered: false,
        seed: 0,
        angle: 0, // where on the orbit it stands this frame
        base: new Vector3(),
        state: {
          base: new Vector3(),
          side: new Vector3(1, 0, 0),
          assemble: 0,
          glitch: 0,
          fade: 1,
          flash: 0,
          seed: 0,
          height: 1.78
        },
        beamState: { strength: 0, seed: 0 }
      };
      this._buildMixer(copy);
      this.copies.push(copy);
    }

    /* ---- layer 4: the mirror shards ---- */
    this.shardGeometries = [];
    this.shardMeshes = [];
    this.shardAttrs = [];
    this.mirrorMaterial = createEchoMirrorMaterial();
    for (let v = 0; v < VARIANTS; v++) {
      const geometry = createMirrorShardGeometry(3 + v * 5, 5 + v, 0.09);
      const attr = new InstancedBufferAttribute(new Float32Array(PER_VARIANT * 3), 3);
      geometry.setAttribute('aShard', attr);
      const mesh = new InstancedMesh(geometry, this.mirrorMaterial, PER_VARIANT);
      mesh.name = `EchoShards${v}`;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      mesh.count = 0;
      this.group.add(mesh);
      this.shardGeometries.push(geometry);
      this.shardMeshes.push(mesh);
      this.shardAttrs.push(attr);
    }
    this.shards = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.shards.push({
        alive: false,
        variant: i % VARIANTS,
        born: 0,
        pos: new Vector3(),
        vel: new Vector3(),
        axis: new Vector3(0, 1, 0),
        rot: new Quaternion(),
        spin: 0,
        size: 1,
        glint: 0
      });
    }

    /* ---- layer 7: the cracked lens ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.warpMaterial = createEchoWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);
    this._warpState = { size: 1, strength: 0, front: 0.5, width: 0.08, seed: 0 };

    this._centre = new Vector3();
    this._hall = -1; // seconds since impact, in settings time (÷ global lifetime)
    this._orbit = 0;
    this._shatterAge = -1;
    this._seed = 0;
    this._daisStamped = false;
  }

  /** An idle loop on the copy's own skeleton, if the caster has one to lend. */
  _buildMixer(copy) {
    copy.mixer?.stopAllAction();
    copy.mixer = null;
    copy.action = null;
    const clip = this.ctx.character?.idle?.getClip?.() ?? null;
    if (!clip || !copy.double.skinned) return;
    copy.mixer = new AnimationMixer(copy.double.model);
    copy.action = copy.mixer.clipAction(clip);
    copy.action.setLoop(LoopRepeat, Infinity);
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 5: pixels ---- */
    this.pixels = particles.get('echoes.pixels', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.pixels.uniforms.uDrag.value = 2.0;
    this.pixels.uniforms.uEndSize.value = 0.2;
    this.pixels.uniforms.uSizeIn.value = 0.05;
    this.pixels.uniforms.uFadeIn.value = 0.05;
    this.pixels.uniforms.uFadeOut.value = 0.5;

    /* ---- layer 6: glitter ---- */
    this.glitter = particles.get('echoes.glitter', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.glitter.uniforms.uDrag.value = 1.8;
    this.glitter.uniforms.uEndSize.value = 0.25;
    this.glitter.uniforms.uSizeIn.value = 0.02;
    this.glitter.uniforms.uFadeIn.value = 0.02;
    this.glitter.uniforms.uFadeOut.value = 0.6;

    this.pixelEmitter = new RateEmitter();
    this.travelEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The hall stands for `lifetime`, then the last copy breaks. */
  get impactDuration() {
    const c = settings.echoes;
    return Math.max(0.1, (c.lifetime + c.shatterStagger * (COPIES - 1) + 0.05) * settings.global.lifetime);
  }

  /** The mirror's flight. */
  get fadeDuration() {
    return Math.max(0.1, settings.echoes.shardLife * settings.global.lifetime);
  }

  /** Projected light: mostly steady, with the hologram's stutter. */
  lightShimmer() {
    const tick = Math.floor(this.age * 14);
    const r = Math.sin(tick * 91.7) * 43758.5;
    return 0.88 + 0.12 * (r - Math.floor(r));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._hall = -1;
    this._orbit = Math.random() * TAU;
    this._shatterAge = -1;
    this._daisStamped = false;
    this.pixelEmitter.reset();
    this.travelEmitter.reset();
    this.pointAt(1, this._centre);

    for (const copy of this.copies) {
      // Upgrades a fallback silhouette to the real rig if it has loaded since.
      if (copy.double.bind(this.ctx.character)) this._buildMixer(copy);
      copy.assembled = false;
      copy.crossed = false;
      copy.shattered = false;
      copy.seed = Math.random();
      copy.double.root.visible = false;
      copy.beam.visible = false;
      if (copy.action) {
        copy.action.reset().play();
        copy.action.time = Math.random() * copy.action.getClip().duration;
        copy.action.setEffectiveTimeScale(0.9 + Math.random() * 0.2);
      } else {
        // No clip to play: hold whatever the caster is doing right now.
        copy.double.copyPose();
      }
    }
    for (const shard of this.shards) shard.alive = false;
    for (const mesh of this.shardMeshes) mesh.count = 0;
    this.dais.visible = false;
    this.warp.visible = false;
    this._sync();
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.echoes;
    const g = settings.global;
    this.mirrorMaterial.userData.sync();

    this.pixels.setGradient(getColor(c.colorPixelA), getColor(c.colorPixelB), getColor(c.colorPixelC), getColor(c.colorPixelD));
    this.pixels.uniforms.uGravity.value.set(0, c.pixelRise, 0);
    this.pixels.uniforms.uSizeScale.value = c.pixelSize * g.particleSize * 7;
    this.pixels.uniforms.uLifeScale.value = g.particleLifetime;
    this.pixels.uniforms.uSpeedScale.value = g.particleSpeed;
    this.pixels.uniforms.uOpacity.value = g.opacity;
    this.pixels.uniforms.uGlow.value = c.pixelGlow * g.glow;
    this.pixels.uniforms.uTurbulence.value = 0.6 * g.turbulence;

    this.glitter.setGradient(getColor(c.colorGlitterA), getColor(c.colorGlitterB), getColor(c.colorGlitterC), getColor(c.colorGlitterD));
    this.glitter.uniforms.uGravity.value.set(0, -3, 0);
    this.glitter.uniforms.uSizeScale.value = c.glitterSize * g.particleSize * 7;
    this.glitter.uniforms.uLifeScale.value = g.particleLifetime;
    this.glitter.uniforms.uSpeedScale.value = g.particleSpeed;
    this.glitter.uniforms.uOpacity.value = g.opacity;
    this.glitter.uniforms.uGlow.value = c.glitterGlow * g.glow;
    this.glitter.uniforms.uStretch.value = c.glitterStretch;
    this.glitter.uniforms.uTurbulence.value = 0.3 * g.turbulence;
  }

  /** A point on the orbit at angle `a`, on the floor. */
  _orbitPoint(a, out) {
    const r = settings.echoes.zoneRadius * settings.echoes.orbitScale;
    return out.set(this._centre.x + Math.cos(a) * r, 0, this._centre.z + Math.sin(a) * r);
  }

  /** Place, pose and shade the three copies. */
  _updateCopies(dt) {
    const c = settings.echoes;
    const g = settings.global;
    const tau = this._hall;
    this._orbit += c.orbitSpeed * g.animationSpeed * dt;

    for (let i = 0; i < COPIES; i++) {
      const copy = this.copies[i];
      const double = copy.double;
      const slot = this._orbit + (i / COPIES) * TAU;

      /* --- the swap: straight through the middle to the opposite side --- */
      const sw = saturate((tau - c.swapAt - i * c.swapStagger) / Math.max(0.02, c.swapTime));
      const k = Easing.inOutCubic(sw);
      this._orbitPoint(slot, _a);
      this._orbitPoint(slot + Math.PI, _b);
      _pos.lerpVectors(_a, _b, k);
      // Bowed off the diameter, each to its own side, so three copies crossing
      // the same point at nearly the same time thread past one another.
      _dir.subVectors(_b, _a).setY(0);
      const len = _dir.length();
      if (len > 1e-4) _dir.multiplyScalar(1 / len);
      _pos.x += -_dir.z * Math.sin(sw * Math.PI) * c.swapBow * (i - 1);
      _pos.z += _dir.x * Math.sin(sw * Math.PI) * c.swapBow * (i - 1);
      copy.angle = Math.atan2(_pos.z - this._centre.z, _pos.x - this._centre.x);
      copy.base.copy(_pos);

      if (!copy.crossed && sw >= 0.5) {
        copy.crossed = true;
        _a.copy(_pos).setY(double.height * 0.5);
        this._emitPixels(_a, Math.round(c.swapPixels * g.particleCount), c.pixelSpeed * 2);
      }

      /* --- facing: outward from the centre, turned by `faceTurn`; into the move while swapping --- */
      const outward = Math.atan2(_pos.x - this._centre.x, _pos.z - this._centre.z) + c.faceTurn;
      const moving = Math.atan2(_dir.x, _dir.z);
      const swapping = Math.sin(sw * Math.PI);
      double.root.position.copy(_pos);
      double.setFacing(lerpAngle(outward, moving, swapping));

      /* --- printed into the air --- */
      const start = c.assembleDelay + i * c.assembleStagger;
      const as = saturate((tau - start) / Math.max(0.02, c.assembleTime));
      if (!copy.assembled && as >= 1) {
        copy.assembled = true;
        copy.state.flash = 1;
        this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.assembleLight);
        this.ctx.shake.add(c.assembleShake * g.cameraShake, 10, 18);
      }
      copy.state.flash = Math.max(0, copy.state.flash - dt / Math.max(0.02, c.assembleFlashTime));

      /* --- glitch: idle, spiking through the swap and before the break --- */
      const pre = smoothstep(c.lifetime - c.preShatter, c.lifetime + i * c.shatterStagger, tau);
      const glitch = c.glitchIdle + c.glitchSwap * swapping + c.glitchShatter * pre;

      const visible = tau >= start && !copy.shattered;
      double.root.visible = visible;
      if (copy.mixer && visible) copy.mixer.update(dt * g.animationSpeed);

      const st = copy.state;
      st.base.copy(_pos);
      st.side.set(-Math.sin(copy.angle), 0, Math.cos(copy.angle));
      st.assemble = as;
      st.glitch = glitch;
      st.fade = 1;
      st.seed = copy.seed * 31 + this._seed;
      st.height = double.height;
      copy.material.userData.sync(st);

      /* --- the beam: blazes while printing, idles after --- */
      const printing = as > 0 && as < 1 ? 1 : 0;
      const beamOn = visible ? lerp(c.beamIdle, 1, Math.max(printing, Math.sin(as * Math.PI))) + swapping * 0.5 : 0;
      copy.beamState.strength = beamOn;
      copy.beamState.seed = copy.seed * 17;
      copy.beamMaterial.userData.sync(copy.beamState);
      copy.beam.visible = beamOn > 0.003;
      copy.beam.position.copy(_pos).setY(0.01);
      copy.beam.scale.set(c.beamRadius, double.height * c.beamHeight, c.beamRadius);

      /* --- pixels boiling off a copy as it prints --- */
      if (printing) {
        const n = Math.round(this.pixelEmitter.tick(dt, c.pixelRate) * g.particleCount);
        if (n > 0) {
          _a.copy(_pos).setY(double.height * as);
          this._emitPixels(_a, n, c.pixelSpeed);
        }
      }

      /* --- the break --- */
      if (!copy.shattered && tau >= c.lifetime + i * c.shatterStagger) this._shatter(copy, i);
    }

    // The dais's emitter nodes follow the copies. The dais quad's local x/z
    // run along world x/z, so a copy's world angle is its node angle as is.
    const daisR = c.zoneRadius * c.daisScale;
    _nodes.set(this.copies[0].angle, this.copies[1].angle, this.copies[2].angle);
    this._daisState.orbit = saturate((c.zoneRadius * c.orbitScale) / Math.max(0.01, daisR));
  }

  _emitPixels(at, count, speed) {
    const c = settings.echoes;
    _emit.position = at;
    _emit.radius = 0.35;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = speed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.6;
    _emit.life = c.pixelLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.pixels.emit(count, _emit);
  }

  /** One copy breaks into mirror. */
  _shatter(copy, index) {
    const c = settings.echoes;
    const g = settings.global;
    copy.shattered = true;
    copy.double.root.visible = false;
    copy.beam.visible = false;
    copy.mixer?.stopAllAction();
    if (this._shatterAge < 0) this._shatterAge = 0;

    /* --- the shards, from points on the body, thrown outward --- */
    copy.double.root.updateMatrixWorld(true);
    const count = Math.min(MAX_PER_COPY, Math.max(0, Math.round(c.shardCount * g.particleCount)));
    const time = this.age;
    for (let n = 0; n < count; n++) {
      const shard = this.shards[index * MAX_PER_COPY + n];
      shard.alive = true;
      shard.born = time;
      copy.double.bodyPoint(shard.pos, Math.random());
      shard.pos.x += randRange(-0.12, 0.12);
      shard.pos.y = Math.max(0.1, shard.pos.y + randRange(-0.1, 0.1));
      shard.pos.z += randRange(-0.12, 0.12);
      _dir.set(shard.pos.x - this._centre.x, 0, shard.pos.z - this._centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(Math.cos(copy.angle), 0, Math.sin(copy.angle));
      _dir.normalize();
      // Spread in a fan about the outward direction.
      const fan = randRange(-1, 1) * c.shardSpread * g.randomness;
      const cs = Math.cos(fan);
      const sn = Math.sin(fan);
      const dx = _dir.x * cs - _dir.z * sn;
      const dz = _dir.x * sn + _dir.z * cs;
      const speed = c.shardSpeed * randRange(0.6, 1.4);
      shard.vel.set(dx * speed, c.shardLift * randRange(0.2, 1.2), dz * speed);
      shard.axis.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
      if (shard.axis.lengthSq() < 1e-4) shard.axis.set(0, 1, 0);
      shard.axis.normalize();
      shard.rot.set(Math.random(), Math.random(), Math.random(), Math.random()).normalize();
      shard.spin = randRange(0.5, 1.5);
      shard.size = randRange(0.55, 1.45);
      shard.glint = 0;
    }

    /* --- the crack itself --- */
    _a.copy(copy.base).setY(copy.double.height * 0.55);
    _emit.position = _a;
    _emit.radius = 0.4;
    _emit.direction = _dir.set(Math.cos(copy.angle), 0.3, Math.sin(copy.angle)).normalize();
    _emit.speed = c.glitterSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.7;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.09;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glitterLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glitter.emit(Math.round(c.shatterGlitter * g.particleCount), _emit);
    this._emitPixels(_a, Math.round(c.shatterPixels * g.particleCount), c.pixelSpeed * 2.5);

    this.ctx.bursts.spawn(BurstMode.AIR, _a, {
      radius: 0.2,
      endRadius: c.burstRadius * g.explosionIntensity,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: 0.6,
      fresnel: 2.2 * g.fresnel,
      squash: 0.85,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    if (index === 0) {
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
        radius: c.zoneRadius * c.shatterRingScale * g.explosionIntensity,
        life: c.shatterRingLife,
        width: 0.06,
        intensity: 1.1,
        colorA: getColor(c.colorHoloRim),
        colorB: getColor(c.colorMirrorEdge)
      });
      this.ctx.flash.trigger(getColor(c.colorFlash), c.shatterFlash * g.explosionIntensity);
    }
    this.ctx.shake.add(c.shatterShake * g.explosionIntensity * g.cameraShake, 1 / Math.max(0.05, c.shakeDuration), 24);
    this.lightBoost = c.lightIntensity * c.lightBoost * g.explosionIntensity;
  }

  /** Fly every live shard, kill what they reach, write the instances. */
  _updateShards(dt) {
    const c = settings.echoes;
    const g = settings.global;
    const life = Math.max(0.05, c.shardLife * g.lifetime);
    const gravity = c.shardGravity;
    const drag = Math.exp(-c.shardDrag * dt);
    const lethal = c.shardLethalTime;

    // The bodies that could possibly be reached this frame, gathered once.
    const field = this.ctx.dummies;
    let candidates = 0;
    if (field?.findTargets && this._shatterAge >= 0) {
      field.findTargets(this._centre.x, this._centre.z, c.shardReach, _targets);
      candidates = _targets.length;
    }
    const bodyR = settings.dummies?.bodyRadius ?? 0.3;
    const reach = c.shardHitRadius + bodyR;
    const reach2 = reach * reach;
    _force.impulse = c.hitImpulse;
    _force.lift = c.hitLift;
    _force.spin = c.hitSpin;

    _used[0] = 0;
    _used[1] = 0;
    const L = frame.uLightDir.value;

    for (const shard of this.shards) {
      if (!shard.alive) continue;
      const age = this.age - shard.born;
      const t = age / life;
      if (t >= 1) {
        shard.alive = false;
        continue;
      }

      /* --- flight --- */
      shard.vel.multiplyScalar(drag);
      shard.vel.y -= gravity * dt;
      shard.pos.addScaledVector(shard.vel, dt);
      const floor = 0.04 * shard.size;
      if (shard.pos.y < floor) {
        shard.pos.y = floor;
        if (shard.vel.y < 0) shard.vel.y *= -c.shardBounce;
        shard.vel.x *= c.shardFriction;
        shard.vel.z *= c.shardFriction;
      }
      const speed = shard.vel.length();
      _q.setFromAxisAngle(shard.axis, shard.spin * speed * c.shardTumble * dt);
      shard.rot.premultiply(_q);

      /* --- the cut --- */
      if (candidates && age < lethal && shard.pos.y < 2.2) {
        for (let k = 0; k < candidates; k++) {
          const dummy = _targets[k];
          if (!dummy.alive) continue;
          const dx = dummy.position.x - shard.pos.x;
          const dz = dummy.position.z - shard.pos.z;
          if (dx * dx + dz * dz > reach2) continue;
          _dir.set(shard.vel.x, 0, shard.vel.z);
          if (_dir.lengthSq() < 1e-6) _dir.set(dx, 0, dz);
          _dir.normalize();
          if (dummy.kill(_dir.x, _dir.z, _force)) this._hitBurst(dummy);
        }
      }

      /* --- a glint as a facet turns to the sun --- */
      _a.set(0, 0, 1).applyQuaternion(shard.rot);
      shard.glint = Math.pow(Math.abs(_a.dot(L)), 24);

      const v = shard.variant;
      const slot = _used[v]++;
      _node.position.copy(shard.pos);
      _node.quaternion.copy(shard.rot);
      const shrink = 1 - Easing.inCubic(saturate((t - 0.7) / 0.3));
      _node.scale.setScalar(Math.max(0.0001, c.shardSize * shard.size * shrink));
      _node.updateMatrix();
      this.shardMeshes[v].setMatrixAt(slot, _node.matrix);
      const data = this.shardAttrs[v].array;
      data[slot * 3] = 1 - smoothstep(0.75, 1, t);
      data[slot * 3 + 1] = shard.glint;
      data[slot * 3 + 2] = shard.size;
    }

    for (let v = 0; v < VARIANTS; v++) {
      const mesh = this.shardMeshes[v];
      mesh.count = _used[v];
      mesh.instanceMatrix.needsUpdate = true;
      this.shardAttrs[v].needsUpdate = true;
    }
  }

  _hitBurst(dummy) {
    const c = settings.echoes;
    const g = settings.global;
    dummy.bodyPoint ? dummy.bodyPoint(_b) : _b.copy(dummy.position).setY(1);
    _emit.position = _b;
    _emit.radius = 0.25;
    _emit.direction = _dir;
    _emit.speed = c.glitterSpeed * 0.8;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glitterLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glitter.emit(Math.round(c.hitGlitter * g.particleCount), _emit);
    this.ctx.shake.add(c.hitShake * g.cameraShake, 9, 20);
  }

  _updateDais(fade) {
    const c = settings.echoes;
    const st = this._daisState;
    st.size = c.zoneRadius * c.daisScale * 2;
    st.reveal = Easing.outCubic(saturate(this._hall / Math.max(0.02, c.daisTime)));
    st.fade = fade;
    st.pulse = this._shatterAge >= 0 ? Math.max(0, 1 - this._shatterAge * 3) : 0;
    this.daisMaterial.userData.sync(st);
    this.dais.position.copy(this._centre).setY(c.daisLift);
    this.dais.visible = this._hall >= 0 && fade > 0.001;
  }

  _updateWarp() {
    const c = settings.echoes;
    if (this._shatterAge < 0) {
      this.warp.visible = false;
      return;
    }
    const t = saturate(this._shatterAge / Math.max(0.02, c.warpTime));
    const st = this._warpState;
    st.size = c.zoneRadius * c.warpScale * 2;
    st.strength = c.warpStrength * (1 - t) * smoothstep(0, 0.06, t);
    st.front = lerp(0.1, 0.95, Easing.outCubic(t));
    st.width = c.warpWidth;
    st.seed = this._seed;
    this.warpMaterial.userData.sync(st);
    this.warp.position.copy(this._centre).setY(c.warpHeight);
    this.warp.visible = t < 1;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.echoes;
    const g = settings.global;
    this._sync();
    // A thread of projected light from the caster to the zone.
    const n = Math.round(this.travelEmitter.tick(dt, c.travelPixels) * g.particleCount);
    if (n > 0) {
      _a.copy(this.position).setY(c.travelHeight);
      this._emitPixels(_a, n, c.pixelSpeed * 0.5);
    }
    this.position.y = c.travelHeight;
  }

  onImpact() {
    const c = settings.echoes;
    const g = settings.global;
    this._hall = 0;
    this.pointAt(1, this._centre);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
      radius: c.zoneRadius * c.daisScale,
      life: c.daisRingLife,
      width: 0.05,
      intensity: 0.9,
      colorA: getColor(c.colorDais),
      colorB: getColor(c.colorHoloRim)
    });
    this.ctx.shake.add(c.daisShake * g.cameraShake, 10, 18);
    this.lightBoost = c.lightIntensity * c.assembleLight;
  }

  onFade(dt) {
    const c = settings.echoes;
    const g = settings.global;
    this._sync();
    this._hall += dt / Math.max(0.01, g.lifetime);
    if (this._shatterAge >= 0) this._shatterAge += dt;

    this._updateCopies(dt);
    this._updateShards(dt);
    const fade = this.phase === AbilityPhase.FADE ? 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration)) : 1;
    this._updateDais(fade);
    this._updateWarp();

    this.position.copy(this._centre);
    this.position.y = c.travelHeight;
  }

  onDestroy() {
    for (const copy of this.copies) {
      copy.mixer?.stopAllAction();
      copy.double.root.visible = false;
      copy.beam.visible = false;
    }
    for (const shard of this.shards) shard.alive = false;
    for (const mesh of this.shardMeshes) mesh.count = 0;
    this.dais.visible = false;
    this.warp.visible = false;
    this._hall = -1;
    this._shatterAge = -1;
  }

  dispose() {
    this.daisGeometry.dispose();
    this.daisMaterial.dispose();
    this.beamGeometry.dispose();
    for (const copy of this.copies) {
      copy.mixer?.stopAllAction();
      copy.double.dispose();
      copy.material.dispose();
      copy.beamMaterial.dispose();
    }
    for (const geometry of this.shardGeometries) geometry.dispose();
    for (const mesh of this.shardMeshes) mesh.dispose();
    this.mirrorMaterial.dispose();
    this.warpGeometry.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/** Shortest-way blend between two headings. */
function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⟁  Hall of Echoes');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 0.5, 8, 0.05, 'zone radius (m)');
  R(cast, c, 'speed', 2, 120, 0.5, 'projection speed (m/s)');
  R(cast, c, 'lifetime', 0.5, 8, 0.01, 'hall stands for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'travelHeight', 0, 3, 0.01, 'thread height (m)');
  R(cast, c, 'travelPixels', 0, 600, 1, 'thread pixels (/s)');
  Editor.castAnimation(cast, c);

  const orbit = folder.addFolder('Orbit & swap');
  R(orbit, c, 'orbitScale', 0.1, 1.2, 0.01, 'orbit (× zone)');
  R(orbit, c, 'orbitSpeed', -4, 4, 0.01, 'orbit speed (rad/s)');
  R(orbit, c, 'faceTurn', -3.15, 3.15, 0.01, 'facing (0 = outward)');
  R(orbit, c, 'swapAt', 0, 6, 0.01, 'swap at (s)');
  R(orbit, c, 'swapTime', 0.05, 3, 0.01, 'swap takes (s)');
  R(orbit, c, 'swapStagger', 0, 1, 0.01, 'swap stagger (s)');
  R(orbit, c, 'swapBow', 0, 2, 0.01, 'swap bow (m)');
  R(orbit, c, 'swapPixels', 0, 200, 1, 'crossing pixels');

  const holo = folder.addFolder('1 · Holograms');
  R(holo, c, 'assembleDelay', 0, 2, 0.01, 'first print at (s)');
  R(holo, c, 'assembleStagger', 0, 1.5, 0.01, 'stagger (s)');
  R(holo, c, 'assembleTime', 0.05, 3, 0.01, 'print takes (s)');
  R(holo, c, 'holoSlices', 1, 80, 1, 'slices');
  R(holo, c, 'holoSlideIn', 0, 3, 0.01, 'slide in (m)');
  R(holo, c, 'buildGlow', 0, 10, 0.05, 'build line glow');
  R(holo, c, 'assembleFlashTime', 0.02, 1.5, 0.01, 'printed flash (s)');
  R(holo, c, 'assembleShake', 0, 0.5, 0.005, 'printed shake');
  R(holo, c, 'assembleLight', 0, 4, 0.05, 'printed light (× intensity)');
  R(holo, c, 'holoOpacity', 0, 1, 0.01, 'opacity');
  R(holo, c, 'holoGlow', 0, 8, 0.05, 'glow');
  R(holo, c, 'holoFill', 0, 2, 0.01, 'fill');
  R(holo, c, 'holoFresnel', 0, 6, 0.05, 'rim');
  R(holo, c, 'holoFresnelPower', 0.5, 8, 0.05, 'rim power');
  R(holo, c, 'holoFringe', 0, 1, 0.01, 'chromatic fringe');
  R(holo, c, 'scanDensity', 0, 200, 1, 'scanlines per metre');
  R(holo, c, 'scanSpeed', -20, 20, 0.1, 'scan speed');
  R(holo, c, 'scanStrength', 0, 1, 0.01, 'scan strength');
  R(holo, c, 'holoDropout', 0, 1, 0.01, 'pixel dropout');
  R(holo, c, 'holoFlicker', 0, 1, 0.01, 'flicker');
  holo.addColor(c, 'colorHoloLow').name('feet');
  holo.addColor(c, 'colorHoloHigh').name('head');
  holo.addColor(c, 'colorHoloRim').name('rim');
  holo.addColor(c, 'colorBuild').name('build line');

  const glitch = folder.addFolder('Glitch');
  R(glitch, c, 'glitchIdle', 0, 1, 0.01, 'idle');
  R(glitch, c, 'glitchSwap', 0, 1, 0.01, 'while swapping');
  R(glitch, c, 'glitchShatter', 0, 1, 0.01, 'before the break');
  R(glitch, c, 'preShatter', 0, 2, 0.01, 'ramps over (s)');
  R(glitch, c, 'glitchBands', 1, 60, 1, 'bands');
  R(glitch, c, 'glitchRate', 0, 60, 0.5, 'rate (Hz)');
  R(glitch, c, 'glitchShift', 0, 0.5, 0.005, 'tear (m)');

  const dais = folder.addFolder('2 · Dais');
  R(dais, c, 'daisScale', 0.3, 2, 0.01, 'radius (× zone)');
  R(dais, c, 'daisLift', 0, 0.2, 0.005, 'lift (m)');
  R(dais, c, 'daisTime', 0.02, 2, 0.01, 'unfurl (s)');
  R(dais, c, 'daisGlow', 0, 8, 0.05, 'glow');
  R(dais, c, 'daisOpacity', 0, 1, 0.01, 'opacity');
  R(dais, c, 'daisNodeGlow', 0, 8, 0.05, 'node glow');
  R(dais, c, 'daisSpin', -4, 4, 0.01, 'ring spin');
  R(dais, c, 'daisHex', 0, 2, 0.01, 'lattice');
  R(dais, c, 'daisSweep', -4, 4, 0.01, 'scan sweep');
  R(dais, c, 'daisRingLife', 0.05, 3, 0.01, 'unfurl ring life');
  R(dais, c, 'daisShake', 0, 0.5, 0.005, 'unfurl shake');
  dais.addColor(c, 'colorDais').name('dais');

  const beam = folder.addFolder('3 · Projector beams');
  R(beam, c, 'beamRadius', 0.05, 2, 0.01, 'top radius (m)');
  R(beam, c, 'beamHeight', 0.2, 2, 0.01, 'height (× body)');
  R(beam, c, 'beamIdle', 0, 1, 0.01, 'idle strength');
  R(beam, c, 'beamBands', 0, 80, 0.5, 'bands');
  R(beam, c, 'beamSpeed', -20, 20, 0.1, 'band speed');
  R(beam, c, 'beamGlow', 0, 8, 0.05, 'glow');
  R(beam, c, 'beamOpacity', 0, 1, 0.01, 'opacity');
  beam.addColor(c, 'colorBeam').name('beam');

  const mirror = folder.addFolder('4 · Mirror shards');
  R(mirror, c, 'shatterStagger', 0, 1, 0.01, 'copies break apart by (s)');
  R(mirror, c, 'shardCount', 0, MAX_PER_COPY, 1, 'shards per copy');
  R(mirror, c, 'shardSize', 0.02, 1, 0.005, 'size (m)');
  R(mirror, c, 'shardLife', 0.1, 5, 0.01, 'life (s)');
  R(mirror, c, 'shardSpeed', 0, 30, 0.1, 'speed (m/s)');
  R(mirror, c, 'shardLift', 0, 15, 0.1, 'lift (m/s)');
  R(mirror, c, 'shardSpread', 0, 1.5, 0.01, 'fan (rad)');
  R(mirror, c, 'shardGravity', 0, 30, 0.1, 'gravity');
  R(mirror, c, 'shardDrag', 0, 5, 0.01, 'drag');
  R(mirror, c, 'shardBounce', 0, 1, 0.01, 'bounce');
  R(mirror, c, 'shardFriction', 0, 1, 0.01, 'floor grip (1 = slide)');
  R(mirror, c, 'shardTumble', 0, 10, 0.05, 'tumble');
  R(mirror, c, 'mirrorReflect', 0, 3, 0.01, 'reflection');
  R(mirror, c, 'mirrorFresnel', 0, 4, 0.05, 'fresnel');
  R(mirror, c, 'mirrorTint', 0, 2, 0.01, 'hologram tint');
  R(mirror, c, 'mirrorEdgeGlow', 0, 8, 0.05, 'silvered edge');
  R(mirror, c, 'mirrorGlint', 0, 4, 0.05, 'glint');
  R(mirror, c, 'mirrorGlow', 0, 4, 0.05, 'brightness');
  R(mirror, c, 'mirrorOpacity', 0, 1, 0.01, 'opacity');
  mirror.addColor(c, 'colorMirror').name('mirror');
  mirror.addColor(c, 'colorMirrorEdge').name('edge');

  const hits = folder.addFolder('Hits (shards)');
  R(hits, c, 'shardReach', 0.5, 30, 0.1, 'max reach from centre (m)');
  R(hits, c, 'shardHitRadius', 0.05, 2, 0.01, 'shard reach (m)');
  R(hits, c, 'shardLethalTime', 0, 5, 0.01, 'lethal for (s)');
  R(hits, c, 'hitImpulse', 0, 20, 0.1, 'impulse (m/s)');
  R(hits, c, 'hitLift', 0, 12, 0.1, 'lift (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hits, c, 'hitGlitter', 0, 120, 1, 'glitter');
  R(hits, c, 'hitShake', 0, 1, 0.01, 'shake');

  const px = folder.addFolder('5 · Pixels');
  R(px, c, 'pixelRate', 0, 1000, 1, 'while printing (/s)');
  R(px, c, 'pixelSize', 0.01, 0.4, 0.005, 'size');
  R(px, c, 'pixelSpeed', 0, 10, 0.05, 'speed');
  R(px, c, 'pixelLifetime', 0.05, 3, 0.01, 'lifetime');
  R(px, c, 'pixelRise', -3, 3, 0.05, 'rise');
  R(px, c, 'pixelGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(px, c, 'colorPixel', 'pixel colour');

  const gl = folder.addFolder('6 · Glitter');
  R(gl, c, 'shatterGlitter', 0, 300, 1, 'per copy');
  R(gl, c, 'shatterPixels', 0, 300, 1, 'pixels per copy');
  R(gl, c, 'glitterSize', 0.01, 0.4, 0.005, 'size');
  R(gl, c, 'glitterSpeed', 0, 20, 0.1, 'speed');
  R(gl, c, 'glitterLifetime', 0.05, 3, 0.01, 'lifetime');
  R(gl, c, 'glitterStretch', 0, 2, 0.01, 'stretch');
  R(gl, c, 'glitterGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(gl, c, 'colorGlitter', 'glitter colour');

  const warp = folder.addFolder('7 · Cracked lens');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpScale', 0.2, 4, 0.01, 'size (× zone)');
  R(warp, c, 'warpHeight', 0, 3, 0.01, 'height (m)');
  R(warp, c, 'warpTime', 0.05, 2, 0.01, 'time');
  R(warp, c, 'warpWidth', 0.005, 0.5, 0.005, 'front width');
  R(warp, c, 'warpCells', 1, 16, 0.1, 'panes');

  const impact = folder.addFolder('8 · The break');
  R(impact, c, 'burstRadius', 0.1, 8, 0.05, 'pressure shell (m)');
  R(impact, c, 'burstLife', 0.05, 2, 0.01, 'shell life');
  R(impact, c, 'burstIntensity', 0, 6, 0.05, 'shell intensity');
  impact.addColor(c, 'colorBurstA').name('shell core');
  impact.addColor(c, 'colorBurstB').name('shell body');
  impact.addColor(c, 'colorBurstC').name('shell edge');
  R(impact, c, 'shatterRingScale', 0, 4, 0.05, 'shock ring (× zone)');
  R(impact, c, 'shatterRingLife', 0.05, 3, 0.01, 'ring life');
  R(impact, c, 'shatterShake', 0, 1.5, 0.01, 'shake');
  R(impact, c, 'shakeDuration', 0.05, 2, 0.01, 'shake settles over');
  R(impact, c, 'shatterFlash', 0, 1, 0.01, 'flash');
  impact.addColor(c, 'colorFlash').name('flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightBoost', 0, 6, 0.05, 'break punch (× intensity)');
}
