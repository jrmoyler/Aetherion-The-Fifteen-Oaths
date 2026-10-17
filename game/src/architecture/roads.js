// Roadside dressing along the land routes between sanctuaries: lantern posts every ~60 m
// (alternating sides), milestones, a watchtower and a ruin per route. One merged mesh set +
// thin instances per route, distance-culled.
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ROUTES, SANCTUARY } from '@shared/oaths.js';
import { heightAt, SEA_LEVEL } from '@shared/terrain.js';
import { Frame, Builder, Instancer } from './builder.js';
import { M, getProtos, lanternPostProto, mulberry } from './kit.js';

export function buildRoads(ctx, metas, resolveMat) {
  const { scene } = ctx; const byId = Object.fromEntries(metas.map((m) => [m.id, m]));
  const routes = [];
  const matsFor = (m) => {
    const st = m.style; const mm = (v) => (Array.isArray(v) ? M(v[0], v[1]) : v);
    return { wall: mm(st.mats.wall), trim: mm(st.mats.trim), metal: mm(st.mats.metal), roof: mm(st.mats.roof), glow: M('emissive.glow', { emissive: st.flame ?? st.glow, emissiveIntensity: 2.4 }) };
  };
  ROUTES.forEach(([a, b], ri) => {
    const A = byId[a], B = byId[b]; if (!A || !B) return;
    const dx = B.cx - A.cx, dz = B.cz - A.cz; const L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L; const px = uz, pz = -ux;
    const mx = (A.cx + B.cx) / 2, mz = (A.cz + B.cz) / 2;
    const F = new Frame(); const bld = new Builder(F); const inst = new Instancer(F);
    const rand = mulberry(ri * 131 + 7);
    const MA = matsFor(A), MB = matsFor(B);
    const keep = SANCTUARY.cityRadius + 18;
    const at = (s, off) => { const x = A.cx + ux * s + px * off, z = A.cz + uz * s + pz * off; return [x, z, heightAt(x, z)]; };
    const ok = (s) => s > keep && s < L - keep;
    let side = 1;
    for (let s = keep; s < L - keep; s += 60) {
      const [x, z, y] = at(s, side * 7.5); side = -side;
      if (y < SEA_LEVEL + 0.4) continue;
      const Mx = s < L / 2 ? MA : MB;
      inst.add(lanternPostProto(Mx.metal, Mx.glow, 3.6), x - mx, y - 0.1, z - mz, 0);
      ctx.collision.addCircle(x, z, 0.25, y - 1, y + 3.6, { tag: 'road' });
    }
    for (let s = keep + 40; s < L - keep; s += 300) {
      const [x, z, y] = at(s, -6.5); if (y < SEA_LEVEL + 0.4) continue;
      const Mx = s < L / 2 ? MA : MB; const ry = Math.atan2(ux, uz);
      bld.box(Mx.wall, x - mx, y - 0.6, z - mz, 0.8, 1.9, 0.55, { ry });
      bld.cyl(Mx.trim, x - mx, y + 1.3, z - mz, 0.5, 0.05, 0.4, 4, { ry: ry + Math.PI / 4 });
      ctx.collision.addCircle(x, z, 0.5, y - 1, y + 1.4, { tag: 'road' });
    }
    // watchtower near the middle
    { const s = L * (0.42 + rand() * 0.16); if (ok(s)) { const off = (rand() < 0.5 ? -1 : 1) * 24; const [x, z, y] = at(s, off); if (y > SEA_LEVEL + 1) {
      const Mx = s < L / 2 ? MA : MB; const lx = x - mx, lz = z - mz; const ry = Math.atan2(ux, uz);
      bld.box(Mx.wall, lx, y - 3, lz, 5, 14, 5, { ry }); bld.box(Mx.trim, lx, y + 11, lz, 6, 0.6, 6, { ry });
      for (const [cx, cz] of [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]]) bld.box(Mx.wall, lx + cx, y + 11.6, lz + cz, 0.6, 2.2, 0.6, { ry: 0 });
      bld.hip(Mx.roof, lx, y + 13.8, lz, 6.6, 6.6, 3, { ry });
      inst.add(lanternPostProto(Mx.metal, Mx.glow, 3.6), lx, y + 11.6, lz, 0, 0.6, 0.4, 0.6);
      ctx.collision.addBox(x, z, 2.5, 2.5, -ry, y - 3, y + 14, { tag: 'road' });
    } } }
    // a ruin cluster
    { const s = L * (rand() < 0.5 ? 0.3 : 0.7); if (ok(s)) { const off = (rand() < 0.5 ? -1 : 1) * (30 + rand() * 10); const [x, z, y] = at(s, off); if (y > SEA_LEVEL + 1) {
      const Mx = s < L / 2 ? MA : MB;
      for (let k = 0; k < 6; k++) { const ox = (rand() - 0.5) * 14, oz = (rand() - 0.5) * 14; const gy = heightAt(x + ox, z + oz); const h = 1 + rand() * 5; const ry = rand() * Math.PI;
        bld.box(Mx.wall, x + ox - mx, gy - 1, z + oz - mz, 1.2 + rand() * 4, h + 1, 1.0, { ry, rz: (rand() - 0.5) * 0.12 });
        ctx.collision.addBox(x + ox, z + oz, 1.5, 0.6, -ry, gy - 1, gy + h, { tag: 'road' }); }
      bld.archWall(Mx.wall, x - mx, heightAt(x, z) - 0.5, z - mz, 6, 6.5, 1.2, 3, 4.6, { ry: rand() * Math.PI });
    } } }
    const pos = new Vector3(mx, 0, mz);
    const meshes = [...bld.build(scene, `road${ri}`, resolveMat, { position: pos }), ...inst.build(scene, `road${ri}`, getProtos(), resolveMat, { position: pos })].map((p) => p.mesh);
    routes.push({ A, B, meshes, on: true });
  });

  function segDist(p, r) {
    const ax = r.A.cx, az = r.A.cz, bx = r.B.cx, bz = r.B.cz; const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.z - az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(p.x - (ax + vx * t), p.z - (az + vz * t));
  }
  const maxD = Math.min(900, (ctx.quality?.drawDistance ?? 1200) * 0.7);
  return {
    routes,
    update(cam) { for (const r of routes) { const on = segDist(cam, r) < maxD; if (on !== r.on) { r.on = on; for (const m of r.meshes) m.setEnabled(on); } } },
  };
}
