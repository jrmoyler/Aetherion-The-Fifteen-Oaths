import { ExtrudeGeometry, OctahedronGeometry, Path, Shape } from 'three';

/**
 * Hoarfrost Mirror — procedural geometry.
 *
 * The mirror is a **gothic (two-centred) pointed arch**: a straight-sided
 * lower half and two circular arcs meeting at an apex. It is the one shape
 * the shader also knows analytically — `archParams` returns the same four
 * numbers (`halfW`, `shoulder`, `r`, `cx`) the pane material uses for its
 * signed distance to the rim, so the frost that creeps in from the frame and
 * the frame itself agree to the millimetre.
 *
 * Two extrusions, both built in metres and rebuilt only when a dimension
 * slider moves (see `HoarfrostMirrorAbility#_rebuild`):
 *
 *   - **the pane** — the inner arch, thin, centred on z = 0. Its front face
 *     (+Z) is what faces the caster.
 *   - **the frame** — the outer arch with the pane's arch as a hole, deeper
 *     than the pane and bevelled, so it reads as a crust of rime the glass is
 *     set in.
 *
 * The local origin is the middle of the arch's base: y = 0 is the floor line,
 * and the ability raises the whole rig out of the floor from below it.
 */

/**
 * The two-centred arch through (±halfW, shoulder) with its apex at (0, height).
 * Each side is an arc of radius `r` centred on the *opposite* side of the
 * axis, at (∓cx, shoulder) — that is what gives the point.
 *
 * @returns {{halfW:number, shoulder:number, height:number, r:number, cx:number, theta:number}}
 */
export function archParams(width, height, shoulderFrac) {
  const halfW = Math.max(0.05, width * 0.5);
  const h = Math.max(0.1, height);
  const shoulder = h * Math.min(0.9, Math.max(0.05, shoulderFrac));
  const a = Math.max(0.02, h - shoulder);
  // Radius of the circle through (halfW, shoulder) and (0, h) centred on y = shoulder.
  const r = (a * a + halfW * halfW) / (2 * halfW);
  // The right-hand arc is centred at x = halfW − r (left of the axis when r > halfW).
  const cx = halfW - r;
  // Angle on that circle where the arc meets the apex.
  const theta = Math.atan2(a, -cx);
  return { halfW, shoulder, height: h, r, cx, theta };
}

/** Trace the arch into a Shape or Path, starting bottom-left, counter-clockwise. */
function traceArch(target, p, y0 = 0) {
  target.moveTo(-p.halfW, y0);
  target.lineTo(p.halfW, y0);
  target.lineTo(p.halfW, y0 + p.shoulder);
  // Right arc: centre (cx, shoulder), from angle 0 up to theta (the apex).
  target.absarc(p.cx, y0 + p.shoulder, p.r, 0, p.theta, false);
  // Left arc: centre (−cx, shoulder), from the apex down to angle π.
  target.absarc(-p.cx, y0 + p.shoulder, p.r, Math.PI - p.theta, Math.PI, false);
  target.lineTo(-p.halfW, y0);
  return target;
}

/** Same outline traced the other way round — for use as a hole. */
function traceArchReversed(target, p, y0 = 0) {
  target.moveTo(-p.halfW, y0);
  target.lineTo(-p.halfW, y0 + p.shoulder);
  target.absarc(-p.cx, y0 + p.shoulder, p.r, Math.PI, Math.PI - p.theta, true);
  target.absarc(p.cx, y0 + p.shoulder, p.r, p.theta, 0, true);
  target.lineTo(p.halfW, y0);
  target.lineTo(-p.halfW, y0);
  return target;
}

/**
 * Inner (pane) arch for a mirror of `width × height` with a frame `frame`
 * metres wide. The pane sits on the frame's bottom rail.
 */
export function paneArchParams(width, height, shoulderFrac, frame) {
  const f = Math.max(0.01, frame);
  const p = archParams(Math.max(0.1, width - 2 * f), Math.max(0.2, height - 1.6 * f), shoulderFrac);
  p.y0 = f * 0.6;
  return p;
}

/**
 * @returns {{pane: ExtrudeGeometry, frame: ExtrudeGeometry, rim: Float32Array, rimCount: number}}
 *   `rim` holds `rimCount` samples of the outer outline, 4 floats each:
 *   x, y, outward normal x, outward normal y — where the hoarfrost bristles
 *   are rooted.
 */
export function createMirrorGeometry(width, height, shoulderFrac, frame, paneDepth, frameDepth, rimSamples = 64) {
  const outer = archParams(width, height, shoulderFrac);
  const inner = paneArchParams(width, height, shoulderFrac, frame);

  /* the pane */
  const paneShape = traceArch(new Shape(), inner, inner.y0);
  const pd = Math.max(0.01, paneDepth);
  const pane = new ExtrudeGeometry(paneShape, { depth: pd, bevelEnabled: false, curveSegments: 24 });
  pane.translate(0, 0, -pd * 0.5);
  pane.computeVertexNormals();

  /* the frame: outer arch with the pane's arch cut out */
  const frameShape = traceArch(new Shape(), outer, 0);
  frameShape.holes.push(traceArchReversed(new Path(), inner, inner.y0));
  const fd = Math.max(pd + 0.02, frameDepth);
  const bevel = Math.min(0.05, frame * 0.35);
  const frameGeo = new ExtrudeGeometry(frameShape, {
    depth: fd,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 24
  });
  frameGeo.translate(0, 0, -fd * 0.5);
  frameGeo.computeVertexNormals();

  /* bristle roots along the outer outline (not the floor rail) */
  const n = Math.max(4, rimSamples);
  const rim = new Float32Array(n * 4);
  const path = traceArch(new Shape(), outer, 0);
  // Only the two walls and the arch: from (halfW, 0) round to (−halfW, 0).
  const pts = path.getSpacedPoints(n * 3);
  let k = 0;
  const perimeterBottom = width; // the floor rail is skipped
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1]);
  let acc = 0;
  const step = (total - perimeterBottom) / n;
  let next = perimeterBottom + step * 0.5;
  for (let i = 1; i < pts.length && k < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = a.distanceTo(b);
    while (acc + seg >= next && k < n) {
      const t = (next - acc) / Math.max(1e-6, seg);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      // Outward normal of a counter-clockwise outline: (dy, −dx).
      let nx = b.y - a.y;
      let ny = -(b.x - a.x);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      rim[k * 4] = x;
      rim[k * 4 + 1] = y;
      rim[k * 4 + 2] = nx;
      rim[k * 4 + 3] = ny;
      k++;
      next += step;
    }
    acc += seg;
  }

  return { pane, frame: frameGeo, rim, rimCount: k };
}

/**
 * One hoarfrost bristle: a long, slightly flattened octahedral needle, unit
 * length along +Y from its root at the origin. Instanced round the frame.
 */
export function createBristleGeometry() {
  const g = new OctahedronGeometry(1, 0);
  g.scale(0.5, 0.5, 0.32);
  g.translate(0, 0.5, 0);
  // Drop the waist toward the root so the needle is a spike, not a diamond.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(y - 0.5) < 0.01) pos.setY(i, 0.16);
    else if (y < 0.01) pos.setY(i, -0.04);
  }
  g.computeVertexNormals();
  return g;
}
