import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Vector Halo — procedural geometry.
 *
 * A tangential arrow ring: every arrow points the same way round.
 * The hero is the field: twelve flat arrows lying tangent on the ring,
 * head to tail, a hub with a crossed compass of four vector arrows, and
 * an outer guide ring. The arrows tip up off the floor as the field turns.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A flat arrow and a ring. Centred on y = 0, its largest extent one unit. */
export function createVectorHaloPieceGeometry() {
  const b = new RigBuilder('vectorhalo.piece');
  b.part({ glow: 0.5, pivot: [0, 0, 0], axis: [0, 0, 1], swing: 0.5, stage: 1 });
  b.at({ r: [PI / 2, 0, 0] }, () => {
    b.prism([[-0.06, -0.5], [0.06, -0.5], [0.06, 0.1], [0.2, 0.1], [0, 0.5], [-0.2, 0.1], [-0.06, 0.1]], -0.03, 0.03, {});
  });
  b.part({ edge: 0.8 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.torus(0.3, 0.012, { segs: 16, sides: 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Twelve tangent arrows, a four-arrow compass, a hub and two guide rings. */
export function createVectorHaloHeroGeometry() {
  const b = new RigBuilder('vectorhalo.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.03, 0] }, () => b.torus(1.0, 0.02, { segs: 48, sides: 4 }));
  b.at({ p: [0, 0.03, 0] }, () => b.torus(0.6, 0.012, { segs: 40, sides: 4 }));
  // Twelve arrows lying tangent, nose to tail.
  b.ring(12, 0.8, (i) => {
    b.part({ pivot: [0, 0.05, 0], axis: [0, 0, 1], swing: 0.8, stage: 1, delay: (i % 4) * 0.05, glow: i % 4 === 0 ? 0.5 : 0.1 });
    b.at({ p: [0, 0.04, 0], r: [0, PI / 2, 0] }, () => b.prism([[-0.045, -0.24], [0.045, -0.24], [0.045, 0.06], [0.12, 0.06], [0, 0.26], [-0.12, 0.06], [-0.045, 0.06]], 0, 0.04, {}));
  });
  // The compass: four vector arrows at the hub.
  b.part({ glow: 0.9 });
  b.at({ p: [0, 0.05, 0] }, () => b.orb(0.08, { sides: 6, rings: 3, ey: 0.7 }));
  for (let i = 0; i < 4; i++) {
    b.part({ glow: 0.4, pivot: [0, 0.05, 0], axis: [0, 0, 1], swing: 0.8, stage: 1, delay: 0.2 });
    b.at({ p: [0, 0.05, 0], r: [0, (i / 4) * TAU, 0] }, () => b.prism([[-0.025, 0.08], [0.025, 0.08], [0.025, 0.32], [0.07, 0.32], [0, 0.44], [-0.07, 0.32], [-0.025, 0.32]], 0, 0.03, {}));
  }
  return b.build();
}
