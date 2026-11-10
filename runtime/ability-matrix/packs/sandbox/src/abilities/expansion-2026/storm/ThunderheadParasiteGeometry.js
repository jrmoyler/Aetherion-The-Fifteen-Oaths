import { BufferAttribute, BufferGeometry, IcosahedronGeometry, PlaneGeometry } from 'three';

/**
 * Thunderhead Parasite — procedural geometry.
 *
 *  - **the thunderhead** — a cumulonimbus built the way a cloud is: out of
 *    lobes. Forty-odd lumpy spheres: a broad level belly, a tower heaped up
 *    the middle, small turrets budding off the tower (the cauliflower), and
 *    a sheared anvil shelf leaning off one side at the top. Every lobe is roughened by a smooth hash field, the underside is
 *    pressed flat (a real thunderhead has a level base where the air reaches
 *    its dew point), and the lobes are merged into one geometry so the cloud
 *    draws in a single call. Each vertex carries `aLobe` (a per-lobe seed for
 *    the shader's billow phase) and `aHeight` (0 at the base, 1 at the crown)
 *    so the shader can light the crown and darken the belly without knowing
 *    the cluster's layout.
 *  - **strand ribbons** — the tether bolts and the retaliation strike. A strip
 *    of `points − 1` quads with a `uv` (x along, y across); vertices are
 *    written in world space by the ability.
 *  - **ground quad / warp quad** — flat units placed and sized by their
 *    shaders.
 */

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 3D value noise in 0..1 — construction time only. */
function valueNoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  let sum = 0;
  for (let k = 0; k < 2; k++)
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const weight = (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
        sum += weight * hash3(xi + i, yi + j, zi + k);
      }
  return sum;
}

/**
 * The lobe layout, built once and deterministically. Unit cloud ≈ 2.6 m
 * across, base at y = −0.35, crown ≈ 1.25, anvil shelf ≈ 1.35.
 *
 *  - **base** — nine broad, flattened lobes on a ring: the dark, level belly
 *  - **tower** — lobes stacked and narrowing up the middle, leaning a little
 *  - **turrets** — small lobes budding out of the upper faces of the tower
 *    lobes; this is what makes the outline *cauliflower* rather than a puff
 *  - **anvil** — four wide, flat lobes sheared off one side at the top
 *
 * Each entry: [x, y, z, radius, sx, sy, sz].
 */
function buildLobes() {
  const lobes = [];
  const h = (n) => hash3(n, n * 0.37, 11.1);
  // Base ring + core.
  lobes.push([0, -0.02, 0, 0.62, 1.15, 0.75, 1.15]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + h(i) * 0.4;
    const rr = 0.72 + h(i + 20) * 0.22;
    lobes.push([Math.cos(a) * rr, -0.08 + h(i + 40) * 0.08, Math.sin(a) * rr * 0.85, 0.38 + h(i + 60) * 0.12, 1.2, 0.72, 1.2]);
  }
  // Tower: stacked and narrowing, leaning toward +x a little.
  const tower = [
    [0.05, 0.38, 0.05, 0.52],
    [-0.28, 0.42, -0.12, 0.4],
    [0.32, 0.44, 0.2, 0.38],
    [0.1, 0.72, -0.05, 0.42],
    [-0.15, 0.8, 0.18, 0.32],
    [0.3, 0.86, -0.18, 0.3],
    [0.16, 1.05, 0.02, 0.32]
  ];
  for (const [x, y, z, r] of tower) lobes.push([x, y, z, r, 1, 0.95, 1]);
  // Turrets: bud out of the upper face of each tower lobe.
  let k = 0;
  for (const [x, y, z, r] of tower) {
    for (let j = 0; j < 3; j++, k++) {
      const a = h(k + 80) * Math.PI * 2;
      const up = 0.35 + h(k + 90) * 0.55;
      const out = Math.sqrt(1 - up * up);
      const tr = r * (0.38 + h(k + 100) * 0.2);
      lobes.push([x + Math.cos(a) * out * r * 0.95, y + up * r * 0.95, z + Math.sin(a) * out * r * 0.95, tr, 1, 1, 1]);
    }
  }
  // Anvil: sheared off toward +x, flat and wide.
  lobes.push([0.5, 1.2, -0.1, 0.38, 1.7, 0.42, 1.3]);
  lobes.push([0.88, 1.24, 0.05, 0.32, 1.8, 0.38, 1.3]);
  lobes.push([0.2, 1.18, 0.15, 0.32, 1.6, 0.42, 1.3]);
  lobes.push([1.18, 1.22, -0.12, 0.24, 1.8, 0.34, 1.2]);
  return lobes;
}

const LOBES = buildLobes();
const BASE_Y = -0.35;
const TOP_Y = 1.4;

/**
 * Every vertex carries:
 *  - `aLobe`   a per-lobe seed (the shader's boil phase)
 *  - `aHeight` 0 at the base, 1 at the anvil
 *  - `aCenter` its lobe's centre, so each lobe can swell on its own
 *  - `aOcc`    how buried it is among its neighbours (0 open → 1 deep in a
 *              crevice), measured once here: the crevices between lobes go
 *              dark, which is what gives the cloud its volume
 */
export function createCloudGeometry(detail = 3) {
  const positions = [];
  const normals = [];
  const lobes = [];
  const heights = [];
  const centers = [];
  const occ = [];
  for (let l = 0; l < LOBES.length; l++) {
    const [cx, cy, cz, r, sx, sy, sz] = LOBES[l];
    const lobe = new IcosahedronGeometry(1, r > 0.3 ? detail : Math.max(1, detail - 1));
    const p = lobe.attributes.position;
    const seed = hash3(l, l * 1.7, 3.3);
    for (let i = 0; i < p.count; i++) {
      const ux = p.getX(i);
      const uy = p.getY(i);
      const uz = p.getZ(i);
      // Cauliflower: two octaves of smooth noise, so each lobe boils in
      // rounded bumps rather than spikes.
      const n = valueNoise(ux * 2.3 + l * 3.1, uy * 2.3, uz * 2.3) * 0.7 + valueNoise(ux * 5.1, uy * 5.1 + l, uz * 5.1) * 0.3;
      const k = r * (0.8 + n * 0.4);
      const x = cx + ux * k * sx;
      let y = cy + uy * k * sy;
      const z = cz + uz * k * sz;
      let nx = ux / sx;
      let ny = uy / sy;
      let nz = uz / sz;
      // The level base: anything below the condensation line is pressed up
      // onto it, with a little sag so it is not a cut plane, and faces down.
      if (y < BASE_Y) {
        y = BASE_Y - (BASE_Y - y) * 0.12;
        nx *= 0.3;
        ny = -1;
        nz *= 0.3;
      }
      // Mostly the lobe's own normal (so lobes shade apart), a little of the
      // cluster's so the very deepest creases do not flip to black.
      const ox = x;
      const oy = y - 0.3;
      const oz = z;
      const ol = Math.hypot(ox, oy, oz) || 1;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx = (nx / nl) * 0.82 + (ox / ol) * 0.18;
      ny = (ny / nl) * 0.82 + (oy / ol) * 0.18;
      nz = (nz / nl) * 0.82 + (oz / ol) * 0.18;
      const bl = Math.hypot(nx, ny, nz) || 1;
      // Burial: how close this point sits to the other lobes' surfaces.
      let buried = 0;
      let inside = false;
      for (let m = 0; m < LOBES.length; m++) {
        if (m === l) continue;
        const [mx, my, mz, mr] = LOBES[m];
        const d = Math.hypot(x - mx, y - my, z - mz) - mr;
        if (d <= 0) inside = true;
        else buried += Math.exp(-d / (mr * 0.35 + 0.02));
      }
      positions.push(x, y, z);
      normals.push(nx / bl, ny / bl, nz / bl);
      lobes.push(seed);
      heights.push(Math.min(1, Math.max(0, (y - BASE_Y) / (TOP_Y - BASE_Y))));
      centers.push(cx, cy, cz);
      occ.push(inside ? 1 : Math.min(1, buried * 0.6));
    }
    lobe.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('aLobe', new BufferAttribute(new Float32Array(lobes), 1));
  geometry.setAttribute('aHeight', new BufferAttribute(new Float32Array(heights), 1));
  geometry.setAttribute('aCenter', new BufferAttribute(new Float32Array(centers), 3));
  geometry.setAttribute('aOcc', new BufferAttribute(new Float32Array(occ), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** World-space strip of `points − 1` quads; the ability writes its vertices. */
export function createStrandGeometry(points = 12) {
  const geometry = new BufferGeometry();
  const p = new Float32Array(points * 2 * 3);
  const uv = new Float32Array(points * 2 * 2);
  const index = [];
  for (let i = 0; i < points; i++) {
    uv.set([i / (points - 1), 0, i / (points - 1), 1], i * 4);
    if (i < points - 1) {
      const j = i * 2;
      index.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  geometry.setAttribute('position', new BufferAttribute(p, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/** A flat unit quad on the floor (XZ), centred. */
export function createGroundQuad() {
  const geometry = new PlaneGeometry(2, 2, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** The warp billboard. */
export function createWarpQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
