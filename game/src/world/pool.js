// Terrain computations run in workers, recovering to a yielding main-thread queue.
import { buildNode, scatterCell, buildHeightmap } from './terrainCore.js';
import { buildLayers } from './textures.js';
import { createJobPool } from '../core/jobPool.js';

export function createPool(count) {
  return createJobPool({ count,
    makeWorker: () => new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' }),
    runSync(msg) {
      switch (msg.t) {
        case 'node': return buildNode(msg.x0, msg.z0, msg.size, msg.res, msg.skirt);
        case 'scatter': return scatterCell(msg.x0, msg.z0, msg.size, msg.density);
        case 'tex': return buildLayers(msg.layers, msg.N);
        case 'heightmap': return buildHeightmap(msg.N, msg.E);
        default: throw new Error('Unknown terrain job');
      }
    },
  });
}
