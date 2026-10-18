// Invitation prompts (party / duel / trade) with a 30 s countdown. Accept / Decline by click, touch,
// keyboard focus, or Alt+Y / Alt+N for the newest prompt.
import { h, anim } from '../dom.js';
import { emblemSVG } from '../emblems.js';
import { OATH_BY_ID } from '@shared/oaths.js';

const KIND = {
  party: { kick: 'Party invitation', text: (n) => `<b>${n}</b> invites you to join their party.`, yes: 'Join', no: 'Decline' },
  duel: { kick: 'Duel challenge', text: (n) => `<b>${n}</b> challenges you to a duel. It ends at 1 health — no one dies.`, yes: 'Accept', no: 'Refuse' },
  trade: { kick: 'Trade request', text: (n) => `<b>${n}</b> wishes to trade with you.`, yes: 'Trade', no: 'Decline' },
};

export function createInvites(env) {
  const { ui, ctx } = env;
  const el = h('div', { class: 'ae-invites', role: 'region', 'aria-live': 'assertive', 'aria-label': 'Invitations' });
  const cards = new Map(); // key -> {root, e, timer}

  function respond(key, yes) {
    const c = cards.get(key); if (!c) return;
    env.send({ t: c.e.kind, op: yes ? 'accept' : 'decline', from: c.e.from });
    ui.sfx(yes ? 'confirm' : 'click');
    remove(key);
  }
  function remove(key) {
    const c = cards.get(key); if (!c) return;
    cards.delete(key); clearInterval(c.timer);
    const a = anim(c.root, { opacity: [1, 0], translateY: [0, -8], duration: 220, onComplete: () => c.root.remove() });
    if (!a) c.root.remove();
  }

  function add(e) {
    const k = KIND[e.kind]; if (!k) return;
    const key = `${e.kind}|${e.from}`;
    remove(key);
    const name = String(e.name || 'Someone').replace(/[<>&"]/g, '');
    const o = OATH_BY_ID[e.oath];
    const bar = h('i');
    const yes = h('button', { class: 'ae-btn ae-btn--primary', type: 'button' }, k.yes, h('kbd', null, 'Alt+Y'));
    const no = h('button', { class: 'ae-btn', type: 'button' }, k.no, h('kbd', null, 'Alt+N'));
    const root = h('div', { class: 'ae-invite ae-panel', role: 'alertdialog', 'aria-label': k.kick, style: o ? `--accent:${o.accent}` : '' },
      h('div', { class: 'ae-invite__em', html: o ? emblemSVG(o.id, { title: false }) : '' }),
      h('div', { class: 'ae-invite__kick' }, k.kick + (e.lvl ? ` · level ${e.lvl}` : '')),
      h('div', { class: 'ae-invite__txt', html: k.text(name) }),
      h('div', { class: 'ae-invite__btns' }, no, yes),
      h('div', { class: 'ae-invite__timer' }, bar));
    yes.addEventListener('click', () => respond(key, true));
    no.addEventListener('click', () => respond(key, false));
    for (const b of [yes, no]) b.addEventListener('keydown', (ev) => ev.stopPropagation());
    el.prepend(root);
    while (el.children.length > 3) { const last = [...cards.entries()].find(([, c]) => c.root === el.lastElementChild); if (last) remove(last[0]); else el.lastElementChild.remove(); }
    const total = Math.max(1000, (e.until ?? 0) - (ctx.net?.serverTime?.() ?? Date.now())) || 30000;
    const t0 = performance.now();
    const c = { root, e, timer: setInterval(() => {
      const left = 1 - (performance.now() - t0) / total;
      bar.style.transform = `scaleX(${Math.max(0, left).toFixed(3)})`;
      if (left <= 0) remove(key);
    }, 200) };
    cards.set(key, c);
    anim(root, { opacity: [0, 1], translateY: [-10, 0], duration: 360, ease: 'outCubic' });
    ui.sfx('quest');
  }

  env.bus.on('social:invite', (e) => {
    if (!e) return;
    if (e.state === 'open') add(e);
    else for (const key of [...cards.keys()]) if ((e.kind === 'any' || key.startsWith(`${e.kind}|`)) && key.endsWith(`|${e.from}`)) remove(key);
  });
  addEventListener('keydown', (e) => {
    if (!cards.size || !e.altKey || e.repeat) return;
    const k = e.code === 'KeyY' ? true : e.code === 'KeyN' ? false : null;
    if (k == null) return;
    const newest = [...cards.keys()].pop();
    e.preventDefault(); e.stopPropagation();
    respond(newest, k);
  }, true);

  return { el, add, get count() { return cards.size; } };
}
