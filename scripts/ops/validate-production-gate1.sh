#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
expected_project_ref="hjgcrrzfjchzqoegcywn"

fail() {
  printf 'Production Gate-1 sanity failed: %s\n' "$*" >&2
  exit 1
}

test "${BACKYRD_PRODUCTION_PROJECT_REF:-}" = "$expected_project_ref" \
  || fail 'BACKYRD_PRODUCTION_PROJECT_REF does not name the audited project'
: "${BACKYRD_PRODUCTION_DB_URL:?Set BACKYRD_PRODUCTION_DB_URL without storing it in the repository or shell history}"

export PGCONNECT_TIMEOUT=10

remote_versions="$(mktemp "${TMPDIR:-/tmp}/backyrd-production-versions.XXXXXX")"
local_versions="$(mktemp "${TMPDIR:-/tmp}/backyrd-local-versions.XXXXXX")"
cleanup() {
  rm -f "$remote_versions" "$local_versions"
}
trap cleanup EXIT

find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '*.sql' \
  -exec basename {} \; | sed -E 's/^([0-9]{14})_.*/\1/' | sort > "$local_versions"
psql "$BACKYRD_PRODUCTION_DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --command 'select version from supabase_migrations.schema_migrations order by version;' \
  > "$remote_versions"
diff -u "$local_versions" "$remote_versions" \
  || fail 'repository and Production migration ledgers differ'

psql "$BACKYRD_PRODUCTION_DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$repo_root/scripts/ops/production-gate1-sanity.sql"

expected_acl_fingerprint="$(tr -d '[:space:]' < "$repo_root/supabase/canonical/public-acl.sha256")"
actual_acl_fingerprint="$(psql "$BACKYRD_PRODUCTION_DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --file "$repo_root/scripts/ci/public-acl-fingerprint.sql")"
test "$actual_acl_fingerprint" = "$expected_acl_fingerprint" \
  || fail 'Production public ACL fingerprint differs from the canonical contract'

printf 'Production Gate-1 read-only sanity passed.\n'
