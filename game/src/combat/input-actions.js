// Keep combat input policy independent of rendering so every device follows the same rules.
export function gameplayInputAllowed(input) {
  if (!input) return false;
  if (typeof input.gameplayEnabled === 'boolean') return input.gameplayEnabled;
  const reason = input.padCaptureReason;
  return !input.padCaptured && !reason?.typing && reason?.enabled !== false && !reason?.menu;
}

export function readCombatActions(input) {
  if (!gameplayInputAllowed(input)) return { blocked: true, slots: [] };
  const cycle = input.consume('target');
  const nearest = input.consume('targetNearest');
  const click = input.consume('click');
  const locked = !!input.state?.pointerLocked;
  const slots = [];
  for (let slot = 0; slot < 6; slot++) if (input.consume(`slot${slot}`)) slots.push(slot);
  if (click && locked && !slots.includes(0)) slots.push(0);
  return {
    blocked: false, cycle, nearest, pick: click && !locked, slots,
    // Only the repeatable basic attack repeats; techniques remain deliberate presses.
    repeatBasic: !!input.isDown?.('slot0') || (locked && !!input.state?.mouseLeft),
  };
}
