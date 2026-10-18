// Fifteen sanctuary cities. Builds each sanctuary (arena plaza, inlaid emblem, balustrades,
// hall, region signature structures, districts, walls, waypoint shrine, NPC spots) from the
// shared kit + per-oath style, merged per material per layer, with thin instances for repeated
// modules, three detail levels (full / main / far skyline silhouette), lazy nearest-first
// incremental building, colliders and shadow casters.
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { OATHS, OATH_BY_ID } from '@shared/oaths.js';
import { SANCTUARY_HEIGHT } from '@shared/terrain.js';
import { getMaterial, tickMaterials, setTextureSize, textureSizeForQuality, materialStats } from '../materials/index.js';
import { Frame, Builder } from './builder.js';
import { MF, matDef, getProtos } from './kit.js';
import { drawEmblem } from './emblems.js';
import { computeMetas, toWorld, makeContext as makeGenContext, cityGen } from './gen.js';
import { buildRoads } from './roads.js';

const KEY_COLORS = {
  'stone.basalt': '#2a2826', 'stone.marble': '#e4e0d8', 'stone.limestone': '#d8d0c0', 'stone.sandstone': '#b8946a', 'stone.slate': '#3e434b',
  'stone.shale': '#5e5650', 'stone.darkgranite': '#3c3c40', 'stone.terracotta': '#8a4a30', 'paving.flagstone': '#7a7670', 'paving.hex': '#7a7670',
  'metal.brass': '#a8844a', 'metal.copper': '#a0603c', 'metal.iron': '#3a3634', 'metal.gold': '#c8a050', 'metal.steel': '#8a8c90',
  'wood.weathered': '#6a5642', 'wood.lacquer': '#6a1a14', 'glass.tinted': '#9ab0a8', 'cloth.banner': '#c0b8a8', 'crystal.amethyst': '#8a5ad8',
  'ice.glacial': '#c0dcea', 'bark.living': '#4a3a28', 'emissive.lava': '#5a2a14', 'emissive.glow': '#ffd890', 'tile.roof': '#8a6a5a',
  'plaster.lime': '#ddd6c8', 'concrete.panel': '#8a8a88', 'liquid.water': '#2a5a6a', 'liquid.fall': '#bcd8e0', 'liquid.reagent': '#a0c040', 'foliage.leaves': '#3a5a2a',
};

const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hex3(h) { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

export async function init(ctx) {
  try {
    return await initInner(ctx);
  } catch (err) {
    console.error('[architecture] init failed', err);
    const sanctuaries = OATHS.map((o) => { const y = SANCTUARY_HEIGHT[o.id]; const [x, z] = o.center; return { oathId: o.id, center: o.center, y, shrine: { x, y, z }, spawn: { x, y, z: z - 12 }, npcSpots: [] }; });
    return { sanctuaries, update() {}, shrineAt: () => null };
  }
}

async function initInner(ctx) {
  const { scene } = ctx;
  const q = ctx.quality || { name: 'high', drawDistance: 1500 };
  setTextureSize(textureSizeForQuality(q));
  const lightBudget = q.name === 'high' || q.name === 'ultra' ? 4 : 0;
  const qDensity = q.name === 'low' ? 0.55 : q.name === 'medium' ? 0.8 : 1;
  const detailDist = q.name === 'low' ? 300 : q.name === 'medium' ? 380 : 460;
  const mainDist = Math.max(900, (q.drawDistance ?? 1500) * 1.05);

  const resolveCache = new Map();
  const resolveMat = (id) => {
    let m = resolveCache.get(id); if (m) return m;
    const def = matDef(id);
    m = def.factory ? def.factory(scene) : getMaterial(scene, def.key, def.opts);
    resolveCache.set(id, m); return m;
  };

  // ---------------------------------------------------------------- sanctuary metadata
  const metas = computeMetas();

  // banner materials (per-oath canvas texture with emblem, wind-animated)
  for (const m of metas) {
    const st = m.style; const oid = m.id;
    MF(`banner:${oid}`, (sc) => {
      const tex = new DynamicTexture(`banner:${oid}`, { width: 256, height: 512 }, sc, true);
      const g = tex.getContext();
      paintBanner(g, oid, st.banner);
      tex.update(true);
      tex.wrapU = tex.wrapV = 0;
      return getMaterial(sc, 'cloth.banner', { id: `banner-${oid}`, albedoTexture: tex, wind: true });
    });
  }

  // ---------------------------------------------------------------- context
  /** Separate animated mesh: build(fn(builder)) around a pivot; returns node to animate in update(node, t). */
  function animMesh(S, name, x, y, z, ry, build, update) {
    const m = S.meta; const F = S.F;
    const F2 = new Frame(); const bb = new Builder(F2); build(bb);
    const [sx, sz] = F.xz(x, z); const [wx, wz] = toWorld(m, sx, sz);
    const pivot = new TransformNode(`${m.id}:anim:${name}`, scene);
    pivot.position.set(wx, m.Y + F.oy + y, wz); pivot.rotation.y = m.theta + F.yaw + ry;
    const spin = new TransformNode(`${m.id}:anim:${name}:spin`, scene); spin.parent = pivot;
    const parts = bb.build(scene, `${m.id}:anim:${name}`, resolveMat);
    for (const p of parts) { p.mesh.unfreezeWorldMatrix(); p.mesh.parent = spin; p.mesh.doNotSyncBoundingInfo = false; }
    S.animNodes = S.animNodes || []; S.animNodes.push({ pivot, spin, parts });
    S.anims.push((t, dt) => update(spin, t, dt));
  }
  const env = { ctx, scene, collision: ctx.collision, lightBudget, qDensity, animMesh };
  const makeContext = (m, dry) => makeGenContext(m, dry, env);

  // ---------------------------------------------------------------- build / meshes
  function finalize(m, S) {
    const pos = new Vector3(m.cx, m.Y, m.cz);
    const opts = { position: pos, rotY: m.theta };
    const main = S.b.build(scene, `${m.id}:main`, resolveMat, opts);
    const detail = [...S.d.build(scene, `${m.id}:detail`, resolveMat, opts), ...S.inst.build(scene, `${m.id}`, getProtos(), resolveMat, opts)];
    m.main = main.map((p) => p.mesh); m.detail = detail.map((p) => p.mesh);
    for (const n of S.animNodes || []) for (const p of n.parts) m.detail.push(p.mesh);
    m.animNodes = S.animNodes || [];
    m.anims = S.anims;
    m.stats = { mainMeshes: main.length, detailMeshes: detail.length, verts: main.reduce((a, p) => a + p.verts, 0) + detail.reduce((a, p) => a + (p.verts || 0), 0), instances: detail.reduce((a, p) => a + (p.count || 0), 0) };
    // point lights scoped to this sanctuary's meshes
    const all = [...m.main, ...m.detail];
    for (const L of S.lights) {
      const pl = new PointLight(`${m.id}:light`, new Vector3(L.x, L.y, L.z), scene);
      const c = hex3(L.color); pl.diffuse = new Color3(c[0], c[1], c[2]); pl.specular = pl.diffuse.scale(0.5);
      pl.range = L.range; pl.intensity = 0; pl.metaIntensity = L.intensity * 18;
      pl.includedOnlyMeshes = all;
      m.lights.push(pl);
    }
    for (const mesh of all) mesh.setEnabled(false);
    const w = (lx, ly, lz) => { const [wx, wz] = toWorld(m, lx, lz); return { x: wx, y: m.Y + ly, z: wz }; };
    m.record.shrine = S.shrine ? w(S.shrine.x, S.shrine.y, S.shrine.z) : w(0, 0.9, 31);
    const sp = S.spawn?.local ?? [0, 0.16, -12];
    m.record.spawn = { ...w(sp[0], sp[1], sp[2]), ry: m.theta };
    m.record.npcSpots.length = 0; m.record.npcSpots.push(...S.npcs);
    m.record.qa = S.qa; // walkway landmarks for QA scripts (tools/qa/walkways.mjs)
    m.record.gates = S.gates.map((g) => ({ ...w(g.x, S.gy(g.x, g.z), g.z), ry: m.theta + g.a }));
    m.built = true; m.building = false;
  }

  function* buildGen(m) {
    m.building = true;
    const S = makeContext(m, false);
    const g = cityGen(S);
    while (!g.next().done) yield;
    finalize(m, S);
    applyState(m, m.state === 'none' ? 'none' : m.state, true);
  }

  function buildNow(m) { if (m.built) return; const g = buildGen(m); while (!g.next().done) { /* run to completion */ } }

  // ---------------------------------------------------------------- skyline silhouettes (dry run)
  const skyMat = new PBRMaterial('arch:skyline', scene);
  skyMat.albedoColor = new Color3(1, 1, 1); skyMat.metallic = 0; skyMat.roughness = 0.92; skyMat.maxSimultaneousLights = 4;
  skyMat.freeze();
  function buildSkyline(m) {
    const S = makeContext(m, true);
    const g = cityGen(S); while (!g.next().done) { /* dry */ }
    const P = [], N = [], C = [], I = [];
    for (const bx of S.sil) {
      const def = matDef(bx.mat) || {}; let col = KEY_COLORS[def.key] || '#808080';
      if (def.opts && def.opts.tint) col = def.opts.tint;
      const rgb = hex3(col).map(srgb2lin);
      const hx = bx.sx / 2, hz = bx.sz / 2; const c = Math.cos(bx.yaw), s = Math.sin(bx.yaw);
      const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [bx.x + lx * c + lz * s, bx.z - lx * s + lz * c]);
      const y0 = bx.y, y1 = bx.y + bx.sy;
      const face = (pts, n) => { const b = P.length / 3; for (const p of pts) { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(rgb[0], rgb[1], rgb[2], 1); } I.push(b, b + 2, b + 1, b, b + 3, b + 2); };
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b2 = corners[(k + 1) % 4]; const ex = b2[0] - a[0], ez = b2[1] - a[1]; const l = Math.hypot(ex, ez) || 1;
        face([[a[0], y0, a[1]], [b2[0], y0, b2[1]], [b2[0], y1, b2[1]], [a[0], y1, a[1]]], [ez / l, 0, -ex / l]);
      }
      face(corners.map((p) => [p[0], y1, p[1]]).reverse(), [0, 1, 0]);
    }
    if (!P.length) return null;
    // fix winding generically (front: cross opposite to normal)
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b2 = I[t + 1], c2 = I[t + 2];
      const ux = P[b2 * 3] - P[a * 3], uy = P[b2 * 3 + 1] - P[a * 3 + 1], uz = P[b2 * 3 + 2] - P[a * 3 + 2];
      const vx = P[c2 * 3] - P[a * 3], vy = P[c2 * 3 + 1] - P[a * 3 + 1], vz = P[c2 * 3 + 2] - P[a * 3 + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * N[a * 3] + cy * N[a * 3 + 1] + cz * N[a * 3 + 2] > 0) { I[t + 1] = c2; I[t + 2] = b2; }
    }
    const mesh = new Mesh(`${m.id}:skyline`, scene);
    const vd = new VertexData(); vd.positions = P; vd.normals = N; vd.colors = C; vd.indices = I; vd.applyToMesh(mesh, false);
    mesh.position.set(m.cx, m.Y, m.cz); mesh.rotation.y = m.theta;
    mesh.material = skyMat; mesh.isPickable = false; mesh.receiveShadows = false;
    mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix(); mesh.doNotSyncBoundingInfo = true;
    return mesh;
  }

  // ---------------------------------------------------------------- state / LOD
  const shadowSet = new Set();
  function setShadows(m, on) {
    if (!ctx.render || !ctx.render.addShadowCaster || m.shadow === on) return;
    m.shadow = on;
    for (const mesh of m.main) { try { if (on) ctx.render.addShadowCaster(mesh, false); else ctx.render.removeShadowCaster?.(mesh); } catch { /* render may not support */ } }
    if (on) shadowSet.add(m); else shadowSet.delete(m);
  }
  function applyState(m, state, force = false) {
    if (m.state === state && !force) return;
    m.state = state;
    const showMain = m.built && (state === 'main' || state === 'full');
    const showDetail = m.built && state === 'full';
    for (const mesh of m.main) mesh.setEnabled(showMain);
    for (const mesh of m.detail) mesh.setEnabled(showDetail);
    if (m.skyline) m.skyline.setEnabled(!showMain && state !== 'hidden');
    for (const l of m.lights) l.intensity = showDetail ? l.metaIntensity : 0;
    setShadows(m, showDetail);
  }

  // ---------------------------------------------------------------- startup
  const p = ctx.params || new URLSearchParams(location.search);
  let startX, startZ;
  const spawnP = p.get('spawn');
  if (spawnP) { const [sx, sz] = spawnP.split(',').map(Number); startX = sx; startZ = sz; }
  else { const o = OATH_BY_ID[p.get('oath')] || OATH_BY_ID['oath-09']; [startX, startZ] = o.center; }

  const sanctuaries = metas.map((m) => {
    const rec = { oathId: m.id, center: [m.cx, m.cz], y: m.Y, theta: m.theta, shrine: { x: m.cx, y: m.Y, z: m.cz }, spawn: { x: m.cx, y: m.Y + 0.16, z: m.cz }, npcSpots: [], gates: [] };
    m.record = rec;
    return rec;
  });
  // provisional records (so shrine/spawn exist before a city is built)
  for (const m of metas) {
    const [sx, sz] = toWorld(m, 0, (m.style.shrineZ ?? 31)); m.record.shrine = { x: sx, y: m.Y + 1.06, z: sz };
    const [px, pz] = toWorld(m, 0, -12); m.record.spawn = { x: px, y: m.Y + 0.16, z: pz, ry: m.theta };
  }

  const t0 = performance.now();
  const skyQueue = [...metas];
  const nextSkyline = () => { const m = skyQueue.shift(); if (!m) return; try { m.skyline = buildSkyline(m); if (m.skyline) m.skyline.setEnabled(!(m.state === 'main' || m.state === 'full')); } catch (e) { console.warn('[architecture] skyline', m.id, e); } };
  const tSky = performance.now() - t0;

  const byDist = (x, z) => [...metas].sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));
  const first = byDist(startX, startZ)[0];
  try { buildNow(first); } catch (e) { console.error('[architecture] build', first.id, e); }
  applyState(first, 'full', true);
  const tFirst = performance.now() - t0 - tSky;

  let roads = null;
  try { roads = buildRoads(ctx, metas, resolveMat); } catch (e) { console.warn('[architecture] roads', e); }

  window.__archTiming = { sky: Math.round(tSky), first: Math.round(tFirst), roads: Math.round(performance.now() - t0 - tSky - tFirst), mat: materialStats(scene) };
  console.info(`[architecture] skyline ${tSky.toFixed(0)}ms, ${first.id} ${tFirst.toFixed(0)}ms`, first.stats, materialStats(scene));

  // prioritise the chosen character's sanctuary
  ctx.bus?.on?.('game:character', (ch) => { const m = metas.find((x) => x.id === ch?.oath); if (m && !m.built) { try { buildNow(m); } catch (e) { console.error(e); } } });

  // ---------------------------------------------------------------- update
  let job = null; let lodTimer = 0; let time = 0; const allowBg = p.get('archbg') !== '0';
  const camPos = new Vector3(startX, 0, startZ);
  function update(dt) {
    time += dt;
    tickMaterials(scene, dt);
    const cam = scene.activeCamera;
    if (cam) camPos.copyFrom(cam.globalPosition || cam.position);
    lodTimer -= dt;
    if (lodTimer <= 0) {
      lodTimer = 0.3;
      if (skyQueue.length) { skyQueue.sort((a, b) => Math.hypot(a.cx - camPos.x, a.cz - camPos.z) - Math.hypot(b.cx - camPos.x, b.cz - camPos.z)); nextSkyline(); }
      const sorted = byDist(camPos.x, camPos.z);
      sorted.forEach((m, i) => {
        const dist = Math.hypot(m.cx - camPos.x, m.cz - camPos.z);
        let st = 'far';
        if (i < 2 && dist < detailDist) st = 'full';
        else if (i < 3 && dist < mainDist) st = 'main';
        applyState(m, st);
      });
      if (roads) roads.update(camPos);
      // schedule next build: nearest unbuilt
      if (!job && allowBg) { const next = sorted.find((m) => !m.built && !m.building); if (next) job = { m: next, g: buildGen(next) }; }
    }
    if (job) {
      const tEnd = performance.now() + 7;
      try {
        while (performance.now() < tEnd) { if (job.g.next().done) { job = null; lodTimer = 0; break; } }
      } catch (e) { console.error('[architecture] build failed', job.m.id, e); job.m.built = true; job.m.building = false; job = null; }
    }
    for (const m of metas) if (m.state === 'full') for (const a of m.anims) a(time, dt);
  }
  if (ctx.addUpdate) ctx.addUpdate(update, 45);

  function shrineAt(x, z, maxD = 8) {
    let best = null, bd = maxD;
    for (const s of sanctuaries) { const d = Math.hypot(s.shrine.x - x, s.shrine.z - z); if (d < bd) { bd = d; best = s; } }
    return best ? { oathId: best.oathId, ...best.shrine } : null;
  }

  return {
    sanctuaries, update: ctx.addUpdate ? () => {} : update, shrineAt,
    /** internal: force build + full detail (QA / teleports) */
    ensureBuilt(oathId) { const m = metas.find((x) => x.id === oathId); if (m) buildNow(m); },
    stats() { return metas.map((m) => ({ id: m.id, state: m.state, built: m.built, ...(m.stats || {}) })); },
    _metas: metas,
  };
}

function paintBanner(g, oathId, b) {
  const W = 256, H = 512;
  const base = b?.color ?? '#7a1c14', trim = b?.trim ?? '#c8a050', em = b?.emblem ?? trim;
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // weave speckle
  let s = 1234567; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2200; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)'; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1); }
  g.strokeStyle = trim; g.lineWidth = 7; g.strokeRect(14, 14, W - 28, H - 28);
  g.lineWidth = 2; g.strokeRect(26, 26, W - 52, H - 52);
  g.fillStyle = trim; g.fillRect(14, 360, W - 28, 6); g.fillRect(14, 60, W - 28, 4);
  // emblem disc backdrop
  g.beginPath(); g.arc(W / 2, 200, 86, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = trim; g.stroke();
  drawEmblem(g, oathId, W / 2, 200, 66, em);
  // lower chevrons
  g.strokeStyle = trim; g.lineWidth = 4;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(40, 395 + k * 22); g.lineTo(W / 2, 420 + k * 22); g.lineTo(W - 40, 395 + k * 22); g.stroke(); }
}
