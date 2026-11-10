import { RigBuilder, PI, lerp } from './RigKit.js';

/**
 * Tensor Cage — procedural geometry.
 *
 * Cross-braced tension struts: a cage made of what holds it apart.
 * The hero is the frame: six braced panels round the ring, each a pair of
 * crossing diagonals with a turnbuckle where they meet and posts at the
 * corners, joined by a top and a bottom ring. Each panel leans in as the
 * tension is taken up.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. An X-braced panel with a turnbuckle. Centred on y = 0, its largest extent one unit. */
export function createTensorCagePieceGeometry() {
  const b = new RigBuilder('tensor.piece');
  b.part({ edge: 0.8, pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.25, stage: 1 });
  [-0.25, 0.25].forEach((x) => b.at({ p: [x, -0.5, 0] }, () => b.box(0.05, 1.0, 0.05, {})));
  b.part({ edge: 0.5, glow: 0.3, pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.25, stage: 1 });
  b.tube((t) => [lerp(-0.25, 0.25, t), lerp(-0.5, 0.5, t), 0], { r: 0.012, sides: 4, segs: 3 });
  b.tube((t) => [lerp(0.25, -0.25, t), lerp(-0.5, 0.5, t), 0], { r: 0.012, sides: 4, segs: 3 });
  b.part({ glow: 0.9, pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.25, stage: 1 });
  b.at({ p: [0, 0, 0] }, () => b.orb(0.04, { sides: 6, rings: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Six X-braced panels, twelve posts, twelve diagonals, turnbuckles and two rings. */
export function createTensorCageHeroGeometry() {
  const b = new RigBuilder('tensor.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.torus(1, 0.03, { segs: 40, sides: 4 });
  b.at({ p: [0, 1.1, 0] }, () => b.torus(0.9, 0.03, { segs: 40, sides: 4 }));
  b.ring(6, 0, (i) => {
    const w = 0.5;
    b.part({ pivot: [0, 0, 1], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 2) * 0.08, edge: 0.8 });
    [-w, w].forEach((x) => b.at({ p: [x, 0, 1] }, () => b.cylinder(0.025, 1.1, 5, { r1: 0.02 })));
    b.part({ pivot: [0, 0, 1], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 2) * 0.08, edge: 0.5, glow: 0.2 });
    b.tube((t) => [lerp(-w, w, t), lerp(0, 1.1, t), lerp(1, 0.9, t)], { r: 0.01, sides: 4, segs: 3 });
    b.tube((t) => [lerp(w, -w, t), lerp(0, 1.1, t), lerp(1, 0.9, t)], { r: 0.01, sides: 4, segs: 3 });
    b.part({ pivot: [0, 0, 1], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 2) * 0.08, glow: 0.9 });
    b.at({ p: [0, 0.55, 0.95] }, () => b.at({ r: [0, 0, PI / 2] }, () => b.cylinder(0.03, 0.12, 6, {})));
  }, { phase: PI / 6 });
  return b.build();
}
