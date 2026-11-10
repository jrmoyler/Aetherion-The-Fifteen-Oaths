import { RigBuilder, PI } from './RigKit.js';

/**
 * False Floor — procedural geometry.
 *
 * A floor of stepped, folding false tiles.
 * The hero is the floor: three rings of square tiles laid like paving,
 * each tile hinged on its inner edge so alternate ones fold away when the
 * floor gives out, over a pit disc with a ghost floor still sitting under it.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A trapdoor: one tile hinged over a dark pit. Centred on y = 0, its largest extent one unit. */
export function createFalseFloorPieceGeometry() {
  const b = new RigBuilder('falsefloor.piece');
  b.part({ glow: 0.1 });
  b.cylinder(0.3, 0.04, 4, { phase: PI / 4 });
  b.part({ pivot: [-0.2, 0.05, 0], axis: [0, 0, 1], swing: 1.3, stage: 1 });
  b.at({ p: [0, 0.05, 0] }, () => b.box(0.4, 0.05, 0.4, { taper: [1, 1] }));
  b.part({ pivot: [0.1, 0.05, 0], axis: [0, 0, 1], swing: -1.3, stage: 1, delay: 0.1, glow: 0.4 });
  b.at({ p: [0.25, 0.05, 0] }, () => b.box(0.18, 0.05, 0.4, {}));

  // Rivets in the corners and two more small tiles of the false floor.
  b.part({ glow: 0.5, edge: 1 });
  [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]].forEach(([x, z]) => b.at({ p: [x, 0.07, z] }, () => b.cylinder(0.03, 0.03, 6, {})));
  for (let i = 0; i < 2; i++) {
    b.part({ pivot: [0.2, 0.05, -0.15 + i * 0.3], axis: [0, 0, 1], swing: -1.2, stage: 1, delay: 0.15 + i * 0.07 });
    b.at({ p: [0.3, 0.06, -0.15 + i * 0.3] }, () => b.box(0.16, 0.04, 0.14, {}));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Forty-two hinged tiles in three rings, a pit disc, a ghost floor and a threshold ring. */
export function createFalseFloorHeroGeometry() {
  const b = new RigBuilder('falsefloor.hero');
  b.fit('ring');
  // The pit: dark disc and a ghost floor above it.
  b.part({ glow: 0.05 });
  b.cylinder(0.98, 0.03, 36, {});
  b.part({ edge: 0.7 });
  b.at({ p: [0, 0.01, 0] }, () => b.torus(1.0, 0.03, { segs: 40, sides: 4 }));
  // Three rings of tiles hinged on their inner edge; alternate tiles fold away.
  [[0.82, 14, 0.2], [0.58, 10, 0.17], [0.34, 6, 0.15]].forEach(([r, n, w], ring) => {
    b.ring(n, r, (i) => {
      const folds = i % 2 === 0;
      b.part({ pivot: [0, 0.08, -w * 0.45], axis: [1, 0, 0], swing: folds ? -1.35 : 0.2, stage: 1, delay: ring * 0.08 + (i % 3) * 0.04, glow: folds ? 0.1 : 0.25 });
      b.at({ p: [0, 0.03, 0] }, () => b.box(w * 1.25, 0.05, w, { taper: [0.97, 0.97] }));
    });
  });
  b.part({ glow: 0.5 });
  b.at({ p: [0, 0.03, 0] }, () => b.cylinder(0.12, 0.08, 8, {}));
  return b.build();
}
