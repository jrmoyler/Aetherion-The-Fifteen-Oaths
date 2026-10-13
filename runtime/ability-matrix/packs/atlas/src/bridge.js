import { NEW_PRESETS } from '../../../presets/new/catalog.js';

const PACK = 'atlas';
const FORMAT = 'collective-ability-preset@1';
const LIMITS = { radius: [.5, 8], power: [.1, 4], duration: [1.5, 15], seed: [0, 4294967295] };
const clone = (value) => JSON.parse(JSON.stringify(value));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Validate atomically rather than letting the runtime silently clamp editor input. */
export function validateSettings(id, patch) {
  if (!object(patch)) return null;
  let block = patch;
  if (Object.hasOwn(patch, 'settings')) {
    // Support both matrix-export envelopes and the generated catalog/library files.
    const envelopeKeys = ['format', 'pack', 'id', 'uid', 'meta', 'settings', 'shared', 'slot', 'kind',
      'label', 'hint', 'key', 'accent', 'cast', 'castAnim', 'cooldown', 'range', 'minRange', 'zoneRadius', 'controls', 'status'];
    if (Object.keys(patch).some((key) => !envelopeKeys.includes(key))) return null;
    if (patch.id !== undefined && patch.id !== id) return null;
    if (patch.uid !== undefined && patch.uid !== `${PACK}/${id}`) return null;
    if (patch.pack !== undefined && patch.pack !== PACK) return null;
    if (patch.format !== undefined && patch.format !== FORMAT) return null;
    if (patch.meta?.id !== undefined && patch.meta.id !== id) return null;
    block = patch.settings;
  }
  if (!object(block) || !Object.keys(block).length) return null;
  const result = {};
  for (const [key, value] of Object.entries(block)) {
    if (key === 'color') {
      if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) return null;
      result.color = value.toLowerCase();
    } else {
      const limits = Object.hasOwn(LIMITS, key) ? LIMITS[key] : null;
      if (!limits || typeof value !== 'number' || !Number.isFinite(value)
        || value < limits[0] || value > limits[1] || (key === 'seed' && !Number.isInteger(value))) return null;
      result[key] = value;
    }
  }
  return result;
}

/** No DOM, timers, or renderer: auto-cast advances only with the simulation clock. */
export function createAtlasController({ runtime, getCastOptions = () => ({}), onReset = () => {},
  onState = () => {}, onEditor = () => {}, post = () => {} }) {
  const defaults = Object.fromEntries(NEW_PRESETS.map((item) => [item.id, { ...item.defaults, color: item.color }]));
  const settings = clone(defaults);
  let selectedId = NEW_PRESETS[0].id, armed = false, paused = false, editorVisible = false;
  let autoState = null, castCount = 0, disposed = false;
  const requireId = (id) => {
    if (disposed) throw new Error('Atlas preview has been disposed');
    if (!Object.hasOwn(settings, id)) throw new RangeError(`Unknown Atlas ability: ${id}`);
  };
  const state = () => ({ selectedId, armed, paused, editorVisible, autoId: autoState?.id ?? null, castCount, disposed });
  const changed = () => onState(state());
  const describe = (id) => {
    requireId(id);
    const item = NEW_PRESETS.find((entry) => entry.id === id);
    return { id, slot: NEW_PRESETS.indexOf(item), label: item.name, hint: item.description,
      key: '', accent: settings[id].color, cast: 'point', castAnim: null,
      cooldown: null, range: 16, minRange: 0, zoneRadius: settings[id].radius };
  };
  const stopAuto = () => { autoState = null; changed(); };
  function performCast(id, options = {}) {
    runtime.clear();
    onReset();
    const context = { ...getCastOptions(id) };
    for (const key of ['origin', 'target', 'targets']) if (options[key] !== undefined) context[key] = options[key];
    runtime.cast(id, { ...context, ...settings[id] });
    selectedId = id;
    armed = false;
    castCount++;
    post({ matrix: 'cast', id, fired: true, count: castCount });
    changed();
    return true;
  }
  const api = {
    pack: PACK,
    list: () => ({ abilities: NEW_PRESETS.map((item) => describe(item.id)), extras: [] }),
    arm(id) {
      requireId(id);
      autoState = null;
      runtime.clear();
      onReset();
      selectedId = id;
      armed = true;
      changed();
    },
    cast(id = selectedId, options = {}) {
      requireId(id);
      autoState = null;
      // An explicit manual cast resumes playback; paused auto-cast never does.
      paused = false;
      return performCast(id, options);
    },
    auto(id = selectedId, seconds = 5) {
      requireId(id);
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3600)
        throw new RangeError('Auto-cast interval must be between 0 and 3600 seconds');
      selectedId = id;
      armed = false;
      autoState = { id, seconds, remaining: 0 };
      if (!paused) { performCast(id); autoState.remaining = Math.max(seconds, settings[id].duration); }
      changed();
    },
    stopAuto,
    clear() {
      if (disposed) return;
      autoState = null;
      armed = false;
      runtime.clear();
      onReset();
      changed();
    },
    setPaused(value) { if (!disposed) { paused = Boolean(value); changed(); } },
    setEditor(value) {
      if (disposed) return;
      editorVisible = Boolean(value);
      onEditor(editorVisible);
      changed();
    },
    action(name, slot) {
      if (disposed) return false;
      if (name === 'togglePause') api.setPaused(!paused);
      else if (name === 'toggleEditor') api.setEditor(!editorVisible);
      else if (name === 'resetDummies') api.clear();
      else if (name === 'ability' && NEW_PRESETS[slot]) api.arm(NEW_PRESETS[slot].id);
      else return false;
      return true;
    },
    preset(id = selectedId) {
      requireId(id);
      return { format: FORMAT, pack: PACK, id, meta: describe(id), settings: clone(settings[id]), shared: {} };
    },
    applyPreset(id, patch) {
      if (disposed || !Object.hasOwn(settings, id)) return false;
      const validated = validateSettings(id, patch);
      if (!validated) return false;
      settings[id] = { ...settings[id], ...validated };
      changed();
      return true;
    },
    resetPreset(id = selectedId) {
      if (disposed || !Object.hasOwn(settings, id)) return false;
      settings[id] = clone(defaults[id]);
      changed();
      return true;
    },
    allPresets: () => Object.fromEntries(NEW_PRESETS.map(({ id }) => [id, api.preset(id)])),
    update(dt) {
      if (disposed) return;
      if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new TypeError('Expected nonnegative finite seconds');
      if (paused || dt === 0) return;
      runtime.update(dt);
      if (autoState) {
        autoState.remaining -= dt;
        if (autoState.remaining <= 0) {
          const current = autoState;
          performCast(current.id);
          // One preview per frame; a background tab must not cause a burst of casts.
          current.remaining = Math.max(current.seconds, settings[current.id].duration);
        }
      }
    },
    dispose() {
      if (disposed) return;
      autoState = null;
      armed = false;
      disposed = true;
      runtime.dispose();
      changed();
    },
    get state() { return state(); },
    get castCount() { return castCount; }
  };
  return api;
}

/** Complete the parent handshake even when WebGL initialization fails. */
export function installAtlasFailureBridge({ window: win = window, message }) {
  const parent = win.parent, origin = win.location.origin;
  const trusted = parent && parent !== win && origin && origin !== 'null';
  const post = (data) => { if (trusted) parent.postMessage({ ...data, pack: PACK }, origin); };
  const fail = () => { throw new Error(message); };
  const unavailable = { available: false, error: message, abilities: [], extras: [] };
  const api = { pack: PACK, available: false, cast: fail, arm: fail, auto: fail, action: fail,
    clear: fail, preset: fail, applyPreset: fail, resetPreset: fail, allPresets: fail, list: () => ({ ...unavailable }) };
  const listener = (event) => {
    if (!trusted || event.source !== parent || event.origin !== origin || !object(event.data)
      || typeof event.data.matrix !== 'string') return;
    if (event.data.matrix === 'list') post({ matrix: 'list', ...unavailable });
    else post({ matrix: 'error', message });
  };
  win.addEventListener('message', listener);
  win.matrix = api;
  api.dispose = () => {
    win.removeEventListener('message', listener);
    if (win.matrix === api) delete win.matrix;
  };
  post({ matrix: 'ready', ...unavailable });
  post({ matrix: 'error', message });
  return api;
}

/** Only the containing, same-origin matrix can drive the embedded preview. */
export function installAtlasBridge({ window: win = window, ...options }) {
  const parent = win.parent;
  const origin = win.location.origin;
  const embedded = parent && parent !== win;
  const trustedOrigin = origin && origin !== 'null';
  const post = (message) => {
    if (embedded && trustedOrigin) parent.postMessage({ ...message, pack: PACK }, origin);
  };
  const api = createAtlasController({ ...options, post });
  const message = (event) => {
    if (!embedded || !trustedOrigin || event.source !== parent || event.origin !== origin) return;
    const data = event.data;
    if (!object(data) || typeof data.matrix !== 'string') return;
    try {
      switch (data.matrix) {
        case 'list': post({ matrix: 'list', ...api.list() }); break;
        case 'arm': api.arm(data.id); break;
        case 'cast': api.cast(data.id); break;
        case 'auto': api.auto(data.id, data.seconds); break;
        case 'stop': api.stopAuto(); break;
        case 'clear': api.clear(); break;
        case 'pause': api.setPaused(data.paused ?? !api.state.paused); break;
        case 'editor': api.setEditor(data.visible ?? !api.state.editorVisible); break;
        case 'action': api.action(data.action, data.slot); break;
        case 'getPreset': post({ matrix: 'preset', id: data.id, preset: api.preset(data.id) }); break;
        case 'getAllPresets': post({ matrix: 'allPresets', presets: api.allPresets() }); break;
        case 'applyPreset': post({ matrix: 'applied', id: data.id, ok: api.applyPreset(data.id, data.preset) }); break;
        case 'resetPreset': post({ matrix: 'applied', id: data.id, ok: api.resetPreset(data.id) }); break;
        default: break;
      }
    } catch (error) { post({ matrix: 'error', message: error.message }); }
  };
  win.addEventListener('message', message);
  win.matrix = api;
  const dispose = api.dispose;
  api.dispose = () => {
    win.removeEventListener('message', message);
    if (win.matrix === api) delete win.matrix;
    dispose();
  };
  const params = new URLSearchParams(win.location.search);
  const id = params.get('ability');
  try {
    if (id) api.arm(id);
    if (params.has('auto')) api.auto(id || api.state.selectedId, Number(params.get('auto')));
    else if (params.get('cast') === '1') api.cast(id || api.state.selectedId);
  } catch (error) { post({ matrix: 'error', message: error.message }); }
  post({ matrix: 'ready', ...api.list() });
  return api;
}
