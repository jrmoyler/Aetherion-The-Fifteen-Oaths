"""Verify this publication's exact bytes and local HTML links, without engine claims."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parent
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  self.links.extend(v for k,v in attrs if k in ('href','src','data-src') and v)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify():
 evidence=json.loads((ROOT/'evidence.json').read_text());listed={r['path'] for r in evidence['files']}
 actual={str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file() and p.name!='evidence.json' and '__pycache__' not in p.parts}
 assert listed==actual,{'unlisted':sorted(actual-listed),'missing':sorted(listed-actual)}
 for row in evidence['files']:
  p=ROOT/row['path'];assert p.stat().st_size==row['bytes'] and digest(p)==row['sha256'],p
 links=0;png=0
 for p in ROOT.rglob('*.html'):
  parser=Links();parser.feed(p.read_text())
  for url in parser.links:
   path=urlsplit(url)
   if path.scheme or path.netloc or not path.path:continue
   target=(p.parent/unquote(path.path)).resolve();assert target.is_file(),(p,url);links+=1
 for p in ROOT.rglob('*.png'):
  with Image.open(p) as im:im.load();png+=1
 for entry in json.loads((ROOT/'review-manifest.json').read_text())['entries']:
  for ref in entry['referenceFiles']:assert digest(ROOT.parents[3]/ref['path'])==ref['sha256']
 print(json.dumps({'status':'PASS','files':len(listed),'bytes':sum(r['bytes'] for r in evidence['files']),'pngDecoded':png,'localHtmlLinkOccurrences':links},indent=2))
if __name__=='__main__':verify()
