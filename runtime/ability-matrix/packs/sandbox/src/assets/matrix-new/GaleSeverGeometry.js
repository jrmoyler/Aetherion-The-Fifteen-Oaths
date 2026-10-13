import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * The air blade, in *parameter space*.
 *
 * A flat strip whose vertices are not positions: `position.x` is the bearing
 * across the crescent, -1 at one tip and +1 at the other, and `position.y` is
 * the 0..1 fraction of the way from the cutting edge (0) to the back of the
 * body (1). The blade material turns that into metres in its vertex stage —
 * the arc, the swept-back tips, the bow, the roll, the flutter of the trailing
 * body — so every dimension of the blade is a uniform and the mesh is built
 * exactly once. The distortion proxy draws the *same* strip with a different
 * depth range (a bow wave ahead of the edge, a wake behind it), which is why
 * it is a separate function of the same two numbers.
 *
 * Rows are crowded toward the edge (`v = s^1.8`). The cutting line is a few
 * centimetres wide and carries all of the blade's brightness; the back of the
 * body is a soft fade that four rows describe perfectly well.
 *
 * Never culled: the bounding volume of a parameter-space mesh means nothing.
 *
 * @param {number} [columns] segments tip to tip
 * @param {number} [rows]    segments edge to back
 */
export function createGaleBladeGeometry(columns = 72, rows = 12) {
  const cols = columns + 1;
  const rowCount = rows + 1;

  const positions = new Float32Array(cols * rowCount * 3);
  const uvs = new Float32Array(cols * rowCount * 2);
  const indices = new Uint16Array(columns * rows * 6);

  let p = 0;
  let t = 0;
  for (let j = 0; j < rowCount; j++) {
    const v = Math.pow(j / rows, 1.8);
    for (let i = 0; i < cols; i++) {
      const u = (i / columns) * 2 - 1;
      positions[p++] = u;
      positions[p++] = v;
      positions[p++] = 0;
      uvs[t++] = i / columns;
      uvs[t++] = v;
    }
  }

  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
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

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 50);
  return geometry;
}
