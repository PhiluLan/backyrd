#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_sha="${CI_BASE_SHA:-${BASE_SHA:-origin/main}}"
head_sha="${CI_HEAD_SHA:-${HEAD_SHA:-HEAD}}"

node "$repo_root/scripts/ci/validate-decision-change.mjs" \
  --base-sha "$base_sha" \
  --head-sha "$head_sha"

printf 'Decision scope guard passed: protected semantics use the generic release contract; unrelated changes require no recertification generation.\n'
