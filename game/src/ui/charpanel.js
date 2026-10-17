// Character & inventory panel (I): paperdoll equipment slots, bag grid, stats — from net:you.
import { h, esc, fmtNum } from './dom.js';
import { emblemSVG } from './emblems.js';
import { ICONS, itemIcon, rarityOf } from './icons.js';
import { OATH_BY_ID, CLASSES } from '@shared/oaths.js';
import { biomeLabel } from './create.js';

const LEFT = [['head', 'Head'], ['shoulders', 'Shoulders'], ['chest', 'Chest'], ['hands', 'Hands']];
const RIGHT = [['legs', 'Legs'], ['feet', 'Feet'], ['ring', 'Ring'], ['trinket', 'Trinket']];
const WEAP = [['mainhand', 'Main'], ['offhand', 'Off']];
const BAG_SLOTS = 30;

export function createCharPanel(ui) {
  const { gs } = ui;
  const close = h('button', { class: 'ae-x', type: 'button', 'aria-label': 'Close', html: ICONS.close });
  const sub = h('span', { class: 'ae-tb-sub' });
  const colL = h('div', { class: 'colL' }); const colR = h('div', { class: 'colR' }); const weap = h('div', { class: 'weap' });
  const fig = h('div', { class: 'fig' });
  const doll = h('div', { class: 'ae-paperdoll' }, colL, fig, colR, weap);
  const bag = h('div', { class: 'ae-bag', role: 'grid', 'aria-label': 'Bag' });
  const gold = h('div', { class: 'ae-gold' });
  const stats = h('dl', { class: 'ae-statlist' });
  const tip = h('div', { class: 'ae-tooltip ae-panel', hidden: true });
  const win = h('div', { class: 'ae-window ae-char ae-panel', hidden: true, role: 'dialog', 'aria-label': 'Character' },
    h('div', { class: 'ae-titlebar' }, h('span', { class: 'ae-tab-num' }, 'II'), h('h2', null, 'Character'), sub, close),
    h('div', { class: 'ae-char__body' },
      h('div', { class: 'ae-char__col ae-scroll' }, h('div', { class: 'ae-section-label', style: { marginBottom: '10px' } }, h('b', null, '01'), 'Equipment'), doll),
      h('div', { class: 'ae-char__col ae-scroll' }, h('div', { class: 'ae-section-label', style: { marginBottom: '10px' } }, h('b', null, '02'), 'Bag'), bag, gold),
      h('div', { class: 'ae-char__col ae-scroll' }, h('div', { class: 'ae-section-label', style: { marginBottom: '10px' } }, h('b', null, '03'), 'Attributes'), stats)),
    tip);
  close.addEventListener('click', () => { ui.sfx('close'); ui.closeWindow('character'); });

  function slotEl(item, label) {
    const r = item ? rarityOf(item.rarity) : null;
    const el = h('div', { class: `ae-eq${item ? ' has-item' : ''}`, tabindex: item ? '0' : '-1', style: r ? `--rc:${r.color}` : '', 'aria-label': item ? item.name : `${label} (empty)`,
      html: item ? itemIcon(item.name, item.type || label) : '' });
    el.append(h('span', { class: 'lbl' }, label));
    if (item && (item.qty ?? 1) > 1) el.append(h('span', { class: 'qty ae-num' }, item.qty));
    if (item) {
      const showT = () => {
        tip.style.setProperty('--rc', r.color);
        const st = item.stats ? Object.entries(item.stats).map(([k, v]) => `+${v} ${esc(k)}`).join(' · ') : '';
        tip.innerHTML = `<div class="n">${esc(item.name)}</div><div class="r">${r.label}${item.slot ? ` · ${esc(item.slot)}` : ''}${item.level ? ` · ilvl ${item.level}` : ''}</div>${st ? `<p>${st}</p>` : ''}${item.text ? `<p><i>${esc(item.text)}</i></p>` : ''}`;
        const wr = win.getBoundingClientRect(); const er = el.getBoundingClientRect();
        tip.hidden = false;
        let x = er.right - wr.left + 8; if (x + 260 > wr.width) x = er.left - wr.left - 258;
        tip.style.left = `${x}px`; tip.style.top = `${Math.max(8, er.top - wr.top)}px`;
      };
      el.addEventListener('mouseenter', showT); el.addEventListener('focus', showT);
      el.addEventListener('mouseleave', () => { tip.hidden = true; }); el.addEventListener('blur', () => { tip.hidden = true; });
    }
    return el;
  }

  let sig = '';
  function render() {
    const you = gs.you || {};
    const c = gs.character || {};
    const o = OATH_BY_ID[c.oath] || OATH_BY_ID['oath-09'];
    const eq = you.equipment || you.equip || you.gear || {};
    const inv = you.inventory || you.bag || you.items || [];
    sub.textContent = `${c.name || ''} · Level ${gs.level}`;
    renderStats(you, c, o);
    const nsig = JSON.stringify([eq, inv, you.gold ?? you.coins ?? you.marks, c.oath, c.cls]);
    if (nsig === sig) return;
    sig = nsig;
    tip.hidden = true;
    colL.innerHTML = ''; colR.innerHTML = ''; weap.innerHTML = '';
    LEFT.forEach(([k, l]) => colL.append(slotEl(eq[k], l)));
    RIGHT.forEach(([k, l]) => colR.append(slotEl(eq[k], l)));
    WEAP.forEach(([k, l]) => weap.append(slotEl(eq[k], l)));
    fig.innerHTML = `${emblemSVG(o.id, { ring: true })}<div class="t">${esc(o[c.cls]?.title || '')}</div><div class="s">${esc(o.name)}</div><div class="s" style="margin-top:6px;text-transform:none;letter-spacing:.02em;font-size:12px;font-style:italic;padding:0 8px;text-align:center">${esc(o[c.cls]?.weapon || '')}</div>`;
    bag.innerHTML = '';
    const items = Array.isArray(inv) ? inv : Object.values(inv);
    for (let i = 0; i < BAG_SLOTS; i++) bag.append(slotEl(items[i] || null, ''));
    gold.innerHTML = `<span>Covenant marks</span><span class="ae-num">${fmtNum(you.gold ?? you.coins ?? you.marks ?? 0)}</span>`;
    win.style.setProperty('--accent', o.accent);
  }
  function renderStats(you, c, o) {
    const base = CLASSES[c.cls] || CLASSES.ninja;
    const s = you.stats || {};
    const rows = [
      ['Discipline', base.label], ['Element', o.elementLabel], ['Realm', biomeLabel(o.biome)], ['Level', gs.level],
      ['Health', `${fmtNum(gs.hp)} / ${fmtNum(gs.mhp)}`], ['Mana', `${fmtNum(gs.mp)} / ${fmtNum(gs.mmp)}`],
      ['Power', s.power ?? s.atk ?? base.basicDamage + gs.level * 2], ['Ward', s.ward ?? s.armor ?? s.def ?? Math.round(gs.level * 3.5)],
      ['Critical', `${s.crit ?? 5}%`], ['Haste', `${s.haste ?? 0}%`], ['Move speed', `${(s.speed ?? base.moveSpeed).toFixed ? (s.speed ?? base.moveSpeed).toFixed(1) : s.speed} m/s`],
      ['Experience', `${fmtNum(gs.xp)} / ${fmtNum(gs.next)}`], ['Shrines attuned', `${gs.shrines.size} / 15`],
    ];
    stats.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  }

  return { win, render, onOpen: () => { sig = ''; render(); } };
}
