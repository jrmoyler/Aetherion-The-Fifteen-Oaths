import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAbility, processDelayed, tickStatuses } from '../../shared/sim/combat.js';

function fixture() {
  const src = { id: 'caster', team: 1, st: [], x: 0, y: 0, z: 0, ry: 0, alive: true };
  const dst = { id: 'victim', team: 2, st: [], x: 0, y: 0, z: 8, radius: 0.5, hp: 100, mhp: 100, alive: true, fxVer: 0 };
  const events = [];
  const S = { t: 1000, delayed: [], ents: new Map([[src.id, src], [dst.id, dst]]), grid: { query: () => [dst] }, rng: () => 0.5,
    stats: { hits: 0 }, ev: (e) => events.push(e), statused: new Set(), groundY: () => 0 };
  return { S, src, dst, events };
}

test('line sweep lets a target sidestep during projectile travel', () => {
  const { S, src, dst } = fixture();
  resolveAbility(S, src, { id: 'test/sweep', shape: 'line', range: 12, radius: 1, speed: 8, damage: 20 }, 1, null, { x: 0, z: 1 }, dst);
  assert.equal(S.delayed.length, 1);
  dst.x = 4; S.t += 1100; processDelayed(S);
  assert.equal(dst.hp, 100);
  assert.equal(S.delayed.length, 0);
});

test('line sweep still damages a target inside its corridor', () => {
  const { S, src, dst } = fixture();
  resolveAbility(S, src, { id: 'test/sweep', shape: 'line', range: 12, radius: 1, speed: 8, damage: 20 }, 1, null, { x: 0, z: 1 }, dst);
  dst.x = 0.5; S.t += 1100; processDelayed(S);
  assert.equal(dst.hp, 80);
});

test('expired DoT never produces a tick scheduled beyond its lifetime', () => {
  const { S, src, dst } = fixture();
  dst.st.push({ id: 'burn', until: 1500, next: 2000, src: src.id, dps: 12, stacks: 1 });
  S.statused.add(dst); S.t = 2100; tickStatuses(S);
  assert.equal(dst.hp, 100);
  assert.equal(dst.st.length, 0);
  assert.equal(S.statused.size, 0);
});

test('a final tick exactly at expiry remains valid', () => {
  const { S, src, dst } = fixture();
  dst.st.push({ id: 'burn', until: 2000, next: 2000, src: src.id, dps: 12, stacks: 1 });
  S.statused.add(dst); S.t = 2000; tickStatuses(S);
  assert.equal(dst.hp, 88);
  assert.equal(dst.st.length, 0);
});

test('a launched projectile keeps its team when its caster disconnects', () => {
  const { S, src, dst } = fixture();
  resolveAbility(S, src, { id: 'test/bolt', shape: 'projectile', range: 12, damage: 20 }, 1, null, { x: 0, z: 1 }, dst);
  S.ents.delete(src.id); dst.team = 1; S.t += 1000; processDelayed(S);
  assert.equal(dst.hp, 100);
});

test('restoration self abilities heal over time without exceeding maximum health', () => {
  const { S, src } = fixture();
  Object.assign(src, { hp: 90, mhp: 100, fxVer: 0 });
  resolveAbility(S, src, { id: 'test/renew', shape: 'self', element: 'nature', damage: 0 }, 1, null, null, null);
  assert.ok(src.st.some((s) => s.id === 'regen' && s.dps > 0));
  for (let i = 0; i < 8; i++) { S.t += 1000; tickStatuses(S); }
  assert.equal(src.hp, 100);
  assert.equal(src.st.length, 0);
});

test('every element has an explicit tactical self profile', async () => {
  const { SELF_BUFF, ELEMENT_STATUS } = await import('../../shared/sim/data.js');
  for (const element of Object.keys(ELEMENT_STATUS)) assert.ok(SELF_BUFF[element]?.length, element);
  assert.notDeepEqual(SELF_BUFF.nature, SELF_BUFF.earth);
  assert.notDeepEqual(SELF_BUFF.wind, SELF_BUFF.fire);
});
