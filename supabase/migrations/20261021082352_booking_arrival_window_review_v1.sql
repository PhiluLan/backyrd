begin;
-- Current saved intake facts under the same restaurant root as pacing writes.
-- No guest fields, per-table multiplication, presence or availability inference.
create function public.booking_console_arrival_review_v1(p_spot_id uuid,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare policy jsonb; minutes integer; starts timestamptz; ends timestamptz; observed timestamptz; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if not exists(select 1 from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'booking_setup_required' using errcode='22023'; end if;
 -- Modern restaurant operating dates; Zurich midnight aligns with the UTC-hour
 -- bin anchor throughout this range. Pre-1970 local-mean-time history is excluded.
 if p_date is null or not isfinite(p_date) or p_date<date '1970-01-01' or p_date>date '9999-12-30' then raise exception 'invalid_booking_arrival_review_scope' using errcode='22023'; end if;
 policy:=booking_private.arrival_limit_json_v1(p_spot_id);minutes:=(policy->>'window_minutes')::integer;
 starts:=p_date::timestamp at time zone 'Europe/Zurich';ends:=(p_date+1)::timestamp at time zone 'Europe/Zurich';observed:=clock_timestamp();
 with facts as materialized(
  select date_bin(make_interval(mins=>minutes),r.starts_at,timestamptz '2000-01-01 00:00+00') bucket,r.party_size,
   r.status in ('pending','confirmed','arrived','seated','completed') counted
  from public.booking_reservations r where r.spot_id=p_spot_id and r.starts_at>=starts and r.starts_at<ends
 ), grouped as(
  select f.bucket,count(*) filter(where counted) reservations,coalesce(sum(party_size) filter(where counted),0) guests,
   count(*) filter(where not counted) excluded_reservations,coalesce(sum(party_size) filter(where not counted),0) excluded_guests
  from facts f group by f.bucket
 ), windows as(
  select b.value starts_at,b.value+make_interval(mins=>minutes) ends_at,coalesce(g.reservations,0) reservations,coalesce(g.guests,0) guests,
   coalesce(g.excluded_reservations,0) excluded_reservations,coalesce(g.excluded_guests,0) excluded_guests
  from generate_series(starts,ends-make_interval(mins=>minutes),make_interval(mins=>minutes)) b(value) left join grouped g on g.bucket=b.value
 )
 select jsonb_build_object('spot_id',p_spot_id,'date',p_date,'timezone','Europe/Zurich','observed_at',observed,'policy',policy,
  'totals',jsonb_build_object('reservations',sum(w.reservations),'guests',sum(w.guests),'excluded_reservations',sum(w.excluded_reservations),'excluded_guests',sum(w.excluded_guests)),
  'windows',jsonb_agg(to_jsonb(w) order by w.starts_at)) into result from windows w;
 return result;
end $$;
revoke all on function public.booking_console_arrival_review_v1(uuid,date) from public,anon,authenticated,service_role;
grant execute on function public.booking_console_arrival_review_v1(uuid,date) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true,'public_booking',true,'manual_guest_mail',true,'reservation_search',true,'guest_cards',true,'guest_history',true,'service_reports',true,'arrival_limits',true,'arrival_review',true),
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
