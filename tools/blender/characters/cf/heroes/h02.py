"""02 Rime Archive — ninja (reference-089) and sorcerer (reference-088)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

CHAR = '#2b2e33'
CHALK = '#e2dfd8'
ICE = '#9fd4f0'


@hero('oath-02-ninja', ref='reference-089', skin='#b98763', eyes='#2a1c12', hair='#0e0d0e', tris=24000,
      body=dict(H=1.68, sex=1.0, mass=-0.05, muscle=0.6, grip_r=True))
def rime_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    suit = F.part(('cloth', '#26282c'), None, 'soft', 'suit')
    jacket = F.part(('felt', '#303338'), None, 'soft', 'jacket')
    quilt_p = F.part(('felt', CHALK), None, ('limit', ['spine', 'spine1', 'spine2', 'hips']), 'quilt')
    web = F.part(('cloth', '#3a3d42'), None, 'soft', 'webbing')
    leather = F.part(('leather', '#1c1c1e'), None, 'soft', 'leather')
    sole = F.part(('rubber', '#cfccc4'), None, 'soft', 'sole')
    metal = F.part(('steel', '#b8bcc0'), None, 'soft', 'buckles')
    iceL = F.part(('glass', '#cfe6f2', {'glow': '#2a4a5a'}), 'forearm.L', 'rigid', 'iceL')
    iceR = F.part(('glass', '#cfe6f2', {'glow': '#2a4a5a'}), 'forearm.R', 'rigid', 'iceR')
    hood_p = F.part(('felt', '#2c2f34'), 'head', 'rigid', 'hood')
    lining = F.part(('felt', CHALK), 'head', 'rigid', 'lining')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    pouch = F.part(('leather', '#24262a'), 'thigh.R', 'rigid', 'holster')

    K.shirt(F, b, suit, sleeve=2.0, neck=0.95, hem=-1.0, thick=0.003, fold=0.0012)
    K.pants(F, b, suit, bottom=0.9, waist=0.8, thick=0.004, bag=0.004, fold=0.0015)
    K.shirt(F, b, jacket, sleeve=0.62, neck=0.9, hem=0.1, thick=0.010, fold=0.003)
    zt = J['spine'][2] - 0.02 * s
    m = S.slab((0, 0, (zt + J['neck'][2]) / 2 - 0.02), (0, 0, 1), J['neck'][2] - zt - 0.04).inter(S.ellipsoid(J['spine1'], (0.20 * w, 0.2, 0.3)), 0.01)
    F.shell(quilt_p, m, 0.004, 0.020, 0.008, 'cur', K.quilt(0.004, 0.05))
    zb = J['pelvis'][2] + 0.03 * s
    K.belt(F, b, web, zb, 0.045 * s, 0.016, t1=0.004)
    for sx in (1, -1):
        x = sx * 0.075 * w
        K.strap(F, b, web, (x, -0.3, J['neck'][2] + 0.02), (x, 0.3, J['neck'][2] + 0.02), 0.032, 0.026, t1=0.012, around=(1, 0, 0))
        F.solid(metal, S.roundbox((x, K.body_extent(b, J['spine2'][2], x, 'front') - 0.028, J['spine2'][2]), (0.02, 0.006, 0.014), None, 0.003), 0.002)
    K.strap(F, b, web, (-0.3, 0, J['spine1'][2] + 0.03), (0.3, 0, J['spine1'][2] + 0.03), 0.03, 0.026, t1=0.012, around=(0, 0, 1))
    K.gloves(F, b, leather, cuff=0.55, thick=0.005, fingerless=True)
    for sd, ice in (('L', iceL), ('R', iceR)):
        a, c = b.bones['forearm.' + sd]
        ax = S.normalize(c - a)
        out = S.normalize(np.cross(ax, (0, -1, 0)))
        if out[2] < 0:
            out = -out
        M = np.stack([S.normalize(np.cross(out, ax)), out, ax], axis=1)
        bc = a + (c - a) * 0.5 + out * 0.035 * s
        F.solid(ice, S.roundbox(bc, (0.034 * s, 0.012, 0.07 * s), M, 0.01).displaced(K.folds(0.002, (60, 60, 60), 4), 0.002), 0.004)
        F.solid(metal, S.roundbox(bc - out * 0.004, (0.038 * s, 0.012, 0.074 * s), M, 0.01).sub(S.roundbox(bc, (0.032 * s, 0.03, 0.068 * s), M, 0.008), 0.002), 0.002)
        for t in (0.3, 0.72):
            K.band(F, b, web, 'forearm.' + sd, t, 0.014, 0.012, reach=0.07)
        Kn = J['K' + sd]
        F.shell(leather, S.ellipsoid(Kn + v3(0, -0.05, 0.0), (0.055 * s, 0.05, 0.07 * s)), 0.004, 0.016, 0.006)
        for t in (0.15, 0.45):
            K.band(F, b, web, 'thigh.' + sd, t, 0.03, 0.01, reach=0.12)
    K.boots(F, b, leather, top=0.55, thick=0.016, sole_pid=sole, sole=0.03)
    for sd in 'LR':
        F.shell(sole, S.roundbox(J['Toe' + sd] + v3(0, 0.02, 0.03), (0.06 * s, 0.05, 0.03), None, 0.015), 0.006, 0.016, 0.004)
        K.band(F, b, metal, 'shin.' + sd, 0.62, 0.016, 0.022, reach=0.09)
    hp = K.limb_point(b, 'thigh.R', 0.3) + v3(-0.075 * s, 0, 0)
    K.pouch(F, pouch, hp, (0.02, 0.045, 0.08))
    K.hair_cap(F, b, hair, thick=0.012, front=0.05, side=0.0, back=-0.07)
    K.hair_strands(F, b, hair, 'fringe', n=40, length=0.06, r0=0.010, seed=12)
    K.hood(F, b, hood_p, thick=0.012, face_open=0.065, drape=False)
    hc, hs = b.hc, b.hs
    F.paint(lining, S.ellipsoid(hc + v3(0, -0.105, -0.02) * hs, (0.09 * hs, 0.04 * hs, 0.12 * hs)), only=[hood_p])
    F.shell(lining, K.below_head(b, S.ellipsoid(J['neck'] + v3(0, -0.02, 0.02), (0.11 * w, 0.11, 0.08)).inter(S.halfspace(J['neck'], (0, 1, 0.3)), 0.01)), 0.006, 0.02, 0.006)
    # frost saber
    fr = W.grip_frame(b, 'R')
    wl = F.part(('leather', '#202226'), 'hand.R', 'rigid', 'w_grip')
    wm = F.part(('steel', '#c8ccd0'), 'hand.R', 'rigid', 'w_steel')
    wi = F.part(('glass', '#bfe4f6', {'glow': '#3a7a9a'}), 'hand.R', 'rigid', 'w_ice')
    items = W.wrapped_handle(fr, wl, -0.1, 0.07, 0.014, wm, 0.019)
    items += W.cross_guard(fr, wm, 0.085, 0.045, 0.011)
    items += W.straight_blade(fr, wm, wi, 0.095, 0.62, 0.045, 0.006, taper=0.55, curve=-0.03)
    F.detach('weapon', items)


@hero('oath-02-sorcerer', ref='reference-088', skin='#d7aa92', eyes='#5c6a74', hair='#e6e4e0', brow='#cfcac4', tris=24000, stubble=False,
      body=dict(H=2.02, sex=0.0, mass=-0.55, muscle=0.2, age=0.9, shoulder=0.97, neck_len=1.1, face_wide=0.92, nose=1.15))
def rime_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    under = F.part(('linen', CHALK), None, 'soft', 'undershirt')
    robe = F.part(('felt', '#2c3036'), None, 'soft', 'robe')
    skirt = F.part(('felt', '#2c3036'), None, 'skirt', 'skirt')
    panel = F.part(('linen', '#dcd8d0'), None, 'skirt', 'panel')
    pipe = F.part(('cloth', '#8fc4dc'), None, 'skirt', 'piping')
    collar = F.part(('felt', '#262a30'), 'neck', 'rigid', 'collar')
    clin = F.part(('cloth', '#7fb0c8'), 'neck', 'rigid', 'collarlining')
    leather = F.part(('leather', '#2e241e'), None, 'soft', 'leather')
    shoe = F.part(('leather', '#141414'), None, 'soft', 'shoe')
    rack = F.part(('iron', '#4a4c50'), 'hips', 'rigid', 'rack')
    pages = F.part(('glass', '#d6ecf6', {'glow': '#1e3c4c'}), 'hips', 'rigid', 'pages')
    beard_p = F.part(('hair', spec['hair'], {'c2': (0.9, 0.9, 0.9)}), 'head', 'rigid', 'beard')
    K.shirt(F, b, under, sleeve=1.9, neck=0.4, hem=-0.8, thick=0.007, fold=0.003)
    K.pants(F, b, under, bottom=0.9, waist=0.7, thick=0.006, bag=0.01)
    K.boots(F, b, shoe, top=0.85, thick=0.008, sole_pid=shoe, sole=0.012)
    K.gloves(F, b, leather, cuff=0.62, thick=0.005, fingerless=True)
    # sleeveless quilted over-robe on the torso
    F.tight(robe, dict(K.torso_cover(0.0, -0.4), **{'shoulder.L': (None, None), 'shoulder.R': (None, None), 'upperarm.L': (None, 0.12), 'upperarm.R': (None, 0.12)}),
            0.014, K.add_noise(K.quilt(0.0025, 0.045), K.folds(0.002, (20, 20, 10), 3)))
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front')
    yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    sk = K.robe_skirt(b, zt, 0.07, xr + 0.03, (yb - yf) / 2 + 0.035, xr + 0.12, (yb - yf) / 2 + 0.10, pleats=18, pleat_amp=0.007)
    F.solid(skirt, sk, 0.03)
    F.paint(panel, S.slab((0, -0.3, 0.5), (1, 0, 0), 0.12 * s).inter(S.halfspace((0, -0.02, 0), (0, 1, 0)), 0).inter(S.slab((0, 0, (zt + 0.07) / 2 + 0.25), (0, 0, 1), zt + 0.5), 0).inter(S.sphere((0, -0.2, 0.6), 0.9), 0), only=[skirt, robe])
    for xx in (0.065, -0.065, 0.16, -0.16):
        F.paint(pipe, S.slab((xx * s, 0, 0), (1, 0, 0), 0.008).inter(S.slab((0, 0, 0.5), (0, 0, 1), 1.0), 0).inter(S.halfspace((0, 0.0, 0), (0, 1, 0)), 0).inter(S.sphere((0, -0.2, 0.6), 0.8), 0), only=[skirt])
    K.stand_collar(F, b, collar, height=0.13, flare=0.03, r0=0.075, open_front=40, th=0.008)
    F.paint(clin, S.sphere(J['neck'] + v3(0, 0.0, 0.08), 0.068 * s), only=[collar])
    K.belt(F, b, leather, zt - 0.005, 0.05 * s, 0.03, t1=0.008)
    for sd in 'LR':
        F.shell(leather, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.3), K.limb_point(b, 'forearm.' + sd, 0.92), 0.06 * s), 0.004, 0.014, 0.004)
    # folio rack on the right hip
    rc = v3(-(xr + 0.06), (yf + yb) / 2 - 0.02, zt - 0.12)
    F.solid(rack, S.roundbox(rc, (0.035, 0.09, 0.12), None, 0.006).sub(S.roundbox(rc, (0.05, 0.075, 0.105), None, 0.004), 0.002), 0.002)
    for i in range(4):
        F.solid(pages, S.roundbox(rc + v3(0, -0.06 + i * 0.04, -0.005), (0.026, 0.012, 0.10), None, 0.004), 0.002)
    K.beard(F, b, beard_p, length=0.20, width=0.04, pointed=True, seed=9)
    fr = W.grip_frame(b, 'R')
    ww = F.part(('wood', '#3a2c22'), 'hand.R', 'rigid', 'w_wood')
    wm = F.part(('steel', '#9aa0a6'), 'hand.R', 'rigid', 'w_metal')
    wi = F.part(('glass', '#bfe4f6', {'glow': '#4a8aaa'}), 'hand.R', 'rigid', 'w_ice')
    items = [(ww, S.capsule(fr.p(-0.06), fr.p(0.07), 0.016), 0.0, 'add')] + W.crossbow(fr, ww, wm)
    items.append((wi, S.roundbox(fr.p(0.2, -0.055), (0.014, 0.03, 0.06), fr.M, 0.006), 0.003, 'add'))
    F.detach('weapon', items)
