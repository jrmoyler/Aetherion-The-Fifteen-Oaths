import { settings } from '../../config/settings.js';
import { ELEMENT_GROUPS, ELEMENT_OF } from '../../config/elements.js';
import { ARCHETYPES, ARCHETYPE_IDS, FORMATIONS, FORMATION_IDS, MAX_DUMMIES } from '../DummyArchetypes.js';
import { setTargets } from '../targets.js';
import { DIFFICULTIES } from './DuelAI.js';
import { LOADOUT_PRESETS } from './DuelLoadout.js';
import { castableRoster, labelOf, mechanicRoster } from './Duel.js';
import './duel.css';

/**
 * Two collapsible panels under the Combat mechanics one — **Arch-Wizard duel**
 * and **Targets** — plus the HP bars and the round-over banner.
 *
 * Native controls only (DESIGN.md): `<details>`, buttons with `aria-pressed`,
 * checkboxes, a `<select>`. 44 px targets, visible focus, status as text.
 * Collapsed at first on narrow screens.
 */
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

export class DuelPanel {
  constructor(app, duel) {
    this.app = app;
    this.duel = duel;
    this.choice = { preset: 'random', element: ELEMENT_GROUPS[0].id, difficulty: 'adept', custom: new Set(), mechanics: new Set() };

    this.dock = el('div', { className: 'duel-dock' });
    this.duelPanel = el('details', { className: 'duel-panel' });
    // Closed at first, like Combat mechanics: the arena stays visible at every size.
    this.duelPanel.open = false;
    this.targetsPanel = el('details', { className: 'duel-panel' });
    this.dock.append(this.duelPanel, this.targetsPanel);
    document.body.append(this.dock);

    this._buildDuel();
    this._buildTargets();
    this._buildHud();

    duel.on((kind, detail) => {
      if (kind === 'over') this._banner(detail.winner);
      if (kind === 'start' || kind === 'stop') this._hideBanner();
      this._refreshButtons();
    });
    this._lastTop = -1;
    this._lastText = '';
  }

  /* ---- the duel panel ---- */

  _buildDuel() {
    const p = this.duelPanel;
    p.append(el('summary', { textContent: 'Arch-Wizard duel' }));
    this.status = el('p', { className: 'duel-status', 'aria-live': 'polite', textContent: 'Off' });
    p.append(this.status);
    p.append(el('p', { textContent: 'The original wizard as a CPU opponent. Pick what it may cast, then duel it — or watch it work the dummies.' }));

    p.append(el('h3', { textContent: 'Difficulty' }));
    const difficulty = el('div', { className: 'duel-row', role: 'group', 'aria-label': 'Difficulty' });
    this.difficultyButtons = Object.values(DIFFICULTIES).map((d) => {
      const b = el('button', { type: 'button', textContent: d.label, title: `Telegraph ${d.telegraph}s · cast every ${d.interval[0]}–${d.interval[1]}s · dodge ${Math.round(d.dodge * 100)}% · ${d.hp} HP` });
      b.addEventListener('click', () => {
        this.choice.difficulty = d.id;
        this._refreshButtons();
      });
      difficulty.append(b);
      return [d.id, b];
    });
    p.append(difficulty);

    p.append(el('h3', { textContent: 'Loadout' }));
    const presets = el('div', { className: 'duel-row', role: 'group', 'aria-label': 'Loadout preset' });
    this.presetButtons = LOADOUT_PRESETS.map((preset) => {
      const b = el('button', { type: 'button', textContent: preset.label, title: preset.hint });
      b.addEventListener('click', () => {
        this.choice.preset = preset.id;
        this._refreshButtons();
      });
      presets.append(b);
      return [preset.id, b];
    });
    p.append(presets);
    this.presetHint = el('p');
    p.append(this.presetHint);

    this.elementSelect = el('select', { 'aria-label': 'Element for One element' });
    for (const group of ELEMENT_GROUPS) this.elementSelect.append(el('option', { value: group.id, textContent: group.label }));
    this.elementSelect.addEventListener('change', () => (this.choice.element = this.elementSelect.value));
    p.append(this.elementSelect);

    // Custom: every castable, the ones a second caster cannot use shown
    // disabled with the reason.
    this.customBox = el('div');
    this.search = el('input', { type: 'search', placeholder: 'Filter castables…', 'aria-label': 'Filter castables' });
    this.search.addEventListener('input', () => this._filterList());
    this.list = el('div', { className: 'duel-list', role: 'group', 'aria-label': 'Castables the wizard may use' });
    this.customBox.append(this.search, this.list);
    p.append(this.customBox);
    this._fillCastables();

    p.append(el('h3', { textContent: 'Mechanics' }));
    p.append(el('p', { textContent: 'Moves it issues through the unified combat state with its own owner id (needs Combat — unified state on).' }));
    this.mechList = el('div', { className: 'duel-list', role: 'group', 'aria-label': 'Mechanic moves the wizard may use' });
    for (const m of mechanicRoster()) {
      const box = el('input', { type: 'checkbox', value: m.uid });
      box.addEventListener('change', () => (box.checked ? this.choice.mechanics.add(m.uid) : this.choice.mechanics.delete(m.uid)));
      this.mechList.append(el('label', {}, box, el('span', {}, `${m.preset.name}`, el('small', { textContent: `${m.preset.family} · ${m.reason}` }))));
    }
    p.append(this.mechList);

    p.append(el('h3', { textContent: 'Arena' }));
    this.keepButton = el('button', { type: 'button' });
    this.keepButton.addEventListener('click', () => {
      settings.dummies.enabled = !settings.dummies.enabled;
      this._refreshButtons();
    });
    p.append(el('div', { className: 'duel-row' }, this.keepButton));

    const actions = el('div', { className: 'duel-row' });
    this.startButton = el('button', { type: 'button', className: 'duel-primary', textContent: 'Start duel' });
    this.startButton.addEventListener('click', () => this._run('start'));
    this.watchButton = el('button', { type: 'button', textContent: 'Watch (demo)', title: 'The wizard performs its loadout on the dummies; no input needed.' });
    this.watchButton.addEventListener('click', () => this._run('watch'));
    this.stopButton = el('button', { type: 'button', textContent: 'Stop' });
    this.stopButton.addEventListener('click', () => this.duel.stop());
    actions.append(this.startButton, this.watchButton, this.stopButton);
    p.append(el('h3', { textContent: 'Go' }), actions);
    this.loadoutLine = el('p');
    p.append(this.loadoutLine);
    this._refreshButtons();
  }

  _fillCastables() {
    const { allowed, excluded } = castableRoster();
    const rows = [
      ...allowed.map((uid) => ({ uid, ok: true, reason: '' })),
      ...excluded.map((e) => ({ uid: e.uid, ok: false, reason: e.reason }))
    ].sort((a, b) => (ELEMENT_OF[a.uid] ?? '').localeCompare(ELEMENT_OF[b.uid] ?? '') || a.uid.localeCompare(b.uid));
    this.list.textContent = '';
    this.rows = rows.map((row) => {
      const box = el('input', { type: 'checkbox', value: row.uid, disabled: !row.ok });
      box.checked = this.choice.custom.has(row.uid);
      box.addEventListener('change', () => (box.checked ? this.choice.custom.add(row.uid) : this.choice.custom.delete(row.uid)));
      const label = el(
        'label',
        { className: row.ok ? '' : 'duel-off' },
        box,
        el('span', {}, labelOf(row.uid), el('small', { textContent: row.ok ? `${ELEMENT_OF[row.uid] ?? ''} · ${row.uid}` : `Not for the CPU: ${row.reason}` }))
      );
      this.list.append(label);
      return { row, label };
    });
    this._rosterSize = Object.keys(ELEMENT_OF).length;
  }

  _filterList() {
    const q = this.search.value.trim().toLowerCase();
    for (const { row, label } of this.rows) {
      label.hidden = !!q && !`${row.uid} ${labelOf(row.uid)} ${ELEMENT_OF[row.uid] ?? ''}`.toLowerCase().includes(q);
    }
  }

  _options() {
    const c = this.choice;
    return {
      difficulty: c.difficulty,
      loadout: c.preset,
      element: c.element,
      castables: c.preset === 'custom' ? [...c.custom] : null,
      mechanics: [...c.mechanics]
    };
  }

  async _run(mode) {
    this.startButton.disabled = this.watchButton.disabled = true;
    try {
      await (mode === 'watch' ? this.duel.watch(this._options()) : this.duel.start(this._options()));
    } catch (error) {
      console.error('[Duel]', error);
      this.app.hud?.showToast(`Duel: ${error.message}`, 2400);
    } finally {
      this.startButton.disabled = this.watchButton.disabled = false;
      this._refreshButtons();
    }
  }

  _refreshButtons() {
    const c = this.choice;
    for (const [id, b] of this.difficultyButtons) b.setAttribute('aria-pressed', String(c.difficulty === id));
    for (const [id, b] of this.presetButtons) b.setAttribute('aria-pressed', String(c.preset === id));
    this.presetHint.textContent = LOADOUT_PRESETS.find((p) => p.id === c.preset)?.hint ?? '';
    this.elementSelect.hidden = c.preset !== 'element';
    this.customBox.hidden = c.preset !== 'custom';
    this.keepButton.textContent = `Dummies in the arena: ${settings.dummies.enabled ? 'on' : 'off'}`;
    this.keepButton.setAttribute('aria-pressed', String(settings.dummies.enabled));
    this.stopButton.disabled = this.duel.mode === 'off';
    const loadout = this.duel.loadout;
    this.loadoutLine.textContent = this.duel.mode === 'off' && !loadout.castables.length
      ? ''
      : `Its loadout: ${[...loadout.castables.map(labelOf), ...loadout.mechanics.map((u) => u.split('/').pop())].join(', ') || 'nothing'}`;
  }

  /* ---- the targets panel ---- */

  _buildTargets() {
    const p = this.targetsPanel;
    const d = settings.dummies;
    p.append(el('summary', { textContent: 'Targets' }));
    this.targetsStatus = el('p', { className: 'duel-status', 'aria-live': 'polite' });
    p.append(this.targetsStatus);

    p.append(el('h3', { textContent: 'How many' }));
    this.countOut = el('output');
    this.count = el('input', { type: 'range', min: 0, max: MAX_DUMMIES, step: 1, value: d.count, 'aria-label': 'Number of dummies' });
    this.count.addEventListener('input', () => {
      this.countOut.textContent = this.count.value;
    });
    this.count.addEventListener('change', () => setTargets(this.app, { count: Number(this.count.value) }));
    p.append(el('div', {}, this.count, el('span', {}, 'Count: ', this.countOut)));

    p.append(el('h3', { textContent: 'Formation' }));
    const row = el('div', { className: 'duel-row', role: 'group', 'aria-label': 'Formation' });
    this.formationButtons = FORMATION_IDS.map((id) => {
      const b = el('button', { type: 'button', textContent: FORMATIONS[id].label, title: FORMATIONS[id].hint });
      b.addEventListener('click', () => {
        setTargets(this.app, { formation: id });
        this._refreshTargets();
      });
      row.append(b);
      return [id, b];
    });
    p.append(row);

    p.append(el('h3', { textContent: 'Mix' }));
    p.append(el('p', { textContent: 'Weights: each archetype gets that share of the slots.' }));
    const grid = el('div', { className: 'duel-mix' });
    this.mixOut = {};
    for (const id of ARCHETYPE_IDS) {
      const a = ARCHETYPES[id];
      const out = el('output', { 'aria-live': 'polite' });
      const minus = el('button', { type: 'button', textContent: '−', 'aria-label': `Fewer ${a.label}` });
      const plus = el('button', { type: 'button', textContent: '+', 'aria-label': `More ${a.label}` });
      const step = (delta) => {
        const mix = { ...settings.dummies.mix, [id]: Math.max(0, Math.min(4, (settings.dummies.mix[id] ?? 0) + delta)) };
        setTargets(this.app, { mix });
        this._refreshTargets();
      };
      minus.addEventListener('click', () => step(-1));
      plus.addEventListener('click', () => step(1));
      grid.append(el('span', { title: a.hint }, a.label), minus, out, plus);
      this.mixOut[id] = out;
    }
    p.append(grid);
    p.append(el('p', { textContent: ARCHETYPE_IDS.map((id) => `${ARCHETYPES[id].label}: ${ARCHETYPES[id].hint}`).join(' ') }));

    const actions = el('div', { className: 'duel-row' });
    const reform = el('button', { type: 'button', textContent: 'Re-form now (T)' });
    reform.addEventListener('click', () => setTargets(this.app, {}));
    const all = el('button', { type: 'button', textContent: 'One of each' });
    all.addEventListener('click', () => {
      setTargets(this.app, { count: Math.max(10, settings.dummies.count), mix: { standard: 1, armored: 1, runner: 1, giant: 1, caster: 1 } });
      this._refreshTargets();
    });
    actions.append(reform, all);
    p.append(el('h3', { textContent: 'Actions' }), actions);
    this._refreshTargets();
  }

  _refreshTargets() {
    const d = settings.dummies;
    this.count.value = d.count;
    this.countOut.textContent = String(d.count);
    for (const [id, b] of this.formationButtons) b.setAttribute('aria-pressed', String(d.formation === id));
    for (const id of ARCHETYPE_IDS) this.mixOut[id].textContent = String(d.mix[id] ?? 0);
  }

  /* ---- HP and the banner ---- */

  _buildHud() {
    const bar = (cls, name) => {
      const fill = el('i');
      const value = el('b');
      const node = el('div', { className: `duel-hp ${cls}` }, el('span', {}, el('span', { textContent: name }), value), el('div', { className: 'duel-bar' }, fill));
      return { node, fill, value };
    };
    this.hpPlayer = bar('player', 'You');
    this.hpWizard = bar('wizard', 'Arch-Wizard');
    this.hud = el('div', { className: 'duel-hud', role: 'status', 'aria-label': 'Duel health' }, this.hpPlayer.node, this.hpWizard.node);
    this.floatFill = el('i');
    this.floatText = el('div');
    this.float = el('div', { className: 'duel-float', 'aria-hidden': 'true' }, this.floatText, el('div', { className: 'duel-bar' }, this.floatFill));
    this.bannerTitle = el('h2');
    this.bannerText = el('p');
    const rematch = el('button', { type: 'button', className: 'duel-primary', textContent: 'Rematch' });
    rematch.addEventListener('click', () => this.duel.rematch());
    const end = el('button', { type: 'button', textContent: 'End duel' });
    end.addEventListener('click', () => this.duel.stop());
    this.banner = el('div', { className: 'duel-banner', role: 'dialog', 'aria-live': 'assertive', 'aria-label': 'Round over' },
      el('div', {}, this.bannerTitle, this.bannerText, el('div', { className: 'duel-row' }, rematch, end)));
    this.rematchButton = rematch;
    document.body.append(this.hud, this.float, this.banner);
  }

  _banner(winner) {
    const round = this.duel.round?.snapshot();
    this.bannerTitle.textContent = winner === 'player' ? 'You win' : 'The Arch-Wizard wins';
    this.bannerText.textContent = round
      ? `${round.time}s · you took ${round.player.hitsTaken} hits, landed ${round.wizard.hitsTaken} · ${this.duel.difficulty.label}`
      : '';
    this.banner.classList.add('on');
    // After the fall has had a moment to read.
    setTimeout(() => this.rematchButton.focus({ preventScroll: true }), 50);
  }

  _hideBanner() {
    this.banner.classList.remove('on');
  }

  /** Per frame: keep the dock under the mechanics panel, update text and bars. */
  update() {
    const mechanics = document.querySelector('.mechanic-controls');
    if (mechanics) {
      const top = Math.round(mechanics.getBoundingClientRect().bottom + 8);
      if (top !== this._lastTop) {
        this._lastTop = top;
        this.dock.style.top = `${top}px`;
        for (const panel of [this.duelPanel, this.targetsPanel]) panel.style.maxHeight = `max(160px, calc((100vh - ${top}px - 24px) / 2))`;
      }
    }
    const duel = this.duel;
    const text = duel.status;
    if (text !== this._lastText) {
      this._lastText = text;
      this.status.textContent = text;
      this._refreshButtons();
    }
    if (Object.keys(ELEMENT_OF).length !== this._rosterSize) this._fillCastables();
    const alive = this.app.dummies.aliveCount;
    const targets = `${alive} of ${settings.dummies.count} standing · ${FORMATIONS[settings.dummies.formation]?.label ?? 'Ring'}${settings.dummies.enabled ? '' : ' · hidden'}`;
    if (this.targetsStatus.textContent !== targets) this.targetsStatus.textContent = targets;
    // The field can change from the bridge or the editor too: follow it.
    const d = settings.dummies;
    const signature = `${d.count}|${d.formation}|${ARCHETYPE_IDS.map((id) => d.mix[id]).join(',')}`;
    if (signature !== this._targetsSignature) {
      this._targetsSignature = signature;
      this._refreshTargets();
    }

    const round = duel.round;
    this.hud.classList.toggle('on', !!round);
    if (round) {
      for (const [side, bar] of [['player', this.hpPlayer], ['wizard', this.hpWizard]]) {
        const hp = Math.round(round.hp[side]);
        const width = `${(100 * round.hp[side]) / round.max[side]}%`;
        if (bar.fill.style.width !== width) bar.fill.style.width = width;
        const label = `${hp} / ${round.max[side]}`;
        if (bar.value.textContent !== label) bar.value.textContent = label;
      }
    }
    const canvas = this.app.renderer.gl.domElement;
    const at = duel.mode !== 'off' ? duel.headOnScreen(this.app.camera, canvas.clientWidth, canvas.clientHeight) : null;
    if (at && duel.wizard?.alive) {
      const rect = canvas.getBoundingClientRect();
      this.float.style.display = 'block';
      this.float.style.left = `${rect.left + at.x}px`;
      this.float.style.top = `${rect.top + at.y}px`;
      const label = round ? `Arch-Wizard ${Math.round(round.hp.wizard)}` : duel.mode === 'watch' ? 'Arch-Wizard · demo' : 'Arch-Wizard';
      if (this.floatText.textContent !== label) this.floatText.textContent = label;
      this.floatFill.style.width = round ? `${(100 * round.hp.wizard) / round.max.wizard}%` : '100%';
    } else {
      this.float.style.display = 'none';
    }
  }

  dispose() {
    this.dock.remove();
    this.hud.remove();
    this.float.remove();
    this.banner.remove();
  }
}
