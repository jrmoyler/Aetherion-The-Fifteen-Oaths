import { BufferAttribute, BufferGeometry, InstancedBufferAttribute } from 'three';

/**
 * Procedural geometry for the Umbra Grasp: one "bone" of the shadow hand.
 *
 * The hand is twenty-odd tapered capsules — forearm, metacarpals, phalanges,
 * thumb — laid end to end every frame on the CPU from the live settings. A
 * capsule whose two radii and length were baked into its vertices would need
 * rebuilding every time a slider moved, and a capsule that was simply *scaled*
 * by its instance matrix would squash its end caps into ellipsoids exactly at
 * the knuckles, which is the one place a hand is read.
 *
 * So the mesh stores no metres at all. Every vertex carries a **shape code**:
 *
 *   - `position.xz` — the unit bearing around the bone (cos, sin)
 *   - `aShape.x`    — t, 0 at the root of the bone and 1 at its tip
 *   - `aShape.y`    — h, how far the vertex sits up a hemispherical end cap,
 *                     −1..0 on the root cap, 0 on the shaft, 0..1 on the tip cap
 *   - `aShape.z`    — s, the cap's radial factor (1 on the shaft, → 0 at a pole)
 *
 * and the instance carries `aBone = (rootRadius, tipRadius, length, seed)`. The
 * vertex stage resolves `r = mix(r0, r1, t)` and places the vertex at
 * `(cos·r·s, t·length + h·r, sin·r·s)` — so the caps stay round at any taper
 * and any length, and the knuckle where two bones meet is a true ball.
 *
 * The instance matrix carries only the bone's root position and orientation
 * (+Y along the bone); nothing in it scales.
 */

/**
 * @param {object} [options]
 * @param {number} [options.radial]   vertices around the bone
 * @param {number} [options.rings]    rings along the shaft
 * @param {number} [options.capRings] rings in each hemispherical cap
 * @param {number} [options.maxBones] instance capacity
 */
export function createUmbraBoneGeometry({ radial = 14, rings = 6, capRings = 4, maxBones = 24 } = {}) {
  const columns = radial + 1;
  // Rows: root pole cap rings, shaft rings, tip cap rings. Each pole is a
  // degenerate ring (s = 0) so the index pattern stays one regular grid.
  const rows = capRings + 1 + (rings + 1) + capRings + 1;
  const count = rows * columns;

  const positions = new Float32Array(count * 3);
  const shapes = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);

  let v = 0;
  const pushRow = (t, h, s) => {
    for (let i = 0; i < columns; i++) {
      const a = (i / radial) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      positions[v * 3 + 0] = cx;
      positions[v * 3 + 1] = 0;
      positions[v * 3 + 2] = sz;
      shapes[v * 3 + 0] = t;
      shapes[v * 3 + 1] = h;
      shapes[v * 3 + 2] = s;
      // A rough normal for any code path that wants one before the vertex
      // stage rebuilds the real thing.
      normals[v * 3 + 0] = cx * s;
      normals[v * 3 + 1] = h;
      normals[v * 3 + 2] = sz * s;
      v++;
    }
  };

  // Root cap: from the pole (h = −1) up to the shaft (h = 0).
  for (let k = 0; k <= capRings; k++) {
    const phi = (k / (capRings + 1)) * Math.PI * 0.5;
    pushRow(0, -Math.cos(phi), Math.sin(phi));
  }
  // Shaft.
  for (let k = 0; k <= rings; k++) pushRow(k / rings, 0, 1);
  // Tip cap: from the shaft up to the pole (h = +1).
  for (let k = 1; k <= capRings + 1; k++) {
    const phi = (k / (capRings + 1)) * Math.PI * 0.5;
    pushRow(1, Math.sin(phi), Math.cos(phi));
  }

  const indices = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let i = 0; i < radial; i++) {
      const a = row * columns + i;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      // Wound so the faces point outward (cross(c - a, b - a) is radial).
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('aShape', new BufferAttribute(shapes, 3));
  geometry.setIndex(indices);

  // (rootRadius, tipRadius, length, seed) per bone — rewritten every frame.
  const bones = new InstancedBufferAttribute(new Float32Array(maxBones * 4), 4);
  geometry.setAttribute('aBone', bones);
  return geometry;
}
