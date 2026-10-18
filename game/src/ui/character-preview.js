// On-demand inspection of the same body and animation used by gameplay.
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { BodyFactory } from '../actors/bodies.js';
import { AssetLibrary } from '../actors/assets.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { h, prefersReducedMotion } from './dom.js';

export function inspectCharacter({ oath, cls }) {
  const o = OATH_BY_ID[oath];
  if (!o || !['ninja', 'sorcerer'].includes(cls)) return;
  const previous = document.activeElement;
  const close = h('button', { class: 'ae-btn', type: 'button', autofocus: true }, 'Close');
  const canvas = h('canvas', { 'aria-label': `${o[cls].title} 3D preview`, tabindex: '0' });
  const status = h('p', { class: 'ae-inspect__status', role: 'status' }, 'Preparing character…');
  const controls = h('div', { class: 'ae-inspect__controls' });
  const dialog = h('dialog', { class: 'ae-inspect', 'aria-labelledby': 'ae-inspect-heading' },
    h('header', null, h('div', null, h('small', null, `${o.name} · ${cls}`), h('h2', { id: 'ae-inspect-heading' }, o[cls].title)), close),
    canvas, status, controls);
  dialog.style.setProperty('--accent', o.accent);
  document.body.append(dialog);
  let engine, scene, body, assets, observer, disposed = false, animate = !prefersReducedMotion();
  const cleanup = () => {
    if (disposed) return;
    disposed = true; observer?.disconnect(); engine?.stopRenderLoop();
    body?.dispose(); assets?.dispose(); scene?.dispose(); engine?.dispose();
    dialog.remove(); previous?.isConnected && previous.focus?.({ preventScroll: true });
  };
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.showModal();
  close.focus();
  try {
    engine = new Engine(canvas, true, { stencil: true, powerPreference: 'low-power' });
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, 1.5));
    scene = new Scene(engine);
    scene.clearColor = new Color4(.035, .045, .065, 1);
    const camera = new ArcRotateCamera('inspection', Math.PI / 2, Math.PI / 2.3, 3.7, new Vector3(0, .95, 0), scene);
    camera.lowerRadiusLimit = 2.4; camera.upperRadiusLimit = 5.5;
    camera.lowerBetaLimit = .35; camera.upperBetaLimit = Math.PI / 2;
    camera.wheelPrecision = 90; camera.panningSensibility = 0;
    camera.attachControl(canvas, true);
    new HemisphericLight('fill', new Vector3(0, 1, 0), scene).intensity = .95;
    const key = new DirectionalLight('key', new Vector3(-.6, -1, -.7), scene); key.intensity = 2;
    const rim = new HemisphericLight('rim', new Vector3(1, 0, -1), scene);
    rim.diffuse = Color3.FromHexString(o.accent); rim.intensity = .35;
    const ctx = { scene, quality: { name: 'medium' }, params: new URLSearchParams() };
    const factory = new BodyFactory(ctx);
    const anchor = new TransformNode('inspection-body', scene);
    const desc = { kind: 'player', oath, cls };
    body = factory.createProcedural(desc, anchor);
    status.textContent = 'Loading authored model…';
    function button(label, fn) { const b = h('button', { class: 'ae-btn ae-btn--sm', type: 'button' }, label); b.onclick = fn; controls.append(b); }
    button('Rotate left', () => { camera.alpha -= Math.PI / 6; });
    button('Rotate right', () => { camera.alpha += Math.PI / 6; });
    button('Idle', () => { animate = true; body.animator.speed = 0; body.animator.setState('loco'); });
    button('Walk', () => { animate = true; body.animator.speed = 2.5; body.animator.setState('loco'); });
    button('Attack', () => { animate = true; body.animator.playAnim(cls === 'sorcerer' ? 'cast_release' : 'attack_1'); });
    button('Freeze pose', () => { animate = false; });
    observer = new ResizeObserver(() => engine.resize()); observer.observe(canvas);
    engine.resize();
    engine.runRenderLoop(() => {
      if (document.hidden || disposed) return;
      scene.animationsEnabled = animate;
      if (animate) body.animator.update(Math.min(engine.getDeltaTime() / 1000, .05));
      scene.render();
    });
    assets = new AssetLibrary(ctx);
    assets.start();
    // AssetLibrary owns URL construction, offline cache behavior and loader registration.
    assets.firstPoll.then(async () => {
      if (disposed) return;
      const url = assets.characterUrl(`${oath}-${cls}`);
      const container = url ? await assets.load(url) : null;
      if (disposed) return;
      if (!container) { status.textContent = 'Procedural character shown · authored model unavailable offline or still loading.'; return; }
      const replacement = factory.createGltf(container, desc, anchor);
      replacement.animator.speed = body.animator.speed;
      body.dispose(); body = replacement;
      status.textContent = 'Playable model · drag to orbit, scroll to zoom, or use the controls.';
    }).catch(() => { if (!disposed) status.textContent = 'Procedural character shown · model could not be loaded.'; });
  } catch (error) {
    observer?.disconnect(); engine?.stopRenderLoop(); body?.dispose(); body = null;
    assets?.dispose(); scene?.dispose(); scene = null; engine?.dispose(); engine = null;
    status.textContent = '3D inspection is unavailable on this device. Close to continue choosing your character.';
    console.warn('[ui] character inspection', error);
  }
  return { close: () => dialog.close() };
}
