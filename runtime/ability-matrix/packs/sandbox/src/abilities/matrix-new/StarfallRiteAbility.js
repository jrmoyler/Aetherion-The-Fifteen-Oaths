import { Mesh, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createStarQuadGeometry,
  createLinkGeometry,
  createMeteorGeometry
} from '../../assets/matrix-new/StarfallRiteGeometry.js';
import {
  createStarPointMaterial,
  createStarLineMaterial,
  createStarMeteorMaterial,
  createStarGroundMaterial,
  createStarBurstMaterial
} from '../../materials/matrix-new/StarfallRiteMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'starfall';

/** Hard ceiling on stars per cast. The editor's count slider clamps to this. */
const MAX_STARS = 16;
/** Extra loop-closing lines on top of the spanning tree. */
const MAX_EXTRA_LINKS = 4;
const MAX_LINKS = MAX_STARS - 1 + MAX_EXTRA_LINKS;
/** The star-point buffer has one more slot: the herald riding the travel. */
const HERALD = MAX_STARS;
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Seconds a trail takes to catch up with its head once the head has landed. */
const TRAIL_CATCH = 0.12;

const _emit = {};
const _pos = new Vector3();
const _sky = new Vector3();
const _land = new Vector3();
const _head = new Vector3();
const _tail = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _figure = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);

/* Prim's spanning tree, on fixed scratch — no allocation at spawn. */
const _inTree = new Uint8Array(MAX_STARS);
const _best = new Float32Array(MAX_STARS);
const _bestFrom = new Int8Array(MAX_STARS);

/**
 * STARFALL RITE — Light, zone cast.
 *
 * Read in three movements, on one clock that starts when the herald arrives:
 *
 *   1. **THE FIGURE** — a constellation draws itself in the sky over the
 *      circle. Its stars are placed by dice in a tilted disc; its lines are
 *      the figure's *spanning tree* (Prim's, so the shape reads as one drawn
 *      figure, not a scatter) plus a couple of loop-closing lines. The stars
 *      light in tree order and each line is drawn on from the star it hangs
 *      off toward the one it reaches, so you watch a hand drawing it.
 *   2. **THE FALL** — then the stars drop, one at a time. Each is announced on
 *      the floor first: light gathers under where it will land, a faint
 *      four-armed star reaching out as it nears. The star swells in the sky,
 *      leaves a ghost of itself in the figure, and falls as a small light
 *      meteor — a bright head and a long tapering additive trail.
 *   3. **THE CLOSE** — when the last has fallen the ghost figure dims and its
 *      lines fold toward their midpoints.
 *
 * ## Layers
 *
 *   - **star points** (`createStarPointMaterial`) — instanced billboards with a
 *     hot core, a halo and diffraction spikes, twinkling on noise.
 *   - **lines** (`createStarLineMaterial`) — instanced view-facing strips drawn
 *     on and closed off in the fragment stage, light running along them.
 *   - **meteors** (`createStarMeteorMaterial`) — instanced strips whose rows
 *     the vertex stage places in metres: a long tapering trail and a head of
 *     fixed size, sparkling, soft against the floor.
 *   - **floor telegraph** (`createStarGroundMaterial`) — a soft gathering of
 *     light under each landing point; a warm afterglow once it has landed.
 *   - **radiant bursts** (`createStarBurstMaterial`) — the star printed on the
 *     floor by each impact: sharp rays shooting out, a ring at their tips.
 *   - **impacts** — a SHOCKWAVE decal, a small AIR shell of light, glitter and
 *     sparks, a light punch, a flash and a shake; every body within
 *     `blastRadius` is killed and thrown away from the point
 *     (`handlesOwnHits`).
 *   - **star dust** — fine motes sifting down out of the figure while it hangs.
 *
 * ## The editor rule
 *
 * A star record holds only dice — its bearing and radius in the unit disc, a
 * depth jitter, its landing dice, its place in the fall — and the one event it
 * latches, its landing. The figure's size, height, tilt and drift, every
 * landing point, every time and every colour are resolved from
 * `settings.starfall` every frame; dragging `skyHeight` lifts a figure that is
 * already in the sky and re-aims the stars that are falling out of it.
 */
export class StarfallRiteAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Stars still in the sky or in the air. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < this._count; i++) if (!this.stars[i].landed) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- the floor: telegraph pools and radiant bursts ---- */
    this.telegraphGeometry = createStarQuadGeometry(MAX_STARS);
    this.telegraphMaterial = createStarGroundMaterial();
    this.telegraph = this._mesh(this.telegraphGeometry, this.telegraphMaterial, 6);

    this.burstGeometry = createStarQuadGeometry(MAX_STARS);
    this.burstMaterial = createStarBurstMaterial();
    this.bursts = this._mesh(this.burstGeometry, this.burstMaterial, 7);

    /* ---- the figure: lines, then stars over them ---- */
    this.linkGeometry = createLinkGeometry(MAX_LINKS);
    this.linkMaterial = createStarLineMaterial();
    this.links = this._mesh(this.linkGeometry, this.linkMaterial, 12);

    this.starGeometry = createStarQuadGeometry(MAX_STARS + 1);
    this.starMaterial = createStarPointMaterial();
    this.points = this._mesh(this.starGeometry, this.starMaterial, 14);

    /* ---- the falling stars ---- */
    this.meteorGeometry = createMeteorGeometry(MAX_STARS);
    this.meteorMaterial = createStarMeteorMaterial();
    this.meteors = this._mesh(this.meteorGeometry, this.meteorMaterial, 15);

    /** Dice only — see the class comment. */
    this.stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      this.stars.push({
        angle: 0, // bearing in the figure
        radial: 0, // 0..1 radius in the figure (already area-uniform)
        depth: 0, // -1..1 height jitter
        size: 0, // -1..1 size jitter
        seed: 0,
        draw: 0, // 0..1 when it lights during the drawing
        order: 0, // 0..1 slot in the fall, even
        orderRand: 0, // 0..1 the same, rolled
        evenAngle: 0, // landing dice
        evenArea: 0,
        randAngle: 0,
        randArea: 0,
        parent: -1, // the star its tree line hangs off
        landed: false,
        launched: false,
        glitter: new RateEmitter()
      });
    }
    /** Lines: pairs of star indices; tree lines first, then the loop closers. */
    this._linkA = new Int8Array(MAX_LINKS);
    this._linkB = new Int8Array(MAX_LINKS);
    this._linkCount = 0;
    this._treeLinks = 0;
    this._count = 0;
    this._clock = -1;
    this._drift = 0;
    this._seed = 0;

    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._lightAt = new Vector3();
  }

  _mesh(geometry, material, order) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.glitter = particles.get('starfall.glitter', {
      capacity: 3000,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.glitter.uniforms.uDrag.value = 1.8;
    this.glitter.uniforms.uEndSize.value = 0.25;
    this.glitter.uniforms.uSizeIn.value = 0.03;
    this.glitter.uniforms.uFadeIn.value = 0.02;
    this.glitter.uniforms.uFadeOut.value = 0.55;

    this.sparks = particles.get('starfall.spark', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.6;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.dust = particles.get('starfall.dust', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.dust.uniforms.uDrag.value = 0.8;
    this.dust.uniforms.uEndSize.value = 0.4;
    this.dust.uniforms.uSizeIn.value = 0.1;
    this.dust.uniforms.uFadeIn.value = 0.15;
    this.dust.uniforms.uFadeOut.value = 0.5;

    this.dustEmitter = new RateEmitter();
    this.heraldEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _drawTime() {
    return Math.max(0.05, settings.starfall.drawTime * settings.global.lifetime);
  }

  _span() {
    return Math.max(0.05, settings.starfall.lifetime * settings.global.lifetime);
  }

  _fallTime() {
    return Math.max(0.05, settings.starfall.fallTime);
  }

  /** Seconds after the herald lands that the first star leaves the sky. */
  _firstLaunch() {
    return this._drawTime() + Math.max(0, settings.starfall.holdTime);
  }

  get impactDuration() {
    const c = settings.starfall;
    return this._firstLaunch() + this._span() + this._fallTime() + Math.max(0, c.linger * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.starfall.fadeTime * settings.global.lifetime);
  }

  /** Starlight does not gutter; it breathes, faintly. */
  lightShimmer() {
    return 0.92 + 0.08 * Math.sin(this.age * 4.1) * Math.sin(this.age * 1.7);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.starfall;
    const n = Math.min(MAX_STARS, Math.max(2, Math.round(c.starCount)));
    this._count = n;
    this._clock = -1;
    this._drift = Math.random() * TAU;
    this._seed = Math.random() * 100;
    this.dustEmitter.reset();
    this.heraldEmitter.reset();
    this._lightAt.copy(this.origin);

    /* --- the figure: dice in a unit disc, kept apart --- */
    const turn = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const s = this.stars[i];
      // Sunflower placement, jittered: spread like a constellation, never clumped.
      s.angle = turn + i * GOLDEN + randRange(-0.35, 0.35);
      s.radial = Math.sqrt((i + 0.5 + randRange(-0.35, 0.35)) / n);
      s.depth = randRange(-1, 1);
      s.size = randRange(-1, 1);
      s.seed = Math.random();
      s.evenAngle = turn + ((i * 5 + 2) % n) * GOLDEN;
      s.evenArea = (((i * 5 + 2) % n) + 0.5) / n;
      s.randAngle = Math.random() * TAU;
      s.randArea = Math.random();
      s.orderRand = Math.random();
      s.landed = false;
      s.launched = false;
      s.glitter.reset();
    }
    for (let i = n; i < MAX_STARS; i++) {
      this.stars[i].landed = true;
      this.stars[i].launched = true;
    }

    this._buildFigure(n, c);
    this._resetBuffers();
    this._syncAll(0);
  }

  /**
   * Prim's spanning tree over the unit layout, plus loop-closing lines.
   *
   * The tree gives the drawing order for free: Prim's adds stars one at a
   * time, each joined to the nearest star already in the figure, which is
   * exactly how a hand would draw it. The extra lines join a star to its
   * nearest neighbour it is not already joined to, so they close small loops
   * the way real asterisms do, rather than spanning the figure.
   */
  _buildFigure(n, c) {
    const S = this.stars;
    const ux = (i) => S[i].radial * Math.cos(S[i].angle);
    const uy = (i) => S[i].radial * Math.sin(S[i].angle);

    // Start from the star nearest the rim on the caster's side, so the
    // drawing begins where the eye already is.
    let start = 0;
    let bestStart = Infinity;
    for (let i = 0; i < n; i++) {
      const v = uy(i) - S[i].radial * 0.5;
      if (v < bestStart) {
        bestStart = v;
        start = i;
      }
    }

    _inTree.fill(0);
    _best.fill(Infinity);
    _bestFrom.fill(-1);
    _inTree[start] = 1;
    S[start].parent = -1;
    S[start].draw = 0;
    for (let i = 0; i < n; i++) {
      if (i === start) continue;
      const dx = ux(i) - ux(start);
      const dy = uy(i) - uy(start);
      _best[i] = dx * dx + dy * dy;
      _bestFrom[i] = start;
    }

    let links = 0;
    for (let step = 1; step < n; step++) {
      let pick = -1;
      let d = Infinity;
      for (let i = 0; i < n; i++) {
        if (!_inTree[i] && _best[i] < d) {
          d = _best[i];
          pick = i;
        }
      }
      if (pick < 0) break;
      _inTree[pick] = 1;
      S[pick].parent = _bestFrom[pick];
      S[pick].draw = step / (n - 1);
      this._linkA[links] = _bestFrom[pick];
      this._linkB[links] = pick;
      links++;
      for (let i = 0; i < n; i++) {
        if (_inTree[i]) continue;
        const dx = ux(i) - ux(pick);
        const dy = uy(i) - uy(pick);
        const dd = dx * dx + dy * dy;
        if (dd < _best[i]) {
          _best[i] = dd;
          _bestFrom[i] = pick;
        }
      }
    }
    this._treeLinks = links;

    const extras = Math.min(MAX_EXTRA_LINKS, Math.max(0, Math.round(c.extraLinks)));
    for (let e = 0; e < extras && links < MAX_LINKS; e++) {
      const a = (Math.random() * n) | 0;
      let b = -1;
      let d = Infinity;
      for (let i = 0; i < n; i++) {
        if (i === a || this._linked(a, i, links)) continue;
        const dx = ux(i) - ux(a);
        const dy = uy(i) - uy(a);
        const dd = dx * dx + dy * dy;
        if (dd < d) {
          d = dd;
          b = i;
        }
      }
      if (b < 0) continue;
      this._linkA[links] = a;
      this._linkB[links] = b;
      links++;
    }
    this._linkCount = links;

    // The fall order, evenly: the order the stars were drawn in.
    for (let i = 0; i < n; i++) this.stars[i].order = this.stars[i].draw;
  }

  _linked(a, b, count) {
    for (let k = 0; k < count; k++) {
      if ((this._linkA[k] === a && this._linkB[k] === b) || (this._linkA[k] === b && this._linkB[k] === a)) return true;
    }
    return false;
  }

  _resetBuffers() {
    for (const geometry of [this.starGeometry, this.telegraphGeometry, this.burstGeometry]) {
      geometry.attributes.aStar.array.fill(0);
      geometry.attributes.aGlow.array.fill(0);
      geometry.attributes.aStar.needsUpdate = true;
      geometry.attributes.aGlow.needsUpdate = true;
    }
    this.linkGeometry.attributes.aLink.array.fill(0);
    this.linkGeometry.attributes.aLink.needsUpdate = true;
    this.meteorGeometry.attributes.aHead.array.fill(0);
    this.meteorGeometry.attributes.aHead.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Resolving a star — every metre and second comes from here           */
  /* ------------------------------------------------------------------ */

  /** Where the figure hangs: over the circle, set back toward the caster. */
  _figureCentre(c, out) {
    this.pointAt(1, _centre);
    out.copy(_centre).addScaledVector(this.direction, -c.skyOffset);
    out.y = c.skyHeight;
    return out;
  }

  /** Star `s` in the sky, world space. */
  _skyPoint(s, c, out) {
    const a = s.angle + this._drift;
    const r = s.radial * c.skyRadius;
    const u = Math.cos(a) * r; // along `side`
    const v = Math.sin(a) * r; // along `direction`
    // Tilted about the side axis: the far edge up, so the figure faces the caster.
    const ct = Math.cos(c.skyTilt);
    const st = Math.sin(c.skyTilt);
    out.copy(_figure).addScaledVector(this.side, u).addScaledVector(this.direction, v * ct);
    out.y += v * st + s.depth * c.skyDepth * 0.5 * settings.global.randomness;
    return out;
  }

  /** Where star `s` lands, on the floor, inside the live circle. */
  _landPoint(s, c, out) {
    const g = settings.global;
    const scatter = saturate(c.scatter * g.randomness);
    const area = lerp(s.evenArea, s.randArea, scatter);
    const angle = s.evenAngle + (s.randAngle - Math.PI) * scatter * 0.35;
    const R = Math.max(0.1, c.zoneRadius * c.landSpread);
    const reach = R * Math.sqrt(saturate(area));
    let x = Math.cos(angle) * reach;
    let z = Math.sin(angle) * reach;

    // Pulled toward the point under its own star, so the fall reads as the
    // figure coming down rather than stars thrown at random.
    this._skyPoint(s, c, _sky);
    let ux = _sky.x - _centre.x;
    let uz = _sky.z - _centre.z;
    const ul = Math.hypot(ux, uz);
    if (ul > R) {
      ux *= R / ul;
      uz *= R / ul;
    }
    const bias = saturate(c.landBias);
    x = lerp(x, ux, bias);
    z = lerp(z, uz, bias);
    return out.set(_centre.x + x, 0, _centre.z + z);
  }

  /** Seconds after the herald lands that star `s` leaves the sky. */
  _launchTime(s, c) {
    const order = lerp(s.order, s.orderRand, saturate(c.orderJitter * settings.global.randomness));
    return this._firstLaunch() + order * this._span();
  }

  _starSize(s, c) {
    return Math.max(0.01, c.starSize * (1 + s.size * c.sizeJitter * settings.global.randomness));
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncAll(dt) {
    const c = settings.starfall;
    const g = settings.global;

    this.starMaterial.userData.sync();
    this.linkMaterial.userData.sync();
    this.meteorMaterial.userData.sync();
    this.telegraphMaterial.userData.sync();
    this.burstMaterial.userData.sync();

    this.glitter.setGradient(getColor(c.colorGlitterA), getColor(c.colorGlitterB), getColor(c.colorGlitterC), getColor(c.colorGlitterD));
    this.glitter.uniforms.uGravity.value.set(0, c.glitterGravity, 0);
    this.glitter.uniforms.uSizeScale.value = c.glitterSize * g.particleSize * 7;
    this.glitter.uniforms.uLifeScale.value = g.particleLifetime;
    this.glitter.uniforms.uSpeedScale.value = g.particleSpeed;
    this.glitter.uniforms.uOpacity.value = g.opacity;
    this.glitter.uniforms.uGlow.value = c.glitterGlow * g.glow;
    this.glitter.uniforms.uTurbulence.value = 0.25 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorGlitterA), getColor(c.colorGlitterB), getColor(c.colorGlitterC), getColor(c.colorGlitterD));
    this.sparks.uniforms.uGravity.value.set(0, -6, 0);
    this.sparks.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 7;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.glitterGlow * g.glow;
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    this.sparks.uniforms.uTurbulence.value = 0.1 * g.turbulence;

    this.dust.setGradient(getColor(c.colorGlitterA), getColor(c.colorGlitterB), getColor(c.colorGlitterC), getColor(c.colorGlitterD));
    this.dust.uniforms.uGravity.value.set(0, 0, 0);
    this.dust.uniforms.uSizeScale.value = c.dustSize * g.particleSize * 7;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = g.opacity;
    this.dust.uniforms.uGlow.value = c.dustGlow * g.glow;
    this.dust.uniforms.uTurbulence.value = 0.3 * g.turbulence;

    this._drift += c.skyDrift * dt * g.animationSpeed;
    this._figureCentre(c, _figure);
  }

  /**
   * Write every instance for this frame: stars, lines, meteors, telegraphs,
   * bursts — and land the stars whose time has come. Runs on a zero-length
   * frame too, so the editor reshapes a paused rite.
   */
  _updateRite(dt) {
    const c = settings.starfall;
    const g = settings.global;
    const n = this._count;
    const clock = this._clock;
    const drawTime = this._drawTime();
    const fallTime = this._fallTime();
    const lead = Math.max(0.05, c.telegraphLead);
    const charge = Math.max(0.01, c.chargeTime);

    let close = 0;
    if (this.phase === AbilityPhase.FADE) close = Easing.inOutCubic(saturate(this.fadeTime / this.fadeDuration));

    const starA = this.starGeometry.attributes.aStar.array;
    const starG = this.starGeometry.attributes.aGlow.array;
    const telA = this.telegraphGeometry.attributes.aStar.array;
    const telG = this.telegraphGeometry.attributes.aGlow.array;
    const burA = this.burstGeometry.attributes.aStar.array;
    const burG = this.burstGeometry.attributes.aGlow.array;
    const head = this.meteorGeometry.attributes.aHead.array;
    const tail = this.meteorGeometry.attributes.aTail.array;

    for (let i = 0; i < n; i++) {
      const s = this.stars[i];
      this._skyPoint(s, c, _sky);
      this._landPoint(s, c, _land);
      const size = this._starSize(s, c);

      const lightAt = s.draw * drawTime * 0.85;
      const launchAt = this._launchTime(s, c);
      const landAt = launchAt + fallTime;

      if (clock >= 0 && !s.launched && clock >= launchAt) s.launched = true;
      if (clock >= 0 && !s.landed && clock >= landAt) {
        this._landFx(s, c, g);
        s.landed = true;
      }

      /* --- the star in the figure --- */
      let level = 0;
      let flare = 0;
      let ghost = 0;
      if (clock >= lightAt) {
        const lit = saturate((clock - lightAt) / 0.18);
        level = Easing.outCubic(lit);
        flare = c.lightUpFlare * (1 - lit) * (1 - lit);
        if (!s.launched) {
          // Swelling before it drops.
          const k = saturate(1 - (launchAt - clock) / charge);
          flare += k * k * 1.5;
        } else {
          ghost = 1;
          level *= c.ghostLevel;
        }
      }
      level *= 1 - close;
      const k4 = i * 4;
      starA[k4] = _sky.x;
      starA[k4 + 1] = _sky.y;
      starA[k4 + 2] = _sky.z;
      starA[k4 + 3] = size * (1 + flare * 0.35);
      starG[k4] = level;
      starG[k4 + 1] = flare;
      starG[k4 + 2] = s.seed;
      starG[k4 + 3] = ghost;

      /* --- the meteor --- */
      let mLevel = 0;
      if (clock >= launchAt && clock < landAt + TRAIL_CATCH) {
        const t = saturate((clock - launchAt) / fallTime);
        const p = Math.pow(t, Math.max(0.2, c.fallCurve));
        _head.lerpVectors(_sky, _land, p);
        _dir.subVectors(_land, _sky);
        const pathLength = _dir.length();
        _dir.divideScalar(Math.max(1e-4, pathLength));
        let trail = Math.min(c.trailLength, pathLength * p);
        if (clock >= landAt) {
          // Landed: the trail runs down into the point and is gone.
          trail *= 1 - saturate((clock - landAt) / TRAIL_CATCH);
        }
        _tail.copy(_head).addScaledVector(_dir, -Math.max(0.01, trail));
        mLevel = clock >= landAt ? 1 - saturate((clock - landAt) / TRAIL_CATCH) : smoothstep(0, 0.08, t);
        head[k4] = _head.x;
        head[k4 + 1] = Math.max(0.02, _head.y);
        head[k4 + 2] = _head.z;
        tail[k4] = _tail.x;
        tail[k4 + 1] = _tail.y;
        tail[k4 + 2] = _tail.z;
        tail[k4 + 3] = s.seed;
        if (clock < landAt) this._trailFx(s, c, g, dt);
      }
      head[k4 + 3] = mLevel;

      /* --- the floor telegraph and afterglow --- */
      const warnFrom = launchAt - lead;
      let warn = 0;
      let appear = 0;
      let heat = 0;
      if (clock >= 0 && clock >= warnFrom && !s.landed) {
        warn = saturate((clock - warnFrom) / (lead + fallTime));
        appear = saturate((clock - warnFrom) / 0.25);
      } else if (s.landed) {
        heat = 1 - saturate((clock - landAt) / Math.max(0.05, c.afterglowTime * g.lifetime));
      }
      telA[k4] = _land.x;
      telA[k4 + 1] = 0.045;
      telA[k4 + 2] = _land.z;
      telA[k4 + 3] = c.telegraphRadius;
      telG[k4] = warn;
      telG[k4 + 1] = appear * (1 - close);
      telG[k4 + 2] = s.seed;
      telG[k4 + 3] = heat * (1 - close);

      /* --- the radiant burst --- */
      let age = 1;
      if (s.landed) age = (clock - landAt) / Math.max(0.05, c.burstLife);
      burA[k4] = _land.x;
      burA[k4 + 1] = 0.05;
      burA[k4 + 2] = _land.z;
      burA[k4 + 3] = age < 1 ? c.burstRadius * g.explosionIntensity : 0;
      burG[k4] = saturate(age);
      burG[k4 + 1] = 1;
      burG[k4 + 2] = s.seed;
      burG[k4 + 3] = Math.max(3, Math.round(c.burstRays));
    }

    this._updateLinks(c, close);

    this.starGeometry.instanceCount = MAX_STARS + 1;
    this.telegraphGeometry.instanceCount = n;
    this.burstGeometry.instanceCount = n;
    this.meteorGeometry.instanceCount = n;
    for (const geometry of [this.starGeometry, this.telegraphGeometry, this.burstGeometry]) {
      geometry.attributes.aStar.needsUpdate = true;
      geometry.attributes.aGlow.needsUpdate = true;
    }
    this.meteorGeometry.attributes.aHead.needsUpdate = true;
    this.meteorGeometry.attributes.aTail.needsUpdate = true;

    this.points.visible = true;
    this.links.visible = true;
    this.meteors.visible = true;
    this.telegraph.visible = true;
    this.bursts.visible = true;
  }

  /**
   * Tree lines draw from their parent's lighting to their child's; loop
   * closers draw over the last part of the drawing. A line dims once either of
   * its stars has fallen, and closes toward its midpoint in the fade.
   */
  _updateLinks(c, close) {
    const drawTime = this._drawTime();
    const clock = this._clock;
    const from = this.linkGeometry.attributes.aFrom.array;
    const to = this.linkGeometry.attributes.aTo.array;
    const link = this.linkGeometry.attributes.aLink.array;
    const starA = this.starGeometry.attributes.aStar.array;

    for (let k = 0; k < this._linkCount; k++) {
      const a = this._linkA[k];
      const b = this._linkB[k];
      const sa = this.stars[a];
      const sb = this.stars[b];
      let start;
      let end;
      if (k < this._treeLinks) {
        start = sa.draw * drawTime * 0.85;
        end = sb.draw * drawTime * 0.85;
      } else {
        start = drawTime * 0.8;
        end = drawTime;
      }
      const draw = clock < 0 ? 0 : saturate((clock - start) / Math.max(0.02, end - start));
      let level = draw > 0 ? 1 : 0;
      if (sa.launched || sb.launched) level = c.fallenLineLevel;

      const k3 = k * 3;
      from[k3] = starA[a * 4];
      from[k3 + 1] = starA[a * 4 + 1];
      from[k3 + 2] = starA[a * 4 + 2];
      to[k3] = starA[b * 4];
      to[k3 + 1] = starA[b * 4 + 1];
      to[k3 + 2] = starA[b * 4 + 2];
      const k4 = k * 4;
      link[k4] = Easing.inOutQuad(draw);
      link[k4 + 1] = level * (1 - close * 0.6);
      link[k4 + 2] = (sa.seed + sb.seed) * 3.1;
      link[k4 + 3] = close;
    }
    for (let k = this._linkCount; k < MAX_LINKS; k++) link[k * 4 + 1] = 0;

    this.linkGeometry.instanceCount = this._linkCount;
    this.linkGeometry.attributes.aFrom.needsUpdate = true;
    this.linkGeometry.attributes.aTo.needsUpdate = true;
    this.linkGeometry.attributes.aLink.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** Glitter shed off a falling star's head, drifting back up its trail. */
  _trailFx(s, c, g, dt) {
    const count = Math.round(s.glitter.tick(dt, c.trailGlitter) * g.particleCount);
    if (count <= 0) return;
    _emit.position = _head;
    _emit.radius = c.headSize * 0.5;
    _emit.direction = _pos.copy(_dir).negate();
    _emit.speed = 0.8;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.6;
    _emit.life = c.glitterLifetime * 0.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glitter.emit(count, _emit);
  }

  /** One star reaching the floor: the burst, the ring, the light — and the kill. */
  _landFx(s, c, g) {
    const time = frame.uTime.value;
    this._landPoint(s, c, _land);

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _land, {
      radius: c.ringRadius * g.explosionIntensity,
      life: c.ringLife,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB),
      height: 0.03
    });
    this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_land).setY(0.3), {
      radius: 0.1,
      endRadius: c.shellSize * g.explosionIntensity,
      life: c.shellLife,
      intensity: 2.2,
      opacity: 0.8 * g.opacity,
      squash: 0.6,
      colorA: getColor(c.colorBurstHot),
      colorB: getColor(c.colorBurstBody),
      colorC: getColor(c.colorBurstCool)
    });

    _emit.position = _pos.copy(_land).setY(0.15);
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.glitterSpeed;
    _emit.speedVariance = 0.7;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.09;
    _emit.sizeVariance = 0.6;
    _emit.life = c.glitterLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.glitter.emit(Math.round(c.glitterCount * g.particleCount), _emit);

    _emit.speed = c.sparkSpeed;
    _emit.spread = 1.0;
    _emit.size = 0.08;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * g.explosionIntensity, 7, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * g.explosionIntensity);
    this.lightBoost = Math.min(this.lightBoost + c.impactLight * g.explosionIntensity, c.impactLight * 3);
    this._lightAt.copy(_land);

    this._hit(c, s);
  }

  _hit(c, s) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(_land.x, _land.z, c.blastRadius, this._targets);
    if (found.length === 0) return;
    this._force.impulse = c.hitImpulse;
    this._force.lift = c.hitLift;
    this._force.spin = c.hitSpin;
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - _land.x, 0, dummy.position.z - _land.z);
      if (_dir.lengthSq() < 1e-6) {
        // Dead centre: thrown along the star's own heading.
        this._skyPoint(s, c, _sky);
        _dir.set(_land.x - _sky.x, 0, _land.z - _sky.z);
      }
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._targets.length = 0;
  }

  /** Fine star dust sifting down out of the figure while it hangs. */
  _dustFx(dt, strength) {
    const c = settings.starfall;
    const g = settings.global;
    const count = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    for (let k = 0; k < count; k++) {
      const s = this.stars[(Math.random() * this._count) | 0];
      if (!s || this._clock < s.draw * this._drawTime()) continue;
      this._skyPoint(s, c, _pos);
      _emit.position = _pos;
      _emit.radius = 0.6;
      _emit.direction = _down;
      _emit.speed = c.dustFall;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.4;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.6;
      _emit.life = c.dustLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.dust.emit(1, _emit);
    }
  }

  /** The herald: the extra star slot, riding the travel up into the sky. */
  _updateHerald(dt, visible) {
    const c = settings.starfall;
    const g = settings.global;
    const starA = this.starGeometry.attributes.aStar.array;
    const starG = this.starGeometry.attributes.aGlow.array;
    const k4 = HERALD * 4;
    if (!visible) {
      starG[k4] = 0;
      return;
    }
    starA[k4] = this.position.x;
    starA[k4 + 1] = this.position.y;
    starA[k4 + 2] = this.position.z;
    starA[k4 + 3] = c.heraldSize;
    starG[k4] = 1;
    starG[k4 + 1] = 0.6 + 0.4 * Math.sin(this.age * 20);
    starG[k4 + 2] = 0.37;
    starG[k4 + 3] = 0;

    const count = Math.round(this.heraldEmitter.tick(dt, c.heraldGlitter) * g.particleCount);
    if (count > 0) {
      _emit.position = this.position;
      _emit.radius = 0.08;
      _emit.direction = _down;
      _emit.speed = 0.6;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.8;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.5;
      _emit.life = c.glitterLifetime * 0.7;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      // The herald sheds the accent pair: pale light and warm gold.
      _emit.tint = getColor(Math.random() < 0.5 ? c.colorA : c.colorB);
      _emit.time = frame.uTime.value;
      this.glitter.emit(count, _emit);
      _emit.tint = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.starfall;
    this._clock = -1;
    this._syncAll(dt);

    // The herald climbs from the hand to the figure's centre as it travels.
    const k = Easing.inOutQuad(this.u);
    this.position.y = lerp(1.4, c.skyHeight, k);
    this.position.addScaledVector(this.direction, -c.skyOffset * k);
    this._updateRite(dt);
    this._updateHerald(dt, true);
    this.starGeometry.attributes.aStar.needsUpdate = true;
    this.starGeometry.attributes.aGlow.needsUpdate = true;
  }

  onImpact() {
    const c = settings.starfall;
    const g = settings.global;
    this._clock = 0;
    this._figureCentre(c, _figure);

    // The herald bursts into the figure's first light.
    _emit.position = _pos.copy(_figure);
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = 3;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glitterLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glitter.emit(Math.round(c.glitterCount * g.particleCount), _emit);

    this.pointAt(1, _centre);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * 1.05,
      life: 0.7,
      width: 0.04,
      intensity: 0.6,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB),
      height: 0.03
    });
    this.lightBoost = c.lightIntensity * 0.5;
    this._lightAt.copy(_centre);
  }

  onFade(dt) {
    const c = settings.starfall;
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;

    this._syncAll(dt);
    this._updateRite(dt);
    this._updateHerald(dt, false);

    let fade = 1;
    if (this.phase === AbilityPhase.FADE) fade = 1 - saturate(this.fadeTime / this.fadeDuration);
    this._dustFx(dt, fade);

    // The light settles over the circle, and jumps to each landing.
    this.pointAt(1, _centre);
    const pull = 1 - Math.exp(-3 * dt);
    this._lightAt.lerp(_centre, pull);
    this.position.set(this._lightAt.x, c.lightHeight, this._lightAt.z);
  }

  onDestroy() {
    this._clock = -1;
    this._count = 0;
    this._linkCount = 0;
    this.points.visible = false;
    this.links.visible = false;
    this.meteors.visible = false;
    this.telegraph.visible = false;
    this.bursts.visible = false;
  }

  dispose() {
    for (const geometry of [this.starGeometry, this.linkGeometry, this.meteorGeometry, this.telegraphGeometry, this.burstGeometry]) {
      geometry.dispose();
    }
    for (const material of [this.starMaterial, this.linkMaterial, this.meteorMaterial, this.telegraphMaterial, this.burstMaterial]) {
      material.dispose();
    }
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('✦  Starfall Rite');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'herald speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'heraldSize', 0.02, 1, 0.01, 'herald size (m)');
  R(cast, c, 'heraldGlitter', 0, 500, 1, 'herald glitter / s');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, warm');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'drawTime', 0.05, 5, 0.01, 'figure draws over');
  R(time, c, 'holdTime', 0, 3, 0.01, 'hangs complete for');
  R(time, c, 'lifetime', 0.05, 10, 0.05, 'stars fall over');
  R(time, c, 'fallTime', 0.05, 2, 0.01, 'one star falls for');
  R(time, c, 'telegraphLead', 0.05, 3, 0.01, 'mark before it drops');
  R(time, c, 'chargeTime', 0.01, 1.5, 0.01, 'swells before it drops');
  R(time, c, 'orderJitter', 0, 1, 0.01, 'drawing ↔ random order');
  R(time, c, 'linger', 0, 4, 0.05, 'linger after the last');
  R(time, c, 'fadeTime', 0.1, 5, 0.05, 'figure closes over');

  const sky = folder.addFolder('1 · The constellation');
  R(sky, c, 'starCount', 2, MAX_STARS, 1, 'stars');
  R(sky, c, 'extraLinks', 0, MAX_EXTRA_LINKS, 1, 'loop lines');
  R(sky, c, 'skyHeight', 2, 30, 0.1, 'height (m)');
  R(sky, c, 'skyRadius', 0.5, 12, 0.05, 'radius (m)');
  R(sky, c, 'skyDepth', 0, 6, 0.05, 'depth jitter (m)');
  R(sky, c, 'skyTilt', -1.4, 1.4, 0.01, 'tilt to caster (rad)');
  R(sky, c, 'skyOffset', -6, 6, 0.05, 'set back (m)');
  R(sky, c, 'skyDrift', -1, 1, 0.005, 'drift (rad/s)');

  const star = folder.addFolder('2 · Star points');
  R(star, c, 'starSize', 0.01, 1, 0.005, 'core (m)');
  R(star, c, 'sizeJitter', 0, 1, 0.01, 'size jitter');
  R(star, c, 'starIntensity', 0, 15, 0.05, 'intensity');
  R(star, c, 'starHalo', 0, 3, 0.01, 'halo');
  R(star, c, 'starHaloSize', 0.1, 6, 0.05, 'halo size');
  R(star, c, 'spikeLength', 1, 30, 0.1, 'spike length');
  R(star, c, 'spikeSharpness', 0.5, 30, 0.1, 'spike thinness');
  R(star, c, 'spikeGlow', 0, 4, 0.01, 'spike glow');
  R(star, c, 'spikeTurn', -1, 1, 0.005, 'spike turn (rad/s)');
  R(star, c, 'twinkle', 0, 1, 0.01, 'twinkle');
  R(star, c, 'twinkleSpeed', 0, 15, 0.05, 'twinkle speed');
  R(star, c, 'lightUpFlare', 0, 4, 0.05, 'flare on lighting');
  R(star, c, 'ghostLevel', 0, 1, 0.01, 'fallen ghost');
  star.addColor(c, 'colorStarCore').name('core');
  star.addColor(c, 'colorStarHalo').name('halo');
  star.addColor(c, 'colorStarSpike').name('spikes');

  const line = folder.addFolder('3 · Lines');
  R(line, c, 'lineWidth', 0.005, 0.5, 0.005, 'glow width (m)');
  R(line, c, 'lineCore', 0.02, 1, 0.01, 'core width');
  R(line, c, 'lineIntensity', 0, 8, 0.05, 'intensity');
  R(line, c, 'lineOpacity', 0, 1, 0.01, 'opacity');
  R(line, c, 'lineGap', 0, 2, 0.01, 'gap at stars (m)');
  R(line, c, 'lineShimmer', 0, 1, 0.01, 'shimmer');
  R(line, c, 'lineShimmerScale', 0.1, 8, 0.05, 'shimmer scale');
  R(line, c, 'lineShimmerSpeed', 0, 10, 0.05, 'shimmer speed');
  R(line, c, 'fallenLineLevel', 0, 1, 0.01, 'after a star falls');
  line.addColor(c, 'colorLineCore').name('core');
  line.addColor(c, 'colorLineGlow').name('glow');

  const fall = folder.addFolder('4 · Falling star');
  R(fall, c, 'landSpread', 0.1, 1.2, 0.01, 'spread (× circle)');
  R(fall, c, 'landBias', 0, 1, 0.01, 'falls straight down');
  R(fall, c, 'scatter', 0, 1, 0.01, 'scatter');
  R(fall, c, 'fallCurve', 0.3, 4, 0.05, 'acceleration');
  R(fall, c, 'trailLength', 0.2, 20, 0.1, 'trail (m)');
  R(fall, c, 'trailWidth', 0.005, 0.6, 0.005, 'trail width (m)');
  R(fall, c, 'trailTaper', 0.2, 4, 0.05, 'trail taper');
  R(fall, c, 'trailFalloff', 0.2, 6, 0.05, 'trail falloff');
  R(fall, c, 'trailSparkle', 0, 1, 0.01, 'sparkle');
  R(fall, c, 'trailSparkleScale', 0.1, 8, 0.05, 'sparkle scale');
  R(fall, c, 'headSize', 0.02, 1, 0.01, 'head (m)');
  R(fall, c, 'headGlow', 0, 8, 0.05, 'head glow');
  R(fall, c, 'meteorIntensity', 0, 15, 0.05, 'intensity');
  R(fall, c, 'meteorSoftFade', 0.01, 1, 0.01, 'soft fade (m)');
  R(fall, c, 'trailGlitter', 0, 300, 1, 'glitter / s');
  fall.addColor(c, 'colorHead').name('head');
  fall.addColor(c, 'colorTrail').name('trail');
  fall.addColor(c, 'colorTrailTip').name('trail tip');

  const tel = folder.addFolder('5 · Floor telegraph');
  R(tel, c, 'telegraphRadius', 0.1, 4, 0.05, 'radius (m)');
  R(tel, c, 'telegraphGlow', 0, 6, 0.05, 'glow');
  R(tel, c, 'telegraphOpacity', 0, 1, 0.01, 'opacity');
  R(tel, c, 'telegraphSoftness', 0.2, 3, 0.01, 'softness');
  R(tel, c, 'telegraphArms', 0, 5, 0.05, 'floor star');
  R(tel, c, 'telegraphBreath', 0, 1, 0.01, 'breathing');
  R(tel, c, 'afterglow', 0, 8, 0.05, 'afterglow');
  R(tel, c, 'afterglowTime', 0.05, 5, 0.05, 'afterglow cools over');
  tel.addColor(c, 'colorTelegraph').name('gathered light');
  tel.addColor(c, 'colorTelegraphHot').name('gathered, hot');

  const impact = folder.addFolder('6 · Impact');
  R(impact, c, 'burstRadius', 0.2, 8, 0.05, 'radiant star (m)');
  R(impact, c, 'burstLife', 0.1, 4, 0.05, 'radiant life');
  R(impact, c, 'burstGlow', 0, 10, 0.05, 'radiant glow');
  R(impact, c, 'burstRays', 3, 32, 1, 'rays');
  R(impact, c, 'burstRaySharpness', 2, 200, 1, 'ray thinness');
  R(impact, c, 'burstRayJitter', 0, 1, 0.01, 'ray jitter');
  R(impact, c, 'burstCore', 0, 6, 0.05, 'core');
  R(impact, c, 'burstRing', 0, 4, 0.05, 'ring');
  impact.addColor(c, 'colorBurstHot').name('hot');
  impact.addColor(c, 'colorBurstBody').name('body');
  impact.addColor(c, 'colorBurstCool').name('cooling');
  R(impact, c, 'ringRadius', 0.2, 10, 0.05, 'shock ring (m)');
  R(impact, c, 'ringLife', 0.05, 2, 0.01, 'ring life');
  impact.addColor(c, 'colorRingA').name('ring');
  impact.addColor(c, 'colorRingB').name('ring, hot');
  R(impact, c, 'shellSize', 0, 5, 0.05, 'light shell (m)');
  R(impact, c, 'shellLife', 0.05, 1.5, 0.01, 'shell life');
  R(impact, c, 'impactShake', 0, 1, 0.01, 'shake');
  R(impact, c, 'impactFlash', 0, 1, 0.01, 'flash');
  impact.addColor(c, 'colorFlash').name('flash');
  R(impact, c, 'impactLight', 0, 40, 0.5, 'light punch');

  const hit = impact.addFolder('Hits');
  R(hit, c, 'blastRadius', 0, 5, 0.05, 'blast radius (m)');
  R(hit, c, 'hitImpulse', 0, 20, 0.1, 'impulse');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');

  const glitter = folder.addFolder('7 · Glitter, sparks & dust');
  R(glitter, c, 'glitterCount', 0, 200, 1, 'glitter per impact');
  R(glitter, c, 'glitterSpeed', 0, 15, 0.1, 'glitter speed');
  R(glitter, c, 'glitterSize', 0.01, 0.3, 0.005, 'glitter size');
  R(glitter, c, 'glitterLifetime', 0.1, 4, 0.05, 'glitter lifetime');
  R(glitter, c, 'glitterGravity', -10, 4, 0.05, 'glitter gravity');
  R(glitter, c, 'glitterGlow', 0, 8, 0.05, 'glitter glow');
  Editor.gradient(glitter, c, 'colorGlitter', 'glitter colour');
  R(glitter, c, 'sparkCount', 0, 120, 1, 'sparks per impact');
  R(glitter, c, 'sparkSpeed', 0, 25, 0.1, 'spark speed');
  R(glitter, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(glitter, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(glitter, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  R(glitter, c, 'dustRate', 0, 200, 1, 'star dust / s');
  R(glitter, c, 'dustSize', 0.005, 0.3, 0.005, 'dust size');
  R(glitter, c, 'dustFall', 0, 5, 0.05, 'dust fall (m/s)');
  R(glitter, c, 'dustLifetime', 0.1, 6, 0.05, 'dust lifetime');
  R(glitter, c, 'dustGlow', 0, 6, 0.05, 'dust glow');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 10, 0.05, 'height (m)');
}
