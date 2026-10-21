begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.booking_restaurant_settings in exclusive mode;

alter table booking_private.guest_mail_outbox_v1 add column recipient_hash text check(recipient_hash ~ '^[0-9a-f]{64}$');
alter table booking_private.guest_access_v1 add column delivery_blocked_recipient_hash text check(delivery_blocked_recipient_hash ~ '^[0-9a-f]{64}$');
alter table booking_private.reservation_requests_v2 drop constraint reservation_requests_v2_request_kind_check;
alter table booking_private.reservation_requests_v2 add constraint reservation_requests_v2_request_kind_check check(request_kind in ('create','amend','walk_in','transfer','guest_create','guest_cancel','guest_reissue'));

create function booking_private.mail_recipient_hash_v1(contact text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(lower(trim(contact)),'UTF8')),'hex');
$$;

-- Compare the exact contact shown to the operator. Unicode case normalization
-- stays authoritative in PostgreSQL for the separate recipient binding below.
create function booking_private.mail_contact_fingerprint_v1(contact text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(contact,'UTF8')),'hex');
$$;

-- Shared canonical authorization for user JWTs and a verified server-side actor.
-- Only the service-only gateway may supply another actor; clients retain auth.uid().
create function booking_private.assert_console_actor_v1(p_spot uuid,p_actor uuid,p_scope text) returns void
language plpgsql security definer set search_path='' as $$ declare r text; o uuid; u uuid; begin
 if p_scope is null or p_scope not in ('read','write','manage','team') or p_actor is null then raise exception 'booking_operator_required' using errcode='42501'; end if;
 if p_scope='read' then perform 1 from public.booking_restaurant_settings where spot_id=p_spot for share;
 else perform 1 from public.booking_restaurant_settings where spot_id=p_spot for update; end if;
 select s.owner_id,case when s.owner_id=p_actor then 'owner' else m.role end into o,r
 from public.spots s left join public.booking_team_members m on m.spot_id=s.id and m.user_id=p_actor and m.owner_id=s.owner_id and m.revoked_at is null where s.id=p_spot;
 if r is null or (p_scope='write' and r not in ('owner','manager','host')) or (p_scope='manage' and r not in ('owner','manager')) or (p_scope='team' and r<>'owner') then raise exception 'booking_operator_required' using errcode='42501'; end if;
 for u in select distinct x from unnest(array[o,p_actor]) x where x is not null order by x loop
  perform public.safety_assert_user_can_perform_v2(u,'can_edit_owner_content');
 end loop;
end $$;
create or replace function booking_private.assert_console_access_v1(p_spot uuid,p_scope text) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_console_actor_v1(p_spot,auth.uid(),p_scope);
end $$;
revoke all on function booking_private.mail_recipient_hash_v1(text),booking_private.mail_contact_fingerprint_v1(text),booking_private.assert_console_actor_v1(uuid,uuid,text) from public,anon,authenticated;

create or replace function booking_private.guard_mail_payload_v1() returns trigger language plpgsql set search_path='' as $$ begin
 if (old.payload_sealed is not null and (new.payload_sealed,new.payload_digest,new.payload_context,new.payload_prepared_at) is distinct from (old.payload_sealed,old.payload_digest,old.payload_context,old.payload_prepared_at))
  or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
  or (old.recipient_hash is not null and new.recipient_hash is distinct from old.recipient_hash)
  or (old.provider_id is not null and new.provider_id is distinct from old.provider_id) then
  raise exception 'booking_mail_payload_frozen' using errcode='23514';
 end if;
 return new;
end $$;

create or replace function public.booking_mail_prepare_v1(p_id uuid,p_lease_id uuid,p_context text,p_payload text,p_digest text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; snap jsonb; begin
 if p_context is null or p_context !~ '^[0-9a-f]{64}$' or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_payload is null or length(p_payload) not between 40 and 65536 or p_payload !~ '^[A-Za-z0-9_.-]+$' then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=(select spot_id from booking_private.guest_mail_outbox_v1 where id=p_id) for update;
 select * into o from booking_private.guest_mail_outbox_v1 where id=p_id for update;
 if not found or o.state<>'leased' or o.lease_id is distinct from p_lease_id or o.lease_until<=clock_timestamp() or o.superseded_at is not null then return false; end if;
 snap:=booking_private.mail_snapshot_v1(o.reservation_id);
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
 snap:=booking_private.mail_snapshot_v1(o.reservation_id);
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

create or replace function public.booking_mail_event_v1(p_event_id text,p_id uuid,p_provider_id text,p_kind text,p_occurred_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; previous booking_private.guest_mail_events_v1%rowtype; target text; begin
 if p_event_id is null or length(p_event_id) not between 1 and 200 or p_event_id !~ '^[A-Za-z0-9_.-]+$' or p_provider_id is null or length(p_provider_id) not between 1 and 128 or p_provider_id !~ '^[A-Za-z0-9_.-]+$' or p_kind is null or p_kind not in ('accepted','delayed','delivered','bounced','complained','failed','suppressed') or p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>clock_timestamp()+interval '5 minutes' then raise exception 'invalid_booking_mail_event' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=(select spot_id from booking_private.guest_mail_outbox_v1 where id=p_id) for update;
 select * into o from booking_private.guest_mail_outbox_v1 where id=p_id for update;
 if not found or o.first_attempt_at is null or (o.provider_id is not null and o.provider_id<>p_provider_id) then return false; end if;
 select * into previous from booking_private.guest_mail_events_v1 where event_id=p_event_id;
 if found then
  if (previous.outbox_id,previous.provider_id,previous.event_kind,previous.occurred_at) is distinct from (p_id,p_provider_id,p_kind,p_occurred_at) then raise exception 'booking_mail_event_reused' using errcode='22023'; end if;
  return true;
 end if;
 insert into booking_private.guest_mail_events_v1(event_id,outbox_id,provider_id,event_kind,occurred_at) values(p_event_id,p_id,p_provider_id,p_kind,p_occurred_at);
 target:=case when p_kind='delayed' then 'accepted' else p_kind end;
 update booking_private.guest_mail_outbox_v1 set provider_id=coalesce(provider_id,p_provider_id),lease_id=null,lease_until=null,state=case when booking_private.mail_state_rank_v1(target)>booking_private.mail_state_rank_v1(state) then target else state end,updated_at=clock_timestamp() where id=o.id;
 if p_kind in ('bounced','complained','suppressed') and (o.recipient_hash is null or o.recipient_hash=booking_private.mail_recipient_hash_v1((select guest_contact from public.booking_reservations where id=o.reservation_id))) then
  update booking_private.guest_access_v1 set delivery_blocked_at=coalesce(delivery_blocked_at,clock_timestamp()),delivery_blocked_recipient_hash=o.recipient_hash where reservation_id=o.reservation_id;
  update booking_private.guest_mail_outbox_v1 set superseded_at=coalesce(superseded_at,clock_timestamp()),state=case when state in ('pending','leased') then case when first_attempt_at is null then 'suppressed' else 'review_required' end else state end,updated_at=clock_timestamp() where reservation_id=o.reservation_id and state in ('pending','leased','sending');
 end if;
 return true;
end $$;


-- Stable human intent, independent of randomized capability/ciphertext generation.
create function booking_private.reissue_fingerprint_v1(p_actor uuid,p_reservation uuid,p_revision bigint,p_contact_hash text) returns text
language sql immutable set search_path='' as $$
 select booking_private.request_fingerprint_v2(jsonb_build_object('kind','guest_reissue','actor_id',p_actor,'reservation_id',p_reservation,'revision',p_revision,'contact_hash',p_contact_hash));
$$;
create function public.booking_mail_reissue_recover_v1(p_actor uuid,p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,p_contact_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare previous booking_private.reservation_requests_v2%rowtype; current_revision bigint; begin
 perform booking_private.assert_console_actor_v1(p_spot_id,p_actor,'write');
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'booking_operator_required' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_contact_hash is null or p_contact_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 select revision into current_revision from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  if previous.request_kind<>'guest_reissue' or previous.fingerprint<>booking_private.reissue_fingerprint_v1(p_actor,p_reservation_id,p_expected_revision,p_contact_hash) then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return previous.outcome;
 end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and (request_id=p_request_id or last_amend_request_id=p_request_id)) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 -- Under the same root lock, a later monotonic revision plus no committed
 -- registry entry proves this exact old intent can never commit in the future.
 if current_revision>p_expected_revision then return jsonb_build_object('not_committed',true,'id',p_reservation_id,'revision',current_revision); end if;
 return null;
end $$;

create function booking_private.reissue_context_v1(p_actor uuid,p_spot_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_contact_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; a booking_private.guest_access_v1%rowtype; begin
 perform booking_private.assert_console_actor_v1(p_spot_id,p_actor,'write');
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'booking_operator_required' using errcode='42501'; end if;
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if r.revision is distinct from p_expected_revision or booking_private.mail_contact_fingerprint_v1(r.guest_contact) is distinct from p_contact_hash then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 select * into a from booking_private.guest_access_v1 where reservation_id=r.id;
 if not exists(select 1 from public.spots s join auth.users u on u.id=s.owner_id and u.email_confirmed_at is not null where s.id=p_spot_id) then raise exception 'booking_mail_reissue_unavailable' using errcode='22023'; end if;
 if r.source<>'website' or r.status not in ('pending','confirmed') or r.starts_at<=clock_timestamp() or a.reservation_id is null or a.expires_at<=clock_timestamp() or r.guest_contact is null or length(r.guest_contact)>254 or r.guest_contact ~ '[[:cntrl:]]' or r.guest_contact !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' then raise exception 'booking_mail_reissue_unavailable' using errcode='22023'; end if;
 if a.delivery_blocked_at is not null and (a.delivery_blocked_recipient_hash is null or a.delivery_blocked_recipient_hash=booking_private.mail_recipient_hash_v1(r.guest_contact)) then raise exception 'booking_mail_recipient_blocked' using errcode='22023'; end if;
 -- A legacy attempted message without a verified recipient binding cannot safely
 -- be reassigned to a corrected contact. It needs explicit operational review.
 if exists(select 1 from booking_private.guest_mail_outbox_v1 where reservation_id=r.id and first_attempt_at is not null and recipient_hash is null) then raise exception 'booking_mail_legacy_review_required' using errcode='22023'; end if;
 if (select count(*) from booking_private.reservation_requests_v2 where reservation_id=r.id and request_kind='guest_reissue' and created_at>clock_timestamp()-interval '24 hours')>=3 or
  (select count(*) from public.booking_audit_events where spot_id=p_spot_id and actor_id=p_actor and action='guest_link_reissued' and created_at>clock_timestamp()-interval '24 hours')>=50 then raise exception 'booking_mail_reissue_rate_limited' using errcode='22023'; end if;
 return jsonb_build_object('reservation_id',r.id,'creation_request_id',r.request_id,'revision',r.revision,'email',r.guest_contact);
end $$;
create function public.booking_mail_reissue_context_v1(p_actor uuid,p_spot_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_contact_hash text) returns jsonb
language sql security definer set search_path='' as $$
 select booking_private.reissue_context_v1(p_actor,p_spot_id,p_reservation_id,p_expected_revision,p_contact_hash);
$$;

create function public.booking_mail_reissue_v1(p_actor uuid,p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,p_contact_hash text,p_key_hash text,p_sealed_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous jsonb; r public.booking_reservations%rowtype; changed public.booking_reservations%rowtype; message_id uuid; result jsonb; actor_role text; begin
 previous:=public.booking_mail_reissue_recover_v1(p_actor,p_spot_id,p_reservation_id,p_request_id,p_expected_revision,p_contact_hash);
 if previous is not null then return previous; end if;
 if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or p_sealed_key is null or length(p_sealed_key) not between 40 and 2048 or p_sealed_key !~ '^[A-Za-z0-9_.-]+$' then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 perform booking_private.reissue_context_v1(p_actor,p_spot_id,p_reservation_id,p_expected_revision,p_contact_hash);
 select * into r from public.booking_reservations where id=p_reservation_id;
 if exists(select 1 from booking_private.guest_access_v1 where reservation_id=r.id and key_hash=p_key_hash) then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 update booking_private.guest_mail_outbox_v1 set superseded_at=coalesce(superseded_at,clock_timestamp()),
  state=case when state in ('pending','leased') then case when first_attempt_at is null then 'suppressed' else 'review_required' end else state end,updated_at=clock_timestamp()
  where reservation_id=r.id and state in ('pending','leased','sending');
 update booking_private.guest_access_v1 set key_hash=p_key_hash,sealed_key=p_sealed_key,revoked_at=null,delivery_blocked_at=null,delivery_blocked_recipient_hash=null where reservation_id=r.id;
 -- Preserve policy revision, cancellation deadline/minutes and expiry exactly.
 update public.booking_reservations set revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into changed;
 insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind,recipient_hash) values(r.spot_id,r.id,changed.revision,'changed',booking_private.mail_recipient_hash_v1(r.guest_contact)) returning id into message_id;
 select case when owner_id=p_actor then 'owner' else (select role from public.booking_team_members where spot_id=p_spot_id and user_id=p_actor and revoked_at is null) end into actor_role from public.spots where id=p_spot_id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,details) values(r.spot_id,r.id,p_actor,'guest_link_reissued',jsonb_set(booking_private.reservation_audit_v1(r,changed),'{actor_role}',to_jsonb(actor_role)));
 result:=jsonb_build_object('id',r.id,'revision',changed.revision,'message_id',message_id,'queued_at',clock_timestamp());
 insert into booking_private.reservation_requests_v2(spot_id,request_id,reservation_id,request_kind,fingerprint,outcome) values(r.spot_id,p_request_id,r.id,'guest_reissue',booking_private.reissue_fingerprint_v1(p_actor,r.id,p_expected_revision,p_contact_hash),result);
 return result;
end $$;
revoke all on function booking_private.reissue_fingerprint_v1(uuid,uuid,bigint,text),booking_private.reissue_context_v1(uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.booking_mail_reissue_recover_v1(uuid,uuid,uuid,uuid,bigint,text),public.booking_mail_reissue_context_v1(uuid,uuid,uuid,bigint,text),public.booking_mail_reissue_v1(uuid,uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.booking_mail_reissue_recover_v1(uuid,uuid,uuid,uuid,bigint,text),public.booking_mail_reissue_context_v1(uuid,uuid,uuid,bigint,text),public.booking_mail_reissue_v1(uuid,uuid,uuid,uuid,bigint,text,text,text) to service_role;
create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true,'reservation_history',true,'special_hours',true,'table_combinations',true,'seated_transfers',true,'guest_mail',true,'guest_link_reissue',true),
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
