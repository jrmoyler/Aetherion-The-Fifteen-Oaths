import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameBudget } from '../src/core/frameBudget.js';
test('sustained slow frames lower scale within bounds, fast recovery is deliberately slower', () => {
  const b = createFrameBudget();
  for(let i=0;i<2000;i++) b.sample(40);
  assert.equal(b.scale,0.5);
  for(let i=0;i<300;i++) b.sample(10);
  assert.equal(b.scale,0.5);
  for(let i=0;i<14000;i++) b.sample(10);
  assert.equal(b.scale,1);
});
test('background gaps and invalid samples do not degrade resolution', () => {
  const b = createFrameBudget({maxScale:0.6});
  for(let i=0;i<1000;i++) { b.sample(Infinity); b.sample(4000); b.sample(-10); }
  assert.equal(b.scale,0.6);
  b.reset(); assert.equal(b.scale,0.6);
});
