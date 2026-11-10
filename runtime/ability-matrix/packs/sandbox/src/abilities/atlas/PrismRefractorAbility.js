import { Color, Mesh, Quaternion, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createPrismGeometry,
  createSegmentRibbonGeometry,
  createRefractorFloorGeometry,
  createRefractorQuadGeometry
} from '../../assets/atlas/PrismRefractorGeometry.js';
import {
  createRefractorLanceMaterial,
  createRefractorCrystalMaterial,
  createRefractorBeamMaterial,
  createRefractorSigilMaterial,
  createRefractorWarpMaterial,
  createRefractorPathMaterial,
  createRefractorPoolMaterial,
  createRefractorBeamBurnMaterial
} from '../../materials/atlas/PrismRefractorMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'refractor';

/** Refracted beams. The editor's `beamCount` slider clamps to this. */
const MAX_BEAMS = 3;
const TAU = Math.PI * 2;

/** Where the cast is. */
const Stage = Object.freeze({
  /** Building in the hand. */
  CHARGE: 0,
  /** In flight down the line; the prism forms ahead of it. */
  FLIGHT: 1,
  /** It struck the prism; the beams leave on their own clocks. */
  SPLIT: 2,
  /** Every beam has landed; the prism cracks, holds, shatters, fades. */
  SPENT: 3
});

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _from = new Vector3();
const _to = new Vector3();
const _axis = new Vector3();
const _up = new Vector3(0, 1, 0);
const _spinQ = new Quaternion();
const _tiltQ = new Quaternion();
const _white = new Color(1, 1, 1);

/**
 * REFRACTOR — Prism Refractor.
 *
 * Sunfall Prism is a zone of falling light that *sweeps* the floor. The
 * Refractor is a **line shot that splits**: a precise, three-beat event.
 *
 *   1. **charge** — a lance of compressed light builds in the hand for
 *      `chargeTime`: short and fat, rings racing up it faster and faster,
 *      motes being drawn *into* it.
 *   2. **flight** — it leaves as a long, tapered bolt at `speed`, the air
 *      shimmering in its wake. `prismLead` seconds before it arrives, a
 *      spinning crystal column **materialises** at the end of the line —
 *      scanned up out of nothing, bottom to top.
 *   3. **split** — the lance hits the prism: a white flood, a shell of light,
 *      a lens of strain, the prism spins up. After `splitDelay`, the beams
 *      leave **one at a time**, `beamStagger` apart. Each picks its target the
 *      instant it fires (the nearest live body within `beamRange` that no other
 *      beam has taken, else a point on a fan off the line) so a body that
 *      moves or dies mid-split is never shot twice. Each beam races out, lands
 *      with a stamped refraction sigil, a racing shock ring, a flash and a
 *      shell, and kills what it hits; and with each, the crystal **cracks**
 *      further.
 *   4. **shatter** — after the last beam has held, the prism stops, the
 *      cracks blaze and it comes apart facet by facet into shards, while the
 *      sigils wipe out.
 *
 * ## Layers
 *
 *   1. **LANCE** (`createRefractorLanceMaterial`) — a vertex-placed ribbon,
 *      white core, charge rings, hot head.
 *   2. **PRISM** (`createPrismGeometry` + `createRefractorCrystalMaterial`) —
 *      a faceted capped column: dispersive sky refraction, caustic bands,
 *      drawn edges, the materialise scan, a charge flood, a voronoi crack
 *      network that grows per beam and a facet-by-facet shatter.
 *   3. **BEAMS** (`createRefractorBeamMaterial`) — three ribbons, each its own
 *      hue, with reach / punch / pinch envelopes and photon packets.
 *   4. **IMPACT SIGILS** (`createRefractorSigilMaterial`) — a stamped seal
 *      and a racing shock ring per landing; plus SHOCKWAVE and SCORCH decals
 *      and an AIR shell.
 *   5. **PARTICLES** — SOFT motes drawn into the charging lance and shed in
 *      flight; STREAK sparks tinted per beam at each landing; lit CHIP shards
 *      in the beam hues when the prism shatters.
 *   6. **HEAT WARP** (LAYER.DISTORTION) — a wake behind the lance and a lens
 *      round the struck prism.
 *   7. **FEEDBACK** — flash, shake and light punch on the strike and on every
 *      landing, the light riding the newest beam's target.
 *   8. **LIGHT PATH** (`createRefractorPathMaterial`) — the travel made to
 *      stay: a filament from the hand to the lance's head that holds hand →
 *      prism after the strike and drains into the prism, plus the same path
 *      burned flat on the floor as a deep-blue rune scar that outlives it.
 *   9. **CAUSTIC POOL** (`createRefractorPoolMaterial`) — the floor under the
 *      prism: a deep-indigo glass shadow crossed by a moving caustic web and
 *      three spectral lobes in the beam hues, turning with the crystal.
 *
 * ## Decisions
 *
 * `handlesOwnHits` is true: the lance's own line must not kill — the shot is
 * about the *split*, and what it kills is what the beams land on.
 *
 * `advance` is the base class's while the lance flies; the charge holds the
 * front at zero. `onImpact` is the lance reaching the prism; the impact phase
 * is then sized to cover the split, the stagger, the holds and `lifetime`, so
 * the fade phase is the shatter-out.
 *
 * Records keep only decisions (target, colour slot, fire age). Everything else
 * resolves from `settings.refractor` each frame.
 */
export class PrismRefractorAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.ribbonGeometry = createSegmentRibbonGeometry(32);
    this.floorGeometry = createRefractorFloorGeometry();
    this.quadGeometry = createRefractorQuadGeometry();

    /* ---- layer 1: lance ---- */
    this.lanceMaterial = createRefractorLanceMaterial();
    this.lance = new Mesh(this.ribbonGeometry, this.lanceMaterial);
    this.lance.name = 'RefractorLance';
    this.lance.layers.set(LAYER.VFX);
    this.lance.frustumCulled = false;
    this.lance.renderOrder = 15;
    this.lance.visible = false;
    this.group.add(this.lance);

    /* ---- layer 2: prism ---- */
    this._shapeKey = '';
    this.crystalMaterial = createRefractorCrystalMaterial();
    this.prism = new Mesh(this._buildPrism(), this.crystalMaterial);
    this.prism.name = 'RefractorPrism';
    this.prism.layers.set(LAYER.VFX);
    this.prism.renderOrder = 14;
    this.prism.visible = false;
    this.group.add(this.prism);

    /* ---- layers 3, 4: beams and their sigils ---- */
    this.beams = [];
    for (let i = 0; i < MAX_BEAMS; i++) {
      const material = createRefractorBeamMaterial();
      const mesh = new Mesh(this.ribbonGeometry, material);
      mesh.name = `RefractorBeam${i}`;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 16;
      mesh.visible = false;

      const sigilMaterial = createRefractorSigilMaterial();
      const sigil = new Mesh(this.floorGeometry, sigilMaterial);
      sigil.name = `RefractorSigil${i}`;
      sigil.layers.set(LAYER.VFX);
      sigil.frustumCulled = false;
      sigil.renderOrder = 3;
      sigil.visible = false;

      // The beam's path burned on the floor, prism foot → landing.
      const burnMaterial = createRefractorBeamBurnMaterial();
      const burn = new Mesh(this.ribbonGeometry, burnMaterial);
      burn.name = `RefractorBeamBurn${i}`;
      burn.layers.set(LAYER.VFX);
      burn.frustumCulled = false;
      burn.renderOrder = 4;
      burn.visible = false;

      this.group.add(mesh, sigil, burn);
      this.beams.push({
        mesh,
        material,
        sigil,
        sigilMaterial,
        burn,
        burnMaterial,
        burnState: { from: new Vector3(), to: new Vector3(), reach: 0, level: 0, fade: 0, color: null },
        fired: false,
        landed: false,
        fireAge: 0,
        landAge: 0,
        dummy: null,
        from: new Vector3(),
        target: new Vector3(),
        color: new Color(),
        spin: 0,
        state: { from: new Vector3(), to: new Vector3(), reach: 0, level: 0, pinch: 0, widthScale: 1, arc: 0, color: null },
        sigilState: { stamp: 1, ring: 0, life: 0, spin: 0, color: null }
      });
    }

    /* ---- layer 8: the light path (air + floor scar) ---- */
    this.pathMaterial = createRefractorPathMaterial('air');
    this.path = new Mesh(this.ribbonGeometry, this.pathMaterial);
    this.path.name = 'RefractorPath';
    this.scarMaterial = createRefractorPathMaterial('floor');
    this.scar = new Mesh(this.ribbonGeometry, this.scarMaterial);
    this.scar.name = 'RefractorPathScar';
    this.path.renderOrder = 13;
    this.scar.renderOrder = 4;
    for (const mesh of [this.path, this.scar]) {
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }
    this._pathState = { from: new Vector3(), to: new Vector3(), reach: 0, level: 0, fade: 0 };
    this._scarState = { from: new Vector3(), to: new Vector3(), reach: 0, level: 0, fade: 0 };

    /* ---- layer 9: the caustic pool under the prism ---- */
    this.poolMaterial = createRefractorPoolMaterial();
    this.pool = new Mesh(this.floorGeometry, this.poolMaterial);
    this.pool.name = 'RefractorPool';
    this.pool.layers.set(LAYER.VFX);
    this.pool.frustumCulled = false;
    this.pool.renderOrder = 2;
    this.pool.visible = false;
    this.group.add(this.pool);
    this._poolState = { level: 0, flare: 0, spin: 0 };

    /* ---- layer 6: warps ---- */
    this.wakeMaterial = createRefractorWarpMaterial('lance');
    this.wake = new Mesh(this.quadGeometry, this.wakeMaterial);
    this.lensMaterial = createRefractorWarpMaterial('prism');
    this.lens = new Mesh(this.quadGeometry, this.lensMaterial);
    for (const mesh of [this.wake, this.lens]) {
      mesh.layers.set(LAYER.DISTORTION);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }

    this._lanceState = { from: new Vector3(), to: new Vector3(), charge: 0, widthScale: 1 };
    this._crystalState = { form: 0, span: 1, charge: 0, crack: 0, shatter: 0, seed: 0 };
    this._warpState = { from: new Vector3(), to: new Vector3(), strength: 0, size: 1 };

    this._targets = [];
    this._hand = new Vector3();
    this._head = new Vector3();
    this._prismPoint = new Vector3();

    this._stage = Stage.SPENT;
    this._chargeAge = 0;
    this._strikeAge = 0;
    this._spentAge = 0;
    this._spin = 0;
    this._bob = 0;
    this._seed = 0;
    this._formAge = 0;
    this._beamsLanded = 0;
    this._shattered = false;
  }

  _buildPrism() {
    const c = settings.refractor;
    return createPrismGeometry({ sides: c.prismSides, height: c.prismHeight, cap: c.prismCap, bands: 3 });
  }

  _syncGeometry() {
    const c = settings.refractor;
    const key = `${Math.round(c.prismSides)}|${c.prismHeight.toFixed(3)}|${c.prismCap.toFixed(3)}`;
    if (key === this._shapeKey) return;
    this._shapeKey = key;
    const previous = this.prism.geometry;
    this.prism.geometry = this._buildPrism();
    previous.dispose();
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('refractor.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 1.8;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.05;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uTurbulence.value = 0.2;

    this.sparks = particles.get('refractor.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 1.0;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uSizeIn.value = 0.01;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uStretch.value = 0.1;

    this.shards = particles.get('refractor.shards', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: true,
      lit: true,
      softFade: 0.15
    });
    this.shards.uniforms.uDrag.value = 0.5;
    this.shards.uniforms.uEndSize.value = 0.5;
    this.shards.uniforms.uSizeIn.value = 0.02;
    this.shards.uniforms.uFadeIn.value = 0.02;
    this.shards.uniforms.uFadeOut.value = 0.45;
    this.shards.uniforms.uTurbulence.value = 0;

    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  /** Beams fired. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < MAX_BEAMS; i++) if (this.beams[i].fired) n++;
    return n;
  }

  _beamCount() {
    return Math.max(1, Math.min(MAX_BEAMS, Math.round(settings.refractor.beamCount)));
  }

  /** Seconds a beam lives from firing: race, hold, pinch. */
  _beamSpan() {
    const c = settings.refractor;
    return Math.max(0.01, c.beamGrow) + Math.max(0, c.beamHold) + Math.max(0.01, c.beamPinch);
  }

  /** Age (from the strike) at which beam `i` fires. */
  _fireAt(i) {
    const c = settings.refractor;
    return Math.max(0, c.splitDelay) + i * Math.max(0, c.beamStagger);
  }

  /** The strike → last beam pinched → `lifetime` hold. */
  get impactDuration() {
    const c = settings.refractor;
    const g = settings.global;
    return Math.max(0.1, this._fireAt(this._beamCount() - 1) + this._beamSpan() + c.lifetime * g.lifetime);
  }

  /** The shatter-out, and long enough for the sigils to finish. */
  get fadeDuration() {
    const c = settings.refractor;
    const g = settings.global;
    return Math.max(0.1, c.fadeTime * g.lifetime, c.sigilLife * g.lifetime - this._beamSpan() - c.lifetime * g.lifetime);
  }

  lightShimmer() {
    return this._stage === Stage.CHARGE ? 0.6 + 0.4 * Math.random() : 0.92 + 0.08 * Math.sin(this.age * 23);
  }

  /** Hold the front at zero while the lance charges in the hand. */
  advance(dt) {
    if (this._stage === Stage.CHARGE) return false;
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.refractor;
    this._stage = Stage.CHARGE;
    this._chargeAge = 0;
    this._strikeAge = 0;
    this._spentAge = 0;
    this._spin = Math.random() * TAU;
    this._bob = Math.random() * TAU;
    this._seed = Math.random() * 100;
    this._formAge = 0;
    this._beamsLanded = 0;
    this._shattered = false;
    this._targets.length = 0;
    this.moteEmitter.reset();

    for (const beam of this.beams) {
      beam.fired = false;
      beam.landed = false;
      beam.dummy = null;
      beam.mesh.visible = false;
      beam.sigil.visible = false;
      beam.burn.visible = false;
    }

    this._handPoint(this._hand);
    this.position.copy(this._hand);
    this.lance.visible = true;
    this.prism.visible = false;
    this.path.visible = false;
    this.scar.visible = false;
    this.pool.visible = false;
    this._flightAge = 0;
    this.wake.visible = false;
    this.lens.visible = false;

    this._syncGeometry();
    this.ctx.shake.add(c.castShake * settings.global.cameraShake, 6, 30);
  }

  _handPoint(out) {
    const c = settings.refractor;
    out.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    out.y = c.handHeight;
    return out;
  }

  /** Where the prism hangs: over the end of the line. */
  _prismCentre(out) {
    const c = settings.refractor;
    this.pointAt(1, out);
    out.y = c.prismHover + Math.sin(this._bob) * c.prismBob;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  /** The lance reaches the prism. */
  onImpact() {
    const c = settings.refractor;
    const g = settings.global;
    this._stage = Stage.SPLIT;
    this._strikeAge = 0;
    this._prismCentre(this._prismPoint);

    this.ctx.bursts.spawn(BurstMode.AIR, this._prismPoint, {
      radius: c.prismRadius * 0.6,
      endRadius: c.impactBurst * c.strikeShellSize * g.explosionIntensity,
      life: 0.35,
      intensity: c.strikeShell,
      opacity: 0.4,
      fresnel: 2.8,
      displace: 0.2,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.set(this._prismPoint.x, 0, this._prismPoint.z);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * 0.8 * g.explosionIntensity,
      life: 0.5,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorBeamA),
      colorB: getColor(c.colorSigilHot)
    });

    _emit.position = this._prismPoint;
    _emit.radius = c.prismRadius * 0.6;
    _emit.direction = this.direction;
    _emit.speed = c.sparkSpeed * 0.6;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.3;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.05;
    _emit.sizeVariance = 0.6;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(c.impactSparks * 0.6 * g.particleCount), _emit);

    this.lightBoost = Math.max(this.lightBoost, c.strikeLight * g.explosionIntensity);
    this.ctx.shake.add(c.strikeShake * g.explosionIntensity, 5, 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.strikeFlash * g.explosionIntensity);
  }

  /** Beam `i`'s colour slot. */
  _beamColor(i, out) {
    const c = settings.refractor;
    return out.copy(getColor(i === 0 ? c.colorBeamA : i === 1 ? c.colorBeamB : c.colorBeamC));
  }

  _isTaken(dummy, upTo) {
    for (let i = 0; i < upTo; i++) if (this.beams[i].dummy === dummy) return true;
    return false;
  }

  /** Fire beam `i`: pick its target now. */
  _fire(i) {
    const c = settings.refractor;
    const beam = this.beams[i];
    const count = this._beamCount();
    beam.fired = true;
    beam.landed = false;
    beam.fireAge = this._strikeAge;
    beam.spin = Math.random() * TAU;
    beam.dummy = null;

    const centre = this._prismPoint;
    const found = this.ctx.dummies?.findTargets?.(centre.x, centre.z, c.beamRange, this._targets);
    if (found) {
      for (let k = 0; k < found.length; k++) {
        if (!this._isTaken(found[k], i)) {
          beam.dummy = found[k];
          break;
        }
      }
    }

    if (beam.dummy) {
      beam.target.set(beam.dummy.position.x, settings.dummies.height * c.aimHeight, beam.dummy.position.z);
    } else {
      // Fan off the line: centre beam straight on, the others either side.
      const f = count > 1 ? i / (count - 1) - 0.5 : 0;
      // With three, the first goes straight on and the others either side.
      const order = count === 3 ? (i === 0 ? 0 : i === 1 ? -1 : 1) : f * 2;
      const angle = Math.atan2(this.direction.z, this.direction.x) + order * c.fanAngle;
      beam.target.set(centre.x + Math.cos(angle) * c.fanReach, 0.05, centre.z + Math.sin(angle) * c.fanReach);
    }
    this._beamColor(i, beam.color);
    beam.mesh.visible = true;
    // The prism kicks a little each time one leaves.
    this.lightBoost = Math.max(this.lightBoost, c.beamLight * 0.4);
  }

  /** Beam `i` reaches its target. */
  _land(i) {
    const c = settings.refractor;
    const g = settings.global;
    const beam = this.beams[i];
    beam.landed = true;
    beam.landAge = this._strikeAge;
    this._beamsLanded++;

    _dir.subVectors(beam.target, this._prismPoint).setY(0);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();

    // What it hit, and anything standing right there.
    if (settings.dummies.hit.enabled) {
      if (beam.dummy && beam.dummy.alive) beam.dummy.kill(_dir.x, _dir.z, c.hit);
      const near = this.ctx.dummies?.findTargets?.(beam.target.x, beam.target.z, c.impactRadius, this._targets);
      if (near) for (let k = 0; k < near.length; k++) near[k].kill(_dir.x, _dir.z, c.hit);
    }

    _pos.set(beam.target.x, 0, beam.target.z);
    beam.sigil.position.set(_pos.x, 0.035, _pos.z);
    beam.sigil.visible = true;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * g.explosionIntensity,
      life: 0.5,
      width: 0.05,
      intensity: 1.1,
      colorA: beam.color,
      colorB: getColor(c.colorSigilHot)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.scorchRadius,
      life: c.scorchLife,
      intensity: 1,
      colorA: getColor(c.colorScorch),
      colorB: beam.color
    });
    _pos.y = Math.max(0.3, beam.target.y);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.impactBurst * 0.15,
      endRadius: c.impactBurst * g.explosionIntensity,
      life: 0.3,
      intensity: 1.4,
      opacity: 0.35,
      fresnel: 2.6,
      displace: 0.2,
      colorA: beam.color,
      colorB: beam.color,
      colorC: getColor(c.colorBurstC)
    });

    _emit.position = beam.target;
    _emit.radius = 0.2;
    _emit.direction = _from.copy(_dir).setY(0.9).normalize();
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.05;
    _emit.sizeVariance = 0.6;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = beam.color;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(c.impactSparks * g.particleCount), _emit);
    _emit.tint = null;

    this.position.copy(beam.target);
    this.lightBoost = Math.max(this.lightBoost, c.beamLight * g.explosionIntensity);
    this.ctx.shake.add(c.beamShake * g.explosionIntensity, 6, 28);
    this.ctx.flash.trigger(beam.color, c.beamFlash * g.explosionIntensity);
  }

  /** The crystal comes apart. */
  _shatter() {
    const c = settings.refractor;
    const g = settings.global;
    this._shattered = true;
    const count = this._beamCount();
    const per = Math.max(1, Math.round((c.shardCount * g.particleCount) / count));
    _emit.position = this._prismPoint;
    _emit.radius = c.prismRadius * 0.8;
    _emit.direction = _up;
    _emit.speed = c.shardSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.shardSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.shardLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 6;
    _emit.time = frame.uTime.value;
    for (let i = 0; i < count; i++) {
      _emit.tint = this.beams[i].color;
      this.shards.emit(per, _emit);
    }
    _emit.tint = null;
    this.ctx.shake.add(c.shatterShake * g.explosionIntensity, 6, 26);
    this.lightBoost = Math.max(this.lightBoost, c.beamLight * 0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = settings.refractor;
    const g = settings.global;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, 0, 0);
    this.motes.uniforms.uSizeScale.value = c.moteSize * g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;

    // Tinted per emit: one system carries every beam's hue.
    this.sparks.setGradient(_white, _white, _white, getColor(c.colorMoteD));
    this.sparks.uniforms.uGravity.value.set(0, c.sparkGravity, 0);
    this.sparks.uniforms.uSizeScale.value = (c.sparkSize / 0.05) * g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;

    this.shards.setGradient(_white, _white, getColor(c.colorGlass), getColor(c.colorGlassDeep));
    this.shards.uniforms.uGravity.value.set(0, -12, 0);
    this.shards.uniforms.uSizeScale.value = g.particleSize;
    this.shards.uniforms.uLifeScale.value = g.particleLifetime;
    this.shards.uniforms.uSpeedScale.value = g.particleSpeed;
    this.shards.uniforms.uOpacity.value = g.opacity;
    this.shards.uniforms.uGlow.value = c.shardGlow * g.glow;
  }

  _emitMote(position, direction, speed, life, radius) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 1;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.3;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(1, _emit);
  }

  /** The lance: in the hand, or flying. */
  _updateLance(dt) {
    const c = settings.refractor;
    const g = settings.global;
    const ls = this._lanceState;
    this._handPoint(this._hand);

    if (this._stage === Stage.CHARGE) {
      this._chargeAge += dt;
      const charge = saturate(this._chargeAge / Math.max(0.01, c.chargeTime));
      // Short and fat, pointing down the line, a shiver as it fills.
      const len = c.lanceChargeLength * (0.4 + 0.6 * Easing.outCubic(charge));
      ls.to.copy(this._hand).addScaledVector(this.direction, len * 0.5);
      ls.from.copy(this._hand).addScaledVector(this.direction, -len * 0.5);
      ls.charge = Easing.inQuad(charge);
      ls.widthScale = 0.7 + 0.6 * charge + 0.05 * Math.sin(this.age * 60);
      this.position.copy(ls.to);

      // Motes drawn in from round the hand.
      const n = Math.round(this.moteEmitter.tick(dt, c.chargeMotes) * g.particleCount);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        const r = 0.8 + Math.random() * 0.6;
        _pos.copy(this._hand).addScaledVector(this.side, Math.cos(a) * r);
        _pos.y += Math.sin(a) * r;
        _dir.subVectors(this._hand, _pos).normalize();
        this._emitMote(_pos, _dir, r / Math.max(0.1, c.moteLife), c.moteLife, 0.05);
      }

      if (this._chargeAge >= c.chargeTime) {
        this._stage = Stage.FLIGHT;
        this.ctx.shake.add(c.castShake * 2 * g.cameraShake, 6, 30);
        this.lightBoost = Math.max(this.lightBoost, c.strikeLight * 0.3);
      }
    } else if (this._stage === Stage.FLIGHT) {
      // The head runs from the hand down the line to the prism.
      this._prismCentre(_to);
      const u = this.u;
      this._head.lerpVectors(this._hand, _to, u);
      ls.to.copy(this._head);
      ls.from.copy(this._head).addScaledVector(_dir.subVectors(_to, this._hand).normalize(), -c.lanceLength * Math.min(1, u * 3 + 0.3));
      ls.charge = 1;
      ls.widthScale = 1;
      this.position.copy(this._head);

      const n = Math.round(this.moteEmitter.tick(dt, c.lanceMotes) * g.particleCount);
      for (let k = 0; k < n; k++) {
        _pos.lerpVectors(ls.from, ls.to, Math.random());
        this._emitMote(_pos, _up, 0.4, c.moteLife, c.lanceWidth);
      }
    }

    const live = this._stage === Stage.CHARGE || this._stage === Stage.FLIGHT;
    this.lance.visible = live;
    if (live) this.lanceMaterial.userData.sync(ls);

    /* --- wake --- */
    const ws = this._warpState;
    ws.from.copy(ls.from);
    ws.to.copy(ls.to);
    ws.size = c.warpWidth;
    ws.strength = this._stage === Stage.FLIGHT ? c.warpStrength : 0;
    // The wake quad trails the lance by its own length.
    _dir.subVectors(ls.to, ls.from);
    const len = _dir.length();
    if (len > 1e-4) ws.from.addScaledVector(_dir, -Math.max(0, c.warpLength - len) / len);
    this.wakeMaterial.userData.sync(ws);
    this.wake.visible = ws.strength > 0.004;
  }

  /**
   * The light path: the lance's travel, kept. In flight it runs from the hand
   * to the head; after the strike it holds hand → prism, then drains into the
   * prism from the caster's end over `pathLinger`. The floor scar is the same
   * line burned flat, and it lasts `scarLife`.
   */
  _updatePath(dt) {
    const c = settings.refractor;
    const g = settings.global;
    const ps = this._pathState;
    const ss = this._scarState;
    this._handPoint(this._hand);
    if (this._stage === Stage.CHARGE) {
      this.path.visible = false;
      this.scar.visible = false;
      return;
    }
    ps.from.copy(this._hand);
    if (this._stage === Stage.FLIGHT) {
      this._flightAge += dt;
      ps.to.copy(this._head);
      ps.reach = 1;
      ps.level = saturate(this._flightAge / 0.06);
      ps.fade = 0;
      ss.reach = 1;
      ss.level = ps.level;
      ss.fade = 0;
      ss.to.set(this._head.x, 0.03, this._head.z);
    } else {
      this._prismCentre(_to);
      ps.to.copy(_to);
      const lingerA = Math.max(0.05, c.pathLinger * g.lifetime);
      const k = saturate(this._strikeAge / lingerA);
      ps.reach = 1;
      ps.level = (1 - Easing.inQuad(k)) * (1 + 1.5 * Math.exp(-8 * this._strikeAge));
      ps.fade = Easing.inQuad(k);
      const lingerS = Math.max(0.05, c.scarLife * g.lifetime);
      const ks = saturate(this._strikeAge / lingerS);
      ss.reach = 1;
      ss.level = 1 - Easing.inQuad(ks);
      ss.fade = Easing.inCubic(ks);
      ss.to.set(_to.x, 0.03, _to.z);
    }
    ss.from.set(this._hand.x, 0.03, this._hand.z);
    this.pathMaterial.userData.sync(ps);
    this.scarMaterial.userData.sync(ss);
    this.path.visible = ps.level > 0.003 && ps.fade < 0.999;
    this.scar.visible = ss.level > 0.003 && ss.fade < 0.999;
  }

  /** The caustic pool under the prism: follows the crystal's life. */
  _updatePool(dt) {
    const c = settings.refractor;
    const g = settings.global;
    if (!this.prism.visible && this._crystalState.shatter <= 0) {
      this.pool.visible = false;
      return;
    }
    const cs = this._crystalState;
    const st = this._poolState;
    const struck = this._stage === Stage.SPLIT || this._stage === Stage.SPENT;
    st.flare = struck ? Math.exp(-4 * this._strikeAge) * 2.0 : 0;
    st.level = cs.form * (1 - cs.shatter * cs.shatter) * (struck ? 1 : 0.55);
    st.spin = this._spin;
    this.poolMaterial.userData.sync(st);
    this.pool.position.set(this._prismPoint.x, 0.025, this._prismPoint.z);
    const r = Math.max(0.1, c.poolRadius);
    this.pool.scale.set(r, 1, r);
    this.pool.visible = st.level > 0.003;
  }

  /** The crystal: forms, spins, flares, cracks, shatters. */
  _updatePrism(dt) {
    const c = settings.refractor;
    const g = settings.global;

    // When does it start forming? `prismLead` seconds of flight before arrival.
    const speed = Math.max(0.1, c.speed * g.speed);
    const remaining = this._stage === Stage.FLIGHT ? (1 - this.u) * this.length / speed : this._stage === Stage.CHARGE ? Infinity : 0;
    if (!this.prism.visible && remaining <= c.prismLead) {
      this.prism.visible = true;
      this._formAge = 0;
    }
    if (!this.prism.visible) return;
    this._formAge += dt;

    const struck = this._stage === Stage.SPLIT || this._stage === Stage.SPENT;
    const spin = struck && !this._shattered ? c.prismSpinStruck : c.prismSpin;
    this._spin += spin * TAU * dt * g.animationSpeed * (this._shattered ? 0.2 : 1);
    this._bob += 2.1 * dt;

    this._prismCentre(this._prismPoint);
    this.prism.position.copy(this._prismPoint);
    _axis.set(Math.cos(this._spin * 0.3), 0, Math.sin(this._spin * 0.3));
    _tiltQ.setFromAxisAngle(_axis, c.prismTilt);
    _spinQ.setFromAxisAngle(_up, this._spin);
    this.prism.quaternion.copy(_tiltQ).multiply(_spinQ);
    this.prism.scale.set(c.prismRadius, 1, c.prismRadius);

    const cs = this._crystalState;
    cs.form = Easing.outCubic(saturate(this._formAge / Math.max(0.02, c.formTime)));
    cs.span = c.prismHeight * 0.5 + c.prismCap;
    const sinceStrike = struck ? this._strikeAge : -1;
    cs.charge = sinceStrike >= 0 ? Math.exp(-5 * sinceStrike) * 1.2 + 0.25 * (1 - this._shatterLevel()) : 0;
    // Cracks open with each beam that leaves, and race on the shatter.
    let fired = 0;
    for (let i = 0; i < MAX_BEAMS; i++) if (this.beams[i].fired) fired++;
    cs.crack = struck ? saturate(fired / this._beamCount() * 0.75 + this._shatterLevel()) : 0;
    cs.shatter = this._shatterLevel();
    cs.seed = this._seed;
    this.crystalMaterial.userData.sync(cs);
    this.prism.visible = cs.shatter < 0.999;

    /* --- the lens --- */
    const ws = this._warpState;
    ws.to.copy(this._prismPoint);
    ws.size = c.prismHeight * 0.9 + c.prismCap;
    ws.strength = sinceStrike >= 0 ? c.warpPrism * (Math.exp(-6 * sinceStrike) * 1.5 + 0.2 * (1 - cs.shatter)) : 0;
    this.lensMaterial.userData.sync(ws);
    this.lens.visible = ws.strength > 0.004;
  }

  /** 0..1 through the shatter (the fade phase). */
  _shatterLevel() {
    if (this.phase !== AbilityPhase.FADE) return 0;
    return Easing.inQuad(saturate(this.fadeTime / Math.max(0.05, settings.refractor.fadeTime * settings.global.lifetime)));
  }

  _updateBeams(dt) {
    const c = settings.refractor;
    const g = settings.global;
    const count = this._beamCount();
    const grow = Math.max(0.01, c.beamGrow);
    const hold = Math.max(0, c.beamHold);
    const pinch = Math.max(0.01, c.beamPinch);
    const sigilLife = Math.max(0.1, c.sigilLife * g.lifetime);

    for (let i = 0; i < MAX_BEAMS; i++) {
      const beam = this.beams[i];
      if (this._stage === Stage.SPLIT && !beam.fired && i < count && this._strikeAge >= this._fireAt(i)) this._fire(i);
      if (!beam.fired) continue;

      const a = this._strikeAge - beam.fireAge;
      const s = beam.state;

      /* --- the beam --- */
      if (a < grow + hold + pinch) {
        // It leaves from the prism's face nearest its target, not its centre.
        _dir.subVectors(beam.target, this._prismPoint);
        _dir.y = 0;
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        _dir.normalize();
        // ...from high on that face, bowing up over the bodies so the shaft
        // is seen above the crystal rather than hidden behind it.
        s.from.copy(this._prismPoint).addScaledVector(_dir, c.prismRadius * 0.6);
        s.from.y += (c.prismHeight * 0.5 + c.prismCap) * c.beamLift;
        s.to.copy(beam.target);
        s.arc = c.beamArc;
        s.reach = Easing.outQuad(saturate(a / grow)) * 1.0001;
        const punch = Math.exp(-10 * Math.max(0, a - grow));
        s.level = a < grow ? 1 : 1 + punch * 1.6;
        s.pinch = Easing.inQuad(saturate((a - grow - hold) / pinch));
        s.widthScale = 1 + punch * 0.8;
        s.color = beam.color;
        beam.material.userData.sync(s);
        beam.mesh.visible = true;
        if (!beam.landed && a >= grow) this._land(i);
      } else {
        beam.mesh.visible = false;
        if (!beam.landed) this._land(i);
      }

      /* --- its floor burn: follows the tip out, flares, cools, wipes --- */
      {
        const bs = beam.burnState;
        _dir.subVectors(beam.target, this._prismPoint);
        _dir.y = 0;
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        _dir.normalize();
        bs.from.set(this._prismPoint.x, 0.03, this._prismPoint.z).addScaledVector(_dir, c.prismRadius * 0.4);
        bs.to.set(beam.target.x, 0.03, beam.target.z);
        bs.reach = Easing.outQuad(saturate(a / grow)) * 1.0001;
        const la = beam.landed ? this._strikeAge - beam.landAge : 0;
        const burnLife = Math.max(0.1, c.sigilLife * g.lifetime);
        bs.level = beam.landed ? 0.45 + 1.4 * Math.exp(-5 * la) : 0.8;
        bs.fade = beam.landed ? Easing.inQuad(saturate((la / burnLife - 0.5) / 0.5)) : 0;
        bs.color = beam.color;
        beam.burnMaterial.userData.sync(bs);
        beam.burn.visible = bs.fade < 0.999 && c.burnWidth > 0.001;
      }

      /* --- its sigil --- */
      if (beam.landed) {
        const la = this._strikeAge - beam.landAge;
        const ss = beam.sigilState;
        beam.spin += c.sigilSpin * g.animationSpeed * dt;
        // A stamp: overshoot and settle.
        ss.stamp = Easing.outBack(saturate(la / 0.18));
        ss.ring = saturate((la * c.ringSpeed) / Math.max(0.1, c.sigilSize));
        if (la > c.ringLife) ss.ring = 0;
        ss.life = Easing.inQuad(saturate((la / sigilLife - 0.55) / 0.45)) * 1.12;
        ss.spin = beam.spin;
        ss.color = beam.color;
        beam.sigilMaterial.userData.sync(ss);
        beam.sigil.scale.set(c.sigilSize, 1, c.sigilSize);
        beam.sigil.visible = la < sigilLife;
      }
    }
  }

  _frame(dt) {
    this._syncGeometry();
    this._syncParticles();
    if (this._stage === Stage.SPLIT || this._stage === Stage.SPENT) this._strikeAge += dt;

    this._updateLance(dt);
    this._updatePath(dt);
    this._updatePrism(dt);
    this._updatePool(dt);
    this._updateBeams(dt);

    if (this._stage === Stage.SPLIT && this._beamsLanded >= this._beamCount()) this._stage = Stage.SPENT;
    if (this.phase === AbilityPhase.FADE && !this._shattered) this._shatter();
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._frame(dt);
  }

  onFade(dt) {
    this._frame(dt);
  }

  onDestroy() {
    this.lance.visible = false;
    this.prism.visible = false;
    this.path.visible = false;
    this.scar.visible = false;
    this.pool.visible = false;
    this.wake.visible = false;
    this.lens.visible = false;
    for (const beam of this.beams) {
      beam.mesh.visible = false;
      beam.sigil.visible = false;
      beam.burn.visible = false;
      beam.fired = false;
      beam.landed = false;
      beam.dummy = null;
    }
    this._targets.length = 0;
    this._stage = Stage.SPENT;
  }

  dispose() {
    this.ribbonGeometry.dispose();
    this.floorGeometry.dispose();
    this.quadGeometry.dispose();
    this.prism.geometry.dispose();
    this.lanceMaterial.dispose();
    this.crystalMaterial.dispose();
    for (const beam of this.beams) {
      beam.material.dispose();
      beam.sigilMaterial.dispose();
      beam.burnMaterial.dispose();
    }
    this.wakeMaterial.dispose();
    this.lensMaterial.dispose();
    this.pathMaterial.dispose();
    this.scarMaterial.dispose();
    this.poolMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('\u{1F48E}  Prism Refractor');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 120, 0.5, 'lance speed (m/s)');
  R(cast, c, 'lifetime', 0, 4, 0.05, 'prism holds after (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.05, 'shatters over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'chargeTime', 0, 1.5, 0.01, 'charges in the hand (s)');

  const split = folder.addFolder('The split');
  R(split, c, 'beamCount', 1, MAX_BEAMS, 1, 'beams');
  R(split, c, 'splitDelay', 0, 1, 0.01, 'strike → first beam (s)');
  R(split, c, 'beamStagger', 0, 1, 0.01, 'between beams (s)');
  R(split, c, 'beamRange', 0, 25, 0.1, 'seeks bodies within (m)');
  R(split, c, 'fanAngle', 0, 1.5, 0.01, 'fallback fan (rad)');
  R(split, c, 'fanReach', 1, 20, 0.1, 'fallback reach (m)');
  R(split, c, 'aimHeight', 0, 1.2, 0.01, 'aim height (× body)');
  R(split, c, 'impactRadius', 0, 4, 0.05, 'kill radius per landing (m)');
  R(split, c.hit, 'impulse', 0, 20, 0.1, 'throw impulse');
  R(split, c.hit, 'lift', 0, 20, 0.1, 'throw lift');
  R(split, c.hit, 'spin', 0, 5, 0.05, 'throw spin');

  /* ---- layer 1 ---- */
  const lance = folder.addFolder('1 · Lance');
  R(lance, c, 'lanceLength', 0.2, 8, 0.05, 'length in flight (m)');
  R(lance, c, 'lanceChargeLength', 0.1, 3, 0.01, 'length charging (m)');
  R(lance, c, 'lanceWidth', 0.01, 0.8, 0.005, 'half-width (m)');
  R(lance, c, 'lanceCore', 0.02, 1, 0.01, 'core');
  R(lance, c, 'lanceIntensity', 0, 15, 0.05, 'intensity');
  R(lance, c, 'lanceRings', 0, 20, 0.1, 'charge rings');
  R(lance, c, 'lanceRingSpeed', -30, 30, 0.1, 'ring speed');
  R(lance, c, 'lanceCrackle', 0, 1.5, 0.01, 'crackle');
  R(lance, c, 'lanceFlicker', 0, 1, 0.01, 'strobe');
  lance.addColor(c, 'colorLanceCore').name('core');
  lance.addColor(c, 'colorLanceGlow').name('glow');
  lance.addColor(c, 'colorLanceEdge').name('edge');
  const path = lance.addFolder('Light path');
  R(path, c, 'pathWidth', 0.01, 0.6, 0.005, 'filament half-width (m)');
  R(path, c, 'pathIntensity', 0, 10, 0.05, 'filament intensity');
  R(path, c, 'pathLinger', 0.05, 3, 0.01, 'drains into prism over (s)');
  R(path, c, 'pathDashes', 0, 6, 0.05, 'dashes per metre');
  R(path, c, 'pathDashSpeed', -20, 20, 0.1, 'dash speed');
  R(path, c, 'scarWidth', 0.02, 1, 0.005, 'floor scar half-width (m)');
  R(path, c, 'scarIntensity', 0, 10, 0.05, 'floor scar intensity');
  R(path, c, 'scarLife', 0.1, 6, 0.05, 'floor scar lasts (s)');
  path.addColor(c, 'colorPathDeep').name('deep');

  /* ---- layer 2 ---- */
  const prism = folder.addFolder('2 · Prism');
  const stone = prism.addFolder('Shape + motion');
  R(stone, c, 'prismSides', 3, 10, 1, 'sides');
  R(stone, c, 'prismRadius', 0.1, 2, 0.01, 'radius (m)');
  R(stone, c, 'prismHeight', 0.2, 5, 0.01, 'body height (m)');
  R(stone, c, 'prismCap', 0, 2, 0.01, 'points (m)');
  R(stone, c, 'prismHover', 0.3, 5, 0.01, 'hover height (m)');
  R(stone, c, 'prismLead', 0, 2, 0.01, 'forms before arrival (s)');
  R(stone, c, 'formTime', 0.02, 2, 0.01, 'materialise over (s)');
  R(stone, c, 'prismSpin', -3, 3, 0.01, 'turns/second');
  R(stone, c, 'prismSpinStruck', -6, 6, 0.01, 'turns/second when struck');
  R(stone, c, 'prismBob', 0, 0.5, 0.005, 'bob (m)');
  R(stone, c, 'prismTilt', 0, 1, 0.01, 'tilt (rad)');
  const glass = prism.addFolder('Glass');
  R(glass, c, 'glassOpacity', 0, 1, 0.01, 'opacity');
  R(glass, c, 'glassBody', 0, 1, 0.01, 'body lightness (0 = deep indigo)');
  R(glass, c, 'glassReflect', 0, 2, 0.01, 'sky reflection');
  R(glass, c, 'fresnel', 0, 6, 0.01, 'fresnel');
  R(glass, c, 'fresnelPower', 0.5, 8, 0.05, 'fresnel tightness');
  R(glass, c, 'envIntensity', 0, 4, 0.01, 'sky');
  R(glass, c, 'innerBands', 0, 10, 0.05, 'caustic bands');
  R(glass, c, 'bandSpeed', -6, 6, 0.05, 'band speed');
  R(glass, c, 'edgeGlow', 0, 10, 0.05, 'edge glow');
  R(glass, c, 'chargeGlow', 0, 20, 0.05, 'strike flood');
  R(glass, c, 'crackScale', 0.5, 12, 0.05, 'crack density');
  R(glass, c, 'crackWidth', 0.005, 0.3, 0.005, 'crack width');
  R(glass, c, 'crackGlow', 0, 15, 0.05, 'crack glow');
  glass.addColor(c, 'colorGlass').name('glass');
  glass.addColor(c, 'colorGlassDeep').name('deep');
  glass.addColor(c, 'colorGlassEdge').name('edges');
  glass.addColor(c, 'colorCrack').name('cracks');
  const pool = prism.addFolder('Caustic pool');
  R(pool, c, 'poolRadius', 0.2, 6, 0.05, 'radius (m)');
  R(pool, c, 'poolIntensity', 0, 8, 0.05, 'intensity');
  R(pool, c, 'poolFill', 0, 1, 0.01, 'glass shadow');
  R(pool, c, 'poolScale', 0.2, 8, 0.05, 'caustic scale');
  pool.addColor(c, 'colorPoolDeep').name('deep');

  /* ---- layer 3 ---- */
  const beams = folder.addFolder('3 · Beams');
  R(beams, c, 'beamWidth', 0.01, 1.5, 0.005, 'half-width (m)');
  R(beams, c, 'beamShaft', 0, 1, 0.01, 'solid shaft (0 = soft glow)');
  R(beams, c, 'beamLift', -1, 1, 0.01, 'leaves the prism at (× half-span)');
  R(beams, c, 'beamArc', 0, 4, 0.05, 'arcs up over (m)');
  R(beams, c, 'burnWidth', 0, 1.5, 0.01, 'floor burn half-width (m)');
  R(beams, c, 'burnFill', 0, 1, 0.01, 'floor burn char');
  R(beams, c, 'burnGlow', 0, 8, 0.05, 'floor burn seam glow');
  R(beams, c, 'beamCore', 0.02, 1, 0.01, 'core');
  R(beams, c, 'beamIntensity', 0, 15, 0.05, 'intensity');
  R(beams, c, 'beamGrow', 0.01, 1, 0.005, 'reaches target in (s)');
  R(beams, c, 'beamHold', 0, 2, 0.01, 'holds for (s)');
  R(beams, c, 'beamPinch', 0.01, 1.5, 0.01, 'pinches out over (s)');
  R(beams, c, 'beamPackets', 0.2, 20, 0.1, 'packets per metre');
  R(beams, c, 'beamPacketSpeed', 0, 80, 0.5, 'packet speed (m/s)');
  R(beams, c, 'beamBands', 0, 1.5, 0.01, 'refraction bands');
  R(beams, c, 'beamFlicker', 0, 1, 0.01, 'strobe');
  beams.addColor(c, 'colorBeamCore').name('core');
  beams.addColor(c, 'colorBeamA').name('first beam');
  beams.addColor(c, 'colorBeamB').name('second beam');
  beams.addColor(c, 'colorBeamC').name('third beam');

  /* ---- layer 4 ---- */
  const sigil = folder.addFolder('4 · Impact sigils');
  R(sigil, c, 'sigilSize', 0.2, 5, 0.05, 'half-size (m)');
  R(sigil, c, 'sigilLife', 0.1, 8, 0.05, 'lasts (s)');
  R(sigil, c, 'sigilLine', 0.005, 0.15, 0.001, 'line width');
  R(sigil, c, 'sigilIntensity', 0, 10, 0.05, 'intensity');
  R(sigil, c, 'sigilSpin', -6, 6, 0.01, 'spin (rad/s)');
  R(sigil, c, 'ringSpeed', 0.5, 30, 0.1, 'shock ring speed (m/s)');
  R(sigil, c, 'ringLife', 0.05, 2, 0.01, 'shock ring life (s)');
  R(sigil, c, 'ringWidth', 0.01, 0.5, 0.005, 'shock ring width');
  sigil.addColor(c, 'colorSigil').name('colour');
  sigil.addColor(c, 'colorSigilHot').name('hot');
  sigil.addColor(c, 'colorSigilDeep').name('deep fill');
  R(sigil, c, 'sigilFill', 0, 1, 0.01, 'deep fill');
  R(sigil, c, 'sigilTint', 0, 1, 0.01, 'beam hue ↔ sigil colour');
  R(sigil, c, 'shockRadius', 0, 10, 0.05, 'shockwave decal (m)');
  R(sigil, c, 'scorchRadius', 0, 4, 0.05, 'scorch decal (m)');
  R(sigil, c, 'scorchLife', 0.1, 8, 0.05, 'scorch life');
  R(sigil, c, 'impactBurst', 0, 6, 0.05, 'light shell (m)');
  sigil.addColor(c, 'colorBurstA').name('shell inner');
  sigil.addColor(c, 'colorBurstB').name('shell mid');
  sigil.addColor(c, 'colorBurstC').name('shell outer');
  sigil.addColor(c, 'colorScorch').name('scorch');

  /* ---- layer 5 ---- */
  const fx = folder.addFolder('5 · Particles');
  R(fx, c, 'chargeMotes', 0, 600, 1, 'motes drawn in (/s)');
  R(fx, c, 'lanceMotes', 0, 600, 1, 'motes in flight (/s)');
  R(fx, c, 'moteSize', 0.01, 1, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.05, 2, 0.01, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'Mote colour over life');
  R(fx, c, 'impactSparks', 0, 400, 1, 'sparks per landing');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -30, 5, 0.1, 'spark gravity');
  R(fx, c, 'sparkGlow', 0, 8, 0.05, 'spark glow');
  R(fx, c, 'shardCount', 0, 300, 1, 'shards on the shatter');
  R(fx, c, 'shardSize', 0.01, 0.5, 0.005, 'shard size');
  R(fx, c, 'shardSpeed', 0, 20, 0.1, 'shard speed');
  R(fx, c, 'shardLife', 0.05, 3, 0.01, 'shard lifetime');
  R(fx, c, 'shardGlow', 0, 8, 0.05, 'shard glow');

  /* ---- layer 6 ---- */
  const warp = folder.addFolder('6 · Heat warp');
  R(warp, c, 'warpWidth', 0.05, 2, 0.01, 'wake half-width (m)');
  R(warp, c, 'warpLength', 0.2, 10, 0.05, 'wake length (m)');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'wake strength');
  R(warp, c, 'warpPrism', 0, 3, 0.01, 'prism lens strength');
  R(warp, c, 'warpScale', 0.2, 12, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 12, 0.05, 'noise speed');

  /* ---- layer 7 ---- */
  const fb = folder.addFolder('7 · Light & feedback');
  fb.addColor(c, 'lightColor').name('light colour');
  R(fb, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(fb, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(fb, c, 'strikeLight', 0, 80, 0.5, 'light punch on strike');
  R(fb, c, 'beamLight', 0, 60, 0.5, 'light punch per landing');
  R(fb, c, 'strikeShell', 0, 5, 0.05, 'light shell on strike');
  R(fb, c, 'strikeShellSize', 0.2, 3, 0.01, 'strike shell size (× light shell)');
  R(fb, c, 'strikeShake', 0, 1, 0.01, 'shake on strike');
  R(fb, c, 'strikeFlash', 0, 1, 0.01, 'flash on strike');
  R(fb, c, 'beamShake', 0, 1, 0.01, 'shake per landing');
  R(fb, c, 'beamFlash', 0, 1, 0.01, 'flash per landing');
  R(fb, c, 'shatterShake', 0, 1, 0.01, 'shake on shatter');
  R(fb, c, 'castShake', 0, 0.5, 0.005, 'shake on cast');
  fb.addColor(c, 'colorFlash').name('flash colour');
}
