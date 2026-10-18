// Deterministic world layout for the simulation: sanctuaries (spawn, shrine, NPC spots),
// creature camps and boss lairs. Pure function of the world seed + shared terrain.
import { OATHS, SANCTUARY, ROUTES } from '../oaths.js';
import { heightAt, roadInfo, SANCTUARY_HEIGHT, WORLD_HALF } from '../terrain.js';
import { CREATURES, NPC_ROLES } from '../creatures.js';
import { makeRng, clamp } from './util.js';
import { SANCTUARY_LAYOUT } from '../sanctuary-layout.js';

export const SAFE_RADIUS = SANCTUARY.cityRadius; // 150 m: no mobs, no aggro inside
export const SHRINE_DISCOVER_RADIUS = 12;
export const NPC_RING = 30;

/** Mob level for a distance from the nearest sanctuary center: 1-6 near the city, ~30 in the border wilds. */
export function levelForDistance(d) {
  return clamp(Math.round(1 + (d - SAFE_RADIUS) / 24), 1, 30);
}

export function buildSanctuaries() {
  return OATHS.map((o, i) => {
    const [cx, cz] = o.center;
    const y = SANCTUARY_HEIGHT[o.id];
    const L = SANCTUARY_LAYOUT[o.id];
    // Prefer the architecture module's measured layout so NPCs stand where the city expects them.
    const npcs = L ? NPC_ROLES.map((role) => ({ ...L.npcs.find((n) => n.role === role) })).filter((n) => n.role) : NPC_ROLES.map((role, k) => {
      const a = (k / NPC_ROLES.length) * Math.PI * 2 + Math.PI / 6;
      const x = cx + Math.cos(a) * NPC_RING, z = cz + Math.sin(a) * NPC_RING;
      return { role, x, y, z, ry: Math.atan2(cx - x, cz - z) };
    });
    const neighbours = ROUTES.filter((r) => r.includes(o.id)).map((r) => (r[0] === o.id ? r[1] : r[0]));
    return {
      oathId: o.id, index: i, oath: o, center: [cx, cz], y,
      shrine: L ? { ...L.shrine } : { x: cx, y, z: cz },
      spawn: L ? { ...L.spawn, ry: Math.atan2(L.shrine.x - L.spawn.x, L.shrine.z - L.spawn.z) } : { x: cx, y, z: cz - 14, ry: 0 },
      npcs, neighbours,
    };
  });
}

function landOk(x, z) {
  if (Math.abs(x) > WORLD_HALF - 60 || Math.abs(z) > WORLD_HALF - 60) return null;
  const h = heightAt(x, z);
  if (h < 1.5) return null; // water / shoreline
  // reject steep cliffs: sample a small cross
  const e = 4;
  const s = Math.max(Math.abs(heightAt(x + e, z) - h), Math.abs(heightAt(x, z + e) - h));
  if (s > 4.5) return null;
  return h;
}

function nearestCenterDist(x, z) {
  let bd = Infinity, id = null;
  for (const o of OATHS) {
    const d = Math.hypot(o.center[0] - x, o.center[1] - z);
    if (d < bd) { bd = d; id = o.id; }
  }
  return { d: bd, id };
}

/**
 * Camps: per region, ~`campsPerRegion` clusters of that region's creatures on land, off roads,
 * outside the sanctuary radius. Returns [{oath, x, y, z, level, members:[creatureId...]}].
 */
export function buildCamps(seed, campsPerRegion = 22) {
  const camps = [];
  for (const o of OATHS) {
    const rng = makeRng(seed * 31 + o.index * 977);
    const roster = CREATURES.filter((c) => c.oath === o.id);
    const common = roster.find((c) => c.role === 'common');
    const veteran = roster.find((c) => c.role === 'veteran');
    const elite = roster.find((c) => c.role === 'elite');
    const mine = [];
    let tries = 0;
    while (mine.length < campsPerRegion && tries++ < campsPerRegion * 30) {
      const a = rng() * Math.PI * 2;
      // bias toward the near ring so starter areas are populated
      const t = rng();
      const d = SAFE_RADIUS + 40 + Math.pow(t, 1.35) * 900;
      const x = o.center[0] + Math.cos(a) * d, z = o.center[1] + Math.sin(a) * d;
      const nc = nearestCenterDist(x, z);
      if (nc.id !== o.id || nc.d < SAFE_RADIUS + 30) continue;
      if (roadInfo(x, z).d < 32) continue;
      if (mine.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < 55 * 55)) continue;
      const y = landOk(x, z);
      if (y == null) continue;
      const level = levelForDistance(nc.d);
      const members = [common.id, common.id];
      if (level >= 3 || rng() < 0.4) members.push(rng() < 0.5 ? veteran.id : common.id);
      if (level >= 6 && rng() < 0.6) members.push(veteran.id);
      if (level >= 12 && rng() < 0.35) members.push(elite.id);
      mine.push({ oath: o.id, x, y, z, level, members });
    }
    camps.push(...mine);
  }
  return camps;
}

/** One boss lair per region on a fixed point of interest (deterministic). */
export function buildLairs(seed) {
  return OATHS.map((o) => {
    const rng = makeRng(seed * 7 + o.index * 131 + 5);
    const boss = CREATURES.find((c) => c.oath === o.id && c.role === 'boss');
    for (let i = 0; i < 400; i++) {
      const a = rng() * Math.PI * 2;
      const d = 430 + rng() * 260;
      const x = o.center[0] + Math.cos(a) * d, z = o.center[1] + Math.sin(a) * d;
      const nc = nearestCenterDist(x, z);
      if (nc.id !== o.id || nc.d < 380) continue;
      if (roadInfo(x, z).d < 60) continue;
      const y = landOk(x, z);
      if (y == null) continue;
      return { oath: o.id, boss: boss.id, x, y, z, level: clamp(levelForDistance(nc.d) + 4, 10, 30) };
    }
    // fallback: offset from center (should not happen for valid terrain)
    const x = o.center[0] + 420, z = o.center[1];
    return { oath: o.id, boss: boss.id, x, y: heightAt(x, z), z, level: 14 };
  });
}
