// Procedural sculpted head. The face is an analytic form evaluated on a dense
// sphere: superelliptic cranium, tapered jaw, then anatomical landmarks
// (brow ridge, orbital sockets, nasal bridge/tip/alae, cheekbones, philtrum,
// lips, mentalis, mandible angle). Eyes are real spheres behind almond lid
// shells, so the aperture, lid thickness and lash line exist as geometry.
// Normalised units: chin -.5 .. crown +.5, +Z forward; built at scale H metres.
import { BufferGeometry, Float32BufferAttribute, SphereGeometry, CylinderGeometry, Vector3, Group, Mesh, Color } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceMaterial, withSurface } from './surface.js';
import { MeshPhysicalMaterial, DoubleSide, Vector4 } from 'three';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x, y) => Math.exp(-x * x - y * y);

export const EYE = { x: .148, y: -.005, r: .05 };
// Sheet heroes: a wider aperture over a flatter eye surface, so the iris, the whites and the lid line all read.
export const EYE_SHEET_R = .078;

function baseFaceParams(profile) {
  const f = profile.sex === 'f', age = profile.age ?? .3, build = profile.build ?? 1;
  return {
    build, age, f,
    jaw: f ? .66 : .74, brow: f ? .45 : 1, nose: f ? .85 : 1, lip: f ? 1.15 : .9, chin: f ? .7 : 1,
    cheek: f ? 1.1 : .9, sag: age, noseWidth: 1, depth: 1,
    // fat: full cheeks, jowls and a soft chin; gaunt: hollow cheeks and temples; bridge: hump on the nasal bone;
    // tip: bulb of the nose; mouthW: width of the lips; eyeX: half the distance between the eyes; longFace: stretch of the lower face.
    fat: 0, gaunt: 0, bridge: 0, tip: 0, mouthW: 1, eyeX: EYE.x, ...profile.face,
  };
}

// Sheet heroes are seen at full-body distance next to painted faces: their relief is pushed further so brow,
// nose, cheekbone and chin still read there.
export function faceParams(profile) {
  const P = baseFaceParams(profile);
  if (!profile.sheet) return P;
  return { ...P, brow: P.brow, nose: P.nose * 1.02, noseWidth: P.noseWidth * .76, cheek: P.cheek * 1.12, chin: P.chin * 1.1, jaw: Math.min(.9, P.jaw * (P.f ? 1 : 1.04)), mouthW: (P.mouthW ?? 1) * 1.14, sheetNose: true };
}

// Surface point for unit direction d. `opts.cloth` smooths fine features so
// masks and wraps drape over them instead of shrink-wrapping lips and sockets.
export function sculpt(d, P, opts = {}) {
  const vy = Math.max(-1, Math.min(1, d.y)), m = vy > 0 ? (P.sheetNose ? 2.55 : 2.12) : 2.25, c = Math.max(0, 1 - Math.abs(vy) ** m) ** (1 / m);
  let hx = d.x, hz = d.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
  const n = P.sheetNose ? 2 : 2.08, ex = 2 / n;   // exponent 1 on sheet heads: no cusp down the midline of a dense mesh
  const sx = Math.sign(hx) * Math.abs(hx) ** ex, sz = Math.sign(hz) * Math.abs(hz) ** ex;
  const y = .5 * vy;
  const fat = P.fat ?? 0, gaunt = P.gaunt ?? 0, mw = P.mouthW ?? 1, eyeX = P.eyeX ?? EYE.x;
  const rx = .338 * P.build * (1 - (1 - P.jaw) * .85 * sm(-.16, -.5, y) * (1 - .35 * fat)) * (1 - .04 * sm(.15, .42, y)) * (1 + .07 * fat * g2((y + .26) / .16, 0));
  const rzf = (.4 - .03 * sm(.2, .48, y)) * P.depth;
  const rzb = .44 + .025 * g2((y - .06) / .16, 0) - .2 * sm(-.04, -.45, y);
  let X = c * sx * rx;
  let Z = c * sz * (sz > 0 ? rzf : rzb) + .06 * sm(.04, -.45, y) - .03;
  let Y = y;
  const fr = sm(-.05, .55, sz) * (opts.noFace ? 0 : 1);
  if (fr > 0 && P.sheetNose && !opts.cloth) { const [dx, dz] = sheetFace(X, Y, P, opts); X += dx * fr; Z += dz * fr; }
  else if (fr > 0) {
    const ax = Math.abs(X), sgn = Math.sign(X) || 1, cl = opts.cloth ? 1 : 0;
    let dz = 0, dx = 0;
    // forehead slopes back; brow ridge; temples
    dz -= .025 * sm(.16, .46, Y);
    dz += (.03 + .02 * P.brow) * g2((Y - .075) / .036, 0) * sm(.34, .14, ax) * (1 - cl * .6);
    dx += sgn * .012 * g2((Y - .07) / .05, (ax - .3) / .05);
    dz += .012 * g2((Y - .1) / .03, ax / .06) * (1 - P.f * .5);
    // orbital sockets (shallow under cloth)
    dz -= (opts.noSocket ? 0 : cl ? .008 : .019) * g2((ax - eyeX) / .092, (Y - EYE.y - .012) / .062);
    // nose
    const yb = .05, yt = -.185;
    let A = 0;
    if (Y <= yb && Y >= yt) A = .01 + .1 * ((yb - Y) / (yb - yt)) ** 1.6;
    else if (Y < yt) A = .11 * Math.exp(-(((Y - yt) / .03) ** 2));
    const W = ((P.sheetNose ? .026 : .038) + (P.sheetNose ? .058 : .048) * Math.min(1, Math.max(0, (yb - Y) / (yb - yt))) ** (P.sheetNose ? 1.5 : 1)) * P.noseWidth;
    dz += A * P.nose * Math.exp(-((X / (W * (cl ? 1.9 : 1))) ** 2)) * (cl ? 1.05 : 1);
    dz -= (cl ? 0 : .016) * g2(X / .06, (Y - .05) / .03);
    dz += .022 * g2(X / .04, (Y + .17) / .035) * (1 - cl);
    dz += (.014 * (P.bridge ?? 0) * g2(X / .03, (Y + .035) / .045) + .014 * (P.tip ?? 0) * g2(X / (.045 * P.noseWidth), (Y + .185) / .035)) * (1 - cl);
    if (!cl) { const ala = g2((ax - .062 * P.noseWidth) / .03, (Y + .2) / .03); dz += .036 * ala; dx += sgn * .012 * ala; dz -= .02 * g2((ax - .03) / .015, (Y + .222) / .012); }
    // cheekbones and the hollow below them
    const ck = g2((ax - .21) / .075, (Y + .03) / .06); dz += .03 * P.cheek * ck; dx += sgn * .022 * ck;
    dz -= .014 * (.35 + P.sag + 1.6 * gaunt - fat) * g2((ax - .2) / .06, (Y + .2) / .07) * (1 - cl);
    dx -= sgn * .014 * gaunt * (g2((ax - .22) / .06, (Y + .2) / .08) + g2((ax - .3) / .05, (Y - .13) / .06));
    // full cheeks, jowls and the soft pad under the chin
    dz += fat * (.022 * g2((ax - .16) / .1, (Y + .2) / .1) + .03 * g2(X / .16, (Y + .47) / .05)); dx += sgn * fat * .02 * g2((ax - .2) / .08, (Y + .3) / .1);
    // muzzle, lips, mouth line
    dz += .042 * g2(X / .16, (Y + .29) / .12);
    if (!cl) {
      dz += .009 * g2(X / .022, (Y + .255) / .025);
      dz += .03 * P.lip * Math.exp(-((X / (.088 * mw)) ** 4)) * Math.exp(-(((Y + .274) / .021) ** 2));
      dz += .033 * P.lip * Math.exp(-((X / (.078 * mw)) ** 4)) * Math.exp(-(((Y + .322) / .023) ** 2));
      dz -= .022 * Math.exp(-((X / (.098 * mw)) ** 4)) * Math.exp(-(((Y + .298) / .0075) ** 2));
      dz -= .012 * g2((ax - .1 * mw) / .015, (Y + .3) / .015);
      // nasolabial fold deepens with age
      dz -= .018 * P.sag * g2((ax - .11 - (Y + .17) * -.25) / .012, (Y + .2) / .08);
    }
    // Age-related infraorbital fold and jowl volume are geometry, not painted lines.
    if (!cl) { dz -= .012 * P.sag * g2((ax-.15)/.09,(Y+.072)/.016);
      dx += sgn * .022 * P.sag * g2((ax-.20)/.06,(Y+.31)/.08); }
    // chin and mandible
    dz += .046 * P.chin * g2(X / (.09 + .025 * P.chin), (Y + .42) / .06);
    dx += sgn * (.022 - P.f * .012) * g2((Y + .33) / .07, 0) * sm(.35, .05, sz);
    X += dx * fr; Z += dz * fr;
  }
  return new Vector3(X, Y, Z);
}

// The face of a sheet hero: every form is a smooth blended field (no planes, no ramps with corners), so the
// surface has continuous curvature and takes smooth normals: brow flowing into the nasal bridge, deep sockets,
// a rounded nose with bulb, wings and nostrils, philtrum, lips with a cupid's bow, cheeks, folds, chin.
const gx = (x, s) => Math.exp(-((x / s) ** 2));
function sheetFace(X, Y, P, opts) {
  const ax = Math.abs(X), sgn = Math.sign(X) || 1, fat = P.fat ?? 0, gaunt = P.gaunt ?? 0, mw = P.mouthW ?? 1, nw = P.noseWidth, eyeX = P.eyeX ?? EYE.x, sag = P.sag ?? .3, old = sm(.45, .95, sag);
  let dz = 0, dx = 0;
  // forehead rolls back; the brow ridge arches over each eye and meets the nose at the glabella
  dz -= .024 * sm(.14, .46, Y);
  const browAmp = (P.f ? .012 : .02) * P.brow;
  dz += browAmp * gx(Y - (.07 + .012 * gx(ax - .17, .1)), .034) * sm(.34, .16, ax) + .008 * P.brow * g2(X / .05, (Y - .075) / .04);
  dx += sgn * .01 * g2((Y - .07) / .05, (ax - .3) / .05);
  // orbit: deep under the brow, deepest at the inner corner, a soft roll of lower lid and cheek below it
  if (!opts.noSocket) dz -= .03 * g2((ax - eyeX) / .08, (Y + .002) / .05) + .016 * g2((ax - .078) / .034, (Y - .012) / .04) + .008 * gaunt * g2((ax - eyeX) / .1, (Y + .04) / .05);
  dz += .007 * g2((ax - eyeX) / .07, (Y + .068) / .022) - .006 * old * g2((ax - eyeX * .92) / .07, (Y + .092) / .014);
  // nose: a rounded ridge from the nasion to the tip, the bulb, the wings and the nostrils under them
  const t = sm(.06, -.175, Y), ridge = (.014 + .086 * t ** 1.15) * P.nose * sm(-.235, -.19, Y) * sm(.12, .03, Y);
  dz += ridge * Math.exp(-((ax / ((.021 + .016 * t) * (.6 + .4 * nw))) ** 2.2));
  dz += .012 * (P.bridge ?? 0) * g2(X / .028, (Y + .04) / .045);
  dz += (.046 + .014 * (P.tip ?? 0)) * P.nose * g2(X / (.042 * nw), (Y + .176) / .036);
  const wing = g2((ax - .054 * nw) / .024, (Y + .192) / .026); dz += .03 * wing; dx += sgn * .008 * wing;
  dz -= .014 * g2((ax - .028 * nw) / .014, (Y + .218) / .01) + .012 * g2((ax - .085 * nw) / .014, (Y + .185) / .03);
  // cheekbone, the apple of the cheek, the hollow under it
  const bone = g2((ax - .2) / .08, (Y + .035) / .06); dz += .022 * P.cheek * bone; dx += sgn * .018 * P.cheek * bone;
  dz += (.014 * P.cheek + .02 * fat - .008 * gaunt) * g2((ax - .135) / .075, (Y + .13) / .075);
  dz -= .013 * (.3 + .6 * sag + 2 * gaunt - fat) * g2((ax - .21) / .065, (Y + .24) / .08);
  dx -= sgn * .016 * gaunt * (g2((ax - .22) / .06, (Y + .2) / .08) + g2((ax - .3) / .05, (Y - .13) / .06));
  dx += sgn * fat * .022 * g2((ax - .2) / .08, (Y + .3) / .1); dz += fat * .03 * g2(X / .16, (Y + .47) / .05);
  // the fold from the wing of the nose round the mouth, the jowl beside the chin
  const fold = gx(ax - (.08 * nw + (-.2 - Y) * .38), .013) * sm(-.36, -.31, Y) * sm(-.185, -.215, Y);
  dz -= (.004 + .013 * old + .006 * fat) * fold; dz += .006 * old * gx(ax - (.115 * nw + (-.2 - Y) * .38), .03) * sm(-.36, -.3, Y) * sm(-.19, -.23, Y);
  dx += sgn * .02 * old * g2((ax - .2) / .06, (Y + .33) / .07); dz -= .008 * old * gx(ax - (.11 * mw + (-.31 - Y) * .25), .012) * sm(-.44, -.39, Y) * sm(-.3, -.33, Y);
  // muzzle, philtrum, lips (cupid's bow, tubercle, fuller lower lip), the line between them, the corners
  dz += .03 * g2(X / .15, (Y + .29) / .11);
  dz -= .006 * g2(X / .011, (Y + .247) / .018); dz += .004 * g2((ax - .02) / .009, (Y + .25) / .02);
  const L = P.lip, bow = -.272 - .007 * gx(X, .018) + .01 * (ax / (.1 * mw)) ** 2;
  dz += .024 * L * Math.exp(-((X / (.094 * mw)) ** 4)) * gx(Y - bow, .013 + .005 * L) + .007 * L * g2(X / .026, (Y + .283) / .011);
  dz += .03 * L * Math.exp(-((X / (.08 * mw)) ** 4)) * gx(Y + .324, .017 + .006 * L);
  dz -= .02 * Math.exp(-((X / (.102 * mw)) ** 4)) * gx(Y + .3 + .006 * (ax / (.1 * mw)) ** 2, .0065) + .012 * g2((ax - .104 * mw) / .014, (Y + .304) / .014);
  dz -= .012 * g2(X / .07, (Y + .372) / .02);
  // chin and the line of the jaw
  dz += .042 * P.chin * g2(X / (.085 + .022 * P.chin), (Y + .435) / .055);
  dx += sgn * (.02 - (P.f ? .012 : 0)) * gx(Y + .33, .07) * sm(.3, .12, ax) * 0;
  return [dx, dz];
}

// Unit direction → cranium surface used to root hair and fit hoods (no face).
export function cranium(d, P) { return sculpt(d, P, { noFace: true }); }

function sphereDirs(ws, hs) {
  const s = new SphereGeometry(1, ws, hs, Math.PI / 2, Math.PI * 2);
  return s;
}

function displace(geo, fn) {
  const p = geo.attributes.position, v = new Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const q = fn(v); p.setXYZ(i, q.x, q.y, q.z); }
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-6); merged.computeVertexNormals(); return merged;
}

// Region tint for skin, evaluated in the same normalised space (pos / H).
const SKIN_GLSL = /* glsl */`
  vec3 q=vCsP/csH0; q-=csO;
  float ax=abs(q.x);
  float lips=exp(-pow(q.x/.09,4.))*exp(-pow((q.y+.298)/.042,2.))*smoothstep(.2,.36,q.z);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.05,.66,.66),lips*csLip);
  roughnessFactor=mix(roughnessFactor,.36,lips*.7);
  float cheek=exp(-pow((ax-.19)/.08,2.)-pow((q.y+.09)/.08,2.))*smoothstep(.1,.3,q.z);
  diffuseColor.rgb*=mix(vec3(1.),vec3(1.04,.93,.92),cheek*.6);
  float lid=exp(-pow((ax-.148)/.07,2.)-pow((q.y-.04)/.04,2.))*smoothstep(.2,.34,q.z);
  diffuseColor.rgb*=mix(vec3(1.),vec3(.86,.8,.82),lid*.8);
  float under=exp(-pow((ax-.15)/.06,2.)-pow((q.y+.06)/.025,2.));
  diffuseColor.rgb*=1.-under*.1*(.3+csAge);
  float tzone=exp(-pow(q.x/.05,2.))*smoothstep(-.18,.3,q.y)*smoothstep(.3,.42,q.z);
  roughnessFactor-=tzone*.12;
  float stub=csStubble*smoothstep(-.13,-.2,q.y)*smoothstep(.0,.15,q.z)*(1.-lips);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.6,.62),stub*(.55+.45*csNoise(vCsP*2400.)));
  float wr=smoothstep(.4,.85,csAge)*smoothstep(.16,.3,q.y)*smoothstep(.42,.3,q.y)*smoothstep(.15,.3,q.z);
  float lines=smoothstep(.6,1.,sin(q.y*120.+csNoise(vCsP*40.)*3.))*smoothstep(-.2,.4,csNoise(vec3(q.x*14.,q.y*3.,5.)));
  csH-=wr*lines*.8; diffuseColor.rgb*=1.-wr*lines*.03;
  float crow=smoothstep(.4,.85,csAge)*exp(-pow((ax-.29)/.03,2.)-pow((q.y-.0)/.05,2.))*smoothstep(.75,1.,sin(atan(q.y,ax-.22)*28.));
  float nostril=exp(-pow((ax-.032)/.014,2.)-pow((q.y+.222)/.01,2.));
  diffuseColor.rgb*=1.-nostril*.65;
  float mouth=exp(-pow(q.x/.1,4.))*exp(-pow((q.y+.298)/.006,2.))*smoothstep(.25,.38,q.z);
  diffuseColor.rgb*=1.-mouth*.55;
  // painted brow base under the brow cards
  float bt=clamp((ax-.05)/.21,0.,1.);
  float by=.068+csBrowArch*sin(3.14159*min(1.,bt*1.15))-.012*bt;
  float brow=smoothstep(.0,.25,bt)*smoothstep(1.05,.85,bt)*exp(-pow((q.y-by)/(.012*(1.-bt*.4)),2.))*smoothstep(.25,.35,q.z);
  brow*=.55+.45*(csNoise(vec3(q.x*420.,q.y*60.,2.))*.5+.5);
  diffuseColor.rgb=mix(diffuseColor.rgb,csBrow,brow*.75);
  // cavity occlusion: inner canthus, alar crease, mouth corners, under lower lip, ear bowl
  float cav=exp(-pow((ax-.075)/.02,2.)-pow((q.y-.0)/.02,2.))*.5
    +exp(-pow((ax-.08)/.012,2.)-pow((q.y+.2)/.025,2.))*.45
    +exp(-pow((ax-.105)/.012,2.)-pow((q.y+.3)/.012,2.))*.4
    +exp(-pow(q.x/.06,2.)-pow((q.y+.36)/.012,2.))*.25
    +smoothstep(.3,.34,ax)*smoothstep(-.06,-.1,q.z)*.3;
  diffuseColor.rgb*=1.-clamp(cav,0.,.6);
`;
// Extra painted shading for sheet heroes: the face panel's read at a distance (shadowed sockets, strong brows,
// lash line, nose and lip modelling, cheek contour, shadow under the chin) and uneven, living skin tone.
export const SHEET_SKIN_LEVEL = .58;
const SHEET_SKIN_GLSL = /* glsl */`
  vec3 q=vCsP/csH0; q-=csO;
  float ax=abs(q.x), front=smoothstep(.14,.3,q.z), ageK=smoothstep(.35,.9,csAge);
  float tone=csFbm(vCsP*30.)*.5+.5, mottle=csFbm(vCsP*90.+4.);
  vec3 skin0=diffuseColor.rgb;
  diffuseColor.rgb*=.88+tone*.12+mottle*.05*(1.+ageK);
  // --- eyes: socket shade, lash lines, lid crease, the bag below ---
  float ex=ax-csEye.x, ey=q.y+.005-ex*csEye.w;
  float en=length(vec2(ex/csEye.y,ey/(csEye.z*(1.-.35*pow(abs(ex/csEye.y),3.)))));
  float socket=exp(-csP2(ex/(csEye.y*1.75))-csP2((ey-.014)/.052))*front;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*csShadowC,socket*csMake.y*.75);
  float upper=smoothstep(.96,1.04,en)*smoothstep(1.5,1.1,en)*smoothstep(-.004,.004,ey)*front;
  float wing=exp(-csP2((ex-csEye.y*1.12)/.012)-csP2((ey-.004)/.006))*front;
  diffuseColor.rgb*=1.-clamp(upper+wing,0.,1.)*csMake.x;
  float lower=smoothstep(.96,1.02,en)*smoothstep(1.32,1.08,en)*smoothstep(.004,-.004,ey)*front;
  diffuseColor.rgb*=1.-lower*(.22+csMake.x*.25);
  float crease=exp(-csP2((en-(1.75-csBrowP.z*.0))/.09))*smoothstep(.0,.012,ey)*smoothstep(1.5,.6,abs(ex)/csEye.y)*front;
  diffuseColor.rgb*=1.-crease*.3*csCrease;
  float bag=exp(-csP2((ey+csEye.z*2.5+.008*csP2(ex/csEye.y))/.007))*smoothstep(1.3,.5,abs(ex)/csEye.y)*front;
  diffuseColor.rgb*=1.-bag*(.08+.3*ageK); csH-=bag*ageK*.6;
  float hollow=exp(-csP2(ex/(csEye.y*1.1))-csP2((ey+.045)/.022))*front;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.8,.72,.78),hollow*(.25+.5*ageK+csSkinP.z*.0));
  // --- brows: hairs along an arch ---
  float bt=clamp((ax-.045)/csBrowP.w,0.,1.2);
  float by=csFace.x+csBrowP.y*sin(3.14159*min(1.,bt*1.1))+csBrowP.z*(bt-.4);
  float bth=csBrowP.x*1.7*(1.-bt*.5);
  float hairs=.5+.5*csNoise(vec3(q.x*150.+q.y*90.,q.y*60.,2.));
  float brow=smoothstep(-.03,.12,bt)*smoothstep(1.08,.8,bt)*smoothstep(1.25,.5,abs(q.y-by)/bth+(1.-hairs)*.6)*front;
  diffuseColor.rgb=mix(diffuseColor.rgb,csBrow,brow*.96);
  // --- nose ---
  float nw=csFace.y;
  float noseSide=exp(-csP2((ax-.044*nw)/.022))*smoothstep(-.215,-.16,q.y)*smoothstep(.07,-.02,q.y)*smoothstep(.28,.38,q.z);
  diffuseColor.rgb*=1.-noseSide*.16;
    float underNose=exp(-csP2(q.x/(.062*nw))-csP2((q.y+.238)/.014))*front;
  diffuseColor.rgb*=1.-underNose*.42;
  float nostril=exp(-csP2((ax-.032*nw)/.014)-csP2((q.y+.222)/.01));
  diffuseColor.rgb*=1.-nostril*.7;
  float alar=exp(-csP2((ax-.075*nw)/.01)-csP2((q.y+.2)/.022))*front;
  diffuseColor.rgb*=1.-alar*.3;
  // --- lips ---
  float mw=csFace.z;
  float lipsU=exp(-csP4(q.x/(.088*mw)))*exp(-csP2((q.y+.276)/(.017*csLipP.x)))*smoothstep(.2,.36,q.z);
  float lipsL=exp(-csP4(q.x/(.076*mw)))*exp(-csP2((q.y+.322)/(.02*csLipP.x)))*smoothstep(.2,.36,q.z);
  float lips=clamp(lipsU+lipsL,0.,1.);
  diffuseColor.rgb=mix(diffuseColor.rgb,csLipC*(lipsU>lipsL?.82:1.),lips*csFace.w);
  roughnessFactor=mix(roughnessFactor,mix(.45,.2,csMake.w),lips*.8);
  float mouth=exp(-csP4(q.x/(.1*mw)))*exp(-csP2((q.y+.298+.006*csP2(q.x/(.1*mw)))/.0075))*smoothstep(.25,.38,q.z);
  diffuseColor.rgb*=1.-mouth*.82;
  float corner=exp(-csP2((ax-.1*mw)/.012)-csP2((q.y+.3)/.012))*front;
  diffuseColor.rgb*=1.-corner*.35;
  float underLip=exp(-csP2(q.x/.075)-csP2((q.y+.356)/.014))*front;
  diffuseColor.rgb*=1.-underLip*.32;
  float philtrum=exp(-csP2(q.x/.012))*smoothstep(-.262,-.25,q.y)*smoothstep(-.235,-.245,q.y)*front;
  diffuseColor.rgb*=1.-philtrum*.14;
  // --- planes of the face ---
  float contour=exp(-csP2((ax-.24)/.06)-csP2((q.y+.2)/.11))*smoothstep(-.05,.2,q.z);
  diffuseColor.rgb*=1.-contour*(.3+.25*csGaunt);
  float flush=exp(-csP2((ax-.17)/.07)-csP2((q.y+.1)/.06))*front+exp(-csP2(q.x/.05)-csP2((q.y+.17)/.05))*front*.7;
  diffuseColor.rgb*=mix(vec3(1.),vec3(1.1,.88,.84),clamp(flush,0.,1.)*csMake.z);
  float sidePlane=smoothstep(.2,.31,ax)*smoothstep(.36,.12,q.z)*smoothstep(-.5,-.1,q.y)*smoothstep(.3,.05,q.y);
  diffuseColor.rgb*=1.-sidePlane*.22;
  float underBrow=exp(-csP2((q.y-(by-bth*1.6-.012))/.014))*smoothstep(.04,.1,ax)*smoothstep(.27,.2,ax)*front;
  diffuseColor.rgb*=1.-underBrow*.1;
  float temple=exp(-csP2((ax-.3)/.05)-csP2((q.y-.12)/.07));
  diffuseColor.rgb*=1.-temple*.12*(1.+csGaunt);
  float chinShadow=smoothstep(-.4,-.54,q.y)*smoothstep(-.1,.2,q.z);
  diffuseColor.rgb*=1.-chinShadow*.45;
  diffuseColor.rgb*=1.-smoothstep(-.5,-.62,q.y)*.3;
  float ear=smoothstep(.3,.34,ax)*smoothstep(-.06,-.1,q.z);
  diffuseColor.rgb*=mix(vec3(1.),vec3(.92,.7,.66),ear*.6);
  // --- freckles and age spots ---
  float fmask=(exp(-csP2((q.y+.07)/.1))*smoothstep(.36,.1,ax)+.35*smoothstep(.05,.3,q.y))*front;
  float freck=smoothstep(.56,.74,csNoise(vCsP*560.+7.))*smoothstep(.2,.6,csFbm(vCsP*70.)*.5+.5);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.5,.44),freck*fmask*csSkinP.x);
  float spots=smoothstep(.62,.8,csFbm(vCsP*150.+11.)*.5+.5)*(1.-lips);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.7,.6,.55),spots*csSkinP.z);
  // --- lines of age: forehead, frown, crow's feet, nose to mouth, mouth to chin, upper lip ---
  float fl=smoothstep(.8,1.,sin(q.y*95.+csNoise(vec3(q.x*5.,q.y*3.,3.))*2.2))*smoothstep(-.3,.5,csNoise(vec3(q.x*11.,q.y*40.,9.)))*smoothstep(.11,.16,q.y)*smoothstep(.36,.26,q.y)*smoothstep(.3,.18,ax)*front;
  float frown=exp(-csP2((ax-.028)/.006))*smoothstep(.04,.07,q.y)*smoothstep(.13,.1,q.y)*front;
  float crow=exp(-csP2((ex-csEye.y*1.5)/.03)-csP2(ey/.045))*smoothstep(.55,1.,sin(atan(ey,max(.001,ex-csEye.y*.6))*13.))*smoothstep(.0,.2,q.z);
  float nl=exp(-csP2((ax-(.085*nw+(-.2-q.y)*.42))/.008))*smoothstep(-.36,-.3,q.y)*smoothstep(-.19,-.21,q.y)*front;
  float mar=exp(-csP2((ax-(.105*mw+(-.31-q.y)*.25))/.007))*smoothstep(-.43,-.38,q.y)*smoothstep(-.3,-.32,q.y)*front;
  float lipLines=smoothstep(.5,1.,sin(q.x*520.))*exp(-csP2((q.y+.255)/.014))*smoothstep(.09,.05,ax)*front;
  float cheekLines=smoothstep(.6,1.,sin((q.y*.6+ax)*170.+csNoise(vCsP*50.)*2.))*exp(-csP2((ax-.24)/.05)-csP2((q.y+.16)/.1))*smoothstep(.0,.2,q.z);
  float linesA=clamp(fl*(.45+.5*smoothstep(.7,.95,csAge))+frown*.8+crow*.7+lipLines*.45*smoothstep(.6,.9,csAge)+cheekLines*.22*smoothstep(.65,.95,csAge)+mar*.8,0.,1.)*ageK+nl*(.2+.8*ageK)+frown*csSkinP.y;
  diffuseColor.rgb*=1.-clamp(linesA,0.,1.)*(.4+.25*smoothstep(.7,.95,csAge)); csH-=linesA*2.2;
  // --- stubble and shaved shadow ---
  float jawLine=csStub.y+.3*pow(ax/.3,2.2);
  float region=smoothstep(jawLine+.02,jawLine-.03,q.y)*smoothstep(-.12,.06,q.z);
  float tache=exp(-csP2((q.y+.248)/.016))*smoothstep(.1*mw,.07*mw,ax)*front;
  float goatee=smoothstep(.11,.07,ax)*smoothstep(-.33,-.36,q.y)*front+tache;
  float stub=mix(max(region,tache),goatee,csStub.z)*(1.-lips)*csStub.x;
  diffuseColor.rgb=mix(diffuseColor.rgb,csStubC,clamp(stub,0.,1.)*(.55+.45*csNoise(vCsP*2600.)));
  roughnessFactor+=stub*.15;
  float tz=exp(-csP2(q.x/.07))*smoothstep(-.2,.3,q.y)*smoothstep(.3,.42,q.z)+exp(-csP2(q.x/.03)-csP2((q.y+.17)/.03));
  roughnessFactor-=clamp(tz,0.,1.)*.22;
  float warm=exp(-csP2(q.x/.045)-csP2((q.y+.165)/.04))*front;
  diffuseColor.rgb*=mix(vec3(1.),vec3(1.1,.9,.86),warm*.5);
`;
const SSS_GLSL = /* glsl */`
#if NUM_DIR_LIGHTS > 0
for(int i=0;i<NUM_DIR_LIGHTS;i++){
  vec3 L=directionalLights[i].direction; float nl=dot(normal,L);
  float w=max(0.,(nl+.45)/1.45)-max(0.,nl);
  reflectedLight.directDiffuse+=directionalLights[i].color*diffuseColor.rgb*vec3(.85,.3,.22)*w*.28;
}
#endif
reflectedLight.indirectDiffuse*=vec3(1.02,.985,.975);
`;

const skinMaterialCache = new Map();
const lookOf = (profile) => {
  const f = profile.sex === 'f', k = profile.look ?? {}, hairC = new Color(profile.hair?.color ?? '#1a1410');
  return {
    browThick: f ? .015 : .022, browArch: f ? .022 : .01, browSlope: f ? .006 : .01, browLen: .21, browY: f ? .082 : .074, browColor: null,
    lipColor: null, lipAlpha: f ? .8 : .45, lipFull: 1, gloss: f ? .5 : 0, liner: f ? .75 : .45, shadow: f ? .5 : .62, shadowColor: [.55, .46, .47], crease: 1, blush: f ? .55 : .35,
    freckles: 0, spots: 0, frown: 0, stubble: 0, stubbleColor: null, stubbleLine: -.27, goatee: 0, hairC, ...k,
  };
};
export function skinMaterial(profile, H, origin) {
  const key = `${profile.skin}|${profile.age}|${profile.sex}|${profile.sheet ? 'sheet' + JSON.stringify([profile.look, profile.face, profile.eyeOpen, profile.eyeW, profile.eyeTilt, profile.stubble]) : ''}|${profile.hair?.color}|${H.toFixed(4)}|${origin.toArray().map(v => v.toFixed(4)).join(',')}`;
  if (skinMaterialCache.has(key)) return skinMaterialCache.get(key);
  // Sheet heroes: skin albedo is brought down out of the tone-mapper's shoulder, where a bright face lost all
  // of its modelling and read as a pale blank.
  const base = new Color(profile.skin); if (profile.sheet) base.multiplyScalar(SHEET_SKIN_LEVEL);
  const m = new MeshPhysicalMaterial({
    color: base, roughness: .62, metalness: 0, specularIntensity: .28, specularColor: new Color('#fff6f0'),
    sheen: profile.sheet ? .06 : .18, sheenRoughness: .6, sheenColor: base.clone().lerp(new Color('#ff7a5a'), .55).multiplyScalar(.6),
  });
  m.name = 'skin';
  const stubble = profile.sex === 'm' && !profile.beard ? .55 : profile.beard ? .7 : 0;
  withSurface(m, 'skin', 1, profile.sheet ? SHEET_SKIN_GLSL : SKIN_GLSL);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    Object.assign(shader.uniforms, { csH0: { value: H }, csO: { value: origin.clone() }, csAge: { value: profile.age ?? .3 } });
    let decl = 'uniform float csH0,csAge;\nuniform vec3 csO;\nfloat csP2(float x){return x*x;}\nfloat csP4(float x){x*=x;return x*x;}';
    if (profile.sheet) {
      const L = lookOf(profile), P = faceParams(profile), dark = (hex, k) => new Color(hex).multiplyScalar(SHEET_SKIN_LEVEL * k);
      const lip = L.lipColor ? dark(L.lipColor, 1.25) : base.clone().multiply(new Color(1.02, .6, .58));
      Object.assign(shader.uniforms, {
        csEye: { value: new Vector4(P.eyeX ?? EYE.x, profile.eyeW ?? .056, profile.eyeOpen ?? .018, profile.eyeTilt ?? .1) },
        csBrowP: { value: new Vector4(L.browThick, L.browArch, L.browSlope, L.browLen) }, csFace: { value: new Vector4(L.browY, P.noseWidth / .76, P.mouthW ?? 1, L.lipAlpha) },
        csBrow: { value: (L.browColor ? new Color(L.browColor) : L.hairC.clone()).multiplyScalar(.5).lerp(base, .12) }, csLipC: { value: lip }, csLipP: { value: new Vector4(L.lipFull * (P.lip > 1.2 ? 1.25 : P.lip < .85 ? .85 : 1), 0, 0, 0) },
        csMake: { value: new Vector4(L.liner, L.shadow, L.blush, L.gloss) }, csShadowC: { value: new Color(...L.shadowColor) }, csCrease: { value: L.crease }, csGaunt: { value: P.gaunt ?? 0 },
        csSkinP: { value: new Vector4(L.freckles, L.frown, L.spots, 0) }, csStub: { value: new Vector4(L.stubble, L.stubbleLine, L.goatee, 0) },
        csStubC: { value: (L.stubbleColor ? new Color(L.stubbleColor) : L.hairC.clone()).multiplyScalar(.5).lerp(base, .22) },
      });
      decl += '\nuniform vec4 csEye,csBrowP,csFace,csLipP,csMake,csSkinP,csStub;\nuniform vec3 csBrow,csLipC,csShadowC,csStubC;\nuniform float csCrease,csGaunt;';
    } else {
      Object.assign(shader.uniforms, { csLip: { value: profile.sex === 'f' ? .75 : .45 }, csStubble: { value: stubble }, csBrow: { value: new Color(profile.hair?.color ?? '#1a1410').lerp(base, .25) }, csBrowArch: { value: profile.sex === 'f' ? .03 : .018 }, csOpen: { value: profile.eyeOpen ?? .014 } });
      decl += '\nuniform float csLip,csStubble,csBrowArch,csOpen;\nuniform vec3 csBrow;';
    }
    shader.fragmentShader = shader.fragmentShader.replace('uniform float csStrength;', 'uniform float csStrength;\n' + decl).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + SSS_GLSL);
  };
  if (profile.sheet) { const cacheKey = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => cacheKey() + '|sheet-face-4'; }
  // Subsurface approximation: soften the terminator and lift red in shadow.
  m.userData.sss = true;
  skinMaterialCache.set(key, m);
  return m;
}

const EYE_GLSL = /* glsl */`
  vec3 e=normalize(vCsP-csEc);
  float ang=acos(clamp(e.z,-1.,1.))*csEyeK;
  float iris=smoothstep(.53,.5,ang), pupil=smoothstep(.2,.18,ang), limbal=smoothstep(.36,.53,ang)*iris;
  float fib=csNoise(vec3(atan(e.y,e.x)*12.,ang*30.,1.))*.5+.5;
  vec3 irisC=csIris*(.65+fib*.7)*(1.-limbal*.75)+csIris*vec3(1.4,1.25,.9)*smoothstep(.3,.2,ang)*.35;
  float veins=smoothstep(.6,1.,csNoise(vCsP*900.))*smoothstep(.9,1.4,ang)*.25;
  vec3 sclera=mix(vec3(.86,.83,.8),vec3(.8,.42,.4),veins)*mix(.7,1.,smoothstep(-.6,.2,e.y));
  diffuseColor.rgb=mix(sclera,irisC,iris); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.01),pupil);
  diffuseColor.rgb*=mix(.55,1.,smoothstep(.75,.15,e.y));
  float cat=smoothstep(.085,.03,length(e.xy-vec2(-.1,.13)/csEyeK));
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.6),cat*step(1.05,csEyeK));
  roughnessFactor=.05;
`;

export function eyeMaterial(iris, center, k = 1) {
  const m = new MeshPhysicalMaterial({ color: '#ffffff', roughness: .05, clearcoat: 1, clearcoatRoughness: .03, specularIntensity: .9, ior: 1.376 });
  m.name = 'eye';
  withSurface(m, 'hair', 0, EYE_GLSL);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => { prev(shader, r); shader.uniforms.csIris = { value: new Color(iris) }; shader.uniforms.csEc = { value: center.clone() }; shader.uniforms.csEyeK = { value: k }; shader.fragmentShader = shader.fragmentShader.replace('uniform float csStrength;', 'uniform float csStrength;\nuniform float csEyeK;\nuniform vec3 csIris,csEc;'); };
  m.customProgramCacheKey = () => 'eye';
  return m;
}

// Builds skin (head + ears + neck + lids) and eyes. Returns metadata used by
// hair/gear to fit to the same surface.
export function buildHead(profile, H, quality = 'high') {
  const P = faceParams(profile);
  const res = profile.sheet ? (quality === 'low' ? [96, 72] : quality === 'medium' ? [136, 104] : [220, 168]) : quality === 'low' ? [72, 56] : quality === 'medium' ? [112, 88] : [150, 120];
  const head = displace(sphereDirs(res[0], res[1]), d => sculpt(d, P));
  // ears
  const ears = [];
  for (const s of [-1, 1]) {
    const e = displace(new SphereGeometry(1, 32, 24), d => { const out = d.x * s > 0, r = Math.hypot(d.y, d.z + .1), rim = profile.sheet && out ? .016 * Math.exp(-(((r - .82) / .16) ** 2)) - .014 * Math.exp(-((r / .5) ** 2)) : 0; return new Vector3(d.x * .032 + (out ? .012 * (1 - d.y * d.y) + rim * s : 0), d.y * .125 * (1 - .3 * Math.max(0, -d.y)), d.z * .068 * (1 - .35 * Math.max(0, -d.y))); });
    e.rotateY(s * -.42); e.rotateZ(s * .12);
    e.translate(s * (.33 * P.build), -.035, -.04); ears.push(e);
  }
  // neck
  const nk = (profile.sex === 'f' ? .9 : 1) * (1 + .3 * (P.fat ?? 0)) * (profile.neck ?? 1), neck = new CylinderGeometry(.215 * nk, .25 * nk, .42, 40, 6, true); neck.scale(1, 1, 1.05); neck.translate(0, -.5, -.07);
  // Almond eye apertures with continuous lid-to-cheek annuli. A complete
  // exposed sphere plus detached spherical lids made the old eyes look glued on.
  const eyes = [], lids = [], lash = [];
  // Eye aperture: half-height of the opening and the tilt of its outer corner (profile.eyeOpen / eyeTilt).
  const sheet = !!profile.sheet, r = sheet ? EYE_SHEET_R : EYE.r, open = profile.eyeOpen ?? .014, tilt = profile.eyeTilt ?? .10, ew = profile.eyeW ?? (sheet ? .056 : .043), EX = P.eyeX ?? EYE.x;
  const frontAt=(x,y)=>{
    let lo=0,hi=Math.PI/2,pt;const dy=Math.max(-.999,Math.min(.999,y*2)),rr=Math.sqrt(1-dy*dy);
    for(let k=0;k<18;k++){const t=(lo+hi)/2;pt=sculpt(new Vector3(Math.sign(x||1)*Math.sin(t)*rr,dy,Math.cos(t)*rr),P);if(Math.abs(pt.x)<Math.abs(x))lo=t;else hi=t;}
    return pt.z;
  };
  for (const s of [-1, 1]) {
    const cx=s*EX,cy=EYE.y;
    const center=new Vector3(cx,cy,frontAt(cx,cy)-r+(sheet?.004:.012));
    const pos=[],indices=[],ring=[],ri=[];const N=sheet?64:48,M=sheet?12:8;
    // Polar patch covers exactly the visible sclera, never an exposed globe.
    for(let j=0;j<=M;j++) for(let i=0;i<=N;i++){
      const a=i/N*Math.PI*2,t=j/M;
      const x=Math.cos(a)*ew*t,y=Math.sin(a)*open*(1-.35*Math.abs(Math.cos(a))**3)*t+s*x*tilt;
      pos.push(cx+x,cy+y,center.z+Math.sqrt(Math.max(0,r*r-x*x-y*y)));
    }
    for(let j=0;j<M;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const eye=new BufferGeometry();eye.setAttribute('position',new Float32BufferAttribute(pos,3));eye.setIndex(indices);eye.computeVertexNormals();eyes.push({geo:eye,center});
    for(let j=0;j<=M;j++)for(let i=0;i<=N;i++){
      const a=i/N*Math.PI*2,t=j/M,ix=Math.cos(a)*ew,iy=Math.sin(a)*open*(1-.35*Math.abs(Math.cos(a))**3)+s*ix*tilt;
      const x=ix*(1-t)+Math.cos(a)*(ew+.03)*t,y=iy*(1-t)+Math.sin(a)*Math.max(.05,open*2.3)*t;
      const inner=center.z+Math.sqrt(Math.max(0,r*r-ix*ix-iy*iy))+.001;
      const up=Math.max(0,Math.sin(a)),dn=Math.max(0,-Math.sin(a));
      const z=inner*(1-t)+frontAt(cx+x,cy+y)*t+(sheet?(.005*(1-t)**3+Math.sin(Math.min(1,t*1.6)*Math.PI)*(.011*up+.004*dn)*(profile.lidRoll??1)):Math.sin(t*Math.PI)*.003);
      ring.push(cx+x,cy+y,z);
    }
    for(let j=0;j<M;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;ri.push(a,b,a+1,b,b+1,a+1);}
    const lid=new BufferGeometry();lid.setAttribute('position',new Float32BufferAttribute(ring,3));lid.setIndex(ri);lid.computeVertexNormals();
    const blink=new Float32Array(ring);
    for(let j=0;j<=M;j++)for(let i=0;i<=N;i++){const index=j*(N+1)+i;blink[index*3+1]+=(cy-ring[index*3+1])*(1-j/M);}
    lid.morphAttributes.position=[new Float32BufferAttribute(blink,3)];lids.push(lid);
  }
  const skinParts = [head, ...ears.map(e => { const n = e.index ? e.toNonIndexed() : e; n.deleteAttribute('uv'); return n; }), (() => { const n = neck.toNonIndexed(); n.deleteAttribute('uv'); return n; })()];
  const skinGeo = mergeGeometries(skinParts.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; }), false);
  skinGeo.scale(H, H, H);
  for(const lid of lids){lid.scale(H,H,H);const morph=lid.morphAttributes.position[0];for(let i=0;i<morph.count;i++)morph.setXYZ(i,morph.getX(i)*H,morph.getY(i)*H,morph.getZ(i)*H);}
  return { P, H, skinGeo, lids, eyes: eyes.map(e => ({ geo: e.geo.scale(H, H, H), center: e.center.clone().multiplyScalar(H) })), lash };
}

export { sm, g2 };
