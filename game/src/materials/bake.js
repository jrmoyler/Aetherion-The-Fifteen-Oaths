// Texture-set baking (pure JS, no Babylon) shared by the main thread and the bake worker.
import { MATERIALS } from './library.js';
import { srgbToLinear } from './noise.js';

const BAKED = new Map();
function blurWrap(src, N, r) {
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  const w = 1 / (2 * r + 1);
  for (let y = 0; y < N; y++) {
    let s = 0; const row = y * N;
    for (let k = -r; k <= r; k++) s += src[row + ((k + N) % N)];
    for (let x = 0; x < N; x++) {
      tmp[row + x] = s * w;
      s += src[row + ((x + r + 1) % N)] - src[row + ((x - r + N) % N)];
    }
  }
  for (let x = 0; x < N; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[((k + N) % N) * N + x];
    for (let y = 0; y < N; y++) {
      out[y * N + x] = s * w;
      s += tmp[((y + r + 1) % N) * N + x] - tmp[((y - r + N) % N) * N + x];
    }
  }
  return out;
}

export function bake(key, N, cache = true) {
  const id = `${key}@${N}`;
  if (cache && BAKED.has(id)) return BAKED.get(id);
  const def = MATERIALS[key];
  const t0 = performance.now();
  const P = N * N;
  const Hh = new Float32Array(P), Al = new Float32Array(P * 3), Ro = new Float32Array(P), Me = new Float32Array(P);
  const Em = def.emissiveTex ? new Float32Array(P * 3) : null;
  const o = { h: 0.5, r: 0.5, g: 0.5, b: 0.5, rough: 0.8, metal: 0, er: 0, eg: 0, eb: 0 };
  for (let y = 0; y < N; y++) {
    const v = (y + 0.5) / N;
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N; const i = y * N + x;
      o.er = o.eg = o.eb = 0;
      def.gen(u, v, o);
      Hh[i] = o.h; Al[i * 3] = o.r; Al[i * 3 + 1] = o.g; Al[i * 3 + 2] = o.b; Ro[i] = o.rough; Me[i] = o.metal;
      if (Em) { Em[i * 3] = o.er; Em[i * 3 + 1] = o.eg; Em[i * 3 + 2] = o.eb; }
    }
  }
  const blur = blurWrap(blurWrap(Hh, N, Math.max(1, N >> 6)), N, Math.max(1, N >> 6));
  const albedo = new Uint8Array(P * 4), normal = new Uint8Array(P * 4), orm = new Uint8Array(P * 4);
  const emis = Em ? new Uint8Array(P * 4) : null;
  const ns = (def.normal ?? 1) * N / 48;
  let lr = 0, lg = 0, lb = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const hl = Hh[y * N + ((x - 1 + N) % N)], hr = Hh[y * N + ((x + 1) % N)];
      const hd = Hh[((y - 1 + N) % N) * N + x], hu = Hh[((y + 1) % N) * N + x];
      let nx = -(hr - hl) * ns, ny = -(hu - hd) * ns, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      normal[i * 4] = (nx * 0.5 + 0.5) * 255; normal[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; normal[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; normal[i * 4 + 3] = 255;
      const cav = Math.max(0, blur[i] - Hh[i]); const cvx = Math.max(0, Hh[i] - blur[i]);
      const grime = Math.min(1, cav * 5.5);
      const wear = Math.min(1, cvx * 4.0);
      const ao = Math.max(0.25, 1 - cav * 4.5);
      const metal = Me[i];
      let r = Al[i * 3], g = Al[i * 3 + 1], b = Al[i * 3 + 2];
      const gk = 1 - grime * 0.45; const wk = 1 + wear * (metal > 0.5 ? 0.25 : 0.35);
      r = Math.min(1, Math.max(0, r * gk * wk)); g = Math.min(1, Math.max(0, g * gk * wk)); b = Math.min(1, Math.max(0, b * gk * wk));
      albedo[i * 4] = r * 255; albedo[i * 4 + 1] = g * 255; albedo[i * 4 + 2] = b * 255; albedo[i * 4 + 3] = 255;
      lr += srgbToLinear(r); lg += srgbToLinear(g); lb += srgbToLinear(b);
      const rough = Math.min(1, Math.max(0.02, Ro[i] + grime * 0.12 - wear * (metal > 0.5 ? 0.12 : 0.04)));
      orm[i * 4] = ao * 255; orm[i * 4 + 1] = rough * 255; orm[i * 4 + 2] = Math.min(1, Math.max(0, metal)) * 255; orm[i * 4 + 3] = 255;
      if (emis) { emis[i * 4] = Math.min(1, Em[i * 3]) * 255; emis[i * 4 + 1] = Math.min(1, Em[i * 3 + 1]) * 255; emis[i * 4 + 2] = Math.min(1, Em[i * 3 + 2]) * 255; emis[i * 4 + 3] = 255; }
    }
  }
  const res = { N, albedo, normal, orm, emis, avgLin: [lr / P, lg / P, lb / P], ms: performance.now() - t0 };
  if (cache) BAKED.set(id, res);
  return res;
}


export function storeBaked(key, res) { BAKED.set(`${key}@${res.N}`, res); }
export function getBaked(key, N) { return BAKED.get(`${key}@${N}`) || null; }
