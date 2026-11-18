// Quest tracker fed by `quest` events and PlayerState.quests.
import { h, esc } from './dom.js';
import { ICONS } from './icons.js';
import { objectiveGuidance, trackedObjective } from './questNavigation.js';

export function createQuests(ui) {
  const { gs } = ui;
  const count = h('span', { class: 'n ae-num' }, '0');
  const head = h('button', { class: 'ae-quests__head', type: 'button', 'aria-expanded': 'false', html: `${ICONS.quest}<span>Covenant Tasks</span>` }, count);
  const list = h('div', { role: 'list' });
  const destination = h('span');
  const bearing = h('span', { class: 'ae-objective__bearing' });
  const objective = h('div', { class: 'ae-objective', hidden: true }, h('small', null, 'TRACKED OBJECTIVE'), destination, bearing);
  const el = h('div', { class: 'ae-quests is-collapsed', hidden: true }, head, objective, list);
  head.addEventListener('click', () => {
    const c = el.classList.toggle('is-collapsed');
    head.setAttribute('aria-expanded', c ? 'false' : 'true'); ui.sfx('click');
  });
  const journalClose = h('button', { type: 'button', class: 'ae-x', 'aria-label': 'Close journal', html: ICONS.close });
  journalClose.addEventListener('click', () => ui.closeWindow('journal'));
  const journalObjective = h('section', { class: 'ae-journal__objective' });
  const controls = h('details', { class: 'ae-journal__controls' }, h('summary', null, 'Controls'),
    h('p', null, ui.touchMode
      ? 'Move with the left stick and drag the world to look. Target selects an enemy. Hold Attack for repeated strikes. Tap Dodge to evade. When an interaction appears, tap its prompt.'
      : 'WASD moves, Shift sprints and dragging with the right mouse button turns the camera. Tab targets, 1 attacks, 2–5 cast techniques, R casts your ultimate, C dodges and F interacts. On a controller, use the sticks to move and look, R3 to target, X to attack, B to dodge and D-pad right to interact.'));
  const journalTasks = h('div');
  const journal = h('div', { class: 'ae-window ae-panel ae-journal', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Story journal' },
    h('div', { class: 'ae-titlebar' }, h('h2', null, 'Journal'), journalClose),
    h('div', { class: 'ae-journal__body ae-scroll' }, journalObjective, controls, journalTasks));
  const els = new Map();
  let tracked = null, elapsed = 0, journalSignature = '';
  ui.ctx.addUpdate?.((dt) => {
    if (!gs.inGame || !tracked) return;
    elapsed += dt; if (elapsed < .2) return; elapsed = 0;
    const guidance = objectiveGuidance(gs.pos(), gs.heading(), tracked.waypoint);
    bearing.textContent = guidance?.label || '';
  }, 61);

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
    tracked = trackedObjective(gs.quests);
    if (!journal.hidden) renderJournal();
    objective.hidden = !tracked;
    destination.textContent = tracked ? (tracked.waypoint.label || tracked.title) : '';
    count.textContent = String([...gs.quests.values()].filter((q) => !q.done).length);
    el.hidden = gs.quests.size === 0 || !!tracked?.chapter;
  }

  function renderJournal() {
    const other = [...gs.quests.values()].filter(q => !q.done && q.id !== tracked?.id);
    const signature = JSON.stringify([tracked?.id, tracked?.objective, tracked?.text, other.map(q => [q.id, q.title, q.text])]);
    if (signature === journalSignature) return;
    journalSignature = signature;
    journalObjective.replaceChildren(
      h('small', { class: 'ae-story-objective__chapter' }, tracked?.chapter ? `${tracked.chapter} · ${tracked.storyStep} of ${tracked.storyTotal}` : 'Current objective'),
      h('h3', null, tracked?.objective || tracked?.waypoint?.label || tracked?.title || 'Explore the realms'),
      tracked?.text ? h('p', null, tracked.text) : null,
      tracked?.waypoint ? h('button', { type: 'button', class: 'ae-btn', onclick: () => ui.openWindow('map') }, 'View destination on map') : null,
    );
    journalTasks.replaceChildren(...other.map(q => h('section', { class: 'ae-quest' },
      h('h3', null, q.title), h('p', null, q.text))));
  }

  return {
    el, journal, refresh,
    upsert(q) {
      if (!q?.id) return;
      const prev = gs.quests.get(q.id);
      gs.quests.set(q.id, { ...prev, ...q });
      refresh();
      if (q.chapter) {
        if (q.done && !prev?.done) {
          if (q.storyStep === q.storyTotal) ui.toast(`${q.chapter} complete`, 'good');
          ui.sfx('questDone');
          gs.quests.delete(q.id);
          refresh();
        }
        else if (prev?.storyStep !== q.storyStep || prev?.chapter !== q.chapter) ui.sfx('quest');
        return;
      }
      if (!prev) { ui.toast(`New task: ${q.title}`, 'info'); ui.sfx('quest'); }
      else if (q.done && !prev.done) {
        ui.toast(`Task complete: ${q.title}`, 'good'); ui.sfx('questDone');
        setTimeout(() => { const cur = gs.quests.get(q.id); if (cur?.done) { gs.quests.delete(q.id); refresh(); } }, 12000);
      }
    },
  };
}
