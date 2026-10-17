// Integration test: boots HTTP + WebSocket server on a random port and plays a scripted client
// through hello -> move -> cast -> kill -> loot, then token resume, validation, static + health.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import WebSocket from 'ws';
import { startServer } from '../app.js';
import { createMob } from '../../shared/sim/mobs.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aeth-test-'));
const staticDir = path.join(tmp, 'dist');
fs.mkdirSync(path.join(staticDir, 'assets'), { recursive: true });
fs.writeFileSync(path.join(staticDir, 'index.html'), `<!doctype html><title>Aetherion</title>${'<!-- pad -->'.repeat(200)}`);
fs.writeFileSync(path.join(staticDir, 'assets', 'main-AbCdEf12.js'), `console.log(${JSON.stringify('x'.repeat(5000))});`);
fs.writeFileSync(path.join(staticDir, 'manifest.webmanifest'), '{"name":"Aetherion"}');

/** Minimal scripted client that buffers messages and lets the test await predicates. */
class Client {
  constructor(url) {
    this.msgs = []; this.waiters = [];
    this.ws = new WebSocket(url);
    this.opened = new Promise((r, j) => { this.ws.once('open', r); this.ws.once('error', j); });
    this.closed = new Promise((r) => this.ws.once('close', (code) => r(code)));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      for (const x of Array.isArray(m) ? m : [m]) { this.msgs.push(x); }
      this.waiters = this.waiters.filter((w) => { const hit = this.msgs.find(w.pred); if (hit) { w.resolve(hit); return false; } return true; });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 5000, label = 'message') {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), ms);
    });
  }
  ev(type, extra = () => true) { return (m) => m.t === 'ev' && m.e.type === type && extra(m.e); }
  async waitEv(type, extra, ms, label) { return (await this.wait(this.ev(type, extra), ms, label)).e; }
  close() { this.ws.close(); return this.closed; }
}

let srv, url, base;
test.before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', bots: 0, dataDir: path.join(tmp, 'data'), staticDir, quiet: true, graceMs: 3000, simOpts: { campsPerRegion: 6, firstEventMs: 1e9 } });
  url = `ws://127.0.0.1:${srv.port}/ws`;
  base = `http://127.0.0.1:${srv.port}`;
});
test.after(async () => { await srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('scripted client: hello -> move -> cast -> kill -> loot, then token resume', async () => {
  const c = new Client(url);
  await c.opened;
  c.send({ t: 'hello', name: 'Scripted <b>Hero</b>', oath: 'oath-01', cls: 'sorcerer' });
  const w = await c.wait((m) => m.t === 'welcome', 5000, 'welcome');
  assert.equal(w.you.name, 'Scripted Hero', 'name sanitised');
  assert.equal(w.you.cls, 'sorcerer');
  const snap = await c.wait((m) => m.t === 'snap' && m.ents.some((e) => e.id === w.id), 3000, 'snapshot with self');
  assert.ok(snap.ents.find((e) => e.id === w.id).k === 'p');

  // ping / clock
  c.send({ t: 'ping', c: 123 });
  const pong = await c.wait((m) => m.t === 'pong' && m.c === 123);
  assert.ok(Math.abs(pong.s - Date.now()) < 5000);

  // walk a few steps east
  const S = srv.sim._S;
  const p = S.players.get(w.id);
  let x = w.you.x;
  for (let i = 1; i <= 6; i++) { x += 0.5; c.send({ t: 'move', x, y: w.you.y, z: w.you.z, ry: 1.57, anim: 'run', seq: i }); await new Promise((r) => setTimeout(r, 80)); }
  await c.wait((m) => m.t === 'snap' && m.ents.some((e) => e.id === w.id && Math.abs((e.x ?? 0) - x) < 0.01), 3000, 'moved position in snapshot');
  assert.ok(Math.abs(p.x - x) < 1e-6);

  // test fixture: move the player just outside the city ring and place a weak creature in bolt range
  const s = S.sanctuaries[0];
  p.x = s.center[0] + 160; p.z = s.center[1]; p.y = S.groundY(p.x, p.z); S.grid.move(p); S.pgrid.move(p);
  const mob = createMob(S, 'ember-hound', p.x + 10, p.z, 1, { fields: { respawnMs: 0, temp: true } });
  mob.hp = mob.mhp = 30;
  await c.wait((m) => m.t === 'snap' && m.ents.some((e) => e.id === mob.id && e.k === 'm' && e.model === 'ember-hound'), 3000, 'mob in snapshot');
  c.send({ t: 'target', id: mob.id });
  for (let i = 0; i < 12 && mob.alive; i++) {
    c.send({ t: 'cast', slot: 0, target: mob.id });
    await new Promise((r) => setTimeout(r, 1050));
  }
  await c.wait(c.ev('cast', (e) => e.src === w.id), 2000, 'cast event');
  await c.wait(c.ev('hit', (e) => e.src === w.id && e.dst === mob.id), 2000, 'hit event');
  const death = await c.waitEv('death', (e) => e.id === mob.id, 3000, 'death event');
  assert.equal(death.killer, w.id);
  const xp = await c.waitEv('xp', (e) => e.id === w.id, 2000, 'xp event');
  assert.ok(xp.amount > 0);
  const loot = await c.waitEv('loot', (e) => e.id === w.id, 2000, 'loot event');
  assert.ok(loot.gold > 0);
  const you = await c.wait((m) => m.t === 'you' && m.you.gold >= w.you.gold + loot.gold, 2000, 'you update with gold');
  assert.ok(you.you.xp > 0 || you.you.lvl > 1);

  // invalid messages are rejected, not fatal
  c.send({ t: 'cast', slot: 99 });
  await c.wait((m) => m.t === 'error' && /invalid/.test(m.msg), 2000, 'validation error');
  c.ws.send('{not json');
  await c.wait((m) => m.t === 'error' && /json/.test(m.msg), 2000, 'json error');

  // disconnect and resume with the token within the grace window
  await c.close();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(srv.sim.hasPlayer(w.id), 'character kept during grace period');
  const c2 = new Client(url);
  await c2.opened;
  c2.send({ t: 'hello', name: 'whatever', oath: 'oath-01', cls: 'sorcerer', token: w.token });
  const w2 = await c2.wait((m) => m.t === 'welcome', 3000, 'resume welcome');
  assert.equal(w2.id, w.id);
  assert.equal(w2.resumed, true);
  assert.equal(w2.you.gold, you.you.gold);
  await c2.wait((m) => m.t === 'snap' && m.ents.some((e) => e.id === w.id && e.k === 'p'), 3000, 'full snapshot after resume');
  await c2.close();

  // after the grace window the character is saved and removed; a new hello restores it from disk
  await new Promise((r) => setTimeout(r, 3400));
  assert.ok(!srv.sim.hasPlayer(w.id));
  const file = path.join(tmp, 'data', 'characters', `${w.token}.json`);
  for (let i = 0; i < 20 && !fs.existsSync(file); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(fs.existsSync(file), 'character file written atomically');
  const c3 = new Client(url);
  await c3.opened;
  c3.send({ t: 'hello', name: 'x', oath: 'oath-01', cls: 'sorcerer', token: w.token });
  const w3 = await c3.wait((m) => m.t === 'welcome', 3000, 'welcome from disk');
  assert.notEqual(w3.id, w.id);
  assert.equal(w3.token, w.token);
  assert.equal(w3.you.gold, you.you.gold);
  await c3.close();
});

test('rate limiting and oversized frames', async () => {
  const c = new Client(url);
  await c.opened;
  c.send({ t: 'hello', name: 'Spammer', oath: 'oath-02', cls: 'ninja' });
  await c.wait((m) => m.t === 'welcome');
  const before = srv.stats().bandwidth.rejected;
  for (let i = 0; i < 150; i++) c.send({ t: "target", id: null });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(srv.stats().bandwidth.rejected > before, 'excess messages dropped');
  c.ws.send(JSON.stringify({ t: 'chat', text: 'x'.repeat(10000) }));
  const code = await c.closed;
  assert.equal(code, 1009, 'oversized frame closes the socket');
});

test('HTTP: /health, /stats, static files with compression, caching and SPA fallback', async () => {
  const h = await (await fetch(`${base}/health`)).json();
  assert.equal(h.ok, true);
  const st = await (await fetch(`${base}/stats`)).json();
  assert.ok(st.mobs > 0 && st.tickMs && st.memory && st.bandwidth);
  const r = await fetch(`${base}/`, { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  const js = await fetch(`${base}/assets/main-AbCdEf12.js`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(js.headers.get('cache-control'), /immutable/);
  assert.ok((await js.text()).startsWith('console.log'));
  // raw check of the encoding header (fetch transparently decodes)
  const raw = await new Promise((resolve) => {
    import('node:http').then(({ get }) => get(`${base}/assets/main-AbCdEf12.js`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => resolve({ enc: res.headers['content-encoding'], body: Buffer.concat(chunks) }));
    }));
  });
  assert.equal(raw.enc, 'gzip');
  assert.ok(zlib.gunzipSync(raw.body).toString().startsWith('console.log'));
  const man = await fetch(`${base}/manifest.webmanifest`);
  assert.match(man.headers.get('content-type'), /application\/manifest\+json/);
  const spa = await fetch(`${base}/some/route`);
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /Aetherion/);
  const missing = await fetch(`${base}/assets/nope.js`);
  assert.equal(missing.status, 404);
  const trav = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
  assert.ok(trav.status === 400 || trav.status === 404 || (trav.status === 200 && /Aetherion/.test(await trav.text())));
  const etag = r.headers.get('etag');
  const nm = await fetch(`${base}/`, { headers: { 'If-None-Match': etag } });
  assert.equal(nm.status, 304);
});
