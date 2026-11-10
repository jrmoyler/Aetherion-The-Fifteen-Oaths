import { RigBuilder, PI, arcBand } from './RigKit.js';

/**
 * Hardpoint Halo — procedural geometry.
 *
 * Square hardpoint crenels: the ring as a fortress with a gun in each corner.
 * The hero is the keep: a crenellated wall of sixteen merlons round the
 * rim, four corner hardpoints each with a short gun barrel, and a ring
 * walk. The barrels traverse inward as the hardpoint locks.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A crenellated wall section with a barrel. Centred on y = 0, its largest extent one unit. */
export function createHardpointHaloPieceGeometry() {
  const b = new RigBuilder('hardpoint.piece');
  b.part({ edge: 0.8 });
  b.at({ p: [0, -0.4, 0] }, () => b.box(0.6, 0.28, 0.16, {}));
  [-0.22, 0, 0.22].forEach((x, i) => b.at({ p: [x, -0.12, 0] }, () => b.box(0.14, 0.14, 0.16, {})));
  b.part({ glow: 0.6, pivot: [0.25, 0.1, 0], axis: [0, 1, 0], swing: 0.6, stage: 1 });
  b.at({ p: [0.25, 0.08, 0], r: [0, 0, PI / 2 - 0.15] }, () => b.cylinder(0.04, 0.4, 6, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Sixteen merlons, four gun hardpoints with barrels, a ring walk and a base. */
export function createHardpointHaloHeroGeometry() {
  const b = new RigBuilder('hardpoint.hero');
  b.fit('ring');
  // Base ring and wall.
  b.part({ edge: 0.8 });
  b.torus(1, 0.04, { segs: 48, sides: 4 });
  b.ring(16, 0, (i) => {
    const a0 = PI / 2 - 0.19;
    b.part({ pivot: [0, 0, 1], axis: [1, 0, 0], swing: -0.15, stage: 1, delay: (i % 4) * 0.04 });
    b.prism(arcBand(PI / 2 - 0.15, PI / 2 + 0.15, 0.93, 1.07, 3), 0, 0.28 + (i % 2 ? 0.0 : 0.08), { taper: 0.97 });
  });
  b.part({ edge: 0.6 });
  b.at({ p: [0, 0.24, 0] }, () => b.torus(0.97, 0.02, { segs: 48, sides: 4 }));
  // Four hardpoints with traversing barrels.
  b.ring(4, 0.88, (i) => {
    b.part({ glow: 0.2 });
    b.at({ p: [0, 0, 0] }, () => b.box(0.34, 0.34, 0.34, { taper: [0.85, 0.85] }));
    b.part({ glow: 0.7, pivot: [0, 0.36, 0], axis: [0, 1, 0], swing: 0.55, stage: 1, delay: i * 0.06 });
    b.at({ p: [0, 0.4, 0], r: [-PI / 2 - 0.05, 0, 0] }, () => b.cylinder(0.05, 0.55, 8, { r1: 0.04 }));
    b.at({ p: [0, 0.38, 0] }, () => b.cylinder(0.11, 0.1, 8, {}));
  }, { phase: PI / 4 });
  return b.build();
}
