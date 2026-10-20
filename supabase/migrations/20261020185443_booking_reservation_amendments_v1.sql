-- Atomic operator amendments. No public guest intake or messaging.
alter table public.booking_reservations
 add column revision bigint not null default 0 check (revision>=0),
 add column last_amend_request_id uuid,
 add column creation_fingerprint text;
create unique index booking_reservations_amend_request
 on public.booking_reservations(spot_id,last_amend_request_id) where last_amend_request_id is not null;

-- Keep only a digest of the immutable original create payload when a booking
-- is first edited. Original create retries must still replay the same ID after
-- an amendment; they must never restore old guest text or allocate again.
-- Status is excluded deliberately to retain the v1 create-replay contract.
create function booking_private.creation_fingerprint_v1(p_service uuid,p_table uuid,p_start timestamptz,
 p_party integer,p_name text,p_contact text,p_note text,p_source text) returns text
language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(p_service,p_table,extract(epoch from p_start),p_party,
   trim(p_name),nullif(trim(p_contact),''),nullif(trim(p_note),''),p_source)::text,'UTF8')),'hex');
$$;

-- Shared inventory enumeration. Only checked public wrappers may exclude the
-- operator's target reservation; clients cannot supply arbitrary exclusions.
create function booking_private.slots_for_amendment_v1(p_spot_id uuid,p_date date,p_party_size integer,p_duration_minutes integer,p_exclude uuid)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql set search_path='' as $$
declare v_settings public.booking_restaurant_settings%rowtype; v_duration integer;
begin
 select * into v_settings from public.booking_restaurant_settings where spot_id=p_spot_id;
 if not found then return; end if;
 v_duration:=coalesce(p_duration_minutes,v_settings.duration_minutes);
 if p_date is null or p_date < (now() at time zone 'Europe/Zurich')::date or p_date > (now() at time zone 'Europe/Zurich')::date+365
  or p_party_size is null or p_party_size not between 1 and v_settings.max_party_size
  or v_duration not between 30 and 480 then raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 return query
 select distinct s.id,g.slot at time zone 'Europe/Zurich',(g.slot at time zone 'Europe/Zurich')+make_interval(mins=>v_duration),t.id
 from public.booking_restaurant_services s
 cross join lateral generate_series((p_date+s.opens_at)::timestamp,
   (p_date+s.closes_at)::timestamp-make_interval(mins=>v_duration),make_interval(mins=>s.interval_minutes)) g(slot)
 join public.booking_restaurant_tables t on t.spot_id=s.spot_id and t.is_active and t.seats>=p_party_size
 join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
 where s.spot_id=p_spot_id and s.is_active and extract(dow from p_date)::integer=any(s.weekdays)
  and (g.slot at time zone 'Europe/Zurich')>now()
  and not exists(select 1 from public.booking_reservations r where r.table_id=t.id
   and (p_exclude is null or r.id<>p_exclude) and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(g.slot at time zone 'Europe/Zurich',
     (g.slot at time zone 'Europe/Zurich')+make_interval(mins=>v_duration),'[)'))
 order by 2,4;
end;
$$;
revoke all on function booking_private.creation_fingerprint_v1(uuid,uuid,timestamptz,integer,text,text,text,text),
 booking_private.slots_for_amendment_v1(uuid,date,integer,integer,uuid) from public,anon,authenticated;

create or replace function public.booking_console_slots_v1(p_spot_id uuid,p_date date,p_party_size integer)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_operator(p_spot_id);
 return query select * from booking_private.slots_for_amendment_v1(p_spot_id,p_date,p_party_size,null,null);
end $$;

create function public.booking_console_amendment_slots_v1(p_spot_id uuid,p_reservation_id uuid,p_date date,p_party_size integer,p_duration_minutes integer)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; begin
 perform booking_private.assert_operator(p_spot_id);
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if r.status not in ('pending','confirmed') then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 if p_duration_minutes is null then raise exception 'invalid_booking_duration' using errcode='22023'; end if;
 return query select * from booking_private.slots_for_amendment_v1(p_spot_id,p_date,p_party_size,p_duration_minutes,r.id);
end $$;

create function public.booking_console_amend_v1(p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,
 p_service_id uuid,p_table_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_party_size integer,
 p_guest_name text,p_guest_contact text default null,p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; v_end timestamptz; v_same boolean; v_inventory_changed boolean; begin
 perform booking_private.assert_operator(p_spot_id);
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
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,r.id,auth.uid(),'reservation_amended');
 return r.id;
end $$;
revoke all on function public.booking_console_amendment_slots_v1(uuid,uuid,date,integer,integer),
 public.booking_console_amend_v1(uuid,uuid,uuid,bigint,uuid,uuid,timestamptz,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.booking_console_amendment_slots_v1(uuid,uuid,date,integer,integer),
 public.booking_console_amend_v1(uuid,uuid,uuid,bigint,uuid,uuid,timestamptz,integer,integer,text,text,text) to authenticated;

-- Preserve create replay identity and include status writes in amendment revisions.
create or replace function public.booking_console_create_v1(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,p_starts_at timestamptz,
 p_party_size integer,p_guest_name text,p_guest_contact text default null,p_note text default null,p_source text default 'operator',p_status text default 'confirmed')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_end timestamptz; v_existing public.booking_reservations%rowtype;
begin
 perform booking_private.assert_operator(p_spot_id);
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
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,v_id,auth.uid(),'reservation_created');
 return v_id;
end;
$$;

create or replace function public.booking_console_set_status_v1(p_spot_id uuid,p_reservation_id uuid,p_expected_status text,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.booking_reservations%rowtype;
begin
 perform booking_private.assert_operator(p_spot_id);
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
 update public.booking_reservations set status=p_status,revision=revision+1,updated_at=now(),
   arrived_at=case when p_status in ('arrived','seated') then coalesce(arrived_at,now()) else arrived_at end,
   seated_at=case when p_status='seated' then now() else seated_at end,
   completed_at=case when p_status='completed' then now() else completed_at end
 where id=v_row.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,v_row.id,auth.uid(),v_row.status||'_to_'||p_status);
end;
$$;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_operator(p_spot_id);
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true),
   'settings', (select to_jsonb(s) from public.booking_restaurant_settings s where spot_id=p_spot_id),
   'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.booking_restaurant_areas a where spot_id=p_spot_id), '[]'),
   'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.label) from public.booking_restaurant_tables t where spot_id=p_spot_id), '[]'),
   'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.opens_at) from public.booking_restaurant_services s where spot_id=p_spot_id), '[]'),
   'reservations', coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at) from public.booking_reservations r
     where spot_id=p_spot_id and starts_at >= (p_date::timestamp at time zone 'Europe/Zurich')
       and starts_at < ((p_date+1)::timestamp at time zone 'Europe/Zurich')), '[]')
 );
end;
$$;

