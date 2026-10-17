"""Procedural surface shaders (bake sources) + Cycles bake to a shared 1024 atlas + final glTF
materials named body / secondary / accent / glow.

Baked albedo is deliberately near-neutral (greyscale with value detail) so that the client's
per-slot tint multiplies cleanly; the default tint of the archetype is stored in the
material's baseColorFactor (and emissiveFactor for glow).
"""
import os
import math
import bpy
import numpy as np
from . import core

SLOTS = ("body", "secondary", "accent", "glow")


# ------------------------------------------------------------------------- node helpers
class NB:
    def __init__(self, mat):
        self.m = mat
        self.nt = mat.node_tree
        self.N = self.nt.nodes
        self.L = self.nt.links
        self.x = 0

    def n(self, kind, **props):
        nd = self.N.new(kind)
        nd.location = (self.x, 0)
        self.x -= 180
        for k, v in props.items():
            if k.startswith("in_"):
                key = k[3:].replace("_", " ")
                nd.inputs[key].default_value = v
            else:
                setattr(nd, k, v)
        return nd

    def link(self, a, b):
        self.L.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        nd = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                nd.inputs[i].default_value = v
            else:
                self.link(v, nd.inputs[i])
        return nd.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        nd = self.n("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        for i, v in ((0, fac), (6, a), (7, b)):
            sock = nd.inputs[i]
            if isinstance(v, (int, float)):
                sock.default_value = v if i == 0 else (v, v, v, 1)
            elif isinstance(v, tuple):
                sock.default_value = v
            else:
                self.link(v, sock)
        return nd.outputs[2]

    def ramp(self, inp, stops):
        nd = self.n("ShaderNodeValToRGB")
        cr = nd.color_ramp
        while len(cr.elements) > 1:
            cr.elements.remove(cr.elements[-1])
        cr.elements[0].position = stops[0][0]
        cr.elements[0].color = _rgba(stops[0][1])
        for p, c in stops[1:]:
            e = cr.elements.new(p)
            e.color = _rgba(c)
        self.link(inp, nd.inputs[0])
        return nd.outputs[0]

    def coords(self, scale=(1, 1, 1), space="Object"):
        tc = self.n("ShaderNodeTexCoord")
        mp = self.n("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = scale
        self.link(tc.outputs[space], mp.inputs["Vector"])
        return mp.outputs[0]

    def noise(self, vec, scale=5.0, detail=6.0, rough=0.55, dist=0.0, dims="3D"):
        nd = self.n("ShaderNodeTexNoise", noise_dimensions=dims)
        nd.inputs["Scale"].default_value = scale
        nd.inputs["Detail"].default_value = detail
        nd.inputs["Roughness"].default_value = rough
        nd.inputs["Distortion"].default_value = dist
        if vec is not None:
            self.link(vec, nd.inputs["Vector"])
        return nd

    def voronoi(self, vec, scale=10.0, feature="F1", rand=1.0):
        nd = self.n("ShaderNodeTexVoronoi", feature=feature)
        nd.inputs["Scale"].default_value = scale
        nd.inputs["Randomness"].default_value = rand
        if vec is not None:
            self.link(vec, nd.inputs["Vector"])
        return nd

    def wave(self, vec, scale=10.0, kind="BANDS", direction="X", dist=0.0, detail=2.0, profile="SIN"):
        nd = self.n("ShaderNodeTexWave", wave_type=kind, bands_direction=direction, wave_profile=profile)
        nd.inputs["Scale"].default_value = scale
        nd.inputs["Distortion"].default_value = dist
        nd.inputs["Detail"].default_value = detail
        if vec is not None:
            self.link(vec, nd.inputs["Vector"])
        return nd

    def pointiness(self):
        g = self.n("ShaderNodeNewGeometry")
        return g.outputs["Pointiness"]

    def bump(self, height, strength=0.5, distance=0.02, normal=None):
        nd = self.n("ShaderNodeBump")
        nd.inputs["Strength"].default_value = strength
        nd.inputs["Distance"].default_value = distance
        self.link(height, nd.inputs["Height"])
        if normal is not None:
            self.link(normal, nd.inputs["Normal"])
        return nd.outputs[0]


def _rgba(c):
    if isinstance(c, (int, float)):
        return (c, c, c, 1.0)
    if len(c) == 3:
        return (c[0], c[1], c[2], 1.0)
    return c


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m


def _principled(nb):
    return nb.N.get("Principled BSDF")


def _aux(nb, metal, glow=0.0):
    v = nb.n("ShaderNodeValue"); v.name = "AUX_METAL"; v.outputs[0].default_value = metal
    g = nb.n("ShaderNodeValue"); g.name = "AUX_GLOW"; g.outputs[0].default_value = glow


# ------------------------------------------------------------------------ surface kinds
def surface(kind, name=None, scale=1.0, **kw):
    """Create a procedural high-poly bake material of a given kind."""
    m = new_mat(name or f"hi_{kind}")
    nb = NB(m)
    bsdf = _principled(nb)
    s = scale
    metal = 0.0
    if kind == "fur":
        # strands run along body length (Y); countershaded belly lighter; bristle clumps
        v = nb.coords((90 * s, 7 * s, 90 * s))
        strands = nb.noise(v, 1.0, 4.0, 0.6)
        clump = nb.noise(nb.coords((9 * s, 3 * s, 9 * s)), 1.0, 3.0, 0.5, dist=0.4)
        h = nb.math("MULTIPLY", strands.outputs[0], clump.outputs[0])
        z = nb.n("ShaderNodeSeparateXYZ"); nb.link(nb.coords((1, 1, 1)), z.inputs[0])
        belly = nb.math("MULTIPLY", nb.math("SUBTRACT", kw.get("belly_z", 0.6), z.outputs[2]), 4.0, clamp=True)
        base = nb.mix(belly, kw.get("dark", 0.58), kw.get("light", 0.86))
        tone = nb.ramp(strands.outputs[0], [(0.3, 0.72), (0.7, 1.0)])
        col = nb.mix(1.0, base, tone, "MULTIPLY")
        cav = nb.ramp(nb.pointiness(), [(0.42, 0.65), (0.55, 1.0)])
        col = nb.mix(1.0, col, cav, "MULTIPLY")
        nb.link(col, bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.82
        nb.link(nb.bump(h, 0.55, 0.01), bsdf.inputs["Normal"])
    elif kind == "hide":
        v = nb.coords((s, s, s))
        wr = nb.noise(v, 18.0, 8.0, 0.62, dist=0.35)
        pores = nb.voronoi(v, 140.0)
        h = nb.math("ADD", wr.outputs[0], nb.math("MULTIPLY", pores.outputs["Distance"], 0.25))
        cav = nb.ramp(nb.pointiness(), [(0.40, 0.55), (0.56, 1.0)])
        tone = nb.ramp(wr.outputs[0], [(0.25, kw.get("dark", 0.6)), (0.75, kw.get("light", 0.85))])
        col = nb.mix(1.0, tone, cav, "MULTIPLY")
        nb.link(col, bsdf.inputs["Base Color"])
        r = nb.ramp(wr.outputs[0], [(0.3, 0.55), (0.8, 0.8)])
        nb.link(r, bsdf.inputs["Roughness"])
        nb.link(nb.bump(h, 0.45, 0.01), bsdf.inputs["Normal"])
    elif kind == "scales":
        v = nb.coords((s, s * 0.8, s))
        vo = nb.voronoi(v, kw.get("cells", 55.0), "DISTANCE_TO_EDGE")
        vc = nb.voronoi(v, kw.get("cells", 55.0), "F1")
        edge = nb.ramp(vo.outputs["Distance"], [(0.0, 0.0), (0.12, 1.0)])
        dome = nb.math("SUBTRACT", 1.0, vc.outputs["Distance"])
        h = nb.math("MULTIPLY", edge, nb.math("POWER", dome, 0.6))
        cellv = nb.ramp(nb.n_sep_r(vc) if False else vc.outputs["Color"], [(0.0, 0.7), (1.0, 1.0)])
        cav = nb.ramp(nb.pointiness(), [(0.42, 0.6), (0.55, 1.0)])
        col = nb.mix(1.0, nb.mix(1.0, cellv, edge, "MULTIPLY"), cav, "MULTIPLY")
        col = nb.mix(0.35, col, kw.get("base", 0.82), "MULTIPLY")
        nb.link(col, bsdf.inputs["Base Color"])
        nb.link(nb.ramp(edge, [(0.0, 0.8), (1.0, kw.get("rough", 0.45))]), bsdf.inputs["Roughness"])
        nb.link(nb.bump(h, 0.6, 0.01), bsdf.inputs["Normal"])
    elif kind == "chitin":
        v = nb.coords((s, s, s))
        n1 = nb.noise(v, 9.0, 5.0, 0.5)
        pits = nb.voronoi(v, 90.0)
        h = nb.math("ADD", nb.math("MULTIPLY", n1.outputs[0], 0.4),
                    nb.ramp(pits.outputs["Distance"], [(0.0, 0.0), (0.08, 1.0)]))
        cav = nb.ramp(nb.pointiness(), [(0.42, 0.55), (0.56, 1.0)])
        tone = nb.ramp(n1.outputs[0], [(0.3, 0.7), (0.7, 0.95)])
        nb.link(nb.mix(1.0, tone, cav, "MULTIPLY"), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = kw.get("rough", 0.32)
        nb.link(nb.bump(h, 0.3, 0.01), bsdf.inputs["Normal"])
    elif kind == "bark":
        v = nb.coords((14 * s, 14 * s, 2.2 * s))
        grain = nb.noise(v, 1.0, 7.0, 0.62, dist=1.2)
        cracks = nb.voronoi(nb.coords((6 * s, 6 * s, 1.2 * s)), 1.0, "DISTANCE_TO_EDGE")
        cr = nb.ramp(cracks.outputs["Distance"], [(0.0, 0.0), (0.06, 1.0)])
        h = nb.math("MULTIPLY", grain.outputs[0], cr)
        tone = nb.ramp(grain.outputs[0], [(0.3, 0.5), (0.7, 0.9)])
        cav = nb.ramp(nb.pointiness(), [(0.40, 0.5), (0.56, 1.0)])
        col = nb.mix(1.0, nb.mix(1.0, tone, cr, "MULTIPLY"), cav, "MULTIPLY")
        nb.link(col, bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.88
        nb.link(nb.bump(h, 0.9, 0.02), bsdf.inputs["Normal"])
    elif kind == "moss":
        v = nb.coords((s, s, s))
        n1 = nb.noise(v, 60.0, 6.0, 0.7)
        n2 = nb.noise(v, 8.0, 4.0, 0.6)
        h = nb.math("MULTIPLY", n1.outputs[0], n2.outputs[0])
        nb.link(nb.ramp(h, [(0.1, 0.55), (0.5, 0.95)]), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.95
        nb.link(nb.bump(h, 0.8, 0.01), bsdf.inputs["Normal"])
    elif kind == "stone":
        v = nb.coords((s, s, s))
        n1 = nb.noise(v, 6.0, 8.0, 0.6, dist=0.2)
        cracks = nb.voronoi(v, kw.get("cells", 4.0), "DISTANCE_TO_EDGE")
        cr = nb.ramp(cracks.outputs["Distance"], [(0.0, 0.0), (0.035, 1.0)])
        grit = nb.noise(v, 90.0, 3.0, 0.5)
        h = nb.math("ADD", nb.math("MULTIPLY", n1.outputs[0], cr), nb.math("MULTIPLY", grit.outputs[0], 0.15))
        wear = nb.ramp(nb.pointiness(), [(0.45, 0.62), (0.52, 0.9), (0.6, 1.15)])
        tone = nb.ramp(n1.outputs[0], [(0.3, 0.55), (0.7, 0.85)])
        col = nb.mix(1.0, nb.mix(1.0, tone, cr, "MULTIPLY"), wear, "MULTIPLY")
        nb.link(col, bsdf.inputs["Base Color"])
        nb.link(nb.ramp(grit.outputs[0], [(0.3, 0.75), (0.7, 0.92)]), bsdf.inputs["Roughness"])
        nb.link(nb.bump(h, 0.8, 0.02), bsdf.inputs["Normal"])
    elif kind == "crystal":
        v = nb.coords((s, s, s))
        n1 = nb.noise(v, 14.0, 4.0, 0.5)
        nb.link(nb.ramp(n1.outputs[0], [(0.3, 0.75), (0.7, 1.0)]), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.12
        nb.link(nb.bump(n1.outputs[0], 0.15, 0.01), bsdf.inputs["Normal"])
    elif kind == "ice":
        v = nb.coords((s, s, s))
        n1 = nb.noise(v, 7.0, 6.0, 0.6, dist=0.5)
        fr = nb.voronoi(v, 12.0, "DISTANCE_TO_EDGE")
        cr = nb.ramp(fr.outputs["Distance"], [(0.0, 0.0), (0.03, 1.0)])
        nb.link(nb.mix(1.0, nb.ramp(n1.outputs[0], [(0.2, 0.8), (0.8, 1.0)]), nb.ramp(cr, [(0, 0.7), (1, 1)]), "MULTIPLY"),
                bsdf.inputs["Base Color"])
        nb.link(nb.ramp(n1.outputs[0], [(0.2, 0.08), (0.8, 0.3)]), bsdf.inputs["Roughness"])
        nb.link(nb.bump(nb.math("MULTIPLY", n1.outputs[0], cr), 0.35, 0.01), bsdf.inputs["Normal"])
    elif kind in ("metal", "brass", "iron"):
        metal = 1.0
        v = nb.coords((s, s, s))
        scr = nb.noise(nb.coords((3 * s, 3 * s, 120 * s)), 1.0, 2.0, 0.5)
        n1 = nb.noise(v, 10.0, 6.0, 0.55)
        wear = nb.ramp(nb.pointiness(), [(0.47, 0.75), (0.53, 0.92), (0.6, 1.1)])
        tone = nb.ramp(n1.outputs[0], [(0.3, kw.get("dark", 0.62)), (0.7, kw.get("light", 0.9))])
        nb.link(nb.mix(1.0, tone, wear, "MULTIPLY"), bsdf.inputs["Base Color"])
        r = nb.math("ADD", nb.math("MULTIPLY", scr.outputs[0], 0.25), kw.get("rough", 0.28))
        nb.link(r, bsdf.inputs["Roughness"])
        pit = nb.voronoi(v, 70.0)
        h = nb.math("ADD", nb.math("MULTIPLY", n1.outputs[0], 0.3), nb.ramp(pit.outputs["Distance"], [(0, 0), (0.1, 1)]))
        nb.link(nb.bump(h, 0.12, 0.005), bsdf.inputs["Normal"])
    elif kind == "lacquer":
        v = nb.coords((s, s, s))
        n1 = nb.noise(v, 30.0, 4.0, 0.5)
        cav = nb.ramp(nb.pointiness(), [(0.45, 0.7), (0.53, 1.0)])
        nb.link(nb.mix(1.0, nb.ramp(n1.outputs[0], [(0.3, 0.86), (0.7, 0.98)]), cav, "MULTIPLY"), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.22
        nb.link(nb.bump(n1.outputs[0], 0.05, 0.004), bsdf.inputs["Normal"])
    elif kind == "cloth":
        v = nb.coords((s, s, s))
        w1 = nb.wave(v, 260.0, "BANDS", "X")
        w2 = nb.wave(v, 260.0, "BANDS", "Z")
        weave = nb.math("MULTIPLY", w1.outputs[1], w2.outputs[1])
        n1 = nb.noise(v, 7.0, 6.0, 0.6, dist=0.4)
        rot = nb.ramp(n1.outputs[0], [(0.35, kw.get("dark", 0.55)), (0.7, kw.get("light", 0.85))])
        nb.link(nb.mix(0.25, rot, weave, "MULTIPLY"), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.93
        nb.link(nb.bump(nb.math("ADD", weave, n1.outputs[0]), 0.35, 0.004), bsdf.inputs["Normal"])
    elif kind == "bone":
        v = nb.coords((s * 2, s * 2, s * 2))
        rid = nb.wave(v, 14.0, "RINGS", "Z", dist=3.0, detail=4)
        n1 = nb.noise(v, 22.0, 6.0, 0.6)
        tone = nb.ramp(n1.outputs[0], [(0.3, 0.72), (0.7, 0.95)])
        cav = nb.ramp(nb.pointiness(), [(0.42, 0.55), (0.56, 1.0)])
        nb.link(nb.mix(1.0, tone, cav, "MULTIPLY"), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = kw.get("rough", 0.48)
        nb.link(nb.bump(nb.math("ADD", rid.outputs[1], n1.outputs[0]), 0.25, 0.005), bsdf.inputs["Normal"])
    elif kind == "membrane":
        v = nb.coords((s, s, s))
        veins = nb.voronoi(v, 9.0, "DISTANCE_TO_EDGE")
        vr = nb.ramp(veins.outputs["Distance"], [(0.0, 0.55), (0.04, 1.0)])
        n1 = nb.noise(v, 30.0, 5.0, 0.6)
        nb.link(nb.mix(1.0, nb.ramp(n1.outputs[0], [(0.3, 0.7), (0.7, 0.9)]), vr, "MULTIPLY"), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.6
        nb.link(nb.bump(nb.math("SUBTRACT", 1.0, vr), 0.4, 0.004), bsdf.inputs["Normal"])
    elif kind == "glow":
        v = nb.coords((s, s, s))
        n1 = nb.noise(v, 12.0, 4.0, 0.6)
        core_ = nb.ramp(nb.pointiness(), [(0.42, 1.0), (0.6, 0.75)])
        nb.link(nb.mix(1.0, nb.ramp(n1.outputs[0], [(0.25, 0.7), (0.75, 1.0)]), core_, "MULTIPLY"), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.3
    elif kind == "teeth":
        bsdf.inputs["Base Color"].default_value = (0.9, 0.9, 0.88, 1)
        bsdf.inputs["Roughness"].default_value = 0.35
    else:
        raise ValueError(kind)
    _aux(nb, metal if "metal" not in kw else kw["metal"])
    return m


NB.n_sep_r = lambda self, x: x  # placeholder (unused)


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


# ------------------------------------------------------------------------ baking
def _bake_node(mat, img):
    nt = mat.node_tree
    nd = nt.nodes.get("BAKE_TARGET")
    if nd is None:
        nd = nt.nodes.new("ShaderNodeTexImage")
        nd.name = "BAKE_TARGET"
    nd.image = img
    nt.nodes.active = nd
    nd.select = True
    return nd


def _set_metal_emit(mats, on):
    for m in mats:
        nt = m.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        aux = nt.nodes.get("AUX_METAL")
        if bsdf is None or aux is None:
            continue
        if on:
            nt.links.new(aux.outputs[0], bsdf.inputs["Emission Color"])
            m["_es"] = bsdf.inputs["Emission Strength"].default_value
            bsdf.inputs["Emission Strength"].default_value = 1.0
        else:
            for l in list(nt.links):
                if l.to_socket == bsdf.inputs["Emission Color"] and l.from_node == aux:
                    nt.links.remove(l)
            bsdf.inputs["Emission Strength"].default_value = m.get("_es", 0.0)


def bake(low, highs, out_dir, res=1024, extrusion=0.02, ray=0.05, ao_samples=16, prefix="T"):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = False
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = extrusion
    bk.max_ray_distance = ray
    bk.margin = 6
    bk.margin_type = "EXTEND"
    imgs = {}
    for key, cs in (("color", "sRGB"), ("normal", "Non-Color"), ("rough", "Non-Color"),
                    ("ao", "Non-Color"), ("metal", "Non-Color")):
        im = bpy.data.images.new(f"{prefix}_{key}", res, res, alpha=False)
        im.colorspace_settings.name = cs
        im.generated_color = (0.5, 0.5, 1.0, 1.0) if key == "normal" else (0.5, 0.5, 0.5, 1)
        imgs[key] = im
    low_mats = [m for m in low.data.materials if m]
    high_mats = list({m for h in highs for m in h.data.materials if m})
    core.activate(low)
    for h in highs:
        h.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low

    def run(key, btype, samples=1, **kw):
        for m in low_mats:
            _bake_node(m, imgs[key])
        sc.cycles.samples = samples
        bpy.ops.object.bake(type=btype, use_selected_to_active=True, cage_extrusion=extrusion,
                            max_ray_distance=ray, margin=6, **kw)

    import time
    t0 = time.time()
    run("normal", "NORMAL", 2, normal_space="TANGENT")
    run("color", "DIFFUSE", 1, pass_filter={"COLOR"})
    run("rough", "ROUGHNESS", 1)
    _set_metal_emit(high_mats, True)
    run("metal", "EMIT", 1)
    _set_metal_emit(high_mats, False)
    run("ao", "AO", ao_samples)
    print(f"  bake {time.time() - t0:.1f}s")
    # pack ORM
    n = res * res * 4
    def px(im):
        a = np.empty(n, dtype=np.float32); im.pixels.foreach_get(a); return a.reshape(-1, 4)
    ao, ro, me = px(imgs["ao"]), px(imgs["rough"]), px(imgs["metal"])
    orm = np.ones((res * res, 4), dtype=np.float32)
    orm[:, 0] = np.clip(0.35 + 0.65 * ao[:, 0], 0, 1)  # soften AO (also applied by engine SSAO)
    orm[:, 1] = ro[:, 0]
    orm[:, 2] = me[:, 0]
    oim = bpy.data.images.new(f"{prefix}_orm", res, res, alpha=False)
    oim.colorspace_settings.name = "Non-Color"
    oim.pixels.foreach_set(orm.ravel())
    out = {"color": imgs["color"], "normal": imgs["normal"], "orm": oim}
    os.makedirs(out_dir, exist_ok=True)
    for k, im in out.items():
        im.filepath_raw = os.path.join(out_dir, f"{prefix}_{k}.png")
        im.file_format = "PNG"
        im.save()
    for k in ("rough", "ao", "metal"):
        bpy.data.images.remove(imgs[k])
    for m in low_mats:
        nd = m.node_tree.nodes.get("BAKE_TARGET")
        if nd:
            m.node_tree.nodes.remove(nd)
    return out


# ------------------------------------------------------------------------ final materials
def _gltf_output_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.interface.new_socket("Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def final_material(slot, texs, base=(1, 1, 1), emissive=None, strength=3.0, alpha=None):
    m = bpy.data.materials.get(slot) or new_mat(slot)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    if texs is None:
        bsdf.inputs["Base Color"].default_value = (*base, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.6
        if emissive is not None:
            bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
        return m
    ic = nt.nodes.new("ShaderNodeTexImage"); ic.image = texs["color"]
    mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    nt.links.new(ic.outputs["Color"], mul.inputs[6])
    mul.inputs[7].default_value = (*base, 1.0)
    nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    io = nt.nodes.new("ShaderNodeTexImage"); io.image = texs["orm"]
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(io.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs[1], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs[2], bsdf.inputs["Metallic"])
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = _gltf_output_group()
    nt.links.new(sep.outputs[0], grp.inputs["Occlusion"])
    inn = nt.nodes.new("ShaderNodeTexImage"); inn.image = texs["normal"]
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(inn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    if emissive is not None:
        em = nt.nodes.new("ShaderNodeMix"); em.data_type = "RGBA"; em.blend_type = "MULTIPLY"
        em.inputs[0].default_value = 1.0
        nt.links.new(ic.outputs["Color"], em.inputs[6])
        em.inputs[7].default_value = (*emissive, 1.0)
        nt.links.new(em.outputs[2], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


def hex2rgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)
