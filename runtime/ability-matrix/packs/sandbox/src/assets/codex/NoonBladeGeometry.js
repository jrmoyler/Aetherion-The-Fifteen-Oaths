import { RigBuilder, PI } from './RigKit.js';

/**
 * Noon Blade — procedural geometry.
 *
 * A blade of noon swings flat and cuts on the return.
 * The hero is the scimitar: a broad curved blade lying flat from the
 * hand, a sun-disc guard ringed with short rays, and a lamp-bright edge
 * line that rolls the blade over on the return.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A short curved blade laid flat with a sun-disc at its heel. Centred on y = 0, its largest extent one unit. */
export function createNoonBladePieceGeometry() {
  const b = new RigBuilder('noonblade.piece');
  b.part({ glow: 0.4, pivot: [0, -0.4, 0], axis: [0, 1, 0], swing: 0.6, stage: 1 });
  b.at({ r: [0, 0, 0] }, () => b.blade({ len: 0.9, w: 0.2, thick: 0.02, bend: 0.35, segs: 8 }));
  b.part({ glow: 0.9 });
  b.at({ p: [0, -0.05, 0], r: [PI / 2, 0, 0] }, () => b.cylinder(0.12, 0.03, 12, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A curved broad blade, a sun-disc guard, eighteen guard rays and a grip. */
export function createNoonBladeHeroGeometry() {
  const b = new RigBuilder('noonblade.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The blade: broad, curved toward the edge, lying flat when aimed along z.
    b.part({ glow: 0.35, pivot: [0, 0.2, 0], axis: [0, 1, 0], swing: 0.35, stage: 1 });
    b.at({ p: [0, 0.18, 0] }, () => b.blade({ len: 1.35, w: 0.3, thick: 0.03, bend: -0.45, segs: 12, shape: (t) => Math.sin(Math.PI * Math.pow(t, 0.5)) * (1 - 0.35 * t) }));
    // Sun-disc guard and its rays.
    b.part({ glow: 0.9 });
    b.at({ p: [0, 0.1, 0] }, () => b.cylinder(0.2, 0.05, 18, { r1: 0.17 }));
    b.part({ glow: 0.5, edge: 0.7 });
    b.ring(18, 0.2, (i) => {
      b.at({ p: [0, 0.12, 0], r: [PI / 2, 0, 0] }, () => b.blade({ len: 0.1 + (i % 2) * 0.05, w: 0.03, thick: 0.01, segs: 3 }));
    });
    // Grip and pommel.
    b.part();
    b.lathe([[0.05, 0.1], [0.04, -0.1], [0.045, -0.25], [0.08, -0.3], [0.001, -0.36]], 8, {});
  });
  return b.build();
}
