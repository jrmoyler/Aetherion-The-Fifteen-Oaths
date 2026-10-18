// Terrain raster service: one shared worker, request queue, main-thread idle fallback.
import { rasterize } from './terrainRaster.js';

let worker = null;
let workerFailed = false;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id); if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data);
    };
    worker.onerror = (e) => {
      console.warn('[ui] terrain worker failed, using main-thread fallback', e.message);
      workerFailed = true; worker = null;
      for (const [, p] of pending) fallback(p.rect).then(p.resolve, p.reject);
      pending.clear();
    };
  } catch (err) { workerFailed = true; worker = null; }
  return worker;
}

const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 16));

/** Main-thread fallback: rasterize in horizontal strips during idle time. */
function fallback(rect) {
  return new Promise((resolve) => {
    const rgba = new Uint8ClampedArray(rect.w * rect.h * 4);
    const heights = new Float32Array(rect.w * rect.h);
    const strip = Math.max(2, Math.floor(1200 / rect.w));
    let j = 0;
    const step = () => {
      const t0 = performance.now();
      while (j < rect.h && performance.now() - t0 < 6) {
        const hh = Math.min(strip, rect.h - j);
        const r = rasterize({ ...rect, maxZ: rect.maxZ - j * rect.mpp, h: hh });
        rgba.set(r.rgba, j * rect.w * 4); heights.set(r.heights, j * rect.w);
        j += hh;
      }
      if (j < rect.h) idle(step); else resolve({ rgba, heights, w: rect.w, h: rect.h });
    };
    idle(step);
  });
}

/** Rasterize rect {minX, maxZ, mpp, w, h}; resolves {rgba, heights, w, h}. */
export function requestRaster(rect) {
  const w = getWorker();
  if (!w) return fallback(rect);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, rect });
    w.postMessage({ id, rect });
  });
}

/** Build an ImageBitmap/canvas from a raster result. */
export function rasterToCanvas(res) {
  const c = document.createElement('canvas');
  c.width = res.w; c.height = res.h;
  const g = c.getContext('2d');
  g.putImageData(new ImageData(new Uint8ClampedArray(res.rgba.buffer || res.rgba), res.w, res.h), 0, 0);
  return c;
}
