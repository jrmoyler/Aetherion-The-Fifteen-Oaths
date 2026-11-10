import { RigBuilder, PI } from './RigKit.js';

/**
 * Press Lance — procedural geometry.
 *
 * A flattened wedge plough: the lance is a blade for pushing, not cutting.
 * The hero is the plough: a broad flat wedge pointing down the line with
 * three prongs raked out each side, a thick push plate behind it, and two
 * skid shoes. The rakes spread wide as the plough bites.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A flat wedge with two side prongs. Centred on y = 0, its largest extent one unit. */
export function createPressLancePieceGeometry() {
  const b = new RigBuilder('presslance.piece');
  b.part({ glow: 0.4 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.prism([[-0.3, -0.35], [0.3, -0.35], [0.0, 0.5]], 0, 0.1, { taper: 0.6 }));
  [-1, 1].forEach((s, i) => {
    b.part({ pivot: [s * 0.2, 0, -0.3], axis: [0, 1, 0], swing: s * 0.5, stage: 1, delay: i * 0.08 });
    b.at({ p: [s * 0.26, 0, -0.1], r: [PI / 2, 0, 0] }, () => b.cylinder(0.03, 0.35, 5, { r1: 0.005 }));
  });

  // A ridge down the middle and three teeth on the edge.
  b.part({ edge: 0.9, glow: 0.3 });
  b.at({ p: [0, 0.07, 0] }, () => b.box(0.16, 0.05, 0.6, { taper: [0.7, 1] }));
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0.2 - i * 0.05, 0, -0.1 + i * 0.2], axis: [0, 1, 0], swing: 0.5, stage: 1, delay: i * 0.06, glow: 0.3 });
    b.at({ p: [0.26 - i * 0.07, 0, -0.1 + i * 0.2], r: [PI / 2, -0.5, 0] }, () => b.pyramid(3, 0.035, 0.13, {}));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A wedge, six raked prongs, a push plate and two skid shoes. */
export function createPressLanceHeroGeometry() {
  const b = new RigBuilder('presslance.hero');
  b.fit('mass');
  // The wedge: flat in plan, pointing +z.
  b.part({ glow: 0.4 });
  b.prism([[-0.6, -0.3], [0.6, -0.3], [0.0, 1.0]], 0, 0.14, { taper: 0.7 });
  // Raked prongs, three each side, spreading as it bites.
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 3; i++) {
      b.part({ pivot: [s * 0.5, 0.07, -0.2 + i * 0.12], axis: [0, 1, 0], swing: s * (0.3 + i * 0.12), stage: 1, delay: i * 0.07, glow: 0.2 });
      b.at({ p: [s * (0.55 + i * 0.05), 0.07, -0.2 + i * 0.2], r: [PI / 2 + 0.0, 0, 0] }, () => b.cylinder(0.035, 0.45 - i * 0.07, 5, { r1: 0.006 }));
    }
  });
  // Push plate behind.
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.2, -0.36] }, () => b.box(1.3, 0.5, 0.09, { center: true, taper: [0.95, 0.9] }));
  // Skid shoes.
  b.part();
  [-0.55, 0.55].forEach((x) => b.at({ p: [x, -0.02, -0.1], r: [PI / 2, 0, 0] }, () => b.cylinder(0.05, 0.6, 6, { r1: 0.03 })));

  // A stepped ridge down the spine of the wedge.
  b.part({ edge: 0.9, glow: 0.2 });
  for (let i = 0; i < 4; i++) b.at({ p: [0, 0.14, -0.1 + i * 0.2] }, () => b.box(0.52 - i * 0.11, 0.05, 0.12, { taper: [0.8, 1] }));
  // Teeth along both leading edges, springing out as the plough bites.
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 5; i++) {
      b.part({ pivot: [s * (0.5 - i * 0.1), 0.07, -0.25 + i * 0.25], axis: [0, 1, 0], swing: s * 0.45, stage: 1, delay: i * 0.05, glow: 0.3 });
      b.at({ p: [s * (0.52 - i * 0.1), 0.07, -0.22 + i * 0.25], r: [PI / 2, s * -0.5, 0] }, () => b.pyramid(3, 0.04, 0.16, {}));
    }
  });
  // Two hydraulic rams behind the plate, and the bolts that hold it.
  b.part({ edge: 0.8 });
  [-0.35, 0.35].forEach((x) => {
    b.at({ p: [x, 0.2, -0.45], r: [-PI / 2, 0, 0] }, () => {
      b.cylinder(0.07, 0.5, 8, {});
      b.at({ p: [0, 0.5, 0] }, () => b.cylinder(0.04, 0.35, 6, {}));
    });
  });
  b.part({ glow: 0.5 });
  for (let i = 0; i < 6; i++) b.at({ p: [-0.5 + i * 0.2, 0.32, -0.31], r: [PI / 2, 0, 0] }, () => b.cylinder(0.025, 0.03, 6, {}));
  return b.build();
}
