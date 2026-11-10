import { BufferAttribute, BufferGeometry, PlaneGeometry, Sphere, Vector3 } from 'three';

/**
 * Geometry for Arc Relay.
 *
 * ## The tether
 *
 * Chain Arc re-rolls its bolts on the CPU into dynamic buffers. A relay tether
 * is a different animal — it is a *standing* connection that hangs between two
 * relays for seconds, braided, rolling and crackling — so it is built the other
 * way round: the buffer is written **once** and holds only parameter space,
 * and the vertex stage (`ArcRelayMaterials` → tether) places every vertex from
 * a handful of uniforms: the two endpoints, the bow, the braid and a crackle
 * seed. Re-striking a tether is one float upload; pre-allocated, never touched
 * again.
 *
 * Layout: `STRANDS` strands × `MAX_TETHER_POINTS` points × 2 sides. Per vertex
 *
 *   aParam   x  t along the tether, 0 at the source, 1 at the relay
 *            y  side, −1 / +1 (swung apart across the view in the shader)
 *            z  strand index, 0 or 1
 *
 * `position` is left at the origin; the bounding sphere is set huge because
 * the real shape only exists after the vertex stage.
 */
export const MAX_TETHER_POINTS = 64;
export const STRANDS = 2;

export function createRelayTetherGeometry() {
  const points = MAX_TETHER_POINTS;
  const vertices = STRANDS * points * 2;
  const position = new Float32Array(vertices * 3);
  const param = new Float32Array(vertices * 3);

  let v = 0;
  for (let s = 0; s < STRANDS; s++) {
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      for (let side = 0; side < 2; side++, v++) {
        param[v * 3] = t;
        param[v * 3 + 1] = side === 0 ? -1 : 1;
        param[v * 3 + 2] = s;
      }
    }
  }

  const quads = STRANDS * (points - 1);
  const index = new Uint16Array(quads * 6);
  let k = 0;
  for (let s = 0; s < STRANDS; s++) {
    for (let i = 0; i < points - 1; i++) {
      const a = (s * points + i) * 2;
      index[k++] = a;
      index[k++] = a + 1;
      index[k++] = a + 2;
      index[k++] = a + 1;
      index[k++] = a + 3;
      index[k++] = a + 2;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aParam', new BufferAttribute(param, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * A unit quad, −1..1 in x and y, for every billboard here (relay cores, heat
 * warps). The shaders billboard it in view space and size it in metres.
 */
export function createRelayQuadGeometry() {
  return new PlaneGeometry(2, 2, 1, 1);
}

/** A flat unit quad on the floor (XZ), −1..1, for the relay sigils. */
export function createRelayFloorGeometry() {
  return new PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
}

/**
 * One conductor prong of a relay cage — the hero solid of Arc Relay.
 *
 * A lightning rod built like the real thing: a flanged foot, a stack of
 * ceramic-insulator bulges up its lower two thirds, a turned shaft and a hooked
 * point. Hexagonal and flat-shaded, with alternate rows turned half a facet so
 * the silhouette zig-zags and every facet catches the sun on its own.
 *
 * Unit space: the foot at the origin, the point at y = 1. Radii are fractions
 * of the length at width scale 1 (`PRONG_WIDTH` at the foot), and the point
 * hooks toward −X by `PRONG_HOOK` × t², so an instance yawed to put −X toward
 * the body curls in over it. The ability scales y by the prong's length and
 * x/z by `prongWidth / PRONG_WIDTH`.
 *
 * `aT` (0 foot .. 1 point) lets the material run heat down from the tip;
 * `aRing` marks the insulator grooves, which glow first.
 */
export const PRONG_WIDTH = 0.045;
export const PRONG_HOOK = 0.12;

export function createRelayProngGeometry({ sides = 6 } = {}) {
  const TAU = Math.PI * 2;
  const w = PRONG_WIDTH;
  // [radius (× w), t, groove]
  const profile = [
    [1.55, 0.0, 0],
    [1.5, 0.025, 0],
    [1.0, 0.05, 1],
    [1.42, 0.09, 0],
    [0.86, 0.13, 1],
    [1.34, 0.17, 0],
    [0.82, 0.21, 1],
    [1.26, 0.25, 0],
    [0.78, 0.29, 1],
    [1.18, 0.33, 0],
    [0.74, 0.37, 1],
    [1.1, 0.41, 0],
    [0.7, 0.46, 1],
    [0.72, 0.6, 0],
    [0.62, 0.72, 0],
    [0.5, 0.82, 0],
    [0.62, 0.86, 1],
    [0.36, 0.93, 0],
    [0.0, 1.0, 1]
  ];
  const position = [];
  const tAttr = [];
  const ring = [];
  const point = (row, i) => {
    const [r, t] = profile[row];
    const a = ((i + (row % 2) * 0.5) * TAU) / sides;
    const hook = -PRONG_HOOK * t * t;
    return [Math.cos(a) * r * w + hook, t, Math.sin(a) * r * w];
  };
  const tri = (a, b, c, row0, row1) => {
    position.push(...a, ...b, ...c);
    tAttr.push(profile[row0][1], profile[row0][1], profile[row1][1]);
    const g = Math.max(profile[row0][2], profile[row1][2]);
    ring.push(g, g, g);
  };
  // Foot cap.
  for (let i = 0; i < sides; i++) {
    const a = point(0, i), b = point(0, i + 1);
    position.push(0, 0, 0, ...b, ...a);
    tAttr.push(0, 0, 0);
    ring.push(0, 0, 0);
  }
  for (let row = 0; row < profile.length - 1; row++) {
    for (let i = 0; i < sides; i++) {
      const a = point(row, i), b = point(row, i + 1);
      const c = point(row + 1, i), d = point(row + 1, i + 1);
      if (row % 2 === 0) { tri(a, c, d, row, row + 1); tri(a, d, b, row, row + 1); }
      else { tri(a, c, b, row, row + 1); tri(b, c, d, row, row + 1); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('aT', new BufferAttribute(new Float32Array(tAttr), 1));
  g.setAttribute('aRing', new BufferAttribute(new Float32Array(ring), 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
