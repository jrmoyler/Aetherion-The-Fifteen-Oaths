// Runs the authoritative shared/sim locally (offline mode) for exactly one human client.
// Used by simWorker.js (preferred, off the main thread) and by localServer.js as an in-thread
// fallback. Messages are identical to the online server's.
import { createSim } from '../../../shared/sim/index.js';
import { TICK_HZ } from '../../../shared/protocol.js';

export const LOCAL_PLAYER_ID = 'c1';
const MENU_MESSAGES = new Set(['loadout', 'equip', 'unequip']);

/** emit(batch: object[]) receives every server->client message for the local player. */
export function createHost({ seed = 15015, bots = 30, emit }) {
  const pid = LOCAL_PLAYER_ID;
  const sim = createSim({
    seed, bots, allowSpawnParam: true, firstEventMs: 75000,
    persistence: { load: () => null, save: (token, data) => emit([{ t: '__save', token, data }]) },
  });
  const dt = 1 / TICK_HZ;
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  let next = now();
  let running = true;
  let paused = false;
  let saveAt = now() + 15000;
  let timer = null;

  function loop() {
    if (!running) return;
    try {
      const out = paused ? [] : sim.tick(dt);
      let batch = null;
      for (let i = 0; i < out.length; i++) {
        const o = out[i];
        if (o.to === pid || o.to === '*') (batch ??= []).push(o.msg);
      }
      if (batch) emit(batch);
      if (now() >= saveAt) { saveAt = now() + 15000; sim.saveAll(); }
    } catch (e) {
      console.error('[net/local] tick failed', e);
    }
    next += dt * 1000;
    const t = now();
    if (t - next > 1000) next = t; // tab was throttled: skip ahead instead of spiralling
    timer = setTimeout(loop, Math.max(0, next - t));
  }
  timer = setTimeout(loop, 0);

  function receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === '__pause') {
      paused = !!msg.paused;
      emit([{ t: '__paused', paused, time: sim.serverTime() }]);
      return;
    }
    // Pausing must not let queued movement, casts or item use resolve. Managing what you carry is different:
    // the character window is what pauses the offline world, so loadout and gear changes made inside it have
    // to be answered while time stands still, or the window could never change anything.
    if (paused && MENU_MESSAGES.has(msg.t)) {
      sim.handle(pid, msg);
      const state = sim._S, player = state.players?.get?.(pid);
      const replies = state.out.filter((o) => o.to === pid).map((o) => o.msg);
      state.out = state.out.filter((o) => o.to !== pid);
      // Gear changes mark the player dirty for the next tick; there is no next tick while paused.
      if (player && !replies.some((m) => m.t === 'you')) { player.youDirty = false; replies.push({ t: 'you', you: state.youState(player) }); }
      if (replies.length) emit(replies);
      return;
    }
    if (paused && msg.t !== 'ping') return;
    if (msg.t === 'hello') {
      const saved = msg.__saved ?? null;
      delete msg.__saved;
      const w = sim.hasPlayer(pid) ? sim.resume(pid) : sim.addPlayer(pid, msg, saved);
      emit([w]);
      return;
    }
    sim.handle(pid, msg);
  }

  function stop() { running = false; clearTimeout(timer); try { sim.saveAll(); } catch { /* ignore */ } }

  return { receive, stop, sim, get paused() { return paused; } };
}
