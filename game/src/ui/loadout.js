import { h } from './dom.js';
import { ABILITIES_BY_OATH, hotbarFor } from '@shared/abilities.js';

/** Draft edits never replace the live kit until the server acknowledges them. */
export function createLoadout(ui) {
  const title = h('h3', null, 'Shape your covenant');
  const intro = h('p', null, 'Equip five distinct techniques from your Oath. The final slot becomes your ultimate. Your basic attack stays available. Leave combat and wait for cooldowns before equipping.');
  const rows = h('div', { class: 'ae-loadout__slots' });
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'ae-loadout__status' });
  const apply = h('button', { type: 'button', class: 'ae-btn ae-btn--primary' }, 'Equip techniques');
  const reset = h('button', { type: 'button', class: 'ae-btn' }, 'Restore default draft');
  const el = h('section', { class: 'ae-loadout ae-scroll', hidden: true }, title, intro, rows, h('div', { class: 'ae-loadout__actions' }, apply, reset), status);
  let draft = [], signature = '', pending = false, timeout;
  function current() {
    const c = ui.gs.character;
    return ui.gs.you.loadout || ui.gs.you.hotbar?.slice(1).map(a => a.id) || hotbarFor(c.oath, c.cls).slice(1).map(a => a.id);
  }
  function valid() { return draft.length === 5 && new Set(draft).size === 5; }
  function check() {
    apply.disabled = pending || !valid() || JSON.stringify(draft) === JSON.stringify(current());
    status.textContent = pending ? 'Waiting for the realm to confirm your techniques…' : !valid() ? 'Choose a different technique for each slot.' : 'Changes apply only after the realm confirms your loadout.';
  }
  function draw() {
    rows.replaceChildren();
    const c = ui.gs.character; if (!c) return;
    const catalog = ABILITIES_BY_OATH[c.oath] || [];
    const preview = hotbarFor(c.oath, c.cls, valid() ? draft : undefined);
    draft.forEach((id, i) => {
      const label = h('label', { for: `ae-loadout-${i}` }, i === 4 ? 'R · Ultimate' : `${i + 2} · Technique ${i + 1}`);
      const select = h('select', { id: `ae-loadout-${i}`, disabled: pending });
      for (const a of catalog) select.append(h('option', { value: a.id }, a.name));
      select.value = id;
      const a = preview[i + 1];
      const detail = h('p', null, a ? `${a.shape} · ${a.range}m range · ${a.mana} mana · ${a.cooldown}s cooldown` : '');
      select.onchange = () => { draft[i] = select.value; draw(); rows.querySelector(`#ae-loadout-${i}`)?.focus(); };
      rows.append(h('div', { class: 'ae-loadout__slot' }, label, select, detail));
    });
    reset.disabled = pending;
    check();
  }
  function refresh(force = false) {
    if (!ui.gs.character) return;
    const next = JSON.stringify(current());
    if (!force && (pending || next === signature)) return;
    signature = next; draft = [...current()]; pending = false; clearTimeout(timeout); draw();
  }
  reset.onclick = () => { const c = ui.gs.character; draft = hotbarFor(c.oath,c.cls).slice(1).map(a => a.id); draw(); };
  apply.onclick = () => {
    if (pending || !valid()) return;
    pending = true; draw();
    ui.ctx.net?.send?.({ t: 'loadout', ids: [...draft] });
    timeout = setTimeout(() => { if (!pending) return; pending = false; draw(); status.textContent = 'No confirmation received. Your equipped techniques are unchanged; try again when connected.'; }, 7000);
  };
  ui.ctx.bus.on('net:you', (event) => {
    if (!pending) return;
    const you = event?.you ?? event;
    const confirmed = you?.loadout || you?.hotbar?.slice(1).map(a => a.id);
    if (!confirmed) return; // Routine partial health/XP snapshots are not acknowledgements.
    const accepted = JSON.stringify(confirmed) === JSON.stringify(draft);
    queueMicrotask(() => {
      refresh(true);
      status.textContent = accepted ? 'Your techniques are equipped.' : 'The realm could not equip this draft. Your current techniques are shown; check the realm message for the reason.';
    });
  });
  return { el, refresh };
}
