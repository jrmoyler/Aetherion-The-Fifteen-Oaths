"""Weapon / focus builders.  Each returns a list of detach items [(pid, prim, k, op)].
Weapons are authored in a grip frame: origin = grip centre, a = weapon axis (blade/shaft direction),
e = edge / "down" direction, w = a x e."""
import math
import numpy as np
from . import sdf as S
from .sdf import v3, normalize


class Frame:
    def __init__(self, o, a, e):
        self.o = v3(o)
        self.a = normalize(a)
        e = v3(e)
        self.e = normalize(e - self.a * np.dot(e, self.a))
        self.w = np.cross(self.a, self.e)
        self.M = np.stack([self.e, self.w, self.a], axis=1)   # local x=e, y=w, z=a

    def p(self, s, h=0.0, w=0.0):
        return self.o + self.a * s + self.e * h + self.w * w

    def local_prim(self, fn, lo_l, hi_l):
        """fn(q) with q[...,0]=e, q[...,1]=w, q[...,2]=a coordinates."""
        o = self.o.astype(np.float32)
        M = self.M.astype(np.float32)

        def f(P):
            return fn((P - o) @ M)
        corners = np.array([[x, y, z] for x in (lo_l[0], hi_l[0]) for y in (lo_l[1], hi_l[1]) for z in (lo_l[2], hi_l[2])])
        wc = self.o + corners @ self.M.T
        return S.Prim(f, wc.min(0), wc.max(0))


def grip_frame(b, side='R', flip=False):
    hf = b.hand_frames[side]
    a = hf['t'] if not flip else -hf['t']
    return Frame(hf['grip'], a, hf['u'])


def wrapped_handle(fr, pid_wrap, s0, s1, r, pid_cap=None, cap_r=None):
    items = []
    wrap = S.capsule(fr.p(s0), fr.p(s1), r)
    o = fr.o.astype(np.float32)
    a = fr.a.astype(np.float32)
    base = wrap.fn

    def f(P):
        s = (P - o) @ a
        return base(P) - 0.0012 * np.abs(np.sin(s * 220 + np.arctan2((P - o) @ fr.e.astype(np.float32), (P - o) @ fr.w.astype(np.float32)) * 1.0))
    items.append((pid_wrap, S.Prim(f, wrap.lo, wrap.hi), 0.0, 'add'))
    if pid_cap is not None:
        cr = cap_r or r * 1.3
        items.append((pid_cap, S.cylinder(fr.p(s0 - 0.012), fr.p(s0 + 0.008), cr, 0.003), 0.002, 'add'))
        items.append((pid_cap, S.cylinder(fr.p(s1 - 0.008), fr.p(s1 + 0.012), cr, 0.003), 0.002, 'add'))
    return items


def curved_blade(fr, pid_back, pid_edge, s0, L, h0, h1, thick, curve, edge_frac=0.35, slots=0, slot_pid=None, back_up=True):
    """Single-edged curved blade from s0 to s0+L. h0/h1 blade height at base/tip, edge on -e side..."""
    def fn(q):
        s = q[..., 2] - s0
        t = np.clip(s / L, 0, 1)
        bend = curve * t * t
        h = q[..., 0] + bend               # edge along +e (down); curve lifts the tip toward -e
        ht = h0 + (h1 - h0) * t ** 1.4
        top = -ht * 0.35                    # spine side (−e)
        bot = ht * 0.65                     # edge side (+e)
        # tip: diagonal clip
        tipcut = (s - L) + (bot - h) * 0.9
        u = np.clip((h - top) / np.maximum(bot - top, 1e-4), 0, 1)
        th = thick * (1 - u) ** 0.8 + 0.0008
        d = np.abs(q[..., 1]) - th
        d = np.maximum(d, top - h)
        d = np.maximum(d, h - bot)
        d = np.maximum(d, -s)
        d = np.maximum(d, tipcut)
        return d
    hmax = max(h0, h1)
    pr = fr.local_prim(fn, (-hmax - abs(curve), -thick - 0.01, s0 - 0.01), (hmax + abs(curve), thick + 0.01, s0 + L + 0.02))
    items = [(pid_back, pr, 0.0, 'add')]

    def edge_fn(q):
        s = q[..., 2] - s0
        t = np.clip(s / L, 0, 1)
        h = q[..., 0] + curve * t * t
        ht = h0 + (h1 - h0) * t ** 1.4
        return (ht * 0.65 - ht * edge_frac) - h
    items.append((pid_edge, fr.local_prim(edge_fn, (-hmax - abs(curve), -0.02, s0 - 0.01), (hmax + abs(curve), 0.02, s0 + L + 0.02)), 0.0, 'paint'))
    for i in range(slots):
        s = s0 + L * (0.12 + 0.11 * i)
        t = (s - s0) / L
        hc = -(h0 + (h1 - h0) * t ** 1.4) * 0.05 - curve * t * t
        c = fr.p(s, hc)
        items.append((None, S.roundbox(c, (0.006, 0.02, 0.017), fr.M, 0.004), 0.002, 'sub'))
        if slot_pid:
            items.append((slot_pid, S.roundbox(c, (0.0065, 0.0045, 0.0175), fr.M, 0.003), 0.0, 'add'))
    return items


def staff(fr, pid_shaft, s0, s1, r, pid_ring=None, rings=(), taper=0.8):
    items = [(pid_shaft, S.roundcone(fr.p(s0), fr.p(s1), r, r * taper), 0.0, 'add')]
    for s in rings:
        items.append((pid_ring, S.cylinder(fr.p(s - 0.012), fr.p(s + 0.012), r * 1.45, 0.003), 0.002, 'add'))
    return items


def straight_blade(fr, pid, pid_edge, s0, L, h, thick, taper=0.6, double=False, curve=0.0):
    def fn(q):
        s = q[..., 2] - s0
        t = np.clip(s / L, 0, 1)
        hh = h * (1 - (1 - taper) * t)
        hc = q[..., 0] + curve * t * t
        if double:
            u = np.abs(hc) / np.maximum(hh * 0.5, 1e-4)
            th = thick * np.clip(1 - u, 0, 1) ** 0.7 + 0.0008
            d = np.maximum(np.abs(q[..., 1]) - th, np.abs(hc) - hh * 0.5)
            tip = (s - L) + np.abs(hc) * 2.2
        else:
            u = np.clip((hc + hh * 0.35) / np.maximum(hh, 1e-4), 0, 1)
            th = thick * (1 - u) ** 0.7 + 0.0008
            d = np.maximum(np.abs(q[..., 1]) - th, np.maximum(-hh * 0.35 - hc, hc - hh * 0.65))
            tip = (s - L) + (hh * 0.65 - hc) * 1.4
        d = np.maximum(d, -s)
        d = np.maximum(d, tip)
        return d
    pr = fr.local_prim(fn, (-h - abs(curve), -thick - 0.01, s0 - 0.01), (h + abs(curve), thick + 0.01, s0 + L + 0.02))
    items = [(pid, pr, 0.0, 'add')]
    if pid_edge is not None:
        def efn(q):
            s = q[..., 2] - s0
            t = np.clip(s / L, 0, 1)
            hh = h * (1 - (1 - taper) * t)
            hc = q[..., 0] + curve * t * t
            if double:
                return hh * 0.32 - np.abs(hc)
            return hh * 0.30 - hc
        items.append((pid_edge, fr.local_prim(efn, (-h - abs(curve), -0.02, s0 - 0.01), (h + abs(curve), 0.02, s0 + L + 0.02)), 0.0, 'paint'))
    return items


def cross_guard(fr, pid, s, w=0.055, t=0.012):
    return [(pid, S.roundbox(fr.p(s), (w, t, t), fr.M, 0.004), 0.002, 'add')]


def mace_head(fr, pid, s, r, flanges=6, flange_pid=None, crystal=False):
    items = []
    c = fr.p(s)
    if crystal:
        for i in range(7):
            ang = i * 2 * np.pi / 7
            d = fr.e * np.cos(ang) + fr.w * np.sin(ang)
            tip = c + d * r * 1.4 + fr.a * r * (0.6 if i % 2 else 0.2)
            items.append((flange_pid or pid, S.roundcone(c, tip, r * 0.45, r * 0.12), 0.004, 'add'))
        items.append((flange_pid or pid, S.roundcone(c, c + fr.a * r * 2.2, r * 0.5, r * 0.1), 0.004, 'add'))
        return items
    items.append((pid, S.sphere(c, r * 0.75), 0.0, 'add'))
    for i in range(flanges):
        ang = i * 2 * np.pi / flanges
        d = fr.e * np.cos(ang) + fr.w * np.sin(ang)
        M = np.stack([d, np.cross(fr.a, d), fr.a], axis=1)
        items.append((flange_pid or pid, S.roundbox(c + d * r * 0.6, (r * 0.45, 0.004, r * 0.9), M, 0.002), 0.003, 'add'))
    return items


def pommel(fr, pid, s, r=0.02):
    return [(pid, S.sphere(fr.p(s), r), 0.003, 'add')]


def ring_weapon(fr, pid, s, R, r, pid2=None):
    c = fr.p(s)
    return [(pid, S.torus(c, R, r, fr.M), 0.0, 'add')] + ([(pid2, S.torus(c, R * 0.72, r * 0.6, fr.M), 0.0, 'add')] if pid2 else [])


def fan(fr, pid_rib, pid_leaf, s0, L, spread=110, ribs=9):
    items = []
    for i in range(ribs):
        ang = np.radians(-spread / 2 + spread * i / (ribs - 1))
        d = fr.a * np.cos(ang) + fr.e * np.sin(ang)
        items.append((pid_rib, S.capsule(fr.p(s0), fr.p(s0) + d * L, 0.0035), 0.0, 'add'))

    def leaf(q):
        r = np.sqrt(q[..., 0] ** 2 + (q[..., 2] - s0) ** 2)
        ang = np.degrees(np.arctan2(q[..., 0], q[..., 2] - s0))
        d = np.maximum(np.abs(q[..., 1]) - 0.0018, np.maximum(L * 0.35 - r, r - L * 0.98))
        return np.maximum(d, (np.abs(ang) - spread / 2) * np.pi / 180 * r)
    items.append((pid_leaf, fr.local_prim(leaf, (-L, -0.01, s0 - L), (L, 0.01, s0 + L)), 0.0, 'add'))
    return items


def crossbow(fr, pid_wood, pid_metal, pid_string=None):
    items = [(pid_wood, S.roundbox(fr.p(0.12, -0.03), (0.018, 0.016, 0.20), fr.M, 0.006), 0.004, 'add')]
    c = fr.p(0.30, -0.035)
    for sg in (1, -1):
        tip = c + fr.w * sg * 0.24 + fr.a * -0.07
        items.append((pid_metal, S.roundcone(c, tip, 0.011, 0.006), 0.004, 'add'))
    items.append((pid_metal, S.roundbox(fr.p(0.0, 0.03), (0.03, 0.012, 0.012), fr.M, 0.003), 0.003, 'add'))
    return items


def book(fr, pid_cover, pid_pages, pid_metal=None, size=(0.16, 0.12, 0.04)):
    c = fr.p(0.0, 0.0, 0.0) + fr.w * 0.0
    items = [(pid_cover, S.roundbox(c, (size[1] / 2, size[2] / 2, size[0] / 2), fr.M, 0.006), 0.0, 'add'),
             (pid_pages, S.roundbox(c + fr.e * 0.004, (size[1] / 2 - 0.004, size[2] / 2 - 0.006, size[0] / 2 + 0.001), fr.M, 0.002), 0.0, 'paint')]
    if pid_metal:
        for sgn in (1, -1):
            items.append((pid_metal, S.roundbox(c + fr.a * sgn * size[0] * 0.45, (size[1] / 2 + 0.003, size[2] / 2 + 0.003, 0.008), fr.M, 0.002), 0.002, 'add'))
    return items


def hammer(fr, pid_shaft, pid_head, pid_acc=None, L=0.55, head=(0.07, 0.06, 0.13)):
    items = [(pid_shaft, S.capsule(fr.p(-0.12), fr.p(L), 0.016), 0.0, 'add')]
    hc = fr.p(L + 0.02)
    M = np.stack([fr.a, fr.w, fr.e], axis=1)
    items.append((pid_head, S.roundbox(hc, head, M, 0.012), 0.004, 'add'))
    if pid_acc:
        items.append((pid_acc, S.roundbox(hc + fr.w * head[1], (head[0] * 0.6, 0.006, head[2] * 0.6), M, 0.004), 0.0, 'add'))
    return items


def scythe(fr, pid_shaft, pid_blade, pid_edge, L=0.9):
    items = [(pid_shaft, S.capsule(fr.p(-0.25), fr.p(L), 0.015), 0.0, 'add')]
    top = fr.p(L - 0.02)
    bfr = Frame(top, -fr.e, -fr.a)
    items += straight_blade(bfr, pid_blade, pid_edge, 0.0, 0.42, 0.07, 0.006, taper=0.25, curve=0.10)
    return items


def bow(fr, pid_wood, pid_string=None, L=0.6):
    pts = [fr.p(0, 0.0) + fr.e * 0.0]
    items = []
    for sg in (1, -1):
        p0 = fr.p(0.0)
        p1 = p0 + fr.a * 0.0 + fr.e * sg * L * 0.5 + fr.a * -0.08
        p2 = p0 + fr.e * sg * L + fr.a * 0.06
        items.append((pid_wood, S.chain(S.bezier(p0, p1, p2, 5), [0.016, 0.014, 0.012, 0.009, 0.006], 0.004), 0.004, 'add'))
    if pid_string:
        items.append((pid_string, S.capsule(fr.p(0.06, L), fr.p(0.06, -L), 0.0015), 0.0, 'add'))
    return items


def flail(fr, pid_shaft, pid_chain, pid_ball, L=0.3, links=5, ball_r=0.06, spikes=True):
    items = [(pid_shaft, S.capsule(fr.p(-0.1), fr.p(L), 0.017), 0.0, 'add')]
    p = fr.p(L + 0.02)
    for i in range(links):
        M = fr.M if i % 2 == 0 else np.stack([fr.w, fr.e, fr.a], axis=1)
        items.append((pid_chain, S.torus(p + fr.a * 0.025 + fr.e * 0.008 * i, 0.016, 0.0045, M @ np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]])), 0.0, 'add'))
        p = p + fr.a * 0.03 + fr.e * 0.012
    bc = p + fr.a * ball_r + fr.e * 0.02
    items.append((pid_ball, S.sphere(bc, ball_r), 0.0, 'add'))
    if spikes:
        for d in [fr.a, -fr.a, fr.e, -fr.e, fr.w, -fr.w]:
            items.append((pid_ball, S.roundcone(bc, bc + d * ball_r * 1.5, ball_r * 0.35, 0.003), 0.004, 'add'))
    return items


def cannon(fr, pid_body, pid_ring, pid_glow=None, L=0.6, r=0.06):
    items = [(pid_body, S.cylinder(fr.p(-0.15, -0.05), fr.p(L, -0.05), r, 0.01), 0.0, 'add')]
    for s in np.linspace(-0.1, L - 0.05, 6):
        items.append((pid_ring, S.cylinder(fr.p(s - 0.012, -0.05), fr.p(s + 0.012, -0.05), r * 1.18, 0.004), 0.003, 'add'))
    items.append((None, S.cylinder(fr.p(L - 0.04, -0.05), fr.p(L + 0.05, -0.05), r * 0.7), 0.003, 'sub'))
    if pid_glow:
        items.append((pid_glow, S.cylinder(fr.p(L - 0.06, -0.05), fr.p(L - 0.03, -0.05), r * 0.72), 0.0, 'add'))
    return items


def whip(fr, pid_handle, pid_lash, pid_metal=None, coils=3, R=0.09, r=0.009):
    items = [(pid_handle, S.capsule(fr.p(-0.1), fr.p(0.1), 0.017), 0.0, 'add')]
    if pid_metal:
        items.append((pid_metal, S.cylinder(fr.p(0.09), fr.p(0.13), 0.021, 0.003), 0.002, 'add'))
    for i in range(coils):
        c = fr.p(0.16 + R, R * 0.6 + 0.02 * i, 0.01 * i)
        items.append((pid_lash, S.torus(c, R * (1 - 0.1 * i), r, np.stack([fr.e, fr.a, fr.w], axis=1)), 0.002, 'add'))
    return items


def shield(b, side, pid, pid_trim=None, w=0.26, h=0.42, th=0.02):
    a, c = b.bones['forearm.' + side]
    ax = normalize(c - a)
    sx = 1 if side == 'L' else -1
    out = normalize(np.cross(ax, (0, -1, 0)) * sx)
    ctr = a + (c - a) * 0.55 + out * 0.06
    M = np.stack([normalize(np.cross(out, ax)), out, ax], axis=1)
    items = [(pid, S.roundbox(ctr, (w / 2, th / 2, h / 2), M, 0.012).displaced(lambda P: 0.0 * P[..., 0], 0.0), 0.0, 'add')]
    if pid_trim:
        items.append((pid_trim, S.roundbox(ctr + out * 0.004, (w / 2 + 0.006, th / 2 - 0.004, h / 2 + 0.006), M, 0.012).sub(
            S.roundbox(ctr + out * 0.004, (w / 2 - 0.02, th, h / 2 - 0.02), M, 0.01), 0.002), 0.002, 'add'))
    return items
