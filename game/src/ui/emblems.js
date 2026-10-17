// Code-drawn emblems for the fifteen Oaths, following `symbol_strategy` in
// AETHERION_CANON/09_ART_DIRECTION/FIFTEEN_OATH_ART_GUIDE.json (proposed_extensions).
// Every mark uses currentColor and reads in monochrome at 16 px.
import { OATH_BY_ID } from '@shared/oaths.js';

const S = (w) => `stroke-width="${w}"`;

/** Inner mark paths in a 100x100 box. */
const MARKS = {
  // Open square kiln mouth, three short top vents, central ember lozenge; outer mass heavier.
  'oath-01': `<path d="M22 86V30H78V86" ${S(10)}/><path d="M12 86H32M68 86H88" ${S(7)}/>
    <path d="M36 9V20M50 7V20M64 9V20" ${S(6)}/><path d="M50 42L60 57L50 72L40 57Z" fill="currentColor" stroke="none"/>`,
  // Closed book inside a six-sided ice frame; single vertical spine divides two flat page blocks.
  'oath-02': `<path d="M50 6L88 28V72L50 94L12 72V28Z" ${S(6)}/>
    <path d="M29 33H46V69H29Z M54 33H71V69H54Z" fill="currentColor" stroke="none"/><path d="M50 28V74" ${S(4)}/>`,
  // Three-node branching fork with one open gap; solid nodes joined by narrow angular conductors.
  'oath-03': `<path d="M50 74V60L36 48L40 36L28 27" ${S(4.5)}/><path d="M50 60L62 50L60 42L66 37" ${S(4.5)}/>
    <circle cx="50" cy="82" r="8" fill="currentColor" stroke="none"/><circle cx="23" cy="21" r="8" fill="currentColor" stroke="none"/>
    <circle cx="78" cy="21" r="8" fill="currentColor" stroke="none"/>`,
  // One curling open crest over two offset horizontal water lines.
  'oath-04': `<path d="M12 60C18 34 46 16 70 26C86 33 88 52 76 58C66 63 56 56 60 46C62 41 67 40 70 42" ${S(7)}/>
    <path d="M8 72H66M34 85H92" ${S(6)}/>`,
  // Three stepped stone strata supporting one upright faceted crystal; broad base dominates.
  'oath-05': `<path d="M8 80H92V92H8Z M20 68H80V78H20Z M32 57H68V66H32Z" fill="currentColor" stroke="none"/>
    <path d="M50 6L61 20L58 52H42L39 20Z" ${S(4.5)}/><path d="M50 6V52M39 20L50 28L61 20" ${S(3)}/>`,
  // Two unequal reed pipes joined by a shallow U resonator; one outward sound arc on one side.
  'oath-06': `<path d="M30 12H42V64H30Z M54 28H66V64H54Z" ${S(5)}/><path d="M26 62C26 86 70 86 70 62" ${S(6)}/>
    <path d="M78 30C90 40 90 58 78 68" ${S(5)}/>`,
  // Split seed, one branching shoot above, two short roots below; organic asymmetry.
  'oath-07': `<path d="M47 50C34 52 30 64 34 72C38 78 46 78 47 74Z" fill="currentColor" stroke="none"/>
    <path d="M53 50C66 50 72 62 68 71C64 78 55 78 53 73Z" fill="currentColor" stroke="none"/>
    <path d="M50 48V20M50 34L66 22" ${S(4.5)}/><path d="M66 22C70 12 82 12 84 14C80 22 72 26 66 22Z" fill="currentColor" stroke="none"/>
    <path d="M44 78L38 92M56 77L64 88" ${S(4.5)}/>`,
  // Sealed tapered vial, diagonal stopper, one contained droplet.
  'oath-08': `<path d="M41 34V42L30 82C29 87 32 90 37 90H63C68 90 71 87 70 82L59 42V34" ${S(5.5)}/>
    <path d="M33 30L60 16L65 26L38 40Z" fill="currentColor" stroke="none"/>
    <path d="M50 55C43 64 43 74 50 74C57 74 57 64 50 55Z" fill="currentColor" stroke="none"/>`,
  // Six-petal lotus surrounding a solid sunrise wedge above a short horizon.
  'oath-09': (() => {
    const petals = [-72, -43, -14, 14, 43, 72].map((a) =>
      `<path transform="rotate(${a} 50 76)" d="M50 76C40 62 42 40 50 26C58 40 60 62 50 76Z" ${S(4)}/>`).join('');
    return `${petals}<path d="M36 76A14 14 0 0 1 64 76Z" fill="currentColor" stroke="none"/><path d="M14 80H86" ${S(6)}/>`;
  })(),
  // Offset closed ellipse around a dense central square mass, one suspended counterweight.
  'oath-10': `<ellipse cx="46" cy="44" rx="38" ry="19" transform="rotate(-16 46 44)" ${S(5)}/>
    <path d="M38 34H58V54H38Z" fill="currentColor" stroke="none"/><path d="M76 52V80" ${S(3.5)}/>
    <circle cx="76" cy="86" r="7" fill="currentColor" stroke="none"/>`,
  // Doorway outline interrupted at one upper corner, displaced threshold bar, empty centre.
  'oath-11': `<path d="M26 82V16H60" ${S(8)}/><path d="M74 30V82" ${S(8)}/><path d="M40 92H90" ${S(8)}/>`,
  // Two interlocked open oath loops holding one central drop-shaped seal.
  'oath-12': `<path d="M44 22A22 22 0 1 0 58 62" ${S(6)}/><path d="M56 22A22 22 0 1 1 42 62" ${S(6)}/>
    <path d="M50 44C42 56 42 70 50 70C58 70 58 56 50 44Z" fill="currentColor" stroke="none"/>`,
  // Three nested unequal folded triangles with one mirrored split plane.
  'oath-13': `<path d="M50 8L93 86H7Z" ${S(4.5)}/><path d="M47 30L76 80H20Z" ${S(4)}/>
    <path d="M52 50L66 76H38Z" fill="currentColor" stroke="none"/><path d="M50 2V96" ${S(2.5)} stroke-dasharray="5 4"/>`,
  // Partial escapement wheel with three unequal teeth and a long downward pendulum.
  'oath-14': `<path d="M30 46A22 22 0 1 1 66 52" ${S(5)}/>
    <path d="M32 26L24 18M50 14L50 3M70 28L80 21" ${S(6)}/><path d="M48 36V84" ${S(4)}/>
    <circle cx="48" cy="36" r="5" fill="currentColor" stroke="none"/><path d="M38 84H58L48 96Z" fill="currentColor" stroke="none"/>`,
  // Square actuator frame, opposed piston bars meeting a central hexagonal force plate.
  'oath-15': `<path d="M12 12H88V88H12Z" ${S(6)}/><path d="M15 50H33M67 50H85" ${S(8)}/>
    <path d="M33 38V62M67 38V62" ${S(5)}/><path d="M50 34L63.9 42V58L50 66L36.1 58V42Z" fill="currentColor" stroke="none"/>`,
};

/** Return the emblem SVG markup for an oath. opts: {ring, cls, title, strokeScale} */
export function emblemSVG(oathId, opts = {}) {
  const mark = MARKS[oathId] || MARKS['oath-09'];
  const name = OATH_BY_ID[oathId]?.name || 'Oath';
  const cls = opts.cls ? ` class="${opts.cls}"` : ' class="emblem"';
  const title = opts.title === false ? '' : `<title>${name}</title>`;
  if (opts.ring) {
    return `<svg${cls} viewBox="0 0 100 100" role="img" aria-label="${name} emblem" fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter">${title}
      <circle cx="50" cy="50" r="47" stroke-width="1.6" opacity=".7"/><circle cx="50" cy="50" r="42.5" stroke-width="0.8" opacity=".45"/>
      <g transform="translate(50 50) scale(.58) translate(-50 -50)">${mark}</g></svg>`;
  }
  return `<svg${cls} viewBox="0 0 100 100" role="img" aria-label="${name} emblem" fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter">${title}${mark}</svg>`;
}

/** Raw mark for embedding inside another SVG (no wrapper). */
export const emblemMark = (oathId) => MARKS[oathId] || MARKS['oath-09'];

/** Data URL image for canvas drawing (world map / minimap). */
const imgCache = new Map();
export function emblemImage(oathId, color = '#e9e1cf') {
  const key = oathId + color;
  if (imgCache.has(key)) return imgCache.get(key);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="96" height="96" fill="none" stroke="${color}" color="${color}" stroke-linecap="square">${emblemMark(oathId).replaceAll('currentColor', color)}</svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  imgCache.set(key, img);
  return img;
}
