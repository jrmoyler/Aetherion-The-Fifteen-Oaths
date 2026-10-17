"""Per-vertex detail colours (iris, brows, lips, lash line, stubble) painted on the high-res sculpt."""
import numpy as np
from .shade import hex_rgb


def detail_colors(V, P, forge, b, spec):
    N = len(V)
    out = np.zeros((N, 4), dtype=np.float32)
    hs = b.hs
    skin = np.array(hex_rgb(spec.get('skin', '#c08a70')))
    hair = np.array(hex_rgb(spec.get('brow', spec.get('hair', '#201810'))))
    iris = np.array(hex_rgb(spec.get('eyes', '#3a2a1a')))
    fem = b.p['sex']
    age = b.p['age']
    # ---- eyes
    m = P == forge.eye
    if m.any():
        idx = np.nonzero(m)[0]
        Q = V[idx]
        sx = np.where(Q[:, 0] > 0, 1, -1)
        C = np.where(sx[:, None] > 0, b.eye_c[1], b.eye_c[-1])
        d = Q - C
        d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
        cosang = -d[:, 1]
        ang = np.arccos(np.clip(cosang, -1, 1))
        col = np.zeros((len(idx), 4), dtype=np.float32)
        a_iris = 0.50
        a_pup = 0.20
        streak = 0.75 + 0.25 * np.sin(np.arctan2(d[:, 2], d[:, 0]) * 23.0)
        ic = iris[None, :] * (0.6 + 0.6 * (ang / a_iris))[:, None] * streak[:, None]
        rim = np.clip((ang - a_iris * 0.82) / (a_iris * 0.18), 0, 1)
        ic = ic * (1 - 0.6 * rim[:, None])
        col[:, :3] = np.where((ang < a_pup)[:, None], 0.01, ic)
        col[:, 3] = np.clip((a_iris - ang) / 0.04, 0, 1)
        # sclera shading toward corners
        out[idx] = col
    # ---- face (skin only, near head)
    m = (P == forge.skin) & (np.linalg.norm(V - b.hc, axis=1) < 0.16 * hs)
    if not m.any():
        return out
    idx = np.nonzero(m)[0]
    Q = (V[idx] - b.hc) / hs
    col = np.zeros((len(idx), 3), dtype=np.float32)
    alpha = np.zeros(len(idx), dtype=np.float32)

    def put(mask_a, c):
        nonlocal col, alpha
        a = np.clip(np.asarray(mask_a, dtype=np.float32), 0, 1)
        na = a + alpha * (1 - a)
        col = (c[None, :] * a[:, None] + col * (alpha * (1 - a))[:, None]) / np.maximum(na, 1e-6)[:, None]
        alpha = na
    front = Q[:, 1] < -0.05
    # lips
    mc = (b.mouth_c - b.hc) / hs
    dl = np.sqrt(((Q[:, 0] - mc[0]) / 0.023) ** 2 + ((Q[:, 2] - mc[2]) / 0.0125) ** 2)
    lipc = skin * np.array([0.78, 0.50, 0.50]) * (0.9 if fem < 0.5 else 0.85)
    put(np.clip((1.0 - dl) / 0.25, 0, 1) * front * (0.75 if fem < 0.5 else 0.9), lipc)
    # brows
    for sx in (1, -1):
        ec = (b.eye_c[sx] - b.hc) / hs
        dx = (Q[:, 0] - ec[0]) * sx
        u = dx / 0.026
        zc = ec[2] + 0.0185 + 0.004 * (1 - u * u) - 0.002 * (u > 0.4)
        thick = (0.0045 if fem < 0.5 else 0.0028) * (1.0 - 0.45 * np.clip(u, 0, 1)) * (1.0 + 0.3 * (u < -0.6))
        band = np.clip(1 - np.abs(Q[:, 2] - zc) / thick, 0, 1) * np.clip(1 - np.abs(u + 0.05) / 1.05, 0, 1) * 6
        band = np.clip(band, 0, 1) * (Q[:, 1] < ec[1] - 0.004)
        grain = 0.75 + 0.25 * np.sin(Q[:, 0] * 900 + Q[:, 2] * 300)
        put(band * 0.92 * grain, hair * 0.9)
        # lash line / lid crease
        r = np.sqrt((Q[:, 0] - ec[0]) ** 2 + (Q[:, 2] - ec[2]) ** 2)
        lash = np.clip(1 - np.abs(r - 0.0128) / 0.0022, 0, 1) * (Q[:, 2] > ec[2] - 0.003) * (Q[:, 1] < ec[1])
        put(lash * (0.8 if fem > 0.5 else 0.55), hair * 0.4)
        # under-eye / socket shadow
        und = np.clip(1 - np.abs(r - 0.017) / 0.006, 0, 1) * (Q[:, 2] < ec[2]) * (Q[:, 1] < ec[1] + 0.01)
        put(und * (0.12 + 0.2 * age), skin * np.array([0.72, 0.62, 0.66]))
    # cheeks blush
    for sx in (1, -1):
        cc = np.array([sx * 0.045, -0.07, -0.025])
        dc = np.linalg.norm((Q - cc) / np.array([0.025, 0.03, 0.02]), axis=1)
        put(np.clip(1 - dc, 0, 1) * 0.18, skin * np.array([1.05, 0.72, 0.68]))
    # stubble for adult men
    if spec.get('stubble', fem < 0.5 and age < 0.7):
        jaw = (Q[:, 2] < -0.040) & (Q[:, 1] < 0.0)
        upper = (np.abs(Q[:, 0]) < 0.025) & (Q[:, 2] < -0.040) & (Q[:, 2] > -0.050)
        nm = np.sqrt(((Q[:, 0] - mc[0]) / 0.023) ** 2 + ((Q[:, 2] - mc[2]) / 0.0125) ** 2) > 1.05
        st = (jaw | upper) & nm
        put(st * spec.get('stubble_amt', 0.22), hair * 0.6 + skin * 0.4)
    if age > 0.4:
        # age spots / wrinkles at the forehead and nasolabial folds
        for sx in (1, -1):
            nl = np.abs(Q[:, 0] - sx * (0.020 + (-0.03 - Q[:, 2]) * 0.25)) < 0.0018
            put(nl * (Q[:, 2] < -0.03) * (Q[:, 2] > -0.065) * front * 0.35 * age, skin * 0.7)
        fh = (np.sin(Q[:, 2] * 1400) > 0.92) & (Q[:, 2] > 0.045) & (Q[:, 2] < 0.075) & front
        put(fh * 0.25 * age, skin * 0.75)
    out[idx, :3] = col
    out[idx, 3] = alpha
    return out
