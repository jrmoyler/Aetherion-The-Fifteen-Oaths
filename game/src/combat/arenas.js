// PvP arenas in the world: the duel ring (orange curtain while a duel you take part in or watch is
// running) and the boundaries of the contested border war zones (red curtain, only built when near).
// Terrain-following ribbons with a vertical alpha gradient; a handful of draw calls at most.
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const WAR_SHOW = 420; // build / show a war-zone curtain within this distance of its edge

export function createArenas(ctx) {
  const scene = ctx.scene;
  const bus = ctx.bus;
  const groundY = (x, z) => {
    try { const h = ctx.world?.heightAt?.(x, z); if (Number.isFinite(h)) return Math.max(h, ctx.world?.waterLevel ?? -1e9); } catch { /* ignore */ }
    try { const g = ctx.collision?.groundAt?.(x, z, 400); if (Number.isFinite(g)) return g; } catch { /* ignore */ }
    return 0;
  };

  let gradTex = null;
  function gradient() {
    if (gradTex) return gradTex;
    gradTex = new DynamicTexture('arenaGrad', { width: 4, height: 128 }, scene, false);
    const c = gradTex.getContext();
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(0.92, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0.6)');
    c.fillStyle = g; c.fillRect(0, 0, 4, 128);
    gradTex.hasAlpha = true; gradTex.update(false);
    return gradTex;
  }
  function material(name, hex, alpha) {
    const m = new StandardMaterial(name, scene);
    m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex); m.diffuseColor = Color3.Black();
    m.opacityTexture = gradient(); m.alpha = alpha; m.backFaceCulling = false; m.disableDepthWrite = true; m.fogEnabled = true;
    return m;
  }
  /** Vertical curtain along a circle that follows the ground. */
  function curtain(name, x, z, r, height, segs, mat) {
    const lo = [], hi = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const y = groundY(px, pz);
      lo.push(new Vector3(px, y - 0.2, pz)); hi.push(new Vector3(px, y + height, pz));
    }
    const m = MeshBuilder.CreateRibbon(name, { pathArray: [hi, lo], closePath: false, sideOrientation: 2, updatable: false }, scene);
    m.material = mat; m.isPickable = false; m.renderingGroupId = 1; m.alwaysSelectAsActiveMesh = false;
    return m;
  }

  // ---------- duel ring
  let duelMesh = null, duelId = null, duelMat = null;
  function showDuel(e) {
    if (!e || e.state === 'end') { hideDuel(e?.id); return; }
    if (duelId === e.id && duelMesh) return;
    hideDuel();
    duelMat ??= material('duelRingMat', '#ffa040', 0.75);
    duelMesh = curtain(`duelRing:${e.id}`, e.x, e.z, e.r, 2.6, 96, duelMat);
    duelId = e.id;
  }
  function hideDuel(id) { if (id != null && id !== duelId) return; duelMesh?.dispose(); duelMesh = null; duelId = null; }
  bus.on('social:duel', (e) => { try { showDuel(e); } catch (err) { console.warn('[combat] duel ring', err); } });
  bus.on('social:duelNearby', (e) => { try { showDuel(e); } catch (err) { console.warn('[combat] duel ring', err); } });

  // ---------- war zones
  const zones = new Map(); // id -> {zone, mesh}
  let warMat = null;
  function updateWar() {
    const list = ctx.net?.social?.warZones ?? [];
    const p = ctx.actors?.player?.position;
    if (!p || !list.length) return;
    for (const w of list) {
      const edge = Math.abs(Math.hypot(p.x - w.x, p.z - w.z) - w.r);
      let z = zones.get(w.id);
      const near = edge < WAR_SHOW;
      if (near && !z) {
        warMat ??= material('warZoneMat', '#ff4a3a', 0.55);
        z = { zone: w, mesh: curtain(`warZone:${w.id}`, w.x, w.z, w.r, 9, 220, warMat) };
        zones.set(w.id, z);
      } else if (!near && z && edge > WAR_SHOW * 1.4) { z.mesh.dispose(); zones.delete(w.id); }
    }
  }

  let acc = 0, t = 0;
  return {
    update(dt) {
      t += dt; acc += dt;
      if (acc > 1) { acc = 0; updateWar(); }
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      if (warMat) warMat.alpha = 0.4 + 0.2 * pulse;
      if (duelMat) duelMat.alpha = 0.6 + 0.25 * pulse;
    },
    dispose() { hideDuel(); for (const z of zones.values()) z.mesh.dispose(); zones.clear(); },
  };
}
