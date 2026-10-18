"""Biped skeletons + gaits: 'heavy' upright humanoid stomp (golem, treant, construct) and
'raptor' horizontal theropod gait with tail counterbalance and bird-like head bob."""
import math
from mathutils import Vector
from .rig import Bone, half_bone
from .anim import Leg, env, smooth, step_cycle

SIDES = (("L", 1.0), ("R", -1.0))


def mx(p, g):
    return Vector((p[0] * g, p[1], p[2]))


# ----------------------------------------------------------------------------- heavy humanoid
def humanoid(J, jaw=False, extra=None, fingers=0):
    B = [Bone("root", (0, 0, 0), (0, 0.3, 0), None, deform=False)]
    B.append(Bone("hips", J["hips"], J["spine1"], "root"))
    B.append(Bone("spine1", J["spine1"], J["spine2"], "hips"))
    B.append(Bone("chest", J["spine2"], J["neck"], "spine1"))
    B.append(Bone("neck", J["neck"], J["head"], "chest"))
    B.append(Bone("head", J["head"], J["head_top"], "neck"))
    if jaw:
        B.append(Bone("jaw", J["jaw0"], J["jaw1"], "head"))
    for s, g in SIDES:
        B.append(Bone(f"clav_{s}", mx(J["clav"], g), mx(J["shoulder"], g), "chest"))
        B.append(Bone(f"upperarm_{s}", mx(J["shoulder"], g), mx(J["elbow"], g), f"clav_{s}"))
        B.append(Bone(f"forearm_{s}", mx(J["elbow"], g), mx(J["wrist"], g), f"upperarm_{s}"))
        B.append(Bone(f"hand_{s}", mx(J["wrist"], g), mx(J["hand"], g), f"forearm_{s}"))
        B.append(Bone(f"thigh_{s}", mx(J["hip"], g), mx(J["knee"], g), "hips"))
        B.append(Bone(f"shin_{s}", mx(J["knee"], g), mx(J["ankle"], g), f"thigh_{s}"))
        B.append(Bone(f"foot_{s}", mx(J["ankle"], g), mx(J["ball"], g), f"shin_{s}"))
        B.append(Bone(f"toe_{s}", mx(J["ball"], g), mx(J["toe"], g), f"foot_{s}"))
    by = {b.name: b for b in B}
    for s, g in SIDES:
        B.append(half_bone(by[f"upperarm_{s}"], f"clav_{s}"))
        B.append(half_bone(by[f"thigh_{s}"], "hips"))
    if extra:
        B += extra
    return B


def humanoid_legs():
    return [Leg(f"{s}", [f"thigh_{s}", f"shin_{s}", f"foot_{s}", f"toe_{s}"], phase=0.0 if s == "L" else 0.5,
                pole=(0, 1, 0)) for s, g in SIDES]


def clips_heavy(ctx, p):
    H = ctx.spec.height
    leglen = (ctx.head("thigh_L") - ctx.tail("shin_L")).length
    stride = p.get("stride", 0.75) * leglen
    lift = p.get("lift", 0.16) * leglen
    xf = p.get("extra_fn")
    has_jaw = "jaw" in ctx.bone
    armw = p.get("arm_weight", 1.0)

    def arms(P, swing_l, swing_r, out=0.0, bend=0.25):
        for s, g, sw in (("L", 1, swing_l), ("R", -1, swing_r)):
            P.r(f"upperarm_{s}", x=sw, z=-g * out)
            P.r(f"forearm_{s}", x=bend + max(0, sw) * 0.4)

    def idle(t, P):
        w = 2 * math.pi * t
        br = math.sin(w * 2)
        P.move("hips", z=-0.004 * H * (1 + br) * 0.5)
        P.r("spine1", x=0.015 * br)
        P.r("chest", x=0.02 * br, y=0.03 * math.sin(w))
        P.r("neck", z=0.05 * math.sin(w), x=-0.02 * br)
        P.r("head", y=0.12 * math.sin(w), x=0.03 * math.sin(w * 2 + 1))
        arms(P, 0.03 * math.sin(w + 0.5), 0.03 * math.sin(w + 2.0), out=0.08 + 0.02 * br)
        if has_jaw:
            P.r("jaw", x=-0.04 - 0.03 * br)
        P.foot("L"); P.foot("R")
        if xf: xf("idle", t, P)

    def gait(t, P, run):
        w = 2 * math.pi * t
        duty = 0.42 if run else 0.64
        st = stride * (1.5 if run else 1.0)
        lf = lift * (1.6 if run else 1.0)
        for s, o in (("L", 0.0), ("R", 0.5)):
            dy, dz, pitch = step_cycle(t + o, duty, st, lf, 0.0)
            P.foot(s, (0, dy, dz), -0.35 * dz / max(lf, 1e-3) * 0.6)
        sway = math.sin(w)  # lateral weight shift to stance leg
        stomp = max(0.0, math.cos(w * 2)) ** 4
        P.move("hips", x=0.035 * H * sway * (0.5 if run else 1.0) * p.get("sway", 1.0),
               z=-0.02 * H * stomp - (0.03 * H if run else 0.0) + 0.012 * H * math.sin(w * 2 - 1.2))
        P.r("hips", y=0.06 * sway, z=-0.10 * math.cos(w))
        P.r("spine1", z=0.06 * math.cos(w), y=-0.03 * sway, x=-0.06 if run else 0.0)
        P.r("chest", z=0.08 * math.cos(w), y=-0.03 * sway, x=-0.03 * stomp - (0.1 if run else 0.0))
        P.r("neck", z=-0.08 * math.cos(w), x=0.04 * stomp)
        P.r("head", z=-0.04 * math.cos(w), x=0.02 * stomp)
        a = (0.45 if run else 0.32) * armw
        arms(P, a * math.cos(w), -a * math.cos(w), out=0.10, bend=0.35 if run else 0.2)
        if xf: xf("run" if run else "walk", t, P)

    def attack(t, P):
        # overhead double-fist smash
        up = env(t, [(0, 0), (0.35, 1), (0.45, 0.2), (0.5, -0.4), (0.68, -0.4), (1, 0)])
        slam = env(t, [(0, 0), (0.38, 0), (0.48, 1), (0.68, 1), (1, 0)])
        P.move("hips", z=-0.06 * H * slam - 0.015 * H * max(up, 0), y=-0.03 * H * max(up, 0) + 0.04 * H * slam)
        # the overhead raise is shared: clavicles shrug, the torso arches back, so the humerus only
        # travels ~110 deg (it was 150 deg in the shoulder alone -> shoulder/chest crumple)
        U = max(up, 0)
        P.r("spine1", x=0.16 * U - 0.22 * slam)
        P.r("chest", x=0.12 * U - 0.16 * slam)
        P.r("neck", x=-0.12 * U + 0.15 * slam)
        P.r("head", x=-0.05 * U)
        for s, g in SIDES:
            P.r(f"upperarm_{s}", x=1.9 * U + 0.9 * slam, z=-g * (0.2 * U - 0.05 * slam))
            P.r(f"forearm_{s}", x=0.9 * U + 0.15 * slam)
            P.r(f"clav_{s}", x=0.35 * U + 0.1 * slam)
        if has_jaw:
            P.r("jaw", x=-0.3 * slam - 0.15 * max(up, 0))
        P.foot("L", (0, 0.04 * leglen * slam, 0))
        P.foot("R", (0, -0.06 * leglen * slam, 0))
        if xf: xf("attack", t, P)

    def hit(t, P):
        k = env(t, [(0, 0), (0.15, 1), (0.4, 0.6), (1, 0)])
        P.move("hips", y=-0.03 * H * k, z=-0.015 * H * k)
        P.r("spine1", x=0.1 * k, z=0.06 * k)
        P.r("chest", x=0.14 * k, y=0.1 * k)
        P.r("neck", x=0.15 * k)
        P.r("head", x=0.15 * k, y=-0.1 * k)
        arms(P, -0.25 * k, -0.15 * k, out=0.3 * k + 0.1, bend=0.4 * k + 0.2)
        P.foot("L"); P.foot("R")
        if xf: xf("hit", t, P)

    def death(t, P):
        # knees buckle -> falls forward onto the ground, ends still
        k1 = env(t, [(0, 0), (0.35, 1)])
        k2 = env(t, [(0.25, 0), (0.7, 1)])
        hz = ctx.head("hips").z
        P.move("hips", z=-(hz * 0.55) * k1 - (hz * 0.32) * k2, y=0.05 * H * k1 + 0.22 * H * k2)
        P.r("hips", x=-1.25 * k2)
        P.r("spine1", x=-0.25 * k1 - 0.05 * k2)
        P.r("chest", x=-0.15 * k1)
        P.r("neck", x=-0.2 * k1 + 0.3 * k2, z=0.3 * k2)
        P.r("head", y=0.4 * k2)
        ik = 1 - k1
        for s, g in SIDES:
            P.foot(s, (0, 0, 0), 0, ik)
            # knees buckle to ~65 deg (was 110) -- the fall forward comes from the hips pitching
            P.r(f"thigh_{s}", x=0.75 * k1 - 0.65 * k2)
            P.r(f"shin_{s}", x=-1.15 * k1 + 0.85 * k2)
            P.r(f"foot_{s}", x=0.3 * k1)
            P.r(f"upperarm_{s}", x=0.4 * k1 + 1.0 * k2, z=-g * 0.4 * k2)
            P.r(f"forearm_{s}", x=0.3 * k2)
        if has_jaw:
            P.r("jaw", x=-0.3 * k2)
        if xf: xf("death", t, P)

    def roar(t, P):
        k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
        sh = math.sin(t * 2 * math.pi * 10) * env(t, [(0.25, 0), (0.35, 1), (0.75, 1), (0.85, 0)])
        P.move("hips", z=-0.03 * H * k)
        P.r("spine1", x=0.12 * k)
        P.r("chest", x=0.18 * k + 0.02 * sh)
        P.r("neck", x=0.15 * k)
        P.r("head", x=0.2 * k + 0.03 * sh)
        for s, g in SIDES:
            P.r(f"upperarm_{s}", x=0.5 * k, z=-g * 0.9 * k)
            P.r(f"forearm_{s}", x=0.8 * k)
            P.r(f"clav_{s}", x=0.1 * k)
        if has_jaw:
            P.r("jaw", x=-0.5 * k)
        P.foot("L", (0.0, 0.0, 0)); P.foot("R")
        if xf: xf("roar", t, P)

    C = {"idle": (72, idle), "walk": (p.get("walk_frames", 44), lambda t, P: gait(t, P, False)),
         "run": (p.get("run_frames", 26), lambda t, P: gait(t, P, True)),
         "attack": (p.get("attack_frames", 40), attack), "hit": (16, hit), "death": (54, death)}
    if p.get("roar", True):
        C["roar"] = (66, roar)
    return C


# ----------------------------------------------------------------------------- raptor
def raptor(J, tail_n=5, extra=None):
    B = [Bone("root", (0, 0, 0), (0, 0.3, 0), None, deform=False)]
    B.append(Bone("hips", J["hips"], Vector(J["hips"]) + Vector((0, -0.15, 0)), "root"))
    B.append(Bone("spine1", J["hips"], J["s1"], "hips"))
    B.append(Bone("chest", J["s1"], J["n0"], "spine1"))
    B.append(Bone("neck1", J["n0"], J["n1"], "chest"))
    B.append(Bone("neck2", J["n1"], J["h0"], "neck1"))
    B.append(Bone("head", J["h0"], J["snout"], "neck2"))
    B.append(Bone("jaw", J["jaw0"], J["jaw1"], "head"))
    prev = "hips"
    for i in range(tail_n):
        B.append(Bone(f"tail{i + 1}", J[f"t{i}"], J[f"t{i + 1}"], prev))
        prev = f"tail{i + 1}"
    for s, g in SIDES:
        B.append(Bone(f"thigh_{s}", mx(J["hip"], g), mx(J["knee"], g), "hips"))
        B.append(Bone(f"shin_{s}", mx(J["knee"], g), mx(J["ankle"], g), f"thigh_{s}"))
        B.append(Bone(f"meta_{s}", mx(J["ankle"], g), mx(J["ball"], g), f"shin_{s}"))
        B.append(Bone(f"toe_{s}", mx(J["ball"], g), mx(J["toe"], g), f"meta_{s}"))
        B.append(Bone(f"arm_{s}", mx(J["shoulder"], g), mx(J["elbow"], g), "chest"))
        B.append(Bone(f"forearm_{s}", mx(J["elbow"], g), mx(J["wrist"], g), f"arm_{s}"))
        B.append(Bone(f"hand_{s}", mx(J["wrist"], g), mx(J["hand"], g), f"forearm_{s}"))
    by = {b.name: b for b in B}
    for s, g in SIDES:
        B.append(half_bone(by[f"thigh_{s}"], "hips"))
        B.append(half_bone(by[f"arm_{s}"], "chest"))
        B.append(half_bone(by[f"shin_{s}"], f"thigh_{s}"))
    B.append(half_bone(by["neck1"], "chest"))
    sh, s1, hp = Vector(J["shoulder"]), Vector(J["s1"]), Vector(J["hips"])
    B.append(Bone("sternum", (0, sh.y, 0), (0, s1.y, 0), "chest", ventral=0.32))
    B.append(Bone("belly", (0, s1.y, 0), (0, hp.y + 0.3 * (s1.y - hp.y), 0), "spine1", ventral=0.32))
    if extra:
        B += extra
    return B


def raptor_legs():
    return [Leg(s, [f"thigh_{s}", f"shin_{s}", f"meta_{s}", f"toe_{s}"], pole=(0, 1, 0)) for s, g in SIDES]


def clips_raptor(ctx, p):
    H = ctx.spec.height
    tail = [b for b in ctx.bone if b.startswith("tail")]
    tail.sort()
    leglen = (ctx.head("thigh_L") - ctx.tail("meta_L")).length
    stride = p.get("stride", 0.7) * leglen
    lift = p.get("lift", 0.22) * leglen
    xf = p.get("extra_fn")
    NECK = ["neck1", "neck2"]

    def arms(P, k=0.0, w=0.0):
        for s in ("L", "R"):
            P.r(f"arm_{s}", x=-0.05 + 0.06 * math.sin(w) + k * 0.5)
            P.r(f"forearm_{s}", x=0.15 + k * 0.35)

    def idle(t, P):
        w = 2 * math.pi * t
        br = math.sin(w * 2)
        P.move("hips", z=-0.004 * H * (1 + br))
        P.r("chest", x=0.015 * br)
        # bird-like head: holds still then snaps to a new look direction
        look = env(t, [(0, 0), (0.18, 0), (0.24, 1), (0.55, 1), (0.6, -0.6), (0.85, -0.6), (0.92, 0), (1, 0)])
        P.r("neck1", x=0.03 * br, z=0.25 * look)
        P.r("neck2", z=0.1 * look, x=-0.02 * br)
        P.r("head", z=0.15 * look, y=0.12 * look)
        P.r("jaw", x=-0.03 - 0.03 * (0.5 + 0.5 * br))
        P.chain(tail, z=0.07 * math.sin(w), x=0.02 * br, falloff=1.15)
        arms(P, 0, w)
        P.foot("L"); P.foot("R")
        if xf: xf("idle", t, P)

    def gait(t, P, run):
        w = 2 * math.pi * t
        duty = 0.36 if run else 0.62
        st = stride * (1.7 if run else 1.0)
        lf = lift * (1.5 if run else 1.0)
        for s, o in (("L", 0.0), ("R", 0.5)):
            dy, dz, pitch = step_cycle(t + o, duty, st, lf, 1.2)
            P.foot(s, (0, dy, dz), pitch)
        P.move("hips", x=0.012 * H * math.sin(w), z=0.02 * H * math.cos(w * 2) * (1.6 if run else 1) - (0.05 * H if run else 0))
        P.r("hips", y=0.06 * math.sin(w), z=0.05 * math.sin(w), x=-0.08 if run else 0.0)
        P.r("chest", z=-0.06 * math.sin(w), x=0.03 * math.cos(w * 2))
        # head bob: thrust forward on each stance, stabilised in space
        bob = math.sin(w * 2 + 0.6)
        P.r("neck1", x=-0.08 * bob - (0.25 if run else 0.0), z=0.04 * math.sin(w))
        P.r("neck2", x=0.12 * bob + (0.15 if run else 0.0))
        P.r("head", x=-0.05 * bob + (0.1 if run else 0.0), z=-0.04 * math.sin(w))
        P.chain(tail, z=-0.08 * math.sin(w + 0.8), x=-0.03 * math.cos(w * 2) - (0.05 if run else 0), falloff=1.15)
        P.r("jaw", x=-0.12 if run else -0.03)
        arms(P, 0.3 if run else 0.0, w)
        if xf: xf("run" if run else "walk", t, P)

    def attack(t, P):
        """coil (0-.28) -> hop-lunge with a snapping bite and a sickle-claw kick (.28-.45) ->
        head-shake / rake follow-through (.45-.65) -> recover.  Drive comes from the hips
        travelling forward ~10% of height and the neck thrust; the chest only pitches a little
        and the kick keeps the thigh under ~55 deg so the flank / groin skin is not folded."""
        c = env(t, [(0, 0), (0.28, 1), (0.36, 0.2), (0.42, 0), (1, 0)])            # coil
        l = env(t, [(0, 0), (0.28, 0), (0.40, 1), (0.60, 1), (0.92, 0)])           # lunge
        kick = env(t, [(0, 0), (0.33, 0), (0.43, 1), (0.52, 0.8), (0.62, 0.15), (0.85, 0)])
        sh = math.sin(2 * math.pi * (t - 0.42) * 7) * env(t, [(0.42, 0), (0.46, 1), (0.58, 1), (0.68, 0)])
        P.move("hips", y=(-0.035 * c + 0.10 * l) * H, z=(-0.05 * c + 0.012 * l) * H)
        P.r("hips", x=0.06 * c - 0.04 * l + 0.16 * kick)          # pelvis rocks back into the kick
        P.r("chest", x=-0.03 * c + 0.02 * l)
        P.r("neck1", x=0.22 * c - 0.45 * l, z=0.08 * sh)
        P.r("neck2", x=-0.20 * c + 0.12 * l, z=0.08 * sh)
        P.r("head", x=-0.06 * c + 0.22 * l, y=0.22 * sh)
        jaw_open = env(t, [(0, 0.05), (0.2, 0.35), (0.36, 0.8), (0.42, 0.0), (0.56, 0.0), (0.62, 0.2), (0.7, 0.0), (1, 0.05)])
        P.r("jaw", x=-jaw_open)
        P.chain(tail, x=0.10 * c - 0.08 * l, z=0.05 * sh, falloff=1.05)
        arms(P, 0.5 * c + 0.7 * l, 0)
        P.foot("L", (0, 0.10 * H * l * 0.6, 0))
        # right foot: sickle-claw kick forward/up, then the claw rakes down and back
        P.foot("R", (0, (0.10 * H * 0.6) * l + 0.40 * leglen * kick, 0.17 * leglen * kick), -0.75 * kick, 1.0)
        if xf: xf("attack", t, P)

    def hit(t, P):
        k = env(t, [(0, 0), (0.15, 1), (0.4, 0.6), (1, 0)])
        P.move("hips", y=-0.05 * H * k, z=-0.02 * H * k)
        P.r("hips", x=0.12 * k, y=0.1 * k)
        P.r("neck1", x=0.3 * k, z=-0.3 * k)
        P.r("head", x=0.2 * k, y=0.3 * k)
        P.r("jaw", x=-0.5 * k)
        P.chain(tail, x=-(-0.12 * k), z=0.1 * k, falloff=1.1)
        arms(P, 0.4 * k, 0)
        P.foot("L"); P.foot("R")
        if xf: xf("hit", t, P)

    def death(t, P):
        k1 = env(t, [(0, 0), (0.3, 1)])
        k2 = env(t, [(0.2, 0), (0.62, 1)])
        hz = ctx.head("hips").z
        half = p.get("body_half_width", 0.2) * H / 1.9
        P.move("hips", z=-(hz - half) * k2, x=0.06 * H * k2)
        P.r("hips", y=1.4 * k2)
        P.r("chest", z=0.1 * k2)
        P.r("neck1", x=0.3 * k1 - 0.4 * k2, z=0.4 * k2)
        P.r("neck2", z=0.3 * k2)
        P.r("head", y=-0.3 * k2)
        P.r("jaw", x=-0.4 * k2)
        P.chain(tail, z=0.15 * k2, falloff=1.0)
        for s in ("L", "R"):
            P.foot(s, (0, 0, 0), 0, 1 - env(t, [(0.08, 0), (0.30, 1)]))
            P.r(f"thigh_{s}", x=0.22 * k2)
            P.r(f"shin_{s}", x=-0.28 * k2)
        arms(P, -0.1 * k2, 0)
        if xf: xf("death", t, P)

    def roar(t, P):
        k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
        sh = math.sin(t * 2 * math.pi * 10) * env(t, [(0.25, 0), (0.35, 1), (0.75, 1), (0.85, 0)])
        P.move("hips", y=-0.04 * H * k, z=-0.02 * H * k)
        P.r("hips", x=0.12 * k)
        P.r("neck1", x=0.45 * k)
        P.r("neck2", x=0.1 * k)
        P.r("head", x=0.2 * k + 0.04 * sh)
        P.r("jaw", x=-0.8 * k)
        P.chain(tail, x=-(-0.1 * k), z=0.05 * sh, falloff=1.1)
        arms(P, 0.5 * k, 0)
        P.foot("L"); P.foot("R")
        if xf: xf("roar", t, P)

    C = {"idle": (60, idle), "walk": (p.get("walk_frames", 30), lambda t, P: gait(t, P, False)),
         "run": (p.get("run_frames", 18), lambda t, P: gait(t, P, True)),
         "attack": (30, attack), "hit": (15, hit), "death": (48, death)}
    if p.get("roar", True):
        C["roar"] = (60, roar)
    return C
