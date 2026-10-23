// HUD core: unit frames, buffs, compass, region banner, hotbar with cooldown sweeps, cast bar, XP bar.
import { createTimeline } from 'animejs';
import { h, esc, fmtNum, rgbTriplet, prefersReducedMotion } from './dom.js';
import { emblemSVG } from './emblems.js';
import { hotbarView, slotHTML } from './abilityView.js';
import { statusIcon } from './icons.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { CREATURES } from '@shared/creatures.js';
import { biomeLabel } from './create.js';
import { sanctuaries } from './mapData.js';

const CREATURE_BY_NAME = Object.fromEntries(CREATURES.map((c) => [c.name, c]));
const setText = (el, v) => { const t = String(v); if (el._t !== t) { el._t = t; el.textContent = t; } };

/** Resource bar with smooth drain trail. */
export function makeBar(kind, { thin = false, text = true } = {}) {
  const fill = h('div', { class: 'ae-bar__fill' });
  const trail = h('div', { class: 'ae-bar__trail' });
  const txt = text ? h('div', { class: 'ae-bar__txt ae-num' }) : null;
  const el = h('div', { class: `ae-bar ae-bar--${kind}${thin ? ' ae-bar--thin' : ''}`, role: 'meter', 'aria-valuemin': 0 }, trail, fill, txt);
  let target = 1, shown = 1, trailV = 1, hold = 0, lastTxt = '', lastF = -1, lastT = -1;
  return {
    el,
    set(cur, max, label) {
      const m = Math.max(1, max || 1);
      const t = Math.max(0, Math.min(1, (cur || 0) / m));
      if (t < target - 0.001) hold = 0.45;
      target = t;
      const s = label ?? `${fmtNum(cur)} / ${fmtNum(m)}`;
      if (txt && s !== lastTxt) { txt.textContent = s; lastTxt = s; el.setAttribute('aria-valuenow', Math.round(cur || 0)); el.setAttribute('aria-valuemax', Math.round(m)); }
    },
    snap() { shown = trailV = target; },
    tick(dt) {
      if (target < shown) shown = target; else shown += (target - shown) * Math.min(1, dt * 6);
      if (trailV > shown) { if (hold > 0) hold -= dt; else trailV += (shown - trailV) * Math.min(1, dt * 3.2); } else trailV = shown;
      if (prefersReducedMotion()) { shown = trailV = target; }
      if (Math.abs(shown - lastF) > 0.0015) { fill.style.transform = `scaleX(${shown.toFixed(4)})`; lastF = shown; }
      if (Math.abs(trailV - lastT) > 0.0015) { trail.style.transform = `scaleX(${trailV.toFixed(4)})`; lastT = trailV; }
    },
  };
}

function unitFrame(kind) {
  const portrait = h('div', { class: 'ae-portrait' });
  const lvl = h('span', { class: 'lvl ae-num' }, '1');
  portrait.append(lvl);
  const name = h('span', { class: 'nm' }, '');
  const sub = h('small', null, '');
  const role = h('span', { class: 'role', hidden: true }, '');
  const hp = makeBar('hp');
  const mp = makeBar('mp', { thin: kind === 'player' ? false : true, text: kind === 'player' });
  const xp = kind === 'player' ? null : null;
  const el = h('div', { class: `ae-unit ae-unit--${kind} ae-panel ae-panel--glass`, role: 'group', 'aria-label': kind === 'player' ? 'Player' : 'Target' },
    portrait, h('div', null, h('div', { class: 'ae-unit__name' }, name, sub, role), hp.el, mp.el));
  return { el, portrait, lvl, name, sub, role, hp, mp, xp, emblemFor: null };
}

export function createHud(ui) {
  const { ctx, gs } = ui;
  const root = h('div', { class: 'ae-hud is-hidden' });

  // ----- unit frames
  const pf = unitFrame('player');
  const tf = unitFrame('target');
  tf.el.hidden = true;
  const buffs = h('div', { class: 'ae-buffs', 'aria-label': 'Status effects' });

  // ----- compass + region chip
  const PPD = 3.2; // px per degree
  const strip = h('div', { class: 'ae-compass__strip' });
  const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = -180; d < 540; d += 15) {
    const n = ((d % 360) + 360) % 360;
    const lbl = CARD[n];
    strip.append(h('div', { class: `ae-compass__tick${lbl ? ' card' : ''}${n === 0 ? ' n' : ''}`, style: { left: `${d * PPD}px` } }, h('i'), lbl ? h('span', null, lbl) : h('span', { style: { fontSize: '10px', opacity: '.6' } }, n % 45 ? '' : n)));
  }
  const pois = h('div', { style: { position: 'absolute', inset: '0' } });
  const compass = h('div', { class: 'ae-compass', 'aria-hidden': 'true' }, strip, pois, h('div', { class: 'ae-compass__needle' }));
  const regionChip = h('div', { class: 'ae-region-chip' }, '');

  // ----- region banner
  const bEm = h('div', { class: 'ae-banner__em' });
  const bName = h('div', { class: 'ae-banner__name' });
  const bSub = h('div', { class: 'ae-banner__sub' });
  const bRuleL = h('i'), bRuleR = h('i');
  const banner = h('div', { class: 'ae-banner', hidden: true, role: 'status', 'aria-live': 'polite' },
    bEm, h('div', { class: 'ae-banner__kick' }, 'Entering'), bName, h('div', { class: 'ae-banner__rule' }, bRuleL, h('span', { class: 'ae-diamond' }), bRuleR), bSub);

  // ----- hotbar / xp / cast
  const hotbar = h('div', { class: 'ae-hotbar ae-int', role: 'toolbar', 'aria-label': 'Abilities' });
  const xpBar = makeBar('xp', { text: false });
  const xpL = h('span', { class: 'ae-num' }, 'Level 1');
  const xpR = h('span', { class: 'ae-num' }, '0 / 0');
  const xpWrap = h('div', { class: 'ae-xpbar' }, xpBar.el, h('div', { class: 'ae-xpbar__lbl' }, xpL, xpR));
  const actionbar = h('div', { class: 'ae-actionbar ae-panel ae-panel--glass' }, hotbar, xpWrap);
  const castLbl = h('div', { class: 'ae-castbar__lbl' });
  const castBar = makeBar('cast', { text: false });
  const cast = h('div', { class: 'ae-castbar', hidden: true }, castLbl, castBar.el);
  const fps = h('div', { class: 'ae-fps ae-num', hidden: true }, '');

  const commands = h('nav', { class: 'ae-command-dock', 'aria-label': 'Game menus' });
  for (const [id, label, key] of [['map', 'World map', 'M'], ['character', 'Character', 'I'], ['guide', 'Controls', '?'], ['settings', 'Menu', 'Esc']]) {
    const button = h('button', { type: 'button', class: 'ae-command' }, h('span', null, label), h('kbd', null, key));
    button.onclick = () => id === 'guide' ? ui.guide?.toggle() : ui.toggleWindow(id);
    commands.append(button);
  }
  root.append(commands);
  root.append(pf.el, tf.el, buffs, compass, regionChip, banner, actionbar, cast, fps);

  // ----- hotbar build & cooldown state
  let view = [];
  const slotEls = [];
  const cds = []; // {end, total, wasActive}
  function buildHotbar() {
    const c = gs.character; if (!c) return;
    view = hotbarView(c.oath, c.cls, ctx.combat?.hotbar);
    hotbar.innerHTML = ''; slotEls.length = 0;
    view.forEach((v, i) => {
      if (i === 5) hotbar.append(h('span', { class: 'sep' }));
      const s = h('button', { class: `ae-slot${v.ult ? ' is-ult' : ''}`, type: 'button', title: `${v.name} (${v.key})`, 'aria-label': `${v.name}, key ${v.key}`,
        style: `--ab:${v.accent};--ab-rgb:${v.accentRgb}`, html: slotHTML(v) });
      s.addEventListener('click', () => { ctx.input?.press?.(`slot${i}`); flash(i); });
      s.addEventListener('mouseenter', () => ui.showAbilityTip?.(v, s));
      s.addEventListener('mouseleave', () => ui.hideTip?.());
      s.addEventListener('focus', () => ui.showAbilityTip?.(v, s));
      s.addEventListener('blur', () => ui.hideTip?.());
      hotbar.append(s); slotEls.push(s);
      cds[i] = cds[i] || { end: 0, total: 1, active: false };
    });
    ui.emit?.('hotbar', view);
  }
  function flash(i) {
    const s = slotEls[i]; if (!s) return;
    s.classList.remove('is-flash'); void s.offsetWidth; s.classList.add('is-flash');
    ui.touch?.flash?.(i);
  }

  /** Normalize `until` (unknown clock base) to remaining seconds. */
  function remainingFrom(p) {
    if (Number.isFinite(p.duration)) return p.duration;
    if (Number.isFinite(p.remaining)) return p.remaining;
    const u = Number(p.until);
    if (!Number.isFinite(u)) return 0;
    const perf = (ctx.gameplayNow?.() ?? performance.now()), clk = ctx.clock?.time ?? 0;
    let st; try { st = ctx.net?.serverTime?.(); } catch { st = undefined; }
    const inRange = (r) => Number.isFinite(r) && r >= 0 && r <= 600;
    let r;
    if (u > 1e12) r = (u - (Number.isFinite(st) && st > 1e12 ? st : Date.now())) / 1000; // epoch ms
    else if (u > 1e4) r = (u - perf) / 1000; // (ctx.gameplayNow?.() ?? performance.now()) ms
    else r = [u - clk, u - perf / 1000, Number.isFinite(st) ? u - st : NaN].find(inRange); // seconds
    return inRange(r) ? r : 0;
  }
  function setCooldown(p) {
    const i = Number(p?.slot); if (!(i >= 0 && i < 6)) return;
    const rem = remainingFrom(p);
    const total = Math.max(rem, Number(p.total) || view[i]?.cooldown || rem || 1);
    cds[i] = { end: (ctx.gameplayNow?.() ?? performance.now()) + rem * 1000, total, active: rem > 0 };
    ui.touch?.setCooldown?.(i, cds[i]);
  }

  // ----- cast bar
  let castEnd = 0, castDur = 0, castStart = 0;
  function startCast(slot, dur, name) {
    if (!(dur > 0.05)) return;
    const now = (ctx.gameplayNow?.() ?? performance.now());
    if (now < castEnd && Math.abs(now - castStart) < 120) return;
    castStart = now; castDur = dur; castEnd = now + dur * 1000;
    castLbl.textContent = name || view[slot]?.name || 'Casting';
    castBar.set(0, 1, ''); castBar.snap();
    cast.hidden = false; cast.style.opacity = '1';
  }

  // ----- target
  function renderTarget() {
    const a = gs.actor(gs.target);
    if (!a || a.alive === false) { if (!tf.el.hidden && !a) tf.el.hidden = true; if (a && a.alive === false) { tf.hp.set(0, a.mhp || 1, 'Dead'); } return; }
    if (tf.el.hidden) { tf.el.hidden = false; tf.hp.snap(); }
    const cr = CREATURE_BY_NAME[a.name];
    const oath = OATH_BY_ID[a.oath || cr?.oath];
    if (tf._id !== a.id) {
      tf._id = a.id;
      tf.name.textContent = a.name || 'Unknown';
      tf.sub.textContent = a.kind === 'npc' ? 'Citizen' : a.kind === 'player' ? (a.cls || '') : (cr ? cr.archetype : '');
      const role = cr?.role;
      tf.role.hidden = !(role === 'elite' || role === 'boss' || role === 'veteran');
      tf.role.textContent = role || '';
      const accent = oath?.accent || (a.kind === 'mob' ? '#e05a50' : '#c9a866');
      tf.el.style.setProperty('--accent', accent); tf.el.style.setProperty('--accent-rgb', rgbTriplet(accent));
      tf.portrait.innerHTML = oath ? emblemSVG(oath.id, { title: false }) : '';
      tf.portrait.append(tf.lvl);
      tf.el.classList.toggle('is-hostile', a.kind === 'mob');
      tf.hp.snap();
    }
    setText(tf.lvl, a.level ?? a.lvl ?? '?');
    tf.hp.set(a.hp ?? 0, a.mhp ?? 1);
    if (Number.isFinite(a.mp) && a.mmp) { tf.mp.el.hidden = false; tf.mp.set(a.mp, a.mmp); } else tf.mp.el.hidden = true;
  }

  // ----- buffs
  const buffEls = new Map();
  function addStatus(status, dur) {
    const key = String(status);
    const ic = statusIcon(key);
    let b = buffEls.get(key);
    if (!b) {
      const span = h('span', { class: 'ae-num' });
      const el = h('div', { class: `ae-buff${ic.debuff ? ' is-debuff' : ''}`, title: key.replace(/[_-]/g, ' '), html: ic.svg }, span);
      buffs.append(el);
      b = { el, span, end: 0 };
      buffEls.set(key, b);
    }
    b.end = (ctx.gameplayNow?.() ?? performance.now()) + (Number(dur) || 5) * 1000;
  }

  // ----- region
  let regionId = null;
  function setRegion(oath, { announce = true } = {}) {
    if (!oath || oath.id === regionId) return;
    regionId = oath.id;
    gs.region = oath;
    regionChip.textContent = `${oath.name} · ${biomeLabel(oath.biome)}`;
    ui.minimap?.setRegion(oath);
    if (!announce) return;
    banner.style.setProperty('--accent', oath.accent); banner.style.setProperty('--accent-rgb', rgbTriplet(oath.accent));
    bEm.innerHTML = emblemSVG(oath.id, { ring: true });
    bName.textContent = oath.name;
    bSub.textContent = `${oath.elementLabel} · ${biomeLabel(oath.biome)}`;
    banner.hidden = false;
    ui.sfx('region');
    if (prefersReducedMotion()) { banner.style.opacity = '1'; clearTimeout(setRegion._t); setRegion._t = setTimeout(() => { banner.hidden = true; }, 4000); return; }
    try {
      setRegion._tl?.pause?.();
      const tl = createTimeline({ defaults: { ease: 'outExpo' } });
      tl.add(banner, { opacity: [0, 1], duration: 500 }, 0)
        .add(bEm, { opacity: [0, 1], scale: [0.6, 1], rotate: ['-30deg', '0deg'], duration: 1400 }, 0)
        .add(bName, { opacity: [0, 1], letterSpacing: ['0.5em', '0.14em'], filter: ['blur(8px)', 'blur(0px)'], duration: 1600 }, 150)
        .add([bRuleL, bRuleR], { scaleX: [0, 1], duration: 1200 }, 350)
        .add(bSub, { opacity: [0, 1], translateY: [6, 0], duration: 900 }, 600)
        .add(banner, { opacity: [1, 0], duration: 900, ease: 'inQuad', onComplete: () => { banner.hidden = true; } }, 4200);
      setRegion._tl = tl;
    } catch { setTimeout(() => { banner.hidden = true; }, 4000); }
  }

  // ----- compass POIs (nearest sanctuaries)
  const poiEls = new Map();
  function updatePois(headDeg) {
    const p = gs.pos();
    const list = (updatePois._l ||= sanctuaries(ctx));
    if (!ctx.architecture === !!updatePois._arch) { updatePois._arch = !!ctx.architecture; updatePois._l = sanctuaries(ctx); }
    for (const s of list) {
      const dx = s.x - p.x, dz = s.z - p.z; const dist = Math.hypot(dx, dz);
      let el = poiEls.get(s.oath.id);
      const visible = dist < 2200 && dist > 60;
      if (!visible) { if (el) el.style.display = 'none'; continue; }
      if (!el) {
        el = h('div', { class: 'ae-compass__tick poi', html: `<span style="width:14px;height:14px;display:block;margin-top:6px">${emblemSVG(s.oath.id, { title: false })}</span>` });
        el.style.color = s.oath.accent; pois.append(el); poiEls.set(s.oath.id, el);
      }
      let d = (Math.atan2(dx, dz) * 180) / Math.PI - headDeg;
      d = ((d + 540) % 360) - 180;
      if (Math.abs(d) > 75) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = `calc(50% + ${(d * PPD).toFixed(1)}px)`;
      el.style.opacity = String(Math.max(0.35, 1 - dist / 2400));
    }
  }

  // ----- per-frame update (throttled DOM writes)
  let acc = 0, fpsAcc = 0, lastHeadPx = null, lastRegionCheck = 0;
  function update(dt, now) {
    gs.sync();
    acc += dt;
    pf.hp.tick(dt); pf.mp.tick(dt); xpBar.tick(dt); tf.hp.tick(dt); tf.mp.tick(dt);
    // cast bar
    if (!cast.hidden) {
      const k = castDur > 0 ? (now - castStart) / (castDur * 1000) : 1;
      castBar.set(Math.min(1, k), 1, ''); castBar.tick(1);
      if (k >= 1) { cast.hidden = true; }
    }
    // cooldown sweeps at ~30 Hz
    if (acc >= 1 / 30) {
      acc = 0;
      const mana = gs.mp;
      for (let i = 0; i < slotEls.length; i++) {
        const s = slotEls[i]; const c = cds[i]; const v = view[i];
        if (c && c.active) {
          const rem = (c.end - now) / 1000;
          if (rem <= 0) {
            c.active = false; s.style.setProperty('--cd', '0'); setText(s.lastChild, '');
            s.classList.remove('is-ready'); void s.offsetWidth; s.classList.add('is-ready');
          } else {
            s.style.setProperty('--cd', (rem / c.total).toFixed(3));
            setText(s.lastChild, rem >= 1.5 ? Math.ceil(rem) : rem.toFixed(1));
          }
        }
        const oom = !!(v && v.mana && mana < v.mana);
        if (s._oom !== oom) { s._oom = oom; s.classList.toggle('is-oom', oom); }
      }
      ui.touch?.update?.(now, cds, view, mana);
      // frames
      pf.hp.set(gs.hp, gs.mhp); pf.mp.set(gs.mp, gs.mmp);
      setText(pf.lvl, gs.level);
      xpBar.set(gs.xp, gs.next);
      setText(xpL, `Level ${gs.level}`); setText(xpR, `${fmtNum(gs.xp)} / ${fmtNum(gs.next)} XP`);
      if (gs.target != null) renderTarget(); else if (!tf.el.hidden) tf.el.hidden = true;
      // compass
      const hd = ((gs.heading() * 180) / Math.PI + 360) % 360;
      const px = Math.round(-hd * PPD);
      if (px !== lastHeadPx) { strip.style.transform = `translateX(${px}px)`; lastHeadPx = px; }
      updatePois(hd);
      // buffs
      for (const [k, b] of buffEls) {
        const rem = (b.end - now) / 1000;
        if (rem <= 0) { b.el.remove(); buffEls.delete(k); } else setText(b.span, rem >= 60 ? `${Math.ceil(rem / 60)}m` : Math.ceil(rem));
      }
      // region fallback when actors don't emit player:region
      if (now - lastRegionCheck > 1000) { lastRegionCheck = now; if (!ui._regionFromBus) setRegion(gs.regionHere()); }
    }
    fpsAcc += dt;
    if (!fps.hidden && fpsAcc > 0.5) { fpsAcc = 0; try { fps.textContent = `${(ctx.engine?.getFps?.() || (dt > 0 ? 1 / dt : 0)).toFixed(0)} fps`; } catch { /* ignore */ } }
  }

  function setPlayer() {
    const c = gs.character; if (!c) return;
    const o = OATH_BY_ID[c.oath];
    root.style.setProperty('--accent', o.accent); root.style.setProperty('--accent-rgb', rgbTriplet(o.accent));
    pf.name.textContent = c.name;
    pf.sub.textContent = o[c.cls]?.title || c.cls;
    pf.portrait.innerHTML = emblemSVG(o.id, { title: false });
    pf.portrait.append(pf.lvl);
    pf.hp.set(gs.hp, gs.mhp); pf.mp.set(gs.mp, gs.mmp); pf.hp.snap(); pf.mp.snap();
    buildHotbar();
  }

  return {
    el: root, update, setPlayer, buildHotbar, setCooldown, startCast, flash, addStatus, setRegion,
    showFps(v) { fps.hidden = !v; },
    hideBanner() { try { setRegion._tl?.pause?.(); } catch { /* ignore */ } banner.hidden = true; },
    show() { root.classList.remove('is-hidden'); },
    hide() { root.classList.add('is-hidden'); },
    get view() { return view; },
    targetChanged() { tf._id = null; renderTarget(); },
    esc,
  };
}
