// Deterministic continent heightfield shared by client rendering, client movement and the
// authoritative simulation (mob placement, movement validation). Pure JS, no dependencies.
// Any change here changes the world for everyone: keep it deterministic and fast (< 10 µs/call).
//
// Pipeline per sample:  biome landforms (blended by region weights)  →  road cuts  →
// sanctuary city easing  →  coastline (cliffs or beaches, Tidal bay, Reed fjord, sea stacks)  →
// flat sanctuary plaza core (always exactly SANCTUARY_HEIGHT inside SANCTUARY.cityRadius*0.55).
import { OATHS, ROUTES, OATH_BY_ID, SANCTUARY } from './oaths.js';

export const SEA_LEVEL = 0;
export const WORLD_SEED = 15015;
export const WORLD_HALF = 2600; // playable square half-extent in metres
/** Surface level of the shallow marsh pools around the Bitterglass Guild. */
export const MARSH_LEVEL = 2.6;

// ---------- seeded gradient noise (allocation free) ----------
const perm = new Uint8Array(512);
{
  let s = WORLD_SEED >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const GX = new Float64Array([1, -1, 1, -1, 1, -1, 0, 0]);
const GY = new Float64Array([1, 1, -1, -1, 0, 0, 1, -1]);
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const h00 = perm[X + perm[Y]] & 7, h10 = perm[X + 1 + perm[Y]] & 7;
  const h01 = perm[X + perm[Y + 1]] & 7, h11 = perm[X + 1 + perm[Y + 1]] & 7;
  const a = GX[h00] * xf + GY[h00] * yf;
  const b = GX[h10] * (xf - 1) + GY[h10] * yf;
  const c = GX[h01] * xf + GY[h01] * (yf - 1);
  const d = GX[h11] * (xf - 1) + GY[h11] * (yf - 1);
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const ab = a + u * (b - a), cd = c + u * (d - c);
  return (ab + v * (cd - ab)) * 0.7071;
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
const hash2 = (ix, iz) => { let h = (ix * 374761393 + iz * 668265263 + WORLD_SEED) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------- biome profiles ----------
// base: mean elevation (fixes the plaza height — do not change), amp: relief, ridge: 0..1 ridged mix,
// terrace: step height (0 = none), freq: feature scale, cliff: 0 beach .. 1 sheer sea cliffs.
export const BIOMES = {
  volcanic: { base: 38, amp: 52, ridge: 0.75, terrace: 0, freq: 1 / 260, cliff: 0.8 },
  glacial: { base: 70, amp: 85, ridge: 0.85, terrace: 0, freq: 1 / 320, cliff: 0.9 },
  alpine: { base: 95, amp: 150, ridge: 0.95, terrace: 0, freq: 1 / 360, cliff: 0.9 },
  coast: { base: 9, amp: 16, ridge: 0.15, terrace: 0, freq: 1 / 380, cliff: 1 },
  canyon: { base: 44, amp: 40, ridge: 0.3, terrace: 9, freq: 1 / 220, cliff: 0.6 },
  cliffs: { base: 62, amp: 34, ridge: 0.5, terrace: 0, freq: 1 / 260, cliff: 1 },
  forest: { base: 20, amp: 18, ridge: 0.2, terrace: 0, freq: 1 / 320, cliff: 0.2 },
  marsh: { base: 3.5, amp: 3, ridge: 0, terrace: 0, freq: 1 / 200, cliff: 0 },
  meadow: { base: 24, amp: 14, ridge: 0.1, terrace: 0, freq: 1 / 420, cliff: 0.1 },
  highland: { base: 66, amp: 44, ridge: 0.6, terrace: 0, freq: 1 / 300, cliff: 0.8 },
  badlands: { base: 30, amp: 34, ridge: 0.4, terrace: 5, freq: 1 / 180, cliff: 0.6 },
  crimson: { base: 34, amp: 32, ridge: 0.65, terrace: 0, freq: 1 / 240, cliff: 0.5 },
  terraces: { base: 40, amp: 22, ridge: 0.2, terrace: 6, freq: 1 / 260, cliff: 0.4 },
  plateau: { base: 48, amp: 16, ridge: 0.3, terrace: 0, freq: 1 / 300, cliff: 0.7 },
  industrial: { base: 22, amp: 14, ridge: 0.3, terrace: 0, freq: 1 / 300, cliff: 0.3 },
};
const BIOME_KIND = { volcanic: 1, glacial: 2, alpine: 3, coast: 4, canyon: 5, cliffs: 6, forest: 7, marsh: 8, meadow: 9, highland: 10, badlands: 11, crimson: 12, terraces: 13, plateau: 14, industrial: 15 };

/** Flattened plaza elevation of each sanctuary (deterministic, independent of noise). */
export const SANCTUARY_HEIGHT = Object.fromEntries(OATHS.map((o) => [o.id, BIOMES[o.biome].base + 2]));

const REGIONS = OATHS.map((o) => ({ id: o.id, x: o.center[0], z: o.center[1], b: BIOMES[o.biome], kind: BIOME_KIND[o.biome], h: SANCTUARY_HEIGHT[o.id] }));
const NREG = REGIONS.length;
const REG_X = new Float64Array(REGIONS.map((r) => r.x));
const REG_Z = new Float64Array(REGIONS.map((r) => r.z));
const ROUTE_SEGS = ROUTES.map(([a, b]) => {
  const A = OATH_BY_ID[a].center, B = OATH_BY_ID[b].center;
  const vx = B[0] - A[0], vz = B[1] - A[1];
  return { ax: A[0], az: A[1], bx: B[0], bz: B[1], vx, vz, il: 1 / (vx * vx + vz * vz), ha: SANCTUARY_HEIGHT[a], hb: SANCTUARY_HEIGHT[b], a, b,
    minX: Math.min(A[0], B[0]) - 30, maxX: Math.max(A[0], B[0]) + 30, minZ: Math.min(A[1], B[1]) - 30, maxZ: Math.max(A[1], B[1]) + 30 };
});
const NSEG = ROUTE_SEGS.length;
const R_TIDAL = REGIONS.find((r) => r.id === 'oath-04');
const R_REED = REGIONS.find((r) => r.id === 'oath-06');
const R_KILN = REGIONS.find((r) => r.id === 'oath-01');
const R_STORM = REGIONS.find((r) => r.id === 'oath-03');

// Coast features.
const BAY = { x: R_TIDAL.x + 30, z: R_TIDAL.z - 500, r: 335 };       // southern bay below the Tidal Covenant
const FJORD = { ax: R_REED.x + 210, az: 2300, bx: R_REED.x + 120, bz: R_REED.z + 330, w: 95 }; // northern inlet under Reed cliffs
const CONT = { ax: 2480, az: 2120, cx: 0, cz: 0 };

// scratch for top-3 region weights (non-allocating)
const _ti = new Int32Array(3); const _tw = new Float64Array(3);
function top3(x, z) {
  let i0 = -1, i1 = -1, i2 = -1, w0 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < NREG; i++) {
    const dx = REG_X[i] - x, dz = REG_Z[i] - z; const d2 = dx * dx + dz * dz + 1; const w = 1 / (d2 * d2);
    if (w > w0) { i2 = i1; w2 = w1; i1 = i0; w1 = w0; i0 = i; w0 = w; }
    else if (w > w1) { i2 = i1; w2 = w1; i1 = i; w1 = w; }
    else if (w > w2) { i2 = i; w2 = w; }
  }
  const s = w0 + w1 + w2;
  _ti[0] = i0; _ti[1] = i1; _ti[2] = i2; _tw[0] = w0 / s; _tw[1] = w1 / s; _tw[2] = w2 / s;
}

/** Inverse-distance region weights, normalized. Returns [{id, w}] sorted by weight. */
export function regionWeights(x, z, k = 3) {
  const ws = REGIONS.map((r) => { const d2 = (r.x - x) ** 2 + (r.z - z) ** 2 + 1; return { id: r.id, r, w: 1 / (d2 * d2) }; });
  ws.sort((p, q) => q.w - p.w);
  const top = ws.slice(0, k); const s = top.reduce((a, t) => a + t.w, 0);
  return top.map((t) => ({ id: t.id, r: t.r, w: t.w / s }));
}

// Lava channel strength (0..1) of the raw volcanic landform, before roads/plazas.
function lavaChannel(x, z) {
  const dk = Math.hypot(x - R_KILN.x, z - R_KILN.z);
  if (dk > 760) return 0;
  const n = noise2(x / 300 + 5.3, z / 300 - 2.1) + 0.22 * noise2(x / 80, z / 80);
  return smooth(0.045, 0.012, Math.abs(n)) * smooth(760, 520, dk);
}

function biomeHeight(r, x, z) {
  const b = r.b, f = b.freq;
  const n = fbm(x * f + 31.7, z * f - 11.3, 5);
  const rr = ridged(x * f * 0.8 - 7.1, z * f * 0.8 + 3.9, 5);
  let h = b.base + b.amp * ((1 - b.ridge) * n + b.ridge * (rr - 0.45));
  switch (r.kind) {
    case 1: { // volcanic: caldera rim ridge around the Kiln, black cones, lava channels carved below
      const d = Math.hypot(x - r.x, z - r.z);
      h += 34 * Math.exp(-((d - 470) ** 2) / (2 * 90 * 90)) * (0.7 + 0.5 * n);
      h += 70 * smooth(700, 1000, d) * rr;
      // layered basalt flows: stepped cliff bands away from the city
      const st = h / 13, fl = Math.floor(st); const hs = (fl + smooth(0.72, 0.92, st - fl)) * 13;
      h = h + (hs - h) * smooth(230, 420, d);
      h -= 6.5 * lavaChannel(x, z) * smooth(110, 200, d);
      break;
    }
    case 2: { // glacial: broad U-shaped valleys between high ice ridges
      const v = Math.abs(fbm(x / 760 + 3.1, z / 760 - 8.4, 3));
      h = b.base - 14 + (h - b.base + 30) * smooth(0.02, 0.3, v) * 1.25;
      break;
    }
    case 3: { // alpine: peaks rise steeply behind (north of) the Storm Relay
      const north = smooth(R_STORM.z + 120, R_STORM.z + 520, z);
      h += north * (90 + 140 * rr * rr);
      break;
    }
    case 4: { // coast: white limestone plateau, gentle inland rise
      h = b.base + 4 + Math.abs(n) * b.amp + 6 * smooth(-0.2, 0.4, fbm(x / 160, z / 160, 2));
      break;
    }
    case 5: { // canyon: flat-topped sandstone mesas over a sandy wash
      const m = fbm(x / 340 - 2.2, z / 340 + 9.7, 4);
      const mesa = smooth(0.06, 0.1, m) * (32 + 14 * smooth(0.2, 0.4, m));
      h = b.base - 12 + 4 * n + mesa;
      const t = h / 7; const fl = Math.floor(t); h = (fl + smooth(0.25, 0.75, t - fl)) * 7 * 0.6 + h * 0.4;
      return h;
    }
    case 8: { // marsh: shallow pools and reed islands
      h -= 2.6 * smooth(0.02, 0.3, fbm(x / 95 + 1.7, z / 95 - 4.2, 3)) + 1.2 * smooth(0.1, 0.4, noise2(x / 33, z / 33));
      break;
    }
    case 11: { // badlands: eroded hoodoo fields
      h += 10 * smooth(0.55, 0.75, rr) * smooth(0.0, 0.3, n);
      break;
    }
    default: break;
  }
  if (b.terrace > 0) { const t = h / b.terrace; const fl = Math.floor(t); h = (fl + smooth(0.35, 0.65, t - fl)) * b.terrace; }
  return h;
}

/** Signed distance to the coastline in metres (positive inland, negative at sea). */
export function coastDistance(x, z) {
  const px = Math.abs(x - CONT.cx) / CONT.ax, pz = Math.abs(z - CONT.cz) / CONT.az;
  const e = Math.pow(Math.pow(px, 3) + Math.pow(pz, 3), 1 / 3); // superellipse "radius" 1 at the coast
  let d = (1 - e) * 1950 + fbm(x / 900 + 4.4, z / 900 - 1.7, 3) * 420 + noise2(x / 160, z / 160) * 45;
  // southern bay under the Tidal Covenant
  const db = Math.hypot((x - BAY.x) * 0.85, z - BAY.z) - BAY.r + noise2(x / 90, z / 90) * 26;
  if (db < d) d = db;
  // fjord under the Reed cliffs
  const vx = FJORD.bx - FJORD.ax, vz = FJORD.bz - FJORD.az;
  const t = Math.max(0, Math.min(1, ((x - FJORD.ax) * vx + (z - FJORD.az) * vz) / (vx * vx + vz * vz)));
  const df = Math.hypot(x - FJORD.ax - vx * t, z - FJORD.az - vz * t) - FJORD.w * (0.55 + 0.45 * (1 - t)) + noise2(x / 70, z / 70) * 18;
  if (df < d) d = df;
  return d;
}

/** Continent mask 0 (open sea) .. 1 (inland). Coastline wobbles with noise. */
export function landMask(x, z) {
  return smooth(-60, 90, coastDistance(x, z));
}

const OUT = { h: 0, lava: 0, road: 1e9, coast: 0, plaza: 0, roadW: 0 };
/**
 * Full terrain sample. Fills and returns `out` (default: shared scratch object):
 * {h: height, lava: 0..1 molten channel, road: distance to nearest route centerline (< 30 m, else 1e9),
 *  roadW: 0..1 road flattening weight, coast: signed coast distance, plaza: 0..1 sanctuary influence}.
 */
export function sampleTerrain(x, z, out = OUT) {
  top3(x, z);
  let h = 0, cliff = 0, lavaW = 0;
  for (let k = 0; k < 3; k++) {
    const r = REGIONS[_ti[k]], w = _tw[k];
    if (w < 0.002) continue;
    h += w * biomeHeight(r, x, z);
    cliff += w * r.b.cliff;
    if (r.kind === 1) lavaW += w;
  }
  h += fbm(x / 23, z / 23, 3) * 1.2;

  // roads: gentle cut toward a linear interpolation between sanctuary heights
  let roadW = 0, roadH = 0, roadD = 1e9;
  for (let i = 0; i < NSEG; i++) {
    const s = ROUTE_SEGS[i];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * s.vx + (z - s.az) * s.vz) * s.il));
    const d = Math.hypot(x - s.ax - s.vx * t, z - s.az - s.vz * t);
    if (d < roadD) roadD = d;
    if (d < 26) {
      const w = 1 - smooth(5, 26, d);
      if (w > roadW) { roadW = w; roadH = s.ha + (s.hb - s.ha) * smooth(0, 1, t) + noise2(x / 140, z / 140) * 5; }
    }
  }
  if (roadW > 0) h = h + (roadH - h) * roadW * 0.92;

  // sanctuaries: eased city ring (the flat core is enforced after the coastline)
  let plaza = 0, coreH = NaN, protect = 0;
  const cr = SANCTUARY.cityRadius, core = cr * 0.55;
  for (let i = 0; i < NREG; i++) {
    const dx = x - REG_X[i], dz = z - REG_Z[i];
    if (dx > cr + 120 || dx < -cr - 120 || dz > cr + 120 || dz < -cr - 120) continue;
    const d = Math.hypot(dx, dz);
    if (d < cr + 120) {
      const w = 1 - smooth(core, cr + 120, d);
      h = h + (REGIONS[i].h - h) * w;
      if (w > plaza) plaza = w;
      const pw = 1 - smooth(core, core + 60, d);
      if (pw > protect) protect = pw;
      if (d < core) coreH = REGIONS[i].h;
    }
  }

  // coastline: sheer cliffs on rocky coasts, beaches elsewhere; limestone sea stacks in the bay
  const cd = coastDistance(x, z);
  if (cd < 420 && protect < 1) {
    const hLand = h;
    const beach = mixf(-26, h, smooth(-170, 260, cd));
    const cliffH = cd > 0 ? mixf(-9, h, smooth(0, 16, cd)) : -9 - 17 * smooth(0, -160, cd);
    let c = smooth(0.15, 0.85, cliff);
    h = mixf(beach, cliffH, c);
    if (cd < -14 && cd > -200 && cliff > 0.55) { // stacks, mostly in the Tidal bay and along cliff coasts
      const cx = Math.floor(x / 70), cz = Math.floor(z / 70);
      const ox = (cx + 0.2 + 0.6 * hash2(cx, cz)) * 70, oz = (cz + 0.2 + 0.6 * hash2(cz, cx + 7)) * 70;
      const rr = 7 + 9 * hash2(cx + 3, cz - 5);
      const ds = Math.hypot(x - ox, z - oz);
      if (ds < rr && hash2(cx - 11, cz + 13) < 0.3 * c) {
        const top = 8 + 22 * hash2(cx + 1, cz + 1);
        h = Math.max(h, mixf(top, h, smooth(rr * 0.55, rr, ds)) + noise2(x / 6, z / 6) * 1.5);
      }
    }
    if (protect > 0) h = mixf(h, hLand, protect);
  }
  if (!Number.isNaN(coreH)) h = coreH;

  out.h = h;
  out.lava = lavaW > 0.05 && Number.isNaN(coreH) ? lavaChannel(x, z) * smooth(0.35, 0.7, lavaW) * (1 - roadW) * (1 - smooth(0.05, 0.4, plaza)) * (cd > 30 ? 1 : 0) : 0;
  out.road = roadD; out.roadW = roadW; out.coast = cd; out.plaza = plaza;
  return out;
}
function mixf(a, b, t) { return a + (b - a) * t; }

/** Terrain height in metres at world (x, z). */
export function heightAt(x, z) {
  return sampleTerrain(x, z, OUT).h;
}

/** Molten lava channel strength 0..1 (volcanic region only). */
export function lavaAt(x, z) { return sampleTerrain(x, z, OUT).lava; }

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
  for (const s of ROUTE_SEGS) {
    const t = Math.max(0, Math.min(1, ((x - s.ax) * s.vx + (z - s.az) * s.vz) * s.il));
    const d = Math.hypot(x - s.ax - s.vx * t, z - s.az - s.vz * t);
    if (d < best.d) best = { d, route: `${s.a}:${s.b}` };
  }
  return best;
}

export function isWater(x, z) { return heightAt(x, z) < SEA_LEVEL; }
