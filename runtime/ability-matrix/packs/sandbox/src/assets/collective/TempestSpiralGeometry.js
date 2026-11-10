import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * The funnel, in *parameter space*.
 *
 * An open lathe whose vertices are not positions at all: `position.xz` is the
 * unit bearing round the column (cos θ, sin θ) and `position.y` is the 0..1
 * fraction of the way up it. The funnel material turns that into metres in its
 * vertex stage — radius from the flare curve, height from the rise, the axis
 * bent by the sway, the wall rippled by noise — so every dimension of the
 * tornado is a uniform and the mesh is built exactly once.
 *
 * That is also why it is never culled and never goes into the depth prepass:
 * its bounding volume is a unit cylinder at the origin, which is not where any
 * of it is drawn.
 *
 * Rows are spaced quadratically toward the floor. The bottom of a tornado is
 * where it is thinnest and where the sway bends hardest, so that is where the
 * tessellation is spent; the flared top is a broad, slow surface that a few
 * rows describe perfectly well.
 *
 * @param {number} [segments] columns round the funnel
 * @param {number} [rows]     rings up it
 */
export function createFunnelGeometry(segments = 56, rows = 48) {
  const columns = segments + 1; // the seam is duplicated so `uv.x` can run 0..1
  const ringCount = rows + 1;

  const positions = new Float32Array(columns * ringCount * 3);
  const uvs = new Float32Array(columns * ringCount * 2);
  const indices = new Uint16Array(segments * rows * 6);

  let p = 0;
  let t = 0;
  for (let j = 0; j < ringCount; j++) {
    const s = j / rows;
    // Denser at the floor: v = s^1.6 crowds the low rings together.
    const v = Math.pow(s, 1.6);
    for (let i = 0; i < columns; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions[p++] = Math.cos(a);
      positions[p++] = v;
      positions[p++] = Math.sin(a);
      uvs[t++] = i / segments;
      uvs[t++] = v;
    }
  }

  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * columns + i;
      const b = a + 1;
      const c = a + columns;
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
  // Generous: the real extent is decided in the vertex shader.
  geometry.boundingSphere = new Sphere(new Vector3(0, 5, 0), 40);
  return geometry;
}

/**
 * The scoured floor — a polar disc of unit radius, rings crowded toward the
 * middle where the funnel grinds hardest. The scour material lifts its rim a
 * hair, carves the dirt into wound striations and gouges, and sizes it from
 * `skirtRadius` every frame, so this is built once.
 *
 * @param {number} [segments] spokes round the disc
 * @param {number} [rings]    rings out from the axis
 */
export function createScourGeometry(segments = 96, rings = 28) {
  const columns = segments + 1;
  const count = columns * (rings + 1);
  const positions = new Float32Array(count * 3);
  const indices = new Uint16Array(segments * rings * 6);
  let p = 0;
  for (let j = 0; j <= rings; j++) {
    const r = Math.pow(j / rings, 1.35);
    for (let i = 0; i < columns; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions[p++] = Math.cos(a) * r;
      positions[p++] = 0;
      positions[p++] = Math.sin(a) * r;
    }
  }
  let k = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * columns + i;
      const b = a + 1;
      const c = a + columns;
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
  geometry.boundingSphere = new Sphere(new Vector3(), 1.5);
  return geometry;
}
