-- Restaurant attendance remains an adapter-specific lifecycle. No public intake.
-- Existing v1 RPC signatures stay callable; read advertises the new capability
-- so a newer Web client can be deployed safely against the previous backend.
alter table public.booking_reservations drop constraint booking_reservations_status_check;
alter table public.booking_reservations add constraint booking_reservations_status_check check
    (status in ('pending','confirmed','arrived','seated','completed','cancelled','declined','no_show'));
alter table public.booking_reservations
  add column arrived_at timestamptz,
  add column seated_at timestamptz,
  add column completed_at timestamptz;

-- Replace the v1 constraint atomically; preserve its name and columns and
-- expand its occupying predicate. Existing rows are validated on replacement.
alter table public.booking_reservations drop constraint booking_reservations_table_id_tstzrange_excl;
set local search_path = public, extensions;
alter table public.booking_reservations add constraint booking_reservations_table_id_tstzrange_excl
  exclude using gist (table_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('pending','confirmed','arrived','seated'));

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_operator(p_spot_id);
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true),
   'settings', (select to_jsonb(s) from public.booking_restaurant_settings s where spot_id=p_spot_id),
   'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.booking_restaurant_areas a where spot_id=p_spot_id), '[]'),
   'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.label) from public.booking_restaurant_tables t where spot_id=p_spot_id), '[]'),
   'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.opens_at) from public.booking_restaurant_services s where spot_id=p_spot_id), '[]'),
   'reservations', coalesce((select jsonb_agg(to_jsonb(r) order by r.starts_at) from public.booking_reservations r
     where spot_id=p_spot_id and starts_at >= (p_date::timestamp at time zone 'Europe/Zurich')
       and starts_at < ((p_date+1)::timestamp at time zone 'Europe/Zurich')), '[]')
 );
end;
$$;

create or replace function public.booking_console_slots_v1(p_spot_id uuid,p_date date,p_party_size integer)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_settings public.booking_restaurant_settings%rowtype;
begin
 perform booking_private.assert_operator(p_spot_id);
 select * into v_settings from public.booking_restaurant_settings where spot_id=p_spot_id;
 if not found then return; end if;
 if p_date is null or p_date < (now() at time zone 'Europe/Zurich')::date or p_date > (now() at time zone 'Europe/Zurich')::date+365
   or p_party_size is null or p_party_size not between 1 and v_settings.max_party_size then
   raise exception 'invalid_booking_date_or_party' using errcode='22023';
 end if;
 return query
 select distinct s.id, g.slot at time zone 'Europe/Zurich', (g.slot at time zone 'Europe/Zurich')+make_interval(mins=>v_settings.duration_minutes), t.id
 from public.booking_restaurant_services s
 cross join lateral generate_series((p_date+s.opens_at)::timestamp,
   (p_date+s.closes_at)::timestamp-make_interval(mins=>v_settings.duration_minutes),make_interval(mins=>s.interval_minutes)) g(slot)
 join public.booking_restaurant_tables t on t.spot_id=s.spot_id and t.is_active and t.seats>=p_party_size
 join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
 where s.spot_id=p_spot_id and s.is_active and extract(dow from p_date)::integer=any(s.weekdays)
   and (g.slot at time zone 'Europe/Zurich')>now()
   and not exists(select 1 from public.booking_reservations r where r.table_id=t.id and r.status in ('pending','confirmed','arrived','seated')
     and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(g.slot at time zone 'Europe/Zurich',
       (g.slot at time zone 'Europe/Zurich')+make_interval(mins=>v_settings.duration_minutes),'[)'))
 order by 2,4;
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
 update public.booking_reservations set status=p_status,updated_at=now(),
   arrived_at=case when p_status in ('arrived','seated') then coalesce(arrived_at,now()) else arrived_at end,
   seated_at=case when p_status='seated' then now() else seated_at end,
   completed_at=case when p_status='completed' then now() else completed_at end
 where id=v_row.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,v_row.id,auth.uid(),v_row.status||'_to_'||p_status);
end;
$$;

-- Setup's capacity guard must include all states that occupy inventory.
-- Preserve the complete v1 setup contract; only its occupancy predicate changes.
create or replace function public.booking_console_save_setup_v1(p_spot_id uuid, p_revision bigint, p_setup jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_item jsonb;
begin
 perform booking_private.assert_operator(p_spot_id);
 if jsonb_typeof(p_setup) is distinct from 'object'
   or jsonb_typeof(p_setup->'areas') is distinct from 'array'
   or jsonb_typeof(p_setup->'tables') is distinct from 'array'
   or jsonb_typeof(p_setup->'services') is distinct from 'array'
   or p_revision is null or p_revision < 0
   or jsonb_array_length(p_setup->'areas') > 30
   or jsonb_array_length(p_setup->'tables') > 200
   or jsonb_array_length(p_setup->'services') > 30 then
   raise exception 'invalid_booking_setup' using errcode='22023';
 end if;
 insert into public.booking_restaurant_settings(spot_id) values(p_spot_id) on conflict do nothing;
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if v_revision <> p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
 -- Cross-restaurant identifiers can never be reassigned, even by a multi-spot owner.
 if exists (select 1 from public.booking_restaurant_areas a join jsonb_array_elements(p_setup->'areas') j on a.id=(j->>'id')::uuid where a.spot_id<>p_spot_id)
   or exists (select 1 from public.booking_restaurant_tables t join jsonb_array_elements(p_setup->'tables') j on t.id=(j->>'id')::uuid where t.spot_id<>p_spot_id)
   or exists (select 1 from public.booking_restaurant_services s join jsonb_array_elements(p_setup->'services') j on s.id=(j->>'id')::uuid where s.spot_id<>p_spot_id) then
   raise exception 'booking_resource_spot_mismatch' using errcode='42501';
 end if;
 update public.booking_restaurant_settings set
   duration_minutes=(p_setup->>'duration_minutes')::integer,
   max_party_size=(p_setup->>'max_party_size')::integer,
   revision=revision+1, updated_at=now() where spot_id=p_spot_id;
 -- Retain resource identities referenced by reservations; missing resources retire.
 update public.booking_restaurant_areas set is_active=false where spot_id=p_spot_id;
 update public.booking_restaurant_tables set is_active=false where spot_id=p_spot_id;
 update public.booking_restaurant_services set is_active=false where spot_id=p_spot_id;
 for v_item in select * from jsonb_array_elements(p_setup->'areas') loop
   insert into public.booking_restaurant_areas(id,spot_id,name,is_active)
   values((v_item->>'id')::uuid,p_spot_id,trim(v_item->>'name'),(v_item->>'is_active')::boolean)
   on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 end loop;
 for v_item in select * from jsonb_array_elements(p_setup->'tables') loop
   if exists(select 1 from public.booking_reservations r where r.table_id=(v_item->>'id')::uuid
       and r.status in ('pending','confirmed','arrived','seated') and r.ends_at>now() and r.party_size>(v_item->>'seats')::integer) then
     raise exception 'booking_table_has_larger_reservation' using errcode='22023';
   end if;
   insert into public.booking_restaurant_tables(id,spot_id,area_id,label,seats,is_active)
   values((v_item->>'id')::uuid,p_spot_id,(v_item->>'area_id')::uuid,trim(v_item->>'label'),(v_item->>'seats')::integer,(v_item->>'is_active')::boolean)
   on conflict(id) do update set area_id=excluded.area_id,label=excluded.label,seats=excluded.seats,is_active=excluded.is_active;
 end loop;
 for v_item in select * from jsonb_array_elements(p_setup->'services') loop
   insert into public.booking_restaurant_services(id,spot_id,name,weekdays,opens_at,closes_at,interval_minutes,is_active)
   values((v_item->>'id')::uuid,p_spot_id,trim(v_item->>'name'),array(select jsonb_array_elements_text(v_item->'weekdays')::integer),
     (v_item->>'opens_at')::time,(v_item->>'closes_at')::time,(v_item->>'interval_minutes')::integer,(v_item->>'is_active')::boolean)
   on conflict(id) do update set name=excluded.name,weekdays=excluded.weekdays,opens_at=excluded.opens_at,
     closes_at=excluded.closes_at,interval_minutes=excluded.interval_minutes,is_active=excluded.is_active;
 end loop;
 insert into public.booking_audit_events(spot_id,actor_id,action) values(p_spot_id,auth.uid(),'setup_saved');
 return v_revision+1;
end;
$$;

