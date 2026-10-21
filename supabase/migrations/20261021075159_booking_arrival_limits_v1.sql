begin;
-- Optional restaurant-wide intake pacing. No existing reservation is rewritten.
create table booking_private.arrival_limits_v1 (
 spot_id uuid primary key references public.booking_restaurant_settings(spot_id) on delete cascade,
 revision bigint not null check(revision between 1 and 9007199254740991),
 window_minutes integer not null check(window_minutes in (15,30,60)),
 max_guests integer check(max_guests between 1 and 1000),
 updated_at timestamptz not null default clock_timestamp()
);
create table booking_private.arrival_limit_requests_v1 (
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 request_id uuid not null,
 owner_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 outcome jsonb not null check(jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=1024),
 created_at timestamptz not null default clock_timestamp(),
 primary key(spot_id,request_id)
);
alter table booking_private.arrival_limits_v1 enable row level security;
alter table booking_private.arrival_limit_requests_v1 enable row level security;
revoke all on booking_private.arrival_limits_v1,booking_private.arrival_limit_requests_v1 from public,anon,authenticated,service_role;

create function booking_private.arrival_limit_json_v1(p_spot uuid) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('spot_id',p_spot,'revision',coalesce(l.revision,0),'window_minutes',coalesce(l.window_minutes,15),'max_guests',l.max_guests)
 from (select p_spot id) s left join booking_private.arrival_limits_v1 l on l.spot_id=s.id;
$$;
create function public.booking_console_arrival_limit_v1(p_spot_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if not exists(select 1 from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'booking_setup_required' using errcode='22023'; end if;
 return booking_private.arrival_limit_json_v1(p_spot_id);
end $$;
create function public.booking_console_save_arrival_limit_v1(p_spot_id uuid,p_request_id uuid,p_revision bigint,p_window_minutes integer,p_max_guests integer,p_actor uuid,p_recover boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old jsonb; result jsonb; owner uuid; fp text; prior booking_private.arrival_limit_requests_v1%rowtype; rev bigint; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 if p_actor is null or p_actor is distinct from auth.uid() then raise exception 'booking_operator_required' using errcode='42501'; end if;
 if p_request_id is null or p_revision is null or p_revision not between 0 and 9007199254740991 or p_window_minutes is null or p_window_minutes not in (15,30,60)
  or (p_max_guests is not null and p_max_guests not between 1 and 1000) or p_recover is null then raise exception 'invalid_booking_arrival_limit' using errcode='22023'; end if;
 if not exists(select 1 from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select owner_id into owner from public.spots where id=p_spot_id;
 fp:=booking_private.request_fingerprint_v2(jsonb_build_object('owner',owner,'actor',p_actor,'revision',p_revision,'window_minutes',p_window_minutes,'max_guests',p_max_guests));
 select * into prior from booking_private.arrival_limit_requests_v1 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  if prior.owner_id<>owner or prior.actor_id is distinct from p_actor or prior.fingerprint<>fp then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return prior.outcome;
 end if;
 if p_recover then return null; end if;
 old:=booking_private.arrival_limit_json_v1(p_spot_id);rev:=(old->>'revision')::bigint;
 if rev<>p_revision then raise exception 'booking_arrival_limit_changed' using errcode='40001'; end if;
 if (old->>'window_minutes')::integer<>p_window_minutes or (old->>'max_guests')::integer is distinct from p_max_guests then
  if rev=9007199254740991 then raise exception 'booking_arrival_limit_changed' using errcode='40001'; end if;
  -- Advance the serialization row's MVCC version, not its business revision.
  -- Repeatable Read writers with an older snapshot must abort instead of using an old cap.
  update public.booking_restaurant_settings set updated_at=updated_at where spot_id=p_spot_id;
  insert into booking_private.arrival_limits_v1(spot_id,revision,window_minutes,max_guests) values(p_spot_id,rev+1,p_window_minutes,p_max_guests)
  on conflict(spot_id) do update set revision=excluded.revision,window_minutes=excluded.window_minutes,max_guests=excluded.max_guests,updated_at=clock_timestamp();
  result:=booking_private.arrival_limit_json_v1(p_spot_id);
  insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,p_actor,'arrival_limit_saved',jsonb_build_object('before',old,'after',result));
 else result:=old;
 end if;
 insert into booking_private.arrival_limit_requests_v1(spot_id,request_id,owner_id,actor_id,fingerprint,outcome) values(p_spot_id,p_request_id,owner,p_actor,fp,result);
 return result;
end $$;

-- Actual fixed elapsed-time bins, aligned to a UTC hour. In Europe/Zurich they
-- align to the selected quarter/half/full hour; repeated autumn hours stay distinct.
-- Count each parent booking once across ALL services/channels. Completed bookings
-- retain intake load; cancelled/declined/no_show do not. This is not presence.
create function booking_private.arrival_allowed_v1(p_spot uuid,p_start timestamptz,p_party integer,p_exclude uuid default null) returns boolean
language plpgsql set search_path='' as $$
declare policy booking_private.arrival_limits_v1%rowtype; bucket timestamptz; finish timestamptz; previous public.booking_reservations%rowtype; used bigint; begin
 if p_start is null or not isfinite(p_start) or p_party is null or p_party<1 then return false; end if;
 select * into policy from booking_private.arrival_limits_v1 where spot_id=p_spot;
 if not found or policy.max_guests is null then return true; end if;
 bucket:=date_bin(make_interval(mins=>policy.window_minutes),p_start,timestamptz '2000-01-01 00:00:00+00');finish:=bucket+make_interval(mins=>policy.window_minutes);
 if p_exclude is not null then
  select * into previous from public.booking_reservations where id=p_exclude and spot_id=p_spot;
  -- Preserve or reduce an already saved contribution even after a lower limit.
  if previous.status in ('pending','confirmed','arrived','seated','completed') and previous.starts_at>=bucket and previous.starts_at<finish and p_party<=previous.party_size then return true; end if;
 end if;
 select coalesce(sum(r.party_size),0) into used from public.booking_reservations r
 where r.spot_id=p_spot and r.starts_at>=bucket and r.starts_at<finish and (p_exclude is null or r.id<>p_exclude)
  and r.status in ('pending','confirmed','arrived','seated','completed');
 return used+p_party<=policy.max_guests;
end $$;
create function booking_private.guard_arrival_limit_v1() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' and new.spot_id is distinct from old.spot_id then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 if new.status not in ('pending','confirmed','arrived','seated','completed') then return new; end if;
 -- Canonical RPCs acquire this root before reservation rows. Also serialize fresh
 -- privileged inserts against enabling/changing a limit; an absent policy is not a lock.
 update public.booking_restaurant_settings set updated_at=updated_at where spot_id=new.spot_id;
 if not booking_private.arrival_allowed_v1(new.spot_id,new.starts_at,new.party_size,case when tg_op='UPDATE' then old.id else null end) then
  raise exception 'booking_arrival_limit_exceeded' using errcode='22023'; end if;
 return new;
end $$;
create trigger booking_reservation_arrival_limit before insert or update of spot_id,starts_at,party_size,status on public.booking_reservations
 for each row execute function booking_private.guard_arrival_limit_v1();
revoke all on function booking_private.arrival_limit_json_v1(uuid),booking_private.arrival_allowed_v1(uuid,timestamptz,integer,uuid),booking_private.guard_arrival_limit_v1() from public,anon,authenticated,service_role;
revoke all on function public.booking_console_arrival_limit_v1(uuid),public.booking_console_save_arrival_limit_v1(uuid,uuid,bigint,integer,integer,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.booking_console_arrival_limit_v1(uuid),public.booking_console_save_arrival_limit_v1(uuid,uuid,bigint,integer,integer,uuid,boolean) to authenticated;

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
 where booking_private.arrival_allowed_v1(p_spot_id,g.slot,p_party_size,p_exclude) and (g.slot at time zone 'Europe/Zurich')::date=p_date and g.slot>now()
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
 where booking_private.arrival_allowed_v1(p_spot_id,p_start,p_party,null) and not booking_private.range_blocked_v1(p_spot_id,p_start,p_start+make_interval(mins=>p_duration),s.id,a.id)
  and not exists(select 1 from booking_private.reservation_allocations_v1 current_visit where current_visit.table_id=t.id and current_visit.is_active and current_visit.status='seated')
  and not exists(select 1 from booking_private.reservation_allocations_v1 r where r.table_id=t.id and r.is_active
   and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(p_start,p_start+make_interval(mins=>p_duration),'[)'))
 order by t.seats,t.label,s.id;
end $$;

create or replace function public.booking_console_slots_v2(p_spot_id uuid,p_date date,p_party_size integer,p_reservation_id uuid default null,p_duration_minutes integer default null,p_service_id uuid default null,p_area_id uuid default null,p_time time default null)
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
  where booking_private.arrival_allowed_v1(p_spot_id,g.slot,p_party_size,p_reservation_id) and c.seats>=p_party_size and (g.slot at time zone 'Europe/Zurich')::date=p_date and g.slot>clock_timestamp()
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

create or replace function public.booking_console_walk_in_slots_v2(p_spot_id uuid,p_party_size integer,p_duration_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare observed timestamptz; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_party_size is null or p_party_size<1 or p_party_size>(select max_party_size from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'invalid_booking_party_size' using errcode='22023'; end if;
 if p_duration_minutes is null or p_duration_minutes not between 30 and 480 then raise exception 'invalid_booking_duration' using errcode='22023'; end if;
 observed:=booking_private.admission_clock_v1();
 with choices as (select s.id service_id,s.name service_name,observed starts_at,observed+make_interval(mins=>p_duration_minutes) ends_at,c.table_id,c.table_ids,c.combination_id,c.allocation_label,c.seats,c.area_id,a.name area_name
  from booking_private.walk_in_services_v1(p_spot_id,observed,p_duration_minutes) s cross join lateral booking_private.allocation_choices_v2(p_spot_id) c
  join public.booking_restaurant_areas a on a.id=c.area_id and a.spot_id=p_spot_id
  where booking_private.arrival_allowed_v1(p_spot_id,observed,p_party_size,null) and c.seats>=p_party_size and not booking_private.range_blocked_v1(p_spot_id,observed,observed+make_interval(mins=>p_duration_minutes),s.id,c.area_id)
   and not exists(select 1 from booking_private.reservation_allocations_v1 x where x.table_id=any(c.table_ids) and x.is_active and (x.status='seated' or (x.status in ('pending','confirmed','arrived') and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(observed,observed+make_interval(mins=>p_duration_minutes),'[)')))))
 select jsonb_build_object('observed_at',observed,'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.id) from booking_private.walk_in_services_v1(p_spot_id,observed,p_duration_minutes) s),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('table_label',c.allocation_label) order by c.service_id,c.table_id,c.combination_id) from choices c),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function booking_private.public_choices_v1(p_spot uuid,p_date date,p_party integer,p_start timestamptz default null)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid,table_ids uuid[],combination_id uuid)
language plpgsql set search_path='' as $$
declare p public.booking_public_settings%rowtype; duration integer; maximum integer; observed timestamptz:=clock_timestamp(); begin
 p:=booking_private.public_policy_v1(p_spot);
 select duration_minutes,max_party_size into duration,maximum from public.booking_restaurant_settings where spot_id=p_spot;
 if p_date is null or not isfinite(p_date) or p_date<(observed at time zone 'Europe/Zurich')::date or p_date>(observed at time zone 'Europe/Zurich')::date+p.horizon_days or p_party is null or p_party not between 1 and maximum then raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 return query select distinct on (g.slot) w.service_id,g.slot,g.slot+make_interval(mins=>duration),c.table_id,c.table_ids,c.combination_id
 from (select p_date-1 d union all select p_date) days cross join lateral booking_private.service_windows_v1(p_spot,days.d) w
 cross join lateral generate_series(w.starts_at,w.ends_at-make_interval(mins=>duration),make_interval(mins=>w.interval_minutes)) g(slot)
 cross join lateral booking_private.allocation_choices_v2(p_spot) c
 where booking_private.arrival_allowed_v1(p_spot,g.slot,p_party,null) and w.service_id=any(p.service_ids) and c.seats>=p_party and (g.slot at time zone 'Europe/Zurich')::date=p_date and g.slot>=observed+make_interval(mins=>p.notice_minutes)
  and (p_start is null or g.slot=p_start)
  and not booking_private.range_blocked_v1(p_spot,g.slot,g.slot+make_interval(mins=>duration),w.service_id,c.area_id)
  and not exists(select 1 from booking_private.reservation_allocations_v1 a where a.spot_id=p_spot and a.table_id=any(c.table_ids) and a.is_active and a.status in ('pending','confirmed','arrived','seated') and ((a.status='seated' and a.ends_at<=observed) or tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(g.slot,g.slot+make_interval(mins=>duration),'[)')))
 order by g.slot,(select sum(t.seats) from public.booking_restaurant_tables t where t.spot_id=p_spot and t.id=any(c.table_ids)),cardinality(c.table_ids),c.table_id,w.service_id;
end $$;

commit;
