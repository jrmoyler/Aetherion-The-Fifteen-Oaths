import { attachLinearFissures } from './LinearFissuresIntegration.js';

const installed = new WeakSet();

/** Install destination-only compatibility wiring at the source App load seam.
 * All source callers (native UI, URL bridge and Aetherion adapter) receive the
 * repaired runtime. The immutable source tree and source settings stay intact.
 */
export function installAetherionRuntimeRepairs(app) {
  if (!app || typeof app.loadRuntime !== 'function') {
    throw new TypeError('An Ability Matrix App with loadRuntime() is required');
  }
  if (installed.has(app)) return app;
  const loadRuntime = app.loadRuntime;
  app.loadRuntime = async function (pack, ...args) {
    const runtime = await loadRuntime.call(this, pack, ...args);
    if (pack === 'linear') attachLinearFissures(runtime);
    return runtime;
  };
  installed.add(app);
  return app;
}
