import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute } from 'three';

/**
 * Faultwake Bastion — procedural geometry.
 *
 * Nothing here is a stock primitive. Every buffer is authored once at
 * construction; the ability only ever writes instance matrices and a couple of
 * per-instance scalars afterwards.
 *
 *  - **the column** — a basalt column: a hexagonal prism (twelve segments, so a
 *    corner and a mid-face vertex per side, which keeps the faces flat), its
 *    corners individually chipped, tapering toward a slanted, broken crown,
 *    with two colonnade joints pinched into the shaft. The topology (8 rows ×
 *    12 segments + two capped ends) is part of the cast's contract.
 *  - **rubble** — a squat, lumpy boulder: an octahedron subdivided twice and
 *    pushed about by a cheap hash, flat-shaded in the material.
 *  - **the fissure strip** — a subdivided ground ribbon, local X along the cast
 *    line (−½..½), local Y across it (−½..½). The material does the cracking.
 *  - **the shock disc** — an annulus with enough radial rings that the
 *    fragment stage can run cracks out across it.
 *  - **the debris cloud** — 96 points in three lanes along the line; the vertex
 *    stage throws them ballistically behind the travelling front.
 */

/** Rows up the shaft and segments around it (the column contract). */
export const COLUMN_ROWS = 8;
export const COLUMN_SEGMENTS = 12;
/** Debris points; three lanes of 32 along the line. */
export const DEBRIS_COUNT = 96;

const TAU = Math.PI * 2;

/** Deterministic 0..1 hash so the authored shapes are stable between reloads. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * One basalt column, base at y = 0, nominally 2 m tall and 1 m in radius (the
 * ability scales each instance). Vertex layout: `(rows + 1) × (segments + 1)`
 * ring vertices (the seam is duplicated), then the crown centre, then the base
 * centre — 119 vertices, 648 indices.
 */
export function createColumnGeometry() {
  const seg = COLUMN_SEGMENTS;
  const rows = COLUMN_ROWS;
  const positions = [];
  const uvs = [];
  const index = [];

  // Each of the six corners is chipped by a different amount; mid-face
  // vertices sit on the straight edge between their two corners, which is what
  // makes a twelve-gon read as a hexagon rather than a cylinder.
  const corner = [];
  for (let k = 0; k < 6; k++) corner.push(0.9 + 0.18 * hash(k + 3.1));

  // The crown is a fracture plane, not a flat cap: tilted toward `slant`.
  const slant = 1.9;
  for (let y = 0; y <= rows; y++) {
    const t = y / rows;
    // Taper to ~70% at the crown, eased so the base stays broad.
    const taper = 1 - 0.3 * t * t;
    // Colonnade joints: two rows pinched in, the cross-cracks basalt splits on.
    const joint = y === 3 || y === 6 ? 0.93 : 1;
    // The top row is drawn in further, so the crown has a broken bevel.
    const bevel = y === rows ? 0.82 : 1;
    for (let i = 0; i <= seg; i++) {
      const a = ((i % seg) / seg) * TAU;
      const k = Math.floor((i % seg) / 2);
      let r;
      if (i % 2 === 0) {
        r = corner[k];
      } else {
        // Mid-face: on the chord between the neighbouring corners.
        r = 0.5 * (corner[k] + corner[(k + 1) % 6]) * Math.cos(Math.PI / 6);
      }
      // A little lumpiness per ring so the faces are not machined.
      r *= 1 + 0.035 * Math.sin(i * 7.1 + y * 2.2) + 0.02 * Math.cos(i * 4.3 - y * 1.7);
      r *= taper * joint * bevel;
      // The upper two rings follow the slanted fracture plane.
      let h = t * 2;
      if (y >= rows - 1) h += (y === rows ? 0.22 : 0.08) * Math.cos(a - slant) + 0.04 * (hash(i + y * 13) - 0.5);
      positions.push(Math.cos(a) * r, h, Math.sin(a) * r);
      uvs.push(i / seg, t);
      if (y < rows && i < seg) {
        const n = y * (seg + 1) + i;
        index.push(n, n + 1, n + seg + 1, n + 1, n + seg + 2, n + seg + 1);
      }
    }
  }

  // Crown centre, raised onto the slant plane, and the base centre.
  const top = positions.length / 3;
  positions.push(0.04 * Math.cos(slant), 2.05, 0.04 * Math.sin(slant));
  uvs.push(0.5, 1);
  const bottom = positions.length / 3;
  positions.push(0, 0, 0);
  uvs.push(0.5, 0);
  for (let i = 0; i < seg; i++) {
    const upper = rows * (seg + 1) + i;
    index.push(top, upper + 1, upper, bottom, i, i + 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A boulder about 1 m across: octahedron → two midpoint subdivisions →
 * normalised → displaced by a hash of its direction, squashed
 * a little so it sits rather than rolls.
 */
export function createRubbleGeometry() {
  let tris = [
    [0, 1, 0], [1, 0, 0], [0, 0, 1],
    [0, 1, 0], [0, 0, 1], [-1, 0, 0],
    [0, 1, 0], [-1, 0, 0], [0, 0, -1],
    [0, 1, 0], [0, 0, -1], [1, 0, 0],
    [0, -1, 0], [0, 0, 1], [1, 0, 0],
    [0, -1, 0], [-1, 0, 0], [0, 0, 1],
    [0, -1, 0], [0, 0, -1], [-1, 0, 0],
    [0, -1, 0], [1, 0, 0], [0, 0, -1]
  ];
  const mid = (a, b) => {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const l = Math.hypot(m[0], m[1], m[2]);
    return [m[0] / l, m[1] / l, m[2] / l];
  };
  for (let pass = 0; pass < 2; pass++) {
    const next = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    tris = next;
  }
  // Non-indexed on purpose: the material flat-shades from derivatives anyway,
  // and a displaced shared vertex keeps the faces welded.
  const positions = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    const [x, y, z] = tris[i];
    const n = hash(x * 12.9 + y * 78.2 + z * 37.7);
    const lump = 0.42 + 0.16 * n + 0.06 * Math.sin(x * 5 + z * 3);
    positions[i * 3] = x * lump;
    positions[i * 3 + 1] = y * lump * 0.72;
    positions[i * 3 + 2] = z * lump;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Per-instance seed and heat for an instanced rock mesh. */
export function addRockInstanceAttributes(geometry, capacity) {
  const seed = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) seed[i] = hash(i * 3.7 + 0.5);
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
  const heat = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  heat.setUsage(DynamicDrawUsage); // rewritten every frame while columns cool
  geometry.setAttribute('aHeat', heat);
  return geometry;
}

/**
 * The ground ribbon the fissure is drawn on. Local X runs along the cast
 * (−½ caster … ½ target), local Y across it; the ability lays it flat and
 * scales it to `length × 2·crackWidth`.
 */
export function createFissureGeometry(along = 96, across = 4) {
  const positions = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= across; j++) {
    for (let i = 0; i <= along; i++) {
      const u = i / along;
      const v = j / across;
      positions.push(u - 0.5, v - 0.5, 0);
      uvs.push(u, v);
      if (i < along && j < across) {
        const n = j * (along + 1) + i;
        index.push(n, n + 1, n + along + 1, n + 1, n + along + 2, n + along + 1);
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
 * Flat annulus in the XY plane (the ability turns it onto the floor). UV.x is
 * the angle 0..1, UV.y the radius from `inner` (0) to the rim (1).
 */
export function createShockGeometry(inner = 0.08, rings = 6, sectors = 96) {
  const positions = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const r = inner + (1 - inner) * v;
    for (let i = 0; i <= sectors; i++) {
      const a = (i / sectors) * TAU;
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

/**
 * The debris cloud: `position.x` is the fraction along the line, `position.z`
 * a lateral offset (metres), `aSeed` drives launch speed and size. Three lanes
 * of 32 stations (`i % 32` along the line), each point given its own lateral
 * offset either side of the slit, so the spray reads as coming off both lips
 * of the fissure.
 */
export function createDebrisGeometry() {
  const positions = new Float32Array(DEBRIS_COUNT * 3);
  const seeds = new Float32Array(DEBRIS_COUNT);
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    positions[i * 3] = (i % 32) / 31;
    positions[i * 3 + 2] = Math.sin(i * 9.37) * 0.6;
    seeds[i] = ((i * 37) % 97) / 97;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  return geometry;
}
