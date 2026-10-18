// Procedural humanoid: anatomically proportioned body (≈7.5 heads, shaped superellipse lofts,
// smooth-skinned at the joints) plus a garment/armour kit used by the 30 Oath outfits.
// Geometry is authored for a 1.8 m reference figure and uniformly scaled to the body height.
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { GeoBuilder, jointWeights, smooth, clamp, lerp, xf, mix, shade } from './geom.js';
import { HB, humanoidLayout } from './rig.js';

const PI = Math.PI;
const FRONT = PI / 2;

// ---------------- body profile tables (reference 1.8 m male) ----------------
// [y, rx, rzFront, rzBack, zCentre]
const TORSO_M = [
  [0.80, 0.075, 0.06, 0.06, 0.0], [0.86, 0.135, 0.085, 0.09, 0.0], [0.92, 0.163, 0.092, 0.112, 0.0], [1.0, 0.158, 0.088, 0.102, 0.0],
  [1.08, 0.142, 0.086, 0.086, 0.0], [1.17, 0.148, 0.094, 0.088, 0.0], [1.27, 0.166, 0.11, 0.094, 0.0], [1.36, 0.177, 0.112, 0.096, -0.004],
  [1.43, 0.184, 0.096, 0.092, -0.01], [1.475, 0.16, 0.075, 0.078, -0.012], [1.505, 0.085, 0.06, 0.062, -0.012], [1.53, 0.058, 0.052, 0.054, -0.01],
];
const TORSO_F = [
  [0.80, 0.08, 0.06, 0.065, 0.0], [0.86, 0.148, 0.085, 0.1, 0.0], [0.92, 0.172, 0.09, 0.118, 0.0], [1.0, 0.162, 0.085, 0.104, 0.0],
  [1.08, 0.126, 0.08, 0.08, 0.0], [1.17, 0.132, 0.086, 0.082, 0.0], [1.27, 0.15, 0.118, 0.086, 0.004], [1.34, 0.157, 0.122, 0.088, 0.0],
  [1.42, 0.166, 0.092, 0.086, -0.008], [1.47, 0.146, 0.07, 0.072, -0.012], [1.505, 0.078, 0.055, 0.058, -0.012], [1.53, 0.052, 0.048, 0.05, -0.01],
];
// arm: [t (0 shoulder .. 1 wrist), rSide, rFront]
const ARM = [[-0.07, 0.05, 0.056], [0.0, 0.058, 0.06], [0.12, 0.052, 0.056], [0.3, 0.045, 0.049], [0.47, 0.037, 0.039], [0.53, 0.037, 0.039],
  [0.64, 0.041, 0.043], [0.84, 0.031, 0.027], [1.0, 0.027, 0.021]];
// leg: [y, rSide, rFront, rBack]
const LEG = [[0.985, 0.088, 0.09, 0.1], [0.93, 0.09, 0.088, 0.1], [0.84, 0.084, 0.08, 0.086], [0.7, 0.07, 0.068, 0.07], [0.56, 0.054, 0.056, 0.054],
  [0.5, 0.05, 0.054, 0.05], [0.44, 0.052, 0.05, 0.06], [0.36, 0.054, 0.046, 0.066], [0.24, 0.042, 0.04, 0.046], [0.13, 0.034, 0.034, 0.036], [0.085, 0.035, 0.037, 0.038]];

const BUILDS = {
  lean: { g: 0.92, sw: 0.97, hw: 0.97, arm: 0.92, leg: 0.95, belly: 0 },
  athletic: { g: 1.0, sw: 1.04, hw: 1.0, arm: 1.08, leg: 1.04, belly: 0 },
  muscular: { g: 1.08, sw: 1.12, hw: 1.02, arm: 1.25, leg: 1.12, belly: 0 },
  heavy: { g: 1.22, sw: 1.1, hw: 1.12, arm: 1.2, leg: 1.18, belly: 0.05 },
  massive: { g: 1.36, sw: 1.28, hw: 1.15, arm: 1.45, leg: 1.3, belly: 0.03 },
  stocky: { g: 1.25, sw: 1.06, hw: 1.16, arm: 1.18, leg: 1.2, belly: 0.06 },
  round: { g: 1.38, sw: 1.06, hw: 1.24, arm: 1.25, leg: 1.25, belly: 0.09 },
  gaunt: { g: 0.86, sw: 0.95, hw: 0.92, arm: 0.86, leg: 0.88, belly: 0 },
};

function interp(table, v, col) {
  if (v <= table[0][0]) return table[0][col];
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i], b = table[i + 1];
    if (v <= b[0]) { const t = (v - a[0]) / (b[0] - a[0]); const k = t * t * (3 - 2 * t) * 0.5 + t * 0.5; return lerp(a[col], b[col], k); }
  }
  return table[table.length - 1][col];
}

// ---------------- weights ----------------
const blendW = (a, b, t) => { if (t <= 0) return a; if (t >= 1) return b; return [...a.map(([i, w]) => [i, w * (1 - t)]), ...b.map(([i, w]) => [i, w * t])]; };

export class Kit {
  constructor(body, detail = 1) {
    this.body = body;
    const B = BUILDS[body.build] ?? BUILDS.athletic;
    this.B = B;
    this.fem = body.sex === 'f';
    this.elder = body.age === 'elder';
    this.layout = humanoidLayout({ h: 1.8, sw: B.sw * (this.fem ? 0.9 : 1), hw: B.hw * (this.fem ? 1.08 : 1) });
    this.g = new GeoBuilder(detail);
    this.torsoT = this.fem ? TORSO_F : TORSO_M;
    const P = (n) => this.layout.at(n);
    this.P = P;
    this.uaR = P('upperarm.R'); this.faR = P('forearm.R'); this.hR = P('hand.R');
    this.thR = P('thigh.R'); this.snR = P('shin.R'); this.ftR = P('foot.R');
    this.skin = body.skin ?? '#b07a58';
  }

  // ---- profiles ----
  torsoRing(y, inflate = 0) {
    const B = this.B, t = this.torsoT;
    let rx = interp(t, y, 1), rzF = interp(t, y, 2), rzB = interp(t, y, 3);
    const cz = interp(t, y, 4);
    // build: girth on waist/belly, shoulders follow sw
    const chestK = smooth(1.2, 1.4, y);
    const g = lerp(B.g, (B.sw + B.g) / 2, chestK);
    rx *= g; rzF *= lerp(B.g, 1 + (B.g - 1) * 0.8, chestK); rzB *= lerp(B.g, 1 + (B.g - 1) * 0.6, chestK);
    if (B.belly) rzF += B.belly * Math.exp(-((y - 1.08) ** 2) / 0.008);
    if (y > 1.48) { rx = lerp(rx, interp(t, y, 1) * (1 + (B.g - 1) * 0.5), 0.6); }
    return { rx: rx + inflate, rz: rzF + inflate, rzB: rzB + inflate, cz };
  }
  torsoPoint(a, y, inflate = 0) {
    const r = this.torsoRing(y, inflate);
    const ca = Math.cos(a), sa = Math.sin(a);
    return [ca * r.rx, y, r.cz + sa * (sa >= 0 ? r.rz : r.rzB)];
  }
  armPoint(side, t) { // centre of the arm at parameter t
    const s = side, ua = this.uaR, fa = this.faR, h = this.hR;
    const te = 0.53;
    if (t <= te) { const k = t / te; return [s * lerp(ua[0], fa[0], k), lerp(ua[1], fa[1], k), lerp(ua[2], fa[2], k)]; }
    const k = (t - te) / (1 - te); return [s * lerp(fa[0], h[0], k), lerp(fa[1], h[1], k), lerp(fa[2], h[2], k)];
  }
  legRing(y, inflate = 0) {
    const k = this.B.leg * (this.fem ? 1.02 : 1);
    const thighK = smooth(0.5, 0.75, y) * (this.fem ? 1.06 : 1);
    const kk = lerp(k, k * (thighK || 1), smooth(0.5, 0.8, y));
    return { rx: interp(LEG, y, 1) * kk + inflate, rz: interp(LEG, y, 2) * kk + inflate, rzB: interp(LEG, y, 3) * kk + inflate };
  }
  legCentre(side, y) {
    const th = this.thR, sn = this.snR, ft = this.ftR;
    if (y >= sn[1]) { const k = (y - sn[1]) / (th[1] - sn[1]); return [side * lerp(sn[0], th[0], k), lerp(sn[2], th[2], k)]; }
    const k = (y - ft[1]) / (sn[1] - ft[1]); return [side * lerp(ft[0], sn[0], k), lerp(ft[2], sn[2], k)];
  }

  // ---- weights ----
  torsoW = (x, y) => {
    let w = jointWeights(y, [HB.hips, HB.spine, HB.spine1, HB.spine2, HB.neck, HB.head], [1.05, 1.19, 1.33, 1.51, 1.6], [0.05, 0.06, 0.06, 0.03, 0.03]);
    const sh = smooth(0.1, 0.19, Math.abs(x)) * smooth(1.34, 1.45, y) * 0.55;
    if (sh > 0) w = blendW(w, [[x < 0 ? HB.shL : HB.shR, 0.6], [x < 0 ? HB.uaL : HB.uaR, 0.4]], sh);
    // thighs pull the lower pelvis
    const th = smooth(0.92, 0.8, y) * smooth(0.02, 0.09, Math.abs(x)) * 0.7;
    if (th > 0) w = blendW(w, [[x < 0 ? HB.thL : HB.thR, 1]], th);
    return w;
  };
  armW(side) {
    const L = side < 0;
    const bones = L ? [HB.hL, HB.faL, HB.uaL, HB.shL] : [HB.hR, HB.faR, HB.uaR, HB.shR];
    return (x, y) => jointWeights(y, bones, [this.hR[1] + 0.005, this.faR[1], this.uaR[1] + 0.035], [0.015, 0.035, 0.035]);
  }
  legW(side) {
    const L = side < 0;
    const bones = L ? [HB.ftL, HB.snL, HB.thL, HB.hips] : [HB.ftR, HB.snR, HB.thR, HB.hips];
    return (x, y) => jointWeights(y, bones, [0.095, this.snR[1], 0.955], [0.02, 0.05, 0.035]);
  }
  footW(side) {
    const L = side < 0;
    return (x, y, z) => jointWeights(z, [L ? HB.ftL : HB.ftR, L ? HB.toL : HB.toR], [0.11], [0.03]);
  }
  rigid(b) { return b; }
  headW = (x, y) => jointWeights(y, [HB.neck, HB.head], [1.585], [0.02]);
  /** robe/skirt: hips → thighs (by side) → shins near the hem */
  skirtW(opts = {}) {
    const follow = opts.follow ?? 0.8;
    return (x, y, z) => {
      const base = y > 1.0 ? this.torsoW(x, y) : [[HB.hips, 1]];
      const li = clamp((0.95 - y) / 0.42) * follow;
      if (li <= 0) return base;
      const sL = clamp(0.5 - x / 0.22), sR = 1 - sL;
      let legs = [[HB.thL, sL], [HB.thR, sR]];
      const shin = clamp((0.45 - y) / 0.3) * 0.35 * (opts.shin ?? 1);
      if (shin > 0) legs = [[HB.thL, sL * (1 - shin)], [HB.thR, sR * (1 - shin)], [HB.snL, sL * shin], [HB.snR, sR * shin]];
      let w = blendW(base, legs, li);
      if (opts.cape && z < -0.03) w = blendW(w, this.capeW(x, y), clamp(-z / 0.12) * opts.cape);
      return w;
    };
  }
  capeW = (x, y) => jointWeights(y, [HB.cape3, HB.cape2, HB.cape1, HB.spine2], [0.62, 1.02, 1.38], [0.14, 0.14, 0.05]);

  // ---------------- body ----------------
  /**
   * Base anatomy, split into coloured regions. regions: {torso:{chan,color}, ...}.
   * Garments are mostly expressed as region colour + inflated layers so silhouettes stay anatomical.
   */
  bodyBase(o = {}) {
    const g = this.g, skin = this.skin;
    const torso = o.torso ?? { chan: 'skin', color: skin };
    // torso: split at y cuts (e.g. bare midriff); default single region
    const cuts = o.torsoCuts ?? [[0.8, 1.535, torso]];
    for (const [y0, y1, reg] of cuts) this.torso(reg.chan, reg.color, y0, y1, reg.inflate ?? 0, { segs: 22, capStart: y0 <= 0.8, grime: reg.grime });
    // neck
    const nb = this.P('neck'), hd = this.P('head');
    g.loft(o.neck?.chan ?? 'skin', [
      { c: [0, 1.5, nb[2] - 0.004], rx: 0.058 * this.B.g ** 0.5, rz: 0.054, rzB: 0.056 },
      { c: [0, 1.56, nb[2] + 0.002], rx: 0.05 * this.B.g ** 0.4, rz: 0.05, rzB: 0.05 },
      { c: [0, 1.625, hd[2] + 0.0], rx: 0.05, rz: 0.048, rzB: 0.05 },
    ], this.headW, o.neck?.color ?? skin, { segs: 12 });
    this.head(o.head ?? {});
    for (const side of [-1, 1]) {
      const arm = o.arms ?? [[-0.08, 1.0, { chan: 'skin', color: skin }]];
      for (const [t0, t1, reg] of arm) this.arm(side, reg.chan, reg.color, t0, t1, reg.inflate ?? 0, { flare: reg.flare });
      this.hand(side, o.hands ?? { chan: 'skin', color: skin });
      const legs = o.legs ?? [[0.08, 0.99, { chan: 'cloth', color: '#333' }]];
      for (const [y0, y1, reg] of legs) this.leg(side, reg.chan, reg.color, y0, y1, reg.inflate ?? 0, { baggy: reg.baggy });
      this.foot(side, o.feet ?? { chan: 'leather', color: '#2a2420' });
    }
  }

  torso(chan, color, y0, y1, inflate = 0, opts = {}) {
    const n = Math.max(3, Math.round((y1 - y0) / 0.035));
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const y = lerp(y0, y1, i / n);
      const r = this.torsoRing(y, inflate + (opts.flare ? opts.flare(y) : 0));
      rings.push({ c: [0, y, r.cz], rx: r.rx, rz: r.rz, rzB: r.rzB, n: opts.n ?? 2.15 });
    }
    this.g.loft(chan, rings, opts.skin ?? this.torsoW, color, { segs: opts.segs ?? 20, arc: opts.arc, capStart: opts.capStart, capEnd: opts.capEnd, grime: opts.grime, ao: opts.ao });
  }

  arm(side, chan, color, t0, t1, inflate = 0, opts = {}) {
    const n = Math.max(2, Math.round((t1 - t0) / 0.07));
    const rings = [];
    const ka = this.B.arm * (this.fem ? 0.88 : 1);
    for (let i = 0; i <= n; i++) {
      const t = lerp(t0, t1, i / n);
      const c = this.armPoint(side, Math.max(0, t));
      if (t < 0) c[1] += -t * 0.25;
      const fl = opts.flare ? opts.flare(t) : 0;
      rings.push({ c, rx: interp(ARM, t, 1) * ka + inflate + fl, rz: interp(ARM, t, 2) * ka + inflate + fl, n: 2 });
    }
    this.g.loft(chan, rings, opts.skin ?? this.armW(side), color, { segs: opts.segs ?? 12, capEnd: opts.capEnd, grime: opts.grime });
  }

  leg(side, chan, color, y0, y1, inflate = 0, opts = {}) {
    const n = Math.max(2, Math.round((y1 - y0) / 0.06));
    const rings = [];
    for (let i = n; i >= 0; i--) {
      const y = lerp(y0, y1, i / n);
      const [cx, cz] = this.legCentre(side, Math.min(y, 0.93));
      const r = this.legRing(y, inflate);
      const bag = opts.baggy ? opts.baggy * Math.sin(clamp((y - 0.12) / 0.8) * PI) * (y > 0.45 ? 1.2 : 0.8) : 0;
      // inner-thigh: shift top rings outward slightly so legs do not intersect
      const outward = smooth(0.8, 0.98, y) * 0.012 * side;
      rings.push({ c: [cx + outward, y, cz], rx: r.rx + bag, rz: r.rz + bag, rzB: r.rzB + bag, n: 2 });
    }
    this.g.loft(chan, rings, opts.skin ?? this.legW(side), color, { segs: opts.segs ?? 14, grime: opts.grime });
  }

  hand(side, reg) {
    const g = this.g, h = this.hR, s = side;
    const b = side < 0 ? HB.hL : HB.hR;
    const k = this.B.arm ** 0.5 * (this.fem ? 0.9 : 1);
    const hx = s * h[0], hy = h[1], hz = h[2];
    g.box(reg.chan, [0.03 * k, 0.095 * k, 0.082 * k], xf([hx + s * 0.002, hy - 0.05 * k, hz + 0.004], [0, 0, s * 0.05]), b, reg.color, { round: 0.35 });
    g.box(reg.chan, [0.026 * k, 0.08 * k, 0.074 * k], xf([hx + s * 0.0, hy - 0.125 * k, hz + 0.012], [-0.25, 0, s * 0.06]), b, reg.color, { round: 0.4 });
    g.box(reg.chan, [0.02 * k, 0.055 * k, 0.022 * k], xf([hx - s * 0.008, hy - 0.06 * k, hz + 0.045 * k], [-0.35, 0, -s * 0.35]), b, reg.color, { round: 0.5 });
  }

  foot(side, reg, opts = {}) {
    const g = this.g, f = this.ftR, s = side;
    const fx = s * f[0];
    const w = 0.047 * (opts.bulk ?? 1) * (this.fem ? 0.92 : 1), hgt = 0.085 * (opts.bulk ?? 1);
    const rings = [];
    const prof = [[-0.075, 0.6, 0.55], [-0.06, 0.9, 0.95], [-0.02, 1, 1], [0.04, 1, 0.9], [0.1, 0.98, 0.6], [0.15, 0.85, 0.42], [0.185, 0.55, 0.3], [0.198, 0.2, 0.18]];
    for (const [z, kw, kh] of prof) rings.push({ c: [fx, hgt * kh * 0.5, f[2] + z], rx: w * kw, rz: hgt * kh * 0.5, n: 2.6 });
    g.loft(reg.chan, rings, this.footW(side), reg.color, { segs: 12, capStart: true, capEnd: true, ref: [0, 1, 0], vertical: false, grime: 0.1 });
    // sole
    g.box('leather', [w * 2.05, 0.022, 0.285], xf([fx, 0.011, f[2] + 0.06]), this.footW(side), shade(reg.color, 0.55), { round: 0.3 });
  }

  head(o = {}) {
    const g = this.g, hd = this.P('head');
    const hy = hd[1], hz = hd[2];
    const fem = this.fem;
    const k = fem ? 0.95 : 1;
    const jaw = fem ? 0.9 : 1;
    const rows = [
      [-0.032, 0.026 * jaw, 0.022, 0.02, 0.083], [-0.012, 0.05 * jaw, 0.04, 0.04, 0.062], [0.02, 0.066 * k, 0.062, 0.058, 0.04],
      [0.06, 0.073 * k, 0.08, 0.075, 0.025], [0.1, 0.077 * k, 0.088, 0.093, 0.014], [0.14, 0.077 * k, 0.084, 0.1, 0.004],
      [0.18, 0.066 * k, 0.068, 0.088, -0.004], [0.207, 0.046 * k, 0.046, 0.06, -0.01], [0.222, 0.016, 0.016, 0.02, -0.012],
    ];
    const skinC = o.color ?? this.skin;
    g.loft(o.chan ?? 'skin', rows.map(([y, rx, rzF, rzB, cz]) => ({ c: [0, hy + y, hz + cz], rx, rz: rzF, rzB, n: 2.1 })), HB.head, skinC,
      { segs: 18, capStart: true, capEnd: true, grime: 0.04 });
    if (o.bare === false) return;
    // face features
    const fz = hz + 0.025 + 0.088;
    g.box('skin', [0.022, 0.05, 0.03], xf([0, hy + 0.068, fz - 0.005], [0.25, 0, 0]), HB.head, skinC, { round: 0.5, taper: 0.6, grime: 0.03 });
    g.box('skin', [0.11 * k, 0.018, 0.022], xf([0, hy + 0.112, fz - 0.012], [0, 0, 0], [1, 1, 1]), HB.head, shade(skinC, 0.95), { round: 0.6, bend: 0.06 });
    for (const s of [-1, 1]) {
      g.blob('skin', [0.012, 0.026, 0.016], xf([s * 0.076 * k, hy + 0.075, hz - 0.005]), HB.head, shade(skinC, 0.92), { stacks: 5, segs: 8 });
      g.blob('hair', [0.011, 0.008, 0.006], xf([s * 0.031, hy + 0.094, fz - 0.016]), HB.head, '#1a1412', { stacks: 4, segs: 8, grime: 0 });
    }
    // lips / mouth shadow
    g.box('skin', [0.04 * jaw, 0.009, 0.012], xf([0, hy + 0.028, hz + 0.04 + 0.06]), HB.head, mix(skinC, '#6a3030', 0.35), { round: 0.6, grime: 0 });
  }

  hair(style, color) {
    if (!style || style === 'bald') return;
    const g = this.g, hd = this.P('head');
    const hy = hd[1], hz = hd[2];
    const k = this.fem ? 0.95 : 1;
    const capRows = (yLow, puff) => [
      [yLow, 0.08 * k + puff, 0.08 + puff, 0.1 + puff, -0.004],
      [0.14, 0.083 * k + puff, 0.091 + puff, 0.106 + puff, 0.004],
      [0.18, 0.073 * k + puff, 0.078 + puff, 0.095 + puff, -0.004],
      [0.21, 0.054 * k + puff, 0.055 + puff, 0.07 + puff, -0.01],
      [0.232, 0.022 + puff * 0.5, 0.02, 0.03, -0.012],
    ];
    const puff = style === 'buzz' ? 0.003 : style === 'messy' || style === 'locs' ? 0.016 : 0.009;
    // crown cap (full rings above the brow)
    g.loft('hair', capRows(0.135, puff).map(([y, rx, rzF, rzB, cz]) => ({ c: [0, hy + y, hz + cz], rx, rz: rzF, rzB, n: 2.1 })), HB.head, color, { segs: 16, capEnd: true, grime: 0.04 });
    // back + sides wrap down to the nape (leaves the face open)
    const low = style === 'bob' ? -0.01 : style === 'buzz' ? 0.07 : 0.04;
    const rows = [];
    for (let i = 0; i <= 4; i++) {
      const y = lerp(low, 0.15, i / 4);
      const flare = style === 'bob' ? (1 - i / 4) * 0.022 : 0;
      rows.push({ c: [0, hy + y, hz + lerp(-0.006, 0.0, i / 4)], rx: 0.08 * k + puff + flare, rz: 0.088 + puff, rzB: 0.103 + puff + flare, n: 2.1 });
    }
    const open = style === 'bob' ? 0.55 : 0.75;
    g.loft('hair', rows, this.headW, color, { segs: 14, arc: [FRONT + open, FRONT + 2 * PI - open], grime: 0.04 });
    const back = [0, hy + 0.17, hz - 0.095];
    if (style === 'bun' || style === 'topknot' || style === 'braids') {
      const p = style === 'topknot' ? [0, hy + 0.225, hz - 0.05] : [0, hy + 0.19, hz - 0.11];
      g.blob('hair', [0.042, 0.04, 0.04], xf(p), HB.head, color, { stacks: 7, segs: 12, grime: 0.15 });
      if (style === 'braids') for (let i = -2; i <= 2; i++) g.tube('hair', [[i * 0.03, hy + 0.2, hz - 0.03], [i * 0.035, hy + 0.17, hz - 0.1]], 0.008, HB.head, color, { segs: 5 });
    }
    if (style === 'ponytail' || style === 'topknot') {
      const top = style === 'topknot' ? [0, hy + 0.24, hz - 0.06] : back;
      const pts = [top, [0, top[1] - 0.04, top[2] - 0.05], [0, top[1] - 0.14, top[2] - 0.08], [0, top[1] - 0.28, top[2] - 0.07], [0, top[1] - 0.4, top[2] - 0.05]];
      g.tube('hair', pts, (t) => lerp(0.032, 0.01, t), (x, y) => jointWeights(y, [HB.spine2, HB.neck, HB.head], [1.45, 1.6], [0.06, 0.04]), color, { segs: 8, caps: true });
    }
    if (style === 'messy' || style === 'locs') {
      const n = style === 'locs' ? 14 : 9;
      for (let i = 0; i < n; i++) {
        const a = FRONT + PI * 0.35 + (i / (n - 1)) * PI * 1.3;
        const r = 0.095;
        const p0 = [Math.cos(a) * r * 0.85, hy + 0.17 + (i % 3) * 0.015, hz + Math.sin(a) * r];
        const len = style === 'locs' ? 0.12 + (i % 4) * 0.02 : 0.05;
        const p1 = [p0[0] * 1.25, p0[1] - len, p0[2] * 1.2];
        g.tube('hair', [p0, p1], (t) => lerp(style === 'locs' ? 0.011 : 0.016, 0.004, t), HB.head, color, { segs: 5 });
      }
    }
    if (style === 'swept') g.blob('hair', [0.05, 0.03, 0.05], xf([0, hy + 0.2, hz + 0.03]), HB.head, color, { stacks: 5, segs: 10 });
  }

  beard(color, len = 0.05) {
    const hd = this.P('head');
    this.g.loft('hair', [
      { c: [0, hd[1] + 0.04, hd[2] + 0.06], rx: 0.062, rz: 0.05, rzB: 0.02 },
      { c: [0, hd[1] - 0.0, hd[2] + 0.075], rx: 0.05, rz: 0.04, rzB: 0.02 },
      { c: [0, hd[1] - len, hd[2] + 0.07], rx: 0.02, rz: 0.015, rzB: 0.01 },
    ], HB.head, color, { segs: 10, arc: [FRONT - 1.4, FRONT + 1.4], capEnd: true });
  }

  // ---------------- garments ----------------
  /** Robe/coat skirt from yTop to yHem. opts: {flare, flareZ, arc, open (front gap rad), lining, follow, cape, inflate, n} */
  skirt(chan, color, yTop, yHem, opts = {}) {
    const n = Math.max(4, Math.round((yTop - yHem) / 0.07));
    const rings = [];
    const infl = opts.inflate ?? 0.02;
    for (let i = 0; i <= n; i++) {
      const y = lerp(yTop, yHem, i / n);
      const r = this.torsoRing(Math.max(y, 0.92), infl);
      const below = clamp((0.95 - y) / (0.95 - yHem));
      const legs = y < 0.95 ? clamp((0.95 - y) / 0.15) : 0;
      const fl = (opts.flare ?? 0.12) * Math.pow(below, opts.flarePow ?? 1.3);
      const minR = 0.19 * this.B.hw * (this.fem ? 1.05 : 1) * legs;
      const rx = Math.max(r.rx, minR + infl) + fl;
      const rz = Math.max(r.rz, 0.12 * legs + infl) + fl * (opts.flareZ ?? 0.8);
      const rzB = Math.max(r.rzB, 0.13 * legs + infl) + fl * (opts.flareZ ?? 0.8) * (opts.backK ?? 1);
      rings.push({ c: [0, y, r.cz], rx, rz, rzB, n: opts.n ?? 2.1 });
    }
    const open = opts.open ?? 0;
    const arc = opts.arc ?? (open ? [FRONT + open, FRONT + 2 * PI - open] : undefined);
    const skin = this.skirtW({ follow: opts.follow, cape: opts.cape, shin: opts.shin });
    this.g.loft(chan, rings, skin, color, { segs: opts.segs ?? 26, arc, grime: opts.grime, ao: (x, y) => 0.82 + 0.18 * smooth(yHem, yHem + 0.25, y) });
    if (opts.lining) {
      const inner = rings.map((r) => ({ ...r, rx: r.rx - 0.006, rz: r.rz - 0.006, rzB: r.rzB - 0.006 }));
      this.g.loft('cloth', inner, skin, opts.lining, { segs: opts.segs ?? 26, arc, grime: 0.04 });
    }
    return rings;
  }

  /** Front/back hanging panel (apron, tabard, loincloth) following the legs. */
  panel(chan, color, side, yTop, yHem, wTop, wHem, opts = {}) {
    const zs = side; // +1 front, -1 back
    const rows = [];
    const n = Math.max(3, Math.round((yTop - yHem) / 0.06));
    for (let i = 0; i <= n; i++) {
      const y = lerp(yTop, yHem, i / n);
      const r = this.torsoRing(Math.max(y, 0.95), 0);
      const zBase = zs > 0 ? r.cz + r.rz : r.cz - r.rzB;
      const legPush = y < 0.95 ? clamp((0.95 - y) / 0.2) * (zs > 0 ? 0.12 : 0.13) : 0;
      const z = zs > 0 ? Math.max(zBase, legPush) + (opts.off ?? 0.03) : Math.min(zBase, -legPush) - (opts.off ?? 0.03);
      rows.push({ y, z, w: lerp(wTop, wHem, i / n) });
    }
    const pos = [], idx = [], uv = [];
    const cols = 5, th = opts.thick ?? 0.012;
    for (let i = 0; i < rows.length; i++) for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) - 0.5;
      const { y, z, w } = rows[i];
      const bulge = (1 - (2 * u) ** 2) * 0.012 * zs;
      pos.push(u * w + (opts.x ?? 0), y, z + bulge); uv.push(u * w * 3, y * 3);
    }
    for (let i = 0; i < rows.length - 1; i++) for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (zs > 0) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
    }
    const skin = this.skirtW({ follow: opts.follow ?? 0.9, cape: zs < 0 ? opts.cape : 0 });
    // give thickness with a second sheet
    const base = pos.length / 3;
    for (let i = 0; i < base; i++) { pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2] - zs * th); uv.push(uv[i * 2], uv[i * 2 + 1]); }
    const m = idx.length; for (let i = 0; i < m; i += 3) idx.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
    this.g.push(chan, pos, idx, skin, color, { uv, grime: opts.grime ?? 0.1, ao: (x, y) => 0.85 + 0.15 * smooth(yHem, yHem + 0.2, y) });
    if (opts.trim) {
      const hem = rows[rows.length - 1];
      this.g.box(opts.trimChan ?? 'metal', [hem.w + 0.01, 0.018, 0.016], xf([opts.x ?? 0, hem.y + 0.01, hem.z]), skin, opts.trim, { round: 0.4 });
    }
  }

  /** Cape over the back (arc), from shoulder line to hem. opts: {width, asym (shift), arc, length} */
  cape(chan, color, yHem, opts = {}) {
    const rings = [];
    const n = Math.max(4, Math.round((1.5 - yHem) / 0.08));
    const wide = opts.width ?? 1;
    for (let i = 0; i <= n; i++) {
      const y = lerp(1.5, yHem, i / n);
      const r = this.torsoRing(Math.min(Math.max(y, 1.0), 1.45), 0.03);
      const below = clamp((1.45 - y) / (1.45 - yHem));
      const rx = (y > 1.42 ? r.rx * 1.05 + 0.04 * (1.5 - y) / 0.08 : r.rx + 0.05 + below * 0.1) * wide;
      rings.push({ c: [(opts.shift ?? 0) * below, y, r.cz - 0.01 - below * 0.06], rx, rz: r.rz + 0.02 + (y > 1.4 ? 0.02 : 0), rzB: r.rzB + 0.03 + below * 0.06, n: 2.2 });
    }
    const arc = opts.arc ?? [FRONT + 0.95, FRONT + 2 * PI - 0.95];
    this.g.loft(chan, rings, (x, y, z) => (y > 1.42 ? this.torsoW(x, y) : this.capeW(x, y)), color, { segs: opts.segs ?? 20, arc, grime: 0.12, ao: (x, y) => 0.8 + 0.2 * smooth(yHem, yHem + 0.3, y) });
    if (opts.lining) {
      const inner = rings.map((r) => ({ ...r, rx: r.rx - 0.008, rz: r.rz - 0.008, rzB: r.rzB - 0.008 }));
      this.g.loft('cloth', inner, (x, y) => (y > 1.42 ? this.torsoW(x, y) : this.capeW(x, y)), opts.lining, { segs: opts.segs ?? 20, arc });
    }
  }

  /** Shoulder mantle / capelet cone. */
  mantle(chan, color, yHem, opts = {}) {
    const rings = [];
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = lerp(1.54, yHem, t);
      const r = this.torsoRing(Math.min(y, 1.44), 0.02);
      const spread = Math.sin(clamp(t * 1.4) * PI / 2);
      const rx = lerp(0.075, (opts.width ?? 0.33) * this.B.sw, spread);
      rings.push({ c: [0, y, r.cz - 0.005], rx, rz: lerp(0.07, r.rz + (opts.depth ?? 0.08), spread), rzB: lerp(0.075, r.rzB + (opts.depth ?? 0.08), spread), n: opts.n ?? 2.3 });
    }
    const w = (x, y) => {
      const base = this.torsoW(x, Math.max(y, 1.36));
      const sideK = smooth(0.16, 0.3, Math.abs(x)) * 0.45;
      return sideK > 0 ? blendW(base, [[x < 0 ? HB.uaL : HB.uaR, 1]], sideK) : base;
    };
    this.g.loft(chan, rings, w, color, { segs: opts.segs ?? 24, arc: opts.arc, grime: 0.1 });
    if (opts.trim) this.g.loft(opts.trimChan ?? 'metal', [rings[n], { ...rings[n], c: [rings[n].c[0], rings[n].c[1] - 0.02, rings[n].c[2]], rx: rings[n].rx + 0.004, rz: rings[n].rz + 0.004, rzB: rings[n].rzB + 0.004 }], w, opts.trim, { segs: opts.segs ?? 24, arc: opts.arc });
  }

  /** Hood: up (around the head, open face) or down (bunched collar). */
  hood(chan, color, up = true, opts = {}) {
    const hd = this.P('head');
    const hy = hd[1], hz = hd[2];
    if (up) {
      const rows = [
        [-0.08, 0.13, 0.1, 0.12, -0.03], [-0.02, 0.105, 0.105, 0.12, -0.01], [0.05, 0.1, 0.112, 0.125, 0.0], [0.12, 0.1, 0.112, 0.13, -0.005],
        [0.19, 0.088, 0.095, 0.12, -0.015], [0.24, 0.06, 0.06, 0.09, -0.03], [0.27, 0.02, 0.02, 0.05, -0.04],
      ];
      const open = opts.open ?? 0.7;
      this.g.loft(chan, rows.map(([y, rx, rzF, rzB, cz]) => ({ c: [0, hy + y, hz + cz], rx, rz: rzF, rzB, n: 2.2 })),
        (x, y) => jointWeights(y, [HB.spine2, HB.neck, HB.head], [1.5, 1.6], [0.04, 0.03]), color,
        { segs: 18, arc: [FRONT + open, FRONT + 2 * PI - open], capEnd: false, grime: 0.12 });
    } else {
      // bunched hood resting on shoulders behind the neck
      this.g.loft(chan, [
        { c: [0, 1.46, -0.03], rx: 0.15, rz: 0.12, rzB: 0.15 },
        { c: [0, 1.53, -0.04], rx: 0.13, rz: 0.1, rzB: 0.15 },
        { c: [0, 1.6, -0.07], rx: 0.1, rz: 0.06, rzB: 0.12 },
      ], (x, y) => jointWeights(y, [HB.spine2, HB.neck], [1.52], [0.04]), color, { segs: 18, arc: [FRONT + 0.75, FRONT + 2 * PI - 0.75], grime: 0.12 });
    }
  }

  belt(y, color, opts = {}) {
    const r = this.torsoRing(y, opts.inflate ?? 0.012);
    const h = opts.h ?? 0.045;
    this.g.loft(opts.chan ?? 'leather', [
      { c: [0, y - h / 2, r.cz], rx: r.rx, rz: r.rz, rzB: r.rzB, n: 2.2 },
      { c: [0, y + h / 2, r.cz], rx: r.rx, rz: r.rz, rzB: r.rzB, n: 2.2 },
    ], (x, yy) => this.torsoW(x, Math.max(yy, 1.0)), color, { segs: 22, grime: 0.12 });
    if (opts.buckle) this.g.box('metal', [0.05, h * 1.2, 0.012], xf([0, y, r.cz + r.rz + 0.004]), HB.hips, opts.buckle, { round: 0.25 });
    if (opts.pouches) for (const [a, w] of opts.pouches) {
      const p = this.torsoPoint(a, y - 0.03, (opts.inflate ?? 0.012) + 0.022);
      this.g.box('leather', [w, 0.075, 0.04], xf(p, [0, -(a - FRONT), 0]), HB.hips, opts.pouchColor ?? shade(color, 1.1), { round: 0.3 });
    }
  }

  /** Strap across the torso surface between two (angle, y) points. */
  strap(color, a0, y0, a1, y1, opts = {}) {
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let a = lerp(a0, a1, t), y = lerp(y0, y1, t);
      if (opts.over) y += Math.sin(t * PI) * opts.over;
      pts.push(this.torsoPoint(a, Math.min(y, 1.47), (opts.inflate ?? 0.014)));
    }
    if (opts.overShoulder) {
      // lift points near the shoulder line onto the top of the shoulder
      for (const p of pts) if (p[1] > 1.43) p[1] += 0.035;
    }
    this.g.tube(opts.chan ?? 'leather', pts, opts.w ?? 0.012, (x, y) => this.torsoW(x, y), color, { segs: 4, flat: opts.flat ?? 0.35, n: 3, grime: 0.12 });
  }

  /** Curved armour plate on the torso surface at angle a (front = FRONT), y centre. */
  torsoPlate(chan, color, a, y, w, h, opts = {}) {
    const r = this.torsoRing(y, (opts.inflate ?? 0.02));
    const p = this.torsoPoint(a, y, (opts.inflate ?? 0.02));
    const yaw = -(a - FRONT);
    this.g.box(chan, [w, h, opts.thick ?? 0.018], xf(p, [opts.tilt ?? 0, yaw, opts.roll ?? 0]), opts.skin ?? ((x, yy) => this.torsoW(x, yy)), color,
      { round: opts.round ?? 0.2, bend: opts.bend ?? Math.max(0.08, (r.rx + r.rz) * 0.5), grime: opts.grime ?? 0.12, taper: opts.taper });
  }

  /** Pauldron over a shoulder. style: 'plate'|'shell'|'crescent'|'wing'|'block'|'layered' */
  pauldron(side, chan, color, style = 'plate', opts = {}) {
    const ua = this.uaR, s = side;
    const k = opts.scale ?? 1;
    const w = (x, y) => [[s < 0 ? HB.shL : HB.shR, 0.45], [s < 0 ? HB.uaL : HB.uaR, 0.55]];
    const base = [s * (ua[0] + 0.02), ua[1] + 0.035, ua[2]];
    const g = this.g;
    if (style === 'plate' || style === 'block') {
      const layers = opts.layers ?? (style === 'block' ? 1 : 3);
      for (let i = 0; i < layers; i++) {
        g.box(chan, [0.16 * k, 0.05 * k, 0.15 * k], xf([base[0] + s * (0.015 + i * 0.014) * k, base[1] - i * 0.042 * k, base[2]], [0, 0, s * (0.55 + i * 0.12)]), w,
          i === 0 ? color : shade(color, 0.92), { round: 0.25, bend: 0.12, grime: 0.15 });
      }
    } else if (style === 'shell' || style === 'layered') {
      for (let i = 0; i < 4; i++) {
        g.blob(chan, [0.085 * k * (1 - i * 0.12), 0.03 * k, 0.085 * k * (1 - i * 0.1)], xf([base[0] + s * (0.02 + i * 0.02) * k, base[1] + 0.01 - i * 0.035 * k, base[2]], [0, 0, s * (0.45 + i * 0.22)]), w,
          mix(color, '#ffffff', i * 0.05), { stacks: 5, segs: 12, e: 0.8, grime: 0.08 });
      }
    } else if (style === 'crescent') {
      // big upswept crescent blade (Observatory brawler)
      g.blob(chan, [0.12 * k, 0.07 * k, 0.12 * k], xf([base[0] + s * 0.03, base[1], base[2]], [0, 0, s * 0.4]), w, color, { stacks: 6, segs: 14, e: 0.8 });
      const pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; const a = lerp(-0.4, 1.9, t); pts.push([base[0] + s * (0.06 + Math.cos(a) * 0.17 * k), base[1] + 0.02 + Math.sin(a) * 0.2 * k, base[2] - 0.02]); }
      g.tube(chan, pts, (t) => 0.045 * k * Math.sin(Math.max(0.12, t) * PI) ** 0.7 + 0.004, w, color, { segs: 6, flat: 0.25, caps: true });
    } else if (style === 'wing') {
      // folded enamel wing points (Daybreak)
      g.box(chan, [0.13 * k, 0.04, 0.12], xf([base[0] + s * 0.03, base[1] + 0.01, base[2]], [0, 0, s * 0.35]), w, color, { round: 0.2, bend: 0.1 });
      g.box(chan, [0.16 * k, 0.025, 0.06], xf([base[0] + s * 0.1, base[1] + 0.07, base[2] - 0.01], [0, 0, -s * 0.55]), w, color, { round: 0.15, taper: 0.2 });
      if (opts.trim) g.box('metal', [0.135 * k, 0.012, 0.125], xf([base[0] + s * 0.03, base[1] - 0.012, base[2]], [0, 0, s * 0.35]), w, opts.trim, { round: 0.3, bend: 0.1 });
    }
  }

  /** Bracer / vambrace on the forearm. */
  bracer(side, chan, color, opts = {}) {
    const t0 = opts.t0 ?? 0.62, t1 = opts.t1 ?? 0.95;
    const extra = opts.bulk ?? 0.012;
    this.arm(side, chan, color, t0, t1, extra, { capEnd: false, grime: 0.14, flare: opts.flare, segs: opts.segs ?? (opts.boxy ? 6 : 12) });
    if (opts.block) {
      const c = this.armPoint(side, (t0 + t1) / 2);
      const b = side < 0 ? HB.faL : HB.faR;
      this.g.box(opts.blockChan ?? chan, opts.block, xf([c[0] + side * 0.03, c[1], c[2] + 0.005]), b, opts.blockColor ?? color, { round: 0.2, grime: 0.15 });
    }
  }

  boots(chan, color, top = 0.32, opts = {}) {
    for (const s of [-1, 1]) {
      this.leg(s, chan, color, 0.07, top, opts.bulk ?? 0.012, { segs: 14, grime: 0.15 });
      if (opts.cuff) this.leg(s, chan, opts.cuffColor ?? shade(color, 0.9), top - 0.035, top + 0.012, (opts.bulk ?? 0.012) + 0.012, { segs: 14 });
      this.foot(s, { chan, color }, { bulk: opts.footBulk ?? 1.08 });
      if (opts.plate) {
        const [cx, cz] = this.legCentre(s, 0.38);
        this.g.box(opts.plateChan ?? 'metal', [0.075, 0.2, 0.03], xf([cx, 0.36, cz + 0.06], [0.08, 0, 0]), s < 0 ? HB.snL : HB.snR, opts.plate, { round: 0.25, bend: 0.06 });
      }
    }
  }

  kneePads(chan, color) {
    for (const s of [-1, 1]) {
      const [cx, cz] = this.legCentre(s, 0.5);
      this.g.blob(chan, [0.05, 0.06, 0.03], xf([cx, 0.5, cz + 0.05]), s < 0 ? HB.snL : HB.snR, color, { stacks: 5, segs: 10, e: 0.7, n: 3 });
    }
  }

  /** Collar ring around the neck base (high collars, prong collars, pearl rings). */
  collar(chan, color, opts = {}) {
    const h = opts.h ?? 0.08, r = opts.r ?? 0.1;
    const open = opts.open ?? 0;
    const rows = [
      { c: [0, 1.49, -0.012], rx: r * 1.1, rz: r * 0.95, rzB: r * 1.05, n: 2.4 },
      { c: [0, 1.49 + h, -0.02 - (opts.back ?? 0)], rx: r * (opts.topK ?? 1.05), rz: r * (opts.topK ?? 1.05) * 0.95, rzB: r * (opts.topK ?? 1.05), n: 2.4 },
    ];
    this.g.loft(chan, rows, (x, y) => jointWeights(y, [HB.spine2, HB.neck], [1.53], [0.03]), color,
      { segs: 20, arc: open ? [FRONT + open, FRONT + 2 * PI - open] : undefined, grime: 0.1 });
  }

  /** Lower-face mask / respirator / visor helpers. */
  faceMask(chan, color, kind = 'wrap') {
    const hd = this.P('head');
    const hy = hd[1], hz = hd[2];
    const g = this.g;
    if (kind === 'wrap') {
      g.loft(chan, [
        { c: [0, hy - 0.04, hz + 0.03], rx: 0.064, rz: 0.075, rzB: 0.07 },
        { c: [0, hy + 0.04, hz + 0.03], rx: 0.079, rz: 0.098, rzB: 0.085 },
        { c: [0, hy + 0.082, hz + 0.022], rx: 0.081, rz: 0.1, rzB: 0.095 },
      ], HB.head, color, { segs: 16, grime: 0.1 });
    } else if (kind === 'grille') {
      g.box(chan, [0.1, 0.07, 0.05], xf([0, hy + 0.035, hz + 0.1], [0.1, 0, 0]), HB.head, color, { round: 0.3, bend: 0.05 });
      for (let i = -2; i <= 2; i++) g.box('metal', [0.006, 0.05, 0.01], xf([i * 0.016, hy + 0.035, hz + 0.128]), HB.head, shade(color, 0.6), { round: 0.4 });
    } else if (kind === 'respirator') {
      g.box(chan, [0.09, 0.075, 0.06], xf([0, hy + 0.035, hz + 0.1], [0.15, 0, 0]), HB.head, color, { round: 0.35, bend: 0.05 });
      for (const s of [-1, 1]) g.lathe('metal', [[0.026, 0], [0.028, 0.012], [0.02, 0.035], [0.0, 0.037]], xf([s * 0.05, hy + 0.025, hz + 0.115], [PI / 2, s * 0.6, 0]), HB.head, '#7a6a40', { segs: 12, capStart: true });
    }
  }

  visor(chan, color, opts = {}) {
    const hd = this.P('head');
    this.g.loft(chan, [
      { c: [0, hd[1] + 0.08, hd[2] + 0.02], rx: 0.084, rz: 0.098, rzB: 0.098 },
      { c: [0, hd[1] + 0.12, hd[2] + 0.018], rx: 0.085, rz: 0.098, rzB: 0.1 },
    ], HB.head, color, { segs: 16, arc: opts.full ? undefined : [FRONT - 1.9, FRONT + 1.9], grime: 0.05 });
  }

  /** Full head shell (helmet/hood-mask): lathe around the head with optional slit. */
  helmet(chan, color, kind = 'dome', opts = {}) {
    const hd = this.P('head');
    const hy = hd[1], hz = hd[2];
    const g = this.g;
    const prof = kind === 'dome'
      ? [[0.0, -0.05], [0.085, -0.045], [0.1, 0.0], [0.107, 0.08], [0.104, 0.15], [0.085, 0.21], [0.05, 0.245], [0.0, 0.257]]
      : [[0.0, -0.05], [0.07, -0.05], [0.088, 0.0], [0.092, 0.08], [0.09, 0.15], [0.074, 0.205], [0.045, 0.235], [0.0, 0.245]];
    const zk = opts.zk ?? 1.15;
    g.loft(chan, prof.map(([r, y]) => ({ c: [0, hy + y, hz + 0.012], rx: r, rz: r * zk, rzB: r * zk * 1.04, n: 2.1 })), HB.head, color,
      { segs: 20, capStart: true, capEnd: true, grime: opts.grime ?? 0.1 });
  }

  /** Add a rigid mesh shaped by fn(g, bone) — escape hatch for bespoke accessories. */
  custom(fn) { fn(this.g, this); }

  scaleTo(h) {
    const s = h / 1.8;
    if (Math.abs(s - 1) < 1e-4) return;
    for (const c of this.g.ch.values()) for (let i = 0; i < c.pos.length; i++) c.pos[i] *= s;
  }
}

export { FRONT, blendW };
export const M4 = Matrix;
