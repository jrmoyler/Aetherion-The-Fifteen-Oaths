/**
 * Authored additions to the Covenant Weaving family.
 *
 * These are *gameplay* records — the UCSM `WeavingManager` reads them every
 * tick — so nothing here is presentation. How each weave looks lives in
 * `WeaveLook.js` (live settings), `WeaveHeroGeometry.js` (shapes) and
 * `WeavePresentation.js` (layer assembly).
 *
 * Shared defaults (overridden per move):
 *
 *  - `range` 18 m cast reach, `cost` 10 energy, `cooldown` 21 s,
 *    `anticipation` 0.4 s wind-up before the anchor lands, `recovery` 0.5 s.
 *  - `life` 12 s per anchor, `maxAnchors` 3 per owner, `maxLink` 14 m.
 *  - `anchorHealth` 2 hostile intensity points before an anchor breaks.
 *  - `width` 0.34 m link capsule radius; `pulse` 0.8 s per-target hit cooldown
 *    (and terrain imprint cadence); `damage` 0.65 per link hit.
 *
 * Behaviour keys:
 *
 *  - `chain` — a link hit arcs to up to `chainTargets` hostiles within
 *    `chainRadius` m for `chainDamage`.
 *  - `flood` — three linked anchors flood their triangle every `floodPulse` s
 *    for `floodDamage`.
 *  - `quake` — a link hit shocks hostiles within `quakeRadius` m for
 *    `quakeDamage`.
 *  - `shatter` — an anchor destroyed by an opponent bursts for
 *    `shatterDamage` within `shatterRadius` m.
 *  - `draft` — the owner moving inside a link runs at `draftSpeed` ×.
 *
 * All limits are in metres and seconds.
 */
const spec = (slug, name, element, data) => Object.freeze({
  uid: `mechanics/weave/${slug}`,
  family: 'weave',
  name,
  element,
  range: 18,
  cost: 10,
  cooldown: 21,
  anticipation: 0.4,
  recovery: 0.5,
  castAnim: 'cast1',
  life: 12,
  maxAnchors: 3,
  maxLink: 14,
  anchorHealth: 2,
  width: 0.34,
  pulse: 0.8,
  damage: 0.65,
  ...data
});

export const WEAVE_VARIANTS = Object.freeze([
  spec('neural-thunder-grid', 'Neural Thunder Grid', 'storm', {
    behavior: 'chain', chainRadius: 4, chainDamage: 0.4, chainTargets: 3, pulse: 1
  }),
  spec('hydrostatic-labyrinth', 'Hydrostatic Labyrinth', 'water', {
    behavior: 'flood', floodPulse: 1.5, floodDamage: 0.35, width: 0.42
  }),
  spec('tectonic-triangulation', 'Tectonic Triangulation', 'earth', {
    behavior: 'quake', quakeRadius: 2.1, quakeDamage: 0.45, pulse: 1.2, anchorHealth: 3
  }),
  spec('prismatic-cathedral', 'Prismatic Cathedral', 'crystal', {
    behavior: 'shatter', shatterRadius: 3, shatterDamage: 0.8, damage: 0.45
  }),
  spec('jetstream-loom', 'Jetstream Loom', 'wind', {
    behavior: 'draft', draftSpeed: 1.35, width: 0.7, damage: 0.4, pulse: 0.7
  })
]);

/** Hints describe actual sandbox behaviour, including draft's player-only movement integration. */
const WEAVE_HINTS = Object.freeze({
  'mechanics/weave/cryostasis-mesh': 'Place frost anchors; links chill enemies that cross.',
  'mechanics/weave/neural-thunder-grid': 'Place storm anchors; crossing enemies spark chains to nearby foes.',
  'mechanics/weave/hydrostatic-labyrinth': 'Place three water anchors in a triangle to flood enemies within it.',
  'mechanics/weave/tectonic-triangulation': 'Place earth anchors; crossing enemies trigger a local shock.',
  'mechanics/weave/prismatic-cathedral': 'Place crystal anchors; a destroyed anchor bursts against nearby foes.',
  'mechanics/weave/jetstream-loom': 'Place wind anchors; moving along a link increases your speed.'
});

/** The default (Infernal Circuit) hint covers any uid without its own entry. */
export const weaveHint = (uid) => WEAVE_HINTS[uid] ?? 'Place fire anchors; links ignite enemies that cross.';
