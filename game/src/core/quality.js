// Device capability tiers. Every visual module reads ctx.quality and must degrade gracefully.
//   renderScale   internal resolution multiplier (dynamic resolution may lower it further)
//   msaa          hardware multisample count on the scene render target (1 = FXAA only)
//   shadowFilter  'medium' | 'high' PCF kernel; softShadows = contact-hardening (PCSS) on top
//   anisotropy    texture anisotropic filtering level (clamped to the GPU cap)
const TIERS = {
  low: { name: 'low', renderScale: 0.6, shadows: false, shadowSize: 1024, cascades: 1, ssao: false, bloom: false, grass: 0.15, drawDistance: 650, particles: 0.35, water: 'simple', fxaa: true, msaa: 1, shadowFilter: 'medium', softShadows: false, anisotropy: 2 },
  medium: { name: 'medium', renderScale: 0.8, shadows: true, shadowSize: 1024, cascades: 2, ssao: false, bloom: true, grass: 0.45, drawDistance: 1000, particles: 0.6, water: 'reflective', fxaa: true, msaa: 1, shadowFilter: 'medium', softShadows: false, anisotropy: 8 },
  high: { name: 'high', renderScale: 1, shadows: true, shadowSize: 2048, cascades: 3, ssao: true, bloom: true, grass: 0.8, drawDistance: 1500, particles: 1, water: 'reflective', fxaa: true, msaa: 4, shadowFilter: 'high', softShadows: false, anisotropy: 16 },
  ultra: { name: 'ultra', renderScale: 1, shadows: true, shadowSize: 4096, cascades: 4, ssao: true, bloom: true, grass: 1, drawDistance: 2200, particles: 1, water: 'reflective', fxaa: true, msaa: 4, shadowFilter: 'high', softShadows: true, anisotropy: 16 },
};

export const isTouch = () => typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

/** Rough GPU class from the unmasked renderer string: 'discrete' | 'integrated' | 'software' | 'unknown'. */
export function classifyGpu(renderer) {
  const r = String(renderer || '').toLowerCase();
  if (!r) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|mesa offscreen|basic render/.test(r)) return 'software';
  if (/\b(rtx|gtx|geforce|quadro|radeon (rx|pro|vii)|rx \d{3,4}|arc a\d|apple m\d|apple gpu)\b/.test(r)) return 'discrete';
  if (/intel|iris|uhd|hd graphics|adreno|mali|powervr|apple a\d/.test(r)) return 'integrated';
  return 'unknown';
}

function probeGpu() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }) || c.getContext('webgl');
    if (!gl) return 'unknown';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return classifyGpu(renderer);
  } catch { return 'unknown'; }
}

/** Pick a tier from device hints. Exported for tests; `gpu` is a classifyGpu() result. */
export function pickTier({ touch, mem, cores, gpu }) {
  if (touch) return mem >= 6 && cores >= 8 ? 'medium' : 'low';
  if (gpu === 'software') return 'low';
  if (gpu === 'discrete') return cores >= 4 ? 'high' : 'medium';
  if (gpu === 'integrated') return cores >= 8 && mem >= 8 ? 'medium' : 'low';
  return cores >= 8 && mem >= 8 ? 'high' : 'medium';
}

export function detectQuality() {
  const q = new URLSearchParams(location.search).get('q');
  let stored = null;
  try { stored = localStorage.getItem('aetherion.quality'); } catch { /* private mode */ }
  const pick = q || stored;
  if (pick && TIERS[pick]) return { ...TIERS[pick] };
  const mem = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const touch = isTouch();
  const gpu = touch ? 'unknown' : probeGpu();
  return { ...TIERS[pickTier({ touch, mem, cores, gpu })], gpu };
}

export function saveQuality(name) { try { localStorage.setItem('aetherion.quality', name); } catch { /* ignore */ } }
export { TIERS };
