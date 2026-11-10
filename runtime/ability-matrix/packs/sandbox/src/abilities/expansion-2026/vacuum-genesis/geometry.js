import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  Vector2,
  Vector3,
} from 'three';

/**
 * Vacuum Genesis — procedural geometry.
 *
 * The pocket is not a sphere. It is a **bubble resting on a floor**: a
 * superellipse dome with full shoulders, standing on a meniscus lip that
 * curls out and down into the ground the way a soap film meets a wet plate.
 * Its shape is a function of three live settings (radius, dome height, lip
 * curl), so the meshes here carry only *parameters* — azimuth and profile
 * position — and the vertex shaders place every vertex from `profileGLSL`.
 * `domePoint` is the same function in JavaScript, so the knots and plates the
 * CPU places sit exactly on the skin the GPU draws.
 *
 *  - **the seed** — a faceted spindle (seven-sided lathe, flat shaded).
 *  - **the skin / the void / the lens** — one parametric grid, three
 *    materials.
 *  - **the cosmic web** — tubes along great arcs between Fibonacci knots on
 *    the dome, each edge oriented low → high so the web crawls *up* the skin;
 *    the cross-section is an offset the shader applies in the skin's frame.
 *  - **the knots** — small icosahedra, instanced (not the hero; carriers).
 *  - **the plates** — irregular bevelled shell plates of new rock, extruded
 *    from a jittered outline.
 *
 * Everything is built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;
/** Profile parameter where the lip ends and the dome begins. */
export const LIP_T = 0.14;
/** Superellipse exponent of the dome: > 2 gives the bubble full shoulders. */
export const DOME_N = 2.2;

/* ---------------------------------------------------------------------- */
/* The profile — shared by JS and GLSL                                     */
/* ---------------------------------------------------------------------- */

/**
 * GLSL twin of `domePoint`. `t` runs 0 (outer edge of the lip, on the floor)
 * → `LIP_T` (top of the lip) → 1 (crown). Returns (radius, height) in metres.
 */
export const profileGLSL = /* glsl */ `
  const float LIP_T = ${LIP_T.toFixed(4)};
  const float DOME_P = ${(2 / DOME_N).toFixed(5)};
  vec2 pocketProfile(float t, float R, float H, float lip) {
    float y0 = 0.9 * lip * R;
    if (t < LIP_T) {
      float s = t / LIP_T;
      float k = 1.0 - s;
      return vec2(R * (1.0 + lip * k * k), y0 * s * s);
    }
    float s = (t - LIP_T) / (1.0 - LIP_T);
    float th = s * 1.5707963;
    float r = pow(max(cos(th), 0.0), DOME_P);
    float y = pow(max(sin(th), 0.0), DOME_P);
    return vec2(R * r, y0 + (H - y0) * y);
  }
  // Standing-wave ripple of the skin, in metres along the normal.
  float pocketWobble(float az, float t, float clock, float amp, float modes, float speed) {
    float s = clamp((t - LIP_T) / (1.0 - LIP_T), 0.0, 1.0);
    float body = sin(3.14159265 * s);
    return amp * (body * sin(modes * az + 0.7) * cos(speed * clock)
      + 0.5 * body * sin(9.42477796 * s - speed * 1.3 * clock));
  }
`;

/**
 * A point on the pocket skin (undisplaced). `t` as in `profileGLSL`.
 * @returns {Vector3} `out`, in the pocket's local frame (centre on the floor)
 */
export function domePoint(az, t, R, H, lip, out) {
  const y0 = 0.9 * lip * R;
  let r;
  let y;
  if (t < LIP_T) {
    const s = t / LIP_T;
    const k = 1 - s;
    r = R * (1 + lip * k * k);
    y = y0 * s * s;
  } else {
    const s = (t - LIP_T) / (1 - LIP_T);
    const th = s * Math.PI * 0.5;
    r = R * Math.pow(Math.max(Math.cos(th), 0), 2 / DOME_N);
    y = y0 + (H - y0) * Math.pow(Math.max(Math.sin(th), 0), 2 / DOME_N);
  }
  return out.set(Math.cos(az) * r, y, Math.sin(az) * r);
}

/** JS twin of `pocketWobble`. */
export function domeWobble(az, t, clock, amp, modes, speed) {
  const s = Math.min(1, Math.max(0, (t - LIP_T) / (1 - LIP_T)));
  const body = Math.sin(Math.PI * s);
  return amp * (body * Math.sin(modes * az + 0.7) * Math.cos(speed * clock) +
    0.5 * body * Math.sin(3 * Math.PI * s - speed * 1.3 * clock));
}

/** Profile parameter for an elevation fraction on the dome (0 lip top → 1 crown). */
export function domeT(elevation) {
  return LIP_T + (1 - LIP_T) * elevation;
}

/* ---------------------------------------------------------------------- */
/* The seed                                                                */
/* ---------------------------------------------------------------------- */

/** A faceted spindle: a seven-sided, flat-shaded lathe, unit radius. */
export function createSeedGeometry() {
  const profile = [
    [0.0, -1.0], [0.34, -0.62], [0.62, -0.14], [0.58, 0.22], [0.36, 0.62], [0.12, 0.92], [0.0, 1.05],
  ].map(([r, y]) => new Vector2(r, y));
  const lathe = new LatheGeometry(profile, 7);
  const g = lathe.toNonIndexed();
  lathe.dispose();
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The pocket grid                                                          */
/* ---------------------------------------------------------------------- */

/**
 * The parametric grid the skin, void and lens shaders bend into a bubble.
 * `uv.x` = azimuth / 2π, `uv.y` = profile `t`. CPU positions are the nominal
 * shape (R 1, H 0.82, lip 0.16) so bounds and the depth prepass are sane.
 */
export function createPocketGeometry(segments = 96, rings = 56) {
  const positions = [];
  const uvs = [];
  const index = [];
  const p = new Vector3();
  // Rings are spaced denser in the lip, where the curvature is.
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const t = v < 0.25 ? (v / 0.25) * LIP_T : LIP_T + ((v - 0.25) / 0.75) * (1 - LIP_T);
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      domePoint(u * TAU, t, 1, 0.82, 0.16, p);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, t);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      const b = a + row;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The cosmic web                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Knot bearings on the dome: a Fibonacci spiral over the upper hemisphere,
 * as (azimuth, elevation fraction 0..1). Deterministic.
 * @returns {Float32Array} [az0, el0, az1, el1, …]
 */
export function createWebNodes(count) {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    // Uniform in height on the hemisphere → elevation from asin, kept off the lip.
    const h = 0.08 + 0.9 * ((i + 0.5) / count);
    const el = Math.asin(h) / (Math.PI * 0.5);
    out[i * 2] = (i * 2.399963) % TAU;
    out[i * 2 + 1] = Math.min(0.97, el);
  }
  // The crown knot: every thread climbs toward it.
  out[(count - 1) * 2 + 1] = 1;
  return out;
}

/**
 * Tubes along great arcs between neighbouring knots.
 *
 * Attributes (no baked position is used by the shader; `position` is the
 * nominal shape for bounds):
 *  - `aArc`   (azimuth, elevation) of the tube's spine point
 *  - `aCross` (cos, sin) of the cross-section angle
 *  - `aEdge`  (t along the edge 0..1, start time 0..1, hash, edge length)
 *  - `aTan`   the spine's heading in (azimuth, elevation) space
 */
export function createWebGeometry(nodes, { neighbours = 3, segments = 14, sides = 5 } = {}) {
  const count = nodes.length / 2;
  const dirs = [];
  for (let i = 0; i < count; i++) {
    const az = nodes[i * 2];
    const el = nodes[i * 2 + 1] * Math.PI * 0.5;
    dirs.push(new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)));
  }
  // k nearest neighbours by angle, deduplicated.
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    const order = [];
    for (let j = 0; j < count; j++) if (j !== i) order.push([dirs[i].angleTo(dirs[j]), j]);
    order.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < neighbours && k < order.length; k++) {
      const j = order[k][1];
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Orient low → high so the thread grows upward.
      edges.push(nodes[i * 2 + 1] <= nodes[j * 2 + 1] ? [i, j] : [j, i]);
    }
  }

  const positions = [];
  const arc = [];
  const cross = [];
  const edge = [];
  const tangent = [];
  const index = [];
  const d = new Vector3();
  const q = new Vector3();
  const p = new Vector3();
  let base = 0;
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e];
    const angle = dirs[a].angleTo(dirs[b]);
    const sinA = Math.max(1e-4, Math.sin(angle));
    const lowEl = nodes[a * 2 + 1];
    const start = Math.min(0.92, lowEl * 0.82);
    const hash = ((Math.sin(e * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      // Slerp the bearing.
      const wa = Math.sin((1 - t) * angle) / sinA;
      const wb = Math.sin(t * angle) / sinA;
      d.copy(dirs[a]).multiplyScalar(wa).addScaledVector(dirs[b], wb).normalize();
      const az = Math.atan2(d.z, d.x);
      const el = Math.asin(Math.min(1, Math.max(-1, d.y))) / (Math.PI * 0.5);
      // The spine's heading in (azimuth, elevation) space, for the cross-section frame.
      const t2 = Math.min(1, t + 0.02);
      const w2a = Math.sin((1 - t2) * angle) / sinA;
      const w2b = Math.sin(t2 * angle) / sinA;
      q.copy(dirs[a]).multiplyScalar(w2a).addScaledVector(dirs[b], w2b).normalize();
      let dAz = Math.atan2(q.z, q.x) - az;
      if (dAz > Math.PI) dAz -= TAU;
      if (dAz < -Math.PI) dAz += TAU;
      const dEl = Math.asin(Math.min(1, Math.max(-1, q.y))) / (Math.PI * 0.5) - el;
      const len = Math.hypot(dAz * Math.cos(el * Math.PI * 0.5), dEl) || 1;
      domePoint(az, domeT(el), 1, 0.82, 0.16, p);
      for (let k = 0; k < sides; k++) {
        const c = (k / sides) * TAU;
        positions.push(p.x, p.y, p.z);
        arc.push(az, el);
        cross.push(Math.cos(c), Math.sin(c));
        edge.push(t, start, hash, angle);
        tangent.push(dAz / len, dEl / len);
      }
    }
    for (let s = 0; s < segments; s++) {
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        const i0 = base + s * sides + k;
        const i1 = base + s * sides + k1;
        const j0 = base + (s + 1) * sides + k;
        const j1 = base + (s + 1) * sides + k1;
        index.push(i0, j0, i1, i1, j0, j1);
      }
    }
    base += (segments + 1) * sides;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('aArc', new Float32BufferAttribute(arc, 2));
  g.setAttribute('aCross', new Float32BufferAttribute(cross, 2));
  g.setAttribute('aEdge', new Float32BufferAttribute(edge, 4));
  g.setAttribute('aTan', new Float32BufferAttribute(tangent, 2));
  g.setIndex(index);
  g.userData.edgeCount = edges.length;
  return g;
}

/** Condensation knot: a carrier for the knot shader. */
export function createKnotGeometry() {
  return new IcosahedronGeometry(1, 1);
}

/* ---------------------------------------------------------------------- */
/* The plates of new rock                                                  */
/* ---------------------------------------------------------------------- */

/**
 * An irregular shell plate: a jittered seven-sided outline, extruded with a
 * bevel so the rims catch the sun. Unit size, centred, thickness along Z.
 */
export function createPlateGeometry(seed = 3) {
  const shape = new Shape();
  const sides = 7;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU + Math.sin(seed + i * 1.7) * 0.22;
    const r = 0.42 + 0.14 * Math.sin(seed * 2.3 + i * 2.9);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.82;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.translate(0, 0, -0.08);
  g.computeVertexNormals();
  return g;
}

/** Unit quad lying in XY; callers rotate it flat. */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
