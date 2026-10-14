/** Destination UI only. Source IDs, kinds and catalog records are retained. */
export function filterCastables(entries, { search = '', element = '', kind = '' } = {}) {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry => (!element || entry.element === element) && (!kind || entry.kind === kind)
    && terms.every(term => `${entry.label ?? ''} ${entry.uid} ${entry.element} ${entry.kind}`.toLowerCase().includes(term)));
}
export function stickKeys(x, y, deadzone = 0.25) {
  const keys = new Set();
  if (Math.hypot(x, y) <= deadzone) return keys;
  if (x < -deadzone) keys.add('KeyA');
  if (x > deadzone) keys.add('KeyD');
  if (y < -deadzone) keys.add('KeyW');
  if (y > deadzone) keys.add('KeyS');
  return keys;
}
export function replaceSlot(loadout, slot, uid, entries) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= loadout.length) throw new RangeError('Invalid loadout slot');
  if (!entries.some(entry => entry.uid === uid)) throw new RangeError('Unknown castable');
  return loadout.map((old, index) => index === slot ? uid : old);
}
