// Authored reference art, bundled by Vite; CSS crops preserve the source pixels.
export function oathArt(id) {
  const n = Math.max(1, Math.min(15, Number(String(id).split('-')[1]) || 9));
  return `${import.meta.env.BASE_URL}ui/oath-${String(n).padStart(2, '0')}.webp`;
}
export function artHTML(id, kind = 'portrait') {
  return `<span class="ae-art ae-art--${kind}" role="img" aria-label="${kind === 'sorcerer' ? 'Sorcerer' : 'Oath'} reference artwork" style="background-image:url('${oathArt(id)}')"></span>`;
}
