// Pure Three.js migration of the canonical measured city kit.
// Sanctuary generation core shared by the runtime module (index.js) and the headless collider
// audit (audit.js): per-oath metadata, the build context S (frames, builders, instancer,
// collider adapter, reservations, NPC spots) and the city generator. No scene/GPU access here
// except through env hooks, so it also runs under Node.
import { OATHS, OATH_BY_ID, ROUTES } from '@shared/oaths.js';
import { SANCTUARY_HEIGHT, heightAt } from '@shared/terrain.js';
import { Frame, Builder, Instancer } from './builder.js';
import { M, mulberry, polar, TAU, angDiff, plaza, plazaRim, districts, cityWall, shrine, stall, brazier, lanternPost, circleArcs, rot2 } from './kit.js';
import { STYLES } from './cities.js';

/** Per-oath sanctuary metadata (centre, plaza height, orientation theta, road angles, style). */
export function computeMetas() {
  return OATHS.map((o) => {
    const [cx, cz] = o.center; const Y = SANCTUARY_HEIGHT[o.id];
    const roadsW = ROUTES.filter(([a, b]) => a === o.id || b === o.id).map(([a, b]) => { const other = OATH_BY_ID[a === o.id ? b : a]; return Math.atan2(other.center[0] - cx, other.center[1] - cz); });
    const sorted = [...roadsW].sort((a, b) => a - b);
    let best = 0, bestGap = -1;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i], b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU; const gap = b - a;
      if (gap > bestGap) { bestGap = gap; best = a + gap / 2; }
    }
    const theta = sorted.length ? best : 0;
    const style = STYLES[o.id];
    return { oath: o, id: o.id, cx, cz, Y, theta, c: Math.cos(theta), s: Math.sin(theta), roads: roadsW.map((a) => angDiff(a, theta)), style, state: 'none', built: false, building: false, skyline: null, main: [], detail: [], lights: [], anims: [], shadow: false };
  });
}

/** sanctuary-local (x,z) -> world (x,z) */
export const toWorld = (m, x, z) => [m.cx + x * m.c + z * m.s, m.cz - x * m.s + z * m.c];

export function materialsFor(m) {
  const st = m.style; const out = {};
  for (const [k, v] of Object.entries(st.mats)) out[k] = Array.isArray(v) ? M(v[0], v[1]) : v;
  out.banner = `banner:${m.id}`;
  out.glow = out.glow ?? M('emissive.glow', { emissive: st.flame ?? st.glow, emissiveIntensity: 2.4 });
  out.shrineGlow = M('emissive.glow', { emissive: st.glow, emissiveIntensity: 3.2 });
  out.water = out.water ?? M('liquid.water');
  out.fall = out.fall ?? M('liquid.fall');
  out.dark = out.dark ?? M('stone.basalt', { tint: '#121212' });
  return out;
}

/**
 * Build context for one sanctuary.
 * env: { ctx, scene, collision, lightBudget, qDensity, animMesh(S, name, x, y, z, ry, build, update) }
 */
export function makeContext(m, dry, env) {
  const { ctx, scene, collision } = env;
  const lightBudget = env.lightBudget ?? 0; const qDensity = env.qDensity ?? 1;
  const F = new Frame();
  const sil = dry ? [] : null;
  const S = {
    ctx, scene, meta: m, oath: m.oath, style: m.style, F, dry, sil,
    b: new Builder(F, { dry, sil }), d: new Builder(F, { dry: true }),
    inst: new Instancer(F, dry), rand: mulberry(m.oath.index * 7919 + 17), qDensity,
    roads: m.roads, gates: [], npcs: [], lights: [], anims: [], reserved: [], shrine: null, hallDoor: null, market: [],
    M: materialsFor(m),
  };
  if (!dry) S.d = new Builder(F, {});
  const Y = m.Y;
  S.world = (x, z) => { const [sx, sz] = F.xz(x, z); return toWorld(m, sx, sz); };
  S.gy = (x, z) => { const [wx, wz] = S.world(x, z); return heightAt(wx, wz) - Y - F.oy; };
  const yawW = (ry) => -(m.theta + F.yaw + ry);
  S.col = dry || !collision ? { box() {}, circle() {}, ramp() {} } : {
    box(x, z, hw, hd, ry, y0, y1, walk) { const [wx, wz] = S.world(x, z); collision.addBox(wx, wz, hw, hd, yawW(ry), Y + F.oy + y0, Y + F.oy + y1, { walkable: !!walk, tag: 'arch' }); },
    circle(x, z, r, y0, y1, walk) { const [wx, wz] = S.world(x, z); collision.addCircle(wx, wz, r, Y + F.oy + y0, Y + F.oy + y1, { walkable: !!walk, tag: 'arch' }); },
    ramp(x, z, hw, hd, ry, y0, y1) { const [wx, wz] = S.world(x, z); collision.addRamp(wx, wz, hw, hd, yawW(ry), Y + F.oy + y0, Y + F.oy + y1, { tag: 'arch' }); },
  };
  S.light = (x, y, z, color, range = 14, intensity = 1.5, priority = false) => {
    if (dry || !lightBudget) return;
    if (S.lights.length >= lightBudget && !priority) return;
    if (S.lights.length >= lightBudget + 1) return;
    const [wx, wz] = S.world(x, z);
    S.lights.push({ x: wx, y: Y + F.oy + y, z: wz, color, range, intensity });
  };
  S.reserve = (x, z, r) => { const [sx, sz] = F.xz(x, z); S.reserved.push([sx, sz, r]); };
  S.clear = (x, z, margin = 0) => {
    const [sx, sz] = F.xz(x, z);
    for (const a of S.roads) {
      const dx = Math.sin(a), dz = Math.cos(a); const t = sx * dx + sz * dz;
      if (t > 0 && Math.abs(sx * dz - sz * dx) < 9.5 + margin) return false;
    }
    for (const [rx, rz, rr] of S.reserved) if (Math.hypot(sx - rx, sz - rz) < rr + margin) return false;
    return true;
  };
  S.npc = (role, x, y, z, face = 0) => { const [wx, wz] = S.world(x, z); S.npcs.push({ x: wx, y: Y + F.oy + y, z: wz, ry: m.theta + F.yaw + face, role }); };
  S.anim = (fn) => { if (!dry) S.anims.push(fn); };
  /** QA landmarks (world space) for walkway tests: S.qaMark('viaduct', [[x,y,z],...]) in frame coords. */
  S.qa = {};
  S.qaMark = (kind, pts) => { if (dry) return; (S.qa[kind] ??= []).push(pts.map(([x, y, z]) => { const [wx, wz] = S.world(x, z); return [+wx.toFixed(2), +(Y + F.oy + y).toFixed(2), +wz.toFixed(2)]; })); };
  /** Separate animated mesh: build(fn(builder)) around a pivot; update(node, t) animates it. */
  S.animMesh = (name, x, y, z, ry, build, update) => { if (!dry && env.animMesh) env.animMesh(S, name, x, y, z, ry, build, update); };
  return S;
}

// ---------------------------------------------------------------- city generation
export function* cityGen(S) {
  const st = S.style;
  plaza(S); yield;
  plazaRim(S, st.rim ? st.rim(S) : {}); yield;
  st.hall(S); yield;
  market(S); yield;
  st.signature(S); yield;
  rimFurniture(S); yield;
  if (st.house) districts(S, st.house, st.districts || {});
  yield;
  if (st.wall !== 'none') cityWall(S, st.wallOpts ? st.wallOpts(S) : {});
  yield;
  shrine(S, 0, st.shrineZ ?? 31, st.shrine || {});
  placeNpcs(S);
}

function rimFurniture(S) {
  const st = S.style;
  if (st.rimFurniture) { st.rimFurniture(S); return; }
  const r = st.plaza === 'square' ? 43.5 : 45.6;
  const gaps = [...S.roads, 0, ...(st.extraGaps || [])];
  let i = 0;
  for (const [a0, a1] of circleArcs(r, gaps, 7)) {
    const n = Math.max(1, Math.round(((a1 - a0) * r) / 16));
    for (let k = 0; k <= n; k++) {
      const a = a0 + (a1 - a0) * (k / n); let [x, z] = polar(r, a);
      if (st.plaza === 'square') { const mm = Math.max(Math.abs(x), Math.abs(z)); x = x / mm * 43; z = z / mm * 43; }
      if (!S.clear(x, z, 0.5)) continue;
      if (st.lamp === 'lantern') lanternPost(S, x, z, 0.06, 3.6); else if (st.lamp !== 'none') brazier(S, x, z, 0.06, 1, (i++ % 3) === 0);
    }
  }
}

function market(S) {
  const a = S.roads.length ? S.roads[0] : Math.PI;
  const dx = Math.sin(a), dz = Math.cos(a); const px = dz, pz = -dx;
  const stalls = S.style.stalls ?? [56, 63, 70];
  for (const side of [1, -1]) {
    for (let k = 0; k < stalls.length; k++) {
      const t = stalls[k]; const off = 11.5;
      const x = dx * t + px * off * side, z = dz * t + pz * off * side;
      const face = Math.atan2(-px * side, -pz * side); // direction toward the road axis
      const ry = face + Math.PI; // frame -Z faces the axis
      if (!S.clear(x, z, 1.5) || Math.hypot(x, z) < 50) continue;
      S.F.push(x, 0.06, z, ry); stall(S, {}); S.F.pop();
      S.reserve(x, z, 3.2);
      S.market.push({ x, z, face, ry });
    }
  }
}

function placeNpcs(S) {
  S.npc('oathkeeper', 4.2, 0.16, (S.style.shrineZ ?? 31) - 1.5, Math.PI);
  if (S.market.length) {
    const m0 = S.market[1] || S.market[0]; const [ox, oz] = rot2(0, 1.0, m0.ry); S.npc('quartermaster', m0.x + ox, 0.06, m0.z + oz, m0.face);
    const m1 = S.market[S.market.length - 2] || S.market[0]; const [ax, az] = rot2(0, 1.0, m1.ry); S.npc('artisan', m1.x + ax, 0.06, m1.z + az, m1.face);
  }
  S.npc('trainer', -27, 0.16, 4, Math.PI / 2 - 0.15);
  const door = S.hallDoor || { x: 0, y: 0.16, z: 40 };
  S.npc('chronicler', door.x + 2.2, door.y, door.z - 1.2, Math.PI);
  S.gates.slice(0, 2).forEach((g) => { const y = S.gy(g.x, g.z) + 0.05; S.npc('warden', g.x, y, g.z, g.a); });
  if (S.gates.length < 2) { const a = S.roads[0] ?? Math.PI; const [x, z] = polar(50, a); S.npc('warden', x + Math.cos(a) * 4, 0.06, z - Math.sin(a) * 4, a); }
  S.spawn = { local: [0, 0.16, -12] };
}
