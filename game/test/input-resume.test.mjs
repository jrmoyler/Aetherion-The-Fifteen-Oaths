import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/core/input.js';
test('blur and app hiding discard held pointer, keyboard and queued action state', () => {
  const handlers = new Map(), doc = new EventTarget(), canvas = new EventTarget();
  globalThis.addEventListener = (type, fn) => handlers.set(type, fn);
  globalThis.document = doc;
  globalThis.matchMedia = () => ({ matches:false });
  const input = createInput(canvas, {emit(){}});
  function dirty() {
    input.hold('forward',true); input.press('slot1'); input.setVirtualMove(1,1);
    input.setVirtualSprint(true); input.addVirtualLook(30,10);
    Object.assign(input.state,{mouseLeft:true,mouseRight:true,lookDX:20,lookDY:30,zoom:1});
  }
  for (const hide of [false,true]) {
    dirty();
    if (hide) { doc.hidden=true; doc.dispatchEvent(new Event('visibilitychange')); } else handlers.get('blur')();
    input.poll();
    assert.equal(input.consume('slot1'),false);
    assert.equal(input.isDown('forward'),false);
    for (const key of ['mouseLeft','mouseRight','sprint','jump']) assert.equal(input.state[key],false);
    for (const key of ['moveX','moveY','lookDX','lookDY','zoom']) assert.equal(input.state[key],0);
  }
});
