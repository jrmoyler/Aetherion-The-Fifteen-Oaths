import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/** Impact ripples the dome can carry at once. The ability pools to this. */
export const MAX_IMPACTS = 6;

/**
 * Hex tiling, shared by the dome. `p` is in cell units with a horizontal
 * period of exactly 1, so a whole number of cells round the circumference wraps
 * without a seam. Returns xy = offset from the cell centre, zw = cell id.
 */
const HEX_GLSL = /* glsl */ `
  const vec2 HEX_S = vec2(1.0, 1.7320508);

  vec4 hexCell(vec2 p) {
    vec4 c = floor(vec4(p, p - vec2(0.5, 0.8660254)) / HEX_S.xyxy) + 0.5;
    vec4 h = vec4(p - c.xy * HEX_S, p - (c.zw + 0.5) * HEX_S);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, c.xy) : vec4(h.zw, c.zw + 0.5);
  }

  /** 0 at the centre, 0.5 on the seam. */
  float hexDist(vec2 h) {
    h = abs(h);
    return max(dot(h, HEX_S * 0.5), h.x);
  }
`;

/**
 * The dome.
 *
 * ## Placed in the vertex stage
 *
 * The mesh is a `PlaneGeometry` grid and only `uv` is read: `u` round the
 * circumference, `v` from the floor (0) to the crown (1). The vertex stage
 * wraps it onto an ellipsoidal cap of radius `uRadius` and height
 * `uRadius × uHeightScale × uRise`, and pushes it along its normal by a
 * damped wobble that climbs the wall — the pressure of the slam. Radius,
 * height and wobble are therefore live uniforms rather than baked geometry,
 * and the lattice coordinates are the grid's own `uv` so the cells stay
 * welded to the surface however the dome is reshaped.
 *
 * ## The fragment
 *
 *  - **Lattice**: `hexCell` on (u × cellsAround, v × rows). Seams are a narrow
 *    band at `hexDist ≈ 0.5`; cell faces carry a dim fill with a per-cell dice
 *    roll and a slow breathing pulse. Above `uCrown` the lattice fades into a
 *    single plate, because cells pinch to slivers at the pole.
 *  - **Forming**: each cell has a light-up time of `v + jitter`; the wave
 *    `uForm` climbs from the floor, and a cell flares (`uFormFlash`) the
 *    moment it is crossed, then settles.
 *  - **Scan lines**: `uScanCount` thin bands climbing the wall.
 *  - **Impacts**: up to `MAX_IMPACTS` points (unit direction + age). Each
 *    draws expanding rings at the great-circle distance `age × speed`, and
 *    lights the seams it crosses harder than the faces.
 *  - **Fresnel** rim, a dimmer **back face** (the far wall seen through the
 *    near), and a **soft fade** against the floor.
 *  - **Dissolve**: cell by cell, a hash per cell against `uDissolve`, each
 *    cell burning bright on its way out.
 */
const DOME_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uWobble;
  uniform float uWobbleFreq;
  uniform float uSlamAge;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vDirL;
  varying vec3  vViewDir;
  varying float vViewZ;

  void main() {
    vUv = uv;
    float phi = uv.x * 6.28318530718;
    float el = uv.y * 1.5707963;
    vec3 dir = vec3(cos(el) * cos(phi), sin(el), cos(el) * sin(phi));
    vDirL = dir;

    float h = max(uHeight, 1e-3);
    vec3 p = vec3(dir.x * uRadius, dir.y * h, dir.z * uRadius);
    // Ellipsoid normal: the gradient of x^2/R^2 + y^2/H^2 + z^2/R^2.
    vec3 n = normalize(vec3(p.x / (uRadius * uRadius), p.y / (h * h), p.z / (uRadius * uRadius)));

    // The slam's pressure wobble: a ripple climbing the wall, dying away.
    float wob = uWobble * sin(uv.y * uWobbleFreq * 3.14159 - uSlamAge * 18.0) * (1.0 - uv.y * 0.5);
    p += n * wob;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DOME_FRAGMENT = /* glsl */ `
  precision highp float;

  #define MAX_IMPACTS ${MAX_IMPACTS}

  uniform float uTime;
  uniform float uSeed;
  uniform float uFade;
  uniform float uCellsAround;
  uniform float uRows;
  uniform float uEdgeWidth;
  uniform float uEdgeBright;
  uniform float uCellFill;
  uniform float uCellVariance;
  uniform float uCrown;
  uniform float uPulseSpeed;
  uniform float uPulseDepth;
  uniform float uForm;
  uniform float uFormJitter;
  uniform float uFormFlash;
  uniform float uFresnelPower;
  uniform float uFresnelBright;
  uniform float uBackFace;
  uniform float uScanCount;
  uniform float uScanSpeed;
  uniform float uScanWidth;
  uniform float uScanBright;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uSoftFade;
  uniform float uDissolve;
  uniform float uDissolveEdge;
  uniform float uDissolveGlow;
  uniform vec4  uImpacts[MAX_IMPACTS];
  uniform float uImpactSpeed;
  uniform float uImpactWidth;
  uniform float uImpactLife;
  uniform float uImpactBright;
  uniform float uImpactRings;
  uniform vec3  uColorEdge;
  uniform vec3  uColorCell;
  uniform vec3  uColorRim;
  uniform vec3  uColorScan;
  uniform vec3  uColorImpact;
  uniform vec3  uColorForm;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform float uBodyOpacity;
  uniform float uBodyGrad;
  uniform float uSeamCore;
  uniform float uSpinU;
  uniform float uSweepPos;
  uniform float uSweepWidth;
  uniform float uSweepBright;
  uniform float uBeatPhase;
  uniform float uBeatWidth;
  uniform float uBeatBright;
  uniform float uSparkRate;
  uniform float uSparkChance;
  uniform float uSparkBright;
  uniform float uStand;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vDirL;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${HEX_GLSL}

  void main() {
    float v = vUv.y;

    /* --- the lattice --- */
    // Hex rows are 0.866 cells apart, so uRows rows span 0.866 x uRows.
    // The lattice slides round the dome while it stands (uSpinU, in turns).
    vec2 p = vec2(fract(vUv.x + uSpinU) * floor(uCellsAround + 0.5), v * uRows * 0.8660254);
    vec4 hex = hexCell(p);
    vec2 id = hex.zw;
    float d = hexDist(hex.xy);
    // Wrap the column id so the seam cell and its twin roll the same dice.
    id.x = mod(id.x, floor(uCellsAround + 0.5));
    float cellHash = hash13(vec3(id, uSeed));
    // The cell centre's height, 0..1 - what the forming wave is measured on.
    float cellV = clamp(id.y * 1.7320508 / max(uRows * 0.8660254, 1e-3), 0.0, 1.0);

    float aa = fwidth(d) * 1.5;
    float seam = smoothstep(0.5 - uEdgeWidth - aa, 0.5 - aa * 0.5, d);
    // Cells pinch to slivers at the pole: melt the lattice into one plate.
    float crownMelt = smoothstep(uCrown, min(1.0, uCrown + 0.12), v);
    seam *= 1.0 - crownMelt;

    float pulse = 1.0 - uPulseDepth * (0.5 + 0.5 * sin(uTime * uPulseSpeed * 6.2831 + cellHash * 6.2831));
    float dice = mix(1.0, cellHash * 1.6, uCellVariance);
    float fill = uCellFill * pulse * dice * (1.0 - crownMelt * 0.5) + crownMelt * uCellFill * 0.6;

    /* --- forming: a wave of cells climbing from the floor --- */
    float lightAt = cellV * (1.0 - uFormJitter) + cellHash * uFormJitter;
    float lit = step(lightAt, uForm);
    float sinceLit = max(uForm - lightAt, 0.0);
    float flare = exp(-sinceLit * 9.0) * lit;
    // The seam just above the wave is drawn as a faint guide.
    float guide = (1.0 - smoothstep(0.0, 0.12, lightAt - uForm)) * (1.0 - lit) * 0.35;

    /* --- dissolve, cell by cell --- */
    float gone = uDissolve * (1.0 + uDissolveEdge);
    if (cellHash < gone - uDissolveEdge) discard;
    // Brightest in the cells about to go, nothing in the ones with time left.
    float burning = (1.0 - smoothstep(gone - uDissolveEdge, gone, cellHash)) * step(cellHash, gone);
    burning *= step(0.0001, uDissolve);

    /* --- scan lines climbing the wall --- */
    float scanPhase = fract(v * max(uScanCount, 0.0) - uTime * uScanSpeed);
    float scan = exp(-pow(min(scanPhase, 1.0 - scanPhase) / max(uScanWidth, 1e-3), 2.0)) * step(0.5, uScanCount);

    /* --- impact ripples --- */
    vec3 dirL = normalize(vDirL);
    float impact = 0.0;
    for (int k = 0; k < MAX_IMPACTS; k++) {
      vec4 imp = uImpacts[k];
      if (imp.w < 0.0 || imp.w > uImpactLife) continue;
      float ang = acos(clamp(dot(dirL, imp.xyz), -1.0, 1.0));
      float life = 1.0 - imp.w / max(uImpactLife, 1e-3);
      float front = imp.w * uImpactSpeed;
      float ring = 0.0;
      for (int r = 0; r < 4; r++) {
        if (float(r) >= uImpactRings) break;
        float x = (ang - (front - float(r) * uImpactWidth * 2.5)) / max(uImpactWidth, 1e-3);
        ring += exp(-x * x) * (1.0 - float(r) * 0.3);
      }
      // A hot spot where it landed, for the first instant.
      ring += exp(-ang * ang / 0.02) * exp(-imp.w * 10.0) * 2.0;
      impact += ring * life * life;
    }

    /* --- the standing life of the lattice (cell-quantised, so it reads as cells) --- */
    float N = floor(uCellsAround + 0.5);
    float cellU = fract(id.x / max(N, 1.0));
    // A sweep of lit cells running round the dome like a radar arm, with a
    // comet tail of cells cooling behind it.
    float behind = fract(uSweepPos - cellU);
    float sweep = exp(-behind / max(uSweepWidth, 1e-3)) * uStand;
    sweep += exp(-fract(uSweepPos + 0.5 - cellU) / max(uSweepWidth, 1e-3)) * uStand * 0.45;
    // A heartbeat band of cells climbing from the floor to the crown.
    float beatD = (cellV - uBeatPhase) / max(uBeatWidth, 1e-3);
    float beat = exp(-beatD * beatD) * uStand;
    // Cells catching: a few cells flare hot on each tick of their own clock.
    float tick = floor(uTime * uSparkRate + cellHash * 7.0);
    float sparkOn = step(1.0 - uSparkChance, hash13(vec3(id, tick + uSeed)));
    float sparkAge = fract(uTime * uSparkRate + cellHash * 7.0);
    float spark = sparkOn * exp(-sparkAge * 4.0) * uStand;
    float energy = sweep * uSweepBright + beat * uBeatBright + spark * uSparkBright;

    /* --- compose: four stops, deep glass body carrying the light --- */
    float fres = fresnelTerm(vViewDir, vNormalW, uFresnelPower, 1.0);
    float fresLit = fres * uFresnelBright;
    // The body: deep navy where it faces the eye, saturated blue toward the rim
    // and up the wall - occluding, so the dome is a thing, not a fog.
    float grad = clamp(fres * uBodyGrad + energy * 0.15, 0.0, 1.0);
    vec3 body = mix(uColorDeep, uColorBody, grad);
    float bodyA = uBodyOpacity * (0.7 + 0.3 * clamp(fres * 1.5, 0.0, 1.0)) * lit * (1.0 - crownMelt * 0.2);

    // Seams: pale tint, with a white-hot core only along the very centre line.
    float seamCore = smoothstep(0.5 - uEdgeWidth * uSeamCore - aa, 0.5 - aa * 0.5, d) * (1.0 - crownMelt);
    // At rest the seams are saturated; the sweep, the heartbeat and the hits
    // push them through the pale scan tint to the white-hot core.
    float heat = clamp(energy * 0.6 + impact, 0.0, 1.0);
    vec3 seamCol = mix(uColorEdge, uColorScan, heat);
    seamCol = mix(seamCol, uColorCore, seamCore * heat);
    float edgeLight = seam * uEdgeBright * (1.0 + impact * 1.5 + energy * 0.8);

    vec3 glow = seamCol * (edgeLight * lit + seam * guide)
              + uColorCell * (fill * lit + energy * (1.0 - seam) * lit)
              + uColorRim * fresLit * lit
              + uColorScan * scan * uScanBright * lit
              + uColorImpact * impact * uImpactBright * (0.35 + seam)
              + uColorForm * flare * uFormFlash * (seam + 0.4)
              + uColorForm * burning * uDissolveGlow;
    glow *= uShaderIntensity * uIntensity * uGlobalGlow;

    // The far wall, seen through the near one, is a ghost of it.
    // Measured against the outward normal rather than gl_FrontFacing, so it
    // does not depend on the grid's winding once it is wrapped.
    float face = dot(vNormalW, vViewDir) > 0.0 ? 1.0 : uBackFace;
    float k = uFade * uOpacity * face;
    float alpha = clamp(bodyA, 0.0, 1.0) * k;
    vec3 color = (body * alpha) + glow * k;
    if (alpha < 0.003 && dot(color, vec3(1.0)) < 0.003) discard;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    // Premultiplied: the body occludes what is behind it, the light adds.
    gl_FragColor = vec4(color * soft, alpha * soft);
  }
`;

/**
 * The sigil under the dome — a flat quad, drawn in metres from its centre.
 *
 * Three concentric pieces, every one an SDF so the strokes stay the same
 * physical width as the dome is resized:
 *
 *  - two **circles** bounding a band, with tick marks;
 *  - a ring of **runes** in that band, turning slowly. Each rune is built from
 *    a hash: six candidate strokes (a stave, two diagonals, a bar, a ring and
 *    a chevron) and the rune's dice pick which of them it has — so every
 *    sector has its own glyph, and the band never repeats in an obvious way;
 *  - a **hexagram** inside, two triangles counter-rotating against the band.
 *
 * It draws itself in: `uGrow` sweeps round the circle, and `uFade` takes it
 * out. A per-rune flicker makes the glyphs catch and drop like a projection.
 */
const SIGIL_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2  vLocal;

  void main() {
    vLocal = (uv - 0.5) * uQuadSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // outer radius of the band, metres
  uniform float uBand;        // band width, metres
  uniform float uRunes;
  uniform float uRuneSize;
  uniform float uLine;
  uniform float uSpin;        // band angle, radians
  uniform float uInnerSpin;   // hexagram angle, radians
  uniform float uStar;
  uniform float uGrow;        // 0..1 sweep
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFlicker;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;
  uniform float uFill;        // 0..1 opacity of the deep floor field
  uniform float uDomeR;       // the dome's footprint, metres
  uniform float uHexSize;     // floor hex cell, metres
  uniform float uHexBright;
  uniform float uContact;     // the bright foot where the dome meets the floor
  uniform float uRingPhase;   // 0..1 ripple running out from the centre
  uniform float uRingBright;
  uniform float uStand;       // 0 before the slam, 1 while the dome stands
  uniform vec3  uColorFloorDeep;
  uniform vec3  uColorFloorBody;

  varying vec2 vLocal;

  ${noiseGLSL}
  ${HEX_GLSL}

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float sdTriangle(vec2 p, float r) {
    const float k = 1.7320508;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }

  /** One glyph in a unit cell (-1..1), its strokes picked by hash bits. */
  float rune(vec2 q, float h) {
    float d = 1e3;
    float b0 = step(0.5, fract(h * 7.31));
    float b1 = step(0.5, fract(h * 13.7));
    float b2 = step(0.5, fract(h * 29.3));
    float b3 = step(0.5, fract(h * 51.1));
    float b4 = step(0.6, fract(h * 83.9));
    float b5 = step(0.55, fract(h * 97.3));
    d = min(d, sdSegment(q, vec2(0.0, -0.8), vec2(0.0, 0.8)));                    // stave, always
    d = mix(d, min(d, sdSegment(q, vec2(0.0, 0.3), vec2(0.55, 0.75))), b0);         // arm up
    d = mix(d, min(d, sdSegment(q, vec2(0.0, -0.1), vec2(-0.55, 0.35))), b1);       // arm left
    d = mix(d, min(d, sdSegment(q, vec2(-0.45, -0.45), vec2(0.45, -0.45))), b2);    // bar
    d = mix(d, min(d, abs(length(q - vec2(0.0, 0.45)) - 0.25)), b3);                // ring
    d = mix(d, min(d, min(sdSegment(q, vec2(-0.5, -0.8), vec2(0.0, -0.35)),
                          sdSegment(q, vec2(0.5, -0.8), vec2(0.0, -0.35)))), b4);   // chevron
    d = mix(d, min(d, sdSegment(q, vec2(0.0, 0.05), vec2(0.5, -0.3))), b5);         // arm down
    return d;
  }

  void main() {
    float r = length(vLocal);
    float ang = atan(vLocal.y, vLocal.x);
    float aa = fwidth(r) * 1.2;
    float line = max(uLine, 1e-3);

    // Draw-in sweep, round the circle.
    float sweep = fract((ang + 3.14159265) / 6.28318530718 + 0.25);
    float reveal = (1.0 - smoothstep(uGrow - 0.02, uGrow, sweep)) * step(0.0001, uGrow);
    if (uGrow >= 1.0) reveal = 1.0;

    float outer = uRadius;
    float inner = max(0.0, uRadius - uBand);
    float d = 1e3;

    /* --- the bounding circles, and ticks --- */
    d = min(d, abs(r - outer));
    d = min(d, abs(r - inner));
    d = min(d, abs(r - (outer + line * 4.0)) + line * 0.4);
    float tickA = ang + uSpin * 0.5;
    float ticks = 72.0;
    float tickCell = (fract(tickA / 6.28318530718 * ticks) - 0.5) * 6.28318530718 / ticks * (outer + line * 4.0);
    float tick = max(abs(tickCell), abs(r - (outer + line * 2.0)) - line * 1.5);
    d = min(d, tick);

    /* --- runes in the band --- */
    float n = max(3.0, floor(uRunes + 0.5));
    float a = ang - uSpin;
    float sector = floor((a / 6.28318530718 + 0.5) * n);
    float centreA = (sector + 0.5) / n * 6.28318530718 - 3.14159265;
    float mid = (outer + inner) * 0.5;
    // Radial and (wrapped) tangential offset from the sector's centre, metres.
    vec2 rel = vec2(r - mid, (mod(a - centreA + 3.14159265, 6.28318530718) - 3.14159265) * mid);
    float cell = max(uBand * 0.5 * uRuneSize, 1e-3);
    float h = hash11(sector + uSeed * 17.0);
    float rd = rune(vec2(rel.y, rel.x) / cell, h) * cell;
    float flick = 1.0 - uFlicker * step(0.86, hash11(sector + floor(uTime * 7.0 + h * 5.0)));
    float runeLine = (1.0 - smoothstep(line * 0.5 - aa, line * 0.5 + aa, rd)) * flick;

    /* --- the hexagram --- */
    vec2 sp = vLocal;
    float c1 = cos(uInnerSpin), s1 = sin(uInnerSpin);
    sp = mat2(c1, -s1, s1, c1) * sp;
    float tri = inner * 0.86;
    float star = min(abs(sdTriangle(sp, tri * 0.5)), abs(sdTriangle(-sp, tri * 0.5)));
    star = min(star, abs(r - tri * 0.62));
    d = mix(d, min(d, star), step(0.01, uStar));

    float stroke = 1.0 - smoothstep(line * 0.5 - aa, line * 0.5 + aa, d);
    stroke = max(stroke, runeLine);
    // A wash in the band so the runes sit on something.
    float band = smoothstep(inner - aa, inner + aa, r) * (1.0 - smoothstep(outer - aa, outer + aa, r));
    float wash = band * 0.22;

    /* --- the field: a deep, filled floor inside the sigil --- */
    float inside = 1.0 - smoothstep(outer - aa * 2.0, outer + aa * 2.0, r);
    // Deep at the centre, saturated body toward the rim of the dome.
    float radial = clamp(r / max(uDomeR, 1e-3), 0.0, 1.0);
    vec3 field = mix(uColorFloorDeep, uColorFloorBody, radial * radial);
    float fieldA = inside * uFill * (0.75 + 0.25 * radial);

    // The lattice's own footprint on the floor: faint hex seams, energised by
    // the ripple running out from the centre while the dome stands.
    vec4 hx = hexCell(vLocal / max(uHexSize, 0.05));
    float hd = hexDist(hx.xy);
    float hexSeam = smoothstep(0.43, 0.49, hd) * inside * (1.0 - smoothstep(uDomeR * 0.98, uDomeR * 1.02, r));
    float ringD = (r - uRingPhase * uDomeR * 1.05) / max(uDomeR * 0.08, 0.05);
    float ring = exp(-ringD * ringD) * uStand * inside;
    // The foot of the dome: a hot band where the wall meets the floor.
    float footD = (r - uDomeR) / max(uDomeR * 0.035, 0.03);
    float foot = exp(-footD * footD) * uContact * uStand;

    float hot = runeLine;
    float shimmer = 0.85 + 0.15 * snoise(vec3(vLocal * 0.8, uTime * 0.6 + uSeed));
    vec3 light = mix(uColor, uColorHot, hot * 0.7) * (stroke + wash) * shimmer
               + uColor * hexSeam * uHexBright * (0.35 + ring * 2.5)
               + mix(uColor, uColorHot, 0.5) * ring * uRingBright
               + mix(uColor, uColorHot, 0.6) * foot;
    float k = reveal * uFade * uOpacity;
    float alpha = clamp(fieldA, 0.0, 1.0) * k;
    vec3 color = field * alpha + light * uGlow * uGlobalGlow * k;
    if (alpha < 0.003 && dot(color, vec3(1.0)) < 0.003) discard;
    // Premultiplied: the deep field darkens the floor, the strokes add light.
    gl_FragColor = vec4(color, alpha);
  }
`;

/* ==================================================================== */
/* Factories                                                             */
/* ==================================================================== */

export function createAegisDomeMaterial() {
  const impacts = [];
  for (let i = 0; i < MAX_IMPACTS; i++) impacts.push(new Vector4(0, 1, 0, -1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Premultiplied over: the deep body darkens the floor behind it, and the
    // seams, scan lines and ripples still add light on top.
    blending: NormalBlending,
    premultipliedAlpha: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uRadius: { value: 3 },
      uHeight: { value: 2.5 },
      uWobble: { value: 0 },
      uWobbleFreq: { value: 7 },
      uSlamAge: { value: 0 },
      uFade: { value: 1 },
      uCellsAround: { value: 18 },
      uRows: { value: 6.5 },
      uEdgeWidth: { value: 0.07 },
      uEdgeBright: { value: 2.4 },
      uCellFill: { value: 0.14 },
      uCellVariance: { value: 0.55 },
      uCrown: { value: 0.86 },
      uPulseSpeed: { value: 1.4 },
      uPulseDepth: { value: 0.35 },
      uForm: { value: 0 },
      uFormJitter: { value: 0.18 },
      uFormFlash: { value: 3 },
      uFresnelPower: { value: 2.6 },
      uFresnelBright: { value: 1.3 },
      uBackFace: { value: 0.45 },
      uScanCount: { value: 2 },
      uScanSpeed: { value: 0.45 },
      uScanWidth: { value: 0.035 },
      uScanBright: { value: 1.8 },
      uIntensity: { value: 1.6 },
      uOpacity: { value: 1 },
      uSoftFade: { value: 0.35 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.12 },
      uDissolveGlow: { value: 4 },
      uImpacts: { value: impacts },
      uImpactSpeed: { value: 1.7 },
      uImpactWidth: { value: 0.12 },
      uImpactLife: { value: 0.9 },
      uImpactBright: { value: 3.2 },
      uImpactRings: { value: 2 },
      uColorEdge: { value: new Color() },
      uColorCell: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorScan: { value: new Color() },
      uColorImpact: { value: new Color() },
      uColorForm: { value: new Color() },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uBodyOpacity: { value: 0.55 },
      uBodyGrad: { value: 1.4 },
      uSeamCore: { value: 0.35 },
      uSpinU: { value: 0 },
      uSweepPos: { value: 0 },
      uSweepWidth: { value: 0.12 },
      uSweepBright: { value: 1.2 },
      uBeatPhase: { value: -1 },
      uBeatWidth: { value: 0.08 },
      uBeatBright: { value: 1.4 },
      uSparkRate: { value: 2 },
      uSparkChance: { value: 0.06 },
      uSparkBright: { value: 2 },
      uStand: { value: 0 }
    }),
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT
  });

  /**
   * @param {object} state { radius, height, wobble, slamAge, form, dissolve,
   *   fade, seed, spinU, sweepPos, beatPhase, stand } — the dome's own
   *   envelope and integrated clocks, which the ability owns.
   *   The impact array is written by the ability directly.
   */
  material.userData.sync = (state) => {
    const c = settings.aegis;
    const g = settings.global;
    const u = material.uniforms;

    u.uSeed.value = state.seed;
    u.uRadius.value = state.radius;
    u.uHeight.value = state.height;
    u.uWobble.value = state.wobble * g.noiseStrength;
    u.uSlamAge.value = state.slamAge;
    u.uForm.value = state.form;
    u.uDissolve.value = state.dissolve;
    u.uFade.value = state.fade;
    u.uSpinU.value = state.spinU;
    u.uSweepPos.value = state.sweepPos;
    u.uBeatPhase.value = state.beatPhase;
    u.uStand.value = state.stand;

    u.uBodyOpacity.value = c.bodyOpacity * g.opacity;
    u.uBodyGrad.value = c.bodyGrad;
    u.uSeamCore.value = c.seamCore;
    u.uSweepWidth.value = c.sweepWidth;
    u.uSweepBright.value = c.sweepBright * g.shaderIntensity;
    u.uBeatWidth.value = c.beatWidth;
    u.uBeatBright.value = c.beatBright * g.shaderIntensity;
    u.uSparkRate.value = c.sparkRate * g.noiseSpeed;
    u.uSparkChance.value = c.sparkChance * g.randomness;
    u.uSparkBright.value = c.sparkBright;

    u.uWobbleFreq.value = c.wobbleFreq;
    u.uCellsAround.value = Math.max(3, Math.round(c.cellsAround));
    u.uRows.value = c.cellRows;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEdgeBright.value = c.edgeBright;
    u.uCellFill.value = c.cellFill;
    u.uCellVariance.value = c.cellVariance * g.randomness;
    u.uCrown.value = c.crown;
    u.uPulseSpeed.value = c.pulseSpeed * g.noiseSpeed;
    u.uPulseDepth.value = c.pulseDepth;
    u.uFormJitter.value = c.formJitter * g.randomness;
    u.uFormFlash.value = c.formFlash;
    u.uFresnelPower.value = c.fresnelPower;
    u.uFresnelBright.value = c.fresnelBright * g.fresnel;
    u.uBackFace.value = c.backFace;
    u.uScanCount.value = c.scanCount;
    u.uScanSpeed.value = c.scanSpeed * g.noiseSpeed;
    u.uScanWidth.value = c.scanWidth;
    u.uScanBright.value = c.scanBright;
    u.uIntensity.value = c.intensity * g.glow;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uSoftFade.value = c.softFade;
    u.uDissolveEdge.value = c.dissolveEdge;
    u.uDissolveGlow.value = c.dissolveGlow;
    u.uImpactSpeed.value = c.impactSpeed;
    u.uImpactWidth.value = c.impactWidth;
    u.uImpactLife.value = c.impactLife;
    u.uImpactBright.value = c.impactBright;
    u.uImpactRings.value = c.impactRings;

    u.uColorEdge.value.copy(getColor(c.colorEdge));
    u.uColorCell.value.copy(getColor(c.colorCell));
    u.uColorRim.value.copy(getColor(c.colorRim));
    u.uColorScan.value.copy(getColor(c.colorScan));
    u.uColorImpact.value.copy(getColor(c.colorImpact));
    u.uColorForm.value.copy(getColor(c.colorForm));
    u.uColorCore.value.copy(getColor(c.colorCore));
    u.uColorBody.value.copy(getColor(c.colorBody));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
  };

  return material;
}

export function createAegisSigilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    premultipliedAlpha: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uQuadSize: { value: 8 },
      uRadius: { value: 3.5 },
      uBand: { value: 0.6 },
      uRunes: { value: 14 },
      uRuneSize: { value: 0.75 },
      uLine: { value: 0.03 },
      uSpin: { value: 0 },
      uInnerSpin: { value: 0 },
      uStar: { value: 1 },
      uGrow: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 2 },
      uOpacity: { value: 1 },
      uFlicker: { value: 0.25 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() },
      uFill: { value: 0.6 },
      uDomeR: { value: 3 },
      uHexSize: { value: 0.5 },
      uHexBright: { value: 0.6 },
      uContact: { value: 1.5 },
      uRingPhase: { value: 0 },
      uRingBright: { value: 1 },
      uStand: { value: 0 },
      uColorFloorDeep: { value: new Color() },
      uColorFloorBody: { value: new Color() }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {object} state { radius, quadSize, spin, innerSpin, grow, fade, seed, ringPhase, stand } */
  material.userData.sync = (state) => {
    const c = settings.aegis;
    const g = settings.global;
    const u = material.uniforms;

    u.uSeed.value = state.seed;
    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius * c.sigilScale;
    u.uBand.value = state.radius * c.sigilBand;
    u.uSpin.value = state.spin;
    u.uInnerSpin.value = state.innerSpin;
    u.uGrow.value = state.grow;
    u.uFade.value = state.fade;

    u.uRunes.value = c.sigilRunes;
    u.uRuneSize.value = c.sigilRuneSize;
    u.uLine.value = c.sigilLine;
    u.uStar.value = c.sigilStar;
    u.uGlow.value = c.sigilGlow * g.glow;
    u.uOpacity.value = c.sigilOpacity * g.opacity;
    u.uFlicker.value = c.sigilFlicker * g.shaderIntensity;
    u.uColor.value.copy(getColor(c.colorSigil));
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
    u.uDomeR.value = state.radius;
    u.uRingPhase.value = state.ringPhase;
    u.uStand.value = state.stand;
    u.uFill.value = c.floorFill * g.opacity;
    u.uHexSize.value = state.radius * c.floorHexSize;
    u.uHexBright.value = c.floorHexBright * g.shaderIntensity;
    u.uContact.value = c.floorContact;
    u.uRingBright.value = c.floorRingBright;
    u.uColorFloorDeep.value.copy(getColor(c.colorFloorDeep));
    u.uColorFloorBody.value.copy(getColor(c.colorFloorBody));
  };

  return material;
}
