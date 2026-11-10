import { RigBuilder, PI, lerp } from './RigKit.js';

/**
 * Ley Whip — procedural geometry.
 *
 * A zigzag ley ribbon: the line the earth remembers, flicked loose.
 * The hero is the ley line: six straight segments laid in a zigzag with a
 * glyph node at every bend, each segment hinged at its joint to flex
 * alternately as the whip cracks, trailing a thin parallel guide.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A three-segment zigzag with a node at each joint. Centred on y = 0, its largest extent one unit. */
export function createLeyWhipPieceGeometry() {
  const b = new RigBuilder('leywhip.piece');
  const pts = [[-0.2, -0.5], [0.2, -0.17], [-0.2, 0.17], [0.2, 0.5]];
  pts.forEach(([x, y], i) => {
    b.part({ glow: 0.8 });
    b.at({ p: [x, y, 0] }, () => b.orb(0.05, { sides: 4, rings: 2, ey: 1.4 }));
    if (i < pts.length - 1) {
      const [x2, y2] = pts[i + 1];
      b.part({ pivot: [x, y, 0], axis: [0, 0, 1], swing: (i % 2 ? -1 : 1) * 0.4, stage: 1, delay: i * 0.1, edge: 0.9 });
      b.tube((t) => [lerp(x, x2, t), lerp(y, y2, t), 0], { r: 0.022, sides: 4, segs: 2 });
    }
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Six zigzag segments, seven glyph nodes and a parallel guide ribbon. */
export function createLeyWhipHeroGeometry() {
  const b = new RigBuilder('leywhip.hero');
  b.fit('mass');
  const node = (i) => [(i % 2 ? 0.28 : -0.28), 0.5, i * 0.3];
  for (let i = 0; i < 7; i++) {
    const [x, y, z] = node(i);
    b.part({ glow: 0.9 });
    b.at({ p: [x, y, z] }, () => b.orb(0.07, { sides: 4, rings: 2, ey: 1.4 }));
    if (i < 6) {
      const [x2, y2, z2] = node(i + 1);
      b.part({ pivot: [x, y, z], axis: [0, 1, 0], swing: (i % 2 ? -1 : 1) * 0.35, stage: 1, delay: i * 0.06, edge: 0.9, glow: 0.2 });
      b.tube((t) => [lerp(x, x2, t), y, lerp(z, z2, t)], { r: 0.03, sides: 4, segs: 2 });
      b.part({ pivot: [x, y, z], axis: [0, 1, 0], swing: (i % 2 ? -1 : 1) * 0.35, stage: 1, delay: i * 0.06, edge: 0.6 });
      b.tube((t) => [lerp(x, x2, t) * 0.4, y - 0.12, lerp(z, z2, t)], { r: 0.008, sides: 3, segs: 2 });
    }
  }

  // Rings round each node and a pair of sparks either side.
  for (let i = 0; i < 7; i++) {
    const [x, y, z] = node(i);
    b.part({ edge: 0.9, glow: 0.3 });
    b.at({ p: [x, y, z], r: [PI / 2, 0, 0] }, () => b.torus(0.12, 0.012, { segs: 14, sides: 4 }));
    b.part({ glow: 0.9, pivot: [x, y, z], axis: [0, 0, 1], swing: (i % 2 ? -1 : 1) * 0.8, stage: 1, delay: i * 0.05 });
    [-1, 1].forEach((s) => b.at({ p: [x + s * 0.12, y + 0.1, z], r: [0, 0, -s * 0.8] }, () => b.pyramid(3, 0.025, 0.12, {})));
  }
  // Glyph ticks along each segment.
  b.part({ edge: 0.6, glow: 0.4 });
  for (let i = 0; i < 6; i++) {
    const [x, , z] = node(i);
    const [x2, , z2] = node(i + 1);
    [0.3, 0.55, 0.8].forEach((t) => b.at({ p: [lerp(x, x2, t), 0.56, lerp(z, z2, t)] }, () => b.box(0.03, 0.02, 0.07, {})));
  }
  return b.build();
}
