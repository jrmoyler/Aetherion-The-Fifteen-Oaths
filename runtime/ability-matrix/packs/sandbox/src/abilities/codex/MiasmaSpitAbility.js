import {
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  Vector3
} from 'three';
import { Ability } from '../Ability.js';
import {
  createBileGlobMaterial,
  createSludgePoolMaterial,
  createSpatterMaterial,
  createSplashCrownMaterial,
  createFumeWarpMaterial
} from '../../materials/codex/MiasmaSpitMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'miasma';

const TAU = Math.PI * 2;
/** Trailing blobs strung behind the glob. */
const MAX_BLOBS = 5;
/** Drips in the air at once — each one is a promise to hiss where it lands. */
const MAX_DRIPS = 72;
/** Burn marks on the floor, a ring buffer. */
const MAX_SPATTER = 48;
/** Bodies the pool can be melting at once. */
const MAX_GRIPS = 8;
/** Seconds between re-scans of the spreading pool for bodies it has reached. */
const SCAN_EVERY = 0.15;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _hand = new Vector3();
const _land = new Vector3();
const _glob = new Vector3();
const _at = new Vector3();
const _mat = new Matrix4();
const _up = new Vector3(0, 1, 0);

/**
 * MIASMA SPIT — Poison, line cast.
 *
 * A glob of corrosive bile swells at the hand, is spat, and lobs down the line
 * shedding drips that hiss where they land. It bursts on the target into a
 * crown of sludge, spreads into a bubbling pool that eats the floor, and slowly
 * evaporates. Whatever the splash catches is knocked down, stained, and drawn
 * down into the pool.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the glob** (`createBileGlobMaterial`) — a sphere displaced in the
 *      vertex stage into a wobbling, lobed blob that stretches along its own
 *      velocity and trails a pinched drip. Translucent viscous shading: murky
 *      swirls, an inner glow where it is thick, gas trapped inside, a wet
 *      highlight and a toxic rim. Three smaller blobs (the same material,
 *      instanced) ride the arc behind it, so the projectile reads as a glob of
 *      liquid tearing into pieces rather than a ball; they land one after the
 *      other into the pool once it has hit.
 *   2. **drips** — DROPLET particles on exact ballistic paths (no drag, no
 *      turbulence, their own gravity). Each drip's landing is solved on the CPU
 *      when it is shed and kept as a record, so when it reaches the floor the
 *      ability can answer it: a burn mark (`createSpatterMaterial`), a puff of
 *      acrid steam and a couple of sparks. The crown's drops use the same
 *      records, so the splash rains down hissing round the pool.
 *   3. **the sludge pool** (`createSludgePoolMaterial`) — the ground mesh:
 *      a ragged pool with runnels, its surface a domain-warped flow lit through
 *      a rebuilt normal, bubbles that swell and pop into a ring of light, an
 *      oily sheen, an impact ripple, and a corroded band of pitted floor round
 *      it with a glowing seam. It evaporates on a noise threshold and leaves the
 *      stain to fade after it.
 *   4. **the splash** — a crown of liquid (`createSplashCrownMaterial`) rising
 *      and tearing apart from its fingers, a WATER splash shell, a ground
 *      shockwave, sparks, a flash, a knock on the camera and a punch of light.
 *   5. **fumes, bubbles and motes** — non-additive SMOKE drifting up off the
 *      pool (it has to *dirty* the air), BUBBLE particles breaking the surface,
 *      and additive toxic motes rising. A distortion proxy on
 *      `LAYER.DISTORTION` (`createFumeWarpMaterial`) makes the air over the
 *      pool shimmer.
 *   6. **the melt** — `handlesOwnHits`. The splash knocks every body in
 *      `splashRadius` down (back, away from the middle), and the pool keeps
 *      catching bodies as it spreads. Each caught body is stained with the
 *      bile (`corrode`), then after `meltDelay` is carried — held mostly up by
 *      the sludge so it goes slowly — toward the middle and down through a
 *      floor that has opened under it (`sink`), boiling fumes as it goes, and
 *      is `consume`d once it is under the surface.
 *
 * ## The editor rule
 *
 * A cast keeps only dice and clocks: a seed, the integrated wobble, swirl,
 * flow and bubble phases, and per-drip landing records. Every size, height,
 * colour and rate is resolved from `settings.miasma` every frame — dragging
 * `arcHeight` re-aims a glob that is already in the air, and dragging
 * `poolRadius` spreads a pool that is already on the floor.
 */
export class MiasmaSpitAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The pool decides what it takes, and when. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies the pool is melting. HUD readout only. */
  get instanceCount() {
    return this._gripCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the glob and its trailing blobs ---- */
    this.globGeometry = new SphereGeometry(1, 56, 40);
    this.globMaterial = createBileGlobMaterial(false);
    this.glob = new Mesh(this.globGeometry, this.globMaterial);
    this.glob.name = 'MiasmaGlob';
    this._vfx(this.glob, 16);

    this.blobMaterial = createBileGlobMaterial(true);
    this.blobs = new InstancedMesh(this.globGeometry, this.blobMaterial, MAX_BLOBS);
    this.blobs.name = 'MiasmaBlobs';
    this.blobs.instanceMatrix.setUsage(DynamicDrawUsage);
    this._vfx(this.blobs, 15);

    /* ---- layer 3: the pool ---- */
    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.poolMaterial = createSludgePoolMaterial();
    this.pool = new Mesh(this.floorGeometry, this.poolMaterial);
    this.pool.name = 'MiasmaPool';
    this._vfx(this.pool, 3);

    /* ---- layer 2: burn marks where drips land ---- */
    this.spatterGeometry = new InstancedBufferGeometry();
    this.spatterGeometry.setAttribute('position', this.floorGeometry.getAttribute('position'));
    this.spatterGeometry.setIndex(this.floorGeometry.getIndex());
    this._spotArray = new Float32Array(MAX_SPATTER * 4);
    this._spotSeed = new Float32Array(MAX_SPATTER);
    this.spatterGeometry.setAttribute('aSpot', new InstancedBufferAttribute(this._spotArray, 4).setUsage(DynamicDrawUsage));
    this.spatterGeometry.setAttribute('aSeed', new InstancedBufferAttribute(this._spotSeed, 1).setUsage(DynamicDrawUsage));
    this.spatterGeometry.instanceCount = MAX_SPATTER;
    this.spatterMaterial = createSpatterMaterial();
    this.spatter = new Mesh(this.spatterGeometry, this.spatterMaterial);
    this.spatter.name = 'MiasmaSpatter';
    this._vfx(this.spatter, 4);
    /** Birth time (ability clock) of each mark, and its size. */
    this._spotBirth = new Float32Array(MAX_SPATTER);
    this._spotSize = new Float32Array(MAX_SPATTER);
    this._spotCursor = 0;

    /* ---- layer 4: the crown ---- */
    this.crownGeometry = new CylinderGeometry(1, 1, 1, 64, 10, true);
    this.crownMaterial = createSplashCrownMaterial();
    this.crown = new Mesh(this.crownGeometry, this.crownMaterial);
    this.crown.name = 'MiasmaCrown';
    this._vfx(this.crown, 14);

    /* ---- layer 5: the fumes' shimmer ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.warpMaterial = createFumeWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.name = 'MiasmaFumeWarp';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /* ---- dice, clocks and records ---- */
    this._drips = [];
    for (let i = 0; i < MAX_DRIPS; i++) this._drips.push({ live: false, x: 0, z: 0, at: 0, size: 0 });

    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0, depth: 0, eaten: 0, under: false });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._centre = new Vector3();
    this._velDir = new Vector3(0, 0, 1);

    /** The sludge's current: toward the middle of the pool and down into it. */
    this._field = (x, y, z, out) => {
      const c = settings.miasma;
      const dx = this._centre.x - x;
      const dz = this._centre.z - z;
      const flat = Math.hypot(dx, dz);
      // Toward the middle, but only until it is well inside the liquid.
      const reach = Math.max(0, flat - this._poolRadius * 0.35);
      const pull = Math.min(3, reach * c.meltPull) / Math.max(flat, 1e-3);
      out.set(dx * pull, -Math.max(0, c.meltSpeed), dz * pull);
    };

    this._globState = { radius: 0.3, form: 0, phase: 0, flow: 0, seed: 0, velDir: this._velDir, stretch: 0, drip: 0, fade: 1 };
    this._poolState = { centre: this._centre, quad: 8, radius: 0, flow: 0, bubblePhase: 0, evap: 0, stainFade: 0, splash: 1, seed: 0 };
    this._crownState = { centre: this._centre, age: 1, height: 0, radius: 1, seed: 0 };
    this._warpState = { width: 6, strength: 0, seed: 0 };

    this._seed = 0;
    this._phase = 0;
    this._flow = 0;
    this._poolFlow = 0;
    this._bubblePhase = 0;
    this._poolRadius = 0;
    this._landed = false;
    this._blobLanded = 0;
    this._scan = 0;
  }

  _vfx(mesh, order) {
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- drips and crown drops: exact ballistic arcs ---- */
    this.drops = particles.get('miasma.drops', {
      capacity: 900,
      shape: ParticleShape.DROPLET,
      additive: false,
      softFade: 0.1
    });
    const d = this.drops.uniforms;
    d.uDrag.value = 0; // the landing is solved on the CPU: no drag, no wobble
    d.uTurbulence.value = 0;
    d.uSizeIn.value = 0.02;
    d.uFadeIn.value = 0.02;
    d.uFadeOut.value = 0.02;
    d.uEndSize.value = 0.8;

    /* ---- acrid fumes: not additive, so they dirty the air ---- */
    this.fumes = particles.get('miasma.fumes', {
      capacity: 1600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.8
    });
    const f = this.fumes.uniforms;
    f.uDrag.value = 1.1;
    f.uSizeIn.value = 0.15;
    f.uFadeIn.value = 0.15;
    f.uFadeOut.value = 0.55;
    f.uEndSize.value = 2.6;
    f.uTurbFrequency.value = 0.6;
    f.uTurbSpeed.value = 0.4;

    /* ---- bubbles breaking the surface ---- */
    this.bubbles = particles.get('miasma.bubbles', {
      capacity: 500,
      shape: ParticleShape.BUBBLE,
      additive: false,
      softFade: 0.05
    });
    const b = this.bubbles.uniforms;
    b.uDrag.value = 2.5;
    b.uSizeIn.value = 0.5;
    b.uFadeIn.value = 0.05;
    b.uFadeOut.value = 0.15;
    b.uEndSize.value = 1.3;
    b.uGravity.value.set(0, 0, 0);
    b.uTurbulence.value = 0;

    /* ---- toxic motes ---- */
    this.motes = particles.get('miasma.motes', {
      capacity: 1400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    const m = this.motes.uniforms;
    m.uDrag.value = 1.4;
    m.uSizeIn.value = 0.05;
    m.uFadeIn.value = 0.08;
    m.uFadeOut.value = 0.5;
    m.uEndSize.value = 0.3;
    m.uTurbFrequency.value = 0.9;
    m.uTurbSpeed.value = 0.6;

    this.dripEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
    this.fumeEmitter = new RateEmitter();
    this.bubbleEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
    this.meltEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the pool spreading and lying there bubbling. */
  get impactDuration() {
    const c = settings.miasma;
    return Math.max(0.1, (c.poolSpreadTime + c.lifetime) * settings.global.lifetime);
  }

  /** The fade is the pool evaporating. */
  get fadeDuration() {
    return Math.max(0.1, settings.miasma.evaporateTime * settings.global.lifetime);
  }

  /** It gutters: every popping bubble throws a little light. */
  lightShimmer() {
    const f = settings.miasma.lightBubble;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 11.3) * Math.sin(this.age * 4.1 + 1.3));
  }

  _windup() {
    return Math.max(0, settings.miasma.windup);
  }

  /** The glob swells at the hand before the front is allowed to leave. */
  advance(dt) {
    if (this.age < this._windup()) {
      this.front = 0;
      this.u = 0;
      this.pointAt(0, this.position);
      return false;
    }
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The arc                                                             */
  /* ------------------------------------------------------------------ */

  _handPoint(out) {
    const c = settings.miasma;
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide)
      .setY(c.handHeight);
  }

  /** The lob at `s` (0 hand .. 1 target), and its tangent (per unit s) into `tangent`. */
  _arc(s, out, tangent) {
    const c = settings.miasma;
    this._handPoint(_hand);
    this.pointAt(1, _land);
    _land.y = c.landHeight;
    const h = c.arcHeight;
    out.lerpVectors(_hand, _land, s);
    out.y += 4 * h * s * (1 - s);
    if (tangent) {
      tangent.subVectors(_land, _hand);
      tangent.y += 4 * h * (1 - 2 * s);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.miasma;
    const g = settings.global;

    this.dripEmitter.reset();
    this.trailEmitter.reset();
    this.fumeEmitter.reset();
    this.bubbleEmitter.reset();
    this.moteEmitter.reset();
    this.meltEmitter.reset();

    this._seed = Math.random() * 100;
    this._phase = Math.random() * 10;
    this._flow = 0;
    this._poolFlow = 0;
    this._bubblePhase = 0;
    this._poolRadius = 0;
    this._landed = false;
    this._blobLanded = 0;
    this._scan = 0;
    this._releaseGrips();
    for (let i = 0; i < MAX_DRIPS; i++) this._drips[i].live = false;
    for (let i = 0; i < MAX_SPATTER; i++) {
      this._spotBirth[i] = -1e4;
      this._spotArray[i * 4 + 3] = 1;
    }
    this._spotCursor = 0;
    this.spatterGeometry.attributes.aSpot.needsUpdate = true;

    this.pointAt(1, this._centre);
    this._centre.y = 0;

    this.glob.visible = true;
    this.blobs.visible = true;
    this.spatter.visible = true;
    this.pool.visible = false;
    this.crown.visible = false;
    this.warp.visible = false;

    /* anticipation: toxic light gathers in to the hand */
    this._handPoint(_hand);
    this._resetEmit(frame.uTime.value);
    const gather = Math.round(c.splashMotes * 0.4 * g.particleCount);
    const life = Math.max(0.08, this._windup() + 0.05);
    _emit.size = c.moteSize;
    _emit.life = life;
    _emit.lifeVariance = 0.1;
    _emit.speedVariance = 0.1;
    for (let n = 0; n < gather; n++) {
      const a = Math.random() * TAU;
      const r = 0.6 + Math.random() * 0.5;
      _pos.set(_hand.x + Math.cos(a) * r, _hand.y + (Math.random() - 0.4) * 0.8, _hand.z + Math.sin(a) * r);
      _dir.subVectors(_hand, _pos);
      const dist = _dir.length();
      _emit.position = _pos;
      _emit.direction = _dir.divideScalar(Math.max(dist, 1e-4));
      _emit.speed = dist / life;
      this.motes.emit(1, _emit);
    }

    this._syncLooks();
    this._updateGlob(0);
  }

  _resetEmit(time) {
    _emit.position = null;
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.4;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame looks                                                     */
  /* ------------------------------------------------------------------ */

  /** Advance the integrated phases. Rates are live; nothing ever jumps. */
  _advancePhases(dt) {
    const c = settings.miasma;
    const g = settings.global;
    this._phase += c.globWobbleSpeed * dt * g.noiseSpeed;
    this._flow += c.globFlowSpeed * dt * g.noiseSpeed;
    this._poolFlow += c.poolFlowSpeed * dt * g.noiseSpeed;
    this._bubblePhase += c.poolBubbleSpeed * dt * g.animationSpeed;
  }

  /** Particle looks, from settings, every frame. */
  _syncLooks() {
    const c = settings.miasma;
    const g = settings.global;

    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const d = this.drops.uniforms;
    d.uGravity.value.set(0, -Math.max(0.1, c.dripGravity), 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = 1; // the life *is* the time to the floor
    d.uSpeedScale.value = 1; // the speed is already scaled when the landing is solved
    d.uOpacity.value = g.opacity;
    d.uGlow.value = g.glow;

    this.fumes.setGradient(getColor(c.colorFumeA), getColor(c.colorFumeB), getColor(c.colorFumeC), getColor(c.colorFumeD));
    const f = this.fumes.uniforms;
    f.uGravity.value.set(0, c.fumeBuoyancy, 0);
    f.uSizeScale.value = g.particleSize;
    f.uLifeScale.value = g.particleLifetime;
    f.uSpeedScale.value = g.particleSpeed;
    f.uOpacity.value = c.fumeOpacity * g.opacity;
    f.uTurbulence.value = c.fumeTurbulence * g.turbulence;

    this.bubbles.setGradient(getColor(c.colorBubbleA), getColor(c.colorBubbleB), getColor(c.colorBubbleC), getColor(c.colorBubbleD));
    const b = this.bubbles.uniforms;
    b.uSizeScale.value = g.particleSize;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uGlow.value = g.glow;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, c.moteRise * 0.5, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 0.5 * g.turbulence;

    this.spatterMaterial.userData.sync();
  }

  /**
   * Place the glob and its blobs on the arc.
   * @param {number} s where the glob is, 0 hand .. 1 target (may run past 1 for the blobs)
   */
  _updateGlob(s) {
    const c = settings.miasma;
    const g = settings.global;
    const windup = this._windup();
    const form = windup > 0 ? Easing.outBack(saturate(this.age / windup)) : 1;
    const flying = this.age >= windup && !this._landed;

    // Velocity along the arc, metres/second.
    this._arc(Math.min(s, 1), _glob, _vel);
    const sRate = (c.speed * g.speed) / Math.max(0.1, this.length);
    _vel.multiplyScalar(flying ? sRate : 0);
    const speed = _vel.length();
    if (speed > 1e-3) this._velDir.copy(_vel).divideScalar(speed);
    else this._velDir.copy(this.direction).addScaledVector(_up, 0.5).normalize();

    // While it swells it breathes; in the air it stretches with its speed.
    const st = this._globState;
    st.radius = c.globRadius * (1 + 0.06 * Math.sin(this.age * 9));
    st.form = form;
    st.phase = this._phase;
    st.flow = this._flow;
    st.seed = this._seed;
    st.stretch = c.globStretch * saturate(speed / 25);
    st.drip = c.globDrip * (flying ? 1 : 0.35 * saturate(this.age / Math.max(windup, 0.01)));
    st.fade = 1;
    this.globMaterial.userData.sync(st);
    this.blobMaterial.userData.sync(st);

    this.glob.position.copy(_glob);
    this.glob.visible = !this._landed;
    this.glob.updateMatrix();

    /* the blobs: further back along the same arc, smaller, landing in turn */
    const n = Math.min(MAX_BLOBS, Math.max(0, Math.round(c.blobCount)));
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const si = s - ((i + 1) * c.blobGap) / Math.max(0.1, this.length);
      const bit = 1 << i;
      if (si >= 1) {
        if (!(this._blobLanded & bit)) {
          this._blobLanded |= bit;
          this._blobSplash(i);
        }
        continue;
      }
      // Torn off the glob as it leaves the hand: they grow out of it.
      const grow = smoothstep(-0.02, 0.06, si) * form;
      if (grow <= 0.001) continue;
      this._arc(Math.max(0, si), _pos, null);
      const size = c.globRadius * c.blobSize * (1 - i / (n + 1)) * grow;
      _mat.makeScale(size, size, size).setPosition(_pos);
      this.blobs.setMatrixAt(shown++, _mat);
    }
    this.blobs.count = shown;
    this.blobs.visible = shown > 0;
    if (shown > 0) this.blobs.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Travel                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.miasma;
    const g = settings.global;
    this._advancePhases(dt);
    this._syncLooks();
    this._updateGlob(this.u);
    this._updateDrips();
    this._updateSpatter();

    const flying = this.age >= this._windup();
    // Drips: a few from the hand while it swells, a stream once it is flying.
    const count = Math.round(this.dripEmitter.tick(dt, c.dripRate * (flying ? 1 : 0.25)) * g.particleCount);
    for (let k = 0; k < count; k++) this._shedDrip();

    // Toxic motes streaming off it.
    if (flying) {
      const motes = Math.round(this.trailEmitter.tick(dt, c.trailMotes) * g.particleCount);
      if (motes > 0) {
        this._resetEmit(frame.uTime.value);
        _emit.position = _glob;
        _emit.radius = c.globRadius * 0.8;
        _emit.direction = _dir.copy(this._velDir).negate();
        _emit.speed = 0.6;
        _emit.spread = 0.8;
        _emit.size = c.moteSize;
        _emit.life = c.moteLifetime * 0.6;
        this.motes.emit(motes, _emit);
      }
    }

    this.position.copy(_glob);
  }

  /** One drip off the glob's trailing underside — and its landing, booked. */
  _shedDrip() {
    const c = settings.miasma;
    const g = settings.global;
    _pos.copy(_glob).addScaledVector(this._velDir, -c.globRadius * 0.6);
    _pos.y -= c.globRadius * 0.6;
    const k = c.dripSpread * g.randomness;
    _vel.copy(this._velDir).multiplyScalar(c.speed * g.speed * c.dripInherit);
    _vel.x += (Math.random() * 2 - 1) * k;
    _vel.y += (Math.random() * 2 - 1) * k * 0.5;
    _vel.z += (Math.random() * 2 - 1) * k;
    this._launchDrop(_pos, _vel, c.dripSize * (0.6 + Math.random() * 0.8));
  }

  /**
   * Fire one ballistic drop and book where and when it lands. Its life is
   * exactly the time to the floor, so it vanishes as it hits and the hiss takes
   * over on the same frame.
   */
  _launchDrop(from, vel, size) {
    const c = settings.miasma;
    const gravity = Math.max(0.1, c.dripGravity);
    const y0 = Math.max(0.02, from.y - 0.02);
    const vy = vel.y;
    const t = (vy + Math.sqrt(vy * vy + 2 * gravity * y0)) / gravity;
    const speed = vel.length();

    this._resetEmit(frame.uTime.value);
    _emit.position = from;
    _emit.direction = speed > 1e-4 ? _dir.copy(vel).divideScalar(speed) : _up;
    _emit.speed = speed;
    _emit.speedVariance = 0;
    _emit.size = size;
    _emit.sizeVariance = 0;
    _emit.life = t;
    _emit.lifeVariance = 0;
    this.drops.emit(1, _emit);

    for (let i = 0; i < MAX_DRIPS; i++) {
      const d = this._drips[i];
      if (d.live) continue;
      d.live = true;
      d.x = from.x + vel.x * t;
      d.z = from.z + vel.z * t;
      d.at = this.age + t;
      d.size = size;
      return;
    }
  }

  /** Answer every drip that has reached the floor. */
  _updateDrips() {
    for (let i = 0; i < MAX_DRIPS; i++) {
      const d = this._drips[i];
      if (!d.live || this.age < d.at) continue;
      d.live = false;
      _pos.set(d.x, 0, d.z);
      // Into the pool, it is only a ripple of bubbles; on the floor, it hisses.
      const inPool = this._landed && Math.hypot(d.x - this._centre.x, d.z - this._centre.z) < this._poolRadius * 0.9;
      this._hiss(_pos, d.size, inPool);
    }
  }

  /** A drop landing: a burn mark, a puff of acrid steam, a spark. */
  _hiss(at, size, inPool) {
    const c = settings.miasma;
    const g = settings.global;
    const time = frame.uTime.value;
    if (!inPool) {
      const i = this._spotCursor;
      this._spotCursor = (this._spotCursor + 1) % MAX_SPATTER;
      this._spotBirth[i] = this.age;
      this._spotSize[i] = c.hissSize * (0.5 + (size / Math.max(0.01, c.dripSize)) * 0.5) * (0.7 + Math.random() * 0.6);
      this._spotArray[i * 4] = at.x;
      this._spotArray[i * 4 + 1] = at.z;
      this._spotSeed[i] = Math.random();
      this.spatterGeometry.attributes.aSeed.needsUpdate = true;
    }

    this._resetEmit(time);
    _pos.copy(at).setY(0.06);
    _emit.position = _pos;
    _emit.radius = 0.05;
    _emit.direction = _up;
    _emit.speed = 0.6;
    _emit.spread = 0.5;
    _emit.size = c.fumeSize * 0.4;
    _emit.life = c.fumeLifetime * 0.5;
    _emit.spin = 0.6;
    this.fumes.emit(Math.round(c.hissFumes * g.particleCount), _emit);

    _emit.speed = 1.6;
    _emit.spread = 0.7;
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime * 0.4;
    _emit.spin = 0;
    this.motes.emit(Math.round(c.hissMotes * g.particleCount), _emit);

    if (inPool) {
      _emit.speed = 0.1;
      _emit.size = c.bubbleSize * 0.7;
      _emit.life = c.bubbleLifetime * 0.6;
      this.bubbles.emit(1, _emit);
    }
  }

  /** Write the burn marks' ages. Ages run off the ability clock. */
  _updateSpatter() {
    const c = settings.miasma;
    const life = Math.max(0.05, c.hissLife * settings.global.lifetime);
    const arr = this._spotArray;
    for (let i = 0; i < MAX_SPATTER; i++) {
      const age = (this.age - this._spotBirth[i]) / life;
      arr[i * 4 + 2] = this._spotSize[i];
      arr[i * 4 + 3] = age < 0 ? 1 : Math.min(1, age);
    }
    this.spatterGeometry.attributes.aSpot.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the splash                                                 */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.miasma;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;

    this._landed = true;
    this.pointAt(1, this._centre);
    this._centre.y = 0;
    this.glob.visible = false;
    this.pool.visible = true;
    this.crown.visible = true;
    this.warp.visible = true;

    _pos.copy(this._centre).setY(0.25);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: c.burstSize * 0.12,
      endRadius: c.burstSize * power,
      life: 0.55,
      intensity: c.burstIntensity,
      opacity: 0.75 * g.opacity,
      fresnel: 2.2,
      displace: 0.5,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.025
    });

    /* the crown's drops, booked like every other drip */
    const drops = Math.round(c.crownDrops * g.particleCount);
    const seedA = Math.random() * TAU;
    for (let n = 0; n < drops; n++) {
      const a = seedA + (n / Math.max(1, drops)) * TAU + (Math.random() - 0.5) * 0.4;
      const r = c.crownRadius * (1 + c.crownFlare * 0.6);
      _pos.set(this._centre.x + Math.cos(a) * r, c.crownHeight * (0.4 + Math.random() * 0.6), this._centre.z + Math.sin(a) * r);
      const sp = c.crownDropSpeed * (0.5 + Math.random() * 0.7);
      _vel.set(Math.cos(a) * sp * 0.75, sp * (0.5 + Math.random() * 0.5), Math.sin(a) * sp * 0.75);
      this._launchDrop(_pos, _vel, c.dripSize * (0.8 + Math.random() * 0.9));
    }

    /* sparks and acrid smoke thrown up */
    this._resetEmit(time);
    _pos.copy(this._centre).setY(0.3);
    _emit.position = _pos;
    _emit.radius = c.crownRadius * 0.6;
    _emit.direction = _up;
    _emit.speed = 4.5;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.size = c.moteSize * 1.3;
    _emit.life = c.moteLifetime * 0.8;
    this.motes.emit(Math.round(c.splashMotes * g.particleCount), _emit);

    _emit.radius = c.crownRadius;
    _emit.speed = 1.6;
    _emit.spread = 1;
    _emit.size = c.fumeSize;
    _emit.life = c.fumeLifetime * 0.8;
    _emit.spin = 0.5;
    this.fumes.emit(Math.round(c.splashFumes * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;

    this._splashHit();
    this._syncPool(0, 0);
  }

  /** A trailing blob dropping into the pool behind the glob. */
  _blobSplash(i) {
    const c = settings.miasma;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(this._centre).setY(0.2);
    _pos.x += (Math.random() - 0.5) * c.crownRadius;
    _pos.z += (Math.random() - 0.5) * c.crownRadius;
    _emit.position = _pos;
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = 2.6;
    _emit.spread = 0.8;
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime * 0.5;
    this.motes.emit(Math.round(c.splashMotes * 0.2 * g.particleCount), _emit);
    // A few drops kicked up — they hiss where they come down.
    for (let n = 0; n < 4 + i; n++) {
      const a = Math.random() * TAU;
      const sp = c.crownDropSpeed * 0.45;
      _vel.set(Math.cos(a) * sp, sp * 0.9, Math.sin(a) * sp);
      this._launchDrop(_pos, _vel, c.dripSize * 0.8);
    }
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.4);
  }

  /* ------------------------------------------------------------------ */
  /* The pool                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve the pool, the crown and the warp from settings.
   * @param {number} since seconds since the splash
   * @param {number} evapT 0..1 through the evaporation
   */
  _syncPool(since, evapT) {
    const c = settings.miasma;
    const g = settings.global;
    const spread = Easing.outCubic(saturate(since / Math.max(0.02, c.poolSpreadTime)));
    const creep = Math.max(0, since - c.poolSpreadTime) * c.poolCreep;
    const shrink = 1 - c.poolShrink * Easing.inQuad(evapT);
    this._poolRadius = Math.max(0.01, (c.poolRadius * spread + creep) * shrink);

    const ps = this._poolState;
    const reach = this._poolRadius * (1 + c.poolRagged + c.poolRunnels) + c.corrodeBand + 0.6;
    ps.quad = Math.max(1, reach * 2);
    ps.radius = this._poolRadius;
    ps.flow = this._poolFlow;
    ps.bubblePhase = this._bubblePhase;
    ps.evap = Easing.inOutQuad(evapT);
    ps.stainFade = smoothstep(saturate(c.stainLinger), 1, evapT);
    ps.splash = saturate(since / Math.max(0.05, c.rippleTime));
    ps.seed = this._seed;
    this.poolMaterial.userData.sync(ps);

    /* the crown */
    const crownAge = saturate(since / Math.max(0.05, c.crownTime));
    const cs = this._crownState;
    cs.age = crownAge;
    const rise = Easing.outCubic(saturate(crownAge * 2.6));
    const fall = Easing.inQuad(saturate((crownAge - 0.38) / 0.62));
    cs.height = c.crownHeight * g.explosionIntensity * rise * (1 - fall * 0.85);
    cs.radius = c.crownRadius * (0.45 + 0.75 * Easing.outCubic(crownAge));
    cs.seed = this._seed;
    this.crownMaterial.userData.sync(cs);
    this.crown.visible = crownAge < 1 && cs.height > 0.01;

    /* the shimmer: a gust off the splash, then the steady reek, then gone */
    const ws = this._warpState;
    ws.width = this._poolRadius * 2.4 + 1;
    ws.strength = (0.6 + 0.8 * (1 - saturate(since / 0.6))) * spread * (1 - Easing.inQuad(evapT));
    ws.seed = this._seed;
    this.warpMaterial.userData.sync(ws);
    this.warp.position.copy(this._centre);
    this.warp.updateMatrix();
    this.warp.visible = ws.strength > 0.004;
  }

  /** Fumes, bubbles and motes off the pool, scaled by `strength`. */
  _poolFx(dt, strength) {
    const c = settings.miasma;
    const g = settings.global;
    const time = frame.uTime.value;
    const R = this._poolRadius;

    const fumes = Math.round(this.fumeEmitter.tick(dt, c.fumeRate * strength) * g.particleCount);
    if (fumes > 0) {
      this._resetEmit(time);
      _emit.direction = _up;
      _emit.speed = c.fumeRise;
      _emit.spread = 0.35;
      _emit.size = c.fumeSize;
      _emit.life = c.fumeLifetime;
      _emit.spin = 0.5;
      for (let n = 0; n < fumes; n++) {
        this._poolPoint(R * 0.9, _pos);
        _pos.y = 0.15;
        _emit.position = _pos;
        this.fumes.emit(1, _emit);
      }
    }

    const bubbles = Math.round(this.bubbleEmitter.tick(dt, c.bubbleRate * strength) * g.particleCount);
    if (bubbles > 0) {
      this._resetEmit(time);
      _emit.direction = _up;
      _emit.speed = c.bubbleRise;
      _emit.spread = 0.1;
      _emit.size = c.bubbleSize;
      _emit.life = c.bubbleLifetime;
      for (let n = 0; n < bubbles; n++) {
        this._poolPoint(R * 0.8, _pos);
        _pos.y = 0.04;
        _emit.position = _pos;
        this.bubbles.emit(1, _emit);
      }
    }

    const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (motes > 0) {
      this._resetEmit(time);
      _emit.direction = _up;
      _emit.speed = c.moteRise;
      _emit.spread = 0.4;
      _emit.size = c.moteSize;
      _emit.life = c.moteLifetime;
      for (let n = 0; n < motes; n++) {
        this._poolPoint(R, _pos);
        _pos.y = 0.08;
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    }
  }

  /** A point in the pool, area-uniform within `r`. */
  _poolPoint(r, out) {
    const a = Math.random() * TAU;
    const d = r * Math.sqrt(Math.random());
    return out.set(this._centre.x + Math.cos(a) * d, 0, this._centre.z + Math.sin(a) * d);
  }

  onFade(dt, t) {
    const c = settings.miasma;
    this._advancePhases(dt);
    this._syncLooks();

    const evapT = t > 1 ? saturate(t - 1) : 0;
    // The glob is in the pool now; the blobs follow it down the same arc.
    const sRate = (c.speed * settings.global.speed) / Math.max(0.1, this.length);
    this._updateGlob(1 + this.impactTime * sRate);

    this._syncPool(t > 1 ? this.impactDuration + this.fadeTime : this.impactTime, evapT);
    this._updateDrips();
    this._updateSpatter();
    this._poolFx(dt, 1 - Easing.inQuad(evapT));

    /* the melt */
    this._scan -= dt;
    if (evapT < 0.5 && this._scan <= 0) {
      this._scan = SCAN_EVERY;
      this._catch(this._poolRadius * 0.85, false);
    }
    this._melt(dt, evapT);

    // The light settles over the pool and dims as it goes.
    this.position.copy(this._centre).setY(c.lightHeight);
  }

  /* ------------------------------------------------------------------ */
  /* The melt                                                            */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return this._grips[i];
    return null;
  }

  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    slot.dummy?.release();
    slot.dummy = null;
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
    }
    this._gripCount = 0;
  }

  /** The splash itself: everything in `splashRadius` is knocked down and caught. */
  _splashHit() {
    this._catch(settings.miasma.splashRadius, true);
  }

  /**
   * Catch every body within `radius` of the pool's middle. The living are
   * knocked down — back, away from the middle — and every body with a solver
   * is taken into a melt slot.
   */
  _catch(radius, splash) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.miasma;
    const g = settings.global;
    const found = field.findBodies(this._centre.x, this._centre.z, radius, this._found);
    const k = splash ? 1 : 0.35; // a pool creeping under a body only tips it over
    this._force.impulse = c.splashImpulse * k * g.explosionIntensity;
    this._force.lift = c.splashLift * k * g.explosionIntensity;
    this._force.spin = c.splashSpin;

    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      if (this._gripCount >= MAX_GRIPS) break;
      if (dummy.finished || this._gripOf(dummy)) continue;
      if (dummy.alive) {
        _dir.set(dummy.position.x - this._centre.x, 0, dummy.position.z - this._centre.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      }
      if (!dummy.bodyPoint(_at)) continue;
      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.depth = 0;
      slot.eaten = 0;
      slot.under = false;
    }
    this._found.length = 0;
  }

  /** Stain every caught body, then draw it down into the pool. */
  _melt(dt, evapT) {
    if (dt <= 0) return;
    const c = settings.miasma;
    const g = settings.global;
    // Fumes boiling off the bodies, shared out between them.
    const fumes = this.meltEmitter.tick(dt, c.meltFumes * this._gripCount) * g.particleCount;
    const share = this._gripCount > 0 ? fumes / this._gripCount : 0;

    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || dummy.alive || !dummy.bodyPoint(_at)) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      dummy.hold();
      // Pushed every frame: this is also what carries the live editor colours.
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.corrodeTime)), c.look);

      const melting = slot.time - c.meltDelay;
      if (melting > 0) {
        const wound = Easing.outCubic(saturate(melting / 0.4));
        const grab = saturate(c.meltGrip * dt) * wound;
        dummy.carry(this._field, grab, grab, saturate(c.meltBuoyancy) * wound);
        // The floor opens under it in step with the melt, never ahead of it.
        slot.depth = Math.max(slot.depth, Math.min(c.consumeDepth + 1, melting * c.meltSpeed + 0.35));
        dummy.sink(slot.depth);

        if (_at.y < 0.15) {
          slot.under = true;
          slot.eaten = Math.max(slot.eaten, saturate(-_at.y / Math.max(0.05, c.consumeDepth)));
        }
      }
      // The pool going: whatever is still held goes with it.
      if (evapT > 0) slot.eaten = Math.max(slot.eaten, saturate(evapT * 1.3));
      if (slot.eaten > 0) dummy.consume(slot.eaten);

      // It boils as it goes.
      const puffs = Math.floor(share + Math.random());
      if (puffs > 0 && slot.time > c.meltDelay * 0.5) {
        this._resetEmit(frame.uTime.value);
        _pos.set(_at.x, Math.max(0.1, _at.y + 0.2), _at.z);
        _emit.position = _pos;
        _emit.radius = 0.35;
        _emit.direction = _up;
        _emit.speed = c.fumeRise * 1.3;
        _emit.spread = 0.4;
        _emit.size = c.fumeSize * 0.7;
        _emit.life = c.fumeLifetime * 0.7;
        _emit.spin = 0.5;
        this.fumes.emit(puffs, _emit);
        _emit.speed = 0.2;
        _emit.size = c.bubbleSize;
        _emit.life = c.bubbleLifetime;
        _emit.spin = 0;
        this.bubbles.emit(1, _emit);
      }
      if (slot.eaten >= 1) this._dropGrip(i);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseGrips();
    for (let i = 0; i < MAX_DRIPS; i++) this._drips[i].live = false;
    this.glob.visible = false;
    this.blobs.visible = false;
    this.pool.visible = false;
    this.spatter.visible = false;
    this.crown.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    for (const geometry of [this.globGeometry, this.floorGeometry, this.spatterGeometry, this.crownGeometry, this.warpGeometry]) {
      geometry.dispose();
    }
    for (const material of [this.globMaterial, this.blobMaterial, this.poolMaterial, this.spatterMaterial, this.crownMaterial, this.warpMaterial]) {
      material.dispose();
    }
    this.blobs.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☣  Miasma Spit');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 10, 0.1, 'min range');
  R(cast, c, 'speed', 4, 60, 0.5, 'glob speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'pool lies bubbling (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightBubble', 0, 1, 0.01, 'guttering');
  R(light, c, 'lightHeight', 0, 4, 0.01, 'height over the pool');

  const glob = folder.addFolder('1 · Glob');
  const throwF = glob.addFolder('The throw');
  R(throwF, c, 'windup', 0, 1.5, 0.01, 'swells at the hand (s)');
  R(throwF, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(throwF, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(throwF, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(throwF, c, 'arcHeight', 0, 8, 0.05, 'lob height (m)');
  R(throwF, c, 'landHeight', 0, 1.5, 0.01, 'lands at height (m)');

  const shape = glob.addFolder('Silhouette');
  R(shape, c, 'globRadius', 0.05, 1.5, 0.005, 'radius (m)');
  R(shape, c, 'globWobble', 0, 0.6, 0.005, 'wobble');
  R(shape, c, 'globWobbleScale', 0.2, 6, 0.01, 'wobble scale');
  R(shape, c, 'globWobbleSpeed', 0, 20, 0.05, 'churn speed');
  R(shape, c, 'globLobes', 0, 0.8, 0.005, 'fused lobes');
  R(shape, c, 'globStretch', 0, 1.5, 0.01, 'stretch in flight');
  R(shape, c, 'globDrip', 0, 3, 0.01, 'hanging drip');
  R(shape, c, 'dripNeck', 0, 1, 0.01, 'drip neck pinch');
  R(shape, c, 'blobCount', 0, MAX_BLOBS, 1, 'trailing blobs');
  R(shape, c, 'blobSize', 0.05, 1, 0.01, 'blob size (× glob)');
  R(shape, c, 'blobGap', 0.05, 2, 0.01, 'blob spacing (m)');
  R(shape, c, 'blobWobble', 0, 2, 0.01, 'blob wobble (× glob)');

  const look = glob.addFolder('Shading');
  R(look, c, 'globOpacity', 0, 1, 0.01, 'body opacity');
  R(look, c, 'globMurk', 0, 1, 0.01, 'murk');
  R(look, c, 'globSwirlScale', 0.2, 6, 0.01, 'swirl scale');
  R(look, c, 'globFlowSpeed', 0, 8, 0.05, 'swirl speed');
  R(look, c, 'globInnerGlow', 0, 8, 0.05, 'inner glow');
  R(look, c, 'globRimGlow', 0, 8, 0.05, 'rim glow');
  R(look, c, 'globRimPower', 0.5, 8, 0.05, 'rim tightness');
  R(look, c, 'globSpecular', 0, 4, 0.01, 'highlight');
  R(look, c, 'globGloss', 4, 200, 1, 'gloss');
  R(look, c, 'globBubbles', 0, 4, 0.01, 'trapped gas');
  R(look, c, 'globBubbleScale', 0.5, 12, 0.05, 'gas scale');
  look.addColor(c, 'colorA').name('bile');
  look.addColor(c, 'colorB').name('rim');
  look.addColor(c, 'colorDeep').name('dark bile');
  look.addColor(c, 'colorGlow').name('toxic glow');

  const drips = folder.addFolder('2 · Drips & hiss');
  R(drips, c, 'dripRate', 0, 200, 1, 'drips/second');
  R(drips, c, 'dripSize', 0.01, 0.4, 0.005, 'drip size');
  R(drips, c, 'dripGravity', 1, 40, 0.1, 'gravity (m/s²)');
  R(drips, c, 'dripInherit', 0, 1, 0.01, 'keeps glob velocity');
  R(drips, c, 'dripSpread', 0, 6, 0.05, 'random kick (m/s)');
  R(drips, c, 'hissSize', 0.02, 1.5, 0.01, 'burn mark size (m)');
  R(drips, c, 'hissLife', 0.1, 10, 0.05, 'burn mark lasts (s)');
  R(drips, c, 'hissFlare', 0.01, 1, 0.01, 'hot share of its life');
  R(drips, c, 'hissGlow', 0, 10, 0.05, 'hiss glow');
  R(drips, c, 'hissStain', 0, 1, 0.01, 'burn opacity');
  R(drips, c, 'hissFumes', 0, 20, 1, 'steam puffs');
  R(drips, c, 'hissMotes', 0, 20, 1, 'sparks');
  Editor.gradient(drips, c, 'colorDrop', 'drip gradient');

  const pool = folder.addFolder('3 · Sludge pool');
  const poolShape = pool.addFolder('Spread');
  R(poolShape, c, 'poolRadius', 0.3, 8, 0.05, 'radius (m)');
  R(poolShape, c, 'poolSpreadTime', 0.02, 3, 0.01, 'spreads over (s)');
  R(poolShape, c, 'poolCreep', 0, 1, 0.005, 'creep (m/s)');
  R(poolShape, c, 'poolShrink', 0, 1, 0.01, 'shrinks as it dries');
  R(poolShape, c, 'poolRagged', 0, 0.8, 0.005, 'ragged edge');
  R(poolShape, c, 'poolRaggedScale', 0.2, 8, 0.05, 'edge scale');
  R(poolShape, c, 'poolRunnels', 0, 1.5, 0.01, 'runnels');
  R(poolShape, c, 'poolRunnelCount', 1, 30, 0.5, 'runnel count');
  R(poolShape, c, 'rippleTime', 0.05, 3, 0.01, 'impact ripple (s)');
  R(poolShape, c, 'evaporateTime', 0.1, 8, 0.05, 'evaporates over (s)');
  R(poolShape, c, 'stainLinger', 0, 1, 0.01, 'stain outlasts it');

  const surface = pool.addFolder('Surface');
  R(surface, c, 'poolFlowScale', 0.1, 6, 0.01, 'flow scale');
  R(surface, c, 'poolFlowSpeed', 0, 4, 0.01, 'flow speed');
  R(surface, c, 'poolBumps', 0, 2, 0.01, 'relief');
  R(surface, c, 'poolBubbleScale', 0.3, 10, 0.05, 'bubble cells/m');
  R(surface, c, 'poolBubbleSize', 0.02, 0.5, 0.005, 'bubble size');
  R(surface, c, 'poolBubbleDensity', 0, 1, 0.01, 'bubble density');
  R(surface, c, 'poolBubbleSpeed', 0, 5, 0.01, 'bubble cycles/s');
  R(surface, c, 'poolPopGlow', 0, 10, 0.05, 'pop flash');
  R(surface, c, 'poolSheen', 0, 2, 0.01, 'oily sheen');
  R(surface, c, 'poolSheenScale', 0.1, 6, 0.01, 'sheen bands');
  R(surface, c, 'poolSpecular', 0, 4, 0.01, 'highlight');
  R(surface, c, 'poolDepthFalloff', 0.05, 4, 0.01, 'edge → deep (m)');
  R(surface, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  surface.addColor(c, 'colorPoolBody').name('thin sludge');
  surface.addColor(c, 'colorPoolDeep').name('deep sludge');
  surface.addColor(c, 'colorPoolFoam').name('bubble domes');

  const eaten = pool.addFolder('Eaten floor');
  R(eaten, c, 'corrodeBand', 0, 3, 0.01, 'band (m)');
  R(eaten, c, 'corrodeDark', 0, 1, 0.01, 'stain opacity');
  R(eaten, c, 'corrodePitScale', 0.5, 30, 0.1, 'pits/m');
  R(eaten, c, 'corrodePits', 0, 1, 0.01, 'pitting');
  R(eaten, c, 'poolEdgeGlow', 0, 10, 0.05, 'seam glow');
  R(eaten, c, 'poolEdgeWidth', 0.005, 0.5, 0.001, 'seam width (m)');
  eaten.addColor(c, 'colorStain').name('stain');

  const splash = folder.addFolder('4 · Splash');
  R(splash, c, 'splashRadius', 0, 8, 0.05, 'catches bodies within (m)');
  R(splash, c, 'crownRadius', 0.05, 3, 0.01, 'crown foot (m)');
  R(splash, c, 'crownHeight', 0, 5, 0.01, 'crown height (m)');
  R(splash, c, 'crownFlare', 0, 3, 0.01, 'lip flare');
  R(splash, c, 'crownFingers', 2, 30, 1, 'fingers');
  R(splash, c, 'crownFingerLength', 0, 2, 0.01, 'finger length');
  R(splash, c, 'crownTime', 0.1, 3, 0.01, 'rises & falls (s)');
  R(splash, c, 'crownOpacity', 0, 1, 0.01, 'opacity');
  R(splash, c, 'crownTear', 0, 3, 0.01, 'tears apart');
  R(splash, c, 'crownDrops', 0, 120, 1, 'drops thrown');
  R(splash, c, 'crownDropSpeed', 0, 20, 0.1, 'drop speed');
  R(splash, c, 'burstSize', 0, 10, 0.05, 'splash shell (m)');
  R(splash, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(splash, c, 'shockRadius', 0, 12, 0.05, 'shockwave (m)');
  R(splash, c, 'splashMotes', 0, 300, 1, 'sparks');
  R(splash, c, 'splashFumes', 0, 150, 1, 'smoke');
  R(splash, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(splash, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(splash, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(splash, c, 'impactLight', 0, 6, 0.01, 'light punch (× intensity)');
  splash.addColor(c, 'colorBurstA').name('shell inner');
  splash.addColor(c, 'colorBurstB').name('shell mid');
  splash.addColor(c, 'colorBurstC').name('shell outer');
  splash.addColor(c, 'colorShockA').name('shockwave');
  splash.addColor(c, 'colorShockB').name('shockwave hot');
  splash.addColor(c, 'colorFlash').name('flash');

  const air = folder.addFolder('5 · Fumes, bubbles & motes');
  R(air, c, 'fumeRate', 0, 200, 1, 'fumes/second');
  R(air, c, 'fumeSize', 0.05, 4, 0.01, 'fume size');
  R(air, c, 'fumeLifetime', 0.1, 8, 0.05, 'fume lifetime');
  R(air, c, 'fumeRise', 0, 5, 0.01, 'fume rise (m/s)');
  R(air, c, 'fumeBuoyancy', -2, 3, 0.01, 'fume buoyancy');
  R(air, c, 'fumeOpacity', 0, 1, 0.01, 'fume opacity');
  R(air, c, 'fumeTurbulence', 0, 3, 0.01, 'fume turbulence');
  Editor.gradient(air, c, 'colorFume', 'fume gradient');
  R(air, c, 'bubbleRate', 0, 200, 1, 'bubbles/second');
  R(air, c, 'bubbleSize', 0.02, 1, 0.005, 'bubble size');
  R(air, c, 'bubbleLifetime', 0.05, 3, 0.01, 'bubble lifetime');
  R(air, c, 'bubbleRise', 0, 3, 0.01, 'bubble rise');
  Editor.gradient(air, c, 'colorBubble', 'bubble gradient');
  R(air, c, 'moteRate', 0, 200, 1, 'motes/second');
  R(air, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(air, c, 'moteLifetime', 0.1, 5, 0.05, 'mote lifetime');
  R(air, c, 'moteRise', 0, 5, 0.01, 'mote rise');
  R(air, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  R(air, c, 'trailMotes', 0, 300, 1, 'trail motes/second');
  Editor.gradient(air, c, 'colorMote', 'mote gradient');
  const warp = air.addFolder('Shimmer');
  R(warp, c, 'fumeWarp', 0, 4, 0.01, 'strength');
  R(warp, c, 'fumeWarpHeight', 0.2, 10, 0.05, 'height (m)');
  R(warp, c, 'fumeWarpScale', 0.1, 8, 0.01, 'noise scale');
  R(warp, c, 'fumeWarpSpeed', 0, 6, 0.05, 'noise speed');
  R(warp, c, 'fumeWarpFalloff', 0.1, 4, 0.01, 'thins with height');

  const melt = folder.addFolder('6 · The melt');
  R(melt, c, 'splashImpulse', 0, 12, 0.05, 'knocked back (m/s)');
  R(melt, c, 'splashLift', 0, 8, 0.05, 'lift (m/s)');
  R(melt, c, 'splashSpin', 0, 4, 0.01, 'tumble');
  R(melt, c, 'corrodeTime', 0.05, 4, 0.01, 'stained over (s)');
  R(melt, c, 'meltDelay', 0, 4, 0.01, 'melts after (s)');
  R(melt, c, 'meltSpeed', 0, 4, 0.01, 'sinks (m/s)');
  R(melt, c, 'meltPull', 0, 6, 0.01, 'drawn to the middle');
  R(melt, c, 'meltGrip', 0, 20, 0.05, 'grip');
  R(melt, c, 'meltBuoyancy', 0, 1, 0.01, 'held up by the sludge');
  R(melt, c, 'consumeDepth', 0.05, 3, 0.01, 'gone at depth (m)');
  R(melt, c, 'meltFumes', 0, 80, 1, 'boils off it (/s)');
  melt.addColor(c.look, 'color').name('rotted flesh');
  melt.addColor(c.look, 'rimColor').name('rim');
  R(melt, c.look, 'rimEmissive', 0, 6, 0.05, 'rim emissive');
  melt.addColor(c.look, 'edgeColor').name('melt edge');
  R(melt, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge emissive');
  R(melt, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  folder.close();
  return folder;
}
