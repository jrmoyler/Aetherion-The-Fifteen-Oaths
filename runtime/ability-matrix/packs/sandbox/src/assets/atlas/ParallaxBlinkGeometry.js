import { BufferAttribute, BufferGeometry, PlaneGeometry, TorusGeometry } from 'three';

/**
 * Procedural geometry for the Parallax Blink.
 *
 *   - the **bezel**: a machined housing ring for the iris — flat front and back
 *     faces, an inner bore and a toothed outer wall (the teeth are the ring's
 *     drive gear), every face flat-shaded so each catches the sky as one plane;
 *   - the **iris face**: a unit disc quad the blade shader draws into;
 *   - the **corridor ring**: a thin hoop, instanced down the corridor.
 *
 * All three are unit-sized and centred on the origin in XY, facing +Z: an
 * instance or mesh scale is the radius in metres and its rotation turns +Z
 * onto the corridor's direction.
 */

/**
 * The housing: inner radius 1, outer radius `outer` (teeth add `tooth` on
 * top), `depth` thick along Z. `uv.x` is the angle 0..1 round the ring and
 * `uv.y` 0 at the bore → 1 at the tooth tip, which the bezel shader uses for
 * its engraved groove and its chasing lights.
 *
 * @param {number} [segments] facets round the ring
 * @param {number} [teeth]    gear teeth on the outer wall
 * @param {number} [outer]    outer radius before the teeth, × the bore
 * @param {number} [tooth]    tooth height, × the bore
 * @param {number} [depth]    thickness, × the bore
 */
export function createParallaxBezelGeometry(segments = 96, teeth = 24, outer = 1.22, tooth = 0.07, depth = 0.16) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const hz = depth * 0.5;
  const R1 = 1;

  const outerAt = (i) => {
    // A square-wave of teeth, two facets up and two down per tooth.
    const phase = ((i / segments) * teeth) % 1;
    return outer + (phase > 0.15 && phase < 0.6 ? tooth : 0);
  };
  const quad = (a, b, c, d, n, ua, ub, uc, ud) => {
    for (const [p, uv] of [
      [a, ua],
      [b, ub],
      [c, uc],
      [a, ua],
      [c, uc],
      [d, ud]
    ]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[0], uv[1]);
    }
  };

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const a0 = t0 * Math.PI * 2;
    const a1 = t1 * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const R2 = outerAt(i);
    const v2 = (R2 - R1) / (outer + tooth - R1);

    // Front (+Z) and back (−Z) faces.
    quad(
      [c0 * R1, s0 * R1, hz],
      [c1 * R1, s1 * R1, hz],
      [c1 * R2, s1 * R2, hz],
      [c0 * R2, s0 * R2, hz],
      [0, 0, 1],
      [t0, 0],
      [t1, 0],
      [t1, v2],
      [t0, v2]
    );
    quad(
      [c0 * R2, s0 * R2, -hz],
      [c1 * R2, s1 * R2, -hz],
      [c1 * R1, s1 * R1, -hz],
      [c0 * R1, s0 * R1, -hz],
      [0, 0, -1],
      [t0, v2],
      [t1, v2],
      [t1, 0],
      [t0, 0]
    );
    // Bore (facing inward) and outer wall (facing outward), one flat normal per facet.
    const cm = Math.cos((a0 + a1) * 0.5);
    const sm = Math.sin((a0 + a1) * 0.5);
    quad(
      [c0 * R1, s0 * R1, -hz],
      [c1 * R1, s1 * R1, -hz],
      [c1 * R1, s1 * R1, hz],
      [c0 * R1, s0 * R1, hz],
      [-cm, -sm, 0],
      [t0, 0],
      [t1, 0],
      [t1, 0],
      [t0, 0]
    );
    quad(
      [c0 * R2, s0 * R2, hz],
      [c1 * R2, s1 * R2, hz],
      [c1 * R2, s1 * R2, -hz],
      [c0 * R2, s0 * R2, -hz],
      [cm, sm, 0],
      [t0, v2],
      [t1, v2],
      [t1, v2],
      [t0, v2]
    );
    // The tooth flanks, where the outer radius steps.
    const R3 = outerAt(i + 1);
    if (R3 !== R2) {
      const sign = R3 > R2 ? -1 : 1;
      const lo = Math.min(R2, R3);
      const hi = Math.max(R2, R3);
      quad(
        [c1 * lo, s1 * lo, hz],
        [c1 * hi, s1 * hi, hz],
        [c1 * hi, s1 * hi, -hz],
        [c1 * lo, s1 * lo, -hz],
        [-s1 * sign, c1 * sign, 0],
        [t1, 0.5],
        [t1, 1],
        [t1, 1],
        [t1, 0.5]
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The disc the aperture blades are drawn into: −1..1 in XY, facing +Z. */
export function createParallaxIrisGeometry() {
  return new PlaneGeometry(2, 2, 1, 1);
}

/** One floating hoop of the corridor. */
export function createParallaxRingGeometry() {
  return new TorusGeometry(1, 0.025, 6, 64);
}
