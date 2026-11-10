import { RigBuilder, PI, star } from './RigKit.js';

/**
 * Aureole Ring — procedural geometry.
 *
 * An aureole tightens on the circle and flares when it meets.
 * The hero is the sunburst: a bright core ring set with twenty-four rays
 * of alternating length, laid flat and lifting to the vertical as the ring
 * flares.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A flat sixteen-point sun with a bead at its centre. Centred on y = 0, its largest extent one unit. */
export function createAureoleRingPieceGeometry() {
  const b = new RigBuilder('aureole.piece');
  b.part({ glow: 0.5 });
  b.prism(star(8, 0.45, 0.2), 0, 0.05, {});
  b.part({ glow: 1, pivot: [0, 0.03, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.at({ p: [0, 0.07, 0] }, () => b.orb(0.07, { sides: 6, rings: 3 }));
  b.part({ edge: 0.8, pivot: [0, 0.03, 0], axis: [1, 0, 0], swing: -0.9, stage: 1, delay: 0.1 });
  b.at({ p: [0, 0.03, 0] }, () => b.torus(0.3, 0.015, { segs: 14, sides: 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A bright core ring, a wide guard ring, twenty-four rays and ray beads. */
export function createAureoleRingHeroGeometry() {
  const b = new RigBuilder('aureole.hero');
  b.fit('ring');
  b.part({ glow: 0.7 });
  b.at({ p: [0, 0.04, 0] }, () => b.torus(0.82, 0.045, { segs: 48, sides: 6 }));
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.02, 0] }, () => b.torus(1.0, 0.018, { segs: 48, sides: 4 }));
  // Twenty-four rays, alternately long and short, laid flat and lifting.
  b.ring(24, 0.84, (i) => {
    const long = i % 2 === 0;
    b.part({ pivot: [0, 0.04, 0], axis: [1, 0, 0], swing: -1.1, stage: 1, delay: long ? 0 : 0.1, glow: long ? 0.4 : 0.15 });
    b.at({ p: [0, 0.04, 0], r: [PI / 2 - 0.05, 0, 0] }, () => b.blade({ len: long ? 0.42 : 0.26, w: long ? 0.055 : 0.04, thick: 0.012, segs: 4 }));
  });
  // Beads at the tips of the long rays.
  b.part({ glow: 1 });
  b.ring(12, 1.3, () => b.orb(0.03, { sides: 4, rings: 2 }), { y: 0.05, phase: 0 });
  return b.build();
}
