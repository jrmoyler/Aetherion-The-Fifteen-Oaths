// World map (M): the whole continent painted from heightAt (hillshade + biome tint), coastline,
// roads, region labels, sanctuaries and shrines (discovered shrines fast-travel). Pan / zoom / pinch.
import { h, clamp, esc } from './dom.js';
import { requestRaster, rasterToCanvas } from './terrainService.js';
import { sanctuaries, ROUTE_SEGMENTS } from './mapData.js';
import { emblemImage, emblemSVG } from './emblems.js';
import { ICONS } from './icons.js';
import { WORLD_HALF } from '@shared/terrain.js';
import { biomeLabel } from './create.js';

const RES = 640;
const EXTENT = WORLD_HALF; // metres from origin

export function createWorldMap(ui) {
  const { ctx, gs } = ui;
  const canvas = h('canvas', { 'aria-label': 'Map of the continent', role: 'img' });
  const tip = h('div', { class: 'ae-map__tip', hidden: true });
  const coords = h('div', { class: 'ae-map__coords ae-num' });
  const zin = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': 'Zoom in', html: ICONS.plus });
  const zout = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': 'Zoom out', html: ICONS.minus });
  const loc = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': 'Centre on me', html: ICONS.locate });
  const view = h('div', { class: 'ae-map__view' }, canvas, tip, coords, h('div', { class: 'ae-map__ctrls' }, zin, zout, loc));
  const shrineList = h('ul');
  const legend = h('aside', { class: 'ae-map__legend ae-parch ae-scroll', style: { boxShadow: 'none', border: '0' } },
    h('h4', null, h('b', null, '01'), 'Sanctuaries'), shrineList,
    h('h4', null, h('b', null, '02'), 'Key'),
    h('div', { class: 'ae-map__key' },
      h('i', { style: { height: '3px', background: '#e2cc96', boxShadow: '0 0 0 1px #3a2c14' } }), h('span', null, 'Covenant road'),
      h('i', { style: { width: '10px', height: '10px', background: '#e8c870', transform: 'rotate(45deg)', margin: '0 4px', border: '1px solid #3a2c14' } }), h('span', null, 'Shrine — attuned (travel)'),
      h('i', { style: { width: '10px', height: '10px', background: '#a09884', transform: 'rotate(45deg)', margin: '0 4px', border: '1px solid #3a2c14' } }), h('span', null, 'Shrine — unknown'),
      h('i', { style: { width: '0', height: '0', borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '12px solid #fff3d0', margin: '0 3px' } }), h('span', null, 'You')),
    h('p', { class: 'ae-note', style: { color: '#5a5446', margin: '4px 0 0' } }, 'Drag to pan · scroll or pinch to zoom · select an attuned shrine to travel.'));
  const close = h('button', { class: 'ae-x', type: 'button', 'aria-label': 'Close map', html: ICONS.close });
  const sub = h('span', { class: 'ae-tb-sub' }, '');
  const win = h('div', { class: 'ae-window ae-map ae-panel', hidden: true, role: 'dialog', 'aria-label': 'World map' },
    h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, 'IV'), h('h2', null, 'The Continent of Aetherion'), sub, close),
    h('div', { class: 'ae-map__body' }, view, legend));
  close.addEventListener('click', () => { ui.sfx('close'); ui.closeWindow('map'); });

  let base = null, loading = false;
  const cam = { x: 80, z: 0, s: 0.2 }; // s = css px per metre
  let vw = 1, vh = 1, dpr = 1, dirty = true, fitted = false;
  const g = canvas.getContext('2d');

  function ensureBase() {
    if (base || loading) return;
    loading = true;
    requestRaster({ minX: -EXTENT, maxZ: EXTENT, mpp: (EXTENT * 2) / RES, w: RES, h: RES })
      .then((r) => { base = rasterToCanvas(r); dirty = true; })
      .catch((e) => console.warn('[ui] world map raster', e))
      .finally(() => { loading = false; });
  }

  function resize() {
    const r = view.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    vw = Math.max(1, r.width); vh = Math.max(1, r.height);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    if (!fitted) { cam.s = Math.min(vw / 4300, vh / 3600); fitted = true; }
    dirty = true;
  }
  const minS = () => Math.min(vw, vh) / (EXTENT * 2.2);
  const toScreen = (x, z) => [(x - cam.x) * cam.s + vw / 2, -(z - cam.z) * cam.s + vh / 2];
  const toWorld = (sx, sy) => [(sx - vw / 2) / cam.s + cam.x, -(sy - vh / 2) / cam.s + cam.z];

  function drawLabel(text, x, y, size, color, spacing = 0.22) {
    g.font = `500 ${size}px ${getComputedStyle(document.documentElement).getPropertyValue('--serif') || 'serif'}`;
    try { g.letterSpacing = `${(size * spacing).toFixed(1)}px`; } catch { /* older */ }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(12,14,20,.75)'; g.lineJoin = 'round';
    g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
    try { g.letterSpacing = '0px'; } catch { /* ignore */ }
  }

  let hover = null;
  const hits = [];
  function draw() {
    dirty = false;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1722'; g.fillRect(0, 0, vw, vh);
    // ocean texture lines
    g.strokeStyle = 'rgba(160,190,200,.05)'; g.lineWidth = 1;
    for (let y = (cam.z * cam.s) % 14; y < vh; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(vw, y); g.stroke(); }
    if (base) {
      const [x0, y0] = toScreen(-EXTENT, EXTENT);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(base, x0, y0, EXTENT * 2 * cam.s, EXTENT * 2 * cam.s);
    } else {
      drawLabel('Surveying the continent…', vw / 2, vh / 2, 20, '#d8cfb8');
    }
    // graticule every 500 m
    g.strokeStyle = 'rgba(233,225,207,.08)'; g.lineWidth = 1;
    for (let v = -EXTENT; v <= EXTENT; v += 500) {
      const [ax] = toScreen(v, 0); const [, ay] = toScreen(0, v);
      g.beginPath(); g.moveTo(ax, 0); g.lineTo(ax, vh); g.moveTo(0, ay); g.lineTo(vw, ay); g.stroke();
    }
    // roads
    g.lineCap = 'round';
    const rw = clamp(cam.s * 14, 1.4, 5);
    for (const [w, c, dash] of [[rw + 2.4, 'rgba(30,22,10,.55)', []], [rw, 'rgba(232,212,160,.9)', []], [Math.max(0.6, rw * 0.3), 'rgba(90,70,40,.6)', [rw * 2, rw * 2.5]]]) {
      g.lineWidth = w; g.strokeStyle = c; g.setLineDash(dash);
      g.beginPath();
      for (const r of ROUTE_SEGMENTS) { const a = toScreen(r.a[0], r.a[1]); const b = toScreen(r.b[0], r.b[1]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      g.stroke();
    }
    g.setLineDash([]);
    // sanctuaries, labels, shrines
    hits.length = 0;
    const list = sanctuaries(ctx);
    const md = clamp(cam.s * 110, 18, 44);
    const labelSize = clamp(cam.s * 70, 10, 22);
    const placed = [];
    for (const s of list) {
      const [x, y] = toScreen(s.x, s.z);
      const here = gs.region?.id === s.oath.id;
      g.fillStyle = 'rgba(18,24,38,.88)'; g.strokeStyle = here ? s.oath.accent : 'rgba(236,224,196,.85)'; g.lineWidth = here ? 2 : 1.2;
      g.beginPath(); g.arc(x, y, md / 2, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(x, y, md / 2 + 3, 0, Math.PI * 2); g.strokeStyle = 'rgba(236,224,196,.3)'; g.lineWidth = 1; g.stroke();
      const img = emblemImage(s.oath.id, '#f0e6c8');
      if (img.complete && img.naturalWidth) g.drawImage(img, x - md * 0.32, y - md * 0.32, md * 0.64, md * 0.64);
      else img.onload = () => { dirty = true; };
      const ly = y + md / 2 + labelSize * 0.95;
      const lw = s.oath.name.length * labelSize * 0.86;
      const rect = [x - lw / 2, ly - labelSize * 0.6, x + lw / 2, ly + labelSize * (cam.s > 0.24 ? 1.9 : 0.6)];
      if (!placed.some((r) => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]) || here) {
        placed.push(rect);
        drawLabel(s.oath.name.toUpperCase(), x, ly, labelSize, here ? '#fff6dc' : '#f3ead2');
        if (cam.s > 0.24) drawLabel(biomeLabel(s.oath.biome), x, y + md / 2 + labelSize * 2.1, labelSize * 0.62, 'rgba(230,220,196,.8)', 0.12);
      }
      hits.push({ kind: 'sanct', s, x, y, r: md / 2 });
      // shrine
      const [sx, sy] = toScreen(s.shrine.x, s.shrine.z + (cam.s < 0.3 ? 140 : 0));
      const known = gs.shrines.has(s.oath.id);
      const sz = clamp(cam.s * 26, 5, 9);
      g.save(); g.translate(sx, sy - md * 0.9); g.rotate(Math.PI / 4);
      g.fillStyle = known ? '#e8c870' : '#a09884'; g.strokeStyle = '#2a2010'; g.lineWidth = 1.4;
      if (known) { g.shadowColor = 'rgba(255,220,140,.8)'; g.shadowBlur = hover?.s === s && hover.kind === 'shrine' ? 14 : 6; }
      g.fillRect(-sz, -sz, sz * 2, sz * 2); g.shadowBlur = 0; g.strokeRect(-sz, -sz, sz * 2, sz * 2);
      g.restore();
      hits.push({ kind: 'shrine', s, x: sx, y: sy - md * 0.9, r: sz + 6, known });
    }
    // player
    const p = gs.pos();
    const [px, py] = toScreen(p.x, p.z);
    g.save(); g.translate(px, py); g.rotate(gs.self() ? gs.yaw() : gs.heading());
    g.fillStyle = '#fff3d0'; g.strokeStyle = '#1a1408'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4.5); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,243,208,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, 18 + (performance.now() / 60) % 14, 0, Math.PI * 2); g.stroke();
    // compass rose
    const cx = 54, cy = 58;
    g.strokeStyle = 'rgba(240,230,205,.8)'; g.fillStyle = 'rgba(240,230,205,.85)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, 28, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 4; i++) { g.save(); g.translate(cx, cy); g.rotate((i * Math.PI) / 2); g.beginPath(); g.moveTo(0, -30); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); i === 0 ? g.fill() : g.stroke(); g.restore(); }
    drawLabel('N', cx, cy - 40, 13, '#f3ead2', 0);
    // scale bar
    const meters = [100, 250, 500, 1000, 2000].find((m) => m * cam.s > 70) || 2000;
    const bw = meters * cam.s; const bx = 18, by = vh - 34;
    g.fillStyle = 'rgba(12,14,20,.6)'; g.fillRect(bx - 8, by - 18, bw + 16, 26);
    g.strokeStyle = '#efe6cc'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, by - 4); g.lineTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by - 4); g.stroke();
    g.fillStyle = '#efe6cc'; g.fillRect(bx, by - 2, bw / 2, 2);
    drawLabel(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, bx + bw / 2, by - 10, 11, '#efe6cc', 0.08);
    // vignette
    const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.4, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
  }

  function zoomAt(f, sx = vw / 2, sy = vh / 2) {
    const [wx, wz] = toWorld(sx, sy);
    cam.s = clamp(cam.s * f, minS(), 2.2);
    cam.x = wx - (sx - vw / 2) / cam.s; cam.z = wz + (sy - vh / 2) / cam.s;
    clampCam(); dirty = true;
  }
  function clampCam() { cam.x = clamp(cam.x, -EXTENT, EXTENT); cam.z = clamp(cam.z, -EXTENT, EXTENT); }
  zin.addEventListener('click', () => { zoomAt(1.4); ui.sfx('click'); });
  zout.addEventListener('click', () => { zoomAt(1 / 1.4); ui.sfx('click'); });
  loc.addEventListener('click', () => { const p = gs.pos(); cam.x = p.x; cam.z = p.z; dirty = true; ui.sfx('click'); });
  view.addEventListener('wheel', (e) => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  const ptrs = new Map();
  let pinch = null, moved = 0;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    view.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0;
    view.classList.add('is-drag');
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s }; }
  });
  view.addEventListener('pointermove', (e) => {
    const r = view.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (ptrs.has(e.pointerId)) {
      const pr = ptrs.get(e.pointerId);
      const dx = e.clientX - pr.x, dy = e.clientY - pr.y;
      pr.x = e.clientX; pr.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        zoomAt((pinch.s * (d / pinch.d)) / cam.s, mx, my);
      } else if (ptrs.size === 1) { cam.x -= dx / cam.s; cam.z += dy / cam.s; clampCam(); dirty = true; }
      tip.hidden = true;
      return;
    }
    const [wx, wz] = toWorld(sx, sy);
    coords.textContent = `${Math.round(wx)}, ${Math.round(wz)}`;
    const hit = hitTest(sx, sy);
    if (hit !== hover) { hover = hit; dirty = true; }
    showTip(hit);
    view.style.cursor = hit && hit.kind === 'shrine' && hit.known ? 'pointer' : '';
  });
  const endPtr = (e) => {
    const wasTap = ptrs.size === 1 && moved < 6;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) view.classList.remove('is-drag');
    if (wasTap && e.type === 'pointerup') { const r = view.getBoundingClientRect(); const hit = hitTest(e.clientX - r.left, e.clientY - r.top); if (hit) select(hit); }
  };
  view.addEventListener('pointerup', endPtr);
  view.addEventListener('pointercancel', endPtr);
  view.addEventListener('pointerleave', () => { tip.hidden = true; });

  function hitTest(sx, sy) {
    let best = null, bd = Infinity;
    for (const ht of hits) { const d = Math.hypot(ht.x - sx, ht.y - sy); if (d <= ht.r + 4 && d < bd) { bd = d; best = ht; } }
    return best;
  }
  function showTip(hit) {
    if (!hit) { tip.hidden = true; return; }
    const o = hit.s.oath;
    tip.innerHTML = hit.kind === 'shrine'
      ? `${esc(o.name)} Shrine<small>${hit.known ? 'Attuned — click to travel' : 'Not yet discovered'}</small>`
      : `${esc(o.name)}<small>${esc(o.elementLabel)} · ${esc(biomeLabel(o.biome))}</small>`;
    tip.style.left = `${hit.x}px`; tip.style.top = `${hit.y - hit.r}px`; tip.hidden = false;
  }

  async function select(hit) {
    const o = hit.s.oath;
    if (hit.kind === 'shrine' && hit.known) travel(o);
    else if (hit.kind === 'shrine') ui.toast(`The ${o.name} shrine has not been attuned yet.`, 'warn');
    else { cam.x = hit.s.x; cam.z = hit.s.z; zoomAt(Math.max(1, 0.5 / cam.s)); }
  }
  async function travel(o) {
    ui.sfx('click');
    const ok = await ui.dialogs.confirm('Fast Travel', `Step through the Weave to the ${o.name} shrine?`, 'Travel', 'Stay');
    if (!ok) return;
    try { ctx.net?.send?.({ t: 'travel', shrine: o.id }); } catch { /* ignore */ }
    ui.toast(`Travelling to ${o.name}…`, 'info'); ui.sfx('travel');
    ui.closeWindow('map');
  }

  function renderList() {
    shrineList.innerHTML = '';
    for (const s of sanctuaries(ctx)) {
      const known = gs.shrines.has(s.oath.id);
      const b = h('button', { type: 'button', html: `<span class="em">${emblemSVG(s.oath.id, { title: false })}</span><span>${esc(s.oath.name)}</span><span class="st">${known ? 'Attuned' : 'Unknown'}</span>` });
      b.addEventListener('click', () => { cam.x = s.x; cam.z = s.z; zoomAt(Math.max(1, 0.45 / cam.s)); if (known) travel(s.oath); });
      shrineList.append(h('li', { class: `${known ? 'is-known' : ''}${gs.region?.id === s.oath.id ? ' is-here' : ''}` }, b));
    }
  }

  let raf = 0, lastPulse = 0, centred = false;
  function loop(now) {
    if (win.hidden) { raf = 0; return; }
    if (now - lastPulse > 50) { lastPulse = now; dirty = true; }
    if (dirty) { try { draw(); } catch (e) { console.warn('[ui] map draw', e); } }
    raf = requestAnimationFrame(loop);
  }

  return {
    win, prefetch: ensureBase,
    onOpen() {
      ensureBase(); renderList();
      sub.textContent = `${gs.shrines.size} of 15 shrines attuned`;
      requestAnimationFrame(() => {
        resize();
        const p = gs.pos(); if (!centred) { cam.x = 80; cam.z = 0; centred = true; } else { cam.x = p.x; cam.z = p.z; }
        dirty = true; if (!raf) raf = requestAnimationFrame(loop);
      });
    },
    onResize() { if (!win.hidden) resize(); },
  };
}
