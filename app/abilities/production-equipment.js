import * as THREE from '../../runtime/ability-matrix/packs/sandbox/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../runtime/ability-matrix/packs/sandbox/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { bindEquipmentToApp, createEquipmentController, findSourceSockets } from '../../src/production/equipment.js';
import { loadEquipmentCatalog } from '../../src/production/catalog.js';

/** Default OFF: no model attachment or source-instance hook until selection. */
export async function installProductionEquipment(app) {
  const picker = document.getElementById('equipment-select');
  const placement = document.getElementById('equipment-placement');
  const status = document.getElementById('equipment-status');
  const setStatus = message => { status.textContent = message; };
  const sockets = findSourceSockets(app.character.model);
  let controller = null, unbind = null, onPick = null, onPlacement = null;
  function off() { unbind?.(); unbind = null; controller = null; setStatus('Equipment off'); }
  function ensureController() {
    if (controller && !controller.disposed) return controller;
    const loader = new GLTFLoader();
    controller = createEquipmentController({
      THREE, model: app.character.model,
      onStatus: setStatus,
      load: async (url, signal) => {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Candidate request failed (${response.status})`);
        const bytes = await response.arrayBuffer();
        if (signal.aborted) throw new DOMException('Equipment load cancelled', 'AbortError');
        return loader.parseAsync(bytes, new URL('.', new URL(url, window.location.href)).href);
      },
    });
    unbind = bindEquipmentToApp(app, controller, error => setStatus(`Equipment animation failed: ${error.message}`));
    return controller;
  }
  let destroyed = false;
  const pageHide = event => {
    if (destroyed || event?.persisted) return;
    destroyed = true; off();
    if (onPick) picker.removeEventListener('change', onPick);
    if (onPlacement) placement.removeEventListener('change', onPlacement);
    picker.disabled = true; placement.disabled = true;
    window.removeEventListener('pagehide', pageHide);
  };
  window.addEventListener('pagehide', pageHide);
  try {
    const assets = await loadEquipmentCatalog();
    if (destroyed) return { controller, dispose: pageHide };
    for (const asset of assets) {
      const option = document.createElement('option'); option.value = asset.id;
      option.textContent = `${asset.familyId.split('-').slice(1, 2).join('')} · ${asset.name}`; picker.append(option);
    }
    picker.disabled = false;
    placement.disabled = false;
    if (!sockets.stow) placement.querySelector('option[value="stow"]').disabled = true;
    onPick = () => {
      const asset = assets.find(a => a.id === picker.value) ?? null;
      if (destroyed) return;
      if (!asset) { off(); return; }
      void ensureController().equip(asset, placement.value).catch(error => { console.error('[Candidate equipment]', error); });
    };
    onPlacement = () => { try { controller?.setPlacement(placement.value); } catch (error) { setStatus(error.message); } };
    picker.addEventListener('change', onPick);
    placement.addEventListener('change', onPlacement);
    setStatus(`Equipment off · ${assets.length} candidates · alignments unreviewed`);
    return { get controller() { return controller; }, assets, dispose: pageHide };
  } catch (error) {
    pageHide(); setStatus(`Equipment unavailable: ${error.message}`); return null;
  }
}
