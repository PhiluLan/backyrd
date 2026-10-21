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
# Freeze the business date once so waiting across midnight cannot change a replay payload.
business_date="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (clock_timestamp() at time zone 'Europe/Zurich')::date;")"
[[ "$business_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || exit 1
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
day_a="(date '$business_date'+1)"
day_b="(date '$business_date'+2)"
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
day_c="(date '$business_date'+3)"
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
day_d="(date '$business_date'+4)"
day_e="(date '$business_date'+5)"
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
select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000072','$service','$table_id',((date '$business_date'+6+time '18:00') at time zone 'Europe/Zurich'),2,'First allocation fixture');
select public.booking_console_create_v1('$spot','7b000000-0000-4000-8000-000000000073','$service','$third_table',((date '$business_date'+6+time '18:00') at time zone 'Europe/Zurich'),2,'Second allocation fixture');
commit;
SQL
internal_auth="select set_config('request.jwt.claim.sub','$owner',true); select set_config('request.jwt.claims','{\"sub\":\"$owner\",\"role\":\"authenticated\"}',true);"
run_case secondary_allocation \
 "select booking_private.assign_reservation_tables_v1('$spot',(select id from public.booking_reservations where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000072'),0,array['$table_id'::uuid,'$second_table'::uuid]);" \
 "select booking_private.assign_reservation_tables_v1('$spot',(select id from public.booking_reservations where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000073'),0,array['$third_table'::uuid,'$second_table'::uuid]);" \
 booking_slot_unavailable "$internal_auth" "$internal_auth"
allocation_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select string_agg(n||':'||revision,',' order by request_id) from (select r.request_id,r.revision,(select count(*) from booking_private.reservation_allocations_v1 a where a.reservation_id=r.id and a.is_active) n from public.booking_reservations r where r.spot_id='$spot' and r.request_id in ('7b000000-0000-4000-8000-000000000072','7b000000-0000-4000-8000-000000000073')) proof;")"
test "$allocation_proof" = '2:1,1:0' || { printf 'Unexpected secondary-allocation race state: %s\n' "$allocation_proof" >&2; exit 1; }

# Public combined bookings compete on a shared secondary table under the same restaurant lock.
group_ab='7b000000-0000-4000-8000-000000000074'
group_bc='7b000000-0000-4000-8000-000000000077'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
$auth_sql
select public.booking_console_save_combination_v1('$spot',4,'$group_ab','A + B','$table_id',array['$table_id'::uuid,'$second_table'::uuid],8);
select public.booking_console_save_combination_v1('$spot',5,'$group_bc','B + C','$third_table',array['$third_table'::uuid,'$second_table'::uuid],8);
commit;
SQL
combined_a="select public.booking_console_create_v2('$spot','7b000000-0000-4000-8000-000000000075','$service','$table_id',array['$table_id'::uuid,'$second_table'::uuid],'$group_ab',((date '$business_date'+7+time '18:00') at time zone 'Europe/Zurich'),60,6,'Combined race fixture');"
combined_b="select public.booking_console_create_v2('$spot','7b000000-0000-4000-8000-000000000076','$service','$third_table',array['$third_table'::uuid,'$second_table'::uuid],'$group_bc',((date '$business_date'+7+time '18:00') at time zone 'Europe/Zurich'),60,6,'Competing combined fixture');"
run_case combined_overlap "$combined_a" "$combined_b" booking_slot_unavailable
combined_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.booking_reservations where spot_id='$spot' and request_id in ('7b000000-0000-4000-8000-000000000075','7b000000-0000-4000-8000-000000000076'))||':'||(select count(*) from booking_private.reservation_requests_v2 where spot_id='$spot');")"
test "$combined_proof" = '1:1' || { printf 'Unexpected combined overlap race: %s\n' "$combined_proof" >&2; exit 1; }
combined_retry="select public.booking_console_create_v2('$spot','7b000000-0000-4000-8000-000000000078','$service','$table_id',array['$table_id'::uuid,'$second_table'::uuid],'$group_ab',((date '$business_date'+8+time '18:00') at time zone 'Europe/Zurich'),60,6,'Repeated combined fixture');"
run_case combined_retry "$combined_retry" "$combined_retry" SUCCESS
retry_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.booking_reservations where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000078')||':'||(select count(*) from booking_private.reservation_requests_v2 where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000078')||':'||(select count(*) from public.booking_audit_events e join public.booking_reservations r on r.id=e.reservation_id where r.spot_id='$spot' and r.request_id='7b000000-0000-4000-8000-000000000078');")"
test "$retry_proof" = '1:1:1' || { printf 'Unexpected concurrent combined retry: %s\n' "$retry_proof" >&2; exit 1; }

# Actual-time movement of two overstay visits competes for one physical target.
visit_a='7b000000-0000-4000-8000-000000000090'
visit_b='7b000000-0000-4000-8000-000000000091'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.booking_reservations(id,spot_id,request_id,table_id,service_id,guest_name,party_size,starts_at,ends_at,status,source,arrived_at,seated_at) values
 ('$visit_a','$spot','$visit_a','$table_id','$service','First movement fixture',2,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour','seated','operator',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours'),
 ('$visit_b','$spot','$visit_b','$third_table','$service','Second movement fixture',2,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour','seated','operator',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours');
SQL
transfer_a="select public.booking_console_transfer_v1('$spot','$visit_a','7b000000-0000-4000-8000-000000000092',0,'$second_table',array['$second_table'::uuid],null,60);"
transfer_b="select public.booking_console_transfer_v1('$spot','$visit_b','7b000000-0000-4000-8000-000000000093',0,'$second_table',array['$second_table'::uuid],null,60);"
run_case seated_transfer "$transfer_a" "$transfer_b" booking_slot_unavailable
move_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select table_id='$second_table' and allocation_starts_at is not null and revision=1 from public.booking_reservations where id='$visit_a')||':'||(select table_id='$third_table' and allocation_starts_at is null and revision=0 from public.booking_reservations where id='$visit_b')||':'||(select count(*) from booking_private.reservation_requests_v2 where spot_id='$spot' and request_kind='transfer');")"
test "$move_proof" = 'true:true:1' || { printf 'Unexpected physical transfer race: %s\n' "$move_proof" >&2; exit 1; }
run_case seated_transfer_retry "$transfer_a" "$transfer_a" SUCCESS
move_audit="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.booking_audit_events where reservation_id='$visit_a' and action='seated_tables_transferred';")"
test "$move_audit" = 1 || { printf 'Movement replay duplicated its audit.\n' >&2; exit 1; }
run_case departure_before_transfer \
 "select public.booking_console_set_status_v1('$spot','$visit_b','seated','completed');" \
 "$transfer_b" booking_changed_reload

# Public intake shares operator inventory and the same complete-operation registry.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
update auth.users set email_confirmed_at=clock_timestamp() where id='$owner';
begin;
$auth_sql
select public.booking_console_save_public_settings_v1('$spot',(select revision from public.booking_restaurant_settings where spot_id='$spot'),true,array['$service'::uuid],60,90,120,'confirmed','privacy@booking.invalid');
commit;
SQL
guest_auth="set local role service_role; select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);"
guest_create="select public.booking_guest_create_v1('$spot','7b000000-0000-4000-8000-000000000100',1,((date '$business_date'+9+time '18:00') at time zone 'Europe/Zurich'),6,'Public race fixture','guest-race@booking.invalid',repeat('a',64),repeat('sealed-fixture-',5));"
operator_competitor="select public.booking_console_create_v2('$spot','7b000000-0000-4000-8000-000000000101','$service','$table_id',array['$table_id'::uuid,'$second_table'::uuid],'$group_ab',((date '$business_date'+9+time '18:00') at time zone 'Europe/Zurich'),60,6,'Operator competing with guest');"
run_case guest_before_operator "$guest_create" "$operator_competitor" booking_slot_unavailable "$auth_sql" "$guest_auth"
run_case operator_before_guest \
 "select public.booking_console_create_v2('$spot','7b000000-0000-4000-8000-000000000102','$service','$table_id',array['$table_id'::uuid,'$second_table'::uuid],'$group_ab',((date '$business_date'+10+time '18:00') at time zone 'Europe/Zurich'),60,6,'Operator before guest');" \
 "select public.booking_guest_create_v1('$spot','7b000000-0000-4000-8000-000000000103',1,((date '$business_date'+10+time '18:00') at time zone 'Europe/Zurich'),6,'Waiting guest fixture','guest-race@booking.invalid',repeat('b',64),repeat('sealed-fixture-',5));" \
 booking_slot_unavailable "$guest_auth" "$auth_sql"
guest_retry="select public.booking_guest_create_v1('$spot','7b000000-0000-4000-8000-000000000104',1,((date '$business_date'+11+time '18:00') at time zone 'Europe/Zurich'),6,'Retry guest fixture','guest-race@booking.invalid',repeat('c',64),repeat('sealed-fixture-',5));"
run_case guest_concurrent_retry "$guest_retry" "$guest_retry" SUCCESS "$guest_auth" "$guest_auth"
run_case public_pause_before_guest \
 "select public.booking_console_save_public_settings_v1('$spot',(select revision from public.booking_restaurant_settings where spot_id='$spot'),false,array['$service'::uuid],60,90,120,'confirmed','privacy@booking.invalid');" \
 "select public.booking_guest_create_v1('$spot','7b000000-0000-4000-8000-000000000105',1,((date '$business_date'+12+time '18:00') at time zone 'Europe/Zurich'),6,'Denied paused guest','paused@booking.invalid',repeat('d',64),repeat('sealed-fixture-',5));" \
 booking_public_unavailable "$guest_auth" "$auth_sql"
run_case guest_retry_after_pause "$guest_retry" "$guest_retry" SUCCESS "$guest_auth" "$guest_auth"
guest_proof="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.booking_reservations where spot_id='$spot' and source='website')||':'||(select count(*) from booking_private.reservation_requests_v2 where spot_id='$spot' and request_kind='guest_create')||':'||(select count(*) from booking_private.guest_mail_outbox_v1 where spot_id='$spot');")"
test "$guest_proof" = '2:2:2' || { printf 'Unexpected public intake race state: %s\n' "$guest_proof" >&2; exit 1; }

# A competing worker must skip a restaurant held by another claim, not block or
# lease the same message. Observe a real idle transaction before competing.
lease_a='7b000000-0000-4000-8000-000000000110'
lease_b='7b000000-0000-4000-8000-000000000111'
mkfifo "$race_root/mail-skip.pipe"
PGAPPNAME='booking-race-holder-mail-skip' psql "$DB_URL" -X -v ON_ERROR_STOP=1 <"$race_root/mail-skip.pipe" >"$race_root/mail-skip-holder.out" 2>&1 & holder_pid=$!
exec 3>"$race_root/mail-skip.pipe"
printf 'begin; set local role service_role; select public.booking_mail_claim_v1('\''%s'\''); select '\''BOOKING_HOLDER_READY'\'';\n' "$lease_a" >&3
wait_for_state 'booking-race-holder-mail-skip' "state='idle in transaction' and query like '%BOOKING_HOLDER_READY%'"
skip_proof="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL
begin;
set local statement_timeout='2s';
set local role service_role;
select public.booking_mail_claim_v1('$lease_b') is null;
commit;
SQL
)"
test "$skip_proof" = t || { printf 'Competing mail worker did not skip the held restaurant; returned <%s>.\n' "$skip_proof" >&2; exit 1; }
printf 'commit;\n' >&3
exec 3>&-
wait "$holder_pid"; holder_pid=''
psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "begin; set local role service_role; select public.booking_mail_claim_v1('$lease_b'); commit;" >"$race_root/mail-second-claim.out"
mail_a="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select id from booking_private.guest_mail_outbox_v1 where lease_id='$lease_a';")"
mail_b="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select id from booking_private.guest_mail_outbox_v1 where lease_id='$lease_b';")"
[[ "$mail_a" =~ ^[0-9a-f-]{36}$ && "$mail_b" =~ ^[0-9a-f-]{36}$ && "$mail_a" != "$mail_b" ]] || exit 1
reservation_a="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select reservation_id from booking_private.guest_mail_outbox_v1 where id='$mail_a';")"
reservation_b="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select reservation_id from booking_private.guest_mail_outbox_v1 where id='$mail_b';")"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
select public.booking_mail_prepare_v1(o.id,o.lease_id,booking_private.request_fingerprint_v2(booking_private.mail_snapshot_v1(o.reservation_id)),repeat('sealed-race-payload-',4),repeat('e',64)) from booking_private.guest_mail_outbox_v1 o where id in ('$mail_a','$mail_b');
SQL
amend_a="select public.booking_console_amend_v2(r.spot_id,r.id,'7b000000-0000-4000-8000-000000000112',r.revision,r.service_id,r.table_id,array['$table_id'::uuid,'$second_table'::uuid],r.combination_id,r.starts_at,60,r.party_size,r.guest_name,'corrected-a@booking.invalid',r.note) from public.booking_reservations r where id='$reservation_a';"
amend_b="select public.booking_console_amend_v2(r.spot_id,r.id,'7b000000-0000-4000-8000-000000000113',r.revision,r.service_id,r.table_id,array['$table_id'::uuid,'$second_table'::uuid],r.combination_id,r.starts_at,60,r.party_size,r.guest_name,'corrected-b@booking.invalid',r.note) from public.booking_reservations r where id='$reservation_b';"
run_case mail_contact_before_dispatch "$amend_a" \
 "select case when public.booking_mail_begin_v1('$mail_a','$lease_a',repeat('e',64)) is null then 'NO_DISPATCH' else 'UNSAFE_DISPATCH' end;" SUCCESS "$guest_auth" "$auth_sql"
grep -q '^ NO_DISPATCH' "$race_root/mail_contact_before_dispatch-waiter.out" || { cat "$race_root/mail_contact_before_dispatch-waiter.out" >&2; exit 1; }
run_case mail_dispatch_before_contact \
 "select public.booking_mail_begin_v1('$mail_b','$lease_b',repeat('e',64));" "$amend_b" SUCCESS "$auth_sql" "$guest_auth"
mail_proof="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select (select state from booking_private.guest_mail_outbox_v1 where id='$mail_a')||':'||(select state||':'||(superseded_at is not null)::text from booking_private.guest_mail_outbox_v1 where id='$mail_b');")"
test "$mail_proof" = 'suppressed:sending:true' || { printf 'Unexpected dispatch/contact boundary: %s\n' "$mail_proof" >&2; exit 1; }
psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "begin; set local role service_role; select public.booking_mail_finish_v1('$mail_b','$lease_b','retry'); commit;" >"$race_root/mail-unknown-finish.out"
test "$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select state from booking_private.guest_mail_outbox_v1 where id='$mail_b';")" = review_required || exit 1

# Reissue is a complete idempotent intent, including the verified server actor.
# A different randomly generated key on retry must not replace the committed one.
contact_a="encode(sha256(convert_to('corrected-a@booking.invalid','UTF8')),'hex')"
reissue_a="select public.booking_mail_reissue_v1('$owner','$spot','$reservation_a','7b000000-0000-4000-8000-000000000120',1,$contact_a,repeat('f',64),repeat('sealed-reissue-race-',5));"
reissue_a_retry="select public.booking_mail_reissue_v1('$owner','$spot','$reservation_a','7b000000-0000-4000-8000-000000000120',1,$contact_a,repeat('0',64),repeat('different-sealed-race-',5));"
run_case reissue_concurrent_retry "$reissue_a" "$reissue_a_retry" SUCCESS "$guest_auth" "$guest_auth"
test "$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select r.revision||':'||(a.key_hash=repeat('f',64))::text||':'||(select count(*) from booking_private.reservation_requests_v2 where reservation_id=r.id and request_kind='guest_reissue') from public.booking_reservations r join booking_private.guest_access_v1 a on a.reservation_id=r.id where r.id='$reservation_a';")" = '2:true:1' || exit 1

correct_b_again="select public.booking_console_amend_v2(r.spot_id,r.id,'7b000000-0000-4000-8000-000000000121',r.revision,r.service_id,r.table_id,array['$table_id'::uuid,'$second_table'::uuid],r.combination_id,r.starts_at,60,r.party_size,r.guest_name,'new-race-b@booking.invalid',r.note) from public.booking_reservations r where id='$reservation_b';"
reissue_b_stale="select public.booking_mail_reissue_v1('$owner','$spot','$reservation_b','7b000000-0000-4000-8000-000000000122',1,encode(sha256(convert_to('corrected-b@booking.invalid','UTF8')),'hex'),repeat('a',64),repeat('sealed-reissue-race-',5));"
run_case contact_before_reissue "$correct_b_again" "$reissue_b_stale" SUCCESS "$guest_auth" "$auth_sql"
grep -q '"not_committed": true' "$race_root/contact_before_reissue-waiter.out" || exit 1
test "$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from booking_private.reservation_requests_v2 where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000122';")" = 0 || exit 1
reissue_b="select public.booking_mail_reissue_v1('$owner','$spot','$reservation_b','7b000000-0000-4000-8000-000000000123',2,encode(sha256(convert_to('new-race-b@booking.invalid','UTF8')),'hex'),repeat('d',64),repeat('sealed-reissue-race-',5));"
late_correct_b="select public.booking_console_amend_v2(r.spot_id,r.id,'7b000000-0000-4000-8000-000000000124',r.revision,r.service_id,r.table_id,array['$table_id'::uuid,'$second_table'::uuid],r.combination_id,r.starts_at,60,r.party_size,r.guest_name,'stale-correction@booking.invalid',r.note) from public.booking_reservations r where id='$reservation_b';"
run_case reissue_before_contact "$reissue_b" "$late_correct_b" booking_changed_reload "$auth_sql" "$guest_auth"

rotate_a="select public.booking_mail_reissue_v1('$owner','$spot','$reservation_a','7b000000-0000-4000-8000-000000000125',2,$contact_a,repeat('b',64),repeat('sealed-reissue-race-',5));"
old_cancel_a="select public.booking_guest_cancel_v1('$reservation_a',repeat('f',64),'7b000000-0000-4000-8000-000000000126',2);"
run_case reissue_before_guest_cancel "$rotate_a" "$old_cancel_a" booking_guest_link_unavailable "$guest_auth" "$guest_auth"
cancel_b="select public.booking_guest_cancel_v1('$reservation_b',repeat('d',64),'7b000000-0000-4000-8000-000000000127',3);"
rotate_b_after_cancel="select public.booking_mail_reissue_v1('$owner','$spot','$reservation_b','7b000000-0000-4000-8000-000000000128',3,encode(sha256(convert_to('new-race-b@booking.invalid','UTF8')),'hex'),repeat('e',64),repeat('sealed-reissue-race-',5));"
run_case guest_cancel_before_reissue "$cancel_b" "$rotate_b_after_cancel" SUCCESS "$guest_auth" "$guest_auth"
grep -q '"not_committed": true' "$race_root/guest_cancel_before_reissue-waiter.out" || exit 1
test "$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select status||':'||revision from public.booking_reservations where id='$reservation_b';")" = 'cancelled:4' || exit 1
run_case transfer_owner_before_reissue_replay \
 "select 1 from public.booking_restaurant_settings where spot_id='$spot' for update; update public.spots set owner_id='$other_owner' where id='$spot';" \
 "$reissue_a_retry" booking_operator_required "$guest_auth" 'set local role postgres;'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update public.spots set owner_id='$owner' where id='$spot';" >/dev/null
printf 'Guest-link reissue deduplicates independently generated capabilities across concurrent retries; contact amendments and guest cancellation fence stale issuance in both lock orders, and ownership transfer blocks old-actor replay.\n'

# Public-rule saves have their own actor-bound nonce journal. A read without an
# outcome never settles an old write unless a later monotonic root fences it.
public_rev="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select revision from public.booking_restaurant_settings where spot_id='$spot';")"
public_payload="'{\"enabled\":false,\"service_ids\":[\"$service\"],\"notice_minutes\":60,\"horizon_days\":90,\"cancellation_minutes\":120,\"confirmation_status\":\"confirmed\",\"privacy_contact\":\"privacy@booking.invalid\",\"guest_notice\":\"\"}'::jsonb"
public_save="select public.booking_console_save_public_settings_v2('$spot','7b000000-0000-4000-8000-000000000130',$public_rev,$public_payload);"
run_case public_settings_same_nonce "$public_save" "$public_save" SUCCESS
case_count="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from booking_private.public_settings_requests_v1 where spot_id='$spot' and request_id='7b000000-0000-4000-8000-000000000130';")"
test "$case_count" = 1 || exit 1
legacy_change="select public.booking_console_save_public_settings_v1('$spot',$public_rev,false,array['$service'::uuid],60,90,120,'confirmed','privacy@booking.invalid','New rules from another manager');"
stale_new_settings="select public.booking_console_save_public_settings_v2('$spot','7b000000-0000-4000-8000-000000000131',$public_rev,$public_payload);"
run_case public_settings_other_change_first "$legacy_change" "$stale_new_settings" SUCCESS
grep -q '"not_committed": true' "$race_root/public_settings_other_change_first-waiter.out" || exit 1
public_rev="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select revision from public.booking_restaurant_settings where spot_id='$spot';")"
new_settings="select public.booking_console_save_public_settings_v2('$spot','7b000000-0000-4000-8000-000000000132',$public_rev,$public_payload);"
stale_legacy_change="select public.booking_console_save_public_settings_v1('$spot',$public_rev,false,array['$service'::uuid],60,90,120,'confirmed','different@booking.invalid','Stale manager rules');"
run_case public_settings_nonce_first "$new_settings" "$stale_legacy_change" booking_setup_changed_reload
printf 'Public booking-rule intents deduplicate concurrent retries and fence competing changes in both actual root-lock orders.\n'

# Manual staff messages reuse the complete operation registry and restaurant lock.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update auth.users set email_confirmed_at=coalesce(email_confirmed_at,clock_timestamp()) where id='$owner';" >/dev/null
make_summary_reservation() {
 local nonce="$1" days="$2"
 psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL | tail -n 1
begin;
$auth_sql
select (public.booking_console_create_v2('$spot','$nonce','$service','$table_id',array['$table_id'::uuid],null,
 ((date '$business_date'+$days+time '10:00') at time zone 'Europe/Zurich'),60,2,'Manual summary race','+41 61 555 00 00',null,'phone','confirmed'))->>'id';
commit;
SQL
}
summary_a="$(make_summary_reservation '7b000000-0000-4000-8000-000000000150' 14)"
summary_b="$(make_summary_reservation '7b000000-0000-4000-8000-000000000151' 15)"
[[ "$summary_a" =~ ^[a-f0-9-]{36}$ && "$summary_b" =~ ^[a-f0-9-]{36}$ ]] || exit 1
summary_write="select public.booking_mail_summary_v1('$owner','$spot','$summary_a','7b000000-0000-4000-8000-000000000160',0,'summary-race@booking.invalid');"
run_case manual_summary_same_nonce "$summary_write" "$summary_write" SUCCESS "$guest_auth" "$guest_auth"
test "$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from booking_private.guest_mail_outbox_v1 where reservation_id='$summary_a' and manual_summary is not null;")" = 1 || exit 1
summary_cancel="select public.booking_console_set_status_v1('$spot','$summary_a','confirmed','cancelled');"
stale_summary="select public.booking_mail_summary_v1('$owner','$spot','$summary_a','7b000000-0000-4000-8000-000000000161',1,'summary-race@booking.invalid');"
run_case cancel_before_manual_summary "$summary_cancel" "$stale_summary" SUCCESS "$guest_auth" "$auth_sql"
grep -q '"not_committed": true' "$race_root/cancel_before_manual_summary-waiter.out" || exit 1
summary_b_write="select public.booking_mail_summary_v1('$owner','$spot','$summary_b','7b000000-0000-4000-8000-000000000162',0,'summary-b@booking.invalid');"
summary_b_amend="select public.booking_console_amend_v2('$spot','$summary_b','7b000000-0000-4000-8000-000000000163',0,'$service','$table_id',array['$table_id'::uuid],null,((date '$business_date'+15+time '10:00') at time zone 'Europe/Zurich'),60,2,'Stale manual change','+41 61 555 00 00',null);"
run_case manual_summary_before_amend "$summary_b_write" "$summary_b_amend" booking_changed_reload "$auth_sql" "$guest_auth"
run_case owner_transfer_before_summary_replay \
 "select 1 from public.booking_restaurant_settings where spot_id='$spot' for update;update public.spots set owner_id='$other_owner' where id='$spot';" \
 "$summary_write" booking_operator_required "$guest_auth" 'set local role postgres;'
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "update public.spots set owner_id='$owner' where id='$spot';" >/dev/null
printf 'Manual confirmation races deduplicate the same intent, fence cancellation/amendment in both root-lock orders and reauthorize after ownership transfer. No provider was contacted.\n'

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
delete from public.booking_audit_events where spot_id='$spot';
delete from booking_private.guest_mail_events_v1 where outbox_id in (select id from booking_private.guest_mail_outbox_v1 where spot_id='$spot');
delete from booking_private.guest_mail_outbox_v1 where spot_id='$spot';
delete from booking_private.guest_access_v1 where spot_id='$spot';
delete from booking_private.reservation_requests_v2 where spot_id='$spot';
delete from public.booking_reservations where spot_id='$spot';
delete from public.booking_table_combinations where spot_id='$spot';
delete from public.booking_restaurant_closures where spot_id='$spot';
delete from public.booking_service_hours where spot_id='$spot';
delete from public.booking_restaurant_tables where spot_id='$spot';
delete from public.booking_restaurant_services where spot_id='$spot';
delete from public.booking_restaurant_areas where spot_id='$spot';
delete from public.booking_public_settings where spot_id='$spot';
delete from booking_private.public_settings_requests_v1 where spot_id='$spot';
delete from public.booking_restaurant_settings where spot_id='$spot';
delete from public.spots where id in ('$spot','$other_spot');
delete from auth.users where id in ('$owner','$staff','$other_owner');
commit;
SQL
printf 'Booking closure, special-hours/reservation and staff-revocation races passed in both lock orders; concurrent cross-restaurant resource IDs remain fenced; secondary-table allocation and public combined bookings serialize, roll back a competing claim, deduplicate concurrent identical requests, and fence actual-time seated transfers against competing movements and departure; public intake and operator inventory serialize in both orders, with replay and paused-intake fences.\n'
printf 'Mail workers skip held restaurant claims without duplicate leases; contact correction fences dispatch in both real lock orders, and an already in-flight unknown send cannot retry the obsolete recipient. No provider was contacted.\n'
