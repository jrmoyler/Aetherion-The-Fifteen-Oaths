"""Spider: armoured eight-legged skitterer — high-kneed segmented legs with bristles, a plated
cephalothorax with an eye cluster, curved chelicerae fangs and a heavy banded abdomen."""
import math
import numpy as np
from mathutils import Vector
from lib import core, kit, mats, multi
from lib.sdf import Clay, rot_to
from lib.build import Spec

V = Vector
BODY = dict(ceph0=(0, -0.08, 0.56), ceph1=(0, 0.36, 0.58), abd0=(0, -0.12, 0.60), abd1=(0, -0.95, 0.66),
            fang0=(0.05, 0.40, 0.52), fang1=(0.06, 0.48, 0.34), palp0=(0.09, 0.36, 0.52), palp1=(0.14, 0.58, 0.36))


def leg_spec():
    out = []
    for i, (ang, reach, kz) in enumerate(((32, 1.05, 1.02), (68, 0.98, 0.98), (108, 0.95, 0.96), (148, 1.05, 1.0)), start=1):
        a = math.radians(ang)
        d = V((math.sin(a), math.cos(a), 0))
        cox = V((0, 0.14, 0.54)) + d * 0.17
        knee = cox + d * 0.42 * reach + V((0, 0, kz - 0.54))
        ank = cox + d * 0.82 * reach + V((0, 0, 0.42 - 0.54))
        tip = cox + d * 1.10 * reach + V((0, 0, 0.015 - 0.54))
        out.append((i, tuple(cox), tuple(knee), tuple(ank), tuple(tip)))
    return out


LEGS = leg_spec()


def clay():
    c = Clay()
    c.ell((0, 0.14, 0.56), (0.22, 0.27, 0.13), k=0.04)                       # cephalothorax
    c.ell((0, 0.30, 0.62), (0.14, 0.12, 0.08), k=0.04)                       # head ridge
    c.cone((0, -0.06, 0.58), (0, -0.16, 0.60), 0.07, 0.07, k=0.03)            # pedicel
    c.ell((0, -0.55, 0.68), (0.33, 0.46, 0.31), R=rot_to((0, -1, 0.25)), k=0.05)  # abdomen
    c.ell((0, -0.98, 0.58), (0.10, 0.10, 0.10), k=0.04)                       # spinneret mound
    for s in (1,):
        for i, cox, knee, ank, tip in LEGS:
            c.ell(cox, (0.06, 0.06, 0.05), k=0.03, mirror=True)
            c.cone(cox, knee, 0.062, 0.045, k=0.02, mirror=True)
            c.cone(knee, ank, 0.044, 0.03, k=0.018, mirror=True)
            c.cone(ank, tip, 0.028, 0.009, k=0.012, mirror=True)
            c.add("sphere", k=0.012, mirror=True, c=knee, r=0.055)
            c.add("sphere", k=0.01, mirror=True, c=ank, r=0.035)
            mid = tuple((np.array(cox) + np.array(knee)) / 2)
            c.ell(mid, (0.07, 0.07, 0.07), k=0.03, mirror=True)
    c.cone(BODY["palp0"], BODY["palp1"], 0.03, 0.018, k=0.02, mirror=True)
    c.cone((0.05, 0.38, 0.53), (0.055, 0.44, 0.44), 0.045, 0.035, k=0.02, mirror=True)  # chelicerae base
    c.lumps(0.003, 30.0, seed=13, n=10)
    return c


def build(oath=None):
    S = Spec("spider", oath)
    S.height = 1.2
    S.clay = clay()
    S.voxel = 0.0075
    S.low_tris = 10000
    S.surface = mats.surface("chitin", "hi_chitin", rough=0.35)
    plate = mats.surface("chitin", "hi_plate", rough=0.25)
    fang_m = mats.surface("bone", "hi_fang", rough=0.3)
    hair = mats.surface("fur", "hi_hair", belly_z=5, dark=0.5, light=0.5, scale=0.6)
    glow = mats.surface("glow", "hi_glow")
    S.tint = {"body": "#2a2622", "secondary": "#14110f", "accent": "#8a7a5a", "glow": "#c4ff3a"}
    for s, g in multi.SIDES:
        X = V((g, 1, 1))
        fp = core.bezier_pts(V(BODY["fang0"]) * X + V((0, 0.02, -0.06)), V((0.07 * g, 0.50, 0.42)), V((0.04 * g, 0.50, 0.30)), V((0.0, 0.45, 0.27)), 7)
        S.part(core.horn(f"fang{s}", fp, [0.03, 0.028, 0.024, 0.018, 0.012, 0.007, 0.002], segs=7), f"fang_{s}", "accent", fang_m)
        # eye cluster: 2 big + 3 small per side
        for j, (dx, dy, dz, r) in enumerate(((0.035, 0.40, 0.655, 0.022), (0.075, 0.38, 0.64, 0.016), (0.03, 0.36, 0.69, 0.013),
                                             (0.09, 0.33, 0.66, 0.011), (0.06, 0.34, 0.70, 0.01))):
            S.part(kit.eye(f"eye{s}{j}", (dx * g, dy, dz), r), "hips", "glow", glow)
        for i, cox, knee, ank, tip in LEGS:
            # bristles along femur/tibia, combed toward the tip
            for bn, a, b in ((f"femur{i}_{s}", cox, knee), (f"tibia{i}_{s}", knee, ank)):
                A, B = V(a) * X, V(b) * X
                d = (B - A).normalized()
                for k in range(3):
                    p = A.lerp(B, 0.25 + 0.25 * k)
                    up = V((0, 0, 1)) if bn.startswith("femur") else (V((A.x, A.y, 0)).normalized() + V((0, 0, 0.3)))
                    S.part(kit.bristle_clump(f"br{i}{s}{bn[0]}{k}", p, up, d, n=4, length=0.10, r=0.011, spread=0.02, seed=i * 10 + k),
                           bn, "secondary", hair)
            # armoured knee caps
            S.part(core.ico(f"kc{i}{s}", 0.05, V(knee) * X + V((0, 0, 0.02)), sub=1, scale=(1, 1, 0.7), flat=True), f"femur{i}_{s}", "accent", plate)
    # dorsal plates on the cephalothorax and banded abdomen scutes
    S.part(kit.plate("cplate", (0, 0.12, 0.665), (0.30, 0.34, 0.05), rot=(0.05, 0, 0), bevel=0.02, taper=(0.7, 0.75)), "hips", "accent", plate)
    def ztop(y):
        d = y + 0.55
        return 0.68 + 0.31 * math.sqrt(max(0.0, 1 - (d / 0.47) ** 2)) - 0.24 * d

    for j in range(4):
        y = -0.30 - 0.18 * j
        z = ztop(y) - 0.005
        S.part(kit.plate(f"ascute{j}", (0, y, z), (0.44 - 0.06 * j, 0.15, 0.05), rot=(0.25 + 0.15 * j, 0, 0), bevel=0.02, taper=(0.75, 0.8)),
               "abdomen", "accent", plate)
    for j in range(3):
        y = -0.39 - 0.18 * j
        S.part(core.ico(f"abdglow{j}", 0.035, (0, y, ztop(y) + 0.01), sub=1, scale=(2.6, 0.8, 0.5)), "abdomen", "glow", glow)
        for sgn in (-1, 1):
            S.part(kit.spike(f"aspk{j}{sgn}", (0.15 * sgn, y, ztop(y) - 0.06), (0.5 * sgn, -0.3, 1), 0.13, 0.026, bend=(0, -0.3, 0)),
                   "abdomen", "accent", fang_m)
    if oath == "oath-04":
        S.tint.update(body="#e9e1d2", accent="#1d3352", glow="#58d4ff")
    S.bones = multi.spider_skeleton(BODY, LEGS)
    S.legs = multi.spider_legs(LEGS)
    S.clip_fn = lambda ctx: multi.clips_spider(ctx, dict(stride=0.30, lift=0.14), LEGS)
    return S
