import { Group, InstancedMesh, Matrix4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Reuse exported Daybreak modules at metre scale; no generated substitute art. */
export async function installCourtyard(app) {
  const loader = new GLTFLoader();
  const group = new Group(); group.name = 'Daybreak practice courtyard';
  const resources = new Set();
  function release() {
    group.removeFromParent();
    for (const resource of resources) resource.dispose();
    resources.clear();
  }
  async function instances(file, placements) {
    const gltf = await loader.loadAsync(`./daybreak-assets/${file}`);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      resources.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
      const mesh = new InstancedMesh(node.geometry, node.material, placements.length);
      for (let i = 0; i < placements.length; i++) {
        const [x, z] = placements[i];
        mesh.setMatrixAt(i, new Matrix4().makeTranslation(x, 0, z).multiply(node.matrixWorld));
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); group.add(mesh);
      resources.add(mesh);
    });
  }
  try {
    const floor = [];
    for (let x = -12; x < 12; x += 4) for (let z = -8; z <= 12; z += 4) floor.push([x, z]);
    await instances('floor-bay.glb', floor);
    await instances('public-colonnade.glb', [[-12,-8],[-8,-8],[4,-8],[8,-8],[-12,12],[8,12]]);
    app.scene.add(group);
    const visible = app.ground.mesh.visible;
    app.ground.mesh.visible = false;
    return { group, dispose() { app.ground.mesh.visible = visible; release(); } };
  } catch (error) { release(); throw error; }
}
