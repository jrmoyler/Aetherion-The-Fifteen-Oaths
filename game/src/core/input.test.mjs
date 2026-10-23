import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from './input.js';

function harness() {
  const window = new EventTarget(), document = new EventTarget(), canvas = new EventTarget();
  const originals = new Map();
  let pads = [];
  for (const [key, value] of Object.entries({
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    document, navigator: { getGamepads: () => pads }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {} },
  })) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true }); }
  canvas.focus = () => {}; document.pointerLockElement = null;
  const events = [], input = createInput(canvas, { emit: (...e) => events.push(e) });
  const emit = (target, type, fields = {}) => { const event = new Event(type, { cancelable: true }); Object.assign(event, fields); target.dispatchEvent(event); };
  return { input, window, document, canvas, events, emit, setPads(p) { pads = p; }, restore() { input.dispose(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}

for (const capture of ['typing', 'disabled', 'modal']) test(`${capture} clears all held and queued inputs and suppresses new gameplay`, () => {
  const h = harness(), { input: i } = h;
  try {
    h.emit(h.window, 'keydown', { code: 'KeyW' });
    h.emit(h.canvas, 'pointerdown', { pointerType: 'mouse', button: 0 });
    i.setVirtualMove(0.6, 0.8); i.setVirtualSprint(true); i.addVirtualLook(20, 30); i.press('slot0'); i.poll();
    assert.equal(i.state.moveY, 0.8);
    let modal = false;
    if (capture === 'typing') i.setTyping(true);
    if (capture === 'disabled') i.setEnabled(false);
    if (capture === 'modal') { i.setPadCapture(() => modal); modal = true; }
    i.poll();
    i.press('slot0'); i.hold('jump', true); i.setVirtualMove(1, 1); i.addVirtualLook(20, 30);
    h.emit(h.window, 'keydown', { code: 'KeyW' });
    h.emit(h.canvas, 'pointerdown', { pointerType: 'mouse', button: 2 });
    h.emit(h.canvas, 'wheel', { deltaY: 10 });
    i.poll();
    assert.equal(i.gameplayEnabled, false);
    assert.equal(i.consume('slot0'), false); assert.equal(i.consume('click'), false); assert.equal(i.isDown('jump'), false);
    for (const key of ['moveX', 'moveY', 'lookDX', 'lookDY', 'zoom']) assert.equal(i.state[key], 0, key);
    for (const key of ['sprint', 'jump', 'mouseLeft', 'mouseRight']) assert.equal(i.state[key], false, key);
    i.setTyping(false); i.setEnabled(true); modal = false; i.poll();
    assert.equal(i.gameplayEnabled, true); assert.equal(i.state.moveY, 0); assert.equal(i.consume('slot0'), false);
    h.emit(h.window, 'keydown', { code: 'KeyW' }); i.poll(); assert.equal(i.state.moveY, 1);
  } finally { h.restore(); }
});

test('gamepad captured actions require release and re-press; navigation remains available', () => {
  const h = harness(), { input: i } = h;
  try {
    const pad = { index: 0, connected: true, mapping: 'standard', id: 'Xbox', axes: [0, -1, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    h.setPads([pad]); pad.buttons[2] = { pressed: true, value: 1 }; i.poll(); assert.equal(i.consume('slot0'), true);
    i.setTyping(true); i.poll(); assert.equal(i.state.moveY, 0);
    pad.buttons[0] = { pressed: true, value: 1 }; i.poll();
    assert.ok(h.events.some(([type, e]) => type === 'gamepad:nav' && e.btn === 'A'));
    i.setTyping(false); i.poll(); assert.equal(i.consume('slot0'), false); assert.equal(i.consume('jump'), false);
    pad.buttons[2] = { pressed: false, value: 0 }; pad.buttons[0] = { pressed: false, value: 0 }; i.poll();
    pad.buttons[2] = { pressed: true, value: 1 }; i.poll(); assert.equal(i.consume('slot0'), true);
  } finally { h.restore(); }
});

test('blur clears touch and mouse state; dispose detaches event handlers', () => {
  const h = harness(), { input: i } = h;
  try {
    i.setVirtualMove(0, 1); i.press('slot0'); h.emit(h.window, 'blur'); i.poll();
    assert.equal(i.state.moveY, 0); assert.equal(i.consume('slot0'), false);
    i.dispose(); h.emit(h.window, 'keydown', { code: 'KeyW' }); i.poll(); assert.equal(i.state.moveY, 0);
  } finally { h.restore(); }
});
