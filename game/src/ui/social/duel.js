// Duel countdown (3-2-1, Fight!), in-duel strip (opponent, distance to the ring edge, Forfeit) and the
// result banner; plus the contested border (war zone) entry banner and persistent warning strip.
import { h, anim } from '../dom.js';

export function createDuelUi(env) {
  const { ui, ctx, gs } = env;
  const num = h('div', { class: 'n' }, '3');
  const kick = h('div', { class: 'k' }, 'Duel begins');
  const count = h('div', { class: 'ae-duel-count', hidden: true, 'aria-live': 'assertive' }, num, kick);
  const vs = h('span', { class: 'vs' }, '');
  const edge = h('span', { class: 'edge ae-num' }, '');
  const forfeit = h('button', { class: 'ae-btn ae-btn--sm', type: 'button', title: 'Yield the duel (/forfeit)' }, 'Forfeit');
  const strip = h('div', { class: 'ae-duel-strip', hidden: true, role: 'status' }, h('span', null, 'Duel'), vs, edge, forfeit);
  const warName = h('span', null, '');
  const warStrip = h('div', { class: 'ae-war-strip', hidden: true, role: 'status' }, h('i'), h('span', null, 'Contested border ·'), warName, h('i'));
  // big centre banner (shared .ae-banner look)
  const bKick = h('div', { class: 'ae-banner__kick' }, '');
  const bName = h('div', { class: 'ae-banner__name' }, '');
  const bSub = h('div', { class: 'ae-banner__sub' }, '');
  const banner = h('div', { class: 'ae-banner ae-banner--social', hidden: true, role: 'status', 'aria-live': 'polite' }, bKick, bName,
    h('div', { class: 'ae-banner__rule' }, h('i'), h('span', null, '◆'), h('i')), bSub);
  forfeit.addEventListener('click', () => { ui.sfx('click'); env.send({ t: 'duel', op: 'forfeit' }); });

  let bannerTimer = null;
  function showBanner(kickText, name, subText, kind) {
    banner.className = `ae-banner ae-banner--social ae-banner--${kind}`;
    bKick.textContent = kickText; bName.textContent = name; bSub.textContent = subText;
    banner.hidden = false;
    anim(banner, { opacity: [0, 1], duration: 500, ease: 'outCubic' }); // opacity only: .ae-banner centres itself with transform
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { const a = anim(banner, { opacity: [1, 0], duration: 700, onComplete: () => { banner.hidden = true; } }); if (!a) banner.hidden = true; }, 5200);
  }

  let duel = null, countTimer = null;
  function countdown(at) {
    clearInterval(countTimer);
    count.hidden = false;
    let last = null;
    const step = () => {
      const left = Math.ceil((at - (ctx.net?.serverTime?.() ?? Date.now())) / 1000);
      const txt = left > 0 ? String(Math.min(3, left)) : 'Fight!';
      if (txt !== last) {
        last = txt; num.textContent = txt; kick.textContent = left > 0 ? 'Duel begins' : 'Stay within the ring';
        anim(num, { scale: [1.6, 1], opacity: [0, 1], duration: 420, ease: 'outBack' });
        ui.sfx(left > 0 ? 'click' : 'confirm');
      }
      if (left <= -1) { clearInterval(countTimer); count.hidden = true; }
    };
    step();
    countTimer = setInterval(step, 100);
  }

  env.bus.on('social:duel', (e) => {
    if (!e) { duel = null; strip.hidden = true; return; }
    const me = env.selfId();
    const oppName = e.a === me ? e.bn : e.an;
    if (e.state === 'countdown') { duel = e; vs.textContent = `vs ${oppName}`; strip.hidden = false; countdown(e.at); }
    else if (e.state === 'fight') { duel = e; vs.textContent = `vs ${oppName}`; strip.hidden = false; if (count.hidden) countdown(ctx.net?.serverTime?.() ?? Date.now()); }
    else if (e.state === 'end') {
      duel = null; strip.hidden = true; count.hidden = true; clearInterval(countTimer);
      const won = e.winner === me, lost = e.loser === me;
      const why = { defeat: 'brought to one breath', fled: 'left the ring', forfeit: 'yielded', death: 'fell in battle', logout: 'left the realm', timeout: 'the bell rang', cancelled: 'the bout was called off' }[e.reason] ?? '';
      showBanner('Duel', won ? 'Victory' : lost ? 'Defeat' : 'Draw', won ? `${oppName} — ${why}` : lost ? `${why} · ${oppName} wins` : why, 'duel');
      ui.sfx(won ? 'questDone' : 'close');
    }
  });
  env.bus.on('social:warzone', (z) => {
    warStrip.hidden = !z;
    if (z) {
      warName.textContent = z.name;
      showBanner('Contested Border', z.name, 'Everyone here may attack you — and you them', 'war');
      ui.sfx('region');
    } else ui.toast('You leave the contested border.', 'info');
  });

  function update() {
    if (!duel || strip.hidden) return;
    const p = gs.pos();
    const d = duel.r - Math.hypot(p.x - duel.x, p.z - duel.z);
    edge.textContent = d >= 0 ? `ring edge ${Math.round(d)} m` : 'outside the ring!';
    edge.classList.toggle('is-warn', d < 6);
  }

  return { els: [count, strip, warStrip, banner], update };
}
