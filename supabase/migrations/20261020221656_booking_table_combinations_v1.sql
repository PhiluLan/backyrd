begin;
create table public.booking_table_combinations (
 id uuid primary key,
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),
 primary_table_id uuid not null,
 max_party_size integer not null check(max_party_size between 1 and 30),
 membership_hash text not null check(membership_hash ~ '^[0-9a-f]{64}$'),
 is_active boolean not null default true,
 updated_at timestamptz not null default clock_timestamp(),
 unique(spot_id,id),
 foreign key(spot_id,primary_table_id) references public.booking_restaurant_tables(spot_id,id)
);
create unique index booking_combination_active_members on public.booking_table_combinations(spot_id,membership_hash) where is_active;
create index booking_combination_spot on public.booking_table_combinations(spot_id,is_active,updated_at desc);
alter table public.booking_table_combinations enable row level security;
revoke all on public.booking_table_combinations from public,anon,authenticated;
grant select on public.booking_table_combinations to authenticated;
grant all on public.booking_table_combinations to service_role;
create policy booking_combinations_owner_read on public.booking_table_combinations for select to authenticated using(booking_private.is_operator(spot_id));
create table booking_private.combination_tables_v1 (
 spot_id uuid not null,
 combination_id uuid not null,
 table_id uuid not null,
 is_active boolean not null default true,
 primary key(combination_id,table_id),
 foreign key(spot_id,combination_id) references public.booking_table_combinations(spot_id,id) on delete cascade,
 foreign key(spot_id,table_id) references public.booking_restaurant_tables(spot_id,id)
);
alter table booking_private.combination_tables_v1 enable row level security;
revoke all on booking_private.combination_tables_v1 from public,anon,authenticated;
grant all on booking_private.combination_tables_v1 to service_role;
alter table public.booking_reservations add column combination_id uuid;
alter table public.booking_reservations add constraint booking_reservation_combination_spot foreign key(spot_id,combination_id) references public.booking_table_combinations(spot_id,id);
create table booking_private.reservation_requests_v2 (
 spot_id uuid not null references public.booking_restaurant_settings(spot_id),
 request_id uuid not null,
 request_kind text not null check(request_kind in ('create','amend','walk_in')),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 reservation_id uuid not null,
 outcome jsonb not null check(jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=2048),
 created_at timestamptz not null default clock_timestamp(),
 primary key(spot_id,request_id),
 foreign key(spot_id,reservation_id) references public.booking_reservations(spot_id,id)
);
alter table booking_private.reservation_requests_v2 enable row level security;
revoke all on booking_private.reservation_requests_v2 from public,anon,authenticated;
grant all on booking_private.reservation_requests_v2 to service_role;

create function booking_private.table_ids_v2(p_ids uuid[]) returns uuid[] language plpgsql immutable set search_path='' as $$
declare ids uuid[]; begin
 if p_ids is null or cardinality(p_ids) not between 1 and 4 or array_ndims(p_ids)<>1 then raise exception 'invalid_booking_allocation' using errcode='22023'; end if;
 if array_position(p_ids,null) is not null then raise exception 'invalid_booking_allocation' using errcode='22023'; end if;
 select array_agg(distinct t order by t) into ids from unnest(p_ids) t;
 if cardinality(ids)<>cardinality(p_ids) then raise exception 'invalid_booking_allocation' using errcode='22023'; end if;
 return ids;
end $$;
create function booking_private.request_fingerprint_v2(p_payload jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
$$;
create function booking_private.allocation_choices_v2(p_spot uuid)
returns table(table_id uuid,table_ids uuid[],combination_id uuid,allocation_label text,seats integer,area_id uuid)
language sql stable set search_path='' as $$
 select t.id,array[t.id],null::uuid,t.label,t.seats,t.area_id
 from public.booking_restaurant_tables t join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
 where t.spot_id=p_spot and t.is_active
 union all
 select g.primary_table_id,m.ids,g.id,g.name||' · '||m.labels,g.max_party_size,m.area
 from public.booking_table_combinations g cross join lateral (
  select array_agg(t.id order by t.id) ids,string_agg(t.label,' + ' order by t.id) labels,(array_agg(t.area_id))[1] area,
   count(*) n,count(distinct t.area_id) rooms,sum(t.seats) chairs
  from booking_private.combination_tables_v1 c join public.booking_restaurant_tables t on t.spot_id=c.spot_id and t.id=c.table_id and t.is_active
  join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
  where c.combination_id=g.id and c.spot_id=g.spot_id and c.is_active
 ) m where g.spot_id=p_spot and g.is_active and m.n between 2 and 4 and m.rooms=1 and g.primary_table_id=any(m.ids)
  and m.chairs>=g.max_party_size
  and m.n=(select count(*) from booking_private.combination_tables_v1 c where c.combination_id=g.id and c.is_active)
  and g.membership_hash=booking_private.request_fingerprint_v2(to_jsonb(m.ids));
$$;
create function public.booking_console_save_combination_v1(p_spot_id uuid,p_revision bigint,p_id uuid,p_name text,p_primary_table_id uuid,p_table_ids uuid[],p_max_party_size integer,p_active boolean default true) returns bigint
language plpgsql security definer set search_path='' as $$
declare g public.booking_table_combinations%rowtype; ids uuid[]; old_ids uuid[]; rev bigint; n integer; rooms integer; chairs integer; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 select revision into rev from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 ids:=booking_private.table_ids_v2(p_table_ids);
 if cardinality(ids)<2 or p_id is null or p_revision is null or p_revision<0 or p_name is null or length(trim(p_name)) not between 1 and 80
  or p_max_party_size is null or p_max_party_size not between 1 and 30 or p_active is null or p_primary_table_id is null or not(p_primary_table_id=any(ids)) then
  raise exception 'invalid_booking_combination' using errcode='22023'; end if;
 select * into g from public.booking_table_combinations where id=p_id;
 if found and g.spot_id<>p_spot_id then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 select array_agg(table_id order by table_id) into old_ids from booking_private.combination_tables_v1 where combination_id=p_id and is_active;
 if g.id is not null and g.name=trim(p_name) and g.primary_table_id=p_primary_table_id and g.max_party_size=p_max_party_size and g.is_active=p_active and old_ids=ids then return rev; end if;
 if rev<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
 select count(*),count(distinct t.area_id),coalesce(sum(t.seats),0) into n,rooms,chairs from public.booking_restaurant_tables t
  join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id
  where t.spot_id=p_spot_id and t.id=any(ids) and (not p_active or (t.is_active and a.is_active));
 if n<>cardinality(ids) or (p_active and (rooms<>1 or chairs<p_max_party_size)) then raise exception 'invalid_booking_combination' using errcode='22023'; end if;
 if p_active and (select count(*) from public.booking_table_combinations where spot_id=p_spot_id and is_active and id<>p_id)>=100 then raise exception 'booking_combination_limit' using errcode='22023'; end if;
 insert into public.booking_table_combinations(id,spot_id,name,primary_table_id,max_party_size,membership_hash,is_active)
 values(p_id,p_spot_id,trim(p_name),p_primary_table_id,p_max_party_size,booking_private.request_fingerprint_v2(to_jsonb(ids)),p_active)
 on conflict(id) do update set name=excluded.name,primary_table_id=excluded.primary_table_id,max_party_size=excluded.max_party_size,membership_hash=excluded.membership_hash,is_active=excluded.is_active,updated_at=clock_timestamp()
  where public.booking_table_combinations.spot_id=excluded.spot_id;
 if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 update booking_private.combination_tables_v1 set is_active=false where combination_id=p_id;
 insert into booking_private.combination_tables_v1(spot_id,combination_id,table_id) select p_spot_id,p_id,t from unnest(ids) t
 on conflict(combination_id,table_id) do update set is_active=true where booking_private.combination_tables_v1.spot_id=excluded.spot_id;
 update public.booking_restaurant_settings set revision=revision+1,updated_at=now() where spot_id=p_spot_id;
 insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),case when p_active then 'combination_saved' else 'combination_archived' end,
  jsonb_build_object('combination_id',p_id,'before_table_ids',old_ids,'after_table_ids',ids,'max_party_size',p_max_party_size,'primary_table_id',p_primary_table_id));
 return rev+1;
end $$;

create function booking_private.validate_allocation_v2(p_spot uuid,p_service uuid,p_primary uuid,p_ids uuid[],p_combination uuid,p_start timestamptz,p_duration integer,p_party integer,p_exclude uuid,p_walk_in boolean) returns void
language plpgsql set search_path='' as $$
declare ids uuid[]; v_end timestamptz; begin
 ids:=booking_private.table_ids_v2(p_ids);
 if p_start is null or not isfinite(p_start) or p_duration is null or p_duration not between 30 and 480 or p_party is null
  or p_party<1 or p_party>(select max_party_size from public.booking_restaurant_settings where spot_id=p_spot) then raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 v_end:=p_start+make_interval(mins=>p_duration);
 if not exists(select 1 from booking_private.allocation_choices_v2(p_spot) c where c.table_id=p_primary and c.table_ids=ids and c.combination_id is not distinct from p_combination and c.seats>=p_party) then raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 if not p_walk_in and ((p_start at time zone 'Europe/Zurich')::date<(clock_timestamp() at time zone 'Europe/Zurich')::date
  or (p_start at time zone 'Europe/Zurich')::date>(clock_timestamp() at time zone 'Europe/Zurich')::date+365 or p_start<=clock_timestamp()) then raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 if not exists(select 1 from (select (p_start at time zone 'Europe/Zurich')::date-1 d union all select (p_start at time zone 'Europe/Zurich')::date) days
  cross join lateral booking_private.service_windows_v1(p_spot,days.d) w where w.service_id=p_service and p_start>=w.starts_at and v_end<=w.ends_at
   and (p_walk_in or mod(extract(epoch from p_start-w.starts_at),w.interval_minutes*60)=0))
  or exists(select 1 from public.booking_restaurant_tables t where t.spot_id=p_spot and t.id=any(ids) and booking_private.range_blocked_v1(p_spot,p_start,v_end,p_service,t.area_id))
  or exists(select 1 from booking_private.reservation_allocations_v1 a where a.spot_id=p_spot and a.table_id=any(ids) and a.is_active and (p_exclude is null or a.reservation_id<>p_exclude)
    and ((a.status in ('pending','confirmed','arrived','seated') and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(p_start,v_end,'[)')) or (p_walk_in and a.status='seated'))) then
  raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
end $$;
create function booking_private.write_allocations_v2(r public.booking_reservations,p_ids uuid[]) returns void language plpgsql set search_path='' as $$
declare ids uuid[]:=booking_private.table_ids_v2(p_ids); begin
 if not(r.table_id=any(ids)) then raise exception 'booking_allocation_primary_required' using errcode='22023'; end if;
 update booking_private.reservation_allocations_v1 set is_active=false,updated_at=clock_timestamp() where reservation_id=r.id and is_active and not(table_id=any(ids));
 insert into booking_private.reservation_allocations_v1(spot_id,reservation_id,table_id,starts_at,ends_at,status,reservation_revision)
 select r.spot_id,r.id,t,r.starts_at,r.ends_at,r.status,r.revision from unnest(ids) t
 on conflict(reservation_id,table_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,reservation_revision=excluded.reservation_revision,is_active=true,updated_at=clock_timestamp();
end $$;

create function public.booking_console_slots_v2(p_spot_id uuid,p_date date,p_party_size integer,p_reservation_id uuid default null,p_duration_minutes integer default null,p_service_id uuid default null,p_area_id uuid default null,p_time time default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare duration integer; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null or not isfinite(p_date) or p_date<(clock_timestamp() at time zone 'Europe/Zurich')::date or p_date>(clock_timestamp() at time zone 'Europe/Zurich')::date+365
  or (p_time is not null and (p_time>=time '24:00' or extract(second from p_time)<>0))
  or p_party_size is null or p_party_size<1 or p_party_size>(select max_party_size from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 if p_reservation_id is not null and not exists(select 1 from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id) then raise exception 'booking_not_found' using errcode='22023'; end if;
 select coalesce(p_duration_minutes,duration_minutes) into duration from public.booking_restaurant_settings where spot_id=p_spot_id;
 if duration is null or duration not between 30 and 480 then raise exception 'invalid_booking_duration' using errcode='22023'; end if;
 if (p_service_id is not null and not exists(select 1 from public.booking_restaurant_services where spot_id=p_spot_id and id=p_service_id)) or (p_area_id is not null and not exists(select 1 from public.booking_restaurant_areas where spot_id=p_spot_id and id=p_area_id)) then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 with candidates as materialized (
  select distinct w.service_id,g.slot as starts_at,g.slot+make_interval(mins=>duration) as ends_at,c.table_id,c.table_ids,c.combination_id,c.allocation_label
  from (select p_date-1 d union all select p_date) days cross join lateral booking_private.service_windows_v1(p_spot_id,days.d) w
  cross join lateral generate_series(w.starts_at,w.ends_at-make_interval(mins=>duration),make_interval(mins=>w.interval_minutes)) g(slot)
  cross join lateral booking_private.allocation_choices_v2(p_spot_id) c
  where c.seats>=p_party_size and (g.slot at time zone 'Europe/Zurich')::date=p_date and g.slot>clock_timestamp()
   and (p_time is null or date_trunc('minute',g.slot at time zone 'Europe/Zurich')::time=p_time)
   and (p_service_id is null or w.service_id=p_service_id) and (p_area_id is null or c.area_id=p_area_id)
   and not booking_private.range_blocked_v1(p_spot_id,g.slot,g.slot+make_interval(mins=>duration),w.service_id,c.area_id)
   and not exists(select 1 from booking_private.reservation_allocations_v1 a where a.table_id=any(c.table_ids) and a.is_active and (p_reservation_id is null or a.reservation_id<>p_reservation_id)
    and a.status in ('pending','confirmed','arrived','seated') and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(g.slot,g.slot+make_interval(mins=>duration),'[)'))
  order by starts_at,table_id,combination_id limit 10001)
 select case when count(*)>10000 then null else coalesce(jsonb_agg(to_jsonb(c) order by starts_at,table_id,combination_id),'[]'::jsonb) end into result from candidates c;
 if result is null then raise exception 'booking_availability_scope_too_large' using errcode='22023'; end if;
 return result;
end $$;

create function booking_private.create_reservation_v2(p_spot uuid,p_request uuid,p_service uuid,p_primary uuid,p_ids uuid[],p_combination uuid,p_start timestamptz,p_duration integer,p_party integer,p_name text,p_contact text,p_note text,p_source text,p_status text,p_walk boolean) returns jsonb
language plpgsql set search_path='' as $$
declare ids uuid[]; payload jsonb; fingerprint text; previous booking_private.reservation_requests_v2%rowtype; r public.booking_reservations%rowtype; start_at timestamptz; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot,'write');
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 ids:=booking_private.table_ids_v2(p_ids);
 if p_request is null or p_name is null or length(trim(p_name)) not between 1 and 120 or length(p_contact)>320 or length(p_note)>1000
  or p_duration is null or p_duration not between 30 and 480 or p_party is null or p_party not between 1 and 30 or p_source is null or p_source not in ('phone','email','walk_in','operator') or p_status is null
  or (p_walk and (p_status<>'seated' or p_source<>'walk_in')) or (not p_walk and p_status not in ('pending','confirmed')) then raise exception 'invalid_booking_request' using errcode='22023'; end if;
 payload:=jsonb_build_object('kind',case when p_walk then 'walk_in' else 'create' end,'service_id',p_service,'table_id',p_primary,'table_ids',ids,'combination_id',p_combination,
  'starts_at',case when p_walk then null else to_char(p_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') end,'duration',p_duration,'party',p_party,'name',trim(p_name),'contact',nullif(trim(p_contact),''),'note',nullif(trim(p_note),''),'source',p_source,'status',p_status);
 fingerprint:=booking_private.request_fingerprint_v2(payload);
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot and request_id=p_request;
 if found then if previous.fingerprint<>fingerprint then raise exception 'booking_request_reused' using errcode='22023'; end if; return previous.outcome; end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot and request_id=p_request) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 start_at:=case when p_walk then booking_private.admission_clock_v1() else p_start end;
 perform booking_private.validate_allocation_v2(p_spot,p_service,p_primary,ids,p_combination,start_at,p_duration,p_party,null,p_walk);
 insert into public.booking_reservations(spot_id,request_id,service_id,table_id,combination_id,starts_at,ends_at,party_size,guest_name,guest_contact,note,source,status,is_walk_in,arrived_at,seated_at,creation_fingerprint,created_by)
 values(p_spot,p_request,p_service,p_primary,p_combination,start_at,start_at+make_interval(mins=>p_duration),p_party,trim(p_name),nullif(trim(p_contact),''),nullif(trim(p_note),''),p_source,p_status,p_walk,
  case when p_walk then start_at end,case when p_walk then start_at end,fingerprint,auth.uid()) returning * into r;
 perform booking_private.write_allocations_v2(r,ids);
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot,r.id,auth.uid(),case when p_walk then 'walk_in_created' else 'reservation_created' end,clock_timestamp(),booking_private.reservation_audit_v1(null,r));
 result:=jsonb_build_object('id',r.id,'service_id',r.service_id,'table_id',r.table_id,'table_ids',ids,'combination_id',r.combination_id,'starts_at',r.starts_at,'ends_at',r.ends_at);
 insert into booking_private.reservation_requests_v2(spot_id,request_id,request_kind,fingerprint,reservation_id,outcome) values(p_spot,p_request,case when p_walk then 'walk_in' else 'create' end,fingerprint,r.id,result);
 return result;
end $$;
create function public.booking_console_create_v2(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,p_table_ids uuid[],p_combination_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_party_size integer,p_guest_name text,p_guest_contact text default null,p_note text default null,p_source text default 'operator',p_status text default 'confirmed') returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 return booking_private.create_reservation_v2(p_spot_id,p_request_id,p_service_id,p_table_id,p_table_ids,p_combination_id,p_starts_at,p_duration_minutes,p_party_size,p_guest_name,p_guest_contact,p_note,p_source,p_status,false);
end $$;
create function public.booking_console_walk_in_v2(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,p_table_ids uuid[],p_combination_id uuid,p_party_size integer,p_duration_minutes integer,p_guest_name text default null,p_guest_contact text default null,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 return booking_private.create_reservation_v2(p_spot_id,p_request_id,p_service_id,p_table_id,p_table_ids,p_combination_id,null,p_duration_minutes,p_party_size,coalesce(nullif(trim(p_guest_name),''),'Walk-in'),p_guest_contact,p_note,'walk_in','seated',true);
end $$;

create function public.booking_console_amend_v2(p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,p_service_id uuid,p_table_id uuid,p_table_ids uuid[],p_combination_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_party_size integer,p_guest_name text,p_guest_contact text default null,p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; after_row public.booking_reservations%rowtype; previous booking_private.reservation_requests_v2%rowtype;
 ids uuid[]; old_ids uuid[]; inventory_changed boolean; same boolean; before_state jsonb; fingerprint text; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 ids:=booking_private.table_ids_v2(p_table_ids);
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_duration_minutes is null or p_duration_minutes not between 30 and 480 or p_starts_at is null or not isfinite(p_starts_at)
  or p_party_size is null or p_party_size not between 1 and 30 or p_guest_name is null or length(trim(p_guest_name)) not between 1 and 120 or length(p_guest_contact)>320 or length(p_note)>1000 then raise exception 'invalid_booking_request' using errcode='22023'; end if;
 fingerprint:=booking_private.request_fingerprint_v2(jsonb_build_object('kind','amend','reservation_id',p_reservation_id,'revision',p_expected_revision,'service_id',p_service_id,'table_id',p_table_id,'table_ids',ids,'combination_id',p_combination_id,'starts_at',to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),'duration',p_duration_minutes,'party',p_party_size,'name',trim(p_guest_name),'contact',nullif(trim(p_guest_contact),''),'note',nullif(trim(p_note),'')));
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'booking_request_reused' using errcode='22023'; end if; return previous.reservation_id; end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and (last_amend_request_id=p_request_id or request_id=p_request_id)) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if r.revision<>p_expected_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 select array_agg(table_id order by table_id) into old_ids from booking_private.reservation_allocations_v1 where reservation_id=r.id and is_active;
 inventory_changed:=r.service_id is distinct from p_service_id or r.table_id is distinct from p_table_id or old_ids is distinct from ids or r.combination_id is distinct from p_combination_id or r.starts_at<>p_starts_at or r.ends_at<>p_starts_at+make_interval(mins=>p_duration_minutes) or r.party_size<>p_party_size;
 same:=not inventory_changed and r.guest_name=trim(p_guest_name) and r.guest_contact is not distinct from nullif(trim(p_guest_contact),'') and r.note is not distinct from nullif(trim(p_note),'');
 if r.status not in ('pending','confirmed','arrived','seated') or (inventory_changed and r.status not in ('pending','confirmed')) then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 if not same then
  if inventory_changed then perform booking_private.validate_allocation_v2(p_spot_id,p_service_id,p_table_id,ids,p_combination_id,p_starts_at,p_duration_minutes,p_party_size,r.id,false); end if;
  before_state:=booking_private.reservation_audit_state_v1(r);
  if inventory_changed then update booking_private.reservation_allocations_v1 set is_active=false,updated_at=clock_timestamp() where reservation_id=r.id and is_active; end if;
  update public.booking_reservations set service_id=p_service_id,table_id=p_table_id,combination_id=p_combination_id,starts_at=p_starts_at,ends_at=p_starts_at+make_interval(mins=>p_duration_minutes),party_size=p_party_size,guest_name=trim(p_guest_name),guest_contact=nullif(trim(p_guest_contact),''),note=nullif(trim(p_note),''),revision=revision+1,updated_at=now(),last_amend_request_id=p_request_id,
   creation_fingerprint=coalesce(creation_fingerprint,booking_private.creation_fingerprint_v1(r.service_id,r.table_id,r.starts_at,r.party_size,r.guest_name,r.guest_contact,r.note,r.source)) where id=r.id returning * into after_row;
  if inventory_changed then perform booking_private.write_allocations_v2(after_row,ids); end if;
  insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot_id,r.id,auth.uid(),'reservation_amended',clock_timestamp(),jsonb_set(booking_private.reservation_audit_v1(r,after_row),'{before}',before_state));
 end if;
 result:=jsonb_build_object('id',r.id);
 insert into booking_private.reservation_requests_v2(spot_id,request_id,request_kind,fingerprint,reservation_id,outcome) values(p_spot_id,p_request_id,'amend',fingerprint,r.id,result);
 return r.id;
end $$;

create function public.booking_console_walk_in_slots_v2(p_spot_id uuid,p_party_size integer,p_duration_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare observed timestamptz; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_party_size is null or p_party_size<1 or p_party_size>(select max_party_size from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'invalid_booking_party_size' using errcode='22023'; end if;
 if p_duration_minutes is null or p_duration_minutes not between 30 and 480 then raise exception 'invalid_booking_duration' using errcode='22023'; end if;
 observed:=booking_private.admission_clock_v1();
 with choices as (select s.id service_id,s.name service_name,observed starts_at,observed+make_interval(mins=>p_duration_minutes) ends_at,c.table_id,c.table_ids,c.combination_id,c.allocation_label,c.seats,c.area_id,a.name area_name
  from booking_private.walk_in_services_v1(p_spot_id,observed,p_duration_minutes) s cross join lateral booking_private.allocation_choices_v2(p_spot_id) c
  join public.booking_restaurant_areas a on a.id=c.area_id and a.spot_id=p_spot_id
  where c.seats>=p_party_size and not booking_private.range_blocked_v1(p_spot_id,observed,observed+make_interval(mins=>p_duration_minutes),s.id,c.area_id)
   and not exists(select 1 from booking_private.reservation_allocations_v1 x where x.table_id=any(c.table_ids) and x.is_active and (x.status='seated' or (x.status in ('pending','confirmed','arrived') and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(observed,observed+make_interval(mins=>p_duration_minutes),'[)')))))
 select jsonb_build_object('observed_at',observed,'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.id) from booking_private.walk_in_services_v1(p_spot_id,observed,p_duration_minutes) s),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('table_label',c.allocation_label) order by c.service_id,c.table_id,c.combination_id) from choices c),'[]'::jsonb)) into result;
 return result;
end $$;

revoke all on function booking_private.table_ids_v2(uuid[]),booking_private.request_fingerprint_v2(jsonb),booking_private.allocation_choices_v2(uuid),
 booking_private.validate_allocation_v2(uuid,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,uuid,boolean),booking_private.write_allocations_v2(public.booking_reservations,uuid[]),
 booking_private.create_reservation_v2(uuid,uuid,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.booking_console_save_combination_v1(uuid,bigint,uuid,text,uuid,uuid[],integer,boolean),
 public.booking_console_slots_v2(uuid,date,integer,uuid,integer,uuid,uuid,time),
 public.booking_console_create_v2(uuid,uuid,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text,text,text),
 public.booking_console_walk_in_v2(uuid,uuid,uuid,uuid,uuid[],uuid,integer,integer,text,text,text),
 public.booking_console_amend_v2(uuid,uuid,uuid,bigint,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text),
 public.booking_console_walk_in_slots_v2(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.booking_console_save_combination_v1(uuid,bigint,uuid,text,uuid,uuid[],integer,boolean),
 public.booking_console_slots_v2(uuid,date,integer,uuid,integer,uuid,uuid,time),
 public.booking_console_create_v2(uuid,uuid,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text,text,text),
 public.booking_console_walk_in_v2(uuid,uuid,uuid,uuid,uuid[],uuid,integer,integer,text,text,text),
 public.booking_console_amend_v2(uuid,uuid,uuid,bigint,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text),
 public.booking_console_walk_in_slots_v2(uuid,integer,integer) to authenticated;

create function booking_private.reservation_projection_v2(r public.booking_reservations) returns jsonb language sql stable set search_path='' as $$
 select (to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id')||jsonb_build_object('table_ids',coalesce((select jsonb_agg(a.table_id order by a.table_id) from booking_private.reservation_allocations_v1 a where a.reservation_id=r.id and a.is_active),jsonb_build_array(r.table_id)));
$$;
create function booking_private.combination_projection_v2(p_spot uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(g)-'membership_hash'||jsonb_build_object('table_ids',(select jsonb_agg(c.table_id order by c.table_id) from booking_private.combination_tables_v1 c where c.combination_id=g.id and c.is_active),
  'is_available',exists(select 1 from booking_private.allocation_choices_v2(p_spot) x where x.combination_id=g.id)) order by g.is_active desc,g.name,g.id),'[]'::jsonb)
 from public.booking_table_combinations g where g.spot_id=p_spot and (g.is_active or g.id in (select id from public.booking_table_combinations where spot_id=p_spot and not is_active order by updated_at desc,id limit 100));
$$;
create or replace function booking_private.reservation_audit_state_v1(r public.booking_reservations) returns jsonb
language plpgsql stable set search_path='' as $$
declare ids uuid[]; labels text[]; begin
 if r.id is null then return null; end if;
 select array_agg(a.table_id order by a.table_id) into ids from booking_private.reservation_allocations_v1 a where a.reservation_id=r.id and a.is_active;
 -- An old v1 single-table amendment serializes its prior primary after the move.
 if ids is null or not(r.table_id=any(ids)) then ids:=array[r.table_id]; end if;
 select array_agg(t.label order by t.id) into labels from public.booking_restaurant_tables t where t.spot_id=r.spot_id and t.id=any(ids);
 return jsonb_build_object('revision',r.revision,'status',r.status,'party_size',r.party_size,'starts_at',r.starts_at,'ends_at',r.ends_at,
  'table_id',r.table_id,'table_ids',ids,'table_labels',labels,'service_id',r.service_id,
  'table_label',(select label from public.booking_restaurant_tables where id=r.table_id and spot_id=r.spot_id),
  'service_name',(select name from public.booking_restaurant_services where id=r.service_id and spot_id=r.spot_id),
  'arrived_at',r.arrived_at,'seated_at',r.seated_at,'completed_at',r.completed_at);
end $$;
create function booking_private.validate_combination_setup_v2(p_spot uuid) returns void language plpgsql set search_path='' as $$ begin
 if exists(select 1 from public.booking_table_combinations g where g.spot_id=p_spot and g.is_active and not exists(select 1 from booking_private.allocation_choices_v2(p_spot) c where c.combination_id=g.id)) then
  raise exception 'booking_combination_configuration_invalid' using errcode='22023'; end if;
 if exists(select 1 from public.booking_reservations r cross join lateral (
  select count(*) n,count(distinct t.area_id) rooms,coalesce(sum(t.seats),0) chairs,count(*) filter(where t.is_active and ar.is_active) live
  from booking_private.reservation_allocations_v1 a join public.booking_restaurant_tables t on t.spot_id=a.spot_id and t.id=a.table_id
  join public.booking_restaurant_areas ar on ar.spot_id=t.spot_id and ar.id=t.area_id where a.reservation_id=r.id and a.is_active) m
  where r.spot_id=p_spot and r.status in ('pending','confirmed','arrived','seated') and (r.status='seated' or r.ends_at>clock_timestamp())
   and (m.chairs<r.party_size)) then raise exception 'booking_table_has_larger_reservation' using errcode='22023'; end if;
 if exists(select 1 from public.booking_reservations r cross join lateral (
  select count(*) n,count(distinct t.area_id) rooms,count(*) filter(where t.is_active and ar.is_active) live
  from booking_private.reservation_allocations_v1 a join public.booking_restaurant_tables t on t.spot_id=a.spot_id and t.id=a.table_id
  join public.booking_restaurant_areas ar on ar.spot_id=t.spot_id and ar.id=t.area_id where a.reservation_id=r.id and a.is_active) m
  where r.spot_id=p_spot and r.status in ('pending','confirmed','arrived','seated') and (r.status='seated' or r.ends_at>clock_timestamp())
   and m.n>1 and (m.live<>m.n or m.rooms<>1)) then raise exception 'booking_combination_reserved_resources' using errcode='22023'; end if;
end $$;
revoke all on function booking_private.reservation_projection_v2(public.booking_reservations),booking_private.combination_projection_v2(uuid),booking_private.validate_combination_setup_v2(uuid) from public,anon,authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true),
   'special_hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.book_date,h.service_id) from public.booking_service_hours h where h.spot_id=p_spot_id and h.is_active and h.book_date between p_date-1 and p_date),'[]'::jsonb),
   'combinations',booking_private.combination_projection_v2(p_spot_id),
   'archived_combination_count',(select count(*) from public.booking_table_combinations where spot_id=p_spot_id and not is_active),
   'access',booking_private.console_access_v1(p_spot_id),
   'operating_date', (now() at time zone 'Europe/Zurich')::date,
   'settings', (select to_jsonb(s) from public.booking_restaurant_settings s where spot_id=p_spot_id),
   'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.booking_restaurant_areas a where spot_id=p_spot_id), '[]'),
   'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.label) from public.booking_restaurant_tables t where spot_id=p_spot_id), '[]'),
   'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.opens_at) from public.booking_restaurant_services s where spot_id=p_spot_id), '[]'),
   'unclosed_visits', case when p_date=(now() at time zone 'Europe/Zurich')::date then
     coalesce((select jsonb_agg(booking_private.reservation_projection_v2(r) order by r.starts_at)
       from public.booking_reservations r where r.spot_id=p_spot_id and r.status='seated'
         and r.starts_at<(p_date::timestamp at time zone 'Europe/Zurich')), '[]'::jsonb) else '[]'::jsonb end,
   'closures',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('affected_reservations',booking_private.closure_affected_v1(p_spot_id,c.starts_at,c.ends_at,c.service_id,c.area_id)) order by c.starts_at,c.id) from public.booking_restaurant_closures c where spot_id=p_spot_id and book_date=p_date),'[]'),
   'reservations', coalesce((select jsonb_agg(booking_private.reservation_projection_v2(r) order by r.starts_at) from public.booking_reservations r
     where spot_id=p_spot_id and starts_at >= (p_date::timestamp at time zone 'Europe/Zurich')
       and starts_at < ((p_date+1)::timestamp at time zone 'Europe/Zurich')), '[]')
 );
end;
$$;

create or replace function public.booking_console_save_setup_v1(p_spot_id uuid, p_revision bigint, p_setup jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_item jsonb; v_next_day boolean;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
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
   on conflict(id) do update set name=excluded.name,is_active=excluded.is_active where public.booking_restaurant_areas.spot_id=excluded.spot_id;
   if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 end loop;
 for v_item in select * from jsonb_array_elements(p_setup->'tables') loop
   insert into public.booking_restaurant_tables(id,spot_id,area_id,label,seats,is_active)
   values((v_item->>'id')::uuid,p_spot_id,(v_item->>'area_id')::uuid,trim(v_item->>'label'),(v_item->>'seats')::integer,(v_item->>'is_active')::boolean)
   on conflict(id) do update set area_id=excluded.area_id,label=excluded.label,seats=excluded.seats,is_active=excluded.is_active where public.booking_restaurant_tables.spot_id=excluded.spot_id;
   if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 end loop;
 for v_item in select * from jsonb_array_elements(p_setup->'services') loop
   if v_item ? 'ends_next_day' and jsonb_typeof(v_item->'ends_next_day') is distinct from 'boolean' then raise exception 'invalid_booking_setup' using errcode='22023'; end if;
   select coalesce((v_item->>'ends_next_day')::boolean,(select ends_next_day from public.booking_restaurant_services where id=(v_item->>'id')::uuid and spot_id=p_spot_id),false) into v_next_day;
   insert into public.booking_restaurant_services(id,spot_id,name,weekdays,opens_at,closes_at,interval_minutes,is_active,ends_next_day)
   values((v_item->>'id')::uuid,p_spot_id,trim(v_item->>'name'),array(select jsonb_array_elements_text(v_item->'weekdays')::integer),
     (v_item->>'opens_at')::time,(v_item->>'closes_at')::time,(v_item->>'interval_minutes')::integer,(v_item->>'is_active')::boolean,v_next_day)
   on conflict(id) do update set name=excluded.name,weekdays=excluded.weekdays,opens_at=excluded.opens_at,
     closes_at=excluded.closes_at,interval_minutes=excluded.interval_minutes,is_active=excluded.is_active,ends_next_day=excluded.ends_next_day where public.booking_restaurant_services.spot_id=excluded.spot_id;
   if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 end loop;
 perform booking_private.validate_combination_setup_v2(p_spot_id);
 insert into public.booking_audit_events(spot_id,actor_id,action) values(p_spot_id,auth.uid(),'setup_saved');
 return v_revision+1;
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
 if v_inventory_changed and (select count(*) from booking_private.reservation_allocations_v1 where reservation_id=r.id and is_active)>1 then raise exception 'booking_combination_requires_allocation_rpc' using errcode='22023'; end if;
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
create or replace function booking_private.assign_reservation_tables_v1(p_spot uuid,p_reservation uuid,p_revision bigint,p_tables uuid[]) returns bigint
language plpgsql set search_path='' as $$
declare r public.booking_reservations%rowtype; ids uuid[]; previous uuid[]; n integer; seats integer; areas integer; after_row public.booking_reservations%rowtype; before_state jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot,'write');
 if p_revision is null or p_revision<0 or p_tables is null or cardinality(p_tables) not between 1 and 4 then
  raise exception 'invalid_booking_allocation' using errcode='22023'; end if;
 if array_ndims(p_tables)<>1 or array_position(p_tables,null) is not null then raise exception 'invalid_booking_allocation' using errcode='22023'; end if;
 select array_agg(distinct t order by t) into ids from unnest(p_tables) t;
 if cardinality(ids)<>cardinality(p_tables) then raise exception 'invalid_booking_allocation' using errcode='22023'; end if;
 select * into r from public.booking_reservations where id=p_reservation and spot_id=p_spot for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if not(r.table_id=any(ids)) then raise exception 'booking_allocation_primary_required' using errcode='22023'; end if;
 select array_agg(table_id order by table_id) into previous from booking_private.reservation_allocations_v1 where reservation_id=r.id and is_active;
 if ids=previous then return r.revision; end if;
 if r.revision<>p_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if r.status not in ('pending','confirmed') or r.starts_at<=clock_timestamp() then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 select count(*),coalesce(sum(t.seats),0),count(distinct t.area_id) into n,seats,areas
 from public.booking_restaurant_tables t join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
 where t.spot_id=p_spot and t.id=any(ids) and t.is_active;
 if n<>cardinality(ids) or areas<>1 then raise exception 'invalid_booking_allocation' using errcode='22023'; end if;
 if seats<r.party_size or r.party_size>(select max_party_size from public.booking_restaurant_settings where spot_id=p_spot) then
  raise exception 'invalid_booking_party_size' using errcode='22023'; end if;
 if not exists(select 1 from (select (r.starts_at at time zone 'Europe/Zurich')::date-1 d union all select (r.starts_at at time zone 'Europe/Zurich')::date) days
  cross join lateral booking_private.service_windows_v1(p_spot,days.d) w where w.service_id=r.service_id and r.starts_at>=w.starts_at and r.ends_at<=w.ends_at)
  or exists(select 1 from public.booking_restaurant_tables t where t.spot_id=p_spot and t.id=any(ids)
   and booking_private.range_blocked_v1(p_spot,r.starts_at,r.ends_at,r.service_id,t.area_id)) then
  raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 if exists(select 1 from booking_private.reservation_allocations_v1 a where a.table_id=any(ids) and a.reservation_id<>r.id and a.is_active
   and a.status in ('pending','confirmed','arrived','seated') and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) then
  raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 before_state:=booking_private.reservation_audit_state_v1(r);
 after_row:=r; after_row.revision:=r.revision+1;
 perform booking_private.write_allocations_v2(after_row,ids);
 update public.booking_reservations set revision=revision+1,updated_at=now() where id=r.id returning * into after_row;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot,r.id,auth.uid(),'reservation_tables_assigned',clock_timestamp(),jsonb_set(booking_private.reservation_audit_v1(r,after_row),'{before}',before_state));
 return r.revision+1;
end $$;
commit;
