import {
  CircleGeometry,
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
import {
  createSigilRingGeometry,
  createSigilSpikeGeometry,
  createSigilObeliskGeometry
} from '../../assets/codex/SigilGateGeometry.js';
import {
  createSigilFrameMaterial,
  createSigilMembraneMaterial,
  createSigilBrandMaterial,
  createSigilWarpMaterial
} from '../../materials/codex/SigilGateMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'sigilgate';

/** Crown spikes round the ring. The editor's count slider clamps to this. */
const MAX_SPIKES = 24;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _negDir = new Vector3();
const _up = new Vector3(0, 1, 0);
/** Scratch for `_t` — the beats' times, never allocated per frame. */
const _T = { rise: 0, stand: 0, fall: 0, slam: 0 };
const _scale = new Vector3();
const _q = new Quaternion();
const _qFall = new Quaternion();
const _m = new Matrix4();
const _basis = new Matrix4();
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
 * SIGIL GATE — Arcane, zone cast.
 *
 * A **gate that becomes a stamp**. A ley line runs down the cast line,
 * burning rune-arcs into the floor. At the circle's far rim two dark
 * **obelisks** punch up, and between them a **ring of polished black stone**
 * — crowned with spikes, runes glowing along it — rises out of the floor and
 * stands face-on to the caster: a gate. Its **seal inscribes itself** across
 * the opening ring by ring — outer rings, a band of runes, a turning seven-
 * pointed star, a ring of orbs, spokes, the eye — and the rings counter-turn.
 * Then the gate **falls**: it tips toward the caster about its foot,
 * accelerating like a felled door, while the seal blazes and is projected
 * faintly onto the floor where it will land. It **slams** flat, centred on
 * the circle: the seal is **branded** into the floor white-hot, everything
 * under the gate is crushed and thrown out, a ring of dust and air blasts
 * outward, sparks skid away, the camera jolts. The gate rebounds a hair,
 * settles, then **lifts away into motes**, the posts sink, and the brand
 * cools through violet to a dark scar and fades.
 *
 * ## Layers
 *
 *   1. **the gate** — a rig (`Group`) hinged at the far rim: the ring and
 *      inner ring (`createSigilRingGeometry`), an InstancedMesh crown of
 *      spikes, all in `createSigilFrameMaterial` — opaque stone with inlaid
 *      runes, heat at the slam, dissolve at the end — on `LAYER.WORLD`, so it
 *      casts a real shadow as it falls. The two **obelisks** stand outside it.
 *   2. **the seal** (`createSigilMembraneMaterial`) — the disc in the ring,
 *      `SIGIL_GLSL` drawn on round the circle element by element. Additive.
 *   3. **the brand** (`createSigilBrandMaterial`) — the same seal on the
 *      floor: projected while the gate falls, burnt in at the slam, cooling
 *      to a scar over a charred disc.
 *   4. **motes** (SOFT, additive) drawn into the seal while it stands and
 *      rising off the brand and the dissolving stone; **sparks** (STREAK)
 *      and **dust** (SMOKE) blasted out along the floor at the slam.
 *   5. **the slam** — AIR burst (squashed), SHOCKWAVE and DUSTRING decals,
 *      two shells of bent air (`createSigilWarpMaterial`, LAYER.DISTORTION),
 *      flash, shake, light punch. ARC burns down the ley line in travel.
 *
 * ## The bodies
 *
 * `handlesOwnHits`: nothing falls until the gate does. At the slam every
 * live body inside the ring is killed and thrown outward from the centre.
 *
 * ## The editor rule
 *
 * A cast captures a seed and the seal's turn at the moment of the slam (so
 * the brand keeps the pose it landed in). Every dimension, time, colour and
 * the rig's whole pose are resolved from `settings.sigilgate` every frame.
 */
export class SigilGateAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The gate falls on its own clock and decides who is under it. */
  get handlesOwnHits() {
    return true;
  }

  /** Crown spikes standing. HUD readout only. */
  get instanceCount() {
    return this.rig.visible ? this._spikes : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the gate rig, hinged at the far rim ---- */
    this.rig = new Group();
    this.rig.name = 'SigilGateRig';
    this.rig.visible = false;
    this.group.add(this.rig);

    this.frameMaterial = createSigilFrameMaterial();
    this.ringGeometry = null;
    this.innerGeometry = null;
    this._tube = -1;
    this._innerTube = -1;
    this.ring = this._solid(this._ringGeometry(), this.frameMaterial, this.rig);
    this.inner = this._solid(this.innerGeometry, this.frameMaterial, this.rig);

    this.spikeGeometry = createSigilSpikeGeometry();
    this.spikes = new InstancedMesh(this.spikeGeometry, this.frameMaterial, MAX_SPIKES);
    this.spikes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.spikes.layers.set(LAYER.WORLD);
    this.spikes.castShadow = true;
    this.spikes.frustumCulled = false;
    this.rig.add(this.spikes);
    this._spikes = 0;

    /* ---- layer 2: the seal, in the ring ---- */
    this.sealGeometry = new CircleGeometry(1, 96);
    this.sealMaterial = createSigilMembraneMaterial();
    this.seal = new Mesh(this.sealGeometry, this.sealMaterial);
    this.seal.layers.set(LAYER.VFX);
    this.seal.renderOrder = 12;
    this.seal.frustumCulled = false;
    this.rig.add(this.seal);

    /* ---- the obelisks ---- */
    this.postGeometry = createSigilObeliskGeometry();
    this.postMaterial = createSigilFrameMaterial();
    this.posts = [this._solid(this.postGeometry, this.postMaterial, this.group), this._solid(this.postGeometry, this.postMaterial, this.group)];
    for (const p of this.posts) p.visible = false;

    /* ---- layer 3: the brand ---- */
    this.planeGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.brandMaterial = createSigilBrandMaterial();
    this.brand = this._flat(this.planeGeometry, this.brandMaterial, LAYER.VFX, 2);

    /* ---- layer 5: the slam's bent air ---- */
    this.warpGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.warpGeometry.rotateX(-HALF_PI);
    this.warpMaterial = createSigilWarpMaterial();
    this.warp = this._flat(this.warpGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._frameState = { runeScale: 54, heat: 0, dissolve: 0, seed: 0 };
    this._postState = { runeScale: 4, heat: 0, dissolve: 0, seed: 0 };
    this._sealState = { draw: 0, spinA: 0, spinB: 0, seed: 0, flare: 0, fade: 0 };
    this._brandState = {
      centre: new Vector3(),
      axisU: new Vector3(),
      axisV: new Vector3(),
      radius: 4,
      preview: 0,
      burn: 0,
      scar: 0,
      spinA: 0,
      spinB: 0,
      seed: 0
    };

    this._hinge = new Vector3();
    this._sealCentre = new Vector3();
    this._seed = 0;
    this._clock = -1;
    this._spinA = 0;
    this._spinB = 0;
    this._slamSpinA = 0;
    this._slamSpinB = 0;
    this._slammed = false;
    this._risen = false;
    this._leyDone = 0;
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _solid(geometry, material, parent) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(LAYER.WORLD);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }

  _flat(geometry, material, layer, order) {
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

    this.motes = particles.get('sigilgate.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uDrag.value = 1.1;
    this.motes.uniforms.uEndSize.value = 0.25;
    this.motes.uniforms.uSizeIn.value = 0.08;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.sparks = particles.get('sigilgate.sparks', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uDrag.value = 1.8;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.dust = particles.get('sigilgate.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.8
    });
    this.dust.uniforms.uDrag.value = 2.2;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.55;

    this.moteEmitter = new RateEmitter();
    this.travelEmitter = new RateEmitter();
  }

  /** The two rings, rebuilt only when the frame's thickness or the gate's size moves. */
  _ringGeometry() {
    const c = settings[ID];
    const R = this._gateRadius(c);
    const tube = Math.max(0.01, c.frameThickness) / R;
    const innerTube = tube * 0.55 / Math.max(0.2, c.innerRing);
    if (this.ringGeometry && Math.abs(tube - this._tube) < 1e-5 && Math.abs(innerTube - this._innerTube) < 1e-5) {
      return this.ringGeometry;
    }
    this._tube = tube;
    this._innerTube = innerTube;
    const oldA = this.ringGeometry;
    const oldB = this.innerGeometry;
    this.ringGeometry = createSigilRingGeometry(tube);
    this.innerGeometry = createSigilRingGeometry(innerTube);
    if (this.ring) this.ring.geometry = this.ringGeometry;
    if (this.inner) this.inner.geometry = this.innerGeometry;
    oldA?.dispose();
    oldB?.dispose();
    return this.ringGeometry;
  }

  _gateRadius(c) {
    return Math.max(0.3, c.zoneRadius * c.gateScale);
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  /** The beats' clock times, written into one shared scratch record. */
  _t(c, g) {
    _T.rise = Math.max(0.05, c.riseTime) * g.lifetime;
    _T.stand = Math.max(0, c.standTime) * g.lifetime;
    _T.fall = Math.max(0.05, c.fallTime);
    _T.slam = _T.rise + _T.stand + _T.fall;
    return _T;
  }

  _slamAt(c, g) {
    return (Math.max(0.05, c.riseTime) + Math.max(0, c.standTime)) * g.lifetime + Math.max(0.05, c.fallTime);
  }

  get impactDuration() {
    const c = settings[ID];
    const g = settings.global;
    return this._slamAt(c, g) + Math.max(0.05, c.lifetime * g.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.05, settings[ID].brandFade * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 11.3) * Math.sin(this.age * 4.1));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._spinA = Math.random() * TAU;
    this._spinB = Math.random() * TAU;
    this._slammed = false;
    this._risen = false;
    this._leyDone = 0;
    this.moteEmitter.reset();
    this.travelEmitter.reset();
    this._frameState.seed = this._seed;
    this._postState.seed = this._seed + 5;
    this._sealState.seed = this._seed;
    this._brandState.seed = this._seed;
    this._ringGeometry();
    for (let i = 0; i < MAX_SPIKES; i++) this.spikes.setMatrixAt(i, _zero);
    this.spikes.instanceMatrix.needsUpdate = true;
    this.rig.visible = false;
    this.posts[0].visible = false;
    this.posts[1].visible = false;
    this.brand.visible = false;
    this.warp.visible = false;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Pose the rig, the posts and the seal for the current clock. */
  _updateGate(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._ringGeometry();
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const R = this._gateRadius(c);
    const T = this._t(c, g);
    const RC = Math.max(0.5, c.zoneRadius);

    this.pointAt(1, _centre);
    // The hinge sits on the far rim so that, flat, the ring is centred on the circle.
    this._hinge.copy(_centre).addScaledVector(this.direction, R).setY(0);
    _negDir.copy(this.direction).negate();

    this._spinA += c.spinSpeed * dt * g.animationSpeed;
    this._spinB -= c.spinSpeed * 0.6 * dt * g.animationSpeed;

    /* --- rise --- */
    const kr = clock < 0 ? 0 : saturate(clock / T.rise);
    const lift = -2.2 * R * (1 - Easing.outCubic(kr));
    if (kr > 0 && !this._risen) {
      this._risen = true;
      this._riseFx(c, g);
    }

    /* --- fall --- */
    const fallStart = T.rise + T.stand;
    const kf = clock < 0 ? 0 : saturate((clock - fallStart) / T.fall);
    let theta = HALF_PI * Easing.inCubic(kf);
    if (this._slammed) {
      const kb = saturate((clock - T.slam) / 0.3);
      theta = HALF_PI - c.bounce * Math.sin(Math.PI * kb) * (1 - kb);
    }
    if (kf >= 1 && !this._slammed && clock >= 0) {
      this._slammed = true;
      this._slamSpinA = this._spinA;
      this._slamSpinB = this._spinB;
      this._slamFx(c, g);
    }

    /* --- the rig: basis (side, up, −dir), then the fall about `side` --- */
    _basis.makeBasis(this.side, _up, _negDir);
    _q.setFromRotationMatrix(_basis);
    _qFall.setFromAxisAngle(this.side, theta);
    this.rig.quaternion.multiplyQuaternions(_qFall, _q);
    this.rig.position.copy(this._hinge).setY(lift);
    this.rig.updateMatrix();
    this.rig.visible = clock >= 0;

    // Ring geometry lies in local XY, centred a radius up from the hinge.
    const lift2 = c.frameThickness * 0.6;
    this.ring.position.set(0, R + lift2, 0);
    this.ring.scale.setScalar(R);
    this.ring.updateMatrix();
    this.inner.position.set(0, R + lift2, 0);
    this.inner.scale.setScalar(R * Math.max(0.2, c.innerRing));
    this.inner.updateMatrix();
    this.seal.position.set(0, R + lift2, 0.005);
    this.seal.scale.setScalar(R * Math.max(0.2, c.innerRing) * 1.02);
    this.seal.updateMatrix();

    /* --- the crown --- */
    const n = Math.max(0, Math.min(MAX_SPIKES, Math.round(c.spikeCount)));
    this._spikes = n;
    for (let i = 0; i < MAX_SPIKES; i++) {
      if (i >= n) {
        this.spikes.setMatrixAt(i, _zero);
        continue;
      }
      const a = (i / n) * TAU + HALF_PI;
      // A spike points out from the ring, in the ring's plane.
      _dir.set(Math.cos(a), Math.sin(a), 0);
      _q.setFromUnitVectors(_up, _dir);
      const len = c.spikeLength * (i % 2 === 0 ? 1 : 0.6);
      _pos.set(_dir.x * (R + c.frameThickness * 0.5), R + lift2 + _dir.y * (R + c.frameThickness * 0.5), 0);
      _scale.set(c.spikeWidth, len, c.spikeWidth);
      _m.compose(_pos, _q, _scale);
      this.spikes.setMatrixAt(i, _m);
    }
    this.spikes.count = MAX_SPIKES;
    this.spikes.instanceMatrix.needsUpdate = true;

    /* --- the seal --- */
    const ss = this._sealState;
    ss.draw = clock < 0 ? 0 : Easing.outQuad(saturate(clock / (T.rise + T.stand * 0.75)));
    ss.spinA = this._spinA;
    ss.spinB = this._spinB;
    ss.flare = c.flare * smoothstep(0, 1, kf) * g.glow;
    const sinceSlam = this._slammed ? clock - T.slam : -1;
    ss.fade = this._slammed ? saturate(sinceSlam / 0.45) : 0;
    if (this._slammed && sinceSlam < 0.12) ss.flare = c.flare * 2 * g.glow;
    this.sealMaterial.userData.sync(ss);
    this.seal.visible = ss.fade < 1;

    /* --- the stone --- */
    const life = Math.max(0.05, c.lifetime * g.lifetime);
    const liftT = Math.max(0.05, c.liftTime * g.lifetime);
    const fs = this._frameState;
    fs.runeScale = Math.max(1, Math.round(c.runeScale));
    fs.heat = this._slammed ? Math.exp(-sinceSlam * 2.5) : smoothstep(0.3, 1, kf) * 0.5;
    const liftStart = T.slam + Math.max(0, life - liftT);
    fs.dissolve = clock >= liftStart ? Easing.inQuad(saturate((clock - liftStart) / liftT)) * 1.05 : 0;
    this.frameMaterial.userData.sync(fs);
    if (fs.dissolve >= 1) this.rig.visible = false;

    /* --- the obelisks --- */
    const ps = this._postState;
    ps.runeScale = 4;
    ps.heat = fs.heat * 0.6;
    ps.dissolve = fading ? Easing.inQuad(saturate(this.fadeTime / Math.max(0.05, this.fadeDuration * 0.7))) * 1.05 : 0;
    this.postMaterial.userData.sync(ps);
    const H = Math.max(0.3, c.postHeight);
    const sink = fading ? Easing.inQuad(saturate(this.fadeTime / Math.max(0.05, this.fadeDuration * 0.7))) : 0;
    for (let i = 0; i < 2; i++) {
      const post = this.posts[i];
      const side = i === 0 ? 1 : -1;
      post.position.copy(this._hinge).addScaledVector(this.side, side * (R + c.postGap + c.postWidth * 0.5));
      post.position.y = -H * (1 - Easing.outBack(saturate(clock / (T.rise * 0.8)))) - H * sink;
      _q.setFromAxisAngle(_up, Math.atan2(this.direction.x, this.direction.z));
      post.quaternion.copy(_q);
      post.scale.set(c.postWidth, H, c.postWidth);
      post.updateMatrix();
      post.visible = clock >= 0 && ps.dissolve < 1;
    }

    /* --- where the seal is, in the world (for the light and the motes) --- */
    const cr = R + lift2;
    this._sealCentre
      .copy(this._hinge)
      .addScaledVector(_up, cr * Math.cos(theta))
      .addScaledVector(_negDir, cr * Math.sin(theta));
    this._sealCentre.y += lift;

    /* --- the brand --- */
    const bs = this._brandState;
    bs.centre.copy(_centre);
    bs.axisU.copy(this.side);
    bs.axisV.copy(_negDir);
    bs.radius = R * Math.max(0.2, c.innerRing) * 1.02;
    bs.preview = this._slammed ? 0 : Easing.inQuad(kf);
    bs.burn = this._slammed ? Math.exp(-Math.max(0, sinceSlam) / Math.max(0.05, c.burnCool * g.lifetime)) : 0;
    bs.scar = this._slammed ? (fading ? 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration)) : 1) : 0;
    bs.spinA = this._slammed ? this._slamSpinA : this._spinA;
    bs.spinB = this._slammed ? this._slamSpinB : this._spinB;
    this.brandMaterial.userData.sync(bs);
    this.brand.visible = clock >= 0 && (bs.preview > 0.001 || bs.scar > 0.001 || bs.burn > 0.001);

    /* --- the slam's air --- */
    if (this._slammed) {
      const kw = saturate(sinceSlam / Math.max(0.05, c.slamWarpTime));
      this.warpMaterial.userData.sync(kw);
      this.warp.position.set(_centre.x, 0.4, _centre.z);
      this.warp.scale.setScalar(Math.max(0.5, c.slamWarpRadius));
      this.warp.updateMatrix();
      this.warp.visible = kw < 1;
    } else {
      this.warp.visible = false;
    }

    /* --- motes: drawn into the seal while it stands; rising off the brand after --- */
    if (clock >= 0 && dt > 0) this._moteFx(dt, c, g, R, RC, fs.dissolve);
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _crush(c, g) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const R = this._gateRadius(c) * Math.max(0.2, c.innerRing) + c.frameThickness;
    const power = g.explosionIntensity;
    const found = field.findTargets(_centre.x, _centre.z, R, this._targets);
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      this._force.impulse = c.slamImpulse * power;
      this._force.lift = c.slamLift * power;
      this._force.spin = c.slamSpin;
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _riseFx(c, g) {
    this.ctx.shake.add(c.riseShake * g.explosionIntensity, 3, 14);
    resetEmit();
    _emit.position = _pos.copy(this._hinge).setY(0.2);
    _emit.radius = this._gateRadius(c) * 0.6;
    _emit.speed = c.dustSpeed * 0.3;
    _emit.spread = 1;
    _emit.size = c.dustSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(c.dustCount * 0.4 * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.CRACK, this._hinge, {
      radius: this._gateRadius(c) * 0.6,
      life: 2,
      intensity: 0.8,
      colorA: getColor(c.colorSeal),
      colorB: getColor(c.colorScar),
      width: 0.08,
      height: 0.02
    });
  }

  /** The gate hits the floor. */
  _slamFx(c, g) {
    const power = g.explosionIntensity;
    const R = this._gateRadius(c);
    this.pointAt(1, _centre);
    this._crush(c, g);
    this.ctx.shake.add(c.slamShake * power, 3, 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * power);
    this.lightBoost = c.slamLight * power;
    this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_centre).setY(0.3), {
      radius: 0.5,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      opacity: 0.8 * g.opacity,
      squash: 0.25,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.dustRingRadius,
      life: c.dustRingLife,
      intensity: 0.9,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.4,
      height: 0.025
    });

    // Sparks and dust blasted out along the floor from under the rim.
    resetEmit();
    const sparks = Math.round(c.sparkCount * g.particleCount);
    const dust = Math.round(c.dustCount * g.particleCount);
    const per = 24;
    for (let k = 0; k < per; k++) {
      const a = (k / per) * TAU + Math.random() * 0.2;
      _dir.set(Math.cos(a), 0.15, Math.sin(a)).normalize();
      _emit.position = _pos.set(_centre.x + Math.cos(a) * R, 0.1, _centre.z + Math.sin(a) * R);
      _emit.direction = _dir;
      _emit.radius = 0.2;
      _emit.spread = 0.25;
      _emit.speed = c.sparkSpeed;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLifetime;
      _emit.spin = 0;
      this.sparks.emit(Math.max(1, Math.round(sparks / per)), _emit);
      _emit.speed = c.dustSpeed;
      _emit.spread = 0.4;
      _emit.size = c.dustSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.dustLifetime;
      _emit.spin = 0.6;
      this.dust.emit(Math.max(1, Math.round(dust / per)), _emit);
    }
  }

  _moteFx(dt, c, g, R, RC, dissolve) {
    const T = this._t(c, g);
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const standing = !this._slammed && clock > T.rise * 0.5;
    const rate = standing ? c.moteRate : this._slammed ? c.brandMotes * (fading ? 1 - saturate(this.fadeTime / this.fadeDuration) : 1) : 0;
    const n = Math.round(this.moteEmitter.tick(dt, rate) * g.particleCount);
    if (n <= 0) return;
    resetEmit();
    _emit.size = c.moteSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLifetime;
    const inner = R * Math.max(0.2, c.innerRing);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      if (standing) {
        // From a little outside the ring, in its plane, inward to the seal.
        const rr = inner * (1.05 + Math.random() * 0.5);
        const cosT = Math.cos(a);
        const sinT = Math.sin(a);
        _pos.copy(this._sealCentre).addScaledVector(this.side, cosT * rr);
        _pos.y += sinT * rr;
        _dir.copy(this._sealCentre).sub(_pos).normalize();
        _emit.direction = _dir;
        _emit.speed = c.moteSpeed;
        _emit.spread = 0.15;
      } else {
        // Off the brand, or off the stone as it lifts away.
        const r = RC * Math.sqrt(Math.random());
        _pos.set(_centre.x + Math.cos(a) * r, 0.05 + (dissolve > 0 && dissolve < 1 ? Math.random() * 0.3 : 0), _centre.z + Math.sin(a) * r);
        _emit.direction = _up;
        _emit.speed = c.moteSpeed * 0.5;
        _emit.spread = 0.4;
      }
      _emit.position = _pos;
      this.motes.emit(1, _emit);
    }
  }

  /** The ley line: rune-arcs burnt down the line behind the front, motes off it. */
  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const spacing = Math.max(0.3, c.leyArcSpacing);
    while (this.front - this._leyDone >= spacing) {
      this._leyDone += spacing;
      this.pointAt(saturate(this._leyDone / this.length), _pos);
      this.ctx.decals.spawn(DecalType.ARC, _pos, {
        radius: 0.9,
        life: c.leyArcLife * g.lifetime,
        intensity: 1,
        colorA: getColor(c.colorSeal),
        colorB: getColor(c.colorBrand),
        width: 0.06,
        height: 0.02
      });
    }
    const n = Math.round(this.travelEmitter.tick(dt, 160) * g.particleCount);
    if (n > 0) {
      resetEmit();
      _emit.position = _pos.copy(this.position).setY(0.1);
      _emit.radius = 0.2;
      _emit.speed = c.moteSpeed * 0.4;
      _emit.spread = 0.5;
      _emit.size = c.moteSize;
      _emit.life = c.moteLifetime;
      this.motes.emit(n, _emit);
    }
  }

  _syncParticles() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteGlow * g.glow, 0.6);
    this.motes.uniforms.uGravity.value.set(0, 0.6, 0);
    syncSystem(this.sparks, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.moteGlow * g.glow, 0.1);
    this.sparks.uniforms.uGravity.value.set(0, -5, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, 1, 0.5);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.2, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._syncParticles();
    this._travelFx(dt);
    this._updateGate(dt);
    this.position.y = 0.4;
  }

  onImpact() {
    this._clock = 0;
    this.lightBoost = settings[ID].lightIntensity * 0.5;
  }

  onFade(dt) {
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._syncParticles();
    this._updateGate(dt);
    this.position.copy(this._sealCentre);
    this.position.y = Math.max(0.6, this.position.y);
  }

  onDestroy() {
    this._clock = -1;
    this._slammed = false;
    this.rig.visible = false;
    this.posts[0].visible = false;
    this.posts[1].visible = false;
    this.brand.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    this.ringGeometry?.dispose();
    this.innerGeometry?.dispose();
    this.spikeGeometry.dispose();
    this.sealGeometry.dispose();
    this.postGeometry.dispose();
    this.planeGeometry.dispose();
    this.warpGeometry.dispose();
    this.frameMaterial.dispose();
    this.postMaterial.dispose();
    this.sealMaterial.dispose();
    this.brandMaterial.dispose();
    this.warpMaterial.dispose();
    this.spikes.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⊚  Sigil Gate');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'ley line speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'riseTime', 0.05, 2, 0.01, 'rises over');
  R(time, c, 'standTime', 0, 2, 0.01, 'stands for');
  R(time, c, 'fallTime', 0.05, 2, 0.01, 'falls over');
  R(time, c, 'bounce', 0, 0.4, 0.005, 'rebound (rad)');
  R(time, c, 'lifetime', 0.05, 5, 0.05, 'lies on the circle for');
  R(time, c, 'liftTime', 0.05, 3, 0.05, 'lifts away over');
  R(time, c, 'brandFade', 0.05, 5, 0.05, 'brand fades over');

  const gate = folder.addFolder('1 · The gate');
  R(gate, c, 'gateScale', 0.3, 1.5, 0.01, 'ring (× circle)');
  R(gate, c, 'frameThickness', 0.02, 0.8, 0.005, 'frame thickness (m)');
  R(gate, c, 'innerRing', 0.4, 1, 0.01, 'inner ring (× ring)');
  R(gate, c, 'spikeCount', 0, MAX_SPIKES, 1, 'crown spikes');
  R(gate, c, 'spikeLength', 0, 3, 0.01, 'spike length (m)');
  R(gate, c, 'spikeWidth', 0.02, 1, 0.01, 'spike width (m)');
  R(gate, c, 'postHeight', 0.3, 12, 0.05, 'post height (m)');
  R(gate, c, 'postWidth', 0.1, 2, 0.01, 'post width (m)');
  R(gate, c, 'postGap', -1, 3, 0.01, 'post gap (m)');
  const stone = gate.addFolder('Stone');
  stone.addColor(c, 'colorStone').name('stone');
  stone.addColor(c, 'colorStoneVein').name('veining');
  stone.addColor(c, 'colorRune').name('runes');
  stone.addColor(c, 'colorHot').name('white-hot');
  R(stone, c, 'runeGlow', 0, 8, 0.05, 'rune glow');
  R(stone, c, 'runeScale', 4, 120, 1, 'runes round the ring');
  R(stone, c, 'stoneSheen', 0, 2, 0.01, 'sky sheen');
  R(stone, c, 'stoneSpecular', 0, 3, 0.01, 'specular');

  const seal = folder.addFolder('2 · The seal');
  seal.addColor(c, 'colorSeal').name('seal');
  seal.addColor(c, 'colorFilm').name('film');
  R(seal, c, 'sealGlow', 0, 8, 0.05, 'line glow');
  R(seal, c, 'sealLineWidth', 0.002, 0.05, 0.001, 'line width');
  R(seal, c, 'filmGlow', 0, 2, 0.01, 'film');
  R(seal, c, 'spinSpeed', 0, 4, 0.01, 'turn (rad/s)');
  R(seal, c, 'flare', 0, 8, 0.05, 'blaze as it falls');

  const brand = folder.addFolder('3 · The brand');
  brand.addColor(c, 'colorBrand').name('brand');
  brand.addColor(c, 'colorScar').name('scar');
  brand.addColor(c, 'colorChar').name('char');
  R(brand, c, 'brandGlow', 0, 8, 0.05, 'glow');
  R(brand, c, 'burnCool', 0.05, 4, 0.05, 'white-hot cools over');
  R(brand, c, 'charDarkness', 0, 1, 0.01, 'char');
  R(brand, c, 'charMargin', 0, 3, 0.05, 'scorch margin (m)');

  const crush = folder.addFolder('4 · The crush');
  R(crush, c, 'slamImpulse', 0, 20, 0.1, 'outward impulse');
  R(crush, c, 'slamLift', 0, 15, 0.1, 'lift');
  R(crush, c, 'slamSpin', 0, 8, 0.05, 'spin');

  const fx = folder.addFolder('5 · Motes, sparks, dust');
  R(fx, c, 'moteRate', 0, 500, 1, 'motes drawn in / s');
  R(fx, c, 'brandMotes', 0, 500, 1, 'motes off the brand / s');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteSpeed', 0, 12, 0.05, 'mote speed');
  R(fx, c, 'moteLifetime', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote colour');
  R(fx, c, 'sparkCount', 0, 400, 1, 'sparks');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(fx, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  Editor.gradient(fx, c, 'colorSpark', 'spark colour');
  R(fx, c, 'dustCount', 0, 200, 1, 'dust');
  R(fx, c, 'dustSize', 0.1, 4, 0.05, 'dust size');
  R(fx, c, 'dustSpeed', 0, 20, 0.1, 'dust speed');
  R(fx, c, 'dustLifetime', 0.1, 5, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust colour');

  const beat = folder.addFolder('6 · The slam');
  R(beat, c, 'riseShake', 0, 1, 0.01, 'rise rumble');
  R(beat, c, 'slamShake', 0, 1.5, 0.01, 'slam shake');
  R(beat, c, 'slamFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'slamLight', 0, 100, 0.5, 'light punch');
  R(beat, c, 'burstRadius', 0, 12, 0.05, 'air shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, dark');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'dustRingRadius', 0, 20, 0.05, 'dust ring (m)');
  R(beat, c, 'dustRingLife', 0.1, 5, 0.05, 'dust ring life');
  R(beat, c, 'slamWarp', 0, 3, 0.01, 'air bend');
  R(beat, c, 'slamWarpRadius', 0.5, 20, 0.05, 'air bend reach (m)');
  R(beat, c, 'slamWarpTime', 0.05, 2, 0.01, 'air bend over');
  R(beat, c, 'leyArcSpacing', 0.3, 5, 0.05, 'ley burns every (m)');
  R(beat, c, 'leyArcLife', 0.1, 4, 0.05, 'ley burn life');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
}
