// Shared cartography data for the minimap and world map.
import { OATHS, OATH_BY_ID, ROUTES, SANCTUARY } from '@shared/oaths.js';

/** Sanctuaries with shrine positions (from architecture when available, else canonical centres). */
export function sanctuaries(ctx) {
  const arch = ctx.architecture?.sanctuaries;
  if (Array.isArray(arch) && arch.length) {
    return arch.map((s) => {
      const o = OATH_BY_ID[s.oathId] || OATHS[0];
      const c = s.center || o.center;
      const sh = s.shrine || { x: c[0], z: c[1] + SANCTUARY.plazaRadius * 0.6 };
      return { oath: o, x: c[0], z: c[1], shrine: { x: sh.x, z: sh.z } };
    });
  }
  return OATHS.map((o) => ({ oath: o, x: o.center[0], z: o.center[1], shrine: { x: o.center[0], z: o.center[1] + SANCTUARY.plazaRadius * 0.6 } }));
}

export const ROUTE_SEGMENTS = ROUTES.map(([a, b]) => ({ a: OATH_BY_ID[a].center, b: OATH_BY_ID[b].center }));

export const ENTITY_STYLE = {
  player: { color: '#7fb8ff', r: 3 },
  mob: { color: '#e05a50', r: 2.6 },
  elite: { color: '#f0a040', r: 3.4 },
  boss: { color: '#ffd060', r: 4.4 },
  npc: { color: '#e9e1c0', r: 2.8 },
};
