// Terrain worker: heavy deterministic computations off the main thread.
import { buildNode, scatterCell, buildHeightmap } from './terrainCore.js';
import { buildLayers } from './textures.js';

self.onmessage = (ev) => {
  const m = ev.data;
  try {
    if (m.t === 'node') {
      const r = buildNode(m.x0, m.z0, m.size, m.res, m.skirt);
      self.postMessage({ id: m.id, ok: true, r }, [r.pos.buffer, r.nrm.buffer, r.w0.buffer, r.w1.buffer, r.aux.buffer, r.col.buffer, r.heights.buffer]);
    } else if (m.t === 'scatter') {
      const r = scatterCell(m.x0, m.z0, m.size, m.density);
      self.postMessage({ id: m.id, ok: true, r }, [r.data.buffer]);
    } else if (m.t === 'tex') {
      const layers = buildLayers(m.layers, m.N);
      const bufs = []; for (const l of layers) bufs.push(l.alb.buffer, l.nrm.buffer);
      self.postMessage({ id: m.id, ok: true, r: layers }, bufs);
    } else if (m.t === 'heightmap') {
      const hm = buildHeightmap(m.N, m.E);
      self.postMessage({ id: m.id, ok: true, r: hm }, [hm.buffer]);
    }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, err: String(e?.stack ?? e) });
  }
};
