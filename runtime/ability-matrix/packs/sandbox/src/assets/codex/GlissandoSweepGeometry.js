import { RigBuilder, PI, lerp } from './RigKit.js';

/**
 * Glissando Sweep — procedural geometry.
 *
 * A glissando sheet slides sideways and arrives late.
 * The hero is the comb: twelve fins climbing in height like a rising
 * scale along a rail, each tipping over a step after its neighbour so the
 * motion runs across the sheet like a slide, under a travelling wave.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A five-key comb rising in height, each key tipping a step late. Centred on y = 0, its largest extent one unit. */
export function createGlissandoSweepPieceGeometry() {
  const b = new RigBuilder('glissando.piece');
  b.part();
  b.box(0.62, 0.04, 0.08, {});
  for (let i = 0; i < 5; i++) {
    b.part({ pivot: [(i - 2) * 0.12, 0.04, 0], axis: [0, 0, 1], swing: -0.5, stage: 1, delay: i * 0.08, glow: i === 4 ? 0.4 : 0 });
    b.at({ p: [(i - 2) * 0.12, 0.04, 0] }, () => b.box(0.05, 0.25 + i * 0.12, 0.04, { taper: [0.8, 1] }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A rail, twelve rising fins, a travelling wave ribbon and a bridge at each end. */
export function createGlissandoSweepHeroGeometry() {
  const b = new RigBuilder('glissando.hero');
  b.fit('mass');
  // Rail.
  b.part({ edge: 0.7 });
  b.at({ p: [0, 0.04, 0] }, () => b.box(2.7, 0.07, 0.14, {}));
  // Twelve fins: each taller than the last, each tipping over a step later.
  for (let i = 0; i < 12; i++) {
    const x = (i - 5.5) * 0.22;
    b.part({ pivot: [x, 0.08, 0], axis: [0, 0, 1], swing: -0.55, stage: 1, delay: i * 0.04, glow: i % 4 === 3 ? 0.4 : 0 });
    b.at({ p: [x, 0.08, 0] }, () => b.box(0.14, 0.3 + i * 0.07, 0.04, { taper: [0.75, 1] }));
  }
  // A wave ribbon travelling above the tips.
  b.part({ crease: 55, edge: 0.3, glow: 0.3 });
  b.ribbon((t) => [(t - 0.5) * 2.5, 1.0 + 0.1 * Math.sin(t * 9), 0], { w: 0.1, segs: 40, up: [0, 0, 1] });
  // Bridges at the two ends.
  b.part();
  [-1.3, 1.3].forEach((x) => b.at({ p: [x, 0, 0] }, () => b.cylinder(0.06, 0.22, 6, { r1: 0.04 })));

  // A cap on every fin, tipping with it, and a string from each to the wave.
  for (let i = 0; i < 12; i++) {
    const x = (i - 5.5) * 0.22;
    b.part({ pivot: [x, 0.08, 0], axis: [0, 0, 1], swing: -0.55, stage: 1, delay: i * 0.04, glow: 0.8 });
    b.at({ p: [x, 0.38 + i * 0.07, 0] }, () => b.pyramid(4, 0.06, 0.1, { phase: PI / 4 }));
  }
  b.part({ edge: 0.5 });
  for (let i = 0; i < 12; i++) {
    const x = (i - 5.5) * 0.22;
    b.tube((t) => [x, lerp(0.5 + i * 0.07, 1.0 + 0.1 * Math.sin((i / 11) * 9), t), 0], { r: 0.005, sides: 3, segs: 2 });
  }
  return b.build();
}
