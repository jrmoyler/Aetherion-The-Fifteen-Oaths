/** Hysteresis prevents resolution oscillation; UI stays at native CSS resolution. */
export function createFrameBudget({ maxScale = 1, minScale = Math.min(0.5, maxScale), targetMs = 1000 / 45 } = {}) {
  let scale = maxScale, elapsed = 0, frames = 0, stable = 0;
  return {
    get scale() { return scale; },
    reset() { elapsed = 0; frames = 0; stable = 0; },
    sample(ms) {
      if (!Number.isFinite(ms) || ms <= 0 || ms > 250) return null;
      elapsed += ms; frames++;
      if (elapsed < 3000 || frames < 30) return null;
      const average = elapsed / frames; elapsed = 0; frames = 0;
      let next = scale;
      if (average > targetMs * 1.18) { next = Math.max(minScale, scale - 0.08); stable = 0; }
      else if (average < targetMs * 0.75) { if (++stable >= 3) { next = Math.min(maxScale, scale + 0.04); stable = 0; } }
      else stable = 0;
      if (next === scale) return null;
      scale = Number(next.toFixed(2)); return scale;
    },
  };
}
