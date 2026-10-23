// Networking (agent: server). See game/CONTRACTS.md "net/" and shared/protocol.js.
//
// init(ctx) -> { mode, selfId, connect(character) -> Promise<welcome>, send(msg), rtt, serverTime(),
//                you, entities, welcome, status, disconnect() }
// Bus events: net:welcome (welcome msg), net:snap ({time, timeOfDay, ents: full EntityState[], gone, changed}),
//             net:ev (GameEvent), net:you (PlayerState), net:status ({mode, connected, reconnecting?, transport?}),
//             net:error ({msg}).
//
// Online: WebSocket to ?server=wss://host/ws or same-origin /ws (Vite dev proxies /ws to :8787), JSON frames
// (a frame may carry an array of messages), reconnect with exponential backoff + token resume, ping/RTT and
// server clock sync. Offline (?offline=1, or when the socket can't open within ~2.5 s): shared/sim runs in a
// Web Worker (localServer.js) with identical messages, populated with AI adventurers.
//
// Snapshots on the wire are deltas (protocol.js "Snapshot deltas"); this module re-hydrates them so every
// net:snap carries complete EntityState objects for all entities in the interest radius. Hydrated entity
// objects are stable (mutated in place across snapshots) until the entity appears in `gone`.
import { PROTOCOL_VERSION } from '@shared/protocol.js';
import { createLocalServer } from './localServer.js';
import { createSocialStore } from './social.js';

const CONNECT_TIMEOUT_MS = 2500;
const SOCIAL_EV = new Set(['invite', 'party', 'duel', 'pvp', 'warzone', 'honor', 'trade']);
const PING_MS = 2000;
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } },
};

export async function init(ctx) {
  const { bus } = ctx;
  const params = ctx.params ?? new URLSearchParams(globalThis.location?.search ?? '');
  const forceOffline = params.get('offline') === '1' || globalThis.location?.protocol === 'file:';

  const state = {
    mode: forceOffline ? 'offline' : 'online',
    selfId: null, rtt: 0, offset: 0, offsetSamples: 0, connected: false,
    you: null, welcome: null, transport: null, paused: false, localTime: null, localStamp: 0,
  };
  const ents = new Map();
  // parties / duels / trades / PvP flag mirror (social fields on entities - pvp, party, duel - merge like any other delta)
  const social = createSocialStore(bus, { selfId: () => state.selfId, entities: () => ents });
  let character = null;
  let ws = null;
  let local = null;
  let token = null;
  let closedByUs = false;
  let reconnectTimer = null;
  let attempts = 0;
  let pingTimer = null;
  let welcomeWaiter = null;

  const tokenKey = () => `aeth.tok.${state.mode}.${state.mode === 'online' ? serverUrl() : 'local'}.${character?.name}|${character?.oath}|${character?.cls}`;

  function status(extra = {}) {
    bus.emit('net:status', { mode: state.mode, connected: state.connected, transport: state.transport, ...extra });
  }

  // ---------- inbound ----------
  function hydrate(snap) {
    const changed = [];
    for (const id of snap.gone) ents.delete(id);
    for (const e of snap.ents) {
      let cur = ents.get(e.id);
      if (e.k) {
        // full state (new to this client): replace
        if (cur) { for (const key in cur) if (!(key in e)) delete cur[key]; Object.assign(cur, e); } else { cur = { ...e }; ents.set(e.id, cur); }
      } else if (cur) Object.assign(cur, e);
      else continue; // delta for an unknown entity (should not happen) - ignore
      changed.push(e.id);
    }
    bus.emit('net:snap', { time: snap.time, timeOfDay: snap.timeOfDay, ents: [...ents.values()], gone: snap.gone, changed });
  }

  function onMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (!state.welcome && m.t !== 'welcome' && m.t !== 'pong' && m.t !== 'error') return; // pre-join broadcasts
    switch (m.t) {
      case 'snap':
        if (state.mode === 'offline') { state.localTime = m.time; state.localStamp = performance.now(); }
        hydrate(m); break;
      case '__paused':
        state.localTime = m.time; state.localStamp = performance.now();
        break;
      case 'ev': if (m.e && SOCIAL_EV.has(m.e.type)) { try { social.onEvent(m.e); } catch (err) { console.warn('[net] social', err); } } bus.emit('net:ev', m.e); break;
      case 'you': {
        // partial updates omit unchanged inventory/equipment/quests/discovered: merge into the full state
        const y = m.you;
        if (y.partial && state.you) { delete y.partial; state.you = Object.assign({}, state.you, y); } else { delete y.partial; state.you = y; }
        social.onYou(state.you);
        bus.emit('net:you', state.you);
        break;
      }
      case 'welcome': {
        if (state.mode === 'offline') { state.localTime = m.serverTime; state.localStamp = performance.now(); }
        state.selfId = m.id; state.welcome = m; state.you = m.you; token = m.token;
        LS.set(tokenKey(), m.token);
        ents.clear();
        social.onWelcome(m);
        syncClock(m.serverTime, 0);
        attempts = 0;
        state.connected = true;
        bus.emit('net:welcome', m);
        bus.emit('net:you', m.you);
        status();
        if (welcomeWaiter) { welcomeWaiter.resolve(m); welcomeWaiter = null; }
        break;
      }
      case 'pong': {
        const rtt = Math.max(0, performance.now() - m.c);
        state.rtt = state.rtt ? state.rtt * 0.8 + rtt * 0.2 : rtt;
        syncClock(m.s, rtt);
        break;
      }
      case 'error': console.warn('[net] server error:', m.msg); bus.emit('net:error', m); break;
      case '__save': LS.set(`aeth.save.${m.token}`, JSON.stringify(m.data)); break;
      case '__ready': break;
      default: break;
    }
  }

  function syncClock(serverMs, rtt) {
    const sample = serverMs + rtt / 2 - Date.now();
    state.offset = state.offsetSamples++ < 3 ? sample : state.offset * 0.9 + sample * 0.1;
  }

  function onFrame(data) {
    let m;
    try { m = typeof data === 'string' ? JSON.parse(data) : data; } catch { return; }
    if (Array.isArray(m)) for (const x of m) onMessage(x); else onMessage(m);
  }

  // ---------- transports ----------
  function serverUrl() {
    const p = params.get('server');
    if (p) return p.replace(/^http(s?):\/\//, 'ws$1://');
    const loc = globalThis.location;
    return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
  }

  function hello() {
    const msg = { t: 'hello', name: character.name, oath: character.oath, cls: character.cls, v: PROTOCOL_VERSION };
    token = token ?? LS.get(tokenKey());
    if (token) msg.token = token;
    if (state.mode === 'offline') {
      const sp = params.get('spawn');
      if (sp) { const [x, z] = sp.split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(z)) msg.spawn = { x, z }; }
      if (token) { try { const s = LS.get(`aeth.save.${token}`); if (s) msg.__saved = JSON.parse(s); } catch { /* corrupt save */ } }
    }
    return msg;
  }

  function openSocket(timeoutMs) {
    return new Promise((resolve, reject) => {
      let sock;
      try { sock = new WebSocket(serverUrl()); } catch (e) { reject(e); return; }
      // The timeout is measured in main-thread availability: if the page was blocked (world generation) the
      // timer fires late and we re-arm instead of declaring the server unreachable; an already-open socket wins.
      let to;
      const arm = (ms) => {
        const due = performance.now() + ms;
        to = setTimeout(() => {
          if (sock.readyState === 1) { resolve(sock); return; }
          if (sock.readyState === 0 && performance.now() - due > 500) { arm(1000); return; }
          try { sock.close(); } catch { /* ignore */ }
          reject(new Error('connect timeout'));
        }, ms);
      };
      arm(timeoutMs);
      sock.onopen = () => { clearTimeout(to); resolve(sock); };
      sock.onerror = () => { clearTimeout(to); reject(new Error('socket error')); };
      sock.onclose = () => { clearTimeout(to); reject(new Error('socket closed')); };
    });
  }

  function attachSocket(sock) {
    ws = sock;
    state.transport = 'websocket';
    sock.onmessage = (ev) => onFrame(ev.data);
    sock.onerror = () => {};
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      ws = null;
      state.connected = false;
      if (closedByUs) { status(); return; }
      status({ reconnecting: true, code: ev.code });
      scheduleReconnect();
    };
    sock.send(JSON.stringify(hello()));
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    const delay = Math.min(10000, 500 * 2 ** attempts) * (0.75 + Math.random() * 0.5);
    attempts++;
    reconnectTimer = setTimeout(async () => {
      try { attachSocket(await openSocket(4000)); } catch { scheduleReconnect(); }
    }, delay);
  }

  // The transport is warmed up during init (before character selection) so connect() is fast:
  // the offline world takes a moment to generate, and the WebSocket probe decides online vs offline.
  let localPromise = null;
  function warmOffline() {
    if (!localPromise) {
      const bots = Number(params.get('bots') ?? 30);
      localPromise = createLocalServer({ seed: Number(params.get('seed') ?? 15015), bots: Number.isFinite(bots) ? bots : 30, onBatch: (batch) => { for (const m of batch) onMessage(m); } });
      localPromise.catch(() => {});
    }
    return localPromise;
  }
  let probe = null;
  if (forceOffline) warmOffline();
  else {
    probe = openSocket(CONNECT_TIMEOUT_MS);
    probe.catch((e) => { console.info(`[net] no game server at ${serverUrl()} (${e.message}); preparing offline world`); warmOffline(); });
  }

  async function startOffline() {
    state.mode = 'offline';
    local = await warmOffline();
    state.transport = local.kind;
    token = null;
    local.send(hello());
  }

  function startPing() {
    clearInterval(pingTimer);
    const ping = () => api.send({ t: 'ping', c: performance.now() });
    ping();
    pingTimer = setInterval(ping, PING_MS);
  }

  // ---------- API ----------
  const api = {
    get mode() { return state.mode; },
    get selfId() { return state.selfId; },
    get rtt() { return state.rtt; },
    get connected() { return state.connected; },
    get you() { return state.you; },
    get welcome() { return state.welcome; },
    get entities() { return ents; },
    get transport() { return state.transport; },
    get paused() { return state.paused; },
    setPaused(value) {
      const next = state.mode === 'offline' && !!value && !!local;
      if (next === state.paused) return;
      state.localTime = api.serverTime(); state.localStamp = performance.now();
      state.paused = next;
      local?.send({ t: '__pause', paused: next });
      bus.emit('game:paused', { paused: next, mode: state.mode });
    },
    serverTime: () => state.mode === 'offline' && state.localTime !== null
      ? state.localTime + (state.paused ? 0 : performance.now() - state.localStamp)
      : Date.now() + state.offset,
    /** Social state mirror (see net/social.js): party, invites, duel, trade, pvp flag, war zones. */
    social,
    /** 'self'|'party'|'duel'|'hostile'|'neutral' for players, null otherwise. */
    relation: (id) => social.relation(id),
    /** True when the local player may damage this player (hostile flag pair outside sanctuaries, or live duel opponent). */
    canAttack: (id) => social.canAttack(id),

    async connect(ch) {
      character = { name: ch?.name ?? 'Wanderer', oath: ch?.oath ?? 'oath-09', cls: ch?.cls ?? 'ninja' };
      closedByUs = false;
      const welcome = new Promise((resolve, reject) => { welcomeWaiter = { resolve, reject }; });
      if (state.mode === 'online') {
        try {
          let sock = await probe;
          if (sock.readyState !== 1) sock = await openSocket(CONNECT_TIMEOUT_MS); // probe went stale during character selection
          sock.onclose = null; sock.onerror = null;
          attachSocket(sock);
          // a server that accepts the socket but never welcomes us also falls back to offline
          let t;
          const arm = (ms) => {
            const due = performance.now() + ms;
            t = setTimeout(() => {
              if (state.welcome || ws !== sock) return;
              if (performance.now() - due > 500) { arm(1500); return; } // page was busy: the welcome may be queued
              closedByUs = true; try { sock.close(); } catch { /* ignore */ } closedByUs = false; ws = null;
              startOffline().catch((e) => welcomeWaiter?.reject(e));
            }, ms);
          };
          arm(10000);
          welcome.finally(() => clearTimeout(t));
        } catch (e) {
          await startOffline();
        }
      } else {
        await startOffline();
      }
      status();
      const w = await welcome;
      startPing();
      return w;
    },

    send(msg) {
      if (state.paused && msg.t !== 'ping') return false;
      if (local) { local.send(msg); return true; }
      if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; }
      return false;
    },

    disconnect() {
      closedByUs = true;
      clearInterval(pingTimer); clearTimeout(reconnectTimer);
      if (ws) { try { ws.close(1000, 'bye'); } catch { /* ignore */ } ws = null; }
      if (local) { local.close(); local = null; }
      state.connected = false;
      status();
    },
  };

  return api;
}
