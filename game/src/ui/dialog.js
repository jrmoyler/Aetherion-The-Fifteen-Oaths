// NPC dialogue window (parchment sheet), confirm prompts and the death screen.
import { h, esc, anim } from './dom.js';
import { ICONS } from './icons.js';

export function createDialogs(ui) {
  const { ctx } = ui;
  const role = h('div', { class: 'ae-dialog__role' });
  const text = h('p', { class: 'ae-dialog__text' });
  const opts = h('div', { class: 'ae-dialog__opts', role: 'group' });
  const title = h('h2', null, '');
  const close = h('button', { class: 'ae-x', type: 'button', 'aria-label': 'Close', html: ICONS.close });
  const win = h('div', { class: 'ae-window ae-dialog ae-parch', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ae-dlg-title' },
    h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, '❖'), title, h('span', { style: { marginLeft: 'auto' } }), close),
    h('div', { class: 'ae-dialog__body' }, role, text), opts);
  title.id = 'ae-dlg-title';
  let resolver = null;

  function finish(v) {
    const r = resolver; resolver = null;
    ui.closeWindow('dialog');
    r?.(v);
  }
  close.addEventListener('click', () => { ui.sfx('close'); finish(null); });

  /** Show a dialogue; resolves to the chosen option id (or null). */
  function showDialog({ title: t = '', text: body = '', role: r = '', options = [] } = {}) {
    if (resolver) { const prev = resolver; resolver = null; prev(null); }
    title.textContent = t; role.textContent = r; role.hidden = !r; text.textContent = body;
    opts.innerHTML = '';
    const list = options.length ? options : [{ id: null, label: 'Farewell' }];
    list.forEach((o, i) => {
      const b = h('button', { class: 'ae-opt', type: 'button' }, h('b', null, `${i + 1}.`), h('span', null, o.label ?? String(o.id)));
      b.addEventListener('click', () => { ui.sfx('click'); finish(o.id ?? null); });
      b.addEventListener('mouseenter', () => ui.sfx('hover'));
      opts.append(b);
    });
    ui.openWindow('dialog');
    anim(text, { opacity: [0, 1], duration: 500 });
    setTimeout(() => opts.querySelector('button')?.focus({ preventScroll: true }), 60);
    return new Promise((res) => { resolver = res; });
  }
  win.addEventListener('keydown', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 9) { const b = opts.children[n - 1]; if (b) { e.preventDefault(); e.stopPropagation(); b.click(); } }
  });

  /** NPC event from the server: options send {t:'interact', id, option}. */
  async function npc(e) {
    const choice = await showDialog({ title: e.name || 'Citizen', role: e.role || '', text: e.text || '', options: e.options || [] });
    if (choice != null) { try { ctx.net?.send?.({ t: 'interact', id: e.npc ?? e.id, option: choice }); } catch { /* ignore */ } }
  }

  function confirm(t, body, yes = 'Confirm', no = 'Cancel') {
    return showDialog({ title: t, text: body, options: [{ id: 'yes', label: yes }, { id: 'no', label: no }] }).then((v) => v === 'yes');
  }

  // death screen
  const killer = h('p', null, '');
  const respawn = h('button', { class: 'ae-btn ae-btn--primary', type: 'button' }, 'Return to the Shrine');
  const death = h('div', { class: 'ae-death', hidden: true, role: 'alertdialog', 'aria-label': 'You have fallen' },
    h('div', { class: 'ae-death__box' }, h('div', { style: { width: '54px', height: '54px', margin: '0 auto 10px', color: '#c8a8a0' }, html: ICONS.skull }), h('h2', null, 'You have fallen'), killer, respawn));
  let deathTimer = null;
  respawn.addEventListener('click', () => {
    if (respawn.disabled) return;
    ui.sfx('confirm');
    try { ctx.net?.send?.({ t: 'respawn' }); } catch { /* ignore */ }
    respawn.disabled = true; respawn.textContent = 'Returning…';
    setTimeout(() => hideDeath(), 2500);
  });
  function showDeath(by) {
    if (!death.hidden) return;
    killer.textContent = by ? `Struck down by ${by}. The Weave holds your thread.` : 'The Weave holds your thread.';
    death.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
    anim(death, { opacity: [0, 1], duration: 1200, ease: 'outQuad' });
    let n = 3; respawn.disabled = true; respawn.textContent = `Return to the Shrine (${n})`;
    clearInterval(deathTimer);
    deathTimer = setInterval(() => { n--; if (n <= 0) { clearInterval(deathTimer); respawn.disabled = false; respawn.textContent = 'Return to the Shrine'; respawn.focus(); } else respawn.textContent = `Return to the Shrine (${n})`; }, 1000);
    ui.sfx('death');
  }
  function hideDeath() { if (death.hidden) return; clearInterval(deathTimer); anim(death, { opacity: [1, 0], duration: 500, onComplete: () => { death.hidden = true; } }) || (death.hidden = true); }

  return { win, death, showDialog, npc, confirm, showDeath, hideDeath, get deathOpen() { return !death.hidden; }, cancel: () => finish(null), esc };
}
