#!/usr/bin/env bash
set -euo pipefail

while IFS= read -r -d '' script; do
  bash -n "$script"
done < <(find labs -type f -path '*/scripts/*.sh' -print0)

while IFS= read -r -d '' script; do
  python3 -c 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(), filename=sys.argv[1])' "$script"
done < <(find labs -type f -path '*/scripts/*.py' -print0)

echo "Validated lab helper script syntax."
