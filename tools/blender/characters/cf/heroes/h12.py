"""12 Sanguine Covenant — ninja (reference-069) and sorcerer (reference-067)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

OX = '#4a1418'
BURG = '#6a1e24'
IRON = '#5a5048'
BRASS = '#9a7a48'
BLOOD = '#ff2a3a'


def chain_loop(F, pid, p0, p1, sag, n=9, r=0.016, th=0.005):
    pts = S.bezier(p0, (p0 + p1) / 2 + v3(0, 0, -sag), p1, n)
    for i, p in enumerate(pts):
        d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        M = S.frame_from_axis(np.cross(S.normalize(d), (0, 1, 0)) if i % 2 == 0 else (0, 1, 0), up=d)
        F.solid(pid, S.torus(p, r, th, M), 0.0)


@hero('oath-12-ninja', ref='reference-069', skin='#b8866a', eyes='#2a1810', hair='#1a1210', tris=25000,
      body=dict(H=1.84, sex=0.0, mass=0.1, muscle=1.0, width=1.04, grip_r=True))
def sang_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    vest = F.part(('leather', OX, {'c2': (0.18, 0.04, 0.05)}), None, 'soft', 'vest')
    inner = F.part(('cloth', '#2a1416'), None, 'soft', 'inner')
    tab = F.part(('leather', OX, {'c2': (0.18, 0.04, 0.05)}), None, 'skirt', 'tabard')
    ttrim = F.part(('iron', IRON), None, 'skirt', 'tabtrim')
    pants = F.part(('cloth', '#2a1e1c'), None, 'soft', 'pants')
    wrap = F.part(('cloth', '#2a2020'), None, 'soft', 'wraps')
    red = F.part(('leather', '#7a1e22'), None, 'soft', 'redstraps')
    belt = F.part(('leather', '#3a1a1a'), None, 'soft', 'belt')
    ring = F.part(('iron', IRON), 'hips', 'rigid', 'anchors')
    ringe = F.part(('enamel', '#8a1a20'), 'hips', 'rigid', 'anchorenamel')
    chain = F.part(('iron', '#6a625a', {'rust': 0.5}), 'hips', 'rigid', 'chains')
    helm = F.part(('leather', '#5a1a1e', {'c2': (0.22, 0.05, 0.06)}), 'head', 'rigid', 'helm')
    hline = F.part(('silver', '#b0aca8'), 'head', 'rigid', 'helmline')
    boot = F.part(('leather', '#241c1a'), None, 'soft', 'boots')
    K.shirt(F, b, inner, sleeve=0.0, neck=1.0, hem=-0.4, thick=0.004)
    F.tight(vest, dict(K.torso_cover(0.0, 0.1), **{'shoulder.L': (None, 0.7), 'shoulder.R': (None, 0.7)}), 0.012, K.folds(0.002, (25, 25, 15), 3))
    F.paint(inner, S.Prim(lambda P: 0.035 * s - np.abs(P[..., 0]) - 0.6 * np.clip(P[..., 2] - J['spine1'][2], 0, None), (-0.3, -0.4, J['spine1'][2]), (0.3, 0.0, J['neck'][2] + 0.1)), only=[vest])
    K.pants(F, b, pants, bottom=0.55, waist=0.75, thick=0.01, bag=0.045)
    F.tight(wrap, {'shin.L': (0.4, 0.9), 'shin.R': (0.4, 0.9)}, 0.008, K.ridges(0.002, 150, 'z'))
    K.boots(F, b, boot, top=0.72, thick=0.012, sole_pid=boot, sole=0.02)
    K.gloves(F, b, wrap, cuff=0.4, thick=0.008, fingerless=True)
    for sd in 'LR':
        for t in (0.5, 0.7, 0.88):
            K.band(F, b, red, 'forearm.' + sd, t, 0.016, 0.014, reach=0.08)
        for t in (0.5, 0.75):
            K.band(F, b, red, 'shin.' + sd, t, 0.016, 0.016, reach=0.09)
    zt = J['pelvis'][2] + 0.05 * s
    K.belt(F, b, belt, zt, 0.06, 0.02, t1=0.008)
    K.belt(F, b, red, zt + 0.03, 0.015, 0.024, t1=0.016)
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    for sx in (1, -1):
        F.solid(tab, K.apron(F, b, tab, zt, J['KL'][2] - 0.02 + 0.06 * (sx > 0), 0.075 * w, yf - 0.025, 0.01, 0.45, 0.03).moved((sx * 0.07 * w, 0, 0)), 0.004)
        F.solid(tab, K.apron(F, b, tab, zt, J['KL'][2] + 0.02, 0.08 * w, 2 * ymid - yb - 0.025, 0.01, 0.45, 0.03).moved((sx * 0.07 * w, 0, 0)).mirrored(1, ymid), 0.004)
        xr = abs(K.body_extent(b, zt, 0, 'right', y=ymid, axis='x'))
        rc = v3(sx * (xr + 0.02), yf + 0.03, zt - 0.01)
        F.solid(ring, S.torus(rc, 0.04, 0.012, S.rot_euler(0, 90, 0)), 0.002)
        F.solid(ringe, S.torus(rc + v3(sx * 0.004, 0, 0), 0.04, 0.008, S.rot_euler(0, 90, 0)), 0.0)
        chain_loop(F, chain, rc + v3(sx * 0.01, -0.02, -0.04), rc + v3(sx * 0.02, 0.06, -0.04), 0.22, 9)
    F.paint(ttrim, S.Prim(lambda P: 0.006 - np.abs(np.abs(P[..., 0]) - 0.145 * w), (-0.4, -0.5, 0.2), (0.4, 0.5, 1.3)), only=[tab])
    hc, hs = b.hc, b.hs
    F.solid(helm, S.ellipsoid(hc + v3(0, -0.01, 0.01) * hs, (0.087 * hs, 0.115 * hs, 0.128 * hs)).inter(S.halfspace(hc + v3(0, 0, -0.125) * hs, (0, 0, -1)), 0.01), 0.008)
    F.solid(helm, S.roundcone(hc + v3(0, -0.06, -0.06) * hs, hc + v3(0, -0.098, -0.10) * hs, 0.04 * hs, 0.012 * hs), 0.02)
    F.paint(hline, S.slab(hc, (1, 0, 0), 0.006).inter(S.sphere(hc, 0.2), 0), only=[helm])
    F.shell(inner, K.below_head(b, S.ellipsoid(J['neck'] + v3(0, 0, 0.02), (0.12 * w, 0.12, 0.1)), 0.06), 0.002, 0.016, 0.006, 'cur', K.folds(0.003, (30, 30, 20), 9))
    fr = W.grip_frame(b, 'R')
    wh = F.part(('leather', '#3a1418'), 'hand.R', 'rigid', 'w_handle')
    wl = F.part(('leather', '#8a1a22'), 'hand.R', 'rigid', 'w_lash')
    wm = F.part(('iron', IRON), 'hand.R', 'rigid', 'w_iron')
    F.detach('weapon', W.whip(fr, wh, wl, wm, coils=3, R=0.09, r=0.008))


@hero('oath-12-sorcerer', ref='reference-067', skin='#4a2c1e', eyes='#1a100a', hair='#120c0a', tris=26000, arm_out=10,
      body=dict(H=1.72, sex=1.0, mass=0.05, muscle=0.45))
def sang_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    robe = F.part(('cloth', BURG, {'c2': (0.22, 0.05, 0.06)}), None, 'soft', 'robe')
    skirt = F.part(('cloth', BURG, {'c2': (0.22, 0.05, 0.06)}), None, 'skirt', 'skirt')
    under = F.part(('wool', '#2c2626'), None, 'skirt', 'under')
    sleeve = F.part(('cloth', '#5e1a20'), None, 'soft', 'sleeves')
    gtrim = F.part(('brass', BRASS), None, 'skirt', 'trim')
    collar = F.part(('cloth', '#5a1a1e'), 'neck', 'rigid', 'collar')
    leather = F.part(('leather', '#2e2420'), None, 'soft', 'belts')
    case = F.part(('brass', BRASS), 'hips', 'rigid', 'case')
    canL = F.part(('glass', '#8a0a14', {'glow': '#a01020'}), 'upperarm.L', 'rigid', 'canL')
    canR = F.part(('glass', '#8a0a14', {'glow': '#a01020'}), 'upperarm.R', 'rigid', 'canR')
    capL = F.part(('brass', BRASS), 'upperarm.L', 'rigid', 'capL')
    capR = F.part(('brass', BRASS), 'upperarm.R', 'rigid', 'capR')
    tube = F.part(('glass', '#6a0a12', {'glow': '#701018'}), 'spine2', 'rigid', 'tubes')
    tubeb = F.part(('brass', BRASS), 'spine2', 'rigid', 'harnessbrass')
    boot = F.part(('leather', '#241c1a'), None, 'soft', 'boots')
    gaunt = F.part(('iron', '#4a4240'), 'hand.R', 'rigid', 'gauntlet')
    gglow = F.part(('glass', '#8a0a14', {'glow': '#c01828'}), 'hand.R', 'rigid', 'gauntletvials')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    beads = F.part(('brass', '#b08a4a'), 'head', 'rigid', 'beads')
    K.shirt(F, b, robe, sleeve=1.2, neck=0.6, hem=-0.6, thick=0.012, fold=0.004)
    K.pants(F, b, under, bottom=0.7, waist=0.7, thick=0.008, bag=0.02)
    K.boots(F, b, boot, top=0.5, thick=0.012, sole_pid=boot, sole=0.02)
    for sd in 'LR':
        K.wide_sleeve(F, b, sleeve, sd, 0.15, 0.13, 0.95, 0.01)
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(under, K.robe_skirt(b, zt, 0.16, xr + 0.015, (yb - yf) / 2 + 0.02, xr + 0.06, (yb - yf) / 2 + 0.06, pleats=8, pleat_amp=0.004), 0.02)
    F.solid(skirt, K.robe_skirt(b, zt, 0.12, xr + 0.03, (yb - yf) / 2 + 0.035, xr + 0.13, (yb - yf) / 2 + 0.10, pleats=10, pleat_amp=0.008, front_open=0.10), 0.03)
    F.paint(gtrim, S.slab((0, 0, 0.13), (0, 0, 1), 0.016).inter(S.sphere((0, (yf + yb) / 2, 0.13), 0.5), 0), only=[skirt])
    K.stand_collar(F, b, collar, height=0.09, flare=0.03, r0=0.072, open_front=50, th=0.009)
    for dz in (0.0, 0.05):
        K.belt(F, b, leather, zt + dz, 0.04, 0.022, t1=0.012, tilt=-5 + 10 * (dz > 0))
    F.solid(case, S.roundbox(v3(0.12 * w, yf - 0.04, zt - 0.08), (0.05, 0.025, 0.07), None, 0.006), 0.003)
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        K.strap(F, b, leather, J['S' + sd] + v3(-sx * 0.05, -0.25, 0.04), J['S' + sd] + v3(-sx * 0.05, 0.25, 0.04), 0.03, 0.026, t1=0.014, around=(1, 0, 0))
        ua0, ua1 = b.bones['upperarm.' + sd]
        out = S.normalize(np.cross(ua1 - ua0, (0, sx * 1.0, 0)) * -1)
        if out[2] < 0:
            out = -out
        cc = ua0 + (ua1 - ua0) * 0.45 + out * 0.075
        ax = S.normalize(ua1 - ua0)
        can, cap = (canL, capL) if sd == 'L' else (canR, capR)
        F.solid(can, S.cylinder(cc - ax * 0.07, cc + ax * 0.07, 0.035, 0.006), 0.0)
        F.solid(cap, S.cylinder(cc - ax * 0.085, cc - ax * 0.06, 0.04, 0.004), 0.002)
        F.solid(cap, S.cylinder(cc + ax * 0.06, cc + ax * 0.085, 0.04, 0.004), 0.002)
        top = cc - ax * 0.085
        pts = S.bezier(top, top + v3(-sx * 0.02, 0.02, 0.14), J['spine2'] + v3(sx * 0.07, 0.13, 0.08), 6)
        F.solid(can, S.chain(pts[:3], [0.012] * 3, 0.003), 0.003)
        F.solid(tube, S.chain(pts[2:], [0.012] * 4, 0.003), 0.003)
    F.solid(tubeb, S.torus(J['spine2'] + v3(0, 0.13, 0.08), 0.03, 0.008, S.rot_euler(90, 0, 0)), 0.002)
    # gauntlet on the right hand
    hf = b.hand_frames['R']
    gc = hf['W'] + hf['u'] * 0.05 - hf['n'] * 0.012
    Mh = np.stack([hf['t'], hf['n'], hf['u']], axis=1)
    F.shell(gaunt, S.roundbox(gc, (0.055, 0.035, 0.07), Mh, 0.02), 0.002, 0.012, 0.004)
    for i in range(3):
        F.solid(gglow, S.cylinder(gc - hf['n'] * 0.03 + hf['t'] * (i - 1) * 0.022 - hf['u'] * 0.03, gc - hf['n'] * 0.03 + hf['t'] * (i - 1) * 0.022 + hf['u'] * 0.02, 0.008, 0.003), 0.002)
    K.hair_cap(F, b, hair, thick=0.012, front=0.055, side=0.01, back=-0.05)
    K.bun(F, b, hair, 'back', 0.05)
    hc, hs = b.hc, b.hs
    for i in range(12):
        ang = i * 0.52
        p0 = hc + v3(np.sin(ang) * 0.07, -np.cos(ang) * 0.09 + 0.01, 0.07) * hs
        p1 = hc + v3(0, 0.085, 0.07) * hs
        F.solid(hair, S.chain(S.bezier(p0, (p0 + p1) / 2 + v3(0, 0, 0.02), p1, 5), [0.007] * 5, 0.002).displaced(K.ridges(0.0015, 600, 'y'), 0.002), 0.003)
        if i % 3 == 0:
            F.solid(beads, S.sphere((p0 + p1) / 2 + v3(0, 0, 0.018), 0.006), 0.002)
