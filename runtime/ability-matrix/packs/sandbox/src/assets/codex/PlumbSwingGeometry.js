import { RigBuilder, PI } from './RigKit.js';

/**
 * Plumb Swing — procedural geometry.
 *
 * A terminal plumb weight: nothing in the swing but the weight at its end.
 * The hero is the plumb: a stiff rod from the hand ending in a ring and
 * cord, and a heavy brass bob hung from them, point down, that swings
 * under the rod on the beat.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A short cord and a pointed brass bob. Centred on y = 0, its largest extent one unit. */
export function createPlumbSwingPieceGeometry() {
  const b = new RigBuilder('plumbswing.piece');
  b.part({ pivot: [0, 0.5, 0], axis: [0, 0, 1], swing: 0.45, stage: 1 });
  b.tube((t) => [0, 0.5 - t * 0.35, 0], { r: 0.01, sides: 4, segs: 3 });
  b.part({ glow: 0.4, pivot: [0, 0.5, 0], axis: [0, 0, 1], swing: 0.45, stage: 1 });
  b.at({ p: [0, -0.5, 0] }, () => b.lathe([[0.001, 0.62], [0.12, 0.5], [0.12, 0.34], [0.14, 0.3], [0.1, 0.1], [0.001, -0.1]], 9, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A rod, a suspension ring, a cord, a brass bob with collar and a point, and a balance ring. */
export function createPlumbSwingHeroGeometry() {
  const b = new RigBuilder('plumbswing.hero');
  b.fit('mass');
  // The rod from the hand, along +Z.
  b.part({ edge: 0.7 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.lathe([[0.05, -0.1], [0.035, 0.1], [0.025, 1.4]], 8, {}));
  b.at({ p: [0, 0, 1.4] }, () => b.torus(0.06, 0.016, { segs: 10, sides: 4 }));
  // Cord and bob hang under the tip of the rod.
  b.part({ pivot: [0, 0, 1.4], axis: [1, 0, 0], swing: 0.5, stage: 1 });
  b.at({ p: [0, -0.05, 1.4] }, () => b.tube((t) => [0, -t * 0.5, 0], { r: 0.012, sides: 4, segs: 5 }));
  b.part({ glow: 0.4, pivot: [0, 0, 1.4], axis: [1, 0, 0], swing: 0.5, stage: 1 });
  b.at({ p: [0, -1.05, 1.4] }, () => {
    b.lathe([[0.001, 0.52], [0.1, 0.46], [0.11, 0.3], [0.2, 0.22], [0.24, 0.1], [0.2, -0.05], [0.09, -0.32], [0.001, -0.55]], 10, {});
  });
  b.part({ edge: 0.9, glow: 0.2, pivot: [0, 0, 1.4], axis: [1, 0, 0], swing: 0.5, stage: 1 });
  b.at({ p: [0, -0.78, 1.4] }, () => b.torus(0.24, 0.02, { segs: 20, sides: 5 }));
  return b.build();
}
