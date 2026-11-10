import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Facet Volley — procedural geometry.
 *
 * Faceted seeds arc down the line and plant where they strike.
 * The hero is one seed in flight: a cut gem, four tail fins that fold
 * shut as it dives, and three root crystals that splay open when it plants.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A brilliant-cut gem with a crown, a girdle and a pointed pavilion. Centred on y = 0, its largest extent one unit. */
export function createFacetVolleyPieceGeometry() {
  const b = new RigBuilder('facetvolley.piece');
  b.part({ glow: 0.6 });
  b.lathe([[0.001, 0.5], [0.12, 0.42], [0.3, 0.18], [0.32, 0.12], [0.28, 0.08], [0.2, -0.1], [0.001, -0.5]], 8, { phase: PI / 8, jag: (i, j) => (i === 1 || i === 4 ? 1 : 1 + (j % 2 ? -0.06 : 0.06)) });
  b.part({ pivot: [0, 0.15, 0], axis: [0, 0, 1], swing: -0.6, stage: 1 });
  b.at({ p: [0.28, 0.14, 0], r: [0, 0, -0.9] }, () => b.crystal({ sides: 4, r: 0.04, h: 0.25, tip: 0.5 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A brilliant-cut seed, four tail fins, a girdle ring and three splaying roots. */
export function createFacetVolleyHeroGeometry() {
  const b = new RigBuilder('facetvolley.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The seed: crown, girdle, pavilion.
    b.part({ glow: 0.8 });
    b.lathe([[0.001, 0.62], [0.1, 0.54], [0.24, 0.3], [0.27, 0.24], [0.25, 0.2], [0.17, 0], [0.001, -0.3]], 8, { phase: PI / 8, jag: (i, j) => (i === 3 || i === 4 ? 1 : 1 + (j % 2 ? -0.05 : 0.05)) });
    b.part();
    b.at({ p: [0, 0.22, 0] }, () => b.torus(0.27, 0.014, { segs: 16, sides: 4 }));
    // Tail fins: fold shut as the seed dives.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + PI / 4;
      b.part({ pivot: [Math.cos(a) * 0.15, -0.28, Math.sin(a) * 0.15], axis: [-Math.sin(a), 0, Math.cos(a)], swing: -0.55, delay: 0, stage: 0 });
      b.at({ p: [Math.cos(a) * 0.15, -0.28, Math.sin(a) * 0.15], r: [PI, 0, 0] }, () => b.blade({ len: 0.5, w: 0.06, thick: 0.012, segs: 4 }));
    }
    // Roots: three crystals that splay on the beat.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.part({ pivot: [0, -0.3, 0], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.9, stage: 1, delay: i * 0.08, glow: 0.4 });
      b.at({ p: [0, -0.3, 0], r: [PI, 0, 0] }, () => b.crystal({ sides: 4, r: 0.05, h: 0.45, tip: 0.5 }));
    }
  });
  return b.build();
}
