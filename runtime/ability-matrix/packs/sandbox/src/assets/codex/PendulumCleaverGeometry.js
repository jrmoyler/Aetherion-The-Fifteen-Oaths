import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Pendulum Cleaver — the procedural meshes the pendulum is drawn with.
 *
 * All but the pivot ring are built once in *parameter space*: their vertices
 * are coordinates the vertex stage turns into metres from uniforms, so the
 * blade's width, depth, curve and thickness, the rod's length and the smear's
 * span are all live sliders and nothing is ever rebuilt.
 *
 * Never culled: the bounding volume of a parameter-space mesh means nothing.
 */

function finish(positions, indices, extra) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  if (extra) for (const name in extra) geometry.setAttribute(name, extra[name]);
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** Index a `cols × rows` vertex grid (row-major) into triangles. */
function gridIndices(cols, rows, out, offset, start, flip) {
  let k = offset;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = start + j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flip) {
        out[k++] = a; out[k++] = c; out[k++] = b;
        out[k++] = b; out[k++] = c; out[k++] = d;
      } else {
        out[k++] = a; out[k++] = b; out[k++] = c;
        out[k++] = b; out[k++] = d; out[k++] = c;
      }
    }
  }
  return k;
}

/**
 * The crescent blade.
 *
 * `position.x` is `q`, −1 at one tip and +1 at the other; `position.y` is `v`,
 * 0 on the honed (convex, lower) edge and 1 on the spine; `position.z` is `w`,
 * +1 the front face and −1 the back. `aCap` is 1 on the strip that closes the
 * spine. `bladeShape()` in PendulumCleaverMaterials turns that into metres.
 * Columns are crowded toward the tips, where the outline turns fastest.
 *
 * @param {number} [columns] segments tip to tip
 * @param {number} [rows]    segments edge to spine
 */
export function createBladeGeometry(columns = 64, rows = 10) {
  const cols = columns + 1;
  const rowsV = rows + 1;
  const faceVerts = cols * rowsV;
  const capVerts = cols * 2;
  const total = faceVerts * 2 + capVerts;
  const positions = new Float32Array(total * 3);
  const cap = new Float32Array(total);
  let p = 0;
  let n = 0;

  const qAt = (i) => {
    const t = (i / columns) * 2 - 1;
    // Crowd toward the tips: q = sign(t)·|t|^0.75.
    return Math.sign(t) * Math.pow(Math.abs(t), 0.75);
  };

  for (const w of [1, -1]) {
    for (let j = 0; j < rowsV; j++) {
      const v = j / rows;
      for (let i = 0; i < cols; i++) {
        positions[p++] = qAt(i);
        positions[p++] = v;
        positions[p++] = w;
        cap[n++] = 0;
      }
    }
  }
  for (const w of [1, -1]) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = qAt(i);
      positions[p++] = 1;
      positions[p++] = w;
      cap[n++] = 1;
    }
  }

  const tris = (columns * rows * 2) * 2 + columns * 2;
  const indices = new Uint16Array(tris * 3);
  let k = gridIndices(cols, rowsV, indices, 0, 0, false);
  k = gridIndices(cols, rowsV, indices, k, faceVerts, true);
  gridIndices(cols, 2, indices, k, faceVerts * 2, true);

  return finish(positions, indices, { aCap: new BufferAttribute(cap, 1) });
}

/**
 * A tube in parameter space: `position.x` 0..1 along, `position.y` 0..1 round.
 * The rod material stretches it between the pivot and the collar.
 */
export function createRodGeometry(rings = 24, sides = 10) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / rings;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }
  const indices = new Uint16Array(rings * sides * 6);
  gridIndices(cols, rows, indices, 0, 0, false);
  return finish(positions, indices);
}

/**
 * A fan grid for the smear: `position.x` 0..1 back along the swing (0 at the
 * blade), `position.y` 0..1 out from the pivot. The smear material sweeps it
 * round the pivot behind the blade.
 */
export function createFanGeometry(arcs = 40, radial = 16) {
  const cols = arcs + 1;
  const rows = radial + 1;
  const positions = new Float32Array(cols * rows * 3);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / arcs;
      positions[p++] = j / radial;
      positions[p++] = 0;
    }
  }
  const indices = new Uint16Array(arcs * radial * 6);
  gridIndices(cols, rows, indices, 0, 0, false);
  return finish(positions, indices);
}

/**
 * A long strip: `position.x` 0..1 along, `position.y` −1..1 across. The scar
 * material lays it on the floor down the line.
 */
export function createStripGeometry(columns = 120, rows = 4) {
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
  const indices = new Uint16Array(columns * rows * 6);
  gridIndices(cols, rowCount, indices, 0, 0, true);
  return finish(positions, indices);
}

/** A unit quad, ±1 in XY — billboards place it themselves. */
export function createQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return finish(positions, indices);
}
