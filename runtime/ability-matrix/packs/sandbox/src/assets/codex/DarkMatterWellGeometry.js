import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Dark Matter Well — procedural geometry. Parameter grids only; the vertex
 * stages in `DarkMatterWellMaterials` give them metres from live uniforms.
 */

const BIG = new Sphere(new Vector3(), 1e4);

function grid(cols, rows, fill, flip = false) {
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const indices = new Uint32Array(cols * rows * 6);
  let p = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      fill(i / cols, j / rows, positions, p);
      p += 3;
    }
  }
  let k = 0;
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (flip) {
        indices[k++] = a; indices[k++] = b; indices[k++] = c;
        indices[k++] = b; indices[k++] = d; indices[k++] = c;
      } else {
        indices[k++] = a; indices[k++] = c; indices[k++] = b;
        indices[k++] = b; indices[k++] = c; indices[k++] = d;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = BIG;
  return geometry;
}

/**
 * The well — a polar grid. `position.x` is the normalised radius 0 (eye) .. 1
 * (rim), packed toward the eye where the funnel is steepest; `position.y` is
 * the bearing 0..1.
 */
export function createWellGeometry(rings = 72, segments = 128) {
  return grid(segments, rings, (u, v, out, p) => {
    out[p] = Math.pow(v, 1.45);
    out[p + 1] = u;
    out[p + 2] = 0;
  });
}

/**
 * The curtain — an open cylinder. `position.x` bearing 0..1, `position.y`
 * height 0 (foot) .. 1 (crest).
 */
export function createCurtainGeometry(segments = 160, rows = 28) {
  return grid(segments, rows, (u, v, out, p) => {
    out[p] = u;
    out[p + 1] = v;
    out[p + 2] = 0;
  });
}

/** A unit quad, `position.xy` in −1..1. */
export function createQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = BIG;
  return geometry;
}
