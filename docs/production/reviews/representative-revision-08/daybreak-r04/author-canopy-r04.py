import bpy,json,pathlib,math
from mathutils import Vector
O=pathlib.Path(__file__).resolve().parent
s=(O/'author.py').read_text();exec(s[:s.index('\nreports=[]')]);bpy.context.preferences.filepaths.save_version=0
LEVEL=0
# Corner-supported tension textile: scalloped boundaries, raised diagonal ridges, shallow hanging centre.
def surface(u,v):
 x=.3+3.4*u+.22*math.sin(math.pi*v)*(1-2*u);y=.3+3.4*v+.22*math.sin(math.pi*u)*(1-2*v)
 edge=min(u,1-u,v,1-v);base=.3-.25*max(math.sin(math.pi*u),math.sin(math.pi*v));ridge=.11*math.sin(math.pi*u)*math.sin(math.pi*v)*(1-min(1,abs(u-v)*5))
 return Vector((x,y,base+ridge))
def curved(n,points,width,mat='bronze',detail=0):
 for i in range(len(points)-1):beam(n,points[i],points[i+1],width,mat,detail)
def newcanopy():
 n=[12,8,4][LEVEL];verts=[surface(i/n,j/n) for j in range(n+1) for i in range(n+1)];faces=[]
 for j in range(n):
  for i in range(n):a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
 ob=mesh('Shallow scalloped four-point tension textile',verts,faces,'weave');m=ob.modifiers.new('Four millimetre woven shell','SOLIDIFY');m.thickness=.004;bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=m.name)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
 for edge in range(4):
  uv=lambda t:[(t,0),(1,t),(1-t,1),(0,1-t)][edge]
  curved('Scalloped bronze-bound fabric hem',[surface(*uv(i/n))+Vector((0,0,.004)) for i in range(n+1)],.018)
 for a,b in [((0,0),(1,1)),((0,1),(1,0))]:
  curved('Diagonal raised sewn rib',[surface(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n)+Vector((0,0,.006)) for i in range(n+1)],.024)
 for x in [.3,3.7]:
  for y in [.3,3.7]:
   cyl('Guarded quick release pivot',(x,y,.273),.064,.054,'bronze',0,[12,8,4][LEVEL]);box('Socket keeper',(x,y,.302),(.13,.13,.014),'bronze',0)
   if True:
    for dx in [-1,1]:box('Corner latch cheek',(x+dx*.067,y,.267),(.017,.09,.054),'bronze',1)
   socket(f'canopy-seat-{x}-{y}','attachment_static',(x,y,.3),(0,0,-1))
 center=surface(.5,.5);cyl('Small central rib rosette',(2,2,center.z+.008),.072,.014,'bronze',0,[12,8,4][LEVEL])
 # Small pendant ends above lowest edge, preserving overall 0.3m design envelope.
 mesh('Faceted underside pendant',[(2-.035,2,center.z-.012),(2,2-.035,center.z-.012),(2+.035,2,center.z-.012),(2,2+.035,center.z-.012),(2,2,center.z-.095)],[(0,1,2,3),(0,4,1),(1,4,2),(2,4,3),(3,4,0)],'bronze',0)

def profile_pier(x,y):
 # Keep familiar stepped base/shaft. Replace pointed generic head with interlocking architectural tiers.
 h=4;levels=[(0,.29),(.1,.29),(.12,.25),(.38,.20),(.43,.20),(.47,.15),(3.08,.15),(3.18,.20),(3.26,.25),(3.34,.25)]
 verts=[(x+r*math.cos(math.pi/8+i*math.pi/4),y+r*math.sin(math.pi/8+i*math.pi/4),z) for z,r in levels for i in range(8)];faces=[tuple(reversed(range(8))),tuple(range((len(levels)-1)*8,len(levels)*8))]
 for j in range(len(levels)-1):
  for i in range(8):faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
 mesh('Layered octagonal pier shaft and spreading neck',verts,faces)
 box('Load-bearing shaft core',(x,y,1.67),(.18,.18,3.34),'masonry')
 box('Lower capital abacus',(x,y,3.36),(.56,.56,.08),bevel=.018 if LEVEL==0 else 0)
 box('Recessed bronze capital course',(x,y,3.413),(.49,.49,.026),'bronze')
 box('Broad upper capital bearing',(x,y,3.48),(.60,.60,.108),bevel=.026 if LEVEL<2 else 0)
 box('Socket marble pedestal',(x,y,3.602),(.38,.38,.136),bevel=.024 if LEVEL<2 else 0)
 cyl('Bronze receiver lower flange',(x,y,3.69),.14,.04,'bronze',0,[12,8,4][LEVEL]);cyl('Load-bearing socket neck',(x,y,3.735),.092,.05,'bronze',0,[12,8,4][LEVEL]);cyl('Mating socket top',(x,y,3.765),.073,.03,'bronze',0,[12,8,4][LEVEL])
 for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
  # Long gold fingers visibly lock the layers together rather than floating ornament.
  if LEVEL<2:beam('Capital retaining finger',(x+dx*.27,y+dy*.27,3.23),(x+dx*.27,y+dy*.27,3.53),.035,'bronze',1)
  if LEVEL==0:
   beam('Capital diagonal shoulder',(x+dx*.153,y+dy*.153,3.02),(x+dx*.275,y+dy*.275,3.30),.023,'bronze',2)
   beam('Vertical shaft facing rail',(x+dx*.151,y+dy*.151,.47),(x+dx*.151,y+dy*.151,3.06),.018,'bronze',2)
 box('COL_pier',(x,y,1.835),(.34,.34,2.73),'masonry',col=True);box('COL_pier_base',(x,y,.235),(.58,.58,.47),'masonry',col=True);box('COL_capital_overhead',(x,y,3.43),(.60,.60,.70),'masonry',col=True)

def newcolonnade():
 for x in [.3,3.7]:
  for y in [.3,3.7]:profile_pier(x,y);socket(f'pier-seat-{x}-{y}','attachment_static',(x,y,3.78))
 n=[12,8,4][LEVEL]
 for orient in [0,1]:
  for c in [.3,3.7]:
   pts=[]
   for i in range(n+1):
    t=i/n;xy=.3+3.4*t;z=3.20+.45*abs(2*t-1)**.55;pts.append((c,xy,z) if orient==0 else (xy,c,z))
   curved('Bronze curved colonnade arch',pts,.042)
 socket('base','floor_datum',(0,0,0));socket('clear-route','door_clear',(2,2,0),clearance={'width_m':2.76,'headroom_m':3.15})

reports=[]
for slug,build in [('shade-canopy',newcanopy),('public-colonnade',newcolonnade)]:
 for o in list(bpy.context.scene.objects):bpy.data.objects.remove(o,do_unlink=True)
 for c in list(bpy.data.collections):
  if c.name.startswith(('LOD1_EDITABLE','LOD2_EDITABLE')) and not c.objects:bpy.data.collections.remove(c)
 groups={};roots={};primarycol=[];primarysockets=[];counts={};sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1;sc.frame_set(1)
 D=O/'modules'/slug
 for LEVEL in [0,1,2]:
  visual=[];colliders=[];sockets=[];before=set(bpy.context.scene.objects);build();bpy.context.view_layer.update();new=list(set(bpy.context.scene.objects)-before);root=[o for o in new if o.type=='EMPTY'];groups[LEVEL]=list(visual);roots[LEVEL]=root
  if LEVEL==0:primarycol=list(colliders);primarysockets=list(sockets)
  else:
   for o in colliders:bpy.data.objects.remove(o,do_unlink=True)
   for o in visual:o['representation']='lod_variant';o['lod_level']=LEVEL
  for o in visual:o['baseline_asset_id']=KIT['baseline_asset_id'];o['original_module_name']=slug.replace('-',' ') if slug in ['shade-canopy','public-colonnade'] else slug;o['status']='PROPOSED_CANDIDATE_NOT_VISUALLY_APPROVED';o.data.calc_loop_triangles()
  export(D/f'lod{LEVEL}.glb',visual+root);counts[f'lod{LEVEL}']=sum(len(o.data.loop_triangles) for o in visual)
  for o in visual:o.hide_render=True;o.hide_set(True)
 if primarycol:
  for o in primarycol:o['representation']='movement_proxy'
  export(D/'collision.glb',primarycol)
 for o in primarycol:o.hide_render=True;o.hide_set(True)
 for level in [1,2]:
  collection=bpy.data.collections.new(f'LOD{level}_EDITABLE_HIDDEN');sc.collection.children.link(collection)
  for ob in groups[level]+roots[level]:
   for col in list(ob.users_collection):col.objects.unlink(ob)
   collection.objects.link(ob)
  collection.hide_render=True;collection.hide_viewport=True
 for o in groups[0]:o.hide_render=False;o.hide_set(False)
 bpy.ops.wm.save_as_mainfile(filepath=str(D/'source.blend'),compress=True);render(D/'hero.png',groups[0])
 for level in [1,2]:
  for c in bpy.data.collections:
   if c.name.startswith(f'LOD{level}_EDITABLE_HIDDEN'):c.hide_render=False;c.hide_viewport=False
  for o in groups[0]:o.hide_render=True
  for o in groups[level]:o.hide_render=False;o.hide_set(False)
  bpy.context.view_layer.update();render(D/f'lod{level}.png',groups[level])
  for o in groups[level]:o.hide_render=True;o.hide_set(True)
  for c in bpy.data.collections:
   if c.name.startswith(f'LOD{level}_EDITABLE_HIDDEN'):c.hide_render=True;c.hide_viewport=True
 m=json.loads((D/'module.json').read_text());m.update({'actual_bounds_blender_m':bounds(groups[0]),'lod_triangle_counts':counts,'visual_meshes':len(groups[0]),'collider_meshes':len(primarycol),'sockets':primarysockets,'revision':'candidate-r04','change':'Scalloped pointed canopy, radial ribs and real matching supports; layered pier head authoring. Unapproved.'});(D/'module.json').write_text(json.dumps(m,indent=2)+'\n');reports.append({'module':slug,'counts':counts,'sockets':primarysockets});print('R04_AUTHORED',slug,counts,flush=True)
(O/'canopy-r04-authoring-report.json').write_text(json.dumps({'scope':'Two unapproved authored refinements, no design or physics acceptance','reports':reports},indent=2)+'\n')
