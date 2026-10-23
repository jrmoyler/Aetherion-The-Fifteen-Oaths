// Character presentation pass applied to every authored hero GLB:
//  1. culls the original low-detail head (triangles skinned to the head bone
//     inside the skull volume) and its painted iris/pupil discs;
//  2. fits a procedural sculpted head, eyes, groom and face gear to the head
//     bone in bind space so it follows every authored clip;
//  3. upgrades the garment atlas material to physical cloth/leather/metal
//     shading with rest-space micro detail (no more uniform plastic gloss).
// Geometry is cached per hero and quality tier; materials are per actor so
// fades never leak between actors.
import { Group, Mesh, Matrix4, Vector3, Box3, MeshPhysicalMaterial, Color, BufferAttribute } from 'three';
import { profileFor } from './profiles.js';
import { buildHead, skinMaterial, eyeMaterial } from './head.js';
import { buildGroom, hairMaterial, leafTufts } from './hair.js';
import { buildGear, gearCoverage } from './gear.js';
import { withSurface } from './surface.js';

const kits = new Map();
const culled = new WeakSet();

function kitFor(key, H, quality, identity = '') {
  const profile = profileFor(key, identity);
  const id = `${key}|${profile.variant ?? 'hero'}|${H.toFixed(3)}|${quality}`;
  if (kits.has(id)) return kits.get(id);
  const head = buildHead(profile, H, quality);
  const groom = buildGroom(key, profile, head.P, head.lash, quality);
  const gear = buildGear(profile, head.P, H, quality);
  const cover = gearCoverage(profile);
  const scale = (g) => { if (g) g.scale(H, H, H); return g; };
  scale(groom.cap); scale(groom.cards); scale(groom.brows);
  for (const part of gear) if (part.geo) scale(part.geo);
  const leaves = gear.some(p => p.leaves) ? scale(leafTufts(head.P, key, quality === 'low' ? 30 : 80)) : null;
  // eyes are built around their own centre so one eye material serves both
  for (const e of head.eyes) e.geo.translate(-e.center.x, -e.center.y, -e.center.z);
  const kit = { profile, head, groom, gear, cover, leaves };
  kits.set(id, kit);
  return kit;
}

function own(m) {
  const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; c.userData = { ...m.userData }; return c;
}

function headIndex(skeleton) { return skeleton.bones.findIndex(b => b.name === 'head'); }

// Removes head-skinned triangles inside the skull volume from the shared GLB geometry.
function cullHead(mesh, hi, center, H) {
  const ni = mesh.skeleton.bones.findIndex(b => b.name === 'neck');
  const geo = mesh.geometry; if (culled.has(geo)) return; culled.add(geo);
  const j = geo.attributes.skinIndex, w = geo.attributes.skinWeight, p = geo.attributes.position, idx = geo.index;
  if (!j || !w || !idx) return;
  const n = p.count, kill = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let hw = 0, hh = 0; for (let k = 0; k < 4; k++) { const b = j.getComponent(i, k); if (b === hi || b === ni) hw += w.getComponent(i, k); if (b === hi) hh += w.getComponent(i, k); }
    if (hw < .45) continue;
    const dx = (p.getX(i) - center.x) / H, dy = (p.getY(i) - center.y) / H, dz = (p.getZ(i) - center.z) / H;
    // skull volume, plus anything head-borne above the brow (crests, spikes, old hair)
    const r2 = dx * dx + dz * dz;
    if ((dy > -.44 && (dx * dx) / .2 + (dy * dy) / .3 + ((dz - .06) * (dz - .06)) / .22 < 1) || (dy > -.3 && (dx * dx) / .42 + (dy * dy) / .55 + (dz * dz) / .5 < 1) || (dy > -.12 && r2 < 1.1) || (hh > .6 && dy > -.48 && r2 < 2.5)) kill[i] = 1;
  }
  const src = idx.array, keep = [];
  for (let i = 0; i < src.length; i += 3) if (!(kill[src[i]] && kill[src[i + 1]] && kill[src[i + 2]])) keep.push(src[i], src[i + 1], src[i + 2]);
  const Arr = n > 65535 ? Uint32Array : Uint16Array;
  geo.setIndex(new BufferAttribute(new Arr(keep), 1));
}

// Garment atlas: rest-space weave on cloth, brushed wear on metal, leather
// grain between, a roughness floor so cloth never reads as wet plastic, and
// albedo-tinted sheen for fabric.
const GARMENT = /* glsl */`
  #ifdef USE_METALNESSMAP
    float gm=texture2D(metalnessMap,vMetalnessMapUv).b;
  #else
    float gm=metalness;
  #endif
  float lod=csLod(vCsP,.003);
  vec3 q=vCsP*1500.;
  float warp=sin(q.x+q.z*.7+q.y*.05)*.5+.5, weft=sin(q.y+q.z*.3)*.5+.5;
  float sel=smoothstep(.25,.75,sin(q.x*.5)*sin(q.y*.5)*.5+.5);
  float thread=mix(warp,weft,sel);
  float slub=csFbm(vCsP*vec3(50.,180.,50.));
  float streak=csNoise(vCsP*vec3(4.,1600.,4.))*csLod(vCsP,.001);
  float wear=smoothstep(.3,.85,csFbm(vCsP*22.));
  float cloth=1.-smoothstep(.35,.65,gm);
  csH=mix(streak*.25-wear*.2,(thread-.5)*.5*lod+slub*.35,cloth);
  diffuseColor.rgb*=mix(.92+streak*.05+wear*.16,.95+thread*.05*lod+slub*.08,cloth);
  float grime=smoothstep(.45,.05,vCsP.y)*.22+csFbm(vCsP*7.)*.06;
  diffuseColor.rgb*=1.-grime*cloth;
  roughnessFactor=mix(clamp(roughnessFactor+streak*.05-wear*.12,.18,.75),clamp(max(roughnessFactor,.58)+thread*.06,.55,.98),cloth);
`;

function garment(material) {
  if (material.userData.garment) return material;
  const m = new MeshPhysicalMaterial();
  for (const k of ['name', 'map', 'normalMap', 'normalScale', 'aoMap', 'aoMapIntensity', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'emissive', 'emissiveIntensity', 'side', 'vertexColors', 'color', 'roughness', 'metalness', 'transparent', 'opacity']) if (material[k] !== undefined) m[k] = material[k]?.clone && !material[k].isTexture ? material[k].clone() : material[k];
  m.sheen = .6; m.sheenRoughness = .55; m.sheenColor = new Color(.32, .32, .32); m.sheenColorMap = material.map ?? null;
  m.specularIntensity = .5;
  if (m.normalScale) m.normalScale.multiplyScalar(.85);
  withSurface(m, 'hair', 1, GARMENT);
  m.userData.garment = true;
  return m;
}

export function applyGroom(body, desc, quality = 'high') {
  if (desc.kind === 'mob' || !desc.oath || !desc.cls) return;
  const key = `${desc.oath}-${desc.cls}`;
  const skinned = body.meshes.find(m => m.isSkinnedMesh && m.skeleton && headIndex(m.skeleton) >= 0);
  if (!skinned) return;
  const hi = headIndex(skinned.skeleton);
  const bone = skinned.skeleton.bones[hi];
  // bind-space head bone position
  const boneBind = skinned.skeleton.boneInverses[hi].clone().invert();
  const bindPos = new Vector3().setFromMatrixPosition(boneBind);
  skinned.geometry.computeBoundingBox();
  const bb = skinned.geometry.boundingBox, height = bb.max.y - Math.max(0, bb.min.y);
  const H = Math.min(.262, Math.max(.205, height * .128));
  const center = new Vector3(bindPos.x, bindPos.y + H * .41, bindPos.z + H * .05);
  const kit = kitFor(key, H, quality, desc.kind === 'npc' ? desc.identity : '');
  const q = quality;
  // 1. cull original head + painted eyes
  for (const m of body.meshes) {
    if (!m.isSkinnedMesh) continue;
    const names = (Array.isArray(m.material) ? m.material : [m.material]).map(x => x.name);
    if (names.includes('iris') || names.includes('pupil')) { m.visible = false; m.userData.groomHidden = true; continue; }
    if (m.skeleton) cullHead(m, hi, center, H);
  }
  // 2. head rig in bind space under the head bone
  const anchor = new Group(); anchor.name = 'procedural-head';
  anchor.matrixAutoUpdate = false;
  anchor.matrix.copy(skinned.skeleton.boneInverses[hi]).multiply(skinned.bindMatrix);
  const rig = new Group(); rig.position.copy(center); anchor.add(rig);
  const added = [];
  const add = (geo, material, opts = {}) => {
    if (!geo) return null;
    const mesh = new Mesh(geo, material); mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true; mesh.renderOrder = opts.order ?? 0;
    (opts.parent ?? rig).add(mesh); added.push(mesh); return mesh;
  };
  const prof = kit.profile;
  const skin = own(skinMaterial(prof, H, new Vector3()));
  add(kit.head.skinGeo, skin);
  const eyeMat = own(eyeMaterial(prof.eye, new Vector3()));
  const eyeMeshes=[];
  for (const e of kit.head.eyes) { const m = add(e.geo, eyeMat, { shadow: false }); m.position.copy(e.center);eyeMeshes.push(m); }
  const lidMeshes=kit.head.lids.map(geo=>add(geo,skin));
  const hairColor = prof.hair?.color ?? '#141012';
  if (kit.groom.cap && !kit.cover.hood) add(kit.groom.cap, own(hairMaterial(hairColor, false, q)), { shadow: true });
  if (kit.groom.cards && !kit.cover.hood) add(kit.groom.cards, own(hairMaterial(hairColor, true, q)), { order: 1 });
  else if (kit.groom.cards && prof.beard) add(kit.groom.cards, own(hairMaterial(hairColor, true, q)), { order: 1 });
  const browColor = new Color(hairColor).multiplyScalar(prof.age > .6 ? .85 : .7).getStyle();
  if (!kit.cover.eyes) add(kit.groom.brows, own(hairMaterial(browColor, true, q)), { shadow: false, order: 1 });
  for (const part of kit.gear) if (part.geo) add(part.geo, own(part.material));
  if (kit.leaves) add(kit.leaves, own(hairMaterial('#56702c', true, q)), { order: 1 });
  bone.add(anchor);
  // 3. garment material
  for (const m of body.meshes) {
    if (!m.isSkinnedMesh || m.userData.groomHidden) continue;
    if (Array.isArray(m.material)) m.material = m.material.map(x => (x.map ? garment(x) : x));
    else if (m.material.map) { const old = m.material; m.material = garment(old); old.dispose(); }
  }
  body.meshes.push(...added);
  body.groom = { anchor, meshes: added, H, key };
  const update=body.animator.update.bind(body.animator);let blinkTime=(prof.variant??Number(desc.oath.slice(-2)))*.31;
  body.animator.update=(dt)=>{const advanced=update(dt);if(!Number.isFinite(dt)||dt<=0)return advanced;blinkTime+=dt;
    const phase=blinkTime%(3.6+(prof.variant??0)*.13),blink=body.animator.state==='dead'?0:phase<.18?Math.sin(Math.PI*phase/.18):0;
    for(const lid of lidMeshes)lid.morphTargetInfluences[0]=blink;
    for(const eye of eyeMeshes)eye.scale.y=Math.max(.03,1-blink);
    return advanced;};
  const dispose = body.dispose.bind(body);
  body.dispose = () => { anchor.removeFromParent(); dispose(); };
}
