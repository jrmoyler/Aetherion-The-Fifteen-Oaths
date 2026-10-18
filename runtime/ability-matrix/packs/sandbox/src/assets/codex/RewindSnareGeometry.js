import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Rewind Snare — the parameter-space meshes the film is drawn with.
 *
 * The film is one long strip whose vertices are coordinates, not positions:
 * `position.x` 0..1 along the film, `position.y` −1..1 across it. The film
 * material decides, per vertex and per frame, whether that bit of film is
 * lying along the line, round the spiral, or wound up into the cocoon — so
 * the whole performance is uniforms and nothing is ever rebuilt.
 *
 * Never culled: the bounding volume of a parameter-space mesh means nothing.
 */

function strip(columns, rows) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / columns;
      positions[p++] = (j / rows) * 2 - 1;
      positions[p++] = 0;
    }
  }
  const indices = new Uint32Array(columns * rows * 6);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The film. Many columns: it is tens of metres long once unspooled and has
 * to bend round a spiral and a coil without faceting.
 */
export function createFilmGeometry(columns = 900) {
  return strip(columns, 2);
}

/** A ring band (`x` 0..1 round, `y` −1..1 across): the clasps that lock the cocoon. */
export function createBandGeometry(around = 80) {
  return strip(around, 2);
}

/** A unit quad, ±1 in XY: the floor and the warp. */
export function createQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
