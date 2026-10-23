// The covenant screen presents the same authored hero pipeline used in gameplay.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BodyFactory, loadModel } from '../three/models.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { h, prefersReducedMotion } from './dom.js';
import './oath-stage.css';

export function createOathStage() {
  const title = h('h2'), subtitle = h('p'), status = h('span', { role: 'status' });
  const canvas = h('canvas', { tabindex: '0', 'aria-label': 'Selected character. Drag to rotate.' });
  const retry = h('button', { type: 'button', class: 'ae-btn ae-btn--sm', hidden: true }, 'Retry character');
  const left = h('button', { type: 'button', 'aria-label': 'Rotate character left' }, '↶');
  const right = h('button', { type: 'button', 'aria-label': 'Rotate character right' }, '↷');
  const pose = h('button', { type: 'button' }, 'Try stance');
  const el = h('section', { class: 'ae-oath-stage', 'aria-label': 'Your chosen hero' }, canvas,
    h('div', { class: 'ae-oath-stage__heading' }, h('small', null, 'YOUR COVENANT / YOUR FORM'), title, subtitle),
    h('div', { class: 'ae-oath-stage__status' }, status, retry),
    h('div', { class: 'ae-oath-stage__tools' }, left, h('span', null, 'Drag to turn'), right, pose));
  let renderer, scene, camera, controls, anchor, set, body, rim, observer, frame;
  let active = false, version = 0, selection, last = 0, poseTime = 0;
  const factory = new BodyFactory({ quality: { name: 'medium' } });
  const clearSet = () => { set?.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } }); set?.removeFromParent(); };
  function decorate(o) {
    clearSet(); set = new THREE.Group(); scene.add(set);
    const add = (geo, color, position, rotation = [0, 0, 0], metalness = .1) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: .76, metalness }));
      mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.receiveShadow = true; set.add(mesh); return mesh;
    };
    add(new THREE.CylinderGeometry(1.3, 1.48, .18, 32), o.palette.stone, [0, -.13, 0]);
    add(new THREE.CylinderGeometry(1.5, 1.55, .08, 32), o.palette.primary, [0, -.24, 0]);
    add(new THREE.TorusGeometry(1.32, .018, 6, 64), o.accent, [0, -.03, 0], [Math.PI / 2, 0, 0], .6);
    // Architectural witnesses frame the silhouette, kept behind the playable model.
    const crystal = ['frost', 'earth', 'cosmic', 'arcane'].includes(o.element);
    const organic = ['nature', 'poison', 'wind'].includes(o.element);
    const count = 4 + o.index % 4;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * (.2 + .6 * i / (count - 1));
      const x = Math.cos(angle) * 2.05, z = -Math.sin(angle) * 1.45 - .25;
      const height = 1.2 + ((i * 7 + o.index * 3) % 9) * .16;
      const geo = crystal ? new THREE.ConeGeometry(.22, height, 5) : organic ? new THREE.CylinderGeometry(.035, .09, height, 6) : new THREE.BoxGeometry(.2 + o.index % 3 * .04, height, .22);
      add(geo, i % 2 ? o.palette.trim : o.palette.stone, [x, height / 2 - .17, z], [0, angle, organic ? x * -.12 : 0]);
      if (!organic) add(new THREE.BoxGeometry(.1, .05, .24), o.accent, [x, height - .16, z]);
    }
    scene.background.set(o.palette.primary).multiplyScalar(.26);
    scene.fog.color.copy(scene.background); rim.color.set(o.accent);
  }
  function resize() {
    if (!renderer) return;
    const width = Math.max(1, el.clientWidth), height = Math.max(1, el.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  function frameLoop(now) {
    if (!active) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    if (!document.hidden && el.getClientRects().length) {
      if (!prefersReducedMotion() || poseTime > 0) body?.animator.update(dt);
      poseTime = Math.max(0, poseTime - dt);
      controls.update(); renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(frameLoop);
  }
  function boot() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.4)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#080b11'); scene.fog = new THREE.Fog('#080b11', 5, 14);
      camera = new THREE.PerspectiveCamera(35, 1, .05, 30);
      camera.position.set(.2, 1.25, 4.6);
      controls = new OrbitControls(camera, canvas); controls.enablePan = false; controls.enableZoom = false;
      controls.minPolarAngle = .8; controls.maxPolarAngle = 1.7; controls.target.set(0, 1, 0); controls.update();
      scene.add(new THREE.HemisphereLight('#e2eafa', '#3b302c', 2));
      const key = new THREE.DirectionalLight('#ffecd4', 3.3); key.position.set(3, 4, 4); scene.add(key);
      rim = new THREE.DirectionalLight('#a8cfff', 2.6); rim.position.set(-3, 3, -2); scene.add(rim);
      anchor = new THREE.Group(); scene.add(anchor);
      observer = new ResizeObserver(resize); observer.observe(el); resize();
      return true;
    } catch (error) {
      renderer?.dispose(); renderer = null;
      el.dataset.status = 'error'; status.textContent = '3D view unavailable. Your chosen hero is shown in the discipline cards.';
      return false;
    }
  }
  async function update(oath, cls) {
    selection = { oath, cls }; const o = OATH_BY_ID[oath]; if (!o) return;
    title.textContent = o[cls].title; subtitle.textContent = `${o.name} · ${o.elementLabel}`;
    el.style.setProperty('--stage-accent', o.accent); el.dataset.oath = oath; el.dataset.cls = cls; el.dataset.class = cls;
    canvas.setAttribute('aria-label', `${o[cls].title}, ${o.elementLabel}. Drag to rotate.`);
    if (!active || !boot()) return;
    const request = ++version;
    body?.dispose(); body = null; anchor.rotation.y = -.12; decorate(o);
    status.textContent = 'Summoning your hero…'; el.dataset.ready = 'false'; el.dataset.status = 'loading'; delete el.dataset.model; retry.hidden = true; pose.disabled = true;
    try {
      const gltf = await loadModel(`./assets/characters/${oath}-${cls}.glb`);
      if (!active || request !== version) return;
      body = factory.createGltf(gltf, { oath, cls, kind: 'player' }, anchor);
      const height = Math.max(1.5, body.height);
      controls.target.set(0, height * .52, 0);
      camera.position.set(.2, height * .62, height * 2.35); controls.update();
      body.animator.update(.016); status.textContent = `${o[cls].weapon} · Ready`; el.dataset.ready = 'true'; el.dataset.status = 'ready'; el.dataset.model = `./assets/characters/${oath}-${cls}.glb`; pose.disabled = false;
    } catch (error) {
      if (!active || request !== version) return;
      el.dataset.status = 'error'; status.textContent = 'Your hero could not load. Retry to restore the preview.'; retry.hidden = false;
    }
  }
  left.onclick = () => { if (anchor) anchor.rotation.y -= Math.PI / 6; };
  right.onclick = () => { if (anchor) anchor.rotation.y += Math.PI / 6; };
  pose.onclick = () => { body?.animator.playAnim(selection.cls === 'sorcerer' ? 'cast_release' : 'attack_1'); poseTime = 2; };
  retry.onclick = () => selection && update(selection.oath, selection.cls);
  return {
    el, update,
    show() { active = true; if (selection) update(selection.oath, selection.cls); if (renderer) { cancelAnimationFrame(frame); last = performance.now(); frame = requestAnimationFrame(frameLoop); } },
    dispose() { active = false; version++; cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); body?.dispose(); body = null; clearSet(); renderer?.dispose(); renderer = null; },
  };
}
