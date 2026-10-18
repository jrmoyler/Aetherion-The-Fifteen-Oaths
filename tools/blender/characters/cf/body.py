"""Procedural adult anatomy: skeleton landmarks + SDF anatomy primitives.

All lengths are authored for a 1.80 m reference adult and scaled by the body parameters.
Blender space: Z up, character faces -Y, character's left = +X (".L").
"""
import math
import numpy as np
from . import sdf as S

BONES = ['root', 'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
         'shoulder.L', 'upperarm.L', 'forearm.L', 'hand.L',
         'shoulder.R', 'upperarm.R', 'forearm.R', 'hand.R',
         'thigh.L', 'shin.L', 'foot.L', 'toe.L',
         'thigh.R', 'shin.R', 'foot.R', 'toe.R']
BONE_ID = {b: i for i, b in enumerate(BONES)}
PARENT = {'root': None, 'hips': 'root', 'spine': 'hips', 'spine1': 'spine', 'spine2': 'spine1',
          'neck': 'spine2', 'head': 'neck',
          'shoulder.L': 'spine2', 'upperarm.L': 'shoulder.L', 'forearm.L': 'upperarm.L', 'hand.L': 'forearm.L',
          'shoulder.R': 'spine2', 'upperarm.R': 'shoulder.R', 'forearm.R': 'upperarm.R', 'hand.R': 'forearm.R',
          'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L', 'toe.L': 'foot.L',
          'thigh.R': 'hips', 'shin.R': 'thigh.R', 'foot.R': 'shin.R', 'toe.R': 'foot.R'}

DEFAULT = dict(H=1.80, sex=0.0, mass=0.0, muscle=0.5, age=0.0, shoulder=1.0, hip=1.0, width=1.0,
               head=1.0, arm_angle=47.0, neck_len=1.0, belly=0.0, chest=1.0, leg=1.0, grip_r=False, grip_l=False,
               face_wide=1.0, nose=1.0, jaw=1.0, brow=1.0)


def lerp(a, b, t):
    return a + (b - a) * t


class Body:
    def __init__(self, params):
        p = dict(DEFAULT)
        p.update(params or {})
        self.p = p
        self.build_skeleton()
        self.build_anatomy()

    # ------------------------------------------------------------------ skeleton
    def build_skeleton(self):
        p = self.p
        H = p['H']
        s = H / 1.80
        fem = p['sex']
        w = p['width'] * s * (1 + 0.10 * p['mass'])
        hs = s ** 0.45 * p['head'] * lerp(1.0, 0.95, fem)   # head scale (short people: larger heads)
        self.s, self.w, self.hs = s, w, hs
        age = p['age']
        legk = p['leg']
        # vertical landmarks (reference adult 1.80 m)
        head_h = 0.232 * hs
        top = H
        head_base = top - head_h            # ~ jaw/neck junction (head bone head)
        z_ankle = 0.085 * s
        z_knee = (0.50 * legk) * s
        z_hipj = (0.925 * legk) * s
        # torso spans from hip joint to head base
        z_pelvis = z_hipj + 0.055 * s
        neck_len = 0.085 * s * p['neck_len'] * lerp(1.0, 0.75, age)
        z_neck = head_base - neck_len       # neck base (C7)
        torso = z_neck - z_pelvis
        z_spine = z_pelvis + torso * 0.20
        z_spine1 = z_pelvis + torso * 0.45
        z_spine2 = z_pelvis + torso * 0.70
        z_shoulder = z_neck - 0.045 * s
        # elder stoop: forward offsets (−Y) growing up the spine
        st = age * 0.06 * s
        yo = lambda f: -st * f * f
        J = {}
        J['pelvis'] = S.v3(0, 0.010 * s, z_pelvis)
        J['spine'] = S.v3(0, 0.005 * s, z_spine)
        J['spine1'] = S.v3(0, 0.010 * s + yo(0.3), z_spine1)
        J['spine2'] = S.v3(0, 0.020 * s + yo(0.6), z_spine2)
        J['neck'] = S.v3(0, 0.025 * s + yo(1.0), z_neck)
        J['head'] = S.v3(0, 0.000 * s + yo(1.3), head_base)
        J['top'] = S.v3(0, -0.005 * s + yo(1.4), top)
        sh_x = lerp(0.185, 0.160, fem) * w * p['shoulder']
        hip_x = lerp(0.090, 0.098, fem) * w * p['hip']
        self.sh_x, self.hip_x = sh_x, hip_x
        ang = math.radians(p['arm_angle'])
        for side, sx in (('L', 1), ('R', -1)):
            Sj = S.v3(sx * sh_x, 0.020 * s + yo(0.75), z_shoulder)
            J['clav' + side] = S.v3(sx * 0.025 * w, -0.005 * s + yo(0.75), z_shoulder + 0.01 * s)
            J['S' + side] = Sj
            ua = 0.295 * s
            fa = 0.255 * s
            d1 = S.normalize((sx * math.cos(ang), 0.02, -math.sin(ang)))
            E = Sj + d1 * ua
            d2 = S.normalize((sx * math.cos(ang + 0.10), -0.20, -math.sin(ang + 0.10)))
            W = E + d2 * fa
            J['E' + side], J['W' + side] = E, W
            J['Hd' + side] = W + d2 * 0.175 * s
            Hp = S.v3(sx * hip_x, 0.005 * s, z_hipj)
            K = S.v3(sx * (hip_x + 0.008 * s), -0.012 * s, z_knee)
            A = S.v3(sx * (hip_x + 0.012 * s), 0.018 * s, z_ankle)
            Ball = S.v3(sx * (hip_x + 0.022 * s), -0.115 * s, 0.022 * s)
            Toe = S.v3(sx * (hip_x + 0.026 * s), -0.185 * s, 0.020 * s)
            J['Hp' + side], J['K' + side], J['A' + side], J['Ball' + side], J['Toe' + side] = Hp, K, A, Ball, Toe
        self.J = J
        b = {}
        b['root'] = (S.v3(0, 0, 0), S.v3(0, 0.0, 0.25 * s))
        b['hips'] = (J['pelvis'], J['spine'])
        b['spine'] = (J['spine'], J['spine1'])
        b['spine1'] = (J['spine1'], J['spine2'])
        b['spine2'] = (J['spine2'], J['neck'])
        b['neck'] = (J['neck'], J['head'])
        b['head'] = (J['head'], J['top'])
        for side in 'LR':
            b['shoulder.' + side] = (J['clav' + side], J['S' + side])
            b['upperarm.' + side] = (J['S' + side], J['E' + side])
            b['forearm.' + side] = (J['E' + side], J['W' + side])
            b['hand.' + side] = (J['W' + side], J['Hd' + side])
            b['thigh.' + side] = (J['Hp' + side], J['K' + side])
            b['shin.' + side] = (J['K' + side], J['A' + side])
            b['foot.' + side] = (J['A' + side], J['Ball' + side])
            b['toe.' + side] = (J['Ball' + side], J['Toe' + side])
        self.bones = b
        # head frame
        self.hc = J['head'] + S.v3(0, -0.004 * hs, 0.105 * hs)   # centre of skull volume

    def bone_axis(self, name):
        a, b = self.bones[name]
        return a, b, b - a

    def along(self, name, t):
        a, b = self.bones[name]
        return a + (b - a) * t

    # ------------------------------------------------------------------ anatomy
    def build_anatomy(self):
        p = self.p
        s, w, hs = self.s, self.w, self.hs
        fem = p['sex']
        m = p['mass']
        mus = p['muscle'] * lerp(1.0, 0.55, fem)
        age = p['age']
        J = self.J
        L = []   # (prim, bone, k)

        def add(prim, bone, k=0.02):
            L.append((prim, bone, k))
        fat = max(m, 0) * 0.025 * s
        lean = min(m, 0) * 0.02 * s
        R = lambda r: r * s + fat + lean
        # ---------------- torso
        pel = J['pelvis']
        add(S.ellipsoid(pel + S.v3(0, 0.0, 0.005 * s), (lerp(0.155, 0.175, fem) * w * p['hip'] + fat, R(0.105), R(0.105))), 'hips', 0.0)
        # glutes
        for sx in (1, -1):
            add(S.ellipsoid(pel + S.v3(sx * 0.068 * w * p['hip'], 0.060 * s, -0.050 * s),
                            (R(lerp(0.080, 0.088, fem)), R(lerp(0.068, 0.078, fem)), R(0.095)),
                            S.rot_euler(0, sx * 10, 0)), 'hips', 0.04)
        belly = p['belly'] + max(m, 0) * 0.8 + age * 0.3
        waist_w = lerp(0.135, 0.118, fem) * w
        add(S.ellipsoid(J['spine'] + S.v3(0, -0.012 * s, 0.01 * s),
                        (waist_w + fat * 1.6 + belly * 0.03 * s, R(0.095) + belly * 0.045 * s, R(0.115))), 'spine', 0.04)
        if belly > 0.05:
            add(S.ellipsoid(J['spine'] + S.v3(0, -0.05 * s - belly * 0.03 * s, -0.01 * s),
                            (0.11 * s * (0.8 + belly * 0.4), 0.06 * s + belly * 0.04 * s, 0.10 * s)), 'spine', 0.06)
        rib_w = lerp(0.150, 0.130, fem) * w * lerp(1.0, 1.06, mus)
        add(S.ellipsoid(J['spine1'] + S.v3(0, 0.002 * s, 0.0), (rib_w + fat, R(0.102), R(0.125))), 'spine1', 0.06)
        chest_w = lerp(0.168, 0.140, fem) * w * p['chest'] * lerp(0.97, 1.08, mus)
        add(S.ellipsoid(J['spine2'] + S.v3(0, 0.0, 0.015 * s), (chest_w * 0.92 + fat, R(0.100), R(0.115))), 'spine2', 0.07)
        # upper back / traps
        add(S.ellipsoid(J['spine2'] + S.v3(0, 0.045 * s, 0.065 * s), (0.110 * w, R(0.055), R(0.075))), 'spine2', 0.06)
        for sx in (1, -1):
            # latissimus: armpit -> waist taper (V shape)
            add(S.roundcone(J['spine2'] + S.v3(sx * (chest_w - 0.025 * s), 0.035 * s, 0.03 * s),
                            J['spine'] + S.v3(sx * (waist_w - 0.03 * s), 0.035 * s, 0.0),
                            0.045 * s * lerp(1, 1.2, mus), 0.03 * s), 'spine1', 0.06)
        for sx in (1, -1):
            # scapula
            add(S.ellipsoid(J['spine2'] + S.v3(sx * 0.080 * w, 0.070 * s, 0.025 * s), (0.055 * w, R(0.026), R(0.070)),
                            S.rot_euler(0, sx * -12, 0)), 'spine2', 0.05)
            # pectoral
            pc = J['spine2'] + S.v3(sx * 0.072 * w, -0.068 * s, 0.020 * s)
            add(S.ellipsoid(pc, (0.075 * w * lerp(1, 1.12, mus), R(0.038) * lerp(0.9, 1.25, mus), R(0.058)),
                            S.rot_euler(0, sx * 18, 0)), 'spine2', 0.035)
            if fem > 0.3:
                bc = J['spine2'] + S.v3(sx * 0.078 * w, -0.088 * s, -0.020 * s)
                br = 0.058 * s * p['chest'] * fem
                add(S.ellipsoid(bc, (br * 1.05, br * 0.95, br), S.rot_euler(-20, sx * 10, 0)), 'spine2', 0.03)
            # trapezius slope neck -> shoulder
            add(S.roundcone(J['neck'] + S.v3(sx * 0.035 * w, 0.020 * s, -0.005 * s),
                            J['S' + ('L' if sx > 0 else 'R')] + S.v3(-sx * 0.035 * w, 0.010 * s, 0.035 * s),
                            0.042 * s * lerp(1, 1.15, mus), 0.030 * s), 'spine2', 0.035)
            # clavicle ridge
            add(S.roundcone(J['neck'] + S.v3(sx * 0.02 * w, -0.045 * s, -0.035 * s),
                            J['S' + ('L' if sx > 0 else 'R')] + S.v3(-sx * 0.02 * w, -0.02 * s, 0.025 * s),
                            0.013 * s, 0.015 * s), 'shoulder.' + ('L' if sx > 0 else 'R'), 0.02)
            # oblique / love handle
            add(S.ellipsoid(J['spine'] + S.v3(sx * (waist_w - 0.01 * s), 0.0, 0.02 * s),
                            (R(0.035), R(0.065), R(0.08))), 'spine', 0.05)
        # abdominal plane (subtle six-pack bulge for muscular lean bodies)
        if mus > 0.5 and m < 0.3:
            for row in range(3):
                for sx in (1, -1):
                    add(S.ellipsoid(J['spine'] + S.v3(sx * 0.03 * s, -0.088 * s - fat, (0.03 + row * 0.055) * s),
                                    (0.026 * s, 0.014 * s, 0.024 * s)), 'spine' if row < 1 else 'spine1', 0.02)
        # ---------------- neck
        nb, hb = J['neck'], J['head']
        nr = lerp(0.056, 0.047, fem) * s * lerp(1, 1.12, mus) + fat * 0.6
        add(S.roundcone(nb + S.v3(0, 0.0, -0.02 * s), hb + S.v3(0, 0.012 * s, 0.02 * s), nr * 1.05, nr * 0.92), 'neck', 0.03)
        for sx in (1, -1):   # sternocleidomastoid
            add(S.roundcone(hb + S.v3(sx * 0.045 * hs, 0.020 * hs, 0.02 * hs), nb + S.v3(sx * 0.012 * s, -0.055 * s, -0.02 * s),
                            0.017 * s, 0.014 * s), 'neck', 0.02)
        # ---------------- head
        self.add_head(add)
        # ---------------- arms
        for side, sx in (('L', 1), ('R', -1)):
            Sj, E, W, Hd = J['S' + side], J['E' + side], J['W' + side], J['Hd' + side]
            ua = S.normalize(E - Sj)
            fa = S.normalize(W - E)
            ar = lerp(1.0, 0.82, fem) * lerp(0.92, 1.12, mus) * (1 + max(m, 0) * 0.25)
            # deltoid
            add(S.ellipsoid(Sj + ua * 0.035 * s + S.v3(sx * 0.012 * s, 0, 0.018 * s), (0.058 * s * ar, 0.060 * s * ar, 0.085 * s * ar),
                            S.frame_from_axis(ua)), 'upperarm.' + side, 0.03)
            add(S.roundcone(Sj, E, 0.047 * s * ar, 0.037 * s * ar), 'upperarm.' + side, 0.03)
            # biceps (front = -Y) / triceps (back)
            add(S.ellipsoid(Sj + (E - Sj) * 0.55 + S.v3(0, -0.018 * s, 0), (0.034 * s * ar, 0.032 * s * ar, 0.075 * s),
                            S.frame_from_axis(ua)), 'upperarm.' + side, 0.03)
            add(S.ellipsoid(Sj + (E - Sj) * 0.42 + S.v3(0, 0.020 * s, 0.006 * s), (0.034 * s * ar, 0.032 * s * ar, 0.085 * s),
                            S.frame_from_axis(ua)), 'upperarm.' + side, 0.03)
            add(S.sphere(E + S.v3(0, 0.012 * s, 0), 0.036 * s * ar), 'forearm.' + side, 0.03)
            add(S.roundcone(E, W, 0.040 * s * ar, 0.026 * s * ar), 'forearm.' + side, 0.025)
            # brachioradialis / forearm flexors near elbow
            add(S.ellipsoid(E + (W - E) * 0.28 + S.v3(sx * 0.008 * s, -0.008 * s, 0.006 * s), (0.036 * s * ar, 0.032 * s * ar, 0.085 * s),
                            S.frame_from_axis(fa)), 'forearm.' + side, 0.03)
            self.add_hand(add, side, sx, W, fa, p['grip_' + side.lower()])
        # ---------------- legs
        for side, sx in (('L', 1), ('R', -1)):
            Hp, K, A, Ball, Toe = J['Hp' + side], J['K' + side], J['A' + side], J['Ball' + side], J['Toe' + side]
            tl = S.normalize(K - Hp)
            lr = lerp(1.0, 1.04, fem) * (1 + max(m, 0) * 0.35) * lerp(0.95, 1.08, mus)
            add(S.roundcone(Hp + S.v3(sx * 0.008 * s, 0.0, 0.03 * s), K, 0.088 * s * lr, 0.053 * s), 'thigh.' + side, 0.05)
            # quads (front), hamstring (back), adductor (inner)
            add(S.ellipsoid(Hp + (K - Hp) * 0.50 + S.v3(sx * 0.006 * s, -0.030 * s, 0), (0.058 * s * lr, 0.05 * s * lr, 0.17 * s),
                            S.frame_from_axis(tl)), 'thigh.' + side, 0.04)
            add(S.ellipsoid(Hp + (K - Hp) * 0.45 + S.v3(0, 0.032 * s, 0), (0.055 * s * lr, 0.045 * s * lr, 0.16 * s),
                            S.frame_from_axis(tl)), 'thigh.' + side, 0.04)
            add(S.ellipsoid(Hp + (K - Hp) * 0.25 + S.v3(-sx * 0.035 * s, 0.0, 0), (0.045 * s * lr, 0.05 * s * lr, 0.12 * s),
                            S.frame_from_axis(tl)), 'thigh.' + side, 0.04)
            add(S.sphere(K + S.v3(0, -0.005 * s, 0.01 * s), 0.050 * s), 'shin.' + side, 0.03)
            add(S.ellipsoid(K + S.v3(0, -0.040 * s, 0.012 * s), (0.026 * s, 0.014 * s, 0.03 * s)), 'shin.' + side, 0.015)
            add(S.roundcone(K, A, 0.048 * s, 0.031 * s), 'shin.' + side, 0.03)
            sl = S.normalize(A - K)
            add(S.ellipsoid(K + (A - K) * 0.30 + S.v3(0, 0.025 * s, 0), (0.048 * s * lr, 0.052 * s * lr, 0.11 * s),
                            S.frame_from_axis(sl)), 'shin.' + side, 0.04)
            # foot
            heel = A + S.v3(0, 0.025 * s, -0.050 * s)
            add(S.sphere(heel, 0.034 * s), 'foot.' + side, 0.02)
            add(S.roundcone(A + S.v3(0, 0, -0.02 * s), Ball + S.v3(0, 0, 0.004 * s), 0.036 * s, 0.026 * s), 'foot.' + side, 0.03)
            add(S.roundbox(Ball + S.v3(0, -0.010 * s, -0.002 * s), (0.045 * s, 0.030 * s, 0.018 * s), r=0.016 * s), 'foot.' + side, 0.02)
            add(S.roundbox((Ball + Toe) / 2 + S.v3(0, 0, -0.004 * s), (0.044 * s, 0.040 * s, 0.014 * s), r=0.013 * s), 'toe.' + side, 0.02)
        self.anatomy = L

    def add_head(self, add):
        """Skull, face planes, ears.  Eyes are separate parts (see eye_parts)."""
        p = self.p
        hs = self.hs
        fem = p['sex']
        age = p['age']
        hc = self.hc
        fw = p['face_wide']
        jaw = p['jaw'] * lerp(1.0, 0.86, fem)
        V = lambda x, y, z: hc + S.v3(x * hs * fw if abs(x) > 0 else 0, y * hs, z * hs)
        # cranium
        add(S.ellipsoid(V(0, 0.006, 0.030), (0.0740 * hs * fw, 0.100 * hs, 0.090 * hs)), 'head', 0.0)
        # occipital
        add(S.ellipsoid(V(0, 0.045, 0.00), (0.060 * hs * fw, 0.055 * hs, 0.062 * hs)), 'head', 0.03)
        # face mass (maxilla + cheeks)
        add(S.ellipsoid(V(0, -0.038, -0.020), (0.064 * hs * fw, 0.056 * hs, 0.062 * hs)), 'head', 0.03)
        # lower face / mandible body
        add(S.ellipsoid(V(0, -0.032, -0.068), (0.050 * hs * fw * jaw, 0.055 * hs, 0.040 * hs)), 'head', 0.03)
        for sx in (1, -1):
            # jaw angle (gonion)
            add(S.sphere(V(sx * 0.050 * jaw, 0.002, -0.064), 0.017 * hs), 'head', 0.03)
            # cheekbones (zygomatic)
            add(S.ellipsoid(V(sx * 0.050, -0.060, -0.008), (0.020 * hs, 0.014 * hs, 0.011 * hs), S.rot_euler(0, 0, sx * 25)), 'head', 0.025)
            # temple fill
            add(S.ellipsoid(V(sx * 0.058, -0.035, 0.020), (0.016 * hs, 0.030 * hs, 0.030 * hs)), 'head', 0.03)
        # chin
        add(S.ellipsoid(V(0, -0.084, -0.100), (0.021 * hs * jaw, 0.015 * hs, 0.016 * hs)), 'head', 0.02)
        # brow ridge (glabella + arches)
        br = p['brow'] * lerp(1.0, 0.55, fem)
        for sx in (1, -1):
            add(S.roundcone(V(sx * 0.046, -0.078, 0.031), V(sx * 0.008, -0.090, 0.030), 0.0055 * hs + 0.003 * hs * br, 0.0065 * hs + 0.003 * hs * br), 'head', 0.014)
        add(S.ellipsoid(V(0, -0.088, 0.042), (0.030 * hs, 0.012 * hs, 0.026 * hs)), 'head', 0.02)
        # nose
        nz = p['nose']
        add(S.roundcone(V(0, -0.092, 0.022), V(0, -0.113 - 0.004 * nz, -0.024), 0.0062 * hs, 0.0085 * hs * nz), 'head', 0.008)
        add(S.ellipsoid(V(0, -0.098, -0.004), (0.010 * hs, 0.010 * hs, 0.018 * hs)), 'head', 0.008)
        add(S.sphere(V(0, -0.108 - 0.004 * nz, -0.029), 0.0095 * hs * nz), 'head', 0.007)
        for sx in (1, -1):
            add(S.sphere(V(sx * 0.0115, -0.098, -0.032), 0.0072 * hs * nz), 'head', 0.012)
        # lips + philtrum
        add(S.roundcone(V(-0.021, -0.090, -0.054), V(0.0, -0.0975, -0.051), 0.0040 * hs, 0.0054 * hs), 'head', 0.007)
        add(S.roundcone(V(0.021, -0.090, -0.054), V(0.0, -0.0975, -0.051), 0.0040 * hs, 0.0054 * hs), 'head', 0.007)
        add(S.roundcone(V(-0.018, -0.088, -0.064), V(0.0, -0.0945, -0.066), 0.0044 * hs, 0.0060 * hs), 'head', 0.007)
        add(S.roundcone(V(0.018, -0.088, -0.064), V(0.0, -0.0945, -0.066), 0.0044 * hs, 0.0060 * hs), 'head', 0.007)
        # ears
        for sx in (1, -1):
            ec = V(sx * 0.074, 0.008, -0.004)
            ear = S.ellipsoid(ec, (0.009 * hs, 0.021 * hs, 0.031 * hs), S.rot_euler(0, sx * -8, sx * -12))
            ear = ear.sub(S.sphere(ec + S.v3(sx * 0.008 * hs, -0.002 * hs, -0.004 * hs), 0.010 * hs), 0.004 * hs)
            add(ear, 'head', 0.006)
        self.eye_c = {sx: V(sx * 0.0315, -0.0785, 0.012) for sx in (1, -1)}
        self.eye_r = 0.0120 * hs
        # cut list: eye sockets + mouth line (applied after union as smooth subtraction)
        self.head_cuts = []
        for sx in (1, -1):
            self.head_cuts.append((S.sphere(V(sx * 0.0315, -0.0785, 0.012), 0.0134 * hs), 0.003 * hs))
        self.head_cuts.append((S.roundbox(V(0, -0.104, -0.0595), (0.020 * hs, 0.006 * hs, 0.0009 * hs), S.rot_euler(0, 0, 0), 0.0008 * hs), 0.002 * hs))
        self.mouth_c = V(0, -0.098, -0.059)
        self.nose_tip = V(0, -0.118, -0.03)
        self.brow_c = V(0, -0.090, 0.032)

    def eye_parts(self):
        """(prim, centre) for each eyeball plus eyelid rims fused into the skin."""
        eyes = []
        lids = []
        hs = self.hs
        for sx in (1, -1):
            c = self.eye_c[sx]
            eyes.append(S.sphere(c, self.eye_r))
            # closed eyelid caps: shells of the eyeball sphere covering the top and bottom (almond opening)
            r = self.eye_r
            cap = S.sphere(c + S.v3(0, 0.0005 * hs, 0), r + 0.0017 * hs).sub(S.sphere(c, r + 0.0004 * hs), 0.0)
            up = cap.inter(S.halfspace(c + S.v3(0, 0, 0.32 * r), (0, -0.25, -1)), 0.0012 * hs)
            lo = cap.inter(S.halfspace(c + S.v3(0, 0, -0.52 * r), (0, -0.2, 1)), 0.0012 * hs)
            lids.append(up.inter(S.halfspace(c + S.v3(0, 0.25 * r, 0), (0, 1, 0)), 0.001))
            lids.append(lo.inter(S.halfspace(c + S.v3(0, 0.25 * r, 0), (0, 1, 0)), 0.001))
        return eyes, lids

    def add_hand(self, add, side, sx, W, fa, grip):
        s = self.s * lerp(1.0, 0.88, self.p['sex'])
        u = fa
        fwd = S.v3(0, -1, 0)
        t = S.normalize(fwd - u * np.dot(fwd, u))         # thumb side
        n = S.normalize(np.cross(u, t))                   # palm normal candidate
        if np.dot(n, S.v3(-sx, 0, 0)) < 0:
            n = -n
        b = 'hand.' + side
        Mh = np.stack([t, n, u], axis=1)
        add(S.roundcone(W - u * 0.02 * s, W + u * 0.015 * s, 0.026 * s, 0.024 * s), b, 0.012)
        palm_c = W + u * 0.050 * s
        add(S.roundbox(palm_c, (0.041 * s, 0.015 * s, 0.045 * s), Mh, 0.013 * s), b, 0.012)
        # thenar pad
        add(S.ellipsoid(W + u * 0.03 * s + t * 0.022 * s + n * 0.008 * s, (0.018 * s, 0.014 * s, 0.03 * s), Mh), b, 0.01)
        lens = [(0.040, 0.025, 0.020), (0.045, 0.028, 0.021), (0.042, 0.026, 0.020), (0.034, 0.020, 0.018)]
        offs = [0.028, 0.009, -0.010, -0.027]
        rads = [0.0092, 0.0095, 0.0090, 0.0080]
        curl = [(70, 85, 55)] * 4 if grip else [(12, 18, 12), (15, 22, 14), (18, 25, 16), (22, 28, 18)]
        self.finger_tips = getattr(self, 'finger_tips', {})
        for i in range(4):
            base = W + u * (0.093 * s - abs(offs[i]) * 0.15 * s) + t * offs[i] * s
            d = u.copy()
            pts = [base]
            ang = 0
            for j in range(3):
                ang += math.radians(curl[i][j])
                # rotate u towards palm normal by accumulated angle
                d = u * math.cos(ang) + n * math.sin(ang)
                pts.append(pts[-1] + d * lens[i][j] * s)
            r = rads[i] * s
            add(S.chain(pts, [r, r * 0.92, r * 0.84, r * 0.75], 0.004 * s), b, 0.006)
        # thumb
        tb = W + u * 0.025 * s + t * 0.030 * s + n * 0.010 * s
        if grip:
            d1 = S.normalize(u * 0.5 + t * 0.6 + n * 0.6)
            d2 = S.normalize(u * 0.6 + n * 0.7 - t * 0.3)
        else:
            d1 = S.normalize(u * 0.6 + t * 0.7 + n * 0.25)
            d2 = S.normalize(u * 0.85 + t * 0.35 + n * 0.35)
        p1 = tb + d1 * 0.040 * s
        p2 = p1 + d2 * 0.032 * s
        p3 = p2 + d2 * 0.026 * s
        add(S.chain([tb, p1, p2, p3], [0.0125 * s, 0.0105 * s, 0.0092 * s, 0.0082 * s], 0.006 * s), b, 0.008)
        # grip axis (for weapons): through the curled fingers, along thumb-side direction
        if not hasattr(self, 'hand_frames'):
            self.hand_frames = {}
        grip_c = W + u * 0.085 * s + n * 0.030 * s
        self.hand_frames[side] = dict(W=W, u=u, t=t, n=n, grip=grip_c)

    # ------------------------------------------------------------------ helpers for outfits
    def z(self, frac):
        return frac * self.p['H']
