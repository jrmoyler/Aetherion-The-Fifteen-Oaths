import { RigBuilder, PI, arcPath } from './RigKit.js';

/**
 * Lens Well — procedural geometry.
 *
 * A lens in the floor drinks the circle, then fires a column of glare.
 * The hero is the lens: a biconvex disc in a three-arc gimbal, an iris of
 * prism teeth that fold open on the exhale, and the glass column above.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A biconvex lens in a thin frame with a cap that tips back. Centred on y = 0, its largest extent one unit. */
export function createLensWellPieceGeometry() {
  const b = new RigBuilder('lensewell.piece');
  b.part({ glow: 0.5, pivot: [0, 0, 0], axis: [0, 0, 1], swing: 0.4, stage: 1 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.lathe([[0.02, -0.06], [0.2, -0.03], [0.32, 0], [0.2, 0.03], [0.02, 0.06]], 12, { cap: false }));
  b.part({ edge: 1, pivot: [0, 0, 0], axis: [0, 0, 1], swing: -0.4, stage: 1, delay: 0.1 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.torus(0.33, 0.022, { segs: 14, sides: 4 }));
  b.part({ pivot: [0, 0.33, 0], axis: [1, 0, 0], swing: 0.9, stage: 1 });
  b.at({ p: [0, 0.38, 0] }, () => b.pyramid(4, 0.1, 0.22, { phase: PI / 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A lens, a gimbal of three arc brackets, twelve iris teeth and a hex glass column. */
export function createLensWellHeroGeometry() {
  const b = new RigBuilder('lensewell.hero');
  b.fit('ring');
  // The lens itself, low in the floor.
  b.part({ glow: 0.9 });
  b.lathe([[0.02, 0.2], [0.35, 0.22], [0.7, 0.19], [0.82, 0.12], [0.7, 0.05], [0.35, 0.02], [0.02, 0]], 28, { cap: false });
  // Gimbal: three arc brackets at different tilts.
  for (let i = 0; i < 3; i++) {
    b.part({ edge: 0.9 });
    b.at({ p: [0, 0.14, 0], r: [0, (i / 3) * PI, i * 0.35] }, () => b.tube(arcPath(0.92, 0.15, PI - 0.15, 0), { r: 0.025, sides: 4, segs: 14 }));
  }
  // Iris: twelve prism teeth that fold open on the exhale.
  b.ring(12, 0.86, (i) => {
    b.part({ pivot: [0, 0.1, 0], axis: [1, 0, 0], swing: 1.2, stage: 1, delay: (i % 3) * 0.07 });
    b.at({ p: [0, 0.1, 0], r: [-0.4, 0, 0] }, () => b.crystal({ sides: 3, r: 0.07, h: 0.5, tip: 0.5, asym: 0.15 }));
  });
  // The glare column: a tall hex glass rising from the lens.
  b.part({ glow: 0.5 });
  b.at({ p: [0, 0.2, 0] }, () => b.lathe([[0.05, 0], [0.17, 0.02], [0.14, 0.9], [0.05, 1.1]], 6, { jag: (i, j) => (j % 2 ? 0.85 : 1) }));
  return b.build();
}
