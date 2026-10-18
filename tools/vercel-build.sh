#!/bin/sh
# Vercel install/build entry for the MMO client (game/), called from the repo-root vercel.json.
#
# Vercel runs the install and build commands inside the project's *Root Directory* (a dashboard
# setting that has been `.`/`game`/`runtime/ability-matrix` at different times), serves
# `outputDirectory` relative to that same directory, and reads the repo-root vercel.json either way.
# vercel.json therefore walks up from wherever it was started until it finds game/package.json and
# calls this script, which builds game/ and mirrors game/dist into <cwd>/dist so `outputDirectory:
# "dist"` is right for every Root Directory setting. If the Root Directory is not `.` or `game`,
# "Include source files outside of the Root Directory" must be enabled in the Vercel dashboard
# (otherwise game/ is not on disk and the walk-up fails with a clear message).
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
start="$PWD"
case "${1:-}" in
  install)
    cd "$here/game" && npm ci --no-audit --no-fund
    ;;
  build)
    cd "$here/game" && npm run build
    if [ "$(pwd)" != "$(cd "$start" && pwd)" ]; then
      rm -rf "$start/dist" && mv "$here/game/dist" "$start/dist"
      echo "vercel-build: mirrored game/dist -> $start/dist"
    fi
    ;;
  *)
    echo "usage: tools/vercel-build.sh install|build" >&2; exit 2
    ;;
esac
