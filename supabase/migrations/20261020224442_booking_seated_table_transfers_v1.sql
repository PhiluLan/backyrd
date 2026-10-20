begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Planned guest time remains unchanged. These optional timestamps describe
-- the remaining occupancy after staff transfer an already seated party.
alter table public.booking_reservations
 add column allocation_starts_at timestamptz,
 add column allocation_ends_at timestamptz,
 add constraint booking_reservation_allocation_window check (
  (allocation_starts_at is null and allocation_ends_at is null) or
  (allocation_starts_at is not null and allocation_ends_at is not null
   and isfinite(allocation_starts_at) and isfinite(allocation_ends_at)
   and allocation_ends_at>allocation_starts_at));
-- Replace atomically, retaining the same occupying statuses. The private
-- allocation exclusion and one-seated-party constraints remain in force.
alter table public.booking_reservations drop constraint booking_reservations_table_id_tstzrange_excl;
alter table public.booking_reservations add constraint booking_reservations_table_id_tstzrange_excl
 exclude using gist (table_id with =,tstzrange(coalesce(allocation_starts_at,starts_at),coalesce(allocation_ends_at,ends_at),'[)') with &&)
 where(status in ('pending','confirmed','arrived','seated'));
alter table booking_private.reservation_requests_v2 drop constraint reservation_requests_v2_request_kind_check;
alter table booking_private.reservation_requests_v2 add constraint reservation_requests_v2_request_kind_check
 check(request_kind in ('create','amend','walk_in','transfer'));

create or replace function booking_private.sync_reservation_allocations_v1() returns trigger
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
 values(new.spot_id,new.id,new.table_id,coalesce(new.allocation_starts_at,new.starts_at),coalesce(new.allocation_ends_at,new.ends_at),new.status,new.revision)
 on conflict(reservation_id,table_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,
  reservation_revision=excluded.reservation_revision,is_active=true,updated_at=clock_timestamp();
 update booking_private.reservation_allocations_v1 set starts_at=coalesce(new.allocation_starts_at,new.starts_at),ends_at=coalesce(new.allocation_ends_at,new.ends_at),status=new.status,
  reservation_revision=new.revision,updated_at=clock_timestamp() where reservation_id=new.id and is_active;
 return new;
end $$;

create or replace function booking_private.write_allocations_v2(r public.booking_reservations,p_ids uuid[]) returns void language plpgsql set search_path='' as $$
declare ids uuid[]:=booking_private.table_ids_v2(p_ids); begin
 if not(r.table_id=any(ids)) then raise exception 'booking_allocation_primary_required' using errcode='22023'; end if;
 update booking_private.reservation_allocations_v1 set is_active=false,updated_at=clock_timestamp() where reservation_id=r.id and is_active and not(table_id=any(ids));
 insert into booking_private.reservation_allocations_v1(spot_id,reservation_id,table_id,starts_at,ends_at,status,reservation_revision)
 select r.spot_id,r.id,t,coalesce(r.allocation_starts_at,r.starts_at),coalesce(r.allocation_ends_at,r.ends_at),r.status,r.revision from unnest(ids) t
 on conflict(reservation_id,table_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,reservation_revision=excluded.reservation_revision,is_active=true,updated_at=clock_timestamp();
end $$;

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
  'allocation_starts_at',r.allocation_starts_at,'allocation_ends_at',r.allocation_ends_at,'arrived_at',r.arrived_at,'seated_at',r.seated_at,'completed_at',r.completed_at);
end $$;

create or replace function booking_private.closure_affected_v1(p_spot uuid,p_start timestamptz,p_end timestamptz,p_service uuid,p_area uuid) returns bigint
language sql stable set search_path='' as $$
 select count(*) from public.booking_reservations r where r.spot_id=p_spot and r.status in ('pending','confirmed','arrived','seated')
  and (p_service is null or r.service_id=p_service)
  and (p_area is null or exists(select 1 from booking_private.reservation_allocations_v1 a join public.booking_restaurant_tables t on t.spot_id=a.spot_id and t.id=a.table_id
   where a.reservation_id=r.id and a.is_active and t.area_id=p_area))
  and tstzrange(coalesce(r.allocation_starts_at,r.starts_at),coalesce(r.allocation_ends_at,r.ends_at),'[)') && tstzrange(p_start,p_end,'[)');
$$;

-- A transfer is service for an admitted guest, not a second admission.
-- Closed booking hours do not strand an overstay; target-room/date booking
-- blocks, live physical occupancy and upcoming reservations still apply.
create function booking_private.transfer_choices_v1(p_spot uuid,r public.booking_reservations,p_start timestamptz,p_minutes integer)
returns table(table_id uuid,table_ids uuid[],combination_id uuid,allocation_label text,area_id uuid,seats integer)
language sql stable set search_path='' as $$
 select c.table_id,c.table_ids,c.combination_id,c.allocation_label,c.area_id,c.seats
 from booking_private.allocation_choices_v2(p_spot) c
 where c.seats>=r.party_size
  and c.table_ids is distinct from (select array_agg(a.table_id order by a.table_id) from booking_private.reservation_allocations_v1 a where a.reservation_id=r.id and a.is_active)
  and not booking_private.range_blocked_v1(p_spot,p_start,p_start+make_interval(mins=>p_minutes),r.service_id,c.area_id)
  and not exists(select 1 from booking_private.reservation_allocations_v1 a where a.spot_id=p_spot and a.table_id=any(c.table_ids)
   and a.reservation_id<>r.id and a.is_active and (a.status='seated' or (a.status in ('pending','confirmed','arrived')
    and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(p_start,p_start+make_interval(mins=>p_minutes),'[)'))));
$$;
create function public.booking_console_transfer_choices_v1(p_spot_id uuid,p_reservation_id uuid,p_duration_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; observed timestamptz; choices jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_duration_minutes is null or p_duration_minutes not between 15 and 480 then raise exception 'invalid_booking_transfer_duration' using errcode='22023'; end if;
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if r.status<>'seated' then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 observed:=booking_private.admission_clock_v1();
 select coalesce(jsonb_agg(to_jsonb(c) order by c.seats,c.allocation_label,c.combination_id),'[]'::jsonb) into choices
  from booking_private.transfer_choices_v1(p_spot_id,r,observed,p_duration_minutes) c;
 return jsonb_build_object('reservation_id',r.id,'revision',r.revision,'observed_at',observed,'ends_at',observed+make_interval(mins=>p_duration_minutes),'choices',choices);
end $$;
create function public.booking_console_transfer_v1(p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,p_table_id uuid,p_table_ids uuid[],p_combination_id uuid,p_duration_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; changed public.booking_reservations%rowtype; ids uuid[]; previous booking_private.reservation_requests_v2%rowtype;
 fingerprint text; observed timestamptz; before_state jsonb; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 ids:=booking_private.table_ids_v2(p_table_ids);
 if p_request_id is null or p_reservation_id is null or p_expected_revision is null or p_expected_revision<0
  or p_duration_minutes is null or p_duration_minutes not between 15 and 480 then raise exception 'invalid_booking_transfer_request' using errcode='22023'; end if;
 fingerprint:=booking_private.request_fingerprint_v2(jsonb_build_object('kind','transfer','reservation_id',p_reservation_id,'revision',p_expected_revision,
  'table_id',p_table_id,'table_ids',ids,'combination_id',p_combination_id,'duration_minutes',p_duration_minutes));
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'booking_request_reused' using errcode='22023'; end if; return previous.outcome; end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and (request_id=p_request_id or last_amend_request_id=p_request_id)) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if r.revision<>p_expected_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if r.status<>'seated' then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 observed:=booking_private.admission_clock_v1();
 if not exists(select 1 from booking_private.transfer_choices_v1(p_spot_id,r,observed,p_duration_minutes) c where c.table_id=p_table_id and c.table_ids=ids and c.combination_id is not distinct from p_combination_id) then
  raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 before_state:=booking_private.reservation_audit_state_v1(r);
 -- Retire the old complete set before changing the compatibility primary;
 -- either the new complete set commits or the original set is restored.
 update booking_private.reservation_allocations_v1 set is_active=false,updated_at=clock_timestamp() where reservation_id=r.id and is_active;
 update public.booking_reservations set table_id=p_table_id,combination_id=p_combination_id,
  allocation_starts_at=observed,allocation_ends_at=observed+make_interval(mins=>p_duration_minutes),revision=revision+1,updated_at=clock_timestamp(),
  creation_fingerprint=coalesce(creation_fingerprint,booking_private.creation_fingerprint_v1(r.service_id,r.table_id,r.starts_at,r.party_size,r.guest_name,r.guest_contact,r.note,r.source))
  where id=r.id returning * into changed;
 perform booking_private.write_allocations_v2(changed,ids);
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,created_at,details) values(p_spot_id,r.id,auth.uid(),'seated_tables_transferred',observed,
  jsonb_set(booking_private.reservation_audit_v1(r,changed),'{before}',before_state));
 result:=jsonb_build_object('id',r.id,'table_id',p_table_id,'table_ids',ids,'combination_id',p_combination_id,'revision',changed.revision,'allocation_starts_at',changed.allocation_starts_at,'allocation_ends_at',changed.allocation_ends_at);
 insert into booking_private.reservation_requests_v2(spot_id,request_id,request_kind,fingerprint,reservation_id,outcome) values(p_spot_id,p_request_id,'transfer',fingerprint,r.id,result);
 return result;
end $$;
revoke all on function booking_private.transfer_choices_v1(uuid,public.booking_reservations,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.booking_console_transfer_choices_v1(uuid,uuid,integer),public.booking_console_transfer_v1(uuid,uuid,uuid,bigint,uuid,uuid[],uuid,integer) from public,anon,authenticated;
grant execute on function public.booking_console_transfer_choices_v1(uuid,uuid,integer),public.booking_console_transfer_v1(uuid,uuid,uuid,bigint,uuid,uuid[],uuid,integer) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true),
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

commit;
