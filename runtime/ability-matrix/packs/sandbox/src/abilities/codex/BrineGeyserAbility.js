import {
  CircleGeometry,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3
} from 'three';
import { Ability } from '../Ability.js';
import { createColumnGeometry, createCrystalGeometry } from '../../assets/codex/BrineGeyserGeometry.js';
import { createColumnMaterial, createCrustMaterial, createCrystalMaterial } from '../../materials/codex/BrineGeyserMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'brine';

const TAU = Math.PI * 2;
const MAX_CRYSTALS = 80;
/** Bodies one cast can be salting at once. */
const MAX_SALTED = 16;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _center = new Vector3();
const _floor = new Vector3();
const _scale = new Vector3();
const _euler = new Euler();
const _quat = new Quaternion();
const _matrix = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);

/**
 * BRINE GEYSER — a column of brine punches up, rains down, and salts the circle.
 *
 * A zone cast in four beats. **The pan cracks**: while the cast reaches out,
 * the floor of the target circle splits into the polygons of a salt flat,
 * spreading out from the middle, its seams seeping glowing brine and
 * bubbling, steam lifting off it, the ground rumbling harder and harder.
 * **The punch**: a column of green-white brine erupts from the middle —
 * nine metres in a fifth of a second — with a WATER shell, a shockwave and a
 * hard knock on the camera. Whatever stands near the vent rides the column
 * up; the rest of the circle is blown flat. **The roar**: the column stands,
 * surges racing up its trunk under white bands of salt foam, its crown burst
 * open like an umbrella and raining brine back over the circle. **The
 * salting**: the column falls back into the vent, the rain whitens the pan
 * into crust, and salt crystals grow up out of it — clusters of hexagonal
 * spikes spreading from the vent to the rim — while every body the geyser
 * threw is crusted white. The crystals stand, glittering, then crumble and
 * the pan erodes away.
 *
 * Not the Maelstrom's geyser (a closing flourish on a whirlpool) and not a
 * splash: this is a standing column with a crown, and its afterlife is salt.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the salt pan** (`createCrustMaterial`) — the cracking, seeping,
 *      whitening floor disc.
 *   2. **the column** (`createColumnMaterial(0)`) — the geyser, raised from a
 *      cylinder grid in the vertex stage, with its crown.
 *   3. **refraction** — the column on `LAYER.DISTORTION`.
 *   4. **salt crystals** (`createCrystalMaterial`) — an `InstancedMesh` of
 *      crystal clusters on `LAYER.WORLD` (prepass, shadows), growing and
 *      crumbling on the CPU.
 *   5. **rain, spray, steam, bubbles & glitter** — DROPLET rain out of the
 *      crown and a spray at the punch, SMOKE steam, BUBBLE in the seams, an
 *      additive glitter off the crust.
 *   6. **the punch** — a WATER shell, SHOCKWAVE, RIPPLE and FROST (salt
 *      rime) decals, flash, knock, light punch, the build-up rumble.
 *   7. **the launch & the salting** — `handlesOwnHits`: launched up the
 *      column or blown outward, then crusted (`Dummy#corrode`).
 *
 * ## The editor rule
 *
 * A cast rolls a seed and each crystal's place and dice; every height, time
 * and colour is read from `settings.brine` per frame.
 */
export class BrineGeyserAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Crystal clusters standing. HUD readout only. */
  get instanceCount() {
    return this._crystalShown;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the pan ---- */
    this.crustGeometry = new CircleGeometry(1, 96, 0, TAU);
    this.crustMaterial = createCrustMaterial();
    this.crust = this._mesh(this.crustGeometry, this.crustMaterial, LAYER.VFX, 2);

    /* ---- layers 2 + 3: the column and its lens ---- */
    this.columnGeometry = createColumnGeometry(56, 72);
    this.columnMaterial = createColumnMaterial(0);
    this.column = this._mesh(this.columnGeometry, this.columnMaterial, LAYER.VFX, 12);
    this.lensMaterial = createColumnMaterial(1);
    this.lens = this._mesh(this.columnGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /* ---- layer 4: the crystals ---- */
    this.crystalGeometry = createCrystalGeometry();
    this.crystalAttr = new InstancedBufferAttribute(new Float32Array(MAX_CRYSTALS * 2), 2);
    this.crystalAttr.setUsage(DynamicDrawUsage);
    this.crystalGeometry.setAttribute('aCrystal', this.crystalAttr);
    this.crystalMaterial = createCrystalMaterial();
    this.crystals = new InstancedMesh(this.crystalGeometry, this.crystalMaterial, MAX_CRYSTALS);
    this.crystals.instanceMatrix.setUsage(DynamicDrawUsage);
    this.crystals.layers.set(LAYER.WORLD);
    this.crystals.castShadow = true;
    this.crystals.frustumCulled = false;
    this.crystals.visible = false;
    this.crystals.count = 0;
    this.group.add(this.crystals);

    this._cr = [];
    for (let i = 0; i < MAX_CRYSTALS; i++) {
      this._cr.push({ x: 0, z: 0, yaw: 0, tiltX: 0, tiltZ: 0, size: 1, delay: 0, seed: 0 });
    }
    this._crystalUsed = 0;
    this._crystalShown = 0;

    this._columnState = { center: new Vector3(), height: 0, open: 0, surge: 0, fade: 1, seed: 0 };
    this._crustState = { center: new Vector3(), spread: 0, salt: 0, seep: 0, erode: 0, seed: 0 };

    this._salted = [];
    for (let i = 0; i < MAX_SALTED; i++) this._salted.push({ dummy: null, time: 0 });
    this._saltCount = 0;
    this._look = { color: '#ffffff', rimColor: '#ffffff', rimEmissive: 0, edgeColor: '#ffffff', edgeEmissive: 0, edgeWidth: 0.05 };
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    this._seed = 0;
    this._punched = false;
    this._crystalClock = -1;
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

    this.rain = particles.get('brine.rain', {
      capacity: 3600,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.rain.uniforms.uSizeIn.value = 0.05;
    this.rain.uniforms.uFadeIn.value = 0.03;
    this.rain.uniforms.uFadeOut.value = 0.25;
    this.rain.uniforms.uEndSize.value = 0.7;
    this.rain.uniforms.uDrag.value = 0.25;

    this.steam = particles.get('brine.steam', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.steam.uniforms.uSizeIn.value = 0.25;
    this.steam.uniforms.uFadeIn.value = 0.15;
    this.steam.uniforms.uFadeOut.value = 0.6;
    this.steam.uniforms.uEndSize.value = 2.4;
    this.steam.uniforms.uDrag.value = 1.2;

    this.bubbles = particles.get('brine.bubbles', {
      capacity: 500,
      shape: ParticleShape.BUBBLE,
      additive: false,
      softFade: 0.2
    });
    this.bubbles.uniforms.uSizeIn.value = 0.2;
    this.bubbles.uniforms.uFadeIn.value = 0.1;
    this.bubbles.uniforms.uFadeOut.value = 0.2;
    this.bubbles.uniforms.uEndSize.value = 1.4;
    this.bubbles.uniforms.uDrag.value = 3;

    this.glitter = particles.get('brine.glitter', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.1
    });
    this.glitter.uniforms.uSizeIn.value = 0.1;
    this.glitter.uniforms.uFadeIn.value = 0.1;
    this.glitter.uniforms.uFadeOut.value = 0.5;
    this.glitter.uniforms.uEndSize.value = 0.2;
    this.glitter.uniforms.uDrag.value = 3;

    this.rainEmitter = new RateEmitter();
    this.steamEmitter = new RateEmitter();
    this.bubbleEmitter = new RateEmitter();
    this.glitterEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _span() {
    const c = settings[ID];
    return Math.max(0.05, c.riseTime) + Math.max(0, c.holdTime) + Math.max(0.05, c.collapseTime);
  }

  /** The impact phase is the punch, the roar and the collapse. */
  get impactDuration() {
    return Math.max(0.1, this._span() * settings.global.lifetime);
  }

  /** The fade is the salt standing and crumbling. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 15.3) * Math.sin(this.age * 5.1 + 0.3));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.rainEmitter.reset();
    this.steamEmitter.reset();
    this.bubbleEmitter.reset();
    this.glitterEmitter.reset();
    this._releaseSalted();

    this._seed = Math.random() * 100;
    this._punched = false;
    this._crystalClock = -1;
    this.pointAt(1, _center);

    const cs = this._columnState;
    cs.center.copy(_center);
    cs.height = 0;
    cs.open = 0;
    cs.surge = 0;
    cs.fade = 1;
    cs.seed = this._seed;
    const ks = this._crustState;
    ks.center.copy(_center);
    ks.spread = 0;
    ks.salt = 0;
    ks.seep = 0;
    ks.erode = 0;
    ks.seed = this._seed;

    // Roll the crystals: scattered over the circle, clear of the vent, biggest in near it.
    const n = Math.min(MAX_CRYSTALS, Math.max(0, Math.round(c.crystalCount)));
    const R = c.zoneRadius;
    for (let i = 0; i < n; i++) {
      const k = this._cr[i];
      const a = Math.random() * TAU;
      const rn = Math.sqrt(0.06 + Math.random() * 0.94);
      const r = Math.max(c.columnRadius * 1.1, rn * R * 0.95);
      k.x = Math.cos(a) * r;
      k.z = Math.sin(a) * r;
      k.yaw = Math.random() * TAU;
      k.tiltX = (Math.random() - 0.5) * 0.5;
      k.tiltZ = (Math.random() - 0.5) * 0.5;
      k.size = (0.45 + 0.55 * Math.random()) * (1 - 0.4 * rn);
      k.delay = rn + Math.random() * 0.15;
      k.seed = Math.random() * 10;
    }
    this._crystalUsed = n;
    this.crystals.count = n;
    this.crystals.visible = false;
    this._crystalShown = 0;

    this.crust.visible = true;
    this.column.visible = false;
    this.lens.visible = false;
    this._syncAll(0);
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
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _syncAll(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._crustState.seep += c.seepSpeed * dt * g.noiseSpeed;
    this._columnState.surge += c.surgeSpeed * dt * g.animationSpeed;
    this.crustMaterial.userData.sync(this._crustState);
    this.columnMaterial.userData.sync(this._columnState);
    this.lensMaterial.userData.sync(this._columnState);
    this.crystalMaterial.userData.sync();

    this.rain.setGradient(getColor(c.colorRainA), getColor(c.colorRainB), getColor(c.colorRainC), getColor(c.colorRainD));
    const r = this.rain.uniforms;
    r.uGravity.value.set(0, -c.rainGravity, 0);
    r.uSizeScale.value = g.particleSize;
    r.uLifeScale.value = g.particleLifetime;
    r.uSpeedScale.value = g.particleSpeed;
    r.uOpacity.value = g.opacity;
    r.uGlow.value = 1.3 * g.glow;
    r.uStretch.value = 0.14;
    r.uTurbulence.value = 0.15 * g.turbulence;

    this.steam.setGradient(getColor(c.colorSteamA), getColor(c.colorSteamB), getColor(c.colorSteamC), getColor(c.colorSteamD));
    const s = this.steam.uniforms;
    s.uGravity.value.set(0, 0.5, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = c.steamOpacity * g.opacity;
    s.uTurbulence.value = 0.7 * g.turbulence;
    s.uSwirl.value = 0.4;
    s.uSwirlExpand.value = 0.6;

    this.bubbles.setGradient(getColor(c.colorRainA), getColor(c.colorRainB), getColor(c.colorRainC), getColor(c.colorRainD));
    const b = this.bubbles.uniforms;
    b.uGravity.value.set(0, 0.4, 0);
    b.uSizeScale.value = g.particleSize;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uGlow.value = 1.2 * g.glow;

    this.glitter.setGradient(getColor(c.colorGlitterA), getColor(c.colorGlitterB), getColor(c.colorGlitterC), getColor(c.colorGlitterD));
    const k = this.glitter.uniforms;
    k.uGravity.value.set(0, 0.2, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.glitterGlow * g.glow;
    k.uTurbulence.value = 0.3 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the pan cracks                                             */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._crustState.spread = 0.15 + 0.85 * Easing.outCubic(this.u);
    this._syncAll(dt);
    this._seepFx(dt, this.u);
    this.ctx.shake.rumble(c.buildRumble * this.u, dt);
    this.position.copy(_center).setY(0.4);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the punch                                                  */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._punched = true;
    this._crustState.spread = 1;
    this.column.visible = true;
    this.lens.visible = true;

    _floor.copy(_center).setY(0);
    _pos.copy(_center).setY(0.6);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: 1.2,
      opacity: 0.55,
      fresnel: 2,
      displace: 0.4,
      turbulence: 1,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: c.rippleRadius,
      life: 1.0,
      intensity: 0.9,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    // The spray thrown out of the foot as it punches through.
    this._resetEmit(time);
    _emit.position = _pos;
    _emit.radius = c.columnRadius * 0.8;
    _emit.direction = _up;
    _emit.speed = c.spraySpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.9;
    _emit.size = c.rainSize * 1.3;
    _emit.life = c.rainLife * 0.8;
    this.rain.emit(Math.round(c.sprayCount * g.particleCount), _emit);
    _emit.speed = 2;
    _emit.size = c.steamSize * 1.4;
    _emit.life = c.steamLife;
    _emit.spin = 0.5;
    _emit.radius = c.columnRadius * 1.3;
    this.steam.emit(Math.round(10 * g.particleCount), _emit);

    this._launch();

    this.ctx.shake.add(c.punchShake * power, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.punchFlash * power);
    this.lightBoost = c.lightIntensity * c.punchLight * power;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const cs = this._columnState;
    const ks = this._crustState;

    if (t <= 1) {
      const tau = t * this._span();
      const rT = Math.max(0.05, c.riseTime);
      const hT = Math.max(0, c.holdTime);
      const cT = Math.max(0.05, c.collapseTime);
      const k = saturate((tau - rT - hT) / cT);
      if (tau < rT) {
        cs.height = c.columnHeight * Easing.outExpo(tau / rT);
      } else {
        // Roaring: a little heave at the top, then falling back into the vent.
        const heave = 1 + 0.04 * Math.sin(tau * 11) * (1 - k);
        cs.height = c.columnHeight * heave * (1 - Math.pow(k, 1.6));
      }
      cs.height *= g.explosionIntensity;
      cs.open = smoothstep(0, Math.max(0.02, c.crownOpen), tau - rT * 0.5) * (1 - smoothstep(0.5, 1, k));
      cs.fade = 1 - smoothstep(0.6, 1, k);
      ks.salt = smoothstep(0, Math.max(0.05, c.saltTime), tau - rT - hT * 0.4);
      if (this._crystalClock < 0 && tau >= rT + hT * 0.5) {
        // The salting begins: a rime of salt creeps out over the pan.
        this._crystalClock = 0;
        _floor.copy(_center).setY(0);
        this.ctx.decals.spawn(DecalType.FROST, _floor, {
          radius: c.zoneRadius * 1.05,
          life: this.fadeDuration + cT + 0.5,
          intensity: 0.7,
          colorA: getColor(c.colorSalt),
          colorB: getColor(c.colorBrine)
        });
      }

      this._syncAll(dt);
      this._rainFx(dt, (tau > rT ? 1 : 0) * (1 - k * 0.6));
      this._steamFx(dt, 1);
      this._growCrystals(dt, 0);
      this._salting(dt);
      this.column.visible = cs.fade > 0.01 && cs.height > 0.05;
      this.lens.visible = this.column.visible;
      this.position.copy(_center).setY(Math.max(0.5, cs.height * 0.6));
      return;
    }

    /* the fade: the salt stands, glitters, then crumbles */
    const ft = saturate(t - 1);
    this.column.visible = false;
    this.lens.visible = false;
    ks.salt = Math.max(ks.salt, smoothstep(0, 0.3, ft));
    const sinkFrom = 1 - saturate(c.crystalSink);
    const crumble = smoothstep(sinkFrom, 1, ft);
    ks.erode = smoothstep(sinkFrom + 0.1, 1, ft);
    this._syncAll(dt);
    this._growCrystals(dt, crumble);
    this._glitterFx(dt, 1 - crumble);
    this._steamFx(dt, (1 - ft) * 0.4);
    this._salting(dt);
    this.position.copy(_center).setY(0.8);
  }

  /* ------------------------------------------------------------------ */
  /* The crystals                                                        */
  /* ------------------------------------------------------------------ */

  _growCrystals(dt, crumble) {
    if (this._crystalClock < 0 || this._crystalUsed === 0) return;
    const c = settings[ID];
    const g = settings.global;
    this._crystalClock += dt;
    this.crystals.visible = true;
    const arr = this.crystalAttr.array;
    const grow = Math.max(0.02, c.crystalGrow * g.lifetime);
    const spreadT = Math.max(0, c.crystalSpread * g.lifetime);
    let shown = 0;
    for (let i = 0; i < this._crystalUsed; i++) {
      const k = this._cr[i];
      const local = (this._crystalClock - k.delay * spreadT) / grow;
      if (local <= 0) {
        this.crystals.setMatrixAt(i, _zero);
        arr[i * 2 + 1] = 0;
        continue;
      }
      const gr = Easing.outBack(saturate(local));
      const s = c.crystalSize * k.size * gr * g.explosionIntensity;
      // Crumbling: sinks into the pan and shrinks.
      const sink = crumble * (0.8 + 0.4 * ((k.seed * 7.3) % 1));
      const shrink = 1 - saturate(sink) * 0.7;
      _pos.set(_center.x + k.x, -s * saturate(sink) * 0.9, _center.z + k.z);
      _euler.set(k.tiltX, k.yaw, k.tiltZ);
      _quat.setFromEuler(_euler);
      _scale.set(s * shrink, s, s * shrink);
      if (s * shrink < 0.005) {
        this.crystals.setMatrixAt(i, _zero);
        continue;
      }
      _matrix.compose(_pos, _quat, _scale);
      this.crystals.setMatrixAt(i, _matrix);
      arr[i * 2] = k.seed;
      arr[i * 2 + 1] = gr;
      shown++;
    }
    this._crystalShown = shown;
    this.crystals.instanceMatrix.needsUpdate = true;
    this.crystalAttr.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Bubbles in the seams and steam off the pan while it cracks. */
  _seepFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const reach = c.zoneRadius * this._crustState.spread;
    const n = Math.round(this.bubbleEmitter.tick(dt, c.bubbleRate * (0.3 + strength)) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.speed = 0.4;
      _emit.spread = 0.3;
      _emit.size = c.bubbleSize;
      _emit.life = 0.6;
      _emit.lifeVariance = 0.6;
      _emit.direction = _up;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = reach * Math.sqrt(Math.random());
        _pos.set(_center.x + Math.cos(a) * r, 0.04, _center.z + Math.sin(a) * r);
        _emit.position = _pos;
        this.bubbles.emit(1, _emit);
      }
    }
    this._steamFx(dt, strength * 0.7);
  }

  _steamFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.steamEmitter.tick(dt, c.steamRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = 0.7;
    _emit.spread = 0.5;
    _emit.size = c.steamSize;
    _emit.life = c.steamLife;
    _emit.spin = 0.4;
    _emit.direction = _up;
    const reach = c.zoneRadius * Math.max(0.2, this._crustState.spread);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = reach * Math.sqrt(Math.random());
      _pos.set(_center.x + Math.cos(a) * r, 0.15, _center.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.anchor = _pos;
      this.steam.emit(1, _emit);
    }
  }

  /** Brine raining out of the crown's rim, falling back over the circle. */
  _rainFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const cs = this._columnState;
    const n = Math.round(this.rainEmitter.tick(dt, c.rainRate * strength * cs.open) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.rainSize;
    _emit.life = c.rainLife;
    _emit.lifeVariance = 0.3;
    _emit.speed = 0.5;
    _emit.spread = 0.2;
    const rimR = c.columnRadius * c.columnTaper + c.crownRadius * g.explosionIntensity * cs.open;
    const rimY = cs.height + c.crownLift * 0.6 - c.crownDrop * 0.6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = rimR * (0.6 + 0.5 * Math.random());
      _pos.set(_center.x + Math.cos(a) * r, Math.max(0.5, rimY + (Math.random() - 0.5)), _center.z + Math.sin(a) * r);
      // Thrown outward so it lands across the whole circle.
      const out = (c.zoneRadius - r * 0.5) * (0.3 + Math.random() * 0.8) * 0.9;
      _vel.set(Math.cos(a) * out, 1.5 + Math.random() * 2, Math.sin(a) * out);
      _emit.position = _pos;
      _emit.inherit = _vel;
      this.rain.emit(1, _emit);
    }
  }

  /** Salt glitter off the white crust. */
  _glitterFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.glitterEmitter.tick(dt, c.glitterRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = 0.25;
    _emit.spread = 0.6;
    _emit.size = c.glitterSize;
    _emit.life = 0.6;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = c.zoneRadius * Math.sqrt(Math.random()) * 0.95;
      _pos.set(_center.x + Math.cos(a) * r, 0.05 + Math.random() * 0.6, _center.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.glitter.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The launch & the salting                                            */
  /* ------------------------------------------------------------------ */

  _launch() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const found = field.findTargets(_center.x, _center.z, c.zoneRadius, this._found);
    for (const dummy of found) {
      _dir.set(dummy.position.x - _center.x, 0, dummy.position.z - _center.z);
      const d = _dir.length();
      if (d > 1e-3) _dir.multiplyScalar(1 / d);
      else _dir.copy(this.direction);
      const riding = d <= c.launchRadius;
      this._force.impulse = (riding ? c.launchImpulse : c.knockImpulse * (1 - 0.5 * d / c.zoneRadius)) * power;
      this._force.lift = (riding ? c.launchLift : c.knockLift) * power;
      this._force.spin = c.hitSpin;
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      if (this._saltCount < MAX_SALTED) {
        const slot = this._salted[this._saltCount++];
        slot.dummy = dummy;
        slot.time = riding ? 0 : 0.2;
      }
    }
  }

  /** Crust every body the geyser threw. */
  _salting(dt) {
    const c = settings[ID];
    const look = this._look;
    look.color = c.colorSaltBody;
    look.rimColor = c.colorSaltRim;
    look.rimEmissive = c.saltRimGlow;
    look.edgeColor = c.colorSaltEdge;
    look.edgeEmissive = c.saltEdgeGlow;
    look.edgeWidth = c.saltEdgeWidth;
    for (let i = 0; i < this._saltCount; i++) {
      const slot = this._salted[i];
      if (!slot.dummy) continue;
      slot.time += dt;
      slot.dummy.corrode(saturate(slot.time / Math.max(0.05, c.saltBodyTime)) * c.saltBody, look);
    }
  }

  _releaseSalted() {
    for (let i = 0; i < this._saltCount; i++) this._salted[i].dummy = null;
    this._saltCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.crust.visible = false;
    this.column.visible = false;
    this.lens.visible = false;
    this.crystals.visible = false;
    this.crystals.count = 0;
    this._crystalUsed = 0;
    this._crystalShown = 0;
    this._releaseSalted();
  }

  dispose() {
    this.crustGeometry.dispose();
    this.columnGeometry.dispose();
    this.crystalGeometry.dispose();
    this.crustMaterial.dispose();
    this.columnMaterial.dispose();
    this.lensMaterial.dispose();
    this.crystalMaterial.dispose();
    this.crystals.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛲  Brine Geyser');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'reach speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'salt stands for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 1, 12, 0.05, 'circle radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'shimmer');

  const pan = folder.addFolder('1 · Salt pan');
  R(pan, c, 'panCells', 0.1, 4, 0.01, 'polygons per m');
  R(pan, c, 'ridgeAmount', 0, 2, 0.01, 'ridges');
  R(pan, c, 'seepGlow', 0, 8, 0.05, 'seep glow');
  R(pan, c, 'seepSpeed', 0, 4, 0.01, 'seep speed');
  R(pan, c, 'crustOpacity', 0, 1, 0.01, 'opacity');
  R(pan, c, 'saltTime', 0.05, 4, 0.01, 'whitens over (s)');
  pan.addColor(c, 'colorWet').name('wet plates');
  pan.addColor(c, 'colorSalt').name('salt');
  pan.addColor(c, 'colorRidge').name('ridges');

  const shape = folder.addFolder('2 · Column shape');
  R(shape, c, 'columnHeight', 0.5, 25, 0.05, 'height (m)');
  R(shape, c, 'columnRadius', 0.1, 4, 0.01, 'radius (m)');
  R(shape, c, 'columnTaper', 0.1, 2, 0.01, 'top radius (share)');
  R(shape, c, 'riseTime', 0.02, 1.5, 0.005, 'punches up over (s)');
  R(shape, c, 'holdTime', 0, 4, 0.01, 'roars for (s)');
  R(shape, c, 'collapseTime', 0.05, 3, 0.01, 'falls back over (s)');
  R(shape, c, 'surgeAmp', 0, 0.6, 0.005, 'surge swell');
  R(shape, c, 'surgeCount', 0, 10, 0.05, 'surges up the trunk');
  R(shape, c, 'surgeSpeed', 0, 10, 0.05, 'surge speed');
  R(shape, c, 'twist', -1, 1, 0.005, 'twist (rad/m)');
  R(shape, c, 'churn', 0, 0.5, 0.005, 'churn');
  R(shape, c, 'crownRadius', 0, 8, 0.05, 'crown radius (m)');
  R(shape, c, 'crownLift', 0, 4, 0.01, 'crown lift (m)');
  R(shape, c, 'crownDrop', 0, 6, 0.01, 'crown droop (m)');
  R(shape, c, 'crownOpen', 0.02, 2, 0.01, 'crown opens over (s)');

  const brine = folder.addFolder('3 · Brine');
  R(brine, c, 'columnOpacity', 0, 1, 0.01, 'opacity');
  R(brine, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(brine, c, 'columnGlow', 0, 5, 0.01, 'body glow');
  R(brine, c, 'coreGlow', 0, 8, 0.05, 'core glow');
  R(brine, c, 'foamAmount', 0, 3, 0.01, 'salt foam');
  R(brine, c, 'foamScale', 0.1, 5, 0.01, 'foam scale');
  R(brine, c, 'envAmount', 0, 3, 0.01, 'sky reflection');
  R(brine, c, 'refractStrength', 0, 4, 0.01, 'refraction');
  brine.addColor(c, 'colorBrineDeep').name('deep');
  brine.addColor(c, 'colorBrine').name('brine');
  brine.addColor(c, 'colorFoam').name('foam');

  const crystals = folder.addFolder('4 · Salt crystals');
  R(crystals, c, 'crystalCount', 0, MAX_CRYSTALS, 1, 'clusters');
  R(crystals, c, 'crystalSize', 0.05, 3, 0.01, 'size (m)');
  R(crystals, c, 'crystalGrow', 0.02, 3, 0.01, 'grow over (s)');
  R(crystals, c, 'crystalSpread', 0, 3, 0.01, 'spread out over (s)');
  R(crystals, c, 'crystalSparkle', 0, 6, 0.05, 'sparkle');
  R(crystals, c, 'crystalHeart', 0, 4, 0.05, 'teal heart');
  R(crystals, c, 'crystalSink', 0, 1, 0.01, 'crumble share');

  const fx = folder.addFolder('5 · Rain, steam & glitter');
  R(fx, c, 'rainRate', 0, 1500, 1, 'rain/second');
  R(fx, c, 'rainSize', 0.005, 0.4, 0.001, 'rain size');
  R(fx, c, 'rainLife', 0.1, 4, 0.05, 'rain lifetime');
  R(fx, c, 'rainGravity', 0, 40, 0.1, 'rain gravity');
  R(fx, c, 'sprayCount', 0, 600, 1, 'spray at the punch');
  R(fx, c, 'spraySpeed', 0, 30, 0.1, 'spray speed');
  R(fx, c, 'steamRate', 0, 200, 1, 'steam/second');
  R(fx, c, 'steamSize', 0.05, 5, 0.01, 'steam size');
  R(fx, c, 'steamLife', 0.1, 6, 0.05, 'steam lifetime');
  R(fx, c, 'steamOpacity', 0, 1, 0.01, 'steam opacity');
  R(fx, c, 'bubbleRate', 0, 300, 1, 'bubbles/second');
  R(fx, c, 'bubbleSize', 0.01, 0.6, 0.005, 'bubble size');
  R(fx, c, 'glitterRate', 0, 500, 1, 'glitter/second');
  R(fx, c, 'glitterSize', 0.005, 0.4, 0.001, 'glitter size');
  R(fx, c, 'glitterGlow', 0, 12, 0.05, 'glitter glow');
  Editor.gradient(fx, c, 'colorRain', 'rain gradient');
  Editor.gradient(fx, c, 'colorSteam', 'steam gradient');
  Editor.gradient(fx, c, 'colorGlitter', 'glitter gradient');

  const punch = folder.addFolder('6 · The punch');
  R(punch, c, 'burstSize', 0, 8, 0.05, 'water shell (m)');
  R(punch, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(punch, c, 'rippleRadius', 0, 12, 0.05, 'ripple (m)');
  R(punch, c, 'punchFlash', 0, 1, 0.01, 'flash');
  R(punch, c, 'punchShake', 0, 1.5, 0.01, 'camera knock');
  R(punch, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(punch, c, 'punchLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(punch, c, 'buildRumble', 0, 1, 0.01, 'rumble while cracking');
  punch.addColor(c, 'colorShockA').name('shockwave');
  punch.addColor(c, 'colorShockB').name('shockwave hot');
  punch.addColor(c, 'colorBurstA').name('shell inner');
  punch.addColor(c, 'colorBurstB').name('shell mid');
  punch.addColor(c, 'colorBurstC').name('shell outer');
  punch.addColor(c, 'colorFlash').name('flash');

  const hit = folder.addFolder('7 · Launch & salting');
  R(hit, c, 'launchRadius', 0, 6, 0.01, 'ride the column within (m)');
  R(hit, c, 'launchLift', 0, 40, 0.1, 'launch lift (m/s)');
  R(hit, c, 'launchImpulse', 0, 15, 0.05, 'launch outward (m/s)');
  R(hit, c, 'knockImpulse', 0, 25, 0.1, 'blown outward (m/s)');
  R(hit, c, 'knockLift', 0, 15, 0.05, 'blown lift (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(hit, c, 'saltBody', 0, 1, 0.01, 'crusted');
  R(hit, c, 'saltBodyTime', 0.05, 5, 0.01, 'crusts over (s)');
  R(hit, c, 'saltRimGlow', 0, 6, 0.05, 'rim glow');
  R(hit, c, 'saltEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(hit, c, 'saltEdgeWidth', 0, 0.3, 0.001, 'edge width');
  hit.addColor(c, 'colorSaltBody').name('crusted body');
  hit.addColor(c, 'colorSaltRim').name('rim');
  hit.addColor(c, 'colorSaltEdge').name('edge');

  folder.close();
  return folder;
}
