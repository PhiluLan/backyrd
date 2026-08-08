#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

fail() {
  printf 'repository sanity failed: %s\n' "$*" >&2
  exit 1
}

"$repo_root/scripts/ci/validate-migrations.sh"

tracked_audit="$(git ls-files .local-audit)"
test -z "$tracked_audit" \
  || fail ".local-audit must remain untracked"

base_sha="${CI_BASE_SHA:-${1:-}}"
if test -z "$base_sha" \
  || [[ "$base_sha" =~ ^0+$ ]] \
  || ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  base_sha="$(git rev-parse HEAD^ 2>/dev/null || git rev-parse HEAD)"
fi

added_files=()
while IFS= read -r path; do
  added_files+=("$path")
done < <(git diff --diff-filter=A --name-only "$base_sha" HEAD)
bad_backups=()
for path in "${added_files[@]}"; do
  if [[ "$path" =~ ^(mobile|web|admin-dashboard|packages/shared|supabase/functions)/ ]] \
    && [[ "$path" =~ (\.backup|\.before-|/(backup|backups)/) ]]; then
    bad_backups+=("$path")
  fi
done

if test "${#bad_backups[@]}" -gt 0; then
  printf 'New backup artifacts in active runtime paths:\n' >&2
  printf '  %s\n' "${bad_backups[@]}" >&2
  fail "use Git history instead of backup files"
fi

printf 'Repository sanity passed against base %s.\n' "$base_sha"
