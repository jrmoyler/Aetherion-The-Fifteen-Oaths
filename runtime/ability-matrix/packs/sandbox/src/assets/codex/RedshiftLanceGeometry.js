import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Redshift Lance — procedural geometry.
 *
 * A lance stretches down the line and redshifts as it goes.
 * The hero is the stretched wave: a thin spindle whose crest discs sit
 * further apart the further they run, a spiral ribbon whose pitch opens
 * up behind the tip, and a cooling tail.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A spindle with three crest rings whose spacing opens up. Centred on y = 0, its largest extent one unit. */
export function createRedshiftLancePieceGeometry() {
  const b = new RigBuilder('redshift.piece');
  b.part({ glow: 0.6 });
  b.lathe([[0.001, 0.5], [0.05, 0.3], [0.05, -0.3], [0.001, -0.5]], 6, {});
  [0.28, 0.0, -0.36].forEach((y, i) => {
    b.part({ pivot: [0, y, 0], axis: [1, 0, 0], swing: 0.5 * (i + 1) * 0.5, stage: 1, delay: i * 0.1, edge: 0.8 });
    b.at({ p: [0, y, 0] }, () => b.torus(0.18 - i * 0.02, 0.014, { segs: 14, sides: 4 }));
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A spindle, seven stretching crest discs, an opening spiral ribbon and a cooling tail. */
export function createRedshiftLanceHeroGeometry() {
  const b = new RigBuilder('redshift.hero');
  b.fit('mass');
  b.aimZ(() => {
    b.part({ glow: 0.9 });
    b.lathe([[0.001, 1.9], [0.04, 1.6], [0.06, 1.2], [0.05, 0.2], [0.03, -0.3]], 6, {});
    // Crest discs: each gap wider than the last.
    let y = 0.1;
    for (let i = 0; i < 7; i++) {
      const gap = 0.1 + i * 0.045;
      y += gap;
      b.part({ pivot: [0, y, 0], axis: [1, 0, 0], swing: 0.12 * (i + 1) * 0.6, stage: 1, delay: i * 0.05, edge: 0.8, glow: i === 6 ? 0.4 : 0 });
      b.at({ p: [0, y, 0] }, () => b.lathe([[0.17 + i * 0.012, -0.015], [0.2 + i * 0.012, 0], [0.17 + i * 0.012, 0.015]], 18, { cap: false }));
    }
    // A spiral ribbon whose pitch opens behind the tip.
    b.part({ crease: 40, edge: 0.3 });
    b.ribbon((t) => {
      const a = Math.pow(t, 0.7) * TAU * 3.2;
      return [Math.cos(a) * (0.1 + t * 0.1), 0.1 + Math.pow(t, 1.6) * 1.7, Math.sin(a) * (0.1 + t * 0.1)];
    }, { w: 0.05, segs: 50, up: [0, 1, 0] });
    // The cooling tail: three trailing streaks.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.part({ pivot: [0, -0.1, 0], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.4, stage: 1, delay: i * 0.1, glow: 0.2 });
      b.at({ p: [Math.cos(a) * 0.04, -0.1, Math.sin(a) * 0.04], r: [PI, 0, 0] }, () => b.lathe([[0.025, 0], [0.012, 0.35], [0.001, 0.75]], 4, {}));
    }
  });
  return b.build();
}
