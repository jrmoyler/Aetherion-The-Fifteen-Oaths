import {
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createClotPlateGeometry, createClotStripGeometry } from '../../assets/codex/ClotArmorGeometry.js';
import {
  createClotPlateMaterial,
  createClotPoolMaterial,
  createClotRivuletMaterial,
  createClotWarpMaterial
} from '../../materials/codex/ClotArmorMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'clotarmor';

/** Ring capacities. The editor's count sliders clamp to these. */
const MAX_OUTER = 24;
const MAX_INNER = 16;
const MAX_PLATES = MAX_OUTER + MAX_INNER;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _tip = new Vector3();
const _centre = new Vector3();
const _out = new Vector3();
const _up = new Vector3(0, 1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _euler = new Euler(0, 0, 0, 'YXZ');
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);

/** Push one particle system's gradient and the globals through. */
function syncSystem(p, a, b, cc, d, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/** A clean emit record — every field set, so nothing leaks between emitters. */
function resetEmit() {
  _emit.position = _pos;
  _emit.radius = 0;
  _emit.direction = _up;
  _emit.speed = 0;
  _emit.speedVariance = 0.4;
  _emit.spread = 0.5;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = frame.uTime.value;
}

/**
 * CLOT ARMOR — Blood, zone cast.
 *
 * Not spikes and not a wave: **armour**. Blood runs from the caster's feet
 * down the line as a meandering rivulet and floods the circle. Out of the
 * pool, round its rim, curved plates of coagulated blood **stand up one after
 * another** — the run starts on the side nearest the caster and closes on the
 * far side — each swinging up from tilted-out to leaning-in, springing past
 * and settling. A taller inner ring follows, leaning further, so the plates
 * overlap like the lames of a pauldron and the whole thing closes into a
 * **carapace** over the circle: an artichoke of dark red shields. The moment
 * the last one locks there is a **clank** — jolt, flash, a ring of bent air,
 * a shock ring on the floor, blood flung off every tip. The armour then
 * **hardens**: the wet, mirror-glossy red dries to a matte maroon crust; it
 * throbs on a slow heartbeat and drips. Then it **fails** — cracks open and
 * burn red across each plate, they sink and fall outward, crumbling away
 * behind a hot edge into flakes — and the pool dries to a brown, cracked
 * crust and erodes.
 *
 * ## Layers
 *
 *   1. **the plates** (`createClotPlateGeometry` + `createClotPlateMaterial`)
 *      — one InstancedMesh of thick curved shields, opaque on `LAYER.WORLD`
 *      (placed through `instanceMatrix`, so they write the depth prepass and
 *      cast shadows): lames, clot lumps, wetness that dries, subsurface rim,
 *      cracks and a crumbling dissolve. Per-instance `aState` = seed, wet,
 *      crack, dissolve.
 *   2. **the pool** (`createClotPoolMaterial`) — the flooded circle with a
 *      fingered edge, sky and sun in it, a dark tide line, a ring of blood
 *      glowing round the rim while the plates rise out of it; dries, erodes.
 *   3. **the rivulet** (`createClotRivuletMaterial`) — the blood running down
 *      the line, with a bulging head that the light follows.
 *   4. **droplets** (DROPLET), **mist** (SMOKE) and **flakes** (CHIP, lit) —
 *      flung off the head, off each plate as it breaks the surface, dripping
 *      off the standing tips, and shed by each plate as it crumbles.
 *   5. **the beat** — a WATER splash and a jolt as the flood arrives; at the
 *      clank a shake, a flash, a light punch, a SHOCKWAVE decal and the
 *      distortion ring (`createClotWarpMaterial`, `LAYER.DISTORTION`).
 *
 * Hits are the engine's: everything in the circle falls when the flood
 * arrives (`u >= 1`).
 *
 * ## The editor rule
 *
 * A plate record holds dice only — an angle roll, a height roll, a crumble
 * order, a seed — and two latches (broke the surface, began to crumble).
 * Where it stands, how tall, how far it leans, when it moves and how wet it
 * is are all resolved from `settings.clotarmor` every frame, so dragging a
 * slider reshapes a carapace that is already standing.
 */
export class ClotArmorAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** Plates standing above the floor. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < MAX_PLATES; i++) if (this.plates[i].up > 0.01) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the plates ---- */
    this.plateMaterial = createClotPlateMaterial();
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_PLATES * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.plateGeometry = null;
    this._geoKey = [-1, -1, -1, -1];
    this.platesMesh = new InstancedMesh(this._plateGeometry(), this.plateMaterial, MAX_PLATES);
    this.platesMesh.name = 'ClotArmorPlates';
    this.platesMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.platesMesh.layers.set(LAYER.WORLD);
    this.platesMesh.castShadow = true;
    this.platesMesh.frustumCulled = false;
    this.platesMesh.count = MAX_PLATES;
    this.platesMesh.visible = false;
    this.group.add(this.platesMesh);

    /* ---- layer 2: the pool ---- */
    this.poolGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.poolMaterial = createClotPoolMaterial();
    this.pool = this._mesh(this.poolGeometry, this.poolMaterial, LAYER.VFX, 2);

    /* ---- layer 3: the rivulet ---- */
    this.stripGeometry = createClotStripGeometry(128, 4);
    this.rivuletMaterial = createClotRivuletMaterial();
    this.rivulet = this._mesh(this.stripGeometry, this.rivuletMaterial, LAYER.VFX, 1);

    /* ---- layer 5: the clank's bent air ---- */
    this.warpGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.warpGeometry.rotateX(-Math.PI / 2);
    this.warpMaterial = createClotWarpMaterial();
    this.warp = this._mesh(this.warpGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    /** Dice and latches only — see the class comment. */
    this.plates = [];
    for (let i = 0; i < MAX_PLATES; i++) {
      this.plates.push({
        inner: i >= MAX_OUTER,
        slot: i < MAX_OUTER ? i : i - MAX_OUTER,
        aDice: 0,
        hDice: 0,
        cDice: 0,
        seed: 0,
        broke: false,
        crumbling: false,
        up: 0 // 0..1 how far out of the floor this frame — HUD and drips
      });
    }

    this._poolState = { centre: new Vector3(), spread: 0, radius: 4, seed: 0, dry: 0, erode: 0, ring: 0 };
    this._rivState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      front: 0,
      seed: 0,
      dry: 0,
      erode: 0
    };
    this._seed = 0;
    this._clock = -1;
    this._clankAt = -1;
    this._arrival = 0;
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.drops = particles.get('clotarmor.drops', {
      capacity: 2400,
      shape: ParticleShape.DROPLET,
      additive: false,
      softFade: 0.1
    });
    this.drops.uniforms.uDrag.value = 0.3;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uSizeIn.value = 0.03;
    this.drops.uniforms.uFadeIn.value = 0.02;
    this.drops.uniforms.uFadeOut.value = 0.3;

    this.mist = particles.get('clotarmor.mist', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.8
    });
    this.mist.uniforms.uDrag.value = 1.4;
    this.mist.uniforms.uEndSize.value = 2.2;
    this.mist.uniforms.uSizeIn.value = 0.2;
    this.mist.uniforms.uFadeIn.value = 0.2;
    this.mist.uniforms.uFadeOut.value = 0.55;

    this.flakes = particles.get('clotarmor.flakes', {
      capacity: 1600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.flakes.uniforms.uDrag.value = 0.6;
    this.flakes.uniforms.uEndSize.value = 0.7;
    this.flakes.uniforms.uSizeIn.value = 0.02;
    this.flakes.uniforms.uFadeIn.value = 0.01;
    this.flakes.uniforms.uFadeOut.value = 0.3;

    this.trailEmitter = new RateEmitter();
    this.dripEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
  }

  /** The plate, rebuilt only when its shape sliders move. */
  _plateGeometry() {
    const c = settings[ID];
    const curve = Math.max(0, c.plateCurve);
    const bulge = c.plateBulge;
    const taper = saturate(c.plateTaper);
    const thick = Math.max(0.005, c.plateThickness) / Math.max(0.1, c.plateWidth);
    const k = this._geoKey;
    if (this.plateGeometry && k[0] === curve && k[1] === bulge && k[2] === taper && k[3] === thick) {
      return this.plateGeometry;
    }
    k[0] = curve;
    k[1] = bulge;
    k[2] = taper;
    k[3] = thick;
    const old = this.plateGeometry;
    this.plateGeometry = createClotPlateGeometry(curve, bulge, taper, thick);
    this.plateGeometry.setAttribute('aState', this.stateAttr);
    if (this.platesMesh) this.platesMesh.geometry = this.plateGeometry;
    old?.dispose();
    return this.plateGeometry;
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _riseStart(p, c, g) {
    const lead = Math.max(0.02, c.floodTime) * saturate(c.riseLead);
    // Angular distance from where the blood arrived, 0 (near) .. 1 (far side).
    const order = this._order(p, c);
    return (lead + order * Math.max(0, c.riseSpread) + (p.inner ? Math.max(0, c.innerDelay) : 0)) * g.lifetime;
  }

  _order(p, c) {
    const n = p.inner ? this._innerN(c) : this._outerN(c);
    const half = p.inner ? 0.5 : 0;
    // Slots fan out both ways from the arrival side: 0, +1, −1, +2, −2 …
    const s = (p.slot + half) / n;
    return Math.abs(((s + 0.5) % 1) - 0.5) * 2;
  }

  _outerN(c) {
    return Math.max(3, Math.min(MAX_OUTER, Math.round(c.outerCount)));
  }

  _innerN(c) {
    return Math.max(0, Math.min(MAX_INNER, Math.round(c.innerCount)));
  }

  _riseTime() {
    return Math.max(0.03, settings[ID].riseTime);
  }

  /** When the last plate settles: the clank. */
  _lockTime(c, g) {
    const lead = Math.max(0.02, c.floodTime) * saturate(c.riseLead);
    const inner = this._innerN(c) > 0 ? Math.max(0, c.innerDelay) : 0;
    return (lead + Math.max(0, c.riseSpread) + inner) * g.lifetime + this._riseTime();
  }

  get impactDuration() {
    const c = settings[ID];
    const g = settings.global;
    return this._lockTime(c, g) + Math.max(0.05, c.lifetime * g.lifetime);
  }

  get fadeDuration() {
    const c = settings[ID];
    const g = settings.global;
    return (Math.max(0, c.crumbleSpread) + Math.max(0.05, c.crumbleTime) + Math.max(0.05, c.poolFade)) * g.lifetime;
  }

  /** Blood does not gutter; it throbs. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.5 + f * 0.5 * this._beat();
  }

  /** 0..1 heartbeat envelope — a lub and a softer dub. */
  _beat() {
    const c = settings[ID];
    if (this._clankAt < 0 || this._clock < this._clankAt) return 0;
    const t = ((this._clock - this._clankAt) * Math.max(0.05, c.beatRate)) % 1;
    return Math.exp(-Math.pow((t - 0.08) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((t - 0.28) / 0.05, 2));
  }

  /** 0..1 → 0..1 with an adjustable spring past the end (0 = outCubic). */
  _spring(k, overshoot) {
    const c1 = Math.max(0, overshoot) * 2.6;
    const t = k - 1;
    return 1 + (c1 + 1) * t * t * t + c1 * t * t;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._clankAt = -1;
    // The plates are numbered from the side the blood arrives on: the caster's.
    this._arrival = Math.atan2(-this.direction.z, -this.direction.x);
    this.trailEmitter.reset();
    this.dripEmitter.reset();
    this.mistEmitter.reset();

    for (let i = 0; i < MAX_PLATES; i++) {
      const p = this.plates[i];
      p.aDice = Math.random() * 2 - 1;
      p.hDice = Math.random() * 2 - 1;
      p.cDice = Math.random();
      p.seed = Math.random();
      p.broke = false;
      p.crumbling = false;
      p.up = 0;
    }
    this._plateGeometry();
    this.stateAttr.array.fill(0);
    this.stateAttr.needsUpdate = true;
    for (let i = 0; i < MAX_PLATES; i++) this.platesMesh.setMatrixAt(i, _zero);
    this.platesMesh.instanceMatrix.needsUpdate = true;
    this.platesMesh.visible = false;
    this.pool.visible = false;
    this.warp.visible = false;
    this.rivulet.visible = true;

    const rs = this._rivState;
    rs.seed = this._seed;
    rs.dry = 0;
    rs.erode = 0;
    this._poolState.seed = this._seed;
    this._sync();
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.plateMaterial.userData.sync(this._beat());

    syncSystem(this.drops, c.colorDropA, c.colorDropB, c.colorDropC, c.colorDropD, 1, 0.05);
    this.drops.uniforms.uGravity.value.set(0, c.dropGravity, 0);
    syncSystem(this.mist, c.colorMistA, c.colorMistB, c.colorMistC, c.colorMistD, 1, 0.5);
    this.mist.uniforms.uOpacity.value = c.mistOpacity * g.opacity;
    this.mist.uniforms.uGravity.value.set(0, 0.15, 0);
    syncSystem(this.flakes, c.colorFlakeA, c.colorFlakeB, c.colorFlakeC, c.colorFlakeD, 1, 0.1);
    this.flakes.uniforms.uGravity.value.set(0, -9, 0);

    /* the rivulet: from the caster's feet to the circle's heart */
    const rs = this._rivState;
    rs.start.copy(this.origin);
    rs.dir.copy(this.direction);
    rs.side.copy(this.side);
    rs.length = Math.max(0.5, this.length);
    rs.front = this._clock < 0 ? this.front : this.length + 1;
    this.rivuletMaterial.userData.sync(rs);
  }

  /* ------------------------------------------------------------------ */
  /* The carapace, per frame                                             */
  /* ------------------------------------------------------------------ */

  _updatePlates(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._plateGeometry();
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const R = Math.max(0.5, c.zoneRadius);
    const riseT = this._riseTime();
    const nO = this._outerN(c);
    const nI = this._innerN(c);
    const beat = this._beat();
    const harden = this._clankAt >= 0 ? smoothstep(0, Math.max(0.05, c.hardenTime), clock - this._clankAt) : 0;
    const crumbleSpread = Math.max(0, c.crumbleSpread) * g.lifetime;
    const crumbleT = Math.max(0.05, c.crumbleTime) * g.lifetime;
    const state = this.stateAttr.array;
    this.pointAt(1, _centre);

    let allUp = true;
    for (let i = 0; i < MAX_PLATES; i++) {
      const p = this.plates[i];
      const n = p.inner ? nI : nO;
      const k4 = i * 4;
      if (p.slot >= n || clock < 0) {
        this.platesMesh.setMatrixAt(i, _zero);
        state[k4 + 3] = 1;
        p.up = 0;
        continue;
      }

      /* --- where it stands --- */
      const slot = (p.slot + (p.inner ? 0.5 : 0) + p.aDice * c.angleJitter * 0.5 * g.randomness) / n;
      const a = this._arrival + slot * TAU;
      const radius = p.inner ? R * saturate(c.innerRadius) : Math.max(0.2, R - c.rimInset);
      _out.set(Math.cos(a), 0, Math.sin(a));
      const H = Math.max(0.1, (p.inner ? c.innerHeight : c.plateHeight) * (1 + p.hDice * c.sizeJitter * g.randomness));
      const W = Math.max(0.1, c.plateWidth * (p.inner ? 0.88 : 1));
      const lean = p.inner ? c.innerLean : c.outerLean;

      /* --- rising --- */
      const start = this._riseStart(p, c, g);
      const k = saturate((clock - start) / riseT);
      if (k <= 0) allUp = false;
      if (k > 0 && !p.broke) {
        p.broke = true;
        this._breakFx(_pos.copy(_centre).addScaledVector(_out, radius), c, g);
      }
      let y = -H * 1.02 * (1 - Easing.outCubic(k));
      let tilt = lerp(-0.45, lean, k > 0 ? this._spring(k, c.overshoot) : 0);
      let crack = 0;
      let dissolve = 0;

      /* --- failing --- */
      if (fading) {
        const order = lerp(this._order(p, c), p.cDice, 0.6 * g.randomness);
        const k2 = saturate((ft - order * crumbleSpread) / crumbleT);
        if (k2 > 0 && !p.crumbling) {
          p.crumbling = true;
          this._crumbleFx(_pos.copy(_centre).addScaledVector(_out, radius).setY(H * 0.5), c, g, H);
        }
        crack = saturate(k2 * 2.4);
        dissolve = saturate((k2 - 0.25) / 0.75);
        y -= c.crumbleSink * H * Easing.inQuad(k2);
        tilt -= c.crumbleTilt * Easing.inQuad(k2);
      }
      p.up = saturate(1 + y / H) * (1 - dissolve);

      /* --- the instance --- */
      const swell = 1 + beat * c.beatAmp * (fading ? 1 - crack : 1);
      _euler.set(-tilt, Math.atan2(_out.x, _out.z), 0);
      _q.setFromEuler(_euler);
      _pos.copy(_centre).addScaledVector(_out, radius).setY(y);
      _scale.set(W * swell, H * swell, W * swell);
      _m.compose(_pos, _q, _scale);
      this.platesMesh.setMatrixAt(i, _m);
      state[k4] = p.seed;
      state[k4 + 1] = 1 - harden * 0.9;
      state[k4 + 2] = crack;
      state[k4 + 3] = dissolve;
    }
    this.platesMesh.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
    this.platesMesh.visible = clock >= 0;

    /* --- the clank: the moment the last plate locks --- */
    if (clock >= 0 && this._clankAt < 0 && allUp && clock >= this._lockTime(c, g)) {
      this._clankAt = clock;
      this._clankFx(c, g);
    }

    /* --- drips off the standing tips, mist round the rim --- */
    if (clock >= 0 && dt > 0) this._standFx(dt, c, g, nO, nI, R);
  }

  _updateGround() {
    const c = settings[ID];
    const g = settings.global;
    const clock = this._clock;
    const R = Math.max(0.5, c.zoneRadius);
    const fading = this.phase === AbilityPhase.FADE;
    const ps = this._poolState;
    this.pointAt(1, ps.centre);
    ps.radius = R;
    ps.spread = clock < 0 ? 0 : Easing.outCubic(saturate(clock / Math.max(0.02, c.floodTime * g.lifetime))) * (R + c.poolMargin);
    const lock = this._lockTime(c, g);
    ps.ring = clock < 0 ? 0 : smoothstep(0, 0.2, clock) * (1 - smoothstep(lock, lock + 0.6, clock));
    const dry = this._clankAt >= 0 ? smoothstep(0, Math.max(0.05, c.hardenTime) * 2.5, clock - this._clankAt) : 0;
    ps.dry = dry;
    let erode = 0;
    if (fading) {
      const fd = this.fadeDuration;
      const pf = Math.max(0.05, c.poolFade * g.lifetime);
      erode = saturate((this.fadeTime - (fd - pf)) / pf);
    }
    ps.erode = erode;
    this.poolMaterial.userData.sync(ps);
    this.pool.visible = clock >= 0;

    const rs = this._rivState;
    rs.dry = clock < 0 ? 0 : saturate(dry + smoothstep(0, 1.5, clock) * 0.5);
    rs.erode = fading ? saturate(this.fadeTime / Math.max(0.05, this.fadeDuration * 0.6)) : 0;
    this.rivuletMaterial.userData.sync(rs);
    this.rivulet.visible = rs.erode < 1;

    /* the clank's warp ring */
    if (this._clankAt >= 0) {
      const k = saturate((clock - this._clankAt) / Math.max(0.05, c.warpTime));
      this.warpMaterial.userData.sync(k);
      this.warp.position.set(ps.centre.x, 0.35, ps.centre.z);
      this.warp.scale.setScalar(Math.max(0.5, c.warpRadius));
      this.warp.updateMatrix();
      this.warp.visible = k < 1;
    } else {
      this.warp.visible = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** One plate breaking the surface of the pool: droplets thrown up off its foot. */
  _breakFx(at, c, g) {
    resetEmit();
    _emit.position = at.setY(0.1);
    _emit.radius = c.plateWidth * 0.35;
    _emit.speed = c.dropSpeed;
    _emit.spread = 0.55;
    _emit.size = c.dropSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.dropLifetime;
    this.drops.emit(Math.round(c.dropCount * g.particleCount), _emit);
    _emit.speed = 0.6;
    _emit.spread = 1;
    _emit.size = c.mistSize * 0.6;
    _emit.life = c.mistLifetime * 0.6;
    _emit.spin = 0.5;
    this.mist.emit(Math.round(2 * g.particleCount), _emit);
  }

  /** The carapace locks shut. */
  _clankFx(c, g) {
    const power = g.explosionIntensity;
    this.pointAt(1, _centre);
    this.ctx.shake.add(c.clankShake * power, 3.5, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.clankFlash * power);
    this.lightBoost = c.clankLight * power;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    // Blood flung off every tip as the plates slam home.
    resetEmit();
    _emit.speed = c.dropSpeed * 0.7;
    _emit.spread = 0.9;
    _emit.size = c.dropSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.dropLifetime;
    const per = Math.max(1, Math.round(c.dropCount * 0.4 * g.particleCount));
    for (let i = 0; i < MAX_PLATES; i++) {
      const p = this.plates[i];
      if (p.up < 0.5) continue;
      this._tipOf(i, _tip);
      _emit.position = _tip;
      this.drops.emit(per, _emit);
    }
  }

  /** One plate failing: flakes off its face, a puff of red mist. */
  _crumbleFx(at, c, g, H) {
    resetEmit();
    _emit.position = at;
    _emit.radius = Math.max(0.3, H * 0.35);
    _emit.speed = c.flakeSpeed;
    _emit.spread = 1;
    _emit.size = c.flakeSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.flakeLifetime;
    _emit.spin = 8;
    this.flakes.emit(Math.round(c.flakeCount * g.particleCount), _emit);
    _emit.speed = 0.5;
    _emit.size = c.mistSize;
    _emit.life = c.mistLifetime;
    _emit.spin = 0.4;
    this.mist.emit(Math.round(3 * g.particleCount), _emit);
  }

  /** The world point near the top of plate `i`, read back from its matrix. */
  _tipOf(i, out) {
    this.platesMesh.getMatrixAt(i, _m);
    return out.set(0, 0.92, 0.05).applyMatrix4(_m);
  }

  _standFx(dt, c, g, nO, nI, R) {
    const fading = this.phase === AbilityPhase.FADE;
    const live = this._clankAt >= 0 && !fading;
    const drips = Math.round(this.dripEmitter.tick(dt, live ? c.dripRate : 0) * g.particleCount);
    if (drips > 0) {
      resetEmit();
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.size = c.dropSize * 0.7;
      _emit.life = c.dropLifetime * 1.2;
      for (let k = 0; k < drips; k++) {
        const i = (Math.random() * MAX_PLATES) | 0;
        const p = this.plates[i];
        if (p.up < 0.5 || p.slot >= (p.inner ? nI : nO)) continue;
        this._tipOf(i, _tip);
        _emit.position = _tip;
        this.drops.emit(1, _emit);
      }
    }
    const mists = Math.round(this.mistEmitter.tick(dt, this._clock >= 0 && !fading ? c.mistRate : c.mistRate * 0.3) * g.particleCount);
    if (mists > 0) {
      resetEmit();
      _emit.speed = 0.35;
      _emit.spread = 1;
      _emit.size = c.mistSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.4;
      this.pointAt(1, _centre);
      for (let k = 0; k < mists; k++) {
        const a = Math.random() * TAU;
        const r = R * Math.sqrt(Math.random());
        _emit.position = _pos.set(_centre.x + Math.cos(a) * r, 0.25, _centre.z + Math.sin(a) * r);
        this.mist.emit(1, _emit);
      }
    }
  }

  /** The running head: droplets flicked forward off it. */
  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.trailEmitter.tick(dt, c.trailDrops) * g.particleCount);
    if (n <= 0) return;
    resetEmit();
    _emit.position = _pos.copy(this.position).setY(0.08);
    _emit.radius = 0.15;
    _emit.direction = _out.copy(this.direction).multiplyScalar(0.6).add(_up).normalize();
    _emit.speed = c.dropSpeed * 0.5;
    _emit.spread = 0.6;
    _emit.size = c.dropSize * 0.7;
    _emit.life = c.dropLifetime * 0.6;
    this.drops.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._sync();
    this._travelFx(dt);
    this._updatePlates(dt);
    this._updateGround();
    this.position.y = 0.4;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._clock = 0;
    this.pointAt(1, _centre);
    // The flood arrives.
    this.ctx.shake.add(c.arriveShake * power, 5, 18);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos.copy(_centre).setY(0.25), {
      radius: 0.3,
      endRadius: c.splashRadius * power,
      life: c.splashLife,
      intensity: 1.2,
      opacity: 0.85 * g.opacity,
      squash: 0.35,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    resetEmit();
    _emit.position = _pos.copy(_centre).setY(0.1);
    _emit.radius = 0.4;
    _emit.speed = c.dropSpeed * 1.1;
    _emit.spread = 0.7;
    _emit.size = c.dropSize * 1.2;
    _emit.sizeVariance = 0.6;
    _emit.life = c.dropLifetime;
    this.drops.emit(Math.round(c.dropCount * 3 * g.particleCount), _emit);
    this.lightBoost = c.lightIntensity * 0.6;
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._sync();
    this._updatePlates(dt);
    this._updateGround();
    this.pointAt(1, _centre);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._clankAt = -1;
    for (let i = 0; i < MAX_PLATES; i++) this.plates[i].up = 0;
    this.platesMesh.visible = false;
    this.pool.visible = false;
    this.rivulet.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    this.plateGeometry?.dispose();
    this.poolGeometry.dispose();
    this.stripGeometry.dispose();
    this.warpGeometry.dispose();
    this.plateMaterial.dispose();
    this.poolMaterial.dispose();
    this.rivuletMaterial.dispose();
    this.warpMaterial.dispose();
    this.platesMesh.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛨  Clot Armor');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'blood runs at (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, pale');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'floodTime', 0.02, 2, 0.01, 'flood over');
  R(time, c, 'riseLead', 0, 1, 0.01, 'first plate after (× flood)');
  R(time, c, 'riseSpread', 0, 2, 0.01, 'ring runs round over');
  R(time, c, 'riseTime', 0.03, 1.5, 0.01, 'one plate stands over');
  R(time, c, 'innerDelay', 0, 1, 0.01, 'inner ring follows by');
  R(time, c, 'overshoot', 0, 1, 0.01, 'overshoot');
  R(time, c, 'lifetime', 0.05, 6, 0.05, 'stands for');
  R(time, c, 'hardenTime', 0.05, 4, 0.05, 'hardens over');
  R(time, c, 'crumbleSpread', 0, 2, 0.01, 'failing spreads over');
  R(time, c, 'crumbleTime', 0.05, 3, 0.01, 'one plate crumbles over');
  R(time, c, 'poolFade', 0.05, 3, 0.05, 'pool erodes over');

  const plates = folder.addFolder('1 · Plates');
  R(plates, c, 'outerCount', 3, MAX_OUTER, 1, 'outer ring');
  R(plates, c, 'innerCount', 0, MAX_INNER, 1, 'inner ring');
  R(plates, c, 'plateWidth', 0.2, 4, 0.01, 'width (m)');
  R(plates, c, 'plateHeight', 0.2, 6, 0.01, 'outer height (m)');
  R(plates, c, 'innerHeight', 0.2, 6, 0.01, 'inner height (m)');
  R(plates, c, 'innerRadius', 0.1, 1, 0.01, 'inner ring (× circle)');
  R(plates, c, 'rimInset', -1, 2, 0.01, 'outer ring inset (m)');
  R(plates, c, 'outerLean', -0.5, 1.4, 0.01, 'outer lean (rad)');
  R(plates, c, 'innerLean', -0.5, 1.4, 0.01, 'inner lean (rad)');
  R(plates, c, 'plateCurve', 0, 1.2, 0.01, 'curl');
  R(plates, c, 'plateBulge', -0.4, 0.6, 0.01, 'belly');
  R(plates, c, 'plateTaper', 0, 1, 0.01, 'taper');
  R(plates, c, 'plateThickness', 0.01, 0.6, 0.005, 'thickness (m)');
  R(plates, c, 'sizeJitter', 0, 0.6, 0.01, 'height jitter');
  R(plates, c, 'angleJitter', 0, 1, 0.01, 'angle jitter');
  R(plates, c, 'beatAmp', 0, 0.2, 0.005, 'heartbeat swell');
  R(plates, c, 'beatRate', 0.1, 4, 0.05, 'beats / s');
  R(plates, c, 'crumbleSink', 0, 1.2, 0.01, 'sink as it fails (× h)');
  R(plates, c, 'crumbleTilt', 0, 1.5, 0.01, 'fall outward (rad)');

  const look = plates.addFolder('Clot');
  look.addColor(c, 'colorCrust').name('crust');
  look.addColor(c, 'colorClot').name('clot');
  look.addColor(c, 'colorWet').name('wet');
  look.addColor(c, 'colorInner').name('inner face');
  look.addColor(c, 'colorRim').name('rim light');
  look.addColor(c, 'colorCrack').name('cracks');
  R(look, c, 'lames', 0, 10, 0.1, 'lames per plate');
  R(look, c, 'lameDepth', 0, 1, 0.01, 'lame depth');
  R(look, c, 'lumpScale', 0.2, 8, 0.05, 'lump scale');
  R(look, c, 'lumpBump', 0, 2, 0.01, 'lump bump');
  R(look, c, 'wetGloss', 4, 200, 1, 'wet gloss');
  R(look, c, 'wetSpecular', 0, 4, 0.01, 'wet specular');
  R(look, c, 'envSheen', 0, 2, 0.01, 'sky sheen');
  R(look, c, 'plateDiffuse', 0, 2, 0.01, 'diffuse');
  R(look, c, 'plateAmbient', 0, 1, 0.01, 'ambient');
  R(look, c, 'rimGlow', 0, 6, 0.05, 'rim glow');
  R(look, c, 'innerGlow', 0, 6, 0.05, 'inner glow');
  R(look, c, 'crackScale', 0.5, 10, 0.05, 'crack scale');
  R(look, c, 'crackGlow', 0, 12, 0.05, 'crack glow');
  R(look, c, 'crumbleGlow', 0, 12, 0.05, 'crumble edge glow');

  const ground = folder.addFolder('2 · Pool & rivulet');
  ground.addColor(c, 'colorPoolDeep').name('deep');
  ground.addColor(c, 'colorPoolFresh').name('fresh');
  ground.addColor(c, 'colorPoolDried').name('dried');
  R(ground, c, 'poolMargin', -1, 2, 0.01, 'floods past rim (m)');
  R(ground, c, 'poolRagged', 0, 2, 0.01, 'ragged edge (m)');
  R(ground, c, 'poolFingers', 0, 2, 0.01, 'runners (m)');
  R(ground, c, 'poolGloss', 4, 300, 1, 'gloss');
  R(ground, c, 'poolSpecular', 0, 4, 0.01, 'specular');
  R(ground, c, 'poolSheen', 0, 2, 0.01, 'sky sheen');
  R(ground, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(ground, c, 'tideLine', 0, 1, 0.01, 'tide line');
  R(ground, c, 'rimRunGlow', 0, 6, 0.05, 'rim ring glow');
  R(ground, c, 'rivuletWidth', 0.05, 1.5, 0.01, 'rivulet width (m)');
  R(ground, c, 'rivuletMeander', 0, 1.5, 0.01, 'rivulet meander (m)');

  const fx = folder.addFolder('3 · Droplets, mist, flakes');
  R(fx, c, 'dropCount', 0, 60, 1, 'drops per plate');
  R(fx, c, 'dropSpeed', 0, 15, 0.1, 'drop speed');
  R(fx, c, 'dropSize', 0.01, 0.4, 0.005, 'drop size');
  R(fx, c, 'dropLifetime', 0.1, 3, 0.05, 'drop lifetime');
  R(fx, c, 'dropGravity', -30, 0, 0.5, 'drop gravity');
  R(fx, c, 'dripRate', 0, 200, 1, 'drips / s');
  R(fx, c, 'trailDrops', 0, 400, 1, 'head drops / s');
  Editor.gradient(fx, c, 'colorDrop', 'drop colour');
  R(fx, c, 'mistRate', 0, 120, 1, 'mist / s');
  R(fx, c, 'mistSize', 0.1, 4, 0.05, 'mist size');
  R(fx, c, 'mistLifetime', 0.1, 5, 0.05, 'mist lifetime');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(fx, c, 'colorMist', 'mist colour');
  R(fx, c, 'flakeCount', 0, 80, 1, 'flakes per plate');
  R(fx, c, 'flakeSize', 0.01, 0.5, 0.005, 'flake size');
  R(fx, c, 'flakeSpeed', 0, 10, 0.05, 'flake speed');
  R(fx, c, 'flakeLifetime', 0.1, 4, 0.05, 'flake lifetime');
  Editor.gradient(fx, c, 'colorFlake', 'flake colour');

  const beat = folder.addFolder('4 · The beat');
  R(beat, c, 'arriveShake', 0, 1, 0.01, 'flood jolt');
  R(beat, c, 'clankShake', 0, 1.5, 0.01, 'clank shake');
  R(beat, c, 'clankFlash', 0, 1, 0.01, 'clank flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'clankLight', 0, 80, 0.5, 'light punch');
  R(beat, c, 'splashRadius', 0, 8, 0.05, 'splash (m)');
  R(beat, c, 'splashLife', 0.05, 3, 0.01, 'splash life');
  beat.addColor(c, 'colorBurstA').name('splash, bright');
  beat.addColor(c, 'colorBurstB').name('splash, body');
  beat.addColor(c, 'colorBurstC').name('splash, dark');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'warpStrength', 0, 3, 0.01, 'air bend');
  R(beat, c, 'warpRadius', 0.5, 15, 0.05, 'air bend reach (m)');
  R(beat, c, 'warpWidth', 0.01, 0.5, 0.005, 'air bend width');
  R(beat, c, 'warpTime', 0.05, 2, 0.01, 'air bend over');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 6, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'throb');
}
