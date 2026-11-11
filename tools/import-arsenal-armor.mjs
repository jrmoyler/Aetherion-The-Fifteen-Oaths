// Builds runtime armor meshes from an Arsenal Forge checkout.
//
// The forged armor is authored at 80-190k triangles a piece with nine small textures. A character wears up to
// seven pieces, so the game needs a wearable level of detail: each piece is baked to vertex colour, reduced to a
// few thousand triangles, split into two surfaces (metal, everything else) and written without textures.
//
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   node tools/import-arsenal-armor.mjs <arsenal-forge checkout>
//
// Output: game/public/assets/arsenal/armor/<family>/<nn>.glb and shared/arsenal-armor.generated.js.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join as joinPrimitives, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node tools/import-arsenal-armor.mjs <arsenal-forge checkout>');

// Families the gear slots use (shared/arsenal.js ARMOR_FAMILIES), with a triangle budget per piece.
// Pieces worn in pairs (glove, arm, boot) are drawn twice, so their budgets are smaller.
const BUDGET = { helmet: 3600, mask: 2200, chest: 5200, robe: 6400, glove: 2600, arm: 3000, legs: 5600, belt: 2200, boot: 2600, accessory: 1200 };
const round = (value) => Math.round(value * 1000) / 1000;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

/** Bake each surface's base colour into vertex colour and sort surfaces into metal and matte. */
function bake(document) {
  const root = document.getRoot();
  const surfaces = { metal: { rough: 0, area: 0 }, matte: { rough: 0, area: 0 } };
  const shared = {
    metal: document.createMaterial('arsenal-metal').setMetallicFactor(.9),
    matte: document.createMaterial('arsenal-matte').setMetallicFactor(0),
  };
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
    const kind = (material?.getMetallicFactor() ?? 0) > .5 ? 'metal' : 'matte';
    const count = primitive.getAttribute('POSITION').getCount();
    const existing = primitive.getAttribute('COLOR_0');
    const colours = new Float32Array(count * 3), texel = [1, 1, 1, 1];
    for (let i = 0; i < count; i++) {
      if (existing) existing.getElement(i, texel);
      for (let c = 0; c < 3; c++) colours[i * 3 + c] = Math.min(1, texel[c] * factor[c]);
    }
    primitive.setAttribute('COLOR_0', document.createAccessor().setType('VEC3').setArray(colours));
    for (const semantic of primitive.listSemantics()) if (!['POSITION', 'NORMAL', 'COLOR_0'].includes(semantic)) primitive.setAttribute(semantic, null);
    const triangles = (primitive.getIndices()?.getCount() ?? count) / 3;
    surfaces[kind].rough += (material?.getRoughnessFactor() ?? .8) * triangles; surfaces[kind].area += triangles;
    primitive.setMaterial(shared[kind]);
  }
  for (const kind of ['metal', 'matte']) shared[kind].setRoughnessFactor(surfaces[kind].area ? round(surfaces[kind].rough / surfaces[kind].area) : .8);
  for (const material of root.listMaterials()) if (!Object.values(shared).includes(material)) material.dispose();
  for (const texture of root.listTextures()) texture.dispose();
  for (const extension of root.listExtensionsUsed()) extension.dispose();
}

const triangleCount = (document) => document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives())
  .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0);

function bounds(document) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], point = [0, 0, 0];
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    for (let i = 0; i < position.getCount(); i++) {
      position.getElement(i, point);
      for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], point[c]); max[c] = Math.max(max[c], point[c]); }
    }
  }
  return { min: min.map(round), max: max.map(round) };
}

const pieces = {};
let bytes = 0;
for (const [family, budget] of Object.entries(BUDGET)) for (let n = 1; n <= 5; n++) {
  const name = String(n).padStart(2, '0'), id = `arsenal:armor/${family}/${name}`;
  const document = await io.read(join(source, 'public/assets/armor', family, `${name}.glb`));
  const sourceTriangles = triangleCount(document);
  bake(document);
  await document.transform(flatten(), joinPrimitives({ keepNamed: false }), weld(), dedup());
  // Reduce in two passes: the first finds what the budget allows, the second closes the gap left by locked borders.
  for (let pass = 0; pass < 3 && triangleCount(document) > budget * 1.08; pass++) {
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: budget / triangleCount(document), error: .02 + pass * .03, lockBorder: false }));
  }
  const box = bounds(document); // measured before quantization moves the mesh into a normalized range
  await document.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8 }));
  const target = join(repo, 'game/public/assets/arsenal/armor', family, `${name}.glb`);
  mkdirSync(dirname(target), { recursive: true });
  await io.write(target, document);
  const size = statSync(target).size; bytes += size;
  pieces[id] = { path: `armor/${family}/${name}.glb`, family, triangles: Math.round(triangleCount(document)), sourceTriangles: Math.round(sourceTriangles), bytes: size, ...box };
  console.log(id, Math.round(sourceTriangles), '->', pieces[id].triangles, `${(size / 1024).toFixed(0)} kB`);
}

const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync(join(repo, 'shared/arsenal-armor.generated.js'),
  `// Generated by tools/import-arsenal-armor.mjs from Arsenal Forge ${commit}. Do not edit.\n`
  + `// Wearable armor meshes: path under assets/arsenal/, triangle counts and the piece's own bounds in metres.\n`
  + `export const ARSENAL_ARMOR_COMMIT = '${commit}';\n`
  + `export const ARSENAL_ARMOR_MESHES = ${JSON.stringify(pieces, null, 1)};\n`);
console.log(Object.keys(pieces).length, 'pieces', (bytes / 1e6).toFixed(2), 'MB');
