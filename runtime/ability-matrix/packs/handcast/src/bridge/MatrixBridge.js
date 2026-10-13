/**
 * Ability Matrix bridge.
 *
 * The one file the matrix adds to a pack. It never touches ability code: it
 * drives the app through the same seams a player does — `input.emit('action')`
 * for key presses, `aim.point()` + `aim.confirm()` for the mouse — and reads and
 * writes presets through the pack's own `applySettings`.
 *
 * Control it three ways:
 *   URL      ?ability=<id>          arm that ability on load
 *            &auto=<seconds>        recast it on a loop (waits out cooldowns)
 *            &extra=<action>        fire a non-slot action on load (e.g. boost)
 *            &hud=0                 hide the pack's own HUD/help
 *   window   window.matrix.cast('ward') …
 *   message  parent.postMessage-style: { matrix: 'cast', id: 'ward' }
 */
import { Raycaster, Plane, Vector2, Vector3 } from 'three';
import * as config from '../config/settings.js';

const { settings, ELEMENTS, ELEMENT_META, DEFAULT_SETTINGS, applySettings } = config;
const castShapeOf = config.castShapeOf ?? ((id) => ELEMENT_META[id]?.cast ?? 'line');

/**
 * Hosted builds (the published matrix) can only serve web media types, so the
 * staging script renames binary assets to `<file>.<suffix>` and the matrix
 * passes `?bin=<suffix>`. Every three.js loader goes through `fetch`, so one
 * rewrite here covers them all. Without the parameter nothing changes.
 */
const BIN_SUFFIX = new URLSearchParams(location.search).get('bin');
if (BIN_SUFFIX && /^[a-z0-9]+$/.test(BIN_SUFFIX)) {
  const nativeFetch = window.fetch.bind(window);
  const BINARY = /\.(fbx|glb|hdr|task)(?=$|[?#])/i;
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (BINARY.test(url)) {
      const moved = url.replace(BINARY, (ext) => `${ext}.${BIN_SUFFIX}`);
      // three's FileLoader hands fetch a Request; carry its headers/credentials over.
      input = input instanceof Request ? new Request(moved, input) : moved;
    }
    return nativeFetch(input, init);
  };
}

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Non-slot actions each pack understands, discovered from its own App source
 * at build time would be nicer — this list is read from the five InputManagers.
 */
const EXTRA_ACTIONS = {
  boost: { label: 'Electric Boost', key: 'B', settingsKey: 'boost', meta: 'BOOST_META' },
  magic: { label: 'Magic Boost', key: 'M', settingsKey: 'magic', meta: 'MAGIC_META' },
  fire: { label: 'Fire Boost', key: 'K', settingsKey: 'fire', meta: 'FIRE_META' }
};

export function installMatrixBridge(app, packId) {
  const params = new URLSearchParams(location.search);
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const flat = new Vector3();
  const target = new Vector3();
  let autoTimer = null;
  let autoId = null;
  let castCount = 0;

  const post = (message) => {
    if (window.parent && window.parent !== window) window.parent.postMessage({ ...message, pack: packId }, '*');
  };

  const extras = Object.entries(EXTRA_ACTIONS)
    .filter(([, extra]) => settings[extra.settingsKey] && config[extra.meta])
    .map(([action, extra]) => ({ action, label: config[extra.meta]?.label ?? extra.label, key: extra.key }));

  function describe(id) {
    const meta = ELEMENT_META[id] ?? {};
    const block = settings[id] ?? {};
    return {
      id,
      slot: ELEMENTS.indexOf(id),
      label: meta.label ?? id,
      hint: meta.hint ?? '',
      key: meta.key ?? '',
      accent: meta.accent ?? '#ffffff',
      cast: castShapeOf(id),
      castAnim: block.castAnim ?? null,
      cooldown: block.cooldown ?? null,
      range: block.range ?? null,
      minRange: block.minRange ?? null,
      zoneRadius: block.zoneRadius ?? null
    };
  }

  function list() {
    return { abilities: ELEMENTS.map(describe), extras };
  }

  /** Where a "sensible" aim lands: up-screen of the caster, 70% into its reach. */
  function aimPoint(id, fraction = 0.7) {
    const block = settings[id] ?? {};
    const origin = app.aim.origin;
    raycaster.setFromCamera(ndc.set(0, 0.25), app.camera);
    if (raycaster.ray.intersectPlane(GROUND, hit)) flat.copy(hit).sub(origin);
    else app.camera.getWorldDirection(flat);
    flat.y = 0;
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    const min = block.minRange ?? 0.5;
    const max = block.range ?? min + 6;
    const distance = min + (max - min) * fraction;
    target.copy(origin).addScaledVector(flat, distance);
    target.y = 0;
    return target.clone().project(app.camera);
  }

  function arm(id) {
    if (!ELEMENTS.includes(id)) throw new Error(`Unknown ability "${id}" in ${packId}`);
    if (castShapeOf(id) === 'summon') return; // a summon's slot press *is* the cast
    if (app.aim.isArmed && app.element === id) return;
    app.input.emit('action', 'ability', ELEMENTS.indexOf(id));
  }

  async function cast(id, options = {}) {
    if (!ELEMENTS.includes(id)) throw new Error(`Unknown ability "${id}" in ${packId}`);
    if (castShapeOf(id) === 'summon') {
      app.input.emit('action', 'ability', ELEMENTS.indexOf(id));
      post({ matrix: 'cast', id, summon: true });
      return true;
    }
    // Wait out a cooldown rather than letting the pack toast "Not ready".
    for (let i = 0; i < 600 && (app.cooldowns?.get(id) ?? 0) > 0; i++) await wait(50);
    if (app.paused) app.input.emit('action', 'togglePause');
    arm(id);
    await frame();
    const point = aimPoint(id, options.fraction ?? 0.7);
    app.aim.point(new Vector2(point.x, point.y));
    await frame();
    await frame();
    app.aim.point(new Vector2(point.x, point.y));
    await frame();
    const fired = app.aim.confirm();
    if (fired) castCount += 1;
    post({ matrix: 'cast', id, fired, count: castCount });
    return fired;
  }

  function stopAuto() {
    clearTimeout(autoTimer);
    autoTimer = null;
    autoId = null;
  }

  function auto(id, seconds = 4) {
    stopAuto();
    autoId = id;
    const loop = async () => {
      if (autoId !== id) return;
      try {
        await cast(id);
      } catch (error) {
        post({ matrix: 'error', message: String(error?.message ?? error) });
      }
      const cooldown = settings[id]?.cooldown ?? 0;
      autoTimer = setTimeout(loop, Math.max(seconds, cooldown) * 1000);
    };
    loop();
  }

  function preset(id) {
    if (EXTRA_ACTIONS[id]) id = EXTRA_ACTIONS[id].settingsKey;
    return {
      format: 'collective-ability-preset@1',
      pack: packId,
      id,
      meta: ELEMENTS.includes(id) ? describe(id) : { id, label: EXTRA_ACTIONS[id]?.label ?? id },
      settings: clone(settings[id]),
      shared: {
        global: clone(settings.global),
        aim: clone(settings.aim),
        zone: clone(settings.zone),
        post: clone(settings.post)
      }
    };
  }

  function applyPreset(id, patch) {
    const block = patch?.settings ?? patch;
    if (!settings[id] || !block) return false;
    applySettings({ [id]: block });
    app.editor?.refresh?.();
    return true;
  }

  function resetPreset(id) {
    if (!DEFAULT_SETTINGS[id]) return false;
    applySettings({ [id]: clone(DEFAULT_SETTINGS[id]) });
    app.editor?.refresh?.();
    return true;
  }

  const api = {
    pack: packId,
    list,
    arm,
    cast,
    auto,
    stopAuto,
    clear: () => {
      stopAuto();
      app.clearEffects?.();
    },
    action: (name, slot) => app.input.emit('action', name, slot),
    /** Character moves: 'cast1' | 'cast2' | 'cast3' (each with the cast lunge), or 'lunge' alone. */
    move: (name) => {
      const character = app.character;
      if (!character) return false;
      if (name !== 'lunge') character.playCast?.(name);
      character.castLunge?.();
      return true;
    },
    moves: () => [...(config.CAST_ANIMATIONS ?? []), 'lunge'],
    preset,
    applyPreset,
    resetPreset,
    allPresets: () => Object.fromEntries([...ELEMENTS, ...extras.map((e) => e.action)].map((id) => [id, preset(id)])),
    get castCount() {
      return castCount;
    }
  };
  window.matrix = api;

  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || typeof data.matrix !== 'string') return;
    try {
      switch (data.matrix) {
        case 'list':
          post({ matrix: 'list', ...list() });
          break;
        case 'arm':
          arm(data.id);
          break;
        case 'cast':
          await cast(data.id, data);
          break;
        case 'auto':
          auto(data.id, data.seconds);
          break;
        case 'stop':
          stopAuto();
          break;
        case 'clear':
          api.clear();
          break;
        case 'action':
          api.action(data.action, data.slot);
          break;
        case 'move':
          api.move(data.name);
          break;
        case 'getPreset':
          post({ matrix: 'preset', id: data.id, preset: preset(data.id) });
          break;
        case 'getAllPresets':
          post({ matrix: 'allPresets', presets: api.allPresets() });
          break;
        case 'applyPreset':
          post({ matrix: 'applied', id: data.id, ok: applyPreset(data.id, data.preset) });
          break;
        case 'resetPreset':
          post({ matrix: 'applied', id: data.id, ok: resetPreset(data.id) });
          break;
        default:
          break;
      }
    } catch (error) {
      post({ matrix: 'error', message: String(error?.message ?? error) });
    }
  });

  if (params.get('hud') === '0') {
    document.documentElement.classList.add('matrix-embedded');
    const style = document.createElement('style');
    // Embedded in the matrix, which has its own controls: keep the scene clear.
    // The pack's own ability bar, title, stats and help panels are hidden;
    // toasts and the paused badge stay, and the contact card folds to its portrait.
    style.textContent = [
      '.matrix-embedded .hud__abilities,',
      '.matrix-embedded .hud__panel { display: none !important; }'
    ].join('');
    document.head.appendChild(style);
    // Embedded: start with the VFX editor folded away; the matrix's button toggles it.
    app.hud?.contact?.setCollapsed?.(true, { silent: true });
    if (app.editor && app.editor._hidden === false) app.editor.toggle();
    else if (app.editor && app.editor._hidden === undefined) app.editor.toggle?.();
  }

  const startId = params.get('ability');
  const extra = params.get('extra');
  const autoSeconds = Number(params.get('auto'));
  if (extra) setTimeout(() => app.input.emit('action', extra), 400);
  if (startId && ELEMENTS.includes(startId)) {
    setTimeout(() => {
      if (autoSeconds > 0) auto(startId, autoSeconds);
      else if (params.get('cast') === '1') cast(startId);
      else if (castShapeOf(startId) !== 'summon') arm(startId);
      else app.selectAbility?.(startId);
    }, 400);
  }

  post({ matrix: 'ready', ...list() });
  return api;
}
