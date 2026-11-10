/**
 * Synaptic Override — the dendrite crown's shape, written twice: once in GLSL
 * (the vertex stage of the arms and of their shadow) and once in JS (where the
 * solid myelin sheath, the synaptic terminals, the sparks and the contact arcs
 * are placed). Both read the same per-arm numbers, so the solid parts sit on
 * the shader-bent arms exactly.
 *
 * ## One arm
 *
 * An arm leaves the soma at radius `r0`, height `baseY`, heading straight up,
 * and bends outward with *constant curvature* through a total angle Θ. In the
 * arm's own vertical plane (outward, up), at arclength fraction s:
 *
 *     a   = Θ·s,   ρ = L/Θ
 *     out = ρ·(1 − cos a)
 *     up  = ρ·sin a + baseY·(1 − s)²
 *
 * **Why it plants where it should.** At Θ = π the tip is at `out = 2ρ = 2L/π`,
 * `up = 0`: on the floor. So an arm of length `L = π·(D − r0)/2` plants its
 * terminal exactly `D` metres from the soma's axis — and the ability derives
 * L from D every frame. D is `zoneRadius × dendriteReach` for a free arm, and
 * the *distance to its body* for a seized arm, which is how an arm swung onto
 * a target lands on that target's feet at any radius, mid-drag included.
 * Opening Θ below π (the diversion's rear-up) keeps L and so lifts the tip
 * up and out, the whole crown flinging open.
 *
 * A writhe runs sideways out of the arm's plane, `w·sin(πs)·sin(2πfs − t·k + σ)`
 * — zero at both ends, so the root and the planted terminal never slide.
 *
 * ## Twigs
 *
 * Each arm sprouts two twigs at fractions `twigAt`, `twigAt2`. A twig leaves
 * its parent's point P with the parent's heading a0 = Θ·sb (from vertical),
 * splayed `±twigSpread` in bearing, and bends on down to the floor with the
 * one radius that lands it, ρ₂ = P.y / sin a0:
 *
 *     a   = a0 + (π − a0)·t
 *     out = ρ₂·(cos a0 − cos a),  up = ρ₂·(sin a − sin a0)
 *
 * so every twig roots itself on the floor whatever the parent is doing.
 */

export const MAX_ARMS = 10;

/** The GLSL half. Needs uniforms declared by `CROWN_UNIFORMS_GLSL`. */
export const CROWN_UNIFORMS_GLSL = /* glsl */ `
  uniform vec4  uArmA[${MAX_ARMS}];   // yaw, reach D (m), growth 0..1, theta
  uniform vec4  uArmB[${MAX_ARMS}];   // writhe (m), seed, flash, flow (+1 in, -1 out)
  uniform float uR0;
  uniform float uBaseY;
  uniform float uThick;
  uniform float uTaper;
  uniform vec2  uTwigAt;
  uniform float uTwigSpread;
  uniform float uTwigThick;
  uniform float uWritheFreq;
  uniform float uWritheClock;
  uniform float uPotential;
  uniform float uPotentialWidth;
  uniform float uSwell;
`;

export const CROWN_GLSL = /* glsl */ `
  const float CROWN_PI = 3.14159265;

  vec3 crownPrimary(vec4 A, vec4 B, float s) {
    float D = max(A.y, uR0 + 0.25);
    float L = CROWN_PI * (D - uR0) * 0.5;
    float th = max(A.w, 0.05);
    float rho = L / th;
    float a = th * s;
    float outw = uR0 + rho * (1.0 - cos(a));
    float up = rho * sin(a) + uBaseY * (1.0 - s) * (1.0 - s);
    float lat = B.x * sin(CROWN_PI * s) * sin(6.2831853 * uWritheFreq * s - uWritheClock + B.y * 6.2831853);
    vec3 e = vec3(cos(A.x), 0.0, sin(A.x));
    vec3 n = vec3(-e.z, 0.0, e.x);
    return e * outw + vec3(0.0, up, 0.0) + n * lat;
  }

  vec3 crownTwig(vec4 A, vec4 B, float sb, float side, float t) {
    vec3 P = crownPrimary(A, B, sb);
    float a0 = clamp(max(A.w, 0.05) * sb, 0.35, 2.7);
    float rho = max(P.y, 0.02) / sin(a0);
    float a = a0 + (CROWN_PI - a0) * t;
    float yaw = A.x + side * uTwigSpread;
    vec3 e = vec3(cos(yaw), 0.0, sin(yaw));
    vec3 n = vec3(-e.z, 0.0, e.x);
    float lat = 0.5 * B.x * sin(CROWN_PI * t) * sin(6.2831853 * uWritheFreq * t * 0.7 - uWritheClock * 1.3 + B.y * 9.0);
    return P + e * (rho * (cos(a0) - cos(a))) + vec3(0.0, rho * (sin(a) - sin(a0)), 0.0) + n * lat;
  }

  // Centreline point for a vertex: aBranch = (arm, slot 0|1|2, side, seed).
  vec3 crownCentre(vec4 A, vec4 B, float slot, float side, float u, out float along, out float grown) {
    float g = A.z;
    if (slot < 0.5) {
      along = u * g;
      grown = g;
      return crownPrimary(A, B, along);
    }
    float sb = slot < 1.5 ? uTwigAt.x : uTwigAt.y;
    float gt = clamp((g - sb) / max(1.0 - sb, 0.05) * 1.4, 0.0, 1.0);
    along = u * gt;
    grown = gt;
    return crownTwig(A, B, sb, side, along);
  }
`;

const PI = Math.PI;

/** Scratch frame: one arm's numbers, unpacked from the uniform vectors. */
function primary(out, A, B, g, s) {
  const D = Math.max(A.y, g.r0 + 0.25);
  const L = (PI * (D - g.r0)) / 2;
  const th = Math.max(A.w, 0.05);
  const rho = L / th;
  const a = th * s;
  const outw = g.r0 + rho * (1 - Math.cos(a));
  const up = rho * Math.sin(a) + g.baseY * (1 - s) * (1 - s);
  const lat = B.x * Math.sin(PI * s) * Math.sin(2 * PI * g.writheFreq * s - g.writheClock + B.y * 2 * PI);
  const ex = Math.cos(A.x),
    ez = Math.sin(A.x);
  out.x = ex * outw - ez * lat;
  out.y = up;
  out.z = ez * outw + ex * lat;
  return out;
}

/**
 * JS mirror of `crownPrimary`.
 * @param {Vector3} out
 * @param {Vector4} A  yaw, reach, growth, theta
 * @param {Vector4} B  writhe, seed, flash, flow
 * @param {object}  g  { r0, baseY, writheFreq, writheClock }
 * @param {number}  s  arclength fraction 0..1
 */
export function armPoint(out, A, B, g, s) {
  return primary(out, A, B, g, s);
}

/** Unit tangent of an arm at s (central difference), into `out`. */
export function armTangent(out, A, B, g, s, scratch) {
  const e = 0.01;
  primary(out, A, B, g, Math.min(1, s + e));
  primary(scratch, A, B, g, Math.max(0, s - e));
  out.sub(scratch);
  const len = out.length();
  if (len < 1e-6) out.set(0, 1, 0);
  else out.multiplyScalar(1 / len);
  return out;
}

/** Arm radius at s, before swelling (matches the vertex stage). */
export function armRadius(thick, taper, s) {
  return thick * (1 - taper * s);
}
