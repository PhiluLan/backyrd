#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
# This isolated Web regression fixture starts at the authorized Offering /
# Purpose engine baseline, before the Consumer Web closure. Do not inherit
# CI_BASE_SHA: that variable identifies the PR target for the real guard and
# would silently replace this test's controlled input.
source_base="${DECISION_D2_WEB_CLOSURE_BASE_SHA:-dce92ef1379d7ab5140f7dc0813d8ee017933d4b}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

copy_at_revision() {
  local revision="$1"
  local path="$2"
  mkdir -p "$tmp/$(dirname "$path")"
  if git -C "$repo_root" cat-file -e "$revision:$path" 2>/dev/null; then
    git -C "$repo_root" show "$revision:$path" > "$tmp/$path"
  else
    rm -f "$tmp/$path"
  fi
}

git -C "$tmp" init -q
git -C "$tmp" config user.email ci@backyrd.invalid
git -C "$tmp" config user.name "Backyrd CI"

tracked_paths=(
  'supabase/functions/decision-v13/index.ts'
  'web/app/decision/page.tsx'
  'web/app/settings/decision-history/page.tsx'
  'web/components/consumer/decision-experience.tsx'
  'web/lib/decision-web-api.ts'
  'web/docs/WEB_PRODUCT_CONTRACT_MATRIX.md'
  'web/tests/consumer-contracts.test.mjs'
)
for path in "${tracked_paths[@]}"; do copy_at_revision "$source_base" "$path"; done
git -C "$tmp" add -A
git -C "$tmp" commit -qm baseline
base="$(git -C "$tmp" rev-parse HEAD)"

for path in "${tracked_paths[@]}"; do copy_at_revision HEAD "$path"; done
mkdir -p "$tmp/scripts/ci"
cp "$repo_root/scripts/ci/decision-d2-scope-guard.sh" "$tmp/scripts/ci/decision-d2-scope-guard.sh"
git -C "$tmp" add -A
git -C "$tmp" commit -qm closure
accepted="$(git -C "$tmp" rev-parse HEAD)"

run_guard() {
  (cd "$tmp" && CI_BASE_SHA="$base" bash scripts/ci/decision-d2-scope-guard.sh)
}
expect_fail() {
  local label="$1"
  if run_guard >/dev/null 2>&1; then
    echo "D2 Web closure guard regression: expected FAIL for $label"
    exit 1
  fi
  echo "D2 Web closure guard regression: $label -> blocked"
}

run_guard >/dev/null
echo "D2 Web closure guard regression: unchanged reviewed files -> accepted"

git -C "$tmp" checkout -q "$accepted"
printf '\n' >> "$tmp/web/app/decision/page.tsx"
git -C "$tmp" add web/app/decision/page.tsx
git -C "$tmp" commit -qm one-byte-change
expect_fail 'one-byte change'

git -C "$tmp" checkout -q "$accepted"
mkdir -p "$tmp/web/app/decision-adjacent"
printf 'export default function DecisionAdjacent() { return null; }\n' > "$tmp/web/app/decision-adjacent/page.tsx"
git -C "$tmp" add web/app/decision-adjacent/page.tsx
git -C "$tmp" commit -qm fifth-path
expect_fail 'new fifth Decision-adjacent Web path'

git -C "$tmp" checkout -q "$accepted"
printf '\n' >> "$tmp/supabase/functions/decision-v13/index.ts"
git -C "$tmp" add supabase/functions/decision-v13/index.ts
git -C "$tmp" commit -qm engine-change
expect_fail 'decision-v13 change'

echo "D2 Web closure guard regression: all cases passed"
