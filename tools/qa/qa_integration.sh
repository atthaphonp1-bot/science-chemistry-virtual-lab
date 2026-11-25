#!/bin/bash
# Integration QA for the site build scripts. Works on a COPY of the repo, never touches the worktree.
#  1. build_curriculum.py + inject_site_meta.py must be idempotent (running them changes nothing)
#  2. how many ids Code.gs gained vs git HEAD       3. both scripts parse (python ast)
#  4. every relative href card target in index.html exists
# usage: tools/qa/qa_integration.sh        exit 1 on FAIL
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT" || exit 2
TMP="$(mktemp -d "${TMPDIR:-/tmp}/qa-integ.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
FAILS=0
ok()   { echo "  PASS  $*"; }
bad()  { echo "  FAIL  $*"; FAILS=$((FAILS+1)); }
note() { echo "  INFO  $*"; }

rsync -a --exclude .git --exclude '.claude/worktrees' --exclude 'คู่มืออ้างอิง-สสวท' ./ "$TMP/" || { echo "rsync failed"; exit 2; }

echo "== 3. syntax of the build scripts"
for s in tools/build_curriculum.py tools/inject_site_meta.py; do
  if python3 -c "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf8').read())" "$s" 2> "$TMP/.ast.err"; then ok "ast.parse $s"; else bad "ast.parse $s: $(tail -1 "$TMP/.ast.err")"; fi
done

echo "== 1. idempotency (build_curriculum.py && inject_site_meta.py on a copy)"
if ! ( cd "$TMP" && python3 tools/build_curriculum.py > "$TMP/.build.log" 2>&1 && python3 tools/inject_site_meta.py >> "$TMP/.build.log" 2>&1 ); then
  bad "scripts exited non-zero: $(tail -3 "$TMP/.build.log" | tr '\n' ' ')"
else
  ok "scripts ran ($(tail -1 "$TMP/.build.log" | cut -c1-80))"
fi
DIFF="$(diff -rq -x .git -x '.claude' -x 'คู่มืออ้างอิง-สสวท' -x '.build.log' -x '.ast.err' "$ROOT" "$TMP" 2>&1)"
if [ -z "$DIFF" ]; then ok "no file differs after running both scripts (idempotent)"
else bad "NON-IDEMPOTENT: $(echo "$DIFF" | wc -l | tr -d ' ') file(s) differ"; echo "$DIFF" | head -20 | sed 's/^/        /'; fi

echo "== 2. Code.gs ids vs git HEAD"
python3 - "$TMP/tools/apps_script/Code.gs" "$ROOT" <<'PY'
import re, subprocess, sys
def ids(t):
    a, b = t.find('// ids:start'), t.find('// ids:end')
    out = {}
    for line in t[a:b].splitlines():
        m = re.match(r'\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$', line)
        if m: out[m.group(1)] = m.group(2)
    return out
new = ids(open(sys.argv[1], encoding='utf8').read())
try:
    old = ids(subprocess.run(['git', '-C', sys.argv[2], 'show', 'HEAD:tools/apps_script/Code.gs'], capture_output=True, text=True, check=True).stdout)
except Exception as e:
    print('  WARN  cannot read HEAD Code.gs:', e); sys.exit(0)
added = sorted(set(new) - set(old)); gone = sorted(set(old) - set(new)); chg = sorted(k for k in old if k in new and old[k] != new[k])
print(f'  INFO  Code.gs after rebuild: {len(new)} ids; HEAD: {len(old)} ids; gained {len(added)}, lost {len(gone)}, retitled {len(chg)}')
if added: print('        gained:', ', '.join(added[:12]) + (' ...' if len(added) > 12 else ''))
if gone: print('  WARN  lost ids:', ', '.join(gone[:12]))
if chg: print('  WARN  retitled ids:', ', '.join(chg[:12]))
PY

echo "== 4. index.html card targets exist (cards are built by JS: href:'...' literals, plus static href= attributes)"
python3 - "$TMP" <<'PY' || FAILS=$((FAILS+1))
import os, re, sys, urllib.parse
root = sys.argv[1]
srcs = [os.path.join(root, 'index.html'), os.path.join(root, 'assets', 'curriculum-m1v2.js')]
refs = set()
for f in srcs:
    if not os.path.exists(f): continue
    t = open(f, encoding='utf8').read()
    refs.update(re.findall(r"href\s*[:=]\s*['\"]([^'\"$`]+)['\"]", t))                       # href:'x.html' / href="x.html"
    refs.update(re.findall(r"['\"]([\w./%-]+\.html(?:#[\w.%-]*)?)['\"]", t))              # any quoted *.html literal
missing, bad_anchor, n = [], [], 0
for h in sorted(refs):
    if re.match(r'^(https?:|mailto:|tel:|#|javascript:|data:)', h): continue
    p = urllib.parse.unquote(h.split('#')[0].split('?')[0])
    if not p: continue
    n += 1
    full = os.path.join(root, p)
    if not os.path.exists(full): missing.append(h); continue
    m = re.match(r'.*#act-([\w.]+)$', h)
    if m and full.endswith('.html'):
        tgt = open(full, encoding='utf8').read()
        acts = re.search(r"const ACTS=\[([^\]]*)\]", tgt)
        if acts and m.group(1) not in re.findall(r"'([^']+)'", acts.group(1)): bad_anchor.append(h)
if missing:
    print(f'  FAIL  {len(missing)}/{n} target(s) missing: ' + ', '.join(missing[:10])); sys.exit(1)
if bad_anchor:
    print(f'  FAIL  {len(bad_anchor)} deep link(s) point at an unknown tab id: ' + ', '.join(bad_anchor[:10])); sys.exit(1)
print(f'  PASS  all {n} page targets referenced by index.html / curriculum js exist (deep-link tab ids checked)')
PY

echo
if [ "$FAILS" -gt 0 ]; then echo "INTEGRATION: $FAILS FAIL"; exit 1; fi
echo "INTEGRATION: all PASS"
