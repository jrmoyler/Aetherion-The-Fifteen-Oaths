/**
 * What the Arch-Wizard may cast: which castables and mechanic moves work from a
 * second caster, why the rest do not, and the loadout presets.
 *
 * Pure data and functions (no scene), so `tests/duel*.test.mjs` can pin them.
 *
 * ## Why some casts are left out
 *
 * The CPU casts through the same engines the player does, from the wizard's
 * position and heading. A cast that only reads the line it is given works from
 * anywhere. A few do more than that with *their caster*, and those cannot be
 * handed to a second one:
 *
 *  - **summons** take over WASD and Space (the player's input) while they are out;
 *  - **self buffs** burn on the player's own body and are not aimed at all;
 *  - **casts that move their caster** (blinks, recalls) would fight the wizard's
 *    movement AI for its position;
 *  - **casts that build a double of the caster's rig** clone a body the CPU
 *    does not have in that form;
 *  - **casts anchored to the player's hands** read the player rig every frame,
 *    because their pack shares one caster;
 *  - **drawn casts** need a path drawn by a pointer.
 */

/** uid → why the CPU cannot use it. */
export const CPU_EXCLUSIONS = Object.freeze({
  'handcast/drone': 'Summon: it takes over WASD and Space while it is out.',
  'handcast/monowheel': 'Summon: it takes over WASD and Space while it is out.',
  'linear-ext/boost': 'Self buff on the player’s own body; nothing to aim.',
  'linear-ext/magic': 'Self buff on the player’s own body; nothing to aim.',
  'linear-ext/fire': 'Self buff on the player’s own body; nothing to aim.',
  'collective/blink': 'Moves its caster: it would fight the wizard’s movement AI.',
  'matrix-new/voidstep': 'Moves its caster: it would fight the wizard’s movement AI.',
  'atlas/parallax': 'Moves its caster: it would fight the wizard’s movement AI.',
  'atlas/recall': 'Moves its caster back along its path: it would fight the movement AI.',
  'atlas/echoes': 'Builds doubles of the caster’s own rig.',
  'matrix-new/mirage': 'Builds a double of the caster’s own rig.',
  'matrix-expansion/ashen-doppelganger': 'Records and replays the caster’s own body.',
  'casting/lance': 'Anchored to the player’s hands every frame (its pack shares one caster).',
  'linear-ext/firePortal': 'Needs a path drawn with the pointer (scribe aim).'
});

/** Kinds from the catalog that never work from a second caster. */
const EXCLUDED_KINDS = Object.freeze({
  summon: 'Summon: it takes over WASD and Space while it is out.',
  buff: 'Self buff on the player’s own body; nothing to aim.',
  move: 'A character move, not a cast.',
  archived: 'Archived effect.'
});

/**
 * Can the CPU cast this?
 *
 * @param {string} uid
 * @param {{kind?: string, cast?: string}} [info] catalog row, when known
 * @returns {{ok: boolean, reason: string}}
 */
export function classifyCastable(uid, info = {}) {
  if (typeof uid !== 'string' || !uid.includes('/')) return { ok: false, reason: 'Not a castable uid.' };
  if (CPU_EXCLUSIONS[uid]) return { ok: false, reason: CPU_EXCLUSIONS[uid] };
  if (info.kind && EXCLUDED_KINDS[info.kind]) return { ok: false, reason: EXCLUDED_KINDS[info.kind] };
  if (info.cast === 'summon') return { ok: false, reason: EXCLUDED_KINDS.summon };
  if (info.cast === 'self') return { ok: false, reason: EXCLUDED_KINDS.buff };
  if (info.cast === 'scribe') return { ok: false, reason: 'Needs a path drawn with the pointer (scribe aim).' };
  return { ok: true, reason: '' };
}

/**
 * Split candidates into what the CPU may use and what it may not.
 *
 * @param {string[]} uids
 * @param {(uid: string) => object} [infoOf]
 */
export function filterCastables(uids, infoOf = () => ({})) {
  const allowed = [];
  const excluded = [];
  for (const uid of uids) {
    const verdict = classifyCastable(uid, infoOf(uid) ?? {});
    if (verdict.ok) allowed.push(uid);
    else excluded.push({ uid, reason: verdict.reason });
  }
  return { allowed, excluded };
}

/**
 * Mechanic moves the CPU can issue with its own owner id. All implemented
 * families resolve per owner in `MechanicSystems.command`; a few want a
 * condition on the ground, which is said here so the panel can say it.
 */
export function classifyMechanic(preset) {
  if (!preset?.uid || !preset.family) return { ok: false, reason: 'Unknown mechanic.' };
  const notes = {
    convergence: 'Only lands on an elemental imprint (e.g. a water cast’s puddle).',
    weave: 'Links once two anchors are down.',
    counter: 'A guard: it turns a blow that lands in its window.',
    stance: 'Armour on the wizard: incoming damage is reduced while it holds.',
    worldshape: 'Raises terrain that blocks line casts.'
  };
  return { ok: true, reason: notes[preset.family] ?? '' };
}

/** The loadout presets, in display order. */
export const LOADOUT_PRESETS = Object.freeze([
  { id: 'random', label: 'Random element', hint: 'Five castables from one element picked at random.' },
  { id: 'element', label: 'One element', hint: 'Every allowed castable of the element you choose.' },
  { id: 'mirror', label: 'Mirror my loadout', hint: 'Whatever is in your slot and your recent casts.' },
  { id: 'custom', label: 'Custom', hint: 'Tick castables and mechanics yourself.' }
]);

/** Fisher–Yates on a copy, with the given generator. */
function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build a loadout from a preset.
 *
 * @param {string} preset 'random' | 'element' | 'mirror' | 'custom'
 * @param {object} options
 * @param {string[]} options.allowed castables the CPU may use (already filtered)
 * @param {(uid: string) => string|undefined} options.elementOf
 * @param {string} [options.element] for 'element'
 * @param {string[]} [options.mirror] the player's slot and recent casts, for 'mirror'
 * @param {string[]} [options.custom] for 'custom'
 * @param {number} [options.size] how many for 'random'
 * @param {() => number} [options.random]
 * @returns {{castables: string[], element: string|null}}
 */
export function buildLoadout(preset, { allowed, elementOf, element = null, mirror = [], custom = [], size = 5, random = Math.random }) {
  const allow = new Set(allowed);
  if (preset === 'custom') return { castables: custom.filter((uid) => allow.has(uid)), element: null };
  if (preset === 'mirror') {
    const picked = [...new Set(mirror)].filter((uid) => allow.has(uid));
    return { castables: picked, element: null };
  }
  const elements = [...new Set(allowed.map(elementOf).filter(Boolean))].sort();
  let chosen = preset === 'element' && element && elements.includes(element) ? element : null;
  if (!chosen) chosen = elements[Math.floor(random() * elements.length)] ?? null;
  const pool = allowed.filter((uid) => elementOf(uid) === chosen);
  const castables = preset === 'element' ? pool : shuffled(pool, random).slice(0, Math.max(1, size));
  return { castables, element: chosen };
}

/** Parse `?cpu=a,b,c`. */
export function parseCpuParam(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]+\/[A-Za-z0-9-/]+$/.test(s));
}
