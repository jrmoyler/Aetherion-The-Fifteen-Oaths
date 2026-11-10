import { RigBuilder, TAU, helixPath } from './RigKit.js';

/**
 * Surge Well — procedural geometry.
 *
 * Spiral spillway ribs: the well pours itself upward.
 * The hero is the spillway: a tapered surge column wound with three
 * rising spiral ribbons that widen from throat to lip, ringed with twelve
 * spillway ribs in a ramp, the ribs fanning outward as it surges.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A short surge column with one spiral ribbon. Centred on y = 0, its largest extent one unit. */
export function createSurgeWellPieceGeometry() {
  const b = new RigBuilder('surgewell.piece');
  b.part({ glow: 0.4 });
  b.lathe([[0.1, -0.5], [0.06, 0], [0.04, 0.5]], 7, {});
  b.part({ crease: 40, edge: 0.4, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.0, stage: 1 });
  b.ribbon(helixPath(0.1, 0.3, 1.4, 0.9, -0.45, 0), { w: 0.08, segs: 24, thick: 0.01, up: [0, 1, 0] });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A tapered column, three widening spiral ribbons and twelve ramp ribs. */
export function createSurgeWellHeroGeometry() {
  const b = new RigBuilder('surgewell.hero');
  b.fit('ring');
  b.part({ glow: 0.5 });
  b.lathe([[0.2, 0], [0.14, 0.3], [0.1, 0.9], [0.06, 1.5]], 12, {});
  for (let i = 0; i < 3; i++) {
    b.part({ crease: 40, edge: 0.4, glow: 0.2, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.9 - i * 0.2, stage: 1, delay: i * 0.08 });
    b.ribbon(helixPath(0.18, 0.85, 1.5, 1.3, 0.04, (i / 3) * TAU), { w: 0.14, segs: 60, thick: 0.014, up: [0, 1, 0] });
  }
  b.ring(12, 0.9, (i) => {
    b.part({ pivot: [0, 0.04, -0.25], axis: [1, 0, 0], swing: 0.6, stage: 1, delay: (i % 4) * 0.05, edge: 0.8 });
    b.at({ p: [0, 0.04, 0] }, () => b.box(0.05, 0.05 + (i % 4) * 0.04, 0.4, { taper: [1, 0.7] }));
  });
  return b.build();
}
