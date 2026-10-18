/** Mutable grades must never share the palette's tint/ambient arrays. */
export function copyGrade(grade) {
  return { ...grade, tint: [...grade.tint], amb: [...grade.amb] };
}

/** Frame-rate-independent easing, including safe resume from a suspended tab. */
export function approach(value, target, rate, dt) {
  const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return value + (target - value) * (1 - Math.exp(-rate * elapsed));
}

export function particleCapacity(capacity, multiplier, gpu) {
  const scale = Number.isFinite(multiplier) ? Math.max(0, Math.min(2, multiplier)) : 1;
  return Math.min(gpu ? Infinity : 3000, Math.max(0, Math.round(capacity * scale)));
}

/** Hue interpolation takes the short route across the 360/0 degree seam. */
export function approachHue(value, target, rate, dt) {
  const delta = ((target - value + 540) % 360) - 180;
  return ((approach(value, value + delta, rate, dt) % 360) + 360) % 360;
}
