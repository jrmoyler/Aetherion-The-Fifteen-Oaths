import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Vector Breakwater — the procedural meshes.
 *
 * The shield front is a cambered, tapered sheet (not a quad): its width runs
 * x −0.5..0.5, it rises y 0..1 under a half-ellipse taper so the tips are
 * low, and it bows forward along +Z most at the foot — a wave leaning into
 * what it hits. The ability scales it to the corridor width and front height.
 * The ribs, fins, contact petals, brace chevrons and wake crest are all hand
 * built to sit on that sheet or the floor.
 */

const TAU = Math.PI * 2;

/** Forward camber of the sheet at (x, y), shared by the sheet and its ribs. */
function camber(x, y) {
  return 0.12 * (1 - 4 * x * x) * (1 - y);
}

/**
 * The shield sheet: a 56 × 12 grid. `uv.x` runs across, `uv.y` up, which the
 * front shader reads for its rim, sides and slash lines. The top edge is
 * gently scalloped so the silhouette is not a perfect ellipse.
 */
export function createFrontGeometry(nx = 56, ny = 12) {
  const positions = [];
  const uv = [];
  const indices = [];
  for (let j = 0; j <= ny; j++) {
    const y = j / ny;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const x = u * 2 - 1;
      const taper = Math.sqrt(Math.max(0, 1 - x * x));
      const scallop = 1 - 0.05 * Math.pow(Math.abs(Math.sin(x * Math.PI * 2.5)), 2) * y;
      positions.push(x * 0.5, y * taper * scallop, camber(x * 0.5, y));
      uv.push(u, y);
      if (i < nx && j < ny) {
        const a = j * (nx + 1) + i;
        const b = a + nx + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Five curved internal splines that reinforce each sheet. Each rib is a thin
 * ribbon swept up the sheet's camber, converging slightly toward the crest;
 * `uv.y` runs along the rib so the shader can send pulses up it.
 */
export function createRibGeometry(segments = 20) {
  const positions = [];
  const uv = [];
  const sample = (rib, t, side) => {
    const y = 0.08 + t * 0.78;
    const x = rib * 0.105 * (1 - t * 0.38) + side * 0.006;
    return [x, y, camber(x, y) + 0.012];
  };
  for (let rib = -2; rib <= 2; rib++) {
    for (let s = 0; s < segments; s++) {
      const a = s / segments;
      const b = (s + 1) / segments;
      positions.push(...sample(rib, a, -1), ...sample(rib, b, -1), ...sample(rib, a, 1));
      positions.push(...sample(rib, a, 1), ...sample(rib, b, -1), ...sample(rib, b, 1));
      uv.push(0, a, 0, b, 1, a, 1, a, 0, b, 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A pressure fin: a raised, asymmetric tetrahedral blade trailing each front.
 * Closed, so it reads solid from any side when it is flung clear.
 */
export function createFinGeometry() {
  const apex = [0, 0.7, 0];
  const l = [-0.3, 0, -0.3];
  const r = [0.3, 0, -0.3];
  const nose = [0, 0, 0.45];
  const positions = [
    ...apex, ...l, ...r,
    ...apex, ...r, ...nose,
    ...apex, ...nose, ...l,
    ...l, ...nose, ...r,
  ];
  // uv.y = 1 at the apex so the shader can burn the tip.
  const uv = [1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0.5, 0, 1, 0];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Broken, directional pressure petals round a real contact: ten blades of
 * three lengths, so the burst has a jagged star silhouette rather than a
 * ring. `uv.x` is 0 at the root and 1 at the tip.
 */
export function createContactGeometry(petals = 10) {
  const positions = [];
  const uv = [];
  for (let i = 0; i < petals; i++) {
    const angle = (i * TAU) / petals;
    const length = 0.6 + (i % 3) * 0.16;
    const a = angle - 0.1;
    const b = angle + 0.1;
    positions.push(
      Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16,
      Math.cos(angle) * length, 0, Math.sin(angle) * length,
      Math.cos(b) * 0.16, 0, Math.sin(b) * 0.16,
    );
    uv.push(0, 0, 1, 0.5, 0, 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The wake crest: a ring whose band breathes in width round its length and
 * carries a low standing lip, so it reads as a breaking wave front rather
 * than a printed circle. Radius ~1, lying in XZ. `uv.x` round, `uv.y` 0 inner
 * → 1 outer; the lip is the outer half.
 */
export function createWakeGeometry(segments = 96) {
  const positions = [];
  const uv = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * TAU;
    const breathe = 0.06 * Math.sin(a * 5) + 0.04 * Math.sin(a * 11 + 1.3);
    const inner = 0.8 + breathe;
    const crest = 0.94 + breathe * 0.5;
    const outer = 1.0;
    // inner floor ring, standing crest, outer floor ring
    positions.push(Math.cos(a) * inner, 0, Math.sin(a) * inner);
    positions.push(Math.cos(a) * crest, 0.12 + breathe, Math.sin(a) * crest);
    positions.push(Math.cos(a) * outer, 0, Math.sin(a) * outer);
    uv.push(t, 0, t, 0.6, t, 1);
  }
  for (let i = 0; i < segments; i++) {
    const k = i * 3;
    for (let r = 0; r < 2; r++) {
      const a = k + r;
      const b = a + 1;
      const c = a + 3;
      const d = b + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The brace at the caster's feet: three nested chevrons pointing down the
 * lane (+Z), one per front, flat on the floor. Each chevron's vertices carry
 * its index in `uv.x` (0, 0.5, 1) so one shader can flare them separately,
 * and the distance along its arm in `uv.y`.
 */
export function createBraceGeometry() {
  const positions = [];
  const uv = [];
  const indices = [];
  const thickness = 0.09;
  for (let k = 0; k < 3; k++) {
    const z = 0.2 + k * 0.32;
    // A chevron is two arms meeting at the tip (0, z + 0.3).
    for (const side of [-1, 1]) {
      const tipX = 0;
      const tipZ = z + 0.3;
      const endX = side * 0.5;
      const endZ = z;
      const s = positions.length / 3;
      positions.push(tipX, 0, tipZ, endX, 0, endZ, endX, 0, endZ - thickness, tipX, 0, tipZ - thickness);
      const id = k / 2;
      uv.push(id, 0, id, 1, id, 1, id, 0);
      indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** A vertical unit sheet (x −0.5..0.5, y 0..1) for the per-front warp proxy. */
export function createSheetGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3),
  );
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** The corridor floor: a flat unit quad in XZ, z −0.5..0.5, uv.y along the lane. */
export function createCorridorGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3),
  );
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
}
