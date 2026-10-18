// Toasts, loot popup and the level-up celebration.
import { createTimeline, stagger } from 'animejs';
import { h, esc, anim, prefersReducedMotion } from './dom.js';
import { itemIcon, rarityOf } from './icons.js';

export function createNotify(ui) {
  const toasts = h('div', { class: 'ae-toasts', role: 'status', 'aria-live': 'polite' });

  function toast(text, kind = 'info', ms = 3600) {
    const t = h('div', { class: `ae-toast ${kind}` }, h('span', { class: 'ae-diamond' }), h('span', null, String(text)));
    toasts.append(t);
    while (toasts.children.length > 4) toasts.firstElementChild.remove();
    anim(t, { opacity: [0, 1], translateY: [-10, 0], duration: 380, ease: 'outCubic' });
    setTimeout(() => {
      const a = anim(t, { opacity: [1, 0], duration: 500, ease: 'inQuad', onComplete: () => t.remove() });
      if (!a || prefersReducedMotion()) t.remove();
    }, ms);
  }

  // loot popup
  const lootList = h('ul');
  const loot = h('div', { class: 'ae-loot ae-panel', hidden: true, role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, '✦'), h('h3', null, 'Spoils')), lootList);
  let lootTimer = null;
  function showLoot(items = []) {
    if (!items.length) return;
    if (loot.hidden) lootList.innerHTML = '';
    for (const it of items) {
      const r = rarityOf(it.rarity);
      const li = h('li', { style: `--rc:${r.color}` },
        h('span', { class: 'ae-item-ic', html: itemIcon(it.name, it.type) }),
        h('span', null, h('span', { style: { color: r.color } }, it.name || 'Item'), h('br'), h('small', { style: { fontSize: '11px', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)' } }, r.label)),
        h('span', { class: 'q ae-num' }, `×${it.qty ?? 1}`));
      lootList.append(li);
      while (lootList.children.length > 6) lootList.firstElementChild.remove();
    }
    if (loot.hidden) { loot.hidden = false; anim(loot, { opacity: [0, 1], translateX: [20, 0], duration: 400, ease: 'outCubic' }); }
    anim(lootList.children, { opacity: [0.2, 1], duration: 400, delay: stagger(60) });
    clearTimeout(lootTimer);
    lootTimer = setTimeout(() => anim(loot, { opacity: [1, 0], duration: 600, onComplete: () => { loot.hidden = true; } }) || (loot.hidden = true), 5200);
  }

  // level up
  const rays = h('div', { class: 'ae-levelup__rays', 'aria-hidden': 'true' });
  const lvN = h('div', { class: 'ae-levelup__n ae-num' }, '2');
  const lvS = h('div', { class: 'ae-levelup__s' }, '');
  const level = h('div', { class: 'ae-levelup', hidden: true, role: 'status', 'aria-live': 'assertive' }, rays, h('div', { class: 'ae-levelup__k' }, 'Level attained'), lvN, lvS);
  function levelUp(n, sub = 'Your covenant deepens.') {
    lvN.textContent = String(n); lvS.textContent = sub;
    level.hidden = false;
    ui.sfx('levelup');
    if (prefersReducedMotion()) { level.style.opacity = '1'; setTimeout(() => { level.hidden = true; }, 3000); return; }
    try {
      const tl = createTimeline({ defaults: { ease: 'outExpo' } });
      tl.add(level, { opacity: [0, 1], duration: 300 }, 0)
        .add(rays, { scale: [0.3, 1.25], rotate: ['0deg', '40deg'], opacity: [0.9, 0], duration: 2600, ease: 'outCubic' }, 0)
        .add(lvN, { scale: [2.2, 1], opacity: [0, 1], duration: 900 }, 80)
        .add(lvS, { opacity: [0, 1], translateY: [8, 0], duration: 800 }, 500)
        .add(level, { opacity: [1, 0], duration: 800, ease: 'inQuad', onComplete: () => { level.hidden = true; } }, 3200);
    } catch { setTimeout(() => { level.hidden = true; }, 3000); }
  }

  return { els: [toasts, loot, level], toast, showLoot, levelUp, esc };
}
