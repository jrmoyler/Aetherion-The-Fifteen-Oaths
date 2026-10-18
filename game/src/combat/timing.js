// One-slot buffer, in monotonic milliseconds. Never turns a tap into auto-fire.
export class ActionBuffer {
  constructor(windowMs = 180) { this.windowMs = windowMs; this.pending = null; }
  push(slot, now) { this.pending = { slot, expires: now + this.windowMs }; }
  clear() { this.pending = null; }
  take(now, ready) {
    const p = this.pending;
    if (!p) return null;
    if (now > p.expires) { this.clear(); return null; }
    if (!ready(p.slot)) return null;
    this.clear(); return p.slot;
  }
}

/** Translate authoritative server cooldowns into the client's monotonic clock.
 * An unacknowledged prediction is preserved across snapshots sent before the tap.
 */
export function reconcileCooldown(serverUntil, serverNow, localNow, predictedUntil, pending = false) {
  if (!Number.isFinite(serverUntil) || !Number.isFinite(serverNow) || serverNow <= 0) return predictedUntil;
  const remaining = Math.max(0, serverUntil - serverNow);
  if (remaining > 600000 || (pending && remaining === 0)) return predictedUntil;
  return remaining > 0 ? localNow + remaining : 0;
}
