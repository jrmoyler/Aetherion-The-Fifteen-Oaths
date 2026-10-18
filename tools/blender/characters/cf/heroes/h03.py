"""03 Storm Relay — ninja (reference-085) and sorcerer (reference-087)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

NAVY = '#1e2a44'
COPPER = '#b8743a'
CERAMIC = '#e6e1d6'


def forearm_frame(b, sd):
    a, c = b.bones['forearm.' + sd]
    ax = S.normalize(c - a)
    out = S.normalize(np.cross(ax, (0, -1, 0)))
    if out[2] < 0:
        out = -out
    return a, c, ax, out, np.stack([S.normalize(np.cross(out, ax)), out, ax], axis=1)


@hero('oath-03-ninja', ref='reference-085', skin='#a8744e', eyes='#24160e', hair='#0f0d0c', tris=24000,
      body=dict(H=1.96, sex=0.0, mass=-0.35, muscle=0.75, grip_r=True, neck_len=1.05))
def storm_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    navy = F.part(('cloth', NAVY), None, 'soft', 'navy')
    pipe = F.part(('copper', COPPER), None, 'soft', 'piping')
    leather = F.part(('leather', '#5a3a24'), None, 'soft', 'leather')
    boot = F.part(('leather', '#1c2438'), None, 'soft', 'boot')
    cer = F.part(('ceramic', CERAMIC), None, 'soft', 'bootcuff')
    cop = F.part(('copper', COPPER), None, 'soft', 'copper')
    brR = F.part(('copper', COPPER), 'forearm.R', 'rigid', 'bracer')
    cerR = F.part(('ceramic', CERAMIC), 'forearm.R', 'rigid', 'coupler')
    relay = F.part(('copper', COPPER), 'spine2', 'rigid', 'relay')
    hose = F.part(('rubber', '#141414'), 'spine2', 'rigid', 'hose')
    rcer = F.part(('ceramic', CERAMIC), 'spine2', 'rigid', 'relaycer')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, navy, sleeve=0.0, neck=0.95, hem=-0.6, thick=0.005, fold=0.0018)
    K.pants(F, b, navy, bottom=0.9, waist=0.75, thick=0.006, bag=0.008, fold=0.003)
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        p0 = J['Hp' + sd] + v3(sx * 0.06 * s, -0.08 * s, 0.05)
        p1 = J['K' + sd] + v3(sx * 0.05 * s, -0.06 * s, 0.0)
        F.paint(pipe, S.capsule(p0, p1, 0.005), only=[navy])
        F.paint(pipe, S.capsule(J['spine2'] + v3(sx * 0.09 * w, -0.2, 0.06), J['spine'] + v3(sx * 0.07 * w, -0.2, -0.02), 0.004), only=[navy])
        K.band(F, b, leather, 'shin.' + sd, 0.05, 0.02, 0.008, reach=0.09)
    K.belt(F, b, leather, J['pelvis'][2] + 0.04 * s, 0.045 * s, 0.012)
    F.solid(cop, S.roundbox((0, K.body_extent(b, J['pelvis'][2] + 0.04 * s, 0, 'front') - 0.02, J['pelvis'][2] + 0.04 * s), (0.028, 0.008, 0.022), None, 0.004), 0.002)
    K.strap(F, b, leather, J['SR'] + v3(0.04, 0, 0.05), J['HpL'] + v3(0.0, 0, 0.1), 0.04 * s, 0.012)
    K.boots(F, b, boot, top=0.7, thick=0.012, sole_pid=boot, sole=0.02)
    for sd in 'LR':
        F.shell(cer, S.slab(K.limb_point(b, 'shin.' + sd, 0.72), b.bones['shin.' + sd][1] - b.bones['shin.' + sd][0], 0.05 * s).inter(S.sphere(K.limb_point(b, 'shin.' + sd, 0.72), 0.12), 0), 0.006, 0.02, 0.004)
        K.band(F, b, cop, 'shin.' + sd, 0.86, 0.012, 0.018, reach=0.1)
        K.band(F, b, navy, 'forearm.' + sd, 0.9, 0.035, 0.008, reach=0.07)
    a, c, ax, out, M = forearm_frame(b, 'R')
    bc = a + (c - a) * 0.5
    F.shell(leather, S.capsule(a + (c - a) * 0.25, a + (c - a) * 0.8, 0.07 * s), 0.0, 0.01, 0.004)
    F.solid(brR, S.roundbox(bc + out * 0.045, (0.03, 0.01, 0.09 * s), M, 0.005), 0.003)
    F.solid(cerR, S.roundbox(bc + out * 0.06 - ax * 0.03, (0.022, 0.018, 0.04), M, 0.008), 0.003)
    for k in (-1, 1):
        base = bc + out * 0.055 + M[:, 0] * k * 0.016
        F.solid(brR, S.capsule(base - ax * 0.12, base + (-ax * 0.12 + out * 0.0) + v3(0, 0, 0.36 * s), 0.005), 0.0)
        F.solid(brR, S.sphere(base - ax * 0.12 + v3(0, 0, 0.36 * s), 0.009), 0.0)
    ybk = K.body_extent(b, J['spine2'][2], -0.05, 'back')
    rc = v3(-0.06, ybk + 0.03, J['spine2'][2] - 0.03 * s)
    F.solid(hose, S.torus(rc + v3(0, 0.02, 0), 0.06, 0.013, S.rot_euler(90, 0, 0)), 0.0)
    F.solid(relay, S.roundbox(rc + v3(0, 0.025, 0.0), (0.025, 0.022, 0.05), None, 0.006), 0.003)
    F.solid(rcer, S.roundbox(rc + v3(0, 0.05, 0.0), (0.016, 0.012, 0.03), None, 0.006), 0.002)
    K.hair_cap(F, b, hair, thick=0.010, front=0.055, side=0.02, back=-0.04)
    K.hair_strands(F, b, hair, 'messy', n=55, length=0.07, r0=0.009, seed=21)
    K.ponytail(F, b, hair, length=0.12, r=0.018, high=True)
    fr = W.grip_frame(b, 'R')
    wh = F.part(('leather', '#2a1e16'), 'hand.R', 'rigid', 'w_handle')
    wc = F.part(('copper', COPPER), 'hand.R', 'rigid', 'w_chain')
    wcer = F.part(('ceramic', CERAMIC), 'hand.R', 'rigid', 'w_cer')
    items = W.whip(fr, wh, wc, wcer, coils=3, R=0.08, r=0.008)
    F.detach('weapon', items)


@hero('oath-03-sorcerer', ref='reference-087', skin='#5b3a29', eyes='#1c120c', hair='#141010', tris=26000, arm_out=14,
      body=dict(H=1.66, sex=1.0, mass=1.0, muscle=0.4, age=0.15, width=1.06, chest=1.15, belly=0.3))
def storm_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    under = F.part(('cloth', '#1a2236'), None, 'soft', 'under')
    navy = F.part(('cloth', NAVY), None, 'soft', 'navy')
    cape = F.part(('cloth', '#1c2840'), None, ('limit', ['spine1', 'spine2', 'neck', 'shoulder.L', 'shoulder.R', 'upperarm.L', 'upperarm.R'], 0.03), 'capelet')
    trim = F.part(('copper', COPPER), None, ('limit', ['spine1', 'spine2', 'neck', 'shoulder.L', 'shoulder.R', 'upperarm.L', 'upperarm.R'], 0.03), 'capetrim')
    leather = F.part(('leather', '#2a2420'), None, 'soft', 'leather')
    cer = F.part(('ceramic', CERAMIC), None, 'soft', 'ceramic')
    cop = F.part(('copper', COPPER), None, 'soft', 'copperbands')
    collar = F.part(('copper', COPPER), 'spine2', 'rigid', 'collar')
    prong = F.part(('copper', '#8a5a32'), 'spine2', 'rigid', 'prongs')
    ball = F.part(('ceramic', CERAMIC), 'spine2', 'rigid', 'balls')
    sole = F.part(('rubber', '#1a1a1a'), None, 'soft', 'sole')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, under, sleeve=1.9, neck=0.9, hem=-0.5, thick=0.007, fold=0.003)
    K.pants(F, b, navy, bottom=0.7, waist=0.75, thick=0.012, bag=0.05, fold=0.005)
    for sd, sx in (('L', 1), ('R', -1)):
        K.pouch(F, navy, K.limb_point(b, 'thigh.' + sd, 0.45) + v3(sx * 0.10 * s, -0.01, 0), (0.025, 0.06, 0.07))
    # capelet over the shoulders, copper hem
    mc = J['neck'] + v3(0, 0.01, -0.02)
    cm = S.ellipsoid(mc, (0.42 * w, 0.30 * s, 0.30 * s)).inter(S.halfspace(mc + v3(0, 0, -0.22 * s), (0, 0, -1)), 0.004)
    cm = K.below_head(b, cm)
    F.shell(cape, cm, 0.02, 0.034, 0.01, 'cur', K.folds(0.006, (14, 14, 8), 31))
    F.paint(trim, S.slab(mc + v3(0, 0, -0.215 * s), (0, 0, 1), 0.016).inter(S.sphere(mc, 0.5), 0), only=[cape])
    K.belt(F, b, leather, J['pelvis'][2] + 0.05 * s, 0.06 * s, 0.03, t1=0.008)
    zb = J['pelvis'][2] + 0.05 * s
    for x in (0.12, -0.12, 0.2):
        yy = K.body_extent(b, zb, x * w, 'front')
        K.pouch(F, leather, (x * w, yy - 0.035, zb - 0.02), (0.025, 0.02, 0.035))
    K.gloves(F, b, leather, cuff=0.75, thick=0.006, fingerless=True)
    for sd in 'LR':
        F.shell(cer, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.45), K.limb_point(b, 'forearm.' + sd, 0.9), 0.07 * s), 0.008, 0.024, 0.005)
        for t in (0.45, 0.88):
            K.band(F, b, cop, 'forearm.' + sd, t, 0.014, 0.028, reach=0.08)
    K.boots(F, b, cer, top=0.45, thick=0.022, sole_pid=sole, sole=0.03)
    for sd in 'LR':
        for t in (0.5, 0.9):
            K.band(F, b, cop, 'shin.' + sd, t, 0.016, 0.03, reach=0.12)
    # copper prong collar with ceramic-ball antennae
    nb = J['neck'] + v3(0, 0.0, 0.0)
    F.solid(collar, S.ring_band(nb + v3(0, 0.0, 0.015), (0, 0.15, 1), 0.095 * w, 0.05, 0.03), 0.006)
    for sx in (1, -1):
        for xo, hgt in ((0.11, 0.30), (0.20, 0.22)):
            p0 = nb + v3(sx * xo * w, 0.04, 0.02)
            p1 = p0 + v3(sx * 0.07, 0.03, 0.04)
            p2 = p0 + v3(sx * 0.07, 0.04, hgt)
            F.solid(prong, S.chain(S.bezier(p0, p1, p2, 5), [0.011] * 5, 0.003), 0.004)
            F.solid(ball, S.sphere(p2 + v3(0, 0, 0.02), 0.028), 0.004)
    K.hair_cap(F, b, hair, thick=0.012, front=0.05, side=0.01, back=-0.05, fold=0.003)
    K.bun(F, b, hair, 'top', 0.055)
    K.hair_strands(F, b, hair, 'top', n=30, length=0.03, r0=0.012, seed=31)
    fr = W.grip_frame(b, 'R')
    sh = F.part(('wood', '#2a2420'), 'hand.R', 'rigid', 'w_shaft')
    rc = F.part(('copper', COPPER), 'hand.R', 'rigid', 'w_cop')
    cb = F.part(('ceramic', CERAMIC), 'hand.R', 'rigid', 'w_cer')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.9 + fr.a * 0.1, fr.a)
    items = W.staff(fr2, sh, -0.75, 0.75, 0.016, rc, rings=(-0.5, 0.0, 0.5, 0.68))
    top = fr2.p(0.82)
    items.append((cb, S.sphere(top, 0.04), 0.004, 'add'))
    for k in range(3):
        ang = k * 2.1
        d = fr2.e * np.cos(ang) + fr2.w * np.sin(ang)
        items.append((rc, S.chain(S.bezier(fr2.p(0.72), fr2.p(0.75) + d * 0.07, top + d * 0.06 + fr2.a * 0.08, 4), [0.006] * 4, 0.002), 0.003, 'add'))
    F.detach('weapon', items)
