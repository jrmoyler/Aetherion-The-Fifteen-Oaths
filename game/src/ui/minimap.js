// Minimap: terrain tiles rasterized off-thread (shared/terrain.js heightAt), roads,
// sanctuaries, shrines, nearby entities and the player arrow. Redraws at ~15 Hz.
import { h, clamp } from './dom.js';
import { requestRaster, rasterToCanvas } from './terrainService.js';
import { sanctuaries, ROUTE_SEGMENTS, ENTITY_STYLE } from './mapData.js';
import { emblemImage, emblemSVG } from './emblems.js';
import { ICONS } from './icons.js';
import { CREATURES } from '@shared/creatures.js';
import { prefs } from './prefs.js';

const TILE_PX = 128;
const TILE_MPP = 4;
const TILE_M = TILE_PX * TILE_MPP;
const ZOOMS = [1.1, 1.8, 3, 5]; // metres per CSS pixel
const ROLE = Object.fromEntries(CREATURES.map((c) => [c.name, c.role]));

export function createMinimap(ui) {
  const { ctx, gs } = ui;
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const title = h('span', { class: 'nm' }, '—');
  const em = h('span', { class: 'em' });
  const coords = h('span', { class: 'ae-num' }, '0, 0');
  const net = h('span', { class: 'ae-net is-offline' }, h('i'), h('span', null, 'Offline'));
  const zin = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': 'Zoom in', html: ICONS.plus });
  const zout = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': 'Zoom out', html: ICONS.minus });
  const mapBtn = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': 'World map (M)', title: 'World map (M)', html: ICONS.map });
  const view = h('div', { class: 'ae-minimap__view' }, canvas, h('span', { class: 'ae-minimap__n' }, 'N'));
  const el = h('div', { class: 'ae-minimap ae-panel ae-int' },
    h('div', { class: 'ae-titlebar' }, em, title, h('div', { class: 'ae-minimap__btns' }, zout, zin, mapBtn)),
    view,
    h('div', { class: 'ae-minimap__foot' }, coords, net));

  let zoom = 1;
  zin.addEventListener('click', () => { zoom = Math.max(0, zoom - 1); ui.sfx('click'); });
  zout.addEventListener('click', () => { zoom = Math.min(ZOOMS.length - 1, zoom + 1); ui.sfx('click'); });
  mapBtn.addEventListener('click', () => { ui.toggleWindow('map'); });
  view.addEventListener('click', () => ui.toggleWindow('map'));

  const tiles = new Map(); // key -> {canvas|null, used}
  let inflight = 0;
  const sancts = () => (sancts._v ||= sanctuaries(ctx));
  ui.on?.('architecture', () => { sancts._v = null; });

  function need(tx, tz) {
    const key = `${tx},${tz}`;
    let t = tiles.get(key);
    if (t) { t.used = performance.now(); return t.canvas; }
    if (inflight >= 2) return null;
    t = { canvas: null, used: performance.now() };
    tiles.set(key, t);
    inflight++;
    requestRaster({ minX: tx * TILE_M, maxZ: (tz + 1) * TILE_M, mpp: TILE_MPP, w: TILE_PX, h: TILE_PX })
      .then((r) => { t.canvas = rasterToCanvas(r); })
      .catch((e) => { console.warn('[ui] minimap tile', e); tiles.delete(key); })
      .finally(() => { inflight--; });
    if (tiles.size > 30) {
      const old = [...tiles.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, tiles.size - 30);
      for (const [k] of old) tiles.delete(k);
    }
    return null;
  }

  let cw = 0, chh = 0, dpr = 1;
  function resize() {
    const r = view.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    cw = Math.max(1, Math.round(r.width)); chh = Math.max(1, Math.round(r.height));
    canvas.width = cw * dpr; canvas.height = chh * dpr;
  }
  const g = canvas.getContext('2d');

  function setRegion(oath) {
    if (!oath) return;
    title.textContent = oath.name;
    em.innerHTML = emblemSVG(oath.id, { title: false });
  }

  function draw() {
    if (!cw) resize();
    const mpp = ZOOMS[zoom];
    const p = gs.pos();
    const rotate = !!prefs.get('minimapRotate');
    const head = gs.heading();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#24261f'; g.fillRect(0, 0, cw, chh);
    g.save();
    g.translate(cw / 2, chh / 2);
    if (rotate) g.rotate(-head);
    const s = 1 / mpp; // css px per metre
    // world (x, z) -> local px: ((x - p.x) * s, -(z - p.z) * s)
    const half = Math.hypot(cw, chh) / 2 * mpp;
    const tx0 = Math.floor((p.x - half) / TILE_M), tx1 = Math.floor((p.x + half) / TILE_M);
    const tz0 = Math.floor((p.z - half) / TILE_M), tz1 = Math.floor((p.z + half) / TILE_M);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = need(tx, tz);
        if (!c) continue;
        const x = (tx * TILE_M - p.x) * s; const y = -((tz + 1) * TILE_M - p.z) * s;
        g.drawImage(c, x, y, TILE_M * s + 0.6, TILE_M * s + 0.6);
      }
    }
    // roads
    g.lineCap = 'round';
    for (const pass of [[5, 'rgba(20,16,10,.45)'], [2.2, 'rgba(226,204,150,.85)']]) {
      g.lineWidth = pass[0]; g.strokeStyle = pass[1];
      g.beginPath();
      for (const r of ROUTE_SEGMENTS) { g.moveTo((r.a[0] - p.x) * s, -(r.a[1] - p.z) * s); g.lineTo((r.b[0] - p.x) * s, -(r.b[1] - p.z) * s); }
      g.stroke();
    }
    // sanctuaries & shrines
    for (const sa of sancts()) {
      const x = (sa.x - p.x) * s, y = -(sa.z - p.z) * s;
      if (Math.abs(x) > cw + 40 || Math.abs(y) > chh + 40) continue;
      g.strokeStyle = 'rgba(240,226,190,.7)'; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, Math.max(6, 42 * s), 0, Math.PI * 2); g.stroke();
      const img = emblemImage(sa.oath.id, '#f2e8cc');
      if (img.complete) {
        g.save(); g.translate(x, y); if (rotate) g.rotate(head);
        g.fillStyle = 'rgba(16,22,34,.85)'; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill();
        g.drawImage(img, -7, -7, 14, 14); g.restore();
      }
      const sx = (sa.shrine.x - p.x) * s, sy = -(sa.shrine.z - p.z) * s;
      const known = gs.shrines.has(sa.oath.id);
      g.save(); g.translate(sx, sy); g.rotate(Math.PI / 4);
      g.fillStyle = known ? '#e8c870' : 'rgba(160,150,130,.6)'; g.strokeStyle = '#1a1408'; g.lineWidth = 1;
      g.fillRect(-3, -3, 6, 6); g.strokeRect(-3, -3, 6, 6); g.restore();
    }
    // entities
    const tgt = gs.target;
    const self = gs.self();
    gs.forEachEntity((e, id) => {
      if (!e || e === self || gs.isSelf(id)) return;
      const ep = e.position; if (!ep) return;
      const x = (ep.x - p.x) * s, y = -(ep.z - p.z) * s;
      if (Math.abs(x) > cw / 2 + 4 || Math.abs(y) > chh / 2 + 4) { if (!rotate) return; if (Math.hypot(x, y) > half / mpp) return; }
      if (e.alive === false) return;
      const role = e.kind === 'mob' ? (ROLE[e.name] === 'boss' ? 'boss' : ROLE[e.name] === 'elite' ? 'elite' : 'mob') : (e.kind === 'npc' ? 'npc' : 'player');
      const st = ENTITY_STYLE[role];
      g.fillStyle = st.color; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1;
      g.beginPath();
      if (role === 'npc') { g.rect(x - st.r, y - st.r, st.r * 2, st.r * 2); } else g.arc(x, y, st.r, 0, Math.PI * 2);
      g.fill(); g.stroke();
      if (id === tgt || e.id === tgt) { g.strokeStyle = '#ffe9a8'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, st.r + 4, 0, Math.PI * 2); g.stroke(); }
    });
    g.restore();
    // player arrow (always centred)
    g.save(); g.translate(cw / 2, chh / 2);
    const yaw = self ? gs.yaw() : head;
    g.rotate(rotate ? (yaw - head) : yaw);
    g.fillStyle = '#fff3d0'; g.strokeStyle = '#1a1408'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // view cone
    g.save(); g.translate(cw / 2, chh / 2); g.rotate(rotate ? 0 : head);
    const grad = g.createRadialGradient(0, 0, 4, 0, 0, 70);
    grad.addColorStop(0, 'rgba(255,240,200,.18)'); grad.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grad; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 70, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.closePath(); g.fill();
    g.restore();
    // inner frame vignette
    const vg = g.createRadialGradient(cw / 2, chh / 2, Math.min(cw, chh) * 0.35, cw / 2, chh / 2, Math.max(cw, chh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = vg; g.fillRect(0, 0, cw, chh);
    coords.textContent = `${Math.round(p.x)}, ${Math.round(p.z)}`;
  }

  let last = 0;
  return {
    el,
    setRegion,
    setNet(text, cls) { net.className = `ae-net ${cls}`; net.lastChild.textContent = text; },
    resize,
    update(now) {
      if (now - last < 66) return; // ~15 Hz
      last = now;
      try { draw(); } catch (e) { console.warn('[ui] minimap', e); last = now + 2000; }
    },
    prefetch() { const p = gs.pos(); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) need(Math.floor(p.x / TILE_M) + dx, Math.floor(p.z / TILE_M) + dz); },
    get zoomMpp() { return ZOOMS[zoom]; },
    clampZoom: (z) => clamp(z, 0, ZOOMS.length - 1),
  };
}
