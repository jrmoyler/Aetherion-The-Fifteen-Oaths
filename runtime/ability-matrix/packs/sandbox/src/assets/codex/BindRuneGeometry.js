import { RigBuilder, PI, TAU, lerp } from './RigKit.js';

/**
 * Bind Rune — procedural geometry.
 *
 * Angular rune brackets bind the circle shut.
 * The hero is the binding: six standing stones each cut with a raised
 * bracket glyph on their inner face and a rune diamond floating above,
 * strung together on a hexagram of thin lines. The stones lean in as the
 * binding is drawn tight.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A small standing stone with a bracket glyph and a floating rune. Centred on y = 0, its largest extent one unit. */
export function createBindRunePieceGeometry() {
  const b = new RigBuilder('bindrune.piece');
  b.part({ pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.3, stage: 1 });
  b.at({ p: [0, -0.5, 0] }, () => b.box(0.3, 0.8, 0.12, { taper: [0.75, 0.8] }));
  b.part({ glow: 0.6, edge: 1, pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.3, stage: 1 });
  b.at({ p: [0, -0.15, 0.075] }, () => {
    b.box(0.05, 0.3, 0.03, {});
    b.at({ p: [0.0, 0.0, 0] }, () => b.box(0.14, 0.04, 0.03, {}));
    b.at({ p: [0, 0.26, 0] }, () => b.box(0.14, 0.04, 0.03, {}));
  });
  b.part({ glow: 1, pivot: [0, 0.1, 0], axis: [0, 1, 0], swing: 1.2, stage: 1 });
  b.at({ p: [0, 0.42, 0] }, () => b.orb(0.06, { sides: 4, rings: 2, ey: 1.5 }));

  // Base ring and two side glyph ticks.
  b.part({ edge: 0.8 });
  b.at({ p: [0, -0.5, 0] }, () => b.torus(0.24, 0.015, { segs: 14, sides: 4 }));
  b.part({ glow: 0.5, edge: 1, pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.3, stage: 1 });
  [-0.1, 0.1].forEach((x) => b.at({ p: [x, -0.3, 0.075] }, () => b.box(0.03, 0.2, 0.02, {})));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Six glyph stones, six floating runes, a hexagram of six lines and a centre sigil ring. */
export function createBindRuneHeroGeometry() {
  const b = new RigBuilder('bindrune.hero');
  b.fit('ring');
  // Hexagram on the floor: two triangles of thin bars.
  b.part({ edge: 0.8, glow: 0.3 });
  [0, PI / 6].forEach((ph) => {
    for (let i = 0; i < 3; i++) {
      const a0 = ph + (i / 3) * TAU;
      const a1 = ph + ((i + 1) / 3) * TAU;
      b.tube((t) => [lerp(Math.cos(a0), Math.cos(a1), t) * 0.95, 0.03, lerp(Math.sin(a0), Math.sin(a1), t) * 0.95], { r: 0.012, sides: 4, segs: 2 });
    }
  });
  b.at({ p: [0, 0.03, 0] }, () => b.torus(0.3, 0.015, { segs: 24, sides: 4 }));
  // Six stones; the glyph is raised on the inner (−z) face.
  b.ring(6, 0.95, (i) => {
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 2) * 0.1 });
    b.box(0.34, 0.95, 0.14, { taper: [0.7, 0.85] });
    b.part({ glow: 0.7, edge: 1, pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 2) * 0.1 });
    b.at({ p: [0, 0.2, -0.075] }, () => {
      b.box(0.05, 0.45, 0.03, {});
      b.box(0.16, 0.05, 0.03, {});
      b.at({ p: [0, 0.4, 0] }, () => b.box(0.16, 0.05, 0.03, {}));
    });
    b.part({ glow: 1, pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 2) * 0.1 });
    b.at({ p: [0, 1.15, 0] }, () => b.orb(0.07, { sides: 4, rings: 2, ey: 1.5 }));
  });
  return b.build();
}
