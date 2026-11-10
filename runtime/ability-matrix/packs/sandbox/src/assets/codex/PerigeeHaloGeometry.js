import { RigBuilder, TAU } from './RigKit.js';

/**
 * Perigee Halo — procedural geometry.
 *
 * An eccentric low-orbit hoop: the circle is held, then let swing.
 * The hero is the orbit: an elliptical hoop tipped against the ground,
 * an outer guide hoop, a moon on the near arc and a banded planet in the
 * focus. The hoops roll over on the beat.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A tilted elliptical hoop with a moon bead. Centred on y = 0, its largest extent one unit. */
export function createPerigeeHaloPieceGeometry() {
  const b = new RigBuilder('perigee.piece');
  b.part({ edge: 0.8, pivot: [0, 0, 0], axis: [1, 0, 0], swing: 0.9, stage: 1 });
  b.at({ r: [0.5, 0, 0.2] }, () => b.tube((t) => [Math.cos(t * TAU) * 0.4, 0, Math.sin(t * TAU) * 0.24], { r: 0.018, sides: 5, segs: 24, closed: true }));
  b.part({ glow: 0.8, pivot: [0, 0, 0], axis: [1, 0, 0], swing: 0.9, stage: 1 });
  b.at({ r: [0.5, 0, 0.2] }, () => b.at({ p: [0.4, 0, 0] }, () => b.orb(0.06, { sides: 6, rings: 3 })));
  b.part({ glow: 0.4 });
  b.orb(0.1, { sides: 8, rings: 4 });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Two tilted elliptical hoops, a moon, a banded planet and an equator band. */
export function createPerigeeHaloHeroGeometry() {
  const b = new RigBuilder('perigee.hero');
  b.fit('ring');
  // The planet and its equator band.
  b.part({ glow: 0.4 });
  b.at({ p: [0, 0.35, 0] }, () => b.orb(0.22, { sides: 12, rings: 6 }));
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.35, 0], r: [0, 0, 0.35] }, () => b.torus(0.3, 0.018, { segs: 30, sides: 4 }));
  // Two elliptical hoops, tilted differently, rolling on the beat.
  [[1.0, 0.7, 0.28], [0.8, 0.55, -0.2]].forEach(([A, B, tilt], i) => {
    b.part({ pivot: [0, 0.35, 0], axis: [1, 0, 0], swing: 0.8 + i * 0.3, stage: 1, delay: i * 0.1, edge: 0.8, glow: i ? 0.2 : 0.3 });
    b.at({ p: [0, 0.35, 0], r: [tilt, i * 1.0, tilt * 0.5] }, () => b.tube((t) => [Math.cos(t * TAU) * A, 0, Math.sin(t * TAU) * B], { r: 0.03 - i * 0.008, sides: 5, segs: 56, closed: true }));
  });
  // The moon on the near arc of the first hoop.
  b.part({ glow: 0.8, pivot: [0, 0.35, 0], axis: [1, 0, 0], swing: 0.8, stage: 1 });
  b.at({ p: [0, 0.35, 0], r: [0.28, 0, 0.14] }, () => b.at({ p: [Math.cos(2.2) * 1.0, 0, Math.sin(2.2) * 0.7] }, () => b.orb(0.1, { sides: 7, rings: 4 })));
  return b.build();
}
