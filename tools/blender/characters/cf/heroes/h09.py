"""09 Oath of Daybreak — ninja (reference-075) and sorcerer (reference-074)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

IVORY = '#ece4d2'
GREY = '#8a8a88'
GOLD = '#c8a050'


def lotus(F, pid, c, axis, r=0.05, petals=7, pid2=None):
    ax = S.normalize(axis)
    M = S.frame_from_axis(ax)
    for i in range(petals):
        ang = np.radians(-90 + 180 * i / (petals - 1))
        d = M[:, 0] * np.sin(ang) + M[:, 1] * np.cos(ang)
        tip = c + d * r + ax * 0.01
        F.solid(pid, S.ellipsoid(c + d * r * 0.5, (r * 0.22, r * 0.5, r * 0.08), S.frame_from_axis(ax, up=d) @ np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]])), 0.003)
    F.solid(pid2 or pid, S.sphere(c, r * 0.25), 0.003)


@hero('oath-09-ninja', ref='reference-075', skin='#4e3022', eyes='#1a100a', hair='#0e0a08', tris=24000,
      body=dict(H=1.74, sex=1.0, mass=-0.1, muscle=0.65, grip_r=True))
def day_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    suit = F.part(('cloth', '#7c7c7a'), None, 'soft', 'suit')
    wrap = F.part(('linen', IVORY), None, 'soft', 'wrap')
    enamel = F.part(('enamel', IVORY), None, 'skirt', 'tabard')
    goldp = F.part(('gold', GOLD), None, 'skirt', 'goldtrim')
    gold = F.part(('gold', GOLD), None, 'soft', 'gold')
    wing = F.part(('enamel', IVORY), 'spine2', 'rigid', 'wing')
    wingg = F.part(('gold', GOLD), 'spine2', 'rigid', 'winggold')
    brac = F.part(('enamel', IVORY), None, 'soft', 'bracers')
    boot = F.part(('leather', '#5a5a58'), None, 'soft', 'boots')
    visor = F.part(('enamel', IVORY), 'head', 'rigid', 'visor')
    vband = F.part(('cloth', '#6a6a68'), 'head', 'rigid', 'visorband')
    vgold = F.part(('gold', GOLD), 'head', 'rigid', 'visorgold')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, suit, sleeve=1.9, neck=0.9, hem=-1.0, thick=0.003, fold=0.0012)
    K.pants(F, b, suit, bottom=1.0, waist=0.8, thick=0.003, bag=0.0, fold=0.0012)
    K.gloves(F, b, suit, cuff=0.9, thick=0.003, fingerless=True)
    F.tight(wrap, dict(K.torso_cover(0.95, 0.4), **{'shoulder.R': (None, 0.8)}), 0.008, K.add_noise(K.ridges(0.002, 60, 'z'), K.folds(0.002, (25, 25, 25), 2)))
    zt = J['pelvis'][2] + 0.05 * s
    K.belt(F, b, wrap, zt + 0.03, 0.08 * s, 0.012)
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    for sx in (1, -1):
        p = K.apron(F, b, enamel, zt, J['KL'][2] + 0.17, 0.085, yf - 0.03, 0.01, 0.4, 0.04).moved((sx * 0.08 * w, 0, 0))
        F.solid(enamel, p, 0.003)
        F.solid(enamel, K.apron(F, b, enamel, zt, J['KL'][2] + 0.2, 0.09, 2 * ymid - yb - 0.03, 0.01, 0.4, 0.04).moved((sx * 0.08 * w, 0, 0)).mirrored(1, ymid), 0.003)
    F.paint(goldp, S.Prim(lambda P: 0.006 - np.abs(np.abs(P[..., 0]) - 0.16 * w), (-0.4, -0.4, 0.3), (0.4, 0.4, 1.2)), only=[enamel])
    # shoulder wing (left)
    Sj = J['SL']
    wc = Sj + v3(0.05, 0.0, 0.07)
    F.solid(wing, S.roundbox(wc, (0.10, 0.06, 0.03), S.rot_euler(0, -35, 0), 0.006).union(S.roundcone(wc, wc + v3(0.16, 0.0, 0.10), 0.05, 0.004), 0.01), 0.006)
    F.solid(wingg, S.cylinder(Sj + v3(0.0, -0.05, 0.02), Sj + v3(0.0, 0.05, 0.02), 0.022, 0.004), 0.003)
    for sd in 'LR':
        F.shell(brac, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.45), K.limb_point(b, 'forearm.' + sd, 0.92), 0.07 * s), 0.004, 0.014, 0.004)
        K.band(F, b, gold, 'forearm.' + sd, 0.92, 0.01, 0.016, reach=0.07)
        K.band(F, b, gold, 'upperarm.' + sd, 0.45, 0.012, 0.008, reach=0.08)
    K.boots(F, b, boot, top=0.75, thick=0.01, sole_pid=boot, sole=0.035)
    for sd in 'LR':
        F.shell(brac, S.roundbox(K.limb_point(b, 'shin.' + sd, 0.8) + v3(0, -0.05, 0), (0.05, 0.04, 0.07), None, 0.01), 0.006, 0.018, 0.004)
    hc, hs = b.hc, b.hs
    vm = S.ellipsoid(hc + v3(0, -0.07, -0.005) * hs, (0.08 * hs, 0.08 * hs, 0.05 * hs)).inter(S.halfspace(hc + v3(0, -0.05, 0) * hs, (0, 1, 0)), 0.004)
    F.shell(visor, vm, 0.004, 0.016, 0.004, 'body')
    F.solid(visor, S.roundcone(hc + v3(0, -0.10, -0.01) * hs, hc + v3(0, -0.125, -0.07) * hs, 0.02 * hs, 0.004), 0.008)
    F.shell(vband, S.slab(hc + v3(0, 0, 0.0) * hs, (0, 0, 1), 0.025 * hs).inter(S.sphere(hc, 0.15 * hs), 0), 0.002, 0.008, 0.003, 'body')
    F.solid(vgold, S.roundbox(hc + v3(0, 0.10, 0.0) * hs, (0.02, 0.01, 0.014), None, 0.003), 0.002)
    K.hair_cap(F, b, hair, thick=0.012, front=0.055, side=0.01, back=-0.05)
    K.bun(F, b, hair, 'top', 0.05)
    K.hair_strands(F, b, hair, 'top', n=40, length=0.04, r0=0.009, seed=91)
    fr = W.grip_frame(b, 'R')
    wl = F.part(('leather', '#d8d0c0'), 'hand.R', 'rigid', 'w_grip')
    wg = F.part(('gold', GOLD), 'hand.R', 'rigid', 'w_gold')
    ws = F.part(('steel', '#d0d0cc'), 'hand.R', 'rigid', 'w_blade')
    items = W.wrapped_handle(fr, wl, -0.09, 0.06, 0.014, wg, 0.019)
    items += W.cross_guard(fr, wg, 0.075, 0.05, 0.012)
    items += W.straight_blade(fr, ws, None, 0.085, 0.45, 0.05, 0.007, taper=0.5, double=True)
    F.detach('weapon', items)


@hero('oath-09-sorcerer', ref='reference-074', skin='#8a6248', eyes='#24160e', hair='#b8b6b2', brow='#9a9690', tris=26000, arm_out=6,
      body=dict(H=1.80, sex=0.0, mass=0.0, muscle=0.45, age=0.75))
def day_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    robe = F.part(('cloth', GREY), None, 'soft', 'robe')
    rskirt = F.part(('cloth', GREY), None, 'skirt', 'robeskirt')
    sleeve = F.part(('cloth', '#8e8e8a'), None, 'soft', 'sleeves')
    tab = F.part(('enamel', IVORY), None, ('limit', ['spine', 'spine1', 'spine2', 'neck', 'shoulder.L', 'shoulder.R'], 0.03), 'tabard')
    tabs = F.part(('enamel', IVORY), None, 'skirt', 'tabardskirt')
    gold = F.part(('gold', GOLD), None, 'skirt', 'goldtrim')
    collar = F.part(('cloth', '#7a7a78'), 'neck', 'rigid', 'collar')
    belt = F.part(('cloth', '#6e6e6a'), None, 'soft', 'belt')
    lot = F.part(('gold', GOLD), 'hips', 'rigid', 'lotus')
    pants = F.part(('cloth', '#76766f'), None, 'soft', 'pants')
    boot = F.part(('leather', '#4a4844'), None, 'soft', 'boots')
    hair = F.part(('hair', spec['hair'], {'c2': (0.75, 0.75, 0.73)}), 'head', 'rigid', 'hair')
    K.shirt(F, b, robe, sleeve=1.1, neck=0.3, hem=-0.6, thick=0.010, fold=0.004)
    K.pants(F, b, pants, bottom=0.8, waist=0.7, thick=0.01, bag=0.03)
    K.boots(F, b, boot, top=0.75, thick=0.012, sole_pid=gold, sole=0.016)
    for sd in 'LR':
        K.wide_sleeve(F, b, sleeve, sd, 0.1, 0.11, 0.95, 0.01)
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(rskirt, K.robe_skirt(b, zt, J['KL'][2] - 0.18, xr + 0.02, (yb - yf) / 2 + 0.03, xr + 0.09, (yb - yf) / 2 + 0.07, pleats=12, pleat_amp=0.006, front_open=0.05), 0.03)
    # ivory tabard: shoulder cape + long front/back panels
    F.tight(tab, dict(K.torso_cover(0.0, 0.3), **{'shoulder.L': (None, None), 'shoulder.R': (None, None), 'upperarm.L': (None, 0.25), 'upperarm.R': (None, 0.25)}), 0.022, K.folds(0.002, (20, 20, 10), 4))
    ymid = (yf + yb) / 2
    F.solid(tabs, K.apron(F, b, tabs, zt + 0.03, 0.17 * b.p['H'], 0.13 * w, yf - 0.05, 0.012, 0.45, 0.06), 0.004)
    F.solid(tabs, K.apron(F, b, tabs, zt + 0.03, 0.17 * b.p['H'], 0.14 * w, 2 * ymid - yb - 0.05, 0.012, 0.45, 0.07).mirrored(1, ymid), 0.004)
    F.paint(gold, S.Prim(lambda P: 0.007 - np.abs(np.abs(P[..., 0]) - 0.13 * w - 0.06 * np.clip((zt - P[..., 2]) / (zt - 0.3), 0, 1)), (-0.4, -0.5, 0.2), (0.4, 0.5, 1.2)), only=[tabs])
    K.stand_collar(F, b, collar, height=0.05, flare=0.005, r0=0.068, open_front=25, th=0.01)
    K.belt(F, b, belt, zt, 0.08 * s, 0.04, t1=0.024)
    K.belt(F, b, gold, zt + 0.032, 0.01, 0.046, t1=0.04)
    lotus(F, lot, v3(0, yf - 0.075, zt + 0.01), (0, -1, 0.25), 0.07)
    F.solid(lot, S.roundbox(v3(0, yf - 0.07, zt - 0.08), (0.02, 0.006, 0.05), None, 0.003), 0.002)
    K.hair_cap(F, b, hair, thick=0.010, front=0.065, side=0.02, back=-0.05, fold=0.002)
    K.hair_strands(F, b, hair, 'swept', n=60, length=0.08, r0=0.009, seed=92)
    K.ponytail(F, b, hair, length=0.10, r=0.014, high=False)
    bp = F.part(('hair', '#a8a6a2'), 'head', 'rigid', 'beard')
    K.beard(F, b, bp, length=0.02, width=0.045, seed=93)
    fr = W.grip_frame(b, 'R')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.9 + fr.a * 0.1, fr.a)
    sh = F.part(('enamel', IVORY), 'hand.R', 'rigid', 'w_shaft')
    gd = F.part(('gold', GOLD), 'hand.R', 'rigid', 'w_gold')
    gl = F.part(('glow', '#6a5020', {'glow': '#ffe08a'}), 'hand.R', 'rigid', 'w_glow')
    items = W.staff(fr2, sh, -0.8, 0.75, 0.016, gd, rings=(-0.3, 0.2, 0.7))
    top = fr2.p(0.85)
    items.append((gl, S.sphere(top, 0.03), 0.0, 'add'))
    for i in range(6):
        ang = i * np.pi / 3
        d = fr2.e * np.cos(ang) + fr2.w * np.sin(ang)
        items.append((gd, S.ellipsoid(top + d * 0.04 - fr2.a * 0.02, (0.012, 0.022, 0.05), S.frame_from_axis(fr2.a * 0.6 + d, up=d)), 0.003, 'add'))
    F.detach('weapon', items)
