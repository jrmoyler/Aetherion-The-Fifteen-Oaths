// Procedural particle / decal textures. Everything is painted into canvases at runtime —
// no image files. Textures are cached per scene and shared by every effect.
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';

const cache = new WeakMap();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Small value-noise helper for smoke puffs.
function makeNoise(seed) {
  const r = rng(seed); const N = 64; const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((y & (N - 1)) * N) + (x & (N - 1))];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y); const xf = sm(x - xi); const yf = sm(y - yi);
    const a = at(xi, yi); const b = at(xi + 1, yi); const c = at(xi, yi + 1); const d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

const PAINTERS = {
  dot(c, S) {
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  },
  ember(c, S) {
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  },
  spark(c, S) { // vertical streak, used with stretched billboards
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(S / 2, S / 2, S * 0.09, S * 0.48, 0, 0, Math.PI * 2); c.fill();
    const h = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.2);
    h.addColorStop(0, 'rgba(255,255,255,0.8)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h; c.fillRect(0, 0, S, S);
  },
  smoke(c, S, seed = 7) {
    const n = makeNoise(seed); const img = c.createImageData(S, S); const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S - 0.5; const v = y / S - 0.5; const r = Math.sqrt(u * u + v * v) * 2;
      let f = 0; let a = 1; let fr = 4 / S * 8;
      for (let o = 0; o < 4; o++) { f += n(x * fr + o * 17, y * fr + o * 31) * a; a *= 0.5; fr *= 2; }
      f /= 1.875;
      const mask = Math.max(0, 1 - r); const alpha = Math.max(0, Math.min(1, (f * 1.6 - 0.35) * mask * mask * 2.2));
      const i = (y * S + x) * 4; const shade = 200 + f * 55;
      d[i] = shade; d[i + 1] = shade; d[i + 2] = shade; d[i + 3] = alpha * 255;
    }
    c.putImageData(img, 0, 0);
  },
  flame(c, S, seed = 4) { // soft teardrop tongue with noise breakup (for flame particles)
    const n = makeNoise(seed); const img = c.createImageData(S, S); const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x / S - 0.5) * 2; const v = y / S; // v: 0 top .. 1 bottom
      const wdt = 0.25 + 0.6 * Math.pow(v, 0.7) * (1 - Math.pow(v, 6));
      const m = Math.max(0, 1 - Math.abs(u) / Math.max(0.05, wdt)) * Math.min(1, (1 - v) * 6) * Math.min(1, v * 2.5);
      const f = n(x * 0.12, y * 0.09) * 0.6 + n(x * 0.25, y * 0.2) * 0.4;
      const a = Math.max(0, Math.min(1, m * (0.55 + f * 0.8) * 1.4 - 0.15));
      const i = (y * S + x) * 4; d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
    }
    c.putImageData(img, 0, 0);
  },
  flare(c, S) {
    PAINTERS.dot(c, S);
    c.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[0.5, 0.025], [0.025, 0.5]]) {
      const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(S / 2, S / 2, S * w * 0.8, S * h, 0, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  },
  ring(c, S) {
    c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = S * 0.06; c.shadowColor = 'white'; c.shadowBlur = S * 0.08;
    c.beginPath(); c.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2); c.stroke();
  },
  shard(c, S, seed = 3) {
    const r = rng(seed);
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0.45)');
    c.fillStyle = g; c.beginPath();
    c.moveTo(S * 0.5, S * 0.04); c.lineTo(S * (0.72 + r() * 0.1), S * 0.55); c.lineTo(S * 0.52, S * 0.96); c.lineTo(S * (0.25 + r() * 0.08), S * 0.5);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 2; c.stroke();
  },
  leaf(c, S) {
    const g = c.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0.75)');
    c.fillStyle = g; c.beginPath(); c.moveTo(S / 2, S * 0.05);
    c.quadraticCurveTo(S * 0.95, S * 0.45, S / 2, S * 0.95); c.quadraticCurveTo(S * 0.05, S * 0.45, S / 2, S * 0.05); c.fill();
    c.strokeStyle = 'rgba(160,160,160,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(S / 2, S * 0.1); c.lineTo(S / 2, S * 0.9); c.stroke();
  },
  drop(c, S) {
    const g = c.createRadialGradient(S * 0.42, S * 0.4, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(0.8, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(S / 2, S / 2, S * 0.3, S * 0.45, 0, 0, Math.PI * 2); c.fill();
  },
  bubble(c, S) {
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = S * 0.05;
    c.beginPath(); c.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(S * 0.38, S * 0.36, S * 0.08, 0, Math.PI * 2); c.fill();
  },
  rock(c, S, seed = 11) { // chunky debris silhouette, shaded
    const r = rng(seed); c.beginPath();
    const n = 7; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = S * (0.3 + r() * 0.16); c[i ? 'lineTo' : 'moveTo'](S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr); }
    c.closePath();
    const g = c.createLinearGradient(0, 0, S, S); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(90,90,90,1)');
    c.fillStyle = g; c.fill();
  },
  streak(c, S) { // horizontal soft streak (wind lines, afterimages)
    const g = c.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(S / 2, S / 2, S * 0.5, S * 0.07, 0, 0, Math.PI * 2); c.fill();
  },
  rune(c, S, seed = 5) { // band of procedural rune strokes, repeated around glyph rings
    const r = rng(seed); c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = S * 0.012; c.lineCap = 'round';
    const cols = 16; const w = S / cols;
    for (let i = 0; i < cols; i++) {
      const x0 = i * w + w * 0.2; const x1 = x0 + w * 0.6; const y0 = S * 0.3; const y1 = S * 0.7;
      c.beginPath();
      const k = 2 + Math.floor(r() * 3);
      for (let j = 0; j < k; j++) {
        const ax = x0 + r() * (x1 - x0); const ay = y0 + r() * (y1 - y0); const bx = x0 + r() * (x1 - x0); const by = y0 + r() * (y1 - y0);
        c.moveTo(ax, ay); c.lineTo(bx, by);
      }
      if (r() > 0.5) { c.moveTo(x0 + w * 0.3 + w * 0.12, S * 0.5); c.arc(x0 + w * 0.3, S * 0.5, w * 0.12, 0, Math.PI * 2); }
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,1)';
    c.fillRect(0, S * 0.18, S, S * 0.012); c.fillRect(0, S * 0.8, S, S * 0.012);
  },
};

/** Get (and lazily paint) a named procedural texture. `glyph:<svg>` keys are handled by glyphTexture. */
export function getTexture(scene, name, size = 64) {
  let m = cache.get(scene); if (!m) { m = new Map(); cache.set(scene, m); }
  const key = `${name}@${size}`;
  if (m.has(key)) return m.get(key);
  const dt = new DynamicTexture(`fx.${name}`, { width: size, height: size }, scene, true);
  dt.hasAlpha = true;
  const c = dt.getContext(); c.clearRect(0, 0, size, size);
  const [base, seed] = name.split('#');
  (PAINTERS[base] ?? PAINTERS.dot)(c, size, seed ? +seed : undefined);
  dt.update(true, true);
  dt.wrapU = dt.wrapV = base === 'rune' ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  m.set(key, dt);
  return dt;
}

/** Paint an ability glyph (SVG string from the canon registry) into a texture. Resolves asynchronously;
 * the returned texture is valid immediately (blank until the SVG decodes). */
export function glyphTexture(scene, id, svg, size = 256) {
  let m = cache.get(scene); if (!m) { m = new Map(); cache.set(scene, m); }
  const key = `glyph:${id}`;
  if (m.has(key)) return m.get(key);
  const dt = new DynamicTexture(`fx.glyph.${id}`, { width: size, height: size }, scene, true);
  dt.hasAlpha = true; dt.wrapU = dt.wrapV = Texture.CLAMP_ADDRESSMODE;
  const c = dt.getContext(); c.clearRect(0, 0, size, size); dt.update(true, true);
  m.set(key, dt);
  if (svg && typeof Image !== 'undefined') {
    try {
      let src = svg.replace(/currentColor/g, '#ffffff');
      if (!/xmlns=/.test(src)) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      src = src.replace('<svg', `<svg width="${size}" height="${size}"`);
      const img = new Image();
      img.onload = () => {
        c.clearRect(0, 0, size, size);
        c.shadowColor = 'white'; c.shadowBlur = size * 0.03;
        c.drawImage(img, size * 0.12, size * 0.12, size * 0.76, size * 0.76);
        dt.update(true, true);
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
    } catch { /* glyph stays blank */ }
  }
  return dt;
}
