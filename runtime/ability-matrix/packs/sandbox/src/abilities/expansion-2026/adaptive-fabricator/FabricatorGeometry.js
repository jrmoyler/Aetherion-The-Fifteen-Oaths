import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
} from 'three';

/**
 * Adaptive Fabricator — the procedural meshes.
 *
 * Nothing here is a stock primitive. The housing is built from faceted
 * lathes (a profile swept round six sides, so every ring is a hexagon and the
 * flats catch the key light as panels), the emitter vanes are extruded from a
 * slotted, asymmetric outline, and the effect meshes (seed, halo, arrival
 * ring, beam) are hand-indexed buffers whose UVs the shaders read as
 * (around, along) coordinates.
 *
 * Every function returns a fresh geometry and allocates only at construction.
 */

const TAU = Math.PI * 2;

/**
 * Sweep an [r, y] profile round `sides` facets, non-indexed so each facet
 * keeps its own flat normal. `uv.x` is the bearing (0..1), `uv.y` the profile
 * parameter (0..1), which the housing shader uses for panel seams.
 *
 * @param {Array<[number, number]>} profile bottom → top
 * @param {number} sides   facets round the axis
 * @param {number} twist   radians the facets are rotated (aligns hex flats)
 */
export function facetedLathe(profile, sides = 6, twist = Math.PI / 6) {
  const positions = [];
  const uvs = [];
  const ring = (i, j) => {
    const a = (i / sides) * TAU + twist;
    const [r, y] = profile[j];
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  const push = (p, u, v) => {
    positions.push(p[0], p[1], p[2]);
    uvs.push(u, v);
  };
  const rows = profile.length - 1;
  for (let i = 0; i < sides; i++) {
    for (let j = 0; j < rows; j++) {
      const a = ring(i, j);
      const b = ring(i + 1, j);
      const c = ring(i, j + 1);
      const d = ring(i + 1, j + 1);
      const u0 = i / sides;
      const u1 = (i + 1) / sides;
      const v0 = j / rows;
      const v1 = (j + 1) / rows;
      // Winding gives outward normals for a profile running bottom → top.
      push(a, u0, v0); push(c, u0, v1); push(b, u1, v0);
      push(b, u1, v0); push(c, u0, v1); push(d, u1, v1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The plinth: a stepped hexagonal foot with a chamfered skirt, a recessed
 * waist and a collar the mast sits in. Closed underneath by its first ring
 * (radius 0) so it never shows a hole at a low camera.
 */
export function createPlinthGeometry() {
  return facetedLathe([
    [0.0, 0.0],
    [0.92, 0.0],
    [0.98, 0.05], // chamfered toe
    [0.9, 0.12],
    [0.78, 0.16], // first step
    [0.74, 0.24],
    [0.6, 0.27], // recessed waist
    [0.62, 0.33],
    [0.36, 0.38], // collar
    [0.3, 0.42],
    [0.0, 0.42],
  ]);
}

/** The mast: a tapering hex column with two collars and a socket on top. */
export function createMastGeometry() {
  return facetedLathe([
    [0.24, 0.0],
    [0.22, 0.18],
    [0.27, 0.22], // lower collar
    [0.27, 0.3],
    [0.18, 0.34],
    [0.15, 0.82],
    [0.22, 0.86], // upper collar
    [0.22, 0.95],
    [0.12, 1.0],
  ]);
}

/**
 * The energy core: an elongated hex crystal with bevelled shoulders. It is
 * centred on the origin so the head can kick it without re-centring.
 */
export function createCoreGeometry() {
  return facetedLathe([
    [0.0, -0.36],
    [0.2, -0.27],
    [0.3, -0.12],
    [0.31, 0.12],
    [0.22, 0.26],
    [0.0, 0.36],
  ]);
}

/**
 * The cradle the core sits in: a hex ring with a lip, open at the middle so
 * the core shows through. Swept with a hole profile (inner wall back down).
 */
export function createCradleGeometry() {
  return facetedLathe([
    [0.36, -0.22],
    [0.46, -0.18],
    [0.48, -0.06],
    [0.42, 0.02],
    [0.36, 0.0],
    [0.36, -0.22],
  ]);
}

/**
 * A clamp foot: a low wedge that braces the plinth against the floor. Three
 * of them are placed round the base so the sentry reads as anchored rather
 * than balanced.
 */
export function createFootGeometry() {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.62, 0);
  shape.lineTo(0.62, 0.05);
  shape.lineTo(0.18, 0.22);
  shape.lineTo(0, 0.22);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -0.08);
  return geometry;
}

/**
 * One emitter vane: an asymmetric blade with a long slot through it and a
 * notch at the tip where the emitter barrel seats. Extruded with a small
 * bevel so its edges catch a highlight.
 */
export function createVaneGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.13, 0);
  shape.lineTo(0.13, 0);
  shape.lineTo(0.2, 0.42);
  shape.lineTo(0.21, 0.72);
  shape.lineTo(0.09, 0.97);
  shape.lineTo(0.02, 0.9); // emitter notch
  shape.lineTo(-0.06, 0.95);
  shape.lineTo(-0.19, 0.66);
  shape.lineTo(-0.17, 0.3);
  shape.closePath();
  // The slot lightens the blade and gives it a mechanical read at distance.
  const slot = new Path();
  slot.moveTo(-0.035, 0.16);
  slot.lineTo(0.04, 0.16);
  slot.lineTo(0.07, 0.6);
  slot.lineTo(0.0, 0.66);
  slot.lineTo(-0.06, 0.58);
  slot.closePath();
  shape.holes.push(slot);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -0.025);
  return geometry;
}

/** The emitter barrel at each vane tip: a lathe with a flared muzzle. */
export function createEmitterGeometry() {
  return facetedLathe(
    [
      [0.0, -0.12],
      [0.05, -0.12],
      [0.05, -0.04],
      [0.035, -0.02],
      [0.035, 0.08],
      [0.06, 0.12], // flared muzzle
      [0.045, 0.13],
      [0.0, 0.11],
    ],
    8,
    0,
  );
}

/**
 * The segmented halo: twelve broken arcs with a raised tick at each end, so
 * it reads as a mechanical ring and its rotation is visible (a smooth torus
 * turning on its own axis is indistinguishable from one standing still).
 * `uv.x` runs round the ring, `uv.y` across the band.
 */
export function createHaloGeometry(radius = 0.6, width = 0.05, segments = 12) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const steps = 6;
  const gap = 0.18; // fraction of each segment left open
  for (let s = 0; s < segments; s++) {
    const a0 = (s / segments) * TAU;
    const a1 = ((s + 1 - gap) / segments) * TAU;
    const base = positions.length / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const a = a0 + (a1 - a0) * t;
      // Ends of each arc stand proud: the tick.
      const tick = k === 0 || k === steps ? 1.6 : 1;
      const inner = radius - width * tick;
      const outer = radius + width * tick;
      positions.push(Math.cos(a) * inner, 0, Math.sin(a) * inner);
      positions.push(Math.cos(a) * outer, 0, Math.sin(a) * outer);
      const u = (s + t * (1 - gap)) / segments;
      uvs.push(u, 0, u, 1);
    }
    for (let k = 0; k < steps; k++) {
      const i = base + k * 2;
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The arrival ring at a struck target: a flat band with eight chevron teeth
 * pointing inward, so it reads as a lock-on reticle closing on the body.
 * `uv.x` round, `uv.y` 0 inner → 1 outer.
 */
export function createReticleGeometry(segments = 64) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * TAU;
    // Eight teeth: the inner edge dips toward the centre in a sharp chevron.
    const tooth = Math.pow(Math.abs(Math.cos(a * 4)), 24);
    const inner = 0.8 - tooth * 0.35;
    positions.push(Math.cos(a) * inner, 0, Math.sin(a) * inner);
    positions.push(Math.cos(a), 0, Math.sin(a));
    uvs.push(t, 0, t, 1);
  }
  for (let i = 0; i < segments; i++) {
    const k = i * 2;
    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The beam: three ribbons crossed at 60° about +Y, one metre long, so a
 * camera at any bearing sees at least one face-on. `uv.x` across (0..1),
 * `uv.y` along (0 at the emitter, 1 at the target).
 */
/** Segments along the bolt: enough for the arc the beam shader bends into it. */
const BEAM_SEGMENTS = 20;

export function createBeamGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r < 3; r++) {
    const a = (r / 3) * Math.PI;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const base = positions.length / 3;
    for (let j = 0; j <= BEAM_SEGMENTS; j++) {
      const v = j / BEAM_SEGMENTS;
      positions.push(-x, v, -z, x, v, z);
      uvs.push(0, v, 1, v);
    }
    for (let j = 0; j < BEAM_SEGMENTS; j++) {
      const k = base + j * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The fabrication seed: a faceted bipyramid with four swept fins. Unit
 * half-height; `uv.y` runs tip to tip so the shader can band it.
 */
export function createSeedGeometry() {
  const positions = [];
  const uvs = [];
  const tri = (a, b, c, va, vb, vc) => {
    positions.push(...a, ...b, ...c);
    uvs.push(0, va, 0.5, vb, 1, vc);
  };
  const top = [0, 1, 0];
  const bottom = [0, -1, 0];
  const ring = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ring.push([Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42]);
  }
  for (let i = 0; i < 6; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 6];
    tri(a, top, b, 0.5, 1, 0.5);
    tri(b, bottom, a, 0.5, 0, 0.5);
  }
  // Swept fins: flat blades off alternate vertices of the waist.
  for (let i = 0; i < 6; i += 2) {
    const a = (i / 6) * TAU;
    const out = [Math.cos(a) * 0.95, -0.2, Math.sin(a) * 0.95];
    const up = [Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3];
    const dn = [Math.cos(a) * 0.3, -0.45, Math.sin(a) * 0.3];
    tri(up, out, dn, 0.8, 0.4, 0.2);
    tri(dn, out, up, 0.2, 0.4, 0.8);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** A unit quad in the XY plane, centred on the floor line (y 0..1). */
export function createBillboardGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3),
  );
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** A flat unit disc (radius 1) in XZ for the scan floor; `uv` spans the square. */
export function createDiscGeometry(segments = 72) {
  const positions = [0, 0, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    positions.push(Math.cos(a), 0, Math.sin(a));
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 1; i <= segments; i++) indices.push(0, i + 1, i);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
