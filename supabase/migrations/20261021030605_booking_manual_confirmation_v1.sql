begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.booking_restaurant_settings in exclusive mode;
-- A manual message confirms current facts; it never creates guest access or retroactive terms.
alter table booking_private.guest_mail_outbox_v1 add column manual_summary jsonb
 check (manual_summary is null or (jsonb_typeof(manual_summary)='object' and octet_length(manual_summary::text)<=8192));
alter table booking_private.reservation_requests_v2 drop constraint reservation_requests_v2_request_kind_check;
alter table booking_private.reservation_requests_v2 add constraint reservation_requests_v2_request_kind_check check (request_kind in ('create','amend','walk_in','transfer','guest_create','guest_cancel','guest_reissue','guest_summary'));

create function booking_private.manual_email_v1(p_email text) returns text
language plpgsql immutable set search_path='' as $$ begin
 if p_email is null or length(trim(p_email)) not between 3 and 254 or p_email ~ '[[:cntrl:]]' or trim(p_email) !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 return trim(p_email);
end $$;
create function booking_private.summary_values_v1(p_actor uuid,p_reservation uuid,p_email text) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('message_mode','manual_summary','actor_id',p_actor,'owner_id',s.owner_id,
  'spot_id',r.spot_id,'reservation_id',r.id,'restaurant_name',s.name,'guest_name',r.guest_name,
  'email',p_email,'party_size',r.party_size,'revision',r.revision,
  'starts_at',to_char(r.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'ends_at',to_char(r.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'status',r.status)
 from public.booking_reservations r join public.spots s on s.id=r.spot_id where r.id=p_reservation;
$$;
create function booking_private.summary_fingerprint_v1(p_actor uuid,p_reservation uuid,p_revision bigint,p_email text) returns text
language sql immutable set search_path='' as $$
 select booking_private.request_fingerprint_v2(jsonb_build_object('kind','guest_summary','actor_id',p_actor,'reservation_id',p_reservation,'revision',p_revision,'email',p_email));
$$;
create function public.booking_mail_summary_recover_v1(p_actor uuid,p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous booking_private.reservation_requests_v2%rowtype; rev bigint; email text; begin
 perform booking_private.assert_console_actor_v1(p_spot_id,p_actor,'write');
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'booking_operator_required' using errcode='42501'; end if;
 email:=booking_private.manual_email_v1(p_email);
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 select revision into rev from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  if previous.request_kind<>'guest_summary' or previous.fingerprint<>booking_private.summary_fingerprint_v1(p_actor,p_reservation_id,p_expected_revision,email) then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return previous.outcome;
 end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and (request_id=p_request_id or last_amend_request_id=p_request_id)) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 if rev>p_expected_revision then return jsonb_build_object('not_committed',true,'id',p_reservation_id,'revision',rev); end if;
 return null;
end $$;
create function public.booking_mail_summary_context_v1(p_actor uuid,p_spot_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; email text; begin
 perform booking_private.assert_console_actor_v1(p_spot_id,p_actor,'write');
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'booking_operator_required' using errcode='42501'; end if;
 email:=booking_private.manual_email_v1(p_email);
 select * into r from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id;
 if r.id is null then raise exception 'booking_not_found' using errcode='22023'; end if;
 if r.revision is distinct from p_expected_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if not exists(select 1 from public.spots s join auth.users u on u.id=s.owner_id where s.id=p_spot_id and u.email_confirmed_at is not null) then raise exception 'booking_mail_summary_unavailable' using errcode='22023'; end if;
 if r.source not in ('phone','email','operator') or r.status not in ('pending','confirmed','cancelled','declined') or r.starts_at<=clock_timestamp() or exists(select 1 from booking_private.guest_access_v1 where reservation_id=r.id) then raise exception 'booking_mail_summary_unavailable' using errcode='22023'; end if;
 if exists(select 1 from booking_private.guest_mail_outbox_v1 o where o.reservation_id=r.id and o.recipient_hash=booking_private.mail_recipient_hash_v1(email) and (o.state in ('bounced','complained') or exists(select 1 from booking_private.guest_mail_events_v1 e where e.outbox_id=o.id and e.event_kind in ('bounced','complained','suppressed')))) then raise exception 'booking_mail_recipient_blocked' using errcode='22023'; end if;
 return booking_private.summary_values_v1(p_actor,r.id,email);
end $$;
create function public.booking_mail_summary_v1(p_actor uuid,p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; r public.booking_reservations%rowtype; changed public.booking_reservations%rowtype; message_id uuid; queued timestamptz; result jsonb; email text; actor_role text; begin
 prior:=public.booking_mail_summary_recover_v1(p_actor,p_spot_id,p_reservation_id,p_request_id,p_expected_revision,p_email);
 if prior is not null then return prior; end if;
 email:=booking_private.manual_email_v1(p_email);
 perform public.booking_mail_summary_context_v1(p_actor,p_spot_id,p_reservation_id,p_expected_revision,email);
 select * into r from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id;
 if (select count(*) from public.booking_audit_events where reservation_id=r.id and action='guest_summary_prepared' and created_at>clock_timestamp()-interval '24 hours')>=3 or
  (select count(*) from public.booking_audit_events where spot_id=p_spot_id and actor_id=p_actor and action='guest_summary_prepared' and created_at>clock_timestamp()-interval '24 hours')>=500 then raise exception 'booking_mail_summary_rate_limited' using errcode='22023'; end if;
 select case when owner_id=p_actor then 'owner' else (select role from public.booking_team_members where spot_id=p_spot_id and user_id=p_actor) end into actor_role from public.spots where id=p_spot_id;
 update public.booking_reservations set revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into changed;
 insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind,recipient_hash,manual_summary)
 values(r.spot_id,r.id,changed.revision,case when changed.status='cancelled' then 'cancelled' else 'changed' end,booking_private.mail_recipient_hash_v1(email),booking_private.summary_values_v1(p_actor,r.id,email)) returning id,created_at into message_id,queued;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,details)
 values(r.spot_id,r.id,p_actor,'guest_summary_prepared',jsonb_set(booking_private.reservation_audit_v1(r,changed),'{actor_role}',to_jsonb(actor_role)));
 result:=jsonb_build_object('id',r.id,'revision',changed.revision,'message_id',message_id,'queued_at',queued);
 insert into booking_private.reservation_requests_v2(spot_id,request_id,reservation_id,request_kind,fingerprint,outcome)
 values(r.spot_id,p_request_id,r.id,'guest_summary',booking_private.summary_fingerprint_v1(p_actor,r.id,p_expected_revision,email),result);
 return result;
end $$;

create function booking_private.mail_snapshot_for_outbox_v1(o booking_private.guest_mail_outbox_v1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; actor uuid; live jsonb; begin
 if o.manual_summary is null then return booking_private.mail_snapshot_v1(o.reservation_id); end if;
 select * into r from public.booking_reservations where id=o.reservation_id and spot_id=o.spot_id;
 if r.id is null or r.revision<>o.reservation_revision or r.source not in ('phone','email','operator') or r.status not in ('pending','confirmed','cancelled','declined') or r.starts_at<=clock_timestamp() then return null; end if;
 begin actor:=(o.manual_summary->>'actor_id')::uuid; exception when invalid_text_representation then return null; end;
 if actor is null or not exists(select 1 from public.spots s join auth.users u on u.id=s.owner_id where s.id=o.spot_id and u.email_confirmed_at is not null) then return null; end if;
 begin
  perform booking_private.assert_console_actor_v1(o.spot_id,actor,'write');
  if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then return null; end if;
 exception when insufficient_privilege then return null;
 when raise_exception then if sqlerrm like 'SAFETY_%' then return null; else raise; end if; end;
 if exists(select 1 from booking_private.guest_mail_outbox_v1 previous where previous.reservation_id=r.id and previous.recipient_hash=o.recipient_hash and (previous.state in ('bounced','complained') or exists(select 1 from booking_private.guest_mail_events_v1 e where e.outbox_id=previous.id and e.event_kind in ('bounced','complained','suppressed')))) then return null; end if;
 begin live:=booking_private.summary_values_v1(actor,r.id,booking_private.manual_email_v1(o.manual_summary->>'email')); exception when invalid_parameter_value then return null; end;
 if live is distinct from o.manual_summary or o.recipient_hash is distinct from booking_private.mail_recipient_hash_v1(live->>'email') then return null; end if;
 return live;
end $$;


create or replace function booking_private.guard_mail_payload_v1() returns trigger language plpgsql set search_path='' as $$ begin
 if new.manual_summary is distinct from old.manual_summary then raise exception 'booking_mail_payload_frozen' using errcode='23514'; end if;
 if (old.payload_sealed is not null and (new.payload_sealed,new.payload_digest,new.payload_context,new.payload_prepared_at) is distinct from (old.payload_sealed,old.payload_digest,old.payload_context,old.payload_prepared_at))
  or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
  or (old.recipient_hash is not null and new.recipient_hash is distinct from old.recipient_hash)
  or (old.provider_id is not null and new.provider_id is distinct from old.provider_id) then
  raise exception 'booking_mail_payload_frozen' using errcode='23514';
 end if;
 return new;
end $$;

create or replace function public.booking_mail_claim_v1(p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record; o booking_private.guest_mail_outbox_v1%rowtype; snap jsonb; observed timestamptz; begin
 if p_lease_id is null then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 for candidate in select id,spot_id from booking_private.guest_mail_outbox_v1
  where (lease_id=p_lease_id and state in ('leased','sending')) or
   (state in ('pending','leased','sending') and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp()))
  order by (lease_id=p_lease_id) desc nulls last,next_attempt_at,id limit 64
 loop
  perform 1 from public.booking_restaurant_settings where spot_id=candidate.spot_id for update skip locked;
  if not found then continue; end if;
  select * into o from booking_private.guest_mail_outbox_v1 where id=candidate.id for update skip locked;
  observed:=clock_timestamp();
  if not found or o.state not in ('pending','leased','sending') then continue; end if;
  if o.lease_until>observed and o.lease_id is distinct from p_lease_id then continue; end if;
  if o.next_attempt_at>observed then continue; end if;
  if o.superseded_at is not null or (o.first_attempt_at is not null and (o.first_attempt_at<=observed-interval '23 hours' or o.attempts>=8)) then
   update booking_private.guest_mail_outbox_v1 set state=case when first_attempt_at is null then 'suppressed' else 'review_required' end,
    last_error_code=case when superseded_at is not null then 'superseded' else 'retry_budget_elapsed' end,lease_id=null,lease_until=null,updated_at=observed where id=o.id;
   continue;
  end if;
  snap:=booking_private.mail_snapshot_for_outbox_v1(o);
  if snap is null or (o.payload_context is not null and o.payload_context<>booking_private.request_fingerprint_v2(snap)) then
   update booking_private.guest_mail_outbox_v1 set state='review_required',last_error_code='context_unavailable',lease_id=null,lease_until=null,updated_at=observed where id=o.id;
   continue;
  end if;
  -- Repeating a still-valid claim does not extend its lease or reset attempt clocks.
  if o.lease_id=p_lease_id and o.lease_until>observed then return booking_private.mail_claim_json_v1(o,snap); end if;
  update booking_private.guest_mail_outbox_v1 set state='leased',lease_id=p_lease_id,lease_until=observed+interval '90 seconds',updated_at=observed where id=o.id returning * into o;
  return booking_private.mail_claim_json_v1(o,snap);
 end loop;
 return null;
end $$;

create or replace function public.booking_mail_prepare_v1(p_id uuid,p_lease_id uuid,p_context text,p_payload text,p_digest text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; snap jsonb; begin
 if p_context is null or p_context !~ '^[0-9a-f]{64}$' or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_payload is null or length(p_payload) not between 40 and 65536 or p_payload !~ '^[A-Za-z0-9_.-]+$' then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=(select spot_id from booking_private.guest_mail_outbox_v1 where id=p_id) for update;
 select * into o from booking_private.guest_mail_outbox_v1 where id=p_id for update;
 if not found or o.state<>'leased' or o.lease_id is distinct from p_lease_id or o.lease_until<=clock_timestamp() or o.superseded_at is not null then return false; end if;
 snap:=booking_private.mail_snapshot_for_outbox_v1(o);
 if snap is null or booking_private.request_fingerprint_v2(snap)<>p_context then return false; end if;
 if o.payload_sealed is not null then
  if (o.payload_sealed,o.payload_digest,o.payload_context) is distinct from (p_payload,p_digest,p_context) then raise exception 'booking_mail_payload_frozen' using errcode='23514'; end if;
  return true;
 end if;
 update booking_private.guest_mail_outbox_v1 set recipient_hash=booking_private.mail_recipient_hash_v1(snap->>'email'),payload_sealed=p_payload,payload_digest=p_digest,payload_context=p_context,payload_prepared_at=clock_timestamp(),updated_at=clock_timestamp() where id=o.id;
 return true;
end $$;

create or replace function public.booking_mail_begin_v1(p_id uuid,p_lease_id uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; snap jsonb; observed timestamptz; begin
 perform 1 from public.booking_restaurant_settings where spot_id=(select spot_id from booking_private.guest_mail_outbox_v1 where id=p_id) for update;
 select * into o from booking_private.guest_mail_outbox_v1 where id=p_id for update;
 observed:=clock_timestamp();
 if not found or o.state not in ('leased','sending') or o.lease_id is distinct from p_lease_id or o.lease_until<=observed or o.superseded_at is not null or o.payload_sealed is null or p_digest is distinct from o.payload_digest then return null; end if;
 if o.first_attempt_at is not null and o.first_attempt_at<=observed-interval '23 hours' then return null; end if;
 snap:=booking_private.mail_snapshot_for_outbox_v1(o);
 if snap is null or booking_private.request_fingerprint_v2(snap)<>o.payload_context then return null; end if;
 if o.recipient_hash is null then
  update booking_private.guest_mail_outbox_v1 set recipient_hash=booking_private.mail_recipient_hash_v1(snap->>'email') where id=o.id;
 end if;
 if o.state='leased' then
  if o.attempts>=8 then return null; end if;
  update booking_private.guest_mail_outbox_v1 set state='sending',first_attempt_at=coalesce(first_attempt_at,observed),attempts=attempts+1,lease_until=observed+interval '90 seconds',updated_at=observed where id=o.id returning * into o;
 end if;
 return jsonb_build_object('id',o.id,'lease_id',o.lease_id,'payload_sealed',o.payload_sealed,'payload_digest',o.payload_digest,'idempotency_key','backyrd-booking/'||o.id,'retry_until',o.first_attempt_at+interval '23 hours');
end $$;

create or replace function booking_private.sync_guest_access_v1() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.revision is distinct from old.revision then
  update booking_private.guest_mail_outbox_v1 set superseded_at=coalesce(superseded_at,clock_timestamp()),
   state=case when state in ('pending','leased') then case when first_attempt_at is null then 'suppressed' else 'review_required' end else state end,
   updated_at=clock_timestamp()
   where reservation_id=new.id and manual_summary is not null and reservation_revision<>new.revision and state in ('pending','leased','sending');
 end if;
 if new.guest_contact is distinct from old.guest_contact then
  update booking_private.guest_access_v1 set revoked_at=clock_timestamp() where reservation_id=new.id and revoked_at is null;
  update booking_private.guest_mail_outbox_v1 set superseded_at=coalesce(superseded_at,clock_timestamp()),state=case when state in ('pending','leased') then case when first_attempt_at is null then 'suppressed' else 'review_required' end else state end,updated_at=clock_timestamp() where reservation_id=new.id and state in ('pending','leased','sending');
 else
  update booking_private.guest_access_v1 set cancellation_deadline=new.starts_at-make_interval(mins=>cancellation_minutes),expires_at=new.ends_at+interval '30 days' where reservation_id=new.id;
  if exists(select 1 from booking_private.guest_access_v1 where reservation_id=new.id and revoked_at is null and delivery_blocked_at is null) and (
   (new.status in ('confirmed','declined','cancelled') and new.status is distinct from old.status) or
   (new.status in ('pending','confirmed') and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.party_size is distinct from old.party_size or new.guest_name is distinct from old.guest_name))) then
   update booking_private.guest_mail_outbox_v1 set superseded_at=coalesce(superseded_at,clock_timestamp()),state=case when state in ('pending','leased') then case when first_attempt_at is null then 'suppressed' else 'review_required' end else state end,updated_at=clock_timestamp() where reservation_id=new.id and state in ('pending','leased','sending');
   insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind) values(new.spot_id,new.id,new.revision,case when new.status='cancelled' then 'cancelled' else 'changed' end) on conflict(reservation_id,reservation_revision,event_kind) do nothing;
  end if;
 end if;
 return new;
end $$;


create function public.booking_console_mail_v2(p_spot_id uuid,p_reservation_id uuid,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb; messages jsonb; begin
 result:=public.booking_console_mail_v1(p_spot_id,p_reservation_id,p_before_id);
 select coalesce(jsonb_agg(m.value||jsonb_build_object('message_mode',case when o.manual_summary is null then 'self_service' else 'manual_summary' end,
  'recipient',case when o.manual_summary is null then null else o.manual_summary->>'email' end) order by m.ordinality),'[]'::jsonb)
 into messages from jsonb_array_elements(result->'messages') with ordinality m(value,ordinality)
 join booking_private.guest_mail_outbox_v1 o on o.id=(m.value->>'id')::uuid and o.spot_id=p_spot_id and o.reservation_id=p_reservation_id;
 return jsonb_set(result,'{messages}',messages);
end $$;
revoke all on function public.booking_console_mail_v2(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_console_mail_v2(uuid,uuid,uuid) to authenticated;
revoke all on function booking_private.manual_email_v1(text),booking_private.summary_values_v1(uuid,uuid,text),booking_private.summary_fingerprint_v1(uuid,uuid,bigint,text),booking_private.mail_snapshot_for_outbox_v1(booking_private.guest_mail_outbox_v1) from public,anon,authenticated;
revoke all on function public.booking_mail_summary_recover_v1(uuid,uuid,uuid,uuid,bigint,text),public.booking_mail_summary_context_v1(uuid,uuid,uuid,bigint,text),public.booking_mail_summary_v1(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.booking_mail_summary_recover_v1(uuid,uuid,uuid,uuid,bigint,text),public.booking_mail_summary_context_v1(uuid,uuid,uuid,bigint,text),public.booking_mail_summary_v1(uuid,uuid,uuid,uuid,bigint,text) to service_role;


create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true,'public_booking',true,'manual_guest_mail',true),
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
