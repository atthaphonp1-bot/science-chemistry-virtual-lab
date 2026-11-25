#!/bin/bash
# Run the QA harness on many pages (default: all chemistry-*.html), 3 in parallel; print a page x check table.
# usage: tools/qa/run_all.sh [--warn] [page.html ...]      exit 1 if any FAIL
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SHOW=""
PAGES=()
for a in "$@"; do
  if [ "$a" = "--warn" ]; then SHOW="--warn"; else PAGES+=("$a"); fi
done
if [ ${#PAGES[@]} -eq 0 ]; then
  for f in "$ROOT"/chemistry-*.html; do PAGES+=("$f"); done
fi
OUT="$(mktemp -d "${TMPDIR:-/tmp}/qa-run.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT
BATCH="${QA_BATCH:-3}"
i=0
for p in "${PAGES[@]}"; do
  b="$(basename "$p" .html)"
  ( node "$HERE/qa_page.mjs" "$p" --json > "$OUT/$b.json" 2> "$OUT/$b.err" ) &
  i=$((i+1))
  if [ $((i % BATCH)) -eq 0 ]; then wait; fi
done
wait
node "$HERE/lib/table.mjs" "$OUT" $SHOW
