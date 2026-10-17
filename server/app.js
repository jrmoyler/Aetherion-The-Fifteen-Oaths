// Aetherion game server: HTTP (static client + /health + /stats) and WebSocket (/ws) around the
// authoritative shared/sim. Exported as startServer() so tests can boot it on a random port.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { createSim } from '../shared/sim/index.js';
import { TICK_HZ, DEFAULT_PORT, PROTOCOL_VERSION } from '../shared/protocol.js';
import { Ring } from '../shared/sim/util.js';
import { validate } from './lib/validate.js';
import { createStore } from './lib/persistence.js';
import { createStatic } from './lib/static.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = Symbol('json');
/**
 * JSON encoding with caching. Messages broadcast to many clients are encoded once. Snapshots are
 * per-client, but their entity entries are shared objects (per entity version) across clients, so
 * each entity entry is stringified once and snapshots are assembled by concatenation.
 */
function encode(msg) {
  if (msg[RAW]) return msg[RAW];
  if (msg.t === 'snap') {
    const ents = msg.ents;
    let s = `{"t":"snap","time":${msg.time},"timeOfDay":${msg.timeOfDay},"ents":[`;
    for (let i = 0; i < ents.length; i++) { const e = ents[i]; s += (i ? ',' : '') + (e[RAW] ?? (e[RAW] = JSON.stringify(e))); }
    s += `],"gone":${msg.gone.length ? JSON.stringify(msg.gone) : '[]'}}`;
    return (msg[RAW] = s);
  }
  return (msg[RAW] = JSON.stringify(msg));
}

export async function startServer(opts = {}) {
  const cfg = {
    port: opts.port ?? Number(process.env.PORT ?? DEFAULT_PORT),
    host: opts.host ?? process.env.HOST ?? '0.0.0.0',
    staticDir: opts.staticDir ?? process.env.STATIC_DIR ?? path.resolve(HERE, '../game/dist'),
    dataDir: opts.dataDir ?? process.env.DATA_DIR ?? path.resolve(HERE, 'data'),
    bots: opts.bots ?? Number(process.env.BOTS ?? 40),
    maxPlayers: opts.maxPlayers ?? Number(process.env.MAX_PLAYERS ?? 600),
    seed: opts.seed ?? Number(process.env.WORLD_SEED ?? 15015),
    graceMs: opts.graceMs ?? 20000, // keep a disconnected character in the world for token resume
    rate: opts.rate ?? { burst: 80, perSec: 40 },
    // 10: events ride along with each client's 10 Hz snapshot frame (<= 1 tick extra latency, ~10 frames/s);
    // 20: flush every tick (lowest latency, more frames/syscalls).
    flushHz: opts.flushHz ?? Number(process.env.FLUSH_HZ ?? 10),
    quiet: opts.quiet ?? false,
    simOpts: opts.simOpts ?? {},
  };
  const log = (...a) => { if (!cfg.quiet) console.log('[aetherion]', ...a); };

  const store = createStore(cfg.dataDir);
  const sim = createSim({ seed: cfg.seed, persistence: store, bots: cfg.bots, ...cfg.simOpts });
  const statics = createStatic(cfg.staticDir);

  // ---------- connection state ----------
  const conns = new Map(); // playerId -> conn
  const outBufs = new Map(); // pid -> string[] pending frames (b.snap: holds a snapshot, b.held: waited one tick)
  const sessions = new Map(); // token -> {pid, conn, dropTimer}
  let nextPid = 0;
  const tickTotal = new Ring(1200);
  const tickCpu = new Ring(1200); // process CPU time per full tick (excludes time preempted by other processes)
  let bytesOut = 0, framesOut = 0, bytesIn = 0, msgsIn = 0, rejected = 0;
  let bwWindow = { t: Date.now(), bytes: 0, rate: 0 };
  const startedAt = Date.now();

  function stats() {
    const s = sim.stats();
    const now = Date.now();
    const humans = conns.size;
    return {
      ok: true, protocol: PROTOCOL_VERSION, uptime: Math.round((now - startedAt) / 1000),
      connections: wss.clients.size, players: s.players, bots: s.bots, mobs: s.mobs, mobsAwake: s.mobsAwake, entities: s.entities,
      tickMs: s.tickMs,
      tickTotalMs: { p50: +tickTotal.pct(0.5).toFixed(3), p99: +tickTotal.pct(0.99).toFixed(3), max: +tickTotal.max().toFixed(3) },
      tickCpuMs: { p50: +tickCpu.pct(0.5).toFixed(3), p99: +tickCpu.pct(0.99).toFixed(3) },
      bandwidth: { outBytesPerSec: Math.round(bwWindow.rate), perClientBytesPerSec: humans ? Math.round(bwWindow.rate / humans) : 0, totalOut: bytesOut, framesOut, totalIn: bytesIn, msgsIn, rejected },
      memory: process.memoryUsage(), load: os.loadavg(), events: s.events, counters: s.counters, persistence: store.stats(),
    };
  }

  // ---------- HTTP ----------
  const server = http.createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/health') {
      const s = sim.stats();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000), players: s.players, bots: s.bots, tickP99: s.tickMs.p99, protocol: PROTOCOL_VERSION }));
      return;
    }
    if (url === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(stats(), null, 1));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      if (await statics.serve(req, res)) return;
    } catch (e) { if (!res.headersSent) res.writeHead(500).end('error'); return; }
    if (!statics.exists() && (url === '/' || url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Aetherion server</title><p>Aetherion server is running. Build the client with <code>cd game && npx vite build</code> to serve it here. WebSocket endpoint: <code>/ws</code>.</p>');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  });

  // ---------- WebSocket ----------
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false, clientTracking: true });
  server.on('upgrade', (req, socket, head) => {
    if ((req.url || '').split('?')[0] !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  function sendRaw(conn, str) {
    const ws = conn.ws;
    if (ws.readyState !== 1) return;
    ws.send(str);
    bytesOut += str.length; bwWindow.bytes += str.length; framesOut++;
  }
  function sendNow(conn, msg) { sendRaw(conn, typeof msg === 'string' ? msg : encode(msg)); }

  function detach(conn, reason) {
    if (!conn.pid) return;
    const pid = conn.pid;
    outBufs.delete(pid);
    conns.delete(pid);
    const sess = sessions.get(conn.token);
    if (sess && sess.conn === conn) {
      sess.conn = null;
      sess.dropTimer = setTimeout(() => {
        sessions.delete(conn.token);
        sim.removePlayer(pid);
        log(`player ${pid} removed (${reason})`);
      }, cfg.graceMs);
    }
    conn.pid = null;
  }

  function join(conn, hello) {
    if (conns.size >= cfg.maxPlayers) { sendNow(conn, { t: 'error', msg: 'server full' }); conn.ws.close(1013, 'full'); return; }
    const tok = typeof hello.token === 'string' ? hello.token : null;
    const sess = tok ? sessions.get(tok) : null;
    if (sess && sim.hasPlayer(sess.pid)) {
      // token resume: re-attach to the live character, replacing any older connection
      if (sess.dropTimer) { clearTimeout(sess.dropTimer); sess.dropTimer = null; }
      if (sess.conn && sess.conn !== conn) { const old = sess.conn; detachQuiet(old); old.ws.close(4001, 'replaced'); }
      sess.conn = conn; conn.pid = sess.pid; conn.token = tok;
      conns.set(sess.pid, conn);
      outBufs.delete(sess.pid);
      const w = sim.resume(sess.pid);
      w.resumed = true;
      sendNow(conn, w);
      log(`player ${sess.pid} resumed`);
      return;
    }
    const pid = `c${(++nextPid).toString(36)}`;
    const welcome = sim.addPlayer(pid, hello);
    conn.pid = pid; conn.token = welcome.token;
    conns.set(pid, conn);
    sessions.set(welcome.token, { pid, conn, dropTimer: null });
    sendNow(conn, welcome);
    log(`player ${pid} joined as ${welcome.you.name} (${welcome.you.oath}/${welcome.you.cls})`);
  }
  function detachQuiet(conn) { if (conn.pid) { conns.delete(conn.pid); conn.pid = null; } }

  wss.on('connection', (ws, req) => {
    const conn = { ws, pid: null, token: null, tokens: cfg.rate.burst, tokT: performance.now(), drops: 0, dropT: Date.now(), queue: [], ip: req.socket.remoteAddress };
    ws.on('message', (data, isBinary) => {
      bytesIn += data.length;
      if (isBinary) { rejected++; return; }
      // per-connection token bucket
      const t = performance.now();
      conn.tokens = Math.min(cfg.rate.burst, conn.tokens + ((t - conn.tokT) / 1000) * cfg.rate.perSec);
      conn.tokT = t;
      if (conn.tokens < 1) {
        rejected++;
        if (Date.now() - conn.dropT > 10000) { conn.drops = 0; conn.dropT = Date.now(); }
        if (++conn.drops > 300) ws.close(1008, 'rate limit');
        return;
      }
      conn.tokens -= 1;
      let m;
      try { m = JSON.parse(data.toString()); } catch { rejected++; sendNow(conn, { t: 'error', msg: 'bad json' }); return; }
      const v = validate(m);
      if (!v) { rejected++; sendNow(conn, { t: 'error', msg: `invalid message${m && typeof m.t === 'string' ? ` (${m.t.slice(0, 16)})` : ''}` }); return; }
      msgsIn++;
      if (!conn.pid) {
        if (v.t === 'hello') join(conn, v);
        else if (v.t === 'ping') sendNow(conn, { t: 'pong', c: v.c, s: sim.serverTime() });
        else sendNow(conn, { t: 'error', msg: 'send hello first' });
        return;
      }
      if (v.t === 'hello') return;
      if (v.t === 'ping') { sendNow(conn, { t: 'pong', c: v.c, s: sim.serverTime() }); return; } // immediate, for accurate RTT
      sim.handle(conn.pid, v);
    });
    ws.on('close', () => detach(conn, 'disconnect'));
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws._aeAlive === false) { ws.terminate(); continue; }
      ws._aeAlive = false;
      ws.ping();
    }
  }, 15000);
  wss.on('connection', (ws) => { ws._aeAlive = true; ws.on('pong', () => { ws._aeAlive = true; }); });

  // ---------- tick loop ----------
  const dt = 1 / TICK_HZ;
  let running = true;
  let next = performance.now();
  function runTick() {
    const t0 = performance.now();
    const c0 = process.cpuUsage();
    const out = sim.tick(dt);
    for (let i = 0; i < out.length; i++) {
      const { to, msg } = out[i];
      const s = encode(msg);
      if (to === '*') { for (const pid of conns.keys()) { let b = outBufs.get(pid); if (!b) outBufs.set(pid, b = []); b.push(s); } }
      else {
        if (!conns.has(to)) continue;
        let b = outBufs.get(to); if (!b) outBufs.set(to, b = []);
        if (msg.t === 'snap') b.snap = true;
        b.push(s);
      }
    }
    const everyTick = cfg.flushHz >= TICK_HZ;
    for (const [pid, b] of outBufs) {
      if (!b.length) continue;
      if (!everyTick && !b.snap && !b.held) { b.held = true; continue; }
      const conn = conns.get(pid);
      if (conn) {
        if (conn.ws.bufferedAmount > 4 * 1024 * 1024) { conn.ws.terminate(); b.length = 0; b.snap = b.held = false; continue; } // client can't keep up: it will resume
        sendRaw(conn, b.length === 1 ? b[0] : `[${b.join(',')}]`);
      }
      b.length = 0; b.snap = false; b.held = false;
    }
    if (outBufs.size > conns.size * 2 + 16) for (const pid of outBufs.keys()) if (!conns.has(pid)) outBufs.delete(pid);
    const nowMs = Date.now();
    if (nowMs - bwWindow.t >= 2000) { bwWindow.rate = (bwWindow.bytes * 1000) / (nowMs - bwWindow.t); bwWindow.bytes = 0; bwWindow.t = nowMs; }
    tickTotal.push(performance.now() - t0);
    const c1 = process.cpuUsage(c0);
    tickCpu.push((c1.user + c1.system) / 1000);
  }
  function loop() {
    if (!running) return;
    try { runTick(); } catch (e) { console.error('[aetherion] tick error', e); }
    next += dt * 1000;
    const now = performance.now();
    if (now - next > 1000) next = now; // fell far behind: don't spiral
    setTimeout(loop, Math.max(0, next - now));
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, resolve);
  });
  const port = server.address().port;
  next = performance.now();
  setTimeout(loop, 0);
  if (statics.exists()) statics.prewarm();
  log(`listening on http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${port}  (ws: /ws, static: ${cfg.staticDir}${statics.exists() ? '' : ' [missing - build the client]'}, bots: ${cfg.bots})`);

  async function close() {
    running = false;
    clearInterval(heartbeat);
    sim.saveAll();
    for (const s of sessions.values()) if (s.dropTimer) clearTimeout(s.dropTimer);
    for (const ws of wss.clients) ws.close(1001, 'server shutting down');
    await new Promise((r) => { wss.close(() => r()); setTimeout(r, 500); });
    await new Promise((r) => server.close(() => r()));
    server.closeAllConnections?.();
    await store.flush();
  }

  return { port, server, sim, close, stats, cfg };
}
