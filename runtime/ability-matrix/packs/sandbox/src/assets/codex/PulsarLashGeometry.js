import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Pulsar Lash — the procedural meshes the neutron star is drawn with.
 *
 * Everything is built once in *parameter space*: vertices carry coordinates
 * the vertex stage turns into metres from uniforms (the star's centre, its
 * magnetic axis, the beam's length and curl), so every dimension is a live
 * slider and nothing is rebuilt mid-cast. All of them are never culled — the
 * bounding volume of a parameter-space mesh means nothing.
 */

const HUGE = new Sphere(new Vector3(), 1e4);

function finish(positions, indices, extra = null) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  if (extra) for (const [name, attr] of extra) geometry.setAttribute(name, attr);
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}

/**
 * A tube grid: `position.x` is `s` (0 at the star, 1 at the beam's end),
 * `position.y` the 0..1 angle round the tube, `position.z` a loop index
 * (always 0 for a single tube). Rings are crowded toward the star, where the
 * curl is tightest and the cone narrowest.
 *
 * @param {number} rings   segments along
 * @param {number} sides   segments round
 * @param {number} loops   how many independent tubes in one buffer
 * @param {number} crowd   exponent on `s` (<1 crowds toward 0)
 */
export function createPulsarTubeGeometry(rings = 64, sides = 10, loops = 1, crowd = 1) {
  const cols = sides + 1;
  const rows = rings + 1;
  const per = cols * rows;
  const positions = new Float32Array(per * loops * 3);
  const indices = new Uint16Array(sides * rings * 6 * loops);
  let p = 0;
  let k = 0;
  for (let l = 0; l < loops; l++) {
    for (let j = 0; j < rows; j++) {
      const s = Math.pow(j / rings, crowd);
      for (let i = 0; i < cols; i++) {
        positions[p++] = s;
        positions[p++] = i / sides;
        positions[p++] = l;
      }
    }
    const base = l * per;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sides; i++) {
        const a = base + j * cols + i;
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
  }
  return finish(positions, indices);
}

/**
 * A unit sphere (radius 1 round the origin) with its own normals in
 * `position` — the star material scales and places it from uniforms.
 */
export function createPulsarSphereGeometry(widthSegments = 32, heightSegments = 20) {
  const cols = widthSegments + 1;
  const rows = heightSegments + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(widthSegments * heightSegments * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const v = j / heightSegments;
    const theta = v * Math.PI;
    for (let i = 0; i < cols; i++) {
      const u = i / widthSegments;
      const phi = u * Math.PI * 2;
      positions[p++] = -Math.cos(phi) * Math.sin(theta);
      positions[p++] = Math.cos(theta);
      positions[p++] = Math.sin(phi) * Math.sin(theta);
    }
  }
  let k = 0;
  for (let j = 0; j < heightSegments; j++) {
    for (let i = 0; i < widthSegments; i++) {
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
  return finish(positions, indices);
}

/**
 * A strip, `columns` along × `rows` across: `position.x` 0..1 along,
 * `position.y` -1..1 across. The scar field lays it flat down the line.
 */
export function createPulsarStripGeometry(columns = 8, rows = 8) {
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
  return finish(positions, indices);
}

/** A unit quad, ±1 in XY — billboards place it themselves. */
export function createPulsarQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return finish(positions, indices);
}
