// The campaign entry point sits over the live Three.js world.
import { h, anim } from './dom.js';
import './game-shell.css';
import { OATH_BY_ID } from '@shared/oaths.js';
import { pwa } from './pwa.js';

export function createTitle(root, { onPlay, onChangeHero, onOnline, onSettings, onClickSound, version = '' }) {
  const letters = 'AETHERION'.split('').map((c) => h('span', null, c));
  const word = h('div', { class: 'ae-logo__word', 'aria-hidden': 'true' }, letters);
  const sub = h('div', { class: 'ae-logo__sub' }, 'The Fifteen Oaths');
  const logo = h('h1', { class: 'ae-logo', 'aria-label': 'Aetherion: The Fifteen Oaths', style: { margin: 0, fontWeight: 400 } },
    word, h('div', { class: 'ae-logo__rule' }, sub));
  const chapter = h('p', { class: 'ae-title__chapter' }, 'Chapter I · The Broken Ward');
  const synopsis = h('p', { class: 'ae-title__synopsis' }, 'The Archivist is dead. You carry the Weave fragment they died to protect. When your sanctuary’s ward breaks, you must clear the evacuation road and find out who opened the breach.');

  const play = h('button', { class: 'ae-btn ae-btn--primary', type: 'button' }, 'Begin Story');
  const change = h('button', { class: 'ae-btn', type: 'button', hidden: true }, 'Change Hero');
  const online = h('button', { class: 'ae-btn', type: 'button', hidden: true }, 'Play Online');
  const settings = h('button', { class: 'ae-btn', type: 'button' }, 'Settings');
  const install = h('button', { class: 'ae-btn', type: 'button', hidden: true }, 'Install App');
  const save = h('p', { class: 'ae-title__save', hidden: true });
  const menu = h('nav', { class: 'ae-title__menu', 'aria-label': 'Main menu' },
    play, save, h('div', { class: 'ae-title__utilities' }, change, online, settings, install));
  const foot = h('div', { class: 'ae-title__foot' }, h('span', null, `Fifteen realms · one continent${version ? ` · v${version}` : ''}`));
  const iosHint = h('div', { class: 'ae-ios-hint ae-panel', hidden: true },
    'To install, tap the Share button, then ', h('b', null, 'Add to Home Screen'), '.');

  const el = h('section', { class: 'ae-title', hidden: true, 'aria-label': 'Title screen' },
    h('div', { class: 'ae-title__content' }, h('div', { class: 'ae-title__crest' }, logo), chapter, synopsis, menu, iosHint), foot);
  root.append(el);

  const refreshInstall = () => { install.hidden = !pwa.available; };
  pwa.onChange(refreshInstall);

  for (const [button, action] of [[play, onPlay], [change, onChangeHero], [online, onOnline], [settings, onSettings]]) {
    button.addEventListener('click', () => { onClickSound?.(); action?.(); });
  }
  install.addEventListener('click', async () => {
    onClickSound?.();
    if (pwa.canPrompt) { await pwa.prompt(); refreshInstall(); } else if (pwa.isIOS) { iosHint.hidden = !iosHint.hidden; }
  });

  return {
    el,
    show({ hero, resume, offerOnline } = {}) {
      refreshInstall();
      const primaryLabel = resume ? 'Continue Story' : 'Begin Story';
      play.textContent = primaryLabel;
      play.setAttribute('aria-label', primaryLabel);
      change.hidden = !hero;
      online.hidden = !offerOnline;
      save.hidden = !hero;
      save.textContent = hero ? `${hero.name} · ${OATH_BY_ID[hero.oath][hero.cls].title}` : '';
      el.hidden = false;
      el.style.opacity = '1';
      play.focus({ preventScroll: true });
    },
    async hide() {
      await new Promise((resolve) => {
        const animation = anim(el, { opacity: [1, 0], duration: 200, ease: 'inQuad', onComplete: resolve });
        if (!animation) resolve();
        else setTimeout(resolve, 300);
      });
      el.hidden = true;
    },
  };
}
