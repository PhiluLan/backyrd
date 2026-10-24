-- Enrich the existing audit path; guest text and request credentials are never copied.
create function booking_private.reservation_audit_state_v1(r public.booking_reservations) returns jsonb
language sql stable set search_path='' as $$
 select case when r.id is null then null else jsonb_build_object(
  'revision',r.revision,'status',r.status,'party_size',r.party_size,
  'starts_at',r.starts_at,'ends_at',r.ends_at,'table_id',r.table_id,'service_id',r.service_id,
  'table_label',(select label from public.booking_restaurant_tables where id=r.table_id and spot_id=r.spot_id),
  'service_name',(select name from public.booking_restaurant_services where id=r.service_id and spot_id=r.spot_id),
  'arrived_at',r.arrived_at,'seated_at',r.seated_at,'completed_at',r.completed_at) end;
$$;
create function booking_private.reservation_audit_v1(b public.booking_reservations,a public.booking_reservations) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('schema','reservation_history_v1','actor_role',booking_private.console_role_v1(a.spot_id),
  'before',booking_private.reservation_audit_state_v1(b),'after',booking_private.reservation_audit_state_v1(a),
  'changed_fields',to_jsonb(array_remove(array[
   case when b.id is not null and b.guest_name is distinct from a.guest_name then 'guest_name' end,
   case when b.id is not null and b.guest_contact is distinct from a.guest_contact then 'guest_contact' end,
   case when b.id is not null and b.note is distinct from a.note then 'note' end],null)));
$$;
revoke all on function booking_private.reservation_audit_state_v1(public.booking_reservations),
 booking_private.reservation_audit_v1(public.booking_reservations,public.booking_reservations) from public,anon,authenticated;

create or replace function public.booking_console_create_v1(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,p_starts_at timestamptz,
 p_party_size integer,p_guest_name text,p_guest_contact text default null,p_note text default null,p_source text default 'operator',p_status text default 'confirmed')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_end timestamptz; v_existing public.booking_reservations%rowtype;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_request_id is null or p_status is null or p_status not in ('pending','confirmed') then
   raise exception 'invalid_booking_request' using errcode='22023';
 end if;
 -- All setup/booking/state writes lock the same restaurant row. The exclusion
 -- constraint additionally enforces no overlap at the database boundary.
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select * into v_existing from public.booking_reservations where spot_id=p_spot_id and request_id=p_request_id;
 if found then
   if v_existing.creation_fingerprint is not null then
     if v_existing.creation_fingerprint is distinct from booking_private.creation_fingerprint_v1(
       p_service_id,p_table_id,p_starts_at,p_party_size,p_guest_name,p_guest_contact,p_note,p_source) then
       raise exception 'booking_request_reused' using errcode='22023';
     end if;
     return v_existing.id;
   end if;
   if v_existing.service_id is distinct from p_service_id or v_existing.table_id is distinct from p_table_id or v_existing.starts_at is distinct from p_starts_at
     or v_existing.party_size is distinct from p_party_size or v_existing.guest_name is distinct from trim(p_guest_name)
     or v_existing.guest_contact is distinct from nullif(trim(p_guest_contact),'')
     or v_existing.note is distinct from nullif(trim(p_note),'') or v_existing.source is distinct from p_source then
     raise exception 'booking_request_reused' using errcode='22023';
   end if;
   return v_existing.id;
 end if;
 select s.ends_at into v_end from public.booking_console_slots_v1(p_spot_id,(p_starts_at at time zone 'Europe/Zurich')::date,p_party_size) s
 where s.service_id=p_service_id and s.table_id=p_table_id and s.starts_at=p_starts_at limit 1;
 if v_end is null then raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 insert into public.booking_reservations(spot_id,request_id,service_id,table_id,starts_at,ends_at,party_size,guest_name,guest_contact,note,source,status,created_by)
 values(p_spot_id,p_request_id,p_service_id,p_table_id,p_starts_at,v_end,p_party_size,trim(p_guest_name),nullif(trim(p_guest_contact),''),nullif(trim(p_note),''),p_source,p_status,auth.uid())
 returning id into v_id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot_id,v_id,auth.uid(),'reservation_created',clock_timestamp(),booking_private.reservation_audit_v1(null,(select r from public.booking_reservations r where r.id=v_id)));
 return v_id;
end;
$$;

create or replace function public.booking_console_amend_v1(p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,
 p_service_id uuid,p_table_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_party_size integer,
 p_guest_name text,p_guest_contact text default null,p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; v_end timestamptz; v_same boolean; v_inventory_changed boolean; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_duration_minutes is null
  or p_duration_minutes not between 30 and 480 then raise exception 'invalid_booking_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 select * into r from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 v_end:=p_starts_at+make_interval(mins=>p_duration_minutes);
 v_inventory_changed:=r.service_id is distinct from p_service_id or r.table_id is distinct from p_table_id
  or r.starts_at is distinct from p_starts_at or r.ends_at is distinct from v_end or r.party_size is distinct from p_party_size;
 v_same:=not v_inventory_changed and r.guest_name is not distinct from trim(p_guest_name)
  and r.guest_contact is not distinct from nullif(trim(p_guest_contact),'') and r.note is not distinct from nullif(trim(p_note),'');
 if r.last_amend_request_id=p_request_id then
  if not v_same then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return r.id;
 end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and last_amend_request_id=p_request_id) then
  raise exception 'booking_request_reused' using errcode='22023'; end if;
 if r.revision<>p_expected_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if r.status not in ('pending','confirmed','arrived','seated') or (v_inventory_changed and r.status not in ('pending','confirmed')) then
  raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 if v_same then return r.id; end if;
 if v_inventory_changed and not exists(select 1 from booking_private.slots_for_amendment_v1(
   p_spot_id,(p_starts_at at time zone 'Europe/Zurich')::date,p_party_size,p_duration_minutes,r.id) s
   where s.service_id=p_service_id and s.table_id=p_table_id and s.starts_at=p_starts_at and s.ends_at=v_end) then
  raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 update public.booking_reservations set service_id=p_service_id,table_id=p_table_id,starts_at=p_starts_at,ends_at=v_end,
  party_size=p_party_size,guest_name=trim(p_guest_name),guest_contact=nullif(trim(p_guest_contact),''),note=nullif(trim(p_note),''),
  revision=revision+1,updated_at=now(),last_amend_request_id=p_request_id,
  creation_fingerprint=coalesce(creation_fingerprint,booking_private.creation_fingerprint_v1(r.service_id,r.table_id,r.starts_at,r.party_size,r.guest_name,r.guest_contact,r.note,r.source))
 where id=r.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot_id,r.id,auth.uid(),'reservation_amended',clock_timestamp(),booking_private.reservation_audit_v1(r,(select a from public.booking_reservations a where a.id=r.id)));
 return r.id;
end $$;

create or replace function public.booking_console_set_status_v1(p_spot_id uuid,p_reservation_id uuid,p_expected_status text,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.booking_reservations%rowtype;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 -- Shared lock order with setup/create prevents state/setup allocation races.
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 select * into v_row from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 -- An identical retry after a lost response is successful, with no second
 -- event. Compare-and-set still rejects a stale attempt to a different target.
 if p_status = v_row.status and p_expected_status is distinct from p_status
   and exists(select 1 from public.booking_audit_events e where e.reservation_id=v_row.id
     and e.actor_id=auth.uid() and e.action=p_expected_status||'_to_'||p_status) then return; end if;
 if p_expected_status is distinct from v_row.status then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if p_status is null or not (
   (v_row.status='pending' and p_status in ('confirmed','declined','cancelled')) or
   (v_row.status='confirmed' and p_status='cancelled') or
   (v_row.status='confirmed' and p_status='no_show' and v_row.starts_at<=now()) or
   (v_row.status in ('confirmed','arrived') and p_status in ('arrived','seated') and p_status<>v_row.status
     and (v_row.starts_at at time zone 'Europe/Zurich')::date=(now() at time zone 'Europe/Zurich')::date) or
   (v_row.status='arrived' and p_status='cancelled') or
   (v_row.status='seated' and p_status='completed')
 ) then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 if p_status='seated' and exists(select 1 from public.booking_reservations other
   where other.table_id=v_row.table_id and other.id<>v_row.id and other.status='seated') then
   raise exception 'booking_table_occupied' using errcode='22023';
 end if;
 update public.booking_reservations set status=p_status,revision=revision+1,updated_at=now(),
   arrived_at=case when p_status in ('arrived','seated') then coalesce(arrived_at,now()) else arrived_at end,
   seated_at=case when p_status='seated' then now() else seated_at end,
   completed_at=case when p_status='completed' then now() else completed_at end
 where id=v_row.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot_id,v_row.id,auth.uid(),v_row.status||'_to_'||p_status,clock_timestamp(),booking_private.reservation_audit_v1(v_row,(select a from public.booking_reservations a where a.id=v_row.id)));
end;
$$;

create or replace function public.booking_console_walk_in_v1(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,
 p_party_size integer,p_duration_minutes integer,p_guest_name text default null,p_guest_contact text default null,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; v_start timestamptz; v_end timestamptz;
 v_name text:=coalesce(nullif(trim(p_guest_name),''),'Walk-in'); v_original text; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_request_id is null then raise exception 'invalid_booking_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select * into r from public.booking_reservations where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  v_original:=coalesce(r.creation_fingerprint,booking_private.creation_fingerprint_v1(r.service_id,r.table_id,r.starts_at,r.party_size,r.guest_name,r.guest_contact,r.note,r.source));
  if not r.is_walk_in or r.ends_at-r.starts_at is distinct from make_interval(mins=>p_duration_minutes)
   or v_original is distinct from booking_private.creation_fingerprint_v1(p_service_id,p_table_id,r.starts_at,p_party_size,v_name,p_guest_contact,p_note,'walk_in') then
   raise exception 'booking_request_reused' using errcode='22023'; end if;
 else
  -- Capture admission time AFTER waiting for the restaurant write lock.
  v_start:=booking_private.admission_clock_v1();
  select s.ends_at into v_end from booking_private.walk_in_slots_v1(p_spot_id,v_start,p_party_size,p_duration_minutes) s
   where s.service_id=p_service_id and s.table_id=p_table_id limit 1;
  if v_end is null then raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
  insert into public.booking_reservations(spot_id,request_id,service_id,table_id,starts_at,ends_at,party_size,guest_name,guest_contact,note,
   source,status,is_walk_in,arrived_at,seated_at,created_by)
  values(p_spot_id,p_request_id,p_service_id,p_table_id,v_start,v_end,p_party_size,v_name,nullif(trim(p_guest_contact),''),nullif(trim(p_note),''),
   'walk_in','seated',true,v_start,v_start,auth.uid()) returning * into r;
  insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot_id,r.id,auth.uid(),'walk_in_created',clock_timestamp(),booking_private.reservation_audit_v1(null,r));
 end if;
 return jsonb_build_object('id',r.id,'service_id',r.service_id,'table_id',r.table_id,'starts_at',r.starts_at,'ends_at',r.ends_at);
end $$;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true),
   'access',booking_private.console_access_v1(p_spot_id),
   'operating_date', (now() at time zone 'Europe/Zurich')::date,
   'settings', (select to_jsonb(s) from public.booking_restaurant_settings s where spot_id=p_spot_id),
   'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.booking_restaurant_areas a where spot_id=p_spot_id), '[]'),
   'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.label) from public.booking_restaurant_tables t where spot_id=p_spot_id), '[]'),
   'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.opens_at) from public.booking_restaurant_services s where spot_id=p_spot_id), '[]'),
   'unclosed_visits', case when p_date=(now() at time zone 'Europe/Zurich')::date then
     coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at)
       from public.booking_reservations r where r.spot_id=p_spot_id and r.status='seated'
         and r.starts_at<(p_date::timestamp at time zone 'Europe/Zurich')), '[]'::jsonb) else '[]'::jsonb end,
   'closures',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('affected_reservations',booking_private.closure_affected_v1(p_spot_id,c.starts_at,c.ends_at,c.service_id,c.area_id)) order by c.starts_at,c.id) from public.booking_restaurant_closures c where spot_id=p_spot_id and book_date=p_date),'[]'),
   'reservations', coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at) from public.booking_reservations r
     where spot_id=p_spot_id and starts_at >= (p_date::timestamp at time zone 'Europe/Zurich')
       and starts_at < ((p_date+1)::timestamp at time zone 'Europe/Zurich')), '[]')
 );
end;
$$;

-- Keyset pagination is scoped to one restaurant AND one reservation, including cursors.
create index booking_audit_reservation_history on public.booking_audit_events(spot_id,reservation_id,created_at desc,id desc)
 where reservation_id is not null;
create function public.booking_console_history_v1(p_spot_id uuid,p_reservation_id uuid,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; c public.booking_audit_events%rowtype; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if p_before_id is not null then
  select * into c from public.booking_audit_events where id=p_before_id and spot_id=p_spot_id and reservation_id=p_reservation_id;
  if not found then raise exception 'invalid_booking_history_cursor' using errcode='22023'; end if;
 end if;
 with candidates as materialized (
  select e.* from public.booking_audit_events e where e.spot_id=p_spot_id and e.reservation_id=p_reservation_id
   and (p_before_id is null or (e.created_at,e.id)<(c.created_at,c.id))
   order by e.created_at desc,e.id desc limit 51
 ), page as (select * from candidates order by created_at desc,id desc limit 50)
 select jsonb_build_object('reservation_id',r.id,'revision',r.revision,'observed_at',clock_timestamp(),
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'at',e.created_at,'action',e.action,
   'actor_id',e.actor_id,'actor_is_you',coalesce(e.actor_id=auth.uid(),false),
   'details',case when e.details->>'schema'='reservation_history_v1' then e.details else null end)
   order by e.created_at desc,e.id desc) from page e),'[]'::jsonb),
  'next_cursor',case when (select count(*) from candidates)>50 then (select id from page order by created_at,id limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.booking_console_history_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_console_history_v1(uuid,uuid,uuid) to authenticated;
