// Party frames (left HUD column under the player / target frames): emblem + level, name, class, leader
// crown, PvP flag, HP / mana bars, the member's current target (click to assist), out-of-range dimming.
// Each frame is a button: click / Enter = target the member, right-click / ⋯ / ContextMenu key = actions.
import { h, rgbTriplet, fmtNum } from '../dom.js';
import { makeBar } from '../hud.js';
import { emblemSVG } from '../emblems.js';
import { OATH_BY_ID, CLASSES } from '@shared/oaths.js';

const RANGE = 110; // shared XP / quest credit radius (shared/sim/social.js PARTY_RANGE)

export function createPartyFrames(env) {
  const { ui, gs } = env;
  const count = h('span', { class: 'n ae-num' }, '');
  const leave = h('button', { type: 'button', title: 'Leave the party (/leave)' }, 'Leave');
  const head = h('div', { class: 'ae-party__head' }, h('span', null, 'Party'), count, leave);
  const list = h('div', { class: 'ae-party__list', role: 'list', style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
  const el = h('div', { class: 'ae-party', hidden: true, role: 'region', 'aria-label': 'Party' }, head, list);
  leave.addEventListener('click', () => { ui.sfx('click'); env.send({ t: 'party', op: 'leave' }); });
  const frames = new Map(); // id -> frame

  function frame(m) {
    const o = OATH_BY_ID[m.oath] || OATH_BY_ID['oath-09'];
    const lvl = h('span', { class: 'lvl ae-num' }, String(m.lvl));
    const em = h('div', { class: 'ae-pf__em', html: emblemSVG(o.id, { title: false }) }, lvl);
    em.append(lvl);
    const nm = h('span', { class: 'nm' }, m.name);
    const cls = h('small', null, CLASSES[m.cls]?.label || m.cls || '');
    const lead = h('span', { class: 'lead', title: 'Party leader', hidden: true }, '♛');
    const flag = h('span', { class: 'flag', title: 'PvP flagged', hidden: true }, '⚔');
    const range = h('span', { class: 'ae-pf__range' }, 'far');
    const hp = makeBar('hp'); const mp = makeBar('mp', { thin: true, text: false });
    const tt = h('button', { class: 'ae-pf__tt', type: 'button', hidden: true, tabindex: '-1' }, '');
    const more = h('button', { class: 'ae-pf__more', type: 'button', 'aria-label': `Actions for ${m.name}`, title: 'Actions' }, '⋯');
    const main = h('div', { style: { minWidth: '0' } }, h('div', { class: 'ae-pf__name' }, nm, cls, lead, flag, range), hp.el, mp.el, tt);
    const root = h('div', { class: 'ae-pf', role: 'listitem button', tabindex: '0', style: `--accent:${o.accent};--accent-rgb:${rgbTriplet(o.accent)}` }, em, main, more);
    const f = { id: m.id, root, lvl, nm, lead, flag, hp, mp, tt, more, m, ttId: null };
    const target = () => {
      ui.sfx('click');
      if (env.actorOf(f.id)) env.setTarget(f.id);
      else ui.toast(`${f.m.name} is beyond sight - follow the map marker.`, 'info');
    };
    root.addEventListener('click', (e) => { if (e.target.closest('.ae-pf__more, .ae-pf__tt')) return; target(); });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); target(); }
      else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); e.stopPropagation(); env.menu.open({ id: f.id, name: f.m.name }, { anchor: root }); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); const all = [...list.querySelectorAll('.ae-pf')]; all[(all.indexOf(root) + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus(); }
    });
    root.addEventListener('contextmenu', (e) => { e.preventDefault(); env.menu.open({ id: f.id, name: f.m.name }, { x: e.clientX, y: e.clientY }); });
    more.addEventListener('click', (e) => { e.stopPropagation(); env.menu.open({ id: f.id, name: f.m.name }, { anchor: more }); });
    tt.addEventListener('click', (e) => { e.stopPropagation(); if (f.ttId && env.actorOf(f.ttId)) { env.setTarget(f.ttId); ui.sfx('target'); } });
    longPress(root, () => env.menu.open({ id: f.id, name: f.m.name }, { anchor: root }));
    return f;
  }

  let party = null;
  function render(p) {
    party = p;
    const me = env.selfId();
    const others = p ? p.members.filter((m) => m.id !== me) : [];
    el.hidden = !others.length;
    if (!others.length) { list.innerHTML = ''; frames.clear(); return; }
    count.textContent = `${p.members.length}/5`;
    const keep = new Set(others.map((m) => m.id));
    for (const [id, f] of frames) if (!keep.has(id)) { f.root.remove(); frames.delete(id); }
    others.forEach((m, i) => {
      let f = frames.get(m.id);
      if (!f) { f = frame(m); frames.set(m.id, f); f.hp.snap(); }
      f.m = m;
      if (list.children[i] !== f.root) list.insertBefore(f.root, list.children[i] ?? null);
      f.lvl.textContent = String(m.lvl);
      f.lead.hidden = p.leader !== m.id;
      f.flag.hidden = !m.pvp;
      f.root.setAttribute('aria-label', `${m.name}, level ${m.lvl}${p.leader === m.id ? ', leader' : ''}, health ${fmtNum(m.hp)} of ${fmtNum(m.mhp)}`);
    });
    leave.textContent = p.leader === me ? 'Leave' : 'Leave';
  }

  /** Per-frame: live HP from actors when in sight, range dimming, member targets. */
  function update(dt) {
    if (el.hidden || !party) return;
    const me = gs.pos();
    for (const f of frames.values()) {
      const a = env.actorOf(f.id);
      const m = f.m;
      const hp = a && Number.isFinite(a.hp) ? a.hp : m.hp, mhp = a && a.mhp > 0 ? a.mhp : m.mhp;
      f.hp.set(hp, mhp); f.hp.tick(dt);
      f.mp.set(m.mp, m.mmp); f.mp.tick(dt);
      const x = a?.position?.x ?? m.x, z = a?.position?.z ?? m.z;
      const far = Math.hypot(x - me.x, z - me.z) > RANGE;
      f.root.classList.toggle('is-far', far);
      f.root.classList.toggle('is-dead', !m.alive || (a && a.alive === false));
      f.root.classList.toggle('is-target', gs.target === f.id);
      const ttId = m.tgt && m.tgt !== env.selfId() ? m.tgt : null;
      const ta = ttId ? env.actorOf(ttId) : null;
      if (ttId !== f.ttId || (ta && f.tt.hidden)) {
        f.ttId = ttId;
        f.tt.hidden = !ta;
        if (ta) { f.tt.textContent = `→ ${ta.name || 'target'}`; f.tt.title = `Assist: target ${ta.name || ''}`; }
      }
    }
  }

  return { el, render, update };
}

/** Long-press (touch) helper: fires after 520 ms without moving. */
export function longPress(el, fn) {
  let t = null, sx = 0, sy = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    sx = e.clientX; sy = e.clientY;
    clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, 520);
  });
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointermove', (e) => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  el.addEventListener('pointerup', cancel); el.addEventListener('pointercancel', cancel); el.addEventListener('pointerleave', cancel);
}
