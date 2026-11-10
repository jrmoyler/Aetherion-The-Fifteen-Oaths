import { BufferAttribute, BufferGeometry, IcosahedronGeometry, PlaneGeometry } from 'three';

/**
 * Impact Dividend — procedural geometry.
 *
 * **The bulwark petal** (`createPetalGeometry`) is the hero: a thick, cupped,
 * lamellar shell of forged plate, built in a unit frame — hinge at the
 * origin on the floor, height 1 along +y, base width 1 along x, and **+z
 * pointing at the centre of the bank**. Its spine bows inward as it rises
 * (`bend · s²`) so six of them lean together into a closed bud; its section
 * is cupped (the edges wrap toward the centre) so a petal holds the core
 * like a palm; its outer face is stepped into overlapping lamellae (a saw
 * profile in height — each band's lip stands proud and catches the sun) with
 * a raised spine ridge; it tapers to a blunt point. Four parts — outer
 * face, inner face, the two side walls and the root cap — keep hard edges
 * for the lighting. Attributes:
 *
 *   - `uv`     — (across 0..1, height s 0..1), read by the seam shader
 *   - `aInner` — 1 on the inner face (lit by the core), 0 outside
 *
 * The petal is rigid; the cast hinges and presses it as a whole, so the
 * standard material, shadows and depth all just work.
 */

const NS = 54; // rows up the petal (lamella lips need the density)
const NA = 18; // columns across
const BANDS = 6; // lamellae from root to tip (the seam shader uses the same)
export const PETAL_BANDS = BANDS;

const BEND = 0.24;
const CUP = 0.14;
const LAMELLA = 0.035;
const RIDGE = 0.045;
const THICK = 0.05;

function halfWidth(s) {
  const taper = 1 - (1 - 0.07) * Math.pow(s, 1.25);
  return 0.5 * taper * (1 + 0.14 * Math.sin(Math.PI * s));
}

/** Outer (`side` 0) or inner (`side` 1) surface point, unit frame. */
function surface(s, a, side, out) {
  const w = halfWidth(s);
  const spine = BEND * s * s + CUP * a * a * (0.6 + 0.4 * (1 - s));
  if (side === 0) {
    const f = (s * BANDS) % 1;
    // Saw profile: each lamella swells outward toward its lower lip.
    const lam = LAMELLA * Math.pow(f, 1.6) * (1 - 0.6 * s);
    const ridge = RIDGE * Math.exp(-Math.pow(a / 0.16, 2)) * (1 - 0.7 * s);
    out[0] = a * w;
    out[1] = s;
    out[2] = spine - lam - ridge;
  } else {
    out[0] = a * w * 0.94;
    out[1] = s;
    out[2] = spine + THICK * (1 - 0.65 * s);
  }
  return out;
}

function grid(rows, cols, at, inner, flip) {
  const pos = [];
  const uv = [];
  const inn = [];
  const idx = [];
  const p = [0, 0, 0];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      at(i / rows, j / cols, p);
      pos.push(p[0], p[1], p[2]);
      uv.push(p.u ?? j / cols, p.v ?? i / rows);
      inn.push(inner);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('aInner', new BufferAttribute(new Float32Array(inn), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function merge(parts) {
  let vertices = 0;
  let indices = 0;
  for (const p of parts) {
    vertices += p.attributes.position.count;
    indices += p.index.count;
  }
  const pos = new Float32Array(vertices * 3);
  const nor = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const inn = new Float32Array(vertices);
  const idx = new Uint32Array(indices);
  let v = 0;
  let k = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, v * 3);
    nor.set(p.attributes.normal.array, v * 3);
    uv.set(p.attributes.uv.array, v * 2);
    inn.set(p.attributes.aInner.array, v);
    const src = p.index.array;
    for (let i = 0; i < src.length; i++) idx[k++] = src[i] + v;
    v += p.attributes.position.count;
    p.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('aInner', new BufferAttribute(inn, 1));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** The lamellar bulwark petal (see the module comment). */
export function createPetalGeometry() {
  const outer = grid(NS, NA, (s, t, p) => surface(s, t * 2 - 1, 0, p), 0, false);
  const inner = grid(NS, NA, (s, t, p) => surface(s, t * 2 - 1, 1, p), 1, true);
  const q = [0, 0, 0];
  // Side walls: a strip from the outer edge to the inner edge at a = ±1.
  const wall = (sign, flip) =>
    grid(NS, 1, (s, t, p) => {
      surface(s, sign, 0, p);
      surface(s, sign, 1, q);
      p[0] += (q[0] - p[0]) * t;
      p[2] += (q[2] - p[2]) * t;
      p.u = sign > 0 ? 1 : 0;
      p.v = s;
    }, 0, flip);
  // Root cap at s = 0 (mostly buried, but it closes the shell when heaving).
  const cap = grid(1, NA, (t, j, p) => {
    surface(0, j * 2 - 1, 0, p);
    surface(0, j * 2 - 1, 1, q);
    p[2] += (q[2] - p[2]) * t;
    p.u = j;
    p.v = 0;
  }, 0, true);
  return merge([outer, inner, wall(1, false), wall(-1, true), cap]);
}

/** The core / slug carrier: a dense icosphere the core shader reshapes. */
export function createCoreGeometry() {
  return new IcosahedronGeometry(1, 5);
}

/** A unit floor quad (XY plane; the cast lays it flat). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
