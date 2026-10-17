// Deterministic continent heightfield shared by client rendering, client movement and the
// authoritative simulation (mob placement, movement validation). Pure JS, no dependencies.
// Any change here changes the world for everyone: keep it deterministic and fast.
import { OATHS, ROUTES, OATH_BY_ID, SANCTUARY } from './oaths.js';

export const SEA_LEVEL = 0;
export const WORLD_SEED = 15015;
export const WORLD_HALF = 2600; // playable square half-extent in metres

// ---------- seeded gradient noise ----------
const perm = new Uint8Array(512);
{
  let s = WORLD_SEED >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const g = (ix, iy, dx, dy) => { const v = G[perm[ix + perm[iy]] & 7]; return v[0] * dx + v[1] * dy; };
  const u = fade(xf), v = fade(yf);
  const a = g(X, Y, xf, yf), b = g(X + 1, Y, xf - 1, yf);
  const c = g(X, Y + 1, xf, yf - 1), d = g(X + 1, Y + 1, xf - 1, yf - 1);
  return (a + u * (b - a) + v * (c + u * (d - c) - a - u * (b - a))) * 0.7071;
}
export function fbm(x, y, oct = 5, lac = 2.03, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function ridged(x, y, oct = 5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(noise2(x * f, y * f)); s += a * r * r; n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ---------- biome profiles ----------
// base: mean elevation, amp: relief, ridge: 0..1 ridged mix, terrace: step height (0 = none), freq: feature scale
export const BIOMES = {
  volcanic: { base: 38, amp: 46, ridge: 0.7, terrace: 0, freq: 1 / 260 },
  glacial: { base: 70, amp: 70, ridge: 0.8, terrace: 0, freq: 1 / 300 },
  alpine: { base: 95, amp: 120, ridge: 0.95, terrace: 0, freq: 1 / 340 },
  coast: { base: 9, amp: 14, ridge: 0.1, terrace: 0, freq: 1 / 380 },
  canyon: { base: 44, amp: 40, ridge: 0.3, terrace: 9, freq: 1 / 220 },
  cliffs: { base: 62, amp: 34, ridge: 0.5, terrace: 0, freq: 1 / 260 },
  forest: { base: 20, amp: 18, ridge: 0.2, terrace: 0, freq: 1 / 320 },
  marsh: { base: 3.5, amp: 3, ridge: 0, terrace: 0, freq: 1 / 200 },
  meadow: { base: 24, amp: 12, ridge: 0.1, terrace: 0, freq: 1 / 420 },
  highland: { base: 66, amp: 38, ridge: 0.6, terrace: 0, freq: 1 / 300 },
  badlands: { base: 30, amp: 30, ridge: 0.4, terrace: 5, freq: 1 / 180 },
  crimson: { base: 34, amp: 28, ridge: 0.6, terrace: 0, freq: 1 / 240 },
  terraces: { base: 40, amp: 22, ridge: 0.2, terrace: 6, freq: 1 / 260 },
  plateau: { base: 48, amp: 16, ridge: 0.3, terrace: 0, freq: 1 / 300 },
  industrial: { base: 22, amp: 14, ridge: 0.3, terrace: 0, freq: 1 / 300 },
};

/** Flattened plaza elevation of each sanctuary (deterministic, independent of noise). */
export const SANCTUARY_HEIGHT = Object.fromEntries(OATHS.map((o) => [o.id, BIOMES[o.biome].base + 2]));

const REGIONS = OATHS.map((o) => ({ id: o.id, x: o.center[0], z: o.center[1], b: BIOMES[o.biome], h: SANCTUARY_HEIGHT[o.id] }));
const ROUTE_SEGS = ROUTES.map(([a, b]) => {
  const A = OATH_BY_ID[a].center, B = OATH_BY_ID[b].center;
  return { ax: A[0], az: A[1], bx: B[0], bz: B[1], ha: SANCTUARY_HEIGHT[a], hb: SANCTUARY_HEIGHT[b], a, b };
});

/** Inverse-distance region weights, normalized. Returns [{id, w}] sorted by weight. */
export function regionWeights(x, z, k = 3) {
  const ws = REGIONS.map((r) => { const d2 = (r.x - x) ** 2 + (r.z - z) ** 2 + 1; return { id: r.id, r, w: 1 / (d2 * d2) }; });
  ws.sort((p, q) => q.w - p.w);
  const top = ws.slice(0, k); const s = top.reduce((a, t) => a + t.w, 0);
  return top.map((t) => ({ id: t.id, r: t.r, w: t.w / s }));
}

function biomeHeight(b, x, z) {
  const f = b.freq;
  const n = fbm(x * f + 31.7, z * f - 11.3, 5);
  const r = ridged(x * f * 0.8 - 7.1, z * f * 0.8 + 3.9, 5);
  let h = b.base + b.amp * ((1 - b.ridge) * n + b.ridge * (r - 0.45));
  if (b.terrace > 0) { const t = h / b.terrace; const fl = Math.floor(t); h = (fl + smooth(0.35, 0.65, t - fl)) * b.terrace; }
  return h;
}

function distToSeg(px, pz, s) {
  const vx = s.bx - s.ax, vz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * vx + (pz - s.az) * vz) / (vx * vx + vz * vz)));
  const cx = s.ax + vx * t, cz = s.az + vz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

/** Continent mask 0 (open sea) .. 1 (inland). Coastline wobbles with noise. */
export function landMask(x, z) {
  // Rounded rectangle continent hugging the region layout with a southern bay at the Tidal Covenant.
  const ex = Math.max(0, Math.abs(x - 80) - 1900), ez = Math.max(0, Math.abs(z - 0) - 1500);
  const d = Math.hypot(ex, ez) + fbm(x / 600, z / 600, 4) * 260;
  return 1 - smooth(120, 520, d);
}

/** Terrain height in metres at world (x, z). */
export function heightAt(x, z) {
  const ws = regionWeights(x, z, 3);
  let h = 0;
  for (const { r, w } of ws) h += w * biomeHeight(r.b, x, z);
  // micro detail
  h += fbm(x / 23, z / 23, 3) * 1.2;

  // roads: gentle cut toward a linear interpolation between sanctuary heights
  let roadW = 0, roadH = 0;
  for (const s of ROUTE_SEGS) {
    const { d, t } = distToSeg(x, z, s);
    if (d < 26) {
      const w = 1 - smooth(5, 26, d);
      if (w > roadW) { roadW = w; roadH = s.ha + (s.hb - s.ha) * smooth(0, 1, t) + fbm(x / 140, z / 140, 2) * 6; }
    }
  }
  if (roadW > 0) h = h + (roadH - h) * roadW * 0.92;

  // sanctuaries: flat plaza, eased city ring
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < SANCTUARY.cityRadius + 120) {
      const w = 1 - smooth(SANCTUARY.cityRadius * 0.55, SANCTUARY.cityRadius + 120, d);
      h = h + (r.h - h) * w;
      if (d < SANCTUARY.cityRadius * 0.55) h = r.h;
    }
  }

  // coastline
  const m = landMask(x, z);
  h = h * m + (SEA_LEVEL - 28) * (1 - m);
  return h;
}

/** Surface normal from central differences (unit vector [x,y,z]). */
export function normalAt(x, z, e = 1.5) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz; const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

/** Distance to the nearest road centerline and the route id. */
export function roadInfo(x, z) {
  let best = { d: Infinity, route: null };
  for (const s of ROUTE_SEGS) { const { d } = distToSeg(x, z, s); if (d < best.d) best = { d, route: `${s.a}:${s.b}` }; }
  return best;
}

export function isWater(x, z) { return heightAt(x, z) < SEA_LEVEL; }
