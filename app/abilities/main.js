import '../../runtime/ability-matrix/packs/sandbox/src/ui/styles.css';
import './wrapper.css';
import { App } from '../../runtime/ability-matrix/packs/sandbox/src/core/App.js';
import { LoadingScreen } from '../../runtime/ability-matrix/packs/sandbox/src/ui/HUD.js';
import { installMatrixBridge } from '../../runtime/ability-matrix/packs/sandbox/src/bridge/MatrixBridge.js';
import catalog from '../../runtime/ability-matrix/presets/catalog.json';
import { createAbilityMatrixAdapter } from '../../src/abilities/AbilityMatrixAdapter.js';
import { installAetherionRuntimeRepairs } from '../../src/abilities/InstallRuntimeRepairs.js';

/** Destination entry only: source rendering, assets, timing, aiming and effects
 * are owned by the unmodified App. No defaults or gameplay settings are changed.
 */
export async function bootAetherionAbilities() {
  try {
    const app = new App(document.getElementById('viewport'));
    // Install before loading and before the bridge can process URL/UI casts.
    installAetherionRuntimeRepairs(app);
    await app.load();
    window.app = app;
    const bridge = installMatrixBridge(app, 'sandbox');
    const adapter = createAbilityMatrixAdapter({ bridge, catalog });
    window.aetherionAbilities = adapter;
    bindCatalogControls(adapter, app.slot?.uid);
    return { app, bridge, adapter };
  } catch (error) {
    console.error('[Aetherion boot] failed', error);
    const message = error?.message ? `Failed to start: ${error.message}` : 'Failed to start. See the console.';
    new LoadingScreen().fail(message);
    document.getElementById('ability-status').textContent = message;
    throw error;
  }
}

function bindCatalogControls(adapter, initialUid) {
  const panel = document.getElementById('aetherion-controls');
  const filter = document.getElementById('element-filter');
  const picker = document.getElementById('castable-select');
  const castButton = document.getElementById('cast-button');
  const clearButton = document.getElementById('clear-button');
  const status = document.getElementById('ability-status');
  const controls = [filter, picker, castButton, clearButton];
  const all = adapter.list();
  for (const element of catalog.elements) {
    const option = document.createElement('option');
    option.value = element.id;
    option.textContent = `${element.label ?? element.name ?? element.id} (${element.count})`;
    filter.append(option);
  }
  function selection() { return adapter.describe(picker.value); }
  function refreshLabel() {
    const entry = selection();
    castButton.textContent = entry.kind === 'buff' ? 'Toggle buff' : entry.kind === 'summon' ? 'Deploy / recall' : 'Cast';
    status.textContent = `${entry.label ?? entry.id} · ${entry.uid} · ${entry.kind}`;
  }
  function populate(preferredUid = picker.value) {
    picker.replaceChildren();
    for (const entry of all.filter(a => !filter.value || a.element === filter.value)) {
      const option = document.createElement('option');
      option.value = entry.uid;
      option.textContent = `${entry.label ?? entry.id} · ${entry.uid}`;
      picker.append(option);
    }
    if ([...picker.options].some(option => option.value === preferredUid)) picker.value = preferredUid;
    refreshLabel();
  }
  async function run(action, message) {
    for (const control of controls) control.disabled = true;
    status.textContent = message;
    try { await action(); }
    catch (error) { console.error('[Aetherion controls]', error); status.textContent = error?.message ?? String(error); }
    finally { for (const control of controls) control.disabled = false; }
  }
  async function selectCurrent() {
    refreshLabel();
    const entry = selection();
    // Source buffs are independent toggles and intentionally have no aimed slot.
    if (entry.kind === 'buff') return;
    await run(async () => { await adapter.select(entry.uid); refreshLabel(); }, `Preparing ${entry.label ?? entry.id}…`);
  }
  filter.addEventListener('change', () => { populate(); void selectCurrent(); });
  picker.addEventListener('change', () => { void selectCurrent(); });
  castButton.addEventListener('click', () => {
    const entry = selection();
    void run(async () => {
      const fired = await adapter.cast(entry.uid);
      status.textContent = fired === false ? `${entry.label ?? entry.id}: source runtime declined the action.` : `${entry.label ?? entry.id}: action accepted.`;
    }, `Running ${entry.label ?? entry.id}…`);
  });
  clearButton.addEventListener('click', () => { void run(async () => { await adapter.clear(); status.textContent = 'Effects cleared by the source runtime.'; }, 'Clearing effects…'); });
  // Keep source global hotkeys from treating keyboard selection in this panel
  // as movement or another cast. Native control defaults remain accessible.
  panel.addEventListener('keydown', event => event.stopPropagation());
  // Key releases keep bubbling so any movement key pressed before focus moved
  // to the panel is released by the source InputManager.
  populate(initialUid);
  for (const control of controls) control.disabled = false;
}

window.aetherionReady = bootAetherionAbilities();
// Boot errors are visible in the source loading screen; consumers may also await
// aetherionReady and receive the rejection without an unhandled-promise warning.
window.aetherionReady.catch(() => {});
