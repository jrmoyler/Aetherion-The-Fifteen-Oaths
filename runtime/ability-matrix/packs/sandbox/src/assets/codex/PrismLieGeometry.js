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
