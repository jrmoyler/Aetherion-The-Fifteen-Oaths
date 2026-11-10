import { BufferAttribute, BufferGeometry, PlaneGeometry } from 'three';

/**
 * Pressure Inversion — procedural geometry.
 *
 * Wind has no surface, so nearly everything here is a *parameter space* the
 * vertex stage turns into air:
 *
 *  - **the vortex ribbon** — a strip in (u, v): `position.x = u` runs 0..1
 *    from the eye of the well to its rim, `position.y = v` runs −1..1 across
 *    the ribbon. The material winds it into a rising spiral whose radius,
 *    height, turns and spin are all uniforms, so the whole well re-shapes
 *    under the editor without a single CPU vertex write.
 *  - **the well disc** — a polar grid (rings × sectors) in the XY plane; the
 *    floor material draws isobars, spiral arms and the gust front on it.
 *  - **the motes** — 128 points on a sunflower disc with a phase each; the
 *    vertex stage spirals them in (and, after the inversion, out).
 *  - **the lens** — a unit billboard quad for the distortion proxy.
 *  - **the pressure column** — a closed tube in (v, around): `position.x`
 *    runs 0..1 up the column, `position.y` 0..1 round it. The column
 *    material lathes it into the well's hero: a waisted funnel that pinches
 *    as the well tightens and blows out into a torn bell with the gust.
 */

export const MOTE_COUNT = 128;

/** Parameter-space ribbon, `segments` slices along and `rows` across. */
export function createVortexGeometry(segments = 160, rows = 4) {
  const positions = [];
  const uvs = [];
  const index = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    for (let j = 0; j <= rows; j++) {
      const v = (j / rows) * 2 - 1;
      positions.push(u, v, 0);
      uvs.push(u, j / rows);
      if (i < segments && j < rows) {
        const n = i * (rows + 1) + j;
        index.push(n, n + rows + 1, n + 1, n + 1, n + rows + 1, n + rows + 2);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Unit disc in the XY plane as a polar grid. `uv.x` is the angle 0..1,
 * `uv.y` the radius 0 (eye) .. 1 (rim). A tiny inner radius keeps the eye
 * from degenerating into a fan of slivers.
 */
export function createWellDiscGeometry(rings = 24, sectors = 96) {
  const positions = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const r = 0.01 + 0.99 * v;
    for (let i = 0; i <= sectors; i++) {
      const a = (i / sectors) * Math.PI * 2;
      positions.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      uvs.push(i / sectors, v);
      if (i < sectors && j < rings) {
        const n = j * (sectors + 1) + i;
        index.push(n, n + 1, n + sectors + 1, n + 1, n + sectors + 2, n + sectors + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  return geometry;
}

/** Sunflower-disc motes: xz on the unit disc, y a height dice, plus a phase. */
export function createMoteGeometry() {
  const positions = new Float32Array(MOTE_COUNT * 3);
  const phase = new Float32Array(MOTE_COUNT);
  for (let i = 0; i < MOTE_COUNT; i++) {
    const angle = i * 2.399963;
    const radius = Math.sqrt((i + 0.5) / MOTE_COUNT);
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (i % 11) / 11;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    phase[i] = (i * 0.618034) % 1;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new BufferAttribute(phase, 1));
  return geometry;
}

/** Parameter-space tube for the pressure column: x up it, y round it. */
export function createColumnGeometry(segments = 48, sides = 24) {
  const positions = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= segments; j++) {
    const v = j / segments;
    for (let i = 0; i <= sides; i++) {
      const a = i / sides;
      positions.push(v, a, 0);
      uvs.push(a, v);
      if (j < segments && i < sides) {
        const n = j * (sides + 1) + i;
        index.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  return geometry;
}

/** Unit quad in XY for view-space billboards. */
export function createLensGeometry() {
  return new PlaneGeometry(1, 1, 1, 1);
}
