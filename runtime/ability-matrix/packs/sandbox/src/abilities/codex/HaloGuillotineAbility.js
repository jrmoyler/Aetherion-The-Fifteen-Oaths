import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createHaloGeometry,
  createBladeGeometry,
  createSmearGeometry,
  createCutGeometry,
  createGuillotineQuad
} from '../../assets/codex/HaloGuillotineGeometry.js';
import {
  createHaloMaterial,
  createBladeMaterial,
  createSmearMaterial,
  createSmearWarpMaterial,
  createCutMaterial,
  createGlintMaterial
} from '../../materials/codex/HaloGuillotineMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'haloguillotine';

const DEG = Math.PI / 180;
/** Samples along the edge when looking for where it meets the floor. */
const EDGE_STEPS = 64;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _floor = new Vector3();
const _ca = new Vector3();
const _cn = new Vector3();
const _cp = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * HALO GUILLOTINE — Light, line cast.
 *
 * Built on the one guillotine that *swings*: the paper cutter, a blade hinged
 * at one end that closes down onto its bed. A halo draws itself round over
 * the caster's head and **hinges** — it tips down and stands beside them, on
 * edge in the plane of the line, the knuckle of the hinge. A blade of light
 * **grows** out of it up the line, standing open at `raiseAngle` like the arm
 * of the cutter, a faint guide line marching down the floor beneath it. It
 * **winds up** a few more degrees, hangs — and **falls**: the arm swings shut
 * on the hinge, accelerating, and because the edge is a crescent the point
 * where it meets the floor races from the hinge out to the tip, as scissors
 * close. The cut opens behind that point: a white-hot slit with shards of
 * light radiating off it. At the tip the blade **buries itself** — AIR shell,
 * shockwave, dust, flash — and lingers, embedded; then it dissolves tip-first
 * into motes, the halo lifts away, and the cut cools to a gold seam and
 * erodes.
 *
 * Distinct from the other blades in the codex: Umbral Guillotine swings
 * *across* the line and Pendulum Cleaver hangs from above; this one swings
 * *down the length* of it, from a hinge at the caster's side, and cuts the
 * whole line in one closing stroke.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the halo** (`createHaloMaterial`) — a torus placed round a live axis:
 *      gold, white inner lip, a turning band of runes; drawn round as it forms.
 *   2. **the blade** (`createBladeMaterial`) — a crescent sheet hung off the
 *      hinge in the vertex stage; gold body, white-hot edge, engraved band,
 *      a sheen running along it, clipped where it is buried in the floor.
 *   3. **the smear** (`createSmearMaterial` + `createSmearWarpMaterial` on
 *      `LAYER.DISTORTION`) — the fan of light and bent air the edge drags
 *      through the swing.
 *   4. **the cut** (`createCutMaterial`) — guide line, slit, shards, scorch,
 *      cooling and eroding.
 *   5. **the glint** (`createGlintMaterial`) — a star on the forming halo, then
 *      riding the point of contact down the line.
 *   6. **particles** — gold motes off the raised blade, sparks off the point
 *      of contact and the buried tip, pale dust thrown up along the cut.
 *   7. **the slam** — AIR shell, SHOCKWAVE and DUSTRING decals, flash, shake,
 *      light punch.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Only the edge cuts: a body is cut down (sliced, by default) the frame the
 * point of contact passes it, each half thrown away from the cut. Whatever
 * the contact never reached is cut when the whole blade lands.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, the hinge angle it has swung to, the length cut so far
 * and integrated phases. Every dimension, time and colour is read from
 * `settings.haloguillotine` every frame.
 */
export class HaloGuillotineAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._hitCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.haloGeometry = createHaloGeometry();
    this.bladeGeometry = createBladeGeometry();
    this.smearGeometry = createSmearGeometry();
    this.cutGeometry = createCutGeometry();
    this.quadGeometry = createGuillotineQuad();

    this.cutMaterial = createCutMaterial();
    this.cut = this._mesh(this.cutGeometry, this.cutMaterial, LAYER.VFX, 2);
    this.haloMaterial = createHaloMaterial();
    this.halo = this._mesh(this.haloGeometry, this.haloMaterial, LAYER.VFX, 12);
    this.bladeMaterial = createBladeMaterial();
    this.blade = this._mesh(this.bladeGeometry, this.bladeMaterial, LAYER.VFX, 13);
    this.smearMaterial = createSmearMaterial();
    this.smear = this._mesh(this.smearGeometry, this.smearMaterial, LAYER.VFX, 14);
    this.smearWarpMaterial = createSmearWarpMaterial();
    this.smearWarp = this._mesh(this.smearGeometry, this.smearWarpMaterial, LAYER.DISTORTION, 0);
    this.glintMaterial = createGlintMaterial();
    this.glint = this._mesh(this.quadGeometry, this.glintMaterial, LAYER.VFX, 16);

    this._haloState = { center: new Vector3(), u1: new Vector3(), u2: new Vector3(), axis: new Vector3(), radius: 0.7, spin: 0, power: 0, draw: 0 };
    this._bladeState = {
      hinge: new Vector3(),
      a: new Vector3(),
      n: new Vector3(),
      a0: new Vector3(),
      n0: new Vector3(),
      face: new Vector3(),
      length: 0.1,
      sheen: 0,
      flare: 0,
      power: 0,
      dissolve: 0,
      seed: 0
    };
    // The smear reads the blade's own vectors (same objects), with its own power.
    const bs0 = this._bladeState;
    this._smearState = { hinge: bs0.hinge, a: bs0.a, n: bs0.n, a0: bs0.a0, n0: bs0.n0, length: 0.1, power: 0, seed: 0 };
    this._smearPower = 0;
    this._cutState = { start: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, cut: 0, telegraph: 0, heat: 1, fadeT: 0, seed: 0 };
    this._glintState = { center: new Vector3(), size: 1, intensity: 0, seed: 0 };

    this._hinge = new Vector3();
    this._pivot = new Vector3(1, 0, 0);
    this._lift = new Vector3(0, 1, 0);
    this._contact = new Vector3();
    this._seed = 0;
    this._theta = 0;
    this._cut = 0;
    this._prevCut = 0;
    this._spin = 0;
    this._sheen = 0;
    this._slammed = false;
    this._hitCount = 0;

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
    this.motes = particles.get('haloguillotine.motes', {
      capacity: 2000,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.25;
    this.motes.uniforms.uDrag.value = 1.3;
    this.motes.uniforms.uTurbFrequency.value = 0.8;
    this.motes.uniforms.uTurbSpeed.value = 0.5;

    this.sparks = particles.get('haloguillotine.sparks', {
      capacity: 2000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.3;

    this.dust = particles.get('haloguillotine.dust', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.2;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.55;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uDrag.value = 1.4;

    this.moteEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    const c = settings[ID];
    return (Math.max(0, c.holdTime) + Math.max(0.03, c.swingTime) + Math.max(0.05, c.lingerTime)) * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** The front waits while the halo forms and hinges down. */
  advance(dt) {
    const c = settings[ID];
    const hold = (Math.max(0, c.formTime) + Math.max(0, c.hingeTime)) * settings.global.lifetime;
    if (this.age < hold) {
      this.pointAt(0, this.position);
      return false;
    }
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Blade geometry on the CPU                                           */
  /* ------------------------------------------------------------------ */

  /** CPU twin of `edgeDepth` in HaloGuillotineMaterials. */
  _edgeDepth(s) {
    const c = settings[ID];
    const belly = Math.sin(Math.PI * Math.pow(saturate(s), Math.max(0.05, c.bladeBelly)));
    const tip = 1 - 0.92 * smoothstep(1 - Math.max(0.01, c.bladeTipTaper), 1, s);
    return Math.max(0.02, c.bladeWidth) * (c.bladeRoot + (1 - c.bladeRoot) * belly) * tip;
  }

  /** The full blade length, hinge to past the target. */
  _fullLength() {
    const c = settings[ID];
    return Math.max(0.3, this.length - c.hingeForward + c.bladeOverhang);
  }

  /**
   * The hinge, and the plane the arm swings in. The plane is leant
   * `armLean` degrees off vertical (about the line), so the raised arm stands
   * up and out to one side and the default camera, behind the caster, sees
   * its face rather than its edge. The hinge is shifted the other way so that
   * the edge still comes down exactly on the aimed line.
   */
  _placeHinge() {
    const c = settings[ID];
    const lean = c.armLean * DEG;
    // Pivot axis P and the plane's own "up", L = P × direction.
    this._pivot.copy(this.side).multiplyScalar(Math.cos(lean)).addScaledVector(_up, -Math.sin(lean));
    this._lift.copy(_up).multiplyScalar(Math.cos(lean)).addScaledVector(this.side, Math.sin(lean));
    const lateral = c.hingeSide + c.hingeHeight * Math.tan(lean);
    this._hinge
      .copy(this.origin)
      .addScaledVector(this.direction, c.hingeForward)
      .addScaledVector(this.side, lateral)
      .setY(c.hingeHeight);
  }

  /** Spine and edge directions with the arm open at `theta`. */
  _bladeAxes(theta, aOut, nOut) {
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    aOut.copy(this.direction).multiplyScalar(cs).addScaledVector(this._lift, sn);
    nOut.copy(this.direction).multiplyScalar(sn).addScaledVector(this._lift, -cs);
  }

  /**
   * The furthest point of the edge that is at or under the floor with the
   * arm at `theta`; returns metres along the line from the origin, or -1.
   */
  _contactAlong(theta, length, out) {
    this._bladeAxes(theta, _ca, _cn);
    let best = -1;
    for (let k = 0; k <= EDGE_STEPS; k++) {
      const s = k / EDGE_STEPS;
      _cp.copy(this._hinge).addScaledVector(_ca, s * length).addScaledVector(_cn, this._edgeDepth(s));
      if (_cp.y > 0) continue;
      const along = (_cp.x - this.origin.x) * this.direction.x + (_cp.z - this.origin.z) * this.direction.z;
      if (along > best) {
        best = along;
        out.copy(_cp).setY(0);
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this._seed = Math.random() * 100;
    this._theta = c.raiseAngle * DEG;
    this._cut = 0;
    this._prevCut = 0;
    this._spin = 0;
    this._sheen = 0;
    this._slammed = false;
    this._hitCount = 0;
    this._smearPower = 0;
    this.moteEmitter.reset();
    this.sparkEmitter.reset();

    const bs = this._bladeState;
    bs.seed = this._seed;
    bs.power = 0;
    bs.flare = 0;
    bs.dissolve = 0;
    bs.length = 0.05;
    this._cutState.seed = this._seed;
    this._cutState.fadeT = 0;
    this._cutState.heat = 1;
    this._glintState.seed = this._seed;

    this.halo.visible = true;
    this.blade.visible = false;
    this.smear.visible = false;
    this.smearWarp.visible = false;
    this.cut.visible = true;
    this.glint.visible = true;
    this._placeHinge();
    this._poseHalo(0, 0);
    this._syncAll();
  }

  /**
   * The halo: drawn round over the head, then tipped down to stand at the hinge.
   * @param {number} form 0..1 drawn
   * @param {number} hinge 0..1 tipped down
   */
  _poseHalo(form, hinge) {
    const c = settings[ID];
    const hs = this._haloState;
    const k = Easing.inOutCubic(saturate(hinge));
    _a.copy(this.origin).setY(c.haloAbove);
    hs.center.lerpVectors(_a, this._hinge, k);
    // Its axis turns from the sky to the caster's side, about the line.
    hs.axis.copy(_up).multiplyScalar(1 - k).addScaledVector(this._pivot, k).normalize();
    hs.u1.copy(this.direction);
    hs.u2.crossVectors(hs.axis, hs.u1).normalize();
    hs.radius = c.haloRadius * Easing.outBack(saturate(form));
    hs.draw = Easing.outCubic(saturate(form));
    hs.power = saturate(form * 2);
    hs.spin = this._spin;
  }

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    this.haloMaterial.userData.sync(this._haloState);
    const bs = this._bladeState;
    bs.hinge.copy(this._hinge);
    bs.face.copy(this._pivot);
    bs.sheen = this._sheen % 1.6 - 0.3;
    this.bladeMaterial.userData.sync(bs);
    const ss = this._smearState;
    ss.length = bs.length;
    ss.seed = bs.seed;
    ss.power = this._smearPower;
    this.smearMaterial.userData.sync(ss);
    this.smearWarpMaterial.userData.sync(ss);

    const cs = this._cutState;
    // The cut lies on the aimed line, under where the edge lands.
    cs.start.copy(this.origin).addScaledVector(this.direction, c.hingeForward).addScaledVector(this.side, c.hingeSide).setY(0);
    cs.dir.copy(this.direction);
    cs.side.copy(this.side);
    cs.length = this._fullLength();
    cs.cut = Math.max(0, this._cut - c.hingeForward);
    this.cutMaterial.userData.sync(cs);
    this.glintMaterial.userData.sync(this._glintState);

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, c.moteLift, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 1.0 * g.turbulence;

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

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uGravity.value.set(0, c.dustLift * 0.4, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.dustOpacity * g.opacity;
    d.uTurbulence.value = 0.6 * g.turbulence;
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

  _advancePhases(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += c.haloSpin * dt * g.animationSpeed;
    this._sheen += c.sheenSpeed * dt * g.animationSpeed;
  }

  /** Pose the blade at `theta` with `length`; the smear trails `trail` radians behind. */
  _poseBlade(theta, length, trail) {
    const bs = this._bladeState;
    this._bladeAxes(theta, bs.a, bs.n);
    this._bladeAxes(theta + trail, bs.a0, bs.n0);
    bs.length = length;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — form, hinge, grow                                          */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._advancePhases(dt);
    this._placeHinge();
    const formT = Math.max(0.01, c.formTime * g.lifetime);
    const hingeT = Math.max(0.01, c.hingeTime * g.lifetime);
    const form = saturate(this.age / formT);
    const hinge = saturate((this.age - formT) / hingeT);
    this._poseHalo(form, hinge);

    // The glint where the halo is forming.
    const gs = this._glintState;
    gs.center.copy(this._haloState.center);
    gs.size = c.glintSize * (1.2 - 0.4 * hinge);
    gs.intensity = Math.sin(Math.PI * saturate(form * 0.9 + hinge * 0.3)) * 1.2 + 0.2;

    // The blade grows out of the halo up the line, standing open.
    const grown = Math.max(0, this.front);
    const length = Math.min(this._fullLength(), grown + 0.05);
    const quiver = c.quiver * DEG * Math.sin(this.age * 37) * Math.sin(this.age * 11.3);
    this._theta = c.raiseAngle * DEG + quiver;
    this._poseBlade(this._theta, length, 0);
    this.blade.visible = hinge >= 1;
    const bs = this._bladeState;
    bs.power = smoothstep(0, 0.6, length);
    bs.flare = 0;
    bs.dissolve = 0;
    this._smearPower = 0;
    this._cutState.telegraph = smoothstep(0, 1, length / Math.max(1, this._fullLength())) * 0.6;

    this._syncAll();
    if (hinge >= 1) this._bladeFx(dt, 1);
    this._bladeMid(this.position, 0.5);
  }

  /** A point on the edge at `s`, world. */
  _edgePoint(s, out) {
    const bs = this._bladeState;
    return out.copy(this._hinge).addScaledVector(bs.a, s * bs.length).addScaledVector(bs.n, this._edgeDepth(s));
  }

  _bladeMid(out, s) {
    const bs = this._bladeState;
    return out.copy(this._hinge).addScaledVector(bs.a, s * bs.length).addScaledVector(bs.n, this._edgeDepth(s) * 0.5);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — wind-up, fall, bury, linger                                */
  /* ------------------------------------------------------------------ */

  onImpact() {
    this._cutState.telegraph = 0.6;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._advancePhases(dt);
    this._placeHinge();
    const L = this._fullLength();
    const raise = c.raiseAngle * DEG;

    if (t <= 1) {
      const tau = (t * this.impactDuration) / Math.max(0.01, g.lifetime);
      const hold = Math.max(0, c.holdTime);
      const swing = Math.max(0.03, c.swingTime);
      const kh = hold > 0 ? saturate(tau / hold) : 1;
      const ks = saturate((tau - hold) / swing);
      const top = raise + c.windup * DEG;
      const bs = this._bladeState;
      this._poseHalo(1, 1);

      let theta;
      let trail = 0;
      if (ks <= 0) {
        // Wind-up: it lifts a few more degrees and hangs, trembling.
        theta = lerp(raise, top, Easing.outCubic(kh)) + c.quiver * 1.5 * DEG * Math.sin(this.age * 45);
        this._cutState.telegraph = lerp(0.6, 1, kh);
        bs.flare = 0.4 * kh;
      } else {
        // The fall: accelerating like a dropped arm, to flat.
        theta = top * (1 - ks * ks);
        trail = Math.min(c.smearArc * DEG, top - theta) * (ks < 1 ? 1 : 0);
        this._cutState.telegraph = 1 - ks;
        bs.flare = 0.4 + ks;
      }
      this._theta = theta;
      this._poseBlade(theta, L, trail);
      this.blade.visible = true;
      bs.power = 1;
      bs.dissolve = 0;

      // How far the edge has met the floor.
      this._prevCut = this._cut;
      const along = this._contactAlong(theta, L, this._contact);
      if (along > this._cut) this._cut = Math.min(along, this.length + c.bladeOverhang);

      const after = Math.max(0, tau - hold - swing);
      if (ks >= 1 && !this._slammed) this._slam();
      if (this._slammed) {
        this._cut = this.length + c.bladeOverhang;
        bs.flare = 1.4 * Math.exp(-after * 5);
      }
      this._smearPower = ks > 0 ? (ks < 1 ? 1 : Math.exp(-after * 18)) : 0;
      this.smear.visible = this._smearPower > 0.01;
      this.smearWarp.visible = this.smear.visible;

      // The glint rides the point of contact.
      const gs = this._glintState;
      if (ks > 0 && this._cut > c.hingeForward) {
        this.pointAt(Math.min(1, this._cut / this.length), gs.center);
        gs.center.y = 0.15;
        gs.size = c.glintSize * (1 + 0.6 * ks);
        gs.intensity = this._slammed ? 2.5 * Math.exp(-after * 4) : 1.6;
      } else {
        gs.center.copy(this._hinge);
        gs.size = c.glintSize * 0.8;
        gs.intensity = 0.3;
      }

      this._cutState.heat = 1;
      this._syncAll();
      if (ks <= 0) this._bladeFx(dt, 1 + kh);
      else if (!this._slammed) this._contactFx(dt);
      this._cutHits();

      if (ks > 0) {
        this.pointAt(Math.min(1, Math.max(this._cut, c.hingeForward) / this.length), this.position);
        this.position.y = 0.6;
      } else {
        this._bladeMid(this.position, 0.6);
      }
      return;
    }

    /* the fade: the blade dissolves tip-first, the halo lifts away, the cut cools */
    const ft = saturate(t - 1);
    const bs = this._bladeState;
    this._poseBlade(this._theta, L, 0);
    bs.dissolve = smoothstep(0, 0.65, ft);
    bs.flare = 0;
    bs.power = 1;
    this.blade.visible = bs.dissolve < 1;
    this.smear.visible = false;
    this.smearWarp.visible = false;
    this._poseHalo(1, 1);
    const hs = this._haloState;
    hs.center.y += c.haloRise * Easing.inCubic(ft);
    hs.power = 1 - smoothstep(0.3, 1, ft);
    hs.radius *= 1 - 0.4 * ft;
    this.halo.visible = hs.power > 0.01;
    this._glintState.intensity = 0;
    this.glint.visible = false;
    const cs = this._cutState;
    cs.heat = Math.pow(1 - ft, 1 / Math.max(0.1, c.coolCurve));
    cs.fadeT = smoothstep(0.45, 1, ft);
    cs.telegraph = 0;
    this._syncAll();

    // Motes peel off the dissolving front.
    if (bs.dissolve > 0 && bs.dissolve < 1) this._dissolveFx(dt, 1 - bs.dissolve);
    this.pointAt(0.5, this.position);
    this.position.y = 0.4;
  }

  /** The tip buries itself. */
  _slam() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._slammed = true;
    this.pointAt(1, _floor);
    _floor.y = 0;

    this.ctx.bursts.spawn(BurstMode.AIR, _floor, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.6,
      fresnel: 2,
      displace: 0.2,
      turbulence: 0.8,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.5,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.dustRingRadius * power,
      life: 1.2,
      intensity: 0.8,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustB)
    });

    // Sparks off the buried tip, sprayed forward and up.
    this._resetEmit(time);
    _dir.copy(this.direction).addScaledVector(_up, 0.9).normalize();
    _pos.copy(_floor).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.15;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed * 1.4;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = c.sparkLife * 1.2;
    this.sparks.emit(Math.round(c.slamSparks * g.particleCount), _emit);

    // Dust thrown up all along the cut.
    const n = Math.round(c.dustCount * g.particleCount);
    this._resetEmit(time);
    _emit.direction = _up;
    _emit.speed = c.dustLift * 2;
    _emit.spread = 0.6;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 0.5;
    _emit.radius = 0.2;
    for (let i = 0; i < n; i++) {
      const s = lerp(c.hingeForward, this.length, Math.random());
      this.pointAt(s / this.length, _pos);
      _pos.addScaledVector(this.side, (Math.random() * 2 - 1) * 0.4).setY(0.15);
      _emit.position = _pos;
      this.dust.emit(1, _emit);
    }

    // Everything along the blade that the contact never reached.
    this._cut = this.length + c.bladeOverhang;
    this._cutHits(true);

    this.ctx.shake.add(c.slamShake * power, 1 / Math.max(0.05, c.shakeDuration), 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * power);
    this.lightBoost = c.lightIntensity * c.slamLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Motes drifting off the raised edge. */
  _bladeFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.speed = c.moteSpeed;
    _emit.spread = 1;
    _emit.radius = 0.05;
    for (let i = 0; i < n; i++) {
      const s = Math.random();
      this._edgePoint(s, _pos);
      if (_pos.y < 0.05) continue;
      _emit.position = _pos;
      _emit.direction = this._bladeState.n;
      this.motes.emit(1, _emit);
    }
  }

  /** Sparks sprayed off the point of contact as it races down the line. */
  _contactFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    if (this._cut <= c.hingeForward) return;
    const n = Math.round(this.sparkEmitter.tick(dt, c.sparkRate) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this.pointAt(Math.min(1, this._cut / this.length), _pos);
    _pos.y = 0.05;
    _dir.copy(this.direction).addScaledVector(_up, 0.8).normalize();
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.7;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    this.sparks.emit(n, _emit);
  }

  /** Motes released off the dissolving blade. */
  _dissolveFx(dt, front) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * 2) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.moteSize * 1.2;
    _emit.life = c.moteLife;
    _emit.speed = c.moteSpeed * 1.5;
    _emit.spread = 1;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const s = saturate(front + (Math.random() - 0.5) * 0.08);
      this._bladeMid(_pos, s);
      if (_pos.y < 0.05) _pos.y = 0.08;
      _emit.position = _pos;
      this.motes.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /** Cut down every body the point of contact has passed since last frame. */
  _cutHits(all = false) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const from = all ? 0 : Math.max(0, this._prevCut - 0.3);
    const to = this._cut;
    if (to <= from) return;
    const mid = Math.min(1, (from + to) * 0.5 / this.length);
    this.pointAt(mid, _floor);
    const radius = Math.hypot((to - from) * 0.5, c.hitWidth);
    const found = field.findTargets(_floor.x, _floor.z, radius, this._found);
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
      if (Math.abs(lat) > c.hitWidth || along < from || along > to) continue;
      // Each half falls away from the cut.
      const sign = lat >= 0 ? 1 : -1;
      _dir.copy(this.side).multiplyScalar(sign).addScaledVector(this.direction, 0.2).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, c.hitSlice >= 0.5)) continue;
      this._hitCount++;
      this._resetEmit(frame.uTime.value);
      _pos.copy(dummy.position).setY(1.0);
      _emit.position = _pos;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = c.sparkSpeed * 0.7;
      _emit.spread = 0.9;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.round(30 * g.particleCount), _emit);
      _emit.speed = c.moteSpeed * 3;
      _emit.size = c.moteSize * 1.3;
      _emit.life = c.moteLife;
      this.motes.emit(Math.round(24 * g.particleCount), _emit);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.6);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.halo.visible = false;
    this.blade.visible = false;
    this.smear.visible = false;
    this.smearWarp.visible = false;
    this.cut.visible = false;
    this.glint.visible = false;
  }

  dispose() {
    this.haloGeometry.dispose();
    this.bladeGeometry.dispose();
    this.smearGeometry.dispose();
    this.cutGeometry.dispose();
    this.quadGeometry.dispose();
    this.cutMaterial.dispose();
    this.haloMaterial.dispose();
    this.bladeMaterial.dispose();
    this.smearMaterial.dispose();
    this.smearWarpMaterial.dispose();
    this.glintMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⚜  Halo Guillotine');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 90, 0.5, 'blade grows at (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'cut cools over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');

  const halo = folder.addFolder('1 · The halo');
  R(halo, c, 'haloAbove', 0.5, 5, 0.01, 'forms at height (m)');
  R(halo, c, 'haloRadius', 0.1, 3, 0.01, 'radius (m)');
  R(halo, c, 'haloTube', 0.005, 0.4, 0.001, 'thickness (m)');
  R(halo, c, 'haloRunes', 1, 48, 1, 'rune cells');
  R(halo, c, 'haloGlow', 0, 10, 0.05, 'glow');
  R(halo, c, 'runeGlow', 0, 10, 0.05, 'rune glow');
  R(halo, c, 'haloSpin', -3, 3, 0.01, 'rune spin (rev/s)');
  R(halo, c, 'formTime', 0, 2, 0.01, 'draws round over (s)');
  R(halo, c, 'hingeTime', 0, 2, 0.01, 'hinges down over (s)');
  R(halo, c, 'hingeForward', -1, 4, 0.01, 'hinge forward (m)');
  R(halo, c, 'hingeSide', -2, 2, 0.01, 'hinge to the right (m)');
  R(halo, c, 'hingeHeight', 0.1, 3, 0.01, 'hinge height (m)');
  R(halo, c, 'haloRise', 0, 6, 0.01, 'lifts away (m)');
  halo.addColor(c, 'colorHaloGold').name('gold');
  halo.addColor(c, 'colorHaloCore').name('inner lip');
  halo.addColor(c, 'colorRune').name('runes');

  const blade = folder.addFolder('2 · The blade');
  R(blade, c, 'raiseAngle', 2, 80, 0.5, 'stands open at (°)');
  R(blade, c, 'armLean', -80, 80, 0.5, 'swing plane leans (°)');
  R(blade, c, 'windup', 0, 40, 0.5, 'wind-up (°)');
  R(blade, c, 'quiver', 0, 5, 0.05, 'tremble (°)');
  R(blade, c, 'bladeWidth', 0.05, 4, 0.01, 'edge depth (m)');
  R(blade, c, 'bladeRoot', 0, 1, 0.01, 'depth at the hinge');
  R(blade, c, 'bladeBelly', 0.1, 3, 0.01, 'crescent belly');
  R(blade, c, 'bladeTipTaper', 0.01, 0.6, 0.005, 'tip taper');
  R(blade, c, 'bladeSpine', 0, 1, 0.005, 'behind the spine (m)');
  R(blade, c, 'bladeOverhang', 0, 4, 0.01, 'reaches past target (m)');
  R(blade, c, 'bladeGlow', 0, 10, 0.05, 'body glow');
  R(blade, c, 'edgeGlow', 0, 15, 0.05, 'edge glow');
  R(blade, c, 'edgeWidth', 0.01, 0.6, 0.005, 'edge width');
  R(blade, c, 'filigree', 0, 4, 0.01, 'engraving');
  R(blade, c, 'sheenGlow', 0, 6, 0.01, 'sheen');
  R(blade, c, 'sheenSpeed', 0, 6, 0.01, 'sheen passes/s');
  R(blade, c, 'bladeFresnel', 0, 4, 0.01, 'grazing glow');
  R(blade, c, 'bladeOpacity', 0, 1, 0.01, 'opacity');
  R(blade, c, 'softFade', 0.01, 1, 0.01, 'soft floor (m)');
  blade.addColor(c, 'colorBladeBody').name('body');
  blade.addColor(c, 'colorBladeHot').name('hot');
  blade.addColor(c, 'colorBladeEdge').name('edge');
  blade.addColor(c, 'colorEngrave').name('engraving');

  const swing = folder.addFolder('3 · The swing');
  R(swing, c, 'holdTime', 0, 2, 0.01, 'hangs for (s)');
  R(swing, c, 'swingTime', 0.03, 2, 0.01, 'falls over (s)');
  R(swing, c, 'lingerTime', 0.05, 3, 0.01, 'stays buried (s)');
  R(swing, c, 'smearArc', 0, 90, 0.5, 'smear (°)');
  R(swing, c, 'smearGlow', 0, 10, 0.05, 'smear glow');
  R(swing, c, 'smearWarp', 0, 4, 0.01, 'cut air distortion');
  swing.addColor(c, 'colorSmearA').name('smear leading');
  swing.addColor(c, 'colorSmearB').name('smear trailing');

  const cut = folder.addFolder('4 · The cut');
  R(cut, c, 'telegraph', 0, 3, 0.01, 'guide line');
  R(cut, c, 'cutWidth', 0.005, 0.5, 0.001, 'slit half-width (m)');
  R(cut, c, 'cutGlowWidth', 0.01, 2, 0.005, 'glow width (m)');
  R(cut, c, 'shardDensity', 0.1, 6, 0.01, 'shards per metre');
  R(cut, c, 'shardLength', 0, 3, 0.01, 'shard length (m)');
  R(cut, c, 'freshLength', 0.1, 20, 0.05, 'white-hot behind contact (m)');
  R(cut, c, 'cutGlow', 0, 12, 0.05, 'glow');
  R(cut, c, 'cutJitter', 0, 0.4, 0.005, 'wander (m)');
  R(cut, c, 'coolCurve', 0.1, 5, 0.01, 'holds heat');
  cut.addColor(c, 'colorCutHot').name('white-hot');
  cut.addColor(c, 'colorCutGold').name('gold');
  cut.addColor(c, 'colorCutCool').name('cooled');
  cut.addColor(c, 'colorScorch').name('scorch');

  const glint = folder.addFolder('5 · Glint');
  R(glint, c, 'glintSize', 0.05, 4, 0.01, 'size (m)');
  R(glint, c, 'glintGlow', 0, 10, 0.05, 'glow');
  glint.addColor(c, 'colorGlintCore').name('core');
  glint.addColor(c, 'colorGlintHalo').name('halo');

  const fx = folder.addFolder('6 · Particles');
  R(fx, c, 'moteRate', 0, 600, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteSpeed', 0, 8, 0.05, 'mote speed');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'mote lifetime');
  R(fx, c, 'moteLift', -4, 6, 0.05, 'mote rise');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'sparkRate', 0, 1200, 1, 'sparks/second');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');
  R(fx, c, 'dustCount', 0, 200, 1, 'dust puffs at the slam');
  R(fx, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
  R(fx, c, 'dustLift', 0, 5, 0.01, 'dust rise');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');

  const slam = folder.addFolder('7 · The slam');
  R(slam, c, 'slamSparks', 0, 600, 1, 'sparks');
  R(slam, c, 'burstSize', 0, 10, 0.05, 'air shell (m)');
  R(slam, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(slam, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(slam, c, 'dustRingRadius', 0, 10, 0.05, 'dust ring (m)');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'flash');
  R(slam, c, 'slamShake', 0, 1.5, 0.01, 'camera knock');
  R(slam, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(slam, c, 'slamLight', 0, 8, 0.01, 'light punch (× intensity)');
  slam.addColor(c, 'colorBurstA').name('shell inner');
  slam.addColor(c, 'colorBurstB').name('shell mid');
  slam.addColor(c, 'colorBurstC').name('shell outer');
  slam.addColor(c, 'colorShockA').name('shockwave');
  slam.addColor(c, 'colorShockB').name('shockwave hot');
  slam.addColor(c, 'colorFlash').name('flash');

  const hits = folder.addFolder('8 · Hits');
  R(hits, c, 'hitWidth', 0.1, 3, 0.01, 'catches within (m)');
  R(hits, c, 'hitImpulse', 0, 25, 0.1, 'halves thrown (m/s)');
  R(hits, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(hits, c, 'hitSlice', 0, 1, 1, 'slices (0/1)');

  folder.close();
  return folder;
}
