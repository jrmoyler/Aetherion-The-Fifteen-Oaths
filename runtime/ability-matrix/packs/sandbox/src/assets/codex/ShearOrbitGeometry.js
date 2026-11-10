import { RigBuilder, rng } from './RigKit.js';

/**
 * Shear Orbit — procedural geometry.
 *
 * Sheared asteroid wedges: one rock cleaved, its pieces still falling round it.
 * The hero is the split asteroid: two halves offset along the shear
 * plane, and four wedges of debris on their own tilted orbits that
 * sweep round the pair when the volley turns.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A cleaved rock: two offset halves and a wedge shard. Centred on y = 0, its largest extent one unit. */
export function createShearOrbitPieceGeometry() {
  const b = new RigBuilder('shearorbit.piece');
  const rand = rng(91);
  b.part({ pivot: [0, 0, 0], axis: [0, 0, 1], swing: 0.3, stage: 1 });
  b.at({ p: [0, 0.07, 0] }, () => b.orb(0.22, { sides: 7, rings: 3, ey: 0.6, jag: () => 0.85 + rand() * 0.3 }));
  b.part({ pivot: [0, 0, 0], axis: [0, 0, 1], swing: -0.3, stage: 1 });
  b.at({ p: [0.06, -0.12, 0] }, () => b.orb(0.2, { sides: 7, rings: 3, ey: 0.55, jag: () => 0.85 + rand() * 0.3 }));
  b.part({ glow: 0.5, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.2, stage: 1 });
  b.at({ p: [0.36, 0.05, 0] }, () => b.prism([[-0.07, -0.05], [0.07, -0.05], [0.0, 0.08]], 0, 0.08, { taper: 0.4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Two offset rock halves, a shear seam, and four orbiting debris wedges. */
export function createShearOrbitHeroGeometry() {
  const b = new RigBuilder('shearorbit.hero');
  b.fit('mass');
  const rand = rng(93);
  // Two halves of one rock, offset along the shear.
  b.part({ glow: 0.2, pivot: [0, 0, 0], axis: [0, 1, 0], swing: -0.25, stage: 1 });
  b.at({ p: [0.06, 0.17, 0] }, () => b.orb(0.46, { sides: 12, rings: 4, ey: 0.62, jag: () => 0.88 + rand() * 0.24 }));
  b.part({ glow: 0.2, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.25, stage: 1 });
  b.at({ p: [-0.07, -0.17, 0] }, () => b.orb(0.42, { sides: 12, rings: 4, ey: 0.62, jag: () => 0.88 + rand() * 0.24 }));
  // The shear seam between them.
  b.part({ edge: 0.9, glow: 0.8 });
  b.at({ p: [0, 0, 0] }, () => b.torus(0.46, 0.012, { segs: 28, sides: 4 }));
  // Four debris wedges, each on its own tilted orbit about the pair.
  for (let i = 0; i < 4; i++) {
    const r = 0.8 + i * 0.12;
    const a = i * 1.7;
    b.part({ pivot: [0, 0, 0], axis: [Math.cos(i * 1.3), Math.sin(i * 1.1) * 0.5, Math.sin(i * 1.3)], swing: 1.1 + i * 0.2, stage: 1, delay: i * 0.05, glow: 0.2 });
    b.at({ p: [Math.cos(a) * r, 0.05 * i, Math.sin(a) * r], r: [rand(), rand() * 3, rand()] }, () => b.prism([[-0.12, -0.08], [0.12, -0.08], [0.0, 0.14]], 0, 0.1, { taper: 0.4 }));
  }
  return b.build();
}
