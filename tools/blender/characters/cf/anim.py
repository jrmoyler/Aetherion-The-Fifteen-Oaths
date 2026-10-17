"""Procedural keyframed animation library (shared by every hero; scaled to proportions).

Pose channels (left side semantics; right side mirrored automatically):
  hips_loc (x, up, fwd) m   hips/spine/spine1/spine2/neck/head (pitch fwd+, yaw left+, roll right+) deg
  armL/armR (fwd, side, twist) deg — direction of the upper arm in torso space (0,0 = hanging)
  clavL/R (raise, fwd)  foreL/R flex  handL/R (pitch, yaw, roll)
  thighL/R (pitch fwd+, yaw out+, roll abduct+)  shinL/R flex(+ = knee bend)  footL/R pitch (+toes up)  toeL/R
"""
import math
import bpy
import mathutils
import numpy as np

FPS = 30
TAU = math.tau

EULER = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head']


def cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def gauss(q, c, w):
    d = (q - c + 0.5) % 1.0 - 0.5
    return math.exp(-(d * d) / (2 * w * w))


def sstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


class Keys:
    """Pose-to-pose interpolation with Catmull-Rom splines per channel."""

    def __init__(self, keys, loop=False, length=None):
        self.keys = sorted(keys, key=lambda k: k[0])
        self.loop = loop
        self.length = length

    def __call__(self, f):
        ks = self.keys
        chans = set()
        for _, p in ks:
            chans.update(p.keys())
        out = {}
        n = len(ks)
        if self.loop:
            L = self.length
            f = f % L
            ext = [(ks[-1][0] - L, ks[-1][1])] + ks + [(ks[0][0] + L, ks[0][1]), (ks[1 % n][0] + L, ks[1 % n][1])]
            ext = [(ks[-2 % n][0] - L, ks[-2 % n][1])] + ext
        else:
            ext = [ks[0]] + ks + [ks[-1]]
            f = min(max(f, ks[0][0]), ks[-1][0])
        for i in range(1, len(ext) - 2):
            if ext[i][0] <= f <= ext[i + 1][0]:
                break
        f0, f1 = ext[i][0], ext[i + 1][0]
        t = 0.0 if f1 == f0 else (f - f0) / (f1 - f0)
        for c in chans:
            vals = []
            for j in (i - 1, i, i + 1, i + 2):
                v = ext[j][1].get(c)
                if v is None:
                    v = ZERO.get(c, 0.0)
                vals.append(np.asarray(v, dtype=float))
            out[c] = cr(*vals, t)
        return out


ZERO = {}


def merge(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            if k in out:
                out[k] = np.asarray(out[k], dtype=float) + np.asarray(v, dtype=float)
            else:
                out[k] = np.asarray(v, dtype=float)
    return out


# ----------------------------------------------------------------------------- base stances
def relaxed(cls):
    return {'armL': (6, 9, 0), 'armR': (6, 9, 0), 'foreL': 14, 'foreR': 18 if cls == 'ninja' else 22,
            'handL': (0, 0, 4), 'handR': (-10, 0, 0), 'spine2': (1, 0, 0), 'head': (2, 0, 0)}


def combat(cls):
    if cls == 'ninja':
        return {'hips_loc': (0, -0.07, 0.0), 'hips': (6, -14, 0), 'spine': (4, 5, 0), 'spine1': (5, 5, 0), 'spine2': (4, 4, 0),
                'neck': (-4, 0, 0), 'head': (-6, 0, 0),
                'thighL': (34, -6, 6), 'shinL': 48, 'footL': (14,), 'thighR': (8, 10, 8), 'shinR': 38, 'footR': (26,),
                'armL': (52, 22, 30), 'foreL': 92, 'handL': (10, 0, 0),
                'armR': (48, 18, 0), 'foreR': 70, 'handR': (-35, 0, 0), 'clavL': (4, 6), 'clavR': (4, 6)}
    return {'hips_loc': (0, -0.04, 0.0), 'hips': (3, -8, 0), 'spine': (3, 3, 0), 'spine1': (3, 3, 0), 'spine2': (2, 2, 0),
            'head': (-3, 0, 0), 'thighL': (20, -4, 5), 'shinL': 28, 'footL': (8,), 'thighR': (2, 8, 6), 'shinR': 20, 'footR': (16,),
            'armL': (46, 18, 10), 'foreL': 60, 'handL': (-20, 0, 0),
            'armR': (30, 12, -10), 'foreR': 62, 'handR': (-20, 0, 0)}


# ----------------------------------------------------------------------------- locomotion
def locomotion(kind, cls, legs):
    """Returns (length, fn(frame)->pose)."""
    P = {'walk': dict(n=34, A=24, K=58, kl=12, bob=0.022, sway=0.014, yaw=6, lean=3, arm=20, fore=14, foot=18),
         'run': dict(n=22, A=38, K=95, kl=22, bob=0.045, sway=0.012, yaw=10, lean=12, arm=34, fore=70, foot=26),
         'sprint': dict(n=18, A=48, K=115, kl=26, bob=0.055, sway=0.010, yaw=12, lean=20, arm=48, fore=88, foot=30),
         'backpedal': dict(n=34, A=20, K=50, kl=12, bob=0.02, sway=0.012, yaw=5, lean=-4, arm=12, fore=30, foot=16)}
    if kind in ('strafe_l', 'strafe_r'):
        return strafe(kind, cls, legs)
    p = P[kind]
    n = p['n']
    rev = -1 if kind == 'backpedal' else 1
    sc = legs / 0.92
    cb = combat(cls) if kind in ('run', 'sprint') else {}

    def fn(f):
        ph = (f / n) * rev % 1.0
        pose = {}
        for side, off in (('L', 0.0), ('R', 0.5)):
            q = (ph + off) % 1.0
            th = p['A'] * math.cos(TAU * q) + p['lean'] * 0.4
            knee = p['kl'] * gauss(q, 0.08, 0.07) + p['K'] * gauss(q, 0.70, 0.14) + 4
            foot = 12 * gauss(q, 0.0, 0.05) - p['foot'] * gauss(q, 0.46, 0.07) + 6 * gauss(q, 0.75, 0.1)
            if rev < 0:
                foot = -foot * 0.5
            pose['thigh' + side] = (th, 0, 2)
            pose['shin' + side] = knee
            pose['foot' + side] = (foot - 4,)
            pose['toe' + side] = (14 * gauss(q, 0.42, 0.06),)
            # arms swing opposite the same-side leg
            sw = -p['arm'] * math.cos(TAU * q)
            pose['arm' + side] = (6 + sw + p['lean'] * 0.5, 9, 0)
            pose['fore' + side] = p['fore'] + max(0, sw) * 0.6 + 10
        pose['hips_loc'] = (p['sway'] * math.sin(TAU * ph) * sc, (-p['bob'] * (0.5 + 0.5 * math.cos(2 * TAU * (ph - 0.1))) - 0.01) * sc, 0)
        pose['hips'] = (p['lean'] * 0.4, -p['yaw'] * math.cos(TAU * ph), 3 * math.sin(TAU * ph))
        pose['spine'] = (p['lean'] * 0.3, p['yaw'] * 0.4 * math.cos(TAU * ph), -1.5 * math.sin(TAU * ph))
        pose['spine1'] = (p['lean'] * 0.35, p['yaw'] * 0.4 * math.cos(TAU * ph), -1 * math.sin(TAU * ph))
        pose['spine2'] = (p['lean'] * 0.3 + 1.5 * math.cos(2 * TAU * ph), p['yaw'] * 0.4 * math.cos(TAU * ph), 0)
        pose['neck'] = (-p['lean'] * 0.4, -p['yaw'] * 0.2 * math.cos(TAU * ph), 0)
        pose['head'] = (-p['lean'] * 0.4 + 2, 0, 0)
        if cls == 'ninja' and kind in ('run', 'sprint'):
            # blade held low and back while running
            pose['handR'] = (-30, 0, 0)
        if cls == 'sorcerer':
            pose['foreR'] = pose['foreR'] + 12
        return pose
    return n, fn


def strafe(kind, cls, legs):
    n = 28
    d = 1 if kind == 'strafe_l' else -1   # +1: moving to character's left (+X)
    sc = legs / 0.92

    def fn(f):
        ph = (f / n) % 1.0
        pose = dict(combat(cls)) if cls == 'ninja' else dict(relaxed(cls))
        pose = {k: np.asarray(v, dtype=float) for k, v in pose.items()}
        base_lo = pose.get('hips_loc', np.zeros(3))
        for side, off, sx in (('L', 0.0, 1), ('R', 0.5, -1)):
            q = (ph + off) % 1.0
            # abduction swing: leading leg (in move direction) opens first
            ab = 16 * math.cos(TAU * q) * d * sx
            knee = 12 * gauss(q, 0.08, 0.07) + 45 * gauss(q, 0.70, 0.14) + 6
            base = pose.get('thigh' + side, np.zeros(3))
            pose['thigh' + side] = np.array([base[0] + 8, base[1], base[2] + ab + 4])
            pose['shin' + side] = pose.get('shin' + side, 0) * 0.5 + knee
            pose['foot' + side] = (pose.get('foot' + side, np.zeros(1))[0] * 0.5 + 4 * math.sin(TAU * q),)
        pose['hips_loc'] = base_lo * 0.6 + np.array([0.0, (-0.022 * (0.5 + 0.5 * math.cos(2 * TAU * (ph - 0.1))) - 0.01) * sc, 0])
        pose['hips'] = pose.get('hips', np.zeros(3)) * 0.5 + np.array([2, 0, -4 * d + 2 * math.sin(TAU * ph)])
        pose['spine1'] = pose.get('spine1', np.zeros(3)) + np.array([0, 0, 2 * d])
        pose['spine2'] = pose.get('spine2', np.zeros(3)) + np.array([0, 0, 2 * d])
        return pose
    return n, fn


# ----------------------------------------------------------------------------- clip table
def clips(cls, legs):
    """Returns dict name -> (length_frames, loop, fn(frame)->pose)."""
    C = {}
    R = relaxed(cls)
    CB = combat(cls)
    sc = legs / 0.92
    nin = cls == 'ninja'

    def breath(f, n, amp=1.0):
        return math.sin(TAU * f / n) * amp

    # idle ------------------------------------------------------------------
    def idle(f, n=96):
        b = breath(f, n)
        b2 = math.sin(TAU * f / n * 2 + 0.6)
        p = merge(R, {'hips_loc': (0.006 * math.sin(TAU * f / n), -0.004 * (1 + b) * sc, 0),
                      'hips': (0, 0, 1.2 * math.sin(TAU * f / n)),
                      'spine1': (0.8 * b, 0, -0.6 * math.sin(TAU * f / n)), 'spine2': (1.2 * b, 0, 0),
                      'neck': (-0.6 * b, 2 * math.sin(TAU * f / n + 1.0), 0), 'head': (0.5 * b2, 3 * math.sin(TAU * f / n + 0.5), 0),
                      'armL': (1.5 * b, 0.8 * b, 0), 'armR': (1.5 * b, 0.8 * b, 0), 'foreL': 2 * b, 'foreR': 2 * b,
                      'clavL': (1.2 * b, 0), 'clavR': (1.2 * b, 0),
                      'thighL': (2, -3, 1.5 + 0.8 * math.sin(TAU * f / n)), 'thighR': (-1, 4, 2 - 0.8 * math.sin(TAU * f / n)),
                      'shinL': 6, 'shinR': 2, 'footL': (-2,), 'footR': (0,)})
        return p
    C['idle'] = (96, True, idle)

    def idle_c(f, n=60):
        b = breath(f, n)
        return merge(CB, {'hips_loc': (0, -0.008 * (1 + b) * sc, 0), 'spine1': (1.5 * b, 0, 0), 'spine2': (1.5 * b, 0, 0),
                          'shinL': 3 * (1 + b), 'shinR': 3 * (1 + b), 'thighL': (1.5 * (1 + b), 0, 0), 'thighR': (1.5 * (1 + b), 0, 0),
                          'armL': (2 * b, 0, 0), 'armR': (2 * b, 0, 0), 'head': (0, 2 * math.sin(TAU * f / n), 0)})
    C['idle_combat'] = (60, True, idle_c)

    for k in ('walk', 'run', 'sprint', 'backpedal', 'strafe_l', 'strafe_r'):
        n, fn = locomotion(k, cls, legs)
        C[k] = (n, True, fn)

    # jumps -----------------------------------------------------------------
    crouch = {'hips_loc': (0, -0.16 * sc, 0.02), 'hips': (14, 0, 0), 'spine': (8, 0, 0), 'spine1': (6, 0, 0), 'head': (-14, 0, 0),
              'thighL': (52, 0, 4), 'thighR': (52, 0, 4), 'shinL': 88, 'shinR': 88, 'footL': (30,), 'footR': (30,),
              'armL': (-30, 18, 0), 'armR': (-30, 18, 0), 'foreL': 30, 'foreR': 30}
    extend = {'hips_loc': (0, 0.03 * sc, 0), 'hips': (-4, 0, 0), 'spine1': (-4, 0, 0), 'head': (-4, 0, 0),
              'thighL': (-4, 0, 2), 'thighR': (-8, 0, 2), 'shinL': 4, 'shinR': 8, 'footL': (-35,), 'footR': (-40,), 'toeL': (20,), 'toeR': (20,),
              'armL': (120, 22, 0), 'armR': (115, 22, 0), 'foreL': 30, 'foreR': 30}
    air = {'hips_loc': (0, 0.0, 0), 'hips': (2, 0, 0), 'spine1': (4, 0, 0), 'thighL': (40, 0, 6), 'thighR': (20, 0, 6),
           'shinL': 70, 'shinR': 50, 'footL': (-10,), 'footR': (-20,), 'armL': (70, 40, 0), 'armR': (60, 40, 0), 'foreL': 40, 'foreR': 40}
    C['jump_start'] = (14, False, Keys([(0, R), (6, crouch), (11, extend), (14, merge(extend, {'thighL': (10, 0, 0), 'shinL': 20}))]))
    C['jump_loop'] = (24, True, Keys([(0, air), (12, merge(air, {'thighL': (6, 0, 0), 'thighR': (-6, 0, 0), 'armL': (8, 4, 0), 'armR': (-6, 4, 0), 'spine1': (2, 0, 0)}))], loop=True, length=24))
    land_imp = merge(crouch, {'hips_loc': (0, 0.04 * sc, 0), 'armL': (70, 20, 0), 'armR': (70, 20, 0)})
    C['land'] = (16, False, Keys([(0, air), (3, land_imp), (9, merge(crouch, {'hips_loc': (0, 0.09 * sc, -0.02), 'thighL': (-20, 0, 0), 'thighR': (-20, 0, 0), 'shinL': -40, 'shinR': -40})), (16, R)]))

    # dodge: low forward dash-duck (in place) ----------------------------------
    lunge = {'hips_loc': (0, -0.24 * sc, 0.04), 'hips': (30, 0, 0), 'spine': (14, 0, 0), 'spine1': (14, 0, 0), 'spine2': (10, 0, 0),
             'neck': (-20, 0, 0), 'head': (-20, 0, 0), 'thighL': (80, 0, 8), 'shinL': 100, 'footL': (24,),
             'thighR': (-10, 0, 6), 'shinR': 80, 'footR': (-10,), 'armL': (60, 30, 0), 'foreL': 100, 'armR': (-20, 30, 0), 'foreR': 60}
    C['dodge'] = (20, False, Keys([(0, CB), (3, merge(CB, {'hips_loc': (0, -0.05 * sc, 0)})), (8, lunge), (13, merge(lunge, {'hips_loc': (0, 0.06 * sc, 0)})), (20, CB)]))

    # attacks ---------------------------------------------------------------
    if nin:
        a1 = [(0, CB),
              (6, merge(CB, {'spine1': (0, -22, 0), 'spine2': (0, -16, 0), 'hips': (0, -8, 0), 'armR': (55, 75, 30), 'foreR': 85, 'handR': (-10, 0, 20)})),
              (9, merge(CB, {'spine1': (6, 14, 0), 'spine2': (4, 12, 0), 'armR': (85, 40, -20), 'foreR': 25, 'handR': (-10, 0, -10), 'thighL': (12, 0, 0), 'shinL': 10})),
              (12, merge(CB, {'spine1': (8, 28, 0), 'spine2': (6, 22, 0), 'hips': (2, 10, 0), 'armR': (70, -15, -40), 'foreR': 30, 'handR': (-14, 0, -30), 'armL': (-10, 10, 0)})),
              (17, merge(CB, {'spine1': (6, 20, 0), 'spine2': (4, 16, 0), 'armR': (55, 0, -30), 'foreR': 55})), (26, CB)]
        a2 = [(0, CB),
              (6, merge(CB, {'spine1': (4, 24, 0), 'spine2': (2, 18, 0), 'armR': (40, -10, -60), 'foreR': 110, 'handR': (10, 0, 0), 'shinL': 10})),
              (9, merge(CB, {'spine1': (-4, -12, 0), 'spine2': (-4, -10, 0), 'armR': (110, 60, 40), 'foreR': 25, 'handR': (-30, 0, 0)})),
              (12, merge(CB, {'spine1': (-6, -24, 0), 'spine2': (-6, -18, 0), 'hips': (0, -6, 0), 'armR': (150, 70, 40), 'foreR': 20, 'handR': (-45, 0, 0)})),
              (18, merge(CB, {'spine1': (-3, -12, 0), 'armR': (90, 40, 20), 'foreR': 50})), (26, CB)]
        a3 = [(0, CB),
              (8, merge(CB, {'hips_loc': (0, 0.0, 0.02), 'spine': (-6, 0, 0), 'spine1': (-10, -8, 0), 'spine2': (-8, -4, 0), 'head': (2, 0, 0),
                             'armR': (170, 20, 0), 'foreR': 60, 'handR': (20, 0, 0), 'armL': (150, 15, 0), 'foreL': 70, 'thighL': (40, 0, 6), 'shinL': 60})),
              (12, merge(CB, {'hips_loc': (0, -0.13 * sc, -0.03), 'spine': (14, 0, 0), 'spine1': (16, 6, 0), 'spine2': (12, 4, 0), 'head': (-16, 0, 0),
                              'armR': (60, 10, 0), 'foreR': 10, 'handR': (-40, 0, 0), 'armL': (40, 25, 0), 'foreL': 60,
                              'thighL': (60, 0, 6), 'shinL': 70, 'thighR': (-6, 0, 6), 'shinR': 50})),
              (18, merge(CB, {'hips_loc': (0, -0.11 * sc, -0.03), 'spine1': (14, 6, 0), 'armR': (45, 12, 0), 'foreR': 20, 'handR': (-40, 0, 0),
                              'thighL': (55, 0, 6), 'shinL': 65})), (32, CB)]
    else:
        a1 = [(0, CB),
              (7, merge(CB, {'spine1': (-4, -14, 0), 'spine2': (-4, -10, 0), 'armR': (40, 30, 0), 'foreR': 100, 'armL': (30, 20, 0)})),
              (10, merge(CB, {'spine1': (6, 10, 0), 'spine2': (4, 8, 0), 'armR': (95, 10, 0), 'foreR': 10, 'handR': (-10, 0, 0), 'thighL': (26, 0, 6), 'shinL': 30})),
              (16, merge(CB, {'spine1': (4, 6, 0), 'armR': (85, 12, 0), 'foreR': 25})), (26, CB)]
        a2 = [(0, CB),
              (7, merge(CB, {'spine1': (0, 18, 0), 'spine2': (0, 14, 0), 'armL': (60, 60, 20), 'foreL': 120, 'handL': (40, 0, 0)})),
              (10, merge(CB, {'spine1': (6, -16, 0), 'spine2': (6, -12, 0), 'armL': (95, 15, 0), 'foreL': 5, 'handL': (-60, 0, 0), 'armR': (20, 25, 0)})),
              (16, merge(CB, {'spine1': (4, -10, 0), 'armL': (85, 15, 0), 'foreL': 20, 'handL': (-50, 0, 0)})), (26, CB)]
        a3 = [(0, CB),
              (10, merge(CB, {'spine': (-6, 0, 0), 'spine1': (-10, 0, 0), 'spine2': (-8, 0, 0), 'armR': (165, 20, 0), 'foreR': 40, 'armL': (160, 25, 0), 'foreL': 50, 'head': (-6, 0, 0)})),
              (14, merge(CB, {'hips_loc': (0, -0.12 * sc, -0.02), 'spine': (14, 0, 0), 'spine1': (16, 0, 0), 'spine2': (10, 0, 0),
                              'armR': (70, 12, 0), 'foreR': 25, 'armL': (65, 18, 0), 'foreL': 40, 'thighL': (50, 0, 6), 'shinL': 70, 'thighR': (6, 0, 6), 'shinR': 50})),
              (20, merge(CB, {'hips_loc': (0, -0.10 * sc, -0.02), 'spine1': (14, 0, 0), 'armR': (65, 12, 0), 'foreR': 30, 'thighL': (45, 0, 6), 'shinL': 62})), (34, CB)]
    C['attack_1'] = (a1[-1][0], False, Keys(a1))
    C['attack_2'] = (a2[-1][0], False, Keys(a2))
    C['attack_3'] = (a3[-1][0], False, Keys(a3))

    # casting ---------------------------------------------------------------
    if nin:
        ch = merge(CB, {'armL': (62, 8, 30), 'foreL': 115, 'handL': (10, 0, 0), 'armR': (55, 10, -10), 'foreR': 105, 'handR': (-50, 0, 0),
                        'spine1': (6, 0, 0), 'head': (8, 0, 0)})
    else:
        ch = merge(CB, {'armR': (60, 15, 0), 'foreR': 70, 'armL': (80, 25, 30), 'foreL': 25, 'handL': (-60, 0, 0), 'spine1': (-3, 0, 0), 'head': (-4, 0, 0)})

    def chan(f, n=40):
        w = math.sin(TAU * f / n)
        jit = math.sin(TAU * f / n * 5) * 0.8
        return merge(ch, {'spine1': (0.8 * w, 0, 0), 'spine2': (1.2 * w, 0, 0), 'armL': (jit, 0, 0), 'armR': (-jit, 0, 0),
                          'hips_loc': (0, -0.006 * (1 + w) * sc, 0)})
    C['cast_channel'] = (40, True, chan)
    thrust = merge(CB, {'armL': (88, 12, 0), 'foreL': 5, 'handL': (-55, 0, 0), 'armR': (85, 12, 0), 'foreR': 10, 'handR': (-30, 0, 0),
                        'spine1': (8, 0, 0), 'spine2': (6, 0, 0), 'thighL': (34, 0, 6), 'shinL': 40, 'hips_loc': (0, -0.05 * sc, -0.03)})
    C['cast_release'] = (22, False, Keys([(0, ch), (5, merge(ch, {'spine1': (-8, 0, 0), 'armL': (-15, 0, 0), 'armR': (-15, 0, 0), 'foreL': 30})),
                                         (9, thrust), (14, merge(thrust, {'armL': (-6, 0, 0), 'spine1': (-3, 0, 0)})), (22, CB)]))
    up = merge(CB, {'armL': (165, 30, 0), 'foreL': 20, 'armR': (165, 30, 0), 'foreR': 20, 'spine': (-6, 0, 0), 'spine1': (-8, 0, 0), 'head': (-14, 0, 0),
                    'hips_loc': (0, 0.02 * sc, 0), 'thighL': (6, 0, 4), 'shinL': 6, 'thighR': (0, 0, 4), 'shinR': 4})
    slam = merge(CB, {'hips_loc': (0, -0.2 * sc, 0.02), 'hips': (16, 0, 0), 'spine': (16, 0, 0), 'spine1': (16, 0, 0), 'head': (-20, 0, 0),
                      'armL': (60, 35, 0), 'foreL': 10, 'handL': (-60, 0, 0), 'armR': (60, 35, 0), 'foreR': 12,
                      'thighL': (65, 0, 12), 'shinL': 95, 'thighR': (40, 0, 12), 'shinR': 85, 'footL': (28,), 'footR': (20,)})
    C['cast_aoe'] = (32, False, Keys([(0, CB), (10, up), (15, slam), (22, merge(slam, {'hips_loc': (0, 0.02 * sc, 0)})), (32, CB)]))

    # reactions -------------------------------------------------------------
    hitp = merge(CB, {'hips_loc': (0, -0.02, -0.04), 'spine': (-8, 6, 0), 'spine1': (-12, 8, 4), 'spine2': (-10, 6, 0), 'neck': (-10, 0, 0), 'head': (-14, 10, 6),
                      'armL': (25, 40, 0), 'foreL': 60, 'armR': (30, 35, 0), 'foreR': 50})
    C['hit'] = (16, False, Keys([(0, CB), (3, hitp), (7, merge(hitp, {'spine1': (6, 0, 0), 'head': (8, 0, 0)})), (16, CB)]))
    dz = legs  # drop hips to the floor
    death_keys = [(0, CB), (4, hitp),
                  (14, merge(R, {'hips_loc': (0, -0.30 * sc, -0.06), 'hips': (10, 10, 4), 'spine': (-10, 0, 0), 'spine1': (-12, 0, 0), 'head': (-20, 10, 0),
                                 'thighL': (60, 0, 8), 'shinL': 110, 'thighR': (40, 0, 4), 'shinR': 90, 'armL': (40, 50, 0), 'armR': (60, 50, 0), 'foreL': 40, 'foreR': 30})),
                  (24, merge({'hips_loc': (0, -(dz - 0.16) * 1.0, -0.18 * sc), 'hips': (-70, 12, 6), 'spine': (-6, 0, 0), 'spine1': (-4, 0, 0), 'neck': (6, 0, 0), 'head': (10, 25, 0),
                              'thighL': (78, 0, 12), 'shinL': 60, 'thighR': (55, 0, 8), 'shinR': 40, 'armL': (40, 80, 0), 'foreL': 20, 'armR': (20, 75, 0), 'foreR': 30})),
                  (30, merge({'hips_loc': (0, -(dz - 0.13), -0.2 * sc), 'hips': (-86, 12, 6), 'spine': (2, 0, 0), 'spine1': (2, 0, 0), 'neck': (8, 0, 0), 'head': (14, 35, 0),
                              'thighL': (88, 0, 14), 'shinL': 30, 'thighR': (78, 0, 10), 'shinR': 20, 'footL': (-30,), 'footR': (-30,),
                              'armL': (30, 85, 0), 'foreL': 15, 'armR': (10, 80, 0), 'foreR': 25})),
                  (48, merge({'hips_loc': (0, -(dz - 0.13), -0.2 * sc), 'hips': (-88, 12, 6), 'spine': (2, 0, 0), 'spine1': (2, 0, 0), 'neck': (10, 0, 0), 'head': (16, 40, 0),
                              'thighL': (90, 0, 14), 'shinL': 26, 'thighR': (80, 0, 10), 'shinR': 16, 'footL': (-34,), 'footR': (-34,),
                              'armL': (30, 88, 0), 'foreL': 12, 'armR': (10, 84, 0), 'foreR': 22}))]
    C['death'] = (48, False, Keys(death_keys))
    reach = merge(R, {'hips_loc': (0, -0.10 * sc, 0.0), 'hips': (16, 0, 0), 'spine': (14, 0, 0), 'spine1': (12, 0, 0), 'head': (-6, 0, 0),
                      'thighL': (40, 0, 4), 'shinL': 50, 'thighR': (30, 0, 4), 'shinR': 40, 'footL': (12,), 'footR': (8,),
                      'armR': (80, 10, 0), 'foreR': 15, 'handR': (-20, 0, 0)})
    C['interact'] = (34, False, Keys([(0, R), (10, reach), (14, merge(reach, {'handR': (20, 0, 0), 'foreR': 25})), (20, reach), (34, R)]))
    bow = merge(R, {'hips': (28, 0, 0), 'spine': (14, 0, 0), 'spine1': (10, 0, 0), 'spine2': (6, 0, 0), 'neck': (8, 0, 0), 'head': (10, 0, 0),
                    'thighL': (-8, 0, 0), 'thighR': (-8, 0, 0), 'hips_loc': (0, -0.01, 0.05),
                    'armL': (40, -2, 0), 'foreL': 95, 'armR': (40, -2, 0), 'foreR': 95, 'handL': (0, 0, -30), 'handR': (0, 0, -30)})
    C['emote_bow'] = (48, False, Keys([(0, R), (8, merge(R, {'armL': (30, 0, 0), 'foreL': 80, 'armR': (30, 0, 0), 'foreR': 80})), (18, bow), (30, bow), (48, R)]))
    sitp = {'hips_loc': (0, -(legs - 0.20) * 1.0, -0.10 * sc), 'hips': (-6, 0, 0), 'spine': (8, 0, 0), 'spine1': (6, 0, 0), 'spine2': (4, 0, 0), 'head': (-6, 0, 0),
            'thighL': (88, 30, 30), 'shinL': 135, 'footL': (20,), 'thighR': (88, 30, 30), 'shinR': 135, 'footR': (20,),
            'armL': (30, 8, 0), 'foreL': 45, 'armR': (30, 8, 0), 'foreR': 45, 'handL': (-20, 0, 0), 'handR': (-20, 0, 0)}

    def sit(f, n=90):
        b = breath(f, n)
        return merge(sitp, {'spine1': (1.2 * b, 0, 0), 'spine2': (1.2 * b, 0, 0), 'head': (0, 4 * math.sin(TAU * f / n), 0)})
    C['sit'] = (90, True, sit)
    return C


CLIP_ORDER = ['idle', 'idle_combat', 'walk', 'run', 'sprint', 'strafe_l', 'strafe_r', 'backpedal', 'jump_start', 'jump_loop', 'land',
              'dodge', 'attack_1', 'attack_2', 'attack_3', 'cast_channel', 'cast_release', 'cast_aoe', 'hit', 'death', 'interact', 'emote_bow', 'sit']


# ----------------------------------------------------------------------------- application to the armature
class Applier:
    def __init__(self, arm, abd_off=0.0):
        self.arm = arm
        self.abd_off = abd_off
        self.rest = {}
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            m = pb.bone.matrix_local.to_3x3()
            self.rest[pb.name] = m

    def arm_quat(self, side, fwd, abd, twist):
        sx = 1 if side == 'L' else -1
        f, a = math.radians(fwd), math.radians(abd)
        d = mathutils.Vector((sx * math.sin(a), -math.sin(f) * math.cos(a), -math.cos(f) * math.cos(a))).normalized()
        F = mathutils.Vector((0, -1, 0))
        U = mathutils.Vector((0, 0, 1))
        H = F + U * max(0.0, d.dot(F)) * 2.0 - U * max(0.0, d.dot(U)) * 0.0
        if d.dot(U) > 0.3:
            H = F
        z = (H - d * H.dot(d))
        if z.length < 1e-4:
            z = U.copy()
        z.normalize()
        x = d.cross(z)
        Mt = mathutils.Matrix((x, d, z)).transposed()
        Mt = Mt @ mathutils.Matrix.Rotation(math.radians(twist * sx), 3, 'Y')
        Mr = self.rest['upperarm.' + side]
        # local rotation relative to the bone rest frame (parent assumed at rest orientation)
        return (Mr.inverted() @ Mt).to_quaternion()

    @staticmethod
    def eul(p, y, r, mirror=False):
        if mirror:
            y, r = -y, -r
        return mathutils.Euler((math.radians(p), math.radians(y), math.radians(r)), 'XYZ').to_quaternion()

    def apply(self, pose):
        pbs = self.arm.pose.bones
        for pb in pbs:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)

        def g(k, n=3):
            v = pose.get(k)
            if v is None:
                return [0.0] * n
            v = np.atleast_1d(np.asarray(v, dtype=float))
            return list(v) + [0.0] * (n - len(v))
        hl = g('hips_loc')
        pbs['hips'].location = (hl[0], hl[1], hl[2])   # hips local: X=+X, Y=up, Z=forward(-Y)
        for b in EULER:
            p, y, r = g(b)
            pbs[b].rotation_quaternion = self.eul(p, y, r)
        for side in 'LR':
            m = side == 'R'
            fwd, abd, tw = g('arm' + side)
            # upper arm direction: rest A-pose expressed through the direction solver
            pbs['upperarm.' + side].rotation_quaternion = self.arm_quat(side, fwd, abd + self.abd_off * max(0.0, 1 - abd / 60.0), tw)
            ra, rf = g('clav' + side, 2)
            pbs['shoulder.' + side].rotation_quaternion = self.eul(rf, 0, ra, m)
            pbs['forearm.' + side].rotation_quaternion = self.eul(g('fore' + side, 1)[0], 0, 0, m)
            hp, hy, hr = g('hand' + side)
            pbs['hand.' + side].rotation_quaternion = self.eul(hp, hy, hr, m)
            tp, ty, tr = g('thigh' + side)
            pbs['thigh.' + side].rotation_quaternion = self.eul(tp, ty, tr, m)
            pbs['shin.' + side].rotation_quaternion = self.eul(-g('shin' + side, 1)[0], 0, 0, m)
            pbs['foot.' + side].rotation_quaternion = self.eul(g('foot' + side, 1)[0], 0, 0, m)
            pbs['toe.' + side].rotation_quaternion = self.eul(g('toe' + side, 1)[0], 0, 0, m)


def bake_actions(arm, cls, legs, log=print, only=None, abd_off=0.0):
    app = Applier(arm, abd_off)
    C = clips(cls, legs)
    if arm.animation_data is None:
        arm.animation_data_create()
    acts = []
    for name in CLIP_ORDER:
        if only and name not in only:
            continue
        n, loop, fn = C[name]
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data.action = act
        last = n if loop else n
        prev = {}
        frames = list(range(0, last + 1, 2))
        if frames[-1] != last:
            frames.append(last)
        for f in frames:
            pose = fn(f if not loop else f % n)
            app.apply(pose)
            for pb in arm.pose.bones:
                q = pb.rotation_quaternion
                if pb.name in prev and prev[pb.name].dot(q) < 0:
                    pb.rotation_quaternion = -q
                prev[pb.name] = pb.rotation_quaternion.copy()
                pb.keyframe_insert('rotation_quaternion', frame=f + 1)
                if pb.name == 'hips':
                    pb.keyframe_insert('location', frame=f + 1)
        acts.append(act)
    arm.animation_data.action = None
    return acts
