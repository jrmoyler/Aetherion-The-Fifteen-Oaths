"""Raptor: lean bipedal theropod — drumstick thighs, sickle-clawed feet, whip tail, quilled crest
and feathered fore-limbs."""
import math
import numpy as np
from mathutils import Vector
from lib import core, kit, mats, biped
from lib.sdf import Clay, rot_to
from lib.build import Spec

J = dict(
    hips=(0, -0.05, 1.02), s1=(0, 0.28, 1.10), n0=(0, 0.52, 1.17), n1=(0, 0.66, 1.34), h0=(0, 0.74, 1.47),
    snout=(0, 1.07, 1.43), jaw0=(0, 0.78, 1.425), jaw1=(0, 1.04, 1.385),
    t0=(0, -0.22, 1.04), t1=(0, -0.50, 1.02), t2=(0, -0.80, 0.98), t3=(0, -1.10, 0.93), t4=(0, -1.38, 0.89),
    t5=(0, -1.62, 0.86),
    hip=(0.12, 0.0, 0.96), knee=(0.15, 0.20, 0.62), ankle=(0.13, -0.12, 0.30), ball=(0.12, -0.02, 0.045),
    toe=(0.12, 0.17, 0.012),
    shoulder=(0.11, 0.50, 1.06), elbow=(0.15, 0.46, 0.90), wrist=(0.14, 0.60, 0.82), hand=(0.13, 0.70, 0.76),
)


def clay():
    c = Clay()
    c.ell((0, 0.17, 1.05), (0.17, 0.36, 0.19), k=0.06)                          # torso
    c.ell((0, 0.40, 1.02), (0.14, 0.16, 0.18), k=0.06)                          # chest/furcula
    c.ell((0, -0.08, 1.05), (0.13, 0.18, 0.13), k=0.06)                         # pelvis
    # leg mass as long tapered forms with generous blends (the old drumstick / calf ellipsoids met
    # the thin bone cones in hard knobs that read as lumpy, bulbous knees)
    c.cone((0.115, -0.02, 0.93), (0.145, 0.17, 0.66), 0.125, 0.062, k=0.09, mirror=True)       # drumstick
    c.cone(J["hip"], J["knee"], 0.095, 0.058, k=0.08, mirror=True)
    c.cone((0.148, 0.16, 0.60), (0.135, -0.04, 0.38), 0.058, 0.036, k=0.08, mirror=True)       # calf
    c.cone(J["knee"], J["ankle"], 0.052, 0.032, k=0.06, mirror=True)
    c.cone(J["ankle"], J["ball"], 0.032, 0.026, k=0.025, mirror=True)
    for dx, L in ((-0.035, 0.12), (0.0, 0.16), (0.035, 0.13)):
        c.cone((0.12 + dx * 0.4, -0.02, 0.04), (0.12 + dx, -0.02 + L, 0.018), 0.022, 0.013, k=0.015, mirror=True)
    c.cone((0.10, 0.0, 0.06), (0.095, 0.06, 0.10), 0.018, 0.014, k=0.015, mirror=True)  # sickle digit raised
    # neck S curve + head
    c.cone((0, 0.44, 1.10), J["n1"], 0.14, 0.085, k=0.06)
    c.cone(J["n1"], (0, 0.74, 1.455), 0.085, 0.072, k=0.05)
    c.ell((0, 0.785, 1.485), (0.075, 0.11, 0.082), k=0.04)
    c.add("flatcone", k=0.035, a=(0, 0.84, 1.475), b=(0, 1.06, 1.425), ra=0.072, rb=0.034, flat=0.72, up=(1, 0, 0))
    c.cone((0, 0.78, 1.42), (0, 1.035, 1.385), 0.05, 0.025, k=0.03)
    c.add("box", k=0.008, op="sub", c=(0, 0.95, 1.405), h=(0.08, 0.12, 0.005), R=rot_to((0, 1, -0.2)))
    c.add("sphere", k=0.01, op="sub", c=(0.06, 0.84, 1.505), r=0.017, mirror=True)
    c.ell((0.05, 0.86, 1.53), (0.024, 0.065, 0.016), k=0.02, mirror=True)        # brow ridge
    c.add("sphere", k=0.006, op="sub", c=(0.018, 1.045, 1.44), r=0.008, mirror=True)
    # arms
    c.cone(J["shoulder"], J["elbow"], 0.04, 0.03, k=0.035, mirror=True)
    c.cone(J["elbow"], J["wrist"], 0.028, 0.02, k=0.025, mirror=True)
    c.cone(J["wrist"], J["hand"], 0.02, 0.014, k=0.015, mirror=True)
    # tail
    c.chain([J[f"t{i}"] for i in range(6)], [0.12, 0.095, 0.07, 0.048, 0.03, 0.014], k=0.04)
    c.lumps(0.003, 30.0, seed=21, n=12)
    return c


def build(oath=None):
    S = Spec("raptor", oath)
    S.height = 1.9
    S.clay = clay()
    S.voxel = 0.0085
    S.low_tris = 9000
    S.surface = mats.surface("scales", "hi_scales", cells=70.0, base=0.8)
    claw_m = mats.surface("bone", "hi_claw", rough=0.4)
    quill = mats.surface("fur", "hi_quill", belly_z=5, dark=0.65, light=0.65, scale=0.5)
    glow = mats.surface("glow", "hi_glow")
    S.tint = {"body": "#3c3a34", "secondary": "#1c1b19", "accent": "#cfc3ad", "glow": "#b4a2ff"}
    V = Vector
    for s, g in biped.SIDES:
        # toe claws + sickle claw
        for j, (dx, L) in enumerate(((-0.035, 0.12), (0.0, 0.16), (0.035, 0.13))):
            tip = V(((0.12 + dx) * g, -0.02 + L, 0.02))
            S.part(kit.claw(f"tc{s}{j}", tip, (dx * g * 2, 1, -0.2), 0.04, 0.011), f"toe_{s}", "accent", claw_m)
        S.part(kit.claw(f"sickle{s}", V((0.095 * g, 0.06, 0.10)), (0, 1, 0.6), 0.10, 0.017, curve=0.9), f"toe_{s}", "accent", claw_m)
        for j in range(3):
            S.part(kit.claw(f"hc{s}{j}", V((0.13 * g + (j - 1) * 0.012, 0.70, 0.76)), (0, 0.6, -1), 0.05, 0.007), f"hand_{s}", "accent", claw_m)
        S.part(kit.eye(f"eye{s}", (0.059 * g, 0.846, 1.506), 0.013), "head", "glow", glow)
        # forelimb feathers: flattened quills trailing from the forearm
        for i in range(5):
            u = i / 4
            p = V(J["elbow"]).lerp(V(J["hand"]), u); p.x *= g
            S.part(kit.spike(f"fth{s}{i}", p, (0.15 * g, -0.6, -0.8), 0.16 - 0.02 * i, 0.016, bend=(0, -0.2, 0), segs=5, flat=0.25),
                   f"forearm_{s}" if u < 0.8 else f"hand_{s}", "secondary", quill)
    S.part(kit.tooth_row("teethL", (0.045, 0.85, 1.415), (0.03, 1.02, 1.395), 7, 0.022, 0.006), "head", "accent", claw_m)
    S.part(kit.tooth_row("teethR", (-0.045, 0.85, 1.415), (-0.03, 1.02, 1.395), 7, 0.022, 0.006), "head", "accent", claw_m)
    # quilled crest: head -> neck -> back -> tail base
    crest = []
    path = [((0, 0.80, 1.56), "head", 0.24), ((0, 0.73, 1.54), "head", 0.28), ((0, 0.68, 1.44), "neck2", 0.24),
            ((0, 0.62, 1.34), "neck1", 0.2), ((0, 0.54, 1.25), "neck1", 0.18), ((0, 0.42, 1.21), "chest", 0.15),
            ((0, 0.30, 1.22), "chest", 0.14), ((0, 0.16, 1.22), "spine1", 0.13), ((0, 0.02, 1.18), "spine1", 0.12),
            ((0, -0.14, 1.17), "hips", 0.1), ((0, -0.32, 1.12), "tail1", 0.09)]
    for i, (p, bn, L) in enumerate(path):
        for sgn in (-1, 1):
            S.part(kit.spike(f"q{i}{sgn}", V(p) + V((0.025 * sgn, 0, -0.03)), (0.25 * sgn, -1.0, 0.55), L * 1.2, 0.017,
                             bend=(0, -0.2, 0.15), segs=5, flat=0.4), bn, "secondary", quill)
    if oath == "oath-05":
        S.tint.update(body="#a58a68", accent="#4a4440", glow="#b07cff")
    S.bones = biped.raptor(J)
    S.legs = biped.raptor_legs()
    S.clip_fn = lambda ctx: biped.clips_raptor(ctx, dict(stride=0.75, lift=0.22, body_half_width=0.18, roar=True))
    return S
