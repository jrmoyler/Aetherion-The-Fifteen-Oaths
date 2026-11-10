import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability } from '../Ability.js';
import { createAetherbladeGeometry } from '../../assets/matrix-new/AetherbladeCascadeGeometry.js';
import {
  createAetherCircleMaterial,
  createAetherCoreMaterial,
  createAetherSwordMaterial
} from '../../materials/matrix-new/AetherbladeCascadeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'aetherblade';

const TAU = Math.PI * 2;

/** Regular blades per cast; the editor's count slider clamps to this. */
const MAX_BLADES = 24;
/** Plus the final blade, which always lives in the last slot. */
const SLOTS = MAX_BLADES + 1;
const FINAL = MAX_BLADES;

const _emit = {};
const _pos = new Vector3();
const _land = new Vector3();
const _axis = new Vector3();
const _dir = new Vector3();
const _mid = new Vector3();
const _up = new Vector3(0, 1, 0);
const _xAxis = new Vector3(1, 0, 0);
/** Scratch for a sword's pose and for its circle — kept apart on purpose. */
const _node = new Object3D();
const _ring = new Object3D();
const _tilt = new Quaternion();
const _spin = new Quaternion();
const _flat = new Quaternion();

/**
 * AETHERBLADE CASCADE — a rain of spectral swords down the line.
 *
 * A line cast with an invisible front. As the front passes each station on
 * the line, a sword dissolves into being above it, point first, hangs there
 * drawn back for a beat, and stabs down into the floor. Because the stations
 * are called in order and each sword keeps its own clock, the cascade *is*
 * the stagger — no timeline is authored. The last station, at the target, is
 * a larger blade that hangs a little longer and lands with the whole cast's
 * weight. The swords stand embedded for `lifetime`, then shatter caster-first
 * into glints.
 *
 * Eight layers, each a folder in the editor:
 *
 *   1. **the swords** — one InstancedMesh (`createAetherbladeGeometry`): a
 *      faceted diamond blade, swept crossguard, octagonal grip and pommel,
 *      built tip-down so a sword stabs straight along its own axis. The glass
 *      shader (fresnel shell, facet reflections from `frame.uEnvMap`, rune
 *      glyphs pulsing down the fuller, glowing edges) dissolves in from the
 *      tip and cracks apart on a voronoi field. Per-instance state goes in one
 *      `vec4 aState` — form, shatter, seed, flare — so the cascade is one draw.
 *   2. **the rune circles** — one instanced ground quad per sword, all SDF:
 *      double ring, glyph band, counter-rotating polygon. Each is drawn on
 *      while its sword forms (it marks where it will land), flares when it
 *      lands, then holds dimmer until the shatter takes it.
 *   3. **forming motes** — additive SOFT particles drawn inward to each sword
 *      while it materialises.
 *   4. **the stab** — afterimage STREAKs shed along the falling blade; on
 *      landing a spray of sparks (STREAK, gravity), a SHOCKWAVE ring, a small
 *      STORM shell, a knock and a light punch. Bodies within `killRadius` of
 *      the point are struck (`handlesOwnHits`, `dummy.kill`).
 *   5. **the final blade** — the same, scaled, with a flash and a big shake.
 *   6. **the shatter** — cracks light, cells drop out, glints fall.
 *   7. **the blade core** — the same swords drawn again underneath the glass,
 *      lit and normal-blended (`createAetherCoreMaterial`): indigo deep,
 *      cobalt body, ice rim, white runes. This is what carries the mass at
 *      8 m — the glass alone reads as a white needle.
 *   8. **the brand and the linger** — each landing burns a dark indigo
 *      SCORCH into the floor under its circle that stays for the cast. While
 *      the blades stand they *settle*: they sink a little further, their runes
 *      breathe, aether wisps curl up off them, and the circles draw in toward
 *      the blade. In the last `crackLead` seconds the cracks light up the
 *      blades (the exit telegraphed), then they shatter caster-first and their
 *      circles flare outward and go.
 *
 * ## The editor rule
 *
 * A sword record stores dice (station, lateral and timing jitter, lean, yaw,
 * size) and two event times — when the front called it, and when it began to
 * shatter — plus one-shot flags. Its station, height, lean, size and every
 * phase of its clock are resolved from `settings.aetherblade` every frame.
 */
export class AetherbladeCascadeAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** Each sword strikes where it lands, when it lands. */
  get handlesOwnHits() {
    return true;
  }

  /** Swords drawn this frame. HUD readout only. */
  get instanceCount() {
    return this.swords.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the swords ---- */
    this.swordMaterial = createAetherSwordMaterial();
    this._stateAttr = new InstancedBufferAttribute(new Float32Array(SLOTS * 4), 4).setUsage(DynamicDrawUsage);
    this._shapeKey = '';
    this.swords = new InstancedMesh(this._buildSword(), this.swordMaterial, SLOTS);
    this.swords.name = 'AetherSwords';
    // Additive glass: on VFX, out of the depth prepass, so the floor still
    // hides the buried part of an embedded blade.
    this.swords.layers.set(LAYER.VFX);
    this.swords.frustumCulled = false;
    this.swords.renderOrder = 13;
    this.swords.count = 0;
    this.group.add(this.swords);

    /* ---- layer 7: the lit core under the glass, same instances ---- */
    this.coreMaterial = createAetherCoreMaterial();
    this.cores = new InstancedMesh(this.swords.geometry, this.coreMaterial, SLOTS);
    this.cores.name = 'AetherCores';
    this.cores.instanceMatrix = this.swords.instanceMatrix; // one matrix buffer, two draws
    this.cores.layers.set(LAYER.VFX);
    this.cores.frustumCulled = false;
    this.cores.renderOrder = 12;
    this.cores.count = 0;
    this.group.add(this.cores);

    /* ---- layer 2: the rune circles ---- */
    this.circleGeometry = new PlaneGeometry(1, 1, 1, 1);
    this._runeAttr = new InstancedBufferAttribute(new Float32Array(SLOTS * 4), 4).setUsage(DynamicDrawUsage);
    this.circleGeometry.setAttribute('aRune', this._runeAttr);
    this.circleMaterial = createAetherCircleMaterial();
    this.circles = new InstancedMesh(this.circleGeometry, this.circleMaterial, SLOTS);
    this.circles.name = 'AetherCircles';
    this.circles.layers.set(LAYER.VFX);
    this.circles.frustumCulled = false;
    this.circles.renderOrder = 3;
    this.circles.count = 0;
    this.group.add(this.circles);

    /** One record per sword: dice, two event times, one-shot flags. */
    this.blades = [];
    for (let i = 0; i < SLOTS; i++) {
      this.blades.push({
        along: 0, // -1..1 station jitter
        lateral: 0, // -1..1
        time: 0, // 0..1 timing jitter
        lean: 0, // -1..1
        yaw: 0, // radians
        size: 0, // -1..1
        seed: 0,
        calledAt: -1, // cast clock when the front reached it
        shatterAt: -1, // cast clock when it began to shatter
        landed: false,
        glinted: false
      });
    }

    this._clock = 0;
    this._circleSpin = 0;
    this._seed = 0;
    this._lastActive = -1;
    this._forming = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._preCrack = 0;
  }

  /** The sword silhouette from the live shape settings, with the state attribute. */
  _buildSword() {
    const c = settings.aetherblade;
    const geometry = createAetherbladeGeometry({
      width: c.bladeWidth,
      thickness: c.bladeThickness,
      bladeFraction: c.bladeFraction,
      guardWidth: c.guardWidth
    });
    geometry.setAttribute('aState', this._stateAttr);
    return geometry;
  }

  /** Rebuild the silhouette only when a shape slider actually moved. */
  _syncGeometry() {
    const c = settings.aetherblade;
    const key = `${c.bladeWidth}|${c.bladeThickness}|${c.bladeFraction}|${c.guardWidth}`;
    if (key === this._shapeKey) return;
    const first = this._shapeKey === '';
    this._shapeKey = key;
    if (first) return; // built in the constructor from the same values
    const old = this.swords.geometry;
    this.swords.geometry = this._buildSword();
    this.cores.geometry = this.swords.geometry;
    old.dispose();
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Motes drawn into a forming sword.
    this.motes = particles.get('aetherblade.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.2;
    this.motes.uniforms.uFadeOut.value = 0.35;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 0.2;
    this.motes.uniforms.uGravity.value.set(0, 0, 0);

    // Afterimages of the fall and the sparks of the landing: velocity streaks.
    this.sparks = particles.get('aetherblade.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.35;
    this.sparks.uniforms.uDrag.value = 1.6;

    // Glints the swords shatter into.
    this.glints = particles.get('aetherblade.glints', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.glints.uniforms.uSizeIn.value = 0.04;
    this.glints.uniforms.uFadeIn.value = 0.03;
    this.glints.uniforms.uFadeOut.value = 0.5;
    this.glints.uniforms.uEndSize.value = 0.2;
    this.glints.uniforms.uDrag.value = 1.1;

    // Aether wisps curling up off the standing blades (the linger's motion).
    this.wisps = particles.get('aetherblade.wisps', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.wisps.uniforms.uSizeIn.value = 0.15;
    this.wisps.uniforms.uFadeIn.value = 0.2;
    this.wisps.uniforms.uFadeOut.value = 0.5;
    this.wisps.uniforms.uEndSize.value = 1.6;
    this.wisps.uniforms.uDrag.value = 0.8;
    this.wisps.uniforms.uTurbFrequency.value = 0.9;
    this.wisps.uniforms.uTurbSpeed.value = 0.7;

    this.moteEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
    this.wispEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Seconds from a sword being called to it landing (before jitter). */
  _landTime(final) {
    const c = settings.aetherblade;
    return Math.max(0.01, c.formTime) + Math.max(0, c.hoverTime) + (final ? Math.max(0, c.finalHover) : 0) + Math.max(0.01, c.stabTime);
  }

  /** The impact phase: the final blade's fall, then the swords standing. */
  get impactDuration() {
    const c = settings.aetherblade;
    return Math.max(0.1, (this._landTime(true) + c.timeJitter + c.lifetime) * settings.global.lifetime);
  }

  /** The fade: the shatter, caster first. */
  get fadeDuration() {
    const c = settings.aetherblade;
    const count = this._count();
    return Math.max(0.1, (c.shatterTime + c.shatterStagger * count) * settings.global.lifetime + 0.15);
  }

  /** An arcane throb rather than a flicker. */
  lightShimmer() {
    const p = settings.aetherblade.lightPulse;
    // Quickens while swords are still forming.
    const rate = this._forming > 0 ? 11 : 5.2;
    return 1 - p + p * (0.5 + 0.5 * Math.sin(this.age * rate));
  }

  _count() {
    return Math.min(MAX_BLADES, Math.max(1, Math.round(settings.aetherblade.bladeCount)));
  }

  /* ------------------------------------------------------------------ */
  /* Where a sword is — every metre from live settings                   */
  /* ------------------------------------------------------------------ */

  /** Metres down the line sword `i` is stationed at. */
  _station(i) {
    const c = settings.aetherblade;
    if (i === FINAL) return this.length;
    const count = this._count();
    const first = Math.min(c.firstStation, this.length * 0.9);
    const spacing = (this.length - first) / count;
    const s = first + spacing * i + this.blades[i].along * c.stationJitter * settings.global.randomness;
    return Math.max(0.3, Math.min(this.length - spacing * 0.35, s));
  }

  /** Floor point sword `i` lands on. */
  _landPoint(i, out) {
    const c = settings.aetherblade;
    const blade = this.blades[i];
    this.pointAt(this._station(i) / this.length, out);
    if (i !== FINAL) {
      const zig = (i & 1 ? 1 : -1) * c.zigzag;
      out.addScaledVector(this.side, zig + blade.lateral * c.lateralJitter * settings.global.randomness);
    }
    out.y = 0;
    return out;
  }

  _length(i) {
    const c = settings.aetherblade;
    const base = c.bladeLength * (i === FINAL ? c.finalScale : 1);
    return Math.max(0.1, base * (1 + this.blades[i].size * c.sizeJitter * settings.global.randomness));
  }

  /** Seconds on sword `i`'s own clock, or -1 if it has not been called. */
  _age(i) {
    const blade = this.blades[i];
    if (blade.calledAt < 0) return -1;
    return this._clock - blade.calledAt - blade.time * settings.aetherblade.timeJitter;
  }

  /**
   * Resolve sword `i` on its clock: its axis (into `_axis`), how far its tip
   * is from the landing point along that axis, and its form/flare.
   *
   * @returns {number} tip distance along the axis, metres (negative = buried)
   */
  _pose(i, t, out) {
    const c = settings.aetherblade;
    const g = settings.global;
    const blade = this.blades[i];
    const final = i === FINAL;
    const L = this._length(i);
    const tForm = Math.max(0.01, c.formTime);
    const tHover = Math.max(0, c.hoverTime) + (final ? Math.max(0, c.finalHover) : 0);
    const tStab = Math.max(0.01, c.stabTime);
    const tLand = tForm + tHover + tStab;

    const hoverLean = c.tilt + blade.lean * c.tiltJitter * g.randomness;
    let lean;
    let dist;
    let stab = 0;
    const hoverTipY = c.hoverHeight * (final ? 1.25 : 1);
    const hoverDist = hoverTipY / Math.max(0.2, Math.cos(hoverLean));

    if (t < tForm + tHover) {
      // Hanging: drawn back up by `windup` as it finishes forming.
      const draw = Easing.outCubic(saturate((t - tForm * 0.4) / (tForm * 0.6 + tHover)));
      lean = hoverLean;
      dist = hoverDist + c.windup * draw + c.hoverBob * Math.sin(t * 7 + blade.seed * 10);
    } else if (t < tLand) {
      // The stab: accelerating along its own axis, levelling its lean.
      const k = (t - tForm - tHover) / tStab;
      stab = k;
      lean = lerp(hoverLean, c.landTilt * Math.sign(hoverLean || 1), Easing.inQuad(k));
      dist = lerp(hoverDist + c.windup, -c.embedDepth * L, k * k);
    } else {
      // Embedded, quivering, then settling slowly deeper while it stands.
      const s = t - tLand;
      const shudder = c.landShudder * Math.exp(-s * 6 / Math.max(0.05, c.shudderTime)) * Math.sin(s * 55);
      lean = c.landTilt * Math.sign(hoverLean || 1) + shudder;
      const settle = 1 - Math.exp(-s / Math.max(0.05, c.lingerSinkTime * g.lifetime));
      dist = -(c.embedDepth + c.lingerSink * settle) * L;
    }

    // Lean about the lateral axis: the pommel tips back toward the caster and
    // the point leads down the line.
    _tilt.setFromAxisAngle(this.side, lean);
    _spin.setFromAxisAngle(_up, blade.yaw * c.spinJitter);
    out.quaternion.copy(_tilt).multiply(_spin);
    _axis.set(0, 1, 0).applyQuaternion(out.quaternion);

    out.userData.form = Easing.outCubic(saturate(t / tForm));
    out.userData.stab = stab;
    out.userData.landed = t >= tLand;
    out.userData.since = t - tLand;
    out.userData.length = L;
    return dist;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.moteEmitter.reset();
    this.trailEmitter.reset();
    this.wispEmitter.reset();
    this._preCrack = 0;
    this._clock = 0;
    this._circleSpin = Math.random() * TAU;
    this._seed = Math.random() * 100;
    this._lastActive = -1;

    for (const blade of this.blades) {
      blade.along = randRange(-1, 1);
      blade.lateral = randRange(-1, 1);
      blade.time = Math.random();
      blade.lean = randRange(-1, 1);
      blade.yaw = Math.random() * TAU;
      blade.size = randRange(-1, 1);
      blade.seed = Math.random();
      blade.calledAt = -1;
      blade.shatterAt = -1;
      blade.landed = false;
      blade.glinted = false;
    }
    // The final blade does not wander and does not spin off its line.
    this.blades[FINAL].time = 0;
    this.blades[FINAL].lean = 0;
    this.blades[FINAL].size = 0;

    this.swords.count = 0;
    this.cores.count = 0;
    this.circles.count = 0;
    this._sync(0);
  }

  /** Call every sword whose station the front has reached. */
  _call(reach) {
    const count = this._count();
    for (let i = 0; i < count; i++) {
      const blade = this.blades[i];
      if (blade.calledAt < 0 && this._station(i) <= reach) blade.calledAt = this._clock;
    }
    const final = this.blades[FINAL];
    if (final.calledAt < 0 && reach >= this.length) final.calledAt = this._clock;
  }

  onTravel(dt) {
    const c = settings.aetherblade;
    this._clock += dt;
    this._call(this.front + c.formLead);
    this._sync(dt);
  }

  onImpact() {
    // The front is at the target: everything not yet called is called now.
    this._call(this.length + 1e3);
  }

  onFade(dt, t) {
    const c = settings.aetherblade;
    const g = settings.global;
    this._clock += dt;
    this._call(this.length + 1e3);

    // The exit telegraphed: cracks light up the standing blades over the last
    // `crackLead` seconds before they shatter. Presentation only.
    if (t <= 1) {
      const lead = Math.max(0.05, c.crackLead * g.lifetime) / Math.max(0.1, this.impactDuration);
      this._preCrack = c.crackPre * smoothstep(1 - lead, 1, t);
    } else {
      this._preCrack = c.crackPre;
    }

    if (t > 1) {
      // Shatter caster-first; the final blade goes last.
      const elapsed = this.fadeTime;
      const count = this._count();
      for (let i = 0; i < SLOTS; i++) {
        const blade = this.blades[i];
        if (blade.shatterAt >= 0 || blade.calledAt < 0) continue;
        if (i >= count && i !== FINAL) continue;
        const order = i === FINAL ? count : i;
        if (elapsed >= order * c.shatterStagger * g.lifetime) blade.shatterAt = this._clock;
      }
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings.aetherblade;
    const g = settings.global;
    this._syncGeometry();
    this._circleSpin += c.circleSpin * dt * g.animationSpeed;
    this.swordMaterial.userData.sync();
    this.coreMaterial.userData.sync();
    this.circleMaterial.userData.sync(this._circleSpin);
    this._syncParticles();

    const count = this._count();
    const state = this._stateAttr.array;
    const rune = this._runeAttr.array;
    const shatterTime = Math.max(0.05, c.shatterTime * g.lifetime);
    let drawn = 0;
    let lightSlot = -1;
    let forming = 0; // swords still materialising — drives the light's throb

    for (let i = 0; i < SLOTS; i++) {
      if (i >= count && i !== FINAL) continue;
      const blade = this.blades[i];
      const t = this._age(i);
      if (t < 0) continue;

      const dist = this._pose(i, t, _node);
      const info = _node.userData;
      const L = info.length;
      this._landPoint(i, _land);

      const shatter = blade.shatterAt >= 0 ? saturate((this._clock - blade.shatterAt) / shatterTime) : 0;
      if (shatter >= 1) continue;

      /* the sword */
      _node.position.copy(_land).addScaledVector(_axis, dist);
      _node.scale.setScalar(L);
      // The middle of the blade — where motes converge and afterimages shed.
      _mid.copy(_land).addScaledVector(_axis, dist + L * 0.4);
      _node.updateMatrix();
      this.swords.setMatrixAt(drawn, _node.matrix);
      // The runes breathe while it stands (the linger's pulse).
      const breath = info.landed ? c.lingerBreath * (0.5 + 0.5 * Math.sin(info.since * c.lingerBreathRate * TAU + blade.seed * TAU)) : 0;
      const flare = info.landed ? Math.exp(-info.since * 6) * c.circleFlare + breath : info.stab * 0.6;
      state[drawn * 4 + 0] = info.form;
      // Before the shatter proper, the cracks light without dropping any cell.
      state[drawn * 4 + 1] = shatter > 0 ? Math.max(shatter, this._preCrack) : (info.landed ? this._preCrack : 0);
      state[drawn * 4 + 2] = blade.seed * 10;
      state[drawn * 4 + 3] = flare;

      /* its circle */
      // Standing, the circle draws in toward its blade; shattering, it flares out.
      const pull = info.landed ? lerp(1, c.circleContract, 1 - Math.exp(-info.since / Math.max(0.05, c.lingerSinkTime * g.lifetime))) : 1;
      const radius = c.circleRadius * (i === FINAL ? c.finalCircle : 1) * pull * (1 + c.circleExitGrow * Easing.outCubic(shatter));
      const quad = (radius * 2) / 0.86;
      _flat.setFromAxisAngle(_xAxis, -Math.PI / 2);
      _ring.position.set(_land.x, 0.018 + i * 0.0004, _land.z);
      _ring.quaternion.copy(_flat);
      _ring.scale.set(quad, quad, 1);
      _ring.updateMatrix();
      this.circles.setMatrixAt(drawn, _ring.matrix);
      const tForm = Math.max(0.01, c.formTime) + Math.max(0, c.hoverTime);
      const draw = Easing.outCubic(saturate(t / tForm));
      const circleFlare = info.landed ? c.circleFlare * Math.exp(-info.since * c.circleFlareDecay) : 0;
      const hold = info.landed ? lerp(1, c.circleLinger, saturate(info.since * 2)) : 0.55;
      rune[drawn * 4 + 0] = draw;
      rune[drawn * 4 + 1] = circleFlare;
      rune[drawn * 4 + 2] = hold * (1 - Easing.inQuad(shatter));
      rune[drawn * 4 + 3] = blade.seed;
      drawn++;

      /* events and the streams that follow a blade's clock */
      // Read the pose out before any effect touches the scratch.
      const landed = info.landed;
      const stabbing = info.stab > 0 && !landed;
      const formingNow = !landed && info.form < 1;
      if (formingNow) forming++;
      if (formingNow) this._moteFx(dt, i, L);
      if (stabbing) this._trailFx(dt, L);
      if (landed && shatter <= 0) this._wispFx(dt, i, L, dist);
      if (shatter > 0.12 && !blade.glinted) {
        blade.glinted = true;
        this._glintFx(i, L, dist);
      }
      if (landed && !blade.landed) {
        blade.landed = true;
        this._landFx(i, _land);
      }
      if (lightSlot < 0 || blade.calledAt >= this.blades[lightSlot].calledAt) lightSlot = i;
    }

    this.swords.count = drawn;
    this.cores.count = drawn;
    this.circles.count = drawn;
    this.swords.instanceMatrix.needsUpdate = true;
    this.circles.instanceMatrix.needsUpdate = true;
    this._stateAttr.needsUpdate = true;
    this._runeAttr.needsUpdate = true;

    // The light hangs over the newest sword (the travelling front before any).
    if (lightSlot >= 0) {
      this._landPoint(lightSlot, this.position);
    } else {
      this.position.copy(this.origin).addScaledVector(this.direction, this.front);
    }
    this.position.y = c.lightHeight;
    this._lastActive = lightSlot;
    this._forming = forming;
  }

  _syncParticles() {
    const c = settings.aetherblade;
    const g = settings.global;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = g.glow;
    m.uTurbulence.value = 0.15 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const s = this.sparks.uniforms;
    s.uGravity.value.set(0, c.sparkGravity, 0);
    s.uStretch.value = c.sparkStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = 1.6 * g.glow;
    s.uTurbulence.value = 0.1 * g.turbulence;

    this.glints.setGradient(getColor(c.colorGlintA), getColor(c.colorGlintB), getColor(c.colorGlintC), getColor(c.colorGlintD));
    const gl = this.glints.uniforms;
    gl.uGravity.value.set(0, c.glintGravity, 0);
    gl.uSizeScale.value = g.particleSize;
    gl.uLifeScale.value = g.particleLifetime;
    gl.uSpeedScale.value = g.particleSpeed;
    gl.uOpacity.value = g.opacity;
    gl.uGlow.value = 1.4 * g.glow;
    gl.uTurbulence.value = 0.3 * g.turbulence;

    this.wisps.setGradient(getColor(c.colorWispA), getColor(c.colorWispB), getColor(c.colorWispC), getColor(c.colorWispD));
    const w = this.wisps.uniforms;
    w.uGravity.value.set(0, c.wispBuoyancy, 0);
    w.uSizeScale.value = g.particleSize;
    w.uLifeScale.value = g.particleLifetime;
    w.uSpeedScale.value = g.particleSpeed;
    w.uOpacity.value = g.opacity;
    w.uGlow.value = c.wispGlow * g.glow;
    w.uTurbulence.value = 0.8 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

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

  /**
   * Motes converging on a forming sword. Reads `_mid` and `_axis`, which the
   * caller has just resolved for this sword.
   */
  _moteFx(dt, i, L) {
    const c = settings.aetherblade;
    const g = settings.global;
    const n = this.moteEmitter.tick(dt, c.moteRate * (i === FINAL ? 2 : 1) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    const r = c.moteRadius * (i === FINAL ? 1.6 : 1);
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime;
    _emit.lifeVariance = 0.25;
    _emit.speedVariance = 0.2;
    for (let k = 0; k < n; k++) {
      _dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (_dir.lengthSq() < 1e-4) _dir.set(1, 0, 0);
      _dir.normalize();
      _pos.copy(_mid).addScaledVector(_dir, r).addScaledVector(_axis, (Math.random() - 0.5) * L * 0.7);
      _emit.position = _pos;
      _emit.direction = _dir.negate();
      _emit.speed = c.moteSpeed;
      this.motes.emit(1, _emit);
    }
  }

  /** Aether curling up off a standing blade (reads `_land`, `_axis`). */
  _wispFx(dt, i, L, dist) {
    const c = settings.aetherblade;
    const g = settings.global;
    const n = this.wispEmitter.tick(dt, c.wispRate * (i === FINAL ? 2 : 1) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.wispSize * (i === FINAL ? 1.4 : 1);
    _emit.life = c.wispLife;
    _emit.lifeVariance = 0.4;
    _emit.speed = c.wispSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.35;
    _emit.radius = 0.08 * L;
    _emit.direction = _up;
    for (let k = 0; k < n; k++) {
      _pos.copy(_land).addScaledVector(_axis, Math.max(0.05, dist + Math.random() * L * 0.75));
      _emit.position = _pos;
      this.wisps.emit(1, _emit);
    }
  }

  /** Afterimages shed along the falling blade (reads `_mid`, `_axis`). */
  _trailFx(dt, L) {
    const c = settings.aetherblade;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.trailRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.trailSize;
    _emit.life = c.trailLifetime;
    _emit.speedVariance = 0.3;
    _emit.direction = _dir.copy(_axis).negate();
    _emit.speed = 2.5;
    for (let k = 0; k < n; k++) {
      _pos.copy(_mid).addScaledVector(_axis, (Math.random() - 0.4) * L * 0.8);
      _emit.position = _pos;
      this.sparks.emit(1, _emit);
    }
  }

  /** A sword landing: sparks, ring, shell, knock, light — and the strike. */
  _landFx(i, at) {
    const c = settings.aetherblade;
    const g = settings.global;
    const final = i === FINAL;
    const power = g.explosionIntensity * (final ? 1 : 0.6);
    const time = frame.uTime.value;

    /* sparks thrown off the point */
    this._resetEmit(time);
    _pos.copy(at).setY(0.08);
    _emit.position = _pos;
    _emit.radius = 0.12;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed * (final ? 1.4 : 1);
    _emit.speedVariance = 0.55;
    _emit.spread = 1.1;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * (final ? c.finalSparks : 1) * g.particleCount), _emit);

    // The brand: a dark indigo burn under the circle that stays for the cast.
    this.ctx.decals.spawn(DecalType.SCORCH, at, {
      radius: c.brandRadius * (final ? c.finalCircle : 1),
      life: this.impactDuration + this.fadeDuration,
      intensity: c.brandIntensity,
      colorA: getColor(c.colorBrandDeep),
      colorB: getColor(c.colorBrandEmber)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, at, {
      radius: (final ? c.finalShock : c.shockRadius) * g.explosionIntensity,
      life: c.shockLife * (final ? 1.4 : 1),
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    _pos.copy(at).setY(0.25);
    this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
      radius: 0.15,
      endRadius: (final ? c.finalBurst : c.burstRadius) * g.explosionIntensity,
      life: c.burstLife * (final ? 1.5 : 1),
      intensity: 1.2,
      opacity: 0.7,
      fresnel: 2,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    if (final) {
      this.ctx.shake.add(c.finalShake * g.explosionIntensity, 1 / Math.max(0.05, c.finalShakeDuration), 16);
      this.ctx.flash.trigger(getColor(c.colorFlash), c.finalFlash * g.explosionIntensity);
      this.lightBoost = Math.max(this.lightBoost, c.stabLight * 2 * g.explosionIntensity);
    } else {
      this.ctx.shake.add(c.stabShake * power, 7, 22);
      this.lightBoost = Math.max(this.lightBoost, c.stabLight * power);
    }

    /* the strike */
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(at.x, at.z, final ? c.finalKill : c.killRadius, this._found);
    this._force.impulse = c.killImpulse * g.explosionIntensity * (final ? 1.4 : 1);
    this._force.lift = c.killLift * g.explosionIntensity * (final ? 1.3 : 1);
    this._force.spin = c.killSpin;
    for (const dummy of found) {
      _dir.set(dummy.position.x - at.x, 0, dummy.position.z - at.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
  }

  /** A sword coming apart into glints, spread up its length (reads `_land`, `_axis`). */
  _glintFx(i, L, dist) {
    const c = settings.aetherblade;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    const n = Math.round(c.glintCount * (i === FINAL ? 2 : 1) * g.particleCount);
    _emit.size = c.glintSize;
    _emit.life = c.glintLifetime;
    _emit.lifeVariance = 0.4;
    _emit.speed = c.glintSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.radius = 0.06 * L;
    for (let k = 0; k < n; k++) {
      const f = Math.random();
      _pos.copy(_land).addScaledVector(_axis, dist + f * L);
      if (_pos.y < 0.03) continue;
      _emit.position = _pos;
      _emit.direction = _up;
      this.glints.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.swords.count = 0;
    this.cores.count = 0;
    this.circles.count = 0;
  }

  dispose() {
    this.swords.geometry.dispose();
    this.circleGeometry.dispose();
    this.swordMaterial.dispose();
    this.coreMaterial.dispose();
    this.circleMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⚔  Aetherblade Cascade');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 50, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'cascade speed (m/s)');
  R(cast, c, 'lifetime', 0, 8, 0.05, 'blades stand for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 6, 0.05, 'height (m)');
  R(light, c, 'stabLight', 0, 40, 0.1, 'punch per landing');
  R(light, c, 'lightPulse', 0, 1, 0.01, 'throb');

  const cascade = folder.addFolder('1 · Cascade');
  R(cascade, c, 'bladeCount', 1, MAX_BLADES, 1, 'blades (+ final)');
  R(cascade, c, 'firstStation', 0, 8, 0.05, 'first blade at (m)');
  R(cascade, c, 'stationJitter', 0, 2, 0.01, 'station jitter (m)');
  R(cascade, c, 'lateralJitter', 0, 2, 0.01, 'off the line (m)');
  R(cascade, c, 'zigzag', 0, 2, 0.01, 'zigzag (m)');
  R(cascade, c, 'formLead', -4, 6, 0.05, 'forms ahead of front (m)');
  const timing = cascade.addFolder('Timing');
  R(timing, c, 'formTime', 0.02, 1.5, 0.005, 'forms over (s)');
  R(timing, c, 'hoverTime', 0, 1.5, 0.005, 'hangs for (s)');
  R(timing, c, 'stabTime', 0.02, 0.6, 0.005, 'falls over (s)');
  R(timing, c, 'timeJitter', 0, 0.4, 0.005, 'timing jitter (s)');
  const place = cascade.addFolder('Placement');
  R(place, c, 'hoverHeight', 0.5, 10, 0.05, 'hangs at (m)');
  R(place, c, 'windup', 0, 3, 0.01, 'draw back (m)');
  R(place, c, 'hoverBob', 0, 0.5, 0.005, 'breathing (m)');
  R(place, c, 'tilt', -1.2, 1.2, 0.01, 'lean while hanging (rad)');
  R(place, c, 'tiltJitter', 0, 1, 0.01, 'lean jitter');
  R(place, c, 'landTilt', -0.8, 0.8, 0.01, 'lean embedded (rad)');
  R(place, c, 'spinJitter', 0, 1, 0.01, 'turn about its axis');
  R(place, c, 'embedDepth', 0, 0.6, 0.005, 'buried (× length)');
  R(place, c, 'landShudder', 0, 0.4, 0.005, 'quiver (rad)');
  R(place, c, 'shudderTime', 0.05, 2, 0.01, 'quiver lasts (s)');

  const swords = folder.addFolder('2 · Swords');
  const shape = swords.addFolder('Silhouette');
  R(shape, c, 'bladeLength', 0.3, 6, 0.01, 'length (m)');
  R(shape, c, 'sizeJitter', 0, 0.6, 0.01, 'size jitter');
  R(shape, c, 'bladeWidth', 0.01, 0.2, 0.001, 'blade width (rebuild)');
  R(shape, c, 'bladeThickness', 0.003, 0.08, 0.001, 'ridge (rebuild)');
  R(shape, c, 'bladeFraction', 0.4, 0.9, 0.005, 'blade share (rebuild)');
  R(shape, c, 'guardWidth', 1, 8, 0.05, 'guard span (rebuild)');
  const glass = swords.addFolder('Glass');
  R(glass, c, 'swordOpacity', 0, 2, 0.01, 'brightness');
  R(glass, c, 'swordBodyGlow', 0, 2, 0.01, 'body fill');
  R(glass, c, 'swordFresnel', 0, 6, 0.01, 'silhouette glow');
  R(glass, c, 'swordFresnelPower', 0.3, 8, 0.05, 'silhouette thinness');
  R(glass, c, 'swordEnv', 0, 3, 0.01, 'sky in the facets');
  R(glass, c, 'swordSpecular', 0, 12, 0.05, 'glint');
  R(glass, c, 'swordGloss', 4, 600, 1, 'gloss');
  R(glass, c, 'swordEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(glass, c, 'hiltDim', 0, 1.5, 0.01, 'hilt brightness');
  glass.addColor(c, 'colorSwordBody').name('body');
  glass.addColor(c, 'colorSwordRim').name('rim');
  glass.addColor(c, 'colorSwordEdge').name('edges');
  const runes = swords.addFolder('Rune light');
  R(runes, c, 'runeLight', 0, 10, 0.05, 'glow');
  R(runes, c, 'runeLightCount', 1, 20, 1, 'glyphs per blade');
  R(runes, c, 'runeLightWidth', 0.1, 1, 0.01, 'channel width');
  R(runes, c, 'runeLightStroke', 0.01, 0.3, 0.001, 'stroke');
  R(runes, c, 'runePulseSpeed', -6, 6, 0.05, 'pulse speed');
  R(runes, c, 'runePulseWidth', 0.02, 1, 0.01, 'pulse width');
  runes.addColor(c, 'colorSwordRune').name('runes');
  const form = swords.addFolder('Dissolve in');
  R(form, c, 'formSoft', 0.005, 0.5, 0.005, 'front width');
  R(form, c, 'formNoise', 0, 0.6, 0.005, 'front raggedness');
  R(form, c, 'formBurnGlow', 0, 12, 0.05, 'burn line glow');
  form.addColor(c, 'colorSwordBurn').name('burn line');

  const core = swords.addFolder('Core (lit mass under the glass)');
  R(core, c, 'coreOpacity', 0, 1, 0.01, 'opacity');
  R(core, c, 'coreLight', 0, 3, 0.01, 'sunlit body');
  R(core, c, 'coreRim', 0, 3, 0.01, 'ice rim');
  R(core, c, 'coreEnv', 0, 2, 0.01, 'sky in the facets');
  R(core, c, 'coreRuneGlow', 0, 10, 0.05, 'rune glow');
  R(core, c, 'coreHiltDark', 0, 1.5, 0.01, 'hilt brightness');
  core.addColor(c, 'colorCoreDeep').name('deep');
  core.addColor(c, 'colorCoreBody').name('body');
  core.addColor(c, 'colorCoreTint').name('tint');
  core.addColor(c, 'colorCoreHot').name('hot runes');

  const circles = folder.addFolder('3 · Rune circles');
  R(circles, c, 'circleRadius', 0.2, 4, 0.01, 'radius (m)');
  R(circles, c, 'circleBand', 0.04, 0.6, 0.005, 'glyph band');
  R(circles, c, 'circleLine', 0.002, 0.06, 0.001, 'stroke');
  R(circles, c, 'circleGlyphs', 3, 36, 1, 'glyphs');
  R(circles, c, 'circleSides', 3, 12, 1, 'polygon sides');
  R(circles, c, 'circleSpin', -4, 4, 0.01, 'spin (rad/s)');
  R(circles, c, 'circleCoreGlow', 0, 10, 0.05, 'stroke glow');
  R(circles, c, 'circleHaloGlow', 0, 4, 0.01, 'halo glow');
  R(circles, c, 'circleOpacity', 0, 1.5, 0.01, 'opacity');
  R(circles, c, 'circleFlare', 0, 6, 0.05, 'landing flare');
  R(circles, c, 'circleFlareDecay', 0.5, 20, 0.1, 'flare decay');
  R(circles, c, 'circleLinger', 0, 1.5, 0.01, 'held brightness');
  R(circles, c, 'circleContract', 0.2, 1.5, 0.01, 'draws in to (×) while standing');
  R(circles, c, 'circleExitGrow', 0, 3, 0.01, 'flares out on shatter (×)');
  R(circles, c, 'brandRadius', 0, 5, 0.05, 'floor brand (m)');
  R(circles, c, 'brandIntensity', 0, 2, 0.01, 'brand strength');
  circles.addColor(c, 'colorBrandDeep').name('brand deep');
  circles.addColor(c, 'colorBrandEmber').name('brand embers');
  circles.addColor(c, 'colorCircleCore').name('stroke');
  circles.addColor(c, 'colorCircleGlow').name('glow');
  circles.addColor(c, 'colorCircleFlare').name('flare');

  const motes = folder.addFolder('4 · Forming motes');
  R(motes, c, 'moteRate', 0, 600, 1, 'per second');
  R(motes, c, 'moteSize', 0.005, 0.4, 0.001, 'size');
  R(motes, c, 'moteRadius', 0.05, 4, 0.01, 'drawn from (m)');
  R(motes, c, 'moteSpeed', 0, 12, 0.05, 'speed inward');
  R(motes, c, 'moteLifetime', 0.05, 2, 0.01, 'lifetime');
  Editor.gradient(motes, c, 'colorMote', 'mote gradient');

  const stab = folder.addFolder('5 · The stab');
  R(stab, c, 'trailRate', 0, 3000, 10, 'afterimages / s');
  R(stab, c, 'trailSize', 0.005, 0.3, 0.001, 'afterimage size');
  R(stab, c, 'trailLifetime', 0.02, 1, 0.005, 'afterimage life');
  R(stab, c, 'sparkCount', 0, 200, 1, 'sparks per landing');
  R(stab, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(stab, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(stab, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark life');
  R(stab, c, 'sparkGravity', -30, 5, 0.1, 'spark gravity');
  R(stab, c, 'sparkStretch', 0, 0.5, 0.005, 'spark stretch');
  R(stab, c, 'shockRadius', 0, 8, 0.05, 'shockwave (m)');
  R(stab, c, 'shockLife', 0.05, 2, 0.01, 'shockwave life');
  R(stab, c, 'burstRadius', 0, 6, 0.05, 'shell (m)');
  R(stab, c, 'burstLife', 0.05, 2, 0.01, 'shell life');
  R(stab, c, 'stabShake', 0, 1, 0.01, 'shake per stab');
  R(stab, c, 'killRadius', 0, 4, 0.01, 'strike radius (m)');
  R(stab, c, 'killImpulse', 0, 20, 0.1, 'thrown out (m/s)');
  R(stab, c, 'killLift', 0, 20, 0.1, 'thrown up (m/s)');
  R(stab, c, 'killSpin', 0, 5, 0.01, 'torque');
  Editor.gradient(stab, c, 'colorSpark', 'spark gradient');
  stab.addColor(c, 'colorShockA').name('shockwave');
  stab.addColor(c, 'colorShockB').name('shockwave hot');
  stab.addColor(c, 'colorBurstA').name('shell inner');
  stab.addColor(c, 'colorBurstB').name('shell mid');
  stab.addColor(c, 'colorBurstC').name('shell outer');

  const fin = folder.addFolder('6 · Final blade');
  R(fin, c, 'finalScale', 0.5, 5, 0.01, 'size (×)');
  R(fin, c, 'finalHover', 0, 2, 0.01, 'extra hang (s)');
  R(fin, c, 'finalCircle', 0.5, 5, 0.01, 'circle (×)');
  R(fin, c, 'finalKill', 0, 8, 0.05, 'strike radius (m)');
  R(fin, c, 'finalShake', 0, 1.5, 0.01, 'shake');
  R(fin, c, 'finalShakeDuration', 0.05, 2, 0.01, 'shake lasts');
  R(fin, c, 'finalFlash', 0, 1.5, 0.01, 'flash');
  R(fin, c, 'finalBurst', 0, 14, 0.05, 'shell (m)');
  R(fin, c, 'finalShock', 0, 16, 0.05, 'shockwave (m)');
  R(fin, c, 'finalSparks', 0, 6, 0.05, 'sparks (×)');
  fin.addColor(c, 'colorFlash').name('flash');

  const linger = folder.addFolder('7 · Linger');
  R(linger, c, 'lingerSink', 0, 0.5, 0.005, 'settles deeper (× length)');
  R(linger, c, 'lingerSinkTime', 0.05, 4, 0.01, 'settles over (s)');
  R(linger, c, 'lingerBreath', 0, 3, 0.01, 'rune breathing');
  R(linger, c, 'lingerBreathRate', 0, 4, 0.01, 'breaths / s');
  R(linger, c, 'wispRate', 0, 200, 1, 'wisps / s per blade');
  R(linger, c, 'wispSize', 0.01, 1, 0.005, 'wisp size');
  R(linger, c, 'wispSpeed', 0, 6, 0.05, 'wisp rise');
  R(linger, c, 'wispLife', 0.1, 4, 0.05, 'wisp life');
  R(linger, c, 'wispBuoyancy', -2, 4, 0.05, 'wisp buoyancy');
  R(linger, c, 'wispGlow', 0, 4, 0.05, 'wisp glow');
  Editor.gradient(linger, c, 'colorWisp', 'wisp gradient');
  R(linger, c, 'crackLead', 0, 3, 0.01, 'cracks show (s) before shatter');
  R(linger, c, 'crackPre', 0, 0.18, 0.005, 'crack strength before shatter');

  const shatter = folder.addFolder('8 · Shatter');
  R(shatter, c, 'shatterTime', 0.05, 3, 0.01, 'per blade (s)');
  R(shatter, c, 'shatterStagger', 0, 0.5, 0.005, 'stagger (s)');
  R(shatter, c, 'shatterCells', 1, 20, 0.1, 'crack cells');
  R(shatter, c, 'shatterCrackGlow', 0, 10, 0.05, 'crack glow');
  R(shatter, c, 'glintCount', 0, 200, 1, 'glints per blade');
  R(shatter, c, 'glintSize', 0.005, 0.3, 0.001, 'glint size');
  R(shatter, c, 'glintSpeed', 0, 12, 0.05, 'glint speed');
  R(shatter, c, 'glintLifetime', 0.05, 3, 0.01, 'glint life');
  R(shatter, c, 'glintGravity', -20, 5, 0.1, 'glint gravity');
  Editor.gradient(shatter, c, 'colorGlint', 'glint gradient');

  folder.close();
  return folder;
}
