#!/usr/bin/env bash
set -euo pipefail
: "${DB_URL:?DB_URL is required}"
test "${BACKYRD_BOOKING_RACE_EPHEMERAL:-}" = 1 || { printf 'Booking race requires an explicitly isolated test database.\n' >&2; exit 1; }
case "$DB_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) printf 'Booking race only runs against a loopback test database.\n' >&2; exit 1 ;; esac
race_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-booking-race.XXXXXX")"
holder_pid='' waiter_pid=''
cleanup() {
  exec 3>&- || true
  test -z "$holder_pid" || kill "$holder_pid" 2>/dev/null || true
  test -z "$waiter_pid" || kill "$waiter_pid" 2>/dev/null || true
  case "$race_root" in "${TMPDIR:-/tmp}"/backyrd-booking-race.*|/tmp/backyrd-booking-race.*) rm -rf "$race_root" ;; esac
}
trap cleanup EXIT
owner='7b000000-0000-4000-8000-000000000001'
spot='7b000000-0000-4000-8000-000000000002'
area='7b000000-0000-4000-8000-000000000003'
table_id='7b000000-0000-4000-8000-000000000004'
service='7b000000-0000-4000-8000-000000000005'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >"$race_root/setup.out" <<SQL
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('$owner','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booking-race@booking.invalid','','{}','{}',now(),now());
insert into public.spots(id,name,lat,lng,owner_id,status) values('$spot','Booking race fixture',47.5,7.5,'$owner','approved');
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$owner',true);
select set_config('request.jwt.claims','{"sub":"$owner","role":"authenticated"}',true);
select public.booking_console_save_setup_v1('$spot',0,jsonb_build_object('duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id','$area','name','Room','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id','$table_id','area_id','$area','label','Race table','seats',4,'is_active',true)),
 'services',jsonb_build_array(jsonb_build_object('id','$service','name','Service','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true))));
commit;
SQL
wait_for_state() {
  local app="$1" predicate="$2" found=''
  for attempt in {1..100}; do
    found="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='$app' and $predicate;")"
    test "$found" != 0 && return 0
    sleep 0.05
  done
  printf 'Booking race did not reach the expected live PostgreSQL state: %s\n' "$app" >&2
  cat "$race_root"/*.out >&2
  return 1
}
auth_sql="set local role authenticated; select set_config('request.jwt.claim.sub','$owner',true); select set_config('request.jwt.claims','{\"sub\":\"$owner\",\"role\":\"authenticated\"}',true);"
run_case() {
  local case_name="$1" holder_sql="$2" waiter_sql="$3" expected="$4"
  mkfifo "$race_root/$case_name.pipe"
  PGAPPNAME="booking-race-holder-$case_name" psql "$DB_URL" -X -v ON_ERROR_STOP=1 <"$race_root/$case_name.pipe" >"$race_root/$case_name-holder.out" 2>&1 & holder_pid=$!
  exec 3>"$race_root/$case_name.pipe"
  printf 'begin;\n%s\n%s\nselect '\''BOOKING_HOLDER_READY'\'';\n' "$auth_sql" "$holder_sql" >&3
  wait_for_state "booking-race-holder-$case_name" "state='idle in transaction' and query like '%BOOKING_HOLDER_READY%'"
  PGAPPNAME="booking-race-waiter-$case_name" psql "$DB_URL" -X -v ON_ERROR_STOP=1 >"$race_root/$case_name-waiter.out" 2>&1 <<SQL &
begin;
$auth_sql
$waiter_sql
commit;
SQL
  waiter_pid=$!
  wait_for_state "booking-race-waiter-$case_name" "wait_event_type='Lock'"
  printf 'commit;\n' >&3
  exec 3>&-
  wait "$holder_pid"; holder_pid=''
  if wait "$waiter_pid"; then printf 'Booking race waiter unexpectedly succeeded.\n' >&2; exit 1; fi
  waiter_pid=''
  grep -q "$expected" "$race_root/$case_name-waiter.out" || { cat "$race_root/$case_name-waiter.out" >&2; exit 1; }
}
day_a="((now() at time zone 'Europe/Zurich')::date+1)"
day_b="((now() at time zone 'Europe/Zurich')::date+2)"
run_case closure_first \
 "select public.booking_console_save_closure_v1('$spot',1,'7b000000-0000-4000-8000-000000000010',$day_a);" \
 "select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000011','$service','$table_id',(($day_a+time '18:00') at time zone 'Europe/Zurich'),2,'Synthetic waiting guest');" \
 booking_slot_unavailable
run_case booking_first \
 "select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000012','$service','$table_id',(($day_b+time '18:00') at time zone 'Europe/Zurich'),2,'Synthetic winning guest');" \
 "select public.booking_console_save_closure_v1('$spot',2,'7b000000-0000-4000-8000-000000000013',$day_b);" \
 booking_closure_has_reservations
proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select count(*) from booking_restaurant_closures where spot_id='$spot')||':'||(select count(*) from booking_reservations where spot_id='$spot')||':'||(select revision from booking_restaurant_settings where spot_id='$spot');")"
test "$proof" = '1:1:2' || { printf 'Unexpected Booking race state: %s\n' "$proof" >&2; exit 1; }
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
delete from public.booking_audit_events where spot_id='$spot';
delete from public.booking_reservations where spot_id='$spot';
delete from public.booking_restaurant_closures where spot_id='$spot';
delete from public.booking_restaurant_tables where spot_id='$spot';
delete from public.booking_restaurant_services where spot_id='$spot';
delete from public.booking_restaurant_areas where spot_id='$spot';
delete from public.booking_restaurant_settings where spot_id='$spot';
delete from public.spots where id='$spot';
delete from auth.users where id='$owner';
commit;
SQL
printf 'Booking closure/reservation two-connection race passed in both lock orders.\n'
