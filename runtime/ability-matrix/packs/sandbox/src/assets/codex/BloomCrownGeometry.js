import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, Sphere, Vector3 } from 'three';

/**
 * Bloom Crown — the procedural meshes the crown is drawn with.
 *
 * Both deforming meshes are built once in *parameter space*; their vertices
 * are coordinates the vertex stage turns into metres from uniforms and
 * per-instance data, so every petal's length, cup and curl and the garland's
 * sag are live sliders and nothing is rebuilt.
 */

/**
 * One petal: a strip, `position.x` = `s` (0 at the blossom's heart, 1 at the
 * tip) and `position.y` = `u` (−1..1 across). The petal material curls it
 * open in the vertex stage; the instance matrix seats it on its blossom.
 *
 * Carries the per-instance `aPetal` (open, seed, charge, layer), dynamic.
 *
 * @param {number} maxInstances
 * @param {number} [rows]  segments base → tip
 * @param {number} [cols]  segments across
 */
export function createBloomPetalGeometry(maxInstances, rows = 12, cols = 6) {
  const rc = rows + 1;
  const cc = cols + 1;
  const positions = new Float32Array(rc * cc * 3);
  const indices = new Uint16Array(rows * cols * 6);
  let p = 0;
  for (let j = 0; j < rc; j++) {
    const s = Math.pow(j / rows, 0.85);
    for (let i = 0; i < cc; i++) {
      positions[p++] = s;
      positions[p++] = (i / cols) * 2 - 1;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * cc + i;
      const b = a + 1;
      const c = a + cc;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const petal = new InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
  petal.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aPetal', petal);
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The garland: a closed tube round the crown. `position.x` is 0..1 round the
 * ring, `position.y` 0..1 round the tube. The garland material hangs it
 * between the blossoms in the vertex stage.
 */
export function createBloomGarlandGeometry(segments = 220, sides = 7) {
  const cols = sides + 1;
  const rows = segments + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * segments * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / segments;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < segments; j++) {
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
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A unit quad, ±1 in XY, never culled. */
export function createBloomQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
