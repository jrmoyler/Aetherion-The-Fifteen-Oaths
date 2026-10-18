"""Hound: lean, deep-chested dark-fantasy canid with bony dorsal spurs and a bristled mane.
Variants: oath-01 ember-cracked (glowing fissures), oath-02 rime (ice shards on the ridge),
oath-15 rail hound (riveted iron plating on spine/legs)."""
import math
from mathutils import Vector
from lib import core, kit, mats, quad
from lib.sdf import Clay, rot_to
from lib.build import Spec

J = dict(
    pelvis=(0, -0.40, 0.70), s1=(0, -0.12, 0.735), s2=(0, 0.16, 0.80), n0=(0, 0.34, 0.84),
    n1=(0, 0.46, 0.90), h0=(0, 0.55, 0.955), snout=(0, 0.86, 0.90),
    jaw0=(0, 0.58, 0.905), jaw1=(0, 0.84, 0.865),
    ear0=(0.05, 0.57, 1.01), ear1=(0.09, 0.47, 1.13),
    t0=(0, -0.50, 0.73), t1=(0, -0.63, 0.66), t2=(0, -0.75, 0.56), t3=(0, -0.84, 0.45), t4=(0, -0.90, 0.34),
    hip=(0.085, -0.40, 0.64), stifle=(0.115, -0.30, 0.42), hock=(0.10, -0.51, 0.22),
    hball=(0.095, -0.475, 0.035), htoe=(0.095, -0.40, 0.012),
    scap=(0.08, 0.22, 0.85), shoulder=(0.11, 0.33, 0.60), elbow=(0.105, 0.21, 0.40),
    wrist=(0.10, 0.29, 0.13), fball=(0.10, 0.325, 0.035), ftoe=(0.10, 0.40, 0.012),
)


def paw(c, ball):
    x, y, z = ball
    c.ell((x, y, z + 0.008), (0.034, 0.04, 0.03), k=0.02, mirror=True)                      # metacarpal pad
    for i, dx in enumerate((-0.026, -0.009, 0.009, 0.026)):
        fy = 0.045 - 0.012 * abs(dx) / 0.026
        c.ell((x + dx, y + fy, z - 0.004), (0.0125, 0.02, 0.016), k=0.012, mirror=True)       # toes


def clay():
    c = Clay()
    # torso: deep ribcage, keel, tucked waist, hunched withers, croup
    c.ell((0, 0.15, 0.665), (0.15, 0.26, 0.195), k=0.05)
    c.ell((0, 0.29, 0.585), (0.10, 0.12, 0.14), k=0.06)                      # brisket
    c.ell((0, 0.16, 0.82), (0.11, 0.22, 0.09), k=0.07)                       # withers hump / trapezius
    c.cone((0, 0.10, 0.80), (0, -0.14, 0.76), 0.085, 0.072, k=0.06)          # back musculature
    c.cone((0, -0.04, 0.70), (0, -0.34, 0.69), 0.07, 0.095, k=0.07)           # loin / tucked waist
    c.ell((0, -0.40, 0.70), (0.105, 0.14, 0.10), k=0.05)                     # croup
    for i, (y, z, a) in enumerate(((0.22, 0.62, 0.12), (0.12, 0.60, 0.10), (0.02, 0.62, 0.08), (-0.07, 0.65, 0.06))):
        c.ell((0.125 - 0.004 * i, y, z), (0.022, 0.03, a + 0.06), R=rot_to((0, -0.35, -1)), k=0.03, mirror=True)  # ribs
    # hind legs
    c.ell((0.088, -0.37, 0.56), (0.066, 0.14, 0.15), R=rot_to((0, 0.3, -1)), k=0.06, mirror=True)  # haunch
    c.cone(J["hip"], J["stifle"], 0.08, 0.05, k=0.05, mirror=True)
    c.ell((0.105, -0.38, 0.36), (0.038, 0.055, 0.09), R=rot_to((0, -0.9, -1)), k=0.045, mirror=True) # gaskin
    c.cone(J["stifle"], J["hock"], 0.042, 0.021, k=0.035, mirror=True)
    c.cone((0.10, -0.43, 0.33), (0.10, -0.53, 0.23), 0.016, 0.013, k=0.03, mirror=True)            # achilles
    c.cone(J["hock"], J["hball"], 0.022, 0.019, k=0.02, mirror=True)
    paw(c, (0.095, -0.465, 0.03))
    # forelegs
    c.ell((0.095, 0.27, 0.74), (0.048, 0.10, 0.14), R=rot_to((0, 0.4, -1)), k=0.05, mirror=True)   # scapula
    c.cone(J["shoulder"], J["elbow"], 0.06, 0.042, k=0.05, mirror=True)
    c.ell((0.10, 0.31, 0.56), (0.05, 0.06, 0.08), k=0.05, mirror=True)                            # deltoid/triceps
    c.cone((0.105, 0.195, 0.395), (0.105, 0.205, 0.36), 0.026, 0.022, k=0.04, mirror=True)          # olecranon (clear of the brisket crease)
    c.cone(J["elbow"], J["wrist"], 0.04, 0.022, k=0.03, mirror=True)
    c.ell((0.105, 0.235, 0.32), (0.034, 0.042, 0.075), k=0.03, mirror=True)                       # forearm muscle
    c.cone(J["wrist"], J["fball"], 0.022, 0.02, k=0.02, mirror=True)
    paw(c, (0.10, 0.325, 0.03))
    # neck + head: short thick neck, broad wolf skull, heavy jaw muscles
    c.cone((0, 0.30, 0.80), J["n1"], 0.13, 0.10, k=0.06)
    c.cone(J["n1"], (0, 0.55, 0.95), 0.10, 0.08, k=0.05)
    c.ell((0, 0.45, 0.84), (0.08, 0.10, 0.10), k=0.05)                             # throat
    c.ell((0, 0.60, 0.955), (0.085, 0.10, 0.078), k=0.04)                          # cranium
    c.ell((0, 0.585, 0.995), (0.03, 0.08, 0.04), k=0.03)                           # sagittal crest
    c.ell((0.058, 0.635, 0.93), (0.04, 0.07, 0.048), k=0.035, mirror=True)         # masseter
    c.add("flatcone", k=0.035, a=(0, 0.66, 0.945), b=(0, 0.855, 0.905), ra=0.058, rb=0.036, flat=0.78)
    c.ell((0.036, 0.685, 0.985), (0.03, 0.04, 0.018), k=0.025, mirror=True)        # brow ridge
    c.cone((0, 0.60, 0.89), (0, 0.835, 0.868), 0.042, 0.025, k=0.03)               # mandible
    c.add("box", k=0.008, op="sub", c=(0, 0.775, 0.884), h=(0.075, 0.095, 0.005))  # mouth line
    c.add("sphere", k=0.01, op="sub", c=(0.052, 0.71, 0.958), r=0.016, mirror=True)  # eye sockets
    c.add("sphere", k=0.006, op="sub", c=(0.014, 0.866, 0.915), r=0.009, mirror=True) # nostrils
    c.add("flatcone", k=0.025, a=J["ear0"], b=J["ear1"], ra=0.036, rb=0.006, flat=0.38, up=(1, 0.3, 0), mirror=True)
    # tail
    c.chain([J["t0"], J["t1"], J["t2"], J["t3"], J["t4"]], [0.045, 0.04, 0.033, 0.024, 0.013], k=0.03)
    c.lumps(0.0025, 38.0, seed=3, n=12)
    return c


def build(oath=None):
    S = Spec("hound", oath)
    S.height = 1.1
    S.clay = clay()
    S.voxel = 0.0055
    S.low_tris = 9500
    S.surface = mats.surface("fur", "hi_fur", belly_z=0.62, dark=0.55, light=0.88)
    bone = mats.surface("bone", "hi_bone")
    glow = mats.surface("glow", "hi_glow")
    furm = mats.surface("fur", "hi_mane", belly_z=2.0, dark=0.6, light=0.6)
    S.tint = {"body": "#3a3330", "secondary": "#1e1a18", "accent": "#b9ad98", "glow": "#ff6a1a"}
    V = Vector
    # claws (4 per paw)
    for s, g in quad.SIDES:
        for key, bn in (("fball", f"ftoe_{s}"), ("hball", f"htoe_{s}")):
            b = V(J[key]); b.x *= g
            S.part(kit.paw_claws(f"claw{key}{s}", b + V((0, 0.035, 0.0)), n=4, spread=0.04, length=0.035, r=0.007),
                   bn, "accent", bone)
    # fangs
    up = [kit.spike(f"fang{s}", (0.024 * g, 0.83, 0.885), (0.05 * g, 0.2, -1), 0.04, 0.007) for s, g in quad.SIDES]
    S.part(core.join(up), "head", "accent", bone)
    lo = [kit.spike(f"lfang{s}", (0.02 * g, 0.815, 0.878), (0, 0.1, 1), 0.026, 0.006) for s, g in quad.SIDES]
    S.part(core.join(lo), "jaw", "accent", bone)
    S.part(kit.tooth_row("teethL", (0.032, 0.74, 0.888), (0.026, 0.80, 0.886), 4, 0.014, 0.004), "head", "accent", bone)
    S.part(kit.tooth_row("teethR", (-0.032, 0.74, 0.888), (-0.026, 0.80, 0.886), 4, 0.014, 0.004), "head", "accent", bone)
    # eyes
    for s, g in quad.SIDES:
        S.part(kit.eye(f"eye{s}", (0.05 * g, 0.713, 0.958), 0.013), "head", "glow", glow)
    # dorsal spurs along spine (bone) — sloped backward like hackles
    path = [((0, -0.30, 0.80), "spine1"), ((0, -0.18, 0.81), "spine1"), ((0, -0.05, 0.835), "spine2"),
            ((0, 0.05, 0.875), "spine2"), ((0, 0.15, 0.905), "chest"), ((0, 0.25, 0.905), "chest")]
    for i, (p, bn) in enumerate(path):
        L = 0.05 + 0.05 * math.sin(math.pi * (i + 0.5) / len(path))
        S.part(kit.spike(f"spur{i}", V(p) - V((0, 0, 0.03)), (0, -0.9, 1.0), L + 0.02, 0.018, bend=(0, -0.4, 0), flat=0.4, flat_side=True),
               bn, "accent", bone)
    # mane: bristle clumps over neck and shoulders, combed back
    import numpy as np
    rng = np.random.default_rng(7)
    k = 0
    for bn, y0, y1, z0, z1 in (("neck1", 0.32, 0.46, 0.925, 0.975), ("neck2", 0.46, 0.54, 0.975, 1.01), ("chest", 0.22, 0.32, 0.9, 0.925)):
        for j in range(5):
            u = j / 4.0
            for sgn in (-1, 0, 1):
                c = V((sgn * 0.055, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u - abs(sgn) * 0.035))
                nrm = V((sgn * 0.8, 0.1, 1.0))
                S.part(kit.bristle_clump(f"mane{k}", c, nrm, (sgn * 0.3, -1, -0.15), n=5, length=0.13, r=0.013,
                                         spread=0.02, seed=k), bn, "secondary", furm)
                k += 1
    # ---- oath dressing
    if oath == "oath-01":  # ember: glowing fissures along flanks + cinder spurs
        S.tint.update(body="#2a2422", accent="#9a4a2c", glow="#ff6a1a")
        for i, (y, z) in enumerate(((0.10, 0.62), (0.02, 0.66), (0.20, 0.58))):
            for s, g in quad.SIDES:
                pts = core.bezier_pts((0.13 * g, y + 0.1, z + 0.1), (0.14 * g, y, z), (0.125 * g, y - 0.05, z - 0.08), None, 6)
                S.part(core.horn(f"crack{i}{s}", pts, [0.006, 0.008, 0.009, 0.008, 0.006, 0.003], segs=5, flat=0.5),
                       "spine2", "glow", glow)
    elif oath == "oath-02":
        S.tint.update(body="#d8dde2", accent="#4a5058", glow="#8fdcff")
        ice = mats.surface("ice", "hi_ice")
        for i, (p, bn) in enumerate(path[1:-1]):
            S.part(kit.spike(f"icespk{i}", V(p) + V((0.03, 0, -0.02)), (0.5, -0.4, 1.0), 0.09, 0.02, flat=0.6, segs=5), bn, "glow", ice)
            S.part(kit.spike(f"icespkb{i}", V(p) + V((-0.03, 0, -0.02)), (-0.5, -0.4, 1.0), 0.08, 0.018, flat=0.6, segs=5), bn, "glow", ice)
        S.glow_strength = 1.5
    elif oath == "oath-15":
        S.tint.update(body="#3a3c40", accent="#f07a20", glow="#ffa040")
        iron = mats.surface("iron", "hi_iron")
        for i, (p, bn) in enumerate(path):
            S.part(kit.plate(f"spplate{i}", V(p) + V((0, 0.0, -0.035)), (0.13, 0.11, 0.02), rot=(0.12, 0, 0), bevel=0.005),
                   bn, "accent", iron)
        for s, g in quad.SIDES:
            S.part(core.cylinder(f"greave{s}", 0.03, 0.12, (0.10 * g, 0.27, 0.26), rot=(0.25, 0, 0), segs=10, r2=0.024, bevel=0.003),
                   f"fore_{s}", "accent", iron)
    S.bones = quad.skeleton(J)
    S.legs = quad.legs()
    S.joint_limits = dict(S.joint_limits, thigh_=30, upper_=30)   # keep flank / armpit / coxa folds open
    S.clip_fn = lambda ctx: quad.clips(ctx, dict(stride_w=0.55, stride_r=1.2, lift=0.18, attack="bite",
                                                 roar=True, body_half_width=0.15))
    return S
