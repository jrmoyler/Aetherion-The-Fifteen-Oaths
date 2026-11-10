import { Euler, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createImpulseWellPieceGeometry, createImpulseWellHeroGeometry } from '../../assets/codex/ImpulseWellGeometry.js';
import { createImpulseFloorGeometry, createImpulseSlabGeometry } from '../../assets/codex/ImpulseWellSignatureGeometry.js';
import {
  createImpulseWellBodyMaterial,
  createImpulseWellLensMaterial,
  createImpulseWellGroundMaterial,
  createImpulseWellVoiceMaterial,
  createImpulseWellDetailMaterial,
  createImpulseWellFloorMaterial,
  createImpulseWellSlabMaterial,
  createImpulseWellOrbMaterial
} from '../../materials/codex/ImpulseWellMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'impulse';

const TWIST = 'inhale';
const ARCH = 'well';
const HIT = 'out';
const CARRY = 'out';
const WHEN = 'commit';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = false;
const ZONE = true;
const LIFT = 1;
const SLICE = false;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _focus = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);
const _hub = new Vector3();
const _hand = new Vector3();
const _slabPos = new Vector3();
const _scale = new Vector3();
const _tangent = new Vector3();
const _mat = new Matrix4();
const _qTilt = new Quaternion();
const _qSpin = new Quaternion();
const _euler = new Euler();

/** Most slabs one well tears up. */
const MAX_SLABS = 32;

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;

/**
 * IMPULSE WELL — force, zone cast.
 *
 * Force — impulse collects at the centre and dumps along the floor.
 *
 * Impulse collects at the centre during travel. The dump is horizontal, along the floor, on the beat.
 *
 * The read is `inhale`: hit timing `commit`, blow `out`, carry `out`.
 *
 * ## Layers
 *
 *   1. **body** — the inhale placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled force field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a drain riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createImpulseWellPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createImpulseWellHeroGeometry`), stood by its archetype (well): sunk low while it inhales, then stretched up the exhale.
 *      Hero and pieces are matter: sun-lit, opaque, shadow-casting (LAYER.SHAPED), the ramp as albedo, only hot parts glowing. The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: impulse collects at the centre during travel. The dump is horizontal, along the floor, on the beat.
 *  10. **mark** — a felled body is bruised: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The signature — the well (layers 12–15, this cast's own)
 *
 * The template sigil, voice, rig and pieces are turned down; the read is the
 * floor itself, which inhales and then dumps:
 *
 *  12. **well floor** — a disc of broken basalt (`createImpulseFloorGeometry`,
 *      `wellReach` × the circle) on LAYER.WORLD, sun-lit and shadowed. The
 *      instant the cast leaves the hand it starts sinking into a funnel
 *      (`wellDepth`, `wellFunnel`) whose cracks glow down to a hot eye: the
 *      floor inhales. On the beat the funnel dumps: it springs back and a
 *      heaved ring wave (`waveHeight`) runs out along the floor to the rim, its
 *      crest's cracks glowing, then the floor settles in ripples. On the way
 *      out it breaks up from the rim inward.
 *  13. **slabs** — `slabCount` torn floor slabs (InstancedMesh of
 *      `createImpulseSlabGeometry`), lit and shadow-casting, their torn
 *      undersides hot. While the well inhales they are dragged in toward the
 *      eye, tipping into the funnel. On the beat they are thrown up in a
 *      twisting column (`slabLift`…`slabLiftMax`, `slabSwirl`), unspooling over
 *      `slabStagger`, then fall back outward, land with a bounce, settle flat,
 *      cool and sink.
 *  14. **charge** — the impulse in flight: a lumpy dark lit mass with glowing
 *      seams that skims from the hand to the eye and dives into it.
 *  15. **trail** — streaks shed by the charge.
 *
 * Slab records are dice (angle, ring, size, lift, tumble, delay); every size
 * is resolved from settings each frame (the disc from `zoneRadius`).
 * Presentation only: hits are the template's commit blow.
 *
 * Every metre, rate and colour is read from `settings.impulse` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class ImpulseWellAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._hits;
  }

  createShaders() {
    this.bodyGeometry = createSpellBodyGeometry(ID);
    this.voiceGeometry = new PlaneGeometry(1, 1, 64, 8);
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.bodyMaterial = createImpulseWellBodyMaterial();
    this.lensMaterial = createImpulseWellLensMaterial();
    this.groundMaterial = createImpulseWellGroundMaterial();
    this.voiceMaterial = createImpulseWellVoiceMaterial();
    this.detailMaterial = createImpulseWellDetailMaterial();
    this.heroMaterial = createImpulseWellDetailMaterial(true);
    this.detail = new DetailLayer(createImpulseWellPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createImpulseWellHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._state = {
      center: new Vector3(),
      origin: new Vector3(),
      dir: new Vector3(0, 0, 1),
      side: new Vector3(1, 0, 0),
      radius: 1,
      length: 1,
      height: 1,
      thickness: 0.3,
      count: 6,
      spin: 0,
      voiceSpin: 0,
      open: 1,
      beat: 0,
      grow: 1,
      along: 0,
      seed: 0,
      fade: 1,
      dissolve: 0,
      phrase: 0,
      foot: 1,
      footWidth: 1,
      groundCenter: new Vector3(),
      land: 0,
      pre: 0,
      heat: 0,
      erode: 0,
      pulse: 1
    };
    this._seed = 0;
    this._settled = false;
    this._spin = 0;
    this._hits = 0;
    this._echoed = false;
    this._struck = [];
    this._carried = [];
    this._parts = Array.from({ length: 12 }, () => ({ armed: true }));
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._flow = { vx: 0, vy: 0, vz: 0 };
    this._field = (x, y, z, out) => out.set(this._flow.vx, this._flow.vy, this._flow.vz);
    this._found = [];
    this._marks = Array.from({ length: MAX_MARKS }, () => ({ dummy: null, time: 0, emitter: new RateEmitter() }));
    this._markCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0 };
    this._buildWell();
  }

  /** The well floor, its slabs and the charge in flight. */
  _buildWell() {
    this.wellGeometry = createImpulseFloorGeometry();
    this.wellMaterial = createImpulseWellFloorMaterial();
    this.well = this._mesh(this.wellGeometry, this.wellMaterial, LAYER.WORLD, 1);
    this.well.receiveShadow = true;
    this.slabGeometry = createImpulseSlabGeometry(3);
    this.slabMaterial = createImpulseWellSlabMaterial();
    this.slabs = new InstancedMesh(this.slabGeometry, this.slabMaterial, MAX_SLABS);
    this.slabs.layers.set(LAYER.WORLD);
    this.slabs.castShadow = true;
    this.slabs.receiveShadow = true;
    this.slabs.frustumCulled = false;
    this.slabs.renderOrder = 4;
    this.slabs.visible = false;
    this.group.add(this.slabs);
    this.orbGeometry = new SphereGeometry(1, 40, 28);
    this.orbMaterial = createImpulseWellOrbMaterial();
    this.orb = this._mesh(this.orbGeometry, this.orbMaterial, LAYER.WORLD, 5);
    this.orb.castShadow = true;
    this._slabRecs = Array.from({ length: MAX_SLABS }, () => ({ a: 0, r: 0, s: 1, lift: 0, out: 0, delay: 0, tx: 0, ty: 0, tz: 0, rest: 0 }));
    this._shape = { depth: 0, funnel: 0.6, waveR: 0, waveH: 0, waveW: 0.1, ripple: 0, ripplePhase: 0, pull: 0, crest: 0, ember: 0, core: 0, rim: 1 };
    this._orbEmitter = new RateEmitter();
    this._orbSpin = 0;
  }

  _resetWell() {
    const n = MAX_SLABS;
    for (let i = 0; i < n; i++) {
      const rec = this._slabRecs[i];
      rec.a = ((i + Math.random() * 0.7) / n) * Math.PI * 2;
      rec.r = Math.random();
      rec.s = 0.7 + 0.6 * Math.random();
      rec.lift = Math.random();
      rec.out = Math.random();
      rec.delay = Math.random();
      rec.tx = Math.random() * 2 - 1;
      rec.ty = Math.random() * 2 - 1;
      rec.tz = Math.random() * 2 - 1;
      rec.rest = (Math.random() - 0.5) * 0.3;
    }
    this._orbEmitter.reset();
    this._orbSpin = 0;
    this.well.visible = false;
    this.slabs.visible = false;
    this.orb.visible = false;
  }

  /** Seconds since the beat, from the 0..2 impact + fade clock. */
  _since(fadeT) {
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** The floor's height (metres) at `r` (× the disc), the same profile the shader draws. */
  _wellH(r) {
    const sh = this._shape;
    const f = Math.max(0, 1 - r / Math.max(0.02, sh.funnel));
    let h = -sh.depth * Math.pow(f, 1.6);
    const d = (r - sh.waveR) / Math.max(0.01, sh.waveW);
    h += sh.waveH * Math.exp(-d * d);
    h += sh.ripple * Math.sin(r * settings[ID].rippleK - sh.ripplePhase) * (1 - r);
    const edge = saturate((r - 0.86) / 0.14);
    return h * (1 - edge * edge * (3 - 2 * edge));
  }

  /**
   * Inhale, dump, heave, settle, close. `committed` false is the travel;
   * `fadeT` the 0..2 clock after the beat.
   */
  _updateWell(dt, committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const sh = this._shape;
    const R = Math.max(0.5, c.zoneRadius * c.wellReach);
    this.pointAt(1, _hub);
    const since = committed ? this._since(fadeT) : 0;
    let inhale;
    let heat;
    if (!committed) {
      inhale = c.wellInhaleFrom + (1 - c.wellInhaleFrom) * Easing.inOutQuad(saturate(this.u));
      sh.depth = c.wellDepth * inhale;
      sh.waveR = 0;
      sh.waveH = 0;
      sh.ripple = 0;
      sh.pull = c.wellPull * inhale;
      sh.crest = 0;
      sh.ember = 0;
      sh.core = c.wellCore * inhale;
      sh.rim = 1;
      heat = 0.35 + 0.4 * inhale;
    } else {
      inhale = 1;
      sh.depth = c.wellDepth * (1 - Easing.outCubic(saturate(since / 0.12)));
      sh.waveR = c.waveSpeed * since;
      sh.waveH = c.waveHeight * Math.exp(-since * c.waveDecay) * (1 - saturate((sh.waveR - 0.95) / 0.15));
      sh.ripple = c.rippleHeight * Math.exp(-since * c.rippleDecay) * saturate(since / 0.25);
      sh.ripplePhase = c.rippleSpeed * since;
      sh.pull = c.wellPull * Math.max(0, 1 - since * 6);
      sh.crest = c.waveCrest * Math.exp(-since * c.waveDecay * 0.6);
      sh.ember = c.wellEmber + 0.6 * Math.exp(-since * 1.4);
      sh.core = c.wellCore * Math.exp(-since * 7);
      sh.rim = 1 - Easing.inQuad(saturate((fadeT - 1.55) / 0.45));
      heat = 1;
    }
    sh.funnel = c.wellFunnel;
    sh.waveW = c.waveWidth;
    this.well.visible = c.wellOpacity > 0.01 && sh.rim > 0.01;
    this.well.position.set(_hub.x, 0.02, _hub.z);
    this.well.scale.set(R, 1, R);
    this.wellMaterial.userData.sync(sh, R, this._seed);
    this._updateSlabs(dt, committed, fadeT, since, inhale, R);
    this._updateOrb(dt, committed);
    return heat;
  }

  /** Dragged in, thrown up in a twisting column, fallen back, settled, sunk. */
  _updateSlabs(dt, committed, fadeT, since, inhale, R) {
    const c = settings[ID];
    const n = Math.max(0, Math.min(MAX_SLABS, Math.round(c.slabCount)));
    this.slabs.count = n;
    this.slabs.visible = n > 0 && c.slabOpacity > 0.01;
    this.slabs.castShadow = c.slabShadow > 0.5;
    if (!this.slabs.visible) return;
    const grav = Math.max(1, c.slabGravity);
    const sink = committed ? c.slabSink * Easing.inQuad(saturate((fadeT - c.slabSinkAt) / Math.max(0.05, 2 - c.slabSinkAt))) : 0;
    const drag = committed ? c.slabDrag : c.slabDrag * inhale;
    let flying = 0;
    for (let i = 0; i < n; i++) {
      const rec = this._slabRecs[i];
      const size = c.slabSize * rec.s;
      const r0 = (c.slabInner + (c.slabOuter - c.slabInner) * rec.r) * c.zoneRadius;
      const rIn = r0 * (1 - drag);
      const t = committed ? since - rec.delay * c.slabStagger : -1;
      let r;
      let a = rec.a;
      let y;
      if (t < 0) {
        // On the floor, dragged toward the eye and tipped into the funnel.
        r = rIn;
        const ru = r / R;
        const h = this._wellH(ru);
        const slope = (this._wellH(ru + 0.01) - this._wellH(Math.max(0, ru - 0.01))) / (0.02 * R);
        y = h + 0.12 * size;
        _tangent.set(-Math.sin(a), 0, Math.cos(a));
        _qTilt.setFromAxisAngle(_tangent, -Math.atan(slope));
        _qSpin.setFromAxisAngle(_up, rec.ty * 3);
        _qTilt.multiply(_qSpin);
      } else {
        const vy = c.slabLift + (c.slabLiftMax - c.slabLift) * rec.lift;
        const y0 = 0.2;
        const land = (vy + Math.sqrt(vy * vy + 2 * grav * y0)) / grav;
        const tf = Math.min(t, land);
        r = rIn + c.slabOut * (0.6 + 0.8 * rec.out) * tf;
        a += (c.slabSwirl / Math.max(0.5, rIn + 0.5)) * tf;
        const restY = 0.13 * size;
        if (t < land) {
          y = y0 + vy * t - 0.5 * grav * t * t;
          flying++;
        } else {
          const b = t - land;
          y = restY + c.slabBounce * size * Math.abs(Math.sin((b / 0.3) * Math.PI)) * Math.exp(-b * 6);
        }
        // Tumble in the air, then settle to the nearest flat side.
        const spin = c.slabTumble * tf;
        let rx = rec.tx * spin;
        let rz = rec.tz * spin;
        if (t >= land) {
          const k = Easing.outCubic(saturate((t - land) / 0.3));
          rx += (Math.round(rx / (2 * Math.PI)) * 2 * Math.PI + rec.rest - rx) * k;
          rz += (Math.round(rz / (2 * Math.PI)) * 2 * Math.PI + rec.rest * 0.5 - rz) * k;
        }
        _euler.set(rx, a + rec.ty * spin, rz);
        _qTilt.setFromEuler(_euler);
      }
      _slabPos.set(_hub.x + Math.cos(a) * r, y - sink, _hub.z + Math.sin(a) * r);
      _scale.setScalar(size);
      _mat.compose(_slabPos, _qTilt, _scale);
      this.slabs.setMatrixAt(i, _mat);
    }
    this.slabs.instanceMatrix.needsUpdate = true;
    // Hot as they tear and fly; cooling once the column has come down.
    const meanLand = (c.slabLift + c.slabLiftMax) / grav;
    const heat = !committed ? 0.35 * inhale : since < meanLand ? 1 : Math.exp(-(since - meanLand) * c.slabCool);
    this.slabMaterial.userData.sync(Math.max(heat, flying > 0 ? 0.8 : 0), this._seed);
  }

  /** The compressed charge, skimming from the hand to the eye and diving in. */
  _updateOrb(dt, committed) {
    const c = settings[ID];
    const g = settings.global;
    this.orb.visible = !committed && c.orbOpacity > 0.01;
    if (!this.orb.visible) return;
    const u = this.u;
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _slabPos.lerpVectors(_hand, _hub, u);
    const dive = Easing.inQuad(saturate((u - 0.8) / 0.2));
    _slabPos.y = c.handHeight + (c.orbHeight - c.handHeight) * Easing.outQuad(saturate(u * 3)) - (c.orbHeight + c.wellDepth * 0.6) * dive;
    const size = c.orbSize * (c.orbStart + (1 - c.orbStart) * Easing.outCubic(saturate(u * 1.5)));
    this._orbSpin += c.orbSpin * dt * g.animationSpeed;
    this.orb.position.copy(_slabPos);
    this.orb.scale.setScalar(size);
    this.orb.rotation.set(this._orbSpin * 0.7, this._orbSpin, 0);
    this.orbMaterial.userData.sync(this._orbSpin);
    const n = Math.round(this._orbEmitter.tick(dt, c.orbTrail) * g.particleCount);
    if (n > 0) {
      _dir.copy(this.direction).negate().setY(0.15);
      this._fillEmit(_slabPos, size * 0.7, _dir, c.streakSpeed * 0.5, 0.35, 0.07, c.streakLife, 2);
      this.streaks.emit(n, _emit);
    }
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
    this.dust = particles.get('impulse.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('impulse.streak', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('impulse.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('impulse.mote', {
      capacity: 600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.dustEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
    this.chipEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  get impactDuration() {
    return Math.max(0.05, settings[ID].impactTime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].fadeTime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f + f * Math.sin(this.age * 5.00);
  }

  onSpawn() {
    this._seed = Math.random() * 10;
    this._spin = Math.random() * Math.PI * 2;
    this._hits = 0;
    this._echoed = false;
    this._settled = false;
    this._struck.length = 0;
    this._carried.length = 0;
    for (let i = 0; i < this._parts.length; i++) this._parts[i].armed = true;
    this.dustEmitter.reset();
    this.streakEmitter.reset();
    this.chipEmitter.reset();
    this.moteEmitter.reset();
    this.detail.reseed(this._seed);
    this._resetWell();
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._releaseMarks();
    this._palette();
    this._hand();
    if (ZONE) this._telegraph();
  }

  /** The cast leaves the fist: a small flare, a spray of sparks along the aim, motes left hanging. */
  _hand() {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _pos.y = c.handHeight;
    if (c.handFlare > 0.01) {
      this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
        radius: 0.05,
        endRadius: c.handFlare,
        life: 0.22,
        intensity: 0.6,
        opacity: 0.4 * g.opacity,
        squash: 1,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    const sparks = Math.round(c.handSparks * g.particleCount);
    if (sparks > 0) {
      this._fillEmit(_pos, 0.08, this.direction, c.streakSpeed * 1.2, 0.5, 0.06, c.streakLife * 0.8, 2);
      this.streaks.emit(sparks, _emit);
    }
    const motes = Math.round(c.handMotes * g.particleCount);
    if (motes > 0) {
      this._fillEmit(_pos, 0.15, _up, c.moteSpeed * 0.5, 0.9, 0.08, c.moteLife, 1);
      this.motes.emit(motes, _emit);
    }
  }

  _focusPoint(out) {
    if (ZONE) return this.pointAt(1, out);
    return this.pointAt(this.u, out);
  }

  _aim(out) {
    this._focusPoint(out);
    if (OFFSET) out.addScaledVector(this.side, settings[ID].thickness * 4);
    return out;
  }

  _pose(committed, fadeT) {
    const u = this.u;
    const rise = committed ? 1 : Easing.outCubic(saturate(u));
    const beat = committed ? Easing.outCubic(saturate(fadeT < 1 ? fadeT : 1)) : 0;
    let grow;
    let open;
    let along;
    along = 1; grow = 0.25 + 0.75 * rise; open = beat;
    let dissolve = 0;
    if (committed && fadeT >= 1) dissolve = saturate((fadeT - 1) * 1.15);
    else if (DISSOLVE_TRAVEL && !committed) dissolve = saturate(u * 0.55);
    const fade = committed && fadeT >= 1 ? 1 - (fadeT - 1) : 1;
    const phrase = committed ? (fadeT < 1 ? 1 : 2) : 0;
    this._groundPose(committed, fadeT);
    this._write(open, grow, along, dissolve, fade, phrase);
  }

  /**
   * The floor's own clock. Before the beat a zone shows its footprint faintly
   * and a line lays its strip behind the head; on the beat the field lands out
   * to the rim over `groundLand` seconds (a line's strip is already down),
   * hot; it cools through the fade and breaks up over its last stretch. The
   * residue decal outlives it.
   */
  _groundPose(committed, fadeT) {
    const c = settings[ID];
    const st = this._state;
    if (!committed) {
      st.land = 0;
      st.pre = c.groundTelegraph * saturate(this.u * 1.4);
      st.heat = 0;
      st.erode = 0;
      return;
    }
    const since = fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
    const landed = saturate(since / Math.max(0.05, c.groundLand));
    st.land = 1.25 * Easing.outCubic(landed);
    st.pre = c.groundTelegraph * (1 - landed);
    st.heat = fadeT < 1 ? 1 - 0.3 * fadeT : 0.7 * (1 - saturate((fadeT - 1) * 1.5));
    st.erode = fadeT < 1 ? 0 : saturate((fadeT - 1.4) / 0.6);
  }

  _write(open, grow, along, dissolve, fade, phrase) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._state;
    this._focusPoint(_focus);
    st.center.copy(_focus);
    st.origin.copy(this.origin);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.radius = ZONE ? Math.max(0.2, c.zoneRadius) : Math.max(0.2, c.sweep);
    st.length = Math.max(0.2, this.length);
    st.height = c.height * g.shaderIntensity;
    st.thickness = c.thickness;
    st.count = Math.max(1, c.count);
    st.spin = this._spin;
    st.voiceSpin = this._spin * (COUNTER ? -1.35 : 1);
    st.open = open * (0.35 + Math.max(0, c.lean));
    st.beat = open;
    st.grow = grow;
    st.along = along;
    st.seed = this._seed;
    st.fade = fade;
    st.dissolve = dissolve;
    st.phrase = phrase;
    st.foot = ZONE ? c.zoneRadius * 2 : Math.max(0.4, this.front);
    st.footWidth = ZONE ? c.zoneRadius * 2 : c.groundWidth;
    // A zone's field sits on the circle; a line's covers the strip already crossed.
    if (ZONE) st.groundCenter.copy(_focus);
    else st.groundCenter.copy(this.origin).addScaledVector(this.direction, st.foot * 0.5);
    st.pulse = 1 + c.bodyPulse * Math.sin(this.age * c.bodyPulseRate);
    this.bodyMaterial.userData.sync(st);
    this.lensMaterial.userData.sync(st);
    this.groundMaterial.userData.sync(st);
    this.voiceMaterial.userData.sync(st);
    this.detailMaterial.userData.sync(st);
    this.heroMaterial.userData.sync(st);
    this.detail.update(TWIST, ZONE, st, c, this.age);
    this.rig.update(st, c, this.age);
    const show = fade > 0.02 && (grow > 0.02 || open > 0.02);
    this.body.visible = show;
    this.voice.visible = show;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
    this.position.copy(_focus);
    this.position.y = c.height * 0.45;
  }

  _palette() {
    const c = settings[ID];
    const g = settings.global;
    const sync = (p, a, b, cc, d, size, glow, grav) => {
      p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
      p.uniforms.uSizeScale.value = size * g.particleSize * 7;
      p.uniforms.uLifeScale.value = g.particleLifetime;
      p.uniforms.uSpeedScale.value = g.particleSpeed;
      p.uniforms.uOpacity.value = g.opacity;
      p.uniforms.uGlow.value = glow;
      p.uniforms.uGravity.value.set(0, grav, 0);
    };
    sync(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.4);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    sync(this.streaks, c.colorStreakA, c.colorStreakB, c.colorStreakC, c.colorStreakD, c.streakSize, 2 * g.glow, 0);
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    sync(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteSize, 1.6 * g.glow, -0.6);
    this.motes.uniforms.uOpacity.value = 0.9 * g.opacity;
    sync(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, -9);
  }

  _fillEmit(position, radius, direction, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  _shed(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    this._focusPoint(_end);
    const dustN = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (dustN > 0) {
      this._fillEmit(_end, ZONE ? c.zoneRadius * 0.35 : 0.3, _dir, c.dustSpeed, 0.45, 0.45, c.dustLife, 0.4);
      for (let i = 0; i < dustN; i++) {
        const ang = this._spin + i * 0.7;
        _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? -1.6 : 1.6).setY(0.05);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.direction).setY(0.1);
        _emit.direction = _dir;
        this.streaks.emit(1, _emit);
      }
    }
    const chipN = Math.round(this.chipEmitter.tick(dt, c.chipRate * strength) * g.particleCount);
    if (chipN > 0) {
      this._fillEmit(_end, 0.16, _dir, c.chipSpeed, 0.4, 0.08, c.chipLife, 6);
      for (let i = 0; i < chipN; i++) {
        const ang = this._spin + i * 1.3;
        _dir.set(Math.cos(ang), 0.7, Math.sin(ang));
        _emit.direction = _dir;
        this.chips.emit(1, _emit);
      }
    }
    this._motes(dt, strength);
  }

  /** Motes drift off whichever detail pieces are standing. */
  _motes(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength * (this.detail.live / Math.max(1, c.detailCount))) * g.particleCount);
    if (n <= 0) return;
    const count = Math.round(c.detailCount);
    for (let k = 0; k < n; k++) {
      const pick = Math.floor(Math.random() * count);
      if (!this.detail.pointOf(pick, _pos)) continue;
      _dir.set((Math.random() - 0.5) * 0.6, 1, (Math.random() - 0.5) * 0.6);
      this._fillEmit(_pos, 0.12, _dir, c.moteSpeed, 0.5, 0.08, c.moteLife, 1);
      this.motes.emit(1, _emit);
    }
  }

  _already(dummy) {
    for (let i = 0; i < this._struck.length; i++) if (this._struck[i] === dummy) return true;
    return false;
  }

  _remember(dummy) {
    if (this._struck.length < 24) this._struck.push(dummy);
    if (CARRY !== 'none' && this._carried.length < 16) this._carried.push(dummy);
    this._hits++;
    this._mark(dummy);
  }

  /** Start a felled body wearing the element. */
  _mark(dummy) {
    if (this._markCount >= MAX_MARKS) return;
    const slot = this._marks[this._markCount++];
    slot.dummy = dummy;
    slot.time = 0;
    slot.emitter.reset();
  }

  /** Stain the marked bodies toward the element's look and keep them shedding. */
  _updateMarks(dt) {
    if (this._markCount === 0) return;
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorMarkBody;
    look.rimColor = c.colorMarkRim;
    look.rimEmissive = c.markRimGlow;
    look.edgeColor = c.colorMarkEdge;
    look.edgeEmissive = c.markEdgeGlow;
    look.edgeWidth = c.markEdgeWidth;
    for (let i = 0; i < this._markCount; i++) {
      const slot = this._marks[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.02, c.markTime)) * c.markAmount, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.markLife * g.lifetime));
      if (left <= 0) continue;
      const n = Math.round(slot.emitter.tick(dt, c.markMotes * left) * g.particleCount);
      if (n <= 0) continue;
      const at = dummy.bodyPoint?.(_body) ?? _body.copy(dummy.position).setY(0.9);
      this._fillEmit(at, 0.3, _up, c.moteSpeed, 0.7, 0.08, c.moteLife, 1);
      this.motes.emit(n, _emit);
    }
  }

  _releaseMarks() {
    for (let i = 0; i < this._markCount; i++) this._marks[i].dummy = null;
    this._markCount = 0;
  }


  _killDir(dummy) {
    this._aim(_focus);
    _dir.set(dummy.position.x - _focus.x, 0, dummy.position.z - _focus.z);
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
    else _dir.normalize();
    
    
  }

  _blow(dummy, mode) {
    const c = settings[ID];
    const g = settings.global;
    if (mode && mode !== HIT) this._killEcho(dummy, mode);
    else this._killDir(dummy);
    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity * LIFT;
    if (mode === 'up') this._force.lift *= 1.4;
    this._force.spin = c.hitSpin;
    if (dummy.kill(_dir.x, _dir.z, this._force, SLICE || mode === 'swing')) this._remember(dummy);
  }

  _killEcho(dummy, mode) {
    this._aim(_focus);
    if (mode === 'up') {
      _dir.copy(this.direction).multiplyScalar(0.2);
      return;
    }
    _dir.set(dummy.position.x - _focus.x, 0, dummy.position.z - _focus.z);
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
    else _dir.normalize();
    if (mode === 'in') _dir.multiplyScalar(-1);
    if (mode === 'tangent') {
      const x = _dir.x;
      _dir.set(-_dir.z, 0, x);
    }
  }

  _gather(x, z, radius, mode) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(x, z, radius, this._found);
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      if (this._already(dummy)) continue;
      this._blow(dummy, mode);
    }
    this._found.length = 0;
  }


  _head(i, n) {
    return saturate(this.u * n - i);
  }

  _partPoint(i, n, out) {
    const c = settings[ID];
    const lane = ((i + 0.5) / n - 0.5) * 2 * c.sweep;
    const s = (i + 0.5) / n;
    return this.pointAt(s, out).addScaledVector(this.side, lane);
  }

  _strikeParts(forceAll) {
    const c = settings[ID];
    const n = Math.max(1, Math.min(12, Math.round(c.count)));
    for (let i = 0; i < n; i++) {
      if (!forceAll && this._head(i, n) < 0.98) continue;
      if (!this._parts[i].armed) continue;
      this._parts[i].armed = false;
      this._partPoint(i, n, _end);
      this._gather(_end.x, _end.z, Math.max(0.45, c.thickness * 4 + 0.5));
    }
  }

  _strike(forceAll) {
    const c = settings[ID];
    if (WHEN === 'part') {
      this._strikeParts(forceAll);
      return;
    }
    if (WHEN === 'late' && this.u < 0.42 && !forceAll) return;
    this._aim(_end);
    const reach = ZONE ? Math.max(c.zoneRadius, c.hitRadius) : Math.max(0.35, c.hitRadius);
    this._gather(_end.x, _end.z, reach);
  }

  _echo() {
    if (!ECHO) return;
    const c = settings[ID];
    this._aim(_end);
    const reach = (ZONE ? Math.max(c.zoneRadius, c.hitRadius) : c.hitRadius) * 1.15;
    this._gather(_end.x, _end.z, reach, ECHO);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * 0.45 * settings.global.explosionIntensity);
    this.ctx.shake.add(c.impactShake * 0.4 * settings.global.cameraShake, 6, 16);
  }

  _drag(dt, fade) {
    if (CARRY === 'none' || fade <= 0.02) return;
    const c = settings[ID];
    this._focusPoint(_focus);
    const grab = saturate(6 * dt) * fade;
    for (let i = this._carried.length - 1; i >= 0; i--) {
      const dummy = this._carried[i];
      if (!dummy || dummy.finished || dummy.alive) {
        dummy?.release?.();
        this._carried.splice(i, 1);
        continue;
      }
      const at = dummy.bodyPoint ? dummy.bodyPoint(_pos) : dummy.position;
      if (!at) continue;
      const dx = _focus.x - at.x;
      const dz = _focus.z - at.z;
      const d = Math.max(0.2, Math.hypot(dx, dz));
      const inward = CARRY === 'in' ? 1 : CARRY === 'out' ? -1 : 0.25;
      const spin = CARRY === 'orbit' ? 4.2 : 1.15;
      const lift = CARRY === 'up' ? 7 : 1.3;
      this._flow.vx = (dx / d) * inward * 6 * c.sweep + (-dz / d) * spin;
      this._flow.vz = (dz / d) * inward * 6 * c.sweep + (dx / d) * spin;
      this._flow.vy = lift * fade;
      dummy.carry(this._field, grab, grab, CARRY === 'up' ? 0.35 : 0);
    }
  }

  _telegraph() {
    const c = settings[ID];
    this.pointAt(1, _end);
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: Math.max(0.4, c.zoneRadius) * 0.85,
      life: Math.max(0.4, c.shockLife),
      width: 0.05,
      intensity: 0.45,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.02
    });
  }

  /**
   * The beat lands as a hit, not a pop: shake, flash and a light punch, a
   * low dust shell, real fragments thrown up and out with dust rolled along
   * the floor, and a filled residue decal sized to the circle that stays on the
   * floor after the cast is gone. The thin shock ring is only a trace now (`shockRing`).
   */
  _beat() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.impactShake * power * g.cameraShake, 4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    if (c.burstOpacity > 0.01) {
      this.ctx.bursts.spawn(BurstMode.EARTH, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
        radius: 0.35,
        endRadius: c.burstRadius * power,
        life: c.burstLife,
        intensity: 0.85,
        opacity: c.burstOpacity * g.opacity,
        squash: 0.38,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    this._debris(_end);
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: Math.max(0.5, c.zoneRadius * c.groundStainReach) * power,
      life: c.groundLife * g.lifetime,
      width: 0.8,
      intensity: c.groundStain,
      colorA: getColor(c.colorGroundStain),
      colorB: getColor(c.colorGroundA),
      height: 0.025
    });
    if (c.shockRing > 0.01) {
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
        radius: c.shockRadius * 0.8,
        life: c.shockLife * 0.75,
        width: 0.08,
        intensity: 0.85 * c.shockRing,
        colorA: getColor(c.colorShockB),
        colorB: getColor(c.colorShockA),
        height: 0.03
      });
    }
  }

  /** Fragments thrown up and out of the strike, and dust rolled out along the floor. */
  _debris(at) {
    const c = settings[ID];
    const g = settings.global;
    const spread = ZONE ? c.zoneRadius * 0.4 : 0.5;
    _pos.copy(at).setY(0.15);
    const chips = Math.round(c.impactChips * g.particleCount * g.explosionIntensity);
    if (chips > 0) {
      this._fillEmit(_pos, spread, _up, c.chipSpeed * 1.5, 0.8, c.chipSize * 1.4, c.chipLife * 1.3, 8);
      this.chips.emit(chips, _emit);
    }
    const dust = Math.round(c.impactDust * g.particleCount);
    for (let i = 0; i < dust; i++) {
      const ang = (i / Math.max(1, dust)) * Math.PI * 2 + this._spin;
      _dir.set(Math.cos(ang), 0.12, Math.sin(ang));
      this._fillEmit(_pos, spread * 0.6, _dir, c.dustSpeed * 1.8, 0.25, 0.6, c.dustLife * 1.4, 0.4);
      this.dust.emit(1, _emit);
    }
  }

  /** The smaller second beat: a low dust roll settling over the field, a thud and a last flare of light. */
  _aftershock() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.aftershockShake * power * g.cameraShake, 3, 12);
    this.lightBoost += c.aftershockLight * power;
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.aftershockRadius * power,
      life: c.aftershockLife,
      width: 0.06,
      intensity: 0.55,
      colorA: getColor(c.colorGroundB),
      colorB: getColor(c.colorGroundA),
      height: 0.03
    });
  }

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
    this._updateWell(dt, false, 0);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
    this._updateWell(dt, true, t);
    this._palette();
    this._shed(dt, fade * 0.7);
    if (WHEN === 'return') this._strike(false);
    if (!this._settled && t > c.aftershockAt) {
      this._settled = true;
      this._aftershock();
    }
    if (ECHO && !this._echoed && t > 1.08) {
      this._echoed = true;
      this._echo();
    }
    this._drag(dt, fade);
    this._updateMarks(dt);
  }

  onDestroy() {
    this._releaseMarks();
    for (let i = 0; i < this._carried.length; i++) this._carried[i].release?.();
    this._carried.length = 0;
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this.detail.hide();
    this.rig.hide();
    this.well.visible = false;
    this.slabs.visible = false;
    this.orb.visible = false;
  }

  dispose() {
    this.slabs.dispose();
    this.wellGeometry.dispose();
    this.wellMaterial.dispose();
    this.slabGeometry.dispose();
    this.slabMaterial.dispose();
    this.orbGeometry.dispose();
    this.orbMaterial.dispose();
    this.detail.dispose();
    this.rig.dispose();
    this.detailMaterial.dispose();
    this.heroMaterial.dispose();
    this.bodyGeometry.dispose();
    this.voiceGeometry.dispose();
    this.groundGeometry.dispose();
    this.bodyMaterial.dispose();
    this.lensMaterial.dispose();
    this.groundMaterial.dispose();
    this.voiceMaterial.dispose();
    super.dispose();
  }
}

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('Impulse Well');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'travel (m/s)');
  R(cast, c, 'cooldown', 0, 8, 0.05, 'cooldown');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'impact (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.01, 'fade (s)');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle (m)');
  Editor.castAnimation(cast, c);

  const hand = folder.addFolder('0 · Hand');
  R(hand, c, 'handForward', -0.5, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'side (m)');
  R(hand, c, 'handHeight', 0.2, 2.5, 0.01, 'height (m)');
  R(hand, c, 'handFlare', 0, 3, 0.01, 'flare (m)');
  R(hand, c, 'handSparks', 0, 120, 1, 'sparks');
  R(hand, c, 'handMotes', 0, 80, 1, 'motes');

  const shape = folder.addFolder('1 · Shape — inhale');
  R(shape, c, 'count', 1, 16, 1, 'count');
  R(shape, c, 'height', 0.2, 10, 0.05, 'height (m)');
  R(shape, c, 'thickness', 0.02, 2, 0.01, 'thickness (m)');
  R(shape, c, 'sweep', 0, 8, 0.05, 'reach');
  R(shape, c, 'lean', 0, 3, 0.01, 'lean');

  const motion = folder.addFolder('2 · Timing');
  R(motion, c, 'spinSpeed', -20, 20, 0.1, 'spin (rad/s)');
  R(motion, c, 'lifetime', 0.1, 5, 0.05, 'hold (s)');

  const look = folder.addFolder('3 · Body');
  R(look, c, 'bodyOpacity', 0, 2, 0.01, 'opacity');
  R(look, c, 'bodyGlow', 0, 4, 0.01, 'body glow');
  R(look, c, 'edgeGlow', 0, 10, 0.05, 'edge glow');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(look, c, 'bodyPulse', 0, 1, 0.01, 'pulse');
  R(look, c, 'bodyPulseRate', 0, 20, 0.1, 'pulse rate');
  R(look, c, 'lensWarp', 0, 3, 0.01, 'lens warp');
  look.addColor(c, 'colorA').name('edge');
  look.addColor(c, 'colorB').name('core');
  look.addColor(c, 'colorC').name('deep');

  const voice = folder.addFolder('4 · Voice');
  R(voice, c, 'voiceOpacity', 0, 2, 0.01, 'opacity');
  voice.addColor(c, 'colorVoiceA').name('voice');
  voice.addColor(c, 'colorVoiceB').name('voice, hot');

  const floor = folder.addFolder('5 · Ground');
  R(floor, c, 'groundWidth', 0.2, 16, 0.05, 'width (m)');
  R(floor, c, 'groundGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'groundLife', 0.1, 12, 0.05, 'residue life (s)');
  R(floor, c, 'groundOpacity', 0, 2, 0.01, 'opacity');
  R(floor, c, 'groundHeat', 0, 4, 0.05, 'heat');
  R(floor, c, 'groundCoat', 0, 1, 0.01, 'stain .. coat');
  R(floor, c, 'groundLand', 0.05, 2, 0.01, 'lands in (s)');
  R(floor, c, 'groundTelegraph', 0, 1, 0.01, 'footprint before the beat');
  R(floor, c, 'groundStain', 0, 1.5, 0.01, 'residue');
  R(floor, c, 'groundStainReach', 0.1, 2, 0.01, 'residue reach');
  floor.addColor(c, 'colorGroundA').name('ground');
  floor.addColor(c, 'colorGroundB').name('ground, deep');
  floor.addColor(c, 'colorGroundStain').name('stain');

  const pieces = folder.addFolder('6 · Detail pieces');
  R(pieces, c, 'detailCount', 0, 48, 1, 'count');
  R(pieces, c, 'detailSize', 0.05, 2, 0.01, 'size (m)');
  R(pieces, c, 'detailSizeJitter', 0, 1, 0.01, 'size jitter');
  R(pieces, c, 'detailSpread', 0.1, 2, 0.01, 'spread');
  R(pieces, c, 'detailLift', 0, 8, 0.05, 'lift (m)');
  R(pieces, c, 'detailSpin', -4, 4, 0.05, 'orbit');
  R(pieces, c, 'detailGlow', 0, 6, 0.05, 'rim glow');
  R(pieces, c, 'detailOpacity', 0, 1.5, 0.01, 'opacity');
  R(pieces, c, 'detailSwing', 0, 2.5, 0.01, 'fold');
  R(pieces, c, 'detailEdge', 0, 4, 0.05, 'arris light');
  R(pieces, c, 'detailDeep', 0, 1, 0.01, 'colour depth');
  R(pieces, c, 'detailRough', 0, 1, 0.01, 'roughness');
  R(pieces, c, 'detailMetal', 0, 1, 0.01, 'metalness');
  R(pieces, c, 'detailShadow', 0, 1, 1, 'cast shadow');
  pieces.addColor(c, 'colorDetailA').name('rim');
  pieces.addColor(c, 'colorDetailB').name('lit');
  pieces.addColor(c, 'colorDetailC').name('shade');

  const hero = folder.addFolder('7 · Hero rig');
  R(hero, c, 'heroSize', 0.2, 8, 0.05, 'size (m)');
  R(hero, c, 'heroReach', 0.1, 1.4, 0.01, 'ring fit');
  R(hero, c, 'heroLift', 0, 8, 0.05, 'travel (m)');
  R(hero, c, 'heroSpin', -4, 4, 0.05, 'turn');
  R(hero, c, 'heroSwing', 0, 2.5, 0.01, 'fold');
  R(hero, c, 'heroGlow', 0, 6, 0.05, 'rim glow');
  R(hero, c, 'heroEdge', 0, 4, 0.05, 'arris light');
  R(hero, c, 'heroOpacity', 0, 1.5, 0.01, 'opacity');
  R(hero, c, 'heroDeep', 0, 1, 0.01, 'colour depth');
  R(hero, c, 'heroMaxHeight', 1, 12, 0.05, 'max height (m)');
  R(hero, c, 'heroFit', 0, 1.5, 0.01, 'fit to circle');
  R(hero, c, 'heroRough', 0, 1, 0.01, 'roughness');
  R(hero, c, 'heroMetal', 0, 1, 0.01, 'metalness');
  R(hero, c, 'heroShadow', 0, 1, 1, 'cast shadow');
  hero.addColor(c, 'colorHeroA').name('rim');
  hero.addColor(c, 'colorHeroB').name('lit');
  hero.addColor(c, 'colorHeroC').name('shade');

  const parts = folder.addFolder('8 · Shed');
  R(parts, c, 'dustRate', 0, 400, 1, 'dust / s');
  R(parts, c, 'dustSize', 0.02, 2, 0.01, 'dust size');
  R(parts, c, 'dustSpeed', 0, 20, 0.1, 'dust speed');
  R(parts, c, 'dustLife', 0.05, 3, 0.01, 'dust life');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'streakRate', 0, 400, 1, 'shed / s');
  R(parts, c, 'streakSize', 0.005, 0.4, 0.005, 'shed size');
  R(parts, c, 'streakSpeed', 0, 30, 0.1, 'shed speed');
  R(parts, c, 'streakLife', 0.05, 2, 0.01, 'shed life');
  R(parts, c, 'streakStretch', 0, 4, 0.01, 'shed stretch');
  Editor.gradient(parts, c, 'colorStreak', 'shed colour');
  R(parts, c, 'chipRate', 0, 200, 1, 'chips / s');
  R(parts, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(parts, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(parts, c, 'chipLife', 0.05, 3, 0.01, 'chip life');
  Editor.gradient(parts, c, 'colorChip', 'chip colour');

  const motes = folder.addFolder('9 · Motes');
  R(motes, c, 'moteRate', 0, 200, 1, 'motes / s');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'size');
  R(motes, c, 'moteSpeed', 0, 10, 0.1, 'speed');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'life');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');

  const beat = folder.addFolder('10 · The beat');
  R(beat, c, 'impactShake', 0, 2, 0.01, 'camera punch');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 12, 0.05, 'burst (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'burst life');
  R(beat, c, 'burstOpacity', 0, 1.5, 0.01, 'burst opacity');
  R(beat, c, 'impactChips', 0, 200, 1, 'fragments');
  R(beat, c, 'impactDust', 0, 120, 1, 'dust roll');
  beat.addColor(c, 'colorBurstA').name('burst, hot');
  beat.addColor(c, 'colorBurstB').name('burst, body');
  beat.addColor(c, 'colorBurstC').name('burst, deep');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'decal (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'decal life');
  R(beat, c, 'shockRing', 0, 1.5, 0.01, 'shock ring');
  beat.addColor(c, 'colorShockA').name('decal');
  beat.addColor(c, 'colorShockB').name('decal, hot');

  const after = folder.addFolder('11 · Aftershock');
  R(after, c, 'aftershockAt', 1, 1.9, 0.01, 'lands at');
  R(after, c, 'aftershockRadius', 0, 12, 0.05, 'dust roll (m)');
  R(after, c, 'aftershockShake', 0, 2, 0.01, 'camera punch');
  R(after, c, 'aftershockLight', 0, 40, 0.5, 'light punch');
  R(after, c, 'aftershockLife', 0.05, 3, 0.01, 'dust life');

  const bodies = folder.addFolder('12 · Bodies');
  R(bodies, c, 'hitRadius', 0.1, 12, 0.05, 'reach (m)');
  R(bodies, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(bodies, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(bodies, c, 'hitSpin', 0, 8, 0.05, 'spin');

  const mark = folder.addFolder('13 · Mark — bruised');
  R(mark, c, 'markAmount', 0, 1, 0.01, 'stain');
  R(mark, c, 'markTime', 0.02, 3, 0.01, 'sets in (s)');
  R(mark, c, 'markLife', 0, 8, 0.05, 'sheds for (s)');
  R(mark, c, 'markMotes', 0, 120, 1, 'motes / s');
  mark.addColor(c, 'colorMarkBody').name('body');
  mark.addColor(c, 'colorMarkRim').name('rim');
  R(mark, c, 'markRimGlow', 0, 6, 0.05, 'rim glow');
  mark.addColor(c, 'colorMarkEdge').name('edge');
  R(mark, c, 'markEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(mark, c, 'markEdgeWidth', 0, 0.3, 0.005, 'edge width');

  const well = folder.addFolder('14 · Well floor');
  R(well, c, 'wellReach', 0.3, 2, 0.01, 'disc × circle');
  R(well, c, 'wellDepth', 0, 4, 0.05, 'funnel depth (m)');
  R(well, c, 'wellFunnel', 0.1, 1, 0.01, 'funnel × disc');
  R(well, c, 'wellInhaleFrom', 0, 1, 0.01, 'sunk at the cast');
  R(well, c, 'wellCell', 0.1, 3, 0.01, 'cells (m)');
  R(well, c, 'wellGlow', 0, 6, 0.05, 'crack glow');
  R(well, c, 'wellPull', 0, 4, 0.05, 'funnel glow');
  R(well, c, 'wellCore', 0, 8, 0.05, 'eye glow');
  R(well, c, 'wellEmber', 0, 1, 0.01, 'embers left');
  R(well, c, 'wellOpacity', 0, 1, 1, 'show');
  R(well, c, 'waveHeight', 0, 3, 0.01, 'wave (m)');
  R(well, c, 'waveSpeed', 0.1, 6, 0.05, 'wave speed (discs/s)');
  R(well, c, 'waveWidth', 0.02, 0.5, 0.005, 'wave width');
  R(well, c, 'waveDecay', 0, 6, 0.05, 'wave decay');
  R(well, c, 'waveCrest', 0, 6, 0.05, 'crest glow');
  R(well, c, 'rippleHeight', 0, 1, 0.01, 'ripples (m)');
  R(well, c, 'rippleK', 0, 80, 0.5, 'ripple count');
  R(well, c, 'rippleSpeed', 0, 40, 0.1, 'ripple speed');
  R(well, c, 'rippleDecay', 0, 6, 0.05, 'ripple decay');
  well.addColor(c, 'colorWellDeep').name('basalt, deep');
  well.addColor(c, 'colorWellBody').name('basalt, lit');
  well.addColor(c, 'colorWellHot').name('force heat');
  well.addColor(c, 'colorWellCore').name('eye');

  const slab = folder.addFolder('15 · Slabs');
  R(slab, c, 'slabCount', 0, 32, 1, 'count');
  R(slab, c, 'slabSize', 0.1, 3, 0.01, 'size ×');
  R(slab, c, 'slabInner', 0, 1.2, 0.01, 'nearest × circle');
  R(slab, c, 'slabOuter', 0, 1.5, 0.01, 'farthest × circle');
  R(slab, c, 'slabDrag', 0, 1, 0.01, 'dragged in');
  R(slab, c, 'slabLift', 0, 20, 0.1, 'lift min (m/s)');
  R(slab, c, 'slabLiftMax', 0, 25, 0.1, 'lift max (m/s)');
  R(slab, c, 'slabOut', 0, 10, 0.05, 'thrown out (m/s)');
  R(slab, c, 'slabSwirl', -10, 10, 0.05, 'twist (m/s)');
  R(slab, c, 'slabStagger', 0, 1, 0.01, 'unspools (s)');
  R(slab, c, 'slabGravity', 1, 40, 0.5, 'gravity');
  R(slab, c, 'slabTumble', 0, 20, 0.1, 'tumble');
  R(slab, c, 'slabBounce', 0, 1, 0.01, 'bounce (m)');
  R(slab, c, 'slabHeat', 0, 6, 0.05, 'underside heat');
  R(slab, c, 'slabCool', 0, 6, 0.05, 'cools / s');
  R(slab, c, 'slabSink', 0, 2, 0.01, 'sinks (m)');
  R(slab, c, 'slabSinkAt', 0, 2, 0.01, 'sinks from');
  R(slab, c, 'slabOpacity', 0, 1, 1, 'show');
  R(slab, c, 'slabShadow', 0, 1, 1, 'cast shadow');
  slab.addColor(c, 'colorSlabBody').name('slab rock');

  const orb = folder.addFolder('16 · Charge');
  R(orb, c, 'orbSize', 0.1, 3, 0.01, 'radius (m)');
  R(orb, c, 'orbStart', 0.05, 1, 0.01, 'size at the hand');
  R(orb, c, 'orbHeight', 0, 4, 0.05, 'flight height (m)');
  R(orb, c, 'orbLump', 0, 1, 0.01, 'lumps');
  R(orb, c, 'orbSpin', -30, 30, 0.1, 'churn');
  R(orb, c, 'orbGlow', 0, 8, 0.05, 'seam glow');
  R(orb, c, 'orbTrail', 0, 600, 1, 'trail / s');
  R(orb, c, 'orbOpacity', 0, 1, 1, 'show');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
