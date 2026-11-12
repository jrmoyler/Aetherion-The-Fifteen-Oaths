import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceMaterial, withSurface } from './surface.js';
import { MeshStandardMaterial } from 'three';
test('material finishes respect explicit authored recipes', () => {
 const lacquer=surfaceMaterial('lacquer');assert.equal(lacquer.clearcoat,.35);
 const matte=surfaceMaterial('lacquer',{clearcoat:0,roughness:.8});assert.equal(matte.clearcoat,0);assert.equal(matte.roughness,.8);
 lacquer.dispose();matte.dispose();
});
test('different equal-length shader additions do not share a compiled program', () => {
 const a=withSurface(new MeshStandardMaterial(),'skin',1,'diffuseColor.r *= .5;');
 const b=withSurface(new MeshStandardMaterial(),'skin',1,'diffuseColor.b *= .5;');
 assert.notEqual(a.customProgramCacheKey(),b.customProgramCacheKey());a.dispose();b.dispose();
});
