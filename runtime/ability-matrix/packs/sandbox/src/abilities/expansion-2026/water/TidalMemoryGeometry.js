import { BufferAttribute, BufferGeometry, PlaneGeometry, RingGeometry } from 'three';

/**
 * Tidal Memory — procedural geometry.
 *
 *  - **the wave** — a breaking wave drawn in *parameter space*: `position.x`
 *    is the lateral coordinate (−1..1 across the wave's width) and
 *    `position.y` the profile coordinate (0 at the foot of the back slope,
 *    ~0.62 at the crest, 1 at the tip of the curling lip). The vertex shader
 *    turns that into metres every frame — back slope, crest, the lip curling
 *    forward and under, the lateral taper and the rolling of the crest — so
 *    every one of those is a live slider and the wave can turn round to face
 *    home on the return without any geometry being rewritten.
 *  - **ribbons** — the wake and the crest-foam bands: `segments` quads with
 *    a `uv` (x along, y across). Their vertices are written in world space by
 *    the ability, because the wake follows the recorded curve and the foam
 *    rides the crest.
 *  - **spray** — a bounded cloud of points with a per-point phase, thrown up
 *    off the lip by its own shader.
 *  - **the turn ripple** — an annulus with radial rows, so the ripple shader
 *    has the resolution to carry several concentric crests.
 *  - **the warp** — a unit quad billboarded in its shader.
 */

/** Rows up the wave's profile. More rows, smoother curl. */
export const WAVE_ROWS = 18;

export function createWaveGeometry(columns, rows = WAVE_ROWS) {
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const index = [];
  let k = 0;
  for (let i = 0; i <= columns; i++) {
    for (let j = 0; j <= rows; j++) {
      positions[k++] = (i / columns) * 2 - 1;
      // Rows are packed toward the crest and the lip, where the curvature is.
      const v = j / rows;
      positions[k++] = v < 0.5 ? v * 1.1 : 0.55 + (v - 0.5) * 0.9;
      positions[k++] = 0;
    }
  }
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

/** A world-space strip of `segments` quads; positions are written per frame. */
export function createRibbonGeometry(segments) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uv = new Float32Array((segments + 1) * 2 * 2);
  const index = [];
  for (let i = 0; i <= segments; i++) {
    uv.set([i / segments, 0, i / segments, 1], i * 4);
    if (i < segments) {
      const n = i * 2;
      index.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Spray: `count` points in a unit box (x −1..1 across, y 0..1, z −1..1) on
 * low-discrepancy sequences, so the cloud is even without being a grid.
 */
export function createSprayGeometry(count = 112) {
  const p = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    p.set([((i * 0.618034) % 1) * 2 - 1, (i * 0.414214) % 1, ((i * 0.73205) % 1) * 2 - 1], i * 3);
    phase[i] = (i * 0.754877) % 1;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(p, 3));
  geometry.setAttribute('phase', new BufferAttribute(phase, 1));
  return geometry;
}

/** The turn ripple: unit outer radius, lying in XY (rotated flat by the mesh). */
export function createRippleGeometry() {
  return new RingGeometry(0.5, 1, 96, 4);
}

/** The warp billboard. */
export function createWarpQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
