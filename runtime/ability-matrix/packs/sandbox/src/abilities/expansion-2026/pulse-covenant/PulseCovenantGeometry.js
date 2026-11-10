import { BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Float32BufferAttribute, Shape, Sphere, Vector3 } from 'three';

/**
 * Pulse Covenant — authored procedural geometry.
 *
 *  - `heartGeometry`       the suspended heart: an authored two-lobed profile
 *                          extruded and heavily bevelled so it reads as muscle
 *  - `vesselCurves`        the six arteries draping from it to the floor, each
 *                          with one capillary fork (the beads ride the six)
 *  - `taperedTube`         a tube swept along a curve whose radius tapers, so
 *                          vessels thin toward their ends like vessels do
 *  - `bloodCellGeometry`   a biconcave disc — the beads are red cells
 *  - `gateRingGeometry`    the timing gate on the floor, twelve tick marks
 *  - `pulseRingGeometry`   the flat ring a secondary pulse (and each beat wave) throws
 *  - `threadTubeGeometry`  a parametric tube the thread shader arches to a body
 *
 * All built once per ability instance.
 */

const TAU = Math.PI * 2;

function hash(n) {
  const s = Math.sin(n * 63.7 + 12.9) * 43758.5453;
  return s - Math.floor(s);
}

function finish(positions, uvs, indices, extra) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (extra) for (const [name, data, size] of extra) geometry.setAttribute(name, new Float32BufferAttribute(data, size));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The heart: two lobes and a pointed apex drawn with four béziers, extruded
 * with a deep bevel so the silhouette is rounded muscle rather than a cookie
 * cutter. Centred on its own bounding box so it beats about its middle.
 */
export function heartGeometry() {
  const s = new Shape();
  s.moveTo(0, -0.8);
  s.bezierCurveTo(-0.6, -0.36, -0.78, 0.08, -0.65, 0.4);
  s.bezierCurveTo(-0.5, 0.78, -0.15, 0.74, 0, 0.48);
  s.bezierCurveTo(0.15, 0.74, 0.5, 0.78, 0.65, 0.4);
  s.bezierCurveTo(0.78, 0.08, 0.6, -0.36, 0, -0.8);
  const geometry = new ExtrudeGeometry(s, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSegments: 6,
    steps: 2,
    bevelSize: 0.14,
    bevelThickness: 0.16,
    curveSegments: 32
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The vessel network: six arteries leaving the heart's base and draping out
 * to the floor in a ring (the curve the beads ride), plus one capillary per
 * artery forking off a third of the way down. Returns `{ arteries, forks }`.
 */
export function vesselCurves() {
  const arteries = [], forks = [];
  for (let k = 0; k < 6; k++) {
    const angle = (k * TAU) / 6;
    const points = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const rad = 0.25 + t * 1.65;
      const a = angle + Math.sin(t * 4 + k) * 0.12;
      points.push(new Vector3(Math.sin(a) * rad, 1.25 * (1 - t) + 0.12, Math.cos(a) * rad));
    }
    const artery = new CatmullRomCurve3(points);
    arteries.push(artery);
    // A capillary leaving at ~35 %, peeling off to one side and down.
    const start = artery.getPoint(0.35);
    const side = (k % 2 ? 1 : -1) * (0.35 + hash(k) * 0.2);
    const fork = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const a = angle + side * t;
      const rad = Math.hypot(start.x, start.z) + t * (0.6 + hash(k + 9) * 0.3);
      fork.push(new Vector3(Math.sin(a) * rad, start.y * (1 - t) + 0.1 * t, Math.cos(a) * rad));
    }
    forks.push(new CatmullRomCurve3(fork));
  }
  return { arteries, forks };
}

/**
 * Sweep a circle along `curve`, radius tapering `r0 → r1` (with a slight
 * swelling at the root where the vessel leaves the heart). `uv.x` runs along
 * the vessel, `uv.y` round it — the artery shader runs the blood along x.
 */
export function taperedTube(curve, segments = 48, radial = 8, r0 = 0.045, r1 = 0.02) {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], uvs = [], indices = [];
  const p = new Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = (r0 + (r1 - r0) * t) * (1 + 0.35 * Math.exp(-t * 14));
    const n = frames.normals[i], b = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a), cy = Math.sin(a);
      positions.push(p.x + r * (cx * n.x + cy * b.x), p.y + r * (cx * n.y + cy * b.y), p.z + r * (cx * n.z + cy * b.z));
      uvs.push(t, j / radial);
      if (i < segments && j < radial) {
        const v = i * (radial + 1) + j;
        indices.push(v, v + radial + 1, v + 1, v + 1, v + radial + 1, v + radial + 2);
      }
    }
  }
  return finish(positions, uvs, indices);
}

/** A red cell: a biconcave disc, 0.11 m across, dimpled on both faces. */
export function bloodCellGeometry(rings = 7, segments = 14) {
  const positions = [], uvs = [], indices = [];
  // Profile from the axis (r = 0) out round the rim and back.
  const profile = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const r = s * 0.055;
    // Thin at the dimple, thickest three-quarters out, pinched to the rim.
    const h = 0.006 + 0.022 * Math.pow(s, 2) * (1 - Math.pow(s, 8));
    profile.push([r, h]);
  }
  const loop = [...profile, ...profile.slice(0, -1).reverse().map(([r, h]) => [r, -h])];
  for (let j = 0; j < loop.length; j++) {
    const [r, h] = loop[j];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      positions.push(Math.cos(a) * r, h, Math.sin(a) * r);
      uvs.push(i / segments, j / (loop.length - 1));
      if (j < loop.length - 1 && i < segments) {
        const v = j * (segments + 1) + i;
        indices.push(v, v + 1, v + segments + 1, v + 1, v + segments + 2, v + segments + 1);
      }
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * The timing gate laid round the heart: a thin unit ring with twelve tick
 * marks pointing inward, like a clock face. `aRole` is 0 on the ring and 1 on
 * the ticks; `uv.x` is the angle fraction, `uv.y` across the band.
 */
export function gateRingGeometry() {
  const positions = [], uvs = [], roles = [], indices = [];
  const vertex = (x, z, u, v, role) => {
    positions.push(x, 0, z);
    uvs.push(u, v);
    roles.push(role);
    return positions.length / 3 - 1;
  };
  const steps = 120;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU, b = ((i + 1) / steps) * TAU;
    const n0 = vertex(Math.cos(a) * 0.95, Math.sin(a) * 0.95, i / steps, 0, 0);
    const n1 = vertex(Math.cos(a), Math.sin(a), i / steps, 1, 0);
    const n2 = vertex(Math.cos(b), Math.sin(b), (i + 1) / steps, 1, 0);
    const n3 = vertex(Math.cos(b) * 0.95, Math.sin(b) * 0.95, (i + 1) / steps, 0, 0);
    indices.push(n0, n1, n2, n0, n2, n3);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
    const w = k % 3 === 0 ? 0.03 : 0.016;
    const r1 = k % 3 === 0 ? 0.8 : 0.87;
    const n0 = vertex(dx * 0.95 + nx * w, dz * 0.95 + nz * w, k / 12, 0, 1);
    const n1 = vertex(dx * 0.95 - nx * w, dz * 0.95 - nz * w, k / 12, 0, 1);
    const n2 = vertex(dx * r1, dz * r1, k / 12, 1, 1);
    indices.push(n0, n1, n2);
  }
  return finish(positions, uvs, indices, [['aRole', roles, 1]]);
}

/** The pulse ring: a flat unit annulus, inner radius 0.55; `uv.y` radial. */
export function pulseRingGeometry(segments = 96, rings = 4) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const r = 0.55 + 0.45 * v;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      uvs.push(i / segments, v);
      if (j < rings && i < segments) {
        const n = j * (segments + 1) + i;
        indices.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1);
      }
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * A covenant thread in parametric form: `position` holds (t along the
 * thread, cos, sin) round it, and the thread shader bends it along an arch
 * from the heart to a body every frame. Built once; the target can move.
 */
export function threadTubeGeometry(segments = 36, radial = 7) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      positions.push(t, Math.cos(a), Math.sin(a));
      uvs.push(t, j / radial);
      if (i < segments && j < radial) {
        const v = i * (radial + 1) + j;
        indices.push(v, v + radial + 1, v + 1, v + 1, v + radial + 1, v + radial + 2);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // The shader places it; a generous sphere keeps it from being culled.
  geometry.boundingSphere = new Sphere(new Vector3(), 64);
  return geometry;
}
