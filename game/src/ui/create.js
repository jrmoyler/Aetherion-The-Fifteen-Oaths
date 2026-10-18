// Character creation: Oath (15 dossiers) -> Discipline (Ninja / Sorcerer) -> Name.
import { stagger } from 'animejs';
import { h, anim, esc, rgbTriplet, pad2, prefersReducedMotion } from './dom.js';
import { OATHS, OATH_BY_ID, CLASSES, ROUTES } from '@shared/oaths.js';
import { COVENANT_TERMS } from './lore.js';
import { emblemSVG } from './emblems.js';
import { hotbarView, slotHTML, shapeLabel } from './abilityView.js';
import { loadCharacter, saveCharacter } from './prefs.js';

const BIOME_LABEL = {
  volcanic: 'Volcanic basalt fields', glacial: 'Glacial headwaters', alpine: 'High alpine spine', coast: 'Southwest estuary coast',
  canyon: 'Stratified canyonlands', cliffs: 'Wind-cut sea cliffs', forest: 'Wet western forest', marsh: 'Reed marsh & fens',
  meadow: 'Temperate interior meadows', highland: 'Eastern highlands', badlands: 'Eroded badlands', crimson: 'Crimson escarpment',
  terraces: 'Mirror terraces', plateau: 'Southern plateau', industrial: 'Coastal foundry belt',
};
export const biomeLabel = (b) => BIOME_LABEL[b] || b;

const SIL = {
  ninja: '<svg viewBox="0 0 34 46" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="16" cy="6" r="4"/><path d="M16 10L14 24L9 34L7 45M14 24L20 34L23 45M15 13L7 20L4 16M16 13L24 18L31 8"/></svg>',
  sorcerer: '<svg viewBox="0 0 34 46" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="15" cy="6" r="4"/><path d="M15 10L9 26L5 45H25L21 26L15 10M11 16L4 24M19 16L26 20M28 2V45"/><circle cx="28" cy="4" r="2.5"/></svg>',
};

const NAME_RE = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ' -]{1,14}[A-Za-zÀ-ɏ]$/;
export function validateName(raw) {
  const n = String(raw || '').trim().replace(/\s+/g, ' ');
  if (n.length < 3) return { ok: false, msg: 'A name needs at least three letters.' };
  if (n.length > 16) return { ok: false, msg: 'Keep it to sixteen characters or fewer.' };
  if (!NAME_RE.test(n)) return { ok: false, msg: 'Letters only, with single spaces, hyphens or apostrophes inside.' };
  if (/['\- ]{2,}/.test(n)) return { ok: false, msg: 'Avoid doubled punctuation or spaces.' };
  if (/^(admin|moderator|gm|system|archivist)$/i.test(n)) return { ok: false, msg: 'That name is reserved.' };
  return { ok: true, name: n };
}
const SYL_A = ['Ka', 'Ve', 'Sor', 'Ta', 'Mi', 'Ira', 'Do', 'Ese', 'Ry', 'Ha', 'Lio', 'Na', 'Bri', 'Ul', 'Que'];
const SYL_B = ['ren', 'sha', 'lin', 'mar', 'vek', 'dra', 'nis', 'tho', 'wen', 'kai', 'ros', 'el', 'th', 'vai', 'dan'];
const randomName = () => { const r = (a) => a[Math.floor(Math.random() * a.length)]; return r(SYL_A) + r(SYL_B) + (Math.random() < 0.4 ? r(SYL_B) : ''); };

export function createCharacterScreen(root, { sfx } = {}) {
  const last = loadCharacter();
  const state = { oath: last?.oath && OATH_BY_ID[last.oath] ? last.oath : 'oath-09', cls: last?.cls === 'sorcerer' ? 'sorcerer' : 'ninja', name: last?.name || '', slot: 1, pane: 0 };
  let resolveFn = null;
  let inspection = null, leaving = false;

  // --- column 1: oath grid
  const cards = OATHS.map((o) => {
    const b = h('button', {
      class: 'ae-oath-card', type: 'button', role: 'radio', 'aria-checked': 'false', tabindex: '-1', 'data-oath': o.id,
      style: `--oc:${o.accent};--oc-rgb:${rgbTriplet(o.accent)}`, 'aria-label': `${o.name}, ${o.elementLabel}`,
    }, h('span', { class: 'em', html: emblemSVG(o.id, { title: false }) }), h('span', { class: 'nm' }, o.name), h('span', { class: 'el' }, o.elementLabel), h('span', { class: 'ix' }, pad2(o.index)));
    b.addEventListener('click', () => { selectOath(o.id); sfx?.('click'); });
    b.addEventListener('mouseenter', () => sfx?.('hover'));
    return b;
  });
  const grid = h('div', { class: 'ae-oath-grid ae-scroll', role: 'radiogroup', 'aria-label': 'Choose your Oath' }, cards);
  grid.addEventListener('keydown', (e) => {
    const i = OATHS.findIndex((o) => o.id === state.oath);
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 3;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (d) { e.preventDefault(); const n = (i + d + 15) % 15; selectOath(OATHS[n].id); cards[n].focus(); sfx?.('hover'); }
  });
  const col1 = h('div', { class: 'ae-cc__col', 'data-pane': '0' },
    h('div', { class: 'ae-panel' }, h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, '01'), h('h2', null, 'The Fifteen Oaths'), h('span', { class: 'ae-tb-sub' }, 'Choose a covenant')), grid));

  // --- column 2: dossier (parchment)
  const dossier = h('div', { class: 'ae-dossier ae-scroll', style: { flex: 1, minHeight: 0 } });
  const col2 = h('div', { class: 'ae-cc__col', 'data-pane': '1' },
    h('div', { class: 'ae-parch', style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
      h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, '02'), h('h2', null, 'Covenant Dossier'), h('span', { class: 'ae-tb-sub dossier-idx' }, '')), dossier));

  // --- column 3: discipline, abilities, name
  const clsCards = ['ninja', 'sorcerer'].map((c) => {
    const b = h('button', { class: 'ae-cls-card', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-cls': c });
    b.addEventListener('click', () => { selectClass(c); sfx?.('click'); });
    b.addEventListener('mouseenter', () => sfx?.('hover'));
    return b;
  });
  const inspect = h('button', { class: 'ae-btn ae-inspect-launch', type: 'button' }, 'Inspect character in 3D');
  inspect.onclick = async () => {
    inspect.disabled = true;
    try {
      const { inspectCharacter } = await import('./character-preview.js');
      if (!el.hidden && !leaving) inspection = inspectCharacter({ oath: state.oath, cls: state.cls });
    } catch (error) { console.warn('[ui] inspection unavailable', error); }
    finally { inspect.disabled = false; }
  };
  const slotsEl = h('div', { class: 'slots', role: 'listbox', 'aria-label': 'Ability preview' });
  const abDetail = h('div', { class: 'ae-ab-detail', 'aria-live': 'polite' });
  const ledger = h('table', { class: 'ae-ledger' });
  ledger.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) { state.slot = Number(tr.dataset.i); renderSlots(); sfx?.('click'); } });
  const nameInput = h('input', { class: 'ae-input', id: 'ae-name', type: 'text', maxlength: '16', autocomplete: 'off', spellcheck: 'false', placeholder: 'Your name in the Weave', value: state.name, enterkeyhint: 'done' });
  const nameErr = h('div', { class: 'ae-err', id: 'ae-name-err', role: 'alert' });
  nameInput.setAttribute('aria-describedby', 'ae-name-err');
  const dice = h('button', { class: 'ae-btn ae-btn--sm ae-btn--ghost', type: 'button', title: 'Suggest a name' }, 'Suggest');
  const confirmBtn = h('button', { class: 'ae-btn ae-btn--primary', type: 'button', style: { width: '100%', marginTop: '4px' } }, 'Swear the Oath');
  const col3 = h('div', { class: 'ae-cc__col', 'data-pane': '2' },
    h('div', { class: 'ae-panel' },
      h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, '03'), h('h2', null, 'Discipline & Name')),
      h('div', { class: 'ae-scroll', style: { flex: 1, minHeight: 0 } },
        h('div', { class: 'ae-cls', role: 'radiogroup', 'aria-label': 'Discipline' }, clsCards), inspect,
        h('div', { class: 'ae-bar-preview' }, h('div', { class: 'ae-section-label', style: { marginBottom: '8px' } }, h('b', null, 'i.'), 'Techniques of the Oath'), slotsEl, abDetail, ledger)),
      h('div', { class: 'ae-name-row' },
        h('div', { class: 'ae-field' }, h('label', { for: 'ae-name' }, 'Name'), h('div', { style: { display: 'flex', gap: '8px' } }, nameInput, dice), nameErr),
        confirmBtn)));

  // --- steps / nav
  const steps = ['Oath', 'Covenant', 'Discipline'].map((t, i) => {
    const b = h('button', { class: 'ae-step', type: 'button', role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false' }, h('b', null, pad2(i + 1)), t);
    b.addEventListener('click', () => { setPane(i); sfx?.('click'); });
    return b;
  });
  const back = h('button', { class: 'ae-btn ae-btn--sm', type: 'button' }, 'Back');
  const next = h('button', { class: 'ae-btn ae-btn--sm ae-btn--primary', type: 'button' }, 'Next');
  const nav = h('div', { class: 'ae-cc__nav' }, back, next);
  const el = h('section', { class: 'ae-cc', hidden: true, 'aria-label': 'Character creation' },
    h('header', { class: 'ae-cc__head' }, h('h1', null, 'Swear an Oath'), h('span', { class: 'ae-cc__lede' }, 'A covenant, a discipline, a name'), h('div', { class: 'ae-cc__steps', role: 'tablist' }, steps)),
    h('div', { class: 'ae-cc__body' }, col1, col2, col3), nav);
  root.append(el);
  const cols = [col1, col2, col3];

  function setPane(i) {
    state.pane = Math.max(0, Math.min(2, i));
    cols.forEach((c, k) => c.classList.toggle('is-current', k === state.pane));
    steps.forEach((s, k) => s.setAttribute('aria-selected', k === state.pane ? 'true' : 'false'));
    back.disabled = state.pane === 0;
    next.hidden = state.pane === 2;
    if (getComputedStyle(cols[1]).display !== 'none' && getComputedStyle(cols[0]).display !== 'none') return; // all visible
    anim(cols[state.pane], { opacity: [0, 1], translateX: [12, 0], duration: 320, ease: 'outCubic' });
  }
  back.addEventListener('click', () => { setPane(state.pane - 1); sfx?.('click'); });
  next.addEventListener('click', () => { setPane(state.pane + 1); sfx?.('click'); });

  function renderDossier() {
    const o = OATH_BY_ID[state.oath];
    const terms = COVENANT_TERMS[o.id] || ['', ''];
    const roads = ROUTES.filter((r) => r.includes(o.id)).map((r) => OATH_BY_ID[r[0] === o.id ? r[1] : r[0]]);
    const sw = Object.entries(o.palette).map(([k, v]) => `<div class="ae-swatch"><i style="background:${v}"></i>${esc(k)}</div>`).join('');
    dossier.innerHTML = `
      <div class="ae-dossier__top">
        <div class="ae-dossier__emblem">${emblemSVG(o.id, { ring: true })}</div>
        <div><div class="kicker">Oath ${pad2(o.index)} of XV</div><h2>${esc(o.name)}</h2><div class="elem">${esc(o.elementLabel)}</div></div>
      </div>
      <dl class="ae-facts">
        <div><dt>Realm</dt><dd>${esc(biomeLabel(o.biome))}</dd></div>
        <div><dt>Element</dt><dd>${esc(o.elementLabel)}</dd></div>
        <div class="wide"><dt>Architecture</dt><dd>${esc(o.architecture)}</dd></div>
        <div class="wide"><dt>Materials</dt><dd>${esc(o.materials.join(' · '))}</dd></div>
        <div><dt>${esc(o.ninja.title)}</dt><dd>${esc(o.ninja.weapon)}</dd></div>
        <div><dt>${esc(o.sorcerer.title)}</dt><dd>${esc(o.sorcerer.weapon)}</dd></div>
      </dl>
      <div class="ae-terms">
        <div><div class="ae-section-label"><b>i.</b>The Service</div><p>${esc(terms[0])}</p></div>
        <div><div class="ae-section-label"><b>ii.</b>The Price</div><p>${esc(terms[1])}</p></div>
      </div>
      <div class="ae-section-label"><b>iii.</b>Palette</div>
      <div class="ae-swatches">${sw}</div>
      <div class="ae-section-label"><b>iv.</b>Roads lead to</div>
      <div class="ae-roads">${roads.map((r) => `<span><i>${emblemSVG(r.id, { title: false })}</i>${esc(r.name)}</span>`).join('')}</div>
      <div class="ae-dossier__mark" aria-hidden="true">${emblemSVG(o.id, { title: false })}</div>`;
    col2.querySelector('.dossier-idx').textContent = `${pad2(o.index)} / 15`;
    anim(dossier.children, { opacity: [0, 1], translateY: [8, 0], duration: 420, delay: stagger(40), ease: 'outCubic' });
  }

  function renderClasses() {
    const o = OATH_BY_ID[state.oath];
    clsCards.forEach((b) => {
      const c = b.dataset.cls; const d = o[c]; const base = CLASSES[c];
      b.setAttribute('aria-checked', c === state.cls ? 'true' : 'false');
      b.innerHTML = `<span class="sil">${SIL[c]}</span><div class="t">${esc(d.title)}</div>
        <div class="k">${c === 'ninja' ? 'Agile · melee & line' : 'Ranged · zone caster'}</div>
        <p>${esc(d.silhouette)}</p><div class="w">Wields a ${esc(d.weapon)}</div>
        <dl class="ae-mini-stats"><div><dt>Health</dt><dd>${base.hp}</dd></div><div><dt>Mana</dt><dd>${base.mp}</dd></div><div><dt>Speed</dt><dd>${base.moveSpeed}</dd></div><div><dt>Reach</dt><dd>${base.basicRange} m</dd></div></dl>`;
    });
  }

  function renderSlots() {
    const view = hotbarView(state.oath, state.cls);
    slotsEl.innerHTML = '';
    view.forEach((v, i) => {
      const s = h('button', { class: `ae-slot${v.ult ? ' is-ult' : ''}`, type: 'button', role: 'option', 'aria-selected': i === state.slot ? 'true' : 'false', 'aria-label': v.name,
        style: `--ab:${v.accent};--ab-rgb:${v.accentRgb}`, html: slotHTML(v) });
      const pick = () => { state.slot = i; renderSlots(); };
      s.addEventListener('click', () => { pick(); sfx?.('click'); });
      s.addEventListener('mouseenter', () => { if (state.slot !== i) { pick(); sfx?.('hover'); } });
      s.addEventListener('focus', () => { if (state.slot !== i) pick(); });
      slotsEl.append(s);
    });
    const a = view[state.slot] || view[0];
    if (!a) { abDetail.textContent = ''; return; }
    const st = [
      ['Shape', shapeLabel(a.shape)], ['Range', `${a.range ?? '—'} m`], a.radius ? ['Radius', `${a.radius} m`] : null,
      ['Cooldown', `${a.cooldown ?? '—'} s`], ['Mana', a.mana || '—'], a.castTime ? ['Cast', `${a.castTime} s`] : ['Cast', 'Instant'], a.damage ? ['Power', a.damage] : null,
    ].filter(Boolean);
    ledger.innerHTML = `<thead><tr><th>Technique</th><th>Shape</th><th>Range</th><th>CD</th><th>Mana</th></tr></thead><tbody>${view.map((v, i) =>
      `<tr data-i="${i}" class="${i === state.slot ? 'is-sel' : ''}"><td><span class="k">${v.key}</span>${esc(v.name)}</td><td>${shapeLabel(v.shape)}</td><td>${v.range ?? '—'} m</td><td>${v.cooldown ?? '—'} s</td><td>${v.mana || '—'}</td></tr>`).join('')}</tbody>`;
    abDetail.innerHTML = `<h4 style="color:${a.accent}"><span style="color:var(--text)">${esc(a.name)}</span><small>${a.ult ? 'Ultimate · R' : `Key ${a.key}`}</small></h4>
      <p>${esc(a.desc)}</p><div class="ae-stats">${st.map(([k, v]) => `<span>${k} <b>${esc(v)}</b></span>`).join('')}</div>`;
  }

  function selectOath(id) {
    if (!OATH_BY_ID[id]) return;
    state.oath = id;
    const o = OATH_BY_ID[id];
    el.style.setProperty('--accent', o.accent); el.style.setProperty('--accent-rgb', rgbTriplet(o.accent));
    cards.forEach((c) => { const on = c.dataset.oath === id; c.setAttribute('aria-checked', on ? 'true' : 'false'); c.tabIndex = on ? 0 : -1; });
    renderDossier(); renderClasses(); renderSlots();
  }
  function selectClass(c) { state.cls = c; renderClasses(); renderSlots(); }

  function checkName(showError) {
    const r = validateName(nameInput.value);
    nameInput.setAttribute('aria-invalid', r.ok || !showError ? 'false' : 'true');
    nameErr.textContent = r.ok || !showError ? '' : r.msg;
    return r;
  }
  nameInput.addEventListener('input', () => checkName(nameInput.value.length > 2));
  nameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); });
  nameInput.addEventListener('keyup', (e) => e.stopPropagation());
  dice.addEventListener('click', () => { nameInput.value = randomName(); checkName(true); sfx?.('click'); });
  confirmBtn.addEventListener('click', submit);

  function submit() {
    const r = checkName(true);
    if (!r.ok) {
      sfx?.('error');
      if (getComputedStyle(col3).display === 'none') setPane(2);
      nameInput.focus();
      anim(nameInput, { translateX: [0, -6, 6, -4, 4, 0], duration: 380, ease: 'linear' });
      return;
    }
    const ch = { name: r.name, oath: state.oath, cls: state.cls };
    leaving = true;
    inspection?.close(); inspection = null;
    saveCharacter(ch);
    sfx?.('confirm');
    const fn = resolveFn; resolveFn = null;
    fn?.(ch);
  }

  selectOath(state.oath);
  setPane(0);

  return {
    el,
    open() {
      leaving = false;
      el.hidden = false; el.style.opacity = '1';
      return new Promise((res) => {
        resolveFn = res;
        if (!prefersReducedMotion()) {
          anim(el.querySelector('.ae-cc__head'), { opacity: [0, 1], translateY: [-10, 0], duration: 600, ease: 'outCubic' });
          anim(cols, { opacity: [0, 1], translateY: [18, 0], duration: 700, delay: stagger(110, { start: 120 }), ease: 'outCubic' });
          anim(cards, { opacity: [0, 1], duration: 500, delay: stagger(22, { start: 250 }), ease: 'outQuad' });
        }
        setTimeout(() => cards.find((c) => c.dataset.oath === state.oath)?.focus({ preventScroll: true }), 300);
      });
    },
    async hide() {
      leaving = true;
      inspection?.close(); inspection = null;
      await new Promise((res) => { const a = anim(el, { opacity: [1, 0], duration: 450, ease: 'inQuad', onComplete: res }); if (!a) res(); setTimeout(res, 600); });
      el.hidden = true;
    },
  };
}
