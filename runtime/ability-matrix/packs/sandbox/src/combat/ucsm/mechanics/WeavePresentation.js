import { Mesh, Points } from 'three';
import { LAYER } from '../../../core/Layers.js';
import {
  ensureWeaveSurface,
  ensureWeaveMotes,
  ensureWeaveSparks,
  ensureWeaveAnchorMotes,
  ensureWeaveSigil,
  ensureWeavePylon,
  ensureWeaveTrail,
  ensureWeaveShock,
  ensureWeaveBeam,
  ensureWeaveFlood,
  ensureWeaveShimmer,
  weaveStyle
} from './WeaveHeroGeometry.js';
import { attachWeaveFx } from './WeaveShaders.js';
import { armWeaveExit } from './WeaveExit.js';

/**
 * WeavePresentation — how a Covenant Weave looks, from the moment an anchor
 * lands to the moment its last link unravels.
 *
 * `MechanicPresentation` owns the lifecycle (one item per anchor / link / cue,
 * created on `cue` or `sync`, pruned when the combat record disappears or the
 * cue's life ends). This module only decides what an item is made of. All
 * geometry and materials are pooled per style in `WeaveHeroGeometry`; a build
 * here allocates only the `Mesh` / `Points` wrappers, at spawn, never per
 * frame. Per-frame change is entirely in GLSL plus the per-draw sync hooks in
 * `WeaveShaders` (and the presentation's own `weaveSpin` / `weaveSlide` /
 * `weavePulse` tags, which it already animates on combat ticks).
 *
 * ## The beats, end to end
 *
 *  - **arrival** — the helix burns up out of its sigil and the sigil burns
 *    outward from the pylon's foot over `revealTime`; a link's braid, trail and
 *    points weave across from anchor to anchor.
 *  - **linger** — filaments, runes and motes in the element's manner; the
 *    sigil's rim arc is the remaining life, its strokes crack with damage.
 *  - **telegraph** — the last `warnTime` seconds gutter.
 *  - **impact** — break, expiry and every weave effect build their cue here;
 *    the engine half of the same beat (shake, flash, light punch, ground mark)
 *    is `WeaveBeats#weaveBeat`.
 *  - **exit** — every anchor and link root is armed by `WeaveExit`: when its
 *    record disappears the group burns out over `exitTime` (shader layers
 *    dissolve, the solids retract) instead of vanishing in one frame.
 *
 * ## Layers of an anchor
 *
 *  1. **Pylon** (themed weaves) — a lathed solid with a style profile, drawn
 *     with the presentation's lit materials so the anchor has weight and
 *     casts a shadow. Fire and frost anchors keep the presentation's own
 *     sculptures, which already meet this bar.
 *  2. **Hero helix** — five noise-filament ribbons wound round the pylon,
 *     burning up from the sigil on arrival (the anticipation → arrival beat)
 *     and guttering for the last `warnTime` seconds (the expiry telegraph).
 *  3. **Ground sigil** — a per-style rosette whose rim arc *is* the anchor's
 *     remaining life and whose strokes crack as it is damaged.
 *  4. **Motes** — 48 GPU points orbiting the pylon in the element's manner.
 *  5. **Shimmer** — a distortion proxy on `LAYER.DISTORTION` rising off the
 *     pylon (strongest for fire and wind).
 *
 * ## Layers of a link
 *
 *  Solid core + strands + four sliding markers (the readable collision width,
 *  unchanged), the braided hero ribbon that weaves across from anchor to
 *  anchor on arrival, the twenty scrolling motes, a second 32-point spark
 *  system and a world-space ground trail. All of it stays inside the
 *  authoritative capsule.
 *
 * ## Cues
 *
 *  Break, expiry and every weave effect add a shockwave disc that fades on
 *  its own cue age, so nothing pops when the cue is pruned; chain / flood /
 *  quake / shatter / draft draw their energy with a dissolving beam material
 *  and the flood fills the real anchor triangle.
 *
 * Every transparent layer is moved to `LAYER.VFX`. Left on the default layer
 * they were drawn into the depth prepass as opaque, so soft particles of every
 * other cast faded against invisible ribbon geometry.
 */

const TAU = Math.PI * 2;

/** Base material, lit frame material, pillar count and silhouette per themed weave. */
const THEMES = {
  'mechanics/weave/neural-thunder-grid': ['storm', 'steel', 4, 'coil'],
  'mechanics/weave/hydrostatic-labyrinth': ['water', 'bronze', 3, 'water'],
  'mechanics/weave/tectonic-triangulation': ['rock', 'gold', 3, 'stone'],
  'mechanics/weave/prismatic-cathedral': ['crystal', 'steel', 5, 'prism'],
  'mechanics/weave/jetstream-loom': ['wind', 'bronze', 4, 'wind']
};

/** Presentation lifetime of each cue, mirrored from `MechanicPresentation#cue`. */
const CUE_LIFE = { 'anchor-break': 0.5, 'anchor-expire': 0.45, 'weave-burst': 0.6 };

/** The lit presentation material a themed weave paints its solids with. */
export const weaveMaterial = (uid) => THEMES[uid]?.[0];

/** Lit material for any weave uid, including the two untabled ones. */
const solidMaterial = (uid) => weaveMaterial(uid) ?? (uid?.endsWith('cryostasis-mesh') ? 'ice' : 'fire');

/** Wrap a pooled geometry/material in a VFX-layer mesh that casts no shadow. */
function vfxMesh(v, geometry, material, parent) {
  const mesh = new Mesh(v.geo[geometry], v.mat[material]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.layers.set(LAYER.VFX);
  parent.add(mesh);
  return mesh;
}

/** Wrap a pooled seed cloud in a VFX-layer point system. */
function vfxPoints(v, geometry, material, parent) {
  const points = new Points(v.geo[geometry], v.mat[material]);
  points.frustumCulled = false; // the shader moves every point; CPU bounds are meaningless
  points.layers.set(LAYER.VFX);
  parent.add(points);
  return points;
}

/** A presentation mesh moved to the VFX layer (for stock shapes with fx materials). */
function asVfx(mesh) {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.layers.set(LAYER.VFX);
  return mesh;
}

/* ------------------------------------------------------------------------ */
/* Anchors                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The elemental layers every anchor carries (all seven weaves): helix, sigil,
 * motes and shimmer. Called by the presentation after the solid body.
 */
export function buildWeaveAnchorSurface(v, g, uid) {
  const style = weaveStyle(uid ?? '');

  const hero = ensureWeaveSurface(v, style, 'anchor');
  const helix = v.mesh(hero.geometry, hero.material, g, 0, 0, 0, 1, 1, 1);
  helix.name = `weave-anchor-hero:${style}`;
  attachWeaveFx(asVfx(helix), v, { kind: 'ribbon', style, root: g });

  const sigilAsset = ensureWeaveSigil(v, style);
  const sigil = vfxMesh(v, sigilAsset.geometry, sigilAsset.material, g);
  sigil.name = `weave-anchor-sigil:${style}`;
  sigil.position.y = 0.025;
  sigil.frustumCulled = false; // its radius is a live uniform, not a CPU bound
  sigil.renderOrder = -1; // ground treatments draw before the rising layers
  attachWeaveFx(sigil, v, { kind: 'sigil', style, root: g });

  const moteAsset = ensureWeaveAnchorMotes(v, style);
  const motes = vfxPoints(v, moteAsset.geometry, moteAsset.material, g);
  motes.name = `weave-anchor-motes:${style}`;
  attachWeaveFx(motes, v, { kind: 'anchorMotes', style, root: g });

  const shimmerAsset = ensureWeaveShimmer(v);
  const shimmer = vfxMesh(v, shimmerAsset.geometry, shimmerAsset.material, g);
  shimmer.name = `weave-anchor-shimmer:${style}`;
  shimmer.layers.set(LAYER.DISTORTION);
  shimmer.frustumCulled = false; // billboarded in the vertex shader
  attachWeaveFx(shimmer, v, { kind: 'shimmer', style, root: g });

  armWeaveExit(v, g, 'anchor');
}

/**
 * The solid body of a themed anchor. Returns false for the two weaves whose
 * bodies the presentation sculpts itself (fire and frost).
 */
export function buildWeaveAnchor(v, g, data) {
  const theme = THEMES[data.uid];
  if (!theme) return false;
  const [color, frame, pillars, form] = theme;
  const style = weaveStyle(data.uid);
  v.mesh('base', frame, g, 0, 0, 0, 0.8, 0.8, 0.8);
  v.ring(g, color, 0.66, 0.14);

  // The lathed pylon replaces the stock column each themed anchor used to stand on.
  const pylon = ensureWeavePylon(v, style);
  if (form === 'coil') {
    // Storm: a ceramic insulator stack threaded by counter-spinning coils.
    v.mesh(pylon, frame, g, 0, 0.1, 0, 1, 1, 1);
    for (let i = 0; i < 5; i++) {
      const coil = v.ring(g, color, 0.4 + i * 0.06, 0.4 + i * 0.3);
      coil.rotation.z = 0.3;
      coil.userData.weaveSpin = { axis: 'z', rate: (i % 2 ? -1 : 1) * 0.6, base: 0.3 };
    }
    v.mesh('sphere', color, g, 0, 1.92, 0, 0.2);
  } else if (form === 'water') {
    // Water: a teardrop reservoir cradled by tilted bronze hoops.
    v.mesh(pylon, color, g, 0, 0.05, 0, 1, 1, 1);
    for (let i = 0; i < 3; i++) {
      const hoop = v.ring(g, frame, 0.65 - i * 0.1, 0.5 + i * 0.5);
      hoop.rotation.z = (i - 1) * 0.5;
      hoop.userData.weaveSpin = { axis: 'z', rate: i % 2 ? -0.45 : 0.45, base: hoop.rotation.z };
    }
  } else if (form === 'stone') {
    // Earth: a quarried pentagonal monolith banded in gold.
    v.mesh(pylon, color, g, 0, 0.05, 0, 1, 1, 1);
    for (let i = 0; i < 3; i++) v.ring(g, frame, 0.42 - i * 0.08, 0.35 + i * 0.5);
  } else if (form === 'prism') {
    // Crystal: a hexagonal bipyramid with a steel collar.
    v.mesh(pylon, color, g, 0, 0, 0, 1, 1, 1);
    v.ring(g, frame, 0.58, 1.2);
  } else {
    // Wind: a slender mast carrying a four-bladed rotor.
    v.mesh(pylon, frame, g, 0, 0.05, 0, 1, 1, 1);
    const hub = v.mesh('sphere', color, g, 0, 1.6, 0, 0.22);
    hub.userData.weaveSpin = { axis: 'z', rate: 2.2, base: 0 };
    for (let i = 0; i < 4; i++) {
      const blade = v.mesh('shard', color, hub, Math.sin((i * TAU) / 4) * 1.3, Math.cos((i * TAU) / 4) * 1.3, 0, 0.28, 1.2, 0.14);
      blade.rotation.z = (-i * TAU) / 4;
    }
  }

  // Buttress pillars, feet and studs; the pillar count is part of the identity.
  for (let i = 0; i < pillars; i++) {
    const angle = (i * TAU) / pillars;
    const side = v.mesh(form === 'stone' ? 'box' : 'shard', color, g,
      Math.sin(angle) * 0.55, 0.7, Math.cos(angle) * 0.55, 0.11, form === 'prism' ? 0.85 : 0.5, 0.11);
    side.rotation.z = -Math.sin(angle) * 0.3;
    side.rotation.x = Math.cos(angle) * 0.3;
    const foot = v.mesh('box', frame, g, Math.sin(angle) * 0.46, 0.23, Math.cos(angle) * 0.46, 0.08, 0.25, 0.08);
    foot.rotation.y = angle;
    v.mesh('sphere', color, g, Math.sin(angle) * 0.46, 0.41, Math.cos(angle) * 0.46, 0.055);
  }
  const crown = v.ring(g, frame, form === 'stone' ? 0.32 : 0.45, 1.52);
  if (form === 'prism' || form === 'wind') crown.userData.weaveSpin = { axis: 'z', rate: form === 'wind' ? 0.8 : -0.35, base: 0 };
  return true;
}

/* ------------------------------------------------------------------------ */
/* Links                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * A link in world coordinates (the presentation leaves the group at the
 * origin). Mesh budget: core 1 + strands 8–12 + markers 4 + ribbon 1 +
 * trail 1 ≤ 20; the two point systems are not meshes.
 */
export function buildWeaveLink(v, g, data) {
  const shape = data.shape;
  if (!shape) return false;
  const uid = data.uid ?? 'mechanics/weave/infernal-circuit';
  const material = solidMaterial(uid);
  const dx = shape.bx - shape.ax, dz = shape.bz - shape.az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const nx = -dz / len, nz = dx / len; // unit normal across the link
  const mode = weaveStyle(uid);
  const yaw = Math.atan2(dx, dz);
  const midX = (shape.ax + shape.bx) / 2, midZ = (shape.az + shape.bz) / 2;
  const point = (t, offset, y = 0.58) => [shape.ax + dx * t + nx * offset, y, shape.az + dz * t + nz * offset];
  const segment = (a, b, mat, thickness) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2], length = Math.hypot(vx, vy, vz);
    const mesh = v.mesh('shaft', mat, g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, thickness, length, thickness);
    mesh.quaternion.setFromUnitVectors(v.up, v.vector(vx, vy, vz).normalize());
    return mesh;
  };

  // The core line stays in reduced motion; its extents fit the collider.
  segment(point(0, 0), point(1, 0), material, Math.min(0.55, shape.r * 0.7));

  // Strands: storm zig-zags between rails, earth steps, the rest undulate.
  const count = mode === 'storm' ? 12 : mode === 'earth' ? 8 : 10;
  const amplitude = shape.r * (mode === 'wind' ? 0.55 : 0.4);
  const wave = (t) => (mode === 'storm' ? (Math.round(t * count) % 2 ? 1 : -1) * amplitude
    : mode === 'earth' ? ((Math.round(t * count) % 3) - 1) * amplitude * 0.6
    : Math.sin(t * TAU * (mode === 'crystal' ? 3 : 2)) * amplitude);
  const strandY = mode === 'earth' ? 0.14 : mode === 'water' ? 0.43 : 0.58;
  for (let i = 0; i < count; i++) {
    const t0 = i / count, t1 = (i + 1) / count;
    segment(point(t0, wave(t0), strandY), point(t1, wave(t1), strandY), material, Math.min(0.35, shape.r * 0.4));
  }

  // Markers slide anchor to anchor on combat ticks (held still in reduced motion).
  for (let i = 0; i < 4; i++) {
    const marker = v.mesh(mode === 'water' ? 'sphere' : 'shard', material, g, 0, 0, 0, 0.055, 0.12, 0.055);
    marker.userData.weaveSlide = { a: point(0, 0), b: point(1, 0), phase: i / 4, speed: mode === 'wind' ? 1.1 : 0.65 };
    marker.position.set(...point(i / 4, 0));
  }

  // The hero braid: continuous elemental energy over the readable strands.
  const asset = ensureWeaveSurface(v, mode, 'link');
  const hero = v.mesh(asset.geometry, asset.material, g, midX, 0.6, midZ, shape.r * 1.6, 1, len);
  hero.rotation.y = yaw;
  hero.name = `weave-link-hero:${mode}`;
  attachWeaveFx(asVfx(hero), v, { kind: 'ribbon', style: mode, link: data, root: g });

  // Ground trail: what the link does to the floor it crosses.
  const trailAsset = ensureWeaveTrail(v, mode);
  const trail = vfxMesh(v, trailAsset.geometry, trailAsset.material, g);
  trail.name = `weave-link-trail:${mode}`;
  trail.position.set(midX, 0.02, midZ);
  trail.rotation.y = yaw;
  trail.scale.set(shape.r * 2, 1, len);
  trail.renderOrder = -1;
  attachWeaveFx(trail, v, { kind: 'trail', style: mode, link: data, root: g });

  // Two point systems share the braid's frame.
  const moteAsset = ensureWeaveMotes(v, mode);
  const motes = vfxPoints(v, moteAsset.geometry, moteAsset.material, g);
  motes.name = `weave-link-motes:${mode}`;
  motes.position.set(midX, 0.6, midZ);
  motes.scale.set(shape.r * 1.6, 1, len);
  motes.rotation.y = yaw;
  attachWeaveFx(motes, v, { kind: 'linkMotes', style: mode, link: data, root: g });

  const sparkAsset = ensureWeaveSparks(v, mode);
  const sparks = vfxPoints(v, sparkAsset.geometry, sparkAsset.material, g);
  sparks.name = `weave-link-sparks:${mode}`;
  sparks.position.set(midX, 0.6, midZ);
  sparks.scale.set(shape.r * 1.6, 1, len);
  sparks.rotation.y = yaw;
  attachWeaveFx(sparks, v, { kind: 'linkMotes', style: mode, link: data, root: g });

  armWeaveExit(v, g, 'link');
  return true;
}

/* ------------------------------------------------------------------------ */
/* Cues                                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Shockwave disc. The mesh is sized for the largest ring the cue can reach
 * (radius × (1 + max overshoot)); the shader places the front on a radius
 * fraction, so the overshoot setting stays live without rescaling the mesh.
 */
function shockwave(v, g, style, kind, radius, x = 0, z = 0, inward = false) {
  const asset = ensureWeaveShock(v, style);
  const scale = radius * 2.6;
  const ring = vfxMesh(v, asset.geometry, asset.material, g);
  ring.name = `weave-shock:${style}`;
  ring.position.set(x, 0.04, z);
  ring.scale.set(scale, 1, scale);
  attachWeaveFx(ring, v, { kind: 'shock', style, life: CUE_LIFE[kind] ?? 0.5, radius, scale, inward });
  return ring;
}

/** Hand a stock-shape cue mesh to the dissolving beam material. */
function energise(v, mesh, style, kind) {
  mesh.material = v.mat[ensureWeaveBeam(v, style)];
  attachWeaveFx(asVfx(mesh), v, { kind: 'beam', style, life: CUE_LIFE[kind] ?? 0.6 });
  return mesh;
}

/** Draw a cue at the actual triggered targets / area rather than a generic burst. */
export function buildWeaveCue(v, g, data, kind) {
  const material = solidMaterial(data.uid);
  const style = weaveStyle(data.uid ?? '');
  const origin = data.position ?? [0, 0, 0];
  const local = (p) => [p[0] - origin[0], 0.12, p[2] - origin[2]];
  const beam = (a, b, thickness = 0.2) => {
    const d = v.vector(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (d.lengthSq() < 1e-9) return null;
    const length = d.length();
    const mesh = v.mesh('shaft', material, g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, thickness, length, thickness);
    mesh.quaternion.setFromUnitVectors(v.up, d.normalize());
    return energise(v, mesh, style, kind);
  };

  if (kind === 'anchor-expire') {
    // Expiry unravels inward: two rings and a contracting front.
    v.ring(g, material, 0.7, 0.1);
    v.ring(g, material, 0.42, 0.16);
    shockwave(v, g, style, kind, 0.9, 0, 0, true);
    return true;
  }
  if (kind === 'anchor-break') {
    // Break bursts outward: pulsing shards thrown off a ring.
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      const shard = v.mesh('shard', material, g, Math.sin(a) * 0.42, 0.6, Math.cos(a) * 0.42, 0.08, 0.28, 0.08);
      shard.rotation.z = -a;
      shard.userData.weavePulse = { phase: i, base: shard.scale.clone(), amount: 0.25 };
    }
    v.ring(g, material, 0.65, 0.12);
    shockwave(v, g, style, kind, 1.3);
    return true;
  }
  if (data.weaveEffect === 'chain' && data.arcTargets?.length) {
    // Zig-zag arcs from the struck enemy to each chained one, with a ground
    // flash under every endpoint.
    for (const target of data.arcTargets.slice(0, 3)) {
      const end = local(target), from = [0, 0.95, 0], to = [end[0], 0.95, end[2]];
      const tx = to[0], tz = to[2], len = Math.hypot(tx, tz) || 1, nx = -tz / len, nz = tx / len;
      let prev = from;
      for (let i = 1; i <= 6; i++) {
        const t = i / 6, offset = i === 6 ? 0 : i % 2 ? 0.12 : -0.12;
        const next = [tx * t + nx * offset, 0.95, tz * t + nz * offset];
        beam(prev, next, 0.3);
        prev = next;
      }
      shockwave(v, g, style, kind, 0.6, end[0], end[2]);
    }
    shockwave(v, g, style, kind, 0.9);
    return true;
  }
  if (data.weaveEffect === 'flood' && data.triangle?.length === 3) {
    const [a, b, c] = data.triangle.map(local);
    beam(a, b);
    beam(b, c);
    beam(c, a);
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      beam(a.map((x, k) => x + (b[k] - x) * t), a.map((x, k) => x + (c[k] - x) * t), 0.12);
    }
    // Map the pooled unit triangle onto the real one: columns are the two
    // edges from `a`, so no geometry is allocated per flood.
    const asset = ensureWeaveFlood(v);
    const fill = vfxMesh(v, asset.geometry, asset.material, g);
    fill.name = 'weave-flood-fill';
    fill.matrixAutoUpdate = false;
    fill.matrix.set(
      b[0] - a[0], 0, c[0] - a[0], a[0],
      0, 1, 0, 0.05,
      b[2] - a[2], 0, c[2] - a[2], a[2],
      0, 0, 0, 1
    );
    attachWeaveFx(fill, v, { kind: 'flood', style: 'water', life: CUE_LIFE[kind] });
    return true;
  }
  if (data.weaveEffect === 'quake') {
    const r = data.radius ?? 2;
    v.ring(g, material, r, 0.1);
    v.ring(g, material, r * 0.65, 0.12);
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8, d = r * 0.82;
      const chip = v.mesh('shard', material, g, Math.sin(a) * d, 0.18, Math.cos(a) * d, 0.1, 0.25, 0.1);
      chip.rotation.z = a;
      energise(v, chip, style, kind);
    }
    shockwave(v, g, style, kind, r);
    return true;
  }
  if (data.weaveEffect === 'shatter' || data.weaveEffect === 'draft') {
    const r = data.radius ?? 1;
    for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10;
      const shard = v.mesh('shard', material, g, Math.sin(a) * r * 0.65, 0.35, Math.cos(a) * r * 0.65, 0.09, 0.35, 0.09);
      shard.rotation.z = -a;
      energise(v, shard, style, kind);
    }
    // The ring is drawn at exactly the gameplay radius.
    energise(v, v.ring(g, material, r, 0.1), style, kind);
    shockwave(v, g, style, kind, r);
    return true;
  }
  return false;
}
