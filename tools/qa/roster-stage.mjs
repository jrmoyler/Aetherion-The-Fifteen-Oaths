// Browser entry point for roster-browser.mjs. The production factory and GLTF
// loader construct the same outfits and skeletons used by the player and NPCs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BodyFactory, loadModel } from '../../game/src/three/models.js';
import { referenceFacesReady } from '../../game/src/three/character/reference-face.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(360, 440);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#343c45');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .6;
scene.add(new THREE.HemisphereLight(0xe5eaff, 0xb39d83, 1.5));
for (const [x,y,z,color,intensity] of [[2,4,4,0xffe7cb,2.4], [-3,1,2,0xc0d6ff,1], [-2,3,-2,0xdce9ff,2]]) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(x, y, z);
  scene.add(light);
}
const camera = new THREE.PerspectiveCamera(27, 360 / 440, .025, 80);
const factory = new BodyFactory({ quality: { name: 'high' } });

function isVisible(mesh) {
  for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
  return true;
}

// Sampling indexed vertices excludes the hidden original surface beneath a fitted outfit.
function points(meshes) {
  const result = [], point = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.skeleton.update();
    const { index, attributes } = mesh.geometry;
    const count = index?.count ?? attributes.position.count;
    const stride = Math.max(1, Math.floor(count / 60));
    for (let i = 0; i < count; i += stride) {
      mesh.getVertexPosition(index ? index.getX(i) : i, point);
      result.push(mesh.localToWorld(point).clone());
    }
  }
  return result;
}

function skinStats(meshes) {
  let vertices = 0, blended = 0, maxError = 0;
  for (const mesh of meshes) {
    const { attributes, index } = mesh.geometry;
    const source = index ? new Set(index.array) : Array.from({ length: attributes.position.count }, (_, i) => i);
    for (const v of source) {
      let total = 0, influences = 0;
      for (let k = 0; k < 4; k++) {
        const weight = attributes.skinWeight.getComponent(v, k);
        const joint = attributes.skinIndex.getComponent(v, k);
        if (!Number.isFinite(weight) || weight < 0 || (weight > 0 && !mesh.skeleton.bones[joint])) {
          throw new Error(`Invalid weight or bone in ${mesh.name}, vertex ${v}`);
        }
        total += weight;
        if (weight > .001) influences++;
      }
      vertices++;
      if (influences > 1) blended++;
      maxError = Math.max(maxError, Math.abs(total - 1));
    }
  }
  return { referencedVertices: vertices, blendedVertices: blended, largestWeightError: maxError };
}

window.checkHero = async id => {
  const gltf = await loadModel('/assets/characters/' + id + '.glb');
  const anchor = new THREE.Group();
  scene.add(anchor);
  const body = factory.createGltf(gltf, { kind: 'player', oath: id.slice(0, 7), cls: id.slice(8) }, anchor);
  try {
    const step = n => {
      for (let i = 0; i < n; i++) body.animator.update(1 / 60);
      anchor.updateMatrixWorld(true);
    };
    step(30);
    await referenceFacesReady();
    const meshes = body.meshes.filter(m => m.isSkinnedMesh && isVisible(m) && (m.geometry.index?.count ?? m.geometry.attributes.position.count));
    const bones = new Set(meshes.flatMap(m => m.skeleton.bones));
    const digits = [...bones].filter(b => /^(thumb|index|middle|ring|little)\d/.test(b.name));
    const rest = digits.map(b => b.quaternion.clone()), idle = points(meshes);
    body.animator.playAnim(id.endsWith('ninja') ? 'attack_1' : 'cast_release');
    step(17);
    const posed = points(meshes);
    const maxVertexTravel = posed.reduce((max, v, i) => Math.max(max, v.distanceTo(idle[i])), 0);
    const maxFingerRotationDegrees = THREE.MathUtils.radToDeg(Math.max(0, ...digits.map((b,i) => b.quaternion.angleTo(rest[i]))));
    const h = body.height;
    camera.position.set(h * .39, h * .62, h * 2.32);
    camera.lookAt(0, h * .5, 0);
    renderer.render(scene, camera);
    if (renderer.getContext().isContextLost()) throw new Error(id + ' lost the WebGL context');
    return {
      metrics: { id, visibleSkins: meshes.length, joints: bones.size, ...skinStats(meshes), clips: gltf.animations.length,
        fingerJoints: digits.length, maxFingerRotationDegrees: +maxFingerRotationDegrees.toFixed(2),
        sampledVertices: posed.length, maxVertexTravel: +maxVertexTravel.toFixed(4) },
      image: renderer.domElement.toDataURL('image/jpeg', .92).split(',')[1],
    };
  } finally {
    body.dispose();
    anchor.removeFromParent();
  }
};
