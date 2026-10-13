import { InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createStillpointFloorMaterial,
  createStillpointGlassMaterial,
  createStillpointLensMaterial,
  createStillpointRockMaterial,
  createStillpointShellMaterial
} from '../../materials/atlas/StillpointMaterials.js';
import {
  createGeodesicCageGeometry,
  createGlassSliverGeometry,
  createRockChunkGeometry
} from '../../assets/atlas/StillpointGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'stillpoint';

const TAU = Math.PI * 2;

const MAX_ROCKS = 40;
const MAX_GLASS = 32;
const MAX_PIECES = MAX_ROCKS + MAX_GLASS;
/** Stone and glass silhouettes per mesh, so the field is not one shape rotated. */
const ROCK_VARIANTS = 3;
const GLASS_VARIANTS = 2;
/** Geodesic subdivision levels built up front; `latticeFreq` picks one live. */
const CAGE_LEVELS = 4;
/** Bodies the lattice can hold. */
const MAX_HELD = 10;

const _emit = {};
const _centre = new Vector3();
const _pos = new Vector3();
const _prev = new Vector3();
const _dir = new Vector3();
const _hand = new Vector3();
const _node = new Object3D();
const _up = new Vector3(0, 1, 0);
const _usedRock = new Int32Array(ROCK_VARIANTS);
const _usedGlass = new Int32Array(GLASS_VARIANTS);

/**
 * STILLPOINT — a place where time stops, and then does not.
 *
 * A seed of stillness drifts to the circle on a slow arc. Where it lands a
 * **geodesic lattice** draws itself up out of the floor, face by face, a low
 * violet dome, and the floor under it is ringed with dilation contours
 * creeping inward. Then the floor **tears**: chunks of stone and slivers of
 * glass are flung up out of it — and are *caught*, each decelerating to a dead
 * stop at its own place in the air, cracks glowing with the momentum they
 * still carry. The bodies inside stop mid-breath and go violet. For a while
 * the whole **frozen constellation** turns slowly about the centre, the
 * lattice's shimmer crawling at a fraction of its speed, the image around it
 * dragging. Then a tremble, and **all the stored momentum lets go at once**:
 * every fragment flies outward along its own bearing, the cage flashes and
 * dissolves crown-first, a shockwave and a hard ring of warp go out, and
 * whatever the fragments reach is thrown down.
 *
 * Kept deliberately apart from Chrono Fracture (the other time spell): no
 * clock, no gold, no glass sphere breaking. The cage is a cold geodesic wire;
 * what is held is the floor itself; and the release is the *debris* thrown,
 * not the container shattering.
 *
 * Layers:
 *
 *   1. **the lattice** — a non-indexed icosphere (four subdivision levels
 *      built once) drawn in the fragment stage from barycentrics: edges,
 *      nodes, a film, a slowed shimmer, a floor-up formation and a crown-down
 *      burning dissolve (`createStillpointShellMaterial`); plus a ground
 *      shader of inward-creeping dilation rings, spokes and torn patches.
 *   2. **the debris** — instanced lumpy rock (three variants, opaque,
 *      voronoi cracks glowing with stored momentum) and glass slivers (two
 *      variants, refractive, glowing broken edges). Every piece's whole path —
 *      torn up, caught, held and turned, released — is closed-form in time.
 *   3. **the held bodies** — idle clip paused, stained violet.
 *   4. **particles & impacts** — SMOKE dust torn up with the floor, SOFT
 *      motes hanging frozen, STREAK streaks thrown with the release; CRACK,
 *      DUSTRING, SHOCKWAVE and RIPPLE decals; an AIR burst; flash, shake,
 *      light.
 *   5. **the dilation lens** — LAYER.DISTORTION: a heavy inward drag while
 *      time is held, a hard ring outward at the release.
 *
 * ## The bodies
 *
 * `handlesOwnHits` is true. While time is stopped, live bodies inside the
 * lattice are **held**: their idle clip's *action* is paused (as Chrono
 * Fracture does it — `Dummy#update` rewrites the mixer's time scale every
 * tick, but leaves `action.paused` alone, and `Dummy#place` clears it), and
 * they are stained with `Dummy#corrode`. They are let go at the release, and
 * then — like every other body — die only if a **fragment reaches them**:
 * each frame of the release every fragment's swept segment is tested against
 * every live body within `killReach`, and a body that is touched is thrown
 * along that fragment's flight. A retired cast simply lets its held bodies go.
 *
 * ## The clock and the editor rule
 *
 * One timeline from the landing — form, tear, catch, hold, tremble, release,
 * flight — every event a function of the live settings. Records hold dice
 * (where a piece came from, where it hangs, how it spins) and two snapshots:
 * the constellation's angle at the release and whether it has happened.
 */
export class StillpointAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = 0;
    for (const mesh of this.rockMeshes) n += mesh.count;
    for (const mesh of this.glassMeshes) n += mesh.count;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the lattice ---- */
    this.shellMaterial = createStillpointShellMaterial();
    this.cages = [];
    for (let level = 0; level < CAGE_LEVELS; level++) {
      const mesh = new Mesh(createGeodesicCageGeometry(level + 1), this.shellMaterial);
      mesh.name = `StillpointCage${level + 1}`;
      mesh.layers.set(LAYER.VFX);
      mesh.renderOrder = 12;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.cages.push(mesh);
    }

    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.floorMaterial = createStillpointFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'StillpointFloor';
    this.floor.layers.set(LAYER.VFX);
    this.floor.renderOrder = 5;
    this.floor.frustumCulled = false;
    this.floor.visible = false;
    this.group.add(this.floor);

    /* ---- layer 2: the debris ---- */
    this.rockMaterial = createStillpointRockMaterial();
    this.glassMaterial = createStillpointGlassMaterial();
    this.rockMeshes = [];
    this.rockGlow = [];
    this.glassMeshes = [];
    this.glassGlow = [];
    const rockSlots = Math.ceil(MAX_ROCKS / ROCK_VARIANTS);
    const glassSlots = Math.ceil(MAX_GLASS / GLASS_VARIANTS);
    for (let v = 0; v < ROCK_VARIANTS; v++) {
      const piece = this._pieceMesh(createRockChunkGeometry(2.3 + v * 5.1, 1), this.rockMaterial, rockSlots, 3);
      piece.mesh.name = `StillpointRock${v}`;
      this.rockMeshes.push(piece.mesh);
      this.rockGlow.push(piece.glow);
    }
    for (let v = 0; v < GLASS_VARIANTS; v++) {
      const piece = this._pieceMesh(createGlassSliverGeometry(4.7 + v * 3.3, 0.05), this.glassMaterial, glassSlots, 11);
      piece.mesh.name = `StillpointGlass${v}`;
      this.glassMeshes.push(piece.mesh);
      this.glassGlow.push(piece.glow);
    }

    /* ---- layer 5: the lens ---- */
    this.lensGeometry = new PlaneGeometry(1, 1);
    this.lensMaterial = createStillpointLensMaterial();
    this.lens = new Mesh(this.lensGeometry, this.lensMaterial);
    this.lens.name = 'StillpointLens';
    this.lens.layers.set(LAYER.DISTORTION);
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.group.add(this.lens);

    /* ---- per-cast dice ---- */
    this._pieces = [];
    for (let i = 0; i < MAX_PIECES; i++) {
      this._pieces.push({
        angle: 0, // bearing round the centre it hangs at (and tore up from)
        reach: 0, // 0..1 how far out
        height: 0, // 0..1 how high, between hangMin and hangMax
        lag: 0, // 0..1 when in the tear it leaves the floor
        size: 0, // -1..1 size dice
        speed: 1, // release speed dice
        ax: 0, // spin axis dice
        ay: 0,
        az: 0,
        spin: 0, // initial spin rate dice
        phase: 0 // bob phase
      });
    }

    this._seed = 0;
    /** Seconds since landing; -1 in flight. */
    this._t = -1;
    this._fadeT = 0;
    this._released = false;
    this._tornFired = false;
    /** Integrated constellation angle, and its value at the release. */
    this._spin = 0;
    this._releaseSpin = 0;
    this._cageTurn = 0;
    this._shimmerTime = 0;
    this._ringPhase = 0;
    this._lensPhase = 0;

    this._held = [];
    for (let i = 0; i < MAX_HELD; i++) this._held.push({ dummy: null, time: 0 });
    this._heldCount = 0;
    this._found = [];
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#ffffff', rimEmissive: 1, edgeColor: '#ffffff', edgeEmissive: 1, edgeWidth: 0.12 };

    this._shellState = { seed: 0, form: 0, dissolve: 0, sink: 0, shimmerTime: 0, flash: 0 };
    this._floorState = { quadSize: 8, radius: 3, ringPhase: 0, form: 0, fade: 1, flash: 0, seed: 0 };
    this._lensState = { size: 4, drag: 0, phase: 0, shock: 0, shockAt: 0 };
  }

  /** An InstancedMesh of one debris variant with a per-instance glow. */
  _pieceMesh(geometry, material, slots, order) {
    const glow = new InstancedBufferAttribute(new Float32Array(slots), 1);
    geometry.setAttribute('aGlow', glow);
    const mesh = new InstancedMesh(geometry, material, slots);
    // On VFX rather than WORLD: the rock's lumps are blended in the vertex
    // stage, which the WORLD depth prepass's override material would ignore.
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.group.add(mesh);
    return { mesh, glow };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.dust = particles.get('stillpoint.dust', {
      capacity: 700,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      lit: true,
      softFade: 0.6
    });
    this.dust.uniforms.uDrag.value = 2.6;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;
    this.dust.uniforms.uGravity.value.set(0, 0.25, 0);

    // Motes hanging frozen: almost no velocity, no gravity, heavy drag.
    this.motes = particles.get('stillpoint.motes', {
      capacity: 1000,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 3.0;
    this.motes.uniforms.uEndSize.value = 0.7;
    this.motes.uniforms.uSizeIn.value = 0.3;
    this.motes.uniforms.uFadeIn.value = 0.3;
    this.motes.uniforms.uFadeOut.value = 0.4;
    this.motes.uniforms.uGravity.value.set(0, 0, 0);

    this.streaks = particles.get('stillpoint.streaks', {
      capacity: 2000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.streaks.uniforms.uDrag.value = 1.6;
    this.streaks.uniforms.uEndSize.value = 0.2;
    this.streaks.uniforms.uSizeIn.value = 0.02;
    this.streaks.uniforms.uFadeIn.value = 0.02;
    this.streaks.uniforms.uFadeOut.value = 0.5;
    this.streaks.uniforms.uStretch.value = 0.1;
    this.streaks.uniforms.uGravity.value.set(0, -4, 0);

    this.moteEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* The timeline                                                         */
  /* ------------------------------------------------------------------ */

  _scale() {
    return Math.max(0.05, settings.stillpoint.lifetime * settings.global.lifetime);
  }

  _formTime() {
    return Math.max(0.05, settings.stillpoint.formTime * this._scale());
  }

  /** The floor tears once the lattice is half up. */
  _tearAt() {
    return this._formTime() * 0.5;
  }

  _tearOf(piece) {
    return this._tearAt() + piece.lag * settings.stillpoint.tearStagger * this._scale();
  }

  _catchTime() {
    return Math.max(0.05, settings.stillpoint.catchTime * this._scale());
  }

  /** Every piece is hanging still from here. */
  _holdAt() {
    return this._tearAt() + settings.stillpoint.tearStagger * this._scale() + this._catchTime();
  }

  _releaseAt() {
    return Math.max(this._formTime(), this._holdAt()) + settings.stillpoint.holdTime * this._scale();
  }

  _flightTime() {
    return Math.max(0.1, settings.stillpoint.releaseLife * this._scale());
  }

  get impactDuration() {
    return Math.max(0.2, this._releaseAt() + this._flightTime());
  }

  get fadeDuration() {
    return Math.max(0.1, settings.stillpoint.fadeTime * settings.global.lifetime);
  }

  /** Utterly steady while time is held; a flicker as it lets go. */
  lightShimmer() {
    if (this._released) return 0.9 + 0.1 * Math.sin(this.age * 50);
    return 0.97;
  }

  /* ------------------------------------------------------------------ */
  /* Live dimensions                                                      */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.3, settings.stillpoint.zoneRadius * settings.stillpoint.shellScale);
  }

  get shellHeight() {
    return this.radius * Math.max(0.1, settings.stillpoint.shellSquash);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  get _rocks() {
    return Math.min(MAX_ROCKS, Math.max(0, Math.round(settings.stillpoint.rockCount)));
  }

  get _glass() {
    return Math.min(MAX_GLASS, Math.max(0, Math.round(settings.stillpoint.glassCount)));
  }

  /** Where piece `p` hangs, relative to the centre, before the constellation turns. */
  _hangPoint(p, spin, out) {
    const c = settings.stillpoint;
    const R = this.radius;
    const H = this.shellHeight * (1 - c.shellSink);
    const a = p.angle + spin;
    const r = R * c.hangReach * Math.sqrt(p.reach);
    // Lower toward the rim, so the constellation sits inside the dome.
    const rim = 1 - 0.55 * p.reach;
    const y = H * lerp(c.hangMin, c.hangMax, p.height) * rim;
    return out.set(Math.cos(a) * r, Math.max(0.2, y), Math.sin(a) * r);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._releaseHeld();
    this._seed = Math.random() * 100;
    this._t = -1;
    this._fadeT = 0;
    this._released = false;
    this._tornFired = false;
    this._spin = 0;
    this._releaseSpin = 0;
    this._cageTurn = Math.random() * TAU;
    this._shimmerTime = 0;
    this._ringPhase = 0;
    this._lensPhase = 0;
    for (const p of this._pieces) {
      p.angle = Math.random() * TAU;
      p.reach = Math.random();
      p.height = Math.random();
      p.lag = Math.random();
      p.size = randRange(-1, 1);
      p.speed = randRange(0.7, 1.25);
      p.ax = randRange(-1, 1);
      p.ay = randRange(-1, 1);
      p.az = randRange(-1, 1);
      p.spin = randRange(0.6, 1.4);
      p.phase = Math.random() * TAU;
    }
    this.moteEmitter.reset();
    this.trailEmitter.reset();
    for (const cage of this.cages) cage.visible = false;
    this.floor.visible = false;
    this.lens.visible = false;
    for (const mesh of this.rockMeshes) mesh.count = 0;
    for (const mesh of this.glassMeshes) mesh.count = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame: the lattice                                               */
  /* ------------------------------------------------------------------ */

  _updateLattice(dt) {
    const c = settings.stillpoint;
    const g = settings.global;
    const t = Math.max(0, this._t);
    const R = this.radius;
    const H = this.shellHeight;
    this._floorPoint(_centre);

    // How stopped time is: 0 forming, 1 fully held, eased back at the release.
    const held = this._released ? 0 : saturate((t - this._tearAt()) / Math.max(0.05, this._holdAt() - this._tearAt()));
    const slow = 1 - 0.8 * held;
    this._shimmerTime += c.shimmerSpeed * slow * g.noiseSpeed * dt;
    this._cageTurn += c.turnRate * slow * g.animationSpeed * dt;
    this._ringPhase += c.floorRingSpeed * slow * g.animationSpeed * dt;
    this._lensPhase += 2.0 * slow * dt;

    const form = Easing.outCubic(saturate(t / this._formTime())) * 1.12;
    const since = this._released ? t - this._releaseAt() : -1;
    const dissolveSpan = this._flightTime() * 0.6 + this.fadeDuration;
    const dissolve = since >= 0 ? Easing.inOutQuad(saturate(since / dissolveSpan)) : 0;
    const flash = since >= 0 ? Math.exp(-since * 9) : 0;

    const ss = this._shellState;
    ss.seed = this._seed;
    ss.form = this._t < 0 ? 0 : form;
    ss.dissolve = Math.min(1, dissolve + (this.phase === AbilityPhase.FADE ? saturate(this._fadeT / this.fadeDuration) : 0));
    ss.sink = c.shellSink;
    ss.shimmerTime = this._shimmerTime;
    ss.flash = flash;
    this.shellMaterial.userData.sync(ss);
    const level = Math.min(CAGE_LEVELS, Math.max(1, Math.round(c.latticeFreq))) - 1;
    for (let i = 0; i < CAGE_LEVELS; i++) {
      const cage = this.cages[i];
      cage.visible = i === level && this._t >= 0 && ss.dissolve < 0.999;
      cage.position.set(_centre.x, -c.shellSink * H, _centre.z);
      cage.scale.set(R, H, R);
      cage.rotation.y = this._cageTurn;
      // Bulges a hair in the tremble, and kicks out at the release.
      const tremble = this._trembleAmount();
      cage.scale.multiplyScalar(1 + tremble * 0.015 + flash * 0.06);
    }

    const fs = this._floorState;
    fs.radius = R;
    fs.quadSize = R * 2.3;
    fs.ringPhase = this._ringPhase;
    fs.form = this._t < 0 ? 0 : form;
    fs.fade = 1 - ss.dissolve;
    fs.flash = flash;
    fs.seed = this._seed;
    this.floorMaterial.userData.sync(fs);
    this.floor.position.set(_centre.x, 0.018, _centre.z);
    this.floor.scale.set(fs.quadSize, 1, fs.quadSize);
    this.floor.visible = this._t >= 0 && fs.fade > 0.003;

    const ls = this._lensState;
    ls.size = R * c.lensReach;
    ls.drag = held * (1 - ss.dissolve);
    ls.phase = this._lensPhase;
    ls.shock = since >= 0 ? 1 - Easing.outQuad(saturate(since / 0.6)) : 0;
    ls.shockAt = since >= 0 ? Easing.outCubic(saturate(since / 0.6)) * 0.95 : 0;
    this.lensMaterial.userData.sync(ls);
    this.lens.position.set(_centre.x, H * 0.4, _centre.z);
    this.lens.visible = ls.drag + ls.shock > 0.003;
  }

  /** 0..1 in the instant before the release. */
  _trembleAmount() {
    if (this._released || this._t < 0) return 0;
    const span = Math.max(0.02, settings.stillpoint.trembleTime * this._scale());
    return Easing.inQuad(saturate(1 - (this._releaseAt() - this._t) / span));
  }

  /* ------------------------------------------------------------------ */
  /* Per frame: the debris                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Where piece `i` is, and how it is turned, at time `t` — closed-form.
   * Writes `_node` (position, rotation, scale). Returns its glow, or -1 if it
   * is not out yet / is gone.
   */
  _placePiece(i, isGlass, t) {
    const c = settings.stillpoint;
    const g = settings.global;
    const p = this._pieces[i];
    const tearAt = this._tearOf(p);
    if (t < tearAt) return -1;
    const T = this._catchTime();
    const base = isGlass ? c.glassSize : c.rockSize;
    let size = Math.max(0.02, base * (1 + p.size * c.sizeJitter * g.randomness));
    let glow;

    if (!this._released) {
      // Torn up and caught: an exponential approach that lands exactly on the
      // hang point at T, its initial velocity set by `tearSpeed`.
      this._hangPoint(p, this._spin, _pos);
      const ox = _pos.x * 0.85;
      const oz = _pos.z * 0.85;
      const dist = Math.max(0.1, Math.hypot(_pos.x - ox, _pos.y + 0.1, _pos.z - oz));
      const k = Math.max(0.5, (c.tearSpeed * g.particleSpeed) / dist);
      const u = Math.min(t - tearAt, T);
      const e = (1 - Math.exp(-k * u)) / (1 - Math.exp(-k * T));
      const caught = t - tearAt >= T;
      const x = lerp(ox, _pos.x, e);
      const y = lerp(-0.1, _pos.y, e);
      const z = lerp(oz, _pos.z, e);
      // Frozen: a slow bob and turn, and a tremble just before it goes.
      const since = Math.max(0, t - tearAt - T);
      const bob = caught ? Math.sin(since * 0.6 + p.phase) * c.pieceDrift : 0;
      const tremble = this._trembleAmount() * c.tremble;
      _node.position.set(
        _centre.x + x + Math.sin(t * 67 + p.phase * 9) * tremble,
        y + bob + Math.sin(t * 59 + p.phase * 5) * tremble,
        _centre.z + z + Math.cos(t * 71 + p.phase * 7) * tremble
      );
      // Spin decays to almost nothing as it is caught.
      const w0 = c.releaseTumble * p.spin;
      const kk = 6 / T;
      const spun = (w0 * (1 - Math.exp(-kk * (t - tearAt)))) / kk + since * c.pieceTurn * p.spin;
      _node.rotation.set(p.ax * spun + p.phase, p.ay * spun + this._spin, p.az * spun);
      glow = 0.25 + 0.5 * saturate((t - tearAt) / T) + this._trembleAmount() * 1.5;
      // A piece emerging from the floor grows out of it rather than popping.
      size *= saturate((t - tearAt) / (T * 0.25));
    } else {
      // Released: outward along its own bearing, gravity, and burns out.
      const f = t - this._releaseAt();
      const life = this._flightTime();
      if (f > life) return -1;
      this._hangPoint(p, this._releaseSpin, _pos);
      _dir.set(_pos.x, 0, _pos.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(Math.cos(p.angle), 0, Math.sin(p.angle));
      _dir.normalize();
      _dir.y = c.releaseLift;
      _dir.normalize();
      const v = c.releaseSpeed * p.speed * g.explosionIntensity;
      _node.position.set(
        _centre.x + _pos.x + _dir.x * v * f,
        Math.max(0.05, _pos.y + _dir.y * v * f + 0.5 * c.releaseGravity * f * f),
        _centre.z + _pos.z + _dir.z * v * f
      );
      const spun = f * c.releaseTumble * p.spin;
      _node.rotation.set(p.ax * spun + p.phase, p.ay * spun + this._releaseSpin, p.az * spun);
      const k = f / life;
      size *= 1 - Easing.inCubic(k);
      glow = 2.0 * Math.exp(-f * 4) + 0.3 * (1 - k);
    }
    _node.scale.setScalar(Math.max(0.0001, size));
    _node.updateMatrix();
    return glow;
  }

  _updateDebris() {
    const t = this._t;
    const rocks = this._rocks;
    const glass = this._glass;
    _usedRock.fill(0);
    _usedGlass.fill(0);
    for (let i = 0; i < MAX_PIECES; i++) {
      const isGlass = i >= MAX_ROCKS;
      const index = isGlass ? i - MAX_ROCKS : i;
      if (index >= (isGlass ? glass : rocks)) continue;
      const variants = isGlass ? GLASS_VARIANTS : ROCK_VARIANTS;
      const variant = index % variants;
      const slot = (index / variants) | 0;
      const mesh = isGlass ? this.glassMeshes[variant] : this.rockMeshes[variant];
      const glowAttr = isGlass ? this.glassGlow[variant] : this.rockGlow[variant];
      const used = isGlass ? _usedGlass : _usedRock;
      const glow = t < 0 ? -1 : this._placePiece(i, isGlass, t);
      if (glow < 0) {
        // Parked: hidden slot, so later slots in the same mesh still draw.
        _node.position.set(0, -999, 0);
        _node.scale.setScalar(0.0001);
        _node.updateMatrix();
        glowAttr.array[slot] = 0;
      } else {
        glowAttr.array[slot] = glow;
      }
      mesh.setMatrixAt(slot, _node.matrix);
      used[variant] = Math.max(used[variant], slot + 1);
    }
    for (let v = 0; v < ROCK_VARIANTS; v++) {
      this.rockMeshes[v].count = _usedRock[v];
      this.rockMeshes[v].visible = _usedRock[v] > 0;
      this.rockMeshes[v].instanceMatrix.needsUpdate = true;
      this.rockGlow[v].needsUpdate = true;
    }
    for (let v = 0; v < GLASS_VARIANTS; v++) {
      this.glassMeshes[v].count = _usedGlass[v];
      this.glassMeshes[v].visible = _usedGlass[v] > 0;
      this.glassMeshes[v].instanceMatrix.needsUpdate = true;
      this.glassGlow[v].needsUpdate = true;
    }
    this.rockMaterial.userData.sync();
    this.glassMaterial.userData.sync();
  }

  /* ------------------------------------------------------------------ */
  /* Holding bodies                                                       */
  /* ------------------------------------------------------------------ */

  _heldOf(dummy) {
    for (let i = 0; i < this._heldCount; i++) if (this._held[i].dummy === dummy) return this._held[i];
    return null;
  }

  /** See Chrono Fracture: the action is paused, never the mixer. */
  _unfreeze(dummy) {
    if (dummy?.action) dummy.action.paused = false;
  }

  _releaseHeld() {
    for (let i = 0; i < this._heldCount; i++) {
      this._unfreeze(this._held[i].dummy);
      this._held[i].dummy = null;
      this._held[i].time = 0;
    }
    this._heldCount = 0;
  }

  _hold(dt) {
    const c = settings.stillpoint;
    if (c.holdBodies < 0.5) {
      this._releaseHeld();
      return;
    }
    const field = this.ctx.dummies;
    if (field?.findTargets && this._t >= this._tearAt()) {
      this._floorPoint(_centre);
      const found = field.findTargets(_centre.x, _centre.z, this.radius * c.holdReach, this._found);
      for (const dummy of found) {
        if (this._heldCount >= MAX_HELD) break;
        if (this._heldOf(dummy)) continue;
        const slot = this._held[this._heldCount++];
        slot.dummy = dummy;
        slot.time = 0;
      }
    }
    const look = this._look;
    look.color = c.colorHeld;
    look.rimColor = c.colorHeldRim;
    look.rimEmissive = c.holdRimGlow;
    look.edgeColor = c.colorHeldRim;
    look.edgeEmissive = c.holdRimGlow * 2;
    for (let i = this._heldCount - 1; i >= 0; i--) {
      const slot = this._held[i];
      const dummy = slot.dummy;
      if (!dummy || !dummy.alive) {
        this._unfreeze(dummy);
        const last = this._heldCount - 1;
        this._held[i] = this._held[last];
        this._held[last] = slot;
        slot.dummy = null;
        this._heldCount = last;
        continue;
      }
      slot.time += dt;
      if (dummy.action) dummy.action.paused = true;
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.holdTintTime)) * c.holdTint, look);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The release                                                          */
  /* ------------------------------------------------------------------ */

  _release() {
    const c = settings.stillpoint;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._released = true;
    this._releaseSpin = this._spin;
    // Time comes back for the bodies: they move again, and are now targets.
    this._releaseHeld();

    this._floorPoint(_centre);
    const R = this.radius;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    _pos.copy(_centre).setY(this.shellHeight * 0.4);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: R * 0.5,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      opacity: 0.5,
      fresnel: 2.4,
      squash: c.shellSquash,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      colorC: getColor(c.colorFloor)
    });

    // Streaks thrown out from every hanging piece along its own bearing.
    const rocks = this._rocks;
    const glass = this._glass;
    const pieces = rocks + glass;
    const per = pieces > 0 ? Math.max(1, Math.round((c.streakCount * g.particleCount) / pieces)) : 0;
    const time = frame.uTime.value;
    for (let i = 0; i < MAX_PIECES && per > 0; i++) {
      const isGlass = i >= MAX_ROCKS;
      const index = isGlass ? i - MAX_ROCKS : i;
      if (index >= (isGlass ? glass : rocks)) continue;
      const p = this._pieces[i];
      this._hangPoint(p, this._releaseSpin, _pos);
      _dir.set(_pos.x, 0, _pos.z).normalize();
      _dir.y = c.releaseLift;
      _pos.x += _centre.x;
      _pos.z += _centre.z;
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = 0.08;
      _emit.direction = _dir;
      _emit.speed = c.streakSpeed * power;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.12;
      _emit.size = c.streakSize;
      _emit.life = c.streakLife;
      this.streaks.emit(per, _emit);
    }

    this.ctx.shake.add(c.releaseShake * power * g.cameraShake, 3, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.releaseFlash * power);
    this.lightBoost = c.releaseLight * power;
  }

  /** Every fragment in flight is a swept kill volume. */
  _fragmentHits(dt) {
    if (!settings.dummies.hit.enabled) return;
    const c = settings.stillpoint;
    const g = settings.global;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    this._floorPoint(_centre);
    const found = field.findTargets(_centre.x, _centre.z, c.killReach, this._targets);
    if (found.length === 0) return;
    const t = this._t;
    const life = this._flightTime();
    const f = t - this._releaseAt();
    if (f > life) return;
    const rocks = this._rocks;
    const glass = this._glass;
    const reach = c.fragmentHitRadius + settings.dummies.bodyRadius;
    const reach2 = reach * reach;
    const tall = settings.dummies.height + 0.2;
    this._force.impulse = c.hit.impulse * g.explosionIntensity;
    this._force.lift = c.hit.lift * g.explosionIntensity;
    this._force.spin = c.hit.spin;

    for (let i = 0; i < MAX_PIECES; i++) {
      const isGlass = i >= MAX_ROCKS;
      const index = isGlass ? i - MAX_ROCKS : i;
      if (index >= (isGlass ? glass : rocks)) continue;
      // Where it was a frame ago and where it is now: the swept segment.
      if (this._placePiece(i, isGlass, Math.max(this._releaseAt(), t - Math.max(1e-3, dt))) < 0) continue;
      _prev.copy(_node.position);
      if (this._placePiece(i, isGlass, t) < 0) continue;
      _pos.copy(_node.position);
      if (Math.hypot(_pos.x - _centre.x, _pos.z - _centre.z) > c.killReach) continue;
      if (Math.min(_prev.y, _pos.y) > tall) continue;
      const sx = _pos.x - _prev.x;
      const sz = _pos.z - _prev.z;
      const sl = sx * sx + sz * sz;
      for (let k = 0; k < found.length; k++) {
        const dummy = found[k];
        if (!dummy.alive) continue;
        const px = dummy.position.x - _prev.x;
        const pz = dummy.position.z - _prev.z;
        const u = sl > 1e-8 ? saturate((px * sx + pz * sz) / sl) : 0;
        const dx = px - sx * u;
        const dz = pz - sz * u;
        if (dx * dx + dz * dz > reach2) continue;
        // Thrown along the fragment's flight.
        _dir.set(sx, 0, sz);
        if (_dir.lengthSq() < 1e-8) _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
        if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
        _dir.normalize();
        dummy.kill(_dir.x, _dir.z, this._force);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                            */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  _syncParticles() {
    const c = settings.stillpoint;
    const g = settings.global;
    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    this.dust.uniforms.uSizeScale.value = g.particleSize;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = g.opacity * 0.75;
    this.dust.uniforms.uTurbulence.value = 0.5 * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uSizeScale.value = g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = g.glow;
    this.motes.uniforms.uTurbulence.value = 0.02 * g.turbulence;

    this.streaks.setGradient(getColor(c.colorStreakA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
    this.streaks.uniforms.uSizeScale.value = g.particleSize;
    this.streaks.uniforms.uLifeScale.value = g.particleLifetime;
    this.streaks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.streaks.uniforms.uOpacity.value = g.opacity;
    this.streaks.uniforms.uGlow.value = g.glow;
  }

  /** The seed's slow arc to the circle. */
  _seedPoint(out) {
    _hand.copy(this.origin).addScaledVector(this.direction, 0.5);
    _hand.y = settings.stillpoint.handHeight;
    this._floorPoint(out);
    out.y = 0.5;
    out.lerpVectors(_hand, out, this.u);
    out.y += Math.sin(this.u * Math.PI) * 0.7;
    return out;
  }

  _travelFx(dt) {
    const c = settings.stillpoint;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, 140 * g.particleCount);
    if (n <= 0) return;
    this._seedPoint(_pos);
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.12;
    _emit.speed = 0.15;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.4;
    _emit.life = c.moteLife * 0.4;
    // Left hanging in the air behind it: the trail itself is already slowed.
    this.motes.emit(n, _emit);
  }

  _landFx() {
    const c = settings.stillpoint;
    const g = settings.global;
    this._floorPoint(_centre);
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: this.radius * 1.1,
      life: 1.2,
      intensity: 0.6,
      colorA: getColor(c.colorEdge),
      colorB: getColor(c.colorFloor)
    });
    this.ctx.shake.add(c.tearShake * 0.4 * g.cameraShake, 6, 14);
    this.lightBoost = c.lightIntensity * 0.5;
  }

  /** The floor tears: crack, dust ring, a thump. */
  _tearFx() {
    const c = settings.stillpoint;
    const g = settings.global;
    this._floorPoint(_centre);
    this.ctx.decals.spawn(DecalType.CRACK, _centre, {
      radius: this.radius * c.crackRadius,
      life: c.crackLife,
      intensity: 0.8,
      colorA: getColor(c.colorCrack),
      colorB: getColor(c.colorRockDeep)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: this.radius * 1.2,
      life: 1.6,
      intensity: 0.7,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC)
    });
    this._resetEmit(frame.uTime.value);
    _pos.copy(_centre).setY(0.2);
    _emit.position = _pos;
    _emit.radius = this.radius * 0.7;
    _emit.direction = _up;
    _emit.speed = c.tearSpeed * 0.3;
    _emit.spread = 0.7;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 1.2;
    this.dust.emit(Math.round(c.dustCount * g.particleCount), _emit);
    this.ctx.shake.add(c.tearShake * g.cameraShake, 4, 16);
  }

  /** Motes hanging frozen inside the lattice. */
  _holdFx(dt) {
    const c = settings.stillpoint;
    const g = settings.global;
    if (this._released) return;
    const form = saturate(this._t / this._formTime());
    const n = this.moteEmitter.tick(dt, c.moteRate * form * g.particleCount);
    if (n <= 0) return;
    this._floorPoint(_centre);
    _pos.copy(_centre).setY(this.shellHeight * 0.45);
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = this.radius * 0.8;
    _emit.speed = 0.04;
    _emit.spread = 1;
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    this.motes.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._syncParticles();
    this._seedPoint(this.position);
    this._travelFx(dt);
  }

  onImpact() {
    this._t = 0;
    this._landFx();
  }

  onFade(dt) {
    const c = settings.stillpoint;
    const g = settings.global;
    this._syncParticles();
    if (this.phase === AbilityPhase.FADE) this._fadeT += dt;
    else this._t += dt;

    if (!this._tornFired && this._t >= this._tearAt()) {
      this._tornFired = true;
      this._tearFx();
    }
    // The constellation turns once every piece hangs, easing in.
    if (!this._released) {
      const turning = Easing.inOutQuad(saturate((this._t - this._holdAt()) / Math.max(0.05, 0.6 * this._scale())));
      this._spin += c.constellationSpin * turning * g.animationSpeed * dt;
      this._hold(dt);
      if (this._t >= this._releaseAt()) this._release();
    }

    this._updateLattice(dt);
    this._updateDebris();
    this._holdFx(dt);
    if (this._released) this._fragmentHits(dt);

    this._floorPoint(this.position);
    this.position.y = c.lightHeight;
  }

  onDestroy() {
    this._releaseHeld();
    for (const cage of this.cages) cage.visible = false;
    this.floor.visible = false;
    this.lens.visible = false;
    for (const mesh of this.rockMeshes) {
      mesh.count = 0;
      mesh.visible = false;
    }
    for (const mesh of this.glassMeshes) {
      mesh.count = 0;
      mesh.visible = false;
    }
    this._t = -1;
    this._released = false;
    this._targets.length = 0;
    this._found.length = 0;
  }

  dispose() {
    for (const cage of this.cages) cage.geometry.dispose();
    this.shellMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    for (const mesh of this.rockMeshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const mesh of this.glassMeshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.rockMaterial.dispose();
    this.glassMaterial.dispose();
    this.lensGeometry.dispose();
    this.lensMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('◬  Stillpoint');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 90, 0.5, 'seed speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'lattice radius (m)');
  R(cast, c, 'lifetime', 0.2, 4, 0.01, 'timeline scale (×)');
  R(cast, c, 'fadeTime', 0.1, 5, 0.05, 'dissolves over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');

  /* ---- layer 1 ---- */
  const lattice = folder.addFolder('1 · Lattice');
  R(lattice, c, 'shellScale', 0.3, 2, 0.01, 'radius (× zone)');
  R(lattice, c, 'shellSquash', 0.2, 1.5, 0.01, 'height (× radius)');
  R(lattice, c, 'shellSink', -0.5, 0.8, 0.01, 'sunk below floor');
  R(lattice, c, 'formTime', 0.05, 3, 0.01, 'draws itself over (s)');
  R(lattice, c, 'latticeFreq', 1, CAGE_LEVELS, 1, 'subdivision');
  R(lattice, c, 'edgeWidth', 0.005, 0.2, 0.001, 'edge width');
  R(lattice, c, 'edgeGlow', 0, 8, 0.05, 'edge glow');
  R(lattice, c, 'nodeGlow', 0, 10, 0.05, 'node glow');
  R(lattice, c, 'fillGlow', 0, 1, 0.005, 'face film');
  R(lattice, c, 'fresnelPower', 0.2, 8, 0.05, 'rim power');
  R(lattice, c, 'fresnelGlow', 0, 4, 0.01, 'rim glow');
  R(lattice, c, 'shimmerSpeed', 0, 3, 0.01, 'shimmer speed');
  R(lattice, c, 'shimmerScale', 0.1, 8, 0.05, 'shimmer scale');
  R(lattice, c, 'shimmerAmount', 0, 2, 0.01, 'shimmer amount');
  R(lattice, c, 'backFace', 0, 1, 0.01, 'far wall');
  R(lattice, c, 'shellOpacity', 0, 1, 0.01, 'opacity');
  R(lattice, c, 'dissolveEdge', 0, 0.4, 0.005, 'burning edge');
  R(lattice, c, 'turnRate', -1, 1, 0.005, 'cage turn (rad/s)');
  lattice.addColor(c, 'colorEdge').name('edges');
  lattice.addColor(c, 'colorNode').name('nodes');
  lattice.addColor(c, 'colorFill').name('film');
  lattice.addColor(c, 'colorRim').name('rim');
  lattice.addColor(c, 'colorBurn').name('forming / burning');
  const floor = lattice.addFolder('Floor');
  R(floor, c, 'floorGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'floorRings', 1, 30, 1, 'dilation rings');
  R(floor, c, 'floorRingSpeed', -1, 1, 0.005, 'ring creep');
  R(floor, c, 'floorSpokes', 3, 48, 1, 'spokes');
  R(floor, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  floor.addColor(c, 'colorFloor').name('rings');
  floor.addColor(c, 'colorFloorHot').name('rings, hot');

  /* ---- layer 2 ---- */
  const debris = folder.addFolder('2 · Debris');
  const pieces = debris.addFolder('Pieces');
  R(pieces, c, 'rockCount', 0, MAX_ROCKS, 1, 'rocks');
  R(pieces, c, 'glassCount', 0, MAX_GLASS, 1, 'glass shards');
  R(pieces, c, 'rockSize', 0.03, 1.2, 0.01, 'rock size (m)');
  R(pieces, c, 'glassSize', 0.03, 1.2, 0.01, 'glass size (m)');
  R(pieces, c, 'sizeJitter', 0, 1, 0.01, 'size jitter');
  R(pieces, c, 'rockGlow', 0, 6, 0.05, 'crack glow');
  R(pieces, c, 'glassFresnel', 0, 6, 0.05, 'glass fresnel');
  R(pieces, c, 'glassGlow', 0, 6, 0.05, 'glass edge glow');
  R(pieces, c, 'glassOpacity', 0, 1, 0.01, 'glass opacity');
  pieces.addColor(c, 'colorRock').name('stone');
  pieces.addColor(c, 'colorRockDeep').name('deep stone');
  pieces.addColor(c, 'colorCrack').name('stored momentum');
  pieces.addColor(c, 'colorGlass').name('glass');
  pieces.addColor(c, 'colorGlassRim').name('glass rim');
  R(pieces, c, 'rockRoughness', 0, 1.5, 0.01, 'lumpiness');

  const caught = debris.addFolder('Torn up & caught');
  R(caught, c, 'tearStagger', 0, 2, 0.01, 'tear stagger (s)');
  R(caught, c, 'tearSpeed', 0.5, 25, 0.1, 'flung up at (m/s)');
  R(caught, c, 'catchTime', 0.05, 2, 0.01, 'caught over (s)');
  R(caught, c, 'hangMin', 0, 1, 0.01, 'lowest (× height)');
  R(caught, c, 'hangMax', 0, 1.2, 0.01, 'highest (× height)');
  R(caught, c, 'hangReach', 0.05, 1.2, 0.01, 'reach (× radius)');
  R(caught, c, 'holdTime', 0, 10, 0.05, 'held for (s)');
  R(caught, c, 'constellationSpin', -2, 2, 0.01, 'constellation turn (rad/s)');
  R(caught, c, 'pieceDrift', 0, 0.3, 0.005, 'bob (m)');
  R(caught, c, 'pieceTurn', 0, 2, 0.01, 'piece turn (rad/s)');
  R(caught, c, 'tremble', 0, 0.3, 0.001, 'tremble (m)');
  R(caught, c, 'trembleTime', 0, 2, 0.01, 'tremble for (s)');

  const rel = debris.addFolder('Release');
  R(rel, c, 'releaseSpeed', 0, 50, 0.1, 'speed (m/s)');
  R(rel, c, 'releaseLift', -0.5, 2, 0.01, 'lift');
  R(rel, c, 'releaseGravity', -40, 0, 0.1, 'gravity');
  R(rel, c, 'releaseTumble', 0, 50, 0.1, 'tumble (rad/s)');
  R(rel, c, 'releaseLife', 0.1, 4, 0.01, 'flight (s)');
  R(rel, c, 'killReach', 0.5, 30, 0.1, 'kills out to (m)');
  R(rel, c, 'fragmentHitRadius', 0.05, 2, 0.01, 'fragment hit radius (m)');
  R(rel, c.hit, 'impulse', 0, 30, 0.1, 'thrown (m/s)');
  R(rel, c.hit, 'lift', 0, 20, 0.1, 'thrown up (m/s)');
  R(rel, c.hit, 'spin', 0, 5, 0.05, 'torque');

  /* ---- layer 3 ---- */
  const hold = folder.addFolder('3 · Held bodies');
  R(hold, c, 'holdBodies', 0, 1, 1, 'hold bodies');
  R(hold, c, 'holdReach', 0.2, 2, 0.01, 'reach (× radius)');
  R(hold, c, 'holdTint', 0, 1, 0.01, 'violet tint');
  R(hold, c, 'holdTintTime', 0.05, 3, 0.01, 'tint takes (s)');
  R(hold, c, 'holdRimGlow', 0, 10, 0.05, 'rim glow');
  hold.addColor(c, 'colorHeld').name('held body');
  hold.addColor(c, 'colorHeldRim').name('held rim');

  /* ---- layer 4 ---- */
  const fx = folder.addFolder('4 · Particles & impacts');
  R(fx, c, 'dustCount', 0, 300, 1, 'torn dust');
  R(fx, c, 'dustSize', 0.05, 2, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 5, 0.05, 'dust life (s)');
  Editor.gradient(fx, c, 'colorDust', 'Dust colour');
  R(fx, c, 'moteRate', 0, 400, 1, 'frozen motes (/s)');
  R(fx, c, 'moteSize', 0.01, 0.3, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.1, 6, 0.05, 'mote life (s)');
  Editor.gradient(fx, c, 'colorMote', 'Mote colour');
  R(fx, c, 'streakCount', 0, 800, 1, 'release streaks');
  R(fx, c, 'streakSize', 0.01, 0.4, 0.005, 'streak size');
  R(fx, c, 'streakLife', 0.05, 2, 0.01, 'streak life (s)');
  R(fx, c, 'streakSpeed', 0, 50, 0.1, 'streak speed');
  Editor.gradient(fx, c, 'colorStreak', 'Streak colour');
  R(fx, c, 'tearShake', 0, 1, 0.005, 'tear shake');
  R(fx, c, 'releaseShake', 0, 2, 0.01, 'release shake');
  R(fx, c, 'releaseFlash', 0, 1, 0.005, 'release flash');
  R(fx, c, 'releaseLight', 0, 80, 0.5, 'release light');
  R(fx, c, 'shockRadius', 0.5, 20, 0.1, 'shockwave (m)');
  R(fx, c, 'shockLife', 0.1, 3, 0.01, 'shockwave life (s)');
  R(fx, c, 'burstRadius', 0.5, 12, 0.1, 'air burst (m)');
  R(fx, c, 'burstLife', 0.1, 2, 0.01, 'air burst life (s)');
  R(fx, c, 'crackRadius', 0.2, 3, 0.01, 'torn floor crack (× radius)');
  R(fx, c, 'crackLife', 0.2, 12, 0.1, 'crack life (s)');
  fx.addColor(c, 'colorShockA').name('shock edge');
  fx.addColor(c, 'colorShockB').name('shock body');
  fx.addColor(c, 'colorFlash').name('flash');

  /* ---- layer 5 ---- */
  const lens = folder.addFolder('5 · Dilation');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'drag');
  R(lens, c, 'lensSwirl', -2, 2, 0.01, 'swirl');
  R(lens, c, 'lensReach', 0.3, 3, 0.01, 'reach (× radius)');
  R(lens, c, 'lensShock', 0, 6, 0.01, 'release ring');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 5, 0.05, 'height (m)');

  folder.close();
  return folder;
}
