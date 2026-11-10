import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Comet Harpoon — procedural meshes.
 *
 *  - **the harpoon** is the one real model: built here once in object space,
 *    tip at the origin pointing down +Z, shaft running back along −Z, so the
 *    ability only has to place and turn it. A four-bladed broadhead, two
 *    swept-back barbs, a banded shaft and an eye at the butt for the tether.
 *    `aPart` tags each vertex (0 shaft · 1 head · 2 barb · 3 eye) and `aAlong`
 *    carries its distance back from the tip, so the shader can light the head
 *    hot and dissolve it butt-first without knowing anything else.
 *  - everything else (tails, tether, petals, crater) is a parameter-space
 *    grid the vertex stage bends from uniforms.
 */

const HUGE = new Sphere(new Vector3(), 1e4);

/**
 * The harpoon. Dimensions are baked (they are the *model*); the ability
 * scales the whole mesh with `harpoonScale`.
 *
 * @param {object} [o]
 * @param {number} [o.shaftLength]  metres, butt to the base of the head
 * @param {number} [o.shaftRadius]
 * @param {number} [o.headLength]
 * @param {number} [o.headWidth]
 */
export function createHarpoonGeometry({ shaftLength = 2.1, shaftRadius = 0.035, headLength = 0.5, headWidth = 0.17 } = {}) {
  const pos = [];
  const part = [];
  const along = [];

  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, p) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    part.push(p, p, p);
    along.push(-az, -bz, -cz);
  };

  /* the shaft: a 12-sided tube with three raised bands */
  const sides = 12;
  const z0 = -headLength * 0.85;
  const z1 = z0 - shaftLength;
  const rings = [];
  const steps = 18;
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const z = z0 + (z1 - z0) * t;
    // Bands at a quarter, half and three-quarters of the shaft.
    const band = Math.max(0, 1 - Math.abs(((t * 4) % 1) - 0.5) * 12) * (t > 0.1 && t < 0.9 ? 1 : 0);
    rings.push({ z, r: shaftRadius * (1 + 0.45 * band) * (j === 0 ? 1.3 : 1) });
  }
  for (let j = 0; j < steps; j++) {
    const A = rings[j];
    const B = rings[j + 1];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const ax = Math.cos(a0);
      const ay = Math.sin(a0);
      const bx = Math.cos(a1);
      const by = Math.sin(a1);
      tri(ax * A.r, ay * A.r, A.z, ax * B.r, ay * B.r, B.z, bx * A.r, by * A.r, A.z, 0);
      tri(bx * A.r, by * A.r, A.z, ax * B.r, ay * B.r, B.z, bx * B.r, by * B.r, B.z, 0);
    }
  }

  /* the broadhead: four diamond blades round the axis, each a thin wedge */
  const hl = headLength;
  const hw = headWidth;
  const th = 0.012;
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    // Perpendicular, for the wedge's thickness.
    const px = -uy * th;
    const py = ux * th;
    const wx = ux * hw;
    const wy = uy * hw;
    const zw = -hl * 0.55; // widest point
    const zb = -hl; // base, where it meets the shaft collar
    // two faces of the wedge, tip → wide → base, edge at (wx, wy)
    tri(0, 0, 0, wx, wy, zw, px, py, zw * 0.6, 1);
    tri(px, py, zw * 0.6, wx, wy, zw, px, py, zb, 1);
    tri(0, 0, 0, -px, -py, zw * 0.6, wx, wy, zw, 1);
    tri(-px, -py, zw * 0.6, -px, -py, zb, wx, wy, zw, 1);
  }

  /* the barbs: two swept-back hooks below the head */
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? 1 : -1;
    const zb = -hl * 0.95;
    const r = shaftRadius * 1.2;
    tri(0, s * r, zb, 0, s * hw * 1.25, zb - 0.32, 0.012, s * r, zb - 0.16, 2);
    tri(0, s * r, zb, -0.012, s * r, zb - 0.16, 0, s * hw * 1.25, zb - 0.32, 2);
    tri(0.012, s * r, zb - 0.16, 0, s * hw * 1.25, zb - 0.32, -0.012, s * r, zb - 0.16, 2);
  }

  /* the eye at the butt: a small ring the tether is tied through */
  const eyeR = 0.075;
  const eyeT = 0.016;
  const ez = z1 - eyeR;
  const eyeSeg = 16;
  const eyeSides = 6;
  for (let i = 0; i < eyeSeg; i++) {
    const a0 = (i / eyeSeg) * Math.PI * 2;
    const a1 = ((i + 1) / eyeSeg) * Math.PI * 2;
    for (let j = 0; j < eyeSides; j++) {
      const b0 = (j / eyeSides) * Math.PI * 2;
      const b1 = ((j + 1) / eyeSides) * Math.PI * 2;
      const P = (a, b) => {
        const rr = eyeR + eyeT * Math.cos(b);
        // the ring stands in the YZ plane
        return [eyeT * Math.sin(b), Math.cos(a) * rr, ez + Math.sin(a) * rr];
      };
      const p00 = P(a0, b0);
      const p10 = P(a1, b0);
      const p01 = P(a0, b1);
      const p11 = P(a1, b1);
      tri(...p00, ...p10, ...p01, 3);
      tri(...p10, ...p11, ...p01, 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new Sphere(new Vector3(0, 0, -1.2), 2.5);
  return geometry;
}

/** Metres from the tip to the centre of the eye, for the default harpoon. */
export const HARPOON_BUTT = 0.5 * 0.85 + 2.1 + 0.075;

/**
 * A grid: `position.x` 0..1 over `cols`, `position.y` `y0..y1` over `rows`,
 * `position.z` an instance index 0..count-1 (each instance its own block).
 */
export function createCometGrid(cols, rows, y0 = 0, y1 = 1, count = 1) {
  const cx = cols + 1;
  const cy = rows + 1;
  const per = cx * cy;
  const positions = new Float32Array(per * count * 3);
  const indices = new Uint16Array(cols * rows * 6 * count);
  let p = 0;
  let k = 0;
  for (let n = 0; n < count; n++) {
    for (let j = 0; j < cy; j++) {
      const y = y0 + (y1 - y0) * (j / rows);
      for (let i = 0; i < cx; i++) {
        positions[p++] = i / cols;
        positions[p++] = y;
        positions[p++] = n;
      }
    }
    const base = n * per;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * cx + i;
        const b = a + 1;
        const c = a + cx;
        const d = c + 1;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}

/** A unit quad, ±1 in XY. */
export function createCometQuad() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}

/* -------------------------------------------------------------------- */
/* The nucleus and the ice blades (the solid comet ice)                 */
/* -------------------------------------------------------------------- */

/** Deterministic lattice noise for baking shapes (no Math.random). */
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1;
    const dy = (k >> 1) & 1;
    const dz = (k >> 2) & 1;
    const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    v += w * hash3(ix + dx, iy + dy, iz + dz);
  }
  return v * 2 - 1;
}

/**
 * The comet's nucleus: a lumpy, faceted ball of dirty ice, mean radius 1,
 * elongated along +Z (the flight axis) like a real comet nucleus, pocked
 * with a few craters. Flat-shaded (non-indexed) so the facets catch the sun.
 * `aRough` carries the per-vertex crater depth for the shader.
 */
export function createCometNucleusGeometry(detail = 3) {
  // Icosahedron, subdivided.
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  for (let d = 0; d < detail; d++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (cache.has(key)) return cache.get(key);
      const va = verts[a];
      const vb = verts[b];
      const m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
      const l = Math.hypot(m[0], m[1], m[2]);
      verts.push([m[0] / l, m[1] / l, m[2] / l]);
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  // A few craters, fixed directions.
  const craters = [];
  for (let i = 0; i < 7; i++) {
    const u = hash3(i, 1.3, 7.1) * 2 - 1;
    const a = hash3(i, 5.7, 2.2) * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    craters.push({ d: [s * Math.cos(a), u, s * Math.sin(a)], r: 0.25 + 0.25 * hash3(i, 9.1, 3.3) });
  }
  const shaped = verts.map((v) => {
    let r = 1 + 0.22 * vnoise(v[0] * 1.6 + 3, v[1] * 1.6, v[2] * 1.6) + 0.07 * vnoise(v[0] * 5, v[1] * 5 + 1, v[2] * 5);
    let pit = 0;
    for (const c of craters) {
      const dot = v[0] * c.d[0] + v[1] * c.d[1] + v[2] * c.d[2];
      const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
      const k = ang / c.r;
      if (k < 1.2) {
        const bowl = k < 1 ? -(1 - k * k) * 0.14 : 0;
        const lip = Math.exp(-Math.pow((k - 1) / 0.15, 2)) * 0.04;
        r += bowl + lip;
        pit = Math.max(pit, k < 1 ? 1 - k : 0);
      }
    }
    return { p: [v[0] * r * 0.9, v[1] * r * 0.85, v[2] * r * 1.25], pit };
  });
  const pos = new Float32Array(faces.length * 9);
  const rough = new Float32Array(faces.length * 3);
  let p = 0;
  let q = 0;
  for (const f of faces) {
    for (const i of f) {
      const s = shaped[i];
      pos[p++] = s.p[0];
      pos[p++] = s.p[1];
      pos[p++] = s.p[2];
      rough[q++] = s.pit;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aRough', new BufferAttribute(rough, 1));
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(rough.length), 1));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new Sphere(new Vector3(), 1.6);
  return geometry;
}

/**
 * One ice blade of the lotus: a faceted, diamond-section spike, base at the
 * origin, rising +Y to the tip at y = 1, curving out toward +X near the tip,
 * widest a third of the way up. Unit length and unit half-width (X/Z are
 * scaled by the instance matrix). `aAlong` 0 base → 1 tip.
 */
export function createIceBladeGeometry(steps = 10) {
  const ring = [];
  for (let j = 0; j <= steps; j++) {
    const s = j / steps;
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(s, 0.75))), 0.8) * (1 - s * 0.15) + (s === 0 ? 0.35 : 0);
    const bend = 0.28 * s * s;
    const y = s;
    // Diamond section: wide across (Z), thick out (X), a keel on the outside.
    ring.push([
      [bend + 0.32 * w, y, 0],
      [bend, y, 0.9 * w],
      [bend - 0.22 * w, y, 0],
      [bend, y, -0.9 * w]
    ]);
  }
  const pos = [];
  const along = [];
  const push = (v, s) => {
    pos.push(v[0], v[1], v[2]);
    along.push(s);
  };
  for (let j = 0; j < steps; j++) {
    const A = ring[j];
    const B = ring[j + 1];
    const sa = j / steps;
    const sb = (j + 1) / steps;
    for (let i = 0; i < 4; i++) {
      const i1 = (i + 1) % 4;
      push(A[i], sa);
      push(A[i1], sa);
      push(B[i], sb);
      push(A[i1], sa);
      push(B[i1], sb);
      push(B[i], sb);
    }
  }
  // Base cap.
  const b = ring[0];
  push(b[0], 0); push(b[2], 0); push(b[1], 0);
  push(b[0], 0); push(b[3], 0); push(b[2], 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  geometry.setAttribute('aRough', new BufferAttribute(new Float32Array(along.length), 1));
  geometry.computeVertexNormals();
  geometry.boundingSphere = HUGE;
  return geometry;
}
