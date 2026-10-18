// Ocean (Gerstner waves, fresnel sky reflection from the IBL probe, sun glint, depth colour from a
// coarse world heightmap, shore transparency + foam) and the shallow marsh pools of Bitterglass.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { AERIAL_GLSL, AERIAL_UNIFORMS, bindAerial, atmo } from '../render/atmosphere.js';
import { MARSH_LEVEL, SEA_LEVEL } from '@shared/terrain.js';
import { OATH_BY_ID } from '@shared/oaths.js';

const VERT = /* glsl */`
precision highp float;
attribute vec3 position;
uniform mat4 world; uniform mat4 viewProjection;
uniform vec4 wP; // x time, y wave scale, z level, w kind (0 ocean, 1 marsh)
uniform vec3 camPos;
varying vec3 vW; varying vec3 vN; varying float vCrest;
vec3 gerstner(vec2 p, vec2 d, float lambda, float A, float Q, float t, inout vec3 n, inout float crest) {
  float k = 6.2831853 / lambda; float w = sqrt(9.8 * k); float ph = k * dot(d, p) - w * t;
  float c = cos(ph), s = sin(ph);
  n.x -= d.x * k * A * c; n.z -= d.y * k * A * c; n.y -= Q * k * A * s;
  crest += max(s, 0.0) * Q;
  return vec3(Q * A * d.x * c, A * s, Q * A * d.y * c);
}
void main() {
  vec4 wp = world * vec4(position, 1.0);
  float dist = length(wp.xz - camPos.xz);
  float amp = wP.y * (1.0 - smoothstep(250.0, 1400.0, dist));
  vec3 n = vec3(0.0, 1.0, 0.0); float crest = 0.0; vec3 o = vec3(0.0);
  if (wP.w < 0.5 && amp > 0.001) {
    float t = wP.x;
    o += gerstner(wp.xz, normalize(vec2(0.8, 0.6)), 38.0, 0.55 * amp, 0.55, t, n, crest);
    o += gerstner(wp.xz, normalize(vec2(0.3, 0.95)), 21.0, 0.32 * amp, 0.6, t, n, crest);
    o += gerstner(wp.xz, normalize(vec2(-0.6, 0.8)), 11.0, 0.16 * amp, 0.5, t, n, crest);
    o += gerstner(wp.xz, normalize(vec2(0.95, -0.3)), 6.5, 0.08 * amp, 0.45, t, n, crest);
  }
  wp.xyz += o; wp.y += wP.z;
  vW = wp.xyz; vN = normalize(n); vCrest = crest;
  gl_Position = viewProjection * wp;
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vW; varying vec3 vN; varying float vCrest;
uniform vec4 wP; uniform vec3 camPos;
uniform samplerCube envTex; uniform sampler2D noiseTex; uniform sampler2D hmTex;
uniform vec4 hmP;      // x -E, y 1/(2E), z hEnc offset, w hEnc scale
uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 ambCol;
uniform vec3 shallowCol; uniform vec3 deepCol; uniform vec4 wP2; // x reflect strength, y foam, z env available, w detail normal strength
${AERIAL_GLSL}
float hN(vec2 uv) { return texture2D(noiseTex, uv).r; }
void main() {
  vec3 V = camPos - vW; float dist = length(V); V /= dist;
  float t = wP.x;
  // detail normals: two scrolling noise layers
  vec2 uv1 = vW.xz * 0.045 + vec2(t * 0.012, t * 0.008), uv2 = vW.xz * 0.11 - vec2(t * 0.017, -t * 0.011);
  float e = 0.004;
  float a0 = hN(uv1) + hN(uv2) * 0.6;
  float ax = hN(uv1 + vec2(e, 0.0)) + hN(uv2 + vec2(e, 0.0)) * 0.6;
  float az = hN(uv1 + vec2(0.0, e)) + hN(uv2 + vec2(0.0, e)) * 0.6;
  float ds = wP2.w * (1.0 - smoothstep(80.0, 700.0, dist));
  vec3 N = normalize(vN + vec3(a0 - ax, 0.0, a0 - az) * ds * 6.0);
  // water depth from the world heightmap
  vec2 huv = (vW.xz - hmP.x) * hmP.y;
  float hEnc = texture2D(hmTex, huv).r;
  float ground = hEnc * hmP.w + hmP.z;
  float depth = max(vW.y - ground, 0.0);
  if (huv.x < 0.0 || huv.y < 0.0 || huv.x > 1.0 || huv.y > 1.0) depth = 60.0;
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
  vec3 refl = (wP2.z > 0.5 ? textureCube(envTex, R).rgb : ambCol * 1.4) * mix(vec3(0.62, 0.74, 0.86), vec3(1.0), smoothstep(0.05, 0.5, R.y));
  vec3 absorb = mix(shallowCol, deepCol, 1.0 - exp(-depth * 0.12));
  vec3 body = absorb * (sunCol * max(sunDir.y, 0.0) * 0.75 + ambCol * 1.3);
  body += shallowCol * sunCol * 0.18 * smoothstep(0.0, 1.5, vCrest) * max(sunDir.y, 0.0); // light through crests
  vec3 col = mix(body, refl * wP2.x, F);
  // sun glint
  float sp = max(dot(R, sunDir), 0.0);
  col += sunCol * (pow(sp, 900.0) * 60.0 + pow(sp, 90.0) * 0.6) * (0.4 + 0.6 * F) * step(0.0, sunDir.y);
  // foam: shoreline + crests
  float fn = texture2D(noiseTex, vW.xz * 0.09 + vec2(t * 0.02, t * 0.013)).b;
  float shoreFoam = smoothstep(1.4, 0.1, depth) * smoothstep(0.3, 0.7, fn + 0.25 * sin(t * 1.5 + depth * 4.0));
  float crestFoam = smoothstep(1.25, 1.9, vCrest) * smoothstep(0.45, 0.8, fn);
  float foam = clamp((shoreFoam + crestFoam) * wP2.y, 0.0, 1.0);
  col = mix(col, vec3(0.9, 0.93, 0.95) * (sunCol * max(sunDir.y, 0.05) * 0.8 + ambCol * 1.2), foam);
  float alpha = clamp(depth * 0.9, 0.0, 1.0);
  alpha = max(alpha, foam * 0.9);
  alpha = mix(alpha, 1.0, F * 0.6);
  col = aeApply(col, vW);
  gl_FragColor = vec4(col, alpha);
}`;

function radialGrid(rings, seg) {
  const pos = [0, 0, 0]; const idx = [];
  for (let r = 1; r <= rings.length; r++) { const rad = rings[r - 1]; for (let s = 0; s < seg; s++) { const a = (s / seg) * Math.PI * 2; pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad); } }
  for (let s = 0; s < seg; s++) idx.push(0, 1 + ((s + 1) % seg), 1 + s);
  for (let r = 1; r < rings.length; r++) for (let s = 0; s < seg; s++) {
    const a = 1 + (r - 1) * seg + s, b = 1 + (r - 1) * seg + ((s + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; return vd;
}

export function createWater(ctx, noiseTex) {
  const { scene, quality } = ctx;
  Effect.ShadersStore.aeWaterVertexShader = VERT;
  Effect.ShadersStore.aeWaterFragmentShader = FRAG;
  const E = 3328; const HM = quality.name === 'low' ? 256 : 512;
  const hmData = new Uint8Array(HM * HM); hmData.fill(0);
  const hmTex = RawTexture.CreateLuminanceTexture(hmData, HM, HM, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  hmTex.wrapU = hmTex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const H0 = -40, HS = 60; // encoded range [-40, 20]

  const makeMat = (name, kind) => {
    const m = new ShaderMaterial(name, scene, { vertex: 'aeWater', fragment: 'aeWater' }, {
      attributes: ['position'], needAlphaBlending: true,
      uniforms: ['world', 'viewProjection', 'wP', 'camPos', 'hmP', 'sunDir', 'sunCol', 'ambCol', 'shallowCol', 'deepCol', 'wP2', ...AERIAL_UNIFORMS],
      samplers: ['envTex', 'noiseTex', 'hmTex'],
    });
    m.backFaceCulling = false; m.alphaMode = Constants.ALPHA_COMBINE; m.metadata = { noAerial: true };
    m.setTexture('noiseTex', noiseTex); m.setTexture('hmTex', hmTex);
    m.state = { kind, level: kind ? MARSH_LEVEL : SEA_LEVEL, wave: kind ? 0 : 1, shallow: [0.05, 0.5, 0.52], deep: [0.01, 0.075, 0.14], reflect: 0.5, foam: 1, detail: kind ? 0.5 : 1 };
    m.onBind = () => {
      const e = m.getEffect(); if (!e) return; const s = m.state; const cam = scene.activeCamera; const cp = cam ? (cam.globalPosition ?? cam.position) : atmo.camPos;
      e.setFloat4('wP', atmo.time, s.wave, s.level, s.kind);
      e.setFloat3('camPos', cp.x, cp.y, cp.z);
      e.setFloat4('hmP', -E, 1 / (2 * E), H0, HS);
      const L = atmo.lightDir; e.setFloat3('sunDir', L.x, L.y, L.z);
      const sun = ctx.render?.sun; const si = sun ? sun.intensity : 3; const sd = sun ? sun.diffuse : { r: 1, g: 1, b: 1 };
      e.setFloat3('sunCol', sd.r * si, sd.g * si, sd.b * si);
      const f = atmo.fogColor; e.setFloat3('ambCol', f.r * 0.55, f.g * 0.6, f.b * 0.65);
      e.setFloat3('shallowCol', s.shallow[0], s.shallow[1], s.shallow[2]); e.setFloat3('deepCol', s.deep[0], s.deep[1], s.deep[2]);
      const env = scene.environmentTexture; if (env) e.setTexture('envTex', env);
      e.setFloat4('wP2', s.reflect, s.foam, env ? 1 : 0, s.detail);
      bindAerial(e);
    };
    return m;
  };

  // ocean: radial grid following the camera
  const rings = []; let r = 2; while (r < 9500) { rings.push(r); r *= r < 60 ? 1.18 : r < 600 ? 1.1 : 1.22; } rings.push(9800);
  const ocean = new Mesh('ocean', scene); radialGrid(rings, quality.name === 'low' ? 64 : 128).applyToMesh(ocean);
  const oceanMat = makeMat('oceanMat', 0); ocean.material = oceanMat;
  ocean.isPickable = false; ocean.alwaysSelectAsActiveMesh = true; ocean.alphaIndex = 10;
  if (quality.water === 'simple') oceanMat.state.detail = 0.6;

  // marsh pools around the Bitterglass Guild
  const bc = OATH_BY_ID['oath-08'].center;
  const marsh = new Mesh('marshWater', scene); radialGrid([40, 90, 160, 260, 380, 520, 640], 64).applyToMesh(marsh);
  marsh.position.set(bc[0], 0, bc[1]);
  const marshMat = makeMat('marshMat', 1); marsh.material = marshMat; marsh.isPickable = false; marsh.alphaIndex = 9;
  Object.assign(marshMat.state, { shallow: [0.14, 0.17, 0.06], deep: [0.025, 0.035, 0.012], reflect: 0.55, foam: 0.15 });
  marsh.computeWorldMatrix(true); marsh.freezeWorldMatrix();

  function setHeightmap(hm) {
    const d = new Uint8Array(HM * HM);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, ((hm[i] - H0) / HS) * 255));
    hmTex.update(d);
  }

  function update() {
    const cam = scene.activeCamera; if (!cam) return; const p = cam.globalPosition ?? cam.position;
    ocean.position.set(Math.round(p.x / 16) * 16, 0, Math.round(p.z / 16) * 16);
    // shift palettes slightly toward Tidal turquoise in the south-west bay
    const tid = OATH_BY_ID['oath-04'].center; const dT = Math.hypot(p.x - tid[0], p.z - tid[1]);
    const k = Math.max(0, Math.min(1, 1 - (dT - 400) / 1600));
    const s = oceanMat.state; s.shallow[0] = 0.07 - 0.03 * k; s.shallow[1] = 0.38 + 0.2 * k; s.shallow[2] = 0.44 + 0.12 * k;
  }

  return { update, setHeightmap, HM, E, ocean, marsh, oceanMat, marshMat };
}
