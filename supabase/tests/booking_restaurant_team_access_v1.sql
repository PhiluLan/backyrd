-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-team-access-test:'||label)::uuid $$;
create function pg_temp.booking_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Booking Console: %',message; end if; end $$;
create function pg_temp.booking_actor(label text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',pg_temp.booking_id(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.booking_id(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.booking_setup(suffix text) returns jsonb language sql as $$
 select jsonb_build_object('duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('area-'||suffix),'name','Gastraum','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('table-'||suffix),'area_id',pg_temp.booking_id('area-'||suffix),'label','Tisch 1','seats',4,'is_active',true)),
 'services',jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('service-'||suffix),'name','Service','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true)))
$$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.booking_id(x),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',x||'@booking.invalid','','{}','{}',now(),now()
from unnest(array['booking-owner','booking-other','booking-host','booking-viewer','booking-manager','booking-unverified','booking-expiring','booking-transfer']) x;
insert into public.spots(id,name,lat,lng,owner_id,status) values
 (pg_temp.booking_id('spot-a'),'Booking Fixture A',47.5,7.5,pg_temp.booking_id('booking-owner'),'approved'),
 (pg_temp.booking_id('spot-b'),'Booking Fixture B',47.5,7.5,pg_temp.booking_id('booking-owner'),'approved');

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_create_v1(uuid,uuid,uuid,uuid,timestamptz,integer,text,text,text,text,text)','execute'),'anon must not create');
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_read_v1(uuid,date)','execute'),'anon must not read');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.assert_operator(uuid)','execute'),'private assertion not callable by clients');
do $$ declare t text; begin
 foreach t in array array['booking_restaurant_settings','booking_restaurant_areas','booking_restaurant_tables','booking_restaurant_services','booking_reservations','booking_audit_events'] loop
   perform pg_temp.booking_assert(not has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE'),'anon table grants: '||t);
   perform pg_temp.booking_assert(not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),'direct mutation grants: '||t);
   perform pg_temp.booking_assert((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'missing RLS: '||t);
 end loop;
end $$;

update auth.users set email_confirmed_at=now() where id in (select pg_temp.booking_id(x) from unnest(array['booking-owner','booking-other','booking-host','booking-viewer','booking-manager','booking-expiring','booking-transfer']) x);
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)->'settings'='null','fresh console has no fabricated setup');
select pg_temp.booking_assert(public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'))=1,'owner setup save');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));

select pg_temp.booking_assert(not has_table_privilege('authenticated','public.booking_team_members','SELECT,INSERT,UPDATE,DELETE'),'raw membership grants');
select pg_temp.booking_assert(not has_table_privilege('authenticated','booking_private.team_invitations_v1','SELECT,INSERT,UPDATE,DELETE'),'invitation hashes exposed');
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_invitation_v1(text,boolean)','execute'),'anonymous invitation acceptance');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.console_role_v1(uuid)','execute'),'private role helper callable');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.assert_console_access_v1(uuid,text)','execute'),'private authorization exposed');
select pg_temp.booking_assert((public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{access,role}')='owner','owner access missing');

do $$ declare s uuid:=pg_temp.booking_id('spot-a'); a jsonb; b jsonb; begin
 a:=public.booking_console_invite_v1(s,pg_temp.booking_id('invite-host'),' BOOKING-HOST@booking.invalid ','host',repeat('a',64));
 b:=public.booking_console_invite_v1(s,pg_temp.booking_id('invite-host'),'booking-host@booking.invalid','host',repeat('a',64));
 perform pg_temp.booking_assert(a=b,'invite retry changed identity/expiry');
 perform pg_temp.booking_assert((a->>'expires_at')::timestamptz>now() and (a->>'expires_at')::timestamptz<=clock_timestamp()+interval '7 days','unbounded invitation expiry');
 begin perform public.booking_console_invite_v1(s,pg_temp.booking_id('invite-host'),'booking-host@booking.invalid','manager',repeat('a',64)); raise exception 'replayed invite changed role'; exception when invalid_parameter_value then if sqlerrm<>'booking_request_reused' then raise; end if; end;
 begin perform public.booking_console_invite_v1(s,pg_temp.booking_id('invite-duplicate'),'booking-host@booking.invalid','manager',repeat('f',64)); raise exception 'duplicate pending invitation'; exception when invalid_parameter_value then if sqlerrm<>'booking_invitation_exists' then raise; end if; end;
 perform public.booking_console_invite_v1(s,pg_temp.booking_id('invite-viewer'),'booking-viewer@booking.invalid','viewer',repeat('b',64));
 perform public.booking_console_invite_v1(s,pg_temp.booking_id('invite-manager'),'booking-manager@booking.invalid','manager',repeat('c',64));
 perform public.booking_console_invite_v1(s,pg_temp.booking_id('invite-unverified'),'booking-unverified@booking.invalid','host',repeat('d',64));
 perform public.booking_console_invite_v1(s,pg_temp.booking_id('invite-expiring'),'booking-expiring@booking.invalid','host',repeat('1',64));
 perform pg_temp.booking_assert(not (public.booking_console_team_v1(s)::text like '%token_hash%') and not (public.booking_console_team_v1(s)::text like '%'||repeat('a',64)||'%'),'team read leaks invitation secret');
 begin perform public.booking_console_invite_v1(s,pg_temp.booking_id('invite-self'),'booking-owner@booking.invalid','manager',repeat('e',64)); raise exception 'owner invited self'; exception when invalid_parameter_value then null; end;
end $$;

select pg_temp.booking_actor('booking-other');
do $$ begin begin perform public.booking_console_invitation_v1(repeat('a',64),false); raise exception 'wrong email learned invitation'; exception when invalid_parameter_value then if sqlerrm<>'booking_invitation_unavailable' then raise; end if; end; end $$;
select pg_temp.booking_actor('booking-unverified');
do $$ begin begin perform public.booking_console_invitation_v1(repeat('d',64),true); raise exception 'unverified email accepted'; exception when invalid_parameter_value then if sqlerrm<>'booking_invitation_unavailable' then raise; end if; end; end $$;
select pg_temp.booking_actor('booking-host');
select pg_temp.booking_assert((public.booking_console_invitation_v1(repeat('a',64),false)->>'accepted')::boolean=false,'preview accepted invitation');
do $$ begin begin perform public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date); raise exception 'preview granted access'; exception when insufficient_privilege then null; end; end $$;
select public.booking_console_invitation_v1(repeat('a',64),true);
select pg_temp.booking_assert((public.booking_console_invitation_v1(repeat('a',64),true)->>'accepted')::boolean,'accept replay');
select pg_temp.booking_assert((public.booking_console_access_v1(pg_temp.booking_id('spot-a'))->>'role')='host','host role missing');
select pg_temp.booking_assert((public.booking_console_spots_v1()#>>'{0,spot_id}')=pg_temp.booking_id('spot-a')::text and jsonb_array_length(public.booking_console_spots_v1())=1,'host spot discovery unscoped');
select pg_temp.booking_assert(not exists(select 1 from public.booking_reservations),'host raw guest SELECT bypassed RPC');
select pg_temp.booking_assert(not booking_private.is_operator(pg_temp.booking_id('spot-a')),'host became global/canonical owner');
do $$ declare s uuid:=pg_temp.booking_id('spot-a'); slot record; r uuid; begin
 select * into strict slot from public.booking_console_slots_v1(s,(now() at time zone 'Europe/Zurich')::date+1,2) order by starts_at limit 1;
 r:=public.booking_console_create_v1(s,pg_temp.booking_id('host-create'),slot.service_id,slot.table_id,slot.starts_at,2,'Synthetic host guest');
 perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('host-amend'),0,slot.service_id,slot.table_id,slot.starts_at,60,2,'Corrected by host');
 perform public.booking_console_set_status_v1(s,r,'confirmed','cancelled');
 perform pg_temp.booking_assert((select jsonb_array_length(public.booking_console_read_v1(s,(now() at time zone 'Europe/Zurich')::date+1)->'reservations'))=1,'host cannot read own service book');
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_reservations),'host raw guest read after a real reservation bypassed RPC');
 begin perform public.booking_console_save_setup_v1(s,1,pg_temp.booking_setup('a')); raise exception 'host changed setup'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_save_layout_v1(s,1,'[]'); raise exception 'host changed plan'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_save_closure_v1(s,1,pg_temp.booking_id('host-block'),current_date); raise exception 'host changed closures'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_team_v1(s); raise exception 'host viewed roster'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_read_v1(pg_temp.booking_id('spot-b'),current_date); raise exception 'host crossed restaurant'; exception when insufficient_privilege then null; end;
end $$;

select pg_temp.booking_actor('booking-viewer');
select public.booking_console_invitation_v1(repeat('b',64),true);
select pg_temp.booking_assert((public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{access,can_write}')='false','viewer can write flag');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_week_v1(pg_temp.booking_id('spot-a'),current_date)->'days')=7,'viewer week denied');
do $$ declare s uuid:=pg_temp.booking_id('spot-a'); slot record; begin
 select * into strict slot from public.booking_console_slots_v1(s,(now() at time zone 'Europe/Zurich')::date+1,2) order by starts_at limit 1;
 begin perform public.booking_console_create_v1(s,pg_temp.booking_id('viewer-create'),slot.service_id,slot.table_id,slot.starts_at,2,'Denied'); raise exception 'viewer created'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_amend_v1(s,pg_temp.booking_id('none'),pg_temp.booking_id('viewer-amend'),0,slot.service_id,slot.table_id,slot.starts_at,60,2,'Denied'); raise exception 'viewer amended'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_set_status_v1(s,pg_temp.booking_id('none'),'confirmed','cancelled'); raise exception 'viewer changed status'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_walk_in_v1(s,pg_temp.booking_id('viewer-walk'),slot.service_id,slot.table_id,2,60); raise exception 'viewer admitted'; exception when insufficient_privilege then null; end;
end $$;

select pg_temp.booking_actor('booking-manager');
select public.booking_console_invitation_v1(repeat('c',64),true);
select pg_temp.booking_assert((public.booking_console_access_v1(pg_temp.booking_id('spot-a'))->>'can_manage')='true','manager config denied');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),1,pg_temp.booking_setup('a'));
select public.booking_console_save_layout_v1(pg_temp.booking_id('spot-a'),2,jsonb_build_array(jsonb_build_object('table_id',pg_temp.booking_id('table-a'),'area_id',pg_temp.booking_id('area-a'),'layout',jsonb_build_object('x',10,'y',10,'width',100,'height',80,'shape','rectangle'))));
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{tables,0,layout,width}'='100','manager layout write did not persist');
select public.booking_console_save_closure_v1(pg_temp.booking_id('spot-a'),3,pg_temp.booking_id('manager-block'),(now() at time zone 'Europe/Zurich')::date+2);
do $$ begin
 begin perform public.booking_console_team_v1(pg_temp.booking_id('spot-a')); raise exception 'manager roster access'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('manager-invite'),'new@booking.invalid','manager',repeat('e',64)); raise exception 'manager delegated'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),0,'manager'); raise exception 'manager escalated host'; exception when insufficient_privilege then null; end;
end $$;

-- Only the database membership affects permission, not editable JWT metadata.
select pg_temp.booking_actor('booking-host');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.booking_id('booking-host'),'role','authenticated','user_metadata',jsonb_build_object('booking_role','owner'))::text,true);
do $$ begin begin perform public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),3,pg_temp.booking_setup('a')); raise exception 'user metadata escalated host'; exception when insufficient_privilege then null; end; end $$;

select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),0,'viewer')=1,'owner downgrade');
select pg_temp.booking_actor('booking-host');
select pg_temp.booking_assert((public.booking_console_access_v1(pg_temp.booking_id('spot-a'))->>'can_write')='false','downgrade stale');
select pg_temp.booking_assert(public.booking_console_invitation_v1(repeat('a',64),true)->>'role'='viewer','accepted old token restored host role');
do $$ begin begin perform public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('none'),'confirmed','cancelled'); raise exception 'downgraded member wrote'; exception when insufficient_privilege then null; end; end $$;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),1,'host');
select pg_temp.booking_assert(public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),2,null)=3,'revoke');
select pg_temp.booking_assert(public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),2,null)=3,'revoke retry duplicate revision');
do $$ begin begin perform public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),3,'manager'); raise exception 'revoked member resurrected without invite'; exception when invalid_parameter_value then null; end; end $$;
select pg_temp.booking_actor('booking-host');
do $$ begin
 begin perform public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date); raise exception 'revoked member read'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_invitation_v1(repeat('a',64),true); raise exception 'old token revived revocation'; exception when invalid_parameter_value then null; end;
end $$;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-host-again'),'booking-host@booking.invalid','host',repeat('f',64));
select pg_temp.booking_actor('booking-host');
select public.booking_console_invitation_v1(repeat('f',64),true);

reset role;
update booking_private.team_invitations_v1 set expires_at=now()-interval '1 minute' where id=pg_temp.booking_id('invite-expiring');
set local role authenticated;
select pg_temp.booking_actor('booking-expiring');
do $$ begin begin perform public.booking_console_invitation_v1(repeat('1',64),true); raise exception 'expired invitation accepted'; exception when invalid_parameter_value then null; end; end $$;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-expiring-new'),'booking-expiring@booking.invalid','viewer',repeat('2',64));
select public.booking_console_revoke_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-expiring-new'));
select pg_temp.booking_actor('booking-expiring');
do $$ begin begin perform public.booking_console_invitation_v1(repeat('2',64),true); raise exception 'revoked pending invitation accepted'; exception when invalid_parameter_value then null; end; end $$;

reset role;
create temporary table booking_team_clock(t timestamptz);
insert into booking_team_clock values((((now() at time zone 'Europe/Zurich')::date)+time '12:00') at time zone 'Europe/Zurich');
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select t from pg_temp.booking_team_clock $$;
set local role authenticated;
select pg_temp.booking_actor('booking-host');
do $$ declare s uuid:=pg_temp.booking_id('spot-a'); result jsonb; begin
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(s,2,60)->'slots')>0,'host walk-in preview');
 result:=public.booking_console_walk_in_v1(s,pg_temp.booking_id('host-walk-in'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60);
 perform public.booking_console_set_status_v1(s,(result->>'id')::uuid,'seated','completed');
end $$;

-- Ownership transfer revokes grants even if the original owner later returns.
reset role;
update public.spots set owner_id=pg_temp.booking_id('booking-transfer') where id=pg_temp.booking_id('spot-a');
set local role authenticated;
select pg_temp.booking_actor('booking-transfer');
select pg_temp.booking_assert(public.booking_console_access_v1(pg_temp.booking_id('spot-a'))->>'role'='owner','new owner role');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_team_v1(pg_temp.booking_id('spot-a'))->'members')=0,'new owner inherited old grants');
select pg_temp.booking_actor('booking-manager');
do $$ begin begin perform public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date); raise exception 'ownership transfer kept staff'; exception when insufficient_privilege then null; end; end $$;
reset role;
update public.spots set owner_id=pg_temp.booking_id('booking-owner') where id=pg_temp.booking_id('spot-a');
set local role authenticated;
select pg_temp.booking_actor('booking-host');
do $$ begin
 begin perform public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date); raise exception 'returning owner revived old staff'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_invitation_v1(repeat('f',64),true); raise exception 'returning owner revived old invitation'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
select pg_temp.booking_assert((select count(*) from public.booking_audit_events where spot_id=pg_temp.booking_id('spot-a') and action='team_joined')=4,'acceptance retries duplicated audit');
select pg_temp.booking_assert((select count(*) from public.booking_audit_events where spot_id=pg_temp.booking_id('spot-a') and action='team_member_revoked')=1,'revocation retries duplicated audit');
select pg_temp.booking_assert(not exists(select 1 from public.booking_audit_events where spot_id=pg_temp.booking_id('spot-a') and (details::text like '%'||repeat('a',64)||'%' or details::text like '%token_hash%')),'audit exposes invitation credential');
rollback;
