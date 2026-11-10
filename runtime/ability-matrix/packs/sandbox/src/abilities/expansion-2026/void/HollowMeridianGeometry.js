import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Hollow Meridian — authored procedural geometry.
 *
 * Nothing here is a stock primitive. Every buffer carries the parameter-space
 * coordinates its shader needs (across / along / role), so the shapes can be
 * eaten, opened and closed in the fragment stage without being rebuilt. All of
 * them are built once per ability instance and shared by the pooled meshes.
 *
 *  - `seamGeometry`          the breach itself: a torn vertical aperture
 *  - `voidTravelGeometry`    the swept wake that runs ahead of the cut
 *  - `voidLensGeometry`      the dark spindle riding the front of that wake
 *  - `breachWarningGeometry` the ground glyph that marks the next breach
 *  - `fractureShardGeometry` one faceted fragment of torn space
 *  - `fractureGeometry`      forked ground cracks radiating from a breach
 *  - `breachWaveGeometry`    the ragged ground ring a breach throws off
 */

const TAU = Math.PI * 2;

/** Deterministic hash, so the authored tears are the same every load. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Cheap 1D value noise for silhouettes (smooth, deterministic, -1..1). */
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1;
}

function finish(positions, uvs, indices, extra) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (extra) for (const [name, data, size] of extra) geometry.setAttribute(name, new Float32BufferAttribute(data, size));
  if (indices) geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The breach: an uneven vertical aperture, 2.8 m tall in local units.
 *
 * `uv.x` runs across the opening (0 → 1, the centre line at 0.5) and `uv.y`
 * runs up it. The half-width profile is a lens (`sin^0.65`) broken by two
 * octaves of value noise, so the tear is fat low down, pinched in two places
 * and never symmetric; the two lips are offset in depth (`z`) and folded back
 * as they approach the rim, which is what makes it read as a cut through
 * *something* rather than a flat card. The shader treats `|uv.x*2-1| = 1` as
 * the rim, so the ragged edge it adds always sits on this silhouette.
 */
export function seamGeometry(rows = 64, cols = 13) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const lens = Math.pow(Math.sin(Math.PI * t), 0.65);
    const tear = 0.43 + 0.08 * Math.sin(t * 13) + 0.05 * noise1(t * 9.3) + 0.025 * noise1(t * 23.7 + 4);
    const width = lens * tear;
    // The centre line itself wanders, so the cut is not ruled straight.
    const drift = 0.06 * noise1(t * 5.1 + 11) * lens;
    for (let i = 0; i < cols; i++) {
      const s = (i / (cols - 1)) * 2 - 1;
      // Lips fold away from the viewer as they reach the rim.
      const fold = (s * s) * 0.09 * lens;
      const lip = Math.sin(t * 11) * s * 0.07;
      positions.push(drift + s * width, t * 2.8, lip - fold);
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
 * One fragment of torn space: an irregular, flat-shaded bipyramid.
 *
 * A ring of six jittered vertices round the waist, a long tip above and a
 * stubby broken heel below; unindexed so each facet keeps its own normal and
 * the shard glints facet by facet in the fresnel. `uv.y` is 0 at the heel and
 * 1 at the tip (the dissolve eats from the tip down).
 */
export function fractureShardGeometry() {
  const ring = [];
  const sides = 6;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU + (hash(i + 3) - 0.5) * 0.6;
    const r = 0.11 + hash(i + 17) * 0.07;
    ring.push([Math.cos(a) * r, (hash(i + 29) - 0.5) * 0.08, Math.sin(a) * r * 0.55]);
  }
  const tip = [0.025, 0.46, 0.01];
  const heel = [-0.02, -0.27, 0.0];
  const positions = [], uvs = [];
  const push = (p, v) => { positions.push(p[0], p[1], p[2]); uvs.push(0.5 + p[0], v); };
  for (let i = 0; i < sides; i++) {
    const a = ring[i], b = ring[(i + 1) % sides];
    push(a, 0.4); push(b, 0.4); push(tip, 1);
    push(b, 0.4); push(a, 0.4); push(heel, 0);
  }
  return finish(positions, uvs, null);
}

/**
 * The anticipation glyph laid on the floor where the next breach will open.
 *
 * Three authored parts, told apart by the `aRole` attribute:
 *   0 — an outer rim broken into six arcs (uv.x = angle fraction, uv.y across)
 *   1 — six tapered ticks pointing inward (uv.y = 0 at the root, 1 at the tip)
 *   2 — a thin inner ring the charge sweeps round (uv.x = angle fraction)
 * Unit radius; the ability scales it by `zoneRadius`. The shader fills the
 * rim clockwise as the breach charges, so the player can read the timing.
 */
export function breachWarningGeometry() {
  const positions = [], uvs = [], roles = [], indices = [];
  const vertex = (x, z, u, v, role) => {
    positions.push(x, 0, z);
    uvs.push(u, v);
    roles.push(role);
    return positions.length / 3 - 1;
  };
  const band = (r0, r1, from, to, steps, role) => {
    for (let i = 0; i < steps; i++) {
      const a = from + ((to - from) * i) / steps;
      const b = from + ((to - from) * (i + 1)) / steps;
      const ua = a / TAU, ub = b / TAU;
      const n0 = vertex(Math.cos(a) * r0, Math.sin(a) * r0, ua, 0, role);
      const n1 = vertex(Math.cos(a) * r1, Math.sin(a) * r1, ua, 1, role);
      const n2 = vertex(Math.cos(b) * r1, Math.sin(b) * r1, ub, 1, role);
      const n3 = vertex(Math.cos(b) * r0, Math.sin(b) * r0, ub, 0, role);
      indices.push(n0, n1, n2, n0, n2, n3);
    }
  };
  // Outer rim: six arcs separated by notches, each arc slightly thicker at
  // its middle so the gaps look bitten rather than ruled.
  for (let k = 0; k < 6; k++) {
    const start = (k / 6) * TAU + 0.07;
    const end = ((k + 1) / 6) * TAU - 0.07;
    band(0.9, 1.0, start, end, 14, 0);
  }
  // Inner charge ring.
  band(0.47, 0.5, 0, TAU, 72, 2);
  // Ticks, offset half a segment from the notches.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + Math.PI / 6;
    const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
    const w = 0.035;
    const r0 = 0.86, r1 = 0.58;
    const n0 = vertex(dx * r0 + nx * w, dz * r0 + nz * w, a / TAU, 0, 1);
    const n1 = vertex(dx * r0 - nx * w, dz * r0 - nz * w, a / TAU, 0, 1);
    const n2 = vertex(dx * r1, dz * r1, a / TAU, 1, 1);
    indices.push(n0, n1, n2);
  }
  return finish(positions, uvs, indices, [['aRole', roles, 1]]);
}

/**
 * The swept wake behind the travelling cut: two ribbons crossed at right
 * angles (a flat one on the floor plane and an upright fin), so it has volume
 * from the default three-quarter camera instead of vanishing edge-on.
 *
 * Unit length along local -z (head at z = 0, tail at z = -1); the ability
 * stretches it by `min(front, travelLength)`. `uv.x` is across (0..1),
 * `uv.y` is 0 at the tail and 1 at the head.
 */
export function voidTravelGeometry(rows = 48) {
  const positions = [], uvs = [], indices = [];
  for (let ribbon = 0; ribbon < 2; ribbon++) {
    const base = positions.length / 3;
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      // Widest just behind the head, tapering to a thread at the tail.
      const width = (0.06 + 0.22 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.2)) * (0.8 + 0.2 * Math.sin(t * 23));
      const wave = 0.12 * Math.sin(t * 9) * (1 - t * 0.5);
      for (let side = 0; side < 2; side++) {
        const s = side ? 1 : -1;
        if (ribbon === 0) positions.push(s * width, wave, t - 1);
        else positions.push(wave * 0.4, 0.12 + s * width * 0.7, t - 1);
        uvs.push(side, t);
      }
      if (j < rows - 1) {
        const n = base + j * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * The spindle at the head of the wake: a pointed, slightly flattened lens
 * along local z, longer behind than in front so it reads as moving. `uv.y`
 * runs tail (0) → nose (1), `uv.x` round the girth.
 */
export function voidLensGeometry(rows = 18, cols = 16) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const z = -0.42 + t * 0.6;
    const r = 0.14 * Math.pow(Math.sin(Math.PI * t), 0.75);
    for (let i = 0; i <= cols; i++) {
      const a = (i / cols) * TAU;
      positions.push(Math.cos(a) * r, Math.sin(a) * r * 0.7, z);
      uvs.push(i / cols, t);
      if (j < rows - 1 && i < cols) {
        const n = j * (cols + 1) + i;
        indices.push(n, n + cols + 1, n + 1, n + 1, n + cols + 1, n + cols + 2);
      }
    }
  }
  return finish(positions, uvs, indices);
}

/**
 * Forked ground cracks round a breach, unit radius on the floor plane.
 *
 * Nine primary branches, each bending as it runs and each spawning one fork
 * part-way along. `uv.x` is the distance from the breach centre (0 → 1, the
 * fracture shader's `progress` front runs along it), `uv.y` is across the
 * crack (0..1). Widths taper with distance so the cracks die into hairlines.
 */
export function fractureGeometry() {
  const positions = [], uvs = [], indices = [];
  const strip = (angle, startT, length, startX, startZ, width0, seed) => {
    const steps = 8;
    const base = positions.length / 3;
    let x = startX, z = startZ, heading = angle;
    for (let j = 0; j <= steps; j++) {
      const f = j / steps;
      const t = startT + f * length;
      const width = width0 * (1 - 0.8 * f);
      const nx = Math.cos(heading), nz = -Math.sin(heading);
      for (const side of [-1, 1]) {
        positions.push(x + nx * width * side, 0, z + nz * width * side);
        uvs.push(t, (side + 1) / 2);
      }
      if (j < steps) {
        const n = base + j * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        // Wander: a crack follows weakness, not a ruler.
        heading += noise1(seed + j * 1.7) * 0.32;
        const stepLength = length / steps;
        x += Math.sin(heading) * stepLength;
        z += Math.cos(heading) * stepLength;
      }
    }
    return { x, z };
  };
  for (let branch = 0; branch < 9; branch++) {
    const angle = (branch / 9) * TAU + (hash(branch + 41) - 0.5) * 0.35;
    const reach = 0.78 + hash(branch + 7) * 0.22;
    // Primary crack from the lip of the breach outward.
    const start = 0.08;
    strip(angle, start, reach - start, Math.sin(angle) * start, Math.cos(angle) * start, 0.03, branch * 13.1);
    // One fork, leaving 35–55 % of the way out at a sharp angle.
    const at = start + (reach - start) * (0.35 + hash(branch + 71) * 0.2);
    const forkAngle = angle + (hash(branch + 5) < 0.5 ? -1 : 1) * (0.45 + hash(branch + 9) * 0.3);
    strip(forkAngle, at, (1 - at) * 0.55, Math.sin(angle) * at, Math.cos(angle) * at, 0.016, branch * 7.7 + 3);
  }
  return finish(positions, uvs, indices);
}

/**
 * The ring a breach throws across the floor: a flat annulus whose `uv.y`
 * runs inner (0) → outer (1) edge and `uv.x` round the circle, so the shader
 * can tear the leading edge with noise. Unit outer radius, inner at 0.6; the
 * ability scales it out over the wave's life.
 */
export function breachWaveGeometry(segments = 96, rings = 4) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const r = 0.6 + 0.4 * v;
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
