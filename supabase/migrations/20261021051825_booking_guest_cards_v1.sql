begin;
-- Explicit restaurant/controller-scoped contact cards. No inferred identity links.
create table booking_private.guest_cards_v1 (
 id uuid primary key,
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 -- Controller snapshot: ownership transfer does not expose a predecessor's directory.
 owner_id uuid not null,
 name text not null check(length(name) between 1 and 120 and name=btrim(name) and name !~ '[[:cntrl:]]'),
 email text check(email is null or (length(email)<=320 and email=btrim(email) and email !~ '[[:cntrl:]]' and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$')),
 phone text check(phone is null or (length(phone) between 1 and 80 and phone=btrim(phone) and phone !~ '[[:cntrl:]]')),
 is_archived boolean not null default false,
 revision bigint not null default 0 check(revision between 0 and 9007199254740991),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(spot_id,owner_id,id)
);
create index booking_guest_cards_recent_v1 on booking_private.guest_cards_v1(spot_id,owner_id,is_archived,updated_at desc,id desc);
create table booking_private.guest_card_requests_v1 (
 spot_id uuid not null,
 owner_id uuid not null,
 request_id uuid not null,
 guest_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 outcome jsonb not null check(jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=1024),
 created_at timestamptz not null default clock_timestamp(),
 primary key(spot_id,request_id),
 foreign key(spot_id,owner_id,guest_id) references booking_private.guest_cards_v1(spot_id,owner_id,id) on delete cascade
);
create index booking_guest_card_requests_guest_v1 on booking_private.guest_card_requests_v1(spot_id,owner_id,guest_id);
create table booking_private.guest_card_events_v1 (
 id uuid primary key default gen_random_uuid(),
 spot_id uuid not null,
 owner_id uuid not null,
 guest_id uuid not null,
 request_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null check(action in ('created','updated','archived','restored')),
 changed_fields text[] not null check(cardinality(changed_fields) between 1 and 4 and changed_fields <@ array['name','email','phone','is_archived']),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(spot_id,owner_id,guest_id) references booking_private.guest_cards_v1(spot_id,owner_id,id) on delete cascade,
 foreign key(spot_id,request_id) references booking_private.guest_card_requests_v1(spot_id,request_id) on delete cascade
);
create index booking_guest_card_events_guest_v1 on booking_private.guest_card_events_v1(spot_id,owner_id,guest_id,created_at desc,id desc);
alter table booking_private.guest_cards_v1 enable row level security;
alter table booking_private.guest_card_requests_v1 enable row level security;
alter table booking_private.guest_card_events_v1 enable row level security;
revoke all on booking_private.guest_cards_v1,booking_private.guest_card_requests_v1,booking_private.guest_card_events_v1 from public,anon,authenticated,service_role;

create function booking_private.guest_card_projection_v1(c booking_private.guest_cards_v1) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'is_archived',c.is_archived,'revision',c.revision,'created_at',c.created_at,'updated_at',c.updated_at);
$$;
revoke all on function booking_private.guest_card_projection_v1(booking_private.guest_cards_v1) from public,anon,authenticated,service_role;

create function public.booking_console_guests_v1(p_spot_id uuid,p_query text default '',p_archived boolean default false,
 p_after_updated_at timestamptz default null,p_after_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid; q text:=lower(btrim(coalesce(p_query,''))); digits text; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,case when p_archived then 'manage' else 'read' end);
 if length(q)>320 or q ~ '[[:cntrl:]]' or p_archived is null or (p_after_updated_at is null)<>(p_after_id is null)
   or (p_after_updated_at is not null and not isfinite(p_after_updated_at)) then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 select owner_id into owner from public.spots where id=p_spot_id;
 if q ~ '^[+0-9 ()/.-]+$' then digits:=regexp_replace(q,'[^0-9]','','g'); end if;
 with matches as materialized (
   select c,c.updated_at,c.id from booking_private.guest_cards_v1 c
   where c.spot_id=p_spot_id and c.owner_id=owner and c.is_archived=p_archived
     and (p_after_updated_at is null or (c.updated_at,c.id)<(p_after_updated_at,p_after_id))
     and (q='' or position(q in lower(c.name))>0 or position(q in lower(coalesce(c.email,'')))>0 or position(q in lower(coalesce(c.phone,'')))>0
       or (length(digits)>=3 and position(digits in regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'))>0))
   order by c.updated_at desc,c.id desc limit 26
 ), page as (select * from matches order by updated_at desc,id desc limit 25)
 select jsonb_build_object('guests',coalesce((select jsonb_agg(booking_private.guest_card_projection_v1(p.c) order by p.updated_at desc,p.id desc) from page p),'[]'::jsonb),
   'next_cursor',case when (select count(*) from matches)>25 then (select jsonb_build_object('updated_at',updated_at,'id',id) from page order by updated_at,id limit 1) else null end) into result;
 return result;
end $$;

create function public.booking_console_guest_v1(p_spot_id uuid,p_guest_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c booking_private.guest_cards_v1%rowtype; owner uuid; events jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 select owner_id into owner from public.spots where id=p_spot_id;
 select * into c from booking_private.guest_cards_v1 where spot_id=p_spot_id and owner_id=owner and id=p_guest_id;
 if not found or (c.is_archived and not (booking_private.console_access_v1(p_spot_id)->>'can_manage')::boolean) then raise exception 'booking_guest_unavailable' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc),'[]'::jsonb) into events
 from (select id,actor_id,action,changed_fields,created_at from booking_private.guest_card_events_v1 where spot_id=p_spot_id and owner_id=owner and guest_id=p_guest_id order by created_at desc,id desc limit 20) e;
 return jsonb_build_object('guest',booking_private.guest_card_projection_v1(c),'events',events);
end $$;

create function public.booking_console_guest_write_v1(p_spot_id uuid,p_request_id uuid,p_intent jsonb,p_actor uuid,p_recover boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid; actor uuid:=auth.uid(); gid uuid; rev bigint; kind text; keys text[]; norm jsonb; fp text;
 old booking_private.guest_cards_v1%rowtype; saved booking_private.guest_cards_v1%rowtype; previous booking_private.guest_card_requests_v1%rowtype;
 result jsonb; fields text[]:='{}'; event_action text; n text; e text; p text; archived boolean; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_actor is null or p_actor is distinct from auth.uid() then raise exception 'booking_operator_required' using errcode='42501'; end if;
 if p_request_id is null or p_recover is null or p_intent is null or jsonb_typeof(p_intent)<>'object' or octet_length(p_intent::text)>4096 then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 kind:=p_intent->>'kind';
 if kind='archive' then perform booking_private.assert_console_access_v1(p_spot_id,'manage'); end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_intent) k;
 if (kind='save' and keys<>array['email','id','kind','name','phone','revision']) or (kind='archive' and keys<>array['archived','id','kind','revision'])
   or kind is null or kind not in ('save','archive') or jsonb_typeof(p_intent->'kind')<>'string' or jsonb_typeof(p_intent->'id')<>'string'
   or jsonb_typeof(p_intent->'revision') not in ('null','number') then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 begin gid:=(p_intent->>'id')::uuid;
 exception when invalid_text_representation then raise exception 'booking_guest_invalid' using errcode='22023'; end;
 if p_intent->'revision'<>'null'::jsonb then
   if (p_intent->>'revision')!~'^(0|[1-9][0-9]{0,15})$' then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
   rev:=(p_intent->>'revision')::bigint;
   if rev>9007199254740991 then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
 end if;
 if kind='save' then
   if jsonb_typeof(p_intent->'name')<>'string' or jsonb_typeof(p_intent->'email') not in ('null','string') or jsonb_typeof(p_intent->'phone') not in ('null','string') then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
   n:=btrim(p_intent->>'name'); e:=nullif(btrim(p_intent->>'email'),''); p:=nullif(btrim(p_intent->>'phone'),'');
   if length(n) not between 1 and 120 or n ~ '[[:cntrl:]]'
     or (e is not null and (length(e)>320 or e ~ '[[:cntrl:]]' or e !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$'))
     or (p is not null and (length(p)>80 or p ~ '[[:cntrl:]]')) then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
   norm:=jsonb_build_object('kind',kind,'id',gid,'revision',rev,'name',n,'email',e,'phone',p);
 else
   if rev is null or jsonb_typeof(p_intent->'archived')<>'boolean' then raise exception 'booking_guest_invalid' using errcode='22023'; end if;
   archived:=(p_intent->>'archived')::boolean;
   norm:=jsonb_build_object('kind',kind,'id',gid,'revision',rev,'archived',archived);
 end if;
 select owner_id into owner from public.spots where id=p_spot_id;
 fp:=booking_private.request_fingerprint_v2(jsonb_build_object('actor',actor,'owner',owner,'spot',p_spot_id,'intent',norm));
 select * into previous from booking_private.guest_card_requests_v1 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
   if previous.actor_id is distinct from actor or previous.owner_id<>owner or previous.fingerprint<>fp then raise exception 'booking_request_reused' using errcode='22023'; end if;
   return previous.outcome;
 end if;
 if p_recover then return null; end if;
 select * into old from booking_private.guest_cards_v1 where spot_id=p_spot_id and owner_id=owner and id=gid for update;
 if kind='save' and rev is null then
   if found then raise exception 'booking_guest_changed' using errcode='40001'; end if;
   insert into booking_private.guest_cards_v1(id,spot_id,owner_id,name,email,phone) values(gid,p_spot_id,owner,n,e,p) returning * into saved;
   fields:=array['name','email','phone']; event_action:='created';
 else
   if not found or old.revision is distinct from rev then raise exception 'booking_guest_changed' using errcode='40001'; end if;
   if kind='save' then
     if old.is_archived then raise exception 'booking_guest_unavailable' using errcode='22023'; end if;
     if old.name is distinct from n then fields:=array_append(fields,'name'); end if;
     if old.email is distinct from e then fields:=array_append(fields,'email'); end if;
     if old.phone is distinct from p then fields:=array_append(fields,'phone'); end if;
     event_action:='updated';
   else
     if old.is_archived<>archived then fields:=array['is_archived']; end if;
     n:=old.name; e:=old.email; p:=old.phone;
     event_action:=case when archived then 'archived' else 'restored' end;
   end if;
   if cardinality(fields)=0 then saved:=old;
   else update booking_private.guest_cards_v1 set name=n,email=e,phone=p,is_archived=coalesce(archived,old.is_archived),revision=revision+1,updated_at=clock_timestamp()
     where id=gid and spot_id=p_spot_id and owner_id=owner returning * into saved; end if;
 end if;
 result:=jsonb_build_object('id',saved.id,'revision',saved.revision,'is_archived',saved.is_archived,'updated_at',saved.updated_at);
 insert into booking_private.guest_card_requests_v1(spot_id,owner_id,request_id,guest_id,actor_id,fingerprint,outcome) values(p_spot_id,owner,p_request_id,gid,actor,fp,result);
 if cardinality(fields)>0 then insert into booking_private.guest_card_events_v1(spot_id,owner_id,guest_id,request_id,actor_id,action,changed_fields) values(p_spot_id,owner,gid,p_request_id,actor,event_action,fields); end if;
 return result;
exception when unique_violation then raise exception 'booking_guest_changed' using errcode='40001';
end $$;
revoke all on function public.booking_console_guests_v1(uuid,text,boolean,timestamptz,uuid),public.booking_console_guest_v1(uuid,uuid),public.booking_console_guest_write_v1(uuid,uuid,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.booking_console_guests_v1(uuid,text,boolean,timestamptz,uuid),public.booking_console_guest_v1(uuid,uuid),public.booking_console_guest_write_v1(uuid,uuid,jsonb,uuid,boolean) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true,'public_booking',true,'manual_guest_mail',true,'reservation_search',true,'guest_cards',true),
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
