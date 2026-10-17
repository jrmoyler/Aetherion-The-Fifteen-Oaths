"""Wisp: floating elemental core — a white-hot heart inside a caged corona, two counter-rotating
rings of fractured crystal shards on their own bones, and trailing energy tendrils."""
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import core, kit, mats, hover
from lib.build import Spec

V = Vector
CORE = (0, 0.0, 1.0)


def shard(name, c, d, L, r, seed):
    """elongated faceted crystal (bi-pyramid) pointing along d."""
    rng = np.random.default_rng(seed)
    ob = core.ico(name, 1.0, (0, 0, 0), sub=0)
    for v in ob.data.vertices:
        v.co.z *= L / 2
        v.co.x *= r * rng.uniform(0.8, 1.2)
        v.co.y *= r * rng.uniform(0.8, 1.2)
    q = V((0, 0, 1)).rotation_difference(V(d).normalized())
    ob.matrix_world = Matrix.Translation(V(c)) @ q.to_matrix().to_4x4()
    core.apply_transform(ob)
    core.shade(ob, False)
    return ob


def build(oath=None):
    S = Spec("wisp", oath)
    S.height = 1.6
    S.clay = None
    S.extra["core"] = CORE
    crystal = mats.surface("crystal", "hi_crystal")
    stone = mats.surface("stone", "hi_stone", cells=6.0)
    glow = mats.surface("glow", "hi_glow")
    S.tint = {"body": "#3a3e4a", "secondary": "#5a6070", "accent": "#a8acb8", "glow": "#c8b8ff"}
    c = V(CORE)
    shards = []
    for i in range(10):
        ring = "orbit_a" if i < 6 else "orbit_b"
        n = 6 if i < 6 else 4
        k = i if i < 6 else i - 6
        a = 2 * math.pi * k / n + (0.3 if ring == "orbit_b" else 0)
        rr = 0.42 if ring == "orbit_a" else 0.30
        z = (0.06 * math.sin(a * 2)) if ring == "orbit_a" else (0.30 if k % 2 == 0 else -0.30)
        pos = c + V((math.cos(a) * rr, math.sin(a) * rr, z))
        shards.append((f"shard{i + 1}", tuple(pos), ring))
        d = (pos - c).normalized() + V((0, 0, 0.6 if ring == "orbit_b" and z > 0 else -0.6 if ring == "orbit_b" else 0.25))
        S.part(shard(f"sh{i}", pos, d, 0.30 if ring == "orbit_a" else 0.24, 0.06, i), f"shard{i + 1}",
               "accent" if i % 3 else "body", crystal if i % 3 else stone)
    # core: hot heart + corona cage of thin bands
    S.part(core.ico("heart", 0.18, c, sub=4), "core", "glow", glow)
    for j in range(3):
        S.part(core.torus(f"band{j}", 0.25, 0.014, c, rot=(math.radians(60 * j), math.radians(35), 0), major=48, minor=8), "core", "secondary", stone)
    # tendrils trailing below
    tendrils = []
    for i in range(5):
        a = 2 * math.pi * i / 5
        base = c + V((math.cos(a) * 0.10, math.sin(a) * 0.10, -0.12))
        pts = [base + V((math.cos(a) * 0.07 * k, math.sin(a) * 0.07 * k - 0.07 * k * k * 0.5, -0.15 * k)) for k in range(4)]
        tendrils.append((f"tend{i}", pts))
        dense = core.bezier_pts(pts[0], pts[1], pts[2], pts[3], 8)
        ob = core.horn(f"tendm{i}", dense, [0.035 * (1 - u / 8) + 0.003 for u in range(8)], segs=6)
        names = [f"tend{i}_{k + 1}" for k in range(3)]
        zs = [p.z for p in pts]

        def wfn(co, zs=zs, names=names):
            for k in range(3):
                if co.z >= zs[k + 1] - 1e-4:
                    f = (zs[k] - co.z) / (zs[k] - zs[k + 1] + 1e-9)
                    f = min(max(f, 0), 1)
                    nb = names[min(k + 1, 2)]
                    return {names[k]: 1 - 0.5 * f, nb: 0.5 * f} if nb != names[k] else {names[k]: 1.0}
            return {names[2]: 1.0}
        S.part(ob, wfn, "glow", glow)
    S.bones = hover.wisp_skeleton(CORE, shards, tendrils)
    S.legs = []
    S.loc_bones = ["hips"] + [n for n, *_ in shards]
    S.glow_strength = 5.0
    S.clip_fn = lambda ctx: hover.clips_wisp(ctx, {}, shards, tendrils)
    return S
