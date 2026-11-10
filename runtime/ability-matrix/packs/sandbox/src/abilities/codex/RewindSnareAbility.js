import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createFilmGeometry, createBandGeometry, createQuadGeometry } from '../../assets/codex/RewindSnareGeometry.js';
import {
  createFilmMaterial,
  createClaspMaterial,
  createFloorMaterial,
  createWarpMaterial
} from '../../materials/codex/RewindSnareMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'rewindsnare';

const TAU = Math.PI * 2;
/** Bodies the film can carry in. */
const MAX_SNARED = 12;

/** What the film is doing. */
const Beat = Object.freeze({ FEED: 0, UNSPOOL: 1, HOLD: 2, REWIND: 3, LOCK: 4, BURN: 5 });

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _up = new Vector3(0, 1, 0);
const _force = { impulse: 0, lift: 0, spin: 0 };
const _targets = [];

function syncSystem(p, c, prefix, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(c[`${prefix}A`]), getColor(c[`${prefix}B`]), getColor(c[`${prefix}C`]), getColor(c[`${prefix}D`]));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow * g.glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/**
 * REWIND SNARE — Time, zone cast.
 *
 * A strip of amber **film** — real film: sprocket holes down both edges,
 * frame lines, a ghost image in every frame — unreels from the caster's hand
 * down the line to the circle and feeds into its centre. There it
 * **unspools**: out across the floor in a widening spiral to the rim, the
 * leading end bright, the frames strobing as it runs, the spiral turning
 * slowly forward. It lies still for a breath, and everything standing on it
 * is stained amber — recorded. Then the reel **runs backward**. The spiral
 * spins the other way, faster and faster, the film winding itself back in,
 * and everything it recorded goes with it: bodies tripped off their feet and
 * dragged inward along the turning film while chevrons race in across the
 * floor and the air is wrung backward. The film that reaches the centre does
 * not stop — it climbs, coiling up round the middle into a standing cocoon of
 * film, and when the last of it is in, the cocoon **cinches** tight round what
 * it caught and two clasps snap shut round its top and bottom: snare-locked,
 * where the cast began. The cocoon is a lit surface (sun side amber, shadow
 * side sepia, a hot rim) three metres tall, and it never quite stops: it
 * keeps turning backward while it holds them, then burns away frame by frame
 * off the developed floor.
 *
 * Kept apart from the other time spells: no clock, no hourglass, no glass, no
 * caster moving. The rewinding is literal — a reel running backward.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the film** (`createFilmMaterial`) — one strip drawn twice: down the
 *      line (fed into the reel), and round the spiral and up the cocoon.
 *      Placed per vertex from film-metres in closed form.
 *   2. **the cocoon's clasps** — two bands that spin shut on the lock.
 *   3. **the floor** — the ground answer: everything the film runs over
 *      *develops* into a filled deep-sepia field (emulsion blotches, grain,
 *      flickering scratches) with warm light spilling off every turn of the
 *      film; it is wrung backward with the reel, stays through the lock and
 *      burns off from a ragged edge. Over it a perforated rim drawn round as
 *      the film arrives, and inward chevrons during the rewind.
 *   4. **particles** — amber motes off the running film (SOFT), streaks
 *      racing inward on the rewind (STREAK), burnt flakes as it goes (LEAF).
 *   5. **the warp** — `LAYER.DISTORTION`: the air wrung backward, then an
 *      implosion ring on the lock.
 *   6. **the lock** — an AIR shell, SHOCKWAVE, sparks, flash, shake and a
 *      light punch; a rumble through the whole rewind.
 *   7. **the snare** — `handlesOwnHits`. Bodies on the film are tripped and
 *      dragged in by the hips on a leash that tightens as the film under them
 *      winds home, then held bound in the cocoon until it burns.
 *
 * ## The editor rule
 *
 * Dice and integrated phases only (a seed, the reel's spin, how much film is
 * out and how much is wound). The spiral, the coil, the film and the floor
 * read every size, time and colour from `settings.rewindsnare` every frame.
 */
export class RewindSnareAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies snared. HUD readout only. */
  get instanceCount() {
    return this._snaredCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.filmGeometry = createFilmGeometry(900);
    this.lineGeometry = createFilmGeometry(220);
    this.bandGeometry = createBandGeometry(80);
    this.quadGeometry = createQuadGeometry();

    this.floorMaterial = createFloorMaterial();
    this.floor = this._mesh(this.quadGeometry, this.floorMaterial, LAYER.VFX, 2);
    this.lineMaterial = createFilmMaterial();
    this.line = this._mesh(this.lineGeometry, this.lineMaterial, LAYER.VFX, 4);
    this.spiralMaterial = createFilmMaterial();
    this.spiral = this._mesh(this.filmGeometry, this.spiralMaterial, LAYER.VFX, 5);
    this.claspMaterials = [createClaspMaterial(), createClaspMaterial()];
    this.clasps = this.claspMaterials.map((m) => this._mesh(this.bandGeometry, m, LAYER.VFX, 9));
    this.warpMaterial = createWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._center = new Vector3();
    this._T = { unspool: 1, rewind: 1, lock: 1, cinch: 0.2, end: 1 };
    this._film = {
      mode: 1,
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      lineLen: 1,
      feed: 0,
      front: 0,
      center: this._center,
      r0: 1,
      b: 0.16,
      lf: 60,
      wound: 0,
      out: 0,
      spin: 0,
      coilR: 1,
      run: 0,
      burn: 0,
      lock: 0,
      seed: 0
    };
    this._claspState = { center: this._center, radius: 0.7, height: 0.3, snap: 0, fade: 1 };
    this._floorState = {
      center: this._center,
      draw: 0,
      rewind: 0,
      phase: 0,
      spin: 0,
      fade: 1,
      r0: 1,
      b: 0.16,
      out: 0,
      wound: 0,
      swirl: 0,
      burn: 0,
      lock: 0,
      seed: 0
    };
    this._swirl = 0;
    this._warpState = { center: new Vector3(), size: 5, wring: 0, implode: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };

    this._snared = [];
    for (let i = 0; i < MAX_SNARED; i++) this._snared.push({ dummy: null, r0: 0, a0: 0, l: 0, spin0: 0 });
    this._snaredCount = 0;

    this._beat = Beat.FEED;
    this._tau = -1;
    this._seed = 0;
    this._spin = 0;
    this._spinRate = 0;
    this._out = 0;
    this._wound = 0;
    this._feed = 0;
    this._coilR = 1;
    this._chevPhase = 0;
    this._lock = 0;
    this._locked = false;
    this._implodeT = -1;
    this._burn = 0;
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('rewindsnare.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.12;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.55;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.6;

    this.streaks = particles.get('rewindsnare.streaks', {
      capacity: 1400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.streaks.uniforms.uSizeIn.value = 0.02;
    this.streaks.uniforms.uFadeIn.value = 0.05;
    this.streaks.uniforms.uFadeOut.value = 0.5;
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uDrag.value = 0.6;

    this.flakes = particles.get('rewindsnare.flakes', {
      capacity: 900,
      shape: ParticleShape.LEAF,
      additive: false,
      curl: true,
      softFade: 0.3
    });
    this.flakes.uniforms.uSizeIn.value = 0.1;
    this.flakes.uniforms.uFadeIn.value = 0.05;
    this.flakes.uniforms.uFadeOut.value = 0.5;
    this.flakes.uniforms.uEndSize.value = 0.6;
    this.flakes.uniforms.uDrag.value = 1.8;

    this.moteEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
    this.flakeEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _times() {
    const c = settings[ID];
    const L = settings.global.lifetime;
    const U = Math.max(0.05, c.unspoolTime * L);
    const H = Math.max(0, c.holdTime * L);
    const W = Math.max(0.1, c.rewindTime * L);
    const K = Math.max(0.02, c.cinchTime * L);
    const S = Math.max(0, c.lockHold * L);
    this._T.unspool = U;
    this._T.rewind = U + H;
    this._T.lock = U + H + W;
    this._T.cinch = K;
    this._T.end = U + H + W + Math.max(K, S);
    return this._T;
  }

  get impactDuration() {
    return Math.max(0.1, this._times().end);
  }

  /** The fade is the cocoon burning away. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** A projector's flicker. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (Math.sin(this.age * 47) * Math.sin(this.age * 31) > 0.3 ? 0.6 : 0);
  }

  /* ------------------------------------------------------------------ */
  /* The spiral on the CPU — twin of SPIRAL_GLSL                         */
  /* ------------------------------------------------------------------ */

  _spiral() {
    const c = settings[ID];
    const R = Math.max(0.5, c.zoneRadius);
    const r0 = Math.min(R - 0.2, Math.max(0.1, c.innerRadius));
    const b = Math.max(0.05, c.pitch) / TAU;
    const thMax = (R - r0) / b;
    const f = this._film;
    f.r0 = r0;
    f.b = b;
    f.lf = r0 * thMax + 0.5 * b * thMax * thMax;
    return f;
  }

  /** The spiral point `q` metres of film from its inner end, world. */
  _spiralPoint(q, out) {
    const f = this._film;
    const th = (-f.r0 + Math.sqrt(f.r0 * f.r0 + 2 * f.b * Math.max(0, q))) / f.b;
    const r = f.r0 + f.b * th;
    const a = th + this._spin;
    return out.set(this._center.x + Math.cos(a) * r, settings[ID].lift + 0.02, this._center.z + Math.sin(a) * r);
  }

  /** Film-metres from the inner end to where the spiral passes radius `r`. */
  _filmAtRadius(r) {
    const f = this._film;
    const th = Math.max(0, (r - f.r0) / f.b);
    return f.r0 * th + 0.5 * f.b * th * th;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.moteEmitter.reset();
    this.streakEmitter.reset();
    this.flakeEmitter.reset();
    this._releaseSnared(false);

    this._seed = Math.random() * 100;
    this._beat = Beat.FEED;
    this._tau = -1;
    this._spin = Math.atan2(-this.direction.z, -this.direction.x);
    this._spinRate = 0;
    this._out = 0;
    this._wound = 0;
    this._feed = 0;
    this._chevPhase = 0;
    this._lock = 0;
    this._locked = false;
    this._implodeT = -1;
    this._burn = 0;
    this._swirl = 0;
    this._coilR = settings[ID].coilRadius;

    this.pointAt(1, this._center);
    const f = this._film;
    f.seed = this._seed;
    f.dir.copy(this.direction);
    f.side.copy(this.side);

    this.floor.visible = true;
    this.line.visible = true;
    this.spiral.visible = false;
    this.clasps[0].visible = false;
    this.clasps[1].visible = false;
    this.warp.visible = false;
    this._sync(0);
  }

  _resetEmit() {
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
    _emit.time = frame.uTime.value;
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this._tau = 0;
    this._beat = Beat.UNSPOOL;
    this.spiral.visible = true;
    this.lightBoost = settings[ID].lightIntensity * 0.6;
  }

  onFade(dt, t) {
    this._tau += dt;
    if (t > 1 && this._beat !== Beat.BURN) {
      this._beat = Beat.BURN;
      this._releaseSnared(true);
    }
    this._burn = t > 1 ? saturate(t - 1) : 0;
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings[ID];
    const g = settings.global;
    const T = this._times();
    const f = this._spiral();
    const tau = this._tau;
    let run = 0;
    let rewind = 0;

    if (tau < 0) {
      /* the film running down the line */
      run = 1;
    } else if (tau < T.unspool) {
      this._beat = Beat.UNSPOOL;
      const k = tau / T.unspool;
      this._out = f.lf * Easing.outQuad(k);
      this._feed = saturate(k * 2);
      this._spinRate = c.spinForward;
      run = 1;
    } else if (tau < T.rewind) {
      this._beat = Beat.HOLD;
      this._out = f.lf;
      this._feed = 1;
      this._spinRate = c.spinForward * (1 - saturate((tau - T.unspool) / Math.max(0.05, T.rewind - T.unspool)));
      this._mark();
    } else if (tau < T.lock) {
      if (this._beat !== Beat.REWIND) {
        this._beat = Beat.REWIND;
        this._snare();
      }
      const k = (tau - T.rewind) / Math.max(0.05, T.lock - T.rewind);
      rewind = k;
      this._out = f.lf;
      this._wound = f.lf * Math.pow(k, Math.max(0.2, c.rewindCurve));
      this._spinRate = -c.spinBack * Easing.inQuad(Math.min(1, k * 1.3));
      run = 1;
      this.ctx.shake.rumble(c.rewindRumble * k * g.cameraShake, dt);
    } else if (this._beat !== Beat.BURN) {
      if (!this._locked) this._lockIt();
      this._beat = Beat.LOCK;
      this._out = f.lf;
      this._wound = f.lf;
      // The cocoon never quite stops: it settles to a slow backward turn.
      this._spinRate = -c.lockSpin + (this._spinRate + c.lockSpin) * Math.exp(-dt * 6);
    }

    this._spin += this._spinRate * dt * g.animationSpeed;
    this._chevPhase += rewind > 0 ? dt * (1.5 + 3 * rewind) * g.animationSpeed : 0;
    // The developed field is wrung backward with the reel, and keeps a slow drift.
    this._swirl -= c.fieldSwirl * (tau < 0 ? 0 : 0.12 + Math.sin(Math.PI * rewind) + (this._locked ? 0.25 : 0)) * dt * g.animationSpeed;

    /* the cinch */
    if (this._locked) {
      const k = saturate((tau - T.lock) / T.cinch);
      const over = c.cinchOvershoot * Math.sin(Math.PI * k) * (1 - k);
      this._coilR = lerp(c.coilRadius, c.cinchRadius, Easing.outCubic(k)) - over * (c.coilRadius - c.cinchRadius);
      this._lock = Math.exp(-(tau - T.lock) * 3);
    } else {
      this._coilR = c.coilRadius;
    }

    /* the film */
    f.coilR = Math.max(0.05, this._coilR);
    f.wound = this._wound;
    f.out = this._out;
    f.spin = this._spin;
    f.run = Math.max(run, Math.abs(this._spinRate) / Math.max(0.1, c.spinBack));
    f.burn = this._burn;
    f.lock = this._lock;

    // Down the line: from just in front of the hand to the centre.
    f.mode = 0;
    f.start.copy(this.origin).addScaledVector(this.direction, 0.3);
    f.lineLen = Math.max(0.1, this.length - 0.3);
    f.front = this.front - 0.3;
    f.feed = this._feed * f.lineLen;
    this.lineMaterial.userData.sync(f);
    this.line.visible = this._feed < 0.999;
    f.mode = 1;
    this.spiralMaterial.userData.sync(f);

    /* the clasps */
    const cs = this._claspState;
    const snap = this._locked ? saturate((tau - T.lock) / T.cinch) : 0;
    cs.radius = this._coilR + 0.04;
    cs.snap = Easing.outCubic(snap);
    cs.fade = 1 - smoothstep(0, 0.5, this._burn);
    cs.height = c.lift + 0.05;
    this.claspMaterials[0].userData.sync(cs);
    cs.height = c.lift + c.coilHeight + c.filmWidth * 0.5;
    this.claspMaterials[1].userData.sync(cs);
    this.clasps[0].visible = this._locked && cs.fade > 0.01;
    this.clasps[1].visible = this.clasps[0].visible;

    /* the floor */
    const fl = this._floorState;
    fl.draw = tau < 0 ? Easing.outQuad(this.u) * 0.5 : Math.min(1, 0.5 + tau / Math.max(0.05, T.unspool));
    fl.rewind = rewind > 0 ? smoothstep(0, 0.15, rewind) * (1 - smoothstep(0.85, 1, rewind)) : 0;
    fl.phase = this._chevPhase;
    fl.spin = this._spin;
    fl.fade = 1 - smoothstep(0.65, 1, this._burn);
    fl.r0 = f.r0;
    fl.b = f.b;
    fl.out = this._out;
    fl.wound = this._wound;
    fl.swirl = this._swirl;
    fl.burn = this._burn;
    fl.lock = this._lock;
    fl.seed = this._seed;
    this.floorMaterial.userData.sync(fl);

    /* the warp */
    const ws = this._warpState;
    ws.center.copy(this._center).setY(1.2);
    ws.size = c.zoneRadius * 1.2;
    ws.wring = rewind > 0 ? Math.sin(Math.PI * rewind) : 0;
    if (this._implodeT >= 0) {
      this._implodeT += dt;
      ws.implode = saturate(this._implodeT / 0.45);
      if (ws.implode >= 1) this._implodeT = -1;
    } else {
      ws.implode = 0;
    }
    this.warpMaterial.userData.sync(ws);
    this.warp.visible = ws.wring > 0.01 || ws.implode > 0;

    syncSystem(this.motes, c, 'colorMote', c.moteGlow, 0.6);
    this.motes.uniforms.uGravity.value.set(0, 0.4, 0);
    syncSystem(this.streaks, c, 'colorStreak', c.streakGlow, 0.1);
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);
    this.streaks.uniforms.uStretch.value = 0.6;
    syncSystem(this.flakes, c, 'colorFlake', c.flakeGlow, 0.9);
    this.flakes.uniforms.uGravity.value.set(0, 0.6, 0);

    if (dt > 0) {
      this._filmFx(dt, run);
      if (rewind > 0) this._rewindFx(dt, rewind);
      this._dragSnared(dt);
      if (this._beat === Beat.BURN) this._burnFx(dt);
    }

    // The light rides the film's front, then sits in the cocoon.
    if (tau < 0) this.position.copy(this.position).setY(0.6);
    else this.position.copy(this._center).setY(this._locked ? c.coilHeight * 0.5 : 0.8);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Amber motes off whatever film is running. */
  _filmFx(dt, run) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * run * (1 - this._burn)) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.speed = 0.6;
    _emit.spread = 0.8;
    _emit.direction = _up;
    _emit.radius = c.filmWidth * 0.4;
    for (let i = 0; i < n; i++) {
      if (this._tau < 0) {
        const d = 0.3 + Math.random() * Math.max(0.1, this.front - 0.3);
        _pos.copy(this.origin).addScaledVector(this.direction, d).setY(c.lift + 0.05);
      } else {
        const span = Math.max(0.1, this._out - this._wound);
        // Crowded toward the running ends.
        this._spiralPoint(span * (1 - Math.pow(Math.random(), 2)), _pos);
      }
      _emit.position = _pos;
      this.motes.emit(1, _emit);
    }
  }

  /** Streaks racing inward round the spiral while it rewinds. */
  _rewindFx(dt, k) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.streakEmitter.tick(dt, c.streakRate * Math.sin(Math.PI * k)) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _emit.size = c.streakSize;
    _emit.life = c.streakLife;
    _emit.speed = c.streakSpeed;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.1;
    const span = Math.max(0.5, this._out - this._wound);
    for (let i = 0; i < n; i++) {
      const q = Math.random() * span;
      this._spiralPoint(q, _pos);
      this._spiralPoint(Math.max(0, q - 0.4), _a);
      // Back along the film toward the centre, and a little up off it.
      _dir.subVectors(_a, _pos).setY(0.05);
      if (_dir.lengthSq() < 1e-6) continue;
      _dir.normalize();
      _pos.y += 0.1;
      _emit.position = _pos;
      _emit.direction = _dir;
      this.streaks.emit(1, _emit);
    }
  }

  /** Burnt film flaking off the cocoon as it goes. */
  _burnFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const rate = c.flakeCount / Math.max(0.1, this.fadeDuration);
    const n = Math.round(this.flakeEmitter.tick(dt, rate * (1 - this._burn * 0.5)) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _emit.size = c.flakeSize;
    _emit.life = c.flakeLife;
    _emit.speed = 0.8;
    _emit.spread = 1;
    _emit.direction = _up;
    _emit.spin = 2.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      _pos.set(
        this._center.x + Math.cos(a) * this._coilR,
        c.lift + Math.random() * c.coilHeight,
        this._center.z + Math.sin(a) * this._coilR
      );
      _emit.position = _pos;
      this.flakes.emit(1, _emit);
    }
  }

  /** The lock: the last of the film is in, the cocoon cinches, the clasps snap. */
  _lockIt() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._locked = true;
    this._implodeT = 0;
    _pos.copy(this._center).setY(c.coilHeight * 0.5);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.65,
      fresnel: 2,
      displace: 0.3,
      turbulence: 1,
      squash: 1.2,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _a.copy(this._center).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _a, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.07,
      intensity: 1.2,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });
    this._resetEmit();
    _emit.position = _pos;
    _emit.radius = c.coilRadius;
    _emit.direction = _up;
    _emit.speed = 6;
    _emit.spread = 1.6;
    _emit.size = c.streakSize;
    _emit.life = c.streakLife * 1.3;
    this.streaks.emit(Math.round(c.lockSparks * g.particleCount), _emit);
    this.ctx.shake.add(c.lockShake * power * g.cameraShake, 6, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.lockFlash * power);
    this.lightBoost = c.lightIntensity * c.lockLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* The snare                                                           */
  /* ------------------------------------------------------------------ */

  /** Bodies standing on the film are stained amber while it lies still: recorded. */
  _mark() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const look = this._look;
    look.color = c.colorMark;
    look.rimColor = c.colorMark;
    look.rimEmissive = 2 * c.markGlow;
    look.edgeColor = c.colorMark;
    look.edgeEmissive = 2.5 * c.markGlow;
    look.edgeWidth = 0.05;
    const found = field.findTargets(this._center.x, this._center.z, Math.max(0.3, c.zoneRadius), _targets);
    for (let i = 0; i < found.length; i++) found[i].corrode(c.markGlow, look);
    _targets.length = 0;
  }

  /** The rewind takes their feet, and keeps hold of them. */
  _snare() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findBodies(this._center.x, this._center.z, Math.max(0.3, c.zoneRadius), _targets);
    for (let i = 0; i < found.length && this._snaredCount < MAX_SNARED; i++) {
      const d = found[i];
      if (d.state === 'frozen') continue;
      const dx = d.position.x - this._center.x;
      const dz = d.position.z - this._center.z;
      const s = this._snared[this._snaredCount++];
      s.dummy = d;
      s.r0 = Math.hypot(dx, dz);
      s.a0 = Math.atan2(dz, dx);
      s.l = Math.max(0.5, this._filmAtRadius(s.r0));
      s.spin0 = this._spin;
      // Tripped backward along the way the reel now turns.
      _dir.set(Math.sin(s.a0), 0, -Math.cos(s.a0));
      _force.impulse = c.tripImpulse * g.explosionIntensity;
      _force.lift = c.tripLift * g.explosionIntensity;
      _force.spin = 1;
      d.kill(_dir.x, _dir.z, _force);
    }
    _targets.length = 0;
  }

  /** Drag every snared body in with the film under it; bind it in the cocoon. */
  _dragSnared(dt) {
    if (this._snaredCount === 0 || this._beat === Beat.BURN) return;
    const c = settings[ID];
    for (let i = 0; i < this._snaredCount; i++) {
      const s = this._snared[i];
      const d = s.dummy;
      if (!d) continue;
      d.hold();
      // How far the film under it has been wound home.
      const p = saturate(this._wound / s.l);
      const r = lerp(s.r0, Math.max(0.1, this._coilR * 0.35), Easing.inOutQuad(p));
      const a = s.a0 + (this._spin - s.spin0) * (0.35 + 0.65 * p);
      const y = this._locked ? c.holdHeight : lerp(0.35, c.holdHeight, p);
      _pos.set(this._center.x + Math.cos(a) * r, y, this._center.z + Math.sin(a) * r);
      d.pin('Hips', _pos, this._locked ? 0.85 : c.pullStiffness);
    }
  }

  /** Let go: the cocoon is burning; what it held drops out. */
  _releaseSnared(drop) {
    const c = settings[ID];
    for (let i = 0; i < this._snaredCount; i++) {
      const s = this._snared[i];
      const d = s.dummy;
      s.dummy = null;
      if (!d) continue;
      d.unpin();
      if (!drop) continue;
      _dir.set(d.position.x - this._center.x, 0, d.position.z - this._center.z);
      if (_dir.lengthSq() < 1e-4) _dir.set(Math.cos(i * 2.4), 0, Math.sin(i * 2.4));
      _dir.normalize();
      d.shove(_dir.x * c.releaseImpulse, c.releaseLift, _dir.z * c.releaseImpulse);
    }
    this._snaredCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.floor.visible = false;
    this.line.visible = false;
    this.spiral.visible = false;
    this.clasps[0].visible = false;
    this.clasps[1].visible = false;
    this.warp.visible = false;
    this._releaseSnared(false);
    this._implodeT = -1;
  }

  dispose() {
    this.filmGeometry.dispose();
    this.lineGeometry.dispose();
    this.bandGeometry.dispose();
    this.quadGeometry.dispose();
    this.floorMaterial.dispose();
    this.lineMaterial.dispose();
    this.spiralMaterial.dispose();
    this.claspMaterials.forEach((m) => m.dispose());
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('🎞  Rewind Snare');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'film unreels at (m/s)');
  R(cast, c, 'lifetime', 0.1, 6, 0.05, 'burns away over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'projector flicker');

  const film = folder.addFolder('1 · Film');
  R(film, c, 'filmWidth', 0.05, 2, 0.01, 'width (m)');
  R(film, c, 'frameLength', 0.05, 2, 0.01, 'frame (m)');
  R(film, c, 'sprocketSize', 0.005, 0.3, 0.005, 'perforations (m)');
  R(film, c, 'filmGlow', 0, 10, 0.05, 'frame glow');
  R(film, c, 'edgeGlow', 0, 10, 0.05, 'edge glow');
  R(film, c, 'filmOpacity', 0, 1, 0.01, 'opacity');
  R(film, c, 'imageScale', 0.2, 10, 0.05, 'image detail');
  R(film, c, 'flicker', 0, 1, 0.01, 'strobe');
  film.addColor(c, 'colorFilm').name('film');
  film.addColor(c, 'colorFilmDark').name('frame lines');
  film.addColor(c, 'colorImage').name('images');
  film.addColor(c, 'colorEdge').name('edges');
  film.addColor(c, 'colorCore').name('white-hot core');

  const spiral = folder.addFolder('2 · Spiral');
  R(spiral, c, 'pitch', 0.2, 3, 0.01, 'between turns (m)');
  R(spiral, c, 'innerRadius', 0.1, 4, 0.01, 'inner radius (m)');
  R(spiral, c, 'lift', 0, 0.5, 0.005, 'off the floor (m)');
  R(spiral, c, 'flutter', 0, 0.4, 0.005, 'flutter (m)');
  R(spiral, c, 'unspoolTime', 0.05, 3, 0.01, 'unspools over (s)');
  R(spiral, c, 'spinForward', -3, 3, 0.01, 'turns while playing (rad/s)');
  R(spiral, c, 'holdTime', 0, 2, 0.01, 'lies still for (s)');

  const rew = folder.addFolder('3 · Rewind');
  R(rew, c, 'rewindTime', 0.1, 4, 0.01, 'winds in over (s)');
  R(rew, c, 'rewindCurve', 0.2, 4, 0.01, 'whir-up');
  R(rew, c, 'spinBack', 0, 20, 0.05, 'reel spin (rad/s)');
  R(rew, c, 'pullStiffness', 0, 1, 0.01, 'drag');

  const coil = folder.addFolder('4 · Cocoon');
  R(coil, c, 'coilHeight', 0.2, 6, 0.01, 'height (m)');
  R(coil, c, 'coilRadius', 0.1, 3, 0.01, 'radius (m)');
  R(coil, c, 'cinchRadius', 0.05, 3, 0.01, 'cinched radius (m)');
  R(coil, c, 'cinchTime', 0.02, 1.5, 0.01, 'cinches over (s)');
  R(coil, c, 'cinchOvershoot', 0, 1, 0.01, 'overshoot');
  R(coil, c, 'lockHold', 0, 4, 0.01, 'holds for (s)');
  R(coil, c, 'lockSpin', -4, 4, 0.01, 'keeps turning back (rad/s)');
  R(coil, c, 'coilShade', 0, 1, 0.01, 'sun shading');
  R(coil, c, 'coilRim', 0, 6, 0.05, 'rim light');
  R(coil, c, 'coilDark', 0, 1, 0.01, 'wound film darkness');
  R(coil, c, 'coilFrameGlow', 0, 3, 0.01, 'wound frames glow');
  R(coil, c, 'coilLineGlow', 0, 6, 0.05, 'wound edge/line amber');
  R(coil, c, 'claspWidth', 0.01, 0.6, 0.005, 'clasp width (m)');
  R(coil, c, 'claspGlow', 0, 15, 0.05, 'clasp glow');
  coil.addColor(c, 'colorClasp').name('clasps');

  const floor = folder.addFolder('5 · Floor');
  R(floor, c, 'rimWidth', 0.01, 0.6, 0.005, 'rim (m)');
  R(floor, c, 'rimGlow', 0, 6, 0.05, 'rim glow');
  R(floor, c, 'chevrons', 1, 24, 1, 'chevrons');
  R(floor, c, 'chevronGlow', 0, 8, 0.05, 'chevron glow');
  R(floor, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  floor.addColor(c, 'colorRim').name('rim');
  floor.addColor(c, 'colorChevron').name('chevrons');
  const field = floor.addFolder('Developed field');
  R(field, c, 'fieldOpacity', 0, 1, 0.01, 'darkness');
  R(field, c, 'fieldGlow', 0, 6, 0.05, 'light off the film');
  R(field, c, 'fieldSpill', 0.02, 2, 0.01, 'spill width (m)');
  R(field, c, 'fieldGrain', 0, 2, 0.01, 'grain');
  R(field, c, 'fieldScratches', 0, 2, 0.01, 'scratches');
  R(field, c, 'fieldFlicker', 0, 1, 0.01, 'flicker');
  R(field, c, 'fieldSwirl', -6, 6, 0.01, 'wrung back (rad/s)');
  field.addColor(c, 'colorFieldDeep').name('deep');
  field.addColor(c, 'colorFieldBody').name('emulsion');
  field.addColor(c, 'colorFieldGlow').name('spill');

  const fx = folder.addFolder('6 · Particles');
  R(fx, c, 'moteRate', 0, 600, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'streakRate', 0, 800, 1, 'streaks/second');
  R(fx, c, 'streakSpeed', 0, 40, 0.1, 'streak speed');
  R(fx, c, 'streakSize', 0.005, 0.2, 0.001, 'streak size');
  R(fx, c, 'streakLife', 0.05, 2, 0.01, 'streak lifetime');
  R(fx, c, 'streakGlow', 0, 10, 0.05, 'streak glow');
  Editor.gradient(fx, c, 'colorStreak', 'streak gradient');
  R(fx, c, 'flakeCount', 0, 600, 1, 'burnt flakes');
  R(fx, c, 'flakeSize', 0.01, 0.6, 0.005, 'flake size');
  R(fx, c, 'flakeLife', 0.1, 5, 0.05, 'flake lifetime');
  R(fx, c, 'flakeGlow', 0, 6, 0.05, 'flake glow');
  Editor.gradient(fx, c, 'colorFlake', 'flake gradient');

  const lock = folder.addFolder('7 · Lock');
  R(lock, c, 'rewindWarp', 0, 4, 0.01, 'wrung air');
  R(lock, c, 'lockWarp', 0, 4, 0.01, 'implosion');
  R(lock, c, 'lockSparks', 0, 600, 1, 'sparks');
  R(lock, c, 'lockShake', 0, 2, 0.01, 'camera knock');
  R(lock, c, 'lockFlash', 0, 1, 0.01, 'flash');
  R(lock, c, 'lockLight', 0, 10, 0.05, 'light punch (× intensity)');
  R(lock, c, 'burstSize', 0, 10, 0.05, 'air shell (m)');
  R(lock, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(lock, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(lock, c, 'rewindRumble', 0, 1, 0.01, 'rumble while rewinding');
  lock.addColor(c, 'colorBurstA').name('shell inner');
  lock.addColor(c, 'colorBurstB').name('shell mid');
  lock.addColor(c, 'colorBurstC').name('shell outer');
  lock.addColor(c, 'colorShock').name('shockwave');
  lock.addColor(c, 'colorFlash').name('flash');

  const snare = folder.addFolder('8 · Snare');
  R(snare, c, 'tripImpulse', 0, 10, 0.05, 'trip (m/s)');
  R(snare, c, 'tripLift', 0, 8, 0.05, 'trip lift (m/s)');
  R(snare, c, 'holdHeight', 0, 3, 0.01, 'bound at (m)');
  R(snare, c, 'markGlow', 0, 1, 0.01, 'recorded stain');
  snare.addColor(c, 'colorMark').name('stain');
  R(snare, c, 'releaseImpulse', 0, 15, 0.05, 'dropped out (m/s)');
  R(snare, c, 'releaseLift', 0, 10, 0.05, 'drop lift (m/s)');

  folder.close();
  return folder;
}
