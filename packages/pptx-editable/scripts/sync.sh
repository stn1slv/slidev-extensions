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
[ -n "$(find "$SRC" -name '*.ts' -print -quit)" ] || { echo "sync: no .ts files under $SRC" >&2; exit 1; }

# UPSTREAM must name the commit the copied bytes came from.
if [ -n "$(git -C "$FORK" status --porcelain -- packages/slidev/node/commands/pptx)" ]; then
  echo "sync: $SRC has uncommitted changes; commit or stash them so UPSTREAM is accurate" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
# Subdirectories are copied too, so an upstream reorganisation is not dropped silently.
(cd "$SRC" && find . -name '*.ts' -print0) | while IFS= read -r -d '' f; do
  mkdir -p "$DEST/$(dirname "$f")"
  sed -E \
    -e "s#from '(\.\.?/[A-Za-z0-9_./-]+)'#from '\1.ts'#g" \
    -e "s#\.ts\.ts'#.ts'#g" \
    -e "s#'\.\./\.\./\.\./dist'#'../../dist'#g" \
    "$SRC/$f" > "$DEST/$f"
done

# Node loads the copy without a bundler, so every relative import needs an extension.
if grep -rnE "from '\.\.?/[^']*[^s]'|from '\.\.?/[^']*[^t]s'" "$DEST" | grep -vE "\.(ts|js|json)'"; then
  echo "sync: relative import(s) without an extension above; extend the rewrite in $0" >&2
  exit 1
fi

git -C "$FORK" rev-parse HEAD > "$HERE/UPSTREAM"
echo "sync: $(find "$DEST" -name '*.ts' | wc -l | tr -d ' ') files from $FORK at $(cat "$HERE/UPSTREAM")"
