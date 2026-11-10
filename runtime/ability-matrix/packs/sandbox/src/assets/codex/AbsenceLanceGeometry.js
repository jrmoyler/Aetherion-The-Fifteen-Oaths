import { RigBuilder, PI } from './RigKit.js';

/**
 * Absence Lance — procedural geometry.
 *
 * A split erasure edge: the lance is the gap it leaves.
 * The hero is the absence: a blade cleft along its whole length into two
 * halves with nothing between them, each half bowed away from the cut,
 * and the crumbs of erased matter hanging in the gap. The halves part
 * further on the beat.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Two thin blade halves with a diamond of nothing between them. Centred on y = 0, its largest extent one unit. */
export function createAbsenceLancePieceGeometry() {
  const b = new RigBuilder('absence.piece');
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ pivot: [0, -0.45, 0], axis: [0, 0, 1], swing: -s * 0.3, stage: 1, glow: 0.2 });
    b.at({ p: [s * 0.045, -0.5, 0] }, () => b.blade({ len: 1, w: 0.04, thick: 0.015, bend: 0, segs: 6 }));
  }
  b.part({ glow: 0.9 });
  b.at({ p: [0, 0, 0] }, () => b.orb(0.03, { sides: 4, rings: 2, ey: 1.6 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Two cleft blade halves, a hilt, four erased fragments and a notch collar. */
export function createAbsenceLanceHeroGeometry() {
  const b = new RigBuilder('absence.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Two halves of one blade: mirrored, each bowed away from the cleft.
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      b.part({ pivot: [0, 0.1, 0], axis: [0, 0, 1], swing: -s * 0.22, stage: 1, glow: 0.2 });
      b.at({ p: [s * 0.075, 0.1, 0] }, () => b.blade({ len: 1.8, w: 0.075, thick: 0.02, bend: s * -0.06, segs: 12, shape: (t) => Math.sin(Math.PI * Math.pow(t, 0.55)) * (1 - 0.35 * t) }));
    }
    // Hilt and notch collar.
    b.part({ edge: 0.8 });
    b.lathe([[0.07, 0.12], [0.05, 0], [0.05, -0.3], [0.09, -0.36], [0.001, -0.42]], 8, {});
    b.torus(0.18, 0.02, { segs: 18, sides: 4 });
    // Erased crumbs hanging in the gap.
    for (let i = 0; i < 4; i++) {
      b.part({ glow: 0.9, pivot: [0, 0.5 + i * 0.3, 0], axis: [1, 0, 0], swing: (i % 2 ? 1 : -1) * 0.9, stage: 1, delay: i * 0.07 });
      b.at({ p: [0, 0.4 + i * 0.35, 0] }, () => b.orb(0.035, { sides: 4, rings: 2, ey: 1.6 }));
    }
  });
  return b.build();
}
