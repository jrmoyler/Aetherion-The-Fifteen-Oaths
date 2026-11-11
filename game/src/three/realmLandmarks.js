// Biome Triad's built and geological scene objects, stood on Aetherion's terrain.
//
// Geometry, textures and materials come verbatim from biome-landmarks.generated.js (tools/extract-biome-landmarks.mjs).
// This adapter only decides where they go: a handful of strong landmarks per realm, chosen by a seeded search of
// the shared heightfield, so every client and every run plans the same things in the same places.
//
//   planRealm(oathId)   pure and cheap: where each landmark stands and which footprints are solid. No meshes.
//   createRealmLandmarks(ctx)   as the player nears a realm: makes its footprints solid in ctx.collision, builds its
//                               meshes a step a frame, and hides them again when the player is far away.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, MARSH_LEVEL, SEA_LEVEL } from '@shared/terrain.js';
import { OATHS, OATH_BY_ID, ROUTES, SANCTUARY, regionAt } from '@shared/oaths.js';
import * as BT from './biome-landmarks.generated.js';
import { REALM_WORLD } from './realmAir.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// --- the ground rules ----------------------------------------------------------------------------------------
const CENTRES = OATHS.map((oath) => oath.center);
const ROADS = ROUTES.map(([a, b]) => [...OATH_BY_ID[a].center, ...OATH_BY_ID[b].center]);
const MARSH = OATH_BY_ID['oath-08'].center;
/** Clear ground kept between a landmark's footprint and a city ring, and between it and a road's centreline. */
export const CITY_MARGIN = 25, ROAD_MARGIN = 30;
export const waterLevelAt = (x, z) => (Math.hypot(x - MARSH[0], z - MARSH[1]) < 630 ? MARSH_LEVEL : SEA_LEVEL);
export function cityDistance(x, z) { let best = 1e9; for (const c of CENTRES) best = Math.min(best, Math.hypot(x - c[0], z - c[1])); return best; }
export function roadDistance(x, z) {
  let best = 1e9;
  for (const [ax, az, bx, bz] of ROADS) { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz))); best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t)); }
  return best;
}
/** True when a footprint of radius r at (x, z) touches neither a city ring nor a road. */
export const clearOf = (x, z, r = 0) => cityDistance(x, z) > SANCTUARY.cityRadius + CITY_MARGIN + r && roadDistance(x, z) > ROAD_MARGIN + r;
/** Lowest, highest and mean ground under a disc. */
function relief(x, z, r) {
  let min = heightAt(x, z), max = min, sum = min, n = 1;
  for (const k of [1, .5]) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + k, h = heightAt(x + Math.cos(a) * r * k, z + Math.sin(a) * r * k); min = Math.min(min, h); max = Math.max(max, h); sum += h; n++; }
  return { min, max, mean: sum / n, span: max - min };
}
/** Downhill direction and steepness (rise over run) at a point, measured over `e` metres. */
function fall(x, z, e = 6) {
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e), steep = Math.hypot(gx, gz);
  return { dx: steep ? -gx / steep : 1, dz: steep ? -gz / steep : 0, steep };
}
/** three.js yaw that turns local +Z to face the world direction (dx, dz). */
const yawTo = (dx, dz) => Math.atan2(dx, dz);
/** World position of a point given in an object's local frame (three.js yaw `ry`). */
const local = (x, z, ry, lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];

// --- planning ------------------------------------------------------------------------------------------------
/** One realm's plan under construction: items to draw, solids to collide with, and the sites already taken. */
class Plan {
  constructor(oath) { this.id = oath.id; this.biome = oath.biome; this.world = REALM_WORLD[oath.biome]; this.center = oath.center; this.items = []; this.solids = []; this.taken = []; this.notes = []; this.R = BT.rng(7919 + OATHS.indexOf(oath) * 104729); }
  /**
   * Seeded search around the city for the best spot. `want(x, z, h)` scores a candidate or returns null to refuse it.
   * Every candidate is clear of city rings, roads and earlier landmarks by its footprint radius `r`.
   */
  find({ min = 200, max = 520, r = 4, tries = 140, gap = 6, water = false, own = true }, want = () => 0) {
    let best = null;
    for (let i = 0; i < tries; i++) {
      const a = this.R() * TAU, d = Math.sqrt(lerp(min * min, max * max, this.R())), x = this.center[0] + Math.cos(a) * d, z = this.center[1] + Math.sin(a) * d;
      if (own && regionAt(x, z).id !== this.id) continue;
      if (!clearOf(x, z, r) || this.taken.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + r + gap)) continue;
      const h = heightAt(x, z), wet = h < waterLevelAt(x, z) + .6;
      if (wet !== water) continue;
      const score = want(x, z, h);
      if (score == null || Number.isNaN(score)) continue;
      if (!best || score > best.score) best = { x, z, h, score };
    }
    return best;
  }
  claim(x, z, r) { this.taken.push({ x, z, r }); }
  /** Record a drawn thing. `floats` marks things meant to sit in or on water. */
  put(kind, x, y, z, o = {}) { const item = { kind, variant: 0, x, y, z, ry: 0, rx: 0, rz: 0, s: [1, 1, 1], r: 2, ...o }; this.items.push(item); return item; }
  circle(x, z, r, y0, y1, walkable = false) { this.solids.push({ type: 'circle', x, z, r, y0, y1, walkable }); }
  box(x, z, hw, hd, ry, y0, y1, walkable = false) { this.solids.push({ type: 'box', x, z, hw, hd, ry, y0, y1, walkable }); }
  /** Walkable slope: a box footprint whose top runs from y0 at local -Z to y1 at local +Z. */
  ramp(x, z, hw, hd, ry, y0, y1) { this.solids.push({ type: 'ramp', x, z, hw, hd, ry, y0, y1, walkable: true }); }
}

// Flat-topped strata slab that reads as a rock ledge, and a tall buttress: Biome Triad's volcano wall crags.
// The slab's top is level, so it is registered as a platform: walk onto it from the uphill side, a wall from below.
function ledge(plan, x, z, s, tint) {
  const R = plan.R, f = fall(x, z, 8), sl = Math.min(1, f.steep), h = heightAt(x, z), k = 1 + R() * .4;
  // Sunk into the slope as the source sinks it, long axis along the contour: flush uphill, a rock step downhill.
  const sx = s * (.8 + R() * .5), sy = s * (.6 + R() * .6), sz = s * (.8 + R() * .5), y = h - s * (.45 + .6 * sl), top = y + .3 * sy, ry = Math.atan2(-f.dx, -f.dz) + (R() - .5) * .5;
  plan.put('ledge', x, y, z, { ry, rx: (R() - .5) * .06, rz: (R() - .5) * .06, s: [sx, sy, sz], r: .9 * Math.max(sx, sz), tint: tint ?? [k, k, k], top });
  plan.circle(x, z, .5 * Math.min(.85 * sx, .63 * sz), top - sy * .55, top, true);
  plan.claim(x, z, .9 * Math.max(sx, sz));
}
function buttress(plan, x, z, s, tint) {
  const R = plan.R, h = heightAt(x, z), k = 1 + R() * .4, sx = s * (.8 + R() * .4), sy = s * (.9 + R() * .5), sz = s * (.8 + R() * .4);
  plan.put('buttress', x, h - sy * .3, z, { variant: 1, ry: R() * TAU, s: [sx, sy, sz], r: .6 * Math.max(sx, sz), tint: tint ?? [k, k, k] });
  plan.circle(x, z, .42 * Math.min(sx, sz), h - sy * .5, h + sy * .8);
  plan.claim(x, z, .6 * Math.max(sx, sz));
}
/** A trapper's cabin on the flattest ground the search finds; its door (local +Z in the source) looks downhill. */
function cabin(plan, kind, opts, floor = 3) {
  const site = plan.find({ r: 7, ...opts }, (x, z, h) => { const g = relief(x, z, 5); return g.span < 1.6 && h > floor ? -g.span : null; });
  if (!site) return plan.notes.push(`no level ground for the ${kind}`) && null;
  const f = fall(site.x, site.z, 6), g = relief(site.x, site.z, 4.5), ry = yawTo(f.dx, f.dz);
  plan.put(kind, site.x, g.min - .15, site.z, { ry, r: 5 });
  plan.box(site.x, site.z, 3.6, 3.0, ry, g.min - 1, g.min + 6.4);
  plan.claim(site.x, site.z, 7);
  return site;
}
/** A span between two banks with a drop under it: returns the two ends, or null when the realm has no such gap. */
function findSpan(plan, { min, max, lengths, drop, level = 2.5, tries = 2400 }) {
  let best = null;
  for (let i = 0; i < tries; i++) {
    const a = plan.R() * TAU, d = lerp(min, max, plan.R()), x = plan.center[0] + Math.cos(a) * d, z = plan.center[1] + Math.sin(a) * d, dir = plan.R() * TAU, L = lerp(lengths[0], lengths[1], plan.R());
    if (regionAt(x, z).id !== plan.id || !clearOf(x, z, L / 2 + 8)) continue;
    const ux = Math.cos(dir), uz = Math.sin(dir), ax = x - ux * L / 2, az = z - uz * L / 2, bx = x + ux * L / 2, bz = z + uz * L / 2, ya = heightAt(ax, az), yb = heightAt(bx, bz);
    if (Math.abs(ya - yb) > level || Math.min(ya, yb) < waterLevelAt(x, z) + 1) continue;
    let deepest = 1e9, pokes = false;
    for (let k = 1; k < 10; k++) { const t = k / 10, h = heightAt(lerp(ax, bx, t), lerp(az, bz, t)), chord = lerp(ya, yb, t); deepest = Math.min(deepest, h - chord); if (h > chord - .6 && t > .12 && t < .88) pokes = true; }
    if (pokes || -deepest < drop) continue;
    const score = -deepest - Math.abs(ya - yb);
    if (!best || score > best.score) best = { ax, az, bx, bz, ya, yb, L, ux, uz, score, drop: -deepest };
  }
  return best;
}

const PLANNERS = {
  // Volcano: colonnades of columnar basalt where flows broke from the wall, layered crags, charred snags.
  volcanic(plan) {
    const R = plan.R;
    for (let n = 0; n < 2; n++) {
      const site = plan.find({ r: 26, min: 210, max: 480 }, (x, z, h) => { const f = fall(x, z, 10); return f.steep > .12 && f.steep < .7 && h > 8 ? f.steep : null; });
      if (!site) { plan.notes.push('no slope for a colonnade'); continue; }
      const f = fall(site.x, site.z, 10), ry = yawTo(f.dx, f.dz), s = 1.4 + R() * .8, sy = s * (.8 + R() * .5);
      const foot = Math.min(site.h, heightAt(site.x + f.dx * 6 * s, site.z + f.dz * 6 * s)), [bx, bz] = local(site.x, site.z, ry, 0, -3.2 * s);
      plan.put('colonnade', site.x, foot - 1.5, site.z, { variant: n, ry, s: [s, sy, s], r: 12 * s });
      plan.box(bx, bz, 9.6 * s, 3.9 * s, ry, foot - 4, foot - 1.5 + 11 * sy);
      plan.claim(site.x, site.z, 14 * s);
    }
    for (let n = 0; n < 4; n++) {
      const site = plan.find({ r: 16, min: 190, max: 500 }, (x, z, h) => { const f = fall(x, z, 8); return f.steep > .14 && h > 6 ? f.steep - Math.abs(f.steep - .35) : null; });
      if (!site) continue;
      if (n < 3) ledge(plan, site.x, site.z, 14 + R() * R() * 16); else buttress(plan, site.x, site.z, 9 + R() * 6);
    }
    const grove = plan.find({ r: 30, min: 190, max: 420 }, (x, z) => -relief(x, z, 24).span);
    if (grove) { for (let i = 0; i < 12; i++) { const a = R() * TAU, d = 4 + Math.sqrt(R()) * 26, x = grove.x + Math.cos(a) * d, z = grove.z + Math.sin(a) * d, s = .8 + R() * .6; plan.put('snag', x, heightAt(x, z) - .3, z, { variant: i % 3, ry: R() * TAU, s: [s, s, s], r: 1 }); } plan.claim(grove.x, grove.z, 30); }
  },
  // Arctic: bergs calved into the bay with pack ice round them, seracs on the icefall, inukshuks, a trapper's cabin.
  glacial(plan) {
    const R = plan.R, bergs = [];
    for (let n = 0; n < 5; n++) {
      const big = n < 3, s = big ? 16 + R() * 20 : 4 + R() * R() * 10;
      const site = plan.find({ r: s, min: 260, max: 900, tries: 220, water: true, own: false, gap: 14 }, (x, z, h) => (h < (big ? -7 : -3) ? -Math.hypot(x - plan.center[0], z - plan.center[1]) : null));
      if (!site) { plan.notes.push('no deep water for a berg'); continue; }
      const sy = s * (.8 + R() * .3), kind = (big ? 0 : 2) + (R() < .4 ? 1 : 0);
      plan.put('berg', site.x, -0.22 * sy, site.z, { variant: kind, ry: R() * TAU, s: [s * (.9 + R() * .3), sy, s * (.9 + R() * .3)], r: s, floats: true });
      plan.circle(site.x, site.z, .68 * s, -sy * 1.4, sy * 1.1);
      plan.claim(site.x, site.z, s); bergs.push(site);
    }
    for (const berg of bergs.slice(0, 3)) for (let i = 0; i < 14; i++) {
      const a = R() * TAU, d = 24 + R() * 70, x = berg.x + Math.cos(a) * d, z = berg.z + Math.sin(a) * d, s = 1.2 + R() * R() * 8;
      if (heightAt(x, z) > -2.5 || plan.taken.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + s)) continue;
      plan.put('floe', x, .02, z, { variant: i % 4, ry: R() * TAU, s: [s, .6 + R() * .6, s * (.6 + R() * .6)], r: s, floats: true, detail: true });
    }
    const icefall = plan.find({ r: 40, min: 200, max: 520 }, (x, z, h) => { const f = fall(x, z, 14); return h > 60 && f.steep > .1 && f.steep < .6 ? h * .01 + f.steep : null; });
    if (icefall) {
      const f = fall(icefall.x, icefall.z, 14), across = [-f.dz, f.dx];
      for (let row = 0; row < 3; row++) for (let col = -2; col <= 2; col++) {
        const x = icefall.x + f.dx * (row - 1) * 15 + across[0] * col * 14 + (R() - .5) * 5, z = icefall.z + f.dz * (row - 1) * 15 + across[1] * col * 14 + (R() - .5) * 5, k = .78 + .3 * R();
        const h = lerp(4, 11, smooth(.1, .32, f.steep)) * (.5 + .8 * R()), w = 13 * (.75 + .5 * R()), d = 11 * (.85 + .3 * R());
        if (R() < .25) continue;
        plan.put('serac', x, heightAt(x, z) - h * .25, z, { variant: (R() * 3) | 0, ry: Math.atan2(across[0], across[1]) + Math.PI / 2 + (R() - .5) * .35, rx: -.12 - .2 * R(), rz: (R() - .5) * .2, s: [w, h, d], r: 8, tint: [.74 * k, .88 * k, k] });
        plan.circle(x, z, .32 * Math.min(w, d), heightAt(x, z) - 2, heightAt(x, z) + h * .7);
      }
      plan.claim(icefall.x, icefall.z, 40);
    }
    for (let n = 0; n < 3; n++) {
      const site = plan.find({ r: 4, min: 190, max: 560 }, (x, z, h) => h - relief(x, z, 30).mean);
      if (!site) continue;
      plan.put('inukshuk', site.x, site.h - .2, site.z, { ry: R() * TAU, s: [1.4, 1.4, 1.4], r: 2.2 }); plan.circle(site.x, site.z, 1.1, site.h - 1, site.h + 5); plan.claim(site.x, site.z, 30);
    }
    cabin(plan, 'cabin', { min: 190, max: 420 });
  },
  // Alpine: a rope footbridge over a ravine, a hut, cairns marking the way to it, ice blocks under the snowline.
  alpine(plan) {
    const R = plan.R, span = findSpan(plan, { min: 200, max: 560, lengths: [22, 44], drop: 5 });
    if (span) {
      const ry = Math.atan2(-span.uz, span.ux), sag = Math.min(2.2, span.L * .05);
      plan.put('ropebridge', span.ax, 0, span.az, { ry, r: span.L, L: span.L, ya: span.ya + .12, yb: span.yb + .12, sag, mid: [(span.ax + span.bx) / 2, (span.az + span.bz) / 2] });
      // The deck is walkable: five flat-ish stretches following the sag, 1.5 m wide.
      const N = 6, deck = (t) => lerp(span.ya, span.yb, t) + .15 - sag * Math.sin(Math.PI * t);
      for (let k = 0; k < N; k++) { const t0 = k / N, t1 = (k + 1) / N, tm = (t0 + t1) / 2; plan.ramp(lerp(span.ax, span.bx, tm), lerp(span.az, span.bz, tm), .75, span.L / N / 2 + .05, yawTo(span.ux, span.uz), deck(t0), deck(t1)); }
      plan.claim((span.ax + span.bx) / 2, (span.az + span.bz) / 2, span.L / 2 + 6);
      for (const [x, z, away] of [[span.ax, span.az, -1], [span.bx, span.bz, 1]]) { const cx = x + span.ux * away * 5 - span.uz * 2.2, cz = z + span.uz * away * 5 + span.ux * 2.2; plan.put('cairn', cx, heightAt(cx, cz) - .1, cz, { ry: R() * TAU, s: [1.6, 1.6, 1.6], r: 1.2, tint: [1.2, 1.2, 1.15] }); plan.circle(cx, cz, .8, heightAt(cx, cz) - 1, heightAt(cx, cz) + 3); }
    } else plan.notes.push('no ravine for the rope bridge');
    const hut = cabin(plan, 'cabin', { min: 190, max: 460 }, 60);
    if (hut) for (let i = 1; i <= 3; i++) { const t = i / 4, x = lerp(plan.center[0], hut.x, .45 + t * .5) + (R() - .5) * 14, z = lerp(plan.center[1], hut.z, .45 + t * .5) + (R() - .5) * 14; if (!clearOf(x, z, 2) || heightAt(x, z) < 2) continue; plan.put('cairn', x, heightAt(x, z) - .1, z, { ry: R() * TAU, s: [1.6, 1.6, 1.6], r: 1.2, tint: [1.2, 1.2, 1.15] }); plan.circle(x, z, .8, heightAt(x, z) - 1, heightAt(x, z) + 3); }
    const snow = plan.find({ r: 30, min: 220, max: 560 }, (x, z, h) => (h > 120 && relief(x, z, 20).span < 14 ? h : null));
    if (snow) { for (let i = 0; i < 9; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 28, x = snow.x + Math.cos(a) * d, z = snow.z + Math.sin(a) * d, s = 4 + R() * R() * 9; plan.put('iceblock', x, heightAt(x, z) - s * .25, z, { variant: i % 2, ry: R() * TAU, s: [s * (.8 + R() * .5), s * (.9 + R() * .6), s * (.8 + R() * .5)], r: s, tint: [.7, .84, .95] }); plan.circle(x, z, .6 * s, heightAt(x, z) - 2, heightAt(x, z) + s * .8); } plan.claim(snow.x, snow.z, 34); }
  },
  // Sea: tuff stacks standing off the shore, headland blocks at the tide line, driftwood on the sand.
  coast(plan) {
    const R = plan.R;
    for (let n = 0; n < 6; n++) {
      const w = 4 + R() * 5, H = 14 + R() * 18;
      const site = plan.find({ r: w, min: 200, max: 760, tries: 200, water: true, own: false, gap: 18 }, (x, z, h) => (h < -2.5 && h > -13 ? -Math.hypot(x - plan.center[0], z - plan.center[1]) - (n % 2) * 0 : null));
      if (!site) { plan.notes.push('no shallows for a sea stack'); continue; }
      plan.put('seastack', site.x, site.h + .487 * H - .2, site.z, { variant: (R() * 3) | 0, ry: R() * TAU, s: [w * .9, H * .175, w * (.8 + R() * .4) * .85], r: w, floats: true });
      plan.circle(site.x, site.z, .62 * w, site.h - 1, site.h + H); plan.claim(site.x, site.z, w + 10);
    }
    for (let n = 0; n < 4; n++) {
      const site = plan.find({ r: 9, min: 190, max: 640, tries: 200 }, (x, z, h) => (h > .8 && h < 9 ? -h : null));
      if (!site) continue;
      const s = 5 + R() * 9, sy = s * (.7 + R() * .8), sz = s * (.8 + R() * .5);
      plan.put('headland', site.x, site.h - s * .2, site.z, { variant: (R() * 2) | 0, ry: R() * TAU, s: [s, sy, sz], r: s, tint: [1, 1, 1].fill(.9 + R() * .2) });
      plan.circle(site.x, site.z, .6 * Math.min(s, sz), site.h - 2, site.h + sy * .4); plan.claim(site.x, site.z, s + 4);
    }
    const beach = plan.find({ r: 16, min: 190, max: 600, tries: 200 }, (x, z, h) => (h > 1.2 && h < 4 ? -relief(x, z, 12).span : null));
    if (beach) { for (let i = 0; i < 7; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 15, x = beach.x + Math.cos(a) * d, z = beach.z + Math.sin(a) * d, s = .8 + R() * .7; if (heightAt(x, z) < .8) continue; plan.put('driftwood', x, heightAt(x, z) + .1 * s, z, { ry: R() * TAU, rz: (R() - .5) * .1, s: [s, s, s], r: 2.2 * s, detail: i > 3 }); } plan.claim(beach.x, beach.z, 18); }
  },
  // Canyon: a hoodoo garden, lone spires, an alcove under the wall, and ledges and a buttress from the rock kit in
  // the canyon's own sandstone.
  canyon(plan) {
    const R = plan.R, sandstone = () => { const k = 2.1 + R() * .5; return [k * 1.55, k * .98, k * .7]; };
    const garden = plan.find({ r: 44, min: 210, max: 480 }, (x, z) => -relief(x, z, 36).span);
    if (garden) {
      for (let i = 0; i < 16; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 40, x = garden.x + Math.cos(a) * d, z = garden.z + Math.sin(a) * d, w = 1.8 + R() * 2.4, H = 9 + R() * R() * 24, h = heightAt(x, z);
        if (plan.items.some((it) => it.kind === 'hoodoo' && Math.hypot(it.x - x, it.z - z) < w + it.s[0] + 1.5)) continue;
        plan.put('hoodoo', x, h - .5, z, { variant: (R() * 3) | 0, ry: R() * TAU, s: [w, H, w * (.8 + .4 * R())], r: w }); plan.circle(x, z, .5 * w, h - 1, h + H); }
      plan.claim(garden.x, garden.z, 46);
    }
    const wall = plan.find({ r: 26, min: 200, max: 520, tries: 220 }, (x, z) => { const f = fall(x, z, 12); if (f.steep < .35) return null; const fx = x + f.dx * 16, fz = z + f.dz * 16; return relief(fx, fz, 9).span < 5 && clearOf(fx, fz, 22) ? f.steep : null; });
    if (wall) {
      // The alcove stands at the wall foot, mouth looking out along the fall line; its floor is the ground itself.
      const f = fall(wall.x, wall.z, 12), x = wall.x + f.dx * 12, z = wall.z + f.dz * 12, y0 = relief(x, z, 8).min + .2, A = 16, B = 15, Hh = 17, seed = 1.7;
      plan.put('alcove', x, y0, z, { r: 18, cave: { x, y0, z, A, B, Hh, seed, m: [f.dx, f.dz], l: [-f.dz, f.dx] } });
      // Solid shell everywhere but the mouth (the source's mouth spans +-1.05 rad about the outward axis).
      for (let i = 0; i < 26; i++) { const phi = -Math.PI + (i + .5) / 26 * TAU; if (Math.abs(phi) < 1.12) continue; const a = Math.cos(phi) * A * .89, w = Math.sin(phi) * B * .89; plan.circle(x + f.dx * a - f.dz * w, z + f.dz * a + f.dx * w, 2.4, y0 - 2, y0 + Hh * .8); }
      plan.claim(x, z, 22);
    } else plan.notes.push('no wall foot for the alcove');
    for (let n = 0; n < 4; n++) {
      const site = plan.find({ r: 18, min: 190, max: 520 }, (x, z) => { const f = fall(x, z, 8); return f.steep > .16 ? f.steep - Math.abs(f.steep - .4) : null; });
      if (!site) continue;
      if (n < 3) ledge(plan, site.x, site.z, 13 + R() * 12, sandstone()); else buttress(plan, site.x, site.z, 10 + R() * 6, sandstone());
    }
    for (let n = 0; n < 3; n++) {
      const site = plan.find({ r: 5, min: 200, max: 540 }, (x, z, h) => h - relief(x, z, 40).mean);
      if (!site) continue;
      const w = 3.2 + R(), H = 22 + R() * 11; plan.put('hoodoo', site.x, site.h - .5, site.z, { variant: n, ry: R() * TAU, s: [w, H, w], r: w }); plan.circle(site.x, site.z, .5 * w, site.h - 1, site.h + H); plan.claim(site.x, site.z, 40);
    }
  },
  cliffs(plan) { hamlet(plan, ['a farmhouse', 'a cottage', 'the barn', 'a house'], 2); },
  meadow(plan) { hamlet(plan, ['a house', 'the smithy', 'a cottage', 'a farmhouse', 'a cottage', 'the carpenter\'s yard'], 3); },
  // Forest: the fallen giant, a hollow log to walk through, a log across a gully, old trunks on the floor.
  forest(plan) {
    const R = plan.R;
    const giant = plan.find({ r: 24, min: 200, max: 460 }, (x, z) => -relief(x, z, 20).span);
    if (giant) {
      const L = 40, Rr = 1.9, ry = R() * TAU, dx = Math.cos(ry), dz = -Math.sin(ry), h0 = heightAt(giant.x - dx * L / 2, giant.z - dz * L / 2), h1 = heightAt(giant.x + dx * L / 2, giant.z + dz * L / 2), y = Math.min(h0, h1) - Rr * .35;
      plan.put('giantlog', giant.x, y, giant.z, { ry, rz: Math.atan2(h1 - h0, L), r: 22, L, Rr });
      plan.box(giant.x, giant.z, L / 2 - 1, Rr * .85, ry, y - 1, y + Rr * 1.9); plan.claim(giant.x, giant.z, 26);
    }
    const hollow = plan.find({ r: 9, min: 190, max: 440 }, (x, z) => -relief(x, z, 8).span);
    if (hollow) {
      const L = 14, Rr = 1.75, ry = R() * TAU, dx = Math.cos(ry), dz = -Math.sin(ry), h0 = heightAt(hollow.x - dx * L / 2, hollow.z - dz * L / 2), h1 = heightAt(hollow.x + dx * L / 2, hollow.z + dz * L / 2), y = Math.min(h0, h1) - Rr * .3 - .05;
      plan.put('hollowlog', hollow.x, y, hollow.z, { ry, rz: Math.atan2(h1 - h0, L), r: 8, L, Rr });
      // Walk-in: only the two shell walls are solid, the bore between them stays open end to end.
      for (const side of [-1, 1]) { const [bx, bz] = local(hollow.x, hollow.z, ry, 0, side * (Rr - .12)); plan.box(bx, bz, L / 2 - .4, .3, ry, y - 1, y + Rr * 1.8); }
      plan.claim(hollow.x, hollow.z, 11);
    }
    const span = findSpan(plan, { min: 190, max: 500, lengths: [12, 22], drop: 1.6, level: .5 });
    if (span) {
      const Rr = .95, L = span.L + 4, ry = Math.atan2(-span.uz, span.ux), mx = (span.ax + span.bx) / 2, mz = (span.az + span.bz) / 2, top = Math.max(span.ya, span.yb) + .25;
      plan.put('logbridge', mx, top - 2 * Rr * .93, mz, { ry, rz: 0, r: L / 2, L, Rr });
      plan.box(mx, mz, .8, L / 2, yawTo(span.ux, span.uz), top - 2 * Rr, top, true); plan.claim(mx, mz, L / 2 + 4);
    } else plan.notes.push('no gully for the log bridge');
    for (let n = 0; n < 7; n++) {
      const site = plan.find({ r: 9, min: 190, max: 500, tries: 40 }, (x, z) => -relief(x, z, 7).span);
      if (!site) continue;
      const gi = (R() * 3) | 0, s = .8 + R() * .5, L = [16, 12, 20][gi] * s, Rr = [.75, .6, .95][gi] * s, ry = R() * TAU, dx = Math.cos(ry), dz = -Math.sin(ry);
      const h0 = heightAt(site.x - dx * L / 2, site.z - dz * L / 2), h1 = heightAt(site.x + dx * L / 2, site.z + dz * L / 2), y = Math.min(h0, h1, site.h) - Rr * .35;
      plan.put('log', site.x, y, site.z, { variant: gi, ry, rz: Math.atan2(h1 - h0, L), s: [s, s, s], r: L / 2 });
      plan.box(site.x, site.z, L / 2 - .5, Rr * .8, ry, y - 1, y + Rr * 1.7); plan.claim(site.x, site.z, L / 2 + 2);
    }
  },
  // Marsh: a bird hide on stilts in the shallows with a punt tied beside it, drowned snags, cypress knees.
  marsh(plan) {
    const R = plan.R, level = MARSH_LEVEL;
    const hide = plan.find({ r: 10, min: 190, max: 520, tries: 260, water: true }, (x, z, h) => (h < level - .5 && h > level - 2.4 && waterLevelAt(x, z) === level ? -relief(x, z, 8).span : null));
    if (hide) {
      const ry = R() * TAU, deck = level + 1.55;
      plan.put('stilthut', hide.x, deck, hide.z, { ry, r: 6, floats: true }); plan.box(hide.x, hide.z, 4.3, 3.1, ry, hide.h - 1, deck + 4);
      const [px, pz] = local(hide.x, hide.z, ry, 6.4, 1.2); plan.put('punt', px, level - .06, pz, { ry: ry + .4, r: 2.5, floats: true });
      plan.claim(hide.x, hide.z, 12);
      for (let i = 0; i < 9; i++) { const a = R() * TAU, d = 14 + R() * 46, x = hide.x + Math.cos(a) * d, z = hide.z + Math.sin(a) * d, h = heightAt(x, z), s = .8 + R() * .5; if (h > level - .15 || h < level - 3 || !clearOf(x, z, 3)) continue; plan.put('marshsnag', x, h - .2, z, { ry: R() * TAU, s: [s, s, s], r: 2, floats: true }); plan.circle(x, z, .45, h - 1, h + 8); }
      for (let i = 0; i < 26; i++) { const a = R() * TAU, d = 8 + R() * 40, x = hide.x + Math.cos(a) * d, z = hide.z + Math.sin(a) * d, h = heightAt(x, z), s = .8 + R() * .9; if (h > level + .3 || h < level - .9 || !clearOf(x, z, 1)) continue; plan.put('knee', x, h - .05, z, { ry: R() * TAU, s: [s, s * (.8 + R() * .8), s], r: .5, floats: true, detail: true }); }
    } else plan.notes.push('no shallows for the bird hide');
  },
  // Taiga: a cabin in a felled clearing (windfall trunks and stumps), inukshuks on the open ridge.
  highland(plan) {
    const R = plan.R, site = cabin(plan, 'cabin', { min: 190, max: 440 });
    if (site) {
      for (let i = 0; i < 16; i++) { const a = R() * TAU, d = 10 + R() * 26, x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d, h = heightAt(x, z); if (!clearOf(x, z, 4) || h < 1) continue;
        if (i < 6) { const s = .8 + R() * .5; if (plan.items.some((it) => it.kind === 'fallen' && Math.hypot(it.x - x, it.z - z) < 12)) continue; plan.put('fallen', x, h - .15, z, { variant: i % 3, ry: R() * TAU, rz: (R() - .5) * .08, s: [s, s, s], r: 8 }); plan.circle(x, z, 1.2 * s, h - 1, h + 1.6 * s); }
        else { const s = .8 + R() * .6; plan.put('stump', x, h - .1, z, { variant: i % 2, ry: R() * TAU, s: [s, s * (.7 + R() * .8), s], r: .6, detail: i > 10 }); } }
      plan.claim(site.x, site.z, 40);
    }
    for (let n = 0; n < 2; n++) { const top = plan.find({ r: 4, min: 200, max: 540 }, (x, z, h) => h - relief(x, z, 30).mean); if (!top) continue; plan.put('inukshuk', top.x, top.h - .2, top.z, { ry: R() * TAU, s: [1.4, 1.4, 1.4], r: 2.2 }); plan.circle(top.x, top.z, 1.1, top.h - 1, top.h + 5); plan.claim(top.x, top.z, 30); }
  },
  // Egypt at half scale: three pyramids with their queens' pyramids, the sphinx, the west-bank temple, a mud-brick village.
  badlands(plan) {
    const R = plan.R, K = EGYPT_SCALE;
    const field = plan.find({ r: 95, min: 260, max: 560, tries: 260 }, (x, z) => -relief(x, z, 80).span);
    if (field) {
      const turn = R() * TAU, row = [[0, 0, 140, 90, 3, 1], [-90, -200, 132, 86, 4, 1], [-140, -380, 64, 42, 5, 0], [70, 60, 22, 14, 6, 0], [75, 30, 22, 14, 7, 0], [80, 0, 22, 14, 8, 0]];
      for (const [dx, dz, b, h, seed, capped] of row) {
        const [x, z] = local(field.x, field.z, turn, (dx + 60) * K, (dz + 150) * K), base = b * K, g = relief(x, z, base * .55);
        if (!clearOf(x, z, base * .72) || g.min < waterLevelAt(x, z) + .5) { plan.notes.push(`pyramid ${seed} would not fit`); continue; }
        plan.put('pyramid', x, g.min - 1.2, z, { ry: turn + .03, r: base * .72, base, height: h * K, seed, capped });
        plan.box(x, z, base / 2 * .86, base / 2 * .86, turn + .03, g.min - 2, g.min + h * K * .34); plan.box(x, z, base / 2 * .55, base / 2 * .55, turn + .03, g.min - 2, g.min + h * K * .62); plan.box(x, z, base / 2 * .25, base / 2 * .25, turn + .03, g.min - 2, g.min + h * K * .92);
        plan.claim(x, z, base * .72);
      }
      plan.claim(field.x, field.z, 95);
    } else plan.notes.push('no plain for the pyramid field');
    const couch = plan.find({ r: 30, min: 210, max: 520, tries: 200 }, (x, z) => -relief(x, z, 24).span);
    if (couch) {
      const toCity = Math.atan2(plan.center[1] - couch.z, plan.center[0] - couch.x), ry = -toCity, g = relief(couch.x, couch.z, 20);   // local +X (the gaze) toward the city
      plan.put('sphinx', couch.x, g.mean - 1.2 * K, couch.z, { ry, s: [K, K, K], r: 26 });
      plan.box(couch.x, couch.z, 46 * K, 12 * K, ry, g.min - 2, g.mean + 12 * K); const [hx, hz] = local(couch.x, couch.z, ry, 30 * K, 0); plan.circle(hx, hz, 7 * K, g.min - 2, g.mean + 26 * K);
      plan.claim(couch.x, couch.z, 30);
    }
    const court = plan.find({ r: 50, min: 230, max: 540, tries: 260 }, (x, z) => { const g = relief(x, z, 38); return g.span < 5 ? -g.span : null; });
    if (court) {
      const toCity = Math.atan2(plan.center[1] - court.z, plan.center[0] - court.x), ry = -toCity, g = relief(court.x, court.z, 36), y = g.max - 3.1 * K, top = y + 3.4 * K;
      plan.put('temple', court.x, y, court.z, { ry, s: [K, K, K], r: 48 });
      const at = (lx, lz) => local(court.x, court.z, ry, (lx + 3) * K, lz * K), box = (lx, lz, hw, hd, y1, walk = false) => { const [x, z] = at(lx, lz); plan.box(x, z, hw * K, hd * K, ry, g.min - 2, y + y1 * K, walk); };
      box(-3, 0, 59, 62, 3.4, true);                                              // the quay platform
      { const [x, z] = at(62.6, 0); plan.ramp(x, z, 15 * K, 6.4 * K, ry + Math.PI / 2, top, Math.min(top - .2, heightAt(...at(70, 0)))); }   // water stair
      for (const s of [-1, 1]) { box(20, s * 19, 7, 16, 33); box(31, s * 15.5, 3.4, 4.6, 23); box(40, s * 9.5, 1.4, 1.4, 31); box(-15, s * 24.5, 27, .9, 12.4); }
      box(-58, 0, 11, 20, 20);
      plan.claim(court.x, court.z, 52);
    } else plan.notes.push('no level court for the temple');
    const village = plan.find({ r: 30, min: 200, max: 480 }, (x, z) => -relief(x, z, 24).span);
    if (village) {
      for (let i = 0; i < 14; i++) { const x = Math.round((village.x + (R() - .5) * 56) / 4) * 4, z = Math.round((village.z + (R() - .5) * 56) / 4) * 4, sc = .8 + R() * .45, l = .9 + R() * .22, ry = (R() < .5 ? 0 : Math.PI / 2) + (R() - .5) * .08 + (R() < .5 ? Math.PI : 0);
        if (plan.items.some((it) => it.kind === 'mudhouse' && Math.hypot(it.x - x, it.z - z) < 13)) continue;
        const h = heightAt(x, z); plan.put('mudhouse', x, h - .2, z, { variant: (R() * 6) | 0, ry, s: [sc, sc, sc], r: 6.5 * sc, tint: [l, l * .97, l * .92] }); plan.box(x, z, 5.7 * sc, 4 * sc, ry, h - 1, h + 6.9 * sc); }
      plan.claim(village.x, village.z, 34);
    }
  },
  // Haven: the sky islands, their temple, gate, spire, shrines and arched bridge, floating over the realm.
  // Scenery only: nothing in the game reaches that height, so none of it collides.
  crimson(plan) {
    const K = HAVEN_SCALE, isl = [[0, -300, 150], [-330, -120, 72], [280, -520, 95], [-260, -660, 62], [430, -90, 56], [40, -920, 125], [-570, -430, 46], [150, 225, 68]];
    // Put the archipelago where none of its islands hangs over a city ring: try bearings round the city, nearest first.
    let best = null;
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU, d = 300 + (i % 4) * 40, x = plan.center[0] + Math.cos(a) * d, z = plan.center[1] + Math.sin(a) * d, turn = a;
      const spots = isl.map(([ix, iz, r]) => [...local(x, z, turn, ix * K, (iz + 300) * K), r * K * 1.25]);
      const ringGap = Math.min(...spots.map(([sx, sz, r]) => cityDistance(sx, sz) - r - SANCTUARY.cityRadius)), own = spots.filter(([sx, sz]) => regionAt(sx, sz).id === plan.id).length;
      if (ringGap < 15) continue;
      const score = own * 100 - d;
      if (!best || score > best.score) best = { x, z, turn, score, spots };
    }
    if (!best) return plan.notes.push('no room in the sky for the archipelago');
    let roof = -1e9; for (const [sx, sz, r] of best.spots) roof = Math.max(roof, relief(sx, sz, r).max);
    const lift = roof + 40 + 160 * K;   // the deepest keel hangs 160 m (source) under the datum
    plan.put('archipelago', best.x, lift, best.z, { ry: best.turn, s: [K, K, K], r: 620 * K, floats: true, spots: best.spots, sky: true });
  },
  // Ruins: the sunken city's temple, raised dry on a terrace, and three colossal heads on the approach.
  terraces(plan) {
    const site = plan.find({ r: 74, min: 250, max: 540, tries: 260 }, (x, z) => { const g = relief(x, z, 26); return g.span < 4.5 ? -g.span - relief(x, z, 60).span * .2 : null; });
    if (site) {
      const toCity = Math.atan2(plan.center[0] - site.x, plan.center[1] - site.z), ry = toCity - .12, g = relief(site.x, site.z, 26), UY = g.max - 2.9, PY = UY + 3.6;   // the avenue (local +Z) runs toward the city
      plan.put('sunkencity', site.x, UY, site.z, { ry, r: 72, UY });
      plan.box(site.x, site.z, 23, 16, ry, g.min - 2, PY, true);                                                                        // the stepped platform
      { const [x, z] = local(site.x, site.z, ry, 0, 19.6), [bx, bz] = local(site.x, site.z, ry, 0, 24.5); plan.ramp(x, z, 7, 3.8, ry, PY, Math.min(PY - .3, heightAt(bx, bz))); }   // its front stair
      { const [x, z] = local(site.x, site.z, ry, 0, 36); plan.circle(x, z, 1.7, g.min - 2, heightAt(x, z) + 11); }                         // the statue
      { const [x, z] = local(site.x, site.z, ry - .12, -48, -12); plan.circle(x, z, 3.6, g.min - 2, heightAt(x, z) + 6); }                  // the toppled head
      for (const side of [-1, 1]) { const [x, z] = local(site.x, site.z, ry, side * 4.6, 48); plan.circle(x, z, 1.4, g.min - 2, heightAt(x, z) + 6); }   // the arch gate's piers
      plan.claim(site.x, site.z, 74);
      for (let n = 0; n < 3; n++) {
        const d = 58 + n * 12, side = n % 2 ? 1 : -1, [x, z] = local(site.x, site.z, ry, side * 27, d), h = heightAt(x, z);
        if (!clearOf(x, z, 4)) continue;
        plan.put('head', x, h - .15, z, { ry: ry + (side < 0 ? Math.PI / 2 : -Math.PI / 2), s: [2.2, 2.2, 2.2], r: 3 }); plan.circle(x, z, 2, h - 1, h + 4.2);
      }
    } else plan.notes.push('no terrace for the temple');
  },
  // Savanna: granite kopjes stacked block on block, and termite mounds on the plain around them.
  plateau(plan) {
    const R = plan.R;
    for (const [r, h] of [[75, 26], [58, 20]]) {
      const site = plan.find({ r: r * .9, min: 240, max: 540, tries: 200, gap: 30 }, (x, z, hh) => hh - relief(x, z, r).mean - relief(x, z, r * .5).span * .15);
      if (!site) { plan.notes.push('no rise for a kopje'); continue; }
      plan.put('kopje', site.x, site.h, site.z, { r, K: { x: site.x, z: site.z, r, h }, seed: 1300 + r });
      plan.circle(site.x, site.z, r * .2, site.h - 3, site.h + h * .8); plan.claim(site.x, site.z, r);
      for (let i = 0; i < 4; i++) { const a = R() * TAU, d = r * (1.05 + R() * .5), x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d, s = .8 + R() * .9, hh = heightAt(x, z); if (!clearOf(x, z, 3) || hh < 1) continue; plan.put('mound', x, hh - .3, z, { variant: (R() * 4) | 0, ry: R() * TAU, s: [s, s * (.85 + .3 * R()), s], r: 1.6 * s }); plan.circle(x, z, 1.1 * s, hh - 1, hh + 4 * s); }
    }
  },
};
export const EGYPT_SCALE = .5, HAVEN_SCALE = .5;

// Village: a hamlet round a green. Houses are Biome Triad's own building specs, re-sited; yards get woodpiles, a cart, casks.
function hamlet(plan, names, piles) {
  const R = plan.R, site = plan.find({ r: 46, min: 210, max: 480, tries: 220 }, (x, z) => { const g = relief(x, z, 36); return g.span < 9 ? -g.span : null; });
  if (!site) return plan.notes.push('no level ground for the hamlet');
  const n = names.length, start = R() * TAU;
  names.forEach((name, i) => {
    const a = start + i / n * TAU + (R() - .5) * .25, d = 24 + R() * 8, x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d, ry = yawTo(site.x - x, site.z - z) + (R() - .5) * .2;   // front door (local +Z) to the green
    plan.put('house', x, heightAt(x, z), z, { ry, r: 9, name, pick: i });
    plan.box(x, z, 5.6, 4.2, ry, heightAt(x, z) - 3, heightAt(x, z) + 6);
  });
  const yard = ['logs', 'cart', 'logs', 'barrel', 'stack', 'logs', 'crate'];
  for (let i = 0; i < piles + 3; i++) { const a = start + (i + .5) / (piles + 3) * TAU, d = 9 + R() * 6, x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d, t = yard[i % yard.length], h = heightAt(x, z);
    plan.put('yard', x, h, z, { ry: R() * TAU, r: 1.6, t, seed: 11 + i }); if (t !== 'barrel' && t !== 'crate') plan.circle(x, z, t === 'logs' ? .8 : 1.3, h - 1, h + 1.2); }
  plan.claim(site.x, site.z, 48);
}

const PLANS = new Map();
/** Where one realm's landmarks stand. Pure and repeatable: the same answer on every client. */
export function planRealm(oathId) {
  if (PLANS.has(oathId)) return PLANS.get(oathId);
  const oath = OATH_BY_ID[oathId], plan = new Plan(oath);
  PLANNERS[oath.biome]?.(plan);
  const result = { id: plan.id, biome: plan.biome, world: plan.world, center: plan.center, items: plan.items, solids: plan.solids, notes: plan.notes };
  PLANS.set(oathId, result);
  return result;
}
export const planAll = () => OATHS.map((oath) => planRealm(oath.id));

// --- drawing ---------------------------------------------------------------------------------------------------
const once = (make) => { let made; return () => (made ??= make()); };
/** Biome Triad's geometry and materials for each world, made the first time a realm needs them and then shared. */
function makeKits() {
  const R = BT.RECIPES, far = (mat) => { if (mat.userData.far) mat.userData.far.value = 1e6; return mat; };
  const kits = {
    sea: once(() => { const kit = R.seaRockKit(); far(kit.lMat); return kit; }),
    arctic: once(() => R.arcticIceKit()),
    volcano: once(() => R.volcanoRockKit()),
    canyon: once(() => { const kit = R.canyonKit(); return { ...kit, rockMat: new THREE.MeshStandardMaterial({ vertexColors: true, color: '#e2c4b0', map: BT.tex.ground, roughness: .95 }) }; }),   // eased toward Aetherion's paler canyon ground
    alpine: once(() => ({ ...R.alpineKit({ T: { xa: 0, xb: 0 } }), iceM: BT.iceMaterial(.32), ice: [BT.icebergGeo(91, 3), BT.icebergGeo(92, 3, true)], serac: [BT.seracGeo(93), BT.seracGeo(94), BT.seracGeo(95)], cairn: BT.alpineCairnGeo(3), cabin: BT.cabinGeo() })),
    marsh: once(() => R.marshKit({ HUT: { x: 0, y: 0, z: 0 } })),
    forest: once(() => R.forestLogKit()),
    taiga: once(() => R.taigaKit()),
    ruins: once(() => R.ruinsKit({ PY: 6 })),
    village: once(() => ({ ...R.villageMaterials(), layout: BT.vilLayout(), units: BT.vilUnits() })),
    savanna: once(() => { const kit = R.savannaKopjes({ R: BT.rng(1), savannaKopjes: [], heightAt, group: new THREE.Group() }); return kit; }),
  };
  return kits;
}
/** Geometry variants and material for each instanced kind. */
const INSTANCED = {
  colonnade: (k) => [k.volcano().colG, k.volcano().basMat], ledge: (k) => [k.volcano().crG, k.volcano().wallRock], buttress: (k) => [k.volcano().crG, k.volcano().wallRock], snag: (k) => [k.volcano().snagG, k.volcano().charMat],
  berg: (k) => [k.arctic().bergG, k.arctic().bergM], floe: (k) => [k.arctic().floeG, k.arctic().floeMat], inukshuk: (k) => [[k.arctic().inG], k.arctic().stoneMat], cabin: (k) => [[k.alpine().cabin], k.alpine().woodMat],
  serac: (k) => [k.alpine().serac, k.alpine().iceM], iceblock: (k) => [k.alpine().ice, k.alpine().iceM], cairn: (k) => [[k.alpine().cairn], k.arctic().stoneMat],
  seastack: (k) => [k.sea().stGeo, k.sea().seaRock], headland: (k) => [k.sea().hdGeo, k.sea().seaRock], driftwood: (k) => [[k.sea().lG], k.sea().lMat],
  hoodoo: (k) => [k.canyon().hooG, k.canyon().hooMat], log: (k) => [k.forest().logG, k.forest().logMat],
  marshsnag: (k) => [[BT.marshSnagGeo(6622)], k.marsh().woodMat], knee: (k) => [[BT.marshKneeGeo(6621)], k.marsh().kneeMat],
  fallen: (k) => [k.taiga().logG, k.taiga().capWood], stump: (k) => [k.taiga().stG, k.taiga().capWood],
  head: (k) => [[k.ruins().headG], k.ruins().basMat], mound: (k) => [k.savanna().moundG, k.savanna().moundMat],
};
const shadowed = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; return mesh; };
const placed = (mesh, it) => { mesh.position.set(it.x, it.y, it.z); mesh.rotation.set(it.rx, it.ry, it.rz); mesh.scale.set(...it.s); return shadowed(mesh); };

/** One-off landmarks: each returns an Object3D for the item. `own` collects what must be disposed with the realm. */
const UNIQUE = {
  pyramid(it, kits, own, egypt) {
    const group = new THREE.Group(), geo = BT.pyramidGeo(it.base, it.height, it.seed), body = shadowed(new THREE.Mesh(geo, egypt.limeMat)); own.push(geo);
    body.position.set(it.x, it.y, it.z); body.rotation.y = it.ry; group.add(body);
    if (it.capped) { const cap = new THREE.ConeGeometry(it.base * .012 + .5, it.height * .045, 4).rotateY(Math.PI / 4), tip = new THREE.Mesh(cap, egypt.gold); own.push(cap); tip.position.set(it.x, it.y + it.height - it.height * .012, it.z); tip.rotation.y = it.ry; group.add(tip); }
    return group;
  },
  sphinx(it, kits, own, egypt) { const geo = BT.sphinxGeo(); own.push(geo); return placed(new THREE.Mesh(geo, egypt.limeMat), it); },
  temple(it, kits, own, egypt) {
    // The recipe builds the temple at its source spot; shift it so its platform centre is the group origin.
    const temple = egypt.temple, holder = new THREE.Group();
    temple.position.set(3, 0, 0); temple.traverse((node) => { if (node.isMesh) node.receiveShadow = true; if (node.isSprite) node.visible = false; });
    holder.add(temple); holder.position.set(it.x, it.y, it.z); holder.rotation.y = it.ry; holder.scale.set(...it.s);
    return holder;
  },
  alcove(it, kits) { const geo = BT.canyonCaveGeo(it.cave, kits.canyon().colorAt); return shadowed(new THREE.Mesh(geo, kits.canyon().rockMat)); },
  ropebridge(it, kits) { const mesh = shadowed(new THREE.Mesh(BT.alpineBridgeGeo(it.L, it.ya, it.yb, it.sag), kits.alpine().bridgeMat)); mesh.position.set(it.x, 0, it.z); mesh.rotation.y = it.ry; return mesh; },
  giantlog(it, kits) { return placed(new THREE.Mesh(BT.forestLogGeo(99, it.L, it.Rr, false, true), kits.forest().logMat), it); },
  hollowlog(it, kits) { return placed(new THREE.Mesh(BT.forestLogGeo(90, it.L, it.Rr, true), kits.forest().logMat), it); },
  logbridge(it, kits) { return placed(new THREE.Mesh(BT.forestLogGeo(77, it.L, it.Rr, false), kits.forest().logMat), it); },
  stilthut(it, kits) { const hut = kits.marsh().hut.clone(); return placed(hut, it); },
  punt(it, kits) { const punt = kits.marsh().punt.clone(); return placed(punt, it); },
  kopje(it, kits, own) {
    // The source's own stacking loop, run on this ground; its instanced blocks land in `group`.
    const group = new THREE.Group(); BT.RECIPES.savannaKopjes({ R: BT.rng(it.seed), savannaKopjes: [it.K], heightAt, group });
    group.traverse((node) => { if (node.isInstancedMesh) own.push({ dispose: () => node.dispose() }); });
    return group;
  },
  sunkencity(it, kits, own) {
    // Built in the frame of its own site (origin at the platform centre, unturned), then turned as one piece.
    const c = Math.cos(it.ry - .12), s = Math.sin(it.ry - .12), ground = (lx, lz) => heightAt(it.x + lx * c + lz * s, it.z - lx * s + lz * c);
    const city = BT.RECIPES.sunkenCity({ UX: 0, UZ: 0, UY: it.UY, ground }), geo = BT.worldUV(mergeGeometries(city.parts), 3.2); city.parts.forEach((part) => part.dispose()); own.push(geo);
    const mesh = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: city.stoneTex.map, normalMap: city.stoneTex.normal, roughness: .93 })));
    mesh.position.set(it.x, 0, it.z); mesh.rotation.y = it.ry - .12; return mesh;
  },
  archipelago(it, kits, own) {
    const haven = BT.RECIPES.havenArchipelago(), holder = new THREE.Group();
    haven.group.position.set(0, 0, 300); haven.group.traverse((node) => { if (node.isSprite) node.visible = false; if (node.geometry) own.push(node.geometry); });
    holder.add(haven.group); holder.position.set(it.x, it.y, it.z); holder.rotation.y = it.ry; holder.scale.set(...it.s); holder.userData.rings = haven.rings;
    return holder;
  },
  house(it, kits, own, _egypt, slots) {
    // The source's building spec for this kind of house, moved to its plot here.
    const village = kits.village(), spec = village.layout.blds.filter((b) => b.name === it.name)[it.pick % Math.max(1, village.layout.blds.filter((b) => b.name === it.name).length)] ?? village.layout.blds.find((b) => b.name === 'a house');
    const b = { ...spec, x: it.x, z: it.z, ry: it.ry, c: Math.cos(it.ry), s: Math.sin(it.ry), id: slots.count++ };
    let gmin = 1e9, gmax = -1e9; for (const [u, q] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1]]) { const h = heightAt(b.x + u * b.W / 2 * b.c + q * b.D / 2 * b.s, b.z - u * b.W / 2 * b.s + q * b.D / 2 * b.c); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
    b.gmin = gmin; b.fy0 = gmax + .32;
    BT.vilBuild(slots.S, b); return null;
  },
  yard(it, kits, own, _egypt, slots) {
    const geo = BT.vilCoverGeo(it.t, it.seed), mats = kits.village().matOf; own.push(geo); void slots;
    return placed(new THREE.Mesh(geo, mats[geo.userData.slot] ?? mats.wood), { ...it, rx: 0, rz: 0, s: [1, 1, 1] });
  },
};

/** Builds one realm's meshes in small steps so no single frame carries the whole realm. */
function realmBuilder(plan, kits, quality) {
  const group = new THREE.Group(), own = [], steps = [], low = quality === 'low';
  group.name = `Landmarks ${plan.id} (${plan.world})`;
  const lists = new Map();
  for (const it of plan.items) {
    if (low && it.detail) continue;
    if (!INSTANCED[it.kind]) continue;
    const key = `${it.kind}:${it.kind === 'ledge' ? 0 : it.kind === 'buttress' ? 1 : it.variant}`;
    if (!lists.has(key)) lists.set(key, { kind: it.kind, variant: it.kind === 'ledge' ? 0 : it.kind === 'buttress' ? 1 : it.variant, list: [] });
    lists.get(key).list.push({ p: new THREE.Vector3(it.x, it.y, it.z), s: new THREE.Vector3(...it.s), ry: it.ry, rx: it.rx, rz: it.rz, c: it.tint ? new THREE.Color(...it.tint) : null });
  }
  for (const { kind, variant, list } of lists.values()) steps.push(() => {
    const [geos, mat] = INSTANCED[kind](kits), tiled = BT.instTiled(geos[variant % geos.length], mat, list, { tile: 400, shadow: !low });
    tiled.traverse((node) => { if (node.isInstancedMesh) own.push({ dispose: () => node.dispose() }); }); tiled.name = kind; group.add(tiled);
  });
  const unique = plan.items.filter((it) => UNIQUE[it.kind]);
  let egypt = null; const slots = { S: null, count: 0 };
  if (unique.some((it) => ['pyramid', 'sphinx', 'temple', 'mudhouse'].includes(it.kind)) || plan.items.some((it) => it.kind === 'mudhouse')) steps.unshift(() => { egypt = BT.RECIPES.egyptMonuments({ group: new THREE.Group(), cx: () => 0, nw: () => -58 }); });
  if (unique.some((it) => it.kind === 'house')) steps.unshift(() => { kits.village(); slots.S = BT.vilSlots(); });
  for (const it of unique) steps.push(() => { const node = UNIQUE[it.kind](it, kits, own, egypt, slots); if (node) { node.name = it.kind; group.add(node); } });
  if (plan.items.some((it) => it.kind === 'mudhouse')) steps.push(() => {
    const byVariant = new Map();
    for (const it of plan.items) if (it.kind === 'mudhouse') { if (!byVariant.has(it.variant)) byVariant.set(it.variant, []); byVariant.get(it.variant).push({ p: new THREE.Vector3(it.x, it.y, it.z), s: new THREE.Vector3(...it.s), ry: it.ry, c: new THREE.Color(...it.tint) }); }
    for (const [variant, list] of byVariant) group.add(BT.instTiled(egypt.variants[variant], egypt.mudMat, list, { tile: 120, shadow: !low }));
  });
  if (unique.some((it) => it.kind === 'house')) steps.push(() => {
    const village = kits.village();
    for (const slot of BT.VIL_SLOTS) { const geo = BT.vilFinish(slots.S[slot], slot === 'glass'); if (!geo) continue; own.push(geo); const mesh = shadowed(new THREE.Mesh(geo, village.matOf[slot])); mesh.name = `houses (${slot})`; group.add(mesh); }
  });
  return { group, steps, own };
}

/**
 * Landmarks for the running game. A realm is planned, and its footprints made solid, when the player first comes
 * within `planRange` of its city; its meshes are built within `buildRange` and hidden beyond `showRange`.
 */
export function createRealmLandmarks(ctx, { planRange = 1400, buildRange = 1150, showRange = 1500 } = {}) {
  const collision = ctx.collision, canDraw = typeof document !== 'undefined' && !!ctx.scene;
  const kits = canDraw ? makeKits() : null, planned = new Map(), realms = new Map(), queue = [];
  const tmp = new THREE.Vector3();
  let time = 0, solids = 0;
  function plan(oath) {
    const made = planRealm(oath.id); planned.set(oath.id, made);
    if (collision) for (const s of made.solids) {
      if (s.type === 'circle') collision.addCircle(s.x, s.z, s.r, s.y0, s.y1, { walkable: s.walkable, tag: 'landmark' });
      else if (s.type === 'ramp') collision.addRamp(s.x, s.z, s.hw, s.hd, -s.ry, s.y0, s.y1, { tag: 'landmark' });
      else collision.addBox(s.x, s.z, s.hw, s.hd, -s.ry, s.y0, s.y1, { walkable: s.walkable, tag: 'landmark' });
      solids++;
    }
    return made;
  }
  function update(dt, x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    time += Math.min(dt, .1);
    for (const oath of OATHS) {
      const d = Math.hypot(x - oath.center[0], z - oath.center[1]);
      if (d > showRange && !realms.has(oath.id)) continue;
      const made = planned.get(oath.id) ?? (d < planRange ? plan(oath) : null);
      if (!made || !canDraw || !made.items.length) continue;
      let realm = realms.get(oath.id);
      if (!realm && d < buildRange) { realm = realmBuilder(made, kits, ctx.quality?.name); ctx.scene.add(realm.group); realms.set(oath.id, realm); queue.push(...realm.steps.map((step) => [oath.id, step])); }
      if (realm) realm.group.visible = d < showRange;
    }
    if (!canDraw) return;
    // One step a frame: a kit of geometry, a monument, or a batch of instances.
    if (queue.length) { const [id, step] = queue.shift(); try { step(); } catch (error) { console.error(`landmarks ${id}:`, error); } }
    // The copied materials light themselves from Biome Triad's shared sun and wind uniforms.
    const sun = ctx.render?.sun, hemi = ctx.render?.hemi, camera = ctx.camera;
    if (sun && camera) {
      tmp.copy(sun.position); if (sun.target) tmp.sub(sun.target.position); tmp.normalize(); BT.VU.uSunDir.value.copy(tmp);
      BT.VU.uSunView.value.copy(tmp).transformDirection(camera.matrixWorldInverse);
      BT.VU.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(1.4, sun.intensity / 2.5));
    }
    if (hemi) { BT.VU.uHemiSky.value.copy(hemi.color).multiplyScalar(hemi.intensity); BT.VU.uHemiGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity); }
    BT.WIND.value.set(time, .5);
    for (const realm of realms.values()) for (const node of realm.group.children) if (node.userData.rings) node.userData.rings.forEach((ring, i) => { ring.rotation.z = time * (.12 + i * .05); });
  }
  function dispose() {
    for (const realm of realms.values()) { ctx.scene.remove(realm.group); for (const thing of realm.own) thing.dispose?.(); }
    realms.clear(); queue.length = 0;
  }
  return { update, dispose, planned, stats: () => ({ planned: planned.size, built: realms.size, pending: queue.length, solids }) };
}
