/**
 * The Arch-Wizard's brain: a small state machine you can read in one sitting.
 *
 *   approach/strafe ──(a cast is ready and in range, interval elapsed)──▶ windup
 *        ▲                                                                 │
 *        └──────────── recover ◀──(release: the cast goes out)─────────────┘
 *
 * - **Range.** It keeps a preferred distance from its target, closing in or
 *   backing off radially, and strafes sideways the rest of the time (the side
 *   flips every few seconds).
 * - **Choice.** From the loadout, anything off cooldown whose reach covers the
 *   current distance; the one used least recently wins ties, so a loadout gets
 *   shown off rather than one spell spammed.
 * - **Telegraph.** Every cast is held for `telegraph` seconds with the gesture
 *   up and an aim marker on the floor before it is released — the player's
 *   window to move.
 * - **Aim.** At release it aims at where the target will be (leading by its
 *   velocity on harder settings) plus an angular error.
 * - **Dodge.** When a threat is coming at it, it may sidestep.
 *
 * Pure: no scene, no clock. `update(dt, sense)` returns what to do this frame.
 */

export const DIFFICULTIES = Object.freeze({
  apprentice: Object.freeze({ id: 'apprentice', label: 'Apprentice', interval: [3.4, 4.6], telegraph: 0.8, aimError: 0.3, dodge: 0.1, lead: 0, hp: 90, damage: 10, speed: 2.2 }),
  adept: Object.freeze({ id: 'adept', label: 'Adept', interval: [2.3, 3.2], telegraph: 0.55, aimError: 0.13, dodge: 0.35, lead: 0.55, hp: 120, damage: 13, speed: 2.9 }),
  archmage: Object.freeze({ id: 'archmage', label: 'Archmage', interval: [1.5, 2.2], telegraph: 0.38, aimError: 0.05, dodge: 0.6, lead: 1, hp: 150, damage: 16, speed: 3.6 })
});

export const difficultyOf = (id) => DIFFICULTIES[id] ?? DIFFICULTIES.adept;

/** Preferred distance from the target, metres, and the band either side of it. */
export const PREFERRED_RANGE = 9;
export const RANGE_BAND = 2.2;

/**
 * Pick what to cast.
 *
 * @param {Array<{id: string, range?: number, minRange?: number}>} loadout
 * @param {{distance: number, ready: (id: string) => boolean, lastUsed?: Map<string, number>, random?: () => number}} ctx
 * @returns {object|null} the entry, or null if nothing fits
 */
export function chooseCast(loadout, { distance, ready, lastUsed = new Map(), random = Math.random }) {
  const fits = loadout.filter((entry) => {
    if (!ready(entry.id)) return false;
    const max = (entry.range ?? 18) + 1;
    const min = Math.max(0, (entry.minRange ?? 0) - 0.5);
    return distance <= max && distance >= min;
  });
  if (!fits.length) return null;
  // Least recently used first; a little noise so equal ones alternate.
  let best = null;
  let bestScore = Infinity;
  for (const entry of fits) {
    const score = (lastUsed.get(entry.id) ?? -1e9) + random() * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

/**
 * Where to aim: the target (led by its velocity) and an angular error.
 *
 * @returns {{x: number, z: number, dirX: number, dirZ: number, distance: number}}
 */
export function aimAt(from, target, velocity, difficulty, { travel = 0.6, random = Math.random, minRange = 0, range = 18 } = {}) {
  const lead = difficulty.lead * travel;
  const tx = target.x + (velocity?.x ?? 0) * lead;
  const tz = target.z + (velocity?.z ?? 0) * lead;
  let dx = tx - from.x;
  let dz = tz - from.z;
  let distance = Math.hypot(dx, dz);
  if (distance < 1e-4) {
    dx = 0;
    dz = 1;
    distance = 1;
  }
  const error = (random() * 2 - 1) * difficulty.aimError;
  const base = Math.atan2(dx, dz) + error;
  const reach = Math.min(Math.max(distance * (1 + (random() * 2 - 1) * difficulty.aimError * 0.5), minRange), range);
  const dirX = Math.sin(base);
  const dirZ = Math.cos(base);
  return { x: from.x + dirX * reach, z: from.z + dirZ * reach, dirX, dirZ, distance: reach };
}

/**
 * How to move: hold the preferred range, strafe sideways.
 *
 * @returns {{x: number, z: number}} desired velocity, metres/second
 */
export function steer(self, target, strafeSign, speed, preferred = PREFERRED_RANGE) {
  let dx = target.x - self.x;
  let dz = target.z - self.z;
  const distance = Math.hypot(dx, dz) || 1;
  dx /= distance;
  dz /= distance;
  // Radial: in if too far, out if too near, nothing inside the band.
  const off = distance - preferred;
  const radial = Math.abs(off) <= RANGE_BAND ? 0 : Math.sign(off) * Math.min(1, (Math.abs(off) - RANGE_BAND) / 2);
  // Tangential: round the target, the strafe's way.
  const tx = -dz * strafeSign;
  const tz = dx * strafeSign;
  const strafe = 0.65;
  let vx = dx * radial + tx * strafe;
  let vz = dz * radial + tz * strafe;
  const length = Math.hypot(vx, vz) || 1;
  const pace = Math.min(1, Math.hypot(radial, strafe));
  vx = (vx / length) * speed * pace;
  vz = (vz / length) * speed * pace;
  return { x: vx, z: vz };
}

/**
 * Does a threat (a cast line from `origin` along `dir`) pass within `radius`
 * of `self`, ahead of its origin?
 */
export function threatens(threat, self, radius = 1.8) {
  const dx = self.x - threat.origin.x;
  const dz = self.z - threat.origin.z;
  const along = dx * threat.dir.x + dz * threat.dir.z;
  if (along < 0 || along > (threat.reach ?? 30)) return false;
  const across = Math.abs(dx * threat.dir.z - dz * threat.dir.x);
  return across <= radius;
}

export class DuelBrain {
  /**
   * @param {object} options
   * @param {object} options.difficulty one of DIFFICULTIES
   * @param {Array<object>} options.loadout entries {id, range, minRange, cooldown, kind}
   * @param {() => number} [options.random]
   */
  constructor({ difficulty = DIFFICULTIES.adept, loadout = [], random = Math.random } = {}) {
    this.difficulty = difficulty;
    this.loadout = loadout;
    this.random = random;
    this.state = 'strafe';
    this.timer = 0;
    /** Seconds until the next cast may start. */
    this.wait = this._interval() * 0.6;
    this.strafeSign = random() < 0.5 ? -1 : 1;
    this.strafeTimer = 2 + random() * 2;
    this.cooldowns = new Map();
    this.lastUsed = new Map();
    this.clock = 0;
    this.current = null;
    this.aim = null;
    this.dodgeCooldown = 0;
    this.seen = new Set();
  }

  _interval() {
    const [a, b] = this.difficulty.interval;
    return a + (b - a) * this.random();
  }

  ready(id) {
    return (this.cooldowns.get(id) ?? 0) <= 0;
  }

  /**
   * One frame of thinking.
   *
   * @param {number} dt
   * @param {object} sense
   * @param {{x: number, z: number}} sense.self
   * @param {{x: number, z: number}} sense.target
   * @param {{x: number, z: number}} [sense.targetVelocity]
   * @param {Array<{id: *, origin: object, dir: object, reach: number}>} [sense.threats] new incoming casts
   * @returns {{move: {x: number, z: number}, face: {x: number, z: number}, windup?: object, release?: object, dodge?: {x: number, z: number}, state: string}}
   */
  update(dt, sense) {
    const d = this.difficulty;
    this.clock += dt;
    for (const [id, left] of this.cooldowns) this.cooldowns.set(id, Math.max(0, left - dt));
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeSign = -this.strafeSign;
      this.strafeTimer = 2 + this.random() * 2.5;
    }

    const self = sense.self;
    const target = sense.target;
    const distance = Math.hypot(target.x - self.x, target.z - self.z);
    const out = { move: { x: 0, z: 0 }, face: { x: target.x - self.x, z: target.z - self.z }, state: this.state };

    // Dodge: once per threat, a coin weighted by difficulty.
    for (const threat of sense.threats ?? []) {
      if (this.seen.has(threat.id)) continue;
      this.seen.add(threat.id);
      if (this.dodgeCooldown > 0 || !threatens(threat, self)) continue;
      if (this.random() >= d.dodge) continue;
      this.dodgeCooldown = 1.2;
      // Step to whichever side of the line is already further from it.
      const side = (self.x - threat.origin.x) * threat.dir.z - (self.z - threat.origin.z) * threat.dir.x >= 0 ? 1 : -1;
      out.dodge = { x: threat.dir.z * side, z: -threat.dir.x * side };
    }
    if (this.seen.size > 64) this.seen = new Set([...this.seen].slice(-32));

    if (this.state === 'windup') {
      // Planted while it winds up: the telegraph has to be readable.
      this.timer -= dt;
      if (this.timer <= 0) {
        const entry = this.current;
        const aim = aimAt(self, target, sense.targetVelocity, d, { random: this.random, minRange: entry.minRange ?? 0, range: entry.range ?? 18 });
        this.cooldowns.set(entry.id, Math.max(entry.cooldown ?? 0, 0.5));
        this.lastUsed.set(entry.id, this.clock);
        out.release = { entry, aim };
        this.state = 'recover';
        this.timer = 0.45;
        this.wait = this._interval();
      }
      out.state = this.state;
      return out;
    }

    if (this.state === 'recover') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'strafe';
    }

    out.move = steer(self, target, this.strafeSign, d.speed);
    this.wait -= dt;
    if (this.state === 'strafe' && this.wait <= 0) {
      const entry = chooseCast(this.loadout, { distance, ready: (id) => this.ready(id), lastUsed: this.lastUsed, random: this.random });
      if (entry) {
        this.state = 'windup';
        this.current = entry;
        this.timer = d.telegraph;
        // The marker shows where it would land if released now.
        this.aim = aimAt(self, target, null, { ...d, aimError: 0 }, { random: this.random, minRange: entry.minRange ?? 0, range: entry.range ?? 18 });
        out.windup = { entry, aim: this.aim, telegraph: d.telegraph };
        out.move = { x: 0, z: 0 };
      } else {
        // Nothing fits from here: keep moving and look again shortly.
        this.wait = 0.4;
      }
    }
    out.state = this.state;
    return out;
  }
}
