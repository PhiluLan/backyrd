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

same_key_spot='ec000000-0000-4000-8000-000000000001'
cross_key_spot='ec000000-0000-4000-8000-000000000002'
ordered_spot='ec000000-0000-4000-8000-000000000003'
as_of="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command 'select clock_timestamp();')"
older_as_of="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select ('$as_of'::timestamptz - interval '10 seconds');")"

psql "$DB_URL" -X --set ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.spots(id,name,lat,lng,status,city,data_origin)
values
  ('$same_key_spot','Concurrent same-key synthetic',47.4,8.4,'approved','Zürich','TEST'),
  ('$cross_key_spot','Concurrent cross-key synthetic',47.5,8.5,'approved','Zürich','TEST'),
  ('$ordered_spot','Concurrent ordered synthetic',47.6,8.6,'approved','Zürich','TEST');
SQL

run_rebuild() {
  local spot_id="$1"
  local requested_as_of="$2"
  local idempotency_key="$3"
  local label="$4"
  psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --command "select public.world_shadow_rebuild_spot_v1('$spot_id','$requested_as_of','FULL','$idempotency_key');" \
    >"$race_root/$label.json" 2>"$race_root/$label.err"
}

# Case A: one request identity, one execution and one exact replay.
run_rebuild "$same_key_spot" "$as_of" parallel-identical same-first & pid_first=$!
run_rebuild "$same_key_spot" "$as_of" parallel-identical same-second & pid_second=$!
wait "$pid_first"
wait "$pid_second"

manifest_first="$(jq -r '.manifestHash' "$race_root/same-first.json")"
manifest_second="$(jq -r '.manifestHash' "$race_root/same-second.json")"
input_first="$(jq -r '.inputHash' "$race_root/same-first.json")"
input_second="$(jq -r '.inputHash' "$race_root/same-second.json")"
resolution_first="$(jq -r '.resolutionHash' "$race_root/same-first.json")"
resolution_second="$(jq -r '.resolutionHash' "$race_root/same-second.json")"
reused_count="$(jq -s '[.[] | select(.reused == true)] | length' "$race_root/same-first.json" "$race_root/same-second.json")"
job_count="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from world_knowledge_private.rebuild_jobs where idempotency_key='parallel-identical';")"
manifest_count="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from world_knowledge_private.resolution_manifests where spot_id='$same_key_spot';")"

test "$manifest_first" = "$manifest_second"
test "$input_first" = "$input_second"
test "$resolution_first" = "$resolution_second"
test "$reused_count" = 1
test "$job_count" = 1
test "$manifest_count" = 1

# Case B: different request identities converge on one semantic manifest.
run_rebuild "$cross_key_spot" "$as_of" parallel-cross-key-first cross-first & pid_first=$!
run_rebuild "$cross_key_spot" "$as_of" parallel-cross-key-second cross-second & pid_second=$!
wait "$pid_first"
wait "$pid_second"

cross_manifest_first="$(jq -r '.manifestHash' "$race_root/cross-first.json")"
cross_manifest_second="$(jq -r '.manifestHash' "$race_root/cross-second.json")"
cross_input_first="$(jq -r '.inputHash' "$race_root/cross-first.json")"
cross_input_second="$(jq -r '.inputHash' "$race_root/cross-second.json")"
cross_resolution_first="$(jq -r '.resolutionHash' "$race_root/cross-first.json")"
cross_resolution_second="$(jq -r '.resolutionHash' "$race_root/cross-second.json")"
cross_manifest_reused_count="$(jq -s '[.[] | select(.manifestReused == true)] | length' "$race_root/cross-first.json" "$race_root/cross-second.json")"
cross_job_proof="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*)||':'||count(distinct manifest_id)||':'||count(*) filter(where status='SUCCEEDED') from world_knowledge_private.rebuild_jobs where idempotency_key in ('parallel-cross-key-first','parallel-cross-key-second');")"
cross_manifest_count="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from world_knowledge_private.resolution_manifests where spot_id='$cross_key_spot';")"
cross_pointer_manifest="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select m.manifest_hash from world_knowledge_private.current_projection_pointers p join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id where p.spot_id='$cross_key_spot';")"

test "$cross_manifest_first" = "$cross_manifest_second"
test "$cross_input_first" = "$cross_input_second"
test "$cross_resolution_first" = "$cross_resolution_second"
test "$cross_manifest_reused_count" = 1
test "$cross_job_proof" = '2:1:2'
test "$cross_manifest_count" = 1
test "$cross_pointer_manifest" = "$cross_manifest_first"

# Case C: genuinely different semantic times retain separate identities while the
# per-Spot current pointer deterministically remains on the newer result.
run_rebuild "$ordered_spot" "$older_as_of" parallel-ordered-old ordered-old & pid_first=$!
run_rebuild "$ordered_spot" "$as_of" parallel-ordered-new ordered-new & pid_second=$!
wait "$pid_first"
wait "$pid_second"

ordered_old_input="$(jq -r '.inputHash' "$race_root/ordered-old.json")"
ordered_new_input="$(jq -r '.inputHash' "$race_root/ordered-new.json")"
ordered_old_manifest="$(jq -r '.manifestHash' "$race_root/ordered-old.json")"
ordered_new_manifest="$(jq -r '.manifestHash' "$race_root/ordered-new.json")"
ordered_job_proof="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*)||':'||count(distinct manifest_id)||':'||count(*) filter(where status='SUCCEEDED') from world_knowledge_private.rebuild_jobs where idempotency_key in ('parallel-ordered-old','parallel-ordered-new');")"
ordered_manifest_count="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from world_knowledge_private.resolution_manifests where spot_id='$ordered_spot';")"
ordered_pointer_manifest="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select m.manifest_hash from world_knowledge_private.current_projection_pointers p join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id where p.spot_id='$ordered_spot';")"

test "$ordered_old_input" != "$ordered_new_input"
test "$ordered_old_manifest" != "$ordered_new_manifest"
test "$ordered_job_proof" = '2:2:2'
test "$ordered_manifest_count" = 2
test "$ordered_pointer_manifest" = "$ordered_new_manifest"

printf 'World Knowledge parallel rebuild cases A/B/C passed.\n'
