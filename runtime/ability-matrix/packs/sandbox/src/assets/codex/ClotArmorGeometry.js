import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Clot Armor — the armour plate.
 *
 * One lame of a carapace: a thick, curved shield that tapers to an arched
 * tip, built in a unit box (width 1 across X, height 1 up Y, the outer face
 * looking down +Z) so the instance matrix can scale it to metres.
 *
 *   - the **outer face** is bent back across its width (`curve`) so the plate
 *     is convex like a pauldron, and bellies out along its height (`bulge`);
 *   - the **inner face** is the outer face pushed in by `thickness`, thinner
 *     towards the tip so the plate reads as a blade-edged scale;
 *   - a **rim** stitches the two round the whole outline, its own vertices so
 *     the edge stays a hard, catchable highlight.
 *
 * `aPlate` per vertex: `x` = across (−1..1), `y` = up (0..1), `z` = which
 * surface (0 outer, 1 inner, 0.5 rim). The shader draws its lames and cracks
 * off it, so the pattern rides the plate however it is scaled or bent.
 *
 * @param {number} curve      how far the edges curl back (unit widths)
 * @param {number} bulge      outward belly along the height (unit widths)
 * @param {number} taper      0 = straight sides, 1 = closes to a point
 * @param {number} thickness  outer → inner, in unit widths
 */
export function createClotPlateGeometry(curve = 0.35, bulge = 0.12, taper = 0.6, thickness = 0.1) {
  const NU = 14;
  const NV = 18;
  const positions = [];
  const normals = [];
  const plate = [];
  const indices = [];

  /** The outline's half-width at height v. */
  const half = (v) => 0.5 * (1 - taper * Math.pow(v, 1.6)) + 0.002;
  /** The outer face at (u, v). */
  const outer = (u, v, out) => {
    const x = u * half(v);
    // The tip arches: the middle of the top edge stands higher than its corners.
    const y = v * (1 - 0.16 * u * u * Math.pow(v, 6));
    const z = -curve * x * x * 4 * (0.6 + 0.4 * (1 - v)) + bulge * Math.sin(Math.PI * Math.min(1, v * 1.1));
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  };
  const thick = (v) => thickness * (1 - 0.65 * v);

  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const c = [0, 0, 0];

  /** Normal of the outer face by central differences. */
  const faceNormal = (u, v, out) => {
    const du = 0.01;
    const dv = 0.01;
    outer(Math.min(1, u + du), v, a);
    outer(Math.max(-1, u - du), v, b);
    const tx = a[0] - b[0];
    const ty = a[1] - b[1];
    const tz = a[2] - b[2];
    outer(u, Math.min(1, v + dv), a);
    outer(u, Math.max(0, v - dv), b);
    const sx = a[0] - b[0];
    const sy = a[1] - b[1];
    const sz = a[2] - b[2];
    // t × s points out of the outer face (+Z).
    let nx = ty * sz - tz * sy;
    let ny = tz * sx - tx * sz;
    let nz = tx * sy - ty * sx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    if (nz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    out[0] = nx;
    out[1] = ny;
    out[2] = nz;
    return out;
  };

  const n = [0, 0, 0];

  /* ---- the two faces ---- */
  for (let side = 0; side < 2; side++) {
    const base = positions.length / 3;
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      for (let i = 0; i <= NU; i++) {
        const u = (i / NU) * 2 - 1;
        outer(u, v, c);
        faceNormal(u, v, n);
        const t = side === 0 ? 0 : thick(v);
        positions.push(c[0] - n[0] * t, c[1] - n[1] * t, c[2] - n[2] * t);
        if (side === 0) normals.push(n[0], n[1], n[2]);
        else normals.push(-n[0], -n[1], -n[2]);
        plate.push(u, v, side);
      }
    }
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const p0 = base + j * (NU + 1) + i;
        const p1 = p0 + 1;
        const p2 = p0 + NU + 1;
        const p3 = p2 + 1;
        if (side === 0) indices.push(p0, p1, p2, p1, p3, p2);
        else indices.push(p0, p2, p1, p1, p2, p3);
      }
    }
  }

  /* ---- the rim: left side up, top across, right side down, bottom back ---- */
  const outline = [];
  for (let j = 0; j <= NV; j++) outline.push([-1, j / NV]);
  for (let i = 1; i <= NU; i++) outline.push([(i / NU) * 2 - 1, 1]);
  for (let j = NV - 1; j >= 0; j--) outline.push([1, j / NV]);
  for (let i = NU - 1; i >= 1; i--) outline.push([(i / NU) * 2 - 1, 0]);
  outline.push([-1, 0]);

  const rimBase = positions.length / 3;
  for (let k = 0; k < outline.length; k++) {
    const [u, v] = outline[k];
    outer(u, v, c);
    faceNormal(u, v, n);
    // The rim faces away from the plate's middle, in the face's own plane.
    let rx = u * 0.9;
    let ry = v > 0.999 ? 1 : v < 0.001 ? -1 : 0.15 * u * u;
    let rz = 0;
    const l = Math.hypot(rx, ry, rz) || 1;
    rx /= l;
    ry /= l;
    const t = thick(v);
    positions.push(c[0], c[1], c[2]);
    normals.push(rx, ry, rz);
    plate.push(u, v, 0.5);
    positions.push(c[0] - n[0] * t, c[1] - n[1] * t, c[2] - n[2] * t);
    normals.push(rx, ry, rz);
    plate.push(u, v, 0.5);
  }
  for (let k = 0; k < outline.length - 1; k++) {
    const o0 = rimBase + k * 2;
    const i0 = o0 + 1;
    const o1 = o0 + 2;
    const i1 = o0 + 3;
    indices.push(o0, i0, o1, o1, i0, i1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aPlate', new Float32BufferAttribute(plate, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A flat strip along +X (0..1) and across Z (−1..1), subdivided along its
 * length so a vertex shader can lay it down the cast line. Used by the
 * rivulet.
 */
export function createClotStripGeometry(segments = 96, across = 4) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    for (let j = 0; j <= across; j++) {
      const t = j / across;
      positions.push(s, 0, t * 2 - 1);
      uvs.push(s, t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j;
      const b = a + across + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
