import { BufferGeometry, Float32BufferAttribute, Mesh, Points } from 'three';
import { LAYER } from '../../../core/Layers.js';
import { MECHANIC_PRESETS, MECHANIC_VARIANTS } from './presets.js';
import { WORLDSHAPE_TERRAINS } from './WorldshapeLook.js';
import {
  attachWorldshapeFx,
  createWorldshapeLinesMaterial,
  createWorldshapeGroundMaterial,
  createWorldshapeVeilMaterial,
  createWorldshapeMotesMaterial,
  createWorldshapeSprayMaterial,
  createWorldshapeShimmerMaterial
} from './WorldshapeShaders.js';

/**
 * WorldshapeHeroGeometry — the shader layers every worldshape field carries,
 * on top of the solid rig (`worldshapeVisuals` for the five authored
 * terrains, the presentation's own ridges for Continental Uprising).
 *
 * ## Layers
 *
 *  1. **Field lines** (`createWorldshapeHero`) — the hero surface: ribbons
 *     authored per terrain in the unit disc — scorched cracks radiating, a
 *     six-fold glacier fern, storm zig-zags, flood channels running across,
 *     glass labyrinth arcs, continental contour rings — lifted onto the
 *     terrain's elevation cone in the vertex shader.
 *  2. **Ground treatment** — a polar disc with a per-terrain world-space
 *     shader (lava seams, rime fractures, ionised lattice, drifting caustics,
 *     prismatic facets, contour strata). It carries the rise front, the
 *     pre-pulse charge and the expiry gutter.
 *  3. **Boundary veil** — a low curtain on the field's rim that grows out of
 *     the ground: the "this is the affected area" telegraph.
 *  4. **Motes** — 36 points rising off the field (the original budget).
 *  5. **Spray** — a second system of 48 points with per-terrain behaviour.
 *  6. **Shimmer** — a distortion proxy (`LAYER.DISTORTION`).
 *
 * Every mesh's CPU vertices are inside the unit disc and the layer is scaled
 * by at most the field radius, so all of it stays within the authoritative
 * terrain radius (the tests transform every vertex to check). Geometry and
 * materials are built once per terrain, registered in the presentation's
 * `geo` / `mat` / `resources`, and disposed with it.
 */

/** Terrain identities that have a hero, in shader `identity` order. */
export const WORLDSHAPE_HEROES = Object.freeze(Object.keys(WORLDSHAPE_TERRAINS));

const TAU = Math.PI * 2;

function hash(n) {
  const s = Math.sin(n * 91.3 + 17.1) * 43758.5453;
  return s - Math.floor(s);
}

function finish(name, positions, uvs, indices, normals = false) {
  const g = new BufferGeometry();
  g.name = name;
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (uvs) g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (indices) g.setIndex(indices);
  if (normals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------------ */
/* Field lines                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The hero line drawing of one terrain, as flat ribbons in the unit disc.
 * Positions are part of the tested contract (60–900 vertices, unique and
 * deterministic per terrain, every vertex within radius 1).
 */
export function createWorldshapeHero(slug) {
  if (!WORLDSHAPE_HEROES.includes(slug)) throw new Error('Unknown worldshape hero');
  const positions = [], uvs = [], indices = [];
  /** A polyline of [x, z] points turned into a tapered strip `width` wide. */
  const ribbon = (points, width) => {
    const start = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i], p = points[Math.max(0, i - 1)], n = points[Math.min(points.length - 1, i + 1)];
      const dx = n[0] - p[0], dz = n[1] - p[1], len = Math.hypot(dx, dz) || 1;
      const w = width * (0.3 + 0.7 * Math.sin((Math.PI * (i + 0.5)) / points.length));
      positions.push(x - (dz / len) * w, 0, z + (dx / len) * w, x + (dz / len) * w, 0, z - (dx / len) * w);
      uvs.push(i / (points.length - 1), 0, i / (points.length - 1), 1);
      if (i) {
        const a = start + (i - 1) * 2, b = start + i * 2;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  if (slug === 'the-scorched-kingdom') {
    // Twelve wavering cracks radiating from the centre.
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6, points = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, r = 0.12 + t * 0.65, offset = 0.035 * Math.sin(t * 14 + k);
        points.push([Math.sin(a) * r + Math.cos(a) * offset, Math.cos(a) * r - Math.sin(a) * offset]);
      }
      ribbon(points, 0.024);
    }
  } else if (slug === 'glaciers-dominion') {
    // A six-fold fern: straight spokes with two pairs of fronds each.
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3, points = [];
      for (let i = 0; i <= 16; i++) {
        const r = (i / 16) * 0.78;
        points.push([Math.sin(a) * r, Math.cos(a) * r]);
      }
      ribbon(points, 0.026);
      for (const r of [0.32, 0.52])
        for (const side of [-1, 1])
          ribbon([[Math.sin(a) * r, Math.cos(a) * r],
            [Math.sin(a) * r + Math.sin(a + side * 0.8) * 0.19, Math.cos(a) * r + Math.cos(a + side * 0.8) * 0.19]], 0.02);
    }
  } else if (slug === 'stormground') {
    // Ten zig-zag discharges, jagged near the centre and straightening out.
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5, points = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, r = 0.12 + t * 0.66, off = (i % 2 ? 1 : -1) * 0.045 * (1 - t);
        points.push([Math.sin(a) * r + Math.cos(a) * off, Math.cos(a) * r - Math.sin(a) * off]);
      }
      ribbon(points, 0.018);
    }
  } else if (slug === 'the-living-floodplain') {
    // Seven meandering channels running across the disc.
    for (let k = -3; k <= 3; k++) {
      const x = k * 0.18, span = Math.sqrt(0.77 * 0.77 - x * x), points = [];
      for (let i = 0; i <= 24; i++) {
        const z = -span + (i / 24) * 2 * span;
        points.push([x + Math.sin((i / 24) * Math.PI * 2 + k) * 0.045, z]);
      }
      ribbon(points, 0.027);
    }
  } else if (slug === 'the-glass-labyrinth') {
    // Seven sectors of broken arcs with a radial corridor through each.
    for (let k = 0; k < 7; k++) {
      const a = (k * Math.PI * 2) / 7;
      for (const r of [0.35, 0.62]) {
        const points = [];
        for (let i = 0; i <= 8; i++) {
          const b = a + (i / 8 - 0.5) * 0.42;
          points.push([Math.sin(b) * r, Math.cos(b) * r]);
        }
        ribbon(points, 0.024);
      }
      ribbon([[0, 0], [Math.sin(a) * 0.76, Math.cos(a) * 0.76]], 0.018);
    }
  } else {
    // Continental: five rough contour rings, a topographic survey of the uplift.
    for (let k = 0; k < 5; k++) {
      const r = 0.18 + k * 0.145, points = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2, rough = 0.025 * Math.sin(a * 7 + k * 1.5);
        points.push([Math.sin(a) * (r + rough), Math.cos(a) * (r + rough)]);
      }
      ribbon(points, 0.023);
    }
  }
  const g = finish(`worldshape-hero:${slug}`, positions, uvs, indices);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------------ */
/* Ground disc, veil, spray, motes                                           */
/* ------------------------------------------------------------------------ */

/** Unit polar disc: the canvas of the ground treatment and the pulse ring. */
export function createWorldshapeGround() {
  const positions = [0, 0, 0], uvs = [0.5, 0], indices = [];
  const rings = 20, segments = 72;
  for (let j = 1; j <= rings; j++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU, r = j / rings;
      positions.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      uvs.push(i / segments, r);
    }
  for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 2 + i);
  for (let j = 1; j < rings; j++)
    for (let i = 0; i < segments; i++) {
      const a = 1 + (j - 1) * (segments + 1) + i, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return finish('worldshape-ground', positions, uvs, indices);
}

/** Open unit cylinder (radius 1, height 1) with outward normals. */
export function createWorldshapeVeil() {
  const positions = [], uvs = [], indices = [];
  const rows = 6, segments = 96;
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      positions.push(Math.sin(a), j / rows, Math.cos(a));
      uvs.push(i / segments, j / rows);
      if (i < segments && j < rows) {
        const p = j * (segments + 1) + i, q = p + segments + 1;
        indices.push(p, p + 1, q, p + 1, q + 1, q);
      }
    }
  return finish('worldshape-veil', positions, uvs, indices, true);
}

/** Thirty-six mote seeds: (x, phase, z) in the unit disc. */
function createMoteSeeds() {
  const a = [];
  for (let i = 0; i < 36; i++) {
    const angle = i * 2.399, r = 0.16 + (0.55 * ((i * 11) % 37)) / 36;
    a.push(Math.sin(angle) * r, (i + 0.5) / 36, Math.cos(angle) * r);
  }
  return finish('worldshapeMotes:geometry', a, null, null);
}

/** Forty-eight spray seeds: (angle, radius², phase). */
function createSpraySeeds() {
  const a = [];
  for (let i = 0; i < 48; i++) a.push(hash(i * 2.1), hash(i * 5.7 + 2), (i + 0.5) / 48);
  return finish('worldshapeSpray:geometry', a, null, null);
}

/* ------------------------------------------------------------------------ */
/* Registry + assembly                                                       */
/* ------------------------------------------------------------------------ */

function ensure(table, v, key, build) {
  if (!v[table][key]) {
    const r = build();
    r.name ||= key;
    v[table][key] = r;
    v.resources.push(r);
  }
  return v[table][key];
}

/** The collision height the field's layers must sit on (0 for flat fields). */
function elevationOf(uid) {
  return (MECHANIC_VARIANTS[uid] ?? MECHANIC_PRESETS.worldshape).height ?? 0;
}

/** A pooled-resource mesh on the VFX layer that casts no shadow. */
function vfxMesh(geometry, material, parent, name) {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.layers.set(LAYER.VFX);
  parent.add(mesh);
  return mesh;
}

function vfxPoints(geometry, material, parent, name, radius) {
  const points = new Points(geometry, material);
  points.name = name;
  points.scale.set(radius, 1, radius);
  points.frustumCulled = false; // the shader places every point
  points.layers.set(LAYER.VFX);
  parent.add(points);
  return points;
}

/**
 * Add every shader layer of a field to `group` (the presentation's item
 * root). Returns false when the uid has no hero or the radius is invalid.
 */
export function addWorldshapeHero(v, group, uid, radius) {
  const slug = (uid ?? MECHANIC_PRESETS.worldshape.uid).split('/').at(-1);
  if (!WORLDSHAPE_HEROES.includes(slug) || !Number.isFinite(radius) || radius <= 0) return false;
  const terrain = WORLDSHAPE_TERRAINS[slug];
  const elevation = elevationOf(uid ?? MECHANIC_PRESETS.worldshape.uid);
  const clock = v.terrainTime;
  const fx = (kind) => ({ kind, terrain, root: group });

  // 1 · Field lines (the hero).
  const lines = vfxMesh(
    ensure('geo', v, `worldshapeHero:${slug}`, () => createWorldshapeHero(slug)),
    ensure('mat', v, `worldshapeHeroMaterial:${slug}`, () => createWorldshapeLinesMaterial(slug, clock, elevation)),
    group, `worldshapeHero:${slug}`);
  lines.scale.set(radius, 1, radius);
  attachWorldshapeFx(lines, v, fx('lines'));

  // 2 · Ground treatment, a hair inside the rim.
  const ground = vfxMesh(
    ensure('geo', v, 'worldshapeGround:geometry', createWorldshapeGround),
    ensure('mat', v, `worldshapeGround:${slug}`, () => createWorldshapeGroundMaterial(slug, clock, elevation)),
    group, `worldshapeGround:${slug}`);
  ground.scale.set(radius * 0.97, 1, radius * 0.97);
  ground.renderOrder = -1; // under every rising layer
  attachWorldshapeFx(ground, v, fx('ground'));

  // 3 · Boundary veil on the rim. Its height is a live uniform.
  const veil = vfxMesh(
    ensure('geo', v, 'worldshapeVeil:geometry', createWorldshapeVeil),
    ensure('mat', v, `worldshapeVeil:${slug}`, () => createWorldshapeVeilMaterial(slug, clock, elevation)),
    group, `worldshapeVeil:${slug}`);
  veil.scale.set(radius * 0.985, 1, radius * 0.985);
  veil.frustumCulled = false; // live height uniform; CPU bounds are a unit cylinder
  attachWorldshapeFx(veil, v, fx('veil'));

  // 4 · Motes (36, the original budget) and 5 · spray (48).
  const motes = vfxPoints(
    ensure('geo', v, 'worldshapeMotes:geometry', createMoteSeeds),
    ensure('mat', v, `worldshapeMotes:${slug}`, () => createWorldshapeMotesMaterial(slug, clock, elevation)),
    group, `worldshapeMotes:${slug}`, radius);
  attachWorldshapeFx(motes, v, fx('motes'));
  const spray = vfxPoints(
    ensure('geo', v, 'worldshapeSpray:geometry', createSpraySeeds),
    ensure('mat', v, `worldshapeSpray:${slug}`, () => createWorldshapeSprayMaterial(slug, clock, elevation)),
    group, `worldshapeSpray:${slug}`, radius);
  attachWorldshapeFx(spray, v, fx('spray'));

  // 6 · Shimmer column over the middle of the field.
  const shimmer = vfxMesh(
    ensure('geo', v, 'worldshapeVeil:geometry', createWorldshapeVeil),
    ensure('mat', v, 'worldshapeShimmer', () => createWorldshapeShimmerMaterial(clock)),
    group, `worldshapeShimmer:${slug}`);
  shimmer.scale.set(radius * 0.62, 1, radius * 0.62);
  shimmer.layers.set(LAYER.DISTORTION);
  shimmer.frustumCulled = false;
  attachWorldshapeFx(shimmer, v, fx('shimmer'));
  return true;
}
