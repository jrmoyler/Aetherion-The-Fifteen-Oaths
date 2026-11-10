import { Mesh, PlaneGeometry, Vector2, Vector3, Vector4 } from 'three';
import { Ability } from '../Ability.js';
import { createGaleBladeGeometry, createGaleTubeGeometry } from '../../assets/matrix-new/GaleSeverGeometry.js';
import {
  createGaleBladeMaterial,
  createGaleScarMaterial,
  createGaleSheathMaterial,
  createGaleVortexMaterial,
  createGaleWarpMaterial
} from '../../materials/matrix-new/GaleSeverMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'gale';

const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _apex = new Vector3();
const _tip = new Vector3();
const _right = new Vector3();
const _floor = new Vector3();
const _local = new Vector3();
const _up = new Vector3(0, 1, 0);
const _out = new Vector3();

/**
 * GALE SEVER — a crescent of compressed air thrown down the line.
 *
 * A line cast. The blade snaps open off the hand, flies the line at waist
 * height, cuts every body it crosses in half, and at the end of the line tears
 * itself apart into wind. It leaves a long cut in the floor behind it.
 *
 * The blade flies *rolled* — a diagonal slash, its high tip up at head height
 * and its low tip scraping the floor — so that from behind the caster it is a
 * 3 m crescent standing in the air, not a sheet seen edge-on. Where the low
 * tip meets the floor is solved on the CPU (`_contactX`) and that is where the
 * scar is cut, so rolling or widening the blade moves the cut with it.
 *
 * Nine layers, each a folder in the editor:
 *
 *   1. **the blade** — a parameter-space strip bent into a crescent in the
 *      vertex stage (`createGaleBladeGeometry`). Additive, nearly transparent:
 *      one bright cutting line, a streaming haze behind it, and a three-band
 *      chromatic fringe between the two. It is lit by its own rim edge-on, so
 *      the camera can orbit it without it collapsing into a line.
 *   1b. **the pressure sheath** — the blade's *body*: a tube along the same
 *      crescent arc (`createGaleTubeGeometry`), blown up into a lens-section
 *      cushion of dense air seated behind the edge, normal-blended and lit by
 *      the sun from the ramp's deep navy underside to its pale top. This is
 *      the mass that reads at 8 m; the edge rides on it.
 *   2. **the lens** — the same crescent on `LAYER.DISTORTION`, deeper than the
 *      blade and reaching ahead of it. Its offset is the crescent's own normal
 *      times the slope of a bump across the strip, so the world is pushed out
 *      ahead of the crest and pulled in behind it — what a refracting shell of
 *      dense air does. This, not the glow, is what makes it read as *air*.
 *   3. **the spiral wake** — non-additive SMOKE shed from the two tip vortices.
 *      Each puff is placed on a helix round the tip's track (the phase is
 *      integrated by *distance flown*, so the pitch of the spiral is a length,
 *      not a rate), given a tangential roll, and curled about its anchor by the
 *      particle swirl. The two tips turn opposite ways, as real tip vortices
 *      do. Dust is scoured off the floor under the blade and DUSTRING decals
 *      pulse every `ringSpacing` metres.
 *   4. **wind lines** — additive STREAKs born in a ring round the flight line,
 *      fired along it at about the blade's own speed with a corkscrew, so they
 *      keep pace with it and outline the pressure front.
 *   5. **the scar** — a ground strip down the line that only exists behind the
 *      blade: a dark wandering slit between two light-catching lips, broken
 *      hairline scratches either side, a scoured band of dust, and a cold
 *      shine on the fresh cut that dies away behind the blade.
 *   6. **the impact** — the blade drifts on past the target, opening out and
 *      tearing apart on a noise threshold with a frayed bright edge, throwing
 *      wind ribbons off its edge; an AIR pressure shell, a shockwave, a dust
 *      ring, a knock on the camera and a punch of light. The floor answers
 *      with a **blast fan** written into the scar shader: a dark combed fan
 *      blown forward from the impact point, sized by `fanRadius`, heaped with a
 *      pale rim of dust, which stays for the whole linger.
 *   6b. **the severed vortices** — the linger. The blade's two tip vortices
 *      are left standing where it tore: two funnels 3.4 m tall
 *      (`createGaleVortexMaterial`, a helical-streamline core + a lit dust
 *      sheath each) that turn opposite ways, rise with an overshoot, lean out
 *      from each other as they drift apart, snake, draw dust up their walls,
 *      scour spiral footprints into the floor, and finally unravel from the
 *      foot up along a burning edge. Their seat is `shearRadius × vortexSeat`
 *      either side of the line, so a wider blade leaves wider-set vortices.
 *   7. **the slice** — `handlesOwnHits`. Every frame the blade is sharp it
 *      tests the ground it has swept: a body whose position is behind the
 *      crescent's edge *at its own lateral offset* (the tips trail the apex)
 *      and within reach is cut with `dummy.kill(dirX, dirZ, force, true)`.
 *
 * ## The editor rule
 *
 * A cast captures a seed and four integrated phases (the rock, the flutter,
 * the streaming body, the wake helix). Everything with a unit is resolved from
 * `settings.gale` every frame, so dragging the arc or the edge width reshapes
 * a blade already in flight, and the phases mean a rate slider never snaps.
 */
export class GaleSeverAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The blade decides what it cuts — and it cuts, it does not knock down. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies sliced this cast. HUD readout only. */
  get instanceCount() {
    return this._sliced;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 + 2: one strip, drawn twice ---- */
    this.bladeGeometry = createGaleBladeGeometry(72, 12);
    this.bladeMaterial = createGaleBladeMaterial();
    this.blade = new Mesh(this.bladeGeometry, this.bladeMaterial);
    this.blade.name = 'GaleBlade';
    this.blade.layers.set(LAYER.VFX);
    this.blade.renderOrder = 14;
    this.blade.frustumCulled = false;
    this.blade.visible = false;
    this.group.add(this.blade);

    this.warpMaterial = createGaleWarpMaterial();
    this.warp = new Mesh(this.bladeGeometry, this.warpMaterial);
    this.warp.name = 'GaleLens';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /* ---- layer 1b: the pressure sheath (the blade's body) ---- */
    this.sheathGeometry = createGaleTubeGeometry(72, 14);
    this.sheathMaterial = createGaleSheathMaterial();
    this.sheath = new Mesh(this.sheathGeometry, this.sheathMaterial);
    this.sheath.name = 'GaleSheath';
    this.sheath.layers.set(LAYER.VFX);
    this.sheath.renderOrder = 12;
    this.sheath.frustumCulled = false;
    this.sheath.visible = false;
    this.group.add(this.sheath);

    /* ---- layer 6b: the severed vortices (core + sheath, twice) ---- */
    this.vortexGeometry = createGaleTubeGeometry(48, 18);
    this._vortices = [];
    for (let k = 0; k < 2; k++) {
      const coreMaterial = createGaleVortexMaterial(false);
      const sheathMaterial = createGaleVortexMaterial(true);
      const core = new Mesh(this.vortexGeometry, coreMaterial);
      const dust = new Mesh(this.vortexGeometry, sheathMaterial);
      core.name = `GaleVortex${k}`;
      dust.name = `GaleVortexDust${k}`;
      for (const m of [core, dust]) {
        m.layers.set(LAYER.VFX);
        m.frustumCulled = false; // placed in the vertex stage
        m.visible = false;
        this.group.add(m);
      }
      dust.renderOrder = 12;
      core.renderOrder = 13;
      this._vortices.push({
        core,
        dust,
        coreMaterial,
        sheathMaterial,
        sign: k === 0 ? 1 : -1,
        state: { base: new Vector3(), out: new Vector3(1, 0, 0), grow: 0, sway: 0, spin: 0, spinDir: k === 0 ? 1 : -1, unravel: 0, fade: 1, seed: 0 }
      });
    }

    /* ---- layer 5: the scar ---- */
    this.scarGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.scarMaterial = createGaleScarMaterial();
    this.scar = new Mesh(this.scarGeometry, this.scarMaterial);
    this.scar.name = 'GaleScar';
    this.scar.layers.set(LAYER.VFX);
    this.scar.renderOrder = 2;
    this.scar.frustumCulled = false;
    this.scar.visible = false;
    this.group.add(this.scar);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._bladeState = { roll: 0, form: 0, spread: 1, dissolve: 0, phase: 0, flow: 0, fade: 1, seed: 0, strength: 0 };
    this._scarState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      lightXZ: new Vector2(1, 0),
      length: 1,
      width: 1,
      cutEnd: 0,
      bladeAt: 0,
      hot: 1,
      fadeT: 0,
      seed: 0,
      centreX: 0,
      fanAt: 0,
      fanR: 0,
      feet: new Vector4(),
      feetOn: 0,
      feetSpin: 0
    };

    /** Seconds since the blade reached the target — the linger's one clock. */
    this._since = -1;
    this._vortexSpin = 0;
    this._vortexSway = 0;

    this._seed = 0;
    this._wobble = 0;
    this._phase = 0;
    this._flow = 0;
    this._helix = 0;
    /** Metres down the line the blade's apex is. */
    this._along = 0;
    this._prevAlong = 0;
    this._nextRing = 0;
    this._sliced = 0;
    this._hot = 1;
    this._tipToggle = 0;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: the wake ---- */
    // Not additive: dust in the air has to *dirty* what is behind it.
    this.wake = particles.get('gale.wake', {
      capacity: 2600,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.wake.uniforms.uSizeIn.value = 0.12;
    this.wake.uniforms.uFadeIn.value = 0.1;
    this.wake.uniforms.uFadeOut.value = 0.45;
    this.wake.uniforms.uEndSize.value = 2.2;
    this.wake.uniforms.uGravity.value.set(0, 0, 0);

    /* ---- layer 4: wind lines ---- */
    this.streaks = particles.get('gale.streaks', {
      capacity: 1800,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    });
    this.streaks.uniforms.uSizeIn.value = 0.04;
    this.streaks.uniforms.uFadeIn.value = 0.12;
    this.streaks.uniforms.uFadeOut.value = 0.5;
    this.streaks.uniforms.uEndSize.value = 0.5;
    this.streaks.uniforms.uDrag.value = 0.4;
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);

    /* ---- layer 6: the ribbons the blade tears into ---- */
    // Curl noise, so they snake instead of flying straight like the lines.
    this.ribbons = particles.get('gale.ribbons', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      curl: true,
      softFade: 0.3
    });
    this.ribbons.uniforms.uSizeIn.value = 0.03;
    this.ribbons.uniforms.uFadeIn.value = 0.05;
    this.ribbons.uniforms.uFadeOut.value = 0.6;
    this.ribbons.uniforms.uEndSize.value = 0.3;
    this.ribbons.uniforms.uDrag.value = 2.2;
    this.ribbons.uniforms.uGravity.value.set(0, 0.4, 0);
    this.ribbons.uniforms.uTurbFrequency.value = 0.7;
    this.ribbons.uniforms.uTurbSpeed.value = 0.8;

    this.wakeEmitter = new RateEmitter();
    this.floorEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
    this.vortexDustEmitter = new RateEmitter();
    this.vortexStreakEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the blade tearing apart. */
  get impactDuration() {
    return Math.max(0.05, settings.gale.dissipateTime * settings.global.lifetime);
  }

  /** The fade is the wake settling and the scar cooling. */
  get fadeDuration() {
    return Math.max(0.1, settings.gale.lifetime * settings.global.lifetime);
  }

  /** Gusting: quick and irregular, never a steady glow. */
  lightShimmer() {
    const f = settings.gale.lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 13.1) * Math.sin(this.age * 5.3 + 0.7));
  }

  /* ------------------------------------------------------------------ */
  /* The crescent on the CPU                                             */
  /* ------------------------------------------------------------------ */

  /**
   * A point on the cutting edge at bearing `u` (-1..1), in the blade's local
   * frame (+Z flight, +Y up, apex at the origin). The CPU twin of `bladeEdge`
   * + `rollLocal` in GaleSeverMaterials — keep them together.
   */
  _bladeLocal(u, out) {
    const c = settings.gale;
    const s = this._bladeState;
    const halfArc = Math.max(0.05, c.arc * 0.5);
    const R = (Math.max(0.05, c.shearRadius) / Math.max(Math.sin(Math.min(halfArc, Math.PI / 2)), 0.1)) * s.spread;
    const th = u * halfArc * lerp(0.12, 1, s.form);
    const x = R * Math.sin(th);
    const y = c.bow * R * u * u;
    const z = R * (Math.cos(th) - 1) - c.sweepBack * R * u * u;
    const cr = Math.cos(s.roll);
    const sr = Math.sin(s.roll);
    return out.set(x * cr - y * sr, x * sr + y * cr, z);
  }

  /** Local → world, from the apex and the flight frame. */
  _toWorld(local, out) {
    return out
      .copy(_apex)
      .addScaledVector(_right, local.x)
      .addScaledVector(_up, local.y)
      .addScaledVector(this.direction, local.z);
  }

  /**
   * How far behind the apex the edge is at lateral offset `lat` (metres,
   * negative). The tips trail: that is why the slice tests against this and
   * not against a straight line through the apex.
   */
  _edgeLag(lat) {
    const c = settings.gale;
    const s = this._bladeState;
    const halfArc = Math.max(0.05, c.arc * 0.5);
    const R = (Math.max(0.05, c.shearRadius) / Math.max(Math.sin(Math.min(halfArc, Math.PI / 2)), 0.1)) * s.spread;
    const th = Math.asin(Math.max(-1, Math.min(1, lat / R)));
    const u = th / (halfArc * lerp(0.12, 1, Math.max(s.form, 0.01)));
    return R * (Math.cos(th) - 1) - c.sweepBack * R * Math.min(1, u * u);
  }

  /** Lateral half-width of the crescent right now, metres. */
  _halfWidth() {
    return Math.abs(this._bladeLocal(1, _local).x);
  }

  /**
   * Metres across the line where the blade's low tip scrapes the floor — where
   * the cut is. Solved for the *settled* blade (fully formed, no rock), so the
   * scar already laid down does not swim while the blade snaps open; scaled by
   * how close that tip comes to the floor, so a blade flown high cuts nothing
   * off-centre.
   */
  _contactX() {
    const c = settings.gale;
    const halfArc = Math.max(0.05, c.arc * 0.5);
    const R = Math.max(0.05, c.shearRadius) / Math.max(Math.sin(Math.min(halfArc, Math.PI / 2)), 0.1);
    const cr = Math.cos(c.roll);
    const sr = Math.sin(c.roll);
    let bestX = 0;
    let bestY = Infinity;
    for (let i = 0; i <= 16; i++) {
      const u = (i / 16) * 2 - 1;
      const th = u * halfArc;
      const x = R * Math.sin(th);
      const y = c.bow * R * u * u;
      const wy = c.bladeHeight + x * sr + y * cr;
      if (wy < bestY) {
        bestY = wy;
        bestX = x * cr - y * sr;
      }
    }
    return bestX * saturate(1 - bestY / 0.6) * c.scarFollowTip;
  }

  /** Seconds the linger lasts in all: the tearing plus the fade. */
  _lingerTotal() {
    return this.impactDuration + this.fadeDuration;
  }

  /** Place both severed vortices from the one clock `_since`. */
  _syncVortices() {
    const c = settings.gale;
    const g = settings.global;
    const since = Math.max(0, this._since);
    const total = this._lingerTotal();
    const exit = Math.min(Math.max(0.05, c.vortexExit * g.lifetime), total * 0.8);
    const grow = this._since < 0 ? 0 : Easing.outBack(saturate(since / Math.max(0.02, c.vortexRiseTime)));
    const unravel = saturate((since - (total - exit)) / exit);
    const seat = Math.max(0, c.shearRadius * c.vortexSeat) + c.vortexDrift * since;
    const along = this.length + c.dissipateDrift * c.vortexAlong;
    for (const v of this._vortices) {
      const st = v.state;
      _floor.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(_right, seat * v.sign);
      st.base.copy(_floor).setY(unravel * c.vortexLiftOff);
      st.out.copy(_right).multiplyScalar(v.sign).addScaledVector(this.direction, c.vortexLeanForward).normalize();
      st.grow = grow;
      st.sway = this._vortexSway + v.sign * 3.1;
      st.spin = this._vortexSpin;
      st.spinDir = v.sign;
      st.unravel = unravel;
      st.fade = 1 - smoothstep(0.82, 1, unravel);
      st.seed = this._seed + v.sign * 11.3;
      v.coreMaterial.userData.sync(st);
      v.sheathMaterial.userData.sync(st);
    }
    return { grow, unravel, seat, along };
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.gale;
    const g = settings.global;

    this.wakeEmitter.reset();
    this.floorEmitter.reset();
    this.streakEmitter.reset();

    this._seed = Math.random() * 100;
    this._wobble = Math.random() * TAU;
    this._phase = Math.random() * 10;
    this._flow = 0;
    this._helix = Math.random() * TAU;
    this._along = 0;
    this._prevAlong = 0;
    this._nextRing = Math.max(0.5, c.scarStart + c.ringSpacing * 0.5);
    this._sliced = 0;
    this._hot = 1;
    this._tipToggle = 0;
    this._since = -1;
    this._vortexSpin = Math.random() * TAU;
    this._vortexSway = Math.random() * 10;
    this.vortexDustEmitter.reset();
    this.vortexStreakEmitter.reset();
    for (const v of this._vortices) {
      v.core.visible = false;
      v.dust.visible = false;
    }

    // Local +X of the blade in the world: a yaw of atan2(dir.x, dir.z) sends
    // local +Z down the line and local +X to (dir.z, 0, -dir.x).
    _right.set(this.direction.z, 0, -this.direction.x);

    this._scarState.fadeT = 0;
    this._scarState.hot = 1;
    this._scarState.fanR = 0;
    this._scarState.feetOn = 0;

    const s = this._bladeState;
    s.seed = this._seed;
    s.form = 0;
    s.spread = 1;
    s.dissolve = 0;
    s.fade = 1;

    this.blade.visible = true;
    this.warp.visible = true;
    this.sheath.visible = true;
    this.scar.visible = true;
    const yaw = Math.atan2(this.direction.x, this.direction.z);
    this.blade.rotation.set(0, yaw, 0);
    this.warp.rotation.set(0, yaw, 0);
    this.sheath.rotation.set(0, yaw, 0);

    /* the gust off the caster's feet as the blade is thrown */
    this._resetEmit(frame.uTime.value);
    _pos.copy(this.origin).addScaledVector(this.direction, 0.4).setY(0.2);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.5;
    _emit.direction = _dir.copy(this.direction).setY(0.25).normalize();
    _emit.speed = c.floorDustSpeed;
    _emit.spread = 0.8;
    _emit.size = c.wakeSize * 0.8;
    _emit.life = c.wakeLifetime * 0.7;
    _emit.spin = 0.6;
    this.wake.emit(Math.round(c.castGust * g.particleCount), _emit);

    /* the draw: wind lines sucked into the hand as the blade is wound up */
    this._resetEmit(frame.uTime.value);
    _apex.copy(this.origin).addScaledVector(this.direction, 0.5).setY(c.bladeHeight);
    _emit.size = c.streakSize;
    _emit.life = c.castDrawTime;
    _emit.lifeVariance = 0.2;
    _emit.speedVariance = 0.15;
    const draw = Math.round(c.castDraw * g.particleCount);
    for (let n = 0; n < draw; n++) {
      const a = Math.random() * TAU;
      const r = c.castDrawRadius * (0.6 + 0.4 * Math.random());
      _pos.copy(_apex)
        .addScaledVector(_right, Math.cos(a) * r)
        .addScaledVector(_up, Math.sin(a) * r * 0.7)
        .addScaledVector(this.direction, -0.4 * Math.random());
      if (_pos.y < 0.08) _pos.y = 0.08;
      _dir.copy(_apex).sub(_pos);
      const d = _dir.length();
      _emit.position = _pos;
      _emit.direction = _dir.divideScalar(Math.max(d, 1e-4));
      _emit.speed = d / Math.max(0.05, c.castDrawTime);
      this.streaks.emit(1, _emit);
    }

    this._sync(0);
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

  /** Advance the integrated phases. Rates are live; positions never jump. */
  _advance(dt) {
    const c = settings.gale;
    const g = settings.global;
    this._wobble += c.wobbleSpeed * dt * g.animationSpeed;
    this._phase += 2.5 * dt * g.noiseSpeed;
    this._flow += c.streakFlow * dt * g.noiseSpeed;
  }

  /**
   * Resolve the blade, the lens and the scar from settings.
   * @param {number} dissolveT 0 whole .. 1 gone (the impact phase)
   */
  _sync(dissolveT) {
    const c = settings.gale;
    const g = settings.global;
    const s = this._bladeState;

    const grow = Easing.outCubic(dissolveT);
    s.roll = c.roll + c.rollWobble * g.randomness * Math.sin(this._wobble);
    s.form = Math.max(0, Easing.outBack(saturate(this.age / Math.max(0.01, c.formTime))));
    s.spread = lerp(1, Math.max(1, c.dissipateGrow), grow);
    s.dissolve = Easing.inOutQuad(dissolveT);
    s.phase = this._phase;
    s.flow = this._flow;
    s.fade = 1;
    s.strength = Math.min(1, s.form) * (1 - Easing.inQuad(dissolveT));
    this.bladeMaterial.userData.sync(s);
    this.warpMaterial.userData.sync(s);
    this.sheathMaterial.userData.sync(s);

    // The apex rides the line at blade height.
    _apex.copy(this.origin).addScaledVector(this.direction, this._along);
    _apex.y = c.bladeHeight;
    this.blade.position.copy(_apex);
    this.warp.position.copy(_apex);
    this.sheath.position.copy(_apex);

    /* the scar */
    const sc = this._scarState;
    const start = Math.max(0, c.scarStart);
    sc.start.copy(this.origin).addScaledVector(this.direction, start);
    sc.dir.copy(this.direction);
    sc.side.copy(_right);
    sc.centreX = this._contactX();
    const v = this._syncVortices();
    const fanReach = Math.max(0, c.fanRadius) * Math.max(1, settings.global.explosionIntensity);
    sc.length = Math.max(0.2, this.length + Math.max(c.dissipateDrift, fanReach) - start + 0.5);
    sc.width = 2 * (Math.max(c.scarScour, c.scarCut + c.scarLips + c.scarScratchSpread, fanReach, v.seat + c.footRadius) + Math.abs(sc.centreX) + c.scarWiggle + 0.25);
    sc.fanAt = this.length - start;
    sc.fanR = this._since < 0 ? 0 : fanReach * Easing.outCubic(saturate(this._since / Math.max(0.02, c.fanSpread)));
    sc.feet.set(v.seat, -v.seat, v.along - start, c.footRadius * Math.min(1, v.grow));
    sc.feetOn = this._since < 0 ? 0 : saturate(v.grow) * (1 - v.unravel * 0.5);
    sc.feetSpin = this._vortexSpin * c.footSpin;
    // The cut ends where the blade's *tips* are — they are what touch the floor.
    sc.bladeAt = this._along - start;
    sc.cutEnd = Math.max(0, this._along - start);
    sc.hot = this._hot;
    sc.seed = this._seed;
    sc.lightXZ.set(frame.uLightDir.value.dot(_right), frame.uLightDir.value.dot(this.direction));
    this.scarMaterial.userData.sync(sc);

    /* the particles' looks */
    this.wake.setGradient(getColor(c.colorWakeA), getColor(c.colorWakeB), getColor(c.colorWakeC), getColor(c.colorWakeD));
    const w = this.wake.uniforms;
    w.uDrag.value = c.wakeDrag;
    w.uSwirl.value = c.wakeSwirl;
    w.uSwirlExpand.value = c.wakeExpand;
    w.uSizeScale.value = g.particleSize;
    w.uLifeScale.value = g.particleLifetime;
    w.uSpeedScale.value = g.particleSpeed;
    w.uOpacity.value = c.wakeOpacity * g.opacity;
    w.uTurbulence.value = c.wakeTurbulence * g.turbulence;

    this.streaks.setGradient(getColor(c.colorStreakA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
    const st = this.streaks.uniforms;
    st.uStretch.value = c.streakStretch;
    st.uSizeScale.value = g.particleSize;
    st.uLifeScale.value = g.particleLifetime;
    st.uSpeedScale.value = g.particleSpeed;
    st.uOpacity.value = g.opacity;
    st.uGlow.value = c.streakGlow * g.glow;
    st.uTurbulence.value = 0.15 * g.turbulence;

    this.ribbons.setGradient(getColor(c.colorBurstA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
    const r = this.ribbons.uniforms;
    r.uStretch.value = c.ribbonStretch;
    r.uSizeScale.value = g.particleSize;
    r.uLifeScale.value = g.particleLifetime;
    r.uSpeedScale.value = g.particleSpeed;
    r.uOpacity.value = g.opacity;
    r.uGlow.value = c.streakGlow * g.glow;
    r.uTurbulence.value = 1.6 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.gale;
    this._advance(dt);
    this._prevAlong = this._along;
    this._along = this.front;
    this._sync(0);

    this._flightFx(dt, 1);
    this._slice();
    this.ctx.shake.rumble(c.travelRumble, dt);

    // The light rides the blade.
    this.position.copy(_apex);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the blade tears itself apart                               */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.gale;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;

    _apex.copy(this.origin).addScaledVector(this.direction, this.length);
    _apex.y = c.bladeHeight;

    /* the linger's clock starts; the two tip vortices stand up */
    this._since = 0;
    for (const v of this._vortices) {
      v.core.visible = true;
      v.dust.visible = true;
    }

    /* a shell of pressure, squashed along the floor */
    this.ctx.bursts.spawn(BurstMode.AIR, _apex, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.5,
      fresnel: 2.4,
      displace: 0.35,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    _floor.copy(_apex).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.ringRadius * 1.6,
      life: c.ringLife * 1.4,
      intensity: c.ringIntensity,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB)
    });

    /* the ribbons: torn off the edge, flung out along its own normal */
    this._resetEmit(time);
    const count = Math.round(c.ribbonCount * g.particleCount);
    _emit.radius = 0.08;
    _emit.speedVariance = 0.45;
    _emit.spread = 0.25;
    _emit.size = c.ribbonSize;
    _emit.life = c.ribbonLifetime;
    _emit.lifeVariance = 0.4;
    for (let n = 0; n < count; n++) {
      const u = Math.random() * 2 - 1;
      this._bladeLocal(u, _local);
      this._toWorld(_local, _pos);
      // The crescent's outward normal at u, plus forward momentum.
      const th = Math.atan2(_local.x, _local.z + 1e-3);
      _dir.copy(this.direction).multiplyScalar(1.2)
        .addScaledVector(_right, Math.sin(u * 1.2) + Math.sin(th) * 0.2)
        .addScaledVector(_up, (Math.random() - 0.3) * 0.6)
        .normalize();
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = c.ribbonSpeed;
      this.ribbons.emit(1, _emit);
    }

    /* the floor thrown up under it */
    this._resetEmit(time);
    _pos.copy(_floor).setY(0.25);
    _emit.position = _pos;
    _emit.anchor = _floor;
    _emit.radius = c.ringRadius * 0.5;
    _emit.direction = _dir.copy(this.direction).setY(0.5).normalize();
    _emit.speed = c.floorDustSpeed * 1.2;
    _emit.spread = 0.9;
    _emit.size = c.wakeSize * 1.3;
    _emit.life = c.wakeLifetime;
    _emit.spin = 0.5;
    this.wake.emit(Math.round(c.dustBurst * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  onFade(dt, t) {
    const c = settings.gale;
    const g = settings.global;
    this._advance(dt);
    this._since += dt;
    this._vortexSpin += c.vortexSpin * dt * g.animationSpeed * (1 - 0.5 * saturate(t - 1));
    this._vortexSway += c.vortexSwaySpeed * dt * g.animationSpeed;
    this._lingerFx(dt);

    if (t <= 1) {
      // Carries on past the target, opening and tearing as it goes.
      this._prevAlong = this._along;
      this._along = this.length + c.dissipateDrift * Easing.outCubic(t);
      this._sync(t);
      const strength = 1 - Easing.inQuad(t);
      this._flightFx(dt, strength);
      // Still sharp for the first half of its coming apart.
      if (t < 0.5) this._slice();
      this.position.copy(_apex);
      return;
    }

    /* the fade: the blade is gone; the wake settles and the scar cools */
    const ft = saturate(t - 1);
    this.blade.visible = false;
    this.warp.visible = false;
    this.sheath.visible = false;
    this._hot = Math.max(0, this._hot - dt / Math.max(0.05, c.scarCool));
    this._sync(1);
    this._scarState.fadeT = smoothstep(0.45, 1, ft);
    this.scarMaterial.userData.sync(this._scarState);
    // The light stays with the vortices.
    this.position.copy(this.origin).addScaledVector(this.direction, this.length).setY(c.vortexHeight * 0.4);
    if (ft >= 0.999) {
      for (const v of this._vortices) {
        v.core.visible = false;
        v.dust.visible = false;
      }
    }
  }

  /** Dust drawn up the walls of the vortices and wind lines wound round them. */
  _lingerFx(dt) {
    const c = settings.gale;
    const g = settings.global;
    if (this._since < 0) return;
    const st0 = this._vortices[0].state;
    const live = Math.min(1, st0.grow) * (1 - st0.unravel);
    if (live <= 0.01) return;
    const time = frame.uTime.value;

    const dust = Math.round(this.vortexDustEmitter.tick(dt, c.vortexDust * live) * g.particleCount);
    if (dust > 0) {
      this._resetEmit(time);
      _emit.size = c.wakeSize * 1.1;
      _emit.life = c.wakeLifetime;
      _emit.spin = 0.6;
      _emit.speedVariance = 0.3;
      for (let n = 0; n < dust; n++) {
        const v = this._vortices[n & 1];
        const st = v.state;
        const a = Math.random() * TAU;
        const h = Math.random() * c.vortexHeight * 0.35;
        const r = (c.vortexBaseRadius + (c.vortexTopRadius - c.vortexBaseRadius) * (h / Math.max(0.1, c.vortexHeight))) * 1.2;
        _pos.copy(st.base).addScaledVector(st.out, c.vortexLean * h * (h / Math.max(0.1, c.vortexHeight)));
        _pos.x += Math.cos(a) * r;
        _pos.z += Math.sin(a) * r;
        _pos.y = Math.max(0.1, st.base.y + h);
        // Round the wall the way this vortex turns, and up it.
        _vel.set(-Math.sin(a) * v.sign * c.wakeSpeed, c.vortexUpdraft, Math.cos(a) * v.sign * c.wakeSpeed);
        const speed = _vel.length();
        _emit.position = _pos;
        _emit.anchor = st.base;
        _emit.direction = _dir.copy(_vel).divideScalar(Math.max(speed, 1e-4));
        _emit.speed = speed;
        this.wake.emit(1, _emit);
      }
    }

    const lines = Math.round(this.vortexStreakEmitter.tick(dt, c.vortexStreakRate * live) * g.particleCount);
    if (lines > 0) {
      this._resetEmit(time);
      _emit.size = c.streakSize;
      _emit.life = c.streakLifetime * 1.4;
      _emit.speedVariance = 0.25;
      for (let n = 0; n < lines; n++) {
        const v = this._vortices[n & 1];
        const st = v.state;
        const a = Math.random() * TAU;
        const f = Math.random();
        const h = f * c.vortexHeight * Math.min(1, st.grow);
        const r = c.vortexBaseRadius + (c.vortexTopRadius - c.vortexBaseRadius) * Math.pow(f, c.vortexFlare);
        _pos.copy(st.base).addScaledVector(st.out, c.vortexLean * h * f);
        _pos.x += Math.cos(a) * r;
        _pos.z += Math.sin(a) * r;
        _pos.y = st.base.y + h;
        _vel.set(-Math.sin(a) * v.sign, 0.25, Math.cos(a) * v.sign);
        _emit.position = _pos;
        _emit.direction = _dir.copy(_vel).normalize();
        _emit.speed = c.vortexStreakSpeed;
        this.streaks.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects in flight                                                   */
  /* ------------------------------------------------------------------ */

  /** Wake, scoured floor, wind lines and dust rings, scaled by `strength`. */
  _flightFx(dt, strength) {
    const c = settings.gale;
    const g = settings.global;
    const time = frame.uTime.value;
    const step = Math.max(0, this._along - this._prevAlong);

    // The helix advances with distance, so its pitch is a length on the floor.
    this._helix += step * c.vortexTurns * TAU;

    /* layer 3: puffs shed on a helix round each tip's track */
    const puffs = Math.round(this.wakeEmitter.tick(dt, c.wakeRate * strength) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      _emit.size = c.wakeSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.wakeLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.5;
      _emit.speedVariance = 0.3;
      const r = c.wakeRadius;
      for (let n = 0; n < puffs; n++) {
        // Alternate tips; they turn opposite ways.
        const sign = (this._tipToggle++ & 1) === 0 ? 1 : -1;
        this._bladeLocal(sign * 0.97, _local);
        this._toWorld(_local, _tip);
        // Spread the puffs back over the ground covered this frame, winding
        // the helix back by the same distance so the spiral stays coherent.
        const back = Math.random() * step;
        _tip.addScaledVector(this.direction, -back);
        const turn = this._helix - back * c.vortexTurns * TAU;
        const a = turn * sign + (Math.random() - 0.5) * 0.6 + (sign > 0 ? 0 : Math.PI);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        _pos.copy(_tip).addScaledVector(_right, ca * r).addScaledVector(_up, sa * r);
        if (_pos.y < 0.08) _pos.y = 0.08;
        // Rolling round the tube, falling back, drifting up.
        _vel.set(0, 0, 0)
          .addScaledVector(_right, -sa * c.wakeSpeed * sign)
          .addScaledVector(_up, ca * c.wakeSpeed * sign + c.wakeLift)
          .addScaledVector(this.direction, -c.wakeTrail);
        const speed = _vel.length();
        _emit.position = _pos;
        _emit.anchor = _tip;
        _emit.direction = speed > 1e-4 ? _dir.copy(_vel).divideScalar(speed) : _up;
        _emit.speed = speed;
        this.wake.emit(1, _emit);
      }
    }

    /* dust scoured off the floor under the blade, thrown out sideways */
    const dust = Math.round(this.floorEmitter.tick(dt, c.floorDust * strength) * g.particleCount);
    if (dust > 0) {
      this._resetEmit(time);
      const half = this._halfWidth();
      _emit.size = c.wakeSize * 0.7;
      _emit.life = c.wakeLifetime * 0.8;
      _emit.spin = 0.6;
      _emit.spread = 0.35;
      _emit.speed = c.floorDustSpeed;
      _emit.speedVariance = 0.5;
      for (let n = 0; n < dust; n++) {
        const lat = (Math.random() * 2 - 1) * half;
        _floor.copy(_apex).setY(0.12)
          .addScaledVector(_right, lat)
          .addScaledVector(this.direction, this._edgeLag(lat) - Math.random() * step);
        _dir.copy(_right).multiplyScalar(Math.sign(lat) || 1).addScaledVector(_up, 0.35).addScaledVector(this.direction, -0.3).normalize();
        _emit.position = _floor;
        _emit.anchor = _floor;
        _emit.direction = _dir;
        this.wake.emit(1, _emit);
      }
    }

    /* layer 4: wind lines pacing the blade, corkscrewing round its line */
    const lines = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (lines > 0) {
      this._resetEmit(time);
      const reach = this._halfWidth() * c.streakReach;
      const base = c.speed * g.speed * c.streakSpeed;
      _emit.size = c.streakSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.streakLifetime;
      _emit.lifeVariance = 0.4;
      _emit.speedVariance = 0;
      for (let n = 0; n < lines; n++) {
        const a = Math.random() * TAU;
        const rr = reach * Math.sqrt(0.15 + 0.85 * Math.random());
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        _pos.copy(_apex)
          .addScaledVector(_right, ca * rr)
          .addScaledVector(_up, sa * rr * 0.6)
          .addScaledVector(this.direction, lerp(-1.2, 0.4, Math.random()));
        if (_pos.y < 0.05) _pos.y = 0.05;
        _vel.copy(this.direction).multiplyScalar(base * (1 + (Math.random() * 2 - 1) * c.streakSpeedJitter * g.randomness))
          .addScaledVector(_right, -sa * c.streakSpiral)
          .addScaledVector(_up, ca * c.streakSpiral * 0.6);
        const speed = _vel.length();
        _emit.position = _pos;
        _emit.direction = speed > 1e-4 ? _dir.copy(_vel).divideScalar(speed) : this.direction;
        _emit.speed = speed;
        this.streaks.emit(1, _emit);
      }
    }

    /* a dust ring on the floor every `ringSpacing` metres */
    const spacing = Math.max(0.3, c.ringSpacing);
    let guard = 0;
    while (this._along >= this._nextRing && guard++ < 8) {
      this.pointAt(Math.min(1.5, this._nextRing / this.length), _floor);
      _floor.y = 0;
      this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
        radius: c.ringRadius,
        life: c.ringLife,
        intensity: c.ringIntensity * strength,
        colorA: getColor(c.colorRingA),
        colorB: getColor(c.colorRingB)
      });
      this._nextRing += spacing;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The slice                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Cut whatever the edge has passed through since the last frame.
   *
   * A body is in the swept volume when it is within reach of the line and
   * behind the edge at its own lateral offset — but not so far behind that the
   * blade passed it more than a frame ago (that body was tested then).
   */
  _slice() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.gale;
    const g = settings.global;

    const reach = this._halfWidth() + c.sliceReach;
    const lagMax = Math.abs(this._edgeLag(reach)) + 0.5;
    const from = this._prevAlong - lagMax - 0.4;
    const to = this._along + 0.1;
    if (to <= 0) return;
    const mid = Math.max(0, (from + to) * 0.5);
    this.pointAt(Math.min(2, mid / this.length), _floor);
    const radius = Math.hypot((to - from) * 0.5, reach);
    const found = field.findTargets(_floor.x, _floor.z, radius, this._found);
    if (found.length === 0) return;

    this._force.impulse = c.sliceImpulse * g.explosionIntensity;
    this._force.lift = c.sliceLift * g.explosionIntensity;
    this._force.spin = c.sliceSpin;

    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * _right.x + dz * _right.z;
      if (Math.abs(lat) > reach || along < 0.2) continue;
      const lag = this._edgeLag(Math.max(-reach, Math.min(reach, lat)));
      if (along > this._along + lag) continue; // the edge has not reached it yet
      if (along < this._prevAlong + lag - 0.6) continue; // passed long ago

      // Mostly along the flight; a little outward along the crescent.
      _dir.copy(this.direction).addScaledVector(_right, (Math.sign(lat) || 1) * 0.3).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, true)) continue;
      this._sliced++;
      this._hitFx(dummy.position, _dir);
    }
  }

  /** Dust and a spray of wind where a body was cut. */
  _hitFx(at, dir) {
    const c = settings.gale;
    const g = settings.global;
    const time = frame.uTime.value;
    this._resetEmit(time);
    _pos.copy(at).setY(c.bladeHeight);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.25;
    _emit.direction = dir;
    _emit.speed = c.floorDustSpeed;
    _emit.spread = 0.6;
    _emit.size = c.wakeSize * 0.8;
    _emit.life = c.wakeLifetime * 0.7;
    _emit.spin = 0.6;
    this.wake.emit(Math.round(c.hitDust * g.particleCount), _emit);

    _emit.anchor = null;
    _emit.radius = 0.1;
    _emit.speed = c.ribbonSpeed * 0.6;
    _emit.spread = 0.5;
    _emit.size = c.ribbonSize;
    _emit.life = c.ribbonLifetime * 0.6;
    this.ribbons.emit(Math.round(c.hitDust * 0.6 * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * 0.35, 6, 22);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.blade.visible = false;
    this.warp.visible = false;
    this.sheath.visible = false;
    this.scar.visible = false;
    for (const v of this._vortices) {
      v.core.visible = false;
      v.dust.visible = false;
    }
  }

  dispose() {
    this.bladeGeometry.dispose();
    this.sheathGeometry.dispose();
    this.vortexGeometry.dispose();
    this.scarGeometry.dispose();
    this.bladeMaterial.dispose();
    this.warpMaterial.dispose();
    this.sheathMaterial.dispose();
    this.scarMaterial.dispose();
    for (const v of this._vortices) {
      v.coreMaterial.dispose();
      v.sheathMaterial.dispose();
    }
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F32C}  Gale Sever');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'blade speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'vortices + scar linger (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'gusting');

  const blade = folder.addFolder('1 · Blade');
  const shape = blade.addFolder('Silhouette');
  R(shape, c, 'shearRadius', 0.2, 6, 0.01, 'half-width (m)');
  R(shape, c, 'arc', 0.2, 4.5, 0.01, 'arc (rad)');
  R(shape, c, 'bladeHeight', 0.1, 3, 0.01, 'flight height (m)');
  R(shape, c, 'bodyLength', 0.05, 3, 0.01, 'body depth (m)');
  R(shape, c, 'taper', 0.05, 4, 0.01, 'taper to the tips');
  R(shape, c, 'sweepBack', -0.5, 1, 0.005, 'tips swept back');
  R(shape, c, 'bow', -0.5, 0.5, 0.005, 'tips curled up');
  R(shape, c, 'roll', -1.6, 1.6, 0.01, 'roll (rad)');
  R(shape, c, 'rollWobble', 0, 0.6, 0.005, 'rock (rad)');
  R(shape, c, 'wobbleSpeed', 0, 30, 0.1, 'rock speed');
  R(shape, c, 'flutter', 0, 0.4, 0.005, 'body flutter (m)');
  R(shape, c, 'flutterScale', 0.2, 10, 0.05, 'flutter scale');
  R(shape, c, 'formTime', 0.01, 1, 0.005, 'snaps open over (s)');

  const look = blade.addFolder('Shading');
  R(look, c, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');
  R(look, c, 'edgeGlow', 0, 15, 0.05, 'edge glow');
  R(look, c, 'bodyOpacity', 0, 1, 0.01, 'body opacity');
  R(look, c, 'bodyFalloff', 0.1, 6, 0.01, 'body falloff');
  R(look, c, 'rimGlow', 0, 6, 0.01, 'edge-on glow');
  R(look, c, 'tipFade', 0.01, 1, 0.01, 'tip softness');
  R(look, c, 'streakScale', 0.5, 24, 0.1, 'wind lines across');
  R(look, c, 'streakFlow', 0, 12, 0.05, 'wind line flow');
  R(look, c, 'fringe', 0, 4, 0.01, 'chromatic fringe');
  R(look, c, 'fringeOffset', 0, 0.5, 0.001, 'fringe offset');
  R(look, c, 'fringeWidth', 0.002, 0.2, 0.001, 'fringe band width');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  look.addColor(c, 'colorA').name('body');
  look.addColor(c, 'colorB').name('cutting edge');
  look.addColor(c, 'colorFringeR').name('fringe 1');
  look.addColor(c, 'colorFringeG').name('fringe 2');
  look.addColor(c, 'colorFringeB').name('fringe 3');

  const sheath = blade.addFolder('Pressure sheath (body)');
  R(sheath, c, 'sheathThickness', 0, 1.5, 0.005, 'thickness (m)');
  R(sheath, c, 'sheathWidth', 0, 1.5, 0.01, 'depth (× body)');
  R(sheath, c, 'sheathSeat', 0, 1, 0.01, 'seat behind edge');
  R(sheath, c, 'sheathTaper', 0.05, 4, 0.01, 'taper to the tips');
  R(sheath, c, 'sheathOpacity', 0, 1, 0.01, 'opacity');
  R(sheath, c, 'sheathFresnel', 0.2, 8, 0.05, 'rim power');
  R(sheath, c, 'sheathNoise', 0, 1, 0.01, 'dust breakup');
  sheath.addColor(c, 'colorSheathTint').name('lit top');
  sheath.addColor(c, 'colorSheathBody').name('body');
  sheath.addColor(c, 'colorSheathDeep').name('deep underside');

  const warp = folder.addFolder('2 · Distortion');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpWidth', 0.2, 6, 0.01, 'depth (× body)');
  R(warp, c, 'warpLead', 0, 2, 0.01, 'bow wave ahead (m)');
  R(warp, c, 'warpScale', 0.1, 8, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 12, 0.05, 'noise speed');
  R(warp, c, 'warpSwirl', 0, 1, 0.01, 'turbulence share');

  const wake = folder.addFolder('3 · Spiral wake');
  R(wake, c, 'wakeRate', 0, 800, 1, 'puffs/second');
  R(wake, c, 'wakeSize', 0.05, 3, 0.01, 'puff size');
  R(wake, c, 'wakeRadius', 0, 2, 0.01, 'vortex radius (m)');
  R(wake, c, 'vortexTurns', 0, 4, 0.01, 'turns per metre');
  R(wake, c, 'wakeSpeed', 0, 10, 0.05, 'roll speed (m/s)');
  R(wake, c, 'wakeTrail', -4, 8, 0.05, 'fall back (m/s)');
  R(wake, c, 'wakeLift', -2, 4, 0.01, 'lift (m/s)');
  R(wake, c, 'wakeLifetime', 0.1, 5, 0.05, 'lifetime');
  R(wake, c, 'wakeOpacity', 0, 1, 0.01, 'opacity');
  R(wake, c, 'wakeSwirl', -10, 10, 0.05, 'curl (rad/s)');
  R(wake, c, 'wakeExpand', 0, 4, 0.01, 'curl opens');
  R(wake, c, 'wakeDrag', 0, 6, 0.01, 'drag');
  R(wake, c, 'wakeTurbulence', 0, 3, 0.01, 'turbulence');
  R(wake, c, 'floorDust', 0, 600, 1, 'floor dust/second');
  R(wake, c, 'floorDustSpeed', 0, 12, 0.05, 'floor dust speed');
  R(wake, c, 'ringSpacing', 0.3, 10, 0.05, 'dust ring every (m)');
  R(wake, c, 'ringRadius', 0.1, 5, 0.05, 'dust ring radius');
  R(wake, c, 'ringLife', 0.1, 5, 0.05, 'dust ring life');
  R(wake, c, 'ringIntensity', 0, 2, 0.01, 'dust ring strength');
  wake.addColor(c, 'colorRingA').name('ring dark');
  wake.addColor(c, 'colorRingB').name('ring light');
  Editor.gradient(wake, c, 'colorWake', 'wake gradient');

  const lines = folder.addFolder('4 · Wind lines');
  R(lines, c, 'streakRate', 0, 800, 1, 'per second');
  R(lines, c, 'streakSize', 0.005, 0.3, 0.001, 'width');
  R(lines, c, 'streakSpeed', 0, 2.5, 0.01, 'speed (× blade)');
  R(lines, c, 'streakSpeedJitter', 0, 1, 0.01, 'speed jitter');
  R(lines, c, 'streakSpiral', -16, 16, 0.1, 'corkscrew (m/s)');
  R(lines, c, 'streakReach', 0.2, 3, 0.01, 'radius (× half-width)');
  R(lines, c, 'streakStretch', 0, 1, 0.005, 'stretch');
  R(lines, c, 'streakLifetime', 0.05, 2, 0.01, 'lifetime');
  R(lines, c, 'streakGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(lines, c, 'colorStreak', 'line gradient');

  const scar = folder.addFolder('5 · Cut scar');
  R(scar, c, 'scarStart', 0, 4, 0.01, 'starts after (m)');
  R(scar, c, 'scarFollowTip', 0, 1, 0.01, 'cut under the low tip');
  R(scar, c, 'scarCut', 0.005, 0.4, 0.001, 'slit half-width (m)');
  R(scar, c, 'scarLips', 0.005, 0.4, 0.001, 'lip width (m)');
  R(scar, c, 'scarScour', 0.05, 4, 0.01, 'scoured band (m)');
  R(scar, c, 'scarScratches', 0, 6, 1, 'scratches');
  R(scar, c, 'scarScratchSpread', 0.02, 2, 0.01, 'scratch spread (m)');
  R(scar, c, 'scarWiggle', 0, 0.5, 0.005, 'wander (m)');
  R(scar, c, 'scarWiggleScale', 0.05, 4, 0.01, 'wander scale');
  R(scar, c, 'scarDark', 0, 1, 0.01, 'slit opacity');
  R(scar, c, 'scarLipBright', 0, 1, 0.01, 'lip opacity');
  R(scar, c, 'scarScourOpacity', 0, 1, 0.01, 'scour opacity');
  R(scar, c, 'scarGlow', 0, 10, 0.05, 'fresh-cut shine');
  R(scar, c, 'scarGlowLength', 0.1, 20, 0.05, 'shine length (m)');
  R(scar, c, 'scarCool', 0.05, 5, 0.01, 'cools over (s)');
  R(scar, c, 'scarErode', 0, 1, 0.01, 'ragged fade');
  scar.addColor(c, 'colorScarDeep').name('slit');
  scar.addColor(c, 'colorScarLip').name('lips');
  scar.addColor(c, 'colorScarScour').name('scour');
  scar.addColor(c, 'colorScarGlow').name('shine');

  const impact = folder.addFolder('6 · Impact');
  R(impact, c, 'dissipateTime', 0.05, 2, 0.01, 'tears apart over (s)');
  R(impact, c, 'dissipateGrow', 1, 4, 0.01, 'opens out (×)');
  R(impact, c, 'dissipateDrift', 0, 10, 0.05, 'drifts on (m)');
  R(impact, c, 'ribbonCount', 0, 300, 1, 'ribbons');
  R(impact, c, 'ribbonSpeed', 0, 40, 0.1, 'ribbon speed');
  R(impact, c, 'ribbonSize', 0.005, 0.4, 0.001, 'ribbon width');
  R(impact, c, 'ribbonStretch', 0, 1, 0.005, 'ribbon stretch');
  R(impact, c, 'ribbonLifetime', 0.05, 3, 0.01, 'ribbon lifetime');
  R(impact, c, 'burstSize', 0, 14, 0.05, 'pressure shell (m)');
  R(impact, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(impact, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(impact, c, 'dustBurst', 0, 200, 1, 'dust thrown');
  R(impact, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(impact, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(impact, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(impact, c, 'impactLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(impact, c, 'travelRumble', 0, 1, 0.01, 'rumble in flight');
  R(impact, c, 'castGust', 0, 120, 1, 'gust at the hand');
  R(impact, c, 'castDraw', 0, 200, 1, 'wind drawn into the hand');
  R(impact, c, 'castDrawRadius', 0.2, 4, 0.01, 'drawn in from (m)');
  R(impact, c, 'castDrawTime', 0.05, 0.8, 0.01, 'draw time (s)');
  R(impact, c, 'fanRadius', 0, 10, 0.05, 'blast fan (m)');
  R(impact, c, 'fanSpread', 0.02, 2, 0.01, 'fan spreads over (s)');
  R(impact, c, 'fanOpacity', 0, 1, 0.01, 'fan opacity');
  R(impact, c, 'fanStreaks', 1, 30, 0.5, 'fan combing');
  impact.addColor(c, 'colorFan').name('fan + scour deep');
  impact.addColor(c, 'colorBurstA').name('shell inner');
  impact.addColor(c, 'colorBurstB').name('shell mid');
  impact.addColor(c, 'colorBurstC').name('shell outer');
  impact.addColor(c, 'colorShockA').name('shockwave');
  impact.addColor(c, 'colorShockB').name('shockwave hot');
  impact.addColor(c, 'colorFlash').name('flash');

  const vort = folder.addFolder('6b · Severed vortices (linger)');
  R(vort, c, 'vortexHeight', 0.2, 10, 0.05, 'height (m)');
  R(vort, c, 'vortexBaseRadius', 0.02, 2, 0.01, 'foot radius (m)');
  R(vort, c, 'vortexTopRadius', 0.05, 4, 0.01, 'top radius (m)');
  R(vort, c, 'vortexFlare', 0.2, 5, 0.01, 'flare');
  R(vort, c, 'vortexSeat', 0, 2, 0.01, 'seat (× half-width)');
  R(vort, c, 'vortexAlong', 0, 1.5, 0.01, 'stand at (× drift past target)');
  R(vort, c, 'vortexDrift', 0, 4, 0.01, 'drift apart (m/s)');
  R(vort, c, 'vortexLean', -1, 1.5, 0.01, 'lean out (m per m)');
  R(vort, c, 'vortexLeanForward', -1, 2, 0.01, 'lean down the line');
  R(vort, c, 'vortexRiseTime', 0.02, 1.5, 0.01, 'rise over (s)');
  R(vort, c, 'vortexExit', 0.05, 3, 0.01, 'unravel over (s)');
  R(vort, c, 'vortexLiftOff', 0, 4, 0.01, 'lift off as it unravels (m)');
  R(vort, c, 'vortexSpin', -30, 30, 0.1, 'spin (rad/s)');
  R(vort, c, 'vortexTwist', -6, 6, 0.01, 'streamline twist (rad/m)');
  R(vort, c, 'vortexStreams', 1, 16, 1, 'streamlines');
  R(vort, c, 'vortexWobble', 0, 2, 0.01, 'snaking (m)');
  R(vort, c, 'vortexSwaySpeed', 0, 6, 0.01, 'snaking speed');
  R(vort, c, 'vortexGlow', 0, 8, 0.05, 'core glow');
  R(vort, c, 'vortexOpacity', 0, 1, 0.01, 'dust sheath opacity');
  R(vort, c, 'vortexSheathScale', 0.5, 3, 0.01, 'sheath width (× core)');
  R(vort, c, 'vortexDust', 0, 400, 1, 'dust drawn up/second');
  R(vort, c, 'vortexUpdraft', 0, 10, 0.05, 'updraft (m/s)');
  R(vort, c, 'vortexStreakRate', 0, 400, 1, 'wind lines/second');
  R(vort, c, 'vortexStreakSpeed', 0, 20, 0.05, 'wind line speed');
  R(vort, c, 'footRadius', 0, 4, 0.01, 'footprint radius (m)');
  R(vort, c, 'footArms', 1, 8, 1, 'footprint arms');
  R(vort, c, 'footSpin', 0, 2, 0.01, 'footprint turn (× spin)');
  vort.addColor(c, 'colorVortexCore').name('core');
  vort.addColor(c, 'colorVortexTint').name('tint');
  vort.addColor(c, 'colorVortexBody').name('body');
  vort.addColor(c, 'colorVortexDeep').name('deep');

  const slice = folder.addFolder('7 · The slice');
  R(slice, c, 'sliceReach', 0, 3, 0.01, 'reach past the tips (m)');
  R(slice, c, 'sliceImpulse', 0, 20, 0.1, 'halves thrown (m/s)');
  R(slice, c, 'sliceLift', 0, 12, 0.05, 'lift (m/s)');
  R(slice, c, 'sliceSpin', 0, 5, 0.01, 'tumble');
  R(slice, c, 'hitDust', 0, 120, 1, 'dust per cut');

  folder.close();
  return folder;
}
