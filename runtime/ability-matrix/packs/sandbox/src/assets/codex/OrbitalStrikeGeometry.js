import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Orbital Strike — procedural geometry.
 *
 * Two shapes, neither with a size of its own:
 *
 *  - a **parameter grid** — a (u, v) lattice in `position.xy`, both 0..1 —
 *    that the column, the laser and the heat bend bend into cylinders in their
 *    vertex stages, so the beam's radius, height, flare and lean are sliders;
 *  - a **unit ground quad** (corners ±1 in `position.xy`) that the reticle and
 *    the crater lay flat on the floor and size from uniforms.
 */
export function createOrbitalGrid(segU, segV) {
  const cols = segU + 1;
  const rows = segV + 1;
  const position = new Float32Array(cols * rows * 3);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      position[k++] = i / segU;
      position[k++] = j / segV;
      position[k++] = 0;
    }
  }
  const index = new (cols * rows > 65535 ? Uint32Array : Uint16Array)(segU * segV * 6);
  k = 0;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index[k++] = a;
      index[k++] = c;
      index[k++] = b;
      index[k++] = b;
      index[k++] = c;
      index[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A quad with corners at ±1, laid on the floor by its vertex shader. */
export function createOrbitalGroundQuad() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
