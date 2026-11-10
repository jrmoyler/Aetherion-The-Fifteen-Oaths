import {
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createMindBeamMaterial,
  createMindNodeMaterial,
  createMindFloorMaterial,
  createMindFieldMaterial
} from '../../materials/codex/MindLatticeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'mindlattice';

/** A tesseract: 16 vertices, 32 edges. Fixed by the geometry of four dimensions. */
const VERTS = 16;
const EDGES = 32;
/** Rim bars the editor allows; each also owns a top and a bottom ring segment. */
const MAX_BARS = 32;
const BAR0 = EDGES;
const TOP0 = BAR0 + MAX_BARS;
const BOT0 = TOP0 + MAX_BARS;
const MAX_BEAMS = BOT0 + MAX_BARS;
/** The travelling thought is one more node. */
const ORB = VERTS;
const MAX_NODES = VERTS + 1;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _hub = new Vector3();
const _up = new Vector3(0, 1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);

/** The tesseract's edges: vertex pairs whose 4-bit indices differ in one bit. */
const EDGE_A = new Uint8Array(EDGES);
const EDGE_B = new Uint8Array(EDGES);
{
  let e = 0;
  for (let v = 0; v < VERTS; v++) {
    for (let bit = 0; bit < 4; bit++) {
      const w = v ^ (1 << bit);
      if (w > v) {
        EDGE_A[e] = v;
        EDGE_B[e] = w;
        e++;
      }
    }
  }
}

/** Push one particle system's gradient and the globals through. */
function syncSystem(p, a, b, cc, d, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/** A clean emit record — every field set, so nothing leaks between emitters. */
function resetEmit() {
  _emit.position = _pos;
  _emit.radius = 0;
  _emit.direction = _up;
  _emit.speed = 0;
  _emit.speedVariance = 0.4;
  _emit.spread = 0.5;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = frame.uTime.value;
}

/**
 * MIND LATTICE — Arcane, zone cast.
 *
 * Pure geometry made of light — the deliberate opposite of the Vein Lattice:
 * nothing bends, nothing is jittered, every line is ruled.
 *
 * A single **point of thought** — a spinning white octahedron trailing motes
 * — flies down the line at head height. Over the circle it rises and
 * **unfolds into a tesseract**: sixteen nodes spring out of the point and its
 * thirty-two edges draw themselves in, a cube inside a cube that turns
 * through the fourth dimension, so the inner cube rolls out through the outer
 * one and back. While it unfolds, **bars of light drop round the rim** one
 * after another, top ring first, each slamming into the floor with a spark;
 * when the last lands the bottom ring closes and the cage **locks** — flash,
 * jolt, shock ring, a shell of light. A **triangular lattice of light** has
 * drawn itself across the floor inside, with concentric rings, nodes at
 * every crossing and a radar sweep turning over it, on a solid deep-violet
 * disc. While it holds the cage is never still: the ring of bars turns, the
 * top ring sways in a twist against the bottom one so the bars lean into a
 * hyperboloid, and the crown cinches in over what it caught. Packets
 * of thought run along every bar and **synapses fire**: an edge flares white,
 * a ring pulses out across the floor. Then it ends the way it began: the
 * bars withdraw upward, and the tesseract spins up and **folds back into a
 * point** that winks out.
 *
 * ## Layers
 *
 *   1. **beams** (`createMindBeamMaterial`) — one InstancedMesh of lit,
 *      faceted violet crystal prisms (a thin HDR filament at the heart is the
 *      only white) for every straight line: 32 tesseract edges, `barCount` rim
 *      bars, a top and a bottom ring segment per bar. Placed from their two
 *      end points each frame (a 4D rotation + perspective projection on the
 *      CPU — sixteen points, nothing to it). Per instance `aBeam`.
 *   2. **nodes** (`createMindNodeMaterial`) — sixteen spinning octahedra at
 *      the vertices, plus the travelling thought.
 *   3. **the floor** (`createMindFloorMaterial`) — triangular lattice, rings,
 *      crossing nodes, sweep, synapse pulses; drawn out from the centre.
 *   4. **motes** (SOFT, additive) drifting inside the cage and trailing the
 *      thought; **sparks** (STREAK) where bars land and synapses fire.
 *   5. **the field** (`createMindFieldMaterial`) — glass bands on the cage
 *      wall on `LAYER.DISTORTION`, coming down with the bars.
 *   6. **the beat** — the lock (flash, shake, SHOCKWAVE, STORM shell, light
 *      punch) and the fold (a smaller flash and a light punch).
 *
 * Hits are the engine's: everything inside the circle falls on arrival.
 *
 * ## The editor rule
 *
 * A cast captures a seed, the side the bars start on, and four integrated
 * rotation angles (so changing a rate never makes the tesseract jump). Per
 * edge it holds only a decaying synapse flare. Every size, time and colour is
 * resolved from `settings.mindlattice` every frame.
 */
export class MindLatticeAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** Beams lit. HUD readout only. */
  get instanceCount() {
    return this._lit;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: beams ---- */
    // Hexagonal prisms: six flat faces, so the lit crystal reads as cut.
    this.beamGeometry = new CylinderGeometry(1, 1, 1, 6, 1, true);
    this.beamGeometry.translate(0, 0.5, 0);
    this.beamAttr = new InstancedBufferAttribute(new Float32Array(MAX_BEAMS * 4), 4);
    this.beamAttr.setUsage(DynamicDrawUsage);
    this.beamGeometry.setAttribute('aBeam', this.beamAttr);
    this.beamMaterial = createMindBeamMaterial();
    this.beams = this._instanced(this.beamGeometry, this.beamMaterial, MAX_BEAMS, 10);

    /* ---- layer 2: nodes ---- */
    this.nodeGeometry = new OctahedronGeometry(1, 0);
    this.nodeAttr = new InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4);
    this.nodeAttr.setUsage(DynamicDrawUsage);
    this.nodeGeometry.setAttribute('aNode', this.nodeAttr);
    this.nodeMaterial = createMindNodeMaterial();
    this.nodes = this._instanced(this.nodeGeometry, this.nodeMaterial, MAX_NODES, 11);

    /* ---- layer 3: the floor ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createMindFloorMaterial();
    this.floor = this._mesh(this.floorGeometry, this.floorMaterial, LAYER.VFX, 2);

    /* ---- layer 5: the field ---- */
    this.fieldGeometry = new CylinderGeometry(1, 1, 1, 48, 1, true);
    this.fieldGeometry.translate(0, 0.5, 0);
    this.fieldMaterial = createMindFieldMaterial();
    this.field = this._mesh(this.fieldGeometry, this.fieldMaterial, LAYER.DISTORTION, 0);

    /** Projected tesseract vertices, this frame (world). */
    this._verts = [];
    for (let i = 0; i < VERTS; i++) this._verts.push(new Vector3());
    /** Decaying synapse flare per edge. */
    this._flare = new Float32Array(EDGES);
    /** Bar latches. */
    this._landed = new Uint8Array(MAX_BARS);
    this._barK = new Float32Array(MAX_BARS);

    this._floorState = { centre: new Vector3(), yaw: 0, radius: 4, front: 0, sweep: 0, pulseR: 0, pulse: 0, fade: 0 };
    this._fieldState = { strength: 0, drop: 0 };

    this._seed = 0;
    this._clock = -1;
    this._rot = new Float32Array(4); // XW, YW, ZW, yaw
    this._arrival = 0;
    this._sweep = 0;
    this._locked = false;
    this._folded = false;
    this._pulseAt = -1;
    this._synapseClock = 0;
    this._lit = 0;
    this._hubPos = new Vector3();
    /** Integrated cage turn and twist sway (rad), and when it locked (clock s). */
    this._cageSpin = 0;
    this._twistPh = 0;
    this._lockClock = -1;
  }

  _instanced(geometry, material, count, order) {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
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

    this.motes = particles.get('mindlattice.motes', {
      capacity: 1800,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uDrag.value = 1.2;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.08;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.sparks = particles.get('mindlattice.sparks', {
      capacity: 1000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uDrag.value = 2;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.moteEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _bars(c) {
    return Math.max(3, Math.min(MAX_BARS, Math.round(c.barCount)));
  }

  _barStart(i, n, c, g) {
    return (Math.max(0, c.barDelay) + (i / n) * Math.max(0, c.barSpread)) * g.lifetime;
  }

  _lockAt(c, g) {
    return (Math.max(0, c.barDelay) + Math.max(0, c.barSpread)) * g.lifetime + Math.max(0.03, c.barDropTime);
  }

  get impactDuration() {
    const c = settings[ID];
    const g = settings.global;
    return Math.max(this._lockAt(c, g), Math.max(0.05, c.unfoldTime) * g.lifetime) + Math.max(0.05, c.lifetime * g.lifetime);
  }

  get fadeDuration() {
    const c = settings[ID];
    const g = settings.global;
    return (Math.max(Math.max(0.05, c.foldTime), Math.max(0.05, c.retractTime)) + Math.max(0.05, c.floorFade) * 0.5) * g.lifetime;
  }

  /** Light hums; a synapse makes it jump. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.5 + f * 0.5 * Math.sin(this.age * 31.0);
  }

  /* ------------------------------------------------------------------ */
  /* The tesseract                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Rotate the 16 vertices of a 4-cube through XW, YW and ZW, project them
   * into 3D by perspective along W, yaw them, scale and hang them at `hub`.
   */
  _projectTesseract(scale, hub, c) {
    const cxw = Math.cos(this._rot[0]);
    const sxw = Math.sin(this._rot[0]);
    const cyw = Math.cos(this._rot[1]);
    const syw = Math.sin(this._rot[1]);
    const czw = Math.cos(this._rot[2]);
    const szw = Math.sin(this._rot[2]);
    const cy = Math.cos(this._rot[3]);
    const sy = Math.sin(this._rot[3]);
    const d = Math.max(1.3, c.projection);
    const size = c.cubeSize * scale;
    for (let v = 0; v < VERTS; v++) {
      let x = v & 1 ? 1 : -1;
      let y = v & 2 ? 1 : -1;
      let z = v & 4 ? 1 : -1;
      let w = v & 8 ? 1 : -1;
      let t = x * cxw - w * sxw;
      w = x * sxw + w * cxw;
      x = t;
      t = y * cyw - w * syw;
      w = y * syw + w * cyw;
      y = t;
      t = z * czw - w * szw;
      w = z * szw + w * czw;
      z = t;
      const f = (d / (d - w)) * size;
      x *= f;
      y *= f;
      z *= f;
      this._verts[v].set(hub.x + x * cy - z * sy, hub.y + y, hub.z + x * sy + z * cy);
    }
  }

  /** Write one beam instance from `a` to `b`. */
  _beam(i, a, b, radius, intensity, hue, flare, seed) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    const k4 = i * 4;
    const attr = this.beamAttr.array;
    if (len < 1e-4 || intensity <= 0.001) {
      this.beams.setMatrixAt(i, _zero);
      attr[k4 + 1] = 0;
      return;
    }
    _dir.multiplyScalar(1 / len);
    _q.setFromUnitVectors(_up, _dir);
    _scale.set(radius, len, radius);
    _m.compose(a, _q, _scale);
    this.beams.setMatrixAt(i, _m);
    attr[k4] = seed;
    attr[k4 + 1] = intensity;
    attr[k4 + 2] = hue;
    attr[k4 + 3] = flare;
    this._lit++;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._rot[0] = Math.random() * TAU;
    this._rot[1] = Math.random() * TAU;
    this._rot[2] = Math.random() * TAU;
    this._rot[3] = Math.random() * TAU;
    this._arrival = Math.atan2(-this.direction.z, -this.direction.x);
    this._sweep = 0;
    this._locked = false;
    this._folded = false;
    this._pulseAt = -1;
    this._synapseClock = 0;
    this._cageSpin = 0;
    this._twistPh = 0;
    this._lockClock = -1;
    this._flare.fill(0);
    this._landed.fill(0);
    this._barK.fill(0);
    this.moteEmitter.reset();
    this.trailEmitter.reset();
    for (let i = 0; i < MAX_BEAMS; i++) this.beams.setMatrixAt(i, _zero);
    for (let i = 0; i < MAX_NODES; i++) this.nodes.setMatrixAt(i, _zero);
    this.beamAttr.array.fill(0);
    this.nodeAttr.array.fill(0);
    this.beams.instanceMatrix.needsUpdate = true;
    this.nodes.instanceMatrix.needsUpdate = true;
    this.beamAttr.needsUpdate = true;
    this.nodeAttr.needsUpdate = true;
    this.beams.visible = true;
    this.nodes.visible = true;
    this.floor.visible = false;
    this.field.visible = false;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _update(dt) {
    const c = settings[ID];
    const g = settings.global;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const R = Math.max(0.5, c.zoneRadius);
    this.pointAt(1, _centre);
    this._lit = 0;

    /* --- the fold --- */
    const foldT = Math.max(0.05, c.foldTime * g.lifetime);
    const kFold = fading ? saturate(this.fadeTime / foldT) : 0;
    if (fading && kFold >= 1 && !this._folded) {
      this._folded = true;
      this._foldFx(c, g);
    }

    /* --- integrated rotations --- */
    const spin = (1 + c.foldSpin * Easing.inQuad(kFold)) * g.animationSpeed * dt;
    this._rot[0] += c.rotXW * spin;
    this._rot[1] += c.rotYW * spin;
    this._rot[2] += c.rotZW * spin;
    this._rot[3] += c.rotY * spin;

    /* --- the hub, and the thought flying to it --- */
    _hub.copy(_centre).setY(c.hoverHeight);
    const unfold = clock < 0 ? 0 : saturate(clock / Math.max(0.05, c.unfoldTime * g.lifetime));
    let scale = clock < 0 ? 0 : Easing.outBack(unfold);
    if (fading) scale *= 1 - Easing.inCubic(kFold);
    this._hubPos.copy(_hub);

    /* --- tesseract edges and nodes --- */
    this._projectTesseract(scale, _hub, c);
    const nodeAttr = this.nodeAttr.array;
    for (let v = 0; v < VERTS; v++) {
      const k4 = v * 4;
      if (scale <= 0.001) {
        this.nodes.setMatrixAt(v, _zero);
        nodeAttr[k4 + 1] = 0;
        continue;
      }
      _q.setFromAxisAngle(_up, this._rot[3] * 3 + v);
      const s = c.nodeSize * Math.min(1, scale * 1.5);
      _scale.set(s, s * 1.3, s);
      _m.compose(this._verts[v], _q, _scale);
      this.nodes.setMatrixAt(v, _m);
      nodeAttr[k4] = v / VERTS;
      nodeAttr[k4 + 1] = 1;
      nodeAttr[k4 + 2] = 0;
      nodeAttr[k4 + 3] = 0;
    }
    // Synapses: random edges fire while it holds.
    const holding = clock >= 0 && !fading && this._locked;
    if (holding) {
      this._synapseClock += dt * c.synapseRate * g.randomness;
      while (this._synapseClock >= 1) {
        this._synapseClock -= 1;
        this._fire((Math.random() * EDGES) | 0, c, g);
      }
    }
    for (let e = 0; e < EDGES; e++) {
      this._flare[e] = Math.max(0, this._flare[e] - this._flare[e] * c.synapseDecay * dt - 0.2 * dt);
      // Each edge draws in from its first vertex, staggered round the cube.
      const reveal = saturate(unfold * 1.6 - (e / EDGES) * 0.6);
      _a.copy(this._verts[EDGE_A[e]]);
      _b.copy(this._verts[EDGE_B[e]]);
      _b.lerpVectors(_a, _b, reveal);
      const inner = EDGE_A[e] >= 8 && EDGE_B[e] >= 8 ? 1 : 0;
      this._beam(e, _a, _b, c.edgeRadius * Math.max(0.3, scale), scale > 0.001 ? 1 : 0, inner, this._flare[e], e / EDGES);
    }

    /* --- the thought in flight --- */
    const ok4 = ORB * 4;
    if (clock < 0 || unfold < 0.35) {
      if (clock < 0) {
        _pos.copy(this.position).setY(1.6);
      } else {
        // Rises from where it landed into the hub as the cube unfolds out of it.
        _pos.copy(_centre).setY(1.6).lerp(_hub, Easing.outCubic(unfold / 0.35));
      }
      _q.setFromAxisAngle(_up, this.age * 9);
      const s = c.nodeSize * 1.8 * (clock < 0 ? Easing.outBack(saturate(this.age / 0.15)) : 1 - unfold / 0.35);
      _scale.set(s, s * 1.4, s);
      _m.compose(_pos, _q, _scale);
      this.nodes.setMatrixAt(ORB, _m);
      nodeAttr[ok4] = 0.5;
      nodeAttr[ok4 + 1] = 1;
      nodeAttr[ok4 + 3] = 1;
      this._hubPos.copy(_pos);
    } else {
      this.nodes.setMatrixAt(ORB, _zero);
      nodeAttr[ok4 + 1] = 0;
    }

    /* --- the cage --- */
    const n = this._bars(c);
    const H = Math.max(0.3, c.barHeight);
    const rr = Math.max(0.2, R - c.barInset);
    const dropT = Math.max(0.03, c.barDropTime);
    const retractT = Math.max(0.05, c.retractTime * g.lifetime);
    const kRet = fading ? Easing.inCubic(saturate(this.fadeTime / retractT)) : 0;
    // Once locked the cage lives: the ring turns, the top ring sways in a
    // twist against the bottom one, and the crown cinches in over the catch.
    const kLock = this._locked ? Easing.inOutQuad(saturate((clock - this._lockClock) / Math.max(0.05, c.cinchTime * g.lifetime))) : 0;
    if (this._locked && dt > 0) {
      this._cageSpin += c.cageSpin * g.animationSpeed * dt * (1 - kRet);
      this._twistPh += c.cageTwistSpeed * g.animationSpeed * dt;
    }
    const twist = c.cageTwist * kLock * Math.sin(this._twistPh) * (1 - kRet);
    const rTop = rr * (1 - saturate(c.cageCinch) * kLock * (1 - kRet));
    let landed = 0;
    let dropSum = 0;
    for (let i = 0; i < MAX_BARS; i++) {
      if (i >= n || clock < 0) {
        this._beam(BAR0 + i, _a, _a, 0, 0, 0, 0, 0);
        this._beam(TOP0 + i, _a, _a, 0, 0, 0, 0, 0);
        this._beam(BOT0 + i, _a, _a, 0, 0, 0, 0, 0);
        continue;
      }
      const ang = this._arrival + (i / n) * TAU + this._cageSpin;
      const angTop = ang + twist;
      const k = saturate((clock - this._barStart(i, n, c, g)) / dropT);
      this._barK[i] = k;
      if (k >= 1 && !this._landed[i]) {
        this._landed[i] = 1;
        this._landFx(_pos.set(_centre.x + Math.cos(ang) * rr, 0.05, _centre.z + Math.sin(ang) * rr), c, g);
      }
      if (this._landed[i]) landed++;
      dropSum += k;
      // The bar comes down from the top ring, head first; it withdraws upward.
      _a.set(_centre.x + Math.cos(angTop) * rTop, H, _centre.z + Math.sin(angTop) * rTop);
      _b.set(_centre.x + Math.cos(ang) * rr, 0, _centre.z + Math.sin(ang) * rr);
      _b.lerpVectors(_a, _b, Easing.inQuad(k) * (1 - kRet));
      this._beam(BAR0 + i, _a, _b, c.barRadius, k > 0 ? 1 - kRet * 0.5 : 0, 0, 0, i / n);
    }
    // Rings: the top one draws round with the drops; the bottom one closes behind the landings.
    for (let i = 0; i < n && clock >= 0; i++) {
      const j = (i + 1) % n;
      const a0 = this._arrival + (i / n) * TAU + this._cageSpin;
      const a1 = this._arrival + (j / n) * TAU + (j === 0 ? TAU : 0) + this._cageSpin;
      const kTop = saturate(this._barK[i] * 3);
      _a.set(_centre.x + Math.cos(a0 + twist) * rTop, H, _centre.z + Math.sin(a0 + twist) * rTop);
      _b.set(_centre.x + Math.cos(a1 + twist) * rTop, H, _centre.z + Math.sin(a1 + twist) * rTop);
      _b.lerpVectors(_a, _b, kTop);
      this._beam(TOP0 + i, _a, _b, c.ringRadius, kTop > 0 ? 1 - kRet : 0, 1, 0, i / n);
      const both = this._landed[i] && this._landed[j];
      _a.set(_centre.x + Math.cos(a0) * rr, 0.03, _centre.z + Math.sin(a0) * rr);
      _b.set(_centre.x + Math.cos(a1) * rr, 0.03, _centre.z + Math.sin(a1) * rr);
      this._beam(BOT0 + i, _a, _b, c.ringRadius, both ? 1 - smoothstep(0, 0.5, this.fadeTime / retractT) * (fading ? 1 : 0) : 0, 1, 0, i / n);
    }

    /* --- the lock --- */
    if (!this._locked && clock >= 0 && landed >= n) {
      this._locked = true;
      this._lockClock = clock;
      this._lockFx(c, g);
    }

    this.beams.instanceMatrix.needsUpdate = true;
    this.nodes.instanceMatrix.needsUpdate = true;
    this.beamAttr.needsUpdate = true;
    this.nodeAttr.needsUpdate = true;
    this.beamMaterial.userData.sync();
    this.nodeMaterial.userData.sync();
    this.beams.visible = this._lit > 0;
    this.nodes.visible = true;

    /* --- the floor --- */
    this._sweep += c.sweepSpeed * dt * g.animationSpeed;
    const fl = this._floorState;
    fl.centre.copy(_centre);
    fl.yaw = Math.atan2(this.direction.x, this.direction.z);
    fl.radius = R;
    fl.front = clock < 0 ? 0 : Easing.outCubic(saturate(clock / Math.max(0.05, c.floorTime * g.lifetime))) * (R + 0.6);
    fl.sweep = this._sweep;
    fl.pulseR = this._pulseAt >= 0 ? (clock - this._pulseAt) * c.pulseSpeed : 0;
    fl.pulse = this._pulseAt >= 0 ? Math.exp(-(clock - this._pulseAt) * 2.5) : 0;
    fl.fade = fading ? saturate((this.fadeTime - this.fadeDuration * 0.4) / Math.max(0.05, this.fadeDuration * 0.6)) : 0;
    this.floorMaterial.userData.sync(fl);
    this.floor.visible = clock >= 0 && fl.fade < 1;

    /* --- the field --- */
    const fs = this._fieldState;
    fs.drop = n > 0 ? (dropSum / n) * (1 - kRet) : 0;
    fs.strength = this._locked ? 1 - kRet : 0.5 * fs.drop;
    this.fieldMaterial.userData.sync(fs);
    this.field.position.set(_centre.x, 0, _centre.z);
    this.field.scale.set(rr, H, rr);
    this.field.updateMatrix();
    this.field.visible = clock >= 0 && fs.strength > 0.01;

    /* --- motes drifting in the cage --- */
    if (clock >= 0 && dt > 0) {
      const rate = c.moteRate * (fading ? 1 - kFold : 1) * Math.min(1, scale + fs.drop);
      const m = Math.round(this.moteEmitter.tick(dt, rate) * g.particleCount);
      if (m > 0) {
        resetEmit();
        _emit.speed = 0.4;
        _emit.spread = 1;
        _emit.size = c.moteSize;
        _emit.sizeVariance = 0.5;
        _emit.life = c.moteLifetime;
        for (let k = 0; k < m; k++) {
          const a = Math.random() * TAU;
          const r = rr * Math.sqrt(Math.random()) * 0.95;
          _emit.position = _pos.set(_centre.x + Math.cos(a) * r, Math.random() * H, _centre.z + Math.sin(a) * r);
          this.motes.emit(1, _emit);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** One synapse: an edge flares and a ring pulses out across the floor. */
  _fire(e, c, g) {
    this._flare[e] = 1;
    this._pulseAt = this._clock;
    _pos.lerpVectors(this._verts[EDGE_A[e]], this._verts[EDGE_B[e]], 0.5);
    resetEmit();
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.speed = c.sparkSpeed * 0.5;
    _emit.spread = 1;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);
    this.lightBoost = Math.max(this.lightBoost, c.lockLight * 0.2);
  }

  /** A bar strikes the floor. */
  _landFx(at, c, g) {
    resetEmit();
    _emit.position = at;
    _emit.radius = 0.05;
    _emit.speed = c.sparkSpeed;
    _emit.spread = 0.7;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);
  }

  /** The cage closes. */
  _lockFx(c, g) {
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.lockShake * power, 4, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.lockFlash * power);
    this.lightBoost = c.lockLight * power;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.bursts.spawn(BurstMode.STORM, _pos.copy(_centre).setY(c.hoverHeight), {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.3,
      opacity: 0.7 * g.opacity,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this._pulseAt = this._clock;
  }

  /** The tesseract winks out. */
  _foldFx(c, g) {
    this.ctx.flash.trigger(getColor(c.colorFlash), c.foldFlash * g.explosionIntensity);
    this.lightBoost = c.lockLight * 0.6 * g.explosionIntensity;
    resetEmit();
    _emit.position = _pos.copy(_hub);
    _emit.radius = 0.1;
    _emit.speed = c.sparkSpeed;
    _emit.spread = 1;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * 4 * g.particleCount), _emit);
  }

  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.trailEmitter.tick(dt, c.trailRate) * g.particleCount);
    if (n <= 0) return;
    resetEmit();
    _emit.position = _pos.copy(this.position).setY(1.6);
    _emit.radius = 0.12;
    _emit.speed = 0.5;
    _emit.spread = 1;
    _emit.size = c.moteSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLifetime * 0.5;
    this.motes.emit(n, _emit);
  }

  _syncParticles() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteGlow * g.glow, 0.5);
    this.motes.uniforms.uGravity.value.set(0, 0.25, 0);
    syncSystem(this.sparks, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.moteGlow * g.glow, 0.1);
    this.sparks.uniforms.uGravity.value.set(0, -6, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._syncParticles();
    this._travelFx(dt);
    this._update(dt);
    this.position.y = 1.6;
  }

  onImpact() {
    this._clock = 0;
    this.lightBoost = settings[ID].lockLight * 0.3 * settings.global.explosionIntensity;
  }

  onFade(dt) {
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._syncParticles();
    this._update(dt);
    this.position.copy(this._hubPos);
    this.position.y = lerp(this.position.y, 1.5, 0.3);
  }

  onDestroy() {
    this._clock = -1;
    this._lit = 0;
    this.beams.visible = false;
    this.nodes.visible = false;
    this.floor.visible = false;
    this.field.visible = false;
  }

  dispose() {
    this.beamGeometry.dispose();
    this.nodeGeometry.dispose();
    this.floorGeometry.dispose();
    this.fieldGeometry.dispose();
    this.beamMaterial.dispose();
    this.nodeMaterial.dispose();
    this.floorMaterial.dispose();
    this.fieldMaterial.dispose();
    this.beams.dispose();
    this.nodes.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⧈  Mind Lattice');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'thought flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'unfoldTime', 0.05, 2, 0.01, 'unfolds over');
  R(time, c, 'barDelay', 0, 1, 0.01, 'bars drop after');
  R(time, c, 'barSpread', 0, 2, 0.01, 'bars drop round over');
  R(time, c, 'barDropTime', 0.03, 1, 0.01, 'one bar drops over');
  R(time, c, 'lifetime', 0.05, 6, 0.05, 'holds for');
  R(time, c, 'foldTime', 0.05, 2, 0.01, 'folds over');
  R(time, c, 'retractTime', 0.05, 2, 0.01, 'bars withdraw over');
  R(time, c, 'floorFade', 0.05, 2, 0.01, 'floor fades over');

  const cube = folder.addFolder('1 · Tesseract');
  R(cube, c, 'cubeSize', 0.2, 4, 0.01, 'half-size (m)');
  R(cube, c, 'projection', 1.3, 10, 0.05, '4D depth');
  R(cube, c, 'hoverHeight', 0.5, 8, 0.05, 'hangs at (m)');
  R(cube, c, 'rotXW', -4, 4, 0.01, 'turn XW (rad/s)');
  R(cube, c, 'rotYW', -4, 4, 0.01, 'turn YW (rad/s)');
  R(cube, c, 'rotZW', -4, 4, 0.01, 'turn ZW (rad/s)');
  R(cube, c, 'rotY', -4, 4, 0.01, 'yaw (rad/s)');
  R(cube, c, 'foldSpin', 0, 20, 0.1, 'spin-up as it folds');
  R(cube, c, 'edgeRadius', 0.005, 0.2, 0.001, 'edge radius (m)');
  R(cube, c, 'nodeSize', 0.02, 0.6, 0.005, 'node size (m)');

  const cage = folder.addFolder('2 · Cage');
  R(cage, c, 'barCount', 3, MAX_BARS, 1, 'bars');
  R(cage, c, 'barHeight', 0.3, 10, 0.05, 'height (m)');
  R(cage, c, 'barRadius', 0.005, 0.2, 0.001, 'bar radius (m)');
  R(cage, c, 'barInset', -1, 3, 0.01, 'inset from rim (m)');
  R(cage, c, 'ringRadius', 0.005, 0.2, 0.001, 'ring radius (m)');
  R(cage, c, 'cageSpin', -3, 3, 0.01, 'turns while locked (rad/s)');
  R(cage, c, 'cageTwist', 0, 2, 0.01, 'twist sway (rad)');
  R(cage, c, 'cageTwistSpeed', 0, 8, 0.05, 'twist speed (rad/s)');
  R(cage, c, 'cageCinch', 0, 0.9, 0.01, 'crown cinches in (share)');
  R(cage, c, 'cinchTime', 0.05, 3, 0.01, 'cinch over (s)');

  const light = folder.addFolder('3 · Light');
  light.addColor(c, 'colorCore').name('ramp · white-hot core');
  light.addColor(c, 'colorSecondary').name('ramp · pale tint');
  light.addColor(c, 'colorPrimary').name('ramp · body');
  light.addColor(c, 'colorDeep').name('ramp · deep');
  R(light, c, 'beamGlow', 0, 3, 0.01, 'crystal body brightness');
  R(light, c, 'beamAmbient', 0, 1, 0.01, 'shadowed facets');
  R(light, c, 'beamRim', 0, 2, 0.01, 'tint rim');
  R(light, c, 'coreGlow', 0, 8, 0.05, 'core filament glow (HDR)');
  R(light, c, 'coreWidth', 1, 60, 0.5, 'core filament thinness');
  R(light, c, 'packetGlow', 0, 10, 0.05, 'thought packets');
  R(light, c, 'packetSpeed', 0, 6, 0.05, 'packets / s');
  R(light, c, 'packetSpacing', 0.1, 6, 0.05, 'packet spacing (m)');
  R(light, c, 'nodeGlow', 0, 8, 0.05, 'node glow');
  R(light, c, 'synapseRate', 0, 30, 0.1, 'synapses / s');
  R(light, c, 'synapseGlow', 0, 12, 0.05, 'synapse flare');
  R(light, c, 'synapseDecay', 0.5, 20, 0.1, 'synapse decay');

  const floor = folder.addFolder('4 · Floor lattice');
  floor.addColor(c, 'colorWash').name('wash');
  R(floor, c, 'gridCell', 0.2, 3, 0.01, 'cell (m)');
  R(floor, c, 'gridLineWidth', 0.005, 0.2, 0.001, 'line width (m)');
  R(floor, c, 'gridGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'gridWash', 0, 1, 0.01, 'deep disc');
  R(floor, c, 'floorHeart', 0, 2, 0.01, 'disc warms at heart');
  R(floor, c, 'sweepSpeed', 0, 3, 0.01, 'sweep (turns/s)');
  R(floor, c, 'floorTime', 0.05, 2, 0.01, 'draws out over');
  R(floor, c, 'pulseSpeed', 0.5, 30, 0.1, 'synapse ring speed (m/s)');

  const fx = folder.addFolder('5 · Motes & sparks');
  R(fx, c, 'moteRate', 0, 300, 1, 'motes / s');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLifetime', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(fx, c, 'colorMote', 'mote colour');
  R(fx, c, 'sparkCount', 0, 60, 1, 'sparks per strike');
  R(fx, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(fx, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  Editor.gradient(fx, c, 'colorSpark', 'spark colour');
  R(fx, c, 'trailRate', 0, 500, 1, 'thought trail / s');

  const beat = folder.addFolder('6 · The beat');
  R(beat, c, 'lockShake', 0, 1.5, 0.01, 'lock shake');
  R(beat, c, 'lockFlash', 0, 1, 0.01, 'lock flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'lockLight', 0, 80, 0.5, 'light punch');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'burstRadius', 0, 8, 0.05, 'shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, tint');
  R(beat, c, 'foldFlash', 0, 1, 0.01, 'fold flash');
  R(beat, c, 'fieldStrength', 0, 2, 0.01, 'glass between bars');

  const lights = folder.addFolder('Light');
  lights.addColor(c, 'lightColor').name('colour');
  R(lights, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(lights, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(lights, c, 'lightFlicker', 0, 1, 0.01, 'hum');
}
