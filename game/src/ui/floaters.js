// Floating combat text from `combat:floater` {x,y,z,text,kind,element}. Projected world->screen
// each frame with Vector3.Project so numbers stay pinned to the world as the camera moves.
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { h } from './dom.js';

const ELEMENT_TINT = {
  fire: '#ffb070', frost: '#bfeaff', storm: '#d4c8ff', water: '#9fe6ff', earth: '#e0c49a', wind: '#f0f6ff', nature: '#d8f09a',
  poison: '#d8ff7a', light: '#fff2b8', cosmic: '#c8b4ff', shadow: '#c8a8ff', blood: '#ff8a90', arcane: '#f0a8ff', time: '#ffe4a8', tech: '#ffc080',
};
const MAX = 48;

export function createFloaters(ui) {
  const { ctx } = ui;
  const layer = h('div', { class: 'ae-floaters', 'aria-hidden': 'true' });
  const pool = [];
  const live = [];
  const world = new Vector3();
  const out = new Vector3();
  const ident = Matrix.Identity();

  function acquire() {
    let n = pool.pop();
    if (!n) { n = h('div', { class: 'ae-float' }); layer.append(n); }
    n.style.display = '';
    return n;
  }

  function spawn(f) {
    if (!f || !Number.isFinite(f.x)) return;
    if (live.length >= MAX) { const old = live.shift(); old.el.style.display = 'none'; pool.push(old.el); }
    const el = acquire();
    const kind = f.kind || 'damage';
    el.className = `ae-float ${kind}${f.taken ? ' taken' : ''}`;
    el.textContent = f.text ?? '';
    el.style.color = (kind === 'damage' && f.element && !f.taken) ? (ELEMENT_TINT[f.element] || '') : '';
    const crit = kind === 'crit';
    live.push({
      el, x: f.x, y: (f.y ?? 0) + 0.2, z: f.z, t: 0,
      life: crit ? 1.6 : kind === 'xp' ? 1.9 : kind === 'status' ? 1.5 : 1.15,
      dx: (Math.random() - 0.5) * (crit ? 30 : 46), rise: kind === 'xp' ? 46 : crit ? 64 : 54, crit,
    });
  }

  function update(dt) {
    if (!live.length) return;
    const scene = ctx.scene;
    const cam = scene?.activeCamera;
    const canvas = ctx.canvas;
    if (!cam || !canvas) return;
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    let vp;
    try { vp = cam.viewport.toGlobal(w, hh); } catch { return; }
    const tm = scene.getTransformMatrix();
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.el.style.display = 'none'; pool.push(f.el); live.splice(i, 1); continue; }
      world.set(f.x, f.y, f.z);
      Vector3.ProjectToRef(world, ident, tm, vp, out);
      if (out.z < 0 || out.z > 1) { f.el.style.opacity = '0'; continue; }
      const ease = 1 - (1 - k) ** 3;
      const sx = out.x + f.dx * ease;
      const sy = out.y - f.rise * ease - 20;
      const pop = f.crit ? (k < 0.12 ? 0.6 + k / 0.12 * 0.9 : 1.5 - Math.min(0.5, (k - 0.12) * 2)) : (k < 0.1 ? 0.7 + k * 3 : 1);
      const op = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      f.el.style.opacity = op.toFixed(3);
      f.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${pop.toFixed(3)})`;
    }
  }

  return { el: layer, spawn, update };
}
