import { Mesh, SphereGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createVoiceBandsGeometry, createChoirQuadGeometry } from '../../assets/codex/AcidChoirGeometry.js';
import {
  createWallMaterial,
  createWallWarpMaterial,
  createFontMaterial,
  createEtchFloorMaterial,
  createNoteMaterial,
  MAX_VOICES
} from '../../materials/codex/AcidChoirMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'acidchoir';

const TAU = Math.PI * 2;
/** Bodies the choir can be scouring at once. */
const MAX_SCOURED = 12;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * ACID CHOIR — walls of acid sung out across the circle, one voice at a time.
 *
 * A zone cast. A bead of light — the **note** — runs along the floor to the
 * circle, kicking up chips. There a **font** of acid wells up out of the
 * stone: a wobbling, glowing bulb. Then it **sings**: on every note it heaves
 * up and a **voice** leaves it — a wall of liquid acid, a metre and more
 * tall, walking outward in a ring. The voices come one after another and
 * each rings at its own pitch: the first stands tallest with a slow ripple
 * along its crest, each next one lower and finer, like a choir from soprano
 * to bass. As a voice walks it **eats the stone**: chips fly off its foot,
 * a band of live acid rides behind it, and every voice that crosses a patch
 * of floor etches it darker, so the circle ends in concentric terraces. At
 * the rim each voice curls over, slumps and tears into tatters. When the last
 * has died the font sinks back into the floor and the etched stone cools.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the font** (`createFontMaterial`) — a displaced bulb that heaves on
 *      every note, with BUBBLE particles breaking off it.
 *   2. **the voices** (`createWallMaterial`) — every wall in one draw, from
 *      uniform arrays: radius, height, harmonic, age, crash; standing-wave
 *      crest, foaming lip, streaked face, tatters as it breaks.
 *   3. **the eaten stone** (`createEtchFloorMaterial`) — terraces, grooves,
 *      pits, and a band of live acid behind every walking front.
 *   4. **chips, steam & bubbles** — lit CHIP stone, non-additive SMOKE.
 *   5. **the note & the beat** — the travelling bead (`createNoteMaterial`),
 *      and on every voice a knock, a light punch and a thin SHOCKWAVE; the
 *      walls bend the air (`createWallWarpMaterial`, `LAYER.DISTORTION`).
 *   6. **the scoured** — `handlesOwnHits`: the first voice to reach a body
 *      knocks it outward; every voice that washes over it after stains it.
 *
 * ## The editor rule
 *
 * A cast keeps a seed and one clock; every voice's radius, height, pitch and
 * age is recomputed from `settings.acidchoir` every frame, so the choir can
 * be re-pitched mid-song.
 */
export class AcidChoirAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Voices walking right now. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < MAX_VOICES; i++) if (this._k[i] >= 0 && this._k[i] <= 1) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.bandsGeometry = createVoiceBandsGeometry(MAX_VOICES, 120, 8);
    this.quadGeometry = createChoirQuadGeometry();
    this.fontGeometry = new SphereGeometry(1, 40, 24);

    this.floorMaterial = createEtchFloorMaterial();
    this.floor = this._mesh(this.quadGeometry, this.floorMaterial, LAYER.VFX, 2);
    this.wallMaterial = createWallMaterial();
    this.walls = this._mesh(this.bandsGeometry, this.wallMaterial, LAYER.VFX, 12);
    this.warpMaterial = createWallWarpMaterial();
    this.warp = this._mesh(this.bandsGeometry, this.warpMaterial, LAYER.DISTORTION, 0);
    this.fontMaterial = createFontMaterial();
    this.font = this._mesh(this.fontGeometry, this.fontMaterial, LAYER.VFX, 13);
    this.noteMaterial = createNoteMaterial();
    this.note = this._mesh(this.quadGeometry, this.noteMaterial, LAYER.VFX, 16);

    this._r = new Float32Array(MAX_VOICES);
    this._h = new Float32Array(MAX_VOICES);
    this._k = new Float32Array(MAX_VOICES).fill(-1);
    this._harm = new Float32Array(MAX_VOICES);
    this._crash = new Float32Array(MAX_VOICES);
    this._prevR = new Float32Array(MAX_VOICES);
    this._voiceState = { center: new Vector3(), r: this._r, h: this._h, k: this._k, harm: this._harm, crash: this._crash, flow: 0, seed: 0, voices: 5, live: 1, fadeT: 0 };
    this._fontState = { center: new Vector3(), rise: 0, heave: 0, fade: 1, seed: 0 };
    this._noteState = { center: new Vector3(), scale: 1 };

    this._seed = 0;
    this._flow = 0;
    this._sung = 0;

    this._scoured = [];
    for (let i = 0; i < MAX_SCOURED; i++) this._scoured.push({ dummy: null, passes: 0 });
    this._scouredCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
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

    this.chips = particles.get('acidchoir.chips', {
      capacity: 1400,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.25;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uDrag.value = 0.4;

    this.steam = particles.get('acidchoir.steam', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.9
    });
    this.steam.uniforms.uSizeIn.value = 0.25;
    this.steam.uniforms.uFadeIn.value = 0.2;
    this.steam.uniforms.uFadeOut.value = 0.55;
    this.steam.uniforms.uEndSize.value = 2.2;
    this.steam.uniforms.uDrag.value = 0.9;

    this.bubbles = particles.get('acidchoir.bubbles', {
      capacity: 700,
      shape: ParticleShape.BUBBLE,
      additive: true,
      softFade: 0.2
    });
    this.bubbles.uniforms.uSizeIn.value = 0.15;
    this.bubbles.uniforms.uFadeIn.value = 0.1;
    this.bubbles.uniforms.uFadeOut.value = 0.2;
    this.bubbles.uniforms.uEndSize.value = 1.4;
    this.bubbles.uniforms.uDrag.value = 1.2;

    this.chipEmitter = new RateEmitter();
    this.steamEmitter = new RateEmitter();
    this.bubbleEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _voiceCount() {
    return Math.min(MAX_VOICES, Math.max(1, Math.round(settings[ID].voices)));
  }

  /** The impact phase is the song: every voice born and walked out. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.2, ((this._voiceCount() - 1) * Math.max(0, c.interval) + Math.max(0.1, c.walkTime) + 0.15) * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 9.7) * Math.sin(this.age * 3.3 + 0.9));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.chipEmitter.reset();
    this.steamEmitter.reset();
    this.bubbleEmitter.reset();
    this._releaseScoured();

    this._seed = Math.random() * 100;
    this._flow = 0;
    this._sung = 0;
    this._k.fill(-1);
    this._r.fill(0);
    this._prevR.fill(0);
    this._crash.fill(0);

    const vs = this._voiceState;
    vs.seed = this._seed;
    vs.live = 1;
    vs.fadeT = 0;
    const fs = this._fontState;
    fs.seed = this._seed;
    fs.rise = 0;
    fs.heave = 0;
    fs.fade = 1;

    this.note.visible = true;
    this.font.visible = false;
    this.walls.visible = false;
    this.warp.visible = false;
    this.floor.visible = false;
    this._sync();
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
  /* The song                                                            */
  /* ------------------------------------------------------------------ */

  /** Recompute every voice from the clock and the settings. */
  _voices(tau) {
    const c = settings[ID];
    const g = settings.global;
    const n = this._voiceCount();
    const reach = Math.max(c.startRadius + 0.1, c.zoneRadius * c.reach);
    const walk = Math.max(0.1, c.walkTime) * g.lifetime;
    for (let i = 0; i < MAX_VOICES; i++) {
      this._prevR[i] = this._r[i];
      if (i >= n || tau < 0) {
        this._k[i] = -1;
        continue;
      }
      const born = i * Math.max(0, c.interval) * g.lifetime;
      let k = (tau - born) / walk;
      if (k < 0) {
        this._k[i] = -1;
        this._r[i] = c.startRadius;
        continue;
      }
      if (i >= this._sung) {
        this._sung = i + 1;
        this._sing(i);
      }
      k = Math.min(k, 1.01);
      this._k[i] = k;
      const e = 1 - Math.pow(1 - saturate(k), Math.max(0.2, c.walkCurve));
      this._r[i] = lerp(c.startRadius, reach, e);
      this._h[i] = Math.max(0.05, c.wallHeight * (1 + c.heightStep * i));
      this._harm[i] = Math.max(1, Math.round(c.harmonics + c.harmonicStep * i));
      this._crash[i] = smoothstep(c.crashAt, 1, k);
    }
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _centre);
    _centre.y = 0;
    const vs = this._voiceState;
    vs.center.copy(_centre);
    vs.flow = this._flow;
    vs.voices = this._voiceCount();
    this.wallMaterial.userData.sync(vs);
    this.warpMaterial.userData.sync(vs);
    this.floorMaterial.userData.sync(vs);
    this._fontState.center.copy(_centre);
    this.fontMaterial.userData.sync(this._fontState);
    this.noteMaterial.userData.sync(this._noteState);

    this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
    const k = this.chips.uniforms;
    k.uGravity.value.set(0, -12, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uTurbulence.value = 0.1 * g.turbulence;

    this.steam.setGradient(getColor(c.colorSteamA), getColor(c.colorSteamB), getColor(c.colorSteamC), getColor(c.colorSteamD));
    const s = this.steam.uniforms;
    s.uGravity.value.set(0, 0.35, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = c.steamOpacity * g.opacity;
    s.uTurbulence.value = 0.6 * g.turbulence;

    this.bubbles.setGradient(getColor(c.colorBubbleA), getColor(c.colorBubbleB), getColor(c.colorBubbleC), getColor(c.colorBubbleD));
    const b = this.bubbles.uniforms;
    b.uGravity.value.set(0, 1.2, 0);
    b.uSizeScale.value = g.particleSize;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uGlow.value = 1.6 * g.glow;
    b.uTurbulence.value = 0.5 * g.turbulence;
  }

  /** A voice leaves the font: the beat. */
  _sing(i) {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this.pointAt(1, _centre);
    _centre.y = 0;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * c.reach * 0.6,
      life: 0.45,
      width: 0.04,
      intensity: 0.7,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorWallA)
    });
    this._resetEmit(frame.uTime.value);
    _pos.copy(_centre).setY(c.fontSize * 0.8);
    _emit.position = _pos;
    _emit.radius = c.fontSize * 0.5;
    _emit.direction = _up;
    _emit.speed = 3;
    _emit.spread = 0.8;
    _emit.size = c.bubbleSize;
    _emit.life = c.bubbleLife * 0.7;
    this.bubbles.emit(Math.round(10 * g.particleCount), _emit);
    this.ctx.shake.add(c.voiceShake * power * (i === 0 ? 1.6 : 1), 6, 18);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.voiceLight * power);
    if (i === 0) this.ctx.flash.trigger(getColor(c.colorFlash), c.firstFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the note runs to the circle                                */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    this._noteState.center.copy(this.position).setY(0.3);
    this._noteState.scale = Easing.outBack(saturate(this.age / 0.12)) * (1 + 0.15 * Math.sin(this.age * 30));
    this._sync();

    const n = Math.round(this.chipEmitter.tick(dt, 70) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _pos.copy(this.position).setY(0.05);
      _dir.copy(this.direction).multiplyScalar(0.5).add(_up).normalize();
      _emit.position = _pos;
      _emit.radius = 0.2;
      _emit.direction = _dir;
      _emit.speed = c.chipSpeed * 0.6;
      _emit.spread = 0.6;
      _emit.size = c.chipSize * 0.7;
      _emit.life = c.chipLife * 0.6;
      _emit.spin = 8;
      this.chips.emit(n, _emit);
    }
    this.position.y = 0.3;
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the song                                                   */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    this.pointAt(1, _centre);
    this.note.visible = false;
    this.font.visible = true;
    this.walls.visible = true;
    this.warp.visible = true;
    this.floor.visible = true;
    this.ctx.decals.spawn(DecalType.SCORCH, _centre, {
      radius: c.fontSize * 2.2,
      life: this.impactDuration + this.fadeDuration,
      intensity: 0.9,
      colorA: getColor(c.colorGroove),
      colorB: getColor(c.colorAcid)
    });
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    this.pointAt(1, _centre);

    if (this.phase === AbilityPhase.IMPACT) {
      const tau = t * this.impactDuration;
      this._voices(tau);
      const fs = this._fontState;
      fs.rise = Easing.outBack(saturate(tau / Math.max(0.02, c.fontRise * g.lifetime)));
      // The font heaves on every note, then settles.
      let heave = 0;
      const n = this._voiceCount();
      for (let i = 0; i < n; i++) {
        const since = tau - i * Math.max(0, c.interval) * g.lifetime;
        if (since >= 0) heave = Math.max(heave, Math.exp(-since * 7) * Math.min(1, since * 30));
      }
      fs.heave = heave;
      fs.fade = 1;
      this._sync();
      this._songFx(dt, 1);
      this._scour();
      this.position.copy(_centre).setY(c.fontSize * (1 + heave) + 0.4);
      return;
    }

    /* the fade: the font sinks and the stone cools */
    const ft = saturate(t - 1);
    this._voices(1e6);
    this.walls.visible = false;
    this.warp.visible = false;
    const fs = this._fontState;
    fs.rise = 1 - Easing.inQuad(saturate(ft / 0.5));
    fs.heave = 0;
    fs.fade = 1 - smoothstep(0.3, 0.5, ft);
    this.font.visible = fs.fade > 0.01;
    this._voiceState.live = 1 - ft;
    this._voiceState.fadeT = smoothstep(0.4, 1, ft);
    this._sync();
    this._songFx(dt, 1 - ft);
    this.position.copy(_centre).setY(0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _songFx(dt, live) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const n = this._voiceCount();

    // Chips off every walking front.
    let walking = 0;
    for (let i = 0; i < n; i++) if (this._k[i] >= 0 && this._k[i] < c.crashAt) walking++;
    const chips = Math.round(this.chipEmitter.tick(dt, c.chipRate * walking) * g.particleCount);
    if (chips > 0 && walking > 0) {
      this._resetEmit(time);
      _emit.radius = 0.1;
      _emit.speed = c.chipSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.35;
      _emit.size = c.chipSize;
      _emit.life = c.chipLife;
      _emit.spin = 9;
      for (let j = 0; j < chips; j++) {
        // Pick a walking voice.
        let v = Math.floor(Math.random() * n);
        for (let tries = 0; tries < n && !(this._k[v] >= 0 && this._k[v] < c.crashAt); tries++) v = (v + 1) % n;
        const a = Math.random() * TAU;
        const r = this._r[v];
        _pos.set(_centre.x + Math.cos(a) * r, 0.05, _centre.z + Math.sin(a) * r);
        _dir.set(Math.cos(a), 1.3, Math.sin(a)).normalize();
        _emit.position = _pos;
        _emit.direction = _dir;
        this.chips.emit(1, _emit);
      }
    }

    // Steam off the eaten floor.
    let maxR = 0;
    for (let i = 0; i < n; i++) if (this._k[i] >= 0) maxR = Math.max(maxR, this._r[i]);
    const steam = Math.round(this.steamEmitter.tick(dt, c.steamRate * live * (maxR > 0.5 ? 1 : 0)) * g.particleCount);
    if (steam > 0) {
      this._resetEmit(time);
      _emit.size = c.steamSize;
      _emit.life = c.steamLife;
      _emit.speed = 0.6;
      _emit.spread = 0.3;
      _emit.spin = 0.4;
      _emit.direction = _up;
      for (let j = 0; j < steam; j++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * maxR;
        _pos.set(_centre.x + Math.cos(a) * r, 0.1, _centre.z + Math.sin(a) * r);
        _emit.position = _pos;
        this.steam.emit(1, _emit);
      }
    }

    // Bubbles breaking off the font.
    const bub = Math.round(this.bubbleEmitter.tick(dt, c.bubbleRate * this._fontState.rise * live) * g.particleCount);
    if (bub > 0) {
      this._resetEmit(time);
      _pos.copy(_centre).setY(c.fontSize * 0.6);
      _emit.position = _pos;
      _emit.radius = c.fontSize * 0.7;
      _emit.direction = _up;
      _emit.speed = 0.8;
      _emit.spread = 0.6;
      _emit.size = c.bubbleSize;
      _emit.life = c.bubbleLife;
      this.bubbles.emit(bub, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The scoured                                                         */
  /* ------------------------------------------------------------------ */

  /** Every voice that crossed a body this frame knocks it, or stains it again. */
  _scour() {
    const field = this.ctx.dummies;
    if (!field) return;
    const c = settings[ID];
    const g = settings.global;
    const n = this._voiceCount();
    let maxR = 0;
    for (let i = 0; i < n; i++) if (this._k[i] >= 0 && this._k[i] <= 1) maxR = Math.max(maxR, this._r[i]);
    if (maxR <= 0) return;
    // Corpses too: every later voice stains what the first one knocked down.
    const found = field.findBodies
      ? field.findBodies(_centre.x, _centre.z, maxR + 0.5, this._found)
      : field.findTargets(_centre.x, _centre.z, maxR + 0.5, this._found);
    const power = g.explosionIntensity;
    for (const dummy of found) {
      const d = Math.hypot(dummy.position.x - _centre.x, dummy.position.z - _centre.z);
      let crossed = 0;
      for (let i = 0; i < n; i++) {
        if (this._k[i] < 0 || this._k[i] > 1) continue;
        if (this._prevR[i] <= d && d < this._r[i]) crossed++;
      }
      if (crossed === 0) continue;
      let slot = null;
      for (let i = 0; i < this._scouredCount; i++) if (this._scoured[i].dummy === dummy) slot = this._scoured[i];
      if (!slot && this._scouredCount < MAX_SCOURED) {
        slot = this._scoured[this._scouredCount++];
        slot.dummy = dummy;
        slot.passes = 0;
      }
      if (slot) slot.passes += crossed;
      if (dummy.alive) {
        _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
        if (d < 0.05) _dir.set(1, 0, 0);
        else _dir.multiplyScalar(1 / d);
        this._force.impulse = c.hitImpulse * power;
        this._force.lift = c.hitLift * power;
        this._force.spin = c.hitSpin;
        dummy.kill(_dir.x, _dir.z, this._force);
      }
      // A splash of acid off the body as the voice washes over it.
      this._resetEmit(frame.uTime.value);
      _pos.copy(dummy.position).setY(0.6);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = 2;
      _emit.spread = 0.8;
      _emit.size = c.bubbleSize * 0.8;
      _emit.life = c.bubbleLife * 0.6;
      this.bubbles.emit(Math.round(8 * g.particleCount), _emit);
    }

    const look = this._look;
    look.color = c.colorScourBody;
    look.rimColor = c.colorScourRim;
    look.rimEmissive = c.scourRimGlow;
    look.edgeColor = c.colorScourEdge;
    look.edgeEmissive = c.scourEdgeGlow;
    look.edgeWidth = c.scourEdgeWidth;
    for (let i = 0; i < this._scouredCount; i++) {
      const slot = this._scoured[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      dummy.corrode(saturate(slot.passes * c.passStain), look);
      if (Math.random() < 0.05) {
        const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
        this._resetEmit(frame.uTime.value);
        _emit.position = at;
        _emit.radius = 0.3;
        _emit.direction = _up;
        _emit.speed = 0.5;
        _emit.spread = 0.6;
        _emit.size = c.steamSize * 0.5;
        _emit.life = c.steamLife * 0.5;
        this.steam.emit(1, _emit);
      }
    }
  }

  _releaseScoured() {
    for (let i = 0; i < this._scouredCount; i++) this._scoured[i].dummy = null;
    this._scouredCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.note.visible = false;
    this.font.visible = false;
    this.walls.visible = false;
    this.warp.visible = false;
    this.floor.visible = false;
    this._k.fill(-1);
    this._releaseScoured();
  }

  dispose() {
    this.bandsGeometry.dispose();
    this.quadGeometry.dispose();
    this.fontGeometry.dispose();
    this.floorMaterial.dispose();
    this.wallMaterial.dispose();
    this.warpMaterial.dispose();
    this.fontMaterial.dispose();
    this.noteMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('♫  Acid Choir');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 2, 80, 0.5, 'note runs at (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'stone cools over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const font = folder.addFolder('1 · Font');
  R(font, c, 'fontSize', 0.05, 3, 0.01, 'bulb radius (m)');
  R(font, c, 'fontRise', 0.02, 2, 0.01, 'wells up over (s)');
  R(font, c, 'fontHeave', 0, 2, 0.01, 'heave per note');
  R(font, c, 'fontWobble', 0, 1, 0.01, 'wobble');
  R(font, c, 'fontGlow', 0, 10, 0.05, 'glow');
  font.addColor(c, 'colorFontA').name('hot');
  font.addColor(c, 'colorFontB').name('acid');
  font.addColor(c, 'colorFontC').name('deep');

  const voices = folder.addFolder('2 · Voices');
  R(voices, c, 'voices', 1, MAX_VOICES, 1, 'voices');
  R(voices, c, 'interval', 0, 1.5, 0.01, 'between voices (s)');
  R(voices, c, 'walkTime', 0.1, 5, 0.01, 'walks out over (s)');
  R(voices, c, 'walkCurve', 0.2, 5, 0.01, 'slows as it spreads');
  R(voices, c, 'startRadius', 0, 3, 0.01, 'born at (m)');
  R(voices, c, 'reach', 0.3, 2, 0.01, 'dies at (× circle)');
  R(voices, c, 'wallHeight', 0.05, 5, 0.01, 'first voice height (m)');
  R(voices, c, 'heightStep', -0.3, 0.3, 0.005, 'height per voice');
  R(voices, c, 'harmonics', 1, 30, 1, 'first voice ripples');
  R(voices, c, 'harmonicStep', 0, 10, 1, 'ripples per voice');
  R(voices, c, 'crestAmp', 0, 1, 0.01, 'crest ripple');
  R(voices, c, 'curl', 0, 2, 0.01, 'crest curl (m)');
  R(voices, c, 'crashAt', 0.2, 1, 0.01, 'breaks from');
  R(voices, c, 'wallOpacity', 0, 1, 0.01, 'opacity');
  R(voices, c, 'wallGlow', 0, 8, 0.05, 'glow');
  R(voices, c, 'crestGlow', 0, 12, 0.05, 'crest glow');
  R(voices, c, 'flowSpeed', 0, 6, 0.05, 'face streaks');
  Editor.gradient(voices, c, 'colorWall', 'acid (crest → deep)');

  const stone = folder.addFolder('3 · Eaten stone');
  R(stone, c, 'grooveScale', 0.5, 16, 0.05, 'grooves per m');
  R(stone, c, 'freshBand', 0.05, 4, 0.01, 'live acid band (m)');
  R(stone, c, 'acidGlow', 0, 10, 0.05, 'acid glow');
  R(stone, c, 'etchDepth', 0, 1, 0.01, 'darkens per pass');
  R(stone, c, 'pitScale', 0.3, 10, 0.05, 'pit scale');
  R(stone, c, 'erode', 0, 1, 0.01, 'ragged fade');
  stone.addColor(c, 'colorAcid').name('live acid');
  stone.addColor(c, 'colorEtched').name('etched');
  stone.addColor(c, 'colorGroove').name('grooves');

  const fx = folder.addFolder('4 · Chips, steam & bubbles');
  R(fx, c, 'chipRate', 0, 400, 1, 'chips/second per voice');
  R(fx, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(fx, c, 'chipSpeed', 0, 15, 0.05, 'chip speed');
  R(fx, c, 'chipLife', 0.1, 3, 0.05, 'chip lifetime');
  R(fx, c, 'steamRate', 0, 200, 1, 'steam/second');
  R(fx, c, 'steamSize', 0.05, 3, 0.01, 'steam size');
  R(fx, c, 'steamLife', 0.1, 6, 0.05, 'steam lifetime');
  R(fx, c, 'steamOpacity', 0, 1, 0.01, 'steam opacity');
  R(fx, c, 'bubbleRate', 0, 300, 1, 'bubbles/second');
  R(fx, c, 'bubbleSize', 0.01, 0.6, 0.005, 'bubble size');
  R(fx, c, 'bubbleLife', 0.1, 4, 0.05, 'bubble lifetime');
  Editor.gradient(fx, c, 'colorChip', 'chip gradient');
  Editor.gradient(fx, c, 'colorSteam', 'steam gradient');
  Editor.gradient(fx, c, 'colorBubble', 'bubble gradient');

  const beat = folder.addFolder('5 · Note & beat');
  R(beat, c, 'noteSize', 0.05, 2, 0.01, 'note size (m)');
  R(beat, c, 'noteGlow', 0, 12, 0.05, 'note glow');
  R(beat, c, 'voiceShake', 0, 1, 0.01, 'knock per voice');
  R(beat, c, 'voiceLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(beat, c, 'firstFlash', 0, 1, 0.01, 'first voice flash');
  R(beat, c, 'warpStrength', 0, 4, 0.01, 'air bend');
  beat.addColor(c, 'colorNote').name('note');
  beat.addColor(c, 'colorFlash').name('flash');
  beat.addColor(c, 'colorShock').name('beat ring');

  const scour = folder.addFolder('6 · The scoured');
  R(scour, c, 'hitImpulse', 0, 20, 0.1, 'knocked out (m/s)');
  R(scour, c, 'hitLift', 0, 12, 0.05, 'lift (m/s)');
  R(scour, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(scour, c, 'passStain', 0, 1, 0.01, 'stain per voice');
  R(scour, c, 'scourRimGlow', 0, 10, 0.05, 'rim glow');
  R(scour, c, 'scourEdgeGlow', 0, 12, 0.05, 'edge glow');
  R(scour, c, 'scourEdgeWidth', 0, 0.3, 0.001, 'edge width');
  scour.addColor(c, 'colorScourBody').name('scoured body');
  scour.addColor(c, 'colorScourRim').name('rim');
  scour.addColor(c, 'colorScourEdge').name('edge');

  folder.close();
  return folder;
}
