import { Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { LineTrail } from './LineTrail.js';
import { createGlamourSweepPieceGeometry, createGlamourSweepHeroGeometry } from '../../assets/codex/GlamourSweepGeometry.js';
import { createGlamourBladeGeometry } from '../../assets/codex/GlamourSweepSignatureGeometry.js';
import {
  createGlamourSweepBodyMaterial,
  createGlamourSweepLensMaterial,
  createGlamourSweepGroundMaterial,
  createGlamourSweepVoiceMaterial,
  createGlamourSweepDetailMaterial,
  createGlamourSweepTrailMaterial,
  createGlamourSweepScarMaterial,
  createGlamourSweepBladeMaterial,
  createGlamourSweepCutMaterial
} from '../../materials/codex/GlamourSweepMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'glamour';

const TWIST = 'late';
const ARCH = 'whip';
const HIT = 'side';
const CARRY = 'none';
const WHEN = 'late';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = false;
const ZONE = false;
const LIFT = 1;
const SLICE = true;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _focus = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);
const _heel = new Vector3();
const _back = new Vector3();
const _basis = new Matrix4();
const _qBase = new Quaternion();
const _qYaw = new Quaternion();
const _qRoll = new Quaternion();
const _axisY = new Vector3(0, 1, 0);
const _axisZ = new Vector3(0, 0, 1);

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;

/**
 * GLAMOUR SWEEP — illusion, line cast.
 *
 * Illusion — a glamour sheet shows the cut early and lands it late.
 *
 * Travel shows the cut early. The edge itself arrives late, after the sheet has already been seen.
 *
 * The read is `late`: hit timing `late`, blow `side`.
 *
 * ## Layers
 *
 *   1. **body** — the late placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled illusion field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createGlamourSweepPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createGlamourSweepHeroGeometry`), stood by its archetype (whip): riding the head, swept sideways as it travels.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: travel shows the cut early. The edge itself arrives late, after the sheet has already been seen.
 *  10. **mark** — a felled body is glamoured: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The signature — the glamour blade (layers 15–18, this cast's own)
 *
 * The template sheet, voice, rig and pieces are turned down; the read is one
 * tall crescent blade of black-plum lacquered steel, its face to the caster,
 * only its cutting edge and engraved filigree burning pink:
 *
 *  15. **blade** — `createGlamourBladeGeometry` (a crescent with a thick spine,
 *      scalloped back and a sharp convex edge), sun-lit and shadow-casting on
 *      LAYER.WORLD. It leaves the hand small and grows to `bladeHeight` as it
 *      flies, drawing back sideways (`bladeShear`) — the sheet that shears as
 *      it travels — then over the last stretch of the travel (`bladeCutFrom`)
 *      it swings across the line, edge first, turning through `bladeCutYaw`,
 *      carries past (`bladeOvershoot`) and bites its heel into the floor
 *      (`bladeEmbed`), leaning over. It rocks there through the linger, and
 *      from `bladePeelAt` its glamour peels from the tip down behind a burning
 *      pink front that sheds motes — the exit.
 *  16. **false copy** — the same blade, holed and edge-lit, that runs
 *      `ghostLead` ahead of it: it reaches the targets first and makes the
 *      swing early (it hits nothing), and burns away when the real blade
 *      cuts through it. The glamour shows the cut early; the steel lands it late.
 *  17. **afterimage** — a second holed copy trailing `ghostLag` behind, gone on
 *      the beat.
 *  18. **cut** — the floor: a long dark slash across the line, pre-drawn
 *      faintly by the false copy, opened hot by the real swing, its seam
 *      cooling through the linger. It stays to the end.
 *
 * Every size is resolved from settings each frame (the swing reach from
 * `sweep`); a cast keeps only its seed and a burn timer. Presentation only:
 * hits are the template's `late` strike.
 *
 * Every metre, rate and colour is read from `settings.glamour` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class GlamourSweepAbility extends Ability {
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
    this.bodyMaterial = createGlamourSweepBodyMaterial();
    this.lensMaterial = createGlamourSweepLensMaterial();
    this.groundMaterial = createGlamourSweepGroundMaterial();
    this.voiceMaterial = createGlamourSweepVoiceMaterial();
    this.detailMaterial = createGlamourSweepDetailMaterial();
    this.heroMaterial = createGlamourSweepDetailMaterial(true);
    this.detail = new DetailLayer(createGlamourSweepPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createGlamourSweepHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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
    this.trailMaterial = createGlamourSweepTrailMaterial();
    this.scarMaterial = createGlamourSweepScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);
    this._buildBlade();
  }

  /** The blade, its two false copies, and the cut on the floor. */
  _buildBlade() {
    this.bladeGeometry = createGlamourBladeGeometry();
    this.bladeMaterial = createGlamourSweepBladeMaterial(0);
    this.ghostMaterials = [createGlamourSweepBladeMaterial(1), createGlamourSweepBladeMaterial(1)];
    this.blade = this._mesh(this.bladeGeometry, this.bladeMaterial, LAYER.WORLD, 4);
    this.blade.castShadow = true;
    this.blade.receiveShadow = true;
    this.ghosts = this.ghostMaterials.map((m) => this._mesh(this.bladeGeometry, m, LAYER.WORLD, 5));
    this.cutGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.cutMaterial = createGlamourSweepCutMaterial();
    this.cut = this._mesh(this.cutGeometry, this.cutMaterial, LAYER.VFX, 2);
    this._burn = 0;
    this._peelEmitter = new RateEmitter();
    this._ploughEmitter = new RateEmitter();
  }

  _resetBlade() {
    this._burn = 0;
    this._peelEmitter.reset();
    this._ploughEmitter.reset();
    this.blade.visible = false;
    this.cut.visible = false;
    for (const g of this.ghosts) g.visible = false;
  }

  /** Seconds since the beat, from the 0..2 impact + fade clock. */
  _since(fadeT) {
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** How far across its swing a blade is (0..1) at travel share `u`. */
  _swing(u) {
    const from = Math.min(0.97, Math.max(0.05, settings[ID].bladeCutFrom));
    return Easing.inOutQuad(saturate((u - from) / (1 - from)));
  }

  /** The blade's sideways offset at travel share `u`: drawn back, then swung across. */
  _lateral(u, reach) {
    const c = settings[ID];
    const from = Math.min(0.97, Math.max(0.05, c.bladeCutFrom));
    const back = -reach * c.bladeShear;
    if (u < from) return back * Easing.outQuad(saturate(u / from));
    return back + (reach - back) * this._swing(u);
  }

  /**
   * Stand one blade: heel at `along` metres down the line and `lateral` to the
   * side, `lift` above the floor, `size` × full, turned `yaw` and rolled `roll`.
   */
  _place(mesh, along, lateral, lift, size, yaw, roll) {
    const c = settings[ID];
    const H = Math.max(0.2, c.bladeHeight * size);
    _heel.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, lateral);
    _heel.y = lift;
    _back.copy(this.direction).negate();
    _basis.makeBasis(this.side, _up, _back);
    _qBase.setFromRotationMatrix(_basis);
    _qYaw.setFromAxisAngle(_axisY, yaw);
    _qRoll.setFromAxisAngle(_axisZ, roll);
    mesh.quaternion.copy(_qBase).multiply(_qYaw).multiply(_qRoll);
    mesh.scale.set(H * c.bladeWidth, H, H * c.bladeThick);
    // The heel is the authored (0, −0.5, 0): pivot there.
    _pos.set(0, 0.5 * H, 0).applyQuaternion(mesh.quaternion);
    mesh.position.copy(_heel).add(_pos);
  }

  /**
   * Fly, draw back, swing across, bite, rock, peel. `committed` false is the
   * travel; `fadeT` the 0..2 clock after the beat. Every size is resolved from
   * settings each frame, so the sweep slider re-fits the swing mid-cast.
   */
  _updateBlade(dt, committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const u = committed ? 1 : this.u;
    const L = this.length;
    const reach = Math.max(0.3, c.sweep * c.bladeCutReach);
    const since = committed ? this._since(fadeT) : 0;
    const clock = this.age * g.animationSpeed;
    const show = c.bladeOpacity > 0.01;

    // The real blade.
    const size = c.bladeStart + (1 - c.bladeStart) * Easing.outCubic(saturate(u * 1.4));
    let lateral = this._lateral(u, reach);
    let lift = c.bladeHover;
    let roll;
    let yaw = c.bladeCutYaw * (this._swing(u) - 0.5);
    let peel = 0;
    let heat = 0.75 + 0.25 * this._swing(u);
    if (!committed) {
      const v = this._lateral(Math.min(1, u + 0.02), reach) - lateral;
      roll = -c.bladeLean * Math.sign(v) * Math.min(1, Math.abs(v) * 8);
      if (u >= c.bladeCutFrom) this._burn += dt;
    } else {
      this._burn += dt;
      const bite = Easing.outCubic(saturate(since / 0.14));
      const plough = Easing.outQuad(saturate(since / Math.max(0.05, c.bladeDragTime)));
      lateral = reach * (1 + c.bladeOvershoot * bite) + c.bladeDrag * plough;
      if (plough < 0.98 && bite > 0.9) this._ploughSparks(dt, 1 - plough);
      lift = c.bladeHover - (c.bladeHover + c.bladeEmbed) * bite;
      const decay = Math.exp(-since * 0.9);
      roll = -c.bladeEmbedTilt * bite - c.bladeSway * Math.sin(since * c.bladeSwayRate) * decay;
      yaw = c.bladeCutYaw * 0.5 * (1 - bite) + 0.08 * Math.sin(since * c.bladeSwayRate * 0.7) * decay;
      const p0 = c.bladePeelAt;
      const p1 = Math.max(p0 + 0.05, c.bladePeelEnd);
      peel = saturate((fadeT - p0) / (p1 - p0));
      heat = 1 - 0.55 * saturate(fadeT / 1.4);
    }
    const landed = committed ? 1 + (c.bladeLandScale - 1) * Easing.outCubic(saturate(since / 0.14)) : 1;
    this._place(this.blade, u * L, lateral, lift, size * landed, yaw, roll);
    this.blade.visible = show && peel < 0.999;
    this.blade.castShadow = c.bladeShadow > 0.5 && peel < 0.05;
    this.bladeMaterial.userData.sync(heat, 0, peel, this._seed, clock);
    if (peel > 0.001 && peel < 0.999) this._peelMotes(dt, peel);

    // The false copy: ahead of the blade, swinging early, burnt away by the real cut.
    const ghosts = Math.round(c.ghostCount);
    const lead = this.ghosts[0];
    const uLead = Math.min(1, u + c.ghostLead);
    const burn = saturate(this._burn / Math.max(0.02, c.ghostBreak));
    const holesLead = c.ghostHoles + (1 - c.ghostHoles) * burn;
    lead.visible = show && ghosts >= 1 && holesLead < 0.98;
    if (lead.visible) {
      const sizeLead = c.bladeStart + (1 - c.bladeStart) * Easing.outCubic(saturate(uLead * 1.4));
      this._place(lead, uLead * L + c.ghostOffset, this._lateral(uLead, reach), c.bladeHover, sizeLead * c.ghostScale, c.bladeCutYaw * (this._swing(uLead) - 0.5), 0);
      this.ghostMaterials[0].userData.sync(1, holesLead, 0, this._seed + 1.7, clock);
    }
    // The afterimage: trailing the blade, gone on the beat.
    const trail = this.ghosts[1];
    const uLag = Math.max(0, u - c.ghostLag);
    const holesLag = Math.min(1, c.ghostHoles + 0.15 + (committed ? saturate(since / 0.15) : 0));
    trail.visible = show && ghosts >= 2 && holesLag < 0.98 && uLag > 0.02;
    if (trail.visible) {
      const sizeLag = c.bladeStart + (1 - c.bladeStart) * Easing.outCubic(saturate(uLag * 1.4));
      this._place(trail, uLag * L, this._lateral(uLag, reach), c.bladeHover, sizeLag * c.ghostScale, c.bladeCutYaw * (this._swing(uLag) - 0.5), 0);
      this.ghostMaterials[1].userData.sync(0.8, holesLag, 0, this._seed + 3.1, clock);
    }

    // The cut on the floor, across the end of the line.
    const pre = ghosts >= 1 ? this._swing(uLead) : 0;
    const open = committed ? 1 : this._swing(u);
    const gone = committed ? 1 - Easing.inQuad(saturate((fadeT - 1.7) / 0.3)) : 1;
    this.cut.visible = c.cutOpacity > 0.01 && (pre > 0.01 || open > 0.01) && gone > 0.01;
    if (this.cut.visible) {
      this.pointAt(1, _pos);
      _back.copy(this.direction).negate();
      _basis.makeBasis(this.side, _up, _back);
      this.cut.quaternion.setFromRotationMatrix(_basis);
      this.cut.position.copy(_pos).addScaledVector(this.side, 0.5 * (reach * c.bladeOvershoot + c.bladeDrag)).setY(0.035);
      this.cut.scale.set(2 * reach * c.cutLength + c.bladeDrag, 1, Math.max(0.1, c.cutWidth));
      const cool = committed ? 1 - 0.7 * saturate(fadeT / 1.6) : 1;
      this.cutMaterial.userData.sync(open, pre, cool, gone, this._seed);
    }
  }

  /** Motes off the burning front as the glamour peels down the blade. */
  _peelMotes(dt, peel) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this._peelEmitter.tick(dt, c.peelMotes) * g.particleCount);
    if (n <= 0) return;
    const H = c.bladeHeight;
    const front = saturate(1 - peel * 0.82 / 0.8);
    _pos.set(0, front - 0.5, 0).applyMatrix4(this.blade.matrixWorld);
    // matrixWorld lags a frame; good enough for motes, and it keeps this allocation-free.
    _dir.set(0, 1, 0);
    this._fillEmit(_pos, Math.max(0.2, H * 0.12), _dir, c.moteSpeed * 1.4, 0.8, 0.1, c.moteLife, 1);
    this.motes.emit(n, _emit);
  }

  /** Sparks and chips thrown off the heel as the blade ploughs on through the floor. */
  _ploughSparks(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this._ploughEmitter.tick(dt, c.bladeSparks * strength) * g.particleCount);
    if (n <= 0) return;
    _pos.set(0, -0.5, 0).applyMatrix4(this.blade.matrixWorld).setY(0.08);
    _dir.copy(this.side).multiplyScalar(-0.6).setY(0.9);
    this._fillEmit(_pos, 0.25, _dir, c.streakSpeed * 0.8, 0.5, 0.06, c.streakLife, 2);
    this.streaks.emit(n, _emit);
    if (Math.random() < 0.35) {
      this._fillEmit(_pos, 0.25, _dir, c.chipSpeed * 0.7, 0.6, c.chipSize, c.chipLife, 6);
      this.chips.emit(1, _emit);
    }
  }

  /** The cut's sparks: thrown along the swing as the edge goes through. */
  _cutSparks() {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(c.impactChips * 2.2 * g.particleCount);
    if (n <= 0) return;
    this.pointAt(1, _pos).setY(1.1);
    _dir.copy(this.side).setY(0.25);
    this._fillEmit(_pos, Math.max(0.3, c.sweep), _dir, c.streakSpeed * 1.6, 0.35, 0.09, c.streakLife * 1.4, 2);
    this.streaks.emit(n, _emit);
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
    this.dust = particles.get('glamour.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('glamour.streak', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('glamour.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('glamour.mote', {
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
    return 1 - f + f * Math.sin(this.age * 6.00);
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
    this._resetBlade();
    this.trail.reset();
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
    const u = this.u;
    const rise = committed ? 1 : Easing.outCubic(saturate(u));
    
    let grow;
    let open;
    let along;
    along = committed ? 1 : saturate((u - 0.32) / 0.68); grow = rise; open = 1;
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
      st.land = 1;
      st.pre = 0;
      st.heat = 0.85;
      st.erode = 0;
      return;
    }
    st.land = 1;
    st.pre = 0;
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
    this.trailMaterial.userData.sync(st, this.trail, this._travelTime());
    this.scarMaterial.userData.sync(st, this.trail, this._travelTime());
    this.trail.show(this.isActive);
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
    const lateral = (dummy.position.x - _focus.x) * this.side.x + (dummy.position.z - _focus.z) * this.side.z;
    _dir.copy(this.side).multiplyScalar(lateral < 0 ? -1 : 1);
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
   * the floor, and a filled residue decal sized to the strip that stays on the
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
      radius: Math.max(0.5, c.groundWidth * c.groundStainReach) * power,
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

  /** Seconds the head takes over the whole line — the trail's clock. */
  _travelTime() {
    return Math.max(0.05, this.length / Math.max(1, settings[ID].speed * settings.global.speed));
  }

  /** Where the head crosses each `wakeSpacing` metre: a scorch decal and a few chips. */
  _wake(point, lane, s) {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(point).setY(0);
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.wakeRadius * (0.8 + 0.4 * Math.random()),
      life: c.wakeLife * g.lifetime,
      width: 0.08,
      intensity: 0.75,
      colorA: getColor(c.colorScarB),
      colorB: getColor(c.colorScarA),
      height: 0.03
    });
    const chips = Math.round(c.wakeChips * g.particleCount);
    if (chips > 0) {
      this._fillEmit(_pos.setY(0.1), 0.25, _up, c.chipSpeed * 0.6, 0.8, c.chipSize, c.chipLife, 3);
      this.chips.emit(chips, _emit);
    }
  }

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
    this._updateBlade(dt, false, 0);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this.trail.tick(dt, this._state.along, this._state, c.wakeSpacing);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    this._cutSparks();
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
    this._updateBlade(dt, true, t);
    this._palette();
    this._shed(dt, fade * 0.7);
    this.trail.tick(dt, 1, this._state, c.wakeSpacing);
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
    this.trail.hide();
    this.blade.visible = false;
    this.cut.visible = false;
    for (const g of this.ghosts) g.visible = false;
  }

  dispose() {
    this.bladeGeometry.dispose();
    this.bladeMaterial.dispose();
    for (const m of this.ghostMaterials) m.dispose();
    this.cutGeometry.dispose();
    this.cutMaterial.dispose();
    this.trail.dispose();
    this.trailMaterial.dispose();
    this.scarMaterial.dispose();
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
  const folder = gui.addFolder('Glamour Sweep');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'travel (m/s)');
  R(cast, c, 'cooldown', 0, 8, 0.05, 'cooldown');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'impact (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.01, 'fade (s)');
  
  Editor.castAnimation(cast, c);

  const hand = folder.addFolder('0 · Hand');
  R(hand, c, 'handForward', -0.5, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'side (m)');
  R(hand, c, 'handHeight', 0.2, 2.5, 0.01, 'height (m)');
  R(hand, c, 'handFlare', 0, 3, 0.01, 'flare (m)');
  R(hand, c, 'handSparks', 0, 120, 1, 'sparks');
  R(hand, c, 'handMotes', 0, 80, 1, 'motes');

  const shape = folder.addFolder('1 · Shape — late');
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
  R(hero, c, 'heroMinSpan', 0, 6, 0.05, 'min span (m)');
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

  const trail = folder.addFolder('14 · Trail');
  R(trail, c, 'trailWidth', 0, 3, 0.01, 'ribbon width (m)');
  R(trail, c, 'trailLife', 0.05, 6, 0.05, 'ribbon life (s)');
  R(trail, c, 'trailOpacity', 0, 2, 0.01, 'ribbon opacity');
  R(trail, c, 'trailGlow', 0, 4, 0.01, 'ribbon glow');
  R(trail, c, 'trailCore', 0, 1, 0.01, 'white core');
  R(trail, c, 'trailBreakup', 0, 3, 0.01, 'break-up');
  R(trail, c, 'scarWidth', 0, 4, 0.01, 'scar width (m)');
  R(trail, c, 'scarLife', 0.05, 8, 0.05, 'scar life (s)');
  R(trail, c, 'scarOpacity', 0, 1, 0.01, 'scar opacity');
  R(trail, c, 'scarGlow', 0, 6, 0.05, 'seam glow');
  trail.addColor(c, 'colorScarA').name('seam');
  trail.addColor(c, 'colorScarB').name('bed');
  R(trail, c, 'wakeSpacing', 0, 6, 0.05, 'wake every (m)');
  R(trail, c, 'wakeRadius', 0, 4, 0.01, 'wake decal (m)');
  R(trail, c, 'wakeLife', 0.05, 6, 0.05, 'wake life (s)');
  R(trail, c, 'wakeChips', 0, 40, 1, 'wake chips');

  const blade = folder.addFolder('15 · Glamour blade');
  R(blade, c, 'bladeHeight', 0.5, 8, 0.05, 'height (m)');
  R(blade, c, 'bladeWidth', 0.3, 3, 0.01, 'breadth ×');
  R(blade, c, 'bladeThick', 0.2, 4, 0.01, 'spine ×');
  R(blade, c, 'bladeStart', 0.05, 1, 0.01, 'size at the hand');
  R(blade, c, 'bladeHover', 0, 2, 0.01, 'hover (m)');
  R(blade, c, 'bladeShear', 0, 2, 0.01, 'draw back ×');
  R(blade, c, 'bladeLean', 0, 1.2, 0.01, 'lean (rad)');
  R(blade, c, 'bladeCutReach', 0.2, 4, 0.01, 'swing reach × sweep');
  R(blade, c, 'bladeCutFrom', 0.05, 0.97, 0.01, 'swing starts at');
  R(blade, c, 'bladeCutYaw', 0, 2, 0.01, 'swing turn (rad)');
  R(blade, c, 'bladeOvershoot', 0, 1, 0.01, 'carry past ×');
  R(blade, c, 'bladeDrag', 0, 5, 0.05, 'ploughs on (m)');
  R(blade, c, 'bladeDragTime', 0.05, 4, 0.05, 'plough time (s)');
  R(blade, c, 'bladeSparks', 0, 400, 1, 'plough sparks / s');
  R(blade, c, 'bladeEmbed', 0, 2, 0.01, 'bites in (m)');
  R(blade, c, 'bladeEmbedTilt', 0, 1.2, 0.01, 'leans over (rad)');
  R(blade, c, 'bladeSway', 0, 0.5, 0.005, 'rock (rad)');
  R(blade, c, 'bladeSwayRate', 0, 20, 0.1, 'rock rate');
  R(blade, c, 'bladePeelAt', 0, 2, 0.01, 'peels from');
  R(blade, c, 'bladePeelEnd', 0.1, 2, 0.01, 'gone by');
  R(blade, c, 'bladeEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(blade, c, 'bladeSeamGlow', 0, 6, 0.05, 'filigree glow');
  R(blade, c, 'bladeRimGlow', 0, 4, 0.05, 'limb glow');
  blade.addColor(c, 'colorBladeRim').name('limb, cold steel');
  R(blade, c, 'bladeLandScale', 0.5, 2, 0.01, 'size once it bites ×');
  R(blade, c, 'bladeRough', 0, 1, 0.01, 'roughness');
  R(blade, c, 'bladeMetal', 0, 1, 0.01, 'metalness');
  R(blade, c, 'bladeOpacity', 0, 1, 1, 'show');
  R(blade, c, 'bladeShadow', 0, 1, 1, 'cast shadow');
  blade.addColor(c, 'colorBladeDeep').name('lacquer, deep');
  blade.addColor(c, 'colorBladeBody').name('lacquer, lit');
  blade.addColor(c, 'colorBladeHot').name('glamour');
  blade.addColor(c, 'colorBladeCore').name('edge, white');
  R(blade, c, 'peelMotes', 0, 600, 1, 'peel motes / s');

  const ghost = folder.addFolder('16 · False copies');
  R(ghost, c, 'ghostCount', 0, 2, 1, 'count');
  R(ghost, c, 'ghostLead', 0, 1, 0.01, 'runs ahead');
  R(ghost, c, 'ghostLag', 0, 1, 0.01, 'trails behind');
  R(ghost, c, 'ghostHoles', 0, 1, 0.01, 'eaten through');
  R(ghost, c, 'ghostGlow', 0, 4, 0.01, 'edge glow ×');
  R(ghost, c, 'ghostScale', 0.2, 1.5, 0.01, 'size ×');
  R(ghost, c, 'ghostBreak', 0.02, 1, 0.01, 'burns away (s)');
  R(ghost, c, 'ghostOffset', -2, 3, 0.01, 'stands off (m)');

  const cut = folder.addFolder('17 · The cut');
  R(cut, c, 'cutWidth', 0.1, 4, 0.01, 'width (m)');
  R(cut, c, 'cutLength', 0.2, 3, 0.01, 'length × swing');
  R(cut, c, 'cutOpacity', 0, 1.5, 0.01, 'opacity');
  R(cut, c, 'cutGlow', 0, 6, 0.05, 'seam glow');
  R(cut, c, 'cutShear', 0, 2, 0.01, 'shear marks');
  R(cut, c, 'cutPre', 0, 2, 0.01, 'pre-drawn');
  cut.addColor(c, 'colorCutDeep').name('bed');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
