// Shared authored asset pipeline. Each actor gets an independent skeleton/mixer;
// immutable geometry and textures remain shared to keep crowds within mobile budgets.
import { Group, AnimationMixer, LoopOnce, LoopRepeat, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { equipArmor } from './actor-armor.js';
import { attachWeapon } from './actor-weapons.js';
import { GAIT_SPEED, groundClip, isForwardGait } from './character/locomotion.js';
import { waterClips } from './character/water-motion.js';
import { prepareCombatClips } from './combat-clips.js';
import { applyGroom } from './character/groom.js';
import { sheetRecipe, wearSheet } from './character/sheets/wear.js';
const cache = new Map();
const loader = new GLTFLoader();
export function loadModel(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).catch(error => { cache.delete(url); throw error; }));
  return cache.get(url);
}
export class AssetLibrary {
  constructor(ctx) { this.base = ctx.assetBase ?? './assets/'; this.listeners = new Set(); this.firstPoll = Promise.resolve(); }
  start() { for (const fn of this.listeners) fn(); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  characterUrl(key) { return `${this.base}characters/${key}.glb`; }
  async creatureUrl(arch, oath) {
    const dir = `${this.base}creatures/`;
    this.creatureFiles ??= fetch(`${dir}manifest.json`).then(async response => {
      if (!response.ok) throw new Error('Creature manifest unavailable');
      const entries = await response.json();
      return new Map(entries.map(({ id, file }) => [id, file.split('/').pop()]));
    }).catch(() => null);
    const files = await this.creatureFiles;
    // Offline installs can still have the generic GLB cached without its manifest.
    if (!files) return `${dir}${arch}.glb`;
    const file = files.get(`${arch}-${oath}`) ?? files.get(arch);
    return file ? dir + file : null;
  }
  async load(url) { try { return await loadModel(url); } catch { try { return await loadModel(url.replace(/-oath-\d\d(?=\.glb)/, '')); } catch (error) { console.warn('[assets] Model unavailable', url, error); return null; } } }
  dispose() { this.listeners.clear(); }
}
const aliases = { dead: 'death', jump: 'jump_start', fall: 'jump_loop', emote: 'emote_bow', attack: 'attack_1' };
export function createModelBody(gltf, parent, combatTiming = false) {
  const root = clone(gltf.scene); parent.add(root);
  const meshes = [], sockets = {};
  root.traverse(node => {
    if (node.name) {
      sockets[node.name] = node;
      // GLTFLoader sanitizes punctuation for PropertyBinding track names.
      const side = node.name.match(/^(shoulder|upperarm|forearm|hand|thigh|shin|foot|toe)([LR])$/);
      if (side) sockets[`${side[1]}.${side[2]}`] = node;
      const socket = node.name.match(/^socket(head|back|chest|handL|handR)$/);
      if (socket) sockets[`socket.${socket[1].replace(/([LR])$/, '.$1')}`] = node;
    }
    if (!node.isMesh) return;
    node.castShadow = true; node.receiveShadow = true; node.frustumCulled = !node.isSkinnedMesh;
    node.material = Array.isArray(node.material) ? node.material.map(m => m.clone()) : node.material.clone();
    meshes.push(node);
  });
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root), size = box.getSize(new Vector3());
  const mixer = new AnimationMixer(root), actions = new Map((combatTiming ? prepareCombatClips(gltf.animations) : gltf.animations).map(clip => [clip.name.toLowerCase(), mixer.clipAction(clip)]));
  let waterLoaded = false;
  let current, hold = 0, combatHold = 0;
  const materialStates = new Map();
  for (const mesh of meshes) for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
    materialStates.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
  }
  const animator = {
    state: 'loco', stateT: 0, speed: 0, yawVel: 0, channel: false, action: null,
    interval: 0, accum: 0,
    setState(name) {
      if (this.state === name || (name === 'loco' && this.state === 'land' && hold > 0)) return;
      this.state = name;
      this.stateT = 0;
      // These transitions replace any pose left over from a previous action.
      if (name === 'dead' || name === 'loco' || name === 'dodge' || name === 'jump' || name === 'swim') {
        hold = 0;
        this.action = null;
      }
      if (name === 'dead') this.select('death', true, { restart: true });
      if (name === 'land') this.playAnim('land');
    },
    playAnim(name, opts = {}) {
      if (this.state === 'dead' && name !== 'death' && name !== 'dead') return;
      if (name === 'hit' && this.action === 'hit' && hold > .12) return;
      if (/^(attack_|cast_)/.test(name)) combatHold = 3;
      const loop = opts.loop ?? name === 'cast_channel';
      const selected = this.select(name, !loop, { ...opts, restart: true });
      if (!selected) return;
      this.action = name;
      const speed = Math.max(.05, Math.abs(opts.speed ?? 1));
      // Use the authored duration, including playback rate. A channel persists
      // until its release event (or a bounded fallback if the event is lost).
      hold = loop ? Math.max(2, selected.getClip().duration / speed) : selected.getClip().duration / speed;
    },
    select(name, once = false, opts = {}) {
      name = aliases[name] ?? name;
      if ((name === 'swim' || name === 'tread_water') && !waterLoaded && combatTiming) {
        for (const clip of waterClips(gltf.scene, size.y)) {
          if (!actions.has(clip.name)) actions.set(clip.name, mixer.clipAction(clip));
        }
        waterLoaded = true;
      }
      if (name === 'tread_water' && !actions.has(name)) name = 'swim';
      if (name === 'swim' && !actions.has(name)) name = 'walk';
      const next = actions.get(name) ?? actions.get(name.replace(/_\d$/, '_1')) ?? actions.get('idle');
      if (!next) return null;
      if (current === next && !opts.restart) return next;
      this.setHandsFree?.(name === 'swim' || name === 'tread_water');
      const previous = current;
      const blend = Math.max(0, opts.blend ?? (once ? .055 : .14));
      next.stopFading().reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      // Walk, run and sprint all start on the same authored contact foot.
      // Transfer cycle phase so changing gait does not snap back to heel strike.
      if (!once && !opts.restart && isForwardGait(name) && isForwardGait(previous?.getClip().name)) {
        next.time = previous.time / previous.getClip().duration * next.getClip().duration;
      }
      if (opts.time) next.time = Math.min(opts.time, next.getClip().duration);
      next.clampWhenFinished = once;
      next.enabled = true; next.setEffectiveTimeScale(Math.max(.05, opts.speed ?? 1));
      next.setEffectiveWeight(1).play();
      // Restarting a clip must not fade it out against itself.
      if (previous && previous !== next) { next.fadeIn(blend); previous.fadeOut(blend); }
      current = next;
      return next;
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return false;
      this.stateT += dt;
      // Evaluate distant skeletons less often, retaining all elapsed animation time.
      this.accum += dt;
      if (this.accum + 1e-9 < this.interval) return false;
      dt = this.accum; this.accum = 0;
      combatHold = Math.max(0, combatHold - dt);
      if (hold > 0) {
        hold -= dt;
        if (hold <= 0) {
          this.action = null;
          if (this.state === 'land') this.setState('loco');
        }
      }
      if (hold <= 0) {
        let name = this.state;
        if (name === 'loco') name = groundClip(this, actions, combatHold, current?.getClip().name);
        if (name === 'swim' && this.speed < .32) name = 'tread_water';
        const elapsed = Math.max(0, this.stateT - dt);
        if (name === 'jump' && elapsed >= (actions.get('jump_start')?.getClip().duration ?? 0)) name = 'fall';
        const timed = name === 'jump' || name === 'dodge';
        this.select(name, timed || name === 'dead', timed ? { time: elapsed } : {});
        if (current) {
          const nominal = GAIT_SPEED[current.getClip().name];
          current.timeScale = nominal && this.state === 'loco' ? Math.max(.65, Math.min(1.65, this.speed / nominal)) : 1;
        }
      }
      mixer.update(dt);
      this.poseHands?.(dt, current?.getClip().name);
      return true;
    },
  };
  animator.select('idle');
  return {
    root, meshes, sockets, animator, height: size.y || 1.8, radius: Math.min(.8, Math.max(.3, size.x * .35)),
    setVisible(value) { root.visible = value; },
    setFade(value) {
      const fade = Math.max(0, Math.min(1, value));
      // Costume/groom modules append meshes after the base body is constructed.
      for (const mesh of meshes) for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
        if (!materialStates.has(m)) materialStates.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite });
      }
      for (const [m, authored] of materialStates) {
        const transparent = authored.transparent || fade < .99;
        if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
        m.opacity = authored.opacity * fade; m.depthWrite = authored.depthWrite && fade > .4;
      }
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); root.removeFromParent(); for (const mesh of meshes) for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) m.dispose(); },
  };
}
export class BodyFactory {
  constructor(ctx) { this.lodDist = [70, 180]; this.quality = ctx?.quality?.name ?? 'high'; }
  humanoidTemplate() {}
  // Loading anchor deliberately has no placeholder person: only authored skinned
  // characters are rendered, never disconnected geometric limbs.
  createProcedural(desc, parent) { return createModelBody({ scene: new Group(), animations: [] }, parent); }
  createGltf(gltf, desc, parent) {
    const body = createModelBody(gltf, parent, desc.kind !== 'mob');
    // A complete replacement owns its face, hair, costume and PBR materials.
    // Read the exported scene extras explicitly: mesh count/names cannot tell
    // a reconstruction apart from the legacy procedural forge assets.
    if (gltf.scene.userData?.aetherion?.presentation === 'authored-v1') return body;
    equipArmor(body, desc); attachWeapon(body, desc);
    // Heroes with a sheet recipe wear a code-built costume in place of the baked one (see character/sheets).
    const sheet = sheetRecipe(desc);
    try { applyGroom(body, desc, this.quality, sheet ? { ...sheet.groom, sheet: true, headScale: sheet.headScale } : null); } catch (error) { console.warn('[actors] groom failed', desc.oath, desc.cls, error); }
    if (sheet) try { wearSheet(body, desc, this.quality); } catch (error) { console.warn('[actors] sheet costume failed', desc.oath, desc.cls, error); }
    return body;
  }
}
