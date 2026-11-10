import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from 'three';

/**
 * Winter's Borrowed Breath — procedural geometry.
 *
 *  - **the lamella** — the hero unit. One armour scale of cut ice: a
 *    kite-shaped outline (pointed foot, broad scalloped head), faceted like a
 *    cut stone — an outer rim, a jittered inner ring and a raised keel apex on
 *    the front, a shallow back — then bent across its width so a row of them
 *    curves round the carapace. Non-indexed, so every facet shades flat: the
 *    ice reads as *cut*, not moulded. Unit length along +Y (foot at 0, head at
 *    1), width ±0.5 along X, outward face toward +Z, unit thickness.
 *  - **the breath ribbon** — two interleaved helical bands, stored only as
 *    (s along the helix, t across the band, ribbon index). The vertex shader
 *    winds them round the zone from settings every frame, so the cyclone's
 *    radius, height, turns and draw-in are live sliders.
 *  - **the plume** — a tube stored as (s along, θ around); the shader lays it
 *    down the cast line from the hand to the zone, coiled and swelling.
 *  - **the quad** — the floor field and the lens.
 *
 * Built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;

/** Deterministic jitter so every pool member builds the same lamella. */
function jitter(i, salt) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * The lamella outline, foot → round → head → round, as [x, y] at unit length.
 * Widest at 62 % of the length; the head is scalloped with a shallow notch so
 * overlapping rows read as scales rather than tiles.
 */
const OUTLINE = [
  [0.0, 0.0],
  [0.12, 0.12],
  [0.27, 0.3],
  [0.42, 0.5],
  [0.5, 0.64],
  [0.47, 0.8],
  [0.36, 0.93],
  [0.18, 0.99],
  [0.0, 0.94],
  [-0.18, 0.99],
  [-0.36, 0.93],
  [-0.47, 0.8],
  [-0.5, 0.64],
  [-0.42, 0.5],
  [-0.27, 0.3],
  [-0.12, 0.12],
];

/**
 * One faceted ice lamella.
 * @param {object} [o]
 * @param {number} [o.keel]   apex height over the rim (unit thickness)
 * @param {number} [o.back]   depth of the shallow back
 * @param {number} [o.bend]   curvature across the width (z -= bend · x²)
 */
export function createPlateGeometry({ keel = 0.9, back = 0.35, bend = 0.32 } = {}) {
  const n = OUTLINE.length;
  const apex = [0, 0.58];
  const rimZ = 0.18;
  const outer = [];
  const inner = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = OUTLINE[i];
    outer.push([x, y, rimZ]);
    // The inner ring: 52 % of the way to the apex, jittered so the facets are
    // irregular like a hand-knapped edge.
    const k = 0.52 + jitter(i, 1) * 0.12;
    inner.push([
      apex[0] + (x - apex[0]) * k + jitter(i, 2) * 0.03,
      apex[1] + (y - apex[1]) * k + jitter(i, 3) * 0.03,
      rimZ + (keel - rimZ) * (0.62 + jitter(i, 4) * 0.2),
    ]);
  }
  const top = [apex[0], apex[1], keel];
  const bottom = [apex[0], apex[1] + 0.04, -back];

  const pos = [];
  const uv = [];
  const push = (p) => {
    // Bend across the width so a row of plates curves round the carapace.
    pos.push(p[0], p[1], p[2] - bend * p[0] * p[0]);
    uv.push(p[0] + 0.5, p[1]);
  };
  const tri = (a, b, c) => {
    push(a);
    push(b);
    push(c);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Front: rim → inner ring quads, inner ring → keel apex fan.
    tri(outer[i], outer[j], inner[j]);
    tri(outer[i], inner[j], inner[i]);
    tri(inner[i], inner[j], top);
    // The side band: rim front → rim back.
    const bi = [outer[i][0], outer[i][1], -rimZ];
    const bj = [outer[j][0], outer[j][1], -rimZ];
    tri(outer[j], outer[i], bi);
    tri(outer[j], bi, bj);
    // The back: a shallow fan.
    tri(bj, bi, bottom);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Two interleaved helical breath ribbons as parameters only:
 * `position` = (s 0..1 along the helix, t 0..1 across, ribbon 0|1).
 */
export function createRibbonGeometry(segments = 180, across = 6) {
  const pos = [];
  const index = [];
  let base = 0;
  for (let ribbon = 0; ribbon < 2; ribbon++) {
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= across; j++) pos.push(i / segments, j / across, ribbon);
    }
    const row = across + 1;
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < across; j++) {
        const a = base + i * row + j;
        const b = a + row;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    base += (segments + 1) * row;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

/** The plume as parameters: `position` = (s 0..1 along, θ 0..2π around, 0). */
export function createPlumeGeometry(segments = 120, around = 18) {
  const pos = [];
  const index = [];
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= around; j++) pos.push(i / segments, (j / around) * TAU, 0);
  }
  const row = around + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * row + j;
      const b = a + row;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

/** A unit quad lying in XY. */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
