import { BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Nebula Collapse — procedural geometry.
 *
 * Every piece of the cloud is a camera-facing quad whose *place* is resolved
 * in the vertex stage from per-instance dice and live uniforms (the cloud's
 * centre, radius, rotation, how far it has collapsed, how far it has blown
 * out). Nothing is baked: the dice are rolled once per cast into the instance
 * buffers and every metre comes from the settings each frame.
 */

/**
 * `count` instanced unit quads (XY, ±0.5) with two dice attributes:
 *
 *   - `aDice`  — x: bearing (rad), y: radial 0..1 (area-uniform), z: height
 *                -1..1, w: size jitter -1..1
 *   - `aSeed`  — x: seed 0..1, y: colour pick 0..1, z: spin jitter -1..1,
 *                w: twinkle/flicker phase 0..1
 */
export function createDiceQuadGeometry(count) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3)
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.setAttribute('aDice', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
  geometry.instanceCount = count;
  // Placed in the vertex stage: the CPU never knows where, so never cull.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * Roll fresh dice into a dice-quad geometry. Allocation-free.
 *
 * @param {InstancedBufferGeometry} geometry
 * @param {number} count how many instances to roll
 * @param {number} core 0..1 — share of instances drawn toward the middle
 *   (a nebula is denser at its heart)
 */
export function rollDice(geometry, count, core = 0) {
  const dice = geometry.attributes.aDice.array;
  const seed = geometry.attributes.aSeed.array;
  const turn = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const k = i * 4;
    // Golden-angle spread, jittered, so no two puffs stack.
    dice[k] = turn + i * 2.399963 + (Math.random() - 0.5) * 0.9;
    // Area-uniform and rolled, not ordered: the editor's count slider draws
    // the first N instances, and they must still fill the whole cloud.
    const r = Math.sqrt(Math.random());
    dice[k + 1] = Math.random() < core ? r * 0.45 : r;
    // Heights bunch toward the mid-plane: the sum of two dice.
    dice[k + 2] = Math.random() + Math.random() - 1;
    dice[k + 3] = Math.random() * 2 - 1;
    seed[k] = Math.random();
    seed[k + 1] = Math.random();
    seed[k + 2] = Math.random() * 2 - 1;
    seed[k + 3] = Math.random();
  }
  geometry.attributes.aDice.needsUpdate = true;
  geometry.attributes.aSeed.needsUpdate = true;
}
