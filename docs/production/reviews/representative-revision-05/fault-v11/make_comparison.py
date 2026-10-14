from pathlib import Path
from PIL import Image,ImageDraw
p=Path(__file__).parent
out=Image.new('RGB',(1200,1260),'#202329');d=ImageDraw.Draw(out)
rows=[('Original reference053: main blade view',Image.open(p/'reference-053.original.png').crop((22,64,760,263))),('V10 preserved comparison',Image.open(p/'comparison-v10-matched-front.png')),('V11 final focused front: not accepted',Image.open(p/'amethyst-short-blade/matched-front-review.png')),('V11 final profile: actual layered depth',Image.open(p/'amethyst-short-blade/matched-profile-review.png'))]
for i,(label,im) in enumerate(rows):
 im=im.convert('RGB');im.thumbnail((1180,280));out.paste(im,((1200-im.width)//2,i*315+30+(280-im.height)//2));d.text((12,i*315+8),label,fill='white')
out.save(p/'comparison-reference-v10-v11.png')
