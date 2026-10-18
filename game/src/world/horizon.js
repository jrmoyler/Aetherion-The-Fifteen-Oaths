// Distant mountain ranges and islands beyond the continent so the horizon is never empty.
// One static ring mesh (PBR, vertex coloured rock/snow), softened by aerial perspective.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ridged, fbm, noise2 } from '@shared/terrain.js';

export function createHorizon(ctx) {
  const { scene } = ctx;
  const AZ = 320, RAD = 22, R0 = 3700, R1 = 9200;
  const pos = [], col = [], idx = [];
  const H = (x, z) => {
    const r = Math.hypot(x, z); const th = Math.atan2(z, x);
    const sector = 0.5 + 0.5 * noise2(Math.cos(th) * 2.2 + 7, Math.sin(th) * 2.2 - 3); // open-sea gaps
    const m = Math.min(1, Math.max(0, (r - R0) / 1500)) * (sector > 0.32 ? 1 : sector / 0.32);
    const rr = ridged(x / 1500 + 11, z / 1500 - 5, 5);
    const big = fbm(x / 3800, z / 3800, 3) * 0.5 + 0.5;
    return -45 + m * (rr * rr * (520 + 900 * big) + 60 * fbm(x / 400, z / 400, 3)) * (1 - Math.max(0, (r - 8400) / 1400) * 0.6);
  };
  for (let j = 0; j <= RAD; j++) {
    const t = j / RAD; const r = R0 + (R1 - R0) * Math.pow(t, 1.3);
    for (let i = 0; i <= AZ; i++) {
      const a = (i / AZ) * Math.PI * 2; const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = H(x, z); pos.push(x, h, z);
      const snow = Math.min(1, Math.max(0, (h - 520) / 260));
      const v = 0.75 + 0.25 * (fbm(x / 300, z / 300, 2) * 0.5 + 0.5);
      col.push((0.2 + 0.62 * snow) * v, (0.21 + 0.63 * snow) * v, (0.23 + 0.66 * snow) * v, 1);
    }
  }
  for (let j = 0; j < RAD; j++) for (let i = 0; i < AZ; i++) {
    const a = j * (AZ + 1) + i, b = a + 1, c = a + AZ + 1, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const vd = new VertexData(); vd.positions = pos; vd.colors = col; vd.indices = idx;
  const normals = []; VertexData.ComputeNormals(pos, idx, normals); vd.normals = normals;
  const m = new Mesh('horizonMountains', scene); vd.applyToMesh(m);
  const mat = new PBRMaterial('horizonMat', scene); mat.metallic = 0; mat.roughness = 0.95; mat.albedoColor.set(1, 1, 1); mat.backFaceCulling = false;
  m.material = mat; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false;
  m.computeWorldMatrix(true); m.freezeWorldMatrix(); mat.freeze();
  return { mesh: m };
}
