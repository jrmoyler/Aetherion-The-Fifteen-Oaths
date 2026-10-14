import bpy, math, json, pathlib, sys
from mathutils import Vector
O=pathlib.Path(__file__).resolve().parent; args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []; ONLY=set(args)
KIT=json.loads((O/'source-kit-record.json').read_text()); mats={}; visual=[]; colliders=[]; sockets=[]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for name in ['marble','masonry','bronze','weave','gripstone']:
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.5
 for typ,inp in [('basecolor','Base Color'),('roughness','Roughness'),('metallic','Metallic'),('normal','Normal')]:
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(O/'textures'/f'{name}_{typ}.png'));n.image.colorspace_settings.name='sRGB' if typ=='basecolor' else 'Non-Color';n.image.pack()
  if typ=='normal': q=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(n.outputs['Color'],q.inputs['Color']);m.node_tree.links.new(q.outputs['Normal'],p.inputs[inp])
  else:m.node_tree.links.new(n.outputs['Color'],p.inputs[inp])
 mats[name]=m

def finish(o,n,mat='marble',detail=0,col=False,bevel=0):
 o.name=n;o.data.materials.append(mats[mat]);o['lod_detail']=detail
 bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Small physical edge chamfer','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 tri=o.modifiers.new('Export final triangulated topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
 (colliders if col else visual).append(o)
 return o

def box(n,loc,dim,mat='marble',detail=0,col=False,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim;return finish(o,n,mat,detail,col,bevel)
def mesh(n,verts,faces,mat='marble',detail=0,col=False):
 m=bpy.data.meshes.new(n);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(n,m);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);return finish(o,n,mat,detail,col)
def beam(n,a,b,width,mat='bronze',detail=1):
 a,b=Vector(a),Vector(b);o=box(n,(a+b)/2,(width,width,(b-a).length),mat,detail,bevel=width*.12);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=False,rotation=True,scale=False);return o

def cyl(n,loc,r,depth,mat='bronze',detail=1,vertices=12):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);return finish(bpy.context.object,n,mat,detail)
def socket(name,kind,pos,normal=(0,0,1),partners=None,clearance=None):
 e=bpy.data.objects.new('SOCKET__'+name,None);bpy.context.collection.objects.link(e);e.location=pos;e.empty_display_size=.12;e['semantic_type']=kind;e['outward_normal']=list(normal);sockets.append({'name':name,'semantic_type':kind,'position_blender_xyz_m':list(pos),'position_gltf_xyz_m':[pos[0],pos[2],-pos[1]],'outward_normal_blender_xyz':list(normal),'compatible_partner_types':partners or [kind],'occupancy_rule':'one partner per structural seam; attachment slots individually owned','clearance':clearance});return e

def floor(w=4,d=4,h=.4,ornament=True):
 box('Stone floor substrate',(w/2,d/2,-(h+.044)/2),(w,d,h-.044),'masonry')
 # Top is partitioned into marble sectors with actual narrow gaps above bronze substrate.
 # No coplanar overlaid full marble face/inlay geometry.
 if ornament:
  box('Recessed continuous bronze inlay bed',(w/2,d/2,-.022),(w,d,.0438),'bronze',0)
  center=Vector((w/2,d/2));ends=[Vector(t) for t in [(0,0),(w/2,0),(w,0),(w,d/2),(w,d),(w/2,d),(0,d),(0,d/2)]]
  for i in range(8):
   a=ends[i];b=ends[(i+1)%8];ia=center+(a-center).normalized()*.20;ib=center+(b-center).normalized()*.20
   poly=[ia,a,b,ib];cen=sum(poly,Vector((0,0)))/4;poly=[p+(cen-p).normalized()*.012 for p in poly]
   verts=[(p.x,p.y,z) for z in [-.04,0] for p in poly]
   mesh('Replaceable flush radial marble floor sector',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
  cyl('Flush solar medallion',(w/2,d/2,-.004),.17,.008,'bronze',0,16)
 else:box('Replaceable marble foundation facing',(w/2,d/2,-.022),(w,d,.044),bevel=.002)
 for side in [0,1]:
  for t in [1,3]:
   if t<w:box('Recessed edge key',(t,.008 if side==0 else d-.008,-h*.55),(.16,.016,.06),'bronze',2)
 box('COL_floor',(w/2,d/2,-h/2),(w,d,h),'masonry',col=True)
 for name,pos,n in [('west',(0,d/2,0),(-1,0,0)),('east',(w,d/2,0),(1,0,0)),('south',(w/2,0,0),(0,-1,0)),('north',(w/2,d,0),(0,1,0))]:socket(name,'structural_edge',pos,n)
 socket('finished-floor','floor_datum',(0,0,0))

def foundation():
 box('Footing bottom bearing pad',(2,2,-.525),(4,4,.15),'masonry')
 box('Plinth bearing body',(2,2,-.27),(3.68,3.68,.42),'masonry')
 for x in [.25,3.75]:
  for y in [.25,3.75]:
   box('Independent marble corner bearing facing',(x,y,-.225),(.5,.5,.45),bevel=.006)
   box('Corner dry bronze anchor strap',(x,y,-.04),(.5,.5,.025),'bronze',1)
 for y in [.035,3.965]:
  box('Perimeter exposed marble footing edge',(2,y,-.32),(4,.07,.30))
  box('Separate open drainage channel bed',(2,.12 if y<2 else 3.88,-.135),(3.45,.09,.022),'gripstone')
 for x in [.035,3.965]:
  box('Perimeter exposed marble footing edge',(x,2,-.32),(.07,4,.30))
  box('Separate open drainage channel bed',(.12 if x<2 else 3.88,2,-.135),(.09,3.45,.022),'gripstone')
 box('COL_foundation_footing',(2,2,-.3),(4,4,.6),'masonry',col=True)
 for name,pos,n in [('west',(0,2,0),(-1,0,0)),('east',(4,2,0),(1,0,0)),('south',(2,0,0),(0,-1,0)),('north',(2,4,0),(0,1,0))]:socket(name,'structural_edge',pos,n)
 socket('top-bearing-datum','floor_datum',(0,0,0))

def pier(x,y,h=4,scale=1):
 # Faceted stepped octagonal plinth and fluted marble faces follow proposed colonnade.
 levels=[(0,.29),(.1,.29),(.12,.25),(.38,.20),(.43,.20),(.47,.15),(h-.48,.15),(h-.38,.22),(h-.30,.24),(h-.22,.20),(h-.08,.12),(h,.015)]
 verts=[]
 for z,r in levels:
  for i in range(8):a=math.pi/8+i*math.pi/4;verts.append((x+r*scale*math.cos(a),y+r*scale*math.sin(a),z))
 faces=[tuple(reversed(range(8))),tuple(range((len(levels)-1)*8,len(levels)*8))]
 for j in range(len(levels)-1):
  for i in range(8):faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
 mesh('Marble pier stepped octagonal facing',verts,faces)
 box('Stone pier load bearing core',(x,y,(h-.3)/2),(.18*scale,.18*scale,h-.3),'masonry')
 for z,r in [(.41,.205),(h-.36,.23),(h-.22,.20)]:cyl('Bronze capital collar',(x,y,z),r*scale,.033,'bronze',1,8)
 for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
  a=(x+dx*.151*scale,y+dy*.151*scale,.5);b=(a[0],a[1],h-.48);beam('Vertical bronze facing rail',a,b,.018,'bronze',1)
  z=h*.33; p=Vector((a[0],a[1],z));t=Vector((-dy,dx,0));points=[p+Vector((0,0,.20)),p+t*.08,p-Vector((0,0,.20)),p-t*.08]
  for i in range(4):beam('Diamond pier filigree',points[i],points[(i+1)%4],.016,'bronze',2)
 box('COL_pier',(x,y,(h-.2)/2),(.42*scale,.42*scale,h-.2),'masonry',col=True)

def wall(window=False):
 if window:
  pieces=[((.67,.175,1.6),(1.34,.29,3.2)),((3.33,.175,1.6),(1.34,.29,3.2)),((2,.175,.47),(1.32,.29,.94)),((2,.175,2.73),(1.32,.29,.94))]
 else:pieces=[((2,.175,1.6),(4,.29,3.2))]
 for i,(loc,dim) in enumerate(pieces):
  box('Bearing masonry wall segment',loc,dim,'masonry');box('COL_wall_segment',loc,(dim[0],.35,dim[2]),'masonry',col=True)
  for side in [.015,.335]:box('Replaceable marble facing panel',(loc[0],side,loc[2]),(dim[0],.03,dim[2]),bevel=.002)
 for x in [.055,3.945]:
  box('Fluted edge pilaster',(x,.044,1.6),(.11,.07,3.2));beam('Bronze edge relief',(x,.003,.12),(x,.003,3.08),.012,'bronze',1)
 for z in [.04,3.16]:box('Continuous bronze wall seat',(2,.009,z),(4,.018,.026),'bronze',1)
 if window:
  for x in [1.37,2.63]:box('Bronze reveal frame',(x,.175,1.6),(.06,.35,1.32),'bronze',1)
  for z in [.97,2.23]:box('Bronze reveal frame',(2,.175,z),(1.2,.35,.06),'bronze',1)
  for x in [1.37,2.63]:box('COL_window_reveal',(x,.175,1.6),(.06,.35,1.32),'masonry',col=True)
  for z in [.97,2.23]:box('COL_window_reveal',(2,.175,z),(1.2,.35,.06),'masonry',col=True)
  socket('window-center','window_clear',(2,.175,1.6),clearance={'width_m':1.2,'height_m':1.2,'sill_m':1})
 else:
  for x in [1,2,3]:beam('Shallow vertical facing relief',(x,.002,.18),(x,.002,3.02),.012,'bronze',1)
  for a,b in [((1.55,.001,3.02),(2,.001,2.55)),((2,.001,2.55),(2.45,.001,3.02))]:beam('Crown chevron',a,b,.025,'bronze',2)
 socket('left','structural_edge',(0,.175,0),(-1,0,0));socket('right','structural_edge',(4,.175,0),(1,0,0));socket('base','floor_datum',(0,0,0));socket('roof','roof_seat',(0,0,3.2))

def corner(outside=False):
 box('Corner bearing return',(.191,.191,1.6),(.318,.318,3.1),'masonry');box('COL_corner',(.175,.175,1.6),(.35,.35,3.2),'masonry',col=True)
 for side in [0,1]:
  loc=(.175,.016,1.6) if side==0 else (.016,.175,1.6);dim=(.35,.032,3.1) if side==0 else (.032,.35,3.1);box('Mitered marble corner facing',loc,dim)
 for x,y in [(.03,.03),(.32,.03),(.03,.32)]:beam('Corner bronze end cap',(x,y,.08),(x,y,3.12),.018,'bronze',1)
 for z in [.025,3.175]:box('Corner bronze seat',(.175,.175,z),(.35,.35,.05),'bronze',1)
 if outside:
  for z in [.9,2.3]:
   for a,b in [((.175,0,z+.2),(.3,0,z)),((.3,0,z),(.175,0,z-.2)),((.175,0,z-.2),(.05,0,z)),((.05,0,z),(.175,0,z+.2))]:beam('External diamond relief',a,b,.016,'bronze',2)
 socket('west' if not outside else 'east','structural_edge',(0,.175,0) if not outside else (.35,.175,0),(-1,0,0) if not outside else (1,0,0));socket('south' if not outside else 'north','structural_edge',(.175,0,0) if not outside else (.175,.35,0),(0,-1,0) if not outside else (0,1,0));socket('base','floor_datum',(0,0,0))

def door(offset=(0,0,0)):
 ox,oy,oz=offset
 for x in [.1,1.5]:
  box('Stone jamb',(ox+x,oy+.2,oz+1.4),(.2,.3,2.8),'masonry');box('COL_door_jamb',(ox+x,oy+.2,oz+1.4),(.2,.4,2.8),'masonry',col=True)
  for yy in [.025,.375]:box('Marble jamb facing',(ox+x,oy+yy,oz+1.4),(.2,.05,2.8));beam('Bronze jamb trim',(ox+x-.08,oy+.006,oz+.08),(ox+x-.08,oy+.006,oz+2.72),.012,'bronze',1)
 box('Door masonry head',(ox+.8,oy+.2,oz+2.6),(1.2,.3,.4),'masonry');box('COL_door_head',(ox+.8,oy+.2,oz+2.6),(1.2,.4,.4),'masonry',col=True)
 for yy in [.025,.375]:box('Marble head facing',(ox+.8,oy+yy,oz+2.6),(1.2,.05,.4))
 box('Bronze outer head trim',(ox+.8,oy+.009,oz+2.43),(1.2,.018,.05),'bronze',1)
 socket('door-aperture','door_clear',(ox+.8,oy+.2,oz),clearance={'width_m':1.2,'height_m':2.4});socket('threshold','floor_datum',offset);socket('hinge-provision','mechanism_axis',(ox+.2,oy+.2,oz),clearance={'leaf':'NOT_AUTHORED_FRAME_ONLY'})

def canopy():
 verts=[];n=12
 for j in range(n+1):
  v=j/n
  for i in range(n+1):
   u=i/n; x=.10+3.8*u;y=.10+3.8*v;z=.3-.28*math.sin(math.pi*u)*math.sin(math.pi*v);verts.append((x,y,z))
 faces=[]
 for j in range(n):
  for i in range(n):a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
 o=mesh('Taut woven removable canopy with shallow sag',verts,faces,'weave');m=o.modifiers.new('Physical woven thickness','SOLIDIFY');m.thickness=.004;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
 for a,b in [((.1,.1,.3),(3.9,.1,.3)),((3.9,.1,.3),(3.9,3.9,.3)),((3.9,3.9,.3),(.1,3.9,.3)),((.1,3.9,.3),(.1,.1,.3))]:beam('Canopy sewn tension edge',a,b,.018,'bronze',1)
 for x in [.1,3.9]:
  for y in [.1,3.9]:cyl('Corner socket quick release',(x,y,.275),.065,.05,'bronze',1);socket(f'canopy-seat-{x}-{y}','attachment_static',(x,y,.3))
 # Canopy is non-solid decorative overhead fabric. No false walkable collision.

def colonnade():
 for x in [.3,3.7]:
  for y in [.3,3.7]:pier(x,y,4);socket(f'pier-seat-{x}-{y}','attachment_static',(x,y,3.78))
 # Curved bronze arc seat under canopy, not a flat generic beam.
 for x in [.3,3.7]:
  for i in range(12):
   t=i/12;u=(i+1)/12;a=(x,.3+3.4*t,3.20+.45*(abs(2*t-1)**.55));b=(x,.3+3.4*u,3.20+.45*(abs(2*u-1)**.55));beam('Bronze arch seat',a,b,.042,'bronze',1)
 for y in [.3,3.7]:
  for i in range(12):
   t=i/12;u=(i+1)/12;beam('Bronze arch seat',(.3+3.4*t,y,3.20+.45*abs(2*t-1)**.55),(.3+3.4*u,y,3.20+.45*abs(2*u-1)**.55),.042,'bronze',1)
 socket('base','floor_datum',(0,0,0));socket('clear-route','door_clear',(2,2,0),clearance={'width_m':2.98,'headroom_m':3.15})

def wedge(n,w,d,r,mat='marble',col=False):
 return mesh(n,[(0,0,0),(w,0,0),(w,d,0),(0,d,0),(0,d,r),(w,d,r)],[(0,3,2,1),(0,1,5,4),(0,4,3),(1,2,5),(3,4,5,2)],mat,col=col)
def rail(x,d,r):
 for y in [0,d/2,d]:
  z=y/d*r;box('Outside-route guard post',(x,y,z+.55),(.12,.12,1.1));cyl('Rail post bronze cap',(x,y,z+1.12),.08,.04,'bronze',1)
 for z in [.5,1.06]:beam('Continuous bronze guardrail',(x,0,z),(x,d,z+r),.045,'bronze',1)
 # Collider rail is separate from navigation wedge, preserving 1.8m clear width.
 o=box('COL_guard',(x,d/2,r/2+.55),(.16,math.sqrt(d*d+r*r),1.1),'masonry',col=True);o.rotation_euler.x=math.atan2(r,d)

def traversal(ramp=False):
 w=1.8;d=4.8 if ramp else 2.7;r=.4 if ramp else 1.6
 if ramp:
  core=wedge('Stone ramp support',w,d,r,'masonry');core.location.z=-.02
  mesh('Separate 20mm marble ramp facing',[(0,0,-.02),(w,0,-.02),(w,d,r-.02),(0,d,r-.02),(0,0,0),(w,0,0),(w,d,r),(0,d,r)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 else:
  # Nine treads, tenth riser reaches the independently supplied landing.
  for i in range(9):
   h=.16*(i+1);box('Stone stair tread and riser',(w/2,(i+.5)*.3,(h-.032)/2),(w,.3,h-.032),'masonry');box('Replaceable marble tread',(w/2,(i+.5)*.3,h-.016),(w,.3,.032));box('Flush non-slip tread inset',(w/2,i*.3+.06,h-.0014),(w-.12,.055,.004),'gripstone',1)
  # Riser10 is the receiving landing's 160mm front fascia at y=2.70.
  # No terminal body may intrude into the ninth full 300mm tread.
  socket('receiving-landing-front-fascia','attachment_static',(0,d,1.44),(0,1,0),clearance={'riser_owner':'receiving_landing','riser_height_m':.16,'required_landing_front_plane_y_m':2.7,'required_landing_floor_z_m':1.6,'no_overlap_behind_plane':True})
 wedge('COL_smooth_navigation_proxy',w,d,r,'masonry',True)
 for x in [-.10,1.90]:rail(x,d,r)
 socket('bottom','landing_start',(0,0,0),(0,-1,0),['landing_end'],{'width_m':1.8,'headroom_m':2.4});socket('top','landing_end',(0,d,r),(0,1,0),['landing_start'],{'width_m':1.8,'headroom_m':2.4})

def parapet():
 box('Parapet bearing wall',(2,.1,.6),(4,.16,1.2),'masonry');box('Marble outer face',(2,.015,.6),(4,.03,1.2));box('Marble inner face',(2,.185,.6),(4,.03,1.2));box('Bronze weather cap',(2,.1,1.185),(4,.2,.03),'bronze',1);box('COL_parapet',(2,.1,.6),(4,.2,1.2),'masonry',col=True)
 for x in [.5,1.5,2.5,3.5]:
  for a,b in [((x-.32,0,.6),(x,0,.98)),((x,0,.98),(x+.32,0,.6)),((x+.32,0,.6),(x,0,.22)),((x,0,.22),(x-.32,0,.6))]:beam('Solar diamond parapet trim',a,b,.014,'bronze',2)
 socket('start','guardrail',(0,.1,0),(-1,0,0));socket('end','guardrail',(4,.1,0),(1,0,0));socket('base','floor_datum',(0,0,0))
def chase():
 for x in [.06,.54]:box('Utility chase stone side',(x,.3,1.6),(.12,.6,3.2),'masonry')
 box('Utility chase rear',(.3,.55,1.6),(.36,.1,3.2),'masonry');box('Removable marble inspection panel',(.3,.04,1.6),(.36,.08,3.2));
 for x in [.17,.43]:cyl('Separated vertical utility conduit',(x,.30,1.6),.035,3.2,'bronze',1)
 for z in [.5,2.7]:box('Panel release latch',(.45,.00,z),(.075,.026,.11),'bronze',2)
 box('COL_service_chase',(.3,.3,1.6),(.6,.6,3.2),'masonry',col=True);socket('bottom','utility_pass',(.3,.3,0),(0,0,-1));socket('top','utility_pass',(.3,.3,3.2));socket('manual-access','attachment_static',(.3,0,1.1),(0,-1,0))
def roof():
 box('Roof bearing core',(2,2,.155),(4,4,.31),'masonry');mesh('Shallow fall marble roof',[(0,0,.31),(4,0,.31),(4,4,.31),(0,4,.31),(0,0,.33),(4,0,.33),(4,4,.35),(0,4,.35)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 for x in [.06,3.94]:box('Roof bronze drip edge',(x,2,.30),(.025,4,.04),'bronze',1)
 for y in [.06,3.94]:box('Roof bronze drip edge',(2,y,.30),(4,.025,.04),'bronze',1)
 box('COL_roof_shell',(2,2,.175),(4,4,.35),'masonry',col=True);socket('roof-base','roof_seat',(0,0,0),(0,0,-1));socket('drain-low-edge','utility_pass',(2,0,.32),(0,-1,0))
def clinic():
 floor(2.4,2,.12);start=len(visual);startc=len(colliders);door((.4,1.6,0));
 box('Side mounted clinic sign panel',(2.22,1.52,2.15),(.28,.04,.45));box('Bronze clinic sign upper bracket',(2.18,1.59,2.42),(.35,.055,.035),'bronze',1)
 socket('protected-queue','door_clear',(1.2,.8,0),clearance={'width_m':2.4,'depth_m':1.6,'NOTE':'2m nominal footprint includes .4m door assembly. Requested full 2m clear queue requires external reservation beyond module.'})
def portico():
 floor(4,3,.15);start=len(visual);startc=len(colliders);starts=len(sockets);before_empty=set(o for o in bpy.context.scene.objects if o.type=='EMPTY');wall();
 for o in visual[start:]+colliders[startc:]+[o for o in bpy.context.scene.objects if o.type=='EMPTY' and o not in before_empty]:o.location.y+=2.65
 for soc in sockets[starts:]:soc['position_blender_xyz_m'][1]+=2.65;soc['position_gltf_xyz_m'][2]-=2.65
 for x in [.3,3.7]:pier(x,.3,3.2)
 box('Quiet portico bench seat',(2,2.3,.46),(2.4,.45,.12),bevel=.015)
 for x in [1,3]:box('Bench stone bearer',(x,2.3,.22),(.18,.35,.44),'masonry')
 box('COL_bench',(2,2.3,.26),(2.4,.45,.52),'masonry',col=True)
 box('Portico stone shade lintel',(2,1.325,3.1),(4,2.65,.2),'marble');socket('front-protected-route','door_clear',(2,.9,0),clearance={'width_m':2.98,'headroom_m':3.0})
def baffle():
 for x in [.09,1.91]:box('Marble baffle jamb',(x,.15,.6),(.18,.3,1.2));box('Bronze baffle pivot rail',(x,.12,.6),(.055,.07,1.06),'bronze',1)
 for z in [.045,1.155]:box('Fixed baffle end rail',(1,.15,z),(1.64,.16,.09),'bronze',0)
 for k in range(3):
  z=.30+k*.32;e=bpy.data.objects.new(f'Louver_{k+1}_actual_horizontal_pivot',None);bpy.context.collection.objects.link(e);e.location=(1,.15,z+.14);start=len(visual)
  box(f'Louver_{k+1}_woven_shade',(1,.15,z),(1.62,.018,.28),'weave');
  for zz in [z-.145,z+.145]:box('Louver bronze horizontal rim',(1,.15,zz),(1.64,.036,.02),'bronze',1)
  for xx in [.18,1.82]:box('Louver bronze side rim',(xx,.15,z),(.026,.036,.29),'bronze',1)
  bpy.context.view_layer.update()
  for o in visual[start:]:
   world=o.matrix_world.copy();o.parent=e;o.matrix_world=world
  e.rotation_euler.x=0;e.keyframe_insert(data_path='rotation_euler',frame=1);e.rotation_euler.x=math.radians(70);e.keyframe_insert(data_path='rotation_euler',frame=61);e.rotation_euler.x=0;e.keyframe_insert(data_path='rotation_euler',frame=121)
  if e.animation_data:e.animation_data.action.name='daylight_baffle_open_close'
  socket(f'louver-axis-{k}','mechanism_axis',tuple(e.location),(1,0,0),clearance={'limits_degrees':[0,70],'required_state_authority':'NOT_IMPLEMENTED'})
 box('Baffle side service housing',(1.83,.23,.6),(.1,.10,1.0),'masonry');socket('window-attachment','attachment_static',(1,.3,0),(0,1,0));socket('manual-release-extension','attachment_static',(1.91,.3,.08),clearance={'floor_reachable_extension':'NOT_YET_AUTHORED'})

BUILD={'foundation-plinth':foundation,'floor-bay':floor,'solid-wall':wall,'window-wall':lambda:wall(True),'inside-corner':corner,'outside-corner':lambda:corner(True),'door-frame':door,'roof-bay':roof,'stair-flight':traversal,'ramp-run':lambda:traversal(True),'parapet':parapet,'service-chase':chase,'public colonnade':colonnade,'shade canopy':canopy,'clinic threshold':clinic,'quiet portico':portico,'daylight baffle':baffle}

def selected(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.hide_viewport=False;o.select_set(True)
 if objects:bpy.context.view_layer.objects.active=objects[0]
def export(path,objects):
 selected(objects);bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=True,export_frame_range=True,export_force_sampling=True,export_extras=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='daylight_baffle_open_close')
def bounds(obs):
 pts=[o.matrix_world@Vector(v) for o in obs if o.type=='MESH' for v in o.bound_box];return [[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]] if pts else None

def render(path,obs):
 pts=[o.matrix_world@Vector(v) for o in obs if o.type=='MESH' for v in o.bound_box];lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)));center=(lo+hi)/2;size=max(hi-lo)
 bpy.ops.object.camera_add(location=center+Vector((size*1.35,-size*1.65,size*1.10)));cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=size*2.1;bpy.context.scene.camera=cam
 lights=[]
 for loc,power,scale in [((3,-4,7),1800,5),((-4,-1,4),1100,4),((1,5,6),2200,4)]:
  bpy.ops.object.light_add(type='AREA',location=center+Vector(loc));l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=scale;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler();lights.append(l)
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=False;sc.render.resolution_x=900;sc.render.resolution_y=760;sc.render.resolution_percentage=100;sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.35,.35,.35,1);sc.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.7;sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False;sc.view_settings.view_transform='AgX';sc.render.filepath=str(path);bpy.ops.render.render(write_still=True)
 for o in [cam]+lights:bpy.data.objects.remove(o,do_unlink=True)

reports=[]
for idx,spec in enumerate(KIT['modules']):
 name=spec['name'];slug=name.replace(' ','-')
 if ONLY and slug not in ONLY:continue
 [bpy.data.objects.remove(o,do_unlink=True) for o in list(bpy.context.scene.objects)];visual=[];colliders=[];sockets=[];sc=bpy.context.scene;sc.frame_start=1;sc.frame_end=121;sc.render.fps=30;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1;BUILD[name]();sc.frame_set(1);bpy.context.view_layer.update()
 D=O/'modules'/slug;D.mkdir(parents=True,exist_ok=True)
 for o in visual:o['baseline_asset_id']=KIT['baseline_asset_id'];o['specification_id']=KIT['id'];o['original_module_name']=name;o['status']='PROPOSED_CANDIDATE_NOT_VISUALLY_APPROVED'
 for o in colliders:o.hide_render=True;o.hide_set(True);o['representation']='movement_proxy'
 roots=[o for o in bpy.context.scene.objects if o.type=='EMPTY']
 # Structural mesh preserved at all LODs; discard only annotated decorative details.
 counts={}
 for level in [0,1,2]:
  objs=[o for o in visual if o.get('lod_detail',0)<=2-level]+roots
  for o in objs:
   if o.type=='MESH':o.data.calc_loop_triangles()
  export(D/f'lod{level}.glb',objs);counts[f'lod{level}']=sum(len(o.data.loop_triangles) for o in objs if o.type=='MESH')
 if colliders:export(D/'collision.glb',colliders)
 for o in colliders:o.hide_render=True;o.hide_set(True)
 for o in visual:o.hide_set(False)
 selected(visual);bpy.ops.wm.save_as_mainfile(filepath=str(D/'source.blend'),compress=True);render(D/'hero.png',visual)
 for o in visual:o.data.calc_loop_triangles()
 rep={'original_name':name,'source_pointer':f'ARCHITECTURAL_KIT_REGISTRY.json#/records/8/modules/{idx}','source_axes':'Blender right-handed X-right Y-depth Z-up meters; exporter +Y-up glTF conversion once','origin':'Lower southwest finished-floor footprint corner at z=0; slab thickness below datum','target_extent_width_depth_height_m':spec['target_extent_m'],'actual_bounds_blender_m':bounds(visual),'lod_triangle_counts':counts,'visual_meshes':len(visual),'collider_meshes':len(colliders),'sockets':sockets,'status':'AUTHORED_CANDIDATE_UNAPPROVED','remaining':['Exact reference likeness review','Gameplay traversal and mechanism authority','Texture texel density and mip validation','Unreal import unavailable; Godot/Three independent import pending']}
 (D/'module.json').write_text(json.dumps(rep,indent=2)+'\n');reports.append(rep);print('DAYBREAK_COMPLETE',slug,flush=True)
(O/'author-run.json').write_text(json.dumps({'source_tool':bpy.app.version_string,'modules':reports,'production_accepted_count':0},indent=2)+'\n')
