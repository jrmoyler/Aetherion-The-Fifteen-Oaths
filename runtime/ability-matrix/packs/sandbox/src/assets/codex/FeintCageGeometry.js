import { RigBuilder, PI } from './RigKit.js';

/**
 * Feint Cage — procedural geometry.
 *
 * Alternating false buttresses: half of the cage is a lie.
 * The hero is the feint: eight real pillars round the ring alternating
 * with eight false ones that lean the other way and thin to a thread, a
 * collar tying only the real ones, and a hanging false door in the middle.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. One real bar and one false bar leaning the other way. Centred on y = 0, its largest extent one unit. */
export function createFeintCagePieceGeometry() {
  const b = new RigBuilder('feintcage.piece');
  b.part({ pivot: [-0.15, -0.5, 0], axis: [0, 0, 1], swing: -0.2, stage: 1 });
  b.at({ p: [-0.15, -0.5, 0] }, () => b.box(0.1, 0.9, 0.1, { taper: [0.8, 0.8] }));
  b.part({ glow: 0.4, edge: 0.6, pivot: [0.15, -0.5, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.at({ p: [0.15, -0.5, 0] }, () => b.tube((t) => [t * -0.12, t * 0.9, 0], { r: (t) => 0.03 * (1 - t) + 0.006, sides: 4, segs: 5 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Eight real pillars, eight false pillars, a collar and a hanging false door. */
export function createFeintCageHeroGeometry() {
  const b = new RigBuilder('feintcage.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.torus(1, 0.03, { segs: 40, sides: 4 });
  // Real pillars: solid, leaning inward.
  b.ring(8, 1.0, (i) => {
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.35, stage: 1, delay: (i % 2) * 0.08 });
    b.box(0.12, 1.2, 0.12, { taper: [0.75, 0.75] });
  });
  // False pillars: threads that lean the other way and thin to nothing.
  b.ring(8, 1.0, (i) => {
    b.part({ edge: 0.5, glow: 0.35, pivot: [0, 0, 0], axis: [1, 0, 0], swing: 0.6, stage: 1, delay: 0.1 + (i % 2) * 0.08 });
    b.tube((t) => [0, t * 1.2, -0.06 * t], { r: (t) => 0.05 * (1 - t) + 0.006, sides: 4, segs: 8 });
  }, { phase: PI / 8 });
  b.part({ edge: 0.7 });
  b.at({ p: [0, 1.2, 0] }, () => b.torus(0.86, 0.018, { segs: 36, sides: 4 }));
  // The false door: a framed rectangle hung in the middle.
  b.part({ glow: 0.5, pivot: [0, 1.1, 0], axis: [0, 1, 0], swing: 1.4, stage: 1 });
  b.at({ p: [0, 0.65, 0] }, () => {
    b.at({ p: [-0.22, 0, 0] }, () => b.box(0.05, 0.9, 0.05, { center: true }));
    b.at({ p: [0.22, 0, 0] }, () => b.box(0.05, 0.9, 0.05, { center: true }));
    b.at({ p: [0, 0.45, 0] }, () => b.box(0.5, 0.05, 0.05, { center: true }));
    b.at({ p: [0, -0.45, 0] }, () => b.box(0.5, 0.05, 0.05, { center: true }));
  });
  return b.build();
}
