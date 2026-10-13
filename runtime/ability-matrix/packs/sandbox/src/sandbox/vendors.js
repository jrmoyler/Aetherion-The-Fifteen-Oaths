/**
 * The five source repos, as engines the sandbox loads on first use.
 *
 * Each import is its own chunk, so opening the sandbox costs the native engine
 * only; picking, say, the Dragon pulls in the Ability Casting engine and its
 * seven rigs the first time and never again.
 */
export const VENDOR_PACKS = {
  linear: { title: 'Linear Ability Casting', load: () => import('../vendor/runtimes/linear.js') },
  'linear-ext': { title: 'Linear Ability Ext', load: () => import('../vendor/runtimes/linear-ext.js') },
  'linear-extended': { title: 'Linear Ability Casting Extended', load: () => import('../vendor/runtimes/linear-extended.js') },
  handcast: { title: 'Hand Cast', load: () => import('../vendor/runtimes/handcast.js') },
  casting: { title: 'Ability Casting', load: () => import('../vendor/runtimes/casting.js') }
};

export async function loadVendorRuntime(pack, host) {
  const entry = VENDOR_PACKS[pack];
  if (!entry) throw new Error(`Unknown pack "${pack}"`);
  const module = await entry.load();
  return module.create(host);
}
