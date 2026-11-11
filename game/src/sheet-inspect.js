// Dev turnaround stage for sheet costumes: /sheet.html?id=oath-01-ninja&views=front,back,side,threeq
// Renders the hero through the game's BodyFactory, one column per view, on the sheets' grey backdrop.
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
