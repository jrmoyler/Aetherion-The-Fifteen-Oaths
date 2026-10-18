"""04 Tidal Covenant — ninja (reference-084) and sorcerer (reference-086)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

BLUE = '#1d3352'
NACRE = '#e9e1d2'
BRASS = '#b08a4a'
SEA = '#4f8a7c'


@hero('oath-04-ninja', ref='reference-084', skin='#a87a5a', eyes='#2a1a10', hair='#1a1210', tris=24000,
      body=dict(H=1.70, sex=1.0, mass=-0.05, muscle=0.6, grip_r=True))
def tidal_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    suit = F.part(('cloth', BLUE, {'c2': (0.03, 0.07, 0.14)}), None, 'soft', 'suit')
    sea = F.part(('cloth', SEA), None, 'soft', 'panels')
    brass = F.part(('brass', BRASS), None, 'soft', 'brasstrim')
    nacre = F.part(('pearl', NACRE), 'upperarm.R', 'rigid', 'pauldron')
    fin = F.part(('pearl', NACRE), None, 'soft', 'fins')
    helm = F.part(('enamel', '#1f3a5c'), 'head', 'rigid', 'helm')
    crest = F.part(('pearl', NACRE), 'head', 'rigid', 'crest')
    visor = F.part(('glass', '#1a4a5a', {'glow': '#0a2a30'}), 'head', 'rigid', 'visor')
    hbrass = F.part(('brass', BRASS), 'head', 'rigid', 'helmbrass')
    orb = F.part(('glass', '#3aa6b8', {'glow': '#1a6a80'}), 'spine2', 'rigid', 'reservoir')
    obr = F.part(('brass', BRASS), 'spine2', 'rigid', 'resframe')
    leather = F.part(('leather', '#3a2a1c'), None, 'soft', 'strap')
    K.shirt(F, b, suit, sleeve=2.0, neck=1.0, hem=-1.0, thick=0.004, fold=0.001)
    K.pants(F, b, suit, bottom=1.0, waist=0.8, thick=0.004, bag=0.0, fold=0.001)
    K.gloves(F, b, suit, cuff=0.85, thick=0.004)
    K.boots(F, b, suit, top=0.8, thick=0.008, sole_pid=brass, sole=0.012)
    for sd, sx in (('L', 1), ('R', -1)):
        F.paint(sea, S.ellipsoid(K.limb_point(b, 'thigh.' + sd, 0.45) + v3(sx * 0.07 * s, 0.0, 0), (0.06, 0.12, 0.2 * s)), only=[suit])
        F.paint(sea, S.ellipsoid(J['spine1'] + v3(sx * 0.14 * w, 0, 0), (0.05, 0.12, 0.14 * s)), only=[suit])
        F.paint(brass, S.capsule(J['spine2'] + v3(sx * 0.05, -0.2, 0.05), J['spine'] + v3(sx * 0.12, -0.2, -0.06), 0.004), only=[suit])
        for t in (0.25, 0.8):
            K.band(F, b, brass, 'forearm.' + sd, t, 0.012, 0.01, reach=0.07)
        K.band(F, b, brass, 'shin.' + sd, 0.82, 0.015, 0.014, reach=0.09)
        sh = J['K' + sd] + (J['A' + sd] - J['K' + sd]) * 0.55
        F.solid(fin, S.ellipsoid(sh + v3(sx * 0.05, 0.03, 0.06), (0.012, 0.03, 0.13), S.rot_euler(-25, 0, 0)), 0.006)
    K.belt(F, b, brass, J['pelvis'][2] + 0.04 * s, 0.02, 0.01, t1=0.002)
    K.strap(F, b, leather, J['SR'] + v3(0.03, 0, 0.05), J['HpL'] + v3(0, 0, 0.12), 0.03, 0.01)
    # layered nacre pauldron (character right)
    Sj = J['SR']
    for i in range(3):
        c = Sj + v3(-0.03 - 0.012 * i, 0, 0.04 - 0.05 * i)
        m = S.ellipsoid(c, (0.11 * s, 0.11 * s, 0.08 * s)).inter(S.halfspace(c + v3(0, 0, -0.04), (0, 0, -1)), 0.004)
        F.shell(nacre, m, 0.01 + 0.012 * i, 0.024 + 0.012 * i, 0.006, 'cur', K.ridges(0.002, 200, 'x'))
    # helmet with glass visor and shell crest
    hc, hs = b.hc, b.hs
    K.helmet(F, b, helm, 1.0)
    F.solid(visor, S.ellipsoid(hc + v3(0, -0.06, -0.015) * hs, (0.075 * hs, 0.07 * hs, 0.065 * hs)), 0.004)
    F.solid(hbrass, S.torus(hc + v3(0, -0.05, -0.015) * hs, 0.074 * hs, 0.005, S.frame_from_axis((0, -1, 0.15))), 0.003)
    for i in range(3):
        F.solid(crest, S.ellipsoid(hc + v3(0.015 - i * 0.012, -0.02 + i * 0.03, 0.13 - i * 0.02) * hs, (0.012 * hs, 0.10 * hs, 0.035 * hs), S.rot_euler(-20 + i * 10, 0, 0)), 0.006)
    # back reservoir
    ybk = K.body_extent(b, J['spine1'][2] + 0.02, 0, 'back')
    rc = v3(0, ybk + 0.06, J['spine1'][2] + 0.02)
    F.solid(orb, S.ellipsoid(rc, (0.075, 0.055, 0.10)), 0.0)
    F.solid(obr, S.ring_band(rc, (0, 1, 0), 0.085, 0.016, 0.012), 0.003)
    fr = W.grip_frame(b, 'R')
    wg = F.part(('leather', '#1e2a3a'), 'hand.R', 'rigid', 'w_grip')
    wb = F.part(('brass', BRASS), 'hand.R', 'rigid', 'w_brass')
    wn = F.part(('pearl', NACRE), 'hand.R', 'rigid', 'w_nacre')
    ws = F.part(('steel', '#c0c4c8'), 'hand.R', 'rigid', 'w_edge')
    items = W.wrapped_handle(fr, wg, -0.09, 0.07, 0.014, wb, 0.019)
    items += W.cross_guard(fr, wb, 0.08, 0.035, 0.012)
    items += W.curved_blade(fr, wn, ws, 0.09, 0.48, 0.06, 0.03, 0.006, -0.16, edge_frac=0.32)
    F.detach('weapon', items)


@hero('oath-04-sorcerer', ref='reference-086', skin='#6a4632', eyes='#1e140e', hair='#e4e2de', brow='#d8d4ce', tris=26000, arm_out=10,
      body=dict(H=1.74, sex=0.0, mass=0.45, muscle=0.5, age=0.8, width=1.05))
def tidal_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    robe = F.part(('cloth', BLUE, {'c2': (0.04, 0.08, 0.16)}), None, 'soft', 'robe')
    skirt = F.part(('cloth', BLUE, {'c2': (0.04, 0.08, 0.16)}), None, 'skirt', 'skirt')
    teal = F.part(('cloth', '#3c6a62'), None, 'soft', 'pants')
    cuff = F.part(('linen', NACRE), None, 'soft', 'cuffs')
    nacre_c = F.part(('pearl', NACRE), 'spine2', 'rigid', 'collar')
    nacre_s = F.part(('pearl', NACRE), None, 'skirt', 'sidepanels')
    brass = F.part(('brass', BRASS), None, 'skirt', 'brass')
    brass_r = F.part(('brass', BRASS), 'spine2', 'rigid', 'collarbrass')
    leather = F.part(('leather', '#2e2018'), None, 'soft', 'belt')
    orb = F.part(('glass', '#46b4cc', {'glow': '#1a6a80'}), 'hips', 'rigid', 'orbs')
    orbf = F.part(('brass', BRASS), 'hips', 'rigid', 'orbframes')
    boot = F.part(('leather', '#22262c'), None, 'soft', 'boots')
    hood = F.part(('cloth', '#1a2e4a'), 'spine2', 'rigid', 'hooddown')
    hair = F.part(('hair', spec['hair'], {'c2': (0.95, 0.95, 0.95)}), 'head', 'rigid', 'hair')
    K.shirt(F, b, robe, sleeve=1.85, neck=0.3, hem=-0.6, thick=0.016, fold=0.005)
    K.pants(F, b, teal, bottom=0.65, waist=0.7, thick=0.01, bag=0.04)
    K.boots(F, b, boot, top=0.6, thick=0.014, sole_pid=boot, sole=0.02)
    for sd in 'LR':
        K.band(F, b, cuff, 'forearm.' + sd, 0.82, 0.07, 0.022, reach=0.09)
        K.band(F, b, brass, 'shin.' + sd, 0.62, 0.016, 0.02, reach=0.1)
        K.band(F, b, brass, 'shin.' + sd, 0.9, 0.014, 0.02, reach=0.1)
    zt = J['pelvis'][2] + 0.05 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(skirt, K.robe_skirt(b, zt, 0.28 * b.p['H'], xr + 0.02, (yb - yf) / 2 + 0.03, xr + 0.09, (yb - yf) / 2 + 0.09, pleats=10, pleat_amp=0.006, front_open=0.06), 0.03)
    for sx in (1, -1):
        c = v3(sx * (xr + 0.06), (yf + yb) / 2 - 0.01, zt - 0.22)
        F.solid(nacre_s, S.ellipsoid(c, (0.018, 0.10, 0.17)), 0.004)
        F.solid(brass, S.ellipsoid(c, (0.014, 0.108, 0.178)).sub(S.slab(c, (1, 0, 0), 0.06), 0), 0.002)
    K.belt(F, b, leather, zt, 0.055 * s, 0.03, t1=0.01)
    for x in (-0.11, 0.0, 0.11):
        oc = v3(x * w, yf - 0.075, zt - 0.02)
        K.orb(F, orb, oc, 0.052, orbf, 0.004)
    # pearl collar ring
    nb = J['neck']
    for i in range(11):
        ang = np.radians(-150 + i * 30)
        d = v3(np.sin(ang), -np.cos(ang), 0)
        c = nb + d * 0.115 * w + v3(0, 0.01, -0.02 + 0.015 * np.cos(ang))
        F.solid(nacre_c, S.ellipsoid(c, (0.042, 0.042, 0.012), S.frame_from_axis(d * 0.6 + v3(0, 0, 1))), 0.004)
        F.solid(brass_r, S.torus(c, 0.042, 0.004, S.frame_from_axis(d * 0.6 + v3(0, 0, 1))), 0.002)
    F.solid(hood, S.torus(nb + v3(0, 0.03, 0.01), 0.10, 0.04, S.frame_from_axis((0, 0.35, 1))).displaced(K.folds(0.006, (25, 25, 25), 4), 0.006), 0.02)
    K.hair_cap(F, b, hair, thick=0.014, front=0.06, side=0.02, back=-0.05, fold=0.004)
    K.hair_strands(F, b, hair, 'top', n=60, length=0.025, r0=0.012, seed=41)
    beard_p = F.part(('hair', spec['hair'], {'c2': (0.95, 0.95, 0.95)}), 'head', 'rigid', 'beard')
    K.beard(F, b, beard_p, length=0.035, width=0.05, seed=42)
    fr = W.grip_frame(b, 'R')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.9 + fr.a * 0.1, fr.a)
    sh = F.part(('wood', '#3a2a1e'), 'hand.R', 'rigid', 'w_shaft')
    br = F.part(('brass', BRASS), 'hand.R', 'rigid', 'w_brass')
    gl = F.part(('glass', '#46b4cc', {'glow': '#1a8aa0'}), 'hand.R', 'rigid', 'w_glass')
    items = W.staff(fr2, sh, -0.78, 0.72, 0.017, br, rings=(-0.4, 0.3, 0.66))
    top = fr2.p(0.84)
    items.append((gl, S.sphere(top, 0.07), 0.0, 'add'))
    items.append((br, S.torus(top, 0.072, 0.007, fr2.M), 0.002, 'add'))
    items.append((br, S.torus(top, 0.072, 0.007, np.stack([fr2.a, fr2.w, fr2.e], 1)), 0.002, 'add'))
    F.detach('weapon', items)
