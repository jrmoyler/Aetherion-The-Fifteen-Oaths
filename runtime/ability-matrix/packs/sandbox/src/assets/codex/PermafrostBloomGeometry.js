import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Permafrost Bloom — procedural meshes.
 *
 * Ice is faceted, so both crystals are built **non-indexed**, one normal per
 * face: the ice shader reads its sharp light changes off those normals, and
 * smoothing them would turn every crystal into a glass candle.
 */

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();

/** Push a triangle with its own flat normal. */
function tri(pos, nor, k, a, b, c) {
  _n.subVectors(b, a).cross(_c.subVectors(c, a)).normalize();
  for (const v of [a, b, c]) {
    pos[k] = v.x;
    pos[k + 1] = v.y;
    pos[k + 2] = v.z;
    nor[k] = _n.x;
    nor[k + 1] = _n.y;
    nor[k + 2] = _n.z;
    k += 3;
  }
  return k;
}

/**
 * An ice crystal: a hexagonal prism standing on the floor with a pointed
 * cap. Unit radius, unit height, base at y = 0, tip at y = 1, so an instance
 * matrix scales it straight to metres. The prism is a little wider at the top
 * than the base (crystals grow out of a seed point), and the cap is cut a
 * little off-axis so a ring of them does not read as a row of pencils.
 */
export function createIceCrystalGeometry() {
  const sides = 6;
  const shoulder = 0.72; // where the prism ends and the cap begins
  const triangles = sides * 2 + sides + sides; // walls, cap, base
  const pos = new Float32Array(triangles * 9);
  const nor = new Float32Array(triangles * 9);
  const tip = new Vector3(0.08, 1, -0.05);
  const centre = new Vector3(0, 0, 0);

  let k = 0;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const b0 = new Vector3(Math.cos(a0) * 0.82, 0, Math.sin(a0) * 0.82);
    const b1 = new Vector3(Math.cos(a1) * 0.82, 0, Math.sin(a1) * 0.82);
    const t0 = new Vector3(Math.cos(a0), shoulder, Math.sin(a0));
    const t1 = new Vector3(Math.cos(a1), shoulder, Math.sin(a1));
    // walls
    k = tri(pos, nor, k, b0, t1, b1);
    k = tri(pos, nor, k, b0, t0, t1);
    // cap
    k = tri(pos, nor, k, t0, tip, t1);
    // base (faces down, never really seen — closes the shadow)
    k = tri(pos, nor, k, centre, b0, b1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.boundingSphere = new Sphere(new Vector3(0, 0.5, 0), 1.2);
  return geometry;
}

/**
 * The frost seed: a hexagonal bipyramid, centred, unit radius — a snow
 * crystal's heart, small enough that its facets flash as it tumbles.
 */
export function createIceSeedGeometry() {
  const sides = 6;
  const pos = new Float32Array(sides * 2 * 9);
  const nor = new Float32Array(sides * 2 * 9);
  const top = new Vector3(0, 1.3, 0);
  const bottom = new Vector3(0, -1.3, 0);
  let k = 0;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    _a.set(Math.cos(a0), 0, Math.sin(a0));
    _b.set(Math.cos(a1), 0, Math.sin(a1));
    const p0 = _a.clone();
    const p1 = _b.clone();
    k = tri(pos, nor, k, p0, top, p1);
    k = tri(pos, nor, k, p1, bottom, p0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.boundingSphere = new Sphere(new Vector3(), 1.4);
  return geometry;
}

/** A flat ±1 quad in XZ — the rime and the cold-air proxy scale it in the vertex stage. */
export function createGroundQuadGeometry() {
  const positions = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
