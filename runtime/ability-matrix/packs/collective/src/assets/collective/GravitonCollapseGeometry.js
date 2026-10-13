import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Procedural geometry for the Graviton Collapse.
 *
 * Only one shape here needs to be bespoke, and it is the floor: the well sinks
 * the stage into a funnel in its vertex stage, and a funnel is all curvature at
 * the throat and almost none at the lip. A regular plane spends its vertices
 * evenly and so has a faceted throat and a wasted rim; a stock `RingGeometry`
 * spaces its rings evenly for the same result. This one is a polar grid whose
 * rings are packed toward the centre by a power curve — the same idea as a
 * log-polar grid, without the singularity at r = 0.
 */

/**
 * A unit polar disc lying in XZ (y = 0), radius 1, rings packed toward the
 * middle. The vertex stage scales it to metres from a uniform, so the mesh is
 * built once and `zoneRadius` stays a live slider.
 *
 * `uv.x` carries the *unpacked* radial fraction (0 at the centre, 1 at the lip)
 * and `uv.y` the bearing in turns — the material reads neither today, but they
 * are free and make the disc usable by any other polar shader.
 *
 * @param {number} [segments] vertices around the circumference
 * @param {number} [rings]    rings from the centre to the lip
 * @param {number} [bias]     >1 packs the rings toward the centre
 */
export function createWellGeometry(segments = 144, rings = 56, bias = 1.75) {
  const columns = segments + 1;
  // One centre vertex per column, so the fan collapses cleanly instead of every
  // spoke sharing a single normal and uv at the pole.
  const count = columns * (rings + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const normals = new Float32Array(count * 3);

  let v = 0;
  for (let ring = 0; ring <= rings; ring++) {
    const f = ring / rings;
    const r = Math.pow(f, bias);
    for (let s = 0; s <= segments; s++) {
      const turn = s / segments;
      const a = turn * Math.PI * 2;
      positions[v * 3 + 0] = Math.cos(a) * r;
      positions[v * 3 + 1] = 0;
      positions[v * 3 + 2] = Math.sin(a) * r;
      normals[v * 3 + 1] = 1;
      uvs[v * 2 + 0] = r;
      uvs[v * 2 + 1] = turn;
      v++;
    }
  }

  const indices = [];
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < segments; s++) {
      const a = ring * columns + s;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      // Wound so the face points +Y: the funnel is drawn front faces only, and
      // that is what lets the near wall of a deep well hide itself.
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The well's depth profile, 0..1, at `r` metres from its axis — the JS twin of
 * `wellProfile` in the well material.
 *
 * A softened inverse square (`1 / (1 + (r/throat)²)`), renormalised so it is
 * exactly 1 on the axis and exactly 0 at the lip. That last part matters more
 * than the shape: an unnormalised Lorentzian is still a few centimetres deep at
 * the edge of the mesh, and a cliff at the boundary is the one thing that turns
 * a gravity well back into a mesh sitting on the floor.
 *
 * The ability uses this to sink a standing body by the same amount the floor
 * under its feet has sunk.
 *
 * @param {number} r      metres from the axis
 * @param {number} reach  radius of the lip, metres
 * @param {number} throat radius at which the well is half as deep, metres
 */
export function wellProfile(r, reach, throat) {
  const w = Math.max(0.05, throat);
  const edge = 1 / (1 + (reach / w) * (reach / w));
  const q = r / w;
  const raw = 1 / (1 + q * q);
  return Math.max(0, (raw - edge) / Math.max(1e-4, 1 - edge));
}
