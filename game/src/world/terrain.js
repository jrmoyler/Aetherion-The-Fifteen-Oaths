// Quadtree terrain streaming around the active camera (and focus points): nodes from 1024 m down
// to 64 m, fixed 32×32 quads per node, skirts hide LOD cracks. Vertex data is built in workers
// and turned into meshes incrementally under a per-frame budget (no hitches).
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { buildIndices } from './terrainCore.js';
import { TERRAIN_CACHE_LIMITS, terrainEvictions } from './residency.js';
import { heightAt } from '@shared/terrain.js';

const ROOT = 1024, EXTENT = 3072;

export function createTerrain(ctx, pool, material) {
  const { scene, quality } = ctx;
  const res = quality.name === 'low' ? 48 : 64;
  const minSize = 128;
  const K = { low: 0.8, medium: 0.9, high: 1.0, ultra: 1.25 }[quality.name] ?? 1.0;
  const indices = buildIndices(res);
  const nodes = new Map(); // key -> node
  const viewers = []; // {x, z, until}
  let shownCount = 0, built = 0, retired = 0;
  const cacheLimit = TERRAIN_CACHE_LIMITS[quality.name] ?? TERRAIN_CACHE_LIMITS.high;
  const shadowLimit = quality.shadows ? 128 : 0;
  const root = new Mesh('terrainRoot', scene); root.isPickable = false; root.setEnabled(true);

  const key = (x0, z0, size) => `${x0},${z0},${size}`;
  function getNode(x0, z0, size) {
    const k = key(x0, z0, size); let n = nodes.get(k);
    if (!n) { n = { k, x0, z0, size, mesh: null, state: 0, used: 0, lastUsed: performance.now(), minY: 0, maxY: 120, shown: false, caster: false }; nodes.set(k, n); }
    return n;
  }

  function request(n, prio) {
    n.prio = prio;
    if (n.state !== 0) return;
    n.state = 1;
    pool.run({ t: 'node', x0: n.x0, z0: n.z0, size: n.size, res, skirt: Math.max(2, n.size / 24) }, () => n.prio, () => nodes.get(n.k) !== n)
      .then((r) => { if (nodes.get(n.k) !== n) return; n.data = r; n.state = 2; pendingMeshes.push(n); })
      .catch(() => { if (nodes.get(n.k) === n) n.state = 0; });
  }
  const pendingMeshes = [];

  function makeMesh(n) {
    const r = n.data; n.data = null;
    const m = new Mesh(`terrain_${n.k}`, scene);
    m.setVerticesData(VertexBuffer.PositionKind, r.pos, false, 3);
    m.setVerticesData(VertexBuffer.NormalKind, r.nrm, false, 3);
    m.setVerticesData(VertexBuffer.ColorKind, r.col, false, 4);
    m.setVerticesData('tw0', r.w0, false, 4);
    m.setVerticesData('tw1', r.w1, false, 4);
    m.setVerticesData('taux', r.aux, false, 4);
    m.setIndices(indices, r.pos.length / 3);
    m.position.set(n.x0, 0, n.z0);
    m.metadata = { slots: r.slots, terrain: true };
    m.material = material;
    m.receiveShadows = true;
    m.isPickable = false;
    m.hasVertexAlpha = false;
    m.setBoundingInfo(new BoundingInfo(new Vector3(0, r.minY, 0), new Vector3(n.size, r.maxY, n.size)));
    m.computeWorldMatrix(true); m.freezeWorldMatrix();
    m.cullingStrategy = Mesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
    m.parent = null;
    m.setEnabled(false);
    n.minY = r.minY; n.maxY = r.maxY;
    n.mesh = m; n.state = 3; built++;
  }

  function distTo(n, x, y, z) {
    const cx = Math.max(n.x0, Math.min(x, n.x0 + n.size)), cz = Math.max(n.z0, Math.min(z, n.z0 + n.size));
    const cy = Math.max(n.minY, Math.min(y, n.maxY));
    return Math.hypot(x - cx, (y - cy) * 0.5, z - cz);
  }
  function viewDist(n, cam) {
    let d = distTo(n, cam.x, cam.y, cam.z);
    for (const v of viewers) d = Math.min(d, distTo(n, v.x, v.y, v.z));
    return d;
  }

  let frame = 0;
  // returns true if this subtree is fully covered by shown meshes
  function visit(n, cam, toShow) {
    n.used = frame; n.lastUsed = performance.now();
    const d = viewDist(n, cam);
    const split = n.size > minSize && d < n.size * K;
    request(n, d - n.size * 3);
    if (!split) {
      if (n.state === 3) { toShow.push(n); return true; }
      return false;
    }
    const h = n.size / 2; const kids = [getNode(n.x0, n.z0, h), getNode(n.x0 + h, n.z0, h), getNode(n.x0, n.z0 + h, h), getNode(n.x0 + h, n.z0 + h, h)];
    const mark = toShow.length; let all = true;
    for (const c of kids) if (!visit(c, cam, toShow)) all = false;
    if (!all && n.state === 3) { toShow.length = mark; toShow.push(n); return true; }
    return all;
  }

  const camPos = new Vector3();
  let shown = new Set();
  function update(dt) {
    frame++;
    const cam = scene.activeCamera; if (!cam) return;
    camPos.copyFrom(cam.globalPosition ?? cam.position);
    const now = performance.now();
    for (let i = viewers.length - 1; i >= 0; i--) if (viewers[i].until < now) viewers.splice(i, 1);
    // build meshes under a budget
    const t0 = performance.now(); const budget = ctx.__loading ? 30 : 4;
    pendingMeshes.sort((a, b) => a.prio - b.prio);
    while (pendingMeshes.length && performance.now() - t0 < budget) { const n = pendingMeshes.shift(); if (nodes.get(n.k) === n && n.state === 2) makeMesh(n); }
    // traverse
    const toShow = [];
    for (let z = -EXTENT; z < EXTENT; z += ROOT) for (let x = -EXTENT; x < EXTENT; x += ROOT) visit(getNode(x, z, ROOT), camPos, toShow);
    const next = new Set(toShow);
    for (const n of shown) if (!next.has(n)) { n.mesh?.setEnabled(false); n.shown = false; if (n.caster) { ctx.render?.removeShadowCaster(n.mesh); n.caster = false; } }
    for (const n of next) if (!n.shown) { n.mesh.setEnabled(true); n.shown = true; }
    for (const n of next) {
      const wantCast = n.size <= shadowLimit && viewDist(n, camPos) < 150;
      if (wantCast !== n.caster && n.mesh) { if (wantCast) ctx.render?.addShadowCaster(n.mesh, false); else ctx.render?.removeShadowCaster(n.mesh); n.caster = wantCast; }
    }
    shown = next; shownCount = next.size;
    // Retire a bounded number of cold meshes each frame. Never evict desired LODs,
    // currently visible fallback coverage, or coarse roots that prevent terrain holes.
    for (const n of terrainEvictions(nodes, { frame, now, limit: cacheLimit, rootSize: ROOT })) {
      if (n.caster) ctx.render?.removeShadowCaster(n.mesh);
      n.mesh?.dispose(); n.mesh = null; n.data = null;
      nodes.delete(n.k); retired++;
    }
    // Discard stale worker payload references immediately instead of waiting for upload.
    for (let i = pendingMeshes.length - 1; i >= 0; i--) {
      if (nodes.get(pendingMeshes[i].k) !== pendingMeshes[i]) pendingMeshes.splice(i, 1);
    }
  }

  function focus(x, z, seconds = 30) {
    const y = heightAt(x, z);
    viewers.push({ x, y: y + 2, z, until: performance.now() + seconds * 1000 });
  }

  /** true when every shown/desired leaf within r of (x,z) is at the finest wanted level and built */
  function isReady(x, z, r = 160) {
    const y = heightAt(x, z);
    const p = { x, y: y + 2, z };
    let ok = true;
    const check = (n) => {
      if (n.x0 > x + r || n.x0 + n.size < x - r || n.z0 > z + r || n.z0 + n.size < z - r) return;
      const d = Math.min(distTo(n, p.x, p.y, p.z), viewDist(n, camPos));
      const split = n.size > minSize && d < n.size * K;
      if (!split) { if (n.state !== 3) ok = false; return; }
      const h = n.size / 2;
      for (const c of [getNode(n.x0, n.z0, h), getNode(n.x0 + h, n.z0, h), getNode(n.x0, n.z0 + h, h), getNode(n.x0 + h, n.z0 + h, h)]) { if (c.state === 0) request(c, 0); check(c); }
    };
    for (let zz = -EXTENT; zz < EXTENT; zz += ROOT) for (let xx = -EXTENT; xx < EXTENT; xx += ROOT) { const n = getNode(xx, zz, ROOT); if (n.state === 0) request(n, 0); check(n); }
    return ok;
  }

  return { update, focus, isReady, get shownCount() { return shownCount; }, get builtCount() { return built; }, get residentCount() { return nodes.size; }, get retiredCount() { return retired; }, cacheLimit, nodes, root };
}
