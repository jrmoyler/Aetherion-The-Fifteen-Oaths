// Physically based sky dome: per-vertex Rayleigh/Mie single scattering (sun + moon), phase
// functions, sun & moon discs, procedural drifting cloud layer (fbm over a code-generated noise
// texture), twinkling stars, lightning flash, horizon blended into the aerial-perspective fog.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { AERIAL_GLSL, AERIAL_UNIFORMS, bindAerial, atmo } from './atmosphere.js';

const SCATTER_GLSL = /* glsl */`
const float RE = 6360e3; const float RA = 6420e3; const float HR = 7994.0; const float HM = 1200.0;
const vec3 BR = vec3(5.802e-6, 13.558e-6, 33.1e-6); const float BM = 4.4356e-6; const float MIE_EXT = 1.11;
float raySphereLen(float oy, float dy, float r) { float b = oy * dy; float c = oy * oy - r * r; float d = b * b - c; return -b + sqrt(max(d, 0.0)); }
vec3 transmit(float h, float mu) {
  float oy = RE + h; float b = oy * mu; float disc = b * b - (oy * oy - RE * RE);
  if (disc > 0.0 && -b - sqrt(disc) > 0.0) return vec3(0.0);
  float t = raySphereLen(oy, mu, RA); float ds = t / 6.0; float odR = 0.0, odM = 0.0;
  float sx = sqrt(max(0.0, 1.0 - mu * mu));
  for (int i = 0; i < 6; i++) { float s = (float(i) + 0.5) * ds; float px = sx * s, py = oy + mu * s;
    float hh = sqrt(px * px + py * py) - RE; odR += exp(-hh / HR) * ds; odM += exp(-hh / HM) * ds; }
  return exp(-(BR * odR + BM * MIE_EXT * odM));
}
void scatter(vec3 v, vec3 s, float h, float haze, out vec3 ray, out vec3 mie) {
  float oy = RE + h; float tmax = raySphereLen(oy, v.y, RA); float ds = tmax / 8.0;
  vec3 rr = vec3(0.0), mm = vec3(0.0); float odR = 0.0, odM = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = (float(i) + 0.5) * ds; vec3 p = vec3(v.x * t, oy + v.y * t, v.z * t);
    float r = length(p); float hh = r - RE;
    float dR = exp(-hh / HR) * ds, dM = exp(-hh / HM) * ds * haze;
    odR += dR * 0.5; odM += dM * 0.5;
    vec3 att = exp(-(BR * odR + BM * MIE_EXT * odM)) * transmit(hh, clamp(dot(p, s) / r, -1.0, 1.0));
    rr += att * dR; mm += att * dM; odR += dR * 0.5; odM += dM * 0.5;
  }
  ray = rr * BR; mie = mm * BM;
}
`;

const VERT = /* glsl */`
precision highp float;
attribute vec3 position;
uniform mat4 world; uniform mat4 viewProjection;
uniform vec3 sunDir; uniform vec3 moonDir; uniform float haze;
varying vec3 vDir; varying vec3 vRayS; varying vec3 vMieS; varying vec3 vRayM; varying vec3 vMieM;
${SCATTER_GLSL}
void main() {
  vec3 d = normalize(position); vDir = d;
  vec3 v = normalize(vec3(d.x, max(d.y, 0.0), d.z));
  scatter(v, sunDir, 300.0, haze, vRayS, vMieS);
  if (moonDir.y > -0.25) scatter(v, moonDir, 300.0, haze, vRayM, vMieM); else { vRayM = vec3(0.0); vMieM = vec3(0.0); }
  vec4 p = viewProjection * world * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir; varying vec3 vRayS; varying vec3 vMieS; varying vec3 vRayM; varying vec3 vMieM;
uniform vec3 sunDir; uniform vec3 moonDir;
uniform vec4 sunInt;   // x sun scale, y moon scale, z sun disc scale, w star amount
uniform vec3 sunDisc;  // transmitted sun colour (unit-ish)
uniform vec3 msColor;  // multiple-scattering / ambient sky term
uniform vec4 cloud;    // x coverage, y opacity, z darkness, w scale
uniform vec4 cloud2;   // xy wind offset, z flash, w time
uniform vec3 cloudLit; uniform vec3 cloudShade;
uniform vec4 skyTint;  // rgb grade tint on sky, a horizon fog blend strength
uniform sampler2D noiseTex;
${AERIAL_GLSL}
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float phaseR(float mu) { return 0.0596831 * (1.0 + mu * mu); }
float phaseM(float mu, float g) { float g2 = g * g; return 0.1193662 * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5)); }
float cloudN(vec2 uv) {
  return texture2D(noiseTex, uv).r * 0.5 + texture2D(noiseTex, uv * 2.03 + 0.31).g * 0.25
       + texture2D(noiseTex, uv * 4.07 + 0.77).b * 0.15 + texture2D(noiseTex, uv * 8.13 + 0.13).a * 0.1;
}
void main() {
  vec3 d = normalize(vDir);
  float mu = dot(d, sunDir), muM = dot(d, moonDir);
  vec3 col = sunInt.x * (vRayS * phaseR(mu) + vMieS * phaseM(mu, 0.76));
  col += sunInt.y * (vRayM * phaseR(muM) + vMieM * phaseM(muM, 0.76));
  float up = clamp(d.y, 0.0, 1.0);
  col += msColor * (0.55 + 0.45 * (1.0 - up));
  col *= vec3(0.93, 0.97, 1.1) * skyTint.rgb;
  // stars
  if (sunInt.w > 0.001 && d.y > 0.0) {
    vec3 p = d * 260.0; vec3 c = floor(p); float h = hash13(c);
    if (h > 0.9965) { vec3 f = fract(p) - 0.5; float s = (1.0 - smoothstep(0.0, 0.32, length(f)));
      float tw = 0.65 + 0.35 * sin(cloud2.w * (2.0 + h * 9.0) + h * 80.0);
      col += vec3(0.9, 0.95, 1.0) * mix(vec3(1.0, 0.8, 0.7), vec3(0.8, 0.9, 1.0), fract(h * 37.0)) * s * tw * sunInt.w * (h - 0.9965) * 2400.0 * smoothstep(0.0, 0.25, d.y); }
    // faint milky band
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, 0.93))) * 3.2, 2.0));
    col += vec3(0.010, 0.012, 0.018) * band * sunInt.w * (0.6 + 0.4 * texture2D(noiseTex, d.xz * 3.0).r);
  }
  // sun disc with limb darkening
  float sunR = 0.99996; // ~0.5 deg
  if (mu > 0.9997) { float k = smoothstep(0.9997, sunR, mu); float limb = 0.6 + 0.4 * sqrt(clamp((mu - 0.9997) / (1.0 - 0.9997), 0.0, 1.0));
    col += sunDisc * sunInt.z * k * limb; }
  // moon disc (lit hemisphere from the sun direction)
  float moonR = 0.99994;
  if (muM > 0.9998 && moonDir.y > -0.1) {
    vec3 mx = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0))); vec3 my = cross(mx, moonDir);
    vec2 q = vec2(dot(d - moonDir, mx), dot(d - moonDir, my)) / sqrt(1.0 - 0.9998);
    float r2 = dot(q, q);
    if (r2 < 1.0) { vec3 n = normalize(q.x * mx + q.y * my + sqrt(1.0 - r2) * moonDir);
      float lit = clamp(dot(n, sunDir) * 1.5 + 0.08, 0.02, 1.0);
      float maria = 0.75 + 0.25 * texture2D(noiseTex, q * 0.35 + 0.5).r;
      col = mix(col, vec3(0.9, 0.92, 1.0) * 0.6 * lit * maria * (0.3 + sunInt.w), (1.0 - smoothstep(0.92, 1.0, r2)) * (0.35 + 0.65 * min(1.0, sunInt.w * 3.0))); }
  }
  // clouds: one fbm layer projected on a curved plane, lit toward the sun
  if (d.y > 0.0 && cloud.y > 0.001) {
    // overcast base deck under heavy cover
    float deck = smoothstep(0.55, 0.85, cloud.x) * smoothstep(0.0, 0.12, d.y);
    col = mix(col, mix(cloudShade, cloudLit, 0.35 * (1.0 - cloud.z)) * skyTint.rgb, deck);
    float t = 1.0 / (d.y + 0.07);
    vec2 uv = d.xz * t * cloud.w + cloud2.xy;
    float n = cloudN(uv);
    float cov = cloud.x;
    float dens = smoothstep(1.0 - cov, 1.0 - cov + 0.32, n);
    if (dens > 0.001) {
      vec2 toS = normalize(sunDir.xz + 1e-4) * 0.035;
      float n2 = cloudN(uv + toS);
      float lit = clamp(0.55 + (n - n2) * mix(6.0, 1.5, smoothstep(0.8, 0.97, cov)), 0.0, 1.0);
      float thick = smoothstep(1.0 - cov, 1.0, n);
      vec3 cc = mix(cloudShade, cloudLit, lit * (1.0 - cloud.z * thick));
      cc += cloudLit * 0.6 * pow(max(mu, 0.0), 12.0) * (1.0 - thick); // silver lining
      cc += vec3(0.75, 0.8, 1.0) * cloud2.z * 4.0 * (0.4 + 0.6 * thick);
      float fade = smoothstep(0.0, 0.16, d.y);
      col = mix(col, cc * skyTint.rgb, dens * fade * cloud.y * (1.0 - 0.6 * smoothstep(0.55, 0.85, cov)));
    }
  }
  col += vec3(0.6, 0.65, 0.9) * cloud2.z * 0.6;
  // blend toward the aerial-perspective fog colour near and below the horizon
  vec3 fc; float f = aeFogAmount(aeFogD.xyz + vec3(d.x, max(d.y, -0.02), d.z) * 30000.0, fc);
  float hb = skyTint.a * (1.0 - smoothstep(-0.02, 0.22, d.y));
  col = mix(col, fc, clamp(f * hb, 0.0, 1.0));
  if (d.y < -0.02) col = mix(col, fc, (1.0 - smoothstep(-0.12, -0.02, d.y)));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/** Tileable value-noise texture (4 octave sets in RGBA) generated in code. */
export function makeNoiseTexture(scene, size = 256) {
  const data = new Uint8Array(size * size * 4);
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  for (let c = 0; c < 4; c++) {
    const field = new Float32Array(size * size);
    let amp = 1, total = 0;
    for (let o = 0; o < 5; o++) {
      const g = 4 << (o + c > 6 ? 6 : o + c); // lattice cells across the tile
      const lat = new Float32Array(g * g); for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      for (let y = 0; y < size; y++) {
        const fy = (y / size) * g, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
        const y0 = iy % g, y1 = (iy + 1) % g;
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * g, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
          const x0 = ix % g, x1 = (ix + 1) % g;
          const a = lat[y0 * g + x0], b = lat[y0 * g + x1], cc = lat[y1 * g + x0], dd = lat[y1 * g + x1];
          field[y * size + x] += amp * (a + (b - a) * sx + (cc - a + (dd - cc - b + a) * sx) * sy);
        }
      }
      total += amp; amp *= 0.5;
    }
    for (let i = 0; i < size * size; i++) data[i * 4 + c] = Math.max(0, Math.min(255, (field[i] / total) * 255));
  }
  // normalize contrast per channel
  for (let c = 0; c < 4; c++) {
    let mn = 255, mx = 0; for (let i = c; i < data.length; i += 4) { mn = Math.min(mn, data[i]); mx = Math.max(mx, data[i]); }
    for (let i = c; i < data.length; i += 4) data[i] = ((data[i] - mn) / Math.max(1, mx - mn)) * 255;
  }
  const t = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.name = 'skyNoise';
  return t;
}

function buildDome(scene) {
  // rings concentrated near the horizon (where the gradient changes fastest)
  const rings = [-0.35, -0.12, -0.04, 0.0, 0.015, 0.035, 0.06, 0.09, 0.13, 0.18, 0.25, 0.34, 0.45, 0.58, 0.72, 0.86, 0.95, 1.0];
  const seg = 64; const pos = [], idx = [];
  for (let r = 0; r < rings.length; r++) {
    const el = rings[r] * Math.PI / 2; const cy = Math.sin(el), cr = Math.cos(el);
    for (let s = 0; s <= seg; s++) { const a = (s / seg) * Math.PI * 2; pos.push(Math.cos(a) * cr * 1000, cy * 1000, Math.sin(a) * cr * 1000); }
  }
  for (let r = 0; r < rings.length - 1; r++) for (let s = 0; s < seg; s++) {
    const a = r * (seg + 1) + s, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx;
  const m = new Mesh('skyDome', scene); vd.applyToMesh(m);
  return m;
}

export function createSky(scene, quality) {
  const mesh = buildDome(scene);
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.applyFog = false;
  mesh.renderingGroupId = 0;
  Effect.ShadersStore.aeSkyVertexShader = VERT;
  Effect.ShadersStore.aeSkyFragmentShader = FRAG;
  const noise = makeNoiseTexture(scene, quality.name === 'low' ? 128 : 256);
  const mat = new ShaderMaterial('skyMat', scene, { vertex: 'aeSky', fragment: 'aeSky' }, {
    attributes: ['position'],
    uniforms: ['world', 'viewProjection', 'sunDir', 'moonDir', 'haze', 'sunInt', 'sunDisc', 'msColor', 'cloud', 'cloud2', 'cloudLit', 'cloudShade', 'skyTint', ...AERIAL_UNIFORMS],
    samplers: ['noiseTex'],
  });
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.depthFunction = Constants.LEQUAL;
  mat.setTexture('noiseTex', noise);
  mat.metadata = { noAerial: true };
  mesh.material = mat;

  const state = {
    haze: 1, sunScale: 20, moonScale: 0.06, discScale: 1500, stars: 0,
    sunDisc: [1, 1, 1], ms: [0.05, 0.06, 0.08],
    coverage: 0.42, opacity: 0.9, darkness: 0.35, scale: 0.22, wind: [0, 0], flash: 0,
    cloudLit: [1, 1, 1], cloudShade: [0.5, 0.55, 0.6], tint: [1, 1, 1], horizonBlend: 1,
  };
  mat.onBind = () => {
    const e = mat.getEffect(); if (!e) return;
    const s = state;
    e.setFloat3('sunDir', atmo.sunDir.x, atmo.sunDir.y, atmo.sunDir.z);
    e.setFloat3('moonDir', atmo.moonDir.x, atmo.moonDir.y, atmo.moonDir.z);
    e.setFloat('haze', s.haze);
    e.setFloat4('sunInt', s.sunScale, s.moonScale, s.discScale, s.stars);
    e.setFloat3('sunDisc', s.sunDisc[0], s.sunDisc[1], s.sunDisc[2]);
    e.setFloat3('msColor', s.ms[0], s.ms[1], s.ms[2]);
    e.setFloat4('cloud', s.coverage, s.opacity, s.darkness, s.scale);
    e.setFloat4('cloud2', s.wind[0], s.wind[1], s.flash, atmo.time);
    e.setFloat3('cloudLit', s.cloudLit[0], s.cloudLit[1], s.cloudLit[2]);
    e.setFloat3('cloudShade', s.cloudShade[0], s.cloudShade[1], s.cloudShade[2]);
    e.setFloat4('skyTint', s.tint[0], s.tint[1], s.tint[2], s.horizonBlend);
    bindAerial(e);
  };
  return { mesh, material: mat, state, noise };
}
