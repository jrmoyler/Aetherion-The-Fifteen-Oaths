import { RigBuilder, rng } from './RigKit.js';

/**
 * Shard Choir — procedural geometry.
 *
 * Shards choir around the rim, then converge on one note.
 * The hero is the choir: nine slender crystals of unequal height
 * standing in a ring, linked at the foot, each leaning inward on the
 * converge, with the held note hanging at their centre.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A tall crystal with two lesser voices leaning off its shoulders. Centred on y = 0, its largest extent one unit. */
export function createShardChoirPieceGeometry() {
  const b = new RigBuilder('shardchoir.piece');
  b.part({ glow: 0.4 });
  b.crystal({ sides: 6, r: 0.13, h: 1, tip: 0.3, asym: 0.2 });
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ pivot: [s * 0.1, -0.35, 0], axis: [0, 0, 1], swing: s * -0.5, stage: 1, delay: 0.08 * (i + 1) });
    b.at({ p: [s * 0.2, -0.45, 0], r: [0, 0, s * -0.25] }, () => b.crystal({ sides: 5, r: 0.06, h: 0.5 - i * 0.12, tip: 0.35 }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Nine standing shards, a linking foot ring, three inner voices and a floating note. */
export function createShardChoirHeroGeometry() {
  const b = new RigBuilder('shardchoir.hero');
  b.fit('ring');
  const rand = rng(51);
  b.part({ edge: 0.6 });
  b.torus(0.95, 0.025, { segs: 36, sides: 4 });
  // The choir: nine shards, heights stepped like voices.
  b.ring(9, 0.95, (i) => {
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.62, stage: 1, delay: (i % 3) * 0.08, glow: i % 3 === 0 ? 0.4 : 0 });
    b.at({ r: [0.12, 0, 0] }, () => b.crystal({ sides: 6, r: 0.07, h: 0.8 + (i % 3) * 0.28 + rand() * 0.1, tip: 0.3, asym: 0.2 }));
  });
  // Inner voices: three shorter shards on a smaller ring, leaning out.
  b.ring(3, 0.45, (i) => {
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: 0.25 });
    b.at({ r: [-0.2, 0, 0] }, () => b.crystal({ sides: 5, r: 0.05, h: 0.5, tip: 0.35 }));
  }, { phase: 0.5 });
  // The note: a held octahedron.
  b.part({ glow: 1 });
  b.at({ p: [0, 0.85, 0] }, () => b.orb(0.14, { sides: 4, rings: 2, ey: 1.5 }));
  return b.build();
}
