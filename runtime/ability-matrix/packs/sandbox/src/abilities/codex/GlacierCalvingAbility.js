import {
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createShelfGeometry, createChunkGeometry } from '../../assets/codex/GlacierCalvingGeometry.js';
import {
  createGlacierIceMaterial,
  createCrevasseFloorMaterial,
  createSlamWarpMaterial
} from '../../materials/codex/GlacierCalvingMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'calving';

/** Broken blocks the shelf can come apart into. The editor's slider clamps to this. */
const MAX_CHUNKS = 48;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _pivot = new Vector3();
const _face = new Vector3();
const _side = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _calfSize = new Vector3();
const _stumpSize = new Vector3();
const _unit = new Vector3(1, 1, 1);

const _calfState = { size: _calfSize, crack: 0, wet: 0 };
const _stumpState = { size: _stumpSize, crack: 0, wet: 0 };
const _chunkState = { size: _unit, crack: 0, wet: 0.6 };
const _floorState = {
  centre: new Vector3(),
  radius: 5,
  faceX: 0,
  faceZ: 1,
  pivotX: 0,
  pivotZ: 0,
  halfWidth: 3,
  depth: 2,
  open: 0,
  rift: 0,
  powder: 0,
  erode: 0,
  seed: 0
};
const _warpState = { strength: 0 };

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
 * GLACIER CALVING — Frost, zone cast.
 *
 * A fault runs along the floor to the circle, and the circle's floor
 * **splits into blue-lit crevasses**. Then, at its far side, **a cliff of
 * glacier heaves up out of the ground** — a slab six metres tall and as wide
 * as the circle, its top broken into seracs, its face banded with
 * compressed strata, grooved, snow-capped, glowing deep blue from inside —
 * shuddering as it comes, powder pouring off its crest, throwing whatever
 * stood where it surfaced into the air. It looms. **A fissure climbs its
 * foot**, white-hot cyan, the face leans back a hair as if drawing breath —
 * and the front of it **calves**: it tips over its own foot and falls,
 * accelerating, across the whole circle. It lands with a slam that **breaks
 * it into blocks** of glacier that tumble and slide toward the caster in a
 * rolling cloud of powder, a ring of frost and a shockwave. A stump of the
 * shelf is left standing behind; the wreckage settles, then the blocks and
 * the stump **sink back into the floor** and the powder fan erodes.
 *
 * Distinct from the other frost: not spikes from the floor (Ice, Glacier
 * Crown, Permafrost) and not a wave rolling along it (Avalanche) — one huge
 * rigid thing that stands up and *falls over*.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the shelf** — the calf and the stump, both the serac-topped slab
 *      from `createShelfGeometry` in `createGlacierIceMaterial` (opaque,
 *      `LAYER.WORLD`, shadows). The calf is parented to a pivot on its own
 *      front-bottom edge, so toppling it is one rotation about X.
 *   2. **the chunks** — an InstancedMesh of dented icosahedra in the same
 *      ice, spawned through the fallen slab's volume the frame it lands and
 *      simulated: gravity, bounce, friction, tumbling; then sunk.
 *   3. **the crevasse field** — crevasses opening from the shelf's foot, the
 *      rift it comes up through, the powder fan it leaves.
 *   4. **powder & ice** — SMOKE pouring off the crest as it rises and rolling
 *      out of the slam, CHIP ice and SOFT glitter thrown from the break.
 *   5. **the slam** — a FROST burst, a SHOCKWAVE, a DUSTRING, a pressure
 *      wave on `LAYER.DISTORTION`, a flash, a heavy knock and a light punch;
 *      rumbles while the floor cracks and the shelf rises, creaks while it
 *      teeters.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. Whatever stands on the shelf's footprint when it breaks
 * the floor is thrown up and back; whatever stands under it when it lands is
 * killed and thrown toward the caster, frosted.
 *
 * ## The editor rule
 *
 * Chunk records hold dice plus their integrated ballistic state (as
 * Avalanche's boulders do). Every dimension and time of the shelf is
 * resolved from `settings.calving` each frame; the slab is re-cut whenever
 * its seracs or roughness move.
 */
export class GlacierCalvingAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._live;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the shelf ---- */
    this.rig = new Group();
    this.rig.name = 'GlacierCalvingRig';
    this.group.add(this.rig);
    this.calfMaterial = createGlacierIceMaterial();
    this.stumpMaterial = createGlacierIceMaterial();
    this._geoKey = [-1, -1, -1, -1];
    this.shelfGeometry = null;
    this.calf = new Mesh(undefined, this.calfMaterial);
    this.calf.name = 'GlacierCalf';
    this.stump = new Mesh(undefined, this.stumpMaterial);
    this.stump.name = 'GlacierStump';
    for (const m of [this.calf, this.stump]) {
      m.layers.set(LAYER.WORLD);
      m.castShadow = true;
      m.frustumCulled = false;
      this.rig.add(m);
    }
    this._rebuild();

    /* ---- layer 2: the chunks ---- */
    this.chunkGeometry = createChunkGeometry();
    this.seedAttr = new InstancedBufferAttribute(new Float32Array(MAX_CHUNKS), 1);
    this.chunkGeometry.setAttribute('aSeed', this.seedAttr);
    this.chunkMaterial = createGlacierIceMaterial();
    this.chunks = new InstancedMesh(this.chunkGeometry, this.chunkMaterial, MAX_CHUNKS);
    this.chunks.name = 'GlacierChunks';
    this.chunks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.chunks.layers.set(LAYER.WORLD);
    this.chunks.castShadow = true;
    this.chunks.frustumCulled = false;
    this.chunks.count = MAX_CHUNKS;
    this.chunks.visible = false;
    this.group.add(this.chunks);
    this.recs = [];
    for (let i = 0; i < MAX_CHUNKS; i++) {
      this.recs.push({
        pos: new Vector3(),
        vel: new Vector3(),
        quat: new Quaternion(),
        axis: new Vector3(0, 1, 0),
        spin: 0,
        size: 1,
        sx: 1,
        sy: 1,
        sz: 1,
        seed: 0,
        live: false
      });
    }

    /* ---- layer 3: the crevasse field ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createCrevasseFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'GlacierCrevasses';
    this.floor.frustumCulled = false;
    this.floor.renderOrder = 2;
    this.floor.visible = false;
    this.group.add(this.floor);

    /* ---- layer 5: the slam's pressure wave ---- */
    this.warpGeometry = new CylinderGeometry(1, 1, 1, 56, 1, true);
    this.warpGeometry.translate(0, 0.5, 0);
    this.warpMaterial = createSlamWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.name = 'GlacierSlamWarp';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    this._seed = 0;
    this._yaw = 0;
    this._travelled = 0;
    this._launched = false;
    this._slammed = false;
    this._slamAt = 0;
    this._creaked = 0;
    this._live = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.powder = particles.get('calving.powder', { capacity: 1600, shape: ParticleShape.SMOKE, additive: false, curl: true, lit: true, softFade: 0.7 });
    this.powder.uniforms.uDrag.value = 1.5;
    this.powder.uniforms.uEndSize.value = 2.6;
    this.powder.uniforms.uSizeIn.value = 0.1;
    this.powder.uniforms.uFadeIn.value = 0.06;
    this.powder.uniforms.uFadeOut.value = 0.6;

    this.chips = particles.get('calving.chip', { capacity: 1600, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.chips.uniforms.uDrag.value = 0.35;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.01;
    this.chips.uniforms.uFadeOut.value = 0.3;

    this.glitter = particles.get('calving.glitter', { capacity: 1400, shape: ParticleShape.SOFT, additive: true, softFade: 0.2 });
    this.glitter.uniforms.uDrag.value = 1.2;
    this.glitter.uniforms.uEndSize.value = 0.3;
    this.glitter.uniforms.uSizeIn.value = 0.05;
    this.glitter.uniforms.uFadeIn.value = 0.05;
    this.glitter.uniforms.uFadeOut.value = 0.5;

    this.sloughEmitter = new RateEmitter();
  }

  /** Re-cut the slab when its seracs or roughness move. */
  _rebuild() {
    const c = settings[ID];
    const k = this._geoKey;
    const aspect = c.shelfHeight / Math.max(0.1, c.shelfWidth);
    if (this.shelfGeometry && k[0] === c.serracs && k[1] === c.serracDepth && k[2] === c.roughness && k[3] === aspect) return;
    k[0] = c.serracs;
    k[1] = c.serracDepth;
    k[2] = c.roughness;
    k[3] = aspect;
    const old = this.shelfGeometry;
    this.shelfGeometry = createShelfGeometry(Math.round(c.serracs), c.serracDepth, c.roughness, aspect);
    this.calf.geometry = this.shelfGeometry;
    this.stump.geometry = this.shelfGeometry;
    old?.dispose();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _T(x) {
    return Math.max(0.03, x * settings.global.lifetime);
  }

  get impactDuration() {
    const c = settings[ID];
    return this._T(c.crackTime) + this._T(c.riseTime) + this._T(c.teeterTime) + Math.max(0.1, c.fallTime) + this._T(c.settleTime);
  }

  get fadeDuration() {
    return this._T(settings[ID].lifetime);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    // The shelf's face turns to the caster: it falls toward them.
    this._yaw = Math.atan2(-this.direction.x, -this.direction.z);
    this._travelled = 0;
    this._launched = false;
    this._slammed = false;
    this._slamAt = 0;
    this._creaked = 0;
    this._live = 0;
    this._found.length = 0;
    this.sloughEmitter.reset();
    for (let i = 0; i < MAX_CHUNKS; i++) {
      this.recs[i].live = false;
      this.chunks.setMatrixAt(i, _zero);
      this.seedAttr.array[i] = Math.random();
    }
    this.seedAttr.needsUpdate = true;
    this.chunks.instanceMatrix.needsUpdate = true;
    this.chunks.visible = false;
    this.rig.visible = false;
    this.floor.visible = false;
    this.warp.visible = false;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.powder, c.colorPowderA, c.colorPowderB, c.colorPowderC, c.colorPowderD, c.powderSize, 1, 0.6);
    this.powder.uniforms.uOpacity.value = c.powderOpacity * g.opacity;
    this.powder.uniforms.uGravity.value.set(0, -0.15, 0);
    syncSystem(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, 0.05);
    this.chips.uniforms.uGravity.value.set(0, c.chipGravity, 0);
    syncSystem(this.glitter, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.glitterSize, 2 * g.glow, 0.3);
    this.glitter.uniforms.uGravity.value.set(0, -1.2, 0);
  }

  /** The circle's centre, the shelf's foot, and its facing/side vectors. */
  _frame(c) {
    this.pointAt(1, _centre);
    const R = Math.max(0.5, c.zoneRadius);
    _face.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    _side.set(_face.z, 0, -_face.x);
    _pivot.copy(_centre).addScaledVector(_face, -R * c.shelfOffset);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _update(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._rebuild();
    this._frame(c);
    const fading = this.phase === AbilityPhase.FADE;
    const t = fading ? this.impactDuration + this.fadeTime : this.impactTime;
    const ft = fading ? this.fadeTime : 0;
    const kf = fading ? saturate(ft / this.fadeDuration) : 0;
    const R = Math.max(0.5, c.zoneRadius);
    const W = Math.max(0.5, c.shelfWidth);
    const H = Math.max(0.5, c.shelfHeight);
    const D = Math.max(0.2, c.shelfDepth);

    const crackT = this._T(c.crackTime);
    const riseT = this._T(c.riseTime);
    const teeterT = this._T(c.teeterTime);
    const fallT = Math.max(0.1, c.fallTime);
    const riseStart = crackT;
    const teeterStart = riseStart + riseT;
    const fallStart = teeterStart + teeterT;
    const slamAt = fallStart + fallT;

    const kc = saturate(t / crackT);
    const kr = saturate((t - riseStart) / riseT);
    const kt = saturate((t - teeterStart) / teeterT);
    const kfall = saturate((t - fallStart) / fallT);

    /* --- the rise --- */
    const ov = Math.max(0, c.riseOvershoot) * 2.6;
    const rise = kr <= 0 ? 0 : kr >= 1 ? 1 : 1 + (ov + 1) * Math.pow(kr - 1, 3) + ov * Math.pow(kr - 1, 2);
    const shudder = kr > 0 && kr < 1 ? c.riseShudder * Math.sin(t * 57) * (1 - kr) : 0;
    const sink = fading ? Easing.inQuad(kf) * (H * c.stumpHeight + 0.6) : 0;
    this.rig.position.set(_pivot.x + _side.x * shudder, -H * 1.04 * (1 - rise) - sink, _pivot.z + _side.z * shudder);
    this.rig.rotation.set(0, this._yaw, 0);
    this.rig.visible = kr > 0;

    /* --- the calf: lean back, then topple over its foot --- */
    let theta = 0;
    if (t >= teeterStart) theta = -c.teeterBack * Easing.inOutQuad(kt);
    if (t >= fallStart) theta = lerp(-c.teeterBack, Math.PI / 2, Math.pow(kfall, 2.2));
    this.calf.rotation.set(theta, 0, 0);
    this.calf.scale.set(W, H, D);
    this.calf.visible = !this._slammed;
    this.stump.position.set(0, 0, -D * 0.98);
    this.stump.scale.set(W * 0.97, H * c.stumpHeight, Math.max(0.2, c.stumpDepth));
    _calfSize.set(W, H, D);
    _stumpSize.set(W * 0.97, H * c.stumpHeight, Math.max(0.2, c.stumpDepth));
    _calfState.crack = t >= teeterStart ? c.crackClimb * Easing.outCubic(kt) : 0;
    _calfState.wet = 0.2;
    _stumpState.crack = this._slammed ? c.crackClimb * 0.4 : 0;
    _stumpState.wet = this._slammed ? 0.8 : 0.2;
    this.calfMaterial.userData.sync(_calfState);
    this.stumpMaterial.userData.sync(_stumpState);

    /* --- events --- */
    if (kr > 0.3 && !this._launched) {
      this._launched = true;
      this._launch(c, g, W, D);
    }
    if (kr > 0 && kr < 1) {
      this.ctx.shake.rumble(c.riseRumble * g.cameraShake, dt);
      this._sloughFx(dt, c, g, W, H, rise);
    } else if (kc < 1) {
      this.ctx.shake.rumble(c.crackRumble * g.cameraShake, dt);
    }
    // Creaks while it teeters — three knocks.
    if (t >= teeterStart && t < fallStart && kt >= this._creaked / 3) {
      this._creaked++;
      this.ctx.shake.add(c.creakShake * g.explosionIntensity, 7, 22);
      this._creakFx(c, g, W);
    }
    if (t >= slamAt && !this._slammed) {
      this._slammed = true;
      this._slamAt = t;
      this._slam(c, g, W, H, D);
    }

    /* --- the chunks --- */
    this._updateChunks(dt, c, g, kf);

    /* --- the floor --- */
    const gf = this.fadeDuration;
    _floorState.centre.copy(_centre);
    _floorState.radius = R;
    _floorState.faceX = _face.x;
    _floorState.faceZ = _face.z;
    _floorState.pivotX = _pivot.x - _centre.x;
    _floorState.pivotZ = _pivot.z - _centre.z;
    _floorState.halfWidth = W * 0.5;
    _floorState.depth = D + c.stumpDepth;
    _floorState.open = Easing.outCubic(kc);
    _floorState.rift = smoothstep(0, 0.2, kr);
    _floorState.powder = this._slammed ? H * c.powderReach * Easing.outCubic(saturate((t - this._slamAt) / 0.8)) : 0;
    _floorState.erode = fading ? saturate(ft / gf) : 0;
    _floorState.seed = this._seed;
    this.floorMaterial.userData.sync(_floorState);
    this.floor.visible = true;

    /* --- the pressure wave --- */
    if (this._slammed) {
      const kw = saturate((t - this._slamAt) / 0.55);
      const r = lerp(0.5, c.slamWarpReach, Easing.outCubic(kw));
      _pos.copy(_pivot).addScaledVector(_face, H * 0.5);
      this.warp.position.set(_pos.x, 0, _pos.z);
      this.warp.scale.set(r, 2.5, r);
      _warpState.strength = 1 - kw;
      this.warpMaterial.userData.sync(_warpState);
      this.warp.visible = kw < 1;
    }

    /* the light hangs in front of the face, then over the wreck */
    if (!this._slammed) _pos.copy(_pivot).addScaledVector(_face, 2).setY(c.lightHeight * Math.max(0.2, rise));
    else _pos.copy(_pivot).addScaledVector(_face, H * 0.5).setY(c.lightHeight * 0.6);
    this.position.copy(_pos);
  }

  _updateChunks(dt, c, g, kf) {
    if (!this._slammed) return;
    const grav = c.chunkGravity;
    let live = 0;
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const r = this.recs[i];
      if (!r.live) {
        this.chunks.setMatrixAt(i, _zero);
        continue;
      }
      // Ballistic, with a floor that bounces and grips.
      r.vel.y += grav * dt;
      r.pos.addScaledVector(r.vel, dt);
      const rest = r.size * r.sy * 0.55;
      if (r.pos.y < rest) {
        r.pos.y = rest;
        if (r.vel.y < 0) r.vel.y = -r.vel.y * c.chunkBounce;
        const grip = Math.exp(-c.chunkFriction * dt);
        r.vel.x *= grip;
        r.vel.z *= grip;
        r.spin *= grip;
      }
      _q.setFromAxisAngle(r.axis, r.spin * dt);
      r.quat.premultiply(_q);
      // Sinking away at the end.
      _pos.copy(r.pos);
      if (kf > 0) _pos.y -= Easing.inQuad(saturate(kf * 1.2 - r.seed * 0.2)) * (r.size * 2 + 0.3);
      _scale.set(r.size * r.sx, r.size * r.sy, r.size * r.sz);
      _m.compose(_pos, r.quat, _scale);
      this.chunks.setMatrixAt(i, _m);
      live++;
    }
    this._live = live;
    this.chunks.visible = live > 0;
    this.chunks.instanceMatrix.needsUpdate = true;
    this.chunkMaterial.userData.sync(_chunkState);
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** Find bodies in the shelf's frame: `along` from the foot toward the caster, `across` its face. */
  _inRect(alongMin, alongMax, halfAcross, cb) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const reach = Math.max(Math.abs(alongMin), Math.abs(alongMax)) + halfAcross;
    const found = field.findTargets(_pivot.x, _pivot.z, reach, this._found);
    for (let i = 0; i < found.length; i++) {
      const d = found[i];
      const dx = d.position.x - _pivot.x;
      const dz = d.position.z - _pivot.z;
      const along = dx * _face.x + dz * _face.z;
      const across = dx * _side.x + dz * _side.z;
      if (along < alongMin || along > alongMax || Math.abs(across) > halfAcross) continue;
      cb(d);
    }
    this._found.length = 0;
  }

  _launch(c, g, W, D) {
    const power = g.explosionIntensity;
    this._inRect(-D - 0.4, 0.4, W * 0.5 + 0.2, (d) => {
      this._force.impulse = 2 * power;
      this._force.lift = c.riseLift * power;
      this._force.spin = c.hitSpin;
      d.kill(-_face.x, -_face.z, this._force);
    });
  }

  _crush(c, g, W, H) {
    const power = g.explosionIntensity;
    const look = this._look;
    look.color = c.colorBodyFrozen;
    look.rimColor = c.colorBodyRim;
    look.rimEmissive = c.bodyRimGlow;
    look.edgeColor = c.colorBodyEdge;
    look.edgeEmissive = c.bodyEdgeGlow;
    this._inRect(-0.5, H + 0.6, W * 0.5 + 0.5, (d) => {
      d.corrode(c.frostTint, look);
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      d.kill(_face.x, _face.z, this._force);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _slam(c, g, W, H, D) {
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this.ctx.shake.add(c.slamShake * power, 2.6, 12);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * power);
    this.lightBoost = c.slamLight * power;

    /* the calf breaks into blocks where it lies */
    const n = Math.min(MAX_CHUNKS, Math.max(0, Math.round(c.chunkCount)));
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const r = this.recs[i];
      r.live = i < n;
      if (!r.live) continue;
      const along = Math.random() * H;
      const across = (Math.random() - 0.5) * W * 0.95;
      const up = 0.3 + Math.random() * D * 0.8;
      r.pos.copy(_pivot).addScaledVector(_face, along).addScaledVector(_side, across);
      r.pos.y = up;
      // Further out, harder thrown: the top of the slab hit at speed.
      const k = along / H;
      r.vel.copy(_face).multiplyScalar(c.chunkThrow * (0.4 + 0.9 * k) * (0.7 + 0.6 * Math.random()) * power);
      r.vel.addScaledVector(_side, (across / (W * 0.5)) * c.chunkThrow * 0.35 * Math.random());
      r.vel.y = c.chunkLift * (0.4 + 0.8 * Math.random()) * power;
      r.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      r.spin = c.chunkSpin * (0.4 + Math.random()) * (Math.random() < 0.5 ? -1 : 1);
      r.quat.setFromAxisAngle(r.axis, Math.random() * TAU);
      r.size = c.chunkSize * (1 - saturate(c.chunkJitter) * 0.6 + saturate(c.chunkJitter) * Math.random() * 0.9);
      r.sx = 0.8 + Math.random() * 0.5;
      r.sy = 0.6 + Math.random() * 0.5;
      r.sz = 0.8 + Math.random() * 0.5;
      r.seed = Math.random();
    }
    this.chunks.visible = n > 0;

    /* the fx, centred on where it lay */
    _pos.copy(_pivot).addScaledVector(_face, H * 0.5).setY(0.6);
    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: 0.5,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      opacity: 0.85 * g.opacity,
      squash: 0.35,
      colorA: getColor(c.colorChipA),
      colorB: getColor(c.colorChipB),
      colorC: getColor(c.colorChipD)
    });
    _pos.y = 0;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.dustRingRadius,
      life: c.dustRingLife,
      intensity: 0.9,
      colorA: getColor(c.colorPowderB),
      colorB: getColor(c.colorPowderC),
      growth: 0.4,
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.FROST, _pos, {
      radius: H * 0.6,
      life: this.fadeDuration + this._T(c.settleTime),
      intensity: 0.9,
      colorA: getColor(c.colorTrailA),
      colorB: getColor(c.colorTrailB),
      height: 0.02
    });

    /* powder rolling out along both long edges and forward, chips and glitter off the break */
    const np = Math.round(c.powderCount * g.particleCount);
    _emit.radius = 0.4;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.lifeVariance = 0.4;
    _emit.tint = null;
    _emit.time = time;
    for (let i = 0; i < np; i++) {
      const along = Math.random() * H;
      const s = Math.random() < 0.5 ? -1 : 1;
      _pos.copy(_pivot).addScaledVector(_face, along).addScaledVector(_side, s * W * 0.5 * Math.random());
      _pos.y = 0.5 + Math.random() * 1.2;
      _dir.copy(_side).multiplyScalar(s * 0.8).addScaledVector(_face, 0.6 + along / H);
      _dir.y = 0.35;
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = c.powderSpeed;
      _emit.size = 0.9;
      _emit.sizeVariance = 0.5;
      _emit.life = c.powderLifetime;
      _emit.spin = 0.5;
      this.powder.emit(1, _emit);
    }
    _pos.copy(_pivot).addScaledVector(_face, H * 0.5).setY(0.8);
    _emit.position = _pos;
    _emit.radius = Math.min(W, H) * 0.4;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed;
    _emit.spread = 0.9;
    _emit.size = 0.12;
    _emit.sizeVariance = 0.7;
    _emit.life = c.chipLifetime;
    _emit.spin = 10;
    this.chips.emit(Math.round(c.chipCount * g.particleCount), _emit);
    _emit.speed = c.chipSpeed * 0.6;
    _emit.size = 0.06;
    _emit.life = c.glitterLifetime;
    _emit.spin = 0;
    this.glitter.emit(Math.round(c.glitterCount * g.particleCount), _emit);

    this._crush(c, g, W, H);
  }

  /** Powder pouring off the crest as it heaves up. */
  _sloughFx(dt, c, g, W, H, rise) {
    const n = Math.round(this.sloughEmitter.tick(dt, c.sloughRate) * g.particleCount);
    if (n <= 0) return;
    const top = Math.max(0.2, this.rig.position.y + H);
    _emit.radius = 0.2;
    _emit.direction = _down;
    _emit.speed = 1.5;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.35;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.5;
    _emit.sizeVariance = 0.5;
    _emit.life = c.powderLifetime * 0.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.4;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    for (let i = 0; i < n; i++) {
      _pos.copy(_pivot).addScaledVector(_side, (Math.random() - 0.5) * W).addScaledVector(_face, 0.1);
      _pos.y = top * (0.75 + 0.25 * Math.random());
      _emit.position = _pos;
      this.powder.emit(1, _emit);
    }
    // The foot breaking the floor throws ice.
    if (rise < 0.95 && Math.random() < 0.5) {
      _pos.copy(_pivot).addScaledVector(_side, (Math.random() - 0.5) * W).setY(0.1);
      _emit.position = _pos;
      _emit.direction = _up;
      _emit.speed = c.chipSpeed * 0.5;
      _emit.spread = 0.8;
      _emit.size = 0.1;
      _emit.life = c.chipLifetime * 0.7;
      _emit.spin = 8;
      this.chips.emit(Math.max(1, Math.round(3 * g.particleCount)), _emit);
    }
  }

  _creakFx(c, g, W) {
    _pos.copy(_pivot).addScaledVector(_face, 0.15).setY(0.4);
    _emit.position = _pos;
    _emit.radius = W * 0.35;
    _emit.direction = _face;
    _emit.speed = c.chipSpeed * 0.35;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glitterLifetime * 0.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glitter.emit(Math.round(30 * g.particleCount), _emit);
  }

  /** The fault running to the circle. */
  _travelFx() {
    const c = settings[ID];
    const g = settings.global;
    const spacing = Math.max(0.2, c.trailSpacing);
    while (this.front - this._travelled >= spacing) {
      this._travelled += spacing;
      this.pointAt(saturate(this._travelled / this.length), _pos);
      this.ctx.decals.spawn(DecalType.CRACK, _pos, {
        radius: c.trailRadius,
        life: c.trailLife * g.lifetime,
        intensity: 1,
        colorA: getColor(c.colorTrailB),
        colorB: getColor(c.colorTrailA),
        width: 0.08,
        height: 0.02
      });
      _emit.position = _pos.setY(0.1);
      _emit.radius = 0.2;
      _emit.direction = _up;
      _emit.speed = 2.5;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.7;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.5;
      _emit.life = 0.6;
      _emit.lifeVariance = 0.4;
      _emit.spin = 8;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.chips.emit(Math.round(4 * g.particleCount), _emit);
    }
    this.ctx.shake.rumble(c.crackRumble * 0.5 * g.cameraShake, 1 / 60);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel() {
    this._sync();
    this._travelFx();
    this.position.y = 0.5;
  }

  onImpact() {
    this._sync();
    this.lightBoost = settings[ID].lightIntensity * 0.4;
  }

  onFade(dt) {
    this._sync();
    this._update(dt);
  }

  onDestroy() {
    for (let i = 0; i < MAX_CHUNKS; i++) this.recs[i].live = false;
    this._live = 0;
    this.chunks.visible = false;
    this.rig.visible = false;
    this.floor.visible = false;
    this.warp.visible = false;
    this._found.length = 0;
  }

  dispose() {
    this.shelfGeometry?.dispose();
    this.chunkGeometry.dispose();
    this.floorGeometry.dispose();
    this.warpGeometry.dispose();
    this.calfMaterial.dispose();
    this.stumpMaterial.dispose();
    this.chunkMaterial.dispose();
    this.floorMaterial.dispose();
    this.warpMaterial.dispose();
    this.chunks.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('🧊  Glacier Calving');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'fault speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.05, 5, 0.05, 'wreck sinks over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'crackTime', 0.05, 2, 0.01, 'floor splits over');
  R(time, c, 'riseTime', 0.1, 3, 0.01, 'shelf heaves up over');
  R(time, c, 'teeterTime', 0.05, 2, 0.01, 'looms for');
  R(time, c, 'fallTime', 0.1, 2, 0.01, 'topples over');
  R(time, c, 'settleTime', 0.1, 4, 0.05, 'wreck tumbles for');

  const sh = folder.addFolder('1 · Shelf');
  R(sh, c, 'shelfWidth', 1, 14, 0.05, 'width (m)');
  R(sh, c, 'shelfHeight', 1, 14, 0.05, 'height (m)');
  R(sh, c, 'shelfDepth', 0.2, 5, 0.05, 'thickness (m)');
  R(sh, c, 'shelfOffset', 0, 1.5, 0.01, 'foot behind centre (× circle)');
  R(sh, c, 'serracs', 1, 16, 1, 'seracs');
  R(sh, c, 'serracDepth', 0, 0.5, 0.005, 'serac notches (× height)');
  R(sh, c, 'roughness', 0, 0.1, 0.001, 'roughness');
  R(sh, c, 'riseOvershoot', 0, 1, 0.01, 'rise overshoot');
  R(sh, c, 'riseShudder', 0, 0.3, 0.005, 'rise judder (m)');
  R(sh, c, 'teeterBack', 0, 0.3, 0.005, 'leans back (rad)');
  R(sh, c, 'stumpHeight', 0, 1, 0.01, 'stump (× height)');
  R(sh, c, 'stumpDepth', 0.2, 5, 0.05, 'stump thickness (m)');
  const ice = sh.addFolder('Ice');
  R(ice, c, 'strataScale', 0, 5, 0.05, 'strata / m');
  R(ice, c, 'strataWarp', 0, 3, 0.01, 'strata warp');
  R(ice, c, 'strataDirt', 0, 1, 0.01, 'dirty seams');
  R(ice, c, 'grooveScale', 0.05, 5, 0.05, 'grooves / m');
  R(ice, c, 'grooveDepth', 0, 1, 0.01, 'groove depth');
  R(ice, c, 'snowCap', 0, 1, 0.01, 'snow cap');
  R(ice, c, 'subsurface', 0, 3, 0.01, 'glacial blue');
  R(ice, c, 'iceSpecular', 0, 3, 0.01, 'specular');
  R(ice, c, 'iceEnv', 0, 2, 0.01, 'sky reflection');
  R(ice, c, 'iceAmbient', 0, 1.5, 0.01, 'ambient');
  ice.addColor(c, 'colorDeep').name('deep blue');
  ice.addColor(c, 'colorIce').name('ice');
  ice.addColor(c, 'colorFirn').name('firn');
  ice.addColor(c, 'colorSnow').name('snow');
  ice.addColor(c, 'colorDirt').name('dirt seams');
  const fis = sh.addFolder('Fissure');
  R(fis, c, 'crackClimb', 0, 10, 0.05, 'climbs (m)');
  R(fis, c, 'crackScale', 0.1, 4, 0.05, 'cells / m');
  R(fis, c, 'crackGlow', 0, 12, 0.05, 'glow');
  fis.addColor(c, 'colorCrack').name('fissure');

  const ch = folder.addFolder('2 · Chunks');
  R(ch, c, 'chunkCount', 0, MAX_CHUNKS, 1, 'blocks');
  R(ch, c, 'chunkSize', 0.1, 3, 0.01, 'size (m)');
  R(ch, c, 'chunkJitter', 0, 1, 0.01, 'size variety');
  R(ch, c, 'chunkThrow', 0, 20, 0.1, 'thrown forward (m/s)');
  R(ch, c, 'chunkLift', 0, 20, 0.1, 'thrown up (m/s)');
  R(ch, c, 'chunkSpin', 0, 15, 0.1, 'tumble (rad/s)');
  R(ch, c, 'chunkGravity', -40, 0, 0.5, 'gravity');
  R(ch, c, 'chunkBounce', 0, 1, 0.01, 'bounce');
  R(ch, c, 'chunkFriction', 0, 15, 0.1, 'friction');

  const fl = folder.addFolder('3 · Crevasse field');
  R(fl, c, 'crevasseScale', 0.1, 3, 0.01, 'cells / m');
  R(fl, c, 'crevasseGlow', 0, 10, 0.05, 'glow');
  R(fl, c, 'powderReach', 0, 3, 0.01, 'powder fan (× height)');
  fl.addColor(c, 'colorFloorShade').name('shadowed floor');

  const pw = folder.addFolder('4 · Powder & ice');
  R(pw, c, 'sloughRate', 0, 500, 1, 'crest pours / s');
  R(pw, c, 'powderCount', 0, 400, 1, 'slam powder');
  R(pw, c, 'powderSize', 0.1, 5, 0.05, 'powder size');
  R(pw, c, 'powderSpeed', 0, 20, 0.1, 'powder speed');
  R(pw, c, 'powderLifetime', 0.1, 6, 0.05, 'powder lifetime');
  R(pw, c, 'powderOpacity', 0, 1, 0.01, 'powder opacity');
  Editor.gradient(pw, c, 'colorPowder', 'powder colour');
  R(pw, c, 'chipCount', 0, 600, 1, 'chips');
  R(pw, c, 'chipSpeed', 0, 25, 0.1, 'chip speed');
  R(pw, c, 'chipSize', 0.01, 0.6, 0.005, 'chip size');
  R(pw, c, 'chipLifetime', 0.1, 4, 0.05, 'chip lifetime');
  R(pw, c, 'chipGravity', -40, 0, 0.5, 'chip gravity');
  R(pw, c, 'glitterCount', 0, 600, 1, 'glitter');
  R(pw, c, 'glitterSize', 0.005, 0.3, 0.005, 'glitter size');
  R(pw, c, 'glitterLifetime', 0.1, 4, 0.05, 'glitter lifetime');
  Editor.gradient(pw, c, 'colorChip', 'ice colour');

  const hit = folder.addFolder('5 · Bodies');
  R(hit, c, 'hitImpulse', 0, 25, 0.1, 'crushed toward caster (m/s)');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hit, c, 'riseLift', 0, 25, 0.1, 'thrown up by the rise');
  R(hit, c, 'frostTint', 0, 1, 0.01, 'frosted');
  hit.addColor(c, 'colorBodyFrozen').name('frosted body');
  hit.addColor(c, 'colorBodyRim').name('rim');
  R(hit, c, 'bodyRimGlow', 0, 6, 0.05, 'rim glow');
  hit.addColor(c, 'colorBodyEdge').name('edge');
  R(hit, c, 'bodyEdgeGlow', 0, 8, 0.05, 'edge glow');

  const beat = folder.addFolder('6 · The beat');
  R(beat, c, 'crackRumble', 0, 1, 0.01, 'floor splitting');
  R(beat, c, 'riseRumble', 0, 1.5, 0.01, 'rise rumble');
  R(beat, c, 'creakShake', 0, 1, 0.01, 'creaks');
  R(beat, c, 'slamShake', 0, 2, 0.01, 'slam');
  R(beat, c, 'slamFlash', 0, 1, 0.01, 'slam flash');
  R(beat, c, 'slamLight', 0, 150, 0.5, 'light punch');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 12, 0.05, 'frost shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'frost shell life');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock ring life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'dustRingRadius', 0, 20, 0.05, 'powder ring (m)');
  R(beat, c, 'dustRingLife', 0.1, 5, 0.05, 'powder ring life');
  R(beat, c, 'slamWarp', 0, 4, 0.05, 'pressure wave');
  R(beat, c, 'slamWarpReach', 0.5, 20, 0.1, 'pressure wave reach (m)');
  const trail = beat.addFolder('Fault (travel)');
  R(trail, c, 'trailSpacing', 0.2, 5, 0.05, 'crack spacing (m)');
  R(trail, c, 'trailRadius', 0.1, 3, 0.05, 'crack radius (m)');
  R(trail, c, 'trailLife', 0.1, 5, 0.05, 'crack life');
  trail.addColor(c, 'colorTrailA').name('crack, pale');
  trail.addColor(c, 'colorTrailB').name('crack, blue');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 8, 0.05, 'height (m)');
}
