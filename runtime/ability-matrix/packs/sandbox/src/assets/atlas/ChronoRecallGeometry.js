import { BufferAttribute, BufferGeometry, PlaneGeometry } from 'three';

/**
 * Procedural geometry for the Chrono Recall.
 *
 * Neither shape is in metres. Both are *parameter* buffers that the vertex
 * stage places from uniforms every frame, which is what lets the path bend,
 * stretch and retract live without a single buffer being rewritten.
 */

/**
 * The time-stream along the dash: a ladder of `nodes` rungs, every vertex
 * `(t, side, 0)` with `t` 0 → 1 from the origin to the target and `side` −1 / +1
 * across the band. The vertex shader evaluates the curve at `t` and lays the
 * rung flat on the floor across the curve's tangent.
 *
 * @param {number} nodes rungs along the curve; ~4 per metre of the longest cast reads smooth
 */
export function createRecallPathGeometry(nodes = 96) {
  const positions = new Float32Array(nodes * 2 * 3);
  const index = [];
  for (let i = 0; i < nodes; i++) {
    const t = i / (nodes - 1);
    positions.set([t, -1, 0, t, 1, 0], i * 6);
    if (i < nodes - 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // Placed in the vertex stage; the box the CPU sees is meaningless.
  geometry.boundingSphere = null;
  return geometry;
}

/**
 * A unit floor quad for the clock dials, lying in XZ with its centre on the
 * origin: the instance matrix is the dial's position and diameter.
 */
export function createRecallGlyphGeometry() {
  return new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
}
