"""Shared quadruped skeleton + gait library (hound, boar, stag, drake)."""
import math
from mathutils import Vector
from .rig import Bone, half_bone
from .anim import Leg, env, smooth, step_cycle, ease_in, ease_out

SIDES = (("L", 1.0), ("R", -1.0))


def mx(p, sgn):
    return Vector((p[0] * sgn, p[1], p[2]))


def skeleton(J, tail_n=4, jaw=True, ears=True, extra=None):
    """J: dict of design-space joints (left side for paired joints, x>0)."""
    B = [Bone("root", (0, 0, 0), (0, 0.25, 0), None, deform=False)]
    pel = Vector(J["pelvis"])
    B.append(Bone("hips", pel, pel + Vector((0, -0.12, 0.0)), "root"))
    B.append(Bone("spine1", pel, J["s1"], "hips"))
    B.append(Bone("spine2", J["s1"], J["s2"], "spine1"))
    B.append(Bone("chest", J["s2"], J["n0"], "spine2"))
    B.append(Bone("neck1", J["n0"], J["n1"], "chest"))
    B.append(Bone("neck2", J["n1"], J["h0"], "neck1"))
    B.append(Bone("head", J["h0"], J["snout"], "neck2"))
    if jaw:
        B.append(Bone("jaw", J["jaw0"], J["jaw1"], "head"))
    if ears:
        for s, g in SIDES:
            B.append(Bone(f"ear_{s}", mx(J["ear0"], g), mx(J["ear1"], g), "head"))
    prev = "hips"
    for i in range(tail_n):
        B.append(Bone(f"tail{i + 1}", J[f"t{i}"], J[f"t{i + 1}"], prev))
        prev = f"tail{i + 1}"
    for s, g in SIDES:
        B.append(Bone(f"thigh_{s}", mx(J["hip"], g), mx(J["stifle"], g), "hips"))
        B.append(Bone(f"shin_{s}", mx(J["stifle"], g), mx(J["hock"], g), f"thigh_{s}"))
        B.append(Bone(f"meta_{s}", mx(J["hock"], g), mx(J["hball"], g), f"shin_{s}"))
        B.append(Bone(f"htoe_{s}", mx(J["hball"], g), mx(J["htoe"], g), f"meta_{s}"))
        B.append(Bone(f"scap_{s}", mx(J["scap"], g), mx(J["shoulder"], g), "chest"))
        B.append(Bone(f"upper_{s}", mx(J["shoulder"], g), mx(J["elbow"], g), f"scap_{s}"))
        B.append(Bone(f"fore_{s}", mx(J["elbow"], g), mx(J["wrist"], g), f"upper_{s}"))
        B.append(Bone(f"carp_{s}", mx(J["wrist"], g), mx(J["fball"], g), f"fore_{s}"))
        B.append(Bone(f"ftoe_{s}", mx(J["fball"], g), mx(J["ftoe"], g), f"carp_{s}"))
    # ventral helpers (deform, never keyed; ride chest / spine2) -- own the brisket and belly
    sh, s1, s2, pel = Vector(J["shoulder"]), Vector(J["s1"]), Vector(J["s2"]), Vector(J["pelvis"])
    by = {b.name: b for b in B}
    for s, g in SIDES:
        B.append(half_bone(by[f"thigh_{s}"], "hips"))
        B.append(half_bone(by[f"upper_{s}"], f"scap_{s}"))
        B.append(half_bone(by[f"shin_{s}"], f"thigh_{s}"))
        B.append(half_bone(by[f"fore_{s}"], f"upper_{s}"))
    B.append(half_bone(by["neck1"], "chest"))
    B.append(Bone("sternum", (0, sh.y, 0), (0, s2.y, 0), "chest", ventral=0.32))
    B.append(Bone("belly", (0, s2.y, 0), (0, s1.y + 0.05 * (pel.y - s1.y), 0), "spine2", ventral=0.32))
    if extra:
        B += extra
    return B


def legs():
    L = []
    for s, g in SIDES:
        L.append(Leg(f"H{s}", [f"thigh_{s}", f"shin_{s}", f"meta_{s}", f"htoe_{s}"], pole=(0, 1, 0)))
        L.append(Leg(f"F{s}", [f"upper_{s}", f"fore_{s}", f"carp_{s}", f"ftoe_{s}"], pole=(0, -1, 0)))
    return L


SPINE = ["spine1", "spine2", "chest"]
NECK = ["neck1", "neck2"]


def clips(ctx, p):
    """p: dict of gait params: stride_w, stride_r, lift, bob, tail_n, heavy (0..1), roar(bool),
    attack style 'bite'|'gore'|'tusk', wing bones optional handled by caller via p['extra_fn']."""
    H = ctx.spec.height
    tail = [f"tail{i + 1}" for i in range(p.get("tail_n", 4))]
    leglen = (ctx.head("thigh_L") - ctx.tail("meta_L")).length
    # strides kept to plausible hip/shoulder excursions (~35-45 deg); longer strides drove the
    # stifle into the belly and the humerus through the chest wall
    sw = 0.82 * p.get("stride_w", 0.55) * leglen
    sr = 0.82 * p.get("stride_r", 1.1) * leglen
    lift = p.get("lift", 0.22) * leglen
    heavy = p.get("heavy", 0.0)
    xf = p.get("extra_fn")  # extra_fn(clip, t, P)
    has_jaw = "jaw" in ctx.bone
    has_ears = "ear_L" in ctx.bone

    def ears(P, t, k=1.0):
        if has_ears:
            P.r("ear_L", x=k * 0.15 * math.sin(t), z=0.1 * k * math.sin(t * 0.7))
            P.r("ear_R", x=k * 0.15 * math.sin(t + 0.6), z=-0.1 * k * math.sin(t * 0.7))

    def idle(t, P):
        w = 2 * math.pi * t
        br = math.sin(w * 2)
        P.move("hips", z=-0.004 * H * (1 + br) * 0.5)
        P.chain(SPINE, x=0.012 * br)
        P.r("neck1", x=0.05 * math.sin(w) - 0.02, z=0.12 * math.sin(w))
        P.r("neck2", x=0.04 * math.sin(w + 1.0), z=0.08 * math.sin(w))
        P.r("head", x=0.06 * math.sin(w * 2 + 0.5), z=0.06 * math.sin(w), y=0.05 * math.sin(w))
        if has_jaw:
            P.r("jaw", x=-0.05 - 0.04 * (0.5 + 0.5 * math.sin(w * 2)))
        P.chain(tail, z=0.10 * math.sin(w), x=0.03 * math.sin(w * 2), falloff=1.2)
        ears(P, w * 2, 0.6)
        for leg in ("HL", "HR", "FL", "FR"):
            P.foot(leg)
        if xf: xf("idle", t, P)

    def gait(t, P, run):
        w = 2 * math.pi * t
        if run:
            # rotary gallop: hind pair then fore pair, strong spine flexion
            ph = {"HL": 0.0, "HR": 0.1, "FL": 0.5, "FR": 0.6}
            duty, stride, lft, curl = 0.38, sr, lift * 1.3, p.get("curl_r", 0.6)
            flex = math.sin(w + 0.4)
            P.move("hips", z=0.025 * H * math.sin(w * 1 + 2.0) * (1 - 0.5 * heavy) - 0.01 * H,
                   y=0.03 * H * math.sin(w))
            P.r("hips", x=0.10 * flex)
            P.chain(SPINE, x=-0.11 * flex * (1 - 0.6 * heavy), falloff=0.8)
            P.r("neck1", x=0.12 * math.sin(w + 2.4) - 0.12)
            P.r("head", x=-0.10 * math.sin(w + 2.4) + 0.06)
            P.chain(tail, x=-(0.12 * math.sin(w + 1.0) - 0.1), z=0.03 * math.sin(w), falloff=1.15)
        else:
            # diagonal-sequence walk
            ph = {"HL": 0.0, "FR": 0.25, "HR": 0.5, "FL": 0.75}
            duty, stride, lft, curl = 0.64, sw, lift, p.get("curl_w", 0.5)
            P.move("hips", z=0.008 * H * math.cos(w * 2), x=0.006 * H * math.sin(w))
            P.r("hips", y=0.05 * math.sin(w), z=0.04 * math.sin(w))
            P.chain(SPINE, z=-0.035 * math.sin(w), y=-0.02 * math.sin(w))
            P.r("neck1", x=0.04 * math.cos(w * 2) - 0.04, z=0.04 * math.sin(w + 0.5))
            P.r("head", x=-0.05 * math.cos(w * 2), z=-0.03 * math.sin(w + 0.5))
            P.chain(tail, z=0.12 * math.sin(w + 1.2), x=0.03, falloff=1.1)
        for leg, o in ph.items():
            dy, dz, pitch = step_cycle(t + o, duty, stride, lft, curl)
            P.foot(leg, (0, dy, dz), pitch)
        # shoulders/hips follow legs a little
        for s in ("L", "R"):
            dy, _, _ = step_cycle(t + ph["F" + s], duty, stride, lft)
            # the scapula carries a real share of the swing (canine scapula rotates ~+-15 deg), so
            # the humerus does not lever through the chest wall
            P.r(f"scap_{s}", x=-p.get("scap_swing", 0.55) * dy / max(stride, 1e-3))
        if has_jaw:
            P.r("jaw", x=-0.08 if run else -0.04)
        ears(P, w * 2, 0.3)
        if xf: xf("run" if run else "walk", t, P)

    def attack(t, P):
        """coil (0-.26) -> explosive lunge / strike (.26-.40) -> bite-and-shake or hook follow-
        through (.40-.62) -> recover.  The power comes from the hips/root travelling forward
        (~11% of height) with the forefeet pouncing the same distance and the neck/head thrust;
        spine and shoulder rotations stay small so the chest keeps its volume."""
        style = p.get("attack", "bite")
        c = env(t, [(0, 0), (0.26, 1), (0.34, 0.3), (0.40, 0), (1.0, 0)])          # coil
        l = env(t, [(0, 0), (0.26, 0), (0.38, 1), (0.58, 1), (0.9, 0)])            # lunge
        sh = math.sin(2 * math.pi * (t - 0.40) * 7) * env(t, [(0.40, 0), (0.44, 1), (0.58, 1), (0.68, 0)])
        reach = p.get("lunge", 0.11) * (1 - 0.35 * heavy)
        P.move("hips", y=(-0.03 * c + reach * l) * H, z=(-0.04 * c - 0.022 * l) * H)
        P.r("hips", x=-0.05 * c + 0.02 * l)
        P.chain(SPINE, x=-0.03 * c + 0.03 * l, falloff=0.8)
        if style == "bite":
            P.r("neck1", x=-0.20 * c - 0.36 * l, z=0.10 * sh)
            P.r("neck2", x=0.30 * c + 0.05 * l, z=0.10 * sh)
            P.r("head", x=0.05 * c + 0.20 * l, y=0.25 * sh)
            if has_jaw:
                jaw_open = env(t, [(0, 0.05), (0.2, 0.3), (0.34, 0.85), (0.40, 0.0), (0.55, 0.0), (0.62, 0.25),
                                   (0.7, 0.0), (1, 0.05)])
                P.r("jaw", x=-jaw_open * 0.9)
        else:  # gore / tusk: head drops for the charge, then a violent upward hook with a twist
            hook = env(t, [(0, 0), (0.40, 0), (0.50, 1), (0.62, 0.6), (0.9, 0)])
            P.r("neck1", x=-0.28 * c - 0.30 * l + 0.55 * hook, z=0.06 * sh)
            P.r("neck2", x=0.10 * c + 0.10 * hook)
            P.r("head", x=-0.15 * c - 0.15 * l + 0.10 * hook, z=0.30 * hook, y=0.15 * sh)
            if has_jaw:
                P.r("jaw", x=-0.35 * max(l, hook))
        if has_ears:
            P.r("ear_L", x=-0.7 * max(c, l)); P.r("ear_R", x=-0.7 * max(c, l))
        P.chain(tail, x=-(0.35 * l - 0.1 * c), z=0.05 * sh, falloff=1.1)
        # hind feet push off then follow ~60% of the lunge (a stiff planted hind end over-extends
        # the hips and stretches the flank fold)
        hs = env(t, [(0, 0), (0.34, 0), (0.48, 1), (0.66, 1), (0.95, 0)])
        hup = math.sin(math.pi * min(max((t - 0.34) / 0.14, 0), 1)) + 0.5 * math.sin(math.pi * min(max((t - 0.66) / 0.29, 0), 1))
        for leg in ("HL", "HR"):
            P.foot(leg, (0, 0.6 * reach * H * hs, 0.05 * leglen * hup), 0.0)
        # forefeet pounce forward with the body (lifted on the way out and back)
        fs = env(t, [(0, 0), (0.27, 0), (0.39, 1), (0.62, 1), (0.9, 0)])
        up = math.sin(math.pi * min(max((t - 0.27) / 0.12, 0), 1)) + 0.5 * math.sin(math.pi * min(max((t - 0.62) / 0.28, 0), 1))
        for leg, ph in (("FL", 0.0), ("FR", 0.02)):
            P.foot(leg, (0, reach * H * fs, 0.07 * leglen * up), -0.15 * up)
        if xf: xf("attack", t, P)

    def hit(t, P):
        k = env(t, [(0, 0), (0.12, 1), (0.35, 0.7), (1, 0)])
        P.move("hips", y=-0.06 * H * k, z=-0.03 * H * k, x=0.02 * H * k)
        P.chain(SPINE, x=0.06 * k, z=0.08 * k)
        P.r("neck1", x=0.25 * k, z=-0.2 * k)
        P.r("head", x=0.2 * k, y=0.2 * k)
        if has_jaw:
            P.r("jaw", x=-0.4 * k)
        P.chain(tail, x=-(-0.2 * k), falloff=1.1)
        if has_ears:
            P.r("ear_L", x=-0.6 * k); P.r("ear_R", x=-0.6 * k)
        for leg in ("HL", "HR", "FL", "FR"):
            P.foot(leg)
        if xf: xf("hit", t, P)

    def death(t, P):
        # stagger, front buckles, roll onto side (+x), limp; holds still for last 30%
        k1 = env(t, [(0, 0), (0.25, 1)])
        k2 = env(t, [(0.15, 0), (0.55, 1)])
        k3 = env(t, [(0.45, 0), (0.7, 1)])
        ground = ctx.head("hips").z
        body_half = p.get("body_half_width", 0.16) * H / 1.1
        P.move("hips", y=-0.05 * H * k1, z=-(ground - body_half * 1.1) * k2, x=0.05 * H * k2)
        P.r("hips", y=1.45 * k2)  # roll around the body axis onto its side
        P.chain(SPINE, x=-0.05 * k2, z=0.06 * k3, falloff=1.0)
        P.r("neck1", x=-0.3 * k1 + 0.15 * k3, z=0.35 * k3)
        P.r("neck2", z=0.2 * k3)
        P.r("head", x=0.1 * k3, y=-0.3 * k3)
        if has_jaw:
            P.r("jaw", x=-0.35 * k3)
        P.chain(tail, z=0.25 * k3, x=0.1 * k3, falloff=1.0)
        ik = 1.0 - k2
        for leg in ("HL", "HR", "FL", "FR"):
            P.foot(leg, (0, 0, 0), 0, ik)
        for s in ("L", "R"):
            P.r(f"thigh_{s}", x=0.35 * k3); P.r(f"shin_{s}", x=-0.4 * k3)
            P.r(f"upper_{s}", x=-0.3 * k3); P.r(f"fore_{s}", x=0.5 * k3)
            P.r(f"carp_{s}", x=-0.4 * k3)
        if has_ears:
            P.r("ear_L", x=-0.5 * k3); P.r("ear_R", x=-0.5 * k3)
        if xf: xf("death", t, P)

    def roar(t, P):
        k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
        a = env(t, [(0, 0), (0.18, 1), (0.3, 0)])
        sh = math.sin(t * 2 * math.pi * 9) * env(t, [(0.25, 0), (0.35, 1), (0.75, 1), (0.85, 0)])
        P.move("hips", y=-0.05 * H * k, z=-0.02 * H * a)
        P.r("hips", x=0.05 * k)
        P.chain(SPINE, x=0.08 * k - 0.06 * a)
        # head thrown up: spread over neck1/neck2/head so the throat does not crush at the chest
        P.r("neck1", x=0.22 * k - 0.25 * a)
        P.r("neck2", x=0.18 * k)
        P.r("head", x=0.28 * k + 0.03 * sh, z=0.04 * sh)
        if has_jaw:
            P.r("jaw", x=-0.85 * k)
        P.chain(tail, x=-(0.3 * k), z=0.05 * sh, falloff=1.1)
        for leg in ("HL", "HR", "FL", "FR"):
            P.foot(leg)
        if xf: xf("roar", t, P)

    C = {
        "idle": (60, idle),
        "walk": (p.get("walk_frames", 32), lambda t, P: gait(t, P, False)),
        "run": (p.get("run_frames", 18), lambda t, P: gait(t, P, True)),
        "attack": (30, attack),
        "hit": (15, hit),
        "death": (48, death),
    }
    if p.get("roar"):
        C["roar"] = (60, roar)
    return C
