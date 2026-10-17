// Mob creation and AI: idle/wander, aggro, chase, role-based attacks, telegraphed AoEs and boss
// phases (emitting `cast` events so clients can draw telegraphs), leash + reset, respawn. Pets.
import { CREATURE_BY_ID, ROLE_STATS, ARCHETYPES, CREATURES } from '../creatures.js';
import { OATH_BY_ID } from '../oaths.js';
import { TEAM_MOB, TEAM_PLAYER, dealDamage, isStunned, moveMul, clearStatuses, schedule, hostile } from './combat.js';
import { SAFE_RADIUS } from './world.js';
import { clamp } from './util.js';

const RANGED = new Set(['wisp', 'wraith', 'drake']);
export const RESPAWN_MS = { common: 45000, veteran: 75000, elite: 150000, boss: 900000 };
const LEASH = { common: 42, veteran: 48, elite: 56, boss: 70 };

export const mobHp = (lvl, role) => Math.round((70 + 26 * lvl + 1.2 * lvl * lvl) * ROLE_STATS[role].hpMul);
export const mobDmg = (lvl, role) => (5 + 2.3 * lvl) * ROLE_STATS[role].dmgMul;

export function createMob(S, defId, x, z, lvl, extra = {}) {
  const def = CREATURE_BY_ID[defId];
  const arch = ARCHETYPES[def.archetype];
  const role = extra.role ?? def.role;
  const scale = (def.scale ?? 1) * (extra.scale ?? 1);
  const m = {
    id: S.nextId('m'), k: 'm', team: TEAM_MOB, name: extra.name ?? def.name, oath: def.oath, cls: null, model: def.id,
    def, role, lvl, element: OATH_BY_ID[def.oath].element,
    x, y: S.groundY(x, z), z, ry: S.rng() * Math.PI * 2, anim: 'idle',
    hp: 0, mhp: 0, alive: true, st: [], fxVer: 0, tgt: null,
    radius: 0.5 + arch.height * 0.25 * scale, headY: arch.height * scale,
    speed: arch.speed * 0.82, ranged: RANGED.has(def.archetype),
    home: { x, z }, state: 'idle', threat: new Map(), credit: new Map(),
    nextThink: S.t + S.rng() * 1000, nextWander: S.t + 2000 + S.rng() * 6000, wander: null,
    atkReady: 0, specialReady: S.t + 6000, casting: null, awake: false, awakeCheck: 0,
    armor: Math.round(3 + lvl * 2 * (role === 'boss' ? 1.4 : role === 'elite' ? 1.2 : 1)), pow: 1,
    phase: 0, respawnMs: RESPAWN_MS[role], leash: LEASH[role], combatUntil: 0, stunImmune: 0,
    ...extra.fields,
  };
  m.mhp = m.hp = mobHp(lvl, role) * (extra.hpMul ?? 1);
  S.addEnt(m);
  S.mobs.push(m);
  return m;
}

function moveToward(S, m, tx, tz, speed, dt, stopAt = 0) {
  const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
  if (d <= stopAt + 0.01) return d;
  const step = Math.min(d - stopAt, speed * moveMul(m) * dt);
  if (step <= 0) return d;
  m.x += (dx / d) * step; m.z += (dz / d) * step;
  m.ry = Math.atan2(dx, dz);
  if (m.state === 'idle' || (S.tickN + m.idn) % 2 === 0) m.y = S.groundY(m.x, m.z);
  S.grid.move(m);
  return d - step;
}

function face(m, t) { m.ry = Math.atan2(t.x - m.x, t.z - m.z); }

export function resetMob(S, m) {
  m.state = 'return'; m.tgt = null; m.casting = null;
  m.threat.clear(); m.credit.clear();
  m.invuln = true; clearStatuses(m);
}

export function engage(S, m, target) {
  if (m.state === 'return' || !m.alive) return;
  if (!m.threat.has(target.id)) m.threat.set(target.id, 1);
  if (m.state !== 'chase') {
    m.state = 'chase'; m.atkReady = S.t + 400; m.specialReady = S.t + 4000 + S.rng() * 3000;
    if (m.role === 'boss') S.ev({ type: 'cast', src: m.id, ability: 'mob/roar', slot: -1, aim: { x: m.x, y: m.y, z: m.z }, dir: { x: 0, z: 1 }, castTime: 0 }, m.x, m.z);
  }
  // social aggro: camp mates join
  if (m.camp) for (const o of m.camp.mobs) if (o !== m && o.alive && o.state === 'idle') { o.threat.set(target.id, 1); o.state = 'chase'; o.atkReady = S.t + 600; }
}

function topThreat(S, m) {
  let best = null, bv = -1;
  for (const [id, v] of m.threat) {
    const e = S.ents.get(id);
    if (!e || !e.alive) { m.threat.delete(id); continue; }
    if (v > bv) { bv = v; best = e; }
  }
  return best;
}

function inSanctuary(S, e) {
  for (const s of S.sanctuaries) if ((s.center[0] - e.x) ** 2 + (s.center[1] - e.z) ** 2 < (SAFE_RADIUS - 10) ** 2) return true;
  return false;
}

function attackRange(m, t) { return m.ranged ? 15 : 1.4 + m.radius + (t.radius ?? 0.5); }

function startTelegraph(S, m, t) {
  const big = m.role === 'boss';
  const kind = big && m.phase >= 1 && S.rng() < 0.45 ? 'nova' : 'slam';
  const r = kind === 'nova' ? 9 + m.phase * 2 : big ? 7 : 5;
  const x = kind === 'nova' ? m.x : t.x, z = kind === 'nova' ? m.z : t.z;
  const castTime = big ? 1.8 : 1.5;
  m.casting = { until: S.t + castTime * 1000, x, z, r, kind, amount: mobDmg(m.lvl, m.role) * (kind === 'nova' ? 1.6 : 2.2) };
  m.anim = 'cast';
  S.ev({ type: 'cast', src: m.id, ability: `mob/${kind}`, slot: -1, aim: { x, y: S.groundY(x, z), z }, dir: { x: Math.sin(m.ry), z: Math.cos(m.ry) }, castTime, radius: r, shape: 'zone', element: m.element, telegraph: true }, m.x, m.z);
}

function bossPhase(S, m) {
  const frac = m.hp / m.mhp;
  const want = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
  if (want <= m.phase) return;
  m.phase = want;
  m.pow = 1 + 0.2 * want;
  S.system(`${m.name} ${want === 1 ? 'is enraged' : 'unleashes its final fury'}!`, m.x, m.z, 400);
  S.ev({ type: 'cast', src: m.id, ability: 'mob/phase', slot: -1, aim: { x: m.x, y: m.y, z: m.z }, dir: { x: 0, z: 1 }, castTime: 0, phase: want }, m.x, m.z);
  // summon adds from the region roster
  const add = CREATURES.find((c) => c.oath === m.oath && c.role === 'common');
  for (let i = 0; i < 2; i++) {
    const a = S.rng() * Math.PI * 2;
    const ad = createMob(S, add.id, m.x + Math.cos(a) * 6, m.z + Math.sin(a) * 6, Math.max(1, m.lvl - 3), { fields: { temp: true, respawnMs: 0 } });
    const t = topThreat(S, m); if (t) engage(S, ad, t);
  }
}

export function thinkMob(S, m, dt) {
  if (!m.alive) {
    if (m.respawnAt && S.t >= m.respawnAt) S.respawnMob(m);
    return;
  }
  if (m.own) return thinkPet(S, m, dt);
  if (m.state === 'idle') {
    if (S.t >= m.awakeCheck) {
      m.awakeCheck = S.t + 1000;
      m.awake = S.pgrid.any(m.x, m.z, 170);
      if (!m.awake && m.anim !== 'idle') m.anim = 'idle';
    }
    if (!m.awake && !m.roam) return;
    // idle AI (wander + aggro scan) runs at 5 Hz, staggered across mobs; combat AI runs every tick
    if ((S.tickN + m.idn) % 4 !== 0) return;
    dt *= 4;
  }
  if (isStunned(m)) { m.anim = 'hit'; return; }

  if (m.casting) {
    if (S.t >= m.casting.until) {
      const c = m.casting; m.casting = null;
      schedule(S, 0, { kind: 'area', src: m.id, team: m.team, x: c.x, z: c.z, r: c.r, amount: c.amount, element: m.element, ability: `mob/${c.kind}`, max: 16, opts: { raw: false } });
      m.anim = 'attack';
      m.atkReady = S.t + 900;
    }
    return;
  }

  switch (m.state) {
    case 'idle': {
      if (m.roam) { roam(S, m, dt); }
      else if (S.t >= m.nextWander) {
        m.nextWander = S.t + 4000 + S.rng() * 8000;
        const a = S.rng() * Math.PI * 2, r = S.rng() * 9;
        m.wander = { x: m.home.x + Math.cos(a) * r, z: m.home.z + Math.sin(a) * r };
      }
      if (m.wander && !m.roam) {
        const left = moveToward(S, m, m.wander.x, m.wander.z, m.speed * 0.3, dt);
        m.anim = left > 0.2 ? 'walk' : 'idle';
        if (left <= 0.2) m.wander = null;
      }
      if (S.t >= m.nextThink) {
        m.nextThink = S.t + 450 + S.rng() * 150;
        const ar = ROLE_STATS[m.role].aggro;
        let best = null, bd = Infinity;
        S.pgrid.forEachNear(m.x, m.z, ar + 4, (p) => {
          if (!p.alive || p.invis) return;
          // much stronger players are ignored at range
          const r = p.lvl > m.lvl + 6 ? ar * 0.4 : ar;
          const d = (p.x - m.x) ** 2 + (p.z - m.z) ** 2;
          if (d < r * r && d < bd && Math.abs(p.y - m.y) < 14) { bd = d; best = p; }
        });
        if (best && !inSanctuary(S, best)) engage(S, m, best);
      }
      break;
    }
    case 'chase': {
      const t = topThreat(S, m);
      const hd = Math.hypot(m.x - m.home.x, m.z - m.home.z);
      if (!t || hd > m.leash || (t.k === 'p' && inSanctuary(S, t)) || Math.hypot(t.x - m.x, t.z - m.z) > m.leash + 30) { resetMob(S, m); break; }
      m.tgt = t.id;
      if (m.role === 'boss') bossPhase(S, m);
      const range = attackRange(m, t);
      const d = Math.hypot(t.x - m.x, t.z - m.z);
      if ((m.role === 'elite' || m.role === 'boss') && S.t >= m.specialReady && d < 22) {
        m.specialReady = S.t + (m.role === 'boss' ? 6500 - m.phase * 1200 : 9000) + S.rng() * 2000;
        face(m, t);
        startTelegraph(S, m, t);
        break;
      }
      if (d > range) {
        moveToward(S, m, t.x, t.z, m.speed, dt, range * 0.8);
        m.anim = 'run';
      } else {
        face(m, t);
        if (S.t >= m.atkReady) {
          m.atkReady = S.t + (m.role === 'boss' ? 2100 : 1700);
          const ability = m.ranged ? 'mob/bolt' : 'mob/claw';
          m.anim = 'attack';
          S.ev({ type: 'cast', src: m.id, ability, slot: -1, target: t.id, aim: { x: t.x, y: t.y, z: t.z }, dir: { x: Math.sin(m.ry), z: Math.cos(m.ry) }, castTime: 0, element: m.element }, m.x, m.z);
          schedule(S, m.ranged ? d / 22 : 0.25, { kind: 'hit', src: m.id, dst: t.id, amount: mobDmg(m.lvl, m.role), element: m.element, ability, opts: { statusMul: m.role === 'common' ? 0.3 : 0.6 } });
        } else if (m.anim === 'run') m.anim = 'idle';
      }
      break;
    }
    case 'return': {
      const left = moveToward(S, m, m.home.x, m.home.z, m.speed * 1.4, dt);
      m.anim = 'run';
      if (left < 1) {
        m.state = 'idle'; m.invuln = false; m.hp = m.mhp; m.anim = 'idle'; m.phase = 0; m.pow = 1;
        m.y = S.groundY(m.x, m.z);
        if (m.temp) S.despawnMob(m);
      }
      break;
    }
  }
}

/** Roaming world boss: walks back and forth along a road path when not fighting. */
function roam(S, m, dt) {
  const r = m.roam;
  const tgt = r.path[r.i];
  const left = moveToward(S, m, tgt.x, tgt.z, m.speed * 0.35, dt);
  m.anim = 'walk';
  m.home.x = m.x; m.home.z = m.z; // leash follows the roam path
  if (left < 2) r.i = (r.i + 1) % r.path.length;
}

// ---------- pets ----------
export function spawnPet(S, owner, ab, dir) {
  owner.pets = (owner.pets || []).filter((p) => p.alive && S.ents.has(p.id));
  if (owner.pets.length >= 2) S.despawnMob(owner.pets.shift());
  const x = owner.x + dir.x * 2, z = owner.z + dir.z * 2;
  const pet = {
    id: S.nextId('pet'), k: 'm', team: TEAM_PLAYER, own: owner.id, name: `${owner.name}'s ${ab.name}`, oath: owner.oath, cls: null,
    model: ab.id, role: 'pet', lvl: owner.lvl, element: ab.element ?? owner.element,
    x, y: S.groundY(x, z), z, ry: owner.ry, anim: 'idle', hp: 0, mhp: 0, alive: true, st: [], fxVer: 0, tgt: null,
    radius: 0.6, headY: 1.2, speed: 8.5, armor: owner.stats.armor, pow: owner.stats.power,
    dmg: Math.max(4, ab.damage * 0.35), atkReady: S.t + 500, expires: S.t + 25000, combatUntil: 0, stunImmune: 0,
  };
  pet.mhp = pet.hp = Math.round(owner.mhp * 0.5);
  S.addEnt(pet);
  S.mobs.push(pet);
  owner.pets.push(pet);
  return pet;
}

function thinkPet(S, p, dt) {
  const owner = S.ents.get(p.own);
  if (!owner || !owner.alive || S.t >= p.expires) { S.despawnMob(p); return; }
  if (isStunned(p)) return;
  let t = p.tgt ? S.ents.get(p.tgt) : null;
  if (!t || !t.alive || !hostile(p, t) || Math.hypot(t.x - owner.x, t.z - owner.z) > 30) {
    t = null;
    const ot = owner.tgt ? S.ents.get(owner.tgt) : null;
    if (ot && ot.alive && hostile(p, ot)) t = ot;
    else if (S.tickN % 10 === p.idn % 10) {
      // defend the owner: nearest mob that is fighting them
      let bd = 225;
      S.grid.forEachNear(owner.x, owner.z, 15, (e) => {
        if (e.k !== 'm' || !e.alive || e.team !== TEAM_MOB || e.tgt !== owner.id) return;
        const d = (e.x - owner.x) ** 2 + (e.z - owner.z) ** 2; if (d < bd) { bd = d; t = e; }
      });
    }
  }
  p.tgt = t ? t.id : null;
  if (t) {
    const range = 1.6 + p.radius + (t.radius ?? 0.5);
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d > range) { moveToward(S, p, t.x, t.z, p.speed, dt, range * 0.8); p.anim = 'run'; }
    else {
      face(p, t);
      if (S.t >= p.atkReady) {
        p.atkReady = S.t + 1400; p.anim = 'attack';
        S.ev({ type: 'cast', src: p.id, ability: 'pet/strike', slot: -1, target: t.id, aim: { x: t.x, y: t.y, z: t.z }, dir: { x: Math.sin(p.ry), z: Math.cos(p.ry) }, castTime: 0, element: p.element }, p.x, p.z);
        dealDamage(S, p, t, p.dmg, p.element, 'pet/strike', { statusMul: 0.4 });
      }
    }
  } else {
    const left = moveToward(S, p, owner.x - Math.sin(owner.ry) * 2.5, owner.z - Math.cos(owner.ry) * 2.5, p.speed, dt, 1.5);
    p.anim = left > 0.3 ? 'run' : 'idle';
  }
}

export { clamp };
