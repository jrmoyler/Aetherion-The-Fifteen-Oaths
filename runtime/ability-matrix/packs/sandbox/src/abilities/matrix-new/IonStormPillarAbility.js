import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createPillarGeometry,
  IonBoltRibbons,
  ION_MAX_BOLTS,
  ION_MAIN_POINTS,
  ION_FORKS
} from '../../assets/matrix-new/IonStormPillarGeometry.js';
import {
  createIonPillarMaterial,
  createIonBoltMaterial,
  createIonGroundMaterial,
  createIonWarpMaterial
} from '../../materials/matrix-new/IonStormPillarMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'ionstorm';

const TAU = Math.PI * 2;
/** The first ribbon slots are the orbiting arcs; the rest are strikes. */
const MAX_ORBITS = 6;
const STRIKE_SLOTS = ION_MAX_BOLTS - MAX_ORBITS;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _from = new Vector3();
const _to = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);
const _shape = {
  segments: 22,
  jag: 0.14,
  jagMax: 1.2,
  kink: 0.25,
  forks: 2,
  forkLength: 0.35,
  forkSpread: 0.7,
  forkWidth: 0.55,
  forkBright: 0.7,
  bulge: new Vector3()
};

/**
 * ION STORM PILLAR — Plasma, zone cast.
 *
 * A column of ionised plasma slams down onto the circle and *stands*, and the
 * danger is not the column but what comes off it: bolts crawl round its skin,
 * and every so often one lashes out and strikes the floor — killing whatever
 * it lands near. When its time is up it implodes, pinched to a thread, and
 * goes out in one flash.
 *
 * ## Layers
 *
 *   1. **THE COLUMN** (`createIonPillarMaterial('body')`) — an open cylinder
 *      shaped in its vertex stage: it *slams* (the bottom edge descends from
 *      the top), writhes with noise, flares at the foot and implodes at the
 *      end. The fragment stage is a white-hot core down the line of sight,
 *      plasma bands racing up it torn by fbm turbulence, cyan fresnel edges.
 *   2. **THE CORONA** (`… ('shell')`) — a wider sheath drawn from the back:
 *      fresnel only, crawled over by thin ridged filaments.
 *   3. **THE BOLTS** (`IonBoltRibbons` + `createIonBoltMaterial`) — one
 *      pre-allocated ribbon buffer, camera-facing in the vertex stage. Slots
 *      0..5 are *orbiting arcs* that wheel round the column bowing off its
 *      skin; the rest are *strikes* that leave the column and race to the
 *      floor. A slot's envelope is four floats in a uniform array, so a
 *      hanging bolt costs nothing until its shape is re-rolled.
 *   4. **THE IONISED FLOOR** (`createIonGroundMaterial`) — a hot pool round the
 *      base, a ring at the circle's edge, arcs crawling round the annulus, and
 *      a flare round every fresh strike point.
 *   5. **STRIKE LANDINGS** — an ARC decal, a spray of STREAK sparks, a light
 *      punch and a small shake per strike; bodies within `strikeKillRadius`
 *      are killed and thrown away from the strike (`handlesOwnHits`).
 *   6. **MOTES** — SOFT particles on a swirl anchor, spiralling up the column.
 *   7. **THE WARP** (`createIonWarpMaterial`) — a billboard on
 *      LAYER.DISTORTION whose mask hugs the column's skin, so the scene bends
 *      round the plasma.
 *   8. **SLAM & IMPLOSION** — an AIR shell, a shockwave, dust and a hard shake
 *      when it lands; a STORM shell, a flash, a ring and a spray of sparks when
 *      it goes.
 *
 * Plus a flickering light: `lightShimmer` strobes on quantised hash noise
 * (lightning does not dim smoothly), and every strike punches it.
 *
 * ## The editor rule
 *
 * A strike record holds what was *decided* — its slot, where it left, where it
 * lands, its seed — because a bolt that re-aimed itself mid-strike under a
 * slider would be a different bolt. Everything else — the column, the arcs'
 * orbit, every width, colour and rate — is resolved from `settings.ionstorm`
 * every frame.
 */
export class IonStormPillarAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Live bolts. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < ION_MAX_BOLTS; i++) if (this._slots[i].active) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 & 2: the column and its corona ---- */
    this.pillarGeometry = createPillarGeometry(48, 40);
    this.shellMaterial = createIonPillarMaterial('shell');
    this.bodyMaterial = createIonPillarMaterial('body');
    this.shell = new Mesh(this.pillarGeometry, this.shellMaterial);
    this.body = new Mesh(this.pillarGeometry, this.bodyMaterial);
    this.shell.renderOrder = 11;
    this.body.renderOrder = 12;
    for (const mesh of [this.shell, this.body]) {
      mesh.frustumCulled = false;
      mesh.layers.set(LAYER.VFX);
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- layer 3: every bolt, one buffer ---- */
    this.ribbons = new IonBoltRibbons();
    this.boltMaterial = createIonBoltMaterial();
    this.bolts = new Mesh(this.ribbons.geometry, this.boltMaterial);
    this.bolts.frustumCulled = false;
    this.bolts.layers.set(LAYER.VFX);
    this.bolts.renderOrder = 14;
    this.bolts.visible = false;
    this.group.add(this.bolts);

    /* ---- layer 4: the ionised floor ---- */
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.groundMaterial = createIonGroundMaterial();
    this.ground = new Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.layers.set(LAYER.VFX);
    this.ground.renderOrder = 6;
    this.ground.frustumCulled = false;
    this.ground.visible = false;
    this.group.add(this.ground);

    /* ---- layer 7: the warp ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
    this.warpMaterial = createIonWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /** One record per ribbon slot. */
    this._slots = [];
    for (let i = 0; i < ION_MAX_BOLTS; i++) {
      this._slots.push({
        active: false,
        orbit: i < MAX_ORBITS,
        age: 0,
        life: 0,
        reroll: 0,
        landed: false,
        seed: 0,
        heightA: 0, // orbit dice: 0..1 low/high fractions of the orbit band
        heightB: 0,
        from: new Vector3(),
        to: new Vector3()
      });
    }

    this._pillarState = { radius: 1, height: 1, drop: 0, implode: 0, surge: 0, fade: 1 };
    this._groundState = { quadSize: 1, radius: 1, poolRadius: 1, reveal: 0, fade: 1, surge: 0, seed: 0 };
    this._warpState = { width: 1, height: 1, skin: 0.4, strength: 0, seed: 0 };

    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._clock = -1;
    this._seed = 0;
    this._orbitPhase = 0;
    this._surge = 0;
    this._slammed = false;
    this._imploded = false;
    this._drop = 0;
    this._implode = 0;
    this._strikeTimer = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 5: sparks ---- */
    this.sparks = particles.get('ionstorm.spark', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.4;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    /* ---- layer 6: motes spiralling up the column ---- */
    this.motes = particles.get('ionstorm.mote', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      swirl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 0.3;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uSizeIn.value = 0.06;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uSwirlExpand.value = -0.4;

    /* ---- layer 8: dust kicked up by the slam ---- */
    this.dust = particles.get('ionstorm.dust', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.dust.uniforms.uDrag.value = 2.2;
    this.dust.uniforms.uSizeIn.value = 0.1;
    this.dust.uniforms.uFadeIn.value = 0.06;
    this.dust.uniforms.uFadeOut.value = 0.5;
    this.dust.uniforms.uEndSize.value = 2.6;

    this.moteEmitter = new RateEmitter();
    this.callEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _slamTime() {
    return Math.max(0.02, settings.ionstorm.slamTime * settings.global.lifetime);
  }

  _standTime() {
    return Math.max(0.1, settings.ionstorm.lifetime * settings.global.lifetime);
  }

  _implodeTime() {
    return Math.max(0.05, settings.ionstorm.implodeTime * settings.global.lifetime);
  }

  get impactDuration() {
    return this._slamTime() + this._standTime() + this._implodeTime();
  }

  get fadeDuration() {
    return Math.max(0.1, settings.ionstorm.fadeTime * settings.global.lifetime);
  }

  /** Lightning does not dim smoothly: a quantised hash strobe. */
  lightShimmer() {
    const s = settings.ionstorm.lightStrobe;
    const k = Math.floor(this.age * 24);
    const h = Math.sin(k * 12.9898 + this._seed) * 43758.5453;
    return 1 - s + s * (h - Math.floor(h)) * 1.3;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._seed = Math.random() * 100;
    this._orbitPhase = Math.random() * TAU;
    this._surge = 0;
    this._slammed = false;
    this._imploded = false;
    this._drop = 0;
    this._implode = 0;
    this._strikeTimer = 0;
    this.moteEmitter.reset();
    this.callEmitter.reset();

    for (let i = 0; i < ION_MAX_BOLTS; i++) this._release(i);
    const strikes = this.groundMaterial.userData.strikes;
    for (let i = 0; i < ION_MAX_BOLTS; i++) strikes[i].set(0, 0, 0, 0);

    this.body.visible = false;
    this.shell.visible = false;
    this.bolts.visible = false;
    this.ground.visible = false;
    this.warp.visible = false;
    this._syncParticles();
  }

  _release(i) {
    const slot = this._slots[i];
    slot.active = false;
    slot.landed = false;
    this.boltMaterial.userData.bolts[i].set(0, 0, 0, 0);
    this.ribbons.clear(i);
  }

  /* ------------------------------------------------------------------ */
  /* Shape helpers                                                       */
  /* ------------------------------------------------------------------ */

  /** Radius of the column's skin at height y — the vertex stage's foot flare. */
  _skinRadius(y) {
    const c = settings.ionstorm;
    return c.pillarRadius * (1 + c.footFlare * Math.exp(-y * 1.8)) * Math.max(0, 1 - this._implode * 0.8);
  }

  _fillShape(c, g, forks) {
    _shape.segments = Math.min(ION_MAIN_POINTS, c.boltSegments);
    _shape.jag = c.boltJag * g.randomness;
    _shape.jagMax = c.boltJagMax;
    _shape.kink = c.boltKink * g.randomness;
    _shape.forks = Math.min(ION_FORKS, forks);
    _shape.forkLength = c.boltForkLength;
    _shape.forkSpread = c.boltForkSpread;
    _shape.forkWidth = c.boltForkWidth;
    _shape.forkBright = c.boltForkBright;
  }

  /** Re-roll an orbiting arc between two points on the skin. */
  _rollOrbit(i, k, count, c, g) {
    const slot = this._slots[i];
    const H = c.pillarHeight;
    const a = this._orbitPhase + (k / count) * TAU;
    const span = c.orbitSpan;
    const y0 = H * lerp(c.orbitLow, c.orbitHigh, slot.heightA);
    const y1 = H * lerp(c.orbitLow, c.orbitHigh, slot.heightB);
    const r0 = this._skinRadius(y0);
    const r1 = this._skinRadius(y1);
    _from.set(_centre.x + Math.cos(a) * r0, y0, _centre.z + Math.sin(a) * r0);
    _to.set(_centre.x + Math.cos(a + span) * r1, y1, _centre.z + Math.sin(a + span) * r1);
    const mid = a + span * 0.5;
    _shape.bulge.set(Math.cos(mid), 0, Math.sin(mid)).multiplyScalar(c.orbitBulge * (1 - this._implode));
    this._fillShape(c, g, 0);
    this.ribbons.build(i, _from, _to, _shape);
  }

  /** Re-roll a strike between its decided endpoints. */
  _rollStrike(i, c, g) {
    const slot = this._slots[i];
    const length = slot.from.distanceTo(slot.to);
    _shape.bulge.set(0, length * c.strikeArch, 0);
    this._fillShape(c, g, c.boltForks);
    this.ribbons.build(i, slot.from, slot.to, _shape);
  }

  /** Decide a new strike: where it leaves the column and where it lands. */
  _launchStrike(c, g) {
    let index = -1;
    for (let i = MAX_ORBITS; i < ION_MAX_BOLTS; i++) {
      if (!this._slots[i].active) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    const slot = this._slots[index];
    const R = c.zoneRadius;

    // Seek a body in the circle, or pick a point in the annulus.
    let seeking = false;
    const field = this.ctx.dummies;
    if (field?.findTargets && Math.random() < c.seekChance) {
      const found = field.findTargets(_centre.x, _centre.z, R * c.strikeOuter, this._targets);
      if (found.length > 0) {
        const dummy = found[(Math.random() * found.length) | 0];
        slot.to.set(dummy.position.x, 0.03, dummy.position.z);
        seeking = true;
      }
      this._targets.length = 0;
    }
    if (!seeking) {
      const ang = Math.random() * TAU;
      // Area-uniform in the annulus.
      const r0 = R * c.strikeInner;
      const r1 = R * Math.max(c.strikeInner, c.strikeOuter);
      const r = Math.sqrt(lerp(r0 * r0, r1 * r1, Math.random()));
      slot.to.set(_centre.x + Math.cos(ang) * r, 0.03, _centre.z + Math.sin(ang) * r);
    }

    _dir.set(slot.to.x - _centre.x, 0, slot.to.z - _centre.z);
    if (_dir.lengthSq() < 1e-6) _dir.set(1, 0, 0);
    _dir.normalize();
    const y = c.pillarHeight * randRange(c.strikeLaunchLow, c.strikeLaunchHigh);
    const r = this._skinRadius(y);
    slot.from.set(_centre.x + _dir.x * r, y, _centre.z + _dir.z * r);

    slot.active = true;
    slot.landed = false;
    slot.age = 0;
    slot.reroll = 0;
    slot.seed = Math.random() * 10;
    slot.life = c.strikeLife * (1 + randRange(-1, 1) * c.lifeJitter * g.randomness);
    this._rollStrike(index, c, g);
  }

  /** A strike reaching the floor: burn, sparks, light — and the kill. */
  _landStrike(index, c, g) {
    const slot = this._slots[index];
    slot.landed = true;
    const at = slot.to;
    const time = frame.uTime.value;

    _pos.set(at.x, 0, at.z);
    this.ctx.decals.spawn(DecalType.ARC, _pos, {
      radius: c.arcDecalRadius,
      life: c.arcDecalLife * g.lifetime,
      intensity: 1,
      colorA: getColor(c.colorArcDecalA),
      colorB: getColor(c.colorArcDecalB),
      height: 0.024
    });

    _emit.position = _pos.set(at.x, 0.1, at.z);
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = c.strikeSparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.sparks.emit(Math.round(c.strikeSparks * g.particleCount), _emit);

    this.ctx.shake.add(c.strikeShake * g.explosionIntensity, 8, 30);
    this.lightBoost = Math.min(this.lightBoost + c.strikeLight * g.explosionIntensity, c.strikeLight * 3);
    this._surge = Math.min(1.5, this._surge + 0.6);

    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(at.x, at.z, c.strikeKillRadius, this._targets);
    this._force.impulse = c.hitImpulse;
    this._force.lift = c.hitLift;
    this._force.spin = c.hitSpin;
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - at.x, 0, dummy.position.z - at.z);
      // Dead centre: thrown away from the column.
      if (_dir.lengthSq() < 1e-4) _dir.set(at.x - _centre.x, 0, at.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = settings.ionstorm;
    const g = settings.global;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, c.sparkGravity, 0);
    this.sparks.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 7;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    this.sparks.uniforms.uTurbulence.value = 0.1 * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, 0, 0);
    this.motes.uniforms.uSwirl.value = c.moteSwirl * g.animationSpeed;
    this.motes.uniforms.uSizeScale.value = c.moteSize * g.particleSize * 7;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = 0.15 * g.turbulence;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    this.dust.uniforms.uGravity.value.set(0, 0.3, 0);
    this.dust.uniforms.uSizeScale.value = c.dustSize * g.particleSize;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = 0.5 * g.opacity;
    this.dust.uniforms.uTurbulence.value = 0.5 * g.turbulence;
  }

  /** Column, corona, floor and warp, resolved for this frame. */
  _shapeColumn(fade, reveal) {
    const c = settings.ionstorm;

    const ps = this._pillarState;
    ps.radius = c.pillarRadius;
    ps.height = c.pillarHeight;
    ps.drop = this._drop;
    ps.implode = this._implode;
    ps.surge = Math.min(1, this._surge) + this._implode;
    ps.fade = fade * (this._imploded ? 0 : 1);
    this.bodyMaterial.userData.sync(ps);
    this.shellMaterial.userData.sync(ps);
    this.body.position.copy(_centre);
    this.shell.position.copy(_centre);
    this.body.visible = !this._imploded && this._drop > 0.001;
    this.shell.visible = this.body.visible;

    const gs = this._groundState;
    gs.radius = Math.max(0.2, c.zoneRadius);
    gs.poolRadius = c.poolRadius * (1 - this._implode * 0.6);
    gs.quadSize = (gs.radius + c.strikeFlare + 1) * 2;
    gs.reveal = reveal;
    gs.fade = fade;
    gs.surge = Math.min(1, this._surge);
    gs.seed = this._seed;
    this.groundMaterial.userData.sync(gs);
    this.ground.position.set(_centre.x, 0.04, _centre.z);
    this.ground.scale.set(gs.quadSize, 1, gs.quadSize);
    this.ground.visible = true;

    const ws = this._warpState;
    ws.width = c.pillarRadius * c.warpWidth * 2;
    ws.height = Math.max(0.5, c.pillarHeight * c.warpHeight);
    ws.skin = c.warpSkin;
    ws.strength = this._drop * (1 - this._implode) * fade * (this._imploded ? 0 : 1);
    ws.seed = this._seed;
    this.warpMaterial.userData.sync(ws);
    this.warp.position.set(_centre.x, 0, _centre.z);
    this.warp.visible = ws.strength > 0.001;

    this.boltMaterial.userData.sync();
    this.bolts.visible = true;
  }

  /** Orbiting arcs: placed by phase, re-rolled on their own short clock. */
  _updateOrbits(dt, level) {
    const c = settings.ionstorm;
    const g = settings.global;
    const count = Math.max(0, Math.min(MAX_ORBITS, Math.round(c.orbitCount)));
    const envelopes = this.boltMaterial.userData.bolts;
    this._orbitPhase += c.orbitSpeed * dt * g.animationSpeed;

    for (let k = 0; k < MAX_ORBITS; k++) {
      const slot = this._slots[k];
      if (k >= count || level <= 0.001) {
        if (slot.active) this._release(k);
        continue;
      }
      if (!slot.active) {
        slot.active = true;
        slot.seed = Math.random() * 10;
        slot.heightA = Math.random();
        slot.heightB = Math.random();
        slot.reroll = 0;
      }
      slot.reroll -= dt;
      if (slot.reroll <= 0) {
        slot.reroll = Math.max(0.016, c.orbitReroll);
        slot.heightA = saturate(slot.heightA + randRange(-0.25, 0.25));
        slot.heightB = saturate(slot.heightB + randRange(-0.25, 0.25));
        slot.seed = Math.random() * 10;
        this._rollOrbit(k, k, count, c, g);
      }
      envelopes[k].set(c.orbitLevel * level, 1.2, this._implode * 0.8, slot.seed);
    }
  }

  /** Strikes: launched on a rate, grow to the floor, land, hang, crackle out. */
  _updateStrikes(dt, launching) {
    const c = settings.ionstorm;
    const g = settings.global;
    const envelopes = this.boltMaterial.userData.bolts;
    const flares = this.groundMaterial.userData.strikes;
    const growTime = Math.max(0.01, c.strikeGrowTime);

    if (launching && c.strikeRate > 0) {
      this._strikeTimer -= dt;
      if (this._strikeTimer <= 0) {
        // Poisson-ish: the gap is exponential about the mean, so it never ticks.
        const mean = 1 / c.strikeRate;
        this._strikeTimer = -Math.log(1 - Math.random() * 0.95) * mean * lerp(1, 0.6, g.randomness) + mean * 0.15;
        this._launchStrike(c, g);
      }
    }

    for (let i = MAX_ORBITS; i < ION_MAX_BOLTS; i++) {
      const slot = this._slots[i];
      const flare = flares[i];
      if (!slot.active) {
        // The floor flare outlives the bolt; it cools on its own.
        if (flare.z > 0) flare.z = Math.max(0, flare.z - dt / Math.max(0.05, c.strikeFlareLife));
        continue;
      }
      slot.age += dt;
      const grow = saturate(slot.age / growTime);
      if (!slot.landed && grow >= 1) {
        this._landStrike(i, c, g);
        flare.set(slot.to.x - _centre.x, slot.to.z - _centre.z, 1, c.strikeFlare);
      }
      if (slot.landed) {
        flare.z = Math.max(0, flare.z - dt / Math.max(0.05, c.strikeFlareLife));
        flare.w = c.strikeFlare;
        // While it hangs it keeps crackling: a few fresh shapes, same endpoints.
        slot.reroll -= dt;
        if (slot.reroll <= 0) {
          slot.reroll = Math.max(0.016, c.strikeReroll);
          this._rollStrike(i, c, g);
        }
      }
      const life = Math.max(0.05, slot.life);
      const t = saturate((slot.age - growTime) / life);
      const level = slot.landed ? 1 - Easing.inQuad(t) : 1;
      const brk = slot.landed ? Easing.inQuad(t) * 0.9 : 0;
      envelopes[i].set(level, grow * 1.25, brk, slot.seed);
      if (slot.landed && t >= 1) this._release(i);
    }
  }

  _moteFx(dt, strength) {
    const c = settings.ionstorm;
    const g = settings.global;
    const count = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (count <= 0) return;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const y = Math.random() * c.pillarHeight * 0.35;
      const r = this._skinRadius(y) * randRange(1.2, 2.2);
      _emit.position = _pos.set(_centre.x + Math.cos(a) * r, y, _centre.z + Math.sin(a) * r);
      _emit.anchor = _from.set(_centre.x, y, _centre.z);
      _emit.radius = 0;
      _emit.direction = _up;
      _emit.speed = c.moteRise;
      _emit.speedVariance = 0.4;
      _emit.spread = 0;
      _emit.inherit = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(1, _emit);
    }
    _emit.anchor = null;
  }

  _slamFx() {
    const c = settings.ionstorm;
    const g = settings.global;
    this._slammed = true;

    this.ctx.bursts.spawn(BurstMode.AIR, _pos.set(_centre.x, 0.4, _centre.z), {
      radius: c.pillarRadius,
      endRadius: c.slamBurstSize * g.explosionIntensity,
      life: c.slamBurstLife,
      intensity: 1.6,
      opacity: 0.8 * g.opacity,
      squash: 0.4,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.slamRingRadius * g.explosionIntensity,
      life: 0.5,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorRing),
      colorB: getColor(c.colorBurstA),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.slamRingRadius * 0.6,
      life: 1.1,
      growth: 0.6,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustB),
      height: 0.026
    });

    _emit.position = _pos.set(_centre.x, 0.2, _centre.z);
    _emit.radius = c.pillarRadius * 1.5;
    _emit.direction = _up;
    _emit.speed = 3.5;
    _emit.speedVariance = 0.5;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 1.0;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.dust.emit(Math.round(c.dustCount * g.particleCount), _emit);

    _emit.speed = c.strikeSparkSpeed * 1.3;
    _emit.size = 0.08;
    _emit.life = c.sparkLifetime;
    _emit.spin = 0;
    this.sparks.emit(Math.round(c.strikeSparks * 2 * g.particleCount), _emit);

    this.ctx.shake.add(c.slamShake * g.explosionIntensity, 4, 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * g.explosionIntensity);
    this.lightBoost = c.slamLight * g.explosionIntensity;
    this._surge = 1.2;
  }

  _implodeFx() {
    const c = settings.ionstorm;
    const g = settings.global;
    this._imploded = true;
    const y = c.pillarHeight * 0.18;

    this.ctx.bursts.spawn(BurstMode.STORM, _pos.set(_centre.x, y, _centre.z), {
      radius: 0.2,
      endRadius: c.implodeBurstSize * g.explosionIntensity,
      life: c.implodeBurstLife,
      intensity: c.implodeBurstIntensity,
      opacity: g.opacity,
      fresnel: 1.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.implodeRingRadius * g.explosionIntensity,
      life: 0.6,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorRing),
      colorB: getColor(c.colorBurstA),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.ARC, _centre, {
      radius: c.poolRadius * 2,
      life: c.arcDecalLife * 1.5 * g.lifetime,
      intensity: 1,
      colorA: getColor(c.colorArcDecalA),
      colorB: getColor(c.colorArcDecalB),
      height: 0.024
    });

    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.implodeSparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.09;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime * 1.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(c.implodeSparks * g.particleCount), _emit);

    this.ctx.shake.add(c.implodeShake * g.explosionIntensity, 3.5, 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.implodeFlash * g.explosionIntensity);
    this.lightBoost = c.implodeLight * g.explosionIntensity;

    for (let i = 0; i < ION_MAX_BOLTS; i++) {
      // Hanging strikes die with the column; their floor flares cool on.
      if (this._slots[i].active) this._release(i);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.ionstorm;
    const g = settings.global;
    this._syncParticles();

    // The charge skates along the floor, spitting sparks, the light riding it.
    this.position.y = 0.4;
    const count = Math.round(this.callEmitter.tick(dt, c.callSparks) * g.particleCount);
    if (count > 0) {
      _emit.position = _pos.copy(this.position).setY(0.1);
      _emit.radius = 0.2;
      _emit.direction = _dir.copy(this.direction).negate().setY(0.8).normalize();
      _emit.speed = 3.5;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.7;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.07;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sparkLifetime;
      _emit.lifeVariance = 0.5;
      _emit.spin = 0;
      // The charge is tinted by the accent pair, alternating hot and cold.
      _emit.tint = getColor(Math.random() < 0.5 ? c.colorA : c.colorB);
      _emit.time = frame.uTime.value;
      this.sparks.emit(count, _emit);
      _emit.tint = null;
    }
  }

  onImpact() {
    this._clock = 0;
    this.pointAt(1, _centre);
  }

  onFade(dt) {
    const c = settings.ionstorm;
    const g = settings.global;
    this._syncParticles();
    this.pointAt(1, _centre);

    const slam = this._slamTime();
    const stand = this._standTime();
    const implodeTime = this._implodeTime();
    const implodeAt = slam + stand;

    this._clock = this.phase === AbilityPhase.IMPACT ? this.impactTime : this.impactDuration + this.fadeTime;
    const clock = this._clock;

    // Comes down hard: accelerating, so it *lands* rather than arrives.
    this._drop = Easing.inQuad(saturate(clock / slam));
    if (!this._slammed && clock >= slam) this._slamFx();
    this._implode = Easing.inCubic(saturate((clock - implodeAt) / implodeTime));
    if (!this._imploded && clock >= implodeAt + implodeTime) this._implodeFx();

    let fade = 1;
    if (this.phase === AbilityPhase.FADE) fade = 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration));
    const reveal = Easing.outCubic(saturate(clock / Math.max(0.02, c.revealTime)));

    this._surge = Math.max(0, this._surge - this._surge * 5 * dt - 0.2 * dt);

    this._shapeColumn(fade, reveal);

    const standing = this._slammed && !this._imploded;
    const level = standing ? 1 - this._implode * 0.5 : 0;
    this._updateOrbits(dt, level);
    this._updateStrikes(dt, standing && this._implode <= 0);

    if (standing) {
      this._moteFx(dt, 1 - this._implode);
      this.ctx.shake.rumble((c.standRumble + this._implode * 0.15) * g.explosionIntensity, dt);
    }

    this.position.set(_centre.x, c.lightHeight * (1 - this._implode * 0.5), _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    for (let i = 0; i < ION_MAX_BOLTS; i++) this._release(i);
    const strikes = this.groundMaterial.userData.strikes;
    for (let i = 0; i < ION_MAX_BOLTS; i++) strikes[i].set(0, 0, 0, 0);
    this.body.visible = false;
    this.shell.visible = false;
    this.bolts.visible = false;
    this.ground.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    this.pillarGeometry.dispose();
    this.bodyMaterial.dispose();
    this.shellMaterial.dispose();
    this.ribbons.dispose();
    this.boltMaterial.dispose();
    this.groundGeometry.dispose();
    this.groundMaterial.dispose();
    this.warpGeometry.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('ϟ  Ion Storm Pillar');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'charge speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'callSparks', 0, 800, 1, 'charge sparks / s');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'slamTime', 0.02, 1.5, 0.01, 'slams down over');
  R(time, c, 'lifetime', 0.1, 10, 0.05, 'stands for');
  R(time, c, 'implodeTime', 0.05, 2, 0.01, 'implodes over');
  R(time, c, 'fadeTime', 0.1, 5, 0.05, 'fade out');

  const col = folder.addFolder('1 · The column');
  R(col, c, 'pillarRadius', 0.05, 3, 0.01, 'radius (m)');
  R(col, c, 'pillarHeight', 1, 40, 0.1, 'height (m)');
  R(col, c, 'footFlare', 0, 3, 0.01, 'foot flare');
  R(col, c, 'writhe', 0, 0.6, 0.005, 'writhe');
  R(col, c, 'writheScale', 0.1, 6, 0.05, 'writhe scale');
  R(col, c, 'writheSpeed', 0, 10, 0.05, 'writhe speed');
  R(col, c, 'kink', 0, 2, 0.01, 'axis wander (m)');
  R(col, c, 'topFade', 0.01, 1, 0.01, 'top fade');
  R(col, c, 'pillarSoftFade', 0.01, 2, 0.01, 'soft fade (m)');

  const plasma = col.addFolder('Plasma');
  R(plasma, c, 'pillarIntensity', 0, 10, 0.05, 'intensity');
  R(plasma, c, 'pillarOpacity', 0, 1, 0.01, 'opacity');
  R(plasma, c, 'coreSharpness', 0.3, 12, 0.05, 'core sharpness');
  R(plasma, c, 'coreGlow', 0, 8, 0.05, 'core glow');
  R(plasma, c, 'bandDensity', 0, 4, 0.01, 'bands / m');
  R(plasma, c, 'bandSpeed', -30, 30, 0.1, 'band speed (m/s)');
  R(plasma, c, 'bandSharpness', 0.5, 20, 0.1, 'band sharpness');
  R(plasma, c, 'bandGlow', 0, 6, 0.05, 'band glow');
  R(plasma, c, 'plasmaNoise', 0, 2, 0.01, 'turbulence');
  R(plasma, c, 'plasmaNoiseScale', 0.1, 6, 0.05, 'turbulence scale');
  R(plasma, c, 'plasmaNoiseSpeed', 0, 10, 0.05, 'turbulence speed');
  R(plasma, c, 'fresnel', 0, 5, 0.05, 'fresnel');
  R(plasma, c, 'fresnelPower', 0.3, 8, 0.05, 'fresnel power');
  plasma.addColor(c, 'colorCore').name('hot core');
  plasma.addColor(c, 'colorBand').name('bands');
  plasma.addColor(c, 'colorEdge').name('edges');

  const shell = folder.addFolder('2 · Corona');
  R(shell, c, 'shellScale', 1, 5, 0.01, 'size (× radius)');
  R(shell, c, 'shellIntensity', 0, 8, 0.05, 'intensity');
  R(shell, c, 'shellOpacity', 0, 1, 0.01, 'opacity');

  const orbit = folder.addFolder('3 · Orbiting arcs');
  R(orbit, c, 'orbitCount', 0, MAX_ORBITS, 1, 'arcs');
  R(orbit, c, 'orbitSpeed', -10, 10, 0.05, 'wheel (rad/s)');
  R(orbit, c, 'orbitSpan', 0.1, 4, 0.01, 'span (rad)');
  R(orbit, c, 'orbitBulge', 0, 4, 0.01, 'bow out (m)');
  R(orbit, c, 'orbitLow', 0, 1, 0.01, 'lowest (× height)');
  R(orbit, c, 'orbitHigh', 0, 1, 0.01, 'highest (× height)');
  R(orbit, c, 'orbitReroll', 0.016, 0.5, 0.002, 're-roll every (s)');
  R(orbit, c, 'orbitLevel', 0, 2, 0.01, 'brightness');

  const strike = folder.addFolder('4 · Strikes');
  R(strike, c, 'strikeRate', 0, 20, 0.05, 'strikes / s');
  R(strike, c, 'strikeInner', 0, 1, 0.01, 'nearest (× circle)');
  R(strike, c, 'strikeOuter', 0.1, 1.5, 0.01, 'farthest (× circle)');
  R(strike, c, 'strikeLaunchLow', 0, 1, 0.01, 'leaves from (× height)');
  R(strike, c, 'strikeLaunchHigh', 0, 1, 0.01, 'leaves up to (× height)');
  R(strike, c, 'strikeArch', -0.5, 1, 0.01, 'arch (× length)');
  R(strike, c, 'strikeGrowTime', 0.01, 0.5, 0.005, 'races down over (s)');
  R(strike, c, 'strikeLife', 0.05, 2, 0.01, 'hangs for (s)');
  R(strike, c, 'strikeReroll', 0.016, 0.3, 0.002, 're-roll every (s)');
  R(strike, c, 'seekChance', 0, 1, 0.01, 'seeks a body');
  R(strike, c, 'lifeJitter', 0, 1, 0.01, 'life jitter');

  const land = strike.addFolder('Landing');
  R(land, c, 'strikeKillRadius', 0, 4, 0.05, 'kill radius (m)');
  R(land, c, 'arcDecalRadius', 0.1, 4, 0.05, 'burn radius (m)');
  R(land, c, 'arcDecalLife', 0.1, 6, 0.05, 'burn life');
  land.addColor(c, 'colorArcDecalA').name('burn');
  land.addColor(c, 'colorArcDecalB').name('burn, hot');
  R(land, c, 'strikeSparks', 0, 200, 1, 'sparks');
  R(land, c, 'strikeSparkSpeed', 0, 25, 0.1, 'spark speed');
  R(land, c, 'strikeFlare', 0.1, 4, 0.05, 'floor flare (m)');
  R(land, c, 'strikeFlareLife', 0.05, 3, 0.01, 'flare cools over');
  R(land, c, 'strikeShake', 0, 0.6, 0.005, 'shake');
  R(land, c, 'strikeLight', 0, 40, 0.5, 'light punch');
  R(land, c, 'hitImpulse', 0, 20, 0.1, 'impulse');
  R(land, c, 'hitLift', 0, 15, 0.1, 'lift');
  R(land, c, 'hitSpin', 0, 6, 0.05, 'spin');

  const bolt = folder.addFolder('5 · Bolt shape & shader');
  R(bolt, c, 'boltSegments', 3, ION_MAIN_POINTS, 1, 'points');
  R(bolt, c, 'boltJag', 0, 0.5, 0.005, 'jag (× length)');
  R(bolt, c, 'boltJagMax', 0, 4, 0.05, 'jag cap (m)');
  R(bolt, c, 'boltKink', 0, 1, 0.01, 'kink');
  R(bolt, c, 'boltForks', 0, ION_FORKS, 1, 'forks');
  R(bolt, c, 'boltForkLength', 0, 1, 0.01, 'fork length');
  R(bolt, c, 'boltForkSpread', 0, 1.5, 0.01, 'fork spread (rad)');
  R(bolt, c, 'boltForkWidth', 0, 1, 0.01, 'fork width');
  R(bolt, c, 'boltForkBright', 0, 1.5, 0.01, 'fork brightness');
  R(bolt, c, 'boltWidth', 0.02, 1.5, 0.005, 'glow width (m)');
  R(bolt, c, 'boltCoreWidth', 0.002, 0.2, 0.001, 'core width (m)');
  R(bolt, c, 'boltFalloff', 0.3, 8, 0.05, 'glow falloff');
  R(bolt, c, 'boltHeadLength', 0.01, 0.5, 0.005, 'head length');
  R(bolt, c, 'boltHeadGlow', 0, 8, 0.05, 'head glow');
  R(bolt, c, 'boltIntensity', 0, 15, 0.05, 'intensity');
  R(bolt, c, 'boltOpacity', 0, 1, 0.01, 'opacity');
  R(bolt, c, 'boltFlicker', 0, 1, 0.01, 'flicker');
  R(bolt, c, 'boltFlickerRate', 0, 60, 0.5, 'flicker rate');
  R(bolt, c, 'boltCrackle', 1, 60, 0.5, 'crackle pieces');
  R(bolt, c, 'boltCrawl', 0, 2, 0.01, 'plasma crawl');
  R(bolt, c, 'boltCrawlScale', 0.5, 40, 0.1, 'crawl scale');
  R(bolt, c, 'boltCrawlSpeed', 0, 30, 0.1, 'crawl speed');
  bolt.addColor(c, 'colorBoltCore').name('core');
  bolt.addColor(c, 'colorBoltGlow').name('glow');
  bolt.addColor(c, 'colorBoltEdge').name('edge');

  const sparks = folder.addFolder('6 · Sparks & motes');
  R(sparks, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(sparks, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(sparks, c, 'sparkGravity', -30, 5, 0.1, 'spark gravity');
  R(sparks, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  R(sparks, c, 'sparkGlow', 0, 8, 0.05, 'spark glow');
  Editor.gradient(sparks, c, 'colorSpark', 'spark colour');
  R(sparks, c, 'moteRate', 0, 400, 1, 'motes / s');
  R(sparks, c, 'moteSize', 0.01, 0.3, 0.005, 'mote size');
  R(sparks, c, 'moteRise', 0, 10, 0.05, 'mote rise (m/s)');
  R(sparks, c, 'moteSwirl', -10, 10, 0.05, 'mote swirl (rad/s)');
  R(sparks, c, 'moteLifetime', 0.1, 5, 0.05, 'mote lifetime');
  R(sparks, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(sparks, c, 'colorMote', 'mote colour');

  const ground = folder.addFolder('7 · Ionised floor');
  R(ground, c, 'groundOpacity', 0, 1, 0.01, 'opacity');
  R(ground, c, 'revealTime', 0.02, 2, 0.01, 'ring draws on over');
  R(ground, c, 'poolRadius', 0, 4, 0.05, 'base pool (m)');
  R(ground, c, 'poolGlow', 0, 8, 0.05, 'pool glow');
  R(ground, c, 'ringWidth', 0.005, 0.4, 0.005, 'ring width (m)');
  R(ground, c, 'ringGlow', 0, 8, 0.05, 'ring glow');
  R(ground, c, 'arcGlow', 0, 8, 0.05, 'crawling arcs');
  R(ground, c, 'arcScale', 0.2, 8, 0.05, 'arc scale');
  R(ground, c, 'arcSharpness', 1, 40, 0.5, 'arc thinness');
  R(ground, c, 'arcSpeed', -4, 4, 0.01, 'arc race');
  R(ground, c, 'arcDensity', 0, 1, 0.01, 'arc coverage');
  R(ground, c, 'strikeGlow', 0, 10, 0.05, 'strike flare glow');
  ground.addColor(c, 'colorRing').name('ring');
  ground.addColor(c, 'colorArc').name('arcs');

  const slam = folder.addFolder('8 · Slam');
  R(slam, c, 'slamBurstSize', 0.2, 10, 0.05, 'shell (m)');
  R(slam, c, 'slamBurstLife', 0.05, 2, 0.01, 'shell life');
  R(slam, c, 'slamRingRadius', 0.5, 16, 0.05, 'shock ring (m)');
  R(slam, c, 'slamShake', 0, 1.5, 0.01, 'shake');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'flash');
  R(slam, c, 'slamLight', 0, 80, 0.5, 'light punch');
  R(slam, c, 'dustCount', 0, 120, 1, 'dust');
  R(slam, c, 'dustSize', 0.1, 4, 0.05, 'dust size');
  R(slam, c, 'dustLifetime', 0.1, 4, 0.05, 'dust lifetime');
  Editor.gradient(slam, c, 'colorDust', 'dust colour');
  R(slam, c, 'standRumble', 0, 0.3, 0.005, 'rumble while it stands');

  const imp = folder.addFolder('9 · Implosion');
  R(imp, c, 'implodeBurstSize', 0.2, 12, 0.05, 'storm shell (m)');
  R(imp, c, 'implodeBurstLife', 0.05, 2, 0.01, 'shell life');
  R(imp, c, 'implodeBurstIntensity', 0, 8, 0.05, 'shell intensity');
  R(imp, c, 'implodeRingRadius', 0.5, 16, 0.05, 'shock ring (m)');
  R(imp, c, 'implodeSparks', 0, 600, 1, 'sparks');
  R(imp, c, 'implodeSparkSpeed', 0, 30, 0.1, 'spark speed');
  R(imp, c, 'implodeShake', 0, 1.5, 0.01, 'shake');
  R(imp, c, 'implodeFlash', 0, 1, 0.01, 'flash');
  R(imp, c, 'implodeLight', 0, 100, 0.5, 'light punch');
  imp.addColor(c, 'colorBurstA').name('shell core');
  imp.addColor(c, 'colorBurstB').name('shell body');
  imp.addColor(c, 'colorBurstC').name('shell edge');
  imp.addColor(c, 'colorFlash').name('flash');

  const warp = folder.addFolder('10 · Warp');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpWidth', 0.5, 8, 0.05, 'width (× radius)');
  R(warp, c, 'warpHeight', 0.05, 1.2, 0.01, 'height (× column)');
  R(warp, c, 'warpSkin', 0, 1, 0.01, 'bends hardest at');
  R(warp, c, 'warpScale', 0.1, 6, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 8, 0.05, 'noise speed');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 10, 0.05, 'height (m)');
  R(light, c, 'lightStrobe', 0, 1, 0.01, 'strobe');
}
