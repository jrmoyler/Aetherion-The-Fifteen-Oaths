#!/usr/bin/env node
// Load test: N headless WebSocket clients that join, walk out of their sanctuaries into the wilds
// (12 Hz moves at legal speed) and cast abilities, for D seconds. Reports server tick time (sim and
// total incl. encoding/sending) p50/p99 from /stats and bandwidth per client.
//
//   node loadtest.mjs [--clients 300] [--duration 60] [--url ws://host:port/ws] [--ramp 10]
// Without --url it boots `node index.js` on a free port (BOTS=0 unless --bots N) and stops it afterwards.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { OATHS } from '../shared/oaths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const N = Number(args.clients ?? 300);
const DURATION = Number(args.duration ?? 60);
const RAMP = Number(args.ramp ?? 10);
let url = args.url;
let child = null;

async function freePort() {
  return new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
}

if (!url) {
  const port = await freePort();
  child = spawn(process.execPath, [path.join(HERE, 'index.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BOTS: String(args.bots ?? 0), MAX_PLAYERS: String(N + 50), DATA_DIR: args.data ?? path.join(HERE, 'data-loadtest') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (/listening on/.test(d.toString())) resolve(); });
    child.once('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
  url = `ws://127.0.0.1:${port}/ws`;
}
const httpBase = url.replace(/^ws/, 'http').replace(/\/ws$/, '');
const getStats = async () => (await fetch(`${httpBase}/stats`)).json();
console.log(`load test: ${N} clients x ${DURATION}s against ${url}`);

let bytesIn = 0, framesIn = 0, connected = 0, corrections = 0, errors = 0;
const clients = [];

function startClient(i) {
  const oath = OATHS[i % OATHS.length].id;
  const cls = i % 2 ? 'sorcerer' : 'ninja';
  const ws = new WebSocket(url, { perMessageDeflate: false });
  const c = { ws, id: null, x: 0, y: 0, z: 0, ry: Math.random() * Math.PI * 2, seq: 0, bytes: 0, timer: null, castT: 0, start: 0 };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: `Load ${i}`, oath, cls })));
  ws.on('message', (data) => {
    const s = data.toString();
    bytesIn += s.length; framesIn++; c.bytes += s.length;
    if (!c.id) {
      if (s.startsWith('{"t":"welcome"')) {
        const w = JSON.parse(s);
        c.id = w.id; c.x = w.you.x; c.y = w.you.y; c.z = w.you.z; c.start = Date.now();
        connected++;
        c.timer = setInterval(() => tick(c), 1000 / 12);
      }
      return;
    }
    // authoritative corrections for this client
    const k = s.indexOf(`"type":"teleport","id":"${c.id}"`);
    if (k >= 0) {
      const m = /"x":(-?[\d.]+),"y":(-?[\d.]+),"z":(-?[\d.]+)/.exec(s.slice(k));
      if (m) { c.x = +m[1]; c.y = +m[2]; c.z = +m[3]; corrections++; }
    }
  });
  ws.on('error', () => { errors++; });
  ws.on('close', () => clearInterval(c.timer));
  clients.push(c);
}

function tick(c) {
  if (c.ws.readyState !== 1) return;
  // wander: mostly straight, occasional turns; walk outward for the first ~25 s then roam
  c.ry += (Math.random() - 0.5) * 0.25;
  const sp = 5.5 / 12;
  c.x += Math.sin(c.ry) * sp; c.z += Math.cos(c.ry) * sp;
  c.seq++;
  c.ws.send(JSON.stringify({ t: 'move', x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), ry: +c.ry.toFixed(2), anim: 'run', seq: c.seq }));
  const now = Date.now();
  if (now - c.castT > 1100) {
    c.castT = now;
    const slot = Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 5);
    const dx = Math.sin(c.ry), dz = Math.cos(c.ry);
    c.ws.send(JSON.stringify({ t: 'cast', slot, dir: { x: +dx.toFixed(3), z: +dz.toFixed(3) }, aim: { x: +(c.x + dx * 10).toFixed(2), y: c.y, z: +(c.z + dz * 10).toFixed(2) } }));
  }
  if (Math.random() < 0.002) c.ws.send(JSON.stringify({ t: 'chat', text: 'for the covenant!', channel: 'say' }));
}

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  startClient(i);
  await new Promise((r) => setTimeout(r, (RAMP * 1000) / N));
}
while (connected < N && Date.now() - t0 < (RAMP + 15) * 1000) await new Promise((r) => setTimeout(r, 200));
console.log(`connected ${connected}/${N} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const bytes0 = bytesIn, tStart = Date.now();
const samples = [];
for (let s = 10; s <= DURATION; s += 10) {
  await new Promise((r) => setTimeout(r, 10000));
  const st = await getStats();
  samples.push(st);
  console.log(`t+${s}s players=${st.players} mobs=${st.mobs} awake=${st.mobsAwake} sim p50=${st.tickMs.p50}ms p99=${st.tickMs.p99}ms max=${st.tickMs.max}ms | total p50=${st.tickTotalMs.p50} p99=${st.tickTotalMs.p99}ms cpu p50=${st.tickCpuMs.p50} p99=${st.tickCpuMs.p99}ms | out=${(st.bandwidth.outBytesPerSec / 1024).toFixed(0)} KiB/s (${(st.bandwidth.perClientBytesPerSec / 1024).toFixed(1)} KiB/s/client) rss=${(st.memory.rss / 1048576).toFixed(0)}MB`);
}
const secs = (Date.now() - tStart) / 1000;
const final = samples[samples.length - 1];
const report = {
  clients: N, connected, durationSec: Math.round(secs),
  simTickMs: final.tickMs, totalTickMs: final.tickTotalMs, totalTickCpuMs: final.tickCpuMs,
  worstP99OverRun: Math.max(...samples.map((s) => s.tickMs.p99)),
  bandwidthPerClientKiBps: +((bytesIn - bytes0) / connected / secs / 1024).toFixed(2),
  serverOutKiBps: +(final.bandwidth.outBytesPerSec / 1024).toFixed(1),
  framesPerClientPerSec: +(framesIn / connected / ((Date.now() - t0) / 1000)).toFixed(1),
  corrections, errors, mobs: final.mobs, mobsAwake: final.mobsAwake, rssMB: Math.round(final.memory.rss / 1048576),
  counters: final.counters, cpus: (await import('node:os')).cpus().length, loadavg: final.load,
};
console.log(JSON.stringify(report, null, 2));
for (const c of clients) { clearInterval(c.timer); try { c.ws.terminate(); } catch { /* ignore */ } }
if (child) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); }
process.exit(0);
