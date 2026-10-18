import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createPrismCrystalGeometry,
  createPrismShardGeometry,
  createPrismTetherGeometry,
  createPrismStripGeometry
} from '../../assets/codex/PrismLieGeometry.js';
import {
  createPrismCrystalMaterial,
  createPrismShardMaterial,
  createPrismTetherMaterial,
  createPrismTrailMaterial,
  createPrismRingMaterial,
  createPrismLensMaterial
} from '../../materials/codex/PrismLieMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'prismlie';

/** Three prisms — the concept is a trio; the braid's phases assume it. */
const PRISMS = 3;
/** Hard ceiling on glass in the air. The editor's count sliders clamp to it. */
const MAX_SHARDS = 96;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _axis = new Vector3();
const _scale = new Vector3();
const _q = new Quaternion();
const _qSpin = new Quaternion();
const _qLean = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);
const COLOR_KEYS = ['colorPrismA', 'colorPrismB', 'colorPrismC'];

/** Push one particle system's gradient and the globals through. */
function syncSystem(p, a, b, cc, d, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/** A clean emit record — every field set, so nothing leaks between emitters. */
function resetEmit() {
  _emit.position = _pos;
  _emit.radius = 0;
  _emit.direction = _up;
  _emit.speed = 0;
  _emit.speedVariance = 0.4;
  _emit.spread = 0.5;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = frame.uTime.value;
}

/**
 * PRISM LIE — Arcane, line cast.
 *
 * A shell game played with light. One white crystal forms in the caster's
 * hand and **splits into three** — cyan, magenta, gold — that fan out as they
 * leave and fly down the line **braided round each other**: each on the same
 * sine, a third of a turn apart, so they keep trading places like cups in a
 * con. They spin, bob, shed glitter in their own hue, and **stutter** —
 * slices of each crystal jump sideways on a quantised clock — while
 * crackling threads of light tie the three together and three braided
 * streaks burn into the floor behind them. They *disagree*.
 *
 * At the end of the line comes **the reveal**. Two of them are lies: they
 * swerve off the line to either side, carry on past the end, glitch harder
 * and harder and **pop** into glitter and a few slivers of their colour. The
 * true one (`truth`, or a coin toss) swings onto the line, drops onto the
 * target, flares white — and **shatters**: a spray of spectral glass, a
 * rainbow shock ring racing across the floor, a lens of bent air, a shell, a
 * shock decal, a flash, a jolt. The lies' trails go out at the reveal; the
 * truth's trail stays lit, then all of it burns out.
 *
 * ## Layers
 *
 *   1. **the prisms** (`createPrismCrystalGeometry` +
 *      `createPrismCrystalMaterial`, one material each) — additive faceted
 *      glass: hue body, view-sliding thin-film sheen, dispersion bands, hot
 *      arrises, rim, glitch slices in the vertex stage, a spectral dissolve.
 *   2. **tethers** (`createPrismTetherMaterial`) — three threads between the
 *      prisms, re-jagged every frame.
 *   3. **trails** (`createPrismTrailMaterial`) — the braid on the floor,
 *      drawn from the same formula the prisms fly on (`_braidLat` ↔
 *      `braidLat`), white where strands cross.
 *   4. **glitter** (SOFT, additive, tinted per prism) and **sparks**
 *      (STREAK) — shed in flight, burst at the pops and the shatter.
 *   5. **shards** (`createPrismShardGeometry` + `createPrismShardMaterial`)
 *      — an InstancedMesh of slivers, CPU-integrated, tinted per piece.
 *   6. **the shatter** — spectral ring (`createPrismRingMaterial`), lens
 *      (`createPrismLensMaterial`, `LAYER.DISTORTION`), an AIR burst, a
 *      SHOCKWAVE decal, flash, shake, light punch.
 *
 * Hits are the engine's: the line kills what the front passes.
 *
 * ## The editor rule
 *
 * A cast captures a seed, which prism is true, and per-prism stutter
 * timers; a shard record holds its own flight. Every size, distance, time
 * and colour is resolved from `settings.prismlie` every frame.
 */
export class PrismLieAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** Glass in the air. HUD readout only. */
  get instanceCount() {
    return this._liveShards;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the prisms ---- */
    this.crystalGeometry = null;
    this._cap = -1;
    this._crystalGeometry();
    this.prisms = [];
    for (let i = 0; i < PRISMS; i++) {
      const material = createPrismCrystalMaterial();
      const mesh = this._mesh(this.crystalGeometry, material, LAYER.VFX, 12 + i);
      this.prisms.push({
        mesh,
        material,
        pos: new Vector3(),
        spin: 0,
        glitch: 0, // decaying stutter
        nextStutter: 0,
        popped: false,
        dissolve: 0,
        flash: 0,
        state: { color: COLOR_KEYS[i], glitch: 0, flash: 0, dissolve: 0, opacity: 1, seed: 0 }
      });
    }

    /* ---- layer 2: tethers ---- */
    this.tetherGeometry = createPrismTetherGeometry(32);
    this.tetherMaterial = createPrismTetherMaterial();
    this.tether = this._mesh(this.tetherGeometry, this.tetherMaterial, LAYER.VFX, 11);

    /* ---- layer 3: trails ---- */
    this.stripGeometry = createPrismStripGeometry(200, 8);
    this.trailMaterial = createPrismTrailMaterial();
    this.trail = this._mesh(this.stripGeometry, this.trailMaterial, LAYER.VFX, 2);

    /* ---- layer 5: shards ---- */
    this.shardGeometry = createPrismShardGeometry();
    this.shardAttr = new InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 4), 4);
    this.shardAttr.setUsage(DynamicDrawUsage);
    this.shardGeometry.setAttribute('aShard', this.shardAttr);
    this.shardMaterial = createPrismShardMaterial();
    this.shards = new InstancedMesh(this.shardGeometry, this.shardMaterial, MAX_SHARDS);
    this.shards.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shards.layers.set(LAYER.VFX);
    this.shards.renderOrder = 15;
    this.shards.frustumCulled = false;
    this.shards.visible = false;
    this.group.add(this.shards);
    this.glass = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.glass.push({
        alive: false,
        pos: new Vector3(),
        vel: new Vector3(),
        axis: new Vector3(0, 1, 0),
        angle: 0,
        spin: 0,
        size: 1,
        age: 0,
        life: 1,
        hue: 0 // 0..2 a prism's colour, 3 white
      });
    }
    this._liveShards = 0;
    this._shardCursor = 0;

    /* ---- layer 6: ring and lens ---- */
    this.ringGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.ringMaterial = createPrismRingMaterial();
    this.ring = this._mesh(this.ringGeometry, this.ringMaterial, LAYER.VFX, 3);
    this.lensMaterial = createPrismLensMaterial();
    this.lens = this._mesh(this.ringGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._tetherState = { p0: new Vector3(), p1: new Vector3(), p2: new Vector3(), strength: 1 };
    this._trailState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      front: 0,
      fade: 0,
      truth: 0,
      reveal: 0
    };
    this._ringState = { centre: new Vector3(), progress: 1, seed: 0 };
    this._lensState = { centre: new Vector3(), progress: 1 };

    this._seed = 0;
    this._truth = 0;
    this._clock = -1;
    this._shattered = false;
    this._shatterAt = -1;
    this._end = new Vector3();
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

    this.glitter = particles.get('prismlie.glitter', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.glitter.uniforms.uDrag.value = 1.6;
    this.glitter.uniforms.uEndSize.value = 0.2;
    this.glitter.uniforms.uSizeIn.value = 0.05;
    this.glitter.uniforms.uFadeIn.value = 0.05;
    this.glitter.uniforms.uFadeOut.value = 0.5;

    this.sparks = particles.get('prismlie.sparks', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uDrag.value = 2;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.glitterEmitters = [new RateEmitter(), new RateEmitter(), new RateEmitter()];
  }

  /** The crystal, rebuilt only when the cap slider moves. */
  _crystalGeometry() {
    const cap = Math.max(0.02, settings[ID].prismCap);
    if (this.crystalGeometry && cap === this._cap) return this.crystalGeometry;
    this._cap = cap;
    const old = this.crystalGeometry;
    this.crystalGeometry = createPrismCrystalGeometry(cap);
    if (this.prisms) for (let i = 0; i < this.prisms.length; i++) this.prisms[i].mesh.geometry = this.crystalGeometry;
    old?.dispose();
    return this.crystalGeometry;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _revealTime() {
    return Math.max(0.05, settings[ID].revealTime * settings.global.lifetime);
  }

  get impactDuration() {
    const c = settings[ID];
    return this._revealTime() + Math.max(0.05, c.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.05, settings[ID].trailFade * settings.global.lifetime);
  }

  /** Glass glints rather than glows. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 23.1) * Math.sin(this.age * 7.7));
  }

  /* ------------------------------------------------------------------ */
  /* The braid on the CPU                                                */
  /* ------------------------------------------------------------------ */

  /** Lateral offset of prism `i` at `d` metres down the line. The CPU twin of `braidLat`. */
  _braidLat(d, i) {
    const c = settings[ID];
    const env = smoothstep(0, Math.max(0.01, c.braidRamp), d);
    return c.braidWidth * env * Math.sin((TAU * d) / Math.max(0.1, c.braidPitch) + i * (TAU / 3));
  }

  /** Where prism `i` flies when the front is `d` metres out. */
  _flightPos(i, d, out) {
    const c = settings[ID];
    const t = frame.uTime.value;
    out.copy(this.origin).addScaledVector(this.direction, d).addScaledVector(this.side, this._braidLat(d, i));
    // Rises out of the hand to flight height over the first metres.
    const lift = smoothstep(0, 2, d);
    out.y = lerp(1.3, c.flightHeight, lift) + c.bob * Math.sin(t * c.bobSpeed + i * 2.1) * lift;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this._seed = Math.random() * 100;
    const forced = Math.round(c.truth);
    this._truth = forced >= 0 && forced < PRISMS ? forced : (Math.random() * PRISMS) | 0;
    this._clock = -1;
    this._shattered = false;
    this._shatterAt = -1;
    this._crystalGeometry();

    for (let i = 0; i < PRISMS; i++) {
      const p = this.prisms[i];
      p.spin = Math.random() * TAU;
      p.glitch = 0;
      p.nextStutter = Math.random() * 0.3;
      p.popped = false;
      p.dissolve = 0;
      p.flash = 0;
      p.state.seed = this._seed + i * 7.3;
      p.mesh.visible = true;
      this.glitterEmitters[i].reset();
    }
    for (let i = 0; i < MAX_SHARDS; i++) this.glass[i].alive = false;
    for (let i = 0; i < MAX_SHARDS; i++) this.shards.setMatrixAt(i, _zero);
    this.shards.instanceMatrix.needsUpdate = true;
    this._liveShards = 0;
    this._shardCursor = 0;
    this.shards.visible = false;
    this.tether.visible = true;
    this.trail.visible = true;
    this.ring.visible = false;
    this.lens.visible = false;
    this._ringState.seed = this._seed;
    this.pointAt(1, this._end);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Place and pose every prism, from the flight or the reveal. */
  _updatePrisms(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._crystalGeometry();
    const reveal = this._clock >= 0;
    const k = reveal ? saturate(this._clock / this._revealTime()) : 0;
    const grow = Easing.outBack(saturate(this.age / Math.max(0.02, c.growTime)));
    // Out of one: the three start stacked and fan apart over `growTime`.
    const split = smoothstep(0, Math.max(0.02, c.growTime) * 1.5, this.age);
    this.pointAt(1, this._end);

    for (let i = 0; i < PRISMS; i++) {
      const p = this.prisms[i];
      const isTrue = i === this._truth;
      const d = reveal ? this.length : this.front;
      this._flightPos(i, d, p.pos);
      if (!reveal) {
        // Fanning out of the hand: pull toward the shared centreline early on.
        _pos.copy(this.origin).addScaledVector(this.direction, d);
        p.pos.x = lerp(_pos.x, p.pos.x, split);
        p.pos.z = lerp(_pos.z, p.pos.z, split);
      }

      /* --- the stutter --- */
      p.nextStutter -= dt;
      if (p.nextStutter <= 0) {
        p.glitch = 1;
        p.nextStutter = (0.3 + Math.random()) / Math.max(0.05, c.glitchRate * g.randomness);
      }
      p.glitch = Math.max(0, p.glitch - dt * 9);
      let glitch = c.glitch + c.glitchSpike * p.glitch;

      let spinRate = c.spinSpeed * (i === 1 ? -1 : 1);
      let scale = grow;
      p.flash = 0;

      /* --- the reveal --- */
      if (reveal) {
        if (isTrue) {
          // Onto the line, down onto the target, spinning up, flaring.
          const e = Easing.inOutCubic(k);
          p.pos.x = lerp(p.pos.x, this._end.x, e);
          p.pos.z = lerp(p.pos.z, this._end.z, e);
          const standY = c.prismHeight * (0.5 + c.prismCap) + 0.05;
          p.pos.y = lerp(p.pos.y, standY, Easing.inQuad(k));
          spinRate *= 1 + 4 * k;
          p.flash = c.plantFlash * smoothstep(0.55, 1, k) * g.glow;
          if (this._shattered) scale = 0;
        } else {
          // Swerve off to its own side and carry on past the end.
          const lat = this._braidLat(this.length, i);
          const other = this._braidLat(this.length, 3 - i - this._truth);
          const sign = lat === other ? (i < this._truth ? -1 : 1) : lat > other ? 1 : -1;
          const e = Easing.outCubic(k);
          p.pos.addScaledVector(this.side, sign * c.veerDistance * e).addScaledVector(this.direction, c.veerForward * e);
          p.pos.y += 0.6 * e;
          glitch += c.popGlitch * k * k;
          p.dissolve = smoothstep(0.45, 1, k);
          if (k >= 0.6 && !p.popped) {
            p.popped = true;
            this._popFx(i, p.pos, c, g);
          }
        }
      }

      /* --- pose --- */
      p.spin += spinRate * dt * g.animationSpeed;
      _qSpin.setFromAxisAngle(_up, p.spin);
      _axis.copy(this.side);
      const lean = reveal ? c.lean * (1 - k) : c.lean;
      _qLean.setFromAxisAngle(_axis, lean);
      _q.multiplyQuaternions(_qLean, _qSpin);
      _scale.set(c.prismRadius * scale, c.prismHeight * scale, c.prismRadius * scale);
      p.mesh.position.copy(p.pos);
      p.mesh.quaternion.copy(_q);
      p.mesh.scale.copy(_scale);
      p.mesh.updateMatrix();
      p.mesh.visible = scale > 0.001 && p.dissolve < 0.999;

      const st = p.state;
      st.glitch = glitch * g.noiseStrength;
      st.flash = p.flash;
      st.dissolve = p.dissolve;
      st.opacity = 1;
      p.material.userData.sync(st);

      /* --- glitter in its own hue --- */
      const rate = !reveal ? c.glitterRate : isTrue ? c.glitterRate * 0.5 : c.glitterRate * (1 - k);
      const n = Math.round(this.glitterEmitters[i].tick(dt, rate) * g.particleCount);
      if (n > 0 && p.mesh.visible) {
        resetEmit();
        _emit.position = p.pos;
        _emit.radius = c.prismRadius * 1.2;
        _emit.direction = _dir.copy(this.direction).negate();
        _emit.speed = 1.2;
        _emit.spread = 1;
        _emit.size = c.glitterSize;
        _emit.sizeVariance = 0.6;
        _emit.life = c.glitterLifetime;
        _emit.tint = getColor(c[COLOR_KEYS[i]]);
        this.glitter.emit(n, _emit);
      }
    }

    /* --- the truth breaks --- */
    if (reveal && k >= 1 && !this._shattered) {
      this._shattered = true;
      this._shatterAt = this._clock;
      this._shatterFx(this.prisms[this._truth].pos, c, g);
    }

    /* --- tethers, until the reveal tears them --- */
    const ts = this._tetherState;
    ts.p0.copy(this.prisms[0].pos);
    ts.p1.copy(this.prisms[1].pos);
    ts.p2.copy(this.prisms[2].pos);
    ts.strength = (reveal ? 1 - smoothstep(0, 0.5, k) : 1) * smoothstep(0.05, 0.25, this.age);
    this.tetherMaterial.userData.sync(ts);
    this.tether.visible = ts.strength > 0.001;

    /* the light rides the centroid, then the truth */
    this.position.copy(ts.p0).add(ts.p1).add(ts.p2).multiplyScalar(1 / 3);
    if (reveal) this.position.lerp(this.prisms[this._truth].pos, k);
  }

  _updateTrails() {
    const c = settings[ID];
    const ts = this._trailState;
    ts.start.copy(this.origin);
    ts.dir.copy(this.direction);
    ts.side.copy(this.side);
    ts.length = Math.max(0.5, this.length);
    ts.front = this._clock < 0 ? this.front : this.length;
    ts.truth = this._truth;
    ts.reveal = this._clock < 0 ? 0 : smoothstep(0, 0.6, this._clock / this._revealTime());
    ts.fade = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;
    this.trailMaterial.userData.sync(ts);
    this.trail.visible = ts.fade < 1;
  }

  /** Fly every live shard; write the instances. */
  _updateShards(dt) {
    const c = settings[ID];
    const attr = this.shardAttr.array;
    let live = 0;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const s = this.glass[i];
      const k4 = i * 4;
      if (!s.alive) {
        this.shards.setMatrixAt(i, _zero);
        attr[k4 + 3] = 0;
        continue;
      }
      s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) {
        s.alive = false;
        this.shards.setMatrixAt(i, _zero);
        attr[k4 + 3] = 0;
        continue;
      }
      live++;
      s.vel.y += c.shardGravity * dt;
      s.vel.multiplyScalar(Math.max(0, 1 - 0.6 * dt));
      s.pos.addScaledVector(s.vel, dt);
      // Glass skitters on the floor rather than sinking into it.
      if (s.pos.y < 0.04) {
        s.pos.y = 0.04;
        s.vel.y = Math.abs(s.vel.y) * 0.3;
        s.vel.x *= 0.6;
        s.vel.z *= 0.6;
        s.spin *= 0.6;
      }
      s.angle += s.spin * dt;
      _q.setFromAxisAngle(s.axis, s.angle);
      const size = s.size * (1 - Easing.inCubic(t));
      _scale.set(size * 0.5, size, size * 0.5);
      _m.compose(s.pos, _q, _scale);
      this.shards.setMatrixAt(i, _m);
      const col = getColor(s.hue < 3 ? c[COLOR_KEYS[s.hue]] : c.colorCore);
      attr[k4] = col.r;
      attr[k4 + 1] = col.g;
      attr[k4 + 2] = col.b;
      attr[k4 + 3] = 1 - smoothstep(0.6, 1, t);
    }
    this._liveShards = live;
    this.shards.instanceMatrix.needsUpdate = true;
    this.shardAttr.needsUpdate = true;
    this.shards.visible = live > 0;
    this.shardMaterial.userData.sync();
  }

  /** Throw `count` slivers out of `at`, in hue `hue` (−1 = mixed). */
  _throwShards(at, count, hue, speed, c, g) {
    for (let n = 0; n < count; n++) {
      const s = this.glass[this._shardCursor];
      this._shardCursor = (this._shardCursor + 1) % MAX_SHARDS;
      s.alive = true;
      const a = Math.random() * TAU;
      const up = Math.random();
      s.pos.copy(at);
      s.pos.y += (Math.random() - 0.5) * c.prismHeight * 0.8;
      s.vel.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(speed * (0.4 + 0.6 * Math.random()));
      s.vel.y = c.shardLift * (0.3 + up);
      s.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      s.angle = Math.random() * TAU;
      s.spin = c.shardSpin * (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1);
      s.size = c.shardSize * (0.5 + Math.random() * 0.8);
      s.age = 0;
      s.life = Math.max(0.1, c.lifetime * g.lifetime) * (0.6 + 0.4 * Math.random());
      s.hue = hue >= 0 ? hue : (Math.random() * 4) | 0;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** A lie pops: glitter, a few slivers, a spark spit. */
  _popFx(i, at, c, g) {
    resetEmit();
    _emit.position = at;
    _emit.radius = c.prismRadius;
    _emit.speed = 3;
    _emit.spread = 1;
    _emit.size = c.glitterSize * 1.4;
    _emit.sizeVariance = 0.6;
    _emit.life = c.glitterLifetime;
    _emit.tint = getColor(c[COLOR_KEYS[i]]);
    this.glitter.emit(Math.round(c.glitterBurst * g.particleCount), _emit);
    _emit.tint = null;
    _emit.speed = c.sparkSpeed * 0.5;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * 0.3 * g.particleCount), _emit);
    this._throwShards(at, Math.min(MAX_SHARDS, Math.round(c.falseShards)), i, c.shardSpeed * 0.4, c, g);
    this.ctx.shake.add(0.08 * g.explosionIntensity, 6, 24);
  }

  /** The truth shatters. */
  _shatterFx(at, c, g) {
    const power = g.explosionIntensity;
    _pos.copy(at).setY(0);
    this.ctx.shake.add(c.shatterShake * power, 3.5, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.shatterFlash * power);
    this.lightBoost = c.shatterLight * power;
    this.ctx.bursts.spawn(BurstMode.AIR, _vel.copy(at), {
      radius: 0.2,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.5,
      opacity: 0.8 * g.opacity,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this._ringState.centre.copy(_pos);
    this._lensState.centre.copy(at);

    this._throwShards(at, Math.min(MAX_SHARDS, Math.round(c.shardCount)), -1, c.shardSpeed, c, g);

    resetEmit();
    _emit.position = at;
    _emit.radius = c.prismRadius;
    _emit.speed = c.sparkSpeed;
    _emit.spread = 1;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);
    _emit.speed = 4;
    _emit.size = c.glitterSize * 1.5;
    _emit.life = c.glitterLifetime * 1.4;
    for (let i = 0; i < PRISMS; i++) {
      _emit.tint = getColor(c[COLOR_KEYS[i]]);
      this.glitter.emit(Math.round((c.glitterBurst / 2) * g.particleCount), _emit);
    }
  }

  _updateShatter() {
    const c = settings[ID];
    if (this._shatterAt < 0) {
      this.ring.visible = false;
      this.lens.visible = false;
      return;
    }
    const k = saturate((this._clock - this._shatterAt) / Math.max(0.05, c.ringTime));
    this._ringState.progress = k;
    this.ringMaterial.userData.sync(this._ringState);
    this.ring.visible = k < 1;
    this._lensState.progress = saturate(k * 1.4);
    this.lensMaterial.userData.sync(this._lensState);
    this.lens.visible = this._lensState.progress < 1;
  }

  _syncParticles() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.glitter, c.colorGlitterA, c.colorGlitterB, c.colorGlitterC, c.colorGlitterD, c.glitterGlow * g.glow, 0.7);
    this.glitter.uniforms.uGravity.value.set(0, 0.2, 0);
    syncSystem(this.sparks, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.glitterGlow * g.glow, 0.1);
    this.sparks.uniforms.uGravity.value.set(0, -6, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._syncParticles();
    this._updatePrisms(dt);
    this._updateTrails();
    this._updateShards(dt);
    this._updateShatter();
  }

  onImpact() {
    this._clock = 0;
    // A small jolt as the three arrive and the lie starts to unravel.
    this.ctx.shake.add(0.1 * settings.global.explosionIntensity, 6, 20);
  }

  onFade(dt) {
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._syncParticles();
    this._updatePrisms(dt);
    this._updateTrails();
    this._updateShards(dt);
    this._updateShatter();
  }

  onDestroy() {
    this._clock = -1;
    for (let i = 0; i < PRISMS; i++) this.prisms[i].mesh.visible = false;
    for (let i = 0; i < MAX_SHARDS; i++) this.glass[i].alive = false;
    this._liveShards = 0;
    this.shards.visible = false;
    this.tether.visible = false;
    this.trail.visible = false;
    this.ring.visible = false;
    this.lens.visible = false;
  }

  dispose() {
    this.crystalGeometry?.dispose();
    this.tetherGeometry.dispose();
    this.stripGeometry.dispose();
    this.shardGeometry.dispose();
    this.ringGeometry.dispose();
    for (let i = 0; i < PRISMS; i++) this.prisms[i].material.dispose();
    this.tetherMaterial.dispose();
    this.trailMaterial.dispose();
    this.shardMaterial.dispose();
    this.ringMaterial.dispose();
    this.lensMaterial.dispose();
    this.shards.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◬  Prism Lie');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'flight speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 4, 0.05, 'glass lingers (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'truth', -1, 2, 1, 'true prism (−1 random)');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const prisms = folder.addFolder('1 · Prisms');
  prisms.addColor(c, 'colorPrismA').name('first (cyan)');
  prisms.addColor(c, 'colorPrismB').name('second (magenta)');
  prisms.addColor(c, 'colorPrismC').name('third (gold)');
  prisms.addColor(c, 'colorCore').name('white core');
  R(prisms, c, 'prismHeight', 0.2, 4, 0.01, 'body height (m)');
  R(prisms, c, 'prismRadius', 0.05, 1.5, 0.01, 'radius (m)');
  R(prisms, c, 'prismCap', 0.02, 1.5, 0.01, 'cap (× body)');
  R(prisms, c, 'flightHeight', 0.3, 5, 0.05, 'flight height (m)');
  R(prisms, c, 'bob', 0, 1, 0.01, 'bob (m)');
  R(prisms, c, 'bobSpeed', 0, 20, 0.1, 'bob speed');
  R(prisms, c, 'spinSpeed', 0, 30, 0.1, 'spin (rad/s)');
  R(prisms, c, 'lean', -1, 1, 0.01, 'lean (rad)');
  R(prisms, c, 'growTime', 0.02, 1, 0.01, 'split out of one over');
  const glass = prisms.addFolder('Glass');
  R(glass, c, 'bodyGlow', 0, 4, 0.01, 'body');
  R(glass, c, 'edgeGlow', 0, 12, 0.05, 'edges');
  R(glass, c, 'edgeWidth', 0.005, 0.3, 0.005, 'edge width (× radius)');
  R(glass, c, 'iridescence', 0, 4, 0.01, 'spectral sheen');
  R(glass, c, 'iridFrequency', 0.2, 10, 0.05, 'sheen bands');
  R(glass, c, 'rimGlow', 0, 4, 0.01, 'rim');
  R(glass, c, 'glitch', 0, 0.3, 0.005, 'standing glitch (m)');
  R(glass, c, 'glitchSpike', 0, 1, 0.01, 'stutter (m)');
  R(glass, c, 'glitchRate', 0, 12, 0.1, 'stutters / s');

  const braid = folder.addFolder('2 · Braid');
  R(braid, c, 'braidWidth', 0, 4, 0.01, 'swing (m)');
  R(braid, c, 'braidPitch', 0.5, 15, 0.05, 'swap every (m)');
  R(braid, c, 'braidRamp', 0.01, 8, 0.05, 'fan out over (m)');

  const threads = folder.addFolder('3 · Tethers & trails');
  R(threads, c, 'tetherWidth', 0.005, 0.4, 0.005, 'thread width (m)');
  R(threads, c, 'tetherJitter', 0, 1, 0.01, 'thread crackle (m)');
  R(threads, c, 'tetherGlow', 0, 8, 0.05, 'thread glow');
  R(threads, c, 'trailWidth', 0.01, 0.5, 0.005, 'trail width (m)');
  R(threads, c, 'trailGlow', 0, 6, 0.05, 'trail glow');
  R(threads, c, 'trailDecay', 0.5, 30, 0.1, 'trail dims over (m)');
  R(threads, c, 'trailFade', 0.05, 4, 0.05, 'trail burns out over');

  const reveal = folder.addFolder('4 · The reveal');
  R(reveal, c, 'revealTime', 0.05, 2, 0.01, 'reveal over');
  R(reveal, c, 'veerDistance', 0, 8, 0.05, 'lies swerve (m)');
  R(reveal, c, 'veerForward', 0, 8, 0.05, 'lies overshoot (m)');
  R(reveal, c, 'popGlitch', 0, 2, 0.01, 'lies stutter (m)');
  R(reveal, c, 'plantFlash', 0, 10, 0.05, 'truth flares');

  const shards = folder.addFolder('5 · Shards');
  R(shards, c, 'shardCount', 0, MAX_SHARDS, 1, 'truth breaks into');
  R(shards, c, 'falseShards', 0, 40, 1, 'each lie breaks into');
  R(shards, c, 'shardSize', 0.02, 1.5, 0.01, 'size (m)');
  R(shards, c, 'shardSpeed', 0, 25, 0.1, 'speed');
  R(shards, c, 'shardLift', 0, 12, 0.1, 'lift');
  R(shards, c, 'shardGravity', -30, 0, 0.5, 'gravity');
  R(shards, c, 'shardSpin', 0, 30, 0.1, 'spin');
  R(shards, c, 'shardGlow', 0, 6, 0.05, 'glow');

  const fx = folder.addFolder('6 · Glitter & sparks');
  R(fx, c, 'glitterRate', 0, 400, 1, 'glitter / s / prism');
  R(fx, c, 'glitterSize', 0.01, 0.4, 0.005, 'glitter size');
  R(fx, c, 'glitterLifetime', 0.05, 3, 0.05, 'glitter lifetime');
  R(fx, c, 'glitterGlow', 0, 8, 0.05, 'glitter glow');
  R(fx, c, 'glitterBurst', 0, 300, 1, 'glitter per pop');
  Editor.gradient(fx, c, 'colorGlitter', 'glitter colour');
  R(fx, c, 'sparkCount', 0, 200, 1, 'sparks');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(fx, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  Editor.gradient(fx, c, 'colorSpark', 'spark colour');

  const beat = folder.addFolder('7 · The shatter');
  R(beat, c, 'ringRadius', 0.2, 15, 0.05, 'spectral ring (m)');
  R(beat, c, 'ringWidth', 0.01, 0.5, 0.005, 'ring width');
  R(beat, c, 'ringGlow', 0, 8, 0.05, 'ring glow');
  R(beat, c, 'ringTime', 0.05, 3, 0.01, 'ring over');
  R(beat, c, 'lensSize', 0.2, 10, 0.05, 'air bend (m)');
  R(beat, c, 'lensStrength', 0, 3, 0.01, 'air bend strength');
  R(beat, c, 'burstRadius', 0, 8, 0.05, 'shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, tint');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'shatterShake', 0, 1.5, 0.01, 'shake');
  R(beat, c, 'shatterFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'shatterLight', 0, 80, 0.5, 'light punch');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'glint');
}
