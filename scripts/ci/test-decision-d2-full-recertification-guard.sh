#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_head="$(git rev-parse HEAD)"
base_sha="$(git rev-parse "${CI_BASE_SHA:-origin/main}")"
case_root="$(mktemp -d /tmp/backyrd-d2-full-recert-guard.XXXXXX)"
trap 'rm -rf "$case_root"' EXIT

run_guard() {
  local repo="$1"
  (cd "$repo" && CI_BASE_SHA="$base_sha" bash scripts/ci/decision-d2-scope-guard.sh)
}

new_case() {
  local name="$1"
  local target="$case_root/$name"
  git clone --quiet "$repo_root" "$target"
  git -C "$target" checkout --quiet "$source_head"
  git -C "$target" config user.email gate3-guard@fixture.invalid
  git -C "$target" config user.name "Gate 3 Guard Fixture"
  printf '%s\n' "$target"
}

# Unchanged repository state must remain accepted.
(cd "$repo_root" && CI_BASE_SHA="$source_head" bash scripts/ci/decision-d2-scope-guard.sh >/dev/null)

# The complete current v11 re-certification must be admitted against its base.
run_guard "$repo_root" >/dev/null

engine_case="$(new_case engine-byte)"
printf '\n// one-byte-equivalent unauthorized guard mutation\n' >> "$engine_case/supabase/functions/decision-v13/index.ts"
git -C "$engine_case" add supabase/functions/decision-v13/index.ts
git -C "$engine_case" commit --quiet -m "test: unauthorized engine byte"
if run_guard "$engine_case" >/dev/null 2>&1; then
  echo "D2 full re-certification guard unexpectedly accepted Engine drift" >&2
  exit 1
fi

source_case="$(new_case new-source)"
printf 'export const unauthorized = true;\n' > "$source_case/packages/decision-orchestrator-runtime/src/unauthorized-source.mjs"
git -C "$source_case" add packages/decision-orchestrator-runtime/src/unauthorized-source.mjs
git -C "$source_case" commit --quiet -m "test: unauthorized source"
if run_guard "$source_case" >/dev/null 2>&1; then
  echo "D2 full re-certification guard unexpectedly accepted a new source" >&2
  exit 1
fi

identity_case="$(new_case production-identity)"
(cd "$identity_case" && node -e 'const fs=require("node:fs");const p="decision-lab/config/decision-v13-production-recertification-v11.json";const v=JSON.parse(fs.readFileSync(p,"utf8"));v.production.activeVersion=120;fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n")')
git -C "$identity_case" add decision-lab/config/decision-v13-production-recertification-v11.json
git -C "$identity_case" commit --quiet -m "test: changed Production identity"
if run_guard "$identity_case" >/dev/null 2>&1; then
  echo "D2 full re-certification guard unexpectedly accepted Production identity drift" >&2
  exit 1
fi

echo "D2 full re-certification guard regression: unchanged PASS; Engine drift FAIL; new source FAIL; Production identity drift FAIL; complete v11 re-certification PASS"
