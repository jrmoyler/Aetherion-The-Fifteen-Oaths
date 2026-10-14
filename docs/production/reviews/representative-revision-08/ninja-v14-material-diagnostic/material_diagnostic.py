"""Material-only V14, using frozen V13 baseline geometry and existing root-to-tip UVs.
Run: AETHERION_REVIEW_OUT=/tmp/ninja-v14 blender -b -t 6 --python material_diagnostic.py
Baseline is portable ./baseline; override with AETHERION_BASELINE_DIR.
"""
import bpy,bmesh,numpy as np,math,json,hashlib,struct,os
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;OUT=Path(os.environ.get('AETHERION_REVIEW_OUT',str(HERE)));BASE=Path(os.environ.get('AETHERION_BASELINE_DIR',str(HERE/'baseline')));ID='kiln-ninja-ensemble-candidate';D=OUT/ID;D.mkdir(parents=True,exist_ok=True)
def sha(data):return hashlib.sha256(data).hexdigest()
def geometry_receipt():
 out={}
 for o in bpy.data.objects:
  if o.type=='MESH':
   m=o.data;data={'vertices':[tuple(v.co) for v in m.vertices],'polygons':[list(p.vertices) for p in m.polygons],'loops':[v.vertex_index for v in m.loops],'uv':[[tuple(x.uv) for x in u.data] for u in m.uv_layers],'weights':[[(g.group,g.weight) for g in v.groups] for v in m.vertices],'materials':[p.material_index for p in m.polygons]};out[o.name]=sha(json.dumps(data,separators=(',',':')).encode())
 return out
bpy.ops.wm.open_mainfile(filepath=str(BASE/(ID+'.blend')));before=geometry_receipt();body=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');hair=bpy.data.materials['V13 mapped soot hair volume material'];hair.name='V14 baked directional soot hair material'
# Preserve original maps exactly by copying original image bytes from frozen GLB-independent packed source.
for im in list(bpy.data.images):
 if im.packed_file and im.source=='FILE':
  name=Path(im.filepath).name
  if name.endswith('.png'):(D/name).write_bytes(bytes(im.packed_file.data));im.filepath=str(D/name)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.render.bake.use_clear=True;scene.render.bake.margin=4
bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_plane_add(size=1);plane=bpy.context.object;plane.name='TEMP_directional_material_bake_surface'
mat=bpy.data.materials.new('EDITABLE V14 directional procedural bake recipe');mat.use_nodes=True;plane.data.materials.append(mat);n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
def node(kind,name):x=n.new(kind);x.name=name;return x
def mathnode(op,a,b):
 q=node('ShaderNodeMath',op);q.operation=op
 for i,v in enumerate([a,b]):
  if isinstance(v,(int,float)):q.inputs[i].default_value=v
  else:l.new(v,q.inputs[i])
 return q.outputs[0]
uv=node('ShaderNodeTexCoord','Existing root-to-tip UV domain');scale=node('ShaderNodeVectorMath','Atlas hair tile normalization');scale.operation='MULTIPLY';scale.inputs[1].default_value=(4,2,1);l.new(uv.outputs['UV'],scale.inputs[0]);sep=node('ShaderNodeSeparateXYZ','UV directions');l.new(scale.outputs['Vector'],sep.inputs[0])
# Unequal fine strands: stretched noise, not a regular sine stripe train.
stretch=node('ShaderNodeVectorMath','Fine strand anisotropic coordinates');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(92,1.45,1);l.new(scale.outputs['Vector'],stretch.inputs[0]);fine=node('ShaderNodeTexNoise','Unequal continuous fine strands');fine.inputs['Scale'].default_value=1;fine.inputs['Detail'].default_value=2;fine.inputs['Roughness'].default_value=.63;l.new(stretch.outputs['Vector'],fine.inputs['Vector'])
coarsevec=node('ShaderNodeVectorMath','Subordinate bundle coordinates');coarsevec.operation='MULTIPLY';coarsevec.inputs[1].default_value=(13,.7,1);l.new(scale.outputs['Vector'],coarsevec.inputs[0]);coarse=node('ShaderNodeTexNoise','Subtle unequal bundle modulation');coarse.inputs['Scale'].default_value=1;coarse.inputs['Detail'].default_value=1;l.new(coarsevec.outputs['Vector'],coarse.inputs['Vector'])
height=mathnode('ADD',mathnode('MULTIPLY',fine.outputs['Fac'],.82),mathnode('MULTIPLY',coarse.outputs['Fac'],.18));ramp=node('ShaderNodeValToRGB','Dark warm hair strand color');ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=(.0018,.00165,.0015,1);ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=(.0038,.00345,.0030,1);l.new(height,ramp.inputs[0]);rough=mathnode('ADD',.64,mathnode('MULTIPLY',height,.18))
bs=node('ShaderNodeBsdfPrincipled','Procedural bake shader');l.new(ramp.outputs['Color'],bs.inputs['Base Color']);l.new(rough,bs.inputs['Roughness']);bump=node('ShaderNodeBump','Fine directional strand relief');bump.inputs['Strength'].default_value=.40;bump.inputs['Distance'].default_value=.00055;l.new(height,bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal']);out=node('ShaderNodeOutputMaterial','Bake output');em=node('ShaderNodeEmission','Channel bake emission');target=node('ShaderNodeTexImage','ACTIVE bake target');maps={}
for suffix,space,source,btype in [('hair-basecolor','sRGB',ramp.outputs['Color'],'EMIT'),('hair-orm','Non-Color',rough,'EMIT'),('hair-normal','Non-Color',None,'NORMAL')]:
 im=bpy.data.images.new('V14 baked '+suffix,2048,1024,alpha=False);im.colorspace_settings.name=space;target.image=im;n.active=target
 for link in list(out.inputs['Surface'].links):l.remove(link)
 if btype=='EMIT':
  for link in list(em.inputs['Color'].links):l.remove(link)
  l.new(source,em.inputs['Color']);l.new(em.outputs[0],out.inputs['Surface'])
 else:l.new(bs.outputs[0],out.inputs['Surface'])
 bpy.context.view_layer.objects.active=plane;plane.select_set(True);bpy.ops.object.bake(type=btype,normal_space='TANGENT')
 if suffix=='hair-orm':
  px=np.array(im.pixels[:],dtype=np.float32).reshape(1024,2048,4);px[:,:,0]=1;px[:,:,2]=0;im.pixels.foreach_set(px.ravel())
 im.filepath_raw=str(D/(ID+'-'+suffix+'.png'));im.file_format='PNG';im.save();im.pack();maps[suffix]=im
# Keep editable procedural graph in source, with fake user, but remove bake plane.
mat.use_fake_user=True;bpy.data.objects.remove(plane,do_unlink=True)
nodes=hair.node_tree.nodes;links=hair.node_tree.links
for node in nodes:
 if node.type=='TEX_IMAGE' and node.image:
  label=node.image.name
  if 'basecolor' in label:node.image=maps['hair-basecolor']
  elif 'normal' in label:node.image=maps['hair-normal']
  elif 'ORM' in label or 'orm' in label:node.image=maps['hair-orm']
 if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=1
# Match the existing legal specular factor; no shader-only anisotropy extension.
after=geometry_receipt();assert before==after
(OUT/'source-geometry-preservation.json').write_text(json.dumps({'exactGeometryUvWeightsMaterialIndices':before==after,'before':before,'after':after,'scope':'Blender mesh vertices, polygon indices, loop vertices, UVs, skin weights and polygon material indices before/after material bake. Rig/actions never edited.'},indent=2)+'\n')
for im in bpy.data.images:
 if im.source=='FILE':im.pack()
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(D/(ID+'.blend')),compress=True)
# Patch only material/image resources in frozen GLBs: preserve every original binary byte,
# mesh accessor, node, skin and animation. This avoids needless geometry re-export changes.
reports=[]
for path in sorted(BASE.glob('*.glb')):
 raw=path.read_bytes()
 if 'collision' in path.name:(D/path.name).write_bytes(raw);reports.append({'file':path.name,'entireFileExact':True});continue
 jlen=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+jlen]);boff=20+jlen;blen=struct.unpack_from('<I',raw,boff)[0];oldbin=raw[boff+8:boff+8+blen];binary=bytearray(oldbin);original=json.loads(json.dumps(j));textures={}
 for suffix in ['hair-basecolor','hair-orm','hair-normal']:
  while len(binary)%4:binary.append(0)
  png=(D/(ID+'-'+suffix+'.png')).read_bytes();view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(png)});binary.extend(png);img=len(j['images']);j['images'].append({'bufferView':view,'mimeType':'image/png','name':'V14 baked '+suffix});idx=len(j['textures']);j['textures'].append({'source':img,'sampler':0});textures[suffix]=idx
 for m in j['materials']:
  if m.get('name')=='V13 mapped soot hair volume material':
   m['name']=hair.name;m['pbrMetallicRoughness']['baseColorTexture']={'index':textures['hair-basecolor']};m['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':textures['hair-orm']};m['normalTexture']={'index':textures['hair-normal'],'scale':1};m['occlusionTexture']={'index':textures['hair-orm']}
 j['buffers'][0]['byteLength']=len(binary)
 while len(binary)%4:binary.append(0)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;(D/path.name).write_bytes(data)
 fields=['accessors','meshes','nodes','skins','animations'];assert all(j.get(k)==original.get(k) for k in fields);assert bytes(binary[:len(oldbin)])==oldbin
 reports.append({'file':path.name,'originalBinaryPrefixExact':True,'originalBinarySha256':sha(oldbin),'unchangedJsonSections':fields,'accessorCount':len(j['accessors']),'newMapCount':3})
(OUT/'glb-material-only-preservation.json').write_text(json.dumps(reports,indent=2)+'\n')
if '--export-only' in __import__('sys').argv:raise SystemExit
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=750;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.14,.14,.14);scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,.012));floor=bpy.context.object;floor.name='Render stage only';fm=bpy.data.materials.new('Review floor');fm.diffuse_color=(.10,.11,.12,1);floor.data.materials.append(fm)
for loc,power,size in [((2,-3,4),380,3),((-2,-1,2.5),240,2),((0,2,3),420,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
diagnostic=body.copy();diagnostic.data=body.data.copy();bpy.context.collection.objects.link(diagnostic);bm=bmesh.new();bm.from_mesh(diagnostic.data);bm.verts.ensure_lookup_table();attr=diagnostic.data.attributes.get('review_mask');bmesh.ops.delete(bm,geom=[v for v in bm.verts if attr.data[v.index].value],context='VERTS');bm.to_mesh(diagnostic.data);bm.free();body.hide_render=True
for view,loc in [('portrait',(0,-2,1.680)),('face_profile',(2,0,1.680))]:
 bpy.ops.object.camera_add(location=loc);cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.68))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.34;scene.camera=cam;scene.render.filepath=str(D/(ID+'-unmasked-'+view+'.png'));bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True)
