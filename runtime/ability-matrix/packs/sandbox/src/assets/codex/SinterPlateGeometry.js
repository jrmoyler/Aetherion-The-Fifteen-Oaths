import { RigBuilder, rng } from './RigKit.js';

/**
 * Sinter Plate — procedural geometry.
 *
 * A plate of sinter walks the rim, locks, and stamps the circle flat.
 * The hero is the plate itself: a terraced mineral pan with scalloped
 * pool lips, ringed by upright collar plates that fall outward on the stamp.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Three scalloped travertine pans stacked small over large, the top pan tipping. Centred on y = 0, its largest extent one unit. */
export function createSinterPlatePieceGeometry() {
  const b = new RigBuilder('sinter.piece');
  const rand = rng(21);
  for (let i = 0; i < 3; i++) {
    const r = 0.46 - i * 0.12;
    b.part({ pivot: [r, i * 0.17, 0], axis: [0, 0, 1], swing: -0.35 * i, stage: 1, delay: 0.1 * i, glow: i === 2 ? 0.5 : 0 });
    b.lathe([[r * 0.8, i * 0.17], [r, i * 0.17 + 0.03], [r * 1.02, i * 0.17 + 0.1], [r * 0.9, i * 0.17 + 0.15], [0, i * 0.17 + 0.12]], 14, { jag: (k, j) => 1 + (j % 2 ? -0.07 : 0.05) + rand() * 0.02 });
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A four-step terraced pan, a rim of twelve collar plates and a mineral rosette. */
export function createSinterPlateHeroGeometry() {
  const b = new RigBuilder('sinter.hero');
  b.fit('ring');
  const rand = rng(23);
  // Four terraces, each lip scalloped, each step pooled lower than the last.
  const steps = [[1.0, 0], [0.82, 0.07], [0.62, 0.14], [0.4, 0.2]];
  steps.forEach(([r, y], i) => {
    b.part({ glow: i === 3 ? 0.6 : 0, pivot: [0, y, 0], axis: [Math.cos(i * 1.9), 0, Math.sin(i * 1.9)], swing: 0.1 + i * 0.04, stage: 1, delay: i * 0.06 });
    b.lathe([[r * 0.92, y], [r, y + 0.015], [r * 1.01, y + 0.07], [r * 0.94, y + 0.1], [r * 0.7, y + 0.06]], 36, { jag: (k, j) => 1 + 0.05 * Math.sin(j * 1.571) + (rand() - 0.5) * 0.015 });
  });
  // Collar: twelve upright plates that fall outward when the plate stamps.
  b.ring(12, 1.02, (i) => {
    b.part({ pivot: [0, 0, 0.03], axis: [1, 0, 0], swing: 1.35, stage: 1, delay: (i % 4) * 0.08 });
    b.box(0.44, 0.34 + rand() * 0.08, 0.05, { taper: [0.9, 1] });
  });
  // The rosette: mineral blades radiating from the centre pool.
  b.part({ glow: 0.5 });
  b.ring(9, 0.05, (i, t, a) => {
    b.at({ p: [0, 0.2, 0], r: [-0.9, 0, 0] }, () => b.blade({ len: 0.34, w: 0.07, thick: 0.015, segs: 4 }));
  });
  return b.build();
}
