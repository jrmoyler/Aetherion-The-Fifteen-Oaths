import { RigBuilder } from './RigKit.js';

/**
 * Hollow Volley — procedural geometry.
 *
 * Hollow implosion cups: shells that are mostly the space inside them.
 * The hero is the nest: three open cups set mouth-forward one inside
 * another, each smaller than the last, spaced along the flight, their
 * rims flaring wider as they inhale and the whole nest twisting.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A single hollow cup with a thin rim. Centred on y = 0, its largest extent one unit. */
export function createHollowVolleyPieceGeometry() {
  const b = new RigBuilder('hollowvolley.piece');
  b.part({ crease: 30, pivot: [0, 0.2, 0], axis: [0, 0, 1], swing: 0.4, stage: 1 });
  b.lathe([[0.001, -0.45], [0.18, -0.38], [0.3, -0.1], [0.34, 0.3]], 10, { cap: false });
  b.part({ edge: 1, glow: 0.4, pivot: [0, 0.3, 0], axis: [1, 0, 0], swing: 0.4, stage: 1 });
  b.at({ p: [0, 0.3, 0] }, () => b.torus(0.34, 0.018, { segs: 16, sides: 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three nested open cups, three rims, a hollow centre rod and a rear hook. */
export function createHollowVolleyHeroGeometry() {
  const b = new RigBuilder('hollowvolley.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Three nested cups, mouth toward +z after aimZ.
    [[0.55, 0.9], [0.4, 0.55], [0.26, 0.28]].forEach(([r, h], i) => {
      const base = -0.2 + i * 0.4;
      b.part({ crease: 30, pivot: [0, base + h, 0], axis: [1, 0, 0], swing: 0.3 + i * 0.1, stage: 1, delay: i * 0.08 });
      b.at({ p: [0, base, 0] }, () => b.lathe([[0.001, 0], [r * 0.5, h * 0.12], [r * 0.85, h * 0.5], [r, h]], 20, { cap: false }));
      b.part({ edge: 1, glow: 0.3 + 0.2 * i, pivot: [0, base + h, 0], axis: [1, 0, 0], swing: 0.3 + i * 0.1, stage: 1, delay: i * 0.08 });
      b.at({ p: [0, base + h, 0] }, () => b.torus(r, 0.02, { segs: 24, sides: 4 }));
    });
    // The hollow centre: a thin open rod.
    b.part({ edge: 0.7 });
    b.lathe([[0.03, -0.3], [0.03, 1.1]], 6, { cap: false });
    // The rear hook that drags the nest.
    b.part({ glow: 0.5 });
    b.tube((t) => [Math.sin(t * 2.6) * 0.18, -0.3 - t * 0.35, 0], { r: 0.018, sides: 4, segs: 8 });
  });
  return b.build();
}
