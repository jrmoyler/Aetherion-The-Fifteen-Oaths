import { BoxGeometry, LatheGeometry, PlaneGeometry, Vector2 } from 'three';

/**
 * Whiteout Needle — procedural geometry.
 *
 *  - **the icicle** — a five-faceted spear of ice lathed about +Y, its blunt
 *    root at y = 0 and its point at y = 1: an icicle that has been thrown
 *    point-first. Unit length and root radius; the instance matrix stretches
 *    it (and stretches it further while it falls, so it reads as a streak).
 *  - **the cloud** — a flat grid, long in X, that the cloud shader bends into
 *    a billowing underside in its vertex stage. Local X runs 0..1 down the
 *    cast line, Z −0.5..0.5 across it.
 *  - **the strip** — a quad in the same parameter space for the snowed-over
 *    floor and the cold-air sheet.
 *  - **the blizzard box** — a unit box, x 0..1 down the line, y 0..1 up,
 *    z −0.5..0.5 across: only the carrier for the raymarched body of blowing
 *    snow; the shader finds its own entry and exit analytically.
 */

export function createIcicleGeometry() {
  const pts = [
    new Vector2(0.0, 0.0),
    new Vector2(0.75, 0.0),
    new Vector2(1.0, 0.05),
    new Vector2(0.86, 0.22),
    new Vector2(0.55, 0.55),
    new Vector2(0.22, 0.85),
    new Vector2(0.0, 1.0)
  ];
  const g = new LatheGeometry(pts, 5);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Long grid for the cloud: x 0..1 along the line, z −0.5..0.5 across, y 0. */
export function createCloudGeometry(along = 96, across = 14) {
  const g = new PlaneGeometry(1, 1, along, across);
  g.rotateX(-Math.PI / 2);
  g.translate(0.5, 0, 0);
  return g;
}

/** A quad in the same space, for the floor and the cold-air sheet. */
export function createStripGeometry() {
  const g = new PlaneGeometry(1, 1, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0.5, 0, 0);
  return g;
}

/** Unit box for the raymarched blizzard: x 0..1 along, y 0..1 up, z −0.5..0.5 across. */
export function createBlizzardGeometry() {
  const g = new BoxGeometry(1, 1, 1);
  g.translate(0.5, 0.5, 0);
  return g;
}
