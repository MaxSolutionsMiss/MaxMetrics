#!/usr/bin/env bash
# Publish the built site to `gh-pages`, which is the branch GitHub Pages serves.
#
# This used to be a GitHub Actions workflow. The organisation has no runners, so that
# workflow never ran — which meant the checks in it never ran either, and a deploy
# depended on nobody noticing that a queued job was queued forever. A script that runs on
# the machine of whoever is publishing is slower to type and honest about when it happened.
#
# It refuses to publish anything that has not passed the conformance rules and the parse
# check first. Those were the two useful things the workflow did and they are the two
# things worth keeping.
#
#   scripts/publish.sh              publish the working tree
#   scripts/publish.sh --dry-run    build and check, push nothing
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=false
[ "${1:-}" = "--dry-run" ] && DRY=true

echo "── Architecture rules"
node scripts/verify-maxmetrics.mjs

echo "── The shapes an export comes in"
node scripts/check-import.mjs

echo "── Every module parses"
find js -name '*.js' -print0 | xargs -0 -n1 node --check
echo "all modules parse."

echo "── Build"
node scripts/build-site.mjs

if $DRY; then
  echo "── Dry run, nothing pushed. The site is in _site/."
  exit 0
fi

SOURCE_REF="$(git rev-parse --abbrev-ref HEAD)"
SOURCE_SHA="$(git rev-parse --short=12 HEAD)"
WORKTREE=".gh-pages"

# A worktree rather than a branch switch: publishing must not touch the tree somebody is
# working in, and it must not care whether that tree is clean.
cleanup() { git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
rm -rf "$WORKTREE"

for attempt in 1 2 3 4 5; do
  if git fetch origin gh-pages 2>/dev/null; then break; fi
  if [ "$attempt" = 5 ]; then echo "Could not reach origin." >&2; exit 1; fi
  sleep $((2 ** attempt))
done

if git rev-parse --verify --quiet origin/gh-pages >/dev/null; then
  git worktree add "$WORKTREE" -B gh-pages origin/gh-pages >/dev/null
else
  # First publish. gh-pages carries a built site and none of this repository's history,
  # so it starts as an orphan rather than as a branch off main.
  git worktree add --detach "$WORKTREE" >/dev/null
  git -C "$WORKTREE" checkout --orphan gh-pages >/dev/null
  git -C "$WORKTREE" rm -rq --cached . 2>/dev/null || true
fi

find "$WORKTREE" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R _site/. "$WORKTREE"/

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "── The built site is identical to what is already published. Nothing to push."
  exit 0
fi

git -C "$WORKTREE" commit -q -m "Publish $SOURCE_SHA from $SOURCE_REF"

for attempt in 1 2 3 4 5; do
  if git -C "$WORKTREE" push -u origin gh-pages; then
    echo "── Published $SOURCE_SHA. GitHub Pages serves gh-pages; give it a minute."
    exit 0
  fi
  if [ "$attempt" = 5 ]; then echo "Push failed after five attempts." >&2; exit 1; fi
  sleep $((2 ** attempt))
done
