// Cache policy shared by streamed terrain. Active coverage always outranks the cache target.
// These limits include pending nodes as well as GPU meshes, so queued work is bounded too.
export const TERRAIN_CACHE_LIMITS = Object.freeze({ low: 180, medium: 260, high: 360, ultra: 480 });

export function terrainEvictions(nodes, { frame, now, limit, rootSize, maxRetire = 8, ttl = 15000 }) {
  const candidates = [...nodes.values()].filter(n => !n.shown && n.used !== frame && n.size < rootSize);
  candidates.sort((a, b) => a.lastUsed - b.lastUsed);
  let remaining = nodes.size;
  const result = [];
  for (const n of candidates) {
    if (result.length >= maxRetire) break;
    if (remaining <= limit && now - n.lastUsed <= ttl) break;
    result.push(n);
    remaining--;
  }
  return result;
}
