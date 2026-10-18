import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createNeedleGeometry,
  createDiscGeometry,
  createTubeGeometry,
  createStripGeometry,
  createQuadGeometry
} from '../../assets/codex/EclipseNeedleGeometry.js';
import {
  createNeedleMaterial,
  createMoonMaterial,
  createCoronaMaterial,
  createLensMaterial,
  createStrandMaterial,
  createWakeMaterial,
  createStainMaterial
} from '../../materials/codex/EclipseNeedleMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'eclipseneedle';

const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _rad = new Vector3();
const _upv = new Vector3();
const _floor = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * ECLIPSE NEEDLE — a needle with an eclipse at its point, drilled down the
 * line, leaving darkness hanging in the air behind it.
 *
 * A line cast in four beats. In front of the caster's hand an **eclipse
 * forms** — a disc of pure black with a hair of white light round its limb
 * and a violet corona flickering off it — and behind it a black needle draws
 * itself out. Then it **drills**: the needle runs the line point-first,
 * spinning, its rifling glowing and turning, two bright strands winding in a
 * helix behind the point, sparks spiralling off it — and behind it hangs a
 * **wake**: a tube of darkness in the air, violet-skinned, with its shadow
 * lying on the floor beneath. At the target it reaches **totality**: the
 * corona flares wide, the *diamond ring* — the one bead of light on the limb
 * — blazes, the air rings and bends round the black disc. Then the needle
 * crumbles, the eclipse closes, and the wake **collapses** from the caster
 * outward and its shadow erodes.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the needle** (`createNeedleMaterial`) — a lathed spindle; rifling that
 *      turns with an integrated spin phase.
 *   2. **the eclipse** — a black sphere with a fresnel limb, and a corona
 *      billboard behind it (ring, flickering streamers, diamond ring); its
 *      lens on `LAYER.DISTORTION`.
 *   3. **the drill strands** — two helices laid out in the vertex stage.
 *   4. **the wake** — a dark translucent tube from the hand to the point, and
 *      its stain on the floor.
 *   5. **smoke & sparks** — black smoke shed along the wake (non-additive),
 *      violet streaks spiralling off the point.
 *   6. **totality** — the corona's flare, the bead's blaze, an AIR shell,
 *      SHOCKWAVE + ARC on the floor, flash, shake, light.
 *
 * Hits are the line's: a body goes down when the point reaches it.
 */
export class EclipseNeedleAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.needleGeometry = createNeedleGeometry(64, 20);
    this.discGeometry = createDiscGeometry();
    this.tubeGeometry = createTubeGeometry(120, 10);
    this.wakeGeometry = createTubeGeometry(160, 14);
    this.stripGeometry = createStripGeometry(180, 6);
    this.quadGeometry = createQuadGeometry();

    this.stainMaterial = createStainMaterial();
    this.stain = this._mesh(this.stripGeometry, this.stainMaterial, LAYER.VFX, 2);

    this.needleMaterial = createNeedleMaterial();
    this.needle = this._mesh(this.needleGeometry, this.needleMaterial, LAYER.VFX, 6);
    this.needle.matrixAutoUpdate = false;
    this.moonMaterial = createMoonMaterial();
    this.moon = this._mesh(this.discGeometry, this.moonMaterial, LAYER.VFX, 6);

    this.wakeMaterial = createWakeMaterial();
    this.wake = this._mesh(this.wakeGeometry, this.wakeMaterial, LAYER.VFX, 9);

    this.strandMaterials = [createStrandMaterial(0), createStrandMaterial(Math.PI)];
    this.strands = this.strandMaterials.map((m) => this._mesh(this.tubeGeometry, m, LAYER.VFX, 12));

    this.coronaMaterial = createCoronaMaterial();
    this.corona = this._mesh(this.quadGeometry, this.coronaMaterial, LAYER.VFX, 14);
    this.lensMaterial = createLensMaterial();
    this.lens = this._mesh(this.quadGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    this._head = new Vector3();
    this._start = new Vector3();
    this._needleState = { spin: 0, dissolve: 0, seed: 0 };
    this._coronaState = { center: this._head, size: 1, moon: 0.3, intensity: 0, bead: 1, beadAngle: 0, seed: 0 };
    this._lensState = { center: this._head, size: 1, moon: 0.3, strength: 0 };
    this._strandState = { head: this._head, dir: new Vector3(), side: new Vector3(), spin: 0, reach: 0, fade: 1 };
    this._wakeState = { start: this._start, head: this._head, side: new Vector3(), collapse: 0, flow: 0, seed: 0, fade: 1 };
    this._stainState = { start: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, cutEnd: 0, erode: 0, seed: 0 };

    this._seed = 0;
    this._spin = 0;
    this._bead = 0;
    this._form = 0;
    this._close = 0;
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
    this.smoke = particles.get('eclipseneedle.smoke', {
      capacity: 1400,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.8
    });
    this.smoke.uniforms.uSizeIn.value = 0.25;
    this.smoke.uniforms.uFadeIn.value = 0.15;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 1.8;
    this.smoke.uniforms.uDrag.value = 1.8;

    this.sparks = particles.get('eclipseneedle.sparks', {
      capacity: 1800,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.4;

    this.smokeEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.1, settings[ID].totalityTime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 15.1) * Math.sin(this.age * 5.7 + 0.3));
  }

  /** The eclipse forms at the hand before the needle flies. */
  advance(dt) {
    if (this.age < settings[ID].chargeTime * settings.global.lifetime) return false;
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Placement                                                           */
  /* ------------------------------------------------------------------ */

  _handPoint(out) {
    const c = settings[ID];
    return out.copy(this.origin).addScaledVector(this.direction, c.handForward).setY(c.handHeight);
  }

  /** Where the point is when the needle is `u` down the line. */
  _headAt(u, out) {
    const c = settings[ID];
    const start = Math.min(c.handForward, this.length * 0.5);
    out.copy(this.origin).addScaledVector(this.direction, lerp(start, this.length, u));
    out.y = lerp(c.handHeight, c.flightHeight, smoothstep(0, 0.25, u));
    return out;
  }

  /** Point at `head`, tail behind it along the line, `grow` 0..1 of its length. */
  _placeNeedle(grow) {
    const c = settings[ID];
    const m = this.needle.matrix;
    // Local +Y is the point's heading; −Y runs back to the tail.
    _upv.crossVectors(this.side, this.direction);
    m.makeBasis(this.side, this.direction, _upv);
    m.scale(_pos.set(c.needleRadius, c.needleLength * Math.max(0.02, grow), c.needleRadius));
    // The point sits just inside the moon.
    _pos.copy(this._head).addScaledVector(this.direction, -c.moonRadius * 0.4);
    m.setPosition(_pos);
    this.needle.matrixWorldNeedsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.smokeEmitter.reset();
    this.sparkEmitter.reset();
    this._seed = Math.random() * 100;
    this._spin = 0;
    this._bead = Math.random() * TAU;
    this._form = 0;
    this._close = 0;

    this._handPoint(this._start);
    this._head.copy(this._start);

    this._needleState.seed = this._seed;
    this._needleState.dissolve = 0;
    this._coronaState.seed = this._seed;
    this._wakeState.seed = this._seed;
    this._wakeState.collapse = 0;
    this._wakeState.flow = 0;
    this._wakeState.fade = 1;
    this._wakeState.side.copy(this.side);
    this._strandState.dir.copy(this.direction);
    this._strandState.side.copy(this.side);
    this._strandState.reach = 0;
    this._strandState.fade = 1;
    const ss = this._stainState;
    ss.seed = this._seed;
    ss.erode = 0;
    ss.cutEnd = 0;
    ss.dir.copy(this.direction);
    ss.side.copy(this.side);

    this.needle.visible = true;
    this.moon.visible = true;
    this.corona.visible = true;
    this.lens.visible = true;
    this.wake.visible = false;
    this.stain.visible = true;
    for (const s of this.strands) s.visible = false;
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

  /** Push everything to the GPU. `flare` 0..1 is totality. */
  _syncAll(flare) {
    const c = settings[ID];
    const g = settings.global;
    const moonR = c.moonRadius * Easing.outBack(this._form) * (1 - smoothstep(0.55, 1, this._close));
    this.moon.scale.setScalar(Math.max(0.001, moonR));
    this.moon.position.copy(this._head);
    this.moon.updateMatrix();
    this.moon.matrixWorldNeedsUpdate = true;
    this.moonMaterial.userData.sync();

    this._needleState.spin = this._spin;
    this.needleMaterial.userData.sync(this._needleState);

    const cs = this._coronaState;
    cs.size = lerp(c.coronaSize, c.coronaFlare, Easing.outCubic(flare)) * this._form;
    cs.moon = moonR;
    cs.beadAngle = this._bead;
    this.coronaMaterial.userData.sync(cs);
    const ls = this._lensState;
    ls.size = cs.size * 1.2;
    ls.moon = moonR;
    this.lensMaterial.userData.sync(ls);

    this._strandState.spin = this._spin * TAU;
    for (const m of this.strandMaterials) m.userData.sync(this._strandState);
    this.wakeMaterial.userData.sync(this._wakeState);

    const ss = this._stainState;
    ss.start.copy(this._start).setY(0);
    ss.length = Math.max(0.2, this.length - Math.min(c.handForward, this.length * 0.5) + 0.5);
    this.stainMaterial.userData.sync(ss);

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const s = this.smoke.uniforms;
    s.uGravity.value.set(0, 0.25, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = c.smokeOpacity * g.opacity;
    s.uTurbulence.value = 0.7 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const k = this.sparks.uniforms;
    k.uGravity.value.set(0, -c.sparkGravity, 0);
    k.uStretch.value = c.sparkStretch;
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.sparkGlow * g.glow;
    k.uTurbulence.value = 0.2 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the charge and the drill                                   */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    const chargeT = Math.max(0.01, c.chargeTime * g.lifetime);
    this._form = saturate(this.age / chargeT);
    this._close = 0;
    const flying = this.age >= chargeT;

    this._spin += c.spinRate * dt * g.animationSpeed * (flying ? 1 : 0.35);
    this._bead += c.beadSpin * TAU * dt * g.animationSpeed;
    this._wakeState.flow += c.wakeFlow * dt * g.noiseSpeed;

    this._headAt(this.u, this._head);
    this._placeNeedle(Easing.outCubic(this._form));

    const cs = this._coronaState;
    cs.intensity = Easing.outCubic(this._form);
    cs.bead = c.beadGlow * (0.6 + 0.4 * Math.sin(this.age * 9));
    this._lensState.strength = this._form;

    const reach = this._head.distanceTo(this._start);
    this._strandState.reach = reach;
    this._strandState.fade = flying ? 1 : 0;
    for (const s of this.strands) s.visible = flying && reach > 0.2;
    this.wake.visible = flying && reach > 0.3;
    this._stainState.cutEnd = Math.max(0, reach);

    this._syncAll(0);
    if (flying) this._drillFx(dt, reach);
    else this._chargeFx(dt);

    this.position.copy(this._head);
    this.ctx.shake.rumble(flying ? 0.05 : 0.02, dt);
  }

  /** While it forms: dark smoke drawn in to the hand. */
  _chargeFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * 0.8) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.smokeSize * 0.7;
    _emit.life = 0.4;
    _emit.speed = 2.6;
    _emit.spread = 0.1;
    for (let i = 0; i < n; i++) {
      _dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      _pos.copy(this._head).addScaledVector(_dir, 1.1);
      _dir.negate();
      _emit.position = _pos;
      _emit.direction = _dir;
      this.smoke.emit(1, _emit);
    }
  }

  /** Black smoke along the wake; sparks spiralling off the point. */
  _drillFx(dt, reach) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const nS = Math.round(this.smokeEmitter.tick(dt, c.smokeRate) * g.particleCount);
    if (nS > 0) {
      this._resetEmit(time);
      _emit.size = c.smokeSize;
      _emit.life = c.smokeLife;
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.spin = 0.5;
      for (let i = 0; i < nS; i++) {
        // Thickest just behind the point.
        const back = Math.pow(Math.random(), 1.8) * Math.min(reach, 6);
        _pos.copy(this._head).addScaledVector(this.direction, -back);
        _pos.y += (Math.random() - 0.5) * c.wakeRadius;
        _emit.position = _pos;
        _emit.radius = c.wakeRadius * 0.5;
        this.smoke.emit(1, _emit);
      }
    }
    const nK = Math.round(this.sparkEmitter.tick(dt, c.sparkRate) * g.particleCount);
    if (nK > 0) {
      this._resetEmit(time);
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      _emit.speed = c.sparkSpeed;
      _emit.spread = 0.15;
      _upv.crossVectors(this.side, this.direction);
      for (let i = 0; i < nK; i++) {
        // Off the rifling, tangent to the spin, and back.
        const a = this._spin * TAU + Math.random() * TAU;
        _rad.copy(this.side).multiplyScalar(Math.cos(a)).addScaledVector(_upv, Math.sin(a));
        _pos.copy(this._head).addScaledVector(this.direction, -c.moonRadius - Math.random() * 0.6).addScaledVector(_rad, c.needleRadius * 2);
        _dir.copy(this.side).multiplyScalar(-Math.sin(a)).addScaledVector(_upv, Math.cos(a)).addScaledVector(_rad, 0.6).addScaledVector(this.direction, -0.8).normalize();
        _emit.position = _pos;
        _emit.direction = _dir;
        this.sparks.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — totality                                                   */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._headAt(1, this._head);
    _floor.copy(this._head).setY(0.02);

    this.ctx.bursts.spawn(BurstMode.AIR, this._head, {
      radius: 0.2,
      endRadius: c.burstSize * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.55,
      fresnel: 2.4,
      displace: 0.3,
      turbulence: 1,
      squash: 1,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.ARC, _floor, {
      radius: c.shockRadius * 0.45,
      life: 0.9,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    this._resetEmit(frame.uTime.value);
    _emit.position = this._head;
    _emit.radius = c.moonRadius;
    _emit.speed = c.sparkSpeed * 2;
    _emit.speedVariance = 0.55;
    _emit.spread = 1.4;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = c.sparkLife * 1.4;
    this.sparks.emit(Math.round(c.impactSparks * g.particleCount), _emit);
    _emit.speed = 1.5;
    _emit.size = c.smokeSize * 1.4;
    _emit.life = c.smokeLife;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(24 * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += c.spinRate * dt * g.animationSpeed * (t <= 1 ? 0.3 * (1 - t) : 0);
    this._bead += c.beadSpin * TAU * dt * g.animationSpeed * 0.4;
    this._wakeState.flow += c.wakeFlow * dt * g.noiseSpeed;

    let flare = 0;
    if (t <= 1) {
      // Totality: the corona flares and the bead blazes, then it closes.
      flare = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - smoothstep(0.6, 1, t)) + Math.exp(-t * 10) * 0.5;
      this._close = smoothstep(0.55, 1, t);
      const cs = this._coronaState;
      cs.intensity = (1 + (c.flareGlow - 1) * flare) * (1 - this._close);
      cs.bead = c.beadGlow * (1 + 4 * Math.exp(-t * 6));
      this._lensState.strength = 1 + flare;
      this._needleState.dissolve = smoothstep(0.25, 0.9, t);
      this._strandState.fade = 1 - smoothstep(0, 0.4, t);
      this._wakeState.collapse = 0;
      this._wakeState.fade = 1;
    } else {
      const ft = saturate(t - 1);
      this._close = 1;
      this._coronaState.intensity = 0;
      this._lensState.strength = 0;
      this._needleState.dissolve = 1;
      this._strandState.fade = 0;
      // The wake collapses from the caster outward.
      this._wakeState.collapse = Easing.inOutQuad(ft) * 1.15;
      this._wakeState.fade = 1 - smoothstep(0.75, 1, ft);
      this._stainState.erode = smoothstep(0.1, 1, ft);
    }
    this.needle.visible = this._needleState.dissolve < 0.999;
    this.corona.visible = this._coronaState.intensity > 0.005;
    this.lens.visible = this._lensState.strength > 0.01;
    this.moon.visible = this._close < 0.999;
    for (const s of this.strands) s.visible = this._strandState.fade > 0.01;
    this.wake.visible = this._wakeState.fade > 0.01 && this._wakeState.collapse < 1.1;
    this.stain.visible = this._stainState.erode < 0.999;

    this._placeNeedle(1);
    this._syncAll(flare);

    // The wake still sheds as it hangs, less as it goes.
    if (t > 1) {
      const ft = saturate(t - 1);
      this._wakeSmoke(dt, 1 - ft);
    }
    this.position.copy(this._head);
  }

  /** Smoke off the wake as it collapses — from where it is still standing. */
  _wakeSmoke(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * 0.6 * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.smokeSize;
    _emit.life = c.smokeLife * 0.8;
    _emit.speed = 0.4;
    _emit.spread = 1;
    _emit.spin = 0.5;
    const from = saturate(this._wakeState.collapse);
    for (let i = 0; i < n; i++) {
      const s = lerp(from, 1, Math.random());
      _pos.lerpVectors(this._start, this._head, s);
      _emit.position = _pos;
      _emit.radius = c.wakeRadius * 0.6;
      this.smoke.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.needle.visible = false;
    this.moon.visible = false;
    this.corona.visible = false;
    this.lens.visible = false;
    this.wake.visible = false;
    this.stain.visible = false;
    for (const s of this.strands) s.visible = false;
  }

  dispose() {
    this.needleGeometry.dispose();
    this.discGeometry.dispose();
    this.tubeGeometry.dispose();
    this.wakeGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.needleMaterial.dispose();
    this.moonMaterial.dispose();
    this.coronaMaterial.dispose();
    this.lensMaterial.dispose();
    for (const m of this.strandMaterials) m.dispose();
    this.wakeMaterial.dispose();
    this.stainMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◐  Eclipse Needle');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 120, 0.5, 'drill speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'wake collapses over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const charge = folder.addFolder('1 · Charge');
  R(charge, c, 'handForward', 0, 3, 0.01, 'forms ahead (m)');
  R(charge, c, 'handHeight', 0.2, 3, 0.01, 'forms at height (m)');
  R(charge, c, 'chargeTime', 0.01, 2, 0.01, 'forms over (s)');
  R(charge, c, 'flightHeight', 0.2, 4, 0.01, 'drills at height (m)');

  const needle = folder.addFolder('2 · Needle');
  R(needle, c, 'needleLength', 0.2, 8, 0.05, 'length (m)');
  R(needle, c, 'needleRadius', 0.005, 0.5, 0.001, 'girth (m)');
  R(needle, c, 'grooves', 1, 8, 1, 'rifling grooves');
  R(needle, c, 'grooveTwist', 0, 20, 0.1, 'rifling twist');
  R(needle, c, 'spinRate', 0, 15, 0.05, 'spin (turns/s)');
  R(needle, c, 'grooveGlow', 0, 10, 0.05, 'groove glow');
  R(needle, c, 'needleRim', 0, 8, 0.05, 'rim glow');
  R(needle, c, 'pointGlow', 0, 10, 0.05, 'point glow');
  needle.addColor(c, 'colorNeedle').name('body');
  needle.addColor(c, 'colorGroove').name('rifling');

  const ecl = folder.addFolder('3 · Eclipse');
  R(ecl, c, 'moonRadius', 0.05, 1.5, 0.01, 'moon radius (m)');
  R(ecl, c, 'limbGlow', 0, 12, 0.05, 'limb glow');
  R(ecl, c, 'coronaSize', 0.1, 5, 0.01, 'corona (m)');
  R(ecl, c, 'coronaGlow', 0, 10, 0.05, 'corona glow');
  R(ecl, c, 'coronaReach', 0.02, 1.5, 0.01, 'streamer reach');
  R(ecl, c, 'streamers', 2, 40, 1, 'streamers');
  R(ecl, c, 'beadGlow', 0, 5, 0.05, 'diamond ring');
  R(ecl, c, 'beadSpin', -4, 4, 0.05, 'ring runs (turns/s)');
  R(ecl, c, 'lensStrength', 0, 4, 0.01, 'light bending');
  ecl.addColor(c, 'colorMoon').name('moon');
  ecl.addColor(c, 'colorLimb').name('limb');
  ecl.addColor(c, 'colorCorona').name('corona');
  ecl.addColor(c, 'colorBead').name('diamond ring');

  const strands = folder.addFolder('4 · Drill strands');
  R(strands, c, 'strandLength', 0.2, 12, 0.05, 'length (m)');
  R(strands, c, 'strandRadius', 0.02, 2, 0.01, 'radius (m)');
  R(strands, c, 'strandTurns', 0, 10, 0.05, 'turns');
  R(strands, c, 'strandWidth', 0.002, 0.2, 0.001, 'width (m)');
  R(strands, c, 'strandGlow', 0, 10, 0.05, 'glow');
  strands.addColor(c, 'colorStrandA').name('head');
  strands.addColor(c, 'colorStrandB').name('tail');

  const wake = folder.addFolder('5 · Wake');
  R(wake, c, 'wakeRadius', 0.02, 2, 0.01, 'radius (m)');
  R(wake, c, 'wakeChurn', 0, 1.5, 0.01, 'churn');
  R(wake, c, 'wakeFlow', 0, 10, 0.05, 'churn speed');
  R(wake, c, 'wakeOpacity', 0, 1, 0.01, 'opacity');
  R(wake, c, 'wakeRim', 0, 8, 0.05, 'skin glow');
  R(wake, c, 'stainWidth', 0.05, 3, 0.01, 'floor stain half-width (m)');
  R(wake, c, 'stainGlow', 0, 8, 0.05, 'stain fringe glow');
  R(wake, c, 'stainOpacity', 0, 1, 0.01, 'stain opacity');
  wake.addColor(c, 'colorWake').name('darkness');
  wake.addColor(c, 'colorWakeRim').name('skin / fringe');
  wake.addColor(c, 'colorStain').name('stain');

  const fx = folder.addFolder('6 · Smoke & sparks');
  R(fx, c, 'smokeRate', 0, 400, 1, 'smoke/second');
  R(fx, c, 'smokeSize', 0.05, 3, 0.01, 'smoke size');
  R(fx, c, 'smokeLife', 0.1, 5, 0.05, 'smoke lifetime');
  R(fx, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  R(fx, c, 'sparkRate', 0, 1000, 1, 'sparks/second');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSmoke', 'smoke gradient');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');

  const tot = folder.addFolder('7 · Totality');
  R(tot, c, 'totalityTime', 0.05, 3, 0.01, 'holds (s)');
  R(tot, c, 'coronaFlare', 0.1, 10, 0.05, 'corona flares to (m)');
  R(tot, c, 'flareGlow', 1, 8, 0.05, 'flare glow (×)');
  R(tot, c, 'impactSparks', 0, 600, 1, 'sparks');
  R(tot, c, 'impactShake', 0, 1.5, 0.01, 'knock');
  R(tot, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(tot, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(tot, c, 'impactLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(tot, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(tot, c, 'burstSize', 0, 8, 0.05, 'air shell (m)');
  R(tot, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  tot.addColor(c, 'colorFlash').name('flash');
  tot.addColor(c, 'colorBurstA').name('shell inner');
  tot.addColor(c, 'colorBurstB').name('shell mid');
  tot.addColor(c, 'colorBurstC').name('shell outer');
  tot.addColor(c, 'colorShockA').name('shockwave');
  tot.addColor(c, 'colorShockB').name('shockwave hot');

  folder.close();
  return folder;
}
