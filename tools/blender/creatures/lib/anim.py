"""Procedural clip authoring.

Clips are described as functions  pose_fn(t, P)  that fill a Pose (FK euler offsets per bone,
hips translation in armature space, foot-contact offsets per leg, IK influence).  Legs are
solved by real Blender IK (2-bone IK + damped-track foot segments) so stance feet stay
planted on the ground; every sample is then baked to plain local bone transforms (visual
keying) and written as one Action per clip.  No root motion: everything is in place.
"""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion, Euler
from bpy_extras import anim_utils
from . import core

FPS = 30


class Leg:
    def __init__(self, name, bones, phase=0.0, pole=(0, 1, 0), pole_dist=0.5, axis=(1, 0, 0)):
        self.name, self.bones, self.phase = name, bones, phase
        self.pole_dir = Vector(pole).normalized()
        self.pole_dist = pole_dist
        self.axis = Vector(axis).normalized()  # foot pitch axis (armature space)


class Pose:
    def __init__(self):
        self.rot = {}
        self.loc = {}
        self.feet = {}
        self.extra_ik = {}

    def r(self, bone, x=0.0, y=0.0, z=0.0):
        a = self.rot.get(bone, (0.0, 0.0, 0.0))
        self.rot[bone] = (a[0] + x, a[1] + y, a[2] + z)
        return self

    def chain(self, bones, x=0.0, y=0.0, z=0.0, falloff=1.0):
        """distribute a rotation along a bone chain (each bone gets value*falloff^i)."""
        f = 1.0
        for b in bones:
            self.r(b, x * f, y * f, z * f)
            f *= falloff
        return self

    def move(self, bone, x=0.0, y=0.0, z=0.0):
        a = self.loc.get(bone, Vector())
        self.loc[bone] = a + Vector((x, y, z))
        return self

    def foot(self, leg, off=(0, 0, 0), pitch=0.0, ik=1.0):
        self.feet[leg] = (Vector(off), pitch, ik)
        return self


class Rig:
    def __init__(self, arm_ob, legs, hips="hips", halves=()):
        self.ob, self.legs, self.hips = arm_ob, {l.name: l for l in legs}, hips
        self.halves = [(h, src) for h, src in halves if h in arm_ob.pose.bones]
        self.targets = {}
        self.rest = {}
        self.pivot = {}
        self._setup()

    # ------------------------------------------------------------------ constraint setup
    def _empty(self, name, loc):
        e = bpy.data.objects.new(name, None)
        e.location = loc
        core.link(e)
        return e

    def _setup(self):
        ob = self.ob
        arm = ob.data
        for leg in self.legs.values():
            bn = leg.bones
            tg = []
            for k in range(1, len(bn)):
                tail = arm.bones[bn[k]].tail_local.copy()
                e = self._empty(f"T_{leg.name}_{k}", tail)
                tg.append(e)
            knee = arm.bones[bn[0]].tail_local.copy()
            pole = self._empty(f"P_{leg.name}", knee + leg.pole_dir * leg.pole_dist)
            pb = ob.pose.bones[bn[1]]
            c = pb.constraints.new("IK")
            c.target = tg[0]
            c.pole_target = pole
            c.chain_count = 2
            c.use_stretch = False
            c.name = "IK"
            for k in range(2, len(bn)):
                d = ob.pose.bones[bn[k]].constraints.new("DAMPED_TRACK")
                d.target = tg[k - 1]
                d.track_axis = "TRACK_Y"
                d.name = "DT"
            self.targets[leg.name] = tg
            self.rest[leg.name] = [e.location.copy() for e in tg]
            pv = arm.bones[bn[-2]].tail_local.copy() if len(bn) >= 3 else arm.bones[bn[-1]].tail_local.copy()
            self.pivot[leg.name] = pv
        self._calibrate_poles()

    def _knee_err(self, leg):
        pb = self.ob.pose.bones[leg.bones[0]]
        rest = self.ob.data.bones[leg.bones[0]].tail_local
        return (pb.tail - rest).length

    def _calibrate_poles(self):
        """search the IK pole angle per leg (coarse 10 deg sweep + 1 deg refine) that reproduces
        the rest pose exactly, whatever the bone roll / leg orientation."""
        legs = list(self.legs.values())
        if not legs:
            return

        def sweep(cands):
            best = {l.name: (1e9, 0.0) for l in legs}
            for i in range(len(cands[legs[0].name])):
                for l in legs:
                    self.ob.pose.bones[l.bones[1]].constraints["IK"].pole_angle = math.radians(cands[l.name][i])
                bpy.context.view_layer.update()
                for l in legs:
                    e = self._knee_err(l)
                    if e < best[l.name][0]:
                        best[l.name] = (e, cands[l.name][i])
            return best

        coarse = sweep({l.name: list(range(-180, 180, 10)) for l in legs})
        fine = sweep({l.name: [coarse[l.name][1] + d for d in range(-9, 10)] for l in legs})
        for l in legs:
            e, ang = fine[l.name]
            self.ob.pose.bones[l.bones[1]].constraints["IK"].pole_angle = math.radians(ang)
            if e > 0.01:
                print(f"  warn: leg {l.name} rest IK error {e:.3f}")


    # ------------------------------------------------------------------ sampling
    def apply(self, P):
        ob = self.ob
        for pb in ob.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_euler = (0, 0, 0)
            pb.scale = (1, 1, 1)
        for b, (x, y, z) in P.rot.items():
            if b in ob.pose.bones:
                ob.pose.bones[b].rotation_euler = (x, y, z)
        for b, off in P.loc.items():
            if b in ob.pose.bones:
                R = ob.data.bones[b].matrix_local.to_3x3()
                ob.pose.bones[b].location = R.inverted() @ off
        for name, leg in self.legs.items():
            off, pitch, ik = P.feet.get(name, (Vector(), 0.0, 1.0))
            piv = self.pivot[name]
            rot = Matrix.Rotation(pitch, 3, leg.axis)
            for e, x0 in zip(self.targets[name], self.rest[name]):
                e.location = piv + off + rot @ (x0 - piv)
            ob.pose.bones[leg.bones[1]].constraints["IK"].influence = ik
            for k in range(2, len(leg.bones)):
                ob.pose.bones[leg.bones[k]].constraints["DT"].influence = ik
        bpy.context.view_layer.update()

    def drive_halves(self):
        """joint helpers take half of their source bone's final (post-IK) local rotation."""
        if not self.halves:
            return
        ob = self.ob
        for h, src in self.halves:
            pb = ob.pose.bones[src]
            m = ob.convert_space(pose_bone=pb, matrix=pb.matrix, from_space="POSE", to_space="LOCAL")
            q = m.to_quaternion()
            ob.pose.bones[h].rotation_euler = Quaternion().slerp(q, 0.5).to_euler("XYZ")
        bpy.context.view_layer.update()

    def sample(self):
        ob = self.ob
        out = {}
        for pb in ob.pose.bones:
            m = ob.convert_space(pose_bone=pb, matrix=pb.matrix, from_space="POSE", to_space="LOCAL")
            loc, q, _s = m.decompose()
            out[pb.name] = (loc, q)
        return out

    def bake_clip(self, name, frames, pose_fn, loc_bones=None):
        loc_bones = set(loc_bones or [self.hips])
        samples = []
        for f in range(frames + 1):
            t = f / frames
            P = Pose()
            pose_fn(t, P)
            self.apply(P)
            self.drive_halves()
            samples.append(self.sample())
        self._write_action(name, samples, loc_bones)
        return samples

    def _write_action(self, name, samples, loc_bones):
        ob = self.ob
        if ob.animation_data is None:
            ob.animation_data_create()
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ob.animation_data.action = act
        slot = ob.animation_data.action_slot
        if slot is None:
            slot = act.slots.new(id_type="OBJECT", name=ob.name)
            ob.animation_data.action_slot = slot
        cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
        n = len(samples)
        for pb in ob.pose.bones:
            bn = pb.name
            qs = []
            prev = None
            for s in samples:
                q = s[bn][1].copy()
                if prev is not None and prev.dot(q) < 0:
                    q.negate()
                qs.append(q)
                prev = q
            for i in range(4):
                fc = cb.fcurves.new(f'pose.bones["{bn}"].rotation_quaternion', index=i, group_name=bn)
                fc.keyframe_points.add(n)
                co = []
                for f, q in enumerate(qs):
                    co += [float(f), q[i]]
                fc.keyframe_points.foreach_set("co", co)
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
                fc.update()
            if bn in loc_bones:
                for i in range(3):
                    fc = cb.fcurves.new(f'pose.bones["{bn}"].location', index=i, group_name=bn)
                    fc.keyframe_points.add(n)
                    co = []
                    for f, s in enumerate(samples):
                        co += [float(f), s[bn][0][i]]
                    fc.keyframe_points.foreach_set("co", co)
                    for kp in fc.keyframe_points:
                        kp.interpolation = "LINEAR"
                    fc.update()
        act.frame_range = (0, n - 1)
        act.use_frame_range = True
        return act

    def finalize(self):
        """Remove IK helpers, switch to quaternions, clear pose; leave actions on fake users."""
        ob = self.ob
        for pb in ob.pose.bones:
            for c in list(pb.constraints):
                pb.constraints.remove(c)
            pb.rotation_mode = "QUATERNION"
            pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
        for name, tg in self.targets.items():
            for e in tg:
                bpy.data.objects.remove(e, do_unlink=True)
            p = bpy.data.objects.get(f"P_{name}")
            if p:
                bpy.data.objects.remove(p, do_unlink=True)
        if ob.animation_data:
            ob.animation_data.action = None


# --------------------------------------------------------------------------- curve helpers
def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ease_in(x):
    x = min(max(x, 0.0), 1.0)
    return x * x


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) * (1 - x)


def env(t, keys):
    """piecewise smooth envelope: keys = [(t0, v0), (t1, v1), ...]"""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * smooth((t - t0) / max(t1 - t0, 1e-6))
    return keys[-1][1]


def step_cycle(p, duty, stride, lift, curl=0.0, lift_pow=1.0):
    """foot contact path for cycle phase p in [0,1): returns (dy, dz, pitch)."""
    p %= 1.0
    if p < duty:
        s = p / duty
        return stride * (0.5 - s), 0.0, curl * 0.15 * math.sin(math.pi * s) * 0
    s = (p - duty) / (1 - duty)
    dy = stride * (-0.5 + smooth(s))
    dz = lift * math.sin(math.pi * s) ** lift_pow
    pitch = -curl * math.sin(math.pi * min(1.0, s * 1.15))
    return dy, dz, pitch
