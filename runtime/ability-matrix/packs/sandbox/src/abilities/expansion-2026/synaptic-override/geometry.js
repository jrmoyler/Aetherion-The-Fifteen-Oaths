import {
  BufferAttribute,
  BufferGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  PlaneGeometry,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import { MAX_ARMS } from './crown.js';

/**
 * Synaptic Override — procedural geometry. Nothing here is placed in the
 * world: the crown, the axon and the arcs are *parameter buffers* that their
 * vertex stages bend into shape every frame (see `crown.js`), and the solid
 * parts are authored lathe profiles the ability scales from settings.
 */

/** Rings along a primary arm and along a twig. */
export const ARM_SEGMENTS = 44;
export const TWIG_SEGMENTS = 22;
const RADIAL = 9;

function tube(positions, branch, indices, segments, arm, slot, side, seed) {
  const base = positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    for (let j = 0; j <= RADIAL; j++) {
      const phi = (j / RADIAL) * Math.PI * 2;
      positions.push(Math.cos(phi), Math.sin(phi), u);
      branch.push(arm, slot, side, seed);
    }
  }
  const row = RADIAL + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = base + i * row + j,
        b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

/**
 * The dendrite crown: MAX_ARMS arms × (one primary + two twigs), each a
 * closed tube in parameter space — `position` = (ring cos, ring sin, u along)
 * and `aBranch` = (arm, slot, side, seed). `createDendriteMaterial` inflates
 * it round the centreline in `crown.js`.
 */
export function createCrownGeometry() {
  const positions = [],
    branch = [],
    indices = [];
  for (let arm = 0; arm < MAX_ARMS; arm++) {
    const seed = ((arm * 0.6180339) % 1 + 1) % 1;
    tube(positions, branch, indices, ARM_SEGMENTS, arm, 0, 0, seed);
    tube(positions, branch, indices, TWIG_SEGMENTS, arm, 1, -1, (seed + 0.37) % 1);
    tube(positions, branch, indices, TWIG_SEGMENTS, arm, 2, 1, (seed + 0.71) % 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aBranch', new BufferAttribute(new Float32Array(branch), 4));
  geometry.setIndex(indices);
  // The buffer is parameter space; the real extent is set in the shader.
  geometry.boundingSphere = new Sphere(new Vector3(), 14);
  return geometry;
}

/** The travelling axon: a tube in parameter space, (ring cos, ring sin, s). */
export function createAxonGeometry(segments = 140, radial = 7) {
  const positions = [],
    indices = [];
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      positions.push(Math.cos(phi), Math.sin(phi), i / segments);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * row + j,
        b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 60);
  return geometry;
}

/** A bolt ribbon, (s along, side ±1, 0); faced to the camera in the shader. */
export function createArcGeometry(segments = 30) {
  const positions = [],
    indices = [];
  for (let i = 0; i <= segments; i++) positions.push(i / segments, -1, 0, i / segments, 1, 0);
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 60);
  return geometry;
}

/** The soma: a dense sphere the membrane shader heaves into a cell body. */
export function createSomaGeometry() {
  return new IcosahedronGeometry(1, 5);
}

/**
 * A myelin segment: a barrel with a pinched waist, a raised collar at each
 * end and a node-of-Ranvier lip — one unit tall, one unit in radius, along +Y.
 */
export function createSheathGeometry() {
  const pts = [];
  const profile = [
    [0.0, -0.5], [0.62, -0.5], [0.86, -0.46], [0.92, -0.4], [0.8, -0.35],
    [0.9, -0.28], [1.0, -0.15], [0.94, -0.04], [0.86, 0.0], [0.94, 0.04],
    [1.0, 0.15], [0.9, 0.28], [0.8, 0.35], [0.92, 0.4], [0.86, 0.46],
    [0.62, 0.5], [0.0, 0.5],
  ];
  for (const [r, y] of profile) pts.push(new Vector2(r, y));
  const geometry = new LatheGeometry(pts, 14);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A synaptic terminal (bouton): a flared foot cup gripping the floor, a
 * narrow neck and a swollen knob — about 1.25 units tall, 1 unit across.
 */
export function createBoutonGeometry() {
  const profile = [
    [0.0, 0.0], [0.95, 0.0], [1.0, 0.05], [0.82, 0.12], [0.5, 0.2],
    [0.36, 0.32], [0.34, 0.45], [0.48, 0.58], [0.66, 0.72], [0.72, 0.88],
    [0.64, 1.04], [0.44, 1.16], [0.2, 1.23], [0.0, 1.25],
  ];
  const geometry = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 16);
  geometry.computeVertexNormals();
  return geometry;
}

/** Unit quad for floor-aligned shader carriers (field, lens). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
