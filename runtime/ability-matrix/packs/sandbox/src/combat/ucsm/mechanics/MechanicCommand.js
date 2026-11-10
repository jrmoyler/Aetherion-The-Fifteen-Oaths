import { MECHANIC_PRESETS, MECHANIC_VARIANTS } from './presets.js';

/** Issue an explicit UID from the bridge, or use the current UI selection. */
export function issueMechanicCast(host, family, position, direction = [0, 0, 1], action = 'cast', uid) {
  if (host.app.paused || !host.adapter.enabled) return { ok: false, reason: 'combat paused or disabled' };
  const selectedUid = uid === undefined ? (host.selected === family ? host.selectedUid : null) : uid;
  const result = host.systems.command({ family, uid: selectedUid, position: position ?? undefined, direction, action });
  if (result.ok) {
    host.app._throwBody(Math.atan2(direction[0], direction[2]), (MECHANIC_VARIANTS[selectedUid] ?? MECHANIC_PRESETS[family]).castAnim);
    if (family !== 'weave') {
      host.selected = null;
      host.selectedUid = null;
    }
  } else host.app.hud.showToast(result.reason);
  return result;
}
