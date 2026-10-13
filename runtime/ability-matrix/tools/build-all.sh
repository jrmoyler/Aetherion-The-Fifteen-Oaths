#!/bin/sh
# Install and build every pack (each is its own Vite project).
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# The five source packs and the collective still build on their own; the
# sandbox is the one page that hosts every ability (it vendors the packs).
for p in linear linear-ext linear-extended handcast casting collective sandbox; do
  echo "== $p"; (cd "$ROOT/packs/$p" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npx vite build --logLevel error)
done
(cd "$ROOT" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npm run build:atlas -- --logLevel error)
node "$ROOT/tools/extract-presets.mjs"
