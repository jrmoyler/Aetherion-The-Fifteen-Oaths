import { settings, DEFAULT_SETTINGS, ELEMENT_META, ELEMENTS } from '../../config/settings.js';
import { ELEMENT_OF } from '../../config/elements.js';
import { Editor } from '../../ui/Editor.js';
import { expansionRoster } from './ProductionRoster.js';

/** Install only quality-approved moves. No registration occurs for candidate status. */
export function installProductionExpansion(app, roster = expansionRoster()) {
  const live = roster.filter((c) => c.status === 'live');
  const byUid = new Map(), byId = new Map(), installed = [];
  if (app.expansionLive) throw new Error('Expansion already installed');
  for (const c of live) {
    if (settings[c.ID] || DEFAULT_SETTINGS[c.ID] || ELEMENT_META[c.ID] || ELEMENT_OF[c.uid] ||
        app.abilities.pools.has(c.ID) || app.nativePack.has(c.ID) || byUid.has(c.uid) || byId.has(c.ID))
      throw new Error(`Expansion registration conflict: ${c.uid}`);
    byUid.set(c.uid, c); byId.set(c.ID, c);
  }
  const rollback = () => {
    for (const entry of installed.reverse()) {
      const c = entry.c;
      entry.folder?.destroy?.();
      if (app.abilities.registered.has(c.ID)) app.abilities.unregister(c.ID);
      delete settings[c.ID]; delete DEFAULT_SETTINGS[c.ID]; delete ELEMENT_META[c.ID]; delete ELEMENT_OF[c.uid];
    }
  };
  try {
    for (const c of live) {
      const entry = { c, folder: null }; installed.push(entry);
      settings[c.ID] = structuredClone(c.config.settings);
      DEFAULT_SETTINGS[c.ID] = structuredClone(c.config.settings);
      ELEMENT_META[c.ID] = { ...c.config.meta };
      ELEMENT_OF[c.uid] = c.config.meta.element;
      app.abilities.register(c.ID, c.Ability);
      entry.folder = c.buildEditor(app.editor.gui, settings[c.ID], Editor);
      entry.folder?.close?.();
    }
  } catch (error) { rollback(); throw error; }
  let disposed = false;
  const handle = {
    byUid, byId,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let i = app.abilities.active.length - 1; i >= 0; i--) {
        const ability = app.abilities.active[i];
        if (!byId.has(ability.element)) continue;
        app.abilities.active.splice(i, 1);
        app.combat?._tracked?.delete(ability);
        ability.destroy(); app.abilities.pools.get(ability.element).release(ability);
      }
      // Cleared pooled instances can still be tracked until the next combat tick.
      for (const ability of app.combat?._tracked ?? []) if (byId.has(ability.element)) app.combat._tracked.delete(ability);
      if (byId.has(app.abilities.selected)) app.abilities.select(ELEMENTS[0]);
      rollback();
      if (app.expansionLive === handle) delete app.expansionLive;
    }
  };
  app.expansionLive = handle;
  return handle;
}
