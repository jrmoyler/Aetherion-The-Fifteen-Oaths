// The 30 Oath outfits (ninja + sorcerer per Oath), transcribed from the turnaround sheets
// assets/references/reference-062 … reference-091: body type, palette, layered clothing,
// armour and the silhouette cue that identifies each Oath at distance.
import { HB } from './rig.js';
import { xf, shade, mix, lerp, jointWeights } from './geom.js';
import { FRONT } from './humanoid.js';

const PI = Math.PI;
const R = (c, chan = 'cloth', extra = {}) => ({ chan, color: c, ...extra });

// shared helpers ------------------------------------------------------------
function backBox(k, chan, color, size, off, rot = [0, 0, 0], opts = {}) {
  const b = k.P('spine2');
  k.g.box(chan, size, xf([b[0] + off[0], b[1] + off[1], b[2] + off[2]], rot), HB.spine2, color, { round: 0.2, grime: 0.15, ...opts });
}
function backPoint(k, dx, dy, dz) { const b = k.P('spine2'); return [b[0] + dx, b[1] + dy, b[2] + dz]; }
function orb(k, chan, pos, r, color, bone, glowColor) {
  k.g.blob(chan, [r, r, r], xf(pos), bone, color, { stacks: 7, segs: 12, grime: 0 });
  if (glowColor) k.g.blob('glow', [r * 0.72, r * 0.72, r * 0.72], xf(pos), bone, glowColor, { stacks: 5, segs: 10, grime: 0, glow: 1.6 });
}

// ============================================================================
export const OUTFITS = {
  // 01 KILN ----------------------------------------------------------------
  'oath-01-ninja': {
    body: { h: 1.78, build: 'athletic', sex: 'm', skin: '#d9b08c', hair: ['messy', '#141110'] },
    style: { stance: 'ninja' },
    build(k) {
      const blk = '#211f1e', iron = '#3d3a37', terra = '#9a4a2c';
      k.bodyBase({
        torso: R(blk), arms: [[-0.08, 0.32, R(blk)], [0.32, 1, R(k.skin, 'skin')]], hands: R('#1b1a19', 'leather'),
        legs: [[0.08, 0.99, R('#252221', 'cloth', { baggy: 0.03 })]], feet: R('#3a2a22', 'leather'),
      });
      k.boots('leather', '#2e2420', 0.4, { bulk: 0.018, cuff: true, cuffColor: '#5a3424' });
      for (let i = 0; i < 3; i++) k.torsoPlate('enamel', mix(terra, '#000', i * 0.08), FRONT, 1.36 - i * 0.075, 0.26 - i * 0.015, 0.06, { inflate: 0.022 });
      k.belt(1.06, '#2a2420', { buckle: '#55504a', inflate: 0.02 });
      k.belt(1.15, '#2a2420', { inflate: 0.018, h: 0.03 });
      for (const s of [-1, 1]) k.bracer(s, 'leather', '#2c2826', { bulk: 0.012, block: [0.05, 0.11, 0.075], blockChan: 'enamel', blockColor: terra });
      k.cape('cloth', '#1a1918', 1.0, { width: 0.95, shift: -0.06, arc: [FRONT + 0.6, FRONT + 2 * PI - 1.6], lining: '#5a2a1c' });
      k.strap('#3a2c24', FRONT + 0.9, 1.47, FRONT - 0.8, 1.05, { w: 0.016, overShoulder: true });
      k.faceMask('metal', iron, 'grille');
      k.hair(...this.body.hair);
    },
  },
  'oath-01-sorcerer': {
    body: { h: 1.58, build: 'round', sex: 'f', age: 'elder', skin: '#c99a78', hair: ['bun', '#9c968e'] },
    style: { stance: 'sorcerer', elder: 0.5, heavy: 0.6 },
    build(k) {
      const blk = '#1f1d1c', terra = '#93492c', iron = '#45403b';
      k.bodyBase({ torso: R(blk), arms: [[-0.08, 0.82, R(blk)]], hands: R('#2a2522', 'leather'), legs: [[0.08, 0.99, R('#262321', 'cloth', { baggy: 0.035 })]], feet: R('#3a2a22', 'leather') });
      k.skirt('cloth', blk, 1.1, 0.34, { flare: 0.08, inflate: 0.018 });
      k.panel('enamel', terra, 1, 1.4, 0.4, 0.26, 0.34, { off: 0.045, thick: 0.02, trim: '#5a3020', grime: 0.2 });
      k.strap('#3a2c24', FRONT + 0.55, 1.47, FRONT + 0.6, 1.38, { w: 0.02, overShoulder: true });
      k.strap('#3a2c24', FRONT - 0.55, 1.47, FRONT - 0.6, 1.38, { w: 0.02, overShoulder: true });
      for (const s of [-1, 1]) k.bracer(s, 'enamel', terra, { t0: 0.66, t1: 0.95, bulk: 0.018 });
      k.boots('leather', '#4a2e22', 0.26, { bulk: 0.02, cuff: true, cuffColor: terra });
      k.belt(1.1, '#2a2420', { buckle: iron, inflate: 0.06 });
      // tall rectangular back kiln + chimney
      backBox(k, 'enamel', terra, [0.3, 0.44, 0.2], [0, -0.04, -0.24]);
      backBox(k, 'metal', iron, [0.16, 0.16, 0.02], [0, -0.06, -0.345]);
      for (let i = 0; i < 3; i++) backBox(k, 'glow', '#ff7a2a', [0.02, 0.1, 0.01], [-0.04 + i * 0.04, -0.06, -0.356], [0, 0, 0], { grime: 0, glow: 1.4 });
      backBox(k, 'enamel', shade(terra, 0.85), [0.13, 0.42, 0.13], [0.0, 0.38, -0.24]);
      backBox(k, 'metal', iron, [0.15, 0.03, 0.15], [0.0, 0.6, -0.24]);
      for (const s of [-1, 1]) k.strap('#3a2c24', FRONT + s * 2.1, 1.47, FRONT + s * 1.6, 1.12, { w: 0.022 });
      k.hair(...this.body.hair);
    },
  },
  // 02 RIME ----------------------------------------------------------------
  'oath-02-ninja': {
    body: { h: 1.7, build: 'athletic', sex: 'f', skin: '#e3c0a0', hair: ['bob', '#141214'] },
    style: { stance: 'ninja' },
    build(k) {
      const ch = '#2a2d32', chalk = '#e4e2dc', rime = '#bcd6e6';
      k.bodyBase({ torso: R(ch), arms: [[-0.08, 0.36, R(ch, 'cloth', { inflate: 0.012 })], [0.36, 1, R(ch, 'leather')]], hands: R('#202226', 'leather'), legs: [[0.08, 0.99, R(ch, 'leather')]], feet: R('#1e2024', 'leather') });
      // quilted white vest (front + back plates)
      k.torso('cloth', chalk, 1.05, 1.44, 0.022, { arc: [FRONT - 1.1, FRONT + 1.1], segs: 14 });
      k.torso('cloth', chalk, 1.08, 1.44, 0.022, { arc: [FRONT + PI - 0.95, FRONT + PI + 0.95], segs: 14 });
      for (let i = 0; i < 4; i++) k.torsoPlate('cloth', shade(chalk, 0.93), FRONT, 1.12 + i * 0.08, 0.2, 0.006, { inflate: 0.03, thick: 0.004 });
      k.pauldron(-1, 'enamel', rime, 'plate', { layers: 2 });
      for (const s of [-1, 1]) k.bracer(s, 'enamel', rime, { t0: 0.6, t1: 0.92, bulk: 0.016 });
      k.kneePads('leather', '#3a3e44');
      k.boots('leather', '#25272b', 0.3, { bulk: 0.026, footBulk: 1.2, cuff: true, cuffColor: '#3a3d42' });
      k.belt(1.02, '#1c1d20', { buckle: '#8a9098', pouches: [[FRONT + 0.9, 0.06], [FRONT - 0.9, 0.06]] });
      k.strap('#1c1d20', FRONT + 0.7, 1.47, FRONT - 0.5, 1.05, { w: 0.014, overShoulder: true });
      k.faceMask('cloth', '#1e2024', 'wrap');
      k.hood('cloth', ch, true, { open: 0.75 });
    },
  },
  'oath-02-sorcerer': {
    body: { h: 2.02, build: 'gaunt', sex: 'm', age: 'elder', skin: '#e0c8b4', hair: ['bald', '#ccc'] },
    style: { stance: 'sorcerer', elder: 0.35 },
    build(k) {
      const ch = '#2a2d33', chalk = '#e6e4de', rime = '#c4dcea';
      k.bodyBase({ torso: R(ch), arms: [[-0.08, 0.5, R(chalk, 'cloth', { inflate: 0.014 })], [0.5, 1, R(ch, 'cloth', { inflate: 0.012 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R(ch)]], feet: R('#1a1a1c', 'leather') });
      k.skirt('cloth', ch, 1.08, 0.05, { flare: 0.1, inflate: 0.02, follow: 0.7 });
      k.torso('cloth', ch, 1.0, 1.48, 0.03, { segs: 20 });
      k.panel('cloth', chalk, 1, 1.44, 0.06, 0.1, 0.12, { off: 0.04 });
      for (const s of [-1, 1]) k.panel('cloth', chalk, 1, 1.2, 0.06, 0.035, 0.045, { off: 0.035, x: s * 0.13 });
      k.panel('cloth', shade(ch, 0.9), -1, 1.44, 0.06, 0.22, 0.32, { off: 0.045 });
      k.collar('leather', ch, { h: 0.2, r: 0.115, open: 0.5, topK: 1.25, back: 0.03 });
      k.collar('glow', '#6fb6d8', { h: 0.2, r: 0.108, open: 0.52, topK: 1.2, back: 0.03 });
      k.belt(1.06, '#1c1c1e', { buckle: '#9aa2aa', inflate: 0.04 });
      // ledger tomes on the right hip
      for (let i = 0; i < 3; i++) k.g.box('glass', [0.05, 0.22, 0.16], xf([0.25 + i * 0.03, 0.88, 0.02], [0, 0, 0.08]), HB.hips, rime, { round: 0.15, grime: 0 });
      k.g.box('leather', [0.12, 0.03, 0.18], xf([0.28, 0.98, 0.02]), HB.hips, '#24221f', { round: 0.3 });
      k.beard('#e8e6e2', 0.22);
      k.hair('bald');
    },
  },
  // 03 STORM ---------------------------------------------------------------
  'oath-03-ninja': {
    body: { h: 1.96, build: 'lean', sex: 'm', skin: '#c08860', hair: ['topknot', '#121012'] },
    style: { stance: 'ninja' },
    build(k) {
      const navy = '#1e2a44', cu = '#b8743a', cer = '#e6e2d8';
      k.bodyBase({ torso: R(navy), arms: [[-0.08, 1, R(k.skin, 'skin')]], hands: R('#1a2236', 'leather'), legs: [[0.08, 0.99, R(navy, 'cloth', { baggy: 0.012 })]], feet: R('#1a2236', 'leather') });
      k.collar('cloth', navy, { h: 0.06, r: 0.075 });
      k.boots('leather', '#1a2236', 0.33, { bulk: 0.016, cuff: true, cuffColor: cer });
      k.strap(cu, FRONT + 0.9, 1.47, FRONT - 1.0, 1.0, { w: 0.01, overShoulder: true, chan: 'metal' });
      k.strap(cu, FRONT - 0.9, 1.47, FRONT + 1.0, 1.0, { w: 0.01, overShoulder: true, chan: 'metal' });
      k.belt(1.04, '#2a2018', { buckle: cu });
      k.bracer(1, 'leather', '#3a2a20', { t0: 0.6, t1: 0.95, bulk: 0.012, block: [0.035, 0.09, 0.045], blockChan: 'enamel', blockColor: cer });
      k.bracer(-1, 'cloth', navy, { t0: 0.82, t1: 0.98, bulk: 0.006 });
      // antenna rods on the back
      for (const [x, h] of [[-0.06, 0.72], [0.06, 0.56]]) {
        const p0 = backPoint(k, x, -0.18, -0.13);
        k.g.tube('metal', [p0, [p0[0] + x * 0.4, p0[1] + h, p0[2] - 0.05]], (t) => lerp(0.009, 0.004, t), HB.spine2, '#9a9690', { segs: 6, caps: true });
        k.g.blob('enamel', [0.016, 0.03, 0.016], xf([p0[0] + x * 0.2, p0[1] + h * 0.45, p0[2] - 0.025]), HB.spine2, cer, { stacks: 4, segs: 8 });
      }
      k.g.lathe('metal', [[0.06, 0], [0.065, 0.02], [0.06, 0.04]], xf(backPoint(k, 0, -0.06, -0.12), [PI / 2, 0, 0]), HB.spine2, cu, { segs: 14 });
      k.hair(...this.body.hair);
    },
  },
  'oath-03-sorcerer': {
    body: { h: 1.72, build: 'round', sex: 'f', skin: '#6a4430', hair: ['bun', '#141010'] },
    style: { stance: 'sorcerer', heavy: 0.7 },
    build(k) {
      const navy = '#1e2a44', cu = '#b8743a', cer = '#e8e4da';
      k.bodyBase({ torso: R(navy), arms: [[-0.08, 0.86, R(navy, 'cloth', { inflate: 0.008 })]], hands: R('#1c1c22', 'leather'), legs: [[0.08, 0.99, R('#222c42', 'cloth', { baggy: 0.03 })]], feet: R(cer, 'enamel') });
      k.boots('enamel', cer, 0.46, { bulk: 0.03, footBulk: 1.28, cuff: true, cuffColor: cu });
      k.mantle('cloth', navy, 1.08, { width: 0.42, depth: 0.12, trim: cu, n: 2.4 });
      k.belt(1.03, '#18181c', { buckle: cu, inflate: 0.03, pouches: [[FRONT + 1.2, 0.07], [FRONT - 1.2, 0.07]] });
      // copper prong collar with ceramic ball tips
      k.collar('metal', cu, { h: 0.05, r: 0.13, topK: 1.1 });
      for (let i = 0; i < 6; i++) {
        const a = FRONT + PI * 0.55 + (i / 5) * PI * 0.9;
        const bx = Math.cos(a) * 0.14, bz = Math.sin(a) * 0.12 - 0.02;
        const out = 1.0 + Math.abs(i - 2.5) * 0.08;
        const pts = [[bx, 1.52, bz], [bx * 1.4 * out, 1.6, bz * 1.3], [bx * 1.55 * out, 1.74, bz * 1.4], [bx * 1.5 * out, 1.83 + (i === 2 || i === 3 ? 0.04 : 0), bz * 1.4]];
        k.g.tube('metal', pts, 0.008, HB.spine2, cu, { segs: 5 });
        k.g.blob('enamel', [0.022, 0.022, 0.022], xf(pts[3]), HB.spine2, cer, { stacks: 5, segs: 8 });
      }
      k.hair(...this.body.hair);
    },
  },
  // 04 TIDAL ---------------------------------------------------------------
  'oath-04-ninja': {
    body: { h: 1.72, build: 'athletic', sex: 'f', skin: '#c49070', hair: ['bun', '#141010'] },
    style: { stance: 'ninja' },
    build(k) {
      const deep = '#1d3352', teal = '#3f8a96', nacre = '#e9e1d2', brass = '#b08a4a';
      k.bodyBase({ torso: R(deep, 'leather'), arms: [[-0.08, 1, R(deep, 'leather')]], hands: R('#16263e', 'leather'), legs: [[0.08, 0.99, R(deep, 'leather')]], feet: R('#16263e', 'leather') });
      for (const s of [-1, 1]) {
        k.leg(s, 'leather', teal, 0.5, 0.92, 0.004, { segs: 14 });
        k.leg(s, 'enamel', teal, 0.1, 0.3, 0.012, {});
        const [cx, cz] = k.legCentre(s, 0.2);
        k.g.box('enamel', [0.02, 0.16, 0.08], xf([cx + s * 0.045, 0.2, cz - 0.02], [0.3, 0, s * 0.25]), s < 0 ? HB.snL : HB.snR, teal, { round: 0.2, taper: 0.2 });
      }
      k.torso('leather', teal, 1.12, 1.4, 0.004, { arc: [FRONT - 0.5, FRONT + 0.5], segs: 10 });
      k.pauldron(1, 'enamel', nacre, 'shell', { scale: 1.2 });
      k.belt(1.04, brass, { chan: 'metal', h: 0.03 });
      orb(k, 'glass', backPoint(k, 0, -0.06, -0.15), 0.09, '#9fd8e8', HB.spine2, '#3ac0e8');
      k.g.lathe('metal', [[0.095, 0], [0.1, 0.012], [0.095, 0.024]], xf(backPoint(k, 0, -0.06, -0.15), [PI / 2, 0, 0]), HB.spine2, brass, { segs: 16 });
      // fin helm: nacre dome, dark glass face, crest fin
      k.helmet('enamel', nacre, 'slim', { zk: 1.18 });
      const hd = k.P('head');
      k.g.blob('glass', [0.075, 0.058, 0.04], xf([0, hd[1] + 0.085, hd[2] + 0.1]), HB.head, '#1a3440', { stacks: 6, segs: 12 });
      k.g.lathe('metal', [[0.08, -0.004], [0.084, 0], [0.08, 0.004]], xf([0, hd[1] + 0.085, hd[2] + 0.085], [PI / 2, 0, 0], [1, 1, 0.8]), HB.head, '#b08a4a', { segs: 16 });
      k.g.box('enamel', [0.018, 0.12, 0.22], xf([0, hd[1] + 0.23, hd[2] - 0.03], [0.5, 0, 0]), HB.head, shade(nacre, 0.95), { round: 0.2, taper: 0.4 });
      for (const s of [-1, 1]) k.g.box('enamel', [0.015, 0.06, 0.12], xf([s * 0.1, hd[1] + 0.13, hd[2] - 0.04], [0.4, s * 0.3, 0]), HB.head, teal, { round: 0.2, taper: 0.3 });
    },
  },
  'oath-04-sorcerer': {
    body: { h: 1.76, build: 'stocky', sex: 'm', age: 'elder', skin: '#5a3a28', hair: ['messy', '#e8e4dc'] },
    style: { stance: 'sorcerer', elder: 0.4 },
    build(k) {
      const deep = '#1d3352', nacre = '#e9e1d2', brass = '#a8864a';
      k.bodyBase({ torso: R(deep), arms: [[-0.08, 0.92, R(deep, 'cloth', { inflate: 0.01, flare: (t) => Math.max(0, t - 0.55) * 0.07 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#24384e')]], feet: R('#2a2a2a', 'leather') });
      k.skirt('cloth', deep, 1.1, 0.16, { flare: 0.1, inflate: 0.03, open: 0.32, lining: nacre });
      k.panel('cloth', nacre, 1, 1.0, 0.18, 0.14, 0.2, { off: 0.03 });
      for (const s of [-1, 1]) k.bracer(s, 'leather', '#2c5a62', { t0: 0.72, t1: 0.96, bulk: 0.02 });
      k.boots('leather', '#2a2622', 0.24, { bulk: 0.02, cuff: true, cuffColor: '#3f6a70' });
      k.hood('cloth', deep, false);
      // pearl collar ring
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * PI;
        const p = [Math.cos(a) * 0.17, 1.47 - Math.abs(Math.sin(a)) * 0.0 + (Math.sin(a) > 0 ? -0.03 : 0), Math.sin(a) * 0.14 - 0.01];
        k.g.blob('enamel', [0.042, 0.042, 0.016], xf(p, [0.9 * Math.sin(a), -a + PI / 2, 0]), HB.spine2, mix(nacre, '#d0c8ff', (i % 3) * 0.06), { stacks: 5, segs: 10, e: 0.9 });
      }
      k.belt(1.04, '#3a2a1c', { buckle: brass, inflate: 0.06, h: 0.055 });
      for (let i = 0; i < 4; i++) {
        const a = FRONT - 0.95 + i * 0.63;
        const p = k.torsoPoint(a, 1.0, 0.11);
        orb(k, 'glass', p, 0.058, '#b8e4f0', HB.hips, '#48c8f0');
      }
      k.beard('#ece8e0', 0.08);
      k.hair(...this.body.hair);
    },
  },
  // 05 FAULT ---------------------------------------------------------------
  'oath-05-ninja': {
    body: { h: 1.82, build: 'heavy', sex: 'm', skin: '#b98a64', hair: ['messy', '#3a2a1e'] },
    style: { stance: 'ninja', heavy: 0.5 },
    build(k) {
      const shale = '#4e4842', sand = '#b8996c', leather = '#3a2c22', ame = '#9a5cd6';
      k.bodyBase({ torso: R(leather, 'leather'), arms: [[-0.08, 0.4, R('#2e241e', 'cloth', { inflate: 0.012 })], [0.4, 1, R(k.skin, 'skin')]], hands: R('#2a2220', 'leather'), legs: [[0.08, 0.99, R('#2e261f', 'cloth', { baggy: 0.04 })]], feet: R(leather, 'leather') });
      k.torsoPlate('enamel', shale, FRONT, 1.3, 0.3, 0.26, { inflate: 0.035, thick: 0.03, round: 0.12 });
      k.torsoPlate('enamel', shade(shale, 0.9), FRONT, 1.1, 0.26, 0.12, { inflate: 0.035, thick: 0.025, round: 0.12 });
      k.torsoPlate('enamel', shale, FRONT + PI, 1.28, 0.3, 0.28, { inflate: 0.03, thick: 0.03, round: 0.12 });
      for (const s of [-1, 1]) {
        k.pauldron(s, 'enamel', shale, 'block', { scale: 1.25 });
        k.bracer(s, 'enamel', shale, { t0: 0.58, t1: 0.94, bulk: 0.026, segs: 6, block: [0.06, 0.16, 0.1], blockColor: shade(shale, 1.1) });
        const h = k.hR;
        k.g.box('glow', [0.02, 0.025, 0.05], xf([s * (h[0] + 0.012), h[1] - 0.12, h[2] + 0.04]), s < 0 ? HB.hL : HB.hR, ame, { round: 0.3, grime: 0, glow: 1.3 });
      }
      k.belt(1.02, leather, { buckle: sand, inflate: 0.03, h: 0.06, pouches: [[FRONT - 0.6, 0.08]] });
      k.g.box('glow', [0.05, 0.07, 0.02], xf(k.torsoPoint(FRONT - 0.6, 0.97, 0.06)), HB.hips, ame, { round: 0.3, grime: 0, glow: 1.2 });
      k.boots('enamel', '#4a4038', 0.36, { bulk: 0.03, footBulk: 1.3, cuff: true, cuffColor: leather, plate: shale, plateChan: 'enamel' });
      k.faceMask('enamel', '#4a4440', 'grille');
      k.collar('leather', '#2e241e', { h: 0.05, r: 0.1 });
      k.hair(...this.body.hair);
    },
  },
  'oath-05-sorcerer': {
    body: { h: 1.68, build: 'stocky', sex: 'f', skin: '#8a5a3a', hair: ['bun', '#141010'] },
    style: { stance: 'sorcerer', heavy: 0.4 },
    build(k) {
      const shale = '#56504a', sand = '#bfa076', leather = '#4a3424', ame = '#9a5cd6';
      k.bodyBase({ torso: R('#3a2e26', 'leather'), arms: [[-0.08, 1, R(k.skin, 'skin')]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#3a3028', 'cloth', { baggy: 0.03 })]], feet: R(leather, 'leather') });
      k.skirt('leather', '#4a3c30', 1.08, 0.48, { flare: 0.08, inflate: 0.03 });
      for (let i = 0; i < 4; i++) for (const x of [-0.08, 0.08]) {
        const y = 0.98 - i * 0.12;
        k.g.box('enamel', [0.15, 0.11, 0.02], xf([x, y, 0.17 + i * 0.012], [0.12, 0, 0]), (xx, yy, zz) => k.skirtW({ follow: 0.8 })(xx, yy, zz), i % 2 ? sand : shale, { round: 0.12, grime: 0.2 });
      }
      k.torsoPlate('enamel', sand, FRONT, 1.3, 0.24, 0.18, { inflate: 0.025 });
      for (const s of [-1, 1]) k.bracer(s, 'leather', leather, { t0: 0.62, t1: 0.94, bulk: 0.018 });
      k.belt(1.08, leather, { buckle: '#6a6058', inflate: 0.04, h: 0.06 });
      k.boots('leather', '#4a3a2c', 0.36, { bulk: 0.03, footBulk: 1.25, cuff: true, cuffColor: shale });
      // back frame with sandstone tablets
      const fr = '#5a4a3a';
      for (const s of [-1, 1]) k.g.box('metal', [0.035, 0.8, 0.035], xf(backPoint(k, s * 0.2, 0.22, -0.2)), HB.spine2, fr, { round: 0.3 });
      k.g.box('metal', [0.46, 0.04, 0.04], xf(backPoint(k, 0, 0.62, -0.2)), HB.spine2, fr, { round: 0.3 });
      k.g.box('metal', [0.46, 0.04, 0.04], xf(backPoint(k, 0, -0.12, -0.2)), HB.spine2, fr, { round: 0.3 });
      backBox(k, 'enamel', sand, [0.2, 0.3, 0.08], [0.24, 0.32, -0.28], [0, 0, 0.12]);
      backBox(k, 'enamel', shale, [0.18, 0.26, 0.07], [0.3, 0.05, -0.27], [0, 0, -0.1]);
      k.g.box('glow', [0.06, 0.08, 0.03], xf(backPoint(k, 0.26, 0.34, -0.33)), HB.spine2, ame, { round: 0.4, grime: 0, glow: 1.3 });
      k.hair(...this.body.hair);
    },
  },
  // 06 REED ----------------------------------------------------------------
  'oath-06-ninja': {
    body: { h: 1.7, build: 'lean', sex: 'f', skin: '#9a6448', hair: ['ponytail', '#121010'] },
    style: { stance: 'ninja' },
    build(k) {
      const linen = '#e2d8c6', red = '#b8402a', dark = '#3a3430';
      k.bodyBase({ torsoCuts: [[0.8, 1.02, R(dark)], [1.02, 1.13, R(k.skin, 'skin')], [1.13, 1.535, R(linen)]], arms: [[-0.08, 0.62, R(k.skin, 'skin')], [0.62, 1, R(linen, 'cloth', { inflate: 0.006 })]], hands: R('#3a2a22', 'leather'), legs: [[0.08, 0.99, R(dark, 'leather')]], feet: R('#3a2e26', 'leather') });
      k.belt(1.0, red, { chan: 'cloth', h: 0.06, inflate: 0.016 });
      k.panel('cloth', red, 1, 1.0, 0.32, 0.06, 0.05, { x: -0.07, off: 0.03 });
      k.panel('cloth', red, 1, 1.0, 0.42, 0.05, 0.04, { x: -0.02, off: 0.035 });
      k.pauldron(-1, 'leather', '#8a3a26', 'plate', { layers: 1, scale: 0.8 });
      for (const s of [-1, 1]) k.leg(s, 'cloth', linen, 0.08, 0.2, 0.008, {});
      // bird-beak mask (carved wood)
      const hd = k.P('head');
      k.g.loft('leather', [
        { c: [0, hd[1] + 0.12, hd[2] + 0.07], rx: 0.07, rz: 0.04 },
        { c: [0, hd[1] + 0.08, hd[2] + 0.13], rx: 0.04, rz: 0.035 },
        { c: [0, hd[1] + 0.02, hd[2] + 0.22], rx: 0.022, rz: 0.02 },
        { c: [0, hd[1] - 0.06, hd[2] + 0.28], rx: 0.004, rz: 0.004 },
      ], HB.head, mix('#c8b8a0', red, 0.25), { segs: 10, vertical: false, ref: [1, 0, 0], capStart: true });
      k.visor('leather', '#c8b8a0');
      // reed pipes quiver across the back
      for (let i = 0; i < 5; i++) {
        const p0 = backPoint(k, -0.12 + i * 0.025, -0.3 + i * 0.01, -0.13);
        k.g.tube('leather', [p0, [p0[0] + 0.22, p0[1] + 0.55, p0[2] - 0.03]], 0.014, HB.spine2, mix('#b89a5a', '#8a6a3a', i * 0.2), { segs: 6, caps: true });
      }
      k.strap('#e2d8c6', FRONT + 0.9, 1.47, FRONT - 0.9, 1.05, { w: 0.02 });
      k.hair(...this.body.hair);
    },
  },
  'oath-06-sorcerer': {
    body: { h: 1.95, build: 'gaunt', sex: 'm', age: 'elder', skin: '#b08060', hair: ['topknot', '#8a8680'] },
    style: { stance: 'sorcerer', elder: 0.3 },
    build(k) {
      const linen = '#d6ccb8', red = '#a83a26', wood = '#7a4a2a', bamboo = '#b89a5a';
      k.bodyBase({ torso: R(linen), arms: [[-0.08, 0.95, R(linen, 'cloth', { inflate: 0.01, flare: (t) => Math.max(0, t - 0.6) * 0.16 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#4a403a')]], feet: R('#2a2420', 'leather') });
      k.skirt('cloth', linen, 1.1, 0.3, { flare: 0.1, inflate: 0.025, open: 0.2, lining: red });
      k.torso('cloth', linen, 1.0, 1.5, 0.028, {});
      k.collar('cloth', red, { h: 0.07, r: 0.08, open: 0.4 });
      k.belt(1.05, '#4a3a2c', { inflate: 0.04, h: 0.05 });
      // resonator horn collar
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 9; i++) { const t = i / 9; pts.push([s * (0.17 + Math.sin(t * PI * 0.8) * 0.08 - t * 0.06), 1.44 + t * 0.62, -0.1 - Math.sin(t * PI) * 0.04]); }
        k.g.tube('leather', pts, (t) => lerp(0.04, 0.03, t) + (t > 0.92 ? 0.02 : 0), HB.spine2, wood, { segs: 8, caps: true });
      }
      k.g.box('leather', [0.36, 0.08, 0.06], xf(backPoint(k, 0, 0.1, -0.12)), HB.spine2, wood, { round: 0.3 });
      for (let i = 0; i < 4; i++) k.g.tube('leather', [[-0.24 - i * 0.012, 0.75, 0.02 + i * 0.025], [-0.26 - i * 0.012, 1.1, 0.0 + i * 0.025]], 0.016, HB.hips, bamboo, { segs: 6, caps: true });
      k.beard('#9a948c', 0.1);
      k.hair(...this.body.hair);
    },
  },
  // 07 GRAFT ---------------------------------------------------------------
  'oath-07-ninja': {
    body: { h: 1.86, build: 'muscular', sex: 'm', skin: '#5a3a24', hair: ['buzz', '#141010'] },
    style: { stance: 'ninja' },
    build(k) {
      const bark = '#4e3c28', moss = '#5f7a3a', straw = '#b09a5a', amber = '#ffb030';
      k.bodyBase({ torso: R('#3a2e20', 'leather'), arms: [[-0.08, 1, R(k.skin, 'skin')]], hands: R('#2a2018', 'leather'), legs: [[0.08, 0.99, R('#2e2620', 'cloth', { baggy: 0.035 })]], feet: R(bark, 'leather') });
      for (let i = 0; i < 4; i++) k.torsoPlate('leather', mix(bark, '#6a5038', (i % 2) * 0.4), FRONT + (i % 2 ? 0.35 : -0.35), 1.34 - Math.floor(i / 2) * 0.14, 0.16, 0.14, { inflate: 0.03, thick: 0.03, roll: (i % 2 ? -0.3 : 0.3) });
      k.mantle('cloth', shade(moss, 0.8), 1.34, { width: 0.29, depth: 0.05, n: 2.2 });
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * 2 * PI, r = 0.15 + (i % 3) * 0.035;
        const p = [Math.cos(a) * (r + 0.05), 1.45 - (i % 4) * 0.035 - Math.abs(Math.sin(a)) * 0.02, Math.sin(a) * r * 0.75 - 0.01];
        k.g.blob('cloth', [0.07, 0.045, 0.06], xf(p, [0.3 * Math.sin(i), a, 0.25]), (x, y) => k.torsoW(x, y), mix('#4a6428', '#7a8a3a', (i * 37 % 10) / 10), { stacks: 4, segs: 7, grime: 0.3 });
      }
      k.panel('cloth', straw, 1, 1.0, 0.55, 0.22, 0.24, { off: 0.03 });
      k.panel('cloth', moss, -1, 1.0, 0.58, 0.26, 0.28, { off: 0.03 });
      k.belt(1.02, '#3a2a1a', { h: 0.05, inflate: 0.03 });
      for (const s of [-1, 1]) {
        k.bracer(s, 'leather', bark, { t0: 0.56, t1: 0.96, bulk: 0.024 });
        k.pauldron(s, 'leather', bark, 'plate', { layers: 2, scale: 1.1 });
        const c = k.armPoint(s, 0.75);
        for (let j = 0; j < 3; j++) k.g.tube('leather', [[c[0] + s * 0.03, c[1] - 0.08 + j * 0.06, c[2]], [c[0] + s * 0.12, c[1] + 0.04 + j * 0.06, c[2] - 0.03]], (t) => lerp(0.014, 0.002, t), s < 0 ? HB.faL : HB.faR, bark, { segs: 5 });
      }
      k.boots('leather', bark, 0.3, { bulk: 0.025, footBulk: 1.15 });
      // carved wooden mask (elongated face shield with amber slits)
      const hd = k.P('head');
      k.g.box('leather', [0.13, 0.27, 0.06], xf([0, hd[1] + 0.1, hd[2] + 0.1], [0.05, 0, 0]), HB.head, '#7a5a38', { round: 0.4, bend: 0.07, taper: 0.55, taperZ: 0.8 });
      for (const s of [-1, 1]) k.g.box('glow', [0.035, 0.01, 0.01], xf([s * 0.03, hd[1] + 0.11, hd[2] + 0.132]), HB.head, amber, { round: 0.5, grime: 0, glow: 1.5 });
      k.hair('buzz', '#141010');
    },
  },
  'oath-07-sorcerer': {
    body: { h: 1.55, build: 'stocky', sex: 'f', age: 'elder', skin: '#b07850', hair: ['bun', '#a09a92'] },
    style: { stance: 'sorcerer', elder: 0.8 },
    build(k) {
      const brown = '#5a4230', moss = '#5f7a3a', straw = '#b8a060';
      k.bodyBase({ torso: R(brown), arms: [[-0.08, 0.9, R(brown, 'cloth', { inflate: 0.018, flare: (t) => Math.max(0, t - 0.6) * 0.08 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#3a3026')]], feet: R('#3a2a1c', 'leather') });
      k.torso('cloth', brown, 1.0, 1.5, 0.03, {});
      k.skirt('cloth', brown, 1.08, 0.16, { flare: 0.12, inflate: 0.035 });
      k.panel('cloth', moss, 1, 1.32, 0.3, 0.24, 0.3, { off: 0.05 });
      for (let i = 0; i < 6; i++) k.g.tube('cloth', [[-0.15 + i * 0.06, 1.0, 0.2], [-0.16 + i * 0.065, 0.55 - (i % 2) * 0.08, 0.24]], 0.01, (x, y, z) => k.skirtW({})(x, y, z), straw, { segs: 4 });
      k.collar('cloth', '#d8ccb0', { h: 0.05, r: 0.09, open: 0.6 });
      k.belt(1.08, straw, { chan: 'cloth', inflate: 0.05, h: 0.05 });
      k.boots('leather', '#3a2a1c', 0.2, { bulk: 0.02 });
      // woven basket of saplings
      const bp = backPoint(k, 0, 0.02, -0.28);
      k.g.lathe('cloth', [[0.13, -0.18], [0.17, -0.1], [0.2, 0.1], [0.21, 0.2], [0.19, 0.2], [0.18, 0.1]], xf(bp), HB.spine2, straw, { segs: 18, n: 2.6, grime: 0.25 });
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.1, base = [bp[0] + x, bp[1] + 0.18, bp[2] + (i === 1 ? -0.04 : 0.02)];
        k.g.tube('leather', [base, [base[0] + x * 0.3, base[1] + 0.22, base[2]], [base[0] + x * 0.5, base[1] + 0.4, base[2] + 0.02]], (t) => lerp(0.012, 0.004, t), HB.spine2, '#5a4028', { segs: 5 });
        for (let j = 0; j < 4; j++) k.g.blob('cloth', [0.045, 0.02, 0.03], xf([base[0] + x * 0.4 + (j % 2 ? 0.04 : -0.04), base[1] + 0.22 + j * 0.06, base[2]], [0, j, (j % 2 ? -0.6 : 0.6)]), HB.spine2, mix('#4a6a2a', '#7a9a3a', j * 0.25), { stacks: 4, segs: 8 });
      }
      k.hair(...this.body.hair);
    },
  },
  // 08 BITTERGLASS ---------------------------------------------------------
  'oath-08-ninja': {
    body: { h: 1.78, build: 'athletic', sex: 'm', skin: '#c49a78', hair: ['buzz', '#2a2220'] },
    style: { stance: 'ninja' },
    build(k) {
      const oil = '#2a2228', brass = '#8a7440', lime = '#c4ff3a';
      k.bodyBase({ torso: R(oil, 'leather'), arms: [[-0.08, 1, R(oil, 'cloth', { inflate: 0.008 })]], hands: R('#1e1a1a', 'leather'), legs: [[0.42, 0.99, R(oil, 'cloth', { baggy: 0.03 })], [0.08, 0.42, R('#1e1a1c', 'leather')]], feet: R('#3a2a20', 'leather') });
      k.kneePads('leather', '#3a3030');
      k.boots('leather', '#3a2a20', 0.32, { bulk: 0.02, cuff: true, cuffColor: '#2a2020' });
      k.belt(1.02, '#3a2a20', { buckle: brass, inflate: 0.02 });
      k.belt(1.12, '#3a2a20', { inflate: 0.03, h: 0.04 });
      for (let i = 0; i < 6; i++) {
        const p = k.torsoPoint(FRONT - 0.8 + i * 0.32, 1.12, 0.055);
        k.g.lathe('glass', [[0.0, -0.05], [0.014, -0.045], [0.014, 0.04], [0.006, 0.05]], xf(p), HB.spine1, '#d0f080', { segs: 8, capStart: true });
        k.g.blob('glow', [0.01, 0.03, 0.01], xf(p), HB.spine1, lime, { stacks: 4, segs: 6, glow: 1.4, grime: 0 });
      }
      for (const s of [-1, 1]) { k.strap('#3a2a20', FRONT + s * 0.6, 1.47, FRONT - s * 0.9, 1.12, { w: 0.014, overShoulder: true }); k.bracer(s, 'metal', brass, { t0: 0.64, t1: 0.92, bulk: 0.012 }); }
      backBox(k, 'leather', '#3a2a22', [0.26, 0.28, 0.12], [0, -0.04, -0.2]);
      for (let i = 0; i < 4; i++) {
        const p = backPoint(k, -0.08 + i * 0.05, 0.16, -0.2);
        k.g.lathe('glass', [[0.0, -0.08], [0.017, -0.075], [0.017, 0.06], [0.008, 0.075]], xf(p), HB.spine2, '#d0f080', { segs: 8, capStart: true });
        k.g.blob('glow', [0.012, 0.05, 0.012], xf(p), HB.spine2, lime, { stacks: 4, segs: 6, glow: 1.5, grime: 0 });
      }
      k.faceMask('leather', '#3a3028', 'respirator');
      const hd = k.P('head');
      k.g.loft('cloth', [{ c: [0, hd[1] + 0.12, hd[2]], rx: 0.088, rz: 0.098, rzB: 0.108 }, { c: [0, hd[1] + 0.2, hd[2] - 0.01], rx: 0.07, rz: 0.075, rzB: 0.09 }, { c: [0, hd[1] + 0.24, hd[2] - 0.015], rx: 0.02, rz: 0.02, rzB: 0.03 }], HB.head, '#2a2226', { segs: 14, capEnd: true });
    },
  },
  'oath-08-sorcerer': {
    body: { h: 1.8, build: 'lean', sex: 'f', skin: '#d8b090', hair: ['bob', '#8a8480'] },
    style: { stance: 'sorcerer' },
    build(k) {
      const oil = '#221e20', brass = '#9a8048', lime = '#c4ff3a';
      k.bodyBase({ torso: R(oil, 'leather'), arms: [[-0.08, 0.96, R(oil, 'leather', { inflate: 0.012 })]], hands: R('#1a1818', 'leather'), legs: [[0.08, 0.99, R('#1e1a1c')]], feet: R('#2a2420', 'leather') });
      k.skirt('leather', oil, 1.08, 0.1, { flare: 0.08, inflate: 0.022, open: 0.12 });
      k.torso('leather', oil, 1.0, 1.5, 0.026, {});
      k.collar('leather', oil, { h: 0.09, r: 0.085, open: 0.35 });
      for (let i = 0; i < 6; i++) k.g.blob('metal', [0.01, 0.01, 0.006], xf(k.torsoPoint(FRONT + 0.18, 1.42 - i * 0.07, 0.03)), HB.spine1, brass, { stacks: 4, segs: 6 });
      for (const s of [-1, 1]) k.bracer(s, 'metal', brass, { t0: 0.66, t1: 0.94, bulk: 0.016 });
      k.belt(1.04, '#3a2a20', { buckle: brass, inflate: 0.04, pouches: [[FRONT + 0.9, 0.05], [FRONT - 0.9, 0.05]] });
      k.boots('leather', '#2a2420', 0.36, { bulk: 0.016, cuff: true, cuffColor: brass });
      // shoulder reagent flasks + vent pipe
      for (const s of [-1, 1]) {
        const p = [s * 0.22, 1.62, -0.07];
        orb(k, 'glass', p, 0.095, '#e0f8a0', HB.spine2, lime);
        k.g.lathe('metal', [[0.05, 0], [0.04, 0.03], [0.022, 0.06], [0.024, 0.1]], xf([p[0], p[1] + 0.07, p[2]]), HB.spine2, brass, { segs: 10 });
        k.g.tube('metal', [[s * 0.1, 1.46, -0.12], [s * 0.2, 1.52, -0.09]], 0.012, HB.spine2, brass, { segs: 6 });
      }
      k.g.tube('metal', [backPoint(k, 0, 0, -0.16), backPoint(k, 0, 0.62, -0.18), backPoint(k, 0.1, 0.66, -0.18)], 0.016, HB.spine2, brass, { segs: 8, caps: true });
      backBox(k, 'leather', '#3a2a20', [0.22, 0.2, 0.08], [0, -0.04, -0.17]);
      const hd = k.P('head');
      k.g.loft('cloth', [{ c: [0, hd[1] + 0.13, hd[2]], rx: 0.088, rz: 0.098, rzB: 0.108 }, { c: [0, hd[1] + 0.2, hd[2] - 0.01], rx: 0.074, rz: 0.08, rzB: 0.094 }, { c: [0, hd[1] + 0.24, hd[2] - 0.015], rx: 0.02, rz: 0.02, rzB: 0.03 }], HB.head, '#2a2428', { segs: 14, capEnd: true });
      k.hair(...this.body.hair);
    },
  },
  // 09 DAYBREAK ------------------------------------------------------------
  'oath-09-ninja': {
    body: { h: 1.74, build: 'lean', sex: 'f', skin: '#5a3a2a', hair: ['braids', '#141010'] },
    style: { stance: 'ninja' },
    build(k) {
      const grey = '#77787a', ivory = '#ece4d2', gold = '#c8a050';
      k.bodyBase({ torso: R(grey), arms: [[-0.08, 0.35, R(k.skin, 'skin')], [0.35, 1, R(grey)]], hands: R('#5a5a5c', 'leather'), legs: [[0.08, 0.99, R(grey, 'leather')]], feet: R(ivory, 'enamel') });
      k.torsoPlate('enamel', ivory, FRONT + 0.3, 1.3, 0.2, 0.22, { inflate: 0.02, roll: -0.5, thick: 0.012 });
      k.torsoPlate('enamel', ivory, FRONT - 0.3, 1.22, 0.18, 0.2, { inflate: 0.02, roll: 0.5, thick: 0.012 });
      k.panel('enamel', ivory, 1, 1.02, 0.72, 0.28, 0.1, { off: 0.03, thick: 0.008, trim: gold });
      k.panel('enamel', ivory, -1, 1.02, 0.72, 0.3, 0.12, { off: 0.03, thick: 0.008 });
      k.belt(1.02, gold, { chan: 'metal', h: 0.025 });
      k.pauldron(-1, 'enamel', ivory, 'wing', { trim: gold, scale: 1.1 });
      k.pauldron(1, 'enamel', ivory, 'wing', { trim: gold, scale: 1.1 });
      for (const s of [-1, 1]) k.bracer(s, 'enamel', ivory, { t0: 0.6, t1: 0.92, bulk: 0.01, flare: (t) => (t - 0.6) * 0.04 });
      k.boots('enamel', ivory, 0.3, { bulk: 0.008, cuff: true, cuffColor: gold });
      k.visor('metal', gold);
      const hd = k.P('head');
      k.g.box('enamel', [0.16, 0.06, 0.1], xf([0, hd[1] + 0.1, hd[2] + 0.075], [0, 0, 0]), HB.head, ivory, { round: 0.3, bend: 0.07 });
      k.hair(...this.body.hair);
    },
  },
  'oath-09-sorcerer': {
    body: { h: 1.82, build: 'lean', sex: 'm', age: 'elder', skin: '#c8a080', hair: ['ponytail', '#c8c6c2'] },
    style: { stance: 'sorcerer', elder: 0.3 },
    build(k) {
      const grey = '#8a8a88', ivory = '#ece4d2', gold = '#c8a050';
      k.bodyBase({ torso: R(grey), arms: [[-0.08, 0.95, R(grey, 'cloth', { inflate: 0.012, flare: (t) => Math.max(0, t - 0.45) * 0.12 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#7a7a78')]], feet: R('#4a443c', 'leather') });
      k.skirt('cloth', grey, 1.08, 0.12, { flare: 0.08, inflate: 0.02 });
      k.panel('cloth', ivory, 1, 1.46, 0.22, 0.3, 0.34, { off: 0.045, thick: 0.01 });
      k.panel('cloth', ivory, -1, 1.46, 0.22, 0.32, 0.36, { off: 0.045, thick: 0.01 });
      k.mantle('cloth', ivory, 1.34, { width: 0.32, depth: 0.06, n: 3.2 });
      k.collar('cloth', ivory, { h: 0.06, r: 0.08, open: 0.3 });
      k.belt(1.04, '#6a6a68', { inflate: 0.055, h: 0.06 });
      // gold lotus clasp
      const p = k.torsoPoint(FRONT, 1.04, 0.075);
      k.g.blob('metal', [0.04, 0.03, 0.02], xf(p), HB.spine, gold, { stacks: 5, segs: 10 });
      for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; k.g.box('metal', [0.025, 0.06, 0.01], xf([p[0] + Math.sin(a) * 0.04, p[1] + Math.cos(a) * 0.03, p[2] + 0.004], [0, 0, -a]), HB.spine, gold, { round: 0.3, taper: 0.2 }); }
      k.beard('#d8d6d0', 0.08);
      k.hair(...this.body.hair);
    },
  },
  // 10 OBSERVATORY ---------------------------------------------------------
  'oath-10-ninja': {
    body: { h: 1.96, build: 'massive', sex: 'm', skin: '#8a6a50', hair: ['bald', '#000'] },
    style: { stance: 'ninja', heavy: 0.8 },
    build(k) {
      const iron = '#34343a', indigo = '#24284a', silver = '#a8acb8', violet = '#8a5ad8';
      k.bodyBase({ torso: R(indigo), arms: [[-0.08, 1, R('#2a2c3a', 'cloth', { inflate: 0.01 })]], hands: R(iron, 'metal'), legs: [[0.08, 0.99, R('#262838', 'cloth', { baggy: 0.03 })]], feet: R(iron, 'metal') });
      k.torsoPlate('metal', iron, FRONT, 1.3, 0.36, 0.3, { inflate: 0.04, thick: 0.035, round: 0.15 });
      k.torsoPlate('metal', iron, FRONT + PI, 1.3, 0.36, 0.32, { inflate: 0.035, thick: 0.03, round: 0.15 });
      k.torsoPlate('metal', silver, FRONT + 0.5, 1.28, 0.2, 0.12, { inflate: 0.075, thick: 0.02, roll: -0.6 });
      k.panel('cloth', indigo, 1, 1.05, 0.4, 0.22, 0.22, { off: 0.04, trim: silver });
      k.panel('cloth', indigo, -1, 1.05, 0.42, 0.26, 0.26, { off: 0.04 });
      k.pauldron(-1, 'metal', iron, 'crescent', { scale: 1.25 });
      k.pauldron(1, 'metal', iron, 'plate', { layers: 3, scale: 1.3 });
      for (const s of [-1, 1]) {
        k.bracer(s, 'metal', iron, { t0: 0.55, t1: 0.98, bulk: 0.035 });
        k.arm(s, 'metal', shade(iron, 1.1), 0.05, 0.42, 0.02, { segs: 10 });
        for (const y of [0.62, 0.78]) { const [cx, cz] = k.legCentre(s, y); k.g.box('metal', [0.17, 0.16, 0.06], xf([cx, y, cz + 0.07], [0.05, 0, 0]), s < 0 ? HB.thL : HB.thR, iron, { round: 0.2, bend: 0.1 }); }
      }
      k.boots('metal', iron, 0.44, { bulk: 0.035, footBulk: 1.35, plate: shade(iron, 1.15) });
      k.belt(1.04, '#22222a', { buckle: silver, inflate: 0.05, h: 0.06 });
      k.g.box('glow', [0.03, 0.08, 0.01], xf(k.torsoPoint(FRONT, 1.3, 0.08)), HB.spine2, violet, { round: 0.3, grime: 0, glow: 1.2 });
      k.helmet('metal', iron, 'dome', { zk: 1.1 });
      const hd = k.P('head');
      for (const s of [-1, 1]) k.g.box('glow', [0.008, 0.06, 0.01], xf([s * 0.03, hd[1] + 0.1, hd[2] + 0.13], [0.15, s * 0.3, 0]), HB.head, '#d0d4e8', { round: 0.4, grime: 0, glow: 1.1 });
      k.hood('cloth', indigo, false);
    },
  },
  'oath-10-sorcerer': {
    body: { h: 1.62, build: 'round', sex: 'f', skin: '#b08a60', hair: ['bun', '#1a1616'] },
    style: { stance: 'sorcerer', heavy: 0.6 },
    build(k) {
      const indigo = '#20244a', ivory = '#e2dccb', silver = '#a8acb8', violet = '#8a5ad8';
      k.bodyBase({ torso: R(indigo), arms: [[-0.08, 0.85, R(indigo, 'cloth', { inflate: 0.02, flare: (t) => Math.max(0, t - 0.3) * 0.1 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#1c1e30')]], feet: R('#2a2622', 'leather') });
      k.torso('cloth', indigo, 1.0, 1.5, 0.035, {});
      const rings = k.skirt('cloth', indigo, 1.1, 0.3, { flare: 0.22, flarePow: 0.9, inflate: 0.04, follow: 0.5 });
      k.panel('cloth', ivory, 1, 1.42, 0.3, 0.12, 0.2, { off: 0.07, thick: 0.01 });
      k.boots('leather', '#2a2622', 0.26, { bulk: 0.02, cuff: true, cuffColor: silver });
      k.belt(1.08, '#3a3640', { buckle: silver, inflate: 0.07, h: 0.06 });
      orb(k, 'glass', k.torsoPoint(FRONT, 1.08, 0.12), 0.045, '#c8b0ff', HB.spine, violet);
      k.g.lathe('metal', [[0.06, 0], [0.065, 0.012], [0.06, 0.024]], xf(k.torsoPoint(FRONT, 1.08, 0.1), [PI / 2, 0, 0]), HB.spine, silver, { segs: 16 });
      // orbital spheres hanging from the hem
      const hem = rings[rings.length - 1];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * 2 * PI + 0.3;
        const x = Math.cos(a) * (hem.rx + 0.01), z = hem.c[2] + Math.sin(a) * ((Math.sin(a) > 0 ? hem.rz : hem.rzB) + 0.01);
        const skin = (xx, yy, zz) => k.skirtW({ follow: 0.5 })(xx, 0.34, zz);
        k.g.tube('metal', [[x, hem.c[1] + 0.02, z], [x * 1.02, hem.c[1] - 0.08, z * 1.02]], 0.004, skin, silver, { segs: 4 });
        k.g.blob('metal', [0.042, 0.042, 0.042], xf([x * 1.02, hem.c[1] - 0.12, z * 1.02]), skin, mix(silver, '#6a6a70', (i % 3) * 0.2), { stacks: 6, segs: 10 });
      }
      // astrolabe collar
      k.collar('metal', silver, { h: 0.04, r: 0.12 });
      k.collar('glow', violet, { h: 0.012, r: 0.125 });
      const arcPts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; arcPts.push([0.14 * Math.cos(t * PI * 0.6), 1.54 + Math.sin(t * PI * 0.55) * 0.34, -0.14 - t * 0.02]); }
      k.g.tube('metal', arcPts, 0.009, HB.spine2, silver, { segs: 6 });
      orb(k, 'metal', arcPts[10], 0.03, '#6a5aa0', HB.spine2);
      k.hair(...this.body.hair);
    },
  },
  // 11 MISSING COURT -------------------------------------------------------
  'oath-11-ninja': {
    body: { h: 1.72, build: 'lean', sex: 'f', skin: '#e0c0a0', hair: ['ponytail', '#0e0c0e'] },
    style: { stance: 'ninja' },
    build(k) {
      const blk = '#18181a', grey = '#3a3a3e', gun = '#4a4a50';
      k.bodyBase({ torso: R(blk, 'leather'), arms: [[-0.08, 0.3, R(blk, 'cloth', { inflate: 0.008 })], [0.3, 0.42, R(k.skin, 'skin')], [0.42, 1, R(blk, 'leather')]], hands: R(blk, 'leather'), legs: [[0.08, 0.99, R(blk, 'leather')]], feet: R('#1e1e20', 'leather') });
      k.torso('cloth', grey, 1.08, 1.46, 0.016, { arc: [FRONT - 0.2, FRONT + 1.6], segs: 12 });
      k.panel('cloth', grey, 1, 1.02, 0.42, 0.16, 0.12, { x: -0.07, off: 0.03 });
      k.panel('cloth', blk, -1, 1.02, 0.5, 0.26, 0.2, { off: 0.03 });
      k.belt(1.02, '#262628', { buckle: gun });
      k.belt(1.1, '#262628', { h: 0.03, inflate: 0.02 });
      const [cx, cz] = k.legCentre(1, 0.72);
      k.g.box('leather', [0.04, 0.16, 0.07], xf([cx + 0.085, 0.72, cz]), HB.thR, '#2a2a2c', { round: 0.25 });
      for (const s of [-1, 1]) k.bracer(s, 'metal', gun, { t0: 0.7, t1: 0.88, bulk: 0.008 });
      k.boots('leather', '#202022', 0.36, { bulk: 0.012 });
      k.faceMask('cloth', '#141416', 'wrap');
      k.hair(...this.body.hair);
    },
  },
  'oath-11-sorcerer': {
    body: { h: 1.95, build: 'gaunt', sex: 'm', age: 'elder', skin: '#d8c4b0', hair: ['bald', '#000'] },
    style: { stance: 'sorcerer', elder: 0.25 },
    build(k) {
      const ink = '#0f0f11', ch = '#2e2e32', silver = '#a8a8b0';
      k.bodyBase({ torso: R(ink), arms: [[-0.08, 0.96, R(ink, 'cloth', { inflate: 0.012, flare: (t) => Math.max(0, t - 0.5) * 0.18 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R(ch)]], feet: R('#18181a', 'leather') });
      k.torso('cloth', ink, 0.98, 1.5, 0.026, {});
      k.skirt('cloth', ink, 1.06, 0.05, { flare: 0.14, inflate: 0.026, open: 0.1, lining: ch });
      k.collar('cloth', ink, { h: 0.24, r: 0.1, open: 0.45, topK: 1.35, back: 0.03 });
      for (let i = 0; i < 5; i++) k.g.box('metal', [0.05, 0.03, 0.012], xf(k.torsoPoint(FRONT, 1.42 - i * 0.09, 0.034)), (x, y) => k.torsoW(x, y), silver, { round: 0.25 });
      k.belt(1.0, '#1a1a1c', { inflate: 0.035 });
      k.hair('bald');
    },
  },
  // 12 SANGUINE ------------------------------------------------------------
  'oath-12-ninja': {
    body: { h: 1.86, build: 'muscular', sex: 'm', skin: '#c09070', hair: ['bald', '#000'] },
    style: { stance: 'ninja' },
    build(k) {
      const ox = '#4a1418', burg = '#6a1e24', iron = '#5a5048', red = '#a82a30';
      k.bodyBase({ torso: R(ox, 'leather'), arms: [[-0.08, 1, R(k.skin, 'skin')]], hands: R('#2a1214', 'leather'), legs: [[0.08, 0.99, R('#2a1e1c', 'cloth', { baggy: 0.03 })]], feet: R('#2a1a18', 'leather') });
      k.panel('leather', ox, 1, 1.02, 0.46, 0.26, 0.24, { off: 0.03 });
      k.panel('leather', ox, -1, 1.02, 0.46, 0.28, 0.26, { off: 0.03 });
      k.belt(1.02, '#2a1214', { buckle: iron, inflate: 0.025, h: 0.06 });
      for (const s of [-1, 1]) {
        k.bracer(s, 'leather', burg, { t0: 0.6, t1: 0.96, bulk: 0.012 });
        for (let j = 0; j < 3; j++) k.arm(s, 'cloth', red, 0.66 + j * 0.1, 0.69 + j * 0.1, 0.02, {});
        // hanging chain loop at hip
        const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([s * (0.17 + Math.sin(t * PI) * 0.04), 1.0 - Math.sin(t * PI) * 0.16, -0.06 + t * 0.14]); }
        k.g.tube('metal', pts, 0.012, HB.hips, iron, { segs: 6, n: 3 });
      }
      for (const s of [-1, 1]) for (let j = 0; j < 4; j++) k.leg(s, 'cloth', j % 2 ? '#2a1a18' : red, 0.12 + j * 0.06, 0.15 + j * 0.06, 0.015, {});
      k.boots('leather', '#2a1a18', 0.12, { bulk: 0.01 });
      k.helmet('leather', ox, 'slim', { zk: 1.16 });
      const hd = k.P('head');
      k.g.box('leather', [0.014, 0.22, 0.24], xf([0, hd[1] + 0.13, hd[2] + 0.0]), HB.head, burg, { round: 0.4, bend: 0.12 });
      k.hood('leather', ox, false);
    },
  },
  'oath-12-sorcerer': {
    body: { h: 1.75, build: 'athletic', sex: 'f', skin: '#5a3424', hair: ['braids', '#120e0e'] },
    style: { stance: 'sorcerer' },
    build(k) {
      const burg = '#5e1a20', ox = '#3a1014', iron = '#5a5048', glass = '#c8303a';
      k.bodyBase({ torso: R(burg), arms: [[-0.08, 0.96, R(burg, 'cloth', { inflate: 0.012, flare: (t) => Math.max(0, t - 0.45) * 0.22 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#2a2020')]], feet: R('#2a2020', 'leather') });
      k.torso('cloth', burg, 1.0, 1.5, 0.026, {});
      k.skirt('cloth', burg, 1.06, 0.1, { flare: 0.14, inflate: 0.03, open: 0.24, lining: ox });
      k.panel('cloth', '#3a3434', 1, 1.0, 0.12, 0.14, 0.18, { off: 0.02 });
      k.belt(1.04, '#2a2020', { buckle: iron, inflate: 0.04, h: 0.08 });
      k.collar('cloth', burg, { h: 0.08, r: 0.09, open: 0.35 });
      k.boots('leather', '#2a2020', 0.3, { bulk: 0.016, cuff: true, cuffColor: iron });
      for (const s of [-1, 1]) {
        const p = [s * 0.25, 1.4, -0.03];
        k.g.lathe('glass', [[0.0, -0.11], [0.04, -0.105], [0.042, 0.1], [0.0, 0.11]], xf(p), HB.spine2, glass, { segs: 12, capStart: true });
        k.g.blob('glow', [0.03, 0.09, 0.03], xf(p), HB.spine2, '#ff2a3a', { stacks: 5, segs: 8, glow: 1.3, grime: 0 });
        for (const dy of [-0.1, 0.1]) k.g.lathe('metal', [[0.046, 0], [0.048, 0.015], [0.046, 0.03]], xf([p[0], p[1] + dy - 0.015, p[2]]), HB.spine2, iron, { segs: 12 });
        const hoop = []; for (let i = 0; i <= 10; i++) { const t = i / 10; hoop.push([s * (0.25 - Math.sin(t * PI) * 0.0) + s * 0.0, 1.5 + Math.sin(t * PI) * 0.16, -0.03 - 0.12 * t]); }
        k.g.tube('metal', hoop, 0.012, HB.spine2, glass, { segs: 6 });
      }
      k.hair(...this.body.hair);
    },
  },
  // 13 FOLDED THEATRE ------------------------------------------------------
  'oath-13-ninja': {
    body: { h: 1.8, build: 'lean', sex: 'm', skin: '#e0c0a0', hair: ['messy', '#121012'] },
    style: { stance: 'ninja' },
    build(k) {
      const blk = '#1c1a1e', plum = '#4a2850', silver = '#9a9aa2', porcelain = '#ece6dc';
      k.bodyBase({ torso: R(blk, 'leather'), arms: [[-0.08, 1, R(blk, 'cloth', { inflate: 0.01 })]], hands: R('#141214', 'leather'), legs: [[0.08, 0.99, R('#1e1c20')]], feet: R('#18161a', 'leather') });
      k.torso('cloth', blk, 1.0, 1.5, 0.02, {});
      k.torsoPlate('enamel', plum, FRONT + 0.25, 1.24, 0.14, 0.42, { inflate: 0.03, roll: -0.35, thick: 0.01 });
      k.skirt('cloth', blk, 1.04, 0.5, { flare: 0.06, inflate: 0.022, open: 0.35, lining: plum });
      k.panel('cloth', plum, 1, 1.02, 0.42, 0.12, 0.06, { x: 0.1, off: 0.045 });
      k.collar('cloth', blk, { h: 0.08, r: 0.085, open: 0.3, topK: 1.15 });
      k.belt(1.04, '#2a282c', { buckle: silver });
      for (const s of [-1, 1]) {
        k.bracer(s, 'leather', '#262428', { t0: 0.64, t1: 0.94, bulk: 0.008 });
        const c = k.armPoint(s, 0.79);
        for (const dz of [-0.05, 0.05]) k.g.box('metal', [0.012, 0.18, 0.012], xf([c[0] + s * 0.045, c[1], c[2] + dz]), s < 0 ? HB.faL : HB.faR, silver, { round: 0.3 });
        for (const dy of [-0.09, 0.09]) k.g.box('metal', [0.012, 0.012, 0.11], xf([c[0] + s * 0.045, c[1] + dy, c[2]]), s < 0 ? HB.faL : HB.faR, silver, { round: 0.3 });
      }
      k.boots('leather', '#18161a', 0.32, { bulk: 0.012 });
      const hd = k.P('head');
      k.g.box('enamel', [0.15, 0.27, 0.05], xf([0, hd[1] + 0.1, hd[2] + 0.105], [0.04, 0, PI / 4], [0.72, 0.72, 1]), HB.head, porcelain, { round: 0.15, bend: 0.1, grime: 0.03 });
      k.hair(...this.body.hair);
    },
  },
  'oath-13-sorcerer': {
    body: { h: 1.72, build: 'lean', sex: 'f', skin: '#e8c8b0', hair: ['bob', '#141214'] },
    style: { stance: 'sorcerer' },
    build(k) {
      const aub = '#3a2a3e', mauve = '#b8a0ae', silver = '#a8a4a0';
      k.bodyBase({ torso: R(aub), arms: [[-0.08, 0.96, R(aub, 'cloth', { inflate: 0.012 })]], hands: R(k.skin, 'skin'), legs: [[0.08, 0.99, R('#2a2028')]], feet: R('#221c20', 'leather') });
      k.torso('cloth', aub, 1.0, 1.5, 0.022, {});
      k.skirt('cloth', aub, 1.04, 0.55, { flare: 0.06, inflate: 0.022, open: 0.3, lining: mauve });
      k.panel('enamel', mauve, 1, 1.4, 0.32, 0.12, 0.16, { x: -0.06, off: 0.05, thick: 0.008 });
      // tall folded collar wings
      for (const s of [-1, 1]) {
        k.g.box('enamel', [0.13, 0.3, 0.012], xf([s * 0.15, 1.63, -0.035], [-0.12, s * 0.45, s * -0.42]), (x, y) => jointWeights(y, [HB.spine2, HB.neck], [1.62], [0.06]), mauve, { round: 0.1, taper: 1.5 });
        k.g.box('enamel', [0.11, 0.26, 0.01], xf([s * 0.14, 1.62, -0.045], [-0.12, s * 0.45, s * -0.42]), (x, y) => jointWeights(y, [HB.spine2, HB.neck], [1.62], [0.06]), aub, { round: 0.1, taper: 1.5 });
        k.pauldron(s, 'enamel', mauve, 'plate', { layers: 1, scale: 0.9 });
      }
      k.belt(1.04, '#2a2028', { buckle: silver, pouches: [[FRONT - 0.95, 0.09]], pouchColor: silver });
      for (const s of [-1, 1]) k.bracer(s, 'metal', silver, { t0: 0.8, t1: 0.92, bulk: 0.006 });
      k.boots('leather', '#221c20', 0.3, { bulk: 0.012 });
      k.hair(...this.body.hair);
    },
  },
  // 14 ESCAPEMENT ----------------------------------------------------------
  'oath-14-ninja': {
    body: { h: 1.8, build: 'athletic', sex: 'm', skin: '#5a3a28', hair: ['messy', '#121010'] },
    style: { stance: 'ninja' },
    build(k) {
      const teal = '#1e3a40', brass = '#b8904a', blk = '#1c1c1c';
      k.bodyBase({ torso: R('#1e1e1e'), arms: [[-0.08, 0.5, R(k.skin, 'skin')], [0.5, 1, R(blk, 'leather', { inflate: 0.004 })]], hands: R(blk, 'leather'), legs: [[0.08, 0.99, R('#222222', 'cloth', { baggy: 0.02 })]], feet: R('#2a2420', 'leather') });
      k.torso('leather', teal, 0.98, 1.47, 0.02, { segs: 20 });
      k.skirt('leather', teal, 1.0, 0.46, { flare: 0.05, inflate: 0.022, arc: [FRONT + 1.2, FRONT + 2 * PI - 1.2], cape: 0.5 });
      k.panel('leather', teal, 1, 1.0, 0.56, 0.12, 0.1, { x: -0.06, off: 0.03 });
      k.collar('leather', teal, { h: 0.09, r: 0.085, open: 0.3, topK: 1.1 });
      k.belt(1.02, '#2a2018', { buckle: brass, inflate: 0.03 });
      // hip flywheel
      const p = k.torsoPoint(PI, 0.94, 0.05);
      k.g.lathe('metal', [[0.11, -0.012], [0.115, 0.0], [0.11, 0.012]], xf([p[0] - 0.02, p[1], p[2] + 0.02], [0, 0, PI / 2]), HB.hips, brass, { segs: 20 });
      for (let i = 0; i < 4; i++) k.g.box('metal', [0.008, 0.2, 0.012], xf([p[0] - 0.02, p[1], p[2] + 0.02], [i * PI / 4, 0, 0]), HB.hips, shade(brass, 0.85), { round: 0.3 });
      k.g.blob('glow', [0.02, 0.025, 0.025], xf([p[0] - 0.03, p[1], p[2] + 0.02]), HB.hips, '#ffd88a', { stacks: 4, segs: 8, glow: 1.5, grime: 0 });
      for (const s of [-1, 1]) {
        k.leg(s, 'leather', '#2a2420', 0.1, 0.4, 0.016, {});
        const [cx, cz] = k.legCentre(s, 0.2);
        k.g.box('metal', [0.012, 0.16, 0.012], xf([cx + s * 0.055, 0.2, cz]), s < 0 ? HB.snL : HB.snR, brass, { round: 0.3 });
      }
      k.visor('metal', brass);
      const hd = k.P('head');
      for (const s of [-1, 1]) k.g.lathe('glass', [[0.024, 0], [0.026, 0.01], [0.0, 0.016]], xf([s * 0.034, hd[1] + 0.098, hd[2] + 0.1], [PI / 2, 0, 0]), HB.head, '#d8a040', { segs: 10, capStart: true });
      k.hair(...this.body.hair);
    },
  },
  'oath-14-sorcerer': {
    body: { h: 1.68, build: 'lean', sex: 'f', skin: '#e8c8a8', hair: ['bun', '#2a1e18'] },
    style: { stance: 'sorcerer' },
    build(k) {
      const teal = '#1e3a40', ivory = '#e2d8c0', brass = '#b8904a';
      k.bodyBase({ torso: R(teal), arms: [[-0.08, 0.96, R(teal, 'cloth', { inflate: 0.01 })]], hands: R('#2a2420', 'leather'), legs: [[0.08, 0.99, R('#2a2622')]], feet: R('#2a2420', 'leather') });
      k.torso('cloth', teal, 1.0, 1.5, 0.022, {});
      k.skirt('cloth', teal, 1.04, 0.4, { flare: 0.08, inflate: 0.022, open: 0.3, lining: ivory });
      k.panel('cloth', ivory, 1, 1.0, 0.36, 0.1, 0.18, { off: 0.025 });
      k.collar('cloth', ivory, { h: 0.08, r: 0.09, open: 0.4, topK: 1.2 });
      k.belt(1.04, '#3a2a1c', { buckle: brass, inflate: 0.03, pouches: [[FRONT + 0.9, 0.06]] });
      for (const s of [-1, 1]) {
        const c = k.armPoint(s, 0.8);
        k.g.lathe('metal', [[0.065, -0.07], [0.072, -0.06], [0.072, 0.06], [0.065, 0.07]], xf([c[0], c[1], c[2]]), s < 0 ? HB.faL : HB.faR, brass, { segs: 14 });
        for (const dy of [-0.035, 0.0, 0.035]) k.g.lathe('metal', [[0.076, -0.006], [0.08, 0], [0.076, 0.006]], xf([c[0], c[1] + dy, c[2]]), s < 0 ? HB.faL : HB.faR, shade(brass, 0.8), { segs: 14 });
        k.g.lathe('glass', [[0.07, -0.05], [0.071, 0.05]], xf([c[0], c[1], c[2]]), s < 0 ? HB.faL : HB.faR, '#a09070', { segs: 14 });
      }
      k.boots('leather', '#2a2420', 0.34, { bulk: 0.012, cuff: true, cuffColor: brass });
      // pendulum harness over the right shoulder
      const b0 = backPoint(k, -0.05, -0.1, -0.15);
      k.g.tube('metal', [b0, backPoint(k, 0.05, 0.3, -0.18), [0.3, 1.76, -0.16], [0.42, 1.7, -0.1]], 0.012, HB.spine2, brass, { segs: 6 });
      k.g.tube('metal', [[0.42, 1.7, -0.1], [0.44, 1.2, -0.08]], 0.006, HB.spine2, brass, { segs: 5 });
      orb(k, 'metal', [0.44, 1.15, -0.08], 0.05, brass, HB.spine2);
      k.g.lathe('metal', [[0.03, 0], [0.034, 0.02], [0.03, 0.04]], xf(backPoint(k, 0.05, 0.3, -0.18), [PI / 2, 0, 0]), HB.spine2, brass, { segs: 10 });
      k.hair(...this.body.hair);
    },
  },
  // 15 IMPULSE -------------------------------------------------------------
  'oath-15-ninja': {
    body: { h: 1.85, build: 'muscular', sex: 'm', skin: '#3a2418', hair: ['locs', '#141010'] },
    style: { stance: 'ninja' },
    build(k) {
      const gun = '#3a3c40', dark = '#24262a', orange = '#d8701e', cyan = '#58d4ff';
      k.bodyBase({ torso: R(dark, 'leather'), arms: [[-0.08, 1, R(k.skin, 'skin')]], hands: R(dark, 'leather'), legs: [[0.08, 0.99, R('#2e3034', 'cloth', { baggy: 0.035 })]], feet: R(dark, 'leather') });
      k.torsoPlate('enamel', orange, FRONT, 1.32, 0.3, 0.22, { inflate: 0.03, thick: 0.025 });
      k.torsoPlate('metal', gun, FRONT, 1.13, 0.24, 0.1, { inflate: 0.03 });
      for (const s of [-1, 1]) {
        k.strap(gun, FRONT + s * 0.6, 1.47, FRONT + s * 0.9, 1.0, { w: 0.018, overShoulder: true, chan: 'metal' });
        k.pauldron(s, 'enamel', orange, 'plate', { layers: 2, scale: 0.95 });
        k.bracer(s, 'metal', gun, { t0: 0.55, t1: 0.98, bulk: 0.04, segs: 8, block: [0.05, 0.12, 0.09], blockChan: 'enamel', blockColor: orange });
        const c = k.armPoint(s, 0.75);
        k.g.blob('glow', [0.012, 0.02, 0.012], xf([c[0] + s * 0.075, c[1], c[2] + 0.03]), s < 0 ? HB.faL : HB.faR, cyan, { stacks: 4, segs: 6, glow: 1.5, grime: 0 });
        k.g.tube('leather', [backPoint(k, s * 0.12, -0.05, -0.12), [s * 0.32, 1.3, -0.1], [s * 0.3, 1.1, -0.04]], 0.012, (x, y) => (y > 1.3 ? [[HB.spine2, 1]] : [[s < 0 ? HB.uaL : HB.uaR, 1]]), '#1a1a1c', { segs: 5 });
        const [cx, cz] = k.legCentre(s, 0.5);
        k.g.lathe('metal', [[0.05, 0], [0.055, 0.02], [0.05, 0.04]], xf([cx + s * 0.06, 0.5, cz], [0, 0, PI / 2]), s < 0 ? HB.snL : HB.snR, gun, { segs: 12 });
      }
      k.belt(1.03, gun, { chan: 'metal', inflate: 0.03, h: 0.05, buckle: orange });
      k.boots('leather', dark, 0.36, { bulk: 0.03, footBulk: 1.3, cuff: true, cuffColor: orange });
      k.helmet('metal', '#1e2024', 'slim', { zk: 1.12 });
      const hd = k.P('head');
      for (const s of [-1, 1]) k.g.box('glow', [0.06, 0.012, 0.01], xf([s * 0.03, hd[1] + 0.08, hd[2] + 0.115], [0, s * 0.3, s * 0.55]), HB.head, '#f0f0f0', { round: 0.4, grime: 0, glow: 1.2 });
      for (const s of [-1, 1]) k.g.lathe('metal', [[0.03, 0], [0.032, 0.02], [0.0, 0.025]], xf([s * 0.1, hd[1] + 0.09, hd[2] + 0.0], [0, 0, -s * PI / 2]), HB.head, gun, { segs: 10, capEnd: true });
      k.hair('locs', '#141010');
    },
  },
  'oath-15-sorcerer': {
    body: { h: 1.95, build: 'athletic', sex: 'm', skin: '#4a2a1c', hair: ['short', '#121010'] },
    style: { stance: 'sorcerer' },
    build(k) {
      const gun = '#3a3c40', orange = '#d8701e', steel = '#6a6c70', cyan = '#58d4ff';
      k.bodyBase({ torso: R(gun), arms: [[-0.08, 0.98, R(gun, 'cloth', { inflate: 0.014 })]], hands: R('#2a2a2c', 'leather'), legs: [[0.08, 0.99, R('#2a2a2e')]], feet: R('#26262a', 'leather') });
      k.torso('cloth', gun, 0.98, 1.5, 0.028, {});
      k.skirt('cloth', gun, 1.04, 0.14, { flare: 0.1, inflate: 0.028, open: 0.18, lining: orange });
      k.collar('cloth', gun, { h: 0.12, r: 0.1, open: 0.35, topK: 1.25 });
      k.collar('cloth', orange, { h: 0.115, r: 0.096, open: 0.37, topK: 1.22 });
      k.belt(1.04, '#2a2018', { buckle: orange, inflate: 0.035, pouches: [[FRONT + 0.8, 0.07], [FRONT - 0.8, 0.07]] });
      for (const s of [-1, 1]) {
        k.bracer(s, 'metal', steel, { t0: 0.52, t1: 0.98, bulk: 0.05, segs: 8 });
        const c = k.armPoint(s, 0.76);
        k.g.box('enamel', [0.05, 0.14, 0.1], xf([c[0] + s * 0.07, c[1], c[2]]), s < 0 ? HB.faL : HB.faR, orange, { round: 0.2 });
        k.g.box('glow', [0.02, 0.1, 0.02], xf([c[0] + s * 0.098, c[1], c[2] + 0.02]), s < 0 ? HB.faL : HB.faR, cyan, { round: 0.3, glow: 1.6, grime: 0 });
        k.pauldron(s, 'cloth', gun, 'plate', { layers: 1, scale: 0.9 });
        k.strap('#2a2018', FRONT + s * 0.55, 1.47, FRONT + s * 0.7, 1.1, { w: 0.02, overShoulder: true });
      }
      k.boots('leather', '#26262a', 0.34, { bulk: 0.024, footBulk: 1.2, cuff: true, cuffColor: orange });
      backBox(k, 'metal', steel, [0.34, 0.42, 0.16], [0, 0.0, -0.22]);
      for (const s of [-1, 1]) backBox(k, 'enamel', orange, [0.1, 0.32, 0.03], [s * 0.1, 0.0, -0.31]);
      backBox(k, 'glow', cyan, [0.03, 0.26, 0.02], [0, 0.0, -0.312], [0, 0, 0], { glow: 1.5, grime: 0 });
      for (const s of [-1, 1]) k.g.lathe('metal', [[0.03, 0], [0.03, 0.12], [0.02, 0.14]], xf(backPoint(k, s * 0.12, 0.2, -0.22)), HB.spine2, '#2a2a2c', { segs: 10, capEnd: true });
      k.hair(...this.body.hair);
    },
  },
};

export function outfitKey(oath, cls) { return `${oath}-${cls === 'sorcerer' ? 'sorcerer' : 'ninja'}`; }
