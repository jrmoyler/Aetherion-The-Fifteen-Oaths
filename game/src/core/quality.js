// Device capability tiers. Every visual module reads ctx.quality and must degrade gracefully.
const TIERS = {
  low: { name: 'low', renderScale: 0.6, shadows: false, shadowSize: 1024, cascades: 1, ssao: false, bloom: false, grass: 0.15, drawDistance: 650, particles: 0.35, water: 'simple', fxaa: true },
  medium: { name: 'medium', renderScale: 0.8, shadows: true, shadowSize: 1024, cascades: 2, ssao: false, bloom: true, grass: 0.45, drawDistance: 1000, particles: 0.6, water: 'reflective', fxaa: true },
  high: { name: 'high', renderScale: 1, shadows: true, shadowSize: 2048, cascades: 3, ssao: true, bloom: true, grass: 0.8, drawDistance: 1500, particles: 1, water: 'reflective', fxaa: true },
  ultra: { name: 'ultra', renderScale: 1, shadows: true, shadowSize: 4096, cascades: 4, ssao: true, bloom: true, grass: 1, drawDistance: 2200, particles: 1, water: 'reflective', fxaa: true },
};

export const isTouch = () => typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

export function detectQuality() {
  const q = new URLSearchParams(location.search).get('q');
  let stored = null;
  try { stored = localStorage.getItem('aetherion.quality'); } catch { /* private mode */ }
  const pick = q || stored;
  if (pick && TIERS[pick]) return { ...TIERS[pick] };
  const mem = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (isTouch()) return { ...(mem >= 6 && cores >= 8 ? TIERS.medium : TIERS.low) };
  return { ...(cores >= 8 && mem >= 8 ? TIERS.high : TIERS.medium) };
}

export function saveQuality(name) { try { localStorage.setItem('aetherion.quality', name); } catch { /* ignore */ } }
export { TIERS };
