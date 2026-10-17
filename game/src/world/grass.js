// Grass & flower fields near the camera: geometric blade patches (no alpha overdraw) instanced
// on a 2 m grid aligned to the terrain normal, tinted by the ground layers, swayed by GPU wind,
// shrunk toward the edge of the radius. Cells are cached and filled under a time budget.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { sampleTerrain } from '@shared/terrain.js';
import { classify, grassAmount, NLAYERS, L, sanctuaryDist, REGION_KIND, regionTop3 } from './surface.js';
import { addWind } from './wind.js';
import { rng } from './trees.js';

const P = 2; // patch size (m)

function patchMesh(scene, name, blades, flowers, seed) {
  const R = rng(seed); const p = [], n = [], c = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const x = (R() - 0.5) * P, z = (R() - 0.5) * P; const h = 0.22 + R() * 0.38; const w = 0.022 + R() * 0.018;
    const a = R() * Math.PI; const ux = Math.cos(a) * w, uz = Math.sin(a) * w; const ba = R() * Math.PI * 2; const bend = 0.05 + R() * 0.18;
    const bx = Math.cos(ba) * bend, bz = Math.sin(ba) * bend; const k = 0.8 + R() * 0.4;
    const base = p.length / 3;
    const nx = bx * 0.6, nz = bz * 0.6;
    const push = (px, py, pz, t) => { p.push(px, py, pz); n.push(nx, 1, nz); const s = (0.5 + 0.5 * t) * k; c.push(s, s, s, 1); };
    push(x - ux, 0, z - uz, 0); push(x + ux, 0, z + uz, 0);
    push(x - ux * 0.6 + bx * 0.35 * h, h * 0.55, z - uz * 0.6 + bz * 0.35 * h, 0.55); push(x + ux * 0.6 + bx * 0.35 * h, h * 0.55, z + uz * 0.6 + bz * 0.35 * h, 0.55);
    push(x + bx * h, h, z + bz * h, 1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
    if (flowers && b % 3 === 0) { // small flower head
      const fc = [[1.6, 1.6, 1.5], [1.7, 1.4, 0.4], [1.0, 0.7, 1.5], [1.6, 0.6, 0.5]][Math.floor(R() * 4)];
      const fb = p.length / 3; const tx = x + bx * h, ty = h + 0.02, tz = z + bz * h; const s = 0.035 + R() * 0.02;
      for (const [dx, dz] of [[-s, -s], [s, -s], [s, s], [-s, s]]) { p.push(tx + dx, ty, tz + dz); n.push(0, 1, 0); c.push(fc[0], fc[1], fc[2], 1); }
      idx.push(fb, fb + 1, fb + 2, fb, fb + 2, fb + 3);
    }
  }
  const m = new Mesh(name, scene); const vd = new VertexData(); vd.positions = p; vd.normals = n; vd.colors = c; vd.indices = idx; vd.applyToMesh(m);
  return m;
}

export function createGrass(ctx) {
  const { scene, quality } = ctx;
  const g = quality.grass ?? 0.5;
  const RG = Math.round(14 + 44 * g); // radius in metres
  const blades = Math.round(40 + 90 * g);
  const mat = new PBRMaterial('grass', scene);
  mat.metallic = 0; mat.roughness = 0.78; mat.backFaceCulling = false; mat.twoSidedLighting = true; mat.environmentIntensity = 0.85;
  mat.albedoColor.set(1, 1, 1);
  addWind(mat, { bend: 0.1, flutter: 0.015, height: 0.6 });
  const meshes = [patchMesh(scene, 'grassPatch', blades, false, 5), patchMesh(scene, 'flowerPatch', Math.round(blades * 0.8), true, 9)];
  for (const m of meshes) { m.material = mat; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = true;
    m.thinInstanceSetBuffer('matrix', new Float32Array(16), 16, false); m.thinInstanceSetBuffer('color', new Float32Array(4), 4, false); m.thinInstanceCount = 0; m.setEnabled(false); }
  const caps = [0, 0], bufs = [null, null], cols = [null, null];

  const cache = new Map(); // key -> {x,z,h,amt,q:Quaternion,col,flower,rot}
  const todo = [];
  const W = new Float32Array(NLAYERS), tint = [1, 1, 1];
  const S = {};
  function fill(k, ix, iz) {
    const R = rng(ix * 7919 + iz * 104729);
    const x = (ix + 0.5) * P + (R() - 0.5) * 0.8, z = (iz + 0.5) * P + (R() - 0.5) * 0.8;
    const s = sampleTerrain(x, z, S); const h = s.h; const lava = s.lava, road = s.road, coast = s.coast, plaza = s.plaza, roadW = s.roadW;
    const hx = sampleTerrain(x + 1, z, S).h - sampleTerrain(x - 1, z, S).h, hz = sampleTerrain(x, z + 1, S).h - sampleTerrain(x, z - 1, S).h;
    const nv = new Vector3(-hx, 2, -hz).normalize();
    let amt = 0;
    if (h > 0.5 && nv.y > 0.8 && road > 3.6 && lava < 0.05) {
      classify(x, z, { h, lava, road, coast, plaza, roadW }, nv.y, W, tint);
      amt = grassAmount(W);
      if (plaza > 0.05 && sanctuaryDist(x, z) < 95) amt = 0;
      amt *= Math.min(1, (road - 3.6) / 2.5);
    }
    const q = new Quaternion(); Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, nv, q);
    const yaw = Quaternion.RotationAxis(Vector3.UpReadOnly, R() * Math.PI * 2); q.multiplyInPlace(yaw);
    const dry = W[L.dryGrass] / Math.max(1e-3, W[L.grass] + W[L.dryGrass] + W[L.moss]);
    const kind = REGION_KIND[regionTop3(x, z).idx[0]];
    const lush = [0.42, 0.56, 0.2], dryc = [0.86, 0.74, 0.42];
    const v = 0.85 + R() * 0.3;
    const col = [(lush[0] + (dryc[0] - lush[0]) * dry) * tint[0] * v, (lush[1] + (dryc[1] - lush[1]) * dry) * tint[1] * v, (lush[2] + (dryc[2] - lush[2]) * dry) * tint[2] * v, 1];
    const flower = (kind === 9 || kind === 6 || kind === 4 || kind === 13 || kind === 7) && R() < 0.22 && dry < 0.6;
    cache.set(k, { x, z, h, amt, q, col, flower, sc: 0.7 + R() * 0.6 });
  }

  const cam = new Vector3(), lastBuild = new Vector3(1e9, 0, 0);
  const tmpM = new Matrix(), tmpS = new Vector3(), tmpT = new Vector3();
  let dirty = true;
  function update() {
    const c = scene.activeCamera; if (!c) return;
    cam.copyFrom(c.globalPosition ?? c.position);
    const gx0 = Math.floor((cam.x - RG) / P), gx1 = Math.floor((cam.x + RG) / P), gz0 = Math.floor((cam.z - RG) / P), gz1 = Math.floor((cam.z + RG) / P);
    const moved = Math.hypot(cam.x - lastBuild.x, cam.z - lastBuild.z);
    if (moved > 1.5 || dirty) {
      // enqueue missing cells
      todo.length = 0;
      for (let iz = gz0; iz <= gz1; iz++) for (let ix = gx0; ix <= gx1; ix++) {
        const cx = (ix + 0.5) * P - cam.x, cz = (iz + 0.5) * P - cam.z; if (cx * cx + cz * cz > RG * RG) continue;
        const k = ix * 100003 + iz; if (!cache.has(k)) todo.push([k, ix, iz, cx * cx + cz * cz]);
      }
      todo.sort((a, b) => a[3] - b[3]);
    }
    const t0 = performance.now(); let filled = 0;
    while (todo.length && performance.now() - t0 < (ctx.__loading ? 20 : 2.5)) { const [k, ix, iz] = todo.shift(); fill(k, ix, iz); filled++; }
    if (!(moved > 1.5 || filled > 0 || dirty)) return;
    dirty = todo.length > 0;
    lastBuild.copyFrom(cam);
    const counts = [0, 0];
    const list = [];
    for (let iz = gz0; iz <= gz1; iz++) for (let ix = gx0; ix <= gx1; ix++) {
      const e = cache.get(ix * 100003 + iz); if (!e || e.amt < 0.15) continue;
      const d = Math.hypot(e.x - cam.x, e.z - cam.z); if (d > RG) continue;
      const fade = 1 - Math.max(0, (d - RG * 0.6) / (RG * 0.4));
      list.push(e, fade); counts[e.flower ? 1 : 0]++;
    }
    for (let i = 0; i < 2; i++) if (counts[i] > caps[i]) { caps[i] = Math.ceil(counts[i] * 1.3) + 32; bufs[i] = new Float32Array(caps[i] * 16); cols[i] = new Float32Array(caps[i] * 4); meshes[i].thinInstanceSetBuffer('matrix', bufs[i], 16, false); meshes[i].thinInstanceSetBuffer('color', cols[i], 4, false); }
    const ni = [0, 0];
    for (let j = 0; j < list.length; j += 2) {
      const e = list[j], fade = list[j + 1]; const i = e.flower ? 1 : 0;
      const s = e.sc * (0.35 + 0.65 * Math.min(1, e.amt * 1.3)) * fade;
      tmpS.set(1, s, 1); tmpT.set(e.x, e.h - 0.05, e.z);
      Matrix.ComposeToRef(tmpS, e.q, tmpT, tmpM); tmpM.copyToArray(bufs[i], ni[i] * 16); cols[i].set(e.col, ni[i] * 4); ni[i]++;
    }
    for (let i = 0; i < 2; i++) { const m = meshes[i]; if (!ni[i]) { m.setEnabled(false); continue; } m.thinInstanceCount = ni[i]; m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color'); m.setEnabled(true); }
    // evict far cache entries
    if (cache.size > 12000) for (const [k, e] of cache) if (Math.hypot(e.x - cam.x, e.z - cam.z) > RG * 2) cache.delete(k);
    stats.patches = ni[0] + ni[1];
  }
  const stats = { patches: 0, radius: RG, blades };
  return { update, stats, material: mat };
}
