// Items: loot generation (rarity tiers, Oath-flavoured names), gear stats, derived player stats.
import { OATH_BY_ID, CLASSES, MAX_LEVEL } from '../oaths.js';
import { RARITIES, GEAR_SLOTS, SLOT_NOUNS, RARITY_ADJ, CONSUMABLES, OATH_LEADERS, RESOURCES } from './data.js';
import { clamp } from './util.js';

let uid = 0;
const nextUid = (rng) => `i${(++uid).toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;
const cap = (s) => s.replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());

function rollRarity(rng, bonus = 0) {
  const total = RARITIES.reduce((s, r, i) => s + r.w * (i === 0 ? 1 : 1 + bonus * i), 0);
  let x = rng() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    x -= RARITIES[i].w * (i === 0 ? 1 : 1 + bonus * i);
    if (x <= 0) return RARITIES[i];
  }
  return RARITIES[0];
}

/** Gear piece for an oath (flavour) at item level `lvl`. */
export function makeGear(rng, { oath, cls, lvl, slot, rarity, rarityBonus = 0 }) {
  const o = OATH_BY_ID[oath] ?? OATH_BY_ID['oath-01'];
  const r = rarity ? RARITIES.find((x) => x.id === rarity) : rollRarity(rng, rarityBonus);
  slot = slot ?? rng.pick(GEAR_SLOTS);
  cls = cls ?? (rng() < 0.5 ? 'ninja' : 'sorcerer');
  const adj = rng.pick(RARITY_ADJ[r.id]);
  let base;
  if (slot === 'weapon') base = cap(o[cls].weapon);
  else base = `${cap(rng.pick(o.materials))} ${rng.pick(SLOT_NOUNS[slot])}`;
  let name = `${adj} ${base}`;
  if (r.id === 'rare' || r.id === 'epic') name += ` of ${o.name}`;
  if (r.id === 'legendary') name = `${OATH_LEADERS[o.index - 1]}'s ${base}`;
  const L = clamp(lvl, 1, MAX_LEVEL);
  const k = r.mul * (0.9 + rng() * 0.2);
  const stats = {};
  if (slot === 'weapon') { stats.power = Math.round((4 + L * 1.6) * k); if (r.mul > 1.2) stats.crit = Math.round(r.mul * 2); }
  else if (slot === 'trinket') { stats.crit = Math.round((1 + L * 0.12) * k); stats.mp = Math.round((4 + L * 2) * k); if (r.mul > 1.5) stats.haste = Math.round(r.mul * 2); }
  else {
    stats.armor = Math.round((3 + L * 1.4) * k * (slot === 'chest' ? 1.4 : 1));
    stats.hp = Math.round((6 + L * 3) * k);
    if (r.mul > 1.2) stats[rng() < 0.5 ? 'power' : 'mp'] = Math.round((1 + L * 0.5) * k);
  }
  return {
    id: nextUid(rng), kind: 'gear', slot, name, rarity: r.id, lvl: L, oath: o.id, stats, qty: 1,
    value: Math.round((5 + L * 3) * r.mul * r.mul),
  };
}

export function makeConsumable(rng, key, qty = 1) {
  const c = CONSUMABLES[key];
  return { id: nextUid(rng), kind: 'consumable', key, name: c.name, rarity: 'common', qty, value: Math.round(c.price / 4) };
}

export function makeMaterial(rng, oath, qty = 1) {
  const o = OATH_BY_ID[oath];
  const res = RESOURCES[o.index - 1];
  return { id: nextUid(rng), kind: 'material', key: `res-${o.index}`, name: cap(res), rarity: 'common', qty, value: 3 };
}

/** Loot roll for a killed mob, personal to one player. */
export function rollLoot(rng, mob, player) {
  const roleBonus = { common: 0, veteran: 0.4, elite: 1.2, boss: 3 }[mob.role] ?? 0;
  const items = [];
  const gold = Math.round((2 + mob.lvl * 1.6) * (1 + roleBonus) * (0.7 + rng() * 0.6));
  const gearChance = { common: 0.14, veteran: 0.3, elite: 0.75, boss: 1 }[mob.role] ?? 0.1;
  const n = mob.role === 'boss' ? 3 : 1;
  for (let i = 0; i < n; i++) {
    if (rng() < gearChance) {
      items.push(makeGear(rng, {
        oath: rng() < 0.7 ? mob.oath : player.oath, cls: rng() < 0.75 ? player.cls : undefined,
        lvl: mob.lvl, rarityBonus: roleBonus, rarity: mob.role === 'boss' && i === 0 ? (rng() < 0.25 ? 'legendary' : 'epic') : undefined,
      }));
    }
  }
  if (rng() < 0.3) items.push(makeMaterial(rng, mob.oath, 1 + Math.floor(rng() * 3)));
  if (rng() < 0.12) items.push(makeConsumable(rng, rng() < 0.6 ? 'potion' : 'ether'));
  return { gold, items };
}

/** Recompute derived stats from class + level + equipment (+ buffs handled at runtime). */
export function computeStats(p) {
  const c = CLASSES[p.cls];
  const g = { power: 0, armor: 0, hp: 0, mp: 0, crit: 0, haste: 0 };
  for (const slot in p.equipment) {
    const it = p.equipment[slot];
    if (!it) continue;
    for (const k in it.stats) g[k] = (g[k] || 0) + it.stats[k];
  }
  const L = p.lvl;
  p.mhp = Math.round(c.hp + c.hpPerLevel * (L - 1) + g.hp);
  p.mmp = Math.round(c.mp + c.mpPerLevel * (L - 1) + g.mp);
  p.stats = {
    power: Math.round((1 + 0.06 * (L - 1)) * 100 + g.power) / 100, // damage multiplier
    armor: Math.round(4 + L * 1.5 + g.armor),
    crit: Math.min(0.5, 0.05 + g.crit / 100),
    haste: Math.min(0.4, g.haste / 100),
    speed: c.moveSpeed,
  };
  if (p.hp > p.mhp) p.hp = p.mhp;
  if (p.mp > p.mmp) p.mp = p.mmp;
}

export function addItem(p, item, maxSlots = 40) {
  if (item.kind !== 'gear') {
    const same = p.inventory.find((i) => i.kind === item.kind && i.key === item.key);
    if (same) { same.qty += item.qty; return true; }
  }
  if (p.inventory.length >= maxSlots) return false;
  p.inventory.push(item);
  return true;
}
