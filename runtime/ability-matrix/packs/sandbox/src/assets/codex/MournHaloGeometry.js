import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Mourn Halo — procedural geometry.
 *
 * A drooping mourning veil: the ring hangs its head.
 * The hero is the veil: a high hoop with twenty cloth drapes of unequal
 * length hanging from it and sagging outward, weighted by tassels, and
 * three long weeping streamers. The drapes swing out as the veil lifts.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A small hoop with three drooping cloth drapes. Centred on y = 0, its largest extent one unit. */
export function createMournHaloPieceGeometry() {
  const b = new RigBuilder('mournhalo.piece');
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.4, 0] }, () => b.torus(0.18, 0.015, { segs: 14, sides: 4 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.part({ crease: 50, edge: 0.1, pivot: [Math.cos(a) * 0.18, 0.4, Math.sin(a) * 0.18], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.6, stage: 1, delay: i * 0.1 });
    b.ribbon((t) => [Math.cos(a) * (0.18 + t * 0.1), 0.4 - t * (0.6 + i * 0.1), Math.sin(a) * (0.18 + t * 0.1)], { w: 0.12 * 0.8, segs: 8, up: [Math.cos(a), 0, Math.sin(a)] });
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A raised hoop, twenty drapes, twenty tassels and three weeping streamers. */
export function createMournHaloHeroGeometry() {
  const b = new RigBuilder('mournhalo.hero');
  b.fit('ring');
  b.part({ edge: 0.8, glow: 0.2 });
  b.at({ p: [0, 1.0, 0] }, () => b.torus(0.95, 0.03, { segs: 48, sides: 5 }));
  // Twenty drapes hanging and sagging outward, lengths uneven.
  b.ring(20, 0.95, (i) => {
    const len = 0.55 + 0.35 * Math.abs(Math.sin(i * 1.7));
    b.part({ crease: 55, edge: 0.1, pivot: [0, 1.0, 0], axis: [1, 0, 0], swing: 0.5, stage: 1, delay: (i % 4) * 0.05 });
    b.ribbon((t) => [0.03 * Math.sin(t * 5 + i), 1.0 - t * len, 0.04 + 0.1 * t * t], { w: 0.28 * (1 - 0.3 * 0), segs: 8, up: [0, 0, 1] });
    b.part({ pivot: [0, 1.0, 0], axis: [1, 0, 0], swing: 0.5, stage: 1, delay: (i % 4) * 0.05, glow: 0.3 });
    b.at({ p: [0, 1.0 - len - 0.02, 0.05 + 0.1] }, () => b.pyramid(4, 0.03, -0.07, { phase: PI / 4 }));
  });
  // Three long weeping streamers.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    b.part({ crease: 55, edge: 0.1, glow: 0.2, pivot: [Math.cos(a) * 0.95, 1.0, Math.sin(a) * 0.95], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.7, stage: 1, delay: 0.2 });
    b.ribbon((t) => [Math.cos(a) * (0.95 + t * 0.12), 1.0 - t * 1.15, Math.sin(a) * (0.95 + t * 0.12)], { w: (t) => 0.06 * (1 - t) + 0.01, segs: 14, up: [Math.cos(a), 0, Math.sin(a)] });
  }
  return b.build();
}
