import { RigBuilder, PI } from './RigKit.js';

/**
 * Press Cage — procedural geometry.
 *
 * Opposing piston jaws: the cage closes by pushing.
 * The hero is the press: six hydraulic pistons round the ring, each a
 * housing, a bright rod and a flat jaw pad facing in, tied by a crown
 * ring, the pads tilting square to the load as the jaws close.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A piston: housing, rod and jaw pad. Centred on y = 0, its largest extent one unit. */
export function createPressCagePieceGeometry() {
  const b = new RigBuilder('presscage.piece');
  b.part({ edge: 0.8 });
  b.at({ p: [0, -0.5, 0] }, () => b.cylinder(0.12, 0.5, 8, {}));
  b.part({ glow: 0.6, pivot: [0, 0, 0], axis: [0, 0, 1], swing: -0.25, stage: 1 });
  b.at({ p: [0, 0, 0] }, () => b.cylinder(0.05, 0.6, 6, {}));
  b.part({ pivot: [0, 0.6, 0], axis: [0, 0, 1], swing: -0.4, stage: 1, delay: 0.1 });
  b.at({ p: [0, 0.58, 0] }, () => b.box(0.34, 0.06, 0.2, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Six pistons with housings, rods and pads, a crown ring and a base ring. */
export function createPressCageHeroGeometry() {
  const b = new RigBuilder('presscage.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.torus(1, 0.035, { segs: 40, sides: 4 });
  b.at({ p: [0, 1.0, 0] }, () => b.torus(0.82, 0.03, { segs: 40, sides: 4 }));
  // Six pistons lying toward the middle, each lifting its pad square on the press.
  b.ring(6, 0.98, (i) => {
    b.part({ edge: 0.8 });
    b.at({ p: [0, 0.5, 0], r: [-PI / 2 - 0.15, 0, 0] }, () => b.cylinder(0.1, 0.42, 8, {}));
    b.part({ glow: 0.6, pivot: [0, 0.5, -0.1], axis: [1, 0, 0], swing: -0.15, stage: 1 });
    b.at({ p: [0, 0.5, -0.1], r: [-PI / 2 - 0.15, 0, 0] }, () => b.cylinder(0.04, 0.55, 6, {}));
    b.part({ pivot: [0, 0.4, -0.64], axis: [1, 0, 0], swing: 0.4, stage: 1, delay: (i % 2) * 0.1, glow: 0.2 });
    b.at({ p: [0, 0.4, -0.64], r: [0, 0, 0] }, () => b.box(0.28, 0.4, 0.05, { center: true }));
  });
  return b.build();
}
