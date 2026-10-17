// Presentation helpers for hotbar abilities (icons, accent, generated rules text).
import { hotbarFor } from '@shared/abilities.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { rgbTriplet } from './dom.js';

const BASIC_GLYPH = {
  ninja: '<svg class="glyph-svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 82L70 30"/><path d="M70 30L84 16L80 34Z"/><path d="M26 64L36 74M14 86L22 78"/><path d="M30 20C52 22 76 42 82 66" stroke-dasharray="3 7"/></svg>',
  sorcerer: '<svg class="glyph-svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="64" cy="36" r="13"/><circle cx="64" cy="36" r="5" fill="currentColor"/><path d="M52 48L16 84M46 42L22 54M58 54L46 78"/></svg>',
};
export const SLOT_KEYS = ['1', '2', '3', '4', '5', 'R'];

const ELEMENT_VERB = {
  fire: 'searing', frost: 'freezing', storm: 'crackling', water: 'surging', earth: 'grinding', wind: 'howling', nature: 'living',
  poison: 'corrosive', light: 'radiant', cosmic: 'gravitic', shadow: 'umbral', blood: 'sanguine', arcane: 'shimmering', time: 'temporal', tech: 'kinetic',
};

export function describe(a, cls) {
  if (!a) return '';
  const v = ELEMENT_VERB[a.element] || 'focused';
  const r = (n) => (Number.isFinite(n) ? (Math.round(n * 10) / 10) : '?');
  if (a.kind === 'basic') {
    return cls === 'ninja'
      ? `A swift close-quarters strike against your target within ${r(a.range)} m. No mana cost — the rhythm every Ninja returns to.`
      : `A bolt of raw covenant force hurled at a target up to ${r(a.range)} m away. No mana cost.`;
  }
  switch (a.shape) {
    case 'line': return `Unleashes a ${v} line that travels up to ${r(a.range)} m, striking every foe within ${r(a.radius)} m of its path.`;
    case 'zone': return `Calls a ${v} zone of ${r(a.radius)} m radius at a point up to ${r(a.range)} m away, harming all enemies caught inside.`;
    case 'self': return `Wreathes you in a ${v} covenant ward, empowering you and anything within ${r(a.radius)} m.`;
    case 'summon': return `Binds a ${v} servant at a point up to ${r(a.range)} m away to fight at your side.`;
    case 'melee': return `A close strike within ${r(a.range)} m.`;
    default: return `A ${v} technique with ${r(a.range)} m reach.`;
  }
}

export const shapeLabel = (s) => ({ line: 'Line', zone: 'Area', self: 'Self', summon: 'Summon', melee: 'Melee', projectile: 'Projectile' }[s] || s || '—');

/** Hotbar entries decorated for display. */
export function hotbarView(oathId, cls, live = null) {
  let bar = [];
  try { bar = (live && live.length) ? live : hotbarFor(oathId, cls); } catch (e) { console.warn('[ui] hotbarFor', e); }
  const oath = OATH_BY_ID[oathId] || OATH_BY_ID['oath-09'];
  return bar.slice(0, 6).map((a, i) => {
    const accent = a.accent || oath.accent;
    return {
      ...a, index: i, key: SLOT_KEYS[i], accent, accentRgb: rgbTriplet(accent),
      glyphSvg: a.glyph || BASIC_GLYPH[cls] || BASIC_GLYPH.ninja,
      desc: describe(a, cls), ult: i === 5,
    };
  });
}

/** Ability slot element markup (shared look across hotbar/preview/touch). */
export function slotHTML(v, { key = true, mana = true } = {}) {
  return `<span class="glyph">${v.glyphSvg}</span>${key ? `<span class="key">${v.key}</span>` : ''}${mana && v.mana ? `<span class="mana">${v.mana}</span>` : ''}<span class="cd"></span><span class="cdt"></span>`;
}
