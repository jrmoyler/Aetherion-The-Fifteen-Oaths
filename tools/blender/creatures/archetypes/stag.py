"""Stag: tall elk-like grazer with a heavy branching rack, throat mane and slender cannon legs."""
import math
from mathutils import Vector
from lib import core, kit, mats, quad
from lib.sdf import Clay, rot_to
from lib.build import Spec

J = dict(
    pelvis=(0, -0.50, 1.12), s1=(0, -0.18, 1.16), s2=(0, 0.20, 1.23), n0=(0, 0.40, 1.29),
    n1=(0, 0.53, 1.45), h0=(0, 0.61, 1.60), snout=(0, 0.95, 1.47),
    jaw0=(0, 0.66, 1.53), jaw1=(0, 0.92, 1.43),
    ear0=(0.065, 0.62, 1.645), ear1=(0.19, 0.575, 1.70),
    t0=(0, -0.62, 1.16), t1=(0, -0.68, 1.11), t2=(0, -0.71, 1.05), t3=(0, -0.72, 0.99), t4=(0, -0.725, 0.94),
    hip=(0.12, -0.50, 1.04), stifle=(0.15, -0.38, 0.72), hock=(0.12, -0.60, 0.43),
    hball=(0.11, -0.56, 0.075), htoe=(0.11, -0.495, 0.012),
    scap=(0.11, 0.24, 1.24), shoulder=(0.15, 0.36, 0.92), elbow=(0.14, 0.24, 0.68),
    wrist=(0.13, 0.32, 0.31), fball=(0.12, 0.35, 0.075), ftoe=(0.12, 0.415, 0.012),
)


def hoof(c, ball):
    x, y, z = ball
    c.ell((x, y + 0.012, z - 0.01), (0.03, 0.035, 0.034), k=0.02, mirror=True)


def clay():
    c = Clay()
    c.ell((0, 0.12, 1.0), (0.19, 0.38, 0.25), k=0.06)                          # ribcage
    c.ell((0, 0.30, 0.95), (0.14, 0.14, 0.18), k=0.06)                         # chest
    c.ell((0, 0.20, 1.19), (0.12, 0.22, 0.09), k=0.07)                         # withers
    c.cone((0, -0.05, 1.04), (0, -0.44, 1.07), 0.15, 0.15, k=0.07)             # loin
    c.ell((0, -0.48, 1.10), (0.155, 0.17, 0.13), k=0.06)                       # croup
    c.ell((0.115, -0.44, 0.93), (0.075, 0.16, 0.2), R=rot_to((0, 0.3, -1)), k=0.06, mirror=True)
    c.cone(J["hip"], J["stifle"], 0.10, 0.06, k=0.05, mirror=True)
    c.ell((0.135, -0.47, 0.62), (0.045, 0.07, 0.12), R=rot_to((0, -0.9, -1)), k=0.045, mirror=True)
    c.cone(J["stifle"], J["hock"], 0.05, 0.026, k=0.035, mirror=True)
    c.cone((0.12, -0.52, 0.58), (0.12, -0.63, 0.45), 0.018, 0.015, k=0.03, mirror=True)
    c.cone(J["hock"], J["hball"], 0.026, 0.022, k=0.02, mirror=True)
    hoof(c, J["hball"])
    c.ell((0.13, 0.28, 1.08), (0.06, 0.12, 0.17), R=rot_to((0, 0.4, -1)), k=0.06, mirror=True)
    c.cone(J["shoulder"], J["elbow"], 0.08, 0.055, k=0.05, mirror=True)
    c.cone(J["elbow"], J["wrist"], 0.05, 0.026, k=0.035, mirror=True)
    c.ell((0.14, 0.27, 0.58), (0.04, 0.05, 0.1), k=0.035, mirror=True)
    c.cone(J["wrist"], J["fball"], 0.026, 0.022, k=0.02, mirror=True)
    hoof(c, J["fball"])
    c.cone((0, 0.34, 1.20), J["n1"], 0.16, 0.105, k=0.07)
    c.cone(J["n1"], (0, 0.61, 1.585), 0.105, 0.08, k=0.05)
    c.ell((0, 0.48, 1.28), (0.09, 0.12, 0.14), k=0.06)                        # throat/dewlap
    c.ell((0, 0.655, 1.60), (0.08, 0.11, 0.078), k=0.04)
    c.add("flatcone", k=0.035, a=(0, 0.72, 1.585), b=(0, 0.945, 1.49), ra=0.065, rb=0.042, flat=0.85)
    c.cone((0, 0.66, 1.53), (0, 0.91, 1.445), 0.042, 0.03, k=0.03)
    c.add("box", k=0.008, op="sub", c=(0, 0.88, 1.465), h=(0.06, 0.07, 0.005), R=rot_to((0, 1, -0.4)))
    c.add("sphere", k=0.01, op="sub", c=(0.072, 0.71, 1.615), r=0.017, mirror=True)
    c.ell((0.06, 0.72, 1.635), (0.03, 0.04, 0.016), k=0.025, mirror=True)
    c.add("sphere", k=0.006, op="sub", c=(0.022, 0.955, 1.49), r=0.012, mirror=True)
    c.ell((0.05, 0.64, 1.665), (0.025, 0.025, 0.02), k=0.02, mirror=True)       # pedicles
    c.add("flatcone", k=0.025, a=J["ear0"], b=J["ear1"], ra=0.04, rb=0.012, flat=0.35, up=(0.2, 0.3, 1), mirror=True)
    c.chain([J["t0"], J["t1"], J["t2"], J["t3"], J["t4"]], [0.05, 0.045, 0.035, 0.025, 0.012], k=0.03)
    c.lumps(0.003, 30.0, seed=11, n=12)
    return c


def build(oath=None):
    S = Spec("stag", oath)
    S.height = 2.1
    S.clay = clay()
    S.voxel = 0.009
    S.low_tris = 9000
    S.surface = mats.surface("fur", "hi_fur", scale=0.7, belly_z=0.95, dark=0.55, light=0.85)
    antler_m = mats.surface("bone", "hi_antler", rough=0.6)
    kera = mats.surface("chitin", "hi_hoof", rough=0.45)
    glow = mats.surface("glow", "hi_glow")
    mane = mats.surface("fur", "hi_mane", belly_z=3.0, dark=0.6, light=0.6)
    S.tint = {"body": "#5a4a3a", "secondary": "#2e261f", "accent": "#d8cbb0", "glow": "#ffe0a0"}
    V = Vector
    for s, g in quad.SIDES:
        S.part(kit.antler(f"ant{s}", (0.05 * g, 0.64, 1.67), g, scale=0.72, seed=3 + (g > 0), tines=4), "head", "accent", antler_m)
        S.part(kit.eye(f"eye{s}", (0.071 * g, 0.716, 1.613), 0.012), "head", "glow", glow)
        for key, bn in (("fball", f"ftoe_{s}"), ("hball", f"htoe_{s}")):
            b = V(J[key]); b.x *= g
            for d in (-1, 1):
                S.part(core.box(f"hoof{key}{s}{d}", (0.03, 0.07, 0.06), b + V((d * 0.017, 0.035, -0.035)), rot=(0.35, 0, 0),
                                bevel=0.008, taper=(0.7, 0.5)), bn, "accent", kera)
    # throat mane hanging from the neck
    k = 0
    for i in range(6):
        u = i / 5
        y = 0.40 + 0.18 * u; z = 1.22 + 0.25 * u
        bn = "neck1" if u < 0.6 else "neck2"
        for sgn in (-1, 0, 1):
            S.part(kit.bristle_clump(f"mane{k}", (sgn * 0.06, y + 0.06, z - 0.05), (sgn * 0.5, 0.6, -0.4), (sgn * 0.2, 0.15, -1),
                                     n=6, length=0.20, r=0.018, spread=0.03, seed=k), bn, "secondary", mane)
            k += 1
    if oath == "oath-07":
        moss = mats.surface("moss", "hi_moss")
        for s, g in quad.SIDES:
            for j, (dx, dy, dz) in enumerate(((0.12, -0.05, 0.25), (0.2, 0.05, 0.45))):
                S.part(core.ico(f"moss{s}{j}", 0.05, (0.05 * g + dx * g, 0.64 + dy, 1.67 + dz), sub=2, scale=(1.4, 1, 0.6),
                                jitter=0.25, seed=j), "head", "secondary", moss)
    S.bones = quad.skeleton(J)
    S.legs = quad.legs()
    S.clip_fn = lambda ctx: quad.clips(ctx, dict(stride_w=0.5, stride_r=1.15, lift=0.2, attack="gore", roar=True,
                                                 body_half_width=0.2, walk_frames=34, run_frames=18))
    return S
