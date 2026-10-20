-- Canonical physical resources per reservation. Client writes still enter via Booking RPCs.
-- No combinations capability is advertised until the full create/edit/client contract is ready.
alter table public.booking_reservations add constraint booking_reservation_spot_identity unique(spot_id,id);
create table booking_private.reservation_allocations_v1 (
 spot_id uuid not null,
 reservation_id uuid not null,
 table_id uuid not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at),
 status text not null check(status in ('pending','confirmed','arrived','seated','completed','cancelled','declined','no_show')),
 is_active boolean not null default true,
 reservation_revision bigint not null check(reservation_revision>=0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(reservation_id,table_id),
 foreign key(spot_id,reservation_id) references public.booking_reservations(spot_id,id) on delete cascade,
 foreign key(spot_id,table_id) references public.booking_restaurant_tables(spot_id,id),
 exclude using gist(table_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
  where(is_active and status in ('pending','confirmed','arrived','seated'))
);
create unique index booking_allocation_one_seated on booking_private.reservation_allocations_v1(table_id) where is_active and status='seated';
create index booking_allocation_spot_active on booking_private.reservation_allocations_v1(spot_id,reservation_id) where is_active;
alter table booking_private.reservation_allocations_v1 enable row level security;
revoke all on booking_private.reservation_allocations_v1 from public,anon,authenticated;
grant all on booking_private.reservation_allocations_v1 to service_role;

-- Lock before installing synchronization/backfill: a concurrent legacy write cannot fall between them.
lock table public.booking_reservations in share row exclusive mode;
create function booking_private.sync_reservation_allocations_v1() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then
  if new.spot_id<>old.spot_id then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
  if new.table_id<>old.table_id then
   if (select count(*) from booking_private.reservation_allocations_v1 where reservation_id=new.id and is_active)>1 then
    raise exception 'booking_combination_requires_allocation_rpc' using errcode='22023'; end if;
   update booking_private.reservation_allocations_v1 set is_active=false,updated_at=clock_timestamp() where reservation_id=new.id and is_active;
  end if;
 end if;
 insert into booking_private.reservation_allocations_v1(spot_id,reservation_id,table_id,starts_at,ends_at,status,reservation_revision)
 values(new.spot_id,new.id,new.table_id,new.starts_at,new.ends_at,new.status,new.revision)
 on conflict(reservation_id,table_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,
  reservation_revision=excluded.reservation_revision,is_active=true,updated_at=clock_timestamp();
 update booking_private.reservation_allocations_v1 set starts_at=new.starts_at,ends_at=new.ends_at,status=new.status,
  reservation_revision=new.revision,updated_at=clock_timestamp() where reservation_id=new.id and is_active;
 return new;
end $$;
revoke all on function booking_private.sync_reservation_allocations_v1() from public,anon,authenticated;
create trigger booking_reservation_allocations_sync after insert or update on public.booking_reservations
 for each row execute function booking_private.sync_reservation_allocations_v1();

do $$ declare last_id uuid; n integer; total integer:=0; begin
 -- Fail before any partial migration for larger installations; require a separately reviewed staged backfill.
 if (select count(*) from (select 1 from public.booking_reservations limit 5001) bounded)>5000 then
  raise exception 'booking_allocation_staged_backfill_required'; end if;
 loop
  with batch as materialized(select * from public.booking_reservations where last_id is null or id>last_id order by id limit 500),
  inserted as (insert into booking_private.reservation_allocations_v1(spot_id,reservation_id,table_id,starts_at,ends_at,status,reservation_revision)
   select spot_id,id,table_id,starts_at,ends_at,status,revision from batch on conflict(reservation_id,table_id) do nothing returning 1)
  select count(*),(select id from batch order by id desc limit 1) into n,last_id from inserted;
  exit when n=0;
  total:=total+n; raise notice 'Booking allocation backfill: % rows',total;
 end loop;
end $$;

-- Private transactional building block. Public multi-table creation/editing is a subsequent contract.
create function booking_private.assign_reservation_tables_v1(p_spot uuid,p_reservation uuid,p_revision bigint,p_tables uuid[]) returns bigint
language plpgsql set search_path='' as $$
declare r public.booking_reservations%rowtype; ids uuid[]; previous uuid[]; n integer; seats integer; areas integer; begin
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
 update booking_private.reservation_allocations_v1 set is_active=false,updated_at=clock_timestamp() where reservation_id=r.id and is_active and not(table_id=any(ids));
 insert into booking_private.reservation_allocations_v1(spot_id,reservation_id,table_id,starts_at,ends_at,status,reservation_revision)
 select r.spot_id,r.id,t,r.starts_at,r.ends_at,r.status,r.revision+1 from unnest(ids) t
 on conflict(reservation_id,table_id) do update set is_active=true,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,
  reservation_revision=excluded.reservation_revision,updated_at=clock_timestamp();
 update public.booking_reservations set revision=revision+1,updated_at=now() where id=r.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,details) values(p_spot,r.id,auth.uid(),'reservation_tables_assigned',
  jsonb_build_object('schema','table_allocation_v1','before',previous,'after',ids,'revision',r.revision+1));
 return r.revision+1;
end $$;
revoke all on function booking_private.assign_reservation_tables_v1(uuid,uuid,bigint,uuid[]) from public,anon,authenticated;

create or replace function booking_private.slots_for_amendment_v1(p_spot_id uuid,p_date date,p_party_size integer,p_duration_minutes integer,p_exclude uuid)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql set search_path='' as $$
declare v_settings public.booking_restaurant_settings%rowtype; v_duration integer; begin
 select * into v_settings from public.booking_restaurant_settings where spot_id=p_spot_id;
 if not found then return; end if;
 v_duration:=coalesce(p_duration_minutes,v_settings.duration_minutes);
 if p_date is null or p_date < (now() at time zone 'Europe/Zurich')::date or p_date > (now() at time zone 'Europe/Zurich')::date+365
  or p_party_size is null or p_party_size not between 1 and v_settings.max_party_size
  or v_duration not between 30 and 480 then raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 return query select distinct w.service_id,g.slot,g.slot+make_interval(mins=>v_duration),t.id
 from (select p_date-1 d union all select p_date) days
 cross join lateral booking_private.service_windows_v1(p_spot_id,days.d) w
 cross join lateral generate_series(w.starts_at,w.ends_at-make_interval(mins=>v_duration),make_interval(mins=>w.interval_minutes)) g(slot)
 join public.booking_restaurant_tables t on t.spot_id=p_spot_id and t.is_active and t.seats>=p_party_size
 join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
 where (g.slot at time zone 'Europe/Zurich')::date=p_date and g.slot>now()
  and not booking_private.range_blocked_v1(p_spot_id,g.slot,g.slot+make_interval(mins=>v_duration),w.service_id,a.id)
  and not exists(select 1 from booking_private.reservation_allocations_v1 r where r.table_id=t.id and r.is_active
   and (p_exclude is null or r.reservation_id<>p_exclude) and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(g.slot,g.slot+make_interval(mins=>v_duration),'[)'))
 order by 2,4;
end $$;

create or replace function booking_private.walk_in_slots_v1(p_spot_id uuid,p_start timestamptz,p_party integer,p_duration integer)
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
 where not booking_private.range_blocked_v1(p_spot_id,p_start,p_start+make_interval(mins=>p_duration),s.id,a.id)
  and not exists(select 1 from booking_private.reservation_allocations_v1 current_visit where current_visit.table_id=t.id and current_visit.is_active and current_visit.status='seated')
  and not exists(select 1 from booking_private.reservation_allocations_v1 r where r.table_id=t.id and r.is_active
   and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(p_start,p_start+make_interval(mins=>p_duration),'[)'))
 order by t.seats,t.label,s.id;
end $$;

create or replace function booking_private.closure_affected_v1(p_spot uuid,p_start timestamptz,p_end timestamptz,p_service uuid,p_area uuid) returns bigint
language sql stable set search_path='' as $$
 select count(*) from public.booking_reservations r where r.spot_id=p_spot and r.status in ('pending','confirmed','arrived','seated')
  and (p_service is null or r.service_id=p_service)
  and (p_area is null or exists(select 1 from booking_private.reservation_allocations_v1 a join public.booking_restaurant_tables t on t.spot_id=a.spot_id and t.id=a.table_id
   where a.reservation_id=r.id and a.is_active and t.area_id=p_area))
  and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(p_start,p_end,'[)');
$$;
