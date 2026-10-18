import { BufferAttribute, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Shape, Sphere, Vector3 } from 'three';

/**
 * Umbral Guillotine — procedural geometry.
 *
 * The blade is the one solid here: a crescent cut from two equal circles, the
 * lower one's arc the cutting edge, the upper one's the spine, so it narrows
 * to two upswept horns. Unit-sized — the edge's lowest point at the origin,
 * the circles of radius 1 — and scaled by the mesh, so `bladeSize` is live.
 * The shader reads the same numbers (`BLADE_R`, `BLADE_BELLY`) to find the
 * edge, so keep them together.
 */

const BIG = new Sphere(new Vector3(), 1e4);

/** Radius of the two circles the crescent is cut from (unit). */
export const BLADE_R = 1;
/** How far the spine circle sits above the edge circle — the belly's depth. */
export const BLADE_BELLY = 0.42;

export function createBladeGeometry() {
  const R = BLADE_R;
  const d = BLADE_BELLY;
  // Where the circles cross: the horn tips.
  const tipY = R + d / 2;
  const tipX = Math.sqrt(R * R - (d / 2) * (d / 2));
  const outerA = Math.atan2(tipY - R, tipX);
  const innerA = Math.atan2(tipY - (R + d), tipX);

  const shape = new Shape();
  shape.moveTo(tipX, tipY);
  // The edge: right horn, down through the bottom, up to the left horn.
  shape.absarc(0, R, R, outerA, -Math.PI - outerA, true);
  // The spine: left horn, down through the belly, back to the right horn.
  shape.absarc(0, R + d, R, -Math.PI - innerA, innerA, false);

  const depth = 0.05;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.02,
    bevelSegments: 2
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  geometry.boundingSphere = BIG;
  return geometry;
}

/** The tether: a unit open cylinder along +Y, −0.5..0.5. */
export function createTetherGeometry() {
  const geometry = new CylinderGeometry(1, 1, 1, 10, 24, true);
  geometry.boundingSphere = BIG;
  return geometry;
}

/**
 * The smear — an annular sector grid. `position.x` 0 (leading) .. 1
 * (trailing), `position.y` 0 (inner) .. 1 (outer, the edge's track).
 */
export function createSmearGeometry(cols = 48, rows = 8) {
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const indices = new Uint16Array(cols * rows * 6);
  let p = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      positions[p++] = i / cols;
      positions[p++] = j / rows;
      positions[p++] = 0;
    }
  }
  let k = 0;
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      indices[k++] = a;
      indices[k++] = a + stride;
      indices[k++] = a + 1;
      indices[k++] = a + 1;
      indices[k++] = a + stride;
      indices[k++] = a + stride + 1;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = BIG;
  return geometry;
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
