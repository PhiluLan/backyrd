-- Restaurant planning blocks preserve existing reservations and stop new allocation.
create function booking_private.civil_boundary_v1(p_date date,p_time time,p_latest boolean) returns timestamptz
language sql immutable set search_path='' as $$
 select case when p_latest then max(t) else min(t) end
 from (select ((p_date+p_time) at time zone 'Europe/Zurich')+make_interval(hours=>h) t from generate_series(-1,1) h) candidates
 where (t at time zone 'Europe/Zurich')=p_date+p_time;
$$;
revoke all on function booking_private.civil_boundary_v1(date,time,boolean) from public,anon,authenticated;
grant execute on function booking_private.civil_boundary_v1(date,time,boolean) to service_role;

create table public.booking_restaurant_closures (
 id uuid primary key,
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 book_date date not null,
 start_time time,
 end_time time,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 service_id uuid,
 area_id uuid,
 note text check (length(note)<=160),
 updated_at timestamptz not null default now(),
 foreign key (spot_id,service_id) references public.booking_restaurant_services(spot_id,id),
 foreign key (spot_id,area_id) references public.booking_restaurant_areas(spot_id,id),
 constraint booking_closure_valid_window check (
  isfinite(book_date) and (start_time is null)=(end_time is null)
  and (start_time is null or (end_time>start_time and end_time<=time '24:00' and extract(second from start_time)=0 and extract(second from end_time)=0))
  and ends_at>starts_at
  and (starts_at=booking_private.civil_boundary_v1(book_date,coalesce(start_time,time '00:00'),false)
   and ends_at=booking_private.civil_boundary_v1(book_date+case when start_time is null then 1 else 0 end,coalesce(end_time,time '00:00'),true)) is true)
);
create index booking_closure_spot_date on public.booking_restaurant_closures(spot_id,book_date);
alter table public.booking_restaurant_closures enable row level security;
revoke all on public.booking_restaurant_closures from anon,authenticated;
grant select on public.booking_restaurant_closures to authenticated;
grant all on public.booking_restaurant_closures to service_role;
create policy booking_closures_operator_read on public.booking_restaurant_closures for select to authenticated
 using (booking_private.is_operator(spot_id));
alter table public.booking_audit_events add column details jsonb not null default '{}'::jsonb
 check (jsonb_typeof(details)='object' and octet_length(details::text)<=4096);

create function booking_private.range_blocked_v1(p_spot uuid,p_start timestamptz,p_end timestamptz,p_service uuid,p_area uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.booking_restaurant_closures c where c.spot_id=p_spot
  and c.book_date=(p_start at time zone 'Europe/Zurich')::date
  and (c.service_id is null or c.service_id=p_service) and (c.area_id is null or c.area_id=p_area)
  and tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(p_start,p_end,'[)'));
$$;
create function booking_private.closure_affected_v1(p_spot uuid,p_start timestamptz,p_end timestamptz,p_service uuid,p_area uuid) returns bigint
language sql stable set search_path='' as $$
 select count(*) from public.booking_reservations r join public.booking_restaurant_tables t on t.id=r.table_id and t.spot_id=r.spot_id
 where r.spot_id=p_spot and r.status in ('pending','confirmed','arrived','seated')
  and (p_service is null or r.service_id=p_service) and (p_area is null or t.area_id=p_area)
  and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(p_start,p_end,'[)');
$$;
revoke all on function booking_private.range_blocked_v1(uuid,timestamptz,timestamptz,uuid,uuid),
 booking_private.closure_affected_v1(uuid,timestamptz,timestamptz,uuid,uuid) from public,anon,authenticated;

create function public.booking_console_save_closure_v1(p_spot_id uuid,p_revision bigint,p_id uuid,p_date date,
 p_start_time time default null,p_end_time time default null,p_service_id uuid default null,p_area_id uuid default null,
 p_note text default null,p_keep_existing boolean default false,p_remove boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.booking_restaurant_closures%rowtype; v_revision bigint; v_start timestamptz; v_end timestamptz; n bigint; v_after jsonb; begin
 perform booking_private.assert_operator(p_spot_id);
 if p_id is null or p_revision is null or p_revision<0 or p_remove is null or p_keep_existing is null then raise exception 'invalid_booking_closure' using errcode='22023'; end if;
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select * into c from public.booking_restaurant_closures where id=p_id and spot_id=p_spot_id;
 if p_remove then
  if c.id is null then return jsonb_build_object('revision',v_revision,'existing_reservations',0); end if;
  if v_revision<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
  delete from public.booking_restaurant_closures where id=c.id;
  insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'closure_removed',jsonb_build_object('before',to_jsonb(c)));
 else
  if p_date is null or not isfinite(p_date) or p_date<date '0001-01-01' or p_date>date '9999-12-30'
   or (p_start_time is null)<>(p_end_time is null) or (p_start_time is not null and (p_end_time<=p_start_time or p_end_time>time '24:00' or extract(second from p_start_time)<>0 or extract(second from p_end_time)<>0))
   or length(p_note)>160 then raise exception 'invalid_booking_closure' using errcode='22023'; end if;
  if (p_service_id is not null and not exists(select 1 from public.booking_restaurant_services where spot_id=p_spot_id and id=p_service_id))
   or (p_area_id is not null and not exists(select 1 from public.booking_restaurant_areas where spot_id=p_spot_id and id=p_area_id)) then
   raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
  v_start:=booking_private.civil_boundary_v1(p_date,coalesce(p_start_time,time '00:00'),false);
  v_end:=booking_private.civil_boundary_v1(p_date+case when p_start_time is null then 1 else 0 end,coalesce(p_end_time,time '00:00'),true);
  if v_start is null or v_end is null or v_end<=v_start then raise exception 'invalid_booking_closure_time' using errcode='22023'; end if;
  n:=booking_private.closure_affected_v1(p_spot_id,v_start,v_end,p_service_id,p_area_id);
  if c.id is not null and c.book_date=p_date and c.starts_at=v_start and c.ends_at=v_end and c.service_id is not distinct from p_service_id
    and c.area_id is not distinct from p_area_id and c.note is not distinct from nullif(trim(p_note),'') then
   return jsonb_build_object('revision',v_revision,'existing_reservations',n); end if;
  if p_date<(now() at time zone 'Europe/Zurich')::date or p_date>(now() at time zone 'Europe/Zurich')::date+365 then raise exception 'invalid_booking_closure' using errcode='22023'; end if;
  if v_revision<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
  if n>0 and not p_keep_existing then raise exception 'booking_closure_has_reservations' using errcode='22023',detail=n::text; end if;
  insert into public.booking_restaurant_closures(id,spot_id,book_date,start_time,end_time,starts_at,ends_at,service_id,area_id,note)
   values(p_id,p_spot_id,p_date,p_start_time,p_end_time,v_start,v_end,p_service_id,p_area_id,nullif(trim(p_note),''))
   on conflict(id) do update set book_date=excluded.book_date,start_time=excluded.start_time,end_time=excluded.end_time,
    starts_at=excluded.starts_at,ends_at=excluded.ends_at,service_id=excluded.service_id,area_id=excluded.area_id,note=excluded.note,updated_at=now()
    where public.booking_restaurant_closures.spot_id=p_spot_id;
  if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
  select to_jsonb(x) into v_after from public.booking_restaurant_closures x where id=p_id;
  insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'closure_saved',jsonb_build_object('before',to_jsonb(c),'after',v_after,'existing_reservations',n));
 end if;
 update public.booking_restaurant_settings set revision=revision+1,updated_at=now() where spot_id=p_spot_id;
 return jsonb_build_object('revision',v_revision+1,'existing_reservations',coalesce(n,0));
end $$;
revoke all on function public.booking_console_save_closure_v1(uuid,bigint,uuid,date,time,time,uuid,uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.booking_console_save_closure_v1(uuid,bigint,uuid,date,time,time,uuid,uuid,text,boolean,boolean) to authenticated;

-- UTC instants preserve real duration across both DST transitions.
create or replace function booking_private.slots_for_amendment_v1(p_spot_id uuid,p_date date,p_party_size integer,p_duration_minutes integer,p_exclude uuid)
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
 select distinct s.id,g.slot,(g.slot)+make_interval(mins=>v_duration),t.id
 from public.booking_restaurant_services s
 cross join lateral generate_series(coalesce(booking_private.civil_boundary_v1(p_date,s.opens_at,false),(p_date+s.opens_at) at time zone 'Europe/Zurich'),
   coalesce(booking_private.civil_boundary_v1(p_date,s.closes_at,true),(p_date+s.closes_at) at time zone 'Europe/Zurich')-make_interval(mins=>v_duration),make_interval(mins=>s.interval_minutes)) g(slot)
 join public.booking_restaurant_tables t on t.spot_id=s.spot_id and t.is_active and t.seats>=p_party_size
 join public.booking_restaurant_areas a on a.spot_id=t.spot_id and a.id=t.area_id and a.is_active
 where s.spot_id=p_spot_id and s.is_active and extract(dow from p_date)::integer=any(s.weekdays)
  and (g.slot)>now()
  and not booking_private.range_blocked_v1(p_spot_id,g.slot,g.slot+make_interval(mins=>v_duration),s.id,a.id)
  and not exists(select 1 from public.booking_reservations r where r.table_id=t.id
   and (p_exclude is null or r.id<>p_exclude) and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(g.slot,
     (g.slot)+make_interval(mins=>v_duration),'[)'))
 order by 2,4;
end;
$$;

create or replace function booking_private.walk_in_services_v1(p_spot_id uuid,p_start timestamptz,p_duration integer)
returns setof public.booking_restaurant_services language sql stable set search_path='' as $$
 select s.* from public.booking_restaurant_services s
 where s.spot_id=p_spot_id and s.is_active
  and extract(dow from p_start at time zone 'Europe/Zurich')::integer=any(s.weekdays)
  and p_start>=coalesce(booking_private.civil_boundary_v1((p_start at time zone 'Europe/Zurich')::date,s.opens_at,false),((p_start at time zone 'Europe/Zurich')::date+s.opens_at) at time zone 'Europe/Zurich')
  and p_start+make_interval(mins=>p_duration)<=coalesce(booking_private.civil_boundary_v1((p_start at time zone 'Europe/Zurich')::date,s.closes_at,true),((p_start at time zone 'Europe/Zurich')::date+s.closes_at) at time zone 'Europe/Zurich');
$$;

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
  and not exists(select 1 from public.booking_reservations current_visit where current_visit.table_id=t.id and current_visit.status='seated')
  and not exists(select 1 from public.booking_reservations r where r.table_id=t.id
   and r.status in ('pending','confirmed','arrived','seated')
   and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(p_start,p_start+make_interval(mins=>p_duration),'[)'))
 order by t.seats,t.label,s.id;
end $$;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_operator(p_spot_id);
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true),
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

-- One scoped read transaction, no guest identities in the weekly summary.
create function public.booking_console_week_v1(p_spot_id uuid,p_start_date date,p_service_id uuid default null,p_area_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revision bigint; result jsonb; begin
 perform booking_private.assert_operator(p_spot_id);
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
revoke all on function public.booking_console_week_v1(uuid,date,uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_console_week_v1(uuid,date,uuid,uuid) to authenticated;
