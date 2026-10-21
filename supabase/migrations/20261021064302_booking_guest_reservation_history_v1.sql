begin;
-- Explicit staff associations, never inferred from matching names or contacts.
create table booking_private.reservation_guests_v1 (
 reservation_id uuid primary key,
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 owner_id uuid not null,
 guest_id uuid,
 revision bigint not null check(revision between 1 and 9007199254740991),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(spot_id,reservation_id) references public.booking_reservations(spot_id,id) on delete cascade,
 foreign key(spot_id,owner_id,guest_id) references booking_private.guest_cards_v1(spot_id,owner_id,id)
);
create index reservation_guest_directory_v1 on booking_private.reservation_guests_v1(spot_id,owner_id,guest_id,reservation_id) where guest_id is not null;
create table booking_private.reservation_guest_requests_v1 (
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 request_id uuid not null,
 owner_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 reservation_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 outcome jsonb not null check(jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=2048),
 created_at timestamptz not null default clock_timestamp(),
 primary key(spot_id,request_id),
 foreign key(spot_id,reservation_id) references public.booking_reservations(spot_id,id) on delete cascade
);
create table booking_private.reservation_guest_events_v1 (
 id uuid primary key default gen_random_uuid(),
 spot_id uuid not null,
 owner_id uuid not null,
 reservation_id uuid not null,
 request_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 previous_guest_id uuid,
 guest_id uuid,
 revision bigint not null check(revision between 1 and 9007199254740991),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(spot_id,reservation_id) references public.booking_reservations(spot_id,id) on delete cascade,
 foreign key(spot_id,request_id) references booking_private.reservation_guest_requests_v1(spot_id,request_id) deferrable initially deferred,
 foreign key(spot_id,owner_id,previous_guest_id) references booking_private.guest_cards_v1(spot_id,owner_id,id),
 foreign key(spot_id,owner_id,guest_id) references booking_private.guest_cards_v1(spot_id,owner_id,id)
);
create index reservation_guest_events_recent_v1 on booking_private.reservation_guest_events_v1(spot_id,owner_id,reservation_id,created_at desc,id desc);
alter table booking_private.reservation_guests_v1 enable row level security;
alter table booking_private.reservation_guest_requests_v1 enable row level security;
alter table booking_private.reservation_guest_events_v1 enable row level security;
revoke all on booking_private.reservation_guests_v1,booking_private.reservation_guest_requests_v1,booking_private.reservation_guest_events_v1 from public,anon,authenticated,service_role;

create function booking_private.set_reservation_guest_v1(p_spot uuid,p_owner uuid,p_reservation uuid,p_request uuid,p_guest uuid,p_revision bigint) returns jsonb
language plpgsql set search_path='' as $$
declare old booking_private.reservation_guests_v1%rowtype; result jsonb; previous_guest uuid; begin
 select * into old from booking_private.reservation_guests_v1 where reservation_id=p_reservation for update;
 if old.owner_id=p_owner then previous_guest:=old.guest_id; end if;
 if p_revision=0 then
  return jsonb_build_object('reservation_id',p_reservation,'guest_id',null,'revision',0);
 end if;
 insert into booking_private.reservation_guests_v1(reservation_id,spot_id,owner_id,guest_id,revision)
 values(p_reservation,p_spot,p_owner,p_guest,p_revision)
 on conflict(reservation_id) do update set owner_id=excluded.owner_id,guest_id=excluded.guest_id,revision=excluded.revision,updated_at=clock_timestamp();
 insert into booking_private.reservation_guest_events_v1(spot_id,owner_id,reservation_id,request_id,actor_id,previous_guest_id,guest_id,revision)
 values(p_spot,p_owner,p_reservation,p_request,auth.uid(),previous_guest,p_guest,p_revision);
 return jsonb_build_object('reservation_id',p_reservation,'guest_id',p_guest,'revision',p_revision);
end $$;
revoke all on function booking_private.set_reservation_guest_v1(uuid,uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;

-- Versioned wrapper retains the canonical allocation/create path. Booking and
-- optional association commit together, including their original-request facts.
create function public.booking_console_create_v3(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,p_table_ids uuid[],p_combination_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_party_size integer,p_guest_name text,p_guest_contact text,p_note text,p_source text,p_status text,p_guest_id uuid,p_guest_revision bigint,p_actor uuid,p_recover boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid; fp text; ids uuid[]; original booking_private.reservation_guest_requests_v1%rowtype; saved jsonb; association jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_actor is null or p_actor is distinct from auth.uid() then raise exception 'booking_operator_required' using errcode='42501'; end if;
 if p_request_id is null or p_recover is null or (p_guest_id is null)<>(p_guest_revision is null) or p_guest_revision<0 or p_guest_revision>9007199254740991 then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 select owner_id into owner from public.spots where id=p_spot_id;
 ids:=booking_private.table_ids_v2(p_table_ids);
 fp:=booking_private.request_fingerprint_v2(jsonb_build_object('kind','create','owner',owner,'actor',auth.uid(),'service',p_service_id,'table',p_table_id,'tables',ids,'combination',p_combination_id,
  'start',to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),'duration',p_duration_minutes,'party',p_party_size,'name',btrim(p_guest_name),'contact',nullif(btrim(p_guest_contact),''),'note',nullif(btrim(p_note),''),'source',p_source,'status',p_status,'guest',p_guest_id,'guest_revision',p_guest_revision));
 select * into original from booking_private.reservation_guest_requests_v1 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  if original.owner_id<>owner or original.actor_id is distinct from auth.uid() or original.fingerprint<>fp then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return original.outcome;
 end if;
 if exists(select 1 from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id)
  or exists(select 1 from public.booking_reservations where spot_id=p_spot_id and request_id=p_request_id) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 if p_recover then return null; end if;
 if p_guest_id is not null then
  if not exists(select 1 from booking_private.guest_cards_v1 where spot_id=p_spot_id and owner_id=owner and id=p_guest_id and revision=p_guest_revision and not is_archived) then raise exception 'booking_guest_changed' using errcode='40001'; end if;
 end if;
 saved:=public.booking_console_create_v2(p_spot_id,p_request_id,p_service_id,p_table_id,ids,p_combination_id,p_starts_at,p_duration_minutes,p_party_size,p_guest_name,p_guest_contact,p_note,p_source,p_status);
 association:=booking_private.set_reservation_guest_v1(p_spot_id,owner,(saved->>'id')::uuid,p_request_id,p_guest_id,case when p_guest_id is null then 0 else 1 end);
 saved:=saved||jsonb_build_object('guest_link',association);
 insert into booking_private.reservation_guest_requests_v1(spot_id,request_id,owner_id,actor_id,reservation_id,fingerprint,outcome)
 values(p_spot_id,p_request_id,owner,auth.uid(),(saved->>'id')::uuid,fp,saved);
 return saved;
end $$;

create function public.booking_console_reservation_guest_write_v1(p_spot_id uuid,p_request_id uuid,p_intent jsonb,p_actor uuid,p_recover boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid; fp text; keys text[]; kind text; rid uuid; gid uuid; card_rev bigint; link_rev bigint; reservation_rev bigint;
 original booking_private.reservation_guest_requests_v1%rowtype; current_link booking_private.reservation_guests_v1%rowtype; result jsonb; n text; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_actor is null or p_actor is distinct from auth.uid() then raise exception 'booking_operator_required' using errcode='42501'; end if;
 if p_request_id is null or p_recover is null or p_intent is null or jsonb_typeof(p_intent)<>'object' or octet_length(p_intent::text)>2048 then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_intent) k;
 if keys is distinct from array['guest_id','guest_revision','kind','link_revision','reservation_id','reservation_revision'] then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 kind:=p_intent->>'kind';
 if jsonb_typeof(p_intent->'kind')<>'string' or kind not in ('assign','detach') or jsonb_typeof(p_intent->'reservation_id')<>'string' then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 foreach n in array array['link_revision','reservation_revision'] loop
  if jsonb_typeof(p_intent->n)<>'number' or (p_intent->>n)!~'^[0-9]+$' or (p_intent->>n)::numeric>9007199254740991 then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 end loop;
 begin
  rid:=(p_intent->>'reservation_id')::uuid; link_rev:=(p_intent->>'link_revision')::bigint; reservation_rev:=(p_intent->>'reservation_revision')::bigint;
  if kind='assign' then
   if jsonb_typeof(p_intent->'guest_id')<>'string' or jsonb_typeof(p_intent->'guest_revision')<>'number' or (p_intent->>'guest_revision')!~'^[0-9]+$' or (p_intent->>'guest_revision')::numeric>9007199254740991 then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
   gid:=(p_intent->>'guest_id')::uuid; card_rev:=(p_intent->>'guest_revision')::bigint;
  elsif p_intent->'guest_id'<>'null'::jsonb or p_intent->'guest_revision'<>'null'::jsonb then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'booking_guest_invalid' using errcode='22023'; end;
 select owner_id into owner from public.spots where id=p_spot_id;
 fp:=booking_private.request_fingerprint_v2(jsonb_build_object('kind','association','owner',owner,'actor',auth.uid(),'reservation',rid,'reservation_revision',reservation_rev,'link_revision',link_rev,'guest',gid,'guest_revision',card_rev));
 select * into original from booking_private.reservation_guest_requests_v1 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  if original.owner_id<>owner or original.actor_id is distinct from auth.uid() or original.fingerprint<>fp then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return original.outcome;
 end if;
 if exists(select 1 from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id)
  or exists(select 1 from public.booking_reservations where spot_id=p_spot_id and request_id=p_request_id) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 if p_recover then return null; end if;
 if not exists(select 1 from public.booking_reservations where spot_id=p_spot_id and id=rid and revision=reservation_rev) then raise exception 'booking_reservation_changed' using errcode='40001'; end if;
 select * into current_link from booking_private.reservation_guests_v1 where reservation_id=rid and spot_id=p_spot_id and owner_id=owner for update;
 if coalesce(current_link.revision,0)<>link_rev then raise exception 'booking_guest_link_changed' using errcode='40001'; end if;
 if gid is not null and not exists(select 1 from booking_private.guest_cards_v1 where spot_id=p_spot_id and owner_id=owner and id=gid and revision=card_rev and not is_archived) then raise exception 'booking_guest_changed' using errcode='40001'; end if;
 if current_link.guest_id is not distinct from gid then result:=jsonb_build_object('reservation_id',rid,'guest_id',gid,'revision',link_rev);
 else
  if link_rev=9007199254740991 then raise exception 'booking_guest_link_changed' using errcode='40001'; end if;
  result:=booking_private.set_reservation_guest_v1(p_spot_id,owner,rid,p_request_id,gid,link_rev+1);
 end if;
 insert into booking_private.reservation_guest_requests_v1(spot_id,request_id,owner_id,actor_id,reservation_id,fingerprint,outcome)
 values(p_spot_id,p_request_id,owner,auth.uid(),rid,fp,result);
 return result;
end $$;

create function public.booking_console_reservation_guest_v1(p_spot_id uuid,p_reservation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid; link booking_private.reservation_guests_v1%rowtype; guest jsonb; events jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if not exists(select 1 from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id) then raise exception 'booking_not_found' using errcode='22023'; end if;
 select owner_id into owner from public.spots where id=p_spot_id;
 select * into link from booking_private.reservation_guests_v1 where spot_id=p_spot_id and reservation_id=p_reservation_id and owner_id=owner;
 if link.guest_id is not null then
  select jsonb_build_object('id',g.id,'name',case when not g.is_archived or booking_private.console_role_v1(p_spot_id) in ('owner','manager') then g.name else null end,'is_archived',g.is_archived,'revision',case when not g.is_archived or booking_private.console_role_v1(p_spot_id) in ('owner','manager') then g.revision else null end) into guest
  from booking_private.guest_cards_v1 g where g.spot_id=p_spot_id and g.owner_id=owner and g.id=link.guest_id;
 end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc),'[]') into events from (
  select id,actor_id,previous_guest_id,guest_id,revision,created_at from booking_private.reservation_guest_events_v1
  where spot_id=p_spot_id and reservation_id=p_reservation_id and owner_id=owner order by created_at desc,id desc limit 20) e;
 return jsonb_build_object('reservation_id',p_reservation_id,'revision',coalesce(link.revision,0),'guest',guest,'events',events);
end $$;

create function public.booking_console_guest_reservations_v1(p_spot_id uuid,p_guest_id uuid,p_before_starts_at timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid; result jsonb; begin
 -- Reuse the card's archive/role/Safety boundary before exposing related facts.
 perform public.booking_console_guest_v1(p_spot_id,p_guest_id);
 if (p_before_starts_at is null)<>(p_before_id is null) or (p_before_starts_at is not null and not isfinite(p_before_starts_at)) then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 select owner_id into owner from public.spots where id=p_spot_id;
 with candidates as materialized (
  select r.id,r.starts_at,r.ends_at,r.party_size,r.status,r.guest_name,r.revision
  from booking_private.reservation_guests_v1 l join public.booking_reservations r on r.spot_id=l.spot_id and r.id=l.reservation_id
  where l.spot_id=p_spot_id and l.owner_id=owner and l.guest_id=p_guest_id
   and (p_before_starts_at is null or (r.starts_at,r.id)<(p_before_starts_at,p_before_id))
  order by r.starts_at desc,r.id desc limit 26), page as (select * from candidates order by starts_at desc,id desc limit 25)
 select jsonb_build_object('reservations',coalesce((select jsonb_agg(to_jsonb(p) order by starts_at desc,id desc) from page p),'[]'),
  'next_cursor',case when (select count(*) from candidates)>25 then (select jsonb_build_object('starts_at',starts_at,'id',id) from page order by starts_at,id limit 1) else null end) into result;
 return result;
end $$;

revoke all on function public.booking_console_create_v3(uuid,uuid,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text,text,text,uuid,bigint,uuid,boolean),
 public.booking_console_reservation_guest_write_v1(uuid,uuid,jsonb,uuid,boolean),public.booking_console_reservation_guest_v1(uuid,uuid),public.booking_console_guest_reservations_v1(uuid,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.booking_console_create_v3(uuid,uuid,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text,text,text,uuid,bigint,uuid,boolean),
 public.booking_console_reservation_guest_write_v1(uuid,uuid,jsonb,uuid,boolean),public.booking_console_reservation_guest_v1(uuid,uuid),public.booking_console_guest_reservations_v1(uuid,uuid,timestamptz,uuid) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true,'public_booking',true,'manual_guest_mail',true,'reservation_search',true,'guest_cards',true,'guest_history',true),
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
