/** Isolated GLTF ownership: each load owns its loader-created resources. */
export function disposeGLTF(gltf, mixer) {
  if (!gltf) return;
  const scenes = new Set(gltf.scenes || []);
  if (gltf.scene) scenes.add(gltf.scene);
  mixer?.stopAllAction?.();
  for (const scene of scenes) mixer?.uncacheRoot?.(scene);
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  const addTexture = value => { if (value?.isTexture) textures.add(value); };
  for (const scene of scenes) {
    scene.removeFromParent?.();
    scene.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.skeleton) skeletons.add(node.skeleton);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        materials.add(material);
        Object.values(material).forEach(addTexture);
        for (const uniform of Object.values(material.uniforms || {})) {
          const value = uniform?.value;
          (Array.isArray(value) ? value : [value]).forEach(addTexture);
        }
      }
    });
  }
  // Skeleton.dispose owns boneTexture. Do not dispose that texture twice.
  for (const skeleton of skeletons) textures.delete(skeleton.boneTexture);
  const images = new Set();
  for (const texture of textures) {
    if (texture.source?.data?.close) images.add(texture.source.data);
    texture.dispose();
  }
  for (const image of images) image.close();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

export class AssetSession {
  constructor({ load, makeMixer, beforeRelease = () => {} }) {
    this.loader = load;
    this.makeMixer = makeMixer;
    this.beforeRelease = beforeRelease;
    this.generation = 0;
    this.current = null;
    this.closed = false;
  }
  release() {
    if (!this.current) return;
    const current = this.current;
    this.current = null;
    try { this.beforeRelease(current); }
    finally { disposeGLTF(current.gltf, current.mixer); }
  }
  async load(url) {
    if (this.closed) throw new Error('Asset session is closed');
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    this.release();
    let gltf;
    try { gltf = await this.loader(url, controller.signal); }
    catch (error) {
      if (generation !== this.generation || this.closed || error.name === 'AbortError') return null;
      throw error;
    }
    // Parsing/image decode may finish after fetch cancellation; dispose its result.
    if (this.closed || generation !== this.generation) { disposeGLTF(gltf); return null; }
    let mixer;
    try { mixer = this.makeMixer(gltf.scene); }
    catch (error) { disposeGLTF(gltf); throw error; }
    this.current = { gltf, mixer };
    return this.current;
  }
  dispose() {
    this.closed = true;
    ++this.generation;
    this.controller?.abort();
    this.release();
  }
}
