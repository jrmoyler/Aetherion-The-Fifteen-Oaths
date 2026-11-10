import { RigBuilder, lerp } from './RigKit.js';

/**
 * Shear Step — procedural geometry.
 *
 * A lateral staircase ribbon: each step is a little further to the side.
 * The hero is the stair: six slabs climbing along the cast, each stepped
 * out further to one side than the last, a rail ribbon tracing their
 * outer edge, each slab slipping sideways in turn on its hinge.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Three stepped slabs, each offset a little further. Centred on y = 0, its largest extent one unit. */
export function createShearStepPieceGeometry() {
  const b = new RigBuilder('shearstep.piece');
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [-0.2 + i * 0.2, -0.5 + i * 0.25, 0], axis: [0, 0, 1], swing: -0.35 + i * 0.1, stage: 1, delay: i * 0.1, glow: i === 2 ? 0.4 : 0 });
    b.at({ p: [-0.2 + i * 0.2, -0.5 + i * 0.3, 0] }, () => b.box(0.3, 0.16, 0.3, { taper: [0.95, 0.95] }));
  }

  // Risers under each step and a short rail on the outside.
  b.part({ edge: 0.8 });
  for (let i = 0; i < 3; i++) b.at({ p: [-0.2 + i * 0.2, -0.5, 0.14] }, () => b.box(0.28, 0.12 + i * 0.3, 0.02, {}));
  b.part({ edge: 0.4, glow: 0.4 });
  b.tube((t) => [lerp(-0.1, 0.45, t), lerp(-0.3, 0.2, t), 0.17], { r: 0.012, sides: 4, segs: 3 });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Six offset slabs, six risers, a rail ribbon and a newel post. */
export function createShearStepHeroGeometry() {
  const b = new RigBuilder('shearstep.hero');
  b.fit('mass');
  for (let i = 0; i < 6; i++) {
    const x = -0.5 + i * 0.2;
    const z = i * 0.3;
    const y = i * 0.12;
    b.part({ pivot: [x, y, z], axis: [0, 0, 1], swing: -0.4 + i * 0.06, stage: 1, delay: i * 0.07, glow: i === 5 ? 0.5 : 0 });
    b.at({ p: [x, y, z] }, () => b.box(0.5, 0.1, 0.3, { taper: [0.96, 0.96] }));
    b.part({ edge: 0.7 });
    b.at({ p: [x, 0, z + 0.14] }, () => b.box(0.48, y + 0.04, 0.02, {}));
  }
  // The rail: a ribbon along the outer edge.
  b.part({ edge: 0.3, crease: 40, glow: 0.4 });
  b.ribbon((t) => [-0.5 + t * 1.0 + 0.27, 0.38 + t * 0.72, t * 1.5], { w: 0.04, segs: 20, up: [1, 0, 0], thick: 0.01 });
  b.part({ edge: 0.8 });
  b.at({ p: [0.77, 0, 1.5] }, () => b.lathe([[0.04, 0], [0.03, 1.1], [0.05, 1.15]], 6, {}));
  return b.build();
}
