// Settings window: quality tier (core/quality.js saveQuality + reload), audio volumes,
// mouse sensitivity, invert Y, show FPS, reduced motion, minimap rotation, key reference.
import { h, setForcedReducedMotion } from './dom.js';
import { ICONS } from './icons.js';
import { prefs } from './prefs.js';
import { saveQuality, TIERS } from '../core/quality.js';

export function createSettings(ui) {
  const { ctx } = ui;
  const close = h('button', { class: 'ae-x', type: 'button', 'aria-label': 'Close settings', html: ICONS.close });
  const body = h('div', { class: 'ae-settings__body ae-scroll', style: { flex: 1, minHeight: 0 } });
  const win = h('div', { class: 'ae-window ae-settings ae-panel', hidden: true, role: 'dialog', 'aria-label': 'Settings' },
    h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, 'III'), h('h2', null, 'Settings'), h('span', { class: 'ae-tb-sub' }, 'Saved automatically'), close), body);
  close.addEventListener('click', () => { ui.sfx('close'); ui.closeWindow('settings'); });

  const sec = (n, title, ...rows) => h('section', { class: 'ae-set-sec' }, h('h3', null, h('b', null, n), title), ...rows);
  const row = (label, control, value) => h('div', { class: 'ae-set-row' }, h('label', null, label), control, value || h('span'));

  function slider(key, label, min, max, step, fmt) {
    const v = h('span', { class: 'v ae-num' });
    const r = h('input', { class: 'ae-range', type: 'range', min, max, step, value: prefs.get(key), 'aria-label': label });
    const paint = () => { const p = ((r.value - min) / (max - min)) * 100; r.style.setProperty('--p', `${p}%`); v.textContent = fmt(Number(r.value)); };
    r.addEventListener('input', () => { prefs.set(key, Number(r.value)); paint(); });
    r.addEventListener('change', () => ui.sfx('click'));
    r.addEventListener('keydown', (e) => e.stopPropagation());
    paint();
    return row(label, r, v);
  }
  function toggle(key, label, onChange) {
    const b = h('button', { class: 'ae-toggle', type: 'button', role: 'switch', 'aria-checked': prefs.get(key) ? 'true' : 'false', 'aria-label': label });
    b.addEventListener('click', () => { const nv = !prefs.get(key); prefs.set(key, nv); b.setAttribute('aria-checked', nv ? 'true' : 'false'); ui.sfx('click'); onChange?.(nv); });
    return row(label, b);
  }

  // quality
  const current = ctx.quality?.name || 'medium';
  let chosen = current;
  const apply = h('button', { class: 'ae-btn ae-btn--sm', type: 'button', hidden: true }, 'Apply & reload');
  const seg = h('div', { class: 'ae-seg', role: 'group', 'aria-label': 'Graphics quality' }, Object.keys(TIERS).map((k) => {
    const b = h('button', { type: 'button', 'aria-pressed': k === current ? 'true' : 'false' }, k);
    b.addEventListener('click', () => {
      chosen = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      apply.hidden = chosen === current; ui.sfx('click');
    });
    return b;
  }));
  apply.addEventListener('click', () => {
    saveQuality(chosen);
    const url = new URL(location.href); url.searchParams.delete('q');
    location.replace(url.toString());
  });
  const pct = (v) => `${Math.round(v * 100)}`;
  const keys = [['Move', 'W A S D'], ['Sprint', 'Shift'], ['Jump', 'Space'], ['Dodge', 'C'], ['Abilities', '1 – 5, R'], ['Cycle target', 'Tab'], ['Interact', 'F / E'], ['World map', 'M'], ['Character', 'I / B'], ['Tasks', 'J'], ['Chat', 'Enter'], ['Menu / release cursor', 'Esc']];

  body.append(
    sec('01', 'Display',
      row('Graphics quality', seg, h('span')),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } }, h('span', { class: 'ae-note' }, 'Changing quality reloads the page.'), apply),
      toggle('showFps', 'Show frame rate', (v) => ui.hud?.showFps(v)),
      toggle('reduceMotion', 'Reduce motion', (v) => setForcedReducedMotion(v)),
      toggle('minimapRotate', 'Rotate minimap')),
    sec('02', 'Audio',
      slider('master', 'Master volume', 0, 1, 0.01, pct), slider('music', 'Music', 0, 1, 0.01, pct),
      slider('sfx', 'Effects', 0, 1, 0.01, pct), slider('ambience', 'Ambience', 0, 1, 0.01, pct)),
    sec('03', 'Controls',
      slider('sensitivity', 'Look sensitivity', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`),
      toggle('invertY', 'Invert vertical look')),
    sec('04', 'Key reference', h('div', { class: 'ae-keys' }, keys.map(([a, k]) => h('div', null, h('span', null, a), h('kbd', null, k))))),
  );

  return { win };
}
