import {
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createMirrorGeometry, createBristleGeometry, archParams, paneArchParams } from '../../assets/codex/HoarfrostMirrorGeometry.js';
import {
  createMirrorPaneMaterial,
  createRimeCrustMaterial,
  createMirrorFloorMaterial,
  createBlastMaterial,
  createBlastWarpMaterial
} from '../../materials/codex/HoarfrostMirrorMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'hoarfrost';

/** Hard ceiling on bristles round the frame. The editor's slider clamps to this. */
const MAX_BRISTLES = 96;
/** Outline samples the bristles are rooted on. */
const RIM_SAMPLES = 96;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _heart = new Vector3();
const _face = new Vector3();
const _right = new Vector3();
const _up = new Vector3(0, 1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);

const _paneState = { arch: null, y0: 0, height: 3, seed: 0, frost: 0, charge: 0, flash: 0, crack: 0, shatter: 0 };
const _crustState = { charge: 0, flash: 0, dissolve: 0, seed: 0 };
const _floorState = { centre: new Vector3(), radius: 4, spread: 0, seed: 0, inhale: 0, blast: -1, erode: 0 };
const _bandState = { intensity: 0, seed: 0 };
const _warpState = { strength: 0, seed: 0 };

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

/**
 * HOARFROST MIRROR — Frost, zone cast.
 *
 * A line of rime crawls along the floor to the circle. Where it arrives the
 * floor **freezes to black, polished ice**, and out of it rises **a mirror**:
 * a tall gothic pointed arch of black ice set in a crust of rime, turned to
 * face the caster. It stands and **drinks the cold in** — motes of frost are
 * drawn out of the whole circle into the glass, rings of light run inward
 * across the frozen floor, hoarfrost creeps in from the frame across the
 * glass in fern-veined fronts, and a crown of hoarfrost spikes grows out
 * round the frame. A cold light swells in its heart. Then it **throws the
 * cold back out**: the glass flashes white and a wall of gale races out of
 * the mirror in every direction, past the edge of the circle, flinging every
 * body it passes outward and frosting it as it goes. The glass is left
 * crazed with glowing cracks; it stands a beat, then **shatters** along them
 * into a fountain of shards and glitter, sinking as it goes, and the black
 * ice thaws away under it.
 *
 * Not a field of spikes (Ice, Glacier Crown, Permafrost) or a wall of snow
 * (Avalanche): the one silhouette here is a *standing plane* — a window of
 * ice — and the one motion is a breath in and a breath out.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the mirror** — two extrusions of the same two-centred arch
 *      (`createMirrorGeometry`): the pane in `createMirrorPaneMaterial`
 *      (sky reflection, fern frost crept in on an analytic arch SDF, a cold
 *      heart, a crack net, a crack-led dissolve) and the frame in the rime
 *      crust. Opaque on `LAYER.WORLD`, casting shadows.
 *   2. **the bristles** — an InstancedMesh of hoarfrost spikes rooted along
 *      the frame's outline, fanned off its normal, grown during the charge
 *      with a spring.
 *   3. **the mirror floor** — black ice reflecting the sky, hoarfrost
 *      feathered in from its rim, inhale rings, the throw's bright front.
 *   4. **the inhale** — SOFT motes spawned across the circle on velocities
 *      aimed at the mirror's heart, so they all arrive in the glass.
 *   5. **the throw** — two open cylinders of additive gale (a front and a
 *      dimmer wake) plus a third on `LAYER.DISTORTION`; STREAK gusts and
 *      rolling SMOKE mist thrown outward; a FROST burst, a SHOCKWAVE sized
 *      to the throw's reach, flash, shake and a light punch.
 *   6. **the shatter** — CHIP shards and glitter off the pane, a FROST burst,
 *      the frame and bristles dissolving, the rig sinking.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. Nothing is touched until the throw: then every standing
 * body inside the gale wall's current radius is frosted (`corrode`) and
 * killed with a blow straight out from the mirror.
 *
 * ## The editor rule
 *
 * Bristle records hold dice only. Every metre and second — the arch, the
 * frame, the reach of the frost, the throw, the timing — is resolved from
 * `settings.hoarfrost` every frame, and the arch is re-extruded whenever one
 * of its dimensions moves.
 */
export class HoarfrostMirrorAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bristles currently standing. HUD readout only. */
  get instanceCount() {
    return this.bristles.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* the rig: everything that rises, in mirror space */
    this.rig = new Group();
    this.rig.name = 'HoarfrostMirrorRig';
    this.group.add(this.rig);

    this.paneMaterial = createMirrorPaneMaterial();
    this.crustMaterial = createRimeCrustMaterial();
    this._geoKey = [-1, -1, -1, -1, -1, -1];
    this.paneGeometry = null;
    this.frameGeometry = null;
    this.rim = null;
    this.rimCount = 0;

    /* ---- layer 1: the mirror ---- */
    this.pane = new Mesh(undefined, this.paneMaterial);
    this.pane.name = 'HoarfrostPane';
    this.frameMesh = new Mesh(undefined, this.crustMaterial);
    this.frameMesh.name = 'HoarfrostFrame';
    for (const m of [this.pane, this.frameMesh]) {
      m.layers.set(LAYER.WORLD);
      m.castShadow = true;
      m.frustumCulled = false;
      this.rig.add(m);
    }
    this._rebuild();

    /* ---- layer 2: the bristles ---- */
    this.bristleGeometry = createBristleGeometry();
    this.bristles = new InstancedMesh(this.bristleGeometry, this.crustMaterial, MAX_BRISTLES);
    this.bristles.name = 'HoarfrostBristles';
    this.bristles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bristles.layers.set(LAYER.WORLD);
    this.bristles.castShadow = true;
    this.bristles.frustumCulled = false;
    this.bristles.count = 0;
    this.rig.add(this.bristles);
    this.bristleDice = new Float32Array(MAX_BRISTLES * 4); // length, lean in-plane, lean out-of-plane, delay

    /* ---- layer 3: the mirror floor ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createMirrorFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'HoarfrostFloor';
    this.floor.layers.set(LAYER.VFX);
    this.floor.frustumCulled = false;
    this.floor.renderOrder = 2;
    this.group.add(this.floor);

    /* ---- layer 5: the throw ---- */
    this.bandGeometry = new CylinderGeometry(1, 1, 1, 72, 1, true);
    this.bandGeometry.translate(0, 0.5, 0);
    this.blastMaterial = createBlastMaterial();
    this.wakeMaterial = createBlastMaterial();
    this.warpMaterial = createBlastWarpMaterial();
    this.blast = new Mesh(this.bandGeometry, this.blastMaterial);
    this.wake = new Mesh(this.bandGeometry, this.wakeMaterial);
    this.warp = new Mesh(this.bandGeometry, this.warpMaterial);
    this.blast.name = 'HoarfrostThrow';
    this.wake.name = 'HoarfrostThrowWake';
    this.warp.name = 'HoarfrostThrowWarp';
    for (const m of [this.blast, this.wake]) {
      m.layers.set(LAYER.VFX);
      m.renderOrder = 4;
    }
    this.warp.layers.set(LAYER.DISTORTION);
    for (const m of [this.blast, this.wake, this.warp]) {
      m.frustumCulled = false;
      m.visible = false;
      this.group.add(m);
    }

    this._seed = 0;
    this._yaw = 0;
    this._travelled = 0;
    this._blasted = false;
    this._shattered = false;
    this._rose = false;
    this._blastR = -1;
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('hoarfrost.mote', { capacity: 2400, shape: ParticleShape.SOFT, additive: true, softFade: 0.2 });
    this.motes.uniforms.uDrag.value = 0;
    this.motes.uniforms.uEndSize.value = 0.25;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.15;
    this.motes.uniforms.uFadeOut.value = 0.2;

    this.gusts = particles.get('hoarfrost.gust', { capacity: 1600, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 });
    this.gusts.uniforms.uDrag.value = 1.2;
    this.gusts.uniforms.uEndSize.value = 0.4;
    this.gusts.uniforms.uSizeIn.value = 0.02;
    this.gusts.uniforms.uFadeIn.value = 0.02;
    this.gusts.uniforms.uFadeOut.value = 0.6;

    this.mist = particles.get('hoarfrost.mist', { capacity: 900, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.6 });
    this.mist.uniforms.uDrag.value = 1.4;
    this.mist.uniforms.uEndSize.value = 2.4;
    this.mist.uniforms.uSizeIn.value = 0.1;
    this.mist.uniforms.uFadeIn.value = 0.08;
    this.mist.uniforms.uFadeOut.value = 0.6;

    this.shards = particles.get('hoarfrost.shard', { capacity: 1600, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.shards.uniforms.uDrag.value = 0.35;
    this.shards.uniforms.uEndSize.value = 0.7;
    this.shards.uniforms.uSizeIn.value = 0.02;
    this.shards.uniforms.uFadeIn.value = 0.01;
    this.shards.uniforms.uFadeOut.value = 0.3;

    this.inhaleEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /**
   * Re-extrude the arch when one of its dimensions moved. Compared as
   * numbers against the last build, so a still slider costs nothing.
   */
  _rebuild() {
    const c = settings[ID];
    const k = this._geoKey;
    if (
      this.paneGeometry !== null &&
      k[0] === c.mirrorWidth &&
      k[1] === c.mirrorHeight &&
      k[2] === c.archShoulder &&
      k[3] === c.frameWidth &&
      k[4] === c.paneDepth &&
      k[5] === c.frameDepth
    ) {
      return;
    }
    k[0] = c.mirrorWidth;
    k[1] = c.mirrorHeight;
    k[2] = c.archShoulder;
    k[3] = c.frameWidth;
    k[4] = c.paneDepth;
    k[5] = c.frameDepth;
    const built = createMirrorGeometry(c.mirrorWidth, c.mirrorHeight, c.archShoulder, c.frameWidth, c.paneDepth, c.frameDepth, RIM_SAMPLES);
    this.paneGeometry?.dispose();
    this.frameGeometry?.dispose();
    this.paneGeometry = built.pane;
    this.frameGeometry = built.frame;
    this.rim = built.rim;
    this.rimCount = built.rimCount;
    this.pane.geometry = this.paneGeometry;
    this.frameMesh.geometry = this.frameGeometry;
    this._arch = paneArchParams(c.mirrorWidth, c.mirrorHeight, c.archShoulder, c.frameWidth);
    this._outer = archParams(c.mirrorWidth, c.mirrorHeight, c.archShoulder);
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _T(x) {
    return Math.max(0.03, x * settings.global.lifetime);
  }

  get impactDuration() {
    const c = settings[ID];
    return this._T(c.riseTime) + this._T(c.chargeTime) + this._T(c.blastTime) + this._T(c.standTime);
  }

  get fadeDuration() {
    const c = settings[ID];
    return this._T(c.shatterTime) + this._T(c.lifetime);
  }

  /** Ice glints; at the throw it blazes. */
  lightShimmer() {
    return 0.88 + 0.12 * Math.sin(this.age * 7.1) * Math.sin(this.age * 2.3 + 0.7);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    // Turned to face the caster.
    this._yaw = Math.atan2(-this.direction.x, -this.direction.z);
    this._travelled = 0;
    this._blasted = false;
    this._shattered = false;
    this._rose = false;
    this._blastR = -1;
    this._targets.length = 0;
    this.inhaleEmitter.reset();
    this.trailEmitter.reset();
    for (let i = 0; i < MAX_BRISTLES * 4; i++) this.bristleDice[i] = Math.random();
    for (let i = 0; i < MAX_BRISTLES; i++) this.bristles.setMatrixAt(i, _zero);
    this.bristles.instanceMatrix.needsUpdate = true;
    this.bristles.count = 0;
    this.rig.visible = false;
    this.floor.visible = false;
    this.blast.visible = false;
    this.wake.visible = false;
    this.warp.visible = false;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.inhaleSize, c.inhaleGlow * g.glow, 0.1);
    this.motes.uniforms.uGravity.value.set(0, 0, 0);
    syncSystem(this.gusts, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.gustSize, c.inhaleGlow * g.glow, 0.2);
    this.gusts.uniforms.uGravity.value.set(0, 0.4, 0);
    this.gusts.uniforms.uStretch.value = c.gustStretch;
    syncSystem(this.mist, c.colorMistA, c.colorMistB, c.colorMistC, c.colorMistD, c.mistSize, 1, 0.6);
    this.mist.uniforms.uOpacity.value = c.mistOpacity * g.opacity;
    this.mist.uniforms.uGravity.value.set(0, 0.15, 0);
    syncSystem(this.shards, c.colorShardA, c.colorShardB, c.colorShardC, c.colorShardD, c.shardSize, 1, 0.05);
    this.shards.uniforms.uGravity.value.set(0, c.shardGravity, 0);
  }

  /** Mirror space → world: the rig's right and facing vectors. */
  _frameVectors() {
    _face.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    _right.set(_face.z, 0, -_face.x);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Everything after the landing, resolved from the one clock. `t` runs
   * through the impact phase and on through the fade.
   */
  _updateMirror(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._rebuild();
    const fading = this.phase === AbilityPhase.FADE;
    const t = fading ? this.impactDuration + this.fadeTime : this.impactTime;
    const R = Math.max(0.5, c.zoneRadius);

    const riseT = this._T(c.riseTime);
    const chargeT = this._T(c.chargeTime);
    const blastT = this._T(c.blastTime);
    const chargeStart = riseT;
    const blastStart = riseT + chargeT;
    const shatterT = this._T(c.shatterTime);
    const ft = fading ? this.fadeTime : 0;

    /* --- the rise --- */
    const kr = saturate(t / riseT);
    const ov = Math.max(0, c.riseOvershoot) * 2.6;
    const rise = kr >= 1 ? 1 : 1 + (ov + 1) * Math.pow(kr - 1, 3) + ov * Math.pow(kr - 1, 2);
    const kc = saturate((t - chargeStart) / chargeT);
    const kb = saturate((t - blastStart) / blastT);
    const ks = fading ? saturate(ft / shatterT) : 0;
    const charge = t < blastStart ? Easing.inQuad(kc) : Math.exp(-(t - blastStart) * 5);
    const flash = t >= blastStart ? Math.exp(-(t - blastStart) * 7) : 0;

    if (!this._rose && t > 0.02) {
      this._rose = true;
      this.ctx.shake.add(c.riseShake * g.explosionIntensity, 4, 16);
    }

    this.pointAt(1, _centre);
    this._frameVectors();
    const H = Math.max(0.2, c.mirrorHeight);
    const sway = c.mirrorSway * Math.sin(t * 9.0) * kc * (t < blastStart ? 1 : 0);
    // The throw kicks the top back a hair.
    const recoil = t >= blastStart ? -0.12 * flash : 0;
    this.rig.position.set(_centre.x, -H * (1 - rise) - c.sinkDepth * Easing.inQuad(ks), _centre.z);
    this.rig.rotation.set(recoil, this._yaw + sway, sway * 0.4);
    this.rig.visible = true;

    /* --- the pane --- */
    const frost = c.frostReach * Easing.outCubic(saturate((t - chargeStart * 0.6) / (chargeT + chargeStart * 0.4)));
    const crack = t >= blastStart ? c.crackReach * Easing.outCubic(saturate((t - blastStart) / (blastT + this._T(c.standTime) * 0.6))) : 0;
    _paneState.arch = this._arch;
    _paneState.y0 = this._arch.y0;
    _paneState.height = H;
    _paneState.seed = this._seed;
    _paneState.frost = frost;
    _paneState.charge = charge;
    _paneState.flash = flash;
    _paneState.crack = crack;
    _paneState.shatter = ks;
    this.paneMaterial.userData.sync(_paneState);
    _crustState.charge = charge;
    _crustState.flash = flash;
    _crustState.dissolve = ks;
    _crustState.seed = this._seed;
    this.crustMaterial.userData.sync(_crustState);

    /* --- the bristles --- */
    this._updateBristles(c, g, t, chargeStart, chargeT, ks);

    /* --- the floor --- */
    const spread = R * Easing.outCubic(saturate(t / this._T(c.floorSpreadTime)));
    const gf = this._T(c.lifetime);
    const erode = fading ? saturate((ft - shatterT * 0.4) / gf) : 0;
    const blastR = t >= blastStart ? lerp(0.6, R * c.blastReach, Easing.outCubic(kb)) : -1;
    _floorState.centre.copy(_centre);
    _floorState.radius = R;
    _floorState.spread = spread;
    _floorState.seed = this._seed;
    _floorState.inhale = t < blastStart ? smoothstep(0, 0.3, kc) : 0;
    _floorState.blast = kb < 1 ? blastR : -1;
    _floorState.erode = erode;
    this.floorMaterial.userData.sync(_floorState);
    this.floor.visible = true;

    /* --- the throw --- */
    this._updateThrow(c, g, t, blastStart, kb, blastR);

    /* --- the inhale --- */
    if (t >= chargeStart && t < blastStart) this._inhaleFx(dt, c, g, kc);

    /* --- the shatter --- */
    if (fading && !this._shattered) {
      this._shattered = true;
      this._shatterFx(c, g);
    }

    /* the light sits in the mirror's heart */
    this.position.set(_centre.x, c.lightHeight * rise, _centre.z);
  }

  _updateBristles(c, g, t, chargeStart, chargeT, ks) {
    const n = Math.min(MAX_BRISTLES, Math.max(0, Math.round(c.bristleCount)));
    const growT = Math.max(0.03, chargeT * saturate(c.bristleGrow));
    const rim = this.rim;
    const rc = this.rimCount;
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const d = i * 4;
      const len0 = c.bristleLength * (1 - saturate(c.bristleJitter) * this.bristleDice[d] * 0.75);
      const delay = this.bristleDice[d + 3] * (chargeT - growT) * g.randomness;
      const k = saturate((t - chargeStart * 0.8 - delay) / growT);
      // A spring on the way out: Easing.outBack.
      const grow = k <= 0 ? 0 : Easing.outBack(k);
      const len = len0 * grow * (1 - ks);
      if (len <= 0.005 || rc === 0) {
        this.bristles.setMatrixAt(i, _zero);
        continue;
      }
      const s = Math.min(rc - 1, Math.floor(((i + 0.5) / n) * rc));
      const x = rim[s * 4];
      const y = rim[s * 4 + 1];
      const nx = rim[s * 4 + 2];
      const ny = rim[s * 4 + 3];
      // Fan off the outline normal, in the plane and out of it.
      const lean = (this.bristleDice[d + 1] - 0.5) * 2 * c.bristleLean * g.randomness;
      const ca = Math.cos(lean);
      const sa = Math.sin(lean);
      const out = (this.bristleDice[d + 2] - 0.5) * 2 * c.bristleLean * 0.8 * g.randomness;
      _dir.set(nx * ca - ny * sa, nx * sa + ny * ca, Math.sin(out)).normalize();
      _q.setFromUnitVectors(_up, _dir);
      _pos.set(x - nx * 0.04, y - ny * 0.04, 0);
      const w = c.bristleWidth * (0.6 + 0.4 * grow);
      _scale.set(w, len, w);
      _m.compose(_pos, _q, _scale);
      this.bristles.setMatrixAt(i, _m);
      shown++;
    }
    for (let i = n; i < MAX_BRISTLES; i++) this.bristles.setMatrixAt(i, _zero);
    this.bristles.count = n;
    this.bristles.visible = shown > 0;
    this.bristles.instanceMatrix.needsUpdate = true;
  }

  _updateThrow(c, g, t, blastStart, kb, blastR) {
    const active = t >= blastStart && kb < 1;
    this.blast.visible = active;
    this.wake.visible = active;
    this.warp.visible = active;
    if (!active) return;

    if (!this._blasted) {
      this._blasted = true;
      this._blastFx(c, g);
    }

    const H = Math.max(0.2, c.blastHeight) * lerp(1, saturate(c.blastThin), kb);
    const fadeIn = smoothstep(0, 0.06, kb);
    const intensity = c.blastIntensity * Math.pow(1 - kb, 1.2) * fadeIn;
    this.blast.position.set(_centre.x, 0, _centre.z);
    this.blast.scale.set(blastR, H, blastR);
    _bandState.intensity = intensity;
    _bandState.seed = this._seed;
    this.blastMaterial.userData.sync(_bandState);

    const wr = Math.max(0.3, blastR * saturate(c.blastTrail));
    this.wake.position.set(_centre.x, 0, _centre.z);
    this.wake.scale.set(wr, H * 0.75, wr);
    _bandState.intensity = intensity * 0.45;
    _bandState.seed = this._seed + 17;
    this.wakeMaterial.userData.sync(_bandState);

    this.warp.position.set(_centre.x, 0, _centre.z);
    this.warp.scale.set(blastR * 1.04, H * 1.1, blastR * 1.04);
    _warpState.strength = (1 - kb) * fadeIn;
    _warpState.seed = this._seed;
    this.warpMaterial.userData.sync(_warpState);

    this._throwBodies(c, g, blastR);
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _throwBodies(c, g, radius) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(_centre.x, _centre.z, radius, this._targets);
    if (found.length === 0) return;
    const power = g.explosionIntensity;
    const look = this._look;
    look.color = c.colorBodyFrozen;
    look.rimColor = c.colorBodyRim;
    look.rimEmissive = c.bodyRimGlow;
    look.edgeColor = c.colorBodyEdge;
    look.edgeEmissive = c.bodyEdgeGlow;
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      dummy.corrode(c.frostTint, look);
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      if (dummy.kill(_dir.x, _dir.z, this._force)) {
        // A puff of rime where it was standing.
        _pos.set(dummy.position.x, 1, dummy.position.z);
        _emit.position = _pos;
        _emit.radius = 0.4;
        _emit.direction = _dir;
        _emit.speed = c.mistSpeed;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.6;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.6;
        _emit.sizeVariance = 0.5;
        _emit.life = c.mistLifetime * 0.7;
        _emit.lifeVariance = 0.3;
        _emit.spin = 0.5;
        _emit.tint = null;
        _emit.time = frame.uTime.value;
        this.mist.emit(Math.round(8 * g.particleCount), _emit);
      }
    }
    this._targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** Motes spawned across the circle on velocities aimed at the glass. */
  _inhaleFx(dt, c, g, kc) {
    const count = Math.round(this.inhaleEmitter.tick(dt, c.inhaleRate * (0.3 + 0.7 * kc)) * g.particleCount);
    if (count <= 0) return;
    const R = Math.max(0.5, c.zoneRadius);
    const life = Math.max(0.1, c.inhaleLifetime);
    _heart.set(_centre.x, Math.max(0.3, c.mirrorHeight * 0.45), _centre.z);
    _emit.radius = 0;
    _emit.speedVariance = 0;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.6;
    _emit.life = life;
    _emit.lifeVariance = 0;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const r = R * (0.45 + 0.6 * Math.random());
      _pos.set(_centre.x + Math.cos(a) * r, 0.05 + Math.random() * c.inhaleHeight, _centre.z + Math.sin(a) * r);
      _dir.subVectors(_heart, _pos);
      const dist = _dir.length();
      _dir.multiplyScalar(1 / Math.max(1e-4, dist));
      _emit.position = _pos;
      _emit.direction = _dir;
      // Arrive at the glass as the mote dies (particle speed is × the global).
      _emit.speed = (dist / life) / Math.max(0.05, g.particleSpeed * g.particleLifetime);
      this.motes.emit(1, _emit);
    }
  }

  _blastFx(c, g) {
    const power = g.explosionIntensity;
    const R = Math.max(0.5, c.zoneRadius);
    this.ctx.shake.add(c.blastShake * power, 3, 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.blastFlash * power);
    this.lightBoost = c.blastLight * power;
    _pos.set(_centre.x, c.mirrorHeight * 0.45, _centre.z);
    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: 0.4,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      opacity: 0.8 * g.opacity,
      squash: 0.55,
      colorA: getColor(c.colorBlastA),
      colorB: getColor(c.colorBlastB),
      colorC: getColor(c.colorRimeShadow)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: R * c.blastReach * power,
      life: c.shockLife,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.FROST, _centre, {
      radius: R * 1.15,
      life: this.fadeDuration + this._T(c.standTime),
      intensity: 0.8,
      colorA: getColor(c.colorTrailA),
      colorB: getColor(c.colorTrailB),
      height: 0.02
    });

    const time = frame.uTime.value;
    _emit.radius = 0.15;
    _emit.speedVariance = 0.35;
    _emit.spread = 0.08;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.lifeVariance = 0.35;
    _emit.tint = null;
    _emit.time = time;
    const gusts = Math.round(c.gustCount * g.particleCount);
    for (let k = 0; k < gusts; k++) {
      const a = Math.random() * TAU;
      const r = 0.4 + Math.random() * 0.6;
      _dir.set(Math.cos(a), 0.04 + Math.random() * 0.1, Math.sin(a));
      _pos.set(_centre.x + _dir.x * r, 0.15 + Math.random() * c.blastHeight * 0.7, _centre.z + _dir.z * r);
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = c.gustSpeed;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.5;
      _emit.life = c.gustLifetime;
      _emit.spin = 0;
      this.gusts.emit(1, _emit);
    }
    const mists = Math.round(c.mistCount * g.particleCount);
    _emit.spread = 0.25;
    for (let k = 0; k < mists; k++) {
      const a = Math.random() * TAU;
      _dir.set(Math.cos(a), 0.08, Math.sin(a));
      _pos.set(_centre.x + _dir.x * 0.8, 0.3 + Math.random() * 0.6, _centre.z + _dir.z * 0.8);
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = c.mistSpeed;
      _emit.size = 0.7;
      _emit.sizeVariance = 0.5;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.6;
      this.mist.emit(1, _emit);
    }
  }

  /** The pane coming apart: shards and glitter off the glass, toward the caster and back. */
  _shatterFx(c, g) {
    const power = g.explosionIntensity;
    this._frameVectors();
    this.ctx.shake.add(c.shatterShake * power, 5, 22);
    this.lightBoost = c.blastLight * 0.35 * power;
    const a = this._arch;
    const time = frame.uTime.value;
    _emit.radius = 0.05;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.lifeVariance = 0.4;
    _emit.tint = null;
    _emit.time = time;
    const n = Math.round(c.shardCount * g.particleCount);
    const ng = Math.round(c.glitterCount * g.particleCount);
    for (let k = 0; k < n + ng; k++) {
      const lx = (Math.random() * 2 - 1) * a.halfW * 0.9;
      const ly = a.y0 + Math.random() * (a.shoulder + (a.height - a.shoulder) * (1 - Math.abs(lx) / a.halfW));
      _pos.copy(this.rig.position).addScaledVector(_right, lx).setY(this.rig.position.y + ly);
      const side = Math.random() < 0.7 ? 1 : -1;
      _dir.copy(_face).multiplyScalar(side).addScaledVector(_right, lx * 0.6);
      _dir.y += 0.3;
      _emit.position = _pos;
      _emit.direction = _dir;
      if (k < n) {
        _emit.speed = c.shardSpeed;
        _emit.size = 0.12;
        _emit.sizeVariance = 0.7;
        _emit.life = c.shardLifetime;
        _emit.spin = 10;
        this.shards.emit(1, _emit);
      } else {
        _emit.speed = c.shardSpeed * 0.35;
        _emit.size = c.glitterSize / Math.max(0.01, c.inhaleSize) * 0.08;
        _emit.sizeVariance = 0.6;
        _emit.life = c.glitterLifetime;
        _emit.spin = 0;
        this.motes.emit(1, _emit);
      }
    }
    _pos.copy(this.rig.position).setY(Math.max(0.5, this.rig.position.y + c.mirrorHeight * 0.45));
    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * 0.6 * power,
      life: c.burstLife * 0.8,
      intensity: 1,
      opacity: 0.6 * g.opacity,
      squash: 0.8,
      colorA: getColor(c.colorShardA),
      colorB: getColor(c.colorShardB),
      colorC: getColor(c.colorShardD)
    });
  }

  /** The rime track crawling to the circle. */
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
        intensity: 1,
        colorA: getColor(c.colorTrailA),
        colorB: getColor(c.colorTrailB),
        height: 0.02
      });
    }
    const count = Math.round(this.trailEmitter.tick(dt, c.trailGlitter) * g.particleCount);
    if (count > 0) {
      _emit.position = _pos.copy(this.position).setY(0.15);
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = 1.2;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.8;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.07;
      _emit.sizeVariance = 0.6;
      _emit.life = 0.6;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(count, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._sync();
    this._travelFx(dt);
    this.position.y = 0.3;
  }

  onImpact() {
    this._sync();
    this.lightBoost = settings[ID].lightIntensity * 0.5;
  }

  onFade(dt) {
    this._sync();
    this._updateMirror(dt);
  }

  onDestroy() {
    this.rig.visible = false;
    this.floor.visible = false;
    this.blast.visible = false;
    this.wake.visible = false;
    this.warp.visible = false;
    this.bristles.count = 0;
    this._targets.length = 0;
  }

  dispose() {
    this.paneGeometry?.dispose();
    this.frameGeometry?.dispose();
    this.bristleGeometry.dispose();
    this.floorGeometry.dispose();
    this.bandGeometry.dispose();
    this.paneMaterial.dispose();
    this.crustMaterial.dispose();
    this.floorMaterial.dispose();
    this.blastMaterial.dispose();
    this.wakeMaterial.dispose();
    this.warpMaterial.dispose();
    this.bristles.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛩  Hoarfrost Mirror');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'rime track speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.05, 5, 0.05, 'floor thaws over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'riseTime', 0.05, 2, 0.01, 'rises over');
  R(time, c, 'riseOvershoot', 0, 1, 0.01, 'rise overshoot');
  R(time, c, 'chargeTime', 0.05, 3, 0.01, 'draws the cold in over');
  R(time, c, 'blastTime', 0.05, 2, 0.01, 'throw reaches out over');
  R(time, c, 'standTime', 0, 3, 0.01, 'cracked mirror stands for');
  R(time, c, 'shatterTime', 0.05, 2, 0.01, 'shatters over');

  const mirror = folder.addFolder('1 · Mirror');
  R(mirror, c, 'mirrorWidth', 0.4, 6, 0.05, 'width (m)');
  R(mirror, c, 'mirrorHeight', 0.5, 8, 0.05, 'height (m)');
  R(mirror, c, 'archShoulder', 0.1, 0.9, 0.01, 'arch begins at (× height)');
  R(mirror, c, 'frameWidth', 0.02, 0.8, 0.01, 'frame (m)');
  R(mirror, c, 'paneDepth', 0.01, 0.4, 0.005, 'glass thickness (m)');
  R(mirror, c, 'frameDepth', 0.03, 0.8, 0.01, 'frame thickness (m)');
  R(mirror, c, 'mirrorSway', 0, 0.2, 0.001, 'sway while charging (rad)');
  R(mirror, c, 'sinkDepth', 0, 3, 0.05, 'sinks as it shatters (m)');
  const glass = mirror.addFolder('Glass');
  R(glass, c, 'mirrorReflect', 0, 3, 0.01, 'reflection');
  R(glass, c, 'mirrorFresnel', 0.5, 8, 0.05, 'fresnel power');
  R(glass, c, 'mirrorSheen', 0, 3, 0.01, 'sheen sweep');
  R(glass, c, 'mirrorShimmer', 0, 3, 0.01, 'reflection breathes');
  glass.addColor(c, 'colorGlassDeep').name('black ice');
  glass.addColor(c, 'colorGlassSky').name('sky tint');
  const frost = mirror.addFolder('Hoarfrost on the glass');
  R(frost, c, 'frostReach', 0, 3, 0.01, 'creeps in (m)');
  R(frost, c, 'frostScale', 0.2, 10, 0.05, 'fern scale');
  R(frost, c, 'frostRagged', 0, 1, 0.01, 'front wander (m)');
  R(frost, c, 'frostOpacity', 0, 1, 0.01, 'whiteness');
  frost.addColor(c, 'colorFrost').name('frost');
  const charge = mirror.addFolder('Charge & cracks');
  R(charge, c, 'chargeGlow', 0, 12, 0.05, 'cold heart');
  R(charge, c, 'flashGlow', 0, 20, 0.1, 'throw flash');
  charge.addColor(c, 'colorGlow').name('cold light');
  R(charge, c, 'crackScale', 0.2, 6, 0.05, 'crack cells / m');
  R(charge, c, 'crackGlow', 0, 12, 0.05, 'crack glow');
  R(charge, c, 'crackReach', 0, 6, 0.05, 'cracks spread (m)');
  charge.addColor(c, 'colorCrack').name('cracks');

  const crust = folder.addFolder('2 · Rime crust & bristles');
  R(crust, c, 'crustNoise', 0.2, 12, 0.05, 'crust scale');
  R(crust, c, 'crustGlow', 0, 6, 0.05, 'inner glow');
  R(crust, c, 'crustRim', 0, 4, 0.05, 'rim');
  R(crust, c, 'crustSparkle', 0, 8, 0.05, 'glints');
  R(crust, c, 'crustAmbient', 0, 1.5, 0.01, 'ambient');
  crust.addColor(c, 'colorRime').name('rime');
  crust.addColor(c, 'colorRimeShadow').name('rime, hollows');
  R(crust, c, 'bristleCount', 0, MAX_BRISTLES, 1, 'bristles');
  R(crust, c, 'bristleLength', 0.05, 2, 0.01, 'length (m)');
  R(crust, c, 'bristleWidth', 0.01, 0.4, 0.005, 'width (m)');
  R(crust, c, 'bristleJitter', 0, 1, 0.01, 'length variety');
  R(crust, c, 'bristleLean', 0, 1.2, 0.01, 'fan (rad)');
  R(crust, c, 'bristleGrow', 0.05, 1, 0.01, 'grow over (× charge)');

  const floor = folder.addFolder('3 · Mirror floor');
  R(floor, c, 'floorSpreadTime', 0.05, 2, 0.01, 'freezes over (s)');
  R(floor, c, 'floorReflect', 0, 3, 0.01, 'reflection');
  R(floor, c, 'floorRimWidth', 0, 3, 0.05, 'hoarfrost rim (m)');
  R(floor, c, 'floorRimRagged', 0, 1.5, 0.01, 'rim wander (m)');
  R(floor, c, 'ringSpacing', 0.1, 3, 0.01, 'inhale ring spacing (m)');
  R(floor, c, 'ringSpeed', 0, 10, 0.05, 'inhale ring speed');
  R(floor, c, 'ringGlow', 0, 8, 0.05, 'inhale ring glow');
  R(floor, c, 'floorBlastGlow', 0, 10, 0.05, 'throw front glow');
  floor.addColor(c, 'colorFloorIce').name('black ice');

  const inhale = folder.addFolder('4 · Inhale');
  R(inhale, c, 'inhaleRate', 0, 800, 1, 'motes / s');
  R(inhale, c, 'inhaleSize', 0.005, 0.4, 0.005, 'size');
  R(inhale, c, 'inhaleLifetime', 0.1, 2, 0.01, 'flight time');
  R(inhale, c, 'inhaleHeight', 0, 5, 0.05, 'start height (m)');
  R(inhale, c, 'inhaleGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(inhale, c, 'colorMote', 'mote colour');

  const thr = folder.addFolder('5 · The throw');
  R(thr, c, 'blastReach', 0.5, 4, 0.01, 'reach (× circle)');
  R(thr, c, 'blastHeight', 0.2, 6, 0.05, 'height (m)');
  R(thr, c, 'blastThin', 0, 1, 0.01, 'height left at full reach');
  R(thr, c, 'blastIntensity', 0, 5, 0.05, 'brightness');
  R(thr, c, 'blastTrail', 0, 1, 0.01, 'wake wall (× radius)');
  R(thr, c, 'blastStreaks', 2, 120, 1, 'streaks');
  R(thr, c, 'blastStreakSpeed', 0, 10, 0.05, 'streak speed');
  R(thr, c, 'blastWarp', 0, 4, 0.05, 'distortion');
  thr.addColor(c, 'colorBlastA').name('gale, bright');
  thr.addColor(c, 'colorBlastB').name('gale, cold');
  R(thr, c, 'gustCount', 0, 800, 1, 'gust streaks');
  R(thr, c, 'gustSpeed', 0, 40, 0.1, 'gust speed');
  R(thr, c, 'gustSize', 0.005, 0.4, 0.005, 'gust size');
  R(thr, c, 'gustLifetime', 0.05, 2, 0.01, 'gust lifetime');
  R(thr, c, 'gustStretch', 0, 2, 0.01, 'gust stretch');
  R(thr, c, 'mistCount', 0, 300, 1, 'mist puffs');
  R(thr, c, 'mistSize', 0.05, 4, 0.05, 'mist size');
  R(thr, c, 'mistSpeed', 0, 20, 0.1, 'mist speed');
  R(thr, c, 'mistLifetime', 0.1, 5, 0.05, 'mist lifetime');
  R(thr, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(thr, c, 'colorMist', 'mist colour');

  const sh = folder.addFolder('6 · Shatter');
  R(sh, c, 'shardCount', 0, 600, 1, 'shards');
  R(sh, c, 'shardSpeed', 0, 20, 0.1, 'shard speed');
  R(sh, c, 'shardSize', 0.01, 0.6, 0.005, 'shard size');
  R(sh, c, 'shardLifetime', 0.1, 4, 0.05, 'shard lifetime');
  R(sh, c, 'shardGravity', -40, 0, 0.5, 'shard gravity');
  R(sh, c, 'glitterCount', 0, 600, 1, 'glitter');
  R(sh, c, 'glitterSize', 0.005, 0.3, 0.005, 'glitter size');
  R(sh, c, 'glitterLifetime', 0.1, 4, 0.05, 'glitter lifetime');
  Editor.gradient(sh, c, 'colorShard', 'shard colour');

  const hit = folder.addFolder('7 · Bodies');
  R(hit, c, 'hitImpulse', 0, 30, 0.1, 'thrown out (m/s)');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'lift (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hit, c, 'frostTint', 0, 1, 0.01, 'frosted');
  hit.addColor(c, 'colorBodyFrozen').name('frosted body');
  hit.addColor(c, 'colorBodyRim').name('rim');
  R(hit, c, 'bodyRimGlow', 0, 6, 0.05, 'rim glow');
  hit.addColor(c, 'colorBodyEdge').name('edge');
  R(hit, c, 'bodyEdgeGlow', 0, 8, 0.05, 'edge glow');

  const beat = folder.addFolder('8 · The beat');
  R(beat, c, 'riseShake', 0, 1, 0.01, 'rise knock');
  R(beat, c, 'blastShake', 0, 1.5, 0.01, 'throw shake');
  R(beat, c, 'blastFlash', 0, 1, 0.01, 'throw flash');
  R(beat, c, 'blastLight', 0, 120, 0.5, 'light punch');
  R(beat, c, 'shatterShake', 0, 1, 0.01, 'shatter shake');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'frost shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'frost shell life');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock ring life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  const trail = beat.addFolder('Rime track (travel)');
  R(trail, c, 'trailSpacing', 0.2, 5, 0.05, 'frost spacing (m)');
  R(trail, c, 'trailRadius', 0.1, 3, 0.05, 'frost radius (m)');
  R(trail, c, 'trailLife', 0.1, 5, 0.05, 'frost life');
  R(trail, c, 'trailGlitter', 0, 600, 1, 'glints / s');
  trail.addColor(c, 'colorTrailA').name('rime');
  trail.addColor(c, 'colorTrailB').name('rime, deep');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 6, 0.05, 'height (m)');
}
