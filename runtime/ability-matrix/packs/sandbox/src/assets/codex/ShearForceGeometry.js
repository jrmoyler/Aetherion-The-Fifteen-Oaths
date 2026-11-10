import { RigBuilder, PI } from './RigKit.js';

/**
 * Shear Force — procedural geometry.
 *
 * A scissor-folded force plane: the line is cut by a plane that slides.
 * The hero is the shears: two broad triangular blades crossing on a
 * centre pivot, handles looping behind, the blades opening about the
 * pivot as the shear is applied, a force arrow riding the cutting plane.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Two crossed blades on a pivot pin. Centred on y = 0, its largest extent one unit. */
export function createShearForcePieceGeometry() {
  const b = new RigBuilder('shearforce.piece');
  [-1, 1].forEach((s, i) => {
    b.part({ glow: i ? 0.4 : 0.1, pivot: [0, 0, 0], axis: [0, 0, 1], swing: s * 0.35, stage: 1 });
    b.at({ r: [0, 0, s * 0.18] }, () => b.prism([[-0.05, -0.5], [0.05, -0.5], [0.07, 0.3], [0.0, 0.5], [-0.05, 0.3]], -0.015 * s, 0.015 * s + 0.02 * s, {}));
  });
  b.part({ glow: 0.9 });
  b.cylinder(0.04, 0.08, 6, { center: true });

  // Serrations on one blade, a pivot ring and a grip.
  b.part({ glow: 0.4, pivot: [0, 0, 0], axis: [0, 0, 1], swing: 0.35, stage: 1 });
  for (let k = 0; k < 5; k++) b.at({ p: [0.07, -0.35 + k * 0.17, 0.0], r: [0, 0, -0.6] }, () => b.pyramid(3, 0.03, 0.07, {}));
  b.part({ edge: 0.9 });
  b.torus(0.07, 0.012, { segs: 12, sides: 4 });
  b.part();
  b.at({ p: [0, -0.56, 0] }, () => b.cylinder(0.03, 0.14, 6, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Two scissor blades, two handle rings, a pivot screw and a force arrow. */
export function createShearForceHeroGeometry() {
  const b = new RigBuilder('shearforce.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Two scissor blades crossing at the pivot, each a long flat triangle.
    [-1, 1].forEach((s, i) => {
      b.part({ glow: i ? 0.35 : 0.1, pivot: [0, 0, 0], axis: [0, 1, 0], swing: s * 0.5, stage: 1 });
      b.at({ r: [0, s * 0.12, 0] }, () => b.prism([[-0.07, -0.55], [0.07, -0.55], [0.1, 0.1], [0.0, 1.5], [-0.12, 0.1]].map(([x, z]) => [x, z]), i * 0.02, i * 0.02 + 0.03, { taper: 1 }));
    });
    // Handle rings behind.
    b.part({ edge: 0.8 });
    [-1, 1].forEach((s) => b.at({ p: [s * 0.14, 0, -0.74], r: [0, 0, 0] }, () => b.torus(0.12, 0.022, { segs: 14, sides: 4 })));
    // Pivot screw.
    b.part({ glow: 0.9 });
    b.at({ p: [0, 0, 0] }, () => b.cylinder(0.05, 0.1, 8, {}));
    // Force arrow riding the plane.
    b.part({ glow: 0.8, pivot: [0, 0.1, 0], axis: [0, 1, 0], swing: 0.3, stage: 1, delay: 0.15 });
    b.at({ p: [0.3, 0.06, 0.3] }, () => b.prism([[-0.03, -0.3], [0.03, -0.3], [0.03, 0.15], [0.09, 0.15], [0, 0.32], [-0.09, 0.15], [-0.03, 0.15]], 0, 0.03, {}));
  });

  b.aimZ(() => {
    // Serrated edges and grips, each folding with its own blade.
    [-1, 1].forEach((s, i) => {
      b.part({ glow: 0.3, pivot: [0, 0, 0], axis: [0, 1, 0], swing: s * 0.5, stage: 1 });
      for (let k = 0; k < 8; k++) b.at({ p: [s * (0.1 + k * 0.012), i * 0.02 + 0.015, 0.25 + k * 0.15], r: [0, s * 0.2, 0] }, () => b.pyramid(3, 0.035, 0.08, {}));
      b.at({ p: [s * 0.14, 0, -0.74], r: [PI / 2, 0, 0] }, () => b.cylinder(0.03, 0.2, 6, {}));
    });
    // A stop-pin and a ring round the pivot.
    b.part({ edge: 0.9 });
    b.at({ p: [0, 0, 0] }, () => b.torus(0.09, 0.014, { segs: 14, sides: 4 }));
    b.at({ p: [0.14, 0, 0.15], r: [PI / 2, 0, 0] }, () => b.cylinder(0.015, 0.06, 5, {}));
    // Two more force arrows, riding the cutting plane behind the first.
    for (let i = 0; i < 2; i++) {
      b.part({ glow: 0.6, pivot: [0, 0.1, 0], axis: [0, 1, 0], swing: 0.3, stage: 1, delay: 0.2 + i * 0.08 });
      b.at({ p: [0.3, 0.06, -0.1 - i * 0.22] }, () => b.prism([[-0.02, -0.08], [0.02, -0.08], [0.02, 0.02], [0.06, 0.02], [0, 0.12], [-0.06, 0.02], [-0.02, 0.02]], 0, 0.02, {}));
    }
  });
  return b.build();
}
