import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceHotbar } from './loadout.js';

test('repeated authoritative loadout snapshots do not trigger prediction reset', () => {
  const current = [{ id: 'basic/ninja' }, { id: 'codex/a' }];
  const confirmed = current.map((a) => ({ ...a, damage: 42 }));
  assert.equal(replaceHotbar(current, confirmed), false);
  assert.equal(current[1].damage, 42);
});
test('confirmed slot swaps update the existing array exactly once', () => {
  const current = [{ id: 'basic/ninja' }, { id: 'codex/a' }, { id: 'codex/b' }];
  const reference = current;
  const next = [current[0], current[2], current[1]];
  assert.equal(replaceHotbar(current, next), true);
  assert.equal(current, reference);
  assert.deepEqual(current.map((a) => a.id), ['basic/ninja', 'codex/b', 'codex/a']);
  assert.equal(replaceHotbar(current, next), false);
});
