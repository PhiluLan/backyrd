-- Restaurant Console v1. Operator-only; no public guest booking grant.
-- The old consumer `reservations` table is an intent log, not bookable inventory.
create schema if not exists booking_private;
revoke all on schema booking_private from public, anon, authenticated;
grant usage on schema booking_private to authenticated;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.booking_restaurant_settings (
  spot_id uuid primary key references public.spots(id) on delete cascade,
  timezone text not null default 'Europe/Zurich' check (timezone = 'Europe/Zurich'),
  duration_minutes integer not null default 120 check (duration_minutes between 30 and 480),
  max_party_size integer not null default 8 check (max_party_size between 1 and 30),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.booking_restaurant_areas (
  id uuid primary key,
  spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  is_active boolean not null default true,
  unique (spot_id, id)
);
create table public.booking_restaurant_tables (
  id uuid primary key,
  spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
  area_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 40),
  seats integer not null check (seats between 1 and 30),
  is_active boolean not null default true,
  unique (spot_id, id),
  foreign key (spot_id, area_id) references public.booking_restaurant_areas(spot_id, id)
);
create unique index booking_table_active_label on public.booking_restaurant_tables(spot_id, lower(label)) where is_active;
create table public.booking_restaurant_services (
  id uuid primary key,
  spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  weekdays integer[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]),
  opens_at time not null,
  closes_at time not null,
  interval_minutes integer not null default 30 check (interval_minutes between 15 and 120),
  is_active boolean not null default true,
  check (closes_at > opens_at),
  unique (spot_id, id)
);
create table public.booking_reservations (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.booking_restaurant_settings(spot_id),
  table_id uuid not null,
  service_id uuid not null,
  request_id uuid not null,
  guest_name text not null check (length(trim(guest_name)) between 1 and 120),
  guest_contact text check (length(guest_contact) <= 320),
  note text check (length(note) <= 1000),
  party_size integer not null check (party_size between 1 and 30),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'confirmed' check (status in ('pending','confirmed','cancelled','declined','no_show')),
  source text not null check (source in ('phone','walk_in','email','operator')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (spot_id, table_id) references public.booking_restaurant_tables(spot_id, id),
  foreign key (spot_id, service_id) references public.booking_restaurant_services(spot_id, id),
  unique (spot_id, request_id),
  exclude using gist (table_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (status in ('pending','confirmed'))
);
create index booking_reservations_day on public.booking_reservations(spot_id, starts_at);
create index booking_tables_spot on public.booking_restaurant_tables(spot_id);
create index booking_areas_spot on public.booking_restaurant_areas(spot_id);
create index booking_services_spot on public.booking_restaurant_services(spot_id);
create table public.booking_audit_events (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.booking_restaurant_settings(spot_id),
  reservation_id uuid references public.booking_reservations(id),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);
create index booking_audit_spot on public.booking_audit_events(spot_id, created_at);

create function booking_private.is_operator(p_spot uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
   select 1 from public.spots where id=p_spot and owner_id=auth.uid()
 );
$$;
create function booking_private.assert_operator(p_spot uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not booking_private.is_operator(p_spot) then
   raise exception 'booking_operator_required' using errcode='42501';
 end if;
 perform public.safety_assert_user_can_perform_v2(auth.uid(), 'can_edit_owner_content');
end;
$$;
revoke all on all functions in schema booking_private from public, anon, authenticated;
grant execute on function booking_private.is_operator(uuid) to authenticated;

-- Read models remain RLS protected. Configuration, reservations and audit writes
-- only enter through the transactional RPCs below, never direct client DML.
alter table public.booking_restaurant_settings enable row level security;
alter table public.booking_restaurant_areas enable row level security;
alter table public.booking_restaurant_tables enable row level security;
alter table public.booking_restaurant_services enable row level security;
alter table public.booking_reservations enable row level security;
alter table public.booking_audit_events enable row level security;
create policy booking_settings_owner on public.booking_restaurant_settings for select to authenticated using (booking_private.is_operator(spot_id));
create policy booking_areas_owner on public.booking_restaurant_areas for select to authenticated using (booking_private.is_operator(spot_id));
create policy booking_tables_owner on public.booking_restaurant_tables for select to authenticated using (booking_private.is_operator(spot_id));
create policy booking_services_owner on public.booking_restaurant_services for select to authenticated using (booking_private.is_operator(spot_id));
create policy booking_reservations_owner on public.booking_reservations for select to authenticated using (booking_private.is_operator(spot_id));
create policy booking_audit_owner on public.booking_audit_events for select to authenticated using (booking_private.is_operator(spot_id));
revoke all on public.booking_restaurant_settings, public.booking_restaurant_areas, public.booking_restaurant_tables, public.booking_restaurant_services, public.booking_reservations, public.booking_audit_events from public, anon, authenticated;
grant select on public.booking_restaurant_settings, public.booking_restaurant_areas, public.booking_restaurant_tables, public.booking_restaurant_services, public.booking_reservations, public.booking_audit_events to authenticated;
grant all on public.booking_restaurant_settings, public.booking_restaurant_areas, public.booking_restaurant_tables, public.booking_restaurant_services, public.booking_reservations, public.booking_audit_events to service_role;

create function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_operator(p_spot_id);
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
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

create function public.booking_console_save_setup_v1(p_spot_id uuid, p_revision bigint, p_setup jsonb) returns bigint
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
       and r.status in ('pending','confirmed') and r.ends_at>now() and r.party_size>(v_item->>'seats')::integer) then
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

create function public.booking_console_slots_v1(p_spot_id uuid,p_date date,p_party_size integer)
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
   and not exists(select 1 from public.booking_reservations r where r.table_id=t.id and r.status in ('pending','confirmed')
     and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(g.slot at time zone 'Europe/Zurich',
       (g.slot at time zone 'Europe/Zurich')+make_interval(mins=>v_settings.duration_minutes),'[)'))
 order by 2,4;
end;
$$;

create function public.booking_console_create_v1(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,p_starts_at timestamptz,
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

create function public.booking_console_set_status_v1(p_spot_id uuid,p_reservation_id uuid,p_expected_status text,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.booking_reservations%rowtype;
begin
 perform booking_private.assert_operator(p_spot_id);
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 select * into v_row from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if p_expected_status is distinct from v_row.status then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if p_status is null or not (
   (v_row.status='pending' and p_status in ('confirmed','declined','cancelled')) or
   (v_row.status='confirmed' and p_status='cancelled') or
   (v_row.status='confirmed' and p_status='no_show' and v_row.starts_at<=now())
 ) then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 update public.booking_reservations set status=p_status,updated_at=now() where id=v_row.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,v_row.id,auth.uid(),v_row.status||'_to_'||p_status);
end;
$$;
revoke all on function public.booking_console_read_v1(uuid,date), public.booking_console_save_setup_v1(uuid,bigint,jsonb),
 public.booking_console_slots_v1(uuid,date,integer), public.booking_console_create_v1(uuid,uuid,uuid,uuid,timestamptz,integer,text,text,text,text,text),
 public.booking_console_set_status_v1(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.booking_console_read_v1(uuid,date), public.booking_console_save_setup_v1(uuid,bigint,jsonb),
 public.booking_console_slots_v1(uuid,date,integer), public.booking_console_create_v1(uuid,uuid,uuid,uuid,timestamptz,integer,text,text,text,text,text),
 public.booking_console_set_status_v1(uuid,uuid,text,text) to authenticated;
