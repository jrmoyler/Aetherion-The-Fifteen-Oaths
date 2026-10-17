"""14 Escapement Road — ninja (reference-065) and sorcerer (reference-064)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

TEAL = '#1e3a40'
BRASS = '#b8904a'
IVORY = '#e8dcc0'
GRAPH = '#262626'


def gear(F, pid, c, axis, R, th=0.012, teeth=14):
    M = S.frame_from_axis(axis)
    cf = c.astype(np.float32)
    Mf = M.astype(np.float32)

    def fn(P):
        q = (P - cf) @ Mf
        r = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2)
        ang = np.arctan2(q[..., 1], q[..., 0])
        rr = R + 0.006 * (np.sin(ang * teeth) > 0.2)
        d = np.maximum(r - rr, np.abs(q[..., 2]) - th / 2)
        d = np.maximum(d, -(np.abs(r - R * 0.55) - R * 0.25) * (np.cos(ang * 5) > 0.3))
        return d
    F.solid(pid, S.Prim(fn, c - R - 0.02, c + R + 0.02), 0.002)


@hero('oath-14-ninja', ref='reference-065', skin='#5a3a28', eyes='#1a100a', hair='#0e0a08', tris=25000,
      body=dict(H=1.80, sex=0.0, mass=-0.05, muscle=0.85, grip_r=True))
def esc_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    under = F.part(('leather', GRAPH), None, 'soft', 'undersuit')
    vest = F.part(('cloth', TEAL, {'c2': (0.05, 0.13, 0.15)}), None, 'soft', 'vest')
    tab = F.part(('cloth', TEAL, {'c2': (0.05, 0.13, 0.15)}), None, 'skirt', 'tabard')
    btrim = F.part(('brass', BRASS), None, 'skirt', 'trim')
    sleeve = F.part(('leather', '#1e1e1e'), None, 'soft', 'armsleeves')
    pants = F.part(('leather', '#222222'), None, 'soft', 'pants')
    leather = F.part(('leather', '#3a2a1e'), None, 'soft', 'belt')
    brass = F.part(('brass', BRASS), None, 'soft', 'brass')
    fly = F.part(('brass', BRASS), 'hips', 'rigid', 'flywheel')
    flyg = F.part(('glow', '#3a2008', {'glow': '#ffd88a'}), 'hips', 'rigid', 'flyglow')
    strut = F.part(('brass', BRASS), 'shin.L', 'rigid', 'strutL')
    strut2 = F.part(('brass', BRASS), 'shin.R', 'rigid', 'strutR')
    boot = F.part(('leather', '#1e1c1a'), None, 'soft', 'boots')
    gog = F.part(('brass', BRASS), 'head', 'rigid', 'visor')
    gogl = F.part(('glow', '#3a2008', {'glow': '#ffb040'}), 'head', 'rigid', 'visorglow')
    collar = F.part(('cloth', TEAL), 'neck', 'rigid', 'collar')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, under, sleeve=0.0, neck=0.9, hem=-0.4, thick=0.004)
    F.tight(vest, dict(K.torso_cover(0.0, 0.2), **{'shoulder.L': (None, 0.8), 'shoulder.R': (None, 0.8)}), 0.012, K.folds(0.002, (25, 25, 12), 4))
    F.tight(sleeve, {'upperarm.L': (0.55, None), 'upperarm.R': (0.55, None), 'forearm.L': (None, None), 'forearm.R': (None, None), 'hand.L': (None, 0.6), 'hand.R': (None, 0.6)}, 0.006, K.ridges(0.0012, 120, 'z'))
    K.pants(F, b, pants, bottom=0.82, waist=0.75, thick=0.008, bag=0.02)
    K.boots(F, b, boot, top=0.75, thick=0.012, sole_pid=brass, sole=0.02)
    K.stand_collar(F, b, collar, height=0.08, flare=0.02, r0=0.072, open_front=35, th=0.01)
    for sd in 'LR':
        a, c = b.bones['forearm.' + sd]
        ax = S.normalize(c - a)
        out = S.normalize(np.cross(ax, (0, -1, 0)))
        if out[2] < 0:
            out = -out
        F.solid(brass, S.roundbox(a + (c - a) * 0.55 + out * 0.045 * s, (0.01, 0.008, 0.06), np.stack([S.normalize(np.cross(out, ax)), out, ax], 1), 0.004), 0.003)
        F.paint(flyg, S.capsule(a + (c - a) * 0.45 + out * 0.055 * s, a + (c - a) * 0.65 + out * 0.055 * s, 0.006), only=[brass])
        K.pouch(F, leather, K.limb_point(b, 'thigh.' + sd, 0.5) + v3((1 if sd == 'L' else -1) * 0.10 * s, 0, 0), (0.022, 0.045, 0.06))
    zt = J['pelvis'][2] + 0.06 * s
    K.belt(F, b, leather, zt, 0.05, 0.022, t1=0.008)
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    xr = abs(K.body_extent(b, zt, 0, 'right', y=ymid, axis='x'))
    F.solid(tab, K.apron(F, b, tab, zt, J['KL'][2] + 0.0, 0.11 * w, yf - 0.03, 0.01, 0.4, 0.03).inter(S.halfspace(v3(0, 0, J['KL'][2] + 0.12), (-0.5, 0, -1)), 0.003), 0.004)
    F.solid(tab, K.apron(F, b, tab, zt, J['KL'][2] + 0.0, 0.12 * w, 2 * ymid - yb - 0.03, 0.01, 0.4, 0.03).mirrored(1, ymid).inter(S.halfspace(v3(0, 0, J['KL'][2] + 0.12), (0.5, 0, -1)), 0.003), 0.004)
    F.paint(btrim, S.Prim(lambda P: 0.006 - np.abs(np.abs(P[..., 0]) - 0.11 * w - 0.03 * np.clip((zt - P[..., 2]) / 0.4, 0, 1)), (-0.4, -0.5, 0.2), (0.4, 0.5, 1.3)), only=[tab])
    fc = v3(xr + 0.03, yf + 0.01, zt - 0.06)
    gear(F, fly, fc, (1, -0.3, 0), 0.09, 0.016, 20)
    gear(F, fly, fc + v3(0.015, -0.005, 0.0), (1, -0.3, 0), 0.05, 0.012, 12)
    F.solid(flyg, S.sphere(fc + v3(0.025, -0.008, 0), 0.02), 0.0)
    for sd, sp in (('L', strut), ('R', strut2)):
        sx = 1 if sd == 'L' else -1
        A = J['A' + sd]
        p0 = A + v3(sx * 0.055, 0.0, 0.0)
        p1 = A + v3(sx * 0.06, 0.0, 0.2)
        F.solid(sp, S.capsule(p0, p1, 0.009), 0.002)
        for p in (p0, p1):
            F.solid(sp, S.cylinder(p + v3(-sx * 0.005, 0, 0), p + v3(sx * 0.015, 0, 0), 0.02, 0.003), 0.002)
    hc, hs = b.hc, b.hs
    vm = S.slab(hc + v3(0, 0, 0.012) * hs, (0, 0, 1), 0.034 * hs).inter(S.sphere(hc, 0.16 * hs), 0)
    F.shell(gog, vm, 0.004, 0.02, 0.004, 'body')
    for k in (-1, 0, 1):
        F.paint(gogl, S.slab(hc + v3(0, 0, 0.012 + k * 0.011) * hs, (0, 0, 1), 0.004 * hs).inter(S.halfspace(hc + v3(0, -0.07, 0) * hs, (0, 1, 0)), 0).inter(S.sphere(hc, 0.2), 0), only=[gog])
    K.hair_cap(F, b, hair, thick=0.014, front=0.06, side=0.0, back=-0.05, fold=0.004)
    K.hair_strands(F, b, hair, 'top', n=70, length=0.03, r0=0.012, seed=141)
    fr = W.grip_frame(b, 'R')
    sh = F.part(('wood', '#2a2420'), 'hand.R', 'rigid', 'w_shaft')
    br = F.part(('brass', BRASS), 'hand.R', 'rigid', 'w_brass')
    bl = F.part(('steel', '#b0aea8'), 'hand.R', 'rigid', 'w_blade')
    ed = F.part(('glow', '#3a2008', {'glow': '#ffd88a'}), 'hand.R', 'rigid', 'w_edge')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.85 + fr.a * 0.15, fr.a)
    items = W.scythe(fr2, sh, bl, ed, L=0.85)
    gear_items = [(br, S.torus(fr2.p(0.83), 0.05, 0.01, fr2.M @ S.rot_euler(90, 0, 0)), 0.002, 'add'), (br, S.cylinder(fr2.p(-0.02), fr2.p(0.02), 0.022, 0.003), 0.002, 'add')]
    F.detach('weapon', items + gear_items)


@hero('oath-14-sorcerer', ref='reference-064', skin='#d8aa88', eyes='#2a1a10', hair='#1a1210', tris=27000, arm_out=10,
      body=dict(H=1.68, sex=1.0, mass=-0.05, muscle=0.45))
def esc_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    coat = F.part(('cloth', TEAL, {'c2': (0.05, 0.13, 0.15)}), None, 'soft', 'coat')
    tail = F.part(('cloth', TEAL, {'c2': (0.05, 0.13, 0.15)}), None, 'skirt', 'coattail')
    ivory = F.part(('linen', IVORY), None, 'skirt', 'ivorypanel')
    ivc = F.part(('linen', IVORY), None, 'soft', 'ivorycollar')
    btrim = F.part(('brass', BRASS), None, 'skirt', 'trim')
    pants = F.part(('cloth', '#2a2a28'), None, 'soft', 'pants')
    boot = F.part(('leather', '#2a201a'), None, 'soft', 'boots')
    leather = F.part(('leather', '#3a2a1e'), None, 'soft', 'belt')
    brass = F.part(('brass', BRASS), None, 'soft', 'brassbands')
    escL = F.part(('brass', BRASS), 'forearm.L', 'rigid', 'escL')
    escR = F.part(('brass', BRASS), 'forearm.R', 'rigid', 'escR')
    glassL = F.part(('glass', '#3a3a38', {'glow': '#2a2010'}), 'forearm.L', 'rigid', 'glassL')
    glassR = F.part(('glass', '#3a3a38', {'glow': '#2a2010'}), 'forearm.R', 'rigid', 'glassR')
    harn = F.part(('brass', BRASS), 'spine2', 'rigid', 'pendulum')
    case = F.part(('brass', BRASS), 'hips', 'rigid', 'case')
    glove = F.part(('leather', '#1e1a18'), None, 'soft', 'gloves')
    collar = F.part(('cloth', TEAL), 'neck', 'rigid', 'collar')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, coat, sleeve=1.85, neck=0.6, hem=-0.6, thick=0.010, fold=0.003)
    F.paint(ivc, S.halfspace(J['spine2'] + v3(-0.02, 0, 0), (0.6, 0, -1)).inter(S.halfspace((0, -0.02, 0), (0, 1, 0)), 0).inter(S.sphere(J['spine2'] + v3(-0.04, -0.08, 0.05), 0.09), 0), only=[coat])
    K.pants(F, b, pants, bottom=0.62, waist=0.75, thick=0.01, bag=0.03)
    K.boots(F, b, boot, top=0.62, thick=0.013, sole_pid=boot, sole=0.03)
    K.gloves(F, b, glove, cuff=0.9, thick=0.005, fingerless=True)
    zt = J['pelvis'][2] + 0.06 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    xr = abs(K.body_extent(b, zt, 0, 'right', y=ymid, axis='x'))
    F.solid(tail, K.robe_skirt(b, zt, J['KL'][2] - 0.05, xr + 0.025, (yb - yf) / 2 + 0.03, xr + 0.09, (yb - yf) / 2 + 0.08, pleats=8, pleat_amp=0.006, front_open=0.10).inter(S.halfspace(v3(0, 0, J['KL'][2] + 0.1), (0.4, 0, -1)), 0.004), 0.03)
    F.solid(ivory, K.apron(F, b, ivory, zt, J['KL'][2] - 0.12, 0.10 * w, yf - 0.015, 0.008, 0.4, 0.04), 0.003)
    F.paint(btrim, S.slab((0, 0, 0), (1, 0, 0), 0.01).inter(S.halfspace((0, yf + 0.01, 0), (0, 1, 0)), 0).inter(S.sphere((0, yf, zt), 0.7), 0).moved((0.09 * w, 0, 0)), only=[tail, coat])
    K.stand_collar(F, b, collar, height=0.09, flare=0.035, r0=0.072, open_front=45, th=0.008)
    K.belt(F, b, leather, zt, 0.05, 0.022, t1=0.008)
    F.solid(case, S.roundbox(v3(0.13 * w, yf - 0.03, zt - 0.08), (0.04, 0.02, 0.055), None, 0.005), 0.003)
    for sd, ep, gp in (('L', escL, glassL), ('R', escR, glassR)):
        a, c = b.bones['forearm.' + sd]
        p0, p1 = a + (c - a) * 0.3, a + (c - a) * 0.85
        F.solid(gp, S.cylinder(p0, p1, 0.085 * s, 0.006), 0.0)
        for t in (0.0, 0.33, 0.66, 1.0):
            p = p0 + (p1 - p0) * t
            F.solid(ep, S.cylinder(p - S.normalize(c - a) * 0.012, p + S.normalize(c - a) * 0.012, 0.095 * s, 0.004), 0.002)
        gear(F, ep, (p0 + p1) / 2, c - a, 0.05 * s, 0.01, 12)
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    hub = v3(0.0, ybk + 0.04, J['spine2'][2] + 0.02)
    gear(F, harn, hub, (0, 1, 0), 0.06, 0.016, 14)
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        F.solid(harn, S.capsule(hub, J['S' + sd] + v3(-sx * 0.05, 0.08, 0.04), 0.01), 0.003)
    p_end = hub + v3(-0.20, 0.06, -0.48)
    F.solid(harn, S.capsule(hub + v3(-0.03, 0.02, -0.02), p_end, 0.011), 0.003)
    F.solid(harn, S.sphere(p_end + v3(0, 0, -0.04), 0.06), 0.003)
    F.solid(harn, S.sphere(p_end + v3(0, 0, -0.105), 0.014), 0.003)
    K.hair_cap(F, b, hair, thick=0.010, front=0.055, side=0.012, back=-0.05)
    K.bun(F, b, hair, 'top', 0.045)
    K.hair_strands(F, b, hair, 'wisps', n=24, length=0.06, r0=0.007, seed=142)
    fr = W.grip_frame(b, 'R')
    rp = F.part(('brass', BRASS), 'hand.R', 'rigid', 'w_ring')
    rg = F.part(('glow', '#3a2008', {'glow': '#ffd88a'}), 'hand.R', 'rigid', 'w_glow')
    F.detach('weapon', W.ring_weapon(W.Frame(fr.o + fr.a * 0.12, fr.e, fr.a), rp, 0.0, 0.12, 0.012, rg) + [(rp, S.capsule(fr.p(-0.05), fr.p(0.06), 0.014), 0.0, 'add')])
