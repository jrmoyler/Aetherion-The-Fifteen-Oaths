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
import { createNeedleGeometry, createSpineGeometry, createGlintGeometry } from '../../assets/codex/RimeHaloGeometry.js';
import {
  createNeedleMaterial,
  createSpineMaterial,
  createGlintMaterial,
  createRimeFloorMaterial,
  createColdBandMaterial
} from '../../materials/codex/RimeHaloMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'rimehalo';

/** Hard ceiling on needles. The editor's slider clamps to this. */
const MAX_NEEDLES = 192;
/** Dice per needle: bearing jitter, length, tilt, fall, tumble. */
const DICE = 5;
/** Bodies one halo can hold frozen. */
const MAX_FROZEN = 12;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _tan = new Vector3();
const _rad = new Vector3();
const _centre = new Vector3();
const _head = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);

const _spineState = { centre: new Vector3(), radius: 4, spin: 0, start: 0, reveal: 0, intensity: 1 };
const _glintState = { pos: new Vector3(), size: 1, roll: 0, intensity: 1 };
const _floorState = { centre: new Vector3(), radius: 4, halo: 4, reveal: 0, start: 0, spin: 0, seed: 0, star: 0, erode: 0 };
const _needleState = { charge: 0 };
const _coldState = { strength: 0 };

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

/**
 * RIME HALO — Frost, zone cast.
 *
 * A cold glint skates along the floor to the circle. At the rim it becomes
 * **the head** — a four-point star of light — and **walks once round the
 * circle**, and behind it, one after another, **ice needles crystallise in
 * the air**: two rows of long faceted spears hanging from a thread of light
 * at chest height, every one pointing in at the middle. The ring closes on
 * itself and **spins up**, needles flashing, cold air pouring off it. Then
 * it **tightens like a noose**: the halo closes on the middle, faster and
 * faster, sinking as it goes, spinning harder, dragging a skin of rime in
 * across the floor behind it — and **whatever it closes on freezes**: the
 * body goes to ice and is yanked off its feet toward the middle. At the
 * centre the needles cross into a **bristling star knot**; it locks with a
 * flash and a crack, a crystal star printed on the floor beneath it. Then
 * the needles **drop and sublime**, tumbling, glittering, and the rime goes.
 *
 * Upgrade: the spears are solid hexagonal crystals raised `needleRise` above
 * the horizontal so the ring reads as a crown of spikes at 8 m, each coloured
 * on a four-stop ramp (blue-black root → glacier blue → pale → white point);
 * the cold-air distortion is kept under the crown so it no longer smears them
 * into a glassy band, and the close eases in at power 1.35 so it visibly
 * tightens.
 *
 * Distinct from the other frost on purpose: nothing comes up out of the
 * floor (Ice, Glacier Crown, Permafrost), nothing travels down a line
 * (Avalanche, Glacial Shard Storm). This is a ring in the *air*, and its one
 * motion is closing.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the needles** — one InstancedMesh of lathed six-facet spears in
 *      `createNeedleMaterial` (opaque, `LAYER.WORLD`): a lit filament, a
 *      burning point, a crystallise flash and a tip-first dissolve via a
 *      per-instance `aState`.
 *   2. **the spine & head** — a torus rebuilt in its vertex stage from the
 *      live halo radius (so the tube stays a thread however far it closes),
 *      revealed behind the head; the head a billboarded star.
 *   3. **the rime floor** — swept rime dragged round the circle between the
 *      halo and the rim, a track under the ring, the crystal star.
 *   4. **cold air** — an open cylinder under the ring on
 *      `LAYER.DISTORTION`, and SMOKE pouring off the ring.
 *   5. **sparks & glitter** — STREAK sparks off the head, SOFT glitter as
 *      needles crystallise and sublime, CHIP ice at the lock.
 *   6. **the beat** — a rumble that grows as it closes; a FROST burst, a
 *      SHOCKWAVE, flash, shake and a light punch at the lock.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. A standing body is caught the moment the halo's radius
 * comes within `hitReach` of it: it is killed with a pull toward the middle
 * and stained to ice over `freezeTime` (`corrode`, monotonic, safe on the
 * corpse). Anything still standing at the very heart is caught at the lock.
 *
 * ## The editor rule
 *
 * Needle records are dice only. The radius, height, spin, lengths, timing
 * and colours are resolved from `settings.rimehalo` every frame; the spin is
 * the one integrated phase.
 */
export class RimeHaloAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.needles.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the needles ---- */
    this.needleGeometry = createNeedleGeometry();
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_NEEDLES * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.needleGeometry.setAttribute('aState', this.stateAttr);
    this.needleMaterial = createNeedleMaterial();
    this.needles = new InstancedMesh(this.needleGeometry, this.needleMaterial, MAX_NEEDLES);
    this.needles.name = 'RimeHaloNeedles';
    this.needles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.needles.layers.set(LAYER.WORLD);
    this.needles.castShadow = true;
    this.needles.frustumCulled = false;
    this.needles.count = 0;
    this.needles.visible = false;
    this.group.add(this.needles);
    this.dice = new Float32Array(MAX_NEEDLES * DICE);

    /* ---- layer 2: spine & head ---- */
    this.spineGeometry = createSpineGeometry();
    this.spineMaterial = createSpineMaterial();
    this.spine = new Mesh(this.spineGeometry, this.spineMaterial);
    this.spine.name = 'RimeHaloSpine';
    this.spine.frustumCulled = false;
    this.spine.renderOrder = 5;
    this.spine.visible = false;
    this.group.add(this.spine);

    this.glintGeometry = createGlintGeometry();
    this.glintMaterial = createGlintMaterial();
    this.glint = new Mesh(this.glintGeometry, this.glintMaterial);
    this.glint.name = 'RimeHaloHead';
    this.glint.frustumCulled = false;
    this.glint.renderOrder = 6;
    this.glint.visible = false;
    this.group.add(this.glint);

    /* ---- layer 3: the rime floor ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createRimeFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'RimeHaloFloor';
    this.floor.frustumCulled = false;
    this.floor.renderOrder = 2;
    this.floor.visible = false;
    this.group.add(this.floor);

    /* ---- layer 4: cold air ---- */
    this.coldGeometry = new CylinderGeometry(1, 1, 1, 64, 1, true);
    this.coldGeometry.translate(0, 0.5, 0);
    this.coldMaterial = createColdBandMaterial();
    this.cold = new Mesh(this.coldGeometry, this.coldMaterial);
    this.cold.name = 'RimeHaloColdAir';
    this.cold.layers.set(LAYER.DISTORTION);
    this.cold.frustumCulled = false;
    this.cold.visible = false;
    this.group.add(this.cold);

    this._seed = 0;
    this._start = 0;
    this._spin = 0;
    this._travelled = 0;
    this._locked = false;
    this._haloR = 0;
    this._haloY = 0;
    this._frozen = [];
    for (let i = 0; i < MAX_FROZEN; i++) this._frozen.push({ dummy: null, at: 0 });
    this._frozenCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('rimehalo.spark', { capacity: 1800, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.2 });
    this.sparks.uniforms.uDrag.value = 2.2;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.glitter = particles.get('rimehalo.glitter', { capacity: 2000, shape: ParticleShape.SOFT, additive: true, softFade: 0.2 });
    this.glitter.uniforms.uDrag.value = 1.4;
    this.glitter.uniforms.uEndSize.value = 0.3;
    this.glitter.uniforms.uSizeIn.value = 0.05;
    this.glitter.uniforms.uFadeIn.value = 0.05;
    this.glitter.uniforms.uFadeOut.value = 0.5;

    this.mist = particles.get('rimehalo.mist', { capacity: 900, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.6 });
    this.mist.uniforms.uDrag.value = 1.2;
    this.mist.uniforms.uEndSize.value = 2.2;
    this.mist.uniforms.uSizeIn.value = 0.15;
    this.mist.uniforms.uFadeIn.value = 0.12;
    this.mist.uniforms.uFadeOut.value = 0.6;

    this.chips = particles.get('rimehalo.chip', { capacity: 1200, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.chips.uniforms.uDrag.value = 0.4;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.01;
    this.chips.uniforms.uFadeOut.value = 0.3;

    this.sparkEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _T(x) {
    return Math.max(0.03, x * settings.global.lifetime);
  }

  get impactDuration() {
    const c = settings[ID];
    return this._T(c.walkTime) + this._T(c.spinTime) + this._T(c.closeTime) + this._T(c.lockTime);
  }

  get fadeDuration() {
    const c = settings[ID];
    return this._T(c.shatterTime) + this._T(c.lifetime);
  }

  lightShimmer() {
    return 0.85 + 0.15 * Math.sin(this.age * 23.0) * Math.sin(this.age * 5.1);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    // The walk sets off from the point of the rim nearest the caster.
    this._start = Math.atan2(-this.direction.z, -this.direction.x);
    this._spin = 0;
    this._travelled = 0;
    this._locked = false;
    this._frozenCount = 0;
    for (let i = 0; i < MAX_FROZEN; i++) this._frozen[i].dummy = null;
    this._found.length = 0;
    this.sparkEmitter.reset();
    this.mistEmitter.reset();
    this.trailEmitter.reset();
    for (let i = 0; i < MAX_NEEDLES * DICE; i++) this.dice[i] = Math.random();
    for (let i = 0; i < MAX_NEEDLES; i++) this.needles.setMatrixAt(i, _zero);
    this.needles.instanceMatrix.needsUpdate = true;
    this.stateAttr.array.fill(0);
    this.stateAttr.needsUpdate = true;
    this.needles.count = 0;
    this.needles.visible = false;
    this.spine.visible = false;
    this.glint.visible = false;
    this.floor.visible = false;
    this.cold.visible = false;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.sparks, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.sparkSize, 2.2 * g.glow, 0.1);
    this.sparks.uniforms.uGravity.value.set(0, -3, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    syncSystem(this.glitter, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.glitterSize, 2.0 * g.glow, 0.3);
    this.glitter.uniforms.uGravity.value.set(0, -0.6, 0);
    syncSystem(this.mist, c.colorMistA, c.colorMistB, c.colorMistC, c.colorMistD, c.mistSize, 1, 0.5);
    this.mist.uniforms.uOpacity.value = c.mistOpacity * g.opacity;
    this.mist.uniforms.uGravity.value.set(0, -0.35, 0);
    syncSystem(this.chips, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.chipSize, 1, 0.05);
    this.chips.uniforms.uGravity.value.set(0, c.chipGravity, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _updateHalo(dt) {
    const c = settings[ID];
    const g = settings.global;
    const fading = this.phase === AbilityPhase.FADE;
    const t = fading ? this.impactDuration + this.fadeTime : this.impactTime;
    const ft = fading ? this.fadeTime : 0;
    const R = Math.max(0.5, c.zoneRadius);

    const walkT = this._T(c.walkTime);
    const spinT = this._T(c.spinTime);
    const closeT = this._T(c.closeTime);
    const spinStart = walkT;
    const closeStart = walkT + spinT;
    const lockStart = closeStart + closeT;
    const shatterT = this._T(c.shatterTime);

    const kw = saturate(t / walkT);
    const ks = saturate((t - spinStart) / spinT);
    const kc = saturate((t - closeStart) / closeT);
    const kl = saturate((t - lockStart) / this._T(c.lockTime));
    const kf = fading ? saturate(ft / shatterT) : 0;

    /* --- the walk, the spin, the close --- */
    const reveal = TAU * Easing.inOutQuad(kw);
    let omega = 0;
    if (t >= spinStart && t < closeStart) omega = c.spinStart * (1 + ks);
    else if (t >= closeStart && t < lockStart) omega = lerp(c.spinStart * 2, c.spinMax, Easing.inQuad(kc));
    else if (t >= lockStart) omega = c.spinMax * Math.exp(-(t - lockStart) * 4) * (1 - kf);
    this._spin += omega * g.animationSpeed * dt;

    const close = Math.pow(kc, Math.max(0.2, c.closeEase));
    const Rh = lerp(R, Math.max(0.05, c.closeRadius), close);
    const H = c.haloHeight + c.haloBob * Math.sin(t * 3.1) - c.closeDrop * Easing.inOutQuad(kc);
    this._haloR = Rh;
    this._haloY = H;
    this.pointAt(1, _centre);

    /* --- the needles --- */
    const charge = Math.max(kc * 0.8, t >= lockStart ? Math.exp(-(t - lockStart) * 3) * 1.5 : 0);
    _needleState.charge = charge;
    this.needleMaterial.userData.sync(_needleState);
    this._updateNeedles(c, g, reveal, walkT, Rh, H, ft, kf, t >= lockStart ? Math.exp(-(t - lockStart) * 9) : 0);

    /* --- the spine --- */
    const spineFade = (1 - smoothstep(0.85, 1, kc)) * (1 - kf);
    _spineState.centre.set(_centre.x, H, _centre.z);
    _spineState.radius = Rh;
    _spineState.spin = this._spin;
    _spineState.start = this._start;
    _spineState.reveal = reveal;
    _spineState.intensity = spineFade * (0.7 + 0.6 * kc);
    this.spineMaterial.userData.sync(_spineState);
    this.spine.visible = spineFade > 0.01;

    /* --- the head --- */
    const headIn = smoothstep(0, 0.08, kw);
    const headOut = 1 - ks;
    const ha = this._start + reveal + this._spin;
    _head.set(_centre.x + Math.cos(ha) * Rh, H, _centre.z + Math.sin(ha) * Rh);
    _glintState.pos.copy(_head);
    _glintState.size = c.headSize * (1 + 0.15 * Math.sin(t * 40));
    _glintState.roll = t * 2.5;
    _glintState.intensity = headIn * headOut;
    this.glintMaterial.userData.sync(_glintState);
    this.glint.visible = headIn * headOut > 0.01;
    if (t < spinStart) this._headFx(dt, c, g, ha);

    /* --- the floor --- */
    const star = t >= lockStart ? Easing.outBack(saturate((t - lockStart) / 0.25)) : 0;
    const gf = this._T(c.lifetime);
    _floorState.centre.copy(_centre);
    _floorState.radius = R;
    _floorState.halo = Rh;
    _floorState.reveal = reveal;
    _floorState.start = this._start;
    _floorState.spin = this._spin;
    _floorState.seed = this._seed;
    _floorState.star = star;
    _floorState.erode = fading ? saturate((ft - shatterT * 0.3) / gf) : 0;
    this.floorMaterial.userData.sync(_floorState);
    this.floor.visible = true;

    /* --- cold air --- */
    const coldOn = smoothstep(0.6, 1, kw) * (1 - kl) * (1 - kf);
    this.cold.position.set(_centre.x, 0, _centre.z);
    this.cold.scale.set(Math.max(0.2, Rh), Math.max(0.1, H * c.coldHeight), Math.max(0.2, Rh));
    _coldState.strength = coldOn;
    this.coldMaterial.userData.sync(_coldState);
    this.cold.visible = coldOn > 0.01;
    if (coldOn > 0.01) this._mistFx(dt, c, g, Rh, H, coldOn);

    /* --- the rumble, the bodies, the lock --- */
    if (t >= closeStart && t < lockStart) this.ctx.shake.rumble(c.closeRumble * (0.3 + kc) * g.cameraShake, dt);
    if (t >= spinStart && !fading) this._catch(c, g, t, Rh, t >= lockStart);
    if (t >= lockStart && !this._locked) {
      this._locked = true;
      this._lockFx(c, g, H);
    }
    this._hold(c, t);

    /* the light rides the head, then sits in the halo */
    if (t < spinStart) this.position.copy(_head);
    else this.position.set(_centre.x, H, _centre.z);
  }

  _updateNeedles(c, g, reveal, walkT, Rh, H, ft, kf, lockFlash) {
    const n = Math.min(MAX_NEEDLES, Math.max(0, Math.round(c.needleCount)));
    const tiers = Math.max(1, Math.round(c.tiers));
    const growSpan = Math.max(0.02, (TAU * this._T(c.needleGrowTime)) / walkT);
    const state = this.stateAttr.array;
    const inward = saturate(c.needleInward);
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const d = i * DICE;
      const k4 = i * 4;
      const tier = i % tiers;
      const rel = ((i + 0.5) / n) * TAU + (this.dice[d] - 0.5) * (TAU / n) * 0.8 * g.randomness;
      const grow = saturate((reveal - rel) / growSpan);
      if (grow <= 0) {
        this.needles.setMatrixAt(i, _zero);
        state[k4 + 3] = 0;
        continue;
      }
      const a = this._start + rel + this._spin;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _rad.set(ca, 0, sa);
      _tan.set(-sa, 0, ca);
      const y = H + (tier - (tiers - 1) * 0.5) * c.tierGap;
      _pos.set(_centre.x + ca * Rh, y, _centre.z + sa * Rh);
      // Inward, swept back against the spin, tilted up or down.
      const tilt = (this.dice[d + 2] - 0.5) * 2 * c.needleTilt * g.randomness + (tier - (tiers - 1) * 0.5) * -0.12;
      // Raised by `needleRise` so the ring reads as a crown of spikes, not a
      // flat disc, at play distance.
      _dir.copy(_rad).multiplyScalar(-inward).addScaledVector(_tan, -(1 - inward)).normalize();
      const elev = tilt + c.needleRise;
      _dir.multiplyScalar(Math.cos(elev));
      _dir.y = Math.sin(elev);
      _dir.normalize();

      let len = c.needleLength * (1 - saturate(c.needleJitter) * this.dice[d + 1]) * Easing.outBack(grow);
      let dissolve = 0;
      if (kf > 0) {
        // Drop and tumble as it sublimes.
        const fall = 0.5 * c.fallGravity * (0.6 + 0.8 * this.dice[d + 3]) * ft * ft;
        _pos.y = Math.max(0.05, _pos.y - fall);
        const tumble = c.fallSpin * ft * (0.4 + this.dice[d + 4]);
        _q2.setFromAxisAngle(_tan, tumble);
        _dir.applyQuaternion(_q2);
        if (_pos.y <= 0.06) _dir.lerp(_down, 0.5).normalize();
        dissolve = saturate(kf * (0.7 + 0.6 * this.dice[d + 3]));
        len *= 1 - dissolve * 0.3;
      }
      _q.setFromUnitVectors(_up, _dir);
      const w = c.needleWidth * (0.5 + 0.5 * grow);
      _scale.set(w, Math.max(0.001, len), w);
      _m.compose(_pos, _q, _scale);
      this.needles.setMatrixAt(i, _m);
      state[k4] = this.dice[d + 4];
      // A short crystallise flash early in the growth (not the whole slow tail of the walk).
      state[k4 + 1] = Math.max(smoothstep(0, 0.2, grow) * (1 - smoothstep(0.2, 0.5, grow)), lockFlash);
      state[k4 + 2] = dissolve;
      state[k4 + 3] = 1;
      shown++;

      // A puff of glitter the frame a needle is born.
      if (grow < 0.25 && kf === 0 && Math.random() < 0.35) this._bornFx(c, g, _pos);
    }
    for (let i = n; i < MAX_NEEDLES; i++) this.needles.setMatrixAt(i, _zero);
    this.needles.count = n;
    this.needles.visible = shown > 0;
    this.needles.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _catch(c, g, t, Rh, locking) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const R = Math.max(0.5, c.zoneRadius);
    const found = field.findTargets(_centre.x, _centre.z, R + 0.3, this._found);
    const power = g.explosionIntensity;
    for (let i = 0; i < found.length; i++) {
      if (this._frozenCount >= MAX_FROZEN) break;
      const dummy = found[i];
      const dx = dummy.position.x - _centre.x;
      const dz = dummy.position.z - _centre.z;
      const dist = Math.hypot(dx, dz);
      if (!locking && dist < Rh - c.hitReach) continue;
      const slot = this._frozen[this._frozenCount++];
      slot.dummy = dummy;
      slot.at = t;
      _dir.set(-dx, 0, -dz);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      dummy.kill(_dir.x, _dir.z, this._force);
      this._catchFx(c, g, dummy);
    }
    this._found.length = 0;
  }

  /** Stain every caught body to ice over `freezeTime`. */
  _hold(c, t) {
    if (this._frozenCount === 0) return;
    const look = this._look;
    look.color = c.colorBodyFrozen;
    look.rimColor = c.colorBodyRim;
    look.rimEmissive = c.bodyRimGlow;
    look.edgeColor = c.colorBodyEdge;
    look.edgeEmissive = c.bodyEdgeGlow;
    for (let i = 0; i < this._frozenCount; i++) {
      const slot = this._frozen[i];
      if (!slot.dummy) continue;
      const k = saturate((t - slot.at) / Math.max(0.02, c.freezeTime));
      slot.dummy.corrode(k * c.frostTint, look);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _headFx(dt, c, g, ha) {
    const count = Math.round(this.sparkEmitter.tick(dt, c.headSparkRate) * g.particleCount);
    if (count <= 0) return;
    // Thrown back off the head, against the way it is walking.
    _dir.set(Math.sin(ha), -0.3, -Math.cos(ha));
    _emit.position = _head;
    _emit.radius = 0.12;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.07;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(count, _emit);
  }

  _bornFx(c, g, at) {
    _emit.position = at;
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = 0.8;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glitterLifetime * 0.5;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glitter.emit(Math.max(1, Math.round(2 * g.particleCount)), _emit);
  }

  _mistFx(dt, c, g, Rh, H, k) {
    const count = Math.round(this.mistEmitter.tick(dt, c.mistRate * k) * g.particleCount);
    if (count <= 0) return;
    _emit.radius = 0.15;
    _emit.direction = _down;
    _emit.speed = 0.7;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.4;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.5;
    _emit.sizeVariance = 0.5;
    _emit.life = c.mistLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.4;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      _pos.set(_centre.x + Math.cos(a) * Rh, H - 0.1, _centre.z + Math.sin(a) * Rh);
      _emit.position = _pos;
      this.mist.emit(1, _emit);
    }
  }

  _catchFx(c, g, dummy) {
    _pos.set(dummy.position.x, 1.1, dummy.position.z);
    _emit.position = _pos;
    _emit.radius = 0.35;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed * 0.5;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.6;
    _emit.life = c.chipLifetime * 0.7;
    _emit.lifeVariance = 0.4;
    _emit.spin = 9;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.chips.emit(Math.round(18 * g.particleCount), _emit);
    _emit.size = 0.06;
    _emit.life = c.glitterLifetime * 0.6;
    _emit.spin = 0;
    this.glitter.emit(Math.round(24 * g.particleCount), _emit);
    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: 0.15,
      endRadius: c.catchBurst,
      life: 0.35,
      intensity: 0.8,
      opacity: c.catchBurstOpacity * g.opacity,
      squash: 1,
      colorA: getColor(c.colorSparkB),
      colorB: getColor(c.colorSparkC),
      colorC: getColor(c.colorSparkD)
    });
  }

  _lockFx(c, g, H) {
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.lockShake * power, 4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.lockFlash * power);
    this.lightBoost = c.lockLight * power;
    _pos.set(_centre.x, H, _centre.z);
    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      opacity: 0.85 * g.opacity,
      squash: 0.8,
      colorA: getColor(c.colorSparkA),
      colorB: getColor(c.colorSparkB),
      colorC: getColor(c.colorSparkD)
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
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1.1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.12;
    _emit.sizeVariance = 0.6;
    _emit.life = c.chipLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 10;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.chips.emit(Math.round(c.chipCount * g.particleCount), _emit);
    _emit.speed = c.chipSpeed * 0.7;
    _emit.size = 0.07;
    _emit.life = c.glitterLifetime;
    _emit.spin = 0;
    this.glitter.emit(Math.round(c.glitterCount * g.particleCount), _emit);
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed * 2;
    _emit.spread = 1.2;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(80 * g.particleCount), _emit);
  }

  /** The cold glint skating to the circle. */
  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const spacing = Math.max(0.2, c.trailSpacing);
    while (this.front - this._travelled >= spacing) {
      this._travelled += spacing;
      this.pointAt(saturate(this._travelled / this.length), _pos);
      this.ctx.decals.spawn(DecalType.FROST, _pos, {
        radius: c.trailRadius,
        life: c.trailLife * g.lifetime,
        intensity: 0.8,
        colorA: getColor(c.colorTrailA),
        colorB: getColor(c.colorTrailB),
        height: 0.02
      });
    }
    _head.copy(this.position).setY(0.45);
    _glintState.pos.copy(_head);
    _glintState.size = c.headSize * 0.7;
    _glintState.roll = this.age * 6;
    _glintState.intensity = smoothstep(0, 0.1, this.age);
    this.glintMaterial.userData.sync(_glintState);
    this.glint.visible = true;
    const count = Math.round(this.trailEmitter.tick(dt, c.trailRate) * g.particleCount);
    if (count > 0) {
      _dir.copy(this.direction).multiplyScalar(-1);
      _emit.position = _head;
      _emit.radius = 0.1;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * 0.6;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.06;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sparkLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.sparks.emit(count, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._sync();
    this._travelFx(dt);
    this.position.y = 0.45;
  }

  onImpact() {
    this._sync();
    this.ctx.shake.add(settings[ID].walkShake * settings.global.explosionIntensity, 6, 20);
    this.lightBoost = settings[ID].lightIntensity * 0.6;
  }

  onFade(dt) {
    this._sync();
    this._updateHalo(dt);
  }

  onDestroy() {
    this.needles.count = 0;
    this.needles.visible = false;
    this.spine.visible = false;
    this.glint.visible = false;
    this.floor.visible = false;
    this.cold.visible = false;
    for (let i = 0; i < this._frozenCount; i++) this._frozen[i].dummy = null;
    this._frozenCount = 0;
    this._found.length = 0;
  }

  dispose() {
    this.needleGeometry.dispose();
    this.spineGeometry.dispose();
    this.glintGeometry.dispose();
    this.floorGeometry.dispose();
    this.coldGeometry.dispose();
    this.needleMaterial.dispose();
    this.spineMaterial.dispose();
    this.glintMaterial.dispose();
    this.floorMaterial.dispose();
    this.coldMaterial.dispose();
    this.needles.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◌  Rime Halo');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'glint speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.05, 5, 0.05, 'rime sublimes over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'walkTime', 0.05, 3, 0.01, 'walks the rim over');
  R(time, c, 'spinTime', 0, 3, 0.01, 'spins up over');
  R(time, c, 'closeTime', 0.05, 3, 0.01, 'closes over');
  R(time, c, 'lockTime', 0.05, 3, 0.01, 'knot holds for');
  R(time, c, 'shatterTime', 0.05, 3, 0.01, 'needles drop over');

  const halo = folder.addFolder('1 · Halo');
  R(halo, c, 'haloHeight', 0.2, 5, 0.05, 'height (m)');
  R(halo, c, 'haloBob', 0, 0.5, 0.005, 'bob (m)');
  R(halo, c, 'closeRadius', 0.02, 3, 0.01, 'closes to (m)');
  R(halo, c, 'closeDrop', 0, 2, 0.01, 'sinks as it closes (m)');
  R(halo, c, 'closeEase', 0.3, 5, 0.05, 'accelerates (power)');
  R(halo, c, 'spinStart', 0, 10, 0.05, 'spin after walk (rad/s)');
  R(halo, c, 'spinMax', 0, 30, 0.1, 'spin at close (rad/s)');
  R(halo, c, 'tiers', 1, 4, 1, 'rows');
  R(halo, c, 'tierGap', 0, 1.5, 0.01, 'row gap (m)');

  const nd = folder.addFolder('2 · Needles');
  R(nd, c, 'needleCount', 0, MAX_NEEDLES, 1, 'needles');
  R(nd, c, 'needleLength', 0.1, 4, 0.01, 'length (m)');
  R(nd, c, 'needleWidth', 0.01, 0.4, 0.005, 'width (m)');
  R(nd, c, 'needleJitter', 0, 1, 0.01, 'length variety');
  R(nd, c, 'needleInward', 0, 1, 0.01, 'point inward ↔ along ring');
  R(nd, c, 'needleTilt', 0, 1.2, 0.01, 'tilt variety (rad)');
  R(nd, c, 'needleRise', -0.6, 1.4, 0.01, 'raised into a crown (rad)');
  R(nd, c, 'needleGrowTime', 0.01, 1, 0.01, 'crystallises over (s)');
  R(nd, c, 'needleFrost', 0, 1, 0.01, 'frost');
  R(nd, c, 'needleEnv', 0, 2, 0.01, 'sky reflection');
  R(nd, c, 'needleCoreGlow', 0, 10, 0.05, 'filament glow');
  R(nd, c, 'needleTipGlow', 0, 12, 0.05, 'tip glow');
  R(nd, c, 'needleRimGlow', 0, 5, 0.05, 'rim glow');
  R(nd, c, 'needleFlashGlow', 0, 20, 0.1, 'crystallise flash');
  R(nd, c, 'needleRamp', 0.3, 2.5, 0.01, 'ramp root → point');
  R(nd, c, 'needleSpecular', 0, 8, 0.05, 'facet glint');
  R(nd, c, 'needleGloss', 1, 200, 1, 'gloss');
  nd.addColor(c, 'colorNeedleDeep').name('ice, deep');
  nd.addColor(c, 'colorNeedleBody').name('ice');
  nd.addColor(c, 'colorNeedleCore').name('filament');
  nd.addColor(c, 'colorNeedleRim').name('rim');
  nd.addColor(c, 'colorFrost').name('frost');

  const sp = folder.addFolder('3 · Spine & head');
  R(sp, c, 'spineThickness', 0.005, 0.3, 0.005, 'thread (m)');
  R(sp, c, 'spineGlow', 0, 10, 0.05, 'thread glow');
  R(sp, c, 'spinePulses', 0, 24, 1, 'beads');
  R(sp, c, 'spinePulseSpeed', 0, 30, 0.1, 'bead speed');
  sp.addColor(c, 'colorSpineA').name('thread, hot');
  sp.addColor(c, 'colorSpineB').name('thread, cold');
  R(sp, c, 'headSize', 0.05, 4, 0.01, 'head size (m)');
  R(sp, c, 'headGlow', 0, 10, 0.05, 'head glow');
  sp.addColor(c, 'colorHeadA').name('head core');
  sp.addColor(c, 'colorHeadB').name('head halo');
  R(sp, c, 'headSparkRate', 0, 1000, 1, 'sparks / s');
  R(sp, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(sp, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(sp, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(sp, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  Editor.gradient(sp, c, 'colorSpark', 'spark colour');

  const fl = folder.addFolder('4 · Rime floor');
  R(fl, c, 'trackWidth', 0.02, 1, 0.01, 'track width (m)');
  R(fl, c, 'trackGlow', 0, 10, 0.05, 'track glow');
  R(fl, c, 'floorStreak', 0, 4, 0.01, 'dragged streaks');
  R(fl, c, 'starSize', 0, 5, 0.05, 'crystal star (m)');
  fl.addColor(c, 'colorFrostDeep').name('rime, deep');

  const air = folder.addFolder('5 · Cold air');
  R(air, c, 'coldWarp', 0, 3, 0.01, 'distortion');
  R(air, c, 'coldScale', 0.1, 6, 0.05, 'distortion scale');
  R(air, c, 'coldHeight', 0.05, 1, 0.01, 'sheet height (× halo)');
  R(air, c, 'mistRate', 0, 400, 1, 'mist / s');
  R(air, c, 'mistSize', 0.05, 3, 0.05, 'mist size');
  R(air, c, 'mistLifetime', 0.1, 4, 0.05, 'mist lifetime');
  R(air, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(air, c, 'colorMist', 'mist colour');

  const cl = folder.addFolder('6 · The close');
  R(cl, c, 'chipCount', 0, 500, 1, 'chips at the lock');
  R(cl, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(cl, c, 'chipSize', 0.01, 0.5, 0.005, 'chip size');
  R(cl, c, 'chipLifetime', 0.1, 4, 0.05, 'chip lifetime');
  R(cl, c, 'chipGravity', -40, 0, 0.5, 'chip gravity');
  R(cl, c, 'glitterCount', 0, 600, 1, 'glitter');
  R(cl, c, 'glitterSize', 0.005, 0.3, 0.005, 'glitter size');
  R(cl, c, 'glitterLifetime', 0.1, 4, 0.05, 'glitter lifetime');
  R(cl, c, 'fallGravity', 0, 30, 0.1, 'needles fall (m/s²)');
  R(cl, c, 'fallSpin', 0, 20, 0.1, 'needles tumble (rad/s)');

  const hit = folder.addFolder('7 · Bodies');
  R(hit, c, 'hitReach', 0, 2, 0.01, 'caught inside the ring (m)');
  R(hit, c, 'hitImpulse', 0, 20, 0.1, 'pulled in (m/s)');
  R(hit, c, 'hitLift', 0, 10, 0.1, 'lift (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hit, c, 'freezeTime', 0.02, 3, 0.01, 'goes to ice over (s)');
  R(hit, c, 'frostTint', 0, 1, 0.01, 'frozen');
  R(hit, c, 'catchBurst', 0, 3, 0.01, 'frost puff on a caught body (m)');
  R(hit, c, 'catchBurstOpacity', 0, 1, 0.01, 'frost puff opacity');
  hit.addColor(c, 'colorBodyFrozen').name('frozen body');
  hit.addColor(c, 'colorBodyRim').name('rim');
  R(hit, c, 'bodyRimGlow', 0, 6, 0.05, 'rim glow');
  hit.addColor(c, 'colorBodyEdge').name('edge');
  R(hit, c, 'bodyEdgeGlow', 0, 8, 0.05, 'edge glow');

  const beat = folder.addFolder('8 · The beat');
  R(beat, c, 'walkShake', 0, 1, 0.01, 'walk sets off');
  R(beat, c, 'closeRumble', 0, 1, 0.01, 'close rumble');
  R(beat, c, 'lockShake', 0, 1.5, 0.01, 'lock shake');
  R(beat, c, 'lockFlash', 0, 1, 0.01, 'lock flash');
  R(beat, c, 'lockLight', 0, 120, 0.5, 'light punch');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'frost shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'frost shell life');
  R(beat, c, 'shockRadius', 0, 15, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock ring life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  const trail = beat.addFolder('Glint (travel)');
  R(trail, c, 'trailRate', 0, 600, 1, 'sparks / s');
  R(trail, c, 'trailSpacing', 0.2, 5, 0.05, 'frost spacing (m)');
  R(trail, c, 'trailRadius', 0.05, 2, 0.01, 'frost radius (m)');
  R(trail, c, 'trailLife', 0.1, 5, 0.05, 'frost life');
  trail.addColor(c, 'colorTrailA').name('rime');
  trail.addColor(c, 'colorTrailB').name('rime, deep');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
}
