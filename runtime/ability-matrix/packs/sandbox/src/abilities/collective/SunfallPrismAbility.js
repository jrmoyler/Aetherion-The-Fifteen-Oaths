import { Color, Mesh, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createPrismGeometry,
  createBeamGeometry
} from '../../assets/collective/SunfallPrismGeometry.js';
import {
  MAX_BEAMS,
  createPrismGlassMaterial,
  createPrismBeamMaterial,
  createPrismScorchMaterial
} from '../../materials/collective/SunfallPrismMaterial.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'prism';

const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _contact = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _axis = new Vector3();
const _spinQ = new Quaternion();
const _tiltQ = new Quaternion();
const _white = new Color(1, 1, 1);

/**
 * SUNFALL PRISM — a falling prism splits the sun into a sweeping spectrum.
 *
 * A zone cast told in five beats, every one of them on a live clock:
 *
 *   1. **the fall** — a shaft of sunlight comes down out of the sky over the
 *      circle and a crystal falls through it, from `dropHeight` to a hover,
 *      turning slowly, while a run of glints skims the floor from the caster.
 *   2. **the charge** — it hangs there and the shaft pools on the floor under
 *      it. Nothing happens for `chargeTime`; that wait is the anticipation.
 *   3. **the strike** — a white beam drives down out of the sky into the stone
 *      and floods it white from the inside; a beat later it **splits**: a
 *      flash, a shell of light, a shockwave, and `beamCount` spectral beams —
 *      one hue each, red to violet — fan out of it onto the floor.
 *   4. **the sweep** — the beams' contact points spiral across the circle,
 *      each throwing sparks in its own colour and burning a line into the
 *      stone behind it that cools from its hue to char. A body a contact
 *      crosses is cut down where it stands.
 *   5. **the shatter** — the beams hold for `lingerTime`, then the prism
 *      bursts into spectral glints, everything still standing in the circle is
 *      thrown outward, and the scorched spectrum fades off the floor.
 *
 * ## Layers
 *
 *   - **the glass** (`createPrismGlassMaterial`) — refraction at three indices
 *     for the dispersion, reflections and refraction both from `frame.uEnvMap`,
 *     fresnel, inner spectral fire and drawn facet edges on a procedural
 *     bipyramid (`createPrismGeometry`), rebuilt live when its shape sliders
 *     move.
 *   - **the beams** (`createPrismBeamMaterial`) — one additive column shader
 *     for the sun shaft, the white strike and every spectral beam.
 *   - **the scorch** (`createPrismScorchMaterial`) — the burnt lines drawn
 *     *analytically* from the very sweep that aims the beams, as a char pass
 *     and an additive heat pass, plus the sun pool. SCORCH decals are laid
 *     along each line too, for the ember texture the engine's decal has.
 *   - **motes, sparks and glints** — additive SOFT motes drifting in the shaft,
 *     STREAK sparks tinted per beam at every contact, and SOFT glints thrown
 *     in every hue when the stone shatters.
 *   - **impact** — AIR shell, SHOCKWAVE decal, screen flash, camera knock and a
 *     light punch on the split; a smaller knock on the shatter. The dynamic
 *     light turns through the beam hues while they sweep (`lightSpectrum`).
 *
 * ## The rule that makes the editor work
 *
 * A cast captures a seed, a starting bearing, the age at which the front
 * arrived, two integrated phases (spin, bob) and a few event flags. The fall,
 * the timing, the beam fan, the spiral, the scorch — all resolved from
 * `settings.prism` every frame. Drag `sweepAngle` mid-sweep and both the beams
 * and the lines already burnt re-draw along the new spiral.
 */
export class SunfallPrismAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /**
   * It cuts down what its beams cross, when they cross it, and throws the
   * rest on the shatter. The default disc would fell everything the frame the
   * front arrives — while the prism is still falling out of the sky.
   */
  get handlesOwnHits() {
    return true;
  }

  /** Spectral beams currently on the floor. HUD readout only. */
  get instanceCount() {
    return this._beamsLive;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- the glass ---- */
    this._shapeKey = '';
    this.glassMaterial = createPrismGlassMaterial();
    this.prism = new Mesh(this._buildPrism(), this.glassMaterial);
    this.prism.name = 'SunfallPrism';
    this.prism.layers.set(LAYER.VFX);
    this.prism.renderOrder = 14;
    this.prism.visible = false;
    this.group.add(this.prism);

    /* ---- the beams ---- */
    this.beamGeometry = createBeamGeometry(20);

    this.shaftMaterial = createPrismBeamMaterial('shaft');
    this.shaft = new Mesh(this.beamGeometry, this.shaftMaterial);
    this.strikeMaterial = createPrismBeamMaterial('strike');
    this.strike = new Mesh(this.beamGeometry, this.strikeMaterial);

    this.beams = [];
    this.beamMaterials = [];
    for (let i = 0; i < MAX_BEAMS; i++) {
      const material = createPrismBeamMaterial('spectral');
      const mesh = new Mesh(this.beamGeometry, material);
      this.beams.push(mesh);
      this.beamMaterials.push(material);
    }
    for (const mesh of [this.shaft, this.strike, ...this.beams]) {
      mesh.layers.set(LAYER.VFX);
      // Placed and scaled every frame; its bounds are not worth maintaining.
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 15;
      this.group.add(mesh);
    }
    this.shaft.renderOrder = 9;

    /* ---- the scorch ---- */
    this.scorchGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.charMaterial = createPrismScorchMaterial('char');
    this.heatMaterial = createPrismScorchMaterial('glow');
    this.char = new Mesh(this.scorchGeometry, this.charMaterial);
    this.heat = new Mesh(this.scorchGeometry, this.heatMaterial);
    this.char.renderOrder = 2;
    this.heat.renderOrder = 3;
    for (const mesh of [this.char, this.heat]) {
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- per-cast state, preallocated ---- */
    this._phases = new Float32Array(MAX_BEAMS);
    this._colors = [];
    for (let i = 0; i < MAX_BEAMS; i++) this._colors.push(new Color());
    this._decalDistance = new Float32Array(MAX_BEAMS);
    this._lastContact = [];
    for (let i = 0; i < MAX_BEAMS; i++) this._lastContact.push(new Vector3());

    this._glassState = { charge: 0, fade: 1, seed: 0 };
    this._beamState = { reach: 1, fade: 1, color: null };
    this._scorchState = {
      radius: 1,
      extent: 1,
      count: 0,
      phases: this._phases,
      colors: this._colors,
      progress: 0,
      live: 0,
      pool: 0,
      fade: 1,
      seed: 0
    };

    this._targets = [];
    this._prismPoint = new Vector3();
    this._seed = 0;
    this._bearing = 0;
    this._spin = 0;
    this._bob = 0;
    this._arrivedAge = 0;
    this._struck = false;
    this._split = false;
    this._shattered = false;
    this._beamsLive = 0;
    this._hue = 0;
  }

  /** The stone, at the live shape settings. */
  _buildPrism() {
    const c = settings.prism;
    return createPrismGeometry({ sides: c.prismSides, band: c.prismBand, twist: c.prismTwist });
  }

  /** Rebuild only when a *shape* control moves; a few dozen triangles. */
  _syncGeometry() {
    const c = settings.prism;
    const key = `${Math.round(c.prismSides)}|${c.prismBand.toFixed(3)}|${c.prismTwist.toFixed(3)}`;
    if (key === this._shapeKey) return;
    this._shapeKey = key;
    const previous = this.prism.geometry;
    this.prism.geometry = this._buildPrism();
    previous.dispose();
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('prism.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.4
    });
    this.motes.uniforms.uDrag.value = 1.4;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.15;
    this.motes.uniforms.uFadeOut.value = 0.45;
    this.motes.uniforms.uEndSize.value = 0.3;

    this.sparks = particles.get('prism.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uDrag.value = 0.8;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;
    this.sparks.uniforms.uEndSize.value = 0.4;
    this.sparks.uniforms.uStretch.value = 0.06;
    this.sparks.uniforms.uTurbulence.value = 0.1;

    this.glints = particles.get('prism.glints', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.glints.uniforms.uDrag.value = 1.6;
    this.glints.uniforms.uSizeIn.value = 0.02;
    this.glints.uniforms.uFadeIn.value = 0.02;
    this.glints.uniforms.uFadeOut.value = 0.7;
    this.glints.uniforms.uEndSize.value = 0.2;
    this.glints.uniforms.uTurbulence.value = 0.3;

    this.moteEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every beat resolved from the live settings                 */
  /* ------------------------------------------------------------------ */

  /** Seconds the fall takes. */
  get _descent() {
    return Math.max(0.1, settings.prism.descentTime * settings.global.lifetime);
  }

  /** Age at which the white beam strikes. Never before the prism has landed. */
  get _strikeAge() {
    return Math.max(this._descent, this._arrivedAge) + settings.prism.chargeTime;
  }

  get _splitAge() {
    return this._strikeAge + Math.max(0.01, settings.prism.strikeLead);
  }

  get _sweepTime() {
    return Math.max(0.1, settings.prism.lifetime * settings.global.lifetime);
  }

  /** From the front's arrival to the shatter. */
  get impactDuration() {
    return Math.max(0.1, this._splitAge + this._sweepTime + settings.prism.lingerTime - this._arrivedAge);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.prism.scorchFade * settings.global.lifetime);
  }

  /** Sunlight does not flicker; the strike does a little. */
  lightShimmer() {
    if (!this._struck || this._shattered) return 1;
    return 1 - settings.prism.beamFlicker * 0.5 * (0.5 + 0.5 * Math.sin(this.age * 31));
  }

  /** Turn the light through the spectrum while the beams sweep. */
  _updateLight(dt, scale) {
    super._updateLight(dt, scale);
    const entry = this.light;
    if (!entry?.light || !this._split || this._shattered) return;
    const c = settings.prism;
    const count = this._beamCount();
    const i = Math.floor(((this.age * 2.2) % 1) * count);
    entry.light.color.lerp(this._colors[Math.min(count - 1, i)], saturate(c.lightSpectrum));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry                                                            */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.1, settings.prism.zoneRadius);
  }

  _beamCount() {
    return Math.max(1, Math.min(MAX_BEAMS, Math.round(settings.prism.beamCount)));
  }

  /** The beam hues, red to violet, resolved from the live settings. */
  _resolveColors() {
    const c = settings.prism;
    const count = this._beamCount();
    for (let i = 0; i < MAX_BEAMS; i++) {
      const f = count > 1 ? Math.min(i, count - 1) / (count - 1) : 0.5;
      hsvToColor(lerp(c.hueStart, c.hueEnd, f), c.saturation, 1, this._colors[i]);
      // The fan is spread evenly round the circle from the cast's own bearing.
      this._phases[i] = this._bearing + (i / count) * TAU;
    }
  }

  /** Sweep progress 0..1, eased by `sweepEase`. */
  _progress() {
    if (!this._split) return 0;
    const c = settings.prism;
    const t = saturate((this.age - this._splitAge) / this._sweepTime);
    return lerp(t, Easing.inOutCubic(t), saturate(c.sweepEase));
  }

  /** Where beam `i` touches the floor at progress `p`. */
  _contactPoint(i, p, centre, out) {
    const c = settings.prism;
    const a = this._phases[i] + c.sweepAngle * p;
    const r = this.radius * lerp(c.sweepInner, c.sweepOuter, p);
    return out.set(centre.x + Math.cos(a) * r, 0, centre.z + Math.sin(a) * r);
  }

  /** The prism's height above the floor right now. */
  _prismHeight() {
    const c = settings.prism;
    const fall = saturate(this.age / this._descent);
    const y = lerp(c.dropHeight, c.hoverHeight, Easing.outCubic(fall));
    return y + Math.sin(this._bob) * c.hoverBob * fall;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.moteEmitter.reset();
    this.sparkEmitter.reset();

    // The only dice. Everything else is resolved per frame.
    this._seed = Math.random() * 100;
    this._bearing = Math.atan2(this.direction.z, this.direction.x) + randRange(-0.4, 0.4);
    this._spin = Math.random() * TAU;
    this._bob = Math.random() * TAU;
    this._arrivedAge = 0;
    this._struck = false;
    this._split = false;
    this._shattered = false;
    this._beamsLive = 0;
    this._decalDistance.fill(0);

    this.prism.visible = true;
    this.shaft.visible = true;
    this.char.visible = true;
    this.heat.visible = true;
    this.strike.visible = false;
    for (const beam of this.beams) beam.visible = false;

    this._resolveColors();
    this._frame(0);
  }

  onTravel(dt) {
    this._frame(dt);
    this._travelFx(dt);
  }

  onImpact() {
    // The clock the strike is scheduled against: a long cast may have landed
    // the prism already, a short one has not.
    this._arrivedAge = this.age;
  }

  onFade(dt) {
    if (this.phase === AbilityPhase.FADE && !this._shattered) this._shatter();
    this._frame(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Everything, every frame, in every phase. */
  _frame(dt) {
    const c = settings.prism;
    const g = settings.global;
    const time = frame.uTime.value;

    this._syncGeometry();
    this._resolveColors();
    this._syncParticles();

    const centre = this.pointAt(1, _centre).setY(0);
    const count = this._beamCount();

    /* --- events --- */
    if (!this._struck && this.phase !== AbilityPhase.TRAVEL && this.age >= this._strikeAge) {
      this._struck = true;
      this.ctx.shake.add(c.splitShake * 0.4, 4, 26);
      this.lightBoost = c.lightIntensity * 0.8;
    }
    if (!this._split && this._struck && this.age >= this._splitAge) {
      this._split = true;
      this._splitFx(centre);
    }

    /* --- the prism --- */
    this._bob += c.hoverBobSpeed * dt;
    const spinRate = this._struck && !this._shattered ? c.spinStrike : c.spin;
    this._spin += spinRate * TAU * dt * g.animationSpeed;

    const height = this._prismHeight();
    this._prismPoint.set(centre.x, height, centre.z);
    this.prism.position.copy(this._prismPoint);
    _axis.set(Math.cos(this._spin * 0.37), 0, Math.sin(this._spin * 0.37));
    _tiltQ.setFromAxisAngle(_axis, c.tilt);
    _spinQ.setFromAxisAngle(_up, this._spin);
    this.prism.quaternion.copy(_tiltQ).multiply(_spinQ);
    this.prism.scale.set(c.prismRadius, c.prismHeight, c.prismRadius);

    let charge;
    if (!this._struck) {
      // A slow build while it hangs: the sun is gathering in it.
      const hang = saturate((this.age - this._descent) / Math.max(0.05, c.chargeTime));
      charge = 0.25 * Easing.inQuad(hang);
    } else if (!this._split) {
      charge = 1.2;
    } else {
      const linger = saturate((this.age - this._splitAge - this._sweepTime) / Math.max(0.05, c.lingerTime));
      charge = lerp(0.85, 0.4, linger) * (1 + 0.1 * Math.sin(this.age * 40));
    }
    const gs = this._glassState;
    gs.charge = this._shattered ? 0 : charge;
    gs.fade = 1;
    gs.seed = this._seed;
    this.glassMaterial.userData.sync(gs);
    this.prism.visible = !this._shattered;

    /* --- the fade envelope after the shatter --- */
    const fadeT = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;
    const outro = 1 - Easing.inQuad(fadeT);

    /* --- the sun shaft --- */
    const bs = this._beamState;
    const shaftIn = Easing.outCubic(saturate(this.age / 0.35));
    const shaftDim = this._split ? lerp(1, 0.45, saturate((this.age - this._splitAge) / 0.4)) : 1;
    bs.reach = shaftIn;
    bs.fade = shaftDim * outro * (this._shattered ? 0.6 : 1);
    this.shaftMaterial.userData.sync(bs);
    // Source in the sky, +Y pointing down to the floor.
    this.shaft.position.set(centre.x, c.shaftHeight, centre.z);
    this.shaft.quaternion.setFromUnitVectors(_up, _down);
    this.shaft.scale.set(1, c.shaftHeight, 1);
    this.shaft.visible = bs.fade > 0.001;

    /* --- the strike --- */
    if (this._struck && !this._shattered) {
      const lead = Math.max(0.01, c.strikeLead);
      bs.reach = Easing.outQuad(saturate((this.age - this._strikeAge) / lead));
      bs.fade = 1;
      this.strikeMaterial.userData.sync(bs);
      const top = c.shaftHeight;
      const span = Math.max(0.1, top - height);
      this.strike.position.set(centre.x, top, centre.z);
      this.strike.quaternion.setFromUnitVectors(_up, _down);
      this.strike.scale.set(1, span, 1);
      this.strike.visible = true;
    } else {
      this.strike.visible = false;
    }

    /* --- the spectrum --- */
    const p = this._progress();
    this._beamsLive = 0;
    if (this._split && !this._shattered) {
      const drawn = Easing.outCubic(saturate((this.age - this._splitAge) / 0.12));
      for (let i = 0; i < MAX_BEAMS; i++) {
        const beam = this.beams[i];
        if (i >= count) {
          beam.visible = false;
          continue;
        }
        this._contactPoint(i, p, centre, _contact);
        _dir.subVectors(_contact, this._prismPoint);
        const length = Math.max(0.05, _dir.length());
        _dir.divideScalar(length);

        bs.reach = drawn;
        bs.fade = 1;
        bs.color = this._colors[i];
        this.beamMaterials[i].userData.sync(bs);
        beam.position.copy(this._prismPoint);
        beam.quaternion.setFromUnitVectors(_up, _dir);
        beam.scale.set(1, length, 1);
        beam.visible = true;
        this._beamsLive++;

        if (drawn >= 1) this._contactFx(i, _contact, dt, time);
        this._lastContact[i].copy(_contact);
      }
      this._burnThrough(centre, p, count);
    } else {
      for (const beam of this.beams) beam.visible = false;
    }

    /* --- the scorch --- */
    const ss = this._scorchState;
    ss.radius = this.radius;
    ss.extent = this.radius * Math.max(1, c.sweepOuter) + c.scorchWidth + 0.6;
    ss.extent = Math.max(ss.extent, c.shaftRadius * c.poolRadius + 0.2);
    ss.count = count;
    ss.progress = p;
    const lingerT = this._split ? saturate((this.age - this._splitAge - this._sweepTime) / Math.max(0.05, c.lingerTime)) : 0;
    ss.live = this._split && !this._shattered ? 1 - lingerT * 0.6 : this._shattered ? 0.25 * outro : 0;
    ss.pool = shaftIn * shaftDim * (this._shattered ? 0.3 : 1);
    ss.fade = outro;
    ss.seed = this._seed;
    this.charMaterial.userData.sync(ss);
    this.heatMaterial.userData.sync(ss);
    this.char.position.set(centre.x, 0.025, centre.z);
    this.char.scale.set(ss.extent * 2, 1, ss.extent * 2);
    this.heat.position.copy(this.char.position);
    this.heat.scale.copy(this.char.scale);

    /* --- the light rides the prism --- */
    this.position.copy(this._prismPoint);

    /* --- motes in the shaft --- */
    if (!this._shattered || outro > 0.3) this._shaftFx(dt, centre, height, shaftDim * outro);
  }

  _syncParticles() {
    const c = settings.prism;
    const g = settings.global;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, -0.15, 0);
    this.motes.uniforms.uSizeScale.value = c.moteSize * g.particleSize * 3;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = 0.4 * g.turbulence;

    // Sparks and glints are white in the gradient and tinted per emit, so
    // one system carries every hue of the spectrum.
    this.sparks.setGradient(_white, _white, _white, getColor(c.colorMoteD));
    this.sparks.uniforms.uGravity.value.set(0, c.sparkGravity, 0);
    this.sparks.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 3;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.beamIntensity * 0.5 * g.glow;

    this.glints.setGradient(_white, _white, _white, getColor(c.colorMoteD));
    this.glints.uniforms.uGravity.value.set(0, -2.5, 0);
    this.glints.uniforms.uSizeScale.value = c.glintSize * g.particleSize * 3;
    this.glints.uniforms.uLifeScale.value = g.particleLifetime;
    this.glints.uniforms.uSpeedScale.value = g.particleSpeed;
    this.glints.uniforms.uOpacity.value = g.opacity;
    this.glints.uniforms.uGlow.value = c.glintGlow * g.glow;
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /** A body a contact point crosses is cut down where it stands. */
  _burnThrough(centre, p, count) {
    const field = this.ctx.dummies;
    if (!field?.findTargets || p <= 0) return;
    const c = settings.prism;
    const hit = settings.dummies.hit;
    const reach = c.scorchWidth + c.beamWidth + 0.15;
    for (let i = 0; i < count; i++) {
      this._contactPoint(i, p, centre, _contact);
      const found = field.findTargets(_contact.x, _contact.z, reach, this._targets);
      for (const dummy of found) {
        // Thrown along the way the beam is travelling.
        const a = this._phases[i] + c.sweepAngle * p;
        const s = Math.sign(c.sweepAngle) || 1;
        dummy.kill(-Math.sin(a) * s, Math.cos(a) * s, hit, true);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** A run of glints skimming the floor from the caster while the prism falls. */
  _travelFx(dt) {
    const c = settings.prism;
    const g = settings.global;
    const count = Math.round(this.sparkEmitter.tick(dt, c.moteRate * 0.8) * g.particleCount);
    if (count <= 0) return;
    _pos.copy(this.position).setY(0.15);
    _emit.position = _pos;
    _emit.radius = 0.25;
    _emit.direction = _dir.copy(this.direction).setY(0.6).normalize();
    _emit.speed = c.moteSpeed * 2;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.8;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLifetime * 0.5;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(count, _emit);
  }

  /** Glittering motes drifting down the shaft. */
  _shaftFx(dt, centre, height, strength) {
    const c = settings.prism;
    const g = settings.global;
    const count = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (count <= 0) return;
    _pos.set(centre.x, randRange(0.3, Math.max(0.5, height * 1.6)), centre.z);
    _emit.position = _pos;
    _emit.radius = c.shaftRadius * 0.9;
    _emit.direction = _dir.set(0, -1, 0);
    _emit.speed = c.moteSpeed;
    _emit.speedVariance = 0.7;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 1;
    _emit.sizeVariance = 0.6;
    _emit.life = c.moteLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(count, _emit);
  }

  /** Sparks off a contact point, and scorch decals laid per metre travelled. */
  _contactFx(i, contact, dt, time) {
    const c = settings.prism;
    const g = settings.global;
    const count = this._beamCount();

    // The spark rate is shared across the beams, so more beams is not more mess.
    const sparks = Math.round(this.sparkEmitter.tick(dt / count, c.sparkRate) * g.particleCount);
    if (sparks > 0) {
      _pos.copy(contact).setY(0.05);
      _emit.position = _pos;
      _emit.radius = c.beamWidth;
      _emit.direction = _dir.set(0, 1, 0);
      _emit.speed = c.sparkSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.7;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 1;
      _emit.sizeVariance = 0.6;
      _emit.life = c.sparkLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = this._colors[i];
      _emit.time = time;
      this.sparks.emit(sparks, _emit);
    }

    // Paid out per metre the contact travels, so the embers are as dense at
    // any sweep speed. `_lastContact` is still last frame's here (it is
    // written after this call); the clamp stops a slider jump laying a row.
    const moved = contact.distanceTo(this._lastContact[i]);
    this._decalDistance[i] += Math.min(moved, 2);
    const spacing = Math.max(0.1, c.scorchDecalSpacing);
    if (this._decalDistance[i] >= spacing) {
      this._decalDistance[i] -= spacing;
      this.ctx.decals.spawn(DecalType.SCORCH, contact, {
        radius: c.scorchDecalSize * randRange(0.8, 1.2),
        life: c.scorchDecalLife,
        intensity: 1,
        colorA: getColor(c.colorChar),
        colorB: this._colors[i]
      });
    }
  }

  /** The split: flash, shell, shockwave, a burst of glints. */
  _splitFx(centre) {
    const c = settings.prism;
    const g = settings.global;
    const time = frame.uTime.value;

    for (let i = 0; i < MAX_BEAMS; i++) {
      this._decalDistance[i] = 0;
      this._lastContact[i].set(0, 0, 0);
    }

    this.ctx.bursts.spawn(BurstMode.AIR, this._prismPoint, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * g.explosionIntensity,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.55,
      fresnel: 2.6,
      displace: 0.25,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, centre, {
      radius: c.shockRadius * g.explosionIntensity,
      life: 0.6,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    _emit.position = this._prismPoint;
    _emit.radius = c.prismRadius;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = c.glintSpeed * 0.6;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 1;
    _emit.sizeVariance = 0.6;
    _emit.life = c.glintLifetime * 0.7;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.glints.emit(Math.round(c.glintCount * 0.3 * g.particleCount), _emit);

    this.ctx.shake.add(c.splitShake * g.explosionIntensity, 1 / Math.max(0.1, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.splitFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * 2 * g.explosionIntensity;
  }

  /** The stone comes apart; whatever is left standing is thrown out. */
  _shatter() {
    const c = settings.prism;
    const g = settings.global;
    const time = frame.uTime.value;
    this._shattered = true;

    const count = this._beamCount();
    const per = Math.max(1, Math.round((c.glintCount * g.particleCount) / count));
    _emit.position = this._prismPoint;
    _emit.radius = c.prismRadius * 0.8;
    _emit.direction = _dir.set(0, 0.3, 0);
    _emit.speed = c.glintSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 1;
    _emit.sizeVariance = 0.7;
    _emit.life = c.glintLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.time = time;
    // One batch per hue: the stone shatters into the spectrum it was making.
    for (let i = 0; i < count; i++) {
      _emit.tint = this._colors[i];
      this.glints.emit(per, _emit);
    }
    _emit.tint = null;

    this.ctx.bursts.spawn(BurstMode.AIR, this._prismPoint, {
      radius: c.prismRadius,
      endRadius: c.burstSize * 0.6 * g.explosionIntensity,
      life: 0.35,
      intensity: c.burstIntensity * 0.7,
      opacity: 0.4,
      fresnel: 3,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    // Anything still standing in the circle goes with it.
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      const centre = this.pointAt(1, _centre);
      const hit = settings.dummies.hit;
      for (const dummy of field.findTargets(centre.x, centre.z, this.radius, this._targets)) {
        _dir.set(dummy.position.x - centre.x, 0, dummy.position.z - centre.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        dummy.kill(_dir.x, _dir.z, hit);
      }
    }

    this.ctx.shake.add(c.shatterShake * g.explosionIntensity, 1 / Math.max(0.1, c.shakeDuration), 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.splitFlash * 0.4 * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * g.explosionIntensity;
  }

  onDestroy() {
    this.prism.visible = false;
    this.shaft.visible = false;
    this.strike.visible = false;
    for (const beam of this.beams) beam.visible = false;
    this.char.visible = false;
    this.heat.visible = false;
    this._beamsLive = 0;
  }

  dispose() {
    this.prism.geometry.dispose();
    this.glassMaterial.dispose();
    this.beamGeometry.dispose();
    this.shaftMaterial.dispose();
    this.strikeMaterial.dispose();
    for (const material of this.beamMaterials) material.dispose();
    this.scorchGeometry.dispose();
    this.charMaterial.dispose();
    this.heatMaterial.dispose();
    super.dispose();
  }
}

/** HSV (0..1) → a linear-space Color, in place. The hues are authored in sRGB. */
function hsvToColor(h, s, v, out) {
  const hh = ((h % 1) + 1) % 1;
  const f = (n) => {
    const k = (n + hh * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return out.setRGB(f(5), f(3), f(1), SRGBColorSpace);
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F53A}  Sunfall Prism');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 90, 0.5, 'front speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'sweep lasts (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'circle radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightSpectrum', 0, 1, 0.01, 'turns through the spectrum');

  const prism = folder.addFolder('1 · The prism');
  const stone = prism.addFolder('Stone');
  R(stone, c, 'prismSides', 3, 12, 1, 'sides');
  R(stone, c, 'prismRadius', 0.05, 3, 0.01, 'waist radius (m)');
  R(stone, c, 'prismHeight', 0.1, 6, 0.01, 'height (m)');
  R(stone, c, 'prismBand', 0, 0.9, 0.01, 'waist band');
  R(stone, c, 'prismTwist', -1.5, 1.5, 0.01, 'twist (rad)');
  const motion = prism.addFolder('Fall + hover');
  R(motion, c, 'dropHeight', 1, 40, 0.1, 'falls from (m)');
  R(motion, c, 'hoverHeight', 0.3, 10, 0.05, 'hovers at (m)');
  R(motion, c, 'descentTime', 0.1, 4, 0.01, 'fall time (s)');
  R(motion, c, 'hoverBob', 0, 1, 0.01, 'bob (m)');
  R(motion, c, 'hoverBobSpeed', 0, 8, 0.01, 'bob speed');
  R(motion, c, 'spin', -3, 3, 0.01, 'turns/second');
  R(motion, c, 'spinStrike', -6, 6, 0.01, 'turns/second when struck');
  R(motion, c, 'tilt', 0, 1.2, 0.01, 'tilt (rad)');
  R(motion, c, 'chargeTime', 0, 3, 0.01, 'hangs before the strike (s)');
  const glass = prism.addFolder('Glass');
  R(glass, c, 'glassOpacity', 0, 1, 0.01, 'opacity');
  R(glass, c, 'fresnel', 0, 6, 0.01, 'fresnel');
  R(glass, c, 'fresnelPower', 0.5, 8, 0.05, 'fresnel tightness');
  R(glass, c, 'dispersion', 0, 3, 0.01, 'dispersion');
  R(glass, c, 'refraction', 0, 2, 0.01, 'refraction');
  R(glass, c, 'envIntensity', 0, 4, 0.01, 'sky reflection');
  R(glass, c, 'innerFire', 0, 6, 0.01, 'inner fire');
  R(glass, c, 'innerScale', 0.2, 12, 0.05, 'fire scale');
  R(glass, c, 'chargeGlow', 0, 12, 0.05, 'charge glow');
  glass.addColor(c, 'colorGlass').name('glass');
  glass.addColor(c, 'colorGlassDeep').name('deep');
  glass.addColor(c, 'colorGlassRim').name('edges + charge');

  const shaft = folder.addFolder('2 · Sun shaft + strike');
  R(shaft, c, 'shaftRadius', 0.1, 8, 0.05, 'radius at the floor (m)');
  R(shaft, c, 'shaftTopRadius', 0.1, 12, 0.05, 'radius at the sky (m)');
  R(shaft, c, 'shaftHeight', 4, 60, 0.5, 'height (m)');
  R(shaft, c, 'shaftIntensity', 0, 6, 0.01, 'brightness');
  R(shaft, c, 'shaftOpacity', 0, 1, 0.01, 'opacity');
  R(shaft, c, 'shaftSoftness', 0.1, 8, 0.05, 'edge softness');
  R(shaft, c, 'poolIntensity', 0, 4, 0.01, 'sun pool');
  R(shaft, c, 'poolRadius', 0.1, 3, 0.01, 'pool radius (× shaft)');
  R(shaft, c, 'strikeRadius', 0.02, 1.5, 0.01, 'strike radius (m)');
  R(shaft, c, 'strikeIntensity', 0, 20, 0.05, 'strike brightness');
  R(shaft, c, 'strikeLead', 0.01, 1.5, 0.01, 'strike → split (s)');
  R(shaft, c, 'noiseScale', 0.1, 6, 0.01, 'dust in the beams');
  R(shaft, c, 'noiseSpeed', 0, 6, 0.01, 'dust drift');
  shaft.addColor(c, 'colorSun').name('sunlight');
  shaft.addColor(c, 'colorStrike').name('strike core');

  const spectrum = folder.addFolder('3 · Spectrum');
  R(spectrum, c, 'beamCount', 1, 8, 1, 'beams');
  R(spectrum, c, 'beamWidth', 0.01, 0.6, 0.005, 'beam radius (m)');
  R(spectrum, c, 'beamIntensity', 0, 16, 0.05, 'brightness');
  R(spectrum, c, 'beamCore', 0.2, 8, 0.05, 'core tightness');
  R(spectrum, c, 'hueStart', 0, 1, 0.005, 'first hue');
  R(spectrum, c, 'hueEnd', 0, 1, 0.005, 'last hue');
  R(spectrum, c, 'saturation', 0, 1, 0.01, 'saturation');
  R(spectrum, c, 'sweepAngle', -6, 6, 0.01, 'sweep (rad)');
  R(spectrum, c, 'sweepInner', 0, 1.5, 0.01, 'starts at (× radius)');
  R(spectrum, c, 'sweepOuter', 0, 1.5, 0.01, 'ends at (× radius)');
  R(spectrum, c, 'sweepEase', 0, 1, 0.01, 'ease');
  R(spectrum, c, 'beamFlicker', 0, 1, 0.01, 'flicker');
  R(spectrum, c, 'lingerTime', 0, 3, 0.01, 'holds before the shatter (s)');

  const scorch = folder.addFolder('4 · Scorch');
  R(scorch, c, 'scorchWidth', 0.01, 0.8, 0.005, 'line half-width (m)');
  R(scorch, c, 'scorchGlow', 0, 10, 0.05, 'heat glow');
  R(scorch, c, 'scorchCool', 0.05, 8, 0.05, 'cools over (m)');
  R(scorch, c, 'scorchHue', 0, 1, 0.01, 'colour kept when cool');
  R(scorch, c, 'scorchWobble', 0, 0.4, 0.005, 'wobble (m)');
  R(scorch, c, 'scorchOpacity', 0, 1, 0.01, 'char opacity');
  R(scorch, c, 'scorchFade', 0.1, 8, 0.05, 'fades over (s)');
  R(scorch, c, 'scorchDecalSpacing', 0.1, 4, 0.05, 'ember decal every (m)');
  R(scorch, c, 'scorchDecalSize', 0.05, 2, 0.01, 'ember decal radius (m)');
  R(scorch, c, 'scorchDecalLife', 0.1, 8, 0.05, 'ember decal life');
  scorch.addColor(c, 'colorChar').name('char');

  const fx = folder.addFolder('5 · Motes + glints');
  R(fx, c, 'moteRate', 0, 600, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteSpeed', 0, 6, 0.01, 'mote speed');
  R(fx, c, 'moteLifetime', 0.1, 6, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 8, 0.01, 'mote glow');
  R(fx, c, 'sparkRate', 0, 800, 1, 'sparks/second');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(fx, c, 'sparkLifetime', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -30, 2, 0.1, 'spark gravity');
  R(fx, c, 'glintCount', 0, 800, 1, 'glints on the shatter');
  R(fx, c, 'glintSize', 0.005, 0.4, 0.005, 'glint size');
  R(fx, c, 'glintSpeed', 0, 30, 0.1, 'glint speed');
  R(fx, c, 'glintLifetime', 0.05, 4, 0.01, 'glint lifetime');
  R(fx, c, 'glintGlow', 0, 10, 0.01, 'glint glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');

  const impact = folder.addFolder('6 · Impact');
  R(impact, c, 'splitFlash', 0, 1, 0.01, 'flash on the split');
  R(impact, c, 'splitShake', 0, 1, 0.01, 'knock on the split');
  R(impact, c, 'shatterShake', 0, 1, 0.01, 'knock on the shatter');
  R(impact, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(impact, c, 'burstSize', 0, 10, 0.05, 'light shell (m)');
  R(impact, c, 'burstIntensity', 0, 6, 0.01, 'shell brightness');
  R(impact, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  impact.addColor(c, 'colorBurstA').name('shell inner');
  impact.addColor(c, 'colorBurstB').name('shell mid');
  impact.addColor(c, 'colorBurstC').name('shell outer');
  impact.addColor(c, 'colorShockA').name('shockwave');
  impact.addColor(c, 'colorShockB').name('shockwave hot');
  impact.addColor(c, 'colorFlash').name('flash');
}
