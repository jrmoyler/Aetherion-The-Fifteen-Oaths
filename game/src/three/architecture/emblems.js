// Pure Three.js migration of the canonical measured city kit.
// Oath emblems derived from FIFTEEN_OATH_ART_GUIDE.json `symbol_strategy`. Each emblem is a list of
// 2D primitives in unit space ([-1,1], +y up). They are converted to simple polygons, which
// feed (a) canvas drawing for banner textures, (b) flat brass/copper inlays in the plazas and
// (c) extruded glowing plaques on the waypoint shrines.
const D = Math.PI / 180;

export const EMBLEMS = {
  // An open square kiln mouth with three short top vents and one central ember lozenge.
  'oath-01': [
    { t: 'rect', cx: 0, cy: 0.5, w: 1.7, h: 0.32 },
    { t: 'rect', cx: -0.69, cy: -0.12, w: 0.32, h: 1.4 },
    { t: 'rect', cx: 0.69, cy: -0.12, w: 0.32, h: 1.4 },
    { t: 'rect', cx: -0.55, cy: -0.72, w: 0.6, h: 0.2 },
    { t: 'rect', cx: 0.55, cy: -0.72, w: 0.6, h: 0.2 },
    { t: 'rect', cx: -0.42, cy: 0.86, w: 0.16, h: 0.26 },
    { t: 'rect', cx: 0, cy: 0.88, w: 0.16, h: 0.3 },
    { t: 'rect', cx: 0.42, cy: 0.86, w: 0.16, h: 0.26 },
    { t: 'poly', pts: [[0, 0.28], [0.2, -0.08], [0, -0.44], [-0.2, -0.08]] },
  ],
  // A closed book inside a six-sided ice frame; a single vertical spine divides two page blocks.
  'oath-02': [
    { t: 'ring', cx: 0, cy: 0, rx: 0.95, ry: 0.95, w: 0.14, seg: 6, rot: 0 },
    { t: 'rect', cx: -0.27, cy: 0, w: 0.38, h: 0.82 },
    { t: 'rect', cx: 0.27, cy: 0, w: 0.38, h: 0.82 },
    { t: 'rect', cx: 0, cy: 0, w: 0.07, h: 1.02 },
  ],
  // A three-node branching fork with one deliberate open gap; solid nodes, narrow angular conductors.
  'oath-03': [
    { t: 'disc', cx: -0.62, cy: 0.58, r: 0.2 },
    { t: 'disc', cx: 0.62, cy: 0.58, r: 0.2 },
    { t: 'disc', cx: 0, cy: -0.68, r: 0.22 },
    { t: 'line', w: 0.11, pts: [[-0.62, 0.58], [-0.22, 0.12], [-0.05, 0.16], [0, -0.68]] },
    { t: 'line', w: 0.11, pts: [[0.62, 0.58], [0.3, 0.2], [0.12, 0.22]] },
  ],
  // One curling open crest over two offset horizontal water lines.
  'oath-04': [
    { t: 'arc', cx: 0.02, cy: 0.18, r: 0.6, w: 0.15, a0: -20 * D, a1: 205 * D },
    { t: 'arc', cx: -0.24, cy: 0.12, r: 0.3, w: 0.13, a0: 200 * D, a1: 375 * D },
    { t: 'line', w: 0.12, pts: [[-0.92, -0.58], [0.48, -0.58]] },
    { t: 'line', w: 0.12, pts: [[-0.48, -0.85], [0.92, -0.85]] },
  ],
  // Three stepped stone strata supporting one upright faceted crystal.
  'oath-05': [
    { t: 'rect', cx: 0, cy: -0.78, w: 1.85, h: 0.22 },
    { t: 'rect', cx: 0, cy: -0.5, w: 1.35, h: 0.2 },
    { t: 'rect', cx: 0, cy: -0.25, w: 0.9, h: 0.18 },
    { t: 'poly', pts: [[0, 0.98], [0.24, 0.66], [0.2, -0.06], [0, -0.16], [-0.2, -0.06], [-0.24, 0.66]] },
  ],
  // Two unequal reed pipes joined by a shallow U resonator, one outward sound arc on one side.
  'oath-06': [
    { t: 'rect', cx: -0.3, cy: 0.12, w: 0.22, h: 1.36 },
    { t: 'rect', cx: 0.12, cy: -0.1, w: 0.22, h: 0.92 },
    { t: 'arc', cx: -0.09, cy: -0.56, r: 0.21, w: 0.12, a0: 180 * D, a1: 360 * D },
    { t: 'arc', cx: 0.12, cy: 0.1, r: 0.55, w: 0.08, a0: -38 * D, a1: 38 * D },
    { t: 'arc', cx: 0.12, cy: 0.1, r: 0.8, w: 0.08, a0: -32 * D, a1: 32 * D },
  ],
  // A split seed with one branching shoot above and two short roots below.
  'oath-07': [
    { t: 'poly', pts: ellipseHalf(-0.05, -0.2, 0.34, 0.42, true) },
    { t: 'poly', pts: ellipseHalf(0.05, -0.2, 0.34, 0.42, false) },
    { t: 'line', w: 0.1, pts: [[0, 0.2], [0.02, 0.62], [-0.06, 0.92]] },
    { t: 'line', w: 0.09, pts: [[0.02, 0.48], [0.36, 0.78]] },
    { t: 'line', w: 0.09, pts: [[-0.12, -0.6], [-0.38, -0.92]] },
    { t: 'line', w: 0.09, pts: [[0.12, -0.6], [0.26, -0.88]] },
  ],
  // A sealed tapered vial with a diagonal stopper and one contained droplet.
  'oath-08': [
    { t: 'line', w: 0.11, closed: true, pts: [[-0.16, 0.5], [0.16, 0.5], [0.16, 0.3], [0.5, -0.78], [-0.5, -0.78], [-0.16, 0.3]] },
    { t: 'rect', cx: 0.02, cy: 0.7, w: 0.48, h: 0.18, rot: 18 * D },
    { t: 'poly', pts: dropShape(0, -0.42, 0.17, 0.42) },
  ],
  // A six-petal lotus surrounding a solid sunrise wedge above a short horizon.
  'oath-09': [
    ...[-72, -43, -14, 14, 43, 72].map((a) => ({ t: 'line', w: 0.065, closed: true, pts: petal(0, -0.36, a * D, 0.86, 0.24) })),
    { t: 'poly', pts: halfDisc(0, -0.26, 0.36) },
    { t: 'line', w: 0.08, pts: [[-0.82, -0.36], [0.82, -0.36]] },
  ],
  // An offset closed ellipse around a dense central square mass with one suspended counterweight.
  'oath-10': [
    { t: 'ring', cx: 0.1, cy: 0.08, rx: 0.9, ry: 0.5, w: 0.1, rot: -14 * D },
    { t: 'rect', cx: 0, cy: 0.04, w: 0.46, h: 0.46 },
    { t: 'line', w: 0.06, pts: [[0.42, -0.26], [0.56, -0.7]] },
    { t: 'disc', cx: 0.58, cy: -0.78, r: 0.13 },
  ],
  // A doorway outline interrupted at one upper corner, a displaced threshold bar, empty centre.
  'oath-11': [
    { t: 'line', w: 0.14, pts: [[-0.5, -0.74], [-0.5, 0.74], [0.18, 0.74]] },
    { t: 'line', w: 0.14, pts: [[0.5, 0.42], [0.5, -0.74]] },
    { t: 'rect', cx: 0.16, cy: -0.94, w: 0.95, h: 0.14 },
  ],
  // Two interlocked open oath loops holding one central drop-shaped seal.
  'oath-12': [
    { t: 'arc', cx: -0.3, cy: 0.12, r: 0.5, w: 0.12, a0: 35 * D, a1: 330 * D },
    { t: 'arc', cx: 0.3, cy: 0.12, r: 0.5, w: 0.12, a0: 215 * D, a1: 510 * D },
    { t: 'poly', pts: dropShape(0, -0.1, 0.17, 0.4) },
  ],
  // Three nested unequal folded triangles with one mirrored split plane.
  'oath-13': [
    { t: 'line', w: 0.09, closed: true, pts: [[-0.92, -0.74], [0.9, -0.74], [0.02, 0.92]] },
    { t: 'line', w: 0.08, closed: true, pts: [[-0.58, -0.52], [0.66, -0.52], [0.1, 0.46]] },
    { t: 'line', w: 0.07, closed: true, pts: [[-0.28, -0.32], [0.36, -0.32], [0.14, 0.12]] },
    { t: 'line', w: 0.045, pts: [[0, -0.95], [0, 0.98]] },
  ],
  // A partial escapement wheel with three unequal teeth and a long downward pendulum.
  'oath-14': [
    { t: 'arc', cx: 0, cy: 0.28, r: 0.52, w: 0.12, a0: -40 * D, a1: 228 * D },
    { t: 'poly', pts: tooth(0, 0.28, 0.52, 40 * D, 0.24, 0.16) },
    { t: 'poly', pts: tooth(0, 0.28, 0.52, 105 * D, 0.32, 0.18) },
    { t: 'poly', pts: tooth(0, 0.28, 0.52, 175 * D, 0.2, 0.14) },
    { t: 'disc', cx: 0, cy: 0.28, r: 0.11 },
    { t: 'line', w: 0.07, pts: [[0, 0.28], [0.04, -0.66]] },
    { t: 'disc', cx: 0.04, cy: -0.78, r: 0.16 },
  ],
  // A square actuator frame with opposed piston bars meeting a central hexagonal force plate.
  'oath-15': [
    { t: 'line', w: 0.13, closed: true, pts: [[-0.84, -0.84], [0.84, -0.84], [0.84, 0.84], [-0.84, 0.84]] },
    { t: 'rect', cx: -0.52, cy: 0, w: 0.5, h: 0.2 },
    { t: 'rect', cx: 0.52, cy: 0, w: 0.5, h: 0.2 },
    { t: 'rect', cx: -0.78, cy: 0, w: 0.12, h: 0.42 },
    { t: 'rect', cx: 0.78, cy: 0, w: 0.12, h: 0.42 },
    { t: 'disc', cx: 0, cy: 0, r: 0.32, seg: 6, rot: 30 * D },
  ],
};

function ellipseHalf(cx, cy, rx, ry, left) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + (i / 12) * Math.PI * (left ? 1 : -1); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return pts;
}
function dropShape(cx, cy, r, tip) {
  const pts = [[cx, cy + tip]];
  for (let i = 0; i <= 14; i++) { const a = (125 + (i / 14) * 290) * D; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
function petal(bx, by, ang, len, wid) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([Math.sin(t * Math.PI) * wid * 0.5, t * len]); }
  for (let i = 7; i >= 1; i--) { const t = i / 8; pts.push([-Math.sin(t * Math.PI) * wid * 0.5, t * len]); }
  const c = Math.cos(ang), s = Math.sin(ang);
  return pts.map(([x, y]) => [bx + x * c + y * s, by - x * s + y * c]);
}
function halfDisc(cx, cy, r) { const pts = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; }
function tooth(cx, cy, r, a, len, wid) {
  const c = Math.cos(a), s = Math.sin(a); const tx = -s, ty = c;
  const b = r - 0.02;
  return [[cx + c * b + tx * wid / 2, cy + s * b + ty * wid / 2], [cx + c * (b + len) + tx * wid * 0.15, cy + s * (b + len) + ty * wid * 0.15],
    [cx + c * (b + len * 0.8) - tx * wid * 0.35, cy + s * (b + len * 0.8) - ty * wid * 0.35], [cx + c * b - tx * wid / 2, cy + s * b - ty * wid / 2]];
}

/** Convert emblem primitives to simple polygons ([[x,y],...]). */
export function emblemPolys(oathId, detail = 1) {
  const prims = EMBLEMS[oathId] || [];
  const out = [];
  const segQuad = (a, b, w) => {
    const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; const nx = -dy / l * w / 2, ny = dx / l * w / 2;
    return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
  };
  const square = (p, w) => [[p[0] - w / 2, p[1] - w / 2], [p[0] + w / 2, p[1] - w / 2], [p[0] + w / 2, p[1] + w / 2], [p[0] - w / 2, p[1] + w / 2]];
  const octo = (p, w) => { const r = w / 2; const q = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; q.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]); } return q; };
  for (const p of prims) {
    if (p.t === 'poly') out.push(p.pts);
    else if (p.t === 'rect') {
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
      out.push([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => { const lx = x * p.w / 2, ly = y * p.h / 2; return [p.cx + lx * c - ly * s, p.cy + lx * s + ly * c]; }));
    } else if (p.t === 'disc') {
      const seg = p.seg || Math.round(20 * detail); const q = [];
      for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2 + (p.rot || 0); q.push([p.cx + Math.cos(a) * p.r, p.cy + Math.sin(a) * p.r]); }
      out.push(q);
    } else if (p.t === 'line') {
      const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
      for (let i = 0; i < pts.length - 1; i++) out.push(segQuad(pts[i], pts[i + 1], p.w));
      for (let i = p.closed ? 0 : 1; i < pts.length - 1; i++) out.push(octo(pts[i], p.w));
    } else if (p.t === 'arc' || p.t === 'ring') {
      const isRing = p.t === 'ring';
      const a0 = isRing ? 0 : p.a0, a1 = isRing ? Math.PI * 2 : p.a1;
      const rx = isRing ? p.rx : p.r, ry = isRing ? p.ry : p.r;
      const seg = p.seg || Math.max(6, Math.round(Math.abs(a1 - a0) / (Math.PI * 2) * 40 * detail));
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
      const P = (a, k) => { const x = Math.cos(a) * (rx + k), y = Math.sin(a) * (ry + k); return [p.cx + x * c - y * s, p.cy + x * s + y * c]; };
      for (let i = 0; i < seg; i++) {
        const t0 = a0 + (i / seg) * (a1 - a0), t1 = a0 + ((i + 1) / seg) * (a1 - a0);
        const off = isRing && p.seg ? Math.PI / 2 : 0;
        out.push([P(t0 + off, -p.w / 2), P(t1 + off, -p.w / 2), P(t1 + off, p.w / 2), P(t0 + off, p.w / 2)]);
      }
    }
  }
  return out;
}

/** Draw emblem onto a 2D canvas context centred at (cx,cy) with half-size `size`. */
export function drawEmblem(g, oathId, cx, cy, size, color) {
  g.save();
  g.fillStyle = color;
  for (const poly of emblemPolys(oathId, 2)) {
    g.beginPath();
    poly.forEach(([x, y], i) => { const px = cx + x * size, py = cy - y * size; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.closePath(); g.fill();
  }
  g.restore();
}
