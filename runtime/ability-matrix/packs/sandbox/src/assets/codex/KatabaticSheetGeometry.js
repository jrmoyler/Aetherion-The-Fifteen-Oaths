import { RigBuilder, PI, rng } from './RigKit.js';

/**
 * Katabatic Sheet — procedural geometry.
 *
 * A katabatic sheet slides downhill along the line and shears sideways.
 * The hero is the sheet: three stacked sails draped down a slope, each
 * rolling over about its own spine on the shear, trailed by streamers.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A curled leaf of air: a ribbon with an S bend and a trailing tuck. Centred on y = 0, its largest extent one unit. */
export function createKatabaticSheetPieceGeometry() {
  const b = new RigBuilder('katabatic.piece');
  b.part({ crease: 55, edge: 0.3, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.8, stage: 1 });
  b.ribbon((t) => [0.22 * Math.sin(t * PI * 1.6), t - 0.5, 0.18 * Math.sin(t * PI)], { w: (t) => 0.1 + 0.28 * Math.sin(t * PI) ** 0.7, segs: 14, twist: 0.8, up: [0, 0, 1] });
  b.part({ crease: 55, edge: 0.3, pivot: [0, -0.3, 0], axis: [0, 0, 1], swing: -0.9, stage: 1, delay: 0.2 });
  b.ribbon((t) => [0.1 * t, -0.3 - t * 0.2, 0.04], { w: (t) => 0.12 * (1 - t), segs: 6, up: [0, 0, 1] });

  // Fold ribs across the leaf and a long trailing streamer.
  b.part({ edge: 0.7 });
  for (let i = 0; i < 4; i++) b.at({ p: [0, -0.3 + i * 0.2, 0.0] }, () => b.torus(0.09 + 0.04 * Math.sin((i / 3) * PI), 0.008, { segs: 8, sides: 3, arc: PI, a0: 0 }));
  b.part({ crease: 55, edge: 0.2, glow: 0.3, pivot: [0, 0.4, 0], axis: [0, 0, 1], swing: -0.7, stage: 1, delay: 0.1 });
  b.ribbon((t) => [0.04 * Math.sin(t * 8), 0.45 + t * 0.4, 0.02], { w: (t) => 0.06 * (1 - t) + 0.005, segs: 10, up: [0, 0, 1] });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three draped sails on a sloping spine, seven streamers and a leading lip. */
export function createKatabaticSheetHeroGeometry() {
  const b = new RigBuilder('katabatic.hero');
  b.fit('mass');
  const rand = rng(61);
  // Three sails, each a ribbon that runs forward and slopes away downhill.
  for (let i = 0; i < 3; i++) {
    b.part({ crease: 50, edge: 0.35, pivot: [0, 0.5, 0.7], axis: [0, 0, 1], swing: (i - 1) * 0.55, stage: 1, delay: i * 0.1, glow: i === 1 ? 0.2 : 0 });
    b.ribbon((t) => [Math.sin(t * PI * 2 + i) * 0.1, 0.95 - i * 0.12 - Math.pow(t, 1.3) * 0.8, t * 1.5 - 0.1], { w: 1.4 - i * 0.35, segs: 26, twist: (t) => Math.sin(t * PI) * 0.15 * (i - 1), up: [0, 1, 0] });
  }
  // Streamers peel off the trailing edge.
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.18;
    b.part({ crease: 55, edge: 0.2, pivot: [x, 0.4, 0.2], axis: [0, 1, 0], swing: (i - 3) * 0.14, stage: 1, delay: 0.1 + i * 0.03 });
    b.ribbon((t) => [x + Math.sin(t * 7 + i) * 0.05 * t, 0.4 - t * 0.35, 0.2 - t * 0.9], { w: (t) => 0.06 * (1 - t) + 0.01, segs: 12, up: [1, 0, 0] });
  }
  // A rolled lip on the leading edge.
  b.part({ crease: 50 });
  b.at({ p: [0, 0.9, 1.35], r: [0, 0, PI / 2] }, () => b.cylinder(0.05, 1.4, 8, { r1: 0.02 }));
  return b.build();
}
