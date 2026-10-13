import * as THREE from 'three';

// These five presets are deliberately built from different constructions: a
// growing flower, deployed machines, articulated bodies, a temporal cage, and
// refracted projectiles. Animation is a pure function of local time; only the
// event ledger is stateful, so a large update step cannot lose a gameplay event.
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const C = x => Math.max(0, Math.min(1, x));
const S = x => { x = C(x); return x * x * (3 - 2 * x); };
const E = x => 1 - Math.pow(1 - C(x), 3);
const mix = (a, b, x) => a + (b - a) * x;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function point(value, fallback = V()) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return V(value[0] || 0, value[1] || 0, value[2] || 0);
  if (value?.position) return point(value.position, fallback);
  if (value && Number.isFinite(value.x)) return V(value.x, value.y || 0, value.z || 0);
  return fallback.clone();
}

function state(ctx, defaultDuration, defaultColor) {
  const params = ctx.params || {};
  const duration = Math.max(0.2, Number(params.duration) || defaultDuration);
  const events = new Set();
  const pendingEvents = [];
  const root = new THREE.Group();
  ctx.group.add(root);
  let seed = (Number(params.seed) || 317) >>> 0;
  const random = ctx.random || (() => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; });
  return {
    ...ctx, params, root, random,
    origin: point(ctx.origin), target: point(ctx.target, point(ctx.origin)),
    radius: Math.max(0.25, Number(params.radius) || 3),
    power: Math.max(0, Number.isFinite(Number(params.power)) ? Number(params.power) : 1),
    duration,
    color: new THREE.Color(params.color || defaultColor),
    event(id, time, threshold, type, payload) {
      if (time >= threshold && !events.has(id)) {
        events.add(id);
        pendingEvents.push({threshold, type, payload: {...payload, time: threshold * duration}});
      }
    },
    flushEvents() {
      pendingEvents.sort((a, b) => a.threshold - b.threshold);
      for (const event of pendingEvents) ctx.emit?.(event.type, event.payload);
      pendingEvents.length = 0;
    },
  };
}

function basic(color, opacity = 1) {
  const material = new THREE.MeshBasicMaterial({color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});
  material.userData.baseOpacity = opacity;
  return material;
}

function metal(color, options = {}) {
  const material = new THREE.MeshStandardMaterial({color, metalness: 0.6, roughness: 0.3, emissive: color, emissiveIntensity: 0.13, transparent: true, ...options});
  material.userData.baseOpacity = material.opacity;
  return material;
}

function mesh(parent, geometry, material, position) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.copy(position);
  parent.add(object);
  return object;
}

function ring(parent, radius, color, thickness = 0.022, opacity = 0.8) {
  const object = mesh(parent, new THREE.TorusGeometry(radius, thickness, 6, 96), basic(color, opacity));
  object.rotation.x = Math.PI / 2;
  return object;
}

function stroke(parent, positions, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);
  const material = new THREE.LineBasicMaterial({color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false});
  material.userData.baseOpacity = opacity;
  const object = new THREE.Line(geometry, material);
  parent.add(object);
  return object;
}

function opacity(object, alpha) {
  object.traverse(child => {
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const material of materials) {
      if (material.uniforms?.uAlpha) material.uniforms.uAlpha.value = alpha;
      else material.opacity = (material.userData.baseOpacity ?? 1) * alpha;
    }
  });
}

function dots(parent, count, random, color, size) {
  const positions = new Float32Array(count * 3);
  const seeds = Array.from({length: count}, () => [random(), random(), random(), random()]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {uColor: {value: new THREE.Color(color)}, uSize: {value: size}, uAlpha: {value: 1}, uScale: {value: 450}},
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: `uniform float uSize;uniform float uScale;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(uSize*uScale/max(.1,-p.z),1.,80.);}`,
    fragmentShader: `uniform vec3 uColor;uniform float uAlpha;void main(){vec2 q=gl_PointCoord-.5;float d=length(q);if(d>.5)discard;
      float soft=pow(max(0.,1.-d*2.),2.);float core=exp(-d*d*95.);float crossGlow=exp(-min(abs(q.x),abs(q.y))*38.)*pow(max(0.,1.-d*2.),3.);
      float alpha=(soft*.5+core*.65+crossGlow*.22)*uAlpha;if(alpha<.003)discard;gl_FragColor=vec4(mix(uColor,vec3(1.),core*.48),alpha);}`,
  });
  const object = new THREE.Points(geometry, material);
  const drawingSize = new THREE.Vector2();
  object.onBeforeRender = renderer => {
    material.uniforms.uAlpha.value = material.opacity;
    material.uniforms.uScale.value = renderer.getDrawingBufferSize(drawingSize).y * 0.5;
  };
  // Positions are procedural and their initial all-zero bound is not useful.
  object.frustumCulled = false;
  parent.add(object);
  return {object, seeds, positions, update(fn) { for (let i = 0; i < count; i++) fn(seeds[i], positions, i * 3, i); geometry.attributes.position.needsUpdate = true; }};
}

function segment(object, a, b, width = 1) {
  object.position.copy(a).add(b).multiplyScalar(0.5);
  const delta = b.clone().sub(a);
  const length = delta.length();
  object.scale.set(width, Math.max(0.0001, length), width);
  if (length > 0.0001) object.quaternion.setFromUnitVectors(UP, delta.multiplyScalar(1 / length));
}

function petalGeometry(radius) {
  const positions = [], uv = [], indices = [];
  const lengthSteps = 22, widthSteps = 8;
  for (let j = 0; j <= lengthSteps; j++) {
    const u = j / lengthSteps;
    const width = Math.pow(Math.sin(Math.PI * u), 0.72) * radius * 0.28;
    for (let k = 0; k <= widthSteps; k++) {
      const v = k / widthSteps * 2 - 1;
      positions.push(v * width, radius * (0.32 * Math.sin(Math.PI * u) + 0.065 * v * v * Math.sin(Math.PI * u)), radius * u);
      uv.push(k / widthSteps, u);
      if (j < lengthSteps && k < widthSteps) {
        const a = j * (widthSteps + 1) + k, b = a + widthSteps + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function petalMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: {uColor: {value: color}, uTime: {value: 0}, uAlpha: {value: 1}},
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;vNormal=normalMatrix*normal;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform vec3 uColor;uniform float uTime;uniform float uAlpha;varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
      void main(){float edge=pow(abs(vUv.x*2.-1.),5.);float spine=exp(-abs(vUv.x-.5)*65.);
      float veins=pow(max(0.,cos(vUv.y*85.+abs(vUv.x-.5)*45.)),22.)*.23;
      float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.);
      float pulse=pow(max(0.,cos(vUv.y*17.-uTime*3.)),12.)*.25;
      vec3 c=mix(uColor,vec3(.85,1.,.87),spine*.65+edge*.45+rim*.3);
      gl_FragColor=vec4(c*(.8+spine+veins+pulse),uAlpha*(.4+edge*.35+rim*.2));}`,
  });
}

function restorativeSanctuary(ctx) {
  const s = state(ctx, 7.2, '#77ffd0'), r = s.radius;
  s.root.position.copy(s.target).add(V(0, 0.035, 0));
  const flower = new THREE.Group(); s.root.add(flower);
  const petals = [], petalGeo = petalGeometry(r * 0.9);
  for (let i = 0; i < 12; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = i / 12 * TAU; flower.add(pivot);
    const material = petalMaterial(s.color.clone().lerp(new THREE.Color('#efffa6'), i % 3 * 0.15));
    const object = mesh(pivot, petalGeo, material);
    petals.push({pivot, object, material, delay: i * 0.007});
  }
  const core = mesh(flower, new THREE.IcosahedronGeometry(r * 0.17, 1), metal('#edffd4', {emissiveIntensity: 1.3, roughness: 0.15}), V(0, r * 0.18, 0));
  const filaments = new THREE.Group(); flower.add(filaments);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU;
    const filament = mesh(filaments, new THREE.CylinderGeometry(r * 0.009, r * 0.015, r * 0.6, 5), basic('#dffff2', 0.9), V(Math.cos(a) * r * 0.13, r * 0.3, Math.sin(a) * r * 0.13));
    filament.rotation.z = Math.sin(a) * 0.25; filament.rotation.x = Math.cos(a) * 0.25;
    mesh(filaments, new THREE.OctahedronGeometry(r * 0.035), basic('#f4ffbd'), V(Math.cos(a) * r * 0.2, r * 0.61, Math.sin(a) * r * 0.2));
  }
  const sigil = new THREE.Group(); s.root.add(sigil);
  ring(sigil, r, s.color, r * 0.009); ring(sigil, r * 0.89, '#e8ffb8', r * 0.004, 0.5);
  for (let i = 0; i < 24; i++) {
    const a = i * TAU / 24;
    const mark = mesh(sigil, new THREE.BoxGeometry(r * 0.012, r * 0.005, r * (i % 3 === 0 ? 0.11 : 0.04)), basic(s.color, 0.8), V(Math.cos(a) * r * 0.94, 0, Math.sin(a) * r * 0.94));
    mark.rotation.y = -a + Math.PI / 2;
  }
  const healGlyphs = Array.from({length: 5}, (_, i) => {
    const glyph = new THREE.Group(); s.root.add(glyph);
    const material = basic('#e9ffd9', 0.95);
    mesh(glyph, new THREE.BoxGeometry(r * 0.10, r * 0.028, r * 0.016), material);
    mesh(glyph, new THREE.BoxGeometry(r * 0.028, r * 0.10, r * 0.016), material);
    return {glyph, angle: i / 5 * TAU};
  });
  const pulses = Array.from({length: 4}, () => ring(s.root, 1, '#d8ffc0', r * 0.016));
  const pollen = dots(s.root, 260, s.random, '#c6ffe3', r * 0.022);
  return {duration: s.duration, update(time) {
    const p = C(time / s.duration), end = 1 - S((p - 0.86) / 0.14);
    const bloom = S((p - 0.04) / 0.25);
    flower.rotation.y = time * 0.06;
    for (const petal of petals) {
      const open = S((p - 0.025 - petal.delay) / 0.2);
      petal.object.rotation.x = mix(-1.43, -0.07, open) + Math.sin(time * 1.7 + petal.delay * 40) * 0.014 * bloom;
      petal.object.scale.setScalar(Math.max(0.001, E((p - petal.delay) / 0.18)));
      petal.material.uniforms.uTime.value = time;
      petal.material.uniforms.uAlpha.value = S(p / 0.08) * end;
    }
    core.rotation.y = time * 0.8; core.rotation.z = time * 0.3;
    core.scale.setScalar((0.5 + bloom * 0.5 + Math.sin(time * 4) * 0.06) * end);
    core.material.opacity = end;
    filaments.scale.setScalar(Math.max(0.001, S((p - 0.15) / 0.15) * end));
    sigil.scale.setScalar(Math.max(0.001, E(p / 0.2)));
    sigil.rotation.y = -time * 0.04; opacity(sigil, end * S(p / 0.12));
    let newestTick = -1;
    for (let i = 0; i < 4; i++) {
      const tick = 0.30 + i * 0.145, t = (p - tick) / 0.15;
      pulses[i].visible = t >= 0 && t <= 1;
      pulses[i].scale.setScalar(r * (0.1 + E(t) * 0.96));
      pulses[i].position.y = r * 0.04 + C(t) * r * 0.03;
      pulses[i].material.opacity = (1 - C(t)) * end * 0.85;
      if (p >= tick) newestTick = tick;
      s.event(`heal-${i}`, p, tick, 'heal', {position: s.target.toArray(), radius: r, amount: 12 * s.power});
    }
    const tickAge = newestTick < 0 ? 2 : (p - newestTick) / 0.145;
    healGlyphs.forEach(({glyph, angle}, i) => {
      glyph.visible = newestTick >= 0 && p < 0.88;
      glyph.position.set(Math.cos(angle + time * 0.07) * r * 0.62, r * (0.2 + tickAge * 0.7), Math.sin(angle + time * 0.07) * r * 0.62);
      glyph.rotation.y = angle + time * 0.15; glyph.rotation.z = Math.sin(time + i) * 0.15;
      opacity(glyph, Math.sin(C(tickAge) * Math.PI) * end);
    });
    pollen.object.material.opacity = S(p / 0.18) * end * 0.8;
    pollen.update((seed, a, j) => {
      const life = (seed[0] + time * (0.10 + seed[3] * 0.10)) % 1;
      const angle = seed[1] * TAU + time * 0.18 + life * 0.8;
      const radius = r * Math.sqrt(seed[2]) * (0.9 - life * 0.45);
      a[j] = Math.cos(angle) * radius; a[j + 1] = r * (life * 1.55 + 0.02); a[j + 2] = Math.sin(angle) * radius;
    });
    s.flushEvents();
  }};
}

function magneticMinefield(ctx) {
  const s = state(ctx, 7.0, '#5de7ff'), r = s.radius;
  s.root.position.copy(s.target);
  const count = 7, mines = [], bursts = [], tethers = [];
  const source = s.origin.clone().sub(s.target).add(V(0, r * 0.25, 0));
  const targets = (s.params.targets || []).map(t => point(t));
  const hullGeometry = new THREE.CapsuleGeometry(r * 0.055, r * 0.11, 4, 8);
  for (let i = 0; i < count; i++) {
    const angle = i / (count - 1) * TAU + 0.25;
    const location = i === count - 1 ? V(0, r * 0.055, 0) : V(Math.cos(angle) * r * 0.73, r * 0.055, Math.sin(angle) * r * 0.73);
    const world = location.clone().add(s.target);
    const near = targets.some(t => t.distanceTo(world) < r * 0.45);
    const detonate = near ? 0.46 + i * 0.035 : 0.52 + i * 0.052;
    const group = new THREE.Group(); s.root.add(group);
    const body = mesh(group, hullGeometry, metal('#273950', {metalness: 0.86, roughness: 0.23}));
    const core = mesh(group, new THREE.CylinderGeometry(r * 0.062, r * 0.062, r * 0.029, 16), basic(s.color));
    const antenna = mesh(group, new THREE.CylinderGeometry(r * 0.008, r * 0.01, r * 0.13, 5), metal('#c2e7ff'), V(0, r * 0.15, 0));
    const light = mesh(group, new THREE.OctahedronGeometry(r * 0.019), basic('#ffde84'), V(0, r * 0.235, 0));
    const fins = [];
    for (let j = 0; j < 4; j++) {
      const pivot = new THREE.Group(); pivot.rotation.y = j * Math.PI / 2; group.add(pivot);
      const fin = mesh(pivot, new THREE.BoxGeometry(r * 0.033, r * 0.12, r * 0.022), metal('#7691a6'), V(0, -r * 0.08, r * 0.055));
      fins.push(fin);
    }
    const scan = ring(s.root, r * 0.25, s.color, r * 0.006, 0.7); scan.position.copy(location); scan.position.y = 0.012;
    const shock = ring(s.root, 1, '#aefaff', r * 0.014); shock.position.copy(location);
    const shock2 = ring(s.root, 1, '#ffda83', r * 0.007); shock2.position.copy(location);
    const sparks = dots(s.root, 36, s.random, i % 2 ? '#a7eaff' : '#fff0ac', r * 0.025);
    mines.push({group, body, core, antenna, light, fins, location, detonate, delay: i * 0.014, scan, near});
    bursts.push({shock, shock2, sparks});
  }
  for (let i = 0; i < count; i++) {
    const j = i === count - 1 ? 0 : (i + 1) % (count - 1);
    if (i !== count - 1) {
      const wire = stroke(s.root, Array.from({length: 25}, () => V()), s.color, 0.5);
      wire.frustumCulled = false; tethers.push({wire, a: i, b: j});
    }
    if (i !== count - 1) {
      const wire = stroke(s.root, Array.from({length: 25}, () => V()), '#8ce8ff', 0.32);
      wire.frustumCulled = false; tethers.push({wire, a: i, b: count - 1});
    }
  }
  const deployment = dots(s.root, 150, s.random, s.color, r * 0.016);
  return {duration: s.duration, update(time) {
    const p = C(time / s.duration), end = 1 - S((p - 0.95) / 0.05);
    mines.forEach((m, i) => {
      const fly = E((p - m.delay) / 0.24), arm = S((p - 0.25 - m.delay) / 0.12);
      m.group.position.lerpVectors(source, m.location, fly);
      m.group.position.y += Math.sin(fly * Math.PI) * r * (0.8 + i * 0.065);
      m.group.rotation.set((1 - fly) * (5 + i), (1 - fly) * 7 + i, (1 - fly) * 2);
      m.group.scale.setScalar(Math.max(0.001, S((p - m.delay) / 0.035)));
      m.group.visible = p >= m.delay && p < m.detonate;
      m.fins.forEach(fin => { fin.rotation.x = arm * 0.85; fin.position.z = r * (0.055 + arm * 0.048); });
      m.core.material.opacity = 0.5 + 0.5 * Math.sin(time * (p > m.detonate - 0.08 ? 36 : 7) + i);
      m.light.scale.setScalar(0.65 + arm * (0.45 + Math.sin(time * 11 + i) * 0.2));
      m.scan.visible = arm > 0 && p < m.detonate;
      m.scan.scale.setScalar(arm * (0.8 + ((time * 0.6 + i * 0.13) % 1) * 0.7));
      m.scan.material.opacity = arm * (0.25 + Math.sin(time * 5 + i) * 0.2);
      const blast = C((p - m.detonate) / 0.17), active = p >= m.detonate && blast < 1;
      const b = bursts[i];
      b.shock.visible = b.shock2.visible = b.sparks.object.visible = active;
      b.shock.scale.setScalar(r * (0.06 + E(blast) * 0.6));
      b.shock2.scale.setScalar(r * (0.03 + E(blast * 0.8) * 0.48));
      b.shock.position.y = m.location.y + blast * r * 0.15;
      b.shock.material.opacity = (1 - blast) * end;
      b.shock2.material.opacity = (1 - blast) * end * 0.85;
      b.sparks.object.material.opacity = (1 - blast) * end;
      b.sparks.update((seed, a, k) => {
        const angle = seed[0] * TAU, speed = (0.2 + seed[1] * 0.65) * r;
        a[k] = m.location.x + Math.cos(angle) * speed * E(blast);
        a[k + 1] = m.location.y + r * (Math.sin(blast * Math.PI) * seed[2] * 0.75 + blast * 0.07);
        a[k + 2] = m.location.z + Math.sin(angle) * speed * E(blast);
      });
      const position = m.location.clone().add(s.target).toArray();
      s.event(`arm-${i}`, p, 0.37 + m.delay, 'status', {position, radius: r * 0.35, status: 'magnetic-mine-armed', duration: (m.detonate - 0.37 - m.delay) * s.duration, targetIndex: i});
      s.event(`burst-${i}`, p, m.detonate, 'damage', {position, radius: r * 0.6, amount: 16 * s.power, targetIndex: i});
      const pullDirection = m.location.clone().negate().setY(0);
      if (pullDirection.lengthSq() < 0.0001) pullDirection.set(0, 1, 0);
      s.event(`pull-${i}`, p, m.detonate, 'knockback', {position, radius: r * 0.6, amount: r * 0.5 * s.power, direction: pullDirection.normalize().toArray(), targetIndex: i});
    });
    tethers.forEach(({wire, a, b}, index) => {
      const start = mines[a].location, finish = mines[b].location;
      const armed = S((p - 0.32) / 0.1), alive = p < Math.min(mines[a].detonate, mines[b].detonate);
      wire.visible = armed > 0 && alive;
      wire.material.opacity = armed * (0.28 + Math.sin(time * 15 + index) * 0.18);
      const array = wire.geometry.attributes.position.array;
      for (let k = 0; k <= 24; k++) {
        const f = k / 24, wobble = Math.sin(f * Math.PI) * Math.sin(f * 28 + time * 12 + index) * r * 0.022;
        array[k * 3] = mix(start.x, finish.x, f) + wobble;
        array[k * 3 + 1] = r * 0.07 + Math.sin(f * Math.PI) * r * 0.10 + wobble;
        array[k * 3 + 2] = mix(start.z, finish.z, f) - wobble;
      }
      wire.geometry.attributes.position.needsUpdate = true;
    });
    deployment.object.material.opacity = (1 - S((p - 0.26) / 0.11)) * S(p / 0.04);
    deployment.update((seed, a, k, i) => {
      const m = mines[i % count], f = E((p - m.delay - seed[0] * 0.055) / 0.24);
      a[k] = mix(source.x, m.location.x, f) + (seed[1] - 0.5) * r * 0.025;
      a[k + 1] = mix(source.y, m.location.y, f) + Math.sin(f * Math.PI) * r * (0.8 + i % count * 0.065);
      a[k + 2] = mix(source.z, m.location.z, f) + (seed[2] - 0.5) * r * 0.025;
    });
    s.flushEvents();
  }};
}

function mirrorDecoys(ctx) {
  const s = state(ctx, 6.2, '#a6bfff'), r = s.radius;
  s.root.position.copy(s.origin);
  const silhouettes = [], shards = [], swaps = [0.39, 0.57];
  const orbit = (p, i) => {
    const swap = S((p - swaps[0]) / 0.07) + S((p - swaps[1]) / 0.07);
    const angle = i * TAU / 3 + p * 2.0 + swap * TAU / 3;
    const distance = r * 0.68 * E(p / 0.16);
    return V(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
  };
  const height = r * 0.8;
  const shardGeometry = new THREE.TetrahedronGeometry(1, 0);
  const physical = new THREE.MeshPhysicalMaterial({color: s.color, metalness: 0.15, roughness: 0.06, transmission: 0.62, thickness: r * 0.2, ior: 1.48, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [120, 550], transparent: true, opacity: 0.88, side: THREE.DoubleSide});
  physical.userData.baseOpacity = 0.88;
  for (let i = 0; i < 3; i++) {
    const body = new THREE.Group(), figure = new THREE.Group(); body.add(figure); s.root.add(body);
    const material = i === 0 ? physical : physical.clone(); material.color.offsetHSL(i * 0.08, 0, 0);
    const pieces = [];
    const part = (geometry, position, rotation) => {
      const m = mesh(figure, geometry, material, position);
      if (rotation) m.rotation.set(...rotation);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 22), new THREE.LineBasicMaterial({color: i === 1 ? '#edb5ff' : '#b1efff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false}));
      edges.material.userData.baseOpacity = 0.85; m.add(edges); pieces.push(m); return m;
    };
    part(new THREE.IcosahedronGeometry(height * 0.115, 1), V(0, height * 0.91, 0));
    part(new THREE.CylinderGeometry(height * 0.14, height * 0.075, height * 0.32, 6), V(0, height * 0.65, 0));
    part(new THREE.OctahedronGeometry(height * 0.13, 0), V(0, height * 0.47, 0));
    for (const side of [-1, 1]) {
      part(new THREE.CapsuleGeometry(height * 0.037, height * 0.21, 3, 6), V(side * height * 0.185, height * 0.66, 0), [0, 0, side * 0.30]);
      part(new THREE.CapsuleGeometry(height * 0.032, height * 0.19, 3, 6), V(side * height * 0.23, height * 0.45, height * 0.045), [0.3, 0, side * 0.08]);
      part(new THREE.CapsuleGeometry(height * 0.047, height * 0.30, 3, 6), V(side * height * 0.075, height * 0.23, 0), [side * 0.05, 0, side * 0.045]);
      part(new THREE.BoxGeometry(height * 0.10, height * 0.055, height * 0.17), V(side * height * 0.079, height * 0.033, height * 0.035));
    }
    const halo = ring(body, height * 0.2, '#cddfff', height * 0.008, 0.6); halo.position.y = height * 1.06;
    const footprint = ring(body, height * 0.27, s.color, height * 0.006, 0.75); footprint.position.y = 0.025;
    const panels = [];
    for (let j = 0; j < 4; j++) {
      const panel = mesh(body, new THREE.PlaneGeometry(height * 0.1, height * 0.29), material);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), new THREE.LineBasicMaterial({color: '#d8ebff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending}));
      edges.material.userData.baseOpacity = 0.5; panel.add(edges); panels.push(panel);
    }
    const shatter = 0.74 + i * 0.035;
    const shardMaterial = metal(i === 1 ? '#e5c1ff' : '#b2eaff', {metalness: 0.84, roughness: 0.12, emissiveIntensity: 0.38, side: THREE.DoubleSide});
    const instances = new THREE.InstancedMesh(shardGeometry, shardMaterial, 72); instances.frustumCulled = false; s.root.add(instances);
    const data = Array.from({length: 72}, () => ({x: (s.random() - 0.5) * height * 0.39, y: s.random() * height, z: (s.random() - 0.5) * height * 0.14, angle: s.random() * TAU, speed: height * (0.25 + s.random() * 0.65), size: height * (0.018 + s.random() * 0.04), spin: s.random() * 6}));
    silhouettes.push({body, figure, material, panels, shatter}); shards.push({instances, data});
  }
  const transfer = Array.from({length: 3}, () => stroke(s.root, Array.from({length: 33}, () => V()), '#eee7ff', 0.8));
  transfer.forEach(t => { t.frustumCulled = false; });
  const echoDust = dots(s.root, 200, s.random, '#dbd1ff', r * 0.019);
  const dummy = new THREE.Object3D();
  return {duration: s.duration, update(time) {
    const p = C(time / s.duration), end = 1 - S((p - 0.91) / 0.09);
    silhouettes.forEach((d, i) => {
      const location = orbit(Math.min(p, d.shatter), i), reveal = S((p - i * 0.025) / 0.15);
      d.body.position.copy(location); d.body.position.y = Math.sin(time * 2 + i) * r * 0.018;
      d.body.rotation.y = -Math.atan2(location.z, location.x) + Math.PI / 2;
      d.body.scale.set(1, Math.max(0.001, reveal), 1);
      d.body.visible = p < d.shatter;
      opacity(d.body, reveal * (0.78 + Math.sin(time * 6 + i * 2) * 0.12));
      d.figure.rotation.z = Math.sin(time * 1.4 + i) * 0.04;
      d.panels.forEach((panel, j) => {
        const a = j * Math.PI / 2 + time * 0.65;
        panel.position.set(Math.cos(a) * height * 0.34, height * (0.45 + 0.14 * Math.sin(a * 2 + time)), Math.sin(a) * height * 0.34);
        panel.rotation.set(0.12 * Math.sin(a), -a + Math.PI / 2, Math.sin(time + j) * 0.15);
      });
      const burst = C((p - d.shatter) / 0.21), sh = shards[i];
      sh.instances.visible = p >= d.shatter;
      sh.instances.material.opacity = (1 - S((burst - 0.35) / 0.65)) * end;
      sh.data.forEach((seed, j) => {
        dummy.position.set(location.x + seed.x + Math.cos(seed.angle) * seed.speed * burst, seed.y + seed.speed * burst * 0.6 - burst * burst * height * 0.6, location.z + seed.z + Math.sin(seed.angle) * seed.speed * burst);
        dummy.rotation.set(seed.spin + burst * 7, seed.angle + burst * seed.spin, seed.spin - burst * 5);
        dummy.scale.set(seed.size, seed.size * (2 + seed.spin * 0.3), seed.size * 0.13);
        dummy.updateMatrix(); sh.instances.setMatrixAt(j, dummy.matrix);
      });
      sh.instances.instanceMatrix.needsUpdate = true;
      s.event(`decoy-${i}`, p, 0.15 + i * 0.025, 'status', {position: orbit(0.15 + i * 0.025, i).add(s.origin).toArray(), radius: r * 0.4, status: 'mirror-decoy', duration: (d.shatter - 0.15 - i * 0.025) * s.duration, targetIndex: i});
      s.event(`shatter-${i}`, p, d.shatter, 'status', {position: location.clone().add(s.origin).toArray(), radius: r * 0.45, status: 'disoriented', duration: 1.5, targetIndex: i});
    });
    const swapAge = Math.min(...swaps.map(t => p >= t ? p - t : 10));
    transfer.forEach((line, i) => {
      line.visible = swapAge < 0.09;
      line.material.opacity = (1 - C(swapAge / 0.09)) * 0.95;
      const from = orbit(p, i), to = orbit(p, (i + 1) % 3), array = line.geometry.attributes.position.array;
      for (let k = 0; k <= 32; k++) {
        const u = k / 32;
        array[k * 3] = mix(from.x, to.x, u); array[k * 3 + 1] = height * 0.5 + Math.sin(u * Math.PI) * height * 0.35;
        array[k * 3 + 2] = mix(from.z, to.z, u);
      }
      line.geometry.attributes.position.needsUpdate = true;
    });
    swaps.forEach((t, i) => s.event(`swap-${i}`, p, t, 'teleport', {position: orbit(t + 0.07, 0).add(s.origin).toArray(), radius: r * 0.15, status: 'mirror-swap', targetIndex: i}));
    echoDust.object.material.opacity = S(p / 0.12) * end * 0.55;
    echoDust.update((seed, a, j, i) => {
      const loc = orbit(Math.max(0, p - seed[0] * 0.09), i % 3);
      a[j] = loc.x + (seed[1] - 0.5) * height * 0.4; a[j + 1] = seed[2] * height; a[j + 2] = loc.z + (seed[3] - 0.5) * height * 0.4;
    });
    s.flushEvents();
  }};
}

function stasisBubble(ctx) {
  const s = state(ctx, 6.8, '#80e6ff'), r = s.radius * 0.78;
  s.root.position.copy(s.target).add(V(0, r + 0.04, 0));
  const cage = new THREE.Group(); s.root.add(cage);
  const lattice = [];
  for (let i = 0; i < 12; i++) {
    const phi = i / 12 * TAU;
    const positions = Array.from({length: 97}, (_, k) => {
      const a = k / 96 * TAU;
      return V(Math.cos(phi) * Math.sin(a) * r, Math.cos(a) * r, Math.sin(phi) * Math.sin(a) * r);
    });
    lattice.push(stroke(cage, positions, i % 3 ? s.color : '#ebfdff', i % 3 ? 0.28 : 0.6));
  }
  for (let i = 1; i < 9; i++) {
    const angle = i / 9 * Math.PI;
    const latitude = ring(cage, Math.sin(angle) * r, s.color, r * 0.004, 0.42);
    latitude.position.y = Math.cos(angle) * r;
    lattice.push(latitude);
  }
  const shellMaterial = new THREE.ShaderMaterial({
    uniforms: {uTime: {value: 0}, uAlpha: {value: 0}, uColor: {value: s.color}},
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vNormal;varying vec3 vView;varying vec3 vLocal;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;vNormal=normalMatrix*normal;vLocal=normalize(position);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform float uTime;uniform float uAlpha;uniform vec3 uColor;varying vec3 vNormal;varying vec3 vView;varying vec3 vLocal;
      void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),3.);float scan=pow(max(0.,cos(vLocal.y*40.-uTime*1.5)),26.);float grid=pow(max(0.,sin(atan(vLocal.z,vLocal.x)*24.+vLocal.y*13.)),38.);gl_FragColor=vec4(mix(uColor,vec3(.9,1.,1.),rim),uAlpha*(rim*.42+scan*.035+grid*.05));}`,
  });
  const shell = mesh(s.root, new THREE.SphereGeometry(r, 48, 32), shellMaterial);
  const clock = new THREE.Group(); s.root.add(clock); clock.rotation.x = Math.PI / 2;
  const dial = ring(clock, r * 0.83, '#f7e2a0', r * 0.007, 0.7);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    const marker = mesh(clock, new THREE.BoxGeometry(r * 0.023, r * 0.009, r * (i % 3 === 0 ? 0.15 : 0.07)), basic('#ffe4a0', 0.8), V(Math.sin(a) * r * 0.83, 0, Math.cos(a) * r * 0.83));
    marker.rotation.y = a;
  }
  const handPivot = new THREE.Group(); clock.add(handPivot);
  mesh(handPivot, new THREE.BoxGeometry(r * 0.014, r * 0.014, r * 0.61), basic('#fff4ce'), V(0, 0, r * 0.305));
  const secondPivot = new THREE.Group(); clock.add(secondPivot);
  mesh(secondPivot, new THREE.BoxGeometry(r * 0.009, r * 0.009, r * 0.76), basic(s.color, 0.85), V(0, 0.02, r * 0.38));
  const fragmentGeometry = new THREE.DodecahedronGeometry(1, 0);
  const fragments = new THREE.InstancedMesh(fragmentGeometry, metal('#6f899b', {metalness: 0.55, roughness: 0.35, emissive: s.color, emissiveIntensity: 0.18}), 45);
  fragments.frustumCulled = false; s.root.add(fragments);
  const fragmentSeeds = Array.from({length: 45}, () => {
    const a = s.random() * TAU, y = (s.random() * 2 - 1) * r * 0.66;
    const radius = Math.sqrt(Math.max(0, r * r * 0.55 - y * y)) * (0.35 + s.random() * 0.65);
    return {position: V(Math.cos(a) * radius, y, Math.sin(a) * radius), axis: V(s.random() - 0.5, s.random() - 0.5, s.random() - 0.5).normalize(), size: r * (0.035 + s.random() * 0.065), spin: s.random() * TAU, speed: 0.5 + s.random() * 1.2};
  });
  const orbitDust = dots(s.root, 280, s.random, '#b9efff', r * 0.018);
  const release = ring(s.root, 1, '#e8fbff', r * 0.026); release.rotation.x = Math.PI / 2;
  const equator = ring(s.root, r, '#f7d799', r * 0.008, 0.7);
  const dummy = new THREE.Object3D();
  return {duration: s.duration, update(time) {
    const p = C(time / s.duration), form = E(p / 0.20), collapse = S((p - 0.73) / 0.08);
    // Captured objects advance only 1/40 normal speed during the hold phase.
    const slowed = Math.min(p, 0.24) + Math.max(0, Math.min(p, 0.74) - 0.24) * 0.025;
    const visualTime = slowed * s.duration;
    cage.scale.setScalar(Math.max(0.001, form * (1 - collapse)));
    cage.rotation.y = visualTime * 0.4;
    lattice.forEach((object, i) => {
      if (object.isLine) object.geometry.setDrawRange(0, Math.floor(97 * S((p - i * 0.002) / 0.17)));
      object.material.opacity = (object.material.userData.baseOpacity ?? 1) * (1 - collapse) * (0.78 + Math.sin(time * 2 + i) * 0.1);
    });
    shell.scale.setScalar(Math.max(0.001, form * (1 - collapse)));
    shellMaterial.uniforms.uAlpha.value = S(p / 0.14) * (1 - collapse);
    shellMaterial.uniforms.uTime.value = visualTime;
    clock.scale.setScalar(Math.max(0.001, form * (1 - collapse)));
    clock.rotation.z = visualTime * 0.05;
    handPivot.rotation.y = visualTime * 0.8;
    secondPivot.rotation.y = visualTime * 5.5;
    opacity(clock, S((p - 0.08) / 0.12) * (1 - collapse));
    equator.scale.setScalar(Math.max(0.001, form * (1 - collapse)));
    equator.rotation.z = visualTime * 0.12;
    equator.material.opacity = (1 - collapse) * 0.65;
    const released = C((p - 0.78) / 0.22);
    fragments.material.opacity = S(p / 0.12) * (1 - S((p - 0.91) / 0.09));
    fragmentSeeds.forEach((seed, i) => {
      const capture = E(p / 0.24), pos = seed.position.clone().multiplyScalar(mix(1.6, 1, capture));
      pos.y += Math.sin(visualTime * seed.speed + i) * r * 0.025;
      if (p > 0.78) {
        pos.addScaledVector(seed.position.clone().normalize(), released * r * seed.speed * 1.8);
        pos.y -= released * released * r * 1.3;
      }
      dummy.position.copy(pos);
      dummy.quaternion.setFromAxisAngle(seed.axis, seed.spin + visualTime * seed.speed + released * 5);
      dummy.scale.set(seed.size * 1.3, seed.size * 0.75, seed.size);
      dummy.updateMatrix(); fragments.setMatrixAt(i, dummy.matrix);
    });
    fragments.instanceMatrix.needsUpdate = true;
    orbitDust.object.material.opacity = form * (1 - S((p - 0.85) / 0.15)) * 0.75;
    orbitDust.update((seed, a, k) => {
      const angle = seed[0] * TAU + visualTime * (0.3 + seed[2]);
      const y = (seed[1] * 2 - 1) * r;
      const radius = Math.sqrt(Math.max(0, r * r - y * y)) * (0.92 + seed[3] * 0.07) * (form + released * 1.7);
      a[k] = Math.cos(angle) * radius; a[k + 1] = y * (1 + released) - released * released * r; a[k + 2] = Math.sin(angle) * radius;
    });
    release.visible = p >= 0.78;
    release.scale.setScalar(r * (0.2 + E(released) * 1.9));
    release.material.opacity = (1 - released) * 0.9;
    s.event('capture', p, 0.21, 'status', {position: s.target.toArray(), radius: s.radius, status: 'time-dilated', duration: s.duration * 0.57});
    s.event('release', p, 0.78, 'knockback', {position: s.target.toArray(), radius: s.radius * 1.15, amount: 3 * s.power, direction: [0, 1, 0]});
    s.flushEvents();
  }};
}

function prismaticSplitshot(ctx) {
  const s = state(ctx, 4.8, '#b8e7ff'), r = s.radius;
  const start = s.origin.clone().add(V(0, r * 0.33, 0));
  const center = s.target.clone().add(V(0, r * 0.36, 0));
  if (center.distanceTo(start) < r * 0.6) center.add(V(0, 0, -r * 1.2));
  const forward = center.clone().sub(start).setY(0).normalize();
  const right = V().crossVectors(forward, UP).normalize();
  const prismRoot = new THREE.Group(); prismRoot.position.copy(center); s.root.add(prismRoot);
  const prismGeometry = new THREE.CylinderGeometry(r * 0.22, r * 0.22, r * 0.67, 3, 1);
  const prismMaterial = new THREE.MeshPhysicalMaterial({color: '#dcf0ff', metalness: 0.05, roughness: 0.02, transmission: 0.88, thickness: r * 0.35, ior: 1.55, iridescence: 1, iridescenceIOR: 1.4, transparent: true, opacity: 0.92, side: THREE.DoubleSide});
  const prism = mesh(prismRoot, prismGeometry, prismMaterial);
  const prismEdges = new THREE.LineSegments(new THREE.EdgesGeometry(prismGeometry), new THREE.LineBasicMaterial({color: '#e9edff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending})); prism.add(prismEdges);
  const orbitals = Array.from({length: 3}, (_, i) => {
    const ringObject = ring(prismRoot, r * (0.34 + i * 0.04), ['#ff7ea7', '#8dffd1', '#a9a0ff'][i], r * 0.008, 0.7);
    ringObject.rotation.set(i * 0.7, i * 1.1, Math.PI * 0.35); return ringObject;
  });
  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const incoming = mesh(s.root, beamGeometry, basic('#f2f6ff', 0.95));
  const incomingAura = mesh(s.root, beamGeometry, basic(s.color, 0.26));
  const lance = mesh(s.root, new THREE.ConeGeometry(r * 0.065, r * 0.42, 6), basic('#fff9f2'));
  const glint = new THREE.Group(); glint.position.copy(center); s.root.add(glint);
  for (let i = 0; i < 6; i++) {
    const ray = mesh(glint, new THREE.BoxGeometry(r * 0.018, r * 0.85, r * 0.012), basic(i % 2 ? '#d6e7ff' : '#fff5da', 0.85));
    ray.rotation.z = i * Math.PI / 3; ray.rotation.y = i * 0.8;
  }
  const colors = ['#ff719d', '#72ffcb', '#aa95ff'];
  const branchTargets = (s.params.targets || []).map(t => point(t));
  const branches = colors.map((color, i) => {
    const direction = forward.clone().multiplyScalar(1).addScaledVector(right, (i - 1) * 0.85).normalize();
    const end = branchTargets[i]?.clone() || center.clone().addScaledVector(direction, r * (1.75 + (i === 1 ? 0.35 : 0))).setY(s.target.y + r * 0.08);
    const middle = center.clone().lerp(end, 0.55);
    if (i === 0) middle.addScaledVector(right, -r * 0.3).add(V(0, r * 0.18, 0));
    if (i === 1) middle.y = s.target.y + r * 0.08;
    if (i === 2) middle.addScaledVector(right, r * 0.18).add(V(0, r * 0.82, 0));
    const curve = new THREE.CatmullRomCurve3([center.clone(), center.clone().addScaledVector(direction, r * 0.35).add(V(0, i === 2 ? r * 0.26 : 0, 0)), middle, end]);
    const geometry = new THREE.TubeGeometry(curve, 72, r * 0.019, 6, false);
    const tube = mesh(s.root, geometry, basic(color, 0.85));
    const head = mesh(s.root, new THREE.OctahedronGeometry(r * 0.075), basic(color));
    const tip = mesh(s.root, new THREE.OctahedronGeometry(r * 0.035), basic('#ffffff')); head.add(tip);
    const scatter = dots(s.root, 90, s.random, color, r * 0.024);
    const shock = ring(s.root, 1, color, r * 0.015); shock.position.copy(end).add(V(0, 0.02, 0));
    const crystalGeometry = new THREE.TetrahedronGeometry(1);
    const crystals = new THREE.InstancedMesh(crystalGeometry, metal(color, {emissiveIntensity: 0.9, roughness: 0.15}), 22); crystals.frustumCulled = false; s.root.add(crystals);
    const seeds = Array.from({length: 22}, () => [s.random(), s.random(), s.random(), s.random()]);
    return {curve, tube, head, scatter, shock, crystals, seeds, end, color, launch: 0.37 + i * 0.025, impact: 0.67 + i * 0.055};
  });
  const refractionDust = dots(s.root, 140, s.random, '#e3edff', r * 0.018);
  const dummy = new THREE.Object3D();
  return {duration: s.duration, update(time) {
    const p = C(time / s.duration), endFade = 1 - S((p - 0.90) / 0.10);
    const arrive = S((p - 0.09) / 0.26), fadeIncoming = 1 - S((p - 0.36) / 0.07);
    const headPoint = start.clone().lerp(center, arrive), tailPoint = start.clone().lerp(center, Math.max(0, arrive - 0.65));
    incoming.visible = incomingAura.visible = lance.visible = p >= 0.09 && p < 0.43;
    segment(incoming, tailPoint, headPoint, r * 0.018);
    segment(incomingAura, tailPoint, headPoint, r * 0.055);
    incoming.material.opacity = fadeIncoming * 0.95; incomingAura.material.opacity = fadeIncoming * 0.22;
    lance.position.copy(headPoint); lance.quaternion.setFromUnitVectors(UP, center.clone().sub(start).normalize());
    lance.scale.setScalar(Math.max(0.001, Math.sin(C((p - 0.09) / 0.31) * Math.PI)));
    const prismFade = S(p / 0.12) * (1 - S((p - 0.82) / 0.15));
    prismRoot.scale.setScalar(Math.max(0.001, E(p / 0.17) * (1 - S((p - 0.87) / 0.13))));
    prism.rotation.y = time * 0.9; prism.rotation.z = Math.sin(time * 0.7) * 0.18;
    prismMaterial.opacity = prismFade * 0.92; prismEdges.material.opacity = prismFade;
    orbitals.forEach((orb, i) => { orb.rotation.y = time * (0.6 + i * 0.2); orb.rotation.z = time * 0.4 + i; orb.material.opacity = prismFade * 0.6; });
    const flash = Math.max(0, 1 - Math.abs(p - 0.36) / 0.095);
    glint.scale.setScalar(flash * (0.9 + Math.sin(time * 24) * 0.12)); glint.rotation.copy(prism.rotation); opacity(glint, flash);
    branches.forEach((b, i) => {
      const flight = C((p - b.launch) / (b.impact - b.launch));
      const trail = C((p - b.impact) / 0.11);
      const startSegment = p < b.impact ? Math.max(0, Math.floor((flight - 0.34) * 72)) : Math.floor(trail * 72);
      const endSegment = Math.floor(flight * 72);
      b.tube.geometry.setDrawRange(startSegment * 36, Math.max(0, endSegment - startSegment) * 36);
      b.tube.visible = p >= b.launch && trail < 1;
      b.tube.material.opacity = (1 - trail) * 0.95;
      b.head.visible = p >= b.launch && p < b.impact;
      b.head.position.copy(b.curve.getPoint(flight)); b.head.rotation.set(time * 8, time * 5, time * 3);
      const burst = C((p - b.impact) / 0.19);
      b.shock.visible = b.crystals.visible = p >= b.impact;
      b.shock.scale.setScalar(r * (0.035 + E(burst) * (i === 1 ? 0.68 : 0.5)));
      b.shock.material.opacity = (1 - burst) * endFade;
      b.crystals.material.opacity = (1 - burst) * endFade;
      b.seeds.forEach((seed, j) => {
        const angle = seed[0] * TAU, speed = r * (0.2 + seed[1] * 0.6), size = r * (0.018 + seed[2] * 0.028);
        dummy.position.set(b.end.x + Math.cos(angle) * speed * E(burst), b.end.y + Math.sin(burst * Math.PI) * r * (0.2 + seed[3] * 0.6), b.end.z + Math.sin(angle) * speed * E(burst));
        dummy.rotation.set(seed[0] * 10 + burst * 7, seed[1] * 6, burst * 12 + j); dummy.scale.set(size, size * 3.5, size * 0.4);
        dummy.updateMatrix(); b.crystals.setMatrixAt(j, dummy.matrix);
      });
      b.crystals.instanceMatrix.needsUpdate = true;
      b.scatter.object.visible = p >= b.launch;
      b.scatter.object.material.opacity = p < b.impact ? 0.75 : (1 - burst) * endFade;
      b.scatter.update((seed, a, k) => {
        if (p < b.impact) {
          const u = C(flight - seed[0] * 0.17), pos = b.curve.getPoint(u), angle = seed[1] * TAU + time * (i + 3);
          const width = r * 0.05 * Math.sin(seed[0] * Math.PI);
          a[k] = pos.x + Math.cos(angle) * width; a[k + 1] = pos.y + Math.sin(angle) * width; a[k + 2] = pos.z + (seed[2] - 0.5) * width;
        } else {
          const angle = seed[0] * TAU, speed = r * (0.1 + seed[1] * 0.72);
          a[k] = b.end.x + Math.cos(angle) * speed * E(burst); a[k + 1] = b.end.y + Math.sin(burst * Math.PI) * r * seed[2]; a[k + 2] = b.end.z + Math.sin(angle) * speed * E(burst);
        }
      });
      s.event(`hit-${i}`, p, b.impact, 'damage', {position: b.end.toArray(), radius: r * (i === 1 ? 0.68 : 0.5), amount: (i === 1 ? 24 : 18) * s.power, direction: b.curve.getTangent(1).toArray(), targetIndex: i});
    });
    refractionDust.object.material.opacity = Math.max(0, 1 - Math.abs(p - 0.37) / 0.20) * 0.7;
    refractionDust.update((seed, a, k) => {
      const angle = seed[0] * TAU + time, spread = r * (0.06 + seed[1] * 0.33);
      a[k] = center.x + Math.cos(angle) * spread; a[k + 1] = center.y + (seed[2] - 0.5) * r * 0.75; a[k + 2] = center.z + Math.sin(angle) * spread;
    });
    s.flushEvents();
  }};
}

export const SUPPORT_FACTORIES = Object.freeze({
  'restorative-sanctuary': restorativeSanctuary,
  'magnetic-minefield': magneticMinefield,
  'mirror-decoys': mirrorDecoys,
  'stasis-bubble': stasisBubble,
  'prismatic-splitshot': prismaticSplitshot,
});
