// Inspection and gameplay share the exact same skinned model and animation mixer.
import { WebGLRenderer, Scene, PerspectiveCamera, Color, HemisphereLight, DirectionalLight, Group, ACESFilmicToneMapping } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadModel, createModelBody } from '../three/models.js';
import { equipArmor } from '../three/actor-armor.js';
import { attachWeapon } from '../three/actor-weapons.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { h, prefersReducedMotion } from './dom.js';
export function inspectCharacter({ oath, cls }) {
  const o = OATH_BY_ID[oath]; if (!o || !['ninja', 'sorcerer'].includes(cls)) return;
  const previous = document.activeElement;
  const close = h('button', { class: 'ae-btn', type: 'button' }, 'Close');
  const canvas = h('canvas', { 'aria-label': `${o[cls].title} 3D preview`, tabindex: '0' });
  const status = h('p', { class: 'ae-inspect__status', role: 'status' }, 'Loading your Oath’s skinned character…');
  const buttons = h('div', { class: 'ae-inspect__controls' });
  const dialog = h('dialog', { class: 'ae-inspect', 'aria-labelledby': 'ae-inspect-heading' }, h('header', null, h('div', null, h('small', null, `${o.name} · ${cls}`), h('h2', { id: 'ae-inspect-heading' }, o[cls].title)), close), canvas, status, buttons);
  dialog.style.setProperty('--accent', o.accent); document.body.append(dialog);
  let renderer, controls, body, observer, frame, disposed = false, animate = !prefersReducedMotion();
  const cleanup = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); body?.dispose(); renderer?.dispose(); dialog.remove(); if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  close.onclick = () => dialog.close(); dialog.addEventListener('close', cleanup, { once: true }); dialog.showModal(); close.focus();
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.toneMapping = ACESFilmicToneMapping;
    const scene = new Scene(); scene.background = new Color('#10151c');
    const camera = new PerspectiveCamera(35, 1, .05, 30); camera.position.set(0, 1.2, 3.8);
    controls = new OrbitControls(camera, canvas); controls.target.set(0, .9, 0); controls.minDistance = 2.2; controls.maxDistance = 5.5; controls.enablePan = false; controls.enableDamping = true;
    scene.add(new HemisphereLight('#e6eafa', '#302a25', 2));
    const key = new DirectionalLight('#fff0d8', 3); key.position.set(3, 4, 5); scene.add(key);
    const rim = new DirectionalLight(o.accent, 2); rim.position.set(-3, 2, -3); scene.add(rim);
    const anchor = new Group(); scene.add(anchor);
    const button = (label, fn) => { const b = h('button', { class: 'ae-btn ae-btn--sm', type: 'button' }, label); b.onclick = fn; buttons.append(b); };
    button('Rotate left', () => { anchor.rotation.y -= Math.PI / 6; }); button('Rotate right', () => { anchor.rotation.y += Math.PI / 6; });
    button('Idle', () => { animate = true; if (body) { body.animator.speed = 0; body.animator.setState('loco'); } });
    button('Walk', () => { animate = true; if (body) { body.animator.speed = 2.5; body.animator.setState('loco'); } });
    button('Attack', () => { animate = true; body?.animator.playAnim(cls === 'sorcerer' ? 'cast_release' : 'attack_1'); }); button('Freeze pose', () => { animate = false; });
    observer = new ResizeObserver(() => { const width = canvas.clientWidth || 320, height = canvas.clientHeight || 400; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }); observer.observe(canvas);
    let last = performance.now(); const loop = now => { if (disposed) return; const dt = Math.min((now - last) / 1000, .05); last = now; if (!document.hidden) { if (animate) body?.animator.update(dt); controls.update(); renderer.render(scene, camera); } frame = requestAnimationFrame(loop); }; frame = requestAnimationFrame(loop);
    loadModel(`./assets/characters/${oath}-${cls}.glb`).then(gltf => { if (disposed) return; body = createModelBody(gltf, anchor); equipArmor(body, { oath, cls, kind: 'player' }); attachWeapon(body, { oath, cls, kind: 'player' }); controls.target.y = body.height * .52; status.textContent = 'Playable rigged character · drag to orbit, pinch or scroll to zoom.'; }).catch(() => { if (!disposed) status.textContent = 'Character model could not load. Close and retry when connected.'; });
  } catch (error) { status.textContent = '3D inspection is unavailable on this device. Close to continue.'; console.warn('[preview]', error); }
  return { close: () => dialog.close() };
}
