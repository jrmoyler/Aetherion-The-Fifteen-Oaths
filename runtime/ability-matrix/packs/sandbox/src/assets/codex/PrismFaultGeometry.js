import { RigBuilder, PI, TAU, ngon, helixPath } from './RigKit.js';

/**
 * Prism Fault — procedural geometry.
 *
 * A fault of prism glass drills the line and throws three wakes.
 * The hero is the drill: a twisting three-sided bore with spiral
 * flutes, and three wake shards trailing behind it that fan open.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A three-sided prism shard flanked by two shorter fault splinters. Centred on y = 0, its largest extent one unit. */
export function createPrismFaultPieceGeometry() {
  const b = new RigBuilder('prismfault.piece');
  b.part({ glow: 0.5 });
  b.crystal({ sides: 3, r: 0.17, h: 1, tip: 0.3, asym: 0.12, foot: 0 });
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ pivot: [s * 0.14, -0.2, 0], axis: [0, 0, 1], swing: s * -0.5, stage: 1, delay: 0.1 });
    b.at({ p: [s * 0.2, -0.35, 0], r: [0, 0, s * -0.15] }, () => b.crystal({ sides: 3, r: 0.07, h: 0.5, tip: 0.35, asym: 0.1 }));
  }

  // A second tier of fault splinters higher on the shard.
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ pivot: [s * 0.1, 0.2, 0], axis: [0, 0, 1], swing: s * -0.6, stage: 1, delay: 0.2 });
    b.at({ p: [s * 0.14, 0.12, 0.05], r: [0, 0, s * -0.3] }, () => b.crystal({ sides: 3, r: 0.045, h: 0.3, tip: 0.4 }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A twisted trihedral bore, three helical flutes, a collar and three wake shards. */
export function createPrismFaultHeroGeometry() {
  const b = new RigBuilder('prismfault.hero');
  b.fit('mass');
  b.aimZ(() => {
    b.part({ glow: 0.85 });
    b.prism(ngon(3, 0.2), 0, 0.95, { taper: 0.02, twist: 2.6 });
    // Three helical flutes wind round the bore.
    for (let i = 0; i < 3; i++) {
      b.part({ edge: 0.8 });
      b.ribbon(helixPath(0.24, 0.05, 1.1, 0.9, 0.02, (i / 3) * TAU), { w: 0.1, segs: 22, up: [0, 1, 0] });
    }
    // Collar where the bore meets the wake.
    b.part();
    b.torus(0.24, 0.025, { segs: 18, sides: 4 });
    // The wake: three long shards trailing behind, fanning open on the beat.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      b.part({ pivot: [0, 0, 0], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.55, stage: 1, delay: i * 0.1, glow: 0.3 });
      b.at({ p: [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], r: [PI, 0, 0] }, () => b.crystal({ sides: 3, r: 0.07, h: 0.85, tip: 0.5, asym: 0.15 }));
    }
  });

  b.aimZ(() => {
    // A stand of loose prism splinters along the bore: three tiers of three.
    for (let tier = 0; tier < 3; tier++) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + tier * 0.6;
        b.part({ pivot: [Math.cos(a) * 0.22, 0.2 + tier * 0.25, Math.sin(a) * 0.22], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.7, stage: 1, delay: tier * 0.07 + i * 0.03, glow: 0.35 });
        b.at({ p: [Math.cos(a) * 0.22, 0.2 + tier * 0.25, Math.sin(a) * 0.22], r: [0, -a + PI / 2, 0.55] }, () => b.crystal({ sides: 3, r: 0.035, h: 0.28 - tier * 0.04, tip: 0.5, asym: 0.1 }));
      }
    }
    // A clear tip crystal ahead of the bore.
    b.part({ glow: 1 });
    b.at({ p: [0, 0.92, 0] }, () => b.crystal({ sides: 3, r: 0.05, h: 0.3, tip: 0.6 }));
  });
  return b.build();
}
