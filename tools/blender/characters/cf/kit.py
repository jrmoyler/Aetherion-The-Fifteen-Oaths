"""Reusable garment / armour / hair builders operating on a Forge + Body."""
import math
import numpy as np
from . import sdf as S
from .sdf import v3, normalize


def folds(amp, freq=(28, 28, 9), seed=0, octaves=2):
    f = np.asarray(freq, dtype=np.float32)

    def fn(P):
        return amp * S.fbm(P * f, 1.0, octaves, seed)
    return fn


def ridges(amp, axis_freq, along='z', noise=0.4, seed=0):
    """Horizontal compression folds (sleeves/trousers): sin bands along an axis, broken by noise."""
    ax = {'x': 0, 'y': 1, 'z': 2}[along]

    def fn(P):
        n = S.vnoise(P * np.float32(14), 1.0, seed)
        return amp * (np.sin(P[..., ax] * axis_freq + n * 3.0) * (0.6 + noise * n))
    return fn


def add_noise(*fns):
    def fn(P):
        out = 0
        for f in fns:
            out = out + f(P)
        return out
    return fn


def sleeve_cover(sleeve):
    """sleeve in [0,2]: 0..1 along upper arm, 1..2 along forearm."""
    cov = {}
    for s in 'LR':
        cov['shoulder.' + s] = (None, None)
        if sleeve <= 0:
            continue
        if sleeve <= 1:
            cov['upperarm.' + s] = (None, sleeve)
        else:
            cov['upperarm.' + s] = (None, None)
            cov['forearm.' + s] = (None, sleeve - 1)
    return cov


def torso_cover(neck=0.35, hem=0.0):
    """neck: fraction up the neck bone covered (collar). hem: fraction of the hips bone where garment ends (0 = pelvis,
    negative values extend down over the buttocks/thigh tops)."""
    cov = {'spine': (None, None), 'spine1': (None, None), 'spine2': (None, None), 'hips': (hem, None)}
    if neck > 0:
        cov['neck'] = (None, neck)
    return cov


def shirt(F, b, pid, sleeve=0.45, neck=0.4, hem=0.0, thick=0.006, fold=0.0025, seed=1, thigh=None):
    cov = torso_cover(neck, hem)
    cov.update(sleeve_cover(sleeve))
    if thigh is not None:
        for s in 'LR':
            cov['thigh.' + s] = (None, thigh)
    F.tight(pid, cov, thick, add_noise(folds(fold, (30, 30, 12), seed), ridges(fold * 0.15, 160, 'z', seed=seed)))


def pants(F, b, pid, bottom=0.85, waist=0.55, thick=0.008, bag=0.025, bag_z=None, fold=0.004, seed=2):
    """Trousers. bag adds volume peaking around the knee (jodhpur/hakama silhouette)."""
    cov = {'hips': (None, waist)}
    for s in 'LR':
        cov['thigh.' + s] = (None, None)
        cov['shin.' + s] = (None, bottom)
    zk = b.J['KL'][2]
    zc = bag_z if bag_z is not None else zk + 0.12 * b.s
    za = b.J['AL'][2]
    zh = b.J['HpL'][2]

    def th(P):
        z = P[..., 2]
        prof = np.exp(-((z - zc) / (0.22 * b.s)) ** 2)
        taper = np.clip((z - (za + 0.05 * b.s)) / (0.25 * b.s), 0, 1)
        crotch = np.clip((zh - z) / 0.08, 0, 1)
        return thick + bag * prof * taper * (0.4 + 0.6 * crotch)
    F.tight(pid, cov, th, add_noise(folds(fold, (16, 16, 7), seed), ridges(fold * 0.18, 90, 'z', seed=seed)))


def boots(F, b, pid, top=0.45, thick=0.010, sole_pid=None, sole=0.018, toe_cap=None):
    cov = {}
    for s in 'LR':
        cov['shin.' + s] = (top, None)
        cov['foot.' + s] = (None, None)
        cov['toe.' + s] = (None, None)

    def th(P):
        z = P[..., 2]
        return thick + sole * np.clip((0.045 * b.s - z) / (0.03 * b.s), 0, 1)
    F.tight(pid, cov, th, folds(0.0015, (40, 40, 40), 5))
    if sole_pid is not None:
        for s in 'LR':
            A, Ball, Toe = b.J['A' + s], b.J['Ball' + s], b.J['Toe' + s]
            heel = A + v3(0, 0.03 * b.s, 0)
            box = S.roundbox(((heel + Toe) / 2)[:2].tolist() + [0.006], (0.050 * b.s, abs(Toe[1] - heel[1]) / 2 + 0.02 * b.s, 0.014), r=0.012)
            F.shell(sole_pid, box, -0.03, 0.004, 0.003)


def gloves(F, b, pid, cuff=0.85, thick=0.004, fingerless=False):
    cov = {}
    for s in 'LR':
        cov['forearm.' + s] = (cuff, None)
        cov['hand.' + s] = (None, 0.62 if fingerless else None)
    F.tight(pid, cov, thick, folds(0.001, (60, 60, 60), 9))


def belt(F, b, pid, z, width=0.05, thick=0.010, t1=-0.002, tilt=4.0, k=0.003):
    """Band hugging the current surface at height z (tilted down at the front by `tilt` deg)."""
    n = normalize((0, -math.sin(math.radians(tilt)), math.cos(math.radians(tilt))))
    mask = S.slab((0, 0, z), n, width).inter(S.ellipsoid((0, 0.0, z), (0.4 * b.w, 0.3 * b.s, 0.2)), 0)
    F.shell(pid, mask, t1, thick, k)


def band(F, b, pid, bone, t, width, thick=0.008, t1=-0.002, reach=0.11, tilt=None):
    """Ring band around a limb at fraction t along `bone`."""
    a, c = b.bones[bone]
    ax = normalize(c - a)
    p = a + (c - a) * t
    mask = S.slab(p, ax, width).inter(S.sphere(p, reach * b.s), 0)
    F.shell(pid, mask, t1, thick, 0.003)


def strap(F, b, pid, p0, p1, width=0.045, thick=0.006, t1=-0.002, around=(0, 1, 0), reach=None):
    """Band over the current surface along the line p0->p1 (wraps front and back like a sash)."""
    p0, p1 = v3(p0), v3(p1)
    d = normalize(p1 - p0)
    n = normalize(np.cross(d, normalize(around)))
    L = float(np.linalg.norm(p1 - p0))
    mask = S.slab(p0, n, width).inter(S.slab((p0 + p1) / 2, d, L), 0)
    r = reach or (L / 2 + 0.06)
    mask = mask.inter(S.sphere((p0 + p1) / 2, r), 0)
    F.shell(pid, mask, t1, thick, 0.003)


def plate(F, pid, center, half, M=None, t1=0.0, t2=0.012, r=0.01, k=0.004, base='cur', noise=None):
    F.shell(pid, S.roundbox(center, half, M, r), t1, t2, k, base, noise)


def hairline_mask(b, front=0.045, side=0.008, back=-0.055, ear_cut=True, pad=0.06):
    hc = b.hc
    hs = b.hs
    c = hc.astype(np.float32)

    def fn(P):
        q = P - c
        ang = np.arctan2(q[..., 0], -q[..., 1])  # 0 = front
        ca = np.cos(ang)
        zl = np.where(ca > 0, side + (front - side) * ca, side + (side - back) * ca)
        zl = zl * hs
        d = zl - q[..., 2]
        if ear_cut:
            # clear around the ears
            ex = np.abs(q[..., 0]) - 0.060 * hs
            ear = np.sqrt((q[..., 1] - 0.006 * hs) ** 2 + (q[..., 2] + 0.004 * hs) ** 2) - 0.03 * hs
            d = np.maximum(d, -np.maximum(-ex, ear))
        return d
    r = 0.16 * hs
    return S.Prim(fn, hc - r - pad, hc + r + pad)


def hair_cap(F, b, pid, thick=0.009, front=0.045, side=0.008, back=-0.055, fold=0.002):
    m = hairline_mask(b, front, side, back)
    F.shell(pid, m.inter(S.sphere(b.hc, 0.16 * b.hs), 0), -0.004, thick, 0.004, 'body', folds(fold, (90, 90, 90), 7))


def _scalp_points(b, n, zmin=0.0, seed=3, front_cut=None):
    rng = np.random.default_rng(seed)
    hs = b.hs
    pts = []
    gold = math.pi * (3 - math.sqrt(5))
    for i in range(n * 3):
        z = 1 - (i + 0.5) / (n * 3)
        r = math.sqrt(max(0, 1 - z * z))
        th = gold * i
        d = np.array([math.cos(th) * r, math.sin(th) * r, z])
        if d[2] < zmin:
            continue
        if front_cut is not None and d[1] < -0.55 and d[2] < front_cut:
            continue
        p = b.hc + np.array([0.0, 0.006 * hs, 0.03 * hs]) + d * np.array([0.074, 0.1, 0.09]) * hs
        pts.append((p, d))
    idx = rng.permutation(len(pts))[:n]
    return [pts[i] for i in idx], rng


def hair_strands(F, b, pid, style='messy', n=70, length=0.07, r0=0.010, seed=4, k=0.005):
    """Clumped strands rooted on the scalp. style: messy | swept | fringe | spiky | wisps"""
    hs = b.hs
    pts, rng = _scalp_points(b, n, -0.15 if style != 'top' else 0.35, seed)
    prims = []
    for p, d in pts:
        L = length * hs * (0.7 + 0.6 * rng.random())
        down = np.array([0, 0.25, -1.0])
        if style == 'messy':
            flow = normalize(d * 0.35 + np.array([0, -0.25 if d[1] < 0 else 0.25, -0.65]) + rng.normal(0, 0.28, 3))
        elif style == 'swept':
            flow = normalize(d * 0.4 + np.array([0, 0.9, -0.3]) + rng.normal(0, 0.15, 3))
        elif style == 'spiky':
            flow = normalize(d * 1.2 + np.array([0, 0.2, 0.3]) + rng.normal(0, 0.25, 3))
        elif style == 'top':
            flow = normalize(d * 0.5 + np.array([0, 0.3, 0.6]) + rng.normal(0, 0.2, 3))
        else:  # wisps / fringe
            flow = normalize(d * 0.3 + down + rng.normal(0, 0.3, 3))
        if d[1] < -0.3 and d[2] < 0.75 and style in ('messy', 'fringe'):
            flow = normalize(np.array([rng.normal(0, 0.5), -0.45, -1.0]))
            L *= 0.5
        p0 = p - d * 0.004
        p1 = p0 + d * L * 0.30 + flow * L * 0.25
        p2 = p1 + flow * L * 0.75 + rng.normal(0, 0.006, 3)
        chainp = S.bezier(p0, p1, p2, 5)
        rr = r0 * hs * (0.7 + 0.5 * rng.random())
        prims.append(S.chain(chainp, [rr, rr * 0.9, rr * 0.72, rr * 0.5, rr * 0.3], 0.003))
    for pr in prims:
        F.solid(pid, pr, k)


def bun(F, b, pid, pos='back', size=0.045, wisps=10, seed=8):
    hs = b.hs
    if pos == 'back':
        c = b.hc + v3(0, 0.085, 0.07) * hs
    else:
        c = b.hc + v3(0, 0.02, 0.125) * hs
    F.solid(pid, S.ellipsoid(c, (size * hs, size * 0.85 * hs, size * 0.8 * hs)).displaced(folds(0.003, (120, 120, 120), seed), 0.004), 0.012)
    F.solid(pid, S.torus(c + v3(0, -0.005, -0.01) * hs, size * 0.75 * hs, 0.012 * hs, S.rot_euler(30 if pos == 'back' else 0, 0, 0)), 0.006)


def ponytail(F, b, pid, length=0.30, r=0.022, seed=9, high=True):
    hs = b.hs
    root = b.hc + v3(0, 0.07, 0.10 if high else 0.02) * hs
    p1 = root + v3(0, 0.07, 0.02) * hs
    p2 = root + v3(0, 0.10, -length * 0.5)
    p3 = root + v3(0, 0.09, -length)
    pts = S.bezier(root, p1, p2, 4) + [p3]
    F.solid(pid, S.chain(pts, [r * hs, r * hs * 1.1, r * 0.95 * hs, r * 0.7 * hs, r * 0.25 * hs], 0.006).displaced(folds(0.003, (90, 90, 40), seed), 0.004), 0.008)
    F.solid(pid, S.torus(root + v3(0, 0.012, 0.0), r * hs * 0.85, 0.005, S.frame_from_axis(p1 - root)), 0.0)


def face_mask_band(b, z0, z1):
    """Mask selecting the lower face (for respirators / face wraps)."""
    hc = b.hc
    hs = b.hs
    return S.ellipsoid(hc + v3(0, -0.05, (z0 + z1) / 2) * hs, (0.085 * hs, 0.09 * hs, (z1 - z0) / 2 * hs))


def hood(F, b, pid, thick=0.012, face_open=0.06, drape=True):
    hc = b.hc
    hs = b.hs
    outer = S.ellipsoid(hc + v3(0, 0.012, 0.022) * hs, (0.098 * hs, 0.122 * hs, 0.118 * hs))
    inner = S.ellipsoid(hc + v3(0, 0.012, 0.022) * hs, (0.086 * hs, 0.110 * hs, 0.106 * hs))
    shell = outer.sub(inner, 0.003)
    # face opening: cut a rounded box at the front
    cut = S.roundbox(hc + v3(0, -0.12, -0.03) * hs, (0.058 * hs, 0.08 * hs, face_open * hs + 0.03 * hs), r=0.03 * hs)
    shell = shell.sub(cut, 0.01)
    shell = shell.inter(S.halfspace(hc + v3(0, 0, -0.10) * hs, (0, 0, -1)), 0.01)
    F.solid(pid, shell.displaced(folds(0.004, (30, 30, 30), 11), 0.006), 0.006)
    if drape:
        # cowl drape over shoulders/neck
        F.shell(pid, S.ellipsoid(b.J['neck'] + v3(0, 0.01, 0.0), (0.17 * b.w, 0.15 * b.s, 0.1 * b.s)), -0.002, thick,
                0.01, 'cur', folds(0.005, (25, 25, 12), 12))


def cape(F, b, pid, top_z, bottom_z, width_top, width_bot, depth=0.02, thick=0.008, curve=0.12, back_off=0.0, folds_amp=0.008, asym=0.0):
    """Back cape as a thin curved sheet hanging behind the torso (cylindrical shell segment)."""
    yb = b.J['spine2'][1] + 0.01 * b.s + back_off

    def fn(P):
        z = P[..., 2]
        t = np.clip((top_z - z) / (top_z - bottom_z), 0, 1)
        hw = width_top + (width_bot - width_top) * t
        x = P[..., 0] - asym * t
        y = P[..., 1] - (yb + depth * t + 0.02 * t * t)
        surf = y - curve * (1 - np.clip(x / np.maximum(hw, 0.05), -1, 1) ** 2) * (0.6 + 0.4 * (1 - t))
        pleat = folds_amp * np.sin(x / np.maximum(hw, 0.05) * 9.0 + S.vnoise(P * 10, 1.0, 13) * 1.5) * (0.3 + t)
        d = np.abs(surf - pleat) - thick / 2
        d = np.maximum(d, np.abs(x) - hw)
        d = np.maximum(d, np.maximum(z - top_z, bottom_z - z))
        return d
    w = max(width_top, width_bot) + abs(asym) + 0.05
    return S.Prim(fn, (-w, yb - 0.2, bottom_z - 0.02), (w, yb + depth + 0.25, top_z + 0.02))


def apron(F, b, pid, top_z, bottom_z, half_w, front_y, thick=0.010, curve_r=0.35, flare=0.04):
    """Flat-ish front panel hanging from the waist (curved around a vertical axis behind it)."""
    def fn(P):
        z = P[..., 2]
        t = np.clip((top_z - z) / (top_z - bottom_z), 0, 1)
        hw = half_w + flare * t
        cy = front_y + curve_r + 0.03 * t
        r = np.sqrt(P[..., 0] ** 2 + (P[..., 1] - cy) ** 2)
        d = np.abs(r - (curve_r + 0.03 * t * 0)) - thick / 2
        d = np.maximum(d, np.abs(P[..., 0]) - hw)
        d = np.maximum(d, P[..., 1] - (front_y + 0.12))
        d = np.maximum(d, np.maximum(z - top_z, bottom_z - z))
        return d
    w = half_w + flare + 0.02
    return S.Prim(fn, (-w, front_y - 0.05, bottom_z - 0.01), (w, front_y + 0.14, top_z + 0.01))


def robe_skirt(b, z_top, z_bot, rx_top, ry_top, rx_bot, ry_bot, pleats=10, pleat_amp=0.008, front_open=0.0, yoff=0.0, fold=0.004, seed=21):
    c = (0.0, b.J['pelvis'][1] + 0.005)
    base = S.skirt(c, z_top, z_bot, rx_top, ry_top, rx_bot, ry_bot, pleats, pleat_amp, front_open, yoff)
    return base.displaced(folds(fold, (18, 18, 6), seed), fold)


def bracer(F, b, pid, side, t0=0.25, t1=0.95, r_off=0.012, th=0.008, angle=None):
    a, c = b.bones['forearm.' + side]
    p0 = a + (c - a) * t0
    p1 = a + (c - a) * t1
    ra = 0.040 * b.s + r_off
    rb = 0.030 * b.s + r_off
    return S.tube_shell(p0, p1, ra, rb, th, angle)


def limb_point(b, bone, t, off=(0, 0, 0)):
    a, c = b.bones[bone]
    return a + (c - a) * t + v3(off)


# ----------------------------------------------------------------------------- higher-level pieces
def stand_collar(F, b, pid, height=0.07, flare=0.012, r0=None, open_front=0.0, th=0.006, z0=None, tilt=0.0):
    """Tall stand-up collar: open tube around the neck, flaring outwards."""
    nb = b.J['neck']
    z0 = nb[2] - 0.01 * b.s if z0 is None else z0
    r = (r0 or 0.068) * b.s
    a = v3(0, nb[1] + 0.01 * b.s, z0)
    c = a + v3(0, 0.01 * b.s + tilt, height * b.s)
    ang = None if open_front <= 0 else (90, 180 - open_front)
    F.solid(pid, S.tube_shell(a, c, r, r + flare * b.s, th, ang, up=(0, 1, 0)), 0.004)


def wide_sleeve(F, b, pid, side, t0=0.15, r_end=0.11, length=1.0, th=0.007, hang=0.03):
    """Bell sleeve: hollow cone from the upper forearm to just past the wrist."""
    a, c = b.bones['forearm.' + side]
    p0 = a + (c - a) * t0
    p1 = a + (c - a) * length + v3(0, 0, -hang)
    F.solid(pid, S.tube_shell(p0, p1, 0.05 * b.s, r_end * b.s, th).displaced(folds(0.004, (30, 30, 30), 3 if side == 'L' else 4), 0.005), 0.012)
    # close the top of the sleeve to the arm
    F.solid(pid, S.roundcone(a + (c - a) * max(0.0, t0 - 0.12), p0 + (p1 - p0) * 0.15, 0.048 * b.s, 0.06 * b.s), 0.02)


def beard(F, b, pid, length=0.06, width=0.045, moustache=True, seed=5, pointed=False):
    hs = b.hs
    hc = b.hc
    chin = hc + v3(0, -0.086, -0.105) * hs
    tip = chin + v3(0, -0.012, -length)
    w = width * hs
    pts = [chin + v3(0, 0.015, 0.03) * hs, chin, chin + (tip - chin) * 0.5 + v3(0, -0.006, 0), tip]
    rad = [w * 0.9, w * 0.75, w * (0.55 if not pointed else 0.35), 0.006 if pointed else w * 0.3]
    F.solid(pid, S.chain(pts, rad, 0.01).displaced(folds(0.004, (60, 60, 25), seed), 0.006), 0.008)
    # sideburn / jaw beard shell
    F.shell(pid, S.ellipsoid(hc + v3(0, -0.04, -0.075) * hs, (0.07 * hs, 0.075 * hs, 0.045 * hs)).inter(
        S.halfspace(hc + v3(0, 0, -0.045) * hs, (0, 0, 1)), 0.01).sub(S.ellipsoid(b.mouth_c, (0.02 * hs, 0.03 * hs, 0.011 * hs)), 0.004),
        -0.002, 0.006, 0.005, 'body', folds(0.002, (90, 90, 90), seed + 1))
    if moustache:
        for sx in (1, -1):
            F.solid(pid, S.roundcone(b.mouth_c + v3(0, -0.004, 0.0095) * hs, b.mouth_c + v3(sx * 0.024, -0.0, -0.002) * hs, 0.0042 * hs, 0.0028 * hs), 0.004)


def pauldron(F, b, pid, side, size=1.0, layers=1, drop=0.0, t2=0.016, gap=0.006, flare=0.0):
    sx = 1 if side == 'L' else -1
    Sj = b.J['S' + side]
    c = Sj + v3(sx * 0.03 * b.s, 0, 0.03 * b.s - drop)
    for i in range(layers):
        ci = c + v3(sx * 0.02 * i, 0, -0.045 * i * b.s)
        m = S.ellipsoid(ci, (0.10 * size * b.s + flare, 0.11 * size * b.s, 0.085 * size * b.s))
        m = m.inter(S.halfspace(ci + v3(0, 0, -0.06 * size * b.s), (0, 0, -1)), 0.004)
        F.shell(pid, m, gap + i * 0.012, gap + i * 0.012 + t2, 0.006)


def pouch(F, pid, c, half, M=None, r=0.008):
    F.solid(pid, S.roundbox(c, half, M, r).displaced(folds(0.0015, (50, 50, 50), 2), 0.002), 0.003)


def orb(F, pid, c, r, frame_pid=None, ring=0.0035):
    F.solid(pid, S.sphere(c, r), 0.0)
    if frame_pid is not None:
        F.solid(frame_pid, S.torus(c, r * 1.01, ring, S.rot_euler(90, 0, 0)), 0.002)
        F.solid(frame_pid, S.torus(c, r * 1.01, ring, S.rot_euler(0, 90, 0)), 0.002)


def helmet(F, b, pid, scale=1.0, open_face=False, brim=0.0, crest=None, crest_pid=None):
    hs = b.hs * scale
    hc = b.hc
    outer = S.ellipsoid(hc + v3(0, 0.004, 0.024) * hs, (0.090 * hs, 0.114 * hs, 0.112 * hs))
    outer = outer.inter(S.halfspace(hc + v3(0, 0, -0.105) * hs, (0, 0, -1)), 0.006)
    if open_face:
        outer = outer.sub(S.roundbox(hc + v3(0, -0.12, -0.035) * hs, (0.052 * hs, 0.07 * hs, 0.05 * hs), r=0.025 * hs), 0.008)
    F.solid(pid, outer, 0.004)


def lerp3(a, b, t):
    return v3(a) + (v3(b) - v3(a)) * t


def body_extent(b, z, x=0.0, direction='front', y=0.0, axis='y'):
    """Scan the anatomy SDF along a horizontal line and return the surface coordinate."""
    ts = np.arange(-0.7, 0.7, 0.002, dtype=np.float32)
    if axis == 'y':
        P = np.stack([np.full_like(ts, x), ts, np.full_like(ts, z)], axis=-1)
    else:
        P = np.stack([ts, np.full_like(ts, y), np.full_like(ts, z)], axis=-1)
    D = np.full(len(ts), 1.0, dtype=np.float32)
    for prim, bone, k in b.anatomy:
        if prim.lo[2] - 0.02 <= z <= prim.hi[2] + 0.02:
            D = np.minimum(D, prim(P))
    inside = np.nonzero(D < 0)[0]
    if len(inside) == 0:
        return 0.0
    if direction in ('front', 'right'):
        return float(ts[inside[0]])
    return float(ts[inside[-1]])


def quilt(amp=0.003, period=0.05, axes=(0, 2)):
    """Diamond quilting puff displacement."""
    f = np.float32(2 * np.pi / period)
    a0, a1 = axes

    def fn(P):
        u = P[..., a0] * f
        v = P[..., a1] * f
        q = np.abs(np.sin((u + v) * 0.5)) * np.abs(np.sin((u - v) * 0.5))
        return amp * (np.sqrt(q) - 0.5)
    return fn
