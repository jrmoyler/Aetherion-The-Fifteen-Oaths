import { BoxGeometry, IcosahedronGeometry } from 'three';

/**
 * Glacier Calving — procedural geometry.
 *
 *  - **the shelf** — a subdivided box in a unit frame built for toppling:
 *    x −0.5..0.5 across, y 0..1 up, z −1..0 *back* from its front face, so
 *    its front-bottom edge lies on the local X axis through the origin and a
 *    rotation about X tips it forward over that edge. Its top is cut into
 *    **seracs** — a row of jagged ice towers — and every face is roughened,
 *    both by one deterministic function of the undisplaced position, so the
 *    box's split face vertices move together and no seam opens.
 *  - **the chunk** — a once-subdivided icosahedron dented by the same kind of
 *    noise: one block of broken glacier, instanced and scaled per chunk.
 */

function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise, 3D, deterministic. */
function vnoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c000 = hash(xi, yi, zi);
  const c100 = hash(xi + 1, yi, zi);
  const c010 = hash(xi, yi + 1, zi);
  const c110 = hash(xi + 1, yi + 1, zi);
  const c001 = hash(xi, yi, zi + 1);
  const c101 = hash(xi + 1, yi, zi + 1);
  const c011 = hash(xi, yi + 1, zi + 1);
  const c111 = hash(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w
  );
}

/**
 * @param {number} serrations seracs along the top
 * @param {number} serrDepth  how deep the notches between them cut (× height)
 * @param {number} rough      surface roughness (unit lengths)
 * @param {number} aspect     height ÷ width, so the seracs stay roughly square
 */
export function createShelfGeometry(serrations = 6, serrDepth = 0.14, rough = 0.02, aspect = 1) {
  const g = new BoxGeometry(1, 1, 1, 24, 20, 4);
  g.translate(0, 0.5, -0.5);
  const pos = g.attributes.position;
  const n = Math.max(1, serrations);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Seracs: a jagged sawtooth along the top, fading out down the face.
    const top = Math.max(0, (y - 0.55) / 0.45);
    const t = (x + 0.5) * n;
    const saw = Math.abs((t - Math.floor(t)) * 2 - 1); // 0 at a peak, 1 in a notch
    const jag = vnoise(x * n * 2.3, z * 3.1, 7.7);
    let dy = -(saw * 0.8 + jag * 0.5) * serrDepth * top * top;
    // Rough all over: pushed along the face normal, roughly.
    const r = (vnoise(x * 9, y * 9 * aspect, z * 9) - 0.5) * 2 * rough;
    const r2 = (vnoise(x * 23 + 5, y * 23 * aspect, z * 23) - 0.5) * rough * 0.6;
    let dx = 0;
    let dz = 0;
    if (Math.abs(z) < 1e-4 || Math.abs(z + 1) < 1e-4) dz = (r + r2) * (z < -0.5 ? -1 : 1) * 2.5;
    else if (Math.abs(Math.abs(x) - 0.5) < 1e-4) dx = (r + r2) * Math.sign(x);
    else if (y > 0.999) dy += (r + r2) * 0.5;
    // Keep the toppling edge (front-bottom) on the axis.
    if (y < 1e-4) dy = 0;
    pos.setXYZ(i, x + dx, y + dy, z + dz);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** One block of broken glacier, unit radius. */
export function createChunkGeometry() {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.72 + 0.5 * vnoise(x * 1.7 + 3, y * 1.7, z * 1.7);
    // Flattened a little, as broken slab is.
    pos.setXYZ(i, x * k, y * k * 0.75, z * k);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
