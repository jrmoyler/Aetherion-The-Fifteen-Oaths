import { BufferAttribute, BufferGeometry, LatheGeometry, Vector2 } from 'three';

/**
 * Procedural geometry for Vigil of Embers, authored in metres.
 *
 * The sanctuary is architecture, so it is built like architecture: pointed
 * two-centred arches swept with a real rectangular section (bases, capitals
 * and a keystone swell out of the same sweep), bells turned from a bell
 * founder's profile, a crown of flame tines, a column of light. The shaders
 * read `uv` — never world position — so the patterns hold while the rig sinks,
 * scales and turns.
 */

const TAU = Math.PI * 2;

function finish(positions, uvs, indices) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A pointed (two-centred) gothic arch on two pillars, swept with a box
 * section. Local origin is the springing line: pillars run from y = -1 (the
 * floor, when the arch stands at y = 1) up to y = 0, the arch rises to its
 * apex at y = 1.05, spanning x ∈ [-0.62, 0.62].
 *
 * The section swells at the bases, at the capitals where the arch springs and
 * at the keystone, so the silhouette has the masonry beats without a second
 * mesh. `uv.x` is arc length along the whole sweep (0 at the left foot, 1 at
 * the right), `uv.y` walks the four faces of the section (0..1).
 */
export function vigilArchGeometry() {
  const span = 0.62;
  const apex = 1.05;
  // Two-centred arch: each side is an arc whose centre sits `d` across the
  // axis, chosen so the arcs meet at the apex height.
  const d = (apex * apex - span * span) / (2 * span);
  const R = span + d;
  const path = [];
  const pillarSteps = 10;
  const arcSteps = 18;
  for (let i = 0; i <= pillarSteps; i++) path.push([-span, -1 + i / pillarSteps]);
  const phiEnd = Math.acos(-d / R); // where the left arc reaches the axis (x = 0)
  for (let i = 1; i <= arcSteps; i++) {
    const phi = Math.PI - (Math.PI - phiEnd) * (i / arcSteps);
    path.push([d + Math.cos(phi) * R, Math.sin(phi) * R]);
  }
  for (let i = arcSteps - 1; i >= 0; i--) {
    const phi = Math.PI - (Math.PI - phiEnd) * (i / arcSteps);
    path.push([-(d + Math.cos(phi) * R), Math.sin(phi) * R]);
  }
  for (let i = pillarSteps - 1; i >= 0; i--) path.push([span, -1 + i / pillarSteps]);

  // Arc-length parameter along the sweep.
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  const total = lengths.at(-1);
  const springAt = lengths[pillarSteps] / total;

  /** Section half-width (in the arch plane) at sweep fraction u. */
  const width = (u) => {
    const bump = (centre, w) => Math.exp(-((u - centre) * (u - centre)) / (w * w));
    return 0.06 + 0.035 * (bump(0, 0.03) + bump(1, 0.03)) + 0.03 * (bump(springAt, 0.02) + bump(1 - springAt, 0.02)) + 0.035 * bump(0.5, 0.025);
  };
  const depth = 0.05;

  const positions = [];
  const uvs = [];
  const indices = [];
  // Each face gets its own vertices so the box edges stay hard.
  for (let face = 0; face < 4; face++) {
    const base = positions.length / 3;
    for (let i = 0; i < path.length; i++) {
      const u = lengths[i] / total;
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      let tx = next[0] - prev[0];
      let ty = next[1] - prev[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      const w = width(u);
      // Corners of the section, walked round: (+n,+z) (+n,-z) (-n,-z) (-n,+z).
      const corner = (k) => {
        const s = k === 0 || k === 1 ? 1 : -1;
        const z = k === 0 || k === 3 ? depth : -depth;
        return [path[i][0] + nx * w * s, path[i][1] + ny * w * s, z];
      };
      const a = corner(face);
      const b = corner((face + 1) % 4);
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      uvs.push(u, face / 4, u, (face + 1) / 4);
    }
    for (let i = 0; i < path.length - 1; i++) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * A tapered flame turned round its rising axis, 0.9 m tall, its radius
 * rippled by bearing and height and its tip curled off-axis — so the four
 * lamp flames have a lean instead of reading as cones.
 */
export function vigilFlameGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = 33;
  const cols = 25;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const t = j / (rows - 1);
      const a = (i * TAU) / (cols - 1);
      const r = Math.sin(Math.PI * t) * (0.18 + 0.04 * Math.sin(t * 8 + a * 2));
      // The curl: the tip drifts off-axis quadratically.
      positions.push(Math.cos(a) * r + 0.15 * t * t, t * 0.9, Math.sin(a) * r);
      uvs.push(i / (cols - 1), t);
      if (j < rows - 1 && i < cols - 1) {
        const n = j * cols + i;
        indices.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1);
      }
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * The sanctuary curtain: an open cylinder of light, unit radius and height,
 * that each accepted pulse expands across the circle. The top ring leans in a
 * little so the curtain reads as the wall of a vault rather than a tube.
 */
export function vigilCurtainGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = 96;
  const rows = 9;
  for (let j = 0; j < rows; j++) {
    const y = j / (rows - 1);
    const lean = 1 - 0.08 * y * y;
    for (let i = 0; i <= segments; i++) {
      const a = (i * TAU) / segments;
      positions.push(Math.cos(a) * lean, y, Math.sin(a) * lean);
      uvs.push(i / segments, y);
      if (j < rows - 1 && i < segments) {
        const n = j * (segments + 1) + i;
        indices.push(n, n + segments + 1, n + 1, n + 1, n + segments + 1, n + segments + 2);
      }
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * A bell turned from a founder's profile: crown loop, shoulder, waist, sound
 * bow and a flared lip. Authored crown-up from y = 0 (the crown, the pivot) to
 * y = 0.62 (the lip); the rig turns it over so it hangs from its crown.
 */
export function vigilBellGeometry() {
  const profile = [
    [0.0, 0.0],
    [0.05, 0.0],
    [0.07, 0.03], // crown loop
    [0.12, 0.06],
    [0.2, 0.09], // shoulder
    [0.23, 0.14],
    [0.24, 0.24], // waist
    [0.26, 0.34],
    [0.3, 0.44],
    [0.36, 0.53], // sound bow
    [0.43, 0.59],
    [0.46, 0.62], // lip
    [0.42, 0.62],
    [0.36, 0.58] // inside of the lip, so the mouth has thickness
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(profile, 28);
}

/**
 * A crown of flame: a flat band of radius 1 lying in XZ with twelve tapering
 * tines rising from it, each a three-sided prism so it catches light on its
 * edges. `uv.x` runs round the crown, `uv.y` up each tine (0 on the band).
 */
export function vigilCrownGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = 96;
  const inner = 0.94;
  const outer = 1.06;
  const band = 0.06;
  // The band: inner wall, outer wall, top.
  for (const [r0, r1, y0, y1] of [[inner, inner, 0, band], [outer, outer, 0, band], [inner, outer, band, band]]) {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      positions.push(Math.cos(a) * r0, y0, Math.sin(a) * r0, Math.cos(a) * r1, y1, Math.sin(a) * r1);
      uvs.push(i / segments, 0, i / segments, 0.05);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  // Tines: a triangular base on the band tapering to a point, alternating tall and short.
  const tines = 12;
  for (let k = 0; k < tines; k++) {
    const a = (k / tines) * TAU;
    const half = 0.07;
    const height = k % 2 ? 0.22 : 0.34;
    const pts = [
      [Math.cos(a - half) * outer, Math.sin(a - half) * outer],
      [Math.cos(a + half) * outer, Math.sin(a + half) * outer],
      [Math.cos(a) * inner, Math.sin(a) * inner]
    ];
    const tip = [Math.cos(a) * 1.0, band + height, Math.sin(a) * 1.0];
    for (let e = 0; e < 3; e++) {
      const p = pts[e];
      const q = pts[(e + 1) % 3];
      const base = positions.length / 3;
      positions.push(p[0], band, p[1], q[0], band, q[1], tip[0], tip[1], tip[2]);
      uvs.push(k / tines, 0.05, (k + 0.5) / tines, 0.05, (k + 0.25) / tines, 1);
      indices.push(base, base + 1, base + 2);
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * The column of light from the crown to the floor: an open cone frustum,
 * radius 1 at the top (y = 1) widening to `footScale` at the floor (y = 0).
 * The sanctuary builds it as a cylinder (`footScale = 1`) and widens the foot
 * in the vertex stage, so the spread stays a live slider.
 */
export function vigilShaftGeometry(footScale = 1) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const sides = 64;
  const rows = 12;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const r = footScale + (1 - footScale) * v;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * TAU;
      positions.push(Math.cos(a) * r, v, Math.sin(a) * r);
      uvs.push(i / sides, v);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * (sides + 1) + i;
      indices.push(a, a + sides + 1, a + 1, a + 1, a + sides + 1, a + sides + 2);
    }
  }
  return finish(positions, uvs, indices);
}
