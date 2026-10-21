-- Read-only restaurant-scoped lookup; never infers or merges guest identities.
create function public.booking_console_search_v1(p_spot_id uuid,p_query text,p_from date,p_to date,
 p_after_starts_at timestamptz default null,p_after_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q text:=lower(btrim(p_query)); phone text; lo timestamptz; hi timestamptz; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if q is null or length(q)<3 or length(q)>120 or q ~ '[[:cntrl:]]'
   or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
   or p_to<p_from or p_to-p_from>365
   or (p_after_starts_at is null)<>(p_after_id is null) then
   raise exception 'booking_search_invalid' using errcode='22023';
 end if;
 lo:=p_from::timestamp at time zone 'Europe/Zurich';
 hi:=(p_to+1)::timestamp at time zone 'Europe/Zurich';
 if p_after_starts_at is not null and (not isfinite(p_after_starts_at) or p_after_starts_at<lo or p_after_starts_at>=hi) then
   raise exception 'booking_search_invalid' using errcode='22023';
 end if;
 if q ~ '^[+0-9 ()/.-]+$' then phone:=regexp_replace(q,'[^0-9]','','g'); end if;
 with matches as materialized (
   select r.id,r.guest_name,r.guest_contact,r.starts_at,r.ends_at,r.party_size,r.status
   from public.booking_reservations r
   where r.spot_id=p_spot_id and r.starts_at>=lo and r.starts_at<hi
     and (p_after_starts_at is null or (r.starts_at,r.id)>(p_after_starts_at,p_after_id))
     and (position(q in lower(r.guest_name))>0 or position(q in lower(coalesce(r.guest_contact,'')))>0
       or (length(phone)>=3 and position(phone in regexp_replace(coalesce(r.guest_contact,''),'[^0-9]','','g'))>0))
   order by r.starts_at,r.id limit 26
 ), page as (select * from matches order by starts_at,id limit 25)
 select jsonb_build_object('reservations',coalesce((select jsonb_agg(to_jsonb(p) order by starts_at,id) from page p),'[]'::jsonb),
   'next_cursor',case when (select count(*) from matches)>25 then
     (select jsonb_build_object('starts_at',starts_at,'id',id) from page order by starts_at desc,id desc limit 1)
     else null end) into result;
 return result;
end $$;
revoke all on function public.booking_console_search_v1(uuid,text,date,date,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.booking_console_search_v1(uuid,text,date,date,timestamptz,uuid) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true,'public_booking',true,'manual_guest_mail',true,'reservation_search',true),
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
