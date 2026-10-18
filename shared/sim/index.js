// Authoritative Aetherion simulation. Pure JS (no Node/DOM APIs): runs inside the Node server
// and, for offline play, inside a browser Web Worker / main thread with identical messages.
//
//   const sim = createSim({ seed, now, persistence, bots })
//   sim.addPlayer(id, hello[, saved]) -> welcome message
//   sim.removePlayer(id)               -> saved character data (also passed to persistence.save)
//   sim.handle(id, msg)                -> processes one client message (see shared/protocol.js)
//   sim.tick(dt)                       -> [{to: id | '*', msg}]  (call at TICK_HZ)
//   sim.stats()                        -> counters + tick time percentiles
//
// Snapshots are delta-encoded per client (see protocol.js "Snapshot deltas"); game/src/net
// re-hydrates them so bus consumers always see full EntityState objects.
import { OATHS, OATH_BY_ID, CLASSES, MAX_LEVEL, xpForLevel, regionAt } from '../oaths.js';
import { abilityForSlot, restoreLoadout } from './loadout.js';
import { heightAt, WORLD_HALF, SEA_LEVEL } from '../terrain.js';
import { TICK_HZ, SNAP_HZ, INTEREST_RADIUS, ANIMS, PROTOCOL_VERSION } from '../protocol.js';
import { makeRng, clamp, q2, randomToken, Grid, Ring } from './util.js';
import { NPC_TEXT, OATH_LEADERS, OATH_CIVICS, CONSUMABLES, MASK_WORDS, genName } from './data.js';
import { buildSanctuaries, buildCamps, buildLairs, SAFE_RADIUS, SHRINE_DISCOVER_RADIUS, levelForDistance, WAR_ZONES } from './world.js';
import { computeStats, rollLoot, addItem, makeGear, makeConsumable } from './items.js';
import {
  TEAM_PLAYER, hostile, resolveAbility, processDelayed, tickStatuses, applyStatus, clearStatuses, isStunned,
  moveMul, heal, hasStatus, dealDamage,
} from './combat.js';
import { createMob, thinkMob, engage, spawnPet } from './mobs.js';
import { chainStep, addQuest, questView, onKill, onTalk, onDiscover, makeBounty } from './quests.js';
import { spawnBot, thinkBot } from './bots.js';
import { initEvents, tickEvents, startEvent, activeEvents } from './events.js';
import {
  initSocial, initPlayerSocial, handleSocial, socialChat, tickSocial, resyncSocial, onDisconnect, removeSocial, updatePvpZone,
  rewardRecipients, onPvpKill, duelDefeat, isPvp, PARTY_MAX, TRADE_MAX_ITEMS, TRADE_RANGE, DUEL_RING, PVP_DAMAGE_MUL, PVP_TOGGLE_CD_MS,
} from './social.js';
import { botInvited, botTrade, botWhispered } from './bots.js';

const DAY_SECONDS = 2400; // one in-game day = 40 real minutes
const SNAP_EVERY = Math.max(1, Math.round(TICK_HZ / SNAP_HZ)); // 2 at 20/10 Hz; players are staggered across phases
const SAY_RADIUS = 40;
const INTERACT_RADIUS = 8;
const R2 = INTEREST_RADIUS * INTEREST_RADIUS;
const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const EMPTY = [];

export function sanitizeText(s, max = 200) {
  if (typeof s !== 'string') return '';
  let t = s.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
  // strip control / zero-width / bidi override characters
  t = t.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, '');
  t = t.replace(/\s+/g, ' ').trim().slice(0, max);
  for (const w of MASK_WORDS) t = t.replace(new RegExp(`\\b${w}`, 'gi'), (m) => m[0] + '*'.repeat(m.length - 1));
  return t;
}
export function sanitizeName(s) {
  const t = sanitizeText(s, 20).replace(/[^\p{L}\p{N} '\-]/gu, '').trim();
  return t.length >= 2 ? t : 'Wanderer';
}

// chat command -> [message type, op, needs a target]
const SOCIAL_CMDS = {
  invite: ['party', 'invite', true], inv: ['party', 'invite', true], leave: ['party', 'leave'], kick: ['party', 'kick', true], lead: ['party', 'lead', true],
  promote: ['party', 'lead', true], disband: ['party', 'disband'], duel: ['duel', 'challenge', true], forfeit: ['duel', 'forfeit'], yield: ['duel', 'forfeit'],
  trade: ['trade', 'request', true], pvp: ['pvp'], p: ['chat', 'party'], party: ['chat', 'party'], w: ['chat', 'whisper'], whisper: ['chat', 'whisper'], tell: ['chat', 'whisper'],
};

class Sim {
  constructor(opts) {
    this.opts = opts;
    this.seed = opts.seed ?? 15015;
    this.rng = makeRng(this.seed ^ 0x5eed);
    this.wall0 = opts.now ? opts.now() : Date.now();
    this.t = 0; // sim ms since start
    this.tickN = 0;
    this.idN = 0;
    this.markN = 0;
    this.persistence = opts.persistence ?? null;
    this.ents = new Map();
    this.players = new Map();
    this.mobs = [];
    this.npcs = [];
    this.grid = new Grid(64);
    this.pgrid = new Grid(64);
    this.statused = new Set();
    this.delayed = [];
    this.evq = [];
    this.out = [];
    this.botTarget = opts.bots ?? 0;
    this.nextBotCheck = 0;
    this.tickTimes = new Ring(1200);
    this.stats = { hits: 0, kills: 0, deaths: 0, corrections: 0, msgs: 0 };
    this.startHour = opts.startHour ?? 10;
    this.allowSpawn = !!opts.allowSpawnParam;
    this.corpses = [];

    this.sanctuaries = buildSanctuaries();
    this.camps = buildCamps(this.seed, opts.campsPerRegion ?? 22);
    this.lairs = buildLairs(this.seed);
    this.populate();
    initEvents(this, opts);
    initSocial(this);
    this.botInvited = (b, inv) => botInvited(this, b, inv);
    this.botTrade = (b, tr, state) => botTrade(this, b, tr, state);
    this.botWhispered = (b, from, text) => botWhispered(this, b, from, text);
  }

  // ---------- entity bookkeeping ----------
  nextId(prefix) { return `${prefix}${(++this.idN).toString(36)}`; }
  addEnt(e) {
    e.idn = this.idN;
    if (e.fxVer == null) e.fxVer = 0;
    this.ents.set(e.id, e);
    this.grid.insert(e);
  }
  groundY(x, z) { const h = heightAt(x, z); return h < SEA_LEVEL ? SEA_LEVEL - 0.6 : h; }
  regionOf(x, z) { return regionAt(x, z).id; }
  inSafe(x, z) { for (const s of this.sanctuaries) if ((s.center[0] - x) ** 2 + (s.center[1] - z) ** 2 < SAFE_RADIUS * SAFE_RADIUS) return true; return false; }
  serverTime() { return Math.round(this.wall0 + this.t); }
  timeOfDay() { return q2((this.startHour + (this.t / 1000 / DAY_SECONDS) * 24) % 24); }

  populate() {
    for (const s of this.sanctuaries) {
      const i = s.index;
      for (const spot of s.npcs) {
        const name = spot.role === 'oathkeeper' ? OATH_LEADERS[i] : spot.role === 'chronicler' ? OATH_CIVICS[i] : genName(makeRng(this.seed + i * 17 + spot.role.length * 101));
        const n = {
          id: `n-${s.oathId}-${spot.role}`, k: 'n', team: 0, name, oath: s.oathId, cls: null, model: `npc-${spot.role}`, role: spot.role,
          lvl: 30, x: spot.x, y: spot.y, z: spot.z, ry: spot.ry, anim: 'idle', hp: 1000, mhp: 1000, alive: true, st: [], fxVer: 0, tgt: null, radius: 0.5,
        };
        this.addEnt(n); this.npcs.push(n);
      }
    }
    for (const c of this.camps) {
      c.mobs = [];
      c.members.forEach((defId, j) => {
        const a = (j / c.members.length) * Math.PI * 2 + this.rng() * 0.6;
        const r = 3 + this.rng() * 5;
        const m = createMob(this, defId, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, Math.max(1, c.level + (j % 2)), { fields: { camp: c } });
        c.mobs.push(m);
      });
    }
    for (const l of this.lairs) {
      const m = createMob(this, l.boss, l.x, l.z, l.level, { fields: { lair: l } });
      l.mob = m;
    }
  }

  // ---------- messaging ----------
  ev(e, x, z, global = false) { this.evq.push({ e, x, z, global }); }
  evTo(p, e) { if (!p.bot) this.out.push({ to: p.id, msg: { t: 'ev', e } }); }
  send(p, msg) { if (!p.bot) this.out.push({ to: p.id, msg }); }
  system(text, x, z, r) {
    if (x == null) this.ev({ type: 'system', text }, 0, 0, true);
    else this.pgrid.forEachNear(x, z, r ?? INTEREST_RADIUS, (p) => this.evTo(p, { type: 'system', text }));
  }
  sysTo(p, text) { this.evTo(p, { type: 'system', text }); }

  flushEvents() {
    const out = this.out;
    for (const it of this.evq) {
      const msg = { t: 'ev', e: it.e };
      if (it.global) { out.push({ to: '*', msg }); continue; }
      this.pgrid.forEachNear(it.x, it.z, INTEREST_RADIUS, (p) => {
        if (p.bot) return;
        const dx = p.x - it.x, dz = p.z - it.z;
        if (dx * dx + dz * dz <= R2) out.push({ to: p.id, msg });
      });
    }
    this.evq.length = 0;
  }

  // ---------- players ----------
  addPlayer(id, hello = {}, savedArg = null, extra = {}) {
    const oath = OATH_BY_ID[hello.oath] ? hello.oath : 'oath-09';
    const cls = CLASSES[hello.cls] ? hello.cls : 'ninja';
    let saved = savedArg;
    const tok = typeof hello.token === 'string' && /^[a-f0-9]{16,64}$/.test(hello.token) ? hello.token : null;
    if (!saved && tok && this.persistence?.load) { try { saved = this.persistence.load(tok); } catch { saved = null; } }
    if (saved && (saved.oath !== oath || saved.cls !== cls)) saved = null;
    const token = saved && tok ? tok : randomToken(16);
    const o = OATH_BY_ID[oath];
    const home = OATH_BY_ID[extra.home] ? extra.home : oath;
    const sp = this.sanctuaries[OATH_BY_ID[home].index - 1].spawn;
    const p = {
      id, k: 'p', team: TEAM_PLAYER, bot: !!extra.bot, token,
      name: sanitizeName(saved?.name ?? hello.name), oath, cls, model: `${oath}-${cls}`, element: o.element,
      lvl: clamp(saved?.lvl ?? extra.lvl ?? 1, 1, MAX_LEVEL), xp: saved?.xp ?? 0, gold: saved?.gold ?? 15,
      x: sp.x + (this.rng() - 0.5) * 6, y: sp.y, z: sp.z + (this.rng() - 0.5) * 4, ry: 0, anim: 'idle',
      hp: 1, mhp: 1, mp: 1, mmp: 1, alive: true, st: [], fxVer: 0, tgt: null, radius: 0.45, headY: 1.8,
      inventory: [], equipment: {}, stats: null, hotbar: restoreLoadout(oath, cls, saved?.loadout), loadoutAt: -Infinity,
      cds: new Array(6).fill(0), gcd: 0, casting: null, potionCd: 0,
      discovered: new Set([home]), quests: new Map(), chainStep: saved?.chainStep ?? 1,
      combatUntil: 0, stunImmune: 0, deadAt: 0, regenAt: 0,
      budget: 20, budgetT: 0, corrAt: 0, corrGrace: 0, lastSeq: -1, violations: 0,
      chatTokens: 5, chatT: 0, travelAt: 0, youDirty: true, youAt: 0, saveDirty: false,
      known: new Map(), phase: 0, pets: [], h: 0, hx: NaN, hz: NaN,
    };
    p.phase = this.players.size % SNAP_EVERY;
    initPlayerSocial(p, saved);
    if (saved) {
      p.inventory = Array.isArray(saved.inventory) ? saved.inventory.slice(0, 40) : [];
      p.equipment = saved.equipment && typeof saved.equipment === 'object' ? saved.equipment : {};
      for (const d of saved.discovered ?? []) if (OATH_BY_ID[d]) p.discovered.add(d);
      for (const q of saved.quests ?? []) if (q && q.id) p.quests.set(q.id, q);
      p.bountiesDone = saved.bountiesDone ?? 0;
      if (saved.pos && isNum(saved.pos.x) && isNum(saved.pos.z) && Math.abs(saved.pos.x) < WORLD_HALF && Math.abs(saved.pos.z) < WORLD_HALF) {
        p.x = saved.pos.x; p.z = saved.pos.z; p.y = Math.max(isNum(saved.pos.y) ? saved.pos.y : 0, this.groundY(p.x, p.z));
      }
    } else {
      // starter kit
      p.equipment.weapon = makeGear(this.rng, { oath, cls, lvl: p.lvl, slot: 'weapon', rarity: 'common' });
      p.equipment.chest = makeGear(this.rng, { oath, cls, lvl: p.lvl, slot: 'chest', rarity: 'common' });
      addItem(p, makeConsumable(this.rng, 'potion', 3));
      addItem(p, makeConsumable(this.rng, 'ether', 2));
      if (p.bot && p.lvl > 4) p.equipment.legs = makeGear(this.rng, { oath, cls, lvl: p.lvl, slot: 'legs' });
    }
    if (this.allowSpawn && hello.spawn && isNum(hello.spawn.x) && isNum(hello.spawn.z) && Math.abs(hello.spawn.x) < WORLD_HALF && Math.abs(hello.spawn.z) < WORLD_HALF) {
      p.x = hello.spawn.x; p.z = hello.spawn.z; p.y = this.groundY(p.x, p.z);
    }
    computeStats(p);
    p.hp = saved?.hp > 0 ? Math.min(saved.hp, p.mhp) : p.mhp;
    p.mp = saved?.mp > 0 ? Math.min(saved.mp, p.mmp) : p.mmp;
    p.budgetT = this.t;
    this.addEnt(p);
    this.pgrid.insert(p);
    this.players.set(id, p);
    if (!p.bot) {
      if (!saved || !p.quests.size) { const st = chainStep(this, oath, p.chainStep); if (st && !p.quests.has(st.id)) p.quests.set(st.id, { ...st, progress: 0, done: false }); }
      if (this.botTarget > 0) this.nextBotCheck = 0;
      this.persist(p);
    }
    return this.welcome(p);
  }

  welcome(p) {
    p.known.clear();
    resyncSocial(this, p);
    p.lastSeq = -1;
    p.budgetT = this.t; p.corrGrace = this.t + 500;
    p.youDirty = false;
    return {
      t: 'welcome', id: p.id, token: p.token, tick: this.tickN, serverTime: this.serverTime(), you: this.youState(p),
      world: {
        seed: this.seed, timeOfDay: this.timeOfDay(), daySeconds: DAY_SECONDS, protocol: PROTOCOL_VERSION, tickHz: TICK_HZ, snapHz: SNAP_HZ,
        interest: INTEREST_RADIUS, events: activeEvents(this),
        sanctuaries: this.sanctuaries.map((s) => ({ oathId: s.oathId, center: s.center, y: s.y, shrine: s.shrine, spawn: s.spawn, npcs: s.npcs.map((n) => ({ role: n.role, id: `n-${s.oathId}-${n.role}`, x: q2(n.x), y: n.y, z: q2(n.z), ry: q2(n.ry) })) })),
        lairs: this.lairs.map((l) => ({ oath: l.oath, boss: l.boss, x: q2(l.x), y: q2(l.y), z: q2(l.z), level: l.level })),
        warZones: WAR_ZONES,
        social: { partyMax: PARTY_MAX, tradeMaxItems: TRADE_MAX_ITEMS, tradeRange: TRADE_RANGE, duelRing: DUEL_RING, pvpDamageMul: PVP_DAMAGE_MUL, pvpToggleCdMs: PVP_TOGGLE_CD_MS, safeRadius: SAFE_RADIUS },
      },
    };
  }

  /** Re-attach a reconnecting client to its live character (token resume). */
  resume(id) { const p = this.players.get(id); return p ? this.welcome(p) : null; }

  /**
   * PlayerState for the 'you' message. With `partial`, the bulky inventory/equipment and quest/discovery
   * sections are omitted unless they changed since the last 'you' sent to this player (net/ merges them).
   */
  youState(p, partial = false) {
    const y = this.youCore(p);
    const invSig = this.invSig(p), qSig = this.questSig(p);
    if (!partial || invSig !== p.sentInv) { y.inventory = p.inventory; y.equipment = p.equipment; p.sentInv = invSig; }
    if (!partial || qSig !== p.sentQ) { y.quests = [...p.quests.values()].map(questView); y.discovered = [...p.discovered]; p.sentQ = qSig; }
    const loadoutSig = p.hotbar.map((a) => a.id).join('|');
    if (!partial || p.sentLoadout !== loadoutSig) { y.hotbar = p.hotbar; y.loadout = p.hotbar.slice(1).map((a) => a.id); p.sentLoadout = loadoutSig; }
    if (partial) y.partial = true;
    return y;
  }

  invSig(p) {
    let s = '';
    for (const i of p.inventory) s += i.id + ':' + i.qty + ',';
    for (const k in p.equipment) { const i = p.equipment[k]; if (i) s += k + '=' + i.id + ':' + i.lvl + ','; }
    return s;
  }

  questSig(p) {
    let s = p.discovered.size + '|';
    for (const q of p.quests.values()) s += q.id + ':' + q.progress + ',';
    return s;
  }

  youCore(p) {
    return {
      id: p.id, name: p.name, oath: p.oath, cls: p.cls, lvl: p.lvl, xp: Math.floor(p.xp), next: p.lvl >= MAX_LEVEL ? 0 : xpForLevel(p.lvl), gold: p.gold,
      hp: Math.ceil(p.hp), mhp: p.mhp, mp: Math.floor(p.mp), mmp: p.mmp, alive: p.alive,
      x: q2(p.x), y: q2(p.y), z: q2(p.z), ry: q2(p.ry), stats: p.stats,
      cooldowns: p.cds.map((c) => (c > this.t ? Math.round(this.wall0 + c) : 0)),
      gcd: p.gcd > this.t ? Math.round(this.wall0 + p.gcd) : 0,
      casting: p.casting ? { slot: p.casting.slot, until: Math.round(this.wall0 + p.casting.until) } : null,
      combat: p.combatUntil > this.t,
      fx: p.st.map((s) => s.id),
      pvp: p.pvp, pvpEff: p.pvpEff, pvpCd: Math.round(this.wall0 + p.pvpAt + PVP_TOGGLE_CD_MS), pvpCombat: p.pvpCombatUntil > this.t,
      honor: p.honor, pvpKills: p.pvpKills, party: p.party, duel: p.duel, trade: p.trade, war: p.war,
    };
  }

  serialize(p) {
    return {
      loadout: p.hotbar.slice(1).map((a) => a.id),
      v: 1, token: p.token, name: p.name, oath: p.oath, cls: p.cls, lvl: p.lvl, xp: Math.floor(p.xp), gold: p.gold,
      hp: Math.ceil(p.hp), mp: Math.floor(p.mp), inventory: p.inventory, equipment: p.equipment,
      quests: [...p.quests.values()], discovered: [...p.discovered], chainStep: p.chainStep, bountiesDone: p.bountiesDone ?? 0, honor: p.honor ?? 0, pvpKills: p.pvpKills ?? 0,
      pos: p.alive ? { x: q2(p.x), y: q2(p.y), z: q2(p.z) } : null, savedAt: this.serverTime(),
    };
  }

  persist(p) {
    if (p.bot || !this.persistence?.save) return;
    try { this.persistence.save(p.token, this.serialize(p)); } catch (e) { /* persistence failures must not break the sim */ }
    p.saveDirty = false;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return null;
    removeSocial(this, p);
    const data = p.bot ? null : this.serialize(p);
    this.persist(p);
    for (const pet of p.pets ?? []) if (this.ents.has(pet.id)) this.despawnMob(pet);
    this.grid.remove(p); this.pgrid.remove(p);
    this.ents.delete(id); this.players.delete(id); this.statused.delete(p);
    return data;
  }

  giveItem(p, item) {
    if (addItem(p, item)) { p.youDirty = true; p.saveDirty = true; return true; }
    this.sysTo(p, 'Your packs are full.');
    return false;
  }

  giveXp(p, amount) {
    amount = Math.round(amount);
    if (amount <= 0 || p.lvl >= MAX_LEVEL) return;
    p.xp += amount;
    let leveled = false;
    while (p.lvl < MAX_LEVEL && p.xp >= xpForLevel(p.lvl)) {
      p.xp -= xpForLevel(p.lvl); p.lvl++; leveled = true;
    }
    if (p.lvl >= MAX_LEVEL) p.xp = 0;
    this.evTo(p, { type: 'xp', id: p.id, amount, total: Math.floor(p.xp), next: p.lvl >= MAX_LEVEL ? 0 : xpForLevel(p.lvl) });
    if (leveled) {
      computeStats(p); p.hp = p.mhp; p.mp = p.mmp;
      this.ev({ type: 'level', id: p.id, level: p.lvl }, p.x, p.z);
      if (!p.bot) this.sysTo(p, `You reached level ${p.lvl}.`);
    }
    p.youDirty = true; p.saveDirty = true;
  }

  // ---------- message handling ----------
  handle(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg !== 'object') return;
    this.stats.msgs++;
    switch (msg.t) {
      case 'move': return this.onMove(p, msg);
      case 'cast': return this.castFor(p, msg);
      case 'loadout': return this.setLoadout(p, msg);
      case 'target': { const e = msg.id == null ? null : this.ents.get(String(msg.id)); p.tgt = e && e !== p ? e.id : null; return; }
      case 'chat': return this.onChat(p, msg);
      case 'interact': return this.onInteract(p, msg);
      case 'dialog': return this.onDialog(p, msg);
      case 'travel': return this.onTravel(p, msg);
      case 'respawn': if (!p.alive && this.t - p.deadAt > 1500) this.respawn(p); return;
      case 'equip': return this.equip(p, msg.item);
      case 'unequip': return this.unequip(p, msg.slot);
      case 'use': return this.useItem(p, msg.item);
      case 'drop': { const i = p.inventory.findIndex((it) => it.id === msg.item); if (i >= 0) { p.inventory.splice(i, 1); p.youDirty = true; p.saveDirty = true; } return; }
      case 'party': case 'duel': case 'trade': case 'pvp': return handleSocial(this, p, msg);
      case 'hello': return;
      case 'ping': this.send(p, { t: 'pong', c: isNum(msg.c) ? msg.c : 0, s: this.serverTime() }); return;
      default: this.send(p, { t: 'error', msg: `unknown message type` });
    }
  }

  correct(p, reason) {
    this.stats.corrections++;
    p.violations++;
    if (this.t - p.corrAt < 250) return;
    p.corrAt = this.t; p.corrGrace = this.t + 500;
    p.budget = this.maxSpeed(p) * 1.2;
    this.ev({ type: 'teleport', id: p.id, x: q2(p.x), y: q2(p.y), z: q2(p.z), ry: q2(p.ry), reason }, p.x, p.z);
  }

  maxSpeed(p) {
    const mm = moveMul(p);
    const lenient = 1 - (1 - Math.min(mm, 1.5)) * 0.6; // slows/roots are client-applied; be lenient for latency
    return CLASSES[p.cls].moveSpeed * 1.8 * Math.max(0.2, lenient) * 1.2 + 0.5;
  }

  onMove(p, m) {
    if (!p.alive) return;
    if (!isNum(m.x) || !isNum(m.y) || !isNum(m.z)) return;
    if (isNum(m.seq)) { if (m.seq <= p.lastSeq && p.lastSeq - m.seq < 1e6) return; p.lastSeq = m.seq; }
    const ms = this.maxSpeed(p);
    const elapsed = (this.t - p.budgetT) / 1000;
    p.budgetT = this.t;
    p.budget = Math.min(p.budget + ms * elapsed, ms * 1.25 + 8);
    let x = m.x, z = m.z;
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 35) { if (this.t > p.corrGrace) this.correct(p, 'teleport'); return; }
    if (d > p.budget + 0.75) { if (this.t > p.corrGrace) this.correct(p, 'speed'); return; }
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) { this.correct(p, 'bounds'); return; }
    p.budget -= d;
    // vertical sanity: cache terrain height while the player stays within ~0.75 m
    if (!((x - p.hx) ** 2 + (z - p.hz) ** 2 < 0.56)) { p.h = heightAt(x, z); p.hx = x; p.hz = z; }
    const h = p.h;
    let y = m.y;
    const floor = h < SEA_LEVEL ? SEA_LEVEL - 6 : h - 2.5;
    if (y < floor) y = h < SEA_LEVEL ? SEA_LEVEL - 0.6 : h;
    if (y > Math.max(h, SEA_LEVEL) + 120) { this.correct(p, 'height'); return; }
    p.x = x; p.y = y; p.z = z;
    if (isNum(m.ry)) p.ry = m.ry;
    p.anim = ANIMS.includes(m.anim) ? m.anim : 'idle';
    this.grid.move(p); this.pgrid.move(p);
    if (p.casting && p.casting.interruptible && Math.hypot(p.x - p.casting.x0, p.z - p.casting.z0) > 1.5) this.interrupt(p, 'moved');
  }

  interrupt(p, reason) {
    const c = p.casting; if (!c) return;
    p.casting = null;
    p.mp = Math.min(p.mmp, p.mp + (c.ab.mana ?? 0));
    p.cds[c.slot] = this.t + 1000;
    this.ev({ type: 'interrupt', id: p.id, slot: c.slot, reason }, p.x, p.z);
    p.youDirty = true;
  }

  fail(p, slot, reason) { this.evTo(p, { type: 'fail', id: p.id, slot, reason }); }

  setLoadout(p, msg) {
    // Limit feedback as well as work, including invalid requests from offline clients.
    if (this.t - p.loadoutAt < 250) return;
    p.loadoutAt = this.t;
    const reject = (text) => { this.sysTo(p, text); this.send(p, { t: 'you', you: this.youState(p) }); };
    if (!p.alive || p.casting || p.combatUntil > this.t || p.duel || p.trade || p.cds.some((cd) => cd > this.t)) {
      return reject('Loadout changes require rest: leave combat and wait for all cooldowns.');
    }
    const ids = msg.ids ?? p.hotbar.slice(1).map((a, i) => i + 1 === msg.slot ? msg.ability : a.id);
    if ((!msg.ids && (!Number.isInteger(msg.slot) || msg.slot < 1 || msg.slot > 5)) ||
        !Array.isArray(ids) || ids.length !== 5 || new Set(ids).size !== 5) return reject('Choose five unique abilities belonging to your Oath.');
    const selected = ids.map((id, i) => abilityForSlot(p.oath, p.cls, i + 1, id));
    if (selected.some((a) => !a)) return reject('Choose five unique abilities belonging to your Oath.');
    p.hotbar = [p.hotbar[0], ...selected];
    p.youDirty = true; p.saveDirty = true;
    this.send(p, { t: 'you', you: this.youState(p) });
    this.persist(p);
  }

  castFor(p, msg) {
    const slot = msg.slot | 0;
    if (slot < 0 || slot > 5) return;
    const ab = p.hotbar[slot];
    if (!ab) return this.fail(p, slot, 'empty');
    if (!p.alive) return this.fail(p, slot, 'dead');
    if (isStunned(p)) return this.fail(p, slot, 'stunned');
    if (p.casting) return this.fail(p, slot, 'casting');
    if (p.cds[slot] > this.t + 120) return this.fail(p, slot, 'cooldown');
    if (slot > 0 && p.gcd > this.t + 80) return this.fail(p, slot, 'gcd');
    if (p.mp < (ab.mana ?? 0)) return this.fail(p, slot, 'mana');
    let target = null;
    if (msg.target != null) {
      const t = this.ents.get(String(msg.target));
      if (t && t.alive && t !== p) target = t;
    }
    if (!target && p.tgt) { const t = this.ents.get(p.tgt); if (t && t.alive && hostile(p, t)) target = t; }
    if (target && hostile(p, target)) {
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      if (d > (ab.range ?? 10) + 8 && ab.shape !== 'zone' && ab.shape !== 'self' && ab.shape !== 'summon') { if (ab.shape !== 'line') return this.fail(p, slot, 'range'); target = null; }
    } else target = null;
    let aim = null, dir = null;
    if (msg.aim && isNum(msg.aim.x) && isNum(msg.aim.z)) aim = { x: msg.aim.x, y: isNum(msg.aim.y) ? msg.aim.y : p.y, z: msg.aim.z };
    if (msg.dir && isNum(msg.dir.x) && isNum(msg.dir.z)) { const l = Math.hypot(msg.dir.x, msg.dir.z); if (l > 1e-3) dir = { x: msg.dir.x / l, z: msg.dir.z / l }; }
    const haste = 1 - (p.stats.haste ?? 0) - (hasStatus(p, 'haste')?.mag ?? 0) * 0.5;
    p.cds[slot] = this.t + (ab.cooldown ?? 1) * 1000 * Math.max(0.5, haste);
    if (slot > 0) p.gcd = this.t + 400;
    p.mp -= ab.mana ?? 0;
    p.tgt = target ? target.id : p.tgt;
    const castTime = (ab.castTime ?? 0) * Math.max(0.5, haste);
    p.combatUntil = Math.max(p.combatUntil, this.t + (target ? 4000 : 0));
    if (castTime > 0.05) {
      p.casting = { slot, ab, until: this.t + castTime * 1000, aim, dir, target: target?.id ?? null, x0: p.x, z0: p.z, interruptible: castTime >= 0.5 };
      p.anim = 'cast';
      this.ev({ type: 'cast', src: p.id, ability: ab.id, slot, aim: aim ?? { x: p.x + Math.sin(p.ry) * 5, y: p.y, z: p.z + Math.cos(p.ry) * 5 }, dir: dir ?? { x: Math.sin(p.ry), z: Math.cos(p.ry) }, target: target?.id ?? null, castTime: q2(castTime), element: ab.element ?? null, shape: ab.shape, radius: ab.radius ?? null }, p.x, p.z);
    } else {
      const r = resolveAbility(this, p, ab, slot, aim, dir, target);
      p.anim = 'attack';
      this.ev({ type: 'cast', src: p.id, ability: ab.id, slot, aim: { x: q2(r.aim.x), y: q2(r.aim.y), z: q2(r.aim.z) }, dir: { x: q2(r.dir.x), z: q2(r.dir.z) }, target: target?.id ?? null, castTime: 0, element: ab.element ?? null, shape: ab.shape, radius: ab.radius ?? null, speed: ab.speed ?? (ab.shape === 'projectile' ? 34 : null) }, p.x, p.z);
    }
    p.youDirty = true;
  }

  finishCast(p) {
    const c = p.casting; p.casting = null;
    const target = c.target ? this.ents.get(c.target) : null;
    const r = resolveAbility(this, p, c.ab, c.slot, c.aim, c.dir, target && target.alive ? target : null);
    p.anim = 'attack';
    // release event (castTime 0) so clients can fire the effect
    this.ev({ type: 'cast', src: p.id, ability: c.ab.id, slot: c.slot, aim: { x: q2(r.aim.x), y: q2(r.aim.y), z: q2(r.aim.z) }, dir: { x: q2(r.dir.x), z: q2(r.dir.z) }, target: c.target, castTime: 0, release: true, element: c.ab.element ?? null, shape: c.ab.shape, radius: c.ab.radius ?? null, speed: c.ab.speed ?? null }, p.x, p.z);
    p.youDirty = true;
  }

  onChat(p, msg) {
    const text = sanitizeText(msg.text, 200);
    if (!text) return;
    if (!p.bot) {
      p.chatTokens = Math.min(5, p.chatTokens + (this.t - p.chatT) / 2000);
      p.chatT = this.t;
      if (p.chatTokens < 1) { this.sysTo(p, 'You are sending messages too quickly.'); return; }
      p.chatTokens -= 1;
    }
    if (text[0] === '/') return this.command(p, text);
    if ((msg.channel === 'party' || msg.channel === 'whisper') && socialChat(this, p, text, msg.channel, typeof msg.to === 'string' ? msg.to.slice(0, 48) : null)) return;
    const channel = ['say', 'world', 'oath'].includes(msg.channel) ? msg.channel : 'say';
    this.chat(p, text, channel);
  }

  chat(p, text, channel) {
    const e = { type: 'chat', from: p.id, name: p.name, text, channel, oath: p.oath };
    if (channel === 'world') this.ev(e, 0, 0, true);
    else if (channel === 'oath') { for (const q of this.players.values()) if (q.oath === p.oath) this.evTo(q, e); }
    else this.pgrid.forEachNear(p.x, p.z, SAY_RADIUS, (q) => { if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= SAY_RADIUS * SAY_RADIUS) this.evTo(q, e); });
  }

  command(p, text) {
    const [cmd] = text.slice(1).split(' ');
    if (cmd === 'who') {
      const humans = [...this.players.values()].filter((q) => !q.bot).length;
      this.sysTo(p, `${humans} Oathbound online, ${this.players.size - humans} adventurers abroad.`);
    } else if (cmd === 'where') {
      const o = OATH_BY_ID[this.regionOf(p.x, p.z)];
      const s = this.sanctuaries[o.index - 1];
      this.sysTo(p, `${o.name} - ${Math.round(Math.hypot(p.x - s.center[0], p.z - s.center[1]))} m from the sanctuary (creatures ~level ${levelForDistance(Math.hypot(p.x - s.center[0], p.z - s.center[1]))}). [${Math.round(p.x)}, ${Math.round(p.z)}]`);
    } else if (cmd === 'stuck') {
      if (p.combatUntil > this.t) return this.sysTo(p, 'Not while in combat.');
      this.respawn(p, true);
    } else if (cmd === 'events') {
      const ev = activeEvents(this);
      this.sysTo(p, ev.length ? ev.map((e) => `${e.kind} in ${OATH_BY_ID[e.region].name}`).join('; ') : 'The world is quiet.');
    } else if (SOCIAL_CMDS[cmd]) {
      const rest = text.slice(cmd.length + 2).trim();
      const [kind, op, needs] = SOCIAL_CMDS[cmd];
      if (kind === 'pvp') return handleSocial(this, p, { t: 'pvp', on: rest ? /^(on|1|yes|true)$/i.test(rest) : !p.pvp });
      if (kind === 'chat') {
        if (op === 'party') return socialChat(this, p, rest, 'party');
        const m = rest.match(/^"([^"]+)"\s+(.+)$/) || rest.match(/^(\S+)\s+(.+)$/);
        if (!m) return this.sysTo(p, 'Usage: /w <name> <message>');
        return socialChat(this, p, m[2], 'whisper', m[1]);
      }
      if (needs && !rest) return this.sysTo(p, `Usage: /${cmd} <name>`);
      return handleSocial(this, p, { t: kind, op, target: rest || undefined });
    } else this.sysTo(p, 'Commands: /who /where /stuck /events /invite /leave /kick /lead /disband /duel /forfeit /trade /pvp /p /w');
  }

  nearNpc(p, id) {
    const n = this.ents.get(String(id));
    if (!n || n.k !== 'n') return null;
    if ((n.x - p.x) ** 2 + (n.z - p.z) ** 2 > INTERACT_RADIUS * INTERACT_RADIUS) return null;
    return n;
  }

  onInteract(p, msg) {
    if (!p.alive) return;
    const id = String(msg.id ?? '');
    if (msg.option != null && msg.option !== '') return this.onDialog(p, { npc: id, option: msg.option }); // {t:'interact', id, option} form
    if (id.startsWith('shrine:')) {
      const s = this.sanctuaries.find((x) => x.oathId === id.slice(7));
      if (s && (s.shrine.x - p.x) ** 2 + (s.shrine.z - p.z) ** 2 < (SHRINE_DISCOVER_RADIUS + 4) ** 2) {
        this.discover(p, s.oathId);
        heal(this, p, p, p.mhp); p.mp = p.mmp; p.youDirty = true;
      }
      return;
    }
    const n = this.nearNpc(p, id);
    if (!n) return this.sysTo(p, 'Too far away.');
    onTalk(this, p, n);
    this.dialog(p, n, null);
  }

  dialog(p, n, result) {
    const o = OATH_BY_ID[n.oath];
    let text = result ?? NPC_TEXT[n.role](o, n.name, CLASSES[p.cls].label.toLowerCase());
    const options = [];
    switch (n.role) {
      case 'oathkeeper': options.push({ id: 'lore', label: 'Tell me of the Oath' }); break;
      case 'quartermaster':
        options.push({ id: 'buy-potion', label: `Buy ${CONSUMABLES.potion.name} (${CONSUMABLES.potion.price}g)` }, { id: 'buy-ether', label: `Buy ${CONSUMABLES.ether.name} (${CONSUMABLES.ether.price}g)` }, { id: 'sell', label: 'Sell unequipped common gear & materials' });
        if (!result) text += ` You carry ${p.gold} gold.`;
        break;
      case 'trainer': options.push({ id: 'rest', label: 'Rest and recover' }, { id: 'abilities', label: 'Review my abilities' }); break;
      case 'warden': {
        const b = p.quests.get(`bounty-${n.oath}`);
        if (b && !result) text += ` Your bounty: ${b.progress}/${b.goal}.`;
        if (!b) options.push({ id: 'bounty', label: 'Take a bounty' });
        break;
      }
      case 'chronicler': options.push({ id: 'where', label: 'Where should I hunt?' }, { id: 'events', label: 'What stirs in the world?' }); break;
      case 'artisan': {
        const w = p.equipment.weapon;
        if (w) options.push({ id: 'temper', label: `Temper ${w.name} (${this.temperCost(w)}g)` });
        options.push({ id: 'salvage', label: 'Trade materials for coin' });
        break;
      }
    }
    options.push({ id: 'bye', label: 'Farewell' });
    this.evTo(p, { type: 'npc', id: p.id, npc: n.id, name: n.name, role: n.role, text, options });
  }

  temperCost(w) { return 20 + w.lvl * 12; }

  onDialog(p, msg) {
    const n = this.nearNpc(p, msg.npc);
    if (!n) return;
    const opt = String(msg.option ?? '');
    const o = OATH_BY_ID[n.oath];
    let r = null;
    switch (opt) {
      case 'bye': return;
      case 'lore': r = `"${o.name} keeps the ${o.elementLabel.toLowerCase()} covenant. ${o.architecture}. We build with ${o.materials.join(', ')} - and we answer for what we build."`; break;
      case 'buy-potion': case 'buy-ether': {
        if (n.role !== 'quartermaster') return;
        const key = opt.slice(4); const c = CONSUMABLES[key];
        if (p.gold < c.price) r = '"Come back with more coin."';
        else if (this.giveItem(p, makeConsumable(this.rng, key, 1))) { p.gold -= c.price; r = `"One ${c.name}. Stay alive out there."`; }
        break;
      }
      case 'sell': {
        if (n.role !== 'quartermaster') return;
        let total = 0;
        p.inventory = p.inventory.filter((it) => {
          if ((it.kind === 'gear' && (it.rarity === 'common' || it.rarity === 'uncommon')) || it.kind === 'material') { total += (it.value ?? 1) * (it.qty ?? 1); return false; }
          return true;
        });
        p.gold += total; r = total ? `"I'll give you ${total} gold for the lot."` : '"Nothing I need today."';
        break;
      }
      case 'rest':
        if (n.role !== 'trainer') return;
        if (p.combatUntil > this.t) r = '"Catch your breath first - you are still in the fight."';
        else { heal(this, p, p, p.mhp); p.mp = p.mmp; clearStatuses(p); r = '"There. Steady hands, clear mind."'; }
        break;
      case 'abilities':
        r = p.hotbar.map((a, i) => `${i === 0 ? 'Basic' : i === 5 ? 'Ultimate' : `Slot ${i}`}: ${a.name} (${a.shape}${a.element ? `, ${a.element}` : ''})`).join(' | ');
        break;
      case 'bounty': {
        if (n.role !== 'warden') return;
        const q = addQuest(this, p, makeBounty(this, p, n.oath));
        r = q ? `"${q.text}"` : '"Finish the bounty you already hold."';
        break;
      }
      case 'where': {
        const camps = this.camps.filter((c) => Math.abs(c.level - p.lvl) <= 2);
        let best = null, bd = Infinity;
        for (const c of camps) { const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; best = c; } }
        if (best) {
          const ang = Math.atan2(best.x - p.x, best.z - p.z) * 180 / Math.PI;
          const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
          r = `"Creatures fit for your level gather ${Math.round(Math.sqrt(bd))} m to the ${dirs[Math.round(((ang + 360) % 360) / 45) % 8]}, in ${OATH_BY_ID[best.oath].name}."`;
        } else r = '"I have no record of anything suitable nearby."';
        break;
      }
      case 'events': { const ev = activeEvents(this); r = ev.length ? `"${ev.map((e) => `A ${e.kind === 'worldboss' ? 'herald walks' : e.kind} in ${OATH_BY_ID[e.region].name}`).join('. ')}."` : '"The ledgers are quiet - for now."'; break; }
      case 'temper': {
        if (n.role !== 'artisan') return;
        const w = p.equipment.weapon; if (!w) return;
        const cost = this.temperCost(w);
        if (w.lvl >= MAX_LEVEL + 5) r = '"It can take no more tempering."';
        else if (p.gold < cost) r = `"Tempering costs ${cost} gold."`;
        else { p.gold -= cost; w.lvl++; for (const k in w.stats) w.stats[k] = Math.round(w.stats[k] * 1.08 + 1); computeStats(p); r = `"Done. ${w.name} is stronger now."`; }
        break;
      }
      case 'salvage': {
        if (n.role !== 'artisan') return;
        let total = 0;
        p.inventory = p.inventory.filter((it) => { if (it.kind === 'material') { total += 4 * it.qty; return false; } return true; });
        p.gold += total; r = total ? `"${total} gold for your materials."` : '"You have no materials."';
        break;
      }
      default: return;
    }
    p.youDirty = true; p.saveDirty = true;
    this.dialog(p, n, r);
  }

  discover(p, oathId) {
    if (p.discovered.has(oathId)) return;
    p.discovered.add(oathId);
    this.evTo(p, { type: 'discover', id: p.id, shrine: oathId });
    if (!p.bot) this.sysTo(p, `Shrine attuned: ${OATH_BY_ID[oathId].name}. Fast travel unlocked.`);
    onDiscover(this, p, oathId);
    this.giveXp(p, 40 + p.lvl * 10);
    p.youDirty = true; p.saveDirty = true;
  }

  onTravel(p, msg) {
    const id = String(msg.shrine ?? '');
    if (!p.alive || !p.discovered.has(id)) return this.sysTo(p, 'You have not attuned to that shrine.');
    if (p.combatUntil > this.t) return this.sysTo(p, 'You cannot travel while in combat.');
    if (this.t < p.travelAt) return this.sysTo(p, 'The shrine is still recovering.');
    p.travelAt = this.t + 5000;
    if (p.casting) this.interrupt(p, 'travel');
    const s = this.sanctuaries[OATH_BY_ID[id].index - 1];
    this.place(p, s.spawn.x + (this.rng() - 0.5) * 6, s.spawn.z + (this.rng() - 0.5) * 4, 'travel');
  }

  place(p, x, z, reason) {
    p.x = x; p.z = z; p.y = this.groundY(x, z); p.hx = NaN;
    p.budget = this.maxSpeed(p) * 1.2; p.budgetT = this.t; p.corrGrace = this.t + 600;
    this.grid.move(p); this.pgrid.move(p);
    this.ev({ type: 'teleport', id: p.id, x: q2(p.x), y: q2(p.y), z: q2(p.z), ry: q2(p.ry), reason }, p.x, p.z);
    if (p.k === 'p') updatePvpZone(this, p);
    if (p.pets) for (const pet of p.pets) if (this.ents.has(pet.id)) { pet.x = x + 1.5; pet.z = z; pet.y = p.y; this.grid.move(pet); }
    p.youDirty = true;
  }

  respawn(p, stuck = false) {
    let best = null, bd = Infinity;
    for (const id of p.discovered) {
      const s = this.sanctuaries[OATH_BY_ID[id].index - 1];
      const d = (s.center[0] - p.x) ** 2 + (s.center[1] - p.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    best = best ?? this.sanctuaries[OATH_BY_ID[p.oath].index - 1];
    if (!p.alive) {
      p.alive = true; p.hp = Math.round(p.mhp * 0.6); p.mp = Math.round(p.mmp * 0.6); p.anim = 'idle';
      clearStatuses(p); applyStatus(this, p, 'invuln', 3, 1, p); p.invuln = true; p.invulnUntil = this.t + 3000;
    }
    p.casting = null;
    this.place(p, best.spawn.x + (this.rng() - 0.5) * 8, best.spawn.z + (this.rng() - 0.5) * 6, stuck ? 'stuck' : 'respawn');
  }

  equip(p, itemId) {
    const i = p.inventory.findIndex((it) => it.id === itemId);
    if (i < 0) return;
    const it = p.inventory[i];
    if (it.kind !== 'gear') return;
    if (it.lvl > p.lvl + 2) return this.sysTo(p, `Requires level ${it.lvl - 2}.`);
    p.inventory.splice(i, 1);
    const prev = p.equipment[it.slot];
    p.equipment[it.slot] = it;
    if (prev) p.inventory.push(prev);
    computeStats(p);
    p.youDirty = true; p.saveDirty = true;
  }

  unequip(p, slot) {
    const it = p.equipment[slot];
    if (!it || p.inventory.length >= 40) return;
    delete p.equipment[slot];
    p.inventory.push(it);
    computeStats(p);
    p.youDirty = true; p.saveDirty = true;
  }

  useItem(p, itemId) {
    const it = p.inventory.find((x) => x.id === itemId);
    if (!it || it.kind !== 'consumable' || !p.alive) return;
    if (this.t < p.potionCd) return this.fail(p, -1, 'cooldown');
    const c = CONSUMABLES[it.key];
    p.potionCd = this.t + c.cd * 1000;
    if (c.heal) heal(this, p, p, p.mhp * c.heal);
    if (c.mana) p.mp = Math.min(p.mmp, p.mp + p.mmp * c.mana);
    if (--it.qty <= 0) p.inventory.splice(p.inventory.indexOf(it), 1);
    this.ev({ type: 'cast', src: p.id, ability: `item/${it.key}`, slot: -1, aim: { x: q2(p.x), y: q2(p.y), z: q2(p.z) }, dir: { x: 0, z: 1 }, castTime: 0 }, p.x, p.z);
    p.youDirty = true; p.saveDirty = true;
  }

  // ---------- combat hooks used by combat.js / mobs.js ----------
  duelDefeat(loser, winner) { duelDefeat(this, loser, winner); }

  onMobDamaged(m, src) {
    if (m.k !== 'm' || m.own || !m.alive) return;
    if (m.state === 'idle') engage(this, m, src);
  }

  pushEnt(e, dx, dz) {
    e.x += dx; e.z += dz; e.y = this.groundY(e.x, e.z);
    this.grid.move(e);
  }

  spawnPet(owner, ab, dir) { return spawnPet(this, owner, ab, dir); }

  despawnMob(m) {
    m.alive = false; m.respawnAt = 0;
    this.grid.remove(m); this.ents.delete(m.id); this.statused.delete(m);
    const i = this.mobs.indexOf(m); if (i >= 0) this.mobs.splice(i, 1);
  }

  respawnMob(m) {
    if (m.camp) m.camp.cleared = false;
    const h = m.home;
    m.x = h.x; m.z = h.z; m.y = this.groundY(h.x, h.z);
    m.alive = true; m.hp = m.mhp; m.state = 'idle'; m.anim = 'idle'; m.tgt = null; m.phase = 0; m.pow = 1; m.invuln = false;
    m.respawnAt = 0; m.threat.clear(); m.credit.clear(); m.casting = null;
    clearStatuses(m);
    this.ents.set(m.id, m);
    this.grid.insert(m);
  }

  kill(dst, src) {
    if (!dst.alive) return;
    dst.alive = false; dst.hp = 0; dst.anim = 'dead'; dst.casting = null;
    clearStatuses(dst);
    const credit = src && src.own ? this.ents.get(src.own) : src;
    this.ev({ type: 'death', id: dst.id, killer: credit?.id ?? src?.id ?? null }, dst.x, dst.z);
    if (dst.k === 'p') {
      this.stats.deaths++;
      if (isPvp(credit, dst)) onPvpKill(this, credit, dst); // honor + kill credit; no item loss, normal shrine respawn
      dst.deadAt = this.t; dst.tgt = null;
      for (const pet of dst.pets ?? []) if (this.ents.has(pet.id)) this.despawnMob(pet);
      if (!dst.bot) this.sysTo(dst, `You were slain${src ? ` by ${src.name}` : ''}. Respawn at your nearest attuned shrine.`);
      dst.youDirty = true;
      return;
    }
    // mob death
    this.stats.kills++;
    if (dst.role === 'boss') for (const add of [...this.mobs]) if (add.encounterOwner === dst.id) this.despawnMob(add);
    dst.state = 'dead'; dst.tgt = null;
    if (dst.own) { this.despawnMob(dst); return; }
    const contributors = [];
    for (const [pid] of dst.credit) {
      const p = this.players.get(pid);
      if (p && (p.x - dst.x) ** 2 + (p.z - dst.z) ** 2 < 110 * 110) contributors.push(p);
    }
    if (credit && credit.k === 'p' && !contributors.includes(credit)) contributors.push(credit);
    const recipients = rewardRecipients(this, contributors, dst); // + party members in range share XP, loot rolls and quest credit
    const n = recipients.length;
    const xpMul = { common: 1, veteran: 1.8, elite: 4, boss: 30 }[dst.role] ?? 1;
    const baseXp = (18 + 9 * dst.lvl) * xpMul * (dst.temp ? 0.5 : 1);
    for (const p of recipients) {
      const diff = dst.lvl - p.lvl;
      const f = diff < -7 ? 0.05 : clamp(1 + 0.1 * diff, 0.2, 1.5);
      this.giveXp(p, (baseXp * f * (1 + 0.2 * (n - 1))) / n);
      const loot = rollLoot(this.rng, dst, p);
      p.gold += loot.gold;
      const got = loot.items.filter((it) => addItem(p, it));
      this.evTo(p, { type: 'loot', id: p.id, src: dst.id, gold: loot.gold, items: got.map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, qty: i.qty })) });
      if (dst.role === 'boss' && !p.bot) this.system(`${p.name} helped defeat ${dst.name}!`, dst.x, dst.z, 600);
      onKill(this, p, dst);
      p.youDirty = true; p.saveDirty = true;
    }
    // One reward per complete camp cycle. Any respawn re-arms the objective.
    const camp = dst.camp;
    if (camp && !camp.cleared && camp.mobs.every((m) => !m.alive)) {
      camp.cleared = true;
      for (const p of recipients) {
        if (!p.alive || p.lvl > camp.level + 7) continue;
        const gold = 8 + camp.level * 2;
        p.gold += gold;
        this.giveXp(p, (24 + camp.level * 12) / Math.max(1, recipients.length));
        this.evTo(p, { type: 'loot', id: p.id, gold, items: [] });
        this.sysTo(p, `Camp secured! +${gold} gold. The road is safe until its defenders return.`);
        p.youDirty = true; p.saveDirty = true;
      }
    }
    dst.threat.clear(); dst.credit.clear();
    if (dst.respawnMs > 0) dst.respawnAt = this.t + dst.respawnMs * (0.85 + this.rng() * 0.3);
    dst.corpseUntil = this.t + 6000;
    this.corpses.push(dst);
  }

  // ---------- snapshots (delta encoded per client) ----------
  prep(e, ph) {
    if (!e._ph) e._ph = [null, null, null, null];
    const pl = e.k === 'p';
    let st = e._ph[ph];
    if (!st) st = e._ph[ph] = { stamp: -1, ver: 0, x: 0, y: 0, z: 0, ry: 0, anim: '', hp: 0, mhp: 0, lvl: 0, tgt: null, fx: -1, diff: null, full: null, fullVer: -1, dyn: null, dynVer: -1 };
    if (st.stamp === this.tickN) return st;
    st.stamp = this.tickN;
    const x = q2(e.x), y = q2(e.y), z = q2(e.z), ry = q2(e.ry), hp = Math.ceil(e.hp), tgt = e.tgt ?? null;
    if (st.ver === 0) {
      st.x = x; st.y = y; st.z = z; st.ry = ry; st.anim = e.anim; st.hp = hp; st.mhp = e.mhp; st.lvl = e.lvl; st.tgt = tgt; st.fx = e.fxVer; st.ver = 1;
      if (pl) { st.pvp = e.pvpEff; st.party = e.party; st.duel = e.duel; }
      return st;
    }
    let d = null;
    if (st.x !== x) { (d ??= { id: e.id }).x = x; st.x = x; }
    if (st.y !== y) { (d ??= { id: e.id }).y = y; st.y = y; }
    if (st.z !== z) { (d ??= { id: e.id }).z = z; st.z = z; }
    if (st.ry !== ry) { (d ??= { id: e.id }).ry = ry; st.ry = ry; }
    if (st.anim !== e.anim) { (d ??= { id: e.id }).anim = e.anim; st.anim = e.anim; }
    if (st.hp !== hp) { (d ??= { id: e.id }).hp = hp; st.hp = hp; }
    if (st.mhp !== e.mhp) { (d ??= { id: e.id }).mhp = e.mhp; st.mhp = e.mhp; }
    if (st.lvl !== e.lvl) { (d ??= { id: e.id }).lvl = e.lvl; st.lvl = e.lvl; }
    if (st.tgt !== tgt) { (d ??= { id: e.id }).tgt = tgt; st.tgt = tgt; }
    if (st.fx !== e.fxVer) { (d ??= { id: e.id }).fx = e.st.map((s) => s.id); st.fx = e.fxVer; }
    if (pl) {
      if (st.pvp !== e.pvpEff) { (d ??= { id: e.id }).pvp = e.pvpEff; st.pvp = e.pvpEff; }
      if (st.party !== e.party) { (d ??= { id: e.id }).party = e.party; st.party = e.party; }
      if (st.duel !== e.duel) { (d ??= { id: e.id }).duel = e.duel; st.duel = e.duel; }
    }
    if (d) { st.ver++; st.diff = d; }
    return st;
  }

  fullState(e, st) {
    if (st.fullVer === st.ver) return st.full;
    const f = { id: e.id, k: e.k, name: e.name, model: e.model, lvl: e.lvl, x: st.x, y: st.y, z: st.z, ry: st.ry, anim: st.anim, hp: st.hp, mhp: st.mhp, tgt: st.tgt, fx: e.st.map((s) => s.id) };
    if (e.oath) f.oath = e.oath;
    if (e.cls) f.cls = e.cls;
    if (e.k !== 'p') f.role = e.role;
    if (e.element && e.k === 'm') f.el = e.element;
    if (e.own) f.own = e.own;
    if (e.def?.scale || e.worldBoss) f.scale = (e.def?.scale ?? 1) * (e.worldBoss ? 1.6 : 1);
    if (e.k === 'p') { if (st.pvp) f.pvp = st.pvp; if (st.party) f.party = st.party; if (st.duel) f.duel = st.duel; }
    st.full = f; st.fullVer = st.ver;
    return f;
  }

  dynState(e, st) {
    if (st.dynVer === st.ver) return st.dyn;
    st.dyn = { id: e.id, x: st.x, y: st.y, z: st.z, ry: st.ry, anim: st.anim, hp: st.hp, mhp: st.mhp, lvl: st.lvl, tgt: st.tgt, fx: e.st.map((s) => s.id) };
    if (e.k === 'p') { st.dyn.pvp = st.pvp ?? 0; st.dyn.party = st.party ?? null; st.dyn.duel = st.duel ?? null; }
    st.dynVer = st.ver;
    return st.dyn;
  }

  snapshotFor(p) {
    const mark = ++this.markN;
    const ph = p.phase;
    const ents = [];
    const px = p.x, pz = p.z;
    const known = p.known; // Map<entity object, version last sent to this client>
    const knownBefore = known.size;
    let seen = 0;
    // inlined grid walk (hot path: ~150 players per tick x ~200 entities each)
    const g = this.grid, inv = g.inv, cells = g.cells, R = INTEREST_RADIUS;
    const x0 = Math.floor((px - R) * inv), x1 = Math.floor((px + R) * inv);
    const z0 = Math.floor((pz - R) * inv), z1 = Math.floor((pz + R) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = cells.get(((cx + 2048) << 12) | (cz + 2048));
        if (arr === undefined) continue;
        for (let i = 0, n = arr.length; i < n; i++) {
          const e = arr[i];
          const dx = e.x - px, dz = e.z - pz;
          if (dx * dx + dz * dz > R2) continue;
          e._mark = mark;
          const st = this.prep(e, ph);
          const kv = known.get(e);
          if (kv === undefined) { ents.push(this.fullState(e, st)); known.set(e, st.ver); continue; }
          seen++;
          if (kv !== st.ver) { ents.push(kv === st.ver - 1 ? st.diff : this.dynState(e, st)); known.set(e, st.ver); }
        }
      }
    }
    let gone = EMPTY;
    if (seen !== knownBefore) {
      for (const e of known.keys()) {
        if (e._mark !== mark) { if (gone === EMPTY) gone = []; gone.push(e.id); known.delete(e); }
      }
    }
    return { t: 'snap', time: this.serverTime(), timeOfDay: this.timeOfDay(), ents, gone };
  }

  // ---------- main loop ----------
  tick(dt = 1 / TICK_HZ) {
    const t0 = now();
    const dtMs = dt * 1000;
    this.t += dtMs;
    this.tickN++;

    processDelayed(this);
    tickStatuses(this);

    const regenTick = this.tickN % TICK_HZ;
    for (const p of this.players.values()) {
      if (p.invuln && this.t >= p.invulnUntil) p.invuln = false;
      if (p.alive) {
        if (p.casting && this.t >= p.casting.until) this.finishCast(p);
        if (p.casting && isStunned(p)) this.interrupt(p, 'stunned');
        if ((p.idn % TICK_HZ) === regenTick) {
          const ooc = p.combatUntil <= this.t;
          const hpR = p.mhp * (ooc ? 0.05 : 0.006), mpR = p.mmp * (ooc ? 0.06 : 0.02);
          if (p.hp < p.mhp) { p.hp = Math.min(p.mhp, p.hp + hpR); }
          if (p.mp < p.mmp) { p.mp = Math.min(p.mmp, p.mp + mpR); p.youDirty = true; }
          // shrine discovery
          for (const s of this.sanctuaries) {
            if (!p.discovered.has(s.oathId) && (s.shrine.x - p.x) ** 2 + (s.shrine.z - p.z) ** 2 < SHRINE_DISCOVER_RADIUS ** 2) this.discover(p, s.oathId);
          }
        }
        if (p.bot) thinkBot(this, p, dt);
      } else if (p.bot) thinkBot(this, p, dt);
      else if (this.t - p.deadAt > 60000) this.respawn(p);
    }

    for (let i = 0; i < this.mobs.length; i++) thinkMob(this, this.mobs[i], dt);
    // corpses vanish from interest after a few seconds (clients get them in `gone`)
    if (this.corpses.length) {
      for (let i = this.corpses.length - 1; i >= 0; i--) {
        const m = this.corpses[i];
        if (m.alive) { this.corpses.splice(i, 1); continue; }
        if (this.t >= m.corpseUntil) {
          this.corpses.splice(i, 1);
          if (m.respawnMs > 0 && !m.temp) { this.grid.remove(m); this.ents.delete(m.id); this.statused.delete(m); }
          else this.despawnMob(m);
        }
      }
    }

    tickEvents(this);
    tickSocial(this);
    if (this.t >= this.nextBotCheck) this.balanceBots();

    // snapshots: players are split into phases so each gets SNAP_HZ while load is spread over ticks
    const phase = this.tickN % SNAP_EVERY;
    for (const p of this.players.values()) {
      if (p.bot) continue;
      if (p.phase === phase) this.out.push({ to: p.id, msg: this.snapshotFor(p) });
      if (p.youDirty && this.t - p.youAt >= 250) { p.youDirty = false; p.youAt = this.t; this.out.push({ to: p.id, msg: { t: 'you', you: this.youState(p, true) } }); }
    }
    this.flushEvents();

    // periodic saves, spread over a 60 s window (each player saves on its own tick slot)
    const slot = this.tickN % (TICK_HZ * 60);
    for (const p of this.players.values()) if (p.saveDirty && !p.bot && (p.idn % (TICK_HZ * 60)) === slot) this.persist(p);

    const out = this.out;
    this.out = [];
    this.tickTimes.push(now() - t0);
    return out;
  }

  balanceBots() {
    this.nextBotCheck = this.t + 2000;
    const humans = [];
    let bots = 0;
    for (const p of this.players.values()) { if (p.bot) bots++; else humans.push(p); }
    const want = Math.max(0, this.botTarget - humans.length);
    if (bots < want) {
      const n = Math.min(want - bots, bots < 6 ? 6 : 2);
      for (let i = 0; i < n; i++) {
        const near = humans.length ? this.rng.pick(humans) : null;
        spawnBot(this, near ? this.regionOf(near.x, near.z) : null);
      }
    } else if (bots > want) {
      for (const p of this.players.values()) if (p.bot && p.combatUntil < this.t) { this.removePlayer(p.id); break; }
    }
  }

  statsSnapshot() {
    let bots = 0, humans = 0, mobsAlive = 0, awake = 0;
    for (const p of this.players.values()) p.bot ? bots++ : humans++;
    for (const m of this.mobs) { if (m.alive && !m.own) { mobsAlive++; if (m.awake || m.state !== 'idle') awake++; } }
    return {
      players: humans, bots, mobs: mobsAlive, mobsAwake: awake, mobsTotal: this.mobs.length, npcs: this.npcs.length, entities: this.ents.size,
      tick: this.tickN, simTime: Math.round(this.t),
      tickMs: { p50: +this.tickTimes.pct(0.5).toFixed(3), p99: +this.tickTimes.pct(0.99).toFixed(3), max: +this.tickTimes.max().toFixed(3), avg: +this.tickTimes.avg().toFixed(3) },
      events: activeEvents(this), counters: { ...this.stats },
    };
  }
}

export function createSim(opts = {}) {
  const S = new Sim(opts);
  return {
    addPlayer: (id, hello, saved) => S.addPlayer(id, hello, saved),
    removePlayer: (id) => S.removePlayer(id),
    disconnected: (id) => { const p = S.players.get(id); if (p) onDisconnect(S, p); },
    resume: (id) => S.resume(id),
    hasPlayer: (id) => S.players.has(id),
    handle: (id, msg) => S.handle(id, msg),
    tick: (dt) => S.tick(dt),
    stats: () => S.statsSnapshot(),
    serialize: (id) => { const p = S.players.get(id); return p ? S.serialize(p) : null; },
    saveAll: () => { for (const p of S.players.values()) S.persist(p); },
    setBots: (n) => { S.botTarget = Math.max(0, n | 0); S.nextBotCheck = 0; },
    startEvent: (kind, region) => startEvent(S, kind, region),
    serverTime: () => S.serverTime(),
    _S: S, // internals for tests / debugging
  };
}

export { TICK_HZ, SNAP_HZ, INTEREST_RADIUS };
export { dealDamage, hasStatus, OATHS };
