"""15 Impulse Foundry — ninja (reference-063) and sorcerer (reference-062)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

GUN = '#3a3c40'
DARK = '#24262a'
ORANGE = '#e0701c'
CYAN = '#7ae8ff'


def ff(b, sd):
    a, c = b.bones['forearm.' + sd]
    ax = S.normalize(c - a)
    out = S.normalize(np.cross(ax, (0, -1, 0)))
    if out[2] < 0:
        out = -out
    return a, c, ax, out, np.stack([S.normalize(np.cross(out, ax)), out, ax], axis=1)


@hero('oath-15-ninja', ref='reference-063', skin='#5a3424', eyes='#1a100a', hair='#120c0a', tris=26000,
      body=dict(H=1.72, sex=1.0, mass=0.1, muscle=0.9, grip_r=True))
def imp_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    top = F.part(('cloth', DARK), None, 'soft', 'top')
    pants = F.part(('cloth', GUN), None, 'soft', 'pants')
    orange = F.part(('ceramic', ORANGE, {'rough': 0.55}), None, 'soft', 'orangepanels')
    plate = F.part(('ceramic', ORANGE, {'rough': 0.55}), 'spine2', 'rigid', 'chestplate')
    harness = F.part(('rubber', '#1a1a1c'), None, 'soft', 'harness')
    steel = F.part(('steel', '#8a8c90'), None, 'soft', 'steel')
    gauntL = F.part(('gunmetal', '#4a4c50'), 'forearm.L', 'rigid', 'gauntL')
    gauntR = F.part(('gunmetal', '#4a4c50'), 'forearm.R', 'rigid', 'gauntR')
    cy = F.part(('glow', '#0a2a30', {'glow': CYAN}), None, 'soft', 'cyan')
    hose = F.part(('rubber', '#141414'), 'hips', 'rigid', 'hoses')
    strutL = F.part(('steel', '#9a9ca0'), 'thigh.L', 'rigid', 'strutL')
    strutR = F.part(('steel', '#9a9ca0'), 'thigh.R', 'rigid', 'strutR')
    sstrL = F.part(('steel', '#9a9ca0'), 'shin.L', 'rigid', 'shinstrutL')
    sstrR = F.part(('steel', '#9a9ca0'), 'shin.R', 'rigid', 'shinstrutR')
    boot = F.part(('rubber', '#202022'), None, 'soft', 'boots')
    visor = F.part(('lacquer', '#141416'), 'head', 'rigid', 'visor')
    vglow = F.part(('glow', '#30303a', {'glow': '#f4f8ff'}), 'head', 'rigid', 'chevron')
    phone = F.part(('gunmetal', '#5a5c60'), 'head', 'rigid', 'headphones')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'dreads')
    K.shirt(F, b, top, sleeve=0.0, neck=0.95, hem=-0.4, thick=0.006)
    K.pants(F, b, pants, bottom=0.75, waist=0.75, thick=0.012, bag=0.05)
    for sd, sx in (('L', 1), ('R', -1)):
        F.paint(orange, S.ellipsoid(K.limb_point(b, 'thigh.' + sd, 0.3) + v3(sx * 0.08, -0.04, 0), (0.04, 0.06, 0.08)), only=[pants])
        K.pouch(F, pants, K.limb_point(b, 'thigh.' + sd, 0.55) + v3(sx * 0.11 * s, 0, 0), (0.025, 0.05, 0.06))
    K.boots(F, b, boot, top=0.7, thick=0.016, sole_pid=orange, sole=0.03)
    z2 = J['spine2'][2]
    F.shell(plate, S.roundbox((0, -0.2, z2 - 0.01), (0.12 * w, 0.2, 0.08 * s), None, 0.02), 0.012, 0.03, 0.006, 'cur')
    F.shell(plate, S.roundbox((0, 0.2, z2 - 0.01), (0.05 * w, 0.2, 0.12 * s), None, 0.012), 0.012, 0.03, 0.006, 'cur')
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        K.strap(F, b, harness, J['S' + sd] + v3(-sx * 0.06, -0.25, 0.04), J['S' + sd] + v3(-sx * 0.06, 0.25, 0.04), 0.035, 0.03, t1=0.016, around=(1, 0, 0))
    zt = J['pelvis'][2] + 0.05 * s
    K.belt(F, b, harness, zt, 0.04, 0.02, t1=0.008)
    K.belt(F, b, harness, J['spine1'][2] - 0.06, 0.03, 0.03, t1=0.018)
    yf = K.body_extent(b, zt, 0, 'front')
    for sx in (1, -1):
        hc0 = v3(sx * 0.15 * w, yf + 0.02, zt - 0.06)
        F.solid(hose, S.torus(hc0, 0.06, 0.012, S.frame_from_axis((1, 0.2, 0))), 0.002)
        F.solid(hose, S.torus(hc0 + v3(sx * 0.01, 0, -0.03), 0.055, 0.011, S.frame_from_axis((1, -0.2, 0.1))), 0.002)
    for sd, gp in (('L', gauntL), ('R', gauntR)):
        a, c, ax, out, M = ff(b, sd)
        bc = a + (c - a) * 0.55
        F.shell(gp, S.capsule(a + (c - a) * 0.2, a + (c - a) * 0.92, 0.08 * s), 0.008, 0.03, 0.006)
        F.solid(orange, S.roundbox(bc + out * 0.06 * s, (0.03, 0.01, 0.07), M, 0.005), 0.002)
        F.paint(cy, S.capsule(bc + out * 0.05 * s + M[:, 0] * 0.04 - ax * 0.06, bc + out * 0.05 * s + M[:, 0] * 0.04 + ax * 0.06, 0.008), only=[gp])
        K.gloves(F, b, boot, cuff=0.9, thick=0.006)
    for sd, sp, ss in (('L', strutL, sstrL), ('R', strutR, sstrR)):
        sx = 1 if sd == 'L' else -1
        Kn = J['K' + sd]
        F.solid(sp, S.capsule(J['Hp' + sd] + v3(sx * 0.11, 0, -0.08), Kn + v3(sx * 0.07, 0, 0.02), 0.012), 0.002)
        F.solid(ss, S.capsule(Kn + v3(sx * 0.07, 0, -0.02), J['A' + sd] + v3(sx * 0.06, 0, 0.08), 0.011), 0.002)
        F.solid(sp, S.cylinder(Kn + v3(sx * 0.055, 0, 0), Kn + v3(sx * 0.09, 0, 0), 0.032, 0.004), 0.002)
        F.paint(cy, S.sphere(Kn + v3(sx * 0.09, 0, 0), 0.02), only=[sp])
    hc, hs = b.hc, b.hs
    vm = S.ellipsoid(hc + v3(0, -0.06, -0.02) * hs, (0.085 * hs, 0.08 * hs, 0.10 * hs)).inter(S.halfspace(hc + v3(0, -0.03, 0) * hs, (0, 1, 0)), 0.003)
    F.shell(visor, vm, 0.006, 0.022, 0.004, 'body')
    F.paint(vglow, S.Prim(lambda P: np.abs((P[..., 2] - (hc[2] - 0.0 * hs)) + 0.5 * np.abs(P[..., 0] - hc[0])) - 0.006, hc - 0.2, hc + 0.2).inter(S.slab(hc, (1, 0, 0), 0.10 * hs), 0), only=[visor])
    for sx in (1, -1):
        F.solid(phone, S.cylinder(hc + v3(sx * 0.07, 0.005, -0.005) * hs, hc + v3(sx * 0.10, 0.005, -0.005) * hs, 0.032 * hs, 0.004), 0.003)
        F.paint(cy, S.sphere(hc + v3(sx * 0.10, 0.005, -0.005) * hs, 0.012), only=[phone])
    K.hair_cap(F, b, hair, thick=0.010, front=0.06, side=0.01, back=-0.05, fold=0.003)
    rng = np.random.default_rng(15)
    pts, _ = K._scalp_points(b, 34, 0.15, 151)
    for p, d in pts:
        flow = S.normalize(d * 0.5 + v3(0, 0.35, -0.8) + rng.normal(0, 0.15, 3))
        L = (0.12 + 0.06 * rng.random()) * hs
        ch = S.bezier(p, p + d * 0.03 + flow * L * 0.3, p + flow * L, 5)
        F.solid(hair, S.chain(ch, [0.009, 0.0085, 0.008, 0.0075, 0.006], 0.002).displaced(K.ridges(0.0012, 700, 'z'), 0.002), 0.003)
    fr = W.grip_frame(b, 'R')
    sh = F.part(('rubber', '#1a1a1c'), 'hand.R', 'rigid', 'w_grip')
    hd = F.part(('gunmetal', '#5a5c60'), 'hand.R', 'rigid', 'w_head')
    oa = F.part(('ceramic', ORANGE, {'rough': 0.55}), 'hand.R', 'rigid', 'w_orange')
    gl = F.part(('glow', '#0a2a30', {'glow': CYAN}), 'hand.R', 'rigid', 'w_glow')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.6 + fr.a * 0.4, fr.a)
    items = W.hammer(fr2, sh, hd, oa, L=0.5, head=(0.08, 0.065, 0.12))
    items.append((gl, S.cylinder(fr2.p(0.52) + fr2.e * 0.12, fr2.p(0.52) + fr2.e * 0.13, 0.04, 0.004), 0.0, 'add'))
    F.detach('weapon', items)


@hero('oath-15-sorcerer', ref='reference-062', skin='#5a3828', eyes='#1a100a', hair='#120c0a', tris=27000, arm_out=12, stubble_amt=0.4,
      body=dict(H=1.88, sex=0.0, mass=0.1, muscle=0.8, width=1.04, grip_l=True))
def imp_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    coat = F.part(('wool', GUN), None, 'soft', 'coat')
    skirt = F.part(('wool', GUN), None, 'skirt', 'coatskirt')
    lining = F.part(('cloth', ORANGE), None, 'skirt', 'lining')
    collar = F.part(('wool', '#34363a'), 'neck', 'rigid', 'collar')
    clin = F.part(('cloth', ORANGE), 'neck', 'rigid', 'collarlining')
    pants = F.part(('cloth', '#2a2c30'), None, 'soft', 'pants')
    boot = F.part(('rubber', '#202022'), None, 'soft', 'boots')
    bo = F.part(('ceramic', ORANGE, {'rough': 0.55}), None, 'soft', 'bootorange')
    belt = F.part(('leather', '#3a2e24'), None, 'soft', 'belts')
    pack = F.part(('gunmetal', '#4a4c50'), 'spine2', 'rigid', 'powerpack')
    packo = F.part(('ceramic', ORANGE, {'rough': 0.55}), 'spine2', 'rigid', 'packorange')
    packc = F.part(('glow', '#0a2a30', {'glow': CYAN}), 'spine2', 'rigid', 'packglow')
    gL = F.part(('steel', '#7a7c80'), 'forearm.L', 'rigid', 'gauntL')
    gR = F.part(('steel', '#7a7c80'), 'forearm.R', 'rigid', 'gauntR')
    goL = F.part(('ceramic', ORANGE, {'rough': 0.55}), 'forearm.L', 'rigid', 'gauntLo')
    goR = F.part(('ceramic', ORANGE, {'rough': 0.55}), 'forearm.R', 'rigid', 'gauntRo')
    gcy = F.part(('glow', '#0a2a30', {'glow': CYAN}), None, 'soft', 'gauntglow')
    glove = F.part(('gunmetal', '#3a3c40'), None, 'soft', 'gloves')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, coat, sleeve=1.7, neck=0.5, hem=-0.6, thick=0.012, fold=0.004)
    K.pants(F, b, pants, bottom=0.65, waist=0.75, thick=0.01, bag=0.03)
    K.boots(F, b, boot, top=0.65, thick=0.016, sole_pid=bo, sole=0.03)
    K.gloves(F, b, glove, cuff=0.85, thick=0.008)
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(skirt, K.robe_skirt(b, zt, 0.20, xr + 0.03, (yb - yf) / 2 + 0.035, xr + 0.12, (yb - yf) / 2 + 0.10, pleats=8, pleat_amp=0.007, front_open=0.12), 0.03)
    F.paint(lining, S.slab((0, 0, 0), (1, 0, 0), 0.12).inter(S.halfspace((0, yf + 0.02, 0), (0, 1, 0)), 0).inter(S.slab((0, 0, 0.5), (0, 0, 1), 0.7), 0).inter(S.sphere((0, yf, 0.5), 0.6), 0), only=[skirt])
    K.stand_collar(F, b, collar, height=0.11, flare=0.03, r0=0.078, open_front=40, th=0.01)
    F.paint(clin, S.sphere(J['neck'] + v3(0, -0.01, 0.08), 0.072 * s), only=[collar])
    for dz in (0.0, 0.07):
        K.belt(F, b, belt, zt + dz, 0.04, 0.022, t1=0.012)
    K.pouch(F, belt, (0.13 * w, yf - 0.04, zt - 0.06), (0.04, 0.02, 0.05))
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    pc = v3(0, ybk + 0.10, J['spine2'][2] + 0.0)
    F.solid(pack, S.roundbox(pc, (0.16 * w, 0.08, 0.2 * s), None, 0.012), 0.004)
    for sx in (1, -1):
        F.solid(packo, S.roundbox(pc + v3(sx * 0.09 * w, 0.075, 0.02), (0.05 * w, 0.012, 0.12 * s), None, 0.006), 0.002)
        F.solid(pack, S.roundbox(pc + v3(sx * 0.1 * w, 0.0, 0.24 * s), (0.04, 0.06, 0.05), None, 0.008), 0.003)
    F.solid(packc, S.roundbox(pc + v3(0, 0.082, 0.0), (0.012, 0.006, 0.1 * s), None, 0.003), 0.0)
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        K.strap(F, b, belt, J['S' + sd] + v3(-sx * 0.07, -0.25, 0.05), J['S' + sd] + v3(-sx * 0.07, 0.25, 0.05), 0.04, 0.03, t1=0.016, around=(1, 0, 0))
    for sd, gp, go in (('L', gL, goL), ('R', gR, goR)):
        a, c, ax, out, M = ff(b, sd)
        p0, p1 = a + (c - a) * 0.3, a + (c - a) * 0.88
        F.solid(gp, S.cylinder(p0, p1, 0.075 * s, 0.01), 0.004)
        for t in (0.0, 0.5, 1.0):
            p = p0 + (p1 - p0) * t
            F.solid(gp, S.cylinder(p - ax * 0.014, p + ax * 0.014, 0.085 * s, 0.004), 0.002)
        F.solid(go, S.roundbox((p0 + p1) / 2 + out * 0.075 * s, (0.035, 0.012, 0.07), M, 0.005), 0.002)
        F.paint(gcy, S.capsule((p0 + p1) / 2 + M[:, 0] * 0.07 * s - ax * 0.05, (p0 + p1) / 2 + M[:, 0] * 0.07 * s + ax * 0.05, 0.009), only=[gp])
    K.hair_cap(F, b, hair, thick=0.012, front=0.06, side=0.0, back=-0.05, fold=0.004)
    K.hair_strands(F, b, hair, 'top', n=60, length=0.025, r0=0.012, seed=152)
    sh_p = F.part(('gunmetal', '#4a4c50'), 'forearm.L', 'rigid', 'shield')
    sh_t = F.part(('ceramic', ORANGE, {'rough': 0.55}), 'forearm.L', 'rigid', 'shieldtrim')
    items = W.shield(b, 'L', sh_p, sh_t, w=0.24, h=0.40, th=0.022)
    F.detach('weapon', items)
