// Offline "LocalServer": the shared simulation running in the browser, preferably in a Web Worker,
// falling back to the main thread when workers are unavailable. Exposes a socket-like transport.
import { createHost } from './simHost.js';

/**
 * @param {{seed:number, bots:number, onBatch:(msgs:object[])=>void, preferWorker?:boolean}} o
 * @returns {Promise<{kind:'worker'|'inline', send(msg:object):void, close():void}>}
 */
export async function createLocalServer({ seed = 15015, bots = 30, onBatch, preferWorker = true }) {
  if (preferWorker && typeof Worker !== 'undefined') {
    try {
      const t = await startWorker(seed, bots, onBatch);
      return t;
    } catch (e) {
      console.warn('[net] simulation worker unavailable, running in-thread:', e?.message ?? e);
    }
  }
  const host = createHost({
    seed, bots,
    // clone so consumers can never mutate simulation-owned objects (matches worker semantics)
    emit: (batch) => onBatch(typeof structuredClone === 'function' ? structuredClone(batch) : JSON.parse(JSON.stringify(batch))),
  });
  return {
    kind: 'inline',
    send: (msg) => host.receive(typeof structuredClone === 'function' ? structuredClone(msg) : JSON.parse(JSON.stringify(msg))),
    close: () => host.stop(),
  };
}

function startWorker(seed, bots, onBatch) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module', name: 'aetherion-sim' });
    } catch (e) { reject(e); return; }
    let ready = false;
    const t0 = performance.now();
    // generous: the page's main thread may be busy building the world while the worker boots
    const timeout = setTimeout(() => { if (!ready) { worker.terminate(); reject(new Error('worker boot timeout')); } }, 30000);
    worker.onerror = (e) => {
      if (!ready) { clearTimeout(timeout); worker.terminate(); reject(new Error(e.message || 'worker error')); }
      else console.error('[net] simulation worker error', e.message);
    };
    worker.onmessage = (ev) => {
      const batch = ev.data;
      if (!ready) {
        if (Array.isArray(batch) && batch[0]?.t === '__ready') {
          ready = true; clearTimeout(timeout);
          console.info(`[net] offline world running in a Web Worker (ready in ${Math.round(performance.now() - t0)} ms)`);
          resolve({ kind: 'worker', send: (msg) => worker.postMessage(msg), close: () => { worker.postMessage({ t: '__stop' }); setTimeout(() => worker.terminate(), 200); } });
        }
        return;
      }
      onBatch(batch);
    };
    worker.postMessage({ t: '__boot', seed, bots });
  });
}
