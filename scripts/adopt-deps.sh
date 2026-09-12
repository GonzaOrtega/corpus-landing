#!/usr/bin/env bash
set -euo pipefail

# Adopt a Dependabot branch so it can pass the five required checks.
#
# Two independent things stop a bot branch from going green on its own:
#
#   1. Dependabot updates package.json but not bun.lock, and all twelve install
#      sites in this repository are frozen (including vercel.json's
#      installCommand, which `vercel build` runs twice per pipeline). Every job
#      dies on "lockfile had changes, but lockfile is frozen" before it reaches
#      a single gate.
#   2. A Dependabot-triggered run reads secrets from the *Dependabot* store, not
#      the Actions store — the runner logs "Secret source: Dependabot". The
#      NEON_API_KEY and VERCEL_* secrets are therefore empty, so `test`,
#      `preview` and `lighthouse` fail even though the branch lives in this
#      repository and the fork guards never trip.
#
# Pushing the branch yourself fixes (2) for free: it makes you the triggering
# actor, so the Actions secrets are present. This script fixes (1) and verifies
# the branch locally before you spend a CI run on it.
#
# Usage:
#   bash scripts/adopt-deps.sh <remote-branch-name> [--push]
#
# Takes a branch name rather than a PR number so it needs no GitHub CLI auth.
# Without --push it stops after committing and prints the push command.

adopt_branch="${1:-}"
adopt_push="${2:-}"

if [ -z "$adopt_branch" ]; then
  echo "usage: bash scripts/adopt-deps.sh <remote-branch-name> [--push]" >&2
  echo "example: bash scripts/adopt-deps.sh dependabot/npm_and_yarn/npm-all-abc123" >&2
  exit 2
fi

adopt_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$adopt_root"

# A dirty tree would be swept into the sync commit below.
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is not clean. Commit or stash first." >&2
  exit 1
fi

# Read the pin before switching branches so the two values can be compared.
adopt_playwright_before=$(bun --print "require('./package.json').devDependencies['@playwright/test']")

git fetch origin "$adopt_branch"
git checkout -B "adopt/$adopt_branch" "origin/$adopt_branch"

adopt_playwright_after=$(bun --print "require('./package.json').devDependencies['@playwright/test']")

# The Playwright pin is load-bearing in three places at once, and
# tests/unit/e2e-runtime-config.test.ts asserts they agree. Syncing the lockfile
# is not enough: the GHCR image has to be republished before the tag can move,
# so this cannot be adopted in one step.
if [ "$adopt_playwright_before" != "$adopt_playwright_after" ]; then
  cat >&2 <<EOF
error: this branch changes @playwright/test ($adopt_playwright_before -> $adopt_playwright_after).

That is a coordinated three-step change, not a lockfile sync:
  1. bump the dependency and run bun install
  2. republish the runner image via the e2e-image workflow (workflow_dispatch)
  3. move the tag in BOTH docker/e2e.Dockerfile and .github/workflows/preview.yml

See "Upgrading Playwright" in docs/operations/preview-ci.md. Adopting this
branch without step 2 produces a green lockfile and a red e2e job.
EOF
  exit 1
fi

# Unfrozen, once — this is the whole point of the adoption.
bun install

# A second frozen install must now succeed, or the lockfile is still unsettled
# and CI would fail exactly where it failed before.
if ! bun install --frozen-lockfile; then
  echo "error: lockfile is still not settled after bun install." >&2
  exit 1
fi

if ! bun run check; then
  cat >&2 <<'EOF'
error: `bun run check` failed.

If the failures are formatting only, a linter minor changed its output: run
`bun run format` and include the result in this same commit, so no intermediate
commit leaves check red.
EOF
  exit 1
fi

bun run test

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to sync: bun.lock already matched package.json."
  echo "The branch still needs a push from you to pick up the Actions secrets."
  exit 0
fi

git add --all
git commit -m "chore(deps): sync bun.lock"

if [ "$adopt_push" = "--push" ]; then
  git push origin "adopt/$adopt_branch:$adopt_branch"
  echo
  echo "Pushed. You are now the triggering actor, so the Actions secrets apply."
else
  echo
  echo "Committed but not pushed. To adopt the branch, run:"
  echo "  git push origin adopt/$adopt_branch:$adopt_branch"
fi
