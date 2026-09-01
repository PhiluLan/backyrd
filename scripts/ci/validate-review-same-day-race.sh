#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL is required}"

race_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-review-race.XXXXXX")"
cleanup() {
  case "$race_root" in
    "${TMPDIR:-/tmp}"/backyrd-review-race.*|/tmp/backyrd-review-race.*) rm -rf "$race_root" ;;
    *) printf 'Refusing to remove unexpected race-test path: %s\n' "$race_root" >&2 ;;
  esac
}
trap cleanup EXIT

user_id='79000000-0000-4000-8000-000000000001'
spot_id='79000000-0000-4000-8000-000000000002'

psql "$DB_URL" -X --set ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','$user_id','authenticated','authenticated','same-day-race@test.invalid','','{}','{}',now(),now());
insert into public.profiles(id) values('$user_id') on conflict do nothing;
insert into public.spots(id,name,lat,lng,status,city,data_origin)
values('$spot_id','Same-day Race Spot',47,7,'approved','Basel','LEGACY');
SQL

run_insert() {
  local label="$1"
  psql "$DB_URL" -X --set ON_ERROR_STOP=1 >"$race_root/$label.out" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$user_id","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','$user_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.reviews(spot_id,user_id,mood_a,text)
values('$spot_id','$user_id','gemütlich','parallel $label');
commit;
SQL
}

set +e
run_insert a & pid_a=$!
run_insert b & pid_b=$!
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e

successes=0
test "$status_a" -eq 0 && successes=$((successes+1))
test "$status_b" -eq 0 && successes=$((successes+1))
test "$successes" -eq 1 || {
  printf 'Expected exactly one successful parallel Review, got %s.\n' "$successes" >&2
  cat "$race_root/a.out" "$race_root/b.out" >&2
  exit 1
}

if test "$status_a" -ne 0; then loser="$race_root/a.out"; else loser="$race_root/b.out"; fi
rg -q 'REVIEW_SAME_DAY_LIMIT' "$loser" || {
  printf 'Parallel loser did not receive REVIEW_SAME_DAY_LIMIT.\n' >&2
  cat "$loser" >&2
  exit 1
}

review_count="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --command "select count(*) from public.reviews where user_id='$user_id' and spot_id='$spot_id';")"
reservation_count="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --command "select count(*) from public.backyrd_review_daily_publications_v1 where user_id='$user_id' and spot_id='$spot_id';")"
test "$review_count" = 1
test "$reservation_count" = 1

printf 'Same-day Review parallel race contract passed.\n'
