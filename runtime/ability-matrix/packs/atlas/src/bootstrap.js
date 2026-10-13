import { installAtlasFailureBridge } from './bridge.js';

// A WebGL constructor failure must not leave the containing matrix loading forever.
try {
  await import('./main.js');
} catch (error) {
  // If initialization failed after installing the bridge, remove its handlers first.
  window.matrix?.dispose?.();
  const message = `Atlas preview could not start: ${error.message || 'WebGL is unavailable in this browser.'}`;
  for (const id of ['hud', 'info', 'editor']) document.getElementById(id).hidden = true;
  const notice = document.createElement('section');
  notice.className = 'panel';
  notice.style.cssText = 'left:12px;top:12px;max-width:calc(100% - 24px)';
  notice.setAttribute('role', 'alert');
  const title = document.createElement('strong');
  title.textContent = 'Ability preview unavailable';
  const detail = document.createElement('p');
  detail.textContent = `${message} Try reloading in a WebGL-enabled browser.`;
  notice.append(title, detail);
  document.getElementById('stage').replaceChildren(notice);
  const bridge = installAtlasFailureBridge({ message });
  addEventListener('pagehide', () => bridge.dispose(), { once: true });
}
