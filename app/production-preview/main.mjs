import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetSession } from './lifecycle.mjs';
import { normalizeManifest } from './catalog.mjs';

const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const canvas = $('viewport');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (error) { status(`WebGL unavailable: ${error.message}`); throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#202730');
const camera = new THREE.PerspectiveCamera(40, 1, .01, 2000); camera.position.set(3, 2, 3);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xe9f1ff, 0x6f6557, 2));
const key = new THREE.DirectionalLight(0xfff4e2, 3); key.position.set(4, 7, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xc9ddff, 1.3); fill.position.set(-4, 3, -3); scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x343b44, roughness: .95 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const loader = new GLTFLoader();
const originalMaterials = new Map();
const originalTextures = new Map();
let normalMaterial = null;
function restoreMaterials() {
  for (const [mesh, material] of originalMaterials) mesh.material = material;
  for (const [material, properties] of originalTextures) { Object.assign(material, properties); material.needsUpdate = true; }
  originalMaterials.clear(); originalTextures.clear(); normalMaterial?.dispose(); normalMaterial = null;
}
const session = new AssetSession({
  load: async (url, signal) => {
    const absolute = new URL(url, location.href);
    const response = await fetch(absolute, { signal });
    if (!response.ok) throw new Error(`GLB request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return loader.parseAsync(bytes, new URL('.', absolute).href);
  },
  makeMixer: root => new THREE.AnimationMixer(root),
  beforeRelease: restoreMaterials
});
let assets = [], selected = null, shuttingDown = false;
function option(value, text) { const node = document.createElement('option'); node.value = value; node.textContent = text; return node; }
function applyMaterials() {
  restoreMaterials();
  const root = session.current?.gltf.scene;
  if (!root) return;
  const mode = $('material').value;
  if (mode === 'normals') normalMaterial = new THREE.MeshNormalMaterial({ wireframe: $('wireframe').checked });
  root.traverse(node => {
    if (!node.isMesh) return;
    originalMaterials.set(node, node.material);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material || originalTextures.has(material)) continue;
      const properties = { wireframe: material.wireframe };
      for (const [key, value] of Object.entries(material)) if (value?.isTexture) properties[key] = value;
      originalTextures.set(material, properties);
      material.wireframe = $('wireframe').checked;
      if (mode === 'untextured') for (const key of Object.keys(properties)) if (properties[key]?.isTexture) material[key] = null;
      material.needsUpdate = true;
    }
    if (normalMaterial) node.material = normalMaterial;
  });
}
function fit() {
  const root = session.current?.gltf.scene;
  if (!root) return;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, .05);
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2), horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.2;
  camera.position.copy(center).add(new THREE.Vector3(1, .65, 1).normalize().multiplyScalar(distance));
  camera.near = Math.max(radius / 1000, .001); camera.far = Math.max(distance * 20, 100); camera.updateProjectionMatrix();
  controls.target.copy(center); controls.maxDistance = distance * 8; controls.minDistance = radius * .2; controls.update();
  ground.position.y = box.min.y - .005; ground.scale.setScalar(Math.max(1, radius));
}
function animateSelection() {
  const current = session.current; if (!current) return;
  current.mixer.stopAllAction();
  const clip = current.gltf.animations[Number($('animation').value)];
  if ($('animation').value !== '' && clip) current.mixer.clipAction(clip).reset().play();
}
function metrics(gltf) {
  let meshes = 0, triangles = 0, bones = 0; const materials = new Set(), textures = new Set();
  gltf.scene.traverse(node => {
    if (node.isBone) bones++;
    if (!node.isMesh) return; meshes++;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position?.count ?? 0) / 3;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) { materials.add(material); Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); }); }
  });
  $('metrics').replaceChildren();
  for (const [name, value] of Object.entries({ Meshes: meshes, Triangles: Math.round(triangles).toLocaleString(), Materials: materials.size, Textures: textures.size, Bones: bones, Clips: gltf.animations.length })) {
    const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value; $('metrics').append(dt, dd);
  }
}
async function loadLOD() {
  const state = selected?.states.find(state => state.value === $('state').value);
  const lod = state?.lods.find(lod => String(lod.level) === $('lod').value);
  if (!lod) return;
  $('metrics').replaceChildren(); $('animation').replaceChildren(option('', 'Rest pose'));
  status(`Loading ${selected.name} · ${state.value} · LOD ${lod.level}…`);
  try {
    const current = await session.load(lod.url); if (!current) return;
    scene.add(current.gltf.scene);
    current.gltf.animations.forEach((clip, i) => $('animation').append(option(String(i), clip.name || `Clip ${i + 1}`)));
    metrics(current.gltf); applyMaterials(); fit();
    status(`${selected.name} · ${state.value} · LOD ${lod.level} loaded. ${selected.status || 'PRODUCTION_CANDIDATE_UNREVIEWED'}`);
  } catch (error) { status(`Unable to load asset: ${error.message}`); }
}
function selectAsset() {
  selected = assets.find(asset => asset.key === $('asset').value);
  $('identity').textContent = selected ? `ID: ${selected.id}${selected.archetypeId ? ` · Archetype: ${selected.archetypeId}` : ''}${selected.variant ? ` · Variant: ${selected.variant}` : ''}` : '';
  $('state').replaceChildren(...(selected?.states || []).map(state => option(state.value, state.label)));
  selectState();
}
function selectState() {
  const state = selected?.states.find(state => state.value === $('state').value);
  $('lod').replaceChildren(...(state?.lods || []).map(lod => option(String(lod.level), `LOD ${lod.level}`)));
  $('lod').disabled = (state?.lods.length || 0) < 2;
  loadLOD();
}
$('asset').addEventListener('change', selectAsset); $('lod').addEventListener('change', loadLOD);
$('state').addEventListener('change', selectState);
$('animation').addEventListener('change', animateSelection);
$('material').addEventListener('change', applyMaterials); $('wireframe').addEventListener('change', applyMaterials); $('fit').addEventListener('click', fit);
const resize = new ResizeObserver(() => { const { width, height } = canvas.parentElement.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }); resize.observe(canvas.parentElement);
let lastTime = performance.now();
renderer.setAnimationLoop(time => { const dt = Math.min(Math.max((time - lastTime) / 1000, 0), .1); lastTime = time; if ($('playing').checked) session.current?.mixer.update(dt); controls.update(); renderer.render(scene, camera); });
window.addEventListener('pagehide', () => { shuttingDown = true; renderer.setAnimationLoop(null); resize.disconnect(); session.dispose(); controls.dispose(); ground.geometry.dispose(); ground.material.dispose(); renderer.dispose(); }, { once: true });
try {
  const response = await fetch('./production-assets/catalog.json'); if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json(); const errors = [];
  for (const manifest of catalog.manifests) {
    try { const response = await fetch(`./production-assets/${manifest}`); if (!response.ok) throw new Error(`HTTP ${response.status}`); assets.push(...normalizeManifest(await response.json(), manifest)); }
    catch (error) { errors.push(`${manifest}: ${error.message}`); }
  }
  if (!shuttingDown) {
    $('asset').replaceChildren(...assets.map(asset => option(asset.key, `${asset.oath} · ${asset.name}`)));
    if (assets.length) selectAsset(); else { $('asset').append(option('', 'No exports available')); status(errors.length ? errors.join('; ') : 'No authored manifests available yet. Add an exported asset manifest, then reload.'); }
    if (errors.length && assets.length) $('acceptance').textContent += ` Manifest warnings: ${errors.join('; ')}`;
  }
} catch (error) { status(`Manifest discovery failed: ${error.message}`); }
