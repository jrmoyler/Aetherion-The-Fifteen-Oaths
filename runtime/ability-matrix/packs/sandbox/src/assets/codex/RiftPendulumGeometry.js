import { RigBuilder, PI } from './RigKit.js';

/**
 * Rift Pendulum — procedural geometry.
 *
 * A bifurcated rift sickle: one blade, cut in two, hinged at the hand.
 * The hero is the sickle: two crescent halves bowing apart from a
 * single hilt with a rift of nothing between them, hung with shards
 * of torn edge that separate as the pendulum swings through.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A thin sickle in two halves with a spark of rift between them. Centred on y = 0, its largest extent one unit. */
export function createRiftPendulumPieceGeometry() {
  const b = new RigBuilder('riftpendulum.piece');
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ crease: 40, pivot: [0, -0.4, 0], axis: [0, 0, 1], swing: -s * 0.4, stage: 1, glow: 0.2 });
    b.tube((t) => [s * (0.03 + Math.sin(t * PI) * 0.15), -0.45 + t * 0.9, 0], { r: (t) => 0.03 * Math.sin(t * PI) + 0.004, sides: 4, segs: 12 });
  }
  b.part({ glow: 1 });
  b.at({ p: [0, 0.05, 0] }, () => b.orb(0.03, { sides: 4, rings: 2, ey: 1.7 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Two bowed crescent halves, a hilt, a rift seam and six torn shards. */
export function createRiftPendulumHeroGeometry() {
  const b = new RigBuilder('riftpendulum.hero');
  b.fit('mass');
  // Two halves, each a crescent ribbon bowing away from the rift.
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ crease: 40, edge: 0.6, glow: 0.15, pivot: [0, 0, 0], axis: [0, 1, 0], swing: -s * 0.38, stage: 1 });
    b.ribbon((t) => [s * (0.03 + 0.45 * Math.sin(t * PI * 0.95) * (1 - 0.3 * t)), 0, t * 1.55], { w: (t) => 0.3 * Math.sin(t * PI) ** 0.6 + 0.02, segs: 28, thick: 0.014, up: [1, 0, 0] });
  }
  // Hilt.
  b.part({ edge: 0.8 });
  b.aimZ(() => b.lathe([[0.07, 0.12], [0.045, -0.02], [0.05, -0.25], [0.08, -0.3], [0.001, -0.36]], 8, {}));
  // Rift seam: a thin bright wedge down the middle.
  b.part({ glow: 1 });
  b.at({ p: [0, 0, 0.1], r: [PI / 2, 0, 0] }, () => b.lathe([[0.001, 0], [0.012, 0.5], [0.008, 1.2], [0.001, 1.4]], 4, { phase: PI / 4 }));
  // Torn shards that drift apart on the swing.
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    b.part({ glow: 0.5, pivot: [0, 0, 0.3 + i * 0.2], axis: [0, 0, 1], swing: s * 1.0, stage: 1, delay: i * 0.05 });
    b.at({ p: [0, 0, 0.3 + i * 0.2], r: [0, i, 0] }, () => b.pyramid(3, 0.04, 0.14, {}));
  }
  return b.build();
}
