import { RigBuilder, PI, TAU, rng, ngon, arcBand } from './RigKit.js';

/**
 * Scarp Break — procedural geometry.
 *
 * A scarp face shears up inside the circle and topples outward.
 * The hero is the escarpment: five courses of curved strata slabs around a
 * collapsing rim, each hinged at its outer foot, with a stratified spire
 * standing in the middle and talus tumbled at its feet.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A three-layer stratified stub whose upper blocks lean off their seats. Centred on y = 0, its largest extent one unit. */
export function createScarpBreakPieceGeometry() {
  const b = new RigBuilder('scarp.piece');
  const rand = rng(3);
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const r = [0.3, 0.26, 0.2][i];
    const h = [0.38, 0.32, 0.3][i];
    const poly = ngon(6, r).map(([x, z]) => [x * (0.8 + rand() * 0.4), z * (0.8 + rand() * 0.4)]);
    b.part({ pivot: [r * 0.6, y, 0], axis: [0, 0, 1], swing: -0.22 * i, stage: 1, delay: 0.12 * i, glow: i === 2 ? 0.5 : 0 });
    b.at({ p: [rand() * 0.06, y, rand() * 0.06], r: [0, rand() * 6, 0] }, () => b.prism(poly, 0, h, { taper: 0.85 }));
    y += h * 0.92;
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Twenty-five curved strata slabs, a six-layer core spire and nine boulders. */
export function createScarpBreakHeroGeometry() {
  const b = new RigBuilder('scarp.hero');
  b.fit('mass');
  const rand = rng(11);
  // Rim: five courses of curved slabs. Each course steps outward and is
  // rotated against the last, so the joints never line up.
  for (let course = 0; course < 5; course++) {
    const y = course * 0.27;
    const r0 = 0.72 + course * 0.05;
    b.ring(5, 0, () => {
      const span = 1.0 + rand() * 0.18;
      const top = y + 0.25 + rand() * 0.04;
      b.part({ pivot: [0, y, r0 + 0.2], axis: [1, 0, 0], swing: 0.18 + course * 0.17, stage: 1, delay: course * 0.07 + rand() * 0.05, glow: course === 4 ? 0.3 : 0 });
      b.prism(arcBand(PI / 2 - span / 2, PI / 2 + span / 2, r0, r0 + 0.2, 6, (i, n, outer) => 1 + (rand() - 0.5) * (outer ? 0.07 : 0.03)), y, top, { taper: [0.97, 0.97] });
    }, { phase: course * 0.62 });
  }
  // The heart: a core spire of six stratified layers, each rotated and narrower.
  for (let i = 0; i < 6; i++) {
    b.part({ pivot: [0.2, i * 0.26, 0], axis: [0, 0, 1], swing: -0.1 * i, stage: 1, delay: 0.1 + i * 0.06, glow: i === 5 ? 0.9 : 0 });
    b.at({ p: [0, i * 0.26, 0], r: [0, i * 0.5, 0] }, () => b.prism(ngon(6, 0.38 - i * 0.04).map(([x, z]) => [x * (0.85 + rand() * 0.3), z * (0.85 + rand() * 0.3)]), 0, 0.25, { taper: 0.92 }));
  }
  b.part();
  b.pyramid(6, 0.2, 0.55, {});
  for (let i = 0; i < 9; i++) {
    const a = rand() * TAU;
    const r = 1.12 + rand() * 0.35;
    b.at({ p: [Math.cos(a) * r, 0, Math.sin(a) * r], r: [rand(), rand() * 6, rand()] }, () => b.orb(0.07 + rand() * 0.07, { sides: 5, rings: 3, ey: 0.75 }));
  }
  return b.build();
}
