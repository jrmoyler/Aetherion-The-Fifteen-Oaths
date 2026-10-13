import { FissureSystem } from '../../runtime/ability-matrix/packs/sandbox/src/vendor/linear/effects/GroundFissures.js';

const installed = new WeakMap();

/**
 * Restore a service omitted by the upstream sandbox's Linear runtime wrapper.
 *
 * Call after bridge.loadPack('linear') returns its runtime, before casting.
 * The implementation and all fissure geometry/shaders remain the source pack's.
 * The source Linear App orders decals -> fissures -> bursts for update, clear,
 * and dispose. Its hosted runtime has the same order except for the omission;
 * adding the missing operation after the private decal service preserves it.
 * No source file, global prototype, or other pack's service is modified.
 *
 * This does not render the standalone App's scene, replace an ability, or
 * synthesize a gameplay result. It only connects the existing FissureSystem.
 *
 * @param {object} runtime The loaded upstream Linear runtime.
 * @returns {object} The same runtime, now with ctx.fissures.
 */
export function attachLinearFissures(runtime) {
  if (runtime?.pack !== 'linear' || !runtime.ctx?.scene || !runtime.ctx?.decals) {
    throw new TypeError('attachLinearFissures requires a loaded Linear runtime');
  }
  if (installed.has(runtime) || runtime.ctx.fissures) return runtime;

  const { decals, scene } = runtime.ctx;
  for (const method of ['update', 'clear', 'dispose']) {
    if (typeof decals[method] !== 'function') {
      throw new TypeError(`Linear decal service lacks ${method}()`);
    }
  }
  const fissures = new FissureSystem(scene);
  let disposed = false;
  const update = decals.update;
  const clear = decals.clear;
  const dispose = decals.dispose;

  decals.update = function (dt, ...rest) {
    const result = update.call(this, dt, ...rest);
    if (!disposed) fissures.update(dt);
    return result;
  };
  decals.clear = function (...args) {
    const result = clear.apply(this, args);
    if (!disposed) fissures.clear();
    return result;
  };
  decals.dispose = function (...args) {
    const result = dispose.apply(this, args);
    if (!disposed) {
      disposed = true;
      fissures.dispose();
    }
    return result;
  };

  runtime.ctx.fissures = fissures;
  installed.set(runtime, fissures);
  return runtime;
}
