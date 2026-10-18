import { registerSW } from 'virtual:pwa-register';

// An update must never interrupt a fight or replace assets beneath a live world.
// The new application worker waits until the player explicitly chooses to restart.
// Large runtime assets revalidate separately; they are not a version-locked bundle.
let updateSW;
let notice;
let updateAvailable = false;
function offerUpdate() {
  showNotice('A new version of Aetherion is ready. Restart when you are ready to leave your current session.', () => updateSW(true), 'Restart & update');
}
function showNotice(message, action, label) {
  notice?.remove();
  notice = document.createElement('aside');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.style.cssText = 'position:fixed;z-index:10000;bottom:calc(18px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 32px));box-sizing:border-box;padding:16px;background:#14181f;color:#f0e4ce;border:1px solid #b89961;border-radius:8px;font:14px/1.5 system-ui;box-shadow:0 8px 32px #0008;pointer-events:auto';
  const text = document.createElement('p');
  text.textContent = message;
  text.style.margin = '0 0 12px';
  notice.append(text);
  if (action) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = 'padding:10px 16px;margin-right:12px;background:#d4b579;color:#14181f;border:0;border-radius:4px;cursor:pointer;font:inherit';
    button.onclick = action;
    notice.append(button);
  }
  const dismiss = document.createElement('button');
  dismiss.textContent = action ? 'Later' : 'Dismiss';
  dismiss.style.cssText = 'padding:10px;background:transparent;color:inherit;border:1px solid #8b795e;border-radius:4px;cursor:pointer;font:inherit';
  dismiss.onclick = () => notice.remove();
  notice.append(dismiss);
  document.body.append(notice);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable = true; offerUpdate();
    },
    onOfflineReady() {
      showNotice('Aetherion is ready for offline play. Previously visited character assets remain available on this device.');
    },
    onRegisteredSW(_url, registration) {
      // Long-lived installed games should discover releases on resume as well.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (updateAvailable) offerUpdate();
          if (navigator.onLine) registration?.update().catch(() => {});
        }
      });
    },
    onRegisterError(error) {
      console.warn('Offline installation is unavailable for this visit.', error);
    },
  });
}
