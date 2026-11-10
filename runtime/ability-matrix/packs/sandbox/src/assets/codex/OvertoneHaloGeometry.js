import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Overtone Halo — procedural geometry.
 *
 * Overtones walk the rim and collapse onto the fundamental.
 * The hero is the standing wave: a heavy fundamental ring and three
 * overtone rings rippling with two, three and four lobes, spiked at their
 * nodes, each tilting in as the harmonics collapse.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A three-lobed ring with a bead at each antinode. Centred on y = 0, its largest extent one unit. */
export function createOvertoneHaloPieceGeometry() {
  const b = new RigBuilder('overtone.piece');
  b.part({ pivot: [0.3, 0, 0], axis: [0, 0, 1], swing: 0.5, stage: 1, glow: 0.3 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.tube((t) => [Math.cos(t * TAU) * (0.3 + 0.07 * Math.sin(t * TAU * 3)), Math.sin(t * TAU) * (0.3 + 0.07 * Math.sin(t * TAU * 3)), 0.06 * Math.sin(t * TAU * 3)], { r: 0.022, sides: 5, segs: 30, closed: true }));
  b.part({ glow: 0.8 });
  b.ring(3, 0.3, () => b.orb(0.045, { sides: 5, rings: 3 }), { y: 0.1 });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. The fundamental, three rippled overtone rings and nodal spikes. */
export function createOvertoneHaloHeroGeometry() {
  const b = new RigBuilder('overtone.hero');
  b.fit('ring');
  // The fundamental: one heavy ring.
  b.part({ glow: 0.5 });
  b.torus(1, 0.05, { segs: 48, sides: 6 });
  // Overtones: n lobes, radius falling, each tilting in on the collapse.
  [[2, 0.78], [3, 0.58], [4, 0.4]].forEach(([n, R], k) => {
    b.part({ pivot: [R, 0.12, 0], axis: [0, 0, 1], swing: 0.45 + k * 0.1, stage: 1, delay: k * 0.12, glow: k === 2 ? 0.5 : 0, edge: 0.8 });
    b.at({ p: [0, 0.14 + k * 0.1, 0] }, () => b.tube((t) => {
      const a = t * TAU;
      const r = R + 0.08 * Math.sin(a * n);
      return [Math.cos(a) * r, 0.1 * Math.cos(a * n), Math.sin(a) * r];
    }, { r: 0.022, sides: 5, segs: 60, closed: true }));
    // Spikes at the nodes of this ring.
    b.ring(n * 2, R, (i) => b.pyramid(4, 0.03, 0.2 + k * 0.03, {}), { y: 0.14 + k * 0.1 });
  });
  return b.build();
}
