// Persistent player preferences (volumes, controls, display). Quality tier lives in core/quality.js.
const KEY = 'aetherion.settings';
const CHAR_KEY = 'aetherion.character';

export const DEFAULTS = {
  master: 0.8, music: 0.55, sfx: 0.8, ambience: 0.7,
  sensitivity: 1, invertY: false, showFps: false, reduceMotion: false, minimapRotate: false,
};

let cur = { ...DEFAULTS };
try { cur = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch { /* private mode */ }
const subs = new Set();

export const prefs = {
  get: (k) => cur[k],
  all: () => ({ ...cur }),
  set(k, v) {
    cur[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ }
    for (const fn of subs) { try { fn(k, v, cur); } catch (e) { console.warn(e); } }
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

export function loadCharacter() {
  try { const c = JSON.parse(localStorage.getItem(CHAR_KEY) || 'null'); if (c && c.oath && c.cls) return c; } catch { /* ignore */ }
  return null;
}
export function saveCharacter(c) { try { localStorage.setItem(CHAR_KEY, JSON.stringify(c)); } catch { /* ignore */ } }
