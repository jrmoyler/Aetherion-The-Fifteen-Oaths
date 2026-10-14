import bpy,json,hashlib,struct,math,os,numpy as np
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent;BASE=P/'baseline';ID='kiln-ninja-ensemble-candidate';D=P/ID;D.mkdir(exist_ok=True);FLOOR=.012;TARGET=.00075
SOURCE=BASE/(ID+'.blend');before=hashlib.sha256(SOURCE.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');body=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];act=bpy.data.actions['walk_in_place'];rig.animation_data.action=act
axis=rig.matrix_world.to_3x3()@rig.data.bones['pelvis'].matrix_local.to_3x3()@Vector((0,1,0));assert (axis-Vector((0,0,1))).length<1e-5,list(axis)
path='pose.bones["pelvis"].location';curve=next(fc for fc in act.fcurves if fc.data_path==path and fc.array_index==1)
def setframe(f):scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
def xyz():
 ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();a=np.array([tuple(body.matrix_world@v.co) for v in me.vertices]);ev.to_mesh_clear();return a
# Evaluate unmodified curve first. A shared vertical correction seats the current lowest sole,
# preserving leg rotations, lateral stride and all authored non-walk curves.
keys=[]
for i in range(31*8+1):
 f=1+i/8;setframe(f);minimum=float(xyz()[:,2].min());delta=FLOOR+TARGET-minimum;keys.append({'frame':f,'baselinePelvisY':curve.evaluate(f),'baselineMinimumWorldZ':minimum,'worldVerticalCorrection':delta})
curve.keyframe_points.clear();curve.keyframe_points.add(len(keys))
for k,point in zip(keys,curve.keyframe_points):point.co=(k['frame'],k['baselinePelvisY']+k['worldVerticalCorrection']);point.interpolation='LINEAR'
curve.update();rig.animation_data.action=None
for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
scene.frame_set(1);bpy.context.view_layer.update()
for im in bpy.data.images:
 if im.packed_file and im.source=='FILE':(D/Path(im.filepath).name).write_bytes(bytes(im.packed_file.data));im.filepath=str(D/Path(im.filepath).name)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(D/(ID+'.blend')),compress=True)
(P/'correction-keys.json').write_text(json.dumps({'floorWorldZ':FLOOR,'targetSoleClearance':TARGET,'pelvisLocalAxis':'Y','localAxisInWorld':list(axis),'keyIntervalFrames':.125,'baselineSourceSha256':before,'keys':keys},indent=2)+'\n')
# Preserve frozen GLB meshes/rig/other animations by replacing only the walk pelvis translation sampler.
receipts=[]
for file in sorted(BASE.glob('*.glb')):
 raw=file.read_bytes()
 if 'collision' in file.name:(D/file.name).write_bytes(raw);receipts.append({'file':file.name,'entireFileExact':True});continue
 n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);off=20+n;bn=struct.unpack_from('<I',raw,off)[0];binary=bytearray(raw[off+8:off+8+bn]);oldjson=json.loads(json.dumps(j));anim=next(a for a in j['animations'] if a['name']=='walk_in_place');channel=next(c for c in anim['channels'] if j['nodes'][c['target']['node']]['name']=='pelvis' and c['target']['path']=='translation');sampler=anim['samplers'][channel['sampler']]
 def read(index,dim):
  ac=j['accessors'][index];view=j['bufferViews'][ac['bufferView']];start=view.get('byteOffset',0)+ac.get('byteOffset',0);return np.array(struct.unpack_from('<'+'f'*ac['count']*dim,binary,start)).reshape(ac['count'],dim)
 times=read(sampler['input'],1)[:,0];values=read(sampler['output'],3);newtimes=np.array([k['frame']/24 for k in keys]);newvalues=np.column_stack([np.interp(newtimes,times,values[:,i]) for i in range(3)]);newvalues[:,1]+=np.array([k['worldVerticalCorrection'] for k in keys])
 def append(array,typ):
  while len(binary)%4:binary.append(0)
  data=np.asarray(array,dtype='<f4').tobytes();v=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data);a={'bufferView':v,'componentType':5126,'count':len(array),'type':typ}
  if typ=='SCALAR':a['min']=[float(np.min(array))];a['max']=[float(np.max(array))]
  j['accessors'].append(a);return len(j['accessors'])-1
 sampler['input']=append(newtimes,'SCALAR');sampler['output']=append(newvalues,'VEC3');sampler['interpolation']='LINEAR';j['buffers'][0]['byteLength']=len(binary)
 while len(binary)%4:binary.append(0)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;(D/file.name).write_bytes(data)
 assert all(j.get(k)==oldjson.get(k) for k in ['meshes','nodes','skins','materials','images','textures']);assert bytes(binary[:bn])==raw[off+8:off+8+bn]
 receipts.append({'file':file.name,'originalBinaryPrefixExact':True,'originalAccessorDefinitionsExact':j['accessors'][:len(oldjson['accessors'])]==oldjson['accessors'],'onlyReplacedAnimationSampler':{'animation':'walk_in_place','node':'pelvis','path':'translation','sampler':channel['sampler']},'geometryRigMaterialJsonExact':True,'newKeyCount':len(keys)})
(P/'export-preservation.json').write_text(json.dumps(receipts,indent=2)+'\n');assert before==hashlib.sha256(SOURCE.read_bytes()).hexdigest();print('GROUND_CANDIDATE_WRITTEN',len(keys),min(k['worldVerticalCorrection'] for k in keys),max(k['worldVerticalCorrection'] for k in keys))
