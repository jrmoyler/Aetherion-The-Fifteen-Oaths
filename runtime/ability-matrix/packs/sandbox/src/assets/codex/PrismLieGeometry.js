import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Prism Lie — procedural geometry.
 *
 *  - `createPrismCrystalGeometry` — a triangular prism standing on Y with a
 *    pyramid cap at each end: a crystal you can read as *three-sided* from any
 *    angle. Non-indexed, so every facet is flat-shaded. Unit circumradius, body
 *    from y = −0.5 to 0.5, caps reaching `cap` further. `aFacet` per vertex:
 *    (facet id 0..8, 0 body / 1 cap).
 *  - `createPrismShardGeometry` — a thin, sharp triangular sliver for the
 *    shatter: three long edges meeting in a point, one short base.
 *  - `createPrismTetherGeometry` — three strips (one per pair of prisms) for
 *    the threads of light strung between them; `position.x` along 0..1,
 *    `position.y` across −1..1, `position.z` = which pair.
 *  - `createPrismStripGeometry` — the floor strip the braided trails are
 *    drawn on, along +X 0..1 and across Z −1..1.
 */
export function createPrismCrystalGeometry(cap = 0.45) {
  const positions = [];
  const facets = [];
  const corner = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    corner.push([Math.cos(a), Math.sin(a)]);
  }
  const tri = (a, b, c, id, isCap) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) facets.push(id, isCap);
  };
  const top = [0, 0.5 + cap, 0];
  const bot = [0, -0.5 - cap, 0];
  for (let k = 0; k < 3; k++) {
    const c0 = corner[k];
    const c1 = corner[(k + 1) % 3];
    const a0 = [c0[0], -0.5, c0[1]];
    const a1 = [c1[0], -0.5, c1[1]];
    const b0 = [c0[0], 0.5, c0[1]];
    const b1 = [c1[0], 0.5, c1[1]];
    // Body facet, outward winding.
    tri(a0, b1, a1, k, 0);
    tri(a0, b0, b1, k, 0);
    // The caps.
    tri(b0, top, b1, 3 + k, 1);
    tri(a0, a1, bot, 6 + k, 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacet', new Float32BufferAttribute(facets, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A sliver: base triangle at y = 0, apex at y = 1. Unit size; scaled per instance. */
export function createPrismShardGeometry() {
  const b0 = [0.0, 0, 0.22];
  const b1 = [-0.19, 0, -0.11];
  const b2 = [0.19, 0, -0.11];
  const apex = [0.03, 1, 0.02];
  const positions = [...b0, ...b1, ...b2, ...b0, ...apex, ...b1, ...b1, ...apex, ...b2, ...b2, ...apex, ...b0];
  const facets = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 3, 0, 3, 0, 3, 0];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacet', new Float32BufferAttribute(facets, 2));
  geometry.translate(0, -0.35, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The truth, planted: a rooted crystal you could only cut from this spell.
 *
 * A triangular prism whose three arrises are **chamfered** (each corner is two
 * points, so the section is a long-short hexagon that still reads as three-
 * sided), stacked in `rings` bands that **taper** toward the top and **twist**
 * a little per band, every corner jittered from a fixed hash so the faces
 * catch the sun at slightly different angles. A sheared cap rises to an apex
 * pushed off-centre — a cut stone, not a pencil. The foot flares and sinks
 * below y = 0 so it reads as torn out of the floor rather than set on it.
 *
 * Unit space: circumradius 1 at the foot, body y 0..1, apex at `1 + cap`.
 * Non-indexed (flat facets for a lit, flat-shaded material).
 *
 * @param {object} [o]
 * @param {number} [o.cap]     apex height above the body (× height)
 * @param {number} [o.taper]   0 straight .. 1 to a point at the top band
 * @param {number} [o.twist]   radians of twist from foot to top
 * @param {number} [o.chamfer] 0..0.45 how much of each arris is cut away
 * @param {number} [o.rings]   bands up the body
 * @param {number} [o.seed]
 */
export function createPrismMonolithGeometry(o = {}) {
  const cap = o.cap ?? 0.45;
  const taper = o.taper ?? 0.35;
  const twist = o.twist ?? 0.25;
  const chamfer = o.chamfer ?? 0.18;
  const rings = Math.max(2, o.rings ?? 6);
  const seed = o.seed ?? 1.7;
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const SIDE = 6; // 3 corners × 2 chamfer points
  const ringsPts = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    // Foot flare below the floor; body above.
    const y = r === 0 ? -0.12 : v;
    const radius = (r === 0 ? 1.12 : 1 - taper * Math.pow(v, 1.3)) * (1 + (hash(r * 7.1) - 0.5) * 0.06);
    const rot = twist * v + (hash(r * 3.3) - 0.5) * 0.05;
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2 + rot;
      for (const sgn of [-1, 1]) {
        // Chamfer: step back from the corner toward the neighbouring corner.
        const ang = a + sgn * chamfer * (Math.PI / 3);
        const rr = radius * (1 - chamfer * 0.35) * (1 + (hash(r * 13.7 + k * 5.1 + sgn) - 0.5) * 0.08);
        pts.push([Math.cos(ang) * rr, y + (hash(r * 2.9 + k + sgn * 0.5) - 0.5) * (r === 0 || r === rings ? 0 : 0.035), Math.sin(ang) * rr]);
      }
    }
    ringsPts.push(pts);
  }
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let r = 0; r < rings; r++) {
    const lo = ringsPts[r];
    const hi = ringsPts[r + 1];
    for (let s = 0; s < SIDE; s++) {
      const s1 = (s + 1) % SIDE;
      tri(lo[s], hi[s1], lo[s1]);
      tri(lo[s], hi[s], hi[s1]);
    }
  }
  // The sheared cap: apex off-centre, toward the first face.
  const top = ringsPts[rings];
  const apex = [0.18 * (1 - taper), 1 + cap, -0.1 * (1 - taper)];
  for (let s = 0; s < SIDE; s++) tri(top[s], apex, top[(s + 1) % SIDE]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPrismTetherGeometry(segments = 32) {
  const positions = [];
  const indices = [];
  for (let pair = 0; pair < 3; pair++) {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const s = i / segments;
      positions.push(s, -1, pair, s, 1, pair);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createPrismStripGeometry(segments = 160, across = 6) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    for (let j = 0; j <= across; j++) positions.push(s, 0, (j / across) * 2 - 1);
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j;
      const b = a + across + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}
