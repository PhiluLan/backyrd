#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
active_dir="$repo_root/supabase/migrations"
archive_dir="$repo_root/supabase/migration-archive/legacy-pre-baseline"
historical_operations="$repo_root/supabase/historical-data-operations.json"

required_versions=(
  20260411100101
  20260411100102
  20260411100103
  20260411100104
  20260411100105
  20260808120517
  20260808134000
  20260808134001
  20260808134002
  20260808134003
  20260808150044
)

fail() {
  printf 'migration validation failed: %s\n' "$*" >&2
  exit 1
}

test -d "$active_dir" || fail "missing supabase/migrations"
test -d "$archive_dir" || fail "missing legacy migration archive"
test -f "$historical_operations" || fail "missing historical data-operation manifest"
jq -e 'type == "array" and all(.[];
  (.version | test("^[0-9]{14}$")) and
  (.file | test("^[0-9]{14}_[a-z0-9_]+\\.sql$")) and
  (.sha256 | test("^[0-9a-f]{64}$")) and
  (.schema_reconciled_by | test("^[0-9]{14}_[a-z0-9_]+\\.sql$"))
)' "$historical_operations" >/dev/null \
  || fail "invalid historical data-operation manifest"

active_files=()
while IFS= read -r file; do
  active_files+=("$file")
done < <(find "$active_dir" -maxdepth 1 -type f -print | sort)
test "${#active_files[@]}" -gt 0 || fail "active migration chain is empty"

versions=()
for file in "${active_files[@]}"; do
  name="$(basename "$file")"
  [[ "$name" =~ ^([0-9]{14})_[a-z0-9_]+\.sql$ ]] \
    || fail "invalid active migration filename: $name"
  test ! -L "$file" || fail "active migration must not be a symlink: $name"
  versions+=("${BASH_REMATCH[1]}")
done

nested_entries=()
while IFS= read -r entry; do
  nested_entries+=("$entry")
done < <(find "$active_dir" -mindepth 1 -type d -print)
test "${#nested_entries[@]}" -eq 0 \
  || fail "nested directories are not allowed under supabase/migrations"

duplicates="$(printf '%s\n' "${versions[@]}" | sort | uniq -d)"
test -z "$duplicates" || fail "duplicate migration versions: $duplicates"

sorted_versions=()
while IFS= read -r version; do
  sorted_versions+=("$version")
done < <(printf '%s\n' "${versions[@]}" | sort)
for index in "${!required_versions[@]}"; do
  actual="${sorted_versions[$index]:-missing}"
  expected="${required_versions[$index]}"
  test "$actual" = "$expected" \
    || fail "canonical chain mismatch at position $((index + 1)): expected $expected, got $actual"
done

last_canonical="${required_versions[${#required_versions[@]} - 1]}"
for version in "${sorted_versions[@]:${#required_versions[@]}}"; do
  [[ "$version" > "$last_canonical" ]] \
    || fail "new forward migration $version must follow $last_canonical"
done

while IFS=$'\t' read -r version file expected_hash reconciliation; do
  test "${file%%_*}" = "$version" \
    || fail "historical operation version/file mismatch: $file"
  operation_path="$active_dir/$file"
  test -f "$operation_path" || fail "missing historical operation: $file"
  actual_hash="$(shasum -a 256 "$operation_path" | awk '{print $1}')"
  test "$actual_hash" = "$expected_hash" \
    || fail "historical operation bytes changed: $file"
  test -f "$active_dir/$reconciliation" \
    || fail "missing schema reconciliation for historical operation: $reconciliation"
  [[ "${reconciliation%%_*}" > "$version" ]] \
    || fail "schema reconciliation must follow historical operation: $file"
done < <(jq -r '.[] | [.version,.file,.sha256,.schema_reconciled_by] | @tsv' "$historical_operations")

printf 'Validated %s unique active migrations; canonical foundation is intact.\n' \
  "${#active_files[@]}"
"$repo_root/scripts/ci/validate-intelligence-population-automation-acl.sh"
