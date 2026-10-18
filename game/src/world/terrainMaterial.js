// Terrain PBR material: a MaterialPlugin that replaces albedo / normal / roughness with an
// 8-slot (per node) height-blended splat of procedural texture-array layers. Cliff layers are
// triplanar, the rest planar; roads, shoreline foam, wetness, weather snow, lava emission and
// macro variation (anti-tiling) are resolved per pixel.
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { RawTexture2DArray } from '@babylonjs/core/Materials/Textures/rawTexture2DArray.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { atmo } from '../render/atmosphere.js';
import { L, TRIPLANAR } from './surface.js';

const FRAG_DEFS = /* glsl */`
#ifdef TERRAIN
precision highp sampler2DArray;
uniform sampler2DArray tAlb;
uniform sampler2DArray tNrm;
uniform sampler2D tMacro;
uniform vec4 tSlotA; uniform vec4 tSlotB; uniform vec4 tTriA; uniform vec4 tTriB;
uniform vec4 tP;  // x time, y wetness, z snow cover, w texture scale (1/m)
uniform vec4 tP2; // x cobble layer, y earth layer, z lava layer, w normal strength
varying vec4 vTW0; varying vec4 vTW1; varying vec4 vTAux;
float tRough = 0.85;
vec3 tEmis = vec3(0.0);
vec3 tSRGB(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
void tPlanar(float L, vec2 uv, out vec4 a, out vec4 n) { a = texture(tAlb, vec3(uv, L)); n = texture(tNrm, vec3(uv, L)); }
vec3 tTS(vec4 n) { vec2 xy = n.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
void tSample(float L, float tri, vec3 wp, vec3 bw, float sc, out vec4 a, out vec3 d, out vec4 nr) {
  if (tri > 0.5) {
    vec4 ax, ay, az, nx, ny, nz;
    tPlanar(L, wp.zy * sc * vec2(1.0, -1.0), ax, nx); tPlanar(L, wp.xz * sc, ay, ny); tPlanar(L, wp.xy * sc * vec2(1.0, -1.0), az, nz);
    a = ax * bw.x + ay * bw.y + az * bw.z; nr = nx * bw.x + ny * bw.y + nz * bw.z;
    vec3 tx = tTS(nx), ty = tTS(ny), tz = tTS(nz);
    d = vec3(0.0, -tx.y, tx.x) * bw.x + vec3(ty.x, 0.0, ty.y) * bw.y + vec3(tz.x, -tz.y, 0.0) * bw.z;
  } else {
    vec4 n; tPlanar(L, wp.xz * sc, a, n); nr = n; vec3 t = tTS(n); d = vec3(t.x, 0.0, t.y);
  }
}
void terrainSurface(vec3 wp, vec3 nG, out vec3 albedo, out vec3 nOut, out float rough, out vec3 emis) {
  float sc = tP.w;
  vec3 bw = pow(abs(nG), vec3(5.0)); bw /= (bw.x + bw.y + bw.z);
  float dist = length(wp - vEyePosition.xyz);
  vec4 mac = texture(tMacro, wp.xz * 0.0045);
  vec4 mac2 = texture(tMacro, wp.xz * 0.023 + 0.37);
  float W[8]; W[0] = vTW0.x; W[1] = vTW0.y; W[2] = vTW0.z; W[3] = vTW0.w; W[4] = vTW1.x; W[5] = vTW1.y; W[6] = vTW1.z; W[7] = vTW1.w;
  float LY[8]; LY[0] = tSlotA.x; LY[1] = tSlotA.y; LY[2] = tSlotA.z; LY[3] = tSlotA.w; LY[4] = tSlotB.x; LY[5] = tSlotB.y; LY[6] = tSlotB.z; LY[7] = tSlotB.w;
  float TR[8]; TR[0] = tTriA.x; TR[1] = tTriA.y; TR[2] = tTriA.z; TR[3] = tTriA.w; TR[4] = tTriB.x; TR[5] = tTriB.y; TR[6] = tTriB.z; TR[7] = tTriB.w;
  vec4 A[8]; vec3 D[8]; vec4 NR[8]; float HB[8];
  float hmax = -1.0; int dom = 0; float wmax = 0.0;
  for (int i = 0; i < 8; i++) {
    HB[i] = -9.0; A[i] = vec4(0.0); D[i] = vec3(0.0); NR[i] = vec4(0.5, 0.5, 0.85, 1.0);
    if (W[i] > 0.003 && LY[i] >= 0.0) {
      tSample(LY[i], TR[i], wp, bw, sc, A[i], D[i], NR[i]);
      HB[i] = W[i] + A[i].a * 0.55;
      hmax = max(hmax, HB[i]);
      if (W[i] > wmax) { wmax = W[i]; dom = i; }
    }
  }
  vec3 alb = vec3(0.0); vec3 dd = vec3(0.0); float ro = 0.0, ao = 0.0, ws = 0.0, lavaA = 1.0;
  for (int i = 0; i < 8; i++) {
    float w = max(HB[i] - hmax + 0.22, 0.0);
    if (w > 0.0) { alb += tSRGB(A[i].rgb) * w; dd += D[i] * w; ro += NR[i].b * w; ao += NR[i].a * w; ws += w;
      if (abs(LY[i] - tP2.z) < 0.5) lavaA = A[i].a; }
  }
  alb /= ws; dd /= ws; ro /= ws; ao /= ws;
  // far field: fade texture detail toward each layer's mean colour (kills tiling moire)
  float farK = smoothstep(35.0, 260.0, dist);
  if (farK > 0.01) {
    vec3 avg = vec3(0.0); float aw = 0.0;
    for (int i = 0; i < 8; i++) { float w = max(HB[i] - hmax + 0.22, 0.0); if (w > 0.0) { avg += tSRGB(textureLod(tAlb, vec3(0.5, 0.5, LY[i]), 12.0).rgb) * w; aw += w; } }
    alb = mix(alb, avg / max(aw, 1e-4), farK * 0.75);
  }
  // anti-tiling: large-scale resample of the dominant planar layer
  if (TR[dom] < 0.5) { vec4 a2 = texture(tAlb, vec3(wp.xz * sc * 0.21 + 0.5, LY[dom])); alb = mix(alb, tSRGB(a2.rgb) * (dot(alb, vec3(0.33)) / max(dot(tSRGB(a2.rgb), vec3(0.33)), 0.01)) * 0.5 + alb * 0.5, 0.5 * smoothstep(8.0, 60.0, dist)); }
  // roads
  float road = vTAux.x;
  float rm = 1.0 - smoothstep(2.4, 4.4, road + (mac2.r - 0.5) * 2.4);
  if (rm > 0.002) {
    vec4 ca, cn, ea, en; tPlanar(tP2.x, wp.xz * sc * 1.25, ca, cn); tPlanar(tP2.y, wp.xz * sc, ea, en);
    vec4 ra = mix(ea, ca, vTAux.y); vec4 rn = mix(en, cn, vTAux.y);
    float e = clamp(rm * 1.8 + (ra.a - 0.5) * 0.8 - 0.4, 0.0, 1.0);
    vec3 t = tTS(rn);
    alb = mix(alb, tSRGB(ra.rgb), e); dd = mix(dd, vec3(t.x, 0.0, t.y), e); ro = mix(ro, rn.b, e); ao = mix(ao, rn.a, e);
  }
  // macro variation
  alb *= mix(0.72, 1.18, mac.r) * mix(0.9, 1.08, mac2.g);
  alb *= mix(vec3(1.06, 1.0, 0.9), vec3(0.94, 1.0, 1.05), mac.g);
  float patchy = smoothstep(0.55, 0.8, mac.b) * (1.0 - smoothstep(0.25, 0.4, 1.0 - nG.y));
  alb = mix(alb, alb * vec3(1.25, 1.08, 0.75), patchy * 0.5); // sun-bleached patches
#ifdef VERTEXCOLOR
  alb *= vColor.rgb;
#endif
  vec3 n = normalize(nG + dd * tP2.w * (1.0 - smoothstep(60.0, 260.0, dist) * 0.7));
  // weather snow on up-facing ground
  float sn = tP.z * smoothstep(0.62, 0.86, n.y + (mac2.b - 0.5) * 0.25);
  alb = mix(alb, vec3(0.82, 0.85, 0.9), sn); ro = mix(ro, 0.62, sn);
  // wetness: rain on flat ground, plus the wet shore band
  float coast = vTAux.w;
  float shore = smoothstep(1.2, 0.2, wp.y) * smoothstep(-3.0, -0.5, wp.y) * smoothstep(260.0, 120.0, coast);
  float wet = max(tP.y * smoothstep(0.4, 0.9, n.y) * (1.0 - sn), shore);
  alb *= mix(1.0, 0.6, wet); ro = mix(ro, 0.32, wet); n = normalize(mix(n, nG, wet * 0.6));
  // shoreline foam
  float wave = sin(tP.x * 1.1 + dot(wp.xz, vec2(0.045, 0.031))) * 0.16 + sin(tP.x * 0.7 - wp.x * 0.02) * 0.08;
  float band = smoothstep(0.55, 0.0, abs(wp.y - 0.08 - wave)) * smoothstep(260.0, 120.0, coast);
  if (band > 0.001) { float fp = texture(tMacro, wp.xz * 0.11 + vec2(tP.x * 0.013, tP.x * 0.009)).b;
    float foam = band * smoothstep(0.35, 0.65, fp + band * 0.3); alb = mix(alb, vec3(0.85, 0.88, 0.88), foam); ro = mix(ro, 0.35, foam); }
  // lava: molten cracks glow through a dark crust, slow flowing pattern
  emis = vec3(0.0);
  float heat = smoothstep(0.15, 0.85, vTAux.z);
  if (heat > 0.001) {
    float f1 = texture(tMacro, wp.xz * 0.018 + vec2(tP.x * 0.004, tP.x * 0.0025)).r;
    float f2 = texture(tMacro, wp.xz * 0.06 - vec2(tP.x * 0.009, tP.x * 0.006)).g;
    float molten = clamp(heat * 1.25 - smoothstep(0.35, 0.75, lavaA + f1 * 0.35 - heat * 0.25), 0.0, 1.0);
    float glow = molten * (0.55 + 0.9 * f2 * f1);
    emis = mix(vec3(2.6, 0.45, 0.06), vec3(9.0, 3.2, 0.7), glow) * glow * 2.2;
    alb = mix(alb, vec3(0.02, 0.015, 0.012), molten); ro = mix(ro, 0.45, molten);
    n = normalize(mix(n, nG, molten * 0.8));
  }
  albedo = alb * mix(1.0, ao, 0.55);
  nOut = n; rough = clamp(ro, 0.05, 1.0);
#if TDEBUG == 1
  albedo = vTW0.rgb; nOut = nG; rough = 1.0;
#elif TDEBUG == 2
  albedo = vec3(tSlotA.x, tSlotA.y, tSlotA.z) / 18.0; nOut = nG;
#elif TDEBUG == 3
  albedo = tSRGB(texture(tAlb, vec3(wp.xz * sc, 0.0)).rgb); nOut = nG; rough = 1.0;
#elif TDEBUG == 5
  albedo = texture(tNrm, vec3(wp.xz * sc, 0.0)).rgb; nOut = nG; rough = 1.0;
#elif TDEBUG == 6
  albedo = texture(tMacro, wp.xz * 0.01).rgb; nOut = nG; rough = 1.0;
#elif TDEBUG == 7
  albedo = vec3(0.5); nOut = nG; rough = ro;
#elif TDEBUG == 4
  albedo = vec3(ws, hmax, float(dom) / 8.0); nOut = nG;
#endif
}
#endif
`;

class TerrainPlugin extends MaterialPluginBase {
  constructor(material, res) {
    super(material, 'TerrainSplat', 100, { TERRAIN: false, TDEBUG: 0 });
    this.res = res; this.registerForExtraEvents = true; this._enable(true);
  }
  prepareDefines(defines) { defines.TERRAIN = true; defines.TDEBUG = this.res.debug | 0; }
  getClassName() { return 'TerrainPlugin'; }
  getSamplers(samplers) { samplers.push('tAlb', 'tNrm', 'tMacro'); }
  getAttributes(attributes) { attributes.push('tw0', 'tw1', 'taux'); }
  getUniforms() { return { externalUniforms: ['tSlotA', 'tSlotB', 'tTriA', 'tTriB', 'tP', 'tP2'] }; }
  isReadyForSubMesh() { return this.res.alb.isReady() && this.res.nrm.isReady() && this.res.macro.isReady(); }
  hardBindForSubMesh(_ubo, _scene, _engine, subMesh) {
    const e = subMesh.effect; if (!e) return;
    const md = subMesh.getMesh().metadata; const s = md?.slots ?? [L.rock, -1, -1, -1, -1, -1, -1, -1];
    e.setFloat4('tSlotA', s[0], s[1], s[2], s[3]); e.setFloat4('tSlotB', s[4], s[5], s[6], s[7]);
    const t = (k) => (TRIPLANAR.has(k) ? 1 : 0);
    e.setFloat4('tTriA', t(s[0]), t(s[1]), t(s[2]), t(s[3])); e.setFloat4('tTriB', t(s[4]), t(s[5]), t(s[6]), t(s[7]));
    e.setFloat4('tP', atmo.time, atmo.wetness, atmo.snowCover, this.res.scale);
    e.setFloat4('tP2', L.cobble, L.earth, L.lava, this.res.normalStrength);
    e.setTexture('tAlb', this.res.alb); e.setTexture('tNrm', this.res.nrm); e.setTexture('tMacro', this.res.macro);
  }
  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: '#ifdef TERRAIN\nattribute vec4 tw0; attribute vec4 tw1; attribute vec4 taux;\nvarying vec4 vTW0; varying vec4 vTW1; varying vec4 vTAux;\n#endif\n',
        CUSTOM_VERTEX_MAIN_END: '#ifdef TERRAIN\nvTW0 = tw0; vTW1 = tw1; vTAux = taux;\n#endif\n',
      };
    }
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: FRAG_DEFS,
        CUSTOM_FRAGMENT_UPDATE_ALPHA: '#ifdef TERRAIN\n{ vec3 tA; vec3 tN; terrainSurface(vPositionW, normalW, tA, tN, tRough, tEmis); surfaceAlbedo = tA; normalW = tN; }\n#endif\n',
        CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: '#ifdef TERRAIN\nmetallicRoughness.r = 0.0; metallicRoughness.g = tRough;\n#endif\n',
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: '#ifdef TERRAIN\nfinalColor.rgb += tEmis;\n#endif\n',
      };
    }
    return null;
  }
}

/** Build GPU texture arrays from generated layers. layers: [{index, alb, nrm}] */
export function createTerrainResources(scene, layers, N, macroTexture, quality) {
  const count = Math.max(...layers.map((l) => l.index)) + 1;
  const alb = new Uint8Array(N * N * 4 * count), nrm = new Uint8Array(N * N * 4 * count);
  for (const l of layers) { alb.set(l.alb, l.index * N * N * 4); nrm.set(l.nrm, l.index * N * N * 4); }
  const mk = (data, name) => {
    const t = new RawTexture2DArray(data, N, N, count, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = quality.name === 'low' ? 2 : 8; t.name = name;
    return t;
  };
  return { alb: mk(alb, 'terrainAlbedo'), nrm: mk(nrm, 'terrainNormal'), macro: macroTexture, scale: 1 / 4.5, normalStrength: 0.9, layersRaw: layers, N };
}

export function createTerrainMaterial(scene, res) {
  const m = new PBRMaterial('terrain', scene);
  m.metallic = 0; m.roughness = 1;
  m.albedoColor.set(1, 1, 1);
  m.environmentIntensity = 1;
  m.useRadianceOverAlpha = false;
  m.backFaceCulling = true;
  m.maxSimultaneousLights = 4;
  new TerrainPlugin(m, res);
  return m;
}
