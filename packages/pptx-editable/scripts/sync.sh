#!/usr/bin/env sh
# Copy the exporter from a checkout of slidevjs/slidev PR #2722 into src/pptx.
#
# The copy is verbatim except for two mechanical rewrites, both reversible by
# eye when diffing against upstream:
#   1. relative imports get an explicit `.ts` extension, because Node's type
#      stripping resolves no extensions;
#   2. `walker.test.ts` reads the shipped walker from `dist`, which is three
#      levels up in the slidev monorepo and two here (see scripts/build.mjs).
set -eu

FORK="${SLIDEV_FORK:-$HOME/src/github/slidev}"
SRC="$FORK/packages/slidev/node/commands/pptx"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HERE/src/pptx"

[ -d "$SRC" ] || { echo "sync: $SRC not found; set SLIDEV_FORK" >&2; exit 1; }

rm -rf "$DEST"
mkdir -p "$DEST"
for f in "$SRC"/*.ts; do
  sed -E \
    -e "s#from '(\./[A-Za-z0-9_-]+)'#from '\1.ts'#g" \
    -e "s#'\.\./\.\./\.\./dist'#'../../dist'#g" \
    "$f" > "$DEST/$(basename "$f")"
done

git -C "$FORK" rev-parse HEAD > "$HERE/UPSTREAM"
echo "sync: $(ls "$DEST" | wc -l | tr -d ' ') files from $FORK at $(cat "$HERE/UPSTREAM")"
