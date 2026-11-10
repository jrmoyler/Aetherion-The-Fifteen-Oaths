/**
 * Martyr's Accord — holy, zone cast. Data only, no imports.
 *
 * Protective sacrifice, as a rule rather than a theme: a gilded reliquary
 * heart is thrown onto the circle and seals an *accord* there. Allies inside
 * are sanctified (protected); every enemy inside is **bound** to the heart, and
 * for each of them a sword of light forms and drives into it — the heart takes
 * the blows that were theirs to give. When the vigil is over the martyr
 * breaks: the light runs back up every sword, and each bound enemy is struck
 * once and thrown straight *away from the one the heart protected* (the
 * caster), harder for every ally the accord sheltered.
 *
 * Every key below is a live editor control. Placement is derived from
 * `zoneRadius` (heart size, sword length, glory, crown, floor), so dragging
 * the radius mid-cast keeps every blade landing in the heart.
 */
export default {
  id: 'martyrsAccord',
  meta: {
    label: "Martyr's Accord",
    accent: '#ffd98a',
    element: 'holy',
    cast: 'zone',
    hint: 'Holy — a gilded heart takes every blow meant for your allies, then breaks and hurls the bound enemies away from you',
    glyph:
      '<path d="M50 86C31 70 19 58 19 43C19 33 27 26 36 26C42 26 47 29 50 34C53 29 58 26 64 26C73 26 81 33 81 43C81 58 69 70 50 86Z"/><path d="M50 52V6M50 52L10 30M50 52L90 30M43 6H57M14 24L8 36M86 24L92 36"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // maximum cast distance (m)
    minRange: 2, // closer than this and the cast is refused (m)
    speed: 24, // the heart flies to the circle at (m/s)
    cooldown: 7, // seconds before it can be cast again
    castAnim: 'cast3', // body throw clip
    zoneRadius: 4, // the accord's circle (m): binding, shelter and every placement derive from it
    lifetime: 3.6, // nominal on-screen length, for the HUD (s)

    /* --- the accord (gameplay) --- */
    sacrificeDelay: 1.7, // the heart breaks this long after it lands (s, × global lifetime)
    maxBound: 7, // at most this many enemies are bound (≤ 7, one sword each)
    sacrificeDamage: 1, // damage of the returned blow to each bound enemy
    wardBonus: 0.5, // extra damage per ally the accord sheltered
    wardBonusCap: 4, // at most this many sheltered allies count
    hitImpulse: 14, // knockback away from the caster (× explosion intensity)
    hitLift: 6, // upward throw (× explosion intensity)
    hitSpin: 2.5, // tumble

    /* --- timing (× global lifetime) --- */
    arriveTime: 0.3, // the heart unfurls to full size over (s)
    swordsStart: 0.2, // first sword begins to form this long after landing (s)
    plungeStagger: 0.17, // seconds between swords (compressed to fit before the sacrifice)
    plungeTime: 0.34, // a sword forms and drives home over (s)
    formFraction: 0.45, // fraction of a plunge spent forming the blade
    ruptureLinger: 0.8, // the broken heart's aftermath lasts (s)
    fade: 0.9, // exit: shards sink, floor dissolves (s)

    /* --- light --- */
    lightColor: '#ffd98a',
    lightIntensity: 6,
    lightRadius: 11,
    arriveLight: 4, // punch when the heart lands (× explosion intensity)
    plungeLight: 1.6, // punch per sword
    ruptureLight: 10, // punch at the sacrifice

    /* --- palette: one four-stop holy ramp for every layer --- */
    colorCore: '#fffbe9', // white-hot
    colorTint: '#ffe39a', // pale gold
    colorBody: '#e39b2c', // saturated amber
    colorDeep: '#3a0d0b', // oxblood deep

    /* --- 1 · the heart (lit reliquary gold) --- */
    heartScale: 0.56, // heart height (× zoneRadius)
    heartLift: 1.05, // gap between its tip and the floor (m)
    heartSway: 0.28, // slow sway either side of facing the caster (rad)
    heartColor: '#e2a447', // gold
    enamelColor: '#4a0f0d', // oxblood enamel in the cleft and the tip
    heartMetalness: 0.92,
    heartRoughness: 0.36,
    heartEmissive: '#8a420e',
    heartEmissiveGlow: 1.1,
    beatRate: 1.5, // heartbeats per second during the vigil
    beatAmount: 0.06, // scale throb per beat
    crackGlow: 2.2, // light in the crack network
    crackScale: 3.2, // crack cell density
    woundGlow: 2.2, // light where each sword went in
    woundSize: 0.18, // wound spread (cosine width)
    beltGlow: 1.4, // chased belt answering the heartbeat
    recoil: 0.14, // the heart is knocked back by each sword (m)
    recoilDecay: 9, // and settles at (1/s)
    swell: 0.22, // it swells this much just before it breaks
    travelScale: 0.3, // its size while flying (× full)
    arcHeight: 0.16, // flight arc (× cast distance)
    travelSpin: 7, // it turns while flying (rad/s)

    /* --- 2 · the aura --- */
    auraGlow: 1.8,
    auraInflate: 0.05, // shell distance from the gold (heart units)
    auraFresnel: 2.4, // rim sharpness
    auraOpacity: 0.75,

    /* --- 3 · the swords --- */
    swordCount: 7, // swords shown (bound enemies take the nearest slots)
    swordReach: 0.72, // blade length (× zoneRadius)
    swordPitch: 0.42, // hilts raised above the heart (rad)
    swordWidth: 2.8, // blade breadth (×)
    plungeReach: 0.5, // drawn back before the thrust (× zoneRadius)
    tipDepth: 0.1, // points buried in the heart (× heart size)
    bladeGlow: 3.4,
    bladeOpacity: 0.95,
    boundBoost: 1.5, // swords of bound enemies burn brighter (×)
    hiltColor: '#8f5f1f',
    hiltMetalness: 0.9,
    hiltRoughness: 0.32,
    returnDrift: 0.35, // after the sacrifice the swords back out (× zoneRadius)
    returnTime: 0.65, // and dissolve point-first over (s)

    /* --- 4 · the crown of thorns --- */
    crownScale: 0.62, // crown radius (× heart size)
    crownTilt: 0.32, // tilt off level (rad)
    crownSpin: 0.6, // turns at (rad/s)
    crownTighten: 0.22, // pulls in this much as the blows land (×)
    crownSnap: 0.55, // flies out at the sacrifice (× zoneRadius)
    crownColor: '#3c2312', // briar bronze
    crownMetalness: 0.55,
    crownRoughness: 0.55,

    /* --- 5 · the flame --- */
    flameHeight: 0.75, // above the cleft (× heart size)
    flameWidth: 0.26, // (× heart size)
    flameGlow: 2.2,
    flameSpeed: 1.6, // fire scroll speed
    flameFlare: 1.6, // grows by this at the sacrifice (×)

    /* --- 6 · the glory --- */
    gloryScale: 1, // radius of the sunburst (× zoneRadius)
    gloryRays: 28, // rays (even)
    gloryGlow: 1.2,
    gloryOpacity: 0.5,
    glorySpin: 0.12, // turns at (rad/s)
    gloryGather: 0.08, // brightens per sword
    gloryFlare: 2, // flares at the sacrifice (×)
    gloryOffset: 0.5, // sits this far behind the heart (m)

    /* --- 7 · the consecrated floor --- */
    floorGlow: 1.5,
    floorFill: 0.6, // sanctified field opacity
    floorRayGlow: 1.6, // accord rays to the bound
    sealWidth: 0.07, // line width (m)
    searGlow: 2.0, // the sacrifice's sear ring and cracks
    searTime: 0.5, // the sear runs out over (s)
    floorNoise: 1, // mottling
    dissolveTime: 0.75, // fraction of the exit spent dissolving

    /* --- 8 · the shards --- */
    shardCount: 36, // fragments of the broken heart (≤ 48)
    shardSize: 1.3,
    shardSpeed: 4.2, // thrown out at (m/s)
    shardLift: 3.2, // and up (m/s)
    shardGravity: 11,
    shardSpin: 7, // tumble (rad/s)
    shardCool: 0.9, // white-hot to oxblood over (s)

    /* --- 9 · particles --- */
    moteRate: 40, // rising motes over the floor during the vigil (/s)
    trailRate: 80, // motes trailed by the flying heart (/s)
    moteSize: 0.09,
    moteLife: 1.4,
    moteRise: 0.8, // buoyancy
    moteGlow: 1.6,
    sparkCount: 16, // sparks where each sword goes in
    sparkRupture: 96, // sparks at the sacrifice
    sparkSize: 0.07,
    sparkLife: 0.5,
    sparkSpeed: 6,
    sparkGlow: 2.6,
    flakeCount: 64, // gold leaf thrown at the sacrifice
    flakeSize: 0.08,
    flakeLife: 1.8,
    flakeSpeed: 3.4,
    flakeGravity: 4,

    /* --- 10 · the beats --- */
    arriveShake: 0.08, // (× explosion intensity, × camera shake)
    plungeShake: 0.035,
    ruptureShake: 0.32,
    shakeDecay: 6,
    shakeFrequency: 18,
    arriveFlash: 0.05, // (× explosion intensity)
    ruptureFlash: 0.16,
    decalLife: 2.4,
    crackDecal: 1.1, // CRACK decal radius (× zoneRadius)
    scorchDecal: 0.8, // SCORCH decal radius (× zoneRadius)
    shockwaveWidth: 0.08,
    burstReach: 0.85, // sacrifice shell grows to (× zoneRadius)
    burstLife: 0.6,
    burstIntensity: 1,
    burstOpacity: 0.28,
    burstFresnel: 2.2,
    burstSquash: 0.4,
    colorBurstA: '#fffbe9',
    colorBurstB: '#ffcf6a',
    colorBurstC: '#7a2414',

    /* --- 11 · the lens --- */
    lensHeat: 0.45, // shimmer over the flame (× global distortion)
    lensShock: 1.2, // pressure ring of the sacrifice
  },
};
