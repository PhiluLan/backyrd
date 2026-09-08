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
  base_commit="$(git -C "$repo_root" rev-parse "$target_sha^{commit}")"
  pr_head_commit="$(git -C "$repo_root" rev-parse "$pr_head_sha^{commit}")"
  reviewed_commit="$(git -C "$repo_root" rev-parse HEAD^{commit})"
  if test "$reviewed_commit" != "$pr_head_commit"; then
    read -r merge_commit first_parent second_parent extra_parent <<< \
      "$(git -C "$repo_root" rev-list --parents -n 1 HEAD)"
    test "$merge_commit" = "$reviewed_commit" && \
      test "$first_parent" = "$base_commit" && \
      test "$second_parent" = "$pr_head_commit" && \
      test -z "${extra_parent:-}" \
      || fail "reviewed checkout is not the exact PR head or its exact base/head synthetic merge"
  fi
  git -C "$repo_root" merge-base --is-ancestor "$base_commit" "$pr_head_commit" \
    || fail "exact PR head does not descend from exact PR base"
  target_plan="$(node "$repo_root/scripts/ci/resolve-production-lineage-target.mjs" \
    --base-sha "$base_commit" \
    --head-sha "$pr_head_commit")"
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
