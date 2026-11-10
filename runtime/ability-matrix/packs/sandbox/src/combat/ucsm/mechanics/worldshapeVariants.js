/**
 * Authored terrain profiles of the Worldshape family.
 *
 * These are *gameplay* records read by the UCSM `WorldshapeManager`; the
 * renderer is bound to them (every solid stands on these collision centres,
 * every layer fits inside `radius`, the glacier's ramp matches `height`), but
 * how a terrain looks is set in `WorldshapeLook.js`.
 *
 * Shared defaults (overridden per profile):
 *
 *  - `range` 18 m, `cost` 25 energy, `cooldown` 14 s, `anticipation` 0.7 s,
 *    `recovery` 0.5 s, `castAnim` 'cast3'.
 *  - `life` 10 s the terrain stands; `radius` 4.2 m field; `height` 0 m ramp.
 *
 * Profile keys:
 *
 *  - `pulse` s between damage pulses inside the field, each `damage` strong
 *    and applying the element's status.
 *  - `ridges` — `[right, forward, collider radius]` offsets in metres from
 *    the cast point, rotated into the cast direction. Ridges block movement
 *    and line attacks.
 *  - `current` — floodplain only: metres of drift per metre moved, along the
 *    cast direction.
 *  - `style` — which rig `worldshapeVisuals` sculpts.
 */
const variant = (slug, name, element, settings) => Object.freeze({
  uid: `mechanics/worldshape/${slug}`,
  family: 'worldshape',
  name,
  element,
  range: 18,
  cost: 25,
  cooldown: 14,
  anticipation: 0.7,
  recovery: 0.5,
  castAnim: 'cast3',
  life: 10,
  radius: 4.2,
  height: 0,
  ...settings
});

export const WORLDSHAPE_VARIANTS = Object.freeze([
  variant('the-scorched-kingdom', 'The Scorched Kingdom', 'fire', {
    radius: 4.2, life: 9, pulse: 1, damage: 0.22,
    ridges: [[-2.4, 0, 0.7], [2.4, 0, 0.7]], style: 'scorched'
  }),
  variant('glaciers-dominion', "Glacier's Dominion", 'frost', {
    radius: 4.3, life: 10, height: 0.35, pulse: 1.4, damage: 0.12,
    ridges: [[-2.2, -0.6, 0.7], [2.2, -0.6, 0.7], [0, 2.3, 0.7]], style: 'glacier'
  }),
  variant('stormground', 'Stormground', 'storm', {
    radius: 4, life: 8, pulse: 0.8, damage: 0.25,
    ridges: [[-2.6, 0, 0.55], [2.6, 0, 0.55]], style: 'stormground'
  }),
  variant('the-living-floodplain', 'The Living Floodplain', 'water', {
    radius: 4.4, life: 10, pulse: 1.2, damage: 0.1, current: 0.35,
    ridges: [], style: 'floodplain'
  }),
  variant('the-glass-labyrinth', 'The Glass Labyrinth', 'crystal', {
    radius: 4.5, life: 10, pulse: 1.5, damage: 0.15,
    ridges: [[-2.2, -1.6, 0.65], [2.2, -1.6, 0.65], [-2.2, 1.6, 0.65], [2.2, 1.6, 0.65]], style: 'glass'
  })
]);
