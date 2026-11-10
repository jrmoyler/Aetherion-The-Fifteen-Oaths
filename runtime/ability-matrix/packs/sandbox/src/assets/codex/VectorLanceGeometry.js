import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Vector Lance — procedural geometry.
 *
 * Arrowhead vector fins: the lance is a vector that happens to be a spear.
 * The hero is the arrow: a flat barbed arrowhead on a long shaft, three
 * vector fins at the nock that sweep forward as it accelerates, and
 * three speed-line streaks trailing.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A barbed arrowhead with a short shaft and a fin. Centred on y = 0, its largest extent one unit. */
export function createVectorLancePieceGeometry() {
  const b = new RigBuilder('vectorlance.piece');
  b.part({ glow: 0.5 });
  b.at({ p: [0, 0.18, 0] }, () => b.lathe([[0.001, 0.32], [0.14, 0.04], [0.06, 0.02], [0.001, 0]], 4, { phase: PI / 4 }));
  b.part();
  b.lathe([[0.02, 0.2], [0.02, -0.5]], 6, {});
  b.part({ pivot: [0, -0.4, 0], axis: [0, 0, 1], swing: -0.6, stage: 1 });
  b.at({ p: [0, -0.4, 0], r: [0, 0, 0.5] }, () => b.blade({ len: 0.2, w: 0.04, thick: 0.01, segs: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A barbed head, a shaft, three nock fins and three speed streaks. */
export function createVectorLanceHeroGeometry() {
  const b = new RigBuilder('vectorlance.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Barbed head: a flat diamond with back barbs.
    b.part({ glow: 0.6 });
    b.lathe([[0.001, 1.9], [0.1, 1.5], [0.2, 1.2], [0.07, 1.14], [0.001, 1.1]], 4, { phase: PI / 4, ex: 1, ez: 0.35 });
    b.lathe([[0.001, 1.9], [0.1, 1.5], [0.2, 1.2], [0.07, 1.14], [0.001, 1.1]], 4, { phase: PI / 4, ex: 0.35, ez: 1 });
    // Shaft.
    b.part({ edge: 0.8 });
    b.lathe([[0.04, 1.12], [0.03, 0.2], [0.035, -0.4]], 8, {});
    // Fletching: three fins swept forward as the bolt accelerates.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      b.part({ pivot: [Math.cos(a) * 0.04, -0.15, Math.sin(a) * 0.04], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.6, stage: 1, delay: i * 0.06, glow: 0.2 });
      b.at({ p: [Math.cos(a) * 0.04, -0.4, Math.sin(a) * 0.04], r: [0, -a + PI / 2, 0] }, () => b.at({ r: [0, 0, 0] }, () => b.prism([[0, -0.01], [0.28, -0.01], [0.28, 0.01], [0, 0.01]], 0, 0.55, { taper: [0.5, 1], offset: [0, 0] })));
    }
    // Speed lines.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      b.part({ glow: 0.5, pivot: [0, -0.5, 0], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.25, stage: 1 });
      b.at({ p: [Math.cos(a) * 0.2, -0.5, Math.sin(a) * 0.2], r: [PI, 0, 0] }, () => b.lathe([[0.012, 0], [0.006, 0.9], [0.001, 1.4]], 4, {}));
    }
  });

  b.aimZ(() => {
    // Rings along the shaft.
    b.part({ edge: 0.9 });
    [0.0, 0.3, 0.6, 0.9].forEach((y) => b.at({ p: [0, y, 0] }, () => b.torus(0.05, 0.01, { segs: 10, sides: 4 })));
    // Four barbs behind the head that flare open on the beat.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + PI / 4;
      b.part({ pivot: [Math.cos(a) * 0.05, 1.15, Math.sin(a) * 0.05], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.7, stage: 1, delay: i * 0.05, glow: 0.4 });
      b.at({ p: [Math.cos(a) * 0.05, 1.14, Math.sin(a) * 0.05], r: [0, -a + PI / 2, 0] }, () => b.at({ r: [PI - 0.2, 0, 0] }, () => b.blade({ len: 0.32, w: 0.04, thick: 0.01, segs: 4 })));
    }
    // Three chevrons trailing, stacked V plates that tip back.
    for (let i = 0; i < 3; i++) {
      b.part({ glow: 0.5, edge: 0.8, pivot: [0, -0.6 - i * 0.25, 0], axis: [1, 0, 0], swing: 0.4, stage: 1, delay: i * 0.08 });
      b.at({ p: [0, -0.6 - i * 0.25, 0] }, () => b.prism([[0, 0.12], [0.22, -0.1], [0.22, -0.16], [0, 0.04], [-0.22, -0.16], [-0.22, -0.1]], 0, 0.02, {}));
    }
  });
  return b.build();
}
