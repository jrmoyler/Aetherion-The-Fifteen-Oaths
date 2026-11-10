import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Glissando Sweep's own solids, authored in code (cast-local; the generated
 * `GlissandoSweepGeometry.js` is pinned by the rig tests and is not touched).
 *
 * The instrument the sound comes from is a rank of organ pipes standing on a
 * wind chest:
 *   - **pipe**: a flue pipe lathed from a profile — a pointed toe, the conical
 *     foot, a raised languid band, the long body, a flattened mouth cut into
 *     the front just above the band, a rolled rim at the top and the open bore
 *     inside it. Unit body radius 1, height 1, standing on y = 0, mouth facing
 *     local +Z. The ability scales each instance (radius, length) so the rank
 *     runs from long low pipes to short high ones.
 *   - **chest**: the wind chest, a bevelled box with a moulded top and a front
 *     seam, x ∈ [-0.5, 0.5], y ∈ [0, 1], z ∈ [-0.5, 0.5].
 *
 * `aKind` per vertex: 0 cast bronze, 1 the mouth (dark slit that lights up
 * when the pipe speaks), 2 polished bronze (languid band, rim, mouldings),
 * 3 the dark inside of the bore.
 */

const SEGMENTS = 28;
const MOUTH_HALF = 0.5; // radians either side of +Z the mouth is cut
const MOUTH_LO = 0.185;
const MOUTH_HI = 0.29;

/** [y, radius, kind] — read bottom to top, then down into the bore. */
function pipeProfile() {
  const rows = [
    [0.0, 0.34, 0],
    [0.05, 0.46, 0],
    [0.1, 0.64, 0],
    [0.145, 0.84, 0],
    [0.15, 1.08, 2],
    [0.172, 1.08, 2],
    [0.178, 1.0, 0]
  ];
  for (let y = 0.19; y < 0.3; y += 0.02) rows.push([y, 1.0, 0]);
  for (let y = 0.31; y < 0.95; y += 0.04) rows.push([y, 1.0, 0]);
  rows.push([0.95, 1.0, 0], [0.955, 1.08, 2], [0.995, 1.08, 2], [1.0, 0.98, 2], [1.0, 0.88, 3], [0.86, 0.88, 3]);
  return rows;
}

export function createGlissandoSweepPipeGeometry() {
  const rows = pipeProfile();
  const cols = SEGMENTS + 1;
  const pos = [];
  const kind = [];
  const index = [];
  const mouthCos = Math.cos(MOUTH_HALF);
  for (let r = 0; r < rows.length; r++) {
    const [y, radius, k] = rows[r];
    for (let s = 0; s < cols; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      const sx = Math.sin(a);
      const cz = Math.cos(a);
      let rr = radius;
      let kk = k;
      // The mouth: the front of the body is pressed flat between the lips.
      if (k === 0 && y >= MOUTH_LO && y <= MOUTH_HI && cz > mouthCos) {
        rr = Math.min(rr, mouthCos / Math.max(cz, 1e-3));
        rr *= 0.92;
        kk = 1;
      }
      pos.push(sx * rr, y, cz * rr);
      kind.push(kk);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const a = r * cols + s;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aKind', new Float32BufferAttribute(kind, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The wind chest the pipes stand on: a bevelled, moulded box. */
export function createGlissandoSweepChestGeometry() {
  const pos = [];
  const kind = [];
  const tri = (a, b, c, k) => {
    pos.push(...a, ...b, ...c);
    kind.push(k, k, k);
  };
  const quad = (a, b, c, d, k) => {
    tri(a, b, c, k);
    tri(a, c, d, k);
  };
  /** A box from (x0,y0,z0) to (x1,y1,z1) with a bevel `b` on its four vertical edges. */
  const box = (x0, y0, z0, x1, y1, z1, b, k) => {
    const ring = [
      [x0 + b, z1],
      [x1 - b, z1],
      [x1, z1 - b],
      [x1, z0 + b],
      [x1 - b, z0],
      [x0 + b, z0],
      [x0, z0 + b],
      [x0, z1 - b]
    ];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % n];
      quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], k);
      tri([0.5 * (x0 + x1), y1, 0.5 * (z0 + z1)], [ax, y1, az], [bx, y1, bz], k);
      tri([0.5 * (x0 + x1), y0, 0.5 * (z0 + z1)], [bx, y0, bz], [ax, y0, az], k);
    }
  };
  // The plinth, the body of the chest, a front seam, the moulded top.
  box(-0.5, 0.0, -0.5, 0.5, 0.12, 0.5, 0.03, 0);
  box(-0.48, 0.12, -0.44, 0.48, 0.52, 0.44, 0.04, 0);
  box(-0.47, 0.52, -0.45, 0.47, 0.56, 0.45, 0.03, 1);
  box(-0.48, 0.56, -0.44, 0.48, 0.86, 0.44, 0.04, 0);
  box(-0.51, 0.86, -0.5, 0.51, 0.9, 0.5, 0.05, 2);
  box(-0.5, 0.9, -0.49, 0.5, 1.0, 0.49, 0.05, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aKind', new Float32BufferAttribute(kind, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
