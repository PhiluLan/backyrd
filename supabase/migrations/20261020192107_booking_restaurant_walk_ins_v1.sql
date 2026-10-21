-- Real current-time operator admissions, separate from a future reservation's
-- walk_in source label. No public intake, messaging or payment side effects.
alter table public.booking_reservations
 add column is_walk_in boolean not null default false,
 add constraint booking_walk_in_source check (not is_walk_in or source='walk_in');

-- Private clock boundary allows transactional acceptance tests to advance
-- time without exposing any client-controlled admission timestamp.
create function booking_private.admission_clock_v1() returns timestamptz
language sql volatile set search_path='' as $$ select clock_timestamp(); $$;
revoke all on function booking_private.admission_clock_v1() from public,anon,authenticated;

create function booking_private.walk_in_services_v1(p_spot_id uuid,p_start timestamptz,p_duration integer)
returns setof public.booking_restaurant_services language sql stable set search_path='' as $$
 select s.* from public.booking_restaurant_services s
 where s.spot_id=p_spot_id and s.is_active
  and extract(dow from p_start at time zone 'Europe/Zurich')::integer=any(s.weekdays)
  and p_start>=(((p_start at time zone 'Europe/Zurich')::date+s.opens_at) at time zone 'Europe/Zurich')
  and p_start+make_interval(mins=>p_duration)<=(((p_start at time zone 'Europe/Zurich')::date+s.closes_at) at time zone 'Europe/Zurich');
$$;

create function booking_private.walk_in_slots_v1(p_spot_id uuid,p_start timestamptz,p_party integer,p_duration integer)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql set search_path='' as $$
declare v_max integer; begin
 select max_party_size into v_max from public.booking_restaurant_settings where spot_id=p_spot_id;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 if p_start is null or p_party is null or p_party not between 1 and v_max then
  raise exception 'invalid_booking_party_size' using errcode='22023'; end if;
 if p_duration is null or p_duration not between 30 and 480 then
  raise exception 'invalid_booking_duration' using errcode='22023'; end if;
 return query
 select s.id,p_start,p_start+make_interval(mins=>p_duration),t.id
 from booking_private.walk_in_services_v1(p_spot_id,p_start,p_duration) s
 join public.booking_restaurant_tables t on t.spot_id=s.spot_id and t.is_active and t.seats>=p_party
 join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
 where not exists(select 1 from public.booking_reservations current_visit where current_visit.table_id=t.id and current_visit.status='seated')
  and not exists(select 1 from public.booking_reservations r where r.table_id=t.id
   and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(p_start,p_start+make_interval(mins=>p_duration),'[)'))
 order by t.seats,t.label,s.id;
end $$;
revoke all on function booking_private.walk_in_services_v1(uuid,timestamptz,integer),
 booking_private.walk_in_slots_v1(uuid,timestamptz,integer,integer) from public,anon,authenticated;

create function public.booking_console_walk_in_slots_v1(p_spot_id uuid,p_party_size integer,p_duration_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_start timestamptz; v_slots jsonb; begin
 perform booking_private.assert_operator(p_spot_id);
 -- A short shared lock keeps configuration and both preview lists consistent
 -- with the same write serialization used by setup/reservations/attendance.
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for share;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 v_start:=booking_private.admission_clock_v1();
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('table_label',t.label,'seats',t.seats,
   'area_id',a.id,'area_name',a.name,'service_name',service.name) order by t.seats,t.label,s.service_id),'[]') into v_slots
  from booking_private.walk_in_slots_v1(p_spot_id,v_start,p_party_size,p_duration_minutes) s
  join public.booking_restaurant_tables t on t.id=s.table_id
  join public.booking_restaurant_areas a on a.id=t.area_id
  join public.booking_restaurant_services service on service.id=s.service_id;
 return jsonb_build_object('observed_at',v_start,'slots',v_slots,
  'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.opens_at,s.id)
   from booking_private.walk_in_services_v1(p_spot_id,v_start,p_duration_minutes) s),'[]'));
end $$;

create function public.booking_console_walk_in_v1(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,
 p_party_size integer,p_duration_minutes integer,p_guest_name text default null,p_guest_contact text default null,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; v_start timestamptz; v_end timestamptz;
 v_name text:=coalesce(nullif(trim(p_guest_name),''),'Walk-in'); v_original text; begin
 perform booking_private.assert_operator(p_spot_id);
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
  insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,r.id,auth.uid(),'walk_in_created');
 end if;
 return jsonb_build_object('id',r.id,'service_id',r.service_id,'table_id',r.table_id,'starts_at',r.starts_at,'ends_at',r.ends_at);
end $$;
revoke all on function public.booking_console_walk_in_slots_v1(uuid,integer,integer),
 public.booking_console_walk_in_v1(uuid,uuid,uuid,uuid,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.booking_console_walk_in_slots_v1(uuid,integer,integer),
 public.booking_console_walk_in_v1(uuid,uuid,uuid,uuid,integer,integer,text,text,text) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_operator(p_spot_id);
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true),
   'operating_date', (now() at time zone 'Europe/Zurich')::date,
   'settings', (select to_jsonb(s) from public.booking_restaurant_settings s where spot_id=p_spot_id),
   'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.booking_restaurant_areas a where spot_id=p_spot_id), '[]'),
   'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.label) from public.booking_restaurant_tables t where spot_id=p_spot_id), '[]'),
   'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.opens_at) from public.booking_restaurant_services s where spot_id=p_spot_id), '[]'),
   'unclosed_visits', case when p_date=(now() at time zone 'Europe/Zurich')::date then
     coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at)
       from public.booking_reservations r where r.spot_id=p_spot_id and r.status='seated'
         and r.starts_at<(p_date::timestamp at time zone 'Europe/Zurich')), '[]'::jsonb) else '[]'::jsonb end,
   'reservations', coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at) from public.booking_reservations r
     where spot_id=p_spot_id and starts_at >= (p_date::timestamp at time zone 'Europe/Zurich')
       and starts_at < ((p_date+1)::timestamp at time zone 'Europe/Zurich')), '[]')
 );
end;
$$;
