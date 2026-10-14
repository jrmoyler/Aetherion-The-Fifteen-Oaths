import '../../runtime/ability-matrix/packs/sandbox/src/ui/styles.css';
import './style.css';
import { App } from '../../runtime/ability-matrix/packs/sandbox/src/core/App.js';
import { settings } from '../../runtime/ability-matrix/packs/sandbox/src/config/settings.js';
import { installMatrixBridge } from '../../runtime/ability-matrix/packs/sandbox/src/bridge/MatrixBridge.js';
import catalog from '../../runtime/ability-matrix/presets/catalog.json';
import { createAbilityMatrixAdapter } from '../../src/abilities/AbilityMatrixAdapter.js';
import { installAetherionRuntimeRepairs } from '../../src/abilities/InstallRuntimeRepairs.js';
import { installCourtyard } from './courtyard.js';
import { installControls } from './controls.js';

async function boot() {
  let app, courtyard, controls;
  try {
    // Instance entry preset; the archived source and castable settings stay intact.
    settings.dummies.count = 4; settings.dummies.radius = 6; settings.dummies.minRadius = 3;
    settings.move.arenaRadius = 9;
    app = new App(document.getElementById('viewport'));
    installAetherionRuntimeRepairs(app);
    app.renderer.targetPixelRatio = () => Math.min(window.devicePixelRatio || 1, 1);
    app.renderer.handleResize();
    await app.load();
    courtyard = await installCourtyard(app);
    const bridge = installMatrixBridge(app, 'sandbox');
    const adapter = createAbilityMatrixAdapter({ bridge, catalog });
    controls = installControls(app, adapter, catalog);
    await controls.ready;
    window.app = app;
    const result = { app, adapter, courtyard, controls, dispose() { controls.dispose(); courtyard.dispose(); app.dispose(); } };
    window.addEventListener('pagehide', event => { if (!event.persisted) result.dispose(); }, { once: true });
    return result;
  } catch (error) {
    controls?.dispose(); courtyard?.dispose(); app?.dispose();
    document.getElementById('loader').classList.remove('is-hidden');
    document.getElementById('loader-status').textContent = `Unable to start Daybreak: ${error.message}`;
    document.getElementById('status').textContent = `Startup failed: ${error.message}`;
    console.error('[Daybreak startup]', error); throw error;
  }
}
window.daybreakReady = boot();
window.daybreakReady.catch(() => {});
