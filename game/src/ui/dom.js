// Small DOM helpers shared by every UI component. No framework: plain elements + anime.js.
import { animate } from 'animejs';

export const reduceMotionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
let forcedReduce = false;
export const prefersReducedMotion = () => forcedReduce || reduceMotionQuery.matches;
export const setForcedReducedMotion = (v) => { forcedReduce = !!v; document.documentElement.classList.toggle('ae-reduce', prefersReducedMotion()); };

export const isCoarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Create an element. attrs: class, style (object|string), on* handlers, dataset via data-*, html. */
export function h(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Parse an HTML string into a single element. */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const pad2 = (n) => String(n).padStart(2, '0');

/** anime.js wrapper that degrades to an instant set when reduced motion is on or anime fails. */
export function anim(targets, params) {
  try {
    if (prefersReducedMotion()) {
      const p = { ...params, duration: 0, delay: 0 };
      return animate(targets, p);
    }
    return animate(targets, params);
  } catch (err) {
    console.warn('[ui] anim failed', err);
    return null;
  }
}

/** Fade an element in (display + opacity). */
export function show(el, { y = 0, duration = 420, display = '' } = {}) {
  if (!el) return;
  el.hidden = false;
  el.style.display = display;
  el.classList.add('is-open');
  anim(el, { opacity: [0, 1], translateY: [y, 0], duration, ease: 'outCubic' });
}

export function hide(el, { y = 0, duration = 260 } = {}) {
  if (!el || el.hidden) return Promise.resolve();
  el.classList.remove('is-open');
  return new Promise((res) => {
    const a = anim(el, { opacity: [1, 0], translateY: [0, y], duration, ease: 'inQuad', onComplete: () => { el.hidden = true; res(); } });
    if (!a || prefersReducedMotion()) { el.hidden = true; res(); }
  });
}

/** Throttle a function to at most once per `ms`. */
export function throttle(fn, ms) {
  let last = 0; let t = null; let pending = null;
  return (...args) => {
    const now = performance.now();
    pending = args;
    if (now - last >= ms) { last = now; fn(...args); pending = null; }
    else if (!t) t = setTimeout(() => { t = null; last = performance.now(); if (pending) fn(...pending); pending = null; }, ms - (now - last));
  };
}

export const fmtNum = (n) => {
  n = Math.round(n || 0);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
};

export const safe = (fn, label = 'ui') => (...a) => { try { return fn(...a); } catch (err) { console.warn(`[${label}]`, err); return undefined; } };

/** Hex '#rrggbb' -> 'r,g,b' for rgba() composition in CSS variables. */
export function rgbTriplet(hex) {
  const n = parseInt(String(hex || '#ffffff').slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16); const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
