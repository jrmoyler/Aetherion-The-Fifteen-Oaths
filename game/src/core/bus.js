/** Tiny synchronous event bus shared by every client module. */
export class Bus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) { const off = this.on(type, (p) => { off(); fn(p); }); return off; }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[bus] ${type} handler failed`, err); }
    }
  }
}
