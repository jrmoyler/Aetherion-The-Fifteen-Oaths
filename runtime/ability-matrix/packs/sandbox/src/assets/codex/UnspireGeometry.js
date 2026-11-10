import { RigBuilder, TAU, helixPath } from './RigKit.js';

/**
 * Unspire — procedural geometry.
 *
 * Reverse corkscrew spires: a tower that screws itself out of the ground.
 * The hero is the unspire: an inverted tower wider at the crown than the
 * foot, three corkscrews winding the wrong way round it, a capstone
 * disc and a stepped foot. The whole stack unscrews about its axis.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A small inverted tower with one corkscrew. Centred on y = 0, its largest extent one unit. */
export function createUnspirePieceGeometry() {
  const b = new RigBuilder('unspire.piece');
  b.part({ pivot: [0, 0, 0], axis: [0, 1, 0], swing: -1.0, stage: 1 });
  b.lathe([[0.04, -0.5], [0.12, 0], [0.24, 0.5]], 5, { phase: 0.3, twist: -2.5 });
  b.part({ glow: 0.5, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.0, stage: 1 });
  b.tube(helixPath(0.1, 0.34, 1.6, 1.0, -0.5, 0), { r: 0.018, sides: 4, segs: 24 });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. An inverted twisting tower, three reverse corkscrews, a capstone and a stepped foot. */
export function createUnspireHeroGeometry() {
  const b = new RigBuilder('unspire.hero');
  b.fit('mass');
  b.part();
  b.lathe([[0.55, 0], [0.5, 0.06], [0.3, 0.1], [0.2, 0.14]], 10, {});
  // The inverted tower: narrow at the foot, wide at the crown, twisting left.
  b.part({ glow: 0.2, pivot: [0, 0, 0], axis: [0, 1, 0], swing: -1.0, stage: 1 });
  b.lathe([[0.001, 0.12], [0.08, 0.2], [0.18, 0.8], [0.3, 1.4], [0.42, 1.8]], 6, { phase: 0.3, twist: -2.2 });
  // Three corkscrews winding the wrong way round it.
  for (let i = 0; i < 3; i++) {
    b.part({ glow: 0.3, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.0, stage: 1, delay: i * 0.06 });
    b.tube(helixPath(0.16, 0.6, 2.2, 1.7, 0.15, (i / 3) * TAU), { r: 0.025, sides: 5, segs: 56 });
  }
  b.part({ glow: 0.9 });
  b.at({ p: [0, 1.82, 0] }, () => b.cylinder(0.55, 0.05, 6, { r1: 0.4 }));
  return b.build();
}
