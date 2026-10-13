import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createWaveGeometry } from '../../assets/collective/DuneScourgeGeometry.js';
import {
  createDuneWaveMaterial,
  createDuneRippleMaterial
} from '../../materials/collective/DuneScourgeMaterial.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'dune';

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _inherit = new Vector3();
const _end = new Vector3();

/**
 * DUNE SCOURGE — a scouring dune wave rolls down the line and breaks.
 *
 * A line cast. What travels is not a projectile but a *landform*: a ridge of
 * sand with a long back slope, a steep face and a lip that curls over a dark
 * hollow, building from ankle height at the caster to full height and racing
 * down the line. At the end it breaks — the lip is thrown forward, the ridge
 * slumps into the floor — and what it leaves behind is a bed of wind ripples
 * settled into the stone.
 *
 * Five layers, each its own folder in the editor:
 *
 *   1. **the wave** — a parameter-space grid strip (`createWaveGeometry`)
 *      displaced entirely in the vertex shader from the live front position:
 *      raised-cosine back slope, curled lip, crescent flanks, crest wobble and
 *      world-space fbm grain. Lit by `uLightDir` off finite-difference normals,
 *      with a shadowed underside, wind-blown streaks and a backlit crest line.
 *   2. **grit and dust off the crest** — lit CHIPs flicked up off the lip and
 *      falling hard, fine non-additive SOFT spray blown off it, and SMOKE
 *      rolling off the back slope. None of it additive: sand occludes, and a
 *      glowing sandstorm is a fire.
 *   3. **the scoured trail** — DUSTRING decals laid behind the front at a fixed
 *      spacing in *metres*, so the trail has the same density at any speed,
 *      and a camera rumble while the wave runs.
 *   4. **the crash** — an EARTH burst squashed low, a shockwave, a dust cloud,
 *      a fountain of grit, and a knock on the camera.
 *   5. **the ripple bed** — a flat quad whose fragment shader lays asymmetric
 *      ripples across the line and in rings round the crash, relit by the sun,
 *      revealed behind the crest and blown away at the end.
 *
 * Hits are the engine's default line capsule: the wave *reaches*, it does not
 * choose.
 *
 * ## The rule that makes the editor work
 *
 * A cast captures one seed and a running distance for the trail decals. The
 * wave's height, width, curl, the crash, the ripples — all resolved from
 * `settings.dune` every frame, so any slider re-shapes the wave mid-run.
 */
export class DuneScourgeAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the wave ---- */
    this.waveGeometry = createWaveGeometry(48, 34, 22);
    this.waveMaterial = createDuneWaveMaterial();
    this.wave = new Mesh(this.waveGeometry, this.waveMaterial);
    this.wave.name = 'DuneWave';
    // Parameter-space vertices: not culled, and kept out of the depth prepass
    // (LAYER.WORLD), whose override material would rasterise the raw strip.
    this.wave.frustumCulled = false;
    this.wave.layers.set(LAYER.VFX);
    this.wave.renderOrder = 4;
    this.wave.visible = false;
    this.group.add(this.wave);

    /* ---- layer 5: the ripple bed ---- */
    this.rippleGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.rippleMaterial = createDuneRippleMaterial();
    this.ripples = new Mesh(this.rippleGeometry, this.rippleMaterial);
    this.ripples.name = 'DuneRipples';
    this.ripples.frustumCulled = false;
    this.ripples.layers.set(LAYER.VFX);
    this.ripples.renderOrder = 1;
    this.ripples.visible = false;
    this.group.add(this.ripples);

    /** Scratch handed to the materials each frame. One object apiece, reused. */
    this._waveState = {
      origin: this.origin,
      dir: this.direction,
      side: this.side,
      front: 0,
      halfWidth: 1,
      height: 0,
      crash: 0,
      seed: 0
    };
    this._rippleState = {
      origin: this.origin,
      dir: this.direction,
      side: this.side,
      length: 1,
      reveal: 0,
      disc: 0,
      fade: 1,
      seed: 0
    };

    this._seed = 0;
    this._trailDistance = 0;
    this._crestFront = 0;
    this._crestHeight = 0;
    this._crash = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 2: grit ---- */
    this.grit = particles.get('dune.grit', {
      capacity: 2400,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.grit.uniforms.uDrag.value = 0.35;
    this.grit.uniforms.uSizeIn.value = 0.02;
    this.grit.uniforms.uFadeIn.value = 0.02;
    this.grit.uniforms.uFadeOut.value = 0.7;
    this.grit.uniforms.uEndSize.value = 0.9;
    this.grit.uniforms.uTurbulence.value = 0.15;

    /* ---- layer 2: fine spray ---- */
    this.spray = particles.get('dune.spray', {
      capacity: 3200,
      shape: ParticleShape.SOFT,
      additive: false,
      softFade: 0.35
    });
    this.spray.uniforms.uDrag.value = 1.6;
    this.spray.uniforms.uSizeIn.value = 0.06;
    this.spray.uniforms.uFadeIn.value = 0.05;
    this.spray.uniforms.uFadeOut.value = 0.55;
    this.spray.uniforms.uEndSize.value = 2.2;

    /* ---- layer 2: dust rolling off the back ---- */
    this.dust = particles.get('dune.dust', {
      capacity: 2000,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.1
    });
    this.dust.uniforms.uDrag.value = 1.8;
    this.dust.uniforms.uSizeIn.value = 0.1;
    this.dust.uniforms.uFadeIn.value = 0.14;
    this.dust.uniforms.uFadeOut.value = 0.35;

    this.gritEmitter = new RateEmitter();
    this.sprayEmitter = new RateEmitter();
    this.dustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The bed lies there for its lifetime; the crash plays inside that. */
  get impactDuration() {
    const c = settings.dune;
    return Math.max(c.crashTime + 0.1, c.lifetime) * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.1, settings.dune.rippleFade * settings.global.lifetime);
  }

  /** Warm bounce off moving sand: it ripples with the grain, slowly. */
  lightShimmer() {
    return 0.92 + 0.08 * Math.sin(this.age * 6.1) * Math.sin(this.age * 2.3);
  }

  /* ------------------------------------------------------------------ */
  /* Resolving the wave — every metre comes from here                    */
  /* ------------------------------------------------------------------ */

  /** Half-width at fraction `s` down the line, metres. */
  _halfWidth(s) {
    const c = settings.dune;
    return lerp(c.widthNear, c.width, Easing.outQuad(saturate(s)));
  }

  /** Crest height `metres` down the line, before the crash. */
  _buildHeight(metres) {
    const c = settings.dune;
    const built = Easing.outCubic(saturate(metres / Math.max(0.1, c.buildDistance)));
    return lerp(c.heightNear, c.waveHeight, built);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.gritEmitter.reset();
    this.sprayEmitter.reset();
    this.dustEmitter.reset();

    // The one thing a cast captures. Everything else is resolved per frame.
    this._seed = Math.random() * 100;
    this._trailDistance = 0;
    this._crestFront = 0;
    this._crestHeight = 0;
    this._crash = 0;

    this.wave.visible = true;
    this.ripples.visible = true;

    // The sand gathering at the caster's feet before it moves off.
    const c = settings.dune;
    const g = settings.global;
    _pos.copy(this.origin).addScaledVector(this.direction, 0.6).setY(0.2);
    _emit.position = _pos;
    _emit.radius = c.widthNear;
    _emit.direction = _dir.copy(this.direction).setY(0.8).normalize();
    _emit.speed = c.dustSpeed * 1.4;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.dustSize * 0.7;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime * 0.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.dust.emit(Math.round(12 * g.particleCount), _emit);

    this._sync(0, 0, 0, 1);
  }

  /** Push the live settings into both materials and every particle system. */
  _sync(front, height, crash, rippleFade) {
    const c = settings.dune;
    const g = settings.global;

    const w = this._waveState;
    w.front = front;
    w.halfWidth = this._halfWidth(front / this.length);
    w.height = height;
    w.crash = crash;
    w.seed = this._seed;
    this.waveMaterial.userData.sync(w);

    const r = this._rippleState;
    r.length = this.length;
    r.seed = this._seed;
    r.fade = rippleFade;
    this.rippleMaterial.userData.sync(r);

    // The bed's quad: centred on the line, long enough to hold the crash fan.
    const reach = Math.max(c.width, c.rippleRadius) + 1;
    this.pointAt(0.5, _pos);
    this.ripples.position.set(_pos.x, 0.015, _pos.z);
    this.ripples.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
    this.ripples.scale.set(reach * 2, 1, this.length + reach * 2);

    this.grit.setGradient(getColor(c.colorGritA), getColor(c.colorGritB), getColor(c.colorGritC), getColor(c.colorGritD));
    this.grit.uniforms.uGravity.value.set(0, c.gritGravity, 0);
    this.grit.uniforms.uSizeScale.value = c.gritSize * g.particleSize * 1.5;
    this.grit.uniforms.uLifeScale.value = g.particleLifetime;
    this.grit.uniforms.uSpeedScale.value = g.particleSpeed;
    this.grit.uniforms.uOpacity.value = g.opacity;

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    this.spray.uniforms.uGravity.value.set(0, c.sprayGravity, 0);
    this.spray.uniforms.uSizeScale.value = c.spraySize * g.particleSize * 2;
    this.spray.uniforms.uLifeScale.value = g.particleLifetime;
    this.spray.uniforms.uSpeedScale.value = g.particleSpeed;
    this.spray.uniforms.uOpacity.value = c.sprayOpacity * g.opacity;
    this.spray.uniforms.uTurbulence.value = 0.5 * g.turbulence;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    this.dust.uniforms.uGravity.value.set(0, c.dustRise, 0);
    this.dust.uniforms.uSizeScale.value = c.dustSize * g.particleSize;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uTurbulence.value = c.dustTurbulence * g.turbulence;
    this.dust.uniforms.uEndSize.value = c.dustSpread;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.dune;

    this._crestFront = this.front;
    this._crestHeight = this._buildHeight(this.front);

    const r = this._rippleState;
    r.reveal = this.front - c.rippleLag;
    r.disc = 0;
    this._sync(this._crestFront, this._crestHeight, 0, 1);

    // The light rides just over the crest.
    this.position.y = this._crestHeight * 0.7;

    this._crestFx(dt, 1);
    this._trailFx();
    this.ctx.shake.rumble(c.rumble * saturate(this._crestHeight / Math.max(0.1, c.waveHeight)), dt);
  }

  onImpact() {
    const c = settings.dune;
    const g = settings.global;
    const time = frame.uTime.value;

    this.pointAt(1, _end).setY(0);

    /* the break: a dense ball of sand, squashed low */
    _pos.copy(_end).addScaledVector(this.direction, c.crashRun * 0.5).setY(0.4);
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
      radius: c.burstSize * 0.25,
      endRadius: c.burstSize * g.explosionIntensity,
      life: 0.8,
      intensity: c.burstIntensity,
      opacity: 0.8,
      displace: 0.55,
      squash: c.burstSquash,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
      radius: c.shockRadius * g.explosionIntensity,
      life: 0.7,
      width: 0.08,
      intensity: 0.9,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.rippleRadius * 1.2,
      life: c.trailLife * 1.5,
      intensity: c.trailIntensity,
      colorA: getColor(c.colorTrailA),
      colorB: getColor(c.colorTrailB)
    });

    /* the cloud and the fountain */
    _emit.position = _pos;
    _emit.radius = c.width * 0.8;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(0.5).setY(1).normalize();
    _emit.speed = c.dustSpeed * 2.2;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.dustSize * 1.4;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime * 1.4;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = time;
    this.dust.emit(Math.round(c.burstDust * g.particleCount), _emit);

    _emit.speed = c.gritSpeed * 1.6;
    _emit.spread = 0.75;
    _emit.size = 1;
    _emit.sizeVariance = 0.7;
    _emit.life = c.gritLifetime * 1.4;
    _emit.spin = 9;
    this.grit.emit(Math.round(c.burstGrit * g.particleCount), _emit);

    _emit.speed = c.spraySpeed * 2;
    _emit.spread = 1;
    _emit.size = 1;
    _emit.life = c.sprayLifetime * 1.3;
    _emit.spin = 0;
    this.spray.emit(Math.round(c.burstSpray * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * g.explosionIntensity, 1 / Math.max(0.1, c.shakeDuration), 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * 1.3 * g.explosionIntensity;
  }

  onFade(dt, t) {
    const c = settings.dune;

    /* --- the break: the wave rolls on, its lip thrown forward, and slumps --- */
    const crashT = saturate(this.impactTime / Math.max(0.05, c.crashTime));
    const crashing = this.phase === AbilityPhase.IMPACT ? crashT : 1;
    this._crash = crashing;
    this._crestFront = this.length + c.crashRun * Easing.outCubic(crashing);
    this._crestHeight = this._buildHeight(this.length) * (1 - Easing.inCubic(crashing));
    this.wave.visible = crashing < 1;

    /* --- the bed: reveal the rest of the line, open the fan, then blow away --- */
    const r = this._rippleState;
    r.reveal = this.length + c.crashRun + c.rippleLag;
    r.disc = Easing.outCubic(saturate(this.impactTime / Math.max(0.05, c.crashTime * 1.6)));
    const fade = this.phase === AbilityPhase.FADE ? 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration)) : 1;
    this._sync(this._crestFront, this._crestHeight, crashing, fade);

    this.pointAt(1, this.position).addScaledVector(this.direction, c.crashRun * Easing.outCubic(crashing));
    this.position.y = Math.max(0.3, this._crestHeight * 0.7);

    // The breaking wave still throws sand while there is any wave left.
    if (crashing < 1) this._crestFx(dt, 1 - crashing);

    // The bed sheds a little grit as it is blown away.
    if (this.phase === AbilityPhase.FADE) this._blowFx(dt, fade);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Grit, spray and dust off the travelling crest. */
  _crestFx(dt, strength) {
    const c = settings.dune;
    const g = settings.global;
    const time = frame.uTime.value;
    const halfWidth = this._halfWidth(saturate(this._crestFront / this.length));
    const height = this._crestHeight;
    // Particles leave with the wave's own forward motion, partly.
    const travelling = this.phase === AbilityPhase.TRAVEL;
    _inherit.copy(this.direction).multiplyScalar(travelling ? c.speed * settings.global.speed * 0.45 : c.crashRun);

    const grit = Math.round(this.gritEmitter.tick(dt, c.gritRate * strength) * g.particleCount);
    for (let n = 0; n < grit; n++) {
      this._crestPoint(randRange(-0.85, 0.85), halfWidth, height, _pos);
      _emit.position = _pos;
      _emit.radius = 0.08;
      _emit.direction = _dir.copy(this.direction).multiplyScalar(0.6).setY(1).normalize();
      _emit.speed = c.gritSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.45;
      _emit.inherit = _inherit;
      _emit.anchor = null;
      _emit.size = 1;
      _emit.sizeVariance = 0.7;
      _emit.life = c.gritLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 9;
      _emit.tint = null;
      _emit.time = time;
      this.grit.emit(1, _emit);
    }

    const spray = Math.round(this.sprayEmitter.tick(dt, c.sprayRate * strength) * g.particleCount);
    if (spray > 0) {
      // A few emits along the crest rather than one per grain: spray is a sheet.
      const batches = Math.min(6, spray);
      const per = Math.ceil(spray / batches);
      for (let b = 0; b < batches; b++) {
        this._crestPoint(randRange(-0.9, 0.9), halfWidth, height, _pos);
        _emit.position = _pos;
        _emit.radius = 0.25;
        // Blown back off the lip and up — the wind is what is shaping the wave.
        _emit.direction = _dir.copy(this.direction).multiplyScalar(-0.35).setY(1).normalize();
        _emit.speed = c.spraySpeed;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.5;
        _emit.inherit = _inherit;
        _emit.anchor = null;
        _emit.size = 1;
        _emit.sizeVariance = 0.6;
        _emit.life = c.sprayLifetime;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = time;
        this.spray.emit(per, _emit);
      }
    }

    const dust = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (dust > 0) {
      // Rolling off the back slope, low.
      _pos.copy(this.origin).addScaledVector(this.direction, Math.max(0, this._crestFront - c.tail * 0.4));
      _pos.y = 0.25;
      _emit.position = _pos;
      _emit.radius = halfWidth * 0.8;
      _emit.direction = _dir.copy(this.direction).multiplyScalar(-0.3).setY(0.6).normalize();
      _emit.speed = c.dustSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.9;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 1;
      _emit.sizeVariance = 0.5;
      _emit.life = c.dustLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.45;
      _emit.tint = null;
      _emit.time = time;
      this.dust.emit(dust, _emit);
    }
  }

  /** A point on the crest at lateral fraction `lat`, at the crest's own height. */
  _crestPoint(lat, halfWidth, height, out) {
    const c = settings.dune;
    const taper = 1 - saturate((Math.abs(lat) - (1 - c.edgeTaper)) / Math.max(0.01, c.edgeTaper));
    this.pointAt(0, out).addScaledVector(this.direction, this._crestFront - c.bow * lat * lat);
    out.addScaledVector(this.side, lat * halfWidth);
    out.y = Math.max(0.1, height * taper * 0.95);
    return out;
  }

  /** Dust rings laid behind the front, paid out per metre. */
  _trailFx() {
    const c = settings.dune;
    const step = Math.max(0.2, c.trailInterval);
    while (this.front - this._trailDistance >= step) {
      this._trailDistance += step;
      const s = saturate(this._trailDistance / this.length);
      this.pointAt(s, _pos);
      _pos.addScaledVector(this.side, randRange(-0.3, 0.3) * this._halfWidth(s));
      this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
        radius: this._halfWidth(s) * c.trailRadius * randRange(0.85, 1.15),
        life: c.trailLife,
        intensity: c.trailIntensity,
        colorA: getColor(c.colorTrailA),
        colorB: getColor(c.colorTrailB)
      });
    }
  }

  /** A thin drift of sand lifted off the bed as it is blown away. */
  _blowFx(dt, strength) {
    const c = settings.dune;
    const g = settings.global;
    const count = Math.round(this.sprayEmitter.tick(dt, c.sprayRate * 0.25 * strength) * g.particleCount);
    if (count <= 0) return;
    this.pointAt(randRange(0.2, 1), _pos).setY(0.1);
    _emit.position = _pos;
    _emit.radius = c.width;
    _emit.direction = _dir.copy(this.direction).setY(0.25).normalize();
    _emit.speed = c.spraySpeed * 0.6;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.4;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.8;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sprayLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.spray.emit(count, _emit);
  }

  onDestroy() {
    this.wave.visible = false;
    this.ripples.visible = false;
  }

  dispose() {
    this.waveGeometry.dispose();
    this.waveMaterial.dispose();
    this.rippleGeometry.dispose();
    this.rippleMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F3DC}  Dune Scourge');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'wave speed (m/s)');
  R(cast, c, 'lifetime', 0.3, 12, 0.05, 'ripples lie for');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');

  const wave = folder.addFolder('1 · The wave');
  const shape = wave.addFolder('Silhouette');
  R(shape, c, 'waveHeight', 0.1, 6, 0.01, 'crest height (m)');
  R(shape, c, 'heightNear', 0, 3, 0.01, 'height leaving the caster (m)');
  R(shape, c, 'buildDistance', 0.1, 20, 0.05, 'builds over (m)');
  R(shape, c, 'widthNear', 0.1, 6, 0.01, 'half-width at the caster (m)');
  R(shape, c, 'width', 0.1, 10, 0.01, 'half-width at the end (m)');
  R(shape, c, 'lead', 0.05, 4, 0.01, 'front face length (m)');
  R(shape, c, 'tail', 0.2, 12, 0.05, 'back slope length (m)');
  R(shape, c, 'curl', 0, 1.5, 0.01, 'lip overhang (× height)');
  R(shape, c, 'curlSharp', 0.3, 8, 0.05, 'how high the curl starts');
  R(shape, c, 'bow', -3, 4, 0.01, 'flanks trail by (m)');
  R(shape, c, 'edgeTaper', 0.01, 1, 0.01, 'flank taper');
  R(shape, c, 'crestNoise', 0, 0.8, 0.01, 'crest wobble');
  R(shape, c, 'crestNoiseScale', 0.05, 4, 0.01, 'wobble scale');
  R(shape, c, 'grain', 0, 0.5, 0.005, 'grain (m)');
  R(shape, c, 'grainScale', 0.2, 12, 0.05, 'grain scale');

  const look = wave.addFolder('Sand');
  look.addColor(c, 'colorSandLight').name('sunlit');
  look.addColor(c, 'colorSandDark').name('shade');
  look.addColor(c, 'colorUnderside').name('under the lip');
  look.addColor(c, 'colorStreak').name('streaks + spray edge');
  R(look, c, 'undersideDarkness', 0, 1, 0.01, 'hollow darkness');
  R(look, c, 'ambient', 0, 1, 0.01, 'ambient');
  R(look, c, 'streakStrength', 0, 3, 0.01, 'streaks');
  R(look, c, 'streakScale', 0.1, 6, 0.01, 'streak scale');
  R(look, c, 'streakFlow', -10, 10, 0.05, 'streak flow');
  R(look, c, 'crestGlow', 0, 3, 0.01, 'crest backlight');
  R(look, c, 'waveOpacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'floorFade', 0.005, 1, 0.005, 'floor fade (m)');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');

  const crash = wave.addFolder('The break');
  R(crash, c, 'crashTime', 0.05, 3, 0.01, 'break time (s)');
  R(crash, c, 'crashRun', 0, 8, 0.05, 'rolls on by (m)');
  R(crash, c, 'crashCurl', 0, 4, 0.01, 'lip throw (× curl)');

  const trail = wave.addFolder('Scoured trail');
  R(trail, c, 'rumble', 0, 1, 0.01, 'camera rumble');
  R(trail, c, 'trailInterval', 0.2, 6, 0.05, 'ring every (m)');
  R(trail, c, 'trailLife', 0.1, 6, 0.05, 'ring life');
  R(trail, c, 'trailRadius', 0.1, 3, 0.01, 'ring radius (× width)');
  R(trail, c, 'trailIntensity', 0, 2, 0.01, 'ring strength');
  trail.addColor(c, 'colorTrailA').name('ring dark');
  trail.addColor(c, 'colorTrailB').name('ring light');

  const crest = folder.addFolder('2 · Grit + dust');
  const grit = crest.addFolder('Grit');
  R(grit, c, 'gritRate', 0, 800, 1, 'chips/second');
  R(grit, c, 'gritSize', 0.005, 0.4, 0.005, 'size');
  R(grit, c, 'gritSpeed', 0, 20, 0.1, 'speed');
  R(grit, c, 'gritLifetime', 0.05, 4, 0.01, 'lifetime');
  R(grit, c, 'gritGravity', -40, 2, 0.1, 'gravity');
  Editor.gradient(grit, c, 'colorGrit', 'grit gradient');
  const spray = crest.addFolder('Spray');
  R(spray, c, 'sprayRate', 0, 1200, 1, 'grains/second');
  R(spray, c, 'spraySize', 0.005, 0.5, 0.005, 'size');
  R(spray, c, 'spraySpeed', 0, 16, 0.1, 'speed');
  R(spray, c, 'sprayLifetime', 0.05, 4, 0.01, 'lifetime');
  R(spray, c, 'sprayOpacity', 0, 1, 0.01, 'opacity');
  R(spray, c, 'sprayGravity', -20, 4, 0.1, 'gravity');
  Editor.gradient(spray, c, 'colorSpray', 'spray gradient');
  const dust = crest.addFolder('Dust');
  R(dust, c, 'dustRate', 0, 400, 1, 'puffs/second');
  R(dust, c, 'dustSize', 0.05, 4, 0.01, 'size');
  R(dust, c, 'dustSpeed', 0, 8, 0.05, 'speed');
  R(dust, c, 'dustLifetime', 0.1, 8, 0.05, 'lifetime');
  R(dust, c, 'dustOpacity', 0, 1, 0.01, 'opacity');
  R(dust, c, 'dustRise', -1, 3, 0.01, 'rise (m/s)');
  R(dust, c, 'dustTurbulence', 0, 3, 0.01, 'turbulence');
  R(dust, c, 'dustSpread', 0.2, 8, 0.05, 'billow');
  Editor.gradient(dust, c, 'colorDust', 'dust gradient');

  const impact = folder.addFolder('3 · The crash');
  R(impact, c, 'burstSize', 0, 12, 0.05, 'sand burst (m)');
  R(impact, c, 'burstIntensity', 0, 4, 0.01, 'burst brightness');
  R(impact, c, 'burstSquash', 0.05, 1.5, 0.01, 'burst squash');
  R(impact, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(impact, c, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(impact, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(impact, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(impact, c, 'burstGrit', 0, 800, 1, 'grit thrown');
  R(impact, c, 'burstDust', 0, 400, 1, 'dust puffs');
  R(impact, c, 'burstSpray', 0, 1200, 1, 'spray grains');
  impact.addColor(c, 'colorBurstA').name('burst light');
  impact.addColor(c, 'colorBurstB').name('burst body');
  impact.addColor(c, 'colorBurstC').name('burst shade');
  impact.addColor(c, 'colorShockA').name('shockwave');
  impact.addColor(c, 'colorShockB').name('shockwave hot');
  impact.addColor(c, 'colorFlash').name('flash');

  const bed = folder.addFolder('4 · Ripple bed');
  R(bed, c, 'rippleFrequency', 0.2, 8, 0.01, 'ridges per metre');
  R(bed, c, 'rippleSharp', 0.2, 8, 0.01, 'ridge sharpness');
  R(bed, c, 'rippleAsymmetry', 0, 1, 0.01, 'stoss / lee asymmetry');
  R(bed, c, 'rippleWarp', 0, 4, 0.01, 'bend');
  R(bed, c, 'rippleWarpScale', 0.05, 4, 0.01, 'bend scale');
  R(bed, c, 'rippleDepth', 0, 4, 0.01, 'relief');
  R(bed, c, 'rippleRadius', 0, 10, 0.05, 'crash fan (m)');
  R(bed, c, 'rippleLag', 0, 6, 0.05, 'shows behind the crest by (m)');
  R(bed, c, 'rippleOpacity', 0, 1, 0.01, 'opacity');
  R(bed, c, 'rippleEdge', 0, 1, 0.01, 'ragged edge');
  R(bed, c, 'rippleFadeIn', 0.01, 2, 0.01, 'settles over (s)');
  R(bed, c, 'rippleFade', 0.1, 6, 0.05, 'blows away over (s)');
  bed.addColor(c, 'colorRippleLight').name('ridge');
  bed.addColor(c, 'colorRippleDark').name('trough');
}
