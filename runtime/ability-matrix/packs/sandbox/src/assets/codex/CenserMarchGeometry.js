import { RigBuilder, PI, star } from './RigKit.js';

/**
 * Censer March — procedural geometry.
 *
 * Censers rise in a ring, swing once, and slam their smoke inward.
 * The hero is the procession: a slim reliquary spire in the middle and six
 * thuribles hung from its arms on chains, each swinging inward on its own
 * hinge, their lids perforated and their bowls banded.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A banded thurible on a short chain with a pierced lid. Centred on y = 0, its largest extent one unit. */
export function createCenserMarchPieceGeometry() {
  const b = new RigBuilder('censers.piece');
  b.part({ pivot: [0, 0.5, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.tube((t) => [0, 0.5 - t * 0.35, 0], { r: 0.008, sides: 4, segs: 3 });
  b.part({ glow: 0.35, pivot: [0, 0.5, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.lathe([[0.001, 0.12], [0.12, 0.06], [0.2, -0.05], [0.16, -0.22], [0.001, -0.32]], 10, { crease: 35 });
  b.part({ glow: 0.8, pivot: [0, 0.5, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.at({ p: [0, 0.14, 0] }, () => b.orb(0.05, { sides: 5, rings: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A reliquary spire with six crossarms, six chains and six perforated thuribles. */
export function createCenserMarchHeroGeometry() {
  const b = new RigBuilder('censers.hero');
  b.fit('mass');
  // The reliquary spire.
  b.part({ glow: 0.3 });
  b.lathe([[0.3, 0], [0.18, 0.1], [0.1, 0.3], [0.07, 1.4], [0.001, 1.7]], 8, {});
  b.part({ glow: 0.9 });
  b.at({ p: [0, 1.5, 0] }, () => b.prism(star(4, 0.16, 0.05), 0, 0.03, { taper: 1 }));
  // Six crossarms and their chains and thuribles.
  b.ring(6, 0, (i) => {
    b.part();
    b.at({ p: [0, 1.15, 0], r: [PI / 2, 0, 0] }, () => b.cylinder(0.02, 0.78, 5, { r1: 0.015 }));
    b.part({ pivot: [0, 1.15, 0.78], axis: [1, 0, 0], swing: -0.55, stage: 1, delay: (i % 2) * 0.12, edge: 0.6 });
    b.at({ p: [0, 1.15, 0.78] }, () => b.tube((t) => [0, -t * 0.42, 0], { r: 0.008, sides: 4, segs: 4 }));
    b.part({ pivot: [0, 1.15, 0.78], axis: [1, 0, 0], swing: -0.55, stage: 1, delay: (i % 2) * 0.12, glow: 0.3 });
    b.at({ p: [0, 0.57, 0.78] }, () => b.lathe([[0.001, 0.14], [0.13, 0.08], [0.2, -0.05], [0.16, -0.22], [0.001, -0.3]], 10, { crease: 35 }));
    b.part({ pivot: [0, 1.15, 0.78], axis: [1, 0, 0], swing: -0.55, stage: 1, delay: (i % 2) * 0.12, edge: 0.9 });
    b.at({ p: [0, 0.47, 0.78] }, () => b.torus(0.2, 0.012, { segs: 14, sides: 4 }));
  });
  return b.build();
}
