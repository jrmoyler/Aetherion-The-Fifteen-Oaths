import { RigBuilder, TAU, helixPath } from './RigKit.js';

/**
 * Whisper Well — procedural geometry.
 *
 * A well of whisper inhales the circle, then shouts straight up.
 * The hero is the horn: a deep flared bell sunk in the floor, three
 * spiral channels winding up its throat, eight lip petals that peel
 * open, and the shout pipe standing in the middle.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A tiny horn with a rolled lip and a straight shout rod. Centred on y = 0, its largest extent one unit. */
export function createWhisperWellPieceGeometry() {
  const b = new RigBuilder('whisperwell.piece');
  b.part({ crease: 35 });
  b.lathe([[0.04, -0.5], [0.06, -0.3], [0.12, -0.1], [0.24, 0.12], [0.4, 0.3]], 10, { cap: false });
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0.3, 0.28, 0], axis: [0, 0, 1], swing: -0.7, stage: 1, delay: i * 0.1 });
    b.at({ p: [0, 0.3, 0], r: [0, (i / 3) * TAU, 0] }, () => b.at({ p: [0.38, 0, 0] }, () => b.blade({ len: 0.2, w: 0.06, thick: 0.01, segs: 4 })));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A flared bell, three throat spirals, eight lip petals and a shout pipe. */
export function createWhisperWellHeroGeometry() {
  const b = new RigBuilder('whisperwell.hero');
  b.fit('ring');
  // The bell: slow at first, then flaring wide at the mouth.
  b.part({ crease: 30, edge: 0.4 });
  b.lathe([[0.08, 0], [0.1, 0.12], [0.14, 0.26], [0.22, 0.4], [0.38, 0.54], [0.62, 0.66], [0.9, 0.74]], 24, { cap: false });
  // Three spiral channels climbing the throat.
  for (let i = 0; i < 3; i++) {
    b.part({ edge: 0.9, glow: 0.2 });
    b.ribbon(helixPath(0.12, 0.8, 1.2, 0.7, 0.02, (i / 3) * TAU), { w: 0.07, segs: 30, up: [0, 1, 0] });
  }
  // Lip petals peel outward on the shout.
  b.ring(8, 0.9, (i) => {
    b.part({ pivot: [0, 0.74, 0], axis: [1, 0, 0], swing: 0.85, stage: 1, delay: (i % 2) * 0.1, glow: 0.25 });
    b.at({ p: [0, 0.74, 0], r: [-0.3, 0, 0] }, () => b.blade({ len: 0.34, w: 0.13, thick: 0.014, segs: 5 }));
  });
  // The shout pipe: an open tube standing in the middle.
  b.part({ glow: 0.7 });
  b.lathe([[0.07, 0], [0.07, 1.3], [0.1, 1.4]], 10, { cap: false });
  return b.build();
}
