import { BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, LatheGeometry, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector2, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { createServoPylonPieceGeometry, createServoPylonHeroGeometry } from '../../assets/codex/ServoPylonGeometry.js';
import {
  createServoPylonBodyMaterial,
  createServoPylonLensMaterial,
  createServoPylonGroundMaterial,
  createServoPylonVoiceMaterial,
  createServoPylonDetailMaterial,
  createServoPylonMachineMaterial,
  createServoPylonDeckMaterial
} from '../../materials/codex/ServoPylonMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'servopylon';

const TWIST = 'topple';
const ARCH = 'spire';
const HIT = 'out';
const CARRY = 'none';
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

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;
/** Pylons the ring can stand (the parts are instanced once). */
const MAX_PYLONS = 12;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _q = new Quaternion();
const _scale = new Vector3();
const _radial = new Vector3();
const _hand = new Vector3();
const _head = new Vector3();
const _zero = new Matrix4().makeScale(1e-5, 1e-5, 1e-5);

/** A stable 0..1 die per pylon from the cast's seed. */
function dice(i, seed) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A chamfered square, half-size 0.5, in the plane of the two given axes. */
const CHAMFER = 0.16;
const OCTAGON = [
  [0.5, -0.5 + CHAMFER], [0.5, 0.5 - CHAMFER], [0.5 - CHAMFER, 0.5], [-0.5 + CHAMFER, 0.5],
  [-0.5, 0.5 - CHAMFER], [-0.5, -0.5 + CHAMFER], [-0.5 + CHAMFER, -0.5], [0.5 - CHAMFER, -0.5]
];

/**
 * Loft the chamfered section through `stations` ([t, scale, part]) along an
 * axis: `place(t, a, b)` returns the vertex for station t and section
 * coordinates (a, b). Flat facets (non-indexed, face normals) so the sun
 * picks out every panel; both ends capped. `aPart` marks the parts that glow
 * when the servo fires (vents, striking faces).
 */
function loft(stations, place) {
  const pos = [];
  const part = [];
  const n = OCTAGON.length;
  const ring = stations.map(([t, k]) => OCTAGON.map(([a, b]) => place(t, a * k, b * k)));
  for (let r = 0; r < ring.length - 1; r++) {
    const A = ring[r];
    const B = ring[r + 1];
    const p = Math.max(stations[r][2] ?? 0, stations[r + 1][2] ?? 0) > 0 && (stations[r][2] ?? 0) === (stations[r + 1][2] ?? 0) ? stations[r][2] : 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pos.push(...A[i], ...B[j], ...A[j], ...A[i], ...B[i], ...B[j]);
      for (let v = 0; v < 6; v++) part.push(p);
    }
  }
  const last = ring[ring.length - 1];
  const first = ring[0];
  const lastPart = stations[stations.length - 1][2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    pos.push(...last[0], ...last[i + 1], ...last[i]);
    pos.push(...first[0], ...first[i], ...first[i + 1]);
    part.push(lastPart, lastPart, lastPart, 0, 0, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new Float32BufferAttribute(part, 1));
  g.computeVertexNormals();
  return g;
}

/**
 * The pylon: one unit tall along +Y, one unit across at the plinth. A
 * stepped plinth, a shaft, the servo housing the ram fires from (its vents
 * glow when it fires), a narrower mast and a capped top.
 */
export function createServoPylonColumnGeometry() {
  // aPart 1 = vents (glow when the ram fires), 2 = the status lamp at the crown (always lit while powered).
  return loft([
    [0.0, 1.3], [0.06, 1.3], [0.08, 1.08], [0.12, 0.92], [0.44, 0.82], [0.46, 1.12, 1], [0.62, 1.12, 1], [0.66, 1.0],
    [0.7, 0.62], [0.86, 0.54], [0.88, 0.7], [0.9, 1.3], [0.95, 1.3], [0.96, 0.8, 2], [1.0, 0.45, 2]
  ], (t, a, b) => [a, t, b]);
}

/** The hammer head: one unit long along +X (the ram end at 0, the striking face at 1). */
export function createServoPylonHeadGeometry() {
  return loft([
    [0.0, 0.55], [0.12, 0.92], [0.2, 1.0], [0.78, 1.0], [0.84, 0.86], [0.88, 1.08], [1.0, 1.04, 1]
  ], (t, a, b) => [t, a, b]);
}

/** The ram: a piston rod one unit long along +X, radius one, with a gland collar at the root. */
export function createServoPylonRamGeometry() {
  const profile = [[0.001, 0], [1.6, 0], [1.6, 0.06], [1.0, 0.1], [1.0, 0.97], [1.25, 0.98], [1.25, 1.0], [0.001, 1.0]];
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 10).toNonIndexed();
  g.rotateZ(-Math.PI / 2);
  g.computeVertexNormals();
  g.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
  return g;
}

/**
 * The servo core thrown into the circle: a faceted drum around +Y, one unit
 * radius, 1.15 tall — base flange, a vented motor band (glows), a second
 * flange and a domed cap with a spindle.
 */
export function createServoPylonHubGeometry() {
  const profile = [
    [0.001, 0], [0.92, 0], [1.0, 0.08], [1.0, 0.3], [0.78, 0.34], [0.78, 0.62], [1.0, 0.66], [1.0, 0.86],
    [0.7, 0.96], [0.36, 1.04], [0.2, 1.04], [0.2, 1.15], [0.001, 1.15]
  ];
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 12).toNonIndexed();
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const part = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    part[i] = y > 0.33 && y < 0.63 && r < 0.8 ? 1 : 0;
  }
  g.setAttribute('aPart', new Float32BufferAttribute(part, 1));
  return g;
}

/**
 * SERVO PYLON — tech, zone cast.
 *
 * Tech — servo pylons stamp up in a ring and hammer outward.
 *
 * Pylons stamp up and hammer outward on the beat. The rise is the windup; the hammer is the hit.
 *
 * The read is `topple`: hit timing `commit`, blow `out`.
 *
 * ## Layers
 *
 *   1. **body** — the topple placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled tech field under the circle: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a crown riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createServoPylonPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createServoPylonHeroGeometry`), stood by its archetype (spire): thrust up through the floor, then left to lean and topple.
 *      Hero and pieces are matter: sun-lit, opaque, shadow-casting (LAYER.SHAPED), the ramp as albedo, only hot parts glowing. The rig is framed to the circle (`heroFit`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: pylons stamp up and hammer outward on the beat. The rise is the windup; the hammer is the hit.
 *  10. **mark** — a felled body is shorted out: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The machine (the hero, cast-local — sections 14–16 of the editor)
 *
 * The shared template layers (the striped body wall, voice, the tall rig,
 * the thin rod pieces, lens) are switched off in the config; the spell is
 * carried by its own machined forms (`LAYER.WORLD`, lit, shadows):
 *
 *   - **the servo core** — a faceted drum (`createServoPylonHubGeometry`) is
 *     thrown on an arc into the circle and beds into the floor on the beat,
 *     its rotor driving through the linger.
 *   - **the pylons** — `pylonCount` lofted gunmetal pylons with a stepped
 *     plinth, a vented servo housing and a mast stamp up out of the floor in
 *     a ring round the core as it lands (staggered, overshooting) and punch
 *     into the floor on the beat.
 *   - **the hammer** — on the beat every ram fires outward at once, driving
 *     its hammer head through the group (the hit, unchanged). Through the
 *     linger the rams fire round the ring one after another like a radial
 *     engine (`cycle*`): each stroke lights its housing vents, throws sparks
 *     and dust, and sends a cyan pulse out along its conduit in the deck.
 *   - **the deck** — a filled machined floor plate under the machine
 *     (`createServoPylonDeckMaterial`): dark plating, conduits, pulses.
 *   - **the exit** — the rams retract and the pylons sink back into the
 *     floor one after another round the ring; the core goes last.
 *
 * All of it is presentation: hits still land once, on the beat (`_strike`).
 *
 * Every metre, rate and colour is read from `settings.servopylon` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class ServoPylonAbility extends Ability {
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
    this.bodyMaterial = createServoPylonBodyMaterial();
    this.lensMaterial = createServoPylonLensMaterial();
    this.groundMaterial = createServoPylonGroundMaterial();
    this.voiceMaterial = createServoPylonVoiceMaterial();
    this.detailMaterial = createServoPylonDetailMaterial();
    this.heroMaterial = createServoPylonDetailMaterial(true);
    this.detail = new DetailLayer(createServoPylonPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createServoPylonHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._buildMachine();
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
  }

  /** The cast-local hero: the pylons, their rams and hammer heads, the servo hub and the deck. */
  _buildMachine() {
    this.machineMaterial = createServoPylonMachineMaterial();
    const make = (geometry, count) => {
      const mesh = new InstancedMesh(geometry, this.machineMaterial, count);
      const attr = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aServo', attr);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    this.columnGeometry = createServoPylonColumnGeometry();
    this.ramGeometry = createServoPylonRamGeometry();
    this.headGeometry = createServoPylonHeadGeometry();
    this.hubGeometry = createServoPylonHubGeometry();
    this.columns = make(this.columnGeometry, MAX_PYLONS);
    this.rams = make(this.ramGeometry, MAX_PYLONS);
    this.heads = make(this.headGeometry, MAX_PYLONS);
    this.hub = make(this.hubGeometry, 1);
    this.deckGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.deckMaterial = createServoPylonDeckMaterial();
    this.deck = this._mesh(this.deckGeometry, this.deckMaterial, LAYER.VFX, 2);
    this.deck.rotation.x = -Math.PI / 2;
    this._fired = new Float32Array(MAX_PYLONS).fill(-10);
    this._cycle = new Float32Array(MAX_PYLONS).fill(-1);
    this._ringSpin = 0;
    this._hubSpin = 0;
    this._strokes = 0;
    this._maxExt = 0;
    this._sink = 0;
    this._spin0 = 0;
    this._sinceNow = -1;
  }

  _hideMachine() {
    this.columns.visible = false;
    this.rams.visible = false;
    this.heads.visible = false;
    this.hub.visible = false;
    this.deck.visible = false;
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** A ram stroke `t` seconds old: out fast, hold, back slower. 0..1 extension. */
  _stroke(t, out, hold, back) {
    if (t < 0) return 0;
    if (t < out) return Easing.outCubic(t / out);
    if (t < out + hold) return 1;
    return Math.max(0, 1 - Easing.inOutCubic(saturate((t - out - hold) / back)));
  }

  /**
   * Stand the machine for this frame. Before the beat the servo core is
   * thrown on an arc into the circle and the pylons stamp up out of the
   * floor round it (staggered, overshooting). On the beat every ram fires
   * outward at once — the hit. Through the linger the rams fire round the
   * ring one after another like a radial engine, each stroke lighting its
   * housing vents and sending a pulse out along its conduit in the deck. On
   * the exit the rams retract and the pylons sink back into the floor one
   * by one. Every dimension is read from settings each frame; the cast holds
   * only its seed, the ring's phase and the fire clock of each pylon.
   */
  _machine(committed, fadeT, dt) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    this.pointAt(1, _end);
    const n = Math.max(3, Math.min(MAX_PYLONS, Math.round(c.pylonCount)));
    const R = Math.max(0.3, c.zoneRadius * c.pylonRing);
    const H = Math.max(0.2, c.pylonHeight);
    const W = Math.max(0.05, c.pylonWidth);
    const exitAt = total - Math.max(0.05, (c.pylonExit + c.pylonExitStagger) * L);
    const out = Math.max(0.02, c.ramOut * L);
    const hold = Math.max(0, c.ramHold * L);
    const back = Math.max(0.05, c.ramBack * L);
    const period = Math.max(0.1, c.cyclePeriod * L);
    const cycleStart = c.cycleStart * L;
    this._ringSpin += dt * c.ringTurn * g.animationSpeed * (committed ? 1 : 0);

    // The hub: thrown on an arc, lands and spins as the servo drives.
    const hubR = Math.max(0.05, c.hubRadius);
    let hubY;
    this._hubGone = 0;
    if (!committed) {
      _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
      _hand.y = c.handHeight;
      const t = saturate(this.u);
      _pos.lerpVectors(_hand, _end, t);
      hubY = lerp(_hand.y, 0, t) + c.hubArc * 4 * t * (1 - t);
      _pos.y = hubY;
      this._hubSpin += dt * c.hubSpin * 2;
      _scale.setScalar(hubR * lerp(c.hubTravelScale, 1, Easing.inQuad(saturate((t - 0.5) / 0.5))));
    } else {
      const sink = since > exitAt ? Easing.inQuad(saturate((since - exitAt) / Math.max(0.05, (c.pylonExit + c.pylonExitStagger) * L))) : 0;
      const dip = c.hubDip * Math.sin(Math.min(1, since / 0.12) * Math.PI) * Math.exp(-since * 5);
      _pos.copy(_end);
      this._hubGone = sink;
      _pos.y = -c.hubBed - dip - sink * hubR * 1.4;
      const drive = since < exitAt ? 1 : 1 - saturate((since - exitAt) / Math.max(0.05, c.pylonExit * L));
      this._hubSpin += dt * c.hubSpin * drive * g.animationSpeed;
      _scale.setScalar(hubR);
    }
    _q.setFromAxisAngle(_up, this._hubSpin);
    _m4.compose(_pos, _q, _scale);
    this.hub.setMatrixAt(0, _m4);
    const hubAttr = this.hubGeometry.getAttribute('aServo');
    hubAttr.setXYZW(0, this._seed, committed ? 0.35 + 0.65 * Math.exp(-since * 3) : 0.3, 1, 0);
    hubAttr.needsUpdate = true;
    this.hub.instanceMatrix.needsUpdate = true;
    this.hub.count = 1;
    this.hub.visible = c.hubRadius > 0.01 && this._hubGone < 0.999;

    // The pylons, rams and heads.
    const colAttr = this.columnGeometry.getAttribute('aServo');
    const ramAttr = this.ramGeometry.getAttribute('aServo');
    const headAttr = this.headGeometry.getAttribute('aServo');
    let any = false;
    let maxExt = 0;
    let sinkMax = 0;
    for (let i = 0; i < n; i++) {
      const d = dice(i, this._seed);
      const span = Math.max(0.05, c.riseSpan);
      const rise = committed ? 1 : saturate((this.u - (1 - span - c.riseStagger * d)) / span);
      const sink = since < 0 ? 0 : Easing.inQuad(saturate((since - exitAt - c.pylonExitStagger * L * (i / n)) / Math.max(0.05, c.pylonExit * L)));
      sinkMax = Math.max(sinkMax, sink);
      if (rise <= 0 || sink >= 0.999) {
        this.columns.setMatrixAt(i, _zero);
        this.rams.setMatrixAt(i, _zero);
        this.heads.setMatrixAt(i, _zero);
        continue;
      }
      any = true;
      const ang = this._spin0 + this._ringSpin + (TAU * i) / n;
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      const stamp = since < 0 ? 0 : c.stampDip * Math.sin(Math.min(1, since / 0.12) * Math.PI) * Math.exp(-since * 4);
      const y = -H * (1 - Easing.outBack(rise)) - stamp - sink * H * 1.05;

      // Ram extension: the beat stroke, then the round-robin cycle.
      let ext = 0;
      let heat = 0;
      if (since >= 0) {
        ext = this._stroke(since, out, hold, back);
        if (since >= cycleStart && since < exitAt) {
          const tau = since - cycleStart - (period * i) / n;
          if (tau >= 0) {
            const k = Math.floor(tau / period);
            const local = tau - k * period;
            if (k !== this._cycle[i]) {
              this._cycle[i] = k;
              this._fire(i, ang);
            }
            ext = Math.max(ext, this._stroke(local, out, hold, back) * c.cycleReach);
          }
        }
        heat = saturate(Math.max(ext, Math.exp(-(since - this._fired[i]) * 6)));
        if (sink > 0) ext *= 1 - saturate(sink * 3);
      }
      maxExt = Math.max(maxExt, ext);
      const power = since < 0 ? rise * 0.4 : 1 - sink;
      _pos.copy(_end).addScaledVector(_radial, R);
      _pos.y = y;
      _q.setFromAxisAngle(_up, -ang);
      _scale.set(W, H, W);
      _m4.compose(_pos, _q, _scale);
      this.columns.setMatrixAt(i, _m4);
      colAttr.setXYZW(i, d * 10, heat, power, 0);

      // Ram: from inside the housing out past the face.
      const ramLen = c.ramBase + c.ramReach * ext;
      const ramY = y + H * c.ramHeight;
      _head.copy(_pos).addScaledVector(_radial, W * 0.3);
      _head.y = ramY;
      _scale.set(ramLen + W * 0.2, c.ramRadius, c.ramRadius);
      _m4.compose(_head, _q, _scale);
      this.rams.setMatrixAt(i, _m4);
      ramAttr.setXYZW(i, d * 10, heat * 0.5, power, 0);

      // Hammer head on the end of the ram, its striking face outward.
      _head.addScaledVector(_radial, ramLen + W * 0.2);
      _scale.set(c.headLength, c.headSize, c.headSize * 1.1);
      _m4.compose(_head, _q, _scale);
      this.heads.setMatrixAt(i, _m4);
      headAttr.setXYZW(i, d * 10, heat * 0.7, power, 0);
    }
    this._maxExt = maxExt;
    this._sink = sinkMax;
    for (const mesh of [this.columns, this.rams, this.heads]) {
      mesh.count = n;
      mesh.visible = any;
      mesh.instanceMatrix.needsUpdate = true;
    }
    colAttr.needsUpdate = true;
    ramAttr.needsUpdate = true;
    headAttr.needsUpdate = true;
    this.machineMaterial.userData.sync();

    // The deck: plates under the machine, pulses out along the conduits.
    const deckR = Math.max(0.3, c.zoneRadius * c.deckFit);
    const lay = committed ? 1 : Easing.outCubic(saturate((this.u - 0.4) / 0.6));
    const cool = since < 0 ? 0 : saturate((since - exitAt) / Math.max(0.05, (c.pylonExit + c.pylonExitStagger) * L));
    if (c.deckOpacity > 0.01 && lay > 0.01 && cool < 0.999) {
      this.deck.visible = true;
      this.deck.position.set(_end.x, 0.03, _end.z);
      const r = deckR * (0.35 + 0.65 * lay);
      this.deck.scale.set(r, r, 1);
      const pulses = this.deckMaterial.uniforms.uPulse.value;
      const life = Math.max(0.05, c.deckPulseLife * L);
      for (let i = 0; i < MAX_PYLONS; i++) {
        const age = since < 0 ? 0 : (since - this._fired[i]) / life;
        pulses[i] = i < n && age > 0 && age < 1 ? age : 0;
      }
      // The deck's sector 0 sits on pylon 0 (the shader measures the world angle atan2(z, x)).
      this.deckMaterial.userData.sync(r, R, n, this._spin0 + this._ringSpin, committed ? 1 : lay * 0.4, cool, c.deckOpacity * (1 - Easing.inQuad(cool)), this._seed);
    } else this.deck.visible = false;
  }

  /** One ram fires on its cycle: sparks and dust off the head, a light tick, a pulse down its conduit. */
  _fire(i, ang) {
    const c = settings[ID];
    const g = settings.global;
    this._fired[i] = this._sinceNow;
    this._strokes++;
    this.lightBoost += c.strokeLight * g.explosionIntensity;
    if (i === 0) this.ctx.shake.add(c.strokeShake * g.cameraShake * g.explosionIntensity, 4, 14);
    const R = c.zoneRadius * c.pylonRing + c.ramBase + c.ramReach * c.cycleReach + c.headLength;
    _radial.set(Math.cos(ang), 0, Math.sin(ang));
    _pos.copy(_end).addScaledVector(_radial, R);
    _pos.y = c.pylonHeight * c.ramHeight;
    const sparks = Math.round(c.strokeSparks * g.particleCount);
    if (sparks > 0) {
      this._fillEmit(_pos, 0.15, _radial, c.streakSpeed, 0.6, 0.08, c.streakLife, 2);
      this.streaks.emit(sparks, _emit);
    }
    const dust = Math.round(c.strokeDust * g.particleCount);
    if (dust > 0) {
      _pos.y = 0.1;
      _dir.copy(_radial).setY(0.1);
      this._fillEmit(_pos, 0.3, _dir, c.dustSpeed, 0.4, 0.5, c.dustLife, 0.4);
      this.dust.emit(dust, _emit);
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
    this.dust = particles.get('servopylon.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('servopylon.streak', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('servopylon.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('servopylon.mote', {
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
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._fired.fill(-10);
    this._cycle.fill(-1);
    this._ringSpin = 0;
    this._hubSpin = 0;
    this._strokes = 0;
    this._maxExt = 0;
    this._sink = 0;
    this._sinceNow = -1;
    this._spin0 = Math.random() * TAU;
    this._hideMachine();
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
      this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
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
    along = 1; grow = rise; open = beat;
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
        _dir.set(0, (i % 2 === 0 ? 0.2 : 1.1), 0).addScaledVector(this.direction, 0.8);
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
    this.ctx.decals.spawn(DecalType.ARC, _end, {
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
      this.ctx.bursts.spawn(BurstMode.STORM, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
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
    this.ctx.decals.spawn(DecalType.ARC, _end, {
      radius: c.shockRadius * (ZONE ? 1 : 0.65) * power,
      life: c.shockLife,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
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
    this._sinceNow = -1;
    this._machine(false, 0, dt);
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
    this._sinceNow = this._since(true, t);
    this._machine(true, t, dt);
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
    this._hideMachine();
  }

  dispose() {
    this.columnGeometry.dispose();
    this.ramGeometry.dispose();
    this.headGeometry.dispose();
    this.hubGeometry.dispose();
    this.deckGeometry.dispose();
    this.machineMaterial.dispose();
    this.deckMaterial.dispose();
    this.columns.dispose();
    this.rams.dispose();
    this.heads.dispose();
    this.hub.dispose();
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
  const folder = gui.addFolder('Servo Pylon');
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

  const shape = folder.addFolder('1 · Shape — topple');
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

  const mark = folder.addFolder('13 · Mark — shorted out');
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

  const machine = folder.addFolder('14 · The pylons (hero)');
  R(machine, c, 'pylonCount', 3, 12, 1, 'pylons');
  R(machine, c, 'pylonRing', 0.1, 1.2, 0.01, 'ring, × circle');
  R(machine, c, 'pylonHeight', 0.3, 5, 0.05, 'height (m)');
  R(machine, c, 'pylonWidth', 0.1, 1.5, 0.01, 'plinth width (m)');
  R(machine, c, 'riseSpan', 0.05, 1, 0.01, 'stamp-up span, × travel');
  R(machine, c, 'riseStagger', 0, 0.5, 0.01, 'stamp-up stagger');
  R(machine, c, 'stampDip', 0, 0.6, 0.01, 'stamp dip (m)');
  R(machine, c, 'ringTurn', -2, 2, 0.01, 'ring turn (rad/s)');
  R(machine, c, 'pylonExit', 0.05, 2, 0.01, 'sink time (s)');
  R(machine, c, 'pylonExitStagger', 0, 2, 0.01, 'sink stagger (s)');
  R(machine, c, 'ramHeight', 0.1, 1, 0.01, 'ram height, × pylon');
  R(machine, c, 'ramRadius', 0.01, 0.4, 0.005, 'ram radius (m)');
  R(machine, c, 'ramBase', 0, 1.5, 0.01, 'ram at rest (m)');
  R(machine, c, 'ramReach', 0, 4, 0.01, 'ram stroke (m)');
  R(machine, c, 'ramOut', 0.02, 0.5, 0.005, 'stroke out (s)');
  R(machine, c, 'ramHold', 0, 0.5, 0.005, 'stroke hold (s)');
  R(machine, c, 'ramBack', 0.05, 1, 0.01, 'stroke back (s)');
  R(machine, c, 'headLength', 0.1, 1.5, 0.01, 'head length (m)');
  R(machine, c, 'headSize', 0.1, 1.5, 0.01, 'head size (m)');

  const servo = folder.addFolder('15 · The servo cycle');
  R(servo, c, 'cycleStart', 0, 2, 0.01, 'starts after beat (s)');
  R(servo, c, 'cyclePeriod', 0.1, 2, 0.01, 'one turn of the ring (s)');
  R(servo, c, 'cycleReach', 0, 1.5, 0.01, 'stroke, × beat stroke');
  R(servo, c, 'strokeShake', 0, 1, 0.01, 'camera punch per turn');
  R(servo, c, 'strokeLight', 0, 10, 0.1, 'light per stroke');
  R(servo, c, 'strokeSparks', 0, 60, 1, 'sparks per stroke');
  R(servo, c, 'strokeDust', 0, 30, 1, 'dust per stroke');
  R(servo, c, 'hubRadius', 0, 1.5, 0.01, 'core radius (m)');
  R(servo, c, 'hubArc', 0, 5, 0.05, 'throw arc (m)');
  R(servo, c, 'hubTravelScale', 0.1, 1.5, 0.01, 'thrown size');
  R(servo, c, 'hubSpin', -20, 20, 0.1, 'rotor (rad/s)');
  R(servo, c, 'hubBed', 0, 0.6, 0.01, 'bedded in (m)');
  R(servo, c, 'hubDip', 0, 0.6, 0.01, 'landing dip (m)');

  const mat = folder.addFolder('16 · Machined steel and deck');
  R(mat, c, 'machineSpecular', 0, 4, 0.01, 'specular');
  R(mat, c, 'machineFresnel', 0, 3, 0.01, 'fresnel');
  R(mat, c, 'machineAmbient', 0, 1, 0.01, 'ambient');
  R(mat, c, 'machineSeamGlow', 0, 6, 0.05, 'seam glow');
  R(mat, c, 'machineHeatGlow', 0, 6, 0.05, 'firing glow');
  R(mat, c, 'machineSeams', 0, 24, 0.5, 'panel seams');
  R(mat, c, 'machineLamp', 0, 8, 0.05, 'crown lamp');
  mat.addColor(c, 'colorMachineCore').name('core');
  mat.addColor(c, 'colorMachineTint').name('tint');
  mat.addColor(c, 'colorMachineBody').name('body (seams)');
  mat.addColor(c, 'colorMachineDeep').name('deep');
  mat.addColor(c, 'colorMachineSteel').name('steel');
  R(mat, c, 'deckFit', 0.1, 1.5, 0.01, 'deck, × circle');
  R(mat, c, 'deckOpacity', 0, 1, 0.01, 'deck opacity');
  R(mat, c, 'deckGlow', 0, 4, 0.01, 'conduit glow');
  R(mat, c, 'deckPulseLife', 0.05, 2, 0.01, 'pulse run (s)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
