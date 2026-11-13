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
  local case_name="$1" holder_sql="$2" waiter_sql="$3" expected="$4" waiter_auth="${5:-$auth_sql}" holder_auth="${6:-$auth_sql}"
  mkfifo "$race_root/$case_name.pipe"
  PGAPPNAME="booking-race-holder-$case_name" psql "$DB_URL" -X -v ON_ERROR_STOP=1 <"$race_root/$case_name.pipe" >"$race_root/$case_name-holder.out" 2>&1 & holder_pid=$!
  exec 3>"$race_root/$case_name.pipe"
  printf 'begin;\n%s\n%s\nselect '\''BOOKING_HOLDER_READY'\'';\n' "$holder_auth" "$holder_sql" >&3
  wait_for_state "booking-race-holder-$case_name" "state='idle in transaction' and query like '%BOOKING_HOLDER_READY%'"
  PGAPPNAME="booking-race-waiter-$case_name" psql "$DB_URL" -X -v ON_ERROR_STOP=1 >"$race_root/$case_name-waiter.out" 2>&1 <<SQL &
begin;
$waiter_auth
$waiter_sql
commit;
SQL
  waiter_pid=$!
  wait_for_state "booking-race-waiter-$case_name" "wait_event_type='Lock'"
  printf 'commit;\n' >&3
  exec 3>&-
  if wait "$holder_pid"; then holder_pid=''; else holder_pid=''; return 1; fi
  local waiter_status=0
  wait "$waiter_pid" || waiter_status=$?
  waiter_pid=''
  if test "$expected" = SUCCESS; then test "$waiter_status" = 0 || { cat "$race_root/$case_name-waiter.out" >&2; return 1; }
  else test "$waiter_status" != 0 && grep -q "$expected" "$race_root/$case_name-waiter.out" || { cat "$race_root/$case_name-waiter.out" >&2; return 1; }; fi
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
# The same serialization boundary protects permission checks and revocation.
staff='7b000000-0000-4000-8000-000000000020'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('$staff','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booking-race-staff@booking.invalid','','{}','{}',now(),now());
insert into public.booking_team_members(spot_id,user_id,owner_id,role) values('$spot','$staff','$owner','host');
SQL
staff_auth="set local role authenticated; select set_config('request.jwt.claim.sub','$staff',true); select set_config('request.jwt.claims','{\"sub\":\"$staff\",\"role\":\"authenticated\"}',true);"
day_c="((now() at time zone 'Europe/Zurich')::date+3)"
run_case revoke_first \
 "select public.booking_console_member_v1('$spot','$staff',0,null);" \
 "select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000021','$service','$table_id',(($day_c+time '18:00') at time zone 'Europe/Zurich'),2,'Denied after revocation');" \
 booking_operator_required "$staff_auth"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update public.booking_team_members set revoked_at=null,revision=revision+1 where spot_id='$spot' and user_id='$staff';" >/dev/null
run_case staff_write_first \
 "select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000022','$service','$table_id',(($day_c+time '18:00') at time zone 'Europe/Zurich'),2,'Authorized before revocation');" \
 "select public.booking_console_member_v1('$spot','$staff',2,null);" \
 SUCCESS "$auth_sql" "$staff_auth"
team_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.booking_reservations where spot_id='$spot')||':'||(select count(*) from public.booking_team_members where spot_id='$spot' and revoked_at is not null);")"
test "$team_proof" = '2:1' || { printf 'Unexpected Booking permission race state: %s\n' "$team_proof" >&2; exit 1; }

# Dated service windows serialize against bookings, including the explicit keep-existing decision.
day_d="((now() at time zone 'Europe/Zurich')::date+4)"
day_e="((now() at time zone 'Europe/Zurich')::date+5)"
run_case hours_first \
 "select public.booking_console_save_hours_v1('$spot',2,'7b000000-0000-4000-8000-000000000030','$service',$day_d,p_closed=>true);" \
 "select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000031','$service','$table_id',(($day_d+time '18:00') at time zone 'Europe/Zurich'),2,'Denied after changed hours');" \
 booking_slot_unavailable
run_case hours_booking_first \
 "select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000032','$service','$table_id',(($day_e+time '18:00') at time zone 'Europe/Zurich'),2,'Saved before hours change');" \
 "select public.booking_console_save_hours_v1('$spot',3,'7b000000-0000-4000-8000-000000000033','$service',$day_e,p_closed=>true);" \
 booking_hours_has_reservations
hours_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.booking_service_hours where spot_id='$spot')||':'||(select count(*) from public.booking_reservations where spot_id='$spot')||':'||(select revision from public.booking_restaurant_settings where spot_id='$spot');")"
test "$hours_proof" = '1:3:3' || { printf 'Unexpected Booking hours race state: %s\n' "$hours_proof" >&2; exit 1; }

# An uncommitted resource ID in another restaurant cannot be overwritten after a unique-key wait.
other_owner='7b000000-0000-4000-8000-000000000040'
other_spot='7b000000-0000-4000-8000-000000000041'
shared_area='7b000000-0000-4000-8000-000000000042'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('$other_owner','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booking-resource-race@booking.invalid','','{}','{}',now(),now());
insert into public.spots(id,name,lat,lng,owner_id,status) values('$other_spot','Second isolated race restaurant',47.5,7.5,'$other_owner','approved');
SQL
other_auth="set local role authenticated; select set_config('request.jwt.claim.sub','$other_owner',true); select set_config('request.jwt.claims','{\"sub\":\"$other_owner\",\"role\":\"authenticated\"}',true);"
run_case cross_spot_resource \
 "select public.booking_console_save_setup_v1('$spot',3,jsonb_build_object('duration_minutes',60,'max_party_size',8,'areas',jsonb_build_array(jsonb_build_object('id','$area','name','Room','is_active',true),jsonb_build_object('id','$shared_area','name','Shared guarded','is_active',true)),'tables',jsonb_build_array(jsonb_build_object('id','$table_id','area_id','$area','label','Race table','seats',4,'is_active',true)),'services',jsonb_build_array(jsonb_build_object('id','$service','name','Service','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true))));" \
 "select public.booking_console_save_setup_v1('$other_spot',0,jsonb_build_object('duration_minutes',60,'max_party_size',8,'areas',jsonb_build_array(jsonb_build_object('id','$shared_area','name','Should not overwrite','is_active',true)),'tables','[]'::jsonb,'services','[]'::jsonb));" \
 booking_resource_spot_mismatch "$other_auth"
resource_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select name from public.booking_restaurant_areas where id='$shared_area' and spot_id='$spot')||':'||(select count(*) from public.booking_restaurant_settings where spot_id='$other_spot');")"
test "$resource_proof" = 'Shared guarded:0' || { printf 'Unexpected Booking resource-race state: %s\n' "$resource_proof" >&2; exit 1; }

# Both reservations retain distinct primary tables and compete for one secondary table.
second_table='7b000000-0000-4000-8000-000000000070'
third_table='7b000000-0000-4000-8000-000000000071'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.booking_restaurant_tables(id,spot_id,area_id,label,seats) values('$second_table','$spot','$area','Secondary race table',4),('$third_table','$spot','$area','Third race table',4);
begin;
$auth_sql
select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000072','$service','$table_id',(((now() at time zone 'Europe/Zurich')::date+6+time '18:00') at time zone 'Europe/Zurich'),2,'First allocation fixture');
select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000073','$service','$third_table',(((now() at time zone 'Europe/Zurich')::date+6+time '18:00') at time zone 'Europe/Zurich'),2,'Second allocation fixture');
commit;
SQL
internal_auth="select set_config('request.jwt.claim.sub','$owner',true); select set_config('request.jwt.claims','{\"sub\":\"$owner\",\"role\":\"authenticated\"}',true);"
run_case secondary_allocation \
 "select booking_private.assign_reservation_tables_v1('$spot',(select id from public.booking_reservations where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000072'),0,array['$table_id'::uuid,'$second_table'::uuid]);" \
 "select booking_private.assign_reservation_tables_v1('$spot',(select id from public.booking_reservations where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000073'),0,array['$third_table'::uuid,'$second_table'::uuid]);" \
 booking_slot_unavailable "$internal_auth" "$internal_auth"
allocation_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select string_agg(n||':'||revision,',' order by request_id) from (select r.request_id,r.revision,(select count(*) from booking_private.reservation_allocations_v1 a where a.reservation_id=r.id and a.is_active) n from public.booking_reservations r where r.spot_id='$spot' and r.request_id in ('7b000000-0000-4000-8000-000000000072','7b000000-0000-4000-8000-000000000073')) proof;")"
test "$allocation_proof" = '2:1,1:0' || { printf 'Unexpected secondary-allocation race state: %s\n' "$allocation_proof" >&2; exit 1; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
delete from public.booking_audit_events where spot_id='$spot';
delete from public.booking_reservations where spot_id='$spot';
delete from public.booking_restaurant_closures where spot_id='$spot';
delete from public.booking_service_hours where spot_id='$spot';
delete from public.booking_restaurant_tables where spot_id='$spot';
delete from public.booking_restaurant_services where spot_id='$spot';
delete from public.booking_restaurant_areas where spot_id='$spot';
delete from public.booking_restaurant_settings where spot_id='$spot';
delete from public.spots where id in ('$spot','$other_spot');
delete from auth.users where id in ('$owner','$staff','$other_owner');
commit;
SQL
printf 'Booking closure, special-hours/reservation and staff-revocation races passed in both lock orders; concurrent cross-restaurant resource IDs remain fenced; secondary-table allocation serializes and rolls back the losing party.\n'
