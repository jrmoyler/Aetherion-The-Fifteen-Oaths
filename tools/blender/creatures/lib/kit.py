"""Reusable anatomical/hard-surface parts built in code."""
import math
import numpy as np
from mathutils import Vector, Matrix
import bpy
import bmesh
from . import core


def claw(name, base, direction, length, r, curve=0.5, segs=6, down=(0, 0, -1)):
    d = Vector(direction).normalized()
    dn = Vector(down).normalized()
    b = Vector(base)
    pts = core.bezier_pts(b, b + d * length * 0.5, b + d * length * 0.85 + dn * length * curve * 0.5,
                          None, 5)
    return core.horn(name, pts, [r, r * 0.8, r * 0.55, r * 0.3, r * 0.08], segs=segs, flat=0.75)


def paw_claws(prefix, ball, fwd=(0, 1, 0), n=4, spread=0.035, length=0.04, r=0.008, side=1.0):
    obs = []
    for i in range(n):
        u = (i - (n - 1) / 2) / max(n - 1, 1)
        base = Vector(ball) + Vector((u * spread * side if False else u * spread, 0.0, 0.0))
        d = Vector(fwd) + Vector((u * 0.35, 0, -0.25))
        obs.append(claw(f"{prefix}{i}", base, d, length * (1 - 0.25 * abs(u) * 2), r))
    return core.join(obs) if len(obs) > 1 else obs[0]


def spike(name, base, direction, length, r, bend=(0, 0, 0), segs=6, flat=1.0, flat_side=False):
    b = Vector(base); d = Vector(direction).normalized()
    pts = core.bezier_pts(b, b + d * length * 0.5, b + d * length + Vector(bend) * length, None, 5)
    return core.horn(name, pts, [r, r * 0.75, r * 0.5, r * 0.25, r * 0.04], segs=segs, flat=flat, flat_side=flat_side)


def spike_row(name, path_pts, dirs, lengths, radii, segs=5, flat=0.5, jitter=0.0, seed=0, bend=(0, -0.3, 0)):
    rng = np.random.default_rng(seed)
    obs = []
    for i, (p, d, l, r) in enumerate(zip(path_pts, dirs, lengths, radii)):
        dj = Vector(d) + Vector(rng.normal(size=3)) * jitter
        obs.append(spike(f"{name}{i}", p, dj, l * rng.uniform(0.85, 1.15), r, bend=bend, segs=segs, flat=flat))
    return core.join(obs)


def bristle_clump(name, center, normal, back, n=7, length=0.08, r=0.01, spread=0.03, seed=0, segs=4):
    """Card-like fur/bristle clump: several flattened tapering strands combed toward `back`."""
    rng = np.random.default_rng(seed)
    c = Vector(center); nrm = Vector(normal).normalized(); bk = Vector(back).normalized()
    side = nrm.cross(bk).normalized()
    obs = []
    for i in range(n):
        o = c + side * rng.uniform(-spread, spread) + bk * rng.uniform(-spread, spread) * 0.6
        L = length * rng.uniform(0.7, 1.2)
        d = (nrm * rng.uniform(0.35, 0.6) + bk).normalized()
        pts = core.bezier_pts(o - nrm * r, o + d * L * 0.5 + nrm * L * 0.1, o + d * L - nrm * L * 0.12, None, 4)
        obs.append(core.horn(f"{name}{i}", pts, [r, r * 0.8, r * 0.45, r * 0.05], segs=segs, flat=0.35))
    return core.join(obs)


def eye(name, c, r):
    return core.ico(name, r, c, sub=2)


def tooth_row(name, a, b, n, length, r, down=(0, 0, -1), seed=0):
    rng = np.random.default_rng(seed)
    a, b = Vector(a), Vector(b)
    obs = []
    for i in range(n):
        p = a.lerp(b, i / max(n - 1, 1))
        l = length * rng.uniform(0.7, 1.1)
        obs.append(spike(f"{name}{i}", p, down, l, r, segs=5))
    return core.join(obs)


def antler(name, base, side, scale=1.0, seed=0, tines=4):
    """Red-deer/elk style rack: beam sweeps up, back and out, then forward; brow + bez tines
    low, trez mid, and a crown of 3 tines at the top. side = +1/-1."""
    rng = np.random.default_rng(seed)
    S = scale
    b = Vector(base)
    beam = core.bezier_pts(b, b + Vector((0.24 * side, -0.20, 0.14)) * S, b + Vector((0.58 * side, -0.20, 0.40)) * S,
                           b + Vector((0.62 * side, 0.08, 0.62)) * S, 11)
    radii = [(0.042 * (1 - i / 12) ** 0.8 + 0.007) * S for i in range(11)]
    obs = [core.horn(f"{name}_beam", beam, radii, segs=9)]
    obs.append(spike(f"{name}_brow", beam[1], (0.25 * side, 1.0, 0.15), 0.30 * S, 0.024 * S, bend=(0, 0.1, 0.45)))
    obs.append(spike(f"{name}_bez", beam[3], (0.2 * side, 1.0, 0.3), 0.26 * S, 0.021 * S, bend=(0, 0, 0.4)))
    obs.append(spike(f"{name}_trez", beam[6], (0.1 * side, 1.0, 0.55), 0.26 * S, 0.019 * S, bend=(0, 0, 0.35)))
    top = beam[-1]
    for j, d in enumerate(((0.45 * side, 0.3, 1.0), (-0.1 * side, 0.6, 1.0), (0.6 * side, -0.5, 0.8))[:max(1, tines - 1)]):
        dj = Vector(d) + Vector(rng.normal(size=3)) * 0.08
        obs.append(spike(f"{name}_c{j}", beam[-2], dj, (0.22 - 0.03 * j) * S, 0.016 * S, bend=(0, 0, 0.2)))
    return core.join(obs)


def plate(name, c, size, rot=(0, 0, 0), bevel=0.006, taper=(0.85, 0.85)):
    return core.box(name, size, c, rot, bevel=bevel, segs=2, taper=taper)


def rivets(name, pts, r=0.008):
    obs = [core.ico(f"{name}{i}", r, p, sub=1, scale=(1, 1, 0.6)) for i, p in enumerate(pts)]
    return core.join(obs)


def gear(name, r, teeth=12, thick=0.03, loc=(0, 0, 0), rot=(0, 0, 0), hole=0.35):
    """Spur gear: hub ring + rectangular teeth (axis = local Z)."""
    bm = bmesh.new()
    segs = teeth * 2
    inner = r * hole
    top, bot = [], []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        rr = r * (1.0 if k % 2 == 0 else 0.84)
        for sgn, lst in ((1, top), (-1, bot)):
            lst.append((bm.verts.new((math.cos(a - math.pi / segs * 0.5) * rr, math.sin(a - math.pi / segs * 0.5) * rr, sgn * thick / 2)),
                        bm.verts.new((math.cos(a + math.pi / segs * 0.5) * rr, math.sin(a + math.pi / segs * 0.5) * rr, sgn * thick / 2))))
    ot = [v for pair in top for v in pair]
    ob_ = [v for pair in bot for v in pair]
    it = [bm.verts.new((math.cos(2 * math.pi * k / len(ot)) * inner, math.sin(2 * math.pi * k / len(ot)) * inner, thick / 2)) for k in range(len(ot))]
    ib = [bm.verts.new((math.cos(2 * math.pi * k / len(ot)) * inner, math.sin(2 * math.pi * k / len(ot)) * inner, -thick / 2)) for k in range(len(ot))]
    n = len(ot)
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((ot[k], ot[k2], it[k2], it[k]))
        bm.faces.new((ob_[k2], ob_[k], ib[k], ib[k2]))
        bm.faces.new((ot[k2], ot[k], ob_[k], ob_[k2]))
        bm.faces.new((it[k], it[k2], ib[k2], ib[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = core.link(bpy.data.objects.new(name, me))
    core.shade(ob, True, 30)
    return core.place(ob, loc, rot)


def piston(name, a, b, r):
    """Hydraulic piston between two points: wide sleeve + narrow rod."""
    a, b = Vector(a), Vector(b)
    m = a.lerp(b, 0.55)
    s1 = core.horn(name + "s", [a, a.lerp(b, 0.15), m], [r, r, r], segs=10, cap_flat=True)
    s2 = core.horn(name + "r", [m, b], [r * 0.55, r * 0.55], segs=8, cap_flat=True)
    return core.join([s1, s2])


def along(a, b):
    d = (Vector(b) - Vector(a)).normalized()
    return Vector((0, 0, 1)).rotation_difference(d).to_euler()


def branch(name, base, direction, length, r, depth=2, seed=0, kids=2, spread=0.6, segs=6):
    """Recursive gnarled branch (tapering, kinked) with child branches."""
    rng = np.random.default_rng(int(seed) & 0xFFFF)
    obs = []

    def grow(b, d, L, rr, lvl, tag):
        d = Vector(d).normalized()
        kink = Vector(rng.normal(size=3)) * 0.25
        pts = core.bezier_pts(b, b + (d + kink * 0.5) * L * 0.4, b + (d - kink * 0.3) * L * 0.75 + Vector((0, 0, 0.08 * L)), b + d * L, 6)
        rad = [rr * (1 - 0.8 * i / 5) for i in range(6)]
        obs.append(core.horn(f"{name}{tag}", pts, rad, segs=max(4, segs - lvl)))
        if lvl < depth:
            for k in range(kids):
                u = rng.uniform(0.45, 0.85)
                p = pts[int(u * 5)]
                nd = d + Vector(rng.normal(size=3)) * spread + Vector((0, 0, 0.2))
                grow(p, nd, L * rng.uniform(0.45, 0.65), rr * 0.55, lvl + 1, f"{tag}_{k}")

    grow(Vector(base), direction, length, r, 0, "b")
    return core.join(obs)
