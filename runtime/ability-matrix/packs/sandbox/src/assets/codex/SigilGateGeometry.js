import { ConeGeometry, LatheGeometry, TorusGeometry, Vector2 } from 'three';

/**
 * Sigil Gate — procedural geometry. All unit-sized; the ability scales it.
 *
 *  - `createSigilRingGeometry` — the gate's ring: a torus of radius 1 with a
 *    four-sided (diamond, bevelled-looking) section of `tube`, in the XY plane
 *    so it stands up facing ±Z. `uv.x` runs round the ring — the frame shader
 *    lays its inlaid runes along it.
 *  - `createSigilSpikeGeometry` — one of the crown's spikes: a four-sided
 *    spike along +Y with its base at the origin.
 *  - `createSigilObeliskGeometry` — a gate post: a square, slightly tapering
 *    shaft with a collar and a pyramid cap, height 1, base on y = 0. A lathe
 *    with four segments, so its faces are flat and `uv.y` climbs the shaft.
 */
export function createSigilRingGeometry(tube = 0.04, tubular = 192) {
  const geometry = new TorusGeometry(1, Math.max(0.002, tube), 4, tubular);
  return geometry;
}

export function createSigilSpikeGeometry() {
  const geometry = new ConeGeometry(0.5, 1, 4, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export function createSigilObeliskGeometry() {
  const profile = [
    new Vector2(0.0, 0.0),
    new Vector2(0.5, 0.0),
    new Vector2(0.5, 0.05),
    new Vector2(0.44, 0.08),
    new Vector2(0.36, 0.84),
    new Vector2(0.44, 0.86),
    new Vector2(0.44, 0.9),
    new Vector2(0.34, 0.9),
    new Vector2(0.0, 1.0)
  ];
  const geometry = new LatheGeometry(profile, 4);
  // A lathe's first segment starts on +Z; turn it so a face, not an arris, looks forward.
  geometry.rotateY(Math.PI / 4);
  // Unshared vertices, so every face is flat-shaded like cut stone.
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}
