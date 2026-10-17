// Dynamic world events: regional storms, meteor showers, a roaming world boss, and canon
// "surge" events (WORLD_EVENT_REGISTRY: contain an eruption, restore a relay link, ...).
// Announced with `system` events and described for clients with `world` events.
import { OATHS, OATH_BY_ID } from '../oaths.js';
import { CREATURES } from '../creatures.js';
import { CANON_EVENTS, WARDS } from './data.js';
import { createMob, engage } from './mobs.js';
import { schedule } from './combat.js';
import { levelForDistance, SAFE_RADIUS } from './world.js';

const KINDS = ['storm', 'meteors', 'worldboss', 'surge'];

export function initEvents(S, opts) {
  S.world = {
    active: [], // {kind, region, until, ...}
    nextAt: S.t + (opts.firstEventMs ?? 90000),
    interval: opts.eventIntervalMs ?? [300000, 480000],
  };
}

function pickRegion(S) {
  // prefer regions with players so events are seen
  const humans = [...S.players.values()].filter((p) => !p.bot);
  if (humans.length && S.rng() < 0.75) return S.regionOf(...(() => { const p = S.rng.pick(humans); return [p.x, p.z]; })());
  return S.rng.pick(OATHS).id;
}

export function startEvent(S, kind = S.rng.pick(KINDS), region = pickRegion(S)) {
  const o = OATH_BY_ID[region];
  const ev = { kind, region, start: S.t, id: S.nextId('w') };
  if (kind === 'storm') {
    ev.until = S.t + 180000;
    S.system(`A ${o.element === 'storm' ? 'relay' : 'violent'} storm gathers over ${o.name}.`);
  } else if (kind === 'meteors') {
    ev.until = S.t + 90000; ev.nextDrop = S.t + 3000;
    S.system(`Meteors streak across the sky above ${o.name}! Find cover or claim the fallen star-iron.`);
  } else if (kind === 'worldboss') {
    const s = S.sanctuaries[o.index - 1];
    const nb = OATH_BY_ID[S.rng.pick(s.neighbours)];
    const ax = o.center[0], az = o.center[1], bx = nb.center[0], bz = nb.center[1];
    const path = [];
    for (let i = 0; i <= 6; i++) {
      const f = 0.25 + (i / 6) * 0.5; // middle half of the road, away from both cities
      path.push({ x: ax + (bx - ax) * f + (S.rng() - 0.5) * 30, z: az + (bz - az) * f + (S.rng() - 0.5) * 30 });
    }
    const def = CREATURES.find((c) => c.oath === region && c.role === 'elite');
    const p0 = path[0];
    const boss = createMob(S, def.id, p0.x, p0.z, 22, {
      role: 'boss', name: `Herald of ${o.name}`, scale: 1.6, hpMul: 0.8,
      fields: { roam: { path: [...path, ...path.slice(1, -1).reverse()], i: 1 }, worldBoss: true, respawnMs: 0, temp: false, leash: 90 },
    });
    ev.mob = boss.id; ev.until = S.t + 900000;
    S.system(`The Herald of ${o.name} walks the road toward ${nb.name}. Oathbound, gather!`);
  } else if (kind === 'surge') {
    const camps = S.camps.filter((c) => c.oath === region && c.level <= 14);
    const c = camps.length ? S.rng.pick(camps) : S.camps.find((x) => x.oath === region);
    const roster = CREATURES.filter((x) => x.oath === region && (x.role === 'veteran' || x.role === 'elite'));
    ev.mobs = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const def = roster[i % 3 === 0 ? 1 : 0] ?? roster[0];
      const m = createMob(S, def.id, c.x + Math.cos(a) * 9, c.z + Math.sin(a) * 9, Math.max(3, c.level + 1), { fields: { temp: true, respawnMs: 0, surge: ev.id } });
      ev.mobs.push(m.id);
    }
    ev.x = c.x; ev.z = c.z; ev.until = S.t + 600000; ev.text = CANON_EVENTS[o.index - 1];
    S.system(`${o.name}: Oathbound are needed to ${ev.text} near ${WARDS[o.index - 1]}!`);
  }
  S.world.active.push(ev);
  S.ev({ type: 'world', kind, region, state: 'start', until: ev.until, x: ev.x ?? o.center[0], z: ev.z ?? o.center[1], text: ev.text ?? null }, 0, 0, true);
  return ev;
}

function endEvent(S, ev, success) {
  const o = OATH_BY_ID[ev.region];
  S.world.active.splice(S.world.active.indexOf(ev), 1);
  if (ev.kind === 'worldboss') {
    const m = S.ents.get(ev.mob);
    if (m && m.alive) S.despawnMob(m);
    S.system(success ? `The Herald of ${o.name} has fallen!` : `The Herald of ${o.name} vanishes into the haze.`);
  } else if (ev.kind === 'surge') {
    for (const id of ev.mobs) { const m = S.ents.get(id); if (m && m.alive) S.despawnMob(m); }
    if (success) {
      S.system(`${o.name} is secure: the Oathbound managed to ${ev.text}.`);
      S.pgrid.forEachNear(ev.x, ev.z, 120, (p) => { if (p.alive) { p.gold += 40 + p.lvl * 5; S.giveXp(p, 60 + p.lvl * 25); S.evTo(p, { type: 'loot', id: p.id, gold: 40 + p.lvl * 5, items: [] }); } });
    } else S.system(`The surge near ${WARDS[o.index - 1]} subsides.`);
  } else S.system(`The ${ev.kind === 'storm' ? 'storm' : 'meteor shower'} over ${o.name} passes.`);
  S.ev({ type: 'world', kind: ev.kind, region: ev.region, state: 'end', success: !!success }, 0, 0, true);
}

export function tickEvents(S) {
  const W = S.world;
  if (S.t >= W.nextAt) {
    W.nextAt = S.t + W.interval[0] + S.rng() * (W.interval[1] - W.interval[0]);
    if (W.active.length < 2) startEvent(S);
  }
  for (const ev of [...W.active]) {
    if (ev.kind === 'meteors' && S.t >= ev.nextDrop) {
      ev.nextDrop = S.t + 1800 + S.rng() * 1500;
      const o = OATH_BY_ID[ev.region];
      const near = [];
      S.pgrid.forEachNear(o.center[0], o.center[1], 700, (p) => { if (p.alive && !S.inSafe(p.x, p.z)) near.push(p); });
      let x, z;
      if (near.length && S.rng() < 0.7) { const p = S.rng.pick(near); x = p.x + (S.rng() - 0.5) * 30; z = p.z + (S.rng() - 0.5) * 30; }
      else { const a = S.rng() * Math.PI * 2, d = SAFE_RADIUS + 30 + S.rng() * 450; x = o.center[0] + Math.cos(a) * d; z = o.center[1] + Math.sin(a) * d; }
      if (S.inSafe(x, z)) continue;
      const lvl = levelForDistance(Math.hypot(x - o.center[0], z - o.center[1]));
      const r = 6;
      S.ev({ type: 'cast', src: null, ability: 'world/meteor', slot: -1, aim: { x, y: S.groundY(x, z), z }, dir: { x: 0, z: 1 }, castTime: 2, radius: r, shape: 'zone', element: 'cosmic', telegraph: true }, x, z);
      schedule(S, 2, { kind: 'area', src: null, world: true, x, z, r, amount: 25 + lvl * 7, element: 'cosmic', ability: 'world/meteor', max: 20, opts: { noCrit: true } });
    }
    if (ev.kind === 'worldboss') {
      const m = S.ents.get(ev.mob);
      if (!m || !m.alive) { endEvent(S, ev, true); continue; }
    }
    if (ev.kind === 'surge' && ev.mobs.every((id) => !S.ents.get(id)?.alive)) { endEvent(S, ev, true); continue; }
    if (S.t >= ev.until) endEvent(S, ev, false);
  }
}

export const activeEvents = (S) => S.world.active.map((e) => ({ kind: e.kind, region: e.region, until: e.until, text: e.text ?? null }));
export { engage };
