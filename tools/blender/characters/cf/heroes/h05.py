"""05 Fault Choir — ninja (reference-082) and sorcerer (reference-083)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

SHALE = '#4a4440'
SAND = '#c8a77a'
AMETH = '#9a5cd6'
CLOTH = '#3e3028'


def forearm_frame(b, sd):
    a, c = b.bones['forearm.' + sd]
    ax = S.normalize(c - a)
    out = S.normalize(np.cross(ax, (0, -1, 0)))
    if out[2] < 0:
        out = -out
    return a, c, ax, out, np.stack([S.normalize(np.cross(out, ax)), out, ax], axis=1)


@hero('oath-05-ninja', ref='reference-082', skin='#9a6a48', eyes='#24160e', hair='#2a1c14', tris=25000, arm_out=6,
      body=dict(H=1.80, sex=0.0, mass=0.3, muscle=0.95, width=1.08, grip_r=True, neck_len=0.9))
def fault_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    cloth = F.part(('cloth', CLOTH), None, 'soft', 'cloth')
    wrap = F.part(('cloth', '#2a221e'), None, 'soft', 'wrap')
    shale1 = F.part(('shale', SHALE), 'spine2', 'rigid', 'chest')
    shale0 = F.part(('shale', SHALE), 'spine1', 'rigid', 'belly')
    sand = F.part(('sandstone', SAND), None, 'soft', 'sandtrim')
    leather = F.part(('leather', '#5a3a26'), None, 'soft', 'leather')
    collar = F.part(('leather', '#3a2e28'), 'neck', 'rigid', 'collar')
    stoneL = F.part(('shale', SHALE), 'forearm.L', 'rigid', 'blockL')
    stoneR = F.part(('shale', SHALE), 'forearm.R', 'rigid', 'blockR')
    bootst = F.part(('shale', '#55504a'), None, 'soft', 'bootstone')
    boot = F.part(('leather', '#2e241e'), None, 'soft', 'boot')
    am = F.part(('crystal', AMETH, {'glow': '#3a1a60'}), 'hips', 'rigid', 'amethyst')
    amf = F.part(('sandstone', SAND), 'hips', 'rigid', 'amframe')
    mask = F.part(('shale', '#3e3a36'), 'head', 'rigid', 'mask')
    glove = F.part(('leather', '#1e1a18'), None, 'soft', 'glove')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, cloth, sleeve=0.5, neck=0.6, hem=-0.6, thick=0.008, fold=0.003)
    K.pants(F, b, cloth, bottom=0.55, waist=0.75, thick=0.01, bag=0.055, fold=0.005)
    F.tight(wrap, {'shin.L': (0.35, 0.85), 'shin.R': (0.35, 0.85)}, 0.008, K.ridges(0.0015, 200, 'z'))
    K.boots(F, b, boot, top=0.65, thick=0.014, sole_pid=boot, sole=0.022)
    K.gloves(F, b, glove, cuff=0.8, thick=0.005, fingerless=True)
    K.stand_collar(F, b, collar, height=0.09, flare=0.02, r0=0.08, th=0.02)
    # shale chest / back plates with sandstone rims
    z2 = J['spine2'][2]
    for sx in (1, -1):
        F.shell(shale1, S.roundbox((sx * 0.075 * w, -0.15, z2 + 0.01), (0.07 * w, 0.12, 0.085 * s), None, 0.015), 0.012, 0.032, 0.006, 'cur', K.folds(0.002, (40, 40, 40), 5 + sx))
        F.shell(shale1, S.roundbox((sx * 0.075 * w, 0.15, z2 + 0.01), (0.07 * w, 0.12, 0.09 * s), None, 0.015), 0.012, 0.032, 0.006, 'cur', K.folds(0.002, (40, 40, 40), 7 + sx))
    F.shell(shale0, S.roundbox((0, -0.15, J['spine1'][2] - 0.01), (0.13 * w, 0.12, 0.05 * s), None, 0.015), 0.01, 0.028, 0.006, 'cur')
    for k in range(4):
        F.shell(shale0, S.roundbox((0, 0.15, J['spine1'][2] + 0.05 - k * 0.055), (0.035, 0.12, 0.022), None, 0.008), 0.012, 0.03, 0.004, 'cur')
    for sx in (1, -1):
        K.strap(F, b, leather, (sx * 0.12 * w, -0.3, J['neck'][2] + 0.03), (sx * 0.12 * w, 0.3, J['neck'][2] + 0.03), 0.04, 0.036, t1=0.02, around=(1, 0, 0))
    K.belt(F, b, leather, J['pelvis'][2] + 0.04 * s, 0.06 * s, 0.024, t1=0.006)
    zb = J['pelvis'][2] + 0.04 * s
    for x in (-0.13, 0.06, -0.06):
        K.pouch(F, leather, (x * w, K.body_extent(b, zb - 0.05, x * w, 'front') - 0.04, zb - 0.05), (0.03, 0.022, 0.04))
    hc = v3(0.17 * w, K.body_extent(b, zb - 0.08, 0.12 * w, 'front') + 0.0, zb - 0.08)
    F.solid(amf, S.roundbox(hc, (0.06, 0.025, 0.07), None, 0.01), 0.004)
    F.solid(am, S.ellipsoid(hc + v3(0, -0.02, 0), (0.035, 0.02, 0.045)), 0.0)
    for sd, st in (('L', stoneL), ('R', stoneR)):
        a, c, ax, out, M = forearm_frame(b, sd)
        bc = a + (c - a) * 0.5 + out * 0.05 * s
        F.solid(st, S.roundbox(bc, (0.045 * s, 0.03, 0.12 * s), M, 0.01).displaced(K.folds(0.003, (30, 30, 30), 9), 0.004), 0.004)
        for t in (0.3, 0.7):
            K.band(F, b, leather, 'forearm.' + sd, t, 0.02, 0.03, reach=0.09)
        F.shell(bootst, S.roundbox(J['A' + sd] + v3(0, -0.05, 0.1 * s), (0.06 * s, 0.05, 0.07 * s), None, 0.012), 0.004, 0.022, 0.004)
        F.shell(bootst, S.roundbox(J['Toe' + sd] + v3(0, 0.04, 0.03), (0.06 * s, 0.05, 0.03), None, 0.012), 0.004, 0.02, 0.004)
        K.band(F, b, leather, 'shin.' + sd, 0.66, 0.02, 0.024, reach=0.1)
    F.paint(sand, S.Prim(lambda P: np.abs(np.sin(P[..., 0] * 60) * np.sin(P[..., 2] * 60)) - 0.95, (-1, -1, 0), (1, 1, 2)), only=[shale1])
    hcen, hs = b.hc, b.hs
    mm = K.face_mask_band(b, -0.112, -0.03).inter(S.halfspace(hcen + v3(0, -0.035, 0) * hs, (0, 1, 0)), 0.004)
    F.shell(mask, mm, 0.004, 0.018, 0.004, 'cur')
    for i in range(-1, 2):
        F.carve(S.roundbox(hcen + v3(i * 0.011, -0.11, -0.075) * hs, (0.003, 0.02, 0.016), None, 0.002), 0.001)
    K.hair_cap(F, b, hair, thick=0.010, front=0.05, side=-0.005, back=-0.05)
    K.hair_strands(F, b, hair, 'spiky', n=70, length=0.05, r0=0.011, seed=51)
    fr = W.grip_frame(b, 'R')
    wl = F.part(('leather', '#3a2a1e'), 'hand.R', 'rigid', 'w_grip')
    ws = F.part(('sandstone', SAND), 'hand.R', 'rigid', 'w_guard')
    wa = F.part(('crystal', AMETH, {'glow': '#4a2080'}), 'hand.R', 'rigid', 'w_crystal')
    items = W.wrapped_handle(fr, wl, -0.09, 0.07, 0.016, ws, 0.021)
    items += W.cross_guard(fr, ws, 0.08, 0.045, 0.016)
    items += W.straight_blade(fr, wa, None, 0.09, 0.38, 0.06, 0.012, taper=0.4, double=True)
    F.detach('weapon', items)


@hero('oath-05-sorcerer', ref='reference-083', skin='#8a5a3c', eyes='#2a180e', hair='#121010', tris=26000, arm_out=8,
      body=dict(H=1.70, sex=1.0, mass=0.35, muscle=0.85, width=1.05, belly=0.1))
def fault_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    cloth = F.part(('cloth', '#3a2e26'), None, 'soft', 'cloth')
    sandp = F.part(('cloth', '#b89a70'), None, 'soft', 'sandpanel')
    skirt = F.part(('cloth', '#3a2e26'), None, 'skirt', 'skirt')
    tab = F.part(('shale', SHALE), None, 'skirt', 'tablets')
    trim = F.part(('sandstone', SAND), None, 'skirt', 'tabtrim')
    leather = F.part(('leather', '#5a3a26'), None, 'soft', 'leather')
    boot = F.part(('leather', '#2e241e'), None, 'soft', 'boot')
    brac = F.part(('shale', '#5a524a'), None, 'soft', 'bracer')
    frame = F.part(('iron', '#4a4440'), 'spine2', 'rigid', 'frame')
    slab = F.part(('shale', SHALE), 'spine2', 'rigid', 'slab')
    am = F.part(('crystal', AMETH, {'glow': '#3a1a60'}), 'spine2', 'rigid', 'amethyst')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, cloth, sleeve=0.0, neck=0.55, hem=-0.6, thick=0.008, fold=0.003)
    F.paint(sandp, S.slab((0, 0, 0), (1, 0, 0), 0.30 * w).inter(S.halfspace((0, 0, 0), (0, 1, 0)), 0).inter(S.slab((0, -0.2, J['spine2'][2]), (0, 0, 1), 0.2), 0).inter(S.sphere(J['spine2'], 0.4), 0).sub(S.slab((0, 0, 0), (1, 0, 0), 0.12 * w), 0), only=[cloth])
    K.pants(F, b, cloth, bottom=0.25, waist=0.7, thick=0.012, bag=0.05)
    K.boots(F, b, boot, top=0.45, thick=0.016, sole_pid=boot, sole=0.024)
    zt = J['pelvis'][2] + 0.05 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(skirt, K.robe_skirt(b, zt, J['K' + 'L'][2] - 0.02, xr + 0.02, (yb - yf) / 2 + 0.03, xr + 0.09, (yb - yf) / 2 + 0.08, pleats=8, pleat_amp=0.008), 0.03)
    for row in range(3):
        z = zt - 0.08 - row * 0.12
        t = (zt - z) / 0.5
        yy = yf - 0.04 - 0.05 * t
        F.solid(tab, S.roundbox((0, yy, z), (0.12 * w, 0.012, 0.052), None, 0.008).displaced(K.folds(0.002, (40, 40, 40), row), 0.002), 0.004)
        F.paint(trim, S.roundbox((0, yy, z), (0.13 * w, 0.03, 0.06), None, 0.008).sub(S.roundbox((0, yy, z), (0.11 * w, 0.05, 0.04), None, 0.006), 0), only=[tab])
    K.belt(F, b, leather, zt, 0.06 * s, 0.03, t1=0.008)
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        K.strap(F, b, leather, J['S' + sd] + v3(-sx * 0.07, -0.25, 0.05), J['S' + sd] + v3(-sx * 0.07, 0.25, 0.05), 0.045, 0.024, t1=0.008, around=(1, 0, 0))
        F.shell(brac, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.3), K.limb_point(b, 'forearm.' + sd, 0.9), 0.07 * s), 0.006, 0.022, 0.005)
        for t in (0.35, 0.85):
            K.band(F, b, leather, 'forearm.' + sd, t, 0.016, 0.026, reach=0.08)
        K.band(F, b, leather, 'shin.' + sd, 0.6, 0.02, 0.024, reach=0.1)
    # back frame + stone slab with amethyst seam
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    y0 = ybk + 0.05
    top = b.p['H'] + 0.12
    for sx in (1, -1):
        F.solid(frame, S.roundbox((sx * 0.15 * w, y0, (J['spine1'][2] + top) / 2), (0.016, 0.016, (top - J['spine1'][2]) / 2), None, 0.004), 0.003)
    F.solid(frame, S.roundbox((0, y0, top), (0.17 * w, 0.016, 0.016), None, 0.004), 0.003)
    F.solid(frame, S.roundbox((0, y0, J['spine1'][2]), (0.17 * w, 0.02, 0.02), None, 0.004), 0.003)
    sc = v3(0.20 * w, y0 + 0.07, J['neck'][2] + 0.12)
    F.solid(slab, S.roundbox(sc, (0.09, 0.07, 0.17), S.rot_euler(0, -18, 0), 0.02).displaced(K.folds(0.008, (14, 14, 14), 7), 0.01), 0.004)
    F.solid(am, S.roundbox(sc + v3(-0.02, -0.075, 0), (0.012, 0.012, 0.12), S.rot_euler(0, -10, 0), 0.006), 0.004)
    K.hair_cap(F, b, hair, thick=0.012, front=0.05, side=0.01, back=-0.06)
    K.hair_strands(F, b, hair, 'wisps', n=30, length=0.05, r0=0.009, seed=52)
    K.bun(F, b, hair, 'back', 0.045)
    fr = W.grip_frame(b, 'R')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.8 + fr.a * 0.2, fr.a)
    sh = F.part(('leather', '#3a2a1e'), 'hand.R', 'rigid', 'w_shaft')
    st = F.part(('sandstone', SAND), 'hand.R', 'rigid', 'w_stone')
    wa = F.part(('crystal', AMETH, {'glow': '#4a2080'}), 'hand.R', 'rigid', 'w_crystal')
    items = W.staff(fr2, sh, -0.15, 0.42, 0.018, st, rings=(-0.12, 0.4))
    items += W.mace_head(fr2, st, 0.5, 0.05, crystal=True, flange_pid=wa)
    F.detach('weapon', items)
