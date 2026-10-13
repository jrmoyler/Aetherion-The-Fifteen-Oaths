import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * Procedural geometry for the Geode Eruption.
 *
 * ## The shell
 *
 * A geode is a hollow stone with a hexagonal habit: six bowed walls, a
 * shoulder, a low domed cap. It has to come apart, so it is built *already in
 * pieces* — eighteen plates, each a real slab of stone with an outer face, an
 * inner face and the broken edges between them:
 *
 *   - 6 lower wall plates (the floor up to the bulge)
 *   - 6 upper wall plates (the bulge up to the shoulder)
 *   - 6 cap wedges (the shoulder ring in to the apex)
 *
 * Every plate is faceted (non-indexed, one normal per triangle) and the stone
 * is roughened by a value noise of the *rest-space position*, so the vertex two
 * neighbouring plates share is displaced identically in both: the shell is
 * seamless until it cracks, and the cracks run exactly where the plates part.
 *
 * Each plate's vertices are stored relative to its own centroid, so a plate can
 * be tumbled about its own middle simply by turning its mesh. The builder also
 * returns, per plate, the centroid, the hinge it peels open about, and its
 * outward direction — everything the ability needs to crack it, peel it and
 * throw it without touching a vertex.
 *
 * Attributes:
 *   - `aRest`    — rest-space position (shell-local metres): the frame the
 *                  stone, agate and dissolve noise live in, so a flying plate
 *                  carries its texture with it
 *   - `aSurface` — 0 the outer face, 0.5 a broken edge, 1 the inner face
 *   - `aSeam`    — metres to the plate's border along its face (0 on an edge)
 */

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 3D value noise, −1..1. Deterministic in position — shared edges agree. */
function valueNoise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  let result = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
        result += w * hash3(ix + dx, iy + dy, iz + dz);
      }
    }
  }
  return result * 2 - 1;
}

/** Shape parameters shared by the shell builder and the ability's crystal placement. */
export function geodeProfile({ radius, height, bulge = 1.08, shoulder = 0.82, twist = 0 }) {
  const corners = [];
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * Math.PI * 2 + twist;
    corners.push([Math.cos(a), Math.sin(a)]);
  }
  /** Wall radius at height fraction v (0..0.85): flared foot, bulge, shoulder. */
  const wallR = (v) => {
    const k = Math.min(1, Math.max(0, v / 0.85));
    // A smooth bell from the foot through the bulge to the shoulder.
    const foot = 0.86;
    const a = foot + (bulge - foot) * Math.sin(Math.min(1, k / 0.55) * Math.PI * 0.5);
    const b = bulge + (shoulder - bulge) * Math.pow(Math.max(0, (k - 0.55) / 0.45), 1.4);
    return radius * (k < 0.55 ? a : b);
  };
  /**
   * A point on the outer (or inner) surface. `side` 0..5, `u` 0..1 across the
   * side between its two corners, `v` 0..0.85 up the wall, or — for the cap —
   * `v` > 0.85 with `rho` = 1 at the shoulder ring → 0 at the apex.
   */
  const point = (side, u, v, rho, thickness, out) => {
    const c0 = corners[side];
    const c1 = corners[(side + 1) % 6];
    // Hex boundary, bowed out a little mid-side so the walls are not flat panes.
    const bow = 1 + 0.05 * Math.sin(u * Math.PI);
    let hx = (c0[0] + (c1[0] - c0[0]) * u) * bow;
    let hz = (c0[1] + (c1[1] - c0[1]) * u) * bow;
    if (rho === undefined) {
      const r = Math.max(0.01, wallR(v) - thickness);
      out.set(hx * r, v * height, hz * r);
    } else {
      const r = Math.max(0.0, (wallR(0.85) - thickness) * rho);
      const dome = height * (0.85 + 0.15 * (1 - rho * rho));
      out.set(hx * r, dome - thickness * 0.9, hz * r);
    }
    return out;
  };
  return { corners, wallR, point };
}

/**
 * Build the eighteen plates.
 *
 * @returns {{ geometry: BufferGeometry, centroid: Vector3, hinge: Vector3,
 *             axis: Vector3, outward: Vector3, tier: number, side: number }[]}
 */
export function createGeodePlates({
  radius = 2.8,
  height = 2.8,
  bulge = 1.08,
  shoulder = 0.82,
  thickness = 0.22,
  facets = 4,
  roughness = 0.12,
  twist = 0
} = {}) {
  const profile = geodeProfile({ radius, height, bulge, shoulder, twist });
  const n = Math.max(1, Math.round(facets));
  const plates = [];
  const tiers = [
    [0.0, 0.42],
    [0.42, 0.85]
  ];

  const P = new Vector3();
  const Q = new Vector3();

  /** Surface point with roughness, displaced along its own radial-ish normal. */
  const surf = (side, u, v, rho, inner, out) => {
    profile.point(side, u, v, rho, inner ? thickness : 0, out);
    // Displace using the *outer* rest point's noise so inner and outer agree
    // in shape and the plate's thickness stays even.
    profile.point(side, u, v, rho, 0, Q);
    const f = 1.6 / Math.max(0.3, radius);
    const d = valueNoise(Q.x * f + 3.1, Q.y * f, Q.z * f) * 0.7 + valueNoise(Q.x * f * 2.3, Q.y * f * 2.3 + 7, Q.z * f * 2.3) * 0.3;
    const len = Math.hypot(Q.x, Q.z) || 1;
    // 0 on the walls and the shoulder ring (so wall and cap agree where they
    // meet), 1 at the apex, where the roughness can only go up and down.
    const capW = rho === undefined ? 0 : 1 - rho;
    out.x += (Q.x / len) * d * roughness * (1 - capW);
    out.z += (Q.z / len) * d * roughness * (1 - capW);
    out.y += d * roughness * (capW * 0.8 + 0.2);
    // Keep the foot on the floor so the shell does not float.
    if (rho === undefined && v <= 1e-6) out.y = Math.min(out.y, 0) - 0.06;
    return out;
  };

  for (let tier = 0; tier < 3; tier++) {
    for (let side = 0; side < 6; side++) {
      const pos = [];
      const rest = [];
      const surface = [];
      const seam = [];

      // Grid of outer and inner points: (n + 1) × (n + 1).
      const outer = [];
      const innerPts = [];
      const seamAt = [];
      const sideLen = radius * 1.05;
      for (let i = 0; i <= n; i++) {
        const w = i / n; // up the tier, or in toward the apex
        for (let k = 0; k <= n; k++) {
          const u = k / n;
          let v;
          let rho;
          if (tier < 2) {
            v = tiers[tier][0] + (tiers[tier][1] - tiers[tier][0]) * w;
          } else {
            v = 0.9;
            rho = 1 - w;
          }
          outer.push(surf(side, u, v, rho, false, new Vector3()));
          innerPts.push(surf(side, u, v, rho, true, new Vector3()));
          // Metres to the nearest border this plate shares with a neighbour.
          // The floor line is not a seam; the shoulder ring and the six cap
          // seams (which meet at the apex) are.
          const across = Math.min(u, 1 - u) * sideLen * (tier < 2 ? 1 : rho);
          let along;
          if (tier === 0) along = (1 - w) * height * 0.42;
          else if (tier === 1) along = Math.min(w, 1 - w) * height * 0.43;
          else along = w * radius * 0.8;
          seamAt.push(Math.min(across, along));
        }
      }
      const idx = (i, k) => i * (n + 1) + k;

      const tri = (a, b, c, kind, sa, sb, sc) => {
        for (const [p, s] of [
          [a, sa],
          [b, sb],
          [c, sc]
        ]) {
          pos.push(p.x, p.y, p.z);
          rest.push(p.x, p.y, p.z);
          surface.push(kind);
          seam.push(s);
        }
      };

      for (let i = 0; i < n; i++) {
        for (let k = 0; k < n; k++) {
          const a = idx(i, k);
          const b = idx(i, k + 1);
          const c = idx(i + 1, k);
          const d = idx(i + 1, k + 1);
          // Outer face: counter-clockwise seen from outside (u runs
          // anticlockwise round the axis, w runs up or in).
          tri(outer[a], outer[c], outer[b], 0, seamAt[a], seamAt[c], seamAt[b]);
          tri(outer[b], outer[c], outer[d], 0, seamAt[b], seamAt[c], seamAt[d]);
          // Inner face: reversed, so it faces the hollow.
          tri(innerPts[a], innerPts[b], innerPts[c], 1, seamAt[a], seamAt[b], seamAt[c]);
          tri(innerPts[b], innerPts[d], innerPts[c], 1, seamAt[b], seamAt[d], seamAt[c]);
        }
      }

      // Broken edges: walk the border and stitch outer to inner.
      const border = [];
      for (let k = 0; k < n; k++) border.push([idx(0, k), idx(0, k + 1)]);
      for (let i = 0; i < n; i++) border.push([idx(i, n), idx(i + 1, n)]);
      for (let k = n; k > 0; k--) border.push([idx(n, k), idx(n, k - 1)]);
      for (let i = n; i > 0; i--) border.push([idx(i, 0), idx(i - 1, 0)]);
      for (const [a, b] of border) {
        tri(outer[b], outer[a], innerPts[a], 0.5, 0, 0, 0);
        tri(outer[b], innerPts[a], innerPts[b], 0.5, 0, 0, 0);
      }

      // Centroid of the outer face; vertices are stored relative to it.
      const centroid = new Vector3();
      for (const p of outer) centroid.add(p);
      centroid.multiplyScalar(1 / outer.length);
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] -= centroid.x;
        pos[i + 1] -= centroid.y;
        pos[i + 2] -= centroid.z;
      }

      // The hinge: the middle of the plate's lower border; outward from the axis.
      const hinge = outer[idx(0, Math.floor(n / 2))].clone();
      if (n % 2 === 1) hinge.lerp(outer[idx(0, Math.ceil(n / 2))], 0.5);
      const outward = new Vector3(centroid.x, 0, centroid.z);
      if (outward.lengthSq() < 1e-6) outward.set(1, 0, 0);
      outward.normalize();
      // Rotating "up" about up × outward tips the top of the plate outward.
      const axis = new Vector3(0, 1, 0).cross(outward).normalize();

      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      geometry.setAttribute('aRest', new BufferAttribute(new Float32Array(rest), 3));
      geometry.setAttribute('aSurface', new BufferAttribute(new Float32Array(surface), 1));
      geometry.setAttribute('aSeam', new BufferAttribute(new Float32Array(seam), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();

      plates.push({ geometry, centroid, hinge, axis, outward, tier, side });
    }
  }
  return { plates, profile };
}

/**
 * One amethyst crystal: a hexagonal prism with a pyramidal termination,
 * slightly irregular so a field of them is not a field of pencils. Faceted.
 *
 * Unit space: the root at y = 0 (with a buried skirt below), radius 1, the
 * point at y = 1.
 */
export function createGeodeCrystalGeometry() {
  const sides = 6;
  const pos = [];
  const ring = (r, y, jitter) => {
    const pts = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const rr = r * (1 + jitter * (hash3(s, y * 10, 3) - 0.5));
      pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    return pts;
  };
  const bottom = ring(1.0, -0.25, 0.0);
  const shoulder = ring(0.94, 0.7, 0.18);
  const tip = [0.04, 1.0, -0.03];
  const quad = (a, b, c, d) => {
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  };
  for (let s = 0; s < sides; s++) {
    const t = (s + 1) % sides;
    // Sides of the prism (outward-facing winding).
    quad(bottom[s], shoulder[s], bottom[t], shoulder[t]);
    // The termination.
    pos.push(...shoulder[s], ...tip, ...shoulder[t]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.computeVertexNormals();
  return geometry;
}
