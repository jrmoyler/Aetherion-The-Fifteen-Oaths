from pathlib import Path
from PIL import Image,ImageDraw
p=Path(__file__).resolve().parent;im=Image.new('RGB',(1440,800),'#1f2733');d=ImageDraw.Draw(im)
for row,slug in enumerate(['shade-canopy','public-colonnade']):
 paths=[(p/'lineage'/f'r03-{slug}-hero.png','r03 LOD0')]+[(p/'modules'/slug/('hero.png' if k==0 else f'lod{k}.png'),f'r04 LOD{k}') for k in range(3)]
 for col,(file,label) in enumerate(paths):
  x=Image.open(file).convert('RGB');x.thumbnail((355,350));im.paste(x,(col*360+(355-x.width)//2,row*400+40));d.text((col*360+7,row*400+12),slug+' | '+label,fill='white')
im.save(p/'r04-canopy-comparison.png')
