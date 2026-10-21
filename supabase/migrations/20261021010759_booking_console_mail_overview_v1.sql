begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Read-only projection of delivery evidence. No capability, ciphertext, recipient,
-- provider identifiers, raw errors or provider payload crosses this boundary.
create function public.booking_console_mail_v1(p_spot_id uuid,p_reservation_id uuid,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; c booking_private.guest_mail_outbox_v1%rowtype;
 a booking_private.guest_access_v1%rowtype; result jsonb; observed timestamptz;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if p_before_id is not null then
  select * into c from booking_private.guest_mail_outbox_v1 where id=p_before_id and spot_id=p_spot_id and reservation_id=p_reservation_id;
  if not found then raise exception 'invalid_booking_mail_cursor' using errcode='22023'; end if;
 end if;
 observed:=clock_timestamp();
 select * into a from booking_private.guest_access_v1 where reservation_id=r.id and spot_id=p_spot_id;
 with candidates as materialized (
  select o.* from booking_private.guest_mail_outbox_v1 o where o.spot_id=p_spot_id and o.reservation_id=r.id
   and (p_before_id is null or (o.created_at,o.id)<(c.created_at,c.id))
   order by o.created_at desc,o.id desc limit 51
 ), page as (select * from candidates order by created_at desc,id desc limit 50)
 select jsonb_build_object('reservation_id',r.id,'revision',r.revision,'observed_at',observed,
  'guest_access',case when a.reservation_id is null then 'none' when a.revoked_at is not null then 'revoked' when a.expires_at<=observed then 'expired' else 'active' end,
  'delivery_blocked',coalesce(a.delivery_blocked_at is not null,false),
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'revision',o.reservation_revision,
   'kind',o.event_kind,'state',o.state,'created_at',o.created_at,'updated_at',o.updated_at,
   'attempts',o.attempts,'prepared',o.payload_prepared_at is not null,'first_attempt_at',o.first_attempt_at,
   'next_attempt_at',case when o.state='pending' then o.next_attempt_at else null end,
   'superseded',o.superseded_at is not null,
   'delayed',o.state='accepted' and exists(select 1 from booking_private.guest_mail_events_v1 e where e.outbox_id=o.id and e.event_kind='delayed'))
   order by o.created_at desc,o.id desc) from page o),'[]'::jsonb),
  'next_cursor',case when (select count(*) from candidates)>50 then (select id from page order by created_at,id limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.booking_console_mail_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_console_mail_v1(uuid,uuid,uuid) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true),
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
