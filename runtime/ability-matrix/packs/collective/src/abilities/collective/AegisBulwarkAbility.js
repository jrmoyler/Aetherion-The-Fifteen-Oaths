import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createAegisDomeMaterial, createAegisSigilMaterial, MAX_IMPACTS } from '../../materials/collective/AegisBulwarkMaterial.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing, randRange } from '../../utils/math.js';

export const ID = 'aegis';

/** Grid the dome is wrapped from: around × floor-to-crown. */
const DOME_AROUND = 96;
const DOME_UP = 32;
const TAU = Math.PI * 2;

const _emit = {};
const _centre = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * AEGIS — Aegis Bulwark.
 *
 * A zone cast that can be dropped at the caster's own feet (`minRange` 0). An
 * anchor of light races out to the point; the dome **slams** up out of the
 * floor, throwing everything inside it outward, stands for its `lifetime`
 * taking the odd stray hit, and comes apart cell by cell.
 *
 * Layers:
 *
 *   1. **DOME** — an ellipsoidal cap wrapped in the vertex stage from a plain
 *      grid (`AegisBulwarkMaterial`). Its fragment computes a hexagonal
 *      lattice on the dome's own uv, seams bright and faces dim, under a
 *      fresnel rim. As it forms, cells light from the floor upward in a
 *      jittered wave, each flaring as it is crossed; scan lines climb the
 *      wall; impact ripples run across it from where it is struck; and on the
 *      way out each cell burns bright and drops out on its own dice.
 *   2. **SIGIL** — a ground quad with its own shader: two bounding circles
 *      and ticks, a band of procedural runes built from SDF strokes picked by
 *      a hash per sector, and a counter-rotating hexagram — drawn in with a
 *      sweep round the circle.
 *   3. **MOTES** — soft additive energy rising inside the dome while it
 *      stands, trailing the anchor as it races out, and released as the cells
 *      dissolve.
 *   4. **SLAM** — an AIR shell, a SHOCKWAVE and a DUSTRING decal, a spray of
 *      motes, a light punch, a flash and a kick when it goes up, and every
 *      body inside thrown outward.
 *   5. **LIGHT** — a cool light standing in the dome, humming with the cells.
 *
 * ## Decisions
 *
 * `handlesOwnHits` is true. The default zone disc fells bodies along the cast
 * direction; a shield should throw them *away from its centre*, and it should
 * keep doing so to anything that walks in while it stands (`repel`), which a
 * one-shot disc cannot. Every body it throws also lands an impact ripple on
 * the dome at the bearing it left on, so the lattice answers the blow.
 *
 * As in the originals, the per-cast state is events and dice — when it
 * slammed, the seed, the impact bearings and their ages. Radius, height,
 * lattice density, colours, timings are all read from `settings.aegis` every
 * frame, so dragging `zoneRadius` resizes a dome that is already standing.
 */
export class AegisBulwarkAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the dome ---- */
    this.domeGeometry = new PlaneGeometry(1, 1, DOME_AROUND, DOME_UP);
    this.domeMaterial = createAegisDomeMaterial();
    this.dome = new Mesh(this.domeGeometry, this.domeMaterial);
    this.dome.name = 'AegisDome';
    this.dome.layers.set(LAYER.VFX);
    this.dome.frustumCulled = false; // shaped in the vertex stage
    this.dome.renderOrder = 12;
    this.dome.visible = false;
    this.group.add(this.dome);

    /* ---- layer 2: the sigil ---- */
    this.sigilGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.sigilMaterial = createAegisSigilMaterial();
    this.sigil = new Mesh(this.sigilGeometry, this.sigilMaterial);
    this.sigil.name = 'AegisSigil';
    this.sigil.layers.set(LAYER.VFX);
    this.sigil.renderOrder = 5;
    this.sigil.frustumCulled = false;
    this.sigil.visible = false;
    this.group.add(this.sigil);

    this._domeState = { radius: 1, height: 1, wobble: 0, slamAge: 0, form: 0, dissolve: 0, fade: 0, seed: 0 };
    this._sigilState = { radius: 1, quadSize: 1, spin: 0, innerSpin: 0, grow: 0, fade: 0, seed: 0 };

    /** Ripple slots: unit bearing on the dome + age, written straight into the uniform. */
    this._impacts = this.domeMaterial.uniforms.uImpacts.value;
    this._impactCursor = 0;

    /** Reused by `DummyField#findTargets`. */
    this._targets = [];

    // Per-cast state, reset in `onSpawn`.
    this._slamAge = -1;
    this._seed = 0;
    this._spin = 0;
    this._innerSpin = 0;
    this._sigilGrow = 0;
  }

  createParticles() {
    this.motes = this.ctx.particles.get('aegis.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.4
    });
    this.motes.uniforms.uDrag.value = 0.8;
    this.motes.uniforms.uEndSize.value = 0.4;
    this.motes.uniforms.uSizeIn.value = 0.08;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.4;

    this.moteEmitter = new RateEmitter();
    this.impactEmitter = new RateEmitter();
    this.dissolveEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return (this.dome.visible ? 1 : 0) + (this.sigil.visible ? 1 : 0);
  }

  /** The dome stands for its lifetime. */
  get impactDuration() {
    return Math.max(0.05, settings.aegis.lifetime * settings.global.lifetime);
  }

  /** ...and then comes apart cell by cell. */
  get fadeDuration() {
    return Math.max(0.05, settings.aegis.dissolveTime);
  }

  /** A hum, not a flicker: a field holding its shape. */
  lightShimmer() {
    const k = settings.aegis.lightHum;
    return 1 - k * 0.5 + k * 0.5 * Math.sin(this.age * 11.0) * Math.sin(this.age * 2.3 + 1.0);
  }

  /* ------------------------------------------------------------------ */
  /* Live geometry                                                       */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.2, settings.aegis.zoneRadius);
  }

  _centrePoint(out) {
    return this.pointAt(1, out).setY(0);
  }

  /** How far up the slam has carried the dome, with one overshoot. */
  _rise() {
    if (this._slamAge < 0) return 0;
    const c = settings.aegis;
    const riseTime = Math.max(0.02, c.riseTime);
    const peak = 1 + c.riseOvershoot;
    if (this._slamAge <= riseTime) return Easing.outQuint(this._slamAge / riseTime) * peak;
    const settle = saturate((this._slamAge - riseTime) / (riseTime * 1.2));
    return peak - c.riseOvershoot * Easing.inOutQuad(settle);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._slamAge = -1;
    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._innerSpin = 0;
    this._impactCursor = 0;
    for (let i = 0; i < MAX_IMPACTS; i++) this._impacts[i].set(0, 1, 0, -1);
    this.moteEmitter.reset();
    this.impactEmitter.reset();
    this.dissolveEmitter.reset();
    this._targets.length = 0;

    this.dome.visible = false;
    this.sigil.visible = false;
    // The sigil starts drawing itself the moment the cast leaves the hand, so
    // it is already turning by the time the dome slams over it.
    this._sigilGrow = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Repulsion                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Throw every live body inside the dome outward, and ripple the dome where
   * each one left.
   */
  _repel() {
    const c = settings.aegis;
    if (!settings.dummies.hit.enabled) return;

    this._centrePoint(_centre);
    const found = this.ctx.dummies?.findTargets?.(_centre.x, _centre.z, this.radius, this._targets);
    if (!found) return;

    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      let dx = dummy.position.x - _centre.x;
      let dz = dummy.position.z - _centre.z;
      const flat = Math.hypot(dx, dz);
      // A body standing dead centre has no outward; it takes the cast's own.
      if (flat < 1e-3) {
        dx = this.direction.x;
        dz = this.direction.z;
      } else {
        dx /= flat;
        dz /= flat;
      }
      if (dummy.kill(dx, dz, c.hit)) {
        // The lattice answers the blow at the bearing it left on, a little way up.
        this._addImpact(dx, 0.35, dz);
      }
    }
  }

  /** Start a ripple at a direction on the dome (local, need not be unit). */
  _addImpact(x, y, z) {
    const slot = this._impacts[this._impactCursor];
    this._impactCursor = (this._impactCursor + 1) % MAX_IMPACTS;
    _dir.set(x, Math.max(0.02, y), z).normalize();
    slot.set(_dir.x, _dir.y, _dir.z, 0);

    const c = settings.aegis;
    const g = settings.global;
    // A spit of motes off the surface where it lands.
    this._centrePoint(_pos);
    const h = this.radius * c.heightScale;
    _pos.x += _dir.x * this.radius;
    _pos.y += _dir.y * h;
    _pos.z += _dir.z * this.radius;
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.direction = _dir;
    _emit.speed = c.moteSpeed * 3;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLife * 0.4;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(Math.round(12 * g.particleCount), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncMotes() {
    const c = settings.aegis;
    const g = settings.global;
    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = (c.moteSize / 0.1) * g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = c.moteTurbulence * g.turbulence;
  }

  /**
   * Drive the dome and the sigil.
   * @param {number} dissolve 0..1 cell-by-cell dissolve
   * @param {number} fade     0..1 overall fade
   */
  _updateMeshes(dt, dissolve, fade) {
    const c = settings.aegis;
    const g = settings.global;
    const radius = this.radius;
    this._centrePoint(_centre);

    /* --- the sigil: draws itself in, turns, goes with the dome --- */
    this._sigilGrow = Math.min(1, this._sigilGrow + dt / 0.45);
    this._spin += c.sigilSpin * g.animationSpeed * dt;
    this._innerSpin += c.sigilInnerSpin * g.animationSpeed * dt;
    const ss = this._sigilState;
    ss.radius = radius;
    ss.quadSize = radius * c.sigilScale * 2 + c.sigilLine * 16 + 0.5;
    ss.spin = this._spin;
    ss.innerSpin = this._innerSpin;
    ss.grow = Easing.outCubic(this._sigilGrow);
    ss.fade = fade * (1 - dissolve * 0.6);
    ss.seed = this._seed;
    this.sigil.position.set(_centre.x, 0.025, _centre.z);
    this.sigil.scale.set(ss.quadSize, 1, ss.quadSize);
    this.sigilMaterial.userData.sync(ss);
    this.sigil.visible = ss.fade > 0.002;

    /* --- the dome --- */
    if (this._slamAge < 0) {
      this.dome.visible = false;
      return;
    }
    const rise = this._rise();
    const ds = this._domeState;
    ds.radius = radius;
    ds.height = Math.max(0.02, radius * c.heightScale * rise);
    ds.wobble = c.wobble * Math.exp(-this._slamAge * c.wobbleDecay);
    ds.slamAge = this._slamAge;
    ds.form = saturate(this._slamAge / Math.max(0.02, c.formTime)) * 1.15;
    ds.dissolve = dissolve;
    ds.fade = fade;
    ds.seed = this._seed;
    this.dome.position.copy(_centre);
    this.domeMaterial.userData.sync(ds);
    this.dome.visible = fade > 0.002;

    // Age the ripples.
    for (let i = 0; i < MAX_IMPACTS; i++) {
      const imp = this._impacts[i];
      if (imp.w >= 0) {
        imp.w += dt;
        if (imp.w > c.impactLife) imp.w = -1;
      }
    }
  }

  /** Motes rising inside, stray hits, and cells released on the way out. */
  _standingFx(dt, strength, dissolve) {
    const c = settings.aegis;
    const g = settings.global;
    const time = frame.uTime.value;
    const radius = this.radius;
    this._centrePoint(_centre);

    const count = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    for (let n = 0; n < count; n++) {
      const angle = Math.random() * TAU;
      const reach = Math.sqrt(Math.random()) * radius * 0.9;
      _pos.set(_centre.x + Math.cos(angle) * reach, 0.1, _centre.z + Math.sin(angle) * reach);
      _emit.position = _pos;
      _emit.radius = 0.05;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.25;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.6;
      _emit.life = c.moteLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.motes.emit(1, _emit);
    }

    // Stray hits while it stands, at random bearings.
    if (strength > 0.5 && dissolve <= 0) {
      const hits = this.impactEmitter.tick(dt, c.impactRate);
      for (let n = 0; n < hits; n++) {
        const angle = Math.random() * TAU;
        this._addImpact(Math.cos(angle), randRange(0.15, 0.85), Math.sin(angle));
      }
    }

    // Cells coming apart release their light.
    if (dissolve > 0 && dissolve < 1) {
      const released = Math.round(this.dissolveEmitter.tick(dt, c.dissolveMotes * 40) * g.particleCount);
      const h = radius * c.heightScale;
      for (let n = 0; n < released; n++) {
        const angle = Math.random() * TAU;
        const el = Math.random() * Math.PI * 0.5;
        _dir.set(Math.cos(el) * Math.cos(angle), Math.sin(el), Math.cos(el) * Math.sin(angle));
        _pos.set(_centre.x + _dir.x * radius, _dir.y * h, _centre.z + _dir.z * radius);
        _emit.position = _pos;
        _emit.radius = 0.05;
        _emit.direction = _dir;
        _emit.speed = c.moteSpeed * 1.4;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.5;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.12;
        _emit.sizeVariance = 0.5;
        _emit.life = c.moteLife * 0.8;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = time;
        this.motes.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.aegis;
    const g = settings.global;
    this._syncMotes();
    this._updateMeshes(dt, 0, 1);

    // The anchor of light racing out to the point, at shin height.
    this.position.y = 0.4;
    const count = Math.round(this.moteEmitter.tick(dt, c.travelMotes) * g.particleCount);
    if (count > 0) {
      _emit.position = this.position;
      _emit.radius = 0.15;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.8;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.12;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLife * 0.5;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(count, _emit);
    }
  }

  onImpact() {
    const c = settings.aegis;
    const g = settings.global;
    const radius = this.radius;
    this._slamAge = 0;
    this._centrePoint(_centre);
    this.position.copy(_centre).setY(c.lightHeight);

    /* --- the bodies inside go first --- */
    this._repel();

    /* --- the slam --- */
    _pos.copy(_centre).setY(radius * c.heightScale * 0.3);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: radius * 0.6,
      endRadius: radius * c.slamBurst * g.explosionIntensity,
      life: c.slamBurstLife,
      intensity: c.slamBurstIntensity,
      opacity: 0.5,
      fresnel: 2.4,
      displace: 0.25,
      squash: c.heightScale,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: radius * c.shockRadius * g.explosionIntensity,
      life: c.shockLife,
      width: 0.06,
      intensity: 1.0,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: radius * c.dustRadius * g.explosionIntensity,
      life: c.dustLife,
      intensity: 0.8,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustB)
    });

    // Light thrown off the rim as it goes up.
    const sparks = Math.round(c.slamSparks * g.particleCount);
    const spokes = 12;
    for (let k = 0; k < spokes; k++) {
      const angle = (k / spokes) * TAU;
      _dir.set(Math.cos(angle), 1.1, Math.sin(angle)).normalize();
      _pos.set(_centre.x + Math.cos(angle) * radius, 0.15, _centre.z + Math.sin(angle) * radius);
      _emit.position = _pos;
      _emit.radius = 0.2;
      _emit.direction = _dir;
      _emit.speed = c.moteSpeed * 4;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.4;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.12;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLife * 0.6;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(Math.max(1, Math.round(sparks / spokes)), _emit);
    }

    this.ctx.shake.add(c.slamShake * g.explosionIntensity * g.cameraShake, 2.6, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * g.explosionIntensity);
    this.lightBoost = c.slamLight * g.explosionIntensity;
  }

  onFade(dt, t) {
    const c = settings.aegis;
    this._syncMotes();
    this._slamAge += dt;
    this._centrePoint(this.position);
    this.position.y = c.lightHeight;

    let dissolve = 0;
    let fade = 1;
    if (this.phase === AbilityPhase.FADE) {
      const k = saturate(t - 1);
      dissolve = Easing.inOutQuad(k);
      fade = 1 - Easing.inQuad(saturate((k - 0.7) / 0.3));
    } else if (c.repel > 0.5) {
      // Anything that walks in while it stands is thrown back out.
      this._repel();
    }

    this._updateMeshes(dt, dissolve, fade);
    this._standingFx(dt, 1 - dissolve, dissolve);
  }

  onDestroy() {
    this.dome.visible = false;
    this.sigil.visible = false;
    this._slamAge = -1;
    for (let i = 0; i < MAX_IMPACTS; i++) this._impacts[i].w = -1;
    this._targets.length = 0;
  }

  dispose() {
    this.domeGeometry.dispose();
    this.domeMaterial.dispose();
    this.sigilGeometry.dispose();
    this.sigilMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('⬡  Aegis Bulwark');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 0, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 120, 0.5, 'anchor speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'dome radius (m)');
  R(cast, c, 'lifetime', 0.1, 20, 0.05, 'stands for');
  R(cast, c, 'dissolveTime', 0.05, 5, 0.05, 'dissolves over');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const repel = folder.addFolder('Repulsion');
  R(repel, c, 'repel', 0, 1, 1, 'keep throwing out intruders');
  R(repel, c.hit, 'impulse', 0, 20, 0.1, 'throw impulse');
  R(repel, c.hit, 'lift', 0, 20, 0.1, 'throw lift');
  R(repel, c.hit, 'spin', 0, 5, 0.05, 'throw spin');

  /* ---- layer 1 ---- */
  const dome = folder.addFolder('1 · Dome');
  const shape = dome.addFolder('Shape & slam');
  R(shape, c, 'heightScale', 0.2, 1.6, 0.01, 'height (× radius)');
  R(shape, c, 'riseTime', 0.02, 1.5, 0.01, 'slam time (s)');
  R(shape, c, 'riseOvershoot', 0, 0.6, 0.005, 'slam overshoot');
  R(shape, c, 'wobble', 0, 0.5, 0.005, 'pressure wobble (m)');
  R(shape, c, 'wobbleDecay', 0.2, 20, 0.1, 'wobble decay (/s)');
  R(shape, c, 'wobbleFreq', 0, 20, 0.1, 'wobble ripples');

  const lattice = dome.addFolder('Lattice');
  R(lattice, c, 'cellsAround', 3, 60, 1, 'cells around');
  R(lattice, c, 'cellRows', 1, 24, 0.1, 'rows to the crown');
  R(lattice, c, 'edgeWidth', 0.005, 0.3, 0.001, 'seam width');
  R(lattice, c, 'edgeBright', 0, 8, 0.05, 'seam brightness');
  R(lattice, c, 'cellFill', 0, 1, 0.005, 'cell fill');
  R(lattice, c, 'cellVariance', 0, 1, 0.01, 'cell dice');
  R(lattice, c, 'crown', 0.3, 1, 0.01, 'lattice melts above');
  R(lattice, c, 'pulseSpeed', 0, 6, 0.05, 'cell breathing rate');
  R(lattice, c, 'pulseDepth', 0, 1, 0.01, 'cell breathing depth');

  const form = dome.addFolder('Forming');
  R(form, c, 'formTime', 0.05, 3, 0.01, 'wave reaches the crown in (s)');
  R(form, c, 'formJitter', 0, 1, 0.01, 'per-cell lag');
  R(form, c, 'formFlash', 0, 10, 0.05, 'flare as a cell lights');
  form.addColor(c, 'colorForm').name('flare colour');

  const surface = dome.addFolder('Surface');
  R(surface, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(surface, c, 'fresnelBright', 0, 5, 0.01, 'fresnel brightness');
  R(surface, c, 'backFace', 0, 1, 0.01, 'far wall');
  R(surface, c, 'scanCount', 0, 8, 1, 'scan lines');
  R(surface, c, 'scanSpeed', -3, 3, 0.01, 'scan speed');
  R(surface, c, 'scanWidth', 0.002, 0.2, 0.001, 'scan width');
  R(surface, c, 'scanBright', 0, 6, 0.05, 'scan brightness');
  R(surface, c, 'intensity', 0, 8, 0.05, 'intensity');
  R(surface, c, 'opacity', 0, 1, 0.01, 'opacity');
  R(surface, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  surface.addColor(c, 'colorEdge').name('seams');
  surface.addColor(c, 'colorCell').name('cells');
  surface.addColor(c, 'colorRim').name('rim');
  surface.addColor(c, 'colorScan').name('scan lines');

  const impacts = dome.addFolder('Impacts');
  R(impacts, c, 'impactRate', 0, 8, 0.05, 'stray hits per second');
  R(impacts, c, 'impactSpeed', 0.1, 8, 0.05, 'ripple speed (rad/s)');
  R(impacts, c, 'impactWidth', 0.01, 0.6, 0.005, 'ripple width (rad)');
  R(impacts, c, 'impactLife', 0.1, 3, 0.05, 'ripple lifetime');
  R(impacts, c, 'impactBright', 0, 10, 0.05, 'ripple brightness');
  R(impacts, c, 'impactRings', 1, 4, 1, 'rings per ripple');
  impacts.addColor(c, 'colorImpact').name('ripple colour');

  const diss = dome.addFolder('Dissolve');
  R(diss, c, 'dissolveEdge', 0, 0.5, 0.005, 'burning edge');
  R(diss, c, 'dissolveGlow', 0, 12, 0.05, 'burn brightness');

  /* ---- layer 2 ---- */
  const sigil = folder.addFolder('2 · Sigil');
  R(sigil, c, 'sigilScale', 0.5, 2, 0.01, 'outer radius (× dome)');
  R(sigil, c, 'sigilBand', 0.05, 0.6, 0.005, 'rune band (× dome)');
  R(sigil, c, 'sigilRunes', 3, 40, 1, 'runes');
  R(sigil, c, 'sigilRuneSize', 0.2, 1.2, 0.01, 'rune size');
  R(sigil, c, 'sigilLine', 0.005, 0.15, 0.001, 'stroke (m)');
  R(sigil, c, 'sigilSpin', -2, 2, 0.01, 'band spin (rad/s)');
  R(sigil, c, 'sigilInnerSpin', -2, 2, 0.01, 'star spin (rad/s)');
  R(sigil, c, 'sigilStar', 0, 1, 1, 'hexagram');
  R(sigil, c, 'sigilGlow', 0, 8, 0.05, 'glow');
  R(sigil, c, 'sigilOpacity', 0, 1, 0.01, 'opacity');
  R(sigil, c, 'sigilFlicker', 0, 1, 0.01, 'rune flicker');
  sigil.addColor(c, 'colorSigil').name('lines');
  sigil.addColor(c, 'colorSigilHot').name('runes');

  /* ---- layer 3 ---- */
  const motes = folder.addFolder('3 · Motes');
  R(motes, c, 'moteRate', 0, 400, 1, 'rising (/s)');
  R(motes, c, 'travelMotes', 0, 500, 1, 'off the anchor (/s)');
  R(motes, c, 'dissolveMotes', 0, 20, 0.1, 'released on dissolve');
  R(motes, c, 'moteSize', 0.01, 0.6, 0.005, 'size');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'lifetime');
  R(motes, c, 'moteSpeed', 0, 6, 0.05, 'speed');
  R(motes, c, 'moteRise', -2, 6, 0.05, 'rise');
  R(motes, c, 'moteGlow', 0, 8, 0.05, 'glow');
  R(motes, c, 'moteTurbulence', 0, 4, 0.05, 'turbulence');
  Editor.gradient(motes, c, 'colorMote', 'Colour over life');

  /* ---- layer 4 ---- */
  const slam = folder.addFolder('4 · Slam');
  R(slam, c, 'slamBurst', 0.2, 3, 0.01, 'air shell (× radius)');
  R(slam, c, 'slamBurstLife', 0.05, 2, 0.01, 'shell lifetime');
  R(slam, c, 'slamBurstIntensity', 0, 5, 0.05, 'shell intensity');
  slam.addColor(c, 'colorBurstA').name('shell core');
  slam.addColor(c, 'colorBurstB').name('shell body');
  slam.addColor(c, 'colorBurstC').name('shell edge');
  R(slam, c, 'shockRadius', 0.2, 4, 0.01, 'shockwave (× radius)');
  R(slam, c, 'shockLife', 0.1, 3, 0.05, 'shockwave lifetime');
  slam.addColor(c, 'colorShockA').name('shockwave inner');
  slam.addColor(c, 'colorShockB').name('shockwave outer');
  R(slam, c, 'dustRadius', 0.2, 4, 0.01, 'dust ring (× radius)');
  R(slam, c, 'dustLife', 0.1, 4, 0.05, 'dust lifetime');
  slam.addColor(c, 'colorDustA').name('dust inner');
  slam.addColor(c, 'colorDustB').name('dust outer');
  R(slam, c, 'slamSparks', 0, 400, 1, 'light off the rim');
  R(slam, c, 'slamShake', 0, 1.5, 0.01, 'shake');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'flash');
  slam.addColor(c, 'colorFlash').name('flash colour');

  /* ---- layer 5 ---- */
  const light = folder.addFolder('5 · Light');
  light.addColor(c, 'lightColor').name('light colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(light, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(light, c, 'lightHeight', 0, 5, 0.05, 'light height (m)');
  R(light, c, 'slamLight', 0, 60, 0.5, 'light punch on the slam');
  R(light, c, 'lightHum', 0, 1, 0.01, 'hum');
}
