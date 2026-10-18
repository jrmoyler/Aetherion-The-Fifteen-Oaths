"""Boar: massive-shouldered tusked brute, low wedge head, bristle crest, keratin shoulder plates.
oath-07 thornback: bark-thorn spines instead of bristles."""
import math
import numpy as np
from mathutils import Vector
from lib import core, kit, mats, quad
from lib.sdf import Clay, rot_to
from lib.build import Spec

J = dict(
    pelvis=(0, -0.42, 0.80), s1=(0, -0.12, 0.88), s2=(0, 0.18, 0.97), n0=(0, 0.36, 0.93),
    n1=(0, 0.48, 0.86), h0=(0, 0.56, 0.80), snout=(0, 0.98, 0.50),
    jaw0=(0, 0.62, 0.64), jaw1=(0, 0.92, 0.45),
    ear0=(0.085, 0.60, 0.90), ear1=(0.14, 0.53, 1.0),
    t0=(0, -0.57, 0.82), t1=(0, -0.63, 0.75), t2=(0, -0.665, 0.67), t3=(0, -0.68, 0.60), t4=(0, -0.69, 0.54),
    hip=(0.13, -0.42, 0.72), stifle=(0.15, -0.31, 0.46), hock=(0.135, -0.49, 0.25),
    hball=(0.125, -0.455, 0.055), htoe=(0.125, -0.39, 0.012),
    scap=(0.12, 0.22, 0.92), shoulder=(0.165, 0.32, 0.64), elbow=(0.155, 0.22, 0.43),
    wrist=(0.145, 0.30, 0.18), fball=(0.14, 0.33, 0.055), ftoe=(0.14, 0.395, 0.012),
)


def hoof(c, ball):
    x, y, z = ball
    c.cone((x, y - 0.01, z + 0.07), (x, y + 0.02, z + 0.005), 0.034, 0.03, k=0.02, mirror=True)  # pastern
    c.ell((x, y + 0.02, z + 0.01), (0.032, 0.035, 0.03), k=0.015, mirror=True)


def clay():
    c = Clay()
    c.ell((0, 0.04, 0.72), (0.235, 0.44, 0.26), k=0.06)                         # barrel
    c.ell((0, 0.24, 0.78), (0.25, 0.24, 0.29), k=0.07)                          # forequarters
    c.ell((0, 0.17, 0.97), (0.15, 0.24, 0.13), k=0.08)                          # hump
    c.ell((0, -0.37, 0.76), (0.19, 0.17, 0.17), k=0.07)                         # hams
    c.ell((0, 0.02, 0.55), (0.18, 0.32, 0.12), k=0.08)                          # belly
    # legs: short, thick
    c.ell((0.14, -0.38, 0.62), (0.08, 0.14, 0.16), R=rot_to((0, 0.3, -1)), k=0.06, mirror=True)
    c.cone(J["hip"], J["stifle"], 0.10, 0.065, k=0.05, mirror=True)
    c.ell((0.14, -0.40, 0.38), (0.05, 0.065, 0.09), R=rot_to((0, -0.9, -1)), k=0.045, mirror=True)
    c.cone(J["stifle"], J["hock"], 0.055, 0.032, k=0.035, mirror=True)
    c.cone(J["hock"], J["hball"], 0.032, 0.03, k=0.025, mirror=True)
    hoof(c, (0.125, -0.455, 0.032))
    c.ell((0.16, 0.27, 0.72), (0.07, 0.12, 0.17), R=rot_to((0, 0.4, -1)), k=0.06, mirror=True)
    c.cone(J["shoulder"], J["elbow"], 0.085, 0.06, k=0.05, mirror=True)
    c.ell((0.15, 0.25, 0.32), (0.045, 0.05, 0.08), k=0.035, mirror=True)
    c.cone(J["elbow"], J["wrist"], 0.055, 0.032, k=0.035, mirror=True)
    c.cone(J["wrist"], J["fball"], 0.032, 0.03, k=0.025, mirror=True)
    hoof(c, (0.14, 0.33, 0.032))
    # neck/head: short bull neck, wedge skull, jowls, flat snout disc
    c.cone((0, 0.30, 0.86), (0, 0.56, 0.76), 0.22, 0.155, k=0.07)
    c.cone((0, 0.56, 0.76), (0, 0.93, 0.53), 0.14, 0.07, k=0.05)
    c.ell((0, 0.66, 0.83), (0.11, 0.12, 0.08), k=0.05)                         # brow mass
    c.ell((0.085, 0.66, 0.64), (0.07, 0.11, 0.09), k=0.05, mirror=True)        # jowls
    c.cone((0, 0.62, 0.62), (0, 0.90, 0.47), 0.08, 0.045, k=0.04)              # mandible
    c.ell((0, 0.975, 0.505), (0.07, 0.035, 0.06), R=rot_to((0, 1, -0.55)), k=0.025)  # snout disc
    c.add("sphere", k=0.008, op="sub", c=(0.025, 1.0, 0.50), r=0.017, mirror=True)
    c.add("box", k=0.01, op="sub", c=(0, 0.83, 0.515), h=(0.11, 0.12, 0.007), R=rot_to((0, 1, -0.55)))
    c.add("sphere", k=0.01, op="sub", c=(0.088, 0.72, 0.77), r=0.017, mirror=True)
    c.ell((0.07, 0.72, 0.80), (0.035, 0.04, 0.02), k=0.03, mirror=True)        # brow over eye
    c.add("flatcone", k=0.03, a=J["ear0"], b=J["ear1"], ra=0.045, rb=0.01, flat=0.35, up=(1, 0.2, 0.3), mirror=True)
    c.chain([J["t0"], J["t1"], J["t2"], J["t3"], J["t4"]], [0.03, 0.022, 0.016, 0.012, 0.008], k=0.03)
    c.lumps(0.004, 22.0, seed=5, n=12)
    return c


def build(oath=None):
    S = Spec("boar", oath)
    S.height = 1.3
    S.clay = clay()
    S.voxel = 0.0075
    S.low_tris = 9500
    S.surface = mats.surface("fur", "hi_hide", scale=0.6, belly_z=0.55, dark=0.55, light=0.8)
    bone = mats.surface("bone", "hi_tusk")
    kera = mats.surface("chitin", "hi_kera", rough=0.45)
    glow = mats.surface("glow", "hi_glow")
    bristle = mats.surface("fur", "hi_bristle", belly_z=3.0, dark=0.5, light=0.5)
    S.tint = {"body": "#4a3f38", "secondary": "#1f1a17", "accent": "#d2c4a8", "glow": "#ffb04a"}
    V = Vector
    # tusks: from lower jaw, sweeping out, forward and up
    for s, g in quad.SIDES:
        pts = core.bezier_pts((0.05 * g, 0.86, 0.47), (0.12 * g, 0.93, 0.46), (0.17 * g, 0.96, 0.58), (0.13 * g, 0.88, 0.70), 9)
        S.part(core.horn(f"tusk{s}", pts, [0.026, 0.025, 0.023, 0.02, 0.017, 0.013, 0.009, 0.005, 0.0015], segs=8, flat=0.8), "jaw", "accent", bone)
        pts = core.bezier_pts((0.045 * g, 0.92, 0.53), (0.08 * g, 0.95, 0.55), (0.09 * g, 0.93, 0.62), None, 6)
        S.part(core.horn(f"utusk{s}", pts, [0.014, 0.013, 0.011, 0.008, 0.005, 0.001], segs=6), "head", "accent", bone)
        S.part(kit.eye(f"eye{s}", (0.087 * g, 0.722, 0.768), 0.011), "head", "glow", glow)
    # hooves (cloven)
    for s, g in quad.SIDES:
        for key, bn in (("fball", f"ftoe_{s}"), ("hball", f"htoe_{s}")):
            b = V(J[key]); b.x *= g
            for d in (-1, 1):
                h = core.box(f"hoof{key}{s}{d}", (0.04, 0.075, 0.06), b + V((d * 0.022, 0.05, -0.025)), rot=(0.3, 0, 0),
                             bevel=0.009, taper=(0.7, 0.55))
                S.part(h, bn, "accent", kera)
    # crest: bristles or thorns along spine
    path = []
    for i in range(18):
        u = i / 17
        y = 0.46 - 0.86 * u
        z = 0.90 + 0.16 * math.sin(math.pi * min(1, (u + 0.1) * 1.15)) - 0.08 * u
        bn = "neck1" if y > 0.36 else "chest" if y > 0.18 else "spine2" if y > -0.12 else "spine1"
        path.append(((0, y, z), bn))
    if oath == "oath-07":
        S.tint.update(body="#4a3a28", accent="#5f7a3a", glow="#ffc04a")
        bark = mats.surface("bark", "hi_bark")
        for i, (p, bn) in enumerate(path):
            for sgn in (-1, 1):
                S.part(kit.spike(f"thorn{i}{sgn}", V(p) + V((0.05 * sgn, 0, -0.04)), (0.5 * sgn, -0.5, 1.0), 0.14, 0.022, bend=(0, -0.2, 0.1)),
                       bn, "accent", bark)
    else:
        if oath == "oath-05":
            S.tint.update(body="#4a4440", accent="#c8a77a", glow="#b07cff")
        for i, (p, bn) in enumerate(path):
            S.part(kit.bristle_clump(f"crest{i}", V(p) - V((0, 0, 0.03)), (0, 0.2, 1), (0, -1, 0.25), n=9, length=0.24, r=0.02,
                                     spread=0.04, seed=i), bn, "secondary", bristle)
    S.part(kit.bristle_clump("tailtuft", J["t4"], (0, -0.3, -1), (0, -0.2, -1), n=6, length=0.08, r=0.01, spread=0.01), "tail4",
           "secondary", bristle)
    S.bones = quad.skeleton(J)
    S.legs = quad.legs()
    S.joint_limits = dict(S.joint_limits, thigh_=30, upper_=30)   # keep flank / armpit / coxa folds open
    S.clip_fn = lambda ctx: quad.clips(ctx, dict(stride_w=0.5, stride_r=1.0, lift=0.2, heavy=0.6, attack="gore",
                                                 roar=True, body_half_width=0.24, walk_frames=30, run_frames=16))
    return S
