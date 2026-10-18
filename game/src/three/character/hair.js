// Procedural groom: an opaque scalp layer with an alpha-tested natural
// hairline, then strand cards grown along a per-style flow field over the
// cranium (slicked to a bun/knot/tail, swept, short, messy), braids, buns,
// beards, brows and lashes. Shading is dual-lobe Kajiya-Kay along the strand
// tangent so highlights band across the hair the way they do on real hair.
import { BufferGeometry, Float32BufferAttribute, SphereGeometry, Vector3, Color, MeshPhysicalMaterial, DoubleSide } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { sculpt, cranium, EYE } from './head.js';
import { withSurface } from './surface.js';

// ---------------------------------------------------------------- rng / math
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
const hashStr = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

// ---------------------------------------------------------------- shading
const HAIR_VERT = /* glsl */`
attribute vec3 flow; attribute vec4 hairInfo;
varying vec3 vFlowV; varying vec4 vHair;`;
const HAIR_FRAG_DECL = /* glsl */`
varying vec3 vFlowV; varying vec4 vHair; uniform float hairSpec; uniform vec3 hairTip;`;
// hairInfo: x = across-card (0..1), y = along strand (0 root .. 1 tip), z = seed, w = card(1)/cap(0)
const HAIR_COLOR = /* glsl */`
  float hs=vHair.z*91.7;
  float across=vHair.x, along=vHair.y;
  float strand=csNoise(vec3(across*46.+hs, along*2.2+hs*.3, hs))*.5+.5;
  float fine=csNoise(vec3(across*140.+hs*1.7, along*5., hs))*.5+.5;
  float capStr=0.;
  if(vHair.w<.5){ vec3 nrm=normalize(vCsP); vec3 side=normalize(cross(normalize(vFlowO),nrm)+1e-5); float c=dot(vCsP,side); float a=dot(vCsP,normalize(vFlowO));
    capStr=csNoise(vec3(c*700.,a*40.,hs))*.5+.5; strand=capStr*.6+(csNoise(vec3(c*2600.,a*90.,hs+7.))*.5+.5)*.4; fine=csNoise(vec3(c*6000.,a*160.,hs+3.))*.5+.5; }
  float lum=dot(diffuseColor.rgb,vec3(.33)); float spread=mix(1.,.45,smoothstep(.15,.6,lum));
  diffuseColor.rgb*=1.+(mix(.6,1.15,strand*.55+fine*.45)-1.)*spread;
  diffuseColor.rgb=mix(diffuseColor.rgb,hairTip,smoothstep(.55,1.,along)*.35*vHair.w);
  float alpha=1.;
  if(vHair.w>.5){
    float N=26.; float id=floor(across*N); float fx=fract(across*N);
    float h1=fract(sin(id*12.9898+hs*78.233)*43758.5453), h2=fract(sin(id*39.346+hs*11.135)*24634.6345);
    float wob=csNoise(vec3(id*3.1,along*6.,hs))*.25;
    float wid=.28+.32*h2;
    float line=smoothstep(wid,wid*.45,abs(fx-.5+wob*.4));
    float len=.55+.45*h1;
    float end=smoothstep(len,len-.18,along);
    float edge=smoothstep(.5,.38,abs(across-.5));
    alpha=line*end*mix(.55,1.,edge)+ (1.-step(.35,abs(across-.5)))*smoothstep(.45,.2,along)*.6;
    alpha=clamp(alpha,0.,1.);
    strand=mix(strand,h1,.6);
    diffuseColor.rgb*=1.+(h2-.5)*.5*spread;
  } else {
    alpha=smoothstep(-.03,.03,vHair.y+(fine-.5)*.035+(strand-.5)*.02);
    diffuseColor.rgb=mix(diffuseColor.rgb*1.15,diffuseColor.rgb,smoothstep(0.,.05,vHair.y));
  }
  diffuseColor.a*=alpha;
  csH=(strand-.5)*1.2+(fine-.5)*.6;
  hairStrand=strand;
`;
const HAIR_SPEC = /* glsl */`
#if NUM_DIR_LIGHTS > 0
{
  vec3 T=normalize(vFlowV - normal*dot(vFlowV,normal)); vec3 Vv=normalize(vViewPosition);
  for(int i=0;i<NUM_DIR_LIGHTS;i++){
    vec3 L=directionalLights[i].direction; vec3 Hh=normalize(L+Vv);
    float sh=(hairStrand-.5)*.35;
    vec3 T1=normalize(T+normal*(-.12+sh)), T2=normalize(T+normal*(.2+sh));
    float d1=dot(T1,Hh), d2=dot(T2,Hh);
    float s1=pow(sqrt(max(0.,1.-d1*d1)),240.), s2=pow(sqrt(max(0.,1.-d2*d2)),48.);
    float wrap=clamp(dot(normal,L)*.8+.15,0.,1.)*(vHair.w>.5?1.:.35+.9*pow(hairStrand,3.));
    reflectedLight.directSpecular+=directionalLights[i].color*(vec3(1.,.95,.88)*s1*.22*(.4+hairStrand)+s2*1.6*diffuseColor.rgb*hairStrand)*wrap*hairSpec;
  }
}
#endif
`;

const hairMats = new Map();
export function hairMaterial(color, card, quality = 'high') {
  const key = `${color}|${card}|${quality}`;
  if (hairMats.has(key)) return hairMats.get(key);
  const base = new Color(color);
  const m = new MeshPhysicalMaterial({ color: base, roughness: .8, metalness: 0, specularIntensity: .04, envMapIntensity: .15, vertexColors: true, side: card ? DoubleSide : 0, alphaTest: .5, alphaToCoverage: card && quality !== 'low' });
  m.name = card ? 'hair-cards' : 'hair-cap';
  withSurface(m, 'hair', .6);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.uniforms.hairSpec = { value: .6 }; shader.uniforms.hairTip = { value: base.clone().lerp(new Color('#d8c8a8'), .22).multiplyScalar(1.15) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${HAIR_VERT}\nvarying vec3 vFlowO;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlowV=normalize(normalMatrix*flow); vFlowO=flow; vHair=hairInfo;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${HAIR_FRAG_DECL}\nvarying vec3 vFlowO;\nfloat hairStrand=.5;`)
      .replace('float csH=0.;', `float csH=0.;\n${HAIR_COLOR}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${HAIR_SPEC}`);
    // the colour/alpha block must run before alphatest; move roughness hook earlier
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', '').replace('#include <normal_fragment_begin>', '#include <alphatest_fragment>\n#include <normal_fragment_begin>');
  };
  m.customProgramCacheKey = () => `hair:${card}`;
  hairMats.set(key, m);
  return m;
}

// ---------------------------------------------------------------- card builder
class CardSet {
  constructor() { this.pos = []; this.nrm = []; this.flow = []; this.info = []; this.col = []; this.idx = []; this.n = 0; }
  // guide: Vector3[]; out(i) returns outward normal; width; opts {taper, seed, shade, curl}
  add(guide, width, opts = {}) {
    const n = guide.length; if (n < 2) return;
    const taper = opts.taper ?? .7, seed = opts.seed ?? Math.random(), shade = opts.shade ?? 1, base = this.n;
    for (let i = 0; i < n; i++) {
      const p = guide[i], t = (i < n - 1 ? guide[i + 1].clone().sub(p) : p.clone().sub(guide[i - 1])).normalize();
      let o = opts.out ? opts.out(p, i / (n - 1)) : p.clone().normalize();
      const side = new Vector3().crossVectors(t, o); if (side.lengthSq() < 1e-8) side.set(1, 0, 0); side.normalize();
      o = new Vector3().crossVectors(side, t).normalize();
      const f = i / (n - 1), w = width * (1 - taper * f ** 1.6) * (opts.root ? Math.min(1, .55 + f * 3) : 1);
      const lift = w * .18;
      const ao = (opts.ao ?? .78) + (1 - (opts.ao ?? .78)) * Math.min(1, f * 2.5);
      for (const [k, a] of [[0, -.5], [1, 0], [2, .5]]) {
        const q = p.clone().addScaledVector(side, a * w).addScaledVector(o, k === 1 ? lift : 0);
        this.pos.push(q.x, q.y, q.z); this.nrm.push(o.x + side.x * a * .6, o.y + side.y * a * .6, o.z + side.z * a * .6);
        this.flow.push(t.x, t.y, t.z); this.info.push(k / 2, f, seed, 1);
        const c = ao * shade; this.col.push(c, c, c);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < 2; k++) {
      const a = base + i * 3 + k, b = a + 3;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this.n += n * 3;
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('flow', new Float32BufferAttribute(this.flow, 3)); g.setAttribute('hairInfo', new Float32BufferAttribute(this.info, 4));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3)); g.setIndex(this.idx);
    const nr = g.attributes.normal; const v = new Vector3(); for (let i = 0; i < nr.count; i++) { v.fromBufferAttribute(nr, i).normalize(); nr.setXYZ(i, v.x, v.y, v.z); }
    return g;
  }
}

// ---------------------------------------------------------------- scalp helpers
function hairline(p, P, recede = 0) {
  const a = Math.atan2(p.x, p.z), f = Math.cos(a);
  const front = .3 + recede, side = .05, nape = -.3;
  const yl = f > 0 ? side + (front - side) * f ** 1.6 : side + (nape - side) * (-f) ** 1.1;
  // widow's peak / temple recess
  const temple = Math.exp(-(((Math.abs(a) - .62) / .18) ** 2)) * (.03 + recede * .8);
  return p.y - (yl + temple);
}

function onScalp(dir, P, lift) { const c = cranium(dir.clone().normalize(), P); return c.multiplyScalar(1 + lift / c.length()); }

function fib(n) { const out = [], g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), t = g * i; out.push(V(Math.cos(t) * r, y, Math.sin(t) * r)); } return out; }

function walk(start, target, P, { step = .028, max = 40, lift = .012, stopR = .05, jitter = 0, R } = {}) {
  const pts = [onScalp(start, P, lift)];
  let p = pts[0].clone();
  for (let i = 0; i < max; i++) {
    const n = p.clone().normalize(), d = target.clone().sub(p); if (d.length() < stopR) break;
    d.addScaledVector(n, -d.dot(n)); if (d.lengthSq() < 1e-9) break; d.normalize();
    if (jitter && R) d.add(V((R() - .5) * jitter, (R() - .5) * jitter, (R() - .5) * jitter)).normalize();
    p = onScalp(p.addScaledVector(d, step), P, lift); pts.push(p.clone());
  }
  return pts;
}

// free strand: gravity + direction, keeping clear of the cranium/shoulders
function fall(start, dir, len, P, { segs = 8, gravity = .9, R, sway = .15, minR = 1.02 } = {}) {
  const pts = [start.clone()]; let p = start.clone(), d = dir.clone().normalize();
  const step = len / segs;
  for (let i = 0; i < segs; i++) {
    d.add(V(0, -gravity * step * 2.2, 0)); if (R) d.add(V((R() - .5) * sway, 0, (R() - .5) * sway)); d.normalize();
    p = p.clone().addScaledVector(d, step);
    if (p.y > -.55) { const s = onScalp(p, P, 0); if (p.length() < s.length() * minR) p.copy(s.multiplyScalar(minR)); }
    pts.push(p);
  }
  return pts;
}

// ---------------------------------------------------------------- styles
function scalpRoots(P, count, R, recede, filter = () => true) {
  return fib(count * 2).map(d => onScalp(d, P, 0)).filter(p => hairline(p, P, recede) > .01 && filter(p)).slice(0, count).map(p => p.add(V((R() - .5) * .01, 0, (R() - .5) * .01)));
}

function slicked(cards, P, R, target, count, recede, width = .05) {
  for (const root of scalpRoots(P, count, R, recede)) {
    const path = walk(root, target, P, { lift: .011 + R() * .008, stopR: .06, R, jitter: .25 });
    if (path.length > 2) cards.add(path, width * (1.3 + R() * .6), { taper: .35, seed: R(), shade: .85 + R() * .3, root: true });
  }
}

function bunAt(cards, P, R, c, rad, loops = 46) {
  for (let i = 0; i < loops; i++) {
    const ax = V(R() - .5, R() - .5, R() - .5).normalize(), u = V(1, 0, 0).cross(ax).normalize(), v = ax.clone().cross(u);
    const rr = rad * (.75 + R() * .35), pts = [];
    const a0 = R() * 6.28, span = 4 + R() * 2;
    for (let k = 0; k <= 14; k++) { const a = a0 + span * k / 14; pts.push(c.clone().addScaledVector(u, Math.cos(a) * rr).addScaledVector(v, Math.sin(a) * rr)); }
    cards.add(pts, rad * .55, { taper: .2, seed: R(), shade: .8 + R() * .3, out: (p) => p.clone().sub(c).normalize(), ao: .75 });
  }
}

function flyaways(cards, P, R, origin, n, len) {
  for (let i = 0; i < n; i++) {
    const d = V(Math.sign(origin.x) * (.2 + R() * .3), -.8 - R() * .3, .15 + R() * .2);
    cards.add(fall(origin.clone().add(V((R() - .5) * .08, 0, (R() - .5) * .05)), d, len * (.6 + R() * .6), P, { segs: 7, gravity: .5, R }), .022, { taper: .9, seed: R(), out: (p) => p.clone().normalize() });
  }
}

function shortHair(cards, P, R, count, len, recede, spiky = true) {
  for (const root of scalpRoots(P, count, R, recede)) {
    const n = root.clone().normalize();
    const front = Math.max(0, root.z / root.length());
    // flow: up/back on top, down around sides; fringe forward on the front
    const flowDir = V(0, .55, -.6).addScaledVector(n, .2).add(V(0, -Math.max(0, -root.y + .1) * 2.5, 0)).add(V(0, 0, front * 1.2));
    flowDir.addScaledVector(n, -flowDir.dot(n)).normalize();
    const out = n.clone().multiplyScalar(spiky ? .75 : .35).add(flowDir).normalize();
    const pts = [onScalp(root, P, .004)]; let p = pts[0].clone(), d = out.clone();
    const L = len * (.7 + R() * .6);
    for (let i = 0; i < 4; i++) {
      d.lerp(flowDir, .3).add(V((R() - .5) * .25, -.08, (R() - .5) * .25)).normalize();
      p = p.clone().addScaledVector(d, L / 4);
      const s = onScalp(p, P, .006); if (p.length() < s.length()) p.copy(s);
      pts.push(p);
    }
    cards.add(pts, .06 + R() * .03, { taper: spiky ? .9 : .7, seed: R(), shade: .8 + R() * .35 });
  }
}

function messyHair(cards, P, R, count) {
  const whorl = V(0, .46, -.16);
  for (const root of scalpRoots(P, count, R, 0)) {
    const n = root.clone().normalize();
    const away = root.clone().sub(whorl); away.addScaledVector(n, -away.dot(n)).normalize();
    const L = (root.z > .1 ? .36 : .26) * (.7 + R() * .6);
    const pts = [onScalp(root, P, .006)]; let p = pts[0].clone(), d = away.clone().addScaledVector(n, .45).normalize();
    for (let i = 0; i < 6; i++) {
      d.add(V((R() - .5) * .35, -.22, (R() - .5) * .35)).normalize();
      p = p.clone().addScaledVector(d, L / 6);
      if (p.y > -.2) { const s = onScalp(p, P, .008); if (p.length() < s.length()) p.copy(s); }
      // keep fringe clear of the face plane
      if (p.z > .3 && p.y < .2) p.z = Math.max(p.z, sculpt(p.clone().normalize(), P, { cloth: true }).z + .02);
      pts.push(p);
    }
    cards.add(pts, .075 + R() * .035, { taper: .85, seed: R(), shade: .78 + R() * .4 });
  }
}

function sweptHair(cards, P, R, count, recede) {
  const target = V(0, -.15, -.95);
  for (const root of scalpRoots(P, count, R, recede)) {
    const path = walk(root, target, P, { lift: .012 + R() * .01, stopR: .05, max: 9 + Math.floor(R() * 5), R, jitter: .3 });
    if (path.length > 2) cards.add(path, .075 + R() * .03, { taper: .75, seed: R(), shade: .85 + R() * .3, root: true });
  }
}

function braid(cards, P, R, start, length, width = .05) {
  const segs = 30, twists = 7;
  for (let k = 0; k < 3; k++) for (const rot of [0, Math.PI / 2]) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, ph = t * twists * Math.PI * 2 + k * Math.PI * 2 / 3;
      const c = V(0, start.y - length * t, start.z - .05 - .12 * Math.sqrt(t));
      pts.push(c.add(V(Math.sin(ph) * width * .55, 0, Math.cos(ph) * width * .3)));
    }
    cards.add(pts, width * .9, { taper: .3, seed: R(), out: (p, f) => V(Math.sin(rot) * 1, 0, -Math.cos(rot)), ao: .8, shade: .9 + R() * .2 });
  }
  const tip = V(0, start.y - length, start.z - .17);
  for (let i = 0; i < 10; i++) cards.add(fall(tip, V((R() - .5) * .4, -1, (R() - .5) * .3), .16, P, { segs: 4, gravity: .4, R }), .03, { taper: .95, seed: R() });
}

function ponytail(cards, P, R, base, len) {
  for (let i = 0; i < 64; i++) {
    const o = V((R() - .5) * .07, (R() - .5) * .05, 0);
    const d = V((R() - .5) * .5, .25 + R() * .3, -1).normalize();
    cards.add(fall(base.clone().add(o), d, len * (.75 + R() * .4), P, { segs: 10, gravity: .55, R, sway: .2 }), .05 + R() * .02, { taper: .85, seed: R(), shade: .8 + R() * .35, out: (p) => V(0, .3, -1).normalize() });
  }
}

function longBack(cards, P, R, count, len) {
  for (const root of scalpRoots(P, count, R, .05, p => p.y < .25)) {
    const n = root.clone().normalize();
    const path = walk(root, V(root.x * 1.2, -.55, -.32), P, { lift: .016, stopR: .08, max: 12, R, jitter: .2 });
    const end = path[path.length - 1];
    const tail = fall(end, V(n.x * .3, -1, -.15), len * (.7 + R() * .4), P, { segs: 9, gravity: .6, R, minR: 1.05 });
    cards.add([...path, ...tail.slice(1)], .06 + R() * .03, { taper: .7, seed: R(), shade: .85 + R() * .3, out: (p) => (p.y > -.5 ? p.clone().normalize() : V(Math.sign(p.x) * .4, 0, -1).normalize()) });
  }
}

// ---------------------------------------------------------------- beard
function beard(cards, P, R, style, len) {
  const goat = style === 'goatee';
  const dirs = fib(7000).filter(d => d.z > .25 && d.y < -.18);
  let made = 0, cap = goat ? 260 : 560;
  for (const d of dirs) {
    if (made > cap) break;
    const p = sculpt(d, P), ax = Math.abs(p.x);
    const mus = p.y > -.262 && p.y < -.205 && ax < .11 && p.z > .3;
    const lip = p.y <= -.262 && p.y > -.345 && ax < .095;
    const chin = p.y <= -.345;
    const jaw = !goat && p.y < -.12 && p.z > -.05 && ax > .1;
    const goatOk = ax < .12;
    if (lip || !(mus || (chin && (goat ? goatOk : true)) || jaw)) continue;
    if (R() > .6) continue;
    made++;
    const n = d.clone(); const nn = sculpt(d.clone().add(V(.01, 0, 0)).normalize(), P).sub(p).cross(sculpt(d.clone().add(V(0, .01, 0)).normalize(), P).sub(p)).normalize();
    if (nn.dot(n) < 0) nn.negate();
    const L = mus ? .07 : chin ? len * (.7 + R() * .5) + .08 : len * .55 + .05;
    const dir = mus ? V(Math.sign(p.x) * .7, -.7, .25) : V(p.x * .3, -1, .35 - (chin ? .2 : 0));
    const start = p.clone().addScaledVector(nn, .004);
    const pts = [start]; let q = start.clone(), dd = nn.clone().multiplyScalar(.6).add(dir).normalize();
    for (let i = 0; i < 5; i++) { dd.lerp(dir.clone().normalize(), .35).add(V((R() - .5) * .2, 0, (R() - .5) * .2)).normalize(); q = q.clone().addScaledVector(dd, L / 5); const s = sculpt(q.clone().normalize(), P); if (q.length() < s.length() + .004 && q.y > -.5) q.copy(s.addScaledVector(nn, .006)); pts.push(q); }
    cards.add(pts, mus ? .035 : .055, { taper: .8, seed: R(), shade: .8 + R() * .35, out: () => nn });
  }
  if (style === 'braided') for (const x of [-.05, .05]) braid(cards, P, R, V(x * 2, -.62, .38), .75, .045);
}

// ---------------------------------------------------------------- brows / lashes
function brows(cards, P, R, f) {
  for (const s of [-1, 1]) for (let i = 0; i < 34; i++) {
    const t = i / 33, x = .055 + .2 * t + (R() - .5) * .01;
    const y = .068 + (f ? .03 : .018) * Math.sin(Math.PI * Math.min(1, t * 1.15)) - .012 * t + (R() - .5) * .012 * (1 - t * .5);
    const d = V(s * x, y, .5).normalize(); let p = sculpt(d, P); for (let k = 0; k < 3; k++) { d.set(s * x, y, p.z).normalize(); p = sculpt(d, P); }
    const n = p.clone().normalize().add(V(0, 0, .6)).normalize();
    const dir = V(s * (.8 + t * .4), t < .7 ? .25 : -.4, .1).normalize();
    const a = p.clone().addScaledVector(n, .003), b = a.clone().addScaledVector(dir, .03 + R() * .015).addScaledVector(n, .003);
    cards.add([a, a.clone().lerp(b, .5).addScaledVector(n, .002), b], (f ? .01 : .014) * (1 - t * .4), { taper: .85, seed: R(), out: () => n, ao: .95, shade: .8 + R() * .4 });
  }
}

function lashes(cards, lash, R) {
  for (const { center, s, edge } of lash) {
    const r = EYE.r * 1.1, pts = [], pts2 = [];
    for (let i = 0; i <= 14; i++) {
      const u = -.6 + 1.2 * i / 14, v = edge(u);
      let p = V(r * Math.sin(u) * Math.cos(v), r * Math.sin(v), r * Math.cos(u) * Math.cos(v));
      p.applyAxisAngle(V(0, 1, 0), s * .12).add(center); pts.push(p);
      const o = p.clone().sub(center).normalize(); pts2.push(p.clone().addScaledVector(o, .016).add(V(s * .004 * u, .009, 0)));
    }
    // a card along the lid margin, strands across its width
    for (let i = 0; i < pts.length - 1; i++) cards.add([pts[i], pts2[i]], .012, { taper: .7, seed: R(), out: (p) => p.clone().sub(center).normalize().add(V(0, 1, 0)).normalize(), ao: 1, shade: .6 });
  }
}

// ---------------------------------------------------------------- cap
function scalpCap(P, recede, quality, flowFn, lift = .007) {
  const res = quality === 'low' ? [48, 36] : [96, 72];
  const s = new SphereGeometry(1, res[0], res[1]); s.deleteAttribute('uv');
  const g = mergeVertices(s, 1e-6), p = g.attributes.position, d = new Vector3();
  const flow = [], info = [], col = [];
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize(); const q = onScalp(d, P, lift); p.setXYZ(i, q.x, q.y, q.z);
    const hl = hairline(q, P, recede), f = flowFn(q);
    flow.push(f.x, f.y, f.z); info.push(.5, hl, .37, 0); const ao = .7 + .2 * Math.min(1, Math.max(0, hl * 6)); col.push(ao, ao, ao);
  }
  // drop triangles fully outside the hairline (keep a soft fringe for alpha)
  const idx = g.index.array, keep = [];
  for (let i = 0; i < idx.length; i += 3) { const a = info[idx[i] * 4 + 1], b = info[idx[i + 1] * 4 + 1], c = info[idx[i + 2] * 4 + 1]; if (Math.max(a, b, c) > -.035) keep.push(idx[i], idx[i + 1], idx[i + 2]); }
  g.setIndex(keep);
  g.setAttribute('flow', new Float32BufferAttribute(flow, 3)); g.setAttribute('hairInfo', new Float32BufferAttribute(info, 4)); g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- entry
// Returns { cap, cards } geometries in normalised units (scale by H outside).
export function buildGroom(key, profile, P, lash, quality = 'high') {
  const R = rng(hashStr(key));
  const hair = profile.hair ?? { style: 'none' }, style = hair.style;
  const recede = profile.sex === 'm' ? Math.max(0, (profile.age - .45) * .12) : 0;
  const dens = quality === 'low' ? .45 : quality === 'medium' ? .7 : 1;
  const cards = new CardSet(), browCards = new CardSet();
  let flowFn = (p) => { const n = p.clone().normalize(); const f = V(0, .3, -1); return f.addScaledVector(n, -f.dot(n)).normalize(); };
  let bun = null;
  if (style !== 'none') {
    if (style === 'bun' || style === 'topknot' || style === 'ponytail' || style === 'long') {
      const b = hair.bun ?? (style === 'topknot' ? [0, .5, -.12] : style === 'ponytail' ? [0, .4, -.3] : [0, .47, -.1]);
      bun = V(...b); const n = bun.clone().normalize(); const sc = onScalp(n, P, 0); bun = sc.addScaledVector(n, style === 'topknot' ? .04 : .07);
      flowFn = (p) => { const n2 = p.clone().normalize(); const f = bun.clone().sub(p); f.addScaledVector(n2, -f.dot(n2)); return f.lengthSq() > 1e-8 ? f.normalize() : V(0, 1, 0); };
      slicked(cards, P, R, bun, Math.round(300 * dens), recede);
      if (style === 'bun') bunAt(cards, P, R, bun, hair.coils ? .13 : .11, Math.round(52 * dens));
      if (style === 'topknot' || style === 'long') { bunAt(cards, P, R, bun, .065, Math.round(26 * dens)); for (let i = 0; i < 9; i++) cards.add(fall(bun.clone().add(V(0, .03, 0)), V((R() - .5) * .5, .5, -1), .16, P, { segs: 5, gravity: .5, R }), .035, { taper: .9, seed: R() }); }
      if (style === 'ponytail') { bunAt(cards, P, R, bun, .05, 10); ponytail(cards, P, R, bun, .85); }
      if (style === 'long') longBack(cards, P, R, Math.round(110 * dens), 1.1);
      if (hair.strands) for (const x of [-1, 1]) flyaways(cards, P, R, V(x * .27, .2, .16), Math.ceil(hair.strands / 2), .34);
    } else if (style === 'braid') {
      bun = onScalp(V(0, .05, -1), P, .05);
      flowFn = (p) => { const n2 = p.clone().normalize(); const f = bun.clone().sub(p); f.addScaledVector(n2, -f.dot(n2)); return f.lengthSq() > 1e-8 ? f.normalize() : V(0, -1, 0); };
      slicked(cards, P, R, bun, Math.round(300 * dens), 0);
      braid(cards, P, R, bun, 1.75, .07);
    } else if (style === 'short') {
      const coils = hair.coils;
      flowFn = (p) => { const n = p.clone().normalize(); const f = V(0, .55, -.6).add(V(0, 0, Math.max(0, p.z) * 1.2)); return f.addScaledVector(n, -f.dot(n)).normalize(); };
      if (coils) shortHair(cards, P, R, Math.round(560 * dens), .045, recede, false);
      else shortHair(cards, P, R, Math.round(420 * dens), .1 * (hair.length ?? .5) + .06, recede);
    } else if (style === 'messy') {
      messyHair(cards, P, R, Math.round(460 * dens));
    } else if (style === 'swept') {
      flowFn = (p) => { const n = p.clone().normalize(); const f = V(0, -.15, -1); return f.addScaledVector(n, -f.dot(n)).normalize(); };
      sweptHair(cards, P, R, Math.round(340 * dens), recede);
    }
  }
  if (profile.beard) beard(cards, P, R, profile.beard.style, profile.beard.length ?? .3);
  brows(browCards, P, R, profile.sex === 'f');
  lashes(browCards, lash, R);
  const cap = style === 'none' ? null : scalpCap(P, recede, quality, flowFn, hair.coils ? .016 : .007);
  return { cap, cards: cards.n ? cards.geometry() : null, brows: browCards.geometry(), bun };
}

// Moss/leaf tufts over a hood surface (Graft Sanctuary).
export function leafTufts(P, key, n = 70) {
  const R = rng(hashStr(key + ':leaf')), cards = new CardSet();
  for (let i = 0; i < n; i++) {
    const phi = .7 + R() * (2 * Math.PI - 1.4), y = .45 - R() * 1.0;
    const d = V(Math.sin(phi), 0, Math.cos(phi)); const base = y > -.35 ? onScalp(V(d.x * Math.sqrt(1 - 4 * y * y), 2 * y, d.z * Math.sqrt(1 - 4 * y * y)), P, .095) : V(d.x * .55, y, d.z * .5);
    const out = base.clone().setY(base.y * .3).normalize();
    for (let k = 0; k < 3; k++) cards.add(fall(base, out.clone().add(V((R() - .5) * .8, .2 + R() * .4, (R() - .5) * .8)), .07 + R() * .06, P, { segs: 3, gravity: .2, R, minR: 0 }), .05 + R() * .03, { taper: .95, seed: R(), shade: .7 + R() * .5 });
  }
  return cards.geometry();
}

export { V, rng, hashStr, CardSet };
