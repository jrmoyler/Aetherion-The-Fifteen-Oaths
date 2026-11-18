import { h } from './dom.js';
import { objectiveGuidance, routedWaypoint, trackedObjective } from './questNavigation.js';
import './story-hud.css';

function hintFor(quest, device, near) {
  if (quest.kind === 'kill') {
    if (!near) return 'Follow the gold marker. Ready your attack.';
    if (device === 'touch') return 'Tap Target, then Attack. Use Dodge to evade.';
    if (device === 'gamepad') return 'R3 targets. X attacks. B dodges.';
    return 'Tab targets. Hold 1 to attack. C dodges.';
  }
  if (quest.kind === 'talk' || quest.kind === 'interact') {
    if (near) return device === 'touch' ? 'Tap the interaction prompt.' : device === 'gamepad' ? 'Press D-pad right to interact.' : 'Press F to interact.';
    return device === 'touch' ? 'Left stick to move. Drag to look.' : device === 'gamepad' ? 'Left stick to move. Right stick to look.' : 'WASD to move. Right-drag to look.';
  }
  return 'Follow the gold marker.';
}

export function createStoryObjective(ui) {
  const { ctx, gs } = ui;
  const chapter = h('span', { class: 'ae-story-objective__chapter' });
  const action = h('span', { class: 'ae-story-objective__action', 'aria-live': 'polite' });
  const direction = h('span', { class: 'ae-story-objective__direction' });
  const hint = h('span', { class: 'ae-story-objective__hint' });
  const el = h('button', { class: 'ae-story-objective', type: 'button', hidden: true, 'aria-label': 'Open story journal' }, chapter, action, direction, hint);
  el.addEventListener('click', () => ui.toggleWindow('journal'));
  let device = ui.touchMode ? 'touch' : 'kbm';
  let elapsed = 0;
  function refresh(dt = .2) {
    elapsed += dt;
    if (elapsed < .15) return;
    elapsed = 0;
    const quest = trackedObjective(gs.quests);
    const showing = gs.inGame && !!quest?.chapter && gs.alive && !ui.anyWindow();
    el.hidden = !showing;
    if (!showing) return;
    const position = gs.pos();
    const waypoint = routedWaypoint(position, quest.waypoint);
    const guidance = objectiveGuidance(position, gs.heading(), waypoint);
    const actionLabel = quest.objective || quest.waypoint.label || quest.title;
    const actionText = quest.goal > 1 ? `${actionLabel} (${quest.progress}/${quest.goal})` : actionLabel;
    if (action.textContent !== actionText) action.textContent = actionText;
    chapter.textContent = quest.chapter;
    direction.textContent = waypoint !== quest.waypoint && guidance
      ? `Sanctuary road · ${Math.round(guidance.distance)} m${guidance.distance > 8 ? ' · ' + guidance.label.split(' · ')[0] : ''}`
      : guidance?.label || '';
    const near = (guidance?.distance ?? Infinity) <= (quest.kind === 'kill' ? 32 : quest.kind === 'interact' ? 12 : 8);
    hint.textContent = waypoint !== quest.waypoint ? 'Follow the gold marker through the gate.' : hintFor(quest, device, near);
  }
  ctx.bus.on('input:device', event => { device = event.device; refresh(); });
  ctx.addUpdate?.(refresh, 61);
  return { el, refresh };
}
