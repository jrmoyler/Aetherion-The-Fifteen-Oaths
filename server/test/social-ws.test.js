// Integration: two real WebSocket clients party up (with party chat), duel to 1 HP through real casts,
// then trade (lock + confirm) - all through server/app.js validation, rate limiting and batching.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../app.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aeth-social-'));

class Client {
  constructor(url) {
    this.msgs = []; this.waiters = [];
    this.ws = new WebSocket(url);
    this.opened = new Promise((r, j) => { this.ws.once('open', r); this.ws.once('error', j); });
    this.closed = new Promise((r) => this.ws.once('close', r));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      for (const x of Array.isArray(m) ? m : [m]) this.msgs.push(x);
      this.waiters = this.waiters.filter((w) => { const hit = this.msgs.find(w.pred); if (hit) { w.resolve(hit); return false; } return true; });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 6000, label = 'message') {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), ms);
    });
  }
  ev(type, extra = () => true, ms, label) { return this.wait((m) => m.t === 'ev' && m.e.type === type && extra(m.e), ms, label ?? type).then((m) => m.e); }
  close() { this.ws.close(); return this.closed; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let srv, url;
const logLines = [];
test.before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', bots: 0, dataDir: path.join(tmp, 'data'), staticDir: path.join(tmp, 'none'), quiet: true, graceMs: 2000, simOpts: { campsPerRegion: 4, firstEventMs: 1e9, log: (l) => logLines.push(l) } });
  url = `ws://127.0.0.1:${srv.port}/ws`;
});
test.after(async () => { await srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('two WS clients: party + party chat, duel to 1 HP via real casts, then a locked/confirmed trade', async () => {
  const A = new Client(url), B = new Client(url);
  await Promise.all([A.opened, B.opened]);
  A.send({ t: 'hello', name: 'Ashka', oath: 'oath-04', cls: 'ninja' });
  B.send({ t: 'hello', name: 'Brannoc', oath: 'oath-04', cls: 'ninja' });
  const wa = await A.wait((m) => m.t === 'welcome', 5000, 'welcome A');
  const wb = await B.wait((m) => m.t === 'welcome', 5000, 'welcome B');
  assert.ok(Array.isArray(wa.world.warZones) && wa.world.warZones.length >= 3, 'war zones in welcome');
  assert.equal(wa.world.social.partyMax, 5);
  const S = srv.sim._S;
  const pa = S.players.get(wa.id), pb = S.players.get(wb.id);

  // ---- party
  A.send({ t: 'party', op: 'invite', target: 'Brannoc' });
  const inv = await B.ev('invite', (e) => e.kind === 'party' && e.from === wa.id && e.state === 'open', 4000, 'party invite');
  assert.equal(inv.name, 'Ashka');
  B.send({ t: 'party', op: 'accept', from: wa.id });
  const ra = await A.ev('party', (e) => e.party && e.party.members.length === 2, 4000, 'roster A');
  await B.ev('party', (e) => e.party && e.party.members.length === 2, 4000, 'roster B');
  assert.equal(ra.party.leader, wa.id);
  await A.wait((m) => m.t === 'snap' && m.ents.some((e) => e.id === wb.id && e.party === ra.party.id), 4000, 'party id on the entity');
  B.send({ t: 'chat', text: 'Ready when you are.', channel: 'party' });
  await A.ev('chat', (e) => e.channel === 'party' && e.from === wb.id, 4000, 'party chat');
  A.send({ t: 'party', op: 'bogus' });
  await A.wait((m) => m.t === 'error' && /invalid/.test(m.msg), 3000, 'invalid op rejected');

  // ---- duel (party members may duel), real melee casts
  pb.x = pa.x + 1.8; pb.z = pa.z; pb.y = pa.y; S.grid.move(pb); S.pgrid.move(pb);
  A.send({ t: 'duel', op: 'challenge', target: wb.id });
  await B.ev('invite', (e) => e.kind === 'duel' && e.state === 'open', 4000, 'duel invite');
  B.send({ t: 'duel', op: 'accept', from: wa.id });
  const cd = await A.ev('duel', (e) => e.state === 'countdown', 4000, 'countdown');
  assert.ok(cd.at - Date.now() > 1500, 'countdown start time in the future');
  await B.ev('duel', (e) => e.state === 'fight', 6000, 'fight');
  pb.hp = 2;
  let end = null;
  for (let i = 0; i < 12 && !end; i++) {
    A.send({ t: 'cast', slot: 0, target: wb.id, dir: { x: 1, z: 0 } });
    await sleep(700);
    end = B.msgs.find((m) => m.t === 'ev' && m.e.type === 'duel' && m.e.state === 'end')?.e ?? null;
  }
  assert.ok(end, 'duel ended');
  assert.equal(end.winner, wa.id); assert.equal(end.reason, 'defeat');
  assert.equal(pb.alive, true); assert.equal(Math.ceil(pb.hp) >= 1, true);
  await A.ev('duel', (e) => e.state === 'end', 3000, 'end on A');

  // ---- trade
  const potion = wa.you.inventory.find((i) => i.key === 'potion');
  A.send({ t: 'trade', op: 'request', target: 'Brannoc' });
  await B.ev('invite', (e) => e.kind === 'trade' && e.state === 'open', 4000, 'trade invite');
  B.send({ t: 'trade', op: 'accept', from: wa.id });
  await A.ev('trade', (e) => e.state === 'open', 4000, 'trade open');
  A.send({ t: 'trade', op: 'offer', items: [potion.id], gold: 0 });
  B.send({ t: 'trade', op: 'offer', items: [], gold: 7 });
  await A.ev('trade', (e) => e.them.gold === 7 && e.you.items.length === 1, 4000, 'offers visible');
  A.send({ t: 'trade', op: 'lock' }); B.send({ t: 'trade', op: 'lock' });
  await B.ev('trade', (e) => e.you.locked && e.them.locked, 4000, 'both locked');
  A.send({ t: 'trade', op: 'confirm' }); B.send({ t: 'trade', op: 'confirm' });
  const doneB = await B.ev('trade', (e) => e.state === 'done', 4000, 'trade done B');
  assert.equal(doneB.got[0].id, potion.id);
  assert.equal(doneB.goldGave, 7);
  await A.ev('trade', (e) => e.state === 'done', 4000, 'trade done A');
  const youB = await B.wait((m) => m.t === 'you' && Array.isArray(m.you.inventory) && m.you.inventory.some((i) => i.key === 'potion' && i.qty === 3 + potion.qty), 4000, 'inventory update (potions stacked)');
  assert.ok(youB);
  assert.ok(logLines.some((l) => /^trade /.test(l)), 'trade logged');

  // ---- disconnect cancels an open trade immediately (not after the grace window)
  A.send({ t: 'trade', op: 'request', target: wb.id });
  await B.ev('invite', (e) => e.kind === 'trade' && e.state === 'open' && B.msgs.filter((m) => m.t === 'ev' && m.e.type === 'invite' && m.e.kind === 'trade').length >= 3, 4000, 'second trade invite');
  B.send({ t: 'trade', op: 'accept', from: wa.id });
  await A.ev('trade', (e) => e.state === 'open' && A.msgs.filter((m) => m.t === 'ev' && m.e.type === 'trade' && m.e.state === 'open').length >= 2, 4000, 'second trade open');
  await B.close();
  await A.ev('trade', (e) => e.state === 'cancelled' && e.reason === 'logout', 4000, 'cancel on logout');
  await A.close();
});
