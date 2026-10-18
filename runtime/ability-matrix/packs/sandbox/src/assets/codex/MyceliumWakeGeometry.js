import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3
} from 'three';

/**
 * Mycelium Wake — the procedural meshes.
 *
 *  - **the hyphae** are a parameter-space tube, instanced once per cord: the
 *    vertex stage lays each one along the line, half sunk in the floor, from
 *    its own dice (lane, wander seed, the stretch of line it spans, how far it
 *    drifts sideways), so cords and their side branches are one draw call and
 *    every dimension is a slider.
 *  - **the fruiting bodies** are real geometry, rigid, placed per instance —
 *    so they can stand on `LAYER.WORLD` and cast a shadow.
 */

/**
 * The cords: `position.x` = `s` 0..1 along, `position.y` 0..1 round.
 *
 * Per instance (static, written at spawn): `aCord` = lane (m), seed,
 * start (share of the line), end (share of the line); `aCord2` = sideways
 * drift (m) by the end, radius (×), grow-rate (×), kind (0 cord, 1 branch).
 */
export function createHyphaeGeometry(maxInstances, rings = 140, sides = 6) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * rings * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / rings;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setAttribute('aCord', new InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4));
  geometry.setAttribute('aCord2', new InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * One fruiting body — a cordyceps-like stroma, base at the origin, height 1.
 *
 * A slender, slightly sinuous stalk swelling into an elongated club, with two
 * thin forks off it carrying clubs of their own, like a stag's horn. Each part
 * is a lathe round its own bent axis.
 *
 * Attributes: `aT` 0 at the foot → 1 at the top of the main club (the forks
 * carry their own height), `aPart` 0 stalk, 1 club.
 */
export function createStromaGeometry() {
  const pos = [];
  const nrm = [];
  const at = [];
  const part = [];
  const idx = [];
  const sides = 9;

  /**
   * A lathe along a quadratic path from `a` to `c` bowing through `b`, radius
   * from `radius(t)`; `club(t)` tells which rings are the fertile head.
   */
  const limb = (a, b, c, rings, radius, club, t0, t1) => {
    const first = pos.length / 3;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const u = 1 - t;
      const px = u * u * a[0] + 2 * u * t * b[0] + t * t * c[0];
      const py = u * u * a[1] + 2 * u * t * b[1] + t * t * c[1];
      const pz = u * u * a[2] + 2 * u * t * b[2] + t * t * c[2];
      // Tangent, and a frame round it.
      let tx = 2 * u * (b[0] - a[0]) + 2 * t * (c[0] - b[0]);
      let ty = 2 * u * (b[1] - a[1]) + 2 * t * (c[1] - b[1]);
      let tz = 2 * u * (b[2] - a[2]) + 2 * t * (c[2] - b[2]);
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // n1 = normalize(t × X), n2 = t × n1
      let n1x = 0;
      let n1y = tz;
      let n1z = -ty;
      const nl = Math.hypot(n1x, n1y, n1z) || 1;
      n1x /= nl;
      n1y /= nl;
      n1z /= nl;
      const n2x = ty * n1z - tz * n1y;
      const n2y = tz * n1x - tx * n1z;
      const n2z = tx * n1y - ty * n1x;
      const r = radius(t);
      const isClub = club(t);
      for (let i = 0; i <= sides; i++) {
        const ang = (i / sides) * Math.PI * 2;
        const cx = Math.cos(ang);
        const sx = Math.sin(ang);
        const nx = n1x * cx + n2x * sx;
        const ny = n1y * cx + n2y * sx;
        const nz = n1z * cx + n2z * sx;
        pos.push(px + nx * r, py + ny * r, pz + nz * r);
        nrm.push(nx, ny, nz);
        at.push(t0 + (t1 - t0) * t);
        part.push(isClub);
      }
    }
    const cols = sides + 1;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sides; i++) {
        const q = first + j * cols + i;
        idx.push(q, q + cols, q + 1, q + 1, q + cols, q + cols + 1);
      }
    }
    // A rounded cap: one vertex just past the end.
    const cap = pos.length / 3;
    pos.push(c[0] + (c[0] - b[0]) * 0.02, c[1] + 0.012, c[2] + (c[2] - b[2]) * 0.02);
    nrm.push(0, 1, 0);
    at.push(t1);
    part.push(club(1));
    const last = first + rings * cols;
    for (let i = 0; i < sides; i++) idx.push(last + i, last + i + 1, cap);
  };

  // The main stroma: stalk swelling to a long club over its top third.
  limb(
    [0, -0.05, 0],
    [0.06, 0.5, -0.03],
    [-0.02, 1, 0.02],
    26,
    (t) => {
      const stalk = 0.034 * (1 - 0.25 * t);
      const head = 0.07 * Math.sin(Math.min(1, Math.max(0, (t - 0.62) / 0.38)) * Math.PI * 0.9 + 0.12);
      return t < 0.6 ? stalk : Math.max(stalk, head);
    },
    (t) => (t > 0.62 ? 1 : 0),
    0,
    1
  );
  // Two forks, like antler tines.
  limb(
    [0.03, 0.45, -0.015],
    [0.13, 0.55, -0.02],
    [0.17, 0.74, 0.0],
    12,
    (t) => (t < 0.5 ? 0.018 : 0.018 + 0.026 * Math.sin(((t - 0.5) / 0.5) * Math.PI * 0.85)),
    (t) => (t > 0.5 ? 1 : 0),
    0.45,
    0.74
  );
  limb(
    [0.02, 0.62, 0.0],
    [-0.09, 0.7, 0.07],
    [-0.12, 0.86, 0.1],
    12,
    (t) => (t < 0.5 ? 0.016 : 0.016 + 0.024 * Math.sin(((t - 0.5) / 0.5) * Math.PI * 0.85)),
    (t) => (t > 0.5 ? 1 : 0),
    0.62,
    0.86
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  geometry.setAttribute('aT', new BufferAttribute(new Float32Array(at), 1));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  return geometry;
}
