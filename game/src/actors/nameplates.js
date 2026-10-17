// Billboard nameplates (DynamicTexture text, crisp at any distance, colour by kind/hostility,
// level, compact HP bar) and the ground selection ring for the current target.
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { OATH_BY_ID } from '@shared/oaths.js';

const W = 512, H = 128;
const ROLE_COL = { common: '#e2b49a', veteran: '#f0a060', elite: '#ff8a5a', boss: '#ff5a4a' };
const FONT = '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

export class Nameplates {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.plates = new Set();
    this.tmp = new Vector3();
    // shared HP bar materials
    const mk = (name, c, a = 1) => { const m = new StandardMaterial(name, this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(c); m.alpha = a; m.backFaceCulling = false; m.fogEnabled = false; return m; };
    this.barBg = mk('np.barBg', '#120c0a', 0.75);
    this.barMob = mk('np.barMob', '#b8402a');
    this.barFriend = mk('np.barFriend', '#5aa060');
    this.barBack = mk('np.barTrail', '#e8c890');
    this.bgTemplate = MeshBuilder.CreatePlane('np.bgTpl', { width: 1, height: 1 }, this.scene); this.bgTemplate.isVisible = false;
    this.ring = this._makeRing();
    this.targetId = null;
  }

  create(actor) {
    const plane = MeshBuilder.CreatePlane(`np:${actor.id}`, { width: 1.6, height: 0.4 }, this.scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    plane.renderingGroupId = 1;
    const tex = new DynamicTexture(`npTex:${actor.id}`, { width: W, height: H }, this.scene, true);
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`npMat:${actor.id}`, this.scene);
    mat.diffuseTexture = tex; mat.emissiveTexture = tex; mat.opacityTexture = tex; mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true; mat.backFaceCulling = false; mat.fogEnabled = false; mat.disableDepthWrite = true;
    plane.material = mat;
    // HP bar
    const bg = MeshBuilder.CreatePlane(`npBg:${actor.id}`, { width: 1, height: 1 }, this.scene);
    bg.parent = plane; bg.position.set(0, -0.15, 0.001); bg.scaling.set(0.9, 0.055, 1); bg.material = this.barBg; bg.isPickable = false; bg.renderingGroupId = 1;
    const fill = MeshBuilder.CreatePlane(`npFill:${actor.id}`, { width: 1, height: 1 }, this.scene);
    fill.parent = plane; fill.position.set(0, -0.15, -0.001); fill.scaling.set(0.88, 0.038, 1); fill.isPickable = false; fill.renderingGroupId = 1;
    fill.material = actor.kind === 'mob' ? this.barMob : this.barFriend;
    const p = { actor, plane, tex, mat, bg, fill, drawn: '', hpShown: -1, visible: true };
    this.plates.add(p);
    this.redraw(p);
    return p;
  }

  redraw(p) {
    const a = p.actor;
    const key = `${a.name}|${a.level}|${a.kind}|${a.role ?? ''}|${a.alive}|${a.title ?? ''}`;
    if (key === p.drawn) return;
    p.drawn = key;
    const ctx = p.tex.getContext();
    ctx.clearRect(0, 0, W, H);
    const col = a.kind === 'mob' ? (ROLE_COL[a.role] ?? ROLE_COL.common) : a.kind === 'npc' ? '#e8d49a' : (a.isSelf ? '#f4ecd8' : (OATH_BY_ID[a.oath]?.accent ? mixHex(OATH_BY_ID[a.oath].accent, '#f4ecd8', 0.55) : '#e8e4da'));
    const name = a.name ?? '';
    const sub = a.kind === 'npc' ? (a.title ?? '') : a.kind === 'mob' && a.role && a.role !== 'common' ? a.role.toUpperCase() : '';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 46;
    ctx.font = `600 ${size}px ${FONT}`;
    while (ctx.measureText(name).width > W - 120 && size > 26) { size -= 2; ctx.font = `600 ${size}px ${FONT}`; }
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(8,6,6,0.85)'; ctx.lineJoin = 'round';
    const y = sub ? 50 : 58;
    ctx.strokeText(name, W / 2 + 18, y);
    ctx.fillStyle = a.alive === false ? '#8a8480' : col;
    ctx.fillText(name, W / 2 + 18, y);
    // level badge (diamond)
    const tw = ctx.measureText(name).width;
    const bx = W / 2 + 18 - tw / 2 - 34, by = y;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(14,10,8,0.82)'; ctx.fillRect(-17, -17, 34, 34);
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.strokeRect(-17, -17, 34, 34);
    ctx.restore();
    ctx.font = `700 24px ${FONT}`; ctx.fillStyle = '#f4ecd8'; ctx.fillText(String(a.level ?? 1), bx, by + 1);
    if (sub) {
      ctx.font = `600 24px ${FONT}`; ctx.lineWidth = 5; ctx.strokeText(sub, W / 2, 92);
      ctx.fillStyle = 'rgba(232,220,196,0.9)'; ctx.fillText(sub, W / 2, 92);
    }
    p.tex.update(true);
  }

  remove(p) {
    if (!p) return;
    this.plates.delete(p);
    p.fill.dispose(); p.bg.dispose(); p.plane.dispose(); p.mat.dispose(); p.tex.dispose();
  }

  setTarget(id) { this.targetId = id; }

  update(dt, camera, player) {
    if (!camera) return;
    const cam = camera.globalPosition ?? camera.position;
    for (const p of this.plates) {
      const a = p.actor;
      const pos = a.root.position;
      const d = Vector3.Distance(cam, pos);
      const targeted = this.targetId === a.id;
      const range = a.kind === 'player' ? 45 : a.kind === 'npc' ? 28 : 34;
      let show = a.visible && !a.isSelf && (d < range || targeted) && !(a.alive === false && !targeted && a.deadT > 2.5);
      if (show !== p.visible) { p.visible = show; p.plane.setEnabled(show); }
      if (!show) continue;
      this.redraw(p);
      const s = Math.min(2.2, Math.max(0.55, 0.42 + d * 0.032));
      p.plane.scaling.set(s, s, s);
      p.plane.position.set(pos.x, pos.y + a.headY + 0.18 * s, pos.z);
      // fade with distance
      const fade = targeted ? 1 : Math.min(1, (range - d) / 6);
      p.mat.alpha = Math.max(0.05, fade);
      // HP bar: mobs when hurt or targeted, players/npcs when hurt
      const frac = a.mhp > 0 ? Math.max(0, Math.min(1, a.hp / a.mhp)) : 1;
      const showBar = a.alive !== false && (targeted || frac < 0.999) && a.kind !== 'npc';
      p.bg.setEnabled(showBar); p.fill.setEnabled(showBar);
      if (showBar && p.hpShown !== frac) {
        p.hpShown = frac;
        p.fill.scaling.x = 0.88 * Math.max(0.001, frac);
        p.fill.position.x = -0.44 * (1 - frac);
      }
    }
    // selection ring
    const r = this.ring;
    const ta = this.targetId != null ? this.ctx.actors?.get?.(this.targetId) : null;
    if (ta && ta.visible) {
      r.setEnabled(true);
      const rad = (ta.radius ?? 0.5) * (ta.root.scaling.x || 1) * 1.7 + 0.25;
      r.scaling.set(rad, rad, rad);
      const tp = ta.root.position;
      const gy = this.ctx.collision?.groundAt?.(tp.x, tp.z, tp.y + 0.5) ?? tp.y;
      r.position.set(tp.x, Math.max(gy, tp.y - 0.4) + 0.06, tp.z);
      r.rotation.y += dt * 0.6;
      const hostile = ta.kind === 'mob';
      r.material.emissiveColor.copyFrom(hostile ? this.ringHostile : this.ringFriend);
      r.material.alpha = 0.75 + Math.sin(performance.now() * 0.004) * 0.15;
    } else r.setEnabled(false);
    void player;
  }

  _makeRing() {
    const size = 256;
    const tex = new DynamicTexture('selRingTex', { width: size, height: size }, this.scene, true);
    const c = tex.getContext();
    c.clearRect(0, 0, size, size);
    const cx = size / 2;
    const g = c.createRadialGradient(cx, cx, size * 0.3, cx, cx, size * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.12)'); g.addColorStop(0.78, 'rgba(255,255,255,0.95)'); g.addColorStop(0.86, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cx, size * 0.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.arc(cx, cx, size * 0.44, a + 0.25, a + Math.PI / 2 - 0.25); c.stroke(); }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; c.save(); c.translate(cx + Math.cos(a) * size * 0.44, cx + Math.sin(a) * size * 0.44); c.rotate(a); c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, -6); c.lineTo(9, 6); c.fill(); c.restore(); }
    tex.update(true); tex.hasAlpha = true;
    const m = MeshBuilder.CreateGround('selRing', { width: 1, height: 1 }, this.scene);
    const mat = new StandardMaterial('selRingMat', this.scene);
    mat.diffuseTexture = tex; mat.opacityTexture = tex; mat.emissiveColor = new Color3(1, 0.3, 0.2); mat.disableLighting = true;
    mat.useAlphaFromDiffuseTexture = true; mat.zOffset = -4; mat.backFaceCulling = false; mat.disableDepthWrite = true;
    m.material = mat; m.isPickable = false; m.setEnabled(false);
    this.ringHostile = new Color3(1.0, 0.32, 0.22); this.ringFriend = new Color3(1.0, 0.82, 0.45);
    return m;
  }
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
