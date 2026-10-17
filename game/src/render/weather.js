// Weather: GPU particles around the camera (rain, snow, ash + embers, storm, mist), quality
// scaled, plus the atmospheric side effects (cloud cover, fog, wetness, lightning flashes).
import { GPUParticleSystem } from '@babylonjs/core/Particles/gpuParticleSystem.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { BoxParticleEmitter } from '@babylonjs/core/Particles/EmitterTypes/boxParticleEmitter.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import '@babylonjs/core/Particles/particleSystemComponent.js';
import '@babylonjs/core/Particles/webgl2ParticleSystem.js';

function spriteTexture(scene, kind) {
  const S = 64; const t = new DynamicTexture(`wx_${kind}`, { width: S, height: S }, scene, true);
  const c = t.getContext(); c.clearRect(0, 0, S, S);
  if (kind === 'streak') {
    const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(S / 2 - 2, 0, 4, S);
  } else if (kind === 'flake') {
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  } else if (kind === 'ash') {
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.moveTo(20, 18); c.lineTo(46, 24); c.lineTo(40, 46); c.lineTo(18, 40); c.closePath(); c.fill();
  } else { // mist puff
    for (let i = 0; i < 18; i++) { const x = 16 + Math.random() * 32, y = 16 + Math.random() * 32, r = 10 + Math.random() * 14;
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); }
  }
  t.hasAlpha = true; t.update(true);
  return t;
}

export function createWeather(scene, quality) {
  const useGPU = GPUParticleSystem.IsSupported;
  const q = quality.particles ?? 1;
  const emitter = new Vector3();
  const tex = {};
  const getTex = (k) => (tex[k] ??= spriteTexture(scene, k));
  const systems = {};

  function make(name, cap, setup) {
    const n = Math.max(50, Math.round(cap * q));
    let ps;
    try { ps = useGPU ? new GPUParticleSystem(name, { capacity: n }, scene) : new ParticleSystem(name, Math.min(n, 3000), scene); }
    catch { ps = new ParticleSystem(name, Math.min(n, 3000), scene); }
    ps.emitter = emitter;
    ps.updateSpeed = 0.016;
    setup(ps, n);
    ps.stop();
    ps._baseRate = ps.emitRate;
    return ps;
  }
  const box = (ps, x, y0, y1) => { const e = new BoxParticleEmitter(); e.minEmitBox = new Vector3(-x, y0, -x); e.maxEmitBox = new Vector3(x, y1, x); ps.particleEmitterType = e; return e; };

  systems.rain = make('wxRain', 9000, (ps, n) => {
    ps.particleTexture = getTex('streak');
    const e = box(ps, 40, 6, 34); e.direction1 = new Vector3(-0.6, -1, -0.3); e.direction2 = new Vector3(-0.4, -1, -0.1);
    ps.minSize = 0.05; ps.maxSize = 0.07; ps.minScaleY = 9; ps.maxScaleY = 14;
    ps.minLifeTime = 0.9; ps.maxLifeTime = 1.3; ps.minEmitPower = 22; ps.maxEmitPower = 28;
    ps.emitRate = n / 1.1; ps.gravity = new Vector3(0, -9, 0);
    ps.color1 = new Color4(0.7, 0.75, 0.82, 0.35); ps.color2 = new Color4(0.6, 0.65, 0.72, 0.25); ps.colorDead = new Color4(0.6, 0.65, 0.7, 0);
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  });
  systems.snow = make('wxSnow', 6000, (ps, n) => {
    ps.particleTexture = getTex('flake');
    const e = box(ps, 34, 2, 26); e.direction1 = new Vector3(-0.4, -1, -0.2); e.direction2 = new Vector3(0.4, -1, 0.3);
    ps.minSize = 0.04; ps.maxSize = 0.11; ps.minLifeTime = 6; ps.maxLifeTime = 9; ps.minEmitPower = 1.2; ps.maxEmitPower = 2.4;
    ps.emitRate = n / 7; ps.gravity = new Vector3(0.3, -0.4, 0.1);
    ps.color1 = new Color4(1, 1, 1, 0.9); ps.color2 = new Color4(0.9, 0.95, 1, 0.7); ps.colorDead = new Color4(1, 1, 1, 0);
    ps.minAngularSpeed = -1; ps.maxAngularSpeed = 1; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  });
  systems.ash = make('wxAsh', 3000, (ps, n) => {
    ps.particleTexture = getTex('ash');
    const e = box(ps, 34, 0, 22); e.direction1 = new Vector3(-0.5, -0.4, -0.3); e.direction2 = new Vector3(0.5, -0.1, 0.4);
    ps.minSize = 0.03; ps.maxSize = 0.09; ps.minLifeTime = 6; ps.maxLifeTime = 10; ps.minEmitPower = 0.4; ps.maxEmitPower = 1.2;
    ps.emitRate = n / 8; ps.gravity = new Vector3(0.25, -0.15, 0.05);
    ps.color1 = new Color4(0.22, 0.2, 0.19, 0.9); ps.color2 = new Color4(0.4, 0.37, 0.34, 0.7); ps.colorDead = new Color4(0.3, 0.3, 0.3, 0);
    ps.minAngularSpeed = -2; ps.maxAngularSpeed = 2; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  });
  systems.embers = make('wxEmbers', 700, (ps, n) => {
    ps.particleTexture = getTex('flake');
    const e = box(ps, 30, -2, 8); e.direction1 = new Vector3(-0.3, 1, -0.3); e.direction2 = new Vector3(0.3, 1, 0.3);
    ps.minSize = 0.03; ps.maxSize = 0.07; ps.minLifeTime = 3; ps.maxLifeTime = 6; ps.minEmitPower = 0.6; ps.maxEmitPower = 1.6;
    ps.emitRate = n / 5; ps.gravity = new Vector3(0.2, 0.25, 0);
    ps.color1 = new Color4(4, 1.4, 0.3, 1); ps.color2 = new Color4(3, 0.8, 0.15, 1); ps.colorDead = new Color4(1, 0.2, 0, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  });
  systems.mist = make('wxMist', 260, (ps, n) => {
    ps.particleTexture = getTex('mist');
    const e = box(ps, 45, -1, 4); e.direction1 = new Vector3(-0.2, 0, -0.1); e.direction2 = new Vector3(0.2, 0.05, 0.1);
    ps.minSize = 9; ps.maxSize = 18; ps.minLifeTime = 10; ps.maxLifeTime = 16; ps.minEmitPower = 0.2; ps.maxEmitPower = 0.6;
    ps.emitRate = n / 13; ps.gravity = new Vector3(0, 0, 0);
    ps.color1 = new Color4(0.85, 0.88, 0.9, 0.1); ps.color2 = new Color4(0.8, 0.84, 0.86, 0.06); ps.colorDead = new Color4(0.8, 0.8, 0.8, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  });

  const KIND = {
    clear: { rain: 0, snow: 0, ash: 0, embers: 0, mist: 0, cover: 0.4, fog: 1, wet: 0, dark: 0.3, light: 1 },
    rain: { rain: 1, mist: 0.3, cover: 0.85, fog: 1.8, wet: 1, dark: 0.75, light: 0.45 },
    snow: { snow: 1, mist: 0.2, cover: 0.8, fog: 2.0, wet: 0, dark: 0.45, light: 0.6, snowCover: 1 },
    ash: { ash: 1, embers: 1, cover: 0.6, fog: 1.25, wet: 0, dark: 0.6, light: 0.7 },
    storm: { rain: 1.3, mist: 0.4, cover: 0.97, fog: 2.2, wet: 1, dark: 0.95, light: 0.3, lightning: 1 },
    mist: { mist: 1, cover: 0.55, fog: 3.0, wet: 0.3, dark: 0.4, light: 0.75 },
  };
  const cur = { kind: 'clear', intensity: 0 };
  const out = { cover: 0.4, fogMul: 1, wet: 0, dark: 0.3, light: 1, flash: 0, snowCover: 0 };
  let lightningT = 4 + Math.random() * 6, flashT = 0, flashSeq = [];

  function setWeather(kind, intensity = 1) {
    if (!KIND[kind]) kind = 'clear';
    cur.kind = kind; cur.intensity = Math.max(0, Math.min(1, intensity));
  }

  function update(dt, camPos, camDir) {
    // keep the emitter slightly ahead of the camera so particles fill the view
    emitter.set(camPos.x + camDir.x * 12, camPos.y, camPos.z + camDir.z * 12);
    const k = KIND[cur.kind], it = cur.intensity;
    for (const name of Object.keys(systems)) {
      const ps = systems[name]; const target = (k[name] ?? 0) * it;
      if (target > 0.01) { ps.emitRate = ps._baseRate * target; if (!ps.isStarted()) ps.start(); }
      else if (ps.isStarted()) ps.stop();
    }
    const lerp = (a, b, t) => a + (b - a) * t; const c = KIND.clear; const r = Math.min(1, dt * 0.5);
    out.cover = lerp(out.cover, lerp(c.cover, k.cover, it), r);
    out.fogMul = lerp(out.fogMul, lerp(1, k.fog, it), r);
    out.wet = lerp(out.wet, (k.wet ?? 0) * it, Math.min(1, dt * 0.15));
    out.dark = lerp(out.dark, lerp(c.dark, k.dark, it), r);
    out.light = lerp(out.light, lerp(1, k.light, it), r);
    out.snowCover = lerp(out.snowCover, (k.snowCover ?? 0) * it, Math.min(1, dt * 0.05));
    // lightning
    out.flash = 0;
    if (k.lightning && it > 0.2) {
      lightningT -= dt;
      if (lightningT <= 0) { lightningT = 3 + Math.random() * 9 / it; flashT = 0; flashSeq = [0, 0.07, 0.16, 0.3].map((t, i) => [t, i === 0 ? 1 : 0.4 + Math.random() * 0.6]); }
      if (flashSeq.length) {
        flashT += dt;
        for (const [t, a] of flashSeq) { const d = flashT - t; if (d >= 0 && d < 0.09) out.flash = Math.max(out.flash, a * (1 - d / 0.09)); }
        if (flashT > 0.5) flashSeq = [];
      }
    }
    return out;
  }
  return { setWeather, update, state: cur, out, systems };
}
