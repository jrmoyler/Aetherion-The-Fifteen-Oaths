import { h } from './dom.js';
import { ABILITIES_BY_OATH, hotbarFor, equippedAbilityForSlot } from '@shared/abilities.js';
import { abilityIcon } from './painted-icons.js';
import { describe, schoolLabel } from './abilityView.js';

/** Draft edits never replace the live kit until the server acknowledges them. */
export function createLoadout(ui) {
  const title = h('h3', null, 'Shape your covenant');
  const intro = h('p', null, 'Equip five distinct techniques from your Oath. The final slot becomes your ultimate. Your basic attack stays available. Leave combat and wait for cooldowns before equipping. Pick a slot, then choose from the grimoire below.');
  const rows = h('div', { class: 'ae-loadout__slots' });
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'ae-loadout__status' });
  const apply = h('button', { type: 'button', class: 'ae-btn ae-btn--primary' }, 'Equip techniques');
  const reset = h('button', { type: 'button', class: 'ae-btn' }, 'Restore default draft');
  const grimoire = h('div', { class: 'ae-grimoire' });
  const el = h('section', { class: 'ae-loadout ae-scroll', hidden: true }, title, intro, rows, h('div', { class: 'ae-loadout__actions' }, apply, reset), status, grimoire);
  let draft = [], signature = '', pending = false, timeout, activeSlot = 0;
  // Techniques grouped the way the Ability Matrix sorts them: by school, with the Matrix Expansion casts last.
  const groupOf = (a) => a.id.startsWith('matrix-expansion/') ? 'Matrix Expansion' : schoolLabel(a) || 'Techniques';
  function grouped(catalog) {
    const groups = new Map();
    for (const a of catalog) { const g = groupOf(a); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
    return [...groups].sort((x, y) => (x[0] === 'Matrix Expansion') - (y[0] === 'Matrix Expansion'));
  }
  function assign(slot, id) {
    const other = draft.indexOf(id);
    if (other >= 0 && other !== slot) draft[other] = draft[slot]; // picking an equipped technique swaps the two slots
    draft[slot] = id; draw();
  }
  function drawGrimoire(c, catalog) {
    grimoire.replaceChildren();
    const slotName = activeSlot === 4 ? 'R · Ultimate' : `${activeSlot + 2} · Technique ${activeSlot + 1}`;
    grimoire.append(h('p', { class: 'ae-grimoire__target' }, `Choosing for slot ${slotName}`));
    for (const [name, list] of grouped(catalog)) {
      const grid = h('div', { class: 'ae-grimoire__grid', role: 'group', 'aria-label': `${name} techniques` });
      for (const a of list) {
        const slot = draft.indexOf(a.id);
        const tile = h('button', { type: 'button', class: 'ae-grimoire__tile', title: `${a.name} — ${describe(a, c.cls)}`, 'aria-pressed': String(slot === activeSlot), disabled: pending, 'data-equipped': slot >= 0 ? String(slot) : null },
          h('span', { class: 'ae-grimoire__icon', html: abilityIcon(a, c.cls) }),
          h('span', { class: 'ae-grimoire__name' }, a.name),
          slot >= 0 ? h('span', { class: 'ae-grimoire__badge' }, slot === 4 ? 'R' : String(slot + 2)) : null);
        tile.onclick = () => assign(activeSlot, a.id);
        grid.append(tile);
      }
      grimoire.append(h('section', { class: 'ae-grimoire__group' }, h('h4', null, `${name} · ${list.length}`), grid));
    }
  }
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
    draft.forEach((id, i) => {
      const label = h('label', { for: `ae-loadout-${i}` }, i === 4 ? 'R · Ultimate' : `${i + 2} · Technique ${i + 1}`);
      const select = h('select', { id: `ae-loadout-${i}`, disabled: pending });
      for (const [name, list] of grouped(catalog)) {
        const group = h('optgroup', { label: name });
        for (const a of list) group.append(h('option', { value: a.id }, a.name));
        select.append(group);
      }
      select.value = id;
      const a = equippedAbilityForSlot(c.oath, c.cls, i + 1, id);
      const detail = h('p', null, a ? `${a.shape} · ${a.range}m range · ${a.mana} mana · ${a.cooldown}s cooldown` : '');
      select.onchange = () => { draft[i] = select.value; draw(); rows.querySelector(`#ae-loadout-${i}`)?.focus(); };
      const row = h('div', { class: 'ae-loadout__slot', 'data-active': i === activeSlot ? 'true' : null }, label, select, detail,
        h('p', { class: 'ae-loadout__hint' }, a ? describe(a, c.cls) : ''));
      select.onfocus = () => { if (activeSlot !== i) { activeSlot = i; drawGrimoire(c, catalog); } };
      rows.append(row);
    });
    drawGrimoire(c, catalog);
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
