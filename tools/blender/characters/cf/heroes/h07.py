"""07 Graft Sanctuary — ninja (reference-079) and sorcerer (reference-078)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

BARK = '#5a4028'
MOSS = '#5f7a3a'
STRAW = '#b8945a'
AMBER = '#e0a030'


def forearm_frame(b, sd):
    a, c = b.bones['forearm.' + sd]
    ax = S.normalize(c - a)
    out = S.normalize(np.cross(ax, (0, -1, 0)))
    if out[2] < 0:
        out = -out
    return a, c, ax, out, np.stack([S.normalize(np.cross(out, ax)), out, ax], axis=1)


def sapling(F, pid_stem, pid_leaf, base, height, seed):
    rng = np.random.default_rng(seed)
    top = base + v3(rng.normal(0, 0.02), rng.normal(0, 0.02), height)
    F.solid(pid_stem, S.roundcone(base, top, 0.008, 0.003), 0.002)
    for i in range(5):
        t = 0.35 + 0.14 * i
        p = base + (top - base) * t
        ang = rng.random() * 6.28
        d = v3(np.cos(ang), np.sin(ang), 0.5)
        c = p + d * 0.035
        F.solid(pid_leaf, S.ellipsoid(c, (0.035, 0.016, 0.004), S.frame_from_axis(v3(-d[1], d[0], 2.0), up=d)), 0.002)


@hero('oath-07-ninja', ref='reference-079', skin='#5e3c28', eyes='#1e120a', hair='#120c0a', tris=25000,
      body=dict(H=1.82, sex=0.0, mass=0.1, muscle=0.9, grip_r=True))
def graft_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    cloth = F.part(('cloth', '#3a2c20'), None, 'soft', 'cloth')
    pants = F.part(('cloth', '#2e241c'), None, 'soft', 'pants')
    bark = F.part(('bark', BARK), None, 'soft', 'barkplates')
    bark_s = F.part(('bark', BARK), 'spine2', 'rigid', 'barkchest')
    moss = F.part(('moss', MOSS), None, ('limit', ['spine2', 'shoulder.L', 'upperarm.L', 'neck']), 'moss')
    sash = F.part(('cloth', '#5a6e34'), None, 'soft', 'sash')
    straw = F.part(('straw', STRAW), None, 'skirt', 'straw')
    sashs = F.part(('cloth', '#5a6e34'), None, 'skirt', 'sashskirt')
    amber = F.part(('glass', AMBER, {'glow': '#a05a10'}), None, 'soft', 'amber')
    mask = F.part(('bark', '#7a5636', {'c2': (0.4, 0.26, 0.14)}), 'head', 'rigid', 'mask')
    meyes = F.part(('glow', '#3a2008', {'glow': '#ffb040'}), 'head', 'rigid', 'maskeyes')
    leather = F.part(('leather', '#2a1e16'), None, 'soft', 'leather')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, cloth, sleeve=0.55, neck=0.7, hem=-0.6, thick=0.007, fold=0.003)
    K.pants(F, b, pants, bottom=0.6, waist=0.7, thick=0.01, bag=0.05)
    F.tight(leather, {'shin.L': (0.4, 0.9), 'shin.R': (0.4, 0.9)}, 0.008, K.ridges(0.002, 150, 'z'))
    K.boots(F, b, bark, top=0.75, thick=0.016, sole_pid=leather, sole=0.02)
    K.gloves(F, b, leather, cuff=0.85, thick=0.005, fingerless=True)
    for sd in 'LR':
        K.pauldron(F, b, bark, sd, size=1.0, layers=2, t2=0.016, gap=0.008)
    for i, z in enumerate((J['spine2'][2] + 0.03, J['spine2'][2] - 0.04, J['spine1'][2])):
        F.shell(bark_s, S.roundbox((0.02 - 0.03 * i, -0.15, z), (0.10 * w, 0.12, 0.03), S.rot_euler(0, 18, 0), 0.01), 0.008, 0.024, 0.005, 'cur', K.folds(0.003, (40, 40, 40), i))
    F.shell(moss, S.ellipsoid(J['SL'] + v3(-0.03, 0, 0.05), (0.16, 0.16, 0.12)), 0.014, 0.04, 0.012, 'cur', K.folds(0.012, (60, 60, 60), 7))
    K.strap(F, b, sash, J['SL'] + v3(-0.02, 0, 0.05), J['HpR'] + v3(0, 0, 0.12), 0.07, 0.02, t1=0.006)
    zt = J['pelvis'][2] + 0.04 * s
    K.belt(F, b, sash, zt, 0.08 * s, 0.022, t1=0.004)
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    apf = K.apron(F, b, straw, zt - 0.02, J['KL'][2] + 0.12, 0.13 * w, yf - 0.03, 0.012, 0.35, 0.03)
    F.solid(straw, apf, 0.004)
    F.solid(straw, K.apron(F, b, straw, zt - 0.02, J['KL'][2] + 0.12, 0.13 * w, 2 * ymid - yb - 0.03, 0.012, 0.35, 0.03).mirrored(1, ymid), 0.004)
    for sd in 'LR':
        a, c, ax, out, M = forearm_frame(b, sd)
        F.shell(bark, S.capsule(a + (c - a) * 0.2, a + (c - a) * 0.9, 0.07 * s), 0.006, 0.024, 0.005, 'cur', K.folds(0.004, (30, 30, 30), 3))
        for t in (0.4, 0.7):
            F.solid(amber, S.ellipsoid(a + (c - a) * t + out * 0.06 * s, (0.012, 0.012, 0.018), M), 0.002)
        K.band(F, b, leather, 'forearm.' + sd, 0.55, 0.02, 0.032, reach=0.09)
    hc, hs = b.hc, b.hs
    F.solid(mask, S.ellipsoid(hc + v3(0, -0.075, -0.01) * hs, (0.07 * hs, 0.05 * hs, 0.12 * hs)).displaced(K.ridges(0.002, 300, 'x'), 0.003), 0.006)
    for sx in (1, -1):
        F.solid(meyes, S.ellipsoid(hc + v3(sx * 0.03, -0.12, 0.012) * hs, (0.012 * hs, 0.006 * hs, 0.007 * hs)), 0.0)
    K.hair_cap(F, b, hair, thick=0.012, front=0.06, side=0.0, back=-0.06, fold=0.004)
    K.hair_strands(F, b, hair, 'top', n=60, length=0.025, r0=0.011, seed=71)
    fr = W.grip_frame(b, 'R')
    wb = F.part(('bark', '#6a4a2e'), 'hand.R', 'rigid', 'w_bow')
    wsn = F.part(('cloth', '#cdbf9a'), 'hand.R', 'rigid', 'w_string')
    wl = F.part(('moss', MOSS), 'hand.R', 'rigid', 'w_leaf')
    fr2 = W.Frame(fr.o, fr.a, v3(0, 0, 1))
    items = W.bow(fr2, wb, wsn, L=0.62)
    for sg in (1, -1):
        items.append((wl, S.ellipsoid(fr2.p(0.02, sg * 0.25) + fr2.w * 0.02, (0.02, 0.006, 0.035), fr2.M), 0.002, 'add'))
    F.detach('weapon', items)


@hero('oath-07-sorcerer', ref='reference-078', skin='#9a6c4c', eyes='#24160e', hair='#9a9690', brow='#6a6662', tris=26000, arm_out=10,
      body=dict(H=1.55, sex=1.0, mass=0.3, muscle=0.35, age=0.95, width=1.02))
def graft_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    robe = F.part(('cloth', '#4a3220'), None, 'soft', 'robe')
    skirt = F.part(('cloth', '#3e2a1c'), None, 'skirt', 'skirt')
    sleeve = F.part(('cloth', '#4a3220'), None, 'soft', 'sleeves')
    cream = F.part(('linen', '#d8cbb0'), None, 'soft', 'innercollar')
    moss = F.part(('felt', '#5a6e30', {'c2': (0.18, 0.22, 0.06)}), None, 'skirt', 'mossapron')
    straw = F.part(('straw', STRAW), None, 'skirt', 'strawpanels')
    cord = F.part(('straw', '#a8844e'), None, 'skirt', 'cords')
    amber = F.part(('glass', AMBER, {'glow': '#a05a10'}), None, 'skirt', 'beads')
    boot = F.part(('leather', '#3a2618'), None, 'soft', 'boots')
    basket = F.part(('straw', '#8a6438', {'c2': (0.35, 0.22, 0.1)}), 'spine2', 'rigid', 'basket')
    frame = F.part(('bark', BARK), 'spine2', 'rigid', 'barkframe')
    soil = F.part(('moss', '#3a3a1e'), 'spine2', 'rigid', 'soil')
    stem = F.part(('wood', '#4a3a20'), 'spine2', 'rigid', 'stems')
    leaf = F.part(('moss', '#5c8a34', {'c2': (0.25, 0.42, 0.1)}), 'spine2', 'rigid', 'leaves')
    strapp = F.part(('bark', BARK), None, 'soft', 'straps')
    hair = F.part(('hair', spec['hair'], {'c2': (0.7, 0.7, 0.68)}), 'head', 'rigid', 'hair')
    K.shirt(F, b, robe, sleeve=1.2, neck=0.3, hem=-0.6, thick=0.014, fold=0.005)
    K.pants(F, b, skirt, bottom=0.7, waist=0.7, thick=0.01, bag=0.03)
    K.boots(F, b, boot, top=0.7, thick=0.014, sole_pid=boot, sole=0.02)
    for sd in 'LR':
        K.wide_sleeve(F, b, sleeve, sd, 0.1, 0.10, 0.9, 0.012, hang=0.04)
        K.band(F, b, cream, 'forearm.' + sd, 0.92, 0.03, 0.01, reach=0.06)
        for t in (0.75, 0.9):
            K.band(F, b, strapp, 'shin.' + sd, t, 0.012, 0.02, reach=0.09)
    F.shell(cream, K.below_head(b, S.ellipsoid(J['neck'] + v3(0, -0.03, -0.02), (0.08, 0.08, 0.07)).inter(S.halfspace(J['neck'], (0, 1, 0)), 0.01)), 0.006, 0.02, 0.006)
    zt = J['pelvis'][2] + 0.05 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(skirt, K.robe_skirt(b, zt, 0.17 * b.p['H'], xr + 0.02, (yb - yf) / 2 + 0.03, xr + 0.10, (yb - yf) / 2 + 0.09, pleats=9, pleat_amp=0.008), 0.03)
    F.solid(moss, K.apron(F, b, moss, J['spine2'][2], 0.24 * b.p['H'], 0.09 * w, K.body_extent(b, J['spine1'][2], 0, 'front') - 0.035, 0.012, 0.3, 0.05).displaced(K.folds(0.004, (30, 30, 30), 3), 0.005), 0.006)
    for sx in (1, -1):
        F.solid(straw, K.apron(F, b, straw, zt - 0.02, 0.22 * b.p['H'], 0.065, yf - 0.025, 0.012, 0.25, 0.03).moved((sx * 0.13 * w, 0, 0)), 0.004)
        for k in range(4):
            x = sx * (0.07 + 0.035 * k) * w
            y = K.body_extent(b, zt - 0.03, x, 'front') - 0.06
            pts = [v3(x, y, zt - 0.02 - 0.06 * j) for j in range(6)]
            F.solid(cord, S.chain(pts, [0.008] * 6, 0.004).displaced(K.ridges(0.002, 400, 'z'), 0.003), 0.003)
            F.solid(amber, S.ellipsoid(pts[-1] + v3(0, 0, -0.02), (0.012, 0.012, 0.018)), 0.003)
    K.belt(F, b, strapp, zt + 0.02, 0.04, 0.03, t1=0.012)
    # back basket with saplings
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    bc = v3(0, ybk + 0.15, J['spine2'][2] - 0.04)
    bot, top = bc + v3(0, 0, -0.18), bc + v3(0, 0.02, 0.18)
    F.solid(basket, S.tube_shell(bot, top, 0.10, 0.17, 0.016).displaced(lambda P: 0.003 * np.sin(P[..., 2] * 220) * np.sin(np.arctan2(P[..., 0], P[..., 1] - bc[1]) * 24), 0.004), 0.004)
    F.solid(basket, S.cylinder(bot, bot + v3(0, 0, 0.02), 0.10, 0.005), 0.004)
    F.solid(soil, S.cylinder(top + v3(0, -0.005, -0.06), top + v3(0, -0.005, -0.03), 0.16, 0.01).displaced(K.folds(0.006, (40, 40, 40), 2), 0.006), 0.004)
    for sx in (1, -1):
        F.solid(frame, S.capsule(bc + v3(sx * 0.1, -0.12, 0.18), bc + v3(sx * 0.1, -0.12, -0.2), 0.012), 0.004)
        K.strap(F, b, strapp, J['S' + ('L' if sx > 0 else 'R')] + v3(-sx * 0.06, -0.25, 0.05), J['S' + ('L' if sx > 0 else 'R')] + v3(-sx * 0.06, 0.25, 0.05), 0.04, 0.02, t1=0.01, around=(1, 0, 0))
    for i, (dx, dy, h) in enumerate(((0, 0, 0.30), (0.09, 0.02, 0.24), (-0.09, 0.02, 0.26))):
        sapling(F, stem, leaf, top + v3(dx, dy, -0.04), h, 70 + i)
    K.hair_cap(F, b, hair, thick=0.011, front=0.06, side=0.015, back=-0.05)
    K.hair_strands(F, b, hair, 'swept', n=40, length=0.07, r0=0.009, seed=72)
    K.bun(F, b, hair, 'back', 0.035)
    fr = W.grip_frame(b, 'R')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.9 + fr.a * 0.1, fr.a)
    ws = F.part(('wood', '#5a4026'), 'hand.R', 'rigid', 'w_staff')
    wl = F.part(('moss', '#5c8a34', {'c2': (0.25, 0.42, 0.1)}), 'hand.R', 'rigid', 'w_leaves')
    items = [(ws, S.chain([fr2.p(-0.7), fr2.p(0.0, 0.01), fr2.p(0.5, -0.01), fr2.p(0.75, 0.03)], [0.018, 0.017, 0.015, 0.012], 0.004).displaced(K.folds(0.003, (20, 20, 20), 4), 0.004), 0.0, 'add')]
    rng = np.random.default_rng(7)
    for i in range(7):
        ang = rng.random() * 6.28
        d = fr2.e * np.cos(ang) + fr2.w * np.sin(ang)
        c = fr2.p(0.68 + 0.02 * i) + d * 0.04
        items.append((wl, S.ellipsoid(c, (0.035, 0.015, 0.004), S.frame_from_axis(np.cross(d, fr2.a) + fr2.a, up=d)), 0.002, 'add'))
    F.detach('weapon', items)
