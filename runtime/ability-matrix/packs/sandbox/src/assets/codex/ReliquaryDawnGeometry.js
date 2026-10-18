import { BufferAttribute, BufferGeometry, Shape, ShapeGeometry, Sphere, Vector3 } from 'three';

/**
 * Reliquary Dawn — procedural meshes.
 *
 *  - **the shrine frame**: a hexagonal reliquary built once in object space,
 *    base on y = 0: a stepped plinth, six square pillars with capitals, an
 *    entablature ring, a six-sided spire and a four-pointed sun finial on
 *    top. `aPart` tags each vertex (0 gilt frame · 1 finial · 2 plinth) and
 *    `aHeight` carries its height, so the shader can gild, glow and rise it.
 *  - **the panel**: one pointed-arch window (a `ShapeGeometry`), instanced six
 *    times by the ability, hinged along its bottom edge.
 *  - **grids** for the rays and the ground, bent from uniforms.
 *
 * All dimensions are exported so the ability places panels and the relic
 * exactly where the frame leaves room for them.
 */

export const SHRINE = Object.freeze({
  radius: 1.0, // pillar centres
  plinthR: 1.3,
  plinthH: 0.26,
  stepR: 1.14,
  stepH: 0.4,
  pillarW: 0.15,
  pillarTop: 2.5,
  capH: 0.14,
  entabR: 1.18,
  entabInner: 0.92,
  entabTop: 2.88,
  spireTop: 4.05,
  finial: 0.22,
  relicY: 1.45,
  panelW: 0.84,
  panelH: 2.05
});

const HUGE = new Sphere(new Vector3(), 1e4);

/** The gilt shrine frame. */
export function createShrineGeometry() {
  const pos = [];
  const part = [];
  const S = SHRINE;

  const tri = (a, b, c, p) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    part.push(p, p, p);
  };
  const quad = (a, b, c, d, p) => {
    tri(a, b, c, p);
    tri(a, c, d, p);
  };
  const hex = (r, y, k) => {
    const a = (k / 6) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  /** A hexagonal prism (or frustum) from y0 to y1, radius r0 → r1, with a top cap. */
  const prism = (r0, r1, y0, y1, p, cap = true) => {
    for (let k = 0; k < 6; k++) {
      const a0 = hex(r0, y0, k);
      const a1 = hex(r0, y0, k + 1);
      const b1 = hex(r1, y1, k + 1);
      const b0 = hex(r1, y1, k);
      quad(a0, a1, b1, b0, p);
      if (cap) tri([0, y1, 0], b0, b1, p);
    }
  };
  /** An axis-aligned box rotated by `ang` about Y, centred at (cx, cz). */
  const box = (cx, cz, ang, hw, hd, y0, y1, p) => {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const P = (x, y, z) => [cx + x * ca - z * sa, y, cz + x * sa + z * ca];
    const c = [
      P(-hw, y0, -hd), P(hw, y0, -hd), P(hw, y0, hd), P(-hw, y0, hd),
      P(-hw, y1, -hd), P(hw, y1, -hd), P(hw, y1, hd), P(-hw, y1, hd)
    ];
    quad(c[0], c[1], c[5], c[4], p);
    quad(c[1], c[2], c[6], c[5], p);
    quad(c[2], c[3], c[7], c[6], p);
    quad(c[3], c[0], c[4], c[7], p);
    quad(c[4], c[5], c[6], c[7], p);
  };

  /* the stepped plinth */
  prism(S.plinthR, S.plinthR, 0, S.plinthH, 2);
  prism(S.stepR, S.stepR, S.plinthH, S.stepH, 2);

  /* six pillars with capitals and bases */
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const cx = Math.cos(a) * S.radius;
    const cz = Math.sin(a) * S.radius;
    box(cx, cz, -a, S.pillarW * 0.5, S.pillarW * 0.5, S.stepH, S.pillarTop, 0);
    box(cx, cz, -a, S.pillarW * 0.8, S.pillarW * 0.8, S.stepH, S.stepH + 0.1, 0);
    box(cx, cz, -a, S.pillarW * 0.85, S.pillarW * 0.85, S.pillarTop, S.pillarTop + S.capH, 0);
  }

  /* the entablature: a hexagonal ring band */
  const e0 = S.pillarTop + S.capH;
  for (let k = 0; k < 6; k++) {
    const o0 = hex(S.entabR, e0, k);
    const o1 = hex(S.entabR, e0, k + 1);
    const O1 = hex(S.entabR, S.entabTop, k + 1);
    const O0 = hex(S.entabR, S.entabTop, k);
    const i0 = hex(S.entabInner, e0, k);
    const i1 = hex(S.entabInner, e0, k + 1);
    quad(o0, o1, O1, O0, 0);
    quad(i0, o0, o1, i1, 0); // underside
  }

  /* the spire: six faces up to a point, with a ridge band at its foot */
  prism(S.entabR, S.entabR * 0.98, S.entabTop, S.entabTop + 0.06, 0, false);
  for (let k = 0; k < 6; k++) {
    tri(hex(S.entabR * 0.98, S.entabTop + 0.06, k), hex(S.entabR * 0.98, S.entabTop + 0.06, k + 1), [0, S.spireTop, 0], 0);
    // crockets: a small fin up each ridge
    const r = hex(S.entabR * 0.98, S.entabTop + 0.06, k);
    const m = [r[0] * 0.5, (r[1] + S.spireTop) * 0.5, r[2] * 0.5];
    tri(r, m, [m[0] * 1.25, m[1] + 0.12, m[2] * 1.25], 0);
  }

  /* the finial: a four-pointed sun — two crossed diamonds and a bead */
  const f = S.finial;
  const fy = S.spireTop + f;
  for (let k = 0; k < 2; k++) {
    const ax = k === 0 ? 1 : 0;
    const az = k === 0 ? 0 : 1;
    const t = 0.02;
    const top = [0, fy + f * 1.4, 0];
    const bot = [0, S.spireTop - 0.05, 0];
    const l = [-ax * f, fy, -az * f];
    const r = [ax * f, fy, az * f];
    const fz = [az * t, 0, -ax * t];
    const off = (p, s) => [p[0] + fz[0] * s, p[1], p[2] + fz[2] * s];
    tri(off(top, 1), off(l, 1), off(bot, 1), 1);
    tri(off(top, 1), off(bot, 1), off(r, 1), 1);
    tri(off(top, -1), off(bot, -1), off(l, -1), 1);
    tri(off(top, -1), off(r, -1), off(bot, -1), 1);
  }

  const height = new Float32Array(pos.length / 3);
  for (let i = 0; i < height.length; i++) height[i] = pos[i * 3 + 1];

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  geometry.setAttribute('aHeight', new BufferAttribute(height, 1));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new Sphere(new Vector3(0, 2, 0), 4);
  return geometry;
}

/**
 * One pointed-arch window, hinge (bottom edge) along local X at y = 0, rising
 * up local Y. Its `uv` is its own XY in metres, which the glass shader uses.
 */
export function createPanelGeometry() {
  const S = SHRINE;
  const w = S.panelW * 0.5;
  const h = S.panelH;
  const spring = h * 0.62; // where the arch springs from
  const shape = new Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, spring);
  // A pointed (lancet) arch: two arcs meeting at the apex.
  shape.quadraticCurveTo(w, spring + (h - spring) * 0.7, 0, h);
  shape.quadraticCurveTo(-w, spring + (h - spring) * 0.7, -w, spring);
  shape.lineTo(-w, 0);
  const geometry = new ShapeGeometry(shape, 16);
  geometry.boundingSphere = HUGE;
  return geometry;
}

/**
 * A grid: `position.x` 0..1 over `cols`, `position.y` `y0..y1` over `rows`,
 * `position.z` an instance index 0..count-1.
 */
export function createReliquaryGrid(cols, rows, y0 = 0, y1 = 1, count = 1) {
  const cx = cols + 1;
  const cy = rows + 1;
  const per = cx * cy;
  const positions = new Float32Array(per * count * 3);
  const indices = new Uint16Array(cols * rows * 6 * count);
  let p = 0;
  let k = 0;
  for (let n = 0; n < count; n++) {
    for (let j = 0; j < cy; j++) {
      const y = y0 + (y1 - y0) * (j / rows);
      for (let i = 0; i < cx; i++) {
        positions[p++] = i / cols;
        positions[p++] = y;
        positions[p++] = n;
      }
    }
    const base = n * per;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * cx + i;
        const b = a + 1;
        const c = a + cx;
        const d = c + 1;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}

/** A unit sphere (positions are their own normals), placed by the shader. */
export function createRelicSphere(ws = 28, hs = 18) {
  const cols = ws + 1;
  const rows = hs + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(ws * hs * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const th = (j / hs) * Math.PI;
    for (let i = 0; i < cols; i++) {
      const ph = (i / ws) * Math.PI * 2;
      positions[p++] = -Math.cos(ph) * Math.sin(th);
      positions[p++] = Math.cos(th);
      positions[p++] = Math.sin(ph) * Math.sin(th);
    }
  }
  let k = 0;
  for (let j = 0; j < hs; j++) {
    for (let i = 0; i < ws; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}

/** A unit quad, ±1 in XY. */
export function createReliquaryQuad() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}
