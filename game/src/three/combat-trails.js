import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage,
  Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, PlaneGeometry,
  ShaderMaterial, Vector3,
} from 'three';

// A single camera-facing strip stretches only across distance already travelled.
export function projectileWake(origin, target, style, travel) {
  const direction = new Vector3().subVectors(target, origin);
  const distance = direction.length();
  direction.normalize();
  const material = new ShaderMaterial({
    uniforms: {
      direction: { value: direction }, lengthTravelled: { value: 0 },
      tint: { value: new Color(style.color) }, core: { value: new Color(style.core) },
    },
    vertexShader: `
      uniform vec3 direction;
      uniform float lengthTravelled;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        float tail = 1.0 - uv.x;
        vec4 center = modelViewMatrix * vec4(-direction * tail * lengthTravelled, 1.0);
        vec3 axis = mat3(modelViewMatrix) * direction;
        vec3 side = cross(axis, normalize(-center.xyz + vec3(0.0, 0.0, 0.0001)));
        side /= max(length(side), 0.001);
        center.xyz += side * position.y * (0.035 + 0.25 * uv.x);
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `
      uniform vec3 tint;
      uniform vec3 core;
      varying vec2 vUv;
      void main() {
        float band = max(0.0, 1.0 - abs(vUv.y * 2.0 - 1.0));
        float heat = band * band;
        gl_FragColor = vec4(mix(tint, core, heat * vUv.x), heat * smoothstep(0.0, 0.45, vUv.x));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: DoubleSide, transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1, 8, 2), material);
  mesh.name = 'ProjectileWake';
  mesh.position.y = 1.15;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, update(phase) {
    const head = Math.min(phase / travel, 1);
    const tail = Math.min(Math.max(phase - 0.09, 0) / travel, 1);
    const length = Math.min(3, distance * (head - tail));
    material.uniforms.lengthTravelled.value = length;
    mesh.visible = length > 0.001;
  } };
}

// Finite ballistic streaks share a draw call. Their tail is an earlier sample of
// the same trajectory, so direction and length follow gravity as sparks fall.
export function impactSpray(style, radius, density) {
  const count = Math.max(4, Math.round(18 * density));
  const position = new Float32BufferAttribute(new Float32Array(count * 6), 3).setUsage(DynamicDrawUsage);
  const colors = [], velocities = [];
  const core = new Color(style.core), rim = new Color(style.color);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963, seed = (i * 0.618034 + 0.23) % 1;
    const lateral = radius * (1.2 + 2.3 * seed);
    velocities.push(new Vector3(Math.sin(angle) * lateral, 1.5 + 3.4 * (1 - seed), Math.cos(angle) * lateral));
    colors.push(core.r, core.g, core.b, rim.r * .22, rim.g * .22, rim.b * .22);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const mesh = new LineSegments(geometry, material);
  mesh.name = 'ImpactSpray';
  mesh.frustumCulled = false;
  function place(index, v, t) {
    position.setXYZ(index, v.x * t, Math.max(.035, .18 + v.y * t - 6 * t * t), v.z * t);
  }
  return { mesh, update(phase) {
    mesh.visible = phase > 0 && phase < .5;
    if (!mesh.visible) return;
    for (let i = 0; i < count; i++) {
      place(i * 2, velocities[i], phase);
      place(i * 2 + 1, velocities[i], Math.max(0, phase - .038));
    }
    position.needsUpdate = true;
    material.opacity = (1 - phase / .5) ** 1.3;
  } };
}

export function groundNormal(world, point) {
  const normal = new Vector3(0, 1, 0);
  if (!world?.heightAt) return normal;
  const { x, z } = point, h = .35;
  const dx = world.heightAt(x - h, z) - world.heightAt(x + h, z);
  const dz = world.heightAt(x, z - h) - world.heightAt(x, z + h);
  return Number.isFinite(dx) && Number.isFinite(dz) ? normal.set(dx, 2 * h, dz).normalize() : normal;
}

// Walk the perimeter once at cast start. Matching the local terrain keeps both
// sides of a wide target marker legible on a hillside without per-frame samples.
export function zoneWindup(scene, world, target, radius, accent) {
  const segments = 64, vertices = [], fractions = [], indices = [];
  const ground = world?.heightAt?.(target.x, target.z);
  const conform = Number.isFinite(ground) && Math.abs(ground - target.y) < 1;
  for (let i = 0; i <= segments; i++) {
    const fraction = i / segments, angle = fraction * Math.PI * 2;
    for (const r of [Math.max(0, radius - Math.max(.065, radius * .028)), radius]) {
      const x = Math.sin(angle) * r, z = Math.cos(angle) * r;
      const h = conform ? world.heightAt(target.x + x, target.z + z) : target.y;
      vertices.push(x, (Number.isFinite(h) ? h - target.y : 0) + .075, z);
      fractions.push(fraction);
    }
    if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('arcFraction', new Float32BufferAttribute(fractions, 1));
  geometry.setIndex(indices);
  const material = new ShaderMaterial({
    uniforms: { progress: { value: 0 }, tint: { value: new Color(accent ?? '#e9c584') } },
    vertexShader: `
      attribute float arcFraction;
      varying float vArc;
      void main() {
        vArc = arcFraction;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying float vArc;
      uniform float progress;
      uniform vec3 tint;
      void main() {
        float charged = 1.0 - smoothstep(progress - .012, progress, vArc);
        gl_FragColor = vec4(mix(tint, vec3(1.0), .25 * charged), .23 + .66 * charged);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'ZoneWindup';
  mesh.position.copy(target);
  scene.add(mesh);
  return {
    update(progress) { material.uniforms.progress.value = progress; },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}
