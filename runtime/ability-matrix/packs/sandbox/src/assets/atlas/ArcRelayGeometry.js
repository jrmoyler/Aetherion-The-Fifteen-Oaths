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
