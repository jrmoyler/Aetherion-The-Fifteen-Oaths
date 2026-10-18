"""06 Reed Resonance — ninja (reference-081) and sorcerer (reference-080)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

LINEN = '#e6dccb'
VERM = '#c8402a'
BAMBOO = '#b08a52'


@hero('oath-06-ninja', ref='reference-081', skin='#9a6a4a', eyes='#2a1a10', hair='#0e0c0c', tris=24000,
      body=dict(H=1.72, sex=1.0, mass=-0.45, muscle=0.6, grip_r=True, neck_len=1.05))
def reed_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    linen = F.part(('linen', LINEN), None, 'soft', 'linen')
    cord = F.part(('cloth', VERM), None, 'soft', 'cord')
    sash = F.part(('silk', VERM), None, 'skirt', 'sash')
    legs = F.part(('cloth', '#3a3836'), None, 'soft', 'leggings')
    wrap = F.part(('cloth', '#4a4642'), None, 'soft', 'wraps')
    boot = F.part(('leather', '#2e2622'), None, 'soft', 'boot')
    mask = F.part(('wood', '#d8ccb6', {'c2': (0.85, 0.80, 0.70)}), 'head', 'rigid', 'mask')
    mred = F.part(('wood', VERM), 'head', 'rigid', 'maskred')
    shp = F.part(('wood', '#b24a32'), 'spine2', 'rigid', 'shoulderplate')
    pipes = F.part(('bamboo', BAMBOO), 'spine2', 'rigid', 'pipes')
    pstrap = F.part(('leather', '#3a2a20'), None, 'soft', 'strap')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    F.tight(linen, {'spine1': (0.2, None), 'spine2': (None, None), 'neck': (None, 0.85), 'shoulder.L': (None, 0.6)}, 0.007,
            K.add_noise(K.folds(0.003, (25, 25, 25), 2), K.ridges(0.002, 90, 'z')))
    K.pants(F, b, legs, bottom=0.9, waist=0.6, thick=0.004, bag=0.004, fold=0.0015)
    for z in (J['spine1'][2] + 0.02, J['spine1'][2] - 0.03):
        K.belt(F, b, cord, z, 0.008, 0.006, t1=0.004, tilt=-8)
    K.belt(F, b, linen, J['pelvis'][2] + 0.06 * s, 0.05, 0.012, t1=0.0)
    for x, ln in ((0.07, 0.42), (0.10, 0.36)):
        top = J['pelvis'][2] + 0.05 * s
        yy = K.body_extent(b, top, x * w, 'front') - 0.012
        F.solid(sash, S.roundbox((x * w, yy - 0.01, top - ln / 2), (0.022, 0.004, ln / 2), S.rot_euler(-4, 0, 6), 0.002).displaced(K.folds(0.002, (30, 30, 10), 3), 0.003), 0.004)
    K.gloves(F, b, wrap, cuff=0.45, thick=0.005, fingerless=True)
    for sd in 'LR':
        for t in (0.6, 0.8):
            K.band(F, b, cord, 'forearm.' + sd, t, 0.006, 0.008, reach=0.07)
        K.band(F, b, legs, 'shin.' + sd, 0.06, 0.05, 0.004, reach=0.08)
        for t in (0.78, 0.86):
            K.band(F, b, cord, 'shin.' + sd, t, 0.006, 0.012, reach=0.08)
    K.boots(F, b, boot, top=0.86, thick=0.009, sole_pid=boot, sole=0.014)
    # wooden plate on the right shoulder
    F.shell(shp, S.ellipsoid(J['SR'] + v3(-0.01, 0, 0.04), (0.09, 0.09, 0.06)).inter(S.halfspace(J['SR'] + v3(0, 0, 0.0), (0, 0, -1)), 0.004), 0.006, 0.018, 0.005)
    # reed pipes across the back
    ybk = K.body_extent(b, J['spine2'][2], -0.05, 'back')
    for i in range(3):
        p0 = v3(0.03 + 0.03 * i, ybk + 0.03, J['spine1'][2] - 0.02)
        p1 = p0 + v3(-0.20 - 0.01 * i, 0.03, 0.40 + 0.04 * i)
        F.solid(pipes, S.capsule(p0, p1, 0.016), 0.002)
    K.strap(F, b, pstrap, J['SL'] + v3(-0.03, 0, 0.05), J['HpR'] + v3(0, 0, 0.15), 0.025, 0.008)
    # bird-beak mask
    hc, hs = b.hc, b.hs
    F.shell(mask, S.ellipsoid(hc + v3(0, -0.06, 0.02) * hs, (0.08 * hs, 0.07 * hs, 0.07 * hs)).inter(S.halfspace(hc + v3(0, -0.04, 0) * hs, (0, 1, 0)), 0.004), 0.004, 0.012, 0.004, 'body')
    beak = S.chain([hc + v3(0, -0.10, 0.0) * hs, hc + v3(0, -0.17, -0.04) * hs, hc + v3(0, -0.22, -0.10) * hs, hc + v3(0, -0.215, -0.135) * hs],
                   [0.03 * hs, 0.022 * hs, 0.012 * hs, 0.004], 0.006)
    F.solid(mask, beak, 0.01)
    F.paint(mred, S.slab(hc + v3(0, -0.15, -0.02) * hs, (0, 0.6, 1), 0.012).inter(S.sphere(hc, 0.3), 0), only=[mask])
    F.paint(mred, S.slab(hc + v3(0, -0.09, 0.03) * hs, (0.3, 0.2, 1), 0.008).inter(S.sphere(hc, 0.3), 0), only=[mask])
    F.carve(S.ellipsoid(hc + v3(0.032, -0.10, 0.012) * hs, (0.016 * hs, 0.02 * hs, 0.007 * hs)), 0.002)
    F.carve(S.ellipsoid(hc + v3(-0.032, -0.10, 0.012) * hs, (0.016 * hs, 0.02 * hs, 0.007 * hs)), 0.002)
    K.hair_cap(F, b, hair, thick=0.008, front=0.06, side=0.015, back=-0.05)
    K.ponytail(F, b, hair, length=0.55, r=0.024, high=True)
    F.solid(cord, S.torus(hc + v3(0, 0.08, 0.10) * hs, 0.022, 0.005, S.frame_from_axis((0, 0.8, 0.3))), 0.0)
    fr = W.grip_frame(b, 'R')
    wr = F.part(('wood', '#3a2a20'), 'hand.R', 'rigid', 'w_rib')
    wlf = F.part(('linen', '#e8dcc6', {'c2': (0.8, 0.3, 0.2)}), 'hand.R', 'rigid', 'w_leaf')
    F.detach('weapon', W.fan(fr, wr, wlf, -0.03, 0.30, 120, 9))


@hero('oath-06-sorcerer', ref='reference-080', skin='#c49a74', eyes='#2a1a10', hair='#8e8a86', brow='#5a5652', tris=26000, stubble=False,
      body=dict(H=1.95, sex=0.0, mass=-0.5, muscle=0.25, age=0.8, neck_len=1.15, face_wide=0.93))
def reed_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    coat = F.part(('linen', '#d2c4aa'), None, 'soft', 'coat')
    skirt = F.part(('linen', '#d2c4aa'), None, 'skirt', 'coatskirt')
    red = F.part(('linen', '#9a2e22'), None, 'skirt', 'redpanel')
    sleeve = F.part(('linen', '#cbbd9f'), None, 'soft', 'sleeve')
    redl = F.part(('linen', '#9a2e22'), None, 'soft', 'redlining')
    collar = F.part(('linen', '#d6c8ae'), 'neck', 'rigid', 'collar')
    trous = F.part(('cloth', '#4a4440'), None, 'soft', 'trousers')
    shoe = F.part(('leather', '#2a2420'), None, 'soft', 'shoes')
    belt = F.part(('leather', '#4a3426'), None, 'soft', 'belt')
    bells = F.part(('brass', '#b08a4a'), None, 'soft', 'bells')
    horn = F.part(('wood', '#6a4026', {'c2': (0.35, 0.18, 0.08)}), 'spine2', 'rigid', 'resonator')
    pipes = F.part(('bamboo', BAMBOO), 'hips', 'rigid', 'pipes')
    hair = F.part(('hair', spec['hair'], {'c2': (0.6, 0.6, 0.6)}), 'head', 'rigid', 'hair')
    K.shirt(F, b, coat, sleeve=1.2, neck=0.3, hem=-0.6, thick=0.012, fold=0.003)
    K.pants(F, b, trous, bottom=0.92, waist=0.7, thick=0.006, bag=0.008)
    K.boots(F, b, shoe, top=0.9, thick=0.008, sole_pid=shoe, sole=0.012)
    for sd in 'LR':
        K.wide_sleeve(F, b, sleeve, sd, 0.15, 0.12, 1.02, 0.008)
        a, c = b.bones['forearm.' + sd]
        F.paint(redl, S.sphere(a + (c - a) * 1.02, 0.11 * s), only=[sleeve])
        for k in range(4):
            ang = k * np.pi / 2 + 0.4
            p = a + (c - a) * 1.05 + v3(np.cos(ang) * 0.09, np.sin(ang) * 0.09, -0.05)
            F.solid(bells, S.sphere(p, 0.012), 0.003)
        K.band(F, b, red, 'shin.' + sd, 0.92, 0.012, 0.008, reach=0.08)
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(skirt, K.robe_skirt(b, zt, J['KL'][2] - 0.05, xr + 0.02, (yb - yf) / 2 + 0.03, xr + 0.10, (yb - yf) / 2 + 0.09, pleats=26, pleat_amp=0.007, front_open=0.05), 0.03)
    F.paint(red, S.slab((0, 0, 0), (1, 0, 0), 0.06).inter(S.halfspace((0, yf + 0.02, 0), (0, 1, 0)), 0).inter(S.slab((0, 0, zt / 2), (0, 0, 1), zt), 0).inter(S.sphere((0, yf, zt - 0.3), 0.6), 0), only=[skirt])
    K.stand_collar(F, b, collar, height=0.10, flare=0.015, r0=0.07, open_front=30, th=0.008)
    K.belt(F, b, belt, zt, 0.07 * s, 0.022, t1=0.006)
    pc = v3(0.17 * w + 0.04, yf + 0.02, zt - 0.14)
    for i in range(5):
        F.solid(pipes, S.capsule(pc + v3(0.0, -0.04 + i * 0.02, -0.14 + 0.02 * (i % 2)), pc + v3(0.0, -0.04 + i * 0.02, 0.12), 0.012), 0.002)
    F.solid(belt, S.roundbox(pc + v3(0.005, 0, 0.03), (0.02, 0.07, 0.03), None, 0.006), 0.003)
    # resonator horns rising from the upper back
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    base = v3(0, ybk + 0.03, J['spine2'][2])
    F.solid(horn, S.roundbox(base + v3(0, 0, 0.0), (0.03, 0.025, 0.12), None, 0.01), 0.004)
    for sx in (1, -1):
        p0 = base + v3(0, 0.0, 0.06)
        p1 = base + v3(sx * 0.32, 0.03, 0.10)
        p2 = base + v3(sx * 0.30, 0.03, 0.62)
        pts = S.bezier(p0, p1, p2, 8)
        F.solid(horn, S.chain(pts, [0.035, 0.04, 0.042, 0.04, 0.036, 0.032, 0.03, 0.034], 0.006), 0.01)
        F.solid(shoe, S.cylinder(p2, p2 + v3(0, 0, 0.05), 0.04, 0.006), 0.003)
    K.hair_cap(F, b, hair, thick=0.008, front=0.055, side=0.02, back=-0.05, fold=0.002)
    K.bun(F, b, hair, 'top', 0.032)
    beard_p = F.part(('hair', '#7a7672'), 'head', 'rigid', 'goatee')
    K.beard(F, b, beard_p, length=0.04, width=0.016, moustache=True, pointed=True, seed=61)
    fr = W.grip_frame(b, 'R')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.9 + fr.a * 0.1, fr.a)
    sh = F.part(('wood', '#5a3a22'), 'hand.R', 'rigid', 'w_wood')
    br = F.part(('brass', '#b08a4a'), 'hand.R', 'rigid', 'w_brass')
    items = W.staff(fr2, sh, -0.3, 0.55, 0.014, br, rings=(0.5,))
    for sg in (1, -1):
        items.append((br, S.chain(S.bezier(fr2.p(0.55), fr2.p(0.58) + fr2.w * sg * 0.06, fr2.p(0.8) + fr2.w * sg * 0.05, 5), [0.01] * 5, 0.003), 0.003, 'add'))
    F.detach('weapon', items)
