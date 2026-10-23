// Prologue coaching advances only on player actions confirmed by the authoritative simulation.
import { h } from './dom.js';
import './onboarding.css';

export const GUIDE_KEY = 'aetherion.fieldGuide.v2';
export const GUIDE_STEPS = ['move', 'talk', 'target', 'cast', 'hit'];
export function readGuideProgress(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return { completed: new Set((Array.isArray(value.completed) ? value.completed : []).filter(id => GUIDE_STEPS.includes(id))), collapsed: value.collapsed === true };
  } catch { return { completed: new Set(), collapsed: false }; }
}

export function createFieldGuide(ui) {
  const { ctx, gs } = ui;
  let saved; try { saved = localStorage.getItem(GUIDE_KEY); } catch { /* private browsing */ }
  const restored = readGuideProgress(saved), completed = restored.completed;
  let device = ctx.input?.device ?? (ui.touchMode ? 'touch' : 'kbm');
  let talkGoal = null;
  const steps = [
    ['move', 'Find your footing', 'I · ARRIVAL', { kbm: 'Move with WASD. Hold Shift to sprint; drag to look around.', touch: 'Move with the left thumbstick. Drag the right side to look around.', gamepad: 'Move with the left stick. Look with the right stick; press L3 to sprint.' }],
    ['talk', 'Hear the terms', 'II · THE COVENANT', { kbm: 'Follow the destination below. Within eight metres, press F to speak.', touch: 'Follow the destination below. Tap “Speak” when you reach the citizen.', gamepad: 'Follow the destination below. Press D-pad right when you reach the citizen.' }],
    ['target', 'Read your opponent', 'III · THE WILDS', { kbm: 'Approach the marked camp. Tab selects a nearby hostile.', touch: 'Approach the marked camp. Tap the target control to select a hostile.', gamepad: 'Approach the marked camp. R3 selects the nearest hostile; D-pad left cycles targets.' }],
    ['cast', 'Invoke your Oath', 'IV · FIRST INVOCATION', { kbm: '1 is your basic attack. 2–5 cast techniques; R casts your ultimate. Let the cast finish.', touch: 'Tap an ability and let its cast finish. Mana and cooldowns govern your next action.', gamepad: 'X attacks. Y, RB, LB and RT cast techniques; LT + RT casts the ultimate. Let the cast finish.' }],
    ['hit', 'Make it count', 'V · FIRST CONTACT', { kbm: 'Close to attack range. Hold 1, or click the world then hold left mouse, to attack. C dodges.', touch: 'Stay in range and tap your attack. Use Dodge to evade an incoming strike.', gamepad: 'Stay in range and hold X to attack. B dodges an incoming strike.' }],
  ];
  const heading = h('button', { type: 'button', class: 'ae-guide__head', 'aria-expanded': 'true' });
  const chapter = h('span', { class: 'ae-onboarding__chapter' });
  const title = h('strong', { class: 'ae-onboarding__title' });
  const hint = h('p');
  const destination = h('p', { class: 'ae-onboarding__destination', hidden: true });
  const progress = h('span', { class: 'ae-guide__progress', 'aria-live': 'polite' });
  const milestones = steps.map(([id,,label]) => h('span', { class: 'ae-onboarding__milestone', 'aria-label': label }, id === 'move' ? 'I' : id === 'talk' ? 'II' : id === 'target' ? 'III' : id === 'cast' ? 'IV' : 'V'));
  const timeline = h('div', { class: 'ae-onboarding__timeline', 'aria-label': 'Prologue chapters' }, ...milestones);
  const dismiss = h('button', { class: 'ae-onboarding__dismiss', type: 'button' }, 'Minimize guidance');
  const reset = h('button', { class: 'ae-guide__reset', type: 'button' }, 'Replay guidance');
  const content = h('div', { class: 'ae-guide__body' }, chapter, title, hint, destination, timeline, progress, dismiss, reset);
  const el = h('aside', { class: 'ae-guide ae-panel ae-onboarding', 'aria-label': 'Prologue guidance', hidden: true }, heading, content);
  content.hidden = restored.collapsed || completed.size === GUIDE_STEPS.length;
  const prompt = h('button', { type: 'button', class: 'ae-interact ae-panel', hidden: true });
  prompt.onclick = () => ctx.input?.press?.('interact');
  function persist() { try { localStorage.setItem(GUIDE_KEY, JSON.stringify({ completed: [...completed], collapsed: content.hidden })); } catch { /* optional persistence */ } }
  function collapse(value) { content.hidden = value; persist(); render(); }
  heading.onclick = () => collapse(!content.hidden);
  dismiss.onclick = () => collapse(true);
  reset.onclick = () => { completed.clear(); start = null; travelled = 0; collapse(false); };
  function render() {
    const step = steps.find(([id]) => !completed.has(id));
    heading.setAttribute('aria-expanded', String(!content.hidden));
    heading.textContent = `${content.hidden ? '+ ' : '− '}Prologue${content.hidden && step ? ' · ' + step[1] : ''}`;
    chapter.textContent = step?.[2] ?? 'PROLOGUE COMPLETE';
    title.textContent = step?.[1] ?? 'The road is open';
    hint.textContent = step ? step[3][device] || step[3].kbm : 'Your actions have opened the journey. Follow your covenant tasks, strengthen your equipment, and return to a shrine when you need to recover.';
    reset.hidden = completed.size < steps.length;
    progress.textContent = `${completed.size} / ${steps.length} chapters learned through play`;
    milestones.forEach((node, i) => { node.setAttribute('data-state', completed.has(steps[i][0]) ? 'complete' : step?.[0] === steps[i][0] ? 'active' : 'pending'); });
  }
  function mark(id) {
    if (!gs.inGame || completed.has(id)) return;
    completed.add(id); persist(); render();
  }
  function updateDestination(position) {
    const quest = [...(gs.quests?.values?.() ?? [])].find(q => !q.done && q.waypoint);
    const waypoint = quest?.waypoint;
    if (quest?.kind === 'talk' && waypoint) talkGoal = { ...waypoint };
    destination.hidden = !waypoint;
    if (waypoint) {
      const distance = Math.round(Math.hypot(waypoint.x - position.x, waypoint.z - position.z));
      destination.textContent = `${waypoint.label} · ${distance} m${distance <= 8 ? ' · Within reach' : ''}`;
    }
  }
  ctx.bus.on('input:device', (e) => { device = e.device; render(); });
  ctx.bus.on('combat:target', (e) => { if (e?.id != null && ctx.combat?.isEnemy?.(e.id)) mark('target'); });
  ctx.bus.on('net:ev', (payload) => {
    const e = payload?.e ?? payload;
    if (!e || !gs.inGame) return;
    if (e.type === 'npc' && gs.isSelf(e.id) && talkGoal) {
      const actor = gs.actor?.(e.npc);
      const atGoal = actor?.position && Math.hypot(actor.position.x - talkGoal.x, actor.position.z - talkGoal.z) < 3;
      if (e.name === talkGoal.label || atGoal) mark('talk');
    }
    // Anticipation effects and channel starts are not successful invocations.
    if (e.type === 'cast' && gs.isSelf(e.src) && e.slot >= 0 && (e.release === true || (e.castTime ?? 0) <= .05)) mark('cast');
    if (e.type === 'hit' && gs.isSelf(e.src) && !gs.isSelf(e.dst) && e.amount > 0) mark('hit');
  });
  let start = null, travelled = 0, elapsed = 0, nearby = null;
  ctx.addUpdate?.((dt) => {
    if (!gs.inGame) return;
    el.hidden = !!ui.anyWindow() || !gs.alive;
    if (ui.anyWindow() || !gs.alive || ui.chat?.focused) { prompt.hidden = true; return; }
    const p = gs.pos();
    if (start) {
      const moved = Math.hypot(p.x - start.x, p.z - start.z);
      const input = ctx.input?.state;
      if (moved < 5 && Math.hypot(input?.moveX ?? 0, input?.moveY ?? 0) > .01) travelled += moved;
      if (travelled >= 8) mark('move');
    }
    start = { ...p };
    elapsed += dt;
    if (elapsed >= .2) {
      elapsed = 0; updateDestination(p); nearby = null; let distance = Infinity;
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
  return { el, prompt, toggle() { collapse(!content.hidden); }, get completed() { return [...completed]; } };
}
