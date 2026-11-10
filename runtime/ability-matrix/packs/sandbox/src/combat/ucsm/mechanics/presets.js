import { STANCE_VARIANTS } from './stance-presets.js';
import { WEAVE_VARIANTS } from './WeaveVariants.js';
import { CONVERGENCE_VARIANTS } from './ConvergenceVariants.js';
import { WORLDSHAPE_VARIANTS } from './worldshapeVariants.js';
/** Authoritative runtime presets. Seconds are converted to UCSM ticks once per action. */
const move = (family, slug, name, element, data) =>
  Object.freeze({
    uid: `mechanics/${family}/${slug}`,
    family,
    name,
    element,
    range: 18,
    cost: 20,
    cooldown: 8,
    anticipation: 0.4,
    recovery: 0.5,
    castAnim: 'cast2',
    ...data
  });
export const MECHANIC_PRESETS = Object.freeze({
  weave: move('weave', 'infernal-circuit', 'Infernal Circuit', 'fire', {
    cost: 10,
    cooldown: 20,
    life: 12,
    maxAnchors: 3,
    maxLink: 14,
    width: 0.32,
    anchorHealth: 2,
    pulse: 0.6,
    damage: 1,
    castAnim: 'cast1'
  }),
  stance: move('stance', 'aegis-exemplar', 'Aegis Exemplar', 'force', {
    cost: 12,
    cooldown: 18,
    life: 15,
    drain: 5,
    speed: 0.75,
    reduction: 0.65,
    bankCap: 3,
    finisherRadius: 5,
    damage: 1,
    anticipation: 0.5,
    castAnim: 'cast3'
  }),
  counter: move('counter', 'shatterpoint-reversal', 'Shatterpoint Reversal', 'frost', {
    cost: 12,
    cooldown: 1.3,
    anticipation: 0.1,
    perfect: 0.13,
    partial: 0.2,
    recovery: 0.65,
    reduction: 0.5,
    damage: 1,
    range: 24,
    castAnim: 'cast1'
  }),
  worldshape: move('worldshape', 'continental-uprising', 'Continental Uprising', 'earth', {
    cost: 25,
    cooldown: 14,
    life: 10,
    anticipation: 0.7,
    radius: 4.2,
    ridgeRadius: 1.1,
    height: 0.65,
    castAnim: 'cast3'
  }),
  convergence: move('convergence', 'storm-catalyst', 'Storm Catalyst', 'storm', {
    cost: 20,
    cooldown: 6,
    anticipation: 0.5,
    life: 1.8,
    radius: 4,
    maxIngredients: 3,
    castAnim: 'cast2'
  })
});
/** Additional moves use the same family manager but retain their own authored contract. */
export const CRYOSTASIS_MESH = move('weave', 'cryostasis-mesh', 'Cryostasis Mesh', 'frost', {
  cost: 10, cooldown: 22, life: 12, maxAnchors: 3, maxLink: 14,
  width: 0.42, anchorHealth: 2, pulse: 0.9, damage: 0.65, castAnim: 'cast1'
});
const counter = (slug, name, element, data) => move('counter', slug, name, element, {
  cost: 12, cooldown: 1.5, anticipation: 0.1, perfect: 0.13, partial: 0.2,
  recovery: 0.65, reduction: 0.5, damage: 0.8, range: 24, castAnim: 'cast1', ...data
});
export const COUNTER_VARIANTS = Object.freeze([
  counter('backdraft-reprisal', 'Backdraft Reprisal', 'fire', { damage: 0.85, footprint: 1.8, cooldown: 1.8 }),
  counter('feedback-execution', 'Feedback Execution', 'storm', { damage: 0.7, splash: 3, splashDamage: 0.45, perfect: 0.1 }),
  counter('undertow-reversal', 'Undertow Reversal', 'water', { damage: 0.6, footprint: 3, perfect: 0.17, cooldown: 1.8 }),
  counter('faultline-retort', 'Faultline Retort', 'earth', { damage: 1.1, splash: 2, splashDamage: 0.3, perfect: 0.1, recovery: 0.8 }),
  counter('facet-reprisal', 'Facet Reprisal', 'crystal', { damage: 0.6, shield: 0.15, partial: 0.25, cooldown: 1.8 })
]);
export const MECHANIC_VARIANTS = Object.freeze(Object.fromEntries([CRYOSTASIS_MESH, ...COUNTER_VARIANTS, ...STANCE_VARIANTS, ...WEAVE_VARIANTS, ...CONVERGENCE_VARIANTS, ...WORLDSHAPE_VARIANTS].map((p) => [p.uid, p])));
export const PLAYABLE_MECHANICS = Object.freeze([...Object.values(MECHANIC_PRESETS), ...Object.values(MECHANIC_VARIANTS)].map((p) => p.uid));
export const MECHANIC_BUDGET = Object.freeze({
  maxCommands: 64,
  commandsPerTick: 8,
  maxActors: 32,
  maxAnchors: 48,
  maxWorldshapes: 8,
  maxPending: 32,
  eventsPerTick: 24,
  maxTargets: 8,
  arenaRadius: 48,
  energy: 100,
  regen: 8
});
