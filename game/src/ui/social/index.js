// Social UI root: party frames, invitations, player context menu, trade window, duel / war-zone banners,
// PvP banner toggle (character panel), map overlays and chat channels. Reads ctx.net.social (net/social.js),
// sends {t:'party'|'duel'|'trade'|'pvp'} intents; the server validates everything.
import './social.css';
import { WORLD_HALF } from '@shared/terrain.js';
import { createMenu } from './menu.js';
import { createPartyFrames, longPress } from './party.js';
import { createInvites } from './invites.js';
import { createTrade } from './trade.js';
import { createDuelUi } from './duel.js';
import { createPvp } from './pvp.js';
import { createMapOverlays } from './maps.js';
import { linkChat } from './chatlink.js';
import { h } from '../dom.js';

export function createSocial(ui) {
  const { ctx, gs } = ui;
  const env = {
    ui, ctx, gs, bus: ctx.bus, worldHalf: WORLD_HALF,
    social: () => ctx.net?.social ?? null,
    relation: (id) => { try { return ctx.net?.relation?.(id) ?? null; } catch { return null; } },
    selfId: () => ctx.net?.selfId ?? gs.selfId,
    isSelf: (id) => gs.isSelf(id),
    actorOf: (id) => gs.actor(id),
    send: (m) => { try { return ctx.net?.send?.(m); } catch { return false; } },
    setTarget: (id) => { try { ctx.combat?.setTarget?.(id); } catch { /* ignore */ } },
    whisper: () => {},
  };
  const menu = createMenu(env); env.menu = menu;
  const chat = linkChat(env); env.whisper = (name) => chat.whisper(name);
  const party = createPartyFrames(env);
  const invites = createInvites(env);
  const trade = createTrade(env);
  const duel = createDuelUi(env);
  const pvp = createPvp(env);
  const maps = createMapOverlays(env);

  const hud = ui.hud?.el ?? ui.root;
  hud.append(party.el, invites.el, pvp.badge, ...duel.els);
  ui.root.append(trade.win, menu.el);

  env.bus.on('social:party', (p) => { try { party.render(p); } catch (e) { console.warn('[social] party', e); } });
  env.bus.on('social:change', (c) => { if (c?.what === 'welcome') party.render(env.social()?.party ?? null); });

  // ---------- context menu entry points
  const playerAt = (x, y) => {
    try { const a = ctx.actors?.pick?.(x, y); return a && a.kind === 'player' && !gs.isSelf(a.id) ? a : null; } catch { return null; }
  };
  const canvas = ctx.canvas;
  if (canvas) {
    // right-click without dragging (right-drag orbits the camera)
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 2 || !down || !gs.inGame) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
      if (moved > 6 || ctx.input?.state?.pointerLocked) return;
      const r = canvas.getBoundingClientRect();
      const a = playerAt(e.clientX - r.left, e.clientY - r.top); // same space as scene.pointerX/Y
      if (a) menu.open({ id: a.id, name: a.name }, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // target frame: right-click, long-press, ⋯ button
  const tframe = () => ui.root.querySelector('.ae-unit--target');
  const moreBtn = h('button', { class: 'ae-iconbtn ae-tf-more', type: 'button', hidden: true, 'aria-label': 'Player actions (Shift+F10)', title: 'Actions' }, '⋯');
  const targetPlayer = () => { const a = gs.actor(gs.target); return a && a.kind === 'player' && !gs.isSelf(a.id) ? a : null; };
  const openForTarget = (at) => { const a = targetPlayer(); if (a) menu.open({ id: a.id, name: a.name }, at ?? { anchor: tframe() ?? moreBtn }); };
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); openForTarget({ anchor: moreBtn }); });
  let tfBound = false;
  function bindTargetFrame() {
    const tf = tframe(); if (!tf || tfBound) return;
    tfBound = true;
    tf.append(moreBtn);
    tf.addEventListener('contextmenu', (e) => { if (targetPlayer()) { e.preventDefault(); openForTarget({ x: e.clientX, y: e.clientY }); } });
    longPress(tf, () => openForTarget());
  }
  addEventListener('keydown', (e) => {
    if (!gs.inGame || (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10'))) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.closest?.('.ae-pf'))) return;
    if (targetPlayer()) { e.preventDefault(); e.stopPropagation(); openForTarget(); }
  }, true);

  // ---------- per-frame
  try {
    ctx.addUpdate?.((dt) => {
      if (!gs.inGame) return;
      try { party.update(dt); } catch (e) { console.warn('[social] party', e); }
      try { duel.update(dt); pvp.update(dt); } catch (e) { console.warn('[social] hud', e); }
      maps.update(performance.now());
      bindTargetFrame();
      const show = !!targetPlayer();
      if (moreBtn.hidden === show) moreBtn.hidden = !show;
    }, 61);
  } catch (e) { console.warn('[social] addUpdate', e); }

  return { menu, party, invites, trade, duel, pvp, env };
}
