// STUB — replaced by the architecture agent.
import { OATHS } from '@shared/oaths.js';
import { SANCTUARY_HEIGHT } from '@shared/terrain.js';
export async function init() {
  const sanctuaries = OATHS.map((o) => { const y = SANCTUARY_HEIGHT[o.id]; const [x, z] = o.center;
    return { oathId: o.id, center: o.center, y, shrine: { x, y, z }, spawn: { x, y, z: z - 20 }, npcSpots: [] }; });
  return { sanctuaries, update() {}, shrineAt: () => null };
}
