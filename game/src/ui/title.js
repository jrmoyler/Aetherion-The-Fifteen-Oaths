// Title screen over the live 3D scene: SVG/CSS logotype, tagline, Play / Settings / Install.
import { createTimeline, stagger } from 'animejs';
import { h, anim, prefersReducedMotion } from './dom.js';
import { emblemMark } from './emblems.js';
import { OATHS } from '@shared/oaths.js';
import { pwa } from './pwa.js';
import { ICONS } from './icons.js';

function wheelSVG() {
  const R = 228;
  const marks = OATHS.map((o, i) => {
    const a = (i / 15) * Math.PI * 2 - Math.PI / 2;
    const x = 250 + Math.cos(a) * R; const y = 250 + Math.sin(a) * R;
    return `<g class="wm" transform="translate(${x - 13} ${y - 13}) scale(.26)" stroke-width="5">${emblemMark(o.id)}</g>`;
  }).join('');
  const ticks = Array.from({ length: 120 }, (_, i) => {
    const a = (i / 120) * Math.PI * 2; const r1 = 196; const r2 = i % 8 === 0 ? 206 : 200;
    return `<line x1="${250 + Math.cos(a) * r1}" y1="${250 + Math.sin(a) * r1}" x2="${250 + Math.cos(a) * r2}" y2="${250 + Math.sin(a) * r2}"/>`;
  }).join('');
  // fifteen-point star polygon {15/7} — the covenant lattice
  const pts = Array.from({ length: 15 }, (_, i) => { const a = ((i * 7) / 15) * Math.PI * 2 - Math.PI / 2; return `${250 + Math.cos(a) * 190},${250 + Math.sin(a) * 190}`; }).join(' ');
  return `<svg viewBox="0 0 500 500" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">
    <g class="wheel-rot"><circle cx="250" cy="250" r="246" opacity=".6"/><circle cx="250" cy="250" r="210"/>${ticks}${marks}</g>
    <polygon class="star" points="${pts}" stroke-width=".7" opacity=".55"/>
    <circle cx="250" cy="250" r="150" opacity=".35"/></svg>`;
}

export function createTitle(root, { onPlay, onSettings, onClickSound, version = '' }) {
  const letters = 'AETHERION'.split('').map((c) => h('span', null, c));
  const word = h('div', { class: 'ae-logo__word', 'aria-hidden': 'true' }, letters);
  const ruleL = h('i'); const ruleR = h('i');
  const sub = h('div', { class: 'ae-logo__sub' }, 'The Fifteen Oaths');
  const logo = h('h1', { class: 'ae-logo', 'aria-label': 'Aetherion: The Fifteen Oaths', style: { margin: 0, fontWeight: 400 } },
    word, h('div', { class: 'ae-logo__rule' }, ruleL, h('span', { class: 'ae-diamond' }), sub, h('span', { class: 'ae-diamond' }), ruleR));
  const wheel = h('div', { class: 'ae-title__wheel', html: wheelSVG() });
  const tagline = h('p', { class: 'ae-tagline' }, 'Every force has a covenant. Every covenant has a price.');

  const play = h('button', { class: 'ae-btn ae-btn--primary', type: 'button' }, 'Enter the Weave');
  const settings = h('button', { class: 'ae-btn', type: 'button' }, 'Settings');
  const install = h('button', { class: 'ae-btn ae-btn--ghost', type: 'button', hidden: true, html: `<span style="width:18px;height:18px;display:block">${ICONS.install}</span><span>Install App</span>` });
  const menu = h('nav', { class: 'ae-title__menu', 'aria-label': 'Main menu' }, play, settings, install);
  const status = h('span', { class: 'ae-net' }, h('i'), h('span', null, 'Weave status'));
  const foot = h('div', { class: 'ae-title__foot' }, h('span', null, `Fifteen realms · one continent${version ? ` · v${version}` : ''}`), status);
  const iosHint = h('div', { class: 'ae-ios-hint ae-panel', hidden: true },
    'To install, tap the Share button, then ', h('b', null, 'Add to Home Screen'), '.');

  const el = h('section', { class: 'ae-title', hidden: true, 'aria-label': 'Title screen' },
    h('div', { class: 'ae-title__crest' }, wheel, logo), tagline, menu, foot, iosHint);
  root.append(el);

  const refreshInstall = () => { install.hidden = !pwa.available; };
  pwa.onChange(refreshInstall);

  play.addEventListener('click', () => { onClickSound?.(); onPlay?.(); });
  settings.addEventListener('click', () => { onClickSound?.(); onSettings?.(); });
  install.addEventListener('click', async () => {
    onClickSound?.();
    if (pwa.canPrompt) { await pwa.prompt(); refreshInstall(); } else if (pwa.isIOS) { iosHint.hidden = !iosHint.hidden; }
  });

  return {
    el,
    setStatus(text, cls) { status.className = `ae-net ${cls || ''}`; status.lastChild.textContent = text; },
    show() {
      refreshInstall();
      el.hidden = false; el.style.opacity = '1';
      if (prefersReducedMotion()) return;
      try {
        const tl = createTimeline({ defaults: { ease: 'outExpo' } });
        tl.add(wheel, { opacity: [0, 1], scale: [0.86, 1], duration: 2600 }, 0)
          .add(letters, { opacity: [0, 1], translateY: [26, 0], filter: ['blur(10px)', 'blur(0px)'], duration: 1400, delay: stagger(70, { from: 'center' }) }, 250)
          .add([ruleL, ruleR], { scaleX: [0, 1], duration: 1300 }, 900)
          .add(sub, { opacity: [0, 1], letterSpacing: ['0.9em', '0.42em'], duration: 1600 }, 1000)
          .add(tagline, { opacity: [0, 1], translateY: [8, 0], duration: 1200 }, 1500)
          .add(menu.children, { opacity: [0, 1], translateY: [14, 0], duration: 900, delay: stagger(110) }, 1800)
          .add(foot, { opacity: [0, 1], duration: 1000 }, 2100);
      } catch (err) { console.warn('[ui] title anim', err); }
      setTimeout(() => { try { play.focus({ preventScroll: true }); } catch { /* ignore */ } }, 400);
    },
    async hide() {
      await new Promise((res) => { const a = anim(el, { opacity: [1, 0], duration: 500, ease: 'inQuad', onComplete: res }); if (!a) res(); setTimeout(res, 700); });
      el.hidden = true;
    },
  };
}
