import { buildCounterGuard, buildCounterReversal, animateCounterVisual } from './CounterVisuals.js';
import { drawConvergenceArt, drawConvergenceCharge } from './ConvergenceArt.js';
import { addConvergenceHero } from './ConvergenceHeroGeometry.js';
import { addWorldshapeHero } from './WorldshapeHeroGeometry.js';
import { addStanceHero } from './StanceHeroGeometry.js';
import { addStancePhaseSurface } from './StancePhaseGeometry.js';
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  CylinderGeometry,
  ConeGeometry,
  TorusGeometry,
  OctahedronGeometry,
  BoxGeometry,
  SphereGeometry,
  Shape,
  ExtrudeGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3
} from 'three';
import { MECHANIC_PRESETS as P, MECHANIC_VARIANTS } from './presets.js';
import { buildStanceRig, buildStancePhase, initStanceResources } from './stance-presentation.js';
import { buildWeaveAnchor, buildWeaveAnchorSurface, buildWeaveLink, buildWeaveCue, weaveMaterial } from './WeavePresentation.js';
import { buildWorldshapeVariant, buildWorldshapePulse, animateWorldshape } from './worldshapeVisuals.js';
const TAU = Math.PI * 2;
const up = new Vector3(0, 1, 0);

/** Solid geometry first, emissive detail second. Shared immutable resources; bounded live objects. */
export class MechanicPresentation {
  constructor(scene, systems) {
    this.scene = scene;
    this.up = up;
    this.vector = (x, y, z) => new Vector3(x, y, z);
    this.s = systems;
    this.items = new Map();
    this.effects = [];
    this.resources = [];
    this.reducedMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mat = {};
    const material = (name, color, emissive = 0, metalness = 0.5) => {
      const m = new MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 1.4,
        roughness: 0.36,
        metalness
      });
      this.mat[name] = m;
      this.resources.push(m);
    };
    material('iron', 0x202835);
    material('bronze', 0x87603b);
    material('fire', 0xff942c, 0xeb4207);
    material('steel', 0x9ba8b6);
    material('gold', 0xf0c571, 0x4a2806);
    material('force', 0x87d9ec, 0x186c8b);
    material('ice', 0xa6e8ff, 0x1a719b, 0.15);
    material('rock', 0x66594e, 0, 0.05);
    material('strata', 0x958069, 0, 0.05);
    material('storm', 0xd9c5ff, 0x6949b7);
    material('water', 0x279acb, 0x08425a, 0.2);
    // Footprint overlays use their own pooled materials. They must remain
    // visible over raised terrain without changing the depth behavior of the
    // central sculptures or any of the other mechanic families.
    for (const [element, base] of Object.entries({fire:'fire',frost:'ice',water:'water',earth:'strata',crystal:'ice',gold:'gold'})) {
      const overlay = new MeshBasicMaterial({
        color: this.mat[base].color.clone(), transparent: true, opacity: 0.82,
        depthTest: false, depthWrite: false
      });
      this.mat[`convergenceOverlay-${element}`] = overlay;
      this.resources.push(overlay);
    }
    material('crystal', 0xe1bfff, 0x844ed0, 0.25);
    material('wind', 0xb8fff1, 0x399b9c, 0.15);
    // Terrain-only materials keep this layer independent of the established 230 castables.
    this.terrainTime = { value: 0 };
    for (const [name, color, glow, metal] of [
      ['terrainFire', 0x513024, 0x9d2506, 0.08], ['terrainIce', 0x91c9dc, 0x0b4d77, 0.1],
      ['terrainStorm', 0x9e9cc8, 0x473996, 0.45], ['terrainWater', 0x145b78, 0x053b55, 0.22],
      ['terrainGlass', 0xc0b5eb, 0x593080, 0.3]
    ]) {
      material(name, color, glow, metal);
      const mat = this.mat[name];
      mat.roughness = name === 'terrainWater' || name === 'terrainGlass' ? 0.2 : 0.53;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.terrainClock = this.terrainTime;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTerrainLocal;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainLocal = position;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTerrainLocal;\nuniform float terrainClock;')
          .replace('#include <color_fragment>', `#include <color_fragment>\nfloat detail = sin(vTerrainLocal.x * 31.0 + sin(vTerrainLocal.z * 13.0) * 2.0 + terrainClock * ${name === 'terrainWater' ? '1.5' : '0.18'}) * sin(vTerrainLocal.z * 29.0 - vTerrainLocal.y * 11.0);\nfloat strata = sin(vTerrainLocal.y * 48.0 + vTerrainLocal.x * 8.0 + vTerrainLocal.z * 5.0);\ndiffuseColor.rgb *= 0.85 + 0.11 * detail + 0.07 * strata;`);
      };
      mat.customProgramCacheKey = () => `worldshape-detail-${name}-v1`;
    }
    this.geo = {};
    const geo = (name, g) => {
      this.geo[name] = g;
      this.resources.push(g);
    };
    geo('shaft', new CylinderGeometry(0.13, 0.22, 1, 8));
    geo('base', new CylinderGeometry(0.65, 0.8, 0.22, 8));
    geo('ring', new TorusGeometry(1, 0.045, 6, 48));
    geo('shard', new OctahedronGeometry(1, 0));
    geo('box', new BoxGeometry(1, 1, 1));
    geo('sphere', new SphereGeometry(1, 16, 10));
    geo('terrainFloor', new CylinderGeometry(1, 1, 0.06, 64));
    // Sculpted radial strata, bounded by the same 1.1m collision cylinder.
    const positions = [],
      indices = [],
      segments = 48,
      layers = 12;
    for (let j = 0; j <= layers; j++)
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * TAU,
          t = j / layers;
        const chip = 0.05 * Math.sin(i * 3.1 + j * 1.7) + 0.025 * Math.sin(i * 7.3 - j * 2.5);
        const radius = Math.min(1.1, (1.06 - 0.4 * t) * (1 + chip));
        positions.push(Math.cos(a) * radius, (t - 0.5) * 2.4, Math.sin(a) * radius);
        if (j < layers && i < segments) {
          const n = j * (segments + 1) + i;
          indices.push(n, n + segments + 1, n + 1, n + 1, n + segments + 1, n + segments + 2);
        }
      }
    positions.push(0, 1.2, 0);
    const cap = positions.length / 3 - 1;
    for (let i = 0; i < segments; i++)
      indices.push(cap, layers * (segments + 1) + i + 1, layers * (segments + 1) + i);
    const ridge = new BufferGeometry();
    ridge.setAttribute('position', new Float32BufferAttribute(positions, 3));
    ridge.setIndex(indices);
    ridge.computeVertexNormals();
    geo('ridge', ridge);
    for (const name of ['rock', 'strata']) {
      this.mat[name].roughness = 0.95;
      this.mat[name].onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vStrata;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStrata = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vStrata;')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
          float grain = sin(dot(vStrata, vec3(47.1, 79.2, 31.7))) * sin(dot(vStrata,vec3(137.0,61.0,113.0)));
          float band = sin(vStrata.y*27.0 + sin(vStrata.x*4.0)*0.8 + sin(vStrata.z*3.0));
          diffuseColor.rgb *= 0.83 + grain*0.075 + band*0.16;`
          );
      };
      this.mat[name].customProgramCacheKey = () => 'mechanic-strata-v1';
    }
    geo('ramp', new ConeGeometry(P.worldshape.radius, P.worldshape.height, 64, 4));
    const shield = new Shape();
    shield.moveTo(-0.34, 0.48);
    shield.lineTo(0.34, 0.48);
    shield.lineTo(0.43, -0.12);
    shield.lineTo(0, -0.65);
    shield.lineTo(-0.43, -0.12);
    shield.closePath();
    geo(
      'shield',
      new ExtrudeGeometry(shield, {
        depth: 0.1,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.035,
        bevelThickness: 0.035
      })
    );
    initStanceResources(this);
  }
  mesh(g, m, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
    const o = new Mesh(this.geo[g], this.mat[m]);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  ring(parent, material, r, y = 0) {
    const o = this.mesh('ring', material, parent, 0, y, 0, r);
    o.rotation.x = Math.PI / 2;
    return o;
  }
  build(kind, data) {
    const g = new Group();
    g.name = `mechanic:${kind}`;
    const frostWeave = data.uid === 'mechanics/weave/cryostasis-mesh';
    if (data.family === 'stance' && ['anticipation', 'block', 'reversal', 'finisher'].includes(kind)) {
      const p = this.s.preset(data);
      g.userData.stancePhase = kind;
      g.userData.stanceRadius = data.visualRadius ?? p.finisherRadius;
      buildStancePhase(this, g, kind, p.element);
      addStancePhaseSurface(this, g, p.element, kind);
    } else if (kind === 'anchor' && buildWeaveAnchor(this, g, data)) {
      // Built by the variant-specific sculptor.
    } else if (kind === 'anchor' && frostWeave) {
      this.mesh('base', 'steel', g, 0, 0, 0, 0.8, 0.7, 0.8);
      this.ring(g, 'ice', 0.7, 0.15);
      this.mesh('shard', 'ice', g, 0, 1.15, 0, 0.28, 1.05, 0.28);
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        const shard = this.mesh('shard', 'ice', g, Math.sin(a) * 0.48, 0.65, Math.cos(a) * 0.48, 0.13, 0.55, 0.13);
        shard.rotation.z = Math.sin(a) * 0.45;
        shard.rotation.x = Math.cos(a) * 0.45;
        const brace = this.mesh('box', 'steel', g, Math.sin(a) * 0.55, 0.32, Math.cos(a) * 0.55, 0.07, 0.55, 0.07);
        brace.rotation.z = -Math.sin(a) * 0.4;
        brace.rotation.x = -Math.cos(a) * 0.4;
      }
      this.ring(g, 'steel', 0.35, 1.45);
    } else if (kind === 'anchor') {
      this.mesh('base', 'iron', g);
      this.ring(g, 'bronze', 0.54, 0.16);
      this.mesh('shaft', 'bronze', g, 0, 0.8, 0, 1, 1.3, 1);
      for (let i = 0; i < 3; i++) {
        const joint = new Group();
        joint.rotation.y = (i * TAU) / 3;
        joint.userData.hinge = i;
        g.add(joint);
        this.mesh('box', 'iron', joint, 0.3, 1.1, 0, 0.15, 0.7, 0.18).rotation.z = -0.4;
        this.mesh('shard', 'fire', joint, 0.35, 1.65, 0, 0.1, 0.36, 0.1);
      }
      this.mesh('shard', 'fire', g, 0, 1.2, 0, 0.22, 0.48, 0.22);
    } else if (kind === 'link' && buildWeaveLink(this, g, data)) {
      // A variant-specific bounded link is built in world coordinates.
    } else if (kind === 'stance' && data.uid && data.uid !== P.stance.uid && buildStanceRig(this, g, this.s.preset(data).element)) {
      // Element-specific stance rig was built by the presentation module.
    } else if (kind === 'stance') {
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6,
          p = this.mesh(
            'shield',
            i % 2 ? 'steel' : 'gold',
            g,
            Math.sin(a) * 0.82,
            1.25,
            Math.cos(a) * 0.82,
            0.8,
            0.85,
            0.8
          );
        p.rotation.y = a;
        this.mesh('shard', 'force', p, 0, 0.18, 0.16, 0.06, 0.22, 0.06);
        this.mesh('box', 'iron', p, 0, -0.1, 0.12, 0.045, 0.7, 0.045);
        this.mesh('box', 'bronze', p, 0, 0.37, 0.13, 0.57, 0.04, 0.06);
        for (const side of [-1, 1]) this.mesh('sphere', 'bronze', p, side * 0.26, 0.3, 0.16, 0.045);
      }
      this.ring(g, 'gold', 0.9, 0.12);
      this.ring(g, 'force', 0.48, 2.05);
    } else if (kind === 'counter' && buildCounterGuard(this, g, data.uid)) {
      // Element-specific guard rig.
    } else if (kind === 'reversal' && buildCounterReversal(this, g, data, MECHANIC_VARIANTS[data.uid])) {
      // The path and impact use the counter's attributed positions.
    } else if (kind === 'counter') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * Math.PI * 0.9;
        const shard = this.mesh(
          'shard',
          'ice',
          g,
          Math.sin(a) * 1.15,
          1.25 + Math.cos(a) * 0.35,
          Math.cos(a) * 1.15,
          0.1,
          0.45,
          0.1
        );
        shard.rotation.z = -a;
      }
      this.mesh('shield', 'steel', g, 0, 1.3, 1.1, 0.65, 0.7, 0.5);
    } else if (kind === 'worldshape' && buildWorldshapeVariant(this, g, data, MECHANIC_VARIANTS[data.uid])) {
      // The authored variant rig is built by worldshapeVisuals.
    } else if (kind === 'worldshape') {
      this.mesh('ramp', 'strata', g, 0, P.worldshape.height / 2, 0);
      const [dx, , dz] = data.direction;
      for (let i = 0; i < 3; i++) {
        const n = (i - 1) * 2.6,
          x = dz * n,
          z = -dx * n;
        const ridge = this.mesh('ridge', 'rock', g, x, 1.2, z);
        ridge.rotation.y = i * 0.7;
        for (let layer = 0; layer < 3; layer++)
          this.mesh(
            'ridge',
            'strata',
            g,
            x,
            0.35 + layer * 0.65,
            z,
            0.91 - layer * 0.12,
            0.035,
            0.91 - layer * 0.12
          ).rotation.y = i * 0.7;
        for (let k = 0; k < 3; k++)
          this.mesh(
            'shard',
            'rock',
            g,
            x + Math.sin(k * 2.1) * 0.85,
            0.25,
            z + Math.cos(k * 2.1) * 0.85,
            0.3,
            0.4,
            0.3
          );
      }
    } else if (kind === 'anticipation' && data.family === 'convergence' && data.uid && drawConvergenceCharge(this, g, data.uid)) {
      // Distinct pre-impact charge uses the variant's elemental material.
    } else if (kind === 'convergence' && data.uid && drawConvergenceArt(this, g, data.uid)) {
      // The authored rig was built above.
    } else if (kind === 'convergence') {
      this.mesh('base', 'iron', g, 0, 0.4, 0, 0.7);
      this.mesh('shaft', 'steel', g, 0, 1.3, 0, 1, 2, 1);
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        this.mesh('shard', 'storm', g, Math.sin(a) * 0.7, 1.7, Math.cos(a) * 0.7, 0.18, 0.75, 0.18);
        const ring = this.ring(g, 'water', 1 + i * 0.5, 0.2 + i * 0.4);
        ring.rotation.z = (i - 1) * 0.3;
      }
      this.mesh('sphere', 'storm', g, 0, 2.1, 0, 0.3);
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12,
          r = 1.2 + (i % 3) * 0.8;
        this.mesh('shaft', 'storm', g, Math.sin(a) * r, 0.12, Math.cos(a) * r, 0.2, 1.3, 0.2).rotation.z =
          Math.PI / 2;
      }
    } else if (kind === 'terrain-pulse') {
      const spec = MECHANIC_VARIANTS[data.uid];
      buildWorldshapePulse(this, g, data, spec);
    } else if (kind === 'reversal') {
      for (let i = 0; i < 16; i++) {
        const a = (i * TAU) / 16;
        const shard = this.mesh(
          'shard',
          'ice',
          g,
          Math.sin(a) * 0.9,
          1.2 + Math.cos(a) * 0.6,
          Math.cos(a) * 0.5,
          0.1,
          0.45,
          0.15
        );
        shard.rotation.z = a;
      }
    } else if (['weave-burst', 'anchor-break', 'anchor-expire'].includes(kind) && buildWeaveCue(this, g, data, kind)) {
      // Cue geometry uses the resolved gameplay positions.
    } else if (kind === 'weave-burst') {
      const material = weaveMaterial(data.uid) ?? 'ice';
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12;
        const shard = this.mesh('shard', material, g, Math.sin(a), 0.35, Math.cos(a), 0.12, 0.45, 0.12);
        shard.rotation.z = -a;
      }
      this.ring(g, material, 1, 0.12);
    } else if (kind === 'threat') {
      this.mesh('shard', 'fire', g, 0, 1.1, 0, 0.15, 0.45, 0.15).rotation.x = Math.PI / 2;
      this.ring(g, 'fire', 0.6, 0.08);
    } else if (kind === 'finisher') {
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        const m = this.mesh('shield', 'force', g, Math.sin(a), 0.5, Math.cos(a), 0.5);
        m.rotation.y = a;
      }
    } else {
      this.ring(
        g,
        data.family === 'counter' ? 'ice' : data.family === 'worldshape' ? 'gold' : 'force',
        0.9,
        0.05
      );
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4;
        this.mesh('shard', 'gold', g, Math.sin(a), 0.1, Math.cos(a), 0.1, 0.04, 0.1);
      }
    }
    if (kind === 'anchor') buildWeaveAnchorSurface(this, g, data.uid);
    if (kind === 'convergence') addConvergenceHero(this, g, data.uid);
    if (kind === 'worldshape') addWorldshapeHero(this, g, data.uid, (MECHANIC_VARIANTS[data.uid] ?? P.worldshape).radius);
    if (kind === 'stance') addStanceHero(this, g, data.uid);
    return g;
  }
  add(id, kind, data, life = null) {
    const g = this.build(kind, data);
    g.position.fromArray(data.position ?? [0, 0, 0]);
    if ((kind === 'convergence' || (kind === 'anticipation' && data.family === 'convergence')) && data.direction)
      g.rotation.y = Math.atan2(data.direction[0], data.direction[2]);
    if (kind === 'link') g.position.set(0, 0, 0);
    this.scene.add(g);
    const item = { id, kind, data, g, start: this.s.m.tick, life };
    this.items.set(id, item);
    return item;
  }
  cue(c) {
    if (c.kind !== 'mechanic') return;
    const durations = {
      anticipation: (MECHANIC_VARIANTS[c.uid] ?? P[c.family])?.anticipation ?? 0.4,
      reversal: 0.7,
      finisher: 0.65,
      convergence: (MECHANIC_VARIANTS[c.uid] ?? P.convergence).life,
      block: 0.25,
      partial: 0.3,
      'anchor-break': 0.5,
      'anchor-expire': 0.45,
      'weave-burst': 0.6,
      'terrain-pulse': 0.35
    };
    if (!(c.phase in durations)) return;
    if (this.effects.length >= 32) this.remove(this.effects.shift());
    const id = `vfx:${c.id}:${c.phase}:${c.tick}`;
    this.add(id, c.phase, c, durations[c.phase]);
    this.effects.push(id);
  }
  remove(id) {
    const i = this.items.get(id);
    if (i) {
      this.scene.remove(i.g);
      this.items.delete(id);
    }
  }
  update() {
    const s = this.s,
      wanted = new Set();
    this.terrainTime.value = this.reducedMotion ? 0 : s.m.seconds;
    this.mat.fire.emissiveIntensity = this.reducedMotion ? 1.15 :
      1.15 + 0.3 * Math.sin(s.m.seconds * 13) + 0.15 * Math.sin(s.m.seconds * 23);
    this.mat.force.emissiveIntensity = this.reducedMotion ? 1.1 : 1.1 + 0.25 * Math.sin(s.m.seconds * 4);
    const sync = (id, kind, data) => {
      wanted.add(id);
      let item = this.items.get(id);
      if (!item) item = this.add(id, kind, data);
      item.data = data;
      if (kind === 'worldshape') item.g.position.fromArray(data.position);
      return item;
    };
    for (const a of s.weave.anchors.values()) sync(a.id, 'anchor', a);
    for (const a of s.weave.links) sync(a.id, 'link', a);
    for (const a of s.stance.active.values()) sync(a.id, 'stance', a);
    for (const a of s.counter.windows.values()) sync(a.id, 'counter', a);
    for (const a of s.worldshape.regions.values()) sync(a.id, 'worldshape', a);
    for (const [id, i] of this.items) {
      const age = (s.m.tick - i.start) / s.m.budget.tickRate;
      if (i.life !== null) {
        if (age >= i.life) {
          this.remove(id);
          continue;
        }
      } else if (!wanted.has(id) && i.kind !== 'threat') {
        // Worldshape, counter guards and stance rigs dissolve out instead of cutting when their state ends early;
        // their kits read i.exitStart. Worldshape retracts over 0.3 s, the guard and stance rigs over 0.2 s.
        const exitTime = i.kind === 'worldshape' ? 0.3 : i.kind === 'counter' || i.kind === 'stance' ? 0.2 : 0;
        if (!exitTime || this.reducedMotion) { this.remove(id); continue; }
        i.exitStart ??= s.m.tick;
        const exitAge = (s.m.tick - i.exitStart) / s.m.budget.tickRate;
        if (exitAge >= exitTime) { this.remove(id); continue; }
        if (i.kind !== 'worldshape') i.g.userData.vfxExit = exitAge / exitTime;
      }
      let scale = i.kind === 'counter' ? 1 : Math.min(1, Math.max(0.01, age / 0.18));
      if (i.life) scale *= Math.min(1, Math.max(0.01, (i.life - age) / 0.18));
      // Convergence damage lands immediately at the full footprint. Keep its
      // boundary at full world scale on the first frame; animate only detail.
      if (i.kind === 'convergence') scale = 1;
      if (this.reducedMotion && (i.kind === 'stance' || i.g.userData.stancePhase)) scale = 1;
      if (this.reducedMotion && i.data.family === 'convergence' && ['anticipation', 'convergence'].includes(i.kind)) scale = 1;
      if (this.reducedMotion && ['anchor', 'link', 'weave-burst', 'anchor-break', 'anchor-expire'].includes(i.kind)) scale = 1;
      if (this.reducedMotion && i.kind === 'terrain-pulse') scale = 1;
      i.g.scale.setScalar(i.kind === 'link' || i.kind === 'weave-burst' ? 1 : scale);
      if (['stance', 'counter'].includes(i.kind)) {
        const e = s.m.entities.get(i.data.ownerId);
        if (e) i.g.position.fromArray(e.position);
        i.g.rotation.y = Math.atan2(i.data.direction[0], i.data.direction[2]);
      }
      if (!this.reducedMotion && ['anchor', 'link'].includes(i.kind))
        i.g.traverse((n) => {
          const spin = n.userData.weaveSpin;
          if (spin) n.rotation[spin.axis] = spin.base + age * spin.rate;
          const slide = n.userData.weaveSlide;
          if (slide) {
            const t = (age * slide.speed + slide.phase) % 1;
            n.position.set(
              slide.a[0] + (slide.b[0] - slide.a[0]) * t,
              slide.a[1] + (slide.b[1] - slide.a[1]) * t,
              slide.a[2] + (slide.b[2] - slide.a[2]) * t
            );
          }
        });
      if (i.kind === 'anchor')
        i.g.traverse((n) => {
          if (n.userData.hinge !== undefined)
            n.rotation.z =
              (1 - scale) * 0.7 + (!this.reducedMotion ? 0.035 * Math.sin(age * 3 + n.userData.hinge) : 0);
        });
      if (i.kind === 'stance' && !this.reducedMotion) i.g.rotation.y += Math.sin(age * 1.5) * 0.08;
      if (i.kind === 'stance' && !this.reducedMotion)
        i.g.traverse((n) => { if (n.userData.orbit) n.rotation.z = n.userData.orbitBase + age * 0.5 * n.userData.orbit; });
      if (!this.reducedMotion && (i.kind === 'stance' || i.g.userData.stancePhase)) {
        i.g.traverse((n) => {
          const motion = n.userData.stanceBeat;
          if (motion) {
            const wave = Math.sin(age * (motion.element === 'storm' ? 14 : 5) + motion.phase);
            n.position.y = motion.baseY + (motion.element === 'water' ? 0.12 : 0.04) * wave;
            n.scale.y = motion.baseScaleY * (1 + (motion.element === 'earth' ? 0.04 : 0.12) * wave);
          }
          if (n.userData.stanceWave) n.scale.setScalar(0.72 + 0.28 * Math.min(1, age / 0.28));
        });
      }
      if (!this.reducedMotion && i.kind === 'anchor-break')
        i.g.traverse((n) => { const p=n.userData.weavePulse; if (p) n.scale.copy(p.base).multiplyScalar(1 + p.amount * Math.sin(age * 12 + p.phase)); });
      if (i.kind === 'convergence' || (i.kind === 'anticipation' && i.data.family === 'convergence')) {
        const direction = i.data.direction ?? [0, 0, 1];
        i.g.rotation.y = Math.atan2(direction[0], direction[2]);
        if (!this.reducedMotion && (!i.data.uid || i.data.uid.endsWith('/storm-catalyst')) && i.kind === 'convergence') i.g.rotation.y += age * 1.8;
        // The boundary flash marks the instantaneous hit, not a persistent
        // damage zone. The central sculpture can continue its shorter decay.
        i.g.traverse((n) => { if (n.userData.convergenceLayer === 'impact') n.visible = age < 0.5; });
        if (this.reducedMotion) continue;
        i.g.traverse((n) => {
          if (n.userData.convergenceLayer === 'charge') n.rotation.y = age * 0.7;
          if (n.userData.convergenceLayer === 'impact') n.scale.y = Math.min(1, Math.max(0.1, age / 0.2));
          const motion = n.userData.convergenceMotion;
          if (!motion) return;
          const { kind, phase, scale, position } = motion;
          if (kind === 'flame') n.scale.y = scale.y * (0.8 + 0.2 * Math.sin(age * 15 + phase));
          else if (kind === 'crystal') n.scale.y = scale.y * Math.min(1, Math.max(0.02, (age - phase * 0.04) / 0.3));
          else if (kind === 'droplet') n.position.y = position.y + 0.13 * Math.sin(age * 7 + phase * 0.8);
          else if (kind === 'eruption') n.scale.y = scale.y * Math.min(1, Math.max(0.02, (age - phase * 0.12) / 0.28));
          else if (kind === 'prism') n.scale.copy(scale).multiplyScalar(0.8 + 0.2 * Math.sin(age * 9 - phase));
        });
      }
      if (i.kind === 'counter' || i.g.userData.counterReversal) animateCounterVisual(i.g, age, this.reducedMotion);
      if (i.kind === 'finisher') {
        if (i.g.userData.stancePhase) i.g.scale.set(i.g.userData.stanceRadius, 1, i.g.userData.stanceRadius);
        else i.g.scale.setScalar(1 + age * 7);
      }
      if (i.kind === 'reversal' && i.g.userData.counterReversal) i.g.scale.setScalar(1);
      else if (i.kind === 'reversal' && !i.g.userData.stancePhase) i.g.scale.setScalar(0.5 + age * 2);
      if (i.kind === 'worldshape') {
        const exit = i.exitStart === undefined ? 1 : Math.max(0, 1 - (s.m.tick - i.exitStart) / s.m.budget.tickRate / 0.3);
        const enter = this.reducedMotion ? 1 : Math.min(1, age / 0.35);
        i.g.scale.set(exit, enter * exit, exit);
        animateWorldshape(i.g, age, this.reducedMotion);
      }
    }
    this.effects = this.effects.filter((id) => this.items.has(id));
  }
  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
    this.effects = [];
  }
  dispose() {
    this.clear();
    for (const r of this.resources) r.dispose();
  }
}
