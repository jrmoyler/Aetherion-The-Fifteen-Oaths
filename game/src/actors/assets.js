// Forge asset loading: manifest polling, container cache, per-entity instantiation with
// cloned + retargeted animation groups, material tinting, and a GLB animator that speaks
// the same interface as the procedural animators.
import { LoadAssetContainerAsync, RegisterSceneLoaderPlugin } from '@babylonjs/core/Loading/sceneLoader.js';
import { GLTFFileLoaderMetadata } from '@babylonjs/loaders/glTF/glTFFileLoader.metadata.js';
import { registerBuiltInGLTFExtensions } from '@babylonjs/loaders/glTF/2.0/Extensions/dynamic.js';
import { AnimationGroupMask, AnimationGroupMaskMode } from '@babylonjs/core/Animations/animationGroupMask.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { hex } from './geom.js';

let CHAR_DIR = './assets/characters/';
let CREATURE_DIR = './assets/creatures/';
const UPPER_BONES = ['spine1', 'spine2', 'neck', 'head', 'shoulder.L', 'upperarm.L', 'forearm.L', 'hand.L', 'shoulder.R', 'upperarm.R', 'forearm.R', 'hand.R'];

// Lazy glTF 2.0 loader registration: the loader chunk is only fetched once a GLB exists.
let registered = false;
function registerGltf() {
  if (registered) return;
  registered = true;
  RegisterSceneLoaderPlugin({
    ...GLTFFileLoaderMetadata,
    createPlugin: async (options) => {
      const [{ GLTFFileLoader, RegisterGLTF2Loader }, { RegisterInstancedMesh }] = await Promise.all([
        import('@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js'),
        import('@babylonjs/core/Meshes/instancedMesh.pure.js'),
      ]);
      RegisterInstancedMesh();
      RegisterGLTF2Loader();
      return new GLTFFileLoader(options[GLTFFileLoaderMetadata.name]);
    },
  });
  registerBuiltInGLTFExtensions();
}

export class AssetLibrary {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.charFiles = new Map(); // key (oath-01-ninja) -> url
    this.probes = new Map(); // url -> Promise<bool>
    this.containers = new Map(); // url -> Promise<container|null>
    this.listeners = new Set();
    this.manifestSeen = false;
    this.disabled = ctx.params?.get?.('glb') === '0';
    if (ctx.assetBase) { CHAR_DIR = `${ctx.assetBase}characters/`; CREATURE_DIR = `${ctx.assetBase}creatures/`; }
    this.creatureManifest = null; // Set of urls once a creatures manifest is seen
    this.firstPoll = new Promise((r) => { this._firstPollDone = r; });
    this.pollTimer = null;
    this.pollCount = 0;
  }

  start() {
    if (this.disabled) { this._firstPollDone?.(); return; }
    this.pollManifest();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async pollManifest() {
    this.pollCount++;
    let changed = false;
    for (const [dir, kind] of [[CHAR_DIR, 'char'], [CREATURE_DIR, 'creature']]) {
      try {
        const res = await fetch(`${dir}manifest.json`, { cache: 'no-cache' });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('text/html')) continue;
        const json = await res.json();
        const files = new Set();
        const scan = (v, k) => {
          if (typeof v === 'string' && /\.glb$/i.test(v)) files.add(v);
          else if (Array.isArray(v)) v.forEach((x) => scan(x));
          else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) { if (/^(oath-\d\d-(ninja|sorcerer)|[a-z]+(-oath-\d\d)?)$/.test(kk) && typeof vv === 'object' && vv && !Array.isArray(vv) && (vv.file || vv.glb || vv.path)) files.add(vv.file || vv.glb || vv.path); scan(vv, kk); }
          void k;
        };
        scan(json);
        for (const f of files) {
          const base = f.split('/').pop();
          const key = base.replace(/\.glb$/i, '');
          const url = f.includes('://') ? f : `${dir}${base}`; // manifests may list absolute or relative paths; files live beside the manifest
          if (kind === 'char') { if (this.charFiles.get(key) !== url) { this.charFiles.set(key, url); changed = true; } }
          else { (this.creatureManifest ??= new Set()); if (!this.creatureManifest.has(url)) { this.creatureManifest.add(url); this.probes.set(url, Promise.resolve(true)); changed = true; } }
        }
        if (kind === 'char') this.manifestSeen = true;
      } catch { /* manifest absent or invalid: keep procedural */ }
    }
    this._firstPollDone?.(); this._firstPollDone = null;
    if (changed) for (const fn of this.listeners) { try { fn(); } catch (e) { console.warn('[actors] asset listener', e); } }
    // poll: every 15 s for the first 10 minutes, then every 2 min
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.pollManifest(), this.pollCount < 40 ? 15000 : 120000);
  }

  characterUrl(key) { return this.disabled ? null : this.charFiles.get(key) ?? null; }

  /** Resolve a creature model url per shared/creatures.js order, or null. */
  async creatureUrl(arch, oath) {
    if (this.disabled) return null;
    await this.firstPoll;
    const specific = `${CREATURE_DIR}${arch}-${oath}.glb`, generic = `${CREATURE_DIR}${arch}.glb`;
    if (this.creatureManifest) return this.creatureManifest.has(specific) ? specific : this.creatureManifest.has(generic) ? generic : null;
    // no manifest: probe the archetype file first (one request per archetype), then the regional variant
    if (!(await this.probe(generic))) return null;
    return (await this.probe(specific)) ? specific : generic;
  }

  probe(url) {
    let p = this.probes.get(url);
    if (!p) {
      p = fetch(url, { method: 'HEAD' }).then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')).catch(() => false);
      this.probes.set(url, p);
    }
    return p;
  }

  load(url) {
    let p = this.containers.get(url);
    if (!p) {
      registerGltf();
      p = LoadAssetContainerAsync(url, this.scene).then((c) => {
        // keep source hidden; instances are cloned per entity
        for (const g of c.animationGroups) g.stop();
        return c;
      }).catch((e) => { console.warn('[actors] failed to load', url, e?.message ?? e); return null; });
      this.containers.set(url, p);
    }
    return p;
  }
}

const normClip = (n) => n.replace(/^Clone of /, '').split('|').pop().replace(/\.\d+$/, '').trim().toLowerCase();

/** Instantiate a container under `parent`. tint: {body, secondary, accent, glow} (creatures). */
export function instantiateGltf(scene, container, parent, opts = {}) {
  const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
  const root = new TransformNode('gltfBody', scene);
  root.parent = parent;
  for (const n of inst.rootNodes) n.parent = root;
  const nodes = new Map();
  const meshes = [];
  for (const n of inst.rootNodes) {
    nodes.set(n.name, n);
    for (const c of n.getDescendants(false)) {
      if (!nodes.has(c.name)) nodes.set(c.name, c);
      if (c.getTotalVertices && c.getTotalVertices() > 0) meshes.push(c);
    }
    if (n.getTotalVertices && n.getTotalVertices() > 0) meshes.push(n);
  }
  if (opts.tint) tintMeshes(scene, meshes, opts.tint, opts.tintKey);
  for (const m of meshes) { m.isPickable = false; m.receiveShadows = true; }
  const groups = new Map();
  for (const g of inst.animationGroups) { g.stop(); groups.set(normClip(g.name), g); }
  // sockets: explicit empties, else bones, else synthesized
  const sockets = {};
  const find = (...names) => { for (const nm of names) { const n = nodes.get(nm); if (n) return n; } return null; };
  const mk = (name, parentName, off) => {
    const ex = find(name);
    if (ex) return ex;
    const p = find(parentName) ?? root;
    const n = new TransformNode(name, scene); n.parent = p; n.position.set(...off); return n;
  };
  sockets['socket.hand.R'] = mk('socket.hand.R', 'hand.R', [0, -0.08, 0.02]);
  sockets['socket.hand.L'] = mk('socket.hand.L', 'hand.L', [0, -0.08, 0.02]);
  sockets['socket.back'] = mk('socket.back', 'spine2', [0, 0.04, -0.17]);
  sockets['socket.head'] = mk('socket.head', 'head', [0, 0.13, 0]);
  sockets['socket.chest'] = mk('socket.chest', 'spine2', [0, 0.03, 0.14]);
  const hasWeapon = [...nodes.keys()].some((n) => /weapon|sword|staff|blade/i.test(n));
  return {
    root, meshes, groups, sockets, nodes, hasWeapon, skeletons: inst.skeletons,
    dispose() { for (const g of inst.animationGroups) g.dispose(); for (const s of inst.skeletons) s.dispose(); root.dispose(false, true); },
  };
}

const tintCache = new WeakMap();
function tintMeshes(scene, meshes, tint, key = '') {
  let c = tintCache.get(scene); if (!c) { c = new Map(); tintCache.set(scene, c); }
  for (const m of meshes) {
    const mat = m.material;
    if (!mat) continue;
    const slot = (mat.name ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const hexc = slot.startsWith('body') ? tint.body : slot.startsWith('secondary') ? (tint.secondary ?? tint.body) : slot.startsWith('accent') ? tint.accent : slot.startsWith('glow') ? tint.glow : null;
    if (!hexc) continue;
    const ck = `${key}|${mat.uniqueId}|${hexc}`;
    let tm = c.get(ck);
    if (!tm) {
      tm = mat.clone(`${mat.name}:${key}`);
      const [r, g, b] = hex(hexc);
      const col = new Color3(r, g, b).toLinearSpace();
      if (slot.startsWith('glow')) { if ('emissiveColor' in tm) tm.emissiveColor = col.scale(2); }
      if ('albedoColor' in tm) tm.albedoColor = col; else if ('diffuseColor' in tm) tm.diffuseColor = col;
      c.set(ck, tm);
    }
    m.material = tm;
  }
}

// ---------------------------------------------------------------------------------
const LOCO = ['idle', 'walk', 'run', 'sprint'];
/** Drives AnimationGroups (forge clips) with weight cross-fades. */
export class GltfAnimator {
  constructor(body, opts = {}) {
    this.g = body.groups;
    this.creature = !!opts.creature;
    this.speed = 0; this.runSpeed = opts.runSpeed ?? 6; this.backwards = false;
    this.state = 'loco'; this.yawVel = 0;
    this.w = new Map(); // group -> weight
    this.target = new Map();
    this.action = null; this.actionT = 0; this.actionDur = 0; this.channel = false;
    this.accum = 0; this.interval = 0;
    this.h = opts.height ?? 1.8;
    this.upperMask = new AnimationGroupMask(UPPER_BONES, AnimationGroupMaskMode.Include);
    for (const [, grp] of this.g) { grp.weight = 0; }
  }
  clip(...names) { for (const n of names) { const g = this.g.get(n); if (g) return g; } return null; }
  setState(s) { this.state = s; }
  playAnim(name, o = {}) {
    if (name === 'cast_channel') { this.channel = o.loop !== false; return; }
    if (name === 'death' || name === 'dead') { this.state = 'dead'; return; }
    if (['jump', 'fall', 'dodge', 'swim', 'land', 'emote', 'emote_bow'].includes(name)) { this.state = name; this.stateT = 0; return; }
    if (LOCO.includes(name)) { if (this.state === 'dead') this.state = 'loco'; return; }
    const map = this.creature ? { roar: ['roar', 'attack'], hit: ['hit'] } : {};
    const cands = map[name] ?? [name, name.replace(/_\d$/, ''), name.startsWith('attack') ? 'attack_1' : name, name.startsWith('attack') && this.creature ? 'attack' : name];
    const grp = this.clip(...cands);
    if (!grp) return;
    if (this.action && this.action !== grp) this.target.set(this.action, 0);
    this.action = grp; this.actionT = 0;
    this.actionDur = (grp.to - grp.from) / (grp.targetedAnimations[0]?.animation?.framePerSecond ?? 60) / (o.speed ?? 1);
    grp.mask = this.speed > 0.6 && !this.creature ? this.upperMask : null;
    grp.speedRatio = o.speed ?? 1;
    grp.play(false); grp.goToFrame(grp.from);
    this.w.set(grp, this.w.get(grp) ?? 0);
  }
  update(dt) {
    this.accum += dt;
    if (this.accum < this.interval) return false;
    dt = this.accum; this.accum = 0;
    this.stateT = (this.stateT ?? 0) + dt;
    const T = this.target; T.clear();
    const sp = this.speed;
    const want = (grp, w) => { if (grp) T.set(grp, (T.get(grp) ?? 0) + w); };
    if (this.state === 'dead') want(this.clip('death'), 1);
    else if (this.state === 'jump') want(this.clip('jump_loop', 'jump_start', 'jump'), 1);
    else if (this.state === 'fall') want(this.clip('jump_loop', 'fall', 'jump'), 1);
    else if (this.state === 'dodge') want(this.clip('dodge', 'run'), 1);
    else if (this.state === 'land') { want(this.clip('land', 'idle'), 1); if (this.stateT > 0.3) this.state = 'loco'; }
    else if (this.state === 'emote' || this.state === 'emote_bow') { want(this.clip('emote_bow', 'interact', 'idle'), 1); if (this.stateT > 1.6) this.state = 'loco'; }
    else if (this.state === 'swim') want(this.clip('swim', 'walk'), 1);
    else {
      const run = this.runSpeed;
      let wi = 0, ww = 0, wr = 0, ws = 0;
      if (sp < 0.12) wi = 1; else if (sp < 1.5) { const k = (sp - 0.12) / 1.38; wi = 1 - k; ww = k; } else if (sp < 3.4) { const k = (sp - 1.5) / 1.9; ww = 1 - k; wr = k; } else if (sp < run * 1.12) wr = 1; else { const k = Math.min(1, (sp - run * 1.12) / (run * 0.3)); wr = 1 - k; ws = k; }
      const idle = this.clip(this.channel ? 'cast_channel' : 'idle', 'idle'), walk = this.clip(this.backwards ? 'backpedal' : 'walk', 'walk'), runc = this.clip('run'), spr = this.clip('sprint', 'run');
      want(idle, wi); want(walk ?? runc, ww); want(runc ?? walk, wr); want(spr ?? runc, ws);
      const s = this.h / 1.8;
      if (walk) walk.speedRatio = Math.max(0.3, sp / (1.5 * s));
      if (runc) runc.speedRatio = Math.max(0.5, sp / (run * s));
      if (spr && spr !== runc) spr.speedRatio = Math.max(0.6, sp / (run * 1.45 * s));
    }
    if (this.action) {
      this.actionT += dt;
      const k = this.actionT / Math.max(0.05, this.actionDur);
      if (k >= 1) { this.action = null; } else {
        const aw = Math.min(1, k * 8, (1 - k) * 6);
        T.set(this.action, aw);
        if (!this.action.mask) for (const [g, w] of T) if (g !== this.action) T.set(g, w * (1 - aw));
      }
    }
    if (this.channel && this.state === 'loco' && !this.action && sp > 0.6) want(this.clip('cast_channel'), 0.7);
    // ease weights
    for (const [grp] of this.g.entries()) void grp;
    for (const grp of new Set([...this.w.keys(), ...T.keys()])) {
      const target = T.get(grp) ?? 0;
      let w = this.w.get(grp) ?? 0;
      w += (target - w) * Math.min(1, dt * 10);
      if (target === 0 && w < 0.01) { w = 0; if (grp.isPlaying && grp !== this.action) grp.stop(); this.w.delete(grp); grp.weight = 0; continue; }
      if (!grp.isPlaying) grp.play(grp !== this.action && grp !== this.clip('death'));
      grp.weight = w;
      this.w.set(grp, w);
    }
    return true;
  }
}
