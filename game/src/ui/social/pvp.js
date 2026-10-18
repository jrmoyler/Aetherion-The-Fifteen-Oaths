// PvP banner toggle, added as section 04 of the character panel (Attributes column), plus a small HUD badge
// beside the player portrait while PvP is active (flag or war zone). The server enforces the 10 s toggle
// cooldown, the PvP-combat lock and the sanctuary rule; this only mirrors them.
import { h } from '../dom.js';

const SWORDS = '<svg viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"><path d="M18 18L70 70M82 18L30 70M62 78L78 62M22 62L38 78"/></svg>';

export function createPvp(env) {
  const { ui, gs } = env;
  const label = h('span', null, 'PvP banner lowered');
  const toggle = h('button', { class: 'ae-pvp-toggle', type: 'button', role: 'switch', 'aria-checked': 'false' }, h('span', { class: 'sw' }), label);
  const info = h('p', null, '');
  const stats = h('dl', null);
  const sec = h('div', { class: 'ae-pvpsec' }, h('div', { class: 'ae-section-label', style: { marginBottom: '4px' } }, h('b', null, '04'), 'Banner'), toggle, info, stats);
  const badge = h('button', { class: 'ae-pvp-badge', type: 'button', hidden: true, 'aria-label': 'PvP active — open the character panel', title: 'PvP active', html: SWORDS });
  badge.addEventListener('click', () => ui.toggleWindow('character'));

  toggle.addEventListener('click', () => {
    const s = env.social()?.state; if (!s) return;
    const wait = Math.ceil(((s.pvpCd ?? 0) - (env.ctx.net?.serverTime?.() ?? Date.now())) / 1000);
    if (wait > 0) { ui.toast(`You can change your banner again in ${wait} s.`, 'warn'); return; }
    ui.sfx('confirm');
    env.send({ t: 'pvp', on: !s.pvp });
  });

  function attach() {
    if (sec.isConnected) return true;
    const col = ui.root.querySelector('.ae-char .ae-char__col:last-child');
    if (!col) return false;
    col.append(sec);
    return true;
  }

  function render() {
    const s = env.social()?.state;
    if (!s) return;
    toggle.setAttribute('aria-checked', s.pvp ? 'true' : 'false');
    label.textContent = s.pvp ? 'PvP banner raised' : 'PvP banner lowered';
    const wait = Math.ceil(((s.pvpCd ?? 0) - (env.ctx.net?.serverTime?.() ?? Date.now())) / 1000);
    toggle.disabled = wait > 0;
    const war = s.war ? `You stand in ${s.war.name}: everyone here is flagged. ` : '';
    info.textContent = `${war}${s.pvp ? 'Other flagged players may attack you outside the sanctuaries, and you them.' : 'Raise the banner to fight other flagged players in the wilds.'} Never inside a sanctuary; never your party.${wait > 0 ? ` (ready in ${wait} s)` : ''}`;
    stats.innerHTML = `<dt>Honor</dt><dd>${s.honor ?? 0}</dd><dt>Victories over players</dt><dd>${s.pvpKills ?? 0}</dd><dt>PvP damage</dt><dd>×${s.rules?.pvpDamageMul ?? 0.6}</dd>`;
    badge.hidden = !(s.pvpEff > 0);
    badge.classList.toggle('is-war', s.pvpEff === 2);
    badge.title = s.pvpEff === 2 ? 'Contested border: PvP active' : 'PvP banner raised';
  }

  for (const ev of ['social:pvp', 'social:warzone', 'social:honor', 'social:change']) env.bus.on(ev, () => { attach(); render(); });
  let acc = 0;
  return {
    badge,
    update(dt) { acc += dt; if (acc < 0.5) return; acc = 0; if (attach()) render(); void gs; },
  };
}
