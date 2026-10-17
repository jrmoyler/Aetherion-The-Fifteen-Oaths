// PWA install flow: captures `beforeinstallprompt`, exposes an iOS Add-to-Home hint.
let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((f) => { try { f(); } catch { /* ignore */ } });

if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export const pwa = {
  get canPrompt() { return !!deferred; },
  get isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  },
  get isIOS() {
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },
  /** Whether the Install button should be offered at all. */
  get available() { return !this.isStandalone && (this.canPrompt || this.isIOS); },
  async prompt() {
    if (!deferred) return 'unavailable';
    const e = deferred; deferred = null; notify();
    try { e.prompt(); const r = await e.userChoice; return r?.outcome || 'dismissed'; } catch { return 'error'; }
  },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
};

/** Ask the browser for fullscreen + landscape lock on mobile (best effort, user gesture only). */
export async function enterImmersive() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches && !pwa.isStandalone) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    await screen.orientation?.lock?.('landscape');
  } catch { /* not supported / denied */ }
}
