// Quick consumables beside the hotbar: the Restorative Draught and Focus Ether, usable by key, click or tap.
// Before this the only way to drink either was to open the character window, which pauses the offline world.
import { h } from './dom.js';
import { itemIcon } from './icons.js';
import { CONSUMABLES } from '@shared/sim/data.js';

const BELT = [
  { key: 'potion', action: 'potion', hotkey: 'Q' },
  { key: 'ether', action: 'ether', hotkey: 'X' },
];

export function createBelt(ui) {
  const { ctx, gs } = ui;
  const el = h('div', { class: 'ae-belt ae-int', role: 'toolbar', 'aria-label': 'Consumables' });
  const now = () => ctx.gameplayNow?.() ?? performance.now();
  let readyAt = 0; // one shared cooldown, as in the simulation
  const slots = BELT.map((entry) => {
    const def = CONSUMABLES[entry.key];
    const count = h('span', { class: 'qty ae-num' }, '0');
    const button = h('button', { type: 'button', class: 'ae-slot ae-belt__slot', title: `${def.name} (${entry.hotkey})`, 'aria-label': `${def.name}, key ${entry.hotkey}`,
      html: `<span class="glyph">${itemIcon({ name: def.name, kind: 'consumable' })}</span><span class="key">${entry.hotkey}</span><span class="cd"></span>` });
    button.append(count);
    button.addEventListener('click', () => use(entry));
    el.append(button);
    return { ...entry, def, button, count, have: 0 };
  });
  const stock = (key) => (Array.isArray(gs.you?.inventory) ? gs.you.inventory : []).filter((item) => item.kind === 'consumable' && item.key === key);

  function use(entry) {
    const item = stock(entry.key)[0];
    if (!item) { ui.toast?.(`No ${entry.def.name} left. The quartermaster sells them.`, 'warn'); return; }
    if (now() < readyAt) { ui.toast?.('Not ready yet.', 'warn'); return; }
    if (gs.you?.hp <= 0) return;
    // Do not let a stray key press pour a full draught onto a full bar.
    const full = entry.key === 'potion' ? gs.you?.hp >= gs.you?.mhp : gs.you?.mp >= gs.you?.mmp;
    if (full) { ui.toast?.(entry.key === 'potion' ? 'You are at full health.' : 'Your mana is full.', 'info'); return; }
    if (ctx.net?.send?.({ t: 'use', item: item.id }) === false) return;
    readyAt = now() + entry.def.cd * 1000;
    ui.sfx?.('click');
  }
  function refresh() {
    for (const slot of slots) {
      const have = stock(slot.key).reduce((sum, item) => sum + (item.qty ?? 1), 0);
      if (have === slot.have) continue;
      slot.have = have; slot.count.textContent = String(have);
      slot.button.classList.toggle('is-empty', have === 0);
    }
  }
  function update() {
    const left = Math.max(0, readyAt - now());
    for (const slot of slots) slot.button.style.setProperty('--cd', (left / (slot.def.cd * 1000)).toFixed(3));
  }
  ctx.bus.on('net:you', () => queueMicrotask(refresh));
  ctx.bus.on('input:action', (action) => { const entry = BELT.find((b) => b.action === action); if (entry && gs.inGame) use(slots.find((s) => s.key === entry.key)); });
  // The simulation refuses a drink on cooldown or when dead; clear the local timer so the slot does not lie.
  ctx.bus.on('net:ev', (payload) => { const e = payload?.e ?? payload; if (e?.type === 'fail' && e.slot === -1 && e.reason !== 'cooldown') readyAt = 0; });
  refresh();
  return { el, refresh, update };
}
