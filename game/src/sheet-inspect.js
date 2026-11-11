// Dev turnaround stage for sheet costumes: /sheet.html?id=oath-01-ninja&views=front,back,side,threeq
// Renders the hero through the game's BodyFactory, one column per view, on the sheets' grey backdrop.
// Line-up: ?ids=oath-01-ninja,oath-02-ninja&cols=8&view=front|back|side|threeq (one view of many heroes in a grid).
// Params: q=low|medium|high, clip=<name>&frames=<n> (advance an animation), speed=<m/s>, pose=bind, zoom, look=y.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadModel, BodyFactory } from './three/models.js';
const q = new URLSearchParams(location.search), id = q.get('id') ?? 'oath-01-ninja';
const views = (q.get('views') ?? 'front,back,side,threeq').split(',');
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#c9c9c9');
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .6;
scene.add(new THREE.HemisphereLight('#ffffff', '#8a8580', 1.2));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0003; sun.shadow.normalBias = .02;
sun.shadow.camera.left = -1.5; sun.shadow.camera.right = 1.5; sun.shadow.camera.top = 2.5; sun.shadow.camera.bottom = -.5; scene.add(sun, sun.target);
const root = new THREE.Group(); scene.add(root);
// Line-up mode: ?ids=a,b,c&cols=8 renders every listed hero once (one `view`, default front) into a grid.
if (q.get('ids')) {
  const ids = q.get('ids').split(','), cols = +(q.get('cols') ?? 8), rows = Math.ceil(ids.length / cols), cw = innerWidth / cols, ch = innerHeight / rows;
  const yaw = { front: 0, back: Math.PI, side: Math.PI / 2, threeq: .62 }[q.get('view') ?? 'front'] ?? 0;
  const cam = new THREE.PerspectiveCamera(14 / +(q.get('zoom') ?? 1), cw / ch, .1, 100), factory = new BodyFactory({ quality: { name: q.get('q') ?? 'high' } });
  renderer.setScissorTest(true); renderer.setClearColor('#c9c9c9'); window.__lineup = [];
  for (const [i, hero] of ids.entries()) {
    try {
      const body = factory.createGltf(await loadModel(`./assets/characters/${hero}.glb`), { kind: 'p', oath: hero.slice(0, 7), cls: hero.slice(8) }, root);
      if (q.get('speed')) body.animator.speed = +q.get('speed');
      if (q.get('clip')) body.animator.playAnim(q.get('clip'));
      for (let k = 0; k < +(q.get('frames') ?? 20); k++) body.animator.update(.05);
      root.updateMatrixWorld(true);
      // Each hero is framed by its own height (or on its face with frame=face), so giants and children both fit.
      const top = new THREE.Vector3(); (body.sockets.head ?? root).getWorldPosition(top); const tall = top.y + .27, face = q.get('frame') === 'face';
      const lookY = face ? top.y + .1 : tall * .5, x = (i % cols) * cw, y = innerHeight - (Math.floor(i / cols) + 1) * ch;
      cam.fov = face ? 2.6 : 14 * (tall / 1.84) / +(q.get('zoom') ?? 1); cam.updateProjectionMatrix();
      cam.position.set(Math.sin(yaw) * 8.6, lookY + .12, Math.cos(yaw) * 8.6); cam.lookAt(0, lookY, 0);
      sun.position.set(Math.sin(yaw - .7) * 4, 4.5, Math.cos(yaw - .7) * 4); sun.target.position.set(0, 1, 0); sun.target.updateMatrixWorld();
      renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch); renderer.render(scene, cam);
      window.__lineup.push([hero, body.sheetCostume?.triangles ?? 0]);
      body.dispose();
    } catch (error) { console.error('lineup', hero, error.message); window.__lineup.push([hero, 'failed']); }
  }
  window.__armor = window.__lineup; window.__done = true;
  await new Promise(() => {});
}

const gltf = await loadModel(`./assets/characters/${id}.glb`);
const body = new BodyFactory({ quality: { name: q.get('q') ?? 'high' } }).createGltf(gltf, { kind: 'p', oath: id.slice(0, 7), cls: id.slice(8) }, root);
if (q.get('pose') === 'bind') body.root.traverse((n) => { if (n.isSkinnedMesh) n.skeleton.pose(); });
else {
  if (q.get('speed')) body.animator.speed = +q.get('speed');
  if (q.get('clip')) body.animator.playAnim(q.get('clip'));
  for (let i = 0; i < +(q.get('frames') ?? 20); i++) body.animator.update(.05);
}
root.updateMatrixWorld(true);
const YAW = { front: 0, back: Math.PI, side: Math.PI / 2, threeq: .62, right: -Math.PI / 2 };
const lookY = +(q.get('look') ?? .93), zoom = +(q.get('zoom') ?? 1), w = innerWidth / views.length;
const camera = new THREE.PerspectiveCamera(14 / zoom, w / innerHeight, .1, 100);
renderer.setScissorTest(true);
views.forEach((view, i) => {
  const yaw = YAW[view] ?? +view, d = 8.6;
  camera.position.set(Math.sin(yaw) * d, lookY + .12, Math.cos(yaw) * d); camera.lookAt(0, lookY, 0);
  // Key light stays over the viewer's left shoulder in every view, as on the sheets.
  sun.position.set(Math.sin(yaw - .7) * 4, 4.5, Math.cos(yaw - .7) * 4); sun.target.position.set(0, 1, 0); sun.target.updateMatrixWorld();
  renderer.setViewport(i * w, 0, w, innerHeight); renderer.setScissor(i * w, 0, w, innerHeight);
  renderer.render(scene, camera);
});
window.__armor = body.sheetCostume ? { id: body.sheetCostume.id, triangles: body.sheetCostume.triangles } : null;
window.__done = true;
