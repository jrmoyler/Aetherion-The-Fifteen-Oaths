import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Heartstake — the procedural meshes the stake is drawn with.
 *
 * Everything here is built once in *parameter space*: the vertices are
 * coordinates the vertex stage turns into metres from uniforms, so the stake's
 * length, its barbs, its heart and its throb are all live sliders and nothing
 * is ever rebuilt. Bounding spheres are huge on purpose — these meshes are
 * never culled.
 */

/**
 * The stake: a closed lathe grid.
 *
 * `position.x` is `s`, 0 at the forked tail and 1 at the point; `position.y`
 * is the 0..1 bearing round the shaft. The stake material turns that into a
 * barbed, faceted, heart-knotted spike (`stakeRadius` in HeartstakeMaterials).
 * Rings are crowded round the heart knot and toward the point, where the
 * profile changes fastest. Few sides on purpose: the coagulate is crystalline,
 * and seven facets read as cut garnet rather than a smooth tube.
 *
 * @param {number} [rings] segments tail to point
 * @param {number} [sides] facets round the shaft
 */
export function createStakeGeometry(rings = 96, sides = 7) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * rings * 6);

  let p = 0;
  for (let j = 0; j < rows; j++) {
    const t = j / rings;
    // Denser through the heart (s ≈ 0.17) and near the point.
    const s = t + 0.035 * Math.sin(t * Math.PI * 2) * (1 - t);
    for (let i = 0; i < cols; i++) {
      positions[p++] = Math.min(1, Math.max(0, s));
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

/**
 * A strip, `columns` along by `rows` across, in parameter space: `position.x`
 * 0..1 along, `position.y` -1..1 across. The blood trail stands it up behind
 * the stake, facing the camera.
 */
export function createStripGeometry(columns = 48, rows = 2) {
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

/** A unit quad, ±1 in XY — billboards, the ground stain and the pulse warp place it themselves. */
export function createQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
