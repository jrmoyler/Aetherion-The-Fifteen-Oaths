import { RigBuilder, PI, TAU, star } from './RigKit.js';

/**
 * Sling Volley — procedural geometry.
 *
 * Spinning sling discs: momentum you can hold in a loop of cord.
 * The hero is the sling shot: three notched discs on one axle, each
 * spinning against the next, wobbling on its seat as the throw builds,
 * with a pair of cord loops streaming behind.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A notched disc on a short axle with one cord loop. Centred on y = 0, its largest extent one unit. */
export function createSlingVolleyPieceGeometry() {
  const b = new RigBuilder('slingvolley.piece');
  b.part({ glow: 0.4, pivot: [0, 0, 0], axis: [1, 0, 0], swing: 0.5, stage: 1 });
  b.prism(star(10, 0.34, 0.27), -0.03, 0.03, {});
  b.part({ edge: 0.8 });
  b.lathe([[0.03, -0.5], [0.03, 0.5]], 6, {});
  b.part({ glow: 0.2, pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.5, stage: 1, delay: 0.1 });
  b.at({ p: [0, 0.3, 0] }, () => b.torus(0.18, 0.012, { segs: 14, sides: 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three notched discs, an axle, two cord loops and a pair of cord tails. */
export function createSlingVolleyHeroGeometry() {
  const b = new RigBuilder('slingvolley.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Axle.
    b.part({ edge: 0.8 });
    b.lathe([[0.04, -0.6], [0.04, 0.9]], 6, {});
    // Three notched discs, each tipping against its neighbours.
    [[0.0, 0.5, 0.42], [0.35, 0.42, 0.34], [0.7, 0.34, 0.27]].forEach(([y, R, r], i) => {
      b.part({ glow: 0.3, pivot: [0, y, 0], axis: [Math.cos(i * 2), 0, Math.sin(i * 2)], swing: (i % 2 ? -1 : 1) * 0.45, stage: 1, delay: i * 0.08 });
      b.at({ p: [0, y, 0] }, () => b.prism(star(14, R, r), -0.035, 0.035, {}));
    });
    // Two cord loops streaming behind.
    [0.0, 1.0].forEach((ph, i) => {
      b.part({ crease: 40, edge: 0.3, pivot: [0, -0.2, 0], axis: [1, 0, 0], swing: (i ? -1 : 1) * 0.4, stage: 1 });
      b.tube((t) => [Math.cos(t * TAU + ph) * 0.14 * Math.sin(t * PI) * (i ? 1 : -1), -0.2 - t * 0.7, Math.sin(t * TAU + ph) * 0.14 * Math.sin(t * PI)], { r: 0.012, sides: 4, segs: 20 });
    });
  });
  return b.build();
}
