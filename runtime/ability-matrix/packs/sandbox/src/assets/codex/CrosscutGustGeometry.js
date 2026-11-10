import { RigBuilder, PI, helixPath } from './RigKit.js';

/**
 * Crosscut Gust — procedural geometry.
 *
 * A gust hinged at the hand cuts across the cast.
 * The hero is the gust blade: three nested crescent sheets of air that
 * bow forward from the hand, with curled tips that whip back on the cut.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A small crescent shard with two curled tips. Centred on y = 0, its largest extent one unit. */
export function createCrosscutGustPieceGeometry() {
  const b = new RigBuilder('crosscut.piece');
  b.part({ crease: 55, edge: 0.5 });
  b.ribbon((t) => [Math.sin(t * PI) * 0.3 - 0.05, (t - 0.5) * 0.9, 0], { w: (t) => 0.2 * Math.sin(t * PI) ** 0.8, segs: 12, up: [0, 0, 1] });
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ crease: 55, pivot: [0, s * 0.42, 0], axis: [0, 0, 1], swing: s * 0.9, stage: 1, delay: 0.1 });
    b.ribbon((t) => [0.18 * Math.sin(t * 3.5) * t - 0.05, s * (0.4 + t * 0.12), 0.18 * t], { w: (t) => 0.05 * (1 - t) + 0.01, segs: 6, up: [1, 0, 0] });
  }

  // Feather barbs along the edge of the crescent.
  b.part({ glow: 0.4, pivot: [0, 0, 0], axis: [0, 0, 1], swing: -0.4, stage: 1, delay: 0.1 });
  for (let i = 0; i < 5; i++) {
    const t = 0.2 + i * 0.15;
    b.at({ p: [Math.sin(t * PI) * 0.3 - 0.05 + 0.1, (t - 0.5) * 0.9, 0], r: [0, 0, -1.1] }, () => b.blade({ len: 0.14, w: 0.02, thick: 0.006, segs: 3 }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three nested crescents, curled tip ribbons and a hand sleeve. */
export function createCrosscutGustHeroGeometry() {
  const b = new RigBuilder('crosscut.hero');
  b.fit('mass');
  // Three nested crescents lying in the cast plane, widest outermost.
  for (let i = 0; i < 3; i++) {
    const bow = 0.7 - i * 0.18;
    const len = 1.6 - i * 0.28;
    b.part({ crease: 55, edge: 0.45, glow: i === 2 ? 0.4 : 0, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.25 * (i - 1), stage: 1, delay: i * 0.08 });
    b.ribbon((t) => [bow * Math.sin(t * PI) ** 0.9 * (t < 0.5 ? 1 : 1 - (t - 0.5) * 0.6), 0.1 * i, t * len], { w: (t) => (0.5 - i * 0.12) * Math.sin(t * PI) ** 0.6 + 0.02, segs: 30, up: [1, 0, 0] });
  }
  // Curled tip ribbons that whip back on the cut.
  for (let i = 0; i < 3; i++) {
    b.part({ crease: 55, edge: 0.3, pivot: [0, 0.1 * i, 1.6 - i * 0.28], axis: [0, 1, 0], swing: -0.9, stage: 1, delay: 0.2 + i * 0.05 });
    b.ribbon((t) => [0.2 * t * Math.sin(t * 4), 0.1 * i, 1.6 - i * 0.28 + t * 0.35], { w: (t) => 0.1 * (1 - t) + 0.01, segs: 10, up: [1, 0, 0] });
  }
  // Hand sleeve at the hinge.
  b.part({ glow: 0.5 });
  b.aimZ(() => b.lathe([[0.1, -0.12], [0.08, 0.0], [0.05, 0.2]], 8, {}));

  // Two slim outer crescents that open as the gust cuts.
  for (let i = 0; i < 2; i++) {
    b.part({ crease: 55, edge: 0.3, pivot: [0, 0, 0], axis: [0, 1, 0], swing: -0.3 + i * 0.5, stage: 1, delay: 0.1 + i * 0.08, glow: 0.15 });
    b.ribbon((t) => [(0.95 + i * 0.2) * Math.sin(t * PI) ** 0.9, 0.2 + i * 0.08, t * (1.9 - i * 0.2)], { w: (t) => 0.12 * Math.sin(t * PI) ** 0.6 + 0.01, segs: 30, up: [1, 0, 0] });
  }
  // A vortex curl at the root of the cut.
  b.part({ crease: 40, edge: 0.2, glow: 0.3, pivot: [0, 0.2, 0.3], axis: [0, 1, 0], swing: 0.8, stage: 1 });
  b.at({ p: [0, 0.05, 0.3] }, () => b.ribbon(helixPath(0.06, 0.32, 1.5, 0.3, 0, 0), { w: 0.07, segs: 30, up: [0, 1, 0] }));
  // Feather barbs along the main edge.
  b.part({ glow: 0.4 });
  for (let i = 0; i < 8; i++) {
    const t = 0.15 + i * 0.1;
    b.at({ p: [0.7 * Math.sin(t * PI) ** 0.9, 0.0, t * 1.6], r: [PI / 2, 0, -0.9] }, () => b.blade({ len: 0.18, w: 0.025, thick: 0.008, segs: 3 }));
  }
  return b.build();
}
