/**
 * The target roster: what kinds of dummy there are, how a field is mixed from
 * them, and where a formation stands each one.
 *
 * Plain data and pure functions — no three.js, no scene — so the rules can be
 * tested on their own (`tests/targets*.test.mjs`) and the field and the body
 * only have to call them.
 *
 * ## Archetypes
 *
 * Every archetype is the same rigged dummy (`models/dummy.fbx`); what tells them
 * apart is a tint, a rim, a scale, a small procedural accessory and a rule:
 *
 *  - **Standard** — one touch and it falls, as it always has.
 *  - **Armored** — shrugs off `armorHits` blows (sparks on each), the next fells it.
 *  - **Runner** — strafes back and forth across its spot, so a line cast has to lead it.
 *  - **Giant** — `giantScale` tall and wide, and heavy: the blow throws it a
 *    fraction as far.
 *  - **Caster** — raises a shield bubble on a timer; a blow that lands on the
 *    bubble pops it instead of the body.
 */

/** Every archetype, in display order. `look` overrides `settings.dummies.look`. */
export const ARCHETYPES = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    label: 'Standard',
    hint: 'One hit and it falls.',
    look: null,
    accessory: null
  }),
  armored: Object.freeze({
    id: 'armored',
    label: 'Armored',
    hint: 'Takes several hits; sparks on each one it shrugs off.',
    look: Object.freeze({ color: '#3a4250', metalness: 0.85, roughness: 0.32, rimColor: '#ffd27a', rimEmissive: 1.7, edgeColor: '#ffcf7a' }),
    accessory: 'helm'
  }),
  runner: Object.freeze({
    id: 'runner',
    label: 'Runner',
    hint: 'Strafes across its spot — lead it.',
    look: Object.freeze({ color: '#16271f', rimColor: '#7dffb0', rimEmissive: 1.9, edgeColor: '#a4ffc8' }),
    accessory: 'band'
  }),
  giant: Object.freeze({
    id: 'giant',
    label: 'Giant',
    hint: 'Bigger and heavy: a blow throws it a fraction as far.',
    look: Object.freeze({ color: '#2b1c18', roughness: 0.9, rimColor: '#ff8a5c', rimEmissive: 1.6, edgeColor: '#ffb38a' }),
    accessory: 'horns'
  }),
  caster: Object.freeze({
    id: 'caster',
    label: 'Caster',
    hint: 'Raises a shield bubble on a timer; a hit on the bubble pops it.',
    look: Object.freeze({ color: '#211a33', rimColor: '#c49bff', rimEmissive: 2.0, edgeColor: '#d9bfff' }),
    accessory: 'hat'
  })
});

export const ARCHETYPE_IDS = Object.freeze(Object.keys(ARCHETYPES));

/** Formations, in display order. */
export const FORMATIONS = Object.freeze({
  ring: Object.freeze({ id: 'ring', label: 'Ring', hint: 'Scattered round the caster, between the inner and outer radius.' }),
  line: Object.freeze({ id: 'line', label: 'Line', hint: 'One rank across the field, facing the caster.' }),
  cluster: Object.freeze({ id: 'cluster', label: 'Cluster', hint: 'A tight knot ahead of the caster — made for zone casts.' }),
  gauntlet: Object.freeze({ id: 'gauntlet', label: 'Gauntlet', hint: 'Three staggered lanes running away from the caster.' }),
  scatter: Object.freeze({ id: 'scatter', label: 'Scatter', hint: 'Anywhere inside the outer radius, all the way round.' })
});

export const FORMATION_IDS = Object.freeze(Object.keys(FORMATIONS));

/** The most bodies the field will stand at once. */
export const MAX_DUMMIES = 24;

/**
 * Clean up a mix: known archetypes only, finite non-negative weights, and never
 * all zero (an empty mix means all-standard, which is what the field used to be).
 *
 * @param {Record<string, number>|string|string[]|null|undefined} mix
 *   weights by archetype, or a list / comma string of archetype ids (each one
 *   weight 1)
 * @returns {Record<string, number>}
 */
export function normalizeMix(mix) {
  const out = Object.fromEntries(ARCHETYPE_IDS.map((id) => [id, 0]));
  if (typeof mix === 'string') mix = mix.split(',').map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(mix)) {
    for (const id of mix) if (id in out) out[id] += 1;
  } else if (mix && typeof mix === 'object') {
    for (const id of ARCHETYPE_IDS) {
      const value = Number(mix[id]);
      if (Number.isFinite(value) && value > 0) out[id] = value;
    }
  }
  if (!ARCHETYPE_IDS.some((id) => out[id] > 0)) out.standard = 1;
  return out;
}

/**
 * Which archetype stands in each slot, for `count` slots.
 *
 * Largest-remainder apportionment of the weights, then interleaved so a ring of
 * eight with half armored reads armored, standard, armored … rather than four
 * of one then four of the other. Deterministic: the same mix and count always
 * give the same list, so a slot keeps its body while the mix is unchanged.
 *
 * @param {number} count
 * @param {Record<string, number>|string|string[]} mix
 * @returns {string[]} archetype id per slot
 */
export function assignArchetypes(count, mix) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const weights = normalizeMix(mix);
  const total = ARCHETYPE_IDS.reduce((sum, id) => sum + weights[id], 0);
  const quota = ARCHETYPE_IDS.map((id) => ({ id, exact: (weights[id] / total) * n }));
  for (const q of quota) q.take = Math.floor(q.exact);
  let left = n - quota.reduce((sum, q) => sum + q.take, 0);
  // Ties go to display order, so the result never depends on sort stability.
  const byRemainder = [...quota].sort((a, b) => b.exact - b.take - (a.exact - a.take) || ARCHETYPE_IDS.indexOf(a.id) - ARCHETYPE_IDS.indexOf(b.id));
  for (const q of byRemainder) {
    if (left <= 0) break;
    if (weights[q.id] <= 0) continue;
    q.take += 1;
    left -= 1;
  }
  // Interleave: each slot goes to whichever archetype is furthest behind its
  // share so far (a smooth weighted round robin).
  const out = [];
  const given = Object.fromEntries(ARCHETYPE_IDS.map((id) => [id, 0]));
  for (let i = 0; i < n; i++) {
    let best = null;
    let bestLag = -Infinity;
    for (const q of quota) {
      if (given[q.id] >= q.take) continue;
      const lag = (q.take * (i + 1)) / n - given[q.id];
      if (lag > bestLag + 1e-9) {
        bestLag = lag;
        best = q.id;
      }
    }
    given[best] += 1;
    out.push(best);
  }
  return out;
}

/** A small deterministic generator, for tests and for repeatable scatters. */
export function seededRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Where slot `index` of `count` stands in a formation, relative to the caster.
 *
 * Returned in the formation's own frame turned onto the world: `forward` is the
 * unit flat direction the formation faces away from the caster (the camera's
 * view, or the wizard in a duel), so a Line is always across the view and a
 * Gauntlet always runs away from you.
 *
 * Ring and Scatter are random (they always were); the other three are exact and
 * ignore `random`. The field still checks separation for the random ones.
 *
 * @param {string} formation one of FORMATION_IDS
 * @param {number} index
 * @param {number} count
 * @param {{radius: number, minRadius: number, separation: number, forward?: {x: number, z: number}}} config
 * @param {() => number} [random]
 * @returns {{x: number, z: number}} offset from the caster, metres
 */
export function formationSpot(formation, index, count, config, random = Math.random) {
  const outer = Math.max(1, Number(config.radius) || 13);
  const inner = Math.max(0.5, Math.min(Number(config.minRadius) || 5, outer));
  const gap = Math.max(0.5, Number(config.separation) || 2.4);
  const fx = config.forward?.x ?? 0;
  const fz = config.forward?.z ?? 1;
  const flen = Math.hypot(fx, fz) || 1;
  const f = { x: fx / flen, z: fz / flen };
  // Right of forward, flat: forward × up.
  const r = { x: -f.z, z: f.x };
  const at = (side, ahead) => ({ x: r.x * side + f.x * ahead, z: r.z * side + f.z * ahead });
  const n = Math.max(1, count);
  const mid = (inner + outer) / 2;

  switch (formation) {
    case 'line': {
      const side = (index - (n - 1) / 2) * gap;
      return at(side, mid);
    }
    case 'cluster': {
      // A sunflower: even packing at any count, the first body in the middle.
      const golden = Math.PI * (3 - Math.sqrt(5));
      const radius = gap * 0.62 * Math.sqrt(index);
      const angle = index * golden;
      return at(Math.cos(angle) * radius, mid + Math.sin(angle) * radius);
    }
    case 'gauntlet': {
      const lanes = 3;
      const lane = index % lanes;
      const rank = Math.floor(index / lanes);
      const side = (lane - 1) * gap * 1.5;
      // Staggered: the middle lane is half a step behind its neighbours.
      const ahead = inner + rank * gap * 1.6 + (lane === 1 ? gap * 0.8 : 0);
      return at(side, ahead);
    }
    case 'scatter': {
      const angle = random() * Math.PI * 2;
      const distance = Math.max(gap, outer * Math.sqrt(random()));
      return { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance };
    }
    case 'ring':
    default: {
      const angle = random() * Math.PI * 2;
      // sqrt over the radius, or every body crowds the inner edge of the ring.
      const distance = inner + (Math.max(inner + 0.5, outer) - inner) * Math.sqrt(random());
      return { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance };
    }
  }
}

/** Whether a formation is random (and so wants a separation check). */
export const isRandomFormation = (formation) => formation === 'ring' || formation === 'scatter' || !FORMATIONS[formation];

/**
 * The per-body state an archetype's rule needs. Created when a body stands.
 *
 * @param {string} archetype
 * @param {object} config `settings.dummies.archetypes`
 */
export function freshState(archetype, config = {}) {
  return {
    archetype,
    /** Armored: blows left that it can still shrug off. */
    armor: archetype === 'armored' ? Math.max(0, Math.round(config.armorHits ?? 3)) : 0,
    /** Seconds since it last shrugged a blow off — a cast overlapping it for
     *  several frames is one blow, not one a frame. */
    since: Infinity,
    /** Caster: whether the bubble is up, and the clock that raises/drops it. */
    shield: false,
    shieldClock: archetype === 'caster' ? -(config.shieldDelay ?? 1.5) : 0,
    /** Runner: where along its strafe it is. */
    phase: 0
  };
}

/** Seconds a body ignores further blows after shrugging one off. */
export const GRACE = 0.35;

/**
 * Decide what a blow does to a body that is still standing.
 *
 * @param {ReturnType<typeof freshState>} state mutated
 * @returns {'fall'|'absorb'|'pop'|'ignore'} fall: let it die; absorb: armor
 *   took it (spark); pop: the shield took it; ignore: still in its grace window
 */
export function resolveBlow(state) {
  if (!state) return 'fall';
  if (state.since < GRACE) return 'ignore';
  if (state.archetype === 'caster' && state.shield) {
    state.shield = false;
    state.since = 0;
    state.shieldClock = 0; // the bubble's down period starts now
    return 'pop';
  }
  if (state.archetype === 'armored' && state.armor > 0) {
    state.armor -= 1;
    state.since = 0;
    return 'absorb';
  }
  return 'fall';
}

/**
 * Advance an archetype's clocks by `dt`. Returns what changed, for the look.
 *
 * @param {ReturnType<typeof freshState>} state mutated
 * @param {number} dt
 * @param {object} config `settings.dummies.archetypes`
 * @returns {{shieldRaised: boolean}}
 */
export function stepArchetype(state, dt, config = {}) {
  const out = { shieldRaised: false };
  if (!state || !(dt > 0)) return out;
  state.since += dt;
  if (state.archetype === 'caster') {
    const up = Math.max(0.1, config.shieldUp ?? 2.5);
    const down = Math.max(0.1, config.shieldDown ?? 4);
    state.shieldClock += dt;
    if (state.shield && state.shieldClock >= up) {
      state.shield = false;
      state.shieldClock = 0;
    } else if (!state.shield && state.shieldClock >= down) {
      state.shield = true;
      state.shieldClock = 0;
      out.shieldRaised = true;
    }
  } else if (state.archetype === 'runner') {
    state.phase += dt * Math.max(0, config.runnerSpeed ?? 1.1);
  }
  return out;
}

/**
 * The runner's sideways offset from its spot, metres, along its own right.
 * A smoothed back-and-forth with a pause at each end, so it reads as a strafe.
 */
export function runnerOffset(state, config = {}) {
  if (!state || state.archetype !== 'runner') return 0;
  const reach = Math.max(0, config.runnerRange ?? 2.6);
  return Math.sin(state.phase) * reach;
}

/** How hard a blow lands on this archetype: a giant is heavy. */
export function blowScale(archetype, config = {}) {
  if (archetype !== 'giant') return 1;
  return Math.max(0, Math.min(1, config.giantImpulse ?? 0.45));
}

/** How big the body stands. */
export function bodyScale(archetype, config = {}) {
  return archetype === 'giant' ? Math.max(1, config.giantScale ?? 1.35) : 1;
}
