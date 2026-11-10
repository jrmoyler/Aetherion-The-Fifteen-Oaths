import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  InstancedBufferAttribute,
  PlaneGeometry,
  Vector3,
} from 'three';

/**
 * Umbra Exchange — procedural geometry.
 *
 *  - **the anchor** — a ship's anchor in obsidian, one unit tall, crown at
 *    y = 0 and ring at y = 1, lofted from octagonal sections so the facets
 *    catch the sun: a tapering shank with a collar, a stock across the top,
 *    a ring, two arms swept up on a circular arc and a barbed spade fluke at
 *    each tip, and a short spike under the crown that bites the floor first.
 *    Built flat-shaded (non-indexed, face normals) — volcanic glass breaks in
 *    planes. `uv.x` runs along each part, `uv.y` round it; `aPart` names the
 *    part so the vein shader can tell shank from fluke.
 *  - **the chain** — a unit tube of `CHAIN_SEGMENTS` rings along +x; its
 *    vertex shader bends it onto a bezier and pinches it into links.
 *  - **the gate** — an open cylinder carrier the gate shader twists into a
 *    sheath of umbral tendrils; instanced.
 *  - **the quad** — the pool and the lens.
 */

const TAU = Math.PI * 2;
export const CHAIN_SEGMENTS = 160;
export const CHAIN_SIDES = 6;

const _t = new Vector3();
const _n = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _ref = new Vector3();

/**
 * Loft an elliptical polygon section along a sampled path.
 *
 * @param {(t:number,out:Vector3)=>Vector3} path centreline, t 0..1
 * @param {(t:number)=>number[]} section [rx, ry] at t
 * @param {number} segments along the path
 * @param {number} sides round it
 * @param {number} part id written to `aPart`
 * @param {{capStart?:boolean, capEnd?:boolean, roll?:number}} [opts]
 */
function loft(path, section, segments, sides, part, opts = {}) {
  const rings = [];
  const roll = opts.roll ?? 0;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = path(t, new Vector3());
    const e = 1e-3;
    path(Math.min(1, t + e), _p);
    path(Math.max(0, t - e), _q);
    _t.subVectors(_p, _q).normalize();
    // A stable reference: world z unless the path runs along it.
    _ref.set(0, 0, 1);
    if (Math.abs(_t.dot(_ref)) > 0.9) _ref.set(1, 0, 0);
    _n.crossVectors(_ref, _t).normalize();
    _b.crossVectors(_t, _n).normalize();
    const [rx, ry] = section(t);
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * TAU + roll;
      ring.push(new Vector3()
        .copy(p)
        .addScaledVector(_n, Math.cos(a) * rx)
        .addScaledVector(_b, Math.sin(a) * ry));
    }
    rings.push({ ring, centre: p, t });
  }
  const pos = [];
  const uv = [];
  const quad = (a, b, c, d, ua, ub, va, vb) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uv.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb);
  };
  for (let i = 0; i < segments; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      quad(r0.ring[j], r1.ring[j], r1.ring[k], r0.ring[k], r0.t, r1.t, j / sides, (j + 1) / sides);
    }
  }
  const cap = (r, flip) => {
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      const a = r.centre, b = r.ring[flip ? k : j], c = r.ring[flip ? j : k];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      uv.push(r.t, 0.5, r.t, 0, r.t, 1);
    }
  };
  if (opts.capStart) cap(rings[0], false);
  if (opts.capEnd) cap(rings[segments], true);
  return { pos, uv, part };
}

/** Flat-shaded merge of lofted parts. */
function build(parts) {
  let count = 0;
  for (const p of parts) count += p.pos.length / 3;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const partId = new Float32Array(count);
  let o = 0;
  for (const p of parts) {
    position.set(p.pos, o * 3);
    uv.set(p.uv, o * 2);
    partId.fill(p.part, o, o + p.pos.length / 3);
    o += p.pos.length / 3;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('aPart', new BufferAttribute(partId, 1));
  geometry.computeVertexNormals(); // non-indexed: face normals, the facets
  geometry.computeBoundingSphere();
  return geometry;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Where the anchor's ring is centred (unit height). */
export const ANCHOR_RING_Y = 1.04;
/** Anchor proportions (unit height). */
const ARM_CENTRE_Y = 0.46;
const ARM_RADIUS = 0.4;
const ARM_START = -Math.PI / 2; // straight down from the arc centre: the crown
const ARM_END = -0.32; // where the arm ends (radians from +x)

/** Where an arm is, `t` 0 crown → 1 tip, `side` ±1. */
function armPoint(t, side, out) {
  const a = ARM_START + (ARM_END - ARM_START) * t;
  return out.set(side * Math.cos(a) * ARM_RADIUS, ARM_CENTRE_Y + Math.sin(a) * ARM_RADIUS, 0);
}

/**
 * The anchor, one unit tall, crown at the origin. Six lofted parts, ~2.5k
 * triangles, flat-shaded.
 */
export function createAnchorGeometry() {
  const parts = [];
  // 0 · the shank: octagonal, swelling into a collar under the stock, tapering
  // to the ring; the bottom flares into the crown.
  parts.push(loft(
    (t, o) => o.set(0, 0.05 + t * 0.92, 0),
    (t) => {
      const r = 0.072 - 0.022 * t + 0.026 * Math.exp(-Math.pow((t - 0.84) / 0.035, 2)) +
        0.05 * Math.pow(1 - smooth(0, 0.16, t), 2);
      return [r, r * 0.86];
    },
    40, 8, 0, { capEnd: true, roll: Math.PI / 8 },
  ));
  // 1 · the arms: one swept arc through the crown, thick at the crown and
  // thinning to the palms, diamond-sectioned so the edges read.
  for (const side of [-1, 1]) {
    parts.push(loft(
      (t, o) => armPoint(t, side, o),
      (t) => {
        const r = 0.056 - 0.024 * t;
        return [r * 1.25, r * 0.85];
      },
      22, 6, 1, { roll: 0 },
    ));
    // 2 · the fluke: a barbed spade on the palm, flat and wide, pointing on
    // along the arm's sweep, with a hooked bill at the tip.
    const tip = armPoint(1, side, new Vector3());
    const before = armPoint(0.96, side, new Vector3());
    const dir = tip.clone().sub(before).normalize();
    const out = new Vector3(side, 0, 0);
    parts.push(loft(
      (t, o) => o.copy(tip).addScaledVector(dir, (t - 0.55) * 0.3).addScaledVector(out, -0.035 * Math.sin(t * Math.PI)),
      (t) => {
        // Spade: widest a third of the way, barbs kicking out behind it.
        const w = 0.11 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.62) * (1 - smooth(0.55, 1, t)) +
          0.035 * Math.exp(-Math.pow((t - 0.12) / 0.05, 2));
        return [Math.max(0.006, w), Math.max(0.012, w * 0.22)];
      },
      18, 4, 2, { capStart: true, capEnd: true, roll: 0 },
    ));
  }
  // 3 · the crown spike: bites the floor first.
  parts.push(loft(
    (t, o) => o.set(0, 0.07 - t * 0.14, 0),
    (t) => {
      const r = 0.07 * (1 - t) + 0.003;
      return [r, r];
    },
    6, 8, 3, { capEnd: true, roll: Math.PI / 8 },
  ));
  // 4 · the stock: a bar across the top, perpendicular to the arms, with
  // knobbed ends.
  parts.push(loft(
    (t, o) => o.set(0, 0.83, (t - 0.5) * 0.52),
    (t) => {
      const r = 0.034 + 0.026 * Math.pow(Math.abs(t - 0.5) * 2, 6);
      return [r, r];
    },
    20, 8, 4, { capStart: true, capEnd: true, roll: Math.PI / 8 },
  ));
  // 5 · the ring: a heavy forged loop through the head.
  parts.push(loft(
    (t, o) => {
      const a = -Math.PI / 2 + t * TAU;
      return o.set(Math.cos(a) * 0.075, ANCHOR_RING_Y + Math.sin(a) * 0.075, 0);
    },
    (t) => {
      const r = 0.03 + 0.005 * Math.cos(t * TAU * 2);
      return [r, r];
    },
    28, 7, 5, {},
  ));
  return build(parts);
}

/** Where the flukes are, ±x (unit height). */
export const ANCHOR_FLUKE = { x: Math.cos(ARM_END) * ARM_RADIUS, y: ARM_CENTRE_Y + Math.sin(ARM_END) * ARM_RADIUS };

/**
 * A unit tube along +x for the chain shader: `uv.x` is t along the chain,
 * `uv.y` the angle round it; positions are left in the section plane for the
 * vertex shader to place (x carries t, y/z the unit section).
 */
export function createChainGeometry() {
  const rings = CHAIN_SEGMENTS + 1;
  const position = new Float32Array(rings * CHAIN_SIDES * 3);
  const uv = new Float32Array(rings * CHAIN_SIDES * 2);
  for (let i = 0; i < rings; i++) {
    const t = i / CHAIN_SEGMENTS;
    for (let j = 0; j < CHAIN_SIDES; j++) {
      const a = (j / CHAIN_SIDES) * TAU;
      const k = i * CHAIN_SIDES + j;
      position[k * 3] = t;
      position[k * 3 + 1] = Math.cos(a);
      position[k * 3 + 2] = Math.sin(a);
      uv[k * 2] = t;
      uv[k * 2 + 1] = j / CHAIN_SIDES;
    }
  }
  const index = [];
  for (let i = 0; i < CHAIN_SEGMENTS; i++) {
    for (let j = 0; j < CHAIN_SIDES; j++) {
      const a = i * CHAIN_SIDES + j;
      const b = i * CHAIN_SIDES + ((j + 1) % CHAIN_SIDES);
      const c = a + CHAIN_SIDES;
      const d = b + CHAIN_SIDES;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * The gate carrier: an open cylinder, unit radius and height, base at y = 0,
 * with per-instance `aGate` (x: open 0..1, y: seed, z: rising 0/1, w: fade).
 */
export function createGateGeometry(capacity) {
  const geometry = new CylinderGeometry(1, 1, 1, 28, 18, true);
  geometry.translate(0, 0.5, 0);
  geometry.setAttribute('aGate', new InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  return geometry;
}

/** Unit quad in the xy plane (rotated onto the floor by its mesh). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
