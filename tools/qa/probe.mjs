// Perf probe: node tools/qa/probe.mjs <url> [waitMs]
import { chromium } from '../../game/node_modules/playwright/index.mjs';
const [url, wait = '45000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(url); await p.waitForTimeout(+wait);
const r = await p.evaluate(async () => {
  const gl = window.__aetherion.engine._gl; let n = 0; const fr = [];
  for (const f of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) { const o = gl[f].bind(gl); gl[f] = (...a) => { n++; return o(...a); }; }
  const sc = window.__aetherion.scene; let phase = {}; let cur = 'pre';
  sc.onBeforeRenderObservable.add(() => { n = 0; });
  sc.onAfterRenderObservable.add(() => { fr.push(n); });
  sc.onBeforeShadowMapRenderingObservable?.add(()=>{});
  await new Promise((res) => setTimeout(res, 15000));
  const realDraws = fr.slice(-3);
  const c = window.__aetherion, s = c.scene, e = c.engine;
  const groups = {};
  for (const m of Array.from({length:s.getActiveMeshes().length},(_,i)=>s.getActiveMeshes().data[i])) {
    const k = (m.name || '?').replace(/[-_:#.\d]+.*$/, '').slice(0, 24);
    const g = (groups[k] ??= { n: 0, sub: 0, inst: 0 }); g.n++; g.sub += m.subMeshes?.length ?? 1; g.inst += m.thinInstanceCount || 0;
  }
  const sg = c.render?.shadows; const casters = sg?.getShadowMap?.()?.renderList?.length;
  const rtts = s.customRenderTargets.length + (s.activeCamera?.customRenderTargets?.length || 0);
  return { realDraws, draw: e._drawCalls?.current, active: s.getActiveMeshes().length, meshes: s.meshes.length, materials: s.materials.length, lights: s.lights.length, casters, cascades: sg?.numCascades, rtts, postProcesses: s.activeCamera?._postProcesses?.length, probes: s.reflectionProbes?.length, particles: s.particleSystems.length, groups: Object.entries(groups).sort((a, b) => b[1].sub - a[1].sub).slice(0, 25) };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
