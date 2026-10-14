import ast,json,struct,hashlib,sys
from pathlib import Path
old,new=map(Path,sys.argv[1:3]);out=Path(sys.argv[3])
def recipe(p):
 t=ast.parse((p/'kiln_ninja.py').read_text());d={}
 for i,n in enumerate(t.body):
  key=n.name if isinstance(n,(ast.FunctionDef,ast.ClassDef)) else f'toplevel:{i}'
  for child in ast.walk(n):
   if isinstance(child,ast.Constant) and isinstance(child.value,str):child.value=child.value.replace(str(p),'<OUTPUT>')
  d[key]=ast.dump(n,include_attributes=False)
 return d
a,b=recipe(old),recipe(new);diff=[k for k in sorted(set(a)|set(b)) if a.get(k)!=b.get(k)]
def glb(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);offset=20+n;bn=raw[offset+8:]
 def acc(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
  data=b''.join(bn[start+k*stride:start+k*stride+size] for k in range(a['count']));return {'componentType':a['componentType'],'type':a['type'],'count':a['count'],'normalized':a.get('normalized',False),'sha256':hashlib.sha256(data).hexdigest()}
 primitives=[]
 for mesh in j['meshes']:
  for p in mesh['primitives']:primitives.append({'material':j.get('materials',[{}])[p.get('material',0)].get('name'),'attributes':{k:acc(v) for k,v in p['attributes'].items()},'indices':acc(p['indices']) if 'indices'in p else None})
 animations=[]
 for a in j.get('animations',[]):
  animations.append({'name':a.get('name'),'channels':[{'targetName':j['nodes'][c['target']['node']].get('name'),'path':c['target']['path'],'sampler':{'input':acc(a['samplers'][c['sampler']]['input']),'output':acc(a['samplers'][c['sampler']]['output']),'interpolation':a['samplers'][c['sampler']].get('interpolation','LINEAR')}} for c in a['channels']]})
 skins=[]
 for s in j.get('skins',[]):
  skins.append({'inverseBindMatrices':acc(s['inverseBindMatrices']),'bones':[{k:v for k,v in j['nodes'][i].items() if k!='children'}|{'childrenNames':[j['nodes'][v].get('name') for v in j['nodes'][i].get('children',[])]} for i in s['joints']]})
 return {'primitives':primitives,'animations':animations,'skins':skins}
results=[]
for suffix in ['','-lod1','-lod2','-collision']:
 name='kiln-ninja-ensemble-candidate'+suffix+'.glb';a=glb(old/'kiln-ninja-ensemble-candidate'/name);b=glb(new/'kiln-ninja-ensemble-candidate'/name);results.append({'file':name,'animationsIdentical':a['animations']==b['animations'],'skinsIdentical':a['skins']==b['skins'],'primitives':[{'material':x['material'],'identical':x==next((v for v in b['primitives'] if v['material']==x['material']),None),'old':x,'new':next((v for v in b['primitives'] if v['material']==x['material']),None)} for x in a['primitives']]})
r={'scope':'Normalized recipe AST and exact semantic GLB accessor-byte comparisons; not appearance or proof of all possible authoring behavior','recipeChangedNodes':diff,'recipeOnlyHairAndOutputChanged':set(diff)<={'hair_lock','designed_hair'},'exports':results};out.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'changedAST':diff,'exports':[{k:v for k,v in x.items() if k!='primitives'}|{'materials':[(p['material'],p['identical']) for p in x['primitives']]} for x in results]},indent=2))
