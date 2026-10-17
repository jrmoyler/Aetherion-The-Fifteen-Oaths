// Small prioritized job pool over terrain workers, with a synchronous main-thread fallback
// (time-sliced in update()) when module workers are unavailable.
import { buildNode, scatterCell, buildHeightmap } from './terrainCore.js';
import { buildLayers } from './textures.js';

export function createPool(count) {
  const workers = [];
  const queue = []; // {msg, prio(), resolve, reject, transfer}
  let nextId = 1;
  const inflight = new Map();
  try {
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = (ev) => {
        const m = ev.data; const job = inflight.get(m.id); inflight.delete(m.id); w.busy--;
        if (job) { if (m.ok) job.resolve(m.r); else { console.warn('[world] worker job failed', m.err); job.reject(new Error(m.err)); } }
        pump();
      };
      w.onerror = (e) => { console.warn('[world] worker error', e.message); };
      workers.push(w);
    }
  } catch (e) { console.warn('[world] workers unavailable, using main thread', e); workers.length = 0; }

  function pump() {
    if (!workers.length || !queue.length) return;
    for (const w of workers) {
      while (w.busy < 2 && queue.length) {
        let bi = 0, bp = Infinity;
        for (let i = 0; i < queue.length; i++) { const p = queue[i].prio(); if (p < bp) { bp = p; bi = i; } }
        const job = queue.splice(bi, 1)[0];
        if (job.cancelled?.()) { job.reject(new Error('cancelled')); continue; }
        const id = nextId++; job.msg.id = id; inflight.set(id, job); w.busy++;
        w.postMessage(job.msg);
      }
    }
  }

  function runSync(msg) {
    switch (msg.t) {
      case 'node': return buildNode(msg.x0, msg.z0, msg.size, msg.res, msg.skirt);
      case 'scatter': return scatterCell(msg.x0, msg.z0, msg.size, msg.density);
      case 'tex': return buildLayers(msg.layers, msg.N);
      case 'heightmap': return buildHeightmap(msg.N, msg.E);
      default: throw new Error('unknown job');
    }
  }

  /** Queue a job. prio: () => number (lower first). cancelled: () => bool */
  function run(msg, prio = () => 0, cancelled = null) {
    return new Promise((resolve, reject) => { queue.push({ msg, prio, resolve, reject, cancelled }); pump(); });
  }

  /** Main-thread fallback: process queued jobs within a time budget (ms). */
  function update(budgetMs = 6) {
    if (workers.length) { pump(); return; }
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) {
      let bi = 0, bp = Infinity;
      for (let i = 0; i < queue.length; i++) { const p = queue[i].prio(); if (p < bp) { bp = p; bi = i; } }
      const job = queue.splice(bi, 1)[0];
      if (job.cancelled?.()) { job.reject(new Error('cancelled')); continue; }
      try { job.resolve(runSync(job.msg)); } catch (e) { job.reject(e); }
    }
  }

  return { run, update, get pending() { return queue.length + inflight.size; }, get threaded() { return workers.length > 0; }, workers };
}
