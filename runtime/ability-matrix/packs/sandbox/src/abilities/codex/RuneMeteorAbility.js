import { Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createStoneInstances,
  createOrbGeometry,
  createBandGeometry,
  createBeamInstances,
  createQuadGeometry
} from '../../assets/codex/RuneMeteorGeometry.js';
import {
  MAX_STONES,
  MAX_BEAMS,
  createStoneMaterial,
  createOrbMaterial,
  createBandMaterial,
  createBeamMaterial,
  createSigilMaterial,
  createWarpMaterial
} from '../../materials/codex/RuneMeteorMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'runemeteor';

const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _p0 = new Vector3();
const _p1 = new Vector3();
const _p2 = new Vector3();
const _x = new Vector3();
const _y = new Vector3(0, 1, 0);
const _z = new Vector3();
const _up = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _qA = new Quaternion();
const _qB = new Quaternion();
const _qT = new Quaternion();
const _node = new Object3D();
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
 * RUNE METEOR — Arcane, zone cast.
 *
 * As the call runs out to the circle a sigil draws itself round it on the
 * floor — two rings, a band of runes — and high overhead a **star kindles**:
 * a cut crystal, pale and violet, wrapped in a closed bud of carved rune-stone
 * petals and wound about with two spinning rings of runes. It **drops** —
 * straight down, hanging a moment and then plummeting — down a column of
 * light it leaves standing above it. It lands in the middle of the circle:
 * a crack in the floor, a ring of dust, a flash, anything right under it
 * thrown. Then it **unfolds**: the petals burst off it and arc out tumbling
 * across the circle, growing as they fly, and plant themselves upright round
 * the rim — a **henge** of standing stones — while the star rises to hover in
 * the middle, its rune rings opening out around it and a star polygon joining
 * the stones on the floor. Beams reach from the star to every stone, and the
 * runes on the stones light one after another round the ring, faster and
 * faster, until all of them blaze — and the star **novas**: a shell of light,
 * a shock ring, everything inside the henge thrown outward. The stones crack
 * and crumble where they stand.
 *
 * Kept apart from the fire meteors (the collective's swarm and the linear
 * pack's meteor): no fire, no slanting rock, no burning trail. This one falls
 * plumb, is a crystal, and its payload is what it *becomes* when it lands.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the star** (`createOrbMaterial`) — a faceted crystal with an arcane
 *      swirl inside it and a white core.
 *   2. **the stones** (`createStoneMaterial`) — instanced pointed slabs of
 *      slate with carved, lighting runes; bud → flight → henge → crumble, all
 *      placed on the CPU every frame.
 *   3. **the rune bands** (`createBandMaterial`) — two rings of runes round
 *      the star.
 *   4. **the beams** (`createBeamMaterial`) — the column of light it falls
 *      down, and the tethers to the stones.
 *   5. **the sigil** (`createSigilMaterial`) — rings, runes and the star
 *      polygon on the floor.
 *   6. **particles** — arcane motes (SOFT), sparks (STREAK), dust (SMOKE),
 *      stone chips (CHIP, lit).
 *   7. **the warp** — `LAYER.DISTORTION` rings on the landing and the nova.
 *   8. **the beats** — landing: CRACK + DUSTRING + an EARTH puff, shake,
 *      flash; each stone planting: a DUSTRING and a knock; the nova: an AIR
 *      shell, SHOCKWAVE, flash, a hard shake, a light punch.
 *   9. **the hit** — `handlesOwnHits`: thrown up by the landing, then out by
 *      the nova.
 *
 * ## The editor rule
 *
 * A cast keeps dice (a seed, the henge's turn) and its own clock. Every size,
 * count, time and colour is read from `settings.runemeteor` every frame.
 */
export class RuneMeteorAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Stones drawn. HUD readout only. */
  get instanceCount() {
    return this._stoneCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.stoneGeometry = createStoneInstances(MAX_STONES);
    this.stoneMaterial = createStoneMaterial();
    this.stones = this._mesh(this.stoneGeometry, this.stoneMaterial, LAYER.VFX, 6);
    this._sM = [
      this.stoneGeometry.getAttribute('aM0'),
      this.stoneGeometry.getAttribute('aM1'),
      this.stoneGeometry.getAttribute('aM2'),
      this.stoneGeometry.getAttribute('aM3')
    ];
    this._sState = this.stoneGeometry.getAttribute('aState');

    this.orbGeometry = createOrbGeometry();
    this.orbMaterial = createOrbMaterial();
    this.orb = new Mesh(this.orbGeometry, this.orbMaterial);
    this.orb.layers.set(LAYER.VFX);
    this.orb.renderOrder = 7;
    this.orb.frustumCulled = false;
    this.orb.visible = false;
    this.group.add(this.orb);

    this.bandGeometry = createBandGeometry(120);
    this.bandMaterials = [createBandMaterial(), createBandMaterial()];
    this.bands = this.bandMaterials.map((m) => this._mesh(this.bandGeometry, m, LAYER.VFX, 12));

    this.beamGeometry = createBeamInstances(MAX_BEAMS);
    this.beamMaterial = createBeamMaterial();
    this.beams = this._mesh(this.beamGeometry, this.beamMaterial, LAYER.VFX, 11);
    this._bA = this.beamGeometry.getAttribute('aA');
    this._bB = this.beamGeometry.getAttribute('aB');
    this._bBeam = this.beamGeometry.getAttribute('aBeam');

    this.quadGeometry = createQuadGeometry();
    this.sigilMaterial = createSigilMaterial();
    this.sigil = this._mesh(this.quadGeometry, this.sigilMaterial, LAYER.VFX, 2);
    this.warpMaterial = createWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._t = { land: 1, unfold: 1, unfoldLen: 0.5, stagger: 0, planted: 1, nova: 1, end: 1 };
    this._center = new Vector3();
    this._orbPos = new Vector3();
    this._orbState = { swirl: 0, flare: 0, seed: 0 };
    this._bandState = { center: new Vector3(), axisA: new Vector3(), axisB: new Vector3(), radius: 1, spin: 0, fade: 1, seed: 0 };
    this._sigilState = { center: this._center, draw: 0, star: 0, blaze: 0, stones: 7, spin: 0, fade: 1, seed: 0 };
    this._warpState = { center: new Vector3(), size: 5, progress: 0 };
    this._stoneTop = [];
    this._landed = new Uint8Array(MAX_STONES);
    this._crumbled = new Uint8Array(MAX_STONES);
    for (let i = 0; i < MAX_STONES; i++) this._stoneTop.push(new Vector3());

    this._seed = 0;
    this._spin = 0;
    this._travelT = 0.5;
    this._landedOrb = false;
    this._novaDone = false;
    this._warpT = -1;
    this._warpSize = 5;
    this._flare = 0;
    this._blaze = 0;
    this._swirl = 0;
    this._bandSpin = 0;
    this._chase = 0;
    this._stoneCount = 0;
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

    this.motes = particles.get('runemeteor.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      swirl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.12;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.55;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.4;

    this.sparks = particles.get('runemeteor.sparks', {
      capacity: 1400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.1;

    this.dust = particles.get('runemeteor.dust', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1
    });
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.55;
    this.dust.uniforms.uEndSize.value = 2.6;
    this.dust.uniforms.uDrag.value = 1.5;

    this.chips = particles.get('runemeteor.chips', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.3;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uDrag.value = 0.5;

    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — its own clock, from the moment of casting                  */
  /* ------------------------------------------------------------------ */

  _timeline() {
    const c = settings[ID];
    const L = settings.global.lifetime;
    const t = this._t;
    t.land = Math.max(c.fallTime * L, this._travelT + 0.05);
    t.unfold = t.land + 0.08 * L;
    t.unfoldLen = Math.max(0.05, c.unfoldTime * L);
    t.stagger = Math.max(0, c.unfoldStagger * L);
    t.planted = t.unfold + t.unfoldLen + t.stagger;
    t.nova = t.planted + Math.max(0.05, c.chargeTime * L);
    t.end = t.nova + 0.4 * L;
    return t;
  }

  get impactDuration() {
    return Math.max(0.1, this._timeline().end - this._travelT);
  }

  /** The fade is the henge crumbling. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 7.7) * Math.sin(this.age * 3.1));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    const g = settings.global;
    this.moteEmitter.reset();
    this._seed = Math.random() * 100;
    this._spin = Math.atan2(-this.direction.z, -this.direction.x) + Math.PI / Math.max(3, Math.round(c.stones));
    this._travelT = this.length / Math.max(0.1, c.speed * g.speed);
    this._landedOrb = false;
    this._novaDone = false;
    this._warpT = -1;
    this._flare = 1;
    this._blaze = 0;
    this._swirl = 0;
    this._bandSpin = 0;
    this._chase = 0;
    this._fadeK = 0;
    this._landed.fill(0);
    this._crumbled.fill(0);
    this.pointAt(1, this._center);

    this._orbState.seed = this._seed;
    this._bandState.seed = this._seed;
    this._sigilState.seed = this._seed;

    this.orb.visible = true;
    this.stones.visible = true;
    this.bands[0].visible = true;
    this.bands[1].visible = true;
    this.beams.visible = true;
    this.sigil.visible = true;
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

  onImpact() {}

  onFade(dt, t) {
    this._fadeK = t > 1 ? saturate(t - 1) : 0;
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings[ID];
    const g = settings.global;
    const T = this._timeline();
    const t = this.age;
    const N = Math.max(3, Math.min(MAX_STONES, Math.round(c.stones)));
    this._stoneCount = N;

    this._swirl += c.swirlSpeed * dt * g.noiseSpeed;
    this._bandSpin += c.bandSpin * dt * g.animationSpeed * (t > T.planted ? 1.8 : 1);
    this._flare *= Math.exp(-dt * 4);
    this._blaze *= Math.exp(-dt * 2.5);

    /* ---- the star: falling, landed, rising to hover ---- */
    const R = Math.max(0.05, c.orbRadius);
    if (t < T.land) {
      const k = t / T.land;
      const fall = Math.pow(k, Math.max(0.5, c.fallCurve));
      this._orbPos.copy(this._center).setY(lerp(c.dropHeight, R, fall));
    } else {
      if (!this._landedOrb) this._land();
      const k = saturate((t - T.unfold) / Math.max(0.05, T.planted - T.unfold));
      this._orbPos.copy(this._center).setY(lerp(R, c.hoverHeight, Easing.outCubic(k)));
    }
    if (t >= T.nova && !this._novaDone) this._nova();

    // Kindling: it grows out of a point of light.
    const kindle = Easing.outBack(saturate(t / 0.3));
    const novaK = this._novaDone ? saturate((t - T.nova) / 0.25) : 0;
    const orbScale = R * kindle * (1 - novaK);
    this.orb.position.copy(this._orbPos);
    this.orb.scale.setScalar(Math.max(1e-4, orbScale));
    this.orb.rotation.set(t * 0.7, t * c.orbSpin, t * 0.3);
    this.orb.visible = orbScale > 0.005;
    const os = this._orbState;
    os.swirl = this._swirl;
    os.flare = this._flare + (t > T.planted ? smoothstep(T.planted, T.nova, t) : 0);
    this.orbMaterial.userData.sync(os);

    /* ---- the stones ---- */
    this._syncStones(dt, T, t, N);

    /* ---- the bands ---- */
    const open = t > T.land ? Easing.outCubic(saturate((t - T.unfold) / T.unfoldLen)) : 0;
    const bs = this._bandState;
    for (let i = 0; i < 2; i++) {
      // Falling: tilted, precessing. Hovering: laid flat and opened out.
      const tilt = lerp(i === 0 ? 0.9 : -0.6, i === 0 ? 0.12 : -0.12, open);
      const pre = this._bandSpin * (i === 0 ? 0.35 : -0.5) + i * 1.7;
      _x.set(Math.cos(pre), 0, Math.sin(pre));
      _z.set(-Math.sin(pre), 0, Math.cos(pre));
      bs.axisA.copy(_x);
      bs.axisB.copy(_z).multiplyScalar(Math.cos(tilt)).addScaledVector(_up, Math.sin(tilt));
      bs.center.copy(this._orbPos);
      bs.radius = lerp(c.bandRadius * (i === 0 ? 1 : 1.18), c.bandHoverRadius * (i === 0 ? 1 : 1.3), open);
      if (this._novaDone) bs.radius += (c.zoneRadius - bs.radius) * Easing.outCubic(novaK);
      bs.radius *= Math.max(0.2, kindle);
      bs.spin = this._bandSpin * (i === 0 ? 1 : -1.3);
      bs.fade = (1 - novaK) * (1 - this._fadeK);
      this.bandMaterials[i].userData.sync(bs);
      this.bands[i].visible = bs.fade > 0.01;
    }

    /* ---- the beams ---- */
    this._syncBeams(T, t, N, novaK);

    /* ---- the sigil ---- */
    const ss = this._sigilState;
    ss.draw = t < this._travelT ? Easing.outQuad(saturate(t / Math.max(0.05, this._travelT))) : 1;
    ss.star = t > T.unfold ? smoothstep(T.unfold, T.planted, t) : 0;
    ss.blaze = this._blaze + (t > T.planted && !this._novaDone ? 0.5 * smoothstep(T.planted, T.nova, t) : 0);
    ss.stones = N;
    ss.spin = this._spin;
    ss.fade = 1 - smoothstep(0.2, 1, this._fadeK);
    this.sigilMaterial.userData.sync(ss);

    /* ---- the warp ---- */
    const ws = this._warpState;
    if (this._warpT >= 0) {
      this._warpT += dt;
      ws.progress = saturate(this._warpT / 0.5);
      if (ws.progress >= 1) this._warpT = -1;
    } else {
      ws.progress = 0;
    }
    ws.center.copy(this._center).setY(1.2);
    ws.size = this._warpSize;
    this.warpMaterial.userData.sync(ws);
    this.warp.visible = ws.progress > 0;

    syncSystem(this.motes, c, 'colorMote', c.moteGlow, 0.4);
    this.motes.uniforms.uGravity.value.set(0, 0.3, 0);
    this.motes.uniforms.uSwirl.value = 1.2;
    syncSystem(this.sparks, c, 'colorSpark', c.sparkGlow, 0.2);
    this.sparks.uniforms.uGravity.value.set(0, -8, 0);
    this.sparks.uniforms.uStretch.value = 0.45;
    syncSystem(this.dust, c, 'colorDust', 1, 0.6);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.25, 0);
    this.dust.uniforms.uSwirl.value = 0.7;
    syncSystem(this.chips, c, 'colorChip', 0.4, 0.2);
    this.chips.uniforms.uGravity.value.set(0, -12, 0);

    if (dt > 0) this._moteFx(dt, t < T.land);
    this.stoneMaterial.userData.sync();
    this.beamMaterial.userData.sync();
    this.position.copy(this._orbPos);
  }

  /** Bud → flight → henge → crumble, every stone, every frame. */
  _syncStones(dt, T, t, N) {
    const c = settings[ID];
    const g = settings.global;
    const zone = Math.max(0.5, c.zoneRadius);
    const ringR = zone * c.ringRadius;
    const S = this._sState.array;
    const M = this._sM;
    for (let i = 0; i < MAX_STONES; i++) {
      if (i >= N) {
        S[i * 4 + 3] = 0;
        continue;
      }
      const a = this._spin + (TAU * i) / N;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      /* the bud: petals round the star, leaning in at the top */
      _z.set(ca, 0, sa);
      _x.crossVectors(_y, _z);
      _m.makeBasis(_x, _y, _z);
      _qA.setFromRotationMatrix(_m);
      _qT.setFromAxisAngle(_x.set(1, 0, 0), -0.42);
      _qA.multiply(_qT);
      const bh = c.stoneHeight * c.budScale;
      _p0.copy(this._orbPos).addScaledVector(_z.set(ca, 0, sa), c.budRadius * 0.85).addScaledVector(_up, -bh * 0.55);

      /* the henge: upright, facing in, buried a little */
      _z.set(-ca, 0, -sa);
      _x.crossVectors(_y, _z);
      _m.makeBasis(_x, _y, _z);
      _qB.setFromRotationMatrix(_m);
      _p2.set(this._center.x + ca * ringR, -c.plantDepth, this._center.z + sa * ringR);

      // When this one sets off, and how far it has got.
      const start = T.unfold + (N > 1 ? (T.stagger * i) / (N - 1) : 0);
      const k = t <= start ? 0 : saturate((t - start) / T.unfoldLen);
      let scale = c.budScale;
      if (k <= 0) {
        _node.position.copy(_p0);
        _node.quaternion.copy(_qA);
      } else {
        _p1.lerpVectors(_p0, _p2, 0.5).addScaledVector(_up, c.arcHeight);
        const s = Easing.inQuad(k) * 0.35 + k * 0.65;
        const u1 = 1 - s;
        _node.position.set(
          u1 * u1 * _p0.x + 2 * u1 * s * _p1.x + s * s * _p2.x,
          u1 * u1 * _p0.y + 2 * u1 * s * _p1.y + s * s * _p2.y,
          u1 * u1 * _p0.z + 2 * u1 * s * _p1.z + s * s * _p2.z
        );
        _node.quaternion.slerpQuaternions(_qA, _qB, Easing.inOutQuad(k));
        // Tumbling end over end on the way, upright again by the time it lands.
        _qT.setFromAxisAngle(_x.set(1, 0, 0), Math.sin(Math.PI * k) * c.tumble);
        _node.quaternion.multiply(_qT);
        scale = lerp(c.budScale, 1, smoothstep(0, 0.7, k));
        if (k >= 1 && !this._landed[i]) this._plant(i, _p2);
      }

      // The crumble, staggered round the ring, sinking as it goes.
      let crumble = 0;
      if (this._fadeK > 0) {
        crumble = saturate(this._fadeK * 1.4 - (i / N) * 0.35);
        _node.position.y -= c.stoneHeight * 0.25 * Easing.inQuad(crumble);
        if (crumble > 0.02 && !this._crumbled[i]) this._crumble(i);
      }

      _node.scale.set(c.stoneWidth * scale, c.stoneHeight * scale, c.stoneDepth * scale);
      _node.updateMatrix();
      const e = _node.matrix.elements;
      for (let col = 0; col < 4; col++) {
        const arr = M[col].array;
        arr[i * 4] = e[col * 4];
        arr[i * 4 + 1] = e[col * 4 + 1];
        arr[i * 4 + 2] = e[col * 4 + 2];
        arr[i * 4 + 3] = e[col * 4 + 3];
      }
      this._stoneTop[i].set(0, 0.86, 0).applyMatrix4(_node.matrix);

      // The runes: dim on the bud, the chase round the henge, all ablaze for the nova.
      let glow = 0.35;
      if (t > T.planted && !this._novaDone) {
        const charge = saturate((t - T.planted) / Math.max(0.05, T.nova - T.planted));
        const lit = Math.floor(this._chase) % N;
        const d = (i - lit + N) % N;
        glow = 0.4 + Math.exp(-d * 1.2) * 1.2 + charge * charge * 1.2;
      } else if (this._novaDone) {
        glow = 1.8 * (1 - this._fadeK);
      } else if (k > 0) {
        glow = 0.6;
      }
      S[i * 4] = glow;
      S[i * 4 + 1] = crumble;
      S[i * 4 + 2] = this._seed + i * 3.7;
      S[i * 4 + 3] = crumble >= 1 ? 0 : 1;
    }
    if (t > T.planted) this._chase += dt * c.chaseRate * (1 + saturate((t - T.planted) / Math.max(0.05, T.nova - T.planted)) * 2) * g.animationSpeed;
    for (let col = 0; col < 4; col++) M[col].needsUpdate = true;
    this._sState.needsUpdate = true;
  }

  _syncBeams(T, t, N, novaK) {
    const c = settings[ID];
    const A = this._bA.array;
    const B = this._bB.array;
    const W = this._bBeam.array;
    const scroll = t * 14;

    /* the column it falls down: from the star up into the sky */
    const fallen = t < T.land ? 1 : 1 - saturate((t - T.land) / 0.35);
    A[0] = this._orbPos.x;
    A[1] = this._orbPos.y;
    A[2] = this._orbPos.z;
    B[0] = this._orbPos.x;
    B[1] = this._orbPos.y + c.trailLength * Math.min(1, t * 3) * (0.3 + 0.7 * fallen);
    B[2] = this._orbPos.z;
    W[0] = c.trailWidth;
    W[1] = c.trailGlow * settings.global.glow * fallen * saturate(t * 4);
    W[2] = this._seed;
    W[3] = -scroll;

    /* tethers from the hovering star to every stone */
    const charge = t > T.planted ? saturate((t - T.planted) / Math.max(0.05, T.nova - T.planted)) : 0;
    const on = t > T.planted - 0.1 ? smoothstep(T.planted - 0.1, T.planted + 0.1, t) : 0;
    for (let i = 1; i < MAX_BEAMS; i++) {
      const j = i - 1;
      if (j >= N) {
        W[i * 4 + 1] = 0;
        continue;
      }
      const top = this._stoneTop[j];
      A[i * 3] = this._orbPos.x;
      A[i * 3 + 1] = this._orbPos.y;
      A[i * 3 + 2] = this._orbPos.z;
      B[i * 3] = top.x;
      B[i * 3 + 1] = top.y;
      B[i * 3 + 2] = top.z;
      const lit = Math.floor(this._chase) % N;
      const d = (j - lit + N) % N;
      W[i * 4] = c.tetherWidth * (1 + charge);
      W[i * 4 + 1] = c.tetherGlow * settings.global.glow * on * (1 - novaK) * (0.35 + Math.exp(-d * 1.2) * 0.8 + charge * 0.8);
      W[i * 4 + 2] = this._seed + i;
      W[i * 4 + 3] = scroll * 1.5;
    }
    this._bA.needsUpdate = true;
    this._bB.needsUpdate = true;
    this._bBeam.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  _moteFx(dt, falling) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * (1 - this._fadeK) * (this._novaDone ? 0.2 : 1)) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _emit.position = this._orbPos;
    _emit.anchor = this._orbPos;
    _emit.radius = c.bandRadius;
    _emit.direction = falling ? _up : null;
    _emit.speed = falling ? 4 : 0.6;
    _emit.spread = falling ? 0.3 : 1;
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    this.motes.emit(n, _emit);
  }

  /** It lands: a crack, dust, anything right under it thrown up. */
  _land() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._landedOrb = true;
    this._flare = 1.5;
    this._warpT = 0;
    this._warpSize = c.craterRadius * 2;
    _pos.copy(this._center).setY(0);
    this.ctx.decals.spawn(DecalType.CRACK, _pos, {
      radius: c.craterRadius,
      life: 4,
      intensity: 1,
      colorA: getColor(c.colorCrackA),
      colorB: getColor(c.colorCrackB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.craterRadius * 1.6,
      life: 1,
      intensity: 0.8,
      colorA: getColor(c.colorDustB),
      colorB: getColor(c.colorDustA)
    });
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
      radius: 0.3,
      endRadius: c.craterRadius * power,
      life: 0.6,
      intensity: 0.8,
      opacity: 0.5,
      squash: 0.45,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustB),
      colorC: getColor(c.colorDustC)
    });
    this._resetEmit();
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.5;
    _emit.direction = _up;
    _emit.speed = 2.5;
    _emit.spread = 1.3;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 0.6;
    this.dust.emit(Math.round(c.dustCount * g.particleCount), _emit);
    this._resetEmit();
    _emit.position = _pos.setY(0.3);
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.spread = 1.2;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.sparkCount * 0.6 * g.particleCount), _emit);
    _emit.speed = 6;
    _emit.size = c.chipSize;
    _emit.life = c.chipLife;
    _emit.spin = 4;
    this.chips.emit(Math.round(24 * g.particleCount), _emit);

    this._throw(c.landRadius, c.landImpulse, c.landLift);
    this.ctx.shake.add(c.landShake * power * g.cameraShake, 5, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.landFlash * power);
    this.lightBoost = c.lightIntensity * 2 * power;
  }

  /** One stone plants itself in the floor. */
  _plant(i, at) {
    const c = settings[ID];
    const g = settings.global;
    this._landed[i] = 1;
    _pos.copy(at).setY(0);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.stoneWidth * 1.6,
      life: 0.7,
      intensity: 0.6,
      colorA: getColor(c.colorDustB),
      colorB: getColor(c.colorDustA)
    });
    this._resetEmit();
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = 1.5;
    _emit.spread = 1.2;
    _emit.size = c.dustSize * 0.6;
    _emit.life = c.dustLife * 0.7;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(4 * g.particleCount), _emit);
    this.ctx.shake.add(0.12 * g.cameraShake, 9, 18);
  }

  /** The nova: the henge's charge let go from its middle. */
  _nova() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._novaDone = true;
    this._blaze = 1.5;
    this._warpT = 0;
    this._warpSize = c.zoneRadius * 1.6;
    this.ctx.bursts.spawn(BurstMode.AIR, this._orbPos, {
      radius: c.novaSize * 0.1,
      endRadius: c.novaSize * power,
      life: 0.6,
      intensity: c.novaIntensity,
      opacity: 0.75,
      fresnel: 2.4,
      displace: 0.3,
      turbulence: 1.2,
      squash: 0.75,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.copy(this._center).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * power,
      life: 0.7,
      width: 0.08,
      intensity: 1.3,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });
    this._resetEmit();
    _emit.position = this._orbPos;
    _emit.radius = 0.4;
    _emit.speed = c.sparkSpeed * 1.3;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);
    _emit.speed = 5;
    _emit.size = c.moteSize * 1.6;
    _emit.life = c.moteLife;
    this.motes.emit(Math.round(c.sparkCount * 0.7 * g.particleCount), _emit);

    this._throw(c.zoneRadius, c.novaImpulse, c.novaLift);
    this.ctx.shake.add(c.novaShake * power * g.cameraShake, 4, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.novaFlash * power);
    this.lightBoost = c.lightIntensity * c.novaLight * power;
  }

  /** A stone starts to crumble: chips and dust off it. */
  _crumble(i) {
    const c = settings[ID];
    const g = settings.global;
    this._crumbled[i] = 1;
    this._resetEmit();
    _emit.position = this._stoneTop[i];
    _emit.radius = c.stoneWidth * 0.5;
    _emit.direction = _up;
    _emit.speed = 2;
    _emit.spread = 1.2;
    _emit.size = c.chipSize;
    _emit.life = c.chipLife;
    _emit.spin = 4;
    this.chips.emit(Math.round(c.chipCount * g.particleCount), _emit);
    _emit.size = c.dustSize * 0.5;
    _emit.life = c.dustLife * 0.6;
    _emit.speed = 0.6;
    this.dust.emit(Math.round(3 * g.particleCount), _emit);
  }

  /** Throw everything within `radius` of the centre, out and up. */
  _throw(radius, impulse, lift) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(this._center.x, this._center.z, radius, _targets);
    for (let i = 0; i < found.length; i++) {
      const d = found[i];
      _dir.set(d.position.x - this._center.x, 0, d.position.z - this._center.z);
      if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
      _dir.normalize();
      _force.impulse = impulse * g.explosionIntensity;
      _force.lift = lift * g.explosionIntensity;
      _force.spin = c.hitSpin;
      if (!d.kill(_dir.x, _dir.z, _force)) continue;
      this._resetEmit();
      _pos.copy(d.position).setY(1);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * 0.5;
      _emit.spread = 0.8;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife * 0.6;
      this.sparks.emit(Math.round(20 * g.particleCount), _emit);
    }
    _targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.orb.visible = false;
    this.stones.visible = false;
    this.bands[0].visible = false;
    this.bands[1].visible = false;
    this.beams.visible = false;
    this.sigil.visible = false;
    this.warp.visible = false;
    this._warpT = -1;
  }

  dispose() {
    this.stoneGeometry.dispose();
    this.orbGeometry.dispose();
    this.bandGeometry.dispose();
    this.beamGeometry.dispose();
    this.quadGeometry.dispose();
    this.stoneMaterial.dispose();
    this.orbMaterial.dispose();
    this.bandMaterials.forEach((m) => m.dispose());
    this.beamMaterial.dispose();
    this.sigilMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('✦  Rune Meteor');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'sigil call (m/s)');
  R(cast, c, 'lifetime', 0.1, 6, 0.05, 'crumbles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'shimmer');

  const fall = folder.addFolder('1 · Fall');
  R(fall, c, 'dropHeight', 4, 60, 0.5, 'kindles at (m)');
  R(fall, c, 'fallTime', 0.2, 4, 0.01, 'falls over (s)');
  R(fall, c, 'fallCurve', 0.5, 5, 0.05, 'hang, then plummet');
  R(fall, c, 'orbRadius', 0.05, 2, 0.01, 'star radius (m)');
  R(fall, c, 'orbSpin', 0, 12, 0.05, 'star spin');
  R(fall, c, 'trailLength', 0, 40, 0.1, 'light column (m)');
  R(fall, c, 'trailWidth', 0.02, 3, 0.01, 'column width (m)');
  R(fall, c, 'trailGlow', 0, 10, 0.05, 'column glow');

  const crystal = folder.addFolder('2 · Crystal');
  R(crystal, c, 'coreGlow', 0, 15, 0.05, 'core');
  R(crystal, c, 'facetGlow', 0, 6, 0.05, 'facets');
  R(crystal, c, 'rimGlow', 0, 10, 0.05, 'rim');
  R(crystal, c, 'swirlScale', 0.2, 10, 0.05, 'swirl scale');
  R(crystal, c, 'swirlSpeed', 0, 8, 0.05, 'swirl speed');
  crystal.addColor(c, 'colorCore').name('core');
  crystal.addColor(c, 'colorCrystal').name('crystal');
  crystal.addColor(c, 'colorDeep').name('deep');
  crystal.addColor(c, 'colorRim').name('rim');

  const stones = folder.addFolder('3 · Stones');
  R(stones, c, 'stones', 3, MAX_STONES, 1, 'count');
  R(stones, c, 'stoneHeight', 0.3, 6, 0.01, 'height (m)');
  R(stones, c, 'stoneWidth', 0.1, 3, 0.01, 'width (m)');
  R(stones, c, 'stoneDepth', 0.05, 1.5, 0.01, 'depth (m)');
  R(stones, c, 'budScale', 0.1, 1, 0.01, 'size wrapped (×)');
  R(stones, c, 'budRadius', 0.1, 3, 0.01, 'wrapped at (m)');
  R(stones, c, 'ringRadius', 0.2, 1.2, 0.01, 'plant at (× circle)');
  R(stones, c, 'plantDepth', 0, 1.5, 0.01, 'buried (m)');
  R(stones, c, 'unfoldTime', 0.05, 3, 0.01, 'fly out over (s)');
  R(stones, c, 'unfoldStagger', 0, 2, 0.01, 'first to last (s)');
  R(stones, c, 'arcHeight', 0, 10, 0.05, 'arc (m)');
  R(stones, c, 'tumble', 0, 8, 0.05, 'tumble (rad)');
  R(stones, c, 'glyphGlow', 0, 10, 0.05, 'rune glow');
  R(stones, c, 'glyphScale', 1, 15, 0.1, 'runes per m');
  R(stones, c, 'stoneRim', 0, 5, 0.05, 'arcane rim');
  R(stones, c, 'crumbleEdge', 0.005, 0.4, 0.005, 'crumble edge');
  stones.addColor(c, 'colorStone').name('slate');
  stones.addColor(c, 'colorStoneLight').name('slate light');
  stones.addColor(c, 'colorGlyph').name('runes');
  stones.addColor(c, 'colorGlyphHot').name('runes ablaze');

  const bands = folder.addFolder('4 · Rune bands');
  R(bands, c, 'bandRadius', 0.1, 4, 0.01, 'radius falling (m)');
  R(bands, c, 'bandWidth', 0.02, 1, 0.005, 'width (m)');
  R(bands, c, 'bandSpin', -12, 12, 0.05, 'spin');
  R(bands, c, 'bandGlow', 0, 10, 0.05, 'glow');
  R(bands, c, 'bandHoverRadius', 0.1, 6, 0.01, 'radius hovering (m)');
  bands.addColor(c, 'colorBand').name('runes');

  const henge = folder.addFolder('5 · Henge');
  R(henge, c, 'hoverHeight', 0.3, 8, 0.05, 'star hovers at (m)');
  R(henge, c, 'chargeTime', 0.05, 4, 0.01, 'charges for (s)');
  R(henge, c, 'tetherWidth', 0.01, 0.6, 0.005, 'tether width (m)');
  R(henge, c, 'tetherGlow', 0, 10, 0.05, 'tether glow');
  R(henge, c, 'chaseRate', 0, 30, 0.1, 'stones lit per second');
  henge.addColor(c, 'colorTether').name('tethers');

  const sigil = folder.addFolder('6 · Sigil');
  R(sigil, c, 'sigilWidth', 0.05, 2, 0.01, 'rune band (m)');
  R(sigil, c, 'sigilGlow', 0, 6, 0.05, 'glow');
  R(sigil, c, 'starGlow', 0, 6, 0.05, 'star polygon glow');
  R(sigil, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  sigil.addColor(c, 'colorSigil').name('sigil');
  sigil.addColor(c, 'colorSigilHot').name('sigil ablaze');

  const fx = folder.addFolder('7 · Particles');
  R(fx, c, 'moteRate', 0, 500, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'sparkCount', 0, 600, 1, 'sparks');
  R(fx, c, 'sparkSpeed', 0, 40, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.2, 0.001, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');
  R(fx, c, 'dustCount', 0, 200, 1, 'dust on landing');
  R(fx, c, 'dustSize', 0.05, 4, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');
  R(fx, c, 'chipCount', 0, 80, 1, 'chips per stone');
  R(fx, c, 'chipSize', 0.01, 0.6, 0.005, 'chip size');
  R(fx, c, 'chipLife', 0.1, 4, 0.05, 'chip lifetime');
  Editor.gradient(fx, c, 'colorChip', 'chip gradient');

  const beats = folder.addFolder('8 · Impacts');
  R(beats, c, 'landRadius', 0, 6, 0.05, 'landing throws within (m)');
  R(beats, c, 'landShake', 0, 2, 0.01, 'landing knock');
  R(beats, c, 'landFlash', 0, 1, 0.01, 'landing flash');
  R(beats, c, 'craterRadius', 0, 8, 0.05, 'crack (m)');
  R(beats, c, 'novaSize', 0, 16, 0.05, 'nova shell (m)');
  R(beats, c, 'novaIntensity', 0, 4, 0.01, 'nova brightness');
  R(beats, c, 'novaShake', 0, 2, 0.01, 'nova knock');
  R(beats, c, 'novaFlash', 0, 1, 0.01, 'nova flash');
  R(beats, c, 'novaLight', 0, 10, 0.05, 'nova light (× intensity)');
  R(beats, c, 'shockRadius', 0, 20, 0.05, 'shockwave (m)');
  R(beats, c, 'ringWarp', 0, 4, 0.01, 'ring distortion');
  beats.addColor(c, 'colorBurstA').name('shell inner');
  beats.addColor(c, 'colorBurstB').name('shell mid');
  beats.addColor(c, 'colorBurstC').name('shell outer');
  beats.addColor(c, 'colorShock').name('shockwave');
  beats.addColor(c, 'colorCrackA').name('crack');
  beats.addColor(c, 'colorCrackB').name('crack hot');
  beats.addColor(c, 'colorFlash').name('flash');

  const hit = folder.addFolder('9 · Hit');
  R(hit, c, 'landImpulse', 0, 30, 0.1, 'landing throw (m/s)');
  R(hit, c, 'landLift', 0, 20, 0.05, 'landing lift (m/s)');
  R(hit, c, 'novaImpulse', 0, 40, 0.1, 'nova throw (m/s)');
  R(hit, c, 'novaLift', 0, 20, 0.05, 'nova lift (m/s)');
  R(hit, c, 'hitSpin', 0, 8, 0.01, 'tumble');

  folder.close();
  return folder;
}
