/** Browser state is independent of scene objects; no renderer or DOM globals. */
export class RenderLifecycle {
  constructor({ canvas, page, visibility, start, stop, setControlsEnabled, onState }) {
    Object.assign(this, { canvas, page, visibility, start, stop, setControlsEnabled, onState });
    this.lost = false; this.suspended = false; this.disposed = false; this.failed = false;
    this.uiActive = false; this.running = false;
    this.listeners = [];
    this.listen(canvas, 'webglcontextlost', event => { event.preventDefault(); this.lost = true; this.sync(); });
    this.listen(canvas, 'webglcontextrestored', () => { this.lost = false; this.sync(); });
    this.listen(visibility, 'visibilitychange', () => this.sync());
    this.listen(page, 'pagehide', event => { if (event.persisted) { this.suspended = true; this.sync(); } });
    this.listen(page, 'pageshow', event => { if (event.persisted) { this.suspended = false; this.sync(); } });
    this.sync();
  }
  listen(target, name, listener) { target.addEventListener(name, listener); this.listeners.push([target, name, listener]); }
  setUIActive(active) { this.uiActive = active; this.sync(); }
  fail() { this.failed = true; this.sync(); }
  sync() {
    const available = !this.disposed && !this.failed && !this.lost;
    const running = available && !this.suspended && !this.visibility.hidden;
    this.setControlsEnabled(running && !this.uiActive);
    if (running !== this.running) { this.running = running; if (running) this.start(); else this.stop(); }
    this.onState(this.disposed ? 'disposed' : this.failed ? 'failed' : this.lost ? 'lost' : running ? 'ready' : 'paused');
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.sync();
    for (const [target, name, listener] of this.listeners) target.removeEventListener(name, listener);
    this.listeners.length = 0;
  }
}

export function viewportSize(width, height, ratio) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)),
    pixelRatio: Math.max(1, Math.min(Number.isFinite(ratio) ? ratio : 1, 2)) };
}

export function keyboardAction(event, canvas) {
  if (event.target !== canvas || event.altKey || event.ctrlKey || event.metaKey) return null;
  return { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    '+': 'in', '=': 'in', '-': 'out', Home: 'fit', f: 'fit', F: 'fit' }[event.key] || null;
}

export function bindMotionPreference(media, playing, controls) {
  const apply = () => {
    controls.enableDamping = !media.matches;
    // A user may explicitly start a clip; a new reduced-motion preference pauses it.
    if (media.matches) playing.checked = false;
  };
  apply(); media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}
