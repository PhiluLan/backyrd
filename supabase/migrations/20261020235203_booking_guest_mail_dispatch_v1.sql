begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Writers acquire the restaurant root before reservation/outbox rows. Keep that
-- order for both migration and every dispatch operation.
lock table public.booking_restaurant_settings in exclusive mode;
lock table booking_private.guest_mail_outbox_v1 in share row exclusive mode;
do $$ begin
 if (select count(*) from (select 1 from booking_private.guest_mail_outbox_v1 limit 5001) bounded)>5000 then
  raise exception 'booking_mail_migration_requires_bounded_rollout';
 end if;
end $$;
alter table booking_private.guest_access_v1 add column delivery_blocked_at timestamptz;
alter table booking_private.guest_mail_outbox_v1
 add column payload_sealed text,
 add column payload_digest text,
 add column payload_context text,
 add column payload_prepared_at timestamptz,
 add column superseded_at timestamptz,
 add column last_error_code text,
 drop constraint guest_mail_outbox_v1_state_check,
 add constraint guest_mail_outbox_v1_state_check check(state in ('pending','leased','sending','accepted','delivered','bounced','complained','failed','suppressed','review_required')),
 add constraint booking_mail_payload_shape check (
  (payload_sealed is null and payload_digest is null and payload_context is null and payload_prepared_at is null) or
  (payload_sealed is not null and payload_prepared_at is not null and payload_digest is not null and payload_context is not null and length(payload_sealed) between 40 and 65536 and payload_sealed ~ '^[A-Za-z0-9_.-]+$' and payload_digest ~ '^[0-9a-f]{64}$' and payload_context ~ '^[0-9a-f]{64}$')),
 add constraint booking_mail_attempt_payload check(first_attempt_at is null or payload_sealed is not null),
 add constraint booking_mail_live_lease check(state not in ('leased','sending') or (lease_id is not null and lease_until is not null)),
 add constraint booking_mail_dispatch_attempt check(state not in ('sending','accepted','delivered','bounced','complained') or first_attempt_at is not null);
create unique index booking_mail_provider_id on booking_private.guest_mail_outbox_v1(provider_id) where provider_id is not null;
create unique index booking_mail_lease_id on booking_private.guest_mail_outbox_v1(lease_id) where lease_id is not null;
create index booking_mail_dispatch_due on booking_private.guest_mail_outbox_v1(next_attempt_at,id) where state in ('pending','leased','sending');
create table booking_private.guest_mail_events_v1 (
 event_id text primary key check(length(event_id) between 1 and 200 and event_id ~ '^[A-Za-z0-9_.-]+$'),
 outbox_id uuid not null references booking_private.guest_mail_outbox_v1(id),
 provider_id text not null check(length(provider_id) between 1 and 128 and provider_id ~ '^[A-Za-z0-9_.-]+$'),
 event_kind text not null check(event_kind in ('accepted','delayed','delivered','bounced','complained','failed')),
 occurred_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp()
);
alter table booking_private.guest_mail_events_v1 enable row level security;
revoke all on booking_private.guest_mail_events_v1 from public,anon,authenticated;
grant all on booking_private.guest_mail_events_v1 to service_role;

create function booking_private.guard_mail_payload_v1() returns trigger language plpgsql set search_path='' as $$ begin
 if (old.payload_sealed is not null and (new.payload_sealed,new.payload_digest,new.payload_context,new.payload_prepared_at) is distinct from (old.payload_sealed,old.payload_digest,old.payload_context,old.payload_prepared_at))
  or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
  or (old.provider_id is not null and new.provider_id is distinct from old.provider_id) then
  raise exception 'booking_mail_payload_frozen' using errcode='23514';
 end if;
 return new;
end $$;
create trigger booking_mail_payload_guard before update on booking_private.guest_mail_outbox_v1 for each row execute function booking_private.guard_mail_payload_v1();

-- Exclude metadata-only revisions: an internal note or physical move must not
-- invalidate the original confirmation. Only fields actually used by the email
-- (including contact and capability binding) participate in the context hash.
create function booking_private.mail_snapshot_v1(p_reservation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; a booking_private.guest_access_v1%rowtype; owner uuid; restaurant text; begin
 select * into r from public.booking_reservations where id=p_reservation;
 select * into a from booking_private.guest_access_v1 where reservation_id=p_reservation;
 if r.id is null or a.reservation_id is null or r.source<>'website' or a.revoked_at is not null or a.delivery_blocked_at is not null or a.expires_at<=clock_timestamp() then return null; end if;
 select owner_id,name into owner,restaurant from public.spots where id=r.spot_id;
 if owner is null or not exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then return null; end if;
 begin perform public.safety_assert_user_can_perform_v2(owner,'can_edit_owner_content');
 exception when raise_exception then if sqlerrm like 'SAFETY_%' then return null; else raise; end if; end;
 return jsonb_build_object('spot_id',r.spot_id,'reservation_id',r.id,'creation_request_id',r.request_id,
  'restaurant_name',restaurant,'guest_name',r.guest_name,'email',r.guest_contact,'party_size',r.party_size,
  'starts_at',to_char(r.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'ends_at',to_char(r.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'status',case when r.status in ('arrived','seated','completed','no_show') then 'confirmed' else r.status end,
  'cancellation_deadline',to_char(a.cancellation_deadline at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'key_hash',a.key_hash,'sealed_key',a.sealed_key);
end $$;
create function booking_private.mail_claim_json_v1(o booking_private.guest_mail_outbox_v1,snapshot jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',o.id,'spot_id',o.spot_id,'reservation_id',o.reservation_id,
  'reservation_revision',o.reservation_revision,'event_kind',o.event_kind,'lease_id',o.lease_id,'lease_until',o.lease_until,
  'payload_sealed',o.payload_sealed,'payload_digest',o.payload_digest,'payload_context',o.payload_context,
  'context_hash',booking_private.request_fingerprint_v2(snapshot),'first_attempt_at',o.first_attempt_at,'attempts',o.attempts,'snapshot',snapshot);
$$;
create function public.booking_mail_claim_v1(p_lease_id uuid) returns jsonb
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
  snap:=booking_private.mail_snapshot_v1(o.reservation_id);
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

create function public.booking_mail_prepare_v1(p_id uuid,p_lease_id uuid,p_context text,p_payload text,p_digest text) returns boolean
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
 update booking_private.guest_mail_outbox_v1 set payload_sealed=p_payload,payload_digest=p_digest,payload_context=p_context,payload_prepared_at=clock_timestamp(),updated_at=clock_timestamp() where id=o.id;
 return true;
end $$;

-- This is the irreversible dispatch boundary. A later contact correction cannot
-- recall an in-flight provider request, but forbids every subsequent retry.
create function public.booking_mail_begin_v1(p_id uuid,p_lease_id uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; snap jsonb; observed timestamptz; begin
 perform 1 from public.booking_restaurant_settings where spot_id=(select spot_id from booking_private.guest_mail_outbox_v1 where id=p_id) for update;
 select * into o from booking_private.guest_mail_outbox_v1 where id=p_id for update;
 observed:=clock_timestamp();
 if not found or o.state not in ('leased','sending') or o.lease_id is distinct from p_lease_id or o.lease_until<=observed or o.superseded_at is not null or o.payload_sealed is null or p_digest is distinct from o.payload_digest then return null; end if;
 if o.first_attempt_at is not null and o.first_attempt_at<=observed-interval '23 hours' then return null; end if;
 snap:=booking_private.mail_snapshot_v1(o.reservation_id);
 if snap is null or booking_private.request_fingerprint_v2(snap)<>o.payload_context then return null; end if;
 if o.state='leased' then
  if o.attempts>=8 then return null; end if;
  update booking_private.guest_mail_outbox_v1 set state='sending',first_attempt_at=coalesce(first_attempt_at,observed),attempts=attempts+1,lease_until=observed+interval '90 seconds',updated_at=observed where id=o.id returning * into o;
 end if;
 return jsonb_build_object('id',o.id,'lease_id',o.lease_id,'payload_sealed',o.payload_sealed,'payload_digest',o.payload_digest,'idempotency_key','backyrd-booking/'||o.id,'retry_until',o.first_attempt_at+interval '23 hours');
end $$;

create function public.booking_mail_finish_v1(p_id uuid,p_lease_id uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; observed timestamptz; next_state text; begin
 if p_outcome is null or p_outcome not in ('accepted','retry','rejected','review') or
  (p_outcome='accepted' and (p_provider_id is null or length(p_provider_id) not between 1 and 128 or p_provider_id !~ '^[A-Za-z0-9_.-]+$')) or (p_outcome<>'accepted' and p_provider_id is not null) then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=(select spot_id from booking_private.guest_mail_outbox_v1 where id=p_id) for update;
 select * into o from booking_private.guest_mail_outbox_v1 where id=p_id for update;
 observed:=clock_timestamp();
 if not found or o.state<>'sending' or o.lease_id is distinct from p_lease_id then return false; end if;
 next_state:=case when p_outcome='accepted' then 'accepted' when p_outcome='rejected' then 'failed'
  when p_outcome='review' or o.superseded_at is not null or o.attempts>=8 or o.first_attempt_at<=observed-interval '23 hours' then 'review_required' else 'pending' end;
 update booking_private.guest_mail_outbox_v1 set state=next_state,provider_id=coalesce(p_provider_id,provider_id),lease_id=null,lease_until=null,
  last_error_code=case when p_outcome='accepted' then null when p_outcome='rejected' then 'provider_rejected' when next_state='pending' then 'provider_unconfirmed' else 'manual_review_required' end,
  next_attempt_at=case when next_state='pending' then observed+make_interval(secs=>least(3600,30*power(2,least(o.attempts-1,7)))::integer) else next_attempt_at end,updated_at=observed where id=o.id;
 return true;
end $$;

create function booking_private.mail_state_rank_v1(p_state text) returns integer language sql immutable set search_path='' as $$
 select case p_state when 'complained' then 5 when 'bounced' then 4 when 'delivered' then 3 when 'failed' then 2 when 'accepted' then 1 else 0 end;
$$;
-- Service-only ingestion: the HTTP callback must verify the raw-body provider
-- signature and extract this small DTO first. No provider payload/contact is stored.
create function public.booking_mail_event_v1(p_event_id text,p_id uuid,p_provider_id text,p_kind text,p_occurred_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; previous booking_private.guest_mail_events_v1%rowtype; target text; begin
 if p_event_id is null or length(p_event_id) not between 1 and 200 or p_event_id !~ '^[A-Za-z0-9_.-]+$' or p_provider_id is null or length(p_provider_id) not between 1 and 128 or p_provider_id !~ '^[A-Za-z0-9_.-]+$' or p_kind is null or p_kind not in ('accepted','delayed','delivered','bounced','complained','failed') or p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>clock_timestamp()+interval '5 minutes' then raise exception 'invalid_booking_mail_event' using errcode='22023'; end if;
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
 if p_kind in ('bounced','complained') then
  update booking_private.guest_access_v1 set delivery_blocked_at=coalesce(delivery_blocked_at,clock_timestamp()) where reservation_id=o.reservation_id;
  update booking_private.guest_mail_outbox_v1 set superseded_at=coalesce(superseded_at,clock_timestamp()),state=case when state in ('pending','leased') then case when first_attempt_at is null then 'suppressed' else 'review_required' end else state end,updated_at=clock_timestamp() where reservation_id=o.reservation_id and state in ('pending','leased','sending');
 end if;
 return true;
end $$;

create or replace function booking_private.sync_guest_access_v1() returns trigger
language plpgsql security definer set search_path='' as $$ begin
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

revoke all on function booking_private.guard_mail_payload_v1(),booking_private.mail_snapshot_v1(uuid),booking_private.mail_claim_json_v1(booking_private.guest_mail_outbox_v1,jsonb),booking_private.mail_state_rank_v1(text) from public,anon,authenticated;
revoke all on function public.booking_mail_claim_v1(uuid),public.booking_mail_prepare_v1(uuid,uuid,text,text,text),public.booking_mail_begin_v1(uuid,uuid,text),public.booking_mail_finish_v1(uuid,uuid,text,text),public.booking_mail_event_v1(text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.booking_mail_claim_v1(uuid),public.booking_mail_prepare_v1(uuid,uuid,text,text,text),public.booking_mail_begin_v1(uuid,uuid,text),public.booking_mail_finish_v1(uuid,uuid,text,text),public.booking_mail_event_v1(text,uuid,text,text,timestamptz) to service_role;
commit;
