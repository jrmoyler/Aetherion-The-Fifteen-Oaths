// Quests: per-Oath starter chain + repeatable regional bounties.
// Titles follow AETHERION_CANON/06_NARRATIVE/QUEST_REGISTRY.json (initiation, regional arc,
// "An Open Road", civilian side story, "No Single Witness").
import { OATH_BY_ID, xpForLevel } from '../oaths.js';
import { CREATURES } from '../creatures.js';
import { OATH_LEADERS, OATH_CIVICS, SEATS, WARDS } from './data.js';
import { makeGear } from './items.js';

const roster = (oath, role) => CREATURES.find((c) => c.oath === oath && c.role === role);

/** Build the n-th step (1..8) of the starter chain for an Oath. */
export function chainStep(S, oath, n) {
  const o = OATH_BY_ID[oath];
  const i = o.index - 1;
  const leader = OATH_LEADERS[i];
  const sanct = S.sanctuaries[i];
  const nb = OATH_BY_ID[nearestNeighbour(S, sanct)];
  switch (n) {
    case 1: return { id: `chain-${oath}-1`, title: `The terms of ${o.name.toUpperCase()}`, text: `Speak with ${leader}, Oathkeeper of ${o.name}, on the sanctuary plaza.`, kind: 'talk', role: 'oathkeeper', oath, goal: 1, step: 1, reward: { xpf: 0.6, gold: 10 } };
    case 2: { const c = roster(oath, 'common'); return { id: `chain-${oath}-2`, title: `${SEATS[i]}: a covenant under review`, text: `Thin the creatures threatening the approaches beyond the city ring - ${c.name}s and worse.`, kind: 'kill', targets: CREATURES.filter((x) => x.oath === oath && x.role !== 'boss').map((x) => x.id), goal: 8, step: 2, reward: { xpf: 0.9, gold: 25 } }; }
    case 3: return { id: `chain-${oath}-3`, title: 'An Open Road', text: `Follow the road to ${nb.name} and attune to the shrine at its sanctuary.`, kind: 'discover', shrine: nb.id, goal: 1, step: 3, reward: { xpf: 1, gold: 40, item: 'uncommon' } };
    case 4: { const v = roster(oath, 'veteran'); return { id: `chain-${oath}-4`, title: `${OATH_CIVICS[i]}: the everyday covenant`, text: `${OATH_CIVICS[i]} asks you to defeat a ${v.name} preying on the roads of ${o.name}.`, kind: 'kill', targets: [v.id], goal: 1, step: 4, reward: { xpf: 1, gold: 50 } }; }
    case 5: return { id: `chain-${oath}-5`, title: 'No Single Witness', text: `Report back to ${leader} in ${o.name}.`, kind: 'talk', role: 'oathkeeper', oath, goal: 1, step: 5, reward: { xpf: 1.5, gold: 80, item: 'rare' } };
    case 6: { const e = roster(oath, 'elite'); return { id: `chain-${oath}-6`, title: 'Proof beyond the walls', text: `Defeat two ${e.name}s in ${o.name}. Prepare your equipment and recruit allies before entering the deep wilds.`, kind: 'kill', targets: [e.id], goal: 2, step: 6, reward: { xpf: 1.5, gold: 120, item: 'rare' } }; }
    case 7: { const b = roster(oath, 'boss'); return { id: `chain-${oath}-7`, title: 'The price of a covenant', text: `Confront ${b.name} at the regional lair. Watch its telegraphs, evade its strikes, and survive its changing phases.`, kind: 'kill', targets: [b.id], goal: 1, step: 7, reward: { xpf: 2, gold: 250, item: 'epic' } }; }
    case 8: return { id: `chain-${oath}-8`, title: 'A witness to the Fracture', text: `Return to ${leader}. Your victory has earned a place in the memory of ${o.name}.`, kind: 'talk', role: 'oathkeeper', oath, goal: 1, step: 8, reward: { xpf: 1, gold: 150 } };
    default: return null;
  }
}

function nearestNeighbour(S, sanct) {
  let best = sanct.neighbours[0], bd = Infinity;
  for (const id of sanct.neighbours) {
    const o = OATH_BY_ID[id];
    const d = Math.hypot(o.center[0] - sanct.center[0], o.center[1] - sanct.center[1]);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/** Navigation uses the actual simulation layout, never an estimated city centre. */
export function questWaypoint(S, p, q) {
  if (!S || q.done) return null;
  let point = null, label = '';
  if (q.kind === 'talk') {
    const sanctuary = S.sanctuaries.find((s) => s.oathId === q.oath);
    point = sanctuary?.npcs.find((n) => n.role === q.role);
    label = q.role === 'oathkeeper' ? OATH_LEADERS[(OATH_BY_ID[q.oath]?.index ?? 1) - 1] : q.role;
  } else if (q.kind === 'discover') {
    point = S.sanctuaries.find((s) => s.oathId === q.shrine)?.shrine;
    label = `${OATH_BY_ID[q.shrine]?.name ?? 'Covenant'} shrine`;
  } else if (q.kind === 'kill' || q.kind === 'bounty') {
    const targets = new Set(q.targets ?? []);
    point = S.lairs?.find((l) => targets.has(l.boss));
    if (point) label = CREATURES.find((c) => c.id === point.boss)?.name ?? 'Regional lair';
    else {
      const camps = (S.camps ?? []).filter((c) => c.members.some((id) => targets.has(id)));
      // Lead early players toward survivable encounters rather than a nearby high-level camp.
      const distance = (c) => Math.hypot(c.x - (p?.x ?? 0), c.z - (p?.z ?? 0));
      camps.sort((a, b) => Math.max(0, a.level - (p?.lvl ?? 1) - 1) - Math.max(0, b.level - (p?.lvl ?? 1) - 1) || distance(a) - distance(b));
      point = camps[0];
      label = point ? `${OATH_BY_ID[point.oath]?.name ?? 'Creature'} camp · level ${point.level}` : '';
    }
  }
  return point && Number.isFinite(point.x) && Number.isFinite(point.z) ? { x: point.x, z: point.z, label } : null;
}

export const questView = (q, S, p) => ({ id: q.id, title: q.title, text: q.text, progress: q.progress, goal: q.goal, done: !!q.done, kind: q.kind, waypoint: questWaypoint(S, p, q) });

export function addQuest(S, p, def) {
  if (!def || p.quests.has(def.id)) return null;
  const q = { ...def, progress: 0, done: false };
  p.quests.set(q.id, q);
  S.evTo(p, { type: 'quest', id: p.id, quest: questView(q, S, p) });
  p.youDirty = true; p.saveDirty = true;
  // Discovery is permanent: arriving here after exploration must never strand the chain.
  if (q.kind === 'discover' && p.discovered.has(q.shrine)) progress(S, p, q);
  return q;
}

function complete(S, p, q) {
  q.done = true; q.progress = q.goal;
  S.evTo(p, { type: 'quest', id: p.id, quest: questView(q, S, p) });
  const r = q.reward ?? {};
  const xp = Math.round(xpForLevel(p.lvl) * (r.xpf ?? 0.5) * 0.5);
  if (r.gold) p.gold += r.gold;
  const items = [];
  if (r.item) {
    const it = makeGear(S.rng, { oath: p.oath, cls: p.cls, lvl: p.lvl + 1, slot: 'weapon', rarity: r.item });
    if (S.giveItem(p, it)) items.push(it);
  }
  if (items.length || r.gold) S.evTo(p, { type: 'loot', id: p.id, gold: r.gold ?? 0, items: items.map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, qty: i.qty })) });
  S.giveXp(p, xp);
  S.sysTo(p, `Quest complete: ${q.title}`);
  p.quests.delete(q.id);
  if (q.step) {
    p.chainStep = q.step + 1;
    const next = chainStep(S, p.oath, q.step + 1);
    if (next) addQuest(S, p, next);
    else S.sysTo(p, `${OATH_BY_ID[p.oath].name} acknowledges you as Oathbound. The wider world awaits.`);
  }
  if (q.kind === 'bounty') p.bountiesDone = (p.bountiesDone || 0) + 1;
  p.youDirty = true; p.saveDirty = true;
}

function progress(S, p, q, n = 1) {
  if (q.done) return;
  q.progress = Math.min(q.goal, q.progress + n);
  if (q.progress >= q.goal) complete(S, p, q);
  else { S.evTo(p, { type: 'quest', id: p.id, quest: questView(q, S, p) }); p.youDirty = true; p.saveDirty = true; }
}

export function onKill(S, p, mob) {
  for (const q of [...p.quests.values()]) {
    if (q.kind === 'kill' || q.kind === 'bounty') { if (q.targets.includes(mob.def?.id)) progress(S, p, q); }
  }
}

export function onTalk(S, p, npc) {
  for (const q of [...p.quests.values()]) {
    if (q.kind === 'talk' && q.role === npc.role && q.oath === npc.oath) progress(S, p, q);
  }
}

export function onDiscover(S, p, shrine) {
  for (const q of [...p.quests.values()]) if (q.kind === 'discover' && q.shrine === shrine) progress(S, p, q);
}

/** Regional bounty from a warden, scaled to the player's level. */
export function makeBounty(S, p, oath) {
  const o = OATH_BY_ID[oath];
  const role = p.lvl < 8 ? 'common' : p.lvl < 18 ? 'veteran' : 'elite';
  const c = roster(oath, role);
  const goal = { common: 6, veteran: 4, elite: 2 }[role];
  return {
    id: `bounty-${oath}`, title: `Bounty: ${WARDS[o.index - 1]}`, text: `The ${o.name} warden pays for ${goal} ${c.name}s culled near ${WARDS[o.index - 1]}.`,
    kind: 'bounty', targets: [c.id], goal, reward: { xpf: role === 'elite' ? 1.4 : 0.8, gold: 15 + p.lvl * 4 * goal / 2 },
  };
}
