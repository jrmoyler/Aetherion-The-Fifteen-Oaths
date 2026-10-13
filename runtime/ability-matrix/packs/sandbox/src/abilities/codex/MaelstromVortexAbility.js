import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createFunnelGeometry,
  createGeyserGeometry,
  createWarpGeometry
} from '../../assets/codex/MaelstromVortexGeometry.js';
import {
  createFunnelMaterial,
  createGeyserMaterial,
  createMaelstromWarpMaterial
} from '../../materials/codex/MaelstromVortexMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'maelstrom';

const TAU = Math.PI * 2;
const GRAVITY = 9.8;

/** How many bodies one whirlpool can have hold of at once. */
const MAX_GRIPS = 12;
/** Ceiling on the spring toward a body's place on the spiral, m/s. */
const MAX_PULL = 9;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _at = new Vector3();
const _centre = new Vector3();
const _hand = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * MAELSTROM VORTEX — the floor turns to water and opens into a whirlpool.
 *
 * A zone cast. A bead of water is lobbed to the circle and bursts; the floor
 * inside floods from the middle out, the middle gives way, and the water
 * winds itself into a funnel. Bodies in it are dragged onto the rim, spun
 * round it faster and faster on a tightening spiral, and pulled down the eye.
 * When it is done the eye closes with a geyser, and a ring of wet foam is left
 * on the stone.
 *
 * Seven layers, each a folder in the editor:
 *
 *   1. **the funnel** — one bespoke surface (`createFunnelMaterial`): a polar
 *      grid dropped in the vertex stage into the whirlpool — shallow open
 *      water, a plunge toward the eye, a throat, a raised turning lip and a
 *      spiral swell on the wall. The fragment draws spiralling flow lines that
 *      turn faster toward the eye (advected by an angle integrated here, so a
 *      slider never jumps them), foam on the lip, on the swell's crests and at
 *      the water's edge, fresnel and the stage sky for reflection, glints, and
 *      depth darkening into an abyss. It writes its own depth so it can be seen
 *      *below* the opaque stage floor and still sort against itself and against
 *      the bodies standing on it — see the materials file.
 *   2. **the swirl** — a refraction proxy on `LAYER.DISTORTION` bending the
 *      world along the turn, in a band over the lip and inside it.
 *   3. **spray, foam, mist** — DROPLET spray thrown off the lip along the flow;
 *      foam flecks riding the surface round and in (the particle swirl about
 *      the centre with a negative expansion, so they spiral inward and sink
 *      out of sight as they go under the surface); a low spray mist over the
 *      rim.
 *   4. **the grip** — `handlesOwnHits`. Every body in the flooded circle is
 *      cut loose without a blow and held to a *path*: dragged onto the rim, then
 *      round it on a spiral whose radius closes on the eye over `spiralTime`
 *      while its angular speed winds up from `spinStart` to `spinEnd`. The
 *      carry field is the path's own velocity, a spring toward the body's place
 *      on it (off the body's centre, so the body is moved, not flattened) and a
 *      rigid spin about its own vertical. At the eye the floor is lowered under
 *      it (`Dummy#sink`) and it is pulled down; the stage floor hides it.
 *   5. **the geyser** — as the vortex closes, a column of water out of the eye
 *      (a shaped tube, streaks racing up, torn apart at the crown and falling
 *      back), a fountain of spray and jets, and anything still on the surface
 *      thrown up with it.
 *   6. **the splash** — on arrival: a water dome, ripple ring, a knock and a
 *      flash. And what is left: a FOAM stain and a ripple as the water drains.
 *   7. **the bead** — the cast's projectile: a glowing bead of water lobbed on
 *      an arc, shedding droplets.
 *
 * ## The editor rule
 *
 * A cast captures a seed and a few clocks (the turn of the water, the swell,
 * the vortex's own time). Every metre is resolved from `settings.maelstrom`
 * each frame: drag `zoneRadius` while it is standing and the water, the spray,
 * the swirl and every body's path re-scale around it.
 */
export class MaelstromVortexAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The whirlpool takes hold of what it catches; it does not hit anything. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies held. HUD readout only. */
  get instanceCount() {
    return this._gripCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the funnel ---- */
    this.funnelGeometry = createFunnelGeometry();
    this.funnelMaterial = createFunnelMaterial();
    this.funnel = new Mesh(this.funnelGeometry, this.funnelMaterial);
    this.funnel.name = 'MaelstromFunnel';
    this.funnel.layers.set(LAYER.VFX);
    // Early in the transparent pass: it replaces the floor, and everything
    // drawn after it (decals, spray, foam) sorts against the depth it writes.
    this.funnel.renderOrder = 3;
    this.funnel.frustumCulled = false;
    this.funnel.visible = false;
    this.group.add(this.funnel);

    /* ---- layer 2: the swirl ---- */
    this.warpGeometry = createWarpGeometry();
    this.warpMaterial = createMaelstromWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.name = 'MaelstromSwirl';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /* ---- layer 5: the geyser ---- */
    this.geyserGeometry = createGeyserGeometry();
    this.geyserMaterial = createGeyserMaterial();
    this.geyser = new Mesh(this.geyserGeometry, this.geyserMaterial);
    this.geyser.name = 'MaelstromGeyser';
    this.geyser.layers.set(LAYER.VFX);
    this.geyser.renderOrder = 13;
    this.geyser.frustumCulled = false;
    this.geyser.visible = false;
    this.group.add(this.geyser);

    this._funnelState = { radius: 1, open: 0, flood: 0, fade: 1, spin: 0, wavePhase: 0, seed: 0 };
    this._warpState = { radius: 1, open: 0, flood: 0, spin: 0, strength: 0 };
    this._geyserState = { rise: 0, dissolve: 0, phase: 0, seed: 0 };

    /* per-cast clocks */
    this._seed = 0;
    this._clock = 0;
    this._closeClock = 0;
    this._spin = 0;
    this._wavePhase = 0;
    this._columnPhase = 0;
    this._flood = 0;
    this._open = 0;
    this._openAtClose = 0;
    this._fade = 1;
    this._swell = 0;
    this._closing = false;
    this._stained = false;

    /* ---- layer 4: the grip ---- */
    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) {
      this._grips.push({ dummy: null, time: 0, theta: 0, rho0: 0, rho: 0, depth: 0, under: false });
    }
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** What the field reads — filled per body so sampling allocates nothing. */
    this._flow = { vx: 0, vy: 0, vz: 0, cx: 0, cz: 0, spin: 0 };
    this._field = (x, y, z, out) => this._sampleFlow(x, y, z, out);
    this._throwField = (x, y, z, out) => this._sampleThrow(x, y, z, out);
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: spray off the lip ---- */
    this.spray = particles.get('maelstrom.spray', {
      capacity: 2600,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.15
    });
    this.spray.uniforms.uSizeIn.value = 0.04;
    this.spray.uniforms.uFadeIn.value = 0.04;
    this.spray.uniforms.uFadeOut.value = 0.35;
    this.spray.uniforms.uEndSize.value = 0.6;
    this.spray.uniforms.uDrag.value = 0.35;
    this.spray.uniforms.uGravity.value.set(0, -GRAVITY, 0);

    /* ---- foam flecks riding round and in ---- */
    this.foam = particles.get('maelstrom.foam', {
      capacity: 1800,
      shape: ParticleShape.SOFT,
      additive: false,
      swirl: true,
      softFade: 0.1
    });
    this.foam.uniforms.uSizeIn.value = 0.1;
    this.foam.uniforms.uFadeIn.value = 0.12;
    this.foam.uniforms.uFadeOut.value = 0.4;
    this.foam.uniforms.uEndSize.value = 0.55;
    this.foam.uniforms.uDrag.value = 0.01;
    this.foam.uniforms.uGravity.value.set(0, 0, 0);

    /* ---- the mist over the rim ---- */
    this.mist = particles.get('maelstrom.mist', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      lit: true,
      softFade: 0.8
    });
    this.mist.uniforms.uSizeIn.value = 0.2;
    this.mist.uniforms.uFadeIn.value = 0.2;
    this.mist.uniforms.uFadeOut.value = 0.55;
    this.mist.uniforms.uEndSize.value = 2.0;
    this.mist.uniforms.uDrag.value = 1.4;

    /* ---- the bead's glow, and the geyser's jets ---- */
    this.glow = particles.get('maelstrom.glow', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.glow.uniforms.uSizeIn.value = 0.05;
    this.glow.uniforms.uFadeIn.value = 0.05;
    this.glow.uniforms.uFadeOut.value = 0.5;
    this.glow.uniforms.uEndSize.value = 0.3;
    this.glow.uniforms.uDrag.value = 2.0;
    this.glow.uniforms.uGravity.value.set(0, 0, 0);

    this.jets = particles.get('maelstrom.jets', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    });
    this.jets.uniforms.uSizeIn.value = 0.03;
    this.jets.uniforms.uFadeIn.value = 0.05;
    this.jets.uniforms.uFadeOut.value = 0.5;
    this.jets.uniforms.uEndSize.value = 0.4;
    this.jets.uniforms.uDrag.value = 0.6;
    this.jets.uniforms.uGravity.value.set(0, -GRAVITY * 0.6, 0);

    this.sprayEmitter = new RateEmitter();
    this.foamEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the whirlpool standing. */
  get impactDuration() {
    return Math.max(0.5, settings.maelstrom.lifetime * settings.global.lifetime);
  }

  /** The fade is the eye closing, the geyser, and the water draining away. */
  get fadeDuration() {
    return Math.max(0.3, settings.maelstrom.closeTime * settings.global.lifetime);
  }

  /** It surges with the swell rather than flickering. */
  lightShimmer() {
    const p = settings.maelstrom.lightPulse;
    return 1 - p * (1 - this._swell);
  }

  /* ------------------------------------------------------------------ */
  /* Geometry — every metre from live settings                           */
  /* ------------------------------------------------------------------ */

  /** The pool's radius, metres. */
  get radius() {
    const c = settings.maelstrom;
    return Math.max(0.3, c.zoneRadius * c.poolScale);
  }

  _centrePoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /**
   * The surface height at normalised radius `x`, without the swell. The CPU
   * copy of `funnelHeight` in MaelstromVortexMaterials — keep them together.
   */
  _surfaceAt(x) {
    const c = settings.maelstrom;
    const eye = Math.max(c.eyeRadius, 0.02);
    const depth = c.funnelDepth * this._open;
    const s = 1 - smoothstep(eye, 1, x);
    let h = -depth * Math.pow(s, Math.max(c.funnelCurve, 0.2));
    if (x < eye) h = -depth - c.throatDepth * this._open * Math.pow(1 - x / eye, 0.6);
    const d = (x - c.rimAt) / Math.max(c.rimWidth, 0.01);
    h += c.rimHeight * this._open * Math.exp(-d * d);
    return h;
  }

  /** The bead in flight: a lob from the hand to the circle. */
  _beadPoint(out) {
    const c = settings.maelstrom;
    _hand.copy(this.origin).addScaledVector(this.direction, 0.5);
    _hand.y = c.handHeight;
    this._centrePoint(out);
    out.y = 0.3;
    out.lerpVectors(_hand, out, this.u);
    out.y += Math.sin(this.u * Math.PI) * c.orbArc;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.sprayEmitter.reset();
    this.foamEmitter.reset();
    this.mistEmitter.reset();
    this.trailEmitter.reset();

    this._seed = Math.random() * 100;
    this._clock = 0;
    this._closeClock = 0;
    this._spin = Math.random() * TAU;
    this._wavePhase = Math.random() * TAU;
    this._columnPhase = 0;
    this._flood = 0;
    this._open = 0;
    this._openAtClose = 0;
    this._fade = 1;
    this._swell = 0;
    this._closing = false;
    this._stained = false;
    this._releaseGrips();

    this.funnel.visible = false;
    this.warp.visible = false;
    this.geyser.visible = false;
    this._sync();
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

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _advance(dt) {
    const c = settings.maelstrom;
    const g = settings.global;
    // The water turns faster as the funnel opens — the turn *is* the opening.
    this._spin += c.swirlSpeed * (0.2 + 0.8 * this._open) * this._fade * dt * g.animationSpeed;
    this._wavePhase += c.waveSpeed * dt * g.noiseSpeed;
    this._columnPhase += dt * g.noiseSpeed;
    // Two incommensurate sines: a swell with no period, never a pulse.
    const s = Math.sin(this.age * 1.7) + 0.8 * Math.sin(this.age * 2.75 + 1.3);
    this._swell = saturate(s / 3.6 + 0.5);
  }

  _sync() {
    const c = settings.maelstrom;
    const g = settings.global;
    const radius = this.radius;
    this._centrePoint(_centre);

    const fs = this._funnelState;
    fs.radius = radius;
    fs.open = this._open;
    fs.flood = this._flood;
    fs.fade = this._fade;
    fs.spin = this._spin;
    fs.wavePhase = this._wavePhase;
    fs.seed = this._seed;
    this.funnelMaterial.userData.sync(fs);
    this.funnel.position.copy(_centre);

    const ws = this._warpState;
    ws.radius = radius;
    ws.open = this._open;
    ws.flood = this._flood;
    ws.spin = this._spin;
    ws.strength = saturate(this._flood) * (0.35 + 0.65 * this._open) * this._fade;
    this.warpMaterial.userData.sync(ws);
    this.warp.position.copy(_centre);

    this.geyser.position.copy(_centre);
    this._geyserState.phase = this._columnPhase;
    this._geyserState.seed = this._seed;
    this.geyserMaterial.userData.sync(this._geyserState);

    /* the particles' looks */
    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const s = this.spray.uniforms;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uStretch.value = 0.12;
    s.uTurbulence.value = 0.1 * g.turbulence;

    this.foam.setGradient(getColor(c.colorFoamA), getColor(c.colorFoamB), getColor(c.colorFoamC), getColor(c.colorFoamD));
    const f = this.foam.uniforms;
    // Clockwise from above, the way the water turns (see the funnel's advection).
    f.uSwirl.value = -c.foamSwirl * (0.3 + 0.7 * this._open) * g.animationSpeed;
    f.uSwirlExpand.value = -saturate(c.foamInward);
    f.uSizeScale.value = g.particleSize;
    f.uLifeScale.value = g.particleLifetime;
    f.uSpeedScale.value = g.particleSpeed;
    f.uOpacity.value = c.foamOpacity * g.opacity;
    f.uTurbulence.value = 0.02 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.5 * g.turbulence;
    m.uGravity.value.set(0, 0.1, 0);

    this.glow.setGradient(getColor(c.colorSprayA), getColor(c.colorRippleA), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const gl = this.glow.uniforms;
    gl.uSizeScale.value = g.particleSize;
    gl.uLifeScale.value = g.particleLifetime;
    gl.uSpeedScale.value = g.particleSpeed;
    gl.uOpacity.value = g.opacity;
    gl.uGlow.value = 1.6 * g.glow;

    this.jets.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const j = this.jets.uniforms;
    j.uSizeScale.value = g.particleSize;
    j.uLifeScale.value = g.particleLifetime;
    j.uSpeedScale.value = g.particleSpeed;
    j.uOpacity.value = g.opacity;
    j.uGlow.value = 1.4 * g.glow;
    j.uStretch.value = 0.18;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the bead                                                   */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.maelstrom;
    const g = settings.global;
    this._advance(dt);
    this._sync();
    this._beadPoint(this.position);

    const time = frame.uTime.value;
    this._resetEmit(time);
    // The bead itself: a cluster of bright water redrawn every frame.
    _emit.position = this.position;
    _emit.radius = c.orbSize * 0.5;
    _emit.speed = 0.3;
    _emit.spread = 1;
    _emit.size = c.orbSize * 1.6;
    _emit.life = 0.12;
    _emit.lifeVariance = 0.2;
    this.glow.emit(Math.max(1, Math.round(3 * g.particleCount)), _emit);

    // ... and the droplets it sheds.
    const drops = Math.round(this.trailEmitter.tick(dt, c.orbTrailRate) * g.particleCount);
    if (drops > 0) {
      _emit.radius = c.orbSize * 0.8;
      _emit.direction = _dir.copy(this.direction).negate().setY(0.4).normalize();
      _emit.speed = 1.5;
      _emit.spread = 0.6;
      _emit.size = c.orbTrailSize;
      _emit.life = c.orbTrailLife;
      _emit.lifeVariance = 0.4;
      this.spray.emit(drops, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the splash, then the whirlpool                             */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.maelstrom;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._clock = 0;
    this._centrePoint(_centre);

    this.funnel.visible = true;
    this.warp.visible = true;

    this.ctx.bursts.spawn(BurstMode.WATER, _pos.copy(_centre).setY(0.2), {
      radius: c.splashSize * 0.15,
      endRadius: c.splashSize * power,
      life: 0.6,
      intensity: c.splashIntensity,
      opacity: 0.6,
      fresnel: 2.6,
      displace: 0.3,
      squash: 0.5,
      colorA: getColor(c.colorSplashA),
      colorB: getColor(c.colorSplashB),
      colorC: getColor(c.colorSplashC)
    });
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: c.rippleRadius * power,
      life: 1.2,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorRippleA),
      colorB: getColor(c.colorRippleB)
    });

    /* the bead bursting */
    this._resetEmit(time);
    _pos.copy(_centre).setY(0.2);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.spraySpeed * 1.4;
    _emit.spread = 0.9;
    _emit.size = c.spraySize * 1.4;
    _emit.life = c.sprayLifetime;
    this.spray.emit(Math.round(140 * g.particleCount), _emit);
    _emit.size = c.mistSize;
    _emit.speed = 1.5;
    _emit.life = c.mistLifetime;
    _emit.spin = 0.4;
    this.mist.emit(Math.round(14 * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  onFade(dt, t) {
    const c = settings.maelstrom;

    if (t <= 1) {
      /* the whirlpool stands: flood, open, turn, take */
      this._clock += dt;
      this._flood = Easing.outCubic(saturate(this._clock / Math.max(0.05, c.floodTime)));
      this._open = Easing.inOutCubic(saturate((this._clock - c.openDelay) / Math.max(0.05, c.openTime)));
      this._fade = 1;
      this._advance(dt);
      this._sync();
      if (this._clock > 0.08) this._capture();
      this._drag(dt);
      this._standingFx(dt, 1);
      this.ctx.shake.rumble(c.vortexRumble * this._open, dt);
    } else {
      /* closing: the eye throws its geyser and the water drains away */
      const ct = saturate(t - 1);
      if (!this._closing) this._close();
      this._closeClock += dt;
      const close = Easing.inOutCubic(saturate(ct / 0.3));
      this._open = this._openAtClose * (1 - close);
      this._fade = 1 - smoothstep(0.3, 1, ct);
      this._advance(dt);

      const gs = this._geyserState;
      const gt = this._closeClock / Math.max(0.1, c.geyserTime * settings.global.lifetime);
      gs.rise = Easing.outCubic(saturate(gt / 0.3));
      gs.dissolve = smoothstep(0.35, 1, gt);
      this.geyser.visible = gt < 1.05;
      this._sync();
      this._drag(dt);
      this._standingFx(dt, this._fade * (1 - close * 0.6));

      if (!this._stained && ct >= 0.3) {
        this._stained = true;
        this._stainFx();
      }
    }

    this._centrePoint(this.position);
    this.position.y = 1.0;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Spray off the lip, foam riding in, mist over the rim — × `strength`. */
  _standingFx(dt, strength) {
    const c = settings.maelstrom;
    const g = settings.global;
    const time = frame.uTime.value;
    const R = this.radius;
    const flood = this._flood;
    const open = this._open;

    /* spray: thrown off the turning lip along the flow */
    const drops = Math.round(this.sprayEmitter.tick(dt, c.sprayRate * strength * open) * g.particleCount);
    if (drops > 0) {
      this._resetEmit(time);
      _emit.size = c.spraySize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sprayLifetime;
      _emit.spread = 0.22;
      _emit.speedVariance = 0.4;
      const lip = c.rimHeight * open + 0.06;
      for (let n = 0; n < drops; n++) {
        const a = Math.random() * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const rr = R * c.rimAt * flood;
        _pos.set(_centre.x + ca * rr, lip, _centre.z + sa * rr);
        // Clockwise tangent, a little outward, and up.
        _vel.set(sa, 0, -ca).multiplyScalar(c.spraySpeed * (0.6 + 0.4 * this._swell))
          .addScaledVector(_dir.set(ca, 0, sa), c.spraySpeed * 0.25)
          .addScaledVector(_up, c.sprayLift * (0.6 + 0.6 * this._swell));
        const sp = _vel.length();
        _emit.position = _pos;
        _emit.direction = _dir.copy(_vel).divideScalar(Math.max(sp, 1e-4));
        _emit.speed = sp;
        this.spray.emit(1, _emit);
      }
    }

    /* foam flecks: carried round and in, sinking out of sight as they go under */
    const flecks = Math.round(this.foamEmitter.tick(dt, c.foamRate * strength * flood) * g.particleCount);
    if (flecks > 0) {
      this._resetEmit(time);
      _emit.size = c.foamSize;
      _emit.sizeVariance = 0.6;
      _emit.life = c.foamLifetime;
      _emit.lifeVariance = 0.4;
      _emit.speedVariance = 0.2;
      _emit.anchor = _centre;
      for (let n = 0; n < flecks; n++) {
        const a = Math.random() * TAU;
        const x = (0.45 + 0.52 * Math.random()) * flood;
        _pos.set(_centre.x + Math.cos(a) * x * R, Math.max(0, this._surfaceAt(x)) + 0.03, _centre.z + Math.sin(a) * x * R);
        _emit.position = _pos;
        _emit.direction = _dir.set(0, -1, 0);
        _emit.speed = c.foamSink * (0.4 + open);
        this.foam.emit(1, _emit);
      }
    }

    /* mist hanging over the rim */
    const puffs = Math.round(this.mistEmitter.tick(dt, c.mistRate * strength * open) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      _emit.size = c.mistSize;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.4;
      _emit.speedVariance = 0.4;
      for (let n = 0; n < puffs; n++) {
        const a = Math.random() * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const rr = R * c.rimAt * (0.85 + Math.random() * 0.3);
        _pos.set(_centre.x + ca * rr, 0.3 + Math.random() * 0.4, _centre.z + sa * rr);
        _emit.position = _pos;
        _emit.direction = _dir.set(sa, 0.35, -ca).normalize();
        _emit.speed = 1.2;
        this.mist.emit(1, _emit);
      }
    }
  }

  /** A gulp of spray at the eye as a body goes under. */
  _swallowFx() {
    const c = settings.maelstrom;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(_centre).setY(0.05);
    _emit.position = _pos;
    _emit.radius = this.radius * c.eyeRadius * 0.8;
    _emit.direction = _up;
    _emit.speed = c.spraySpeed * 1.2;
    _emit.spread = 0.5;
    _emit.size = c.spraySize * 1.3;
    _emit.life = c.sprayLifetime;
    this.spray.emit(Math.round(50 * g.particleCount), _emit);
    _emit.size = c.mistSize * 0.8;
    _emit.speed = 1;
    _emit.life = c.mistLifetime * 0.7;
    _emit.spin = 0.3;
    this.mist.emit(Math.round(6 * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: this.radius * 0.6,
      life: 0.8,
      width: 0.06,
      intensity: 0.8,
      colorA: getColor(c.colorRippleA),
      colorB: getColor(c.colorRippleB)
    });
    this.ctx.shake.add(c.impactShake * 0.3, 5, 14);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.8);
  }

  /** The eye closes: geyser, spray, jets, and whatever is left thrown up. */
  _close() {
    const c = settings.maelstrom;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._closing = true;
    this._closeClock = 0;
    this._openAtClose = this._open;
    this._centrePoint(_centre);
    this.geyser.visible = true;

    this._resetEmit(time);
    _pos.copy(_centre).setY(0.1);
    _emit.position = _pos;
    _emit.radius = c.geyserRadius;
    _emit.direction = _up;
    _emit.speed = c.geyserSpeed * power;
    _emit.speedVariance = 0.45;
    _emit.spread = 0.18;
    _emit.size = c.spraySize * 1.5;
    _emit.life = c.sprayLifetime * 1.6;
    this.spray.emit(Math.round(c.geyserSpray * g.particleCount), _emit);
    _emit.size = 0.05;
    _emit.spread = 0.12;
    _emit.life = 0.9;
    this.jets.emit(Math.round(c.geyserSpray * 0.4 * g.particleCount), _emit);
    _emit.size = c.mistSize;
    _emit.speed = c.geyserSpeed * 0.35;
    _emit.spread = 0.5;
    _emit.life = c.mistLifetime;
    _emit.spin = 0.4;
    this.mist.emit(Math.round(c.geyserMist * g.particleCount), _emit);

    this.ctx.bursts.spawn(BurstMode.WATER, _pos.copy(_centre).setY(0.4), {
      radius: c.geyserRadius,
      endRadius: c.splashSize * 0.8 * power,
      life: 0.6,
      intensity: c.splashIntensity,
      opacity: 0.5,
      fresnel: 2.6,
      displace: 0.35,
      squash: 1.6,
      colorA: getColor(c.colorSplashA),
      colorB: getColor(c.colorSplashB),
      colorC: getColor(c.colorSplashC)
    });
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: c.rippleRadius * 0.8 * power,
      life: 1.4,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorRippleA),
      colorB: getColor(c.colorRippleB)
    });

    // Anything the eye had not yet taken goes up with the column.
    for (let i = 0; i < this._gripCount; i++) {
      const dummy = this._grips[i].dummy;
      if (!dummy || dummy.finished || this._grips[i].under) continue;
      if (!dummy.bodyPoint(_at)) continue;
      dummy.carry(this._throwField, 1, 1, 0);
    }
    this._releaseGrips();

    this.ctx.shake.add(c.geyserShake * power, 1 / Math.max(0.05, c.shakeDuration), 12);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * 0.7 * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  /** What the water leaves behind on the stone. */
  _stainFx() {
    const c = settings.maelstrom;
    this._centrePoint(_centre);
    this.ctx.decals.spawn(DecalType.FOAM, _centre, {
      radius: this.radius * c.foamDecal,
      life: c.foamDecalLife,
      intensity: 1,
      growth: 0.1,
      colorA: getColor(c.colorWetA),
      colorB: getColor(c.colorWetB)
    });
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: this.radius * 1.3,
      life: 1.6,
      width: 0.05,
      intensity: 0.7,
      colorA: getColor(c.colorRippleA),
      colorB: getColor(c.colorRippleB)
    });
  }

  /* ------------------------------------------------------------------ */
  /* The grip                                                            */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return this._grips[i];
    return null;
  }

  /**
   * Take hold of anything in the flooded circle not already held.
   *
   * Polled every frame, so the water catches a body thrown into it by another
   * cast on the frame it lands. A standing body is cut loose without a blow —
   * `gripImpulse` is zero — because the motion anybody should see is the one
   * the water gives it, not a knockback with a whirlpool painted under it.
   */
  _capture() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.maelstrom;
    const g = settings.global;
    const reach = this.radius * this._flood;
    if (reach < 0.3) return;

    const found = field.findBodies(_centre.x, _centre.z, reach, this._found);
    this._force.impulse = c.gripImpulse * g.explosionIntensity;
    this._force.lift = c.gripLift * g.explosionIntensity;
    this._force.spin = c.gripSpin;

    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;
      if (dummy.alive) {
        _dir.set(_centre.x - dummy.position.x, 0, _centre.z - dummy.position.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      } else {
        const under = dummy.bodyPoint(_at);
        // Already under: swallowed by this whirlpool or another.
        if (!under || under.y < -0.2) continue;
      }
      const at = dummy.bodyPoint(_at) ?? dummy.position;
      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.theta = Math.atan2(at.z - _centre.z, at.x - _centre.x);
      slot.rho0 = Math.hypot(at.x - _centre.x, at.z - _centre.z);
      slot.rho = slot.rho0;
      slot.depth = 0;
      slot.under = false;
      // The water gets under it: the floor's scrub would stop it turning.
      dummy.sink(c.wade);
    }
  }

  /**
   * The water's velocity at one point — sampled per joint of every body held,
   * so it reads `_flow` rather than taking anything.
   *
   * The path's own velocity plus the spring toward it (both uniform over the
   * body), and a rigid spin about the vertical through the body's centre —
   * clockwise from above, the same way the water and the body's path turn.
   */
  /* eslint-disable-next-line no-unused-vars -- `y` completes the sample point */
  _sampleFlow(x, y, z, out) {
    const f = this._flow;
    const rx = x - f.cx;
    const rz = z - f.cz;
    // ω ŷ × r = (rz, 0, -rx) · ω
    out.set(f.vx + f.spin * rz, f.vy, f.vz - f.spin * rx);
  }

  /** The geyser: up, and a little out from the eye. */
  /* eslint-disable-next-line no-unused-vars -- `y` completes the sample point */
  _sampleThrow(x, y, z, out) {
    const c = settings.maelstrom;
    const dx = x - _centre.x;
    const dz = z - _centre.z;
    const d = Math.max(0.2, Math.hypot(dx, dz));
    const k = c.geyserThrow * 0.35;
    out.set((dx / d) * k, c.geyserThrow * settings.global.explosionIntensity, (dz / d) * k);
  }

  /**
   * Hold every body to its place on the spiral.
   *
   * Three beats, in order: **dragged** onto the rim over `rimDrag`; **spun**
   * round it on a spiral whose radius closes on the eye over `spiralTime` and
   * whose angular speed winds up toward `spinEnd` as it does; **swallowed** —
   * at the eye the floor is lowered under it and it is pulled straight down.
   * The path is explicit rather than a current and a hope: the place the body
   * should be is known at every instant, so it arrives instead of finding the
   * ring where the drift balances the pull and turning there for ever.
   */
  _drag(dt) {
    if (dt <= 0) return;
    const c = settings.maelstrom;
    const g = settings.global;
    const R = this.radius;
    const rimR = R * c.bodyRim;
    const eyeR = R * Math.max(0.02, c.eyeRadius);
    const end = eyeR * 0.35;
    const grab = saturate(c.gripGrab * dt);
    const f = this._flow;
    this._centrePoint(_centre);

    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      const at = dummy && !dummy.finished ? dummy.bodyPoint(_at) : null;
      if (!at) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      const wound = Easing.outCubic(saturate(slot.time / 0.35));
      const prevRho = slot.rho;

      // Where on the path it should be now.
      let progress = 0;
      if (slot.time < c.rimDrag) {
        slot.rho = lerp(slot.rho0, rimR, Easing.inOutCubic(saturate(slot.time / Math.max(0.05, c.rimDrag))));
      } else {
        progress = saturate((slot.time - c.rimDrag) / Math.max(0.2, c.spiralTime));
        slot.rho = lerp(rimR, end, Easing.inQuad(progress));
      }
      // Faster and faster as the spiral tightens.
      const tight = 1 - saturate((slot.rho - end) / Math.max(0.1, rimR - end));
      const omega = lerp(c.spinStart, c.spinEnd, Math.pow(tight, 1.4)) * (0.3 + 0.7 * this._open) * g.animationSpeed;
      slot.theta -= omega * dt;

      const down = progress >= 1 || slot.time > c.rimDrag + c.spiralTime + 2.5;
      if (down) slot.depth = Math.min(c.swallowDepth, slot.depth + c.swallowSpeed * dt * Math.max(0.3, this._open));
      // The floor goes down ahead of it, never back up.
      dummy.sink(Math.max(c.wade, slot.depth + 0.6));

      const ct = Math.cos(slot.theta);
      const st = Math.sin(slot.theta);
      const x = slot.rho / R;
      // Riding the water — but never below the floor until the eye takes it,
      // or the floor would hide a body that is still being spun.
      const ride = down ? -slot.depth : Math.max(this._surfaceAt(x), -0.12) + c.bodyFloat;
      _pos.set(_centre.x + ct * slot.rho, ride, _centre.z + st * slot.rho);

      // The path's own velocity: round (clockwise) and in.
      const vr = (slot.rho - prevRho) / dt;
      const vx = st * omega * slot.rho + ct * vr;
      const vz = -ct * omega * slot.rho + st * vr;
      // A spring onto it, clamped so a body far off its mark is drawn, not fired.
      let sx = (_pos.x - at.x) * c.gripSpring;
      let sy = (_pos.y - at.y) * c.gripSpring;
      let sz = (_pos.z - at.z) * c.gripSpring;
      const sl = Math.hypot(sx, sy, sz);
      if (sl > MAX_PULL) {
        sx *= MAX_PULL / sl;
        sy *= MAX_PULL / sl;
        sz *= MAX_PULL / sl;
      }
      f.vx = vx + sx;
      f.vy = sy - (down ? c.swallowSpeed : 0);
      f.vz = vz + sz;
      f.cx = at.x;
      f.cz = at.z;
      f.spin = c.bodyTumble * TAU * (0.4 + 0.6 * tight) * wound * g.animationSpeed;
      dummy.carry(this._field, grab * wound, grab * wound, saturate(c.bodyBuoyancy) * wound);
      dummy.hold();

      if (!slot.under && down && at.y < -0.1) {
        slot.under = true;
        this._swallowFx();
      }
      // Deep enough to be gone; the floor is doing the hiding now.
      if (at.y < -c.swallowDepth * 0.7) this._dropGrip(i);
    }
  }

  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    // Gives the weight back. A body under the floor keeps the floor it has.
    slot.dummy?.release();
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    slot.dummy = null;
    slot.time = 0;
    slot.under = false;
    slot.depth = 0;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
      this._grips[i].time = 0;
      this._grips[i].under = false;
      this._grips[i].depth = 0;
    }
    this._gripCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseGrips();
    this.funnel.visible = false;
    this.warp.visible = false;
    this.geyser.visible = false;
  }

  dispose() {
    this.funnelGeometry.dispose();
    this.warpGeometry.dispose();
    this.geyserGeometry.dispose();
    this.funnelMaterial.dispose();
    this.warpMaterial.dispose();
    this.geyserMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F300}  Maelstrom Vortex');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 60, 0.5, 'bead speed (m/s)');
  R(cast, c, 'lifetime', 0.5, 12, 0.05, 'whirlpool stands (s)');
  R(cast, c, 'closeTime', 0.3, 6, 0.05, 'closes over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightPulse', 0, 1, 0.01, 'surges with the swell');

  const bead = folder.addFolder('The bead');
  R(bead, c, 'handHeight', 0, 3, 0.01, 'leaves the hand at (m)');
  R(bead, c, 'orbArc', 0, 6, 0.01, 'arc (m)');
  R(bead, c, 'orbSize', 0.05, 1, 0.005, 'size (m)');
  R(bead, c, 'orbTrailRate', 0, 600, 1, 'droplets / s');
  R(bead, c, 'orbTrailSize', 0.01, 0.4, 0.005, 'droplet size');
  R(bead, c, 'orbTrailLife', 0.05, 2, 0.01, 'droplet life');

  const beats = folder.addFolder('Beats');
  R(beats, c, 'floodTime', 0.05, 3, 0.01, 'floods over (s)');
  R(beats, c, 'openDelay', 0, 3, 0.01, 'middle gives way at (s)');
  R(beats, c, 'openTime', 0.05, 4, 0.01, 'opens over (s)');

  const funnel = folder.addFolder('1 · The funnel');
  const shape = funnel.addFolder('Shape');
  R(shape, c, 'poolScale', 0.3, 2, 0.01, 'water radius (× zone)');
  R(shape, c, 'funnelDepth', 0, 5, 0.01, 'depth (m)');
  R(shape, c, 'funnelCurve', 0.2, 8, 0.01, 'stays shallow');
  R(shape, c, 'eyeRadius', 0.02, 0.6, 0.005, 'eye (× radius)');
  R(shape, c, 'throatDepth', 0, 6, 0.01, 'throat (m)');
  R(shape, c, 'rimHeight', 0, 0.6, 0.005, 'lip height (m)');
  R(shape, c, 'rimAt', 0.4, 1, 0.005, 'lip at (× radius)');
  R(shape, c, 'rimWidth', 0.01, 0.4, 0.005, 'lip width');
  R(shape, c, 'waveAmp', 0, 0.4, 0.005, 'swell (m)');
  R(shape, c, 'waveArms', 1, 12, 1, 'swell arms');
  R(shape, c, 'waveTwist', -8, 8, 0.05, 'swell twist');
  R(shape, c, 'waveSpeed', -10, 10, 0.05, 'swell speed');
  const flow = funnel.addFolder('Flow');
  R(flow, c, 'swirlSpeed', 0, 6, 0.01, 'turn at the rim (rad/s)');
  R(flow, c, 'swirlFalloff', 0, 3, 0.01, 'faster to the eye');
  R(flow, c, 'flowArms', 1, 16, 0.5, 'flow bands');
  R(flow, c, 'flowTwist', -10, 10, 0.05, 'flow twist');
  R(flow, c, 'flowScale', 0.1, 4, 0.01, 'line density');
  R(flow, c, 'flowSharp', 1, 24, 0.1, 'line sharpness');
  R(flow, c, 'flowStrength', 0, 3, 0.01, 'line brightness');
  const look = funnel.addFolder('Shading');
  R(look, c, 'waterOpacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'reflect', 0, 3, 0.01, 'reflection');
  R(look, c, 'fresnel', 0, 4, 0.01, 'fresnel');
  R(look, c, 'fresnelPower', 0.5, 10, 0.05, 'fresnel power');
  R(look, c, 'specular', 0, 10, 0.05, 'glints');
  R(look, c, 'specularSharp', 4, 400, 1, 'glint sharpness');
  R(look, c, 'depthDark', 0, 4, 0.01, 'darkens with depth');
  R(look, c, 'foamRim', 0, 2, 0.01, 'lip foam');
  R(look, c, 'foamRimWidth', 0.01, 0.4, 0.005, 'lip foam width');
  R(look, c, 'foamArms', 0, 2, 0.01, 'crest foam');
  R(look, c, 'foamScale', 0.2, 10, 0.05, 'foam breakup');
  R(look, c, 'edgeFoam', 0, 2, 0.01, 'edge foam');
  R(look, c, 'rimGlow', 0, 4, 0.01, 'lip glow');
  look.addColor(c, 'colorShallow').name('shallow');
  look.addColor(c, 'colorDeep').name('deep');
  look.addColor(c, 'colorAbyss').name('abyss');
  look.addColor(c, 'colorFoam').name('foam');
  look.addColor(c, 'colorSky').name('sky (fallback)');
  look.addColor(c, 'colorRimGlow').name('lip glow');

  const warp = folder.addFolder('2 · Swirl (distortion)');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpWidth', 0.02, 1, 0.01, 'band (× radius)');
  R(warp, c, 'warpScale', 0.1, 6, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 10, 0.05, 'noise speed');
  R(warp, c, 'warpSwirl', 0, 1, 0.01, 'turn vs. noise');

  const spray = folder.addFolder('3 · Spray, foam, mist');
  R(spray, c, 'sprayRate', 0, 800, 1, 'spray / s');
  R(spray, c, 'spraySize', 0.01, 0.4, 0.005, 'droplet size');
  R(spray, c, 'spraySpeed', 0, 15, 0.05, 'along the flow (m/s)');
  R(spray, c, 'sprayLift', 0, 10, 0.05, 'lift (m/s)');
  R(spray, c, 'sprayLifetime', 0.1, 3, 0.05, 'lifetime');
  Editor.gradient(spray, c, 'colorSpray', 'spray gradient');
  R(spray, c, 'foamRate', 0, 500, 1, 'foam flecks / s');
  R(spray, c, 'foamSize', 0.02, 0.8, 0.005, 'fleck size');
  R(spray, c, 'foamLifetime', 0.2, 6, 0.05, 'fleck lifetime');
  R(spray, c, 'foamSwirl', 0, 10, 0.05, 'carried round (rad/s)');
  R(spray, c, 'foamInward', 0, 1, 0.01, 'spirals in');
  R(spray, c, 'foamSink', 0, 2, 0.01, 'sinks (m/s)');
  R(spray, c, 'foamOpacity', 0, 1, 0.01, 'fleck opacity');
  Editor.gradient(spray, c, 'colorFoam', 'foam gradient');
  R(spray, c, 'mistRate', 0, 200, 1, 'mist / s');
  R(spray, c, 'mistSize', 0.1, 5, 0.01, 'mist size');
  R(spray, c, 'mistLifetime', 0.1, 6, 0.05, 'mist lifetime');
  R(spray, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(spray, c, 'colorMist', 'mist gradient');

  const grip = folder.addFolder('4 · The grip');
  R(grip, c, 'gripImpulse', 0, 10, 0.05, 'blow (m/s)');
  R(grip, c, 'gripLift', 0, 6, 0.05, 'lift (m/s)');
  R(grip, c, 'gripSpin', 0, 4, 0.01, 'tumble');
  R(grip, c, 'gripGrab', 0.5, 30, 0.1, 'grip (/s)');
  R(grip, c, 'gripSpring', 0, 20, 0.1, 'drawn onto the path (/s)');
  R(grip, c, 'rimDrag', 0.05, 3, 0.01, 'dragged to the rim (s)');
  R(grip, c, 'bodyRim', 0.2, 1, 0.01, 'rim circle (× radius)');
  R(grip, c, 'spiralTime', 0.2, 8, 0.05, 'spiral closes over (s)');
  R(grip, c, 'spinStart', 0, 8, 0.05, 'round the rim (rad/s)');
  R(grip, c, 'spinEnd', 0, 20, 0.05, 'at the eye (rad/s)');
  R(grip, c, 'bodyTumble', 0, 4, 0.01, 'own spin (turns/s)');
  R(grip, c, 'bodyFloat', -0.2, 1, 0.01, 'rides above (m)');
  R(grip, c, 'bodyBuoyancy', 0, 1, 0.01, 'weight carried');
  R(grip, c, 'wade', 0, 1, 0.01, 'floor gives on capture (m)');
  R(grip, c, 'swallowSpeed', 0.2, 10, 0.05, 'pulled under (m/s)');
  R(grip, c, 'swallowDepth', 0.5, 8, 0.05, 'gone at (m)');

  const geyser = folder.addFolder('5 · Geyser');
  R(geyser, c, 'geyserHeight', 0, 16, 0.05, 'height (m)');
  R(geyser, c, 'geyserRadius', 0.05, 2, 0.01, 'radius (m)');
  R(geyser, c, 'geyserTime', 0.1, 4, 0.01, 'stands for (s)');
  R(geyser, c, 'geyserSpray', 0, 800, 1, 'spray');
  R(geyser, c, 'geyserSpeed', 0, 30, 0.1, 'spray speed (m/s)');
  R(geyser, c, 'geyserMist', 0, 200, 1, 'mist');
  R(geyser, c, 'geyserThrow', 0, 20, 0.1, 'throws bodies up (m/s)');
  R(geyser, c, 'columnOpacity', 0, 1, 0.01, 'column opacity');
  R(geyser, c, 'columnGlow', 0, 4, 0.01, 'column brightness');
  R(geyser, c, 'columnStreaks', 1, 20, 0.1, 'streaks');
  geyser.addColor(c, 'colorColumnA').name('column edge');
  geyser.addColor(c, 'colorColumnB').name('column body');

  const impact = folder.addFolder('6 · Splash & stain');
  R(impact, c, 'splashSize', 0, 10, 0.05, 'splash (m)');
  R(impact, c, 'splashIntensity', 0, 4, 0.01, 'splash brightness');
  R(impact, c, 'rippleRadius', 0, 16, 0.05, 'ripple (m)');
  R(impact, c, 'foamDecal', 0.2, 2, 0.01, 'foam stain (× radius)');
  R(impact, c, 'foamDecalLife', 0.2, 15, 0.05, 'stain lasts (s)');
  R(impact, c, 'impactShake', 0, 2, 0.01, 'camera knock');
  R(impact, c, 'geyserShake', 0, 2, 0.01, 'geyser knock');
  R(impact, c, 'shakeDuration', 0.05, 3, 0.01, 'knock lasts');
  R(impact, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(impact, c, 'impactLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(impact, c, 'vortexRumble', 0, 1, 0.01, 'rumble while turning');
  impact.addColor(c, 'colorSplashA').name('splash inner');
  impact.addColor(c, 'colorSplashB').name('splash mid');
  impact.addColor(c, 'colorSplashC').name('splash outer');
  impact.addColor(c, 'colorRippleA').name('ripple');
  impact.addColor(c, 'colorRippleB').name('ripple bright');
  impact.addColor(c, 'colorWetA').name('wet stone');
  impact.addColor(c, 'colorWetB').name('foam stain');
  impact.addColor(c, 'colorFlash').name('flash');

  folder.close();
  return folder;
}
