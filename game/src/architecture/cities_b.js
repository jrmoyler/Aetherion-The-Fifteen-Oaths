// City styles oath-08 .. oath-15.
import { TAU, polar, rot2, colBox, stairs, terrace, banner, balustrade, genericHouse, brazier, lanternPost, emblemStanding, emblemFlat, treeProto, pool, roundPool, squareTower, roundTower, swag, crateProto, boxProto, arcPts, segPts, crenelProto } from './kit.js';

const D = Math.PI / 180;
import { terraceStairs, arcade, arcArcade, blockWall, gear, cable, ringBanners, rockMass, freeSpots, outerRocks, channelRing } from './motifs.js';

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
    plaza: 'square', glow: '#c4ff3a', flame: '#d8ff70', lamp: 'lantern',
    banner: { color: '#4a2a46', trim: '#b89a50', emblem: '#d8b860' },
    mats: {
      pave: ['paving.slab', { tint: '#8c867b' }], border: ['stone.darkgranite', { tint: '#4a4a40' }], ground: ['paving.flagstone', { tint: '#7a766c' }],
      wall: ['stone.limestone', { tint: '#8a867c' }], trim: ['stone.darkgranite', { tint: '#555048' }], metal: ['metal.brass', { tint: '#9a8048' }], inlay: ['metal.brass'],
      roof: ['tile.roof', { tint: '#5e3c56' }], glass: ['glass.tinted', { tint: '#9ab890' }], reagent: ['liquid.reagent'], house: ['stone.limestone', { tint: '#7e7a70' }],
      found: ['stone.darkgranite', { tint: '#4a4a42' }], wood: ['wood.weathered', { tint: '#4a3a2a' }], leaves: ['foliage.leaves', { tint: '#5a7a30' }],
    },
    inlayExtra(S, mat, y) {
      S.d.box(mat, 0, y, 0, 0.3, 0.025, 72); S.d.box(mat, 0, y, 0, 72, 0.025, 0.3);
      for (const z of [-27, 27]) { S.d.ring(mat, 0, y, z, 5.2, 5.6, 0.025, 48); S.d.ring(mat, 0, y, z, 3.6, 3.75, 0.025, 40); }
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) S.d.box(mat, sx * 11, y, sz * 11, 0.22, 0.025, 31, { ry: Math.atan2(sx, -sz) });
    },
    rim: (S) => ({ type: 'iron', rail: S.M.metal, post: S.M.trim, balMat: S.M.metal }),
    hall(S) {
      const M = S.M; const h = 2.4;
      terraceStairs(S, { x0: -42, x1: 42, z0: 50, z1: 92, h, mat: M.trim, coping: M.wall, stairW: 14, run: 4.2 });
      S.reserve(0, 72, 44);
      S.b.box(M.wall, 0, h, 77, 40, 13, 18); S.b.hip(M.roof, 0, h + 13, 77, 42.5, 20.5, 7);
      S.d.box(M.trim, 0, h + 12.4, 77, 40.6, 0.6, 18.6);
      S.b.archWall(M.wall, 0, h, 67.3, 12, 13.6, 1.4, 5.2, 9);
      S.d.box(M.dark, 0, h, 67.9, 5.2, 9, 0.2);
      emblemStanding(S, S.d, M.metal, 0, h + 11, 66.5, 1.5, 0, 0.12);
      for (const x of [-15, -9, 9, 15]) { S.b.archWall(M.trim, x, h + 3, 67.95, 3, 6, 0.3, 1.8, 5); S.d.box(M.glass, x, h + 3, 68.05, 1.8, 5, 0.1); }
      for (const x of [-19.6, 19.6]) S.d.tube(M.metal, [[x, h, 67.5], [x, h + 12, 67.5], [x, h + 12.6, 69]], 0.35, 8);
      for (const s of [-1, 1]) roundTower(S, s * 24, 72, 3.4, 18, { y: h, mat: M.wall, trim: M.metal, roof: 'cone', roofMat: M.roof });
      colBox(S, 0, 77, 40, 18, 0, h - 1, h + 13, false);
      S.d.tube(M.metal, [[-40, 1.2, 49.6], [40, 1.2, 49.6]], 0.3, 8); S.d.tube(M.metal, [[-40, 1.9, 49.6], [40, 1.9, 49.6]], 0.2, 8);
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
        for (const ex of [-14.3, 14.3]) { S.b.box(M.wall, ex, 0, 0, 0.8, 5.5, 11); S.d.prism(M.glass, arcPts(5.4, -Math.PI / 2, Math.PI / 2, 1.2).map(([px, pz]) => [px, pz]), ex, 5.5, 0, 0.12, { vertical: true, ry: Math.PI / 2 }); }
        for (let k = 0; k < 5; k++) S.d.sphere(M.leaves, -11 + k * 5.5, 1.5, (k % 2 ? 1.5 : -1.5), 1.6, 8);
        S.F.pop(); S.reserve(x, z, 16);
      }
      for (const a of freeSpots(S, 82, [100 * D, -100 * D, 155 * D, -155 * D, 75 * D, -75 * D, 45 * D, -45 * D], 5).slice(0, 4)) {
        const [x, z] = polar(76, a);
        roundTower(S, x, z, 3, 17, { mat: M.wall, trim: M.metal, roof: 'cone', roofMat: M.roof });
        for (let k = 0; k < 3; k++) S.d.torus(M.metal, x, 4 + k * 4.5, z, 3.05, 0.14, 20, 4);
        const [cx, cz] = polar(80.5, a); S.d.cyl(M.metal, cx, 0, cz, 0.7, 0.6, 22, 10); S.d.disc(M.glow, cx, 22.02, cz, 0.55, 10); S.col.circle(cx, cz, 0.8, -1, 22, false);
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
    house(S, w, d, h, rand) { genericHouse(S, w, d, h, { roofType: rand() < 0.3 ? 'dome' : 'flat', roof: S.M.metal, trim: S.M.trim }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.metal, h: 7.5 }),
    gateRoof: 'pyramid',
  },

  // ================================================================ 10 Tidal Observatory
  'oath-10': {
    glow: '#9a7aff', flame: '#b49aff', lamp: 'lantern', shrineZ: 33,
    banner: { color: '#1c1f3a', trim: '#a8acb8', emblem: '#c8ccd8' },
    mats: {
      pave: ['stone.slate', { tint: '#3d3f4b', roughness: 0.7 }], border: ['stone.darkgranite', { tint: '#2c2d36' }], ground: ['stone.slate', { tint: '#35373f' }],
      wall: ['stone.darkgranite', { tint: '#34353d' }], trim: ['stone.darkgranite', { tint: '#44464f' }], metal: ['metal.steel', { tint: '#a8acb8' }],
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
    },
    house(S, w, d, h) { genericHouse(S, w, d, h, { roofType: 'dome', roof: S.M.roof }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.metal, h: 8 }),
  },

  // ================================================================ 11 The Missing Court
  'oath-11': {
    plaza: 'square', glow: '#a070ff', flame: '#a070ff', lamp: 'brazier',
    banner: { color: '#8a2a30', trim: '#a8a8b0', emblem: '#d6d6dc' },
    mats: {
      pave: ['paving.slab', { tint: '#cac6be' }], border: ['stone.limestone', { tint: '#a19d96' }], ground: ['paving.flagstone', { tint: '#aaa69f' }],
      wall: ['stone.limestone', { tint: '#b9b5ad' }], trim: ['stone.limestone', { tint: '#8f8b85' }], metal: ['metal.iron', { tint: '#2a2a2c' }],
      inlay: ['metal.iron', { tint: '#1c1c1e' }], roof: ['stone.limestone', { tint: '#9a968e' }], void: ['stone.basalt', { tint: '#060607', roughness: 0.3 }],
      house: ['stone.limestone', { tint: '#b0aca4' }], found: ['stone.limestone', { tint: '#8f8b85' }],
    },
    rim: (S) => ({ type: 'solid', rail: S.M.wall, post: S.M.trim, h: 1.1 }),
    hall(S) {
      const M = S.M; const h = 5;
      terraceStairs(S, { x0: -42, x1: 42, z0: 50, z1: 94, h, mat: M.wall, coping: M.trim, stairW: 14, run: 8 });
      S.reserve(0, 74, 46);
      for (const [r, hh] of [[7, 0.6], [5.6, 1.2], [4.2, 1.8]]) S.b.box(M.trim, 0, h, 76, r * 2, hh, r * 2);
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
          const ok = S.clear(s * 64, z, 3) && z < 48;
          if (ok && start === null) start = z;
          if (!ok && start !== null) { if (z - start >= 12) { blockWall(S, M.wall, s * 64, start, s * 64, z - 3, 16, { hole, th: 2.6 }); S.reserve(s * 64, (start + z) / 2, (z - start) / 2 + 2); } start = null; }
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
    },
    house(S, w, d, h, rand) { genericHouse(S, w, d, h, { roofType: 'flat' }); if (rand() < 0.4) S.d.box(S.M.wall, w * 0.25, h + 0.35, d * 0.3, w * 0.4, 1.8 + rand() * 2, d * 0.4); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 9, crenels: false }),
  },

  // ================================================================ 12 Sanguine Covenant
  'oath-12': {
    plaza: 'square', glow: '#ff2a3a', flame: '#ff6a3a', lamp: 'brazier',
    banner: { color: '#4a1418', trim: '#c8a060', emblem: '#d8b070' },
    mats: {
      pave: ['paving.slab', { tint: '#503f3c' }], border: ['stone.sandstone', { tint: '#7a4840' }], ground: ['paving.flagstone', { tint: '#5e4640' }],
      wall: ['stone.sandstone', { tint: '#8a4e44' }], red: ['stone.sandstone', { tint: '#6e3430' }], trim: ['stone.sandstone', { tint: '#9a6a58' }],
      metal: ['metal.iron', { tint: '#4a3e38' }], gold: ['metal.gold', { tint: '#c8a060' }], inlay: ['metal.gold', { tint: '#c8a060' }], roof: ['tile.roof', { tint: '#3e2a28' }],
      rglass: ['emissive.glow', { emissive: '#d81828', emissiveIntensity: 1.8 }], drape: ['cloth.banner', { tint: '#7a1418', backFaceCulling: false }],
      house: ['stone.sandstone', { tint: '#8e5a4c' }], found: ['stone.sandstone', { tint: '#5e3a34' }],
    },
    inlayExtra(S, mat, y) {
      S.d.box(mat, 0, y, 0, 0.25, 0.025, 72); S.d.box(mat, 0, y, 0, 72, 0.025, 0.25);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { S.d.ring(mat, sx * 26, y, sz * 26, 3.2, 3.45, 0.025, 36); S.d.box(mat, sx * 26, y, sz * 26, 9, 0.025, 0.18); S.d.box(mat, sx * 26, y, sz * 26, 0.18, 0.025, 9); }
    },
    rim: (S) => ({ type: 'stone', rail: S.M.wall, post: S.M.red }),
    hall(S) {
      const M = S.M; const h = 3;
      terraceStairs(S, { x0: -42, x1: 42, z0: 50, z1: 94, h, mat: M.red, coping: M.trim, stairW: 14, run: 5 });
      S.reserve(0, 74, 46);
      S.b.box(M.wall, 0, h, 80, 34, 17, 20); S.d.box(M.trim, 0, h + 17, 80, 35, 0.7, 21);
      S.F.push(0, h + 17.7, 80, 0); for (let i = 0; i < 13; i++) { const x = -16 + i * 2.66; S.inst.add(crenelProto(M.trim, 1.2, 1.2, 0.7), x, 0, -10.2); } S.F.pop();
      S.b.archWall(M.red, 0, h, 69.6, 12, 15, 1.6, 5.4, 11);
      S.d.box(M.dark, 0, h, 70.3, 5.4, 11, 0.2); S.d.box(M.gold, 0, h + 15, 69.6, 12.4, 0.4, 1.9);
      emblemStanding(S, S.d, M.gold, 0, h + 13, 68.7, 1.2, 0, 0.1);
      for (const s of [-1, 1]) {
        squareTower(S, s * 20, 76, 7.5, 25, { y: h, mat: M.red, trim: M.trim, roof: 'pyramid', roofMat: M.roof, windows: false });
        for (const k of [0, 1]) S.d.box(M.rglass, s * 20, h + 8 + k * 8, 72.2, 1.0, 4.5, 0.1);
        ritualPillar(S, s * 12, 53.5, 14, h);
      }
      for (const s of [-1, 1]) swag(S, M.drape, [s * 12, h + 14.6, 53.5], [s * 17, h + 16, 69.4], 2.5, 1.4);
      colBox(S, 0, 80, 34, 20, 0, h - 1, h + 17, false);
      S.light(0, h + 5, 67, '#ff3030', 16, 1.6);
      S.hallDoor = { x: 0, y: h, z: 67 };
    },
    signature(S) {
      const M = S.M; const P = [];
      for (const [x, z] of [[-46, -46], [46, -46], [-46, 46], [46, 46], [-58, 0], [58, 0]]) if (S.clear(x, z, 3)) { ritualPillar(S, x, z, 18, 0); P.push([x, z, Math.atan2(x, z)]); S.reserve(x, z, 4); }
      P.sort((p, q) => p[2] - q[2]);
      for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < 70 && P.length > 1) swag(S, M.drape, [p[0], 18.4, p[1]], [q[0], 18.4, q[1]], 4 + d * 0.05, 1.6); }
      outerRocks(S, M.red, 12, 160, 240, [14, 28], [14, 34]);
    },
    house(S, w, d, h) { genericHouse(S, w, d, h, { roof: S.M.roof, trim: S.M.trim }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.red, h: 9 }),
    gateRoof: 'pyramid',
  },

  // ================================================================ 13 Folded Theatre
  'oath-13': {
    plaza: 'square', glow: '#e070ff', flame: '#ffd8a0', lamp: 'lantern',
    banner: { color: '#b84a5a', trim: '#c8a050', emblem: '#f2e8d8' },
    mats: {
      pave: ['stone.marble', { tint: '#e6dccb' }], border: ['wood.lacquer', { tint: '#2a3450' }], ground: ['stone.marble', { tint: '#d6cdbd' }],
      wall: ['stone.marble', { tint: '#e3d9c9' }], navy: ['wood.lacquer', { tint: '#26304a' }], trim: ['wood.lacquer', { tint: '#2a3450' }], metal: ['metal.gold', { tint: '#c8a050' }],
      inlay: ['wood.lacquer', { tint: '#28324c' }], roof: ['wood.lacquer', { tint: '#2a3450' }], mirror: ['metal.steel', { tint: '#d0d4dc', roughness: 0.1 }],
      red: ['cloth.banner', { tint: '#b84a5a', backFaceCulling: false }], house: ['plaster.lime', { tint: '#e6dccb' }], found: ['stone.marble', { tint: '#bdb4a4' }],
    },
    inlayExtra(S, mat, y) {
      for (let k = -3; k <= 3; k++) { if (k === 0) continue; S.d.box(mat, k * 10.4, y, 0, 0.24, 0.025, 72); S.d.box(mat, 0, y, k * 10.4, 72, 0.025, 0.24); }
      const g = S.M.metal; const r = 23; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const [x, z] = polar(r * Math.SQRT1_2, a); S.d.box(g, x, y, z, 0.35, 0.03, r, { ry: a + Math.PI / 2 }); }
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
        for (let z = -24; z <= 24; z += 8) S.d.cloth(M.red, x - s * 3.1, 5.4, z, 1.2, 3.6, s > 0 ? -Math.PI / 2 : Math.PI / 2, 2, 6);
        S.reserve(x, 0, 30);
      }
    },
    house(S, w, d, h) {
      const M = S.M; genericHouse(S, w, d, h, { roof: M.roof, trim: M.trim, roofType: 'flat' });
      S.b.gable(M.roof, -w * 0.15, h + 0.35, d / 2, w * 0.8, d + 0.8, Math.min(w, d) * 0.55, { gableMat: M.wall });
    },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 7 }),
  },

  // ================================================================ 14 Escapement Road
  'oath-14': {
    glow: '#ffd88a', flame: '#ffd88a', lamp: 'lantern',
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
      S.b.box(M.wall, 0, h, 79, 64, 14, 22); S.b.hip(M.roof, 0, h + 14, 79, 65, 23, 6);
      S.d.box(M.metal, 0, h + 14, 66, 61, 0.5, 3.4);
      gear(S, 0, h + 21, 66.5, 0, 6, M.metal, 0.15);
      gear(S, 8.6, h + 18.5, 66.6, 0, 3.2, M.metal, -0.28);
      S.hallDoor = { x: 0, y: h, z: 63 };
    },
    signature(S) {
      const M = S.M;
      const chords = arcArcade(S, M.wall, 60, 0, TAU, 12, 7.5, 5, 8.6, { skip: (x, z) => !S.clear(x, z, 4) });
      for (const c of chords) {
        S.d.box(M.trim, c.mx, 12, c.mz, c.L + 0.1, 0.7, 5.6, { ry: c.ry }); S.d.box(M.metal, c.mx, 11.4, c.mz, c.L + 0.12, 0.35, 5.7, { ry: c.ry });
        for (const s of [-1, 1]) { const [ox, oz] = rot2(0, s * 2.6, c.ry); S.d.box(M.metal, c.mx + ox, 13.3, c.mz + oz, c.L, 0.12, 0.12, { ry: c.ry }); S.d.box(M.trim, c.mx + ox, 12.7, c.mz + oz, 0.25, 0.7, 0.25, { ry: c.ry }); }
        S.reserve(c.mx, c.mz, 5);
      }
      chords.forEach((c, i) => { if (i % 4 === 2) { const [bx, bz] = rot2(0, -2.9, c.ry); banner(S, c.mx + bx, 11.3, c.mz + bz, c.ry, 1.7, 5.5, { bar: M.metal }); } });
      // gears where the highway breaks for roads
      for (const a of S.roads) for (const s of [-1, 1]) { const b = a + s * 16 / 60; const [x, z] = polar(60, b); gear(S, x, 16.8, z, b, 3.2, M.metal, 0.22 * s); }
      // hourglass cages with floating cubes
      for (const a of [45 * D, -45 * D, 135 * D, -135 * D]) {
        const [x, z] = polar(35, a); if (!S.clear(x, z, 3)) continue;
        S.d.cyl(M.metal, x, 0.16, z, 2.3, 2.3, 0.6, 20); S.d.cyl(M.wall, x, 0.16, z, 2.0, 2.0, 0.45, 20);
        S.d.cyl(M.metal, x, 6.2, z, 2.3, 2.3, 0.5, 20); S.d.sphere(M.metal, x, 6.7, z, 1.6, 14, { hemi: true, sy: 0.6 });
        for (let k = 0; k < 14; k++) { const b = (k / 14) * TAU; S.d.cyl(M.metal, x + Math.sin(b) * 2.15, 0.7, z + Math.cos(b) * 2.15, 0.06, 0.06, 5.5, 5); }
        for (const ry of [2.6, 4.4]) S.d.torus(M.metal, x, ry, z, 2.18, 0.05, 24, 4);
        S.animMesh(`cubes${a.toFixed(2)}`, x, 3.4, z, 0, (b) => { for (let k = 0; k < 4; k++) { const c = (k / 4) * TAU; b.box(M.cube, Math.sin(c) * 0.9, -0.4 + (k % 2) * 1.2, Math.cos(c) * 0.9, 0.7, 0.7, 0.7, { rx: 0.6, rz: 0.6 + k }); } }, (n, t) => { n.rotation.y = t * 0.4; n.position.y = Math.sin(t * 0.9) * 0.25; });
        S.col.circle(x, z, 2.35, -1, 7, false); S.light(x, 3.4, z, '#ffd88a', 8, 0.6);
      }
      for (const a of freeSpots(S, 78, [40 * D, -40 * D, 140 * D, -140 * D, 180 * D], 6)) {
        const [x, z] = polar(78, a); squareTower(S, x, z, 6.5, 26, { mat: M.wall, trim: M.metal, roof: 'pyramid', roofMat: M.roof, windows: false, ry: a });
        const [fx, fz] = polar(74.7, a);
        S.F.push(fx, 18.5, fz, a); S.d.cyl(M.face, 0, 0, 0, 2.4, 2.4, 0.12, 32, { rx: Math.PI / 2 }); S.d.torus(M.metal, 0, 0, -0.06, 2.45, 0.14, 32, 5, { rx: Math.PI / 2 });
        S.d.beam(M.metal, [0, 0, -0.12], [0.9, 1.4, -0.12], 0.12); S.d.beam(M.metal, [0, 0, -0.14], [-1.8, -0.4, -0.14], 0.09); S.F.pop();
        S.reserve(x, z, 6);
      }
      outerRocks(S, M.wall, 8, 170, 240, [14, 26], [12, 26]);
    },
    house(S, w, d, h) { genericHouse(S, w, d, h, { roofType: 'hip', roof: S.M.roof }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.metal, h: 8 }),
  },

  // ================================================================ 15 Impulse Foundry
  'oath-15': {
    plaza: 'square', glow: '#ffa040', flame: '#ffb060', lamp: 'lantern',
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
      S.d.ring(mat, 0, y, 0, 26, 26.5, 0.025, 96);
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
      S.b.box(M.wall, 0, h, 86, 92, 16, 10); S.d.box(M.orange, 0, h + 12, 80.95, 92, 1.2, 0.1); S.b.box(M.roof, 0, h + 16, 86, 93, 0.6, 11);
      gantry(S, -46, 58, 46, 58, 22, h);
      S.hallDoor = { x: 0, y: h, z: 60 };
    },
    signature(S) {
      const M = S.M;
      for (const s of [-1, 1]) { const x = s * 56; if (S.clear(x, -38, 3) && S.clear(x, 38, 3)) { gantry(S, x, -38, x, 38, 20, 0.06); S.reserve(x, -38, 4); S.reserve(x, 38, 4); } }
      for (const a of freeSpots(S, 64, [55 * D, -55 * D, 125 * D, -125 * D, 180 * D, 90 * D, -90 * D], 10)) {
        const [x, z] = polar(64, a); S.F.push(x, 0, z, a);
        S.b.box(M.wall, 0, -1, 0, 18, 10, 1.4); S.d.box(M.orange, 0, 3.4, -0.72, 18, 1.0, 0.06); S.d.box(M.trim, 0, 9, 0, 18.4, 0.4, 1.8);
        for (let k = 0; k < 5; k++) { const cx = -7 + k * 3.4; const big = (k % 2) === 0; S.b.box(big ? M.dark : M.orange, cx, 0.06, -2.6, 3, big ? 2.6 : 1.8, 2.4, { ry: (S.rand() - 0.5) * 0.2 }); }
        S.F.pop(); S.col.box(x, z, 9, 0.7, a, -1, 9, false); S.reserve(x, z, 10);
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

function ritualPillar(S, x, z, h, y = 0) {
  const M = S.M; S.F.push(x, y, z, 0);
  S.b.box(M.trim, 0, -0.5, 0, 5.4, 1.6, 5.4); S.b.box(M.red, 0, 1.1, 0, 4.4, h - 1.1, 4.4);
  for (const yy of [h * 0.3, h * 0.62, h - 1]) S.d.box(M.metal, 0, yy, 0, 4.7, 0.5, 4.7);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const [ox, oz] = [Math.sin(a) * 2.22, Math.cos(a) * 2.22]; S.d.box(M.rglass, ox, h * 0.36, oz, 1.0, h * 0.24, 0.08, { ry: a }); S.d.box(M.rglass, ox, h * 0.68, oz, 0.7, h * 0.18, 0.08, { ry: a }); S.d.torus(M.metal, Math.sin(a) * 2.4, h * 0.56, Math.cos(a) * 2.4, 0.55, 0.07, 16, 4, { rx: Math.PI / 2, ry: a }); }
  S.b.cyl(M.gold, 0, h + 0.5, 0, 3.2, 0.1, 2.4, 4, { ry: Math.PI / 4 }); S.d.box(M.trim, 0, h, 0, 5, 0.5, 5);
  S.F.pop(); S.col.box(x, z, 2.7, 2.7, 0, y - 1, y + h + 2, false);
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
