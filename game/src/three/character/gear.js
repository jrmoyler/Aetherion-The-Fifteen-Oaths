// Face and head equipment fitted to the sculpted head. Most pieces are
// parametric patches over the head surface in (azimuth, height) space so
// their silhouettes have clean, designed edges; trims, eye slits, cracks
// and seams are shaded from the patch coordinates.
import { BufferGeometry, Float32BufferAttribute, Vector3, Color, LatheGeometry, Vector2, TorusGeometry, CylinderGeometry, CircleGeometry, SphereGeometry, MeshPhysicalMaterial, DoubleSide } from 'three';
import { sculpt, cranium, EYE } from './head.js';
import { surfaceMaterial } from './surface.js';
import { hairMaterial } from './hair.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const dirOf = (phi, y) => { const cy = Math.max(-1, Math.min(1, 2 * y)), st = Math.sqrt(1 - cy * cy); return V(st * Math.sin(phi), cy, st * Math.cos(phi)); };

// Generic patch: map(s,t) → point; skip(s,t,p) drops quads (eye holes).
function patch(ns, nt, map, skip) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) { const s = i / ns, t = j / nt, p = map(s, t); pos.push(p.x, p.y, p.z); uv.push(s, t); }
  for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
    const a = j * (ns + 1) + i, b = a + ns + 1;
    if (skip) { const p = V(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]); if (skip((i + .5) / ns, (j + .5) / nt, p)) continue; }
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // orient outward (away from the head centre) so single-sided finishes render
  let dot = 0; for (let k = 0; k < idx.length; k += 3) { const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
    const e1 = V(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]), e2 = V(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]);
    dot += e1.cross(e2).dot(V(pos[a], pos[a + 1] + .1, pos[a + 2])); }
  if (dot < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('puv', new Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const surf = (P, phi, y, off, cloth = true, rigid = false) => { const d = dirOf(phi, y); let p = sculpt(d, P, { cloth }); if (cloth && !rigid) { const f = sculpt(d, P); if (f.length() > p.length()) p = f; } return p.addScaledVector(V(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(.35).add(p.clone().normalize()).normalize(), off); };
const crn = (P, phi, y, off) => { const d = dirOf(phi, y), p = cranium(d, P); return p.addScaledVector(p.clone().normalize(), off); };

// Shading on patch coordinates (s across, t down) plus normalised position.
function patchMaterial(mode, params, glsl = '') {
  const m = surfaceMaterial(mode, params);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.uniforms.gTrim = { value: new Color(params.trim ?? '#c8a050') };
    shader.uniforms.gH = { value: params.H ?? 1 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 puv; varying vec2 vPuv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuv=puv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPuv; uniform vec3 gTrim; uniform float gH;')
      .replace('#include <normal_fragment_begin>', `{ vec3 q=vCsP/gH; vec2 st=vPuv; ${glsl} }\n#include <normal_fragment_begin>`);
  };
  m.customProgramCacheKey = () => `gear:${mode}:${glsl.length}`;
  return m;
}

const FINISH = {
  porcelain: (c, H, trim) => ({ mode: 'porcelain', params: { side: DoubleSide, color: c, roughness: .26, clearcoat: .7, clearcoatRoughness: .12, sheen: .2, sheenColor: new Color('#ffffff'), trim, H } }),
  brass: (c, H, trim) => ({ mode: 'brushed', params: { side: DoubleSide, color: c, roughness: .34, metalness: 1, trim, H } }),
  steel: (c, H, trim) => ({ mode: 'brushed', params: { side: DoubleSide, color: c, roughness: .3, metalness: 1, trim, H } }),
  wood: (c, H, trim) => ({ mode: 'wood', params: { side: DoubleSide, color: c, roughness: .62, trim, H } }),
  lacquer: (c, H, trim) => ({ mode: 'lacquer', params: { side: DoubleSide, color: c, roughness: .22, clearcoat: 1, clearcoatRoughness: .08, trim, H } }),
  cloth: (c, H, trim) => ({ mode: 'weave', params: { color: c, roughness: .88, sheen: 1, sheenRoughness: .6, sheenColor: new Color(c).lerp(new Color('#ffffff'), .35), side: DoubleSide, trim, H } }),
};
function mat(finish, color, H, trim, glsl) { const f = FINISH[finish](color, H, trim); return patchMaterial(f.mode, f.params, glsl); }

const EDGE_TRIM = 'float e=min(min(st.x,1.-st.x),min(st.y,1.-st.y)); float tr=smoothstep(.045,.03,e); diffuseColor.rgb=mix(diffuseColor.rgb,gTrim,tr); metalnessFactor=mix(metalnessFactor,1.,tr); roughnessFactor=mix(roughnessFactor,.3,tr);';
const INSIDE_DARK = 'if(!gl_FrontFacing) diffuseColor.rgb*=.35;';
const EYE_SLITS = 'float ex=abs(q.x)-.148; float sl=exp(-pow(ex/.07,2.)-pow((q.y+.0+ex*.18)/.018,2.)); diffuseColor.rgb*=1.-smoothstep(.4,.7,sl)*.95; roughnessFactor=mix(roughnessFactor,1.,sl);';
const CRACKS = 'float cr=1.-smoothstep(.0,.012,abs(csNoise(vec3(q.x*9.,q.y*9.,3.))+ .15*csNoise(q*30.))); cr*=smoothstep(.2,.6,st.x); diffuseColor.rgb*=1.-cr*.6;';
const RIBS = 'float rb=smoothstep(.75,1.,sin(st.y*44.)); csH+=rb*.8; diffuseColor.rgb*=1.-rb*.15;';

// ---------------------------------------------------------------- pieces
function wrap(P, g) {
  const top = g.top ?? -.03;
  const geo = patch(72, 30, (s, t) => {
    const phi = -Math.PI + 2 * Math.PI * s, f = (1 + Math.cos(phi)) / 2;
    const yT = top - .3 * (1 - f) ** 1.5 - .012 * Math.cos(phi * 6) * (1 - f);
    const y = yT + (-.5 - yT) * t ** .9;
    const fold = .005 * Math.sin(phi * 11 + t * 9) * sm(.3, 1, t);
    return surf(P, phi, Math.max(-.499, y), .028 + .01 * f * sm(.2, 1, t) + fold);
  });
  const neck = patch(48, 10, (s, t) => { const phi = -Math.PI + 2 * Math.PI * s, y = -.36 - .34 * t; const r = .2 + .1 * t * t + .012 * Math.sin(phi * 7 + t * 5); return V(Math.sin(phi) * r, y, Math.cos(phi) * r * 1.12 - .03); });
  return g.scarf ? [[geo, g.color, 'cloth', INSIDE_DARK], [neck, g.color, 'cloth', INSIDE_DARK]] : [[geo, g.color, 'cloth', INSIDE_DARK]];
}

function faceplate(P, g, finish) {
  const wood = finish === 'wood';
  const geo = patch(110, 120, (s, t) => {
    const w = 1.22 - .25 * t ** 2, phi = -w + 2 * w * s, y = .34 - .84 * t;
    const p = surf(P, phi, Math.max(-.499, y), .035 + (wood ? .01 : 0), true, true);
    if (wood) { p.z += .02 * Math.exp(-(((y - .1) / .04) ** 2)) * (1 - Math.abs(phi)); p.z += .012 * Math.sin(phi * 9 + y * 14) * (1 - t) * .5; }
    return p;
  }, wood ? (s, t, p) => (Math.abs(Math.abs(p.x) - .145) < .06 && Math.abs(p.y + .005) < .028) : null);
  return [[geo, g.color, finish, (wood ? '' : EYE_SLITS) + INSIDE_DARK]];
}

function halfmask(P, g) {
  const geo = patch(70, 110, (s, t) => { const phi0 = -.04 + .05 * Math.sin(t * 19) + .03 * Math.sin(t * 47); const phi = phi0 + (1.25 - phi0) * s, y = .36 - .86 * t; return surf(P, phi, Math.max(-.499, y), .03, true, true); },
    (s, t, p) => (Math.abs(p.x - .15) < .06 && Math.abs(p.y + .005) < .03));
  return [[geo, g.color, 'porcelain', CRACKS + INSIDE_DARK]];
}

function helm(P, g) {
  const geo = patch(70, 72, (s, t) => {
    const w = 1.32 - .3 * t ** 2, phi = -w + 2 * w * s, y = .42 - .92 * t;
    const p = surf(P, phi, Math.max(-.499, y), .05, true, true);
    p.addScaledVector(V(Math.sin(phi), 0, Math.cos(phi)), .03 * Math.max(0, 1 - Math.abs(phi) / .3) * (1 - .5 * t));
    return p;
  });
  const SLIT = 'float hx=abs(q.x)-.15; float sl=smoothstep(.09,.075,abs(hx))*smoothstep(.022,.014,abs(q.y-.005+hx*.35)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.01),sl); roughnessFactor=mix(roughnessFactor,1.,sl); float rid=smoothstep(.012,.0,abs(q.x))*step(-.2,q.y); diffuseColor.rgb=mix(diffuseColor.rgb,gTrim,rid*.8);';
  return [[geo, g.color, 'lacquer', EDGE_TRIM + SLIT + INSIDE_DARK]];
}

function blademask(P, g) {
  const geo = patch(40, 80, (s, t) => {
    const y = .66 - 1.24 * t, k = 1 - Math.abs(t - .42) / .58, w = .5 * Math.max(.0, k) ** .8;
    const phi = -w + 2 * w * s, r = .5 + .03 * Math.cos(phi * 2);
    const ridge = .07 * Math.max(0, 1 - Math.abs(phi) / Math.max(.05, w)) * Math.max(0, k);
    return V(Math.sin(phi) * r, y, Math.cos(phi) * (r + ridge) - .04);
  });
  const parts = [[geo, g.color, 'porcelain', EDGE_TRIM.replace('.045,.03', '.03,.018') + INSIDE_DARK]];
  parts.push([band(P, .06, .045, .018), '#2a2a2e', 'cloth', '']);
  return parts;
}

function eyemask(P, g) {
  const geo = patch(180, 48, (s, t) => {
    const phi = -1.5 + 3 * s, a = Math.abs(phi);
    const yT = .13 + .16 * sm(.7, 1.5, a), yB = -.085 + .05 * sm(.9, 1.5, a);
    return surf(P, phi, yT + (yB - yT) * t, .02 + .015 * sm(.9, 1.5, a));
  }, (s, t, p) => { const ex = Math.abs(p.x) - .148; return Math.abs(ex) < .058 && Math.abs(p.y - .002 - ex * .12) < .022 * (1 - (ex / .058) ** 2) + .004; });
  return [[geo, g.color, 'porcelain', EDGE_TRIM + INSIDE_DARK]];
}

function plate(P, g) {
  const geo = patch(60, 26, (s, t) => { const phi = -1.55 + 3.1 * s, y = -.045 - .06 * (1 - Math.cos(phi)) + (-.5 + .045) * t; return surf(P, phi, Math.max(-.499, y), .026 + .008 * Math.sin(t * Math.PI * 5) ** 8); });
  return [[geo, g.color, 'brass', RIBS + EDGE_TRIM]];
}

function beak(P, g) {
  const parts = plate(P, { ...g, color: g.color });
  const prof = []; for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push(new Vector2(.085 * (1 - t) ** .8 + .002, t * .52)); }
  const cone = new LatheGeometry(prof, 24); cone.rotateX(Math.PI / 2 + .45); cone.translate(0, -.14, .44);
  addPuv(cone);
  parts.push([cone, g.color, 'brass', RIBS]);
  return parts;
}

function respirator(P, g) {
  const s = g.small ? .8 : 1, parts = [];
  const cup = new CylinderGeometry(.075 * s, .105 * s, .13 * s, 28, 3); cup.rotateX(Math.PI / 2); cup.translate(0, -.3, .47); addPuv(cup); parts.push([cup, g.color, 'brass', RIBS]);
  const grill = new CylinderGeometry(.068 * s, .068 * s, .02, 28); grill.rotateX(Math.PI / 2); grill.translate(0, -.3, .54); addPuv(grill); parts.push([grill, '#2a2620', 'steel', 'float gr=smoothstep(.6,1.,sin(q.x*260.)); diffuseColor.rgb*=1.-gr*.7;']);
  for (const x of [-1, 1]) { const c = new CylinderGeometry(.05 * s, .05 * s, .11 * s, 20); c.rotateZ(Math.PI / 2); c.rotateY(x * -.6); c.translate(x * .19 * s, -.33, .38); addPuv(c); parts.push([c, g.color, 'brass', RIBS]); }
  const seal = patch(48, 14, (u, t) => { const phi = -1.2 + 2.4 * u, y = -.13 - .3 * t; return surf(P, phi, y, .02); });
  parts.push([seal, '#2a2420', 'cloth', '']);
  parts.push([band(P, -.2, .05, .02), '#3a2e22', 'cloth', '']);
  return parts;
}

function cap(P, g) {
  const geo = patch(64, 22, (s, t) => { const phi = -Math.PI + 2 * Math.PI * s, f = (1 + Math.cos(phi)) / 2; const yE = .2 * f + -.18 * (1 - f) ** 1.4 + .02; const y = .5 - (.5 - yE) * t; return y > .499 ? V(0, .5 + .02, -.02) : crn(P, phi, y, .02); });
  return [[geo, g.color, 'cloth', INSIDE_DARK]];
}

function hood(P, g) {
  const deep = g.deep, parts = [];
  const open = (y) => (y > .36 ? 0 : (deep ? .6 : .72) * sm(.36, .2, y) * (y < -.42 ? Math.max(.5, 1 - (-.42 - y) * 1.6) : 1));
  const geo = patch(72, 44, (s, t) => {
    const y = .56 - 1.62 * t;
    const w = open(Math.min(.5, y)), phi = w + (2 * Math.PI - 2 * w) * s;
    const edge = Math.min(s, 1 - s);
    const brim = (deep ? .08 : .04) * sm(.08, 0, edge) * sm(.4, .1, y);
    if (y > -.35) {
      const off = .07 + .03 * sm(.0, -.35, y) + brim;
      if (y > .495) return V(0, .52 + .075, -.06);
      const p = crn(P, phi, y, off); p.z += brim * .6; return p;
    }
    const k = sm(-.35, -1.06, y), base = crn(P, phi, -.35, .1);
    const r = Math.hypot(base.x, base.z) + .38 * k, a = Math.atan2(base.x, base.z);
    const fold = .02 * Math.sin(phi * 9) * k;
    return V(Math.sin(a) * (r + fold), y, Math.cos(a) * (r + fold) * .95 - .06 * k);
  });
  parts.push([geo, g.color, 'cloth', INSIDE_DARK]);
  if (g.leafy) parts.push(['leaves', g.color]);
  return parts;
}

function band(P, y, width, off) {
  return patch(72, 3, (s, t) => { const phi = -Math.PI + 2 * Math.PI * s; return crn(P, phi, y + width / 2 - width * t, off); });
}

function goggles(P, g) {
  const parts = [];
  for (const x of [-1, 1]) {
    const ring = new TorusGeometry(.062, .016, 10, 28); ring.translate(x * EYE.x, EYE.y + .005, .43); addPuv(ring); parts.push([ring, g.color, 'brass', '']);
    const lens = new CircleGeometry(.058, 28); lens.translate(x * EYE.x, EYE.y + .005, .435); addPuv(lens); parts.push([lens, g.lens ?? '#9ab', 'glass', '']);
  }
  parts.push([band(P, .03, .04, .03), '#3a2e22', 'cloth', '']);
  return parts;
}

function visor(P, g) {
  const frame = patch(70, 10, (s, t) => { const phi = -1.75 + 3.5 * s; return surf(P, phi, .13 - .21 * t, .045); });
  const lens = patch(50, 6, (s, t) => { const phi = -1.15 + 2.3 * s; return surf(P, phi, .085 - .12 * t, .056); });
  return [[frame, g.color, 'steel', EDGE_TRIM], [lens, g.lens ?? '#dde', 'glass', ''], [band(P, .04, .05, .03), '#2a2a2e', 'cloth', '']];
}

function glasses(P, g) {
  const parts = [];
  for (const x of [-1, 1]) { const r = new TorusGeometry(.056, .005, 6, 28); r.translate(x * EYE.x, EYE.y, .45); addPuv(r); parts.push([r, g.color, 'brass', '']); const l = new CircleGeometry(.054, 24); l.translate(x * EYE.x, EYE.y, .45); addPuv(l); parts.push([l, '#cfe0e6', 'glass', '']); }
  const br = new CylinderGeometry(.004, .004, .07, 6); br.rotateZ(Math.PI / 2); br.translate(0, .01, .455); addPuv(br); parts.push([br, g.color, 'brass', '']);
  return parts;
}

function earrings(P, g) {
  const parts = [];
  for (const x of [-1, 1]) { const r = new TorusGeometry(.035, .006, 8, 24); r.rotateY(Math.PI / 2); r.translate(x * .34 * P.build, -.16, -.05); addPuv(r); parts.push([r, g.color, 'brass', '']); }
  return parts;
}

function addPuv(geo) { const n = geo.attributes.position.count, a = new Float32Array(n * 2).fill(.5); geo.setAttribute('puv', new Float32BufferAttribute(a, 2)); for (const k of ['uv']) geo.deleteAttribute(k); return geo; }

const BUILDERS = { wrap, faceplate: (P, g) => faceplate(P, g, g.finish ?? 'porcelain'), halfmask, helm, blademask, eyemask, plate, beak, respirator, cap, hood, goggles, visor, glasses, earrings };

// Returns [{ geo, material }] in normalised units plus leaf card requests.
export function buildGear(profile, P, H, quality) {
  const out = [];
  for (const g of profile.gear ?? []) {
    const fn = BUILDERS[g.type]; if (!fn) continue;
    for (const part of fn(P, g)) {
      if (part[0] === 'leaves') { out.push({ leaves: true, color: '#55692c' }); continue; }
      const [geo, color, finish, glsl] = part;
      let material;
      if (finish === 'glass') material = new MeshPhysicalMaterial({ color, roughness: .05, metalness: .1, clearcoat: 1, transmission: 0, transparent: true, opacity: .72, envMapIntensity: 1.6 });
      else material = mat(finish, color, H, g.trim ?? '#c8a050', glsl ?? '');
      material.name = `gear-${g.type}`;
      out.push({ geo, material, type: g.type });
    }
  }
  return out;
}

// Which areas gear hides (so hair/brows/lashes and face skin can be culled).
export function gearCoverage(profile) {
  const t = new Set((profile.gear ?? []).map(g => g.type));
  return {
    hood: t.has('hood') || t.has('cap'),
    eyes: t.has('faceplate') || t.has('helm') || t.has('blademask'),
    lower: t.has('wrap') || t.has('plate') || t.has('beak') || t.has('respirator') || t.has('faceplate') || t.has('helm') || t.has('blademask'),
  };
}

export { hairMaterial };
