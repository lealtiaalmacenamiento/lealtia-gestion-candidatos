#!/usr/bin/env bash
set -euo pipefail

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CUR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# If previous SHA is missing or invalid, do not ignore (force build)
if [[ -z "$PREV" ]]; then
  echo "ignore: no previous SHA -> build"
  exit 1
fi
if ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  echo "ignore: previous SHA not found -> build"
  exit 1
fi

echo "ignore: diff $PREV..$CUR"
if git diff --quiet "$PREV" "$CUR" -- src public next.config.mjs package.json tsconfig.json eslint.config.mjs; then
  echo "ignore: no relevant changes -> skip build"
  exit 0
else
  echo "ignore: changes detected -> build"
  exit 1
fi
