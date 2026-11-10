import { ELEMENT_IDS, CAPABILITIES, ELEMENT_LABEL } from './ontology.js';

/**
 * How two elemental contributions resolve (Unified Combat Spec §6).
 *
 *   1. **authored** — one of the spec's fifteen named pairs.
 *   2. **rule** — a capability-tag composition (heat + organic, cold + wet …).
 *   3. **generic** — no fusion: each effect stands on its own and statuses
 *      stack with diminishing returns. Nothing is invented for unrelated tags.
 *   4. **incompatible** — the fusion is refused, each original effect stays.
 *
 * Every one of the 276 unordered pairs (253 mixed + 23 self) lands in exactly
 * one tier. Order matters through `driver`: an authored reaction names the
 * element that drives it, and it lands harder when the driver arrives second
 * (lightning into standing water conducts harder than water poured onto a
 * charge). The name is the same either way.
 *
 * An `effect` is what the manager may commit, never more:
 *   kill       fell standing hostile bodies in the area (up to `maxTargets`)
 *   status     tag laid on every entity in the area for `statusLife` s
 *   purge      status tags removed in the area
 *   region     a lingering area: { element, tag, life (s), scale (× radius) }
 *   ally       true: the status goes on friendly entities instead
 *   lift       how hard a kill throws upward
 */

const E = (name, effect, extra = {}) => ({ name, effect, ...extra });

/** Spec §6 initial authored pairs. Keys are the two ids sorted and joined by '|'. */
export const AUTHORED = Object.freeze({
  'arcane|void': E('Null Sigil', { status: 'suppressed', statusLife: 3, purge: ['inscribed'] }, { driver: 'void', rule: 'eligible hostile rune constructs become suppressible' }),
  'blood|holy': E('Sacrificial Sanctuary', { status: 'warded', statusLife: 5, ally: true, region: { element: 'holy', tag: 'sanctuary', life: 4, scale: 1 } }, { driver: 'holy', rule: 'spend bounded vitality for ally protection' }),
  'cosmic|gravity': E('Celestial Orbit', { kill: true, maxTargets: 4, lift: 9, status: 'orbiting', statusLife: 2 }, { driver: 'gravity', rule: 'gravity traps celestial projectiles in bounded orbit' }),
  'crystal|light': E('Prism Cathedral', { kill: true, maxTargets: 3, status: 'dazzled', statusLife: 2 }, { driver: 'light', rule: 'redirect light through reflective facets' }),
  'crystal|sound': E('Resonance Fracture', { kill: true, maxTargets: 4, status: 'fractured', statusLife: 2 }, { driver: 'sound', rule: 'standing waves fracture brittle crystals' }),
  'earth|nature': E('Living Bastion', { status: 'fortified', statusLife: 5, ally: true, region: { element: 'earth', tag: 'bastion', life: 5, scale: 0.8 } }, { driver: 'nature', rule: 'roots reinforce and regenerate stone cover' }),
  'fire|frost': E('Thermal Shock', { kill: true, maxTargets: 4, status: 'brittle', statusLife: 3 }, { driver: 'frost', rule: 'rapid heat-cold change applies brittle shock' }),
  'fire|nature': E('Wildfire', { kill: true, maxTargets: 4, status: 'burning', statusLife: 3, region: { element: 'fire', tag: 'wildfire', life: 3, scale: 1.4 } }, { driver: 'fire', rule: 'combustible vegetation fuels fire at bounded spread rate' }),
  'fire|water': E('Vapor Dominion', { status: 'blinded', statusLife: 3, region: { element: 'water', tag: 'steam', life: 4, scale: 1.5 } }, { driver: 'fire', rule: 'steam cloud, visibility loss and pressure displacement' }),
  'force|tech': E('Autonomous Bastion', { status: 'intercepted', statusLife: 4, ally: true, region: { element: 'force', tag: 'barrier', life: 4, scale: 0.7 } }, { driver: 'tech', rule: 'sensors coordinate force interceptions' }),
  'frost|water': E('Glacial Bloom', { kill: true, maxTargets: 4, lift: 0, status: 'frozen', statusLife: 4, region: { element: 'frost', tag: 'ice', life: 4, scale: 1.1 } }, { driver: 'frost', rule: 'freeze wet surfaces into destructible ice' }),
  'illusion|shadow': E('Phantom Theatre', { status: 'phantasm', statusLife: 4, region: { element: 'shadow', tag: 'theatre', life: 3, scale: 1.2 } }, { driver: 'illusion', rule: 'darkness masks authentic motion behind false silhouettes' }),
  'storm|water': E('Storm Conduction', { kill: true, maxTargets: 6, lift: 2, status: 'shocked', statusLife: 2 }, { driver: 'storm', rule: 'conduct electricity through wet connected targets' }),
  'motion|time': E('Paradox Velocity', { status: 'echoing', statusLife: 3 }, { driver: 'time', rule: 'store and replay bounded movement trajectories' }),
  'poison|wind': E('Miasma Corridor', { status: 'poisoned', statusLife: 4, region: { element: 'poison', tag: 'miasma', life: 4, scale: 1.6 } }, { driver: 'wind', rule: 'wind carries toxin through directional corridors' })
});

/**
 * Tier 2: tag compositions, first match wins. `a` must be on one side and `b`
 * on the other. `b: '*'` matches any element (used for arcane amplification,
 * which is the last resort before generic stacking).
 */
export const RULES = Object.freeze([
  { a: 'heat', b: 'toxin', name: 'Toxic Fumes', effect: { status: 'poisoned', statusLife: 3, region: { element: 'poison', tag: 'fumes', life: 3, scale: 1.2 } } },
  { a: 'heat', b: 'air', name: 'Firestorm', effect: { kill: true, maxTargets: 3, status: 'burning', statusLife: 2, region: { element: 'fire', tag: 'firestorm', life: 2.5, scale: 1.3 } } },
  { a: 'heat', b: 'solid', name: 'Magma Seam', effect: { status: 'burning', statusLife: 3, region: { element: 'fire', tag: 'magma', life: 3, scale: 0.8 } } },
  { a: 'heat', b: 'refract', name: 'Heat Lens', effect: { kill: true, maxTargets: 2, status: 'burning', statusLife: 2 } },
  { a: 'heat', b: 'vital', name: 'Cauterise', effect: { status: 'scarred', statusLife: 3 } },
  { a: 'heat', b: 'electric', name: 'Plasma Arc', effect: { kill: true, maxTargets: 3, status: 'burning', statusLife: 2 } },
  { a: 'heat', b: 'radiant', name: 'Searing Light', effect: { kill: true, maxTargets: 2, status: 'burning', statusLife: 2 } },
  { a: 'cold', b: 'electric', name: 'Superconduct', effect: { status: 'charged', statusLife: 4 } },
  { a: 'cold', b: 'solid', name: 'Permafrost', effect: { status: 'rooted', statusLife: 4, region: { element: 'frost', tag: 'permafrost', life: 4, scale: 1 } } },
  { a: 'wet', b: 'solid', name: 'Mire', effect: { status: 'rooted', statusLife: 4, region: { element: 'earth', tag: 'mire', life: 4, scale: 1.1 } } },
  { a: 'obscure', b: 'null', name: 'Abyss', effect: { status: 'hollowed', statusLife: 3, region: { element: 'void', tag: 'abyss', life: 3, scale: 0.9 } } },
  { a: 'cold', b: 'air', name: 'Blizzard Front', effect: { status: 'chilled', statusLife: 4, region: { element: 'frost', tag: 'blizzard', life: 3, scale: 1.4 } } },
  { a: 'cold', b: 'toxin', name: 'Cryo Venom', effect: { status: 'brittle', statusLife: 3 } },
  { a: 'brittle', b: 'wave', name: 'Fracture Chorus', effect: { kill: true, maxTargets: 4, status: 'fractured', statusLife: 2 } },
  { a: 'brittle', b: 'impulse', name: 'Splinter Break', effect: { kill: true, maxTargets: 3, status: 'fractured', statusLife: 2 } },
  { a: 'brittle', b: 'mass', name: 'Crush Shatter', effect: { kill: true, maxTargets: 3, lift: 0, status: 'fractured', statusLife: 2 } },
  { a: 'brittle', b: 'kinetic', name: 'Shatter Rush', effect: { kill: true, maxTargets: 3, status: 'fractured', statusLife: 2 } },
  { a: 'electric', b: 'device', name: 'Overload', effect: { kill: true, maxTargets: 3, status: 'shorted', statusLife: 3 } },
  { a: 'electric', b: 'refract', name: 'Arc Prism', effect: { kill: true, maxTargets: 3, status: 'shocked', statusLife: 2 } },
  { a: 'electric', b: 'air', name: 'Static Squall', effect: { status: 'charged', statusLife: 4, region: { element: 'storm', tag: 'static', life: 3, scale: 1.3 } } },
  { a: 'electric', b: 'vital', name: 'Arrest', effect: { status: 'stunned', statusLife: 2 } },
  { a: 'wet', b: 'air', name: 'Squall', effect: { status: 'wet', statusLife: 4, region: { element: 'water', tag: 'squall', life: 3, scale: 1.4 } } },
  { a: 'wet', b: 'organic', name: 'Overgrowth', effect: { status: 'entangled', statusLife: 4, region: { element: 'nature', tag: 'overgrowth', life: 4, scale: 1 } } },
  { a: 'wet', b: 'toxin', name: 'Contaminated Tide', effect: { status: 'poisoned', statusLife: 4, region: { element: 'poison', tag: 'tide', life: 4, scale: 1.2 } } },
  { a: 'wet', b: 'mass', name: 'Undertow', effect: { status: 'heavy', statusLife: 3 } },
  { a: 'organic', b: 'toxin', name: 'Blight', effect: { status: 'poisoned', statusLife: 4, region: { element: 'poison', tag: 'blight', life: 4, scale: 1 } } },
  { a: 'organic', b: 'vital', name: 'Thornblood', effect: { kill: true, maxTargets: 3, status: 'bleeding', statusLife: 3 } },
  { a: 'organic', b: 'radiant', name: 'Bloomlight', effect: { status: 'regrowing', statusLife: 4, ally: true } },
  { a: 'toxin', b: 'vital', name: 'Septic Wound', effect: { kill: true, maxTargets: 3, status: 'poisoned', statusLife: 3 } },
  { a: 'toxin', b: 'sanctify', name: 'Purge', effect: { purge: ['poisoned'], status: 'cleansed', statusLife: 3 } },
  { a: 'sanctify', b: 'obscure', name: 'Dispel Shade', effect: { purge: ['obscured'], status: 'illuminated', statusLife: 3 } },
  { a: 'radiant', b: 'obscure', name: 'Eclipse', effect: { status: 'blinded', statusLife: 3 } },
  { a: 'radiant', b: 'deceive', name: 'Mirage', effect: { status: 'deceived', statusLife: 3, region: { element: 'illusion', tag: 'mirage', life: 3, scale: 1 } } },
  { a: 'null', b: 'rune', name: 'Unmaking', effect: { purge: ['inscribed'], status: 'suppressed', statusLife: 3 } },
  { a: 'null', b: 'sanctify', name: 'Unmaking', effect: { purge: ['sanctified'], status: 'suppressed', statusLife: 3 } },
  { a: 'null', b: 'device', name: 'Unmaking', effect: { purge: ['tagged'], status: 'suppressed', statusLife: 3 } },
  { a: 'null', b: 'barrier', name: 'Unmaking', effect: { purge: ['staggered'], status: 'suppressed', statusLife: 3 } },
  { a: 'null', b: 'astral', name: 'Starless', effect: { purge: ['starmarked'], status: 'hollowed', statusLife: 3 } },
  { a: 'astral', b: 'temporal', name: 'Starfall Delay', effect: { kill: true, maxTargets: 3, status: 'delayed', statusLife: 2 } },
  { a: 'mass', b: 'impulse', name: 'Crushing Momentum', effect: { kill: true, maxTargets: 3, lift: 0, status: 'heavy', statusLife: 2 } },
  { a: 'mass', b: 'kinetic', name: 'Gravity Slingshot', effect: { kill: true, maxTargets: 3, lift: 8, status: 'heavy', statusLife: 2 } },
  { a: 'temporal', b: 'air', name: 'Stalled Gale', effect: { status: 'delayed', statusLife: 3 } },
  { a: 'wave', b: 'air', name: 'Thunderclap', effect: { status: 'staggered', statusLife: 2 } },
  { a: 'wave', b: 'solid', name: 'Tremor', effect: { status: 'staggered', statusLife: 3, region: { element: 'earth', tag: 'tremor', life: 2, scale: 1.3 } } },
  { a: 'vital', b: 'temporal', name: 'Borrowed Pulse', effect: { status: 'bleeding', statusLife: 3 } },
  { a: 'barrier', b: 'protect', name: 'Aegis', effect: { status: 'warded', statusLife: 5, ally: true } },
  { a: 'impulse', b: 'air', name: 'Concussive Gust', effect: { kill: true, maxTargets: 3, status: 'staggered', statusLife: 2 } },
  { a: 'deceive', b: 'spatial', name: 'Phantom Rift', effect: { status: 'deceived', statusLife: 3 } },
  { a: 'kinetic', b: 'device', name: 'Railspark', effect: { kill: true, maxTargets: 2, status: 'tagged', statusLife: 3 } },
  { a: 'amplify', b: '*', name: 'Arcane Amplification', effect: { status: 'amplified', statusLife: 3 } }
]);

/** Tier 4: refused fusions. Both original effects stand. */
export const INCOMPATIBLE = Object.freeze({
  'earth|storm': 'Grounded — the stone takes the charge; no fusion',
  'light|shadow': 'Cancellation — light and shadow do not combine; each stands alone',
  'illusion|void': 'Nothing to fool — the void has no perception to deceive'
});

export const TIER = Object.freeze({ AUTHORED: 1, RULE: 2, GENERIC: 3, INCOMPATIBLE: 4 });

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function matchRule(a, b) {
  const ta = CAPABILITIES[a];
  const tb = CAPABILITIES[b];
  for (const rule of RULES) {
    if (rule.b === '*') {
      // Amplification needs one side to amplify and the other to be something else.
      if (a !== b && (ta.includes(rule.a) || tb.includes(rule.a))) return rule;
      continue;
    }
    if ((ta.includes(rule.a) && tb.includes(rule.b)) || (tb.includes(rule.a) && ta.includes(rule.b))) return rule;
  }
  return null;
}

/**
 * Resolve an element already present (`first`) meeting an arriving one (`second`).
 * Deterministic and pure.
 */
export function resolvePair(first, second) {
  if (!CAPABILITIES[first] || !CAPABILITIES[second]) throw new Error(`resolvePair: unknown element ${first} / ${second}`);
  const key = pairKey(first, second);
  const base = { key, lead: first, catalyst: second };
  if (first === second) {
    return { ...base, tier: TIER.GENERIC, name: `${ELEMENT_LABEL[first]} saturation`, effect: null, intensity: 1, reason: 'Same element: statuses stack with diminishing returns; no fusion.' };
  }
  const authored = AUTHORED[key];
  if (authored) {
    const intensity = authored.driver === second ? 1.25 : 0.85;
    return { ...base, tier: TIER.AUTHORED, name: authored.name, effect: authored.effect, rule: authored.rule, driver: authored.driver, intensity, emits: authored.effect.region?.element ?? second };
  }
  if (INCOMPATIBLE[key]) {
    return { ...base, tier: TIER.INCOMPATIBLE, name: INCOMPATIBLE[key].split(' — ')[0], effect: null, intensity: 1, reason: INCOMPATIBLE[key] };
  }
  const rule = matchRule(first, second);
  if (rule) {
    return { ...base, tier: TIER.RULE, name: rule.name, effect: rule.effect, rule: `${rule.a} + ${rule.b === '*' ? 'any' : rule.b}`, intensity: 1, emits: rule.effect.region?.element ?? second };
  }
  return { ...base, tier: TIER.GENERIC, name: 'Independent lawful effects', effect: null, intensity: 1, reason: 'No authored reaction or tag rule: each effect applies on its own.' };
}

/** Every unordered pair, self pairs included (276), each with its resolution in cast order a→b. */
export function pairTable() {
  const out = [];
  for (let i = 0; i < ELEMENT_IDS.length; i++) {
    for (let j = i; j < ELEMENT_IDS.length; j++) out.push(resolvePair(ELEMENT_IDS[i], ELEMENT_IDS[j]));
  }
  return out;
}

/**
 * Several elements arriving in order. Each newcomer is resolved against every
 * distinct element already present (in id order, so the fold is deterministic);
 * only tiers 1–2 react. Bounded by `maxReactions`.
 */
export function foldElements(order, { maxReactions = 6 } = {}) {
  const present = [];
  const reactions = [];
  for (const element of order) {
    for (const prior of [...present].sort()) {
      if (reactions.length >= maxReactions) return reactions;
      const r = resolvePair(prior, element);
      if (r.tier <= TIER.RULE) reactions.push(r);
    }
    if (!present.includes(element)) present.push(element);
  }
  return reactions;
}
