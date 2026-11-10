import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Glamour Sweep — procedural geometry.
 *
 * A double-folded silk sheet: pretty, and it does not tell you where the edge is.
 * The hero is the silk: four long cloths fanning from a cuff at the hand,
 * each folded double and undulating out of step with the others, spread
 * wide as the glamour lands.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A folded silk strip with a trailing tassel. Centred on y = 0, its largest extent one unit. */
export function createGlamourSweepPieceGeometry() {
  const b = new RigBuilder('glamour.piece');
  b.part({ crease: 55, edge: 0.15, pivot: [0, -0.4, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.ribbon((t) => [0.1 * Math.sin(t * TAU), t * 0.9 - 0.45, 0.1 * Math.sin(t * TAU * 2)], { w: 0.2, segs: 16, twist: 1.2, up: [0, 0, 1] });
  b.part({ glow: 0.5, pivot: [0, -0.4, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.at({ p: [0, 0.48, 0] }, () => b.pyramid(4, 0.03, 0.12, {}));

  // A second, shorter fold and a tassel cord.
  b.part({ crease: 55, edge: 0.15, pivot: [0, -0.4, 0], axis: [0, 0, 1], swing: -0.5, stage: 1, delay: 0.1 });
  b.ribbon((t) => [-0.08 + 0.1 * Math.sin(t * TAU + 1), t * 0.7 - 0.4, 0.05 + 0.08 * Math.sin(t * TAU * 2 + 1)], { w: 0.12, segs: 12, twist: -1.0, up: [0, 0, 1] });
  b.part({ glow: 0.6 });
  b.at({ p: [0, -0.45, 0] }, () => b.pyramid(4, 0.03, -0.12, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A hand cuff, four double-folded silk cloths and four tassels. */
export function createGlamourSweepHeroGeometry() {
  const b = new RigBuilder('glamour.hero');
  b.fit('mass');
  b.part({ glow: 0.5, edge: 0.8 });
  b.aimZ(() => b.lathe([[0.12, -0.12], [0.1, 0], [0.07, 0.2]], 10, { cap: false }));
  for (let i = 0; i < 4; i++) {
    const spread = (i - 1.5) * 0.35;
    b.part({ crease: 55, edge: 0.15, pivot: [0, 0.4, 0], axis: [0, 1, 0], swing: spread * 0.9, stage: 1, delay: i * 0.05, glow: i % 2 ? 0.2 : 0 });
    // Folded double: the cloth runs out and back, so each strip is two ribbons joined at the fold.
    const path = (t) => [Math.sin(t * 9 + i * 1.3) * 0.12 + spread * t * 0.9, 0.4 + Math.sin(t * 4 + i) * 0.1 - t * 0.12, t * 1.7];
    b.ribbon(path, { w: (t) => 0.3 * (0.5 + 0.5 * Math.sin(t * PI * 0.9)) + 0.04, segs: 36, twist: (t) => Math.sin(t * 5 + i) * 0.8, up: [0, 1, 0] });
    b.ribbon((t) => { const p = path(t * 0.7); return [p[0], p[1] - 0.05, p[2] * 0.97]; }, { w: (t) => 0.2 * (0.5 + 0.5 * Math.sin(t * PI)) + 0.02, segs: 24, twist: (t) => Math.sin(t * 5 + i + 1) * 0.8, up: [0, 1, 0] });
    const end = path(1);
    b.at({ p: end }, () => b.pyramid(4, 0.04, 0.14, {}));
  }
  return b.build();
}
