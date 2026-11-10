import { RigBuilder, PI, TAU, lerp, star } from './RigKit.js';

/**
 * Lattice Flare — procedural geometry.
 *
 * A lattice of flares stands up and blooms outward.
 * The hero is the lattice: six slender posts tapering inward with three
 * cross hoops and diagonal braces, each post hinging open from its foot
 * when the flare blooms, and a crossed star burning at the crown.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Two hoops braced by three posts, a tiny star on top. Centred on y = 0, its largest extent one unit. */
export function createLatticeFlarePieceGeometry() {
  const b = new RigBuilder('latticeflare.piece');
  b.part({ edge: 0.8 });
  [-0.3, 0.1].forEach((y, k) => b.at({ p: [0, y, 0] }, () => b.torus(0.2 - k * 0.04, 0.014, { segs: 12, sides: 4 })));
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, -0.4, 0], axis: [Math.cos((i / 3) * TAU + PI / 2), 0, Math.sin((i / 3) * TAU + PI / 2)], swing: 0.5, stage: 1, delay: i * 0.08 });
    const a = (i / 3) * TAU;
    b.tube((t) => [Math.cos(a) * lerp(0.2, 0.12, t), lerp(-0.4, 0.3, t), Math.sin(a) * lerp(0.2, 0.12, t)], { r: 0.012, sides: 4, segs: 5 });
  }
  b.part({ glow: 1 });
  b.at({ p: [0, 0.42, 0] }, () => b.prism(star(4, 0.14, 0.04), 0, 0.03, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Six posts, three hoops, twelve diagonal braces and a six-ray crown star. */
export function createLatticeFlareHeroGeometry() {
  const b = new RigBuilder('latticeflare.hero');
  b.fit('mass');
  const post = (i, t) => {
    const a = (i / 6) * TAU;
    return [Math.cos(a) * lerp(0.7, 0.28, t), t * 1.6, Math.sin(a) * lerp(0.7, 0.28, t)];
  };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.part({ pivot: [Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.55, stage: 1, delay: (i % 2) * 0.08, glow: 0.15 });
    b.tube((t) => post(i, t), { r: 0.018, sides: 5, segs: 12 });
  }
  // Hoops, and the braces that make the cage a lattice.
  b.part({ edge: 0.8, glow: 0.2 });
  [0.3, 0.8, 1.3].forEach((y) => b.at({ p: [0, y, 0] }, () => b.torus(lerp(0.7, 0.28, y / 1.6) + 0.01, 0.014, { segs: 24, sides: 4 })));
  b.part({ edge: 0.8 });
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    [[0.0, 0.5], [0.5, 1.0]].forEach(([t0, t1], k) => {
      const A = post(i, t0 + (k ? 0.0 : 0));
      const B = post(j, t1);
      b.tube((t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)], { r: 0.007, sides: 3, segs: 2 });
    });
  }
  // The crown: a crossed star.
  b.part({ glow: 1 });
  b.at({ p: [0, 1.65, 0] }, () => {
    b.orb(0.1, { sides: 6, rings: 3 });
    b.ring(6, 0.05, () => b.at({ r: [PI / 2, 0, 0] }, () => b.blade({ len: 0.3, w: 0.035, thick: 0.01, segs: 3 })), { y: 0 });
  });
  return b.build();
}
