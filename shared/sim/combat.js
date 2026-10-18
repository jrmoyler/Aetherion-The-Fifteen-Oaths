// Combat resolution: ability shapes, damage math, element reactions, statuses, threat.
// Functions take the simulation instance `S` (see index.js) as their first argument.
import { ELEMENT_STATUS, STATUSES, ELEMENT_MOD, REACTIONS, SELF_BUFF } from './data.js';
import { clamp, segDist2 } from './util.js';
import { pvpHostile, isPvp, diminish, onPvpDamage, PVP_DAMAGE_MUL } from './social.js';

export const TEAM_PLAYER = 1, TEAM_MOB = 2;
/**
 * Hostility. Different teams fight (neutral team 0 never); two TEAM_PLAYER entities (players or their
 * pets) are hostile only under the PvP rules in social.js (duel partners, or both flagged outside
 * sanctuaries and not in the same party).
 */
export const hostile = (a, b) => {
  if (a.team !== b.team) return a.team !== 0 && b.team !== 0;
  return a.team === TEAM_PLAYER && a !== b && pvpHostile(a, b);
};

// ---------- statuses ----------
export function hasStatus(e, id) {
  const st = e.st;
  for (let i = 0; i < st.length; i++) if (st[i].id === id) return st[i];
  return null;
}
export function statusKind(e, kind) {
  const st = e.st;
  for (let i = 0; i < st.length; i++) if (STATUSES[st[i].id]?.kind === kind) return st[i];
  return null;
}
export const isStunned = (e) => !!statusKind(e, 'stun');
export const isRooted = (e) => !!statusKind(e, 'root');

/** Movement multiplier from slow / haste / root / stun statuses. */
export function moveMul(e) {
  let m = 1;
  for (const s of e.st) {
    const k = STATUSES[s.id]?.kind;
    if (k === 'slow') m *= 1 - s.mag;
    else if (k === 'haste') m *= 1 + s.mag;
    else if (k === 'root' || k === 'stun') m = 0;
  }
  return m;
}

export function applyStatus(S, dst, id, dur, mag = 0, src = null, dps = 0) {
  if (!dst.alive) return;
  const kind = STATUSES[id]?.kind;
  if (dst.role === 'boss' && (kind === 'stun' || kind === 'root')) { id = 'slow'; mag = 0.2; dur = Math.min(dur, 1.5); }
  else {
    // PvP crowd-control diminishing returns (stun / root / slow): x1, x0.5, x0.25, then immune for 15 s
    if (dst.k === 'p' && src && (kind === 'stun' || kind === 'root' || kind === 'slow')) {
      const c = src.k === 'p' ? src : src.ownerEnt;
      if (c && c !== dst) { const f = diminish(S, dst, kind); if (f <= 0) return; dur *= f; }
    }
    if (kind === 'stun') {
      if (dst.stunImmune > S.t) return;
      dst.stunImmune = S.t + (dur + 3) * 1000;
    }
  }
  const until = S.t + dur * 1000;
  const ex = hasStatus(dst, id);
  if (ex) {
    ex.until = Math.max(ex.until, until);
    ex.mag = Math.max(ex.mag, mag);
    if (STATUSES[id]?.stacks) { ex.stacks = Math.min(STATUSES[id].stacks, (ex.stacks || 1) + 1); ex.dps = Math.max(ex.dps, dps); }
    else if (dps) ex.dps = Math.max(ex.dps, dps);
  } else {
    dst.st.push({ id, until, mag, src: src?.id ?? null, dps, stacks: 1, next: S.t + 1000 });
    dst.fxVer++;
    S.statused.add(dst);
  }
  S.ev({ type: 'status', dst: dst.id, status: id, dur }, dst.x, dst.z);
}

export function removeStatus(S, dst, id) {
  const i = dst.st.findIndex((s) => s.id === id);
  if (i >= 0) { dst.st.splice(i, 1); dst.fxVer++; }
}

export function clearStatuses(dst) { if (dst.st.length) { dst.st.length = 0; dst.fxVer++; } }

/** Per tick: DoT/HoT ticks and expiry for every entity carrying statuses. */
export function tickStatuses(S) {
  for (const e of S.statused) {
    if (!e.alive || !S.ents.has(e.id)) { clearStatuses(e); S.statused.delete(e); continue; }
    const st = e.st;
    for (let i = st.length - 1; i >= 0; i--) {
      const s = st[i];
      const kind = STATUSES[s.id]?.kind;
      if ((kind === 'dot' || kind === 'hot') && S.t >= s.next) {
        s.next += 1000;
        if (kind === 'dot') {
          const src = S.ents.get(s.src) ?? null;
          dealDamage(S, src, e, s.dps * (s.stacks || 1), STATUSES[s.id].element, `status/${s.id}`, { dot: true });
          if (!e.alive) break;
        } else heal(S, e, e, s.dps);
      }
      if (S.t >= s.until) { st.splice(i, 1); e.fxVer++; }
    }
    if (!st.length) S.statused.delete(e);
  }
}

// ---------- damage ----------
export function heal(S, src, dst, amount) {
  if (!dst.alive || amount <= 0) return;
  const a = Math.min(Math.round(amount), dst.mhp - Math.ceil(dst.hp));
  if (a <= 0) return;
  dst.hp += a;
  S.ev({ type: 'heal', src: src?.id ?? dst.id, dst: dst.id, amount: a }, dst.x, dst.z);
}

/** Credit owner for pets (kill credit / xp / quests). */
export const creditOf = (S, e) => (e && e.own ? S.ents.get(e.own) ?? null : e);

export function dealDamage(S, src, dst, base, element, abilityId, opts = {}) {
  if (!dst || !dst.alive || dst.invuln) return 0;
  if (src && !hostile(src, dst)) return 0;
  let mul = 1;
  let rx = null;
  if (src) {
    const emp = hasStatus(src, 'empower'); if (emp) mul *= 1 + emp.mag;
    const wk = hasStatus(src, 'weaken'); if (wk) mul *= 1 - wk.mag;
    if (!opts.raw) mul *= src.pow ?? src.stats?.power ?? 1;
  }
  if (element && dst.element) mul *= 1 + (ELEMENT_MOD[element]?.[dst.element] ?? 0);
  if (element === 'storm' && S.world?.storm && S.regionOf(dst.x, dst.z) === S.world.storm) mul *= 1.2;
  if (element && !opts.dot) {
    for (const r of REACTIONS) {
      if (r.el !== element) continue;
      const s = hasStatus(dst, r.on);
      if (!s) continue;
      mul *= r.mul; rx = r.name;
      if (r.consume) removeStatus(S, dst, r.on);
      if (r.then) applyStatus(S, dst, r.then[0], r.then[1], 1, src);
      break;
    }
  }
  const ex = hasStatus(dst, 'expose'); if (ex) mul *= 1 + ex.mag;
  if (src && src.lvl && dst.lvl) mul *= clamp(1 + (src.lvl - dst.lvl) * 0.04, 0.55, 1.3);
  let crit = false;
  if (src && !opts.dot && !opts.noCrit) {
    const cc = src.stats?.crit ?? (src.role === 'boss' ? 0.08 : 0.04);
    if (S.rng() < cc) { crit = true; mul *= 1.75; }
  }
  const sunder = hasStatus(dst, 'sunder');
  const armor = (dst.stats?.armor ?? dst.armor ?? 0) * (sunder ? 1 - sunder.mag : 1);
  mul *= 100 / (100 + armor);
  if (!opts.dot) mul *= 0.9 + S.rng() * 0.2;
  const credit = creditOf(S, src);
  const pvp = isPvp(credit, dst);
  if (pvp) mul *= PVP_DAMAGE_MUL;
  let amount = Math.max(1, Math.round(base * mul));
  // shields absorb first
  const sh = hasStatus(dst, 'shield');
  let absorbed = 0;
  if (sh && sh.pool > 0) {
    absorbed = Math.min(sh.pool, amount); sh.pool -= absorbed; amount -= absorbed;
    if (sh.pool <= 0) removeStatus(S, dst, 'shield');
  }
  // duels end at 1 HP: the opponent can never kill a duellist
  let duelWon = false;
  if (pvp && dst.duelLive && credit.duel === dst.duel && dst.hp - amount < 1) { amount = Math.max(0, Math.ceil(dst.hp) - 1); duelWon = true; }
  dst.hp -= amount;
  dst.combatUntil = S.t + 6000;
  if (pvp) onPvpDamage(S, credit, dst);
  if (src) {
    src.combatUntil = S.t + 6000;
    if (credit && credit !== src) credit.combatUntil = S.t + 6000;
    if (dst.threat) {
      dst.threat.set(src.id, (dst.threat.get(src.id) || 0) + amount + absorbed);
      if (credit && credit.k === 'p') dst.credit.set(credit.id, (dst.credit.get(credit.id) || 0) + amount);
      S.onMobDamaged(dst, src);
    }
  }
  const hit = { type: 'hit', src: src?.id ?? null, dst: dst.id, ability: abilityId, amount, crit, element: element ?? null, x: Math.round(dst.x * 100) / 100, y: Math.round((dst.y + (dst.headY ?? 1.6)) * 100) / 100, z: Math.round(dst.z * 100) / 100 };
  if (absorbed) hit.absorbed = absorbed;
  if (rx) hit.rx = rx;
  if (opts.dot) hit.dot = true;
  S.ev(hit, dst.x, dst.z);
  S.stats.hits++;
  // lifesteal / radiant healing
  if (src && src.alive && element === 'blood' && !opts.dot) heal(S, src, src, amount * 0.15);
  if (src && src.alive && element === 'light' && !opts.dot) heal(S, src, src, amount * ELEMENT_STATUS.light[3]);
  if (duelWon) { dst.hp = Math.max(1, dst.hp); S.duelDefeat(dst, credit); return amount; }
  if (dst.hp <= 0) { dst.hp = 0; S.kill(dst, src); return amount; }
  // on-hit element status
  if (element && !opts.dot && !opts.noStatus) {
    const es = ELEMENT_STATUS[element];
    if (es && es[2] > 0 && S.rng() < es[1] * (opts.statusMul ?? 1)) {
      const [id, , dur, mag] = es;
      const kind = STATUSES[id].kind;
      if (id === 'stagger' && src) { // knockback
        const dx = dst.x - src.x, dz = dst.z - src.z, d = Math.hypot(dx, dz) || 1;
        if (dst.k === 'm' && dst.role !== 'boss') S.pushEnt(dst, (dx / d) * mag, (dz / d) * mag);
        applyStatus(S, dst, id, dur, 1, src);
      } else if (kind === 'dot') applyStatus(S, dst, id, dur, mag, src, Math.max(1, Math.round(amount * mag)));
      else applyStatus(S, dst, id, dur, mag, src);
      if (id === 'slow' && element === 'time' && src?.cds) { for (let i = 1; i < src.cds.length; i++) src.cds[i] = Math.max(S.t, src.cds[i] - 500); src.youDirty = true; }
    }
  }
  return amount;
}

// ---------- ability shapes ----------
function forward(e) { return { x: Math.sin(e.ry), z: Math.cos(e.ry) }; }

function hostilesNear(S, src, x, z, r) {
  return S.grid.query(x, z, r + 4, [], (e) => e.alive && hostile(src, e) && e.k !== 'n');
}

/** Schedule a damage application (projectile travel, line sweep speed, zone delay). */
export function schedule(S, delaySec, item) {
  item.at = S.t + Math.max(0, delaySec) * 1000;
  S.delayed.push(item);
}

export function processDelayed(S) {
  const d = S.delayed;
  for (let i = d.length - 1; i >= 0; i--) {
    const it = d[i];
    if (it.at > S.t) continue;
    d[i] = d[d.length - 1]; d.pop();
    const src = S.ents.get(it.src) ?? null;
    if (it.kind === 'hit') {
      const dst = S.ents.get(it.dst);
      if (dst && dst.alive) dealDamage(S, src, dst, it.amount, it.element, it.ability, it.opts);
    } else if (it.kind === 'area') {
      areaDamage(S, src, it, it.x, it.z, it.r);
    } else if (it.kind === 'zonetick') {
      areaDamage(S, src, it, it.x, it.z, it.r);
      if (--it.left > 0) schedule(S, 1, it);
    }
  }
}

/** Damage every hostile of `src` (or, for world hazards, every non-npc) within r of (x,z). */
export function areaDamage(S, src, it, x, z, r) {
  const team = it.team ?? src?.team;
  if (!it.world && src == null && team == null) return;
  const list = S.grid.query(x, z, r + 4, [], (e) => e.alive && e.k !== 'n' && (it.world ? true : src ? hostile(src, e) : e.team !== team && e.team !== 0));
  let n = 0;
  for (const e of list) {
    const rr = r + (e.radius ?? 0.5);
    if ((e.x - x) ** 2 + (e.z - z) ** 2 > rr * rr) continue;
    dealDamage(S, it.world ? null : src, e, it.amount, it.element, it.ability, it.opts);
    if (++n >= (it.max ?? 12)) break;
  }
}

/**
 * Resolve an ability for a caster. `ab` is a hotbar entry (shape, range, radius, damage, speed,
 * element). Returns the effective aim/dir for the cast event.
 */
export function resolveAbility(S, c, ab, slot, aim, dir, target) {
  const shape = ab.shape;
  const el = ab.element ?? c.element;
  const base = ab.damage;
  let d = dir;
  if (target && target !== c) {
    const dx = target.x - c.x, dz = target.z - c.z, l = Math.hypot(dx, dz);
    if (l > 0.01 && (!d || shape === 'melee' || shape === 'projectile')) d = { x: dx / l, z: dz / l };
  }
  if (!d && aim) { const dx = aim.x - c.x, dz = aim.z - c.z, l = Math.hypot(dx, dz); if (l > 0.5) d = { x: dx / l, z: dz / l }; }
  if (!d) d = forward(c);
  if (Math.abs(d.x) + Math.abs(d.z) > 0.01) c.ry = Math.atan2(d.x, d.z);
  const ult = slot === 5;
  const range = ab.range ?? 10;

  if (shape === 'melee') {
    const R = range + 0.8;
    const list = hostilesNear(S, c, c.x, c.z, R + 2);
    const hits = [];
    for (const e of list) {
      const dx = e.x - c.x, dz = e.z - c.z, l = Math.hypot(dx, dz);
      const reach = R + (e.radius ?? 0.5);
      if (l > reach) continue;
      if (e !== target && l > 0.8 && (dx * d.x + dz * d.z) / l < 0.34) continue; // ~140 deg arc
      hits.push([e, l]);
    }
    hits.sort((a, b) => (a[0] === target ? -1 : b[0] === target ? 1 : a[1] - b[1]));
    const max = ab.kind === 'basic' ? 2 : 4;
    for (let i = 0; i < hits.length && i < max; i++) dealDamage(S, c, hits[i][0], base * (i === 0 ? 1 : 0.7), el, ab.id, { statusMul: ab.kind === 'basic' ? 0.5 : 1 });
  } else if (shape === 'projectile') {
    const speed = ab.speed || 34;
    let dst = target && target.alive && hostile(c, target) && Math.hypot(target.x - c.x, target.z - c.z) <= range + 6 ? target : null;
    let dd = dst ? Math.hypot(dst.x - c.x, dst.z - c.z) : 0;
    if (!dst) { // straight shot: first hostile along the path
      const ex = c.x + d.x * range, ez = c.z + d.z * range;
      const list = hostilesNear(S, c, (c.x + ex) / 2, (c.z + ez) / 2, range / 2 + 2);
      let best = Infinity;
      for (const e of list) {
        const rr = (ab.radius ?? 0.6) + (e.radius ?? 0.5) + 0.4;
        if (segDist2(e.x, e.z, c.x, c.z, ex, ez) > rr * rr) continue;
        const t = (e.x - c.x) * d.x + (e.z - c.z) * d.z;
        if (t >= 0 && t < best) { best = t; dst = e; }
      }
      dd = best;
    }
    if (dst) schedule(S, dd / speed, { kind: 'hit', src: c.id, dst: dst.id, amount: base, element: el, ability: ab.id, opts: { statusMul: ab.kind === 'basic' ? 0.5 : 1 } });
  } else if (shape === 'line') {
    const len = range, r = Math.max(0.8, ab.radius ?? 1);
    const ex = c.x + d.x * len, ez = c.z + d.z * len;
    const list = hostilesNear(S, c, (c.x + ex) / 2, (c.z + ez) / 2, len / 2 + r + 2);
    let n = 0;
    for (const e of list) {
      const rr = r + (e.radius ?? 0.5);
      if (segDist2(e.x, e.z, c.x, c.z, ex, ez) > rr * rr) continue;
      const t = Math.max(0, (e.x - c.x) * d.x + (e.z - c.z) * d.z);
      schedule(S, ab.speed ? Math.min(1, t / ab.speed) : 0, { kind: 'hit', src: c.id, dst: e.id, amount: base, element: el, ability: ab.id });
      if (++n >= 8) break;
    }
  } else if (shape === 'zone') {
    let px, pz;
    if (aim) { px = aim.x; pz = aim.z; } else if (target && target !== c) { px = target.x; pz = target.z; } else { px = c.x + d.x * range * 0.6; pz = c.z + d.z * range * 0.6; }
    const dx = px - c.x, dz = pz - c.z, l = Math.hypot(dx, dz);
    if (l > range) { px = c.x + (dx / l) * range; pz = c.z + (dz / l) * range; }
    aim = { x: px, y: S.groundY(px, pz), z: pz };
    const r = Math.max(1.5, ab.radius ?? 3);
    const delay = ab.speed ? Math.min(1, Math.min(l, range) / ab.speed) : 0.25;
    schedule(S, delay, { kind: 'area', src: c.id, team: c.team, x: px, z: pz, r, amount: base, element: el, ability: ab.id, max: 12 });
    if (ult) schedule(S, delay + 1, { kind: 'zonetick', src: c.id, team: c.team, x: px, z: pz, r, amount: base * 0.3, element: el, ability: ab.id, left: 3, opts: { noCrit: true, statusMul: 0.6 } });
  } else if (shape === 'self') {
    const buffs = SELF_BUFF[el] ?? SELF_BUFF.default;
    for (const [id, dur, mag] of buffs) {
      applyStatus(S, c, id, dur, mag, c);
      if (id === 'shield') { const s = hasStatus(c, 'shield'); if (s) s.pool = Math.round(c.mhp * mag + base); }
    }
    if (base > 0) schedule(S, 0.1, { kind: 'area', src: c.id, team: c.team, x: c.x, z: c.z, r: Math.max(4, ab.radius || 0), amount: base * 0.5, element: el, ability: ab.id, max: 8 });
  } else if (shape === 'summon') {
    S.spawnPet(c, ab, d);
  }
  return { aim: aim ?? { x: c.x + d.x * Math.min(range, 12), y: c.y, z: c.z + d.z * Math.min(range, 12) }, dir: d };
}
