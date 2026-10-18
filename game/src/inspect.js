// Dev closeup stage: /inspect.html?id=oath-04-ninja&view=face|full|back
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadModel, BodyFactory } from './three/models.js';
const q = new URLSearchParams(location.search), id = q.get('id') ?? 'oath-04-ninja', view = q.get('view') ?? 'face';
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#5d6670');
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .45;
scene.add(new THREE.HemisphereLight('#d5e8ff', '#574a38', 1.1));
const sun = new THREE.DirectionalLight('#fff0ce', 2.4); sun.position.set(-2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0002; sun.shadow.normalBias = .02; scene.add(sun);
const rim = new THREE.DirectionalLight('#9fc4ff', 1.2); rim.position.set(2, 2.5, -3); scene.add(rim);
const camera = new THREE.PerspectiveCamera(view === 'face' ? 22 : 30, innerWidth / innerHeight, .05, 100);
const root = new THREE.Group(); scene.add(root);
const gltf = await loadModel(`./assets/characters/${id}.glb`);
const body = new BodyFactory({ quality: { name: q.get('q') ?? 'high' } }).createGltf(gltf, { kind: 'p', oath: id.slice(0, 7), cls: id.slice(8) }, root);
body.animator.update(.016);
for (const m of body.meshes) { const n = m.material?.name ?? ''; if ((q.has('nogear') && n.startsWith('gear')) || (q.has('nohair') && n.startsWith('hair'))) m.visible = false; }
for (let i = 0; i < 20; i++) body.animator.update(.05);
root.updateMatrixWorld(true);
const head = body.groom?.anchor.children[0] ?? body.sockets.head;
const hp = new THREE.Vector3(); (head ?? root).getWorldPosition(hp);
const yaw = +(q.get('yaw') ?? .35);
if (view === 'face') { camera.position.set(hp.x + Math.sin(yaw) * 1.05, hp.y + .05, hp.z + Math.cos(yaw) * 1.05); camera.lookAt(hp.x, hp.y - .01, hp.z); }
else if (view === 'back') { camera.position.set(hp.x - .5, hp.y + .1, hp.z - 1.2); camera.lookAt(hp.x, hp.y - .03, hp.z); }
else { camera.position.set(1.2, 1.3, 4.6); camera.lookAt(0, .95, 0); }
renderer.render(scene, camera);
window.__info = { meshes: body.meshes.map(m => ({ name: m.name, mat: m.material.name, map: !!m.material.map, nmap: !!m.material.normalMap, color: m.material.color?.getHexString(), r: m.material.roughness, mt: m.material.metalness, verts: m.geometry.attributes.position.count })), hp: hp.toArray() };
window.__done = true;
