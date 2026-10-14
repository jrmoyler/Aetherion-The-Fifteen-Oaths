"""Verify exact publication closure, image decode and local links; no engine claims."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import hashlib
import json
from PIL import Image
ROOT = Path(__file__).resolve().parent

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        self.links.extend(v for k, v in attrs if k in ('href', 'src', 'data-src') and v)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify_closure(root, evidence):
    rows = evidence['files']
    listed = set()
    for row in rows:
        raw = row['path']
        path = Path(raw)
        assert raw and not path.is_absolute() and '..' not in path.parts, ('unsafe path', raw)
        assert path.as_posix() == raw and raw != 'evidence.json', ('noncanonical/self path', raw)
        assert raw not in listed, ('duplicate path', raw)
        listed.add(raw)
    actual = set()
    for path in root.rglob('*'):
        assert not path.is_symlink(), ('symlink forbidden', str(path))
        if path.is_file() and path != root / 'evidence.json':
            actual.add(path.relative_to(root).as_posix())
    assert listed == actual, {'unlisted': sorted(actual-listed), 'missing': sorted(listed-actual)}
    for row in rows:
        path = root / row['path']
        assert path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], ('byte mismatch', row['path'])
    return len(rows), sum(row['bytes'] for row in rows)

def verify_content(root):
    links = png = 0
    repo = root
    for path in root.rglob('*.html'):
        parser = Links()
        parser.feed(path.read_text())
        for url in parser.links:
            parts = urlsplit(url)
            if parts.scheme or parts.netloc or not parts.path:
                continue
            target = (path.parent / unquote(parts.path)).resolve()
            assert target.is_relative_to(repo), ('link escapes repository', path, url)
            assert target.exists(), ('missing link', path, url)
            links += 1
    for path in root.rglob('*.png'):
        with Image.open(path) as im:
            im.load()
        png += 1
    ref = json.loads((root / 'review-manifest.json').read_text())['reference']
    assert digest(root / ref['path']) == ref['sha256'], ('reference changed', ref['path'])
    return {'pngDecoded': png, 'localHtmlLinkOccurrences': links}

def verify():
    evidence = json.loads((ROOT / 'evidence.json').read_text())
    count, size = verify_closure(ROOT, evidence)
    print(json.dumps({'status': 'PASS', 'files': count, 'bytes': size, **verify_content(ROOT)}, indent=2))

if __name__ == '__main__':
    verify()
