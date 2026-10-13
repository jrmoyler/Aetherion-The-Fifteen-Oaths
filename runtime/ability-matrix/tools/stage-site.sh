#!/bin/sh
# Assemble the publishable matrix: shell + presets + the unified sandbox build,
# which hosts every ability from every pack in one scene (sourcemaps and the
# MediaPipe hand-tracking runtime left out — the hosted page cannot use a
# camera anyway). Run tools/build-all.sh first.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/site"
rm -rf "$OUT" && mkdir -p "$OUT/packs"
cp "$ROOT/index.html" "$OUT/"
cp -r "$ROOT/presets" "$OUT/presets"
for p in sandbox; do
  mkdir -p "$OUT/packs/$p"
  (cd "$ROOT/packs/$p/dist" && find . -type f ! -name '*.map' ! -path './mediapipe/*' | tar cf - -T -) | (cd "$OUT/packs/$p" && tar xf -)
done
# Artifacts serve web media types only: binary models/HDRs ride as .wasm bytes;
# the bridge rewrites their URLs when the matrix passes ?bin=wasm.
find "$OUT/packs" -type f \( -name "*.fbx" -o -name "*.glb" -o -name "*.hdr" \) -exec sh -c 'mv "$1" "$1.wasm"' _ {} \;
for f in "$OUT"/packs/*/index.html; do sed -i -E 's/\.(fbx|glb|hdr)"/.\1.wasm"/g' "$f"; done
du -sh "$OUT"; find "$OUT" -type f | wc -l
