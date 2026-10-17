"""08 Bitterglass Guild — ninja (reference-077) and sorcerer (reference-076)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

OIL = '#2a2228'
PURPLE = '#3a2a3e'
BRASS = '#9a8048'
VIAL = '#b8d630'


def vial(F, pid_glass, pid_cap, c, h=0.07, r=0.014):
    F.solid(pid_glass, S.cylinder(c + v3(0, 0, -h / 2), c + v3(0, 0, h / 2), r, 0.004), 0.0)
    F.solid(pid_cap, S.cylinder(c + v3(0, 0, h / 2 - 0.006), c + v3(0, 0, h / 2 + 0.01), r * 1.15, 0.002), 0.002)
    F.solid(pid_cap, S.cylinder(c + v3(0, 0, -h / 2 - 0.008), c + v3(0, 0, -h / 2 + 0.006), r * 1.15, 0.002), 0.002)


@hero('oath-08-ninja', ref='reference-077', skin='#b88a68', eyes='#24160e', hair='#1a1410', tris=25000,
      body=dict(H=1.76, sex=0.0, mass=-0.1, muscle=0.7, grip_r=True))
def bitter_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    jacket = F.part(('oilskin', '#2c2430'), None, 'soft', 'jacket')
    vest = F.part(('oilskin', PURPLE), None, 'soft', 'vest')
    shorts = F.part(('oilskin', '#262024'), None, 'soft', 'shorts')
    legs = F.part(('cloth', '#1e1a1c'), None, 'soft', 'leggings')
    leather = F.part(('leather', '#3a2a22'), None, 'soft', 'leather')
    brass = F.part(('brass', BRASS, {'rust': 0.6}), None, 'soft', 'brass')
    glass = F.part(('glass', VIAL, {'glow': '#6a9010'}), 'hips', 'rigid', 'vials')
    gcap = F.part(('brass', BRASS, {'rust': 0.6}), 'hips', 'rigid', 'vialcaps')
    bglass = F.part(('glass', VIAL, {'glow': '#6a9010'}), 'spine2', 'rigid', 'backvials')
    bpack = F.part(('leather', '#2e2420'), 'spine2', 'rigid', 'pack')
    bcap = F.part(('brass', BRASS, {'rust': 0.6}), 'spine2', 'rigid', 'packbrass')
    cap = F.part(('oilskin', '#262026'), 'head', 'rigid', 'skullcap')
    mask = F.part(('leather', '#2a2224'), 'head', 'rigid', 'respirator')
    can = F.part(('brass', BRASS, {'rust': 0.5}), 'head', 'rigid', 'canisters')
    cglow = F.part(('glow', '#203008', {'glow': '#8ab020'}), 'head', 'rigid', 'filter')
    glove = F.part(('leather', '#1c1818'), None, 'soft', 'gloves')
    boot = F.part(('leather', '#2a201c'), None, 'soft', 'boots')
    K.shirt(F, b, jacket, sleeve=1.85, neck=0.9, hem=-0.4, thick=0.008, fold=0.003)
    F.tight(vest, K.torso_cover(0.0, 0.2), 0.016, K.folds(0.003, (20, 20, 10), 3))
    F.tight(legs, {'shin.L': (None, 0.9), 'shin.R': (None, 0.9), 'thigh.L': (0.5, None), 'thigh.R': (0.5, None)}, 0.004)
    K.pants(F, b, shorts, bottom=0.0, waist=0.75, thick=0.014, bag=0.03)
    K.boots(F, b, boot, top=0.65, thick=0.012, sole_pid=boot, sole=0.02)
    K.gloves(F, b, glove, cuff=0.75, thick=0.006)
    for sd in 'LR':
        F.shell(leather, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.35), K.limb_point(b, 'forearm.' + sd, 0.85), 0.07 * s), 0.006, 0.02, 0.004)
        K.band(F, b, brass, 'forearm.' + sd, 0.36, 0.012, 0.022, reach=0.08)
        F.shell(leather, S.ellipsoid(J['K' + sd] + v3(0, -0.05, 0), (0.055 * s, 0.05, 0.065 * s)), 0.004, 0.018, 0.006)
        K.band(F, b, brass, 'shin.' + sd, 0.7, 0.014, 0.018, reach=0.1)
        K.pouch(F, leather, K.limb_point(b, 'thigh.' + sd, 0.25) + v3((1 if sd == 'L' else -1) * 0.11 * s, -0.01, 0), (0.025, 0.05, 0.06))
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        K.strap(F, b, leather, J['S' + sd] + v3(-sx * 0.05, -0.25, 0.04), J['S' + sd] + v3(-sx * 0.05, 0.25, 0.04), 0.035, 0.03, t1=0.018, around=(1, 0, 0))
    K.strap(F, b, leather, J['SR'] + v3(0.03, 0, 0.04), J['HpL'] + v3(0, 0, 0.18), 0.03, 0.03, t1=0.018)
    zt = J['pelvis'][2] + 0.05 * s
    K.belt(F, b, leather, zt, 0.05 * s, 0.03, t1=0.012)
    for x in (-0.15, -0.09, -0.03, 0.03, 0.09, 0.15):
        y = K.body_extent(b, zt, x * w, 'front') - 0.035
        vial(F, glass, gcap, v3(x * w, y, zt), 0.06, 0.012)
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    pc = v3(0.03, ybk + 0.06, J['spine2'][2] - 0.02)
    F.solid(bpack, S.roundbox(pc, (0.09, 0.045, 0.11), None, 0.012).displaced(K.folds(0.002, (40, 40, 40), 8), 0.002), 0.004)
    for i in range(3):
        vial(F, bglass, bcap, pc + v3(-0.05 + 0.05 * i, 0.0, 0.17), 0.12, 0.014)
    hc, hs = b.hc, b.hs
    F.shell(cap, S.ellipsoid(hc + v3(0, 0.0, 0.045) * hs, (0.13 * hs, 0.14 * hs, 0.09 * hs)).inter(S.halfspace(hc + v3(0, 0, 0.025) * hs, (0, 0, -1)), 0.004), -0.002, 0.008, 0.004, 'body', K.folds(0.002, (40, 40, 40), 5))
    mm = K.face_mask_band(b, -0.115, -0.025).inter(S.halfspace(hc + v3(0, -0.04, 0) * hs, (0, 1, 0)), 0.004)
    F.shell(mask, mm, 0.004, 0.016, 0.004, 'cur')
    for sx in (1, -1):
        cc = hc + v3(sx * 0.055, -0.095, -0.07) * hs
        ax = S.normalize(v3(sx * 0.7, -0.6, -0.1))
        F.solid(can, S.cylinder(cc, cc + ax * 0.03, 0.026, 0.004), 0.003)
        F.solid(cglow, S.cylinder(cc + ax * 0.028, cc + ax * 0.034, 0.018, 0.002), 0.0)
    fr = W.grip_frame(b, 'R')
    wl = F.part(('leather', '#2a1e18'), 'hand.R', 'rigid', 'w_grip')
    wb = F.part(('brass', BRASS, {'rust': 0.5}), 'hand.R', 'rigid', 'w_brass')
    ws = F.part(('steel', '#8a8c84'), 'hand.R', 'rigid', 'w_blade')
    wg = F.part(('glass', VIAL, {'glow': '#7aa018'}), 'hand.R', 'rigid', 'w_edge')
    items = W.wrapped_handle(fr, wl, -0.1, 0.07, 0.014, wb, 0.019)
    items.append((wb, S.torus(fr.p(0.05, 0.04), 0.05, 0.005, np.stack([fr.a, fr.e, fr.w], 1)), 0.002, 'add'))
    items += W.straight_blade(fr, ws, wg, 0.085, 0.6, 0.04, 0.006, taper=0.6, curve=-0.06)
    F.detach('weapon', items)


@hero('oath-08-sorcerer', ref='reference-076', skin='#c49c80', eyes='#3a2a1a', hair='#8a8682', brow='#5a5654', tris=26000,
      body=dict(H=1.74, sex=1.0, mass=-0.3, muscle=0.4, age=0.55, neck_len=1.05))
def bitter_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    coat = F.part(('oilskin', OIL), None, 'soft', 'coat')
    skirt = F.part(('oilskin', OIL), None, 'skirt', 'coatskirt')
    lining = F.part(('cloth', '#4a2e48'), None, 'skirt', 'lining')
    piping = F.part(('brass', BRASS), None, 'skirt', 'piping')
    collar = F.part(('oilskin', '#2a2226'), 'neck', 'rigid', 'collar')
    trous = F.part(('cloth', '#1e1a1c'), None, 'soft', 'trousers')
    boot = F.part(('leather', '#1c1818'), None, 'soft', 'boots')
    glove = F.part(('leather', '#1c1818'), None, 'soft', 'gloves')
    brass = F.part(('brass', BRASS, {'rust': 0.5}), None, 'soft', 'bracers')
    leather = F.part(('leather', '#4a3226'), None, 'soft', 'harness')
    tank = F.part(('glass', '#d8f070', {'glow': '#6a9010'}), 'spine2', 'rigid', 'flasks')
    tankb = F.part(('brass', BRASS, {'rust': 0.5}), 'spine2', 'rigid', 'flaskbrass')
    vg = F.part(('glass', VIAL, {'glow': '#6a9010'}), 'hips', 'rigid', 'vials')
    vb = F.part(('brass', BRASS, {'rust': 0.5}), 'hips', 'rigid', 'vialbrass')
    cap = F.part(('oilskin', '#2a2226'), 'head', 'rigid', 'cap')
    hair = F.part(('hair', spec['hair'], {'c2': (0.65, 0.64, 0.62)}), 'head', 'rigid', 'hair')
    K.shirt(F, b, coat, sleeve=1.85, neck=0.5, hem=-0.6, thick=0.010, fold=0.003)
    K.pants(F, b, trous, bottom=0.9, waist=0.7, thick=0.006, bag=0.006)
    K.boots(F, b, boot, top=0.35, thick=0.01, sole_pid=boot, sole=0.02)
    K.gloves(F, b, glove, cuff=0.8, thick=0.005)
    for sd in 'LR':
        F.shell(brass, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.25), K.limb_point(b, 'forearm.' + sd, 0.85), 0.07 * s), 0.004, 0.012, 0.004)
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(skirt, K.robe_skirt(b, zt, 0.12, xr + 0.02, (yb - yf) / 2 + 0.03, xr + 0.11, (yb - yf) / 2 + 0.08, pleats=8, pleat_amp=0.006, front_open=0.10), 0.03)
    F.paint(lining, S.slab((0, 0, 0), (1, 0, 0), 0.08).inter(S.halfspace((0, yf, 0), (0, 1, 0)), 0).inter(S.slab((0, 0, 0.3), (0, 0, 1), 0.6), 0).inter(S.sphere((0, yf, 0.3), 0.5), 0), only=[skirt])
    for sx in (1, -1):
        F.paint(piping, S.slab((sx * 0.105, 0, 0), (1, 0, 0), 0.008).inter(S.halfspace((0, yf + 0.01, 0), (0, 1, 0)), 0).inter(S.slab((0, 0, 0.45), (0, 0, 1), 0.9), 0).inter(S.sphere((0, yf, 0.45), 0.6), 0), only=[skirt])
    K.stand_collar(F, b, collar, height=0.08, flare=0.02, r0=0.07, open_front=50, th=0.008)
    K.belt(F, b, leather, zt, 0.05 * s, 0.026, t1=0.008)
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        K.strap(F, b, leather, J['S' + sd] + v3(-sx * 0.06, -0.25, 0.04), J['S' + sd] + v3(-sx * 0.06, 0.25, 0.04), 0.03, 0.024, t1=0.012, around=(1, 0, 0))
    vc = v3(-(xr + 0.04), yf + 0.03, zt - 0.10)
    for i in range(3):
        vial(F, vg, vb, vc + v3(0, -0.035 + 0.035 * i, 0), 0.16, 0.014)
    F.solid(vb, S.roundbox(vc + v3(0, 0, 0.03), (0.02, 0.06, 0.012), None, 0.003), 0.002)
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    for sx in (1, -1):
        fc = v3(sx * 0.17 * w, ybk + 0.03, J['neck'][2] + 0.03)
        F.solid(tank, S.sphere(fc, 0.085), 0.0)
        F.solid(tankb, S.torus(fc, 0.086, 0.006, S.rot_euler(0, 90, 0)), 0.002)
        F.solid(tankb, S.cylinder(fc + v3(0, 0, 0.08), fc + v3(0, 0, 0.13), 0.02, 0.004), 0.003)
        F.solid(tankb, S.cylinder(fc + v3(0, 0, -0.13), fc + v3(0, 0, -0.08), 0.022, 0.004), 0.003)
    pipe = [v3(0.0, ybk + 0.06, J['spine1'][2]), v3(0.0, ybk + 0.06, b.p['H'] + 0.22)]
    F.solid(tankb, S.capsule(pipe[0], pipe[1], 0.016), 0.002)
    F.solid(tankb, S.capsule(pipe[1], pipe[1] + v3(0.0, -0.10, 0.0), 0.014), 0.004)
    F.solid(tankb, S.cylinder(pipe[1] + v3(0, -0.1, -0.03), pipe[1] + v3(0, -0.1, 0.0), 0.02, 0.004), 0.003)
    hc, hs = b.hc, b.hs
    K.hair_cap(F, b, hair, thick=0.010, front=0.05, side=0.01, back=-0.05)
    K.bun(F, b, hair, 'back', 0.035)
    K.hair_strands(F, b, hair, 'wisps', n=18, length=0.05, r0=0.006, seed=81)
    F.shell(cap, S.ellipsoid(hc + v3(0, 0.0, 0.05) * hs, (0.12 * hs, 0.13 * hs, 0.08 * hs)).inter(S.halfspace(hc + v3(0, 0, 0.035) * hs, (0, 0, -1)), 0.004), 0.008, 0.022, 0.004, 'cur', K.folds(0.003, (40, 40, 40), 6))
    fr = W.grip_frame(b, 'R')
    ww = F.part(('wood', '#2e2420'), 'hand.R', 'rigid', 'w_wood')
    wb = F.part(('brass', BRASS, {'rust': 0.4}), 'hand.R', 'rigid', 'w_brass')
    wg = F.part(('glass', VIAL, {'glow': '#7aa018'}), 'hand.R', 'rigid', 'w_vial')
    items = [(ww, S.capsule(fr.p(-0.06), fr.p(0.07), 0.016), 0.0, 'add')] + W.crossbow(fr, ww, wb)
    items.append((wg, S.cylinder(fr.p(0.18, -0.06), fr.p(0.28, -0.06), 0.014, 0.004), 0.002, 'add'))
    F.detach('weapon', items)
