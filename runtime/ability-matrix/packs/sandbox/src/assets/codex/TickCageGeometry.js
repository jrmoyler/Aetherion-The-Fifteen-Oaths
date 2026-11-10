import { RigBuilder, PI, TAU, lerp } from './RigKit.js';

/**
 * Tick Cage — procedural geometry.
 *
 * Stepped escapement teeth: the cage advances one notch at a time.
 * The hero is the escapement: twelve ratchet bars standing round the rim,
 * each cut with a stepped tooth, a pallet fork rocking in the middle
 * between them, and a hairspring coiled over it all.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A single ratchet bar with its sawtooth edge. Centred on y = 0, its largest extent one unit. */
export function createTickCagePieceGeometry() {
  const b = new RigBuilder('tickcage.piece');
  b.part({ pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.3, stage: 1 });
  b.at({ p: [0, -0.5, 0] }, () => b.prism([[-0.1, -0.06], [0.1, -0.06], [0.1, 0.06], [0.0, 0.06], [-0.02, 0.1], [-0.1, 0.1]], 0, 0.9, { taper: 0.9 }));
  b.part({ glow: 0.7, pivot: [0.1, 0.3, 0], axis: [0, 0, 1], swing: 0.9, stage: 1, delay: 0.1 });
  b.at({ p: [0.12, 0.3, 0] }, () => b.pyramid(3, 0.06, 0.16, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Twelve ratchet bars, an escape ring, a rocking pallet fork and a hairspring. */
export function createTickCageHeroGeometry() {
  const b = new RigBuilder('tickcage.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.torus(1, 0.03, { segs: 40, sides: 4 });
  // Twelve ratchet bars: a stepped tooth on the leading face.
  b.ring(12, 1.0, (i) => {
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 3) * 0.07, glow: i % 3 === 0 ? 0.3 : 0 });
    b.prism([[-0.07, -0.05], [0.07, -0.05], [0.07, 0.05], [0.0, 0.05], [-0.015, 0.09], [-0.07, 0.09]], 0, 1.05, { taper: 0.88 });
    b.part({ glow: 0.6, pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 3) * 0.07 });
    b.at({ p: [0, 0.65, 0.05], r: [0, 0, 0] }, () => b.pyramid(3, 0.05, 0.12, {}));
  });
  // The pallet fork rocking between the teeth.
  b.part({ glow: 0.8, pivot: [0, 0.5, 0], axis: [0, 1, 0], swing: 0.45, stage: 1 });
  b.at({ p: [0, 0.5, 0] }, () => {
    b.at({ p: [0.5, 0, 0], r: [0, 0, PI / 2] }, () => b.cylinder(0.025, 1.0, 6, {}));
    b.at({ p: [-0.46, 0, 0.0] }, () => b.at({ r: [PI / 2, 0, 0] }, () => b.pyramid(3, 0.06, 0.2, {})));
    b.at({ p: [0.46, 0, 0.0] }, () => b.at({ r: [PI / 2, 0, 0] }, () => b.pyramid(3, 0.06, 0.2, {})));
  });
  // The hairspring: a flat spiral over the middle.
  b.part({ edge: 0.5, glow: 0.3 });
  b.tube((t) => [Math.cos(t * TAU * 3.5) * lerp(0.05, 0.3, t), 0.9, Math.sin(t * TAU * 3.5) * lerp(0.05, 0.3, t)], { r: 0.008, sides: 4, segs: 60 });
  return b.build();
}
