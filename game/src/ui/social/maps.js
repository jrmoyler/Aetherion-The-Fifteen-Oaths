// Map overlays: party members (always, from the party roster - regardless of the interest radius), war
// zones and the duel ring, drawn on transparent canvases layered over the minimap and the world map. The
// world-map transform is recovered from where the map draws its base raster (no changes to worldmap.js).
import { h } from '../dom.js';
import { prefs } from '../prefs.js';

const PARTY = '#86e08c', WAR = 'rgba(255,74,58,', DUEL = '#ffa040';

export function createMapOverlays(env) {
  const { ui, gs } = env;
  const social = () => env.social();

  // ---------- minimap
  const mini = h('canvas', { class: 'ae-social-overlay', 'aria-hidden': 'true' });
  let miniView = null;
  function attachMini() {
    if (mini.isConnected) return true;
    miniView = ui.root.querySelector('.ae-minimap__view');
    if (!miniView) return false;
    miniView.append(mini);
    return true;
  }
  function memberPos(m) { const a = env.actorOf(m.id); return a?.position ? { x: a.position.x, z: a.position.z } : { x: m.x, z: m.z }; }
  function drawMini() {
    if (!attachMini()) return;
    const r = miniView.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height));
    if (mini.width !== w * dpr || mini.height !== hh * dpr) { mini.width = w * dpr; mini.height = hh * dpr; }
    const g = mini.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const s0 = social(); if (!s0) return;
    const mpp = ui.minimap?.zoomMpp ?? 1.8; const s = 1 / mpp;
    const p = gs.pos();
    const rotate = !!prefs.get('minimapRotate');
    g.save(); g.translate(w / 2, hh / 2); if (rotate) g.rotate(-gs.heading());
    const X = (x) => (x - p.x) * s, Y = (z) => -(z - p.z) * s;
    for (const z of s0.warZones ?? []) {
      g.strokeStyle = `${WAR}.85)`; g.fillStyle = `${WAR}.10)`; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.beginPath(); g.arc(X(z.x), Y(z.z), z.r * s, 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]);
    }
    const d = s0.duel;
    if (d) { g.strokeStyle = DUEL; g.lineWidth = 1.5; g.beginPath(); g.arc(X(d.x), Y(d.z), d.r * s, 0, Math.PI * 2); g.stroke(); }
    const me = env.selfId();
    const half = Math.min(w, hh) / 2 - 6;
    for (const m of s0.party?.members ?? []) {
      if (m.id === me) continue;
      const mp = memberPos(m);
      let x = X(mp.x), y = Y(mp.z);
      const dd = Math.hypot(x, y);
      const edge = dd > half;
      if (edge) { x *= half / dd; y *= half / dd; } // pin far members to the rim, pointing their way
      g.fillStyle = m.alive ? PARTY : '#8a8a80'; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1.2;
      g.beginPath();
      if (edge) { const a = Math.atan2(y, x); g.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.lineTo(x + Math.cos(a + 2.4) * 5, y + Math.sin(a + 2.4) * 5); g.lineTo(x + Math.cos(a - 2.4) * 5, y + Math.sin(a - 2.4) * 5); g.closePath(); }
      else g.arc(x, y, 3.6, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    g.restore();
  }

  // ---------- world map
  const big = h('canvas', { class: 'ae-social-overlay', 'aria-hidden': 'true' });
  let bigView = null, bigCanvas = null, xf = null, raf = 0;
  function attachBig() {
    if (big.isConnected) return true;
    bigView = ui.root.querySelector('.ae-map__view');
    bigCanvas = bigView?.querySelector('canvas');
    if (!bigView || !bigCanvas) return false;
    bigCanvas.after(big);
    // learn the map transform from its base-raster draw: drawImage(base, x0, y0, size, size) spans [-E, E]
    const g = bigCanvas.getContext('2d');
    const orig = g.drawImage.bind(g);
    g.drawImage = (...a) => {
      if (a.length === 5 && a[0] instanceof HTMLCanvasElement && a[3] === a[4] && a[3] > 10) xf = { x0: a[1], y0: a[2], size: a[3] };
      return orig(...a);
    };
    return true;
  }
  function drawBig() {
    raf = 0;
    if (!attachBig()) return;
    const win = bigView.closest('.ae-map');
    if (!win || win.hidden) return;
    raf = requestAnimationFrame(drawBig);
    const r = bigView.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height));
    if (big.width !== Math.round(w * dpr) || big.height !== Math.round(hh * dpr)) { big.width = Math.round(w * dpr); big.height = Math.round(hh * dpr); }
    const g = big.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    const s0 = social(); if (!s0 || !xf) return;
    const E = 2600; // shared/terrain.js WORLD_HALF is read below when available
    const half = env.worldHalf ?? E;
    const s = xf.size / (half * 2);
    const X = (x) => xf.x0 + (x + half) * s, Y = (z) => xf.y0 + (half - z) * s;
    g.font = '600 11px var(--sans), sans-serif'; g.textAlign = 'center';
    for (const z of s0.warZones ?? []) {
      g.strokeStyle = `${WAR}.9)`; g.fillStyle = `${WAR}.14)`; g.lineWidth = 1.5; g.setLineDash([5, 4]);
      g.beginPath(); g.arc(X(z.x), Y(z.z), Math.max(6, z.r * s), 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffd2c4'; g.strokeStyle = 'rgba(10,10,14,.8)'; g.lineWidth = 3;
      g.strokeText(z.name, X(z.x), Y(z.z) - Math.max(8, z.r * s) - 4); g.fillText(z.name, X(z.x), Y(z.z) - Math.max(8, z.r * s) - 4);
    }
    const me = env.selfId();
    for (const m of s0.party?.members ?? []) {
      if (m.id === me) continue;
      const mp = memberPos(m);
      const x = X(mp.x), y = Y(mp.z);
      g.fillStyle = m.alive ? PARTY : '#8a8a80'; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#e8ffe8'; g.lineWidth = 3; g.strokeStyle = 'rgba(10,10,14,.8)';
      g.strokeText(m.name, x, y - 9); g.fillText(m.name, x, y - 9);
    }
  }

  let last = 0;
  return {
    update(now) {
      if (now - last < 66) return; last = now;
      try { drawMini(); } catch (e) { console.warn('[social] minimap overlay', e); last = now + 3000; }
      if (!raf && attachBig() && !bigView.closest('.ae-map')?.hidden) raf = requestAnimationFrame(drawBig);
    },
  };
}
