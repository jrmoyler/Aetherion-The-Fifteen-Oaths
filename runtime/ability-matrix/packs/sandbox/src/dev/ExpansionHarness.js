// This module is loaded only by the explicit expansionDev=1 sandbox opt-in.
// Candidates are experimental and are not part of the public catalogue.
import { Vector3 } from 'three';
import { Editor } from '../ui/Editor.js';
import { ObjectPool } from '../utils/ObjectPool.js';
import { settings, ELEMENT_META } from '../config/settings.js';
import { expansionRoster } from '../abilities/expansion-2026/ProductionRoster.js';

export const candidates = expansionRoster();

export function installExpansionHarness(app) {
  const byId = new Map();
  const byUid = new Map();
  const available = candidates.filter(item => !app.expansionLive?.byUid.has(item.uid));
  for (const item of available) {
    const { ID, uid, config, Ability, buildEditor } = item;
    if (!ID || ID !== config?.id || !uid?.startsWith('matrix-expansion/') || !config.meta?.element || typeof Ability !== 'function' || typeof buildEditor !== 'function' || settings[ID] || app.abilities.pools.has(ID) || byId.has(ID) || byUid.has(uid)) {
      throw new Error(`Invalid or conflicting expansion candidate: ${ID}`);
    }
    byId.set(ID, item);
    byUid.set(uid, item);
  }
  // Candidate state and pools exist only for this opt-in session.
  for (const item of available) {
    settings[item.ID] = structuredClone(item.config.settings);
    ELEMENT_META[item.ID] = { ...item.config.meta };
    app.abilities.pools.set(item.ID, new ObjectPool(() => {
      const ability = new item.Ability(app.abilities.ctx);
      app.abilities.ctx.scene.add(ability.group);
      ability.group.visible = false;
      return ability;
    }));
  }
  let disposed = false;
  let lastCast = null;
  app.expansionDev = { byUid };
  const cast = (item, aim = {}) => {
    if (disposed) throw new Error('Expansion test harness has been disposed');
    if (!item) throw new Error('Unknown expansion candidate');
    const manager = app.abilities;
    if (manager.active.length >= 4) {
      const old = manager.active.shift();
      old.destroy();
      manager.pools.get(old.element).release(old);
    }
    const before = new Set(manager.active);
    const ability = manager.pools.get(item.ID).acquire();
    try {
      const origin = app.character.position.clone();
      const angle = Number(aim.heading ?? 0);
      const requestedDistance = Number(aim.distance ?? 5);
      if (!Number.isFinite(angle) || !Number.isFinite(requestedDistance)) throw new Error('Heading and distance must be finite numbers');
      const direction = new Vector3(Math.sin(angle * Math.PI / 180), 0, Math.cos(angle * Math.PI / 180));
      const config = settings[item.ID];
      const distance = config.aimStyle === 'self' ? 0.1 : Math.max(config.minRange ?? 0, Math.min(config.range ?? 5, requestedDistance));
      ability.spawn(origin, direction, distance);
      manager.active.push(ability);
      app.combat._tagNew(manager.active, before, () => item.uid);
      lastCast = ability;
      return ability;
    } catch (error) {
      const index = manager.active.indexOf(ability);
      if (index !== -1) manager.active.splice(index, 1);
      app.combat._tracked?.delete(ability);
      ability.destroy();
      manager.pools.get(item.ID).release(ability);
      throw error;
    }
  };
  const panel = document.createElement('details');
  panel.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999;max-width:280px;padding:8px;background:#111e;color:white;font:13px sans-serif;border-radius:6px';
  const summary = document.createElement('summary');
  summary.textContent = 'Experimental cast tests';
  panel.append(summary);
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Experimental castable');
  for (const item of available) {
    const option = document.createElement('option');
    option.value = item.ID;
    option.textContent = `${item.config.meta.element} — ${item.config.meta.label}`;
    select.append(option);
  }
  const heading = document.createElement('input');
  heading.type = 'number'; heading.value = '0'; heading.setAttribute('aria-label', 'Heading in degrees');
  heading.title = 'Heading in degrees (0 = positive Z)';
  const distance = document.createElement('input');
  distance.type = 'number'; distance.value = '5'; distance.min = '0'; distance.step = '0.5';
  distance.setAttribute('aria-label', 'Cast distance');
  distance.title = 'Cast distance';
  const button = document.createElement('button');
  button.textContent = 'Cast';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Experimental candidates; effects and behavior may be incomplete.';
  const diagnostic = document.createElement('p');
  diagnostic.setAttribute('role', 'status');
  const refreshDiagnostics = () => {
    const messages = [];
    if (!app.combat.enabled) messages.push('Combat is disabled; combat-dependent effects cannot resolve.');
    if (lastCast?.failure) messages.push(`Candidate reported: ${lastCast.failure}`);
    diagnostic.textContent = messages.join(' ');
  };
  panel.append(select, heading, distance, button, status, diagnostic);
  document.body.append(panel);
  let folder;
  const updateEditor = () => {
    folder?.destroy();
    try {
      const item = byId.get(select.value);
      folder = item.buildEditor(app.editor.gui, settings[item.ID], Editor);
      status.textContent = `${item.config.meta.label}: ready for test casting.`;
    } catch (error) {
      status.textContent = `Editor failed: ${error.message}`;
      console.error('[expansion test editor]', error);
    }
  };
  select.addEventListener('change', updateEditor);
  button.addEventListener('click', () => {
    try {
      const item = byId.get(select.value);
      cast(item, { heading: heading.value, distance: distance.value });
      status.textContent = `Started ${item.config.meta.label}; outcomes depend on the simulation.`;
      refreshDiagnostics();
    } catch (error) {
      status.textContent = `Cast failed: ${error.message}`;
      console.error('[expansion test cast]', error);
    }
  });
  if (available.length) updateEditor();
  else { button.disabled = true; select.disabled = true; status.textContent = 'No experimental candidates remain; all are live.'; }
  refreshDiagnostics();
  const diagnosticTimer = setInterval(refreshDiagnostics, 200);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearInterval(diagnosticTimer);
    const manager = app.abilities;
    for (let i = manager.active.length - 1; i >= 0; i--) {
      const ability = manager.active[i];
      if (!byId.has(ability.element)) continue;
      manager.active.splice(i, 1);
      app.combat._tracked?.delete(ability);
      ability.destroy();
      manager.pools.get(ability.element).release(ability);
    }
    for (const item of available) {
      manager.pools.get(item.ID)?.dispose((ability) => {
        app.combat._tracked?.delete(ability);
        ability.dispose();
      });
      manager.pools.delete(item.ID);
      delete settings[item.ID];
      delete ELEMENT_META[item.ID];
    }
    folder?.destroy();
    panel.remove();
    if (app.expansionDev?.byUid === byUid) delete app.expansionDev;
  };
  app.expansionDev.dispose = dispose;
  return { candidates: available, cast: (id, aim) => cast(byId.get(id), aim), refreshDiagnostics, dispose };
}
