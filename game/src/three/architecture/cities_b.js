// Pure Three.js migration of the canonical measured city kit.
// City styles oath-08 .. oath-15.
import { cornice, finial } from './kit.js';
import { TAU, polar, rot2, colBox, stairs, terrace, banner, balustrade, genericHouse, brazier, lanternPost, emblemStanding, emblemFlat, treeProto, pool, roundPool, squareTower, roundTower, swag, crateProto, boxProto, arcPts, segPts, crenelProto, guardRail, overlayOf } from './kit.js';

const D = Math.PI / 180;
import { terraceStairs, arcade, arcArcade, blockWall, gear, cable, ringBanners, rockMass, freeSpots, outerRocks, channelRing, horizonCrags, skyline } from './motifs.js';

// ------------------------------------------------------------------ helpers
function colonnade(S, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.round(L / (o.bay ?? 6))); const bay = L / n;
  const ry = Math.atan2(x1 - x0, z1 - z0); const depth = o.depth ?? 6; const H = o.h ?? 10;
  const col = S.M.wall, cap = S.M.metal, roof = o.roof ?? S.M.roof;
  S.F.push(x0, o.y ?? 0.06, z0, ry);
  for (let i = 0; i <= n; i++) {
    const z = i * bay; const [wx, wz] = S.F.xz(0, z);
    for (const x of [-depth / 2, depth / 2]) {
      S.d.box(S.M.trim, x, 0, z, 1.0, 0.5, 1.0);
      S.b.cyl(col, x, 0.5, z, 0.55, 0.47, H - 1, 14);
      S.d.cyl(cap, x, H - 0.5, z, 0.5, 0.75, 0.5, 14);
      S.col.circle(x, z, 0.5, -0.5, H, false);
    }
  }
  // entablature
  for (const x of [-depth / 2, depth / 2]) { S.b.box(col, x, H, L / 2, 1.1, 0.9, L + 1.1); S.d.box(cap, x, H + 0.9, L / 2, 1.2, 0.12, L + 1.2); }
  // folded canopy peaks per bay
  for (let i = 0; i < n; i++) {
    const zc = (i + 0.5) * bay;
    S.b.hip(roof, 0, H + 1.0, zc, depth + 1.6, bay, o.rise ?? 4, { ridge: 0 });
    const top = [0, H + 1.0 + (o.rise ?? 4), zc];
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.d.beam(cap, [cx * (depth / 2 + 0.8), H + 1.0, zc + cz * bay / 2], top, 0.1);
  }
  if (o.backWall !== false) { S.b.box(S.M.wall, depth / 2 + 1.2, -2, L / 2, 0.9, H + 3, L + 1); S.col.box(depth / 2 + 1.2, L / 2, 0.45, L / 2, 0, -2, H + 1, false); }
  S.F.pop();
}

function obeliskBanner(S, x, z, ry, h = 12) {
  S.F.push(x, 0.06, z, ry);
  S.b.box(S.M.trim, 0, -0.5, 0, 2.6, 1.2, 2.6);
  S.b.cyl(S.M.wall, 0, 0.7, 0, 1.15, 0.8, h, 4, { ry: Math.PI / 4 });
  S.b.cyl(S.M.metal, 0, h + 0.7, 0, 0.85, 0.02, 1.6, 4, { ry: Math.PI / 4 });
  S.d.torus(S.M.metal, 0, h - 1.6, -0.62, 0.62, 0.07, 28, 5, { rx: Math.PI / 2 });
  emblemStanding(S, S.d, S.M.metal, 0, h - 1.6, -0.66, 0.45, 0, 0.06);
  banner(S, 0, h - 3.2, -0.82, 0, 1.4, 6.5, { bar: S.M.metal });
  S.F.pop();
  S.col.circle(x, z, 1.4, -0.5, h + 1, false);
}

// ------------------------------------------------------------------ styles
export default {
  // ================================================================ 08 Bitterglass Guild
  'oath-08': {
    plaza: 'square', glow: '#c4ff3a', flame: '#d8ff70', lamp: 'lantern', emblemScale: 3.2,
    dress: { rim: { items: ['planter', 'urn', 'crates'], step: 8 }, tiers: { items: ['urn', 'planter'], step: 6, vines: true } },
    banner: { color: '#4a2a46', trim: '#b89a50', emblem: '#d8b860' },
    mats: {
      pave: ['paving.slab', { tint: '#8c867b' }], border: ['stone.darkgranite', { tint: '#4a4a40' }], ground: ['paving.flagstone', { tint: '#7a766c' }],
      wall: ['stone.limestone', { tint: '#8a867c' }], trim: ['stone.darkgranite', { tint: '#555048' }], metal: ['metal.brass', { tint: '#9a8048' }], inlay: ['metal.brass'],
      roof: ['tile.roof', { tint: '#5e3c56' }], glass: ['glass.tinted', { tint: '#9ab890' }], reagent: ['liquid.reagent'], house: ['stone.limestone', { tint: '#7e7a70' }],
      found: ['stone.darkgranite', { tint: '#4a4a42' }], wood: ['wood.weathered', { tint: '#4a3a2a' }], leaves: ['foliage.leaves', { tint: '#5a7a30' }],
    },
    inlayExtra(S, mat, y) {
      S.d.box(mat, 0, y, 0, 0.3, 0.025, 72); S.d.box(mat, 0, y, 0, 72, 0.025, 0.3);
      // alchemical roundels: banded rings with twelve spokes (the brass floor seals of the guild)
      for (const z of [-27, 27]) { S.d.disc(overlayOf(S.M.trim, 1), 0, y - 0.005, z, 5.6, 48); S.d.ring(mat, 0, y, z, 5.2, 5.6, 0.025, 48); S.d.ring(mat, 0, y, z, 3.6, 3.75, 0.025, 40); S.d.ring(mat, 0, y, z, 1.1, 1.3, 0.025, 24); for (let k = 0; k < 12; k++) { const a = k * TAU / 12; const [px, pz] = polar(2.45, a); S.d.box(mat, px, y, z + pz, 0.09, 0.025, 2.2, { ry: a }); } }
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) S.d.box(mat, sx * 11, y, sz * 11, 0.22, 0.025, 31, { ry: Math.atan2(sx, -sz) });
    },
    rim: (S) => ({ type: 'iron', rail: S.M.metal, post: S.M.trim, balMat: S.M.metal }),
    hall(S) {
      const M = S.M; const h = 2.4;
      terraceStairs(S, { x0: -42, x1: 42, z0: 50, z1: 92, h, mat: M.trim, coping: M.wall, stairW: 14, run: 4.2 });
      S.reserve(0, 72, 44);
      S.b.box(M.wall, 0, h, 77, 40, 13, 18); cornice(S, M.trim, 0, h + 12.45, 77, 40, 18); S.b.hip(M.roof, 0, h + 13, 77, 42.5, 20.5, 7); finial(S, M.metal, -11, h + 20, 77, 1.4); finial(S, M.metal, 11, h + 20, 77, 1.4);
      S.d.box(M.trim, 0, h + 12.4, 77, 40.6, 0.6, 18.6);
      S.b.archWall(M.wall, 0, h, 67.3, 12, 13.6, 1.4, 5.2, 9); for (const s of [-1, 1]) colBox(S, s * 4.3, 67.3, 3.4, 1.4, 0, h - 1, h + 13.6, false);
      S.d.box(M.dark, 0, h, 67.9, 5.2, 9, 0.2);
      emblemStanding(S, S.d, M.metal, 0, h + 11, 66.5, 1.5, 0, 0.12);
      for (const x of [-15, -9, 9, 15]) { S.b.archWall(M.trim, x, h + 3, 67.95, 3, 6, 0.3, 1.8, 5); S.d.box(M.glass, x, h + 3, 68.05, 1.8, 5, 0.1); }
      for (const x of [-19.6, 19.6]) S.d.tube(M.metal, [[x, h, 67.5], [x, h + 12, 67.5], [x, h + 12.6, 69]], 0.35, 8);
      for (const s of [-1, 1]) roundTower(S, s * 24, 72, 3.4, 18, { y: h, mat: M.wall, trim: M.metal, roof: 'cone', roofMat: M.roof });
      colBox(S, 0, 77, 40, 18, 0, h - 1, h + 13, false);
      S.d.tube(M.metal, [[-40, 1.2, 49.6], [40, 1.2, 49.6]], 0.3, 8); S.d.tube(M.metal, [[-40, 1.9, 49.6], [40, 1.9, 49.6]], 0.2, 8);
      // distillery stacks and brass pipe runs across the guildhall
      for (const x of [-12, 12]) { S.b.cyl(M.trim, x, h + 13, 82, 1.4, 1.2, 9, 12); S.d.cyl(M.metal, x, h + 21.6, 82, 1.5, 1.5, 0.5, 12); S.d.torus(M.metal, x, h + 17, 82, 1.32, 0.1, 18, 4); }
      for (const [y0, r] of [[h + 2.2, 0.42], [h + 3.4, 0.3]]) S.d.tube(M.metal, [[-20, y0, 67.6], [-6, y0, 67.6], [-6, y0 + 4, 67.6], [6, y0 + 4, 67.6], [6, y0, 67.6], [20, y0, 67.6]], r, 10);
      for (const x of [-16, -6, 6, 16]) { S.d.torus(M.metal, x, h + 2.2, 67.6, 0.55, 0.08, 14, 4, { rz: Math.PI / 2 }); }
      S.hallDoor = { x: 0, y: h, z: 64 };
    },
    signature(S) {
      const M = S.M;
      for (const s of [-1, 1]) {
        const x = s * 57;
        if (S.clear(x, 8, 8) && S.clear(x, -2, 6) && S.clear(x, 18, 6)) {
          pool(S, x, 8, 13, 22, { water: M.reagent, rim: M.trim, floor: M.trim, waterY: 0.3 });
          balustrade(S, [[x - 7, -3.4], [x + 7, -3.4], [x + 7, 19.4], [x - 7, 19.4], [x - 7, -3.4]], { type: 'iron', rail: M.metal, post: M.trim, y: 0.6, h: 0.95, balMat: M.metal });
          S.light(x, 2, 8, '#b8ff40', 14, 1.0); S.reserve(x, 8, 14);
        }
        if (S.clear(x, -24, 7)) { roundPool(S, x, -24, 6, { water: M.reagent, rim: M.trim }); S.reserve(x, -24, 8); S.d.cyl(M.metal, x, 0.6, -24, 1.2, 0.9, 3.5, 12); S.d.cyl(M.glass, x, 4.1, -24, 1.0, 1.0, 2.5, 12); S.d.cyl(M.metal, x, 6.6, -24, 1.1, 0.3, 1.2, 12); }
      }
      // greenhouse arcades with glass barrel vaults
      for (const a of freeSpots(S, 70, [58 * D, -58 * D, 122 * D, -122 * D, 90 * D, -90 * D, 35 * D, -35 * D, 150 * D, -150 * D], 13).slice(0, 4)) {
        const [x, z] = polar(71, a); S.F.push(x, 0, z, a);
        for (const zz of [-5, 5]) arcade(S, M.wall, -14, zz, 14, zz, 5.5, 4, 0.8, 4.2);
        S.b.cyl(M.glass, -14, 5.5, 0, 5.4, 5.4, 28, 18, { rz: -Math.PI / 2, a0: Math.PI, arc: Math.PI, caps: false });
        for (let k = 0; k <= 8; k++) S.d.torus(M.metal, -14 + k * 3.5, 5.5, 0, 5.45, 0.09, 18, 4, { rz: Math.PI / 2, a0: -Math.PI / 2, arc: Math.PI });
        S.d.box(M.metal, 0, 10.85, 0, 28.4, 0.18, 0.3);
        for (const ex of [-14.3, 14.3]) { S.b.box(M.wall, ex, 0, 0, 0.8, 5.5, 11); colBox(S, ex, 0, 0.8, 11, 0, -1, 5.5, false); S.d.prism(M.glass, arcPts(5.4, -Math.PI / 2, Math.PI / 2, 1.2).map(([px, pz]) => [px, pz]), ex, 5.5, 0, 0.12, { vertical: true, ry: Math.PI / 2 }); }
        for (let k = 0; k < 5; k++) S.d.sphere(M.leaves, -11 + k * 5.5, 1.5, (k % 2 ? 1.5 : -1.5), 1.6, 8);
        S.F.pop(); S.reserve(x, z, 16);
      }
      for (const a of freeSpots(S, 82, [100 * D, -100 * D, 155 * D, -155 * D, 75 * D, -75 * D, 45 * D, -45 * D], 5).slice(0, 4)) {
        const [x, z] = polar(76, a);
        roundTower(S, x, z, 3, 17, { mat: M.wall, trim: M.metal, roof: 'cone', roofMat: M.roof });
        for (let k = 0; k < 3; k++) S.d.torus(M.metal, x, 4 + k * 4.5, z, 3.05, 0.14, 20, 4);
        const [cx, cz] = polar(80.5, a); S.d.cyl(M.metal, cx, 0, cz, 0.7, 0.6, 22, 10); S.d.disc(overlayOf(M.glow), cx, 22.02, cz, 0.55, 10); S.col.circle(cx, cz, 0.8, -1, 22, false);
        const [px, pz] = polar(64, a); S.d.tube(M.metal, [[x, 6, z], [px, 6, pz], [px, 0.5, pz]], 0.32, 8);
        S.reserve(x, z, 6);
      }
    },
    house(S, w, d, h, rand) { genericHouse(S, w, d, h, { roof: S.M.roof }); if (rand() < 0.5) { S.d.cyl(S.M.metal, w * 0.3, h, d * 0.6, 0.35, 0.3, 3.5, 8); } },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 8 }),
  },

  // ================================================================ 09 Oath of Daybreak
  'oath-09': {
    plaza: 'square', glow: '#fff0b0', flame: '#ffe6a0', lamp: 'lantern',
    dress: { rim: { items: ['planter', 'statue', 'urn'], step: 9 }, tiers: { items: ['urn', 'statue'], step: 6.5, vines: true } },
    banner: { color: '#ece4d2', trim: '#c8a050', emblem: '#b08a3a' },
    mats: {
      pave: ['stone.marble'], border: ['stone.marble', { tint: '#d2cabb' }], ground: ['paving.flagstone', { tint: '#d6d0c4' }],
      wall: ['stone.marble', { tint: '#e9e4da' }], trim: ['stone.marble', { tint: '#cfc7b6' }], metal: ['metal.gold'], inlay: ['metal.gold'],
      roof: ['stone.marble', { tint: '#f1ece2' }], house: ['plaster.lime', { tint: '#ebe5d8' }], found: ['stone.limestone', { tint: '#cbc2b0' }],
      wood: ['wood.lacquer', { tint: '#6a5030' }], leaves: ['foliage.leaves', { tint: '#2a4422' }], bark: ['bark.living'], dark: ['stone.basalt', { tint: '#3a3632' }],
    },
    rim: (S) => ({ type: 'stone', rail: S.M.trim, post: S.M.wall, gap: 13.5 }),
    inlayExtra(S, mat, y) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + TAU / 32; const r0 = 15.4, r1 = i % 2 ? 30 : 35.5;
        const [x, z] = polar((r0 + r1) / 2, a);
        S.d.box(mat, x, y, z, 0.2, 0.025, r1 - r0, { ry: a });
      }
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const a = Math.atan2(sx, sz); const [x, z] = polar(29, a); S.d.box(mat, x, y, z, 0.32, 0.025, 15, { ry: a }); }
      S.d.ring(mat, 0, y, 0, 26.5, 26.7, 0.025, 96);
    },
    hall(S) {
      const h = 7;
      terraceStairs(S, { x0: -48, x1: 48, z0: 50, z1: 96, h, mat: S.M.wall, coping: S.M.trim, stairW: 26, run: 9, rail: { type: 'stone', rail: S.M.trim, post: S.M.wall } });
      S.reserve(0, 72, 46);
      // lotus dais
      const dz = 70;
      for (const [r, hh] of [[12, 0.6], [10, 1.2], [8, 1.8]]) S.b.cyl(S.M.trim, 0, h, dz, r, r, hh, 40);
      S.col.circle(0, dz, 12, h - 1, h + 0.6, true); S.col.circle(0, dz, 10, h - 1, h + 1.2, true); S.col.circle(0, dz, 8, h - 1, h + 1.8, true);
      const top = h + 1.8;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU; const c = Math.sin(a), s = Math.cos(a);
        const p0 = [c * 3.2, top, dz + s * 3.2], p1 = [c * 6.8 + s * 1.3, top + 3.2, dz + s * 6.8 - c * 1.3], p2 = [c * 8.4, top + 4.4, dz + s * 8.4], p3 = [c * 6.8 - s * 1.3, top + 3.2, dz + s * 6.8 + c * 1.3];
        S.d.quad(S.M.roof, [p0, p1, p2, p3], { double: true });
        S.d.tube(S.M.metal, [p0, p1, p2, p3, p0], 0.06, 4);
      }
      S.d.cyl(S.M.metal, 0, top, dz, 1.6, 1.2, 0.8, 16);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; S.d.cyl(S.M.metal, Math.sin(a) * 1.1, top + 0.8, dz + Math.cos(a) * 1.1, 0.07, 0.07, 4.2, 5); }
      S.d.torus(S.M.metal, 0, top + 5.0, dz, 1.15, 0.09, 24, 5);
      S.d.cyl(S.M.glow, 0, top + 1.2, dz, 0.55, 0.3, 3.2, 6);
      S.light(0, top + 3, dz, '#fff0c0', 20, 2.0);
      // sun-forged screen wall
      S.b.box(S.M.wall, 0, h, 90, 84, 13, 1.6);
      S.d.box(S.M.metal, 0, h + 13, 90, 85, 0.35, 1.9);
      for (let i = -5; i <= 5; i++) { S.d.box(S.M.metal, i * 7.6, h, 89.1, 0.25, 13, 0.1); }
      emblemStanding(S, S.d, S.M.metal, 0, h + 7.5, 89.0, 4.2, 0, 0.15);
      S.d.torus(S.M.metal, 0, h + 7.5, 89.0, 5.6, 0.18, 48, 6, { rx: Math.PI / 2 });
      S.col.box(0, 90, 42, 0.8, 0, h - 1, h + 13, false);
      // terrace side colonnades
      colonnade(S, -40, 86, -40, 56, { y: h, depth: 6, backWall: true });
      colonnade(S, 40, 56, 40, 86, { y: h, depth: 6, backWall: true });
      S.hallDoor = { x: 0, y: h + 1.8, z: 61 };
      // cypress planters along terrace edge
      const tp = treeProto('cypress', S.M.bark, S.M.leaves);
      for (const x of [-44, -34, 34, 44]) { S.d.box(S.M.trim, x, h, 53, 2.2, 0.9, 2.2); S.inst.add(tp, x, h + 0.9, 53, 0, 1.1, 1.3, 1.1); }
    },
    signature(S) {
      // reflecting pools (sunken) east & west
      for (const sx of [-1, 1]) for (const [z0, z1] of [[-30, -3], [3, 30]]) {
        const x = sx * 53, z = (z0 + z1) / 2;
        if (!S.clear(x, z0, 3) || !S.clear(x, z1, 3) || !S.clear(x, z, 3)) continue;
        pool(S, x, z, 13, z1 - z0, { rim: S.M.trim, floor: S.M.wall, waterY: 0.25, rimH: 0.55 });
        S.d.box(S.M.metal, x, 0.55, z, 13.7, 0.04, 0.12); S.reserve(x, z, 14);
        const tp = treeProto('cypress', S.M.bark, S.M.leaves);
        for (const zz of [z0 + 2, z1 - 2]) { S.d.box(S.M.trim, x + sx * 8.6, 0.06, zz, 1.8, 0.8, 1.8); S.inst.add(tp, x + sx * 8.6, 0.86, zz, 0, 1, 1.15, 1); }
      }
      // perimeter colonnades
      for (const sx of [-1, 1]) {
        const segs = []; let start = null;
        for (let z = -44; z <= 46; z += 5) { const ok = S.clear(sx * 70, z, 4); if (ok && start === null) start = z; if ((!ok || z >= 46) && start !== null) { const end = ok ? z : z - 5; if (end - start >= 10) segs.push([start, end]); start = null; } }
        for (const [a, b] of segs) {
          if (sx < 0) colonnade(S, sx * 70, b, sx * 70, a, { depth: 6.5 }); else colonnade(S, sx * 70, a, sx * 70, b, { depth: 6.5 });
          S.reserve(sx * 70, (a + b) / 2, (b - a) / 2 + 4);
        }
      }
      // south colonnade
      { const segs = []; let start = null;
        for (let x = -56; x <= 56; x += 5) { const ok = S.clear(x, -66, 4); if (ok && start === null) start = x; if ((!ok || x >= 56) && start !== null) { const end = ok ? x : x - 5; if (end - start >= 10) segs.push([start, end]); start = null; } }
        for (const [a, b] of segs) { colonnade(S, a, -66, b, -66, { depth: 6.5 }); S.reserve((a + b) / 2, -66, (b - a) / 2 + 4); }
      }
      // obelisk banners at plaza corners
      for (const [x, z] of [[-45, -45], [45, -45], [-45, 45], [45, 45], [-45, 0], [45, 0]]) if (S.clear(x, z, 1.5)) obeliskBanner(S, x, z, Math.atan2(-x, -z) + Math.PI, 12);
    },
    rimFurniture(S) {
      for (const [x, z] of [[-30, -43], [-15, -43], [15, -43], [30, -43], [-43, -30], [-43, 30], [43, -30], [43, 30], [-43, -15], [43, -15], [-43, 15], [43, 15]]) if (S.clear(x, z, 0.5)) lanternPost(S, x, z, 0.06, 3.8);
    },
    house(S, w, d, h, rand) { genericHouse(S, w, d, h, { roofType: rand() < 0.3 ? 'dome' : 'flat', roof: S.M.roof, trim: S.M.trim }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 7.5 }),
    gateRoof: 'pyramid',
  },

  // ================================================================ 10 Tidal Observatory
  'oath-10': {
    glow: '#9a7aff', flame: '#b49aff', lamp: 'lantern', shrineZ: 33, emblemScale: 0,
    dress: { rim: null, tiers: { items: ['statue', 'urn', 'lantern'], step: 7 } },
    banner: { color: '#1c1f3a', trim: '#a8acb8', emblem: '#c8ccd8' },
    mats: {
      pave: ['paving.slab', { tint: '#454857', roughness: 0.36 }], border: ['stone.darkgranite', { tint: '#2c2d36' }], ground: ['paving.flagstone', { tint: '#3a3c46', roughness: 0.5 }],
      wall: ['stone.darkgranite', { tint: '#5c606e' }], trim: ['stone.darkgranite', { tint: '#6c707e' }], metal: ['metal.steel', { tint: '#b8bcc8' }],
      inlay: ['metal.steel', { tint: '#b4b8c4' }], roof: ['metal.steel', { tint: '#8a8ea0' }], meteor: ['metal.iron', { tint: '#3a3a46' }],
      house: ['stone.darkgranite', { tint: '#3b3c45' }], found: ['stone.darkgranite', { tint: '#2e2f37' }],
    },
    inlayExtra(S, mat, y) {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const [x, z] = polar(26, a); S.d.box(mat, x, y, z, 0.2, 0.025, 22, { ry: a }); }
      S.d.ring(mat, 0, y, 0, 25, 25.3, 0.025, 96); S.d.ring(mat, 0, y, 0, 31, 31.2, 0.025, 112);
    },
    rim: (S) => ({ type: 'stone', rail: S.M.trim, post: S.M.wall }),
    hall(S) {
      const M = S.M; const h = 4;
      terraceStairs(S, { x0: -36, x1: 36, z0: 52, z1: 90, h, mat: M.wall, coping: M.metal, stairW: 14, run: 6.2 });
      S.reserve(0, 72, 42);
      S.b.cyl(M.wall, 0, h, 74, 11, 11, 10, 28); S.d.cyl(M.metal, 0, h + 10, 74, 11.4, 11.4, 0.6, 28);
      S.b.sphere(M.roof, 0, h + 10.6, 74, 10.6, 24, { hemi: true });
      S.d.box(M.dark, 0, h + 12, 64.3, 1.6, 8.5, 1.2, { rx: -0.45 });
      S.d.cyl(M.metal, 0, h + 15, 70, 1.3, 1.0, 13, 14, { rx: -0.9 });
      S.d.box(M.dark, 0, h, 63.05, 3.4, 5, 0.2); S.d.box(M.metal, 0, h + 5, 63, 4.4, 0.4, 0.4);
      S.col.circle(0, 74, 11, h - 1, h + 21, false);
      S.hallDoor = { x: 0, y: h, z: 61 };
    },
    signature(S) {
      const M = S.M;
      channelRing(S, 47, 60, [...S.roads, 0], 6, { liquid: M.water, curb: M.trim, level: 0.3 });
      for (const [a0, a1] of [[0, TAU]]) {
        const ch = arcArcade(S, M.wall, 67, a0, a1, 9, 7, 3, 6.2, { skip: (x, z) => !S.clear(x, z, 3.5) });
        for (const c of ch) { S.d.box(M.metal, c.mx, 9, c.mz, c.L + 0.05, 0.4, 3.3, { ry: c.ry }); S.reserve(c.mx, c.mz, 4.5); }
      }
      // orbital monument
      const oz = 18;
      for (const [r, hh] of [[5.2, 0.5], [4.2, 1.0], [3.2, 1.5]]) S.b.cyl(M.trim, 0, 0.16, oz, r, r, hh, 28);
      S.col.circle(0, oz, 5.2, -1, 0.66, true); S.col.circle(0, oz, 4.2, -1, 1.16, true); S.col.circle(0, oz, 3.2, -1, 1.66, true);
      for (const s of [-1, 1]) S.b.tube(M.meteor, [[s * 3.6, 1.4, oz], [s * 5.4, 5, oz], [s * 5.2, 9.5, oz], [s * 3.4, 12.8, oz], [s * 1.8, 13.6, oz]], (t) => 1.25 - t * 1.1, 10);
      S.animMesh('orb', 0, 7.2, oz, 0, (b) => { b.sphere(M.meteor, 0, 0, 0, 1.7, 18); }, (n, t) => { n.rotation.y = t * 0.25; n.position.y = Math.sin(t * 0.7) * 0.3; });
      S.animMesh('ring1', 0, 7.2, oz, 0, (b) => { b.torus(M.metal, 0, 0, 0, 3.0, 0.11, 48, 5, { rx: Math.PI / 2 }); }, (n, t) => { n.rotation.y = t * 0.4; n.rotation.x = 0.35; });
      S.animMesh('ring2', 0, 7.2, oz, 0, (b) => { b.torus(M.metal, 0, 0, 0, 3.6, 0.07, 48, 4); b.sphere(M.meteor, 3.6, 0, 0, 0.35, 10); }, (n, t) => { n.rotation.y = -t * 0.3; n.rotation.z = 0.5; });
      S.light(0, 7, oz - 3, '#9a7aff', 14, 1.2);
      // monoliths with portholes
      for (const a of freeSpots(S, 84, [40 * D, -40 * D, 75 * D, -75 * D, 110 * D, -110 * D, 145 * D, -145 * D, 180 * D], 5)) {
        const [x, z] = polar(84, a); const H = 22 + S.rand() * 12; const lean = (S.rand() - 0.5) * 0.08;
        S.F.push(x, 0, z, a);
        S.b.box(M.wall, 0, -2, 0, 5.4, H + 2, 3.2, { rz: lean }); S.d.box(M.metal, 0, H - 0.4, 0, 5.8, 0.5, 3.6, { rz: lean });
        S.d.torus(M.metal, -lean * (H * 0.7), H * 0.7, -1.62, 1.25, 0.14, 28, 5, { rx: Math.PI / 2 });
        S.d.cyl(M.glow, -lean * (H * 0.7), H * 0.7, -1.62, 1.1, 1.1, 0.06, 20, { rx: Math.PI / 2 });
        S.F.pop(); S.col.box(x, z, 2.7, 1.6, a, -2, H, false); S.reserve(x, z, 5);
      }
      // floating rocks with rings
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.4; const [x, z] = polar(52 + (i % 3) * 14, a); const y = 15 + (i % 4) * 4; const sc = 1.2 + (i % 3) * 0.6; const ph = i * 1.3;
        S.animMesh(`rock${i}`, x, y, z, a, (b) => { b.box(M.wall, 0, -sc, 0, sc * 2, sc * 1.8, sc * 1.6, { ry: 0.4, rz: 0.3 }); b.box(M.wall, sc * 0.4, -sc * 0.6, 0.3, sc * 1.3, sc * 1.4, sc * 1.2, { ry: 1.1, rx: 0.4 }); b.torus(M.metal, 0, 0, 0, sc * 2.1, 0.08, 36, 4, { rx: 0.5 }); }, (n, t) => { n.position.y = Math.sin(t * 0.5 + ph) * 0.8; n.rotation.y = t * 0.05 + ph; });
      }
      outerRocks(S, M.wall, 10, 165, 240, [16, 28], [18, 38]);
      // horizon: dark tilted crags and sea stacks
      horizonCrags(S, M.wall, -Math.PI, Math.PI, 230, 420, 22, [30, 60], [40, 90]);
    },
    house(S, w, d, h) { genericHouse(S, w, d, h, { roofType: 'dome', roof: S.M.roof }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.metal, h: 8 }),
  },

  // ================================================================ 11 The Missing Court
  'oath-11': {
    plaza: 'square', glow: '#a070ff', flame: '#a070ff', lamp: 'brazier', emblemScale: 0, centerRings: false,
    dress: { rim: { items: ['statue', 'urn'], step: 12 }, tiers: { items: ['statue', 'urn'], step: 8 } },
    // austere court: one hairline ring and the cross axis, everything else bare stone
    inlayExtra(S, mat, y) { S.d.ring(mat, 0, y, 0, 11, 11.14, 0.025, 96); S.d.box(mat, 0, y, 0, 0.1, 0.025, 72); S.d.box(mat, 0, y, 0, 72, 0.025, 0.1); },
    banner: { color: '#8a2a30', trim: '#a8a8b0', emblem: '#d6d6dc' },
    mats: {
      pave: ['paving.slab', { tint: '#d0ccc4', roughness: 0.6 }], border: ['stone.limestone', { tint: '#a19d96' }], ground: ['paving.flagstone', { tint: '#aaa69f' }],
      wall: ['stone.limestone', { tint: '#b9b5ad' }], trim: ['stone.limestone', { tint: '#8f8b85' }], metal: ['metal.iron', { tint: '#2a2a2c' }],
      inlay: ['metal.iron', { tint: '#1c1c1e' }], roof: ['stone.limestone', { tint: '#9a968e' }], void: ['stone.basalt', { tint: '#060607', roughness: 0.3 }],
      house: ['stone.limestone', { tint: '#b0aca4' }], found: ['stone.limestone', { tint: '#8f8b85' }],
    },
    rim: (S) => ({ type: 'solid', rail: S.M.wall, post: S.M.trim, h: 1.1 }),
    hall(S) {
      const M = S.M; const h = 5;
      terraceStairs(S, { x0: -42, x1: 42, z0: 50, z1: 94, h, mat: M.wall, coping: M.trim, stairW: 14, run: 8 });
      S.reserve(0, 74, 46);
      for (const [r, hh] of [[7, 0.6], [5.6, 1.2], [4.2, 1.8]]) { S.b.box(M.trim, 0, h, 76, r * 2, hh, r * 2); colBox(S, 0, 76, r * 2, r * 2, 0, h - 1, h + hh, true); }
      for (const s of [-1, 1]) { S.b.box(M.wall, s * 6.5, h + 1.8, 76, 3.2, 22, 3.2); S.d.box(M.trim, s * 6.5, h + 23.8, 76, 3.8, 0.8, 3.8); colBox(S, s * 6.5, 76, 3.2, 3.2, 0, h, h + 24, false); banner(S, s * 6.5, h + 21, 74.25, 0, 2.2, 11, { bar: M.metal }); }
      S.b.sphere(M.void, 0, h + 16, 76, 3.8, 22);
      S.d.torus(M.glow, 0, h + 16, 76, 4.4, 0.05, 48, 4, { rx: Math.PI / 2 });
      S.d.box(M.metal, 0, h + 21.4, 76, 10, 0.6, 1.2);
      blockWall(S, M.wall, -62, 98, 62, 98, 22, { bw: 3, bh: 2.2, th: 3, hole: (u, v) => v > 0.45 + 0.35 * Math.sin(u * 9.0) * Math.cos(u * 3.1) || (u > 0.4 && u < 0.6 && v > 0.3) });
      for (let i = 0; i < 6; i++) { const x = -34 + i * 13.6; const ch = i % 3 === 1 ? 4 + S.rand() * 3 : 11; S.b.cyl(M.wall, x, h, 60, 0.9, 0.8, ch, 10); S.col.circle(x, 60, 1, h - 1, h + ch, false); if (ch > 10) S.d.box(M.trim, x, h + ch, 60, 2.2, 0.7, 2.2); }
      S.hallDoor = { x: 0, y: h, z: 66 };
    },
    signature(S) {
      const M = S.M;
      const hole = (u, v, i, j) => (v > 0.55 + 0.3 * Math.sin(u * 11 + i * 0.3) && u > 0.15) || ((i * 7 + j * 13) % 17 === 0 && v > 0.2);
      for (const s of [-1, 1]) {
        let start = null;
        for (let z = -48; z <= 50; z += 6) {
          const ok = S.clear(s * 50, z, 3) && z < 48;
          if (ok && start === null) start = z;
          if (!ok && start !== null) { if (z - start >= 12) { blockWall(S, M.wall, s * 50, start, s * 50, z - 3, 18, { hole, th: 3.2, bw: 3.2, bh: 2.2 }); S.reserve(s * 50, (start + z) / 2, (z - start) / 2 + 2); } start = null; }
        }
      }
      for (const a of freeSpots(S, 78, [35 * D, -35 * D, 140 * D, -140 * D, 180 * D], 6)) {
        const [x, z] = polar(78, a); squareTower(S, x, z, 5, 28, { mat: M.wall, trim: M.trim, roof: 'none', windows: true, winMat: M.dark, ry: a });
        const [bx, bz] = polar(75.4, a); banner(S, bx, 26, bz, a, 2.2, 12, { bar: M.metal }); S.reserve(x, z, 5);
      }
      const ch = arcArcade(S, M.wall, 84, 150 * D, 210 * D, 12, 8, 2.5, 8.5, { skip: (x, z) => !S.clear(x, z, 4) || S.rand() < 0.3 });
      for (const c of ch) S.reserve(c.mx, c.mz, 5);
      for (let i = 0; i < 16; i++) { const a = S.rand() * TAU; const [x, z] = polar(46 + S.rand() * 6, a); if (!S.clear(x, z, 1.5)) continue; const w = 1 + S.rand() * 2; S.b.box(M.wall, x, -0.2, z, w, 0.6 + S.rand() * 1.6, w * 0.8, { ry: S.rand() * 3, rz: (S.rand() - 0.5) * 0.3 }); S.col.circle(x, z, w * 0.5, -1, 1.4, false); }
      outerRocks(S, M.wall, 10, 165, 240, [12, 26], [8, 22]);
      // horizon: ruined pale towers fading into the mist
      skyline(S, [M.wall, M.trim], -Math.PI, Math.PI, 220, 380, 26, [24, 60], 'slab');
    },
    house(S, w, d, h, rand) { genericHouse(S, w, d, h, { roofType: 'flat' }); if (rand() < 0.4) S.d.box(S.M.wall, w * 0.25, h + 0.35, d * 0.3, w * 0.4, 1.8 + rand() * 2, d * 0.4); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 9, crenels: false }),
  },

  // ================================================================ 12 Sanguine Covenant
  'oath-12': {
    plaza: 'square', glow: '#ff2a3a', flame: '#ff6a3a', lamp: 'brazier', emblemScale: 0, centerRings: false,
    dress: { rim: null, tiers: { items: ['urn', 'brazier', 'urn', 'statue'], step: 6 } },
    banner: { color: '#6a1016', trim: '#c8a060', emblem: '#e0bc78' },
    mats: {
      pave: ['paving.slab', { tint: '#4a3e3a' }], border: ['stone.sandstone', { tint: '#7a4c42' }], ground: ['paving.flagstone', { tint: '#5a443e' }],
      wall: ['stone.sandstone', { tint: '#b4805e' }], red: ['stone.sandstone', { tint: '#8a3e32' }], trim: ['stone.sandstone', { tint: '#c49a78' }],
      metal: ['metal.iron', { tint: '#4a3e38' }], gold: ['metal.gold', { tint: '#c89a58' }], inlay: ['metal.gold', { tint: '#b08a52' }], roof: ['tile.roof', { tint: '#4a2a28' }],
      rglass: ['crystal.amethyst', { tint: '#c0101e', emissiveIntensity: 2.4 }], drape: ['cloth.banner', { tint: '#8a141c' }],
      bloom: ['foliage.leaves', { tint: '#8a1420' }], leaves: ['foliage.leaves', { tint: '#3e4a2a' }],
      house: ['stone.sandstone', { tint: '#8e5a4c' }], found: ['stone.sandstone', { tint: '#5e3a34' }], dark: ['stone.basalt', { tint: '#1a1210' }],
    },
    inlayExtra(S, mat, y) {
      // carved ritual court: centre circle with cross, axial runs ending in rectangular keys
      for (const [r, w] of [[7.6, 0.28], [6.9, 0.1], [2.6, 0.22]]) S.d.ring(mat, 0, y, 0, r, r + w, 0.025, 96);
      S.d.box(mat, 0, y, 0, 15.4, 0.025, 0.18); S.d.box(mat, 0, y, 0, 0.18, 0.025, 15.4);
      for (const s of [-1, 1]) {
        S.d.box(mat, 0, y, s * 20, 0.2, 0.025, 25); for (const x of [-0.7, 0.7]) S.d.box(mat, x, y, s * 20, 0.08, 0.025, 25);
        const zc = s * 31; S.d.box(mat, 0, y, zc - 3.6, 9, 0.025, 0.2); S.d.box(mat, 0, y, zc + 3.6, 9, 0.025, 0.2); S.d.box(mat, -4.5, y, zc, 0.2, 0.025, 7.4); S.d.box(mat, 4.5, y, zc, 0.2, 0.025, 7.4);
      }
      for (const z of [-36.2, 36.2]) S.d.box(mat, 0, y, z, 72.4, 0.025, 0.16); for (const x of [-36.2, 36.2]) S.d.box(mat, x, y, 0, 0.16, 0.025, 72.4);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { S.d.ring(mat, sx * 22, y, sz * 22, 2.4, 2.62, 0.025, 40); S.d.box(mat, sx * 22, y, sz * 22, 6, 0.025, 0.12); S.d.box(mat, sx * 22, y, sz * 22, 0.12, 0.025, 6); }
    },
    rim: (S) => ({ type: 'solid', rail: S.M.wall, post: S.M.trim, h: 1.2, postEvery: 6, cap: (x, y, z) => S.d.box(S.M.gold, x, y - 0.1, z, 0.3, 0.5, 0.3) }),
    hall(S) {
      const M = S.M; const h = 3;
      terraceStairs(S, { x0: -42, x1: 42, z0: 50, z1: 94, h, mat: M.red, coping: M.trim, stairW: 14, run: 5 });
      S.reserve(0, 74, 46);
      // sanctum: tall sandstone hall with pilasters, gilded arch door, stepped parapet and facade banners
      S.b.box(M.wall, 0, h, 80, 34, 17, 20); S.d.box(M.trim, 0, h + 17, 80, 35, 0.7, 21);
      for (const [w, hh, yy] of [[30, 1.4, 17.7], [22, 1.6, 19.1], [12, 1.8, 20.7]]) S.b.box(M.red, 0, h + yy, 80, w, hh, 16);
      S.d.box(M.gold, 0, h + 22.5, 80, 3, 0.4, 3); S.d.cyl(M.gold, 0, h + 22.9, 80, 1.2, 0.05, 2.6, 4, { ry: Math.PI / 4 });
      for (let i = -3; i <= 3; i++) { if (!i) continue; S.d.box(M.trim, i * 4.6, h, 69.6, 1.2, 17, 0.8); S.d.box(M.gold, i * 4.6, h + 15.6, 69.3, 1.4, 0.3, 0.6); if (Math.abs(i) >= 2) banner(S, i * 4.6 - Math.sign(i) * 2.3, h + 15.2, 69.5, 0, 1.7, 9.5, { bar: M.gold }); }
      S.b.archWall(M.red, 0, h, 69.6, 12, 15, 1.6, 5.4, 11); for (const s of [-1, 1]) colBox(S, s * 4.35, 69.6, 3.3, 1.6, 0, h - 1, h + 15, false);
      S.d.box(M.dark, 0, h, 70.3, 5.4, 11, 0.2); S.d.box(M.gold, 0, h + 15, 69.6, 12.4, 0.4, 1.9);
      S.d.torus(M.gold, 0, h + 8.3, 68.9, 2.7, 0.12, 40, 5, { rx: Math.PI / 2, arc: Math.PI });
      emblemStanding(S, S.d, M.gold, 0, h + 13, 68.7, 1.2, 0, 0.1);
      for (const s of [-1, 1]) {
        squareTower(S, s * 20, 76, 7.5, 25, { y: h, mat: M.red, trim: M.trim, roof: 'pyramid', roofMat: M.roof, windows: false });
        for (const k of [0, 1]) S.d.box(M.rglass, s * 20, h + 8 + k * 8, 72.2, 1.0, 4.5, 0.1);
        ritualPillar(S, s * 12, 53.5, 14, h);
        planter(S, s * 10.8, 48.4, 4.2, 1.6);
      }
      for (const s of [-1, 1]) swag(S, M.drape, [s * 12, h + 14.6, 53.5], [s * 17, h + 16, 69.4], 2.5, 1.6);
      swag(S, M.drape, [-12, h + 14.6, 53.5], [12, h + 14.6, 53.5], 3.2, 1.8);
      colBox(S, 0, 80, 34, 20, 0, h - 1, h + 17, false);
      S.light(0, h + 5, 67, '#ff3030', 16, 1.6);
      S.hallDoor = { x: 0, y: h, z: 67 };
    },
    signature(S) {
      const M = S.M; const P = [];
      // shrine towers framing the ritual court at its inner corners, plus outer ones on the rim
      // corner spots slide along the court's side until clear of road corridors
      for (const [x, z] of [[-34, -34], [34, -34], [-34, 34], [34, 34]]) {
        const spot = [[0, 0], [0, 5], [0, 9], [5, 0], [0, 13]].map(([dx, dz]) => [x - Math.sign(x) * dx, z - Math.sign(z) * dz]).find(([px, pz]) => S.clear(px, pz, 3.5));
        P.push(spot || null); if (spot) { ritualPillar(S, spot[0], spot[1], 20, 0.16); S.reserve(spot[0], spot[1], 4); }
      }
      const H = 20.6;
      const link = (a, b, sag) => { if (a && b) swag(S, M.drape, [a[0], H, a[1]], [b[0], H, b[1]], sag, 2.8); };
      link(P[0], P[2], 6.5); link(P[1], P[3], 6.5); link(P[2], [-12, 17.6], 4); link(P[3], [12, 17.6], 4);
      for (const p of P) if (p) for (const s of [-1, 1]) planter(S, p[0] + s * 4.4, p[1] - 0.6 * Math.sign(p[1]), 2.2, 1.3);
      // arcaded sandstone viaducts closing the court's flanks (break where the roads enter)
      for (const s of [-1, 1]) {
        const skip = (x, z) => !S.clear(x, z, 3);
        arcade(S, M.wall, s * 52, -40, s * 52, 44, 9, 7, 3, 6.4, { skip });
        for (let z = -36.5; z <= 40.5; z += 7) if (S.clear(s * 52, z, 3)) { S.d.box(M.trim, s * 52, 9, z, 3.6, 0.6, 7.2); S.d.box(M.red, s * 52, 9.6, z, 3.2, 1.0, 7.0); if (((z + 36.5) / 7) % 2 === 0) swag(S, M.drape, [s * 50.3, 10.4, z - 3.4], [s * 50.3, 10.4, z + 3.4], 1.2, 1.1, { tails: false }); }
      }
      // rim braziers and parapet planters
      for (const [x, z, w, d] of [[-20, -43.4, 3, 1.4], [20, -43.4, 3, 1.4], [-43.4, 20, 1.4, 3], [43.4, 20, 1.4, 3], [-43.4, -20, 1.4, 3], [43.4, -20, 1.4, 3]]) if (S.clear(x, z, 1.5)) planter(S, x, z, w, d);
      outerRocks(S, M.red, 14, 150, 240, [16, 30], [20, 44]);
      horizonCrags(S, M.red, -Math.PI, Math.PI, 260, 420, 22, [40, 80], [40, 80]);
    },
    house(S, w, d, h) { genericHouse(S, w, d, h, { roof: S.M.roof, trim: S.M.trim, roofType: 'flat' }); },
    districts: { rings: [120, 136] },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.red, h: 9 }),
    gateRoof: 'pyramid',
  },

  // ================================================================ 13 Folded Theatre
  'oath-13': {
    plaza: 'square', glow: '#e070ff', flame: '#ffd8a0', lamp: 'lantern', emblemScale: 0, centerRings: false,
    dress: { rim: { items: ['statue', 'bench', 'planter'], step: 9 }, tiers: { items: ['statue', 'urn'], step: 7 } },
    banner: { color: '#b84a5a', trim: '#c8a050', emblem: '#f2e8d8' },
    mats: {
      pave: ['stone.marble', { tint: '#e6dccb' }], border: ['wood.lacquer', { tint: '#2a3450' }], ground: ['stone.marble', { tint: '#d6cdbd' }],
      wall: ['stone.marble', { tint: '#e3d9c9' }], navy: ['wood.lacquer', { tint: '#26304a' }], trim: ['wood.lacquer', { tint: '#2a3450' }], metal: ['metal.gold', { tint: '#c8a050' }],
      inlay: ['wood.lacquer', { tint: '#28324c' }], roof: ['wood.lacquer', { tint: '#2a3450' }], mirror: ['metal.steel', { tint: '#dfe6f0', roughness: 0.08, mirror: true }],
      red: ['cloth.banner', { tint: '#b84a5a', backFaceCulling: false }], house: ['plaster.lime', { tint: '#e6dccb' }], found: ['stone.marble', { tint: '#bdb4a4' }],
    },
    inlayExtra(S, mat, y) {
      for (let k = -3; k <= 3; k++) { if (k === 0) continue; S.d.box(mat, k * 10.4, y, 0, 0.24, 0.025, 72); S.d.box(mat, 0, y, k * 10.4, 72, 0.025, 0.24); }
      // mirror lozenge: a polished steel diamond set in a navy frame at the court's heart, plus side panes
      const mir = overlayOf(S.M.mirror, 2);
      S.d.box(overlayOf(S.M.navy, 1), 0, y - 0.01, 0, 16.2, 0.03, 16.2, { ry: Math.PI / 4 });
      S.d.box(mir, 0, y, 0, 13.8, 0.035, 13.8, { ry: Math.PI / 4 }); S.d.box(S.M.metal, 0, y + 0.01, 0, 0.12, 0.03, 19.4); S.d.box(S.M.metal, 0, y + 0.01, 0, 19.4, 0.03, 0.12);
      for (const [x, z, w, d] of [[20.8, 10.4, 10.2, 10.2], [-20.8, -10.4, 10.2, 10.2], [10.4, -26, 10.2, 6]]) { S.d.box(overlayOf(S.M.navy, 1), x, y - 0.01, z, w + 0.8, 0.03, d + 0.8); S.d.box(mir, x, y, z, w - 0.4, 0.035, d - 0.4); }
    },
    rim: (S) => ({ type: 'solid', rail: S.M.trim, post: S.M.wall, h: 1.0 }),
    hall(S) {
      const M = S.M; const h = 2.6;
      terraceStairs(S, { x0: -44, x1: 44, z0: 50, z1: 90, h, mat: M.wall, coping: M.trim, stairW: 20, run: 4.4 });
      S.reserve(0, 70, 46);
      foldedScreen(S, -40, 82, 0, 16, 15, h, true);
      S.d.torus(M.metal, 0, h + 8, 80.8, 5.2, 0.32, 48, 6, { rx: Math.PI / 2 });
      S.d.cyl(M.mirror, 0, h + 8, 80.9, 4.9, 4.9, 0.1, 40, { rx: Math.PI / 2 });
      for (const s of [-1, 1]) { S.b.prism(M.navy, [[-3, -3], [3, -3], [0, 4]], s * 38, h, 70, 20); S.d.cyl(M.metal, s * 38, h + 20, 70.3, 0.4, 0.02, 2.5, 4); colBox(S, s * 38, 70, 6, 7, 0, h - 1, h + 20, false); }
      S.hallDoor = { x: 0, y: h, z: 64 };
    },
    signature(S) {
      const M = S.M;
      for (const a of S.roads) opticalGate(S, ...polar(46.2, a), a);
      for (const a of freeSpots(S, 55, [30 * D, -30 * D, 55 * D, -55 * D, 90 * D, -90 * D, 120 * D, -120 * D, 145 * D, -145 * D], 5)) {
        const [x, z] = polar(55, a); S.F.push(x, 0, z, a); foldedScreen(S, -7, 0, 0, 6, 7.5 + S.rand() * 2.5, 0.06, false); S.F.pop(); S.reserve(x, z, 10);
      }
      for (const s of [-1, 1]) {
        const x = s * 60; if (!S.clear(x, -20, 4) || !S.clear(x, 20, 4) || !S.clear(x, 0, 4)) continue;
        S.b.box(M.wall, x, 5.4, 0, 6, 0.6, 56); colBox(S, x, 0, 6, 56, 0, 5.2, 6.0, true);
        for (let z = -27; z <= 27; z += 6) for (const sx of [-2.6, 2.6]) { S.b.box(M.navy, x + sx, -0.5, z, 0.6, 5.9, 0.6); S.col.circle(x + sx, z, 0.4, -1, 5.4, false); }
        for (const sx of [-2.9, 2.9]) balustrade(S, segPts([x + sx, -27], [x + sx, 27], 0, 1, 3), { type: 'iron', rail: M.navy, post: M.navy, y: 6.0, h: 1.0, balMat: M.metal });
        stairs(S, M.wall, x, -31.5, 0, 4.6, 9, 0.06, 6.0);
        guardRail(S, [x - 2.9, 6.0, 27.9], [x + 2.9, 6.0, 27.9], { rail: M.navy, post: M.navy, h: 1.0 }); // closed far end
        for (let z = -24; z <= 24; z += 8) S.d.cloth(M.red, x - s * 3.1, 5.4, z, 1.2, 3.6, s > 0 ? -Math.PI / 2 : Math.PI / 2, 2, 6);
        S.reserve(x, 0, 30);
      }
      // horizon: the theatre's folded white-and-navy towers
      skyline(S, [M.wall, M.navy], -Math.PI, Math.PI, 200, 360, 30, [30, 80], 'spire');
    },
    house(S, w, d, h) {
      const M = S.M; genericHouse(S, w, d, h, { roof: M.roof, trim: M.trim, roofType: 'flat' });
      S.b.gable(M.roof, -w * 0.15, h + 0.35, d / 2, w * 0.8, d + 0.8, Math.min(w, d) * 0.55, { gableMat: M.wall });
    },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 7 }),
  },

  // ================================================================ 14 Escapement Road
  'oath-14': {
    glow: '#ffd88a', flame: '#ffd88a', lamp: 'lantern', emblemScale: 0,
    dress: { rim: { items: ['bench', 'urn', 'lantern'], step: 10, r: 47 }, tiers: { items: ['urn', 'statue'], step: 7 } },
    banner: { color: '#e8dcc0', trim: '#b8904a', emblem: '#8a6a34' },
    mats: {
      pave: ['paving.slab', { tint: '#6e6d6a' }], border: ['stone.darkgranite', { tint: '#3a3e44' }], ground: ['paving.flagstone', { tint: '#5e5e5c' }],
      wall: ['stone.darkgranite', { tint: '#3f444c' }], trim: ['stone.darkgranite', { tint: '#4d535c' }], metal: ['metal.brass', { tint: '#b8904a' }], inlay: ['metal.brass'],
      roof: ['stone.slate', { tint: '#2c3a40' }], glass: ['glass.tinted', { tint: '#8a8a80' }], face: ['plaster.lime', { tint: '#e8dcc0' }],
      house: ['stone.darkgranite', { tint: '#464b53' }], found: ['stone.darkgranite', { tint: '#383c42' }], cube: ['stone.basalt', { tint: '#202226' }],
    },
    inlayExtra(S, mat, y) {
      for (const r of [20, 24.5, 30.5, 34]) S.d.ring(mat, 0, y, 0, r, r + 0.22, 0.025, 112);
      S.d.ring(mat, 9, y, -5, 17, 17.15, 0.025, 96, { a0: 1.0, arc: 4.2 }); S.d.ring(mat, -7, y, 6, 15, 15.15, 0.025, 96, { a0: 3.8, arc: 3.6 });
    },
    rim: (S) => ({ type: 'stone', rail: S.M.trim, post: S.M.wall, cap: (x, y, z) => S.d.sphere(S.M.metal, x, y + 0.08, z, 0.18, 8) }),
    hall(S) {
      const M = S.M; const h = 3;
      terraceStairs(S, { x0: -40, x1: 40, z0: 52, z1: 92, h, mat: M.wall, coping: M.trim, stairW: 14, run: 5 });
      S.reserve(0, 72, 44);
      arcade(S, M.wall, -30, 66, 30, 66, 14, 10, 3, 10, { y: h });
      S.b.box(M.wall, 0, h, 79, 64, 14, 22); cornice(S, M.trim, 0, h + 13.45, 79, 64, 22); S.b.hip(M.roof, 0, h + 14.1, 79, 65.6, 23.6, 6); finial(S, M.metal, -21, h + 20.1, 79, 1.4); finial(S, M.metal, 21, h + 20.1, 79, 1.4); colBox(S, 0, 79, 64, 22, 0, h - 1, h + 14, false);
      S.d.box(M.metal, 0, h + 14, 66, 61, 0.5, 3.4);
      gear(S, 0, h + 21, 66.5, 0, 6, M.metal, 0.15);
      gear(S, 8.6, h + 18.5, 66.6, 0, 3.2, M.metal, -0.28);
      S.hallDoor = { x: 0, y: h, z: 63 };
    },
    signature(S) {
      const M = S.M;
      const chords = arcArcade(S, M.wall, 60, 0, TAU, 12, 7.5, 5, 8.6, { skip: (x, z) => !S.clear(x, z, 4) });
      viaductDeck(S, chords);
      chords.forEach((c, i) => { if (i % 4 === 2) { const [bx, bz] = rot2(0, -2.9, c.ry); banner(S, c.mx + bx, 11.3, c.mz + bz, c.ry, 1.7, 5.5, { bar: M.metal }); } });
      // gears where the highway breaks for roads
      for (const a of S.roads) for (const s of [-1, 1]) { const b = a + s * 16 / 60; const [x, z] = polar(60, b); gear(S, x, 16.8, z, b, 3.2, M.metal, 0.22 * s); colBox(S, x, z, 5.2, 1.2, b, 16.8 - 3.6, 16.8 + 3.6, false); } // teeth dip to head height over the deck
      // hourglass cages with floating cubes
      for (const a of [45 * D, -45 * D, 135 * D, -135 * D]) {
        const [x, z] = polar(36, a); if (!S.clear(x, z, 4)) continue;
        const R = 3.4, H = 9.2; // brass hourglass cage: stepped plinth, ribbed bars, domed crown, suspended stone cubes
        S.b.cyl(M.wall, x, 0.16, z, R + 0.5, R + 0.5, 0.8, 24); S.d.cyl(M.metal, x, 0.96, z, R + 0.2, R + 0.2, 0.35, 24);
        S.d.cyl(M.metal, x, H, z, R + 0.2, R + 0.2, 0.45, 24); S.d.sphere(M.metal, x, H + 0.45, z, R * 0.72, 16, { hemi: true, sy: 0.55 }); S.d.cyl(M.metal, x, H + 0.45 + R * 0.4, z, 0.25, 0.1, 1.4, 8); S.d.sphere(M.metal, x, H + 2.0 + R * 0.4, z, 0.3, 8);
        for (let k = 0; k < 18; k++) { const b = (k / 18) * TAU; S.d.cyl(M.metal, x + Math.sin(b) * R, 1.3, z + Math.cos(b) * R, 0.07, 0.07, H - 1.3, 5); }
        for (const ry of [3.2, 6.0]) S.d.torus(M.metal, x, ry, z, R + 0.02, 0.07, 32, 4);
        for (let k = 0; k < 4; k++) { const b = (k / 4) * TAU + Math.PI / 4; S.d.box(M.metal, x + Math.sin(b) * (R + 0.15), 0.16, z + Math.cos(b) * (R + 0.15), 0.5, H, 0.5, { ry: b }); }
        S.animMesh(`cubes${a.toFixed(2)}`, x, 4.8, z, 0, (b) => { for (let k = 0; k < 7; k++) { const c = (k / 7) * TAU; const rr = k % 2 ? 1.9 : 1.1; b.box(M.cube, Math.sin(c) * rr, -2.4 + (k % 4) * 1.5, Math.cos(c) * rr, 0.9 + (k % 3) * 0.3, 0.9 + (k % 3) * 0.3, 0.9 + (k % 3) * 0.3, { rx: 0.6 + k, rz: 0.6 + k * 0.7 }); } }, (n, t) => { n.rotation.y = t * 0.3; n.position.y = Math.sin(t * 0.9) * 0.25; });
        S.col.circle(x, z, R + 0.55, -1, H + 1, false); S.light(x, 4.5, z, '#ffd88a', 9, 0.6); S.reserve(x, z, R + 2);
      }
      for (const a of freeSpots(S, 78, [40 * D, -40 * D, 140 * D, -140 * D, 180 * D], 6)) {
        const [x, z] = polar(78, a); squareTower(S, x, z, 6.5, 26, { mat: M.wall, trim: M.metal, roof: 'pyramid', roofMat: M.roof, windows: false, ry: a });
        const [fx, fz] = polar(74.7, a);
        S.F.push(fx, 18.5, fz, a); S.d.cyl(M.face, 0, 0, 0, 2.4, 2.4, 0.12, 32, { rx: Math.PI / 2 }); S.d.torus(M.metal, 0, 0, -0.06, 2.45, 0.14, 32, 5, { rx: Math.PI / 2 });
        S.d.beam(M.metal, [0, 0, -0.12], [0.9, 1.4, -0.12], 0.12); S.d.beam(M.metal, [0, 0, -0.14], [-1.8, -0.4, -0.14], 0.09); S.F.pop();
        S.reserve(x, z, 6);
      }
      outerRocks(S, M.wall, 8, 170, 240, [14, 26], [12, 26]);
      // horizon: clockwork city spires
      skyline(S, [M.wall, M.trim], -Math.PI, Math.PI, 200, 360, 30, [35, 85], 'spire');
    },
    house(S, w, d, h) { genericHouse(S, w, d, h, { roofType: 'hip', roof: S.M.roof }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.metal, h: 8 }),
  },

  // ================================================================ 15 Impulse Foundry
  'oath-15': {
    plaza: 'square', glow: '#ffa040', flame: '#ffb060', lamp: 'lantern', emblemScale: 0, centerRings: false,
    dress: { rim: { items: ['crates', 'crates', 'bench'], step: 8 }, tiers: { items: ['crates', 'lantern'], step: 7 } },
    banner: { color: '#c8601c', trim: '#2a2c30', emblem: '#202226' },
    mats: {
      pave: ['concrete.panel', { tint: '#8e8e8c' }], border: ['concrete.panel', { tint: '#5c5e62' }], ground: ['concrete.panel', { tint: '#77787a' }],
      wall: ['concrete.panel', { tint: '#6e7074' }], trim: ['metal.steel', { tint: '#4a4c50' }], metal: ['metal.steel'], orange: ['concrete.panel', { tint: '#d0661c' }],
      inlay: ['concrete.panel', { tint: '#d06a20' }], roof: ['metal.steel', { tint: '#5a5c60' }], dark: ['metal.steel', { tint: '#26282c' }],
      house: ['metal.steel', { tint: '#6a6c70' }], found: ['concrete.panel', { tint: '#5a5c60' }], wood: ['wood.weathered', { tint: '#5a4a3a' }],
    },
    inlayExtra(S, mat, y) {
      for (const x of [-18, -16.6, 16.6, 18]) S.d.box(S.M.metal, x, y, 0, 0.14, 0.06, 73);
      for (let z = -36; z <= 36; z += 1.4) for (const x of [-17.3, 17.3]) S.d.box(S.M.dark, x, y - 0.01, z, 2.2, 0.04, 0.3);
      S.d.ring(mat, 0, y, 0, 26, 26.5, 0.025, 96); S.d.ring(mat, 0, y, 0, 5.4, 6.0, 0.025, 48); S.d.ring(mat, 0, y, 0, 3.2, 3.4, 0.025, 40);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const [x, z] = polar(30, a); S.d.box(mat, x, y, z, 0.4, 0.025, 3, { ry: a }); }
    },
    rim: (S) => ({ type: 'solid', rail: S.M.wall, post: S.M.orange, h: 1.0, postEvery: 6 }),
    hall(S) {
      const M = S.M; const h = 2.6;
      terraceStairs(S, { x0: -46, x1: 46, z0: 50, z1: 92, h, mat: M.wall, coping: M.orange, stairW: 14, run: 4.6, stairMat: M.metal });
      S.reserve(0, 72, 48);
      for (const x of [-28, -9.4, 9.4, 28]) {
        S.b.cyl(M.metal, x, h, 70, 7, 7, 16, 24); S.b.sphere(M.metal, x, h + 16, 70, 7, 20, { hemi: true, sy: 0.45 });
        for (let k = 1; k < 5; k++) S.d.torus(M.dark, x, h + k * 3.4, 70, 7.05, 0.12, 32, 4);
        S.d.cyl(M.orange, x, h + 10.5, 70, 7.1, 7.1, 1.1, 24, { caps: false });
        S.d.cyl(M.dark, x, h + 2.2, 62.9, 1.6, 1.6, 0.3, 16, { rx: Math.PI / 2 });
        S.col.circle(x, 70, 7, h - 1, h + 19, false);
      }
      for (const x of [-18.7, 0, 18.7]) S.d.tube(M.metal, [[x - 9, h + 13, 70], [x, h + 15, 70], [x + 9, h + 13, 70]], 0.5, 8);
      S.b.box(M.wall, 0, h, 86, 92, 16, 10); cornice(S, M.trim, 0, h + 15.45, 86, 92, 10); colBox(S, 0, 86, 92, 10, 0, h - 1, h + 16, false); S.d.box(M.orange, 0, h + 12, 80.95, 92, 1.2, 0.1); S.b.box(M.roof, 0, h + 16, 86, 93, 0.6, 11);
      gantry(S, -46, 58, 46, 58, 22, h);
      S.hallDoor = { x: 0, y: h, z: 60 };
    },
    signature(S) {
      const M = S.M;
      for (const s of [-1, 1]) { const x = s * 56; if (S.clear(x, -38, 3) && S.clear(x, 38, 3)) { gantry(S, x, -38, x, 38, 20, 0.06); S.reserve(x, -38, 4); S.reserve(x, 38, 4); } }
      for (const a of freeSpots(S, 64, [55 * D, -55 * D, 125 * D, -125 * D, 180 * D, 90 * D, -90 * D], 10)) {
        const [x, z] = polar(64, a); S.F.push(x, 0, z, a);
        S.b.box(M.wall, 0, -1, 0, 18, 10, 1.4); S.d.box(M.orange, 0, 3.4, -0.72, 18, 1.0, 0.06); S.d.box(M.trim, 0, 9, 0, 18.4, 0.4, 1.8);
        for (let k = 0; k < 5; k++) { const cx = -7 + k * 3.4; const big = (k % 2) === 0; const cr = (S.rand() - 0.5) * 0.2; S.b.box(big ? M.dark : M.orange, cx, 0.06, -2.6, 3, big ? 2.6 : 1.8, 2.4, { ry: cr }); colBox(S, cx, -2.6, 3, 2.4, cr, -1, big ? 2.66 : 1.86, true); }
        S.F.pop(); S.col.box(x, z, 9, 0.7, a, -1, 9, false); S.reserve(x, z, 10);
      }
      // horizon: foundry stacks and blocky works
      skyline(S, [M.wall, M.dark], -Math.PI, Math.PI, 200, 340, 18, [30, 60], 'slab');
      skyline(S, [M.metal], -Math.PI, Math.PI, 220, 360, 10, [40, 70], 'stack');
      // freight crates and barrier blocks along the plaza edge
      for (const [x, z, ry] of [[-30, -24, 0.1], [-32, -21.5, -0.2], [31, -26, 0.3], [-24, 30, 0], [27, 27, -0.15], [33, 8, 0.05]]) if (S.clear(x, z, 2)) {
        S.F.push(x, 0.16, z, ry); S.b.box(M.dark, 0, 0, 0, 2.6, 1.9, 1.8); S.d.box(M.orange, 0, 1.55, -0.92, 2.62, 0.18, 0.04); S.d.box(M.orange, 0, 1.55, 0.92, 2.62, 0.18, 0.04); for (const sx of [-1.25, 1.25]) S.d.box(M.trim, sx, 0, 0, 0.14, 1.95, 1.86); S.F.pop();
        colBox(S, x, z, 2.7, 1.9, ry, -0.5, 2.06, false);
      }
    },
    house(S, w, d, h) {
      const M = S.M;
      S.b.box(M.house, 0, 0, d / 2, w, h, d); S.b.gable(M.roof, 0, h, d / 2, w + 0.6, d + 0.6, 1.4);
      S.d.box(M.orange, 0, 0, -0.06, 3.6, 3.6, 0.14); S.d.box(M.dark, 0, 0, -0.1, 3.1, 3.2, 0.12);
      S.d.box(M.orange, 0, h - 0.5, -0.05, w, 0.35, 0.1);
    },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.orange, h: 9, crenels: false }),
  },
};

// Escapement Road elevated clockwork viaduct: deck, parapet rails, end rails and switchback
// access stairs, all with colliders. Chord frame: local X along the chord, local +Z radially out.
const DECK_Y = 12.7, DECK_HW = 2.8, RAIL_Z = 2.6;
function viaductDeck(S, chords) {
  const M = S.M; const n = chords.length;
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
  // runs of contiguous chords (the highway breaks where roads pass); one access stair per run,
  // on a chord whose stair footprint (inside the ring) is clear of roads and reserved areas.
  // The stair extends 16 m along the ring, toward the previous chords (sx=1) or mirrored (sx=-1).
  const access = new Map(); // chord index -> [sx, sz]  (sz=1 stair inside the ring, -1 outside)
  const foot = [[-15.8, -11.2], [2.8, -11.2], [-15.8, -4.6], [2.8, -4.6], [-6.5, -11.2], [-6.5, -8], [-15.8, -8], [2.8, -8]];
  const fits = (c, sx, sz) => foot.every(([lx, lz]) => { const [ox, oz] = rot2(lx * sx, lz * sz, c.ry); return S.clear(c.mx + ox, c.mz + oz, 1); });
  const runs = []; let cur = [];
  for (let i = 0; i < n; i++) { if (cur.length && !near(chords[cur[cur.length - 1]].q, chords[i].p)) { runs.push(cur); cur = []; } cur.push(i); }
  if (cur.length) { if (runs.length && near(chords[n - 1].q, chords[runs[0][0]].p)) runs[0] = [...cur, ...runs[0]]; else runs.push(cur); }
  for (const run of runs) {
    let best = null, bd = Infinity;
    for (const sz of [1, -1]) {
      run.forEach((ci, k) => {
        for (const sx of [1, -1]) {
          if (!fits(chords[ci], sx, sz)) continue;
          const d = Math.abs(k - (run.length - 1) / 2); if (d < bd) { bd = d; best = [ci, sx, sz]; }
        }
      });
      if (best) break;
    }
    if (best) access.set(best[0], [best[1], best[2]]);
  }
  for (let i = 0; i < n; i++) {
    const c = chords[i]; const hasPrev = near(chords[(i - 1 + n) % n].q, c.p) && n > 1, hasNext = near(c.q, chords[(i + 1) % n].p) && n > 1;
    S.F.push(c.mx, 0, c.mz, c.ry);
    S.d.box(M.trim, 0, 12, 0, c.L + 0.1, 0.7, 5.6); S.d.box(M.metal, 0, 11.4, 0, c.L + 0.12, 0.35, 5.7);
    // deck collider: overlaps its neighbours (no seam wedges at the outer edge), walk under the arches
    colBox(S, 0, 0, c.L + 0.7, DECK_HW * 2, 0, 11.3, DECK_Y, true);
    const half = c.L / 2 + 0.2;
    for (const s of [-1, 1]) {
      const z = s * RAIL_Z;
      const [sx, sz] = access.get(i) ?? [0, 0];
      const open = sx && s === -sz;
      const segs = open ? (sx > 0 ? [[-half, -1.1], [2.6, half]] : [[-half, -2.6], [1.1, half]]) : [[-half, half]];
      for (const [x0, x1] of segs) {
        S.d.box(M.metal, (x0 + x1) / 2, 13.3, z, x1 - x0, 0.12, 0.12);
        colBox(S, (x0 + x1) / 2, z, x1 - x0 + 0.1, 0.25, 0, DECK_Y - 0.3, DECK_Y + 0.85, false);
      }
      if (!open) S.d.box(M.trim, 0, DECK_Y, z, 0.25, 0.7, 0.25);
    }
    // open ends where the highway breaks for a road: guard rail across the deck
    if (!hasPrev) guardRail(S, [-c.L / 2 + 0.15, DECK_Y, -DECK_HW], [-c.L / 2 + 0.15, DECK_Y, DECK_HW], { rail: M.metal, post: M.trim });
    if (!hasNext) guardRail(S, [c.L / 2 - 0.15, DECK_Y, -DECK_HW], [c.L / 2 - 0.15, DECK_Y, DECK_HW], { rail: M.metal, post: M.trim });
    if (access.has(i)) {
      viaductStairs(S, ...access.get(i));
      const [sx, sz] = access.get(i);
      // walking route: flight 1 foot -> mid landing -> flight 2 -> top landing -> deck centre
      S.qaMark('viaductAccess', [[-0.2 * sx, 0.06, -9.4 * sz], [-13.75 * sx, 6.4, -9.4 * sz], [-13.75 * sx, 6.4, -5.9 * sz], [-0.5 * sx, DECK_Y, -5.9 * sz], [0.75 * sx, DECK_Y, -4.4 * sz], [0.75 * sx, DECK_Y, 0]]);
    }
    S.qaMark('viaductDeck', [[-c.L / 2, DECK_Y, 0], [c.L / 2, DECK_Y, 0], [0, DECK_Y, RAIL_Z], [0, DECK_Y, -RAIL_Z]]);
    S.F.pop();
    S.reserve(c.mx, c.mz, 5);
    if (access.has(i)) { const [sx, sz] = access.get(i); for (const [lx, lz, r] of [[-12, -8, 5], [-4, -8, 5], [1, -6, 4]]) { const [ox, oz] = rot2(lx * sx, lz * sz, c.ry); S.reserve(c.mx + ox, c.mz + oz, r); } }
  }
}

/**
 * Switchback stair up to the deck in the access chord's frame: inside the ring (local -Z, sz=1)
 * or outside (sz=-1); sx=-1 mirrors it along the chord. Coordinates below are for sx=sz=1.
 */
function viaductStairs(S, sx = 1, sz = 1) {
  const M = S.M; const y0 = 0.06, ym = 6.4, y1 = DECK_Y;
  const X = (x) => x * sx; const Z = (z) => z * sz; const P = (x, y, z) => [x * sx, y, z * sz];
  // flight 1 rises toward -X along z=-9.4; flight 2 back toward +X along z=-5.9
  stairs(S, M.trim, X(-6.5), Z(-9.4), -sx * Math.PI / 2, 3, 11, y0, ym);
  stairs(S, M.trim, X(-6.5), Z(-5.9), sx * Math.PI / 2, 3, 11, ym, y1);
  // solid core under flight 2 (stairs are built on top of it)
  S.b.box(M.wall, X(-6.5), -0.5, Z(-5.9), 11, ym + 0.5, 3); colBox(S, X(-6.5), Z(-5.9), 11, 3, 0, -1, ym, false);
  // mid landing (x -15.5..-12, z -10.9..-4.9) on a solid pier
  S.b.box(M.wall, X(-13.75), -0.5, Z(-7.9), 3.5, ym + 0.5, 6); colBox(S, X(-13.75), Z(-7.9), 3.5, 6, 0, -1, ym, true);
  S.d.box(M.metal, X(-13.75), ym - 0.3, Z(-7.9), 3.7, 0.3, 6.2);
  // top landing (x -1..2.5, z -7.4..-2.5) on a pillar, joining the deck through the rail opening
  S.b.box(M.trim, X(0.75), y1 - 0.7, Z(-4.95), 3.5, 0.7, 4.9); S.d.box(M.metal, X(0.75), y1 - 1.05, Z(-4.95), 3.6, 0.35, 5.0);
  colBox(S, X(0.75), Z(-4.95), 3.5, 4.9, 0, y1 - 1.4, y1, true);
  S.b.box(M.wall, X(0.75), -0.5, Z(-5.9), 1.6, y1 - 0.2, 1.6); colBox(S, X(0.75), Z(-5.9), 1.6, 1.6, 0, -1, y1 - 1.4, false);
  // guard rails on every open edge
  const o = { rail: M.metal, post: M.trim };
  guardRail(S, P(-1, y0, -10.9), P(-12, ym, -10.9), o);         // flight 1, plaza side
  guardRail(S, P(-12, ym, -7.4), P(-1, y1, -7.4), o);           // flight 2, over flight 1
  guardRail(S, P(-12, ym, -4.4), P(-1, y1, -4.4), o);           // flight 2, arcade side
  guardRail(S, P(-15.5, ym, -10.9), P(-15.5, ym, -4.9), o);     // mid landing, far end
  guardRail(S, P(-15.5, ym, -10.9), P(-12, ym, -10.9), o);      // mid landing, plaza side
  guardRail(S, P(-15.5, ym, -4.9), P(-12, ym, -4.9), o);        // mid landing, arcade side
  guardRail(S, P(-1, y1, -7.4), P(2.5, y1, -7.4), o);           // top landing, plaza side
  guardRail(S, P(2.5, y1, -7.4), P(2.5, y1, -2.9), o);          // top landing, open end
  guardRail(S, P(-1, y1, -4.4), P(-1, y1, -2.9), o);            // between flight top and deck
}

/**
 * Blood shrine tower: stepped plinth, four sandstone corner piers banded in iron and gold, an open
 * cage showing a tall faceted red crystal column, ring medallions and banner strips on each face,
 * stepped cornice crown with a gilded finial.
 */
function ritualPillar(S, x, z, h, y = 0) {
  const M = S.M; S.F.push(x, y, z, 0);
  S.b.box(M.trim, 0, -0.6, 0, 6.6, 1.0, 6.6); S.b.box(M.red, 0, 0.4, 0, 5.8, 0.9, 5.8); S.d.box(M.gold, 0, 1.3, 0, 5.9, 0.12, 5.9);
  const p = 2.15; // pier centre offset
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.b.box(M.wall, sx * p, 1.3, sz * p, 1.25, h - 1.3, 1.25);
    for (const yy of [h * 0.28, h * 0.62]) S.d.box(M.metal, sx * p, yy, sz * p, 1.4, 0.35, 1.4);
    S.d.box(M.gold, sx * p, h - 1.0, sz * p, 1.4, 0.2, 1.4);
  }
  // lower walls (solid podium) and upper open cage
  S.b.box(M.red, 0, 1.3, 0, 4.3, h * 0.22, 4.3);
  for (const yy of [h * 0.22 + 1.3, h * 0.6, h - 1.2]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const [ox, oz] = [Math.sin(a) * p, Math.cos(a) * p]; S.d.box(M.trim, ox, yy, oz, 3.2, 0.55, 0.5, { ry: a }); }
  // crystal column with gold collars
  S.d.cyl(M.rglass, 0, h * 0.22 + 1.3, 0, 0.85, 0.75, h * 0.78 - 2.4, 6);
  S.d.cyl(M.rglass, 0, h - 1.1, 0, 0.75, 0.05, 1.2, 6);
  for (const t of [0.32, 0.5, 0.68]) S.d.cyl(M.gold, 0, h * t, 0, 1.0, 1.0, 0.28, 12);
  // ring medallions + banner strips on each face
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2; const c = Math.sin(a), s = Math.cos(a); const r = p + 0.68;
    S.d.torus(M.gold, c * r, h * 0.47, s * r, 0.75, 0.09, 24, 5, { rx: Math.PI / 2, ry: a });
    S.d.torus(M.gold, c * r, h * 0.47, s * r, 0.42, 0.05, 20, 4, { rx: Math.PI / 2, ry: a });
    S.d.cloth(M.drape ?? M.red, c * (p + 0.66), h * 0.22 + 0.9, s * (p + 0.66), 1.1, h * 0.18, a + Math.PI, 2, 5, { vcut: 0.3 });
  }
  // stepped crown and finial
  S.b.box(M.trim, 0, h - 0.4, 0, 6.0, 0.7, 6.0); S.d.box(M.gold, 0, h + 0.3, 0, 6.1, 0.14, 6.1);
  S.b.box(M.red, 0, h + 0.44, 0, 5.0, 1.0, 5.0); S.b.box(M.trim, 0, h + 1.44, 0, 3.8, 0.8, 3.8);
  S.d.box(M.gold, 0, h + 2.24, 0, 3.9, 0.12, 3.9); S.b.box(M.red, 0, h + 2.36, 0, 2.4, 0.9, 2.4);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { S.d.box(M.trim, sx * 2.5, h + 1.44, sz * 2.5, 0.7, 1.3, 0.7); S.d.cyl(M.gold, sx * 2.5, h + 2.74, sz * 2.5, 0.22, 0.02, 0.8, 4, { ry: Math.PI / 4 }); }
  S.d.cyl(M.rglass, 0, h + 3.26, 0, 0.5, 0.4, 0.9, 6); S.d.cyl(M.rglass, 0, h + 4.16, 0, 0.4, 0.02, 0.9, 6);
  S.F.pop(); S.col.box(x, z, 3.3, 3.3, 0, y - 1, y + h + 2, false);
}

/** Stone planter box overflowing with blooms (blood court roses). */
function planter(S, x, z, w, d) {
  const M = S.M; const rand = S.rand;
  S.b.box(M.trim, x, -0.2, z, w, 1.1, d); S.d.box(M.red, x, 0.9, z, w + 0.2, 0.18, d + 0.2);
  const n = Math.max(2, Math.round(w / 0.8));
  for (let i = 0; i < n; i++) { const px = x - w / 2 + (i + 0.5) * w / n + (rand() - 0.5) * 0.3; S.d.sphere(i % 3 === 1 ? (M.leaves ?? M.bloom) : M.bloom, px, 0.95, z + (rand() - 0.5) * d * 0.4, 0.42 + rand() * 0.2, 7, { sy: 0.75 }); }
  S.col.box(x, z, w / 2, d / 2, 0, -1, 1.1, false);
}

function foldedScreen(S, x0, z, ry, n, h, y = 0.06, mirror = false) {
  const M = S.M; const w = 2.6; const fold = 0.38;
  S.F.push(x0, y, z, ry);
  for (let i = 0; i < n; i++) {
    const a = (i % 2 ? fold : -fold); const cx = (i + 0.5) * w * Math.cos(fold);
    const mat = mirror && i % 4 === 1 ? M.mirror : (i % 2 ? M.navy : M.wall);
    S.b.box(mat, cx, 0, 0, w, h, 0.25, { ry: a });
    S.d.box(M.metal, cx, h, 0, w + 0.08, 0.16, 0.32, { ry: a }); S.d.box(M.metal, cx, 0, 0, w + 0.08, 0.2, 0.32, { ry: a });
    if (i % 3 === 0) S.d.box(M.metal, cx, h * 0.25, -0.15, 0.08, h * 0.5, 0.05, { ry: a });
  }
  const L = n * w * Math.cos(fold);
  S.F.pop();
  const [cx, cz] = S.F.xz ? [0, 0] : [0, 0];
  const c = Math.cos(ry), s = Math.sin(ry); S.col.box(x0 + (L / 2) * c, z - (L / 2) * s, L / 2, 0.8, ry + Math.PI / 2 - Math.PI / 2, y - 1, y + h, false);
}

function opticalGate(S, x, z, a) {
  const M = S.M; S.F.push(x, 0.06, z, a);
  for (const s of [-1, 1]) { S.b.box(M.navy, s * 4.6, 0, 0, 0.9, 10, 0.9); S.d.box(M.metal, s * 4.6, 10, 0, 1.1, 0.3, 1.1); S.col.box(s * 4.6, 0, 0.45, 0.45, 0, -1, 10, false); }
  S.b.box(M.navy, 0, 9.2, 0, 10.2, 0.9, 0.9);
  S.d.torus(M.metal, 0, 5.2, 0, 3.4, 0.22, 48, 6, { rx: Math.PI / 2 });
  for (const s of [-1, 1]) S.d.beam(M.metal, [s * 3.4, 5.2, 0], [s * 4.15, 5.2, 0], 0.18);
  S.d.beam(M.metal, [0, 8.6, 0], [0, 9.2, 0], 0.18);
  S.F.pop();
}

function gantry(S, x0, z0, x1, z1, h, y) {
  const M = S.M; const L = Math.hypot(x1 - x0, z1 - z0); const ry = Math.atan2(x1 - x0, z1 - z0);
  S.F.push(x0, y, z0, ry);
  for (const zz of [0, L]) for (const s of [-1, 1]) {
    S.b.box(M.dark, s * 3, -0.5, zz, 1.3, h + 0.5, 1.3);
    for (let k = 0; k < 3; k++) S.d.box(M.orange, s * 3, 1 + k * 2.2, zz, 1.36, 0.9, 1.36);
    S.col.box(s * 3, zz, 0.65, 0.65, 0, -1, h, false);
  }
  for (const s of [-1, 1]) { S.b.box(M.metal, s * 3, h, L / 2, 1.0, 1.6, L + 2); S.b.box(M.metal, s * 3, h + 3.2, L / 2, 0.8, 0.8, L + 2); }
  for (let k = 0; k <= Math.floor(L / 4); k++) { const zz = k * 4; for (const s of [-1, 1]) S.d.beam(M.trim, [s * 3, h + 1.6, zz], [s * 3, h + 3.2, zz + 2], 0.2); S.d.beam(M.trim, [-3, h + 3.4, zz], [3, h + 3.4, zz], 0.25); }
  for (const zz of [0, L]) S.b.box(M.dark, 0, h - 0.6, zz, 7.3, 1.2, 1.4);
  S.d.box(M.dark, 0, h - 0.8, L * 0.45, 4.5, 1.2, 3);
  S.d.beam(M.trim, [-0.6, h - 0.8, L * 0.45], [-0.6, h - 6.5, L * 0.45], 0.08); S.d.beam(M.trim, [0.6, h - 0.8, L * 0.45], [0.6, h - 6.5, L * 0.45], 0.08);
  const [wx, wz] = rot2(0, L * 0.45, ry);
  S.F.pop();
  S.animMesh(`piston${x0.toFixed(0)}${z0.toFixed(0)}`, x0 + wx, y + h - 9, z0 + wz, ry, (b) => {
    b.cyl(M.metal, 0, -1.8, 0, 2.4, 2.4, 3.6, 24); b.cyl(M.orange, 0, -0.5, 0, 2.46, 2.46, 0.8, 24, { caps: false }); b.cyl(M.dark, 0, 1.8, 0, 1.2, 0.8, 0.8, 16); b.cyl(M.dark, 0, -2.4, 0, 1.6, 2.2, 0.6, 16);
  }, (n, t) => { n.position.y = Math.sin(t * 0.6) * 1.6; });
}
