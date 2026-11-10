import { LatheGeometry, PlaneGeometry, TorusGeometry, Vector2 } from 'three';

/**
 * Rime Halo — procedural geometry.
 *
 *  - **the needle** — a six-faceted ice spear lathed about +Y: a short
 *    narrow root, a shoulder a fifth of the way up, then a long taper to a
 *    point at y = 1. Unit length, unit shoulder radius; the instance matrix
 *    stretches it to metres. Six radial segments, so its facets catch the
 *    light as it spins (the shader rebuilds a flat facet normal anyway).
 *  - **the spine** — a torus whose *shape* is not baked: the vertex shader
 *    reads its `uv` (u round the ring, v round the tube) and rebuilds the
 *    position from the live halo radius and tube radius, so the ring can
 *    close from five metres to half of one without its tube swelling or
 *    thinning with it.
 *  - **the glint** — a unit quad, billboarded in its shader: the head that
 *    walks the rim.
 */

export function createNeedleGeometry() {
  // A hexagonal ice crystal: a narrow root, a full shoulder low down, a
  // long straight-sided taper and a sharp terminating point.
  const pts = [
    new Vector2(0.0, -0.03),
    new Vector2(0.45, 0.0),
    new Vector2(0.85, 0.07),
    new Vector2(1.0, 0.2),
    new Vector2(0.9, 0.42),
    new Vector2(0.52, 0.74),
    new Vector2(0.18, 0.93),
    new Vector2(0.0, 1.0)
  ];
  const g = new LatheGeometry(pts, 6);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createSpineGeometry(radialSegments = 8, tubularSegments = 192) {
  // Radius and tube are placeholders; the vertex shader rebuilds from uv.
  return new TorusGeometry(1, 0.05, radialSegments, tubularSegments);
}

export function createGlintGeometry() {
  return new PlaneGeometry(1, 1, 1, 1);
}
