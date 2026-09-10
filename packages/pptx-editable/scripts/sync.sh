#!/usr/bin/env bash
# Copy the exporter from a checkout of slidevjs/slidev PR #2722 into src/pptx.
#
# The copy is verbatim except for two mechanical rewrites, both reversible by
# eye when diffing against upstream:
#   1. relative imports without an extension get `.ts`, and `.js` specifiers
#      that name TypeScript sources become `.ts`, because Node's type
#      stripping resolves no extensions and rewrites nothing;
#   2. `walker.test.ts` reads the shipped walker from `dist`, which is three
#      levels up in the slidev monorepo and two here (see scripts/build.mjs).
set -euo pipefail

FORK="${SLIDEV_FORK:-$HOME/src/github/slidev}"
SRC="$FORK/packages/slidev/node/commands/pptx"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HERE/src/pptx"

[ -d "$SRC" ] || { echo "sync: $SRC not found; set SLIDEV_FORK" >&2; exit 1; }
[ -n "$(find "$SRC" -name '*.ts' -print -quit)" ] || { echo "sync: no .ts files under $SRC" >&2; exit 1; }

# UPSTREAM must name a commit that holds exactly the copied bytes and that
# other people can fetch.
if [ -n "$(git -C "$FORK" status --porcelain -- "$SRC")" ]; then
  echo "sync: $SRC has uncommitted changes; commit or stash them so UPSTREAM is accurate" >&2
  exit 1
fi
if [ -z "$(git -C "$FORK" branch -r --contains HEAD)" ] && [ -z "${SYNC_ALLOW_UNPUSHED:-}" ]; then
  echo "sync: the fork's HEAD is on no remote branch; push it first, or set SYNC_ALLOW_UNPUSHED=1" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
# Subdirectories are copied too, so an upstream reorganisation is not dropped
# silently. Process substitution keeps the loop in this shell, so `set -e`
# still aborts on a failure inside it.
while IFS= read -r -d '' f; do
  mkdir -p "$DEST/$(dirname "$f")"
  sed -E \
    -e "s#(from |import\()'(\.\.?/[A-Za-z0-9_/-]+)'#\1'\2.ts'#g" \
    -e "s#(from |import\()'(\.\.?/[^']+)\.js'#\1'\2.ts'#g" \
    -e "s#'\.\./\.\./\.\./dist'#'../../dist'#g" \
    "$SRC/$f" > "$DEST/$f"
done < <(cd "$SRC" && find . -name '*.ts' -print0)

# Node loads the copy without a bundler, so every relative specifier needs an
# extension it understands.
if grep -rnE "(from |import\()'\.\.?/[^']*'" "$DEST" | grep -vE "\.(ts|json)'"; then
  echo "sync: relative import(s) above lack a .ts or .json extension; extend the rewrite in $0" >&2
  exit 1
fi

git -C "$FORK" rev-parse HEAD > "$HERE/UPSTREAM"
echo "sync: $(find "$DEST" -name '*.ts' | wc -l | tr -d ' ') files from $FORK at $(cat "$HERE/UPSTREAM")"
