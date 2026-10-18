import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createFissureGeometry, createSpikeGeometry, createRingGeometry } from '../../assets/codex/FaultChoirGeometry.js';
import { createFissureMaterial, createStoneMaterial, createRingMaterial } from '../../materials/codex/FaultChoirMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'faultchoir';

/** Spikes one fault can raise (the lance is one more). */
const MAX_SPIKES = 40;
const MAX_RINGS = 48;

const _emit = {};
const _pos = new Vector3();
const _base = new Vector3();
const _dir = new Vector3();
const _axis = new Vector3();
const _floor = new Vector3();
const _scale = new Vector3();
const _qYaw = new Quaternion();
const _qLean = new Quaternion();
const _qSplay = new Quaternion();
const _quat = new Quaternion();
const _matrix = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _X = new Vector3(1, 0, 0);
const _Z = new Vector3(0, 0, 1);
const _up = new Vector3(0, 1, 0);

/**
 * FAULT CHOIR — the fault splits, the stone sings, the last note is a lance.
 *
 * A line cast in four beats. **The fault**: a crack races down the line from
 * the caster's feet, zig-zagging, its gap glowing amber from deep inside and
 * branching into side fractures, a lip of heaved ground either side, dust
 * rolling off it; anything standing across it is *split* in two and thrown
 * apart. **The choir**: behind the running front, stone blades break out of
 * the fault one after another — alternating sides, leaning toward the
 * target, each a little taller than the last — and every one *sings* as it
 * rises: its resonance veins and tip flare amber, it shivers, and a ring of
 * sound opens across the line from it. Pulses of light run down the gap
 * toward the target the whole time. **The last note**: at the end of the
 * line a lance of stone five metres long drives up out of the ground through
 * the target at an angle, with an EARTH shell, a radial crack, a shockwave,
 * a ring of sound three times the size of the others and the whole choir
 * answering it at once; whatever stands there is launched. **The silence**:
 * the blades crumble back into the fault one by one, the lance last, and the
 * gap cools and seals.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the fault** (`createFissureMaterial`) — a floor strip behind the
 *      front: glowing gap, branches, broken lip, the running song pulses.
 *   2. **the choir & the lance** (`createStoneMaterial`) — one opaque
 *      `InstancedMesh` of faceted stone blades on `LAYER.WORLD` (prepass,
 *      shadows): sandstone strata and amber resonance veins.
 *   3. **the song** (`createRingMaterial(0)`) — instanced rings of sound
 *      stood across the line; and **their warp** on `LAYER.DISTORTION`.
 *   4. **debris, dust & motes** — CHIP stone chips thrown by every blade
 *      breaking out and crumbling, SMOKE dust off the opening fault,
 *      additive resonance motes rising from the gap.
 *   5. **the last note** — EARTH shell, CRACK, SHOCKWAVE and DUSTRING
 *      decals, flash, knock, light punch; a rumble while the fault runs.
 *   6. **the split** — `handlesOwnHits`: bodies across the fault are sliced
 *      and thrown away from it; bodies at the lance are launched.
 *
 * ## The editor rule
 *
 * A cast rolls a seed and each blade's dice; every height, angle, time and
 * colour is read from `settings.faultchoir` each frame.
 */
export class FaultChoirAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Blades standing. HUD readout only. */
  get instanceCount() {
    return this._standing;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the fault ---- */
    this.fissureGeometry = createFissureGeometry(220, 8);
    this.fissureMaterial = createFissureMaterial();
    this.fissure = this._mesh(this.fissureGeometry, this.fissureMaterial, LAYER.VFX, 2);

    /* ---- layer 2: the stone ---- */
    this.spikeGeometry = createSpikeGeometry(5, 7);
    this.spikeAttr = new InstancedBufferAttribute(new Float32Array((MAX_SPIKES + 1) * 2), 2);
    this.spikeAttr.setUsage(DynamicDrawUsage);
    this.spikeGeometry.setAttribute('aSpike', this.spikeAttr);
    this.stoneMaterial = createStoneMaterial();
    this.spikes = new InstancedMesh(this.spikeGeometry, this.stoneMaterial, MAX_SPIKES + 1);
    this.spikes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.spikes.layers.set(LAYER.WORLD);
    this.spikes.castShadow = true;
    this.spikes.frustumCulled = false;
    this.spikes.visible = false;
    this.spikes.count = 0;
    this.group.add(this.spikes);

    /* ---- layer 3: the song ---- */
    this.ringGeometry = createRingGeometry(MAX_RINGS);
    this.ringMaterial = createRingMaterial(0);
    this.rings = this._mesh(this.ringGeometry, this.ringMaterial, LAYER.VFX, 14);
    this.warpMaterial = createRingMaterial(1);
    this.warp = this._mesh(this.ringGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._sp = [];
    for (let i = 0; i <= MAX_SPIKES; i++) {
      this._sp.push({ along: 0, sideSign: 1, seed: 0, h: 1, w: 1, born: -1, broke: false, crumbled: false });
    }
    this._n = 0;
    this._standing = 0;

    this._ring = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      this._ring.push({ active: false, center: new Vector3(), age: 0, life: 1, size: 1, glow: 1 });
    }

    this._fissureState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      front: 0,
      song: 0,
      seal: 0,
      seed: 0
    };
    this._stoneState = { song: 0 };
    this._ringState = { axisU: new Vector3(), axisV: new Vector3(0, 1, 0) };

    this._seed = 0;
    this._song = 0;
    this._open = 0;
    this._prevOpen = 0;
    this._lanceBorn = -1;
    this._chorus = false;
    this._crumble = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
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

    this.chips = particles.get('faultchoir.chips', {
      capacity: 1600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.2;
    this.chips.uniforms.uEndSize.value = 0.9;
    this.chips.uniforms.uDrag.value = 0.5;

    this.dust = particles.get('faultchoir.dust', {
      capacity: 1200,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.2;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;
    this.dust.uniforms.uEndSize.value = 2.6;
    this.dust.uniforms.uDrag.value = 1.6;

    this.motes = particles.get('faultchoir.motes', {
      capacity: 1400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.15
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.4;

    this.dustEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the lance driving up and standing. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.1, (Math.max(0.02, c.lanceRise) + Math.max(0, c.lanceHold)) * settings.global.lifetime);
  }

  /** The fade is the choir crumbling and the fault sealing. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** The light trembles with the song. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 21.0) * Math.sin(this._song * 6.2832));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.dustEmitter.reset();
    this.moteEmitter.reset();

    this._seed = Math.random() * 100;
    this._song = 0;
    this._open = 0;
    this._prevOpen = 0;
    this._lanceBorn = -1;
    this._chorus = false;
    this._crumble = 0;

    // Lay out the choir: from spikeStart to short of where the lance breaks out.
    const lanceAt = Math.max(c.spikeStart, this.length - c.lanceBack);
    const spacing = Math.max(0.3, c.spikeSpacing);
    const n = Math.max(0, Math.min(MAX_SPIKES, Math.floor((lanceAt - 0.8 - c.spikeStart) / spacing) + 1));
    const first = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const s = this._sp[i];
      s.along = c.spikeStart + i * spacing + (Math.random() - 0.5) * spacing * 0.3;
      s.sideSign = i % 2 === 0 ? first : -first;
      s.seed = Math.random() * 10;
      const t = n > 1 ? i / (n - 1) : 1;
      s.h = lerp(c.spikeHeightMin, c.spikeHeightMax, t) * (0.85 + 0.3 * Math.random());
      s.w = 0.85 + 0.3 * Math.random();
      s.born = -1;
      s.broke = false;
      s.crumbled = false;
    }
    this._n = n;
    const lance = this._sp[MAX_SPIKES];
    lance.along = lanceAt;
    lance.sideSign = 0;
    lance.seed = Math.random() * 10;
    lance.born = -1;
    lance.broke = false;
    lance.crumbled = false;

    for (let i = 0; i < MAX_RINGS; i++) this._ring[i].active = false;

    const fs = this._fissureState;
    fs.start.copy(this.origin).addScaledVector(this.direction, Math.max(0, c.crackStart));
    fs.dir.copy(this.direction);
    fs.side.copy(this.side);
    fs.length = Math.max(0.5, this.length - c.crackStart + 0.8);
    fs.front = 0;
    fs.seal = 0;
    fs.seed = this._seed;
    this._ringState.axisU.copy(this.side);

    this.fissure.visible = true;
    this.spikes.visible = true;
    this.spikes.count = MAX_SPIKES + 1;
    this.rings.visible = true;
    this.warp.visible = true;
    this._laySpikes(0);
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
    this._song += c.songSpeed * dt * g.animationSpeed;
    const fs = this._fissureState;
    fs.front = this._open;
    fs.song = this._song;
    this.fissureMaterial.userData.sync(fs);
    this._stoneState.song = this._song;
    this.stoneMaterial.userData.sync(this._stoneState);
    this.ringMaterial.userData.sync(this._ringState);
    this.warpMaterial.userData.sync(this._ringState);

    this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
    const k = this.chips.uniforms;
    k.uGravity.value.set(0, -c.chipGravity, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uTurbulence.value = 0.1 * g.turbulence;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uGravity.value.set(0, 0.3, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.dustOpacity * g.opacity;
    d.uTurbulence.value = 0.7 * g.turbulence;
    d.uSwirl.value = 0.4;
    d.uSwirlExpand.value = 0.6;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, 1.2, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 1.0 * g.turbulence;

    this._updateRings(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The blades                                                          */
  /* ------------------------------------------------------------------ */

  /** Root of blade `s` on the floor. */
  _root(s, out) {
    const c = settings[ID];
    return out.copy(this.origin)
      .addScaledVector(this.direction, s.along)
      .addScaledVector(this.side, s.sideSign * c.spikeOffset);
  }

  /** Orientation: yawed down the line, leaned toward the target, splayed to its side. */
  _orient(lean, splay, out) {
    _qYaw.setFromAxisAngle(_up, Math.atan2(this.direction.x, this.direction.z));
    _qLean.setFromAxisAngle(_X, lean);
    _qSplay.setFromAxisAngle(_Z, splay);
    return out.copy(_qYaw).multiply(_qLean).multiply(_qSplay);
  }

  /**
   * Raise, shiver and crumble every blade; write the instances.
   * @param {number} crumble 0..1 through the crumbling
   */
  _laySpikes(crumble) {
    const c = settings[ID];
    const g = settings.global;
    const arr = this.spikeAttr.array;
    const rise = Math.max(0.02, c.spikeRise * g.lifetime);
    let standing = 0;

    for (let i = 0; i <= MAX_SPIKES; i++) {
      const lance = i === MAX_SPIKES;
      if (!lance && i >= this._n) {
        this.spikes.setMatrixAt(i, _zero);
        continue;
      }
      const s = this._sp[i];
      if (s.born < 0 || this.age < s.born) {
        this.spikes.setMatrixAt(i, _zero);
        arr[i * 2 + 1] = 0;
        continue;
      }
      const since = this.age - s.born;
      const k = lance ? Easing.outCubic(saturate(since / Math.max(0.02, c.lanceRise * g.lifetime))) : Easing.outBack(saturate(since / rise));

      if (!s.broke) {
        s.broke = true;
        this._breakOut(s, lance);
      }

      // Each blade sings loudest as it rises, then hums; the chorus lifts them all.
      const sung = Math.exp(-Math.max(0, since - rise) / Math.max(0.05, c.singTime));
      const chorus = this._chorus ? 0.8 : 0;
      let sing = Math.min(1, 0.2 + 0.8 * sung + chorus) * (1 - crumble);

      // Crumbling: one by one from the caster outward, the lance last.
      const order = lance ? 1 : i / Math.max(1, this._n);
      const sink = smoothstep(0, 1, crumble * 1.6 - order * 0.6);
      if (sink > 0.02 && !s.crumbled) {
        s.crumbled = true;
        this._crumbleFx(s, lance);
      }
      sing *= 1 - sink;

      const h = lance ? c.lanceLength : s.h;
      const w = lance ? c.lanceWidth : c.spikeWidth * s.w;
      const lean = lance ? c.lanceAngle : c.spikeLean;
      const splay = lance ? 0 : s.sideSign * c.spikeSplay;
      this._orient(lean, splay, _quat);
      _axis.set(0, 1, 0).applyQuaternion(_quat);

      this._root(s, _base);
      // Driven up out of the floor along its own axis; sinks back the same way.
      const out = k * (1 - sink);
      _pos.copy(_base).addScaledVector(_axis, -h * (1 - out));
      // The hum: a fast shiver across the line while it sings.
      _pos.addScaledVector(this.side, c.spikeHum * sing * Math.sin(this.age * c.humRate * 6.2832 + s.seed * 5));
      _scale.set(w, h, w);
      _matrix.compose(_pos, _quat, _scale);
      this.spikes.setMatrixAt(i, _matrix);
      arr[i * 2] = s.seed;
      arr[i * 2 + 1] = sing;
      if (out > 0.05) standing++;
    }
    this._standing = standing;
    this.spikes.instanceMatrix.needsUpdate = true;
    this.spikeAttr.needsUpdate = true;
  }

  /** A blade breaks out of the fault: chips, dust, a ring of song, a knock. */
  _breakOut(s, lance) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    this._root(s, _floor);
    _floor.y = 0.1;
    this._resetEmit(time);
    _emit.position = _floor;
    _emit.radius = lance ? 0.6 : 0.25;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed * (lance ? 1.6 : 1);
    _emit.speedVariance = 0.5;
    _emit.spread = 0.8;
    _emit.size = c.chipSize * (lance ? 1.5 : 1);
    _emit.life = c.chipLife;
    _emit.spin = 6;
    this.chips.emit(Math.round(c.chipCount * (lance ? 4 : 1) * g.particleCount), _emit);
    _emit.speed = 1;
    _emit.spin = 0.4;
    _emit.size = c.dustSize * (lance ? 1.6 : 1);
    _emit.life = c.dustLife;
    this.dust.emit(Math.round((lance ? 10 : 3) * g.particleCount), _emit);

    _floor.y = 0;
    this._spawnRing(_floor, lance ? c.lanceRingSize : c.ringSize, lance ? 1.6 : 1);
    if (!lance) {
      this.ctx.shake.add(0.06, 10, 26);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.4);
    }
  }

  /** A blade crumbles back into the fault. */
  _crumbleFx(s, lance) {
    const c = settings[ID];
    const g = settings.global;
    this._root(s, _floor);
    _floor.y = 0.3;
    this._resetEmit(frame.uTime.value);
    _emit.position = _floor;
    _emit.radius = lance ? 1.0 : 0.35;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed * 0.5;
    _emit.spread = 1;
    _emit.size = c.chipSize;
    _emit.life = c.chipLife;
    _emit.spin = 4;
    this.chips.emit(Math.round(c.chipCount * 0.6 * (lance ? 3 : 1) * g.particleCount), _emit);
    _emit.speed = 0.6;
    _emit.spin = 0.4;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    this.dust.emit(Math.round((lance ? 6 : 2) * g.particleCount), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* The song                                                            */
  /* ------------------------------------------------------------------ */

  _spawnRing(at, size, glow) {
    const c = settings[ID];
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this._ring[i];
      if (r.active) continue;
      r.active = true;
      r.center.copy(at);
      r.age = 0;
      r.life = Math.max(0.05, c.ringTime) * (size > c.ringSize * 1.5 ? 1.6 : 1);
      r.size = size;
      r.glow = glow;
      return;
    }
  }

  _updateRings(dt) {
    const c = settings[ID];
    const g = settings.global;
    const ring = this.ringGeometry.getAttribute('aRing');
    const look = this.ringGeometry.getAttribute('aRingLook');
    let n = 0;
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this._ring[i];
      if (!r.active) continue;
      r.age += dt;
      const p = r.age / (r.life * g.lifetime);
      if (p >= 1) {
        r.active = false;
        continue;
      }
      ring.setXYZW(n, r.center.x, r.center.y, r.center.z, Easing.outCubic(p));
      look.setXY(n, r.size * g.explosionIntensity, c.ringGlow * g.glow * r.glow);
      n++;
    }
    this.ringGeometry.instanceCount = n;
    ring.needsUpdate = true;
    look.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the fault runs, the choir rises                            */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._prevOpen = this._open;
    this._open = Math.max(0, this.front - c.crackStart);
    // Wake every blade the front has passed.
    for (let i = 0; i < this._n; i++) {
      const s = this._sp[i];
      if (s.born < 0 && this.front >= s.along) s.born = this.age + c.spikeDelay;
    }
    this._syncAll(dt);
    this._laySpikes(0);
    this._faultFx(dt, 1);
    this._faultHits();
    this.ctx.shake.rumble(c.travelRumble, dt);
    this.position.copy(this.origin).addScaledVector(this.direction, this.front).setY(0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the last note                                              */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._open = Math.max(0, this.length - c.crackStart);
    // Any blade the front never quite reached still rises.
    for (let i = 0; i < this._n; i++) if (this._sp[i].born < 0) this._sp[i].born = this.age;
    const lance = this._sp[MAX_SPIKES];
    lance.born = this.age;

    this._root(lance, _floor);
    _floor.y = 0;
    this.ctx.decals.spawn(DecalType.CRACK, _floor, {
      radius: c.crackRadius * power,
      life: this.impactDuration + this.fadeDuration,
      intensity: 1.1,
      colorA: getColor(c.colorGap),
      colorB: getColor(c.colorHot)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.dustRingRadius * power,
      life: 1.2,
      intensity: 0.9,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC)
    });
    _pos.copy(_floor).setY(0.5);
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: 1,
      opacity: 0.7,
      fresnel: 1.2,
      displace: 0.5,
      turbulence: 1.2,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    this._lanceHits();
    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const fs = this._fissureState;

    if (t <= 1) {
      // The choir answers the lance: every blade sings at once, a second ring each.
      const tau = t * this.impactDuration;
      if (!this._chorus && tau >= Math.max(0.02, c.lanceRise) * 1.2) {
        this._chorus = true;
        for (let i = 0; i < this._n; i++) {
          this._root(this._sp[i], _floor);
          _floor.y = 0;
          this._spawnRing(_floor, c.ringSize * 1.25, 0.7);
        }
      }
      this._syncAll(dt);
      this._laySpikes(0);
      this._faultFx(dt, 0.6);
      this._lancePoint(this.position);
      return;
    }

    /* the silence: the choir crumbles, the fault cools and seals */
    const ft = saturate(t - 1);
    this._chorus = false;
    this._crumble = ft;
    fs.seal = smoothstep(0.35, 1, ft);
    this._syncAll(dt);
    this._laySpikes(ft);
    this._faultFx(dt, (1 - ft) * 0.4);
    this._lancePoint(this.position);
    this.position.y *= 1 - ft * 0.7;
  }

  /** Somewhere up the lance, where the light hangs. */
  _lancePoint(out) {
    const c = settings[ID];
    const lance = this._sp[MAX_SPIKES];
    this._orient(c.lanceAngle, 0, _quat);
    _axis.set(0, 1, 0).applyQuaternion(_quat);
    return this._root(lance, out).addScaledVector(_axis, c.lanceLength * 0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Dust off the opening front; resonance motes rising out of the gap. */
  _faultFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const open = this._open;
    if (open <= 0.1) return;

    const n = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.speed = 0.8;
      _emit.spread = 0.7;
      _emit.size = c.dustSize;
      _emit.life = c.dustLife;
      _emit.spin = 0.4;
      _emit.direction = _up;
      for (let i = 0; i < n; i++) {
        // Crowded at the running front.
        const along = c.crackStart + open * (1 - Math.pow(Math.random(), 2.5) * 0.7);
        _pos.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, (Math.random() - 0.5) * c.crackEdge * 2);
        _pos.y = 0.15;
        _emit.position = _pos;
        _emit.anchor = _pos;
        this.dust.emit(1, _emit);
      }
    }

    const m = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (m > 0) {
      this._resetEmit(time);
      _emit.speed = 0.8;
      _emit.spread = 0.5;
      _emit.size = c.moteSize;
      _emit.life = 1.0;
      _emit.direction = _up;
      for (let i = 0; i < m; i++) {
        const along = c.crackStart + open * Math.random();
        _pos.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, (Math.random() - 0.5) * c.crackWidth * 2);
        _pos.y = 0.05;
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The split                                                           */
  /* ------------------------------------------------------------------ */

  /** Split every body the running fault passes under. */
  _faultHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const from = c.crackStart + Math.max(0, this._prevOpen - 0.4);
    const to = c.crackStart + this._open;
    if (to <= from) return;
    // Bodies near the lance wait for it.
    const lanceAt = this._sp[MAX_SPIKES].along;
    const mid = (from + to) * 0.5;
    this.pointAt(Math.min(1, mid / this.length), _floor);
    const found = field.findTargets(_floor.x, _floor.z, Math.hypot((to - from) * 0.5, c.hitWidth), this._found);
    if (found.length === 0) return;
    const power = g.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * this.side.x + dz * this.side.z;
      if (along < from || along > to || Math.abs(lat) > c.hitWidth) continue;
      if (along > lanceAt - c.lanceZone * 0.5) continue;
      // Thrown away from the fault, to whichever side it stood.
      _dir.copy(this.side).multiplyScalar(lat >= 0 ? 1 : -1).addScaledVector(this.direction, 0.2).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, c.slice >= 0.5)) continue;
      _pos.copy(dummy.position).setY(0.8);
      this._resetEmit(frame.uTime.value);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = c.chipSpeed;
      _emit.spread = 0.8;
      _emit.size = c.chipSize;
      _emit.life = c.chipLife;
      _emit.spin = 6;
      this.chips.emit(Math.round(16 * g.particleCount), _emit);
      this.motes.emit(Math.round(12 * g.particleCount), _emit);
      this.ctx.shake.add(0.12, 8, 22);
    }
  }

  /** The lance launches everything round where it breaks out. */
  _lanceHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const lance = this._sp[MAX_SPIKES];
    this._root(lance, _base);
    _base.addScaledVector(this.direction, c.lanceLength * Math.sin(c.lanceAngle) * 0.4);
    const found = field.findTargets(_base.x, _base.z, c.lanceZone, this._found);
    for (const dummy of found) {
      const d = Math.hypot(dummy.position.x - _base.x, dummy.position.z - _base.z);
      const close = 1 - saturate(d / Math.max(0.1, c.lanceZone));
      this._force.impulse = c.lanceImpulse * (0.5 + 0.5 * close) * power;
      this._force.lift = c.lanceLift * (0.5 + 0.5 * close) * power;
      this._force.spin = c.hitSpin * 1.5;
      _dir.copy(this.direction).addScaledVector(this.side, (Math.random() - 0.5) * 0.6).normalize();
      dummy.kill(_dir.x, _dir.z, this._force, false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.fissure.visible = false;
    this.spikes.visible = false;
    this.spikes.count = 0;
    this.rings.visible = false;
    this.warp.visible = false;
    this.ringGeometry.instanceCount = 0;
    for (let i = 0; i < MAX_RINGS; i++) this._ring[i].active = false;
    this._n = 0;
    this._standing = 0;
  }

  dispose() {
    this.fissureGeometry.dispose();
    this.spikeGeometry.dispose();
    this.ringGeometry.dispose();
    this.fissureMaterial.dispose();
    this.stoneMaterial.dispose();
    this.ringMaterial.dispose();
    this.warpMaterial.dispose();
    this.spikes.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('♪  Fault Choir');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'fault speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'crumbles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'tremble');

  const fault = folder.addFolder('1 · Fault');
  R(fault, c, 'crackStart', 0, 4, 0.01, 'opens after (m)');
  R(fault, c, 'crackWidth', 0.01, 1, 0.005, 'gap half-width (m)');
  R(fault, c, 'crackEdge', 0.05, 3, 0.01, 'lip half-width (m)');
  R(fault, c, 'crackWander', 0, 1.5, 0.01, 'zig-zag (m)');
  R(fault, c, 'crackWanderScale', 0.02, 3, 0.01, 'zig-zags per m');
  R(fault, c, 'branchAmount', 0, 2, 0.01, 'side fractures');
  R(fault, c, 'crackGlow', 0, 12, 0.05, 'gap glow');
  R(fault, c, 'songSpacing', 0.2, 8, 0.05, 'pulse spacing (m)');
  R(fault, c, 'songSpeed', 0, 8, 0.05, 'pulses/second');
  R(fault, c, 'songGlow', 0, 8, 0.05, 'pulse glow');
  R(fault, c, 'crackOpacity', 0, 1, 0.01, 'lip opacity');
  fault.addColor(c, 'colorGap').name('gap');
  fault.addColor(c, 'colorHot').name('gap white-hot');
  fault.addColor(c, 'colorLip').name('lip');
  fault.addColor(c, 'colorDustLip').name('lip dust');

  const choir = folder.addFolder('2 · Choir');
  R(choir, c, 'spikeStart', 0, 6, 0.01, 'first blade at (m)');
  R(choir, c, 'spikeSpacing', 0.3, 4, 0.01, 'spacing (m)');
  R(choir, c, 'spikeHeightMin', 0.1, 5, 0.01, 'first height (m)');
  R(choir, c, 'spikeHeightMax', 0.1, 8, 0.01, 'last height (m)');
  R(choir, c, 'spikeWidth', 0.05, 2, 0.01, 'width (m)');
  R(choir, c, 'spikeLean', -1, 1.4, 0.01, 'lean toward target (rad)');
  R(choir, c, 'spikeSplay', 0, 1.2, 0.01, 'splay (rad)');
  R(choir, c, 'spikeOffset', 0, 1.5, 0.01, 'off the crack (m)');
  R(choir, c, 'spikeDelay', 0, 0.5, 0.005, 'breaks out after (s)');
  R(choir, c, 'spikeRise', 0.02, 1, 0.005, 'rises over (s)');
  R(choir, c, 'spikeHum', 0, 0.2, 0.001, 'hum (m)');
  R(choir, c, 'humRate', 0, 80, 0.5, 'hum rate (Hz)');

  const stone = folder.addFolder('3 · Stone');
  R(stone, c, 'veinGlow', 0, 12, 0.05, 'vein glow');
  R(stone, c, 'veinScale', 0.2, 8, 0.01, 'vein scale');
  R(stone, c, 'tipGlow', 0, 10, 0.05, 'tip glow');
  R(stone, c, 'strata', 0, 20, 0.1, 'strata');
  R(stone, c, 'singTime', 0.05, 4, 0.01, 'sings loud for (s)');
  stone.addColor(c, 'colorStoneA').name('stone dark');
  stone.addColor(c, 'colorStoneB').name('stone light');
  stone.addColor(c, 'colorVein').name('veins');

  const lance = folder.addFolder('4 · Lance');
  R(lance, c, 'lanceLength', 0.5, 14, 0.05, 'length (m)');
  R(lance, c, 'lanceWidth', 0.1, 3, 0.01, 'width (m)');
  R(lance, c, 'lanceAngle', 0, 1.4, 0.01, 'lean (rad)');
  R(lance, c, 'lanceBack', 0, 6, 0.01, 'breaks out short by (m)');
  R(lance, c, 'lanceRise', 0.02, 1, 0.005, 'drives up over (s)');
  R(lance, c, 'lanceHold', 0, 3, 0.01, 'stands for (s)');

  const song = folder.addFolder('5 · Song rings');
  R(song, c, 'ringSize', 0.1, 8, 0.05, 'ring size (m)');
  R(song, c, 'ringTime', 0.05, 3, 0.01, 'opens over (s)');
  R(song, c, 'ringWidth', 0.005, 0.3, 0.001, 'band width');
  R(song, c, 'ringBands', 1, 4, 1, 'bands');
  R(song, c, 'ringGlow', 0, 10, 0.05, 'glow');
  R(song, c, 'ringWarp', 0, 4, 0.01, 'distortion');
  R(song, c, 'lanceRingSize', 0.1, 16, 0.05, 'lance ring (m)');
  song.addColor(c, 'colorRing').name('ring');

  const fx = folder.addFolder('6 · Debris, dust & motes');
  R(fx, c, 'chipCount', 0, 80, 1, 'chips per blade');
  R(fx, c, 'chipSize', 0.01, 0.5, 0.005, 'chip size');
  R(fx, c, 'chipSpeed', 0, 20, 0.05, 'chip speed');
  R(fx, c, 'chipLife', 0.1, 4, 0.05, 'chip lifetime');
  R(fx, c, 'chipGravity', 0, 40, 0.1, 'chip gravity');
  R(fx, c, 'dustRate', 0, 200, 1, 'dust/second');
  R(fx, c, 'dustSize', 0.05, 4, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  R(fx, c, 'moteRate', 0, 400, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorChip', 'chip gradient');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');

  const note = folder.addFolder('7 · Last note');
  R(note, c, 'burstSize', 0, 8, 0.05, 'earth shell (m)');
  R(note, c, 'crackRadius', 0, 10, 0.05, 'radial crack (m)');
  R(note, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(note, c, 'dustRingRadius', 0, 12, 0.05, 'dust ring (m)');
  R(note, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(note, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(note, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(note, c, 'impactLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(note, c, 'travelRumble', 0, 1, 0.01, 'rumble while running');
  note.addColor(c, 'colorShockA').name('shockwave');
  note.addColor(c, 'colorShockB').name('shockwave hot');
  note.addColor(c, 'colorBurstA').name('shell inner');
  note.addColor(c, 'colorBurstB').name('shell mid');
  note.addColor(c, 'colorBurstC').name('shell outer');
  note.addColor(c, 'colorFlash').name('flash');

  const split = folder.addFolder('8 · Split');
  R(split, c, 'hitWidth', 0.1, 4, 0.01, 'reach either side (m)');
  R(split, c, 'hitImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(split, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(split, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(split, c, 'slice', 0, 1, 1, 'split in two');
  R(split, c, 'lanceZone', 0, 6, 0.01, 'lance launches within (m)');
  R(split, c, 'lanceImpulse', 0, 40, 0.1, 'lance throw (m/s)');
  R(split, c, 'lanceLift', 0, 30, 0.1, 'lance lift (m/s)');

  folder.close();
  return folder;
}
