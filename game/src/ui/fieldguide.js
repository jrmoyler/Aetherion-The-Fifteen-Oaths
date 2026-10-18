// Contextual onboarding is driven by performed actions, not timers or invented rewards.
import { h } from './dom.js';

export function createFieldGuide(ui) {
  const { ctx, gs } = ui;
  const key = 'aetherion.fieldGuide.v1';
  let completed = new Set();
  try { completed = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { /* private browsing */ }
  let device = ui.touchMode ? 'touch' : 'kbm';
  const steps = [
    ['move', 'Find your footing', { kbm: 'WASD to move · drag to look · Shift to sprint', touch: 'Left thumb to move · drag right to look', gamepad: 'Left stick to move · right stick to look' }],
    ['target', 'Read your opponent', { kbm: 'Tab selects a nearby enemy', touch: 'Tap an enemy or use the target button', gamepad: 'D-pad left cycles nearby enemies' }],
    ['cast', 'Invoke your Oath', { kbm: '1–5 cast techniques · R unleashes your ultimate', touch: 'Tap an ability · watch its cooldown and mana cost', gamepad: 'X attacks · Y, LB, RB and RT cast techniques' }],
    ['talk', 'Meet the realm', { kbm: 'Approach a citizen, then press F to speak', touch: 'Approach a citizen, then tap the interaction prompt', gamepad: 'Approach a citizen, then D-pad right to speak' }],
  ];
  const heading = h('button', { type: 'button', class: 'ae-guide__head', 'aria-expanded': 'true' }, 'Field guide');
  const title = h('strong'); const hint = h('p'); const progress = h('span', { class: 'ae-guide__progress' });
  const content = h('div', { class: 'ae-guide__body' }, title, hint, progress);
  const el = h('aside', { class: 'ae-guide ae-panel', 'aria-label': 'Field guide', hidden: true }, heading, content);
  content.hidden = true;
  heading.setAttribute('aria-expanded', String(!content.hidden));
  heading.onclick = () => { content.hidden = !content.hidden; heading.setAttribute('aria-expanded', String(!content.hidden)); render(); };
  const prompt = h('button', { type: 'button', class: 'ae-interact ae-panel', hidden: true });
  prompt.onclick = () => ctx.input?.press?.('interact');
  function render() {
    const step = steps.find(([id]) => !completed.has(id));
    heading.textContent = `${content.hidden ? '+ ' : '− '}Field guide${content.hidden && step ? ' · ' + step[1] : ''}`;
    title.textContent = step ? step[1] : 'Your journey is yours';
    hint.textContent = step ? step[2][device] || step[2].kbm : 'Citizens offer tasks. Explore the sanctuaries to attune fast travel. Your map reveals the continent.';
    progress.textContent = `${steps.filter(([id]) => completed.has(id)).length} / ${steps.length} foundations learned`;
  }
  function mark(id) {
    if (!gs.inGame || completed.has(id)) return;
    completed.add(id);
    try { localStorage.setItem(key, JSON.stringify([...completed])); } catch { /* optional persistence */ }
    render();
  }
  ctx.bus.on('input:device', (e) => { device = e.device; render(); });
  ctx.bus.on('combat:target', (e) => { if (e?.id != null) mark('target'); });
  ctx.bus.on('combat:cast', () => mark('cast'));
  ctx.bus.on('net:ev', (p) => { const e = p?.e ?? p; if (e?.type === 'npc' && (e.id == null || gs.isSelf(e.id))) mark('talk'); });
  let start = null, elapsed = 0, nearby = null;
  ctx.addUpdate?.((dt) => {
    if (!gs.inGame) return;
    el.hidden = !!ui.anyWindow() || !gs.alive;
    if (ui.anyWindow() || !gs.alive || ui.chat?.focused) { prompt.hidden = true; return; }
    const p = gs.pos();
    if (!start) start = p;
    if (Math.hypot(p.x - start.x, p.z - start.z) > 8) mark('move');
    elapsed += dt;
    if (elapsed >= .2) {
      elapsed = 0; nearby = null; let distance = Infinity;
      gs.forEachEntity((a) => {
        if (a.kind !== 'npc' || !a.position) return;
        const d = Math.hypot(a.position.x - p.x, a.position.z - p.z);
        if (d <= 8 && d < distance) { distance = d; nearby = { id: a.id, label: `Speak with ${a.name || 'citizen'}` }; }
      });
      if (!nearby) for (const s of ctx.architecture?.sanctuaries || []) {
        if (s.shrine && Math.hypot(s.shrine.x - p.x, s.shrine.z - p.z) < 12) { nearby = { id: `shrine:${s.oathId}`, label: 'Restore health and mana at shrine' }; break; }
      }
      prompt.hidden = !nearby;
      if (nearby) prompt.textContent = `${device === 'kbm' ? '[F] ' : device === 'gamepad' ? '[D-pad →] ' : ''}${nearby.label}`;
    }
    if (ctx.input?.consume?.('interact')) {
      if (nearby) ctx.net?.send?.({ t: 'interact', id: nearby.id });
      else ui.toast('Move closer to a citizen or shrine to interact.', 'info');
    }
  }, 59);
  render();
  return { el, prompt };
}
