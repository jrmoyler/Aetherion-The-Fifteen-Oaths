import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { LineTrail } from './LineTrail.js';
import { createGlissandoSweepPieceGeometry, createGlissandoSweepHeroGeometry } from '../../assets/codex/GlissandoSweepGeometry.js';
import { createGlissandoSweepPipeGeometry, createGlissandoSweepChestGeometry } from '../../assets/codex/GlissandoSweepSignatureGeometry.js';
import {
  createGlissandoSweepBodyMaterial,
  createGlissandoSweepLensMaterial,
  createGlissandoSweepGroundMaterial,
  createGlissandoSweepVoiceMaterial,
  createGlissandoSweepDetailMaterial,
  createGlissandoSweepTrailMaterial,
  createGlissandoSweepScarMaterial,
  createGlissandoSweepSheetMaterial,
  createGlissandoSweepPipeMaterial,
  createGlissandoSweepPressureMaterial,
  createGlissandoSweepPressureLensMaterial
} from '../../materials/codex/GlissandoSweepMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'glissando';

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

/** The sheet plus its echoes. */
const MAX_SHEETS = 4;
const _sheetPose = { dir: new Vector3(), side: new Vector3(), height: 1, amp: 0, f0: 1, f1: 1 };

/** The pipe rank and the pressure ripples it throws. */
const MAX_PIPES = 16;
const MAX_PRESS = 48;
const _m4 = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _scale = new Vector3();
const _bx = new Vector3();
const _bz = new Vector3();
const _tmp = new Vector3();

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;

/**
 * GLISSANDO SWEEP — sound, line cast.
 *
 * Sound — a glissando sheet slides sideways and arrives late.
 *
 * The sheet lags the cast point. The cut arrives after the hand has already moved on.
 *
 * The read is `late`: hit timing `late`, blow `side`.
 *
 * ## Layers
 *
 *   1. **body** — the late placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled sound field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createGlissandoSweepPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createGlissandoSweepHeroGeometry`), stood by its archetype (whip): riding the head, swept sideways as it travels.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the sheet lags the cast point. The cut arrives after the hand has already moved on.
 *  10. **the glissando** (cast-local hero, editor folder 15) — the template
 *      body, voice, rig and pieces are turned down in the config. One tall
 *      bowed wall of sound (`sheet*`), standing on the floor across the
 *      line, its top edge the waveform itself: a chirp of ridges runs
 *      through it, crowding together from one side to the other, and the
 *      pitch climbs (`chirpStart` → `chirpEnd`) as it goes. It rises out of
 *      the floor `sheetStart` metres ahead of the caster and lags the head,
 *      sliding in from one side (`sheetSlide`) and sheared over, so it lands
 *      late; after the beat it keeps gliding (`lateGlide`, `lateSlide`) and
 *      ringing, its ridges decaying, two dimmer echoes behind it, then it
 *      tears into strips and sinks. Dust is scoured off its foot all the way.
 *      The lime wall itself is now off by default (`sheetOpacity` 0): it
 *      read as a neon fence. Its motion still drives the instrument below.
 *  12. **the pipe rank** (cast-local hero, editor folder 16) — the sound has a
 *      solid source: a rank of lathed bronze organ pipes on a moulded wind
 *      chest (`GlissandoSweepSignatureGeometry.js`, lit, shadow-casting, on
 *      LAYER.SHAPED), standing where the sheet would be and carrying its
 *      rise, late slide, glide and shear (as a lean). Pipes run long-and-low
 *      to short-and-high across the line. A run of speech climbs the rank
 *      over and over, faster as the pitch climbs (`speakRate` × `chirpClimb`):
 *      that run is the glissando. A speaking pipe shivers in a standing wave
 *      (shorter pipes faster) and its mouth lights lime; on the beat every
 *      pipe speaks at once and the bronze flares. It sinks into the floor
 *      on the tear (`rankSink`).
 *  13. **pressure ripples** (editor folder 17) — each pipe the run passes
 *      throws a curved, heat-hazed band of air that rolls out toward the
 *      caster: a dark translucent body with a short-lived thin lime crest,
 *      also written into the distortion buffer (`pressWarp`). Records hold
 *      only a birth time and a pipe index; the pool is fixed (`MAX_PRESS`).
 *  11. **mark** — a felled body is left ringing: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * Every metre, rate and colour is read from `settings.glissando` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class GlissandoSweepAbility extends Ability {
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
    this.bodyMaterial = createGlissandoSweepBodyMaterial();
    this.lensMaterial = createGlissandoSweepLensMaterial();
    this.groundMaterial = createGlissandoSweepGroundMaterial();
    this.voiceMaterial = createGlissandoSweepVoiceMaterial();
    this.detailMaterial = createGlissandoSweepDetailMaterial();
    this.heroMaterial = createGlissandoSweepDetailMaterial(true);
    this.detail = new DetailLayer(createGlissandoSweepPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createGlissandoSweepHeroGeometry(), this.heroMaterial, ARCH, ZONE);
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
    this.trailMaterial = createGlissandoSweepTrailMaterial();
    this.scarMaterial = createGlissandoSweepScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);
    this._buildSheet();
  }

  _buildSheet() {
    this.sheetGeometry = new PlaneGeometry(1, 1, 120, 20);
    for (const name of ['aCentre', 'aSheet']) {
      const attr = new InstancedBufferAttribute(new Float32Array(MAX_SHEETS * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      this.sheetGeometry.setAttribute(name, attr);
    }
    this.sheetMaterial = createGlissandoSweepSheetMaterial();
    this.sheet = new InstancedMesh(this.sheetGeometry, this.sheetMaterial, MAX_SHEETS);
    this.sheet.layers.set(LAYER.VFX);
    this.sheet.frustumCulled = false;
    this.sheet.renderOrder = 15;
    this.sheet.visible = false;
    this.group.add(this.sheet);
    this._sheetSide = 1;
    this._sheetAt = new Vector3();
    this._footEmitter = new RateEmitter();
    this._grooveAt = 0;
    this._buildRank();
  }

  /** The instrument: a rank of bronze organ pipes on a wind chest, and the ripple pool. */
  _buildRank() {
    this.pipeMaterial = createGlissandoSweepPipeMaterial();
    const solid = (geometry, count) => {
      const attr = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aPipe', attr);
      const mesh = new InstancedMesh(geometry, this.pipeMaterial, count);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.layers.set(LAYER.SHAPED);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    this.pipeGeometry = createGlissandoSweepPipeGeometry();
    this.chestGeometry = createGlissandoSweepChestGeometry();
    this.pipes = solid(this.pipeGeometry, MAX_PIPES);
    this.chest = solid(this.chestGeometry, 1);
    this.pressGeometry = new PlaneGeometry(1, 1, 36, 10);
    for (const name of ['aRip', 'aRip2']) {
      const attr = new InstancedBufferAttribute(new Float32Array(MAX_PRESS * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      this.pressGeometry.setAttribute(name, attr);
    }
    this.pressMaterial = createGlissandoSweepPressureMaterial();
    this.pressLensMaterial = createGlissandoSweepPressureLensMaterial();
    this.press = new InstancedMesh(this.pressGeometry, this.pressMaterial, MAX_PRESS);
    this.press.layers.set(LAYER.VFX);
    this.press.renderOrder = 16;
    this.pressLens = new InstancedMesh(this.pressGeometry, this.pressLensMaterial, MAX_PRESS);
    this.pressLens.layers.set(LAYER.DISTORTION);
    for (const m of [this.press, this.pressLens]) {
      m.frustumCulled = false;
      m.visible = false;
      this.group.add(m);
    }
    this._rk = { appear: 0, tear: 0, pitch: 0, ring: 1, shear: 0, since: -1 };
    this._rankVisible = false;
    this._rankClock = 0;
    this._play = 0;
    this._playIdx = -99;
    this._chorded = false;
    this._pipeX = new Float32Array(MAX_PIPES);
    this._pipeY = new Float32Array(MAX_PIPES);
    this._pipeZ = new Float32Array(MAX_PIPES);
    this._pipeH = new Float32Array(MAX_PIPES);
    this._pipeR = new Float32Array(MAX_PIPES);
    this._pipeN = 0;
    this._pressBorn = new Float32Array(MAX_PRESS).fill(-1);
    this._pressPipe = new Uint8Array(MAX_PRESS);
    this._pressNext = 0;
  }

  _hideRank() {
    this._rankVisible = false;
    this.pipes.visible = false;
    this.chest.visible = false;
    this.press.visible = false;
    this.pressLens.visible = false;
  }

  /** A speaking pipe throws a pressure ripple (records keep only its birth time and pipe). */
  _throw(i) {
    const cap = Math.max(1, Math.min(MAX_PRESS, Math.round(settings[ID].pressMax)));
    const j = this._pressNext % cap;
    this._pressBorn[j] = this.age;
    this._pressPipe[j] = i;
    this._pressNext = (j + 1) % cap;
  }

  /**
   * Stand the rank where the sweep is: the chest across the line, the pipes on
   * it running long-and-low to short-and-high, leaning with the shear. It
   * rises out of the floor on the sweep's `appear`, sinks back on its tear.
   * A run of speech climbs the rank (the glissando) faster as the pitch
   * climbs; each pipe it passes swells, shivers and throws a ripple. On the
   * beat every pipe speaks at once.
   */
  _rankUpdate() {
    const c = settings[ID];
    const g = settings.global;
    const rk = this._rk;
    const dt = Math.max(0, this.age - this._rankClock);
    this._rankClock = this.age;
    const N = Math.max(2, Math.min(MAX_PIPES, Math.round(c.pipeCount)));
    const tall = Math.max(0.1, c.pipeTall);
    const short = Math.max(0.05, Math.min(tall, c.pipeShort));
    const chestH = Math.max(0.02, c.chestHeight);
    const total = tall + chestH;
    const rise = Easing.outBack(saturate(rk.appear));
    const y0 = -(1 - rise) * total - rk.tear * total * c.rankSink;
    if (rk.appear <= 0 || rk.tear >= 0.999 || y0 <= -total) {
      this._hideRank();
      return;
    }
    this._rankVisible = true;
    // Mouths face the caster: local +Z is back along the line.
    _bz.copy(this.direction).negate();
    _bx.copy(this.side);
    if (_tmp.crossVectors(_bx, _up).dot(_bz) < 0) _bx.negate();
    _m4.makeBasis(_bx, _up, _bz);
    _q.setFromRotationMatrix(_m4);
    const W = Math.max(0.3, c.sheetWidth * c.pipeSpan);
    const r0 = Math.max(0.01, c.pipeRadius);
    const flash = rk.since < 0 ? 0 : Math.exp(-rk.since * 5);
    _pos.copy(this._sheetAt);
    _pos.y = y0;
    _scale.set(W + r0 * 4, chestH, Math.max(0.05, c.chestDepth));
    _m4.compose(_pos, _q, _scale);
    this.chest.setMatrixAt(0, _m4);
    this.chest.count = 1;
    this.chest.geometry.getAttribute('aPipe').setXYZW(0, 0, 0, this._seed, flash);
    this.chest.geometry.getAttribute('aPipe').needsUpdate = true;
    this.chest.instanceMatrix.needsUpdate = true;
    this.chest.visible = true;
    // Lean with the shear.
    const lean = Math.atan2(rk.shear * c.rankLean, tall);
    _q2.setFromAxisAngle(this.direction, lean).multiply(_q);
    // The run up the rank.
    const rate = c.speakRate * g.animationSpeed * (1 + rk.pitch * c.chirpClimb);
    this._play += dt * rate;
    const w = Math.max(0.2, c.speakWidth);
    const head = (this._play % 1) * (N - 1 + 2 * w) - w;
    const idx = Math.floor(head + 0.5);
    if (idx !== this._playIdx) {
      if (idx >= 0 && idx < N && rk.appear > 0.5) this._throw(idx);
      this._playIdx = idx;
    }
    if (!this._chorded && rk.since >= 0) {
      this._chorded = true;
      if (c.speakChord > 0.01) for (let i = 0; i < N; i++) this._throw(i);
    }
    const chord = rk.since < 0 ? 0 : c.speakChord * Math.exp(-rk.since * 3);
    const hum = c.speakHum * (rk.since < 0 ? 0.5 : rk.ring);
    const voice = 1 - rk.tear;
    const aP = this.pipes.geometry.getAttribute('aPipe');
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const h = tall * Math.pow(short / tall, t);
      const r = r0 * Math.pow(h / tall, 0.6);
      const bow = c.rankBow * (1 - 4 * (t - 0.5) * (t - 0.5));
      _pos.copy(this._sheetAt).addScaledVector(this.side, (t - 0.5) * W * this._sheetSide).addScaledVector(this.direction, bow);
      // The toe sits down in the chest's toe-board.
      _pos.y = y0 + chestH * 0.98 - h * 0.035;
      _scale.set(r, h, r);
      _m4.compose(_pos, _q2, _scale);
      this.pipes.setMatrixAt(i, _m4);
      const d = (i - head) / w;
      const run = Math.exp(-d * d) * (0.55 + 0.45 * rk.ring);
      const speak = Math.min(1, Math.max(run, chord, hum)) * voice;
      aP.setXYZW(i, speak, (c.vibFreq * tall) / h, this._seed * 1.7 + i * 2.39, flash);
      this._pipeX[i] = _pos.x;
      this._pipeY[i] = _pos.y;
      this._pipeZ[i] = _pos.z;
      this._pipeH[i] = h;
      this._pipeR[i] = r;
    }
    this._pipeN = N;
    this.pipes.count = N;
    this.pipes.instanceMatrix.needsUpdate = true;
    aP.needsUpdate = true;
    this.pipes.visible = true;
    this.pipeMaterial.userData.sync();
    this._pressUpdate();
  }

  /** Each live ripple rolls out from its pipe, swells, warps and thins; only its crest is lime. */
  _pressUpdate() {
    const c = settings[ID];
    const g = settings.global;
    const life = Math.max(0.05, c.pressLife * g.lifetime);
    const fade = 1 - this._rk.tear;
    const aR = this.pressGeometry.getAttribute('aRip');
    const aR2 = this.pressGeometry.getAttribute('aRip2');
    let k = 0;
    for (let j = 0; j < MAX_PRESS; j++) {
      const born = this._pressBorn[j];
      if (born < 0) continue;
      const age = this.age - born;
      if (age > life || age < 0) {
        this._pressBorn[j] = -1;
        continue;
      }
      const i = this._pressPipe[j];
      if (i >= this._pipeN) continue;
      const t = age / life;
      const alpha = saturate(t / 0.08) * Math.pow(1 - t, 1.4) * fade;
      const radius = this._pipeR[i] * 1.2 + c.pressStart + c.pressSpeed * age;
      const height = this._pipeH[i] * c.pressHeight * (1 + 0.25 * t);
      aR.setXYZW(k, this._pipeX[i], this._pipeY[i], this._pipeZ[i], alpha);
      aR2.setXYZW(k, radius, height, c.pressArc, ((j * 0.618) % 1) * 6.283);
      k++;
    }
    this.press.count = k;
    this.pressLens.count = k;
    this.press.visible = k > 0 && c.pressBody + c.pressCrest > 0.001;
    this.pressLens.visible = k > 0 && c.pressWarp > 0.001;
    aR.needsUpdate = true;
    aR2.needsUpdate = true;
    this.pressMaterial.userData.sync(this.direction, this.side);
    this.pressLensMaterial.userData.sync(this.direction, this.side);
  }

  /**
   * Stand the wall of sound: where it is along the line, how far it has slid
   * and sheared, its height, ridge amplitude, pitch and tear — all from the
   * settings, the travel `u` and the seconds since the beat.
   */
  _sheetUpdate(committed, fadeT) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = !committed ? -1 : fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
    const lag = Math.min(0.9, Math.max(0, c.sheetLag));
    const a = committed ? 1 : saturate((this.u - lag) / (1 - lag));
    const appear = committed ? 1 : saturate((this.u - lag * 0.6) / Math.max(0.01, lag * 0.4 + 0.05));
    this._rk.appear = appear;
    if (appear <= 0) {
      this.sheet.visible = false;
      this._hideRank();
      return;
    }
    const start = Math.min(this.length * 0.6, Math.max(0, c.sheetStart));
    const glide = since < 0 ? 0 : Easing.outCubic(saturate(since / Math.max(0.05, c.glideTime * L)));
    const dist = start + (this.length - start) * Easing.inOutQuad(a) + c.lateGlide * glide;
    const slide = c.sheetSlide * (1 - a) * (1 - a) - c.lateSlide * glide;
    const tear = since < 0 ? 0 : saturate((since - c.tearStart * L) / Math.max(0.05, c.tearTime * L));
    this.pointAt(0, this._sheetAt).addScaledVector(this.direction, dist).addScaledVector(this.side, slide * this._sheetSide);
    const total = this.impactDuration + this.fadeDuration;
    const pitch = since < 0 ? 0.35 * a : 0.35 + 0.65 * saturate(since / total);
    const ring = since < 0 ? 1 : c.ringFloor + (1 - c.ringFloor) * Math.exp(-since * c.ringDecay / L);
    _sheetPose.dir.copy(this.direction);
    _sheetPose.side.copy(this.side);
    _sheetPose.height = c.sheetHeight * Easing.outBack(appear) * (1 - 0.6 * tear);
    _sheetPose.amp = c.rippleAmp * ring;
    _sheetPose.f0 = c.chirpStart * (1 + pitch);
    _sheetPose.f1 = c.chirpEnd * (1 + pitch * c.chirpClimb);
    const shear = (c.sheetShear * (1 - a) + c.lateShear * glide) * this._sheetSide;
    const rk = this._rk;
    rk.tear = tear;
    rk.pitch = pitch;
    rk.ring = ring;
    rk.shear = shear;
    rk.since = since;
    this._rankUpdate();
    if (c.sheetOpacity <= 0.001) {
      this.sheet.visible = false;
      return;
    }
    const echoes = Math.max(0, Math.min(MAX_SHEETS - 1, Math.round(c.echoes)));
    const aC = this.sheetGeometry.getAttribute('aCentre');
    const aS = this.sheetGeometry.getAttribute('aSheet');
    let k = 0;
    for (let e = 0; e <= echoes; e++) {
      const back = e * c.echoSpacing;
      const alpha = Math.pow(c.echoAlpha, e) * (e === 0 ? 1 : saturate((dist - start - back) / 1.5 + 0.2));
      _pos.copy(this._sheetAt).addScaledVector(this.direction, -back);
      if (e > 0 && dist - back < start * 0.5) continue;
      aC.setXYZW(k, _pos.x, 0, _pos.z, alpha);
      aS.setXYZW(k, Math.pow(c.echoScale, e), e * 1.9, shear * (1 - 0.3 * e), Math.min(1, tear * (1 + 0.4 * e)));
      k++;
    }
    this.sheet.count = k;
    this.sheet.visible = k > 0 && tear < 0.999;
    aC.needsUpdate = true;
    aS.needsUpdate = true;
    this.sheetMaterial.userData.sync(_sheetPose);
  }

  /** Dust scoured off the sheet's foot as it slides, and the scoured floor it leaves. */
  _sheetShed(dt) {
    if (!this.sheet.visible && !this._rankVisible) return;
    const c = settings[ID];
    const g = settings.global;
    if (c.grooveSpacing > 0.05) {
      const at = this._sheetAt.distanceTo(this.origin);
      if (at - this._grooveAt >= c.grooveSpacing) {
        this._grooveAt = at;
        // On the line under the sweep, not where it slid in from.
        const along = _pos.copy(this._sheetAt).sub(this.origin).dot(this.direction);
        _pos.copy(this.origin).addScaledVector(this.direction, along).setY(0);
        this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
          radius: c.grooveRadius,
          life: c.grooveLife * g.lifetime,
          width: 0.85,
          intensity: 0.8,
          colorA: getColor(c.colorGroove),
          colorB: getColor(c.colorSheetBody),
          height: 0.026
        });
      }
    }
    const n = Math.round(this._footEmitter.tick(dt, c.footDust) * g.particleCount);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * c.sheetWidth * 0.9;
      _pos.copy(this._sheetAt).addScaledVector(this.side, x);
      _pos.y = 0.1;
      _dir.copy(this.direction).addScaledVector(this.side, (Math.random() - 0.5) * 0.8);
      _dir.y = 0.35;
      if (Math.random() < 0.6) {
        this._fillEmit(_pos, 0.15, _dir, c.dustSpeed, 0.5, 0.45, c.dustLife, 0.4);
        this.dust.emit(1, _emit);
      } else {
        _pos.y = Math.random() * c.sheetHeight * 0.9;
        this._fillEmit(_pos, 0.1, _dir, c.streakSpeed * 0.6, 0.4, 0.06, c.streakLife, 2);
        this.streaks.emit(1, _emit);
      }
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
    this.dust = particles.get('glissando.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('glissando.streak', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('glissando.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('glissando.mote', {
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
    return 1 - f + f * Math.sin(this.age * 8.00);
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
    this.trail.reset();
    this._sheetSide = Math.random() < 0.5 ? -1 : 1;
    this._footEmitter.reset();
    // The scour starts once the sweep has slid in over the line.
    this._grooveAt = settings[ID].sheetStart + settings[ID].grooveSpacing;
    this.sheet.visible = false;
    this._hideRank();
    this._rk.appear = 0;
    this._rk.tear = 0;
    this._rk.since = -1;
    this._rankClock = this.age;
    this._play = 0;
    this._playIdx = -99;
    this._chorded = false;
    this._pressBorn.fill(-1);
    this._pressNext = 0;
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
    this._sheetUpdate(committed, fadeT);
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
        _dir.set(Math.cos(ang), 0.05, Math.sin(ang));
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.set(Math.cos(ang), 0.4, Math.sin(ang));
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
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this.trail.tick(dt, this._state.along, this._state, c.wakeSpacing);
    this._sheetShed(dt);
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
    this._palette();
    this._shed(dt, fade * 0.7);
    this.trail.tick(dt, 1, this._state, c.wakeSpacing);
    this._sheetShed(dt);
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
    this.sheet.visible = false;
    this._hideRank();
  }

  dispose() {
    this.pipeGeometry.dispose();
    this.chestGeometry.dispose();
    this.pipeMaterial.dispose();
    this.pressGeometry.dispose();
    this.pressMaterial.dispose();
    this.pressLensMaterial.dispose();
    this.pipes.dispose();
    this.chest.dispose();
    this.press.dispose();
    this.pressLens.dispose();
    this.sheetGeometry.dispose();
    this.sheetMaterial.dispose();
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
  const folder = gui.addFolder('Glissando Sweep');
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

  const mark = folder.addFolder('13 · Mark — left ringing');
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

  const sheet = folder.addFolder('15 · The glissando');
  R(sheet, c, 'sheetWidth', 0.5, 12, 0.05, 'width (m)');
  R(sheet, c, 'sheetHeight', 0.2, 6, 0.05, 'height (m)');
  R(sheet, c, 'sheetBow', -3, 3, 0.05, 'bow (m)');
  R(sheet, c, 'sheetCrest', 0, 0.6, 0.01, 'waveform top');
  R(sheet, c, 'sheetStart', 0, 8, 0.05, 'rises at (m)');
  R(sheet, c, 'sheetLag', 0, 0.9, 0.01, 'lag, share of travel');
  R(sheet, c, 'sheetSlide', 0, 6, 0.05, 'slides in from (m)');
  R(sheet, c, 'sheetShear', -3, 3, 0.05, 'shear in flight (m)');
  R(sheet, c, 'rippleAmp', 0, 1, 0.01, 'ridge depth (m)');
  R(sheet, c, 'rippleSpeed', 0, 40, 0.1, 'ridge speed');
  R(sheet, c, 'chirpStart', 0, 10, 0.05, 'pitch, low side');
  R(sheet, c, 'chirpEnd', 0, 20, 0.05, 'pitch, high side');
  R(sheet, c, 'chirpClimb', 0, 4, 0.05, 'pitch climb');
  R(sheet, c, 'lateGlide', 0, 6, 0.05, 'glides on (m)');
  R(sheet, c, 'lateSlide', -6, 6, 0.05, 'slides on (m)');
  R(sheet, c, 'lateShear', -3, 3, 0.05, 'shear after (m)');
  R(sheet, c, 'glideTime', 0.05, 3, 0.01, 'glide (s)');
  R(sheet, c, 'ringDecay', 0, 8, 0.05, 'ring decay');
  R(sheet, c, 'ringFloor', 0, 1, 0.01, 'ring floor');
  R(sheet, c, 'tearStart', 0, 3, 0.01, 'tears at (s)');
  R(sheet, c, 'tearTime', 0.05, 2, 0.01, 'tears in (s)');
  R(sheet, c, 'echoes', 0, 3, 1, 'echoes');
  R(sheet, c, 'echoSpacing', 0, 4, 0.05, 'echo spacing (m)');
  R(sheet, c, 'echoAlpha', 0, 1, 0.01, 'echo strength');
  R(sheet, c, 'echoScale', 0.2, 1, 0.01, 'echo scale');
  R(sheet, c, 'sheetGlow', 0, 4, 0.05, 'glow');
  R(sheet, c, 'sheetCore', 0, 8, 0.05, 'white-hot crest');
  R(sheet, c, 'sheetOpacity', 0, 1.5, 0.01, 'opacity');
  R(sheet, c, 'sheetFoot', 0, 4, 0.05, 'foot glow');
  R(sheet, c, 'footDust', 0, 400, 1, 'scour / s');
  R(sheet, c, 'grooveSpacing', 0, 4, 0.05, 'scoured every (m)');
  R(sheet, c, 'grooveRadius', 0, 4, 0.05, 'scoured patch (m)');
  R(sheet, c, 'grooveLife', 0.1, 10, 0.05, 'scouring stays (s)');
  sheet.addColor(c, 'colorGroove').name('scoured floor');
  sheet.addColor(c, 'colorSheetCore').name('core');
  sheet.addColor(c, 'colorSheetTint').name('tint');
  sheet.addColor(c, 'colorSheetBody').name('body');
  sheet.addColor(c, 'colorSheetDeep').name('deep');

  const rank = folder.addFolder('16 · The pipe rank');
  R(rank, c, 'pipeCount', 2, 16, 1, 'pipes');
  R(rank, c, 'pipeTall', 0.3, 6, 0.05, 'longest pipe (m)');
  R(rank, c, 'pipeShort', 0.1, 4, 0.05, 'shortest pipe (m)');
  R(rank, c, 'pipeRadius', 0.03, 0.8, 0.01, 'pipe radius (m)');
  R(rank, c, 'pipeSpan', 0.2, 1.5, 0.01, 'span, × sheet width');
  R(rank, c, 'rankBow', -3, 3, 0.05, 'bow (m)');
  R(rank, c, 'chestHeight', 0.05, 2, 0.01, 'chest height (m)');
  R(rank, c, 'chestDepth', 0.1, 3, 0.01, 'chest depth (m)');
  R(rank, c, 'rankLean', -3, 3, 0.05, 'lean, × shear');
  R(rank, c, 'rankSink', 0, 2, 0.01, 'sinks, × height');
  R(rank, c, 'speakRate', 0, 8, 0.05, 'runs / s');
  R(rank, c, 'speakWidth', 0.2, 6, 0.05, 'pipes speaking');
  R(rank, c, 'speakHum', 0, 1, 0.01, 'hum');
  R(rank, c, 'speakChord', 0, 1, 0.01, 'chord on the beat');
  R(rank, c, 'vibAmp', 0, 1, 0.01, 'shiver, × radius');
  R(rank, c, 'vibFreq', 0, 120, 0.5, 'shiver rate');
  R(rank, c, 'vibNodes', 0.5, 8, 0.25, 'wave loops');
  R(rank, c, 'mouthGlow', 0, 8, 0.05, 'mouth glow');
  R(rank, c, 'pipeRim', 0, 3, 0.01, 'lime rim');
  R(rank, c, 'pipeSpecular', 0, 4, 0.05, 'polish');
  R(rank, c, 'pipeFlash', 0, 4, 0.05, 'flare on the beat');
  rank.addColor(c, 'colorPipe').name('bronze');
  rank.addColor(c, 'colorPipeShine').name('polished');
  rank.addColor(c, 'colorPipeDeep').name('bronze, deep');
  rank.addColor(c, 'colorPipeMouth').name('mouth');
  rank.addColor(c, 'colorPipeHot').name('mouth, hot');

  const press = folder.addFolder('17 · Pressure ripples');
  R(press, c, 'pressLife', 0.05, 3, 0.01, 'life (s)');
  R(press, c, 'pressSpeed', 0, 12, 0.05, 'rolls out (m/s)');
  R(press, c, 'pressStart', 0, 2, 0.01, 'leaves at (m)');
  R(press, c, 'pressArc', 0.2, 6.28, 0.01, 'arc (rad)');
  R(press, c, 'pressHeight', 0.1, 2, 0.01, 'height, × pipe');
  R(press, c, 'pressBody', 0, 1, 0.01, 'dark body');
  R(press, c, 'pressCrest', 0, 8, 0.05, 'lime crest');
  R(press, c, 'pressCrestWidth', 0.005, 0.3, 0.005, 'crest width');
  R(press, c, 'pressWobble', 0, 0.6, 0.01, 'haze warp');
  R(press, c, 'pressWarp', 0, 4, 0.05, 'screen warp');
  R(press, c, 'pressMax', 1, 48, 1, 'ripples alive');
  press.addColor(c, 'colorPressBody').name('body');
  press.addColor(c, 'colorPressCrest').name('crest');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
