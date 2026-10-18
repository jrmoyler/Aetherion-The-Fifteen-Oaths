// Player context menu (Invite / Trade / Duel / Whisper / party management). Opens from a right-click on a
// player in the world, the target frame (right-click, long-press, the ⋯ button, Shift+F10 / ContextMenu key)
// and the party frames. Fully keyboard navigable (arrows, Home/End, 1-9, Enter, Escape).
import { h } from '../dom.js';

const REL_LABEL = { party: 'Party', hostile: 'Hostile', duel: 'Duel', neutral: 'Neutral' };

export function createMenu(env) {
  const { ui, ctx } = env;
  const title = h('h3', null, '');
  const rel = h('small', null, '');
  const list = h('ul', { role: 'none' });
  const el = h('div', { class: 'ae-ctxmenu ae-panel', hidden: true, role: 'menu', 'aria-label': 'Player actions' },
    h('div', { class: 'ae-titlebar' }, title, rel), list);
  let current = null;
  let restoreFocus = null;

  function items(t) {
    const s = env.social();
    const r = env.relation(t.id);
    const myParty = s?.party ?? null;
    const iLead = !myParty || myParty.leader === env.selfId();
    const inMine = !!myParty?.members?.some((m) => m.id === t.id);
    const duelling = !!s?.duel;
    const out = [];
    if (env.actorOf(t.id)) out.push({ label: 'Target', run: () => env.setTarget(t.id) });
    out.push({ label: 'Whisper', run: () => env.whisper(t.name) });
    if (!inMine) out.push({ label: 'Invite to party', disabled: !iLead || (myParty && myParty.members.length >= 5), run: () => env.send({ t: 'party', op: 'invite', target: t.id }) });
    out.push({ label: 'Trade', disabled: !!s?.trade, run: () => env.send({ t: 'trade', op: 'request', target: t.id }) });
    out.push({ label: 'Challenge to a duel', disabled: duelling, run: () => env.send({ t: 'duel', op: 'challenge', target: t.id }) });
    if (inMine && myParty.leader === env.selfId()) {
      out.push({ sep: true });
      out.push({ label: 'Promote to leader', run: () => env.send({ t: 'party', op: 'lead', target: t.id }) });
      out.push({ label: 'Remove from party', run: () => env.send({ t: 'party', op: 'kick', target: t.id }) });
    }
    if (inMine) { out.push({ sep: true }); out.push({ label: 'Leave party', run: () => env.send({ t: 'party', op: 'leave' }) }); }
    return { out, r };
  }

  function open(t, at = null) {
    if (!t || t.id == null || env.isSelf(t.id)) return;
    current = t;
    restoreFocus = document.activeElement;
    const { out, r } = items(t);
    title.textContent = t.name || 'Adventurer';
    rel.textContent = REL_LABEL[r] || '';
    el.style.setProperty('--rel', r ? `var(--rel-${r})` : 'var(--text-2)');
    list.innerHTML = '';
    let n = 0;
    for (const it of out) {
      if (it.sep) { list.append(h('li', { class: 'sep', role: 'separator' })); continue; }
      const b = h('button', { type: 'button', role: 'menuitem', disabled: it.disabled || null }, h('b', null, String(++n)), h('span', null, it.label));
      b.addEventListener('click', () => { if (it.disabled) return; ui.sfx('click'); close(); try { it.run(); } catch (e) { console.warn('[social] menu', e); } });
      list.append(h('li', { role: 'none' }, b));
    }
    el.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
    // position: at a point (pointer) or below an anchor element, clamped to the viewport
    const rr = ui.root.getBoundingClientRect();
    let x, y;
    if (at?.anchor) { const ar = at.anchor.getBoundingClientRect(); x = ar.left - rr.left; y = ar.bottom - rr.top + 4; }
    else if (at && Number.isFinite(at.x)) { x = at.x - rr.left; y = at.y - rr.top; }
    else { x = rr.width / 2 - 100; y = rr.height * 0.3; }
    const w = el.offsetWidth || 220, hh = el.offsetHeight || 260;
    el.style.left = `${Math.max(6, Math.min(rr.width - w - 6, x))}px`;
    el.style.top = `${Math.max(6, Math.min(rr.height - hh - 6, y))}px`;
    try { ctx.input?.setTyping?.(true); } catch { /* ignore */ }
    requestAnimationFrame(() => list.querySelector('button:not([disabled])')?.focus({ preventScroll: true }));
    ui.sfx('open');
  }

  function close() {
    if (el.hidden) return;
    el.hidden = true; current = null;
    try { ctx.input?.setTyping?.(ui.anyWindow() || !!ui.chat?.focused); } catch { /* ignore */ }
    if (restoreFocus && restoreFocus.focus && document.contains(restoreFocus)) { try { restoreFocus.focus({ preventScroll: true }); } catch { /* ignore */ } }
    restoreFocus = null;
  }

  el.addEventListener('keydown', (e) => {
    const btns = [...list.querySelectorAll('button:not([disabled])')];
    const i = btns.indexOf(document.activeElement);
    const go = (k) => { e.preventDefault(); e.stopPropagation(); btns[(k + btns.length) % btns.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(btns.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (/^[1-9]$/.test(e.key)) { const all = [...list.querySelectorAll('button')]; const b = all[Number(e.key) - 1]; if (b && !b.disabled) { e.preventDefault(); e.stopPropagation(); b.click(); } }
    else e.stopPropagation(); // keep game keys out while the menu is focused
  });
  addEventListener('pointerdown', (e) => { if (!el.hidden && !el.contains(e.target)) close(); }, true);

  return { el, open, close, get open_() { return !el.hidden; }, get current() { return current; } };
}
