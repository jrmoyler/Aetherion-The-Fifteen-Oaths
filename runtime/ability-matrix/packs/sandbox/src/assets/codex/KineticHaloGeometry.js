import { RigBuilder, PI } from './RigKit.js';

/**
 * Kinetic Halo — procedural geometry.
 *
 * Swept turbine vanes: the circle spins up like a fan nobody asked for.
 * The hero is the turbine: eighteen backswept vanes laid flat round a
 * hub inside a shroud ring, each vane pitching on its spar as the rotor
 * spins up, the hub capped with a nose cone.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A four-vane rotor on a hub. Centred on y = 0, its largest extent one unit. */
export function createKineticHaloPieceGeometry() {
  const b = new RigBuilder('kinethalo.piece');
  b.part({ glow: 0.5 });
  b.cylinder(0.08, 0.1, 8, {});
  b.ring(4, 0.06, (i) => {
    b.part({ pivot: [0, 0.05, 0], axis: [0, 0, 1], swing: 0.9, stage: 1, delay: i * 0.05, crease: 40 });
    b.at({ p: [0, 0.05, 0], r: [PI / 2 - 0.1, 0, 0.0] }, () => b.blade({ len: 0.36, w: 0.1, thick: 0.014, twist: 0.5, bend: 0.12, segs: 6 }));
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Eighteen swept vanes, a hub, a nose cone, a shroud ring and a stator ring. */
export function createKineticHaloHeroGeometry() {
  const b = new RigBuilder('kinethalo.hero');
  b.fit('ring');
  b.part({ glow: 0.5 });
  b.cylinder(0.2, 0.18, 14, { r1: 0.17 });
  b.at({ p: [0, 0.18, 0] }, () => b.pyramid(14, 0.17, 0.2, {}));
  // Eighteen swept vanes.
  b.ring(18, 0.17, (i) => {
    b.part({ pivot: [0, 0.09, 0], axis: [0, 0, 1], swing: 0.85, stage: 1, delay: (i % 6) * 0.03, crease: 40, glow: i % 6 === 0 ? 0.25 : 0 });
    b.at({ p: [0, 0.09, 0], r: [PI / 2 - 0.08, 0, 0] }, () => b.blade({ len: 0.8, w: 0.12, thick: 0.014, twist: 0.5, bend: 0.2, segs: 10 }));
  });
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.07, 0] }, () => b.torus(1.0, 0.035, { segs: 48, sides: 5 }));
  b.part({ edge: 0.5 });
  b.at({ p: [0, 0.07, 0] }, () => b.torus(0.62, 0.012, { segs: 36, sides: 4 }));
  return b.build();
}
