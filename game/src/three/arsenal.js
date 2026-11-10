// Arsenal Forge weapons on character bodies.
// The hero GLBs carry their canon weapon as part of the skinned mesh, so the hand stays as authored. The piece of
// gear a character has equipped is slung on the back socket instead: changing your weapon changes what you carry.
import { Group, Box3, Vector3, Quaternion, Euler } from 'three';
import { loadModel } from './models.js';
import { ARSENAL_WEAPONS, canonWeapon, arsenalForGear } from '@shared/arsenal.js';

const base = () => `${import.meta.env?.BASE_URL ?? '/'}assets/arsenal/`;
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
// How each family sits on the back, as a lean from vertical (radians) in the wearer's own frame.
const LEAN = { polearms: .2, archery: .16, casting_implements: .2, shields: 0, ritual: 0, deployables: 0, integrated: 0, martial: 0, thrown: .5 };
const UP = new Vector3(0, 1, 0);

/** Arsenal id for the weapon an actor should show: the equipped item if known, else the canon piece. */
export function arsenalWeaponOf(item, oath, cls) {
  if (item?.arsenal && ARSENAL_WEAPONS[item.arsenal]) return item.arsenal;
  if (item?.slot === 'weapon') return arsenalForGear({ slot: 'weapon', oath: item.oath ?? oath, cls, rarity: item.rarity, seed: item.id ?? '' });
  return canonWeapon(oath, cls);
}

/**
 * Sling a forged weapon across a body's back. Resolves to a handle with dispose(), or null when the body has
 * no back socket or the model cannot load (the character simply carries nothing extra).
 */
export async function slingWeapon(body, id, { lod = 1, actorRoot = body.root } = {}) {
  const entry = ARSENAL_WEAPONS[id], socket = body.sockets?.['socket.back'];
  if (!entry || !socket) return null;
  let gltf;
  try { gltf = await loadModel(base() + entry.lods[lod].path); } catch (error) { console.warn('[arsenal] Weapon unavailable', id, error); return null; }
  if (!socket.parent) return null; // body was replaced while the model loaded
  const model = gltf.scene.clone(true);
  model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = false; } });
  // Lay the weapon's longest measured side along the carry line and keep its thinnest side against the back.
  const size = new Box3().setFromObject(model).getSize(new Vector3()).toArray();
  const long = size.indexOf(Math.max(...size)), thin = size.indexOf(Math.min(...size));
  const fit = new Quaternion();
  if (long !== 1) fit.setFromUnitVectors(AXES[long], UP);
  const thinAxis = AXES[thin].clone().applyQuaternion(fit);
  if (Math.abs(thinAxis.z) < .9 && long !== thin) fit.premultiply(new Quaternion().setFromUnitVectors(thinAxis.setY(0).normalize(), AXES[2]));
  model.quaternion.copy(fit);
  model.updateMatrixWorld(true);
  const centre = new Box3().setFromObject(model).getCenter(new Vector3());
  model.position.sub(centre);
  const holder = new Group(); holder.name = `arsenal:${id}`;
  holder.add(model); socket.add(holder);
  // Orient in the actor's frame (upright, facing +Z) so the carry reads the same on every rig, then express that
  // in the socket's local space. The socket follows the spine from there.
  actorRoot.updateWorldMatrix(true, false); socket.updateWorldMatrix(true, false);
  const lean = LEAN[entry.family] ?? .62;
  const desired = actorRoot.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(0, 0, lean)));
  holder.quaternion.copy(socket.getWorldQuaternion(new Quaternion()).invert().multiply(desired));
  // Stand the piece off the back by half its own thickness so plates and cloaks do not swallow it.
  // Long hafts ride a little high so the butt clears the ground; broad shields ride low so they clear the head.
  const lift = entry.family === 'shields' ? -.22 : size[long] > 1.5 ? .12 : 0;
  const offset = new Vector3(0, lift, -(Math.min(...size) / 2 + .035)).applyQuaternion(desired);
  const scale = socket.getWorldScale(new Vector3());
  holder.position.copy(offset.applyQuaternion(socket.getWorldQuaternion(new Quaternion()).invert())).divide(scale);
  holder.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
  body.arsenalWeapon = id;
  return { id, holder, dispose() { holder.removeFromParent(); if (body.arsenalWeapon === id) body.arsenalWeapon = null; } };
}
