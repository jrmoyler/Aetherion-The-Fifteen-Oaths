/**
 * Ability Matrix bridge — sandbox edition.
 *
 * The sandbox hosts every ability, so the matrix never reloads it: abilities
 * are addressed by uid (`<pack>/<id>`) and the bridge asks the App to select,
 * arm or cast them. Casting drives the same seams a player does — `arm()`, then
 * `aim.point()` + `aim.confirm()` on whichever engine's aim is in the slot.
 *
 *   URL      ?ability=<uid>   select it on load   &cast=1  cast it   &auto=<s>
 *            &hud=0           embedded: the matrix draws the controls
 *   window   window.matrix.cast('casting/dragon')
 *   message  { matrix: 'cast', uid: 'casting/dragon' }
 */
import { Raycaster, Plane, Vector2, Vector3 } from 'three';
import { settings, DEFAULT_SETTINGS, applySettings } from '../config/settings.js';

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Hosted builds can only serve web media types, so the staging script renames
 * binary assets to `<file>.<suffix>` and the matrix passes `?bin=<suffix>`.
 * Every three.js loader goes through `fetch` (three's FileLoader hands it a
 * Request), so one rewrite here covers them all.
 */
const BIN_SUFFIX = new URLSearchParams(location.search).get('bin');
if (BIN_SUFFIX && /^[a-z0-9]+$/.test(BIN_SUFFIX)) {
  const nativeFetch = window.fetch.bind(window);
  const BINARY = /\.(fbx|glb|hdr|task)(?=$|[?#])/i;
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (BINARY.test(url)) {
      const moved = url.replace(BINARY, (ext) => `${ext}.${BIN_SUFFIX}`);
      input = input instanceof Request ? new Request(moved, input) : moved;
    }
    return nativeFetch(input, init);
  };
}

export function installMatrixBridge(app, packId = 'sandbox') {
  const params = new URLSearchParams(location.search);
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const flat = new Vector3();
  const target = new Vector3();
  let autoTimer = null;
  let autoUid = null;
  let castCount = 0;

  const post = (message) => {
    if (window.parent && window.parent !== window) window.parent.postMessage({ ...message, pack: packId }, '*');
  };

  /** The live settings block for a uid (loading its engine if needed). */
  async function block(uid) {
    const ref = app.parse(uid);
    if (ref.native) return { settings, defaults: DEFAULT_SETTINGS, apply: applySettings, id: ref.id };
    const runtime = await app.loadRuntime(ref.pack);
    return {
      settings: runtime.settings,
      defaults: runtime.defaults,
      apply: runtime.applySettings,
      id: ref.id,
      runtime
    };
  }

  /** Where a "sensible" aim lands: up-screen of the caster, 70% into its reach. */
  function aimPoint(config, aim, fraction = 0.7) {
    const origin = aim.origin;
    raycaster.setFromCamera(ndc.set(0, 0.25), app.camera);
    if (raycaster.ray.intersectPlane(GROUND, hit)) flat.copy(hit).sub(origin);
    else app.camera.getWorldDirection(flat);
    flat.y = 0;
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    const min = config.minRange ?? 0.5;
    const max = config.range ?? min + 6;
    target.copy(origin).addScaledVector(flat, min + (max - min) * fraction);
    target.y = 0;
    return target.clone().project(app.camera);
  }

  async function select(uid) {
    return app.select(uid);
  }

  async function arm(uid) {
    await app.select(uid);
    if (!app.activeAim.isArmed) await app.arm(uid);
  }

  async function cast(uid, options = {}) {
    await app.select(uid);
    const slot = app.slot;
    const runtime = slot.runtime;
    if (runtime?.isSummon(slot.id)) {
      await app.arm(uid);
      post({ matrix: 'cast', uid, summon: true });
      return true;
    }
    for (let i = 0; i < 600 && (app.cooldowns.get(uid) ?? 0) > 0; i++) await wait(50);
    if (app.paused) app.input.emit('action', 'togglePause');
    const config = (runtime ? runtime.settings : settings)[slot.id] ?? {};
    if (!app.activeAim.isArmed) await app.arm(uid);
    const aim = app.activeAim;
    await frame();
    const point = aimPoint(config, aim, options.fraction ?? 0.7);
    aim.point(new Vector2(point.x, point.y));
    await frame();
    await frame();
    aim.point(new Vector2(point.x, point.y));
    await frame();
    const fired = aim.confirm();
    if (fired) castCount += 1;
    post({ matrix: 'cast', uid, fired, count: castCount });
    return fired;
  }

  function stopAuto() {
    clearTimeout(autoTimer);
    autoTimer = null;
    autoUid = null;
  }

  function auto(uid, seconds = 4) {
    stopAuto();
    autoUid = uid;
    const loop = async () => {
      if (autoUid !== uid) return;
      try {
        await cast(uid);
      } catch (error) {
        post({ matrix: 'error', message: String(error?.message ?? error) });
      }
      const b = await block(uid);
      const cooldown = b.settings[b.id]?.cooldown ?? 0;
      autoTimer = setTimeout(loop, Math.max(seconds, cooldown) * 1000);
    };
    loop();
  }

  async function preset(uid) {
    const b = await block(uid);
    return {
      format: 'collective-ability-preset@1',
      uid,
      pack: app.parse(uid).pack,
      id: b.id,
      meta: app.describe(uid) ?? { uid },
      settings: clone(b.settings[b.id]),
      shared: { global: clone(settings.global) }
    };
  }

  async function applyPreset(uid, patch) {
    const b = await block(uid);
    const data = patch?.settings ?? patch;
    if (!b.settings[b.id] || !data) return false;
    b.apply({ [b.id]: data });
    app.editor?.refresh?.();
    return true;
  }

  async function resetPreset(uid) {
    const b = await block(uid);
    if (!b.defaults[b.id]) return false;
    b.apply({ [b.id]: clone(b.defaults[b.id]) });
    app.editor?.refresh?.();
    return true;
  }

  const api = {
    pack: packId,
    list: () => ({ abilities: app.uids }),
    select,
    arm,
    cast,
    auto,
    stopAuto,
    clear: () => {
      stopAuto();
      app.clearEffects();
    },
    action: (name, slot) => app.input.emit('action', name, slot),
    /** A pack's own non-slot action, e.g. runAction('linear-ext', 'boost'). */
    runAction: (pack, action) => app.runAction(pack, action),
    /** Character moves: 'cast1' | 'cast2' | 'cast3' (each with the lunge), 'lunge' or 'dash'. */
    move: (name) => {
      if (name === 'dash') {
        app.locomotion.requestDash();
        return true;
      }
      if (name !== 'lunge') app.character.playCast(name);
      app.character.castLunge();
      return true;
    },
    preset,
    applyPreset,
    resetPreset,
    loadPack: (pack) => app.loadRuntime(pack),
    get castCount() {
      return castCount;
    }
  };
  window.matrix = api;

  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || typeof data.matrix !== 'string') return;
    const uid = data.uid;
    try {
      switch (data.matrix) {
        case 'list':
          post({ matrix: 'list', ...api.list() });
          break;
        case 'select':
          post({ matrix: 'selected', uid, meta: await select(uid) });
          break;
        case 'arm':
          await arm(uid);
          break;
        case 'cast':
          await cast(uid, data);
          break;
        case 'auto':
          auto(uid, data.seconds);
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
        case 'runAction':
          await api.runAction(data.packId, data.action);
          post({ matrix: 'cast', uid: `${data.packId}/${data.action}`, fired: true });
          break;
        case 'move':
          api.move(data.name);
          break;
        case 'getPreset':
          post({ matrix: 'preset', uid, preset: await preset(uid) });
          break;
        case 'applyPreset':
          post({ matrix: 'applied', uid, ok: await applyPreset(uid, data.preset) });
          break;
        case 'resetPreset':
          post({ matrix: 'applied', uid, ok: await resetPreset(uid) });
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
    style.textContent = '.matrix-embedded .hud__abilities, .matrix-embedded .hud__panel { display: none !important; }';
    document.head.appendChild(style);
    app.hud?.contact?.setCollapsed?.(true, { silent: true });
    if (app.editor && app.editor._hidden !== true) app.editor.toggle();
  }

  const start = params.get('ability');
  const autoSeconds = Number(params.get('auto'));
  if (start) {
    setTimeout(() => {
      if (autoSeconds > 0) auto(start, autoSeconds);
      else if (params.get('cast') === '1') cast(start).catch(() => {});
      else select(start).catch(() => {});
    }, 400);
  }

  post({ matrix: 'ready', ...api.list() });
  return api;
}
