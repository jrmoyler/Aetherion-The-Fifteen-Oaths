import { RigBuilder } from './RigKit.js';

/**
 * Cadence Volley — procedural geometry.
 *
 * Beats arc down the line and detonate on the downbeat.
 * The hero is the phrase: three ribbed beat capsules strung nose to tail,
 * each one smaller than the last, bending against each other as they
 * descend, with the downbeat ring locked around the leader.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A single ribbed capsule with a bead on its nose. Centred on y = 0, its largest extent one unit. */
export function createCadenceVolleyPieceGeometry() {
  const b = new RigBuilder('cadence.piece');
  b.part({ glow: 0.3, pivot: [0, 0, 0], axis: [1, 0, 0], swing: 0.25, stage: 1 });
  b.lathe([[0.001, 0.5], [0.13, 0.42], [0.17, 0.2], [0.17, -0.2], [0.13, -0.42], [0.001, -0.5]], 10, { crease: 40 });
  b.part({ edge: 0.8, pivot: [0, 0, 0], axis: [1, 0, 0], swing: 0.25, stage: 1 });
  [-0.12, 0.12].forEach((y) => b.at({ p: [0, y, 0] }, () => b.torus(0.175, 0.014, { segs: 14, sides: 4 })));
  b.part({ pivot: [0, 0.45, 0], axis: [0, 0, 1], swing: 0.6, stage: 1 });
  b.at({ p: [0, 0.54, 0] }, () => b.orb(0.05, { sides: 5, rings: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three ribbed capsules in a bending chain, rib rings and a downbeat collar. */
export function createCadenceVolleyHeroGeometry() {
  const b = new RigBuilder('cadence.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Three capsules, nose to tail, each smaller, each hinged on the last.
    [0.2, 0.15, 0.11].forEach((r, i) => {
      const y = 0.55 - i * 0.72;
      b.part({ crease: 40, pivot: [0, y + 0.5 * r / 0.2, 0], axis: [Math.cos(i * 2), 0, Math.sin(i * 2)], swing: (i % 2 ? -1 : 1) * 0.28 * (i + 1), stage: 1, delay: i * 0.1, glow: i === 0 ? 0.45 : 0.15 });
      b.at({ p: [0, y, 0] }, () => b.lathe([[0.001, 0.32 * r / 0.2], [r * 0.75, 0.26 * r / 0.2], [r, 0.12 * r / 0.2], [r, -0.12 * r / 0.2], [r * 0.75, -0.26 * r / 0.2], [0.001, -0.32 * r / 0.2]], 10, {}));
      b.part({ edge: 0.8 });
      [-0.08, 0.08].forEach((o) => b.at({ p: [0, y + o * r / 0.2, 0] }, () => b.torus(r * 1.02, 0.012, { segs: 14, sides: 4 })));
      if (i < 2) {
        b.part();
        b.at({ p: [0, y - 0.38, 0] }, () => b.tube((t) => [0, -t * 0.2, 0], { r: 0.012, sides: 4, segs: 2 }));
      }
    });
    // The downbeat collar around the leader.
    b.part({ glow: 0.9, edge: 1 });
    b.at({ p: [0, 0.55, 0] }, () => b.torus(0.3, 0.025, { segs: 22, sides: 5 }));
  });
  return b.build();
}
