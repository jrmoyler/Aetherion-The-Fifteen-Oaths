import { BufferAttribute, BufferGeometry, Mesh, Vector3 } from 'three';
import { LAYER } from '../../core/Layers.js';

/**
 * The trail a pure-element line cast leaves behind it.
 *
 * The older line casts read because the line itself carries the cast: Railgun
 * leaves a beam that thins and breaks up from the hand to the slug and a slag
 * trench under it, Riptide leaves foam and puddles. The generated line casts
 * drew their body and then nothing between the hand and the far end. This is
 * that missing layer, shared the way DetailLayer is: the strips and the wake
 * live here, the look lives in each spell's own `create<Cast>TrailMaterial`
 * and `create<Cast>ScarMaterial`.
 *
 *   - **trail** — a camera-facing ribbon per lane along the cast's own path,
 *     drawn up to where the head has reached. Each point remembers how long
 *     ago the head crossed it, so the ribbon thins and breaks up from the
 *     tail forward, the way Railgun's beam does.
 *   - **scar** — the same path laid flat on the floor, wider and slower to go.
 *   - **wake** — every `wakeSpacing` metres the head covers (from one step
 *     out of the hand), `onWake` is called with that point, and the cast puts
 *     down a decal and sheds there. A volley's bolts only touch the floor
 *     where they land, so each arc lane wakes once, at its end.
 *
 * Four path families cover the 37 line casts (`FAMILY`): straight (lances),
 * bowed (whips), arcs (one lane per bolt, volleys) and a sweep round the hand
 * (pendulums). `pathPoint` is the CPU twin of each material's GLSL path;
 * the two must agree, and tests/line-trail pins the JS side.
 *
 * Geometry is a grid of (s, cross, lane) — the shaders place every vertex,
 * so nothing is uploaded per frame.
 */

export const FAMILY = Object.freeze({
  drill: 'straight',
  flatten: 'straight',
  falsecut: 'straight',
  erase: 'straight',
  scan: 'straight',
  shear: 'bow',
  late: 'bow',
  plant: 'arc',
  pair: 'arc',
  reverse: 'arc',
  hinge: 'sweep',
  return: 'sweep'
});

/** Ribbon segments along each lane. */
export const SEGMENTS = 96;
/** Most lanes a cast can draw (bolts in a volley). */
export const MAX_LANES = 8;

const _a = new Vector3();
const _b = new Vector3();

/** Strip grid: position = (s 0..1, cross -1..1, lane index). */
export function createTrailGeometry(lanes) {
  const n = Math.max(1, Math.min(MAX_LANES, lanes));
  const cols = SEGMENTS + 1;
  const pos = new Float32Array(n * cols * 2 * 3);
  const index = [];
  let k = 0;
  for (let l = 0; l < n; l++) {
    const base = l * cols * 2;
    for (let i = 0; i < cols; i++) {
      const s = i / SEGMENTS;
      pos[k++] = s; pos[k++] = -1; pos[k++] = l;
      pos[k++] = s; pos[k++] = 1; pos[k++] = l;
      if (i < SEGMENTS) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Lane `lane` of `lanes`: where it sits in the firing order and how many
 * slots the order has. A point `s` on that lane is crossed when the cast's
 * `along` reaches `(order + s) / slots` — the same stagger the body uses.
 */
export function laneOrder(twist, lane, lanes) {
  if (twist === 'reverse') return { order: lanes - 1 - lane, slots: lanes };
  if (twist === 'pair') return { order: Math.floor(lane / 2), slots: Math.max(1, Math.ceil(lanes / 2)) };
  if (twist === 'plant') return { order: lane, slots: lanes };
  return { order: 0, slots: 1 };
}

/** The `along` at which the head crosses `s` on a lane. */
export function passAt(twist, s, lane, lanes) {
  const { order, slots } = laneOrder(twist, lane, lanes);
  if (twist === 'late') return Math.sqrt(Math.max(0, s));
  return (order + s) / slots;
}

/**
 * A point on the path, world space. `st` is the cast's shape state (origin,
 * dir, side, length, radius, height, thickness).
 */
export function pathPoint(twist, s, lane, lanes, st, out) {
  const family = FAMILY[twist];
  const L = st.length;
  if (family === 'sweep') {
    const ang = -st.radius + 2 * st.radius * s;
    _a.copy(st.dir).multiplyScalar(Math.cos(ang)).addScaledVector(st.side, Math.sin(ang));
    out.copy(st.origin).addScaledVector(_a, L * 0.92);
    out.y = st.height * (twist === 'return' ? 0.6 : 0.68);
    return out;
  }
  if (family === 'arc') {
    const n = Math.max(1, lanes);
    let offset;
    if (twist === 'pair') {
      const sign = (lane % 2) * 2 - 1;
      offset = sign * (0.4 + Math.floor(lane / 2) * 0.18) * st.radius;
    } else {
      offset = ((lane + 0.5) / n - 0.5) * 2 * st.radius;
    }
    out.copy(st.origin).addScaledVector(st.dir, s * L).addScaledVector(st.side, offset);
    out.y = Math.sin(s * Math.PI) * st.height * (twist === 'reverse' ? 0.85 : 1) + 0.12;
    return out;
  }
  if (family === 'bow') {
    out.copy(st.origin).addScaledVector(st.dir, s * L).addScaledVector(st.side, Math.sin(s * Math.PI) * st.radius * 0.6);
    out.y = st.height * 0.32;
    return out;
  }
  const off = twist === 'falsecut' ? st.thickness * 3.4 : 0;
  out.copy(st.origin).addScaledVector(st.dir, s * L).addScaledVector(st.side, off);
  out.y = twist === 'flatten' || twist === 'scan' || twist === 'erase' ? 0.32 : 0.85;
  return out;
}

/** Lanes a family draws for a cast with `count` parts. */
export function lanesFor(family, count) {
  return family === 'arc' ? Math.max(1, Math.min(MAX_LANES, Math.round(count))) : 1;
}

/** Metres along a lane, sampled — for wake spacing. */
export function laneLength(twist, lane, lanes, st) {
  let total = 0;
  pathPoint(twist, 0, lane, lanes, st, _a);
  for (let i = 1; i <= 24; i++) {
    pathPoint(twist, i / 24, lane, lanes, st, _b);
    _b.y = 0;
    _a.y = 0;
    total += _a.distanceTo(_b);
    _a.copy(_b);
  }
  return total;
}

export class LineTrail {
  /**
   * @param {string} twist   the cast's twist (a key of FAMILY)
   * @param {ShaderMaterial} trailMaterial  the spell's own ribbon shader
   * @param {ShaderMaterial} scarMaterial   the spell's own floor shader
   */
  constructor(twist, trailMaterial, scarMaterial) {
    if (!FAMILY[twist]) throw new Error(`LineTrail: no path for ${twist}`);
    this.twist = twist;
    this.family = FAMILY[twist];
    // Arcs build every lane once; `count` picks how many draw (the shader drops the rest).
    this.geometry = createTrailGeometry(this.family === 'arc' ? MAX_LANES : 1);
    this.lanes = 1;
    this.trailMesh = this._mesh(trailMaterial, 11, 'LineTrail');
    this.scarMesh = this._mesh(scarMaterial, 2, 'LineScar');
    /** Seconds since the head reached the end; 0 while it travels. */
    this.since = 0;
    this.along = 0;
    /** Next metre on each lane a wake lands at. */
    this._next = new Float32Array(MAX_LANES);
    this._spacingAt = new Float32Array(MAX_LANES);
    this._point = new Vector3();
    /** Called with (point, lane, strength) at every wake. Set by the cast. */
    this.onWake = null;
  }

  _mesh(material, order, name) {
    const mesh = new Mesh(this.geometry, material);
    mesh.name = name;
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  reset() {
    this.since = 0;
    this.along = 0;
    this._next.fill(0);
    this.hide();
  }

  hide() {
    this.trailMesh.visible = false;
    this.scarMesh.visible = false;
  }

  /**
   * Advance the clocks and lay the wake.
   * @param {number} dt
   * @param {number} along   the cast's progress 0..1 (1 once it has landed)
   * @param {object} st      the cast's shape state (its `count` is the bolt count)
   * @param {number} spacing metres between wakes (0 = none)
   */
  tick(dt, along, st, spacing) {
    this.lanes = lanesFor(this.family, st.count);
    const was = this.along;
    this.along = Math.min(1, Math.max(0, along));
    if (this.along >= 1 && was >= 1) this.since += dt;
    if (!(spacing > 0.05) || !this.onWake) return;
    for (let l = 0; l < this.lanes; l++) {
      const len = laneLength(this.twist, l, this.lanes, st);
      if (len < 1e-3) continue;
      const { order, slots } = laneOrder(this.twist, l, this.lanes);
      // How far along this lane the head now is, 0..1.
      let head = this.twist === 'late' ? this.along * this.along : this.along * slots - order;
      head = Math.min(1, Math.max(0, head));
      // A bolt only touches the floor where it lands: one wake, at the end.
      if (this.family === 'arc') {
        if (head >= 1 && this._next[l] >= 0) {
          pathPoint(this.twist, 1, l, this.lanes, st, this._point);
          this.onWake(this._point, l, 1);
          this._next[l] = -1;
        }
        continue;
      }
      // The first wake lands a step out from the hand, not at the caster's feet.
      if (this._next[l] === 0) this._next[l] = Math.min(spacing, len * 0.25);
      let guard = 0;
      while (this._next[l] <= head * len && guard++ < 64) {
        const s = this._next[l] / len;
        pathPoint(this.twist, s, l, this.lanes, st, this._point);
        this.onWake(this._point, l, s);
        this._next[l] += spacing;
      }
    }
  }

  /** Show the strips while the cast is visible. */
  show(on) {
    this.trailMesh.visible = on;
    this.scarMesh.visible = on;
  }

  dispose() {
    this.geometry.dispose();
  }
}
