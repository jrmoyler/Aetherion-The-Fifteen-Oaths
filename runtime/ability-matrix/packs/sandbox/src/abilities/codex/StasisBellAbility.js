import { CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createBellGeometry,
  createClapperGeometry,
  createGearGeometry,
  createTineGeometry,
  createStringGeometry,
  createBandGeometry,
  createQuadGeometry
} from '../../assets/codex/StasisBellGeometry.js';
import {
  MAX_TINES,
  STRING_ROWS,
  createBellMaterial,
  createTineMaterial,
  createStringMaterial,
  createFrontMaterial,
  createFloorMaterial,
  createCurtainMaterial,
  createAirMaterial
} from '../../materials/codex/StasisBellMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'stasisbell';

const TAU = Math.PI * 2;
/** Sound fronts in flight at once (one per toll; they overlap). */
const MAX_FRONTS = 4;
/** Bodies the circle can hold. */
const MAX_HELD = 12;
/** Teeth on the escapement wheel (the geometry is built once). */
const GEAR_TEETH = 30;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
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
 * STASIS BELL — Time, zone cast.
 *
 * A brass resonance band runs round the circle on the floor as the cast
 * arrives. Over its centre a great bronze-and-brass bell **turns itself into
 * being** — swept round its axis like work on a lathe, the cut edge glowing —
 * with an escapement wheel round its shoulder, while a fence of **tuning
 * tines** rises out of the floor all round the rim in a staggered wave. The
 * bell swings and **tolls**. Each toll flexes its lip (the struck bell's oval
 * mode, visibly), blazes its inscription, and sends a rippling **sound front**
 * down a cone to the rim; where it lands the tines flare and quiver, and
 * **strings of standing waves** are strung between them, three rows high,
 * nodes fixed, swinging. Inside, the floor rings with standing-wave rings,
 * the dust in the air stops dead where it hangs, and **every body in the
 * circle is held** — its breathing stopped, stained brass. The escapement
 * wheel ticks the hold out. The last toll is the hardest: the strings
 * **snap** at their middles and whip back, the tines sink, a pressure shell
 * slams down and out, and the held bodies are thrown as time comes back all
 * at once. The bell is unmade the way it was made.
 *
 * Upgrade: the crown height is derived from the fence (`crownHeight`: lip
 * clears the tines by `hangClear`), so the bell hangs in shot; it is turned
 * and lowered (`dropHeight`) while a brass note skates out leaving rings of
 * sound; a wall of stopped sound (`createCurtainMaterial`) and an amber floor
 * wash fill the held circle.
 *
 * Kept apart from the other time spells: not a clock face, not a glass
 * sphere, not an hourglass descending. And from the air pack's Vortex Bell: this
 * one is cast metal and clockwork, and the thing it does to the circle is
 * *hold it still* with sound, not stir it.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the bell** — a lathe in brass (`createBellMaterial`): inscription
 *      bands, verdigris, sky reflection, the lathe-turn materialise; a
 *      clapper; a ticking escapement wheel.
 *   2. **the tines** — instanced tuning forks built in their vertex stage.
 *   3. **the strings** — standing-wave ribbons between neighbouring tines.
 *   4. **the fronts** — a rippled band per toll from the bell's mouth down to
 *      the tines.
 *   5. **the floor** — the resonance band and the standing-wave rings.
 *   6. **motes, sparks, dust** — gold motes that stop dead in the air on each
 *      toll (SOFT, enormous drag), sparks off the tines (STREAK), dust off the
 *      release (SMOKE).
 *   7. **the air** — `LAYER.DISTORTION`: a ring per toll and the held shimmer.
 *   8. **the beat** — per toll a SHOCKWAVE at the rim, a knock and a light
 *      punch; on the release an AIR shell, a SHOCKWAVE, a DUSTRING, a flash.
 *   9. **the hold** — `handlesOwnHits`: bodies in the circle are stopped
 *      (their animation wound back against the field's own step), stained,
 *      and thrown outward on the release.
 *
 * ## The editor rule
 *
 * A cast keeps dice (a seed, the mode's axis per toll) and a handful of
 * integrated phases. The bell, tines, strings and floor read every size,
 * count, time and colour from `settings.stasisbell` every frame.
 */
export class StasisBellAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies held. HUD readout only. */
  get instanceCount() {
    return this._heldCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 1: the bell, hung from a rig that swings about the crown ---- */
    this.bellGeometry = createBellGeometry(72);
    this.clapperGeometry = createClapperGeometry(16);
    this.gearGeometry = createGearGeometry(GEAR_TEETH, 0.06);
    this.bellMaterial = createBellMaterial(1);
    this.clapperMaterial = createBellMaterial(0);
    this.gearMaterial = createBellMaterial(0);

    this.rig = new Group();
    this.rig.visible = false;
    this.group.add(this.rig);
    this.bell = new Mesh(this.bellGeometry, this.bellMaterial);
    this.clapper = new Mesh(this.clapperGeometry, this.clapperMaterial);
    this.gear = new Mesh(this.gearGeometry, this.gearMaterial);
    for (const m of [this.bell, this.clapper, this.gear]) {
      m.layers.set(LAYER.VFX);
      m.renderOrder = 6;
      m.frustumCulled = false;
      this.rig.add(m);
    }

    /* ---- 2, 3: the tines and the strings between them ---- */
    this.tineGeometry = createTineGeometry(MAX_TINES);
    this.tineMaterial = createTineMaterial();
    this.tines = this._mesh(this.tineGeometry, this.tineMaterial, LAYER.VFX, 6);
    this.stringGeometry = createStringGeometry(MAX_TINES, STRING_ROWS);
    this.stringMaterial = createStringMaterial();
    this.strings = this._mesh(this.stringGeometry, this.stringMaterial, LAYER.VFX, 12);

    /* ---- 4: the sound fronts ---- */
    this.bandGeometry = createBandGeometry(96, 4);
    this.fronts = [];
    for (let i = 0; i < MAX_FRONTS; i++) {
      const material = createFrontMaterial();
      this.fronts.push({
        material,
        mesh: this._mesh(this.bandGeometry, material, LAYER.VFX, 13),
        t: -1,
        scale: 1,
        arrived: false,
        final: false,
        state: { mouth: new Vector3(), mouthR: 1, center: new Vector3(), progress: 0, scale: 1, seed: 0 }
      });
    }

    /* ---- 5, 7: the floor and the air ---- */
    this.quadGeometry = createQuadGeometry();
    this.floorMaterial = createFloorMaterial();
    this.floor = this._mesh(this.quadGeometry, this.floorMaterial, LAYER.VFX, 2);
    this.airMaterial = createAirMaterial();
    this.air = this._mesh(this.quadGeometry, this.airMaterial, LAYER.DISTORTION, 0);

    /* ---- 5b: the held field, a wall of stopped sound on the rim ---- */
    this.curtainGeometry = new CylinderGeometry(1, 1, 1, 96, 1, true);
    this.curtainGeometry.translate(0, 0.5, 0);
    this.curtainMaterial = createCurtainMaterial();
    this.curtain = new Mesh(this.curtainGeometry, this.curtainMaterial);
    this.curtain.layers.set(LAYER.VFX);
    this.curtain.renderOrder = 11;
    this.curtain.frustumCulled = false;
    this.curtain.visible = false;
    this.group.add(this.curtain);

    this._bellState = { form: 0, ring: 0, ringPhase: 0, ringAxis: 0, seed: 0 };
    this._partState = { form: 0, ring: 0, ringPhase: 0, ringAxis: 0, seed: 0 };
    this._rim = { center: new Vector3(), spin: 0, riseClock: -10, sink: 0, quiver: 0, quiverPhase: 0, hot: 0, seed: 0 };
    this._stringState = { center: null, spin: 0, riseClock: -10, sink: 0, phase: 0, strung: 0, amp: 0, pulse: 0, snap: 0 };
    this._floorState = { center: new Vector3(), draw: 0, hold: 0, toll: 0, fade: 1, seed: 0 };
    this._airState = { center: new Vector3(), size: 6, ring: 0, hold: 0 };
    this._curtainState = { hold: 0, toll: 0, snap: 0, spin: 0, seed: 0 };
    this._curtainK = 0;
    this._formAtImpact = 0;
    this._travelForm = 0;
    this._travelled = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };

    this._held = [];
    for (let i = 0; i < MAX_HELD; i++) this._held.push(null);
    this._heldCount = 0;

    this._mouth = new Vector3();
    this._seed = 0;
    this._tau = -1;
    this._tolled = 0;
    this._released = false;
    this._swing = 0;
    this._ring = 0;
    this._ringPhase = 0;
    this._ringAxis = 0;
    this._hot = 0;
    this._quiver = 0;
    this._quiverPhase = 0;
    this._strung = 0;
    this._stringAmp = 0;
    this._stringPhase = 0;
    this._pulse = 0;
    this._hold = 0;
    this._toll = 0;
    this._snap = 0;
    this._sink = 0;
    this._form = 0;
    this._gearTick = 0;
    this._airT = -1;
    this._fadeK = 0;
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

    this.motes = particles.get('stasisbell.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.35;
    this.motes.uniforms.uEndSize.value = 0.8;
    // Enormous drag: whatever is thrown into the held air stops dead.
    this.motes.uniforms.uDrag.value = 7;

    this.sparks = particles.get('stasisbell.sparks', {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.2;

    this.dust = particles.get('stasisbell.dust', {
      capacity: 500,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1
    });
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.55;
    this.dust.uniforms.uEndSize.value = 2.6;
    this.dust.uniforms.uDrag.value = 1.4;

    this.travelEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Seconds after the cast lands of the first toll, and of the release. */
  _firstToll() {
    return settings[ID].formTime * settings.global.lifetime + 0.12;
  }

  _interval() {
    return Math.max(0.1, settings[ID].tollInterval * settings.global.lifetime);
  }

  _releaseAt() {
    return this._firstToll() + Math.max(1, Math.round(settings[ID].tolls)) * this._interval();
  }

  /** The impact phase is the forming, the tolls and the release. */
  get impactDuration() {
    return Math.max(0.1, this._releaseAt() + 0.55);
  }

  /** The fade is the bell being unmade. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 5.1));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.travelEmitter.reset();
    this._seed = Math.random() * 100;
    this._tau = -1;
    this._tolled = 0;
    this._released = false;
    this._swing = 0;
    this._ring = 0;
    this._ringPhase = 0;
    this._ringAxis = Math.random() * TAU;
    this._hot = 0;
    this._quiver = 0;
    this._quiverPhase = 0;
    this._strung = 0;
    this._stringAmp = 0;
    this._stringPhase = 0;
    this._pulse = 0;
    this._hold = 0;
    this._toll = 0;
    this._snap = 0;
    this._sink = 0;
    this._form = 0;
    this._gearTick = 0;
    this._airT = -1;
    this._fadeK = 0;
    this._curtainK = 0;
    this._formAtImpact = 0;
    this._travelForm = 0;
    this._travelled = 0;
    this.curtain.visible = false;
    this._releaseHeld(false);
    for (const f of this.fronts) {
      f.t = -1;
      f.mesh.visible = false;
    }

    this.pointAt(1, _centre);
    this._rim.center.copy(_centre);
    this._rim.seed = this._seed;
    this._rim.riseClock = -10;
    this._rim.sink = 0;
    // A gap between tines faces the caster, so the strings are seen across it.
    this._rim.spin = Math.atan2(-this.direction.z, -this.direction.x) + Math.PI / Math.max(3, Math.round(settings[ID].tines));
    this._stringState.center = this._rim.center;
    this._floorState.center.copy(_centre);
    this._floorState.seed = this._seed;
    this._bellState.seed = this._seed;
    this._partState.seed = this._seed + 3;

    this.floor.visible = true;
    this.rig.visible = false;
    this.tines.visible = false;
    this.strings.visible = false;
    this.air.visible = false;
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

  /* ------------------------------------------------------------------ */
  /* Travel — the resonance band runs round as the cast arrives          */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._floorState.draw = Easing.outQuad(this.u);
    // While the note runs out, the bell is already being turned over the
    // circle and lowered onto its hang: the drop is seen before it lands.
    this._travelForm = saturate(this.u) * saturate(c.travelForm);
    // A struck note skating along the floor: a hot brass bead with a comet of
    // sparks behind it, and a ring of sound left on the floor every few metres.
    const n = Math.round(this.travelEmitter.tick(dt, c.travelRate) * g.particleCount);
    if (n > 0) {
      this._resetEmit();
      _pos.copy(this.position).setY(0.3);
      _emit.position = _pos;
      _emit.radius = 0.08;
      _emit.direction = _up;
      _emit.speed = 0.4;
      _emit.spread = 1;
      _emit.size = c.travelSize;
      _emit.life = 0.35;
      this.motes.emit(n, _emit);
      _dir.copy(this.direction).multiplyScalar(-1).setY(0.35).normalize();
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * 0.8;
      _emit.spread = 0.5;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.max(1, Math.round(n * 0.6)), _emit);
    }
    const spacing = Math.max(0.3, c.travelRingSpacing);
    while (this.front - this._travelled >= spacing) {
      this._travelled += spacing;
      this.pointAt(saturate(this._travelled / Math.max(0.01, this.length)), _pos);
      _pos.setY(0);
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
        radius: c.travelRingRadius,
        life: 0.55 * g.lifetime,
        width: 0.06,
        intensity: 0.9,
        colorA: getColor(c.colorShock),
        colorB: getColor(c.colorBand)
      });
    }
    this._sync(dt);
  }

  onImpact() {
    this._tau = 0;
    this._formAtImpact = this._travelForm;
    this._floorState.draw = 1;
    this._rim.riseClock = 0;
    this.rig.visible = true;
    this.tines.visible = true;
    this.strings.visible = true;
  }

  onFade(dt, t) {
    this._tau += dt;
    this._fadeK = t > 1 ? saturate(t - 1) : 0;
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const tau = this._tau;
    const active = tau >= 0;
    const I = this._interval();
    const first = this._firstToll();
    const release = this._releaseAt();
    const tolls = Math.max(1, Math.round(c.tolls));

    /* ---- tolls: each one at the top of a swing ---- */
    if (active) {
      while (this._tolled <= tolls && tau >= first + this._tolled * I) {
        this._strike(this._tolled === tolls);
        this._tolled++;
      }
    }

    /* ---- the swing: pulled back while it forms, then struck at each extreme ---- */
    if (active) {
      const A = c.swing;
      if (tau < first) {
        this._swing = -A * Easing.inOutQuad(saturate(tau / first));
      } else if (tau < release) {
        const amp = lerp(A, c.finalSwing, smoothstep(release - I, release, tau));
        this._swing = -amp * Math.cos((Math.PI * (tau - first)) / I);
      } else {
        // After the release it rocks to rest.
        const k = tau - release;
        this._swing = -c.finalSwing * Math.cos((Math.PI * k) / I + Math.PI * tolls) * Math.exp(-k * 2.6);
      }
    }

    /* ---- the decays ---- */
    const decay = Math.exp(-dt / Math.max(0.03, c.ringDecay * L));
    this._ring *= decay;
    this._toll *= Math.exp(-dt * 3);
    this._hot *= Math.exp(-dt * 4);
    this._quiver *= Math.exp(-dt * 3.5);
    this._pulse *= Math.exp(-dt * 5);
    this._ringPhase += c.ringFreq * dt * g.animationSpeed;
    this._quiverPhase += 40 * dt * g.animationSpeed;
    this._stringPhase += c.stringFreq * dt * g.animationSpeed * (this._released ? 1.6 : 1);

    /* ---- the fronts ---- */
    for (const f of this.fronts) this._updateFront(f, dt);

    /* ---- the bell: formed, then unmade ---- */
    const f0 = this._formAtImpact;
    const formK = active ? f0 + (1 - f0) * saturate(tau / Math.max(0.02, c.formTime * L)) : this._travelForm;
    this._formK = formK;
    this._form = Easing.inOutQuad(formK) * (1 - Easing.inQuad(this._fadeK));
    this._gearTick += dt * c.gearTickRate * g.animationSpeed * (this._released ? 0 : 1);

    /* ---- the hold and the release ---- */
    if (this._released) {
      const k = tau - release;
      this._snap = saturate(k / Math.max(0.02, c.stringSnap * L));
      this._sink = smoothstep(0.15, 0.75, k / Math.max(0.1, L));
      this._hold = Math.max(0, this._hold - dt * 4);
    }

    const target = this._released ? 0 : this._hold;
    this._curtainK += (target - this._curtainK) * Math.min(1, dt * (this._released ? 3 : 7));

    this._syncRig();
    this._syncMaterials();
    if (dt > 0) this._holdBodies(dt);
    this._syncParticles();
    this.position.copy(this._mouth);
  }

  /**
   * Where the crown hangs. Derived from the fence the cast stands round its
   * zone: the lip clears the tops of the tines by `hangClear`, so the whole
   * bell sits just above the circle and in shot at play distance however the
   * tines or the bell are resized. `hangFromZone` 0 falls back to the fixed
   * `hangHeight`.
   */
  crownHeight() {
    const c = settings[ID];
    const derived = Math.max(1.9, c.tineHeight) + c.hangClear + Math.max(0.2, c.bellHeight);
    return lerp(c.hangHeight, derived, saturate(c.hangFromZone));
  }

  /** The drop: lowered onto its hang as it is turned, settling with a dip. */
  _dropOffset() {
    const k = saturate(this._formK ?? 0);
    return settings[ID].dropHeight * (1 - Easing.outBack(k));
  }

  /** Place the rig: crown pivot over the centre, swung about the line's side axis. */
  _syncRig() {
    const c = settings[ID];
    const H = Math.max(0.2, c.bellHeight);
    const R = Math.max(0.1, c.bellRadius);
    this.rig.position.copy(this._rim.center).setY(this.crownHeight() + this._dropOffset());
    this.rig.quaternion.setFromAxisAngle(this.side, this._swing);
    this.bell.scale.set(R, H, R);
    // The clapper lags the bell: it hangs nearer the vertical, so at the
    // top of every swing the bell's wall comes round to meet it.
    const k = Math.max(0.05, c.clapperSize) / 0.24;
    this.clapper.position.set(0, -0.08 * H, 0);
    this.clapper.scale.set(k, H * 0.86, k);
    this.clapper.quaternion.setFromAxisAngle(this.side, -this._swing * 0.62);
    // The escapement wheel round the shoulder, stepping a tooth a tick.
    const step = Math.floor(this._gearTick);
    const f = this._gearTick - step;
    const tooth = (step + Easing.outBack(saturate(f / 0.25))) * (TAU / GEAR_TEETH);
    const gr = R * 0.66 * c.gearSize;
    this.gear.position.set(0, -0.16 * H, 0);
    this.gear.scale.set(gr, 1, gr);
    this.gear.rotation.set(0, tooth, 0);
    this.rig.updateMatrixWorld(true);
    // The mouth, world, for the light, the fronts and the air.
    this._mouth.set(0, -0.92 * H, 0);
    this.rig.localToWorld(this._mouth);
  }

  _syncMaterials() {
    const c = settings[ID];
    const L = settings.global.lifetime;

    const bs = this._bellState;
    bs.form = this._form;
    bs.ring = this._ring;
    bs.ringPhase = this._ringPhase;
    bs.ringAxis = this._ringAxis;
    this.bellMaterial.userData.sync(bs);
    const ps = this._partState;
    ps.form = this._form;
    ps.ring = this._ring * 0.6;
    ps.ringPhase = this._ringPhase;
    ps.ringAxis = this._ringAxis;
    this.clapperMaterial.userData.sync(ps);
    this.gearMaterial.userData.sync(ps);
    this.rig.visible = this._form > 0.001;

    const rim = this._rim;
    if (this._tau >= 0) rim.riseClock = this._tau;
    rim.sink = this._sink;
    rim.quiver = this._quiver;
    rim.quiverPhase = this._quiverPhase;
    rim.hot = this._hot;
    this.tineMaterial.userData.sync(rim);
    this.tines.visible = this._tau >= 0 && this._sink < 0.999;

    const ss = this._stringState;
    ss.spin = rim.spin;
    ss.riseClock = rim.riseClock;
    ss.sink = rim.sink;
    ss.phase = this._stringPhase;
    ss.strung = this._strung;
    ss.amp = this._stringAmp * (0.7 + 0.3 * this._hold);
    ss.pulse = this._pulse;
    ss.snap = this._snap;
    this.stringMaterial.userData.sync(ss);
    this.strings.visible = this._strung > 0.001 && this._snap < 0.999;

    const fl = this._floorState;
    fl.hold = this._hold;
    fl.toll = this._toll;
    fl.fade = 1 - smoothstep(0.3, 1, this._fadeK);
    this.floorMaterial.userData.sync(fl);

    const air = this._airState;
    air.center.copy(this._rim.center).setY(c.tineHeight * 0.5);
    air.size = c.zoneRadius * 1.25;
    if (this._airT >= 0) {
      air.ring = saturate(this._airT / Math.max(0.05, c.frontTime * L * 1.2));
      if (air.ring >= 1) this._airT = -1;
    } else {
      air.ring = 0;
    }
    air.hold = this._hold;
    this.airMaterial.userData.sync(air);
    this.air.visible = air.ring > 0 || air.hold > 0.01;

    const cs = this._curtainState;
    cs.hold = this._curtainK;
    cs.toll = this._toll;
    cs.snap = this._snap;
    cs.spin = this._rim.spin;
    cs.seed = this._seed;
    this.curtainMaterial.userData.sync(cs);
    const R = Math.max(0.3, c.zoneRadius);
    this.curtain.position.copy(this._rim.center).setY(0);
    this.curtain.scale.set(R, Math.max(0.1, c.tineHeight * c.curtainHeight * (1 - this._sink)), R);
    this.curtain.visible = this._curtainK > 0.005 && this._snap < 0.999;
  }

  _syncParticles() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.motes, c, 'colorMote', c.moteGlow, 0.05);
    // Held air has no weather: no drift, no fall — until the release.
    this.motes.uniforms.uGravity.value.set(0, this._released ? -1.5 : 0, 0);
    syncSystem(this.sparks, c, 'colorSpark', c.sparkGlow, 0.2);
    this.sparks.uniforms.uGravity.value.set(0, -9, 0);
    this.sparks.uniforms.uStretch.value = 0.4;
    syncSystem(this.dust, c, 'colorDust', 1, 0.6);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.25, 0);
    this.dust.uniforms.uSwirl.value = 0.8;
  }

  /* ------------------------------------------------------------------ */
  /* The tolls                                                           */
  /* ------------------------------------------------------------------ */

  /** The clapper meets the wall. */
  _strike(final) {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._ring = final ? 1.6 : 1;
    this._ringAxis = Math.random() * TAU;
    this._toll = 1;
    this._pulse = 1;
    this._airT = 0;

    // A front down to the rim.
    let slot = this.fronts[0];
    for (const f of this.fronts) {
      if (f.t < 0) {
        slot = f;
        break;
      }
      if (f.t > slot.t) slot = f;
    }
    slot.t = 0;
    slot.arrived = false;
    slot.final = final;
    slot.scale = final ? 1.5 : 1;
    slot.state.seed = this._seed + this._tolled * 3.1;

    this.ctx.shake.add(c.tollShake * (final ? 2 : 1) * g.cameraShake, 6, 14);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.tollLight * (final ? 1.5 : 1));

    // Motes hung in the air of the circle: thrown gently, they stop dead.
    if (!final) {
      this._resetEmit();
      const R = Math.max(0.3, c.zoneRadius) * 0.92;
      _emit.speed = 0.6;
      _emit.spread = 1;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife * g.lifetime;
      _emit.lifeVariance = 0.25;
      const n = Math.round(c.moteCount * g.particleCount);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = R * Math.sqrt(Math.random());
        _pos.set(this._rim.center.x + Math.cos(a) * r, 0.2 + Math.random() * c.tineHeight * 1.2, this._rim.center.z + Math.sin(a) * r);
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    } else {
      this._release(power);
    }
  }

  _updateFront(f, dt) {
    const c = settings[ID];
    if (f.t < 0) {
      f.mesh.visible = false;
      return;
    }
    f.t += dt;
    const T = Math.max(0.05, c.frontTime * settings.global.lifetime);
    const p = f.t / T;
    if (!f.arrived && p >= 1) {
      f.arrived = true;
      this._frontArrives(f.final);
    }
    // The band carries on fading for a moment past the rim.
    if (p >= 1.25) {
      f.t = -1;
      f.mesh.visible = false;
      return;
    }
    const st = f.state;
    st.mouth.copy(this._mouth);
    st.mouthR = Math.max(0.1, c.bellRadius) * 0.95;
    st.center.copy(this._rim.center);
    st.progress = Easing.outQuad(Math.min(1, p)) + Math.max(0, p - 1) * 0.3;
    st.scale = f.scale;
    f.material.userData.sync(st);
    f.mesh.visible = true;
  }

  /** The sound reaches the rim: the tines ring, the strings are strung. */
  _frontArrives(final) {
    const c = settings[ID];
    const g = settings.global;
    this._hot = 1;
    this._quiver = c.tineQuiver * (final ? 2 : 1);
    this._pulse = 1;
    if (!final) {
      this._strung = 1;
      this._stringAmp = 1;
      this._hold = 1;
      this._capture();
    }
    _pos.copy(this._rim.center).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.zoneRadius * 1.15,
      life: 0.45,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });
    // Sparks off every tine top.
    const count = Math.max(3, Math.min(MAX_TINES, Math.round(c.tines)));
    const n = Math.round(c.sparkCount * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _emit.radius = 0.08;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.spread = 0.9;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    const R = Math.max(0.3, c.zoneRadius);
    for (let i = 0; i < count; i++) {
      const a = this._rim.spin + (TAU * i) / count;
      _pos.set(this._rim.center.x + Math.cos(a) * R, c.tineHeight, this._rim.center.z + Math.sin(a) * R);
      _emit.position = _pos;
      this.sparks.emit(n, _emit);
    }
  }

  /** The last toll: the strings snap, the tines sink, time comes back. */
  _release(power) {
    const c = settings[ID];
    const g = settings.global;
    this._released = true;
    _pos.copy(this._rim.center).setY(1.2);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.65,
      fresnel: 2,
      displace: 0.3,
      turbulence: 1,
      squash: 0.4,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * power,
      life: 0.7,
      width: 0.08,
      intensity: 1.3,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.zoneRadius * 1.3,
      life: 1.2,
      intensity: 0.8,
      colorA: getColor(c.colorDustB),
      colorB: getColor(c.colorDustA)
    });

    this._resetEmit();
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = c.zoneRadius * 0.8;
    _emit.direction = _up;
    _emit.speed = 2.5;
    _emit.spread = 1.4;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 0.6;
    this.dust.emit(Math.round(c.dustCount * g.particleCount), _emit);

    this._releaseHeld(true);
    this.ctx.shake.add(c.releaseShake * power * g.cameraShake, 4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.releaseFlash * power);
    this.lightBoost = c.lightIntensity * c.releaseLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* The hold                                                            */
  /* ------------------------------------------------------------------ */

  /** Take hold of every standing body in the circle not already held. */
  _capture() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const found = field.findTargets(this._rim.center.x, this._rim.center.z, Math.max(0.3, c.zoneRadius), _targets);
    for (let i = 0; i < found.length && this._heldCount < MAX_HELD; i++) {
      const d = found[i];
      let known = false;
      for (let j = 0; j < this._heldCount; j++) if (this._held[j] === d) known = true;
      if (!known) this._held[this._heldCount++] = d;
    }
    _targets.length = 0;
  }

  /** Wind each held body's own animation back against the field's step: it stops. */
  _holdBodies(dt) {
    if (this._hold <= 0 || this._released) return;
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorHeldBody;
    look.rimColor = c.colorHeldRim;
    look.rimEmissive = 2.2 * this._hold;
    look.edgeColor = c.colorHeldRim;
    look.edgeEmissive = 2.5;
    look.edgeWidth = 0.05;
    for (let i = 0; i < this._heldCount; i++) {
      const d = this._held[i];
      if (!d || !d.alive) continue;
      if (d.mixer) d.mixer.update(-dt * g.animationSpeed * saturate(c.holdStrength) * this._hold);
      d.corrode(c.holdTint * this._hold, look);
    }
  }

  /** Let go of everything held — thrown outward if `throwThem`. */
  _releaseHeld(throwThem) {
    const c = settings[ID];
    const g = settings.global;
    for (let i = 0; i < this._heldCount; i++) {
      const d = this._held[i];
      this._held[i] = null;
      if (!throwThem || !d || !d.alive) continue;
      _dir.set(d.position.x - this._rim.center.x, 0, d.position.z - this._rim.center.z);
      if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
      _dir.normalize();
      _force.impulse = c.releaseImpulse * g.explosionIntensity;
      _force.lift = c.releaseLift * g.explosionIntensity;
      _force.spin = c.releaseSpin;
      d.kill(_dir.x, _dir.z, _force);
    }
    this._heldCount = 0;
    // Anything else standing in the circle is thrown too: the air comes back at once.
    if (!throwThem) return;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(this._rim.center.x, this._rim.center.z, Math.max(0.3, c.zoneRadius), _targets);
    for (let i = 0; i < found.length; i++) {
      const d = found[i];
      _dir.set(d.position.x - this._rim.center.x, 0, d.position.z - this._rim.center.z);
      if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
      _dir.normalize();
      _force.impulse = c.releaseImpulse * g.explosionIntensity;
      _force.lift = c.releaseLift * g.explosionIntensity;
      _force.spin = c.releaseSpin;
      d.kill(_dir.x, _dir.z, _force);
    }
    _targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.rig.visible = false;
    this.tines.visible = false;
    this.strings.visible = false;
    this.floor.visible = false;
    this.air.visible = false;
    this.curtain.visible = false;
    for (const f of this.fronts) {
      f.t = -1;
      f.mesh.visible = false;
    }
    this._releaseHeld(false);
    this._tau = -1;
  }

  dispose() {
    this.bellGeometry.dispose();
    this.clapperGeometry.dispose();
    this.gearGeometry.dispose();
    this.tineGeometry.dispose();
    this.stringGeometry.dispose();
    this.bandGeometry.dispose();
    this.quadGeometry.dispose();
    this.curtainGeometry.dispose();
    this.curtainMaterial.dispose();
    this.bellMaterial.dispose();
    this.clapperMaterial.dispose();
    this.gearMaterial.dispose();
    this.tineMaterial.dispose();
    this.stringMaterial.dispose();
    this.fronts.forEach((f) => f.material.dispose());
    this.floorMaterial.dispose();
    this.airMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('🔔  Stasis Bell');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'band runs out at (m/s)');
  R(cast, c, 'lifetime', 0.1, 6, 0.05, 'unmade over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'shimmer');

  const bell = folder.addFolder('1 · Bell');
  R(bell, c, 'hangFromZone', 0, 1, 0.01, 'hang from the fence (0 = fixed height)');
  R(bell, c, 'hangClear', 0, 3, 0.01, 'lip clears the tines by (m)');
  R(bell, c, 'hangHeight', 2, 16, 0.05, 'fixed crown height (m)');
  R(bell, c, 'dropHeight', 0, 4, 0.01, 'lowered from (m above)');
  R(bell, c, 'travelForm', 0, 1, 0.01, 'turned while the note runs');
  R(bell, c, 'bellHeight', 0.2, 6, 0.01, 'bell height (m)');
  R(bell, c, 'bellRadius', 0.1, 4, 0.01, 'lip radius (m)');
  R(bell, c, 'formTime', 0.05, 3, 0.01, 'turned over (s)');
  R(bell, c, 'formEdge', 0.002, 0.3, 0.002, 'turning edge');
  R(bell, c, 'clapperSize', 0.05, 1, 0.01, 'clapper (m)');
  R(bell, c, 'gearSize', 0.2, 2.5, 0.01, 'escapement wheel (×)');
  R(bell, c, 'gearTickRate', 0, 20, 0.1, 'ticks/second');

  const brass = folder.addFolder('2 · Brass');
  R(brass, c, 'brassEnv', 0, 4, 0.01, 'reflection');
  R(brass, c, 'brassSpecular', 0, 10, 0.05, 'highlight');
  R(brass, c, 'brassGloss', 1, 300, 1, 'gloss');
  R(brass, c, 'engrave', 0, 1, 0.01, 'inscription');
  R(brass, c, 'patina', 0, 1, 0.01, 'verdigris');
  R(brass, c, 'rimGlow', 0, 4, 0.01, 'warm rim');
  R(brass, c, 'tollGlow', 0, 12, 0.05, 'struck glow');
  brass.addColor(c, 'colorBrass').name('brass');
  brass.addColor(c, 'colorBrassDark').name('engraving');
  brass.addColor(c, 'colorPatina').name('verdigris');
  brass.addColor(c, 'colorGlow').name('glow');
  brass.addColor(c, 'colorForm').name('turning edge');

  const toll = folder.addFolder('3 · Toll');
  R(toll, c, 'tolls', 1, 8, 1, 'tolls that hold');
  R(toll, c, 'tollInterval', 0.15, 2, 0.01, 'between tolls (s)');
  R(toll, c, 'swing', 0, 1.2, 0.01, 'swing (rad)');
  R(toll, c, 'finalSwing', 0, 1.5, 0.01, 'last swing (rad)');
  R(toll, c, 'ringAmp', 0, 0.3, 0.002, 'lip flex');
  R(toll, c, 'ringFreq', 1, 80, 0.5, 'flex rate');
  R(toll, c, 'ringDecay', 0.05, 3, 0.01, 'rings for (s)');

  const sound = folder.addFolder('4 · Sound fronts');
  R(sound, c, 'frontTime', 0.05, 2, 0.01, 'reaches the rim in (s)');
  R(sound, c, 'frontWidth', 0.05, 3, 0.01, 'band (m)');
  R(sound, c, 'frontGlow', 0, 10, 0.05, 'glow');
  R(sound, c, 'frontOpacity', 0, 1, 0.01, 'opacity');
  R(sound, c, 'frontRipples', 0, 20, 0.5, 'ripples');
  sound.addColor(c, 'colorFrontA').name('leading edge');
  sound.addColor(c, 'colorFrontB').name('ripples');

  const tines = folder.addFolder('5 · Tines');
  R(tines, c, 'tines', 3, MAX_TINES, 1, 'count');
  R(tines, c, 'tineHeight', 0.2, 6, 0.01, 'height (m)');
  R(tines, c, 'tineWidth', 0.02, 1, 0.005, 'prong gap (m)');
  R(tines, c, 'tineThickness', 0.005, 0.2, 0.001, 'prong radius (m)');
  R(tines, c, 'riseTime', 0.02, 2, 0.01, 'rise over (s)');
  R(tines, c, 'riseStagger', 0, 2, 0.01, 'first to last (s)');
  R(tines, c, 'tineQuiver', 0, 0.3, 0.002, 'quiver (rad)');
  R(tines, c, 'tineGlow', 0, 10, 0.05, 'flare');

  const strings = folder.addFolder('6 · Strings');
  R(strings, c, 'strings', 1, STRING_ROWS, 1, 'rows');
  R(strings, c, 'stringLow', 0, 1, 0.01, 'lowest (× tine height)');
  R(strings, c, 'stringHigh', 0, 1, 0.01, 'highest');
  R(strings, c, 'stringAmp', 0, 1, 0.005, 'swing (m)');
  R(strings, c, 'stringFreq', 0, 80, 0.5, 'rate');
  R(strings, c, 'stringModes', 1, 6, 1, 'antinodes');
  R(strings, c, 'stringWidth', 0.003, 0.2, 0.001, 'width (m)');
  R(strings, c, 'stringGlow', 0, 12, 0.05, 'glow');
  R(strings, c, 'stringSnap', 0.02, 1.5, 0.01, 'snap over (s)');
  strings.addColor(c, 'colorStringA').name('core');
  strings.addColor(c, 'colorStringB').name('edge');

  const field = folder.addFolder('6b · Held field');
  R(field, c, 'curtainHeight', 0.1, 1.5, 0.01, 'height (× tine height)');
  R(field, c, 'curtainBands', 1, 16, 0.5, 'standing bands');
  R(field, c, 'curtainGlow', 0, 6, 0.05, 'crest glow');
  R(field, c, 'curtainOpacity', 0, 1, 0.01, 'opacity');
  field.addColor(c, 'colorCurtainA').name('crest');
  field.addColor(c, 'colorCurtainB').name('amber');
  field.addColor(c, 'colorCurtainDeep').name('umber (deep)');

  const travel = folder.addFolder('Note (travel)');
  R(travel, c, 'travelRate', 0, 400, 1, 'bead motes / s');
  R(travel, c, 'travelSize', 0.01, 0.6, 0.005, 'bead size');
  R(travel, c, 'travelRingSpacing', 0.3, 5, 0.05, 'sound rings every (m)');
  R(travel, c, 'travelRingRadius', 0.1, 3, 0.01, 'sound ring radius (m)');

  const floor = folder.addFolder('7 · Floor');
  R(floor, c, 'bandWidth', 0.02, 2, 0.01, 'resonance band (m)');
  R(floor, c, 'bandGlow', 0, 6, 0.05, 'band glow');
  R(floor, c, 'waveScale', 0.2, 10, 0.05, 'standing rings per m');
  R(floor, c, 'waveGlow', 0, 6, 0.05, 'ring glow');
  R(floor, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  R(floor, c, 'washStrength', 0, 1.5, 0.01, 'held wash');
  floor.addColor(c, 'colorBand').name('band');
  floor.addColor(c, 'colorWave').name('rings');
  floor.addColor(c, 'colorHeld').name('held wash');

  const fx = folder.addFolder('8 · Motes, sparks, dust');
  R(fx, c, 'moteCount', 0, 400, 1, 'motes per toll');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 8, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'sparkCount', 0, 60, 1, 'sparks per tine');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.2, 0.001, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');
  R(fx, c, 'dustCount', 0, 200, 1, 'dust on release');
  R(fx, c, 'dustSize', 0.05, 4, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');

  const beat = folder.addFolder('9 · Beat');
  R(beat, c, 'tollWarp', 0, 4, 0.01, 'toll distortion');
  R(beat, c, 'tollShake', 0, 1, 0.01, 'knock per toll');
  R(beat, c, 'tollLight', 0, 6, 0.05, 'light per toll (× intensity)');
  R(beat, c, 'releaseShake', 0, 2, 0.01, 'release knock');
  R(beat, c, 'releaseFlash', 0, 1, 0.01, 'release flash');
  R(beat, c, 'releaseLight', 0, 10, 0.05, 'release light (× intensity)');
  R(beat, c, 'burstSize', 0, 12, 0.05, 'pressure shell (m)');
  R(beat, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shockwave (m)');
  beat.addColor(c, 'colorBurstA').name('shell inner');
  beat.addColor(c, 'colorBurstB').name('shell mid');
  beat.addColor(c, 'colorBurstC').name('shell outer');
  beat.addColor(c, 'colorShock').name('shockwave');
  beat.addColor(c, 'colorFlash').name('flash');

  const hold = folder.addFolder('10 · Hold');
  R(hold, c, 'holdStrength', 0, 1, 0.01, 'stops bodies');
  R(hold, c, 'holdTint', 0, 1, 0.01, 'brass stain');
  hold.addColor(c, 'colorHeldBody').name('held body');
  hold.addColor(c, 'colorHeldRim').name('held rim');
  R(hold, c, 'releaseImpulse', 0, 30, 0.1, 'thrown on release (m/s)');
  R(hold, c, 'releaseLift', 0, 15, 0.05, 'lift (m/s)');
  R(hold, c, 'releaseSpin', 0, 8, 0.01, 'tumble');

  folder.close();
  return folder;
}
