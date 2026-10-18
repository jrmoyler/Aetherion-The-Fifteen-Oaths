import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Arterial Whip — the procedural meshes the whip is drawn with.
 *
 * All in *parameter space*: the vertex stage turns these coordinates into
 * metres from uniforms, so the vessel's length, its segments, its pulse and its
 * arc over the caster's head are live sliders and nothing is ever rebuilt.
 * Never culled — the bounding volume of a parameter-space mesh means nothing.
 */

/**
 * The vessel: a tube grid. `position.x` is `s`, 0 at the hand and 1 at the
 * tip; `position.y` the 0..1 angle round it. Many rings, because the vessel is
 * beaded into segments every few tens of centimetres and each bead needs
 * enough rings to read round, not faceted.
 */
export function createVesselGeometry(rings = 220, sides = 14) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * rings * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const s = j / rings;
    for (let i = 0; i < cols; i++) {
      positions[p++] = s;
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
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * A long strip in parameter space: `position.x` 0..1 along, `position.y` -1..1
 * across. The splatter lays it on the floor down the line.
 */
export function createSplatterStripGeometry(columns = 96, rows = 4) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    const v = (j / rows) * 2 - 1;
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / columns;
      positions[p++] = v;
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

/** A unit quad, ±1 in XY. */
export function createVesselQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
