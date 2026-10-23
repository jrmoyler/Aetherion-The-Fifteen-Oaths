"""Reproducible reference albedo preparation, not a claim of inverse rendering.
Manual observed eye/chin landmarks fit orthographic front projection. Low-frequency
illumination is attenuated in luminance; unseen regions are never projected.
"""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np, json
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'game/public/assets/characters/reconstruction'
SPECS={
 'oath-01-sorcerer':dict(ref=91,cx=137,eye=805,sx=186,sy=157),
 'oath-03-sorcerer':dict(ref=87,cx=121,eye=853,sx=172,sy=186),
 'oath-14-sorcerer':dict(ref=64,cx=121,eye=832,sx=172,sy=152),
}
OUT.mkdir(exist_ok=True,parents=True)
for key,s in SPECS.items():
 im=Image.open(ROOT/f'assets/references/reference-{s["ref"]:03}/original.png').convert('RGB')
 # +Y up; eyes at -.005; mouth at -.298. Canvas UV is x/.8+.5, y+.5.
 box=(s['cx']-.4*s['sx'],s['eye']-.505*s['sy'],s['cx']+.4*s['sx'],s['eye']+.495*s['sy'])
 crop=im.transform((256,320),Image.Transform.EXTENT,box,Image.Resampling.BICUBIC)
 a=np.asarray(crop,dtype=float)/255
 lum=np.maximum(.06,a@np.array([.2126,.7152,.0722]));blur=np.asarray(Image.fromarray(np.uint8(lum*255)).filter(ImageFilter.GaussianBlur(24)),dtype=float)/255
 target=np.median(lum[100:250,60:195]);gain=np.clip((target/np.maximum(blur,.06))**.55,.75,1.32)
 out=np.clip(a*gain[...,None],0,1)
 Image.fromarray(np.uint8(out*255)).save(OUT/f'{key}-face.png')
 s['projection']='front only; sides and rear retain inferred skin material'
 s['delighting']='bounded low-frequency luminance normalization; residual source lighting remains possible'
 s['crop']=box
(ROOT/'validation/reconstruction-continuation/face-projection.json').write_text(json.dumps(SPECS,indent=2)+'\n')

# Separate, observed material swatches; mirrored tiling avoids hard repeat edges.
for kind,ref,box in [('terra',91,(460,805,545,870)),('navy',87,(425,780,530,895)),('teal',64,(448,744,500,770)),('ivory',64,(538,750,623,890))]:
 im=Image.open(ROOT/f'assets/references/reference-{ref:03}/original.png').convert('RGB').crop(box).resize((128,128),Image.Resampling.LANCZOS)
 arr=np.asarray(im,dtype=float);low=np.asarray(im.filter(ImageFilter.GaussianBlur(18)),dtype=float);arr=np.clip(arr-low+np.median(arr,axis=(0,1)),0,255);im=Image.fromarray(arr.astype('uint8'))
 tile=Image.new('RGB',(256,256));tile.paste(im,(0,0));tile.paste(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT),(128,0));tile.paste(im.transpose(Image.Transpose.FLIP_TOP_BOTTOM),(0,128));tile.paste(im.transpose(Image.Transpose.ROTATE_180),(128,128));tile.save(OUT/f'{kind}-surface.png')
