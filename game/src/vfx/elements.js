// Element styles: base palettes and the layer vocabulary (strip/surf/decal kinds, particle presets,
// solid materials) each of the 15 Oath elements is built from. Per-ability palettes come from the
// canon registry (palettes.generated.js) so abilities of one element still differ in tone.
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { OATHS } from '@shared/oaths.js';
import { ABILITY_BY_ID } from '@shared/abilities.js';
import { PALETTES } from './palettes.generated.js';
import { hex } from './core.js';

const E = (o) => ({ ...o, core: hex(o.core), glow: hex(o.glow), edge: hex(o.edge), deep: hex(o.deep) });

export const ELEMENTS = {
  water: E({ id: 'water', core: '#eefbff', glow: '#4fd6ff', edge: '#1f8fe0', deep: '#06254a', strip: 'liquid', surf: 'water', decal: 'wash', spark: 'splash', puff: 'foam', mist: 'mist', solid: 'ice', status: 'soaked' }),
  storm: E({ id: 'storm', core: '#ffffff', glow: '#8fc0ff', edge: '#5a3cff', deep: '#0b1840', strip: 'bolt', surf: 'energy', decal: 'cracks', spark: 'spark', puff: 'glow', mist: 'mote', solid: 'crystal', status: 'shocked' }),
  frost: E({ id: 'frost', core: '#f2feff', glow: '#8adaff', edge: '#3a74ae', deep: '#0d3b5e', strip: 'energy', surf: 'energy', decal: 'frost', spark: 'shard', puff: 'mist', mist: 'snow', solid: 'ice', status: 'chilled' }),
  fire: E({ id: 'fire', core: '#fff1c8', glow: '#ff8a1e', edge: '#ff3a0a', deep: '#2a0802', strip: 'flame', surf: 'fire', decal: 'lava', spark: 'ember', puff: 'smoke', mist: 'flame', solid: 'basalt', status: 'burning' }),
  earth: E({ id: 'earth', core: '#ffe9a8', glow: '#d39a5a', edge: '#7c5634', deep: '#241f1b', strip: 'dark', surf: 'smoke', decal: 'cracks', spark: 'rock', puff: 'dust', mist: 'dust', solid: 'rock', status: 'rooted' }),
  wind: E({ id: 'wind', core: '#ffffff', glow: '#c8e6ff', edge: '#7affc4', deep: '#2a3a48', strip: 'energy', surf: 'wind', decal: 'spiral', spark: 'streak', puff: 'mist', mist: 'leaf', solid: 'glass', status: 'slowed' }),
  nature: E({ id: 'nature', core: '#f4ffd0', glow: '#8fe36b', edge: '#3ddc7f', deep: '#0b3a22', strip: 'energy', surf: 'energy', decal: 'pool', spark: 'petal', puff: 'mote', mist: 'leaf', solid: 'wood', status: 'rooted' }),
  poison: E({ id: 'poison', core: '#e6ffb0', glow: '#9dff3a', edge: '#5cff22', deep: '#0e1a06', strip: 'liquid', surf: 'smoke', decal: 'wash', spark: 'bubble', puff: 'smoke', mist: 'drip', solid: 'crystal', status: 'poisoned' }),
  light: E({ id: 'light', core: '#ffffff', glow: '#ffe6a0', edge: '#ffb547', deep: '#3a2a10', strip: 'energy', surf: 'glow', decal: 'glyph', spark: 'mote', puff: 'glow', mist: 'mote', solid: 'crystal', status: 'blessed' }),
  cosmic: E({ id: 'cosmic', core: '#fff2d6', glow: '#b98cff', edge: '#4f9dff', deep: '#0a0620', strip: 'energy', surf: 'energy', decal: 'spiral', spark: 'mote', puff: 'void', mist: 'mote', solid: 'obsidian', status: 'gravity' }),
  shadow: E({ id: 'shadow', core: '#efe4ff', glow: '#a45cff', edge: '#3b2566', deep: '#07040f', strip: 'dark', surf: 'smoke', decal: 'scorch', spark: 'mote', puff: 'void', mist: 'void', solid: 'obsidian', status: 'cursed' }),
  blood: E({ id: 'blood', core: '#ffc4cc', glow: '#ff2e4d', edge: '#7a0712', deep: '#1a0206', strip: 'liquid', surf: 'water', decal: 'wash', spark: 'drip', puff: 'void', mist: 'drip', solid: 'thorn', status: 'bleeding' }),
  arcane: E({ id: 'arcane', core: '#ffffff', glow: '#c46bff', edge: '#3ff0e0', deep: '#1a0830', strip: 'energy', surf: 'energy', decal: 'glyph', spark: 'mote', puff: 'glow', mist: 'mote', solid: 'glass', status: 'hexed' }),
  time: E({ id: 'time', core: '#fff4d6', glow: '#ffd27a', edge: '#7affd9', deep: '#2a1a06', strip: 'energy', surf: 'energy', decal: 'clock', spark: 'mote', puff: 'glow', mist: 'mote', solid: 'metal', status: 'slowed' }),
  tech: E({ id: 'tech', core: '#ffffff', glow: '#6fd8ff', edge: '#155cff', deep: '#06121c', strip: 'energy', surf: 'hex', decal: 'hex', spark: 'spark', puff: 'steam', mist: 'spark', solid: 'steel', status: 'shielded' }),
};

const OATH_EL = Object.fromEntries(OATHS.map((o) => [o.id, o.element]));
/** Element id for an oath id (or pass-through if already an element). */
export function elementOf(oath) { if (!oath) return null; return ELEMENTS[oath] ? oath : OATH_EL[oath] ?? null; }

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const sat = (c) => { const mx = Math.max(c.r, c.g, c.b); const mn = Math.min(c.r, c.g, c.b); return mx < 1e-3 ? 0 : (mx - mn) / mx; };

/** Palette {core, glow, edge, deep, accent} for an ability, blending registry colours with the element base. */
export function paletteFor(abilityId, el, override) {
  const ab = ABILITY_BY_ID[abilityId];
  const reg = (PALETTES[abilityId]?.c ?? []).map(hex);
  const glow = override ?? (ab?.accent ? hex(ab.accent) : el.glow);
  let core = el.core; let deep = el.deep; let edge = el.edge;
  if (reg.length) {
    const byL = [...reg].sort((a, b) => lum(b) - lum(a));
    if (lum(byL[0]) > 0.7) core = Color3.Lerp(byL[0], el.core, 0.35);
    const dk = byL[byL.length - 1]; if (lum(dk) < 0.25) deep = Color3.Lerp(dk, el.deep, 0.4);
    const sats = reg.filter((c) => sat(c) > 0.45 && lum(c) > 0.12 && lum(c) < 0.85 && colorDist(c, glow) > 0.18);
    if (sats.length) edge = Color3.Lerp(sats[0], el.edge, 0.35);
  }
  return { core, glow, edge, deep, accent: glow, list: reg };
}
function colorDist(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b); }
