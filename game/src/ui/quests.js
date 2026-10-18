// Quest tracker fed by `quest` events and PlayerState.quests.
import { h, esc } from './dom.js';
import { ICONS } from './icons.js';

export function createQuests(ui) {
  const { gs } = ui;
  const count = h('span', { class: 'n ae-num' }, '0');
  const head = h('button', { class: 'ae-quests__head', type: 'button', 'aria-expanded': 'false', html: `${ICONS.quest}<span>Covenant Tasks</span>` }, count);
  const list = h('div', { role: 'list' });
  const el = h('div', { class: 'ae-quests is-collapsed', hidden: true }, head, list);
  head.addEventListener('click', () => {
    const c = el.classList.toggle('is-collapsed');
    head.setAttribute('aria-expanded', c ? 'false' : 'true'); ui.sfx('click');
  });
  const els = new Map();

  function render(q) {
    let row = els.get(q.id);
    if (!row) {
      row = { el: h('div', { class: 'ae-quest', role: 'listitem' }) };
      els.set(q.id, row); list.append(row.el);
    }
    const goal = Number(q.goal) || 0; const prog = Math.min(goal || Infinity, Number(q.progress) || 0);
    row.el.classList.toggle('is-done', !!q.done);
    row.el.innerHTML = `<div class="qt">${esc(q.title || 'Task')}</div>${q.text ? `<div class="qx">${esc(q.text)}</div>` : ''}
      ${goal ? `<div class="qp"><div class="ae-bar ae-bar--xp"><div class="ae-bar__fill" style="transform:scaleX(${(prog / goal).toFixed(3)})"></div></div><span class="ae-num">${prog} / ${goal}</span></div>` : ''}`;
  }

  function refresh() {
    for (const q of gs.quests.values()) render(q);
    for (const [id, row] of els) if (!gs.quests.has(id)) { row.el.remove(); els.delete(id); }
    count.textContent = String([...gs.quests.values()].filter((q) => !q.done).length);
    el.hidden = gs.quests.size === 0;
  }

  return {
    el, refresh,
    upsert(q) {
      if (!q?.id) return;
      const prev = gs.quests.get(q.id);
      gs.quests.set(q.id, { ...prev, ...q });
      refresh();
      if (!prev) { ui.toast(`New task: ${q.title}`, 'info'); ui.sfx('quest'); }
      else if (q.done && !prev.done) {
        ui.toast(`Task complete: ${q.title}`, 'good'); ui.sfx('questDone');
        setTimeout(() => { const cur = gs.quests.get(q.id); if (cur?.done) { gs.quests.delete(q.id); refresh(); } }, 12000);
      }
    },
  };
}
