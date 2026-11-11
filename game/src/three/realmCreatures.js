// Ambient wildlife for each realm, taken from the Biome Triad world it corresponds to.
//
// The animals, their materials, the boids flock and every world's own spawn and update statements are verbatim
// copies in biome-creatures.generated.js. This file only does what the source worlds did for them: it tells each
// block where the ground and the water are (Aetherion's heightAt, SEA_LEVEL, MARSH_LEVEL), where its landmarks are
// (islands for gulls, a thermal for vultures, a pasture for sheep) and where the viewer is. It keeps the animals
// around the player, out of city rings, eases them in and out at realm borders and caps counts by quality.
//
// Scenery only: nothing here is registered with targeting, collision, the network or shared/sim.
import * as THREE from 'three';
import { heightAt, SEA_LEVEL, MARSH_LEVEL, WORLD_HALF } from '@shared/terrain.js';
import { regionAt, OATHS, OATH_BY_ID, SANCTUARY } from '@shared/oaths.js';
import * as BT from './biome-creatures.generated.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const QUALITIES = ['low', 'medium', 'high'];

/** Most animated animals alive in one realm, and most light points (fireflies), per quality tier. */
export const CREATURE_CAPS = Object.freeze({ low: 80, medium: 150, high: 270 });
export const POINT_CAPS = Object.freeze({ low: 300, medium: 600, high: 900 });

/**
 * Every set of animals the game can show. `world` is the Biome Triad world the code comes from, `lifted` the
 * generated functions it runs, `count` how many animals it animates on each quality tier.
 */
export const CREATURE_SETS = Object.freeze({
  sea: { world: 'sea', lifted: ['seaWildlife'], creatures: 'Gull flocks (boids), fish schools (boids)', count: { low: 46, medium: 114, high: 190 } },
  arcticPetrels: { world: 'arctic', lifted: ['arcticPetrels'], creatures: 'Petrel flocks (boids)', count: { low: 18, medium: 27, high: 36 } },
  arcticBones: { world: 'arctic', lifted: ['arcticBoneMat', 'arcticWhaleBones'], creatures: 'Whale skeleton on the beach', count: { low: 1, medium: 1, high: 1 } },
  deepWhale: { world: 'underwater', lifted: ['deepWhale', 'deepWhaleUpdate'], creatures: 'Whale', count: { low: 1, medium: 1, high: 1 } },
  havenDoves: { world: 'haven', lifted: ['havenDoves'], creatures: 'Dove flocks (boids)', count: { low: 24, medium: 32, high: 48 } },
  forestRooks: { world: 'forest', lifted: ['forestRooks'], creatures: 'Rooks over the canopy (boids)', count: { low: 16, medium: 26, high: 26 } },
  taiga: { world: 'taiga', lifted: ['taigaWildlife', 'taigaWildlifeUpdate'], creatures: 'Moose, caribou, ravens', count: { low: 12, medium: 18, high: 22 } },
  savanna: { world: 'savanna', lifted: ['savannaWildlife', 'savannaHerdsUpdate', 'savannaVulturesUpdate'], creatures: 'Impala, zebra, wildebeest and giraffe herds, vultures', count: { low: 54, medium: 83, high: 139 } },
  thermalVultures: { world: 'savanna', lifted: ['savannaWildlife', 'savannaVulturesUpdate'], creatures: 'Vultures on a thermal', count: { low: 6, medium: 11, high: 11 } },
  canyonBirds: { world: 'canyon', lifted: ['canyonBirds', 'canyonBirdsUpdate'], creatures: 'Condors and ravens', count: { low: 14, medium: 22, high: 30 } },
  alpineBirds: { world: 'alpine', lifted: ['alpineBirds', 'alpineBirdsUpdate'], creatures: 'Eagles and choughs', count: { low: 12, medium: 20, high: 26 } },
  marsh: { world: 'marsh', lifted: ['marshWildlife', 'marshWildlifeUpdate'], creatures: "Herons and egrets, dragonflies, fireflies, will-o'-wisps", count: { low: 23, medium: 33, high: 41 }, points: { low: 300, medium: 600, high: 900 }, needsCanvas: true },
  cavernBats: { world: 'caverns', lifted: ['cavernBats', 'cavernBatsUpdate'], creatures: 'Bats at dusk and by night', count: { low: 24, medium: 40, high: 54 } },
  villageBirds: { world: 'village', lifted: ['villageBirds', 'villageBirdsUpdate'], creatures: 'Rooks and swallows', count: { low: 16, medium: 24, high: 30 } },
  townRooks: { world: 'village', lifted: ['villageBirds', 'villageBirdsUpdate'], creatures: 'Rooks', count: { low: 8, medium: 14, high: 14 } },
  villageLivestock: { world: 'village', lifted: ['villageLivestock', 'villageLivestockUpdate'], creatures: 'Sheep and cattle at pasture', count: { low: 20, medium: 30, high: 40 } },
  ruinsBirds: { world: 'ruins', lifted: ['ruinsBirds', 'ruinsBirdsUpdate'], creatures: 'Macaws by day, bats at dusk', count: { low: 16, medium: 28, high: 40 } },
});

/**
 * The ambient life of each realm. A realm takes the wildlife of its Biome Triad world (REALM_WORLD in realmAir.js);
 * `borrowed` names sets that come from another world, because the realm's own world has no animals or the brief
 * asked for them (gulls over the cliffs, a whale off the glacial coast).
 */
export const REALM_LIFE = Object.freeze({
  volcanic: { sets: ['cavernBats'], borrowed: ['cavernBats'] },
  glacial: { sets: ['arcticPetrels', 'arcticBones', 'deepWhale'], borrowed: ['deepWhale'] },
  alpine: { sets: ['alpineBirds'], borrowed: [] },
  coast: { sets: ['sea'], borrowed: [] },
  canyon: { sets: ['canyonBirds'], borrowed: [] },
  cliffs: { sets: ['villageBirds', 'sea'], borrowed: ['sea'] },
  forest: { sets: ['forestRooks'], borrowed: [] },
  marsh: { sets: ['marsh'], borrowed: [] },
  meadow: { sets: ['villageBirds', 'villageLivestock'], borrowed: [] },
  highland: { sets: ['taiga'], borrowed: [] },
  badlands: { sets: ['thermalVultures'], borrowed: ['thermalVultures'] },
  crimson: { sets: ['havenDoves'], borrowed: [] },
  terraces: { sets: ['ruinsBirds'], borrowed: [] },
  plateau: { sets: ['savanna'], borrowed: [] },
  industrial: { sets: ['townRooks'], borrowed: ['townRooks'] },
});

/** Animals and light points a realm animates on a quality tier, from the table above. */
export function realmLifeCount(biome, quality) {
  let animals = 0, points = 0;
  for (const id of REALM_LIFE[biome]?.sets ?? []) { animals += CREATURE_SETS[id].count[quality]; points += CREATURE_SETS[id].points?.[quality] ?? 0; }
  return { animals, points };
}

const marshCentre = OATH_BY_ID['oath-08'].center;
/** Water surface height at a point (the marsh basin stands higher than the sea). */
export const waterAt = (x, z) => (Math.hypot(x - marshCentre[0], z - marshCentre[1]) < 630 ? MARSH_LEVEL : SEA_LEVEL);
/** Inside a sanctuary city ring (plus a margin)? Wildlife keeps out. */
export function inCity(x, z, margin = 25) { const o = regionAt(x, z); return Math.hypot(x - o.center[0], z - o.center[1]) < SANCTUARY.cityRadius + margin; }

// Bilinear height cache on a 2 m grid: flocks and herds ask for the ground under every animal every frame.
const heights = new Map();
const corner = (ix, iz) => { const key = (ix + 32768) * 65536 + (iz + 32768); let h = heights.get(key); if (h === undefined) { if (heights.size > 60000) heights.clear(); h = heightAt(ix * 2, iz * 2); heights.set(key, h); } return h; };
function H(x, z) {
  const fx = x * .5, fz = z * .5, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
  return lerp(lerp(corner(ix, iz), corner(ix + 1, iz), u), lerp(corner(ix, iz + 1), corner(ix + 1, iz + 1), u), v);
}
const inWorld = (x, z) => Math.abs(x) < WORLD_HALF - 60 && Math.abs(z) < WORLD_HALF - 60;
/** Dry, gently sloping ground outside the city rings. */
function landOk(x, z, slope = 5) {
  if (!inWorld(x, z) || inCity(x, z)) return false;
  const h = heightAt(x, z); if (h < waterAt(x, z) + .8) return false;
  return Math.abs(heightAt(x + 6, z) - heightAt(x - 6, z)) + Math.abs(heightAt(x, z + 6) - heightAt(x, z - 6)) < slope;
}
/** A point between `min` and `max` metres from (px, pz) that passes `ok`, or null. */
function pickSite(rand, px, pz, min, max, ok, tries = 28) {
  for (let i = 0; i < tries; i++) { const a = rand() * TAU, d = min + rand() * (max - min), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d; if (ok(x, z)) return [x, z]; }
  return null;
}
/** Highest ground (or water) on and inside a circle: what an orbiting bird has to clear. */
function circleTop(x, z, r) {
  let top = Math.max(heightAt(x, z), waterAt(x, z));
  for (let k = 0; k < 8; k++) top = Math.max(top, heightAt(x + Math.cos(k * TAU / 8) * r, z + Math.sin(k * TAU / 8) * r));
  return top;
}
/** Shrink every instance of a mesh about its own origin (used to ease animals in and out). */
function scaleInstances(mesh, k, from = 0, to = mesh.count) {
  if (k >= .999) return; const a = mesh.instanceMatrix.array;
  for (let i = from * 16, end = to * 16; i < end; i += 16) { a[i] *= k; a[i + 1] *= k; a[i + 2] *= k; a[i + 4] *= k; a[i + 5] *= k; a[i + 6] *= k; a[i + 8] *= k; a[i + 9] *= k; a[i + 10] *= k; }
  mesh.instanceMatrix.needsUpdate = true;
}
const setBase = (object) => { object.userData.baseScale = object.scale.x; return object; };
const scaleObject = (object, k) => object.scale.setScalar(Math.max(1e-4, object.userData.baseScale * k));

/**
 * Compress a world's circling birds to Aetherion's draw distance. Each class of birds (rows `from`..`to` of the
 * source list) keeps its relative layout, angular speed and phase; its orbit centres are pulled within `spread`
 * metres of the frame origin, radii are capped at `radMax` and the source altitudes are mapped onto `alt` metres
 * above the highest ground under the orbit.
 */
function fitOrbits(list, classes) {
  for (const c of classes) {
    const part = list.slice(c.from ?? 0, c.to ?? list.length); if (!part.length) continue;
    let mx = 0, mz = 0, far = 0, rmax = 0, h0 = Infinity, h1 = -Infinity;
    for (const g of part) { mx += g.cx / part.length; mz += g.cz / part.length; }
    for (const g of part) { far = Math.max(far, Math.hypot(g.cx - mx, g.cz - mz)); rmax = Math.max(rmax, g.rad); h0 = Math.min(h0, g.h); h1 = Math.max(h1, g.h); }
    const ks = far > c.spread ? c.spread / far : 1, kr = rmax > c.radMax ? c.radMax / rmax : 1;
    for (const g of part) { g.cx = (g.cx - mx) * ks; g.cz = (g.cz - mz) * ks; g.rad *= kr; g.alt = lerp(c.alt[0], c.alt[1], h1 > h0 ? (g.h - h0) / (h1 - h0) : .5); g.h = g.alt; }
  }
}

/** A group dragged behind the player on a leash: it only moves once the player is `length` metres from it. */
function leashFrame(length) {
  const frame = new THREE.Group(); frame.userData.sited = false;
  frame.userData.follow = (P) => {
    const dx = P.x - frame.position.x, dz = P.z - frame.position.z, d = Math.hypot(dx, dz);
    if (!frame.userData.sited || d > length + 350) { frame.position.x = P.x; frame.position.z = P.z; frame.userData.sited = true; return true; }
    if (d > length) { const k = (d - length) / d; frame.position.x += dx * k; frame.position.z += dz * k; }
    return false;
  };
  return frame;
}
/** Keeps circling birds above the ground under their orbit: one bird is re-measured per frame, all ease to target. */
function orbitGround(list, frame) {
  let cursor = 0;
  const measure = (g) => { g.hT = circleTop(frame.position.x + g.cx, frame.position.z + g.cz, g.rad) + g.alt; };
  return (dt, snapped) => {
    if (!list.length) return;
    if (snapped) { for (const g of list) { measure(g); g.h = g.hT; } return; }
    measure(list[cursor++ % list.length]);
    const k = Math.min(1, dt * 1.2); for (const g of list) g.h += (g.hT - g.h) * k;
  };
}
/**
 * A group that stays on one site until the player is `far` metres away, then shrinks its animals away, moves
 * and brings them back. `local` is the point of the source layout that is put on the site.
 */
function siteFrame(local, far, pick, onMove) {
  const frame = new THREE.Group(); let e = 0, sited = false, target = null, retry = 0;
  frame.userData.step = (dt, P) => {
    const cx = frame.position.x + local[0], cz = frame.position.z + local[1];
    if (!target && (!sited || Math.hypot(P.x - cx, P.z - cz) > far) && (retry -= dt) <= 0) { target = pick(P); retry = target ? 0 : 3; }
    if (target) { e = Math.max(0, e - dt / 1.2); if (e === 0) { frame.position.x = target[0] - local[0]; frame.position.z = target[1] - local[1]; sited = true; onMove?.(target); target = null; } }
    else if (sited) e = Math.min(1, e + dt / 2);
    return smooth(e);
  };
  frame.userData.unseat = () => { sited = false; e = 0; target = null; retry = 0; };
  return frame;
}

/**
 * Create the wildlife system. `update(dt, position)` is called once a frame with the player's position;
 * everything else (which realm, which animals, where) follows from that.
 */
export function createRealmCreatures(ctx) {
  const quality = QUALITIES.includes(ctx.quality?.name) ? ctx.quality.name : 'medium';
  const root = new THREE.Group(); root.name = 'Ambient wildlife (Biome Triad)'; ctx.scene?.add(root);
  const rand = BT.rng(20261110), P = { x: 0, y: 0, z: 0, speed: 0 }, live = new Map(), failed = new Set();
  const env = { time: 0, day: 1, night: 0, sunDir: { y: 1 }, wind: [0, 0] };
  const shadows = !!ctx.quality?.shadows && quality !== 'low';
  let time = 0, lastBiome = '';
  /** The source reads the viewer from its global S; each block gets the player in its own frame's coordinates. */
  const viewer = (frame) => BT.S.pos.set(P.x - (frame?.position.x ?? 0), P.y + 1.5 - (frame?.position.y ?? 0), P.z - (frame?.position.z ?? 0));
  const localHeight = (frame) => (x, z) => H(x + frame.position.x, z + frame.position.z) - frame.position.y;
  const share = (id) => CREATURE_SETS[id].count[quality];

  // ---- Boids flocks ------------------------------------------------------------------------------------------
  // The lifted blocks call k.flock(mesh, options). This kit hands them the real flock, after trimming the number
  // of groups to the quality tier and (for fish) putting the roof at Aetherion's water surface.
  function flockKit(plan) {
    const made = [];
    return { made, flock(mesh, options) {
      const spec = plan[made.length];
      options.groups = options.groups.slice(0, spec.groups);
      if (spec.roof) options.roof = spec.roof;
      const api = BT.flock(mesh, options); api.groups = options.groups; api.mesh = mesh; api.spec = spec;
      mesh.count = api.agents.length;
      for (const a of api.agents) a.s0 = a.s;
      for (const G of api.groups) { G.e = 0; G.sited = false; G.tx = G.x; G.tz = G.z; G.retry = 0; }
      made.push(api); return api;
    } };
  }
  /** Keep each group's home near the player in the right habitat; fade a group out before it has to jump. */
  function steerFlock(api, dt, k) {
    const { far, jump, glide, pick, height } = api.spec;
    api.groups.forEach((G, gi) => {
      if ((!G.sited || Math.hypot(G.tx - P.x, G.tz - P.z) > far) && (G.retry -= dt) <= 0) {
        const site = pick(gi); if (site) { G.tx = site[0]; G.tz = site[1]; G.sited = true; G.lost = false; } else { G.lost = true; G.retry = 2.5; }
      }
      const dx = G.tx - G.x, dz = G.tz - G.z, d = Math.hypot(dx, dz);
      if (G.lost || !G.sited) G.e = Math.max(0, G.e - dt * 1.5);
      else if (d > jump) {
        G.e = Math.max(0, G.e - dt * 1.5);
        if (G.e === 0) { const y = height(G.tx, G.tz); for (const i of G.m) { const a = api.agents[i]; a.x += dx; a.z += dz; a.y += y - G.y; } G.x = G.tx; G.z = G.tz; G.y = y; }
      } else {
        if (d > .01) { const step = Math.min(d, glide * dt); G.x += dx / d * step; G.z += dz / d * step; }
        G.y = height(G.x, G.z); G.e = Math.min(1, G.e + dt * .6);
      }
      const s = smooth(G.e) * k; for (const i of G.m) { const a = api.agents[i]; a.s = Math.max(1e-4, a.s0 * s); }
    });
  }
  const islands = (n) => [...Array(n)].map(() => ({ x: P.x, y: 0, z: P.z, h: 0, r: 70 }));
  const airSite = (min, max, ok = inWorld) => () => pickSite(rand, P.x, P.z, min, max, ok);
  const overGround = (alt) => (x, z) => Math.max(H(x, z), waterAt(x, z)) + alt;
  function flockSet(build, plan) {
    const group = new THREE.Group(), kit = flockKit(plan); build(group, kit); viewer(null);
    return { group, flocks: kit.made, update(dt, k) { viewer(null); for (const api of kit.made) { steerFlock(api, dt, k); api.update(dt, env); } },
      sleep() { for (const api of kit.made) for (const G of api.groups) { G.sited = false; G.e = 0; G.retry = 0; } } };
  }

  const builders = {
    // Sea: gulls over the shore, fish schools in the water beside it.
    sea() {
      const groups = { low: [2, 1], medium: [3, 3], high: [5, 5] }[quality];
      const coastal = (x, z) => inWorld(x, z) && heightAt(x, z) < waterAt(x, z) + 30;
      const swim = (x, z) => inWorld(x, z) && heightAt(x, z) < waterAt(x, z) - 1.6;
      return flockSet((group, k) => {
        const out = BT.seaWildlife({ k, isl: islands(5), heightAt: H, group, R: BT.rng(2143) });
        // Aetherion's water is nearly opaque: a little self-light lets the school read from the bank.
        out.fishM.material.emissive = new THREE.Color(.5, .62, .66); out.fishM.material.emissiveIntensity = .55;
      }, [
        { groups: groups[0], far: 240, jump: 330, glide: 24, height: overGround(34), pick: () => pickSite(rand, P.x, P.z, 50, 170, coastal) ?? pickSite(rand, P.x, P.z, 50, 170, inWorld) },
        // Fish swim just under the surface, in the nearest water at least a body deep; no water nearby, no school.
        { groups: groups[1], far: 130, jump: 10, glide: 2, roof: (x, z) => waterAt(x, z) - .22, height: (x, z) => waterAt(x, z) - .75,
          pick: () => { let best = null, depth = 1e9; for (let i = 0; i < 14; i++) { const s = pickSite(rand, P.x, P.z, 14, 120, swim, 1); if (s) { const d = waterAt(s[0], s[1]) - heightAt(s[0], s[1]); if (d < depth) { depth = d; best = s; } } } return best; } },
      ]);
    },
    arcticPetrels() {
      const coastal = (x, z) => inWorld(x, z) && heightAt(x, z) < waterAt(x, z) + 45;
      return flockSet((group, k) => BT.arcticPetrels({ k, isl: islands(4), heightAt: H, group }),
        [{ groups: { low: 2, medium: 3, high: 4 }[quality], far: 250, jump: 340, glide: 26, height: overGround(30), pick: () => pickSite(rand, P.x, P.z, 60, 180, coastal) ?? pickSite(rand, P.x, P.z, 60, 180, inWorld) }]);
    },
    havenDoves() {
      return flockSet((group, k) => BT.havenDoves({ k, isl: islands(4), heightAt: H, group }),
        [{ groups: { low: 3, medium: 4, high: 6 }[quality], far: 230, jump: 320, glide: 20, height: overGround(30), pick: airSite(40, 150) }]);
    },
    forestRooks() {
      // The source flock keeps 45 m over the ground; the canopy here is lower, so the birds stay within sight above it.
      return flockSet((group, k) => BT.forestRooks({ k, CZ: 0, heightAt: H, group }),
        [{ groups: { low: 1, medium: 2, high: 2 }[quality], far: 260, jump: 340, glide: 22, height: overGround(60), pick: airSite(40, 160) }]);
    },

    // Whale skeleton: one fixed spot in the glacial realm. Its coast is cliff, with no beach to lie on, so the bones
    // rest on the lowest level ground within 120 m of the sea, found once by walking outward from the realm centre.
    arcticBones() {
      const frame = new THREE.Group(), centre = OATHS.find((o) => o.biome === 'glacial').center;
      const nearSea = (x, z) => { for (let k = 0; k < 8; k++) for (const r of [60, 120]) if (heightAt(x + Math.cos(k * TAU / 8) * r, z + Math.sin(k * TAU / 8) * r) < SEA_LEVEL) return true; return false; };
      let site = null, low = Infinity;
      for (let i = 0; i < 2600; i++) { const d = 190 + i * .25, a = i * 2.399963, x = centre[0] + Math.cos(a) * d, z = centre[1] + Math.sin(a) * d, h = heightAt(x, z); if (h < low && regionAt(x, z).biome === 'glacial' && landOk(x, z, 2.2) && nearSea(x, z)) { site = [x, z]; low = h; } }
      if (!site) throw new Error('no level ground by the sea for the whale skeleton');
      frame.position.set(site[0] - 228, 0, site[1] + 196);
      BT.arcticWhaleBones({ boneMat: BT.arcticBoneMat({ tex: { ground: null } }).boneMat, heightAt: (x, z) => heightAt(x + frame.position.x, z + frame.position.z), group: frame });
      const bones = setBase(frame.children[0]); bones.castShadow = shadows;
      return { group: frame, site, update(dt, k) { scaleObject(bones, k); } };
    },
    // Whale (from the Underwater world): it cruises the source's 240 m circle in open water off the glacial coast,
    // lifted so that the top of its slow rise and fall brings its back through the surface.
    deepWhale() {
      const open = (x, z) => inWorld(x, z) && heightAt(x, z) < SEA_LEVEL - 5;
      const lane = (x, z) => { if (!open(x, z)) return false; for (let i = 0; i < 12; i++) if (!open(x + Math.cos(i * TAU / 12) * 240, z + Math.sin(i * TAU / 12) * 240)) return false; return true; };
      const frame = siteFrame([0, 0], 760, () => pickSite(rand, P.x, P.z, 250, 560, lane, 36));
      frame.position.y = SEA_LEVEL + 29.6;
      const { whale } = BT.deepWhale({ group: frame }); setBase(whale);
      return { group: frame, whale, update(dt, k) { const e = frame.userData.step(dt, P); BT.deepWhaleUpdate({ whale, KX: -60, KZ: 60, t: time }); scaleObject(whale, e * k); whale.visible = e * k > .01; },
        sleep() { frame.userData.unseat(); } };
    },

    // Taiga: caribou graze one site, a moose stands at the water's edge, ravens circle overhead.
    taiga() {
      const group = new THREE.Group(), ravens = leashFrame(120), caribou = siteFrame([-120, -1480], 430, () => pickSite(rand, P.x, P.z, 55, 190, (x, z) => landOk(x, z, 6), 40));
      const shore = (x, z) => { if (!landOk(x, z, 6) || heightAt(x, z) > waterAt(x, z) + 4) return false; for (let i = 0; i < 6; i++) if (heightAt(x + Math.cos(i) * 22, z + Math.sin(i) * 22) < waterAt(x, z)) return true; return false; };
      const mooseFrame = siteFrame([28, -236], 480, () => pickSite(rand, P.x, P.z, 60, 320, shore, 60) ?? pickSite(rand, P.x, P.z, 70, 200, (x, z) => landOk(x, z, 6), 30),
        (site) => { out.moose.position.y = heightAt(site[0], site[1]) - .05; out.moose.rotation.y = rand() * TAU; });
      const out = BT.taigaWildlife({ R: BT.rng(4099), group: new THREE.Group(), meshH: localHeight(caribou), ICE_Y: -1e9 });
      const n = { low: [4, 7], medium: [6, 11], high: [9, 12] }[quality];
      out.cari.length = n[0]; out.ravD.length = n[1]; out.ravM.count = n[1];
      for (const c of out.cari) { caribou.add(setBase(c.m)); c.m.castShadow = shadows; }
      mooseFrame.add(setBase(out.moose)); out.moose.castShadow = shadows; ravens.add(out.ravM);
      fitOrbits(out.ravD, [{ spread: 150, radMax: 90, alt: [26, 62] }]);
      const settle = orbitGround(out.ravD, ravens);
      group.add(ravens, caribou, mooseFrame);
      const ahead = new THREE.Vector3();
      return { group, out, update(dt, k) {
        const eC = caribou.userData.step(dt, P) * k, eM = mooseFrame.userData.step(dt, P) * k;
        settle(dt, ravens.userData.follow(P));
        // Caribou walk on for ever in the source's open tundra: turn them back toward their site before water, cities or steep ground.
        for (const c of out.cari) {
          const m = c.m; ahead.set(0, 0, 9).applyEuler(m.rotation).add(m.position);
          const wx = ahead.x + caribou.position.x, wz = ahead.z + caribou.position.z, home = Math.hypot(m.position.x + 120, m.position.z + 1480);
          if (home > 75 || !landOk(wx, wz, 7)) { const want = Math.atan2(-120 - m.position.x, -1480 - m.position.z); let d = want - m.rotation.y; d -= Math.round(d / TAU) * TAU; m.rotation.y += clamp(d, -1, 1) * dt * .9; }
        }
        BT.taigaWildlifeUpdate({ ...out, meshH: localHeight(caribou), dt, t: time });
        for (const c of out.cari) scaleObject(c.m, eC); scaleObject(out.moose, eM); scaleInstances(out.ravM, k);
      }, sleep() { caribou.userData.unseat(); mooseFrame.userData.unseat(); ravens.userData.sited = false; } };
    },

    // Savanna: herds graze, startle at the player, flee and regroup; vultures ride a thermal.
    savanna(vulturesOnly = false) {
      const group = new THREE.Group(), plain = new THREE.Group(), thermal = leashFrame(150);
      // The source keeps fleeing herds within 950 m of its world centre (0, -250): put that point on the realm centre.
      const centre = regionAt(P.x, P.z).center; plain.position.set(centre[0], 0, centre[1] + 250);
      const out = BT.savannaWildlife({ R: BT.rng(4784), group: plain });
      const keep = vulturesOnly ? [] : { low: [0, 1, 3], medium: [0, 1, 2, 3], high: [0, 1, 2, 3, 4, 5] }[quality];
      out.herds.splice(0).forEach((herd, i) => { if (keep.includes(i)) out.herds.push(herd); else { plain.remove(herd.mesh); herd.mesh.geometry.dispose(); herd.mesh.material.dispose(); herd.mesh.dispose(); } });
      for (const herd of out.herds) { herd.e = 0; herd.sited = false; herd.retry = 0; herd.mesh.castShadow = shadows; herd.mesh.receiveShadow = false; }
      const vultures = share(vulturesOnly ? 'thermalVultures' : 'savanna') - out.herds.reduce((sum, herd) => sum + herd.members.length, 0);
      out.vultD.length = vultures; out.vultM.count = vultures; thermal.add(out.vultM);
      fitOrbits(out.vultD, [{ spread: 60, radMax: 90, alt: [60, 130] }]);
      const settle = orbitGround(out.vultD, thermal), ground = localHeight(plain);
      group.add(plain, thermal);
      const bad = (lx, lz) => !landOk(lx + plain.position.x, lz + plain.position.z, 9);
      function seat(herd, dt) {
        const wx = herd.cx + plain.position.x, wz = herd.cz + plain.position.z;
        const lost = !herd.sited || Math.hypot(P.x - wx, P.z - wz) > 430;
        if (!lost) { herd.e = Math.min(1, herd.e + dt / 2); return; }
        herd.e = Math.max(0, herd.e - dt / 1.2); if (herd.e > 0 || (herd.retry -= dt) > 0) return;
        const apart = (x, z) => landOk(x, z, 4.5) && out.herds.every((other) => other === herd || !other.sited || Math.hypot(other.cx + plain.position.x - x, other.cz + plain.position.z - z) > 55);
        const site = pickSite(rand, P.x, P.z, 70, 230, apart, 30); if (!site) { herd.retry = 2; return; }
        const dx = site[0] - wx, dz = site[1] - wz; herd.cx += dx; herd.cz += dz; for (const m of herd.members) { m.x += dx; m.z += dz; }
        herd.state = 'graze'; herd.sited = true;
      }
      return { group, out, update(dt, k) {
        for (const herd of out.herds) {
          seat(herd, dt);
          // Keep a running or drifting herd off water, cliffs and city streets: veer to whichever side is clear.
          if (herd.state === 'flee') { if (bad(herd.cx + herd.fx * 26, herd.cz + herd.fz * 26)) { const left = !bad(herd.cx - herd.fz * 26, herd.cz + herd.fx * 26), s = left ? 1 : -1, c = Math.cos(dt * 2.4 * s), n = Math.sin(dt * 2.4 * s), fx = herd.fx * c - herd.fz * n; herd.fz = herd.fx * n + herd.fz * c; herd.fx = fx; } }
          else if (bad(herd.cx + Math.sin(herd.hd) * 14, herd.cz + Math.cos(herd.hd) * 14)) herd.hd += dt * .8;
        }
        viewer(plain);
        // conceal: the source hides a viewer in tall grass. Aetherion's cover is knee high, so the player is half hidden at best.
        if (out.herds.length) BT.savannaHerdsUpdate({ herds: out.herds, heightAt: ground, conceal: .55, flee: out.flee, savannaPools: [], R: rand, dm: out.dm, dt, t: time });
        for (const herd of out.herds) { const e = smooth(herd.e) * k; scaleInstances(herd.mesh, e); herd.mesh.visible = e > .01; }
        settle(dt, thermal.userData.follow(P));
        BT.savannaVulturesUpdate({ vultD: out.vultD, vultM: out.vultM, dm: out.dm, t: time }); scaleInstances(out.vultM, k);
      }, sleep() { for (const herd of out.herds) { herd.sited = false; herd.e = 0; } thermal.userData.sited = false; } };
    },
    thermalVultures() { return builders.savanna(true); },

    canyonBirds() {
      const frame = leashFrame(110), out = BT.canyonBirds({ R: BT.rng(5227), rx: () => 0, group: frame });
      // Rows 0-5 are condors, the rest ravens; lower tiers keep the condors and thin the ravens.
      out.birdD.length = share('canyonBirds'); out.birdM.count = out.birdD.length;
      fitOrbits(out.birdD, [{ from: 0, to: 6, spread: 200, radMax: 170, alt: [95, 170] }, { from: 6, spread: 150, radMax: 70, alt: [30, 85] }]);
      const settle = orbitGround(out.birdD, frame);
      return { group: frame, out, update(dt, k) { settle(dt, frame.userData.follow(P)); BT.canyonBirdsUpdate({ ...out, env }); scaleInstances(out.birdM, k); }, sleep() { frame.userData.sited = false; } };
    },
    alpineBirds() {
      const frame = leashFrame(90), out = BT.alpineBirds({ R: BT.rng(5701), vx: () => 0, T: { xW: 0, yt: 0 }, zc: 0, group: frame }), dm = new THREE.Object3D();
      out.birdD.length = share('alpineBirds'); out.birdM.count = out.birdD.length;
      fitOrbits(out.birdD, [{ from: 0, to: 2, spread: 90, radMax: 240, alt: [120, 170] }, { from: 2, spread: 45, radMax: 60, alt: [14, 46] }]);
      const settle = orbitGround(out.birdD, frame);
      return { group: frame, out, update(dt, k) { settle(dt, frame.userData.follow(P)); BT.alpineBirdsUpdate({ ...out, dm, t: time }); scaleInstances(out.birdM, k); }, sleep() { frame.userData.sited = false; } };
    },
    villageBirds(rooksOnly = false) {
      const frame = leashFrame(100), out = BT.villageBirds({ R: BT.rng(8685), group: frame }), dm = new THREE.Object3D();
      // Rows 0-13 are rooks about a tower, the rest swallows low over the fields.
      out.birdD.length = share(rooksOnly ? 'townRooks' : 'villageBirds'); out.birds.count = out.birdD.length;
      fitOrbits(out.birdD, [{ from: 0, to: 14, spread: 0, radMax: 44, alt: [24, 38] }, { from: 14, spread: 110, radMax: 42, alt: [4, 10] }]);
      const settle = orbitGround(out.birdD, frame);
      // The lifted update adds heightAt(orbit centre) to each bird; the ground is already in each bird's height here.
      return { group: frame, out, update(dt, k) { settle(dt, frame.userData.follow(P)); BT.villageBirdsUpdate({ ...out, dm, heightAt: () => 0, t: time }); scaleInstances(out.birds, k); }, sleep() { frame.userData.sited = false; } };
    },
    townRooks() { return builders.villageBirds(true); },
    // Sheep and cattle graze the source's two pens, set down as one open pasture on level ground.
    villageLivestock() {
      const pens = BT.VIL_PENS.filter((pen) => pen.kind !== 'pig').map((pen) => ({ ...pen }));
      const level = (x, z) => { if (!landOk(x, z, 3.2)) return false; const h = heightAt(x, z); for (const [ox, oz] of [[45, 0], [-45, 0], [0, 60], [0, -60]]) if (!landOk(x + ox, z + oz, 4.5) || Math.abs(heightAt(x + ox, z + oz) - h) > 9) return false; return true; };
      const frame = siteFrame([176, -236], 440, () => pickSite(rand, P.x, P.z, 75, 210, level, 40));
      const out = BT.villageLivestock({ VIL_PENS: pens, R: BT.rng(8959), group: frame }), dm = new THREE.Object3D(), ground = localHeight(frame);
      const n = { low: [10, 5, 5], medium: [16, 7, 7], high: [22, 9, 9] }[quality];
      out.herds.forEach((herd, i) => { herd.members.length = n[i]; herd.mesh.count = n[i]; herd.mesh.castShadow = shadows; herd.mesh.receiveShadow = false; });
      return { group: frame, out, update(dt, k) { const e = frame.userData.step(dt, P) * k; BT.villageLivestockUpdate({ herds: out.herds, heightAt: ground, R: rand, dm, dt }); for (const herd of out.herds) { scaleInstances(herd.mesh, e); herd.mesh.visible = e > .01; } },
        sleep() { frame.userData.unseat(); } };
    },

    // Ruins: macaws wheel overhead by day; at dusk the same flock turns to bats pouring off a summit.
    ruinsBirds() {
      const frame = leashFrame(90), out = BT.ruinsBirds({ R: BT.rng(9350), group: frame }), state = { birdMode: -1 };
      out.BD.length = share('ruinsBirds'); out.birdM.count = out.BD.length;
      for (const g of out.BD) { g.cz += 380; g.cx *= .75; g.cz *= .75; g.rad = 22 + (g.rad - 30) * .55; g.h = 4 + (g.h - 30) * .8; }
      let top = null;
      return { group: frame, out, update(dt, k) {
        const snapped = frame.userData.follow(P), want = circleTopCoarse(frame.position.x, frame.position.z, 95);
        top = top == null || snapped ? want : top + (want - top) * Math.min(1, dt * .6); frame.position.y = top;
        BT.ruinsBirdsUpdate({ birdM: out.birdM, BD: out.BD, pyrTop: 26, PZ: 0, PY: 0, env, t: time, state }); scaleInstances(out.birdM, k);
      }, sleep() { frame.userData.sited = false; } };
    },
    // Bats (from the Caverns world): under ground by day, spiralling up at dusk, wheeling low at night.
    cavernBats() {
      const frame = leashFrame(70), out = BT.cavernBats({ R: BT.rng(7539), bil: () => -30, RF: null, fl: () => 0, group: frame }), state = { batScare: 0 }, dm = new THREE.Object3D();
      out.bats.length = share('cavernBats'); out.batM.count = out.bats.length;
      let top = null;
      return { group: frame, out, update(dt, k) {
        const snapped = frame.userData.follow(P), want = circleTopCoarse(frame.position.x, frame.position.z, 50);
        top = top == null || snapped ? want : top + (want - top) * Math.min(1, dt * .6); frame.position.y = top;
        viewer(frame);
        BT.cavernBatsUpdate({ bats: out.bats, batM: out.batM, dm, hallY: out.hallY, S0: { x: 0, z: 0, R: 22 }, CAVE_SURF: 95, env, dt, t: time, state });
        out.batM.visible = out.bats.some((bat) => bat.f > .02); scaleInstances(out.batM, k);
      }, sleep() { frame.userData.sited = false; } };
    },

    // Marsh: herons and egrets in the shallows, dragonflies by day, fireflies and will-o'-wisps by night.
    marsh() {
      const st = { wl: 0, spd: 0, heronMsg: 0 }, dm = new THREE.Object3D();
      let out = null;
      // Heights are measured from the water surface, as in the source; city ground reads as too high for any of them.
      const ground = (x, z) => { const wx = x + frame.position.x, wz = z + frame.position.z; return inCity(wx, wz, 10) || !inWorld(wx, wz) ? 60 : heightAt(wx, wz) - frame.position.y; };
      const wade = (x, z) => { const wx = x + frame.position.x, wz = z + frame.position.z; return inCity(wx, wz, 10) ? 60 : H(wx, wz) - frame.position.y; };
      function rebuild(site) {
        if (out) clear(frame);
        frame.position.y = waterAt(site[0], site[1]);
        out = BT.marshWildlife({ R: BT.rng(6213 + Math.round(site[0] + site[1])), group: frame, ground, deckDist: () => 99 });
        out.dfD.length = { low: 12, medium: 20, high: 28 }[quality]; out.dfM.count = out.dfD.length;
        out.herons.length = { low: 5, medium: 7, high: 7 }[quality]; frame.children.filter((child) => child.isGroup).forEach((heron, i) => { if (i >= out.herons.length) frame.remove(heron); else { setBase(heron); heron.children[0].castShadow = shadows; } });
        out.wisps.length = 6;
        out.ff.geometry.setDrawRange(0, Math.min(out.ff.geometry.drawRange.count, POINT_CAPS[quality]));
        out.ff.frustumCulled = false; passive(frame);
      }
      // Source layout: fireflies fill 700 m about (0, -250), herons start within 170 m of (0, -40) and (60, -260).
      const frame = siteFrame([0, -150], 300, () => [P.x, P.z], rebuild);
      return { group: frame, get out() { return out; }, update(dt, k) {
        const e = frame.userData.step(dt, P) * k; if (!out) return;
        viewer(frame); st.spd = P.speed;
        BT.marshWildlifeUpdate({ ...out, st, fi: { mode: 'wade' }, meshH: wade, marshAddRip() {}, splash() {}, R: rand, dm, rk: 0, SURF: { temp: 18 }, env, dt, t: time });
        for (const heron of out.herons) scaleObject(heron.g, e);
        scaleInstances(out.dfM, e); out.ff.material.opacity *= e; out.ff.visible = out.ff.material.opacity > .01;
        for (const wisp of out.wisps) wisp.sp.material.opacity *= e;
      }, sleep() { frame.userData.unseat(); } };
    },
  };
  /** Highest ground within `r` metres, from nine cached samples: the floor under a column of bats or macaws. */
  function circleTopCoarse(x, z, r) { let top = Math.max(H(x, z), waterAt(x, z)); for (let i = 0; i < 8; i++) top = Math.max(top, H(x + Math.cos(i * TAU / 8) * r, z + Math.sin(i * TAU / 8) * r)); return top; }
  /** Scenery: never hit by a ray (targeting, picking), never culled away while its instances move. */
  function passive(object) { object.traverse((node) => { node.raycast = () => {}; node.userData.ambientCreature = true; if (node.isInstancedMesh) node.frustumCulled = false; }); }
  function clear(object) {
    object.traverse((node) => { if (node === object) return; node.geometry?.dispose(); for (const material of [].concat(node.material ?? [])) material.dispose(); if (node.isInstancedMesh) node.dispose(); });
    object.clear();
  }

  function wake(id) {
    if (failed.has(id) || (CREATURE_SETS[id].needsCanvas && typeof document === 'undefined')) return null;
    try { const set = builders[id](); set.id = id; set.e = 0; passive(set.group); root.add(set.group); live.set(id, set); return set; }
    catch (error) { failed.add(id); console.warn(`[creatures] ${id} could not be built:`, error); return null; }
  }

  function update(dt, position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    dt = clamp(dt || 0, 0, .1);
    const moved = Math.hypot(position.x - P.x, position.z - P.z);
    P.speed = dt > 0 && moved < 60 ? lerp(P.speed, moved / dt, Math.min(1, dt * 4)) : 0;
    P.x = position.x; P.z = position.z; P.y = Number.isFinite(position.y) ? position.y : heightAt(P.x, P.z);
    time += dt; env.time = time; BT.WIND.value.x = time;
    const hour = ctx.render?.timeOfDay ?? 14, sunY = Math.sin((hour - 6) / 24 * TAU);
    env.sunDir.y = sunY; env.day = THREE.MathUtils.smoothstep(sunY, -.16, .32); env.night = 1 - env.day;
    lastBiome = regionAt(P.x, P.z).biome;
    const wanted = REALM_LIFE[lastBiome]?.sets ?? [];
    // Build at most one missing set per frame, so crossing a border never stalls.
    for (const id of wanted) if (!live.has(id) && !failed.has(id)) { wake(id); break; }
    for (const set of live.values()) {
      const on = wanted.includes(set.id);
      set.e = clamp(set.e + (on ? dt / 2.2 : -dt / 1.6), 0, 1);
      if (set.e <= 0 && !on) { if (set.group.visible) { set.group.visible = false; set.sleep?.(); } continue; }
      set.group.visible = true;
      set.update(dt, smooth(set.e));
    }
  }
  function dispose() {
    for (const set of live.values()) clear(set.group);
    live.clear(); ctx.scene?.remove(root); BT.FLOCKS.length = 0; BT.OWNED.length = 0; heights.clear();
    if (ctx.creatures === api) delete ctx.creatures;
  }
  /** What is alive right now (for tests and capture scripts). */
  function stats() {
    const sets = [...live.values()].filter((set) => set.group.visible).map((set) => ({ id: set.id, ease: set.e, animals: countAnimals(set.group) }));
    return { quality, biome: lastBiome, sets, animals: sets.reduce((sum, set) => sum + set.animals, 0), failed: [...failed] };
  }
  const api = { update, dispose, stats, root, live, env, get viewer() { return P; } };
  ctx.creatures = api;
  return api;
}

/** Animals drawn under an object: instances of instanced meshes, plus single-bodied ones (heron, caribou, moose, whale, wisp). */
export function countAnimals(object) {
  if (!object.visible) return 0;
  let n = object.isInstancedMesh ? object.count : object.isSprite || object.userData.baseScale !== undefined ? 1 : 0;
  for (const child of object.children) n += countAnimals(child);
  return n;
}
