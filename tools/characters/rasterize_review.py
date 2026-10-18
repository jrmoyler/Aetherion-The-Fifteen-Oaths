import sys,struct,json,io
import numpy as np
from PIL import Image
p=sys.argv[1];out=sys.argv[2];b=open(p,'rb').read();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);buf=b[28+n:];W=800;H=900
frame=np.zeros((H,W,3))+np.array([125,131,137]);zbuf=np.full((H,W),-100.)
def read(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];c={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];d={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];return np.ndarray((a['count'],c),dtype=d,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(d).itemsize*c),np.dtype(d).itemsize)).copy()
eyeprim=j['meshes'][0]['primitives'][1] if len(j['meshes'][0]['primitives'])>1 else None
center=read(eyeprim['attributes']['POSITION'])[:,1].mean()-.04 if eyeprim else 1.47
for mesh in j['meshes']:
 for prim in mesh['primitives']:
  a=prim['attributes'];v=read(a['POSITION']);norm=read(a['NORMAL']);vc=read(a['COLOR_0']) if 'COLOR_0' in a else None;uv=read(a['TEXCOORD_0']) if 'TEXCOORD_0'in a else None;ix=read(prim['indices']).reshape(-1,3);m=j['materials'][prim.get('material',0)].get('pbrMetallicRoughness',{});tex=None
  if 'baseColorTexture'in m:
   im=j['images'][j['textures'][m['baseColorTexture']['index']]['source']];bv=j['bufferViews'][im['bufferView']];tex=np.asarray(Image.open(io.BytesIO(buf[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB'))
  base=np.array(m.get('baseColorFactor',[1,1,1,1])[:3]);base=np.where(base<=.0031308,12.92*base,1.055*base**(1/2.4)-.055)*255
  # crop to the reference face; +Z is forward, Y up
  pp=np.stack([W/2+v[:,0]*2500,H/2-(v[:,1]-center)*2500],1)
  for ids in ix:
   pts=pp[ids];xmin=max(0,int(np.floor(pts[:,0].min())));xmax=min(W-1,int(np.ceil(pts[:,0].max())));ymin=max(0,int(np.floor(pts[:,1].min())));ymax=min(H-1,int(np.ceil(pts[:,1].max())))
   if xmin>xmax or ymin>ymax:continue
   x,y=np.meshgrid(np.arange(xmin,xmax+1),np.arange(ymin,ymax+1));t=pts;den=(t[1,1]-t[2,1])*(t[0,0]-t[2,0])+(t[2,0]-t[1,0])*(t[0,1]-t[2,1])
   if abs(den)<1e-6:continue
   w0=((t[1,1]-t[2,1])*(x-t[2,0])+(t[2,0]-t[1,0])*(y-t[2,1]))/den;w1=((t[2,1]-t[0,1])*(x-t[2,0])+(t[0,0]-t[2,0])*(y-t[2,1]))/den;w2=1-w0-w1;ww=np.stack([w0,w1,w2],-1);zz=ww@v[ids,2];sl=zbuf[ymin:ymax+1,xmin:xmax+1];mask=(ww.min(-1)>=-1e-5)&(zz>sl)
   if not mask.any():continue
   normals=ww@norm[ids];light=.45+.55*np.clip(normals@np.array([.3,.6,.74]),0,1)
   if tex is not None:
    uvs=ww@uv[ids];color=tex[np.clip((uvs[:,:,1]*tex.shape[0]).astype(int),0,tex.shape[0]-1),np.clip((uvs[:,:,0]*tex.shape[1]).astype(int),0,tex.shape[1]-1)]
   else:color=np.broadcast_to(base,(*x.shape,3))
   
   if vc is not None:color=color*np.maximum(ww@vc[ids,:3],0)**(1/2.2)
   frame[ymin:ymax+1,xmin:xmax+1][mask]=(color*light[:,:,None])[mask];sl[mask]=zz[mask]
Image.fromarray(np.clip(frame,0,255).astype('uint8')).save(out)
