import test from 'node:test';
import assert from 'node:assert/strict';
import { readCombatActions, gameplayInputAllowed } from './input-actions.js';
const input = (actions, state = {}) => {
  const pressed = new Set(actions);
  return { gameplayEnabled: true, state, consume(a) { return pressed.delete(a); }, isDown: () => false };
};
test('locked mouse click attacks while unlocked click selects', () => {
  assert.deepEqual(readCombatActions(input(['click'], { pointerLocked: true })).slots, [0]);
  const pick = readCombatActions(input(['click']));
  assert.equal(pick.pick, true); assert.deepEqual(pick.slots, []);
});
test('R3 nearest targeting is independent of cycle targeting', () => {
  const result = readCombatActions(input(['targetNearest']));
  assert.equal(result.nearest, true); assert.equal(result.cycle, false);
});
test('held basic repeats, locked attack repeats, techniques do not repeat', () => {
  const i = input([]); i.isDown = (a) => a === 'slot0';
  assert.equal(readCombatActions(i).repeatBasic, true);
  assert.equal(readCombatActions(input([], { pointerLocked: true, mouseLeft: true })).repeatBasic, true);
  assert.equal(readCombatActions(input([], { mouseLeft: true })).repeatBasic, false);
  i.isDown = (a) => a === 'slot2'; assert.equal(readCombatActions(i).repeatBasic, false);
});
test('menus block combat including queued and held input', () => {
  const i = input(['click', 'slot5'], { pointerLocked: true, mouseLeft: true }); i.gameplayEnabled = false;
  assert.deepEqual(readCombatActions(i), { blocked: true, slots: [] });
  assert.equal(gameplayInputAllowed({ padCaptureReason: { typing: true, enabled: true } }), false);
});
test('simultaneous basic key and click produce one attack', () => {
  assert.deepEqual(readCombatActions(input(['click', 'slot0'], { pointerLocked: true })).slots, [0]);
});
