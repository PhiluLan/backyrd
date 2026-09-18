#!/usr/bin/env bash
set -euo pipefail
: "${DB_URL:?DB_URL is required}"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-founder-idem-race.XXXXXX")"
cleanup() { case "$work_dir" in "${TMPDIR:-/tmp}"/backyrd-founder-idem-race.*|/tmp/backyrd-founder-idem-race.*) rm -rf "$work_dir" ;; *) return 1 ;; esac; }
trap cleanup EXIT

envelope='{"response":{"status":"EVALUATION_ONLY"}}'
response_hash="$(printf '%s' "$envelope" | shasum -a 256 | cut -d' ' -f1)"
call_sql() {
  local payload="$1" output="$2"
  psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --command "set request.jwt.claims='{\"role\":\"service_role\"}'; select public.backyrd_founder_live_idempotency_commit_v1('backyrd.founder-live.idempotency-scope@1.0','FOUNDER_LIVE_READ_ONLY_EVALUATION','$(printf 'a%.0s' {1..64})','$(printf 'b%.0s' {1..64})','$payload','backyrd.decision-vnext.founder-live-execution@1.0','$(printf 'd%.0s' {1..64})','$(printf 'e%.0s' {1..64})','$(printf 'f%.0s' {1..64})','$envelope','$response_hash',86400)->>'status';" >"$output"
}

payload_a="$(printf 'c%.0s' {1..64})"
payload_b="$(printf '0%.0s' {1..64})"
for index in 1 2 3 4 5 6; do call_sql "$payload_a" "$work_dir/same-$index" & done
wait
test "$(grep -hE '^(CREATED|REPLAYED)$' "$work_dir"/same-* | wc -l | tr -d ' ')" = 6
test "$(grep -h '^CREATED$' "$work_dir"/same-* | wc -l | tr -d ' ')" = 1
test "$(grep -h '^REPLAYED$' "$work_dir"/same-* | wc -l | tr -d ' ')" = 5

for index in 1 2 3; do call_sql "$payload_a" "$work_dir/replay-$index" & done
for index in 1 2 3; do call_sql "$payload_b" "$work_dir/conflict-$index" & done
wait
test "$(grep -h '^REPLAYED$' "$work_dir"/replay-* | wc -l | tr -d ' ')" = 3
test "$(grep -h '^CONFLICT$' "$work_dir"/conflict-* | wc -l | tr -d ' ')" = 3
test "$(psql "$DB_URL" -X --tuples-only --no-align --command "select count(*) from founder_live_private.idempotency_records_v1 where subject_digest='$(printf 'a%.0s' {1..64})' and idempotency_key_digest='$(printf 'b%.0s' {1..64})';")" = 1
printf 'Founder Live idempotency multi-connection create/replay/conflict race passed.\n'
