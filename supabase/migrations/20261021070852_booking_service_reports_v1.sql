begin;
-- Current saved booking facts, grouped by Zurich booking-start date. No guest
-- fields, inferred attendance, revenue, unique-person or occupancy metrics.
create function public.booking_console_report_v1(p_spot_id uuid,p_from date,p_to date,p_service_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; observed timestamptz; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if not exists(select 1 from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'booking_setup_required' using errcode='22023'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from<date '0001-01-01' or p_to>date '9999-12-30' or p_to<p_from or p_to-p_from>30 then raise exception 'invalid_booking_report_scope' using errcode='22023'; end if;
 if p_service_id is not null and not exists(select 1 from public.booking_restaurant_services where spot_id=p_spot_id and id=p_service_id) then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 observed:=clock_timestamp();
 with statuses(status,ord) as (values ('pending',1),('confirmed',2),('arrived',3),('seated',4),('completed',5),('cancelled',6),('declined',7),('no_show',8)),
 sources(source,ord) as (values ('phone',1),('email',2),('walk_in',3),('operator',4),('website',5)),
 facts as materialized (
  select r.service_id,r.status,r.source,r.party_size,(r.starts_at at time zone 'Europe/Zurich')::date book_date
  from public.booking_reservations r where r.spot_id=p_spot_id and (p_service_id is null or r.service_id=p_service_id)
   and r.starts_at>=(p_from::timestamp at time zone 'Europe/Zurich') and r.starts_at<((p_to+1)::timestamp at time zone 'Europe/Zurich')),
 status_counts as (select status,count(*) reservations,sum(party_size) guests from facts group by status),
 day_counts as (select book_date,status,count(*) reservations,sum(party_size) guests from facts group by book_date,status),
 service_counts as (select service_id,status,count(*) reservations,sum(party_size) guests from facts group by service_id,status),
 source_counts as (select source,count(*) reservations,sum(party_size) guests from facts group by source),
 totals as (
  select coalesce(sum(c.reservations),0) reservations,coalesce(sum(c.guests),0) guests,
   jsonb_agg(jsonb_build_object('status',s.status,'reservations',coalesce(c.reservations,0),'guests',coalesce(c.guests,0)) order by s.ord) statuses
  from statuses s left join status_counts c using(status)),
 days as (
  select p_from+n book_date,coalesce(sum(c.reservations),0) reservations,coalesce(sum(c.guests),0) guests,
   jsonb_agg(jsonb_build_object('status',s.status,'reservations',coalesce(c.reservations,0),'guests',coalesce(c.guests,0)) order by s.ord) statuses
  from generate_series(0,p_to-p_from) n cross join statuses s left join day_counts c on c.book_date=p_from+n and c.status=s.status group by n),
 service_keys as (select distinct service_id from facts union select p_service_id where p_service_id is not null),
 services as (
  select v.id,v.name,v.is_active,coalesce(sum(c.reservations),0) reservations,coalesce(sum(c.guests),0) guests,
   jsonb_agg(jsonb_build_object('status',s.status,'reservations',coalesce(c.reservations,0),'guests',coalesce(c.guests,0)) order by s.ord) statuses
  from service_keys k join public.booking_restaurant_services v on v.id=k.service_id and v.spot_id=p_spot_id
  cross join statuses s left join service_counts c on c.service_id=v.id and c.status=s.status group by v.id,v.name,v.is_active)
 select case when (select count(*) from services)>1000 then null else jsonb_build_object(
  'spot_id',p_spot_id,'scope',jsonb_build_object('from_date',p_from,'to_date',p_to,'service_id',p_service_id),'observed_at',observed,
  'totals',(select to_jsonb(t) from totals t),
  'days',(select jsonb_agg(jsonb_build_object('date',d.book_date,'reservations',d.reservations,'guests',d.guests,'statuses',d.statuses) order by d.book_date) from days d),
  'services',coalesce((select jsonb_agg(to_jsonb(v) order by v.name,v.id) from services v),'[]'),
  'sources',(select jsonb_agg(jsonb_build_object('source',s.source,'reservations',coalesce(c.reservations,0),'guests',coalesce(c.guests,0)) order by s.ord) from sources s left join source_counts c using(source))) end into result;
 if result is null then raise exception 'booking_report_scope_too_large' using errcode='22023'; end if;
 return result;
end $$;
revoke all on function public.booking_console_report_v1(uuid,date,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.booking_console_report_v1(uuid,date,date,uuid) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true,'public_booking',true,'manual_guest_mail',true,'reservation_search',true,'guest_cards',true,'guest_history',true,'service_reports',true),
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
