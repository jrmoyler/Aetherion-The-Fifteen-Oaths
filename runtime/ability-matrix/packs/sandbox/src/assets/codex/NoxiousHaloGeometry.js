import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Noxious Halo — the procedural meshes the noose is drawn with.
 *
 * One parameter grid serves all three standing shapes: the torus (x round the
 * ring, y round the tube), the curtain (x round, y up) and — flat — nothing
 * else needs more than a quad. The vertex stages turn these into metres from
 * uniforms, so the halo tightens with no rebuild.
 */

/**
 * A wrapped grid, `x` 0..1 (`columns` segments) by `y` 0..1 (`rows`).
 */
export function createHaloGridGeometry(columns = 128, rows = 16) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint32Array(columns * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / columns;
      positions[p++] = j / rows;
      positions[p++] = 0;
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
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A unit quad, ±1 in XY — the floor and the pop ring lay it flat. */
export function createHaloQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
