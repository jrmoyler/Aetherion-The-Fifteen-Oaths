import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from 'three';

/**
 * Mirage Procession — procedural geometry.
 *
 *  - **the mask** — a carved theatrical face: a displaced heightfield over an
 *    oval outline (domed forehead, arched brow ridge, sunk sockets, a nose
 *    bridge to a proud tip, high cheekbones with hollows under them, lips
 *    and chin), given a lacquer's thickness, with the eye apertures and the
 *    mouth slit cut clean through and every open edge walled.
 *    `faceRelief(x, y)` is the one surface function, so the engraving and
 *    the shader's eye glow sit exactly on it.
 *  - **the engraving** — crown, brow, cheek spirals, tear lines and mouth,
 *    as line segments on the sculpted surface; `aT` runs along each stroke
 *    so the shader can run glints down them.
 *  - **the veil** — a ribbon grid hung from the crown, `uv.y` 0 at the mask,
 *    1 at the trailing hem; the vertex stage flutters it.
 *  - **the mirror shard** — an irregular bevelled kite with a real thickness
 *    and rim, so it flashes edge-on as it turns.
 *  - **the glitter** — a fixed seed cloud placed entirely in the shader.
 */

/*
 * The carved face. Local units: about 0.96 wide × 1.42 tall, facing +Z,
 * centred near the cheekbones. Everything below is one heightfield,
 * `faceRelief(x, y)`, over an oval outline `faceHalfWidth(y)`, so the
 * engraving and the shader's eye/mouth glow can be laid exactly on it.
 */
export const FACE_TOP = 0.68;
export const FACE_BOTTOM = -0.74;
/** Eye apertures (mirrored): centre, radii, tilt (outer corner lifted). */
export const FACE_EYE = { x: 0.2, y: 0.1, rx: 0.105, ry: 0.05, tilt: 0.2 };
/** Mouth slit: centre height, half-width, half-height, corner lift. */
export const FACE_MOUTH = { y: -0.37, rx: 0.17, ry: 0.026, lift: 0.02 };
/** Lacquer thickness (local units). */
const FACE_THICK = 0.055;

const gauss = (d2, w) => Math.exp(-d2 / w);

/** Half-width of the face outline at height y: domed brow, wide cheekbones, tapered jaw. */
export function faceHalfWidth(y) {
  if (y >= 0.02) {
    const t = Math.min(1, (y - 0.02) / (FACE_TOP - 0.02));
    return 0.48 * Math.cbrt(Math.max(0, 1 - t * t * t)) + 0.0;
  }
  const t = Math.min(1, (0.02 - y) / (0.02 - FACE_BOTTOM));
  // Cheekbones hold the width, the jaw cuts in, the chin rounds off.
  return Math.max(0, 0.48 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.4))) * (1 - 0.28 * t * t));
}

/** The carved surface (local z) at (x, y). */
export function faceRelief(x, y) {
  const ax = Math.abs(x);
  let z = -0.62 * x * x - 0.1 * y * y; // the face wraps round the head
  z += 0.035 * gauss(x * x * 0.6 + (y - 0.45) ** 2, 0.05); // domed forehead
  // Brow ridge: arched over each eye, deepest shadow beneath it.
  const browY = 0.205 + 0.035 * gauss((ax - 0.2) ** 2, 0.012);
  z += 0.075 * gauss((y - browY) ** 2, 0.0018) * gauss(Math.max(0, ax - 0.06) ** 2, 0.06);
  // Eye sockets sunk round the apertures.
  z -= 0.085 * gauss((ax - FACE_EYE.x) ** 2 / 1.4 + (y - FACE_EYE.y) ** 2, 0.006);
  // Nose: a narrow bridge from the brow widening to a tip that stands proud.
  if (y < 0.24 && y > -0.3) {
    const along = (0.24 - y) / 0.42; // 0 at the bridge, 1 at the tip
    const w = 0.0011 + 0.0042 * along * along;
    const height = (0.07 + 0.11 * along) * (y > -0.18 ? 1 : gauss((y + 0.18) ** 2, 0.002));
    z += height * gauss(x * x, w) * Math.min(1, (0.24 - y) / 0.06);
  }
  // Nostril wings.
  z += 0.03 * gauss((ax - 0.055) ** 2 + (y + 0.17) ** 2, 0.0012);
  // Cheekbones high and hard, hollows under them.
  z += 0.07 * gauss((ax - 0.29) ** 2 + ((y + 0.03) ** 2) * 2.2, 0.009);
  z -= 0.04 * gauss((ax - 0.25) ** 2 + (y + 0.24) ** 2, 0.01);
  // Lips round the slit, a philtrum groove, the chin.
  z += 0.04 * gauss(x * x * 0.35 + (y + 0.37) ** 2 * 6, 0.006);
  z -= 0.015 * gauss(x * x * 30 + (y + 0.26) ** 2 * 6, 0.004);
  z += 0.05 * gauss(x * x * 1.4 + (y + 0.6) ** 2, 0.006);
  return z;
}

/** Signed hole test: < 0 inside an eye aperture or the mouth slit. */
function holeValue(x, y) {
  const ex0 = Math.abs(x) - FACE_EYE.x, ey0 = y - FACE_EYE.y;
  const cs = Math.cos(FACE_EYE.tilt), sn = Math.sin(FACE_EYE.tilt);
  const ex = ex0 * cs + ey0 * sn, ey = -ex0 * sn + ey0 * cs;
  const eye = Math.hypot(ex / FACE_EYE.rx, ey / FACE_EYE.ry) - 1;
  const u = x / FACE_MOUTH.rx;
  const dy = y - FACE_MOUTH.y - FACE_MOUTH.lift * u * u;
  const mouth = Math.hypot(u, dy / FACE_MOUTH.ry) - 1;
  return Math.min(eye, mouth);
}

/** Pull a point near a hole onto the hole's contour (smooth cut rims). */
function snapToHole(x, y, out) {
  const ex0 = Math.abs(x) - FACE_EYE.x, ey0 = y - FACE_EYE.y;
  const cs = Math.cos(FACE_EYE.tilt), sn = Math.sin(FACE_EYE.tilt);
  const ex = ex0 * cs + ey0 * sn, ey = -ex0 * sn + ey0 * cs;
  const eye = Math.hypot(ex / FACE_EYE.rx, ey / FACE_EYE.ry);
  const u = x / FACE_MOUTH.rx;
  const dy = y - FACE_MOUTH.y - FACE_MOUTH.lift * u * u;
  const mouth = Math.hypot(u, dy / FACE_MOUTH.ry);
  if (eye < mouth) {
    const k = 1 / Math.max(1e-6, eye);
    const qx = ex * k, qy = ey * k;
    const rx = qx * cs - qy * sn, ry = qx * sn + qy * cs;
    out[0] = Math.sign(x || 1) * (rx + FACE_EYE.x);
    out[1] = ry + FACE_EYE.y;
  } else {
    const k = 1 / Math.max(1e-6, mouth);
    const nu = u * k;
    out[0] = nu * FACE_MOUTH.rx;
    out[1] = FACE_MOUTH.y + FACE_MOUTH.lift * nu * nu + (dy * k);
  }
  return out;
}

/**
 * The carved mask: a solid lacquer shell with real thickness. Front and back
 * skins follow `faceRelief`; the eye apertures and the mouth slit are cut
 * clean through (you see the floor through them) and every open edge — the
 * outline and the cut rims — is walled. `aEdge` is the distance to the outer
 * outline (0 on the rim walls), for the gilding.
 */
export function createMaskGeometry({ across = 64, rows = 104 } = {}) {
  const cols = across + 1;
  const N = cols * (rows + 1);
  const xy = new Float32Array(N * 2);
  const edge = new Float32Array(N);
  for (let j = 0; j <= rows; j++) {
    const y = FACE_BOTTOM + (FACE_TOP - FACE_BOTTOM) * (j / rows);
    const hw = Math.max(0.012, faceHalfWidth(y));
    for (let i = 0; i <= across; i++) {
      const u = (i / across) * 2 - 1;
      const k = j * cols + i;
      xy[k * 2] = u * hw;
      xy[k * 2 + 1] = y;
      edge[k] = Math.min(hw * (1 - Math.abs(u)), (y - FACE_BOTTOM) * 0.8, (FACE_TOP - y) * 0.8);
    }
  }
  // Keep the triangles whose centroid is solid face.
  const tris = [];
  const keep = (a, b, c) => {
    const cx = (xy[a * 2] + xy[b * 2] + xy[c * 2]) / 3;
    const cy = (xy[a * 2 + 1] + xy[b * 2 + 1] + xy[c * 2 + 1]) / 3;
    if (holeValue(cx, cy) > 0) tris.push(a, b, c);
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < across; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      // Alternate the diagonal so the shading has no grain.
      if ((i + j) & 1) { keep(a, b, d); keep(a, d, c); } else { keep(a, b, c); keep(b, d, c); }
    }
  }
  // Open edges: used by exactly one kept triangle, in that triangle's winding.
  const count = new Map();
  const key = (a, b) => (a < b ? a * N + b : b * N + a);
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = key(tris[t + e], tris[t + ((e + 1) % 3)]);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  const open = [];
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)];
      if (count.get(key(a, b)) === 1) open.push(a, b);
    }
  }
  // Snap the vertices on the cut rims onto the hole contours.
  const snapped = new Uint8Array(N);
  const tmp = [0, 0];
  for (const v of open) {
    if (snapped[v]) continue;
    const x = xy[v * 2], y = xy[v * 2 + 1];
    if (edge[v] < 0.02) continue; // on the outer outline
    snapToHole(x, y, tmp);
    xy[v * 2] = tmp[0];
    xy[v * 2 + 1] = tmp[1];
    snapped[v] = 1;
  }
  // Front skin, with smooth normals.
  const front = new Float32Array(N * 3);
  for (let v = 0; v < N; v++) {
    front[v * 3] = xy[v * 2];
    front[v * 3 + 1] = xy[v * 2 + 1];
    front[v * 3 + 2] = faceRelief(xy[v * 2], xy[v * 2 + 1]);
  }
  const skin = new BufferGeometry();
  skin.setAttribute('position', new Float32BufferAttribute(front, 3));
  skin.setIndex(tris);
  skin.computeVertexNormals();
  const fn = skin.attributes.normal.array;
  skin.dispose();

  const R = open.length / 2;
  const total = N * 2 + R * 4;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const aEdge = new Float32Array(total);
  for (let v = 0; v < N; v++) {
    const nx = fn[v * 3], ny = fn[v * 3 + 1], nz = fn[v * 3 + 2];
    position.set([front[v * 3], front[v * 3 + 1], front[v * 3 + 2]], v * 3);
    normal.set([nx, ny, nz], v * 3);
    // The back skin sits a lacquer's thickness behind, along the normal.
    position.set([front[v * 3] - nx * FACE_THICK, front[v * 3 + 1] - ny * FACE_THICK, front[v * 3 + 2] - nz * FACE_THICK], (N + v) * 3);
    normal.set([-nx, -ny, -nz], (N + v) * 3);
    aEdge[v] = aEdge[N + v] = edge[v];
  }
  const index = tris.slice();
  for (let t = 0; t < tris.length; t += 3) index.push(N + tris[t], N + tris[t + 2], N + tris[t + 1]);
  // Rim walls, flat-shaded, outward-facing.
  for (let r = 0; r < R; r++) {
    const a = open[r * 2], b = open[r * 2 + 1];
    const base = N * 2 + r * 4;
    const af = base, ab = base + 1, bf = base + 2, bb = base + 3;
    position.set(position.subarray(a * 3, a * 3 + 3), af * 3);
    position.set(position.subarray((N + a) * 3, (N + a) * 3 + 3), ab * 3);
    position.set(position.subarray(b * 3, b * 3 + 3), bf * 3);
    position.set(position.subarray((N + b) * 3, (N + b) * 3 + 3), bb * 3);
    // Outward = right of a→b in the face plane (front winding is CCW).
    let ox = xy[b * 2 + 1] - xy[a * 2 + 1], oy = -(xy[b * 2] - xy[a * 2]);
    const l = Math.hypot(ox, oy) || 1;
    ox /= l; oy /= l;
    for (const v of [af, ab, bf, bb]) normal.set([ox, oy, 0], v * 3);
    const outer = edge[a] < 0.02 && edge[b] < 0.02;
    aEdge[af] = aEdge[ab] = aEdge[bf] = aEdge[bb] = outer ? 0 : 1;
    index.push(af, ab, bf, bf, ab, bb);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setAttribute('aEdge', new Float32BufferAttribute(aEdge, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Filigree laid on the carved front: forehead mark, brow arcs, cheek spirals. */
export function createEngravingGeometry() {
  const paths = [
    // forehead diamond (a third-eye mark)
    [[0, 0.5], [0.05, 0.42], [0, 0.34], [-0.05, 0.42], [0, 0.5]],
    // arcs over the brow
    [[-0.36, 0.3], [-0.26, 0.335], [-0.14, 0.33], [-0.07, 0.3]],
    [[0.36, 0.3], [0.26, 0.335], [0.14, 0.33], [0.07, 0.3]],
    // tear lines from the outer eye corners
    [[-0.3, 0.07], [-0.32, -0.02], [-0.31, -0.12]],
    [[0.3, 0.07], [0.32, -0.02], [0.31, -0.12]],
  ];
  // Cheek spirals: two turns of an Archimedean spiral below each cheekbone.
  for (const sign of [-1, 1]) {
    const spiral = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = t * Math.PI * 4 * sign;
      const r = 0.01 + t * 0.05;
      spiral.push([sign * 0.3 + Math.cos(a) * r, -0.2 + Math.sin(a) * r]);
    }
    paths.push(spiral);
  }
  const position = [];
  const along = [];
  const PROUD = 0.006;
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      position.push(ax, ay, PROUD + faceRelief(ax, ay), bx, by, PROUD + faceRelief(bx, by));
      along.push((i - 1) / (path.length - 1), i / (path.length - 1));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aT', new Float32BufferAttribute(along, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * A ribbon grid: x across (−½..½), hanging from y = 0 down a unit length
 * along +Z; the shader flutters, droops and scales it.
 */
export function createVeilGeometry({ across = 6, along = 18 } = {}) {
  const position = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= along; j++) {
    const v = j / along;
    for (let i = 0; i <= across; i++) {
      const u = i / across;
      position.push(u - 0.5, 0, v);
      uv.push(u, v);
    }
  }
  const row = across + 1;
  for (let j = 0; j < along; j++) {
    for (let i = 0; i < across; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Irregular bevelled mirror shard with a real rim. Points up +Y. */
export function createShardGeometry() {
  // Outline in XY, front face at +h, back at −h, rim joining them.
  const outline = [[0, 0.9], [-0.22, 0.32], [-0.34, -0.05], [-0.1, -0.8], [0.12, -0.62], [0.34, 0.06], [0.2, 0.42]];
  const h = 0.06;
  const position = [];
  const tri = (a, b, c) => position.push(...a, ...b, ...c);
  const n = outline.length;
  const cf = [0, 0.04, h * 1.6]; // front centre, slightly proud: a shallow facet
  const cb = [0, 0.04, -h * 1.6];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % n];
    tri(cf, [ax, ay, h], [bx, by, h]);
    tri(cb, [bx, by, -h], [ax, ay, -h]);
    tri([ax, ay, -h], [bx, by, -h], [ax, ay, h]);
    tri([ax, ay, h], [bx, by, -h], [bx, by, h]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.computeVertexNormals();
  return g;
}

/** `count` seeds for the GPU glitter. Positions are placeholders. */
export function createGlitterGeometry(count) {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  let h = 0x2545f491;
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  for (let i = 0; i < count; i++) {
    // Lanes are dealt round-robin so every lane always holds the same count.
    seed[i * 4 + 0] = (i % 3) - 1;
    seed[i * 4 + 1] = rand();
    seed[i * 4 + 2] = rand();
    seed[i * 4 + 3] = Math.floor(i / 3) / Math.ceil(count / 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  return g;
}

/** Unit quad. */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}
