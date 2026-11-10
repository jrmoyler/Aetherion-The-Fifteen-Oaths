import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Late Bolt — procedural geometry.
 *
 * Back-swept hourglass darts: the bolt that arrives after its own sound.
 * The hero is the late bolt: a small hourglass body carrying a thread of
 * falling sand, three back-swept fins that lag behind it, and a clock
 * hand on a face behind the dart that ticks round as it falls.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A stubby hourglass with a bead of sand. Centred on y = 0, its largest extent one unit. */
export function createLateBoltPieceGeometry() {
  const b = new RigBuilder('latebolt.piece');
  b.part({ glow: 0.4, crease: 25 });
  b.lathe([[0.001, -0.5], [0.2, -0.45], [0.2, -0.2], [0.03, 0], [0.2, 0.2], [0.2, 0.45], [0.001, 0.5]], 10, {});
  b.part({ glow: 1 });
  b.at({ p: [0, -0.28, 0] }, () => b.orb(0.05, { sides: 5, rings: 3 }));
  b.part({ edge: 0.9, pivot: [0, 0, 0], axis: [0, 0, 1], swing: 0.8, stage: 1 });
  b.at({ p: [0, 0.5, 0] }, () => b.torus(0.2, 0.015, { segs: 14, sides: 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. An hourglass dart, a sand thread, three swept fins and a clock face with a hand. */
export function createLateBoltHeroGeometry() {
  const b = new RigBuilder('latebolt.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Two glass bulbs meeting at a waist.
    b.part({ glow: 0.4, crease: 25 });
    b.lathe([[0.001, -0.55], [0.22, -0.5], [0.26, -0.25], [0.04, 0.0], [0.26, 0.25], [0.22, 0.5], [0.001, 0.55]], 14, {});
    // Sand falling through the waist.
    b.part({ glow: 1 });
    b.lathe([[0.001, 0.0], [0.015, -0.1], [0.12, -0.3], [0.17, -0.44]], 8, { cap: false });
    // Brass caps.
    b.part({ edge: 0.9 });
    [-0.52, 0.52].forEach((y) => b.at({ p: [0, y, 0] }, () => b.torus(0.2, 0.02, { segs: 16, sides: 4 })));
    // Three back-swept fins, lagging behind.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.part({ pivot: [Math.cos(a) * 0.2, -0.4, Math.sin(a) * 0.2], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.55, stage: 1, delay: i * 0.08, glow: 0.2 });
      b.at({ p: [Math.cos(a) * 0.2, -0.4, Math.sin(a) * 0.2], r: [PI - 0.3, 0, 0] }, () => b.at({ r: [0, a, 0] }, () => b.blade({ len: 0.55, w: 0.08, thick: 0.014, segs: 5 })));
    }
    // The clock face behind, and the hand that ticks round.
    b.part({ edge: 0.9 });
    b.at({ p: [0, -0.85, 0] }, () => {
      b.torus(0.3, 0.015, { segs: 28, sides: 4 });
      b.ring(12, 0.3, () => b.box(0.015, 0.05, 0.015, {}), { y: 0 });
    });
    b.part({ glow: 0.9, pivot: [0, -0.85, 0], axis: [0, 1, 0], swing: 2.4, stage: 1 });
    b.at({ p: [0, -0.85, 0], r: [0, 0, 0] }, () => b.at({ r: [PI / 2, 0, 0] }, () => b.lathe([[0.02, 0], [0.012, 0.26], [0.001, 0.3]], 4, {})));
  });
  return b.build();
}
