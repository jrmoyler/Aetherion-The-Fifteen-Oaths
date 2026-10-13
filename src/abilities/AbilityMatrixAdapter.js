/**
 * Source-preserving boundary around an initialized Ability Matrix sandbox bridge.
 * This adapter does not own a renderer, timing, targeting, hit resolution, or balance.
 * Pass the source sandbox's window.matrix and the unmodified source catalog.
 * It is not an authoritative game simulation or a multiplayer protocol.
 */
export function createAbilityMatrixAdapter({ bridge, catalog } = {}) {
  if (!bridge || typeof bridge.cast !== 'function' || typeof bridge.runAction !== 'function') {
    throw new TypeError('An initialized sandbox window.matrix bridge is required');
  }
  if (catalog?.format !== 'collective-ability-catalog@1' || !Array.isArray(catalog.abilities)) {
    throw new TypeError('The original collective-ability-catalog@1 is required');
  }
  const preparedPacks = new Map();
  async function prepare(entry) {
    if (entry.pack !== 'linear') return;
    if (!preparedPacks.has(entry.pack)) {
      const job = (async () => {
        const runtime = await call('loadPack', 'linear');
        const { attachLinearFissures } = await import('./LinearFissuresIntegration.js');
        attachLinearFissures(runtime);
      })();
      preparedPacks.set(entry.pack, job);
      job.catch(() => preparedPacks.delete(entry.pack));
    }
    await preparedPacks.get(entry.pack);
  }
  const copy = (value) => structuredClone(value);
  const castables = catalog.abilities.filter((a) => a.status === 'live' && ['ability', 'buff', 'summon'].includes(a.kind));
  const registry = new Map();
  for (const raw of castables) {
    if (typeof raw.uid !== 'string' || raw.uid !== `${raw.pack}/${raw.id}` || registry.has(raw.uid)) {
      throw new TypeError(`Invalid or duplicate source uid: ${raw.uid}`);
    }
    if (!catalog.elements.some((e) => e.id === raw.element)) throw new TypeError(`Unknown source element: ${raw.element}`);
    registry.set(raw.uid, copy(raw));
  }
  const lookup = (uid) => {
    const value = registry.get(uid);
    if (!value) throw new RangeError(`Unknown source castable: ${uid}`);
    return value;
  };
  const call = (name, ...args) => {
    if (typeof bridge[name] !== 'function') throw new TypeError(`Sandbox bridge does not expose ${name}`);
    return bridge[name](...args);
  };
  return Object.freeze({
    list({ element, kind } = {}) {
      return [...registry.values()].filter((a) => (!element || a.element === element) && (!kind || a.kind === kind)).map(copy);
    },
    describe(uid) { return copy(lookup(uid)); },
    async cast(uid, options = {}) {
      const entry = lookup(uid);
      await prepare(entry);
      // Source buffs are toggles outside the aimed-ability slots. Returning the
      // source result unchanged does not claim damage, success, or activation.
      if (entry.kind === 'buff') return call('runAction', entry.pack, entry.action ?? entry.id);
      return call('cast', uid, options);
    },
    async select(uid) {
      const entry = lookup(uid);
      if (entry.kind === 'buff') throw new TypeError('Source buffs are non-slot actions; use cast(uid) to toggle');
      await prepare(entry);
      return call('select', uid);
    },
    async preset(uid) { lookup(uid); return call('preset', uid); },
    async applyPreset(uid, preset) {
      const entry = lookup(uid);
      if (!preset || typeof preset !== 'object' || Array.isArray(preset)) throw new TypeError('A preset object is required');
      if (preset.uid != null && preset.uid !== uid) throw new RangeError('Preset uid does not match target');
      if (preset.pack != null && preset.pack !== entry.pack) throw new RangeError('Preset pack does not match target');
      if (preset.id != null && preset.id !== entry.id) throw new RangeError('Preset id does not match target');
      return call('applyPreset', uid, preset);
    },
    async resetPreset(uid) { lookup(uid); return call('resetPreset', uid); },
    clear() { return call('clear'); }
  });
}
