import { InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  HEART_MAX_RINGS,
  createHeartCrystalMaterial,
  createHeartRingMaterial,
  createHeartShardMaterial,
  createHeartShockMaterial
} from '../../materials/matrix-new/CrystallineHeartMaterials.js';
import { createHeartGeometry } from '../../assets/matrix-new/CrystallineHeartGeometry.js';
import { createShardGeometry } from '../../assets/ProceduralGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'crystallineheart';

/** Most beats a heart can be given (two ripple slots each: lub and dub). */
const MAX_BEATS = HEART_MAX_RINGS / 2;
/** Shards it shatters into. Two silhouettes, half each. */
const MAX_SHARDS = 72;
const SHARD_VARIANTS = 2;
const SHARD_SLOTS = MAX_SHARDS / SHARD_VARIANTS;
/** Shards rest this far off the floor once they land, metres. */
const SHARD_REST = 0.03;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _centre = new Vector3();
const _floor = new Vector3();
const _hand = new Vector3();
const _up = new Vector3(0, 1, 0);
const _node = new Object3D();
const _qFly = new Quaternion();
const _qRest = new Quaternion();
const _qSpin = new Quaternion();

/**
 * Height after `s` seconds of a body launched at `y0` with vertical speed `vy`
 * under linear drag `k` and gravity `G` (negative): the closed form the shard
 * flight is built on.
 */
function heightAt(s, y0, vy, k, G) {
  const f = (1 - Math.exp(-k * s)) / k;
  return y0 + vy * f + (G * (s - f)) / k;
}

/**
 * CRYSTALLINE HEART — Crystal, zone cast.
 *
 * A mote of rose light arcs from the caster's hand to the sky over the circle.
 * Out of it a faceted crystal heart descends and settles to float, and then it
 * *beats*: lub-dub, lub-dub, each beat sooner than the last. Every beat swells
 * the stone, punches the light inside it, throws a ripple ring across the
 * floor and a shockwave through the air, and showers pink glints. On the last
 * beat it shatters — a flash, a pressure shell, and every dummy in the circle
 * thrown — and the pieces rain down while the rings fade.
 *
 * ## Layers
 *
 *   1. **THE HEART** (`createHeartCrystalMaterial`, `createHeartGeometry`) — a
 *      heart cut like a gem: the heart curve as the girdle, a broad table at
 *      the front and a deeper pavilion behind, large flat facets. Drawn back
 *      faces first, then front faces, so the far facets show through. The
 *      shader samples the stage's sky (`frame.uEnvMap`) along the refracted
 *      ray once per channel (dispersion), reflects it at grazing angles,
 *      catches the sun on chosen facets, draws the cut edges from
 *      barycentrics, and traces the refracted ray past the centre for the
 *      light inside — which slides through the stone as it turns, and which
 *      every beat punches.
 *   2. **RIPPLE RINGS** (`createHeartRingMaterial`) — one floor quad: a faint
 *      seven-point sigil under the heart, and a faceted ring per lub and per
 *      dub running outward with a caustic sparkle in its wake.
 *   3. **SHOCKWAVES** (LAYER.DISTORTION, `createHeartShockMaterial`) — one
 *      view-space disc at the heart carrying every beat's front at once.
 *   4. **GLINTS** — a shower of pink sparkles off the stone on every beat, a
 *      trickle while it floats, and the trail of the mote in flight.
 *   5. **THE SHATTER** — 72 instanced crystal shards in two silhouettes,
 *      thrown under drag and gravity, landing with a hop and skidding to rest
 *      (all closed form from dice, so every slider is live mid-flight); a
 *      white flash, an AIR shell, a SHOCKWAVE and a FROST-rime decal, a light
 *      punch, a shake, and the kill (`handlesOwnHits`).
 *
 * ## The rhythm
 *
 * Nothing about it is recorded. The gap between beats shrinks by `beatAccel`
 * each beat, and the first gap is solved every frame so that the final beat
 * lands exactly at the end of `lifetime`; each beat's time is a closed-form
 * geometric sum. The only state is which beats have *announced* themselves
 * (two bitmasks), so drag `beats` mid-cast and the rhythm re-times around
 * the beat it is on. The ring ages handed to the shaders are derived from the
 * same clock.
 */
export class CrystallineHeartAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The shatter picks its victims, on the last beat. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let count = 0;
    for (const mesh of this.shardMeshes) count += mesh.count;
    return count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the heart, far facets then near ---- */
    /** The shape sliders the current stone was cut with. */
    this._builtDepth = NaN;
    this._builtFacets = NaN;
    this.heartGeometry = this._buildHeart();
    this.heartBackMaterial = createHeartCrystalMaterial(true);
    this.heartFrontMaterial = createHeartCrystalMaterial(false);
    this.heartBack = new Mesh(this.heartGeometry, this.heartBackMaterial);
    this.heartFront = new Mesh(this.heartGeometry, this.heartFrontMaterial);
    this.heartBack.name = 'HeartBack';
    this.heartFront.name = 'HeartFront';
    this.heartBack.renderOrder = 10;
    this.heartFront.renderOrder = 11;
    this.heart = new Object3D();
    this.heart.name = 'CrystallineHeart';
    this.heart.rotation.order = 'YXZ';
    this.heart.visible = false;
    for (const mesh of [this.heartBack, this.heartFront]) {
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      this.heart.add(mesh);
    }
    this.heart.layers.set(LAYER.VFX);
    this.group.add(this.heart);

    /* ---- layer 2: the floor ---- */
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.ringMaterial = createHeartRingMaterial();
    this.rings = new Mesh(this.groundGeometry, this.ringMaterial);
    this.rings.name = 'HeartRings';
    this.rings.layers.set(LAYER.VFX);
    this.rings.renderOrder = 4;
    this.rings.frustumCulled = false;
    this.rings.visible = false;
    this.group.add(this.rings);

    /* ---- layer 3: shockwaves ---- */
    this.shockGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.shockMaterial = createHeartShockMaterial();
    this.shock = new Mesh(this.shockGeometry, this.shockMaterial);
    this.shock.layers.set(LAYER.DISTORTION);
    this.shock.frustumCulled = false;
    this.shock.visible = false;
    this.group.add(this.shock);

    /* ---- layer 5: shards ---- */
    this.shardMaterial = createHeartShardMaterial();
    this.shardMeshes = [];
    this.shardFades = [];
    for (let v = 0; v < SHARD_VARIANTS; v++) {
      const geometry = createShardGeometry(4 + v * 9, v === 0 ? 5 : 4);
      const fade = new InstancedBufferAttribute(new Float32Array(SHARD_SLOTS), 1);
      geometry.setAttribute('aFade', fade);
      const mesh = new InstancedMesh(geometry, this.shardMaterial, SHARD_SLOTS);
      mesh.name = `HeartShards${v}`;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
      mesh.count = 0;
      this.group.add(mesh);
      this.shardMeshes.push(mesh);
      this.shardFades.push(fade);
    }
    /** Dice only. */
    this.shardDice = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.shardDice.push({ dir: new Vector3(), speed: 0, life: 0, size: 0, spin: 0, phase: 0, yaw: 0, origin: new Vector3() });
    }

    /* ---- cast state ---- */
    this._seed = 0;
    /** Seconds since the mote landed; -1 while it flies. */
    this._life = -1;
    /** Seconds since the shatter; -1 before. */
    this._shatter = -1;
    /** Height of the heart's centre the moment it shattered — where the shards leave from. */
    this._shatterY = 0;
    /** Which lubs / dubs have announced themselves. */
    this._lubMask = 0;
    this._dubMask = 0;
    this._ages = new Float32Array(HEART_MAX_RINGS);
    this._powers = new Float32Array(HEART_MAX_RINGS);
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._crystalState = { beat: 0, fade: 1, seed: 0 };
    this._ringState = { quadSize: 14, reach: 6, ages: this._ages, powers: this._powers, sigil: 0, sigilRadius: 1, beat: 0, fade: 1, seed: 0 };
    this._shockState = { ages: this._ages, powers: this._powers, seed: 0 };
  }

  _buildHeart() {
    const c = settings.crystallineheart;
    this._builtDepth = c.heartDepth;
    this._builtFacets = c.heartFacets;
    return createHeartGeometry({ depth: c.heartDepth, facets: c.heartFacets, segments: 20, seed: 3.1 });
  }

  /** Re-cut the stone only when a shape slider actually moved. */
  _syncGeometry() {
    const c = settings.crystallineheart;
    if (c.heartDepth === this._builtDepth && c.heartFacets === this._builtFacets) return;
    const old = this.heartGeometry;
    this.heartGeometry = this._buildHeart();
    this.heartBack.geometry = this.heartGeometry;
    this.heartFront.geometry = this.heartGeometry;
    old.dispose();
  }

  createParticles() {
    this.glints = this.ctx.particles.get('crystallineheart.glints', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.glints.uniforms.uDrag.value = 1.4;
    this.glints.uniforms.uEndSize.value = 0.15;
    this.glints.uniforms.uSizeIn.value = 0.04;
    this.glints.uniforms.uFadeIn.value = 0.04;
    this.glints.uniforms.uFadeOut.value = 0.55;
    this.glints.uniforms.uTurbulence.value = 0.2;

    this.trailEmitter = new RateEmitter();
    this.idleEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.3, settings.crystallineheart.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.crystallineheart.fadeTime * settings.global.lifetime);
  }

  /** The heart's light throbs on the beat rather than shimmering. */
  lightShimmer() {
    return 0.8 + this._swell() * 0.6;
  }

  get radius() {
    return Math.max(0.2, settings.crystallineheart.zoneRadius);
  }

  /** How many beats, the last of which shatters it. */
  get beatCount() {
    return Math.min(MAX_BEATS, Math.max(1, Math.round(settings.crystallineheart.beats)));
  }

  /** Seconds after landing that the heart has settled to float. */
  get settleTime() {
    return Math.max(0.05, settings.crystallineheart.descendTime);
  }

  /**
   * The first gap, solved so the final beat lands at the end of `lifetime`.
   * Every other gap is this × `beatAccel`^k.
   */
  _firstGap() {
    const c = settings.crystallineheart;
    const n = this.beatCount - 1;
    if (n <= 0) return 0.5;
    const a = Math.max(0.2, c.beatAccel);
    const sum = Math.abs(a - 1) < 1e-4 ? n : (1 - Math.pow(a, n)) / (1 - a);
    const avail = this.impactDuration - this.settleTime - c.firstBeat;
    return Math.max(0.08, avail / sum);
  }

  /** Seconds after landing that beat `k` (its lub) lands. */
  _beatTime(k, g0) {
    const c = settings.crystallineheart;
    const a = Math.max(0.2, c.beatAccel);
    const sum = k <= 0 ? 0 : Math.abs(a - 1) < 1e-4 ? k : (1 - Math.pow(a, k)) / (1 - a);
    return this.settleTime + c.firstBeat + g0 * sum;
  }

  /** Seconds after landing that beat `k`'s dub lands. */
  _dubTime(k, g0) {
    const c = settings.crystallineheart;
    const a = Math.max(0.2, c.beatAccel);
    return this._beatTime(k, g0) + c.dubGap * g0 * Math.pow(a, k);
  }

  /** One beat's swell at `age` seconds after it: a fast attack, a soft release. */
  _envelope(age) {
    const c = settings.crystallineheart;
    if (age < 0) return 0;
    const attack = Math.max(0.005, c.beatAttack);
    if (age < attack) return Easing.outQuad(age / attack);
    return Math.exp(((age - attack) / Math.max(0.01, c.beatRelease)) * -3);
  }

  /** The heart's current swell, 0..~1, from every beat that has landed. */
  _swell() {
    if (this._life < 0 || this._shatter >= 0) return 0;
    const c = settings.crystallineheart;
    const g0 = this._firstGap();
    const last = this.beatCount - 1;
    let swell = 0;
    for (let k = 0; k < last; k++) {
      if (this._lubMask & (1 << k)) swell = Math.max(swell, this._envelope(this._life - this._beatTime(k, g0)));
      if (this._dubMask & (1 << k)) swell = Math.max(swell, c.dubStrength * this._envelope(this._life - this._dubTime(k, g0)));
    }
    return swell;
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** Where the heart's centre is: descending, then floating. */
  _heartPoint(out) {
    const c = settings.crystallineheart;
    this._floorPoint(out);
    const d = saturate(this._life / this.settleTime);
    // Comes down fast and eases in, with a hint of settle at the bottom.
    const k = Easing.outBack(d) * 0.15 + Easing.outCubic(d) * 0.85;
    const bob = Math.sin(this._life * c.bobRate * TAU + this._seed) * c.bobAmount * saturate(d * 2 - 1);
    out.y = c.heartHeight + c.descendFrom * (1 - k) + bob;
    return out;
  }

  /** The mote in flight: up from the hand to where the heart will descend from. */
  _motePoint(out) {
    const c = settings.crystallineheart;
    _hand.copy(this.origin).addScaledVector(this.direction, 0.5);
    _hand.y = c.handHeight;
    this._floorPoint(out);
    out.y = c.heartHeight + c.descendFrom;
    out.lerpVectors(_hand, out, Easing.inOutQuad(this.u));
    out.y += Math.sin(this.u * Math.PI) * 1.2;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const g = settings.global;
    this._seed = Math.random() * 100;
    this._life = -1;
    this._shatter = -1;
    this._lubMask = 0;
    this._dubMask = 0;
    this.trailEmitter.reset();
    this.idleEmitter.reset();

    for (const dice of this.shardDice) {
      // Mostly outward and up from all over the stone.
      dice.dir.set(randRange(-1, 1), randRange(-0.4, 1), randRange(-1, 1));
      if (dice.dir.lengthSq() < 1e-4) dice.dir.set(0, 1, 0);
      dice.dir.normalize();
      dice.origin.set(randRange(-0.5, 0.5), randRange(-0.45, 0.45), randRange(-0.25, 0.25));
      dice.speed = randRange(-1, 1);
      dice.life = randRange(0.75, 1.2);
      dice.size = 1 + randRange(-0.45, 0.45) * g.randomness;
      dice.spin = randRange(-1, 1);
      dice.phase = Math.random() * TAU;
      dice.yaw = Math.random() * TAU;
    }

    this.heart.visible = false;
    for (const mesh of this.shardMeshes) mesh.count = 0;
    this._sync();
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.crystallineheart;
    const g = settings.global;
    this.shardMaterial.userData.sync();
    this.glints.setGradient(getColor(c.colorGlintA), getColor(c.colorGlintB), getColor(c.colorGlintC), getColor(c.colorGlintD));
    this.glints.uniforms.uGravity.value.set(0, c.glintGravity, 0);
    this.glints.uniforms.uSizeScale.value = g.particleSize;
    this.glints.uniforms.uLifeScale.value = g.particleLifetime;
    this.glints.uniforms.uSpeedScale.value = g.particleSpeed;
    this.glints.uniforms.uOpacity.value = g.opacity;
    this.glints.uniforms.uGlow.value = c.glintGlow * g.glow;
    this.glints.uniforms.uTurbulence.value = 0.3 * g.turbulence;
  }

  /** 0..1 through the fade phase. */
  _fadeT() {
    return this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;
  }

  _updateHeart() {
    const c = settings.crystallineheart;
    const visible = this._life >= 0 && this._shatter < 0;
    this.heart.visible = visible;
    if (!visible) return;
    this._syncGeometry();

    const swell = this._swell();
    const arrive = saturate(this._life / (this.settleTime * 0.4));
    this._heartPoint(this.heart.position);

    // Faces the camera on yaw, swaying either side of it; leans back a touch.
    const cam = this.ctx.camera.position;
    const yaw = Math.atan2(cam.x - this.heart.position.x, cam.z - this.heart.position.z);
    const sway = Math.sin(this._life * c.swayRate * TAU + this._seed) * c.swayAngle;
    this.heart.rotation.set(-c.tilt, yaw + sway, 0);
    const size = c.heartSize * lerp(0.55, 1, Easing.outCubic(arrive)) * (1 + swell * c.beatSwell);
    this.heart.scale.setScalar(size);

    const state = this._crystalState;
    state.beat = swell;
    state.fade = Easing.outQuad(arrive);
    state.seed = this._seed;
    this.heartBackMaterial.userData.sync(state);
    this.heartFrontMaterial.userData.sync(state);
  }

  /** Ring ages and powers for every lub and dub, derived from the clock. */
  _fillRings() {
    const c = settings.crystallineheart;
    const g0 = this._firstGap();
    const last = this.beatCount - 1;
    for (let k = 0; k < MAX_BEATS; k++) {
      const lub = k <= last && this._lubMask & (1 << k) ? this._life - this._beatTime(k, g0) : -1;
      const dub = k < last && this._dubMask & (1 << k) ? this._life - this._dubTime(k, g0) : -1;
      this._ages[2 * k] = lub;
      this._ages[2 * k + 1] = dub;
      this._powers[2 * k] = k === last ? c.shatterShock : 1;
      this._powers[2 * k + 1] = c.dubStrength;
    }
  }

  _updateFloor() {
    const c = settings.crystallineheart;
    if (this._life < 0) {
      this.rings.visible = false;
      this.shock.visible = false;
      return;
    }
    this._fillRings();
    const fade = 1 - Easing.inQuad(this._fadeT());
    const reach = this.radius * c.ringReach;

    const ring = this._ringState;
    ring.reach = reach;
    ring.quadSize = (reach + c.ringWidth * 2 + 0.5) * 2;
    ring.sigil = saturate(this._life / this.settleTime) * (this._shatter < 0 ? 1 : Math.max(0, 1 - this._shatter * 3));
    ring.sigilRadius = c.heartSize * 0.9;
    ring.beat = this._swell();
    ring.fade = fade;
    ring.seed = this._seed;
    this.ringMaterial.userData.sync(ring);
    this._floorPoint(this.rings.position);
    this.rings.position.y = 0.025;
    this.rings.scale.set(ring.quadSize, 1, ring.quadSize);
    this.rings.visible = fade > 0.004;

    this._shockState.seed = this._seed;
    this.shockMaterial.userData.sync(this._shockState);
    this._heartPoint(this.shock.position);
    let any = false;
    for (let i = 0; i < HEART_MAX_RINGS; i++) {
      const age = this._ages[i];
      if (age >= 0 && age < c.shockTime) any = true;
    }
    this.shock.visible = any;
  }

  /**
   * Every shard from its dice and the time since the shatter: flight under
   * drag and gravity, a hop where it lands, then a skid to rest.
   */
  _updateShards() {
    if (this._shatter < 0) {
      for (const mesh of this.shardMeshes) mesh.count = 0;
      return;
    }
    const c = settings.crystallineheart;
    const g = settings.global;
    const count = Math.min(MAX_SHARDS, Math.max(0, Math.round(c.shardCount)));
    const k = Math.max(0.001, c.shardDrag);
    const G = Math.min(-0.5, c.shardGravity);
    const t = this._shatter;
    const fadeAll = 1 - Easing.inQuad(this._fadeT());
    this._floorPoint(_floor);
    const centreY = this._shatterY;
    let any = false;

    for (let i = 0; i < MAX_SHARDS; i++) {
      const v = i % SHARD_VARIANTS;
      const slot = (i / SHARD_VARIANTS) | 0;
      const mesh = this.shardMeshes[v];
      const fade = this.shardFades[v].array;
      const dice = this.shardDice[i];
      const life = Math.max(0.1, c.shardLife * dice.life);

      if (i >= count || t >= life) {
        this._park(mesh, slot);
        fade[slot] = 0;
        continue;
      }
      any = true;

      // Launch from where it sat in the stone.
      const size = c.heartSize;
      const x0 = _floor.x + dice.origin.x * size;
      const y0 = centreY + dice.origin.y * size;
      const z0 = _floor.z + dice.origin.z * size;
      const speed = c.shardSpeed * (1 + dice.speed * c.shardSpeedJitter * g.randomness) * g.explosionIntensity;
      const vx = dice.dir.x * speed;
      const vy = (dice.dir.y + c.shardLift) * speed;
      const vz = dice.dir.z * speed;

      // When does it land? y(t) rises to an apex then falls monotonically,
      // so a bisection from the apex finds the one crossing.
      let apex = 0;
      if (vy > 0) apex = -Math.log(G / (G - k * vy)) / k;
      let lo = apex;
      let hi = apex + 8;
      for (let n = 0; n < 16; n++) {
        const mid = (lo + hi) * 0.5;
        if (heightAt(mid, y0, vy, k, G) > SHARD_REST) lo = mid;
        else hi = mid;
      }
      const tLand = heightAt(apex, y0, vy, k, G) <= SHARD_REST ? 0 : hi;

      const tf = Math.min(t, tLand);
      const e = Math.exp(-k * tf);
      const f = (1 - e) / k;
      _pos.set(x0 + vx * f, heightAt(tf, y0, vy, k, G), z0 + vz * f);
      _vel.set(vx * e, vy * e + (G * (1 - e)) / k, vz * e);

      if (t <= tLand) {
        // In flight: tumbling about its own length, the length along its path.
        _dir.copy(_vel);
        if (_dir.lengthSq() < 1e-6) _dir.copy(dice.dir);
        _qFly.setFromUnitVectors(_up, _dir.normalize());
        _qSpin.setFromAxisAngle(_up, dice.phase + dice.spin * c.shardSpin * t);
        _node.quaternion.copy(_qFly).multiply(_qSpin);
      } else {
        // Landed: a hop, then a skid with the floor's friction on it.
        const s = t - tLand;
        const hop = Math.max(0, -_vel.y) * c.shardBounce;
        const hopTime = (2 * hop) / -G;
        if (s < hopTime) _pos.y = SHARD_REST + hop * s + 0.5 * G * s * s;
        else _pos.y = SHARD_REST;
        const kg = k + 5;
        const skid = (1 - Math.exp(-kg * s)) / kg;
        _pos.x += _vel.x * skid * 0.6;
        _pos.z += _vel.z * skid * 0.6;

        // Lying down along its own heading, eased in over the hop.
        _dir.set(Math.cos(dice.yaw), 0, Math.sin(dice.yaw));
        _qRest.setFromUnitVectors(_up, _dir);
        _qSpin.setFromAxisAngle(_up, dice.phase);
        _qRest.multiply(_qSpin);
        _dir.copy(_vel);
        if (_dir.lengthSq() < 1e-6) _dir.copy(dice.dir);
        _qFly.setFromUnitVectors(_up, _dir.normalize());
        _qSpin.setFromAxisAngle(_up, dice.phase + dice.spin * c.shardSpin * tLand);
        _qFly.multiply(_qSpin);
        _node.quaternion.copy(_qFly).slerp(_qRest, Easing.outCubic(saturate(s / Math.max(0.08, hopTime + 0.05))));
      }

      const age = t / life;
      const sz = c.shardSize * dice.size;
      _node.position.copy(_pos);
      _node.scale.set(sz * 0.55, sz, sz * 0.55);
      _node.updateMatrix();
      mesh.setMatrixAt(slot, _node.matrix);
      fade[slot] = (1 - Easing.inCubic(age)) * fadeAll;
    }

    for (let v = 0; v < SHARD_VARIANTS; v++) {
      this.shardMeshes[v].count = any ? SHARD_SLOTS : 0;
      this.shardMeshes[v].instanceMatrix.needsUpdate = true;
      this.shardFades[v].needsUpdate = true;
    }
  }

  _park(mesh, slot) {
    _node.position.set(0, -999, 0);
    _node.quaternion.identity();
    _node.scale.setScalar(0.0001);
    _node.updateMatrix();
    mesh.setMatrixAt(slot, _node.matrix);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** The mote in flight, trailing glints. */
  _travelFx(dt) {
    const c = settings.crystallineheart;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.moteRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = this.position;
    _emit.radius = 0.12;
    _emit.direction = _up;
    _emit.speed = 0.4;
    _emit.spread = 1;
    _emit.size = c.moteSize;
    _emit.life = c.glintLifetime * 0.6;
    this.glints.emit(n, _emit);
  }

  /** A trickle of sparkles off the floating stone. */
  _idleFx(dt) {
    const c = settings.crystallineheart;
    const g = settings.global;
    const n = this.idleEmitter.tick(dt, this.heart.visible ? c.idleGlints * g.particleCount : 0);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = this.heart.position;
    _emit.radius = c.heartSize * 0.45;
    _emit.direction = _up;
    _emit.speed = 0.3;
    _emit.spread = 1;
    _emit.size = c.glintSize * 0.8;
    _emit.life = c.glintLifetime;
    this.glints.emit(n, _emit);
  }

  /** One beat landing: a lub (`strength` 1) or a dub (`dubStrength`). */
  _beatFx(strength) {
    const c = settings.crystallineheart;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._resetEmit(frame.uTime.value);
    _emit.position = this.heart.position;
    _emit.radius = c.heartSize * 0.4;
    _emit.direction = _up;
    _emit.speed = c.glintSpeed * strength;
    _emit.speedVariance = 0.5;
    _emit.spread = 1.6;
    _emit.size = c.glintSize;
    _emit.life = c.glintLifetime;
    this.glints.emit(Math.round(c.glintPerBeat * strength * g.particleCount), _emit);
    this.ctx.shake.add(c.beatShake * strength * power * g.cameraShake, 8, 14);
    if (c.beatFlash > 0) this.ctx.flash.trigger(getColor(c.colorRingGlow), c.beatFlash * strength * power);
    this.lightBoost = Math.max(this.lightBoost, c.beatLight * strength * power);
  }

  /** The last beat: the heart comes apart, and everything in the circle with it. */
  _shatterFx() {
    const c = settings.crystallineheart;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._heartPoint(_centre);
    this._shatterY = _centre.y;
    this._floorPoint(_floor);
    this.heart.visible = false;

    this.ctx.bursts.spawn(BurstMode.AIR, _centre, {
      radius: c.heartSize * 0.4,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: 0.8,
      fresnel: 2.4,
      squash: 0.9,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: this.radius * 1.3 * power,
      life: c.decalLife,
      width: 0.07,
      intensity: 1.0,
      colorA: getColor(c.colorDecalA),
      colorB: getColor(c.colorDecalB)
    });
    // Rime of rose crystal left where the light fell.
    this.ctx.decals.spawn(DecalType.FROST, _floor, {
      radius: this.radius * 0.55,
      life: c.decalLife * 3,
      intensity: 0.7,
      colorA: getColor(c.colorRingWake),
      colorB: getColor(c.colorRingGlow)
    });

    this._resetEmit(time);
    _emit.position = _centre;
    _emit.radius = c.heartSize * 0.4;
    _emit.direction = _up;
    _emit.speed = c.glintSpeed * 2.2;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.8;
    _emit.size = c.glintSize * 1.3;
    _emit.life = c.glintLifetime * 1.3;
    this.glints.emit(Math.round(c.glintPerBeat * 3 * g.particleCount), _emit);

    this.ctx.shake.add(c.shatterShake * power * g.cameraShake, 4, 20);
    this.ctx.flash.trigger(getColor(c.colorB), c.shatterFlash * power);
    this.lightBoost = c.lightIntensity * c.shatterLight * power;

    this._kill();
  }

  _kill() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.crystallineheart;
    const g = settings.global;
    this._floorPoint(_floor);
    const found = field.findTargets(_floor.x, _floor.z, this.radius * c.killReach, this._found);
    if (found.length === 0) return;
    this._force.impulse = c.killImpulse * g.explosionIntensity;
    this._force.lift = c.killLift * g.explosionIntensity;
    this._force.spin = c.killSpin;
    for (const dummy of found) {
      _dir.set(dummy.position.x - _floor.x, 0, dummy.position.z - _floor.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._sync();
    this._motePoint(this.position);
    this._travelFx(dt);
  }

  onImpact() {
    const c = settings.crystallineheart;
    const g = settings.global;
    this._life = 0;
    this._shatterY = c.heartHeight;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: this.radius * 0.5,
      life: 0.9,
      intensity: 0.5,
      colorA: getColor(c.colorRingGlow),
      colorB: getColor(c.colorRingWake)
    });
    this.ctx.shake.add(0.08 * g.cameraShake, 7, 14);
  }

  onFade(dt, t) {
    this._life += dt;
    if (this._shatter >= 0) this._shatter += dt;

    /* the beats, each announced once */
    if (this._shatter < 0) {
      const c = settings.crystallineheart;
      const g0 = this._firstGap();
      const last = this.beatCount - 1;
      for (let k = 0; k <= last; k++) {
        const bit = 1 << k;
        if (!(this._lubMask & bit) && this._life >= this._beatTime(k, g0)) {
          this._lubMask |= bit;
          if (k === last) {
            this._shatter = 0;
            this._shatterFx();
            break;
          }
          this._heartPoint(this.heart.position);
          this._beatFx(1);
        }
        if (k < last && !(this._dubMask & bit) && this._life >= this._dubTime(k, g0)) {
          this._dubMask |= bit;
          this._heartPoint(this.heart.position);
          this._beatFx(c.dubStrength);
        }
      }
      // However the sliders were dragged, the heart is gone by the end.
      if (this._shatter < 0 && t >= 1) {
        this._lubMask |= 1 << last;
        this._shatter = 0;
        this._shatterFx();
      }
    }

    this._sync();
    this._updateHeart();
    this._updateFloor();
    this._updateShards();
    this._idleFx(dt);

    // The light lives in the heart, and stays where it burst.
    if (this._shatter < 0) this._heartPoint(this.position);
    else {
      this._floorPoint(this.position);
      this.position.y = this._shatterY;
    }
  }

  onDestroy() {
    this.heart.visible = false;
    this.rings.visible = false;
    this.shock.visible = false;
    for (const mesh of this.shardMeshes) mesh.count = 0;
    this._life = -1;
    this._shatter = -1;
  }

  dispose() {
    this.heartGeometry.dispose();
    this.heartBackMaterial.dispose();
    this.heartFrontMaterial.dispose();
    this.groundGeometry.dispose();
    this.ringMaterial.dispose();
    this.shockGeometry.dispose();
    this.shockMaterial.dispose();
    for (const mesh of this.shardMeshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.shardMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('♥  Crystalline Heart');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'mote speed (m/s)');
  R(cast, c, 'lifetime', 0.8, 12, 0.05, 'heart lives for (s)');
  R(cast, c, 'fadeTime', 0.1, 5, 0.05, 'shards fall over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('shatter flash');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'moteRate', 0, 600, 1, 'mote glints / s');
  R(cast, c, 'moteSize', 0.01, 0.4, 0.005, 'mote glint size');

  const heart = folder.addFolder('1 · The heart');
  R(heart, c, 'heartSize', 0.2, 4, 0.01, 'size (m)');
  R(heart, c, 'heartDepth', 0.15, 1.5, 0.01, 'depth (rebuild)');
  R(heart, c, 'heartFacets', 0, 1.5, 0.01, 'facet cut (rebuild)');
  R(heart, c, 'heartHeight', 0.4, 5, 0.01, 'float height (m)');
  R(heart, c, 'descendFrom', 0, 10, 0.05, 'descends from (m above)');
  R(heart, c, 'descendTime', 0.05, 3, 0.01, 'descent (s)');
  R(heart, c, 'bobAmount', 0, 0.5, 0.005, 'bob (m)');
  R(heart, c, 'bobRate', 0, 3, 0.01, 'bob rate');
  R(heart, c, 'swayAngle', 0, 1.6, 0.01, 'sway (rad)');
  R(heart, c, 'swayRate', 0, 2, 0.01, 'sway rate');
  R(heart, c, 'tilt', -0.8, 0.8, 0.01, 'tilt (rad)');

  const beat = folder.addFolder('Heartbeat');
  R(beat, c, 'beats', 1, MAX_BEATS, 1, 'beats (last shatters)');
  R(beat, c, 'firstBeat', 0, 2, 0.01, 'first beat after (s)');
  R(beat, c, 'beatAccel', 0.3, 1.2, 0.01, 'each gap × (accel)');
  R(beat, c, 'dubGap', 0.05, 0.6, 0.005, 'lub → dub (× gap)');
  R(beat, c, 'dubStrength', 0, 1.5, 0.01, 'dub strength');
  R(beat, c, 'beatSwell', 0, 0.6, 0.005, 'swell (× size)');
  R(beat, c, 'beatAttack', 0.005, 0.4, 0.005, 'attack (s)');
  R(beat, c, 'beatRelease', 0.02, 1.5, 0.01, 'release (s)');
  R(beat, c, 'beatShake', 0, 1, 0.01, 'shake');
  R(beat, c, 'beatLight', 0, 30, 0.1, 'light punch');
  R(beat, c, 'beatFlash', 0, 0.5, 0.005, 'flash');

  const crystal = folder.addFolder('Crystal');
  R(crystal, c, 'crystalIOR', 0, 1.5, 0.01, 'refraction');
  R(crystal, c, 'crystalDispersion', 0, 0.5, 0.005, 'dispersion');
  R(crystal, c, 'crystalEnv', 0, 3, 0.01, 'sky in it');
  R(crystal, c, 'crystalFresnel', 0, 5, 0.05, 'fresnel');
  R(crystal, c, 'crystalFresnelPower', 0.5, 8, 0.05, 'fresnel power');
  R(crystal, c, 'crystalTint', 0, 1, 0.01, 'tint');
  R(crystal, c, 'crystalFacetLines', 0, 5, 0.05, 'cut edges');
  R(crystal, c, 'crystalSpecular', 0, 10, 0.05, 'specular');
  R(crystal, c, 'crystalGloss', 4, 400, 1, 'gloss');
  R(crystal, c, 'innerGlow', 0, 8, 0.05, 'inner light');
  R(crystal, c, 'innerBeat', 0, 16, 0.1, 'inner punch per beat');
  R(crystal, c, 'innerSize', 0.05, 1.5, 0.01, 'inner size');
  R(crystal, c, 'innerNoise', 0, 2, 0.01, 'inner swim');
  R(crystal, c, 'crystalOpacity', 0, 1, 0.01, 'opacity');
  crystal.addColor(c, 'colorCrystal').name('crystal');
  crystal.addColor(c, 'colorCrystalDeep').name('deep');
  crystal.addColor(c, 'colorInner').name('inner light');
  crystal.addColor(c, 'colorFacet').name('cut edges');
  crystal.addColor(c, 'colorSpec').name('highlight');

  const rings = folder.addFolder('2 · Ripple rings');
  R(rings, c, 'ringSpeed', 0.5, 30, 0.1, 'speed (m/s)');
  R(rings, c, 'ringReach', 0.2, 3, 0.01, 'reach (× zone)');
  R(rings, c, 'ringWidth', 0.02, 1.5, 0.01, 'width (m)');
  R(rings, c, 'ringGlow', 0, 10, 0.05, 'glow');
  R(rings, c, 'ringCaustic', 0, 3, 0.01, 'caustic wake');
  R(rings, c, 'ringOpacity', 0, 1, 0.01, 'opacity');
  R(rings, c, 'sigilGlow', 0, 4, 0.01, 'sigil glow');
  rings.addColor(c, 'colorRingCore').name('core');
  rings.addColor(c, 'colorRingGlow').name('glow');
  rings.addColor(c, 'colorRingWake').name('wake');

  const shock = folder.addFolder('3 · Shockwaves');
  R(shock, c, 'shockStrength', 0, 4, 0.01, 'strength');
  R(shock, c, 'shockSize', 0.5, 20, 0.1, 'size (m)');
  R(shock, c, 'shockTime', 0.05, 2, 0.01, 'time (s)');
  R(shock, c, 'shatterShock', 0, 5, 0.05, 'shatter (×)');

  const glints = folder.addFolder('4 · Glints');
  R(glints, c, 'glintPerBeat', 0, 200, 1, 'per beat');
  R(glints, c, 'glintSpeed', 0, 15, 0.05, 'speed');
  R(glints, c, 'glintSize', 0.01, 0.4, 0.005, 'size');
  R(glints, c, 'glintLifetime', 0.1, 4, 0.05, 'lifetime');
  R(glints, c, 'glintGravity', -15, 5, 0.1, 'gravity');
  R(glints, c, 'glintGlow', 0, 10, 0.05, 'glow');
  R(glints, c, 'idleGlints', 0, 120, 1, 'idle / s');
  Editor.gradient(glints, c, 'colorGlint', 'glint colour');

  const shatter = folder.addFolder('5 · The shatter');
  R(shatter, c, 'shardCount', 0, MAX_SHARDS, 1, 'shards');
  R(shatter, c, 'shardSpeed', 0, 25, 0.1, 'speed');
  R(shatter, c, 'shardSpeedJitter', 0, 1, 0.01, 'speed jitter');
  R(shatter, c, 'shardLift', -1, 2, 0.01, 'lift');
  R(shatter, c, 'shardGravity', -40, -0.5, 0.1, 'gravity');
  R(shatter, c, 'shardDrag', 0, 6, 0.05, 'drag');
  R(shatter, c, 'shardLife', 0.2, 5, 0.05, 'life (s)');
  R(shatter, c, 'shardSize', 0.02, 1, 0.005, 'size (m)');
  R(shatter, c, 'shardSpin', 0, 40, 0.1, 'spin (rad/s)');
  R(shatter, c, 'shardBounce', 0, 1, 0.01, 'bounce');
  R(shatter, c, 'burstRadius', 0.2, 12, 0.05, 'shell radius (m)');
  R(shatter, c, 'burstLife', 0.05, 2, 0.01, 'shell life');
  R(shatter, c, 'burstIntensity', 0, 6, 0.05, 'shell intensity');
  shatter.addColor(c, 'colorBurstA').name('shell core');
  shatter.addColor(c, 'colorBurstB').name('shell body');
  shatter.addColor(c, 'colorBurstC').name('shell edge');
  R(shatter, c, 'decalLife', 0.1, 5, 0.05, 'ring & rime life');
  shatter.addColor(c, 'colorDecalA').name('ring');
  shatter.addColor(c, 'colorDecalB').name('ring, hot');
  R(shatter, c, 'killReach', 0.1, 2, 0.01, 'kill reach (× zone)');
  R(shatter, c, 'killImpulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(shatter, c, 'killLift', 0, 20, 0.1, 'thrown up (m/s)');
  R(shatter, c, 'killSpin', 0, 4, 0.01, 'torque');
  R(shatter, c, 'shatterShake', 0, 2, 0.01, 'shake');
  R(shatter, c, 'shatterFlash', 0, 2, 0.01, 'flash');
  R(shatter, c, 'shatterLight', 0, 10, 0.05, 'light punch (× intensity)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');

  folder.close();
  return folder;
}
