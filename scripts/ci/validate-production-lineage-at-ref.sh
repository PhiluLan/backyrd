#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
target_sha="${PRODUCTION_LINEAGE_TARGET_SHA:-HEAD}"
pr_head_sha="${PRODUCTION_LINEAGE_PR_HEAD_SHA:-}"

fail() {
  printf 'Production lineage target validation failed: %s\n' "$1" >&2
  exit 1
}

git -C "$repo_root" cat-file -e "$target_sha^{commit}" 2>/dev/null \
  || fail "target commit is unavailable: $target_sha"
git -C "$repo_root" merge-base --is-ancestor "$target_sha" HEAD \
  || fail "target commit is not an ancestor of the reviewed HEAD: $target_sha"

validation_mode="base"
if test -n "$pr_head_sha"; then
  git -C "$repo_root" cat-file -e "$pr_head_sha^{commit}" 2>/dev/null \
    || fail "PR head commit is unavailable: $pr_head_sha"
  test "$(git -C "$repo_root" rev-parse "$pr_head_sha^{commit}")" = \
    "$(git -C "$repo_root" rev-parse HEAD^{commit})" \
    || fail "PR head does not match the reviewed checkout"
  target_plan="$(node "$repo_root/scripts/ci/resolve-production-lineage-target.mjs" \
    --base-sha "$target_sha" \
    --head-sha "$pr_head_sha")"
  validation_mode="$(jq -r '.mode' <<<"$target_plan")"
  target_sha="$(jq -r '.targetSha' <<<"$target_plan")"
fi

target_commit="$(git -C "$repo_root" rev-parse "$target_sha^{commit}")"
head_commit="$(git -C "$repo_root" rev-parse HEAD^{commit})"

if test "$target_commit" = "$head_commit"; then
  exec "$repo_root/scripts/ci/validate-production-lineage.sh"
fi

checkout_parent="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-production-lineage.XXXXXX")"
checkout="$checkout_parent/base"

cleanup() {
  git -C "$repo_root" worktree remove --force "$checkout" >/dev/null 2>&1 || true
  rmdir "$checkout_parent" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git -C "$repo_root" worktree add --quiet --detach "$checkout" "$target_commit"
test -x "$checkout/scripts/ci/validate-production-lineage.sh" \
  || fail "target commit does not contain the executable lineage validator"

"$checkout/scripts/ci/validate-production-lineage.sh"
if test "$validation_mode" = base; then
  printf 'Shipped Product lineage validated against exact reviewed base %s.\n' "$target_commit"
else
  printf 'Shipped Product lineage validated in candidate mode against exact reviewed target %s.\n' \
    "$target_commit"
fi
