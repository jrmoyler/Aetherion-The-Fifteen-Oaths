import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createFeintCagePieceGeometry, createFeintCageHeroGeometry } from '../../assets/codex/FeintCageGeometry.js';
import { createFeintCageBarGeometry } from '../../assets/codex/FeintCageSignatureGeometry.js';
import {
  createFeintCageBodyMaterial,
  createFeintCageLensMaterial,
  createFeintCageGroundMaterial,
  createFeintCageVoiceMaterial,
  createFeintCageDetailMaterial,
  createFeintCageBarMaterial,
  createFeintCageFloorMaterial
} from '../../materials/codex/FeintCageMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'feintcage';

const TWIST = 'crush';
const ARCH = 'cage';
const HIT = 'in';
const CARRY = 'orbit';
const WHEN = 'commit';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = true;
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

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;

/** Bars per cage (the real one and the feint each). */
const MAX_BARS = 14;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _ax = new Vector3();
const _ay = new Vector3();
const _rv = new Vector3();
const _tan = new Vector3();
const _inw = new Vector3();
const _slot = new Vector3();
const _fly = new Vector3();
const _handAt = new Vector3();
const _foot = new Vector3();
const _tip = new Vector3();

/**
 * FEINT CAGE — illusion, zone cast.
 *
 * Illusion — a cage and its feint spin opposite ways, and only one of them cuts.
 *
 * A cage and its feint spin opposite ways. Only the inward cage cuts.
 *
 * The read is `crush`: hit timing `commit`, blow `in`, carry `orbit`.
 *
 * ## Layers
 *
 *   1. **body** — the crush placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled illusion field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a chord riding alongside the body, spun the other way.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createFeintCagePieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createFeintCageHeroGeometry`), stood by its archetype (cage): dropped from above, then closed inward.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: a cage and its feint spin opposite ways. Only the inward cage cuts.
 *  10. **mark** — a felled body is glamoured: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The cage (cast-local signature, `14 · Cage` in the editor)
 *
 * The template layers above are switched off through their own keys (body,
 * voice, lens, template field, detail pieces, rig, burst shell, shock ring);
 * what carries the read is the cage:
 *
 *   - **the throw** — two sheaves of `cageCount` bars
 *     (`createFeintCageBarGeometry`: driven foot, collars, a shaft that twists a
 *     quarter turn, a broad spearhead) leave the hand and tumble end over end
 *     on a low arc, broadside to the camera, side by side. The second sheaf
 *     is the feint: the same bars as a dim violet, translucent, scan-sliced
 *     afterimage, tumbling the other way.
 *   - **the plant** — on the beat both sheaves burst open; each bar swings
 *     upright and stabs down into its slot on a ring (`cageFit` / `feintFit`
 *     × the circle), kicking dust and chips; a dark stain lands under the circle.
 *   - **the feint** — the two cages turn opposite ways round the bodies
 *     (`cageSpin`, `feintSpin`); the real one ploughs a groove, hot under its
 *     feet; the feint only leaves a flickering dash.
 *   - **the cut** — at `cageCutAt` the feint glitches apart into motes and the
 *     real cage clenches: every bar leans in (`cageLean`) and its blade goes
 *     white-hot; a gash per bar is torn from its foot in toward the centre.
 *   - **the linger** — the clenched cage keeps grinding round, its blades
 *     cooling through pink to dark, smoke off the gashes.
 *   - **the exit** — from `cageSinkAt` the bars are eaten from the top behind a
 *     hot edge and sink; the stain and the gashes let go last.
 *
 * Every metre, rate and colour is read from `settings.feintcage` each frame.
 * A cast only captures a seed, integrated spins and event flags.
 */
export class FeintCageAbility extends Ability {
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
    this.bodyMaterial = createFeintCageBodyMaterial();
    this.lensMaterial = createFeintCageLensMaterial();
    this.groundMaterial = createFeintCageGroundMaterial();
    this.voiceMaterial = createFeintCageVoiceMaterial();
    this.detailMaterial = createFeintCageDetailMaterial();
    this.heroMaterial = createFeintCageDetailMaterial(true);
    this.detail = new DetailLayer(createFeintCagePieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createFeintCageHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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
    this._buildCage();
  }

  /** The cage's own meshes: the real bars, the feint's bars and the floor. */
  _buildCage() {
    this.barGeometry = createFeintCageBarGeometry();
    this.barMaterial = createFeintCageBarMaterial(false);
    this.feintMaterial = createFeintCageBarMaterial(true);
    const make = (material, shadow) => {
      const geometry = this.barGeometry.clone();
      const attr = new InstancedBufferAttribute(new Float32Array(MAX_BARS * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aBar', attr);
      const mesh = new InstancedMesh(geometry, material, MAX_BARS);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.layers.set(LAYER.SHAPED);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    this.bars = make(this.barMaterial, true);
    this.feints = make(this.feintMaterial, false);
    // The feint is a translucent afterimage: it draws with the other transparent VFX.
    this.feints.layers.set(LAYER.VFX);
    this.feints.renderOrder = 15;
    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.floorMaterial = createFeintCageFloorMaterial();
    this.floor = this._mesh(this.floorGeometry, this.floorMaterial, LAYER.VFX, 2);
    this.floor.rotation.x = -Math.PI / 2;
    this._cage = {
      spin: 0, // integrated turn of the real cage, radians
      feintSpin: 0, // and of the feint, the other way
      roll: 0, // tumble of the sheaves in flight
      planted: false,
      cut: false,
      gone: false,
      sinking: false,
      heat: 0, // blade heat of the real cage
      shake: 0
    };
    this._floorSync = {
      centre: new Vector3(),
      outer: 1,
      ring: 1,
      feintRing: 1,
      feint: 0,
      count: 8,
      spin: 0,
      heat: 0,
      gash: 0,
      gashHeat: 0,
      land: 0,
      alpha: 0,
      seed: 0
    };
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
    this.dust = particles.get('feintcage.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('feintcage.streak', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('feintcage.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('feintcage.mote', {
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
    return 1 - f + f * Math.sin(this.age * 11.00);
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
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._releaseMarks();
    this._resetCage();
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
      this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
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
    this._cagePose(committed, fadeT);
    const u = this.u;
    const rise = committed ? 1 : Easing.outCubic(saturate(u));
    const beat = committed ? Easing.outCubic(saturate(fadeT < 1 ? fadeT : 1)) : 0;
    let grow;
    let open;
    let along;
    along = 1; grow = rise; open = beat;
    let dissolve = 0;
    if (committed && fadeT >= 1) dissolve = saturate((fadeT - 1) * 1.15);
    else if (DISSOLVE_TRAVEL && !committed) dissolve = saturate(u * 0.55);
    const fade = committed && fadeT >= 1 ? 1 - (fadeT - 1) : 1;
    const phrase = committed ? (fadeT < 1 ? 1 : 2) : 0;
    this._groundPose(committed, fadeT);
    this._write(open, grow, along, dissolve, fade, phrase);
  }


  _resetCage() {
    const k = this._cage;
    k.spin = this._seed;
    k.feintSpin = this._seed + Math.PI / Math.max(3, settings[ID].cageCount);
    k.roll = 0;
    k.planted = false;
    k.cut = false;
    k.gone = false;
    k.sinking = false;
    k.heat = 0;
    this._cageDt = 0;
    this._sparkEmitter ??= new RateEmitter();
    this._smokeEmitter ??= new RateEmitter();
    this._sparkEmitter.reset();
    this._smokeEmitter.reset();
    this._hideCage();
  }

  _hideCage() {
    this.bars.visible = false;
    this.feints.visible = false;
    this.floor.visible = false;
  }

  /** Seconds since the beat (negative in flight). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** Write one bar: foot position, its long axis (`ay`, unit), its blade axis (`ax`), length and width. */
  _setBar(mesh, i, foot, ay, ax, len, width, seed, heat, sink, glitch) {
    _bz.crossVectors(ax, ay).normalize();
    _bx.crossVectors(ay, _bz).normalize();
    _by.copy(ay).multiplyScalar(len);
    _bx.multiplyScalar(width);
    _bz.multiplyScalar(width);
    _m4.makeBasis(_bx, _by, _bz).setPosition(foot);
    mesh.setMatrixAt(i, _m4);
    const a = mesh.geometry.getAttribute('aBar');
    a.setXYZW(i, seed, heat, sink, glitch);
  }

  /** Where bar `i` of a sheaf sits in flight: tumbling about the side axis round `centre`. */
  _sheafBar(i, n, centre, roll, radius, len, foot, ax) {
    const phi = roll + (i * TAU) / n;
    _rv.copy(_up).multiplyScalar(Math.cos(phi)).addScaledVector(this.direction, Math.sin(phi));
    foot.copy(centre).addScaledVector(_rv, radius).addScaledVector(this.side, -len * 0.5);
    ax.copy(_rv);
  }

  /**
   * The cage, every frame: two tumbling sheaves in flight; on the beat they
   * burst open and the bars stab down into two rings; the rings turn opposite
   * ways; at the cut the feint glitches out and the real cage clenches in; it
   * grinds on, cools and sinks. Everything is placed from settings now.
   */
  _cagePose(committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const k = this._cage;
    const dt = this._cageDt;
    const n = Math.max(3, Math.min(MAX_BARS, Math.round(c.cageCount)));
    const since = this._since(committed, fadeT);
    const H = Math.max(0.2, c.cageHeight);
    const W = Math.max(0.02, c.cageWidth);
    const ring = Math.max(0.3, c.zoneRadius * c.cageFit);
    const feintRing = Math.max(0.3, c.zoneRadius * c.feintFit);
    this._focusPoint(_focus);
    k.roll += dt * c.cageRoll * g.animationSpeed;

    _handAt.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _handAt.y = c.handHeight;

    if (since < 0) {
      // The throw: two sheaves tumble end over end along an arc, broadside.
      const u = saturate(this.u);
      const e = Easing.outQuad(u);
      _fly.copy(_handAt).lerp(_pos.copy(_focus).setY(c.cageDrop), e);
      _fly.y += c.cageArc * Math.sin(Math.PI * u);
      const grow = 0.35 + 0.65 * Easing.outCubic(saturate(u / 0.2));
      const len = H * c.cageFlightScale * grow;
      const rb = c.cageBundle * grow;
      for (let i = 0; i < n; i++) {
        this._sheafBar(i, n, _fly, k.roll, rb, len, _foot, _ax);
        this._setBar(this.bars, i, _foot, this.side, _ax, len, W * grow, i * 1.37 + this._seed, 0.15, 0, 0);
        _slot.copy(_fly).addScaledVector(this.side, c.cageFeintGap).addScaledVector(_up, c.cageFeintGap * 0.15);
        this._sheafBar(i, n, _slot, -k.roll + 0.4, rb, len, _foot, _ax);
        this._setBar(this.feints, i, _foot, this.side, _ax, len, W * grow, i * 2.11 + this._seed, 0.1, 0, 0.3);
      }
      this._finishBars(n, true, true);
      this.floor.visible = false;
      return;
    }

    // On the ground.
    const open = saturate(since / Math.max(0.02, c.cageOpen));
    const stab = Easing.inQuad(open);
    const cutAt = c.cageCutAt * this.impactDuration;
    const cutS = since >= cutAt ? saturate((since - cutAt) / Math.max(0.02, c.cageCutTime)) : 0;
    if (open >= 1 && !k.planted) {
      k.planted = true;
      this._cagePlant(n, ring);
    }
    if (cutS > 0 && !k.cut) {
      k.cut = true;
      this._cageCut(n, ring, H);
    }
    if (k.planted) {
      const rate = k.cut ? c.cageGrind : c.cageSpin * (1 - 0.6 * saturate((since - cutAt * 0.7) / Math.max(0.05, cutAt * 0.3)));
      k.spin += dt * rate * g.animationSpeed;
      if (!k.cut) k.feintSpin -= dt * c.feintSpin * g.animationSpeed;
    }
    k.heat = k.cut ? Math.exp(-(since - cutAt) / Math.max(0.05, c.cageCool)) : 0.12;
    const lean = c.cageLean * Easing.outBack(cutS) * (1 + 0.08 * saturate((since - cutAt) / 1.5) * (k.cut ? 1 : 0));
    const tremble = k.cut ? 0.05 * Math.exp(-(since - cutAt) * 6) * Math.sin(since * 70) : 0;
    const sinkP = committed && fadeT >= 1 ? saturate((fadeT - c.cageSinkAt) / Math.max(0.05, (2 - c.cageSinkAt) * 0.85)) : 0;
    const glitch = k.cut ? saturate((since - cutAt) / Math.max(0.02, c.feintDissolve)) : 0.22 + 0.1 * Math.sin(this.age * 13);
    if (glitch >= 1) k.gone = true;

    // The bundle at the end of its flight (what the bars burst out of).
    _fly.copy(_focus).setY(c.cageDrop);
    const flightLen = H * c.cageFlightScale;
    for (let i = 0; i < n; i++) {
      for (let cage = 0; cage < 2; cage++) {
        const feint = cage === 1;
        if (feint && k.gone) continue;
        const theta = (feint ? k.feintSpin : k.spin) + (i * TAU) / n;
        const r = feint ? feintRing : ring;
        _tan.set(-Math.sin(theta), 0, Math.cos(theta));
        _inw.set(-Math.cos(theta), 0, -Math.sin(theta));
        const l = feint ? 0 : lean + tremble;
        _ay.copy(_up).multiplyScalar(Math.cos(l)).addScaledVector(_inw, Math.sin(l));
        _slot.copy(_focus).addScaledVector(_inw, -r);
        _slot.y = -c.cageDig - sinkP * H * 0.4;
        let len = H;
        if (open < 1) {
          // Burst open: from the sheaf to the ring, swinging upright and stabbing down.
          if (feint) _pos.copy(_fly).addScaledVector(this.side, c.cageFeintGap).addScaledVector(_up, c.cageFeintGap * 0.15);
          else _pos.copy(_fly);
          this._sheafBar(i, n, _pos, feint ? -k.roll + 0.4 : k.roll, c.cageBundle, flightLen, _foot, _ax);
          _slot.y += c.cageDrop * 0.6 * (1 - stab);
          _foot.lerp(_slot, Easing.outCubic(open));
          _by.copy(this.side).lerp(_ay, Easing.outCubic(open)).normalize();
          _ay.copy(_by);
          _ax.lerp(_tan, Easing.outCubic(open)).normalize();
          len = flightLen + (H - flightLen) * Easing.outCubic(open);
        } else {
          _foot.copy(_slot);
          _ax.copy(_tan);
        }
        const heat = feint ? 0.1 : k.heat;
        const sink = feint ? Easing.inQuad(saturate((glitch - 0.45) / 0.55)) : sinkP;
        this._setBar(feint ? this.feints : this.bars, i, _foot, _ay, _ax, len, W, i * (feint ? 2.11 : 1.37) + this._seed, heat, sink, feint ? glitch : 0);
      }
    }
    this._finishBars(n, sinkP < 0.999, !k.gone);
    this._cageShed(n, ring, H, since, cutAt, sinkP);

    // The floor under it all.
    const p = this._floorSync;
    p.centre.copy(_focus);
    p.outer = c.zoneRadius * c.floorReach;
    p.ring = ring;
    p.feintRing = feintRing;
    p.feint = k.planted && !k.gone ? 1 - glitch : 0;
    p.count = n;
    p.spin = k.spin;
    p.heat = k.planted ? (k.cut ? 0.25 + 0.75 * k.heat : 0.9) : 0;
    p.gash = k.cut ? Easing.outCubic(saturate((since - cutAt) / Math.max(0.02, c.cageCutTime * 1.6))) : 0;
    p.gashHeat = k.heat;
    p.land = 1.2 * Easing.outCubic(saturate(since / Math.max(0.05, c.groundLand)));
    p.alpha = fadeT < 1 ? 1 : 1 - saturate((fadeT - c.floorLetGo) / Math.max(0.05, 2 - c.floorLetGo));
    p.seed = this._seed;
    this.floorMaterial.userData.sync(p);
    this.floor.position.set(_focus.x, 0.03, _focus.z);
    this.floor.scale.set(p.outer * 2, p.outer * 2, 1);
    this.floor.visible = p.alpha > 0.01 && c.floorOpacity > 0.01;
  }

  /** Zero the unused bar slots and push the instance buffers. */
  _finishBars(n, showReal, showFeint) {
    for (let i = n; i < MAX_BARS; i++) {
      this.bars.setMatrixAt(i, _zero);
      this.feints.setMatrixAt(i, _zero);
    }
    if (!showFeint) for (let i = 0; i < MAX_BARS; i++) this.feints.setMatrixAt(i, _zero);
    for (const mesh of [this.bars, this.feints]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.getAttribute('aBar').needsUpdate = true;
    }
    this.barMaterial.userData.sync();
    this.feintMaterial.userData.sync();
    this.bars.visible = showReal;
    this.feints.visible = showFeint && settings[ID].feintGlow >= 0;
  }

  /** The bars stab in: dust and chips kicked out from every foot, a thud. */
  _cagePlant(n, ring) {
    const c = settings[ID];
    const g = settings.global;
    const k = this._cage;
    this._focusPoint(_focus);
    for (let i = 0; i < n; i++) {
      const theta = k.spin + (i * TAU) / n;
      _rv.set(Math.cos(theta), 0, Math.sin(theta));
      _foot.copy(_focus).addScaledVector(_rv, ring).setY(0.1);
      const dust = Math.round(c.plantDust * g.particleCount);
      if (dust > 0) {
        _dir.copy(_rv).setY(0.25);
        this._fillEmit(_foot, 0.2, _dir, c.dustSpeed * 1.4, 0.5, 0.5, c.dustLife * 1.3, 0.4);
        this.dust.emit(dust, _emit);
      }
      const chips = Math.round(c.plantChips * g.particleCount);
      if (chips > 0) {
        this._fillEmit(_foot, 0.15, _up, c.chipSpeed, 0.7, c.chipSize * 1.3, c.chipLife, 8);
        this.chips.emit(chips, _emit);
      }
    }
    this.ctx.shake.add(c.plantShake * g.cameraShake * g.explosionIntensity, 5, 20);
    this.lightBoost += c.plantLight * g.explosionIntensity;
  }

  /** The real cut: the feint breaks into motes, the blades flash, the camera takes the hit. */
  _cageCut(n, ring, H) {
    const c = settings[ID];
    const g = settings.global;
    const k = this._cage;
    this._focusPoint(_focus);
    this.ctx.shake.add(c.cutShake * g.cameraShake * g.explosionIntensity, 6, 22);
    this.lightBoost += c.cutLight * g.explosionIntensity;
    const sparks = Math.round((c.cutSparks / n) * g.particleCount);
    const motes = Math.round((c.feintMotes / n) * g.particleCount);
    for (let i = 0; i < n; i++) {
      const theta = k.spin + (i * TAU) / n;
      _rv.set(Math.cos(theta), 0, Math.sin(theta));
      _tip.copy(_focus).addScaledVector(_rv, ring - Math.sin(c.cageLean) * H * 0.9).setY(Math.cos(c.cageLean) * H * 0.92);
      if (sparks > 0) {
        _dir.copy(_rv).multiplyScalar(-1).setY(0.6);
        this._fillEmit(_tip, 0.25, _dir, c.streakSpeed * 1.3, 0.7, 0.07, c.streakLife * 1.4, 2);
        this.streaks.emit(sparks, _emit);
      }
      const ft = k.feintSpin + (i * TAU) / n;
      const fr = c.zoneRadius * c.feintFit;
      _tip.copy(_focus).set(_focus.x + Math.cos(ft) * fr, H * 0.5, _focus.z + Math.sin(ft) * fr);
      if (motes > 0) {
        this._fillEmit(_tip, H * 0.35, _up, c.moteSpeed * 1.5, 0.9, 0.09, c.moteLife * 1.2, 1);
        this.motes.emit(motes, _emit);
      }
    }
  }

  /** Sparks off the ploughing feet while the cage turns; smoke off the gashes after the cut. */
  _cageShed(n, ring, H, since, cutAt, sinkP) {
    const c = settings[ID];
    const g = settings.global;
    const k = this._cage;
    const dt = this._cageDt;
    if (!k.planted || sinkP >= 1) return;
    const sparkRate = k.cut ? c.footSparks * 0.25 * k.heat : c.footSparks;
    const sn = Math.round(this._sparkEmitter.tick(dt, sparkRate) * g.particleCount);
    for (let j = 0; j < sn; j++) {
      const i = Math.floor(Math.random() * n);
      const theta = k.spin + (i * TAU) / n;
      _foot.set(_focus.x + Math.cos(theta) * ring, 0.08, _focus.z + Math.sin(theta) * ring);
      _dir.set(Math.sin(theta), 0.45, -Math.cos(theta));
      this._fillEmit(_foot, 0.12, _dir, c.streakSpeed * 0.7, 0.35, 0.06, c.streakLife, 2);
      this.streaks.emit(1, _emit);
    }
    if (!k.cut) return;
    const mn = Math.round(this._smokeEmitter.tick(dt, c.gashSmoke * (1 - sinkP)) * g.particleCount);
    for (let j = 0; j < mn; j++) {
      const i = Math.floor(Math.random() * n);
      const theta = k.spin + (i * TAU) / n;
      const r = ring * (0.25 + 0.7 * Math.random());
      _foot.set(_focus.x + Math.cos(theta) * r, 0.1, _focus.z + Math.sin(theta) * r);
      this._fillEmit(_foot, 0.15, _up, c.dustSpeed * 0.3, 0.4, 0.5, c.dustLife * 1.8, 0.3);
      this.dust.emit(1, _emit);
    }
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
    this.body.visible = show && c.bodyOpacity > 0.01;
    this.voice.visible = show && c.voiceOpacity > 0.01;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = c.groundOpacity > 0.01 && st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
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
    sync(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteSize, 1.6 * g.glow, 0.5);
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
        _dir.copy(this.side).multiplyScalar(1.2).setY(0.3);
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.copy(this.side).multiplyScalar(-0.8).setY(0.5);
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
    _dir.multiplyScalar(-1);
    
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
   * burst, real fragments thrown up and out with dust rolled along
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
      this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
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
    this._cageDt = dt;
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
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
    this._cageDt = dt;
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
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
    this._hideCage();
  }

  dispose() {
    this.bars.geometry.dispose();
    this.feints.geometry.dispose();
    this.barGeometry.dispose();
    this.barMaterial.dispose();
    this.feintMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
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
  const folder = gui.addFolder('Feint Cage');
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

  const shape = folder.addFolder('1 · Shape — crush');
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

  const mark = folder.addFolder('13 · Mark — glamoured');
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

  const cage = folder.addFolder('14 · Cage');
  R(cage, c, 'cageCount', 3, 14, 1, 'bars per cage');
  R(cage, c, 'cageHeight', 0.5, 6, 0.05, 'bar height (m)');
  R(cage, c, 'cageWidth', 0.05, 1, 0.01, 'bar width (m)');
  R(cage, c, 'cageFit', 0.2, 1.4, 0.01, 'real ring (x circle)');
  R(cage, c, 'feintFit', 0.2, 1.6, 0.01, 'feint ring (x circle)');
  R(cage, c, 'cageDrop', 0, 8, 0.05, 'arrives at (m)');
  R(cage, c, 'cageArc', 0, 8, 0.05, 'throw arc (m)');
  R(cage, c, 'cageRoll', -30, 30, 0.1, 'tumble (rad/s)');
  R(cage, c, 'cageBundle', 0, 2, 0.01, 'sheaf radius (m)');
  R(cage, c, 'cageFlightScale', 0.1, 1.5, 0.01, 'length in flight');
  R(cage, c, 'cageFeintGap', 0, 6, 0.05, 'feint sheaf gap (m)');
  R(cage, c, 'cageOpen', 0.02, 1.5, 0.01, 'stab in (s)');
  R(cage, c, 'cageDig', 0, 1, 0.01, 'foot depth (m)');
  R(cage, c, 'cageSpin', -8, 8, 0.05, 'real spin (rad/s)');
  R(cage, c, 'feintSpin', -8, 8, 0.05, 'feint spin (rad/s)');
  R(cage, c, 'cageCutAt', 0.05, 1, 0.01, 'cut at (impact)');
  R(cage, c, 'cageCutTime', 0.02, 1, 0.01, 'clench (s)');
  R(cage, c, 'cageLean', 0, 1.4, 0.01, 'lean (rad)');
  R(cage, c, 'cageGrind', -4, 4, 0.05, 'grind (rad/s)');
  R(cage, c, 'cageCool', 0.05, 4, 0.05, 'blade cools (s)');
  R(cage, c, 'cageSinkAt', 1, 1.95, 0.01, 'sinks at (fade)');
  R(cage, c, 'feintDissolve', 0.02, 2, 0.01, 'feint breaks (s)');
  R(cage, c, 'cageSeamGlow', 0, 6, 0.05, 'seam glow');
  R(cage, c, 'cageEdgeGlow', 0, 6, 0.05, 'blade glow');
  R(cage, c, 'cageRimGlow', 0, 4, 0.05, 'rim glow');
  R(cage, c, 'cageSpecular', 0, 3, 0.05, 'specular');
  R(cage, c, 'feintGlow', 0, 6, 0.05, 'feint glow');
  R(cage, c, 'feintOpacity', 0, 1, 0.01, 'feint opacity');
  R(cage, c, 'cageLit', 0, 2, 0.01, 'lacquer sun gain');
  cage.addColor(c, 'colorCageDeep').name('lacquer, deep');
  cage.addColor(c, 'colorCageBody').name('lacquer');
  cage.addColor(c, 'colorCageSeam').name('seam');
  cage.addColor(c, 'colorCageHot').name('blade, hot');
  cage.addColor(c, 'colorFeintBody').name('feint lacquer');
  cage.addColor(c, 'colorFeintSeam').name('feint seam');
  R(cage, c, 'plantDust', 0, 30, 1, 'plant dust / bar');
  R(cage, c, 'plantChips', 0, 30, 1, 'plant chips / bar');
  R(cage, c, 'plantShake', 0, 2, 0.01, 'plant punch');
  R(cage, c, 'plantLight', 0, 40, 0.5, 'plant light');
  R(cage, c, 'cutShake', 0, 2, 0.01, 'cut punch');
  R(cage, c, 'cutLight', 0, 40, 0.5, 'cut light');
  R(cage, c, 'cutSparks', 0, 400, 1, 'cut sparks');
  R(cage, c, 'feintMotes', 0, 400, 1, 'feint motes');
  R(cage, c, 'footSparks', 0, 400, 1, 'foot sparks / s');
  R(cage, c, 'gashSmoke', 0, 120, 1, 'gash smoke / s');

  const cageFloor = folder.addFolder('15 · Cage floor');
  R(cageFloor, c, 'floorOpacity', 0, 1.5, 0.01, 'opacity');
  R(cageFloor, c, 'floorGlow', 0, 6, 0.05, 'glow');
  R(cageFloor, c, 'floorGroove', 0.05, 2, 0.01, 'groove (m)');
  R(cageFloor, c, 'floorReach', 0.3, 2, 0.01, 'reach (x circle)');
  R(cageFloor, c, 'floorLetGo', 1, 1.95, 0.01, 'lets go at (fade)');
  cageFloor.addColor(c, 'colorFloorDeep').name('stain, deep');
  cageFloor.addColor(c, 'colorFloorBody').name('stain');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
