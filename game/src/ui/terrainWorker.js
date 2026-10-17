// Web Worker: rasterizes terrain tiles off the main thread.
import { rasterize } from './terrainRaster.js';

self.onmessage = (e) => {
  const { id, rect } = e.data || {};
  try {
    const { rgba, heights } = rasterize(rect);
    self.postMessage({ id, rgba, heights, w: rect.w, h: rect.h }, [rgba.buffer, heights.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
