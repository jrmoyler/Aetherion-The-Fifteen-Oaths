// Procedural signature weapons per Oath/class (from shared/oaths.js weapon text and the
// weapon sheets reference-031 … 061). Static meshes, modelled with the grip at the origin and
// the business end along +Y; shared per weapon id and instanced per actor.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { GeoBuilder, xf, shade, mix, lerp } from './geom.js';
import { getActorMaterials } from './materials.js';

const PI = Math.PI;
const cache = new WeakMap();

// grip: how it is held. 'blade' = forward-pointing one-hander, 'staff' = long vertical,
// 'off' = left hand item, 'heavy' = two-hand haft carried low, 'gauntlet' = worn
const W = {
  'oath-01-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.62, w: 0.075, col: '#9a4a2c', chan: 'enamel', edge: '#3a3634', wedge: true }) },
  'oath-01-sorcerer': { grip: 'cannon', build: (g) => cannon(g, '#93492c', '#3a3634', '#ff7a2a') },
  'oath-02-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.78, w: 0.04, col: '#c4dcea', chan: 'glass', edge: '#e8f4ff', curve: 0.06, guard: '#2b2e33' }) },
  'oath-02-sorcerer': { grip: 'cannon', build: (g) => repeater(g) },
  'oath-03-ninja': { grip: 'blade', build: (g) => whip(g, '#b8743a', '#b4a2ff') },
  'oath-03-sorcerer': { grip: 'staff', build: (g) => staff(g, { len: 1.85, wood: '#2a3348', metal: '#b8743a', head: 'prongs', glow: '#b4a2ff' }) },
  'oath-04-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.62, w: 0.06, col: '#d8e0e4', chan: 'metal', edge: '#e9e1d2', curve: 0.14, guard: '#b08a4a' }) },
  'oath-04-sorcerer': { grip: 'staff', build: (g) => staff(g, { len: 1.8, wood: '#3a3028', metal: '#b08a4a', head: 'orb', glow: '#58d4ff', orbGlass: '#a8dcf0' }) },
  'oath-05-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.48, w: 0.07, col: '#9a5cd6', chan: 'glass', edge: '#c89cff', guard: '#4a4440', crystal: true }) },
  'oath-05-sorcerer': { grip: 'staff', build: (g) => mace(g, { len: 0.95, haft: '#3a2c22', head: '#5a5048', crystal: '#b07cff' }) },
  'oath-06-ninja': { grip: 'blade', build: (g) => fan(g) },
  'oath-06-sorcerer': { grip: 'staff', build: (g) => staff(g, { len: 1.75, wood: '#8a6a4a', metal: '#b89a5a', head: 'fork', glow: '#e8f2ff' }) },
  'oath-07-ninja': { grip: 'bow', build: (g) => bow(g) },
  'oath-07-sorcerer': { grip: 'staff', build: (g) => staff(g, { len: 1.7, wood: '#5a4028', metal: '#5f7a3a', head: 'sapling', glow: '#ffc04a' }) },
  'oath-08-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.74, w: 0.045, col: '#8a8a7a', chan: 'metal', edge: '#c4ff3a', curve: 0.1, guard: '#8a7440', vial: true }) },
  'oath-08-sorcerer': { grip: 'cannon', build: (g) => crossbow(g, '#3a2a20', '#9a8048', '#c4ff3a') },
  'oath-09-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.56, w: 0.05, col: '#ece4d2', chan: 'enamel', edge: '#d8b060', guard: '#c8a050' }) },
  'oath-09-sorcerer': { grip: 'staff', build: (g) => staff(g, { len: 1.9, wood: '#ece4d2', metal: '#c8a050', head: 'lotus', glow: '#fff0b0', woodChan: 'enamel' }) },
  'oath-10-ninja': { grip: 'flail', build: (g) => flail(g, '#34343a', '#8a5ad8') },
  'oath-10-sorcerer': { grip: 'staff', build: (g) => staff(g, { len: 1.85, wood: '#1c1f3a', metal: '#a8acb8', head: 'astrolabe', glow: '#9a7aff' }) },
  'oath-11-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.52, w: 0.11, col: '#4a4a4c', chan: 'metal', edge: '#8a8a90', guard: '#2e2e32', cleaver: true }) },
  'oath-11-sorcerer': { grip: 'staff', build: (g) => mace(g, { len: 0.8, haft: '#121214', head: '#2e2e32', crystal: '#7a5aff', spikes: true }) },
  'oath-12-ninja': { grip: 'blade', build: (g) => whip(g, '#5a5048', '#ff2a3a') },
  'oath-12-sorcerer': { grip: 'gauntlet', build: (g) => gauntlet(g) },
  'oath-13-ninja': { grip: 'blade', build: (g) => blade(g, { len: 0.9, w: 0.016, col: '#c8c8d0', chan: 'metal', edge: '#e070ff', guard: '#c8a050', rapier: true }) },
  'oath-13-sorcerer': { grip: 'off', build: (g) => codex(g) },
  'oath-14-ninja': { grip: 'heavy', build: (g) => scythe(g) },
  'oath-14-sorcerer': { grip: 'off', build: (g) => pendulumRing(g) },
  'oath-15-ninja': { grip: 'heavy', build: (g) => hammer(g) },
  'oath-15-sorcerer': { grip: 'shield', build: (g) => shield(g) },
};

function handle(g, len, col = '#2a2420', wrap = '#5a3a2a') {
  g.lathe('leather', [[0.016, -0.06], [0.018, -0.05], [0.016, len * 0.5], [0.017, len]], null, 0, col, { segs: 8, capStart: true });
  for (let i = 0; i < 5; i++) g.lathe('leather', [[0.0185, -0.04 + i * 0.03], [0.019, -0.03 + i * 0.03]], null, 0, wrap, { segs: 8 });
}
function blade(g, o) {
  handle(g, 0.14);
  g.box('metal', [0.11 + (o.cleaver ? 0.04 : 0), 0.02, 0.035], xf([0, 0.15, 0]), 0, o.guard ?? '#3a3634', { round: 0.3 });
  if (o.rapier) { g.lathe('metal', [[0.05, 0.1], [0.06, 0.12], [0.05, 0.15]], xf([0, 0.0, 0], [0, 0, 0]), 0, o.guard, { segs: 12 }); }
  const L = o.len, w = o.w;
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = 0.16 + t * L;
    const ww = o.cleaver ? w * (0.85 + t * 0.3) : o.wedge ? w * (1 - t * 0.55) : w * (1 - Math.pow(t, 3) * 0.85);
    pts.push({ y, w: Math.max(0.004, t > 0.97 ? ww * 0.2 : ww), off: (o.curve ?? 0) * t * t });
  }
  // blade as thin box segments with bevelled edge
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1];
    const cy = (a.y + b.y) / 2, h = b.y - a.y + 0.002;
    g.box(o.chan, [(a.w + b.w) / 2, h, 0.012], xf([(a.off + b.off) / 2 + (o.cleaver ? 0.02 : 0), cy, 0], [0, 0, -(b.off - a.off) / h]), 0, o.col, { round: 0.2, stacks: 2, segs: 8, grime: 0.06 });
    g.box('metal', [0.004, h, 0.006], xf([(a.off + b.off) / 2 + ((a.w + b.w) / 4) + (o.cleaver ? 0.02 : 0), cy, 0], [0, 0, -(b.off - a.off) / h]), 0, o.edge, { round: 0.4, stacks: 2, segs: 6, grime: 0 });
  }
  if (o.crystal) g.blob('glow', [0.02, 0.05, 0.01], xf([0, 0.3, 0.004]), 0, '#c89cff', { stacks: 4, segs: 6, glow: 1.2 });
  if (o.vial) { g.lathe('glass', [[0.0, 0.0], [0.014, 0.004], [0.014, 0.06], [0.0, 0.065]], xf([0, -0.02, 0.03]), 0, '#c4ff3a', { segs: 8, capStart: true }); }
  if (o.cleaver) for (let i = 0; i < 3; i++) g.box('metal', [0.02, 0.02, 0.014], xf([0.075, 0.3 + i * 0.1, 0]), 0, '#1a1a1c', { round: 0.4 });
}
function staff(g, o) {
  const L = o.len;
  const grip = L * 0.42; // grip point
  g.lathe(o.woodChan ?? 'leather', [[0.022, -grip], [0.02, -grip + 0.05], [0.018, 0], [0.019, L - grip - 0.1], [0.024, L - grip]], null, 0, o.wood, { segs: 8, capStart: true, capEnd: true });
  g.lathe('metal', [[0.026, -grip], [0.028, -grip + 0.04], [0.024, -grip + 0.07]], null, 0, o.metal, { segs: 8 });
  for (const y of [-0.12, 0.12]) g.lathe('metal', [[0.024, y], [0.026, y + 0.02], [0.024, y + 0.04]], null, 0, o.metal, { segs: 8 });
  const top = L - grip;
  if (o.head === 'orb') {
    for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3; g.tube('metal', [[0, top - 0.04, 0], [Math.cos(a) * 0.06, top + 0.06, Math.sin(a) * 0.06], [Math.cos(a) * 0.03, top + 0.2, Math.sin(a) * 0.03]], 0.007, 0, o.metal, { segs: 5 }); }
    g.blob('glass', [0.065, 0.065, 0.065], xf([0, top + 0.12, 0]), 0, o.orbGlass, { stacks: 7, segs: 12 });
    g.blob('glow', [0.04, 0.04, 0.04], xf([0, top + 0.12, 0]), 0, o.glow, { stacks: 5, segs: 8, glow: 1.6 });
  } else if (o.head === 'prongs') {
    g.lathe('metal', [[0.03, top], [0.05, top + 0.05], [0.03, top + 0.08]], null, 0, o.metal, { segs: 10 });
    for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3; g.tube('metal', [[0, top + 0.06, 0], [Math.cos(a) * 0.09, top + 0.16, Math.sin(a) * 0.09], [Math.cos(a) * 0.05, top + 0.3, Math.sin(a) * 0.05]], (t) => lerp(0.012, 0.004, t), 0, o.metal, { segs: 5 }); g.blob('enamel', [0.016, 0.016, 0.016], xf([Math.cos(a) * 0.05, top + 0.3, Math.sin(a) * 0.05]), 0, '#e8e4da', { stacks: 4, segs: 6 }); }
    g.blob('glow', [0.025, 0.04, 0.025], xf([0, top + 0.18, 0]), 0, o.glow, { stacks: 5, segs: 8, glow: 1.8 });
  } else if (o.head === 'fork') {
    for (const s of [-1, 1]) g.tube('leather', [[0, top - 0.02, 0], [s * 0.06, top + 0.08, 0], [s * 0.05, top + 0.3, 0]], 0.012, 0, o.metal, { segs: 6, caps: true });
    g.lathe('metal', [[0.03, top - 0.04], [0.035, top], [0.03, top + 0.03]], null, 0, '#8a6a3a', { segs: 8 });
  } else if (o.head === 'sapling') {
    for (let i = 0; i < 4; i++) { const a = i * 1.7; g.tube('leather', [[0, top - 0.05, 0], [Math.cos(a) * 0.08, top + 0.1, Math.sin(a) * 0.08], [Math.cos(a) * 0.04, top + 0.22, Math.sin(a) * 0.04]], (t) => lerp(0.014, 0.004, t), 0, o.wood, { segs: 5 }); }
    for (let i = 0; i < 6; i++) g.blob('cloth', [0.035, 0.015, 0.025], xf([Math.cos(i) * 0.08, top + 0.12 + (i % 3) * 0.05, Math.sin(i) * 0.08], [0, i, 0.5]), 0, '#5f7a3a', { stacks: 3, segs: 6 });
    g.blob('glow', [0.03, 0.035, 0.03], xf([0, top + 0.1, 0]), 0, o.glow, { stacks: 5, segs: 8, glow: 1.4 });
  } else if (o.head === 'lotus') {
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; g.box('enamel', [0.04, 0.12, 0.012], xf([Math.cos(a) * 0.04, top + 0.08, Math.sin(a) * 0.04], [Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5]), 0, i % 2 ? '#ece4d2' : '#d8b060', { round: 0.3, taper: 0.2 }); }
    g.blob('glow', [0.035, 0.035, 0.035], xf([0, top + 0.1, 0]), 0, o.glow, { stacks: 5, segs: 8, glow: 1.8 });
  } else if (o.head === 'astrolabe') {
    for (let i = 0; i < 3; i++) g.lathe('metal', [[0.11 - i * 0.02, -0.005], [0.115 - i * 0.02, 0], [0.11 - i * 0.02, 0.005]], xf([0, top + 0.12, 0], [i * 0.9, i * 0.6, PI / 2]), 0, o.metal, { segs: 20 });
    g.blob('glass', [0.045, 0.045, 0.045], xf([0, top + 0.12, 0]), 0, '#6a5aa0', { stacks: 6, segs: 10 });
    g.blob('glow', [0.025, 0.025, 0.025], xf([0, top + 0.12, 0]), 0, o.glow, { stacks: 4, segs: 8, glow: 1.8 });
  }
}
function mace(g, o) {
  g.lathe('leather', [[0.02, -0.12], [0.018, 0], [0.019, o.len * 0.6], [0.024, o.len * 0.7]], null, 0, o.haft, { segs: 8, capStart: true });
  const top = o.len * 0.7;
  g.blob('metal', [0.07, 0.09, 0.07], xf([0, top + 0.06, 0]), 0, o.head, { stacks: 6, segs: 8, n: 3, e: 0.6 });
  for (let i = 0; i < 6; i++) { const a = i * PI / 3; g.box('metal', [0.02, 0.12, 0.05], xf([Math.cos(a) * 0.065, top + 0.06, Math.sin(a) * 0.065], [0, -a, 0]), 0, shade(o.head, 1.2), { round: 0.3 }); }
  g.blob('glow', [0.035, 0.05, 0.035], xf([0, top + 0.14, 0]), 0, o.crystal, { stacks: 5, segs: 6, n: 1.5, e: 0.5, glow: 1.4 });
}
function whip(g, metal, glow) {
  handle(g, 0.2, '#2a2420', metal);
  g.lathe('metal', [[0.026, 0.2], [0.03, 0.22], [0.022, 0.25]], null, 0, metal, { segs: 8 });
  // coiled chain/lash hanging
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([Math.sin(t * PI * 3) * 0.05 * t, 0.25 - t * 0.55, Math.cos(t * PI * 3) * 0.05 * t + t * 0.08]); }
  g.tube('metal', pts, 0.008, 0, metal, { segs: 5, n: 3 });
  g.blob('glow', [0.012, 0.03, 0.012], xf(pts[24]), 0, glow, { stacks: 4, segs: 6, glow: 1.4 });
}
function fan(g) {
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + i * 0.225;
    g.box('leather', [0.008, 0.3, 0.004], xf([Math.sin(a) * 0.15, 0.15 + Math.cos(a) * 0.15 - 0.15, 0], [0, 0, -a]), 0, '#5a3a24', { round: 0.3, stacks: 2 });
  }
  const rows = [];
  for (let i = 0; i <= 8; i++) rows.push(-0.9 + i * 0.225);
  for (let i = 0; i < 8; i++) {
    const a = (rows[i] + rows[i + 1]) / 2;
    g.box('cloth', [0.07, 0.17, 0.003], xf([Math.sin(a) * 0.2, 0.2 * Math.cos(a), 0.002], [0, 0, -a]), 0, i % 2 ? '#e2d8c6' : '#c8402a', { round: 0.1, stacks: 2, taper: 1.6 });
  }
}
function bow(g) {
  const pts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; const y = (t - 0.5) * 1.3; pts.push([0, y, -Math.cos((t - 0.5) * PI) * 0.16 + 0.16 - (Math.abs(t - 0.5) > 0.42 ? (Math.abs(t - 0.5) - 0.42) * 0.8 : 0)]); }
  g.tube('leather', pts, (t) => 0.018 - Math.abs(t - 0.5) * 0.018, 0, '#5a4028', { segs: 6, caps: true });
  g.tube('cloth', [pts[0], [0, 0, 0.16], pts[14]].map((p, i) => (i === 1 ? [0, 0, -0.0] : p)), 0.002, 0, '#d8ccb0', { segs: 3 });
  for (let i = 0; i < 5; i++) g.blob('cloth', [0.03, 0.012, 0.02], xf([0.02, -0.5 + i * 0.25, -0.14 + Math.abs(i - 2) * 0.04], [0, i, 0.4]), 0, '#5f7a3a', { stacks: 3, segs: 6 });
}
function cannon(g, body, iron, glow) {
  g.lathe('enamel', [[0.0, -0.1], [0.06, -0.09], [0.07, 0.1], [0.06, 0.32], [0.05, 0.36]], xf([0, 0, 0.02], [0, 0, 0]), 0, body, { segs: 12, capStart: true });
  for (const y of [0.0, 0.14, 0.28]) g.lathe('metal', [[0.072, y], [0.075, y + 0.02], [0.072, y + 0.04]], xf([0, 0, 0.02]), 0, iron, { segs: 12 });
  g.blob('glow', [0.035, 0.01, 0.035], xf([0, 0.36, 0.02]), 0, glow, { stacks: 3, segs: 10, glow: 1.8 });
}
function repeater(g) {
  g.box('leather', [0.05, 0.4, 0.07], xf([0, 0.12, 0]), 0, '#2b2e33', { round: 0.2 });
  g.box('glass', [0.36, 0.03, 0.05], xf([0, 0.3, 0.02]), 0, '#c4dcea', { round: 0.3, bend: 0.4 });
  g.box('metal', [0.03, 0.12, 0.08], xf([0, 0.02, 0.05]), 0, '#8a9098', { round: 0.3 });
  g.blob('glow', [0.012, 0.03, 0.012], xf([0, 0.32, 0.05]), 0, '#8fdcff', { stacks: 4, segs: 6, glow: 1.6 });
}
function crossbow(g, wood, brass, glow) {
  g.box('leather', [0.05, 0.42, 0.06], xf([0, 0.12, 0]), 0, wood, { round: 0.2 });
  g.box('metal', [0.42, 0.025, 0.04], xf([0, 0.28, 0.01]), 0, brass, { round: 0.3, bend: 0.35 });
  g.lathe('glass', [[0.0, 0], [0.025, 0.01], [0.025, 0.1], [0, 0.11]], xf([0, 0.06, 0.05]), 0, '#d0f080', { segs: 8, capStart: true });
  g.blob('glow', [0.018, 0.04, 0.018], xf([0, 0.11, 0.05]), 0, glow, { stacks: 4, segs: 6, glow: 1.5 });
}
function flail(g, iron, glow) {
  handle(g, 0.3, '#2a2c3a', '#a8acb8');
  const pts = [[0, 0.3, 0], [0.04, 0.22, 0.06], [0.06, 0.08, 0.1], [0.06, -0.08, 0.1]];
  g.tube('metal', pts, 0.008, 0, '#a8acb8', { segs: 5, n: 3 });
  g.blob('metal', [0.08, 0.08, 0.08], xf([0.06, -0.15, 0.1]), 0, iron, { stacks: 7, segs: 10 });
  for (let i = 0; i < 6; i++) { const a = i * PI / 3; g.box('metal', [0.02, 0.02, 0.06], xf([0.06 + Math.cos(a) * 0.08, -0.15 + Math.sin(a) * 0.08, 0.1], [0, 0, a]), 0, '#5a5a62', { round: 0.3, taper: 0.2 }); }
  g.blob('glow', [0.04, 0.012, 0.04], xf([0.06, -0.15, 0.18]), 0, glow, { stacks: 3, segs: 8, glow: 1.4 });
}
function gauntlet(g) {
  g.lathe('metal', [[0.05, -0.02], [0.058, 0.05], [0.06, 0.14], [0.052, 0.2]], xf([0, -0.02, 0], [PI, 0, 0]), 0, '#5a5048', { segs: 10 });
  g.blob('glass', [0.035, 0.035, 0.035], xf([0, -0.08, 0.05]), 0, '#c8303a', { stacks: 5, segs: 8 });
  g.blob('glow', [0.022, 0.022, 0.022], xf([0, -0.08, 0.05]), 0, '#ff2a3a', { stacks: 4, segs: 6, glow: 1.8 });
}
function codex(g) {
  g.box('leather', [0.2, 0.26, 0.05], xf([0, 0.06, 0.06]), 0, '#3a2a3e', { round: 0.15 });
  g.box('metal', [0.21, 0.27, 0.012], xf([0, 0.06, 0.09]), 0, '#a8a4a0', { round: 0.2 });
  g.box('glass', [0.14, 0.18, 0.005], xf([0, 0.06, 0.098]), 0, '#e8e0ff', { round: 0.3 });
  g.box('glow', [0.05, 0.05, 0.004], xf([0, 0.06, 0.1], [0, 0, PI / 4]), 0, '#e070ff', { round: 0.3, glow: 1.4 });
}
function pendulumRing(g) {
  g.lathe('metal', [[0.12, -0.012], [0.13, 0], [0.12, 0.012]], xf([0, 0.1, 0.05], [PI / 2, 0, 0]), 0, '#b8904a', { segs: 22 });
  for (let i = 0; i < 12; i++) { const a = i * PI / 6; g.box('metal', [0.012, 0.025, 0.012], xf([Math.cos(a) * 0.14, 0.1 + Math.sin(a) * 0.14, 0.05]), 0, '#8a6a3a', { round: 0.3 }); }
  g.blob('glow', [0.03, 0.03, 0.015], xf([0, 0.1, 0.05]), 0, '#ffd88a', { stacks: 4, segs: 8, glow: 1.6 });
}
function scythe(g) {
  g.lathe('leather', [[0.02, -0.5], [0.019, 0], [0.019, 0.9], [0.022, 0.95]], null, 0, '#1e3a40', { segs: 8, capStart: true });
  for (const y of [-0.5, 0.0, 0.9]) g.lathe('metal', [[0.024, y], [0.026, y + 0.02], [0.024, y + 0.04]], null, 0, '#a8844a', { segs: 8 });
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([-Math.sin(t * PI * 0.6) * 0.5, 0.95 + Math.sin(t * PI) * 0.08 - t * 0.12, 0]); }
  for (let i = 0; i < 10; i++) {
    const a = pts[i], b = pts[i + 1];
    const w = 0.09 * (1 - i / 10) + 0.01;
    g.box('metal', [Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.004, w, 0.01], xf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - w / 2, 0], [0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])]), 0, i % 3 === 0 ? '#e8dcc0' : '#9a9a9a', { round: 0.2, stacks: 2 });
  }
  g.blob('glow', [0.035, 0.035, 0.02], xf([0, 0.95, 0.02]), 0, '#ffd88a', { stacks: 4, segs: 8, glow: 1.6 });
}
function hammer(g) {
  g.lathe('leather', [[0.024, -0.25], [0.022, 0], [0.022, 0.6]], null, 0, '#24262a', { segs: 8, capStart: true });
  g.box('metal', [0.3, 0.16, 0.16], xf([0, 0.68, 0]), 0, '#3a3c40', { round: 0.12 });
  for (const s of [-1, 1]) g.box('enamel', [0.04, 0.17, 0.17], xf([s * 0.13, 0.68, 0]), 0, '#d8701e', { round: 0.15 });
  g.box('glow', [0.18, 0.02, 0.17], xf([0, 0.68, 0.0]), 0, '#ffa040', { round: 0.3, glow: 1.5 });
}
function shield(g) {
  for (let i = 0; i < 3; i++) g.box('metal', [0.16, 0.6, 0.03], xf([(i - 1) * 0.15, 0.0, 0.06 - Math.abs(i - 1) * 0.02], [0, (i - 1) * -0.25, 0]), 0, i === 1 ? '#3a3c40' : '#5a5c60', { round: 0.12, taper: 0.85 });
  g.box('enamel', [0.08, 0.5, 0.01], xf([0, 0, 0.08]), 0, '#d8701e', { round: 0.2 });
  g.box('glow', [0.02, 0.36, 0.01], xf([0, 0, 0.088]), 0, '#ffa040', { round: 0.3, glow: 1.6 });
}

/** Build (cached) weapon meshes for an outfit key; returns {grip, meshes[]} templates (disabled). */
export function getWeaponTemplate(scene, key) {
  let c = cache.get(scene);
  if (!c) { c = new Map(); cache.set(scene, c); }
  if (c.has(key)) return c.get(key);
  const spec = W[key];
  if (!spec) { c.set(key, null); return null; }
  const g = new GeoBuilder(1);
  g.grime = 0.05;
  spec.build(g);
  const meshes = g.build(scene, `weapon:${key}`, getActorMaterials(scene), false);
  for (const m of meshes) { m.isVisible = false; m.isPickable = false; }
  const t = { grip: spec.grip, meshes };
  c.set(key, t);
  return t;
}

/** Attach instances of the weapon to the rig sockets. Returns {node, instances, grip}. */
export function attachWeapon(scene, key, sockets) {
  const t = getWeaponTemplate(scene, key);
  if (!t) return null;
  const hand = t.grip === 'off' || t.grip === 'bow' || t.grip === 'shield' ? sockets['socket.hand.L'] : sockets['socket.hand.R'];
  if (!hand) return null;
  const node = new TransformNode(`weapon:${key}`, scene);
  node.parent = hand;
  // orientation per grip (weapon local +Y = business end)
  // compensates the idle grip pose (anim.js gripPose) so blades rest forward-low, staffs upright,
  // cannons level, off-hand items face forward
  const rot = {
    blade: [2.6, 0, 0], staff: [0.1, 0, 0], cannon: [2.85, 0, 0], off: [1.1, 0, 0], bow: [1.1, 0, 0],
    heavy: [3.55, 0, 0.25], flail: [2.4, 0, 0], gauntlet: [0, 0, 0], shield: [1.1, 0, 0],
  }[t.grip] ?? [0, 0, 0];
  node.rotation.set(rot[0], rot[1], rot[2]);
  if (t.grip === 'shield') node.position.set(-0.05, 0.12, 0.06);
  if (t.grip === 'gauntlet') node.position.set(0, 0.05, 0);
  const instances = t.meshes.map((m) => {
    const inst = m.createInstance(`${m.name}#`);
    inst.parent = node;
    inst.isPickable = false;
    return inst;
  });
  return { node, instances, grip: t.grip };
}

export const WEAPONS = W;
void Mesh; void mix;
