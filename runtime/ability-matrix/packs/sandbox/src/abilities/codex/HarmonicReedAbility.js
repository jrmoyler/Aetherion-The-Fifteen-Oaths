import {
  CylinderGeometry,
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
  HARMONIC_SOURCES,
  createReedMaterial,
  createReedLensMaterial,
  createReedShellMaterial,
  createReedFloorMaterial
} from '../../materials/codex/HarmonicReedMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'harmonic';

/** Reeds in a stand — the floor's interference loop is sized to this. */
const MAX_REEDS = HARMONIC_SOURCES;
/** Instance slot of the little reed that skims the line. */
const SPROUT = MAX_REEDS;
const MAX_INSTANCES = MAX_REEDS + 1;
/** Sound shells alive at once. */
const MAX_SHELLS = 96;
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _scale = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
/** The chord's own source at the heart — reused, never allocated per cast. */
const _heart = { x: 0, z: 0, pitch: 0.5, harm: 1 };
const _floorState = { centre: new Vector3(), count: 0, phase: 0, chord: 0, erode: 0, seed: 0 };

/** Push one particle system's gradient and the globals through. */
function syncSystem(p, a, b, cc, d, size, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = size * g.particleSize * 7;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/** 0..1 → 0..1 with an adjustable spring past the end (0 = outCubic). */
function springCurve(k, overshoot) {
  const c1 = Math.max(0, overshoot) * 2.6;
  const t = k - 1;
  return 1 + (c1 + 1) * t * t * t + c1 * t * t;
}

/**
 * HARMONIC REED — Wind, zone cast.
 *
 * A **hum** runs to the circle: a little reed of air skims the line, leaving
 * ripples on the floor. Where it lands a **stand of reeds** sprouts — tall,
 * slender tubes of streaming air laid out on a sunflower spiral, tallest at
 * the heart and shortest at the rim like a pan-pipe turned in on itself,
 * sprouting heart-first round the spiral, each springing up and swaying. Every
 * reed **rings** on its own harmonic: `n` bright node bands up its length
 * (more on the tall ones) that throb, air streaming up inside it, a glowing
 * lip, and every so often it sheds a **sound shell** — a flat ring that leaves
 * its lip and opens outward with interference fringes inside its rim.
 *
 * The floor under the stand shows the reeds *interfering*: each reed is a
 * point source of ripples and the shader sums them, so the circle carries the
 * real moiré of the chord, bright where the waves agree and dark where they
 * cancel.
 *
 * Then the **chord**: every reed rings at once, every node flares, every reed
 * throws a shell and one great ring sweeps out over the circle; an AIR shell,
 * a shockwave, a flash, a jolt; reed fluff is thrown up, and every body in the
 * circle is **lifted** off its feet. The stand rings on, fading, and then
 * **unravels** rim-first, each reed fraying from the top down into motes; the
 * ripples erode.
 *
 * It is not Resonance Pulse (rings travelling a line) nor Tempest/Downburst
 * (one big column): it is a *field* of thin, upright, glowing pipes — a stand
 * of reeds — read as such from twenty metres.
 *
 * ## Layers
 *
 *   1. **the reeds** — one InstancedMesh of open tubes in the bespoke reed
 *      shader (`createReedMaterial`), plus the sprout that skims the line.
 *   2. **the lens** — a second InstancedMesh sharing the geometry and the
 *      instance matrices, on `LAYER.DISTORTION` (`createReedLensMaterial`).
 *   3. **sound shells** — an InstancedMesh of flat rings
 *      (`createReedShellMaterial`), a fixed pool of records.
 *   4. **the interference floor** (`createReedFloorMaterial`).
 *   5. **particles** — motes streaming up the reeds (SOFT, additive), dust
 *      at every sprouting foot (SMOKE), reed fluff on the chord (LEAF).
 *   6. **the beat** — a tick per reed, and the chord: AIR shell, SHOCKWAVE,
 *      DUSTRING, flash, shake, light punch.
 *
 * ## The editor rule
 *
 * A reed record holds dice (height, radius, timing, seed) and its latches;
 * its place on the spiral, size, harmonic, timing and colour are resolved
 * from `settings.harmonic` every frame. A shell record holds where and when
 * it was born and its pitch; its size, life and look are resolved live. The
 * flow and ripple phases are integrated so rate sliders never jump.
 */
export class HarmonicReedAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The chord decides whom it lifts, and when. */
  get handlesOwnHits() {
    return true;
  }

  /** Reeds standing. HUD readout only. */
  get instanceCount() {
    return this._live;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1 + 2: the reeds and their lens ---- */
    this.reedGeometry = new CylinderGeometry(1, 1, 1, 14, 28, true);
    this.reedGeometry.translate(0, 0.5, 0);
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.pitchAttr = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1);
    this.pitchAttr.setUsage(DynamicDrawUsage);
    this.reedGeometry.setAttribute('aState', this.stateAttr);
    this.reedGeometry.setAttribute('aPitch', this.pitchAttr);

    this.reedMaterial = createReedMaterial();
    this.reeds = new InstancedMesh(this.reedGeometry, this.reedMaterial, MAX_INSTANCES);
    this.reeds.instanceMatrix.setUsage(DynamicDrawUsage);
    this.reeds.layers.set(LAYER.VFX);
    this.reeds.renderOrder = 12;
    this.reeds.frustumCulled = false;
    this.reeds.visible = false;
    this.group.add(this.reeds);

    this.lensMaterial = createReedLensMaterial();
    this.lens = new InstancedMesh(this.reedGeometry, this.lensMaterial, MAX_INSTANCES);
    // One set of matrices drives both meshes.
    this.lens.instanceMatrix = this.reeds.instanceMatrix;
    this.lens.layers.set(LAYER.DISTORTION);
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.group.add(this.lens);

    /* ---- layer 3: sound shells ---- */
    this.shellGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.shellAttr = new InstancedBufferAttribute(new Float32Array(MAX_SHELLS * 4), 4);
    this.shellAttr.setUsage(DynamicDrawUsage);
    this.shellGeometry.setAttribute('aShell', this.shellAttr);
    this.shellMaterial = createReedShellMaterial();
    this.shells = new InstancedMesh(this.shellGeometry, this.shellMaterial, MAX_SHELLS);
    this.shells.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shells.layers.set(LAYER.VFX);
    this.shells.renderOrder = 13;
    this.shells.frustumCulled = false;
    this.shells.visible = false;
    this.group.add(this.shells);

    /* ---- layer 4: the interference floor ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createReedFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.layers.set(LAYER.VFX);
    this.floor.renderOrder = 2;
    this.floor.frustumCulled = false;
    this.floor.visible = false;
    this.group.add(this.floor);

    /** Dice and latches only — see the class comment. */
    this.reedRecs = [];
    for (let i = 0; i < MAX_REEDS; i++) {
      this.reedRecs.push({
        hDice: 0,
        rDice: 0,
        tDice: 0,
        seed: 0,
        shellEmitter: new RateEmitter(),
        sprouted: false,
        unravelled: false,
        x: 0,
        z: 0,
        h: 0,
        pitch: 0,
        harm: 2,
        ring: 0
      });
    }
    this.shellRecs = [];
    for (let i = 0; i < MAX_SHELLS; i++) {
      this.shellRecs.push({ x: 0, y: 0, z: 0, born: -1, pitch: 0, big: 0, seed: 0 });
    }
    this._shellCursor = 0;
    this._clock = -1;
    this._flow = 0;
    this._ripple = 0;
    this._turn = 0;
    this._seed = 0;
    this._live = 0;
    this._chorded = false;
    this._travelled = 0;

    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('harmonic.mote', {
      capacity: 2000,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uDrag.value = 0.8;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.15;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.dust = particles.get('harmonic.dust', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.6
    });
    this.dust.uniforms.uDrag.value = 1.6;
    this.dust.uniforms.uEndSize.value = 2.0;
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.fluff = particles.get('harmonic.fluff', {
      capacity: 600,
      shape: ParticleShape.LEAF,
      additive: false,
      lit: true,
      swirl: true,
      softFade: 0.2
    });
    this.fluff.uniforms.uDrag.value = 1.4;
    this.fluff.uniforms.uEndSize.value = 0.8;
    this.fluff.uniforms.uSizeIn.value = 0.05;
    this.fluff.uniforms.uFadeIn.value = 0.05;
    this.fluff.uniforms.uFadeOut.value = 0.4;

    this.moteEmitter = new RateEmitter();
    this.travelEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _reedCount() {
    return Math.max(1, Math.min(MAX_REEDS, Math.round(settings[ID].reedCount)));
  }

  /** Seconds after landing that reed `i` sprouts (spiral order, heart first). */
  _startOf(i, rec, c, g) {
    const n = this._reedCount();
    return (Math.max(0, c.sproutDelay) + (i / n) * Math.max(0, c.sproutSpread) + rec.tDice * 0.05 * g.randomness) * g.lifetime;
  }

  _chordAt() {
    const c = settings[ID];
    return Math.max(0, c.chordTime) * settings.global.lifetime;
  }

  get impactDuration() {
    const c = settings[ID];
    return this._chordAt() + Math.max(0.05, c.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    const c = settings[ID];
    const g = settings.global;
    return Math.max(0.05, (Math.max(0, c.unravelSpread) + Math.max(0.05, c.unravelTime) + Math.max(0.05, c.groundFade)) * g.lifetime);
  }

  /** The light throbs with the stand. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.5 + f * 0.5 * Math.sin(this.age * 11.0) * Math.sin(this.age * 4.3 + 0.7);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._flow = 0;
    this._ripple = 0;
    this._seed = Math.random() * 10;
    this._turn = Math.random() * TAU;
    this._live = 0;
    this._chorded = false;
    this._travelled = 0;
    this._shellCursor = 0;
    this.moteEmitter.reset();
    this.travelEmitter.reset();
    for (let i = 0; i < MAX_REEDS; i++) {
      const r = this.reedRecs[i];
      r.hDice = Math.random();
      r.rDice = Math.random();
      r.tDice = Math.random();
      r.seed = Math.random();
      r.shellEmitter.reset();
      // Stagger the first shell so the stand does not tick in unison.
      r.shellEmitter.tick(Math.random(), 1);
      r.sprouted = false;
      r.unravelled = false;
      r.h = 0;
      r.ring = 0;
    }
    for (let i = 0; i < MAX_SHELLS; i++) this.shellRecs[i].born = -1;
    this.stateAttr.array.fill(0);
    this.stateAttr.needsUpdate = true;
    this.shellAttr.array.fill(0);
    this.shellAttr.needsUpdate = true;
    for (let i = 0; i < MAX_INSTANCES; i++) this.reeds.setMatrixAt(i, _zero);
    for (let i = 0; i < MAX_SHELLS; i++) this.shells.setMatrixAt(i, _zero);
    this.reeds.instanceMatrix.needsUpdate = true;
    this.shells.instanceMatrix.needsUpdate = true;
    this.reeds.visible = false;
    this.lens.visible = false;
    this.shells.visible = false;
    this.floor.visible = false;
  }

  _sync(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._flow += dt * c.flowSpeed * g.noiseSpeed;
    this._ripple += dt * c.rippleSpeed * g.noiseSpeed;
    this.reedMaterial.userData.sync(this._flow);
    this.lensMaterial.userData.sync();
    this.shellMaterial.userData.sync();

    syncSystem(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteSize, 2.5 * g.glow, 0.3);
    this.motes.uniforms.uGravity.value.set(0, 1.5, 0);
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.5);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.2, 0);
    syncSystem(this.fluff, c.colorLeafA, c.colorLeafB, c.colorLeafC, c.colorLeafD, c.leafSize, 1, 0.8);
    this.fluff.uniforms.uGravity.value.set(0, -1.2, 0);
  }

  /* ------------------------------------------------------------------ */
  /* The stand                                                           */
  /* ------------------------------------------------------------------ */

  /** Place reed `i` on the spiral and resolve its size; written into `rec`. */
  _placeReed(i, rec, c, g, R) {
    const n = this._reedCount();
    const t = Math.sqrt((i + 0.5) / n);
    const rad = t * Math.max(0.1, c.reedSpread) * R;
    const a = this._turn + i * GOLDEN;
    this.pointAt(1, _centre);
    rec.x = _centre.x + Math.cos(a) * rad;
    rec.z = _centre.z + Math.sin(a) * rad;
    const share = saturate(rad / R);
    const jitter = 1 + (rec.hDice - 0.5) * 2 * c.heightJitter * g.randomness;
    const full = Math.max(0.2, lerp(c.heightCentre, c.heightRim, share) * jitter);
    const hMax = Math.max(c.heightCentre, c.heightRim, 0.2);
    rec.pitch = 1 - saturate((full - Math.min(c.heightCentre, c.heightRim)) / Math.max(0.01, Math.abs(c.heightCentre - c.heightRim)));
    rec.harm = Math.round(lerp(c.harmonicMin, c.harmonicMax, saturate(full / hMax)));
    return full;
  }

  _updateStand(dt) {
    const c = settings[ID];
    const g = settings.global;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const R = Math.max(0.5, c.zoneRadius);
    const n = this._reedCount();
    const state = this.stateAttr.array;
    const pitch = this.pitchAttr.array;
    const growT = Math.max(0.03, c.growTime * g.lifetime);
    const chordAt = this._chordAt();
    const sinceChord = clock - chordAt;
    const chordGlow = clock >= chordAt ? Math.exp(-sinceChord * 3) : 0;
    const uSpread = Math.max(0, c.unravelSpread) * g.lifetime;
    const uTime = Math.max(0.05, c.unravelTime) * g.lifetime;
    const sources = this.floorMaterial.uniforms.uSources.value;
    let live = 0;

    for (let i = 0; i < MAX_REEDS; i++) {
      const rec = this.reedRecs[i];
      if (i >= n || clock < 0) {
        this.reeds.setMatrixAt(i, _zero);
        sources[i].set(0, 0, 0, 0);
        continue;
      }
      const full = this._placeReed(i, rec, c, g, R);
      const start = this._startOf(i, rec, c, g);
      const k = saturate((clock - start) / growT);
      let grow = k > 0 ? springCurve(k, c.growOvershoot) : 0;
      if (k > 0 && !rec.sprouted) {
        rec.sprouted = true;
        this._sproutFx(rec, c, g, full);
      }

      let unravel = 0;
      if (fading) {
        // Rim first, the heart last.
        const order = 1 - i / Math.max(1, n - 1);
        unravel = saturate((ft - order * uSpread) / uTime);
        if (unravel > 0 && !rec.unravelled) {
          rec.unravelled = true;
          this._unravelFx(rec, c, g);
        }
        grow *= 1 - Easing.inQuad(unravel) * 0.3;
      }

      /* --- shells, and how hard it rings --- */
      rec.ring = Math.max(0, rec.ring - dt * 3);
      if (k >= 1 && unravel <= 0) {
        const shells = rec.shellEmitter.tick(dt, c.shellRate);
        if (shells > 0) {
          rec.ring = 1;
          this._spawnShell(rec, full * grow, 0);
        }
      }
      const ringing = k > 0 ? c.idleRing + rec.ring * c.ringPulse + chordGlow * c.chordRing : 0;

      rec.h = full * grow;
      const radius = lerp(c.radiusMin, c.radiusMax, saturate(full / Math.max(0.2, c.heightCentre))) * (0.85 + 0.3 * rec.rDice);
      if (grow <= 0.001 || unravel >= 0.999) {
        this.reeds.setMatrixAt(i, _zero);
      } else {
        _q.identity();
        _pos.set(rec.x, 0, rec.z);
        _scale.set(radius, rec.h, radius);
        _m.compose(_pos, _q, _scale);
        this.reeds.setMatrixAt(i, _m);
        live++;
      }
      const i4 = i * 4;
      state[i4] = rec.seed;
      state[i4 + 1] = rec.harm;
      state[i4 + 2] = ringing * (1 - unravel);
      state[i4 + 3] = unravel;
      pitch[i] = rec.pitch;

      // Every reed is a ripple source on the floor, as loud as it rings.
      sources[i].set(rec.x, rec.z, k > 0 ? (0.4 + ringing * 0.5) * (1 - unravel) : 0, rec.seed * TAU);
    }

    /* --- the chord --- */
    if (!this._chorded && clock >= chordAt) {
      this._chorded = true;
      this._chord(c, g);
    }

    this._updateSprout(c, g);
    this._live = live;
    this.reeds.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
    this.pitchAttr.needsUpdate = true;
    this.reeds.visible = live > 0 || this.phase === AbilityPhase.TRAVEL;
    this.lens.visible = this.reeds.visible;

    this._updateShells(c, g);

    /* --- the floor --- */
    if (clock >= 0) {
      let erode = 0;
      if (fading) {
        const fd = this.fadeDuration;
        const gf = Math.max(0.05, c.groundFade * g.lifetime);
        erode = saturate((ft - (fd - gf)) / gf);
      }
      this.pointAt(1, _centre);
      _floorState.centre.copy(_centre);
      _floorState.count = n;
      _floorState.phase = this._ripple;
      _floorState.chord = chordGlow;
      _floorState.erode = erode;
      _floorState.seed = this._seed;
      this.floorMaterial.userData.sync(_floorState);
      this.floor.visible = erode < 1;
      if (dt > 0 && live > 0) this._moteFx(dt, c, g);
    } else {
      this.floor.visible = false;
    }
  }

  /** The little reed skimming the line during the travel. */
  _updateSprout(c, g) {
    const state = this.stateAttr.array;
    if (this.phase !== AbilityPhase.TRAVEL) {
      this.reeds.setMatrixAt(SPROUT, _zero);
      return;
    }
    const born = Easing.outBack(saturate(this.age / 0.15));
    _q.identity();
    _pos.copy(this.position).setY(0);
    _scale.set(c.sproutRadius, Math.max(0.05, c.sproutHeight * born), c.sproutRadius);
    _m.compose(_pos, _q, _scale);
    this.reeds.setMatrixAt(SPROUT, _m);
    const i4 = SPROUT * 4;
    state[i4] = 0.37;
    state[i4 + 1] = 2;
    state[i4 + 2] = 1.2 + 0.4 * Math.sin(this.age * 30);
    state[i4 + 3] = 0;
    this.pitchAttr.array[SPROUT] = 0.5;
  }

  /* ------------------------------------------------------------------ */
  /* Sound shells                                                        */
  /* ------------------------------------------------------------------ */

  _spawnShell(rec, height, big) {
    const s = this.shellRecs[this._shellCursor];
    this._shellCursor = (this._shellCursor + 1) % MAX_SHELLS;
    s.x = rec.x;
    s.z = rec.z;
    // Most leave the lip; some leave a node partway down.
    const node = big > 0 ? 1 : Math.random() < 0.6 ? 1 : (1 + ((Math.random() * Math.max(1, rec.harm - 1)) | 0)) / rec.harm;
    s.y = Math.max(0.05, height * node);
    s.born = this.age;
    s.pitch = rec.pitch;
    s.big = big;
    s.seed = Math.random();
  }

  _updateShells(c, g) {
    const data = this.shellAttr.array;
    const life = Math.max(0.05, c.shellLife * g.lifetime);
    let any = false;
    for (let i = 0; i < MAX_SHELLS; i++) {
      const s = this.shellRecs[i];
      const age = s.born < 0 ? -1 : this.age - s.born;
      const sLife = s.big > 0 ? life * 1.6 : life;
      if (age < 0 || age > sLife) {
        this.shells.setMatrixAt(i, _zero);
        data[i * 4 + 1] = 0;
        continue;
      }
      const p = age / sLife;
      const size = (s.big > 0 ? c.chordShellSize * g.explosionIntensity : c.shellSize) * Easing.outCubic(p) + 0.05;
      _q.identity();
      _pos.set(s.x, s.y, s.z);
      _scale.set(size, 1, size);
      _m.compose(_pos, _q, _scale);
      this.shells.setMatrixAt(i, _m);
      data[i * 4] = p;
      data[i * 4 + 1] = s.big > 0 ? 1.6 : 1;
      data[i * 4 + 2] = s.pitch;
      data[i * 4 + 3] = s.seed;
      any = true;
    }
    this.shells.instanceMatrix.needsUpdate = true;
    this.shellAttr.needsUpdate = true;
    this.shells.visible = any;
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _lift(c, g) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    this.pointAt(1, _centre);
    const power = g.explosionIntensity;
    const found = field.findTargets(_centre.x, _centre.z, Math.max(0.5, c.zoneRadius) + 0.3, this._targets);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _fillEmit(position, radius, direction, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  _sproutFx(rec, c, g, full) {
    const n = g.particleCount;
    this._fillEmit(_pos.set(rec.x, 0.2, rec.z), 0.3, _up, 1.2, 1, 0.45, c.dustLife, 0.5);
    this.dust.emit(Math.round(c.dustCount * n), _emit);
    this._fillEmit(_pos.set(rec.x, 0.1, rec.z), 0.1, _up, c.moteSpeed * 2, 0.15, 0.06, c.moteLife, 0);
    this.motes.emit(Math.round(10 * n), _emit);
    this._spawnShell(rec, 0.08, 0);
    this.ctx.shake.add(c.sproutShake * g.explosionIntensity, 8, 26);
    this.lightBoost = Math.max(this.lightBoost, c.impactLight * 0.1 * g.explosionIntensity);
    rec.ring = 1;
    rec.h = full * 0.01;
  }

  _unravelFx(rec, c, g) {
    this._fillEmit(_pos.set(rec.x, rec.h * 0.6, rec.z), Math.max(0.2, rec.h * 0.3), _up, c.moteSpeed, 0.6, 0.06, c.moteLife * 1.3, 0);
    this.motes.emit(Math.round(24 * g.particleCount), _emit);
  }

  _chord(c, g) {
    const power = g.explosionIntensity;
    this.pointAt(1, _centre);
    const n = this._reedCount();
    for (let i = 0; i < n; i++) {
      const rec = this.reedRecs[i];
      if (rec.h > 0.05) this._spawnShell(rec, rec.h, 0);
    }
    _heart.x = _centre.x;
    _heart.z = _centre.z;
    this._spawnShell(_heart, 1.2, 1);
    this.ctx.shake.add(c.chordShake * power, 3.5, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.chordFlash * power);
    this.lightBoost = c.impactLight * power;
    this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_centre).setY(1.4), {
      radius: 0.5,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.5,
      opacity: 0.75 * g.opacity,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius,
      life: 1.4,
      intensity: 0.8,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.45,
      height: 0.025
    });
    this._fillEmit(_pos.copy(_centre).setY(0.4), Math.max(0.5, c.zoneRadius * 0.7), _up, c.leafSpeed, 0.7, 0.12, c.leafLife, 6);
    this.fluff.emit(Math.round(c.leafCount * g.particleCount), _emit);
    this._lift(c, g);
  }

  _moteFx(dt, c, g) {
    const count = Math.round(this.moteEmitter.tick(dt, c.moteRate) * g.particleCount);
    if (count <= 0) return;
    const n = this._reedCount();
    this._fillEmit(_pos, 0.04, _up, c.moteSpeed, 0.05, 0.05, c.moteLife, 0);
    for (let k = 0; k < count; k++) {
      const rec = this.reedRecs[(Math.random() * n) | 0];
      if (rec.h <= 0.1) continue;
      _pos.set(rec.x, Math.random() * rec.h * 0.8, rec.z);
      _emit.position = _pos;
      _emit.tint = getColor(rec.pitch < 0.5 ? c.colorMoteB : c.colorMoteD);
      this.motes.emit(1, _emit);
    }
    _emit.tint = null;
  }

  /** The hum: ripples dropped on the floor, motes off the little reed. */
  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const spacing = Math.max(0.2, c.travelRippleSpacing);
    while (this.front - this._travelled >= spacing) {
      this._travelled += spacing;
      this.pointAt(saturate(this._travelled / this.length), _pos);
      this.ctx.decals.spawn(DecalType.RIPPLE, _pos, {
        radius: c.travelRippleRadius,
        life: 0.8,
        intensity: 0.8,
        colorA: getColor(c.colorReedB),
        colorB: getColor(c.colorReedA),
        width: 0.08,
        height: 0.02
      });
    }
    const count = Math.round(this.travelEmitter.tick(dt, c.travelMotes) * g.particleCount);
    if (count > 0) {
      this._fillEmit(_pos.copy(this.position).setY(c.sproutHeight * 0.5), 0.2, _up, c.moteSpeed * 0.6, 0.6, 0.05, c.moteLife * 0.7, 0);
      this.motes.emit(count, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._sync(dt);
    this._travelFx(dt);
    this._updateStand(dt);
    this.position.y = 0.5;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this._clock = 0;
    this.pointAt(1, _centre);
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: c.zoneRadius,
      life: 1.0,
      intensity: 1,
      colorA: getColor(c.colorReedB),
      colorB: getColor(c.colorReedA),
      width: 0.1,
      height: 0.02
    });
    this.lightBoost = c.impactLight * 0.25 * g.explosionIntensity;
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._sync(dt);
    this._updateStand(dt);
    this.pointAt(1, _centre);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._live = 0;
    for (let i = 0; i < MAX_SHELLS; i++) this.shellRecs[i].born = -1;
    this.reeds.visible = false;
    this.lens.visible = false;
    this.shells.visible = false;
    this.floor.visible = false;
  }

  dispose() {
    this.reedGeometry.dispose();
    this.shellGeometry.dispose();
    this.floorGeometry.dispose();
    this.reedMaterial.dispose();
    this.lensMaterial.dispose();
    this.shellMaterial.dispose();
    this.floorMaterial.dispose();
    this.reeds.dispose();
    this.shells.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('𝄞  Harmonic Reed');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'hum speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const hum = folder.addFolder('0 · The hum');
  R(hum, c, 'sproutHeight', 0.1, 3, 0.01, 'skimming reed (m)');
  R(hum, c, 'sproutRadius', 0.02, 0.5, 0.005, 'its radius (m)');
  R(hum, c, 'travelRippleSpacing', 0.2, 5, 0.05, 'ripple spacing (m)');
  R(hum, c, 'travelRippleRadius', 0.1, 4, 0.05, 'ripple radius (m)');
  R(hum, c, 'travelMotes', 0, 400, 1, 'motes / s');

  const time = folder.addFolder('Timing');
  R(time, c, 'sproutDelay', 0, 1.5, 0.01, 'first reed after (s)');
  R(time, c, 'sproutSpread', 0, 3, 0.01, 'spiral sprouts over (s)');
  R(time, c, 'growTime', 0.03, 2, 0.01, 'one reed grows over (s)');
  R(time, c, 'growOvershoot', 0, 1, 0.01, 'overshoot');
  R(time, c, 'chordTime', 0, 4, 0.01, 'chord after (s)');
  R(time, c, 'lifetime', 0.05, 8, 0.05, 'rings on for (s)');
  R(time, c, 'unravelSpread', 0, 3, 0.01, 'unravel spread (s)');
  R(time, c, 'unravelTime', 0.05, 2, 0.01, 'one reed unravels over (s)');
  R(time, c, 'groundFade', 0.05, 3, 0.05, 'floor erodes over (s)');

  const shape = folder.addFolder('1 · Stand shape');
  R(shape, c, 'reedCount', 1, MAX_REEDS, 1, 'reeds');
  R(shape, c, 'reedSpread', 0.1, 1, 0.01, 'stand radius (× circle)');
  R(shape, c, 'heightCentre', 0.2, 10, 0.05, 'heart height (m)');
  R(shape, c, 'heightRim', 0.2, 10, 0.05, 'rim height (m)');
  R(shape, c, 'heightJitter', 0, 0.6, 0.01, 'height jitter');
  R(shape, c, 'radiusMin', 0.02, 0.8, 0.005, 'thinnest (m)');
  R(shape, c, 'radiusMax', 0.02, 0.8, 0.005, 'thickest (m)');
  R(shape, c, 'harmonicMin', 1, 12, 1, 'harmonic, short reeds');
  R(shape, c, 'harmonicMax', 1, 12, 1, 'harmonic, tall reeds');
  R(shape, c, 'swayAmp', 0, 1, 0.01, 'sway');
  R(shape, c, 'swayRate', 0, 6, 0.05, 'sways / s');

  const look = folder.addFolder('2 · Reed look');
  R(look, c, 'flowSpeed', 0, 12, 0.05, 'flow up (m/s)');
  R(look, c, 'flowScale', 0.2, 10, 0.05, 'flow scale');
  R(look, c, 'rimGlow', 0, 8, 0.05, 'wall glow');
  R(look, c, 'coreGlow', 0, 3, 0.01, 'body glow');
  R(look, c, 'nodeGlow', 0, 10, 0.05, 'node glow');
  R(look, c, 'nodeWidth', 0.005, 0.3, 0.005, 'node width');
  R(look, c, 'lipGlow', 0, 10, 0.05, 'lip glow');
  R(look, c, 'idleRing', 0, 2, 0.01, 'idle ring');
  R(look, c, 'ringPulse', 0, 5, 0.05, 'ring per shell');
  R(look, c, 'chordRing', 0, 8, 0.05, 'ring on the chord');
  R(look, c, 'unravelEdge', 0.005, 0.3, 0.005, 'fray edge');
  R(look, c, 'reedOpacity', 0, 2, 0.01, 'opacity');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  look.addColor(c, 'colorReedA').name('highlights');
  look.addColor(c, 'colorReedB').name('low pitch');
  look.addColor(c, 'colorReedC').name('mid pitch');
  look.addColor(c, 'colorReedD').name('high pitch');
  const lens = look.addFolder('Lens (distortion)');
  R(lens, c, 'lensWarp', 0, 3, 0.01, 'strength');
  R(lens, c, 'lensScale', 0.5, 5, 0.05, 'fatness (×)');

  const shells = folder.addFolder('3 · Sound shells');
  R(shells, c, 'shellRate', 0, 8, 0.05, 'shells / s per reed');
  R(shells, c, 'shellSize', 0.1, 6, 0.05, 'opens to (m)');
  R(shells, c, 'shellLife', 0.05, 3, 0.01, 'lifetime (s)');
  R(shells, c, 'shellWidth', 0.005, 0.3, 0.005, 'rim sharpness');
  R(shells, c, 'shellFringes', 0, 8, 0.1, 'fringes');
  R(shells, c, 'shellGlow', 0, 8, 0.05, 'glow');
  R(shells, c, 'chordShellSize', 0.5, 15, 0.05, 'chord ring (m)');

  const floor = folder.addFolder('4 · Interference floor');
  R(floor, c, 'rippleWavelength', 0.1, 4, 0.01, 'wavelength (m)');
  R(floor, c, 'rippleSpeed', 0, 30, 0.1, 'speed');
  R(floor, c, 'rippleGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'rippleDark', 0, 1, 0.01, 'trough darkening');
  floor.addColor(c, 'colorGroundA').name('crests');
  floor.addColor(c, 'colorGroundB').name('troughs');

  const parts = folder.addFolder('5 · Particles');
  R(parts, c, 'moteRate', 0, 500, 1, 'motes / s');
  R(parts, c, 'moteSize', 0.005, 0.3, 0.005, 'mote size');
  R(parts, c, 'moteSpeed', 0, 10, 0.05, 'mote speed');
  R(parts, c, 'moteLife', 0.1, 3, 0.05, 'mote lifetime');
  Editor.gradient(parts, c, 'colorMote', 'mote colour');
  R(parts, c, 'dustCount', 0, 20, 1, 'dust per reed');
  R(parts, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(parts, c, 'dustLife', 0.1, 5, 0.05, 'dust lifetime');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'leafCount', 0, 200, 1, 'fluff on the chord');
  R(parts, c, 'leafSize', 0.01, 0.5, 0.005, 'fluff size');
  R(parts, c, 'leafSpeed', 0, 15, 0.1, 'fluff speed');
  R(parts, c, 'leafLife', 0.1, 5, 0.05, 'fluff lifetime');
  Editor.gradient(parts, c, 'colorLeaf', 'fluff colour');

  const beat = folder.addFolder('6 · The chord');
  R(beat, c, 'sproutShake', 0, 0.5, 0.005, 'tick per reed');
  R(beat, c, 'chordShake', 0, 2, 0.01, 'chord jolt');
  R(beat, c, 'chordFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'air shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, fringe');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');

  const hit = folder.addFolder('7 · Bodies');
  R(hit, c, 'hitLift', 0, 25, 0.1, 'lift');
  R(hit, c, 'hitImpulse', 0, 15, 0.1, 'outward');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 8, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'throb');
  R(light, c, 'impactLight', 0, 60, 0.5, 'light punch');
}
