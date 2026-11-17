// One reusable burst for the local player's foot contact. Positions are world
// units relative to touchdown and the existing surface state selects the medium.
import { BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial } from 'three';

export function createLandingParticles(ctx) {
  const count = Math.ceil(28 * (ctx.quality?.particles ?? 1));
  const directions = [], seeds = [];
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963;
    directions.push(Math.cos(angle), 0, Math.sin(angle));
    seeds.push((.29 + i * .618034) % 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(directions, 3));
  geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 1));
  const uniforms = {
    age: {value: 0}, power: {value: 0}, wet: {value: 0},
    pixelScale: {value: 420}, tint: {value: new Color()},
  };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float seed;
      uniform float age, power, wet, pixelScale;
      varying float vSeed;
      void main() {
        vSeed = seed;
        float spread = .12 + (1.0 - exp(-age * 4.5)) * power * (.35 + seed * .8);
        vec3 p = position * spread;
        float dust = .08 + age * (.14 + seed * .35);
        float drop = max(.035, .08 + age * (1.4 + seed * 2.) * power - 5.0 * age * age);
        p.y = mix(dust, drop, wet);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(.105 + age * .43, .045, wet) * (.65 + seed);
        gl_PointSize = clamp(pixelScale * size / max(1.0, -mv.z), 1.0, 48.0);
      }`,
    fragmentShader: `
      uniform vec3 tint;
      uniform float age, wet;
      varying float vSeed;
      void main() {
        vec2 delta = gl_PointCoord * 2.0 - 1.0;
        float edge = clamp(1.0 - dot(delta, delta), 0.0, 1.0);
        float alpha = edge * edge * (1.0 - smoothstep(.04, .55, age)) * (.36 + wet * .45);
        if (alpha < .006) discard;
        gl_FragColor = vec4(tint * (.75 + vSeed * .42), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const particles = new Points(geometry, material);
  particles.name = 'LandingParticles';
  particles.frustumCulled = false;
  const stop = () => particles.removeFromParent();
  const off = ctx.bus?.on?.('player:land', ({x, y, z, impactSpeed}) => {
    if (![x, y, z, impactSpeed].every(Number.isFinite) || impactSpeed < 2.5) return;
    const surface = ctx.surface?.sample?.(x, z);
    const snow = (surface?.snow ?? 0) > .35;
    const wet = !snow && (surface?.wetness ?? 0) > .45;
    uniforms.power.value = Math.min(1.6, impactSpeed / 9);
    uniforms.wet.value = wet ? 1 : 0;
    uniforms.tint.value.set(snow ? '#d9e3e2' : wet ? '#99b4c3' : '#998979');
    uniforms.pixelScale.value = (ctx.renderer?.domElement?.height ?? 720) * .7;
    uniforms.age.value = 0;
    particles.position.set(x, y + .02, z);
    ctx.scene.add(particles);
  });
  return {
    update(dt) {
      if (!particles.parent) return;
      uniforms.age.value += dt;
      if (uniforms.age.value >= .55) stop();
    },
    stop,
    dispose() { off?.(); stop(); geometry.dispose(); material.dispose(); },
  };
}
