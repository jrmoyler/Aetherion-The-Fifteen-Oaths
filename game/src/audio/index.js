// Procedural audio (no sample files): ambient beds per biome, modal music per Oath,
// UI clicks, element spell casts / impacts and footsteps — all driven by bus events.
// Created by the UI module; unlocks on the first user gesture.
import { createEngine } from './engine.js';
import { createAmbience } from './ambience.js';
import { createMusic } from './music.js';
import { createSfx } from './sfx.js';
import { OATH_BY_ID, SANCTUARY } from '@shared/oaths.js';
import { hotbarFor, ABILITY_BY_ID } from '@shared/abilities.js';

const SURFACE = { glacial: 'snow', coast: 'sand', marsh: 'water', alpine: 'stone', canyon: 'stone', badlands: 'sand', plateau: 'stone', industrial: 'stone', terraces: 'stone' };

/** opts.listener() -> {x, z, heading}; opts.isSelf(id); opts.actorPos(id); opts.character() */
export function createAudio(ctx, opts = {}) {
  const E = createEngine();
  const amb = createAmbience(E);
  const music = createMusic(E);
  const sfx = createSfx(E);
  let scene = 'title';
  let region = null;
  let started = false;

  const startAll = () => {
    if (started || !E.ready) return;
    started = true;
    music.start();
    if (scene === 'title') { amb.setBiome('title'); music.setProfile('title'); } else if (region) applyRegion(region);
  };
  const unlock = () => { if (E.unlock()) startAll(); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!E.ac) return; if (document.hidden) E.ac.suspend?.(); else E.ac.resume?.(); });

  function applyRegion(oathId) {
    region = oathId;
    if (!E.ready || scene !== 'game') return;
    const o = OATH_BY_ID[oathId]; if (!o) return;
    amb.setBiome(o.biome); music.setProfile(oathId);
  }

  // ---- bus wiring
  const bus = ctx.bus;
  const lastLocalCast = { t: 0 };
  bus.on('player:region', (p) => { const id = typeof p?.oath === 'string' ? p.oath : p?.oath?.id; if (id) applyRegion(id); });
  bus.on('game:start', (c) => { scene = 'game'; if (!region && c?.oath) region = c.oath; applyRegion(region); });

  const elementOfSlot = (slot) => {
    const c = opts.character?.(); if (!c) return null;
    try { const a = (ctx.combat?.hotbar?.length ? ctx.combat.hotbar : hotbarFor(c.oath, c.cls))[slot]; return a?.element || `basic_${c.cls}`; } catch { return null; }
  };
  bus.on('combat:cast', (p) => {
    const el = elementOfSlot(Number(p?.slot)); if (!el) return;
    lastLocalCast.t = performance.now();
    sfx.cast(el, null, null, Number(p?.slot) === 5 ? 1.5 : 1);
  });
  bus.on('net:ev', (p) => {
    const e = p?.e ?? p; if (!e?.type) return;
    const L = opts.listener?.();
    if (e.type === 'cast') {
      if (opts.isSelf?.(e.src) && performance.now() - lastLocalCast.t < 600) return;
      const a = ABILITY_BY_ID[e.ability];
      const pos = opts.actorPos?.(e.src) || (e.aim ? { x: e.aim.x, z: e.aim.z } : null);
      sfx.cast(a?.element || 'arcane', pos, L, 0.8);
    } else if (e.type === 'hit') {
      const pos = Number.isFinite(e.x) ? { x: e.x, z: e.z } : opts.actorPos?.(e.dst);
      sfx.impact(e.element || ABILITY_BY_ID[e.ability]?.element, pos, L, !!e.crit);
    }
  });

  // footsteps from player:moved cadence
  let last = null, acc = 0, lastT = 0;
  bus.on('player:moved', (p) => {
    if (!p || !Number.isFinite(p.x)) return;
    const now = performance.now();
    if (last) {
      const dt = Math.max(0.001, (now - lastT) / 1000);
      const d = Math.hypot(p.x - last.x, p.z - last.z); const dy = Math.abs((p.y ?? 0) - (last.y ?? 0));
      const speed = d / dt;
      if (speed > 18 || dt > 0.6) acc = 0; // teleport / stall
      else if (dy / dt < 4) { // grounded-ish
        acc += d;
        const stride = speed > 7 ? 2.4 : speed > 4.5 ? 2.0 : 1.5;
        if (acc >= stride) { acc = 0; sfx.footstep(surfaceAt(p), Math.min(1.5, speed / 6)); }
      }
    }
    last = { x: p.x, y: p.y, z: p.z }; lastT = now;
  });
  function surfaceAt(p) {
    const o = OATH_BY_ID[region]; if (!o) return 'earth';
    if (Math.hypot(p.x - o.center[0], p.z - o.center[1]) < SANCTUARY.cityRadius) return 'stone';
    try { if (ctx.world?.isWater?.(p.x, p.z)) return 'water'; } catch { /* ignore */ }
    return SURFACE[o.biome] || 'earth';
  }
  bus.on('weather', (w) => amb.setWeather(w?.kind, w?.intensity));

  return {
    unlock,
    ui: (name) => sfx.ui(name),
    setVolumes: (v) => E.setVolumes(v),
    setScene(s) { scene = s; if (!E.ready) return; if (s === 'title') { amb.setBiome('title'); music.setProfile('title'); } else applyRegion(region); },
    setRegion: applyRegion,
    setWeather: (k, i) => amb.setWeather(k, i),
    cast: (el, pos) => sfx.cast(el, pos, opts.listener?.()),
    impact: (el, pos, crit) => sfx.impact(el, pos, opts.listener?.(), crit),
    get context() { return E.ac; },
  };
}

/** Standalone init(ctx) for symmetry with other modules (the UI normally creates audio itself). */
export async function init(ctx) {
  try { return createAudio(ctx); } catch (err) { console.warn('[audio] init failed', err); return { unlock() {}, ui() {}, setVolumes() {}, setScene() {}, setRegion() {}, setWeather() {}, cast() {}, impact() {} }; }
}
