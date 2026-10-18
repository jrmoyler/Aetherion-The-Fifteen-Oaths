// Chat integration without touching chat.js: renders the 'party' and 'whisper' channels, and intercepts
// social commands typed in the chat box before chat.js sees them (capture phase on the chat element).
//   /p /party <text>            party channel          /tell /whisper /t <name> <text>   whisper   /r <text> reply
//   /invite /leave /kick /lead /promote /disband /duel /forfeit /trade /pvp [on|off]  -> server chat commands
import { esc } from '../dom.js';

const SERVER_CMDS = new Set(['invite', 'inv', 'leave', 'kick', 'lead', 'promote', 'disband', 'duel', 'forfeit', 'yield', 'trade', 'pvp']);

export function linkChat(env) {
  const { ui } = env;
  const chat = ui.chat;
  if (!chat?.el) return { whisper() {} };
  let lastWhisperFrom = null;

  // render party / whisper lines (chat.chat would label them "Say")
  const orig = chat.chat.bind(chat);
  chat.chat = (e) => {
    if (e?.channel === 'party') { chat.add('party', `<span class="ch">Party</span><span class="who">${esc(e.name || '?')}:</span>${esc(e.text)}`); return; }
    if (e?.channel === 'whisper') {
      const mine = env.isSelf(e.from);
      if (!mine) lastWhisperFrom = e.name;
      chat.add('whisper', mine ? `<span class="ch">To ${esc(e.toName || '?')}</span>${esc(e.text)}` : `<span class="ch">Whisper</span><span class="who">${esc(e.name || '?')}:</span>${esc(e.text)}`);
      if (!mine) ui.sfx('chat');
      return;
    }
    orig(e);
  };

  const input = chat.el.querySelector('input');
  chat.el.addEventListener('keydown', (e) => {
    if (e.target !== input || e.key !== 'Enter') return;
    const text = input.value.trim();
    const m = text.match(/^\/(\w+)\s*(.*)$/);
    if (!m) return;
    const cmd = m[1].toLowerCase(), rest = m[2].trim();
    let handled = true;
    if (cmd === 'p' || cmd === 'party') { if (rest) env.send({ t: 'chat', channel: 'party', text: rest }); }
    else if (cmd === 'tell' || cmd === 'whisper' || cmd === 't') {
      const mm = rest.match(/^"([^"]+)"\s+(.+)$/) || rest.match(/^(\S+)\s+(.+)$/);
      if (mm) env.send({ t: 'chat', channel: 'whisper', to: mm[1], text: mm[2] }); else chat.add('error', 'Usage: /tell &lt;name&gt; &lt;message&gt;');
    } else if (cmd === 'r' || cmd === 'reply') {
      if (lastWhisperFrom && rest) env.send({ t: 'chat', channel: 'whisper', to: lastWhisperFrom, text: rest }); else chat.add('error', 'No one to reply to.');
    } else if (SERVER_CMDS.has(cmd)) env.send({ t: 'chat', text: text.slice(0, 200) });
    else if (cmd === 'help') { chat.add('system', 'Social: <b>/invite</b> name, <b>/leave</b>, <b>/kick</b>, <b>/lead</b>, <b>/duel</b> name, <b>/forfeit</b>, <b>/trade</b> name, <b>/pvp</b> on|off, <b>/p</b> party chat, <b>/tell</b> name text, <b>/r</b> reply. Right-click a player for actions.'); handled = false; }
    else handled = false;
    if (!handled) return;
    e.preventDefault(); e.stopPropagation();
    input.value = '';
    ui.sfx('chat');
    input.blur();
  }, true);

  return {
    /** Open the chat box prefilled with a whisper to `name`. */
    whisper(name) {
      if (!input) return;
      chat.focus();
      input.value = `/tell ${/\s/.test(name) ? `"${name}"` : name} `;
      try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* ignore */ }
    },
  };
}
