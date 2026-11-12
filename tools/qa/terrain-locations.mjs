import { OATHS, ROUTES, OATH_BY_ID } from '../../shared/oaths.js';
import { buildSanctuaries, buildCamps } from '../../shared/sim/world.js';
import { heightAt, WORLD_SEED } from '../../shared/terrain.js';
const inspected = new Set(['canyon', 'alpine', 'glacial', 'volcanic', 'forest', 'plateau']);
export function terrainLocations(seed = WORLD_SEED) {
  const camps = buildCamps(seed);
  return buildSanctuaries().map(s => {
    const o = s.oath, camp = camps.find(c => c.oath === o.id && c.starter);
    const neighbours = ROUTES.filter(r => r.includes(o.id)).map(r => OATH_BY_ID[r.find(id => id !== o.id)]);
    const transitions = neighbours.map(n => {
      const x = (o.center[0] + n.center[0]) / 2, z = (o.center[1] + n.center[1]) / 2;
      return { to: n.id, x, y: heightAt(x, z), z };
    });
    return { id: o.id, name: o.name, biome: o.biome, priority: !inspected.has(o.biome), spawn: s.spawn,
      shrine: s.shrine, camp, transitions,
      views: [{ name: 'spawn', ...s.spawn }, { name: 'camp', ...camp }, { name: 'transition', ...transitions[0] }] };
  }).sort((a,b) => Number(b.priority) - Number(a.priority) || a.id.localeCompare(b.id));
}
