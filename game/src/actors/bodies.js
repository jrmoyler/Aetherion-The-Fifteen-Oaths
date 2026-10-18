// Body factory: builds (and caches) procedural templates per outfit / creature, instantiates
// per-entity bodies (cloned geometry + own skeleton + animator + weapon), and swaps in forge
// GLBs when they exist. Every body exposes the same small interface:
//   { kind, rig?, meshes, animator, sockets, height, radius, weapon, setLod(i), setVisible(b), dispose() }
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { getActorMaterials } from './materials.js';
import { Kit } from './humanoid.js';
import { humanoidLayout, createRig, disposeRig } from './rig.js';
import { OUTFITS, outfitKey } from './outfits.js';
import { HumanoidAnimator } from './anim.js';
import { buildCreatureGeometry, CreatureAnimator, isHeavyBiped, ARCH_H } from './creatures.js';
import { attachWeapon } from './weapons.js';
import { instantiateGltf, GltfAnimator } from './assets.js';
import { CREATURE_BY_ID, ARCHETYPES } from '@shared/creatures.js';

export class BodyFactory {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.templates = new Map();
    this.mats = getActorMaterials(this.scene);
    this.lodDist = { low: [28, 70], medium: [36, 110], high: [45, 160], ultra: [60, 220] }[ctx.quality?.name ?? 'high'] ?? [45, 160];
  }

  // ------------------------------------------------------------ templates
  humanoidTemplate(key, detail = 1) {
    const ck = `h|${key}|${detail}`;
    let t = this.templates.get(ck);
    if (t) return t;
    const recipe = OUTFITS[key] ?? OUTFITS['oath-11-ninja'];
    const kit = new Kit(recipe.body, detail);
    try { recipe.build.call(recipe, kit); } catch (e) { console.warn('[actors] outfit failed', key, e); }
    const h = recipe.body.h ?? 1.8;
    kit.scaleTo(h);
    const B = kit.B;
    const layout = humanoidLayout({ h, sw: B.sw * (kit.fem ? 0.9 : 1), hw: B.hw * (kit.fem ? 1.08 : 1) });
    const meshes = kit.g.build(this.scene, `tpl:${key}:${detail}`, this.mats, true);
    for (const m of meshes) { m.setEnabled(false); m.isPickable = false; }
    t = { kind: 'humanoid', key, layout, meshes, height: h, style: recipe.style ?? {}, verts: kit.g.vertexCount(), radius: 0.32 * (B.sw ** 0.5) * (h / 1.8) };
    this.templates.set(ck, t);
    return t;
  }

  creatureTemplate(creatureId, arch, tint, detail = 1) {
    const ck = `c|${creatureId ?? arch}|${detail}`;
    let t = this.templates.get(ck);
    if (t) return t;
    const { layout, g } = buildCreatureGeometry(arch, tint, detail);
    const meshes = g.build(this.scene, `tpl:${creatureId ?? arch}:${detail}`, this.mats, true);
    for (const m of meshes) { m.setEnabled(false); m.isPickable = false; }
    const h = ARCH_H[arch] ?? 1.5;
    t = { kind: 'creature', arch, layout, meshes, height: h, verts: g.vertexCount(), radius: { hound: 0.45, boar: 0.6, stag: 0.6, raptor: 0.55, drake: 1.0, golem: 0.9, wraith: 0.6, spider: 0.8, serpent: 0.6, construct: 0.7, treant: 1.0, wisp: 0.5 }[arch] ?? 0.6 };
    this.templates.set(ck, t);
    return t;
  }

  // ------------------------------------------------------------ instances
  /** desc: {kind:'player'|'npc'|'mob', oath, cls, model, scale} → body (procedural) */
  createProcedural(desc, parent) {
    if (desc.kind === 'mob') return this._creatureBody(desc, parent);
    const key = outfitKey(desc.oath ?? 'oath-11', desc.cls);
    const T = this.humanoidTemplate(key, 1);
    const T2 = this.ctx.quality?.name === 'ultra' ? null : this.humanoidTemplate(key, 0.5);
    const rig = createRig(this.scene, T.layout, parent, key);
    const { meshes, lods } = this._cloneMeshes(T, T2, parent, rig.skeleton, T.height);
    const weapon = desc.noWeapon ? null : attachWeapon(this.scene, key, rig.sockets);
    const animator = new HumanoidAnimator(rig, { ...T.style, grip: weapon?.grip, runSpeed: desc.runSpeed ?? (desc.cls === 'sorcerer' ? 5.9 : 6.4) });
    return this._wrap({ kind: 'humanoid', rig, meshes, lods, animator, sockets: rig.sockets, height: T.height, radius: T.radius, weapon, procedural: true });
  }

  _creatureBody(desc, parent) {
    const c = CREATURE_BY_ID[desc.model] ?? null;
    const arch = c?.archetype ?? (ARCHETYPES[desc.model] ? desc.model : guessArch(desc));
    const tint = c?.tint ?? { body: '#4a4440', accent: '#8a7a6a', glow: '#ffb050' };
    const T = this.creatureTemplate(c?.id ?? arch, arch, tint, 1);
    const T2 = this.creatureTemplate(c?.id ?? arch, arch, tint, 0.5);
    const rig = createRig(this.scene, T.layout, parent, c?.id ?? arch);
    const { meshes, lods } = this._cloneMeshes(T, T2, parent, rig.skeleton, T.height * 1.2);
    const speed = ARCHETYPES[arch]?.speed ?? 6;
    const animator = isHeavyBiped(arch)
      ? new HumanoidAnimator(rig, { stance: 'brute', heavy: 1, runSpeed: speed })
      : new CreatureAnimator(rig, arch, { runSpeed: speed });
    if (isHeavyBiped(arch)) animator.creature = true;
    return this._wrap({ kind: 'creature', arch, rig, meshes, lods, animator, sockets: rig.sockets, height: T.height, radius: T.radius, procedural: true });
  }

  _cloneMeshes(T, T2, parent, skeleton, h) {
    const lo = this.lodDist;
    const ext = Math.max(1.2, h * 0.75);
    const bi = new BoundingInfo(new Vector3(-ext, -0.3, -ext), new Vector3(ext, h * 1.25, ext));
    const meshes = [], lods = [];
    for (const src of T.meshes) {
      const m = src.clone(src.name, parent, true);
      m.skeleton = skeleton; m.setEnabled(true); m.isPickable = false; m.receiveShadows = true;
      m.setBoundingInfo(new BoundingInfo(bi.minimum.clone(), bi.maximum.clone()));
      meshes.push(m);
      const low = T2?.meshes.find((x) => x.metadata?.chan === src.metadata?.chan);
      if (low && T2 !== T) {
        const l = low.clone(low.name, parent, true);
        l.skeleton = skeleton; l.setEnabled(true); l.isPickable = false;
        l.setBoundingInfo(new BoundingInfo(bi.minimum.clone(), bi.maximum.clone()));
        m.addLODLevel(lo[0], l);
        lods.push(l);
      }
      m.addLODLevel(lo[1], null);
    }
    return { meshes, lods };
  }

  /** GLB body; returns null if the container could not be loaded. */
  createGltf(container, desc, parent) {
    const c = desc.kind === 'mob' ? CREATURE_BY_ID[desc.model] : null;
    const body = instantiateGltf(this.scene, container, parent, c ? { tint: c.tint, tintKey: c.id } : {});
    const height = c ? (ARCH_H[c.archetype] ?? 1.5) : 1.8;
    let weapon = null;
    if (!c && !desc.noWeapon && !body.hasWeapon) weapon = attachWeapon(this.scene, outfitKey(desc.oath, desc.cls), body.sockets);
    const animator = new GltfAnimator(body, { creature: !!c, runSpeed: desc.runSpeed ?? 6, height });
    for (const m of body.meshes) m.alwaysSelectAsActiveMesh = false;
    return this._wrap({ kind: c ? 'creature' : 'humanoid', arch: c?.archetype, rig: null, meshes: body.meshes, lods: [], animator, sockets: body.sockets, height, radius: c ? 0.7 : 0.35, weapon, gltf: body, procedural: false });
  }

  _wrap(b) {
    b.visible = true;
    b.setVisible = (v) => {
      if (b.visible === v) return; b.visible = v;
      for (const m of b.meshes) m.setEnabled(v);
      for (const m of b.lods) m.setEnabled(v);
      if (b.weapon) b.weapon.node.setEnabled(v);
    };
    b.setFade = (a) => { for (const m of b.meshes) m.visibility = a; for (const m of b.lods) m.visibility = a; };
    b.dispose = () => {
      if (b.weapon) { for (const i of b.weapon.instances) i.dispose(); b.weapon.node.dispose(); }
      for (const m of b.lods) m.dispose(false, false);
      if (!b.gltf) for (const m of b.meshes) m.dispose(false, false);
      if (b.rig) disposeRig(b.rig);
      if (b.gltf) b.gltf.dispose();
    };
    return b;
  }

  /** Pre-build templates (spread across frames by the caller). */
  warm(key) { return this.humanoidTemplate(key, 1); }
}

function guessArch(desc) {
  const m = String(desc.model ?? desc.name ?? '').toLowerCase();
  for (const a of Object.keys(ARCHETYPES)) if (m.includes(a)) return a;
  if (/wolf|hound/.test(m)) return 'hound';
  return 'hound';
}

export { TransformNode };
