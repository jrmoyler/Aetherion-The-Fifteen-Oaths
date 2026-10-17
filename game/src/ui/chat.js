// Chat box with channel tabs (All / Say / World / Oath / Combat). Enter focuses; input uses
// ctx.input.setTyping so movement keys don't leak. Sends {t:'chat', text, channel}.
import { h, esc } from './dom.js';

const CHANNELS = ['say', 'world', 'oath'];
const CH_LABEL = { say: 'Say', world: 'World', oath: 'Oath' };
const TABS = [['all', 'All'], ['say', 'Say'], ['world', 'World'], ['oath', 'Oath'], ['combat', 'Combat']];
const MAX_LINES = 160;

export function createChat(ui) {
  const { ctx } = ui;
  const log = h('div', { class: 'ae-chat__log ae-scroll', role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat' });
  const input = h('input', { type: 'text', maxlength: '240', placeholder: 'Press Enter to speak', 'aria-label': 'Chat message', autocomplete: 'off', enterkeyhint: 'send' });
  let channel = 'say';
  let tab = 'all';
  const chanBtn = h('button', { class: 'ae-chat__chan', type: 'button', title: 'Change channel (/s /w /o)' }, CH_LABEL[channel]);
  const tabEls = TABS.map(([id, label]) => {
    const b = h('button', { class: 'ae-chat__tab', type: 'button', role: 'tab', 'aria-selected': id === tab ? 'true' : 'false', 'data-tab': id }, label, h('span', { class: 'dot' }));
    b.addEventListener('click', () => setTab(id));
    return b;
  });
  const el = h('div', { class: 'ae-chat ae-int' }, h('div', { class: 'ae-chat__tabs', role: 'tablist' }, tabEls), log, h('div', { class: 'ae-chat__input' }, chanBtn, input));
  const lines = [];

  function setTab(id) {
    tab = id;
    tabEls.forEach((b) => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); if (on) b.classList.remove('has-new'); });
    for (const l of lines) l.el.hidden = !visibleIn(l.cat, tab);
    log.scrollTop = log.scrollHeight;
  }
  const visibleIn = (cat, t) => t === 'all' ? cat !== 'combat' : (t === cat || (cat === 'system' && t !== 'combat'));

  function add(cat, html) {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
    const line = h('div', { class: `ae-msg ${cat}`, html });
    line.hidden = !visibleIn(cat, tab);
    log.append(line);
    lines.push({ el: line, cat });
    if (lines.length > MAX_LINES) lines.shift().el.remove();
    if (nearBottom || !line.hidden) log.scrollTop = log.scrollHeight;
    if (line.hidden) tabEls.find((b) => b.dataset.tab === cat)?.classList.add('has-new');
  }

  function setChannel(c) { channel = c; chanBtn.textContent = CH_LABEL[c]; }
  chanBtn.addEventListener('click', () => { setChannel(CHANNELS[(CHANNELS.indexOf(channel) + 1) % CHANNELS.length]); ui.sfx('click'); input.focus(); });

  function focus() {
    el.classList.add('is-active');
    ctx.input?.setTyping?.(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    input.focus({ preventScroll: true });
  }
  function blur() {
    input.blur();
  }
  input.addEventListener('focus', () => { el.classList.add('is-active'); ctx.input?.setTyping?.(true); });
  input.addEventListener('blur', () => { el.classList.remove('is-active'); ctx.input?.setTyping?.(false); });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { input.value = ''; blur(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = input.value.trim();
    input.value = '';
    if (text) send(text);
    blur();
  });

  function send(text) {
    const m = text.match(/^\/(\w+)\s*(.*)$/);
    let ch = channel; let body = text;
    if (m) {
      const cmd = m[1].toLowerCase();
      const map = { s: 'say', say: 'say', w: 'world', world: 'world', o: 'oath', oath: 'oath' };
      if (map[cmd]) { ch = map[cmd]; setChannel(ch); body = m[2]; if (!body) return; }
      else if (cmd === 'help') { add('system', 'Channels: <b>/s</b> say, <b>/w</b> world, <b>/o</b> oath. Keys: <b>M</b> map, <b>I</b> character, <b>Esc</b> menu.'); return; }
      else if (cmd === 'loc') { const p = ui.gs.pos(); add('system', `Position ${Math.round(p.x)}, ${Math.round(p.z)} — ${esc(ui.gs.region?.name || '')}`); return; }
      else { add('error', `Unknown command /${esc(cmd)}. Try /help.`); return; }
    }
    try { ctx.net?.send?.({ t: 'chat', text: body, channel: ch }); } catch (err) { add('error', 'Message could not be sent.'); }
    ui.sfx('chat');
  }

  return {
    el, add, focus, setTab,
    get focused() { return document.activeElement === input; },
    chat(e) {
      const ch = CHANNELS.includes(e.channel) ? e.channel : 'say';
      add(ch, `<span class="ch">${CH_LABEL[ch]}</span><span class="who">${esc(e.name || e.from || '?')}:</span>${esc(e.text)}`);
    },
    system(text) { add('system', esc(text)); },
    combat(html) { add('combat', html); },
  };
}
