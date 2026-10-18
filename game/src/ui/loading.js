// Loading screen driven by the `loading` bus event ({p, label}).
import { h, anim, clamp } from './dom.js';
import { QUOTES } from './lore.js';
import { emblemSVG } from './emblems.js';
import { OATHS } from '@shared/oaths.js';

export function createLoading(root) {
  const fill = h('div', { class: 'ae-progress__fill' });
  const label = h('span', null, 'Kindling');
  const pct = h('span', { class: 'ae-num' }, '0%');
  const qText = h('span');
  const qCite = h('cite');
  const quote = h('blockquote', { class: 'ae-quote' }, qText, qCite);
  const core = h('div', { class: 'core', html: emblemSVG('oath-09') });
  const el = h('div', { class: 'ae-loading', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'ae-loading__inner' },
      h('div', { class: 'ae-loading__ring', html: '' }, core),
      h('div', { class: 'ae-loading__word' }, 'Aetherion'),
      h('div', { class: 'ae-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill),
      h('div', { class: 'ae-loading__meta' }, label, pct),
      quote));
  root.append(el);

  let qi = Math.floor(Math.random() * QUOTES.length);
  let timer = null;
  let coreIdx = 8;
  const nextQuote = () => {
    const [t, c] = QUOTES[qi % QUOTES.length]; qi++;
    anim(quote, { opacity: [0, 1], translateY: [6, 0], duration: 900, ease: 'outCubic' });
    qText.textContent = `“${t}”`; qCite.textContent = c;
    coreIdx = (coreIdx + 1) % 15;
    core.innerHTML = emblemSVG(OATHS[coreIdx].id);
    anim(core, { opacity: [0, 1], scale: [0.9, 1], duration: 700, ease: 'outCubic' });
  };
  const startQuotes = () => { if (!timer) { nextQuote(); timer = setInterval(nextQuote, 6500); } };
  startQuotes();

  let value = 0;
  return {
    el,
    get visible() { return !el.hidden; },
    set(p, text) {
      value = clamp(Number(p) || 0, 0, 1);
      fill.style.transform = `scaleX(${value})`;
      el.querySelector('.ae-progress').setAttribute('aria-valuenow', Math.round(value * 100));
      pct.textContent = `${Math.round(value * 100)}%`;
      if (text) label.textContent = text;
    },
    show(text, p = 0) {
      el.hidden = false; el.style.opacity = '1';
      this.set(p, text); startQuotes();
    },
    async hide() {
      if (el.hidden) return;
      await new Promise((res) => {
        const a = anim(el, { opacity: [1, 0], duration: 700, ease: 'inOutQuad', onComplete: res });
        if (!a) res();
        setTimeout(res, 900);
      });
      el.hidden = true; clearInterval(timer); timer = null;
    },
  };
}
