import { App } from './core/App.js';
import { installMatrixBridge } from './bridge/MatrixBridge.js';
import { LoadingScreen } from './ui/HUD.js';
import { PackAdapter } from './combat/ucsm/PackAdapter.js';
import { hasLiveExpansion } from './abilities/expansion-2026/status.js';
import { Editor } from './ui/Editor.js';
import { buildMechanicLookEditors } from './combat/ucsm/mechanics/ConvergenceCounterStanceEditor.js';
import { buildWeaveEditor, WEAVE_LOOK } from './combat/ucsm/mechanics/WeaveLook.js';
import { buildWorldshapeEditor, WORLDSHAPE_LOOK } from './combat/ucsm/mechanics/WorldshapeLook.js';

/**
 * Entry point.
 *
 * Everything interesting lives in `core/App.js`; this file only wires the app
 * to the page and reports fatal boot errors somewhere the user can see them.
 */
const canvas = document.getElementById('viewport');

async function boot() {
  try {
    const app = new App(canvas);
    await app.load();

    // Handy for poking at the scene from the console.
    window.app = app;
    // Every cast, from every pack, reports into one combat state (combat/ucsm).
    app.combat = new PackAdapter(app);
    app.combat.buildEditor(app.editor.gui);
    // Look folders for the five mechanic families' presentation.
    buildMechanicLookEditors(app.editor.gui, Editor);
    buildWeaveEditor(app.editor.gui, WEAVE_LOOK, Editor);
    buildWorldshapeEditor(app.editor.gui, WORLDSHAPE_LOOK, Editor);
    if (hasLiveExpansion()) {
      const { installProductionExpansion } = await import('./abilities/expansion-2026/ProductionRegistration.js');
      installProductionExpansion(app);
    }
    if (new URLSearchParams(location.search).get('expansionDev') === '1') {
      const { installExpansionHarness } = await import('./dev/ExpansionHarness.js');
      installExpansionHarness(app);
    }
    installMatrixBridge(app, 'sandbox');
    window.matrix.combat = app.combat.api();
    // The Arch-Wizard duel and the Targets panel (combat/duel).
    const [{ Duel }, { DuelPanel }, { installDuelBridge }] = await Promise.all([
      import('./combat/duel/Duel.js'),
      import('./combat/duel/DuelPanel.js'),
      import('./combat/duel/DuelBridge.js')
    ]);
    app.duel = new Duel(app);
    app.duelPanel = new DuelPanel(app, app.duel);
    installDuelBridge(app, app.duel);
  } catch (error) {
    console.error('[boot] failed to start', error);
    new LoadingScreen().fail(
      error?.message ? `Failed to start: ${error.message}` : 'Failed to start — see the console.'
    );
  }
}

boot();
