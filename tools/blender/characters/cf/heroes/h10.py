"""10 Tidal Observatory — ninja (reference-073) and sorcerer (reference-072)."""
import numpy as np
from .. import sdf as S, kit as K, weapons as W
from ..sdf import v3
from . import hero

INDIGO = '#1c1f3a'
IRON = '#2e2e32'
SILVER = '#a8acb8'
VIOLET = '#8a5ad8'


@hero('oath-10-ninja', ref='reference-073', skin='#8a6048', eyes='#1a120c', hair='#141010', tris=28000, arm_out=14,
      body=dict(H=2.15, sex=0.0, mass=0.55, muscle=1.0, width=1.22, shoulder=1.12, head=0.88, grip_r=True, neck_len=0.8))
def obs_ninja(F, b, spec):
    J, s, w = b.J, b.s, b.w
    cloth = F.part(('wool', INDIGO), None, 'soft', 'quilted')
    scarf = F.part(('wool', '#20244a'), None, ('limit', ['neck', 'spine2', 'head']), 'scarf')
    iron = F.part(('iron', IRON, {'rust': 0.2}), None, 'soft', 'armor')
    iron_c = F.part(('iron', IRON, {'rust': 0.2}), 'spine2', 'rigid', 'chest')
    silver = F.part(('silver', SILVER), 'spine2', 'rigid', 'crescentsash')
    cres = F.part(('silver', SILVER), 'upperarm.L', 'rigid', 'crescent')
    tab = F.part(('wool', INDIGO), None, 'skirt', 'tabard')
    tabs = F.part(('silver', SILVER), None, 'skirt', 'tabardsymbol')
    leather = F.part(('leather', '#2a2420'), None, 'soft', 'belt')
    helm = F.part(('iron', '#26262a', {'rust': 0.1}), 'head', 'rigid', 'helm')
    hsil = F.part(('silver', '#8a8e98'), 'head', 'rigid', 'helmtrim')
    slit = F.part(('glow', '#1a1030', {'glow': '#cab8ff'}), 'head', 'rigid', 'slits')
    vio = F.part(('glow', '#200c40', {'glow': VIOLET}), None, 'soft', 'inlay')
    K.shirt(F, b, cloth, sleeve=1.6, neck=0.8, hem=-0.6, thick=0.014, fold=0.004)
    K.pants(F, b, cloth, bottom=0.7, waist=0.7, thick=0.016, bag=0.05)
    F.shell(scarf, K.below_head(b, S.ellipsoid(J['neck'] + v3(0, 0, 0.0), (0.2 * w, 0.17 * s, 0.13 * s)), 0.06), 0.004, 0.035, 0.01, 'cur', K.folds(0.008, (20, 20, 12), 5))
    for sd in 'LR':
        K.pauldron(F, b, iron, sd, size=1.25, layers=3, t2=0.02, gap=0.012)
        F.shell(iron, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.1), K.limb_point(b, 'forearm.' + sd, 0.95), 0.08 * s), 0.01, 0.034, 0.006)
        K.gloves(F, b, iron, cuff=0.9, thick=0.012)
        F.shell(iron, S.capsule(K.limb_point(b, 'shin.' + sd, 0.1), K.limb_point(b, 'shin.' + sd, 0.75), 0.09 * s), 0.01, 0.032, 0.006)
        F.shell(iron, S.ellipsoid(J['K' + sd] + v3(0, -0.06, 0.01), (0.07 * s, 0.06, 0.08 * s)), 0.02, 0.042, 0.006)
        F.shell(iron, S.capsule(K.limb_point(b, 'thigh.' + sd, 0.2) + v3(0, -0.08, 0), K.limb_point(b, 'thigh.' + sd, 0.75) + v3(0, -0.08, 0), 0.08 * s), 0.01, 0.03, 0.006)
        K.band(F, b, leather, 'forearm.' + sd, 0.5, 0.025, 0.04, reach=0.11)
        F.paint(vio, S.capsule(K.limb_point(b, 'forearm.' + sd, 0.35), K.limb_point(b, 'forearm.' + sd, 0.65), 0.012).moved(S.normalize(np.cross(b.bones['forearm.' + sd][1] - b.bones['forearm.' + sd][0], (0, -1, 0))) * (0.11 if sd == 'L' else -0.11)), only=[iron])
    K.boots(F, b, iron, top=0.72, thick=0.02, sole_pid=leather, sole=0.03)
    z2 = J['spine2'][2]
    F.shell(iron_c, S.roundbox((0, -0.2, z2 - 0.02), (0.20 * w, 0.2, 0.15 * s), None, 0.03), 0.014, 0.036, 0.008, 'cur')
    F.shell(iron_c, S.roundbox((0, 0.2, z2 - 0.02), (0.20 * w, 0.2, 0.15 * s), None, 0.03), 0.014, 0.036, 0.008, 'cur')
    # crescent sash plate across the chest (left shoulder -> right ribs)
    cc = J['spine2'] + v3(0.02, -0.0, 0.04)
    cres_mask = S.torus(cc, 0.16 * w, 0.05, S.frame_from_axis((0.0, -1, 0.0))).inter(S.halfspace(cc + v3(0, 0, 0.02), (0.6, 0, 1)), 0.01)
    F.shell(silver, cres_mask, 0.036, 0.05, 0.006, 'cur')
    sc = J['SL'] + v3(0.05, 0.0, 0.1)
    F.solid(cres, S.torus(sc, 0.16, 0.045, S.frame_from_axis((0, 1, 0))).inter(S.halfspace(sc + v3(-0.05, 0, -0.02), (-0.5, 0, -1)), 0.01).inter(S.slab(sc, (0, 1, 0), 0.03), 0.004), 0.008)
    zt = J['pelvis'][2] + 0.06 * s
    K.belt(F, b, leather, zt, 0.07 * s, 0.05, t1=0.025)
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    ymid = (yf + yb) / 2
    for x in (-0.15, 0.15, -0.22, 0.22):
        K.pouch(F, leather, (x * w, K.body_extent(b, zt, x * w, 'front') - 0.05, zt - 0.04), (0.035, 0.025, 0.045))
    F.solid(tab, K.apron(F, b, tab, zt, J['KL'][2] - 0.05, 0.12 * w, yf - 0.06, 0.014, 0.5, 0.03), 0.004)
    F.solid(tab, K.apron(F, b, tab, zt, J['KL'][2] - 0.1, 0.13 * w, 2 * ymid - yb - 0.06, 0.014, 0.5, 0.03).mirrored(1, ymid), 0.004)
    rc = v3(0, yf - 0.07, J['KL'][2] + 0.22)
    F.paint(tabs, S.torus(rc, 0.05, 0.009, S.rot_euler(90, 0, 0)).union(S.capsule(rc + v3(0, 0, 0.06), rc + v3(0, 0, 0.3), 0.009)), only=[tab])
    hc, hs = b.hc, b.hs
    F.solid(helm, S.ellipsoid(hc + v3(0, -0.005, 0.02) * hs, (0.11 * hs, 0.125 * hs, 0.13 * hs)), 0.004)
    F.solid(hsil, S.torus(hc + v3(0, 0.0, -0.01) * hs, 0.112 * hs, 0.009, S.rot_euler(0, 90, 0)), 0.004)
    for sx in (1, -1):
        F.solid(hsil, S.cylinder(hc + v3(sx * 0.10, 0, 0) * hs, hc + v3(sx * 0.13, 0, 0) * hs, 0.03, 0.004), 0.003)
    for k in (-1, 0, 1):
        F.carve(S.roundbox(hc + v3(k * 0.025, -0.13, 0.02) * hs, (0.004, 0.03, 0.03), S.rot_euler(0, k * 12, 0), 0.003), 0.002)
        F.solid(slit, S.roundbox(hc + v3(k * 0.025, -0.115, 0.02) * hs, (0.004, 0.004, 0.028), S.rot_euler(0, k * 12, 0), 0.002), 0.0)
    fr = W.grip_frame(b, 'R')
    wh = F.part(('leather', '#1e1a18'), 'hand.R', 'rigid', 'w_handle')
    wc = F.part(('iron', '#3a3a40'), 'hand.R', 'rigid', 'w_chain')
    wbl = F.part(('iron', '#2a2a30'), 'hand.R', 'rigid', 'w_ball')
    F.detach('weapon', W.flail(fr, wh, wc, wbl, L=0.28, links=5, ball_r=0.075))


@hero('oath-10-sorcerer', ref='reference-072', skin='#b8865e', eyes='#24160e', hair='#3a3634', brow='#2a2624', tris=28000, arm_out=16,
      body=dict(H=1.58, sex=1.0, mass=1.0, muscle=0.35, age=0.6, width=1.08, belly=0.5))
def obs_sorcerer(F, b, spec):
    J, s, w = b.J, b.s, b.w
    robe = F.part(('wool', INDIGO), None, 'soft', 'robe')
    skirt = F.part(('wool', INDIGO), None, 'skirt', 'skirt')
    panel = F.part(('linen', '#ddd6c6'), None, 'skirt', 'panel')
    trim = F.part(('silver', SILVER), None, 'skirt', 'trim')
    sleeve = F.part(('wool', INDIGO), None, 'soft', 'sleeve')
    pants = F.part(('cloth', '#1e1e24'), None, 'soft', 'pants')
    boot = F.part(('leather', '#2a2622'), None, 'soft', 'boots')
    belt = F.part(('silver', SILVER), None, 'soft', 'belt')
    orbp = F.part(('enamel', VIOLET), 'hips', 'rigid', 'beltorb')
    orbr = F.part(('silver', SILVER), 'hips', 'rigid', 'beltorbring')
    hang = F.part(('silver', '#9a9ea8'), None, 'skirt', 'spheres')
    hangv = F.part(('enamel', '#4a2e8a'), None, 'skirt', 'spherebands')
    collar = F.part(('silver', SILVER), 'spine2', 'rigid', 'collar')
    colv = F.part(('enamel', '#5a3aa0'), 'spine2', 'rigid', 'collarband')
    arc = F.part(('silver', SILVER), 'spine2', 'rigid', 'arc')
    arco = F.part(('enamel', VIOLET), 'spine2', 'rigid', 'arcorb')
    hair = F.part(('hair', spec['hair'], {'c2': (0.4, 0.38, 0.36)}), 'head', 'rigid', 'hair')
    K.shirt(F, b, robe, sleeve=1.2, neck=0.4, hem=-0.6, thick=0.016, fold=0.005)
    K.pants(F, b, pants, bottom=0.7, waist=0.7, thick=0.012, bag=0.04)
    K.boots(F, b, boot, top=0.6, thick=0.014, sole_pid=boot, sole=0.02)
    for sd in 'LR':
        K.wide_sleeve(F, b, sleeve, sd, 0.05, 0.12, 0.62, 0.012, hang=0.02)
        a, c = b.bones['forearm.' + sd]
        F.paint(trim, S.sphere(a + (c - a) * 0.62 + v3(0, 0, -0.02), 0.125 * s).sub(S.sphere(a + (c - a) * 0.62, 0.105 * s), 0), only=[sleeve])
        K.band(F, b, belt, 'shin.' + sd, 0.7, 0.016, 0.02, reach=0.1)
    zt = J['pelvis'][2] + 0.08 * s
    yf = K.body_extent(b, zt, 0, 'front'); yb = K.body_extent(b, zt, 0, 'back')
    xr = abs(K.body_extent(b, zt, 0, 'right', y=(yf + yb) / 2, axis='x'))
    zb = 0.26 * b.p['H']
    rx_b, ry_b = xr + 0.20, (yb - yf) / 2 + 0.17
    F.solid(skirt, K.robe_skirt(b, zt, zb, xr + 0.03, (yb - yf) / 2 + 0.04, rx_b, ry_b, pleats=12, pleat_amp=0.008), 0.03)
    F.paint(panel, S.slab((0, 0, 0), (1, 0, 0), 0.14 * w).inter(S.halfspace((0, yf, 0), (0, 1, 0)), 0).inter(S.slab((0, 0, 0.8), (0, 0, 1), 1.2), 0).inter(S.sphere((0, yf, 0.6), 0.7), 0), only=[skirt, robe])
    F.paint(trim, S.slab((0, 0, zb + 0.012), (0, 0, 1), 0.02).inter(S.sphere((0, (yf + yb) / 2, zb), 0.7), 0), only=[skirt])
    K.belt(F, b, belt, zt + 0.02, 0.07 * s, 0.03, t1=0.012)
    oc = v3(0, yf - 0.08, zt + 0.02)
    F.solid(orbp, S.sphere(oc, 0.06), 0.0)
    F.solid(orbr, S.torus(oc, 0.068, 0.009, S.rot_euler(90, 0, 0)), 0.002)
    for i in range(10):
        ang = np.radians(18 + 36 * i)
        p = v3(np.sin(ang) * rx_b * 0.97, (yf + yb) / 2 - np.cos(ang) * ry_b * 0.97, zb - 0.01)
        F.solid(hang, S.capsule(p, p + v3(0, 0, -0.05), 0.006), 0.002)
        sc = p + v3(0, 0, -0.09)
        F.solid(hang, S.sphere(sc, 0.045), 0.003)
        F.solid(hangv, S.torus(sc, 0.046, 0.006, S.frame_from_axis((np.cos(ang), np.sin(ang), 0.3))), 0.002)
    nb = J['neck']
    F.solid(collar, S.ring_band(nb + v3(0, 0.01, 0.03), (0, 0.15, 1), 0.085 * w, 0.06, 0.03), 0.006)
    F.solid(colv, S.ring_band(nb + v3(0, 0.01, 0.03), (0, 0.15, 1), 0.085 * w + 0.016, 0.03, 0.006), 0.002)
    p0 = nb + v3(0.10, 0.08, 0.03)
    pts = S.bezier(p0, p0 + v3(0.06, 0.06, 0.2), p0 + v3(-0.02, 0.0, 0.38), 7)
    F.solid(arc, S.chain(pts, [0.016, 0.018, 0.018, 0.017, 0.016, 0.014, 0.012], 0.004), 0.004)
    F.solid(arco, S.sphere(pts[-1] + v3(-0.02, 0, 0.02), 0.03), 0.003)
    K.hair_cap(F, b, hair, thick=0.012, front=0.05, side=0.01, back=-0.05, fold=0.003)
    K.bun(F, b, hair, 'top', 0.045)
    K.hair_strands(F, b, hair, 'wisps', n=20, length=0.04, r0=0.007, seed=101)
    fr = W.grip_frame(b, 'R')
    fr2 = W.Frame(fr.o, v3(0, 0, 1) * 0.9 + fr.a * 0.1, fr.a)
    sh = F.part(('silver', '#8a8e98'), 'hand.R', 'rigid', 'w_shaft')
    vo = F.part(('enamel', VIOLET), 'hand.R', 'rigid', 'w_orb')
    items = W.staff(fr2, sh, -0.72, 0.62, 0.015, sh, rings=(-0.4, 0.2))
    top = fr2.p(0.75)
    items.append((vo, S.sphere(top, 0.045), 0.0, 'add'))
    items.append((sh, S.torus(top, 0.09, 0.006, fr2.M @ S.rot_euler(60, 0, 0)), 0.002, 'add'))
    items.append((sh, S.torus(top, 0.11, 0.005, fr2.M @ S.rot_euler(0, 70, 20)), 0.002, 'add'))
    F.detach('weapon', items)
