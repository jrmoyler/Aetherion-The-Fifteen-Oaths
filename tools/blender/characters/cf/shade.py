"""Procedural PBR shader graphs (Blender nodes) for the high-res sculpt, and Cycles baking
of base colour / roughness / metallic / emission / normal / AO onto the game mesh."""
import bpy
import numpy as np


def hex_rgb(h):
    if isinstance(h, (tuple, list)):
        return tuple(h[:3])
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def scale_rgb(c, f):
    return tuple(min(1.0, x * f) for x in c)


class NB:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def node(self, t, inputs=None, **props):
        n = self.nt.nodes.new(t)
        n.location = (self.x, 0)
        self.x += 40
        for k, v in props.items():
            setattr(n, k, v)
        for k, v in (inputs or {}).items():
            sock = n.inputs[k]
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, sock)
            else:
                try:
                    sock.default_value = v
                except (TypeError, ValueError):
                    sock.default_value = tuple(v) + ((1.0,) if len(v) == 3 and len(sock.default_value) == 4 else ())
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    # small helpers ---------------------------------------------------------
    def coord(self):
        if not hasattr(self, '_co'):
            self._co = self.node('ShaderNodeTexCoord').outputs['Object']
        return self._co

    def noise(self, scale, detail=4.0, rough=0.55, vec=None, dist=0.0):
        n = self.node('ShaderNodeTexNoise', {'Vector': vec or self.coord(), 'Scale': scale, 'Detail': detail,
                                             'Roughness': rough, 'Distortion': dist})
        return n.outputs['Fac']

    def voronoi(self, scale, feature='F1', out='Distance', vec=None, rand=1.0):
        n = self.node('ShaderNodeTexVoronoi', {'Vector': vec or self.coord(), 'Scale': scale, 'Randomness': rand}, feature=feature)
        return n.outputs[out]

    def wave(self, scale, axis='X', dist=2.0, detail=2.0, vec=None, profile='SIN', wtype='BANDS'):
        n = self.node('ShaderNodeTexWave', {'Vector': vec or self.coord(), 'Scale': scale, 'Distortion': dist,
                                            'Detail': detail}, wave_type=wtype, bands_direction=axis if wtype == 'BANDS' else 'X',
                      wave_profile=profile)
        if wtype == 'RINGS':
            n.rings_direction = axis
        return n.outputs['Fac']

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node('ShaderNodeMath', {0: a, 1: b}, operation=op, use_clamp=clamp)
        return n.outputs[0]

    def ramp(self, fac, stops):
        n = self.node('ShaderNodeValToRGB', {'Fac': fac})
        cr = n.color_ramp
        while len(cr.elements) > len(stops):
            cr.elements.remove(cr.elements[-1])
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for e, (pos, col) in zip(cr.elements, stops):
            e.position = pos
            e.color = tuple(col) + (1.0,) if len(col) == 3 else col
        return n.outputs['Color']

    def mix(self, fac, a, b, blend='MIX'):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.link(v, sock)
            else:
                sock.default_value = v if not isinstance(v, tuple) else (tuple(v) + (1.0,) if len(v) == 3 else v)
        return n.outputs[2]

    def mixf(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='FLOAT')
        for sock, v in ((n.inputs[0], fac), (n.inputs[2], a), (n.inputs[3], b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.link(v, sock)
            else:
                sock.default_value = v
        return n.outputs[0]

    def bump(self, height, strength=0.3, distance=0.002, normal=None):
        inp = {'Height': height, 'Strength': strength, 'Distance': distance}
        if normal is not None:
            inp['Normal'] = normal
        return self.node('ShaderNodeBump', inp).outputs['Normal']

    def attr(self, name):
        return self.node('ShaderNodeAttribute', attribute_name=name)


def _value(nb, v):
    if isinstance(v, bpy.types.NodeSocket):
        return v
    n = nb.node('ShaderNodeValue')
    n.outputs[0].default_value = v
    return n.outputs[0]


def _rgb(nb, c):
    if isinstance(c, bpy.types.NodeSocket):
        return c
    n = nb.node('ShaderNodeRGB')
    n.outputs[0].default_value = tuple(c) + (1.0,)
    return n.outputs[0]


# ----------------------------------------------------------------------------- material kinds
def build_material(key, kind, color, opts=None):
    """Returns (material, sources) where sources maps channel -> socket for baking."""
    opts = opts or {}
    m = bpy.data.materials.new(key)
    nb = NB(m)
    c = hex_rgb(color)
    c2 = hex_rgb(opts['c2']) if 'c2' in opts else None
    seed = (hash(key) % 997) * 0.37
    co = nb.coord()
    vec = nb.node('ShaderNodeVectorMath', {0: co, 1: (seed, seed * 0.7, seed * 1.3)}, operation='ADD').outputs[0]
    nb._co = vec
    rough = opts.get('rough')
    metal = 0.0
    emis = None
    normal = None
    k = kind
    dirt = nb.noise(3.0, 6, 0.6)
    if k == 'skin':
        mott = nb.noise(18, 4, 0.5)
        base = nb.mix(nb.math('MULTIPLY', mott, 0.35), _rgb(nb, c), scale_rgb((c[0] * 1.08, c[1] * 0.86, c[2] * 0.82), 1.0))
        freck = nb.ramp(nb.noise(160, 2, 0.5), [(0.0, (1, 1, 1)), (0.62, (1, 1, 1)), (0.70, (0.86, 0.80, 0.76))])
        base = nb.mix(1.0, base, freck, 'MULTIPLY')
        det = nb.attr('detail')
        base = nb.mix(det.outputs['Alpha'], base, det.outputs['Color'])
        rough = nb.mixf(det.outputs['Alpha'], nb.math('ADD', 0.42, nb.math('MULTIPLY', nb.noise(60, 3), 0.15)), 0.35)
        normal = nb.bump(nb.noise(700, 2, 0.5), 0.06, 0.001)
    elif k == 'eye':
        det = nb.attr('detail')
        base = nb.mix(det.outputs['Alpha'], (0.80, 0.76, 0.72), det.outputs['Color'])
        rough = 0.08
    elif k in ('cloth', 'linen', 'felt', 'wool', 'velvet', 'oilskin', 'silk'):
        sc = {'cloth': 150, 'linen': 120, 'felt': 60, 'wool': 90, 'velvet': 260, 'oilskin': 200, 'silk': 300}[k]
        w1 = nb.wave(sc, 'X', 3.0, 1.0)
        w2 = nb.wave(sc, 'Z', 3.0, 1.0)
        w3 = nb.wave(sc, 'Y', 3.0, 1.0)
        weave = nb.math('MAXIMUM', nb.math('MAXIMUM', w1, w2), w3)
        mott = nb.noise(7, 5, 0.6)
        lo = scale_rgb(c, 0.72)
        hi = scale_rgb(c, 1.30) if c2 is None else c2
        base = nb.mix(mott, lo, hi)
        base = nb.mix(nb.math('MULTIPLY', weave, 0.25), base, scale_rgb(c, 0.6))
        base = nb.mix(nb.math('MULTIPLY', nb.ramp(dirt, [(0.0, (0, 0, 0)), (0.55, (0, 0, 0)), (0.8, (1, 1, 1))]), 0.35), base, (0.09, 0.08, 0.07))
        rbase = {'cloth': 0.88, 'linen': 0.85, 'felt': 0.95, 'wool': 0.93, 'velvet': 0.75, 'oilskin': 0.42, 'silk': 0.38}[k]
        rough = nb.math('ADD', rbase - 0.05, nb.math('MULTIPLY', mott, 0.1)) if rough is None else rough
        if k == 'felt':
            h = nb.noise(90, 6, 0.7)
        else:
            h = nb.math('ADD', nb.math('MULTIPLY', weave, 0.7), nb.math('MULTIPLY', nb.noise(60, 3), 0.3))
        normal = nb.bump(h, 0.25 if k != 'oilskin' else 0.12, 0.0015)
    elif k in ('leather', 'rubber'):
        grain = nb.voronoi(420 if k == 'leather' else 900)
        mott = nb.noise(9, 5, 0.6)
        base = nb.mix(mott, scale_rgb(c, 0.70), scale_rgb(c, 1.25) if c2 is None else c2)
        wear = nb.ramp(nb.noise(22, 4, 0.6), [(0.0, (0, 0, 0)), (0.62, (0, 0, 0)), (0.72, (1, 1, 1))])
        base = nb.mix(nb.math('MULTIPLY', wear, 0.4), base, scale_rgb(c, 1.6))
        rough = nb.math('ADD', 0.52 if k == 'leather' else 0.78, nb.math('MULTIPLY', mott, 0.18)) if rough is None else rough
        normal = nb.bump(nb.math('ADD', grain, nb.math('MULTIPLY', nb.noise(40, 3), 0.5)), 0.22, 0.0015)
    elif k in ('ceramic', 'terracotta', 'stone', 'shale', 'sandstone', 'bone'):
        patch = nb.noise(10, 5, 0.65)
        base = nb.mix(patch, scale_rgb(c, 0.72), scale_rgb(c, 1.22) if c2 is None else c2)
        pores = nb.ramp(nb.voronoi(140), [(0.0, (0.25, 0.22, 0.2)), (0.08, (1, 1, 1)), (1.0, (1, 1, 1))])
        base = nb.mix(1.0, base, pores, 'MULTIPLY')
        chips = nb.ramp(nb.noise(16, 6, 0.7), [(0.0, (0, 0, 0)), (0.68, (0, 0, 0)), (0.74, (1, 1, 1))])
        base = nb.mix(nb.math('MULTIPLY', chips, 0.6), base, scale_rgb(c, 0.45))
        if k == 'shale':
            bands = nb.wave(40, 'Z', 6.0, 3.0)
            base = nb.mix(nb.math('MULTIPLY', bands, 0.4), base, scale_rgb(c, 0.6))
        rough = nb.math('ADD', 0.72, nb.math('MULTIPLY', patch, 0.2)) if rough is None else rough
        normal = nb.bump(nb.math('SUBTRACT', nb.math('MULTIPLY', nb.noise(60, 5, 0.7), 0.6), nb.math('MULTIPLY', chips, 0.5)), 0.35, 0.002)
    elif k in ('iron', 'steel', 'brass', 'copper', 'silver', 'gold', 'bronze', 'gunmetal'):
        metal = 1.0
        scratch = nb.noise(80, 8, 0.75, dist=2.0)
        mott = nb.noise(12, 5, 0.6)
        base = nb.mix(mott, scale_rgb(c, 0.75), scale_rgb(c, 1.15))
        rb = {'iron': 0.62, 'steel': 0.38, 'brass': 0.36, 'copper': 0.34, 'silver': 0.28, 'gold': 0.26, 'bronze': 0.4, 'gunmetal': 0.45}[k]
        rough = nb.math('ADD', rb - 0.08, nb.math('MULTIPLY', scratch, 0.22)) if rough is None else rough
        rustc = {'iron': (0.16, 0.07, 0.035), 'copper': (0.10, 0.28, 0.22), 'bronze': (0.12, 0.26, 0.2), 'brass': (0.18, 0.13, 0.05)}.get(k)
        if rustc is not None:
            rmask = nb.ramp(nb.noise(6, 6, 0.65), [(0.0, (0, 0, 0)), (0.58, (0, 0, 0)), (0.70, (1, 1, 1))])
            amt = nb.math('MULTIPLY', rmask, opts.get('rust', 0.7))
            base = nb.mix(amt, base, rustc)
            metal = nb.math('SUBTRACT', 1.0, amt)
            rough = nb.mixf(amt, rough, 0.88)
        normal = nb.bump(nb.math('ADD', nb.math('MULTIPLY', scratch, 0.4), nb.math('MULTIPLY', nb.noise(30, 4), 0.6)), 0.12, 0.0015)
    elif k in ('enamel', 'lacquer', 'pearl', 'ivory'):
        mott = nb.noise(8, 4, 0.5)
        base = nb.mix(mott, scale_rgb(c, 0.9), scale_rgb(c, 1.08) if c2 is None else c2)
        if k == 'pearl':
            irid = nb.ramp(nb.noise(25, 3, 0.5), [(0.2, (1.0, 0.9, 0.95)), (0.5, (0.9, 1.0, 0.95)), (0.8, (0.9, 0.95, 1.0))])
            base = nb.mix(1.0, base, irid, 'MULTIPLY')
        chips = nb.ramp(nb.noise(20, 6, 0.7), [(0.0, (0, 0, 0)), (0.72, (0, 0, 0)), (0.76, (1, 1, 1))])
        base = nb.mix(nb.math('MULTIPLY', chips, 0.5), base, scale_rgb(c, 0.55))
        rough = nb.math('ADD', 0.2, nb.math('MULTIPLY', mott, 0.12)) if rough is None else rough
        normal = nb.bump(nb.noise(50, 3), 0.05, 0.001)
    elif k in ('glass', 'crystal', 'water'):
        mott = nb.noise(6, 3, 0.5)
        base = nb.mix(mott, scale_rgb(c, 0.7), scale_rgb(c, 1.2))
        rough = 0.07 if k != 'crystal' else 0.14
        if opts.get('glow'):
            emis = nb.mix(mott, scale_rgb(hex_rgb(opts['glow']), 0.5), hex_rgb(opts['glow']))
    elif k == 'glow':
        base = _rgb(nb, c)
        rough = 0.3
        g = hex_rgb(opts.get('glow', color))
        emis = nb.mix(nb.noise(20, 3), scale_rgb(g, 0.6), g)
    elif k == 'hair':
        strands = nb.wave(500, 'X', 12.0, 3.0, wtype='BANDS')
        strands2 = nb.wave(500, 'Y', 12.0, 3.0, wtype='BANDS')
        st = nb.math('MAXIMUM', strands, strands2)
        mott = nb.noise(14, 4, 0.6)
        hi = scale_rgb(c, 1.6) if c2 is None else c2
        base = nb.mix(nb.math('MULTIPLY', st, mott), scale_rgb(c, 0.6), hi)
        rough = 0.42
        normal = nb.bump(st, 0.35, 0.0015)
    elif k == 'fur':
        st = nb.noise(240, 8, 0.8, dist=4.0)
        base = nb.mix(st, scale_rgb(c, 0.55), scale_rgb(c, 1.35) if c2 is None else c2)
        rough = 0.9
        normal = nb.bump(st, 0.6, 0.002)
    elif k in ('wood', 'bark', 'straw', 'bamboo', 'moss'):
        if k == 'bark':
            cr = nb.voronoi(30, 'DISTANCE_TO_EDGE')
            h = nb.math('ADD', nb.math('MINIMUM', nb.math('MULTIPLY', cr, 14.0), 1.0), nb.math('MULTIPLY', nb.noise(25, 5), 0.3))
            base = nb.mix(h, scale_rgb(c, 0.4), scale_rgb(c, 1.15) if c2 is None else c2)
            normal = nb.bump(h, 0.6, 0.004)
            rough = 0.88
        elif k == 'moss':
            h = nb.noise(120, 8, 0.75)
            base = nb.mix(h, scale_rgb(c, 0.6), scale_rgb(c, 1.4) if c2 is None else c2)
            normal = nb.bump(h, 0.5, 0.003)
            rough = 0.95
        else:
            sc = {'wood': 60, 'straw': 260, 'bamboo': 30}[k]
            g = nb.wave(sc, 'Z' if k != 'wood' else 'Z', 8.0, 3.0)
            mott = nb.noise(10, 4)
            base = nb.mix(nb.math('MULTIPLY', g, 0.7), scale_rgb(c, 1.15) if c2 is None else c2, scale_rgb(c, 0.65))
            base = nb.mix(nb.math('MULTIPLY', mott, 0.3), base, scale_rgb(c, 0.8))
            normal = nb.bump(g, 0.3, 0.002)
            rough = 0.7 if k != 'bamboo' else 0.45
    else:
        base = _rgb(nb, c)
        rough = 0.6
    if opts.get('glow') and emis is None and k not in ('glass', 'crystal', 'water'):
        emis = _rgb(nb, hex_rgb(opts['glow']))
    rough = _value(nb, rough if rough is not None else 0.6)
    metal = _value(nb, metal)
    base = _rgb(nb, base) if not isinstance(base, bpy.types.NodeSocket) else base
    bsdf = nb.node('ShaderNodeBsdfPrincipled', {'Base Color': base, 'Roughness': rough, 'Metallic': metal})
    if normal is not None:
        nb.link(normal, bsdf.inputs['Normal'])
    if emis is not None:
        nb.link(emis, bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    out = nb.node('ShaderNodeOutputMaterial')
    nb.link(bsdf.outputs[0], out.inputs['Surface'])
    em = nb.node('ShaderNodeEmission')
    src = {'base': base, 'rough': rough, 'metal': metal, 'emis': emis, 'bsdf': bsdf.outputs[0], 'emit': em, 'out': out}
    return m, src


def set_bake_channel(sources, channel):
    """Route each material's output to emit the given channel (or restore the BSDF)."""
    for m, src in sources.items():
        nt = m.node_tree
        out = src['out']
        if channel == 'bsdf':
            nt.links.new(src['bsdf'], out.inputs['Surface'])
            continue
        em = src['emit']
        s = src[channel]
        for l in list(em.inputs['Color'].links):
            nt.links.remove(l)
        if s is None:
            em.inputs['Color'].default_value = (0, 0, 0, 1)
        elif s.type in ('VALUE',):
            # value -> grey colour
            cv = nt.nodes.new('ShaderNodeCombineColor')
            for i in range(3):
                nt.links.new(s, cv.inputs[i])
            nt.links.new(cv.outputs[0], em.inputs['Color'])
        else:
            nt.links.new(s, em.inputs['Color'])
        em.inputs['Strength'].default_value = 1.0
        nt.links.new(em.outputs[0], out.inputs['Surface'])


def bake(hi, lo, sources, size, outdir, name, log=print, ao_samples=16, has_emis=False):
    import time
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = 0.012
    bk.max_ray_distance = 0.035
    bk.margin = 6
    bk.margin_type = 'EXTEND'
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    mat = lo.data.materials[0]
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    nt.nodes.active = tex
    imgs = {}

    def run(pass_name, channel, colorspace, samples, btype='EMIT'):
        t0 = time.time()
        img = bpy.data.images.new(f'{name}_{pass_name}', size, size, alpha=False, float_buffer=False)
        img.colorspace_settings.name = colorspace
        tex.image = img
        sc.cycles.samples = samples
        if channel:
            set_bake_channel(sources, channel)
        else:
            set_bake_channel(sources, 'bsdf')
        if btype == 'NORMAL':
            bk.normal_space = 'TANGENT'
        bpy.ops.object.bake(type=btype)
        imgs[pass_name] = img
        log(f'  bake {pass_name}: {time.time()-t0:.1f}s')
        return img
    run('base', 'base', 'sRGB', 1)
    run('rough', 'rough', 'Non-Color', 1)
    run('metal', 'metal', 'Non-Color', 1)
    if has_emis:
        run('emis', 'emis', 'sRGB', 1)
    run('normal', None, 'Non-Color', 4, 'NORMAL')
    run('ao', None, 'Non-Color', ao_samples, 'AO')
    set_bake_channel(sources, 'bsdf')
    # pack ORM
    def px(img):
        a = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        return a.reshape(size, size, 4)
    ao = px(imgs['ao'])[..., 0]
    ao = 0.35 + 0.65 * ao  # keep AO gentle
    orm = np.ones((size, size, 4), dtype=np.float32)
    orm[..., 0] = ao
    orm[..., 1] = np.clip(px(imgs['rough'])[..., 0], 0.04, 1)
    orm[..., 2] = px(imgs['metal'])[..., 0]
    oimg = bpy.data.images.new(f'{name}_orm', size, size, alpha=False)
    oimg.colorspace_settings.name = 'Non-Color'
    oimg.pixels.foreach_set(orm.ravel())
    # darken base colour slightly in cavities (AO multiply, mild) for game readability
    base = px(imgs['base'])
    base[..., :3] *= (0.78 + 0.22 * ao[..., None])
    imgs['base'].pixels.foreach_set(base.ravel())
    out = {}
    for key, img in (('base', imgs['base']), ('normal', imgs['normal']), ('orm', oimg)) + ((('emis', imgs['emis']),) if has_emis else ()):
        path = f'{outdir}/{name}_{key}.png'
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        out[key] = img
    nt.nodes.remove(tex)
    return out


def export_material(name, imgs):
    m = bpy.data.materials.new(name)
    nb = NB(m)
    uv = nb.node('ShaderNodeUVMap')
    tb = nb.node('ShaderNodeTexImage', {'Vector': uv.outputs[0]})
    tb.image = imgs['base']
    tn = nb.node('ShaderNodeTexImage', {'Vector': uv.outputs[0]})
    tn.image = imgs['normal']
    to = nb.node('ShaderNodeTexImage', {'Vector': uv.outputs[0]})
    to.image = imgs['orm']
    sep = nb.node('ShaderNodeSeparateColor', {'Color': to.outputs['Color']})
    nm = nb.node('ShaderNodeNormalMap', {'Color': tn.outputs['Color'], 'Strength': 1.0})
    bsdf = nb.node('ShaderNodeBsdfPrincipled', {'Base Color': tb.outputs['Color'], 'Roughness': sep.outputs[1],
                                                'Metallic': sep.outputs[2], 'Normal': nm.outputs[0]})
    if 'emis' in imgs:
        te = nb.node('ShaderNodeTexImage', {'Vector': uv.outputs[0]})
        te.image = imgs['emis']
        nb.link(te.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    out = nb.node('ShaderNodeOutputMaterial')
    nb.link(bsdf.outputs[0], out.inputs['Surface'])
    # glTF occlusion via the exporter's custom node group
    grp = bpy.data.node_groups.get('glTF Material Output')
    if grp is None:
        grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    g = nb.nt.nodes.new('ShaderNodeGroup')
    g.node_tree = grp
    nb.link(sep.outputs[0], g.inputs['Occlusion'])
    return m
