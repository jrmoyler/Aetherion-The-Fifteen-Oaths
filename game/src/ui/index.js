// Aetherion UI module: title, character creation, loading, HUD, windows, touch controls, PWA, audio.
// Contract (game/CONTRACTS.md): init(ctx) -> { chooseCharacter, enterGame, toast, log, showDialog }.
import './ui.css';
import { h, esc, isCoarse, setForcedReducedMotion, rgbTriplet } from './dom.js';
import { prefs } from './prefs.js';
import { createState } from './state.js';
import { createLoading } from './loading.js';
import { createTitle } from './title.js';
import { createCharacterScreen } from './create.js';
import { createFieldGuide } from './fieldguide.js';
import { createHud } from './hud.js';
import { createFloaters } from './floaters.js';
import { createMinimap } from './minimap.js';
import { createChat } from './chat.js';
import { createQuests } from './quests.js';
import { createNotify } from './notify.js';
import { createDialogs } from './dialog.js';
import { createWorldMap } from './worldmap.js';
import { createCharPanel } from './charpanel.js';
import { createSettings } from './settings.js';
import { createTouch } from './touch.js';
import { createGamepadUI } from './gamepad.js';
import { enterImmersive } from './pwa.js';
import { createAudio } from '../audio/index.js';
import { createSocial } from './social/index.js';
import { OATH_BY_ID, CLASSES } from '@shared/oaths.js';
import { ABILITY_BY_ID } from '@shared/abilities.js';

const VERSION = '1.0';

export async function init(ctx) {
  // Surface failures to main's recovery screen; never bypass the player's covenant choice.
  return build(ctx);
}

function build(ctx) {
  const root = document.getElementById('ui') || document.body.appendChild(h('div', { id: 'ui' }));
  root.innerHTML = '';
  const touchMode = isCoarse();
  root.classList.toggle('is-touch', touchMode);
  setForcedReducedMotion(prefs.get('reduceMotion'));

  const gs = createState(ctx);
  const listeners = new Map();
  const ui = {
    ctx, gs, root, touchMode,
    on(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
    emit(t, p) { listeners.get(t)?.forEach((fn) => { try { fn(p); } catch (e) { console.warn(e); } }); },
  };

  // ---------- audio
  let audio = null;
  try {
    audio = createAudio(ctx, {
      listener: () => { const p = gs.pos(); return { x: p.x, z: p.z, heading: gs.heading() }; },
      isSelf: (id) => gs.isSelf(id),
      actorPos: (id) => { const a = gs.actor(id); return a?.position ? { x: a.position.x, z: a.position.z } : null; },
      character: () => gs.character,
    });
    audio.setVolumes(prefs.all());
    prefs.subscribe((k) => { if (['master', 'music', 'sfx', 'ambience'].includes(k)) audio.setVolumes(prefs.all()); });
  } catch (err) { console.warn('[ui] audio unavailable', err); }
  ui.audio = audio;
  ui.sfx = (name) => { try { audio?.ui(name); } catch { /* ignore */ } };

  // ---------- layers
  const screens = h('div', { class: 'ae-layer' });
  const hudLayer = h('div', { class: 'ae-layer' });
  const winLayer = h('div', { class: 'ae-layer' });
  root.append(hudLayer, screens, winLayer);

  const loading = createLoading(screens);
  loading.show('Kindling the renderer', 0);
  const notify = createNotify(ui);
  ui.toast = (t, k) => notify.toast(t, k);
  const dialogs = createDialogs(ui);
  ui.dialogs = dialogs;

  // ---------- window manager
  const scrim = h('div', { class: 'ae-scrim', hidden: true });
  scrim.addEventListener('click', () => { if (stack.length && stack[stack.length - 1] !== 'dialog') closeWindow(stack[stack.length - 1]); });
  const stack = [];
  const returnFocus = new Map();
  const windows = {};
  const syncTyping = () => { try { ctx.input?.setTyping?.(stack.length > 0 || !!ui.chat?.focused); } catch { /* ignore */ } };
  ui.openWindow = (name) => {
    const w = windows[name]; if (!w) return;
    if (stack.includes(name)) return;
    if (name !== 'dialog') for (const n of [...stack]) if (n !== 'dialog') closeWindow(n, true);
    returnFocus.set(name, document.activeElement);
    stack.push(name);
    ui.touch?.reset?.();
    w.win.hidden = false; w.win.style.opacity = '1';
    w.win.style.zIndex = String(45 + stack.length * 2); scrim.style.zIndex = String(44 + stack.length * 2);
    scrim.hidden = false;
    syncTyping();
    if (document.pointerLockElement) document.exitPointerLock?.();
    w.onOpen?.();
    if (name !== 'dialog') ui.sfx('open');
    requestAnimationFrame(() => { const f = w.win.querySelector('.ae-x'); if (f && name !== 'dialog') f.focus({ preventScroll: true }); });
  };
  function closeWindow(name, silent = false) {
    const i = stack.indexOf(name); if (i < 0) return;
    stack.splice(i, 1);
    windows[name].win.hidden = true;
    windows[name].onClose?.();
    if (!stack.length) scrim.hidden = true; else scrim.style.zIndex = String(44 + stack.length * 2);
    syncTyping();
    const previous = returnFocus.get(name); returnFocus.delete(name);
    if (!silent && previous?.isConnected) previous.focus?.({ preventScroll: true });
    if (name === 'dialog') dialogs.cancel?.();
    if (!silent && name !== 'dialog') ui.sfx('close');
  }
  ui.closeWindow = closeWindow;
  ui.toggleWindow = (name) => (stack.includes(name) ? closeWindow(name) : ui.openWindow(name));
  ui.anyWindow = () => stack.length > 0;

  // ---------- HUD
  const minimap = createMinimap(ui); ui.minimap = minimap;
  const hud = createHud(ui); ui.hud = hud;
  const floaters = createFloaters(ui);
  const chat = createChat(ui); ui.chat = chat;
  const quests = createQuests(ui);
  if (touchMode) quests.el.classList.add('is-collapsed');
  const touch = touchMode ? createTouch(ui) : null; ui.touch = touch;
  hudLayer.append(floaters.el);
  if (touch) hudLayer.append(touch.el);
  hud.el.append(minimap.el, quests.el, chat.el, ...notify.els);
  hudLayer.append(hud.el);
  if (touch) hudLayer.append(touch.ctrl);
  hudLayer.append(dialogs.death);
  const guide = createFieldGuide(ui);
  hud.el.append(guide.el, guide.prompt);
  hud.showFps(!!prefs.get('showFps'));
  ui.log = (text) => chat.system(text);
  ui.on('hotbar', (view) => touch?.build(view));

  // ability tooltip above hotbar
  const tip = h('div', { class: 'ae-tooltip ae-panel', hidden: true, style: { position: 'absolute', zIndex: 30 } });
  hud.el.append(tip);
  ui.showAbilityTip = (v, el) => {
    const r = el.getBoundingClientRect(); const rr = root.getBoundingClientRect();
    tip.style.setProperty('--rc', v.accent);
    tip.innerHTML = `<div class="n">${esc(v.name)}</div><div class="r">${v.ult ? 'Ultimate' : v.kind === 'basic' ? 'Basic attack' : 'Technique'} · key ${v.key}</div><p>${esc(v.desc)}</p>
      <p class="ae-num" style="font-size:12px">${v.cooldown ? `${v.cooldown}s cooldown` : ''}${v.mana ? ` · ${v.mana} mana` : ''}${v.castTime ? ` · ${v.castTime}s cast` : ' · instant'}</p>`;
    tip.hidden = false;
    const tw = 250; let x = r.left - rr.left + r.width / 2 - tw / 2; x = Math.max(8, Math.min(rr.width - tw - 8, x));
    tip.style.left = `${x}px`; tip.style.top = 'auto'; tip.style.bottom = `${rr.bottom - r.top + 10}px`;
  };
  ui.hideTip = () => { tip.hidden = true; };

  // ---------- windows
  const worldmap = createWorldMap(ui);
  const charpanel = createCharPanel(ui);
  const settings = createSettings(ui);
  windows.map = { win: worldmap.win, onOpen: worldmap.onOpen };
  windows.character = { win: charpanel.win, onOpen: charpanel.onOpen };
  windows.settings = { win: settings.win };
  windows.dialog = { win: dialogs.win };
  winLayer.append(scrim, worldmap.win, charpanel.win, settings.win, dialogs.win);
  try { ui.social = createSocial(ui); } catch (err) { console.warn('[ui] social UI unavailable', err); }

  // ---------- title & creation
  const title = createTitle(screens, { onPlay: () => titlePlay?.(), onSettings: () => ui.openWindow('settings'), onClickSound: () => ui.sfx('click'), version: VERSION });
  const creation = createCharacterScreen(screens, { sfx: ui.sfx });
  let titlePlay = null;
  try { ui.gamepad = createGamepadUI(ui); } catch (err) { console.warn('[ui] gamepad', err); }

  // ---------- fatal
  const fatal = (err) => {
    const box = h('div', { class: 'ae-fatal', role: 'alertdialog' },
      h('div', { class: 'ae-panel' }, h('div', { class: 'ae-titlebar' }, h('h2', null, 'The Weave has frayed')),
        h('pre', null, String(err?.stack || err?.message || err || 'Unknown error')),
        h('div', { style: { padding: '12px 18px 18px', display: 'flex', justifyContent: 'flex-end' } }, h('button', { class: 'ae-btn ae-btn--primary', type: 'button', onclick: () => location.reload() }, 'Reload'))));
    root.append(box);
  };

  // ---------- look sensitivity / invert Y (runs right after input.poll)
  try {
    ctx.addUpdate?.(() => {
      const st = ctx.input?.state; if (!st) return;
      const s = prefs.get('sensitivity') || 1;
      st.lookDX *= s; st.lookDY *= s * (prefs.get('invertY') ? -1 : 1);
    }, -5);
  } catch (err) { console.warn('[ui] look prefs', err); }

  // ---------- per-frame HUD update
  try {
    ctx.addUpdate?.((dt) => {
      if (!gs.inGame) return;
      const now = performance.now();
      try { hud.update(dt, now); } catch (e) { console.warn('[ui] hud', e); }
      try { floaters.update(dt); } catch (e) { console.warn('[ui] floaters', e); }
      minimap.update(now);
    }, 60);
  } catch (err) { console.warn('[ui] addUpdate', err); }

  // ---------- pointer lock (desktop)
  ctx.canvas?.addEventListener('click', () => {
    if (!gs.inGame || touchMode || ui.anyWindow() || dialogs.deathOpen || chat.focused) return;
    try { ctx.input?.requestPointerLock?.(); } catch { /* ignore */ }
  });

  // ---------- keyboard actions (from core/input)
  ctx.bus.on('input:action', (a) => {
    if (!gs.inGame) { if (a === 'menu' && stack.length) closeWindow(stack[stack.length - 1]); return; }
    switch (a) {
      case 'map': ui.toggleWindow('map'); break;
      case 'inventory': ui.toggleWindow('character'); break;
      case 'chat': if (!ui.anyWindow()) chat.focus(); break;
      case 'quest': quests.el.querySelector('button')?.click(); break;
      case 'menu': if (stack.length) closeWindow(stack[stack.length - 1]); else ui.openWindow('settings'); break;
      default: break;
    }
  });
  // While a window is open the game keys are suspended (Tab navigates focus, typing is safe);
  // Escape / M / I / B / J still toggle windows here.
  addEventListener('keydown', (e) => {
    if (!stack.length) return;
    const topWindow = windows[stack[stack.length - 1]]?.win;
    if (e.code === 'Tab' && topWindow) {
      const items = [...topWindow.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!items.length) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || !topWindow.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !topWindow.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      return;
    }
    const t = e.target;
    if (t && t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search')) return;
    const top = stack[stack.length - 1];
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.code === 'Escape') { done(); closeWindow(top); return; }
    if (top === 'dialog' || !gs.inGame) return;
    if (e.code === 'KeyM') { done(); ui.toggleWindow('map'); }
    else if (e.code === 'KeyI' || e.code === 'KeyB') { done(); ui.toggleWindow('character'); }
  }, true);

  // ---------- bus: loading / fatal
  let loadingDone; const loadingReady = new Promise((r) => { loadingDone = r; });
  ctx.bus.on('loading', (p) => {
    if (!loading.visible) return;
    loading.set(p?.p ?? 0, p?.label);
    if ((p?.p ?? 0) >= 1) loadingDone();
  });
  ctx.bus.on('fatal', (err) => { loadingDone(); fatal(err); });

  // ---------- bus: net
  const setNet = (st) => {
    gs.net = { ...gs.net, ...st };
    const offline = gs.net.mode === 'offline';
    let text, cls;
    if (offline) { text = 'Offline realm'; cls = 'is-offline'; }
    else if (gs.net.connected) { const rtt = Math.round(ctx.net?.rtt || 0); text = rtt ? `Online · ${rtt} ms` : 'Online'; cls = ''; }
    else { text = 'Reconnecting'; cls = 'is-down'; }
    minimap.setNet(text, cls); title.setStatus(text, cls);
  };
  setNet({ mode: 'offline', connected: false });
  setInterval(() => { if (gs.net.connected && gs.net.mode !== 'offline') setNet({}); }, 3000);
  ctx.bus.on('net:status', (s) => {
    const was = gs.net.connected;
    setNet(s || {});
    if (!gs.inGame) return;
    if (was && !gs.net.connected && gs.net.mode !== 'offline') { notify.toast('Connection to the realm lost — reconnecting', 'error'); chat.system('Connection lost.'); }
    else if (!was && gs.net.connected && gs.net.mode !== 'offline') notify.toast('Reconnected to the realm', 'good');
  });
  ctx.bus.on('net:welcome', (w) => {
    if (!w) return;
    if (w.id != null) gs.selfId = w.id;
    gs.applyYou(w.you);
    setNet({ mode: ctx.net?.mode || gs.net.mode, connected: true });
  });
  ctx.bus.on('net:you', (p) => {
    gs.applyYou(p?.you ?? p);
    quests.refresh();
    if (!charpanel.win.hidden) charpanel.render();
  });

  const nameOf = (id) => (gs.isSelf(id) ? 'you' : gs.actor(id)?.name || 'something');
  const abName = (id) => ABILITY_BY_ID[id]?.name || (String(id || '').startsWith('basic') ? 'attack' : 'technique');
  const mine = (id) => id == null || gs.selfId == null || gs.isSelf(id);
  ctx.bus.on('net:ev', (p) => {
    const e = p?.e ?? p; if (!e?.type) return;
    try {
      switch (e.type) {
        case 'hit': {
          if (gs.isSelf(e.src)) chat.combat(`Your ${esc(abName(e.ability))} hits ${esc(nameOf(e.dst))} for <span class="dmg">${Math.round(e.amount)}</span>${e.crit ? ' <b>(critical)</b>' : ''}.`);
          else if (gs.isSelf(e.dst)) chat.combat(`${esc(nameOf(e.src))}’s ${esc(abName(e.ability))} hits you for <span class="dmg">${Math.round(e.amount)}</span>.`);
          break;
        }
        case 'heal': if (gs.isSelf(e.dst) || gs.isSelf(e.src)) chat.combat(`${esc(nameOf(e.src))} heal${gs.isSelf(e.src) ? '' : 's'} ${esc(nameOf(e.dst))} for <span class="heal">${Math.round(e.amount)}</span>.`); break;
        case 'status': if (gs.isSelf(e.dst)) hud.addStatus(e.status, e.dur); break;
        case 'death':
          if (gs.isSelf(e.id)) { gs.alive = false; hud.hideBanner(); dialogs.showDeath(gs.actor(e.killer)?.name); chat.combat('You have fallen.'); }
          else if (gs.isSelf(e.killer)) chat.combat(`You defeated ${esc(nameOf(e.id))}.`);
          break;
        case 'xp': if (mine(e.id)) { if (Number.isFinite(e.total)) gs.xp = e.total; if (Number.isFinite(e.next)) gs.next = e.next; chat.combat(`<span class="xp">+${Math.round(e.amount)} experience</span>`); } break;
        case 'level':
          if (mine(e.id)) { gs.level = e.level; const c = CLASSES[gs.character?.cls]; notify.levelUp(e.level, c ? `+${c.hpPerLevel} health · +${c.mpPerLevel} mana` : undefined); chat.system(`You reached level ${e.level}.`); }
          else chat.system(`${nameOf(e.id)} reached level ${e.level}.`);
          break;
        case 'loot': if (mine(e.id)) { notify.showLoot(e.items || []); ui.sfx('loot'); for (const it of e.items || []) chat.add('loot', `Received <b>${esc(it.name)}</b>${(it.qty ?? 1) > 1 ? ` ×${it.qty}` : ''}.`); } break;
        case 'quest': if (mine(e.id)) quests.upsert(e.quest); break;
        case 'chat': chat.chat(e); break;
        case 'system': chat.system(e.text); if (gs.inGame && e.text && e.text.length < 90) notify.toast(e.text, 'info'); break;
        case 'discover':
          if (mine(e.id) && e.shrine && !gs.shrines.has(e.shrine)) { gs.shrines.add(e.shrine); const o = OATH_BY_ID[e.shrine]; notify.toast(`Shrine attuned: ${o?.name || e.shrine}`, 'good'); chat.system(`The ${o?.name || ''} shrine is now attuned for fast travel.`); ui.sfx('questDone'); }
          break;
        case 'teleport': if (gs.isSelf(e.id)) { dialogs.hideDeath(); gs.alive = true; gs.lastPos = { x: e.x, y: e.y, z: e.z }; } break;
        case 'npc': if (mine(e.id)) dialogs.npc(e); break;
        default: break;
      }
    } catch (err) { console.warn('[ui] net:ev', e.type, err); }
  });

  // ---------- bus: combat / actors / player
  ctx.bus.on('combat:target', (p) => { const id = p?.id ?? null; if (id !== gs.target) { gs.target = id; hud.targetChanged(); if (id != null) ui.sfx('target'); } });
  ctx.bus.on('combat:hotbar', () => hud.buildHotbar());
  ctx.bus.on('combat:cooldown', (p) => hud.setCooldown(p || {}));
  ctx.bus.on('combat:cast', (p) => {
    const slot = Number(p?.slot);
    hud.flash(slot);
    const v = hud.view[slot];
    hud.startCast(slot, Number(p?.castTime ?? v?.castTime ?? 0), p?.name || v?.name);
  });
  ctx.bus.on('combat:floater', (f) => floaters.spawn(f));
  ctx.bus.on('actor:despawn', (p) => { const id = p?.id ?? p; if (id != null && id === gs.target) { gs.target = null; hud.targetChanged(); } });
  ctx.bus.on('player:moved', (p) => { if (p && Number.isFinite(p.x)) gs.lastPos = { x: p.x, y: p.y, z: p.z }; });
  ctx.bus.on('player:region', (p) => {
    const o = typeof p?.oath === 'string' ? OATH_BY_ID[p.oath] : (p?.oath?.id ? OATH_BY_ID[p.oath.id] : null);
    if (!o) return;
    ui._regionFromBus = true;
    if (gs.inGame) hud.setRegion(o); else gs.region = o;
  });

  addEventListener('resize', () => { minimap.resize(); worldmap.onResize(); });

  // ---------- public API
  async function runTitleFlow() {
    await Promise.race([loadingReady, new Promise((r) => setTimeout(r, 60000))]);
    await loading.hide();
    audio?.setScene('title');
    const online = ctx.net?.mode === 'online';
    title.setStatus(online ? 'Online realm' : 'Offline realm', online ? '' : 'is-offline');
    title.show();
    await new Promise((r) => { titlePlay = r; });
    titlePlay = null;
    enterImmersive();
    await title.hide();
    const ch = await creation.open();
    await creation.hide();
    return ch;
  }

  const api = {
    async chooseCharacter() {
      const p = ctx.params || new URLSearchParams(location.search);
      let ch;
      const po = p.get('oath'), pc = p.get('cls');
      if (po && OATH_BY_ID[po] && (pc === 'ninja' || pc === 'sorcerer')) {
        ch = { name: (p.get('name') || 'Wayfarer').slice(0, 16), oath: po, cls: pc };
      } else {
        ch = await runTitleFlow();
      }
      gs.setCharacter(ch);
      const o = OATH_BY_ID[ch.oath];
      root.style.setProperty('--accent', o.accent); root.style.setProperty('--accent-rgb', rgbTriplet(o.accent));
      loading.show(`Crossing into ${o.name}`, 0.92);
      return ch;
    },
    enterGame() {
      try {
        gs.inGame = true;
        loading.hide(); title.el.hidden = true; creation.el.hidden = true;
        hud.setPlayer(); hud.show();
        touch?.show();
        audio?.setScene('game');
        const o = gs.region && ui._regionFromBus ? gs.region : gs.regionHere() || gs.oath();
        setTimeout(() => hud.setRegion(o), 600);
        quests.refresh();
        chat.system(`Welcome to Aetherion, ${gs.character?.name}. Press Enter to speak, M for the map, I for your character.`);
        if (gs.net.mode === 'offline') chat.system('You are walking an offline realm — the Weave is simulated locally.');
        setTimeout(() => { minimap.resize(); minimap.prefetch(); }, 50);
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2500));
        idle(() => worldmap.prefetch(), { timeout: 4000 });
      } catch (err) { console.error('[ui] enterGame', err); }
    },
    toast: (text, kind = 'info') => notify.toast(text, kind),
    log: (text) => chat.system(text),
    showDialog: (opts) => dialogs.showDialog(opts),
    // extras (debug / other modules)
    openWindow: ui.openWindow, closeWindow, state: gs, audio,
  };
  window.__aetherionUI = api;
  return api;
}
