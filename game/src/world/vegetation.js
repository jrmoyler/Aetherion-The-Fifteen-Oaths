// Vegetation & rocks: worker-scattered per 128 m cell, rendered as thin instances per species
// and LOD (near detailed / far simplified), biome tints per instance, GPU wind, triplanar rock
// shading that reuses the terrain texture layers.
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { buildSpecies, makeLeafAtlas, makeBarkTexture } from './trees.js';
import { SPECIES, SP, L, REGION_KIND, regionTop3 } from './surface.js';
import { addWind } from './wind.js';

const CELL = 128;
const TREE_SCALE = { [SP.broadleaf]: 1.35, [SP.conifer]: 1.2, [SP.snowConifer]: 1.15, [SP.cypress]: 1.15, [SP.stonePine]: 1.3, [SP.birch]: 1.2, [SP.deadTree]: 1.2 };

class RockPlugin extends MaterialPluginBase {
  constructor(material, res) { super(material, 'RockTri', 110, { ROCKTRI: false }); this.res = res; this.registerForExtraEvents = true; this._enable(true); }
  prepareDefines(d) { d.ROCKTRI = true; }
  getClassName() { return 'RockPlugin'; }
  getSamplers(s) { s.push('rAlb', 'rNrm'); }
  isReadyForSubMesh() { return this.res.alb.isReady(); }
  hardBindForSubMesh(_u, _s, _e, sm) { const e = sm.effect; if (!e) return; e.setTexture('rAlb', this.res.alb); e.setTexture('rNrm', this.res.nrm); }
  getCustomCode(type) {
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef ROCKTRI
precision highp sampler2DArray; uniform sampler2DArray rAlb; uniform sampler2DArray rNrm; float rRough = 0.8;
vec3 rLin(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `#ifdef ROCKTRI
{
  float Lr = 3.0;
#ifdef VERTEXCOLOR
  Lr = floor(vColor.a * 32.0 + 0.5);
#endif
  vec3 nG = normalW; vec3 bw = pow(abs(nG), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  vec3 wp = vPositionW * 0.33;
  vec4 ax = texture(rAlb, vec3(wp.zy, Lr)), ay = texture(rAlb, vec3(wp.xz, Lr)), az = texture(rAlb, vec3(wp.xy, Lr));
  vec4 nx = texture(rNrm, vec3(wp.zy, Lr)), ny = texture(rNrm, vec3(wp.xz, Lr)), nz = texture(rNrm, vec3(wp.xy, Lr));
  vec4 a = ax * bw.x + ay * bw.y + az * bw.z; vec4 nn = nx * bw.x + ny * bw.y + nz * bw.z;
  vec2 tx = nx.xy * 2.0 - 1.0, ty = ny.xy * 2.0 - 1.0, tz = nz.xy * 2.0 - 1.0;
  vec3 d = vec3(0.0, -tx.y, tx.x) * bw.x + vec3(ty.x, 0.0, ty.y) * bw.y + vec3(tz.x, -tz.y, 0.0) * bw.z;
  normalW = normalize(nG + d * 1.1);
  vec3 tint = vec3(1.0);
#ifdef VERTEXCOLOR
  tint = vColor.rgb;
#endif
  surfaceAlbedo = rLin(a.rgb) * tint * mix(1.0, nn.a, 0.6);
  rRough = nn.b;
}
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: '#ifdef ROCKTRI\nmetallicRoughness.r = 0.0; metallicRoughness.g = rRough;\n#endif\n',
    };
  }
}

// per biome-kind rock layer + tint
const ROCK_LOOK = {
  1: [L.basalt, [0.9, 0.85, 0.82]], 2: [L.rock, [0.95, 0.98, 1.05]], 3: [L.shale, [0.95, 0.97, 1.0]], 4: [L.limestone, [1, 1, 0.98]],
  5: [L.strata, [1, 0.95, 0.9]], 6: [L.limestone, [0.95, 0.94, 0.9]], 7: [L.rock, [0.82, 0.92, 0.72]], 8: [L.rock, [0.7, 0.72, 0.65]],
  9: [L.limestone, [1.02, 1, 0.96]], 10: [L.shale, [0.85, 0.85, 1.0]], 11: [L.shale, [0.9, 0.9, 0.92]], 12: [L.rock, [1.1, 0.78, 0.72]],
  13: [L.limestone, [1, 0.97, 1]], 14: [L.strata, [0.95, 0.95, 0.92]], 15: [L.rock, [0.85, 0.85, 0.85]],
};
// leaf tints by kind
const LEAF_TINT = {
  7: [[1.0, 1.05, 0.75], [1.25, 1.0, 0.45], [0.9, 1.0, 0.7]], // Graft: green-gold, some golden
  9: [[1.05, 1.05, 0.8], [1.1, 1.08, 0.7]],
  4: [[0.9, 1.0, 0.85]], 6: [[0.95, 1.0, 0.85]], 13: [[0.95, 0.98, 0.9]],
  10: [[0.8, 0.88, 0.95]], 12: [[1.1, 0.75, 0.6]], 8: [[0.95, 1.0, 0.6]], 3: [[0.85, 0.95, 0.9]], 2: [[0.9, 0.98, 1.0]],
};

export function createVegetation(ctx, pool, terrainRes) {
  const { scene, quality } = ctx;
  const q = quality.name;
  const R_VEG = { low: 240, medium: 380, high: 520, ultra: 700 }[q] ?? 420;
  const R_NEAR = { low: 70, medium: 100, high: 130, ultra: 170 }[q] ?? 120;
  const DENS = { low: 0.45, medium: 0.7, high: 1, ultra: 1.15 }[q] ?? 1;

  const leafTex = makeLeafAtlas(scene, q === 'low' ? 256 : 512);
  const barkTex = makeBarkTexture(scene, q === 'low' ? 128 : 256);
  const barkMat = new PBRMaterial('vegBark', scene);
  barkMat.albedoTexture = barkTex; barkMat.metallic = 0; barkMat.roughness = 0.9; barkMat.environmentIntensity = 0.8;
  addWind(barkMat, { bend: 0.32, flutter: 0, height: 14 });
  const leafMat = new PBRMaterial('vegLeaves', scene);
  leafMat.albedoTexture = leafTex; leafMat.useAlphaFromAlbedoTexture = true;
  leafMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST; leafMat.alphaCutOff = 0.45;
  leafMat.metallic = 0; leafMat.roughness = 0.72; leafMat.backFaceCulling = false; leafMat.twoSidedLighting = true;
  leafMat.environmentIntensity = 0.9;
  leafMat.subSurface.isTranslucencyEnabled = q !== 'low'; leafMat.subSurface.translucencyIntensity = 0.6; leafMat.subSurface.tintColor = new Color3(0.6, 0.8, 0.3);
  addWind(leafMat, { bend: 0.32, flutter: 0.06, height: 14 });
  const crystalMat = new PBRMaterial('vegCrystal', scene);
  crystalMat.metallic = 0; crystalMat.roughness = 0.12; crystalMat.emissiveColor = new Color3(0.22, 0.07, 0.4); crystalMat.environmentIntensity = 1.4;
  const rockMat = new PBRMaterial('vegRock', scene);
  rockMat.metallic = 0; rockMat.roughness = 0.85; rockMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST; rockMat.alphaCutOff = 0.01; // keeps VERTEXALPHA so instance alpha (rock layer) reaches the shader
  if (terrainRes) new RockPlugin(rockMat, terrainRes);

  // species meshes per LOD
  const parts = []; // {sp, lod, mesh, buf, col, cap, n}
  const bySp = SPECIES.map(() => [[], []]);
  for (const name of SPECIES) {
    for (let lod = 0; lod < 2; lod++) {
      const g = buildSpecies(name, lod, 3);
      const add = (geo, mat, kind) => {
        if (!geo.i.length) return;
        const m = geo.toMesh(`veg_${name}_${lod}_${kind}`, scene);
        m.material = mat; m.isPickable = false; if (mat === rockMat) m.hasVertexAlpha = true; /* alpha = rock layer */ m.alwaysSelectAsActiveMesh = true; m.receiveShadows = true;
        m.thinInstanceSetBuffer('matrix', new Float32Array(16), 16, false); m.thinInstanceCount = 0;
        m.thinInstanceSetBuffer('color', new Float32Array(4), 4, false);
        m.setEnabled(false);
        const p = { sp: SP[name], lod, mesh: m, buf: null, col: null, cap: 0, n: 0, kind };
        parts.push(p); bySp[SP[name]][lod].push(p);
        if (lod === 0 && quality.shadows && (kind !== 'extra' || name === 'boulder') && name !== 'rock' && name !== 'reeds') ctx.render?.addShadowCaster(m, false);
      };
      const isRock = name === 'boulder' || name === 'rock';
      add(g.bark, barkMat, 'bark'); add(g.leaves, leafMat, 'leaves'); add(g.extra, isRock ? rockMat : crystalMat, 'extra');
    }
  }

  const cells = new Map();
  const camPos = new Vector3();
  let dirty = false, rebuildTimer = 0, scanTimer = 0;
  const tmpM = new Matrix(), tmpQ = new Quaternion(), tmpS = new Vector3(), tmpT = new Vector3();

  function processCell(c, r) {
    const { counts, data } = r; const per = SPECIES.map((_, i) => ({ mat: new Float32Array(counts[i] * 16), col: new Float32Array(counts[i] * 4), n: 0 }));
    for (let k = 0; k < data.length; k += 8) {
      const sp = data[k]; const x = data[k + 1], y = data[k + 2], z = data[k + 3], rot = data[k + 4], sc0 = data[k + 5], tx = data[k + 6], tz = data[k + 7];
      const o = per[sp]; const isRock = sp === SP.boulder || sp === SP.rock; const isTree = !isRock && sp !== SP.reeds && sp !== SP.shrub && sp !== SP.crystal;
      const rt = regionTop3(x, z); const kind = REGION_KIND[rt.idx[0]];
      let sc = sc0; let sink = 0.2;
      if (sp === SP.boulder) { sc = 0.8 + (sc0 - 0.7) * 3.2; sink = 0.35 * sc; }
      else if (sp === SP.rock) { sc = 0.6 + (sc0 - 0.7) * 1.8; sink = 0.12 * sc; }
      else if (sp === SP.giantTree) sc = 0.95 + (sc0 - 0.7) * 0.6;
      else if (sp === SP.crystal) sc = sc0 * 1.3;
      else if (isTree) sc *= TREE_SCALE[sp] ?? 1.15;
      const tiltK = isRock ? 1.0 : isTree ? 0.06 : 0.3;
      Quaternion.RotationYawPitchRollToRef(rot, -tz * tiltK + (isTree ? (hash01(x, z) - 0.5) * 0.06 : 0), tx * tiltK, tmpQ);
      tmpS.set(sc, sc * (isTree ? 0.9 + hash01(z, x) * 0.25 : 1), sc); tmpT.set(x, y - sink, z);
      Matrix.ComposeToRef(tmpS, tmpQ, tmpT, tmpM); tmpM.copyToArray(o.mat, o.n * 16);
      let col;
      if (isRock) { const lk = ROCK_LOOK[kind] ?? ROCK_LOOK[15]; const v = 0.85 + hash01(x * 3, z) * 0.3; col = [lk[1][0] * v, lk[1][1] * v, lk[1][2] * v, lk[0] / 32]; }
      else { const opts = LEAF_TINT[kind] ?? [[1, 1, 1]]; const t = opts[Math.floor(hash01(x, z * 7) * opts.length) % opts.length]; const v = 0.88 + hash01(z * 5, x) * 0.24; col = [t[0] * v, t[1] * v, t[2] * v, 1]; }
      o.col.set(col, o.n * 4); o.n++;
    }
    c.per = per; c.state = 2; dirty = true;
  }

  function scan() {
    const cam = scene.activeCamera; if (!cam) return;
    camPos.copyFrom(cam.globalPosition ?? cam.position);
    const cx0 = Math.floor((camPos.x - R_VEG) / CELL), cx1 = Math.floor((camPos.x + R_VEG) / CELL);
    const cz0 = Math.floor((camPos.z - R_VEG) / CELL), cz1 = Math.floor((camPos.z + R_VEG) / CELL);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const x0 = cx * CELL, z0 = cz * CELL; const d = Math.hypot(x0 + CELL / 2 - camPos.x, z0 + CELL / 2 - camPos.z);
      if (d > R_VEG + CELL * 0.7) continue;
      const k = `${cx},${cz}`; let c = cells.get(k);
      if (!c) {
        c = { k, x0, z0, state: 1, per: null, near: false, d };
        cells.set(k, c);
        pool.run({ t: 'scatter', x0, z0, size: CELL, density: DENS }, () => c.d + 400, () => !cells.has(k)).then((r) => { if (cells.has(k)) processCell(c, r); }).catch(() => { cells.delete(k); });
      }
      c.d = d;
    }
    for (const c of cells.values()) {
      const d = Math.hypot(c.x0 + CELL / 2 - camPos.x, c.z0 + CELL / 2 - camPos.z); c.d = d;
      if (d > R_VEG + CELL * 1.5) { cells.delete(c.k); if (c.state === 2) dirty = true; continue; }
      const near = d < R_NEAR + CELL * 0.5;
      if (near !== c.near && c.state === 2) dirty = true;
      c.near = near;
    }
  }

  function rebuild() {
    for (const p of parts) p.n = 0;
    // count
    const need = parts.map(() => 0);
    const idx = (sp, lod) => bySp[sp][lod];
    for (const c of cells.values()) if (c.state === 2) for (let sp = 0; sp < SPECIES.length; sp++) { const n = c.per[sp].n; if (!n) continue; for (const p of idx(sp, c.near ? 0 : 1)) need[parts.indexOf(p)] += n; }
    parts.forEach((p, i) => { if (need[i] > p.cap) { p.cap = Math.ceil(need[i] * 1.4) + 16; p.buf = new Float32Array(p.cap * 16); p.col = new Float32Array(p.cap * 4); p.realloc = true; } });
    for (const c of cells.values()) if (c.state === 2) for (let sp = 0; sp < SPECIES.length; sp++) {
      const o = c.per[sp]; if (!o.n) continue;
      for (const p of idx(sp, c.near ? 0 : 1)) { p.buf.set(o.mat, p.n * 16); p.col.set(o.col, p.n * 4); p.n += o.n; }
    }
    let total = 0;
    for (const p of parts) {
      const m = p.mesh;
      if (p.n === 0) { m.thinInstanceCount = 0; m.setEnabled(false); continue; }
      if (p.realloc) { m.thinInstanceSetBuffer('matrix', p.buf, 16, false); m.thinInstanceSetBuffer('color', p.col, 4, false); p.realloc = false; }
      else { m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color'); }
      m.thinInstanceCount = p.n; m.setEnabled(true); total += p.n;
    }
    stats.instances = total;
  }

  const stats = { instances: 0, cells: 0 };
  function update(dt) {
    scanTimer -= dt; if (scanTimer <= 0) { scanTimer = 0.35; scan(); stats.cells = cells.size; }
    rebuildTimer -= dt;
    if (dirty && rebuildTimer <= 0) { dirty = false; rebuildTimer = 0.4; rebuild(); }
  }
  function pendingCount() { let n = 0; for (const c of cells.values()) if (c.state !== 2) n++; return n; }
  return { update, stats, pendingCount, materials: { barkMat, leafMat, rockMat, crystalMat }, leafTex };
}

function hash01(x, z) { let h = (Math.floor(x * 13.7) * 374761393 + Math.floor(z * 7.3) * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
