begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.booking_restaurant_settings in exclusive mode;

-- Nullable for legacy bookings: never guess which old public text they saw.
alter table booking_private.guest_access_v1 add column policy_snapshot jsonb
 check(policy_snapshot is null or (jsonb_typeof(policy_snapshot)='object' and octet_length(policy_snapshot::text)<=8192));
-- Receipt replay includes the accepted public text. Bound it without rejecting
-- valid multilingual notices, while preserving every existing outcome.
alter table booking_private.reservation_requests_v2 drop constraint reservation_requests_v2_outcome_check;
alter table booking_private.reservation_requests_v2 add constraint reservation_requests_v2_outcome_check check (jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=8192);
create function booking_private.guard_guest_policy_v1() returns trigger language plpgsql set search_path='' as $$ begin
 if old.policy_snapshot is not null and new.policy_snapshot is distinct from old.policy_snapshot then raise exception 'booking_guest_policy_frozen' using errcode='23514'; end if;
 return new;
end $$;
create trigger booking_guest_policy_guard before update on booking_private.guest_access_v1 for each row execute function booking_private.guard_guest_policy_v1();
revoke all on function booking_private.guard_guest_policy_v1() from public,anon,authenticated;

-- One current-owner projection for the new complete read and the existing shape.
create function public.booking_console_public_settings_v2(p_spot_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare rev bigint; config jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 select revision into rev from public.booking_restaurant_settings where spot_id=p_spot_id;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select to_jsonb(p)-'owner_id' into config from public.booking_public_settings p join public.spots s on s.id=p.spot_id and s.owner_id=p.owner_id where p.spot_id=p_spot_id;
 return jsonb_build_object('actor_id',auth.uid(),'restaurant_revision',rev,'settings',config,'observed_at',clock_timestamp());
end $$;
create or replace function public.booking_console_public_settings_v1(p_spot_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select nullif(public.booking_console_public_settings_v2(p_spot_id)->'settings','null'::jsonb); $$;
revoke all on function public.booking_console_public_settings_v2(uuid) from public,anon,authenticated;
grant execute on function public.booking_console_public_settings_v2(uuid) to authenticated;

-- Configuration intents have no reservation FK: keep their journal separate
-- from reservation operations, with the same root/actor/replay invariants.
create table booking_private.public_settings_requests_v1 (
 spot_id uuid not null references public.booking_restaurant_settings(spot_id),
 request_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
 outcome jsonb not null check (jsonb_typeof(outcome)='object' and octet_length(outcome::text)<=1024),
 created_at timestamptz not null default clock_timestamp(),
 primary key(spot_id,request_id)
);
alter table booking_private.public_settings_requests_v1 enable row level security;
revoke all on booking_private.public_settings_requests_v1 from public,anon,authenticated;
grant all on booking_private.public_settings_requests_v1 to service_role;
create function booking_private.public_settings_intent_v1(p_revision bigint,p_settings jsonb) returns text
language plpgsql stable set search_path='' as $$ begin
 if p_revision is null or p_revision<0 or p_settings is null or jsonb_typeof(p_settings)<>'object' or octet_length(p_settings::text)>8192 then raise exception 'invalid_booking_public_settings' using errcode='22023'; end if;
 return booking_private.request_fingerprint_v2(jsonb_build_object('actor_id',auth.uid(),'revision',p_revision,'settings',p_settings));
end $$;
create function public.booking_console_public_settings_recover_v1(p_spot_id uuid,p_request_id uuid,p_revision bigint,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ declare previous booking_private.public_settings_requests_v1%rowtype; fingerprint text; rev bigint; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 if p_request_id is null then raise exception 'invalid_booking_public_settings' using errcode='22023'; end if;
 fingerprint:=booking_private.public_settings_intent_v1(p_revision,p_settings);
 select revision into rev from public.booking_restaurant_settings where spot_id=p_spot_id;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select * into previous from booking_private.public_settings_requests_v1 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  if previous.actor_id is distinct from auth.uid() or previous.fingerprint<>fingerprint then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return previous.outcome;
 end if;
 if rev>p_revision then return jsonb_build_object('not_committed',true,'restaurant_revision',rev); end if;
 return null;
end $$;
create function public.booking_console_save_public_settings_v2(p_spot_id uuid,p_request_id uuid,p_revision bigint,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ declare previous jsonb; result jsonb; ids uuid[]; rev bigint; begin
 previous:=public.booking_console_public_settings_recover_v1(p_spot_id,p_request_id,p_revision,p_settings);
 if previous is not null then return previous; end if;
 if (select revision from public.booking_restaurant_settings where spot_id=p_spot_id)<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
 if (select count(*) from booking_private.public_settings_requests_v1 where spot_id=p_spot_id and created_at>clock_timestamp()-interval '24 hours')>=100 then raise exception 'booking_public_settings_rate_limited' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p_settings))<>8 or not (p_settings ?& array['enabled','service_ids','notice_minutes','horizon_days','cancellation_minutes','confirmation_status','privacy_contact','guest_notice']) or
  jsonb_typeof(p_settings->'enabled')<>'boolean' or jsonb_typeof(p_settings->'service_ids')<>'array' or jsonb_typeof(p_settings->'notice_minutes')<>'number' or jsonb_typeof(p_settings->'horizon_days')<>'number' or jsonb_typeof(p_settings->'cancellation_minutes')<>'number' or jsonb_typeof(p_settings->'confirmation_status')<>'string' or jsonb_typeof(p_settings->'privacy_contact')<>'string' or jsonb_typeof(p_settings->'guest_notice')<>'string' then raise exception 'invalid_booking_public_settings' using errcode='22023'; end if;
 select array_agg(value::uuid order by ord) into ids from jsonb_array_elements_text(p_settings->'service_ids') with ordinality t(value,ord);
 rev:=public.booking_console_save_public_settings_v1(p_spot_id,p_revision,(p_settings->>'enabled')::boolean,ids,(p_settings->>'notice_minutes')::integer,(p_settings->>'horizon_days')::integer,(p_settings->>'cancellation_minutes')::integer,p_settings->>'confirmation_status',p_settings->>'privacy_contact',p_settings->>'guest_notice');
 result:=jsonb_build_object('restaurant_revision',rev,'policy_revision',(select revision from public.booking_public_settings where spot_id=p_spot_id));
 insert into booking_private.public_settings_requests_v1(spot_id,request_id,actor_id,fingerprint,outcome) values(p_spot_id,p_request_id,auth.uid(),booking_private.public_settings_intent_v1(p_revision,p_settings),result);
 return result;
end $$;
revoke all on function booking_private.public_settings_intent_v1(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.booking_console_public_settings_recover_v1(uuid,uuid,bigint,jsonb),public.booking_console_save_public_settings_v2(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.booking_console_public_settings_recover_v1(uuid,uuid,bigint,jsonb),public.booking_console_save_public_settings_v2(uuid,uuid,bigint,jsonb) to authenticated;

create or replace function public.booking_guest_availability_v1(p_spot_id uuid,p_date date,p_party_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.booking_public_settings%rowtype; choices jsonb; begin
 p:=booking_private.public_policy_v1(p_spot_id);
 if p_date is null or p_party_size is null or p_party_size<1 or p_party_size>500 then raise exception 'invalid_booking_public_request' using errcode='22023'; end if;
 if p_party_size>(select max_party_size from public.booking_restaurant_settings where spot_id=p_spot_id) or p_date<(clock_timestamp() at time zone 'Europe/Zurich')::date or p_date>(clock_timestamp() at time zone 'Europe/Zurich')::date+p.horizon_days then choices:='[]'::jsonb; else
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',c.starts_at,'ends_at',c.ends_at) order by c.starts_at),'[]'::jsonb) into choices from booking_private.public_choices_v1(p_spot_id,p_date,p_party_size) c;
 end if;
 return jsonb_build_object('spot_id',p_spot_id,'name',(select name from public.spots where id=p_spot_id),'date',p_date,'party_size',p_party_size,'policy_revision',p.revision,'notice_minutes',p.notice_minutes,'horizon_days',p.horizon_days,'cancellation_minutes',p.cancellation_minutes,'confirmation_status',p.confirmation_status,'privacy_contact',p.privacy_contact,'guest_notice',p.guest_notice,'max_party_size',(select max_party_size from public.booking_restaurant_settings where spot_id=p_spot_id),'slots',choices);
end $$;
create or replace function booking_private.guest_receipt_v1(r public.booking_reservations) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'spot_id',r.spot_id,'name',(select name from public.spots where id=r.spot_id),'guest_name',r.guest_name,'party_size',r.party_size,'starts_at',r.starts_at,'ends_at',r.ends_at,'status',r.status,'revision',r.revision,'cancellation_deadline',a.cancellation_deadline,'policy_snapshot',a.policy_snapshot) from booking_private.guest_access_v1 a where a.reservation_id=r.id;
$$;
create or replace function public.booking_guest_create_v1(p_spot_id uuid,p_request_id uuid,p_policy_revision bigint,p_starts_at timestamptz,p_party_size integer,p_guest_name text,p_email text,p_key_hash text,p_sealed_key text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.booking_public_settings%rowtype; previous booking_private.reservation_requests_v2%rowtype; fingerprint text; choice record; r public.booking_reservations%rowtype; result jsonb; email text:=lower(trim(p_email)); begin
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if p_request_id is null or p_policy_revision is null or p_starts_at is null or not isfinite(p_starts_at) or p_guest_name is null or length(trim(p_guest_name)) not between 1 and 120
  or email is null or length(email)>254 or email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or email ~ '[[:cntrl:]]'
  or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or p_sealed_key is null or length(p_sealed_key) not between 40 and 2048 or length(p_note)>1000 then raise exception 'invalid_booking_guest_request' using errcode='22023'; end if;
 fingerprint:=booking_private.request_fingerprint_v2(jsonb_build_object('kind','guest_create','policy_revision',p_policy_revision,'starts_at',to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),'party_size',p_party_size,'name',trim(p_guest_name),'email',email,'key_hash',p_key_hash,'note',nullif(trim(p_note),'')));
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'booking_request_reused' using errcode='22023'; end if; perform booking_private.authorize_guest_v1(previous.reservation_id,p_key_hash); return previous.outcome; end if;
 p:=booking_private.public_policy_v1(p_spot_id);
 if p.revision<>p_policy_revision then raise exception 'booking_public_policy_changed' using errcode='40001'; end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and (request_id=p_request_id or last_amend_request_id=p_request_id)) or exists(select 1 from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 if (select count(*) from public.booking_reservations where spot_id=p_spot_id and source='website' and lower(guest_contact)=email and created_at>clock_timestamp()-interval '24 hours')>=3 then raise exception 'booking_guest_request_unavailable' using errcode='22023'; end if;
 select * into choice from booking_private.public_choices_v1(p_spot_id,(p_starts_at at time zone 'Europe/Zurich')::date,p_party_size,p_starts_at) limit 1;
 if not found then raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 -- Reuse the canonical allocation validator before mutating shared inventory.
 perform booking_private.validate_allocation_v2(p_spot_id,choice.service_id,choice.table_id,choice.table_ids,choice.combination_id,choice.starts_at,extract(epoch from choice.ends_at-choice.starts_at)::integer/60,p_party_size,null,false);
 insert into public.booking_reservations(spot_id,request_id,service_id,table_id,combination_id,starts_at,ends_at,party_size,guest_name,guest_contact,note,source,status,created_by,creation_fingerprint)
 values(p_spot_id,p_request_id,choice.service_id,choice.table_id,choice.combination_id,choice.starts_at,choice.ends_at,p_party_size,trim(p_guest_name),email,nullif(trim(p_note),''),'website',p.confirmation_status,null,fingerprint) returning * into r;
 perform booking_private.write_allocations_v2(r,choice.table_ids);
 insert into booking_private.guest_access_v1(spot_id,reservation_id,key_hash,sealed_key,policy_revision,cancellation_minutes,cancellation_deadline,expires_at,policy_snapshot)
 values(p_spot_id,r.id,p_key_hash,p_sealed_key,p.revision,p.cancellation_minutes,r.starts_at-make_interval(mins=>p.cancellation_minutes),r.ends_at+interval '30 days',jsonb_build_object('policy_revision',p.revision,'cancellation_minutes',p.cancellation_minutes,'confirmation_status',p.confirmation_status,'privacy_contact',p.privacy_contact,'guest_notice',p.guest_notice));
 insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind) values(p_spot_id,r.id,r.revision,'created');
 insert into public.booking_audit_events(spot_id,reservation_id,action,details) values(p_spot_id,r.id,'reservation_created',jsonb_set(booking_private.reservation_audit_v1(null,r),'{actor_role}','"guest"'));
 result:=booking_private.guest_receipt_v1(r);
 insert into booking_private.reservation_requests_v2(spot_id,request_id,reservation_id,request_kind,fingerprint,outcome) values(p_spot_id,p_request_id,r.id,'guest_create',fingerprint,result);
 return result;
end $$;

-- Guest links retain scoped access when intake is closed. They never confer
-- operator access or reveal internal notes, other guests, tables or contact.
-- Read-only settlement of the exact frozen checkout intent. An absent record
-- alone proves nothing; monotonic policy epochs or a past start fence any later
-- successful creation of this same logical intent. Echo the tuple for clients.
create function public.booking_guest_checkout_recover_v1(p_spot_id uuid,p_request_id uuid,p_key_hash text,p_policy_revision bigint,p_starts_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$ declare previous booking_private.reservation_requests_v2%rowtype; r public.booking_reservations%rowtype; policy public.booking_public_settings%rowtype; begin
 if p_spot_id is null or p_request_id is null or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or p_policy_revision is null or p_policy_revision<1 or p_starts_at is null or not isfinite(p_starts_at) then raise exception 'invalid_booking_guest_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found and clock_timestamp()<p_starts_at then raise exception 'booking_guest_link_unavailable' using errcode='P0002'; end if;
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  if previous.request_kind<>'guest_create' then raise exception 'booking_guest_link_unavailable' using errcode='P0002'; end if;
  r:=booking_private.authorize_guest_v1(previous.reservation_id,p_key_hash);
  return booking_private.guest_receipt_v1(r);
 end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and (request_id=p_request_id or last_amend_request_id=p_request_id)) then raise exception 'booking_guest_link_unavailable' using errcode='P0002'; end if;
 -- Only currently public metadata may settle a changed policy. Paused/private
 -- configuration must not become an anonymous revision oracle.
 begin policy:=booking_private.public_policy_v1(p_spot_id);
 exception when no_data_found then policy:=null; when raise_exception then if sqlerrm like 'SAFETY_%' then policy:=null; else raise; end if; end;
 if (policy.spot_id is not null and policy.revision>p_policy_revision) or clock_timestamp()>=p_starts_at then
  return jsonb_build_object('not_committed',true,'spot_id',p_spot_id,'request_id',p_request_id,'policy_revision',p_policy_revision,'starts_at',p_starts_at);
 end if;
 raise exception 'booking_guest_link_unavailable' using errcode='P0002';
end $$;
revoke all on function public.booking_guest_checkout_recover_v1(uuid,uuid,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.booking_guest_checkout_recover_v1(uuid,uuid,text,bigint,timestamptz) to service_role;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true,'public_booking',true),
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
