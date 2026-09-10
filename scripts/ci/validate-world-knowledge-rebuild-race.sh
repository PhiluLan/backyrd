#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL is required}"

race_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-world-rebuild-race.XXXXXX")"
cleanup() {
  case "$race_root" in
    "${TMPDIR:-/tmp}"/backyrd-world-rebuild-race.*|/tmp/backyrd-world-rebuild-race.*) rm -rf "$race_root" ;;
    *) printf 'Refusing to remove unexpected race-test path: %s\n' "$race_root" >&2 ;;
  esac
}
trap cleanup EXIT

spot_id='ec000000-0000-4000-8000-000000000001'
as_of="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command 'select clock_timestamp();')"

psql "$DB_URL" -X --set ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.spots(id,name,lat,lng,status,city,data_origin)
values('$spot_id','Concurrent synthetic',47.4,8.4,'approved','Zürich','TEST');
SQL

run_rebuild() {
  local label="$1"
  psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --command "select public.world_shadow_rebuild_spot_v1('$spot_id','$as_of','FULL','parallel-identical');" \
    >"$race_root/$label.json" 2>"$race_root/$label.err"
}

run_rebuild first & pid_first=$!
run_rebuild second & pid_second=$!
wait "$pid_first"
wait "$pid_second"

manifest_first="$(jq -r '.manifestHash' "$race_root/first.json")"
manifest_second="$(jq -r '.manifestHash' "$race_root/second.json")"
input_first="$(jq -r '.inputHash' "$race_root/first.json")"
input_second="$(jq -r '.inputHash' "$race_root/second.json")"
reused_count="$(jq -s '[.[] | select(.reused == true)] | length' "$race_root/first.json" "$race_root/second.json")"
job_count="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from world_knowledge_private.rebuild_jobs where idempotency_key='parallel-identical';")"

test "$manifest_first" = "$manifest_second"
test "$input_first" = "$input_second"
test "$reused_count" = 1
test "$job_count" = 1

printf 'World Knowledge parallel rebuild idempotency passed.\n'
