"""11 The Missing Court — ninja (reference-071) and sorcerer (reference-070)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

BLACK = '#141416'
GREY = '#3a3a3e'
SILVER = '#a8a8b0'


@hero('oath-11-ninja', ref='reference-071', skin='#d2a98a', eyes='#2a1c14', hair='#0c0b0b', tris=24000,
      body=dict(H=1.70, sex=1.0, mass=-0.25, muscle=0.55, grip_r=True))
def court_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    top = F.part(('cloth', BLACK), None, 'soft', 'top')
    vest = F.part(('cloth', GREY), None, 'soft', 'vest')
    skirt = F.part(('cloth', '#1a1a1c'), None, 'skirt', 'panel')
    skirt2 = F.part(('cloth', GREY), None, 'skirt', 'panel2')
    legs = F.part(('cloth', '#18181a'), None, 'soft', 'leggings')
    wrap = F.part(('cloth', '#202022'), None, 'soft', 'armwrap')
    leather = F.part(('leather', '#1e1e20'), None, 'soft', 'belts')
    metal = F.part(('gunmetal', '#5a5a60'), None, 'soft', 'buckles')
    case = F.part(('gunmetal', '#4a4a50'), 'thigh.R', 'rigid', 'thighcase')
    boot = F.part(('leather', '#1a1818'), None, 'soft', 'boots')
    mask = F.part(('cloth', '#161618'), 'head', 'rigid', 'mask')
    maskw = F.part(('cloth', '#d8d4cc'), 'head', 'rigid', 'maskwhite')
    tie = F.part(('cloth', '#d8d4cc'), 'head', 'rigid', 'hairtie')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, top, sleeve=0.4, neck=0.95, hem=-0.4, thick=0.006, fold=0.0025)
    F.tight(vest, K.torso_cover(0.0, 0.2), 0.012, K.folds(0.002, (25, 25, 12), 3))
    F.paint(top, S.halfspace((0.0, 0, 0), (1, 0, 0)).inter(S.sphere(J['spine1'], 0.35), 0).inter(S.halfspace((0, -0.02, 0), (0, 1, 0)), 0), only=[vest])
    K.pants(F, b, legs, bottom=0.9, waist=0.8, thick=0.005, bag=0.006, fold=0.002)
    K.boots(F, b, boot, top=0.6, thick=0.011, sole_pid=boot, sole=0.02)
    F.tight(wrap, {'forearm.L': (0.0, None), 'forearm.R': (0.0, None), 'upperarm.L': (0.6, None), 'upperarm.R': (0.6, None), 'hand.L': (None, 0.6), 'hand.R': (None, 0.6)}, 0.006, K.ridges(0.002, 140, 'z'))
    zt = J['pelvis'][2] + 0.06 * s
    for dz in (0.0, -0.06):
        K.belt(F, b, leather, zt + dz, 0.03, 0.016, t1=0.012, tilt=8)
        F.solid(metal, S.roundbox((0.03, K.body_extent(b, zt + dz, 0.03, 'front') - 0.03, zt + dz), (0.018, 0.006, 0.016), None, 0.003), 0.002)
    yf = K.body_extent(b, zt, 0, 'front')
    ap = K.apron(F, b, skirt, zt, J['KL'][2] - 0.06, 0.11 * w, yf - 0.03, 0.01, 0.4, 0.05)
    F.solid(skirt, ap.moved((0.05, 0, 0)).inter(S.halfspace((0.0, 0, J['KL'][2] + 0.1), (0.5, 0, -1)), 0.004), 0.004)
    ymid = (yf + K.body_extent(b, zt, 0, 'back')) / 2
    F.solid(skirt2, K.apron(F, b, skirt2, zt, J['KL'][2] + 0.05, 0.12 * w, 2 * ymid - K.body_extent(b, zt, 0, 'back') - 0.03, 0.01, 0.4, 0.05).mirrored(1, ymid).inter(S.halfspace((0, 0, J['KL'][2] + 0.2), (-0.5, 0, -1)), 0.004), 0.004)
    for t in (0.2, 0.5):
        K.band(F, b, leather, 'thigh.R', t, 0.022, 0.012, reach=0.12)
    F.solid(case, S.roundbox(K.limb_point(b, 'thigh.R', 0.35) + v3(-0.09 * s, 0, 0), (0.016, 0.03, 0.09), None, 0.005), 0.003)
    for sd in 'LR':
        F.shell(leather, S.ellipsoid(J['K' + sd] + v3(0, -0.05, 0), (0.05 * s, 0.05, 0.06 * s)), 0.003, 0.014, 0.005)
    hc, hs = b.hc, b.hs
    mm = K.face_mask_band(b, -0.12, -0.0).inter(S.halfspace(hc + v3(0, -0.02, 0) * hs, (0, 1, 0)), 0.004)
    F.shell(mask, mm, 0.003, 0.009, 0.004, 'cur', K.folds(0.0015, (40, 40, 40), 3))
    F.paint(maskw, S.halfspace(hc + v3(0, 0, -0.03) * hs, (0.6, 0, -1)).inter(S.sphere(hc, 0.2), 0), only=[mask])
    K.hair_cap(F, b, hair, thick=0.009, front=0.06, side=0.02, back=-0.04)
    K.hair_strands(F, b, hair, 'fringe', n=24, length=0.07, r0=0.007, seed=111)
    K.ponytail(F, b, hair, length=0.42, r=0.026, high=True)
    F.solid(tie, S.cylinder(hc + v3(0, 0.07, 0.10) * hs, hc + v3(0, 0.11, 0.12) * hs, 0.022, 0.005), 0.003)
    fr = W.grip_frame(b, 'R')
    wl = F.part(('leather', '#141414'), 'hand.R', 'rigid', 'w_grip')
    wm = F.part(('gunmetal', '#6a6a70'), 'hand.R', 'rigid', 'w_blade')
    we = F.part(('steel', '#a0a0a8'), 'hand.R', 'rigid', 'w_edge')
    items = W.wrapped_handle(fr, wl, -0.09, 0.06, 0.014, wm, 0.018)
    items += W.straight_blade(fr, wm, we, 0.07, 0.42, 0.11, 0.007, taper=0.9)
    for i in range(4):
        items.append((None, S.sphere(fr.p(0.16 + 0.07 * i, -0.04), 0.012), 0.001, 'sub'))
    F.detach('weapon', items)


@hero('oath-11-sorcerer', ref='reference-070', skin='#b8987e', eyes='#5a5a4a', hair='#3a3634', brow='#5a5450', tris=24000, stubble_amt=0.18,
      body=dict(H=1.90, sex=0.0, mass=-0.6, muscle=0.25, age=0.65, neck_len=1.1, face_wide=0.92, nose=1.1, jaw=1.05))
def court_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    coat = F.part(('velvet', BLACK), None, 'soft', 'coat')
    skirt = F.part(('velvet', BLACK), None, 'skirt', 'coatskirt')
    under = F.part(('wool', GREY), None, 'skirt', 'underrobe')
    trim = F.part(('silver', SILVER), None, 'skirt', 'trim')
    sleeve = F.part(('velvet', '#161618'), None, 'soft', 'sleeve')
    strim = F.part(('silver', SILVER), None, 'soft', 'sleevetrim')
    collar = F.part(('velvet', '#121214'), 'neck', 'rigid', 'collar')
    ctrim = F.part(('silver', SILVER), 'neck', 'rigid', 'collartrim')
    clasp = F.part(('silver', SILVER), 'spine2', 'rigid', 'clasps')
    pants = F.part(('wool', '#2a2a2c'), None, 'soft', 'pants')
    boot = F.part(('leather', '#1a1818'), None, 'soft', 'boots')
    K.shirt(F, b, coat, sleeve=1.5, neck=0.3, hem=-0.6, thick=0.012, fold=0.003)
    K.pants(F, b, pants, bottom=0.85, waist=0.7, thick=0.006, bag=0.006)
    K.boots(F, b, boot, top=0.75, thick=0.01, sole_pid=boot, sole=0.016)
    for sd in 'LR':
        K.wide_sleeve(F, b, sleeve, sd, 0.2, 0.13, 1.0, 0.01)
        a, c = b.bones['forearm.' + sd]
        F.paint(strim, S.sphere(a + (c - a) * 1.0 + v3(0, 0, -0.03), 0.14 * s).sub(S.sphere(a + (c - a) * 1.0, 0.125 * s), 0), only=[sleeve])
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(under, K.robe_skirt(b, zt, 0.09, xr + 0.015, (yb - yf) / 2 + 0.02, xr + 0.05, (yb - yf) / 2 + 0.05, pleats=6, pleat_amp=0.004), 0.02)
    F.solid(skirt, K.robe_skirt(b, zt, 0.07, xr + 0.03, (yb - yf) / 2 + 0.035, xr + 0.12, (yb - yf) / 2 + 0.10, pleats=10, pleat_amp=0.007, front_open=0.12), 0.03)
    for sx in (1, -1):
        F.paint(trim, S.Prim(lambda P, sx=sx: 0.008 - np.abs(P[..., 0] * sx - 0.12 * np.clip((zt - P[..., 2]) / zt, 0, 1) ** 1.5 - 0.004), (-0.4, -0.5, 0.0), (0.4, 0.5, zt)).inter(S.halfspace((0, yf + 0.03, 0), (0, 1, 0)), 0), only=[skirt])
    K.stand_collar(F, b, collar, height=0.15, flare=0.035, r0=0.075, open_front=40, th=0.009)
    F.paint(ctrim, S.Prim(lambda P: P[..., 2] - (J['neck'][2] + 0.13 * s), (-0.3, -0.3, 0), (0.3, 0.3, 3)), only=[collar])
    z2 = J['spine2'][2]
    for i in range(4):
        z = z2 + 0.06 - i * 0.075
        F.solid(clasp, S.roundbox((0, K.body_extent(b, z, 0, 'front') - 0.02, z), (0.026, 0.008, 0.022), None, 0.003), 0.002)
    K.belt(F, b, coat, zt, 0.05, 0.02, t1=0.01)
    hc, hs = b.hc, b.hs
    fr = W.grip_frame(b, 'R')
    sh = F.part(('gunmetal', '#2a2a2e'), 'hand.R', 'rigid', 'w_shaft')
    sv = F.part(('silver', SILVER), 'hand.R', 'rigid', 'w_silver')
    vg = F.part(('glow', '#140a24', {'glow': '#a070ff'}), 'hand.R', 'rigid', 'w_void')
    fr2 = W.Frame(fr.o, fr.a * 0.3 + v3(0, 0, 1) * 0.7, fr.a)
    items = W.staff(fr2, sh, -0.15, 0.45, 0.016, sv, rings=(-0.13, 0.42))
    items += W.mace_head(fr2, sh, 0.54, 0.06, flanges=6, flange_pid=sv)
    items.append((vg, S.sphere(fr2.p(0.54), 0.05), 0.0, 'add'))
    F.detach('weapon', items)
