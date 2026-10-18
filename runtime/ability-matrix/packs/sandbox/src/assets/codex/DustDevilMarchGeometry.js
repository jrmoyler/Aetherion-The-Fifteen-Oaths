import { BufferAttribute, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Dust Devil March — the funnel mesh.
 *
 * One open tube in *parameter space*, instanced twice per devil (a dense core
 * and a thin outer shell): `position.x` is 0..1 round, `position.y` is `s`,
 * 0 at the floor and 1 at the crown. The funnel material raises, widens,
 * leans, wobbles and twists it in the vertex stage, so a devil's whole shape
 * is uniforms and per-instance data, and nothing is rebuilt.
 *
 * Per instance (dynamic, written every frame):
 *   - `aDevil`  — x, z, seed, shell (0 core, 1 outer)
 *   - `aDevil2` — height (m), radius (×), spin phase (rad), opacity
 *   - `aDevil3` — lean x, lean z (m of lean per m of height), collapse, unused
 *
 * Rows are crowded toward the floor, where the skirt flares and the column is
 * thinnest and fastest.
 */
export function createFunnelGeometry(maxInstances, sides = 28, rows = 44) {
  const cols = sides + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(sides * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    const s = Math.pow(j / rows, 1.35);
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / sides;
      positions[p++] = s;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  for (const name of ['aDevil', 'aDevil2', 'aDevil3']) {
    const attr = new InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
    attr.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attr);
  }
  geometry.instanceCount = 0;
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
