import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';

/**
 * Temporal Mortgage — procedural geometry. A mainspring and the iron that
 * winds it, built the way a spring-maker would.
 *
 *  - **the mainspring** — a flat steel band standing on edge, coiled as an
 *    Archimedean spiral. It is a closed box ribbon (inner face, outer face,
 *    top edge, bottom edge, two end caps) whose vertices are rewritten on the
 *    CPU every frame by `writeSpring` from five numbers — inner radius, outer
 *    radius, total turn, start angle, height — so the same buffer is a tight
 *    4½-turn coil in the hand and a 1½-turn lash across the whole circle.
 *    Normals come from the spiral's own analytic frame, so the lit steel and
 *    its shadow stay correct while it uncoils. The outer end curls back into
 *    a hook.
 *  - **the arbor** — a turned post (lathe profile): flange, shaft, collar,
 *    a square boss for the key.
 *  - **the ratchet** — a saw-toothed wheel (one steep flank, one ramp)
 *    extruded with a bevel and pierced with four windows.
 *  - **the pawl** — a hooked lever that drops into the ratchet's teeth.
 *  - **the winding key** — a butterfly bow on a stem, pierced, extruded.
 *  - **the smear** — an open cylinder used as a carrier for the speed-smear
 *    shader (it is only ever a shape the shader paints on).
 *
 * Built once per pool member, disposed with it; `writeSpring` allocates
 * nothing.
 */

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------------- */
/* The mainspring                                                          */
/* ---------------------------------------------------------------------- */

/** Segments along the band. 360 keeps a 4½-turn coil smooth. */
export const SPRING_SEGMENTS = 360;
/** Four long strips (inner, outer, top, bottom) + two caps. */
const STRIP_VERTS = (SPRING_SEGMENTS + 1) * 2;
const SPRING_VERTS = STRIP_VERTS * 4 + 8;

// Centre-line scratch, shared by every spring (writes are synchronous).
const _cx = new Float32Array(SPRING_SEGMENTS + 1);
const _cz = new Float32Array(SPRING_SEGMENTS + 1);
const _nx = new Float32Array(SPRING_SEGMENTS + 1);
const _nz = new Float32Array(SPRING_SEGMENTS + 1);
const _h = new Float32Array(SPRING_SEGMENTS + 1);
const _b = new Float32Array(SPRING_SEGMENTS + 1);

/**
 * The band's buffers: positions and normals are written by `writeSpring`;
 * `uv` = (s along the band 0 → 1 at the outer end, v up the band 0 → 1).
 */
export function createSpringGeometry() {
  const g = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(SPRING_VERTS * 3), 3);
  const normal = new BufferAttribute(new Float32Array(SPRING_VERTS * 3), 3);
  position.setUsage(35048); // DynamicDrawUsage
  normal.setUsage(35048);
  const uv = new Float32Array(SPRING_VERTS * 2);
  const index = [];
  for (let f = 0; f < 4; f++) {
    const base = f * STRIP_VERTS;
    for (let i = 0; i <= SPRING_SEGMENTS; i++) {
      const s = i / SPRING_SEGMENTS;
      const k = (base + i * 2) * 2;
      // inner/outer: (bottom, top); top edge and bottom edge: v = 1 / 0
      uv[k] = s;
      uv[k + 1] = f === 3 ? 0 : f === 2 ? 1 : 0;
      uv[k + 2] = s;
      uv[k + 3] = f === 3 ? 0 : 1;
      if (i < SPRING_SEGMENTS) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  // Caps: 4 verts each (inner-bottom, inner-top, outer-top, outer-bottom).
  for (let c = 0; c < 2; c++) {
    const base = STRIP_VERTS * 4 + c * 4;
    for (let j = 0; j < 4; j++) {
      uv[(base + j) * 2] = c;
      uv[(base + j) * 2 + 1] = j === 1 || j === 2 ? 1 : 0;
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  g.setAttribute('position', position);
  g.setAttribute('normal', normal);
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/**
 * Rewrite the band in place (local space: floor at y = 0, arbor at origin,
 * angle θ maps to (cos θ, sin θ) on (x, z)).
 *
 * @param {BufferGeometry} g
 * @param {object} p { r0, rOut, phi, psi, height, thick, wave, wavePhase, hookCurl, hookShare, taper }
 *   r0/rOut: inner / outer radius (m); phi: total turn (rad); psi: angle of the
 *   inner end; height (m); thick (m); wave: height ripple (fraction);
 *   hookCurl (rad) and hookShare (fraction of the band) shape the outer hook;
 *   taper: how much lower the outer end stands than the inner (fraction);
 *   ribbon (m, optional): the band's own width — when set, the band's foot
 *   lifts off the floor to (top − ribbon), so the coil climbs as a conical
 *   helix toward the arbor (a visible pitch) and only the free outer end
 *   rests on the floor.
 */
export function writeSpring(g, p) {
  const S = SPRING_SEGMENTS;
  const span = p.rOut - p.r0;
  const hookStart = 1 - Math.max(0.001, p.hookShare);
  // 1 · centre line
  for (let i = 0; i <= S; i++) {
    const s = i / S;
    let theta = p.psi + p.phi * s;
    let r = p.r0 + span * s;
    if (s > hookStart) {
      // The hook: the end turns back inward, a short tight curl.
      const h = (s - hookStart) / (1 - hookStart);
      r -= h * h * p.hookCurl * 0.35 * Math.max(0.2, span * 0.25);
      theta += h * h * p.hookCurl * 0.25;
    }
    _cx[i] = Math.cos(theta) * r;
    _cz[i] = Math.sin(theta) * r;
    // Height ripples travel along the band; the inner coils stay quiet.
    // The band steps down toward its outer end (`taper`), so from a low camera
    // every inner coil shows above the one outside it and the spiral reads.
    _h[i] = p.height * (1 - (p.taper ?? 0) * s) * (1 + p.wave * s * Math.sin(s * 23 - p.wavePhase));
    _b[i] = p.ribbon > 0 ? Math.max(0, _h[i] - p.ribbon) : 0;
  }
  // 2 · in-plane normals from the centre line (outward = tangent turned −90°)
  for (let i = 0; i <= S; i++) {
    const a = Math.max(0, i - 1), b = Math.min(S, i + 1);
    const tx = _cx[b] - _cx[a], tz = _cz[b] - _cz[a];
    const l = Math.hypot(tx, tz) || 1;
    _nx[i] = tz / l;
    _nz[i] = -tx / l;
  }
  // 3 · strips
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal.array;
  const half = p.thick * 0.5;
  const put = (v, x, y, z, nx, ny, nz) => {
    const k = v * 3;
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
  };
  for (let i = 0; i <= S; i++) {
    const nx = _nx[i], nz = _nz[i];
    const ix = _cx[i] - nx * half, iz = _cz[i] - nz * half;
    const ox = _cx[i] + nx * half, oz = _cz[i] + nz * half;
    const top = _h[i];
    const foot = _b[i];
    // inner face (bottom, top)
    put(i * 2, ix, foot, iz, -nx, 0, -nz);
    put(i * 2 + 1, ix, top, iz, -nx, 0, -nz);
    // outer face
    let v = STRIP_VERTS + i * 2;
    put(v, ox, foot, oz, nx, 0, nz);
    put(v + 1, ox, top, oz, nx, 0, nz);
    // top edge (inner, outer)
    v = STRIP_VERTS * 2 + i * 2;
    put(v, ix, top, iz, 0, 1, 0);
    put(v + 1, ox, top, oz, 0, 1, 0);
    // bottom edge
    v = STRIP_VERTS * 3 + i * 2;
    put(v, ix, foot, iz, 0, -1, 0);
    put(v + 1, ox, foot, oz, 0, -1, 0);
  }
  // 4 · caps
  for (let c = 0; c < 2; c++) {
    const i = c ? S : 0;
    const j = c ? S - 1 : 1;
    let tx = _cx[i] - _cx[j], tz = _cz[i] - _cz[j];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const nx = _nx[i], nz = _nz[i];
    const base = STRIP_VERTS * 4 + c * 4;
    put(base, _cx[i] - nx * half, _b[i], _cz[i] - nz * half, tx, 0, tz);
    put(base + 1, _cx[i] - nx * half, _h[i], _cz[i] - nz * half, tx, 0, tz);
    put(base + 2, _cx[i] + nx * half, _h[i], _cz[i] + nz * half, tx, 0, tz);
    put(base + 3, _cx[i] + nx * half, _b[i], _cz[i] + nz * half, tx, 0, tz);
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  // Bounds are not recomputed per frame: the meshes are frustumCulled = false.
}

/* ---------------------------------------------------------------------- */
/* The arbor                                                               */
/* ---------------------------------------------------------------------- */

/** Turned arbor post, unit height, radius ~0.1 at the shaft. */
export function createArborGeometry() {
  const profile = [
    [0.0, 0.0], [0.24, 0.0], [0.25, 0.03], [0.2, 0.06], [0.12, 0.08], // flange
    [0.1, 0.1], [0.095, 0.6], [0.14, 0.64], [0.14, 0.7], [0.1, 0.72], // shaft + collar
    [0.085, 0.74], [0.085, 0.94], [0.11, 0.96], [0.08, 1.0], [0.0, 1.0], // boss
  ].map(([r, y]) => new Vector2(r, y));
  const g = new LatheGeometry(profile, 40);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The ratchet and the pawl                                                */
/* ---------------------------------------------------------------------- */

/** Saw-tooth ratchet wheel lying flat, unit radius, 0.12 thick. */
export function createRatchetGeometry(teeth = 24) {
  const n = Math.max(6, Math.min(64, Math.round(teeth)));
  const shape = new Shape();
  const root = 0.84;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const w = TAU / n;
    // Steep flank (radial) then a long ramp: the click only goes one way.
    const pts = [[a, root], [a, 1], [a + w * 0.92, root]];
    for (let k = 0; k < pts.length; k++) {
      const x = Math.cos(pts[k][0]) * pts[k][1], y = Math.sin(pts[k][0]) * pts[k][1];
      if (i === 0 && k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  // Four kidney windows and the arbor hole.
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * TAU + 0.18, a1 = a0 + TAU / 4 - 0.36;
    const hole = new Path();
    hole.absarc(0, 0, 0.66, a0, a1, false);
    hole.absarc(0, 0, 0.36, a1, a0, true);
    hole.closePath();
    shape.holes.push(hole);
  }
  const axle = new Path();
  axle.absarc(0, 0, 0.14, 0, TAU, true);
  shape.holes.push(axle);
  const g = new ExtrudeGeometry(shape, {
    depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 10,
  });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** The pawl: a hooked lever, pivot at the origin, nose at +x ≈ 1, lying flat. */
export function createPawlGeometry() {
  const s = new Shape();
  s.moveTo(-0.12, -0.1);
  s.quadraticCurveTo(-0.2, 0, -0.12, 0.1);
  s.lineTo(0.62, 0.13);
  s.quadraticCurveTo(0.92, 0.12, 1.0, -0.02); // the nose
  s.lineTo(0.86, -0.14); // the hook drops into a tooth
  s.lineTo(0.78, -0.04);
  s.quadraticCurveTo(0.5, -0.12, 0.2, -0.1);
  s.closePath();
  const pin = new Path();
  pin.absarc(0, 0, 0.05, 0, TAU, true);
  s.holes.push(pin);
  const g = new ExtrudeGeometry(s, {
    depth: 0.1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The winding key                                                         */
/* ---------------------------------------------------------------------- */

/** A butterfly key standing in XY: stem from y = 0 to 0.45, bow above it, unit tall. */
export function createKeyGeometry() {
  const s = new Shape();
  s.moveTo(-0.06, 0);
  s.lineTo(0.06, 0);
  s.lineTo(0.06, 0.42);
  // Right lobe
  s.bezierCurveTo(0.2, 0.36, 0.5, 0.42, 0.5, 0.68);
  s.bezierCurveTo(0.5, 0.95, 0.22, 1.0, 0.09, 0.82);
  s.lineTo(0.0, 0.9);
  // Left lobe (mirror)
  s.lineTo(-0.09, 0.82);
  s.bezierCurveTo(-0.22, 1.0, -0.5, 0.95, -0.5, 0.68);
  s.bezierCurveTo(-0.5, 0.42, -0.2, 0.36, -0.06, 0.42);
  s.closePath();
  for (const side of [-1, 1]) {
    const hole = new Path();
    hole.absellipse(side * 0.27, 0.68, 0.12, 0.15, 0, TAU, true, 0);
    s.holes.push(hole);
  }
  const g = new ExtrudeGeometry(s, {
    depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 14,
  });
  g.translate(0, 0, -0.04);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Carriers                                                                */
/* ---------------------------------------------------------------------- */

/** Open unit cylinder, y ∈ [0, 1] — the speed smear's canvas. */
export function createSmearGeometry() {
  const g = new CylinderGeometry(1, 1, 1, 128, 6, true);
  g.translate(0, 0.5, 0);
  return g;
}

/** Unit quad in XY (lie it flat with rotation.x = −π/2). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
