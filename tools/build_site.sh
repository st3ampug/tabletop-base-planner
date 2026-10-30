#!/usr/bin/env bash
# Build the whole Pages site: main at the root, every other remote branch at preview/<branch>/.
# Usage: bash tools/build_site.sh OUTDIR   (run from a main checkout with the remote branches fetched)
# A branch that fails to build is skipped with a warning, so it can't block the live page.
set -euo pipefail
out=$1; wt=$(mktemp -d)
python3 tools/build.py "$out"
rm -f "$out"/*.page.html
mkdir -p "$out/preview"; items=""
for ref in $(git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin); do
  case "$ref" in main|HEAD) continue ;; esac
  dir=${ref//\//-}
  git worktree add -q --detach "$wt/$dir" "origin/$ref"
  if python3 "$wt/$dir/tools/build.py" "$out/preview/$dir"; then
    rm -f "$out/preview/$dir"/*.page.html
    items="$items<li><a href=\"$dir/\">$ref</a></li>"
  else
    echo "::warning::branch $ref did not build; no preview for it"; rm -rf "$out/preview/$dir"
  fi
  git worktree remove --force "$wt/$dir"
done
cat > "$out/preview/index.html" <<HTML
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Branch previews</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:24px 16px;max-width:640px}</style></head>
<body><h1>Branch previews</h1><p>Each branch pushed to GitHub, built as it would look live. <a href="../">The live page</a></p>
<ul>${items:-<li>No branches besides main.</li>}</ul></body></html>
HTML
echo "site built in $out"
