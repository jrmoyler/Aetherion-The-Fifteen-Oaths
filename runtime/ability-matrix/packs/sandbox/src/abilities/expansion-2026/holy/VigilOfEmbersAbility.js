import { BufferAttribute, BufferGeometry, Group, Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { getColor } from '../../../utils/color.js';
import { impactForce } from '../AuthoredImpactForce.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { ExpansionAtmosphere, prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { VigilPulses } from './VigilPulses.js';
import {
  vigilArchGeometry,
  vigilFlameGeometry,
  vigilCurtainGeometry,
  vigilBellGeometry,
  vigilCrownGeometry,
  vigilShaftGeometry
} from './VigilGeometry.js';
import {
  createVigilArchMaterial,
  createVigilGiltMaterial,
  createVigilFlameMaterial,
  createVigilFloorMaterial,
  createVigilCurtainMaterial,
  createVigilShaftMaterial,
  createVigilWarpMaterial,
  createVigilGroundMaterial,
  createVigilRunnerMaterial
} from './VigilMaterials.js';

export { vigilArchGeometry, vigilFlameGeometry, vigilCurtainGeometry } from './VigilGeometry.js';

export const ID = 'exp-vigil-of-embers';
export const UID = 'matrix-expansion/vigil-of-embers';

const TAU = Math.PI * 2;
/** Fixed rig capacities: a cast allocates nothing. */
const ARCHES = 8;
const LAMPS = 4;
const CURTAINS = 3;
const TRAVEL_ARCHES = 3;
/** Targets one pulse may address per relation — the binding's own bound. */
const MAX_PULSE_TARGETS = 8;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** A flat quad, x ∈ [-0.5, 0.5] across, z ∈ [0, 1] along; uv = (x + 0.5, z). */
function runnerGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  return geometry;
}

const _emit = {};
const _pos = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * VIGIL OF EMBERS — a sanctuary that rings.
 *
 * A zone cast whose **travel** is a votive — three small arches round a lamp
 * flame — carried to the circle. On arrival a sanctuary is raised over it and
 * stands for `lifetime`. On arrival and every `pulsePeriod` after, it asks the
 * combat binding who is inside `zoneRadius`: living allies receive a holy
 * `status` (consecration), living enemies a holy `hit`, at most eight of each.
 * A pulse is *shown* only if the binding accepted at least one of those events
 * — or if the circle was genuinely empty, which is honest to show — so a
 * refused pulse never pretends to land.
 *
 * Anticipation and travel read as one continuous procession: the votive (a
 * body-sized gilded shrine of three arches round a lamp flame) is carried at
 * `travelHeight`, and behind it a **processional runner** of light is laid
 * on the floor all the way back to the hand — gilt borders and marching rune
 * dashes on dark bronze, hottest at the votive. As it closes in, the
 * sanctuary **forms at the target before it arrives**: the dark consecrated
 * ground and the sigil start to draw round, a column of light comes down onto
 * the circle and the arches' feet begin to build (`telegraph*`). On arrival
 * the rest of the vault rises out of that half-built state, and the runner is
 * taken up from the hand end.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the votive** — three arches and a flame, turning as they travel, and
 *      the processional runner laid behind them.
 *   2. **the arches** — eight two-centred gothic arches on pillars
 *      (`vigilArchGeometry`), solid sun-lit gilded stone (pale gold falling to
 *      dark bronze in shade), that *build* from their feet up with a burning
 *      noise front, carry a gilt trim, and through the vigil **kindle**: veins
 *      of light climb from the feet to the keystone while the floor runes
 *      light one by one — the linger's own motion. A pulse climbs them too.
 *   3. **bells, lamps and crown** — four bells turned from a founder's profile
 *      that sway and ring on every pulse, four lamp flames (noise-swayed in
 *      the vertex stage, fbm tongues in the fragment) and a crown of tines.
 *   4. **floor and column** — dark bronze consecrated ground (the deep stop)
 *      under a consecrated sigil drawn round by a sweep, its
 *      rings at the true damage radius, rune cells, spokes aligned with the
 *      arches and the pulse wave; a god-ray column from the crown; heat
 *      shimmer over the lamps on `LAYER.DISTORTION`.
 *   5. **the pulse** (`VigilPulses` plus the curtains here) — an expanding
 *      curtain of light, a petal glyph, a full-radius footprint, an AIR burst
 *      and shockwave, and a knock, flash and light punch.
 *   6. **particles** — embers rising off the lamps and thrown off the floor by
 *      each pulse (the cast's own system), and ambient motes on the shared
 *      expansion transport.
 *
 * The exit is architectural: the arches, bells and crown *sink* by
 * `recedeDepth` and shrink while the flames gutter out and the floor
 * dissolves from the rim inward. Under reduced motion the visual clock is held
 * at zero and the pulse glyphs, expanding curtains, embers and camera knock
 * are skipped (the light punch still marks each pulse); the
 * pulse cadence and its combat events are unchanged.
 */
export class VigilOfEmbersAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** Pulses are committed through the binding, not the dummy field's disc. */
  get handlesOwnHits() {
    return true;
  }

  get lifetimeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  get impactDuration() {
    return this.config.lifetime * this.lifetimeScale;
  }

  get fadeDuration() {
    return this.config.fade * this.lifetimeScale;
  }

  /** Seconds since impact on the unscaled staging clock the settings are authored in. */
  get stagedTime() {
    return this.impactTime / this.lifetimeScale;
  }

  /** Meshes the standing sanctuary is drawing. HUD readout only. */
  get instanceCount() {
    if (!this.rig.visible) return 0;
    let curtains = 0;
    for (const curtain of this.curtains) if (curtain.visible) curtains++;
    return this.arches.length + this.bells.length + this.flames.length + 3 + curtains;
  }

  /** Lamp light: a slow candle gutter rather than the default glint. */
  lightShimmer() {
    return 0.86 + 0.08 * Math.sin(this.age * 5.3) + 0.06 * Math.sin(this.age * 13.1 + 1.7);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this._lightSaved = new Vector3();
    /** Every GPU resource this cast owns, disposed once each. */
    this.gs = [];
    this.ms = [];
    const g = (x) => (this.gs.push(x), x);
    const m = (x) => (this.ms.push(x), x);

    this.rig = new Group();
    this.rig.visible = false;
    this.group.add(this.rig);

    this.mat = m(createVigilArchMaterial());
    /** The votive's own arches: always fully built while the vault at the target forms. */
    this.votiveMat = m(createVigilArchMaterial());
    this.bellMat = m(createVigilGiltMaterial());
    this.crownMat = m(createVigilGiltMaterial());
    this.flameMat = m(createVigilFlameMaterial());
    this.floorMat = m(createVigilFloorMaterial());
    this.shaftMat = m(createVigilShaftMaterial());
    this.warpMat = m(createVigilWarpMaterial());
    this.pulseEffects = new VigilPulses(this.group, this.ctx, this.atmosphere, g, m);

    /* ---- 4 · the consecrated floor ---- */
    const quad = g(new PlaneGeometry(2, 2));
    this.groundMat = m(createVigilGroundMaterial());
    this.ground = new Mesh(quad, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.032;
    this.ground.renderOrder = -2;
    this.rig.add(this.ground);
    this.floor = new Mesh(quad, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.04;
    this.rig.add(this.floor);

    /* ---- 2 · the arches ---- */
    const arch = g(vigilArchGeometry());
    this.arches = [];
    for (let i = 0; i < ARCHES; i++) {
      const a = (i * TAU) / ARCHES;
      const w = new Mesh(arch, this.mat);
      w.position.set(Math.sin(a) * 2.5, 1, Math.cos(a) * 2.5);
      // Each arch faces the centre: a ring of doorways into the sanctuary.
      w.rotation.y = a;
      this.rig.add(w);
      this.arches.push(w);
    }

    /* ---- 3 · bells, lamps and crown ---- */
    const bell = g(vigilBellGeometry());
    this.bells = [];
    for (let i = 0; i < LAMPS; i++) {
      const a = (i * TAU) / LAMPS;
      const b = new Mesh(bell, this.bellMat);
      b.position.set(Math.sin(a) * 1.1, 2.9, Math.cos(a) * 1.1);
      // Turned over so it hangs from its crown (the lathe's origin).
      b.rotation.z = Math.PI;
      this.rig.add(b);
      this.bells.push(b);
    }

    const curtainGeometry = g(vigilCurtainGeometry());
    this.curtains = [];
    this.curtainMaterials = [];
    this.curtainTimes = new Array(CURTAINS).fill(-1);
    this.curtainNext = 0;
    for (let i = 0; i < CURTAINS; i++) {
      const material = m(createVigilCurtainMaterial());
      const curtain = new Mesh(curtainGeometry, material);
      curtain.visible = false;
      this.rig.add(curtain);
      this.curtains.push(curtain);
      this.curtainMaterials.push(material);
    }
    /** The first curtain, for readouts that only care about one. */
    this.curtain = this.curtains[0];

    const flame = g(vigilFlameGeometry());
    this.flames = [];
    for (let i = 0; i < LAMPS; i++) {
      const a = (i * TAU) / LAMPS;
      const f = new Mesh(flame, this.flameMat);
      f.position.set(Math.sin(a) * 1.1, 2.2, Math.cos(a) * 1.1);
      this.rig.add(f);
      this.flames.push(f);
    }

    this.crown = new Mesh(g(vigilCrownGeometry()), this.crownMat);
    this.crown.position.y = 3.2;
    this.rig.add(this.crown);

    this.shaft = new Mesh(g(vigilShaftGeometry(1)), this.shaftMat);
    this.shaft.renderOrder = -1; // behind the architecture it lights
    this.rig.add(this.shaft);

    /* ---- 1 · the votive ---- */
    this.travelVigil = new Group();
    this.travelVigil.visible = false;
    this.group.add(this.travelVigil);
    for (let i = 0; i < TRAVEL_ARCHES; i++) {
      const a = new Mesh(arch, this.votiveMat);
      a.rotation.y = (i * TAU) / TRAVEL_ARCHES;
      // Small, and lifted so the pillars stand on the votive's base.
      a.scale.setScalar(0.45);
      a.position.y = 0.45;
      this.travelVigil.add(a);
    }
    const travelFlame = new Mesh(flame, this.flameMat);
    travelFlame.position.y = 0.25;
    travelFlame.scale.setScalar(0.55);
    this.travelVigil.add(travelFlame);

    /* ---- 1 · the processional runner laid behind the votive ---- */
    this.runnerMat = m(createVigilRunnerMaterial());
    this.runner = new Mesh(g(runnerGeometry()), this.runnerMat);
    this.runner.visible = false;
    this.runner.renderOrder = -1;
    this.group.add(this.runner);
    this._runnerFront = 0;

    for (const root of [this.rig, this.travelVigil, this.runner]) {
      root.traverse((n) => {
        if (!n.isMesh) return;
        n.layers.set(LAYER.VFX);
        n.frustumCulled = false;
      });
    }

    // Heat over the lamps: a billboard on the distortion layer.
    this.warp = new Mesh(g(new PlaneGeometry(1, 1, 1, 1)), this.warpMat);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.rig.add(this.warp);

    this.scope = null;
    this.nextPulse = 0;
    this.pulseAt = -1;
    this.failure = null;
    /** How far the sanctuary had formed at the target before the votive arrived, 0..1. */
    this._pre = 0;
  }

  /** Bells, lamps and crown appear only once the votive has arrived. */
  _showUpperRig(visible) {
    for (const b of this.bells) b.visible = visible;
    for (const f of this.flames) f.visible = visible;
    this.crown.visible = visible;
  }

  /** The runner from the hand to `front` metres along the line; `take` 0..1 lifts it from the hand end. */
  _runner(front, take) {
    const c = this.config;
    const start = 0.4;
    const length = Math.max(0.01, front - start);
    this.runner.position.copy(this.origin).addScaledVector(this.direction, start);
    this.runner.position.y = 0.03;
    this.runner.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    this.runner.scale.set(c.runnerWidth ?? 1.1, 1, length);
    const u = this.runnerMat.uniforms;
    u.uClock.value = this.reduceMotion ? 0 : this.age;
    u.uFront.value = length;
    u.uTake.value = take;
    u.uFade.value = 1;
    u.uGlow.value = (c.runnerGlow ?? 1) * settings.global.glow;
    u.uColor.value.copy(getColor(c.holyColor));
    u.uCore.value.copy(getColor(c.coreColor));
    u.uDeep.value.copy(getColor(c.deepColor ?? '#3a2209'));
    this.runner.visible = front > start + 0.05 && take < 1;
  }

  createParticles() {
    this.atmosphere = new ExpansionAtmosphere(this.ctx, 'holy', {
      shape: 'SOFT',
      colors: ['#ffffff', '#fff1ca', '#ffd77f', '#997748'],
      rate: 24
    });
    this.pulseEffects.atmosphere = this.atmosphere;

    /** Embers: soft sparks rising off the lamps and thrown up by each pulse. */
    this.embers = this.ctx.particles?.get?.(`${ID}.embers`, {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.4
    }) ?? null;
    if (this.embers) {
      const u = this.embers.uniforms;
      u.uSizeIn.value = 0.1;
      u.uFadeIn.value = 0.1;
      u.uFadeOut.value = 0.55;
      u.uEndSize.value = 0.25;
      u.uDrag.value = 0.9;
    }
    this.emberEmitter = new RateEmitter();
    this._emberLamp = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.reduceMotion = prefersReducedMotion();
    this.atmosphere.reset();
    this.emberEmitter.reset();
    this.scope = bindExpansionCombat(this.ctx, UID);
    this.failure = this.scope ? null : 'combat bridge unavailable';
    this.rig.visible = false;
    this.curtainTimes.fill(-1);
    this.curtainNext = 0;
    this.pulseEffects.reset();
    for (const curtain of this.curtains) curtain.visible = false;
    this.warp.visible = false;
    // Without a binding nothing can be consecrated, so nothing is carried out.
    this.travelVigil.visible = !!this.scope;
    this.travelVigil.position.copy(this.origin);
    this.nextPulse = 0;
    this.pulseAt = -1;
    this._pre = 0;
    this._runnerFront = 0;
    this.runner.visible = false;
    this._showUpperRig(true);
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    this.atmosphere.rate = c.particleRate ?? this.atmosphere.rate;
    this.atmosphere.size = c.particleSize ?? this.atmosphere.size;
    this.atmosphere.syncPalette(c.holyColor, c.coreColor);
    if (!this.embers) return;
    this.embers.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
    const u = this.embers.uniforms;
    u.uGravity.value.set(0, 0.35, 0); // embers are lighter than air
    u.uSizeScale.value = g.particleSize;
    u.uLifeScale.value = g.particleLifetime;
    u.uSpeedScale.value = g.particleSpeed;
    u.uOpacity.value = g.opacity;
    u.uGlow.value = 1.4 * g.glow;
    u.uTurbulence.value = 0.7 * g.turbulence;
  }

  _emberParams(speed, spread, life) {
    const c = this.config;
    _emit.radius = 0.08;
    _emit.direction = _up;
    _emit.speed = speed;
    _emit.speedVariance = 0.5;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.emberSize;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.4;
    _emit.spin = 1;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  /** Embers rise off the four lamps, round-robin, at `emberRate × strength`. */
  _lampEmbers(dt, strength) {
    if (!this.embers || this.reduceMotion || dt <= 0) return;
    const c = this.config;
    const count = Math.min(32, this.emberEmitter.tick(dt, Math.max(0, c.emberRate * strength) * settings.global.particleCount));
    if (count <= 0) return;
    this._emberParams(c.emberRise, 0.35, c.emberLife);
    _emit.position = _pos;
    for (let n = 0; n < count; n++) {
      // The rig is unrotated under an identity group: world = rig + local.
      const lamp = this._emberLamp++ % this.flames.length;
      _pos.copy(this.rig.position).add(this.flames[lamp].position);
      _pos.y += 0.35 * (c.emberScale ?? 1);
      this.embers.emit(1, _emit);
    }
  }

  onTravel(dt) {
    const c = this.config;
    const t = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    this.travelVigil.position.copy(this.position);
    this.travelVigil.position.y = c.travelHeight ?? 0.7;
    this.travelVigil.rotation.y = t * (c.travelSpin ?? 0.8);
    this.travelVigil.scale.setScalar((c.travelScale ?? 1) * (0.4 + 0.6 * smooth01(this.age / 0.15)));

    const u = this.votiveMat.uniforms;
    u.uClock.value = t;
    u.uFade.value = 1;
    u.uPulse.value = 0;
    u.uBuild.value = 1;
    u.uKindle.value = 1;
    u.uGlow.value = (c.archGlow ?? 1) * settings.global.glow;
    u.uColor.value.copy(getColor(c.holyColor));
    u.uCore.value.copy(getColor(c.coreColor));
    u.uStone.value.copy(getColor(c.stoneColor ?? '#e2c48e'));
    u.uDeep.value.copy(getColor(c.deepColor ?? '#3a2209'));
    const f = this.flameMat.uniforms;
    f.uClock.value = t;
    f.uFade.value = 1;
    f.uPulse.value = 0;
    f.uSway.value = c.flameSway ?? 0.07;
    f.uGlow.value = (c.flameGlow ?? 1.4) * settings.global.glow;
    f.uColor.value.copy(getColor(c.holyColor));
    f.uCore.value.copy(getColor(c.coreColor));

    // A thin trail of embers behind the votive.
    if (this.embers && !this.reduceMotion && dt > 0) {
      const count = Math.min(8, this.emberEmitter.tick(dt, c.emberRate * 0.5 * settings.global.particleCount));
      if (count > 0) {
        _pos.copy(this.travelVigil.position).setY(this.travelVigil.position.y + 0.3);
        this._emberParams(c.emberRise * 0.5, 0.6, c.emberLife * 0.6);
        _emit.position = _pos;
        this.embers.emit(count, _emit);
      }
    }

    if (!this.scope) return;
    /* --- the processional runner, laid behind the votive --- */
    this._runnerFront = this.front;
    this._runner(this.front, 0);

    /* --- the sanctuary forms at the target before the votive arrives --- */
    const start = c.telegraphStart ?? 0.35;
    const pre = smooth01((this.u - start) / Math.max(0.05, 1 - start));
    if (pre > 0) {
      this._pre = pre;
      this.pointAt(1, this.rig.position);
      this.rig.visible = true;
      this._showUpperRig(false);
      // dt = 0: resolves the rig without pulsing or emitting.
      this.onFade(0, 0);
      this.warp.visible = false;
    }
  }

  onImpact() {
    this.travelVigil.visible = false;
    if (!this.scope) return;
    this.rig.position.copy(this.position);
    this.rig.visible = true;
    this._showUpperRig(true);
    // Arrival frame: resolve the whole rig now, unbuilt, before the first pulse.
    this.mat.uniforms.uBuild.value = 0;
    this.onFade(0, 0);
    const c = this.config;
    this.lightBoost = c.lightIntensity * (c.arrivalLight ?? 1) * settings.global.explosionIntensity;
    if (!this.reduceMotion) this.ctx.shake?.add?.((c.arrivalShake ?? 0.15) * settings.global.explosionIntensity, 2.6, 14);
  }

  /* ------------------------------------------------------------------ */
  /* The standing sanctuary                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Ask the binding who is inside, consecrate allies and strike enemies.
   * Returns true when the pulse should be shown: at least one event was
   * accepted, or both queries succeeded and the circle was empty.
   */
  _pulse(position) {
    const c = this.config;
    const allies = this.scope.queryActors({ position, radius: c.zoneRadius, relation: 'ally' });
    const enemies = this.scope.queryActors({ position, radius: c.zoneRadius, relation: 'enemy' });
    if (!allies?.ok || !enemies?.ok) this.failure = 'sanctuary query refused';
    let emitted = false;
    let attempted = false;
    for (const [query, type] of [[allies, 'status'], [enemies, 'hit']]) {
      const ids = [];
      if (query?.ok) {
        for (const actor of query.actors) {
          if (!actor.alive) continue;
          ids.push(actor.id);
          if (ids.length >= MAX_PULSE_TARGETS) break;
        }
      }
      if (!ids.length) continue;
      attempted = true;
      const event = { type, element: 'holy', position, targetIds: ids, intensity: 1 };
      if (type === 'hit') {
        event.damage = c.damage;
        event.hitForce = impactForce(c);
      }
      const out = this.scope.emit(event);
      if (out?.ok) emitted = true;
      else this.failure = out?.reason ?? 'vigil event refused';
    }
    return emitted || (!attempted && allies?.ok && enemies?.ok);
  }

  /** The accepted pulse: curtain, glyph, embers, knock, flash and light. */
  _pulseBeat(position) {
    const c = this.config;
    const g = settings.global;
    this.pulseAt = this.stagedTime;
    this.curtainTimes[this.curtainNext] = this.stagedTime;
    this.curtainNext = (this.curtainNext + 1) % this.curtains.length;
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * (c.pulseLight ?? 0.8) * (c.pulseStrength ?? 1) * g.explosionIntensity);
    if (this.reduceMotion) return;
    this.pulseEffects.fire(position, this.stagedTime, c);
    this.ctx.shake?.add?.((c.pulseShake ?? 0.12) * (c.pulseStrength ?? 1) * g.explosionIntensity, 3, 18);
    this.ctx.flash?.trigger?.(getColor(c.holyColor), (c.pulseFlash ?? 0.08) * (c.pulseStrength ?? 1) * g.explosionIntensity);
    if (this.embers) {
      _pos.set(position[0], 0.15, position[2]);
      this._emberParams(c.emberRise * 2.2, 0.55, c.emberLife * 0.8);
      _emit.position = _pos;
      _emit.radius = Math.max(0.2, c.zoneRadius * 0.6);
      this.embers.emit(Math.max(0, Math.min(96, Math.round((c.pulseEmbers ?? 28) * g.particleCount))), _emit);
    }
  }

  onFade(dt, t) {
    const c = this.config;
    const gl = settings.global;
    const visualTime = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    if (!this.reduceMotion && this.phase === AbilityPhase.IMPACT) this.atmosphere.update(dt, this.position);
    const fade = t <= 1 ? 1 : 1 - clamp01(t - 1);

    /* --- the vigil: one pulse every `pulsePeriod` while it stands --- */
    if (dt > 0 && this.scope && this.phase === AbilityPhase.IMPACT && this.stagedTime >= this.nextPulse) {
      const position = this.position.toArray();
      if (this._pulse(position)) this._pulseBeat(position);
      this.nextPulse = this.stagedTime + Math.max(0.3, c.pulsePeriod);
    }

    /* --- envelopes --- */
    const sincePulse = this.pulseAt < 0 ? -1 : this.stagedTime - this.pulseAt;
    const wave = sincePulse < 0 ? 0 : clamp01(sincePulse / 0.65);
    const flash = (sincePulse < 0 ? 0 : 1 - clamp01(sincePulse / 0.35)) * (c.pulseStrength ?? 1);
    const release = t <= 1 ? 0 : clamp01(t - 1);
    const recede = release * (c.recedeDepth ?? 1.5);
    // Whatever formed before the arrival is kept; the rest builds from there.
    const preBuild = this._pre * (c.telegraphBuild ?? 0.4);
    const preReveal = this._pre * (c.telegraphReveal ?? 0.5);
    const build = preBuild + (1 - preBuild) * smooth01(this.stagedTime / Math.max(0.05, c.buildTime ?? 0.55));
    const reveal = preReveal + (1 - preReveal) * smooth01(this.stagedTime / Math.max(0.05, c.revealTime ?? 0.6));
    // The vigil kindles: veins climb the arches, runes light, over `kindleTime`.
    const kindle = this.phase === AbilityPhase.TRAVEL ? 0 : clamp01(this.stagedTime / Math.max(0.1, c.kindleTime ?? 2.6));
    const deep = getColor(c.deepColor ?? '#3a2209');

    /* --- the runner is taken up from the hand end after the arrival --- */
    if (this.phase !== AbilityPhase.TRAVEL && this.runner.visible) {
      this._runner(this._runnerFront, clamp01(this.impactTime / Math.max(0.05, c.runnerFade ?? 0.6)));
    }
    const holy = getColor(c.holyColor);
    const core = getColor(c.coreColor);
    const gilt = getColor(c.giltColor ?? '#ffcf6a');

    this.pulseEffects.update(this.stagedTime, visualTime, fade, c, this.reduceMotion);

    /* --- 2 · the arches --- */
    const arch = this.mat.uniforms;
    arch.uClock.value = visualTime;
    arch.uFade.value = fade;
    arch.uPulse.value = flash;
    arch.uBuild.value = build;
    arch.uKindle.value = kindle;
    arch.uGlow.value = (c.archGlow ?? 1) * gl.glow;
    arch.uColor.value.copy(holy);
    arch.uCore.value.copy(core);
    arch.uStone.value.copy(getColor(c.stoneColor ?? '#e2c48e'));
    arch.uDeep.value.copy(deep);
    const archRing = c.zoneRadius * (c.archRadius ?? 0.64);
    const archSize = (c.archScale ?? 1) * (1 - release * 0.6);
    for (let i = 0; i < this.arches.length; i++) {
      const a = (i * TAU) / this.arches.length;
      const w = this.arches[i];
      // Feet on the floor at any size (the springing line sits archSize up).
      w.position.set(Math.sin(a) * archRing, archSize - recede, Math.cos(a) * archRing);
      w.scale.setScalar(archSize);
    }

    /* --- 4 · the floor --- */
    const floor = this.floorMat.uniforms;
    floor.uClock.value = visualTime;
    floor.uFade.value = fade;
    floor.uPulse.value = sincePulse < 0 ? 0 : 1 - wave;
    floor.uWave.value = wave;
    floor.uReveal.value = reveal;
    floor.uKindle.value = kindle;
    floor.uSpin.value = c.sigilSpin ?? 0.05;
    floor.uGlow.value = (c.floorGlow ?? 1) * gl.glow;
    floor.uColor.value.copy(holy);
    floor.uCore.value.copy(core);
    this.floor.scale.set(c.zoneRadius, c.zoneRadius, 1);
    const ground = this.groundMat.uniforms;
    ground.uClock.value = visualTime;
    ground.uFade.value = fade;
    ground.uReveal.value = reveal;
    ground.uDark.value = (c.groundDark ?? 0.6) * gl.opacity;
    ground.uDeep.value.copy(deep);
    ground.uColor.value.copy(holy);
    this.ground.scale.set(c.zoneRadius * 1.08, c.zoneRadius * 1.08, 1);

    /* --- 5 · the curtains, one per overlapping pulse --- */
    for (let i = 0; i < this.curtains.length; i++) {
      const curtain = this.curtains[i];
      const age = this.curtainTimes[i] < 0 ? -1 : this.stagedTime - this.curtainTimes[i];
      const reach = age < 0 ? 0 : clamp01(age / Math.max(0.1, c.waveDuration ?? 0.7));
      // Under reduced motion the expanding wave is not drawn at all (the pulse still lands).
      curtain.visible = !this.reduceMotion && age >= 0 && reach < 1;
      curtain.scale.set(Math.max(0.001, c.zoneRadius * reach), c.waveHeight ?? 2.2, Math.max(0.001, c.zoneRadius * reach));
      const u = this.curtainMaterials[i].uniforms;
      u.uClock.value = visualTime;
      u.uFade.value = fade * (1 - reach) * (c.curtainGlow ?? 0.55);
      u.uGlow.value = gl.glow;
      u.uColor.value.copy(holy);
      u.uCore.value.copy(core);
    }

    /* --- 3 · lamps --- */
    const flame = this.flameMat.uniforms;
    flame.uClock.value = visualTime;
    flame.uFade.value = fade;
    flame.uPulse.value = flash;
    flame.uSway.value = c.flameSway ?? 0.07;
    flame.uGlow.value = (c.flameGlow ?? 1.4) * gl.glow;
    flame.uColor.value.copy(holy);
    flame.uCore.value.copy(core);
    const lampRing = c.bellRadius ?? 1.1;
    for (let i = 0; i < this.flames.length; i++) {
      const a = (i * TAU) / this.flames.length;
      const f = this.flames[i];
      f.rotation.y = a + visualTime * 0.3;
      f.position.set(Math.sin(a) * lampRing, (c.flameHeight ?? 2.2) - recede, Math.cos(a) * lampRing);
      // A pulse flares the lamps; the exit gutters them out.
      f.scale.setScalar((c.emberScale ?? 1) * (1 + flash * 0.4) * (1 - release));
    }

    /* --- bells: idle sway, rung by each pulse --- */
    const bell = this.bellMat.uniforms;
    bell.uClock.value = visualTime;
    bell.uFade.value = fade;
    bell.uPulse.value = flash;
    bell.uRing.value = flash;
    bell.uGlow.value = (c.bellGlow ?? 1) * gl.glow;
    bell.uColor.value.copy(holy);
    bell.uCore.value.copy(core);
    bell.uGilt.value.copy(gilt);
    bell.uDeep.value.copy(deep);
    for (let i = 0; i < this.bells.length; i++) {
      const a = (i * TAU) / this.bells.length;
      const b = this.bells[i];
      const swing = Math.sin(visualTime * 3 + i) * (c.bellSwing ?? 0.15) + Math.sin(visualTime * 14 + i * 1.7) * (c.bellRing ?? 0.35) * flash;
      b.rotation.z = Math.PI + swing;
      b.position.set(Math.sin(a) * lampRing, (c.bellHeight ?? 2.9) - recede, Math.cos(a) * lampRing);
      b.scale.setScalar((c.bellScale ?? 1) * (1 - release * 0.6));
    }

    /* --- the crown --- */
    const crown = this.crownMat.uniforms;
    crown.uClock.value = visualTime;
    crown.uFade.value = fade;
    crown.uPulse.value = flash;
    crown.uRing.value = flash * 0.5;
    crown.uGlow.value = (c.crownGlow ?? 1.2) * gl.glow;
    crown.uColor.value.copy(holy);
    crown.uCore.value.copy(core);
    crown.uGilt.value.copy(gilt);
    crown.uDeep.value.copy(deep);
    this.crown.rotation.y = visualTime * (c.crownSpin ?? 0.4);
    this.crown.position.y = (c.crownHeight ?? 3.2) - recede;
    this.crown.scale.setScalar((c.crownRadius ?? 1) * (1 - release * 0.6));

    /* --- the column of light from the crown --- */
    const shaft = this.shaftMat.uniforms;
    shaft.uClock.value = visualTime;
    shaft.uFade.value = fade * (1 - release) * reveal;
    shaft.uPulse.value = flash;
    shaft.uFoot.value = c.shaftFoot ?? 1.6;
    shaft.uGlow.value = (c.shaftGlow ?? 0.45) * gl.glow;
    shaft.uColor.value.copy(holy);
    shaft.uCore.value.copy(core);
    this.shaft.scale.set(c.crownRadius ?? 1, Math.max(0.1, this.crown.position.y), c.crownRadius ?? 1);

    /* --- heat over the lamps --- */
    const warp = this.warpMat.uniforms;
    warp.uClock.value = visualTime;
    warp.uWidth.value = lampRing * 2.8;
    warp.uHeight.value = 1.8;
    warp.uStrength.value = (c.warpStrength ?? 0.35) * gl.distortion * fade * (1 - release);
    warp.uKick.value = flash * 0.4 * (c.warpStrength ?? 0.35) * gl.distortion;
    this.warp.position.y = (c.flameHeight ?? 2.2) + 0.6 - recede;
    this.warp.visible = !this.reduceMotion && warp.uStrength.value + warp.uKick.value > 0.005;

    if (this.phase === AbilityPhase.IMPACT) this._lampEmbers(dt, fade);
  }

  /** The light burns among the lamps, not on the floor. */
  _updateLight(dt, scale) {
    if (this.phase === AbilityPhase.TRAVEL || !this.rig.visible) return super._updateLight(dt, scale);
    this._lightSaved.copy(this.position);
    this.position.y = (this.config.flameHeight ?? 2.2) * 0.6;
    try {
      super._updateLight(dt, scale);
    } finally {
      this.position.copy(this._lightSaved);
    }
  }

  onDestroy() {
    this.rig.visible = false;
    this.travelVigil.visible = false;
    this.runner.visible = false;
    this.warp.visible = false;
    for (const curtain of this.curtains) curtain.visible = false;
    this.pulseEffects.reset();
    this.scope = null;
  }

  dispose() {
    for (const x of this.gs) x.dispose();
    for (const x of this.ms) x.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F56F}  Vigil of Embers');
  // Hosts without nested folders (headless harnesses) get one flat folder.
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const R = (f, key, min, max, step, label) =>
    typeof Editor?.range === 'function' ? Editor.range(f, c, key, min, max, step, label) : f.add(c, key, min, max, step);
  const C = (f, key, label) => {
    const control = f.addColor(c, key);
    control?.name?.(label);
    return control;
  };
  const G = (f, prefix, title) => {
    if (typeof Editor?.gradient === 'function' && typeof f.addFolder === 'function') return Editor.gradient(f, c, prefix, title);
    for (const stop of ['A', 'B', 'C', 'D']) C(f, `${prefix}${stop}`, `${title} ${stop}`);
    return f;
  };

  const cast = sub(folder, 'The cast');
  R(cast, 'range', 1, 48, 0.1, 'max range');
  R(cast, 'minRange', 0, 20, 0.1, 'min range');
  R(cast, 'speed', 1, 60, 0.1, 'votive speed (m/s)');
  R(cast, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, 'zoneRadius', 1, 8, 0.1, 'sanctuary radius (m)');
  R(cast, 'lifetime', 2, 8, 0.1, 'stands for (s)');
  R(cast, 'fade', 0.1, 5, 0.1, 'sinks away over (s)');
  if (typeof Editor?.castAnimation === 'function') Editor.castAnimation(cast, c);
  else cast.add(c, 'castAnim', CAST_ANIMATIONS);

  const vigil = sub(folder, 'The vigil');
  R(vigil, 'pulsePeriod', 0.3, 3, 0.1, 'pulse every (s)');
  R(vigil, 'damage', 0.1, 2, 0.1, 'damage per pulse');
  R(vigil, 'hitImpulse', 0, 24, 0.1, 'knock-back (m/s)');
  R(vigil, 'hitLift', 0, 20, 0.1, 'lift (m/s)');
  R(vigil, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light + palette');
  C(light, 'lightColor', 'light colour');
  R(light, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, 'pulseLight', 0, 3, 0.05, 'pulse punch (× intensity)');
  R(light, 'arrivalLight', 0, 3, 0.05, 'arrival punch (× intensity)');
  C(light, 'holyColor', 'holy light');
  C(light, 'coreColor', 'white core');
  C(light, 'giltColor', 'gilt');

  const votive = sub(folder, '1 · Votive');
  R(votive, 'travelScale', 0.25, 2, 0.05, 'size');
  R(votive, 'travelHeight', 0, 3, 0.05, 'height (m)');
  R(votive, 'travelSpin', -6, 6, 0.05, 'turn (rad/s)');
  R(votive, 'runnerWidth', 0.1, 4, 0.05, 'runner width (m)');
  R(votive, 'runnerGlow', 0, 4, 0.05, 'runner glow');
  R(votive, 'runnerFade', 0.05, 3, 0.05, 'runner taken up over (s)');
  R(votive, 'telegraphStart', 0, 0.95, 0.01, 'sanctuary forms from (× carry)');
  R(votive, 'telegraphBuild', 0, 1, 0.01, 'arches built before arrival');
  R(votive, 'telegraphReveal', 0, 1, 0.01, 'sigil drawn before arrival');

  const arches = sub(folder, '2 · Arches');
  R(arches, 'archRadius', 0.2, 1.2, 0.01, 'stand at (× radius)');
  R(arches, 'archScale', 0.3, 2.5, 0.05, 'size');
  R(arches, 'archGlow', 0, 4, 0.05, 'glow');
  R(arches, 'buildTime', 0.05, 2, 0.01, 'build (s)');
  R(arches, 'recedeDepth', 0, 4, 0.1, 'sink on exit (m)');
  R(arches, 'kindleTime', 0.1, 8, 0.05, 'veins kindle over (s)');
  C(arches, 'stoneColor', 'gilded stone');
  C(arches, 'deepColor', 'deep bronze');

  const lamps = sub(folder, '3 · Bells, lamps + crown');
  R(lamps, 'bellHeight', 1, 5, 0.05, 'bells hang at (m)');
  R(lamps, 'bellScale', 0.25, 3, 0.05, 'bell size');
  R(lamps, 'bellRadius', 0.2, 3, 0.05, 'lamp ring (m)');
  R(lamps, 'bellSwing', 0, 0.8, 0.01, 'idle sway (rad)');
  R(lamps, 'bellRing', 0, 1.2, 0.01, 'ring swing (rad)');
  R(lamps, 'bellGlow', 0, 4, 0.05, 'bell glow');
  R(lamps, 'emberScale', 0.25, 2, 0.05, 'flame size');
  R(lamps, 'flameHeight', 0.5, 5, 0.05, 'flames at (m)');
  R(lamps, 'flameGlow', 0, 5, 0.05, 'flame glow');
  R(lamps, 'flameSway', 0, 0.4, 0.005, 'flame lick (m)');
  R(lamps, 'crownHeight', 1, 6, 0.05, 'crown at (m)');
  R(lamps, 'crownRadius', 0.2, 3, 0.05, 'crown radius (m)');
  R(lamps, 'crownSpin', -3, 3, 0.05, 'crown turn (rad/s)');
  R(lamps, 'crownGlow', 0, 4, 0.05, 'crown glow');
  R(lamps, 'pulseStrength', 0, 2, 0.05, 'pulse flare');

  const floor = sub(folder, '4 · Floor + column');
  R(floor, 'floorGlow', 0, 3, 0.05, 'sigil glow');
  R(floor, 'groundDark', 0, 1, 0.01, 'consecrated ground darkness');
  R(floor, 'revealTime', 0.05, 2, 0.01, 'sigil draws in (s)');
  R(floor, 'sigilSpin', -1, 1, 0.01, 'sigil turn (rad/s)');
  R(floor, 'shaftGlow', 0, 2, 0.01, 'column glow');
  R(floor, 'shaftFoot', 0.5, 4, 0.05, 'column foot (× crown)');
  R(floor, 'warpStrength', 0, 2, 0.01, 'heat shimmer');

  const pulse = sub(folder, '5 · Pulse');
  R(pulse, 'waveHeight', 0.25, 6, 0.1, 'curtain height (m)');
  R(pulse, 'waveDuration', 0.1, 2, 0.05, 'curtain sweep (s)');
  R(pulse, 'curtainGlow', 0, 2, 0.05, 'curtain glow');
  R(pulse, 'glyphGlow', 0, 2, 0.05, 'glyph + burst glow');
  R(pulse, 'glyphRise', 0, 1, 0.05, 'glyph lift (m)');
  R(pulse, 'footprintGlow', 0, 2, 0.05, 'footprint glow');
  R(pulse, 'footprintDuration', 0.05, 1, 0.05, 'footprint (s)');
  R(pulse, 'pulseShake', 0, 1, 0.01, 'camera knock');
  R(pulse, 'pulseFlash', 0, 1, 0.01, 'flash');
  R(pulse, 'arrivalShake', 0, 1, 0.01, 'arrival knock');

  const motes = sub(folder, '6 · Particles');
  R(motes, 'particleRate', 0, 100, 1, 'ambient motes/second');
  R(motes, 'particleSize', 0.02, 0.5, 0.01, 'mote size');
  R(motes, 'emberRate', 0, 200, 1, 'lamp embers/second');
  R(motes, 'emberSize', 0.005, 0.4, 0.005, 'ember size');
  R(motes, 'emberLife', 0.1, 5, 0.05, 'ember life (s)');
  R(motes, 'emberRise', 0, 6, 0.05, 'ember rise (m/s)');
  R(motes, 'pulseEmbers', 0, 96, 1, 'embers per pulse');
  G(motes, 'colorEmber', 'ember gradient');

  return folder;
}
