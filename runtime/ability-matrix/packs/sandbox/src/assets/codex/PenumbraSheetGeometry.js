import { RigBuilder, PI, rng } from './RigKit.js';

/**
 * Penumbra Sheet — procedural geometry.
 *
 * A frayed shadow membrane: a sheet with no clean edge.
 * The hero is the veil: two layers of torn membrane hung from a ragged
 * spine, each fraying into hanging threads, drifting past one another
 * in opposite directions as it shears.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A torn shred of shadow with three trailing threads. Centred on y = 0, its largest extent one unit. */
export function createPenumbraSheetPieceGeometry() {
  const b = new RigBuilder('penumbra.piece');
  const rand = rng(101);
  b.part({ crease: 50, edge: 0.15 });
  b.ribbon((t) => [0.05 * Math.sin(t * 6), 0.5 - t * 0.9, 0.06 * Math.sin(t * 4)], { w: (t) => 0.3 * (1 - t * 0.5) * (0.65 + 0.35 * Math.abs(Math.sin(t * 21))), segs: 14, up: [0, 0, 1] });
  for (let i = 0; i < 3; i++) {
    b.part({ crease: 50, edge: 0.1, pivot: [(i - 1) * 0.1, -0.3, 0], axis: [0, 0, 1], swing: (i - 1) * 0.6, stage: 1, delay: i * 0.1 });
    b.ribbon((t) => [(i - 1) * 0.1 + Math.sin(t * 5 + i) * 0.04, -0.3 - t * 0.28, 0], { w: (t) => 0.022 * (1 - t) + 0.004, segs: 6, up: [0, 0, 1] });
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Two ragged membranes, a spine, nine hanging threads and two tatter wisps. */
export function createPenumbraSheetHeroGeometry() {
  const b = new RigBuilder('penumbra.hero');
  b.fit('mass');
  const rand = rng(103);
  // The spine along the side axis.
  b.part({ glow: 0.3 });
  b.at({ p: [-1.0, 1.0, 0], r: [0, 0, -PI / 2] }, () => b.lathe([[0.03, 0], [0.04, 1], [0.02, 2]], 6, {}));
  // Two torn membranes, facing opposite ways.
  for (let layer = 0; layer < 2; layer++) {
    b.part({ crease: 55, edge: 0.15, pivot: [0, 1.0, 0], axis: [0, 1, 0], swing: layer ? -0.4 : 0.4, stage: 1, delay: layer * 0.1 });
    b.ribbon((t) => [(t - 0.5) * 2.0, 1.0 - 0.9 * 0, (layer ? 0.1 : -0.1) + 0.12 * Math.sin(t * 7 + layer * 2)], { w: 0.01, segs: 2, up: [0, 0, 1] });
    const hang = (i) => 0.55 + 0.35 * Math.abs(Math.sin(i * 1.9 + layer)) + rand() * 0.1;
    for (let i = 0; i < 10; i++) {
      const x = -0.95 + i * 0.21 + layer * 0.1;
      const len = hang(i);
      b.ribbon((t) => [x + Math.sin(t * 4 + i) * 0.04, 1.0 - t * len, (layer ? 0.1 : -0.1) + 0.12 * Math.sin((x + 1) * 3.5 + layer * 2) + t * 0.05], { w: (t) => 0.2 * (1 - t * 0.6), segs: 10, up: [0, 0, 1] });
    }
  }
  // Hanging threads from the membrane's frayed edge.
  for (let i = 0; i < 9; i++) {
    const x = -0.9 + i * 0.22;
    b.part({ crease: 55, edge: 0.1, pivot: [x, 0.4, 0], axis: [0, 0, 1], swing: Math.sin(i * 1.3) * 0.4, stage: 1, delay: 0.1 + (i % 3) * 0.05 });
    b.ribbon((t) => [x + Math.sin(t * 6 + i) * 0.04, 0.4 - t * (0.3 + 0.25 * Math.abs(Math.sin(i * 2.3))), 0.02], { w: (t) => 0.02 * (1 - t) + 0.004, segs: 8, up: [0, 0, 1] });
  }
  return b.build();
}
