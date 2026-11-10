import { RigBuilder, PI } from './RigKit.js';

/**
 * Raster Lance — procedural geometry.
 *
 * Flat raster scan teeth: the lance reads the line row by row.
 * The hero is the scanhead: a flat comb of sixteen teeth along a bar, a
 * thin scan plane sweeping across the teeth, a pixel block grid under
 * it, and a lens housing at the front. The teeth tip forward in sequence.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A short comb of five teeth with a scan bar. Centred on y = 0, its largest extent one unit. */
export function createRasterLancePieceGeometry() {
  const b = new RigBuilder('raster.piece');
  b.part({ edge: 0.8 });
  b.at({ p: [0, -0.4, 0] }, () => b.box(0.7, 0.08, 0.12, {}));
  for (let i = 0; i < 5; i++) {
    b.part({ glow: i === 2 ? 0.6 : 0.1, pivot: [(i - 2) * 0.14, -0.3, 0], axis: [0, 0, 1], swing: -0.3 - i * 0.05, stage: 1, delay: i * 0.06 });
    b.at({ p: [(i - 2) * 0.14, -0.32, 0] }, () => b.box(0.06, 0.55 + (i % 2) * 0.15, 0.06, { taper: [0.5, 0.8] }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A sixteen-tooth comb, a bar, a scan plane, a pixel grid and a lens housing. */
export function createRasterLanceHeroGeometry() {
  const b = new RigBuilder('raster.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The bar across the cast.
    b.part({ edge: 0.8 });
    b.at({ p: [0, 0, 0], r: [0, 0, PI / 2] }, () => b.box(0.14, 2.4, 0.08, { center: true }));
    // Sixteen teeth along the bar.
    for (let i = 0; i < 16; i++) {
      const x = (i - 7.5) * 0.15;
      b.part({ glow: i % 4 === 0 ? 0.5 : 0.1, pivot: [x, 0, 0], axis: [0, 0, 1], swing: -0.25 - (i % 4) * 0.07, stage: 1, delay: i * 0.025 });
      b.at({ p: [x, 0.07, 0] }, () => b.box(0.07, 0.7 + (i % 3) * 0.12, 0.05, { taper: [0.45, 0.8] }));
    }
    // The scan plane: a thin bright sheet crossing the teeth.
    b.part({ glow: 0.9, edge: 1, pivot: [-1.2, 0.5, 0], axis: [0, 1, 0], swing: 0.4, stage: 1 });
    b.at({ p: [0, 0.5, 0] }, () => b.box(2.4, 0.015, 0.08, { center: true }));
    // Pixel blocks beneath.
    b.part({ glow: 0.3 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) b.at({ p: [(c - 3.5) * 0.3, -0.12 - r * 0.08, 0] }, () => b.box(0.2, 0.05, 0.05, {}));
  });
  return b.build();
}
