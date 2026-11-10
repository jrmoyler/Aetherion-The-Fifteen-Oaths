import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
} from 'three';

/**
 * Combustion Debt — procedural geometry.
 *
 *  - **the coil** (`createCoilGeometry` + `writeCoil`) — the hero: one forged
 *    iron tube wound as a conical dome-spring. The buffers are allocated once
 *    per pooled instance and *rewritten in place* every frame from the live
 *    settings (radius, turns, height, compression, wind, whip, rise, sink), so
 *    the spring can be wound, released and sunk without a single allocation
 *    and every slider moves it on the next frame. Writing the positions on the
 *    CPU (≈3k vertices) rather than in a vertex shader is deliberate: the
 *    coil is solid iron on `LAYER.WORLD`, and the depth prepass and the shadow
 *    map both rasterise the real buffer, so it occludes and shadows correctly
 *    at every stage of its motion.
 *    `aCoil` carries (s along the coil 0..1, φ round the tube 0..1) for the
 *    heat shader.
 *  - **the plume** (`createPlumeGeometry`) — a lathed combustion column: a
 *    flared foot, a pinched neck, a swollen body and a mushroom cap, unit
 *    height and radius; the shader turbulates it.
 *  - **the slug** (`createSlugGeometry`) — a lathed molten teardrop.
 *  - **the brands** (`createBrandGeometry`) — an instanced floor quad with a
 *    per-instance stack count.
 */

const TAU = Math.PI * 2;

/** Segments along the coil and round its tube. */
export const COIL_SEGMENTS = 320;
export const COIL_RADIAL = 10;

/**
 * Allocate the coil's buffers (positions/normals rewritten by `writeCoil`).
 * @returns {BufferGeometry}
 */
export function createCoilGeometry(segments = COIL_SEGMENTS, radial = COIL_RADIAL) {
  const rings = segments + 1;
  const ringVerts = radial + 1; // duplicated seam for a clean φ
  const count = rings * ringVerts;
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
  const normal = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
  const coil = new Float32Array(count * 2);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < ringVerts; j++) {
      const k = i * ringVerts + j;
      coil[k * 2] = i / segments;
      coil[k * 2 + 1] = j / radial;
    }
  }
  const index = new (count > 65535 ? Uint32Array : Uint16Array)(segments * radial * 6);
  let n = 0;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ringVerts + j;
      const b = a + ringVerts;
      // Wound so the front face looks out of the tube (T × φ̂ points inward).
      index[n++] = a; index[n++] = a + 1; index[n++] = b;
      index[n++] = b; index[n++] = a + 1; index[n++] = b + 1;
    }
  }
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('aCoil', new BufferAttribute(coil, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.userData.segments = segments;
  geometry.userData.radial = radial;
  // Scratch for the centreline, owned by this geometry — never reallocated.
  geometry.userData.centers = new Float32Array(rings * 3);
  return geometry;
}

/**
 * The coil's centreline at `s` (0 = outer end, buried in the floor;
 * 1 = the tip over the centre). Local space, metres.
 *
 * @param {object} k { rOuter, rInner, height, turns, profile, thick, spin, yOffset, whipX, whipZ }
 * @param {number} s
 * @param {{x:number,y:number,z:number}} out
 */
export function coilPoint(k, s, out) {
  const theta = s * k.turns * TAU + k.spin;
  const rho = k.rInner + (k.rOuter - k.rInner) * Math.pow(1 - s, 0.92);
  // A dome, not a cone: steep at the floor, flattening toward the tip.
  const dome = 1 - Math.pow(1 - s, k.profile);
  // The outer end dives into the floor so it reads as anchored.
  const anchor = s < 0.05 ? (1 - s / 0.05) * (1 - s / 0.05) * k.thick * 2.4 : 0;
  const whip = s * s;
  out.x = Math.cos(theta) * rho + k.whipX * whip;
  out.y = k.yOffset + k.thick * 0.9 + k.height * dome - anchor;
  out.z = Math.sin(theta) * rho + k.whipZ * whip;
  return out;
}

/** Tube radius at `s`: forged beads, and the tip drawn to a point. */
function tubeRadius(k, s) {
  const bead = Math.pow(Math.abs(Math.sin(s * k.beadFreq * Math.PI)), 6);
  const tip = s > 0.93 ? Math.sqrt(Math.max(0, 1 - (s - 0.93) / 0.07)) : 1;
  return k.thick * (1 + k.beadDepth * bead) * tip;
}

const _p = { x: 0, y: 0, z: 0 };

/**
 * Rewrite the coil's positions and normals in place.
 * @param {BufferGeometry} geometry from `createCoilGeometry`
 * @param {object} k the shape (see `coilPoint`) plus { beadFreq, beadDepth }
 */
export function writeCoil(geometry, k) {
  const { segments, radial, centers } = geometry.userData;
  const ringVerts = radial + 1;
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  for (let i = 0; i <= segments; i++) {
    coilPoint(k, i / segments, _p);
    centers[i * 3] = _p.x; centers[i * 3 + 1] = _p.y; centers[i * 3 + 2] = _p.z;
  }
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    const a = Math.max(0, i - 1) * 3;
    const b = Math.min(segments, i + 1) * 3;
    // Tangent by central differences.
    let tx = centers[b] - centers[a], ty = centers[b + 1] - centers[a + 1], tz = centers[b + 2] - centers[a + 2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const cx = centers[i * 3], cy = centers[i * 3 + 1], cz = centers[i * 3 + 2];
    // Reference: horizontal outward radial; binormal = T × R; normal = B × T.
    let rx = cx, rz = cz;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    // B = T × R with R = (rx, 0, rz).
    let bx = ty * rz, by = tz * rx - tx * rz, bz = -ty * rx;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    const nx = by * tz - bz * ty, ny = bz * tx - bx * tz, nz = bx * ty - by * tx;
    const r = tubeRadius(k, s);
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * TAU;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const ox = nx * cp + bx * sp, oy = ny * cp + by * sp, oz = nz * cp + bz * sp;
      const v = (i * ringVerts + j) * 3;
      pos[v] = cx + ox * r; pos[v + 1] = cy + oy * r; pos[v + 2] = cz + oz * r;
      nor[v] = ox; nor[v + 1] = oy; nor[v + 2] = oz;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
}

/** Bounding volume generous enough for every pose (the coil is never culled wrongly). */
export function coilBoundsRadius(k) {
  return Math.max(k.rOuter, k.height) * 2 + Math.hypot(k.whipX, k.whipZ) + 1;
}

/** The lathed combustion column, unit height (y 0..1), unit max radius. */
export function createPlumeGeometry() {
  const profile = [
    [0.0, 0.0], [0.62, 0.0], [0.7, 0.03], [0.52, 0.1], [0.36, 0.2], [0.31, 0.3],
    [0.36, 0.42], [0.44, 0.55], [0.5, 0.66], [0.72, 0.76], [1.0, 0.84], [0.96, 0.9],
    [0.78, 0.95], [0.46, 0.99], [0.0, 1.0],
  ];
  const points = profile.map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(points, 40);
}

/** The molten slug — a teardrop, tail along −y, unit height. */
export function createSlugGeometry() {
  const points = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14; // 0 = tail tip, 1 = nose
    const r = Math.sin(Math.PI * Math.pow(t, 0.6)) * (0.2 + 0.3 * t);
    points.push(new Vector2(Math.max(0, r), t - 0.65));
  }
  return new LatheGeometry(points, 18);
}

/** A unit floor quad (XY plane; rotate onto the floor). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}

/** Brand quad with a per-instance stack count attribute. */
export function createBrandGeometry(max) {
  const geometry = new PlaneGeometry(2, 2, 1, 1);
  const stacks = new InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(DynamicDrawUsage);
  geometry.setAttribute('aStack', stacks);
  return geometry;
}
