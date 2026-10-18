"""13 Folded Theatre — ninja (reference-068) and sorcerer (reference-066)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

PLUM = '#4a1e48'
BLACK = '#1c1a1e'
MAUVE = '#a8889a'
SILVER = '#b8b4ac'


@hero('oath-13-ninja', ref='reference-068', skin='#d4a888', eyes='#2a1c14', hair='#0e0c0e', tris=24000,
      body=dict(H=1.78, sex=0.0, mass=-0.3, muscle=0.6, grip_r=True))
def theatre_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    coat = F.part(('cloth', BLACK), None, 'soft', 'coat')
    plum = F.part(('silk', PLUM), None, 'soft', 'plum')
    tail = F.part(('cloth', BLACK), None, 'skirt', 'tail')
    tailp = F.part(('silk', PLUM), None, 'skirt', 'taillining')
    trim = F.part(('silver', SILVER), None, 'skirt', 'trim')
    collar = F.part(('cloth', '#1a181c'), 'neck', 'rigid', 'collar')
    pants = F.part(('cloth', '#18161a'), None, 'soft', 'pants')
    glove = F.part(('leather', '#141214'), None, 'soft', 'gloves')
    boot = F.part(('leather', '#141214'), None, 'soft', 'boots')
    leather = F.part(('leather', '#2a2428'), None, 'soft', 'belt')
    frL = F.part(('silver', SILVER), 'forearm.L', 'rigid', 'frameL')
    frR = F.part(('silver', SILVER), 'forearm.R', 'rigid', 'frameR')
    glassL = F.part(('glass', '#1a1a2a', {'glow': '#2a1040'}), 'forearm.L', 'rigid', 'glassL')
    mask = F.part(('ivory', '#ece8e0'), 'head', 'rigid', 'mask')
    band = F.part(('leather', '#1a181a'), 'head', 'rigid', 'band')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, coat, sleeve=1.9, neck=0.8, hem=-0.5, thick=0.009, fold=0.003)
    F.paint(plum, S.halfspace(J['spine2'] + v3(0.02, 0, 0), (-0.6, 0, -1)).inter(S.halfspace((0, -0.01, 0), (0, 1, 0)), 0).inter(S.sphere(J['spine1'], 0.32), 0), only=[coat])
    K.pants(F, b, pants, bottom=0.88, waist=0.75, thick=0.006, bag=0.008)
    K.boots(F, b, boot, top=0.65, thick=0.011, sole_pid=boot, sole=0.02)
    K.gloves(F, b, glove, cuff=0.8, thick=0.005)
    zt = J['pelvis'][2] + 0.06 * s
    K.belt(F, b, leather, zt, 0.035, 0.016, t1=0.008)
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    xr = abs(K.body_extent(b, zt, 0, 'right', y=ymid, axis='x'))
    ap = K.apron(F, b, tail, zt, J['KL'][2] - 0.08, 0.10 * w, yf - 0.025, 0.016, 0.4, 0.05).moved((0.07 * w, 0, 0))
    F.solid(tail, ap.inter(S.halfspace(v3(0, 0, J['KL'][2] + 0.1), (0.7, 0, -1)), 0.003), 0.004)
    ap2 = K.apron(F, b, tail, zt, J['KL'][2] - 0.02, 0.13 * w, 2 * ymid - yb - 0.025, 0.016, 0.45, 0.05).mirrored(1, ymid)
    F.solid(tail, ap2.inter(S.halfspace(v3(0, 0, J['KL'][2] + 0.15), (0.6, 0, -1)), 0.003), 0.004)
    F.paint(tailp, S.halfspace(v3(0.04, 0, 0), (-1, 0, 0)).inter(S.sphere(v3(0, ymid, zt - 0.3), 0.5), 0), only=[tail])
    pass
    K.stand_collar(F, b, collar, height=0.11, flare=0.03, r0=0.075, open_front=30, th=0.008)
    for sd, fp in (('L', frL), ('R', frR)):
        a, c = b.bones['forearm.' + sd]
        ax = S.normalize(c - a)
        out = S.normalize(np.cross(ax, (0, -1, 0)))
        if out[2] < 0:
            out = -out
        M = np.stack([S.normalize(np.cross(out, ax)), out, ax], axis=1)
        bc = a + (c - a) * 0.55
        F.solid(fp, S.roundbox(bc, (0.06 * s, 0.06 * s, 0.09 * s), M, 0.006).sub(S.roundbox(bc, (0.05 * s, 0.08, 0.075 * s), M, 0.004), 0.002).sub(S.roundbox(bc, (0.08, 0.05 * s, 0.075 * s), M, 0.004), 0.002), 0.002)
        if sd == 'L':
            F.solid(glassL, S.roundbox(bc + out * 0.055 * s, (0.045 * s, 0.006, 0.072 * s), M, 0.003), 0.0)
    K.pouch(F, leather, K.limb_point(b, 'thigh.L', 0.35) + v3(0.10 * s, -0.01, 0), (0.02, 0.04, 0.06))
    hc, hs = b.hc, b.hs
    F.shell(mask, S.Prim(lambda P: (np.abs(P[..., 0] - hc[0]) / (0.075 * hs) + np.abs(P[..., 2] - (hc[2] + 0.0)) / (0.15 * hs) - 1.0) * 0.06, hc - 0.2, hc + 0.2).inter(S.halfspace(hc + v3(0, -0.03, 0) * hs, (0, 1, 0)), 0.003), 0.004, 0.02, 0.004, 'body')
    F.solid(mask, S.roundcone(hc + v3(0, -0.11, 0.0) * hs, hc + v3(0, -0.14, 0.02) * hs, 0.012 * hs, 0.004), 0.01)
    F.shell(band, S.slab(hc + v3(0, 0, 0.02) * hs, (0, 0, 1), 0.02 * hs).inter(S.sphere(hc, 0.15 * hs), 0), 0.002, 0.01, 0.003, 'body')
    K.hair_cap(F, b, hair, thick=0.012, front=0.05, side=0.01, back=-0.06)
    K.hair_strands(F, b, hair, 'messy', n=100, length=0.075, r0=0.012, seed=131)
    fr = W.grip_frame(b, 'R')
    wl = F.part(('leather', '#1a161a'), 'hand.R', 'rigid', 'w_grip')
    ws = F.part(('silver', SILVER), 'hand.R', 'rigid', 'w_silver')
    wb = F.part(('steel', '#c8c8cc'), 'hand.R', 'rigid', 'w_blade')
    items = W.wrapped_handle(fr, wl, -0.08, 0.06, 0.012, ws, 0.016)
    items.append((ws, S.torus(fr.p(0.04, 0.045), 0.05, 0.004, np.stack([fr.a, fr.e, fr.w], 1)), 0.002, 'add'))
    items.append((ws, S.sphere(fr.p(-0.1), 0.018), 0.003, 'add'))
    items += W.cross_guard(fr, ws, 0.07, 0.04, 0.008)
    items += W.straight_blade(fr, wb, None, 0.075, 0.78, 0.016, 0.004, taper=0.3, double=True)
    F.detach('weapon', items)


@hero('oath-13-sorcerer', ref='reference-066', skin='#e0b49a', eyes='#2a1c14', hair='#0e0c0e', tris=24000,
      body=dict(H=1.72, sex=1.0, mass=-0.2, muscle=0.45, grip_l=True))
def theatre_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    coat = F.part(('cloth', '#3a2232'), None, 'soft', 'coat')
    lac = F.part(('lacquer', MAUVE), None, 'soft', 'lacquer')
    tail = F.part(('cloth', '#4a2a42'), None, 'skirt', 'tail')
    lact = F.part(('lacquer', MAUVE), None, 'skirt', 'lacquertail')
    wingp = F.part(('lacquer', MAUVE), 'spine2', 'rigid', 'collarwings')
    pants = F.part(('cloth', '#2a1c22'), None, 'soft', 'pants')
    boot = F.part(('leather', '#2a1e1c'), None, 'soft', 'boots')
    leather = F.part(('leather', '#3a2a26'), None, 'soft', 'belt')
    silver = F.part(('silver', SILVER), None, 'soft', 'cuffs')
    case = F.part(('silver', SILVER), 'hips', 'rigid', 'spellcase')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')
    K.shirt(F, b, coat, sleeve=1.9, neck=0.8, hem=-0.5, thick=0.009, fold=0.003)
    F.paint(lac, S.halfspace(J['spine2'] + v3(0.0, 0, 0.02), (0.7, 0, -1)).inter(S.halfspace((0, -0.01, 0), (0, 1, 0)), 0).inter(S.sphere(J['spine1'], 0.3), 0).sub(S.halfspace(J['spine1'] + v3(0, 0, -0.06), (0.7, 0, -1)), 0), only=[coat])
    K.pants(F, b, pants, bottom=0.88, waist=0.75, thick=0.006, bag=0.006)
    K.boots(F, b, boot, top=0.55, thick=0.011, sole_pid=boot, sole=0.03)
    K.gloves(F, b, coat, cuff=0.85, thick=0.004, fingerless=True)
    for sd in 'LR':
        for t in (0.6, 0.8):
            K.band(F, b, silver, 'forearm.' + sd, t, 0.03, 0.012, reach=0.07)
        K.band(F, b, silver, 'shin.' + sd, 0.6, 0.014, 0.018, reach=0.09)
    zt = J['pelvis'][2] + 0.06 * s
    K.belt(F, b, leather, zt, 0.04, 0.018, t1=0.008)
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    xr = abs(K.body_extent(b, zt, 0, 'right', y=ymid, axis='x'))
    F.solid(tail, K.apron(F, b, tail, zt, J['KL'][2] - 0.05, 0.08 * w, yf - 0.025, 0.01, 0.4, 0.05).moved((-0.08 * w, 0, 0)).inter(S.halfspace(v3(0, 0, J['KL'][2] + 0.05), (-0.6, 0, -1)), 0.003), 0.004)
    F.solid(lact, K.apron(F, b, lact, zt, J['KL'][2] - 0.12, 0.14 * w, 2 * ymid - yb - 0.025, 0.012, 0.45, 0.07).mirrored(1, ymid).inter(S.halfspace(v3(0, 0, J['KL'][2]), (0.5, 0, -1)), 0.003), 0.004)
    # folded pointed collar wings
    nb = J['neck']
    for sx in (1, -1):
        base = nb + v3(sx * 0.07, 0.02, -0.02)
        tip = base + v3(sx * 0.12, 0.01, 0.17)
        F.solid(wingp, S.roundcone(base, tip, 0.05, 0.003).inter(S.slab(base + v3(0, 0.0, 0), (sx * 0.2, 1, -0.1), 0.012), 0.002), 0.006)
    F.solid(case, S.roundbox(v3(-(xr + 0.03), ymid, zt - 0.09), (0.025, 0.07, 0.085), None, 0.006), 0.003)
    hc, hs = b.hc, b.hs
    K.hair_cap(F, b, hair, thick=0.012, front=0.05, side=0.01, back=-0.08)
    K.hair_strands(F, b, hair, 'swept', n=70, length=0.06, r0=0.011, seed=132)
    for i in range(10):
        p0 = hc + v3(0.02 + 0.005 * i, -0.07 + 0.004 * i, 0.07) * hs
        F.solid(hair, S.chain(S.bezier(p0, p0 + v3(0.04, -0.03, 0.0), p0 + v3(0.065, -0.03, -0.12 + 0.005 * i), 5), [0.011, 0.01, 0.009, 0.007, 0.004], 0.003), 0.005)
    fr = W.grip_frame(b, 'L')
    bc = F.part(('leather', '#3a2232'), 'hand.L', 'rigid', 'w_cover')
    bp = F.part(('ivory', '#e8e2d4'), 'hand.L', 'rigid', 'w_pages')
    bm = F.part(('silver', SILVER), 'hand.L', 'rigid', 'w_corners')
    bf = W.Frame(fr.o + fr.e * 0.0 - b.hand_frames['L']['n'] * 0.0, v3(0, 0, 1), b.hand_frames['L']['n'])
    F.detach('weapon', W.book(bf, bc, bp, bm, size=(0.20, 0.15, 0.045)))
