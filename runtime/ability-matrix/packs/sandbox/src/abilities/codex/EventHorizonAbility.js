import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createHorizonGrid, createHorizonQuad } from '../../assets/codex/EventHorizonGeometry.js';
import {
  createWallMaterial,
  createFloorMaterial,
  createShearBladeMaterial,
  createSeedMaterial,
  createHorizonLensMaterial
} from '../../materials/codex/EventHorizonMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'horizon';

const TAU = Math.PI * 2;
/** Bodies the drawstring can hold at once. */
const MAX_GRIPS = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * EVENT HORIZON — Cosmic, zone cast.
 *
 * Built to be told apart from every other gravity spell here at a glance:
 * Graviton Collapse is a well in the floor, Astral Void a lensed hole, Nebula
 * Collapse a cloud becoming a star. This is the *horizon itself* — a surface
 * — stood up round the circle and pulled shut.
 *
 * A singularity — a black bead in a thin photon ring — is thrown into the
 * circle. The **horizon stands up** round the rim: a wall of absolute black
 * rising out of the floor, a blazing photon ring along its lip, streams of
 * light dragged round it. Inside it the floor is gone: void, and stars wound
 * into a spiral. Outside it every streak of light on the floor is being
 * pulled inward. Then it **draws closed** like a drawstring — accelerating,
 * spinning up as it narrows, growing taller, its bands winding into helices
 * — and every body it passes is knocked down and dragged in with it toward
 * the column it is becoming. At its tightest it is **sheared**: a plane of
 * white light races out from it at waist height, the column parts along it,
 * top twisting one way and lifting, bottom the other way and sinking, cut
 * faces white-hot — everything held is flung out, anything still standing
 * inside is cut in two — and the halves **tear away** into motes. Sheared
 * rings are left burnt into the floor, fading.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seed** (`createSeedMaterial`).
 *   2. **the wall** (`createWallMaterial`) — the horizon: black, banded, the
 *      photon ring, the floor seam, the lensing rim, the cut, the shred.
 *   3. **the shear blade** (`createShearBladeMaterial`).
 *   4. **the floor** (`createFloorMaterial`) — void and stars inside, light
 *      drawn in outside, sheared rings after.
 *   5. **the lens** (`createHorizonLensMaterial`, `LAYER.DISTORTION`).
 *   6. **particles** — violet streaks spiralling in, dark chips torn off the
 *      floor and dragged in, motes flung off the torn column.
 *   7. **the cut** — flat AIR shell, SHOCKWAVE and ARC decals, flash, shake,
 *      light punch; a rumble while it draws closed.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * The wall knocks a body down inward the frame it passes it, then holds it
 * (`Dummy#carry`, buoyed) in a current that drags it toward the column and
 * round it. At the cut every held body is shoved outward and released, and
 * anything still standing within the column's reach is cut down — sliced, by
 * default.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, one clock from the seed's landing, integrated phases
 * (spin, band flow, infall) and the bodies it holds. Every size, time and
 * colour is read from `settings.horizon` every frame.
 */
export class EventHorizonAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._gripCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.wallGeometry = createHorizonGrid(128, 24, 0.7);
    this.bladeGeometry = createHorizonGrid(24, 96);
    this.quadGeometry = createHorizonQuad();

    this.floorMaterial = createFloorMaterial();
    this.floor = this._mesh(this.quadGeometry, this.floorMaterial, LAYER.VFX, 2);
    this.wallMaterial = createWallMaterial();
    this.wall = this._mesh(this.wallGeometry, this.wallMaterial, LAYER.VFX, 10);
    this.bladeMaterial = createShearBladeMaterial();
    this.blade = this._mesh(this.bladeGeometry, this.bladeMaterial, LAYER.VFX, 12);
    this.seedMaterial = createSeedMaterial();
    this.seed = this._mesh(this.quadGeometry, this.seedMaterial, LAYER.VFX, 14);
    this.lensMaterial = createHorizonLensMaterial();
    this.lens = this._mesh(this.quadGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    this._center = new Vector3();
    this._wallState = { center: new Vector3(), radius: 5, height: 2.6, slant: 0, spin: 0, grow: 0, twist: 0, split: 0, flow: 0, shred: 0, power: 1, seed: 0 };
    this._floorState = { center: new Vector3(), zone: 5, radius: 5, grow: 0, infall: 0, scar: 0, fadeT: 0, seed: 0 };
    this._bladeState = { center: new Vector3(), r0: 0.5, r1: 0.5, power: 0, seed: 0 };
    this._seedState = { center: new Vector3(), size: 0.5, intensity: 1 };
    this._lensState = { center: new Vector3(), size: 3, strength: 0, ring: -1 };

    this._seedVal = 0;
    this._R = 5;
    this._prevR = 5;
    this._spin = 0;
    this._spinVel = 0;
    this._flow = 0;
    this._infall = 0;
    this._cut = false;

    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push(null);
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    /**
     * The current the held bodies are carried in: toward a ring just inside
     * the wall at `holdHeight`, and round it the way the wall is spinning.
     * Built once; reads the cast's live state.
     */
    this._field = (x, y, z, out) => {
      const c = settings[ID];
      const dx = this._center.x - x;
      const dz = this._center.z - z;
      const d = Math.max(0.05, Math.hypot(dx, dz));
      const target = Math.max(0.2, this._R * 0.55);
      const inward = (d - target) * 3;
      const swirl = this._spinVel * d;
      out.set((dx / d) * inward - (dz / d) * swirl, (c.holdHeight - y) * 3, (dz / d) * inward + (dx / d) * swirl);
      return out;
    };
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
    this.infall = particles.get('horizon.infall', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.infall.uniforms.uSizeIn.value = 0.05;
    this.infall.uniforms.uFadeIn.value = 0.15;
    this.infall.uniforms.uFadeOut.value = 0.4;
    this.infall.uniforms.uEndSize.value = 0.4;
    this.infall.uniforms.uDrag.value = 0.2;

    this.debris = particles.get('horizon.debris', {
      capacity: 600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.debris.uniforms.uSizeIn.value = 0.05;
    this.debris.uniforms.uFadeIn.value = 0.05;
    this.debris.uniforms.uFadeOut.value = 0.4;
    this.debris.uniforms.uEndSize.value = 0.3;
    this.debris.uniforms.uDrag.value = 0.3;

    this.shred = particles.get('horizon.shred', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.shred.uniforms.uSizeIn.value = 0.05;
    this.shred.uniforms.uFadeIn.value = 0.03;
    this.shred.uniforms.uFadeOut.value = 0.5;
    this.shred.uniforms.uEndSize.value = 0.3;
    this.shred.uniforms.uDrag.value = 1.6;
    this.shred.uniforms.uTurbFrequency.value = 0.8;
    this.shred.uniforms.uTurbSpeed.value = 0.6;

    this.infallEmitter = new RateEmitter();
    this.debrisEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    const c = settings[ID];
    return (Math.max(0.05, c.openTime) + Math.max(0.05, c.drawTime) + Math.max(0.05, c.shearTime) + Math.max(0.05, c.shredTime)) * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  _zone() {
    return Math.max(0.5, settings[ID].zoneRadius);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seedVal = Math.random() * 100;
    this._R = this._zone();
    this._prevR = this._R;
    this._spin = Math.random() * TAU;
    this._spinVel = 0;
    this._flow = 0;
    this._infall = 0;
    this._cut = false;
    this._releaseGrips(false);
    this.infallEmitter.reset();
    this.debrisEmitter.reset();

    this.pointAt(1, this._center);
    this._center.y = 0;
    const ws = this._wallState;
    ws.seed = this._seedVal;
    ws.grow = 0;
    ws.twist = 0;
    ws.split = 0;
    ws.shred = 0;
    ws.power = 1;
    const fs = this._floorState;
    fs.seed = this._seedVal;
    fs.grow = 0;
    fs.scar = 0;
    fs.fadeT = 0;
    this._bladeState.seed = this._seedVal;
    this._bladeState.power = 0;
    this._lensState.ring = -1;
    this._lensState.strength = 0;

    this.seed.visible = true;
    this.wall.visible = false;
    this.floor.visible = false;
    this.blade.visible = false;
    this.lens.visible = true;
    this._syncAll();
  }

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    const ws = this._wallState;
    ws.center.copy(this._center);
    ws.radius = this._R;
    ws.spin = this._spin;
    ws.flow = this._flow;
    this.wallMaterial.userData.sync(ws);
    const fs = this._floorState;
    fs.center.copy(this._center);
    fs.zone = this._zone();
    fs.radius = this._R;
    fs.grow = ws.grow;
    fs.infall = this._infall;
    this.floorMaterial.userData.sync(fs);
    this._bladeState.center.copy(this._center);
    this.bladeMaterial.userData.sync(this._bladeState);
    this.seedMaterial.userData.sync(this._seedState);
    this.lensMaterial.userData.sync(this._lensState);

    this.infall.setGradient(getColor(c.colorInfallA), getColor(c.colorInfallB), getColor(c.colorInfallC), getColor(c.colorInfallD));
    const k = this.infall.uniforms;
    k.uGravity.value.set(0, 0, 0);
    k.uStretch.value = c.streakStretch;
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.streakParticleGlow * g.glow;
    k.uTurbulence.value = 0.1 * g.turbulence;

    this.debris.setGradient(getColor(c.colorDebrisA), getColor(c.colorDebrisB), getColor(c.colorDebrisC), getColor(c.colorDebrisD));
    const d = this.debris.uniforms;
    d.uGravity.value.set(0, -2, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uTurbulence.value = 0.2 * g.turbulence;

    this.shred.setGradient(getColor(c.colorShredA), getColor(c.colorShredB), getColor(c.colorShredC), getColor(c.colorShredD));
    const s = this.shred.uniforms;
    s.uGravity.value.set(0, 0.2, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.shredGlow * g.glow;
    s.uTurbulence.value = 1.0 * g.turbulence;
  }

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

  /* ------------------------------------------------------------------ */
  /* Travel — the singularity                                            */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const u = this.u;
    this.pointAt(u, _pos);
    _pos.y = lerp(1.5, 0.6, u) + c.seedArc * 4 * u * (1 - u);
    const ss = this._seedState;
    ss.center.copy(_pos);
    ss.size = c.seedSize * smoothstep(0, 0.1, this.age);
    ss.intensity = 1;
    const ls = this._lensState;
    ls.center.copy(_pos);
    ls.size = c.seedSize * 3;
    ls.strength = 0.6;
    ls.ring = -1;
    this._syncAll();
    this.position.copy(_pos);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — stand, draw closed, shear, tear                            */
  /* ------------------------------------------------------------------ */

  onImpact() {
    this.wall.visible = true;
    this.floor.visible = true;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const zone = this._zone();
    const ws = this._wallState;
    const fs = this._floorState;
    const bs = this._bladeState;
    const ls = this._lensState;

    if (t <= 1) {
      const tau = (t * this.impactDuration) / Math.max(0.01, g.lifetime);
      const tO = Math.max(0.05, c.openTime);
      const tD = Math.max(0.05, c.drawTime);
      const tS = Math.max(0.05, c.shearTime);
      const tR = Math.max(0.05, c.shredTime);
      const ko = saturate(tau / tO);
      const kd = saturate((tau - tO) / tD);
      const ks = saturate((tau - tO - tD) / tS);
      const kr = saturate((tau - tO - tD - tS) / tR);

      // The drawstring: accelerating, and spinning up as it narrows.
      this._prevR = this._R;
      const minR = Math.max(0.1, Math.min(c.minRadius, zone));
      this._R = lerp(zone, minR, Easing.inCubic(kd));
      this._spinVel = (c.spinRate * TAU * zone) / Math.max(0.2, this._R) * (ks > 0 ? 1 - ks : 1);
      this._spin += this._spinVel * dt * g.animationSpeed;
      this._flow += c.bandFlow * (1 + 3 * kd) * dt * g.animationSpeed;
      this._infall += c.infallSpeed * (0.5 + kd) * dt * g.animationSpeed;

      ws.grow = Easing.outCubic(ko);
      ws.height = c.wallHeight * (1 + c.wallStretch * Easing.inQuad(kd));
      ws.slant = c.maxSlant * Easing.inQuad(kd);
      ws.twist = c.shearTwist * Easing.outCubic(ks);
      ws.split = c.shearSplit * Easing.outCubic(ks) + kr * c.shearSplit;
      ws.shred = kr;
      ws.power = 1;
      fs.scar = ks;
      fs.fadeT = 0;

      // The seed sinks into the floor as the wall stands up.
      const ss = this._seedState;
      ss.center.copy(this._center).setY(lerp(0.6, 0.0, ko));
      ss.intensity = 1 - ko;
      this.seed.visible = ko < 1;

      // The shear blade.
      bs.r0 = this._R;
      bs.r1 = lerp(this._R, c.discRadius * g.explosionIntensity, Easing.outCubic(saturate(ks * 1.4)));
      bs.power = ks > 0 ? 1 - Easing.inQuad(saturate(ks * 1.2 + kr * 0.5)) : 0;
      this.blade.visible = bs.power > 0.01;

      // The lens, then its push ring at the cut.
      ls.center.copy(this._center).setY(Math.min(1.4, ws.height * 0.5));
      ls.size = Math.max(1.5, this._R * c.lensScale + 1);
      ls.strength = ko * (1 - kr);
      if (ks > 0) {
        const rp = saturate((tau - tO - tD) / Math.max(0.05, c.ringTime));
        ls.ring = rp < 1 ? Easing.outCubic(rp) : -1;
        ls.size = zone * 1.6;
        ls.strength = rp < 1 ? 1 : 0;
      }
      this.lens.visible = ls.strength > 0.01;

      if (ks > 0 && !this._cut) this._shear();
      this._syncAll();
      if (!this._cut) {
        this._drawFx(dt, ko);
        this._wallHits();
        this.ctx.shake.rumble(c.drawRumble * kd, dt);
      }
      this._carryGrips();

      this.position.copy(this._center).setY(1.2);
      return;
    }

    /* the fade: the scar cools and erodes */
    const ft = saturate(t - 1);
    this.wall.visible = false;
    this.blade.visible = false;
    this.seed.visible = false;
    this.lens.visible = false;
    ws.grow = 0;
    fs.scar = 1 - ft * 0.5;
    fs.fadeT = smoothstep(0.2, 1, ft);
    this._syncAll();
    this.position.copy(this._center).setY(0.5);
  }

  /** The cut. */
  _shear() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._cut = true;

    _pos.copy(this._center).setY(c.shearHeight);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.1,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.65,
      fresnel: 2.2,
      displace: 0.2,
      turbulence: 1,
      squash: 0.15,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._center, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.ARC, this._center, {
      radius: this._zone() * 0.8,
      life: this.impactDuration + this.fadeDuration,
      intensity: 1.0,
      colorA: getColor(c.colorScar),
      colorB: getColor(c.colorBand)
    });

    // Motes flung off the column, round and out.
    this._resetEmit(time);
    _emit.size = c.shredSize;
    _emit.life = c.shredLife;
    _emit.speed = c.shredSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.3;
    _emit.radius = 0.1;
    const n = Math.round(c.shredCount * g.particleCount);
    const H = c.wallHeight * (1 + c.wallStretch);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const h = Math.random() * H;
      _pos.set(this._center.x + Math.cos(a) * this._R, h, this._center.z + Math.sin(a) * this._R);
      // Outward and along the spin; hottest along the cut.
      _dir.set(Math.cos(a) - Math.sin(a) * 0.8, (h - c.shearHeight) * 0.15, Math.sin(a) + Math.cos(a) * 0.8).normalize();
      _emit.position = _pos;
      _emit.direction = _dir;
      this.shred.emit(1, _emit);
    }

    // Everything held is flung out; anything still standing inside is cut.
    const power2 = g.explosionIntensity;
    for (let i = 0; i < this._gripCount; i++) {
      const dummy = this._grips[i];
      if (!dummy || dummy.finished) continue;
      const dx = dummy.position.x - this._center.x;
      const dz = dummy.position.z - this._center.z;
      const d = Math.max(0.05, Math.hypot(dx, dz));
      dummy.shove((dx / d) * c.shearImpulse * power2 - (dz / d) * 3, c.shearLift * power2, (dz / d) * c.shearImpulse * power2 + (dx / d) * 3);
      dummy.release();
    }
    this._gripCount = 0;
    for (let i = 0; i < MAX_GRIPS; i++) this._grips[i] = null;
    this._cutHits();

    this.ctx.shake.add(c.shearShake * power, 1 / Math.max(0.05, c.shakeDuration), 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.shearFlash * power);
    this.lightBoost = c.lightIntensity * c.shearLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Streaks spiralling in toward the wall, chips torn off the floor. */
  _drawFx(dt, grow) {
    const c = settings[ID];
    const g = settings.global;
    const zone = this._zone();
    const time = frame.uTime.value;
    const n = Math.round(this.infallEmitter.tick(dt, c.infallRate * grow) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.size = c.streakSize;
      _emit.life = c.streakLife;
      _emit.lifeVariance = 0.4;
      _emit.speedVariance = 0.3;
      _emit.spread = 0.05;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = lerp(this._R + 0.4, zone * 1.6, Math.random());
        _pos.set(this._center.x + Math.cos(a) * r, 0.1 + Math.random() * 1.8, this._center.z + Math.sin(a) * r);
        // Inward, and round the way the horizon turns.
        _vel.set(-Math.cos(a) - Math.sin(a) * 0.7, 0, -Math.sin(a) + Math.cos(a) * 0.7).normalize();
        _emit.position = _pos;
        _emit.direction = _vel;
        _emit.speed = Math.min(c.streakSpeed, (r - this._R) / Math.max(0.1, c.streakLife));
        this.infall.emit(1, _emit);
      }
    }
    const m = Math.round(this.debrisEmitter.tick(dt, c.debrisRate * grow) * g.particleCount);
    if (m > 0) {
      this._resetEmit(time);
      _emit.size = c.debrisSize;
      _emit.life = c.debrisLife;
      _emit.spin = 6;
      _emit.spread = 0.2;
      for (let i = 0; i < m; i++) {
        const a = Math.random() * TAU;
        const r = lerp(this._R + 0.3, zone * 1.3, Math.random());
        _pos.set(this._center.x + Math.cos(a) * r, 0.05, this._center.z + Math.sin(a) * r);
        _vel.set(-Math.cos(a) - Math.sin(a) * 0.5, 0.5, -Math.sin(a) + Math.cos(a) * 0.5).normalize();
        _emit.position = _pos;
        _emit.direction = _vel;
        _emit.speed = c.debrisSpeed;
        this.debris.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /** Knock down every standing body the closing wall has passed. */
  _wallHits() {
    if (this._R >= this._prevR) return;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(this._center.x, this._center.z, this._prevR + 0.2, this._found);
    if (found.length === 0) return;
    this._force.impulse = c.drawImpulse * g.explosionIntensity;
    this._force.lift = c.drawLift * g.explosionIntensity;
    this._force.spin = 1;
    for (const dummy of found) {
      const dx = dummy.position.x - this._center.x;
      const dz = dummy.position.z - this._center.z;
      const d = Math.hypot(dx, dz);
      if (d < this._R) continue; // still inside; the wall has not reached it
      if (d > 1e-3) _dir.set(-dx / d, 0, -dz / d);
      else _dir.copy(this.direction);
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      if (this._gripCount < MAX_GRIPS) this._grips[this._gripCount++] = dummy;
    }
  }

  /** Carry the held bodies in the current. */
  _carryGrips() {
    if (this._cut) return;
    const c = settings[ID];
    for (let i = 0; i < this._gripCount; i++) {
      const dummy = this._grips[i];
      if (!dummy || dummy.finished) continue;
      dummy.carry(this._field, c.pull, c.pull, c.buoyancy);
    }
  }

  /** At the cut: whatever is still standing within reach is cut down. */
  _cutHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const reach = this._R + 1.2;
    const found = field.findTargets(this._center.x, this._center.z, reach, this._found);
    this._force.impulse = c.shearImpulse * power;
    this._force.lift = c.shearLift * power;
    this._force.spin = c.shearSpin;
    for (const dummy of found) {
      const dx = dummy.position.x - this._center.x;
      const dz = dummy.position.z - this._center.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) _dir.set(dx / d, 0, dz / d);
      else _dir.copy(this.direction);
      dummy.kill(_dir.x, _dir.z, this._force, c.hitSlice >= 0.5);
    }
  }

  _releaseGrips(release) {
    for (let i = 0; i < MAX_GRIPS; i++) {
      const dummy = this._grips[i];
      if (dummy && release) dummy.release();
      this._grips[i] = null;
    }
    this._gripCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.wall.visible = false;
    this.floor.visible = false;
    this.blade.visible = false;
    this.seed.visible = false;
    this.lens.visible = false;
    this._releaseGrips(true);
  }

  dispose() {
    this.wallGeometry.dispose();
    this.bladeGeometry.dispose();
    this.quadGeometry.dispose();
    this.wallMaterial.dispose();
    this.floorMaterial.dispose();
    this.bladeMaterial.dispose();
    this.seedMaterial.dispose();
    this.lensMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◎  Event Horizon');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 1, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 4, 90, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'scar fades over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');

  const seed = folder.addFolder('1 · The seed');
  R(seed, c, 'seedSize', 0.05, 3, 0.01, 'radius (m)');
  R(seed, c, 'seedGlow', 0, 10, 0.05, 'ring glow');
  R(seed, c, 'seedArc', 0, 8, 0.05, 'arc (m)');

  const wall = folder.addFolder('2 · The wall');
  R(wall, c, 'openTime', 0.05, 3, 0.01, 'stands up over (s)');
  R(wall, c, 'drawTime', 0.05, 5, 0.01, 'draws closed over (s)');
  R(wall, c, 'minRadius', 0.1, 4, 0.01, 'closes to (m)');
  R(wall, c, 'wallHeight', 0.2, 10, 0.05, 'height (m)');
  R(wall, c, 'wallStretch', 0, 4, 0.01, 'grows as it narrows (×)');
  R(wall, c, 'wallOpacity', 0, 1, 0.01, 'opacity');
  R(wall, c, 'spinRate', -1, 1, 0.005, 'spin at the rim (rev/s)');
  R(wall, c, 'maxSlant', -8, 8, 0.01, 'wind when closed (rad)');
  R(wall, c, 'bandCount', 1, 64, 1, 'bands');
  R(wall, c, 'bandFollow', 0, 2, 0.01, 'bands follow the wind');
  R(wall, c, 'bandGlow', 0, 10, 0.05, 'band glow');
  R(wall, c, 'bandFlow', -6, 6, 0.01, 'band flow');
  R(wall, c, 'ringGlow', 0, 20, 0.05, 'photon ring glow');
  R(wall, c, 'ringWidth', 0.003, 0.3, 0.001, 'photon ring width');
  R(wall, c, 'baseGlow', 0, 10, 0.05, 'floor seam glow');
  R(wall, c, 'wallFresnel', 0, 6, 0.01, 'lensing rim');
  wall.addColor(c, 'colorVoid').name('void');
  wall.addColor(c, 'colorBand').name('bands');
  wall.addColor(c, 'colorRing').name('photon ring');
  wall.addColor(c, 'colorRingHalo').name('ring halo');
  wall.addColor(c, 'colorBase').name('floor seam');

  const shear = folder.addFolder('3 · The shear');
  R(shear, c, 'shearTime', 0.05, 2, 0.01, 'parts over (s)');
  R(shear, c, 'shredTime', 0.05, 3, 0.01, 'tears away over (s)');
  R(shear, c, 'shearHeight', 0.1, 4, 0.01, 'cut height (m)');
  R(shear, c, 'shearTwist', -4, 4, 0.01, 'halves turn (rad)');
  R(shear, c, 'shearSplit', 0, 3, 0.01, 'halves part (m)');
  R(shear, c, 'cutGlow', 0, 15, 0.05, 'cut glow');
  R(shear, c, 'discRadius', 0.5, 20, 0.05, 'blade reach (m)');
  R(shear, c, 'discGlow', 0, 12, 0.05, 'blade glow');
  R(shear, c, 'discEdge', 0.005, 0.5, 0.005, 'blade edge');
  shear.addColor(c, 'colorDisc').name('blade');
  shear.addColor(c, 'colorDiscEdge').name('blade trailing');

  const floor = folder.addFolder('4 · The floor');
  R(floor, c, 'starDensity', 5, 200, 1, 'stars');
  R(floor, c, 'starGlow', 0, 10, 0.05, 'star glow');
  R(floor, c, 'lensSwirl', 0, 12, 0.05, 'star swirl');
  R(floor, c, 'streakCount', 1, 120, 1, 'streaks drawn in');
  R(floor, c, 'streakGlow', 0, 8, 0.05, 'streak glow');
  R(floor, c, 'infallSpeed', 0, 6, 0.01, 'infall speed');
  R(floor, c, 'floorDim', 0, 1, 0.01, 'pulled floor darkens');
  R(floor, c, 'scarGlow', 0, 8, 0.05, 'scar glow');
  R(floor, c, 'floorErode', 0, 1, 0.01, 'ragged fade');
  floor.addColor(c, 'colorFloorVoid').name('void');
  floor.addColor(c, 'colorStar').name('stars');
  floor.addColor(c, 'colorStreak').name('streaks');
  floor.addColor(c, 'colorScar').name('scar');

  const lens = folder.addFolder('5 · Lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'strength');
  R(lens, c, 'lensScale', 0.5, 4, 0.01, 'size (× radius)');

  const fx = folder.addFolder('6 · Particles');
  R(fx, c, 'infallRate', 0, 1000, 1, 'streaks/second');
  R(fx, c, 'streakSpeed', 0, 20, 0.1, 'streak speed');
  R(fx, c, 'streakSize', 0.005, 0.3, 0.001, 'streak size');
  R(fx, c, 'streakStretch', 0, 1, 0.005, 'streak stretch');
  R(fx, c, 'streakLife', 0.05, 3, 0.01, 'streak lifetime');
  R(fx, c, 'streakParticleGlow', 0, 10, 0.05, 'streak glow');
  Editor.gradient(fx, c, 'colorInfall', 'streak gradient');
  R(fx, c, 'debrisRate', 0, 300, 1, 'chips/second');
  R(fx, c, 'debrisSize', 0.01, 0.5, 0.005, 'chip size');
  R(fx, c, 'debrisSpeed', 0, 15, 0.1, 'chip speed');
  R(fx, c, 'debrisLife', 0.1, 4, 0.05, 'chip lifetime');
  Editor.gradient(fx, c, 'colorDebris', 'chip gradient');
  R(fx, c, 'shredCount', 0, 1000, 1, 'motes at the cut');
  R(fx, c, 'shredSpeed', 0, 30, 0.1, 'mote speed');
  R(fx, c, 'shredSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'shredLife', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'shredGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorShred', 'mote gradient');

  const cut = folder.addFolder('7 · The cut');
  R(cut, c, 'burstSize', 0, 14, 0.05, 'air shell (m)');
  R(cut, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(cut, c, 'shockRadius', 0, 18, 0.05, 'shockwave (m)');
  R(cut, c, 'ringTime', 0.05, 2, 0.01, 'push ring over (s)');
  R(cut, c, 'shearFlash', 0, 1, 0.01, 'flash');
  R(cut, c, 'shearShake', 0, 1.5, 0.01, 'camera knock');
  R(cut, c, 'drawRumble', 0, 1, 0.01, 'rumble while closing');
  R(cut, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(cut, c, 'shearLight', 0, 8, 0.01, 'light punch (× intensity)');
  cut.addColor(c, 'colorBurstA').name('shell inner');
  cut.addColor(c, 'colorBurstB').name('shell mid');
  cut.addColor(c, 'colorBurstC').name('shell outer');
  cut.addColor(c, 'colorShockA').name('shockwave');
  cut.addColor(c, 'colorShockB').name('shockwave hot');
  cut.addColor(c, 'colorFlash').name('flash');

  const hits = folder.addFolder('8 · Hits');
  R(hits, c, 'drawImpulse', 0, 20, 0.1, 'knocked inward (m/s)');
  R(hits, c, 'drawLift', 0, 10, 0.05, 'lift (m/s)');
  R(hits, c, 'pull', 0, 1, 0.01, 'drag strength');
  R(hits, c, 'holdHeight', 0, 4, 0.01, 'dragged up to (m)');
  R(hits, c, 'buoyancy', 0, 1, 0.01, 'weight carried');
  R(hits, c, 'shearImpulse', 0, 40, 0.1, 'flung out (m/s)');
  R(hits, c, 'shearLift', 0, 20, 0.05, 'flung lift (m/s)');
  R(hits, c, 'shearSpin', 0, 8, 0.01, 'tumble');
  R(hits, c, 'hitSlice', 0, 1, 1, 'slices (0/1)');

  folder.close();
  return folder;
}
