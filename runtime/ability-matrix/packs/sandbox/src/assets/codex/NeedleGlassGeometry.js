import { RigBuilder, PI } from './RigKit.js';

/**
 * Needle Glass — procedural geometry.
 *
 * A needle of glass swings across the cast and shatters on the far side.
 * The hero is the needle: a long four-sided stiletto hinged at the hand
 * with a faceted guard, and a column of glass collars that slide loose
 * and tumble off on the shatter.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A fine four-sided needle with three loose collars. Centred on y = 0, its largest extent one unit. */
export function createNeedleGlassPieceGeometry() {
  const b = new RigBuilder('needleglass.piece');
  b.part({ glow: 0.5 });
  b.lathe([[0.001, -0.5], [0.05, -0.42], [0.05, 0.1], [0.001, 0.5]], 4, { phase: PI / 4 });
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, -0.2 + i * 0.22, 0], axis: [0, 0, 1], swing: (i - 1) * 0.7, stage: 1, delay: i * 0.1 });
    b.at({ p: [0, -0.25 + i * 0.22, 0] }, () => b.torus(0.09, 0.02, { segs: 8, sides: 4 }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A stiletto, a faceted guard, a tang and seven collars that shake loose. */
export function createNeedleGlassHeroGeometry() {
  const b = new RigBuilder('needleglass.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The stiletto: long, tapering, four-sided.
    b.part({ glow: 0.7 });
    b.lathe([[0.001, 0.0], [0.06, 0.05], [0.07, 0.15], [0.045, 0.8], [0.001, 1.4]], 4, { phase: PI / 4 });
    // Guard: two faceted quillons.
    b.part();
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      b.at({ p: [s * 0.1, 0.1, 0], r: [0, 0, -s * PI / 2] }, () => b.crystal({ sides: 4, r: 0.04, h: 0.22, tip: 0.5 }));
    }
    // Tang and pommel.
    b.at({ p: [0, 0, 0] }, () => b.lathe([[0.04, 0], [0.03, -0.18], [0.07, -0.26], [0.001, -0.32]], 6, {}));
    // Collars: seven glass rings along the blade, each shaking loose at its own time.
    for (let i = 0; i < 7; i++) {
      const y = 0.25 + i * 0.15;
      b.part({ pivot: [0, y, 0], axis: [Math.cos(i * 2.1), 0, Math.sin(i * 2.1)], swing: (i % 2 ? 1 : -1) * 0.8, stage: 1, delay: i * 0.06, edge: 0.9 });
      b.at({ p: [0, y, 0] }, () => b.torus(0.1 - i * 0.008, 0.016, { segs: 10, sides: 4 }));
    }
  });
  return b.build();
}
