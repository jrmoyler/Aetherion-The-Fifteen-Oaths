/**
 * The five authored Convergence moves.
 *
 * A convergence aims at a live elemental region, consumes up to
 * `maxIngredients` compatible ingredients that overlap its reaction disc
 * (`radius`) and resolves the typed UCSM reaction — that part is owned by
 * `ConvergenceManager` and is identical for every move. What makes each move
 * its own is the **secondary strike pattern** below: a bounded, deterministic
 * set of discs and capsules, aimed along the cast direction, that the manager
 * turns into one hit event per shape. A target inside several shapes is hit
 * once. The presentation (`ConvergenceArt.js`, `ConvergenceHeroGeometry.js`)
 * and the aim telegraph (`ConvergenceTelegraph.js`) are drawn from these same
 * shapes, so what you see is exactly what lands.
 *
 * Units: seconds and metres. `range` is the cast range, `cost` sovereignty,
 * `life` the presentation lifetime of the impact, `damage` per strike.
 */
const preset = (slug, name, element, pattern, opts = {}) =>
  Object.freeze({
    uid: `mechanics/convergence/${slug}`,
    family: 'convergence',
    name,
    element,
    pattern,
    range: 18, // cast range, metres
    cost: 20, // sovereignty
    cooldown: 6, // seconds
    anticipation: 0.5, // charge time before the reaction resolves
    recovery: 0.5,
    castAnim: 'cast2',
    life: 1.8, // how long the impact presentation stands
    radius: 4, // reaction disc: ingredients must overlap it
    maxIngredients: 3,
    ...opts
  });

export const CONVERGENCE_VARIANTS = Object.freeze([
  // A single nova of fire that fills the whole reaction disc.
  preset('promethean-ignition', 'Promethean Ignition', 'fire', 'nova', {
    damage: 1.1,
    radius: 3.6,
    ingredientExample: 'water'
  }),
  // A frozen crown: a core disc and six satellite spires around it.
  preset('absolute-crystallization', 'Absolute Crystallization', 'frost', 'crown', {
    damage: 0.7,
    radius: 4.1,
    cooldown: 7,
    ingredientExample: 'water'
  }),
  // A breaking wave: one long capsule that starts behind the cast point.
  preset('hydrodynamic-synthesis', 'Hydrodynamic Synthesis', 'water', 'wave', {
    damage: 0.8,
    radius: 4,
    cooldown: 5.5,
    ingredientExample: 'fire'
  }),
  // Three basalt eruptions in a line along the aim.
  preset('elemental-lithification', 'Elemental Lithification', 'earth', 'eruption', {
    damage: 1,
    radius: 3.4,
    anticipation: 0.65,
    ingredientExample: 'frost'
  }),
  // A refracted fan: three narrow beams spread ±0.48 rad.
  preset('prismatic-multiplication', 'Prismatic Multiplication', 'crystal', 'fan', {
    damage: 0.75,
    radius: 3.8,
    cooldown: 5.5,
    ingredientExample: 'storm'
  })
]);

const disk = (x, z, r) => ({ kind: 'disc', x, z, r });
const line = (x, z, dx, dz, n, r) => ({ kind: 'capsule', ax: x, az: z, bx: x + dx * n, bz: z + dz * n, r });

/**
 * The strike shapes of move `p` cast at `c.position` along `c.direction`.
 * Shapes are bounded and deterministic; the ordering is part of the contract
 * (presentation names each impact layer by its index).
 */
export function convergenceStrikeShapes(p, c) {
  const [x, , z] = c.position;
  const [dx, , dz] = c.direction;
  switch (p.pattern) {
    case 'nova':
      return [disk(x, z, 3.6)];
    case 'crown':
      return [
        disk(x, z, 2.2),
        ...Array.from({ length: 6 }, (_, i) => {
          // Satellites at 60° steps, rotated with the aim.
          const a = (i * Math.PI) / 3;
          return disk(
            x + (dx * Math.cos(a) + dz * Math.sin(a)) * 3,
            z + (dz * Math.cos(a) - dx * Math.sin(a)) * 3,
            0.85
          );
        })
      ];
    case 'wave':
      // Starts two metres behind the cast point and runs eight forward.
      return [line(x - dx * 2, z - dz * 2, dx, dz, 8, 1.25)];
    case 'eruption':
      return [-2.5, 0, 2.5].map((n) => disk(x + dx * n, z + dz * n, 1.2));
    case 'fan':
      return [-0.48, 0, 0.48].map((a) => {
        const vx = dx * Math.cos(a) + dz * Math.sin(a);
        const vz = dz * Math.cos(a) - dx * Math.sin(a);
        return line(x, z, vx, vz, 6, 0.42);
      });
    default:
      return [];
  }
}
