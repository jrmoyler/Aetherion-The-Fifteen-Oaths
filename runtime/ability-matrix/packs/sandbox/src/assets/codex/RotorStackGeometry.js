import { RigBuilder, PI } from './RigKit.js';

/**
 * Rotor Stack — procedural geometry.
 *
 * A stack of rotors stands in the circle and throws what it catches.
 * The hero is the stack: a central mast carrying four tiers of curved
 * airfoil blades, each blade pitching about its own spar as the rotors
 * bite, on a stepped base.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A hub with three twisted airfoil blades, each pitching on its spar. Centred on y = 0, its largest extent one unit. */
export function createRotorStackPieceGeometry() {
  const b = new RigBuilder('rotor.piece');
  b.part({ glow: 0.4 });
  b.cylinder(0.05, 1, 6, {});
  b.part({ glow: 0.4 });
  b.at({ p: [0, 0.5, 0] }, () => b.cylinder(0.11, 0.14, 8, { r1: 0.09 }));
  b.ring(3, 0.1, (i) => {
    b.part({ pivot: [0, 0.57, 0], axis: [0, 0, 1], swing: 0.9, stage: 1, delay: i * 0.08, crease: 40 });
    b.at({ p: [0, 0.57, 0], r: [PI / 2, 0, 0] }, () => b.blade({ len: 0.42, w: 0.09, thick: 0.015, twist: 0.9, segs: 6 }));
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A mast, four tiers of five airfoil blades, four hubs and a stepped base. */
export function createRotorStackHeroGeometry() {
  const b = new RigBuilder('rotor.hero');
  b.fit('mass');
  // Stepped base and mast.
  b.part();
  b.lathe([[0.7, 0], [0.7, 0.06], [0.5, 0.1], [0.5, 0.16], [0.3, 0.2], [0.1, 0.22]], 14, {});
  b.part({ glow: 0.5 });
  b.cylinder(0.07, 1.8, 8, { r1: 0.05 });
  // Four tiers, each a hub and five curved blades with their own pitch.
  for (let tier = 0; tier < 4; tier++) {
    const y = 0.45 + tier * 0.38;
    const reach = 0.95 - tier * 0.1;
    b.part({ glow: 0.3 });
    b.at({ p: [0, y, 0] }, () => b.cylinder(0.12, 0.06, 10, { r1: 0.1 }));
    b.ring(5, 0.1, (i) => {
      b.part({ pivot: [0, y, 0], axis: [0, 0, 1], swing: 0.7 + tier * 0.15, stage: 1, delay: tier * 0.07 + i * 0.01, crease: 40 });
      b.at({ p: [0, y + 0.03, 0], r: [PI / 2 + 0.1, 0, 0] }, () => b.blade({ len: reach, w: 0.13, thick: 0.018, twist: 0.8, bend: 0.1, segs: 8 }));
    }, { phase: tier * 0.45 });
  }
  return b.build();
}
