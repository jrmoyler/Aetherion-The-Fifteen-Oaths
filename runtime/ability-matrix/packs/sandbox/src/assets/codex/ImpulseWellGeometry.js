import { RigBuilder, PI } from './RigKit.js';

/**
 * Impulse Well — procedural geometry.
 *
 * A radial compression dish: a floor that punches back.
 * The hero is the driver: a shallow dish of sixteen radial petals around
 * a central piston boss, three shock rings hung above it, the petals
 * flexing inward as the dish compresses and springing out on release.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A small dish of four petals around a piston boss. Centred on y = 0, its largest extent one unit. */
export function createImpulseWellPieceGeometry() {
  const b = new RigBuilder('impulse.piece');
  b.part({ glow: 0.6 });
  b.cylinder(0.08, 0.14, 8, {});
  b.ring(4, 0.06, (i) => {
    b.part({ pivot: [0, 0.02, 0], axis: [1, 0, 0], swing: -0.5, stage: 1, delay: i * 0.05 });
    b.at({ p: [0, 0.02, 0], r: [PI / 2 - 0.35, 0, 0] }, () => b.blade({ len: 0.34, w: 0.13, thick: 0.014, segs: 5 }));
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Sixteen dish petals, a piston boss and three shock rings. */
export function createImpulseWellHeroGeometry() {
  const b = new RigBuilder('impulse.hero');
  b.fit('ring');
  // Sixteen petals form the dish, each hinged at the hub.
  b.ring(16, 0.12, (i) => {
    b.part({ pivot: [0, 0.14, 0], axis: [1, 0, 0], swing: -0.45, stage: 1, delay: (i % 4) * 0.04, glow: i % 4 === 0 ? 0.2 : 0 });
    b.at({ p: [0, 0.14, 0], r: [PI / 2 - 0.45, 0, 0] }, () => b.blade({ len: 0.95, w: 0.2, thick: 0.02, segs: 8, shape: (t) => Math.sin(Math.PI * Math.pow(t, 0.9)) * 0.6 + 0.4 * t }));
  });
  // Central piston boss.
  b.part({ glow: 0.9 });
  b.cylinder(0.16, 0.34, 10, { r1: 0.1 });
  b.at({ p: [0, 0.34, 0] }, () => b.pyramid(10, 0.1, 0.1, {}));
  // Three shock rings hung above, tilting off as the dish fires.
  [0.55, 0.85, 1.15].forEach((y, i) => {
    b.part({ edge: 0.9, glow: 0.4, pivot: [0.4 + i * 0.1, y, 0], axis: [0, 0, 1], swing: 0.3 + i * 0.1, stage: 1, delay: i * 0.08 });
    b.at({ p: [0, y, 0] }, () => b.torus(0.3 + i * 0.22, 0.02, { segs: 30, sides: 4 }));
  });
  return b.build();
}
