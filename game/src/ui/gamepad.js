// Gamepad presentation + menu navigation.
//  - Button glyphs drawn as inline SVG (Xbox A/B/X/Y or PlayStation Cross/Circle/Square/Triangle, chosen
//    from Gamepad.id or the "Button glyphs" setting) on hotbar slots, the creation preview, window close
//    buttons, a floating "A" badge beside the focused control, and a contextual prompt bar.
//  - Spatial navigation of every menu (title, character creation incl. an on-screen keyboard for the
//    name, settings sliders, inventory grid, world map with stick pan / trigger zoom / fast travel, NPC
//    dialogue, death screen). Menus capture the pad (ctx.input.setPadCapture) so gameplay never reacts.
//  - "Controller" settings section (look speed, invert Y, vibration, sprint-at-full-stick, glyph family,
//    layout display with rebinding) and haptics on notable damage / ultimate cast / death.
import './gamepad.css';
import { h, esc } from './dom.js';
import { prefs } from './prefs.js';
import { PAD_REBINDABLE } from '../core/input.js';

// ------------------------------------------------------------------ glyphs
const XB = { A: '#79b860', B: '#d0574e', X: '#4f8fd0', Y: '#e0b84a' };
const PS = { A: '#8fb0e6', B: '#e0706a', X: '#d595c4', Y: '#62c0a4' };
const FACE = { A: 1, B: 1, X: 1, Y: 1 };
const LABEL = {
  xbox: { LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', L3: 'L', R3: 'R' },
  ps: { LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', L3: 'L', R3: 'R' },
};
const NAME = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', BACK: 'View', START: 'Menu', L3: 'L3', R3: 'R3', UP: 'D-pad up', DOWN: 'D-pad down', LEFT: 'D-pad left', RIGHT: 'D-pad right', HOME: 'Guide', LS: 'Left stick', RS: 'Right stick' },
  ps: { A: 'Cross', B: 'Circle', X: 'Square', Y: 'Triangle', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', BACK: 'Create', START: 'Options', L3: 'L3', R3: 'R3', UP: 'D-pad up', DOWN: 'D-pad down', LEFT: 'D-pad left', RIGHT: 'D-pad right', HOME: 'PS', LS: 'Left stick', RS: 'Right stick' },
};
const INK = '#efe6cf';
const BODY = '#121a27';

function face(btn, style) {
  const c = (style === 'ps' ? PS : XB)[btn];
  let mark;
  if (style === 'ps') {
    mark = {
      A: `<path d="M10.6 10.6L21.4 21.4M21.4 10.6L10.6 21.4" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`,
      B: `<circle cx="16" cy="16" r="6.2" fill="none" stroke="${c}" stroke-width="2.5"/>`,
      X: `<rect x="10.2" y="10.2" width="11.6" height="11.6" fill="none" stroke="${c}" stroke-width="2.4"/>`,
      Y: `<path d="M16 9.2L22.6 20.8H9.4Z" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/>`,
    }[btn];
  } else {
    mark = `<text x="16" y="21.2" text-anchor="middle" font-family="Inter,Segoe UI,system-ui,sans-serif" font-weight="700" font-size="14.5" fill="${c}">${btn}</text>`;
  }
  return `<circle cx="16" cy="16" r="13.6" fill="${BODY}" stroke="${c}" stroke-width="1.8"/>${mark}`;
}
function textIn(t, size = 10, y = 20) { return `<text x="16" y="${y}" text-anchor="middle" font-family="Inter,Segoe UI,system-ui,sans-serif" font-weight="700" font-size="${size}" fill="${INK}">${t}</text>`; }
function dpad(arm) {
  const on = (a) => (a === arm ? '#e6cd8e' : '#3a4560');
  return `<path d="M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9z" fill="${BODY}" stroke="#8d8778" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M13.2 4.6h5.6v6.6h-5.6z" fill="${on('UP')}"/><path d="M13.2 20.8h5.6v6.6h-5.6z" fill="${on('DOWN')}"/>
    <path d="M4.6 13.2h6.6v5.6H4.6z" fill="${on('LEFT')}"/><path d="M20.8 13.2h6.6v5.6h-6.6z" fill="${on('RIGHT')}"/>`;
}
/** Inline SVG for one pad input. btn: A B X Y LB RB LT RT BACK START L3 R3 UP DOWN LEFT RIGHT LS RS. */
export function glyphSVG(btn, style = 'xbox') {
  const st = style === 'ps' ? 'ps' : 'xbox';
  let body;
  if (FACE[btn]) body = face(btn, st);
  else if (btn === 'LB' || btn === 'RB') body = `<path d="M3 24V13c0-3 2.4-5.4 5.4-5.4h15.2c3 0 5.4 2.4 5.4 5.4v11z" fill="${BODY}" stroke="#a89f8a" stroke-width="1.5"/>${textIn(LABEL[st][btn], 10.5, 20.5)}`;
  else if (btn === 'LT' || btn === 'RT') body = `<path d="M6 29V10.5C6 6 9.5 2.6 14 2.6h4c4.5 0 8 3.4 8 7.9V29z" fill="${BODY}" stroke="#a89f8a" stroke-width="1.5"/>${textIn(LABEL[st][btn], 10.5, 21)}`;
  else if (btn === 'L3' || btn === 'R3' || btn === 'LS' || btn === 'RS') {
    const l = btn[0];
    body = `<circle cx="16" cy="16" r="13.4" fill="${BODY}" stroke="#a89f8a" stroke-width="1.5"/><circle cx="16" cy="16" r="8.4" fill="none" stroke="#6d6758" stroke-width="1.2"/>${textIn(l, 11, 20)}`
      + (btn.endsWith('3') ? '<path d="M16 27.5l-2.6-2.8h5.2z" fill="#e6cd8e"/>' : '');
  } else if (btn === 'START') body = `<rect x="3" y="7" width="26" height="18" rx="9" fill="${BODY}" stroke="#a89f8a" stroke-width="1.5"/><path d="M10.5 12.5h11M10.5 16h11M10.5 19.5h11" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>`;
  else if (btn === 'BACK') {
    body = st === 'ps'
      ? `<rect x="3" y="7" width="26" height="18" rx="9" fill="${BODY}" stroke="#a89f8a" stroke-width="1.5"/><path d="M12 11v10M16 10v12M20 11v10" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>`
      : `<rect x="3" y="7" width="26" height="18" rx="9" fill="${BODY}" stroke="#a89f8a" stroke-width="1.5"/><rect x="10" y="11" width="8" height="7" fill="none" stroke="${INK}" stroke-width="1.4"/><rect x="14" y="14" width="8" height="7" fill="${BODY}" stroke="${INK}" stroke-width="1.4"/>`;
  } else if (btn === 'UP' || btn === 'DOWN' || btn === 'LEFT' || btn === 'RIGHT') body = dpad(btn);
  else body = `<circle cx="16" cy="16" r="13.4" fill="${BODY}" stroke="#a89f8a" stroke-width="1.5"/>${textIn(esc(btn).slice(0, 3), 9)}`;
  return `<svg class="ae-pg" viewBox="0 0 32 32" data-btn="${btn}" aria-hidden="true">${body}</svg>`;
}
/** Glyph(s) for a binding string ('X' or 'LT+RT'). */
export function bindingSVG(bind, style) {
  return String(bind || '').split('+').map((b) => glyphSVG(b, style)).join('<i class="ae-pg-plus">+</i>');
}
export const buttonName = (btn, style) => String(btn || '').split('+').map((b) => NAME[style === 'ps' ? 'ps' : 'xbox'][b] || b).join(' + ');

const ACTION_LABEL = {
  jump: 'Jump', dodge: 'Dodge roll', slot0: 'Basic attack', slot1: 'Technique II', slot2: 'Technique III', slot3: 'Technique IV', slot4: 'Technique V',
  slot5: 'Ultimate', target: 'Cycle target', targetNearest: 'Target nearest', interact: 'Interact', sprint: 'Sprint (toggle)',
  inventory: 'Character & bag', quest: 'Task log', map: 'World map', menu: 'Menu / settings', walkToggle: 'Walk toggle',
};

// ------------------------------------------------------------------ spatial navigation helpers
const FOCUSABLE = 'button, input, select, textarea, [tabindex], [data-nav]';
function visible(el) {
  if (!el || !el.isConnected || el.disabled) return false;
  if (el.closest('[hidden], [aria-hidden="true"], .ae-touch-ui')) return false;
  if (el.dataset?.nav === 'skip') return false;
  const r = el.getClientRects(); if (!r.length) return false;
  const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return false;
  const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2;
}
function focusables(scope) { return [...scope.querySelectorAll(FOCUSABLE)].filter(visible); }
function pickDir(cur, list, dir) {
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of list) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    let primary, ortho;
    if (dir === 'down' || dir === 'up') {
      primary = dir === 'down' ? by - ay : ay - by;
      const edge = dir === 'down' ? b.top - a.bottom : a.top - b.bottom;
      if (primary <= 4 || edge < -Math.min(a.height, b.height) * 0.5) continue;
      ortho = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)); // gap between x-ranges (0 = overlapping)
      primary = Math.max(0, edge);
    } else {
      primary = dir === 'right' ? bx - ax : ax - bx;
      const edge = dir === 'right' ? b.left - a.right : a.left - b.right;
      if (primary <= 4 || edge < -Math.min(a.width, b.width) * 0.5) continue;
      ortho = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      primary = Math.max(0, edge);
    }
    const centreOff = dir === 'down' || dir === 'up' ? Math.abs(bx - ax) : Math.abs(by - ay);
    const s = primary + ortho * 3 + centreOff * 0.12;
    if (s < bs) { bs = s; best = el; }
  }
  return best;
}
function scrollParent(el, stop) {
  for (let n = el; n && n !== stop?.parentElement; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 4) { const o = getComputedStyle(n).overflowY; if (o === 'auto' || o === 'scroll') return n; }
  }
  return null;
}

// ------------------------------------------------------------------ module
export function createGamepadUI(ui) {
  const { ctx, gs, root } = ui;
  const input = ctx.input;
  if (!input || !input.pad) return null;

  // ---- prefs -> input config
  const P = {
    sens: () => prefs.get('padSens') ?? 1,
    invert: () => !!prefs.get('padInvertY'),
    vib: () => prefs.get('padVibration') !== false,
    auto: () => prefs.get('padAutoSprint') !== false,
    glyphs: () => prefs.get('padGlyphs') || 'auto',
  };
  const syncCfg = () => input.setPadConfig({ lookSpeed: P.sens(), invertY: P.invert(), vibration: P.vib(), autoSprint: P.auto() });
  syncCfg();
  prefs.subscribe((k) => { if (k.startsWith('pad')) { syncCfg(); if (k === 'padGlyphs') refreshGlyphs(); } });
  const style = () => (P.glyphs() === 'auto' ? input.pad.style || 'xbox' : P.glyphs());

  // ---- chrome: focus badge, prompt bar
  const badge = h('div', { class: 'ae-padbadge', hidden: true, 'aria-hidden': 'true' });
  const bar = h('div', { class: 'ae-padbar', hidden: true, 'aria-hidden': 'true' });
  root.append(badge, bar);

  // ---- device state
  let isPad = input.device === 'gamepad';
  function applyDevice() {
    isPad = input.device === 'gamepad';
    root.classList.toggle('is-pad', isPad);
    root.dataset.padStyle = style();
    if (!isPad) { clearFocus(); bar.hidden = true; mapPad()?.setActive(false); }
    else { lastScope = undefined; tick(); }
  }
  ctx.bus.on('input:device', applyDevice);
  ctx.bus.on('input:pad', (p) => {
    refreshGlyphs();
    if (p?.connected) ui.toast?.(`Controller connected — ${style() === 'ps' ? 'PlayStation' : 'Xbox'} layout`, 'info');
    else if (p && !p.connected) ui.toast?.('Controller disconnected', 'warn');
    statusLine && renderControllerSection();
  });
  ctx.bus.on('input:bindings', () => { refreshGlyphs(); renderControllerSection(); });

  // ---- glyph injection
  const bindOf = (action) => input.padBindings[action];
  function injectSlot(el, i) {
    if (!el) return;
    let g = el.querySelector(':scope > .ae-pglyph');
    if (!g) { g = h('span', { class: 'ae-pglyph' }); el.append(g); }
    const b = bindOf(`slot${i}`) || '';
    const sig = `${b}|${style()}`;
    if (g._sig !== sig) { g._sig = sig; g.innerHTML = bindingSVG(b, style()); g.classList.toggle('is-chord', b.includes('+')); }
  }
  function injectAll() {
    root.querySelectorAll('.ae-hotbar').forEach((hb) => hb.querySelectorAll('.ae-slot').forEach((s, i) => injectSlot(s, i)));
    root.querySelectorAll('.ae-bar-preview .slots').forEach((sl) => sl.querySelectorAll('.ae-slot').forEach((s, i) => injectSlot(s, i)));
    root.querySelectorAll('.ae-x').forEach((x) => {
      let g = x.querySelector('.ae-pglyph'); if (!g) { g = h('span', { class: 'ae-pglyph ae-pglyph--x' }); x.append(g); }
      if (g._s !== style()) { g._s = style(); g.innerHTML = glyphSVG('B', style()); }
    });
  }
  function refreshGlyphs() { root.dataset.padStyle = style(); injectAll(); renderBar(true); if (focusEl) placeBadge(); }
  ui.on?.('hotbar', () => requestAnimationFrame(injectAll));
  // re-inject when the creation preview re-renders its slots
  const mo = new MutationObserver(() => { if (moPending) return; moPending = true; requestAnimationFrame(() => { moPending = false; injectAll(); }); });
  let moPending = false;
  root.querySelectorAll('.ae-bar-preview .slots, .ae-hotbar').forEach((n) => mo.observe(n, { childList: true }));

  // ---- on-screen keyboard (character name)
  const osk = createOSK();
  root.append(osk.el);

  // ---- scopes
  const titleEl = () => root.querySelector('.ae-title');
  const ccEl = () => root.querySelector('.ae-cc');
  function topWindow() {
    let top = null, z = -1;
    root.querySelectorAll('.ae-window').forEach((w) => { if (w.hidden) return; const zi = Number(w.style.zIndex) || 0; if (zi >= z) { z = zi; top = w; } });
    return top;
  }
  function scope() {
    if (osk.open) return osk.el;
    const w = topWindow(); if (w) return w;
    if (gs.inGame) return ui.dialogs?.deathOpen ? ui.dialogs.death : null;
    const cc = ccEl(); if (cc && !cc.hidden) return cc;
    const t = titleEl(); if (t && !t.hidden) return t;
    return null;
  }
  // Menus own the pad whenever a scope is open, while not yet in the world, and while chat has focus.
  input.setPadCapture(() => !gs.inGame || scope() !== null || !!ui.chat?.focused);

  const mapPad = () => root.querySelector('.ae-map')?._pad || null;
  const isMap = (s) => s && s.classList.contains('ae-map');

  // ---- focus handling
  let focusEl = null, lastScope, focusMemo = null, recovering = false;
  /** The focused node was re-rendered away (e.g. ability preview slots): focus its replacement. */
  function recover(s) {
    const m = focusMemo; focusEl = null;
    let el = m?.parent?.isConnected ? m.parent.children[m.idx] : null;
    if (!el || !visible(el) || !s.contains(el)) {
      el = null;
      if (m?.rect) {
        const cx = m.rect.left + m.rect.width / 2, cy = m.rect.top + m.rect.height / 2; let bd = Infinity;
        for (const c of focusables(s)) { const r = c.getBoundingClientRect(); const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); if (d < bd) { bd = d; el = c; } }
      }
    }
    if (el) setFocus(el, { sound: false }); else ensureFocus(s);
    return focusEl;
  }
  function clearFocus() { focusEl?.classList.remove('ae-pad-focus'); focusEl = null; badge.hidden = true; }
  function setFocus(el, { sound = true } = {}) {
    if (!el) return;
    if (focusEl !== el) { focusEl?.classList.remove('ae-pad-focus'); if (sound && focusEl) ui.sfx?.('hover'); }
    focusEl = el;
    focusMemo = { parent: el.parentElement, idx: el.parentElement ? [...el.parentElement.children].indexOf(el) : -1, rect: el.getBoundingClientRect() };
    el.classList.add('ae-pad-focus');
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    if (!el.isConnected) { const sc = scope(); if (sc && !recovering) { recovering = true; try { recover(sc); } finally { recovering = false; } } return; }
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ }
    // radio grid: selection follows focus (the dossier updates as you browse the Oaths)
    if (el.classList.contains('ae-oath-card') && el.getAttribute('aria-checked') !== 'true') el.click();
    placeBadge();
  }
  function placeBadge() {
    if (!focusEl || !isPad || !visible(focusEl) || focusEl.tagName === 'INPUT' && focusEl.type === 'range' || focusEl.classList.contains('ae-map__view')) { badge.hidden = true; return; }
    const r = focusEl.getBoundingClientRect(), rr = root.getBoundingClientRect();
    badge.innerHTML = glyphSVG('A', style());
    badge.hidden = false;
    let x = r.right - rr.left - 9, y = r.top - rr.top - 9;
    x = Math.max(2, Math.min(rr.width - 22, x)); y = Math.max(2, Math.min(rr.height - 22, y));
    badge.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }
  function defaultIn(s) {
    const list = focusables(s);
    if (!list.length) return null;
    const pref = (sel) => list.find((e) => e.matches(sel));
    if (isMap(s)) return s.querySelector('.ae-map__view');
    return pref('[data-nav-default]') || pref('.ae-oath-card[aria-checked="true"]') || pref('.ae-opt') || pref('.ae-btn--primary:not([disabled])')
      || list.find((e) => !e.classList.contains('ae-x')) || list[0];
  }
  function ensureFocus(s) {
    if (focusEl && s.contains(focusEl) && visible(focusEl)) return focusEl;
    if (focusEl && !focusEl.isConnected && focusMemo) return recover(s);
    const ae = document.activeElement;
    const el = ae && ae !== document.body && s.contains(ae) && visible(ae) && !ae.classList.contains('ae-x') ? ae : defaultIn(s);
    setFocus(el, { sound: false });
    return el;
  }

  // ---- prompt bar
  let barSig = '';
  function hint(bind, label) { return `<span class="it">${bindingSVG(bind, style())}<span>${esc(label)}</span></span>`; }
  function renderBar(force) {
    const s = isPad ? scope() : null;
    if (!s) { if (!bar.hidden) bar.hidden = true; barSig = ''; return; }
    let kind = 'menu';
    if (s === osk.el) kind = 'osk';
    else if (isMap(s)) kind = 'map';
    else if (s.classList.contains('ae-cc')) kind = 'cc';
    else if (s.classList.contains('ae-title')) kind = 'title';
    else if (s === ui.dialogs?.death) kind = 'death';
    else if (s.classList.contains('ae-dialog')) kind = 'dialog';
    const sig = `${kind}|${style()}`;
    if (!force && sig === barSig && !bar.hidden) return;
    barSig = sig;
    const H = {
      title: [['A', 'Select']],
      cc: [['A', 'Select'], ['LB+RB', 'Step'], ['Y', 'Suggest name'], ['START', 'Swear the Oath']],
      osk: [['A', 'Type'], ['X', 'Delete'], ['Y', 'Suggest'], ['START', 'Done'], ['B', 'Close']],
      map: [['LS', 'Pan'], ['LT+RT', 'Zoom'], ['A', 'Select / travel'], ['R3', 'Centre'], ['B', 'Close']],
      dialog: [['A', 'Choose'], ['B', 'Leave']],
      death: [['A', 'Return to the shrine']],
      menu: [['A', 'Select'], ['B', 'Close']],
    }[kind];
    bar.innerHTML = H.map(([b, l]) => hint(b, l)).join('');
    bar.hidden = false;
  }

  // ---- navigation events (input emits these only while captured)
  ctx.bus.on('gamepad:nav', (ev) => {
    if (!ev) return;
    if (ui.chat?.focused && ev.btn === 'B') { document.activeElement?.blur?.(); return; }
    const s = scope();
    if (!s) return;
    if (ev.dir) { navDir(s, ev); return; }
    navButton(s, ev.btn);
  });

  function navDir(s, ev) {
    if (isMap(s) && ev.src === 'stick') return; // left stick pans the map
    const cur = ensureFocus(s);
    if (!cur) return;
    if (cur.tagName === 'INPUT' && cur.type === 'range' && (ev.dir === 'left' || ev.dir === 'right')) {
      const min = Number(cur.min || 0), max = Number(cur.max || 1), step = Number(cur.step) || (max - min) / 100;
      const inc = Math.max(step, Math.round(((max - min) / 20) / step) * step);
      const v = Math.min(max, Math.max(min, Number(cur.value) + (ev.dir === 'right' ? inc : -inc)));
      cur.value = String(v);
      cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const next = pickDir(cur, focusables(s), ev.dir);
    if (next) setFocus(next);
  }

  function clickIf(el) { if (el && visible(el)) { el.click(); return true; } return false; }
  function navButton(s, btn) {
    const cc = s.classList.contains('ae-cc');
    switch (btn) {
      case 'A': {
        if (isMap(s) && (!focusEl || focusEl.classList.contains('ae-map__view') || !s.contains(focusEl))) { if (!mapPad()?.select()) ui.sfx?.('error'); return; }
        const el = ensureFocus(s); if (!el) return;
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) { osk.show(el); return; }
        if (el.tagName === 'INPUT' && el.type === 'range') return;
        el.click();
        // the clicked control may have re-rendered (e.g. class cards) — keep focus on its replacement
        requestAnimationFrame(() => { const sc = scope(); if (focusEl && !focusEl.isConnected && sc) recover(sc); else placeBadge(); });
        return;
      }
      case 'B':
        if (s === osk.el) { osk.hide(); return; }
        if (s.classList.contains('ae-window')) { clickIf(s.querySelector('.ae-titlebar .ae-x')) || clickIf(s.querySelector('.ae-x')); return; }
        if (cc) { const back = s.querySelector('.ae-cc__nav .ae-btn:not(.ae-btn--primary)'); if (back && !back.disabled) clickIf(back); }
        return;
      case 'START':
        if (s === osk.el) { osk.done(); return; }
        if (s.classList.contains('ae-window')) { clickIf(s.querySelector('.ae-titlebar .ae-x')); return; }
        if (cc) { clickIf([...s.querySelectorAll('.ae-name-row .ae-btn--primary')].pop()); return; }
        if (s === ui.dialogs?.death) { clickIf(s.querySelector('.ae-btn--primary')); return; }
        if (s.classList.contains('ae-title')) clickIf(s.querySelector('.ae-btn--primary'));
        return;
      case 'BACK':
        if (isMap(s)) clickIf(s.querySelector('.ae-x'));
        return;
      case 'X':
        if (s === osk.el) osk.key('⌫');
        return;
      case 'Y':
        if (s === osk.el) { osk.key('Suggest'); return; }
        if (cc) clickIf(s.querySelector('button[title="Suggest a name"]'));
        return;
      case 'LB': case 'RB': {
        if (!cc) return;
        const steps = [...s.querySelectorAll('.ae-step')];
        const i = steps.findIndex((b) => b.getAttribute('aria-selected') === 'true');
        const n = Math.max(0, Math.min(steps.length - 1, i + (btn === 'RB' ? 1 : -1)));
        if (n !== i) { steps[n].click(); const col = s.querySelector(`.ae-cc__col[data-pane="${n}"]`); const f = col && focusables(col)[0]; if (f) setFocus(f); }
        return;
      }
      case 'R3':
        if (isMap(s)) mapPad()?.centreOnMe();
        return;
      default:
    }
  }

  // ---- gameplay extras: R3 = target nearest hostile
  ctx.bus.on('input:action', (a) => {
    if (a !== 'targetNearest' || !gs.inGame) return;
    try { const n = ctx.actors?.nearestHostile?.(45); if (n?.id != null) { ctx.combat?.setTarget?.(n.id); ui.sfx?.('target'); } } catch { /* ignore */ }
  });

  // ---- haptics
  const padActive = () => input.device === 'gamepad';
  ctx.bus.on('net:ev', (p) => {
    const e = p?.e ?? p; if (!e?.type || !padActive()) return;
    try {
      if (e.type === 'hit' && gs.isSelf?.(e.dst)) {
        const frac = Number(e.amount || 0) / Math.max(1, gs.mhp || 1);
        if (frac >= 0.06 || e.crit) { const k = Math.min(1, Math.max(0.25, frac * 3)); input.rumble(k, k * 0.6, 110 + Math.min(500, frac * 900)); }
      } else if (e.type === 'death' && gs.isSelf?.(e.id)) input.rumble(1, 0.7, 900);
    } catch { /* ignore */ }
  });
  ctx.bus.on('combat:cast', (p) => { if (padActive() && Number(p?.slot) === 5) input.rumble(0.55, 0.95, 380); });

  // ---- per-frame: scope tracking, map pan/zoom, right-stick scroll
  let lastT = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const s = isPad ? scope() : null;
    if (s !== lastScope) {
      lastScope = s;
      if (s) { if (!(focusEl && s.contains(focusEl))) { focusEl?.classList.remove('ae-pad-focus'); focusEl = null; } ensureFocus(s); } else clearFocus();
      mapPad()?.setActive(isPad && isMap(s));
      renderBar();
      injectAll();
    }
    if (!s) return;
    if (focusEl && !focusEl.isConnected) recover(s);
    else if (focusEl && document.activeElement !== focusEl && s.contains(focusEl) && !osk.open) { try { focusEl.focus({ preventScroll: true }); } catch { /* ignore */ } }
    const pad = input.pad;
    if (isMap(s)) {
      const mp = mapPad();
      if (mp) {
        const px = 760 * dt;
        mp.pan((pad.lx + pad.rx) * px, (pad.ly + pad.ry) * px);
        const z = (pad.rt > 0.1 ? pad.rt : 0) - (pad.lt > 0.1 ? pad.lt : 0);
        if (z) mp.zoom(Math.exp(z * 1.8 * dt));
      }
    } else if (pad.ry) {
      const sp = (focusEl && scrollParent(focusEl, s)) || s.querySelector('.ae-scroll');
      if (sp) sp.scrollTop += pad.ry * 900 * dt;
    }
    if (focusEl && !badge.hidden) placeBadge();
  }
  try { ctx.addUpdate?.(tick, -6); } catch { /* ignore */ }
  // The render loop can stall during loading; keep nav chrome fresh at a low rate regardless.
  setInterval(() => { if (isPad) { renderBar(); if (focusEl) placeBadge(); } }, 500);

  // ---- settings: Controller section
  let statusLine = null, layoutGrid = null;
  const settingsBody = root.querySelector('.ae-settings .ae-settings__body');
  if (settingsBody) buildControllerSection(settingsBody);

  function buildControllerSection(body) {
    const sec = h('section', { class: 'ae-set-sec ae-set-pad' }, h('h3', null, h('b', null, '05'), 'Controller'));
    statusLine = h('p', { class: 'ae-note ae-pad-status' });
    const row = (label, control, value) => h('div', { class: 'ae-set-row' }, h('label', null, label), control, value || h('span'));
    const slider = (key, label, min, max, step, def, fmt) => {
      const v = h('span', { class: 'v ae-num' });
      const r = h('input', { class: 'ae-range', type: 'range', min, max, step, value: prefs.get(key) ?? def, 'aria-label': label });
      const paint = () => { r.style.setProperty('--p', `${((r.value - min) / (max - min)) * 100}%`); v.textContent = fmt(Number(r.value)); };
      r.addEventListener('input', () => { prefs.set(key, Number(r.value)); paint(); });
      r.addEventListener('change', () => ui.sfx?.('click'));
      r.addEventListener('keydown', (e) => e.stopPropagation());
      paint(); return row(label, r, v);
    };
    const toggle = (key, label, get, onChange) => {
      const b = h('button', { class: 'ae-toggle', type: 'button', role: 'switch', 'aria-checked': get() ? 'true' : 'false', 'aria-label': label });
      b.addEventListener('click', () => { const nv = !get(); prefs.set(key, nv); b.setAttribute('aria-checked', nv ? 'true' : 'false'); ui.sfx?.('click'); onChange?.(nv); });
      return row(label, b);
    };
    const seg = h('div', { class: 'ae-seg', role: 'group', 'aria-label': 'Button glyphs' }, [['auto', 'Auto'], ['xbox', 'Xbox'], ['ps', 'PlayStation']].map(([k, l]) => {
      const b = h('button', { type: 'button', 'aria-pressed': P.glyphs() === k ? 'true' : 'false', 'data-glyphs': k }, l);
      b.addEventListener('click', () => { prefs.set('padGlyphs', k); seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); ui.sfx?.('click'); renderControllerSection(); });
      return b;
    }));
    const test = h('button', { class: 'ae-btn ae-btn--sm', type: 'button' }, 'Test');
    test.addEventListener('click', () => { if (!input.rumble(0.8, 0.5, 300)) ui.toast?.('Vibration is off or unsupported on this controller', 'warn'); });
    const reset = h('button', { class: 'ae-btn ae-btn--sm ae-btn--ghost', type: 'button' }, 'Reset layout');
    reset.addEventListener('click', () => { input.resetPadBindings(); ui.sfx?.('click'); });
    layoutGrid = h('div', { class: 'ae-padmap' });
    sec.append(statusLine,
      slider('padSens', 'Stick look speed', 0.3, 2.5, 0.05, 1, (v) => `${v.toFixed(2)}×`),
      toggle('padInvertY', 'Invert stick Y', P.invert),
      toggle('padAutoSprint', 'Sprint at full stick', P.auto),
      h('div', { class: 'ae-set-row' }, h('label', null, 'Vibration'), h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
        (() => { const t = toggle('padVibration', 'Vibration', P.vib).querySelector('.ae-toggle'); return t; })(), test), h('span')),
      row('Button glyphs', seg),
      h('div', { class: 'ae-padmap-head' }, h('span', { class: 'ae-note' }, 'Select an action, then press the new button (hold LT for a chord).'), reset),
      layoutGrid);
    // sits just before the keyboard reference
    const keyRef = [...body.querySelectorAll('.ae-set-sec')].find((x) => x.querySelector('.ae-keys'));
    if (keyRef) { body.insertBefore(sec, keyRef); keyRef.classList.add('ae-set-keys'); } else body.append(sec);
    renderControllerSection();
  }
  function renderControllerSection() {
    if (!statusLine || !layoutGrid) return;
    const pad = input.pad;
    statusLine.textContent = pad.connected ? `Connected: ${pad.id}` : 'No controller detected — connect one and press any button.';
    const b = input.padBindings;
    layoutGrid.innerHTML = '';
    const rows = [...PAD_REBINDABLE.map((a) => [a, b[a], true]), ['walkToggle', b.walkToggle, false], ['move', 'LS', false], ['look', 'RS', false], ['zoom', 'LT+RS', false]];
    for (const [a, bind, canRebind] of rows) {
      const label = ACTION_LABEL[a] || { move: 'Move', look: 'Camera', zoom: 'Camera zoom' }[a] || a;
      const el = h(canRebind ? 'button' : 'div', { class: 'ae-padmap-row', type: canRebind ? 'button' : null, 'data-action': a, title: canRebind ? `Rebind ${label}` : null },
        h('span', { class: 'g', html: bindingSVG(bind, style()) }), h('span', { class: 'l' }, label), h('span', { class: 'n' }, buttonName(bind, style())));
      if (canRebind) el.addEventListener('click', () => rebind(a, el));
      layoutGrid.append(el);
    }
  }
  let rebinding = false;
  async function rebind(action, el) {
    if (rebinding) return;
    rebinding = true; el.classList.add('is-listening'); el.querySelector('.n').textContent = 'Press a button…';
    const timer = setTimeout(() => input.cancelPadCapture(), 6000);
    const name = await input.capturePadButton();
    clearTimeout(timer); rebinding = false;
    if (!name || name === 'HOME') { renderControllerSection(); return; }
    const chord = name !== 'LT' && input.pad.held('LT');
    input.setPadBinding(action, chord ? `LT+${name}` : name);
    ui.sfx?.('confirm');
    requestAnimationFrame(() => { const n = layoutGrid.querySelector(`[data-action="${action}"]`); if (n && isPad) setFocus(n, { sound: false }); });
  }

  // ---- on-screen keyboard
  function createOSK() {
    const rows = ['QWERTYUIOP', 'ASDFGHJKL\'', 'ZXCVBNM-'];
    const disp = h('div', { class: 'ae-osk__disp ae-num' });
    const err = h('div', { class: 'ae-osk__err' });
    let target = null, shift = true;
    const keys = [];
    const mk = (k, cls = '', label = k) => { const b = h('button', { class: `ae-osk__k ${cls}`, type: 'button', 'data-k': k }, label); b.addEventListener('click', () => key(k)); keys.push(b); return b; };
    const grid = h('div', { class: 'ae-osk__grid' },
      ...rows.map((r) => h('div', { class: 'ae-osk__row' }, [...r].map((c) => mk(c)))),
      h('div', { class: 'ae-osk__row' }, mk('Shift', 'w2', 'Shift'), mk(' ', 'w4', 'Space'), mk('⌫', 'w2', '⌫'), mk('Suggest', 'w2', 'Suggest'), mk('Done', 'w2 is-done', 'Done')));
    const el = h('div', { class: 'ae-osk ae-panel', hidden: true, role: 'dialog', 'aria-label': 'On-screen keyboard' },
      h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, '✎'), h('h2', null, 'Your name in the Weave')), disp, err, grid);
    function paint() {
      disp.textContent = (target?.value || '') + '▏';
      keys.forEach((b) => { const k = b.dataset.k; if (k.length === 1 && /[A-Z]/.test(k)) b.textContent = shift ? k : k.toLowerCase(); });
      keys.find((b) => b.dataset.k === 'Shift')?.setAttribute('aria-pressed', shift ? 'true' : 'false');
      const e = target && target.getAttribute('aria-describedby') && document.getElementById(target.getAttribute('aria-describedby'));
      err.textContent = e?.textContent || '';
    }
    function emit() { target?.dispatchEvent(new Event('input', { bubbles: true })); paint(); }
    function key(k) {
      if (!target) return;
      ui.sfx?.('click');
      const v = target.value || '';
      if (k === 'Done') { done(); return; }
      if (k === 'Shift') { shift = !shift; paint(); return; }
      if (k === '⌫') { target.value = v.slice(0, -1); shift = !target.value; emit(); return; }
      if (k === 'Suggest') { const d = root.querySelector('button[title="Suggest a name"]'); if (d) d.click(); else return; shift = false; paint(); return; }
      if (v.length >= Number(target.maxLength > 0 ? target.maxLength : 16)) { ui.sfx?.('error'); return; }
      const ch = k.length === 1 && /[A-Z]/.test(k) ? (shift ? k : k.toLowerCase()) : k;
      target.value = v + ch;
      if (shift && /[A-Za-z]/.test(ch)) shift = false;
      if (ch === ' ' || ch === '-') shift = true;
      emit();
    }
    function show(inp) {
      target = inp; shift = !inp.value; el.hidden = false; api.open = true; paint();
      setFocus(keys[0], { sound: false });
    }
    function hide() {
      if (!api.open) return;
      el.hidden = true; api.open = false;
      const t = target; target = null;
      if (t && visible(t)) setFocus(t, { sound: false });
    }
    function done() {
      const t = target; hide();
      // move on to the confirm button so A swears the oath
      const confirm = t?.closest('.ae-name-row')?.querySelector('.ae-btn--primary');
      if (confirm && visible(confirm)) setFocus(confirm, { sound: false });
    }
    const api = { el, open: false, show, hide, done, key };
    return api;
  }

  applyDevice();
  injectAll();
  return { glyphSVG, bindingSVG, scope, focus: () => focusEl, osk };
}
