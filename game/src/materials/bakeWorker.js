// Web Worker: bakes full-resolution procedural texture sets off the main thread, with an
// IndexedDB cache so repeat visits upload instantly.
import { bake } from './bake.js';

const VERSION = 'v3';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const rq = indexedDB.open('aetherion-materials', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('sets');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
async function get(id) {
  const d = await db(); if (!d) return null;
  return new Promise((res) => { try { const rq = d.transaction('sets').objectStore('sets').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch { res(null); } });
}
async function put(id, v) {
  const d = await db(); if (!d) return;
  try { d.transaction('sets', 'readwrite').objectStore('sets').put(v, id); } catch { /* quota */ }
}

self.onmessage = async (e) => {
  const { key, N } = e.data; const id = `${VERSION}:${key}@${N}`;
  try {
    let r = await get(id); let cached = !!r;
    if (!r) { r = bake(key, N, false); await put(id, { N: r.N, albedo: r.albedo, normal: r.normal, orm: r.orm, emis: r.emis, avgLin: r.avgLin, ms: r.ms }); }
    const bufs = [r.albedo.buffer, r.normal.buffer, r.orm.buffer]; if (r.emis) bufs.push(r.emis.buffer);
    self.postMessage({ key, N, albedo: r.albedo, normal: r.normal, orm: r.orm, emis: r.emis, avgLin: r.avgLin, ms: cached ? 0 : r.ms, cached }, bufs);
  } catch (err) {
    self.postMessage({ key, N, error: String(err) });
  }
};
