/** Destination-only equipment lifecycle. THREE and loading are injected to share
 * the host's exact Three.js instance and permit real-object CPU lifecycle tests. */
export const SOURCE_SOCKETS = Object.freeze({ hand: 'mixamorigRightHand', leftHand: 'mixamorigLeftHand', stow: 'mixamorigSpine2' });
export function findSourceSockets(model) {
  const sockets = {};
  model.traverse(node => { if (node.isBone) for (const [key, name] of Object.entries(SOURCE_SOCKETS)) if (node.name === name) sockets[key] = node; });
  if (!sockets.hand) throw new Error(`Source rig has no verified socket ${SOURCE_SOCKETS.hand}`);
  return sockets;
}
export function proposedAlignment(asset) {
  // Every catalog row gets its own visible proposed profile; neither a measured
  // grip fit nor a source gameplay rule is inferred from the asset's name.
  return {
    assetId: asset.id, status: 'PROPOSED_UNREVIEWED',
    hand: { socket: 'hand', positionMeters: [0, 0.035, 0], rotationRadians: [0, 0, -Math.PI / 2], scale: 1 },
    stow: { socket: 'stow', positionMeters: [0, 0.02, -0.18], rotationRadians: [0, 0, Math.PI / 5], scale: 1 },
  };
}
export function disposeEquipmentScene(scene) {
  if (!scene) return;
  scene.removeFromParent();
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set(), images = new Set();
  scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) if (material) materials.add(material);
  });
  for (const m of materials) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
  for (const t of textures) { if (t.source?.data?.close) images.add(t.source.data); t.dispose(); }
  for (const image of images) image.close();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const s of skeletons) s.dispose();
}
export function createEquipmentController({ THREE, model, load, onStatus = () => {} }) {
  const sockets = findSourceSockets(model);
  let generation = 0, pending = null, active = null, disposed = false;
  function clearActive() {
    if (!active) return;
    active.mixer?.stopAllAction(); active.mixer?.uncacheRoot(active.scene);
    disposeEquipmentScene(active.scene); active.mount.removeFromParent(); active = null;
  }
  function cancel() { generation++; pending?.abort(); pending = null; }
  function place(record, placement) {
    const profile = record.alignment[placement];
    const socket = sockets[profile?.socket];
    if (!socket) throw new Error(`Verified ${placement} socket unavailable`);
    socket.updateWorldMatrix(true, false);
    const scale = socket.getWorldScale(new THREE.Vector3());
    if (![scale.x, scale.y, scale.z].every(n => Number.isFinite(n) && n > 1e-9)) throw new Error('Invalid source socket scale');
    socket.add(record.mount);
    record.mount.position.fromArray(profile.positionMeters).divide(scale);
    record.mount.rotation.set(...profile.rotationRadians);
    record.mount.scale.set(profile.scale / scale.x, profile.scale / scale.y, profile.scale / scale.z);
    record.mount.updateMatrixWorld(true);
    record.placement = placement;
  }
  const controller = {
    get active() { return active; },
    get disposed() { return disposed; },
    get sockets() { return { ...sockets }; },
    async equip(asset, placement = 'hand') {
      if (disposed) throw new Error('Equipment controller disposed');
      cancel(); clearActive();
      if (!asset) { onStatus('Equipment off'); return null; }
      const ticket = generation, abort = new AbortController(); pending = abort;
      onStatus(`Loading ${asset.name}…`);
      let gltf;
      try {
        gltf = await load(asset.url, abort.signal);
        if (disposed || ticket !== generation) { disposeEquipmentScene(gltf.scene); return null; }
        const mount = new THREE.Group(); mount.name = `AetherionCandidate:${asset.id}`;
        const record = { asset, scene: gltf.scene, mount, alignment: asset.alignment ?? proposedAlignment(asset), mixer: null, placement };
        mount.add(gltf.scene);
        try {
          place(record, placement);
          if (gltf.animations?.length) {
            record.mixer = new THREE.AnimationMixer(gltf.scene);
            record.mixer.clipAction(gltf.animations[0]).play();
          }
          active = record;
        } catch (error) { mount.removeFromParent(); disposeEquipmentScene(gltf.scene); throw error; }
        onStatus(`${asset.name} · proposed ${placement} alignment; visual fit unverified`);
        return record;
      } catch (error) {
        if (ticket !== generation || disposed || error.name === 'AbortError') return null;
        onStatus(`Equipment failed: ${error.message}`); throw error;
      } finally { if (ticket === generation) pending = null; }
    },
    setPlacement(placement) {
      if (!['hand', 'stow'].includes(placement)) throw new Error('Unknown equipment placement');
      if (active) { place(active, placement); onStatus(`${active.asset.name} · proposed ${placement} alignment; visual fit unverified`); }
    },
    update(dt) { if (active?.mixer && Number.isFinite(dt) && dt >= 0) active.mixer.update(dt); },
    clear() { cancel(); clearActive(); onStatus('Equipment off'); },
    dispose() { if (disposed) return; cancel(); clearActive(); disposed = true; },
  };
  return controller;
}

/** Instance-only hooks preserve original arguments, this and return values. */
export function bindEquipmentToApp(app, controller, onError = console.error) {
  const character = app.character;
  const originalUpdate = character.update, originalDispose = app.dispose;
  const updateDescriptor = Object.getOwnPropertyDescriptor(character, 'update');
  const disposeDescriptor = Object.getOwnPropertyDescriptor(app, 'dispose');
  let removed = false;
  const report = error => { try { onError(error); } catch { /* Equipment reporting must not change source behavior. */ } };
  function update(...args) {
    const result = originalUpdate.apply(this, args);
    try { controller.update(args[0]); } catch (error) { report(error); }
    return result;
  }
  function dispose(...args) { remove(); return originalDispose.apply(this, args); }
  function remove() {
    if (removed) return; removed = true;
    try { controller.dispose(); } catch (error) { report(error); }
    if (character.update === update) { if (updateDescriptor) Object.defineProperty(character, 'update', updateDescriptor); else delete character.update; }
    if (app.dispose === dispose) { if (disposeDescriptor) Object.defineProperty(app, 'dispose', disposeDescriptor); else delete app.dispose; }
  }
  character.update = update; app.dispose = dispose;
  return remove;
}
