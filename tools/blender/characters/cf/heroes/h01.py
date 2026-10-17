"""01 Kiln Oath — ninja (reference-090) and sorcerer (reference-091)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

SOOT = '#1d1b1a'
TERRA = '#a04a2a'
EMBER = '#ff6a1a'
IRON = '#3d3936'
LEATHER = '#4a3324'
PIPING = '#8e2f1a'


@hero('oath-01-ninja', ref='reference-090', skin='#c99378', eyes='#3a2616', hair='#121010', tris=24000,
      body=dict(H=1.78, sex=0.0, mass=-0.25, muscle=0.75, grip_r=True, shoulder=1.02))
def kiln_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    cloth = F.part(('cloth', SOOT), None, 'soft', 'firecloth')
    cloth2 = F.part(('cloth', '#141312'), None, 'soft', 'wrap')
    mantle = F.part(('cloth', '#242120', {'c2': (0.035, 0.03, 0.028)}), None, ('limit', ['spine1', 'spine2', 'neck', 'shoulder.L', 'shoulder.R']), 'mantle')
    trim = F.part(('cloth', PIPING), None, ('limit', ['spine1', 'spine2', 'neck', 'shoulder.L', 'shoulder.R']), 'trim')
    pip = F.part(('cloth', PIPING), None, 'soft', 'piping')
    leather = F.part(('leather', LEATHER), None, 'soft', 'leather')
    leather_dk = F.part(('leather', '#2a201a'), None, 'soft', 'boot')
    glove = F.part(('leather', '#1b1716'), None, 'soft', 'glove')
    cer1 = F.part(('ceramic', TERRA), 'spine1', 'rigid', 'slat1')
    cer2 = F.part(('ceramic', TERRA), 'spine2', 'rigid', 'slat2')
    cer_l = F.part(('ceramic', TERRA), 'forearm.L', 'rigid', 'block')
    cer_sh = F.part(('ceramic', TERRA), None, 'soft', 'bootplate')
    iron = F.part(('iron', IRON), None, 'soft', 'iron')
    iron_sp = F.part(('iron', IRON), 'spine2', 'rigid', 'buckle')
    iron_h = F.part(('iron', IRON), 'hips', 'rigid', 'beltbuckle')
    iron_fl = F.part(('iron', IRON), 'forearm.L', 'rigid', 'blockframe')
    mask_i = F.part(('iron', '#2e2b29', {'rust': 0.4}), 'head', 'rigid', 'mask')
    mask_c = F.part(('ceramic', '#8c3c22'), 'head', 'rigid', 'maskslat')
    glow = F.part(('glow', '#2a1408', {'glow': EMBER}), 'forearm.L', 'rigid', 'glow')
    hair = F.part(('hair', spec['hair']), 'head', 'rigid', 'hair')

    # --- base garments
    K.shirt(F, b, cloth, sleeve=0.42, neck=0.92, hem=-0.6, thick=0.006, fold=0.002)
    K.pants(F, b, cloth, bottom=0.55, waist=0.75, thick=0.008, bag=0.032, fold=0.004)
    # shin wraps under boots
    F.tight(cloth2, {'shin.L': (0.35, 0.8), 'shin.R': (0.35, 0.8)}, 0.006, K.ridges(0.0015, 260, 'z'))
    K.boots(F, b, leather_dk, top=0.62, thick=0.011, sole_pid=leather_dk, sole=0.016)
    K.gloves(F, b, glove, cuff=0.78, thick=0.004, fingerless=True)
    # --- piping lines down the trouser fronts
    for sx in (1, -1):
        K_ = J['K' + ('L' if sx > 0 else 'R')]
        Hp = J['Hp' + ('L' if sx > 0 else 'R')]
        p0 = Hp + v3(sx * 0.055 * s, -0.06 * s, 0.02 * s)
        p1 = K_ + v3(sx * 0.03 * s, -0.08 * s, 0.05 * s)
        F.paint(pip, S.capsule(p0 + v3(0, -0.03, 0), p1 + v3(0, -0.03, 0), 0.006), only=[cloth])
    # knee bands
    for sd in 'LR':
        K.band(F, b, leather, 'shin.' + sd, 0.10, 0.045, 0.008, reach=0.09)
    # --- ceramic torso slats (front + back), iron side straps
    zs = [J['spine1'][2] - 0.035 * s, J['spine1'][2] + 0.03 * s, J['spine1'][2] + 0.095 * s]
    for i, z in enumerate(zs):
        m = S.slab((0, 0, z), (0, 0, 1), 0.050 * s).inter(S.ellipsoid((0, 0.01, z), (0.30 * w, 0.25 * s, 0.1)), 0)
        F.shell(cer1 if i < 2 else cer2, m, 0.003, 0.017, 0.006, 'cur', K.folds(0.0012, (60, 60, 60), 30 + i))
    for sx in (1, -1):
        m = S.slab((sx * 0.135 * w, 0, 0), (1, 0, 0), 0.03).inter(S.slab((0, 0, (zs[0] + zs[2]) / 2), (0, 0, 1), zs[2] - zs[0] + 0.07 * s), 0).inter(S.sphere((sx * 0.135 * w, 0.0, (zs[0] + zs[2]) / 2), 0.2), 0)
        F.shell(iron, m, 0.012, 0.022, 0.003)
    # --- belt
    zb = J['pelvis'][2] + 0.035 * s
    K.belt(F, b, leather, zb, 0.055 * s, 0.011)
    fb = v3(0, J['pelvis'][1] - 0.12 * s, zb - 0.003)
    F.solid(iron_h, S.roundbox(fb, (0.035, 0.012, 0.026), None, 0.004).sub(S.roundbox(fb + v3(0, -0.012, 0), (0.022, 0.01, 0.014), None, 0.003), 0.002), 0.002)
    # --- diagonal strap: right shoulder -> left hip, with shoulder buckle
    pa = J['SR'] + v3(0.035 * s, 0.0, 0.05 * s)
    pb = J['HpL'] + v3(0.02 * s, 0.0, 0.08 * s)
    K.strap(F, b, leather, pa, pb, 0.042 * s, 0.024, t1=0.012)
    bk = J['SR'] + v3(0.05 * s, -0.085 * s, -0.03 * s)
    F.solid(iron_sp, S.torus(bk, 0.022, 0.0055, S.frame_from_axis((0.25, -1, 0.1))), 0.002)
    # --- asymmetric short mantle over the shoulders (longer on the left), red trim
    mc = J['neck'] + v3(0.0, 0.015 * s, 0.0)
    mmask = S.ellipsoid(mc + v3(0.01, 0, -0.03), (0.25 * w, 0.24 * s, 0.30 * s))
    cut_n = S.normalize((-0.28, 0.0, 1.0))
    hem_p = mc + v3(0, 0, -0.17 * s)
    mmask = mmask.inter(S.halfspace(hem_p, -cut_n), 0.004)
    F.shell(mantle, mmask, 0.010, 0.024, 0.006, 'cur', K.folds(0.004, (22, 22, 14), 33))
    F.paint(trim, S.slab(hem_p + cut_n * 0.012, cut_n, 0.018).inter(S.sphere(mc, 0.36 * w), 0), only=[mantle])
    # --- forearms: right leather bracer, left vented ceramic block
    F.shell(leather, S.capsule(K.limb_point(b, 'forearm.R', 0.25), K.limb_point(b, 'forearm.R', 0.9), 0.06 * s), 0.0, 0.009, 0.004)
    for t in (0.35, 0.75):
        K.band(F, b, iron, 'forearm.R', t, 0.014, 0.014, reach=0.07)
    a, c = b.bones['forearm.L']
    ax = S.normalize(c - a)
    out = S.normalize(np.cross(ax, (0, -1, 0)))
    if out[2] < 0:
        out = -out          # outer/top side of the forearm
    Mb = np.stack([S.normalize(np.cross(out, ax)), out, ax], axis=1)
    bc = a + (c - a) * 0.58 + out * 0.045 * s
    block = S.roundbox(bc, (0.034 * s, 0.032 * s, 0.075 * s), Mb, 0.008)
    F.solid(cer_l, block.displaced(K.folds(0.0012, (70, 70, 70), 41), 0.002), 0.004)
    for i in range(3):
        slot_c = bc + out * 0.030 * s + ax * (i - 1) * 0.038 * s
        F.carve(S.roundbox(slot_c, (0.022 * s, 0.012, 0.010 * s), Mb, 0.004), 0.002)
        F.solid(glow, S.roundbox(slot_c - out * 0.010, (0.020 * s, 0.006, 0.008 * s), Mb, 0.003), 0.0)
    for t in (-0.08, 0.08):
        F.solid(iron_fl, S.roundbox(bc + ax * t * s - out * 0.005, (0.040 * s, 0.036 * s, 0.006), Mb, 0.003), 0.003)
    F.shell(leather, S.capsule(K.limb_point(b, 'forearm.L', 0.2), K.limb_point(b, 'forearm.L', 0.92), 0.06 * s), 0.0, 0.007, 0.004)
    # --- boot ceramic shin plates + toe caps, iron buckles
    for sd, sx in (('L', 1), ('R', -1)):
        A, Kn = J['A' + sd], J['K' + sd]
        pc = Kn + (A - Kn) * 0.80 + v3(0, -0.05 * s, 0)
        F.shell(cer_sh, S.roundbox(pc, (0.045 * s, 0.05, 0.06 * s), None, 0.012), 0.004, 0.016, 0.004)
        tc = J['Toe' + sd] + v3(0, 0.035 * s, 0.025 * s)
        F.shell(cer_sh, S.roundbox(tc, (0.05 * s, 0.035 * s, 0.03 * s), None, 0.012), 0.002, 0.012, 0.004)
        K.band(F, b, iron, 'shin.' + sd, 0.68, 0.016, 0.022, reach=0.09)
    # --- respirator mask
    hc, hs = b.hc, b.hs
    mm = K.face_mask_band(b, -0.112, -0.028).inter(S.halfspace(hc + v3(0, -0.04, 0) * hs, (0, 1, 0)), 0.004)
    F.shell(mask_i, mm, 0.004, 0.015, 0.004, 'cur')
    for i in range(-2, 3):
        F.paint(mask_c, S.slab(hc + v3(i * 0.0085, 0, 0) * hs, (1, 0, 0), 0.0050 * hs).inter(S.slab(hc + v3(0, 0, -0.07) * hs, (0, 0, 1), 0.045 * hs), 0)
                .inter(S.halfspace(hc + v3(0, -0.085, 0) * hs, (0, 1, 0)), 0).inter(S.sphere(hc + v3(0, -0.09, -0.07) * hs, 0.05 * hs), 0), only=[mask_i])
    F.shell(mask_i, S.slab(hc + v3(0, 0, -0.045) * hs, (0, -0.25, 1), 0.012 * hs).inter(S.sphere(hc, 0.14 * hs), 0), 0.0, 0.006, 0.003, 'cur')
    # --- hair: messy black, fringe over the brow
    K.hair_cap(F, b, hair, thick=0.010, front=0.05, side=0.012, back=-0.06)
    K.hair_strands(F, b, hair, 'messy', n=110, length=0.065, r0=0.013, seed=7)
    # --- weapon: ceramic wedge blade in the right hand
    fr = W.grip_frame(b, 'R')
    wl = F.part(('leather', '#2c1f17'), 'hand.R', 'rigid', 'w_wrap')
    wi = F.part(('iron', '#4a4542'), 'hand.R', 'rigid', 'w_iron')
    wc = F.part(('ceramic', '#b0532c'), 'hand.R', 'rigid', 'w_ceramic')
    ws = F.part(('steel', '#9a9894'), 'hand.R', 'rigid', 'w_edge')
    items = W.wrapped_handle(fr, wl, -0.11, 0.065, 0.0155, wi, 0.02)
    items.append((wi, S.torus(fr.p(-0.135), 0.017, 0.0045, S.frame_from_axis(fr.w)), 0.0, 'add'))
    items.append((wi, S.roundbox(fr.p(0.085), (0.032, 0.022, 0.012), fr.M, 0.004), 0.002, 'add'))
    items += W.curved_blade(fr, wc, ws, 0.095, 0.56, 0.058, 0.034, 0.0065, -0.06, edge_frac=0.3, slots=5)
    F.detach('weapon', items)


@hero('oath-01-sorcerer', ref='reference-091', skin='#b27c5e', eyes='#2e2016', hair='#8c8784', brow='#5a5552', tris=26000, arm_out=12,
      body=dict(H=1.58, sex=1.0, mass=0.85, muscle=0.4, age=0.75, width=1.06, chest=1.1, belly=0.4))
def kiln_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    cloth = F.part(('cloth', SOOT), None, 'soft', 'firecloth')
    robe = F.part(('cloth', '#1f1c1b'), None, 'skirt', 'robe')
    cer = F.part(('ceramic', '#9c4426'), None, 'skirt', 'apron')
    cer_bib = F.part(('ceramic', '#9c4426'), 'spine2', 'rigid', 'bib')
    trim = F.part(('iron', '#4a423c', {'rust': 0.5}), None, 'skirt', 'trim')
    leather = F.part(('leather', '#3a2a20'), None, 'soft', 'leather')
    glove = F.part(('leather', '#1e1a18'), None, 'soft', 'glove')
    boot = F.part(('leather', '#2a201a'), None, 'soft', 'boot')
    cer_arm = F.part(('ceramic', '#a04a2a'), None, 'soft', 'bracer')
    cer_boot = F.part(('ceramic', '#a04a2a'), None, 'soft', 'bootplate')
    iron_k = F.part(('iron', '#3a3532', {'rust': 0.8}), 'spine2', 'rigid', 'kiln_iron')
    cer_k = F.part(('ceramic', '#8e3e22', {'c2': (0.30, 0.1, 0.05)}), 'spine2', 'rigid', 'kiln')
    glow = F.part(('glow', '#200c04', {'glow': EMBER}), 'spine2', 'rigid', 'kiln_glow')
    iron_b = F.part(('iron', '#3a3532'), 'hips', 'rigid', 'buckle')
    hair = F.part(('hair', spec['hair'], {'c2': (0.75, 0.73, 0.70)}), 'head', 'rigid', 'hair')

    K.shirt(F, b, cloth, sleeve=1.88, neck=0.55, hem=-0.6, thick=0.010, fold=0.004)
    K.pants(F, b, cloth, bottom=0.62, waist=0.7, thick=0.010, bag=0.045, fold=0.005)
    K.boots(F, b, boot, top=0.6, thick=0.014, sole_pid=boot, sole=0.02)
    K.gloves(F, b, glove, cuff=0.7, thick=0.006)
    zt = J['pelvis'][2] + 0.06 * s
    zb = 0.30 * b.p['H']
    yf = K.body_extent(b, zt, 0, 'front')
    yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    F.solid(robe, K.robe_skirt(b, zt, zb, xr + 0.02, (yb - yf) / 2 + 0.02, xr + 0.10, (yb - yf) / 2 + 0.08, pleats=14, pleat_amp=0.006), 0.03)
    # apron (ceramic plates) hanging in front from the chest
    yfr = yf - 0.035
    ap = K.apron(F, b, cer, zt + 0.02, 0.36 * b.p['H'], 0.17 * w, yfr - 0.02, thick=0.014, curve_r=0.40, flare=0.035)
    F.solid(cer, ap, 0.004)
    ap_in = K.apron(F, b, cer, zt + 0.10, 0.36 * b.p['H'] + 0.018, 0.17 * w - 0.016, yfr - 0.05, thick=0.08, curve_r=0.43, flare=0.035)
    F.paint(trim, ap.rounded(0.008).sub(ap_in, 0.0), only=[cer])
    zc = J['spine2'][2] - 0.02 * s
    ycf = K.body_extent(b, zc, 0, 'front')
    F.shell(cer_bib, S.roundbox((0, ycf - 0.02, zc + 0.01), (0.12 * w, 0.08, 0.10 * s), None, 0.02), 0.012, 0.026, 0.006)
    # belt + buckle, shoulder straps
    K.belt(F, b, leather, zt + 0.01, 0.06 * s, 0.03, t1=0.008)
    F.solid(iron_b, S.roundbox((0, yf - 0.065, zt + 0.01), (0.04, 0.012, 0.03), None, 0.004).sub(S.roundbox((0, yf - 0.078, zt + 0.01), (0.026, 0.01, 0.017), None, 0.003), 0.002), 0.002)
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        K.strap(F, b, leather, J['S' + sd] + v3(-sx * 0.06 * s, -0.12, 0.05), J['S' + sd] + v3(-sx * 0.06 * s, 0.2, 0.05), 0.045 * s, 0.022, t1=0.008, around=(1, 0, 0))
    # ceramic bracers + boot plates
    for sd in 'LR':
        F.shell(cer_arm, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.3), K.limb_point(b, 'forearm.' + sd, 0.85), 0.07 * s), 0.006, 0.022, 0.005)
        for t in (0.32, 0.82):
            K.band(F, b, leather, 'forearm.' + sd, t, 0.016, 0.026, reach=0.08)
        A = J['A' + sd]
        F.shell(cer_boot, S.roundbox(J['Toe' + sd] + v3(0, 0.04 * s, 0.03), (0.06 * s, 0.045 * s, 0.035), None, 0.015), 0.004, 0.016, 0.004)
        F.shell(cer_boot, S.roundbox(A + v3(0, -0.04, 0.09 * s), (0.055 * s, 0.05, 0.06 * s), None, 0.015), 0.004, 0.016, 0.004)
        K.band(F, b, leather, 'shin.' + sd, 0.68, 0.02, 0.026, reach=0.1)
    # back kiln with vented door + chimney
    ybk = K.body_extent(b, J['spine2'][2], 0, 'back')
    kc = v3(0, ybk + 0.13, J['spine2'][2] - 0.02 * s)
    F.solid(cer_k, S.roundbox(kc, (0.15 * w, 0.11, 0.17 * s), None, 0.012).displaced(K.folds(0.002, (40, 40, 40), 51), 0.003), 0.0)
    for zz in (-0.15, 0.15):
        F.solid(iron_k, S.roundbox(kc + v3(0, 0, zz * s), (0.158 * w, 0.118, 0.014), None, 0.004), 0.002)
    door = kc + v3(0, 0.11, -0.02)
    F.solid(iron_k, S.roundbox(door, (0.085, 0.014, 0.075), None, 0.006), 0.002)
    for i in range(-1, 2):
        F.carve(S.roundbox(door + v3(i * 0.03, 0.014, 0), (0.008, 0.02, 0.05), None, 0.004), 0.002)
        F.solid(glow, S.roundbox(door + v3(i * 0.03, 0.002, 0), (0.008, 0.004, 0.05), None, 0.003), 0.0)
    ch_top = b.p['H'] + 0.24
    cz0 = kc[2] + 0.17 * s
    F.solid(cer_k, S.roundbox(v3(0.03, kc[1] + 0.01, (cz0 + ch_top) / 2), (0.06, 0.06, (ch_top - cz0) / 2), None, 0.008).displaced(K.folds(0.002, (40, 40, 40), 52), 0.003), 0.004)
    F.solid(iron_k, S.roundbox(v3(0.03, kc[1] + 0.01, ch_top), (0.075, 0.075, 0.02), None, 0.005), 0.003)
    F.solid(iron_k, S.roundbox(v3(0.03, kc[1] + 0.01, cz0 + 0.12), (0.068, 0.068, 0.012), None, 0.004), 0.003)
    for sx in (1, -1):
        F.solid(cer_k, S.roundbox(v3(sx * 0.14 * w, kc[1] - 0.01, kc[2] + 0.17 * s + 0.07), (0.035, 0.05, 0.08), None, 0.008), 0.004)
    # hair: grey curls pulled into a bun
    K.hair_cap(F, b, hair, thick=0.012, front=0.055, side=0.015, back=-0.05, fold=0.003)
    K.hair_strands(F, b, hair, 'wisps', n=40, length=0.04, r0=0.009, seed=3)
    K.bun(F, b, hair, 'top', 0.042)
    # weapon: kiln focus cannon
    fr = W.grip_frame(b, 'R')
    c1 = F.part(('ceramic', '#a8502c'), 'hand.R', 'rigid', 'w_cer')
    c2 = F.part(('iron', '#3c3835'), 'hand.R', 'rigid', 'w_iron')
    c3 = F.part(('glow', '#200c04', {'glow': EMBER}), 'hand.R', 'rigid', 'w_glow')
    F.detach('weapon', W.cannon(fr, c2, c1, c3, L=0.42, r=0.05) + [(c1, S.capsule(fr.p(-0.06), fr.p(0.06), 0.017), 0.0, 'add')])
