/**
 * The duel's referee: hit geometry for the CPU's casts on the player, and the
 * round itself (HP, invulnerability, who won).
 *
 * The geometry is the field's own rule (`DummyField#applyHits`) applied to one
 * more body — the player — because the player is not in the field: a **line**
 * cast is a capsule from its origin to its front; a **zone** cast is a disc at
 * its landing point, armed the frame its front arrives. Each CPU cast can hit
 * the player once.
 *
 * Pure: no scene. Points are `{x, z}`.
 */

/** Nearest point on segment a→b to p, flat. */
export function closestOnSegment(a, b, p) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / lengthSq));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

/**
 * Does a cast touch a body this frame?
 *
 * @param {object} cast
 * @param {'line'|'zone'} cast.shape
 * @param {{x: number, z: number}} cast.origin where it left from
 * @param {{x: number, z: number}} cast.front where its front is now
 * @param {{x: number, z: number}} [cast.landing] where it lands (zone)
 * @param {number} cast.u 0..1 progress of the front
 * @param {number} [cast.zoneRadius] footprint of a zone cast, metres
 * @param {number} [cast.lineRadius] half-width of a line cast's capsule, metres
 * @param {{x: number, z: number, r: number}} body
 */
export function castTouches(cast, body) {
  if (cast.shape === 'zone') {
    if (!(cast.u >= 1)) return false;
    const at = cast.landing ?? cast.front;
    const reach = (cast.zoneRadius ?? 3) + body.r;
    return (body.x - at.x) ** 2 + (body.z - at.z) ** 2 <= reach * reach;
  }
  const near = closestOnSegment(cast.origin, cast.front, body);
  const reach = (cast.lineRadius ?? 1.5) + body.r;
  return (body.x - near.x) ** 2 + (body.z - near.z) ** 2 <= reach * reach;
}

/**
 * One round of the duel.
 *
 * `hit(side, amount)` applies damage unless the side is inside its grace
 * window (a cast overlapping a body for several frames is one blow) or the
 * round is over; it returns what happened, so the caller can play a flinch or
 * end the round.
 */
export class DuelRound {
  /**
   * @param {{playerHp?: number, wizardHp?: number, grace?: number}} [options]
   */
  constructor({ playerHp = 100, wizardHp = 120, grace = 0.45 } = {}) {
    this.max = { player: playerHp, wizard: wizardHp };
    this.hp = { player: playerHp, wizard: wizardHp };
    this.grace = grace;
    this.since = { player: Infinity, wizard: Infinity };
    /** Damage reduction 0..1 per side (the wizard's stance). */
    this.reduction = { player: 0, wizard: 0 };
    this.state = 'fighting';
    this.winner = null;
    this.time = 0;
    this.hits = { player: 0, wizard: 0 };
  }

  get over() {
    return this.state === 'over';
  }

  step(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    this.since.player += dt;
    this.since.wizard += dt;
  }

  /**
   * @param {'player'|'wizard'} side who is hit
   * @param {number} amount
   * @param {{ignoreGrace?: boolean}} [options]
   * @returns {{landed: boolean, dealt: number, lethal: boolean}}
   */
  hit(side, amount, { ignoreGrace = false } = {}) {
    const none = { landed: false, dealt: 0, lethal: false };
    if (this.over || !(side in this.hp)) return none;
    if (!ignoreGrace && this.since[side] < this.grace) return none;
    const dealt = Math.max(0, amount * (1 - Math.min(0.9, this.reduction[side] ?? 0)));
    this.hp[side] = Math.max(0, this.hp[side] - dealt);
    this.since[side] = 0;
    this.hits[side] += 1;
    const lethal = this.hp[side] <= 0;
    if (lethal) {
      this.state = 'over';
      this.winner = side === 'player' ? 'wizard' : 'player';
    }
    return { landed: true, dealt, lethal };
  }

  snapshot() {
    return {
      state: this.state,
      winner: this.winner,
      time: Math.round(this.time * 10) / 10,
      player: { hp: Math.round(this.hp.player), max: this.max.player, hitsTaken: this.hits.player },
      wizard: { hp: Math.round(this.hp.wizard), max: this.max.wizard, hitsTaken: this.hits.wizard }
    };
  }
}
