import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { ARMOR_FAMILIES, ARSENAL_ARMOR, arsenalForGear } from '../shared/arsenal.js';
import { ARSENAL_ARMOR_MESHES, ARSENAL_ARMOR_COMMIT } from '../shared/arsenal-armor.generated.js';

const asset = (path) => new URL(`../game/public/assets/arsenal/${path}`, import.meta.url);

test('every armor piece a gear slot can roll has a wearable mesh within its budget', () => {
  assert.match(ARSENAL_ARMOR_COMMIT, /^[0-9a-f]{40}$/);
  let bytes = 0;
  for (const families of Object.values(ARMOR_FAMILIES)) for (const family of families) for (let tier = 1; tier <= 5; tier++) {
    const id = `arsenal:armor/${family}/0${tier}`, mesh = ARSENAL_ARMOR_MESHES[id];
    assert.ok(ARSENAL_ARMOR[id], `${id} is in the Arsenal registry`);
    assert.ok(mesh && existsSync(asset(mesh.path)), `${id} has a mesh file`);
    assert.equal(statSync(asset(mesh.path)).size, mesh.bytes, `${id} file matches its manifest`);
    assert.ok(mesh.triangles <= 7000, `${id} is ${mesh.triangles} triangles`);
    assert.ok(mesh.triangles < mesh.sourceTriangles / 8, `${id} is reduced from its source`);
    assert.ok(mesh.max.every((value, axis) => value > mesh.min[axis]), `${id} has real bounds`);
    bytes += mesh.bytes;
  }
  assert.ok(bytes < 4e6, `all wearable armor is ${(bytes / 1e6).toFixed(2)} MB`);
});

test('a piece wears what its name says, and falls back to the discipline when the name does not say', () => {
  const pick = (slot, name, cls = 'ninja') => arsenalForGear({ slot, oath: 'oath-09', cls, rarity: 'rare', seed: 'x', name });
  assert.equal(pick('chest', 'Fine Lotus Robe', 'ninja'), 'arsenal:armor/robe/03');
  assert.equal(pick('chest', 'Fine Lotus Cuirass', 'sorcerer'), 'arsenal:armor/chest/03');
  assert.equal(pick('legs', 'Fine Lotus Tassets'), 'arsenal:armor/belt/03');
  assert.equal(pick('hands', 'Fine Lotus Bracers'), 'arsenal:armor/arm/03');
  assert.equal(pick('head', 'Fine Lotus Visor'), 'arsenal:armor/mask/03');
  assert.equal(pick('feet', 'Fine Lotus Sandals'), 'arsenal:armor/boot/03');
  assert.equal(pick('chest', '', 'sorcerer'), 'arsenal:armor/robe/03');
  assert.equal(pick('chest', '', 'ninja'), 'arsenal:armor/chest/03');
});
