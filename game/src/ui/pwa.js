// Capture install availability before the title screen subscribes.
let deferred = null;
let installed = false;
const subs = new Set();
const notify = () => subs.forEach((f) => { try { f(); } catch { /* isolated subscriber */ } });
const media = (query) => typeof window !== 'undefined' ? window.matchMedia?.(query) : null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    if (!installed) deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; notify(); });
  for (const mode of ['standalone', 'fullscreen', 'minimal-ui']) {
    const query = media(`(display-mode: ${mode})`);
    if (query?.addEventListener) query.addEventListener('change', notify);
    else query?.addListener?.(notify); // Older Safari.
  }
}

export const pwa = {
  get canPrompt() { return !!deferred && !installed; },
  get isStandalone() {
    return typeof window !== 'undefined' && (['standalone', 'fullscreen', 'minimal-ui'].some(mode => media(`(display-mode: ${mode})`)?.matches) || window.navigator.standalone === true);
  },
  get isIOS() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },
  get available() { return !installed && !this.isStandalone && (this.canPrompt || this.isIOS); },
  async prompt() {
    if (!deferred || installed) return 'unavailable';
    const event = deferred; deferred = null; notify();
    try {
      await event.prompt();
      const result = await event.userChoice;
      if (result?.outcome === 'accepted') { installed = true; notify(); }
      return result?.outcome || 'dismissed';
    } catch { return 'error'; }
  },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
};

/** Fullscreen rejection must not suppress a separately supported orientation lock. */
export async function enterImmersive() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen && media('(pointer: coarse)')?.matches && !pwa.isStandalone) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch { /* Fullscreen is optional. */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* Lock is optional. */ }
}
