// Touch controls: floating left joystick (sprint at the rim), right-side drag-to-look with tap-to-target,
// thumb radial action cluster (6 abilities with cooldown sweeps + jump, dodge, target, interact).
import { h } from './dom.js';
import { ICONS } from './icons.js';
import { slotHTML } from './abilityView.js';

const JOY_R = 58;
const CLUSTER = 300;
const P = { x: 226, y: 226 };
const polar = (deg, r) => ({ x: P.x + Math.cos((deg * Math.PI) / 180) * r, y: P.y + Math.sin((deg * Math.PI) / 180) * r });
const LAYOUT = [
  { ...P, size: 92 },
  { ...polar(180, 112), size: 62 }, { ...polar(208, 112), size: 62 }, { ...polar(242, 112), size: 62 }, { ...polar(270, 112), size: 62 },
  { ...polar(225, 186), size: 64 },
];
const UTIL = [
  { id: 'jump', icon: 'jump', label: 'Jump', mode: 'hold', ...polar(170, 200) },
  { id: 'dodge', icon: 'dodge', label: 'Dodge', mode: 'press', ...polar(280, 200) },
  { id: 'target', icon: 'target', label: 'Next target', mode: 'press', ...polar(196, 186) },
  { id: 'interact', icon: 'interact', label: 'Interact', mode: 'press', ...polar(254, 186) },
];

export function createTouch(ui) {
  const { ctx } = ui;
  const look = h('div', { class: 'ae-touch__look' });
  const knob = h('div', { class: 'ae-joy__knob' });
  const joy = h('div', { class: 'ae-joy' }, knob);
  const move = h('div', { class: 'ae-touch__move', 'aria-hidden': 'true' }, joy);
  const cluster = h('div', { class: 'ae-cluster', style: { width: `${CLUSTER}px`, height: `${CLUSTER}px` } });
  const top = h('div', { class: 'ae-touch__top' });
  const el = h('div', { class: 'ae-touch', hidden: true }, look, move);
  const ctrl = h('div', { class: 'ae-touch-ui', hidden: true }, cluster, top);
  const fit = () => {
    const portrait = innerHeight > innerWidth;
    const sc = portrait ? Math.min(1, (innerWidth * 0.68) / CLUSTER) : Math.min(1, Math.max(0.58, (innerHeight - 40) / 470));
    ctrl.style.setProperty('--tscale', sc.toFixed(3));
    ui.root?.style.setProperty('--tscale-px', `${Math.round(CLUSTER * sc + 18)}px`);
  };
  fit(); addEventListener('resize', fit);

  // --- joystick
  let joyId = null, jx = 0, jy = 0;
  const rest = () => { const r = move.getBoundingClientRect(); return { x: Math.min(140, r.width * 0.4), y: r.height - Math.min(130, r.height * 0.36) }; };
  function placeJoy(x, y) { joy.style.left = `${x}px`; joy.style.top = `${y}px`; }
  function setKnob(dx, dy) { knob.style.transform = `translate(${dx}px, ${dy}px)`; }
  move.addEventListener('pointerdown', (e) => {
    if (joyId != null) return;
    e.preventDefault(); move.setPointerCapture(e.pointerId); joyId = e.pointerId;
    const r = move.getBoundingClientRect(); jx = e.clientX - r.left; jy = e.clientY - r.top;
    placeJoy(jx, jy); joy.classList.add('is-active');
  });
  move.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    const r = move.getBoundingClientRect();
    let dx = e.clientX - r.left - jx, dy = e.clientY - r.top - jy;
    const d = Math.hypot(dx, dy);
    const sprint = d > JOY_R * 1.08;
    if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
    setKnob(dx, dy);
    const nx = dx / JOY_R, ny = -dy / JOY_R;
    const mag = Math.hypot(nx, ny); const dead = 0.12;
    const k = mag < dead ? 0 : (mag - dead) / (1 - dead) / mag;
    ctx.input?.setVirtualMove?.(nx * k, ny * k);
    ctx.input?.setVirtualSprint?.(sprint);
    joy.classList.toggle('is-sprint', sprint);
  });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null; setKnob(0, 0); joy.classList.remove('is-active', 'is-sprint');
    ctx.input?.setVirtualMove?.(0, 0); ctx.input?.setVirtualSprint?.(false);
    const r = rest(); placeJoy(r.x, r.y);
  };
  move.addEventListener('pointerup', endJoy); move.addEventListener('pointercancel', endJoy);

  // --- look + tap to target
  const looks = new Map();
  look.addEventListener('pointerdown', (e) => {
    e.preventDefault(); look.setPointerCapture(e.pointerId);
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
  });
  look.addEventListener('pointermove', (e) => {
    const l = looks.get(e.pointerId); if (!l) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    l.x = e.clientX; l.y = e.clientY; l.moved += Math.abs(dx) + Math.abs(dy);
    ctx.input?.addVirtualLook?.(dx * 1.6, dy * 1.6);
  });
  const endLook = (e) => {
    const l = looks.get(e.pointerId); looks.delete(e.pointerId);
    if (!l || e.type !== 'pointerup') return;
    if (l.moved < 10 && performance.now() - l.t < 300) {
      try {
        const a = ctx.actors?.pick?.(e.clientX, e.clientY);
        if (a?.id != null) { ctx.combat?.setTarget?.(a.id); ui.sfx('target'); }
      } catch { /* stub */ }
    }
  };
  look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);

  // --- action cluster
  const slots = [];
  function build(view) {
    cluster.querySelectorAll('.ae-slot').forEach((n) => n.remove());
    slots.length = 0;
    view.forEach((v, i) => {
      const L = LAYOUT[i]; if (!L) return;
      const b = h('button', { class: `ae-tbtn ae-slot${v.ult ? ' is-ult' : ''}`, type: 'button', 'aria-label': v.name,
        style: `left:${L.x - L.size / 2}px;top:${L.y - L.size / 2}px;width:${L.size}px;height:${L.size}px;--ab:${v.accent};--ab-rgb:${v.accentRgb}`,
        html: slotHTML(v, { key: false }) });
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ctx.input?.press?.(`slot${i}`); flash(i); try { navigator.vibrate?.(8); } catch { /* ignore */ } });
      cluster.append(b); slots.push(b);
    });
  }
  for (const u of UTIL) {
    const b = h('button', { class: 'ae-tbtn util', type: 'button', 'aria-label': u.label, html: ICONS[u.icon], style: `left:${u.x - 24}px;top:${u.y - 24}px` });
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('is-down');
      if (u.mode === 'hold') ctx.input?.hold?.(u.id, true); else ctx.input?.press?.(u.id);
    });
    const up = () => { b.classList.remove('is-down'); if (u.mode === 'hold') ctx.input?.hold?.(u.id, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    cluster.append(b);
  }
  for (const [id, icon, label] of [['map', 'map', 'World map'], ['character', 'bag', 'Character'], ['chat', 'chat', 'Chat'], ['settings', 'gear', 'Settings']]) {
    const b = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': label, html: ICONS[icon] });
    b.addEventListener('click', () => { if (id === 'chat') ui.chat.focus(); else ui.toggleWindow(id); });
    top.append(b);
  }

  function flash(i) { const s = slots[i]; if (!s) return; s.classList.remove('is-flash'); void s.offsetWidth; s.classList.add('is-flash'); }

  // block page zoom/scroll gestures
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  el.addEventListener('touchmove', stop, { passive: false });
  el.addEventListener('contextmenu', stop);
  ctrl.addEventListener('touchmove', stop, { passive: false });
  ctrl.addEventListener('contextmenu', stop);

  return {
    el, ctrl, build, flash,
    show() { el.hidden = false; ctrl.hidden = false; fit(); requestAnimationFrame(() => { const r = rest(); placeJoy(r.x, r.y); }); },
    hide() { el.hidden = true; ctrl.hidden = true; ctx.input?.setVirtualMove?.(0, 0); ctx.input?.setVirtualSprint?.(false); },
    setCooldown() { /* drawn in update() */ },
    update(now, cds, view, mana) {
      if (el.hidden) return;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]; const c = cds[i]; const v = view[i];
        const rem = c && c.active ? (c.end - now) / 1000 : 0;
        if (rem > 0) { s.style.setProperty('--cd', (rem / c.total).toFixed(3)); s.lastChild.textContent = rem >= 1.5 ? Math.ceil(rem) : rem.toFixed(1); s._cd = true; }
        else if (s._cd) { s._cd = false; s.style.setProperty('--cd', '0'); s.lastChild.textContent = ''; s.classList.remove('is-ready'); void s.offsetWidth; s.classList.add('is-ready'); }
        const oom = !!(v && v.mana && mana < v.mana);
        if (s._oom !== oom) { s._oom = oom; s.classList.toggle('is-oom', oom); }
      }
    },
  };
}
