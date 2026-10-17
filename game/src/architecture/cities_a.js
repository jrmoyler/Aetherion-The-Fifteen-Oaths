// City styles oath-01 .. oath-07.
import { TAU, polar, rot2, colBox, stairs, terrace, banner, bannerPole, balustrade, genericHouse, brazier, lanternPost, emblemStanding, treeProto, pool, roundPool, squareTower, roundTower, crenelProto, arcPts, waterfall, hangingLanternProto, boxProto, proto } from './kit.js';
import { terraceStairs, arcade, arcArcade, blockWall, relayPylon, cable, giantTree, sail, hangLanterns, crystalCluster, rockMass, ringBanners, channelRing, freeSpots, outerRocks } from './motifs.js';

const D = Math.PI / 180;

export default {
  // ================================================================ 01 Kiln Oath
  'oath-01': {
    plaza: 'square', glow: '#ff6a1a', flame: '#ff8a3a', lamp: 'brazier',
    banner: { color: '#7a1c14', trim: '#c8783a', emblem: '#e8a050' },
    mats: {
      pave: ['paving.slab', { tint: '#34302d' }], border: ['stone.terracotta', { tint: '#7a3a24' }], ground: ['paving.flagstone', { tint: '#3b3633' }],
      wall: ['stone.basalt'], terra: ['stone.terracotta'], trim: ['stone.terracotta', { tint: '#8a4428' }], metal: ['metal.iron'],
      inlay: ['stone.terracotta', { tint: '#a85430' }], roof: ['stone.basalt'], lava: ['emissive.lava', { emissiveIntensity: 2.4 }],
      house: ['stone.basalt', { tint: '#302c2a' }], found: ['stone.basalt'], wood: ['wood.weathered', { tint: '#3a2a20' }], dark: ['stone.basalt', { tint: '#0f0d0c' }],
    },
    rim: (S) => ({ type: 'solid', rail: S.M.wall, post: S.M.trim, h: 1.1, postEvery: 4.2 }),
    hall(S) {
      const M = S.M;
      terraceStairs(S, { x0: -44, x1: 44, z0: 50, z1: 98, h: 3.2, mat: M.wall, coping: M.trim, stairW: 16, run: 5.6 });
      S.reserve(0, 74, 46);
      terrace(S, M.wall, 0, 82, 58, 32, 7.6, { coping: M.trim, y0: 3 });
      stairs(S, M.trim, 0, 62.4, 0, 11, 7.2, 3.4, 7.6, { cheek: M.wall });
      const y = 7.8;
      // gate hall: arched terracotta facade, glowing arches
      for (const x of [-10, 0, 10]) {
        S.b.archWall(M.terra, x, y, 72.5, 8, 13, 2.2, 4.6, 8.4);
        S.d.box(M.glow, x, y, 73.7, 4.4, 8.2, 0.12);
        S.d.box(M.metal, x, y + 8.6, 71.3, 5.4, 0.5, 0.3);
      }
      for (const s of [-1, 1]) S.b.box(M.terra, s * 15.5, y, 72.5, 3, 13, 2.2);
      S.b.box(M.terra, 0, y, 82, 34, 13, 17);
      S.d.box(M.trim, 0, y + 13, 81.5, 35, 0.6, 18.4);
      S.F.push(0, y + 13.6, 81.5, 0);
      for (let i = 0; i < 14; i++) { const x = -16.5 + i * 2.54; S.inst.add(crenelProto(M.trim, 1.1, 1.1, 0.6), x, 0, -8.9); S.inst.add(crenelProto(M.trim, 1.1, 1.1, 0.6), x, 0, 8.9); }
      S.F.pop();
      // central keep with glowing slits
      S.b.box(M.wall, 0, y + 13, 80, 13, 8, 10);
      for (const x of [-3.4, 0, 3.4]) S.d.box(M.glow, x, y + 15, 74.95, 0.9, 4.2, 0.1);
      S.d.box(M.trim, 0, y + 21, 80, 14, 0.6, 11);
      S.col.box(0, 80, 17, 9.5, 0, y - 1, y + 21, false);
      S.light(0, y + 4, 70, '#ff6a20', 22, 2.2);
      // flanking vented towers
      for (const s of [-1, 1]) {
        squareTower(S, s * 22, 79, 8, 22, { y, mat: M.wall, trim: M.trim, windows: false });
        for (let k = 0; k < 3; k++) S.d.box(M.glow, s * 22 + (k - 1) * 1.8, y + 15, 74.95, 0.45, 3.4, 0.1);
        S.d.box(M.trim, s * 22, y + 6, 79, 8.4, 1.2, 8.4);
      }
      for (const s of [-1, 1]) bannerPole(S, s * 12.5, 57, 12, { y: 3.4, pole: M.metal, base: M.wall, w: 1.8, bh: 7 });
      for (const s of [-1, 1]) brazier(S, s * 7.5, 55, 3.4, 1.2, s > 0);
      S.hallDoor = { x: 0, y: 7.6, z: 70 };
    },
    signature(S) {
      const M = S.M;
      // lava moat around three sides of the plaza
      const lavaChunk = (x, z, ry, L) => {
        S.F.push(x, 0, z, ry);
        S.b.box(M.wall, 0, -0.9, 0, 5.6, 0.7, L);
        S.d.box(M.lava, 0, -0.3, 0, 4.4, 0.1, L + 0.02);
        for (const s of [-1, 1]) S.b.box(M.wall, s * 2.5, -0.6, 0, 0.7, 1.25, L + 0.02);
        S.F.pop();
        S.col.box(x, z, 2.8, L / 2, ry, -1, 0.7, false);
      };
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, -1]]) {
        for (let t = -42; t <= 42; t += 6) {
          const x = nx ? nx * 47.5 : t, z = nz ? nz * 47.5 : t;
          if (!S.clear(x, z, 3) || (z > 40)) continue;
          lavaChunk(x, z, nx ? 0 : Math.PI / 2, 6.02);
        }
      }
      // arched terracotta viaducts with lava beneath
      for (const [a0, a1] of [[-128 * D, -62 * D], [62 * D, 128 * D]]) {
        const chords = arcArcade(S, M.terra, 66, a0, a1, 10, 7.5, 3.2, 7, { skip: (x, z) => !S.clear(x, z, 4) });
        for (const c of chords) {
          S.d.box(M.wall, c.mx, 10, c.mz, c.L + 0.1, 0.9, 0.6, { ry: c.ry });
          S.reserve(c.mx, c.mz, 4);
          const [ox, oz] = rot2(0, -4.6, c.ry);
          if (S.rand() < 0.7) { S.d.box(M.lava, c.mx + ox, -0.25, c.mz + oz, c.L * 0.9, 0.1, 4.5, { ry: c.ry }); S.light(c.mx + ox, 1.5, c.mz + oz, '#ff5a10', 10, 0.8); }
        }
      }
      // vented foundry towers
      for (const a of freeSpots(S, 76, [40 * D, -40 * D, 150 * D, -150 * D, 180 * D], 6)) {
        const [x, z] = polar(76, a);
        roundTower(S, x, z, 3.8, 16, { mat: M.terra, trim: M.metal, taper: 0.8 });
        for (let k = 0; k < 4; k++) S.d.torus(M.metal, x, 2 + k * 3.6, z, 3.75 - k * 0.2, 0.12, 24, 4);
        for (let k = 0; k < 8; k++) { const b = (k / 8) * TAU; const r = 3.8 * (1 - 0.2 * (11 / 16)) + 0.02; S.d.box(M.glow, x + Math.sin(b) * r, 9.5, z + Math.cos(b) * r, 0.35, 2.6, 0.08, { ry: b }); }
        S.d.cyl(M.metal, x, 16.5, z, 1.4, 1.1, 3.2, 10); S.d.disc(M.glow, x, 19.72, z, 1.05, 12);
        S.reserve(x, z, 7); S.light(x, 10, z, '#ff6020', 12, 1);
      }
      // volcanic outcrops beyond the walls, with lava pools
      outerRocks(S, M.wall, 12, 165, 230, [12, 26], [10, 26]);
      for (let i = 0; i < 4; i++) { const a = S.rand() * TAU; const [x, z] = polar(175 + S.rand() * 40, a); if (S.clear(x, z, 6)) { const g = S.gy(x, z); S.d.box(M.lava, x, g + 0.05, z, 10 + S.rand() * 8, 0.1, 6 + S.rand() * 6, { ry: a }); } }
    },
    house(S, w, d, h, rand) {
      const M = S.M;
      S.b.box(M.house, 0, 0, d / 2, w, h, d);
      S.d.box(M.trim, 0, h - 0.7, d / 2, w + 0.25, 0.7, d + 0.25);
      S.d.box(M.trim, 0, h, d / 2, w + 0.25, 0.5, d + 0.25);
      S.b.box(M.house, 0, h + 0.5, d / 2, w - 0.8, 0.12, d - 0.8);
      S.d.box(M.trim, w * 0.28, h, d * 0.7, 1.2, 2.4, 1.2); S.d.disc(M.glow, w * 0.28, h + 2.42, d * 0.7, 0.4, 8);
      S.d.box(M.dark, 0, 0, -0.04, 1.5, 2.5, 0.1); S.d.box(M.trim, 0, 2.5, -0.08, 2.0, 0.35, 0.2);
      for (const sx of [-1, 1]) if (w > 6) S.d.box(rand() < 0.5 ? M.glow : M.dark, sx * w * 0.3, h * 0.5, -0.03, 0.7, 1.1, 0.06);
    },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 8 }),
  },

  // ================================================================ 02 Rime Archive
  'oath-02': {
    glow: '#8fdcff', flame: '#c4ecff', lamp: 'lantern',
    banner: { color: '#2b2e33', trim: '#c9d3da', emblem: '#9fd4f0' },
    mats: {
      pave: ['stone.slate', { tint: '#6c7783' }], border: ['stone.darkgranite', { tint: '#454b54' }], ground: ['paving.flagstone', { tint: '#66707a' }],
      wall: ['stone.darkgranite', { tint: '#4a515b' }], trim: ['stone.slate', { tint: '#5a626c' }], metal: ['metal.iron', { tint: '#4a4c50' }],
      inlay: ['metal.brass', { tint: '#b4a47c' }], roof: ['tile.roof', { tint: '#c4ced6' }], ice: ['ice.glacial'], house: ['stone.darkgranite', { tint: '#464b53' }],
      found: ['stone.darkgranite', { tint: '#34383e' }], wood: ['wood.weathered', { tint: '#3a3430' }], fall: ['liquid.fall', { tint: '#e6f4fb', emissiveIntensity: 1.5 }],
    },
    rim: (S) => ({ type: 'solid', rail: S.M.wall, post: S.M.trim, h: 1.0, postEvery: 5, cap: (x, y, z) => S.d.box(S.M.ice, x, y - 0.12, z, 0.72, 0.38, 0.72) }),
    hall(S) {
      const M = S.M; const h = 2.4;
      terraceStairs(S, { x0: -38, x1: 38, z0: 50, z1: 86, h, mat: M.trim, coping: M.wall, stairW: 18, run: 4.5 });
      S.reserve(0, 70, 44);
      blockWall(S, M.wall, -62, 88, 62, 88, 28, { bw: 4.2, bh: 3.2, th: 5 });
      // cantilevered archive slab on pillars
      S.b.box(M.wall, 0, 17, 70, 92, 3.6, 40);
      S.d.box(M.trim, 0, 20.6, 70, 93, 0.5, 41);
      for (const x of [-32, -16, 16, 32]) for (const z of [54, 84]) { S.b.box(M.wall, x, h, z, 3.2, 17 - h, 3.2); colBox(S, x, z, 3.2, 3.2, 0, h - 1, 17, false); }
      // icicle curtain along the slab edge
      for (let x = -45; x <= 45; x += 1.3) { const L = 1.5 + S.rand() * 4.5; S.d.cyl(M.ice, x + S.rand() * 0.5, 17.1, 50 + S.rand() * 0.6, 0.32, 0.02, L, 5, { rx: Math.PI }); }
      // glacial waterfalls down the back wall and slab sides
      for (const x of [-50, -36, -22, 22, 36, 50]) { waterfall(S, x, 27.5, 85.4, 9, h, 0); S.d.box(M.water, x, h + 0.02, 83.5, 10, 0.05, 3.5); S.d.box(M.ice, x, h, 85.6, 10.5, 1.4, 1.4); }
      for (const s of [-1, 1]) { waterfall(S, s * 46.5, 16.9, 60, 5, 0.06, s * Math.PI / 2); S.d.box(M.ice, s * 46.5, 0.06, 60, 3, 0.6, 6); }
      // central archive tower with glowing ice core
      S.b.box(M.wall, 0, h, 66, 8, 30, 8);
      S.d.box(M.glow, 0, h + 4, 61.95, 1.3, 20, 0.12);
      S.d.box(M.trim, 0, h + 30, 66, 9, 0.8, 9);
      S.d.cyl(M.ice, 0, h + 30.8, 66, 3.4, 0.05, 7, 4, { ry: Math.PI / 4 });
      colBox(S, 0, 66, 8, 8, 0, h - 1, h + 30, false);
      S.light(0, h + 6, 60, '#9fe0ff', 18, 1.8);
      // vault shelves with ice ledgers
      for (const x of [-36, -26, 26, 36]) { S.b.box(M.trim, x, h, 80, 7, 12, 3); for (let k = 0; k < 4; k++) S.d.box(M.ice, x, h + 1.4 + k * 2.6, 78.4, 6, 1.6, 0.4); }
      S.hallDoor = { x: 0, y: h, z: 58 };
    },
    signature(S) {
      const M = S.M;
      for (const a of freeSpots(S, 66, [105 * D, -105 * D], 14)) {
        const [x, z] = polar(66, a); S.F.push(x, 0, z, a);
        S.b.box(M.wall, 0, 13, 3, 32, 3.2, 17); S.d.box(M.trim, 0, 16.2, 3, 33, 0.4, 18);
        for (const px of [-12, 12]) for (const pz of [-3, 9]) { S.b.box(M.wall, px, 0, pz, 2.6, 13, 2.6); colBox(S, px, pz, 2.6, 2.6, 0, -1, 13, false); }
        for (const px of [-7, 7]) { waterfall(S, px, 13, -5.6, 4, 0.06, 0); S.d.box(M.ice, px, 0.06, -5.6, 5, 0.7, 1.4); }
        for (let px = -15; px <= 15; px += 1.4) { const L = 1 + S.rand() * 3.5; S.d.cyl(M.ice, px, 13.1, -5.4, 0.3, 0.02, L, 5, { rx: Math.PI }); }
        S.F.pop(); S.reserve(x, z, 18);
      }
      // ice pillars
      for (const a of freeSpots(S, 55, [35 * D, -35 * D, 70 * D, -70 * D, 140 * D, -140 * D, 180 * D], 4)) {
        const [x, z] = polar(55, a);
        S.b.box(M.wall, x, -0.5, z, 3.6, 1.3, 3.6, { ry: a });
        for (let k = 0; k < 3; k++) { const o = polar(0.9, a + k * 2.1); S.b.cyl(M.ice, x + o[0], 0.8, z + o[1], 0.75 - k * 0.12, 0.6 - k * 0.1, 9 - k * 2.4, 6, { ry: k }); S.d.cyl(M.ice, x + o[0], 0.8 + 9 - k * 2.4, z + o[1], 0.6 - k * 0.1, 0.02, 1.2, 6, { ry: k }); }
        S.col.circle(x, z, 1.8, -1, 9, false); S.reserve(x, z, 3);
      }
      // stone blocks with ice caps near the rim
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.13; const [x, z] = polar(47.6, a); if (!S.clear(x, z, 2)) continue;
        S.b.box(M.wall, x, 0, z, 2.6, 2.1, 2.6, { ry: a + 0.2 }); S.d.box(M.ice, x, 2.05, z, 2.75, 0.55, 2.75, { ry: a + 0.25 });
        colBox(S, x, z, 2.6, 2.6, a + 0.2, -1, 2.6, false);
      }
      // enclosing glacial basin: cliff arc with falls behind the archive
      const A0 = -82 * D, A1 = 82 * D, R = 104; const n = 14;
      for (let i = 0; i < n; i++) {
        const a0 = A0 + (A1 - A0) * (i / n), a1 = A0 + (A1 - A0) * ((i + 1) / n);
        const [x0, z0] = polar(R + (i % 2) * 4, a0), [x1, z1] = polar(R + ((i + 1) % 2) * 4, a1);
        const hh = 34 + S.rand() * 14; const g = Math.min(S.gy(x0, z0), S.gy(x1, z1));
        blockWall(S, M.wall, x0, z0, x1, z1, hh, { y: g, bw: 6, bh: 4.5, th: 7, colH: hh });
        const [mx, mz] = polar(R - 3.6, (a0 + a1) / 2);
        if (i % 2 === 0) { waterfall(S, mx, g + hh - 1, mz, 7 + S.rand() * 4, g, (a0 + a1) / 2 + Math.PI); S.d.box(M.ice, mx, g, mz, 9, 1.6, 3, { ry: (a0 + a1) / 2 }); }
      }
      outerRocks(S, M.wall, 10, 165, 235, [16, 30], [16, 34]);
      outerRocks(S, M.ice, 6, 175, 240, [10, 20], [8, 18]);
    },
    house(S, w, d, h) { genericHouse(S, w, d, h, { roof: S.M.roof, pitch: 0.6 }); },
    districts: { skip: (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 88 * D },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 8 }),
  },

  // ================================================================ 03 Storm Relay
  'oath-03': {
    glow: '#b4a2ff', flame: '#d6ccff', lamp: 'lantern',
    banner: { color: '#1e2a44', trim: '#c58a4a', emblem: '#d89a5a' },
    mats: {
      pave: ['stone.slate', { tint: '#30353e', roughness: 0.55 }], border: ['stone.darkgranite', { tint: '#2a2d33' }], ground: ['stone.slate', { tint: '#2d3139', roughness: 0.7 }],
      wall: ['stone.darkgranite', { tint: '#2f333a' }], trim: ['stone.darkgranite', { tint: '#3b3f47' }], metal: ['metal.copper'], inlay: ['metal.copper'],
      roof: ['metal.copper', { tint: '#4f8473' }], slate: ['stone.slate', { tint: '#2a2e36' }], ceramic: ['plaster.lime', { tint: '#e8e6e0' }], house: ['stone.darkgranite', { tint: '#3b3f47' }],
      found: ['stone.darkgranite', { tint: '#2a2d33' }], dark: ['stone.basalt', { tint: '#101216' }], wood: ['wood.weathered', { tint: '#2a2620' }],
    },
    inlayExtra(S, mat, y) { for (const [r, w] of [[20.5, 0.28], [26.5, 0.28], [32.5, 0.28], [33.3, 0.1], [21.2, 0.1]]) S.d.ring(mat, 0, y, 0, r, r + w, 0.025, 112); },
    rim: (S) => ({ type: 'stone', rail: S.M.trim, post: S.M.wall, cap: (x, y, z) => S.d.sphere(S.M.metal, x, y + 0.1, z, 0.17, 8) }),
    hall(S) {
      const M = S.M; const h = 3.6;
      terraceStairs(S, { x0: -40, x1: 40, z0: 50, z1: 94, h, mat: M.wall, coping: M.trim, stairW: 14, run: 5.8 });
      S.reserve(0, 70, 42);
      S.b.archWall(M.wall, 0, h, 64, 18, 15, 3, 8, 11);
      S.d.box(M.metal, 0, h + 15, 64, 18.6, 0.45, 3.4);
      S.d.box(M.metal, 0, h + 11.2, 62.4, 9, 0.35, 0.2);
      S.d.beam(M.metal, [0, h + 11, 64], [0, h + 9.3, 64], 0.1);
      S.d.torus(M.metal, 0, h + 7.8, 64, 1.5, 0.12, 28, 6, { rx: Math.PI / 2 });
      S.d.sphere(M.glow, 0, h + 7.8, 64, 0.85, 14);
      S.light(0, h + 7.8, 62, '#c8b8ff', 16, 1.6);
      for (const s of [-1, 1]) colBox(S, s * 7, 64, 5, 3, 0, h - 1, h + 15, false);
      S.pylons = [];
      for (const s of [-1, 1]) S.pylons.push({ a: Math.atan2(s * 15, 70), top: relayPylon(S, s * 15, 70, 36, { y: h, scale: 1.05 }) });
      // suspended bridge between the flank pylons
      S.d.box(M.trim, 0, h + 17, 70, 26, 0.6, 3.2);
      for (const sz of [-1.5, 1.5]) S.d.box(M.metal, 0, h + 18.1, 70 + sz, 26, 0.12, 0.12);
      for (let x = -12; x <= 12; x += 2) for (const sz of [-1.5, 1.5]) S.d.box(M.metal, x, h + 17.6, 70 + sz, 0.08, 0.6, 0.08);
      S.b.box(M.wall, 0, h, 84, 54, 16, 14); S.b.hip(M.slate, 0, h + 16, 84, 55, 15, 5.5);
      for (let i = -3; i <= 3; i++) { S.d.box(M.metal, i * 7.5, h, 76.9, 0.5, 16, 0.3); if (i) S.d.box(M.glow, i * 7.5 - 3.75 * Math.sign(i) * 0, h + 9, 76.95, 1.4, 3.2, 0.1); }
      S.d.box(M.dark, 0, h, 76.9, 4, 6, 0.2);
      S.hallDoor = { x: 0, y: h, z: 70 };
    },
    signature(S) {
      const M = S.M;
      for (const [a, r] of [[48 * D, 54], [-48 * D, 54], [88 * D, 58], [-88 * D, 58], [128 * D, 62], [-128 * D, 62], [24 * D, 78], [-24 * D, 78]]) {
        const [x, z] = polar(r, a); if (!S.clear(x, z, 6)) continue;
        S.pylons.push({ a, top: relayPylon(S, x, z, 26 + S.rand() * 9) }); S.reserve(x, z, 8);
      }
      const P = [...S.pylons].sort((p, q) => p.a - q.a);
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length]; const d = Math.hypot(p.top[0] - q.top[0], p.top[2] - q.top[2]);
        if (d > 80) continue;
        cable(S, M.metal, p.top, q.top, 3 + d * 0.06, 0.08);
        cable(S, M.dark, [p.top[0], p.top[1] - 1.1, p.top[2]], [q.top[0], q.top[1] - 1.1, q.top[2]], 4 + d * 0.07, 0.06);
      }
      outerRocks(S, M.wall, 12, 160, 240, [16, 30], [22, 46]);
    },
    house(S, w, d, h, rand) { genericHouse(S, w, d, h, { roofType: 'hip', roof: rand() < 0.2 ? S.M.roof : S.M.slate }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 7 }),
  },

  // ================================================================ 04 Tidal Covenant
  'oath-04': {
    glow: '#58d4ff', flame: '#ffcf80', lamp: 'brazier',
    banner: { color: '#1d3352', trim: '#b08a4a', emblem: '#e9e1d2' },
    mats: {
      pave: ['paving.slab', { tint: '#dad2c2' }], border: ['stone.limestone', { tint: '#cdc4b2' }], ground: ['paving.flagstone', { tint: '#cfc7b6' }],
      wall: ['stone.limestone', { tint: '#e2dacb' }], trim: ['stone.limestone', { tint: '#d0c6b2' }], metal: ['metal.brass'], inlay: ['metal.brass'],
      roof: ['tile.roof', { tint: '#bba98e' }], house: ['plaster.lime', { tint: '#ece6dc' }], found: ['stone.limestone', { tint: '#c4baa6' }],
      nacre: ['stone.marble', { tint: '#efe9df', backFaceCulling: false }], glass: ['glass.tinted', { tint: '#7ab0c0' }],
      leaves: ['foliage.leaves', { tint: '#4a6a2a' }], bark: ['bark.living', { tint: '#6a5a44' }], wood: ['wood.weathered', { tint: '#5a4a3a' }],
    },
    rim: (S) => ({ type: 'stone', rail: S.M.trim, post: S.M.wall }),
    hall(S) {
      const M = S.M; const h = 3;
      terraceStairs(S, { x0: -38, x1: 38, z0: 56, z1: 90, h, mat: M.wall, coping: M.trim, stairW: 16, run: 5 });
      S.reserve(0, 72, 42);
      // scallop shell half-dome
      const cz = 74, R = 16;
      S.b.sphere(M.nacre, 0, h, cz, R, 20, { hemi: true, rx: Math.PI / 2 });
      for (let i = 0; i <= 10; i++) {
        const ph = (i / 10) * Math.PI; const pts = [];
        for (let k = 0; k <= 10; k++) { const t = (k / 10) * Math.PI / 2; pts.push([R * 1.01 * Math.cos(ph) * Math.sin(t), h + R * 1.01 * Math.sin(ph) * Math.sin(t), cz + R * 1.01 * Math.cos(t) * -1 * -1]); }
        S.d.tube(M.nacre, pts.map(([x, y, z]) => [x, y, cz + (z - cz) * 1]), 0.32, 6);
      }
      S.d.torus(M.metal, 0, h, cz, R + 0.2, 0.28, 48, 6, { rx: Math.PI / 2, arc: Math.PI });
      // brass-framed glass water gate
      for (const x of [-4.2, 0, 4.2]) {
        S.d.box(M.glass, x, h, cz + 3, 3.6, 9 - Math.abs(x) * 0.4, 0.2);
        S.d.box(M.metal, x - 1.85, h, cz + 3, 0.18, 9.2 - Math.abs(x) * 0.4, 0.3); S.d.box(M.metal, x + 1.85, h, cz + 3, 0.18, 9.2 - Math.abs(x) * 0.4, 0.3);
        S.d.box(M.metal, x, h + 9 - Math.abs(x) * 0.4, cz + 3, 3.9, 0.22, 0.3);
      }
      S.d.torus(M.metal, 0, h + 5.4, cz + 2.8, 1.3, 0.14, 24, 5, { rx: Math.PI / 2 });
      waterfall(S, 0, h + 10, cz - 2, 3, h + 0.4, 0);
      S.F.push(0, h, 0, 0); roundPool(S, 0, cz - 6, 4.2, { rim: M.trim, waterY: 0.35, rimH: 0.6 }); S.F.pop();
      colBox(S, 0, cz + 3, 13, 1, 0, h - 1, h + 12, false);
      S.hallDoor = { x: 0, y: h, z: 64 };
      for (const s of [-1, 1]) brazier(S, s * 9, 61, h, 1.3, true);
    },
    signature(S) {
      const M = S.M;
      channelRing(S, 46.6, 51.6, [...S.roads, 0], 7, { liquid: M.water, curb: M.trim, level: 0.3 });
      // two-tier aqueducts with waterfalls into pools
      for (const [a0, a1] of [[-142 * D, -52 * D], [52 * D, 142 * D]]) {
        const skip = (x, z) => !S.clear(x, z, 3);
        const ch = arcArcade(S, M.wall, 72, a0, a1, 9, 7.5, 3, 6.4, { skip });
        arcArcade(S, M.wall, 72, a0, a1, 6, 3.75, 2.6, 4.3, { skip, y: 9 });
        ch.forEach((c, i) => {
          S.d.box(M.water, c.mx, 15.05, c.mz, c.L, 0.05, 1.7, { ry: c.ry });
          for (const s of [-1, 1]) { const [ox, oz] = rot2(0, s * 1.2, c.ry); S.d.box(M.trim, c.mx + ox, 15, c.mz + oz, c.L, 0.6, 0.35, { ry: c.ry }); }
          S.reserve(c.mx, c.mz, 4.5);
          if (i % 3 === 1) {
            const [ix, iz] = rot2(0, -1.7, c.ry);
            waterfall(S, c.mx + ix, 15.1, c.mz + iz, 2.4, 0.4, c.ry);
            const [px, pz] = rot2(0, -4.6, c.ry); roundPool(S, c.mx + px, c.mz + pz, 3.2, { rim: M.trim });
          }
        });
      }
      ringBanners(S, 55, [30 * D, -30 * D, 150 * D, -150 * D], 10, { pole: M.metal, base: M.trim });
      const palm = treeProto('palm', M.bark, M.leaves);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU + 0.1; const [x, z] = polar(56 + (i % 2) * 6, a); if (S.clear(x, z, 2)) S.inst.add(palm, x, 0.06, z, a * 3, 1, 1 + (i % 3) * 0.15, 1); }
      outerRocks(S, M.wall, 8, 170, 230, [14, 26], [10, 22]);
    },
    house(S, w, d, h, rand) { genericHouse(S, w, d, h, { roofType: rand() < 0.25 ? 'dome' : 'flat', roof: S.M.roof }); },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.trim, h: 7 }),
  },

  // ================================================================ 05 Fault Choir
  'oath-05': {
    glow: '#b07cff', flame: '#ffb070', lamp: 'brazier',
    banner: { color: '#7a2a22', trim: '#c8a77a', emblem: '#e6cfa6' },
    mats: {
      pave: ['paving.slab', { tint: '#c6a67c' }], border: ['stone.sandstone', { tint: '#a8865c' }], ground: ['paving.flagstone', { tint: '#b4946a' }],
      wall: ['stone.sandstone'], shale: ['stone.shale', { tint: '#8a7058' }], trim: ['stone.sandstone', { tint: '#9a7a56' }], metal: ['metal.iron'],
      inlay: ['stone.shale', { tint: '#7a6248' }], roof: ['stone.sandstone', { tint: '#a88a64' }], crystal: ['crystal.amethyst', { emissiveIntensity: 1.6 }],
      house: ['stone.sandstone', { tint: '#b89a74' }], found: ['stone.shale', { tint: '#7a6450' }], wood: ['wood.weathered', { tint: '#5a4430' }],
    },
    rim: (S) => ({ type: 'solid', rail: S.M.wall, post: S.M.shale, h: 1.3, postEvery: 3 }),
    hall(S) {
      const M = S.M;
      terraceStairs(S, { x0: -42, x1: 42, z0: 50, z1: 98, h: 2.2, mat: M.shale, coping: M.trim, stairW: 20, run: 3.8 });
      terrace(S, M.wall, 0, 81, 54, 34, 5.2, { coping: M.trim, y0: 1.5 });
      stairs(S, M.trim, 0, 60.5, 0, 12, 5.2, 2.4, 5.2);
      S.reserve(0, 74, 46);
      trilithon(S, 0, 54.5, 0, 2.2, 20, 17);
      S.b.box(M.wall, 0, 5.2, 90, 62, 18, 12);
      S.d.box(M.trim, 0, 23.2, 90, 63, 1.2, 13);
      S.d.box(M.dark, 0, 5.2, 83.9, 6, 9, 0.2);
      for (const x of [-20, -10, 10, 20]) { S.b.box(M.trim, x, 5.2, 83, 2.4, 18, 2.4); S.col.box(x, 83, 1.2, 1.2, 0, 4, 23, false); }
      colBox(S, 0, 90, 62, 12, 0, 1, 23, false);
      for (const x of [-27, -14, 14, 27]) S.d.box(M.crystal, x, 1.0, 49.9, 5 + S.rand() * 3, 0.3, 0.2);
      arcade(S, M.wall, -78, 104, 78, 104, 16, 9, 4, 12);
      S.hallDoor = { x: 0, y: 5.2, z: 80 };
    },
    signature(S) {
      const M = S.M;
      for (const a of freeSpots(S, 63, [60 * D, -60 * D, 120 * D, -120 * D, 180 * D], 8)) { const [x, z] = polar(63, a); trilithon(S, x, z, a, 0.06, 18, 15); S.reserve(x, z, 10); crystalCluster(S, x + Math.cos(a) * 7, z - Math.sin(a) * 7, 1.2, 0.06); }
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + 0.2; const [x, z] = polar(48 + (i % 3), a); if (S.clear(x, z, 2)) crystalCluster(S, x, z, 0.8 + (i % 2) * 0.5, 0.06); }
      outerRocks(S, M.shale, 9, 160, 240, [20, 36], [20, 44]);
      outerRocks(S, M.wall, 8, 170, 240, [16, 30], [14, 32]);
    },
    house(S, w, d, h) {
      genericHouse(S, w, d, h, { roofType: 'flat' });
      for (let x = -w / 2 + 0.8; x < w / 2; x += 1.6) S.d.box(S.M.wood, x, h - 0.7, -0.4, 0.25, 0.25, 0.9);
    },
    wallOpts: (S) => ({ mat: S.M.wall, trim: S.M.shale, h: 9 }),
  },

  // ================================================================ 06 Reed Resonance
  'oath-06': {
    glow: '#ffe6c0', flame: '#ffd090', lamp: 'lantern',
    banner: { color: '#c0402a', trim: '#efe6d6', emblem: '#f6f0e4' },
    mats: {
      pave: ['paving.slab', { tint: '#ddd3c0' }], border: ['stone.limestone', { tint: '#cfc3aa' }], ground: ['paving.flagstone', { tint: '#cfc4ae' }],
      wall: ['stone.limestone', { tint: '#d8ccb4' }], trim: ['wood.weathered', { tint: '#8a6a4a' }], metal: ['wood.weathered', { tint: '#5a4632' }],
      inlay: ['wood.lacquer', { tint: '#b8402a' }], roof: ['tile.roof', { tint: '#7a6048' }], wood: ['wood.weathered', { tint: '#9a7a52' }],
      linen: ['cloth.banner', { tint: '#e8dfcf', backFaceCulling: false }], house: ['plaster.lime', { tint: '#e6dccb' }], found: ['stone.limestone', { tint: '#bfb29a' }],
    },
    inlayExtra(S, mat, y) { S.d.ring(mat, 0, y, 0, 24.8, 25.1, 0.025, 64, { a0: 0.4, arc: 4.4 }); S.d.ring(mat, 0, y, 0, 31.2, 31.5, 0.025, 72, { a0: 2.4, arc: 3.4 }); S.d.ring(mat, 0, y, 0, 20, 20.2, 0.025, 64, { a0: 3.6, arc: 3.0 }); },
    rim: (S) => ({ type: 'wood', rail: S.M.wood, post: S.M.trim, cap: (x, y, z) => S.d.sphere(S.M.trim, x, y + 0.05, z, 0.17, 8) }),
    hall(S) {
      const M = S.M; const A0 = -62 * D, A1 = 62 * D;
      for (let k = 0; k < 7; k++) {
        const r0 = 46 + k * 2.3, r1 = r0 + 2.3, h = (k + 1) * 0.5;
        const pts = [...arcPts(r1, A0, A1, 3), ...arcPts(r0, A1, A0, 3)];
        S.b.prism(M.wall, pts, 0, -0.5, 0, h + 0.5);
        const n = Math.ceil(((A1 - A0) * r0) / 4);
        for (let i = 0; i < n; i++) { const a = A0 + (A1 - A0) * ((i + 0.5) / n); const [x, z] = polar((r0 + r1) / 2, a); S.col.box(x, z, ((A1 - A0) * r1) / n / 2 + 0.1, 1.2, a, -1, h, true); }
      }
      S.reserve(0, 60, 22); S.reserve(-25, 52, 12); S.reserve(25, 52, 12);
      // acoustic fins
      const ribs = [];
      for (let i = 0; i <= 10; i++) {
        const a = A0 + (A1 - A0) * (i / 10);
        const pts = [[63, -0.5], [64, 6], [62.5, 11], [58, 15.5], [53, 17]].map(([r, y]) => { const [x, z] = polar(r, a); return [x, y + 3.5, z]; });
        S.b.tube(M.wood, pts, 0.45, 7); ribs.push(pts);
        const [bx, bz] = polar(63, a); S.col.circle(bx, bz, 0.6, -1, 10, false);
      }
      for (let i = 0; i < ribs.length - 1; i += 2) { const p = ribs[i], q = ribs[i + 1]; S.d.quad(M.linen, [p[1], q[1], q[3], p[3]], { double: true, uv: [0, 0, 1, 1] }); }
      S.hallDoor = { x: 0, y: 3.5, z: 56 };
    },
    signature(S) {
      const M = S.M;
      for (const s of [-1, 1]) {
        const angs = [s * 78 * D, s * 98 * D, s * 118 * D].filter((a) => { const [x, z] = polar(57, a); return S.clear(x, z, 2); });
        const tops = angs.map((a) => { const [x, z] = polar(57, a); S.b.cyl(M.wood, x, -0.5, z, 0.28, 0.22, 13, 8); S.col.circle(x, z, 0.4, -1, 12, false); S.reserve(x, z, 3); return [x, 12.4, z]; });
        for (let i = 0; i < tops.length - 1; i++) {
          const a = angs[i], b = angs[i + 1]; const [ix, iz] = polar(47.5, a), [jx, jz] = polar(47.5, b);
          S.d.quad(M.linen, [tops[i], tops[i + 1], [jx, 6.5, jz], [ix, 6.5, iz]], { double: true, uv: [0, 0, 1, 1] });
          S.d.tube(M.metal, [tops[i], [ix, 6.5, iz]], 0.03, 4); S.d.tube(M.metal, [tops[i + 1], [jx, 6.5, jz]], 0.03, 4);
        }
      }
      for (const a of freeSpots(S, 64, [150 * D, -150 * D, 180 * D, 130 * D], 6).slice(0, 1)) {
        const [x, z] = polar(64, a);
        S.b.cyl(M.wall, x, -0.3, z, 3.4, 3.6, 1.3, 16);
        for (let i = 0; i < 14; i++) { const b = (i / 14) * TAU; const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; const r = 2.9 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - 0.2 * t) + 0.15; pts.push([x + Math.sin(b) * r, 1 + t * 10, z + Math.cos(b) * r]); } S.d.tube(M.wood, pts, 0.13, 5); }
        for (const [t, r] of [[0.2, 2.2], [0.45, 2.85], [0.75, 2.2]]) S.d.torus(M.wood, x, 1 + t * 10, z, r, 0.1, 24, 4);
        S.col.circle(x, z, 3.5, -1, 11, false); S.reserve(x, z, 5);
      }
      ringBanners(S, 47.8, [24 * D, -24 * D, 140 * D, -140 * D, 165 * D, -165 * D], 9, { pole: M.wood, base: M.trim, w: 0.9, bh: 6.5 });
      outerRocks(S, M.wall, 8, 170, 235, [18, 30], [10, 24]);
    },
    house(S, w, d, h) {
      const M = S.M; genericHouse(S, w, d, h, { trim: M.trim, roof: M.roof });
      for (const x of [-w / 2 + 0.12, -w / 6, w / 6, w / 2 - 0.12]) S.d.box(M.trim, x, 0, -0.06, 0.24, h, 0.14);
      S.d.box(M.trim, 0, h * 0.55, -0.07, w, 0.22, 0.14);
      for (const s of [-1, 1]) { S.d.box(M.trim, s * (w / 2 + 0.03), 0, d / 2, 0.14, h, 0.24); S.d.box(M.trim, s * (w / 2 + 0.03), h * 0.55, d / 2, 0.14, 0.22, d); }
    },
    wallOpts: (S) => ({ type: 'palisade', h: 4.5, trim: S.M.trim, stakeProto: proto(`stake:${S.M.wood}`, (b) => { b.cyl(S.M.wood, 0, 0, 0, 0.17, 0.15, 5.4, 6); b.cyl(S.M.wood, 0, 5.4, 0, 0.15, 0.01, 0.6, 6); }), towers: false }),
  },

  // ================================================================ 07 Graft Sanctuary
  'oath-07': {
    glow: '#ffc04a', flame: '#ffb040', lamp: 'lantern',
    banner: { color: '#3a4a2a', trim: '#c89a40', emblem: '#ffc04a' },
    mats: {
      pave: ['paving.flagstone', { tint: '#a98d68' }], border: ['bark.living', { tint: '#5a4430' }], ground: ['paving.flagstone', { tint: '#8a7656' }],
      wall: ['stone.sandstone', { tint: '#7a6a50' }], trim: ['wood.weathered', { tint: '#6a5038' }], metal: ['wood.weathered', { tint: '#4a3a28' }],
      inlay: ['wood.weathered', { tint: '#4a3826' }], roof: ['tile.roof', { tint: '#9a8452' }], bark: ['bark.living'], leaves: ['foliage.leaves', { tint: '#4c6c2c' }],
      wood: ['wood.weathered', { tint: '#7a5a3a' }], house: ['wood.weathered', { tint: '#7a5e40' }], found: ['stone.sandstone', { tint: '#6a5a44' }],
    },
    rim: (S) => ({ type: 'wood', rail: S.M.trim, post: S.M.bark, h: 1.0 }),
    hall(S) {
      const M = S.M; const h = 2.5;
      terraceStairs(S, { x0: -32, x1: 32, z0: 54, z1: 92, h, mat: M.wall, coping: M.trim, stairW: 14, run: 4.2 });
      S.reserve(0, 74, 40);
      const T = giantTree(S, 0, 76, 6, 32, { y: h, roots: 9, branches: 7 });
      S.d.box(M.dark, 0, h, 69.6, 2.8, 5, 0.3); S.d.box(M.glow, 0, h, 69.8, 2.4, 4.6, 0.2);
      S.b.archWall(M.wood, 0, h, 69.3, 4.6, 6.2, 0.6, 2.8, 5.0);
      S.light(0, h + 3, 67, '#ffb040', 14, 1.6);
      S.b.ring(M.wood, 0, 12, 76, 6.2, 11.5, 0.45, 40, { bottom: true });
      balustrade(S, arcPts(11.3, 0, TAU * 0.92, 2.5).map(([x, z]) => [x, z + 76]), { type: 'wood', rail: M.trim, y: 12.45, h: 1.0 });
      S.col.circle(0, 76, 11.5, 11.8, 12.45, true);
      stairs(S, M.wood, 9.5, 59.5, 0, 3, 14, h, 12.45);
      hangLanterns(S, T.branches);
      S.hallDoor = { x: 0, y: h, z: 66 };
    },
    signature(S) {
      const M = S.M; const trees = [];
      for (const a of freeSpots(S, 66, [50 * D, -50 * D, 100 * D, -100 * D, 150 * D, -150 * D], 10)) {
        const [x, z] = polar(66, a); const R = 2.6 + S.rand() * 0.8;
        const T = giantTree(S, x, z, R, 20 + S.rand() * 6);
        S.b.ring(M.wood, x, 8, z, R + 0.6, R + 4.6, 0.4, 28, { bottom: true });
        balustrade(S, arcPts(R + 4.4, 0, TAU * 0.9, 2.5).map(([px, pz]) => [px + x, pz + z]), { type: 'wood', rail: M.trim, y: 8.4, h: 0.95 });
        S.col.circle(x, z, R + 4.6, 7.8, 8.4, true);
        const [sx, sz] = polar(R + 6.5, a + Math.PI * 0.5); stairs(S, M.wood, x + sx, z + sz, a + Math.PI, 2.6, 11, 0.06, 8.4);
        hangLanterns(S, T.branches); trees.push({ x, z, a }); S.reserve(x, z, R + 7);
      }
      trees.sort((p, q) => p.a - q.a);
      for (let i = 0; i < trees.length - 1; i++) {
        const p = trees[i], q = trees[i + 1]; const d = Math.hypot(p.x - q.x, p.z - q.z); if (d > 70) continue;
        const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([p.x + (q.x - p.x) * t, 8.2 - Math.sin(t * Math.PI) * 1.4, p.z + (q.z - p.z) * t]); }
        for (let k = 0; k < 16; k++) S.d.beam(M.wood, pts[k], pts[k + 1], 1.4, 0.12);
        S.d.tube(M.metal, pts.map(([x, y, z]) => [x, y + 1.0, z]), 0.04, 4);
      }
      // root arches over the plaza entrances and roots along the rim
      for (const a of [...S.roads, 0]) {
        for (const off of [0, 0.6]) {
          const [x0, z0] = polar(44.5 + off, a - 6.5 / 44.5), [x1, z1] = polar(44.5 + off, a + 6.5 / 44.5); const [mx, mz] = polar(45 + off, a);
          S.b.tube(M.bark, [[x0, -0.4, z0], [x0 * 0.98 + mx * 0.02, 4, z0 * 0.98 + mz * 0.02], [mx, 7.6 - off, mz], [x1 * 0.98 + mx * 0.02, 4, z1 * 0.98 + mz * 0.02], [x1, -0.4, z1]], (t) => 0.75 - Math.sin(t * Math.PI) * 0.35 - off * 0.3, 7);
        }
      }
      const broad = treeProto('broad', M.bark, M.leaves);
      for (let i = 0; i < 90; i++) { const a = S.rand() * TAU, r = 152 + S.rand() * 110; const [x, z] = polar(r, a); if (!S.clear(x, z, 3)) continue; const s = 1.4 + S.rand() * 1.6; S.inst.add(broad, x, S.gy(x, z) - 0.3, z, S.rand() * TAU, s, s, s); }
    },
    house(S, w, d, h) {
      const M = S.M; const r = Math.min(w, d) / 2;
      S.b.cyl(M.house, 0, 0, d / 2, r, r * 0.95, h * 0.7, 14);
      S.b.cyl(M.roof, 0, h * 0.7 - 0.2, d / 2, r + 1.0, 0.1, r * 1.3, 14);
      S.d.box(M.dark, 0, 0, d / 2 - r + 0.05, 1.2, 2.2, 0.2); S.d.box(M.glow, r * 0.6, h * 0.35, d / 2 - r * 0.75, 0.6, 0.6, 0.1, { ry: -0.6 });
    },
    wallOpts: (S) => ({ type: 'palisade', h: 5, trim: S.M.bark, stakeProto: proto(`stake:${S.M.bark}`, (b) => { b.cyl(S.M.bark, 0, 0, 0, 0.24, 0.2, 5.6, 6); b.cyl(S.M.bark, 0, 5.6, 0, 0.2, 0.02, 0.8, 6); }), towers: false }),
  },
};

function trilithon(S, x, z, ry, y, h, span) {
  const M = S.M; S.F.push(x, y, z, ry);
  for (const s of [-1, 1]) { S.b.box(M.wall, s * span / 2, -0.5, 0, 4.2, h + 0.5, 4.2); S.d.box(M.shale, s * span / 2, h * 0.3, 0, 4.4, 0.6, 4.4); S.col.box(s * span / 2, 0, 2.1, 2.1, 0, -1, h, false); }
  S.b.box(M.wall, 0, h, 0, span + 6.4, 3.6, 5);
  S.d.box(M.shale, 0, h + 3.6, 0, span + 6.8, 0.6, 5.4);
  for (const s of [-1, 1]) banner(S, s * 3.2, h - 0.2, -1.0, 0, 2, h * 0.55, { bar: null });
  S.d.box(M.crystal, 0, h + 0.8, -2.55, span * 0.6, 0.3, 0.12);
  S.F.pop();
}
