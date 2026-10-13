import { BufferAttribute, BufferGeometry, IcosahedronGeometry, PlaneGeometry } from 'three';

/**
 * Avalanche Wake — procedural geometry.
 *
 *  - `createIceBoulderGeometry` — a faceted lump of glacier ice. An icosphere
 *    whose *shared* corners are pushed in and out by a hash of where they sit,
 *    so neighbouring facets still meet, then split into flat facets (one normal
 *    per triangle) so every face catches the light on its own — the read of
 *    ice, not of a pebble. Squashed a little so it rolls rather than balances.
 *  - `createAvalancheShellGeometry` — a parameter-space grid, `x` across the
 *    wall (-1..1) and `y` over its profile (0 back foot .. 1 leading foot). The
 *    vertex stage bends it into the rolling front; nothing about its shape is
 *    baked here, so every slider re-shapes it live.
 *  - `createAvalancheDriftGeometry` — a dense unit strip (`x` across ±0.5,
 *    `y` along ±0.5) the drift shader lays down the line and heaps up.
 */

/** Deterministic 0..1 from a 3D point — the same corner always moves the same way. */
function hashPoint(x, y, z, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * @param {number} seed variation
 * @param {number} [roughness] how far the corners wander, × radius
 */
export function createIceBoulderGeometry(seed = 0, roughness = 0.28) {
  const ico = new IcosahedronGeometry(1, 1);
  const pos = ico.getAttribute('position');
  // IcosahedronGeometry is already non-indexed, but its duplicated corners
  // share exact positions — hashing the *original* position moves every copy
  // of a corner identically, so the facets stay closed.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const kx = Math.round(x * 1000) / 1000;
    const ky = Math.round(y * 1000) / 1000;
    const kz = Math.round(z * 1000) / 1000;
    const r = 1 + (hashPoint(kx, ky, kz, seed) * 2 - 1) * roughness;
    // A flattened underside and a broad top: glacier ice cleaves in slabs.
    pos.setXYZ(i, x * r * 1.08, y * r * 0.82, z * r);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos.array.slice(), 3));
  geometry.computeVertexNormals(); // non-indexed → one normal per facet
  ico.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The front's parameter grid: x ∈ [-1, 1] across, y ∈ [0, 1] over the profile. */
export function createAvalancheShellGeometry(across = 56, over = 44) {
  const geometry = new PlaneGeometry(2, 1, across, over);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** The drift strip: x ∈ [-0.5, 0.5] across, y ∈ [-0.5, 0.5] along. */
export function createAvalancheDriftGeometry(across = 36, along = 220) {
  return new PlaneGeometry(1, 1, across, along);
}
