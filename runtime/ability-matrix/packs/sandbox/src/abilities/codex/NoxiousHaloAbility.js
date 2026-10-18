import { Mesh, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createHaloGridGeometry, createHaloQuadGeometry } from '../../assets/codex/NoxiousHaloGeometry.js';
import {
  createGasRingMaterial,
  createCoreRingMaterial,
  createHaloHazeMaterial,
  createCurtainMaterial,
  createHaloGroundMaterial,
  createPopRingMaterial,
  createPopWarpMaterial
} from '../../materials/codex/NoxiousHaloMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'noxioushalo';

const TAU = Math.PI * 2;
/** Bodies the noose can be choking at once. */
const MAX_CHOKED = 12;
/** Directions the pop throws along. */
const POP_FAN = 20;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _hand = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * NOXIOUS HALO — a noose of gas over the circle, closing, then popping.
 *
 * A zone cast. The caster flings a small spinning **ring of gas** like a
 * discus; it flies out to the circle, swelling and rising as it goes, and
 * **hangs** over it at head height — a fat, lumpy torus of churning poison
 * with a white-hot filament at its heart, dark lanes spiralling round it as
 * the gas rolls. A **curtain** of fume unrolls from it to the floor in thin
 * dripping strands, and a ring of toxic light marks the floor under it.
 * Then it **tightens**: slowly at first and then faster, it closes toward
 * the middle like a noose, spinning up, thickening, brightening; its curtain
 * is dragged into a cone, gas is sucked in off the whole circle along
 * streaks on the floor, and everything inside is choked. At the bottom of
 * its stroke it **pops**: a flat ring of gas blows out across the circle at
 * the halo's height and bends the air, gobbets of poison are flung out, the
 * floor takes a shockwave and the bodies are thrown outward. The stain left
 * under it fades.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1–2. **the halo** — the gas ring (`createGasRingMaterial`) and its core
 *        filament (`createCoreRingMaterial`), a grid wrapped into a torus in
 *        the vertex stage with an integrated spin and roll.
 *   3. **the curtain** (`createCurtainMaterial`) — dripping strands of fume.
 *   4. **the noose** — the tightening curve, spin-up, glow-up and suction.
 *   5. **the ground** (`createHaloGroundMaterial`) — the shadow ring, the
 *      suction streaks, the stain.
 *   6. **the pop** — `createPopRingMaterial` and `createPopWarpMaterial`,
 *      SHOCKWAVE and SCORCH decals, globules, puffs, flash, shake, light.
 *   7. **wisps, motes & globules** — SMOKE wisps drawn inward, curl-noise
 *      motes off the ring, DROPLET globules at the pop.
 *   8. **haze** — the torus, fattened, on `LAYER.DISTORTION`.
 *   9. **the choked** — `handlesOwnHits`: bodies inside the closing ring are
 *      stained, then thrown outward at the pop.
 *
 * ## The editor rule
 *
 * A cast keeps a seed and four integrated phases (spin, roll, curtain flow,
 * and the noose's own clock); every metre, second and colour is resolved
 * from `settings.noxioushalo` per frame.
 */
export class NoxiousHaloAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._chokedCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.torusGeometry = createHaloGridGeometry(160, 20);
    this.curtainGeometry = createHaloGridGeometry(128, 10);
    this.quadGeometry = createHaloQuadGeometry();

    this.groundMaterial = createHaloGroundMaterial();
    this.ground = this._mesh(this.quadGeometry, this.groundMaterial, LAYER.VFX, 2);
    this.curtainMaterial = createCurtainMaterial();
    this.curtain = this._mesh(this.curtainGeometry, this.curtainMaterial, LAYER.VFX, 11);
    this.gasMaterial = createGasRingMaterial();
    this.gas = this._mesh(this.torusGeometry, this.gasMaterial, LAYER.VFX, 13);
    this.coreMaterial = createCoreRingMaterial();
    this.core = this._mesh(this.torusGeometry, this.coreMaterial, LAYER.VFX, 14);
    this.hazeMaterial = createHaloHazeMaterial();
    this.haze = this._mesh(this.torusGeometry, this.hazeMaterial, LAYER.DISTORTION, 0);
    this.popMaterial = createPopRingMaterial();
    this.pop = this._mesh(this.quadGeometry, this.popMaterial, LAYER.VFX, 15);
    this.popWarpMaterial = createPopWarpMaterial();
    this.popWarp = this._mesh(this.quadGeometry, this.popWarpMaterial, LAYER.DISTORTION, 0);

    this._torus = { center: new Vector3(), ringR: 1, tubeR: 0.3, spin: 0, roll: 0, seed: 0, tension: 0, glow: 1, fade: 1 };
    this._curtainState = { center: new Vector3(), ringR: 1, topY: 2.6, spin: 0, flow: 0, reach: 0, glow: 1, fade: 1, seed: 0 };
    this._groundState = { center: new Vector3(), ringR: 1, tension: 0, show: 0, stain: 0, fadeT: 0, glow: 1, seed: 0 };
    this._popState = { center: new Vector3(), progress: 0, inner: 0.1, seed: 0 };

    this._seed = 0;
    this._spin = 0;
    this._roll = 0;
    this._flow = 0;
    this._popped = false;

    this._choked = [];
    for (let i = 0; i < MAX_CHOKED; i++) this._choked.push({ dummy: null, time: 0 });
    this._chokedCount = 0;
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

    this.wisps = particles.get('noxioushalo.wisps', {
      capacity: 1000,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.9
    });
    this.wisps.uniforms.uSizeIn.value = 0.2;
    this.wisps.uniforms.uFadeIn.value = 0.2;
    this.wisps.uniforms.uFadeOut.value = 0.5;
    this.wisps.uniforms.uEndSize.value = 1.2;
    this.wisps.uniforms.uDrag.value = 0.2;

    this.motes = particles.get('noxioushalo.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.0;
    this.motes.uniforms.uTurbFrequency.value = 0.8;
    this.motes.uniforms.uTurbSpeed.value = 0.6;

    this.globs = particles.get('noxioushalo.globs', {
      capacity: 1200,
      shape: ParticleShape.DROPLET,
      additive: false,
      softFade: 0.15
    });
    this.globs.uniforms.uSizeIn.value = 0.04;
    this.globs.uniforms.uFadeIn.value = 0.02;
    this.globs.uniforms.uFadeOut.value = 0.3;
    this.globs.uniforms.uEndSize.value = 0.6;
    this.globs.uniforms.uDrag.value = 0.4;

    this.suckEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _popAt() {
    const c = settings[ID];
    return (Math.max(0, c.hoverTime) + Math.max(0.05, c.tightenTime)) * settings.global.lifetime;
  }

  /** The impact phase is the hang, the tightening and the pop. */
  get impactDuration() {
    return Math.max(0.2, this._popAt() + Math.max(0.05, settings[ID].popTime) * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 11.3) * Math.sin(this.age * 4.1 + 0.4));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.suckEmitter.reset();
    this.moteEmitter.reset();
    this._releaseChoked();

    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._roll = 0;
    this._flow = 0;
    this._popped = false;

    this._torus.seed = this._seed;
    this._torus.tension = 0;
    this._torus.glow = 1;
    this._torus.fade = 1;
    this._curtainState.seed = this._seed;
    this._curtainState.reach = 0;
    this._groundState.seed = this._seed;
    this._groundState.show = 0;
    this._groundState.stain = 0;
    this._groundState.tension = 0;
    this._groundState.fadeT = 0;
    this._popState.seed = this._seed;
    this._popState.progress = 0;

    this.gas.visible = true;
    this.core.visible = true;
    this.haze.visible = true;
    this.curtain.visible = false;
    this.ground.visible = false;
    this.pop.visible = false;
    this.popWarp.visible = false;
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
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _advance(dt, spinMul) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += c.spinSpeed * spinMul * dt * g.animationSpeed;
    this._roll += c.rollSpeed * (0.6 + 0.4 * spinMul) * dt * g.animationSpeed;
    this._flow += c.curtainFlow * dt * g.noiseSpeed;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    const t = this._torus;
    t.spin = this._spin;
    t.roll = this._roll;
    this.gasMaterial.userData.sync(t);
    this.coreMaterial.userData.sync(t);
    this.hazeMaterial.userData.sync(t);

    this.pointAt(1, _centre);
    _centre.y = 0;
    const cs = this._curtainState;
    cs.center.copy(_centre);
    cs.ringR = t.ringR;
    cs.topY = t.center.y;
    cs.spin = this._spin;
    cs.flow = this._flow;
    cs.glow = t.glow;
    this.curtainMaterial.userData.sync(cs);

    const gs = this._groundState;
    gs.center.copy(_centre);
    gs.ringR = t.ringR;
    gs.tension = t.tension;
    gs.glow = t.glow;
    this.groundMaterial.userData.sync(gs);

    this._popState.center.copy(_centre).setY(c.haloHeight);
    this.popMaterial.userData.sync(this._popState);
    this.popWarpMaterial.userData.sync(this._popState);

    this.wisps.setGradient(getColor(c.colorWispA), getColor(c.colorWispB), getColor(c.colorWispC), getColor(c.colorWispD));
    const w = this.wisps.uniforms;
    w.uGravity.value.set(0, 0.3, 0);
    w.uSizeScale.value = g.particleSize;
    w.uLifeScale.value = g.particleLifetime;
    w.uSpeedScale.value = g.particleSpeed;
    w.uOpacity.value = c.wispOpacity * g.opacity;
    w.uTurbulence.value = 0.4 * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, -0.3, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 1.0 * g.turbulence;

    this.globs.setGradient(getColor(c.colorGlobA), getColor(c.colorGlobB), getColor(c.colorGlobC), getColor(c.colorGlobD));
    const b = this.globs.uniforms;
    b.uGravity.value.set(0, -10, 0);
    b.uSizeScale.value = g.particleSize;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uTurbulence.value = 0.1 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the discus                                                 */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._advance(dt, 3);
    const R = Math.max(0.3, c.zoneRadius * c.haloRadius);
    _hand.copy(this.origin).addScaledVector(this.direction, 0.8).setY(c.throwHeight);
    this.pointAt(1, _centre);
    _centre.y = c.haloHeight;
    const t = this._torus;
    t.center.lerpVectors(_hand, _centre, this.u);
    // It swells late, so it reads as a discus leaving the hand.
    const k = Easing.inQuad(this.u);
    t.ringR = lerp(c.throwRadius, R, k);
    t.tubeR = c.tubeRadius * lerp(0.45, 1, k) * Easing.outBack(saturate(this.age / 0.15));
    t.tension = 0;
    t.glow = 1.3;
    t.fade = 1;
    this._groundState.show = smoothstep(0.6, 1, this.u) * 0.6;
    this.ground.visible = this.u > 0.6;
    this._sync();
    this._ringMotes(dt, 1);
    this.position.copy(t.center);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — hang, tighten, pop                                         */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _centre);
    this.curtain.visible = true;
    this.ground.visible = true;
    this._curtainState.reach = 0;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * 1.1,
      life: 0.5,
      width: 0.05,
      intensity: 0.7,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorCore)
    });
    this.ctx.shake.add(0.12 * g.explosionIntensity, 5, 14);
    this.lightBoost = c.lightIntensity * 0.6;
    this._choke();
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _centre);
    const R = Math.max(0.3, c.zoneRadius * c.haloRadius);

    if (this.phase === AbilityPhase.IMPACT) {
      const tau = t * this.impactDuration;
      const hover = Math.max(0, c.hoverTime) * g.lifetime;
      const popAt = this._popAt();
      const k = saturate((tau - hover) / Math.max(0.05, c.tightenTime * g.lifetime));
      const close = Math.pow(k, Math.max(0.2, c.tightenCurve));
      const tor = this._torus;

      this._advance(dt, lerp(1, c.spinUp, close));
      tor.center.copy(_centre).setY(c.haloHeight);
      tor.ringR = lerp(R, R * c.tightenTo, close);
      tor.tubeR = c.tubeRadius * lerp(1, c.thickenTo, close);
      tor.tension = close;
      tor.glow = lerp(1, c.glowUp, close);

      this._curtainState.reach = Easing.outCubic(saturate(tau / Math.max(0.05, hover + 0.3)));
      this._curtainState.fade = 1;
      const gs = this._groundState;
      gs.show = smoothstep(0, 0.25, tau);
      gs.stain = 0.3 + 0.7 * close;

      if (!this._popped && tau >= popAt) this._doPop(tor.ringR);
      if (this._popped) {
        const p = saturate((tau - popAt) / Math.max(0.05, c.popTime * g.lifetime));
        this._popState.progress = p;
        // The ring itself is gone in a blink: it *is* the blast now.
        tor.fade = 1 - smoothstep(0, 0.15, p);
        tor.tubeR *= 1 + p * 2;
        this._curtainState.fade = 1 - smoothstep(0, 0.3, p);
        this.gas.visible = tor.fade > 0.01;
        this.core.visible = this.gas.visible;
        this.haze.visible = this.gas.visible;
        this.curtain.visible = this._curtainState.fade > 0.01;
        this.pop.visible = p < 1;
        this.popWarp.visible = p < 1;
        gs.tension = 0;
      } else {
        this._suck(dt, close);
        this.ctx.shake.rumble(c.tightenRumble * close, dt);
        this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * close * 0.6);
      }

      this._sync();
      this._ringMotes(dt, tor.fade);
      this._updateChoked(dt, this._popped ? 0 : 0.3 + close);
      this.position.copy(tor.center);
      return;
    }

    /* the fade: the stain clears */
    const ft = saturate(t - 1);
    this.gas.visible = false;
    this.core.visible = false;
    this.haze.visible = false;
    this.curtain.visible = false;
    this.pop.visible = false;
    this.popWarp.visible = false;
    const gs = this._groundState;
    gs.show = 1 - smoothstep(0, 0.3, ft);
    gs.fadeT = smoothstep(0.3, 1, ft);
    this._advance(dt, 0.2);
    this._sync();
    this._updateChoked(dt, 0);
    this.position.copy(_centre).setY(1.2);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Motes shed off the ring as it turns. */
  _ringMotes(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (n <= 0) return;
    const t = this._torus;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.speed = 0.5;
    _emit.spread = 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      _pos.set(t.center.x + Math.cos(a) * t.ringR, t.center.y, t.center.z + Math.sin(a) * t.ringR);
      _dir.set(-Math.sin(a), -0.4, Math.cos(a));
      _emit.position = _pos;
      _emit.radius = t.tubeR;
      _emit.direction = _dir;
      this.motes.emit(1, _emit);
    }
  }

  /** Gas drawn in off the circle toward the closing ring. */
  _suck(dt, close) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.suckEmitter.tick(dt, c.suckRate * (0.3 + close)) * g.particleCount);
    if (n <= 0) return;
    const R = c.zoneRadius;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.wispSize;
    _emit.life = c.wispLife;
    _emit.lifeVariance = 0.25;
    _emit.speed = c.suckSpeed * (0.6 + close);
    _emit.speedVariance = 0.3;
    _emit.spread = 0.1;
    _emit.spin = 0.6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = R * (0.9 + Math.random() * 0.4);
      _pos.set(_centre.x + Math.cos(a) * r, 0.2 + Math.random() * c.haloHeight * 0.6, _centre.z + Math.sin(a) * r);
      _dir.set(-Math.cos(a), 0.35, -Math.sin(a));
      _emit.position = _pos;
      _emit.direction = _dir;
      this.wisps.emit(1, _emit);
    }
  }

  _doPop(ringR) {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._popped = true;
    this.pop.visible = true;
    this.popWarp.visible = true;
    const full = Math.max(0.3, c.zoneRadius * c.popRadius * power);
    this._popState.inner = saturate(ringR / full);
    this._popState.progress = 0;
    _pos.copy(_centre).setY(c.haloHeight);

    this._resetEmit(time);
    const globs = Math.round((c.globules * g.particleCount) / POP_FAN);
    const puffs = Math.max(1, Math.round((c.popPuffs * g.particleCount) / POP_FAN));
    for (let f = 0; f < POP_FAN; f++) {
      const a = (TAU * (f + Math.random())) / POP_FAN;
      _dir.set(Math.cos(a), 0.15 + Math.random() * 0.3, Math.sin(a)).normalize();
      _emit.position = _pos;
      _emit.radius = ringR * 0.8;
      _emit.direction = _dir;
      _emit.speed = c.globSpeed;
      _emit.speedVariance = 0.45;
      _emit.spread = 0.2;
      _emit.size = c.globSize;
      _emit.life = c.globLife;
      _emit.spin = 0;
      this.globs.emit(globs, _emit);
      _emit.speed = c.globSpeed * 0.5;
      _emit.size = c.wispSize * 1.3;
      _emit.life = c.wispLife * 1.2;
      _emit.spin = 0.5;
      this.wisps.emit(puffs, _emit);
      _emit.speed = c.globSpeed * 0.7;
      _emit.size = c.moteSize * 1.5;
      _emit.life = c.moteLife;
      this.motes.emit(puffs * 2, _emit);
    }

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * c.popShock * power,
      life: 0.6,
      width: 0.08,
      intensity: 1.2,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorCore)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _centre, {
      radius: c.zoneRadius * 0.6,
      life: this.fadeDuration + 0.6,
      intensity: 0.8,
      colorA: getColor(c.colorStain),
      colorB: getColor(c.colorStreak)
    });

    this._blowOut();
    this.ctx.shake.add(c.popShake * power, 1 / Math.max(0.05, c.shakeDuration), 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.popFlash * power);
    this.lightBoost = c.lightIntensity * c.popLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* The choked                                                          */
  /* ------------------------------------------------------------------ */

  _choke() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const found = field.findTargets(_centre.x, _centre.z, Math.max(0.3, c.zoneRadius), this._found);
    for (const dummy of found) {
      if (this._chokedCount >= MAX_CHOKED) break;
      const slot = this._choked[this._chokedCount++];
      slot.dummy = dummy;
      slot.time = 0;
    }
  }

  _updateChoked(dt, rate) {
    const c = settings[ID];
    const look = this._look;
    look.color = c.colorChokeBody;
    look.rimColor = c.colorChokeRim;
    look.rimEmissive = c.chokeRimGlow;
    look.edgeColor = c.colorChokeEdge;
    look.edgeEmissive = c.chokeEdgeGlow;
    look.edgeWidth = c.chokeEdgeWidth;
    for (let i = 0; i < this._chokedCount; i++) {
      const slot = this._choked[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt * rate;
      dummy.corrode(Math.min(c.choke, slot.time * c.chokeRate), look);
      if (rate > 0 && Math.random() < dt * 6) {
        const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
        this._resetEmit(frame.uTime.value);
        _emit.position = at;
        _emit.radius = 0.3;
        _emit.direction = _up;
        _emit.speed = 0.6;
        _emit.spread = 0.8;
        _emit.size = c.moteSize;
        _emit.life = c.moteLife;
        this.motes.emit(2, _emit);
      }
    }
  }

  _blowOut() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    const found = field.findTargets(_centre.x, _centre.z, Math.max(0.3, c.zoneRadius) * 1.1, this._found);
    for (const dummy of found) {
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      const d = _dir.length();
      if (d < 0.05) _dir.set(Math.cos(this._seed), 0, Math.sin(this._seed));
      else _dir.multiplyScalar(1 / d);
      dummy.kill(_dir.x, _dir.z, this._force);
    }
  }

  _releaseChoked() {
    for (let i = 0; i < this._chokedCount; i++) this._choked[i].dummy = null;
    this._chokedCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.gas.visible = false;
    this.core.visible = false;
    this.haze.visible = false;
    this.curtain.visible = false;
    this.ground.visible = false;
    this.pop.visible = false;
    this.popWarp.visible = false;
    this._popped = false;
    this._releaseChoked();
  }

  dispose() {
    this.torusGeometry.dispose();
    this.curtainGeometry.dispose();
    this.quadGeometry.dispose();
    this.groundMaterial.dispose();
    this.curtainMaterial.dispose();
    this.gasMaterial.dispose();
    this.coreMaterial.dispose();
    this.hazeMaterial.dispose();
    this.popMaterial.dispose();
    this.popWarpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◎  Noxious Halo');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 2, 80, 0.5, 'throw speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'stain clears over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const shape = folder.addFolder('1 · Halo shape');
  R(shape, c, 'throwHeight', 0.2, 3, 0.01, 'leaves the hand at (m)');
  R(shape, c, 'throwRadius', 0.05, 2, 0.01, 'radius in the hand (m)');
  R(shape, c, 'haloHeight', 0.5, 8, 0.05, 'hangs at (m)');
  R(shape, c, 'haloRadius', 0.3, 2, 0.01, 'radius (× circle)');
  R(shape, c, 'tubeRadius', 0.02, 1.5, 0.005, 'thickness (m)');
  R(shape, c, 'lumps', 0, 1.5, 0.01, 'lumps');
  R(shape, c, 'lumpScale', 0.1, 6, 0.01, 'lump scale');
  R(shape, c, 'wobble', 0, 1.5, 0.01, 'rock (m)');
  R(shape, c, 'spinSpeed', 0, 12, 0.05, 'spin (rad/s)');
  R(shape, c, 'rollSpeed', 0, 16, 0.05, 'gas roll (rad/s)');

  const gas = folder.addFolder('2 · Gas');
  R(gas, c, 'bands', 1, 12, 1, 'dark bands');
  R(gas, c, 'bandTwist', 0, 24, 1, 'band turns');
  R(gas, c, 'gasOpacity', 0, 1, 0.01, 'opacity');
  R(gas, c, 'gasGlow', 0, 8, 0.05, 'glow');
  R(gas, c, 'coreGlow', 0, 16, 0.05, 'filament glow');
  R(gas, c, 'coreWidth', 0.005, 0.5, 0.005, 'filament radius (m)');
  R(gas, c, 'rimGlow', 0, 6, 0.05, 'rim glow');
  Editor.gradient(gas, c, 'colorGas', 'gas (hot → dark)');
  gas.addColor(c, 'colorCore').name('filament');

  const curtain = folder.addFolder('3 · Curtain');
  R(curtain, c, 'hoverTime', 0, 4, 0.01, 'hangs for (s)');
  R(curtain, c, 'strands', 2, 120, 1, 'strands');
  R(curtain, c, 'strandSharp', 0.5, 20, 0.1, 'strand thinness');
  R(curtain, c, 'curtainGlow', 0, 6, 0.05, 'glow');
  R(curtain, c, 'curtainOpacity', 0, 1, 0.01, 'opacity');
  R(curtain, c, 'curtainFlow', 0, 6, 0.05, 'slide (m/s)');
  R(curtain, c, 'curtainFlare', 0, 1, 0.01, 'foot flare');
  curtain.addColor(c, 'colorCurtainA').name('bright');
  curtain.addColor(c, 'colorCurtainB').name('dim');

  const noose = folder.addFolder('4 · Noose');
  R(noose, c, 'tightenTime', 0.05, 5, 0.01, 'closes over (s)');
  R(noose, c, 'tightenTo', 0.02, 1, 0.01, 'closes to (× radius)');
  R(noose, c, 'thickenTo', 0.2, 4, 0.01, 'swells to (× thickness)');
  R(noose, c, 'tightenCurve', 0.2, 6, 0.05, 'snap (curve)');
  R(noose, c, 'spinUp', 0, 12, 0.05, 'spin-up (×)');
  R(noose, c, 'glowUp', 0, 6, 0.05, 'glow-up (×)');
  R(noose, c, 'suckRate', 0, 400, 1, 'wisps/second drawn in');
  R(noose, c, 'suckSpeed', 0, 15, 0.05, 'drawn in at (m/s)');
  R(noose, c, 'tightenRumble', 0, 1, 0.01, 'rumble');

  const ground = folder.addFolder('5 · Ground');
  R(ground, c, 'ringGlow', 0, 10, 0.05, 'ring glow');
  R(ground, c, 'ringWidth', 0.01, 1, 0.005, 'ring width (m)');
  R(ground, c, 'streaks', 2, 80, 1, 'suction streaks');
  R(ground, c, 'streakGlow', 0, 6, 0.05, 'streak glow');
  R(ground, c, 'stainOpacity', 0, 1, 0.01, 'stain opacity');
  R(ground, c, 'erode', 0, 1, 0.01, 'ragged fade');
  ground.addColor(c, 'colorRing').name('ring');
  ground.addColor(c, 'colorStain').name('stain');
  ground.addColor(c, 'colorStreak').name('streaks');

  const pop = folder.addFolder('6 · Pop');
  R(pop, c, 'popTime', 0.05, 2, 0.01, 'blows out over (s)');
  R(pop, c, 'popRadius', 0.3, 4, 0.01, 'blast reach (× circle)');
  R(pop, c, 'popWidth', 0.02, 1, 0.005, 'blast ring width');
  R(pop, c, 'popGlow', 0, 10, 0.05, 'blast glow');
  R(pop, c, 'popWarp', 0, 4, 0.01, 'air bend');
  R(pop, c, 'globules', 0, 800, 1, 'globules');
  R(pop, c, 'globSpeed', 0, 30, 0.1, 'globule speed');
  R(pop, c, 'globSize', 0.01, 0.5, 0.005, 'globule size');
  R(pop, c, 'globLife', 0.1, 3, 0.01, 'globule lifetime');
  R(pop, c, 'popPuffs', 0, 200, 1, 'puffs');
  R(pop, c, 'popShock', 0, 5, 0.01, 'shockwave (× circle)');
  R(pop, c, 'popFlash', 0, 1, 0.01, 'flash');
  R(pop, c, 'popShake', 0, 1.5, 0.01, 'camera knock');
  R(pop, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(pop, c, 'popLight', 0, 8, 0.01, 'light punch (× intensity)');
  pop.addColor(c, 'colorPop').name('blast ring');
  pop.addColor(c, 'colorFlash').name('flash');
  pop.addColor(c, 'colorShock').name('shockwave');

  const fx = folder.addFolder('7 · Wisps, motes & globules');
  R(fx, c, 'wispSize', 0.05, 3, 0.01, 'wisp size');
  R(fx, c, 'wispLife', 0.1, 5, 0.05, 'wisp lifetime');
  R(fx, c, 'wispOpacity', 0, 1, 0.01, 'wisp opacity');
  R(fx, c, 'moteRate', 0, 500, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.3, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorWisp', 'wisp gradient');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  Editor.gradient(fx, c, 'colorGlob', 'globule gradient');

  const haze = folder.addFolder('8 · Haze');
  R(haze, c, 'hazeStrength', 0, 4, 0.01, 'strength');
  R(haze, c, 'hazeWidth', 1, 8, 0.05, 'width (× thickness)');
  R(haze, c, 'hazeScale', 0.1, 8, 0.01, 'noise scale');
  R(haze, c, 'hazeSpeed', 0, 12, 0.05, 'noise speed');

  const choked = folder.addFolder('9 · The choked');
  R(choked, c, 'chokeRate', 0, 3, 0.01, 'stain per second');
  R(choked, c, 'choke', 0, 1, 0.01, 'most stained');
  R(choked, c, 'hitImpulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(choked, c, 'hitLift', 0, 20, 0.1, 'lift (m/s)');
  R(choked, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(choked, c, 'chokeRimGlow', 0, 10, 0.05, 'rim glow');
  R(choked, c, 'chokeEdgeGlow', 0, 12, 0.05, 'edge glow');
  R(choked, c, 'chokeEdgeWidth', 0, 0.3, 0.001, 'edge width');
  choked.addColor(c, 'colorChokeBody').name('choked body');
  choked.addColor(c, 'colorChokeRim').name('rim');
  choked.addColor(c, 'colorChokeEdge').name('edge');

  folder.close();
  return folder;
}
