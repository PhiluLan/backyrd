-- Preserve all existing day services while adding explicit weekly overnight windows.
alter table public.booking_restaurant_services add column ends_next_day boolean not null default false;
alter table public.booking_restaurant_services drop constraint booking_restaurant_services_check;
alter table public.booking_restaurant_services add constraint booking_restaurant_services_check check (
 opens_at<time '24:00' and ((not ends_next_day and closes_at>opens_at)
 or (ends_next_day and closes_at<=opens_at and closes_at<time '24:00')));

-- Dated service windows override the weekly window; calendar-day closures still win.
create table public.booking_service_hours (
 id uuid primary key,
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 service_id uuid not null,
 book_date date not null check(isfinite(book_date) and book_date between date '0001-01-02' and date '9999-12-29'),
 opens_at time,
 closes_at time,
 next_day boolean not null default false,
 is_closed boolean not null default false,
 interval_minutes integer not null check(interval_minutes between 15 and 120),
 starts_at timestamptz,
 ends_at timestamptz,
 is_active boolean not null default true,
 note text check(length(note)<=160),
 updated_at timestamptz not null default now(),
 foreign key(spot_id,service_id) references public.booking_restaurant_services(spot_id,id),
 constraint booking_service_hours_window check (
  (is_closed and opens_at is null and closes_at is null and starts_at is null and ends_at is null and not next_day)
  or (not is_closed and opens_at is not null and closes_at is not null and opens_at<time '24:00'
   and extract(second from opens_at)=0 and extract(second from closes_at)=0
   and ((not next_day and closes_at>opens_at) or (next_day and closes_at<=opens_at and closes_at<time '24:00'))
   and (starts_at=booking_private.civil_boundary_v1(book_date,opens_at,false)
    and ends_at=booking_private.civil_boundary_v1(book_date+case when next_day then 1 else 0 end,closes_at,true)
    and ends_at>starts_at) is true))
);
create unique index booking_service_hours_active_date on public.booking_service_hours(spot_id,service_id,book_date) where is_active;
alter table public.booking_service_hours enable row level security;
revoke all on public.booking_service_hours from public,anon,authenticated;
grant select on public.booking_service_hours to authenticated;
grant all on public.booking_service_hours to service_role;
create policy booking_service_hours_owner_read on public.booking_service_hours for select to authenticated using(booking_private.is_operator(spot_id));

create function booking_private.service_windows_v1(p_spot uuid,p_date date)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,interval_minutes integer)
language sql stable set search_path='' as $$
 select s.id,
  case when h.id is not null then h.starts_at else coalesce(booking_private.civil_boundary_v1(p_date,s.opens_at,false),(p_date+s.opens_at) at time zone 'Europe/Zurich') end,
  case when h.id is not null then h.ends_at else coalesce(booking_private.civil_boundary_v1(p_date+case when s.ends_next_day then 1 else 0 end,s.closes_at,true),(p_date+case when s.ends_next_day then 1 else 0 end+s.closes_at) at time zone 'Europe/Zurich') end,
  coalesce(h.interval_minutes,s.interval_minutes)
 from public.booking_restaurant_services s left join public.booking_service_hours h
  on h.spot_id=s.spot_id and h.service_id=s.id and h.book_date=p_date and h.is_active
 where s.spot_id=p_spot and s.is_active
  and case when h.id is not null then not h.is_closed else extract(dow from p_date)::integer=any(s.weekdays) end;
$$;
revoke all on function booking_private.service_windows_v1(uuid,date) from public,anon,authenticated;

-- Check every civil day touched by the actual occupied interval, not only its start day.
create or replace function booking_private.range_blocked_v1(p_spot uuid,p_start timestamptz,p_end timestamptz,p_service uuid,p_area uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.booking_restaurant_closures c where c.spot_id=p_spot
  and c.book_date between (p_start at time zone 'Europe/Zurich')::date and (p_end at time zone 'Europe/Zurich')::date
  and (c.service_id is null or c.service_id=p_service) and (c.area_id is null or c.area_id=p_area)
  and tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(p_start,p_end,'[)'));
$$;

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
  and not exists(select 1 from public.booking_reservations r where r.table_id=t.id
   and (p_exclude is null or r.id<>p_exclude) and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(g.slot,g.slot+make_interval(mins=>v_duration),'[)'))
 order by 2,4;
end $$;

create or replace function booking_private.walk_in_services_v1(p_spot_id uuid,p_start timestamptz,p_duration integer)
returns setof public.booking_restaurant_services language sql stable set search_path='' as $$
 select s.* from public.booking_restaurant_services s where s.spot_id=p_spot_id and s.is_active and exists(
  select 1 from (select (p_start at time zone 'Europe/Zurich')::date-1 d union all select (p_start at time zone 'Europe/Zurich')::date) days
  cross join lateral booking_private.service_windows_v1(p_spot_id,days.d) w where w.service_id=s.id and p_start>=w.starts_at
   and p_start+make_interval(mins=>p_duration)<=w.ends_at);
$$;

create function booking_private.planning_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select clock_timestamp(); $$;
revoke all on function booking_private.planning_clock_v1() from public,anon,authenticated;

create function public.booking_console_save_hours_v1(p_spot_id uuid,p_revision bigint,p_id uuid,p_service_id uuid,p_date date,
 p_opens_at time default null,p_closes_at time default null,p_next_day boolean default false,p_closed boolean default false,
 p_interval integer default 30,p_note text default null,p_keep_existing boolean default false,p_archive boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.booking_service_hours%rowtype; v_revision bigint; v_start timestamptz; v_end timestamptz;
 v_invalid uuid[]; n bigint; v_after jsonb; v_clock timestamptz; v_today date; v_running boolean; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 v_clock:=booking_private.planning_clock_v1(); v_today:=(v_clock at time zone 'Europe/Zurich')::date;
 if p_id is null or p_revision is null or p_revision<0 or p_date is null or not isfinite(p_date)
  or p_date<date '0001-01-02' or p_date>date '9999-12-29' or p_archive is null or p_closed is null or p_next_day is null or p_keep_existing is null
  or p_interval is null or p_interval not between 15 and 120 or length(p_note)>160 then raise exception 'invalid_booking_hours' using errcode='22023'; end if;
 if not exists(select 1 from public.booking_restaurant_services where spot_id=p_spot_id and id=p_service_id and (is_active or p_archive)) then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 select * into h from public.booking_service_hours where id=p_id;
 if found and (h.spot_id<>p_spot_id or h.service_id<>p_service_id or h.book_date<>p_date) then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 if p_archive then
  if h.id is null or not h.is_active then return jsonb_build_object('revision',v_revision,'existing_reservations',0); end if;
  select coalesce(booking_private.civil_boundary_v1(p_date,s.opens_at,false),(p_date+s.opens_at) at time zone 'Europe/Zurich'),
   coalesce(booking_private.civil_boundary_v1(p_date+case when s.ends_next_day then 1 else 0 end,s.closes_at,true),(p_date+case when s.ends_next_day then 1 else 0 end+s.closes_at) at time zone 'Europe/Zurich')
   into v_start,v_end from public.booking_restaurant_services s where s.spot_id=p_spot_id and s.id=p_service_id and s.is_active and extract(dow from p_date)::integer=any(s.weekdays);
 else
  if p_closed then
   if p_opens_at is not null or p_closes_at is not null or p_next_day then raise exception 'invalid_booking_hours' using errcode='22023'; end if;
  else
   if p_opens_at is null or p_closes_at is null or p_opens_at>=time '24:00' or extract(second from p_opens_at)<>0 or extract(second from p_closes_at)<>0
    or (not p_next_day and p_closes_at<=p_opens_at) or (p_next_day and (p_closes_at>p_opens_at or p_closes_at>=time '24:00')) then raise exception 'invalid_booking_hours' using errcode='22023'; end if;
   v_start:=booking_private.civil_boundary_v1(p_date,p_opens_at,false);
   v_end:=booking_private.civil_boundary_v1(p_date+case when p_next_day then 1 else 0 end,p_closes_at,true);
   if v_start is null or v_end is null or v_end<=v_start then raise exception 'invalid_booking_hours_time' using errcode='22023'; end if;
  end if;
  if h.is_active and h.opens_at is not distinct from p_opens_at and h.closes_at is not distinct from p_closes_at and h.next_day=p_next_day and h.is_closed=p_closed
   and h.interval_minutes=p_interval and h.note is not distinct from nullif(trim(p_note),'') then return jsonb_build_object('revision',v_revision,'existing_reservations',0); end if;
 end if;
 if p_date<v_today-1 or p_date>v_today+365 then raise exception 'invalid_booking_hours' using errcode='22023'; end if;
 if p_date=v_today-1 then
  select exists(select 1 from booking_private.service_windows_v1(p_spot_id,p_date) w where w.service_id=p_service_id and v_clock>=w.starts_at and v_clock<w.ends_at) into v_running;
  if not v_running and not(coalesce((p_archive or (not p_closed and p_next_day)) and v_start<=v_clock and v_end>v_clock,false)) then
   raise exception 'booking_hours_not_running' using errcode='22023'; end if;
 end if;
 if v_revision<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
 -- Only newly ineligible allocations require acknowledgement; grandfathered bookings are not counted again.
 select coalesce(array_agg(r.id),'{}'::uuid[]) into v_invalid from public.booking_reservations r
 where r.spot_id=p_spot_id and r.service_id=p_service_id and r.status in ('pending','confirmed','arrived','seated')
  and r.starts_at>=(p_date::timestamp at time zone 'Europe/Zurich') and r.starts_at<((p_date+2)::timestamp at time zone 'Europe/Zurich')
  and not exists(select 1 from (select (r.starts_at at time zone 'Europe/Zurich')::date-1 d union all select (r.starts_at at time zone 'Europe/Zurich')::date) days
   cross join lateral booking_private.service_windows_v1(p_spot_id,days.d) w where w.service_id=r.service_id and r.starts_at>=w.starts_at and r.ends_at<=w.ends_at);
 if p_archive then update public.booking_service_hours set is_active=false,updated_at=now() where id=h.id;
 else
  insert into public.booking_service_hours(id,spot_id,service_id,book_date,opens_at,closes_at,next_day,is_closed,interval_minutes,starts_at,ends_at,note)
   values(p_id,p_spot_id,p_service_id,p_date,p_opens_at,p_closes_at,p_next_day,p_closed,p_interval,v_start,v_end,nullif(trim(p_note),''))
   on conflict(id) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,next_day=excluded.next_day,is_closed=excluded.is_closed,
    interval_minutes=excluded.interval_minutes,starts_at=excluded.starts_at,ends_at=excluded.ends_at,note=excluded.note,is_active=true,updated_at=now()
    where public.booking_service_hours.spot_id=p_spot_id and public.booking_service_hours.service_id=p_service_id and public.booking_service_hours.book_date=p_date;
  if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 end if;
 select count(*) into n from public.booking_reservations r where r.spot_id=p_spot_id and r.service_id=p_service_id and r.status in ('pending','confirmed','arrived','seated') and not(r.id=any(v_invalid))
  and r.starts_at>=(p_date::timestamp at time zone 'Europe/Zurich') and r.starts_at<((p_date+2)::timestamp at time zone 'Europe/Zurich')
  and not exists(select 1 from (select (r.starts_at at time zone 'Europe/Zurich')::date-1 d union all select (r.starts_at at time zone 'Europe/Zurich')::date) days
   cross join lateral booking_private.service_windows_v1(p_spot_id,days.d) w where w.service_id=r.service_id and r.starts_at>=w.starts_at and r.ends_at<=w.ends_at);
 if n>0 and not p_keep_existing then raise exception 'booking_hours_has_reservations' using errcode='22023',detail=n::text; end if;
 select to_jsonb(x) into v_after from public.booking_service_hours x where id=p_id;
 insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),case when p_archive then 'service_hours_archived' else 'service_hours_saved' end,
  jsonb_build_object('before',to_jsonb(h),'after',v_after,'existing_reservations',n));
 update public.booking_restaurant_settings set revision=revision+1,updated_at=now() where spot_id=p_spot_id;
 return jsonb_build_object('revision',v_revision+1,'existing_reservations',n);
end $$;
revoke all on function public.booking_console_save_hours_v1(uuid,bigint,uuid,uuid,date,time,time,boolean,boolean,integer,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.booking_console_save_hours_v1(uuid,bigint,uuid,uuid,date,time,time,boolean,boolean,integer,text,boolean,boolean) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true),
   'special_hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.book_date,h.service_id) from public.booking_service_hours h where h.spot_id=p_spot_id and h.is_active and h.book_date between p_date-1 and p_date),'[]'::jsonb),
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

create or replace function public.booking_console_week_v1(p_spot_id uuid,p_start_date date,p_service_id uuid default null,p_area_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revision bigint; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_start_date is null or not isfinite(p_start_date) or p_start_date<date '0001-01-01' or p_start_date>date '9999-12-25' then
  raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for share;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 if (p_service_id is not null and not exists(select 1 from public.booking_restaurant_services where spot_id=p_spot_id and id=p_service_id))
   or (p_area_id is not null and not exists(select 1 from public.booking_restaurant_areas where spot_id=p_spot_id and id=p_area_id)) then
   raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 select jsonb_build_object('start_date',p_start_date,'revision',v_revision,'observed_at',clock_timestamp(),
  'days',(select jsonb_agg(jsonb_build_object('date',d.day,'active_reservations',counts.active_reservations,'active_guests',counts.active_guests,
   'pending',counts.pending,'completed',counts.completed,'cancelled',counts.cancelled,'no_show',counts.no_show,
   'closed',exists(select 1 from public.booking_restaurant_closures c where c.spot_id=p_spot_id and c.book_date=d.day and c.start_time is null and c.service_id is null and c.area_id is null),
   'special_hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.service_id) from public.booking_service_hours h where h.spot_id=p_spot_id and h.is_active and h.book_date=d.day and (p_service_id is null or h.service_id=p_service_id)),'[]'::jsonb),
   'closures',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('affected_reservations',booking_private.closure_affected_v1(p_spot_id,c.starts_at,c.ends_at,c.service_id,c.area_id)) order by c.starts_at,c.id)
    from public.booking_restaurant_closures c where c.spot_id=p_spot_id and c.book_date=d.day
     and (p_service_id is null or c.service_id is null or c.service_id=p_service_id)
     and (p_area_id is null or c.area_id is null or c.area_id=p_area_id)),'[]'::jsonb)) order by d.day)
   from (select p_start_date+i as day from generate_series(0,6) i) d
   cross join lateral (
    select count(*) filter(where r.status in ('pending','confirmed','arrived','seated')) active_reservations,
      coalesce(sum(r.party_size) filter(where r.status in ('pending','confirmed','arrived','seated')),0) active_guests,
      count(*) filter(where r.status='pending') pending,count(*) filter(where r.status='completed') completed,
      count(*) filter(where r.status in ('cancelled','declined')) cancelled,count(*) filter(where r.status='no_show') no_show
    from public.booking_reservations r join public.booking_restaurant_tables t on t.id=r.table_id and t.spot_id=r.spot_id
    where r.spot_id=p_spot_id and r.starts_at>=(d.day::timestamp at time zone 'Europe/Zurich')
      and r.starts_at<((d.day+1)::timestamp at time zone 'Europe/Zurich')
      and (p_service_id is null or r.service_id=p_service_id) and (p_area_id is null or t.area_id=p_area_id)
   ) counts)) into result;
 return result;
end $$;

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
   if exists(select 1 from public.booking_reservations r where r.table_id=(v_item->>'id')::uuid
       and r.status in ('pending','confirmed','arrived','seated') and r.ends_at>now() and r.party_size>(v_item->>'seats')::integer) then
     raise exception 'booking_table_has_larger_reservation' using errcode='22023';
   end if;
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
 insert into public.booking_audit_events(spot_id,actor_id,action) values(p_spot_id,auth.uid(),'setup_saved');
 return v_revision+1;
end;
$$;
