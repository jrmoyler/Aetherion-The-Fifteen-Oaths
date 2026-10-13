import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  SphereGeometry
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Pollen Nova — procedural geometry. Built once, at construction.
 *
 * The petals are the only thing here that is not an ordinary mesh: one
 * parameter-space strip, instanced, whose every vertex the petal shader bends
 * into place — so the bud, the open bloom and the wilt are three settings of the
 * same uniforms, and the flower opens with nothing but a uniform write a frame.
 */

/**
 * One petal as a strip in parameter space, instanced.
 *
 * `position.x` runs across the petal, -1..1; `position.y` along it, 0 at the
 * base to 1 at the tip. Rows are packed toward the base, where the petal bends
 * hardest as it curls open. Per instance, `aPetal` = (layer, bearing, seed,
 * length jitter) — written by the ability every frame from its dice and the
 * live per-layer counts.
 *
 * @param {number} maxPetals instance capacity
 */
export function createPetalGeometry(maxPetals, cols = 10, rows = 18) {
  const count = (cols + 1) * (rows + 1);
  const position = new Float32Array(count * 3);
  let k = 0;
  for (let j = 0; j <= rows; j++) {
    const s = Math.pow(j / rows, 0.85);
    for (let i = 0; i <= cols; i++) {
      position[k * 3] = (i / cols) * 2 - 1;
      position[k * 3 + 1] = s;
      position[k * 3 + 2] = 0;
      k++;
    }
  }
  const index = new Uint16Array(cols * rows * 6);
  let n = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + cols + 1;
      index[n++] = a;
      index[n++] = a + 1;
      index[n++] = b;
      index[n++] = a + 1;
      index[n++] = b + 1;
      index[n++] = b;
    }
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  const petal = new InstancedBufferAttribute(new Float32Array(maxPetals * 4), 4).setUsage(DynamicDrawUsage);
  geometry.setAttribute('aPetal', petal);
  geometry.instanceCount = 0;
  return geometry;
}

/**
 * A stamen: a thin stalk with an anther bulb on top, one unit tall along +Y.
 * `aPart` tells the shader which is which (0 stalk, 1 anther).
 */
export function createStamenGeometry() {
  const stalk = new CylinderGeometry(0.035, 0.05, 0.86, 6, 4, true);
  stalk.translate(0, 0.43, 0);
  const anther = new SphereGeometry(0.11, 10, 8);
  anther.scale(1, 1.35, 1);
  anther.translate(0, 0.93, 0);
  tagPart(stalk, 0);
  tagPart(anther, 1);
  stalk.deleteAttribute('uv');
  anther.deleteAttribute('uv');
  const merged = mergeGeometries([stalk, anther]);
  stalk.dispose();
  anther.dispose();
  return merged;
}

/**
 * A dome: the pistil's head (part 2) or, flattened, the green receptacle the
 * petals grow out of (part 3).
 */
export function createDomeGeometry(part) {
  const dome = new SphereGeometry(1, 28, 16);
  dome.deleteAttribute('uv');
  tagPart(dome, part);
  return dome;
}

/** A pollen shell — a plain sphere; its shader does the rest. */
export function createShellGeometry() {
  const sphere = new SphereGeometry(1, 56, 36);
  sphere.deleteAttribute('uv');
  return sphere;
}

/** A unit quad on the floor, ±1 in x/z — the foliage. */
export function createGroundQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3)
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1, 0, 3, 2]), 1));
  return geometry;
}

function tagPart(geometry, part) {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(count).fill(part), 1));
}
