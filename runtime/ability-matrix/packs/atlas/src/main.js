import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NEW_PRESETS, createPresetRuntime } from '../../../presets/runtime.js';
import { installAtlasBridge } from './bridge.js';

const el = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('hud') === '0') document.documentElement.classList.add('embedded');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b1220');
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 100);
camera.position.set(10, 10, 14);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
el('stage').append(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, .5, -1);
orbit.enableDamping = true;
orbit.minDistance = 5;
orbit.maxDistance = 28;
orbit.maxPolarAngle = 1.48;
orbit.update();
scene.add(new THREE.HemisphereLight('#b4d8ff', '#182136', 2.5));
const sun = new THREE.DirectionalLight('#fff4d4', 4);
sun.position.set(4, 8, 6);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50),
  new THREE.MeshStandardMaterial({ color: '#172638', roughness: .75, metalness: .3 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.035;
scene.add(floor, new THREE.GridHelper(40, 40, '#526a80', '#23394d'));

const player = new THREE.Mesh(new THREE.CapsuleGeometry(.25, 1.1, 5, 12),
  new THREE.MeshStandardMaterial({ color: '#d1f2ae', emissive: '#294927' }));
scene.add(player);
const targets = [[-3, 0, -3], [0, 0, -4], [3, 0, -3]].map((position) => {
  const root = new THREE.Group();
  root.position.fromArray(position);
  const material = new THREE.MeshStandardMaterial({ color: '#6988a6', metalness: .65, roughness: .3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.3, 1, 4, 10), material);
  body.position.y = .8;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.23, 1), material);
  head.position.y = 1.66;
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(.8, .09),
    new THREE.MeshBasicMaterial({ color: '#bfe991', side: THREE.DoubleSide }));
  bar.position.y = 2.1;
  root.add(body, head, bar);
  scene.add(root);
  return { root, material, bar, hp: 65, flash: 0, home: root.position.clone() };
});
let events = 0, lastEvent = 'Ready';
function resetScene() {
  player.position.set(0, .8, 4);
  for (const target of targets) {
    target.hp = 65; target.flash = 0;
    target.root.position.copy(target.home);
    target.material.emissive.set(0);
  }
  events = 0;
  lastEvent = 'Ready';
}
resetScene();
const center = new THREE.Vector3(), direction = new THREE.Vector3();
const runtime = createPresetRuntime({ scene, camera, renderer, onEvent(event) {
  events++;
  lastEvent = `${event.type} · ${event.time.toFixed(2)}s`;
  center.fromArray(event.position);
  if (event.type === 'teleport') { player.position.copy(center); player.position.y += .8; }
  for (const target of targets) {
    // Hits are measured on the ground; relay/projectile events occur at body height.
    const distance = Math.hypot(target.root.position.x - center.x, target.root.position.z - center.z);
    if (distance > (event.radius || 1) + .35) continue;
    if (event.type === 'damage') target.hp = Math.max(0, target.hp - event.amount);
    if (event.type === 'heal') target.hp = Math.min(100, target.hp + event.amount);
    if (event.type === 'knockback' && event.direction)
      target.root.position.addScaledVector(direction.fromArray(event.direction), Math.min(.8, event.amount * .12));
    if (['damage', 'heal', 'status', 'knockback'].includes(event.type)) target.flash = .3;
  }
} });
for (const preset of NEW_PRESETS) {
  const option = document.createElement('option');
  option.value = preset.id;
  option.textContent = preset.name;
  el('preset').append(option);
}
const aim = new THREE.Mesh(new THREE.RingGeometry(.95, 1, 64),
  new THREE.MeshBasicMaterial({ color: '#b7e8ff', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
aim.rotation.x = -Math.PI / 2;
aim.position.set(0, .04, -3);
aim.visible = false;
scene.add(aim);

let matrix;
function refresh(state) {
  el('preset').value = state.selectedId;
  el('description').textContent = NEW_PRESETS.find((item) => item.id === state.selectedId).description;
  el('pause').textContent = state.paused ? 'Resume' : 'Pause';
  for (const [id, value] of [['pause', state.paused], ['auto', !!state.autoId], ['arm', state.armed], ['tune', state.editorVisible]])
    el(id).setAttribute('aria-pressed', String(value));
  el('editor').hidden = !state.editorVisible;
  aim.visible = state.armed;
  orbit.enabled = !state.armed;
  if (matrix && !state.disposed) {
    const settings = matrix.preset(state.selectedId).settings;
    for (const [key, value] of Object.entries(settings)) el('settings').elements.namedItem(key).value = value;
    aim.scale.setScalar(settings.radius);
    aim.material.color.set(settings.color);
  }
}
matrix = installAtlasBridge({
  runtime, onReset: resetScene, onState: refresh,
  getCastOptions: () => ({ origin: player.position.clone().setY(0), target: [0, 0, -3], targets: targets.map((target) => target.root.position.clone()) })
});
refresh(matrix.state);

el('preset').onchange = () => matrix.arm(el('preset').value);
el('cast').onclick = () => matrix.cast();
el('arm').onclick = () => matrix.arm(matrix.state.selectedId);
el('auto').onclick = () => matrix.state.autoId ? matrix.stopAuto() : matrix.auto();
el('clear').onclick = () => matrix.clear();
el('pause').onclick = () => matrix.action('togglePause');
el('tune').onclick = () => matrix.action('toggleEditor');
el('close').onclick = () => matrix.setEditor(false);
el('reset').onclick = () => { matrix.resetPreset(); el('error').textContent = ''; };
el('settings').onsubmit = (event) => {
  event.preventDefault();
  const patch = Object.fromEntries([...new FormData(el('settings'))].map(([key, value]) => [key, key === 'color' ? value : Number(value)]));
  el('error').textContent = matrix.applyPreset(matrix.state.selectedId, patch) ? 'Applied. Cast to preview.' : 'Check the tuning values.';
};

const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function groundPoint(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(ground, hit)) return null;
  const origin = player.position.clone().setY(0);
  const offset = hit.clone().sub(origin);
  if (offset.length() > 16) hit.copy(offset.setLength(16)).add(origin);
  return hit;
}
function point(event) {
  if (!matrix.state.armed) return;
  const target = groundPoint(event);
  if (target) aim.position.copy(target).setY(.04);
}
function confirm(event) {
  if (!matrix.state.armed || event.button !== 0) return;
  const target = groundPoint(event);
  if (target) matrix.cast(matrix.state.selectedId, { target: target.toArray() });
}
renderer.domElement.addEventListener('pointermove', point);
renderer.domElement.addEventListener('pointerup', confirm);
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
let previous = null;
renderer.setAnimationLoop((time) => {
  const dt = previous === null ? 0 : Math.min(Math.max((time - previous) / 1000, 0), .05);
  previous = time;
  matrix.update(dt);
  orbit.update();
  for (const target of targets) {
    if (!matrix.state.paused) target.flash = Math.max(0, target.flash - dt);
    target.material.emissive.setRGB(target.flash * .7, target.flash * .95, target.flash * 1.3);
    target.bar.scale.x = Math.max(.02, target.hp / 100);
    target.bar.quaternion.copy(camera.quaternion);
  }
  renderer.render(scene, camera);
  if (params.get('hud') !== '0') el('info').textContent = `${matrix.state.paused ? 'PAUSED' : 'RUNNING'} · Effects ${runtime.stats.active} · Events ${events}\n${lastEvent}\nTarget health: ${targets.map((target) => Math.round(target.hp)).join(' / ')}`;
});

function dispose() {
  renderer.setAnimationLoop(null);
  removeEventListener('resize', resize);
  renderer.domElement.removeEventListener('pointermove', point);
  renderer.domElement.removeEventListener('pointerup', confirm);
  matrix.dispose();
  orbit.dispose();
  const geometries = new Set(), materials = new Set();
  scene.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  renderer.dispose();
}
addEventListener('pagehide', dispose, { once: true });
