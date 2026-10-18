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
