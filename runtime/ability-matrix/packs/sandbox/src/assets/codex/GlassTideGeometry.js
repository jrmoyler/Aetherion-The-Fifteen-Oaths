import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Glass Tide — the procedural meshes the tide sheet is drawn with.
 *
 * The sheet and the wet trail are grids in *parameter space*: their vertices
 * are coordinates the vertex stage turns into metres from uniforms, so every
 * dimension of the sheet is a live slider and nothing is rebuilt. The shard is
 * a real mesh — a thin, irregular triangular slab of glass — instanced.
 */

/** Never culled: a parameter-space mesh's bounds mean nothing. */
const HUGE = new Sphere(new Vector3(), 1e4);

/**
 * A grid, `columns` along by `rows` up: `position.x` 0..1 along, `position.y`
 * 0..1 (or −1..1 with `centred`) across. The sheet stands it up along the
 * line; the trail lays it on the floor.
 */
export function createGlassGridGeometry(columns = 140, rows = 26, centred = false) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(columns * rows * 6);

  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    const v = centred ? (j / rows) * 2 - 1 : j / rows;
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
  geometry.boundingSphere = HUGE.clone();
  return geometry;
}

/**
 * One shard of shattered tide: an irregular triangle, 1 m across, extruded
 * into a slab `thickness` thick, with chamfer-free flat faces. Non-indexed so
 * every face is flat. `aBary` carries barycentric coordinates on the two big
 * faces (and 1s on the thin rim faces) so the shader can draw the shard's
 * edges as bright, hard glass rims.
 */
export function createShardGeometry(thickness = 0.08) {
  // A sliver, not an equilateral: long and sharp is what reads as broken glass.
  const a = [0.0, 0.62];
  const b = [-0.34, -0.38];
  const c = [0.42, -0.24];
  const h = thickness * 0.5;
  const P = [];
  const B = [];
  const tri = (p0, p1, p2, b0, b1, b2) => {
    P.push(...p0, ...p1, ...p2);
    B.push(...b0, ...b1, ...b2);
  };
  const front = (q) => [q[0], q[1], h];
  const back = (q) => [q[0], q[1], -h];
  tri(front(a), front(b), front(c), [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  tri(back(a), back(c), back(b), [1, 0, 0], [0, 0, 1], [0, 1, 0]);
  // The thin rim faces are all edge: zero barycentrics light them end to end.
  const Z = [0, 0, 0];
  const rim = (p, q) => {
    tri(front(p), back(p), back(q), Z, Z, Z);
    tri(front(p), back(q), front(q), Z, Z, Z);
  };
  rim(a, b);
  rim(b, c);
  rim(c, a);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  geometry.setAttribute('aBary', new BufferAttribute(new Float32Array(B), 3));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new Sphere(new Vector3(), 1);
  return geometry;
}

/** A unit quad, ±1 in XY — billboards and the shock ring place it themselves. */
export function createGlassQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE.clone();
  return geometry;
}
