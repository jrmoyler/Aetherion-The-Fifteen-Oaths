// Collider audit: compares the walkable surfaces implied by the built sanctuary geometry with
// what the 2.5D collision world actually supports. Runs headless (Node via tools/qa/collision-audit.mjs)
// or in the browser (window.__aetherion) — it only needs the generator, not a scene.
//
// Method (per sanctuary, sanctuary-local grid of CELL metres over the city footprint):
//  1. Rasterise every triangle of the merged builders + thin-instance protos into vertical columns
//     (= a downward raycast per column that records every crossing, not just the first).
//  2. Walkable surface = up-facing near-horizontal crossing (ny > 0.8) with >= 1.0 m headroom,
//     not cloth/foliage/liquid, at least ~0.8 m wide (neighbours in both axes); terrain counts too
//     where it is not buried in geometry.
//  3. Reachability = flood fill from ground-level surfaces through 4-neighbour steps that climb
//     <= 0.65 m (stairs, ramps, decks); drops are allowed.
//  4. Gap = reachable surface more than 0.4 m above terrain where collision.groundAt() is more than
//     0.3 m below the visual surface (you would fall/sink). "solidOnly" = gap that a solid collider
//     at least stops you entering. Wall gap = a column next to a reachable surface that is inside
//     solid geometry at waist height (first crossing above is up-facing) with no blocking collider.
//  5. Unreachable elevated decks (connected walkable components with no stair) are listed so the
//     designer can decide whether they are meant to be walked (e.g. the Escapement viaduct).
import { heightAt } from '@shared/terrain.js';
import { CollisionWorld } from '../core/collision.js';
import { computeMetas, makeContext, cityGen, toWorld } from './gen.js';
import { getProtos, matDef } from './kit.js';

const CELL = 0.4;
const EXTENT = 150; // sanctuary-local half extent (city wall r=146)
const NONSOLID = /^(cloth\.|foliage\.|liquid\.)/;

function matClass(id) {
  if (typeof id === 'string' && id.startsWith('banner:')) return 'cloth';
  const def = matDef(id); const key = def?.key ?? '';
  return NONSOLID.test(key) ? 'soft' : 'solid';
}

/** Generate one sanctuary headlessly; colliders go into `collision`. */
export function generate(m, collision, qDensity = 1) {
  // animated pieces (gears, pistons, orbs) are audited statically at their rest pose
  const animMesh = (S, name, x, y, z, ry, build) => { S.F.push(x, y, z, ry); build(S.d); S.F.pop(); };
  const S = makeContext(m, false, { ctx: { collision }, scene: null, collision, lightBudget: 0, qDensity, animMesh });
  const g = cityGen(S); while (!g.next().done) { /* run */ }
  return S;
}

/** Triangle soup in sanctuary-local space: calls fn(ax,ay,az,bx,by,bz,cx,cy,cz,nyAvg,cls). */
function forEachTri(S, fn) {
  for (const B of [S.b, S.d]) {
    for (const [mat, bk] of B.buckets) {
      const cls = matClass(mat); const P = bk.p, N = bk.n, I = bk.i;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        fn(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2], (N[a + 1] + N[b + 1] + N[c + 1]) / 3, cls);
      }
    }
  }
  const protos = getProtos();
  for (const [name, arr] of S.inst.sets) {
    const P0 = protos[name]; if (!P0) continue;
    for (const part of P0.parts()) {
      const cls = matClass(part.mat); const P = part.vd.positions, N = part.vd.normals, I = part.vd.indices;
      for (let k = 0; k < arr.length; k += 16) {
        const m0 = arr[k], m1 = arr[k + 1], m2 = arr[k + 2], m4 = arr[k + 4], m5 = arr[k + 5], m6 = arr[k + 6], m8 = arr[k + 8], m9 = arr[k + 9], m10 = arr[k + 10], tx = arr[k + 12], ty = arr[k + 13], tz = arr[k + 14];
        const X = (i) => P[i] * m0 + P[i + 1] * m4 + P[i + 2] * m8 + tx, Yv = (i) => P[i] * m1 + P[i + 1] * m5 + P[i + 2] * m9 + ty, Z = (i) => P[i] * m2 + P[i + 1] * m6 + P[i + 2] * m10 + tz;
        for (let t = 0; t < I.length; t += 3) {
          const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
          const ny = (N[a] * m1 + N[a + 1] * m5 + N[a + 2] * m9 + N[b] * m1 + N[b + 1] * m5 + N[b + 2] * m9 + N[c] * m1 + N[c + 1] * m5 + N[c + 2] * m9) / 3;
          fn(X(a), Yv(a), Z(a), X(b), Yv(b), Z(b), X(c), Yv(c), Z(c), ny, cls);
        }
      }
    }
  }
}

/** Column hit structure: per column sorted crossings (y, ny, soft). */
function rasterise(S) {
  const W = Math.round((EXTENT * 2) / CELL); const NC = W * W;
  let cap = 1 << 22; let hy = new Float32Array(cap), hn = new Float32Array(cap), hs = new Uint8Array(cap), nx = new Int32Array(cap); let n = 0;
  const head = new Int32Array(NC).fill(-1);
  const push = (col, y, ny, soft) => {
    if (n >= cap) { cap *= 2; const a = new Float32Array(cap); a.set(hy); hy = a; const b = new Float32Array(cap); b.set(hn); hn = b; const c = new Uint8Array(cap); c.set(hs); hs = c; const d = new Int32Array(cap); d.set(nx); nx = d; }
    hy[n] = y; hn[n] = ny; hs[n] = soft; nx[n] = head[col]; head[col] = n; n++;
  };
  let tris = 0;
  forEachTri(S, (ax, ay, az, bx, by, bz, cx, cy, cz, ny, cls) => {
    tris++;
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-9) return; // vertical in plan: never crossed by a vertical ray
    const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx), z0 = Math.min(az, bz, cz), z1 = Math.max(az, bz, cz);
    const i0 = Math.max(0, Math.ceil((x0 + EXTENT) / CELL - 0.5)), i1 = Math.min(W - 1, Math.floor((x1 + EXTENT) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 + EXTENT) / CELL - 0.5)), j1 = Math.min(W - 1, Math.floor((z1 + EXTENT) / CELL - 0.5));
    if (i0 > i1 || j0 > j1) return;
    const soft = cls === 'soft' ? 1 : 0;
    // geometric normal y sign for facing (vertex normals can be smoothed)
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx; const gl = Math.hypot(gx, gy, gz) || 1; gy /= gl;
    const nyF = Math.sign(ny || 1) * Math.abs(gy);
    for (let i = i0; i <= i1; i++) {
      const px = -EXTENT + (i + 0.5) * CELL;
      for (let j = j0; j <= j1; j++) {
        const pz = -EXTENT + (j + 0.5) * CELL;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den; if (l1 < -1e-6 || l1 > 1 + 1e-6) continue;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den; if (l2 < -1e-6 || l2 > 1 + 1e-6) continue;
        const l3 = 1 - l1 - l2; if (l3 < -1e-6) continue;
        push(i * W + j, l1 * ay + l2 * by + l3 * cy, nyF, soft);
      }
    }
  });
  // compact into per-column sorted arrays
  const start = new Int32Array(NC + 1); const Y = new Float32Array(n), NY = new Float32Array(n), SOFT = new Uint8Array(n);
  let o = 0; const tmp = [];
  for (let c = 0; c < NC; c++) {
    start[c] = o; tmp.length = 0;
    for (let h = head[c]; h >= 0; h = nx[h]) tmp.push(h);
    if (tmp.length > 1) tmp.sort((a, b) => hy[a] - hy[b]);
    for (const h of tmp) { Y[o] = hy[h]; NY[o] = hn[h]; SOFT[o] = hs[h]; o++; }
  }
  start[NC] = o;
  return { W, NC, start, Y, NY, SOFT, tris };
}

function shapeContains(col, sh, x, z, pad) {
  if (sh.type === 'circle') return Math.hypot(x - sh.cx, z - sh.cz) <= sh.r + pad;
  const [lx, lz] = col._local(sh, x, z); return Math.abs(lx) <= sh.hw + pad && Math.abs(lz) <= sh.hd + pad;
}

export function auditSanctuary(m, opts = {}) {
  const collision = opts.collision ?? new CollisionWorld();
  const c0 = collision.count;
  const t0 = Date.now();
  const S = generate(m, collision, opts.qDensity ?? 1);
  const R = rasterise(S);
  const { W, NC, start, Y, NY, SOFT } = R;
  const cellA = CELL * CELL;
  const local = (c) => [-EXTENT + (Math.floor(c / W) + 0.5) * CELL, -EXTENT + ((c % W) + 0.5) * CELL];
  const terr = new Float32Array(NC);
  for (let c = 0; c < NC; c++) { const [x, z] = local(c); const [wx, wz] = toWorld(m, x, z); terr[c] = heightAt(wx, wz) - m.Y; }

  // first solid crossing strictly above y; returns index or -1
  const firstAbove = (c, y) => {
    for (let k = start[c]; k < start[c + 1]; k++) {
      if (Y[k] <= y + 1e-4 || SOFT[k]) continue;
      return k;
    }
    return -1;
  };
  // inside a closed solid: crossings above net more exits than entries AND crossings below net
  // more entries than exits (robust to overlapping boxes, ignores open shells such as hip roofs)
  const insideSolid = (c, y) => {
    let above = 0, below = 0;
    for (let k = start[c]; k < start[c + 1]; k++) {
      if (SOFT[k] || Math.abs(NY[k]) < 0.05) continue;
      const up = NY[k] > 0 ? 1 : -1;
      if (Y[k] > y) above += up; else below -= up;
    }
    return above > 0 && below > 0;
  };

  // ---- surfaces (nodes)
  const nodeStart = new Int32Array(NC + 1); const nY = []; const nCol = [];
  for (let c = 0; c < NC; c++) {
    nodeStart[c] = nY.length;
    const t = terr[c];
    if (!insideSolid(c, t + 0.02)) { const k = firstAbove(c, t + 0.02); if (k < 0 || Y[k] - t >= 1.0) { nY.push(t); nCol.push(c); } }
    for (let k = start[c]; k < start[c + 1]; k++) {
      if (SOFT[k] || NY[k] < 0.8) continue;
      const y = Y[k]; if (y < t - 0.05) continue; // buried below terrain
      if (nY.length > nodeStart[c] && Math.abs(nY[nY.length - 1] - y) < 0.05) continue;
      const a = firstAbove(c, y + 0.01); if (a >= 0 && Y[a] - y < 1.0) continue; // no headroom (internal face)
      if (insideSolid(c, y + 0.02)) continue; // top face buried inside another solid
      nY.push(y); nCol.push(c);
    }
  }
  nodeStart[NC] = nY.length;
  const NN = nY.length;
  const nodeYArr = Float32Array.from(nY); const nodeColArr = Int32Array.from(nCol);
  const nbrCols = (c) => { const i = Math.floor(c / W), j = c % W; const out = []; if (i > 0) out.push(c - W); if (i < W - 1) out.push(c + W); if (j > 0) out.push(c - 1); if (j < W - 1) out.push(c + 1); return out; };
  const findNode = (c, y, tol) => { let best = -1, bd = tol; for (let k = nodeStart[c]; k < nodeStart[c + 1]; k++) { const d = Math.abs(nodeYArr[k] - y); if (d <= bd) { bd = d; best = k; } } return best; };
  // width: neighbour (|dy|<=0.5) in both axes
  const wide = new Uint8Array(NN);
  for (let k = 0; k < NN; k++) {
    const c = nodeColArr[k], y = nodeYArr[k]; const i = Math.floor(c / W), j = c % W;
    const hx = (i > 0 && findNode(c - W, y, 0.5) >= 0) || (i < W - 1 && findNode(c + W, y, 0.5) >= 0);
    const hz = (j > 0 && findNode(c - 1, y, 0.5) >= 0) || (j < W - 1 && findNode(c + 1, y, 0.5) >= 0);
    wide[k] = hx && hz ? 1 : 0;
  }
  // ---- reachability flood
  const reach = new Uint8Array(NN); const q = [];
  for (let k = 0; k < NN; k++) if (wide[k] && nodeYArr[k] - terr[nodeColArr[k]] <= 0.6) { reach[k] = 1; q.push(k); }
  while (q.length) {
    const k = q.pop(); const y = nodeYArr[k];
    for (const nc of nbrCols(nodeColArr[k])) for (let k2 = nodeStart[nc]; k2 < nodeStart[nc + 1]; k2++) {
      if (reach[k2] || !wide[k2]) continue;
      if (nodeYArr[k2] - y <= 0.65) { reach[k2] = 1; q.push(k2); }
    }
  }
  // ---- coverage
  const worldOf = (c) => { const [x, z] = local(c); return toWorld(m, x, z); };
  const res = { id: m.id, name: m.oath.name, walkElevated: 0, uncovered: 0, solidOnly: 0, phantom: 0, wallGap: 0, unreachableDecks: [], clusters: { uncovered: [], wall: [] }, colliders: collision.count - c0, tris: R.tris };
  const flagged = new Map(); const wallCells = new Map(); const solidCells = new Map();
  for (let k = 0; k < NN; k++) {
    if (!reach[k]) continue;
    const c = nodeColArr[k], y = nodeYArr[k]; const [wx, wz] = worldOf(c); const wy = m.Y + y;
    if (y - terr[c] > 0.4) {
      res.walkElevated += cellA;
      let g = -1e9;
      for (const [ox, oz] of [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]]) g = Math.max(g, collision.groundAt(wx + ox, wz + oz, wy + 0.3, 0.6));
      if (g < wy - 0.3) {
        let solid = false;
        for (const sh of collision._near(wx, wz)) if (!sh.walkable && sh.yMax >= wy - 0.35 && sh.yMin < wy + 1.6 && shapeContains(collision, sh, wx, wz, 0.2)) { solid = true; break; }
        if (solid) { res.solidOnly += cellA; solidCells.set(c, y); } else { res.uncovered += cellA; flagged.set(c, y); }
      } else if (g > wy + 0.45) res.phantom += cellA;
    }
    // wall check on neighbours at waist height
    for (const nc of nbrCols(c)) {
      if (wallCells.has(nc)) continue;
      if (!insideSolid(nc, y + 1.0) || !insideSolid(nc, y + 1.5)) continue;
      const [nx2, nz2] = worldOf(nc); let blocked = false;
      for (const sh of collision._near(nx2, nz2)) if (m.Y + y + 1.7 >= sh.yMin && m.Y + y + 0.55 < sh.yMax && shapeContains(collision, sh, nx2, nz2, 0.35)) { blocked = true; break; }
      if (!blocked) wallCells.set(nc, y);
    }
  }
  res.wallGap = wallCells.size * cellA;
  // clusters (8-connected) for reporting
  const clusters = (cells) => {
    const seen = new Set(); const out = [];
    for (const [c0c, y0] of cells) {
      if (seen.has(c0c)) continue; const st = [c0c]; seen.add(c0c); let n = 0, sx = 0, sz = 0, sy = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      while (st.length) {
        const c = st.pop(); const [x, z] = local(c); const y = cells.get(c); n++; sx += x; sz += z; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
        const i = Math.floor(c / W), j = c % W;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= W) continue; const cc = ii * W + jj; if (!seen.has(cc) && cells.has(cc) && Math.abs(cells.get(cc) - y) < 1.5) { seen.add(cc); st.push(cc); } }
      }
      const [wx, wz] = toWorld(m, sx / n, sz / n);
      out.push({ area: +(n * cellA).toFixed(2), local: [+(sx / n).toFixed(1), +(sz / n).toFixed(1)], y: +(sy / n).toFixed(2), world: [+wx.toFixed(1), +(m.Y + sy / n).toFixed(2), +wz.toFixed(1)], size: [+(x1 - x0 + CELL).toFixed(1), +(z1 - z0 + CELL).toFixed(1)] });
    }
    return out.sort((a, b) => b.area - a.area);
  };
  res.clusters.uncovered = clusters(flagged).slice(0, 12);
  res.clusters.solidOnly = clusters(solidCells).slice(0, 12);
  res.clusters.wall = clusters(wallCells).filter((c) => c.area >= 0.5).slice(0, 12);
  // ---- unreachable elevated decks
  const deckCells = new Map();
  for (let k = 0; k < NN; k++) { if (reach[k] || !wide[k]) continue; const c = nodeColArr[k]; const y = nodeYArr[k]; if (y - terr[c] < 2) continue; if (!deckCells.has(c) || deckCells.get(c) < y) deckCells.set(c, y); }
  const decks = clusters(deckCells).filter((d) => d.area >= 30);
  for (const d of decks) {
    // collider coverage of the deck centre
    const [wx, wz] = toWorld(m, d.local[0], d.local[1]); const g = collision.groundAt(wx, wz, m.Y + d.y + 0.3, 0.6);
    d.centreCovered = Math.abs(g - (m.Y + d.y)) < 0.35;
  }
  res.unreachableDecks = decks.slice(0, 25);
  res.unreachableDeckArea = +decks.reduce((a, d) => a + d.area, 0).toFixed(1);
  for (const k of ['walkElevated', 'uncovered', 'solidOnly', 'phantom', 'wallGap']) res[k] = +res[k].toFixed(2);
  res.ms = Date.now() - t0;
  return res;
}

/** Audit every (or the listed) sanctuary. */
export function runAudit(ids = null, opts = {}) {
  const metas = computeMetas().filter((m) => !ids || ids.includes(m.id));
  return metas.map((m) => auditSanctuary(m, opts));
}

/** Debug: crossings, terrain and colliders for sanctuary-local points. */
export function probe(id, pts) {
  const m = computeMetas().find((x) => x.id === id); const collision = new CollisionWorld();
  const S = generate(m, collision); const R = rasterise(S);
  return pts.map(([x, z]) => {
    const i = Math.round((x + EXTENT) / CELL - 0.5), j = Math.round((z + EXTENT) / CELL - 0.5); const c = i * R.W + j;
    const hits = []; for (let k = R.start[c]; k < R.start[c + 1]; k++) hits.push([+R.Y[k].toFixed(2), +R.NY[k].toFixed(2), R.SOFT[k]]);
    const [wx, wz] = toWorld(m, x, z);
    const shapes = collision._near(wx, wz).filter((sh) => shapeContains(collision, sh, wx, wz, 0.3)).map((sh) => ({ type: sh.type, walk: sh.walkable, y0: +(sh.yMin - m.Y).toFixed(2), y1: +(sh.yMax - m.Y).toFixed(2), ramp: !!sh.ramp }));
    return { x, z, terr: +(heightAt(wx, wz) - m.Y).toFixed(2), hits, shapes, ground: +(collision.groundAt(wx, wz, 1e9) - m.Y).toFixed(2) };
  });
}
