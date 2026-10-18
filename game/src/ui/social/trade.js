// Two-sided trade window: your offer (up to 6 items + gold) and theirs, your bag below. Both sides must
// lock, then both confirm; any change unlocks both (server rule, mirrored here). Non-modal so the world
// stays visible; mouse, touch (tap) and keyboard (Tab / Enter, Escape = cancel) usable.
import { h, esc, fmtNum } from '../dom.js';
import { ICONS, itemIcon, rarityOf } from '../icons.js';

const MAX = 6;

export function createTrade(env) {
  const { ui, ctx, gs } = env;
  const sub = h('span', { class: 'ae-tb-sub' }, '');
  const close = h('button', { class: 'ae-x', type: 'button', 'aria-label': 'Cancel trade', html: ICONS.close });
  const mySlots = h('div', { class: 'ae-trade__slots', role: 'list', 'aria-label': 'Your offer' });
  const theirSlots = h('div', { class: 'ae-trade__slots', role: 'list', 'aria-label': 'Their offer' });
  const myState = h('span', { class: 'st' }, 'Open'), theirState = h('span', { class: 'st' }, 'Open');
  const theirName = h('span', null, 'Their offer');
  const goldIn = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: '0', 'aria-label': 'Gold to offer' });
  const myGoldHave = h('span', { class: 'v' }, '');
  const theirGold = h('span', { class: 'v' }, '0');
  const mySeal = h('div', { class: 'ae-trade__seal', hidden: true }, 'Locked');
  const theirSeal = h('div', { class: 'ae-trade__seal', hidden: true }, 'Locked');
  const mine = h('section', { class: 'ae-trade__side' }, h('h3', null, h('b', null, '01'), 'Your offer', myState), mySlots,
    h('label', { class: 'ae-trade__gold' }, 'Gold', goldIn, myGoldHave), mySeal);
  const theirs = h('section', { class: 'ae-trade__side' }, h('h3', null, h('b', null, '02'), theirName, theirState), theirSlots,
    h('div', { class: 'ae-trade__gold' }, 'Gold', theirGold), theirSeal);
  const bag = h('div', { class: 'ae-trade__baglist', role: 'list', 'aria-label': 'Your bag — select items to offer' });
  const note = h('div', { class: 'note' }, 'Select items from your bag. Both sides lock, then both confirm. Any change unlocks both.');
  const lockBtn = h('button', { class: 'ae-btn', type: 'button' }, 'Lock offer');
  const confirmBtn = h('button', { class: 'ae-btn ae-btn--primary', type: 'button', disabled: true }, 'Confirm trade');
  const cancelBtn = h('button', { class: 'ae-btn ae-btn--ghost', type: 'button' }, 'Cancel');
  const tip = h('div', { class: 'ae-tooltip ae-panel ae-trade__tip', hidden: true });
  const win = h('div', { class: 'ae-trade ae-panel', hidden: true, role: 'dialog', 'aria-label': 'Trade' },
    h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, '⇄'), h('h2', null, 'Trade'), sub, close),
    h('div', { class: 'ae-trade__body ae-scroll' }, mine, theirs, h('div', { class: 'ae-trade__bag' }, h('div', { class: 'lbl' }, 'Your bag'), bag)),
    h('div', { class: 'ae-trade__foot' }, note, cancelBtn, lockBtn, confirmBtn), tip);

  let tr = null; // latest server trade event
  const send = (m) => env.send({ t: 'trade', ...m });
  const offerIds = () => (tr?.you?.items ?? []).map((i) => i.id);

  function slot(item, onClick, label) {
    const r = item ? rarityOf(item.rarity) : null;
    const b = h(onClick ? 'button' : 'div', { class: `ae-tslot${item ? ' has-item' : ''}`, type: onClick ? 'button' : null, role: 'listitem', style: r ? `--rc:${r.color}` : '', 'aria-label': item ? `${item.name}${(item.qty ?? 1) > 1 ? ` ×${item.qty}` : ''}${label ? ` — ${label}` : ''}` : 'Empty', html: item ? itemIcon(item.name, item.slot || item.kind) : '' });
    if (item && (item.qty ?? 1) > 1) b.append(h('span', { class: 'q ae-num' }, String(item.qty)));
    if (item) {
      const show = () => {
        tip.style.setProperty('--rc', r.color);
        const st = item.stats ? Object.entries(item.stats).map(([k, v]) => `+${v} ${esc(k)}`).join(' · ') : '';
        tip.innerHTML = `<div class="n">${esc(item.name)}</div><div class="r">${r.label}${item.slot ? ` · ${esc(item.slot)}` : ''}${item.lvl ? ` · ilvl ${item.lvl}` : ''}</div>${st ? `<p>${st}</p>` : ''}${label ? `<p><i>${esc(label)}</i></p>` : ''}`;
        const wr = win.getBoundingClientRect(), er = b.getBoundingClientRect();
        tip.hidden = false;
        let x = er.right - wr.left + 8; if (x + 250 > wr.width) x = er.left - wr.left - 248;
        tip.style.left = `${Math.max(4, x)}px`; tip.style.top = `${Math.max(4, er.top - wr.top - 10)}px`;
      };
      b.addEventListener('mouseenter', show); b.addEventListener('focus', show);
      b.addEventListener('mouseleave', () => { tip.hidden = true; }); b.addEventListener('blur', () => { tip.hidden = true; });
    }
    if (onClick) b.addEventListener('click', () => { ui.sfx('click'); tip.hidden = true; onClick(); });
    return b;
  }

  function setOffer(ids, gold) {
    send({ op: 'offer', items: ids.slice(0, MAX), gold: Math.max(0, Math.floor(Number(gold) || 0)) });
  }
  function toggleItem(id) {
    const ids = offerIds();
    const i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1);
    else { if (ids.length >= MAX) { ui.toast(`At most ${MAX} items per trade.`, 'warn'); return; } ids.push(id); }
    setOffer(ids, tr?.you?.gold ?? 0);
  }

  function render() {
    if (!tr) return;
    sub.textContent = `with ${tr.name}`;
    theirName.textContent = `${tr.name}'s offer`;
    const you = tr.you ?? {}, them = tr.them ?? {};
    mySlots.innerHTML = ''; theirSlots.innerHTML = '';
    for (let i = 0; i < MAX; i++) {
      const it = you.items?.[i];
      mySlots.append(slot(it ?? null, it ? () => toggleItem(it.id) : null, it ? 'Select to withdraw' : ''));
      theirSlots.append(slot(them.items?.[i] ?? null, null));
    }
    if (document.activeElement !== goldIn) goldIn.value = String(you.gold ?? 0);
    myGoldHave.textContent = `of ${fmtNum(gs.you?.gold ?? 0)}`;
    theirGold.textContent = fmtNum(them.gold ?? 0);
    const sideState = (o, side, seal, label) => {
      side.classList.toggle('is-locked', !!o.locked); side.classList.toggle('is-confirmed', !!o.confirmed);
      label.textContent = o.confirmed ? 'Confirmed' : o.locked ? 'Locked' : 'Open';
      seal.hidden = !o.locked; seal.textContent = o.confirmed ? 'Confirmed' : 'Locked';
    };
    sideState(you, mine, mySeal, myState); sideState(them, theirs, theirSeal, theirState);
    lockBtn.textContent = you.locked ? 'Unlock' : 'Lock offer';
    goldIn.disabled = !!you.locked;
    confirmBtn.disabled = !(you.locked && them.locked) || !!you.confirmed;
    confirmBtn.textContent = you.confirmed ? 'Waiting…' : 'Confirm trade';
    note.textContent = you.confirmed ? `Waiting for ${tr.name} to confirm.` : you.locked && them.locked ? 'Both offers are locked. Confirm to exchange.' : you.locked ? `Waiting for ${tr.name} to lock.` : 'Select items from your bag. Both sides lock, then both confirm. Any change unlocks both.';
    renderBag();
  }

  function renderBag() {
    const offered = new Set(offerIds());
    bag.innerHTML = '';
    const inv = Array.isArray(gs.you?.inventory) ? gs.you.inventory : [];
    if (!inv.length) bag.append(h('div', { style: { gridColumn: '1 / -1', fontStyle: 'italic', color: 'var(--text-2)', fontSize: '13px' } }, 'Your bag is empty.'));
    for (const it of inv) {
      const s = slot(it, tr?.you?.locked ? null : () => toggleItem(it.id), offered.has(it.id) ? 'Offered — select to withdraw' : 'Select to offer');
      if (offered.has(it.id)) s.classList.add('is-offered');
      bag.append(s);
    }
  }

  function open() {
    if (!win.hidden) return;
    win.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
    ui.sfx('open');
    requestAnimationFrame(() => (bag.querySelector('button') || lockBtn).focus({ preventScroll: true }));
  }
  function hide() { if (win.hidden) return; win.hidden = true; tip.hidden = true; if (document.activeElement && win.contains(document.activeElement)) document.activeElement.blur(); try { ctx.input?.setTyping?.(ui.anyWindow() || !!ui.chat?.focused); } catch { /* ignore */ } }

  lockBtn.addEventListener('click', () => { ui.sfx('click'); send({ op: tr?.you?.locked ? 'unlock' : 'lock' }); });
  confirmBtn.addEventListener('click', () => { ui.sfx('confirm'); send({ op: 'confirm' }); });
  const cancel = () => { ui.sfx('close'); send({ op: 'cancel' }); hide(); };
  cancelBtn.addEventListener('click', cancel); close.addEventListener('click', cancel);
  let goldTimer = null;
  const pushGold = () => { clearTimeout(goldTimer); if (!tr) return; const g = Math.max(0, Math.min(gs.you?.gold ?? 0, Math.floor(Number(goldIn.value) || 0))); goldIn.value = String(g); if (g !== (tr.you?.gold ?? 0)) setOffer(offerIds(), g); };
  goldIn.addEventListener('input', () => { clearTimeout(goldTimer); goldTimer = setTimeout(pushGold, 600); });
  goldIn.addEventListener('change', pushGold);
  goldIn.addEventListener('focus', () => { try { ctx.input?.setTyping?.(true); } catch { /* ignore */ } });
  goldIn.addEventListener('blur', () => { pushGold(); try { ctx.input?.setTyping?.(ui.anyWindow() || !!ui.chat?.focused); } catch { /* ignore */ } });
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if (e.key === 'Enter' && e.target === goldIn) { e.preventDefault(); goldIn.blur(); }
    e.stopPropagation(); // keys typed in the window never reach the game
  });
  addEventListener('keydown', (e) => { if (!win.hidden && e.key === 'Escape' && !ui.anyWindow()) { e.preventDefault(); e.stopPropagation(); cancel(); } }, true);

  env.bus.on('social:trade', (e) => {
    if (!e) { tr = null; hide(); return; }
    if (e.state === 'open' || e.state === 'update') { tr = e; open(); render(); return; }
    if (e.state === 'done') {
      const got = (e.got ?? []).map((i) => i.name).join(', ');
      ui.toast(`Trade complete${got ? ` — received ${got}` : ''}${e.goldGot ? ` +${e.goldGot} gold` : ''}`, 'good');
      ui.sfx('loot');
    } else if (e.state === 'cancelled') ui.toast(e.reason === 'invalid' ? 'Trade failed — an offer changed. Nothing was exchanged.' : 'Trade cancelled.', 'warn');
    tr = null; hide();
  });
  env.bus.on('net:you', () => { if (tr && !win.hidden) { myGoldHave.textContent = `of ${fmtNum(gs.you?.gold ?? 0)}`; renderBag(); } });

  return { win, get open() { return !win.hidden; }, render };
}
