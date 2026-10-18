import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJobPool } from '../src/core/jobPool.js';
const timeout = (p) => Promise.race([p, new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('job stalled')), 500); t.unref(); })]);
test('startup jobs finish without a render loop when workers are blocked', async () => {
  const pool = createJobPool({count: 2, makeWorker() { throw new Error('blocked'); }, runSync: m => m.value * 2});
  assert.deepEqual(await timeout(Promise.all([pool.run({value: 2}), pool.run({value: 5})])), [4,10]);
  assert.equal(pool.pending, 0); pool.dispose();
});
test('worker crash requeues both inflight jobs and completes the queued work', async () => {
  const worker = { postMessage() {}, terminate() { this.stopped = true; } };
  const pool = createJobPool({count:1, makeWorker:() => worker, runSync:m => m.value});
  const results = [1,2,3].map(value => pool.run({value})); worker.onerror();
  assert.deepEqual(await timeout(Promise.all(results)), [1,2,3]);
  assert.equal(worker.stopped, true); assert.equal(pool.pending,0); pool.dispose();
});
test('unresponsive worker recovers and late replies cannot settle a new job', async () => {
  const worker = { postMessage(m) { this.id = m.id; }, terminate() {} };
  const pool = createJobPool({count:1, makeWorker:() => worker, runSync:() => 'fallback', timeoutMs:5});
  assert.equal(await timeout(pool.run({})), 'fallback');
  worker.onmessage({data:{id:worker.id,ok:true,r:'late'}});
  assert.equal(pool.pending,0); pool.dispose();
});
test('fallback respects priority and cancellation and disposes pending work', async () => {
  const order = [];
  const pool = createJobPool({count:0, runSync:m => order.push(m.value)});
  const a=pool.run({value:'low'},()=>10), b=pool.run({value:'high'},()=>1);
  const cancelled=assert.rejects(pool.run({},()=>0,()=>true), /cancelled/);
  await timeout(Promise.all([a,b,cancelled])); assert.deepEqual(order,['high','low']);
  pool.dispose(); await assert.rejects(pool.run({}), /disposed/);
});
