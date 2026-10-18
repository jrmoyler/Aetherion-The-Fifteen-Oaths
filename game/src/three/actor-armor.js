import { Mesh, MeshStandardMaterial, LatheGeometry, Vector2, TorusGeometry, SphereGeometry, CanvasTexture, RepeatWrapping, Color } from 'three';
import { OATH_BY_ID } from '@shared/oaths.js';
let weave;
function fabricTexture() {
  if (weave || typeof document === 'undefined') return weave;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d'); c.fillStyle = '#aaa'; c.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) { c.fillStyle = i % 4 ? '#a2a2a2' : '#b5b5b5'; c.fillRect(i, 0, 1, 64); c.fillStyle = '#929292'; c.fillRect(0, i, 64, 1); }
  weave = new CanvasTexture(canvas); weave.wrapS = weave.wrapT = RepeatWrapping; weave.repeat.set(5, 5); return weave;
}
// Armor is fitted to the existing continuous skinned body, and carried by its
// actual bones. Profile surfaces taper and overlap at joints like worn equipment.
export function equipArmor(body, desc) {
  // Production GLBs contain their own fitted, skinned costume. Adding rigid
  // generic shells over them hides the authored neckline and intersects sleeves.
  if (body.meshes?.some(mesh => mesh.name === `${desc.oath}-${desc.cls}` || mesh.name.startsWith(`${desc.oath}-${desc.cls}_`))) return;
  if (desc.kind === 'mob' || !body.sockets.spine2) return;
  const oath = OATH_BY_ID[desc.oath], accent = new Color(oath?.accent ?? '#c6b181');
  const number = Number(desc.oath?.slice(-2)) || 1, mage = desc.cls === 'sorcerer';
  const alloy = new MeshStandardMaterial({ color: accent.clone().lerp(new Color('#343b42'), .72), metalness: .72, roughness: .4 });
  const trim = new MeshStandardMaterial({ color: accent.clone().lerp(new Color('#bf9d62'), .55), metalness: .86, roughness: .28 });
  const cloth = new MeshStandardMaterial({ color: accent.clone().multiplyScalar(.16), roughness: .92, metalness: .03, map: fabricTexture(), bumpMap: fabricTexture(), bumpScale: .0015 });
  const emissive = new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .7, roughness: .28, metalness: .65 });
  const parts = [];
  function fitted(bone, profile, depth, material, offset = [0, 0, 0], sides = 20) {
    if (!body.sockets[bone]) return null;
    const geometry = new LatheGeometry(profile.map(p => new Vector2(p[0], p[1])), sides);
    const mesh = new Mesh(geometry, material); mesh.scale.z = depth; mesh.position.set(...offset); mesh.castShadow = mesh.receiveShadow = true; body.sockets[bone].add(mesh); parts.push(mesh); return mesh;
  }
  // Continuous jacket under the articulated cuirass. Covers exposed pale base
  // torso while retaining the authored waist, hips, face, hands and animation.
  fitted('spine2', [[.16,-.27],[.185,-.23],[.225,-.1],[.25,.02],[.205,.12],[.095,.17]], .8, mage ? cloth : alloy, [0,0,.018]);
  fitted('spine2', [[.1,.14],[.105,.15],[.11,.19],[.105,.21]], .9, cloth);
  // Belt / overlapping fauld, with readable material breaks instead of body gaps.
  fitted('spine', [[.165,-.08],[.18,-.04],[.18,.005],[.168,.025]], .87, trim);
  fitted('spine', [[.205,-.18],[.185,-.1],[.165,-.065]], .82, cloth);
  if (desc.kind !== 'npc') {
    for (const side of ['L','R']) {
      fitted(`upperarm.${side}`, [[.055,-.03],[.115,0],[.132,.045],[.108,.12],[.075,.16]], .9, alloy);
      fitted(`forearm.${side}`, [[.072,.025],[.07,.05],[.059,.16],[.048,.21]], .85, alloy);
      fitted(`shin.${side}`, [[.085,.06],[.082,.1],[.067,.25],[.055,.34]], .85, alloy);
    }
  }
  const clasp = new Mesh(new SphereGeometry(mage ? .045 : .035, 6 + number % 4, 4), emissive); clasp.scale.set(1, 1.45, .35); clasp.position.set(0,.035,.22); body.sockets.spine2.add(clasp); parts.push(clasp);
  // Oath-specific concentric engraving on the cuirass; physical metal, no decal icons.
  const crest = new Mesh(new TorusGeometry(.065 + (number % 3) * .008, .004, 5, 24), trim); crest.position.set(0,.035,.213); body.sockets.spine2.add(crest); parts.push(crest);
  const dispose = body.dispose.bind(body);
  body.dispose = () => { for (const p of parts) { p.removeFromParent(); p.geometry.dispose(); } alloy.dispose(); trim.dispose(); cloth.dispose(); emissive.dispose(); dispose(); };
}
