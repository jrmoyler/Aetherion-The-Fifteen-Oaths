// Procedural humanoid animation: clip functions write Euler poses, a state machine
// cross-fades full-body states, an upper-body layer carries attacks/casts while the legs
// keep running, and locomotion phase advances with ground distance (stride matching).
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { HB } from './rig.js';

const PI = Math.PI, TAU = PI * 2;
const NB = 26;
const S = Math.sin, C = Math.cos;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (t) => t * t * (3 - 2 * t);
/** keyframes: flat [t0,v0,t1,v1,...], smoothstep between keys */
function kf(t, k) {
  if (t <= k[0]) return k[1];
  for (let i = 0; i < k.length - 2; i += 2) {
    if (t <= k[i + 2]) return k[i + 1] + (k[i + 3] - k[i + 1]) * sm((t - k[i]) / (k[i + 2] - k[i]));
  }
  return k[k.length - 1];
}

// upper-body mask (1 = carried by the action layer while moving)
const UPPER = new Float32Array(NB);
for (const b of [HB.spine1, HB.spine2, HB.neck, HB.head, HB.shL, HB.uaL, HB.faL, HB.hL, HB.shR, HB.uaR, HB.faR, HB.hR]) UPPER[b] = 1;
UPPER[HB.spine] = 0.5;

export class Pose {
  constructor(n = NB) { this.r = new Float32Array(n * 3); this.h = new Float32Array(3); }
  zero() { this.r.fill(0); this.h.fill(0); return this; }
  set(b, x, y, z) { const i = b * 3; this.r[i] = x; this.r[i + 1] = y; this.r[i + 2] = z; }
  add(b, x, y, z) { const i = b * 3; this.r[i] += x; this.r[i + 1] += y; this.r[i + 2] += z; }
}

// ---------------------------------------------------------------- clips
// All clips: (p: Pose, t: seconds into clip or loop, ph: locomotion phase 0..1, st: style, k: 0..1 normalised progress)

function basePosture(p, st, t) {
  // arms relaxed slightly away from the body, elbows soft
  p.add(HB.uaL, 0.04, 0, -0.09 - st.bulk * 0.12);
  p.add(HB.uaR, 0.04, 0, 0.09 + st.bulk * 0.12);
  p.add(HB.faL, -0.18, 0, 0);
  p.add(HB.faR, -0.18, 0, 0);
  if (st.elder) { p.add(HB.spine1, 0.12 * st.elder, 0, 0); p.add(HB.spine2, 0.14 * st.elder, 0, 0); p.add(HB.neck, -0.12 * st.elder, 0, 0); p.add(HB.head, -0.1 * st.elder, 0, 0); }
  gripPose(p, st, 1);
}

function gripPose(p, st, w) {
  switch (st.grip) {
    case 'blade': case 'flail': p.add(HB.uaR, -0.15 * w, 0, 0.05 * w); p.add(HB.faR, -0.55 * w, 0, 0); p.add(HB.hR, 0.1 * w, 0, 0); break;
    case 'staff': p.add(HB.uaR, -0.22 * w, 0, 0.1 * w); p.add(HB.faR, -0.7 * w, 0.1 * w, 0); p.add(HB.hR, 0.85 * w, 0, 0); break;
    case 'heavy': p.add(HB.uaR, -0.3 * w, 0, 0.05 * w); p.add(HB.faR, -0.9 * w, 0, 0); p.add(HB.uaL, -0.45 * w, 0, 0.25 * w); p.add(HB.faL, -1.1 * w, 0, 0); break;
    case 'cannon': p.add(HB.uaR, -0.25 * w, 0, 0.08 * w); p.add(HB.faR, -0.9 * w, 0, 0); p.add(HB.hR, -0.2 * w, 0, 0); break;
    case 'off': case 'bow': case 'shield': p.add(HB.uaL, -0.2 * w, 0, -0.08 * w); p.add(HB.faL, -0.9 * w, -0.3 * w, 0); break;
    default: break;
  }
}

const clips = {
  idle(p, t, ph, st) {
    const br = S(t * TAU / (st.elder ? 4.6 : 3.8));
    const sway = S(t * 0.55) * 0.6 + S(t * 0.23) * 0.4;
    basePosture(p, st, t);
    const ninja = st.stance === 'ninja';
    p.add(HB.spine1, 0.018 * br + (ninja ? 0.05 : 0), 0, 0);
    p.add(HB.spine2, 0.012 * br, 0, 0);
    p.add(HB.shL, 0, 0, -0.03 * br); p.add(HB.shR, 0, 0, 0.03 * br);
    p.add(HB.uaL, 0, 0, -0.02 * br); p.add(HB.uaR, 0, 0, 0.02 * br);
    p.add(HB.hips, 0, 0.04 * sway, 0.025 * sway);
    p.add(HB.spine, 0, -0.02 * sway, -0.02 * sway);
    p.add(HB.neck, 0, 0.12 * S(t * 0.31) * S(t * 0.13), 0);
    p.add(HB.head, 0.03 * S(t * 0.4), 0.06 * S(t * 0.21), 0);
    p.h[0] = 0.015 * sway; p.h[1] = 0.004 * br;
    const knee = ninja ? 0.16 : 0.05 + st.bulk * 0.05;
    for (const [th, sn, ft, side] of [[HB.thL, HB.snL, HB.ftL, -1], [HB.thR, HB.snR, HB.ftR, 1]]) {
      const shift = side * 0.03 * sway;
      p.add(th, -knee * 0.55 - shift, 0, side * (0.04 + st.bulk * 0.05));
      p.add(sn, knee + shift * 1.5, 0, 0);
      p.add(ft, -knee * 0.45, 0, -side * (0.04 + st.bulk * 0.05));
    }
    p.h[1] -= knee * 0.06;
    if (ninja) { p.add(HB.thR, 0.12, 0.1, 0); p.add(HB.thL, -0.08, -0.1, 0); p.add(HB.spine, 0, 0.12, 0); p.add(HB.neck, 0, -0.08, 0); }
  },

  walk(p, t, ph, st) {
    const a = ph * TAU;
    basePosture(p, st, t);
    const A = 0.42 - st.bulk * 0.06, K = 0.62;
    const cs = C(a);
    p.set(HB.thL, -A * cs - 0.05, 0, -0.03); p.set(HB.thR, A * cs - 0.05, 0, 0.03);
    const swingL = Math.max(0, S(a - PI)), swingR = Math.max(0, S(a));
    const loadL = Math.max(0, S(a * 2)) * (cs > 0 ? 0.12 : 0), loadR = Math.max(0, S(a * 2 - PI)) * (cs < 0 ? 0.12 : 0);
    p.set(HB.snL, K * swingL + 0.06 + loadL, 0, 0); p.set(HB.snR, K * swingR + 0.06 + loadR, 0, 0);
    p.set(HB.ftL, -(-A * cs) * 0.65 - swingL * 0.25 + Math.max(0, S(a - PI * 0.8)) * 0.15, 0, 0.03);
    p.set(HB.ftR, -(A * cs) * 0.65 - swingR * 0.25 + Math.max(0, S(a + PI * 0.2)) * 0.15, 0, -0.03);
    const arm = 0.32 * (st.grip === 'staff' ? 0.4 : 1);
    p.add(HB.uaL, arm * cs, 0, -0.03); p.add(HB.uaR, -arm * cs * (st.grip === 'blade' || st.grip === 'staff' ? 0.5 : 1), 0, 0.03);
    p.add(HB.faL, -0.12 - Math.max(0, -cs) * 0.25, 0, 0); p.add(HB.faR, -0.12 - Math.max(0, cs) * 0.25, 0, 0);
    p.add(HB.hips, 0.04, 0.09 * cs, 0.03 * S(a));
    p.add(HB.spine, 0.02, -0.05 * cs, -0.02 * S(a));
    p.add(HB.spine1, 0.02, -0.04 * cs, 0);
    p.add(HB.neck, 0, 0.02 * cs, 0);
    p.h[1] = -0.022 * C(a * 2) - 0.012;
    p.h[0] = 0.018 * S(a);
  },

  run(p, t, ph, st) {
    const a = ph * TAU;
    basePosture(p, st, t);
    const A = 0.78 - st.bulk * 0.1, K = 1.45;
    const cs = C(a);
    p.set(HB.thL, -A * cs - 0.32, 0, -0.02); p.set(HB.thR, A * cs - 0.32, 0, 0.02);
    const swingL = Math.max(0, S(a - PI * 0.85)), swingR = Math.max(0, S(a + PI * 0.15));
    p.set(HB.snL, 0.25 + K * swingL * swingL, 0, 0); p.set(HB.snR, 0.25 + K * swingR * swingR, 0, 0);
    p.set(HB.ftL, 0.25 * (1 - swingL) - 0.2 + Math.max(0, cs) * 0.25, 0, 0); p.set(HB.ftR, 0.25 * (1 - swingR) - 0.2 + Math.max(0, -cs) * 0.25, 0, 0);
    const heavy = st.grip === 'heavy' || st.grip === 'staff' ? 0.5 : 1;
    p.add(HB.uaL, 0.62 * cs * heavy, 0.1, -0.12); p.add(HB.uaR, -0.62 * cs * heavy, -0.1, 0.12);
    p.add(HB.faL, -1.2 * heavy - 0.15, 0, 0); p.add(HB.faR, -1.2 * heavy - 0.15, 0, 0);
    p.add(HB.hips, 0.14, 0.14 * cs, 0);
    p.add(HB.spine, 0.06, -0.08 * cs, 0);
    p.add(HB.spine1, 0.06, -0.08 * cs, 0);
    p.add(HB.neck, -0.12, 0.04 * cs, 0);
    p.h[1] = 0.045 * Math.abs(S(a)) - 0.05;
    p.h[2] = 0.02;
  },

  sprint(p, t, ph, st) {
    clips.run(p, t, ph, st);
    const a = ph * TAU, cs = C(a);
    p.add(HB.hips, 0.1, 0, 0); p.add(HB.spine1, 0.12, 0, 0); p.add(HB.neck, -0.2, 0, 0);
    p.add(HB.thL, -0.18 * cs - 0.1, 0, 0); p.add(HB.thR, 0.18 * cs - 0.1, 0, 0);
    if (st.stance === 'ninja' && st.grip !== 'heavy') {
      // low forward lean, arms trailing
      p.set(HB.uaL, 0.9, 0, -0.25); p.set(HB.uaR, 0.9, 0, 0.25); p.set(HB.faL, -0.3, 0, 0); p.set(HB.faR, -0.3, 0, 0);
      p.add(HB.spine2, 0.12, 0, 0);
    } else { p.add(HB.uaL, 0.15 * cs, 0, 0); p.add(HB.uaR, -0.15 * cs, 0, 0); }
    p.h[1] -= 0.03;
  },

  jump(p, t, ph, st) {
    basePosture(p, st, t);
    const k = clamp(t / 0.25);
    p.set(HB.thL, -0.9 * k, 0, -0.06); p.set(HB.snL, 1.3 * k, 0, 0); p.set(HB.ftL, 0.3 * k, 0, 0);
    p.set(HB.thR, -0.25 * k, 0, 0.06); p.set(HB.snR, 0.55 * k, 0, 0); p.set(HB.ftR, 0.4 * k, 0, 0);
    p.add(HB.uaL, -0.5 * k, 0, -0.35 * k); p.add(HB.uaR, -0.3 * k, 0, 0.35 * k);
    p.add(HB.faL, -0.6 * k, 0, 0); p.add(HB.faR, -0.6 * k, 0, 0);
    p.add(HB.spine1, 0.1 * k, 0, 0); p.add(HB.neck, -0.08 * k, 0, 0);
  },

  fall(p, t, ph, st) {
    basePosture(p, st, t);
    const f = S(t * 7) * 0.1;
    p.set(HB.thL, -0.45 + f, 0, -0.08); p.set(HB.snL, 0.7, 0, 0); p.set(HB.ftL, 0.25, 0, 0);
    p.set(HB.thR, -0.1 - f, 0, 0.08); p.set(HB.snR, 0.35, 0, 0); p.set(HB.ftR, 0.3, 0, 0);
    p.add(HB.uaL, -0.2, 0, -0.75 + f); p.add(HB.uaR, -0.2, 0, 0.75 - f);
    p.add(HB.faL, -0.4, 0, 0); p.add(HB.faR, -0.4, 0, 0);
    p.add(HB.spine1, -0.05, 0, 0);
  },

  land(p, t, ph, st, k) {
    clips.idle(p, t, ph, st);
    const d = S(clamp(k) * PI) * 0.9;
    p.add(HB.thL, -0.7 * d, 0, 0); p.add(HB.thR, -0.7 * d, 0, 0);
    p.add(HB.snL, 1.3 * d, 0, 0); p.add(HB.snR, 1.3 * d, 0, 0);
    p.add(HB.ftL, -0.6 * d, 0, 0); p.add(HB.ftR, -0.6 * d, 0, 0);
    p.add(HB.spine1, 0.25 * d, 0, 0);
    p.h[1] -= 0.18 * d;
  },

  dodge(p, t, ph, st, k) {
    // forward roll: tuck, rotate the pelvis a full turn, open out
    const tuck = kf(k, [0, 0, 0.15, 1, 0.8, 1, 1, 0]);
    const rot = kf(k, [0, 0, 0.12, 0.05, 0.85, 0.98, 1, 1]) * TAU;
    p.set(HB.hips, rot, 0, 0);
    p.set(HB.spine, 0.35 * tuck, 0, 0); p.set(HB.spine1, 0.4 * tuck, 0, 0); p.set(HB.spine2, 0.3 * tuck, 0, 0);
    p.set(HB.neck, 0.45 * tuck, 0, 0);
    p.set(HB.thL, -1.9 * tuck, 0, -0.1); p.set(HB.thR, -1.7 * tuck, 0, 0.1);
    p.set(HB.snL, 2.2 * tuck, 0, 0); p.set(HB.snR, 2.0 * tuck, 0, 0);
    p.set(HB.ftL, 0.3 * tuck, 0, 0); p.set(HB.ftR, 0.3 * tuck, 0, 0);
    p.set(HB.uaL, -1.1 * tuck, 0, -0.2); p.set(HB.uaR, -1.1 * tuck, 0, 0.2);
    p.set(HB.faL, -1.7 * tuck, 0, 0); p.set(HB.faR, -1.7 * tuck, 0, 0);
    gripPose(p, st, 1 - tuck);
    // pelvis path: drops to ~0.45 m while tucked
    p.h[1] = -0.52 * tuck;
    p.h[2] = 0.0;
  },

  swim(p, t, ph, st) {
    const a = t * 3.4;
    p.set(HB.hips, 1.25, 0, 0.06 * S(a));
    p.set(HB.spine1, -0.12, 0, 0); p.set(HB.neck, -0.55, 0, 0); p.set(HB.head, -0.45, 0, 0);
    const stroke = S(a), reach = C(a);
    p.set(HB.uaL, -2.1 - 0.9 * stroke, 0, -0.45 - 0.5 * Math.max(0, reach)); p.set(HB.uaR, -2.1 - 0.9 * stroke, 0, 0.45 + 0.5 * Math.max(0, reach));
    p.set(HB.faL, -0.5 - 0.6 * Math.max(0, -stroke), 0, 0); p.set(HB.faR, -0.5 - 0.6 * Math.max(0, -stroke), 0, 0);
    const kick = S(t * 9) * 0.35;
    p.set(HB.thL, kick, 0, -0.06); p.set(HB.thR, -kick, 0, 0.06);
    p.set(HB.snL, 0.3 + Math.max(0, -kick), 0, 0); p.set(HB.snR, 0.3 + Math.max(0, kick), 0, 0);
    p.set(HB.ftL, 0.8, 0, 0); p.set(HB.ftR, 0.8, 0, 0);
    p.h[1] = 0;
  },

  dead(p, t, ph, st, k) {
    // stagger → knees buckle → fall onto the back; holds the last pose
    const kk = clamp(t / 1.3);
    const stag = kf(kk, [0, 0, 0.2, 1, 0.5, 0.6, 1, 0]);
    const buckle = kf(kk, [0.15, 0, 0.5, 1, 0.8, 0.4, 1, 0.1]);
    const fall = kf(kk, [0.45, 0, 0.9, 1, 1, 1]);
    p.set(HB.spine1, -0.3 * stag + 0.2 * buckle, 0.15 * stag, 0);
    p.set(HB.neck, -0.25 * stag + 0.3 * buckle - 0.2 * fall, 0.4 * fall, 0);
    p.set(HB.hips, -1.5 * fall, 0.2 * fall, 0.05 * fall);
    p.set(HB.thL, -1.2 * buckle + 0.15 * fall, 0, -0.1 - 0.15 * fall); p.set(HB.thR, -1.0 * buckle - 0.3 * fall, 0, 0.12 + 0.1 * fall);
    p.set(HB.snL, 2.0 * buckle + 0.2 * fall, 0, 0); p.set(HB.snR, 1.7 * buckle + 0.9 * fall, 0, 0);
    p.set(HB.ftL, -0.4 * buckle + 0.4 * fall, 0, 0); p.set(HB.ftR, -0.3 * buckle + 0.5 * fall, 0, 0);
    p.set(HB.uaL, 0.3 * stag - 0.6 * fall, 0, -0.4 * stag - 0.9 * fall); p.set(HB.uaR, 0.3 * stag - 0.3 * fall, 0, 0.5 * stag + 1.1 * fall);
    p.set(HB.faL, -0.4 - 0.3 * fall, 0, 0); p.set(HB.faR, -0.3 - 0.6 * fall, 0, 0);
    p.h[1] = -0.55 * buckle * (1 - fall) - 0.84 * fall;
    p.h[2] = -0.25 * fall;
  },

  emote(p, t, ph, st, k) {
    clips.idle(p, t, ph, st);
    const b = kf(k, [0, 0, 0.3, 1, 0.7, 1, 1, 0]);
    p.add(HB.spine, 0.35 * b, 0, 0); p.add(HB.spine1, 0.3 * b, 0, 0); p.add(HB.neck, 0.3 * b, 0, 0);
    p.add(HB.uaR, -0.6 * b, 0, -0.3 * b); p.add(HB.faR, -1.3 * b, 0, 0);
    p.add(HB.uaL, 0.2 * b, 0, 0);
  },

  // ---- actions (upper-body layer) ----
  attack_1(p, t, ph, st, k) { // horizontal slash right → left
    const wind = kf(k, [0, 0, 0.28, 1, 0.45, 0, 1, 0]);
    const strike = kf(k, [0.25, 0, 0.45, 1, 0.7, 0.7, 1, 0]);
    p.set(HB.spine, 0.05, 0.25 * wind - 0.4 * strike, 0);
    p.set(HB.spine1, 0.08, 0.35 * wind - 0.55 * strike, 0);
    p.set(HB.spine2, 0.04, 0.15 * wind - 0.2 * strike, 0);
    p.set(HB.neck, 0, -0.25 * wind + 0.35 * strike, 0);
    p.set(HB.uaR, -0.5 * wind - 1.3 * strike, 0.6 * wind - 0.8 * strike, 1.2 * wind + 0.25 * strike);
    p.set(HB.faR, -1.4 * wind - 0.2 * strike, 0, 0);
    p.set(HB.hR, 0.3 * wind, 0, -0.3 * strike);
    p.set(HB.uaL, -0.4 * strike, 0, -0.35 - 0.3 * strike); p.set(HB.faL, -0.8, 0, 0);
    lunge(p, strike, 1);
  },
  attack_2(p, t, ph, st, k) { // backhand rising slash left → right
    const wind = kf(k, [0, 0, 0.25, 1, 0.42, 0, 1, 0]);
    const strike = kf(k, [0.22, 0, 0.42, 1, 0.7, 0.7, 1, 0]);
    p.set(HB.spine, 0.05, -0.3 * wind + 0.35 * strike, 0);
    p.set(HB.spine1, 0.06, -0.4 * wind + 0.5 * strike, 0);
    p.set(HB.neck, 0, 0.3 * wind - 0.35 * strike, 0);
    p.set(HB.uaR, -0.9 * wind - 1.6 * strike, -0.9 * wind + 0.5 * strike, -0.25 * wind + 0.9 * strike);
    p.set(HB.faR, -1.6 * wind - 0.15 * strike, 0, 0);
    p.set(HB.hR, -0.2 * wind, 0, 0.4 * strike);
    p.set(HB.uaL, 0.3 * strike, 0, -0.5); p.set(HB.faL, -0.6, 0, 0);
    lunge(p, strike, -1);
  },
  attack_3(p, t, ph, st, k) { // overhead slam
    const wind = kf(k, [0, 0, 0.32, 1, 0.48, 0, 1, 0]);
    const strike = kf(k, [0.3, 0, 0.5, 1, 0.75, 0.8, 1, 0]);
    p.set(HB.spine, -0.15 * wind + 0.3 * strike, 0, 0);
    p.set(HB.spine1, -0.2 * wind + 0.35 * strike, 0, 0);
    p.set(HB.neck, 0.1 * wind - 0.2 * strike, 0, 0);
    p.set(HB.uaR, -2.7 * wind - 1.1 * strike, 0, 0.25 * wind + 0.1 * strike);
    p.set(HB.faR, -0.7 * wind - 0.2 * strike, 0, 0);
    p.set(HB.uaL, -2.4 * wind - 0.9 * strike, 0, -0.25 * wind - 0.2 * strike);
    p.set(HB.faL, -0.9 * wind - 0.4 * strike, 0, 0);
    lunge(p, strike, 1);
    p.h[1] = -0.08 * strike;
  },
  cast_channel(p, t, ph, st) {
    const tr = S(t * 17) * 0.02 + S(t * 3.1) * 0.04;
    p.set(HB.spine1, -0.06, 0, 0); p.set(HB.spine2, -0.04, 0, 0); p.set(HB.neck, 0.05, 0, 0);
    p.set(HB.uaL, -1.15 + tr, 0.3, -0.25); p.set(HB.uaR, -1.15 - tr, -0.3, 0.25);
    p.set(HB.faL, -0.65, -0.3, 0); p.set(HB.faR, -0.65, 0.3, 0);
    p.set(HB.hL, -0.3, 0, -0.4); p.set(HB.hR, -0.3, 0, 0.4);
  },
  cast_release(p, t, ph, st, k) {
    const pull = kf(k, [0, 0, 0.3, 1, 0.45, 0, 1, 0]);
    const push = kf(k, [0.28, 0, 0.45, 1, 0.75, 0.6, 1, 0]);
    p.set(HB.spine, 0.0, 0.25 * pull - 0.15 * push, 0);
    p.set(HB.spine1, -0.12 * pull + 0.18 * push, 0.3 * pull - 0.2 * push, 0);
    p.set(HB.uaR, -0.5 * pull - 1.45 * push, 0.4 * pull, 0.6 * pull + 0.1 * push);
    p.set(HB.faR, -1.6 * pull - 0.05 * push, 0, 0);
    p.set(HB.hR, 0.2 * pull - 0.5 * push, 0, 0);
    p.set(HB.uaL, -0.9 * pull - 0.6 * push, -0.3 * pull, -0.35); p.set(HB.faL, -1.1 * pull - 0.5 * push, 0, 0);
    lunge(p, push * 0.6, 1);
  },
  cast_aoe(p, t, ph, st, k) {
    const up = kf(k, [0, 0, 0.35, 1, 0.5, 0.2, 1, 0]);
    const slam = kf(k, [0.38, 0, 0.52, 1, 0.8, 0.8, 1, 0]);
    p.set(HB.spine1, -0.25 * up + 0.35 * slam, 0, 0);
    p.set(HB.neck, -0.2 * up + 0.1 * slam, 0, 0);
    p.set(HB.uaL, -2.8 * up - 0.3 * slam, 0, -0.2 * up - 0.7 * slam); p.set(HB.uaR, -2.8 * up - 0.3 * slam, 0, 0.2 * up + 0.7 * slam);
    p.set(HB.faL, -0.3 * up - 0.2 * slam, 0, 0); p.set(HB.faR, -0.3 * up - 0.2 * slam, 0, 0);
    p.set(HB.thL, -0.6 * slam, 0, -0.1 * slam); p.set(HB.thR, -0.6 * slam, 0, 0.1 * slam);
    p.set(HB.snL, 1.1 * slam, 0, 0); p.set(HB.snR, 1.1 * slam, 0, 0);
    p.set(HB.ftL, -0.5 * slam, 0, 0); p.set(HB.ftR, -0.5 * slam, 0, 0);
    p.h[1] = -0.16 * slam + 0.03 * up;
  },
  interact(p, t, ph, st, k) {
    const r = kf(k, [0, 0, 0.35, 1, 0.7, 1, 1, 0]);
    p.set(HB.spine1, 0.15 * r, 0, 0);
    p.set(HB.uaR, -1.1 * r, 0, 0.15); p.set(HB.faR, -0.4 * r, 0, 0); p.set(HB.hR, -0.3 * r, 0, 0);
    p.set(HB.uaL, 0.05, 0, -0.12); p.set(HB.faL, -0.2, 0, 0);
  },
  hit(p, t, ph, st, k) { // additive flinch
    const h = kf(k, [0, 0, 0.18, 1, 1, 0]);
    p.set(HB.spine, -0.12 * h, 0.08 * h, 0); p.set(HB.spine1, -0.18 * h, 0.1 * h, 0);
    p.set(HB.neck, -0.25 * h, -0.1 * h, 0);
    p.set(HB.uaL, 0.1 * h, 0, -0.25 * h); p.set(HB.uaR, 0.1 * h, 0, 0.25 * h);
    p.set(HB.snL, 0.15 * h, 0, 0); p.set(HB.snR, 0.15 * h, 0, 0);
    p.h[2] = -0.05 * h;
  },
};

function lunge(p, s, side) {
  p.set(HB.thL, (side > 0 ? 0.25 : -0.45) * s, 0, -0.08 * s); p.set(HB.thR, (side > 0 ? -0.45 : 0.25) * s, 0, 0.08 * s);
  p.set(HB.snL, (side > 0 ? 0.25 : 0.6) * s, 0, 0); p.set(HB.snR, (side > 0 ? 0.6 : 0.25) * s, 0, 0);
  p.set(HB.ftL, (side > 0 ? -0.3 : -0.15) * s, 0, 0); p.set(HB.ftR, (side > 0 ? -0.15 : -0.3) * s, 0, 0);
  p.set(HB.hips, 0.08 * s, 0, 0);
  p.h[1] = -0.07 * s;
}

const ACTION_DUR = { attack_1: 0.55, attack_2: 0.55, attack_3: 0.7, cast_release: 0.6, cast_aoe: 0.9, interact: 0.9, hit: 0.35, land: 0.28, emote: 1.6, emote_bow: 1.6 };
const FULL_STATES = ['loco', 'jump', 'fall', 'dodge', 'swim', 'dead', 'emote', 'land'];

/**
 * Drives a humanoid rig. Inputs each frame: speed (m/s, ground), moveDir sign, state.
 * playAnim(name) for one-shots; setChannel(bool) for the casting loop.
 */
export class HumanoidAnimator {
  constructor(rig, style = {}) {
    this.rig = rig;
    this.nodes = rig.nodes;
    this.rest = rig.rest;
    this.s = rig.layout.s ?? 1;
    this.st = { stance: style.stance ?? 'ninja', elder: style.elder ?? 0, bulk: style.heavy ?? 0, grip: style.grip ?? null };
    this.speed = 0; this.runSpeed = style.runSpeed ?? 6; this.backwards = false;
    this.state = 'loco';
    this.w = Object.fromEntries(FULL_STATES.map((s) => [s, s === 'loco' ? 1 : 0]));
    this.stateT = 0; this.t = Math.random() * 10; this.phase = Math.random();
    this.poses = Object.fromEntries([...FULL_STATES, 'idle', 'walk', 'run', 'sprint', 'act', 'add', 'out'].map((n) => [n, new Pose()]));
    this.action = null; this.actionT = 0; this.actionW = 0; this.actionDur = 0.5;
    this.additive = null; this.addT = 0;
    this.channel = false; this.channelW = 0;
    this.cape = { a: 0, v: 0 };
    this.timeScale = 1;
    this.accum = 0; this.interval = 0; // LOD: seconds between evaluations
    this.yawVel = 0;
  }

  setState(s) { if (s !== this.state) { this.state = s; this.stateT = 0; } }

  /** one-shot or state request from gameplay strings */
  playAnim(name, o = {}) {
    if (name === 'cast_channel') { this.channel = o.loop !== false; return; }
    if (name === 'hit') { this.additive = 'hit'; this.addT = 0; return; }
    if (name === 'death' || name === 'dead') { this.setState('dead'); return; }
    if (name === 'dodge' || name === 'jump' || name === 'fall' || name === 'swim' || name === 'land') { this.setState(name === 'jump' ? 'jump' : name); return; }
    if (name === 'emote' || name === 'emote_bow') { this.setState('emote'); return; }
    if (name === 'idle' || name === 'walk' || name === 'run' || name === 'sprint') { this.setState('loco'); return; }
    if (clips[name]) {
      this.action = name; this.actionT = 0; this.actionDur = (ACTION_DUR[name] ?? 0.6) / (o.speed ?? 1);
      if (name.startsWith('cast_release') || name === 'cast_aoe') this.channel = false;
    }
  }

  update(dt) {
    this.accum += dt;
    if (this.accum < this.interval) return false;
    dt = this.accum; this.accum = 0;
    const st = this.st;
    this.t += dt;
    this.stateT += dt;
    // locomotion phase: advance with ground distance (stride matching)
    const sp = this.speed;
    const s = this.s;
    const stride = sp < 2.4 ? 1.45 * s : sp < this.runSpeed * 1.1 ? 2.5 * s : 3.2 * s; // metres per full cycle
    const strideSm = (this._stride = this._stride ? this._stride + (stride - this._stride) * Math.min(1, dt * 6) : stride);
    this.phase = (this.phase + (this.backwards ? -1 : 1) * (sp / strideSm) * dt + 1) % 1;

    // full-body state weights
    const rate = this.state === 'dodge' ? 14 : this.state === 'dead' ? 6 : 8;
    let total = 0;
    for (const k of FULL_STATES) {
      const target = k === this.state ? 1 : 0;
      this.w[k] += (target - this.w[k]) * Math.min(1, dt * rate);
      if (this.w[k] < 0.002) this.w[k] = 0;
      total += this.w[k];
    }
    const out = this.poses.out.zero();
    for (const k of FULL_STATES) {
      const w = this.w[k] / (total || 1);
      if (w <= 0) continue;
      const p = this.poses[k].zero();
      if (k === 'loco') this.evalLoco(p, dt);
      else {
        const dur = k === 'dodge' ? 0.55 : k === 'land' ? 0.28 : k === 'emote' ? 1.6 : 1;
        const kk = clamp(this.stateT / dur);
        const fn = clips[k === 'dead' ? 'dead' : k];
        fn(p, k === this.state ? this.stateT : 9, this.phase, st, k === this.state ? kk : 1);
        if (k === this.state && (k === 'land' || k === 'emote') && kk >= 1) this.setState('loco');
      }
      accumulate(out, p, w);
    }

    // action layer (attacks / casts) — upper body while moving, full body when still
    if (this.action) {
      this.actionT += dt;
      const k = this.actionT / this.actionDur;
      if (k >= 1) { this.action = null; } else {
        const a = this.poses.act.zero();
        clips[this.action](a, this.actionT, this.phase, st, k);
        const w = Math.min(1, k * 8, (1 - k) * 6);
        const full = this.state === 'loco' && sp < 0.6 ? 1 : 0;
        blendMasked(out, a, w, full);
      }
    }
    // channel loop
    this.channelW += ((this.channel && !this.action && this.state !== 'dead' ? 1 : 0) - this.channelW) * Math.min(1, dt * 8);
    if (this.channelW > 0.01) {
      const a = this.poses.act.zero();
      clips.cast_channel(a, this.t, this.phase, st, 0);
      blendMasked(out, a, this.channelW, 0);
    }
    // additive flinch
    if (this.additive) {
      this.addT += dt;
      const k = this.addT / 0.35;
      if (k >= 1) this.additive = null; else {
        const a = this.poses.add.zero();
        clips.hit(a, this.addT, this.phase, st, k);
        accumulate(out, a, 1);
      }
    }
    // cape / coat secondary motion (spring toward speed-driven lift)
    const lift = Math.min(1, sp / 9) * 0.9 + (this.state === 'fall' ? 0.5 : 0) + (this.state === 'jump' ? -0.2 : 0);
    const c = this.cape;
    c.v += ((lift - c.a) * 40 - c.v * 9) * dt; c.a += c.v * dt;
    const sway = S(this.t * 1.7) * 0.03 + S(this.t * 4.3) * 0.015 * (sp / 6);
    const lean = out.r[HB.spine * 3] + out.r[HB.spine1 * 3] + out.r[HB.spine2 * 3] + out.r[HB.hips * 3] * (this.state === 'dodge' ? 0 : 1);
    out.r[HB.cape1 * 3] = c.a * 0.45 + sway - lean * 0.6;
    out.r[HB.cape2 * 3] = c.a * 0.35 + sway * 0.6;
    out.r[HB.cape3 * 3] = c.a * 0.25 + sway * 0.4;
    out.r[HB.cape1 * 3 + 2] = S(this.t * 1.3) * 0.03;
    this.apply(out);
    return true;
  }

  evalLoco(p, dt) {
    const sp = this.speed, st = this.st, run = this.runSpeed;
    // weights across idle / walk / run / sprint
    let wi = 0, ww = 0, wr = 0, ws = 0;
    if (sp < 0.12) wi = 1;
    else if (sp < 1.5) { const k = (sp - 0.12) / 1.38; wi = 1 - k; ww = k; }
    else if (sp < 3.4) { const k = (sp - 1.5) / 1.9; ww = 1 - k; wr = k; }
    else if (sp < run * 1.12) wr = 1;
    else { const k = clamp((sp - run * 1.12) / (run * 0.3)); wr = 1 - k; ws = k; }
    const P = this.poses;
    if (wi > 0) { clips.idle(P.idle.zero(), this.t, this.phase, st); accumulate(p, P.idle, wi); }
    if (ww > 0) { clips.walk(P.walk.zero(), this.t, this.phase, st); accumulate(p, P.walk, ww); }
    if (wr > 0) { clips.run(P.run.zero(), this.t, this.phase, st); accumulate(p, P.run, wr); }
    if (ws > 0) { clips.sprint(P.sprint.zero(), this.t, this.phase, st); accumulate(p, P.sprint, ws); }
    // lean into turns
    const yv = clamp(this.yawVel, -2.5, 2.5) * Math.min(1, sp / 4);
    p.add(HB.spine, 0, 0, -yv * 0.05);
    p.add(HB.hips, 0, 0, -yv * 0.03);
  }

  apply(out) {
    const n = this.nodes, r = out.r;
    const len = Math.min(n.length, NB);
    for (let i = 1; i < len; i++) {
      const q = n[i].rotationQuaternion;
      Quaternion.FromEulerAnglesToRef(r[i * 3], r[i * 3 + 1], r[i * 3 + 2], q);
    }
    const hp = n[HB.hips].position, rest = this.rest[HB.hips], s = this.s;
    hp.set(rest.x + out.h[0] * s, rest.y + out.h[1] * s, rest.z + out.h[2] * s);
  }
}

function accumulate(out, p, w) {
  const a = out.r, b = p.r;
  for (let i = 0; i < a.length; i++) a[i] += b[i] * w;
  out.h[0] += p.h[0] * w; out.h[1] += p.h[1] * w; out.h[2] += p.h[2] * w;
}
function blendMasked(out, a, w, full) {
  const o = out.r, b = a.r;
  for (let bi = 0; bi < NB; bi++) {
    const m = full ? w : w * UPPER[bi];
    if (m <= 0) continue;
    const i = bi * 3;
    o[i] += (b[i] - o[i]) * m; o[i + 1] += (b[i + 1] - o[i + 1]) * m; o[i + 2] += (b[i + 2] - o[i + 2]) * m;
  }
  if (full) for (let i = 0; i < 3; i++) out.h[i] += (a.h[i] - out.h[i]) * w;
}

export { clips as HUMANOID_CLIPS, kf };
