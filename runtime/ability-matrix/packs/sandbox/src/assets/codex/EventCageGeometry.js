import { RigBuilder, PI } from './RigKit.js';

/**
 * Event Cage — procedural geometry.
 *
 * Inward event-horizon hooks: bars that curl toward the point of no return.
 * The hero is the horizon: nine hooked bars rising from a base ring and
 * curling inward at the crown, an event-horizon ring wrapped round the
 * waist, and a dark core ringed by a flat accretion band.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A hooked bar curling over a bead. Centred on y = 0, its largest extent one unit. */
export function createEventCagePieceGeometry() {
  const b = new RigBuilder('eventcage.piece');
  b.part({ pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.45, stage: 1 });
  b.tube((t) => [Math.sin(Math.pow(t, 2.2) * PI * 0.9) * 0.3, -0.5 + t * 0.9, 0], { r: (t) => 0.04 * (1 - t * 0.6), sides: 5, segs: 14 });
  b.part({ glow: 0.5 });
  b.at({ p: [0.04, 0.05, 0] }, () => b.orb(0.07, { sides: 6, rings: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Nine hooks, a base ring, a horizon ring, a dark core and an accretion band. */
export function createEventCageHeroGeometry() {
  const b = new RigBuilder('eventcage.hero');
  b.fit('ring');
  b.part({ edge: 0.7 });
  b.torus(1, 0.035, { segs: 40, sides: 4 });
  b.ring(9, 0, (i) => {
    b.part({ pivot: [0, 0, 1], axis: [1, 0, 0], swing: -0.5, stage: 1, delay: (i % 3) * 0.06, glow: i % 3 === 0 ? 0.3 : 0 });
    b.tube((t) => [0, t * 1.2, 1 - 0.6 * Math.pow(t, 2.4) - 0.05 * Math.sin(t * 5)], { r: (t) => 0.045 * (1 - 0.55 * t), sides: 5, segs: 22 });
  });
  // The event horizon ring at the waist and a dark core with its accretion band.
  b.part({ glow: 0.5, edge: 0.9 });
  b.at({ p: [0, 0.65, 0] }, () => b.torus(0.72, 0.02, { segs: 36, sides: 4 }));
  b.part({ glow: 0.1 });
  b.at({ p: [0, 0.55, 0] }, () => b.orb(0.2, { sides: 10, rings: 5 }));
  b.part({ glow: 0.9, pivot: [0, 0.55, 0], axis: [1, 0, 0], swing: 0.5, stage: 1 });
  b.at({ p: [0, 0.55, 0] }, () => b.lathe([[0.26, -0.01], [0.5, 0], [0.26, 0.01]], 30, { cap: false }));
  return b.build();
}
