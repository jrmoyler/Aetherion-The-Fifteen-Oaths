import { setTargets, targetsState } from '../targets.js';
import { parseCpuParam } from './DuelLoadout.js';
import { DIFFICULTIES } from './DuelAI.js';

/**
 * The duel and the targets on the sandbox bridge — JS, URL and postMessage.
 *
 *   window.matrix.duel.start({ loadout, castables, mechanics, difficulty, keepDummies })
 *   window.matrix.duel.watch({ … })  ·  .stop()  ·  .rematch()  ·  .state()
 *   window.matrix.targets.set({ count, formation, mix })  ·  .state()
 *
 *   URL      ?duel=1&cpu=<uid,uid>&difficulty=adept   (&watch=1 for the demo)
 *            &mechanics=<uid,uid>  &targets=12&formation=gauntlet&mix=armored,runner
 *   message  { matrix: 'duel', action: 'start', options: {…} }
 *            { matrix: 'targets', options: { count, formation, mix } }
 */
export function installDuelBridge(app, duel) {
  const post = (message) => {
    if (window.parent && window.parent !== window) window.parent.postMessage({ ...message, pack: 'sandbox' }, '*');
  };
  const api = {
    start: (options = {}) => duel.start(normalize(options)),
    watch: (options = {}) => duel.watch(normalize(options)),
    stop: () => duel.stop(),
    rematch: () => duel.rematch(),
    state: () => duel.state(),
    difficulties: Object.keys(DIFFICULTIES)
  };
  const targets = {
    set: (options = {}) => setTargets(app, options),
    state: () => targetsState(app),
    reset: () => setTargets(app, {})
  };
  window.matrix.duel = api;
  window.matrix.targets = targets;

  duel.on((kind, detail) => {
    if (['start', 'stop', 'over', 'player-hit', 'wizard-hit'].includes(kind)) post({ matrix: 'duel', event: kind, ...detail, state: duel.state() });
  });

  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || (data.matrix !== 'duel' && data.matrix !== 'targets')) return;
    try {
      if (data.matrix === 'targets') {
        post({ matrix: 'targets', state: targets.set(data.options ?? {}) });
        return;
      }
      const action = ['start', 'watch', 'stop', 'rematch', 'state'].includes(data.action) ? data.action : 'state';
      const state = await api[action](data.options ?? {});
      post({ matrix: 'duel', event: 'state', state });
    } catch (error) {
      post({ matrix: 'error', message: String(error?.message ?? error) });
    }
  });

  // URL: targets first, so a duel starts in the field it asked for.
  const params = new URLSearchParams(location.search);
  const t = {};
  if (params.has('targets')) t.count = Number(params.get('targets'));
  if (params.has('formation')) t.formation = params.get('formation');
  if (params.has('mix')) t.mix = params.get('mix');
  if (Object.keys(t).length) setTimeout(() => targets.set(t), 300);
  if (params.get('duel') === '1' || params.get('watch') === '1') {
    const options = {
      difficulty: params.get('difficulty') ?? 'adept',
      castables: parseCpuParam(params.get('cpu')),
      mechanics: parseCpuParam(params.get('mechanics')),
      loadout: params.get('loadout') ?? 'random',
      element: params.get('element') ?? undefined
    };
    setTimeout(() => (params.get('watch') === '1' ? api.watch(options) : api.start(options)).catch((error) => console.error('[Duel] URL start failed', error)), 600);
  }
  return api;
}

/** Accept `loadout: [uids]` as castables too. */
function normalize(options) {
  const out = { ...options };
  if (Array.isArray(out.loadout)) {
    out.castables = out.loadout;
    out.loadout = 'custom';
  }
  return out;
}
